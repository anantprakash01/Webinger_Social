/**
 * Admin finance dashboard (v3.4): flows and balances from the double-entry ledger, payouts that need
 * attention (failed bank transfers, with retry), and reconciliation of the ledger against payment,
 * payout and subscription records. The backend's hourly job also compares Razorpay's reports.
 */
import type { FinanceOverview, Payout } from '@/types';
import { audit } from '../audit';
import { getDb, now, type Db, type PayoutRow } from '../db';
import { fail, ok, type Handler } from '../http';
import { findUnbalancedTxns, postTxn, type LedgerAccount, type LedgerEntry } from '../ledger';
import { brandTotalCents, type MockOrder } from '../orderMachine';
import { creatorMoney, sendPayout } from '../payoutsCore';

const DAY = 86_400_000;
/** Razorpay refunds payments that stay uncaptured too long; keep holds well inside that. */
export const STALE_AUTH_DAYS = 5;

export const toPayoutApi = (x: PayoutRow): Payout => ({
  id: x.id,
  amountCents: x.amountCents,
  feeCents: x.feeCents ?? 0,
  speed: x.speed ?? 'SCHEDULED',
  destinationLabel: x.destinationLabel ?? 'Bank account',
  status: x.status,
  createdAt: x.createdAt,
  arrivalDate: x.arrivalDate,
  failureReason: x.failureReason ?? null,
});

const net = (entries: LedgerEntry[], account: LedgerAccount, pick: (e: LedgerEntry) => boolean = () => true) =>
  entries.filter((e) => e.account === account && pick(e)).reduce((s, e) => s + e.debitCents - e.creditCents, 0);
const debits = (entries: LedgerEntry[], account: LedgerAccount, pick: (e: LedgerEntry) => boolean = () => true) =>
  entries.filter((e) => e.account === account && pick(e)).reduce((s, e) => s + e.debitCents, 0);
const credits = (entries: LedgerEntry[], account: LedgerAccount, pick: (e: LedgerEntry) => boolean = () => true) =>
  entries.filter((e) => e.account === account && pick(e)).reduce((s, e) => s + e.creditCents, 0);

const inEscrow = (o: MockOrder) => o.status === 'IN_PROGRESS' || o.status === 'DELIVERED' || o.status === 'DISPUTED';

function reconcile(): FinanceOverview['reconciliation'] {
  const db = getDb();
  const L = db.ledgerEntries;
  const byRef = new Map<string, LedgerEntry[]>();
  for (const e of L) byRef.set(e.orderId, [...(byRef.get(e.orderId) ?? []), e]);
  const of = (ref: string) => byRef.get(ref) ?? [];
  const mismatches: FinanceOverview['reconciliation']['mismatches'] = [];
  const checks: FinanceOverview['reconciliation']['checks'] = [];
  const add = (id: string, label: string, okText: string, found: typeof mismatches) => {
    mismatches.push(...found);
    checks.push({ id, label, ok: found.length === 0, detail: found.length === 0 ? okText : `${found.length} mismatch${found.length === 1 ? '' : 'es'}` });
  };

  const unbalanced = findUnbalancedTxns(L);
  add('ledger-balanced', 'Every ledger transaction sums to zero', `${new Set(L.map((e) => e.txnId)).size} transactions`, unbalanced.map((t) => ({ check: 'ledger-balanced', ref: t, expectedCents: 0, actualCents: L.filter((e) => e.txnId === t).reduce((s, e) => s + e.debitCents - e.creditCents, 0), note: 'Debits and credits differ' })));

  const paid = db.orders.filter((o) => o.payment.status === 'CAPTURED' || o.payment.status === 'REFUNDED');
  add(
    'payments-captured',
    'Captured payments match the ledger',
    `${paid.length} captured orders`,
    paid
      .map((o) => ({ o, expected: o.payment.amountCents - o.payment.refundedCents, actual: -net(of(o.id), 'BRAND_CHARGE') }))
      .filter((x) => x.expected !== x.actual)
      .map((x) => ({ check: 'payments-captured', ref: x.o.id, expectedCents: x.expected, actualCents: x.actual, note: 'Brand charge in the ledger differs from the payment record' })),
  );

  add(
    'escrow-open-orders',
    'Escrow equals accepted, unfinished orders',
    `${db.orders.filter(inEscrow).length} orders in escrow`,
    db.orders
      .map((o) => ({ o, expected: inEscrow(o) ? brandTotalCents(o) : 0, actual: net(of(o.id), 'ESCROW') }))
      .filter((x) => x.expected !== x.actual)
      .map((x) => ({ check: 'escrow-open-orders', ref: x.o.id, expectedCents: x.expected, actualCents: x.actual, note: `Order is ${x.o.status.toLowerCase().replace(/_/g, ' ')}` })),
  );

  add(
    'payouts',
    'Payouts match the ledger',
    `${db.payouts.length} payouts`,
    db.payouts
      .map((p) => ({ p, expected: p.status === 'FAILED' ? 0 : p.amountCents - (p.feeCents ?? 0), actual: net(of(`payout_${p.id}`), 'PAYOUT') }))
      .filter((x) => x.expected !== x.actual)
      .map((x) => ({ check: 'payouts', ref: x.p.id, expectedCents: x.expected, actualCents: x.actual, note: 'Payout amount differs from the ledger' })),
  );

  add(
    'subscriptions',
    'Plan invoices match the ledger',
    `${db.subscriptionInvoices.length} invoices`,
    db.subscriptionInvoices
      .map((i) => ({ i, expected: i.priceCents + i.gstCents, actual: credits(of(`sub_${i.id}`), 'BRAND_CHARGE') }))
      .filter((x) => x.expected !== x.actual)
      .map((x) => ({ check: 'subscriptions', ref: x.i.number, expectedCents: x.expected, actualCents: x.actual, note: 'Invoice total differs from the charge' })),
  );

  const sessions = db.paymentSessions.filter((s) => s.purpose === 'ORDER' && s.usedBy);
  add(
    'razorpay-amounts',
    'Razorpay payments match their orders',
    `${sessions.length} Checkout payments`,
    sessions
      .map((s) => ({ s, o: db.orders.find((o) => o.id === s.usedBy) }))
      .filter((x) => x.o && x.o.payment.amountCents !== x.s.amountCents)
      .map((x) => ({ check: 'razorpay-amounts', ref: x.o!.id, expectedCents: x.s.amountCents, actualCents: x.o!.payment.amountCents, note: `Razorpay order ${x.s.razorpayOrderId}` })),
  );

  const t = now().getTime();
  const stale = db.orders.filter((o) => o.status === 'PENDING_ACCEPTANCE' && t - new Date(o.createdAt).getTime() > STALE_AUTH_DAYS * DAY);
  add(
    'stale-authorisations',
    `No payment held uncaptured for more than ${STALE_AUTH_DAYS} days`,
    `${db.orders.filter((o) => o.status === 'PENDING_ACCEPTANCE').length} holds, all recent`,
    stale.map((o) => ({ check: 'stale-authorisations', ref: o.id, expectedCents: 0, actualCents: o.payment.amountCents, note: 'Razorpay may auto-refund it; expire or capture the order' })),
  );

  return { checkedAt: now().toISOString(), ok: mismatches.length === 0, checks, mismatches };
}

export function financeOverview(days: number): FinanceOverview {
  const db = getDb();
  const to = now();
  const from = new Date(to.getTime() - days * DAY);
  const fromIso = from.toISOString();
  const L = db.ledgerEntries.filter((e) => e.createdAt >= fromIso);
  const all = db.ledgerEntries;

  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const inMonth = (m: string) => (e: LedgerEntry) => e.createdAt.slice(0, 7) === m;

  const people = (creatorId: string) => db.creatorProfiles.find((p) => p.userId === creatorId);
  const failed = db.payouts.filter((p) => p.status === 'FAILED').sort((a, b) => Number(!!a.retriedAs) - Number(!!b.retriedAs) || b.createdAt.localeCompare(a.createdAt));
  const transit = db.payouts.filter((p) => p.status === 'IN_TRANSIT');
  const payoutsInPeriod = db.payouts.filter((p) => p.createdAt >= fromIso && p.status !== 'FAILED');

  return {
    days,
    from: fromIso,
    to: to.toISOString(),
    flows: {
      gmvCents: debits(L, 'ESCROW'),
      ordersCaptured: L.filter((e) => e.account === 'ESCROW' && e.debitCents > 0).length,
      subscriptionsCents: credits(L, 'BRAND_CHARGE', (e) => e.orderId.startsWith('sub_')),
      platformRevenueCents: net(L, 'PLATFORM_REVENUE'),
      refundsCents: debits(L, 'BRAND_CHARGE'),
      promotionsCents: -net(L, 'PROMOTIONS') || 0,
      gstCollectedCents: debits(L, 'GST_PAYABLE'),
      taxWithheldCents: debits(L, 'TAX_WITHHELD'),
      paidOutCents: net(L, 'PAYOUT'),
      payoutFeesCents: payoutsInPeriod.reduce((s, p) => s + (p.feeCents ?? 0), 0),
    },
    balances: {
      escrowCents: net(all, 'ESCROW'),
      creatorBalancesCents: net(all, 'CREATOR_BALANCE'),
      gstPayableCents: net(all, 'GST_PAYABLE'),
      taxWithheldCents: net(all, 'TAX_WITHHELD'),
      authorisedHoldsCents: db.orders.filter((o) => o.status === 'PENDING_ACCEPTANCE').reduce((s, o) => s + o.payment.amountCents, 0),
    },
    byMonth: months.map((m) => ({ month: m, gmvCents: debits(all, 'ESCROW', inMonth(m)), revenueCents: net(all, 'PLATFORM_REVENUE', inMonth(m)), refundsCents: debits(all, 'BRAND_CHARGE', inMonth(m)) })),
    payoutsNeedingAttention: failed.map((p) => ({
      ...toPayoutApi(p),
      creatorName: people(p.creatorId)?.displayName ?? 'Creator',
      creatorUsername: people(p.creatorId)?.username ?? null,
      accountStatus: db.payoutAccounts.find((a) => a.creatorId === p.creatorId)?.status ?? null,
      retriedAs: p.retriedAs ?? null,
    })),
    inTransit: { count: transit.length, cents: transit.reduce((s, p) => s + p.amountCents - (p.feeCents ?? 0), 0) },
    reconciliation: reconcile(),
  };
}

export const getFinanceOverview: Handler = ({ req, user }) => {
  if (user.role !== 'ADMIN') fail(403, 'Admins only.', 'ROLE_NOT_ALLOWED');
  const days = Math.min(365, Math.max(1, Number(req.query.get('days') ?? 30) || 30));
  return ok(financeOverview(days));
};

/** Marks a payout FAILED and returns the money to the creator's balance (PAYOUT → CREATOR_BALANCE). */
export function failPayout(db: Db, p: PayoutRow, reason: string, txnId: string, at: Date) {
  p.status = 'FAILED';
  p.failureReason = reason;
  const back = p.amountCents - (p.feeCents ?? 0);
  const lines = [
    { account: 'PAYOUT' as const, debitCents: 0, creditCents: back },
    { account: 'PLATFORM_REVENUE' as const, debitCents: 0, creditCents: p.feeCents ?? 0 },
    { account: 'CREATOR_BALANCE' as const, debitCents: p.amountCents, creditCents: 0 },
  ];
  const entries = postTxn(lines, { txnId, orderId: `payout_${p.id}`, memo: 'Payout failed — returned to balance', at: at.toISOString() });
  db.ledgerEntries.push(...entries);
  return entries;
}

export const retryPayout: Handler = ({ params, user }) => {
  if (user.role !== 'ADMIN') fail(403, 'Admins only.', 'ROLE_NOT_ALLOWED');
  const db = getDb();
  const p = db.payouts.find((x) => x.id === params.id);
  if (!p) fail(404, 'No such payout.', 'NOT_FOUND');
  if (p.status !== 'FAILED') fail(409, 'Only failed payouts can be retried.', 'NOT_FAILED');
  if (p.retriedAs) fail(409, 'This payout was already retried.', 'ALREADY_RETRIED');
  const account = db.payoutAccounts.find((a) => a.creatorId === p.creatorId);
  if (!account || account.status !== 'VERIFIED') fail(409, 'The creator must update and verify their payout account first.', 'PAYOUT_ACCOUNT_NOT_VERIFIED');
  if (creatorMoney(p.creatorId).availableCents < p.amountCents) fail(409, 'The creator’s balance is now lower than this payout (they may have withdrawn).', 'INSUFFICIENT_BALANCE');
  const next = sendPayout(p.creatorId, account, p.amountCents, 0, 'STANDARD', user);
  p.retriedAs = next.id;
  audit(user, { action: 'PAYOUT_RETRIED', entityType: 'PAYOUT', entityId: p.id, summary: `Failed payout retried as ${next.id} to ${next.destinationLabel}`, before: { status: 'FAILED', failureReason: p.failureReason }, after: { retriedAs: next.id } });
  return ok(toPayoutApi(next));
};

