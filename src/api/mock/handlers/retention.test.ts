import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { payFor } from '@/test/payments';
import type { OrderBrief } from '@/types';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';

const brief: OrderBrief = { requirements: 'A short Reel with the tote bag, natural light.', needsShipping: false, links: [], referenceFiles: [] };
const leoId = () => getDb().users.find((u) => u.email === 'creator@demo.test')!.id;
const leoPackage = () => getDb().packages.filter((k) => k.creatorId === leoId() && k.active).sort((a, b) => a.priceCents - b.priceCents)[0];
const otherCreator = () => getDb().creatorProfiles.find((p) => p.vettingStatus === 'APPROVED' && p.userId !== leoId() && p.username)!;
let n = 0;
const key = () => `ret-${++n}`;
const asBrand = () => api.auth.login('brand@demo.test', DEMO_PASSWORD);
const asLeo = () => api.auth.login('creator@demo.test', DEMO_PASSWORD);

beforeEach(async () => {
  await api.dev.reset();
});

describe('saved lists (FR-25)', () => {
  it('creates lists, saves and removes creators, and is brand-only and private', async () => {
    await asBrand();
    const l = await api.lists.create('Diwali shortlist');
    await expect(api.lists.create('diwali SHORTLIST')).rejects.toMatchObject({ status: 409 });
    await expect(api.lists.create('x')).rejects.toMatchObject({ status: 422 });
    await api.lists.add(l.id, 'leomakes');
    const again = await api.lists.add(l.id, 'leomakes'); // idempotent
    expect(again.usernames).toEqual(['leomakes']);
    await api.lists.add(l.id, otherCreator().username!);
    const detail = await api.lists.get(l.id);
    expect(detail.creators.map((c) => c.username)).toEqual([otherCreator().username, 'leomakes']);
    await expect(api.lists.add(l.id, 'nobody-here')).rejects.toMatchObject({ status: 404 });
    expect((await api.lists.drop(l.id, 'leomakes')).usernames).toEqual([otherCreator().username]);
    expect((await api.lists.rename(l.id, 'Festive')).name).toBe('Festive');

    await asLeo();
    await expect(api.lists.all()).rejects.toMatchObject({ status: 403 });
    await api.auth.login('unverified@demo.test', DEMO_PASSWORD);
    await expect(api.lists.get(l.id)).rejects.toMatchObject({ status: 404 });
    await asBrand();
    await api.lists.remove(l.id);
    expect(await api.lists.all()).toEqual([]);
  });
});

describe('vacation mode', () => {
  it('shows the creator as away and refuses new orders until switched off', async () => {
    await asLeo();
    await expect(api.creatorMe.saveAvailability({ away: true, until: '2000-01-01', message: null })).rejects.toMatchObject({ status: 422 });
    const a = await api.creatorMe.saveAvailability({ away: true, until: null, message: 'Back after Diwali' });
    expect(a).toEqual({ away: true, until: null, message: 'Back after Diwali' });

    await asBrand();
    const profile = await api.creators.profile('leomakes');
    expect(profile.away).toBe(true);
    expect(profile.availability.message).toBe('Back after Diwali');
    const pkg = leoPackage();
    await expect(api.orders.create({ packageId: pkg.id, brief, payment: await payFor({ packageId: pkg.id }) }, key())).rejects.toMatchObject({ status: 409, code: 'CREATOR_AWAY' });

    await asLeo();
    expect((await api.creatorMe.saveAvailability({ away: false })).away).toBe(false);
    await asBrand();
    const res = await api.orders.create({ packageId: pkg.id, brief, payment: await payFor({ packageId: pkg.id }) }, key());
    expect(res.status).toBe('PENDING_ACCEPTANCE');
  });
});

describe('campaign invites (FR-43)', () => {
  it('invites a creator once, shows it to them, and marks it applied when they apply', async () => {
    await asBrand();
    const camp = (await api.campaigns.list()).content.find((c) => c.open)!;
    const existing = (await api.campaigns.get(camp.id)).applications.map((a) => a.creator.username);
    const target = getDb().creatorProfiles.find((p) => p.vettingStatus === 'APPROVED' && p.username && !existing.includes(p.username) && p.userId !== leoId())!;
    const inv = await api.campaigns.invite(camp.id, target.username!, 'Love your reels!');
    expect(inv).toMatchObject({ status: 'INVITED', message: 'Love your reels!' });
    await expect(api.campaigns.invite(camp.id, target.username!, null)).rejects.toMatchObject({ status: 409 });
    expect((await api.campaigns.get(camp.id)).invites.map((i) => i.creator.username)).toContain(target.username);
    expect(getDb().notifications.some((x) => x.userId === target.userId && x.type === 'CAMPAIGN_INVITE')).toBe(true);

    const user = getDb().users.find((u) => u.id === target.userId)!;
    await api.auth.login(user.email, DEMO_PASSWORD);
    const invited = await api.campaigns.list({ invited: true });
    expect(invited.content.map((c) => c.id)).toContain(camp.id);
    expect((await api.campaigns.get(camp.id)).myInvite?.status).toBe('INVITED');
    await api.campaigns.apply(camp.id, { pitch: 'I make calm, well-lit product reels that convert for home brands.', priceCents: 500_000, deliveryDays: 5 });
    expect((await api.campaigns.get(camp.id)).myInvite?.status).toBe('APPLIED');
    await expect(api.campaigns.declineInvite(inv.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe('notification preferences (FR-53)', () => {
  it('sends email, SMS and WhatsApp per category, and needs a valid Indian mobile for SMS/WhatsApp', async () => {
    await asLeo();
    const p = await api.notifications.preferences();
    expect(p.categories.find((c) => c.category === 'ORDERS')).toMatchObject({ email: true, sms: false, whatsapp: false });
    const cats = p.categories.map((c) => (c.category === 'ORDERS' ? { ...c, email: false, sms: true, whatsapp: true } : c));
    await expect(api.notifications.savePreferences({ phone: null, categories: cats })).rejects.toMatchObject({ status: 422 });
    await expect(api.notifications.savePreferences({ phone: '12345', categories: cats })).rejects.toMatchObject({ status: 422 });
    expect((await api.notifications.savePreferences({ phone: '98765 43210', categories: cats })).phone).toBe('+919876543210');

    await asBrand();
    const pkg = leoPackage();
    await api.orders.create({ packageId: pkg.id, brief, payment: await payFor({ packageId: pkg.id }) }, key());
    const out = getDb().outbox.filter((m) => m.subject.startsWith('New order from'));
    expect(out.map((m) => m.channel).sort()).toEqual(['SMS', 'WHATSAPP']);
    expect(out.every((m) => m.to === '+919876543210')).toBe(true);
  });
});

describe('creators review brands', () => {
  it('lets the creator rate the brand once after completion; the rating shows on campaigns', async () => {
    const order = getDb().orders.find((o) => o.creatorUserId === leoId() && o.status === 'COMPLETED')!;
    const open = getDb().orders.find((o) => o.creatorUserId === leoId() && o.status === 'IN_PROGRESS')!;
    await asLeo();
    await expect(api.orders.reviewBrand(open.id, { rating: 5 })).rejects.toMatchObject({ status: 409 });
    const r = await api.orders.reviewBrand(order.id, { rating: 4, comment: 'Clear brief and fast feedback.' });
    expect(r.rating).toBe(4);
    await expect(api.orders.reviewBrand(order.id, { rating: 5 })).rejects.toMatchObject({ status: 409 });
    const o = await api.orders.get(order.id);
    expect(o.brandReview?.comment).toBe('Clear brief and fast feedback.');
    expect(o.brandRating.ratingCount).toBeGreaterThanOrEqual(1);
    const camp = (await api.campaigns.list()).content.find((c) => c.brand.name === 'Saltbay Supply Co.');
    if (camp) expect(camp.brandRating.ratingCount).toBeGreaterThanOrEqual(1);
    await asBrand();
    await expect(api.orders.reviewBrand(order.id, { rating: 1 })).rejects.toMatchObject({ status: 403 });
  });
});

describe('chat attachments', () => {
  it('sends an image or PDF with or without text, and rejects empty messages', async () => {
    await asLeo();
    const conv = (await api.chat.conversations()).content[0];
    const pdf = { url: 'data:application/pdf;base64,JVBERi0=', name: 'shot-list.pdf', contentType: 'application/pdf' as const, sizeBytes: 2048 };
    const m = await api.chat.send(conv.id, '', pdf);
    expect(m.attachment).toMatchObject({ name: 'shot-list.pdf', contentType: 'application/pdf' });
    await expect(api.chat.send(conv.id, '  ', null)).rejects.toMatchObject({ status: 422 });
    await expect(api.chat.send(conv.id, 'hi', { ...pdf, contentType: 'text/html' as never })).rejects.toMatchObject({ status: 422 });
  });
});
