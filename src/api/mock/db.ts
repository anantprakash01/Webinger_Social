/**
 * In-memory tables for the Phase 0 mock, seeded with invented data (no real people or brands).
 * Persists to sessionStorage so a page refresh keeps demo state; `resetDb()` restores the seed.
 *
 * Shapes follow the MySQL data model in CLAUDE.md section 7, trimmed to what the mock needs.
 * Week 1: demo accounts. Week 2: ~60 invented creators with socials, packages, portfolio, reviews
 * (src/api/mock/seed/creators.ts). Orders and campaigns arrive with their weeks.
 */
import type { BrandIndustry, Gender, Niche, PayoutStatus, Platform, Role, UserStatus, VettingStatus } from '@/types';
import { DEFAULT_FEES, type FeeConfig } from './fees';
import type { LedgerEntry } from './ledger';
import type { MockOrder, OrderEvent, PaymentMethod } from './orderMachine';
import { DEMO_PASSWORD } from './demo';
import { seedCreators } from './seed/creators';
import { seedOrders } from './seed/orders';
import { seedEngagement } from './seed/engagement';
import { seedAdmin } from './seed/admin';
import { seedPayments } from './seed/payments';

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
  /** Last sign-in or token refresh (v1.1). */
  lastActiveAt?: string | null;
  /** Admin avatar (v2.1); creators and brands use their photo / logo. */
  avatarUrl?: string | null;
  /** Account deletion requested (v2.2): erased after this date unless cancelled. */
  deletionScheduledFor?: string | null;
  deletedAt?: string | null;
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
  /** When the creator last sent the profile for review. */
  submittedAt: string | null;
  profileViews: number;
  /** Razorpay Route linked account id (the field name predates the switch from Stripe). */
  stripeAccountId: string | null;
  /** NOT_STARTED → PENDING (account being verified) → ENABLED (FR-62). */
  payoutStatus: PayoutStatus;
  /** Pay the whole balance every Monday (default on). */
  autoWeekly?: boolean;
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
  /** Set for reviews written in the app; seeded historic reviews have none. */
  brandUserId?: string | null;
  /** Denormalised for the mock; the backend joins order → brand profile. */
  brandName: string;
  rating: number;
  comment: string | null;
  creatorReply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

/** What was bought, copied at checkout like the fees (the package may change later). */
export interface OrderInfoRow {
  orderId: string;
  kind: 'PACKAGE' | 'CUSTOM_OFFER' | 'CAMPAIGN';
  title: string;
  platform: Platform;
  deliverables: string[];
  /** Razorpay payment id for the order (authorised at checkout, captured on accept). */
  paymentIntentId: string;
}

export interface ShippingAddressRow {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  postalCode: string;
  country: string;
}

/** FR-33 brief (order_briefs). */
export interface OrderBriefRow {
  orderId: string;
  requirements: string;
  needsShipping: boolean;
  shippingAddress: ShippingAddressRow | null;
  links: string[];
  referenceFiles: string[];
  updatedAt: string;
}

/** One submission (the backend stores one deliverables row per item). */
export interface DeliveryRow {
  id: string;
  orderId: string;
  revisionNo: number;
  items: Array<{ type: 'FILE' | 'POST_URL'; url: string; name?: string | null }>;
  note: string | null;
  submittedAt: string;
}

export interface DisputeRow {
  id: string;
  orderId: string;
  openedBy: string;
  reason: string;
  status: 'OPEN' | 'RESOLVED';
  resolution: 'RELEASE' | 'FULL_REFUND' | 'PARTIAL_REFUND' | null;
  refundCents: number | null;
  resolvedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote?: string | null;
}

export interface CampaignRow {
  id: string;
  brandUserId: string;
  title: string;
  brief: string;
  platforms: Platform[];
  niches: Niche[];
  deliverables: string[];
  budgetPerCreatorCents: number;
  /** YYYY-MM-DD, last day to apply. */
  deadline: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  closedAt: string | null;
}

export interface ApplicationRow {
  id: string;
  campaignId: string;
  creatorUserId: string;
  pitch: string;
  priceCents: number;
  deliveryDays: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  orderId: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** One per order (FR-50). */
export interface ConversationRow {
  id: string;
  orderId: string;
  createdAt: string;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  /** Contact details were hidden before storing (FR-51). */
  masked: boolean;
  createdAt: string;
  /** Read by the other participant. */
  readAt: string | null;
}

export interface NotificationRow {
  id: string;
  userId: string;
  type: 'ORDER_EVENT' | 'NEW_APPLICATION' | 'APPLICATION_ACCEPTED' | 'APPLICATION_REJECTED' | 'PROFILE_APPROVED' | 'PROFILE_REJECTED' | 'PAYOUT_SENT';
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** fee_configs: the newest row applies to new orders (FR-83). */
export interface FeeConfigRow extends FeeConfig {
  effectiveFrom: string;
  changedBy: string | null;
}

/** audit_logs: append-only (FR-84). */
export interface AuditRow {
  id: string;
  actorId: string | null;
  actorName: string;
  action: 'CREATOR_APPROVED' | 'CREATOR_REJECTED' | 'DISPUTE_RESOLVED' | 'USER_STATUS_CHANGED' | 'IMPERSONATION_STARTED' | 'FEES_CHANGED' | 'REPORT_RESOLVED' | 'MONEY_MOVEMENT' | 'PAYOUT_SENT' | 'ORDER_CANCELLED' | 'ACCOUNT_DELETION_REQUESTED';
  entityType: string;
  entityId: string;
  summary: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  at: string;
}

export interface ReportRow {
  id: string;
  reporterId: string;
  targetType: 'CREATOR' | 'BRAND' | 'MESSAGE' | 'REVIEW';
  targetId: string;
  reason: 'SPAM' | 'FAKE_ACCOUNT' | 'INAPPROPRIATE' | 'SCAM' | 'OFF_PLATFORM_PAYMENT' | 'OTHER';
  details: string | null;
  status: 'OPEN' | 'DISMISSED' | 'ACTION_TAKEN';
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

/** Bank payouts (FR-63). Ledger: CREATOR_BALANCE → PAYOUT, referenced as `payout_<id>`. */
export interface PayoutRow {
  id: string;
  creatorId: string;
  /** Taken from the balance; the creator receives amount − fee. */
  amountCents: number;
  feeCents?: number;
  speed?: 'SCHEDULED' | 'STANDARD' | 'INSTANT';
  destinationLabel?: string;
  status: 'IN_TRANSIT' | 'PAID';
  createdAt: string;
  arrivalDate: string;
}

/* ---------- Payments (v2.0, Razorpay) ---------- */

/** A Razorpay order opened for an exact amount; `payment` is filled in when the brand pays in Checkout. */
export interface PaymentSessionRow {
  id: string;
  userId: string;
  purpose: 'ORDER';
  amountCents: number;
  razorpayOrderId: string;
  createdAt: string;
  expiresAt: string;
  payment: { id: string; signature: string; method: PaymentMethod; methodLabel: string; status: 'AUTHORIZED' } | null;
  /** Order that used it (a session pays for one order only). */
  usedBy: string | null;
}

/** Razorpay customer token (cards) or saved UPI ID. Never a card number. */
export interface SavedMethodRow {
  id: string;
  userId: string;
  type: 'CARD' | 'UPI';
  network: string | null;
  last4: string | null;
  expiry: string | null;
  vpa: string | null;
  createdAt: string;
}

/** Creator payout destination (Razorpay Route linked account + RazorpayX fund account). */
export interface PayoutAccountRow {
  creatorId: string;
  method: 'BANK_ACCOUNT' | 'UPI';
  holderName: string;
  pan: string;
  accountNumber: string | null;
  ifsc: string | null;
  vpa: string | null;
  status: 'VERIFYING' | 'VERIFIED' | 'FAILED';
  failureReason: string | null;
  updatedAt: string;
}

/** Stored responses for Idempotency-Key retries. */
export interface IdempotencyRow {
  key: string;
  userId: string;
  method: string;
  path: string;
  status: number;
  body: unknown;
  createdAt: string;
}

export interface BrandProfileRow {
  userId: string;
  companyName: string | null;
  website: string | null;
  logoUrl: string | null;
  industry: BrandIndustry | null;
  country: string | null;
  plan: 'FREE';
  stripeCustomerId: string | null;
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
  /** Set on read-only admin impersonation sessions (FR-82): the admin's user id. */
  impersonatorId?: string | null;
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
  feeConfigs: FeeConfigRow[];
  orders: MockOrder[];
  orderEvents: OrderEvent[];
  ledgerEntries: LedgerEntry[];
  orderInfo: OrderInfoRow[];
  orderBriefs: OrderBriefRow[];
  deliveries: DeliveryRow[];
  disputes: DisputeRow[];
  idempotency: IdempotencyRow[];
  campaigns: CampaignRow[];
  applications: ApplicationRow[];
  conversations: ConversationRow[];
  messages: MessageRow[];
  notifications: NotificationRow[];
  auditLogs: AuditRow[];
  reports: ReportRow[];
  payouts: PayoutRow[];
  paymentSessions: PaymentSessionRow[];
  savedMethods: SavedMethodRow[];
  payoutAccounts: PayoutAccountRow[];
  /** Last weekly payout run (Mondays 00:00 UTC). */
  lastPayoutRunAt: string;
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
export const SCHEMA_VERSION = 8;

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
  const orders = seedOrders(now, { brandId: SEED_IDS.brand, brandName: 'Saltbay Supply Co.', leoId: SEED_IDS.creator, adminId: SEED_IDS.admin }, creators);
  const engagement = seedEngagement(now, { brandId: SEED_IDS.brand, leoId: SEED_IDS.creator, passwordHash: pw }, creators, orders);
  const payments = seedPayments(now, { brandId: SEED_IDS.brand, leoId: SEED_IDS.creator }, creators, creators.users);
  const admin = seedAdmin(now, { brandId: SEED_IDS.brand, leoId: SEED_IDS.creator, adminId: SEED_IDS.admin }, creators, orders, engagement);
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
      ...engagement.users,
    ],
    creatorProfiles: creators.creatorProfiles,
    socialAccounts: creators.socialAccounts,
    packages: creators.packages,
    portfolioItems: creators.portfolioItems,
    reviews: [...creators.reviews, ...orders.reviews],
    brandProfiles: [
      // Websites use example.com (reserved for documentation), so they never point at a real company.
      { userId: SEED_IDS.brand, companyName: 'Saltbay Supply Co.', website: 'https://saltbay.example.com', logoUrl: null, industry: 'HOME', country: 'IN', plan: 'FREE', stripeCustomerId: 'cus_demosaltbay' },
      { userId: SEED_IDS.unverifiedBrand, companyName: 'Fernhill Tea House', website: null, logoUrl: null, industry: 'FOOD', country: 'GB', plan: 'FREE', stripeCustomerId: null },
      ...engagement.brandProfiles,
    ],
    oneTimeTokens: [],
    accessTokens: [],
    refreshTokens: [],
    outbox: [],
    feeConfigs: [{ ...DEFAULT_FEES, effectiveFrom: new Date(now.getTime() - 120 * 86_400_000).toISOString(), changedBy: null }],
    orders: orders.orders,
    orderEvents: orders.orderEvents,
    ledgerEntries: orders.ledgerEntries,
    orderInfo: orders.orderInfo,
    orderBriefs: orders.orderBriefs,
    deliveries: orders.deliveries,
    disputes: orders.disputes,
    idempotency: [],
    campaigns: engagement.campaigns,
    applications: engagement.applications,
    conversations: engagement.conversations,
    messages: engagement.messages,
    notifications: engagement.notifications,
    auditLogs: admin.auditLogs,
    reports: admin.reports,
    payouts: [],
    paymentSessions: [],
    savedMethods: payments.savedMethods,
    payoutAccounts: payments.payoutAccounts,
    lastPayoutRunAt: now.toISOString(),
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
