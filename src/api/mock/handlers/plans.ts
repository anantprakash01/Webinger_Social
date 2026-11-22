/**
 * Brand plans and subscriptions (FR-66, contract v3.2). Fees per plan come from fee_configs (FR-83);
 * prices, limits and features from src/lib/plans.ts. Subscriptions stand in for Razorpay Subscriptions:
 * the first charge (and upgrades) are paid in Checkout; renewals charge the saved method automatically.
 *
 * Money: each charge is one ledger transaction BRAND_CHARGE → PLATFORM_REVENUE (plan price) + GST_PAYABLE
 * (18% GST), referenced as `sub_<invoiceId>`. No proration in MVP: an upgrade starts a new period today.
 */
import { subscriptionRequestSchema } from '@/features/plans/schemas';
import { PLAN_ORDER, PLANS, planPriceCents, type BillingCycle, type BrandPlan } from '@/lib/plans';
import type { BrandSubscription, FeeConfigEntry, PlanOffer, PublicFees, SubscriptionInvoice } from '@/types';
import { auditLedger } from '../audit';
import { deliver } from '../deliver';
import { getDb, now, ulid, type FeeConfigRow, type SubscriptionInvoiceRow, type SubscriptionRow, type UserRow } from '../db';
import { applyBps } from '../fees';
import { fail, ok, parseBody, type Handler } from '../http';
import { postTxn, subscriptionLines } from '../ledger';
import { GST_BPS, PLATFORM_STATE } from '../tax';
import { inquiryAllowance } from './chat';
import { resolvePayment } from './payments';


/* ---------- Fees per plan ---------- */

/** The newest fee_configs row for the plan (FR-83); falls back to the plan's defaults. */
export function feeConfigFor(plan: BrandPlan): FeeConfigRow {
  const rows = getDb().feeConfigs.filter((r) => (r.plan ?? 'FREE') === plan);
  if (rows.length) return rows[rows.length - 1];
  const free = getDb().feeConfigs.filter((r) => (r.plan ?? 'FREE') === 'FREE');
  return { plan, brandFeeBps: PLANS[plan].defaultBrandFeeBps, creatorFeeBps: free[free.length - 1]?.creatorFeeBps ?? 1500, effectiveFrom: new Date(0).toISOString(), changedBy: null };
}

export const planOf = (brandUserId: string): BrandPlan => getDb().brandProfiles.find((b) => b.userId === brandUserId)?.plan ?? 'FREE';

export const toFeeEntry = (r: FeeConfigRow): FeeConfigEntry => ({
  plan: (r.plan ?? 'FREE') as BrandPlan,
  brandFeeBps: r.brandFeeBps,
  creatorFeeBps: r.creatorFeeBps,
  effectiveFrom: r.effectiveFrom,
  changedBy: r.changedBy ? (getDb().users.find((u) => u.id === r.changedBy)?.name ?? null) : null,
});

export const planOffers = (): PlanOffer[] =>
  PLAN_ORDER.map((p) => {
    const f = feeConfigFor(p);
    const info = PLANS[p];
    return { plan: p, name: info.name, tagline: info.tagline, monthlyCents: info.monthlyCents, yearlyCents: info.yearlyCents, gstBps: GST_BPS, brandFeeBps: f.brandFeeBps, creatorFeeBps: f.creatorFeeBps, inquiryLimit: info.inquiryLimit, features: info.features };
  });

export const getPublicFees: Handler = () => {
  const f = feeConfigFor('FREE');
  const body: PublicFees = { plan: 'FREE', brandFeeBps: f.brandFeeBps, creatorFeeBps: f.creatorFeeBps, plans: planOffers() };
  return ok(body);
};

/* ---------- Subscriptions ---------- */

const rank = (p: BrandPlan) => PLAN_ORDER.indexOf(p);
const addPeriod = (from: Date, cycle: BillingCycle) => {
  const d = new Date(from);
  if (cycle === 'YEARLY') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
};
const gstOn = (cents: number) => applyBps(cents, GST_BPS);
/** Indian financial year label, e.g. 2026-27 (April to March). */
const fy = (d: Date) => {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

function requireBrand(user: UserRow) {
  if (user.role !== 'BRAND') fail(403, 'Plans are for brand accounts.', 'ROLE_NOT_ALLOWED');
}

const subOf = (userId: string) => getDb().subscriptions.find((s) => s.brandUserId === userId) ?? null;

/** Charges a plan period: invoice, ledger, audit. */
function charge(user: UserRow | null, brandUserId: string, plan: BrandPlan, cycle: BillingCycle, kind: SubscriptionInvoiceRow['kind'], methodLabel: string, start: Date): SubscriptionInvoiceRow {
  const db = getDb();
  const price = planPriceCents(plan, cycle);
  const gst = gstOn(price);
  const state = db.brandProfiles.find((b) => b.userId === brandUserId)?.state;
  const seq = db.subscriptionInvoices.length + 1;
  const inv: SubscriptionInvoiceRow = {
    id: `sinv_${ulid(start.getTime()).slice(-12).toLowerCase()}`,
    number: `WC/${fy(start)}/S${String(seq).padStart(4, '0')}`,
    brandUserId,
    plan,
    cycle,
    periodStart: start.toISOString(),
    periodEnd: addPeriod(start, cycle).toISOString(),
    priceCents: price,
    gstCents: gst,
    intraState: !state || state === PLATFORM_STATE,
    methodLabel,
    kind,
    createdAt: start.toISOString(),
  };
  db.subscriptionInvoices.push(inv);
  const entries = postTxn(subscriptionLines(price, gst), { txnId: ulid(start.getTime() + seq), orderId: `sub_${inv.id}`, memo: `${PLANS[plan].name} plan (${cycle.toLowerCase()})`, at: inv.createdAt });
  db.ledgerEntries.push(...entries);
  auditLedger(entries, user);
  return inv;
}

const toInvoice = (i: SubscriptionInvoiceRow): SubscriptionInvoice => ({
  id: i.id,
  number: i.number,
  plan: i.plan,
  cycle: i.cycle,
  periodStart: i.periodStart,
  periodEnd: i.periodEnd,
  priceCents: i.priceCents,
  gstCents: i.gstCents,
  totalCents: i.priceCents + i.gstCents,
  intraState: i.intraState,
  methodLabel: i.methodLabel,
  kind: i.kind,
  createdAt: i.createdAt,
});

export function subscriptionView(user: UserRow): BrandSubscription {
  const db = getDb();
  const s = subOf(user.id);
  const plan = planOf(user.id);
  const nextPlan = s && !s.cancelAtPeriodEnd ? (s.nextPlan ?? s.plan) : null;
  const nextCycle = s && !s.cancelAtPeriodEnd ? (s.nextCycle ?? s.cycle) : null;
  const renewal = nextPlan && nextCycle ? planPriceCents(nextPlan, nextCycle) : null;
  return {
    plan,
    cycle: s?.cycle ?? null,
    status: !s ? 'FREE' : s.cancelAtPeriodEnd ? 'CANCELLING' : 'ACTIVE',
    currentPeriodStart: s?.periodStart ?? null,
    currentPeriodEnd: s?.periodEnd ?? null,
    cancelAtPeriodEnd: s?.cancelAtPeriodEnd ?? false,
    nextPlan: s && s.nextPlan && s.nextPlan !== s.plan ? s.nextPlan : null,
    nextCycle: s && s.nextCycle && s.nextCycle !== s.cycle ? s.nextCycle : null,
    renewalCents: renewal !== null ? renewal + gstOn(renewal) : null,
    methodLabel: s?.methodLabel ?? null,
    brandFeeBps: feeConfigFor(plan).brandFeeBps,
    inquiries: inquiryAllowance(user),
    invoices: db.subscriptionInvoices
      .filter((i) => i.brandUserId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toInvoice),
  };
}

function setPlan(brandUserId: string, plan: BrandPlan) {
  const b = getDb().brandProfiles.find((x) => x.userId === brandUserId);
  if (b) b.plan = plan;
}

export const getMySubscription: Handler = ({ user }) => {
  requireBrand(user);
  return ok(subscriptionView(user));
};

export const changeMySubscription: Handler = ({ req, user }) => {
  requireBrand(user);
  const body = parseBody(subscriptionRequestSchema, req.body);
  const db = getDb();
  const s = subOf(user.id);
  const current = planOf(user.id);
  if (body.plan === 'FREE') fail(422, 'To go back to Free, cancel your plan; it stays active until the period ends.', 'USE_CANCEL', [{ field: 'plan', message: 'Cancel instead.' }]);

  // A lower plan, or monthly instead of yearly, waits for the end of the period (nothing is charged now).
  const lower = s && (rank(body.plan) < rank(current) || (body.plan === current && body.cycle === 'MONTHLY' && s.cycle === 'YEARLY'));
  if (s && lower) {
    Object.assign(s, { nextPlan: body.plan, nextCycle: body.cycle, cancelAtPeriodEnd: false });
    return ok(subscriptionView(user));
  }
  if (s && body.plan === current && body.cycle === s.cycle) {
    if (!s.cancelAtPeriodEnd && !s.nextPlan && !s.nextCycle) fail(409, `You are already on ${PLANS[current].name} (${body.cycle.toLowerCase()}).`, 'ALREADY_ON_PLAN');
    Object.assign(s, { cancelAtPeriodEnd: false, nextPlan: null, nextCycle: null });
    return ok(subscriptionView(user));
  }

  // New subscription or upgrade: paid now, new period from today.
  if (!user.emailVerifiedAt) fail(403, 'Verify your email before subscribing.', 'EMAIL_NOT_VERIFIED');
  const price = planPriceCents(body.plan, body.cycle);
  const pay = resolvePayment(user, body.payment, price + gstOn(price), 'SUBSCRIPTION');
  const t = now();
  const inv = charge(user, user.id, body.plan, body.cycle, s ? 'UPGRADE' : 'NEW', pay.info.methodLabel, t);
  pay.commit(inv.id);
  const row: SubscriptionRow = { brandUserId: user.id, plan: body.plan, cycle: body.cycle, periodStart: inv.periodStart, periodEnd: inv.periodEnd, cancelAtPeriodEnd: false, nextPlan: null, nextCycle: null, methodLabel: pay.info.methodLabel };
  if (s) Object.assign(s, row);
  else db.subscriptions.push(row);
  setPlan(user.id, body.plan);
  deliver(user.id, { type: 'PLAN_CHANGED', title: `You're on ${PLANS[body.plan].name}`, body: `Service fee on new orders is now ${feeConfigFor(body.plan).brandFeeBps / 100}%. Invoice ${inv.number}.`, link: '/brand/plan' }, 'ACCOUNT');
  return ok(subscriptionView(user));
};

export const cancelMySubscription: Handler = ({ user }) => {
  requireBrand(user);
  const s = subOf(user.id);
  if (!s) fail(409, 'You are on the Free plan.', 'NO_SUBSCRIPTION');
  if (s.cancelAtPeriodEnd) fail(409, 'Your plan is already set to end.', 'ALREADY_CANCELLING');
  Object.assign(s, { cancelAtPeriodEnd: true, nextPlan: null, nextCycle: null });
  return ok(subscriptionView(user));
};

export const resumeMySubscription: Handler = ({ user }) => {
  requireBrand(user);
  const s = subOf(user.id);
  if (!s || (!s.cancelAtPeriodEnd && !s.nextPlan && !s.nextCycle)) fail(409, 'There is nothing to undo.', 'NOTHING_TO_RESUME');
  Object.assign(s, { cancelAtPeriodEnd: false, nextPlan: null, nextCycle: null });
  return ok(subscriptionView(user));
};

/**
 * Scheduled job: at the end of each period, end cancelled plans (back to Free) or renew — switching to a
 * scheduled lower plan or cycle — and charge the saved method.
 */
export function runSubscriptions(): number {
  const db = getDb();
  const t = now();
  let changed = 0;
  for (const s of [...db.subscriptions]) {
    let guard = 0;
    while (new Date(s.periodEnd) <= t && guard++ < 36) {
      changed += 1;
      if (s.cancelAtPeriodEnd) {
        db.subscriptions.splice(db.subscriptions.indexOf(s), 1);
        setPlan(s.brandUserId, 'FREE');
        deliver(s.brandUserId, { type: 'PLAN_CHANGED', title: 'You are back on the Free plan', body: `Your ${PLANS[s.plan].name} plan ended. The service fee on new orders is ${feeConfigFor('FREE').brandFeeBps / 100}% again.`, link: '/brand/plan' }, 'ACCOUNT');
        break;
      }
      const plan = s.nextPlan ?? s.plan;
      const cycle = s.nextCycle ?? s.cycle;
      const inv = charge(null, s.brandUserId, plan, cycle, 'RENEWAL', s.methodLabel, new Date(s.periodEnd));
      Object.assign(s, { plan, cycle, periodStart: inv.periodStart, periodEnd: inv.periodEnd, nextPlan: null, nextCycle: null });
      setPlan(s.brandUserId, plan);
      deliver(s.brandUserId, { type: 'PLAN_CHANGED', title: `${PLANS[plan].name} plan renewed`, body: `Charged ${((inv.priceCents + inv.gstCents) / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} to ${s.methodLabel}. Invoice ${inv.number}.`, link: '/brand/plan' }, 'ACCOUNT');
    }
  }
  return changed;
}

