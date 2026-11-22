/**
 * Basis-point fee calculator, integer cents only (section 4.2).
 * Must give the same results as the backend FeeCalculator for every input.
 *
 * Rounding: half up to the nearest cent, done with integer arithmetic.
 */
import { assertCents } from '@/lib/money';

export interface FeeConfig {
  plan: string;
  /** Added to the package price at checkout. 1000 bps = 10%. */
  brandFeeBps: number;
  /** Deducted from the package price on payout. 1500 bps = 15%. */
  creatorFeeBps: number;
}

export const DEFAULT_FEES: FeeConfig = { plan: 'FREE', brandFeeBps: 1000, creatorFeeBps: 1500 };

export interface FeeBreakdown {
  priceCents: number;
  brandFeeCents: number;
  /** What the brand pays: price + brand fee. */
  brandTotalCents: number;
  creatorFeeCents: number;
  /** What the creator receives: price − creator fee. */
  creatorPayoutCents: number;
  /** Both fees. Razorpay processing fees come out of this. */
  platformGrossCents: number;
}

const BPS_DENOMINATOR = 10_000;

/** cents × bps / 10 000, rounded half up, without floating point. */
export function applyBps(cents: number, bps: number): number {
  assertCents(cents);
  if (!Number.isInteger(bps) || bps < 0 || bps > BPS_DENOMINATOR) throw new Error(`Invalid basis points: ${bps}`);
  if (cents < 0) throw new Error('Fees apply to non-negative amounts only');
  return Math.floor((cents * bps + BPS_DENOMINATOR / 2) / BPS_DENOMINATOR);
}

export function calculateFees(priceCents: number, config: Pick<FeeConfig, 'brandFeeBps' | 'creatorFeeBps'> = DEFAULT_FEES): FeeBreakdown {
  assertCents(priceCents);
  if (priceCents <= 0) throw new Error('Price must be positive');
  const brandFeeCents = applyBps(priceCents, config.brandFeeBps);
  const creatorFeeCents = applyBps(priceCents, config.creatorFeeBps);
  return {
    priceCents,
    brandFeeCents,
    brandTotalCents: priceCents + brandFeeCents,
    creatorFeeCents,
    creatorPayoutCents: priceCents - creatorFeeCents,
    platformGrossCents: brandFeeCents + creatorFeeCents,
  };
}

/** Minimum package price (FR-12): ₹500 (INR market). */
export const MIN_PRICE_CENTS = 50_000;
