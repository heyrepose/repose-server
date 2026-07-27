import { OrderStatus } from '@prisma/client';
import {
  ORDER_TRANSITIONS,
  canTransition,
} from './order-state-machine.service';

describe('OrderStateMachine allow-list', () => {
  const cases: Array<[OrderStatus, OrderStatus, boolean]> = [
    [OrderStatus.PENDING_PAYMENT, OrderStatus.PAID_HELD, true],
    [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED, true],
    [OrderStatus.PENDING_PAYMENT, OrderStatus.SHIPPED, false],
    [OrderStatus.PENDING_PAYMENT, OrderStatus.RELEASED, false],
    [OrderStatus.PAID_HELD, OrderStatus.SHIPPED, true],
    [OrderStatus.PAID_HELD, OrderStatus.CANCELLED, true],
    [OrderStatus.PAID_HELD, OrderStatus.DISPUTED, true],
    [OrderStatus.PAID_HELD, OrderStatus.REFUNDED, true],
    [OrderStatus.PAID_HELD, OrderStatus.DELIVERED, false],
    [OrderStatus.SHIPPED, OrderStatus.DELIVERED, true],
    [OrderStatus.SHIPPED, OrderStatus.DISPUTED, true],
    [OrderStatus.SHIPPED, OrderStatus.REFUNDED, true],
    [OrderStatus.SHIPPED, OrderStatus.RELEASED, false],
    [OrderStatus.DELIVERED, OrderStatus.RELEASED, true],
    [OrderStatus.DELIVERED, OrderStatus.DISPUTED, true],
    [OrderStatus.DELIVERED, OrderStatus.REFUNDED, false],
    [OrderStatus.DISPUTED, OrderStatus.RELEASED, true],
    [OrderStatus.DISPUTED, OrderStatus.REFUNDED, true],
    [OrderStatus.RELEASED, OrderStatus.DISPUTED, false],
    [OrderStatus.CANCELLED, OrderStatus.PAID_HELD, false],
    [OrderStatus.REFUNDED, OrderStatus.PAID_HELD, false],
  ];

  it.each(cases)('%s → %s = %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });

  it('covers every OrderStatus key', () => {
    const statuses = Object.values(OrderStatus);
    for (const status of statuses) {
      expect(ORDER_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(ORDER_TRANSITIONS[status])).toBe(true);
    }
  });
});
