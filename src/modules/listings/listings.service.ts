import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ListingStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  decodeKeyset,
  encodeKeyset,
  decodeOffset,
  encodeOffset,
} from '../../common/pagination/cursor.util';
import {
  ListingEvents,
} from '../search/search.constants';
import {
  ConfirmPhotosDto,
  CreateListingDto,
  PublishListingDto,
  ReportListingDto,
  UpdateListingDto,
} from './dto/listings.dto';
import {
  ListingCannotReportOwnException,
  ListingForbiddenException,
  ListingHasOpenOrderException,
  ListingInvalidImageUrlException,
  ListingInvalidPriceException,
  ListingMissingCategoryException,
  ListingMissingPhotosException,
  ListingNotEditableException,
  ListingNotFoundException,
  ListingNotRelistableException,
  ListingNotReportableException,
  ListingNotUnpublishableException,
  ListingTooManyPhotosException,
} from './listings.errors';
import { decimalToString, toProductCard } from './listings.mapper';
import {
  IMAGE_STORAGE,
  ImageStorageProvider,
} from './storage/image-storage.interface';

const MAX_PHOTOS = 5;
const OPEN_ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID_HELD',
  'SHIPPED',
  'DELIVERED',
  'DISPUTED',
] as const;

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
    @Inject(IMAGE_STORAGE) private readonly images: ImageStorageProvider,
  ) {}

  async createDraft(sellerId: string, dto: CreateListingDto) {
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, isActive: true },
    });
    if (!category) throw new ListingMissingCategoryException();

    const listing = await this.prisma.listing.create({
      data: {
        sellerId,
        categoryId: dto.categoryId,
        status: ListingStatus.DRAFT,
      },
    });
    return { id: listing.id, status: listing.status };
  }

  async createUploadUrl(sellerId: string, listingId: string) {
    // Cap is enforced on confirmPhotos (replace semantics).
    const listing = await this.requireOwned(sellerId, listingId);

    const publicId = `${listing.id}-${Date.now()}`;
    const signed = this.images.createSignedUpload(
      `listings/${listing.id}`,
      publicId,
    );
    return {
      uploadUrl: signed.uploadUrl,
      signature: signed.signature,
      timestamp: signed.timestamp,
      apiKey: signed.apiKey,
      cloudName: signed.cloudName,
      folder: signed.folder,
      publicId: signed.publicId,
    };
  }

  async confirmPhotos(sellerId: string, listingId: string, dto: ConfirmPhotosDto) {
    await this.requireOwned(sellerId, listingId);
    // Replace semantics: the posted set becomes the full photo list (max 5).
    if (dto.images.length > MAX_PHOTOS) {
      throw new ListingTooManyPhotosException();
    }

    // Delivered URLs look like:
    // https://res.cloudinary.com/<cloud>/image/upload/v…/repose/listings/<id>/<publicId>.ext
    const folderHint = `listings/${listingId}`;
    for (const img of dto.images) {
      if (!this.images.isValidUrl(img.url, folderHint)) {
        throw new ListingInvalidImageUrlException();
      }
    }

    await this.prisma.listingImage.deleteMany({ where: { listingId } });
    const created = await this.prisma.$transaction(
      dto.images.map((img) =>
        this.prisma.listingImage.create({
          data: { listingId, url: img.url, sortOrder: img.sortOrder },
        }),
      ),
    );

    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (listing?.status === ListingStatus.ACTIVE) {
      this.events.emit(ListingEvents.Changed, { listingId });
    }

    return {
      images: created
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({ id: i.id, url: i.url, sortOrder: i.sortOrder })),
    };
  }

  async update(sellerId: string, listingId: string, dto: UpdateListingDto) {
    const existing = await this.requireOwned(sellerId, listingId);
    if (
      existing.status !== ListingStatus.DRAFT &&
      existing.status !== ListingStatus.ACTIVE
    ) {
      throw new ListingNotEditableException();
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, isActive: true },
      });
      if (!category) throw new ListingMissingCategoryException();
    }

    let priceAed: Decimal | undefined;
    if (dto.priceAed !== undefined) {
      priceAed = new Decimal(dto.priceAed);
      if (priceAed.lte(0)) throw new ListingInvalidPriceException();
    }

    const listing = await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        title: dto.title,
        brand: dto.brand,
        size: dto.size,
        description: dto.description,
        categoryId: dto.categoryId,
        ...(dto.condition !== undefined ? { condition: dto.condition } : {}),
        ...(priceAed !== undefined ? { priceAed } : {}),
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        category: true,
        seller: true,
      },
    });

    if (listing.status === ListingStatus.ACTIVE) {
      this.events.emit(ListingEvents.Changed, { listingId });
    }

    return this.serializeDetail(listing, false);
  }

  async unpublish(sellerId: string, listingId: string) {
    const listing = await this.requireOwned(sellerId, listingId);
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new ListingNotUnpublishableException();
    }

    const open = await this.prisma.orderItem.findFirst({
      where: {
        listingId,
        order: { status: { in: [...OPEN_ORDER_STATUSES] } },
      },
    });
    if (open) throw new ListingHasOpenOrderException();

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: ListingStatus.DRAFT },
    });
    this.events.emit(ListingEvents.Removed, { listingId });

    return {
      id: updated.id,
      status: updated.status,
    };
  }

  /**
   * Duplicate a SOLD or REMOVED listing into a fresh DRAFT (photos + details).
   * Does not mutate the original sold record.
   */
  async relist(sellerId: string, listingId: string) {
    const source = await this.requireOwned(sellerId, listingId);
    if (
      source.status !== ListingStatus.SOLD &&
      source.status !== ListingStatus.REMOVED
    ) {
      throw new ListingNotRelistableException();
    }

    const images = await this.prisma.listingImage.findMany({
      where: { listingId },
      orderBy: { sortOrder: 'asc' },
    });

    const draft = await this.prisma.$transaction(async (tx) => {
      const created = await tx.listing.create({
        data: {
          sellerId,
          categoryId: source.categoryId,
          title: source.title,
          description: source.description,
          brand: source.brand,
          size: source.size,
          condition: source.condition,
          priceAed: source.priceAed,
          attributes: source.attributes ?? undefined,
          status: ListingStatus.DRAFT,
        },
      });
      if (images.length) {
        await tx.listingImage.createMany({
          data: images.map((img) => ({
            listingId: created.id,
            url: img.url,
            sortOrder: img.sortOrder,
          })),
        });
      }
      return created;
    });

    return { id: draft.id, status: draft.status };
  }

  async publish(sellerId: string, listingId: string, dto: PublishListingDto) {
    const listing = await this.requireOwned(sellerId, listingId);
    const images = await this.prisma.listingImage.count({ where: { listingId } });
    if (images < 1) throw new ListingMissingPhotosException();
    if (!listing.categoryId) throw new ListingMissingCategoryException();

    const price = new Decimal(dto.priceAed);
    if (price.lte(0)) throw new ListingInvalidPriceException();

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        condition: dto.condition,
        priceAed: price,
        status: ListingStatus.ACTIVE,
        publishedAt: new Date(),
      },
    });

    this.events.emit(ListingEvents.Changed, { listingId });
    return {
      id: updated.id,
      status: updated.status,
      publishedAt: updated.publishedAt?.toISOString() ?? null,
    };
  }

  async getById(listingId: string, viewerId?: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        category: true,
        seller: true,
      },
    });
    if (!listing || listing.status === ListingStatus.REMOVED) {
      throw new ListingNotFoundException();
    }
    // Drafts are only visible to the owner.
    if (
      listing.status === ListingStatus.DRAFT &&
      listing.sellerId !== viewerId
    ) {
      throw new ListingNotFoundException();
    }

    // Don't inflate view counts with the seller viewing their own listing.
    if (viewerId !== listing.sellerId) {
      void this.bufferView(listingId);
    }

    let isSavedByCurrentUser = false;
    if (viewerId) {
      const saved = await this.prisma.savedListing.findUnique({
        where: { userId_listingId: { userId: viewerId, listingId } },
      });
      isSavedByCurrentUser = Boolean(saved);
    }

    return this.serializeDetail(listing, isSavedByCurrentUser);
  }

  async remove(sellerId: string, listingId: string): Promise<void> {
    await this.requireOwned(sellerId, listingId);
    const open = await this.prisma.orderItem.findFirst({
      where: {
        listingId,
        order: { status: { in: [...OPEN_ORDER_STATUSES] } },
      },
    });
    if (open) throw new ListingHasOpenOrderException();

    await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: ListingStatus.REMOVED },
    });
    this.events.emit(ListingEvents.Removed, { listingId });
  }

  async save(userId: string, listingId: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status !== ListingStatus.ACTIVE) {
      throw new ListingNotFoundException();
    }
    await this.prisma.savedListing.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId },
      update: {},
    });
  }

  async unsave(userId: string, listingId: string): Promise<void> {
    await this.prisma.savedListing.deleteMany({
      where: { userId, listingId },
    });
  }

  async listSaved(
    userId: string,
    opts: { cursor?: string; limit?: number },
  ) {
    const limit = Math.min(opts.limit ?? 20, 50);
    const offset = decodeOffset(opts.cursor);
    const rows = await this.prisma.savedListing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit + 1,
      include: {
        listing: {
          include: {
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
      },
    });

    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;

    return {
      data: page.map((row) => toProductCard(row.listing)),
      meta: {
        nextCursor: hasMore ? encodeOffset(offset + limit) : null,
        resultCount: page.length,
      },
    };
  }

  async report(userId: string, listingId: string, dto: ReportListingDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing || listing.status === ListingStatus.REMOVED) {
      throw new ListingNotFoundException();
    }
    if (listing.sellerId === userId) {
      throw new ListingCannotReportOwnException();
    }
    if (
      listing.status !== ListingStatus.ACTIVE &&
      listing.status !== ListingStatus.FLAGGED
    ) {
      throw new ListingNotReportableException();
    }

    const attrs =
      listing.attributes &&
      typeof listing.attributes === 'object' &&
      !Array.isArray(listing.attributes)
        ? { ...(listing.attributes as Record<string, unknown>) }
        : {};

    attrs.flagReason = dto.reason;
    attrs.flaggedAt = new Date().toISOString();
    attrs.flaggedBy = userId;

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        status: ListingStatus.FLAGGED,
        attributes: attrs as Prisma.InputJsonValue,
      },
    });

    this.events.emit(ListingEvents.Removed, { listingId });

    return {
      id: updated.id,
      status: updated.status,
      flagReason: dto.reason,
    };
  }

  async listBySeller(
    sellerId: string,
    opts: { status?: string; cursor?: string; limit?: number },
  ) {
    // Public closet: only ACTIVE listings — drafts and sold must never leak.
    return this.listSellerInventory(sellerId, {
      ...opts,
      status: ListingStatus.ACTIVE,
      forceStatus: true,
    });
  }

  /** Authenticated own inventory — any status including DRAFT. */
  async listOwn(
    sellerId: string,
    opts: { status?: string; cursor?: string; limit?: number },
  ) {
    return this.listSellerInventory(sellerId, {
      ...opts,
      forceStatus: false,
      orderByCreatedAt: true,
    });
  }

  private async listSellerInventory(
    sellerId: string,
    opts: {
      status?: string;
      cursor?: string;
      limit?: number;
      forceStatus?: boolean;
      orderByCreatedAt?: boolean;
    },
  ) {
    const limit = Math.min(opts.limit ?? 20, 50);
    const status = opts.forceStatus
      ? ListingStatus.ACTIVE
      : ((opts.status as ListingStatus | undefined) ?? ListingStatus.ACTIVE);

    if (opts.orderByCreatedAt) {
      const cursor = decodeOffset(opts.cursor);
      const rows = await this.prisma.listing.findMany({
        where: { sellerId, status },
        include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: cursor,
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      const hasMore = rows.length > limit;
      return {
        data: page.map(toProductCard),
        meta: {
          nextCursor: hasMore ? encodeOffset(cursor + limit) : null,
        },
      };
    }

    const cursor = decodeKeyset(opts.cursor);
    const where: Prisma.ListingWhereInput = {
      sellerId,
      status,
      ...(cursor
        ? {
            OR: [
              { publishedAt: { lt: new Date(cursor.publishedAt) } },
              {
                publishedAt: new Date(cursor.publishedAt),
                id: { lt: cursor.id },
              },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.listing.findMany({
      where,
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const page = rows.slice(0, limit);
    const next = rows.length > limit ? rows[limit - 1] : null;
    return {
      data: page.map(toProductCard),
      meta: {
        nextCursor:
          next?.publishedAt != null
            ? encodeKeyset({
                publishedAt: next.publishedAt.toISOString(),
                id: next.id,
              })
            : null,
      },
    };
  }

  /** Flush Redis view buffers into Postgres Listing.viewCount. */
  @Cron(CronExpression.EVERY_HOUR)
  async cronFlushViews(): Promise<void> {
    try {
      const flushed = await this.flushViewBuffers();
      if (flushed > 0) {
        this.logger.log(`Flushed view counts for ${flushed} listings`);
      }
    } catch (err) {
      this.logger.warn(
        `View flush cron failed: ${(err as Error).message}`,
      );
    }
  }

  async flushViewBuffers(): Promise<number> {
    const stream = this.redis.raw.scanStream({
      match: 'listing:views:*',
      count: 100,
    });

    let flushed = 0;
    const batch: string[] = [];

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (keys: string[]) => {
        batch.push(...keys);
      });
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });

    // Atomic GET+DEL so increments between get and del are not dropped.
    const getdelScript =
      'local v = redis.call("GET", KEYS[1]); if v then redis.call("DEL", KEYS[1]) end; return v';

    for (const key of batch) {
      const listingId = key.replace('listing:views:', '');
      if (!listingId) continue;
      const raw = (await this.redis.raw.eval(getdelScript, 1, key)) as
        | string
        | null;
      const n = Number(raw ?? 0);
      if (!Number.isFinite(n) || n <= 0) continue;
      const result = await this.prisma.listing.updateMany({
        where: { id: listingId },
        data: { viewCount: { increment: Math.floor(n) } },
      });
      if (result.count > 0) flushed += 1;
    }

    return flushed;
  }

  async listSimilar(
    listingId: string,
    opts: { cursor?: string; limit?: number; viewerId?: string },
  ) {
    const source = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!source) throw new ListingNotFoundException();

    const limit = Math.min(opts.limit ?? 12, 40);
    const offset = decodeOffset(opts.cursor);
    const price = source.priceAed ? Number(source.priceAed.toString()) : null;

    const candidates = await this.prisma.listing.findMany({
      where: {
        status: ListingStatus.ACTIVE,
        categoryId: source.categoryId,
        id: { not: listingId },
        ...(opts.viewerId ? { sellerId: { not: opts.viewerId } } : {}),
      },
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      take: 80,
    });

    const scored = candidates
      .map((l) => {
        let score = 0;
        if (source.brand && l.brand && source.brand.toLowerCase() === l.brand.toLowerCase()) {
          score += 100;
        }
        if (source.size && l.size && source.size.toLowerCase() === l.size.toLowerCase()) {
          score += 40;
        }
        if (price != null && l.priceAed) {
          const delta = Math.abs(Number(l.priceAed.toString()) - price);
          score += Math.max(0, 30 - delta / 10);
        }
        return { listing: l, score };
      })
      .sort((a, b) => b.score - a.score);

    const page = scored.slice(offset, offset + limit);
    const hasMore = scored.length > offset + limit;

    return {
      data: page.map((row) => toProductCard(row.listing)),
      meta: {
        nextCursor: hasMore ? encodeOffset(offset + limit) : null,
      },
    };
  }

  private async requireOwned(sellerId: string, listingId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new ListingNotFoundException();
    if (listing.sellerId !== sellerId) throw new ListingForbiddenException();
    return listing;
  }

  /** Buffer view increments in Redis; flushed to Postgres by a scheduled job. */
  private async bufferView(listingId: string): Promise<void> {
    try {
      const key = `listing:views:${listingId}`;
      await this.redis.incr(key);
      await this.redis.expire(key, 60 * 60 * 24);
    } catch {
      // Non-fatal: viewing must not fail if Redis is down.
    }
  }

  private serializeDetail(
    listing: Prisma.ListingGetPayload<{
      include: { images: true; category: true; seller: true };
    }>,
    isSavedByCurrentUser: boolean,
  ) {
    return {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      brand: listing.brand,
      size: listing.size,
      condition: listing.condition,
      priceAed: decimalToString(listing.priceAed),
      status: listing.status,
      isFeatured: listing.isFeatured,
      viewCount: listing.viewCount,
      images: listing.images.map((i) => ({ url: i.url, sortOrder: i.sortOrder })),
      category: {
        id: listing.category.id,
        name: listing.category.name,
        slug: listing.category.slug,
      },
      seller: {
        id: listing.seller.id,
        username: listing.seller.username,
        avatarUrl: listing.seller.avatarUrl,
        ratingAvg: Number(listing.seller.ratingAvg),
        ratingCount: listing.seller.ratingCount,
        reviewCount: listing.seller.ratingCount,
      },
      isSavedByCurrentUser,
    };
  }
}
