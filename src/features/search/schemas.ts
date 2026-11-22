/**
 * Search query rules (FR-20 – FR-23).
 *
 * - `creatorSearchQuerySchema` validates GET /creators query params; the mock answers 422 with it,
 *   like the backend's Bean Validation would.
 * - `parseSearchUrl` / `toSearchUrl` convert between the shareable page URL (/search?...) and that
 *   query. The URL is friendlier than the API: prices in whole rupees, follower and age buckets by name.
 */
import { z } from 'zod';
import { AGE_BUCKETS, FOLLOWER_BUCKETS, SORTS, type SortValue } from '@/lib/catalog';
import type { CreatorSearchQuery, Gender, Niche, Platform } from '@/types';

export const PAGE_SIZE = 24;

const PLATFORM_VALUES = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'UGC'] as const satisfies readonly Platform[];
const GENDER_VALUES = ['FEMALE', 'MALE', 'NON_BINARY'] as const satisfies readonly Gender[];
const NICHE_VALUES = [
  'BEAUTY', 'FASHION', 'FITNESS', 'FOOD', 'TRAVEL', 'TECH', 'GAMING', 'LIFESTYLE', 'PARENTING',
  'FINANCE', 'HOME', 'PETS', 'MUSIC', 'EDUCATION', 'COMEDY', 'WELLNESS', 'SUSTAINABILITY', 'AUTOMOTIVE',
] as const satisfies readonly Niche[];
const SORT_VALUES = SORTS.map((s) => s.value) as [SortValue, ...SortValue[]];

const int = (min: number, max?: number) => {
  let s = z.coerce.number().int({ error: 'Must be a whole number.' }).min(min, { error: `Must be at least ${min}.` });
  if (max !== undefined) s = s.max(max, { error: `Must be at most ${max}.` });
  return s.optional();
};

export const creatorSearchQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    platform: z.enum(PLATFORM_VALUES).optional(),
    niche: z.enum(NICHE_VALUES).optional(),
    country: z.string().length(2).toUpperCase().optional(),
    city: z.string().trim().max(80).optional(),
    followersMin: int(0),
    followersMax: int(0),
    priceMinCents: int(0),
    priceMaxCents: int(0),
    language: z.string().length(2).toLowerCase().optional(),
    gender: z.enum(GENDER_VALUES).optional(),
    ageMin: int(13, 100),
    ageMax: int(13, 100),
    /** v2.6: usually accepts within 24 hours. Query strings carry "true"/"false". */
    fastAccept: z.preprocess((v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : v), z.boolean().optional()),
    sort: z.enum(SORT_VALUES).default('relevance'),
    page: z.coerce.number().int().min(0).default(0),
    size: z.coerce.number().int().min(1).max(PAGE_SIZE).default(PAGE_SIZE),
  })
  .refine((v) => v.followersMin === undefined || v.followersMax === undefined || v.followersMin <= v.followersMax, {
    error: 'Minimum followers must not exceed the maximum.',
    path: ['followersMin'],
  })
  .refine((v) => v.priceMinCents === undefined || v.priceMaxCents === undefined || v.priceMinCents <= v.priceMaxCents, {
    error: 'Minimum price must not exceed the maximum.',
    path: ['priceMinCents'],
  })
  .refine((v) => v.ageMin === undefined || v.ageMax === undefined || v.ageMin <= v.ageMax, {
    error: 'Minimum age must not exceed the maximum.',
    path: ['ageMin'],
  });

export type ValidSearchQuery = z.output<typeof creatorSearchQuerySchema>;

/* ---------- Page URL <-> API query ---------- */

/** What the search page keeps in its URL. Every field is optional; absent = no filter. */
export interface SearchState {
  q?: string;
  platform?: Platform;
  niche?: Niche;
  country?: string;
  city?: string;
  followers?: (typeof FOLLOWER_BUCKETS)[number]['value'];
  /** Whole rupees, as typed. */
  priceMin?: number;
  priceMax?: number;
  language?: string;
  gender?: Gender;
  age?: (typeof AGE_BUCKETS)[number]['value'];
  /** Accepts within 24 h (phase E). */
  fast?: boolean;
  sort?: SortValue;
  /** 1-based in the URL, so links read naturally. */
  page?: number;
}

const oneOf = <T extends string>(values: readonly T[], v: string | null): T | undefined => (v && (values as readonly string[]).includes(v) ? (v as T) : undefined);
const rupees = (v: string | null) => {
  if (!v || !/^\d{1,7}$/.test(v)) return undefined;
  return Number(v);
};

/** Reads /search?… leniently: anything unknown or malformed is ignored, never an error page. */
export function parseSearchUrl(sp: URLSearchParams): SearchState {
  const page = Number(sp.get('page'));
  const s: SearchState = {
    q: sp.get('q')?.trim().slice(0, 100) || undefined,
    platform: oneOf(PLATFORM_VALUES, sp.get('platform')?.toUpperCase() ?? null),
    niche: oneOf(NICHE_VALUES, sp.get('niche')?.toUpperCase() ?? null),
    country: /^[A-Za-z]{2}$/.test(sp.get('country') ?? '') ? sp.get('country')!.toUpperCase() : undefined,
    city: sp.get('city')?.trim().slice(0, 80) || undefined,
    followers: oneOf(FOLLOWER_BUCKETS.map((b) => b.value), sp.get('followers')),
    priceMin: rupees(sp.get('priceMin')),
    priceMax: rupees(sp.get('priceMax')),
    language: /^[a-z]{2}$/.test(sp.get('language') ?? '') ? sp.get('language')! : undefined,
    gender: oneOf(GENDER_VALUES, sp.get('gender')?.toUpperCase() ?? null),
    age: oneOf(AGE_BUCKETS.map((b) => b.value), sp.get('age')),
    fast: sp.get('fast') === '1' || undefined,
    sort: oneOf(SORT_VALUES, sp.get('sort')),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
  if (!s.country) s.city = undefined;
  return s;
}

/** Writes a SearchState back to URL params, leaving out defaults so links stay short. */
export function toSearchUrl(s: SearchState): URLSearchParams {
  const sp = new URLSearchParams();
  const put = (k: string, v: string | number | undefined) => {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  };
  put('q', s.q);
  put('platform', s.platform?.toLowerCase());
  put('niche', s.niche?.toLowerCase());
  put('country', s.country);
  put('city', s.country ? s.city : undefined);
  put('followers', s.followers);
  put('priceMin', s.priceMin);
  put('priceMax', s.priceMax);
  put('language', s.language);
  put('gender', s.gender?.toLowerCase());
  put('age', s.age);
  put('fast', s.fast ? 1 : undefined);
  put('sort', s.sort && s.sort !== 'relevance' ? s.sort : undefined);
  put('page', s.page && s.page > 1 ? s.page : undefined);
  return sp;
}

/** The API query for a page state. */
export function toApiQuery(s: SearchState): CreatorSearchQuery {
  const f = FOLLOWER_BUCKETS.find((b) => b.value === s.followers);
  const a = AGE_BUCKETS.find((b) => b.value === s.age);
  return {
    q: s.q,
    platform: s.platform,
    niche: s.niche,
    country: s.country,
    city: s.country ? s.city : undefined,
    followersMin: f?.min,
    followersMax: f?.max,
    priceMinCents: s.priceMin !== undefined ? s.priceMin * 100 : undefined,
    priceMaxCents: s.priceMax !== undefined ? s.priceMax * 100 : undefined,
    language: s.language,
    gender: s.gender,
    ageMin: a?.min,
    ageMax: a?.max,
    fastAccept: s.fast || undefined,
    sort: s.sort ?? 'relevance',
    page: (s.page ?? 1) - 1,
    size: PAGE_SIZE,
  };
}

/** Number of active filters (keyword and sort excluded), for the "Filters (n)" button. */
export const activeFilterCount = (s: SearchState) =>
  [s.platform, s.niche, s.country, s.followers, s.priceMin ?? s.priceMax, s.language, s.gender, s.age, s.fast].filter((v) => v !== undefined).length;
