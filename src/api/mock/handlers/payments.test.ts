import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { instantFee } from '@/features/payments/schemas';
import { payTotal, VALID_PAYOUT_ACCOUNT } from '@/test/payments';
import type { OrderBrief } from '@/types';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';
import { accountBalance, findUnbalancedTxns } from '../ledger';

const asBrand = () => api.auth.login('brand@demo.test', DEMO_PASSWORD);
const asLeo = () => api.auth.login('creator@demo.test', DEMO_PASSWORD);
const leoId = () => getDb().users.find((u) => u.email === 'creator@demo.test')!.id;
const leoPackage = () => getDb().packages.filter((k) => k.creatorId === leoId() && k.active).sort((a, b) => a.priceCents - b.priceCents)[0];
const brief: OrderBrief = { requirements: 'A short Reel with the tote bag, natural light.', needsShipping: false, links: [], referenceFiles: [] };
let n = 0;
const key = () => `pay-${++n}`;

async function expectError(p: Promise<unknown>, status: number, code?: string) {
  const e = (await p.then(
    () => {
      throw new Error(`expected ${status}`);
    },
    (err) => err,
  )) as { status: number; code?: string };
  expect(e.status).toBe(status);
  if (code) expect(e.code).toBe(code);
}

beforeEach(async () => {
  await api.dev.reset();
});

describe('paying for orders through Razorpay (v2.0)', () => {
  it('authorises by UPI, card, netbanking or wallet app and records the method', async () => {
    await asBrand();
    const pkg = leoPackage();
    const total = (await api.orders.quote({ packageId: pkg.id })).totalCents;
    const cases = [
      [{ method: 'UPI', vpa: 'success@razorpay' }, 'UPI · success@razorpay'],
      [{ method: 'CARD', card: { number: '4111 1111 1111 1111', expiry: '12 / 39', cvc: '123' } }, 'Visa •••• 1111'],
      [{ method: 'NETBANKING', bank: 'ICIC' }, 'ICICI Bank netbanking'],
      [{ method: 'WALLET_APP', app: 'phonepe' }, 'PhonePe wallet'],
    ] as const;
    for (const [how, label] of cases) {
      const { orderId } = await api.orders.create({ packageId: pkg.id, brief, payment: await payTotal(total, how) }, key());
      expect((await api.orders.get(orderId)).payment).toMatchObject({ status: 'AUTHORIZED', amountCents: total, methodLabel: label });
    }
  });

  it('never creates an order for a failed, forged, reused or wrong-amount payment', async () => {
    await asBrand();
    const pkg = leoPackage();
    const total = (await api.orders.quote({ packageId: pkg.id })).totalCents;
    const before = getDb().orders.length;
    const s = await api.payments.session(total);
    await expectError(api.dev.razorpayPay({ sessionId: s.id, method: 'UPI', vpa: 'failure@razorpay' }), 402, 'PAYMENT_FAILED');
    await expectError(api.dev.razorpayPay({ sessionId: s.id, method: 'CARD', card: { number: '4000 0000 0000 0002', expiry: '12 / 39', cvc: '123' } }), 402, 'PAYMENT_FAILED');
    const ok = await payTotal(total);
    await expectError(api.orders.create({ packageId: pkg.id, brief, payment: { ...ok, razorpaySignature: 'forged' } }, key()), 402, 'PAYMENT_FAILED');
    const cheap = await payTotal(total - 100);
    await expectError(api.orders.create({ packageId: pkg.id, brief, payment: cheap }, key()), 409, 'AMOUNT_MISMATCH');
    expect(getDb().orders.length).toBe(before);
    await api.orders.create({ packageId: pkg.id, brief, payment: ok }, key());
    await expectError(api.orders.create({ packageId: pkg.id, brief, payment: ok }, key()), 409, 'SESSION_USED');
    expect(getDb().orders.length).toBe(before + 1);
  });

  it('captures on accept and refunds to the original method on a dispute (ledger balanced)', async () => {
    await asBrand();
    const pkg = leoPackage();
    const total = (await api.orders.quote({ packageId: pkg.id })).totalCents;
    const { orderId } = await api.orders.create({ packageId: pkg.id, brief, payment: await payTotal(total, { method: 'NETBANKING', bank: 'SBIN' }) }, key());
    await asLeo();
    await api.orders.accept(orderId, key());
    expect(accountBalance(getDb().ledgerEntries, 'ESCROW', orderId)).toBe(total);
    expect(findUnbalancedTxns(getDb().ledgerEntries)).toEqual([]);
  });

  it('saves cards as tokens (never the number) and UPI IDs, and lets the brand remove them', async () => {
    await asBrand();
    const total = (await api.orders.quote({ packageId: leoPackage().id })).totalCents;
    await payTotal(total, { method: 'CARD', card: { number: '5555 5555 5555 4444', expiry: '10 / 30', cvc: '123', save: true } });
    await payTotal(total, { method: 'UPI', vpa: 'maya@okicici', saveVpa: true });
    const { content } = await api.payments.methods();
    expect(content.map((m) => m.label)).toEqual(expect.arrayContaining(['Mastercard •••• 4444', 'maya@okicici', 'Visa •••• 1111', 'saltbay@okhdfcbank']));
    expect(JSON.stringify(getDb().savedMethods)).not.toContain('5555555555554444');
    const mc = content.find((m) => m.label === 'Mastercard •••• 4444')!;
    await api.payments.removeMethod(mc.id);
    expect((await api.payments.methods()).content.some((m) => m.id === mc.id)).toBe(false);
    await asLeo();
    await expectError(api.payments.methods(), 403);
  });
});

describe('creator withdrawals (FR-63, v2.0)', () => {
  it('withdraws standard (free) or instant (1%, at least ₹10) from the available balance', async () => {
    await asLeo();
    const before = await api.payouts.balance();
    expect(before.account).toMatchObject({ status: 'VERIFIED', method: 'BANK_ACCOUNT' });
    expect(before.availableCents).toBeGreaterThan(100_000);
    await expectError(api.payouts.withdraw({ amountCents: 10_000, speed: 'STANDARD' }, key()), 422);
    await expectError(api.payouts.withdraw({ amountCents: before.availableCents + 1, speed: 'STANDARD' }, key()), 422);

    const std = await api.payouts.withdraw({ amountCents: 50_000, speed: 'STANDARD' }, key());
    expect(std).toMatchObject({ amountCents: 50_000, feeCents: 0, speed: 'STANDARD', status: 'IN_TRANSIT' });
    const rest = before.availableCents - 50_000;
    const inst = await api.payouts.withdraw({ amountCents: rest, speed: 'INSTANT' }, key());
    expect(inst).toMatchObject({ amountCents: rest, feeCents: instantFee(rest), speed: 'INSTANT' });
    expect(instantFee(50_000)).toBe(1_000); // ₹10 minimum
    expect(instantFee(1_000_000)).toBe(10_000); // 1%

    const after = await api.payouts.balance();
    expect(after.availableCents).toBe(0);
    expect(accountBalance(getDb().ledgerEntries, 'PLATFORM_REVENUE', `payout_${after.payouts.find((p) => p.speed === 'INSTANT')!.id}`)).toBe(instantFee(rest));
    expect(findUnbalancedTxns(getDb().ledgerEntries)).toEqual([]);
  });

  it('needs a verified payout account', async () => {
    await asLeo();
    await api.payouts.saveAccount({ ...VALID_PAYOUT_ACCOUNT, accountNumber: '000000000' });
    await expectError(api.payouts.withdraw({ amountCents: 50_000, speed: 'STANDARD' }, key()), 409, 'PAYOUT_ACCOUNT_REQUIRED');
  });

  it('skips the Monday payout when the creator turns weekly payouts off', async () => {
    await asLeo();
    const o = await api.payouts.settings(false);
    expect(o.autoWeekly).toBe(false);
    const available = o.availableCents;
    await api.dev.simulateTime(24 * 8);
    await asLeo();
    const after = await api.payouts.balance();
    expect(after.payouts).toEqual([]);
    expect(after.availableCents).toBeGreaterThanOrEqual(available);
  });
});
