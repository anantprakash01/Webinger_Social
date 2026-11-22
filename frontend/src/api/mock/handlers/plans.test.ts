import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { payTotal } from '@/test/payments';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';
import { accountBalance, findUnbalancedTxns } from '../ledger';

let n = 0;
const key = () => `plan-${++n}`;
const asBrand = () => api.auth.login('brand@demo.test', DEMO_PASSWORD);
const leoPackage = () => {
  const leo = getDb().users.find((u) => u.email === 'creator@demo.test')!.id;
  return getDb().packages.filter((k) => k.creatorId === leo && k.active)[0];
};

beforeEach(async () => {
  await api.dev.reset();
});

describe('brand plans (FR-66, v3.2)', () => {
  it('lists plans publicly with prices, fees and limits', async () => {
    const f = await api.fees.current();
    expect(f.plans.map((p) => [p.plan, p.brandFeeBps, p.inquiryLimit])).toEqual([
      ['FREE', 1000, 5],
      ['PRO', 500, 50],
      ['PREMIUM', 200, null],
    ]);
    expect(f.plans[1]).toMatchObject({ monthlyCents: 499_900, yearlyCents: 4_999_000, gstBps: 1800 });
  });

  it('upgrading is paid now with GST, lowers the fee on new orders and is posted to the ledger', async () => {
    await asBrand();
    expect((await api.orders.quote({ packageId: leoPackage().id })).brandFeeBps).toBe(1000);
    // Payment must match price + 18% GST.
    await expect(api.brands.changeSubscription({ plan: 'PRO', cycle: 'MONTHLY', payment: await payTotal(499_900, undefined, 'SUBSCRIPTION') }, key())).rejects.toMatchObject({ status: 409, code: 'AMOUNT_MISMATCH' });
    const s = await api.brands.changeSubscription({ plan: 'PRO', cycle: 'MONTHLY', payment: await payTotal(589_882, undefined, 'SUBSCRIPTION') }, key());
    expect(s).toMatchObject({ plan: 'PRO', cycle: 'MONTHLY', status: 'ACTIVE', brandFeeBps: 500, renewalCents: 589_882 });
    expect(s.invoices[0]).toMatchObject({ kind: 'NEW', priceCents: 499_900, gstCents: 89_982, totalCents: 589_882, intraState: true });
    expect(s.inquiries.limit).toBe(50);
    expect((await api.orders.quote({ packageId: leoPackage().id })).brandFeeBps).toBe(500);
    const ref = `sub_${s.invoices[0].id}`;
    expect(accountBalance(getDb().ledgerEntries, 'PLATFORM_REVENUE', ref)).toBe(499_900);
    expect(accountBalance(getDb().ledgerEntries, 'GST_PAYABLE', ref)).toBe(89_982);
    expect(findUnbalancedTxns(getDb().ledgerEntries)).toEqual([]);
    await expect(api.brands.changeSubscription({ plan: 'PRO', cycle: 'MONTHLY' }, key())).rejects.toMatchObject({ status: 409, code: 'ALREADY_ON_PLAN' });
  });

  it('schedules downgrades and cancellations for the period end, renews automatically', async () => {
    await asBrand();
    await api.brands.changeSubscription({ plan: 'PREMIUM', cycle: 'MONTHLY', payment: await payTotal(1_769_882, undefined, 'SUBSCRIPTION') }, key());
    // Lower plan: no payment, takes effect at renewal.
    const down = await api.brands.changeSubscription({ plan: 'PRO', cycle: 'MONTHLY' }, key());
    expect(down).toMatchObject({ plan: 'PREMIUM', nextPlan: 'PRO', renewalCents: 589_882 });
    await api.dev.simulateTime(720);
    await api.dev.simulateTime(48);
    await asBrand();
    const renewed = await api.brands.subscription();
    expect(renewed).toMatchObject({ plan: 'PRO', nextPlan: null, status: 'ACTIVE' });
    expect(renewed.invoices[0]).toMatchObject({ kind: 'RENEWAL', plan: 'PRO' });

    const cancelling = await api.brands.cancelSubscription();
    expect(cancelling.status).toBe('CANCELLING');
    expect((await api.brands.resumeSubscription()).status).toBe('ACTIVE');
    await api.brands.cancelSubscription();
    await api.dev.simulateTime(720);
    await api.dev.simulateTime(48);
    await asBrand();
    expect(await api.brands.subscription()).toMatchObject({ plan: 'FREE', status: 'FREE', brandFeeBps: 1000 });
    expect((await api.notifications.list()).content.some((x) => x.type === 'PLAN_CHANGED' && x.title.includes('Free'))).toBe(true);
  });

  it('is brand-only; admins edit fees per plan and orders keep the fee they were placed with', async () => {
    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    await expect(api.brands.subscription()).rejects.toMatchObject({ status: 403 });
    await api.auth.login('admin@demo.test', DEMO_PASSWORD);
    const fees = await api.admin.updateFees({ plan: 'PRO', brandFeeBps: 400, creatorFeeBps: 1500 });
    expect(fees.plans.find((p) => p.plan === 'PRO')!.brandFeeBps).toBe(400);
    expect(fees.current.brandFeeBps).toBe(1000);
    expect((await api.fees.current()).plans.find((p) => p.plan === 'PRO')!.brandFeeBps).toBe(400);
  });
});
