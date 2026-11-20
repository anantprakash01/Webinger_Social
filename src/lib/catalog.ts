/**
 * Fixed lists shared by the API contract, the mock and the UI: platforms, niches, languages,
 * genders, locations, and the follower / age buckets used by search filters (FR-21).
 * Codes match the enums in docs/api/openapi.yaml.
 */
import type { Gender, Niche, Platform } from '@/types';

export const PLATFORMS: Array<{ value: Platform; label: string }> = [
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'UGC', label: 'UGC' },
];
export const PLATFORM_LABEL = Object.fromEntries(PLATFORMS.map((p) => [p.value, p.label])) as Record<Platform, string>;

export const NICHES: Array<{ value: Niche; label: string }> = [
  { value: 'BEAUTY', label: 'Beauty' },
  { value: 'FASHION', label: 'Fashion' },
  { value: 'FITNESS', label: 'Fitness' },
  { value: 'FOOD', label: 'Food & drink' },
  { value: 'TRAVEL', label: 'Travel' },
  { value: 'TECH', label: 'Tech' },
  { value: 'GAMING', label: 'Gaming' },
  { value: 'LIFESTYLE', label: 'Lifestyle' },
  { value: 'PARENTING', label: 'Parenting' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'HOME', label: 'Home & decor' },
  { value: 'PETS', label: 'Pets' },
  { value: 'MUSIC', label: 'Music' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'COMEDY', label: 'Comedy' },
  { value: 'WELLNESS', label: 'Health & wellness' },
  { value: 'SUSTAINABILITY', label: 'Sustainability' },
  { value: 'AUTOMOTIVE', label: 'Automotive' },
];
export const NICHE_LABEL = Object.fromEntries(NICHES.map((n) => [n.value, n.label])) as Record<Niche, string>;

/** ISO 639-1 codes. */
export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ta', label: 'Tamil' },
];
export const LANGUAGE_LABEL: Record<string, string> = Object.fromEntries(LANGUAGES.map((l) => [l.value, l.label]));

export const GENDERS: Array<{ value: Gender; label: string }> = [
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'NON_BINARY', label: 'Non-binary' },
];

/** ISO 3166-1 alpha-2 country codes with the cities the prototype knows. */
export const LOCATIONS: Array<{ country: string; label: string; cities: string[] }> = [
  { country: 'US', label: 'United States', cities: ['New York', 'Los Angeles', 'Austin', 'Miami', 'Chicago'] },
  { country: 'GB', label: 'United Kingdom', cities: ['London', 'Manchester', 'Bristol'] },
  { country: 'IN', label: 'India', cities: ['Mumbai', 'Bengaluru', 'Delhi', 'Chennai'] },
  { country: 'CA', label: 'Canada', cities: ['Toronto', 'Vancouver', 'Montreal'] },
  { country: 'AU', label: 'Australia', cities: ['Sydney', 'Melbourne'] },
  { country: 'DE', label: 'Germany', cities: ['Berlin', 'Munich'] },
  { country: 'AE', label: 'United Arab Emirates', cities: ['Dubai', 'Abu Dhabi'] },
  { country: 'BR', label: 'Brazil', cities: ['São Paulo', 'Rio de Janeiro'] },
  { country: 'ES', label: 'Spain', cities: ['Madrid', 'Barcelona'] },
];
export const COUNTRY_LABEL: Record<string, string> = Object.fromEntries(LOCATIONS.map((l) => [l.country, l.label]));
export const citiesOf = (country?: string) => LOCATIONS.find((l) => l.country === country)?.cities ?? [];

/** Follower-count buckets for the filter. Values are the URL token; min/max go to the API. */
export const FOLLOWER_BUCKETS = [
  { value: 'nano', label: '1K – 10K', min: 1_000, max: 10_000 },
  { value: 'micro', label: '10K – 50K', min: 10_000, max: 50_000 },
  { value: 'mid', label: '50K – 500K', min: 50_000, max: 500_000 },
  { value: 'macro', label: '500K – 1M', min: 500_000, max: 1_000_000 },
  { value: 'mega', label: '1M+', min: 1_000_000, max: undefined },
] as const;

export const AGE_BUCKETS = [
  { value: '18-24', label: '18 – 24', min: 18, max: 24 },
  { value: '25-34', label: '25 – 34', min: 25, max: 34 },
  { value: '35-44', label: '35 – 44', min: 35, max: 44 },
  { value: '45+', label: '45+', min: 45, max: undefined },
] as const;

export const SORTS = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'followers_desc', label: 'Most followers' },
  { value: 'rating_desc', label: 'Highest rated' },
  { value: 'newest', label: 'Newest' },
] as const;
export type SortValue = (typeof SORTS)[number]['value'];

/** 12345 → "12.3K", 2_400_000 → "2.4M". */
export function formatCompact(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${trim(n / 1_000)}K`;
  return `${trim(n / 1_000_000)}M`;
}
const trim = (x: number) => (x >= 100 ? Math.round(x).toString() : (Math.floor(x * 10) / 10).toString().replace(/\.0$/, ''));

/** Brand industries (FR-05). Codes match the BrandIndustry enum in the contract. */
export const INDUSTRIES = [
  { value: 'BEAUTY', label: 'Beauty & personal care' },
  { value: 'FASHION', label: 'Fashion & accessories' },
  { value: 'FOOD', label: 'Food & beverage' },
  { value: 'HEALTH', label: 'Health & fitness' },
  { value: 'HOME', label: 'Home & living' },
  { value: 'TECH', label: 'Technology & apps' },
  { value: 'TRAVEL', label: 'Travel & hospitality' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'PETS', label: 'Pets' },
  { value: 'AGENCY', label: 'Agency' },
  { value: 'OTHER', label: 'Other' },
] as const;
export const INDUSTRY_LABEL: Record<string, string> = Object.fromEntries(INDUSTRIES.map((i) => [i.value, i.label]));

/** Usernames that would clash with routes or confuse people. */
export const RESERVED_USERNAMES = ['me', 'admin', 'api', 'u', 'search', 'login', 'signup', 'support', 'help', 'brand', 'creator', 'checkout', 'settings', 'webinger', 'collab'];
