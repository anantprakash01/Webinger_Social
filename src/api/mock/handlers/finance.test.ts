import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';
import { accountBalance, findUnbalancedTxns } from '../ledger';

const asAdmin = () => api.auth.login('admin@demo.test', DEMO_PASSWORD);
let n = 0;
const key = () => `fin-${++n}`;

beforeEach(async () => {
  await api.dev.reset();
});

describe('finance dashboard (v3.4)', () => {
  it('reports flows and balances from the ledger, and every reconciliation check passes on the seed', async () => {
    await asAdmin();
    const f = await api.admin.finance(365);
    const L = getDb().ledgerEntries;
    expect(f.balances.escrowCents).toBe(accountBalance(L, 'ESCROW'));
    expect(f.balances.creatorBalancesCents).toBe(accountBalance(L, 'CREATOR_BALANCE'));
    expect(f.flows.gmvCents).toBeGreaterThan(0);
    expect(f.flows.subscriptionsCents).toBeGreaterThan(0);
    expect(f.byMonth).toHaveLength(6);
    expect(f.reconciliation.checks.map((c) => c.id)).toEqual(['ledger-balanced', 'payments-captured', 'escrow-open-orders', 'payouts', 'subscriptions', 'razorpay-amounts', 'stale-authorisations']);
    expect(f.reconciliation.mismatches).toEqual([]);
    expect(f.reconciliation.ok).toBe(true);
  });

  it('flags a ledger that does not match the payment record', async () => {
    await asAdmin();
    const o = getDb().orders.find((x) => x.payment.status === 'CAPTURED')!;
    o.payment.amountCents += 100;
    const f = await api.admin.finance();
    expect(f.reconciliation.ok).toBe(false);
    expect(f.reconciliation.mismatches).toContainEqual(expect.objectContaining({ check: 'payments-captured', ref: o.id, expectedCents: o.payment.amountCents - o.payment.refundedCents }));
  });

  it('lists the failed payout; an admin retries it once, from the returned balance', async () => {
    await asAdmin();
    const f = await api.admin.finance();
    const p = f.payoutsNeedingAttention[0];
    expect(p).toMatchObject({ status: 'FAILED', accountStatus: 'VERIFIED', retriedAs: null });
    const failed = getDb().payouts.find((x) => x.id === p.id)!;
    expect(accountBalance(getDb().ledgerEntries, 'PAYOUT', `payout_${p.id}`)).toBe(0);
    const again = await api.admin.retryPayout(p.id, key());
    expect(again).toMatchObject({ amountCents: p.amountCents, speed: 'STANDARD' });
    expect(failed.retriedAs).toBe(again.id);
    await expect(api.admin.retryPayout(p.id, key())).rejects.toMatchObject({ status: 409, code: 'ALREADY_RETRIED' });
    const after = await api.admin.finance();
    expect(after.payoutsNeedingAttention[0].retriedAs).toBe(again.id);
    expect(after.reconciliation.ok).toBe(true);
    expect(findUnbalancedTxns(getDb().ledgerEntries)).toEqual([]);
    expect((await api.admin.audit({ action: 'PAYOUT_RETRIED' })).totalElements).toBe(1);
  });

  it('is admin-only', async () => {
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    await expect(api.admin.finance()).rejects.toMatchObject({ status: 403 });
  });
});
