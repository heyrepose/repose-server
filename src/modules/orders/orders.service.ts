import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ListingStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AddressesService } from '../addresses/addresses.service';
import { AddressNotFoundException } from '../addresses/addresses.errors';
import { ListingNotAvailableException } from '../listings/listings.errors';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { WalletService } from '../wallet/wallet.service';
import {
  CreateOrderDto,
  DisputeOrderDto,
  ListOrdersQueryDto,
  ShipOrderDto,
} from './dto/orders.dto';
import { computeOrderTotals, computeSellerNet } from './money.util';
import { OrderStateMachine } from './order-state-machine.service';
import {
  OrderForbiddenException,
  OrderNotCancellableException,
  OrderNotFoundException,
  OrderNotShippableException,
} from './orders.errors';

interface OrderCursor {
  createdAt: string;
  id: string;
}

function encodeOrderCursor(c: OrderCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeOrderCursor(raw?: string): OrderCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as OrderCursor;
    if (typeof parsed?.createdAt === 'string' && typeof parsed?.id === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly redis: RedisService,
    private readonly stateMachine: OrderStateMachine,
    private readonly addresses: AddressesService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments: PaymentsService,
    @Inject(forwardRef(() => WalletService))
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(buyerId: string, dto: CreateOrderDto) {
    const rate = this.config.get('COMMISSION_RATE', { infer: true });
    const uniqueListingIds = [...new Set(dto.listingIds)];

    const buyer = await this.prisma.user.findUniqueOrThrow({
      where: { id: buyerId },
      select: { fullName: true },
    });

    let address;
    try {
      address = await this.addresses.requireOwned(buyerId, dto.addressId);
    } catch {
      // Hide ownership detail — API contract exposes ADDRESS_NOT_FOUND only.
      throw new AddressNotFoundException();
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const listings = await tx.listing.findMany({
        where: { id: { in: uniqueListingIds } },
      });

      if (listings.length !== uniqueListingIds.length) {
        throw new ListingNotAvailableException();
      }
      for (const listing of listings) {
        if (listing.status !== ListingStatus.ACTIVE) {
          throw new ListingNotAvailableException();
        }
        if (listing.priceAed == null) {
          throw new ListingNotAvailableException();
        }
        if (listing.sellerId === buyerId) {
          throw new ListingNotAvailableException();
        }
      }

      // Re-check status under transaction to catch mid-flight SOLD races
      const stillActive = await tx.listing.count({
        where: {
          id: { in: uniqueListingIds },
          status: ListingStatus.ACTIVE,
        },
      });
      if (stillActive !== uniqueListingIds.length) {
        throw new ListingNotAvailableException();
      }

      const prices = listings.map((l) => l.priceAed as Decimal);
      const totals = computeOrderTotals(prices, rate);

      const created = await tx.order.create({
        data: {
          buyerId,
          addressId: address.id,
          status: OrderStatus.PENDING_PAYMENT,
          subtotalAed: totals.subtotalAed,
          commissionAed: totals.commissionAed,
          totalAed: totals.totalAed,
          shipName: buyer.fullName,
          shipLine1: address.line1,
          shipLine2: address.line2,
          shipCity: address.city,
          shipEmirate: address.emirate,
          shipCountry: address.country,
          shipPostalCode: address.postalCode,
          shipPhone: address.phone,
          items: {
            create: listings.map((l) => ({
              listingId: l.id,
              sellerId: l.sellerId,
              priceAed: l.priceAed as Decimal,
            })),
          },
          statusHistory: {
            create: {
              status: OrderStatus.PENDING_PAYMENT,
              actorId: buyerId,
              note: 'Order created',
            },
          },
        },
      });

      return { created, totals };
    });

    const intent = await this.payments.createIntentForOrder(
      order.created.id,
      order.totals.totalAed,
    );

    return {
      orderId: order.created.id,
      status: OrderStatus.PENDING_PAYMENT,
      subtotalAed: order.totals.subtotalAed.toFixed(2),
      commissionAed: order.totals.commissionAed.toFixed(2),
      totalAed: order.totals.totalAed.toFixed(2),
      clientSecret: intent.clientSecret,
    };
  }

  async getById(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            listing: {
              include: {
                images: { orderBy: { sortOrder: 'asc' }, take: 1 },
              },
            },
          },
        },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        payment: true,
      },
    });
    if (!order) throw new OrderNotFoundException();
    this.assertParty(userId, order.buyerId, order.items.map((i) => i.sellerId));

    return this.serializeDetail(order);
  }

  async list(userId: string, query: ListOrdersQueryDto) {
    const limit = query.limit ?? 20;
    const cursor = decodeOrderCursor(query.cursor);

    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.role === 'buyer'
        ? { buyerId: userId }
        : { items: { some: { sellerId: userId } } }),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              {
                createdAt: new Date(cursor.createdAt),
                id: { lt: cursor.id },
              },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.order.findMany({
      where,
      include: {
        items: {
          take: 1,
          include: {
            listing: {
              include: {
                images: { orderBy: { sortOrder: 'asc' }, take: 1 },
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const page = rows.slice(0, limit);
    const next = rows.length > limit ? page[page.length - 1] : null;

    return {
      data: page.map((o) => {
        const first = o.items[0];
        return {
          id: o.id,
          status: o.status,
          totalAed: o.totalAed.toFixed(2),
          mainImageUrl: first?.listing.images[0]?.url ?? null,
          title: first?.listing.title ?? null,
          createdAt: o.createdAt.toISOString(),
        };
      }),
      meta: {
        nextCursor: next
          ? encodeOrderCursor({
              createdAt: next.createdAt.toISOString(),
              id: next.id,
            })
          : null,
      },
    };
  }

  async ship(userId: string, orderId: string, dto: ShipOrderDto) {
    const order = await this.requireSellerOrder(userId, orderId);
    if (order.status !== OrderStatus.PAID_HELD) {
      throw new OrderNotShippableException();
    }

    await this.wallet.requireOnboardingComplete(userId);

    const updated = await this.stateMachine.transition(
      orderId,
      OrderStatus.SHIPPED,
      userId,
      `Shipped via ${dto.courierName}`,
      {
        courierName: dto.courierName,
        trackingNumber: dto.trackingNumber,
        shippedAt: new Date(),
      },
    );

    await this.notifications.dispatch({
      userId: order.buyerId,
      type: 'ORDER_UPDATE',
      title: 'Order shipped',
      body: `Your order is on the way via ${dto.courierName}.`,
      data: { route: 'order', orderId },
    });

    return this.getById(userId, updated.id);
  }

  async confirmReceipt(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new OrderNotFoundException();
    if (order.buyerId !== userId) throw new OrderForbiddenException();

    await this.stateMachine.transition(
      orderId,
      OrderStatus.DELIVERED,
      userId,
      'Buyer confirmed receipt',
      { deliveredAt: new Date() },
    );

    await this.creditSellersAndRelease(orderId, userId);

    return this.getById(userId, orderId);
  }

  async cancel(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new OrderNotFoundException();
    this.assertParty(
      userId,
      order.buyerId,
      order.items.map((i) => i.sellerId),
    );

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new OrderNotCancellableException();
    }

    await this.stateMachine.transition(
      orderId,
      OrderStatus.CANCELLED,
      userId,
      'Cancelled by user',
    );

    return this.getById(userId, orderId);
  }

  async dispute(userId: string, orderId: string, dto: DisputeOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new OrderNotFoundException();
    this.assertParty(
      userId,
      order.buyerId,
      order.items.map((i) => i.sellerId),
    );

    await this.stateMachine.transition(
      orderId,
      OrderStatus.DISPUTED,
      userId,
      dto.note ?? dto.reason,
      { disputeReason: dto.reason },
    );

    return this.getById(userId, orderId);
  }

  /**
   * Remind sellers to ship PAID_HELD orders — warn-only (no auto-cancel / refund).
   * Eve: once when within 1 day of ORDER_SHIP_TIMEOUT_DAYS.
   * Deadline: once when past ORDER_SHIP_TIMEOUT_DAYS.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cronShipTimeout(): Promise<void> {
    const days = this.config.get('ORDER_SHIP_TIMEOUT_DAYS', { infer: true });
    const now = Date.now();
    const eveMs = Math.max(days - 1, 0) * 24 * 60 * 60 * 1000;
    const deadlineMs = days * 24 * 60 * 60 * 1000;

    const held = await this.prisma.order.findMany({
      where: { status: OrderStatus.PAID_HELD },
      include: {
        payment: true,
        items: true,
      },
      take: 100,
    });

    for (const order of held) {
      const paidAt = order.payment?.capturedAt ?? order.updatedAt;
      const ageMs = now - paidAt.getTime();
      const sellers = [...new Set(order.items.map((i) => i.sellerId))];

      try {
        if (ageMs >= deadlineMs) {
          const key = `order:ship_warn:${order.id}:deadline`;
          const already = await this.redis.get(key);
          if (!already) {
            for (const sellerId of sellers) {
              await this.notifications.dispatch({
                userId: sellerId,
                type: 'ORDER_UPDATE',
                title: 'Ship reminder — overdue',
                body: `This order still needs shipping. Please ship as soon as you can.`,
                data: { route: 'order', orderId: order.id },
              });
            }
            await this.redis.set(key, '1', 60 * 60 * 24 * 30);
            this.logger.log(`Ship-deadline reminder sent for order ${order.id}`);
          }
        } else if (ageMs >= eveMs) {
          const key = `order:ship_warn:${order.id}:eve`;
          const already = await this.redis.get(key);
          if (!already) {
            for (const sellerId of sellers) {
              await this.notifications.dispatch({
                userId: sellerId,
                type: 'ORDER_UPDATE',
                title: 'Ship reminder',
                body: `Please ship this order soon — the ship window is almost up.`,
                data: { route: 'order', orderId: order.id },
              });
            }
            await this.redis.set(key, '1', 60 * 60 * 24 * 14);
            this.logger.log(`Ship-eve reminder sent for order ${order.id}`);
          }
        }
      } catch (err) {
        this.logger.warn(
          `Ship-timeout reminder failed for ${order.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  /** Auto-confirm delivery when buyer is silent after ship. */
  @Cron(CronExpression.EVERY_HOUR)
  async cronAutoConfirm(): Promise<void> {
    const days = this.config.get('ORDER_AUTO_CONFIRM_DAYS', { infer: true });
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);

    const due = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.SHIPPED,
        shippedAt: { lt: cutoff },
      },
      include: { items: true },
      take: 50,
    });

    for (const order of due) {
      try {
        await this.stateMachine.transition(
          order.id,
          OrderStatus.DELIVERED,
          null,
          `Auto-confirmed after ${days} days`,
          { deliveredAt: new Date() },
        );
        await this.creditSellersAndRelease(order.id, null);
        this.logger.log(`Auto-confirmed order ${order.id}`);
      } catch (err) {
        this.logger.warn(
          `Auto-confirm failed for ${order.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async creditSellersAndRelease(
    orderId: string,
    actorId: string | null,
  ): Promise<void> {
    const rate = this.config.get('COMMISSION_RATE', { infer: true });
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return;

    const bySeller = new Map<string, Decimal>();
    for (const item of order.items) {
      const prev = bySeller.get(item.sellerId) ?? new Decimal(0);
      bySeller.set(item.sellerId, prev.plus(item.priceAed));
    }

    for (const [sellerId, subtotal] of bySeller) {
      const net = computeSellerNet(subtotal, rate);
      await this.wallet.creditPending(sellerId, net, orderId);
    }

    const fresh = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (fresh?.status === OrderStatus.DELIVERED) {
      await this.stateMachine.transition(
        orderId,
        OrderStatus.RELEASED,
        actorId,
        'Seller proceeds credited (pending clearance)',
      );
    }

    await this.prisma.payment.updateMany({
      where: { orderId },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
      },
    });
  }

  private async requireSellerOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new OrderNotFoundException();
    const isSeller = order.items.some((i) => i.sellerId === userId);
    if (!isSeller) throw new OrderForbiddenException();
    return order;
  }

  private assertParty(
    userId: string,
    buyerId: string,
    sellerIds: string[],
  ): void {
    if (userId === buyerId || sellerIds.includes(userId)) return;
    throw new OrderForbiddenException();
  }

  private serializeDetail(
    order: Prisma.OrderGetPayload<{
      include: {
        items: {
          include: {
            listing: { include: { images: true } };
          };
        };
        statusHistory: true;
        payment: true;
      };
    }>,
  ) {
    const shipTimeoutDays = this.config.get('ORDER_SHIP_TIMEOUT_DAYS', {
      infer: true,
    });
    const paidAt = order.payment?.capturedAt ?? null;
    let shipByAt: string | null = null;
    if (order.status === OrderStatus.PAID_HELD && paidAt) {
      const deadline = new Date(paidAt);
      deadline.setUTCDate(deadline.getUTCDate() + shipTimeoutDays);
      shipByAt = deadline.toISOString();
    }

    return {
      id: order.id,
      status: order.status,
      buyerId: order.buyerId,
      subtotalAed: order.subtotalAed.toFixed(2),
      commissionAed: order.commissionAed.toFixed(2),
      totalAed: order.totalAed.toFixed(2),
      items: order.items.map((item) => ({
        listing: {
          id: item.listing.id,
          title: item.listing.title,
          mainImageUrl: item.listing.images[0]?.url ?? null,
        },
        sellerId: item.sellerId,
        priceAed: item.priceAed.toFixed(2),
      })),
      address: {
        name: order.shipName,
        line1: order.shipLine1,
        line2: order.shipLine2,
        city: order.shipCity,
        emirate: order.shipEmirate,
        country: order.shipCountry,
        postalCode: order.shipPostalCode,
        phone: order.shipPhone,
      },
      courierName: order.courierName,
      trackingNumber: order.trackingNumber,
      shippedAt: order.shippedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      statusHistory: order.statusHistory.map((h) => ({
        status: h.status,
        note: h.note,
        actorId: h.actorId,
        createdAt: h.createdAt.toISOString(),
      })),
      payment: order.payment
        ? {
            status: order.payment.status,
            providerIntentId: order.payment.providerIntentId,
            capturedAt: order.payment.capturedAt?.toISOString() ?? null,
          }
        : null,
      paidAt: paidAt?.toISOString() ?? null,
      shipByAt,
      shipTimeoutDays,
    };
  }
}
