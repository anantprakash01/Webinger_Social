/**
 * Creator payouts mock (FR-62, FR-63; v2.0 India / Razorpay).
 *
 * Real flow: the creator's PAN and bank account (or UPI ID) create a Razorpay Route linked account and a
 * RazorpayX fund account; the destination is verified (penny drop / VPA check). Approved work is a Route
 * transfer released from hold into the balance; money leaves the balance as a RazorpayX payout, either on
 * the weekly schedule or on request (standard NEFT, free; instant IMPS/UPI, 1% fee, at least ₹10).
 *
 * The mock verifies at once. Test outcomes: account number 000000000 / UPI ID ending @fail → FAILED.
 */
import { toPayoutApi } from './finance';
import {
  instantFee,
  INSTANT_FEE_BPS,
  INSTANT_FEE_MIN_CENTS,
  MIN_WITHDRAWAL_CENTS,
  payoutAccountInputSchema,
  payoutSettingsSchema,
  withdrawalRequestSchema,
} from '@/features/payments/schemas';
import type { PayoutAccount, PayoutOverview } from '@/types';
import { getDb, now, randomToken, type PayoutAccountRow, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';
import { bankNameFor } from '../seed/payments';
import { creatorMoney, destinationOf, nextMonday, sendPayout } from '../payoutsCore';
import { myProfile } from './creatorMe';

const toAccount = (a: PayoutAccountRow): PayoutAccount => ({
  method: a.method,
  holderName: a.holderName,
  panMasked: `${a.pan.slice(0, 5)}••••${a.pan.slice(-1)}`,
  destinationLabel: destinationOf(a),
  status: a.status,
  failureReason: a.failureReason,
  updatedAt: a.updatedAt,
  gstin: a.gstin ?? null,
});

export const getPayoutAccount: Handler = ({ user }) => {
  const p = myProfile(user);
  const a = getDb().payoutAccounts.find((x) => x.creatorId === p.userId);
  return ok(a ? toAccount(a) : null);
};

export const savePayoutAccount: Handler = ({ req, user }) => {
  const p = myProfile(user);
  const body = parseBody(payoutAccountInputSchema, req.body);
  const db = getDb();
  const failed =
    body.method === 'BANK_ACCOUNT' ? /^0+$/.test(body.accountNumber ?? '') : (body.vpa ?? '').endsWith('@fail');
  const row: PayoutAccountRow = {
    creatorId: p.userId,
    method: body.method,
    holderName: body.holderName,
    pan: body.pan,
    accountNumber: body.method === 'BANK_ACCOUNT' ? body.accountNumber! : null,
    ifsc: body.method === 'BANK_ACCOUNT' ? body.ifsc! : null,
    vpa: body.method === 'UPI' ? body.vpa! : null,
    gstin: body.gstin ?? null,
    status: failed ? 'FAILED' : 'VERIFIED',
    failureReason: failed
      ? body.method === 'BANK_ACCOUNT'
        ? `${bankNameFor(body.ifsc ?? null)} could not confirm this account. Check the account number and IFSC.`
        : 'This UPI ID could not be verified. Check it in your UPI app.'
      : null,
    updatedAt: now().toISOString(),
  };
  const i = db.payoutAccounts.findIndex((x) => x.creatorId === p.userId);
  if (i >= 0) db.payoutAccounts[i] = row;
  else db.payoutAccounts.push(row);
  p.stripeAccountId ??= `acc_mock${randomToken(6)}`; // Razorpay Route linked account
  p.payoutStatus = failed ? 'PENDING' : 'ENABLED';
  return ok(toAccount(row));
};

/** Indian financial year (1 April – 31 March) of a date, e.g. "2026-27". */
export function financialYear(d: Date): { label: string; start: Date } {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return { label: `${y}-${String((y + 1) % 100).padStart(2, '0')}`, start: new Date(Date.UTC(y, 3, 1)) };
}

/** TDS (194-O) and TCS (s.52) withheld from this creator on orders released this financial year. */
function taxWithheldThisYear(creatorId: string) {
  const db = getDb();
  const fy = financialYear(now());
  const released = db.orders.filter((o) => o.creatorUserId === creatorId && (o.status === 'COMPLETED' || (o.status === 'REFUNDED' && o.payment.refundedCents < o.payment.amountCents)) && new Date(o.updatedAt) >= fy.start);
  return {
    financialYear: fy.label,
    tdsWithheldCents: released.reduce((s, o) => s + (o.taxes?.tdsCents ?? 0), 0),
    tcsWithheldCents: released.reduce((s, o) => s + (o.taxes?.tcsCents ?? 0), 0),
  };
}

function overview(user: UserRow): PayoutOverview {
  const p = myProfile(user);
  const db = getDb();
  const money = creatorMoney(p.userId);
  const mine = new Set(db.orders.filter((o) => o.creatorUserId === p.userId).map((o) => o.id));
  const account = db.payoutAccounts.find((x) => x.creatorId === p.userId);
  return {
    currency: 'INR',
    availableCents: money.availableCents,
    inEscrowCents: money.inEscrowCents,
    lifetimeEarnedCents: money.lifetimeEarnedCents,
    paidOutCents: money.paidOutCents,
    nextPayoutAt: nextMonday(now()).toISOString(),
    schedule: 'WEEKLY_MONDAY',
    payoutStatus: p.payoutStatus,
    transfers: db.ledgerEntries
      .filter((e) => e.account === 'CREATOR_BALANCE' && e.debitCents > 0 && mine.has(e.orderId))
      .map((e) => ({ orderId: e.orderId, orderTitle: db.orderInfo.find((i) => i.orderId === e.orderId)?.title ?? 'Order', amountCents: e.debitCents, at: e.createdAt }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    payouts: db.payouts
      .filter((x) => x.creatorId === p.userId)
      .map(toPayoutApi)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    account: account ? toAccount(account) : null,
    autoWeekly: p.autoWeekly ?? true,
    minWithdrawalCents: MIN_WITHDRAWAL_CENTS,
    instantFeeBps: INSTANT_FEE_BPS,
    instantFeeMinCents: INSTANT_FEE_MIN_CENTS,
    ...taxWithheldThisYear(p.userId),
  };
}

/** FR-63: balance, transfers (approved work), payouts, account and settings. */
export const getPayoutBalance: Handler = ({ user }) => ok(overview(user));

export const updatePayoutSettings: Handler = ({ req, user }) => {
  const p = myProfile(user);
  p.autoWeekly = parseBody(payoutSettingsSchema, req.body).autoWeekly;
  return ok(overview(user));
};

/** Withdraw now: standard (NEFT, free, next working day) or instant (IMPS/UPI, fee, minutes). */
export const createWithdrawal: Handler = ({ req, user }) => {
  const p = myProfile(user);
  const body = parseBody(withdrawalRequestSchema, req.body);
  const account = getDb().payoutAccounts.find((x) => x.creatorId === p.userId);
  if (!account || account.status !== 'VERIFIED') fail(409, 'Add and verify a payout account first.', 'PAYOUT_ACCOUNT_REQUIRED');
  const { availableCents } = creatorMoney(p.userId);
  if (body.amountCents > availableCents)
    fail(422, 'That is more than your available balance.', 'VALIDATION_FAILED', [{ field: 'amountCents', message: 'That is more than your available balance.' }]);
  const fee = body.speed === 'INSTANT' ? instantFee(body.amountCents) : 0;
  const payout = sendPayout(p.userId, account, body.amountCents, fee, body.speed, user);
  const view = overview(user).payouts.find((x) => x.id === payout.id)!;
  return ok(view, 201);
};
