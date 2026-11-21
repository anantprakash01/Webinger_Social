import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { payFor, VALID_PAYOUT_ACCOUNT } from '@/test/payments';
import type { OrderBrief } from '@/types';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';
import { accountBalance, findUnbalancedTxns } from '../ledger';

const brief: OrderBrief = { requirements: 'A short Reel with the tote bag, natural light.', needsShipping: false, links: [], referenceFiles: [] };
const leoId = () => getDb().users.find((u) => u.email === 'creator@demo.test')!.id;
const leoPackage = () => getDb().packages.filter((k) => k.creatorId === leoId() && k.active).sort((a, b) => a.priceCents - b.priceCents)[0];
let n = 0;
const key = () => `tax-${++n}`;
const brandProfile = { companyName: 'Saltbay Supply Co.', website: 'https://saltbay.example.com', logoUrl: null, industry: 'HOME' as const, country: 'IN' };

beforeEach(async () => {
  await api.dev.reset();
});

describe('GST place of supply and GSTIN rules (phase B)', () => {
  it('uses IGST for a brand in another state and checks the GSTIN against the state', async () => {
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    expect((await api.orders.quote({ packageId: leoPackage().id })).taxes.intraState).toBe(true); // Karnataka, like the platform
    await expect(api.brands.updateProfile({ ...brandProfile, state: 'MH', gstin: '29AAACS1234B1Z9' })).rejects.toMatchObject({ status: 422 });
    await expect(api.brands.updateProfile({ ...brandProfile, state: null, gstin: null })).rejects.toMatchObject({ status: 422 });
    const p = await api.brands.updateProfile({ ...brandProfile, state: 'MH', gstin: '27AAACS1234B1Z9' });
    expect(p).toMatchObject({ state: 'MH', gstin: '27AAACS1234B1Z9' });
    expect((await api.orders.quote({ packageId: leoPackage().id })).taxes.intraState).toBe(false);
  });
});

describe('GST-registered creator (phase B)', () => {
  it('charges 18% GST on the price, withholds 0.1% TDS and 0.5% TCS at release, and totals them for the year', async () => {
    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    await expect(api.payouts.saveAccount({ ...VALID_PAYOUT_ACCOUNT, gstin: '27ZZZZZ9999Z1Z5' })).rejects.toMatchObject({ status: 422 }); // not this PAN
    expect((await api.payouts.saveAccount({ ...VALID_PAYOUT_ACCOUNT, gstin: '27ABCDE1234F1Z5' })).gstin).toBe('27ABCDE1234F1Z5');

    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    const pkg = leoPackage();
    const q = await api.orders.quote({ packageId: pkg.id });
    const p = pkg.priceCents;
    const bps = (c: number, b: number) => Math.floor((c * b + 5000) / 10000);
    expect(q.taxes).toMatchObject({ creatorGstRegistered: true, creatorGstCents: bps(p, 1800), tdsCents: bps(p, 10), tcsCents: bps(p, 50) });
    expect(q.totalCents).toBe(p + bps(p, 1800) + q.brandFeeCents + bps(q.brandFeeCents, 1800));
    const { orderId } = await api.orders.create({ packageId: pkg.id, brief, payment: await payFor({ packageId: pkg.id }) }, key());

    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    await api.orders.accept(orderId, key());
    await api.orders.deliver(orderId, { items: [{ type: 'POST_URL', url: 'https://example.com/p/1' }], note: null }, key());
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    await api.orders.approve(orderId, key());

    const o = await api.orders.get(orderId);
    expect(o.taxParties).toMatchObject({ creatorGstin: '27ABCDE1234F1Z5', brandGstin: '29AAACS1234B1Z9', brandState: 'KA' });
    const ledger = getDb().ledgerEntries;
    expect(accountBalance(ledger, 'TAX_WITHHELD', orderId)).toBe(bps(p, 10) + bps(p, 50));
    expect(accountBalance(ledger, 'GST_PAYABLE', orderId)).toBe(bps(q.brandFeeCents, 1800) + bps(o.money.creatorFeeCents, 1800));
    expect(accountBalance(ledger, 'CREATOR_BALANCE', orderId)).toBe(o.money.creatorPayoutCents);
    expect(findUnbalancedTxns(ledger)).toEqual([]);

    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    const ov = await api.payouts.balance();
    expect(ov.tdsWithheldCents).toBeGreaterThanOrEqual(bps(p, 10));
    expect(ov.tcsWithheldCents).toBe(bps(p, 50));
    expect(ov.financialYear).toMatch(/^\d{4}-\d{2}$/);
  });
});
