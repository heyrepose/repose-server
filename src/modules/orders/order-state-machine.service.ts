import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Order, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
import {
  OrderInvalidTransitionException,
  OrderNotFoundException,
} from './orders.errors';

/** Allow-list of legal status transitions. Only this service writes Order.status. */
export const ORDER_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  PENDING_PAYMENT: [OrderStatus.PAID_HELD, OrderStatus.CANCELLED],
  PAID_HELD: [
    OrderStatus.SHIPPED,
    OrderStatus.CANCELLED,
    OrderStatus.DISPUTED,
    OrderStatus.REFUNDED,
  ],
  SHIPPED: [OrderStatus.DELIVERED, OrderStatus.DISPUTED, OrderStatus.REFUNDED],
  DELIVERED: [OrderStatus.RELEASED, OrderStatus.DISPUTED],
  DISPUTED: [OrderStatus.RELEASED, OrderStatus.REFUNDED],
  RELEASED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

@Injectable()
export class OrderStateMachine {
  private readonly logger = new Logger(OrderStateMachine.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Atomically updates Order.status and appends OrderStatusHistory.
   * Never call prisma.order.update({ status }) outside this method.
   */
  async transition(
    orderId: string,
    toStatus: OrderStatus,
    actorId: string | null,
    note?: string,
    extra?: Prisma.OrderUpdateInput,
  ): Promise<Order> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new OrderNotFoundException();
      if (!canTransition(order.status, toStatus)) {
        throw new OrderInvalidTransitionException(order.status, toStatus);
      }

      const next = await tx.order.update({
        where: { id: orderId },
        data: {
          status: toStatus,
          ...extra,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: toStatus,
          actorId,
          note,
        },
      });

      return next;
    });

    await this.emitStatusChanged(updated);
    return updated;
  }

  private async emitStatusChanged(order: Order): Promise<void> {
    try {
      const items = await this.prisma.orderItem.findMany({
        where: { orderId: order.id },
        select: { sellerId: true },
      });
      const recipients = new Set<string>([
        order.buyerId,
        ...items.map((i) => i.sellerId),
      ]);
      const payload = {
        orderId: order.id,
        status: order.status,
        updatedAt: order.updatedAt.toISOString(),
      };
      for (const userId of recipients) {
        this.chatGateway.emitToUser(userId, 'order:status_changed', payload);
      }
    } catch (err) {
      this.logger.warn(
        `order:status_changed emit failed: ${(err as Error).message}`,
      );
    }
  }
}
