import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ListingStatus,
  OrderStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { ListingEvents } from '../search/search.constants';
import {
  AdminCategoryNotFoundException,
  AdminListingNotFoundException,
  AdminUserNotFoundException,
} from './admin.errors';
import {
  AdminReportsQueryDto,
  ModerateListingDto,
  UpdateCategoryAdminDto,
  UpdateUserStatusDto,
} from './dto/admin.dto';

interface ReportCursor {
  updatedAt: string;
  id: string;
}

function encodeReportCursor(cursor: ReportCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeReportCursor(raw?: string): ReportCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as ReportCursor;
    if (
      typeof parsed?.updatedAt === 'string' &&
      typeof parsed?.id === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function asAttrs(
  value: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async listReports(query: AdminReportsQueryDto) {
    const limit = Math.min(query.limit ?? 20, 50);
    const cursor = decodeReportCursor(query.cursor);

    const where: Prisma.ListingWhereInput = {
      status: ListingStatus.FLAGGED,
      ...(cursor
        ? {
            OR: [
              { updatedAt: { lt: new Date(cursor.updatedAt) } },
              {
                updatedAt: new Date(cursor.updatedAt),
                id: { lt: cursor.id },
              },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.listing.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const page = rows.slice(0, limit);
    const next = rows.length > limit ? rows[limit - 1] : null;

    return {
      data: page.map((listing) => {
        const attrs = asAttrs(listing.attributes);
        const flagReason =
          typeof attrs.flagReason === 'string' ? attrs.flagReason : null;
        const reportedAt =
          typeof attrs.flaggedAt === 'string'
            ? attrs.flaggedAt
            : listing.updatedAt.toISOString();
        return {
          listingId: listing.id,
          title: listing.title,
          flagReason,
          reportedAt,
        };
      }),
      meta: {
        nextCursor: next
          ? encodeReportCursor({
              updatedAt: next.updatedAt.toISOString(),
              id: next.id,
            })
          : null,
      },
    };
  }

  async moderateListing(listingId: string, dto: ModerateListingDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new AdminListingNotFoundException();

    const attrs = asAttrs(listing.attributes);
    if (dto.note) {
      attrs.moderationNote = dto.note;
      attrs.moderatedAt = new Date().toISOString();
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        status: dto.status as ListingStatus,
        attributes: attrs as Prisma.InputJsonValue,
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        category: true,
        seller: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            ratingAvg: true,
          },
        },
      },
    });

    if (dto.status === ListingStatus.ACTIVE) {
      this.events.emit(ListingEvents.Changed, { listingId });
    } else {
      this.events.emit(ListingEvents.Removed, { listingId });
    }

    if (dto.note) {
      this.logger.log(
        `Listing ${listingId} moderated → ${dto.status}: ${dto.note}`,
      );
    }

    return {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      priceAed: updated.priceAed?.toString() ?? null,
      condition: updated.condition,
      category: {
        id: updated.category.id,
        name: updated.category.name,
        slug: updated.category.slug,
      },
      seller: {
        id: updated.seller.id,
        username: updated.seller.username,
        avatarUrl: updated.seller.avatarUrl,
        ratingAvg: Number(updated.seller.ratingAvg),
      },
      images: updated.images.map((i) => ({
        url: i.url,
        sortOrder: i.sortOrder,
      })),
      attributes: updated.attributes,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async updateCategory(categoryId: string, dto: UpdateCategoryAdminDto) {
    const existing = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!existing) throw new AdminCategoryNotFoundException();

    const category = await this.prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      bannerUrl: category.bannerUrl,
      iconUrl: category.iconUrl,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      parentId: category.parentId,
    };
  }

  async updateUserStatus(
    userId: string,
    dto: UpdateUserStatusDto,
    actorId: string,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new AdminUserNotFoundException();

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: dto.status },
    });

    this.logger.log(
      `User ${userId} status → ${dto.status} by ${actorId}` +
        (dto.note ? `: ${dto.note}` : ''),
    );

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async dashboard() {
    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - 7);

    const gmvStatuses: OrderStatus[] = [
      OrderStatus.RELEASED,
      OrderStatus.PAID_HELD,
    ];

    const [
      userCount,
      activeListings,
      ordersToday,
      ordersThisWeek,
      gmvAgg,
      pendingModerationCount,
    ] = await Promise.all([
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.listing.count({ where: { status: ListingStatus.ACTIVE } }),
      this.prisma.order.count({
        where: { createdAt: { gte: startOfToday } },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: startOfWeek } },
      }),
      this.prisma.order.aggregate({
        where: { status: { in: gmvStatuses } },
        _sum: { totalAed: true },
      }),
      this.prisma.listing.count({ where: { status: ListingStatus.FLAGGED } }),
    ]);

    const gmv = gmvAgg._sum.totalAed ?? new Decimal(0);

    return {
      userCount,
      activeListings,
      ordersToday,
      ordersThisWeek,
      gmvAed: gmv.toFixed(2),
      pendingModerationCount,
    };
  }
}
