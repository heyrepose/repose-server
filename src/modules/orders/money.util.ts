import { Decimal } from '@prisma/client/runtime/library';

/** AED → fils (Stripe minor units). Single conversion site for the API. */
export function toFils(amountAed: Decimal | string | number): number {
  return new Decimal(amountAed).mul(100).round().toNumber();
}

export function fromFils(fils: number): Decimal {
  return new Decimal(fils).div(100).toDecimalPlaces(2);
}

export interface OrderTotals {
  subtotalAed: Decimal;
  commissionAed: Decimal;
  /** Seller-side commission: buyer pays item price only. */
  totalAed: Decimal;
}

/**
 * Platform commission is deducted from seller proceeds, not added to the buyer total.
 * `totalAed === subtotalAed` by design (LOCKED Phase 3 decision).
 */
export function computeOrderTotals(
  prices: Array<Decimal | string | number>,
  commissionRate: number,
): OrderTotals {
  const subtotalAed = prices.reduce<Decimal>(
    (sum, p) => sum.plus(new Decimal(p)),
    new Decimal(0),
  );
  const commissionAed = subtotalAed
    .mul(commissionRate)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    subtotalAed,
    commissionAed,
    totalAed: subtotalAed,
  };
}

/** Net credit to a seller for their items after commission. */
export function computeSellerNet(
  sellerSubtotalAed: Decimal | string | number,
  commissionRate: number,
): Decimal {
  const sub = new Decimal(sellerSubtotalAed);
  const commission = sub
    .mul(commissionRate)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return sub.minus(commission);
}
