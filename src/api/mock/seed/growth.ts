/**
 * Seed for the v3.0 growth features, applied to the finished seed: pre-booking inquiries (more arrive with
 * disputes, plans, promos and finance). Invented people and brands only.
 */
import type { Db } from '../db';

const HOUR = 3_600_000;

/** Stable 26-char ids from a label, so links survive "Reset demo data". */
export function seedId(label: string): string {
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let h = 2166136261;
  let out = '01JG';
  for (let i = 0; out.length < 26; i++) {
    h ^= label.charCodeAt(i % label.length) + i;
    h = Math.imul(h, 16777619) >>> 0;
    out += A[h % 32];
  }
  return out;
}

export function seedGrowth(db: Db, now: Date, ids: { brandId: string; leoId: string }) {
  const ago = (h: number) => new Date(now.getTime() - h * HOUR).toISOString();
  const brandByName = (name: string) => db.brandProfiles.find((b) => b.companyName === name)!.userId;

  // Inquiries: one waiting for Leo (unread), one Saltbay started with another creator that got a reply.
  const copperleaf = brandByName('Copperleaf Candles');
  const other = db.creatorProfiles.find((p) => p.vettingStatus === 'APPROVED' && p.userId !== ids.leoId && db.packages.some((k) => k.creatorId === p.userId && k.active))!;
  const inquiries = [
    {
      id: seedId('inquiry-copperleaf-leo'),
      brand: copperleaf,
      creator: ids.leoId,
      at: 30,
      messages: [
        { from: copperleaf, h: 30, body: 'Hi Leo! We make soy candles and are planning a Diwali gifting push. Would you do 2 Reels in the first week of October? Happy to send the full range.' },
        { from: copperleaf, h: 29, body: 'Also, could you share a rough price for adding 30 days of paid-ad usage?' },
      ],
      read: false,
    },
    {
      id: seedId('inquiry-saltbay-other'),
      brand: ids.brandId,
      creator: other.userId,
      at: 52,
      messages: [
        { from: ids.brandId, h: 52, body: `Hi ${other.displayName.split(' ')[0]}, do you film outdoors? We want our steel bottles shown on a trek, ideally before the 15th.` },
        { from: other.userId, h: 48, body: 'Yes, I can shoot on a trek next weekend. Send a custom offer with the dates and I will accept it the same day.' },
      ],
      read: true,
    },
  ];
  for (const q of inquiries) {
    db.conversations.push({ id: q.id, orderId: null, brandUserId: q.brand, creatorUserId: q.creator, createdAt: ago(q.at) });
    q.messages.forEach((m, i) => {
      db.messages.push({ id: seedId(`${q.id}-m${i}`), conversationId: q.id, senderUserId: m.from, body: m.body, masked: false, attachment: null, createdAt: ago(m.h), readAt: q.read ? ago(m.h - 1) : null });
    });
  }
  db.notifications.push({
    id: seedId('note-inquiry-leo'),
    userId: ids.leoId,
    type: 'NEW_INQUIRY',
    title: 'Copperleaf Candles wants to talk before booking',
    body: inquiries[0].messages[0].body.slice(0, 117) + '…',
    link: `/messages/${inquiries[0].id}`,
    readAt: null,
    createdAt: ago(30),
  });
}
