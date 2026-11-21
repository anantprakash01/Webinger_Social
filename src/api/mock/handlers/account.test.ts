import { brandTotalCents } from '../orderMachine';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';
import { accountBalance, findUnbalancedTxns } from '../ledger';

let n = 0;
const key = () => `acct-${++n}`;
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

describe('FR-37: admin cancels an accepted order', () => {
  it('refunds the brand in full, notifies both sides and audits it; only admins can', async () => {
    const order = getDb().orders.find((o) => o.status === 'IN_PROGRESS')!;
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    await expectError(api.admin.cancelOrder(order.id, 'Creator stopped responding.', key()), 403);
    await api.auth.login('admin@demo.test', DEMO_PASSWORD);
    expect((await api.orders.get(order.id)).allowedActions).toContain('ADMIN_CANCEL');
    await expectError(api.admin.cancelOrder(order.id, 'short', key()), 422);
    const r = await api.admin.cancelOrder(order.id, 'Creator stopped responding for a week.', key());
    const total = brandTotalCents(order);
    expect(r).toMatchObject({ status: 'REFUNDED', refundedCents: total });
    expect(accountBalance(getDb().ledgerEntries, 'ESCROW', order.id)).toBe(0);
    expect(findUnbalancedTxns(getDb().ledgerEntries)).toEqual([]);
    expect((await api.admin.audit({ action: 'ORDER_CANCELLED' })).content[0].entityId).toBe(order.id);
    expect(getDb().notifications.filter((x) => x.title === 'Order cancelled by our team')).toHaveLength(2);
    await expectError(api.admin.cancelOrder(order.id, 'Trying to cancel twice.', key()), 409);
  });
});

describe('account settings (v2.2)', () => {
  it('changes the password and signs out other devices', async () => {
    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    const other = getDb().refreshTokens.find((r) => !r.revokedAt)!;
    await api.auth.login('creator@demo.test', DEMO_PASSWORD); // a second device
    await expectError(api.me.changePassword('wrong-password', 'Newpass123!'), 422);
    await api.me.changePassword(DEMO_PASSWORD, 'Newpass123!');
    expect(getDb().refreshTokens.find((r) => r.token === other.token)!.revokedAt).not.toBeNull();
    await expectError(api.auth.login('creator@demo.test', DEMO_PASSWORD), 401);
    expect((await api.auth.login('creator@demo.test', 'Newpass123!')).email).toBe('creator@demo.test');
  });

  it('changes the email, which must be verified again', async () => {
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    await expectError(api.me.changeEmail('creator@demo.test', DEMO_PASSWORD), 409, 'EMAIL_TAKEN');
    const me = await api.me.changeEmail('maya@saltbay.example.com', DEMO_PASSWORD);
    expect(me).toMatchObject({ email: 'maya@saltbay.example.com', emailVerified: false });
    expect(getDb().outbox[0]).toMatchObject({ to: 'maya@saltbay.example.com', subject: 'Confirm your email address' });
  });

  it('exports the user data without secrets', async () => {
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    const data = await api.me.exportData();
    expect((data.orders as unknown[]).length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toContain('passwordHash');
    expect(data.account).toMatchObject({ email: 'brand@demo.test' });
  });

  it('deletes an account after 30 days unless cancelled; open orders block it', async () => {
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    await expectError(api.me.requestDeletion(DEMO_PASSWORD, null), 409, 'OPEN_ORDERS');

    await api.auth.register({ role: 'BRAND', name: 'Asha Rao', email: 'asha@example.com', password: 'Strongpass1!', acceptTerms: true });
    await expectError(api.me.requestDeletion('wrong', null), 422);
    const me = await api.me.requestDeletion('Strongpass1!', 'Testing');
    expect(me.deletionScheduledFor).toBeTruthy();
    expect((await api.me.cancelDeletion()).deletionScheduledFor).toBeNull();
    await api.me.requestDeletion('Strongpass1!', null);
    // Simulate time moves at most 720 h per step.
    await api.dev.simulateTime(24 * 16);
    await api.dev.simulateTime(24 * 15);
    const u = getDb().users.find((x) => x.email.startsWith('deleted-'))!;
    expect(u).toMatchObject({ name: 'Deleted user', status: 'BANNED', passwordHash: null });
    await expectError(api.auth.login('asha@example.com', 'Strongpass1!'), 401);
  });
});
