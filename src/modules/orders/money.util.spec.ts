import { Decimal } from '@prisma/client/runtime/library';
import {
  computeOrderTotals,
  computeSellerNet,
  fromFils,
  toFils,
} from './money.util';

describe('money.util', () => {
  describe('computeOrderTotals (seller-side 10%)', () => {
    it('charges buyer item price only; commission is seller-side', () => {
      const totals = computeOrderTotals([100], 0.1);
      expect(totals.subtotalAed.toFixed(2)).toBe('100.00');
      expect(totals.commissionAed.toFixed(2)).toBe('10.00');
      expect(totals.totalAed.toFixed(2)).toBe('100.00');
      expect(totals.totalAed.equals(totals.subtotalAed)).toBe(true);
    });

    it('sums multiple items and rounds commission half-up', () => {
      const totals = computeOrderTotals(['149.50', '50.00'], 0.1);
      expect(totals.subtotalAed.toFixed(2)).toBe('199.50');
      expect(totals.commissionAed.toFixed(2)).toBe('19.95');
      expect(totals.totalAed.toFixed(2)).toBe('199.50');
    });
  });

  describe('computeSellerNet', () => {
    it('credits seller subtotal minus commission (100 → 90)', () => {
      expect(computeSellerNet(100, 0.1).toFixed(2)).toBe('90.00');
    });
  });

  describe('fils conversion', () => {
    it('round-trips AED ↔ fils', () => {
      expect(toFils('149.50')).toBe(14950);
      expect(fromFils(14950).equals(new Decimal('149.50'))).toBe(true);
    });
  });
});
