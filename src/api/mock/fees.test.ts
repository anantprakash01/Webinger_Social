import { describe, expect, it } from 'vitest';
import { applyBps, calculateFees, DEFAULT_FEES } from './fees';

describe('calculateFees', () => {
  it('matches the $200 example in section 4.2', () => {
    expect(calculateFees(20_000, DEFAULT_FEES)).toEqual({
      priceCents: 20_000,
      brandFeeCents: 2_000,
      brandTotalCents: 22_000,
      creatorFeeCents: 3_000,
      creatorPayoutCents: 17_000,
      platformGrossCents: 5_000,
    });
  });

  it('uses the configured basis points, not the defaults', () => {
    const f = calculateFees(20_000, { brandFeeBps: 500, creatorFeeBps: 1000 });
    expect(f.brandFeeCents).toBe(1_000);
    expect(f.creatorFeeCents).toBe(2_000);
    expect(f.brandTotalCents).toBe(21_000);
    expect(f.creatorPayoutCents).toBe(18_000);
  });

  it('always balances: brand total = creator payout + platform gross', () => {
    for (const price of [1_000, 1_001, 1_999, 3_333, 12_345, 99_999, 1_234_567]) {
      const f = calculateFees(price);
      expect(f.brandTotalCents).toBe(f.creatorPayoutCents + f.platformGrossCents);
      expect(Number.isInteger(f.brandFeeCents)).toBe(true);
      expect(Number.isInteger(f.creatorFeeCents)).toBe(true);
    }
  });

  it('rejects non-integer or non-positive prices', () => {
    expect(() => calculateFees(199.99)).toThrow(/integer minor units/);
    expect(() => calculateFees(0)).toThrow(/positive/);
    expect(() => calculateFees(-100)).toThrow(/positive/);
  });
});

describe('applyBps', () => {
  it('rounds half up to the nearest cent', () => {
    expect(applyBps(1_005, 1000)).toBe(101); // 100.5 → 101
    expect(applyBps(1_004, 1000)).toBe(100); // 100.4 → 100
    expect(applyBps(3_333, 1500)).toBe(500); // 499.95 → 500
    expect(applyBps(1_001, 1500)).toBe(150); // 150.15 → 150
  });

  it('handles 0% and 100%', () => {
    expect(applyBps(12_345, 0)).toBe(0);
    expect(applyBps(12_345, 10_000)).toBe(12_345);
  });

  it('rejects invalid basis points', () => {
    expect(() => applyBps(100, -1)).toThrow();
    expect(() => applyBps(100, 10_001)).toThrow();
    expect(() => applyBps(100, 12.5)).toThrow();
  });
});
