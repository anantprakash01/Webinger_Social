/**
 * Creator balances and payouts (FR-63; v2.0 India / Razorpay).
 * Approval credits CREATOR_BALANCE (a Razorpay Route transfer released from hold). Money leaves as a
 * RazorpayX payout: every Monday 00:00 UTC for creators with the weekly payout on, or on request
 * (standard or instant). CREATOR_BALANCE → PAYOUT (+ PLATFORM_REVENUE for an instant fee), referenced as
 * `payout_<id>`.
 */
import { deliver } from './deliver';
import { auditLedger } from './audit';
import { getDb, now, ulid, type PayoutAccountRow, type PayoutRow, type UserRow } from './db';
import { payoutLines, postTxn, type LedgerEntry } from './ledger';
import { bankNameFor } from './seed/payments';
import { creatorPayoutCents } from './orderMachine';

const DAY = 86_400_000;

/** Every CREATOR_BALANCE entry that belongs to this creator: order releases and payouts. */
export function creatorBalanceEntries(creatorId: string): LedgerEntry[] {
  const db = getDb();
  const refs = new Set([...db.orders.filter((o) => o.creatorUserId === creatorId).map((o) => o.id), ...db.payouts.filter((p) => p.creatorId === creatorId).map((p) => `payout_${p.id}`)]);
  // v3.3 referral bonuses are referenced as ref_<referrer>_<referee>.
  return db.ledgerEntries.filter((e) => e.account === 'CREATOR_BALANCE' && (refs.has(e.orderId) || e.orderId.startsWith(`ref_${creatorId}_`)));
}

export function creatorMoney(creatorId: string) {
  const entries = creatorBalanceEntries(creatorId);
  const db = getDb();
  return {
    availableCents: entries.reduce((s, e) => s + e.debitCents - e.creditCents, 0),
    lifetimeEarnedCents: entries.filter((e) => !e.orderId.startsWith('payout_')).reduce((s, e) => s + e.debitCents, 0),
    paidOutCents: db.payouts.filter((p) => p.creatorId === creatorId && p.status !== 'FAILED').reduce((s, p) => s + p.amountCents, 0),
    inEscrowCents: db.orders
      .filter((o) => o.creatorUserId === creatorId && (o.status === 'IN_PROGRESS' || o.status === 'DELIVERED' || o.status === 'DISPUTED'))
      .reduce((s, o) => s + creatorPayoutCents(o), 0),
  };
}

/** "HDFC Bank •••• 4321" or the UPI ID. */
export const destinationOf = (a: Pick<PayoutAccountRow, 'method' | 'ifsc' | 'accountNumber' | 'vpa'>) =>
  a.method === 'UPI' ? a.vpa! : `${bankNameFor(a.ifsc)} •••• ${(a.accountNumber ?? '').slice(-4)}`;

/** The first Monday 00:00 UTC strictly after `t`. */
export function nextMonday(t: Date): Date {
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const days = ((8 - d.getUTCDay()) % 7) || 7;
  return new Date(d.getTime() + days * DAY);
}

const ARRIVAL_MS = { SCHEDULED: DAY, STANDARD: DAY, INSTANT: 5 * 60_000 } as const;

/** One RazorpayX payout from the balance; writes the ledger, the audit entry and a notification. */
export function sendPayout(creatorId: string, account: PayoutAccountRow, amountCents: number, feeCents: number, speed: NonNullable<PayoutRow['speed']>, actor: UserRow | null, at = now()): PayoutRow {
  const db = getDb();
  const t = now();
  const arrival = new Date(at.getTime() + ARRIVAL_MS[speed]);
  const payout: PayoutRow = {
    id: `pout_mock${ulid(at.getTime() + db.payouts.length).slice(-10).toLowerCase()}`,
    creatorId,
    amountCents,
    feeCents,
    speed,
    destinationLabel: destinationOf(account),
    status: arrival <= t ? 'PAID' : 'IN_TRANSIT',
    createdAt: at.toISOString(),
    arrivalDate: arrival.toISOString(),
  };
  db.payouts.push(payout);
  const memo = speed === 'SCHEDULED' ? 'Weekly payout' : speed === 'INSTANT' ? 'Instant withdrawal' : 'Withdrawal';
  const entries = postTxn(payoutLines(amountCents, feeCents), { txnId: ulid(t.getTime() + db.payouts.length), orderId: `payout_${payout.id}`, memo, at: payout.createdAt });
  db.ledgerEntries.push(...entries);
  auditLedger(entries, actor);
  const when = speed === 'INSTANT' ? 'in a few minutes' : 'by the next working day';
  deliver(creatorId, { type: 'PAYOUT_SENT', title: speed === 'SCHEDULED' ? 'Weekly payout on its way' : 'Withdrawal on its way', body: `Sent to ${payout.destinationLabel}; it arrives ${when}.`, link: '/creator/payouts' }, 'PAYOUTS');
  return payout;
}

/** Scheduled job: marks arrived payouts PAID and, at each Monday boundary, pays out weekly balances. */
export function runPayouts(): number {
  const db = getDb();
  const t = now();
  let made = 0;
  for (const p of db.payouts) if (p.status === 'IN_TRANSIT' && new Date(p.arrivalDate) <= t) p.status = 'PAID';
  const boundary = nextMonday(new Date(db.lastPayoutRunAt));
  if (boundary > t) return 0;
  for (const c of db.creatorProfiles) {
    if (c.payoutStatus !== 'ENABLED' || c.autoWeekly === false) continue;
    const account = db.payoutAccounts.find((a) => a.creatorId === c.userId && a.status === 'VERIFIED');
    if (!account) continue;
    const { availableCents } = creatorMoney(c.userId);
    if (availableCents <= 0) continue;
    sendPayout(c.userId, account, availableCents, 0, 'SCHEDULED', null, boundary);
    made += 1;
  }
  db.lastPayoutRunAt = t.toISOString();
  return made;
}
