/**
 * Double-entry ledger for the mock (section 4.1). Same accounts and rules as the backend LedgerService.
 *
 * Every transaction is a set of entries whose debits equal its credits. Money "moves from A to B"
 * as a credit on A and a debit on B. A transaction that does not balance throws, so a bug in the
 * mock shows up immediately instead of as a wrong balance in a demo.
 */
import { assertCents } from '@/lib/money';

/**
 * BRAND_CHARGE: money taken from the brand's payment method (Razorpay). GST_PAYABLE: GST on the platform's fees,
 * owed to the government. TAX_WITHHELD: TDS (194-O) and TCS (s.52) withheld from creators, deposited with the
 * government. Everything else as in section 4.1.
 */
export type LedgerAccount = 'BRAND_CHARGE' | 'ESCROW' | 'PLATFORM_REVENUE' | 'GST_PAYABLE' | 'TAX_WITHHELD' | 'CREATOR_BALANCE' | 'PAYOUT' | 'PROMOTIONS';

export interface LedgerEntry {
  txnId: string;
  orderId: string;
  account: LedgerAccount;
  debitCents: number;
  creditCents: number;
  memo: string;
  createdAt: string;
}

export type LedgerLine = Pick<LedgerEntry, 'account' | 'debitCents' | 'creditCents'>;

export class LedgerImbalanceError extends Error {}

/** Sum of debits minus credits. Zero for every valid transaction. */
export const txnBalance = (lines: LedgerLine[]) => lines.reduce((sum, l) => sum + l.debitCents - l.creditCents, 0);

/** Validates a transaction and stamps it. Throws LedgerImbalanceError if it does not sum to zero. */
export function postTxn(
  lines: LedgerLine[],
  meta: { txnId: string; orderId: string; memo: string; at: string },
): LedgerEntry[] {
  const kept = lines.filter((l) => l.debitCents !== 0 || l.creditCents !== 0);
  if (kept.length < 2) throw new LedgerImbalanceError(`Transaction ${meta.txnId} needs at least two entries`);
  for (const l of kept) {
    assertCents(l.debitCents);
    assertCents(l.creditCents);
    if (l.debitCents < 0 || l.creditCents < 0) throw new LedgerImbalanceError('Entries cannot be negative');
    if (l.debitCents > 0 && l.creditCents > 0) throw new LedgerImbalanceError('An entry is either a debit or a credit');
  }
  const balance = txnBalance(kept);
  if (balance !== 0) throw new LedgerImbalanceError(`Transaction ${meta.txnId} is off by ${balance} cents`);
  return kept.map((l) => ({ ...l, txnId: meta.txnId, orderId: meta.orderId, memo: meta.memo, createdAt: meta.at }));
}

const move = (from: LedgerAccount, to: LedgerAccount, cents: number): LedgerLine[] => [
  { account: from, debitCents: 0, creditCents: cents },
  { account: to, debitCents: cents, creditCents: 0 },
];

/* ---------- One builder per money movement in section 4.1 ---------- */

/**
 * Step 2 — creator accepts, payment captured: BRAND_CHARGE → ESCROW (price + brand fee + GST).
 * v3.3: a promo or referral credit is funded by the platform, so PROMOTIONS pays that part into escrow and
 * the creator's share and the fees are unchanged.
 */
export function captureLines(brandTotalCents: number, promotionsCents = 0): LedgerLine[] {
  if (promotionsCents < 0 || promotionsCents >= brandTotalCents) throw new LedgerImbalanceError('Discount must be less than the order total');
  return [
    { account: 'BRAND_CHARGE', debitCents: 0, creditCents: brandTotalCents - promotionsCents },
    { account: 'PROMOTIONS', debitCents: 0, creditCents: promotionsCents },
    { account: 'ESCROW', debitCents: brandTotalCents, creditCents: 0 },
  ];
}

/**
 * Step 4 — approval or auto-approval: ESCROW → CREATOR_BALANCE (their share), GST_PAYABLE (GST on both fees),
 * TAX_WITHHELD (TDS + TCS) and PLATFORM_REVENUE (both fees: whatever is left).
 */
export function releaseLines(o: { escrowCents: number; creatorPayoutCents: number; gstCents?: number; withheldCents?: number }): LedgerLine[] {
  const gst = o.gstCents ?? 0;
  const withheld = o.withheldCents ?? 0;
  const platform = o.escrowCents - o.creatorPayoutCents - gst - withheld;
  if (platform < 0) throw new LedgerImbalanceError('Creator payout and taxes exceed escrow');
  const lines: LedgerLine[] = [
    { account: 'ESCROW', debitCents: 0, creditCents: o.escrowCents },
    { account: 'PLATFORM_REVENUE', debitCents: platform, creditCents: 0 },
    { account: 'GST_PAYABLE', debitCents: gst, creditCents: 0 },
    { account: 'TAX_WITHHELD', debitCents: withheld, creditCents: 0 },
    { account: 'CREATOR_BALANCE', debitCents: o.creatorPayoutCents, creditCents: 0 },
  ];
  return lines.filter((l) => l.debitCents !== 0 || l.creditCents !== 0 || l.account === 'CREATOR_BALANCE');
}

/**
 * Step 6 — dispute ruled for the brand: ESCROW → BRAND_CHARGE (refunded to the original payment method).
 * v3.3: on a full refund of a discounted order, the platform-funded part goes back to PROMOTIONS.
 */
export function refundLines(refundCents: number, promotionsCents = 0): LedgerLine[] {
  return [
    { account: 'ESCROW', debitCents: 0, creditCents: refundCents + promotionsCents },
    { account: 'BRAND_CHARGE', debitCents: refundCents, creditCents: 0 },
    { account: 'PROMOTIONS', debitCents: promotionsCents, creditCents: 0 },
  ];
}

/** v3.3 creator referral bonus: PROMOTIONS → CREATOR_BALANCE. */
export const referralBonusLines = (cents: number) => move('PROMOTIONS', 'CREATOR_BALANCE', cents);

/**
 * Step 5 — payout: CREATOR_BALANCE → PAYOUT. An instant payout's fee goes to PLATFORM_REVENUE, so the
 * creator receives amount − fee.
 */
export function payoutLines(cents: number, feeCents = 0): LedgerLine[] {
  if (feeCents < 0 || feeCents >= cents) throw new LedgerImbalanceError('Payout fee must be less than the amount');
  return [
    { account: 'CREATOR_BALANCE', debitCents: 0, creditCents: cents },
    { account: 'PAYOUT', debitCents: cents - feeCents, creditCents: 0 },
    { account: 'PLATFORM_REVENUE', debitCents: feeCents, creditCents: 0 },
  ];
}

/** v3.2 brand plan charge: BRAND_CHARGE → PLATFORM_REVENUE (plan price) + GST_PAYABLE (GST on it). */
export const subscriptionLines = (priceCents: number, gstCents: number): LedgerLine[] => [
  { account: 'BRAND_CHARGE', debitCents: 0, creditCents: priceCents + gstCents },
  { account: 'PLATFORM_REVENUE', debitCents: priceCents, creditCents: 0 },
  { account: 'GST_PAYABLE', debitCents: gstCents, creditCents: 0 },
];

/** Dev check (section 9.5 rule 3): every transaction in the ledger sums to zero. Returns the bad txn ids. */
export function findUnbalancedTxns(entries: LedgerEntry[]): string[] {
  const byTxn = new Map<string, number>();
  for (const e of entries) byTxn.set(e.txnId, (byTxn.get(e.txnId) ?? 0) + e.debitCents - e.creditCents);
  return [...byTxn].filter(([, b]) => b !== 0).map(([id]) => id);
}

/** Net balance of one account (debits − credits), optionally for one order. */
export function accountBalance(entries: LedgerEntry[], account: LedgerAccount, orderId?: string): number {
  return entries
    .filter((e) => e.account === account && (!orderId || e.orderId === orderId))
    .reduce((s, e) => s + e.debitCents - e.creditCents, 0);
}
