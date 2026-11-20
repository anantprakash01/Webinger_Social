/**
 * In-memory tables for the Phase 0 mock, seeded with invented data (no real people or brands).
 * Persists to sessionStorage so a page refresh keeps demo state; `resetDb()` restores the seed.
 *
 * Shapes follow the MySQL data model in CLAUDE.md section 7, trimmed to what the mock needs.
 * Week 1: demo accounts. Week 2: ~60 invented creators with socials, packages, portfolio, reviews
 * (src/api/mock/seed/creators.ts). Orders and campaigns arrive with their weeks.
 */
import type { Gender, Niche, Platform, Role, UserStatus, VettingStatus } from '@/types';
import { DEFAULT_FEES, type FeeConfig } from './fees';
import type { LedgerEntry } from './ledger';
import type { MockOrder, OrderEvent } from './orderMachine';
import { DEMO_PASSWORD } from './demo';
import { seedCreators } from './seed/creators';

/* ---------- Row types ---------- */

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  /** Mock stand-in for a BCrypt (cost 12) hash. Null for Google-only accounts. */
  passwordHash: string | null;
  googleSub: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorProfileRow {
  userId: string;
  username: string | null;
  displayName: string;
  bio: string | null;
  city: string | null;
  /** ISO 3166-1 alpha-2 */
  country: string | null;
  gender: Gender | null;
  birthYear: number | null;
  /** ISO 639-1 codes */
  languages: string[];
  /** Max 3 (FR-10). The backend keeps these in creator_niches. */
  niches: Niche[];
  photoUrl: string | null;
  coverUrls: string[];
  vettingStatus: VettingStatus;
  rejectionReason: string | null;
  approvedAt: string | null;
  profileViews: number;
  stripeAccountId: string | null;
  createdAt: string;
}

export interface SocialAccountRow {
  id: string;
  creatorId: string;
  platform: Platform;
  handle: string;
  url: string | null;
  followers: number;
  engagementRateBps: number | null;
  verifiedAt: string | null;
}

export interface PackageRow {
  id: string;
  creatorId: string;
  platform: Platform;
  title: string;
  description: string;
  deliverables: string[];
  priceCents: number;
  deliveryDays: number;
  active: boolean;
  createdAt: string;
}

export interface PortfolioItemRow {
  id: string;
  creatorId: string;
  type: 'IMAGE' | 'VIDEO_LINK';
  url: string;
  caption: string | null;
  sortOrder: number;
}

export interface ReviewRow {
  id: string;
  /** Seeded "historic" reviews point at orders that are not in the mock. */
  orderId: string;
  creatorId: string;
  /** Denormalised for the mock; the backend joins order → brand profile. */
  brandName: string;
  rating: number;
  comment: string | null;
  creatorReply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

export interface BrandProfileRow {
  userId: string;
  companyName: string | null;
}

export interface OneTimeTokenRow {
  token: string;
  userId: string;
  kind: 'VERIFY_EMAIL' | 'RESET_PASSWORD';
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface AccessTokenRow {
  token: string;
  userId: string;
  expiresAt: string;
}

export interface RefreshTokenRow {
  token: string;
  userId: string;
  /** All tokens from one sign-in share a family; reuse of a revoked token revokes the family. */
  familyId: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface OutboxEmailRow {
  id: string;
  to: string;
  subject: string;
  body: string;
  link: string | null;
  createdAt: string;
}

export interface Db {
  schemaVersion: number;
  /** Added to the real clock; "Simulate time" moves it forward. */
  clockOffsetMs: number;
  users: UserRow[];
  creatorProfiles: CreatorProfileRow[];
  socialAccounts: SocialAccountRow[];
  packages: PackageRow[];
  portfolioItems: PortfolioItemRow[];
  reviews: ReviewRow[];
  brandProfiles: BrandProfileRow[];
  oneTimeTokens: OneTimeTokenRow[];
  accessTokens: AccessTokenRow[];
  refreshTokens: RefreshTokenRow[];
  outbox: OutboxEmailRow[];
  feeConfigs: FeeConfig[];
  orders: MockOrder[];
  orderEvents: OrderEvent[];
  ledgerEntries: LedgerEntry[];
}

/* ---------- Helpers ---------- */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 26-character ULID: 10 chars of time + 16 random, Crockford base32 (same format as the API's public ids). */
export function ulid(time = Date.now()): string {
  let t = time;
  let head = '';
  for (let i = 0; i < 10; i++) {
    head = CROCKFORD[t % 32] + head;
    t = Math.floor(t / 32);
  }
  const rnd = new Uint8Array(16);
  crypto.getRandomValues(rnd);
  let tail = '';
  for (const b of rnd) tail += CROCKFORD[b % 32];
  return head + tail;
}

/** Opaque random token for links and sessions. */
export function randomToken(bytes = 24): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Not a real password hash. The backend uses BCrypt cost 12; the mock only needs to avoid storing
 * the plain text in sessionStorage. FNV-1a, hex.
 */
export function mockHash(password: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < password.length; i++) {
    h ^= password.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `mock$${h.toString(16).padStart(8, '0')}`;
}

/* ---------- Seed ---------- */

/** Bump whenever row shapes or the seed change; older sessionStorage data is then discarded. */
export const SCHEMA_VERSION = 2;

/** Fixed ids so tests and links stay stable across resets. */
export const SEED_IDS = {
  brand: '01JD0000000000000000BRAND1',
  creator: '01JD000000000000000CREATR1',
  newCreator: '01JD000000000000000CREATR2',
  admin: '01JD0000000000000000ADMIN1',
  unverifiedBrand: '01JD0000000000000000BRAND2',
} as const;

function seed(now: Date): Db {
  const at = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const pw = mockHash(DEMO_PASSWORD);
  const user = (id: string, email: string, name: string, role: Role, verified = true): UserRow => ({
    id,
    email,
    name,
    role,
    status: 'ACTIVE',
    passwordHash: pw,
    googleSub: null,
    emailVerifiedAt: verified ? at : null,
    createdAt: at,
    updatedAt: at,
  });
  const creators = seedCreators(now, { leoId: SEED_IDS.creator, newCreatorId: SEED_IDS.newCreator, passwordHash: pw });
  return {
    schemaVersion: SCHEMA_VERSION,
    clockOffsetMs: 0,
    users: [
      user(SEED_IDS.brand, 'brand@demo.test', 'Maya Okafor', 'BRAND'),
      user(SEED_IDS.creator, 'creator@demo.test', 'Leo Marin', 'CREATOR'),
      user(SEED_IDS.newCreator, 'newcreator@demo.test', 'Ivy Sandoval', 'CREATOR'),
      user(SEED_IDS.admin, 'admin@demo.test', 'Sam Ortega', 'ADMIN'),
      user(SEED_IDS.unverifiedBrand, 'unverified@demo.test', 'Theo Lindqvist', 'BRAND', false),
      ...creators.users,
    ],
    creatorProfiles: creators.creatorProfiles,
    socialAccounts: creators.socialAccounts,
    packages: creators.packages,
    portfolioItems: creators.portfolioItems,
    reviews: creators.reviews,
    brandProfiles: [
      { userId: SEED_IDS.brand, companyName: 'Saltbay Supply Co.' },
      { userId: SEED_IDS.unverifiedBrand, companyName: 'Fernhill Tea House' },
    ],
    oneTimeTokens: [],
    accessTokens: [],
    refreshTokens: [],
    outbox: [],
    feeConfigs: [{ ...DEFAULT_FEES }],
    orders: [],
    orderEvents: [],
    ledgerEntries: [],
  };
}

/* ---------- Store ---------- */

const STORAGE_KEY = 'cm.mock.db';

function load(): Db | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Db;
    return parsed.schemaVersion === SCHEMA_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

let db: Db = load() ?? seed(new Date());

export const getDb = () => db;

export function saveDb() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* storage can be unavailable in private modes; memory still works */
  }
}

/** Restores the seed. Used by "Reset demo data" and by tests. */
export function resetDb() {
  db = seed(new Date());
  saveDb();
}

/** Mock clock: real time plus the simulated offset. */
export const now = () => new Date(Date.now() + db.clockOffsetMs);
