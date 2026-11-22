import { describe, expect, it } from 'vitest';
import { formatCompact } from '@/lib/catalog';
import { activeFilterCount, parseSearchUrl, toApiQuery, toSearchUrl } from './schemas';

describe('search URL state', () => {
  it('round-trips every filter through the URL', () => {
    const url = 'q=skincare&platform=tiktok&niche=beauty&country=US&city=Austin&followers=micro&priceMin=50&priceMax=300&language=en&gender=female&age=25-34&sort=price_asc&page=2';
    const state = parseSearchUrl(new URLSearchParams(url));
    expect(state).toEqual({
      q: 'skincare', platform: 'TIKTOK', niche: 'BEAUTY', country: 'US', city: 'Austin', followers: 'micro',
      priceMin: 50, priceMax: 300, language: 'en', gender: 'FEMALE', age: '25-34', sort: 'price_asc', page: 2,
    });
    expect(parseSearchUrl(toSearchUrl(state))).toEqual(state);
    expect(activeFilterCount(state)).toBe(8);
  });

  it('maps the page state to the API query (cents, buckets, 0-based page)', () => {
    const q = toApiQuery(parseSearchUrl(new URLSearchParams('followers=mega&priceMin=50&age=45%2B&page=3')));
    expect(q).toMatchObject({ followersMin: 1_000_000, followersMax: undefined, priceMinCents: 5_000, ageMin: 45, ageMax: undefined, page: 2, size: 24, sort: 'relevance' });
  });

  it('ignores junk instead of failing', () => {
    const s = parseSearchUrl(new URLSearchParams('platform=myspace&niche=x&priceMin=-5&followers=huge&page=abc&city=Paris&gender=1'));
    expect(s).toEqual(Object.fromEntries(Object.keys(s).map((k) => [k, undefined])));
  });

  it('drops a city without a country and leaves defaults out of links', () => {
    expect(parseSearchUrl(new URLSearchParams('city=Austin')).city).toBeUndefined();
    expect(toSearchUrl({ sort: 'relevance', page: 1 }).toString()).toBe('');
  });
});

describe('formatCompact', () => {
  it('formats follower counts', () => {
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(1_000)).toBe('1K');
    expect(formatCompact(12_345)).toBe('12.3K');
    expect(formatCompact(152_000)).toBe('152K');
    expect(formatCompact(2_450_000)).toBe('2.4M');
  });
});
