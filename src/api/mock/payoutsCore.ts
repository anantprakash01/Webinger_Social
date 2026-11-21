/**
 * Creator balances and weekly bank payouts (FR-63).
 * Approval credits CREATOR_BALANCE (the Stripe Transfer); every Monday 00:00 UTC the available balance
 * is paid out: CREATOR_BALANCE → PAYOUT, referenced as `payout_<id>`. Arrives 2 days later.
 */
import { auditLedger } from './audit';
import { getDb, now, ulid, type PayoutRow } from './db';
import { payoutLines, postTxn, type LedgerEntry } from './ledger';

const DAY = 86_400_000;

/** Every CREATOR_BALANCE entry that belongs to this creator: order releases and payouts. */
export function creatorBalanceEntries(creatorId: string): LedgerEntry[] {
  const db = getDb();
  const refs = new Set([...db.orders.filter((o) => o.creatorUserId === creatorId).map((o) => o.id), ...db.payouts.filter((p) => p.creatorId === creatorId).map((p) => `payout_${p.id}`)]);
  return db.ledgerEntries.filter((e) => e.account === 'CREATOR_BALANCE' && refs.has(e.orderId));
}

export function creatorMoney(creatorId: string) {
  const entries = creatorBalanceEntries(creatorId);
  const db = getDb();
  return {
    availableCents: entries.reduce((s, e) => s + e.debitCents - e.creditCents, 0),
    lifetimeEarnedCents: entries.filter((e) => !e.orderId.startsWith('payout_')).reduce((s, e) => s + e.debitCents, 0),
    paidOutCents: db.payouts.filter((p) => p.creatorId === creatorId).reduce((s, p) => s + p.amountCents, 0),
    inEscrowCents: db.orders
      .filter((o) => o.creatorUserId === creatorId && (o.status === 'IN_PROGRESS' || o.status === 'DELIVERED' || o.status === 'DISPUTED'))
      .reduce((s, o) => s + o.priceCents - o.creatorFeeCents, 0),
  };
}

/** The first Monday 00:00 UTC strictly after `t`. */
export function nextMonday(t: Date): Date {
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const days = ((8 - d.getUTCDay()) % 7) || 7;
  return new Date(d.getTime() + days * DAY);
}

/** Scheduled job: pays out every creator balance at each Monday boundary crossed since the last run. */
export function runPayouts(): number {
  const db = getDb();
  const t = now();
  let made = 0;
  for (const p of db.payouts) if (p.status === 'IN_TRANSIT' && new Date(p.arrivalDate) <= t) p.status = 'PAID';
  const boundary = nextMonday(new Date(db.lastPayoutRunAt));
  if (boundary > t) return 0;
  for (const c of db.creatorProfiles) {
    if (c.payoutStatus !== 'ENABLED') continue;
    const { availableCents } = creatorMoney(c.userId);
    if (availableCents <= 0) continue;
    const payout: PayoutRow = {
      id: `po_mock${ulid(boundary.getTime()).slice(-10).toLowerCase()}`,
      creatorId: c.userId,
      amountCents: availableCents,
      status: boundary.getTime() + 2 * DAY <= t.getTime() ? 'PAID' : 'IN_TRANSIT',
      createdAt: boundary.toISOString(),
      arrivalDate: new Date(boundary.getTime() + 2 * DAY).toISOString(),
    };
    db.payouts.push(payout);
    const entries = postTxn(payoutLines(availableCents), { txnId: ulid(t.getTime()), orderId: `payout_${payout.id}`, memo: 'Weekly payout to bank', at: payout.createdAt });
    db.ledgerEntries.push(...entries);
    auditLedger(entries, null);
    db.notifications.unshift({
      id: ulid(t.getTime()),
      userId: c.userId,
      type: 'PAYOUT_SENT',
      title: 'Payout on its way',
      body: `Your weekly payout was sent to your bank and arrives in about 2 days.`,
      link: '/creator/payouts',
      readAt: null,
      createdAt: t.toISOString(),
    });
    made += 1;
  }
  db.lastPayoutRunAt = t.toISOString();
  return made;
}
