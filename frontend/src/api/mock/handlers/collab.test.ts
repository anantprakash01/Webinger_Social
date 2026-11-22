import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { payFor } from '@/test/payments';
import type { OrderBrief } from '@/types';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';
import { findUnbalancedTxns } from '../ledger';

const brief: OrderBrief = { requirements: 'A short Reel with the tote bag, natural light.', needsShipping: false, links: [], referenceFiles: [] };
const shippingBrief: OrderBrief = {
  ...brief,
  needsShipping: true,
  shippingAddress: { name: 'Saltbay Supply Co.', line1: '12 Residency Road', city: 'Bengaluru', postalCode: '560025', country: 'IN' },
};
const leoId = () => getDb().users.find((u) => u.email === 'creator@demo.test')!.id;
const leoPackage = () => getDb().packages.filter((k) => k.creatorId === leoId() && k.active).sort((a, b) => a.priceCents - b.priceCents)[0];
let n = 0;
const key = () => `collab-${++n}`;
const asBrand = () => api.auth.login('brand@demo.test', DEMO_PASSWORD);
const asLeo = () => api.auth.login('creator@demo.test', DEMO_PASSWORD);

/** A fresh Saltbay → Leo order, accepted (IN_PROGRESS) unless told otherwise. */
async function newOrder(opts: { brief?: OrderBrief; addonIds?: string[]; accept?: boolean } = {}) {
  await asBrand();
  const pkg = leoPackage();
  const q = { packageId: pkg.id, addonIds: opts.addonIds?.join(',') };
  const { orderId } = await api.orders.create({ packageId: pkg.id, brief: opts.brief ?? brief, payment: await payFor(q), addonIds: opts.addonIds }, key());
  if (opts.accept !== false) {
    await asLeo();
    await api.orders.accept(orderId, key());
  }
  return orderId;
}

beforeEach(async () => {
  await api.dev.reset();
});

describe('package add-ons (phase C)', () => {
  it('prices chosen add-ons into the order and fixes rush days and revisions on it', async () => {
    const pkg = leoPackage();
    const rush = pkg.addons!.find((a) => a.kind === 'RUSH')!;
    const extra = pkg.addons!.find((a) => a.kind === 'EXTRA_REVISION')!;
    const usage = pkg.addons!.find((a) => a.kind === 'USAGE_RIGHTS')!;
    await asBrand();
    const q = await api.orders.quote({ packageId: pkg.id, addonIds: [rush.id, extra.id, usage.id].join(',') });
    expect(q.priceCents).toBe(pkg.priceCents + rush.priceCents + extra.priceCents + usage.priceCents);
    await expect(api.orders.quote({ packageId: pkg.id, addonIds: 'nope' })).rejects.toMatchObject({ status: 422 });

    const id = await newOrder({ addonIds: [rush.id, extra.id, usage.id] });
    const o = await api.orders.get(id);
    expect(o.money.priceCents).toBe(q.priceCents);
    expect(o.deliveryDays).toBe(rush.rushDays);
    expect(o.maxRevisions).toBe(3);
    expect(o.usageRights).toBe(`Paid ads for ${usage.usageDays} days`);
    expect(o.addons.map((a) => a.kind).sort()).toEqual(['EXTRA_REVISION', 'RUSH', 'USAGE_RIGHTS']);
    expect(findUnbalancedTxns(getDb().ledgerEntries)).toEqual([]);
  });

  it('validates add-ons when a creator saves a package', async () => {
    await asLeo();
    const base = { platform: 'INSTAGRAM' as const, title: 'Story set', description: 'Three stories with a link sticker to your store.', deliverables: ['3 stories'], priceCents: 300_000, deliveryDays: 4, active: false };
    await expect(api.creatorMe.createPackage({ ...base, addons: [{ kind: 'RUSH', title: 'Rush', priceCents: 50_000, rushDays: 4 }] })).rejects.toMatchObject({ status: 422 });
    await expect(
      api.creatorMe.createPackage({ ...base, addons: [{ kind: 'EXTRA_REVISION', title: 'Extra', priceCents: 50_000 }, { kind: 'EXTRA_REVISION', title: 'Again', priceCents: 50_000 }] }),
    ).rejects.toMatchObject({ status: 422 });
    const k = await api.creatorMe.createPackage({ ...base, addons: [{ kind: 'USAGE_RIGHTS', title: 'Ads 60 days', priceCents: 90_000, usageDays: 60 }] });
    expect(k.addons).toEqual([expect.objectContaining({ kind: 'USAGE_RIGHTS', usageDays: 60, rushDays: null })]);
    // Editing keeps the id, so open checkouts still match.
    const again = await api.creatorMe.updatePackage(k.id, { addons: [{ kind: 'USAGE_RIGHTS', title: 'Ads 90 days', priceCents: 120_000, usageDays: 90 }] });
    expect(again.addons![0].id).toBe(k.addons![0].id);
  });
});

describe('drafts before posting (phase C)', () => {
  it('lets the creator share drafts and the brand approve or ask for changes, without moving money', async () => {
    const id = await newOrder();
    const items = [{ type: 'POST_URL' as const, url: 'https://example.com/draft/1' }];
    let o = await api.orders.shareDraft(id, { items, note: 'First cut' });
    expect(o.drafts[0]).toMatchObject({ status: 'PENDING', note: 'First cut' });
    await expect(api.orders.shareDraft(id, { items })).rejects.toMatchObject({ status: 409 });
    await expect(api.orders.reviewDraft(id, o.drafts[0].id, { decision: 'APPROVE' })).rejects.toMatchObject({ status: 403 });

    await asBrand();
    await expect(api.orders.reviewDraft(id, o.drafts[0].id, { decision: 'CHANGES', note: 'short' })).rejects.toMatchObject({ status: 422 });
    o = await api.orders.reviewDraft(id, o.drafts[0].id, { decision: 'CHANGES', note: 'Show the logo in the first 3 seconds.' });
    expect(o.drafts[0]).toMatchObject({ status: 'CHANGES_REQUESTED', feedback: 'Show the logo in the first 3 seconds.' });

    await asLeo();
    o = await api.orders.shareDraft(id, { items });
    await asBrand();
    o = await api.orders.reviewDraft(id, o.drafts[0].id, { decision: 'APPROVE' });
    expect(o.drafts.map((d) => d.status)).toEqual(['APPROVED', 'CHANGES_REQUESTED']);
    expect(o.status).toBe('IN_PROGRESS');
    expect(o.revisionCount).toBe(0);
    expect(o.events.map((e) => e.type)).toEqual(expect.arrayContaining(['DRAFT_SHARED', 'DRAFT_CHANGES_REQUESTED', 'DRAFT_APPROVED']));
    // The creator was told.
    expect(getDb().notifications.some((x) => x.userId === leoId() && x.title === 'Draft approved')).toBe(true);
  });
});

describe('product shipping (phase C)', () => {
  it('records the courier and tracking, and the creator confirms receipt', async () => {
    const plain = await newOrder();
    await asBrand();
    await expect(api.orders.saveShipment(plain, { courier: 'Delhivery', trackingNumber: 'DL123456' })).rejects.toMatchObject({ status: 409 });

    const id = await newOrder({ brief: shippingBrief, accept: false });
    await asBrand();
    await expect(api.orders.saveShipment(id, { courier: 'D', trackingNumber: '1' })).rejects.toMatchObject({ status: 422 });
    let o = await api.orders.saveShipment(id, { courier: 'Delhivery', trackingNumber: 'DL123456' });
    expect(o.shipment).toMatchObject({ courier: 'Delhivery', trackingNumber: 'DL123456', receivedAt: null });
    await asLeo();
    o = await api.orders.markReceived(id);
    expect(o.shipment!.receivedAt).not.toBeNull();
    await expect(api.orders.markReceived(id)).rejects.toMatchObject({ status: 409 });
    await asBrand();
    await expect(api.orders.saveShipment(id, { courier: 'Blue Dart', trackingNumber: 'BD99999' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('more time (phase C)', () => {
  it('moves the due date only when the brand accepts', async () => {
    const id = await newOrder();
    const before = (await api.orders.get(id)).dueAt!;
    await expect(api.orders.requestExtension(id, { extraDays: 15, reason: 'The product arrived late.' })).rejects.toMatchObject({ status: 422 });
    let o = await api.orders.requestExtension(id, { extraDays: 3, reason: 'The product arrived late.' });
    expect(o.extension).toMatchObject({ status: 'PENDING', extraDays: 3 });
    await expect(api.orders.requestExtension(id, { extraDays: 2, reason: 'Another reason here.' })).rejects.toMatchObject({ status: 409 });

    await asBrand();
    o = await api.orders.reviewExtension(id, 'DECLINE');
    expect(o.dueAt).toBe(before);
    await asLeo();
    await api.orders.requestExtension(id, { extraDays: 3, reason: 'The product arrived late.' });
    await asBrand();
    o = await api.orders.reviewExtension(id, 'ACCEPT');
    expect(new Date(o.dueAt!).getTime() - new Date(before).getTime()).toBe(3 * 86_400_000);
    expect(o.extension!.status).toBe('ACCEPTED');
    await expect(api.orders.reviewExtension(id, 'ACCEPT')).rejects.toMatchObject({ status: 409 });
  });
});

describe('post results (phase C)', () => {
  it('lets the creator record views and engagement on a delivered post, shown on the brand dashboard', async () => {
    const id = await newOrder();
    let o = await api.orders.deliver(id, { items: [{ type: 'FILE', url: 'data:image/png;base64,AA', name: 'Raw' }, { type: 'POST_URL', url: 'https://example.com/p/9' }], note: null }, key());
    const d = o.deliveries[0];
    await expect(api.orders.saveMetrics(id, d.id, { itemIndex: 0, views: 1, likes: 1, comments: 1 })).rejects.toMatchObject({ status: 422 });
    o = await api.orders.saveMetrics(id, d.id, { itemIndex: 1, views: 54_000, likes: 3_100, comments: 120, reach: 40_000 });
    expect(o.deliveries[0].items[1].metrics).toMatchObject({ views: 54_000, likes: 3_100, comments: 120, shares: null, reach: 40_000 });

    await asBrand();
    await expect(api.orders.saveMetrics(id, d.id, { itemIndex: 1, views: 1, likes: 1, comments: 1 })).rejects.toMatchObject({ status: 403 });
    const stats = await api.brands.stats();
    expect(stats.deliveredPosts.find((p) => p.orderId === id)?.metrics).toMatchObject({ views: 54_000 });
  });
});
