import { payFor, payTotal, UNPAID } from '@/test/payments';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { OrderBrief } from '@/types';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';
import { accountBalance, findUnbalancedTxns } from '../ledger';

const brief: OrderBrief = { requirements: 'Show the tote bag in a morning routine, natural light.', needsShipping: false, links: [], referenceFiles: [] };
let n = 0;
const key = () => `test-key-${++n}`;

const leoId = () => getDb().users.find((u) => u.email === 'creator@demo.test')!.id;
const leoPackage = () => getDb().packages.filter((k) => k.creatorId === leoId() && k.active).sort((a, b) => a.priceCents - b.priceCents)[0];
const asBrand = () => api.auth.login('brand@demo.test', DEMO_PASSWORD);
const asLeo = () => api.auth.login('creator@demo.test', DEMO_PASSWORD);

async function expectError(p: Promise<unknown>, status: number, code?: string) {
  const e = (await p.then(
    () => {
      throw new Error(`expected ${status}`);
    },
    (err) => err,
  )) as { status: number; code?: string; fieldErrors: Array<{ field: string }> };
  expect(e.status).toBe(status);
  if (code) expect(e.code).toBe(code);
  return e;
}

/** Brand places an order for Leo's cheapest package; returns its id. */
async function placeOrder() {
  await asBrand();
  return (await api.orders.create({ packageId: leoPackage().id, brief, payment: await payFor({ packageId: leoPackage().id }) }, key())).orderId;
}

beforeEach(async () => {
  await api.dev.reset();
});

describe('seeded orders', () => {
  it('cover every state for the demo brand, with a balanced ledger', async () => {
    await asBrand();
    const page = await api.orders.list({ size: 50 });
    for (const s of ['PENDING_ACCEPTANCE', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED', 'DISPUTED', 'REFUNDED', 'CLOSED']) {
      expect(page.statusCounts[s], s).toBeGreaterThan(0);
    }
    expect(findUnbalancedTxns(getDb().ledgerEntries)).toEqual([]);
    expect(page.content.some((o) => o.kind === 'CUSTOM_OFFER')).toBe(true);
  });

  it('creators only see orders addressed to them', async () => {
    await asLeo();
    const page = await api.orders.list({ size: 50 });
    expect(page.content.length).toBeGreaterThan(0);
    const mine = new Set(getDb().orders.filter((o) => o.creatorUserId === leoId()).map((o) => o.id));
    for (const o of page.content) expect(mine.has(o.id)).toBe(true);
    expect(page.content.every((o) => o.counterparty.name === 'Saltbay Supply Co.')).toBe(true);
  });

  it('filters by status', async () => {
    await asBrand();
    const page = await api.orders.list({ status: 'DELIVERED,DISPUTED' });
    expect(page.content.length).toBe(page.statusCounts.DELIVERED + page.statusCounts.DISPUTED);
    expect(page.content.every((o) => o.status === 'DELIVERED' || o.status === 'DISPUTED')).toBe(true);
    await expectError(api.orders.list({ status: 'NOPE' }), 422);
  });
});

describe('quote and checkout (FR-30, FR-31, FR-60)', () => {
  it('quotes a package with the brand fee', async () => {
    await asBrand();
    const k = leoPackage();
    const q = await api.orders.quote({ packageId: k.id });
    expect(q).toMatchObject({ kind: 'PACKAGE', priceCents: k.priceCents, brandFeeCents: Math.floor((k.priceCents * 1000 + 5000) / 10000), brandFeeBps: 1000, acceptWindowHours: 72 });
    // Phase B: 18% GST on the service fee (Leo is not GST-registered, so no GST on the price).
    expect(q.taxes).toMatchObject({ intraState: true, creatorGstRegistered: false, creatorGstCents: 0, brandFeeGstCents: Math.floor((q.brandFeeCents * 1800 + 5000) / 10000) });
    expect(q.totalCents).toBe(q.priceCents + q.brandFeeCents + q.taxes.brandFeeGstCents);
    expect(q.creator.username).toBe('leomakes');
  });

  it('quotes a custom offer and refuses bad input', async () => {
    await asBrand();
    expect((await api.orders.quote({ creatorUsername: 'leomakes', priceCents: 1_000_000 })).totalCents).toBe(1_118_000);
    await expectError(api.orders.quote({ creatorUsername: 'leomakes', priceCents: 49_999 }), 422);
    await expectError(api.orders.quote({ creatorUsername: 'nobody' , priceCents: 1_000_000 }), 404);
    await asLeo();
    await expectError(api.orders.quote({ packageId: leoPackage().id }), 403);
  });

  it('places a package order: card authorised, fees copied, 72 h to accept', async () => {
    const id = await placeOrder();
    const o = await api.orders.get(id);
    expect(o).toMatchObject({ status: 'PENDING_ACCEPTANCE', kind: 'PACKAGE', title: leoPackage().title, payment: { status: 'AUTHORIZED', refundedCents: 0 } });
    expect(o.money.totalCents).toBe(o.money.priceCents + o.money.brandFeeCents + o.money.taxes.brandFeeGstCents + o.money.taxes.creatorGstCents);
    expect(new Date(o.acceptBy).getTime() - new Date(o.createdAt).getTime()).toBe(72 * 3_600_000);
    expect(o.allowedActions.sort()).toEqual(['CANCEL', 'EDIT_BRIEF']);
    expect(accountBalance(getDb().ledgerEntries, 'ESCROW', id)).toBe(0); // nothing captured yet
  });

  it('places a custom offer (FR-31)', async () => {
    await asBrand();
    const res = await api.orders.create(
      { creatorUsername: 'leomakes', offer: { title: 'Two-part series', platform: 'TIKTOK', deliverables: ['2 TikToks'], priceCents: 50_000, deliveryDays: 10 }, brief, payment: await payTotal(55_900) },
      key(),
    );
    expect(res.totalCents).toBe(55_900); // ₹500 + ₹50 fee + ₹9 GST on the fee
    expect(await api.orders.get(res.orderId)).toMatchObject({ kind: 'CUSTOM_OFFER', title: 'Two-part series', packageId: null, deliverables: ['2 TikToks'], deliveryDays: 10 });
  });

  it('is idempotent: the same key returns the same order', async () => {
    await asBrand();
    const k = key();
    const before = getDb().orders.length;
    const payment = await payFor({ packageId: leoPackage().id });
    const a = await api.orders.create({ packageId: leoPackage().id, brief, payment }, k);
    const b = await api.orders.create({ packageId: leoPackage().id, brief, payment }, k);
    expect(b.orderId).toBe(a.orderId);
    expect(getDb().orders.length).toBe(before + 1);
    await expectError(api.orders.accept(a.orderId, k), 422, 'IDEMPOTENCY_KEY_REUSED');
  });

  it('needs a verified brand and a valid brief', async () => {
    await api.auth.login('unverified@demo.test', DEMO_PASSWORD);
    await expectError(api.orders.create({ packageId: leoPackage().id, brief, payment: UNPAID }, key()), 403, 'EMAIL_NOT_VERIFIED');
    await asBrand();
    const e = await expectError(api.orders.create({ packageId: leoPackage().id, brief: { ...brief, requirements: 'too short' }, payment: UNPAID }, key()), 422);
    expect(e.fieldErrors.map((f) => f.field)).toContain('brief.requirements');
    await expectError(api.orders.create({ packageId: leoPackage().id, brief: { ...brief, needsShipping: true }, payment: UNPAID }, key()), 422);
    await asLeo();
    await expectError(api.orders.create({ packageId: leoPackage().id, brief, payment: UNPAID }, key()), 403);
  });

  it('refuses switched-off packages, and packages with orders cannot be deleted', async () => {
    const id = await placeOrder();
    await asLeo();
    await expectError(api.creatorMe.deletePackage(leoPackage().id), 409, 'PACKAGE_HAS_ORDERS');
    const pkgId = getDb().orders.find((o) => o.id === id)!.packageId!;
    await api.creatorMe.updatePackage(pkgId, { active: false });
    await asBrand();
    await expectError(api.orders.create({ packageId: pkgId, brief, payment: UNPAID }, key()), 409, 'PACKAGE_UNAVAILABLE');
  });
});

describe('order lifecycle through the API', () => {
  it('accept → deliver → approve pays the creator; review and one reply (FR-32, FR-34, FR-35, FR-38)', async () => {
    const id = await placeOrder();
    await asLeo();
    const statsBefore = await api.creatorMe.stats();
    let o = await api.orders.get(id);
    expect(o.allowedActions.sort()).toEqual(['ACCEPT', 'CANCEL', 'DECLINE']);
    expect(o.needsAction).toBe(true);

    o = await api.orders.accept(id, key());
    expect(o).toMatchObject({ status: 'IN_PROGRESS', payment: { status: 'CAPTURED' } });
    expect(o.dueAt).not.toBeNull();
    expect(accountBalance(getDb().ledgerEntries, 'ESCROW', id)).toBe(o.money.totalCents);

    await expectError(api.orders.deliver(id, { items: [{ type: 'POST_URL', url: 'http://insecure.example.com' }] }, key()), 422);
    o = await api.orders.deliver(id, { items: [{ type: 'POST_URL', url: 'https://example.com/p/1', name: 'Reel' }], note: 'Here you go' }, key());
    expect(o.status).toBe('DELIVERED');
    expect(o.deliveries[0]).toMatchObject({ revisionNo: 0, note: 'Here you go' });

    await asBrand();
    o = await api.orders.get(id);
    expect(o.allowedActions.sort()).toEqual(['APPROVE', 'DISPUTE', 'REQUEST_REVISION']);
    o = await api.orders.approve(id, key());
    expect(o.status).toBe('COMPLETED');
    expect(o.allowedActions).toEqual(['REVIEW']);
    expect(accountBalance(getDb().ledgerEntries, 'ESCROW', id)).toBe(0);

    const review = await api.orders.review(id, { rating: 4, comment: 'Lovely work.' });
    await expectError(api.orders.review(id, { rating: 5 }), 409, 'ALREADY_REVIEWED');

    await asLeo();
    const statsAfter = await api.creatorMe.stats();
    expect(statsAfter.availableCents - statsBefore.availableCents).toBe(o.money.creatorPayoutCents);
    expect((await api.orders.get(id)).allowedActions).toEqual(['REPLY']);
    expect((await api.orders.reply(review.id, 'Thank you!')).creatorReply).toBe('Thank you!');
    await expectError(api.orders.reply(review.id, 'Again'), 409, 'ALREADY_REPLIED');
    const profile = await api.creators.profile('leomakes');
    expect(profile.reviews[0]).toMatchObject({ rating: 4, comment: 'Lovely work.', creatorReply: 'Thank you!', brandName: 'Saltbay Supply Co.' });
  });

  it('decline and cancel release the hold without charging (FR-32, FR-37, FR-64)', async () => {
    const a = await placeOrder();
    const b = await placeOrder();
    await asLeo();
    expect(await api.orders.decline(a, 'Fully booked', key())).toMatchObject({ status: 'CLOSED', closeReason: 'DECLINED', payment: { status: 'CANCELED' } });
    await asBrand();
    expect(await api.orders.cancel(b, null, key())).toMatchObject({ status: 'CLOSED', closeReason: 'CANCELED', payment: { status: 'CANCELED' } });
    expect(getDb().ledgerEntries.filter((e) => e.orderId === a || e.orderId === b)).toEqual([]);
  });

  it('revisions are capped at 2 and disputes need a reason (FR-35)', async () => {
    const id = await placeOrder();
    await asLeo();
    await api.orders.accept(id, key());
    for (let i = 0; i < 2; i++) {
      await asLeo();
      await api.orders.deliver(id, { items: [{ type: 'FILE', url: '/demo/work-01.svg' }] }, key());
      await asBrand();
      await api.orders.requestRevision(id, 'Please brighten the opening shot.', key());
    }
    await asLeo();
    await api.orders.deliver(id, { items: [{ type: 'FILE', url: '/demo/work-02.svg' }] }, key());
    await asBrand();
    const o = await api.orders.get(id);
    expect(o.revisionCount).toBe(2);
    expect(o.allowedActions).not.toContain('REQUEST_REVISION');
    await expectError(api.orders.requestRevision(id, 'One more please', key()), 409, 'REVISION_LIMIT');
    await expectError(api.orders.dispute(id, 'bad', key()), 422);
    const d = await api.orders.dispute(id, 'The product is not shown at all in the final cut.', key());
    expect(d).toMatchObject({ status: 'DISPUTED', dispute: { status: 'OPEN' } });
    expect(d.deliveries.map((x) => x.revisionNo)).toEqual([2, 1, 0]);
  });

  it('rejects actions out of turn with 409 and hides other people’s orders with 404', async () => {
    const id = await placeOrder();
    await expectError(api.orders.approve(id, key()), 409, 'INVALID_TRANSITION');
    await expectError(api.orders.accept(id, key()), 403, 'ROLE_NOT_ALLOWED');
    const other = getDb().users.find((u) => u.role === 'CREATOR' && u.email.endsWith('@creators.demo.test'))!;
    await api.auth.login(other.email, DEMO_PASSWORD);
    await expectError(api.orders.get(id), 404, 'ORDER_NOT_FOUND');
    await expectError(api.orders.accept(id, key()), 404);
    await api.auth.login('unverified@demo.test', DEMO_PASSWORD);
    await expectError(api.orders.get(id), 404);
  });

  it('edits the brief only before delivery (FR-33)', async () => {
    const id = await placeOrder();
    const o = await api.orders.updateBrief(id, { ...brief, requirements: 'Updated: please film outdoors in daylight.' });
    expect(o.brief.requirements).toBe('Updated: please film outdoors in daylight.');
    const delivered = (await api.orders.list({ status: 'DELIVERED' })).content[0];
    await expectError(api.orders.updateBrief(delivered.id, brief), 409);
  });
});

describe('Simulate time: expiry and auto-approval (FR-32, FR-36)', () => {
  it('expires unaccepted orders and auto-approves deliveries after 72 h', async () => {
    const id = await placeOrder();
    const delivered = (await api.orders.list({ status: 'DELIVERED' })).content.map((o) => o.id);
    const res = await api.dev.simulateTime(73);
    expect(res.offsetHours).toBe(73);
    expect(res.expired).toBeGreaterThanOrEqual(1);
    expect(res.autoApproved).toBe(delivered.length);
    expect(await api.orders.get(id)).toMatchObject({ status: 'CLOSED', closeReason: 'EXPIRED', payment: { status: 'CANCELED' } });
    for (const d of delivered) {
      const o = await api.orders.get(d);
      expect(o.status).toBe('COMPLETED');
      expect(o.events.at(-1)).toMatchObject({ type: 'AUTO_APPROVE', actor: 'SYSTEM' });
    }
    expect(findUnbalancedTxns(getDb().ledgerEntries)).toEqual([]);
    expect((await api.dev.clock()).offsetHours).toBe(73);
  });

  it('rejects silly amounts', async () => {
    await expectError(api.dev.simulateTime(0), 422);
    await expectError(api.dev.simulateTime(10_000), 422);
  });
});
