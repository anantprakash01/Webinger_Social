import { beforeEach, describe, expect, it } from 'vitest';
import { api, currentUser } from '@/api/client';
import type { OrderBrief } from '@/types';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';
import { accountBalance, findUnbalancedTxns } from '../ledger';

const asAdmin = () => api.auth.login('admin@demo.test', DEMO_PASSWORD);
const asBrand = () => api.auth.login('brand@demo.test', DEMO_PASSWORD);
const asLeo = () => api.auth.login('creator@demo.test', DEMO_PASSWORD);
const leoId = () => getDb().users.find((u) => u.email === 'creator@demo.test')!.id;
const brief: OrderBrief = { requirements: 'A short Reel with the tote bag, natural light.', needsShipping: false, links: [], referenceFiles: [] };
let n = 0;
const key = () => `wk6-${++n}`;

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

describe('admin access', () => {
  it('summarises the queues and refuses non-admins', async () => {
    await asAdmin();
    expect(await api.admin.summary()).toEqual({ pendingVetting: 3, openDisputes: 1, openReports: 2 });
    await asBrand();
    await expectError(api.admin.summary(), 403, 'ROLE_NOT_ALLOWED');
    await expectError(api.admin.users(), 403);
  });
});

describe('vetting (FR-80)', () => {
  it('approves a creator into search and notifies them', async () => {
    await asAdmin();
    const queue = await api.admin.vetting();
    expect(queue.content).toHaveLength(3);
    const c = queue.content[0];
    expect(c.socials.length).toBeGreaterThan(0);
    await api.admin.approveCreator(c.creatorId);
    expect((await api.admin.vetting()).content).toHaveLength(2);
    expect((await api.creators.search({ q: c.username! })).totalElements).toBe(1);
    expect(getDb().notifications.find((x) => x.userId === c.creatorId)).toMatchObject({ type: 'PROFILE_APPROVED' });
    expect((await api.admin.audit({ action: 'CREATOR_APPROVED' })).content[0].entityId).toBe(c.creatorId);
    await expectError(api.admin.approveCreator(c.creatorId), 409);
  });

  it('rejects with a reason the creator sees', async () => {
    await asAdmin();
    const c = (await api.admin.vetting()).content[0];
    await expectError(api.admin.rejectCreator(c.creatorId, 'short'), 422);
    const r = await api.admin.rejectCreator(c.creatorId, 'Please link a public account we can verify.');
    expect(r).toMatchObject({ vettingStatus: 'REJECTED', rejectionReason: 'Please link a public account we can verify.' });
  });
});

describe('disputes (FR-81, FR-64)', () => {
  it('releases the payment to the creator', async () => {
    await asAdmin();
    const [d] = (await api.admin.disputes('OPEN')).content;
    const res = await api.admin.resolveDispute(d.id, { resolution: 'RELEASE', note: 'The delivery matches the brief.' }, key());
    expect(res).toMatchObject({ status: 'RESOLVED', resolution: 'RELEASE', refundCents: 0 });
    expect(getDb().orders.find((o) => o.id === d.orderId)!.status).toBe('COMPLETED');
    expect(accountBalance(getDb().ledgerEntries, 'ESCROW', d.orderId)).toBe(0);
    await expectError(api.admin.resolveDispute(d.id, { resolution: 'RELEASE', note: 'Trying to resolve twice.' }, key()), 409);
    expect((await api.admin.audit({ action: 'DISPUTE_RESOLVED' })).content[0].entityId).toBe(d.orderId);
  });

  it('refunds in part (capped at the creator payout) or in full', async () => {
    await asAdmin();
    const [d] = (await api.admin.disputes('OPEN')).content;
    await expectError(api.admin.resolveDispute(d.id, { resolution: 'PARTIAL_REFUND', refundCents: d.money.creatorPayoutCents + 1, note: 'Too much refund attempted.' }, key()), 422, 'INVALID_REFUND_AMOUNT');
    await expectError(api.admin.resolveDispute(d.id, { resolution: 'PARTIAL_REFUND', note: 'Missing the refund amount.' }, key()), 422);
    const res = await api.admin.resolveDispute(d.id, { resolution: 'FULL_REFUND', note: 'Wrong product shown throughout.' }, key());
    expect(res).toMatchObject({ resolution: 'FULL_REFUND', refundCents: d.money.totalCents });
    const o = getDb().orders.find((x) => x.id === d.orderId)!;
    expect(o).toMatchObject({ status: 'REFUNDED', payment: { status: 'REFUNDED', refundedCents: d.money.totalCents } });
    expect(findUnbalancedTxns(getDb().ledgerEntries)).toEqual([]);
  });
});

describe('users (FR-82)', () => {
  it('suspends a creator: sessions end, profile and search hide them; reactivating restores', async () => {
    await asAdmin();
    const leo = (await api.admin.users({ q: 'leo marin' })).content[0];
    expect(leo).toMatchObject({ role: 'CREATOR', status: 'ACTIVE', label: 'leomakes' });
    await expectError(api.admin.updateUser(leo.id, { status: 'SUSPENDED', reason: 'short' }), 422);
    await api.admin.updateUser(leo.id, { status: 'SUSPENDED', reason: 'Investigating a fraud report.' });
    expect(getDb().refreshTokens.filter((r) => r.userId === leo.id && !r.revokedAt)).toEqual([]);
    expect((await api.creators.search({ q: 'leomakes' })).totalElements).toBe(0);
    await api.auth.logout(); // admins may still preview the profile; the public may not
    await expectError(api.creators.profile('leomakes'), 404);
    await expectError(api.auth.login('creator@demo.test', DEMO_PASSWORD), 403, 'ACCOUNT_SUSPENDED');
    await asAdmin();
    await api.admin.updateUser(leo.id, { status: 'ACTIVE', reason: 'Report checked, all fine.' });
    expect((await api.creators.search({ q: 'leomakes' })).totalElements).toBe(1);
    const me = getDb().users.find((u) => u.email === 'admin@demo.test')!;
    await expectError(api.admin.updateUser(me.id, { status: 'BANNED', reason: 'Trying to ban myself.' }), 403, 'SELF_CHANGE');
  });

  it('impersonation is read-only, audited, and returns to the admin', async () => {
    await asAdmin();
    const brand = (await api.admin.users({ q: 'brand@demo.test' })).content[0];
    const viewed = await api.admin.impersonate(brand.id);
    expect(viewed).toMatchObject({ email: 'brand@demo.test', impersonatedBy: 'Sam Ortega' });
    expect((await api.me.get()).impersonatedBy).toBe('Sam Ortega');
    expect((await api.orders.list()).totalElements).toBeGreaterThan(0);
    const pkg = getDb().packages.find((k) => k.creatorId === leoId() && k.active)!;
    await expectError(api.orders.create({ packageId: pkg.id, brief }, key()), 403, 'READ_ONLY_IMPERSONATION');
    await api.auth.stopImpersonating();
    expect(currentUser()).toMatchObject({ email: 'admin@demo.test' });
    expect((await api.admin.audit({ action: 'IMPERSONATION_STARTED' })).content[0].entityId).toBe(brand.id);
  });
});

describe('fees (FR-83)', () => {
  it('new orders use the new fees; existing orders keep theirs', async () => {
    const existing = getDb().orders[0];
    await asAdmin();
    await expectError(api.admin.updateFees({ brandFeeBps: 5000, creatorFeeBps: 1500 }), 422);
    const s = await api.admin.updateFees({ brandFeeBps: 800, creatorFeeBps: 1200 });
    expect(s.current).toMatchObject({ brandFeeBps: 800, creatorFeeBps: 1200, changedBy: 'Sam Ortega' });
    expect(s.history).toHaveLength(2);
    expect(await api.fees.current()).toMatchObject({ brandFeeBps: 800, creatorFeeBps: 1200 });
    await asBrand();
    const pkg = getDb().packages.find((k) => k.creatorId === leoId() && k.active)!;
    const res = await api.orders.create({ packageId: pkg.id, brief }, key());
    expect(res.brandFeeCents).toBe(Math.floor((pkg.priceCents * 800 + 5000) / 10000));
    expect(getDb().orders.find((o) => o.id === existing.id)!.brandFeeBps).toBe(1000);
  });
});

describe('audit log (FR-84)', () => {
  it('records every money movement, including new ones', async () => {
    await asAdmin();
    const before = (await api.admin.audit({ action: 'MONEY_MOVEMENT' })).totalElements;
    expect(before).toBe(new Set(getDb().ledgerEntries.map((e) => e.txnId)).size);
    await asBrand();
    const pkg = getDb().packages.find((k) => k.creatorId === leoId() && k.active)!;
    const { orderId } = await api.orders.create({ packageId: pkg.id, brief }, key());
    await asLeo();
    await api.orders.accept(orderId, key());
    await asAdmin();
    const after = await api.admin.audit({ action: 'MONEY_MOVEMENT' });
    expect(after.totalElements).toBe(before + 1);
    expect(after.content[0]).toMatchObject({ entityId: orderId, actorName: 'Leo Marin' });
  });
});

describe('reports (FR-85)', () => {
  it('anyone can report; admins resolve', async () => {
    await asBrand();
    await expectError(api.reports.create({ targetType: 'CREATOR', targetId: 'nobody-at-all', reason: 'SPAM' }), 404);
    const r = await api.reports.create({ targetType: 'CREATOR', targetId: 'leomakes', reason: 'SCAM', details: 'Asked for a deposit by email.' });
    expect(r).toMatchObject({ status: 'OPEN', targetLabel: 'Creator Leo Marin (@leomakes)', targetLink: '/u/leomakes' });
    await expectError(api.reports.create({ targetType: 'CREATOR', targetId: 'leomakes', reason: 'SCAM' }), 409, 'ALREADY_REPORTED');
    await asAdmin();
    const open = (await api.admin.reports('OPEN')).content;
    expect(open.map((x) => x.id)).toContain(r.id);
    const done = await api.admin.resolveReport(r.id, { status: 'DISMISSED', note: 'No evidence found.' });
    expect(done).toMatchObject({ status: 'DISMISSED', resolutionNote: 'No evidence found.' });
    await expectError(api.admin.resolveReport(r.id, { status: 'DISMISSED', note: 'Again please.' }), 409);
  });
});

describe('payouts (FR-63)', () => {
  it('pays the available balance to the bank on Monday and records it', async () => {
    await asLeo();
    const before = await api.payouts.balance();
    expect(before.availableCents).toBeGreaterThan(0);
    expect(before.transfers.length).toBeGreaterThan(0);
    expect(before.payouts).toEqual([]);
    expect(new Date(before.nextPayoutAt).getUTCDay()).toBe(1);
    await api.dev.simulateTime(24 * 8);
    await asLeo(); // 8 days later the 7-day sign-in has expired, as it should
    const after = await api.payouts.balance();
    expect(after.payouts[0]).toMatchObject({ amountCents: before.availableCents + (after.lifetimeEarnedCents - before.lifetimeEarnedCents) - after.availableCents });
    expect(after.paidOutCents).toBe(after.payouts.reduce((s, p) => s + p.amountCents, 0));
    expect(after.availableCents).toBe(after.lifetimeEarnedCents - after.paidOutCents);
    expect((await api.creatorMe.stats()).availableCents).toBe(after.availableCents);
    expect(findUnbalancedTxns(getDb().ledgerEntries)).toEqual([]);
    expect((await api.notifications.list()).content.some((x) => x.type === 'PAYOUT_SENT')).toBe(true);
  });
});
