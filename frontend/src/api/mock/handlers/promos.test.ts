import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { payTotal } from '@/test/payments';
import type { OrderBrief } from '@/types';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';
import { accountBalance, findUnbalancedTxns } from '../ledger';

const brief: OrderBrief = { requirements: 'A short Reel with the tote bag, natural light.', needsShipping: false, links: [], referenceFiles: [] };
let n = 0;
const key = () => `promo-${++n}`;
const asBrand = () => api.auth.login('brand@demo.test', DEMO_PASSWORD);
const asLeo = () => api.auth.login('creator@demo.test', DEMO_PASSWORD);
const asAdmin = () => api.auth.login('admin@demo.test', DEMO_PASSWORD);
const leoId = () => getDb().users.find((u) => u.email === 'creator@demo.test')!.id;
/** Leo's cheapest package that is at least ₹5,000 (DIWALI10's minimum). */
const pkg = () => getDb().packages.filter((k) => k.creatorId === leoId() && k.active && k.priceCents >= 5_000_00).sort((a, b) => a.priceCents - b.priceCents)[0];

beforeEach(async () => {
  await api.dev.reset();
});

/** Places an order the way checkout does: quote → pay amountDue → create. */
async function buy(q: { promoCode?: string; useCredits?: boolean }) {
  const quote = await api.orders.quote({ packageId: pkg().id, promoCode: q.promoCode, useCredits: q.useCredits ? 'true' : undefined });
  const created = await api.orders.create({ packageId: pkg().id, brief, payment: await payTotal(quote.amountDueCents), promoCode: q.promoCode ?? null, useCredits: q.useCredits }, key());
  return { quote, created };
}

describe('promo codes (v3.3)', () => {
  it('quotes the discount, charges the rest, and funds the gap from PROMOTIONS at capture', async () => {
    await asBrand();
    const { quote, created } = await buy({ promoCode: 'diwali10' });
    const expected = Math.min(Math.floor((pkg().priceCents * 1000 + 5000) / 10000), 2_000_00);
    expect(quote.discount).toEqual({ promoCode: 'DIWALI10', promoCents: expected, creditCents: 0 });
    expect(quote.amountDueCents).toBe(quote.totalCents - expected);
    expect(quote.promoDescription).toBe('10% off (up to ₹2,000)');
    expect(created).toMatchObject({ totalCents: quote.totalCents, paidCents: quote.amountDueCents });

    await asLeo();
    const o = await api.orders.accept(created.orderId, key());
    expect(o.money).toMatchObject({ paidCents: quote.amountDueCents, discount: { promoCents: expected } });
    expect(o.payment.amountCents).toBe(quote.amountDueCents);
    expect(accountBalance(getDb().ledgerEntries, 'ESCROW', o.id)).toBe(quote.totalCents);
    expect(accountBalance(getDb().ledgerEntries, 'PROMOTIONS', o.id)).toBe(-expected);
    expect(findUnbalancedTxns(getDb().ledgerEntries)).toEqual([]);
  });

  it('rejects bad, expired, first-order-only and reused codes with a field error', async () => {
    await asBrand();
    const quote = (promoCode: string) => api.orders.quote({ packageId: pkg().id, promoCode });
    await expect(quote('NOPE')).rejects.toMatchObject({ status: 422, code: 'PROMO_NOT_FOUND', fieldErrors: [{ field: 'promoCode' }] });
    await expect(quote('MONSOON15')).rejects.toMatchObject({ code: 'PROMO_EXPIRED' });
    await expect(quote('WELCOME500')).rejects.toMatchObject({ code: 'PROMO_FIRST_ORDER' }); // Saltbay has orders
    await buy({ promoCode: 'DIWALI10' });
    await expect(quote('DIWALI10')).rejects.toMatchObject({ code: 'PROMO_ALREADY_USED' });
    // Paying the undiscounted total with a code is a mismatch: nothing is created.
    const q = await api.orders.quote({ packageId: pkg().id });
    await expect(api.orders.create({ packageId: pkg().id, brief, payment: await payTotal(q.totalCents), promoCode: 'DIWALI10' }, key())).rejects.toMatchObject({ status: 422 });
  });

  it('gives the code and credit back when the order closes or is fully refunded', async () => {
    await asBrand();
    const { created } = await buy({ promoCode: 'DIWALI10', useCredits: true });
    const before = (await api.me.referrals()).creditBalanceCents;
    expect(before).toBe(0); // all ₹1,000 used
    await api.orders.cancel(created.orderId, null, key());
    expect((await api.me.referrals()).creditBalanceCents).toBe(1_000_00);
    const again = await buy({ promoCode: 'DIWALI10', useCredits: true }); // code free again
    expect(again.quote.discount.creditCents).toBe(1_000_00);

    await asLeo();
    await api.orders.accept(again.created.orderId, key());
    await asAdmin();
    await api.admin.cancelOrder(again.created.orderId, 'Creator cannot deliver due to illness.', key());
    const o = getDb().orders.find((x) => x.id === again.created.orderId)!;
    expect(o.payment.refundedCents).toBe(again.quote.amountDueCents);
    expect(accountBalance(getDb().ledgerEntries, 'ESCROW', o.id)).toBe(0);
    expect(accountBalance(getDb().ledgerEntries, 'PROMOTIONS', o.id)).toBe(0);
    expect(findUnbalancedTxns(getDb().ledgerEntries)).toEqual([]);
    await asBrand();
    expect((await api.me.referrals()).creditBalanceCents).toBe(1_000_00);
  });

  it('admins create, pause and track codes', async () => {
    await asAdmin();
    await expect(api.admin.createPromo({ code: 'x', description: 'Too short', kind: 'FLAT', flatCents: 500_00 })).rejects.toMatchObject({ status: 422 });
    const p = await api.admin.createPromo({ code: 'launch300', description: 'Launch week', kind: 'FLAT', flatCents: 300_00, firstOrderOnly: false });
    expect(p).toMatchObject({ code: 'LAUNCH300', status: 'ACTIVE', redemptions: 0 });
    await expect(api.admin.createPromo({ code: 'LAUNCH300', description: 'Again', kind: 'FLAT', flatCents: 300_00 })).rejects.toMatchObject({ status: 409 });
    expect((await api.admin.setPromoActive(p.id, false)).status).toBe('PAUSED');
    await asBrand();
    await expect(api.orders.quote({ packageId: pkg().id, promoCode: 'LAUNCH300' })).rejects.toMatchObject({ code: 'PROMO_INACTIVE' });
    await asAdmin();
    await api.admin.setPromoActive(p.id, true);
    await asBrand();
    await buy({ promoCode: 'LAUNCH300' });
    await asAdmin();
    expect((await api.admin.promos()).content.find((x) => x.id === p.id)).toMatchObject({ redemptions: 1, discountGivenCents: 300_00 });
    expect((await api.admin.audit({ action: 'PROMO_CHANGED' })).totalElements).toBe(3);
  });
});

describe('referrals (v3.3)', () => {
  it('a brand invited with a code gets welcome credit; the inviter earns credit on their first completed order', async () => {
    const invite = await api.referrals.invite('maya7k2q');
    expect(invite).toMatchObject({ referrerName: 'Saltbay Supply Co.', role: 'BRAND', welcomeCreditCents: 500_00 });
    await expect(api.auth.register({ role: 'CREATOR', name: 'Wrong Role', email: 'wrong@x.test', password: 'abc12345', acceptTerms: true, referralCode: 'MAYA7K2Q' })).rejects.toMatchObject({
      status: 422,
      code: 'REFERRAL_ROLE_MISMATCH',
    });
    expect(getDb().users.some((u) => u.email === 'wrong@x.test')).toBe(false);
    await api.auth.register({ role: 'BRAND', name: 'Rhea Kapoor', email: 'rhea@brand.test', password: 'abc12345', acceptTerms: true, referralCode: 'MAYA7K2Q' });
    const rhea = getDb().users.find((u) => u.email === 'rhea@brand.test')!;
    rhea.emailVerifiedAt = new Date().toISOString();
    const mine = await api.me.referrals();
    expect(mine).toMatchObject({ role: 'BRAND', creditBalanceCents: 500_00, refereeRewardCents: 500_00 });
    expect(mine.code).toMatch(/^RHEA[A-Z2-9]{4}$/);

    // Rhea's first order with the welcome credit, accepted, delivered, approved.
    const { quote, created } = await buy({ useCredits: true });
    expect(quote.discount.creditCents).toBe(500_00);
    await asLeo();
    await api.orders.accept(created.orderId, key());
    await api.orders.deliver(created.orderId, { items: [{ type: 'POST_URL', url: 'https://www.instagram.com/p/rhea1/' }], note: null }, key());
    await api.auth.login('rhea@brand.test', 'abc12345');
    await api.orders.approve(created.orderId, key());

    await asBrand();
    const maya = await api.me.referrals();
    expect(maya.creditBalanceCents).toBe(2_000_00); // seeded ₹1,000 + ₹1,000 for Rhea
    expect(maya.referred.find((r) => r.name === 'Rhea Kapoor')).toMatchObject({ status: 'REWARDED', rewardCents: 1_000_00 });
  });

  it('a creator earns a balance bonus when the creator they invited completes a first order', async () => {
    await asLeo();
    const leo = await api.me.referrals();
    expect(leo).toMatchObject({ code: 'LEO4XR8M', role: 'CREATOR', creditBalanceCents: 0, referrerRewardCents: 500_00 });
    // Make Leo's referee the creator on a completed order.
    const other = getDb().creatorProfiles.find((p) => p.vettingStatus === 'APPROVED' && p.payoutStatus === 'ENABLED' && p.userId !== leoId() && getDb().packages.some((k) => k.creatorId === p.userId && k.active))!;
    getDb().users.find((u) => u.id === other.userId)!.referredBy = leoId();
    const before = (await api.payouts.balance()).availableCents;
    await asBrand();
    const k = getDb().packages.find((x) => x.creatorId === other.userId && x.active)!;
    const q = await api.orders.quote({ packageId: k.id });
    const { orderId } = await api.orders.create({ packageId: k.id, brief, payment: await payTotal(q.amountDueCents) }, key());
    const otherEmail = getDb().users.find((u) => u.id === other.userId)!.email;
    await api.auth.login(otherEmail, DEMO_PASSWORD);
    await api.orders.accept(orderId, key());
    await api.orders.deliver(orderId, { items: [{ type: 'POST_URL', url: 'https://www.instagram.com/p/ref1/' }], note: null }, key());
    await asBrand();
    await api.orders.approve(orderId, key());
    await asLeo();
    expect((await api.payouts.balance()).availableCents).toBe(before + 500_00);
    expect((await api.me.referrals()).earnedCents).toBe(500_00);
    expect(findUnbalancedTxns(getDb().ledgerEntries)).toEqual([]);
  });
});
