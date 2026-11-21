/**
 * Week 5 seed: three more invented brands, campaigns with applications, one conversation per order
 * with a few messages, and notifications derived from every seeded order event (FR-52).
 * Deterministic like the other seeds; dates relative to `now`.
 */
import { maskContacts } from '@/features/chat/schemas';
import type { ApplicationRow, BrandProfileRow, CampaignRow, ConversationRow, MessageRow, NotificationRow, UserRow } from '../db';
import { orderEventNotifications } from '../notify';
import { prng, type SeedResult } from './creators';
import type { OrderSeedResult } from './orders';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SEED_EPOCH = Date.UTC(2026, 10, 2);

export interface EngagementSeed {
  users: UserRow[];
  brandProfiles: BrandProfileRow[];
  campaigns: CampaignRow[];
  applications: ApplicationRow[];
  conversations: ConversationRow[];
  messages: MessageRow[];
  notifications: NotificationRow[];
}

const EXTRA_BRANDS = [
  { key: 'copperleaf', name: 'Copperleaf Candles', person: 'Nora Vance', industry: 'HOME', country: 'US' },
  { key: 'tidewell', name: 'Tidewell Swim', person: 'Felipe Andrade', industry: 'FASHION', country: 'AU' },
  { key: 'orbitfit', name: 'Orbitfit Gear', person: 'Hana Brooks', industry: 'HEALTH', country: 'GB' },
] as const;

export function seedEngagement(now: Date, ids: { brandId: string; leoId: string; passwordHash: string }, creators: SeedResult, orders: OrderSeedResult): EngagementSeed {
  const r = prng(5150);
  const id = (offsetHours = 0) => {
    let t = SEED_EPOCH - Math.round(offsetHours) * HOUR;
    let head = '';
    for (let i = 0; i < 10; i++) {
      head = CROCKFORD[t % 32] + head;
      t = Math.floor(t / 32);
    }
    let tail = '';
    for (let i = 0; i < 16; i++) tail += CROCKFORD[Math.floor(r() * 32)];
    return head + tail;
  };
  const ago = (h: number) => new Date(now.getTime() - h * HOUR).toISOString();
  const dayFromNow = (d: number) => new Date(now.getTime() + d * DAY).toISOString().slice(0, 10);
  const out: EngagementSeed = { users: [], brandProfiles: [], campaigns: [], applications: [], conversations: [], messages: [], notifications: [] };

  // Invented brands (website on example.com so nothing points at a real company).
  const brandIds: Record<string, string> = { saltbay: ids.brandId };
  for (const b of EXTRA_BRANDS) {
    const userId = id(900);
    brandIds[b.key] = userId;
    out.users.push({
      id: userId,
      email: `${b.key}@brands.demo.test`,
      name: b.person,
      role: 'BRAND',
      status: 'ACTIVE',
      passwordHash: ids.passwordHash,
      googleSub: null,
      emailVerifiedAt: ago(2000),
      createdAt: ago(2000),
      updatedAt: ago(2000),
    });
    out.brandProfiles.push({ userId, companyName: b.name, website: `https://${b.key}.example.com`, logoUrl: null, industry: b.industry, country: b.country, plan: 'FREE', stripeCustomerId: `cus_demo${b.key}` });
  }

  // Creators who can apply: approved, with a social account. Leo first.
  const approved = creators.creatorProfiles.filter((p) => p.vettingStatus === 'APPROVED' && p.userId !== ids.leoId).map((p) => p.userId);
  const pick = (n: number, offset: number) => approved.slice(offset, offset + n);

  const campaign = (brand: string, c: Omit<CampaignRow, 'id' | 'brandUserId' | 'createdAt' | 'closedAt' | 'status'> & { status?: CampaignRow['status']; createdHoursAgo: number }): CampaignRow => {
    const row: CampaignRow = {
      id: id(c.createdHoursAgo),
      brandUserId: brandIds[brand],
      title: c.title,
      brief: c.brief,
      platforms: c.platforms,
      niches: c.niches,
      deliverables: c.deliverables,
      budgetPerCreatorCents: c.budgetPerCreatorCents * 80, // modelled in USD cents → INR paise
      deadline: c.deadline,
      status: c.status ?? 'OPEN',
      createdAt: ago(c.createdHoursAgo),
      closedAt: c.status === 'CLOSED' ? ago(c.createdHoursAgo - 200) : null,
    };
    out.campaigns.push(row);
    return row;
  };
  const apply = (cmp: CampaignRow, creatorUserId: string, a: { pitch: string; priceCents: number; deliveryDays: number; status?: ApplicationRow['status']; hoursAgo: number }) => {
    out.applications.push({
      id: id(a.hoursAgo),
      campaignId: cmp.id,
      creatorUserId,
      pitch: a.pitch,
      priceCents: a.priceCents * 80, // modelled in USD cents → INR paise
      deliveryDays: a.deliveryDays,
      status: a.status ?? 'PENDING',
      orderId: null,
      createdAt: ago(a.hoursAgo),
      decidedAt: a.status && a.status !== 'PENDING' ? ago(a.hoursAgo - 20) : null,
    });
  };

  const PITCHES = [
    'My audience is mostly renters who love small home upgrades — this fits right in with my weekly “corner makeover” series.',
    'I post three times a week and my saves-to-views ratio is high for product content. Happy to send past examples.',
    'I have worked with two similar brands this year; both reposted my content as ads. I can turn this around quickly.',
    'This matches my audience perfectly. I can film outdoors with natural light and include a discount code mention.',
  ];

  const spring = campaign('saltbay', {
    title: 'Spring home refresh',
    brief: 'We are launching a linen and ceramics collection for spring. Show one product in a real room makeover, with natural light and no other brands in shot. Mention the free returns.',
    platforms: ['INSTAGRAM', 'TIKTOK'],
    niches: ['HOME', 'LIFESTYLE'],
    deliverables: ['1 Reel or TikTok (30–60 s)', '3 Story frames with link'],
    budgetPerCreatorCents: 30_000,
    deadline: dayFromNow(18),
    createdHoursAgo: 96,
  });
  pick(3, 0).forEach((c, i) => apply(spring, c, { pitch: PITCHES[i], priceCents: 22_000 + i * 4_000, deliveryDays: 7 + i, hoursAgo: 80 - i * 15 }));
  apply(spring, ids.leoId, { pitch: 'My desk-and-home audience loves practical upgrades. I can style the ceramics in my workspace tour and a TikTok.', priceCents: 28_000, deliveryDays: 8, hoursAgo: 30 });

  campaign('saltbay', {
    title: 'Holiday gift guide 2026',
    brief: 'Feature our best-selling candle trio and mugs in a holiday gift guide. Cosy, warm, evening light.',
    platforms: ['INSTAGRAM', 'YOUTUBE'],
    niches: ['HOME', 'LIFESTYLE'],
    deliverables: ['Gift guide feature (feed post or video segment)'],
    budgetPerCreatorCents: 25_000,
    deadline: dayFromNow(-10),
    status: 'CLOSED',
    createdHoursAgo: 900,
  });

  const desk = campaign('orbitfit', {
    title: 'Home workout corner',
    brief: 'Show how our foldable resistance kit fits a small flat. We want honest, practical content — set-up time, storage, one short routine.',
    platforms: ['TIKTOK', 'YOUTUBE', 'INSTAGRAM'],
    niches: ['FITNESS', 'TECH', 'LIFESTYLE'],
    deliverables: ['1 TikTok or Reel', '1 YouTube Short'],
    budgetPerCreatorCents: 40_000,
    deadline: dayFromNow(25),
    createdHoursAgo: 60,
  });
  apply(desk, ids.leoId, { pitch: 'I already film in a small flat setup and my tech audience asks about home fitness gear often. Two short videos in one week.', priceCents: 38_000, deliveryDays: 7, hoursAgo: 20 });
  pick(2, 3).forEach((c, i) => apply(desk, c, { pitch: PITCHES[(i + 2) % 4], priceCents: 35_000 + i * 5_000, deliveryDays: 10, hoursAgo: 40 - i * 10 }));

  campaign('tidewell', {
    title: 'Summer swim drop — UGC',
    brief: 'We need ad-ready vertical videos of our recycled-fabric swimwear at the beach or pool. Three hooks per video. Usage rights for 6 months.',
    platforms: ['UGC', 'TIKTOK'],
    niches: ['FASHION', 'TRAVEL', 'SUSTAINABILITY'],
    deliverables: ['1 UGC video with 3 hooks', '9:16 and 1:1 exports'],
    budgetPerCreatorCents: 20_000,
    deadline: dayFromNow(12),
    createdHoursAgo: 120,
  });
  const candles = campaign('copperleaf', {
    title: 'Slow evenings candle stories',
    brief: 'Cosy evening routine content featuring one of our soy candles. Calm, slow, no fast cuts.',
    platforms: ['INSTAGRAM'],
    niches: ['HOME', 'WELLNESS'],
    deliverables: ['3 Story frames', '1 feed photo'],
    budgetPerCreatorCents: 15_000,
    deadline: dayFromNow(30),
    createdHoursAgo: 200,
  });
  apply(candles, ids.leoId, { pitch: 'Evening desk wind-down routines are a regular series on my channel; a candle fits naturally.', priceCents: 16_000, deliveryDays: 5, status: 'REJECTED', hoursAgo: 150 });
  campaign('copperleaf', {
    title: 'Autumn scent launch',
    brief: 'Unboxing and first impressions of our three new autumn scents. Honest reactions welcome.',
    platforms: ['YOUTUBE', 'TIKTOK'],
    niches: ['HOME', 'LIFESTYLE'],
    deliverables: ['1 unboxing video (45–90 s)'],
    budgetPerCreatorCents: 18_000,
    deadline: dayFromNow(9),
    createdHoursAgo: 48,
  });

  // One conversation per order; a few messages on the active ones.
  const userName = (uid: string) => creators.creatorProfiles.find((p) => p.userId === uid)?.displayName ?? 'Maya Okafor';
  for (const o of orders.orders) {
    const conv: ConversationRow = { id: id(1000), orderId: o.id, createdAt: o.createdAt };
    out.conversations.push(conv);
    const say = (from: string, body: string, hoursAgo: number, read = true) => {
      const completed = o.status === 'COMPLETED';
      const m = completed ? { text: body, masked: false } : maskContacts(body);
      out.messages.push({ id: id(hoursAgo), conversationId: conv.id, senderUserId: from, body: m.text, masked: m.masked, createdAt: ago(hoursAgo), readAt: read ? ago(Math.max(0, hoursAgo - 1)) : null });
    };
    const live = o.status === 'IN_PROGRESS' || o.status === 'DELIVERED' || o.status === 'PENDING_ACCEPTANCE';
    if (o.creatorUserId === ids.leoId && live) {
      const placed = (now.getTime() - new Date(o.createdAt).getTime()) / HOUR;
      // Unread on orders Leo hasn't accepted yet, so the demo shows an unread badge.
      say(ids.brandId, `Hi ${userName(o.creatorUserId).split(' ')[0]}! Excited about this one — any questions on the brief?`, placed - 0.5, o.status !== 'PENDING_ACCEPTANCE');
      if (o.status !== 'PENDING_ACCEPTANCE') {
        say(o.creatorUserId, 'Thanks! All clear. Could you ship the product by Friday? You can also reach me on 415 555 0134.', placed - 2);
        say(ids.brandId, 'Shipping today, tracking to follow here.', placed - 3);
        say(o.creatorUserId, 'Perfect, I’ll share a first cut as soon as it’s edited.', 3, false);
      }
    }
  }

  // FR-52: notifications for every seeded order event, to each participant who didn't cause it.
  const brandName = (uid: string) => (uid === ids.brandId ? 'Saltbay Supply Co.' : out.brandProfiles.find((b) => b.userId === uid)?.companyName ?? 'Brand');
  for (const e of orders.orderEvents) {
    const o = orders.orders.find((x) => x.id === e.orderId)!;
    const info = orders.orderInfo.find((x) => x.orderId === e.orderId)!;
    for (const n of orderEventNotifications(e, o, { title: info.title, brandName: brandName(o.brandUserId), creatorName: userName(o.creatorUserId) })) {
      if (n.userId === e.actorId) continue;
      const age = (now.getTime() - new Date(e.at).getTime()) / HOUR;
      out.notifications.push({ id: id(age), ...n, readAt: age > 48 ? e.at : null, createdAt: e.at });
    }
  }
  // New applications for the brand that owns the campaign.
  for (const a of out.applications) {
    const c = out.campaigns.find((x) => x.id === a.campaignId)!;
    const hoursAgo = (now.getTime() - new Date(a.createdAt).getTime()) / HOUR;
    out.notifications.push({
      id: id(hoursAgo),
      userId: c.brandUserId,
      type: 'NEW_APPLICATION',
      title: `New application for “${c.title}”`,
      body: `${userName(a.creatorUserId)} applied.`,
      link: `/brand/campaigns/${c.id}`,
      readAt: hoursAgo > 48 ? a.createdAt : null,
      createdAt: a.createdAt,
    });
    if (a.status === 'REJECTED') {
      out.notifications.push({ id: id(hoursAgo - 20), userId: a.creatorUserId, type: 'APPLICATION_REJECTED', title: `${brandName(c.brandUserId)} chose other creators`, body: `Your application to “${c.title}” was not selected.`, link: `/creator/campaigns/${c.id}`, readAt: a.decidedAt, createdAt: a.decidedAt! });
    }
  }
  out.notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}
