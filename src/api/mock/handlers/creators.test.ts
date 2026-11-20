import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { ApiError, type CreatorCard } from '@/types';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';
import { APPROVED_SEED_CREATORS } from '../seed/creators';

beforeEach(async () => {
  await api.dev.reset();
});

/** Every page of a search, for checks across the full result set. */
async function all(query: Parameters<typeof api.creators.search>[0]): Promise<CreatorCard[]> {
  const out: CreatorCard[] = [];
  for (let page = 0; ; page++) {
    const r = await api.creators.search({ ...query, page });
    out.push(...r.content);
    if (page >= r.totalPages - 1) return out;
  }
}

const profileOf = (username: string) => getDb().creatorProfiles.find((p) => p.username === username)!;

describe('seed', () => {
  it('has about 60 approved creators plus some that are not live', () => {
    const profiles = getDb().creatorProfiles;
    expect(profiles.filter((p) => p.vettingStatus === 'APPROVED')).toHaveLength(APPROVED_SEED_CREATORS + 1); // + Leo
    expect(profiles.some((p) => p.vettingStatus === 'PENDING_REVIEW')).toBe(true);
    expect(profiles.some((p) => p.vettingStatus === 'REJECTED')).toBe(true);
  });

  it('is identical after a reset (stable ids for links)', async () => {
    const before = getDb().packages.map((p) => p.id);
    await api.dev.reset();
    expect(getDb().packages.map((p) => p.id)).toEqual(before);
  });

  it('respects package rules: price ≥ $10, 1–60 days, max 8 active, max 3 niches', () => {
    const db = getDb();
    for (const k of db.packages) {
      expect(k.priceCents).toBeGreaterThanOrEqual(1_000);
      expect(Number.isInteger(k.priceCents)).toBe(true);
      expect(k.deliveryDays).toBeGreaterThanOrEqual(1);
      expect(k.deliveryDays).toBeLessThanOrEqual(60);
    }
    for (const p of db.creatorProfiles) {
      expect(db.packages.filter((k) => k.creatorId === p.userId && k.active).length).toBeLessThanOrEqual(8);
      expect(p.niches.length).toBeLessThanOrEqual(3);
      expect(db.portfolioItems.filter((i) => i.creatorId === p.userId).length).toBeLessThanOrEqual(12);
    }
  });
});

describe('GET /creators (search)', () => {
  it('returns 24 per page with paging metadata (FR-23)', async () => {
    const r = await api.creators.search({});
    expect(r.content).toHaveLength(24);
    expect(r.size).toBe(24);
    expect(r.totalElements).toBe(APPROVED_SEED_CREATORS + 1);
    expect(r.totalPages).toBe(Math.ceil((APPROVED_SEED_CREATORS + 1) / 24));
  });

  it('never shows unapproved creators', async () => {
    const visible = new Set((await all({})).map((c) => c.username));
    for (const p of getDb().creatorProfiles.filter((x) => x.vettingStatus !== 'APPROVED')) {
      expect(visible.has(p.username ?? '')).toBe(false);
    }
  });

  it('cards carry the FR-24 fields', async () => {
    const leo = (await all({ q: 'leomakes' }))[0];
    expect(leo).toMatchObject({
      username: 'leomakes',
      displayName: 'Leo Marin',
      reach: { platform: 'TIKTOK', followers: 152_000 },
      verified: true,
      currency: 'USD',
    });
    expect(leo.ratingCount).toBe(7);
    expect(leo.startingPriceCents).toBe(Math.min(...getDb().packages.filter((k) => k.creatorId === profileOf('leomakes').userId).map((k) => k.priceCents)));
  });

  it('keyword search needs every word to match name, bio or niche (FR-20)', async () => {
    expect((await all({ q: 'Leo Marin' })).map((c) => c.username)).toContain('leomakes');
    const tech = await all({ q: 'tech' });
    expect(tech.length).toBeGreaterThan(0);
    for (const c of tech) {
      const p = profileOf(c.username);
      expect(`${p.displayName} ${p.username} ${p.bio} ${p.niches.join(' ')}`.toLowerCase()).toContain('tech');
    }
    expect(await all({ q: 'zzzz-nothing-matches' })).toEqual([]);
  });

  it('filters by platform and reports that platform’s reach and price (FR-21)', async () => {
    const yt = await all({ platform: 'YOUTUBE' });
    expect(yt.length).toBeGreaterThan(0);
    for (const c of yt) expect(c.reach?.platform).toBe('YOUTUBE');
    const leo = yt.find((c) => c.username === 'leomakes')!;
    expect(leo.reach?.followers).toBe(23_400);
    const leoYtPrices = getDb().packages.filter((k) => k.creatorId === profileOf('leomakes').userId && k.platform === 'YOUTUBE').map((k) => k.priceCents);
    expect(leo.startingPriceCents).toBe(Math.min(...leoYtPrices));
  });

  it('combines niche, location, language, gender, followers, price and age filters', async () => {
    const year = new Date().getUTCFullYear();
    const query = { niche: 'TECH', country: 'US', followersMin: 10_000, priceMaxCents: 100_000 } as const;
    for (const c of await all(query)) {
      const p = profileOf(c.username);
      expect(p.niches).toContain('TECH');
      expect(p.country).toBe('US');
      expect(c.reach!.followers).toBeGreaterThanOrEqual(10_000);
      expect(c.startingPriceCents!).toBeLessThanOrEqual(100_000);
    }
    for (const c of await all({ language: 'hi' })) expect(profileOf(c.username).languages).toContain('hi');
    for (const c of await all({ gender: 'NON_BINARY' })) expect(profileOf(c.username).gender).toBe('NON_BINARY');
    for (const c of await all({ ageMin: 25, ageMax: 34 })) {
      const age = year - profileOf(c.username).birthYear!;
      expect(age).toBeGreaterThanOrEqual(25);
      expect(age).toBeLessThanOrEqual(34);
    }
    const austin = await all({ country: 'US', city: 'austin' });
    expect(austin.map((c) => c.username)).toContain('leomakes');
    for (const c of austin) expect(c.city).toBe('Austin');
  });

  it('sorts by price, followers, rating and newest (FR-22)', async () => {
    const isSorted = (xs: number[], dir: 1 | -1) => xs.every((x, i) => i === 0 || dir * (x - xs[i - 1]) >= 0);
    expect(isSorted((await all({ sort: 'price_asc' })).map((c) => c.startingPriceCents ?? Infinity), 1)).toBe(true);
    expect(isSorted((await all({ sort: 'followers_desc' })).map((c) => c.reach?.followers ?? 0), -1)).toBe(true);
    expect(isSorted((await all({ sort: 'rating_desc' })).map((c) => c.ratingAvg ?? 0), -1)).toBe(true);
    const newest = (await all({ sort: 'newest' })).map((c) => {
      const p = profileOf(c.username);
      return new Date(p.approvedAt ?? p.createdAt).getTime();
    });
    expect(isSorted(newest, -1)).toBe(true);
  });

  it('answers 422 for invalid parameters', async () => {
    await expect(api.creators.search({ size: 100 })).rejects.toMatchObject({ status: 422 });
    await expect(api.creators.search({ followersMin: 5_000, followersMax: 10 })).rejects.toMatchObject({ status: 422 });
    await expect(api.creators.search({ platform: 'MYSPACE' as never })).rejects.toBeInstanceOf(ApiError);
  });

  it('shows a newly approved package in search right away (FR-12 acceptance)', async () => {
    const leo = profileOf('leomakes');
    getDb().packages.push({
      id: 'NEWPKG', creatorId: leo.userId, platform: 'INSTAGRAM', title: 'Tiny test', description: '', deliverables: [],
      priceCents: 1_000, deliveryDays: 2, active: true, createdAt: new Date().toISOString(),
    });
    expect((await all({ q: 'leomakes' }))[0].startingPriceCents).toBe(1_000);
  });
});

describe('GET /creators/{username} (profile)', () => {
  it('returns the public profile with active packages cheapest first (FR-15)', async () => {
    const p = await api.creators.profile('LeoMakes');
    expect(p.username).toBe('leomakes');
    expect(p.vettingStatus).toBe('APPROVED');
    expect(p.socials.map((s) => s.platform)).toEqual(['TIKTOK', 'INSTAGRAM', 'YOUTUBE']);
    expect(p.packages.length).toBeGreaterThan(0);
    expect(p.packages.map((k) => k.priceCents)).toEqual([...p.packages.map((k) => k.priceCents)].sort((a, b) => a - b));
    expect(p.portfolio.length).toBeLessThanOrEqual(12);
    expect(p.reviews).toHaveLength(7);
    expect(p.reviews.map((r) => r.createdAt)).toEqual([...p.reviews.map((r) => r.createdAt)].sort().reverse());
    expect(p).not.toHaveProperty('birthYear');
    expect(p).not.toHaveProperty('gender');
  });

  it('hides inactive packages', async () => {
    const leo = profileOf('leomakes');
    const first = getDb().packages.find((k) => k.creatorId === leo.userId)!;
    first.active = false;
    const p = await api.creators.profile('leomakes');
    expect(p.packages.some((k) => k.id === first.id)).toBe(false);
  });

  it('404s for unknown and unapproved creators', async () => {
    await expect(api.creators.profile('nobody-here')).rejects.toMatchObject({ status: 404 });
    const pending = getDb().creatorProfiles.find((p) => p.vettingStatus === 'PENDING_REVIEW')!;
    await expect(api.creators.profile(pending.username!)).rejects.toMatchObject({ status: 404 });
  });

  it('lets the owner and admins preview an unapproved profile', async () => {
    const pending = getDb().creatorProfiles.find((p) => p.vettingStatus === 'PENDING_REVIEW')!;
    const owner = getDb().users.find((u) => u.id === pending.userId)!;
    await api.auth.login(owner.email, DEMO_PASSWORD);
    expect((await api.creators.profile(pending.username!)).vettingStatus).toBe('PENDING_REVIEW');
    await api.auth.login('admin@demo.test', DEMO_PASSWORD);
    expect((await api.creators.profile(pending.username!)).vettingStatus).toBe('PENDING_REVIEW');
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    await expect(api.creators.profile(pending.username!)).rejects.toMatchObject({ status: 404 });
  });

  it('counts views from everyone but the creator (FR-70)', async () => {
    const before = profileOf('leomakes').profileViews;
    await api.creators.profile('leomakes');
    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    await api.creators.profile('leomakes');
    expect(profileOf('leomakes').profileViews).toBe(before + 1);
  });
});
