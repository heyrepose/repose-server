import { OrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { isOrderReviewable, nextRatingStats } from './reviews.service';

describe('reviews eligibility', () => {
  const buyer = 'buyer-1';
  const seller = 'seller-1';

  it('allows buyer to review DELIVERED orders', () => {
    expect(isOrderReviewable(OrderStatus.DELIVERED, buyer, buyer)).toBe('ok');
  });

  it('allows buyer to review RELEASED orders', () => {
    expect(isOrderReviewable(OrderStatus.RELEASED, buyer, buyer)).toBe('ok');
  });

  it('rejects SHIPPED and PAID_HELD', () => {
    expect(isOrderReviewable(OrderStatus.SHIPPED, buyer, buyer)).toBe(
      'not_eligible',
    );
    expect(isOrderReviewable(OrderStatus.PAID_HELD, buyer, buyer)).toBe(
      'not_eligible',
    );
  });

  it('forbids the seller from reviewing', () => {
    expect(isOrderReviewable(OrderStatus.DELIVERED, seller, buyer)).toBe(
      'forbidden',
    );
  });

  it('updates rating average incrementally', () => {
    const first = nextRatingStats(new Decimal(0), 0, 5);
    expect(first.ratingCount).toBe(1);
    expect(first.ratingAvg.toString()).toBe('5');

    const second = nextRatingStats(first.ratingAvg, first.ratingCount, 3);
    expect(second.ratingCount).toBe(2);
    expect(second.ratingAvg.toString()).toBe('4');
  });
});
