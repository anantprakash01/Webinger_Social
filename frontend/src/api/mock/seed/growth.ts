/**
 * Seed for the v3.0 growth features, applied to the finished seed: pre-booking inquiries (more arrive with
 * disputes, plans, promos and finance). Invented people and brands only.
 */
import { PLANS, planPriceCents, type BillingCycle, type BrandPlan } from '@/lib/plans';
import { formatMoney } from '@/lib/money';
import type { Db } from '../db';
import { applyBps } from '../fees';
import { payoutLines, postTxn, subscriptionLines } from '../ledger';
import { failPayout } from '../handlers/finance';
import { GST_BPS, PLATFORM_STATE } from '../tax';

const HOUR = 3_600_000;

/** Stable 26-char ids from a label, so links survive "Reset demo data". */
export function seedId(label: string): string {
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  // FNV-1a over the whole label, then a xorshift stream for the 22 characters.
  let h = 2166136261;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let out = '01JG';
  while (out.length < 26) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
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
  // Disputes (v3.1): the open one has the brand's evidence and waits for the creator (18 h left);
  // the resolved one has both sides' input and the admin's reason, for the refund-reason log.
  for (const d of db.disputes) {
    d.respondBy = new Date(new Date(d.createdAt).getTime() + 48 * HOUR).toISOString();
    if (d.status === 'OPEN') {
      d.reasonCode = 'NOT_AS_BRIEFED';
      d.creatorResponse = null;
      d.evidence = [
        { id: seedId(`ev-${d.id}-1`), by: 'BRAND', kind: 'LINK', url: 'https://example.com/brief-section-2', name: 'Brief, section 2: “no other brands in frame”', note: 'The competitor bottle is visible from 0:04 to 0:21.', at: new Date(new Date(d.createdAt).getTime() + HOUR).toISOString() },
      ];
    } else {
      d.reasonCode = 'LOW_QUALITY';
      d.creatorResponse = 'Two clips were shot in low light because the product arrived late; I offered a reshoot in chat.';
      d.respondedAt = new Date(new Date(d.createdAt).getTime() + 20 * HOUR).toISOString();
      d.evidence = [
        { id: seedId(`ev-${d.id}-b`), by: 'BRAND', kind: 'FILE', url: '/demo/work-07.svg', name: 'Frame from clip 2', note: 'Too dark to see the label.', at: d.createdAt },
        { id: seedId(`ev-${d.id}-c`), by: 'CREATOR', kind: 'FILE', url: '/demo/work-12.svg', name: 'Courier receipt', note: 'Product delivered two days before the due date.', at: d.respondedAt },
      ];
      d.resolutionReason = d.resolution === 'RELEASE' ? 'WORK_MATCHES_BRIEF' : 'QUALITY_BELOW_STANDARD';
      d.resolutionNote = d.resolutionNote ?? 'One of three clips was unusable; refunded that share from the creator’s payout.';
    }
  }

  // Plans (v3.2): Copperleaf on Pro (monthly, renews in 6 days), Tidewell on Premium (yearly).
  const subscribe = (brand: string, plan: BrandPlan, cycle: BillingCycle, startedDaysAgo: number, periods: number, methodLabel: string) => {
    const profile = db.brandProfiles.find((b) => b.userId === brand)!;
    let start = new Date(now.getTime() - startedDaysAgo * 24 * HOUR);
    let end = start;
    for (let i = 0; i < periods; i++) {
      end = new Date(start);
      if (cycle === 'YEARLY') end.setUTCFullYear(end.getUTCFullYear() + 1);
      else end.setUTCMonth(end.getUTCMonth() + 1);
      const price = planPriceCents(plan, cycle);
      const gst = applyBps(price, GST_BPS);
      const id = `sinv_${seedId(`${brand}-${i}`).slice(-12).toLowerCase()}`;
      const fyStart = start.getUTCMonth() >= 3 ? start.getUTCFullYear() : start.getUTCFullYear() - 1;
      db.subscriptionInvoices.push({
        id,
        number: `WC/${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}/S${String(db.subscriptionInvoices.length + 1).padStart(4, '0')}`,
        brandUserId: brand,
        plan,
        cycle,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        priceCents: price,
        gstCents: gst,
        intraState: !profile.state || profile.state === PLATFORM_STATE,
        methodLabel,
        kind: i === 0 ? 'NEW' : 'RENEWAL',
        createdAt: start.toISOString(),
      });
      const entries = postTxn(subscriptionLines(price, gst), { txnId: seedId(`txn-${id}`), orderId: `sub_${id}`, memo: `${PLANS[plan].name} plan (${cycle.toLowerCase()})`, at: start.toISOString() });
      db.ledgerEntries.push(...entries);
      db.auditLogs.push({
        id: seedId(`audit-${id}`),
        actorId: null,
        actorName: 'SYSTEM',
        action: 'MONEY_MOVEMENT',
        entityType: 'SUBSCRIPTION',
        entityId: `sub_${id}`,
        summary: `${entries[0].memo}: ${formatMoney(price + gst)}`,
        before: null,
        after: { txnId: entries[0].txnId, lines: entries.map((l) => ({ account: l.account, debitCents: l.debitCents, creditCents: l.creditCents })) },
        ip: null,
        at: start.toISOString(),
      });
      if (i < periods - 1) start = end;
    }
    db.subscriptions.push({ brandUserId: brand, plan, cycle, periodStart: start.toISOString(), periodEnd: end.toISOString(), cancelAtPeriodEnd: false, nextPlan: null, nextCycle: null, methodLabel });
    profile.plan = plan;
  };
  subscribe(copperleaf, 'PRO', 'MONTHLY', 55, 2, 'UPI · nisha@okaxis');
  subscribe(brandByName('Tidewell Swim'), 'PREMIUM', 'YEARLY', 100, 1, 'Visa •••• 4242');

  // Promo codes (v3.3): a first-order welcome, a festive percentage, and one that has expired.
  const day = (d: number) => new Date(now.getTime() + d * 24 * HOUR).toISOString().slice(0, 10);
  db.promoCodes.push(
    { id: 'promo_welcome500', code: 'WELCOME500', description: 'New brands: ₹500 off the first booking', kind: 'FLAT', percentBps: null, flatCents: 500_00, maxDiscountCents: null, minOrderCents: 2_000_00, firstOrderOnly: true, maxRedemptions: null, validUntil: null, active: true, createdBy: null, createdAt: ago(24 * 90) },
    { id: 'promo_diwali10', code: 'DIWALI10', description: 'Festive season: 10% off, up to ₹2,000', kind: 'PERCENT', percentBps: 1000, flatCents: null, maxDiscountCents: 2_000_00, minOrderCents: 5_000_00, firstOrderOnly: false, maxRedemptions: 500, validUntil: day(40), active: true, createdBy: null, createdAt: ago(24 * 6) },
    { id: 'promo_monsoon15', code: 'MONSOON15', description: 'Monsoon sale: 15% off, up to ₹3,000', kind: 'PERCENT', percentBps: 1500, flatCents: null, maxDiscountCents: 3_000_00, minOrderCents: null, firstOrderOnly: false, maxRedemptions: null, validUntil: day(-12), active: true, createdBy: null, createdAt: ago(24 * 70) },
  );

  // Referrals (v3.3): Maya invited Copperleaf (rewarded: ₹1,000 credit) and Theo (₹500 welcome credit);
  // Leo invited Ivy (not rewarded yet: Ivy has no completed order).
  const user = (id: string) => db.users.find((u) => u.id === id)!;
  const maya = user(ids.brandId);
  maya.referralCode = 'MAYA7K2Q';
  user(ids.leoId).referralCode = 'LEO4XR8M';
  Object.assign(user(copperleaf), { referredBy: maya.id, referralRewardedAt: ago(24 * 20) });
  db.credits.push({ id: seedId('credit-maya-reward'), userId: maya.id, deltaCents: 1_000_00, reason: 'REFERRAL_REWARD', note: 'Copperleaf Candles completed their first order', orderId: null, createdAt: ago(24 * 20) });
  const theo = db.users.find((u) => u.email === 'unverified@demo.test')!;
  theo.referredBy = maya.id;
  db.credits.push({ id: seedId('credit-theo-welcome'), userId: theo.id, deltaCents: 500_00, reason: 'REFERRAL_WELCOME', note: 'Welcome credit — invited by Maya', orderId: null, createdAt: theo.createdAt });
  const ivy = db.users.find((u) => u.email === 'newcreator@demo.test')!;
  ivy.referredBy = ids.leoId;

  // A failed bank payout (v3.4) for the finance queue: a creator (not Leo) with money released to them;
  // the bank rejected last week's payout, the money is back in the balance, and the account is verified again.
  const balanceOf = (creatorId: string) =>
    db.ledgerEntries.filter((e) => e.account === 'CREATOR_BALANCE' && db.orders.some((o) => o.id === e.orderId && o.creatorUserId === creatorId)).reduce((s, e) => s + e.debitCents - e.creditCents, 0);
  const payee = db.creatorProfiles.find((p) => p.userId !== ids.leoId && p.payoutStatus === 'ENABLED' && balanceOf(p.userId) >= 1_000_00 && db.payoutAccounts.some((a) => a.creatorId === p.userId && a.status === 'VERIFIED'));
  if (payee) {
    const account = db.payoutAccounts.find((a) => a.creatorId === payee.userId)!;
    const amount = balanceOf(payee.userId);
    const at = new Date(now.getTime() - 6 * 24 * HOUR);
    const payout = { id: 'pout_mockfailed01', creatorId: payee.userId, amountCents: amount, feeCents: 0, speed: 'SCHEDULED' as const, destinationLabel: `SBI •••• ${(account.accountNumber ?? '0000').slice(-4)}`, status: 'IN_TRANSIT' as const, createdAt: at.toISOString(), arrivalDate: new Date(at.getTime() + 24 * HOUR).toISOString() };
    db.payouts.push(payout);
    db.ledgerEntries.push(...postTxn(payoutLines(amount, 0), { txnId: seedId('txn-failed-payout'), orderId: `payout_${payout.id}`, memo: 'Weekly payout', at: payout.createdAt }));
    failPayout(db, db.payouts.at(-1)!, 'Bank rejected the transfer: account closed. The creator has since added a new account.', seedId('txn-failed-payout-back'), new Date(at.getTime() + 20 * HOUR));
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

  // FR-84: one MONEY_MOVEMENT audit entry per ledger transaction, including the ones seeded here.
  const audited = new Set(db.auditLogs.filter((a) => a.action === 'MONEY_MOVEMENT').map((a) => (a.after as { txnId?: string } | null)?.txnId));
  const byTxn = new Map<string, typeof db.ledgerEntries>();
  for (const e of db.ledgerEntries) if (!audited.has(e.txnId)) byTxn.set(e.txnId, [...(byTxn.get(e.txnId) ?? []), e]);
  for (const [txnId, lines] of byTxn) {
    const ref = lines[0].orderId;
    db.auditLogs.push({
      id: seedId(`audit-${txnId}`),
      actorId: null,
      actorName: 'SYSTEM',
      action: 'MONEY_MOVEMENT',
      entityType: ref.startsWith('payout_') ? 'PAYOUT' : ref.startsWith('sub_') ? 'SUBSCRIPTION' : 'ORDER',
      entityId: ref,
      summary: `${lines[0].memo}: ${formatMoney(lines.reduce((s, l) => s + l.debitCents, 0))}`,
      before: null,
      after: { txnId, lines: lines.map((l) => ({ account: l.account, debitCents: l.debitCents, creditCents: l.creditCents })) },
      ip: null,
      at: lines[0].createdAt,
    });
  }
}
