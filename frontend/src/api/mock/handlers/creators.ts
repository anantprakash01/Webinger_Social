/**
 * Mock for the public Creators module: GET /creators (search, FR-20 – FR-24) and
 * GET /creators/{username} (profile, FR-15). Only APPROVED creators are visible (FR-16, rule 9.5.1).
 */
import { inquiryBetween } from './chat';
import { LOCATIONS } from '@/lib/catalog';
import type { SearchSuggestion } from '@/types';
import { availabilityOf, isAway } from './retention';
import { toAddon } from './orders';
import { creatorSearchQuerySchema, type ValidSearchQuery } from '@/features/search/schemas';
import { NICHE_LABEL } from '@/lib/catalog';
import type { CreatorCard, CreatorProfile, CreatorSearchPage, Platform } from '@/types';
import { getDb, now, type CreatorProfileRow, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';

const CURRENCY = 'INR';
/** Suspended or banned creators disappear from search and their profile (FR-82). */
const isActive = (userId: string) => getDb().users.find((u) => u.id === userId)?.status === 'ACTIVE';

interface Facts {
  profile: CreatorProfileRow & { username: string };
  card: CreatorCard;
  topFollowers: number;
  createdAt: string;
}

function ratingOf(creatorId: string) {
  const reviews = getDb().reviews.filter((r) => r.creatorId === creatorId);
  if (reviews.length === 0) return { ratingAvg: null, ratingCount: 0 };
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  return { ratingAvg: Math.round(avg * 10) / 10, ratingCount: reviews.length };
}

/** Builds the card for one creator, as seen through an optional platform filter. Null = not on that platform. */
export function cardFor(p: CreatorProfileRow & { username: string }, platform?: Platform): Facts | null {
  const db = getDb();
  const socials = db.socialAccounts.filter((s) => s.creatorId === p.userId);
  const packages = db.packages.filter((k) => k.creatorId === p.userId && k.active && (!platform || k.platform === platform));
  const top = [...socials].sort((a, b) => b.followers - a.followers)[0];
  const reachRow = platform ? socials.find((s) => s.platform === platform) : top;
  if (platform && !reachRow && packages.length === 0) return null;
  const card: CreatorCard = {
    username: p.username,
    displayName: p.displayName,
    photoUrl: p.photoUrl,
    city: p.city,
    country: p.country,
    niches: p.niches.slice(0, 3),
    reach: reachRow ? { platform: reachRow.platform, handle: reachRow.handle, followers: reachRow.followers } : null,
    startingPriceCents: packages.length ? Math.min(...packages.map((k) => k.priceCents)) : null,
    currency: CURRENCY,
    ...ratingOf(p.userId),
    verified: socials.some((s) => s.verifiedAt),
    away: isAway(p),
  };
  return { profile: p, card, topFollowers: top?.followers ?? 0, createdAt: p.approvedAt ?? p.createdAt };
}

const inRange = (v: number | null | undefined, min?: number, max?: number) =>
  (min === undefined && max === undefined) || (v !== null && v !== undefined && (min === undefined || v >= min) && (max === undefined || v <= max));

/** Keyword relevance: every word must match somewhere; name hits weigh most (FR-20). 0 = no match. */
function keywordScore(p: CreatorProfileRow & { username: string }, words: string[]): number {
  if (words.length === 0) return 1;
  const name = `${p.displayName} ${p.username}`.toLowerCase();
  const niches = p.niches.map((n) => `${n} ${NICHE_LABEL[n]}`.toLowerCase()).join(' ');
  const bio = (p.bio ?? '').toLowerCase();
  let score = 0;
  for (const w of words) {
    const s = (name.includes(w) ? 3 : 0) + (niches.includes(w) ? 2 : 0) + (bio.includes(w) ? 1 : 0);
    if (s === 0) return 0;
    score += s;
  }
  return score;
}

function matches(f: Facts, q: ValidSearchQuery, year: number): boolean {
  const p = f.profile;
  if (q.niche && !p.niches.includes(q.niche)) return false;
  if (q.country && p.country !== q.country) return false;
  if (q.city && p.city?.toLowerCase() !== q.city.toLowerCase()) return false;
  if (q.language && !p.languages.includes(q.language)) return false;
  if (q.gender && p.gender !== q.gender) return false;
  if (q.fastAccept) {
    const h = trackRecord(p.userId).typicalAcceptHours;
    if (h === null || h > 24) return false;
  }
  if (!inRange(f.card.reach?.followers, q.followersMin, q.followersMax)) return false;
  if (!inRange(f.card.startingPriceCents, q.priceMinCents, q.priceMaxCents)) return false;
  if (q.ageMin !== undefined || q.ageMax !== undefined) {
    if (!p.birthYear) return false;
    if (!inRange(year - p.birthYear, q.ageMin, q.ageMax)) return false;
  }
  return true;
}

/** "Featured" order when there is no keyword: well-rated creators with many reviews first. */
const featuredScore = (c: CreatorCard) => (c.ratingAvg ?? 3.5) * Math.log2(c.ratingCount + 2);

export const searchCreators: Handler = ({ req }) => {
  const q = parseBody(creatorSearchQuerySchema, Object.fromEntries(req.query));
  const words = (q.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const year = now().getUTCFullYear();

  const scored: Array<Facts & { score: number }> = [];
  for (const p of getDb().creatorProfiles) {
    if (p.vettingStatus !== 'APPROVED' || !p.username || !isActive(p.userId)) continue;
    const facts = cardFor(p as CreatorProfileRow & { username: string }, q.platform);
    if (!facts || !matches(facts, q, year)) continue;
    const score = keywordScore(facts.profile, words);
    if (score > 0) scored.push({ ...facts, score });
  }

  const byName = (a: Facts, b: Facts) => a.profile.username.localeCompare(b.profile.username);
  const cmp: Record<ValidSearchQuery['sort'], (a: Facts & { score: number }, b: Facts & { score: number }) => number> = {
    relevance: (a, b) => b.score - a.score || featuredScore(b.card) - featuredScore(a.card) || byName(a, b),
    price_asc: (a, b) => (a.card.startingPriceCents ?? Infinity) - (b.card.startingPriceCents ?? Infinity) || byName(a, b),
    followers_desc: (a, b) => (b.card.reach?.followers ?? 0) - (a.card.reach?.followers ?? 0) || byName(a, b),
    rating_desc: (a, b) => (b.card.ratingAvg ?? 0) - (a.card.ratingAvg ?? 0) || b.card.ratingCount - a.card.ratingCount || byName(a, b),
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt) || byName(a, b),
  };
  scored.sort(cmp[q.sort]);

  const totalElements = scored.length;
  const body: CreatorSearchPage = {
    content: scored.slice(q.page * q.size, (q.page + 1) * q.size).map((f) => f.card),
    page: q.page,
    size: q.size,
    totalElements,
    totalPages: Math.ceil(totalElements / q.size),
  };
  return ok(body);
};

/**
 * v1.1 track record. Completed orders on the platform; seeded historic reviews stand for orders
 * completed before the demo data starts. Typical acceptance time = median over the last 20 accepted
 * orders, rounded up to whole hours; null with fewer than 3.
 */
function trackRecord(creatorId: string): { completedOrders: number; typicalAcceptHours: number | null } {
  const db = getDb();
  const mine = db.orders.filter((o) => o.creatorUserId === creatorId);
  const ids = new Set(db.orders.map((o) => o.id));
  const historic = db.reviews.filter((r) => r.creatorId === creatorId && !ids.has(r.orderId)).length;
  const waits = mine
    .map((o) => {
      const created = db.orderEvents.find((e) => e.orderId === o.id && e.type === 'CREATE')?.at;
      const accepted = db.orderEvents.find((e) => e.orderId === o.id && e.type === 'ACCEPT')?.at;
      return created && accepted ? { at: accepted, h: (new Date(accepted).getTime() - new Date(created).getTime()) / 3_600_000 } : null;
    })
    .filter((x): x is { at: string; h: number } => !!x)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20)
    .map((x) => x.h)
    .sort((a, b) => a - b);
  // Fewer than 3 orders in the mock: fall back to the seeded history (like historic reviews).
  const median = waits.length >= 3 ? waits[Math.floor((waits.length - 1) / 2)] : (getDb().creatorProfiles.find((p) => p.userId === creatorId)?.historicAcceptHours ?? null);
  return { completedOrders: mine.filter((o) => o.status === 'COMPLETED').length + historic, typicalAcceptHours: median === null ? null : Math.max(1, Math.ceil(median)) };
}

/** v2.6 search-box suggestions: creators (name or username), niches and cities. */
export const suggestSearch: Handler = ({ req }) => {
  const q = (req.query.get('q') ?? '').trim().toLowerCase().slice(0, 100);
  if (!q) return ok({ suggestions: [] });
  const out: SearchSuggestion[] = [];
  for (const [code, label] of Object.entries(NICHE_LABEL)) if (label.toLowerCase().startsWith(q)) out.push({ kind: 'NICHE', label, value: code, detail: 'Niche' });
  for (const l of LOCATIONS) for (const c of l.cities) if (c.toLowerCase().startsWith(q)) out.push({ kind: 'CITY', label: c, value: `${l.country}:${c}`, detail: l.label });
  const people = getDb()
    .creatorProfiles.filter((p) => p.vettingStatus === 'APPROVED' && p.username && isActive(p.userId))
    .filter((p) => p.displayName.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || p.displayName.toLowerCase().startsWith(q) || p.username!.startsWith(q))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, 5)
    .map((p): SearchSuggestion => ({ kind: 'CREATOR', label: p.displayName, value: p.username!, detail: `@${p.username}` }));
  return ok({ suggestions: [...out.slice(0, 3), ...people].slice(0, 8) });
};

export const getCreatorProfile: Handler = ({ params, user }) => {
  const db = getDb();
  const viewer = user as UserRow | undefined;
  const wanted = params.username.toLowerCase();
  const p = db.creatorProfiles.find((c) => c.username?.toLowerCase() === wanted);
  const isOwner = !!p && viewer?.id === p.userId;
  const canPreview = isOwner || viewer?.role === 'ADMIN';
  // Unapproved profiles answer 404 to the public, as if they did not exist.
  if (!p || !p.username || ((p.vettingStatus !== 'APPROVED' || !isActive(p.userId)) && !canPreview)) fail(404, 'No creator with that username.', 'CREATOR_NOT_FOUND');

  const facts = cardFor(p as CreatorProfileRow & { username: string })!;
  if (!isOwner && p.vettingStatus === 'APPROVED') p.profileViews += 1;

  const body: CreatorProfile = {
    ...facts.card,
    ...trackRecord(p.userId),
    availability: availabilityOf(p),
    myInquiryId: viewer?.role === 'BRAND' ? (inquiryBetween(viewer.id, p.userId)?.id ?? null) : null,
    bio: p.bio,
    languages: p.languages,
    coverUrls: p.coverUrls.slice(0, 3),
    socials: db.socialAccounts
      .filter((s) => s.creatorId === p.userId)
      .sort((a, b) => b.followers - a.followers)
      .map((s) => ({ id: s.id, platform: s.platform, handle: s.handle, url: s.url, followers: s.followers, engagementRateBps: s.engagementRateBps, verified: !!s.verifiedAt })),
    packages: db.packages
      .filter((k) => k.creatorId === p.userId && k.active)
      .sort((a, b) => a.priceCents - b.priceCents)
      .map((k) => ({ id: k.id, platform: k.platform, title: k.title, description: k.description, deliverables: k.deliverables, priceCents: k.priceCents, currency: CURRENCY, deliveryDays: k.deliveryDays, addons: (k.addons ?? []).map(toAddon) })),
    portfolio: db.portfolioItems
      .filter((i) => i.creatorId === p.userId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .slice(0, 12)
      .map((i) => ({ id: i.id, type: i.type, url: i.url, caption: i.caption })),
    reviews: db.reviews
      .filter((r) => r.creatorId === p.userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, brandName: r.brandName, createdAt: r.createdAt, creatorReply: r.creatorReply, repliedAt: r.repliedAt })),
    memberSince: p.createdAt,
    vettingStatus: p.vettingStatus,
  };
  return ok(body);
};
