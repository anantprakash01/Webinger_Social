/**
 * Promo codes and referral credits (v3.3). Both are platform-funded discounts on the brand's payment:
 * the order still carries its full total, fees and creator payout; the brand pays total − discount and
 * the ledger's PROMOTIONS account funds the rest into escrow at capture (see captureLines).
 *
 * Credits are promotional only: they reduce order prices, cannot be bought, withdrawn or transferred
 * (so they are not a prepaid wallet).
 */
import { promoCodeInputSchema } from '@/features/promos/schemas';
import { formatMoney } from '@/lib/money';
import type { CreditEntry, PromoCode, ReferralInvite, ReferralOverview } from '@/types';
import { audit, auditLedger } from '../audit';
import { deliver } from '../deliver';
import { getDb, now, ulid, type CreditRow, type PromoCodeRow, type UserRow } from '../db';
import { applyBps } from '../fees';
import { fail, ok, parseBody, type Handler } from '../http';
import { postTxn, referralBonusLines } from '../ledger';
import { brandPaidCents, MIN_CHARGE_CENTS, type MockOrder, type OrderDiscount } from '../orderMachine';

export const REFERRAL = { brandWelcomeCents: 500_00, brandRewardCents: 1_000_00, creatorRewardCents: 500_00 } as const;

/* ---------- Credits ---------- */

export const creditBalance = (userId: string) => getDb().credits.filter((c) => c.userId === userId).reduce((s, c) => s + c.deltaCents, 0);

function addCredit(userId: string, deltaCents: number, reason: CreditRow['reason'], note: string, orderId: string | null = null) {
  getDb().credits.push({ id: ulid(now().getTime()), userId, deltaCents, reason, note, orderId, createdAt: now().toISOString() });
}

/* ---------- Promo codes ---------- */

const today = () => now().toISOString().slice(0, 10);

function promoStatus(p: PromoCodeRow): PromoCode['status'] {
  if (p.validUntil && p.validUntil < today()) return 'EXPIRED';
  if (p.maxRedemptions !== null && liveRedemptions(p.id).length >= p.maxRedemptions) return 'USED_UP';
  return p.active ? 'ACTIVE' : 'PAUSED';
}

const liveRedemptions = (codeId: string) => getDb().promoRedemptions.filter((r) => r.codeId === codeId && r.status === 'APPLIED');

const promoError = (message: string, code: string): never => fail(422, message, code, [{ field: 'promoCode', message }]);

/** "₹500 off your first order", "10% off (up to ₹2,000)". */
export function describePromo(p: Pick<PromoCodeRow, 'kind' | 'percentBps' | 'flatCents' | 'maxDiscountCents' | 'firstOrderOnly'>) {
  const what = p.kind === 'FLAT' ? `${formatMoney(p.flatCents ?? 0).replace(/\.00$/, '')} off` : `${(p.percentBps ?? 0) / 100}% off${p.maxDiscountCents ? ` (up to ${formatMoney(p.maxDiscountCents).replace(/\.00$/, '')})` : ''}`;
  return `${what}${p.firstOrderOnly ? ' your first order' : ''}`;
}

/** Brands who already placed an order that was not closed unaccepted have had their first order. */
const hadOrder = (brandUserId: string) => getDb().orders.some((o) => o.brandUserId === brandUserId && o.status !== 'CLOSED');

/**
 * The discount for an order: validates the promo code (422 with a field error on promoCode) and applies
 * credits if asked. The brand always pays at least ₹1.
 */
export function computeDiscount(user: UserRow, money: { priceCents: number; totalCents: number }, req: { promoCode?: string | null; useCredits?: boolean }) {
  const db = getDb();
  const raw = req.promoCode?.trim().toUpperCase() || null;
  let promo: PromoCodeRow | null = null;
  let promoCents = 0;
  if (raw) {
    promo = db.promoCodes.find((p) => p.code === raw) ?? null;
    if (!promo) return promoError('That code doesn’t exist. Check the spelling.', 'PROMO_NOT_FOUND');
    const status = promoStatus(promo);
    if (status === 'EXPIRED') promoError('This code has expired.', 'PROMO_EXPIRED');
    if (status === 'PAUSED') promoError('This code is not active.', 'PROMO_INACTIVE');
    if (status === 'USED_UP') promoError('This code has been fully used.', 'PROMO_EXHAUSTED');
    if (liveRedemptions(promo.id).some((r) => r.brandUserId === user.id)) promoError('You have already used this code.', 'PROMO_ALREADY_USED');
    if (promo.firstOrderOnly && hadOrder(user.id)) promoError('This code is for your first order only.', 'PROMO_FIRST_ORDER');
    if (promo.minOrderCents !== null && money.priceCents < promo.minOrderCents) promoError(`This code needs an order of at least ${formatMoney(promo.minOrderCents)}.`, 'PROMO_MIN_ORDER');
    const full = promo.kind === 'FLAT' ? (promo.flatCents ?? 0) : applyBps(money.priceCents, promo.percentBps ?? 0);
    promoCents = Math.min(full, promo.maxDiscountCents ?? full, money.totalCents - MIN_CHARGE_CENTS);
  }
  const balance = user.role === 'BRAND' ? creditBalance(user.id) : 0;
  const creditCents = req.useCredits ? Math.max(0, Math.min(balance, money.totalCents - promoCents - MIN_CHARGE_CENTS)) : 0;
  const discount: OrderDiscount = { promoCode: promo?.code ?? null, promoCents, creditCents };
  return { discount, promo, creditBalanceCents: balance, promoDescription: promo ? describePromo(promo) : null };
}

/** Records the promo use and the credit spent once the order exists. */
export function commitDiscount(user: UserRow, orderId: string, d: OrderDiscount) {
  const db = getDb();
  if (d.promoCode && d.promoCents > 0) {
    const p = db.promoCodes.find((x) => x.code === d.promoCode)!;
    db.promoRedemptions.push({ id: ulid(now().getTime()), codeId: p.id, brandUserId: user.id, orderId, discountCents: d.promoCents, status: 'APPLIED', createdAt: now().toISOString() });
  }
  if (d.creditCents > 0) addCredit(user.id, -d.creditCents, 'ORDER_USED', 'Used on an order', orderId);
}

/**
 * Called after every transition: an order that ends without the brand paying (closed unaccepted, or fully
 * refunded) gives the promo use and the credit back. A completed order may earn a referral reward.
 */
export function afterTransition(o: MockOrder) {
  const db = getDb();
  const fullyRefunded = o.status === 'REFUNDED' && o.payment.refundedCents >= brandPaidCents(o);
  if (o.status === 'CLOSED' || fullyRefunded) {
    for (const r of db.promoRedemptions) if (r.orderId === o.id && r.status === 'APPLIED') r.status = 'RELEASED';
    const used = -db.credits.filter((c) => c.orderId === o.id).reduce((s, c) => s + c.deltaCents, 0);
    if (used > 0) addCredit(o.brandUserId, used, 'ORDER_RETURNED', o.status === 'CLOSED' ? 'Order not accepted — credit returned' : 'Order refunded — credit returned', o.id);
  }
  if (o.status === 'COMPLETED') rewardReferrals(o);
}

/* ---------- Referrals ---------- */

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Stable per-user code: up to 6 letters of the first name + 4 characters from the id. */
export function referralCodeOf(u: UserRow): string {
  if (u.referralCode) return u.referralCode;
  const db = getDb();
  const base = (u.name.split(' ')[0] ?? 'WC').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'WC';
  let h = 7;
  for (let attempt = 0; ; attempt++) {
    for (const ch of u.id + attempt) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    let tail = '';
    let x = h;
    for (let i = 0; i < 4; i++) {
      tail += CODE_CHARS[x % CODE_CHARS.length];
      x = Math.floor(x / CODE_CHARS.length);
    }
    const code = base + tail;
    if (!db.users.some((o) => o.id !== u.id && o.referralCode === code)) {
      u.referralCode = code;
      return code;
    }
  }
}

export const findByReferralCode = (code: string) => {
  const c = code.trim().toUpperCase();
  return getDb().users.find((u) => u.referralCode === c && u.status === 'ACTIVE' && u.role !== 'ADMIN') ?? null;
};

/** Sign-up, before the account exists: the referrer for a code (same role only), or null without a code. */
export function resolveReferral(code: string | null | undefined, role: 'BRAND' | 'CREATOR'): UserRow | null {
  if (!code?.trim()) return null;
  const ref = findByReferralCode(code);
  if (!ref) fail(422, 'That referral code doesn’t exist.', 'REFERRAL_NOT_FOUND', [{ field: 'referralCode', message: 'That referral code doesn’t exist.' }]);
  if (ref.role !== role)
    fail(422, `This code is for ${ref.role === 'BRAND' ? 'brands' : 'creators'}. Sign up as a ${ref.role === 'BRAND' ? 'brand' : 'creator'} or remove the code.`, 'REFERRAL_ROLE_MISMATCH', [
      { field: 'referralCode', message: `This code is for ${ref.role === 'BRAND' ? 'brands' : 'creators'}.` },
    ]);
  return ref;
}

/** Sign-up, after: link the new account to the referrer and give a new brand its welcome credit. */
export function linkReferral(newUser: UserRow, ref: UserRow | null) {
  if (!ref) return;
  newUser.referredBy = ref.id;
  if (newUser.role === 'BRAND') addCredit(newUser.id, REFERRAL.brandWelcomeCents, 'REFERRAL_WELCOME', `Welcome credit — invited by ${ref.name.split(' ')[0]}`);
}

/** First completed order of a referred brand or creator rewards whoever invited them (once). */
function rewardReferrals(o: MockOrder) {
  const db = getDb();
  for (const userId of [o.brandUserId, o.creatorUserId]) {
    const u = db.users.find((x) => x.id === userId);
    if (!u?.referredBy || u.referralRewardedAt) continue;
    const ref = db.users.find((x) => x.id === u.referredBy);
    if (!ref || ref.status !== 'ACTIVE') continue;
    u.referralRewardedAt = now().toISOString();
    const who = u.role === 'BRAND' ? (db.brandProfiles.find((b) => b.userId === u.id)?.companyName ?? u.name) : (db.creatorProfiles.find((p) => p.userId === u.id)?.displayName ?? u.name);
    if (ref.role === 'BRAND') {
      addCredit(ref.id, REFERRAL.brandRewardCents, 'REFERRAL_REWARD', `${who} completed their first order`, o.id);
      deliver(ref.id, { type: 'REFERRAL_REWARD', title: `You earned ${formatMoney(REFERRAL.brandRewardCents)} credit`, body: `${who} completed their first order. Use the credit on your next booking.`, link: '/referrals' }, 'ACCOUNT');
    } else {
      const entries = postTxn(referralBonusLines(REFERRAL.creatorRewardCents), { txnId: ulid(now().getTime()), orderId: `ref_${ref.id}_${u.id}`, memo: 'Referral bonus', at: now().toISOString() });
      db.ledgerEntries.push(...entries);
      auditLedger(entries, null);
      deliver(ref.id, { type: 'REFERRAL_REWARD', title: `${formatMoney(REFERRAL.creatorRewardCents)} referral bonus added`, body: `${who} completed their first order. The bonus is in your balance.`, link: '/creator/payouts' }, 'PAYOUTS');
    }
  }
}

export const getReferralInvite: Handler = ({ params }) => {
  const ref = findByReferralCode(params.code);
  if (!ref) fail(404, 'That referral code doesn’t exist.', 'REFERRAL_NOT_FOUND');
  const db = getDb();
  const name = ref.role === 'BRAND' ? (db.brandProfiles.find((b) => b.userId === ref.id)?.companyName ?? ref.name) : (db.creatorProfiles.find((p) => p.userId === ref.id)?.displayName ?? ref.name);
  const body: ReferralInvite = { code: ref.referralCode!, referrerName: name, role: ref.role as ReferralInvite['role'], welcomeCreditCents: ref.role === 'BRAND' ? REFERRAL.brandWelcomeCents : 0 };
  return ok(body);
};

const toCredit = (c: CreditRow): CreditEntry => ({ id: c.id, deltaCents: c.deltaCents, reason: c.reason, note: c.note, orderId: c.orderId, createdAt: c.createdAt });

export const getMyReferrals: Handler = ({ user }) => {
  if (user.role === 'ADMIN') fail(403, 'Referrals are for brands and creators.', 'ROLE_NOT_ALLOWED');
  const db = getDb();
  const code = referralCodeOf(user);
  const brand = user.role === 'BRAND';
  const reward = brand ? REFERRAL.brandRewardCents : REFERRAL.creatorRewardCents;
  const referred = db.users
    .filter((u) => u.referredBy === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((u) => ({ name: u.name, joinedAt: u.createdAt, status: u.referralRewardedAt ? ('REWARDED' as const) : ('JOINED' as const), rewardCents: u.referralRewardedAt ? reward : null }));
  const mine = db.credits.filter((c) => c.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const body: ReferralOverview = {
    code,
    shareUrl: `/signup?role=${brand ? 'brand' : 'creator'}&ref=${code}`,
    role: user.role as ReferralOverview['role'],
    refereeRewardCents: brand ? REFERRAL.brandWelcomeCents : 0,
    referrerRewardCents: reward,
    referred,
    creditBalanceCents: brand ? creditBalance(user.id) : 0,
    credits: brand ? mine.map(toCredit) : [],
    earnedCents: referred.filter((r) => r.status === 'REWARDED').length * reward,
  };
  return ok(body);
};

/* ---------- Admin: promo codes ---------- */

function requireAdmin(user: UserRow) {
  if (user.role !== 'ADMIN') fail(403, 'Admins only.', 'ROLE_NOT_ALLOWED');
}

const toPromo = (p: PromoCodeRow): PromoCode => {
  const used = liveRedemptions(p.id);
  return {
    id: p.id,
    code: p.code,
    description: p.description,
    kind: p.kind,
    percentBps: p.percentBps,
    flatCents: p.flatCents,
    maxDiscountCents: p.maxDiscountCents,
    minOrderCents: p.minOrderCents,
    firstOrderOnly: p.firstOrderOnly,
    maxRedemptions: p.maxRedemptions,
    validUntil: p.validUntil,
    active: p.active,
    status: promoStatus(p),
    redemptions: used.length,
    discountGivenCents: used.reduce((s, r) => s + r.discountCents, 0),
    createdAt: p.createdAt,
  };
};

export const listPromoCodes: Handler = ({ user }) => {
  requireAdmin(user);
  return ok({ content: [...getDb().promoCodes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toPromo) });
};

export const createPromoCode: Handler = ({ req, user }) => {
  requireAdmin(user);
  const body = parseBody(promoCodeInputSchema, req.body);
  const db = getDb();
  if (db.promoCodes.some((p) => p.code === body.code)) fail(409, 'A code with this name already exists.', 'PROMO_CODE_TAKEN', [{ field: 'code', message: 'Already exists.' }]);
  const row: PromoCodeRow = {
    id: `promo_${ulid(now().getTime()).slice(-10).toLowerCase()}`,
    code: body.code,
    description: body.description,
    kind: body.kind,
    percentBps: body.kind === 'PERCENT' ? (body.percentBps ?? null) : null,
    flatCents: body.kind === 'FLAT' ? (body.flatCents ?? null) : null,
    maxDiscountCents: body.maxDiscountCents ?? null,
    minOrderCents: body.minOrderCents ?? null,
    firstOrderOnly: body.firstOrderOnly ?? false,
    maxRedemptions: body.maxRedemptions ?? null,
    validUntil: body.validUntil ?? null,
    active: true,
    createdBy: user.id,
    createdAt: now().toISOString(),
  };
  db.promoCodes.push(row);
  audit(user, { action: 'PROMO_CHANGED', entityType: 'PROMO_CODE', entityId: row.code, summary: `Promo ${row.code} created: ${describePromo(row)}`, before: null, after: body });
  return ok(toPromo(row), 201);
};

export const updatePromoCode: Handler = ({ req, params, user }) => {
  requireAdmin(user);
  const p = getDb().promoCodes.find((x) => x.id === params.id);
  if (!p) fail(404, 'No such promo code.', 'NOT_FOUND');
  const active = (req.body as { active?: unknown } | undefined)?.active;
  if (typeof active !== 'boolean') fail(422, 'Send active: true or false.', 'VALIDATION_FAILED', [{ field: 'active', message: 'Required.' }]);
  const before = p.active;
  p.active = active;
  audit(user, { action: 'PROMO_CHANGED', entityType: 'PROMO_CODE', entityId: p.code, summary: `Promo ${p.code} ${active ? 'turned on' : 'paused'}`, before: { active: before }, after: { active } });
  return ok(toPromo(p));
};
