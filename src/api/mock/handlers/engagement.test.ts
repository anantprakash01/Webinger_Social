import { payFor, payTotal, UNPAID } from '@/test/payments';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { CampaignInput, OrderBrief } from '@/types';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';

const asBrand = () => api.auth.login('brand@demo.test', DEMO_PASSWORD);
const asLeo = () => api.auth.login('creator@demo.test', DEMO_PASSWORD);
const leoId = () => getDb().users.find((u) => u.email === 'creator@demo.test')!.id;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
let n = 0;
const key = () => `wk5-${++n}`;

const campaign = (over: Partial<CampaignInput> = {}): CampaignInput => ({
  title: 'Winter cosy edit',
  brief: 'Show our wool throw in a cosy winter evening setting with warm light. No other brands visible.',
  platforms: ['INSTAGRAM'],
  niches: ['HOME'],
  deliverables: ['1 Reel'],
  budgetPerCreatorCents: 2_000_000,
  deadline: inDays(14),
  ...over,
});

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

beforeEach(async () => {
  await api.dev.reset();
});

describe('campaigns (FR-40 – FR-42)', () => {
  it('a brand sees its own campaigns; a creator sees open ones from every brand', async () => {
    await asBrand();
    const mine = await api.campaigns.list();
    expect(mine.content.length).toBe(2);
    expect(mine.content.some((c) => c.status === 'CLOSED')).toBe(true);
    await asLeo();
    const open = await api.campaigns.list();
    expect(open.content.every((c) => c.open)).toBe(true);
    expect(new Set(open.content.map((c) => c.brand.name)).size).toBeGreaterThan(2);
    expect(open.content.some((c) => c.myApplication?.status === 'PENDING')).toBe(true);
    expect((await api.campaigns.list({ platform: 'UGC' })).content.every((c) => c.platforms.includes('UGC'))).toBe(true);
  });

  it('validates a new campaign (FR-40)', async () => {
    await asBrand();
    const e = await expectError(api.campaigns.create(campaign({ title: 'x', budgetPerCreatorCents: 40_000, deadline: inDays(400), niches: [] })), 422);
    expect(e.fieldErrors.map((f) => f.field).sort()).toEqual(['budgetPerCreatorCents', 'deadline', 'niches', 'title']);
    const c = await api.campaigns.create(campaign());
    expect(c).toMatchObject({ status: 'OPEN', open: true, applications: [], applicationCount: 0 });
    await api.auth.login('unverified@demo.test', DEMO_PASSWORD);
    await expectError(api.campaigns.create(campaign()), 403, 'EMAIL_NOT_VERIFIED');
  });

  it('approved creators apply once; drafts cannot (FR-41)', async () => {
    await asBrand();
    const c = await api.campaigns.create(campaign());
    await asLeo();
    await expectError(api.campaigns.apply(c.id, { pitch: 'short', priceCents: 40_000, deliveryDays: 0 }), 422);
    const a = await api.campaigns.apply(c.id, { pitch: 'My audience loves cosy home content and I post evening routines weekly.', priceCents: 1_900_000, deliveryDays: 6 });
    expect(a).toMatchObject({ status: 'PENDING', creator: { username: 'leomakes' } });
    await expectError(api.campaigns.apply(c.id, { pitch: 'Applying twice should not be allowed here at all.', priceCents: 1_900_000, deliveryDays: 6 }), 409, 'ALREADY_APPLIED');
    await api.campaigns.withdrawApplication(a.id);
    expect((await api.campaigns.apply(c.id, { pitch: 'Re-applying after withdrawing with a better offer.', priceCents: 1_800_000, deliveryDays: 5 })).id).toBe(a.id);
    await api.auth.login('newcreator@demo.test', DEMO_PASSWORD);
    await expectError(api.campaigns.apply(c.id, { pitch: 'Draft creators cannot apply to any campaign yet.', priceCents: 1_900_000, deliveryDays: 6 }), 403, 'CREATOR_NOT_APPROVED');
  });

  it('accepting an application places an order through the normal flow (FR-42)', async () => {
    await asBrand();
    const spring = (await api.campaigns.list()).content.find((c) => c.title === 'Spring home refresh')!;
    const detail = await api.campaigns.get(spring.id);
    const leoApp = detail.applications.find((a) => a.creator.username === 'leomakes')!;
    const total = leoApp.priceCents + Math.floor((leoApp.priceCents * 1000 + 5000) / 10000);
    const res = await api.campaigns.acceptApplication(leoApp.id, 'Please feature the grey mug.', await payTotal(total), key());
    expect(res).toMatchObject({ status: 'PENDING_ACCEPTANCE', priceCents: leoApp.priceCents, totalCents: leoApp.priceCents + Math.floor((leoApp.priceCents * 1000 + 5000) / 10000) });
    const order = await api.orders.get(res.orderId);
    expect(order).toMatchObject({ kind: 'CAMPAIGN', campaignId: spring.id, title: 'Spring home refresh', payment: { status: 'AUTHORIZED' } });
    expect(order.brief.requirements).toContain('Please feature the grey mug.');
    expect((await api.campaigns.get(spring.id)).applications.find((a) => a.id === leoApp.id)).toMatchObject({ status: 'ACCEPTED', orderId: res.orderId });
    await expectError(api.campaigns.acceptApplication(leoApp.id, null, UNPAID, key()), 409, 'APPLICATION_DECIDED');
    await asLeo();
    expect((await api.notifications.list()).content[0]).toMatchObject({ type: 'APPLICATION_ACCEPTED', link: `/creator/orders/${res.orderId}` });
    expect((await api.orders.accept(res.orderId, key())).status).toBe('IN_PROGRESS');
  });

  it('closing a campaign declines pending applications', async () => {
    await asBrand();
    const spring = (await api.campaigns.list()).content.find((c) => c.title === 'Spring home refresh')!;
    const closed = await api.campaigns.close(spring.id);
    expect(closed.status).toBe('CLOSED');
    expect(closed.applications.every((a) => a.status === 'REJECTED')).toBe(true);
    await asLeo();
    expect((await api.campaigns.list()).content.some((c) => c.id === spring.id)).toBe(false);
    expect((await api.campaigns.get(spring.id)).myApplication?.status).toBe('REJECTED'); // still visible to applicants
  });
});

describe('chat (FR-50, FR-51)', () => {
  it('one conversation per order, visible only to its participants', async () => {
    await asLeo();
    const list = await api.chat.conversations();
    const leoOrders = getDb().orders.filter((o) => o.creatorUserId === leoId());
    expect(list.content.length).toBe(leoOrders.length);
    expect(list.unreadTotal).toBeGreaterThan(0);
    const other = getDb().conversations.find((c) => !leoOrders.some((o) => o.id === c.orderId))!;
    await expectError(api.chat.messages(other.id), 404);
  });

  it('masks contact details before completion and stops masking after (FR-51)', async () => {
    await asBrand();
    const brief: OrderBrief = { requirements: 'A short Reel with the tote bag, natural light.', needsShipping: false, links: [], referenceFiles: [] };
    const pkg = getDb().packages.find((k) => k.creatorId === leoId() && k.active)!;
    const { orderId } = await api.orders.create({ packageId: pkg.id, brief, payment: await payFor({ packageId: pkg.id }) }, key());
    const conv = (await api.orders.get(orderId)).conversationId;
    const sent = await api.chat.send(conv, 'Email maya@saltbay.example.com or call 415 555 0101');
    expect(sent).toMatchObject({ body: 'Email [email hidden] or call [phone hidden]', masked: true, mine: true });
    expect((await api.chat.messages(conv)).contactsHidden).toBe(true);
    await expectError(api.chat.send(conv, '   '), 422);

    // Complete the order, then contact details pass through.
    await asLeo();
    await api.orders.accept(orderId, key());
    await api.orders.deliver(orderId, { items: [{ type: 'POST_URL', url: 'https://example.com/p/9' }] }, key());
    await asBrand();
    await api.orders.approve(orderId, key());
    const after = await api.chat.send(conv, 'Thanks! For future work: maya@saltbay.example.com');
    expect(after).toMatchObject({ masked: false, body: 'Thanks! For future work: maya@saltbay.example.com' });
  });

  it('tracks unread messages and marks them read', async () => {
    await asLeo();
    const withUnread = (await api.chat.conversations()).content.find((c) => c.unreadCount > 0)!;
    await api.chat.markRead(withUnread.id);
    expect((await api.chat.conversations()).content.find((c) => c.id === withUnread.id)!.unreadCount).toBe(0);
  });
});

describe('notifications (FR-52) and the realtime stand-in', () => {
  it('every order state change notifies the other side', async () => {
    await asBrand();
    const pkg = getDb().packages.find((k) => k.creatorId === leoId() && k.active)!;
    const brief: OrderBrief = { requirements: 'A short Reel with the tote bag, natural light.', needsShipping: false, links: [], referenceFiles: [] };
    const { orderId } = await api.orders.create({ packageId: pkg.id, brief, payment: await payFor({ packageId: pkg.id }) }, key());
    await asLeo();
    const leoN = await api.notifications.list();
    expect(leoN.content[0]).toMatchObject({ type: 'ORDER_EVENT', title: 'New order from Saltbay Supply Co.', read: false, link: `/creator/orders/${orderId}` });
    await api.orders.accept(orderId, key());
    await asBrand();
    expect((await api.notifications.list()).content[0]).toMatchObject({ title: 'Leo accepted your order', link: `/brand/orders/${orderId}` });
    // The actor is not notified of their own action.
    await asLeo();
    expect((await api.notifications.list()).content.filter((x) => x.link?.endsWith(orderId)).length).toBe(1);
    // FR-52 email
    expect((await api.dev.outbox('brand@demo.test'))[0].subject).toBe('Leo accepted your order');
  });

  it('counts unread and marks read by id or all', async () => {
    await asBrand();
    const before = await api.notifications.list();
    expect(before.unreadCount).toBeGreaterThan(0);
    const firstUnread = before.content.find((x) => !x.read)!;
    await api.notifications.markRead({ ids: [firstUnread.id] });
    expect((await api.notifications.list()).unreadCount).toBe(before.unreadCount - 1);
    await api.notifications.markRead({ all: true });
    expect((await api.notifications.list({ unreadOnly: true })).totalElements).toBe(0);
    await expectError(api.notifications.markRead({}), 422);
  });

  it('the poll replays new messages and notifications as STOMP topics', async () => {
    await asLeo();
    const start = await api.dev.pollRealtime();
    expect(start.events).toEqual([]);
    const conv = (await api.chat.conversations()).content.find((c) => c.orderStatus === 'IN_PROGRESS')!;
    await asBrand();
    await api.chat.send(conv.id, 'Quick check-in on timing?');
    await asLeo();
    const res = await api.dev.pollRealtime(start.serverTime);
    expect(res.events.map((e) => e.topic)).toContain('/user/queue/messages');
    expect(res.events.find((e) => e.topic === '/user/queue/messages')!.payload).toMatchObject({ body: 'Quick check-in on timing?', mine: false });
  });
});

describe('brand dashboard (FR-71)', () => {
  it('reports spend, escrow, holds, orders by status and delivered post links', async () => {
    await asBrand();
    const s = await api.brands.stats();
    const mine = getDb().orders.filter((o) => o.brandUserId === getDb().users.find((u) => u.email === 'brand@demo.test')!.id);
    const total = (o: (typeof mine)[number]) => o.priceCents + o.brandFeeCents;
    const charged = mine.filter((o) => o.payment.status === 'CAPTURED' || o.payment.status === 'REFUNDED').reduce((sum, o) => sum + total(o) - o.payment.refundedCents, 0);
    expect(s.spentCents).toBe(charged);
    expect(s.authorisedCents).toBe(mine.filter((o) => o.status === 'PENDING_ACCEPTANCE').reduce((sum, o) => sum + total(o), 0));
    expect(s.ordersByStatus.COMPLETED).toBe(mine.filter((o) => o.status === 'COMPLETED').length);
    expect(s.deliveredPosts.length).toBeGreaterThan(0);
    expect(s.deliveredPosts.every((p) => p.url.startsWith('https://'))).toBe(true);
    expect(s).toMatchObject({ openCampaigns: 1, pendingApplications: 4 });
    await asLeo();
    await expectError(api.brands.stats(), 403);
  });
});
