import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
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

    let categoryId = dto.categoryId;
    // API contract uses `category` as slug — support both for flexibility.
    const slug = (dto as SearchQueryDto & { category?: string }).category;
    if (!categoryId && slug) {
      const cat = await this.prisma.category.findUnique({ where: { slug } });
      categoryId = cat?.id;
    }

    try {
      const result = await this.search.search({
        q: dto.q,
        categoryId,
        condition: dto.condition,
        brand: dto.brand,
        size: dto.size,
        minPriceAed: dto.minPrice,
        maxPriceAed: dto.maxPrice,
        sort: dto.sort === 'relevance' ? undefined : dto.sort,
        limit,
        offset,
      });

      const data = result.hits.map((h) => ({
        id: h.id,
        title: h.title,
        priceAed: h.priceAed.toFixed(2),
        condition: h.condition,
        mainImageUrl: h.mainImageUrl,
      }));

      const facets: Record<string, Array<{ value: string; count: number }>> = {};
      if (result.facets) {
        for (const [key, dist] of Object.entries(result.facets)) {
          facets[key] = Object.entries(dist).map(([value, count]) => ({
            value,
            count,
          }));
        }
      }

      const nextOffset = offset + data.length;
      return {
        data,
        meta: {
          nextCursor:
            nextOffset < result.estimatedTotal ? encodeOffset(nextOffset) : null,
          resultCount: result.estimatedTotal,
          facets,
        },
      };
    } catch (err) {
      this.logger.warn(`Meilisearch search failed, falling back to Postgres: ${(err as Error).message}`);
      return this.postgresFallback(dto, limit, offset, categoryId);
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
      trendingTags: ['90s Denim', 'Silk Scarves', 'Tailored'],
      sections,
    };

    await this.redis.set(cacheKey, JSON.stringify(payload), 60).catch(() => undefined);
    return payload;
  }

  private async postgresFallback(
    dto: SearchQueryDto,
    limit: number,
    offset: number,
    categoryId?: string,
  ) {
    const rows = await this.prisma.listing.findMany({
      where: {
        status: 'ACTIVE',
        ...(categoryId ? { categoryId } : {}),
        ...(dto.q
          ? {
              OR: [
                { title: { contains: dto.q, mode: 'insensitive' } },
                { brand: { contains: dto.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      orderBy: { publishedAt: 'desc' },
      skip: offset,
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      data: page.map((r) => ({
        id: r.id,
        title: r.title,
        priceAed: r.priceAed?.toString() ?? null,
        condition: r.condition,
        mainImageUrl: r.images[0]?.url ?? null,
      })),
      meta: {
        nextCursor: rows.length > limit ? encodeOffset(offset + limit) : null,
        resultCount: page.length,
        facets: {},
      },
    };
  }
}
