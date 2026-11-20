/**
 * Double-entry ledger for the mock (section 4.1). Same accounts and rules as the backend LedgerService.
 *
 * Every transaction is a set of entries whose debits equal its credits. Money "moves from A to B"
 * as a credit on A and a debit on B. A transaction that does not balance throws, so a bug in the
 * mock shows up immediately instead of as a wrong balance in a demo.
 */
import { assertCents } from '@/lib/money';

export type LedgerAccount = 'BRAND_CHARGE' | 'ESCROW' | 'PLATFORM_REVENUE' | 'CREATOR_BALANCE' | 'PAYOUT';

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

/** Step 2 — creator accepts, card captured: BRAND_CHARGE → ESCROW (price + brand fee). */
export const captureLines = (brandTotalCents: number) => move('BRAND_CHARGE', 'ESCROW', brandTotalCents);

/** Step 4 — approval or auto-approval: ESCROW → PLATFORM_REVENUE (both fees) + CREATOR_BALANCE (price − creator fee). */
export function releaseLines(o: { escrowCents: number; creatorPayoutCents: number }): LedgerLine[] {
  const platform = o.escrowCents - o.creatorPayoutCents;
  if (platform < 0) throw new LedgerImbalanceError('Creator payout exceeds escrow');
  return [
    { account: 'ESCROW', debitCents: 0, creditCents: o.escrowCents },
    { account: 'PLATFORM_REVENUE', debitCents: platform, creditCents: 0 },
    { account: 'CREATOR_BALANCE', debitCents: o.creatorPayoutCents, creditCents: 0 },
  ];
}

/** Step 6 — dispute ruled for the brand: ESCROW → BRAND_CHARGE for the refunded part. */
export const refundLines = (refundCents: number) => move('ESCROW', 'BRAND_CHARGE', refundCents);

/** Step 5 — bank payout: CREATOR_BALANCE → PAYOUT. */
export const payoutLines = (cents: number) => move('CREATOR_BALANCE', 'PAYOUT', cents);

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
