import { describe, expect, it } from 'vitest';
import { calculateFees, DEFAULT_FEES } from './fees';
import { calculateTaxes, GSTIN_PATTERN, splitGst } from './tax';

describe('Indian taxes on a ₹10,000 package (default fees)', () => {
  const f = calculateFees(1_000_000, DEFAULT_FEES); // fee ₹1,000 brand, ₹1,500 creator

  it('unregistered creator: GST 18% on fees, TDS 0.1%, no TCS or creator GST', () => {
    const t = calculateTaxes(f, { intraState: true, creatorGstRegistered: false });
    expect(t).toMatchObject({ creatorGstCents: 0, brandFeeGstCents: 18_000, creatorFeeGstCents: 27_000, tdsCents: 1_000, tcsCents: 0 });
    // Brand pays ₹10,000 + ₹1,000 + ₹180 = ₹11,180; creator gets ₹10,000 − ₹1,500 − ₹270 − ₹10 = ₹8,220.
    expect(f.priceCents + f.brandFeeCents + t.brandFeeGstCents + t.creatorGstCents).toBe(1_118_000);
    expect(f.priceCents + t.creatorGstCents - f.creatorFeeCents - t.creatorFeeGstCents - t.tdsCents - t.tcsCents).toBe(822_000);
  });

  it('GST-registered creator: adds 18% GST on the price for the brand, withholds 0.5% TCS', () => {
    const t = calculateTaxes(f, { intraState: false, creatorGstRegistered: true });
    expect(t).toMatchObject({ creatorGstCents: 180_000, tcsCents: 5_000, tdsCents: 1_000 });
    expect(f.priceCents + f.brandFeeCents + t.brandFeeGstCents + t.creatorGstCents).toBe(1_298_000);
    expect(f.priceCents + t.creatorGstCents - f.creatorFeeCents - t.creatorFeeGstCents - t.tdsCents - t.tcsCents).toBe(997_000);
  });

  it('splits intra-state GST into CGST and SGST and validates GSTINs', () => {
    expect(splitGst(18_001)).toEqual({ cgstCents: 9_000, sgstCents: 9_001 });
    expect(GSTIN_PATTERN.test('29ABCDE1234F1Z5')).toBe(true);
    expect(GSTIN_PATTERN.test('29ABCDE1234F1X5')).toBe(false);
  });
});
