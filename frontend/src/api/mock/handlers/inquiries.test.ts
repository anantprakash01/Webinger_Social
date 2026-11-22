import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';

const asBrand = () => api.auth.login('brand@demo.test', DEMO_PASSWORD);
const asLeo = () => api.auth.login('creator@demo.test', DEMO_PASSWORD);
const leoId = () => getDb().users.find((u) => u.email === 'creator@demo.test')!.id;
const approvedUsernames = () =>
  getDb()
    .creatorProfiles.filter((p) => p.vettingStatus === 'APPROVED' && p.username && p.userId !== leoId())
    .map((p) => p.username!);

beforeEach(async () => {
  await api.dev.reset();
});

describe('message before booking (v3.0)', () => {
  it('opens an inquiry, reuses it, masks contacts and shows on both sides', async () => {
    await asBrand();
    const c = await api.chat.startInquiry({ creatorUsername: 'leomakes', body: 'Hi Leo, are you free in July? Mail me at maya@saltbay.in or call 98765 43210.' });
    expect(c).toMatchObject({ kind: 'INQUIRY', orderId: null, orderStatus: null, contactsHidden: true });
    const msgs = await api.chat.messages(c.id);
    expect(msgs.messages[0].body).toContain('[email hidden]');
    expect(msgs.messages[0].body).toContain('[phone hidden]');
    expect(msgs.messages[0].masked).toBe(true);

    // Same pair → same conversation; the profile links to it.
    const again = await api.chat.startInquiry({ creatorUsername: 'leomakes', body: 'One more question about usage rights.' });
    expect(again.id).toBe(c.id);
    expect((await api.creators.profile('leomakes')).myInquiryId).toBe(c.id);

    await asLeo();
    const list = await api.chat.conversations();
    const mine = list.content.find((x) => x.id === c.id)!;
    expect(mine.counterparty.name).toBe('Saltbay Supply Co.');
    expect(mine.unreadCount).toBe(2);
    await api.chat.send(c.id, 'Yes! Reach me on 9876543210');
    expect((await api.chat.messages(c.id)).messages.at(-1)!.body).toContain('[phone hidden]');
    const n = await api.notifications.list();
    expect(n.content.some((x) => x.type === 'NEW_INQUIRY' && x.link === `/messages/${c.id}`)).toBe(true);
  });

  it('is brand-only, needs a verified email and an approved creator', async () => {
    await asLeo();
    await expect(api.chat.startInquiry({ creatorUsername: 'leomakes', body: 'Hello there, testing.' })).rejects.toMatchObject({ status: 403 });
    await api.auth.login('unverified@demo.test', DEMO_PASSWORD);
    await expect(api.chat.startInquiry({ creatorUsername: 'leomakes', body: 'Hello there, testing.' })).rejects.toMatchObject({ status: 403, code: 'EMAIL_NOT_VERIFIED' });
    await asBrand();
    await expect(api.chat.startInquiry({ creatorUsername: 'ivymathew', body: 'Hello there, testing.' })).rejects.toMatchObject({ status: 404 });
    await expect(api.chat.startInquiry({ creatorUsername: 'leomakes', body: 'Hi' })).rejects.toMatchObject({ status: 422 });
  });

  it('limits new inquiries per 30 days by plan; other brands cannot read them', async () => {
    await asBrand();
    const before = await api.chat.inquiryAllowance();
    expect(before).toMatchObject({ plan: 'FREE', limit: 5 });
    const names = approvedUsernames().filter((u) => !getDb().conversations.some((c) => c.orderId === null && c.creatorUserId === getDb().creatorProfiles.find((p) => p.username === u)!.userId));
    for (let i = 0; i < 5 - before.used; i++) await api.chat.startInquiry({ creatorUsername: names[i], body: 'Are you taking work next month?' });
    expect((await api.chat.inquiryAllowance()).used).toBe(5);
    await expect(api.chat.startInquiry({ creatorUsername: names[10], body: 'Are you taking work next month?' })).rejects.toMatchObject({ status: 429, code: 'INQUIRY_LIMIT' });
    // Writing in an existing inquiry is not limited.
    const existing = await api.chat.startInquiry({ creatorUsername: names[0], body: 'Following up on my question.' });

    // After 30 days the window frees up.
    await api.dev.simulateTime(720);
    await api.dev.simulateTime(1);
    await asBrand();
    expect((await api.chat.inquiryAllowance()).used).toBe(0);

    await api.auth.login('copperleaf@brands.demo.test', DEMO_PASSWORD);
    await expect(api.chat.messages(existing.id)).rejects.toMatchObject({ status: 404 });
  });
});
