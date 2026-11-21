/**
 * Invented creators for the Phase 0 mock (section 9.5 rule 4). Every name, handle, brand and review
 * here is made up; photos and portfolio images are abstract SVGs from scripts/gen-demo-art.mjs.
 *
 * Deterministic: a fixed PRNG seed gives the same creators (and ids) after every "Reset demo data",
 * so links to profiles and packages keep working. Dates are relative to `now`.
 */
import type { Gender, Niche, Platform, VettingStatus } from '@/types';
import { LOCATIONS } from '@/lib/catalog';
import type { CreatorProfileRow, PackageRow, PortfolioItemRow, ReviewRow, SocialAccountRow, UserRow } from '../db';

export const APPROVED_SEED_CREATORS = 58;

type Rand = () => number;

/** mulberry32 */
export function prng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** ULID-shaped id from the PRNG, so seeded ids are stable across resets. */
function seededId(r: Rand, time: number): string {
  let t = time;
  let head = '';
  for (let i = 0; i < 10; i++) {
    head = CROCKFORD[t % 32] + head;
    t = Math.floor(t / 32);
  }
  let tail = '';
  for (let i = 0; i < 16; i++) tail += CROCKFORD[Math.floor(r() * 32)];
  return head + tail;
}

const pick = <T>(r: Rand, list: readonly T[]): T => list[Math.floor(r() * list.length)];
const between = (r: Rand, min: number, max: number) => min + Math.floor(r() * (max - min + 1));
const chance = (r: Rand, p: number) => r() < p;
function sample<T>(r: Rand, list: readonly T[], n: number): T[] {
  const copy = [...list];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(r() * copy.length), 1)[0]);
  return out;
}
const pad = (n: number) => String(n).padStart(2, '0');
const DAY = 86_400_000;
/** Fixed time used inside seeded ids, so ids do not depend on when the seed ran. */
const SEED_EPOCH = Date.UTC(2026, 10, 1);

/* ---------- Vocabulary (all invented) ---------- */

const FIRST: Record<Gender, string[]> = {
  FEMALE: ['Mira', 'Ana', 'Priya', 'Chloe', 'Zara', 'Nadia', 'Elena', 'Ines', 'Keira', 'Lola', 'Asha', 'Rosa', 'Talia', 'Wren', 'Yara', 'Bea'],
  MALE: ['Jonah', 'Arjun', 'Mateo', 'Felix', 'Omar', 'Rafael', 'Kian', 'Dev', 'Hugo', 'Tomas', 'Idris', 'Caleb', 'Ravi', 'Luca'],
  NON_BINARY: ['Rowan', 'Sage', 'Ari', 'Quinn', 'Remy', 'Jules'],
};
const LAST = ['Calloway', 'Varela', 'Nair', 'Okonkwo', 'Brandt', 'Quill', 'Moreau', 'Haddad', 'Kestrel', 'Duarte', 'Lindholm', 'Sato', 'Rahman', 'Ferreira', 'Ashby', 'Iyer', 'Castell', 'Novak', 'Ember', 'Solano'];

const NICHE_WORD: Record<Niche, string[]> = {
  BEAUTY: ['glow', 'blush', 'beauty'],
  FASHION: ['styles', 'threads', 'wears'],
  FITNESS: ['lifts', 'moves', 'fit'],
  FOOD: ['bakes', 'eats', 'kitchen'],
  TRAVEL: ['roams', 'wanders', 'away'],
  TECH: ['tech', 'builds', 'gadgets'],
  GAMING: ['plays', 'gg', 'games'],
  LIFESTYLE: ['daily', 'life', 'notes'],
  PARENTING: ['family', 'littles', 'parent'],
  FINANCE: ['money', 'saves', 'invests'],
  HOME: ['home', 'nest', 'rooms'],
  PETS: ['pups', 'paws', 'pets'],
  MUSIC: ['music', 'beats', 'sings'],
  EDUCATION: ['learns', 'teaches', 'explains'],
  COMEDY: ['laughs', 'jokes', 'skits'],
  WELLNESS: ['wellness', 'calm', 'breathes'],
  SUSTAINABILITY: ['green', 'reuses', 'earth'],
  AUTOMOTIVE: ['drives', 'garage', 'motors'],
};

const NICHE_BIO: Record<Niche, string> = {
  BEAUTY: 'honest skincare and makeup reviews',
  FASHION: 'everyday outfits and capsule wardrobes',
  FITNESS: 'home workouts and strength training',
  FOOD: 'quick recipes and weekend baking',
  TRAVEL: 'budget trips and slow travel guides',
  TECH: 'gadget reviews and desk setups',
  GAMING: 'indie games and cozy streams',
  LIFESTYLE: 'routines, small joys and city life',
  PARENTING: 'real-life parenting with two little ones',
  FINANCE: 'saving, budgeting and first-time investing',
  HOME: 'renter-friendly makeovers and DIY',
  PETS: 'a rescue dog and too many toys',
  MUSIC: 'covers, gear and behind-the-scenes',
  EDUCATION: 'study tips and explainers',
  COMEDY: 'sketches about work and family',
  WELLNESS: 'sleep, stress and gentle movement',
  SUSTAINABILITY: 'low-waste swaps that actually stick',
  AUTOMOTIVE: 'car care, road trips and EV life',
};

const PACKAGES: Record<Platform, Array<{ title: string; description: string; deliverables: string[]; factor: number; days: [number, number] }>> = {
  INSTAGRAM: [
    { title: 'Instagram Reel', description: 'A 30–60 second Reel featuring your product, posted to my feed with your tag and link in caption.', deliverables: ['1 Reel (30–60 s)', 'Raw footage', '1 revision round'], factor: 1, days: [4, 8] },
    { title: 'Story set', description: 'Three Story frames with a link sticker, posted within the agreed window.', deliverables: ['3 Story frames', 'Link sticker', 'Story insights screenshot'], factor: 0.45, days: [2, 5] },
    { title: 'Feed photo post', description: 'One styled photo post with your product and a caption we agree on.', deliverables: ['1 feed photo', 'Caption draft for approval'], factor: 0.7, days: [3, 7] },
  ],
  TIKTOK: [
    { title: 'TikTok video', description: 'A native TikTok (15–60 s) in my usual style, with your product as the hero.', deliverables: ['1 TikTok video', 'Spark Ads code for 30 days'], factor: 1.1, days: [4, 9] },
    { title: 'TikTok series (3 videos)', description: 'Three connected TikToks posted over two weeks.', deliverables: ['3 TikTok videos', 'Posting schedule', 'Spark Ads codes'], factor: 2.6, days: [10, 21] },
  ],
  YOUTUBE: [
    { title: 'YouTube integration (60–90 s)', description: 'A mid-roll segment in my next video, with your link pinned in the description.', deliverables: ['60–90 s integration', 'Link in description', 'Pinned comment'], factor: 1.8, days: [10, 21] },
    { title: 'YouTube Short', description: 'A vertical Short focused on one feature of your product.', deliverables: ['1 YouTube Short', 'Link in comments'], factor: 0.6, days: [4, 8] },
    { title: 'Dedicated YouTube video', description: 'A full video about your product: unboxing, testing and an honest verdict.', deliverables: ['8–12 min video', 'Thumbnail', 'Link in description'], factor: 4, days: [14, 30] },
  ],
  UGC: [
    { title: 'UGC video – 3 hooks', description: 'One ad-ready vertical video with three different opening hooks. For your own channels and ads.', deliverables: ['1 video, 3 hooks', '9:16 and 1:1 exports', 'Usage rights 6 months'], factor: 1, days: [5, 10] },
    { title: '5 UGC product photos', description: 'Five natural-light lifestyle photos of your product, edited and ready to use.', deliverables: ['5 edited photos', 'Usage rights 6 months'], factor: 0.6, days: [4, 8] },
    { title: 'Unboxing video', description: 'An authentic first-impressions unboxing, filmed vertically.', deliverables: ['1 unboxing video (45–90 s)', 'Raw clips'], factor: 0.8, days: [4, 9] },
  ],
};

/** Price per follower in cents, per platform (rough market rates). UGC is priced flat. */
const CENTS_PER_FOLLOWER: Record<Platform, number> = { INSTAGRAM: 0.35, TIKTOK: 0.25, YOUTUBE: 1.2, UGC: 0 };

const BRANDS = [
  'Copperleaf Candles', 'Moss & Marble', 'Tidewell Swim', 'Juniper Lane Bakery', 'Orbitfit Gear', 'Pebblestone Pets',
  'Lumen & Lark Skincare', 'Harbor Hound Treats', 'Quillwave Audio', 'Sunmeadow Snacks', 'Saltbay Supply Co.', 'Fernhill Tea House',
];

const REVIEWS: Record<number, string[]> = {
  5: [
    'Delivered early and the video outperformed our paid ads. Booking again.',
    'Super easy to work with. Took the brief and made it feel natural.',
    'Great communication, great content, great results.',
    'Our best-performing creator this quarter. Thoughtful and professional.',
    'Exactly what we asked for, plus a couple of extra cuts we could use.',
  ],
  4: ['Good content and on time. One small revision needed.', 'Solid work and easy to brief. Engagement was above our average.', 'Nice result; would love slightly more product focus next time.'],
  3: ['Content was fine but delivery was a few days late.', 'Okay result. The style did not quite match our brand.'],
  2: ['Needed two revisions to get it right. Communication was slow.'],
};
const REPLIES = ['Thank you, it was a pleasure!', 'Thanks so much, happy to work together again.', 'Appreciate the feedback, noted for next time.', 'Thanks for the kind words!'];

const CAPTIONS = ['Morning routine feature', 'Product flat lay', 'Behind the scenes', 'Launch day post', 'Before and after', 'Tutorial frame', 'Outdoor shoot', 'Studio setup', null];

/* ---------- Builders ---------- */

export interface SeedResult {
  users: UserRow[];
  creatorProfiles: CreatorProfileRow[];
  socialAccounts: SocialAccountRow[];
  packages: PackageRow[];
  portfolioItems: PortfolioItemRow[];
  reviews: ReviewRow[];
}

function languagesFor(r: Rand, country: string): string[] {
  const base: Record<string, string[]> = {
    US: ['en'], GB: ['en'], CA: ['en'], AU: ['en'], IN: ['en', chance(r, 0.6) ? 'hi' : 'ta'],
    DE: ['de', 'en'], AE: ['ar', 'en'], BR: ['pt'], ES: ['es'],
  };
  const langs = base[country] ?? ['en'];
  if ((country === 'US' || country === 'CA') && chance(r, 0.25)) langs.push(country === 'US' ? 'es' : 'fr');
  if ((country === 'BR' || country === 'ES') && chance(r, 0.5)) langs.push('en');
  return [...new Set(langs)];
}

function logFollowers(r: Rand, min: number, max: number) {
  return Math.round(Math.exp(Math.log(min) + r() * (Math.log(max) - Math.log(min))));
}

function priceFor(r: Rand, platform: Platform, followers: number, factor: number): number {
  const base = platform === 'UGC' ? between(r, 90, 260) * 100 : followers * CENTS_PER_FOLLOWER[platform];
  const cents = Math.max(2_500, base * factor * (0.8 + r() * 0.4));
  return Math.round(cents / 500) * 500; // round to $5
}

interface Spec {
  userId: string;
  username: string;
  displayName: string;
  gender: Gender;
  birthYear: number;
  country: string;
  city: string;
  niches: Niche[];
  platforms: Array<{ platform: Platform; followers: number; verified: boolean }>;
  vetting: VettingStatus;
  createdDaysAgo: number;
}

function build(spec: Spec, r: Rand, now: Date, out: SeedResult, opts: { photo: string | null; cover: string | null; reviewCount: number; portfolio: number }) {
  const t = now.getTime();
  const created = new Date(t - spec.createdDaysAgo * DAY).toISOString();
  const bio =
    `${spec.displayName.split(' ')[0]} here — ${NICHE_BIO[spec.niches[0]]}` +
    (spec.niches[1] ? `, plus ${NICHE_BIO[spec.niches[1]]}` : '') +
    `. Based in ${spec.city}. I only work with brands I would actually use.`;

  out.creatorProfiles.push({
    userId: spec.userId,
    username: spec.username,
    displayName: spec.displayName,
    bio,
    city: spec.city,
    country: spec.country,
    gender: spec.gender,
    birthYear: spec.birthYear,
    languages: languagesFor(r, spec.country),
    niches: spec.niches,
    photoUrl: opts.photo,
    coverUrls: opts.cover ? [opts.cover] : [],
    vettingStatus: spec.vetting,
    rejectionReason: spec.vetting === 'REJECTED' ? 'Please link at least one social account with public posts.' : null,
    approvedAt: spec.vetting === 'APPROVED' ? new Date(t - (spec.createdDaysAgo - 2) * DAY).toISOString() : null,
    // Profiles still in review were submitted recently; decided ones the day after sign-up.
    submittedAt: spec.vetting === 'DRAFT' ? null : new Date(t - (spec.vetting === 'PENDING_REVIEW' ? Math.min(spec.createdDaysAgo - 1, 2) : spec.createdDaysAgo - 1) * DAY).toISOString(),
    profileViews: spec.vetting === 'APPROVED' ? between(r, 40, 2_400) : 0,
    // Payouts must be set up before a profile can be submitted (Week 3 rule).
    stripeAccountId: spec.vetting === 'DRAFT' ? null : `acct_demo${spec.username}`,
    payoutStatus: spec.vetting === 'DRAFT' ? 'NOT_STARTED' : 'ENABLED',
    createdAt: created,
  });

  for (const p of spec.platforms) {
    out.socialAccounts.push({
      id: seededId(r, SEED_EPOCH - spec.createdDaysAgo * DAY),
      creatorId: spec.userId,
      platform: p.platform,
      handle: spec.username,
      // Invented handles are never linked to the real platforms.
      url: null,
      followers: p.followers,
      engagementRateBps: p.platform === 'UGC' ? null : between(r, 140, 920),
      verifiedAt: p.verified ? created : null,
    });
    const templates = sample(r, PACKAGES[p.platform], between(r, 1, Math.min(2, PACKAGES[p.platform].length)));
    for (const tpl of templates) {
      out.packages.push({
        id: seededId(r, SEED_EPOCH - spec.createdDaysAgo * DAY),
        creatorId: spec.userId,
        platform: p.platform,
        title: tpl.title,
        description: tpl.description,
        deliverables: tpl.deliverables,
        priceCents: priceFor(r, p.platform, p.followers, tpl.factor),
        deliveryDays: between(r, tpl.days[0], tpl.days[1]),
        active: true,
        createdAt: created,
      });
    }
  }

  for (let i = 0; i < opts.portfolio; i++) {
    const video = chance(r, 0.25);
    const id = seededId(r, SEED_EPOCH - spec.createdDaysAgo * DAY);
    out.portfolioItems.push({
      id,
      creatorId: spec.userId,
      type: video ? 'VIDEO_LINK' : 'IMAGE',
      // example.com is reserved for documentation, so demo video links never reach a real site.
      url: video ? `https://example.com/demo-video/${id.toLowerCase()}` : `/demo/work-${pad(between(r, 1, 36))}.svg`,
      caption: pick(r, CAPTIONS),
      sortOrder: i,
    });
  }

  for (let i = 0; i < opts.reviewCount; i++) {
    const x = r();
    const rating = x < 0.6 ? 5 : x < 0.88 ? 4 : x < 0.98 ? 3 : 2;
    const daysAgo = between(r, 3, Math.max(4, spec.createdDaysAgo - 5));
    const replied = chance(r, 0.4);
    out.reviews.push({
      id: seededId(r, SEED_EPOCH - daysAgo * DAY),
      orderId: seededId(r, SEED_EPOCH - daysAgo * DAY),
      creatorId: spec.userId,
      brandName: pick(r, BRANDS),
      rating,
      comment: chance(r, 0.9) ? pick(r, REVIEWS[rating]) : null,
      creatorReply: replied ? pick(r, REPLIES) : null,
      repliedAt: replied ? new Date(t - (daysAgo - 1) * DAY).toISOString() : null,
      createdAt: new Date(t - daysAgo * DAY).toISOString(),
    });
  }
}

export function seedCreators(now: Date, ids: { leoId: string; newCreatorId: string; passwordHash: string }): SeedResult {
  const r = prng(20261120);
  const out: SeedResult = { users: [], creatorProfiles: [], socialAccounts: [], packages: [], portfolioItems: [], reviews: [] };
  const year = now.getUTCFullYear();

  // The demo creator account (creator@demo.test): approved, fully set up.
  build(
    {
      userId: ids.leoId,
      username: 'leomakes',
      displayName: 'Leo Marin',
      gender: 'MALE',
      birthYear: year - 31,
      country: 'US',
      city: 'Austin',
      niches: ['TECH', 'LIFESTYLE'],
      platforms: [
        { platform: 'INSTAGRAM', followers: 84_200, verified: true },
        { platform: 'TIKTOK', followers: 152_000, verified: true },
        { platform: 'YOUTUBE', followers: 23_400, verified: false },
      ],
      vetting: 'APPROVED',
      createdDaysAgo: 210,
    },
    r,
    now,
    out,
    { photo: '/demo/photo-01.svg', cover: '/demo/cover-01.svg', reviewCount: 7, portfolio: 9 },
  );

  // The draft creator account (newcreator@demo.test): nothing filled in yet.
  out.creatorProfiles.push({
    userId: ids.newCreatorId,
    username: null,
    displayName: 'Ivy Sandoval',
    bio: null,
    city: null,
    country: null,
    gender: null,
    birthYear: null,
    languages: [],
    niches: [],
    photoUrl: null,
    coverUrls: [],
    vettingStatus: 'DRAFT',
    rejectionReason: null,
    approvedAt: null,
    submittedAt: null,
    profileViews: 0,
    stripeAccountId: null,
    payoutStatus: 'NOT_STARTED',
    createdAt: new Date(now.getTime() - 2 * DAY).toISOString(),
  });

  // ~60 invented creators: 58 approved, 3 waiting for review, 1 rejected (the last 4 never show in search).
  const used = new Set(['leomakes']);
  const total = APPROVED_SEED_CREATORS + 4;
  for (let i = 0; i < total; i++) {
    const g = r();
    const gender: Gender = g < 0.55 ? 'FEMALE' : g < 0.92 ? 'MALE' : 'NON_BINARY';
    const first = pick(r, FIRST[gender]);
    const displayName = `${first} ${pick(r, LAST)}`;
    const niches = sample(r, Object.keys(NICHE_WORD) as Niche[], between(r, 1, 3));
    let username = `${first.toLowerCase()}${pick(r, NICHE_WORD[niches[0]])}`;
    while (used.has(username)) username += between(r, 1, 9);
    used.add(username);

    const loc = pick(r, LOCATIONS);
    const ugcOnly = chance(r, 0.12);
    const primary: Platform = ugcOnly ? 'UGC' : pick(r, ['INSTAGRAM', 'INSTAGRAM', 'TIKTOK', 'TIKTOK', 'YOUTUBE'] as const);
    const others = (['INSTAGRAM', 'TIKTOK', 'YOUTUBE'] as Platform[]).filter((p) => p !== primary);
    const primaryFollowers = ugcOnly ? between(r, 800, 9_000) : logFollowers(r, 2_000, 2_500_000);
    const platforms = [{ platform: primary, followers: primaryFollowers, verified: chance(r, 0.7) }];
    if (!ugcOnly) {
      for (const p of sample(r, others, between(r, 0, 2))) {
        platforms.push({ platform: p, followers: Math.round(primaryFollowers * (0.05 + r() * 0.8)), verified: chance(r, 0.4) });
      }
      if (chance(r, 0.15)) platforms.push({ platform: 'UGC', followers: 0, verified: false });
    }

    const vetting: VettingStatus = i < APPROVED_SEED_CREATORS ? 'APPROVED' : i < total - 1 ? 'PENDING_REVIEW' : 'REJECTED';
    const userId = seededId(r, SEED_EPOCH - 400 * DAY);
    const createdDaysAgo = between(r, 6, 420);
    out.users.push({
      id: userId,
      email: `${username}@creators.demo.test`,
      name: displayName,
      role: 'CREATOR',
      status: 'ACTIVE',
      passwordHash: ids.passwordHash,
      googleSub: null,
      emailVerifiedAt: new Date(now.getTime() - createdDaysAgo * DAY).toISOString(),
      createdAt: new Date(now.getTime() - createdDaysAgo * DAY).toISOString(),
      updatedAt: new Date(now.getTime() - createdDaysAgo * DAY).toISOString(),
    });
    build(
      { userId, username, displayName, gender, birthYear: year - between(r, 19, 48), country: loc.country, city: pick(r, loc.cities), niches, platforms, vetting, createdDaysAgo },
      r,
      now,
      out,
      {
        photo: chance(r, 0.82) ? `/demo/photo-${pad(between(r, 2, 24))}.svg` : null,
        cover: chance(r, 0.85) ? `/demo/cover-${pad(between(r, 2, 12))}.svg` : null,
        reviewCount: vetting === 'APPROVED' ? (chance(r, 0.15) ? 0 : between(r, 1, 14)) : 0,
        portfolio: between(r, 3, 12),
      },
    );
  }
  return out;
}
