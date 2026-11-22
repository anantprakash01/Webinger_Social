import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { payFor } from '@/test/payments';
import type { OrderBrief } from '@/types';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';

const brief: OrderBrief = { requirements: 'A short Reel with the tote bag, natural light.', needsShipping: false, links: [], referenceFiles: [] };
let n = 0;
const key = () => `disp-${++n}`;
const asBrand = () => api.auth.login('brand@demo.test', DEMO_PASSWORD);
const asLeo = () => api.auth.login('creator@demo.test', DEMO_PASSWORD);
const asAdmin = () => api.auth.login('admin@demo.test', DEMO_PASSWORD);
const leoId = () => getDb().users.find((u) => u.email === 'creator@demo.test')!.id;

/** A fresh order with Leo, delivered and disputed by the brand. */
async function disputedOrder() {
  await asBrand();
  const pkg = getDb().packages.filter((k) => k.creatorId === leoId() && k.active)[0];
  const created = await api.orders.create({ packageId: pkg.id, brief, payment: await payFor({ packageId: pkg.id }) }, key());
  await asLeo();
  await api.orders.accept(created.orderId, key());
  await api.orders.deliver(created.orderId, { items: [{ type: 'POST_URL', url: 'https://www.instagram.com/p/demo123/' }], note: null }, key());
  await asBrand();
  const o = await api.orders.dispute(created.orderId, 'The product is not visible in the first ten seconds.', key(), 'NOT_AS_BRIEFED');
  return o;
}

beforeEach(async () => {
  await api.dev.reset();
});

describe('dispute handling (v3.1)', () => {
  it('records the reason, gives the creator 48 h to respond once, and notifies the brand', async () => {
    const o = await disputedOrder();
    expect(o.dispute).toMatchObject({ status: 'OPEN', reasonCode: 'NOT_AS_BRIEFED', creatorResponse: null, evidence: [] });
    expect(new Date(o.dispute!.respondBy).getTime() - new Date(o.dispute!.openedAt).getTime()).toBe(48 * 3_600_000);
    expect(o.allowedActions).toContain('ADD_EVIDENCE');
    expect(o.allowedActions).not.toContain('DISPUTE_RESPOND');
    await expect(api.orders.respondToDispute(o.id, 'Brands cannot answer their own dispute.')).rejects.toMatchObject({ status: 403 });

    await asLeo();
    const seen = await api.orders.get(o.id);
    expect(seen.allowedActions).toEqual(expect.arrayContaining(['DISPUTE_RESPOND', 'ADD_EVIDENCE']));
    await expect(api.orders.respondToDispute(o.id, 'Too short')).rejects.toMatchObject({ status: 422 });
    const after = await api.orders.respondToDispute(o.id, 'The product appears at 0:02 as agreed in chat on Monday.');
    expect(after.dispute).toMatchObject({ creatorResponse: 'The product appears at 0:02 as agreed in chat on Monday.' });
    expect(after.allowedActions).not.toContain('DISPUTE_RESPOND');
    await expect(api.orders.respondToDispute(o.id, 'Trying to answer a second time here.')).rejects.toMatchObject({ status: 409, code: 'ALREADY_RESPONDED' });

    await asBrand();
    expect((await api.notifications.list()).content.some((x) => x.type === 'DISPUTE_UPDATE')).toBe(true);
  });

  it('closes the response window after 48 hours', async () => {
    const o = await disputedOrder();
    await api.dev.simulateTime(49);
    await asLeo();
    expect((await api.orders.get(o.id)).allowedActions).not.toContain('DISPUTE_RESPOND');
    await expect(api.orders.respondToDispute(o.id, 'Late answer after the window closed.')).rejects.toMatchObject({ status: 409, code: 'RESPONSE_WINDOW_PASSED' });
  });

  it('takes evidence from both sides (max 5 each, https links) until resolved', async () => {
    const o = await disputedOrder();
    await expect(api.orders.addDisputeEvidence(o.id, { kind: 'LINK', url: 'http://insecure.example.com' })).rejects.toMatchObject({ status: 422 });
    for (let i = 0; i < 5; i++) await api.orders.addDisputeEvidence(o.id, { kind: 'LINK', url: `https://example.com/proof-${i}`, note: `Proof ${i}` });
    await expect(api.orders.addDisputeEvidence(o.id, { kind: 'LINK', url: 'https://example.com/proof-6' })).rejects.toMatchObject({ status: 409, code: 'EVIDENCE_LIMIT' });
    await asLeo();
    const withFile = await api.orders.addDisputeEvidence(o.id, { kind: 'FILE', url: '/demo/work-01.svg', name: 'Timestamped frame' });
    expect(withFile.dispute!.evidence.map((e) => e.by)).toEqual(['BRAND', 'BRAND', 'BRAND', 'BRAND', 'BRAND', 'CREATOR']);

    await asAdmin();
    const d = (await api.admin.disputes('OPEN')).content.find((x) => x.orderId === o.id)!;
    expect(d.evidence).toHaveLength(6);
    await expect(api.admin.resolveDispute(d.id, { resolution: 'RELEASE', note: 'Product is visible early enough.' } as never, key())).rejects.toMatchObject({ status: 422 });
    await api.admin.resolveDispute(d.id, { resolution: 'RELEASE', resolutionReason: 'WORK_MATCHES_BRIEF', note: 'Product is visible early enough.' }, key());

    await asLeo();
    await expect(api.orders.addDisputeEvidence(o.id, { kind: 'LINK', url: 'https://example.com/late' })).rejects.toMatchObject({ status: 409, code: 'DISPUTE_RESOLVED' });
    const done = await api.orders.get(o.id);
    expect(done.dispute).toMatchObject({ status: 'RESOLVED', resolutionReason: 'WORK_MATCHES_BRIEF', resolutionNote: 'Product is visible early enough.' });
  });

  it('reports refunds by reason for admins only', async () => {
    const o = await disputedOrder();
    await asAdmin();
    const d = (await api.admin.disputes('OPEN')).content.find((x) => x.orderId === o.id)!;
    await api.admin.resolveDispute(d.id, { resolution: 'FULL_REFUND', resolutionReason: 'BRIEF_NOT_FOLLOWED', note: 'Brief clearly required the product first.' }, key());
    const r = await api.admin.disputeReport(30);
    expect(r.fullRefunds).toBeGreaterThanOrEqual(1);
    expect(r.byReason.find((x) => x.reason === 'BRIEF_NOT_FOLLOWED')).toMatchObject({ count: 1, refundedCents: d.money.totalCents });
    expect(r.byBrandReason.find((x) => x.reasonCode === 'NOT_AS_BRIEFED')!.count).toBeGreaterThanOrEqual(1);
    await asBrand();
    await expect(api.admin.disputeReport()).rejects.toMatchObject({ status: 403 });
  });
});
