import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ListingCondition, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  decodeOffset,
  encodeOffset,
} from '../../common/pagination/cursor.util';
import { toProductCard } from '../listings/listings.mapper';
import { SearchQueryDto } from './dto/search-query.dto';
import {
  ListingChangedEvent,
  ListingEvents,
} from './search.constants';
import {
  SEARCH_PROVIDER,
  SearchProvider,
} from './search-provider.interface';
import { SearchSyncService } from './search-sync.service';

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sync: SearchSyncService,
    @Inject(SEARCH_PROVIDER) private readonly search: SearchProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.search.ensureIndex();
    } catch (err) {
      this.logger.warn(`Search index ensure failed: ${(err as Error).message}`);
    }
  }

  @OnEvent(ListingEvents.Changed)
  async onChanged(event: ListingChangedEvent): Promise<void> {
    await this.sync.enqueue({ listingId: event.listingId, reason: 'changed' });
  }

  @OnEvent(ListingEvents.Removed)
  async onRemoved(event: ListingChangedEvent): Promise<void> {
    await this.sync.enqueue({ listingId: event.listingId, reason: 'removed' });
  }

  async searchListings(dto: SearchQueryDto) {
    const limit = Math.min(dto.limit ?? 20, 50);
    const offset = decodeOffset(dto.cursor);
    const sort =
      dto.sort === 'relevance' || !dto.sort ? undefined : dto.sort;

    let categoryId = dto.categoryId;
    const slug = dto.category?.trim();
    if (!categoryId && slug) {
      const cat = await this.prisma.category.findUnique({
        where: { slug },
      });
      if (!cat) {
        return {
          data: [],
          meta: {
            nextCursor: null,
            resultCount: 0,
            facets: { brand: [], size: [], condition: [] },
          },
        };
      }
      categoryId = cat.id;
    }

    // Swap min/max if client sent them inverted.
    let minPrice = dto.minPrice;
    let maxPrice = dto.maxPrice;
    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      [minPrice, maxPrice] = [maxPrice, minPrice];
    }

    try {
      const result = await this.search.search({
        q: dto.q?.trim() || undefined,
        categoryId,
        categorySlug: slug,
        condition: dto.condition,
        brand: dto.brand,
        size: dto.size,
        minPriceAed: minPrice,
        maxPriceAed: maxPrice,
        sort,
        limit,
        offset,
      });

      const data = result.hits.map((h) => ({
        id: h.id,
        title: h.title,
        priceAed:
          typeof h.priceAed === 'number'
            ? h.priceAed.toFixed(2)
            : String(h.priceAed ?? '0'),
        condition: h.condition,
        mainImageUrl: h.mainImageUrl,
      }));

      const facets = this.mapFacets(result.facets);

      const nextOffset = offset + data.length;
      return {
        data,
        meta: {
          nextCursor:
            nextOffset < result.estimatedTotal
              ? encodeOffset(nextOffset)
              : null,
          resultCount: result.estimatedTotal,
          facets,
        },
      };
    } catch (err) {
      this.logger.warn(
        `Meilisearch search failed, falling back to Postgres: ${(err as Error).message}`,
      );
      return this.postgresFallback(
        { ...dto, minPrice, maxPrice },
        limit,
        offset,
        categoryId,
        sort,
      );
    }
  }

  /** Composes the home feed from Postgres; Redis-cached ~60s. Soft-auth unused today. */
  async homeFeed() {
    const cacheKey = 'feed:home';
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // rebuild
      }
    }

    const activeCategories = await this.prisma.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: { sortOrder: 'asc' },
      take: 4,
    });

    const sections = [];
    for (const cat of activeCategories) {
      const listings = await this.prisma.listing.findMany({
        where: { status: 'ACTIVE', categoryId: cat.id },
        include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
        orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }],
        take: 8,
      });
      sections.push({
        title: `${cat.name} — Curated Essentials`,
        categorySlug: cat.slug,
        listings: listings.map(toProductCard),
      });
    }

    const rare = await this.prisma.listing.findMany({
      where: { status: 'ACTIVE', isFeatured: true },
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      orderBy: { publishedAt: 'desc' },
      take: 8,
    });
    sections.push({
      title: 'Rare Finds',
      listings: rare.map(toProductCard),
    });

    const payload = {
      trendingTags: ['Leather', 'Silk', 'Blazer', 'Loafers', 'Burberry'],
      sections,
    };

    await this.redis
      .set(cacheKey, JSON.stringify(payload), 60)
      .catch(() => undefined);
    return payload;
  }

  private mapFacets(
    raw?: Record<string, Record<string, number>>,
  ): Record<string, Array<{ value: string; count: number }>> {
    const facets: Record<string, Array<{ value: string; count: number }>> = {
      brand: [],
      size: [],
      condition: [],
    };
    if (!raw) return facets;
    for (const key of ['brand', 'size', 'condition'] as const) {
      const dist = raw[key];
      if (!dist) continue;
      facets[key] = Object.entries(dist)
        .filter(([value]) => value !== '')
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    }
    return facets;
  }

  private async postgresFallback(
    dto: SearchQueryDto,
    limit: number,
    offset: number,
    categoryId: string | undefined,
    sort: 'newest' | 'price_asc' | 'price_desc' | undefined,
  ) {
    const where: Prisma.ListingWhereInput = {
      status: 'ACTIVE',
      ...(categoryId ? { categoryId } : {}),
      ...(dto.condition?.length
        ? {
            condition: {
              in: dto.condition.filter((c): c is ListingCondition =>
                (
                  [
                    'NEW_WITH_TAGS',
                    'NEW_WITHOUT_TAGS',
                    'VERY_GOOD',
                    'GOOD',
                    'SATISFACTORY',
                  ] as string[]
                ).includes(c),
              ),
            },
          }
        : {}),
      ...(dto.brand?.length
        ? {
            OR: dto.brand.map((b) => ({
              brand: { equals: b, mode: 'insensitive' as const },
            })),
          }
        : {}),
      ...(dto.size?.length
        ? {
            OR: dto.size.map((s) => ({
              size: { equals: s, mode: 'insensitive' as const },
            })),
          }
        : {}),
      ...(dto.minPrice !== undefined || dto.maxPrice !== undefined
        ? {
            priceAed: {
              ...(dto.minPrice !== undefined
                ? { gte: dto.minPrice }
                : {}),
              ...(dto.maxPrice !== undefined
                ? { lte: dto.maxPrice }
                : {}),
            },
          }
        : {}),
      ...(dto.q?.trim()
        ? {
            OR: [
              {
                title: {
                  contains: dto.q.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                brand: {
                  contains: dto.q.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                description: {
                  contains: dto.q.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.ListingOrderByWithRelationInput[] =
      sort === 'price_asc'
        ? [{ priceAed: 'asc' }, { publishedAt: 'desc' }]
        : sort === 'price_desc'
          ? [{ priceAed: 'desc' }, { publishedAt: 'desc' }]
          : [{ isFeatured: 'desc' }, { publishedAt: 'desc' }];

    const [rows, resultCount, brandGroups, sizeGroups, conditionGroups] =
      await Promise.all([
        this.prisma.listing.findMany({
          where,
          include: {
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
          orderBy,
          skip: offset,
          take: limit + 1,
        }),
        this.prisma.listing.count({ where }),
        this.prisma.listing.groupBy({
          by: ['brand'],
          where: { ...where, brand: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { brand: 'desc' } },
          take: 40,
        }),
        this.prisma.listing.groupBy({
          by: ['size'],
          where: { ...where, size: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { size: 'desc' } },
          take: 40,
        }),
        this.prisma.listing.groupBy({
          by: ['condition'],
          where: { ...where, condition: { not: null } },
          _count: { _all: true },
        }),
      ]);

    const page = rows.slice(0, limit);
    const facets = {
      brand: brandGroups
        .filter((g) => g.brand)
        .map((g) => ({ value: g.brand as string, count: g._count._all })),
      size: sizeGroups
        .filter((g) => g.size)
        .map((g) => ({ value: g.size as string, count: g._count._all })),
      condition: conditionGroups
        .filter((g) => g.condition)
        .map((g) => ({
          value: g.condition as string,
          count: g._count._all,
        }))
        .sort((a, b) => b.count - a.count),
    };

    return {
      data: page.map((r) => ({
        id: r.id,
        title: r.title,
        priceAed: r.priceAed?.toString() ?? null,
        condition: r.condition,
        mainImageUrl: r.images[0]?.url ?? null,
      })),
      meta: {
        nextCursor:
          rows.length > limit ? encodeOffset(offset + limit) : null,
        resultCount,
        facets,
      },
    };
  }
}
