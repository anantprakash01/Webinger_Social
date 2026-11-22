/**
 * In-memory tables for the Phase 0 mock, seeded with invented data (no real people or brands).
 * Persists to sessionStorage so a page refresh keeps demo state; `resetDb()` restores the seed.
 *
 * Shapes follow the MySQL data model in CLAUDE.md section 7, trimmed to what the mock needs.
 * Week 1: demo accounts. Week 2: ~60 invented creators with socials, packages, portfolio, reviews
 * (src/api/mock/seed/creators.ts). Orders and campaigns arrive with their weeks.
 */
import { seedAddons, seedMetrics } from './seed/collab';
import type { DisputeEvidence, DisputeReasonCode, MessageAttachment, NotificationCategory, PackageAddon, PostMetrics, ResolutionReason } from '@/types';
import type { BrandIndustry, Gender, Niche, PayoutStatus, Platform, Role, UserStatus, VettingStatus } from '@/types';
import { DEFAULT_FEES, type FeeConfig } from './fees';
import { PLANS, type BrandPlan } from '@/lib/plans';
import type { LedgerEntry } from './ledger';
import type { MockOrder, OrderEvent, PaymentMethod } from './orderMachine';
import { DEMO_PASSWORD } from './demo';
import { seedCreators } from './seed/creators';
import { seedOrders } from './seed/orders';
import { seedEngagement } from './seed/engagement';
import { seedAdmin } from './seed/admin';
import { seedPayments } from './seed/payments';
import { seedGrowth } from './seed/growth';

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
  /** Phase E: typical hours to accept from before the mock (seed only); used until 3 real orders exist. */
  historicAcceptHours?: number | null;
  /** Phase D vacation mode. */
  availability?: { away: boolean; until: string | null; message: string | null };
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
  /** Phase C: optional extras (usage rights, rush, extra revision). */
  addons?: PackageAddon[];
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
  /** Phase C: add-ons bought with the package, and the paid-ads usage they grant. */
  addons?: PackageAddon[];
  usageRights?: string | null;
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
  items: Array<{ type: 'FILE' | 'POST_URL'; url: string; name?: string | null; metrics?: PostMetrics | null }>;
  note: string | null;
  submittedAt: string;
}

/** Phase C: a draft shared for approval before posting. */
export interface DraftRow {
  id: string;
  orderId: string;
  items: Array<{ type: 'FILE' | 'POST_URL'; url: string; name?: string | null }>;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';
  feedback: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

/** Phase C: product sent to the creator. */
export interface ShipmentRow {
  orderId: string;
  courier: string;
  trackingNumber: string;
  shippedAt: string;
  receivedAt: string | null;
}

/** Phase C: the creator asks for more time. */
export interface ExtensionRow {
  id: string;
  orderId: string;
  extraDays: number;
  reason: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  requestedAt: string;
  decidedAt: string | null;
  newDueAt: string;
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
  /** v3.1: the brand's reason, the creator's 48-hour response, evidence from both sides, the admin's reason. */
  reasonCode?: DisputeReasonCode;
  respondBy?: string;
  creatorResponse?: string | null;
  respondedAt?: string | null;
  evidence?: DisputeEvidence[];
  resolutionReason?: ResolutionReason | null;
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

/** One per order (FR-50), or a pre-booking inquiry (v3.0: orderId null, brand and creator set). */
export interface ConversationRow {
  id: string;
  orderId: string | null;
  /** Inquiries only. */
  brandUserId?: string;
  creatorUserId?: string;
  createdAt: string;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  /** Contact details were hidden before storing (FR-51). */
  masked: boolean;
  /** Phase D: one image or PDF. */
  attachment?: MessageAttachment | null;
  createdAt: string;
  /** Read by the other participant. */
  readAt: string | null;
}

export interface NotificationRow {
  id: string;
  userId: string;
  type: 'ORDER_EVENT' | 'NEW_APPLICATION' | 'APPLICATION_ACCEPTED' | 'APPLICATION_REJECTED' | 'PROFILE_APPROVED' | 'PROFILE_REJECTED' | 'PAYOUT_SENT' | 'CAMPAIGN_INVITE' | 'NEW_INQUIRY' | 'DISPUTE_UPDATE' | 'PLAN_CHANGED' | 'REFERRAL_REWARD';
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** fee_configs: per plan, the newest row applies to new orders (FR-83, FR-66). */
export interface FeeConfigRow extends FeeConfig {
  effectiveFrom: string;
  changedBy: string | null;
}

/** v3.2 brand plan subscription (Razorpay Subscriptions). Absent = Free. */
export interface SubscriptionRow {
  brandUserId: string;
  plan: BrandPlan;
  cycle: 'MONTHLY' | 'YEARLY';
  periodStart: string;
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  /** A downgrade (or monthly instead of yearly) scheduled for the end of the period. */
  nextPlan: BrandPlan | null;
  nextCycle: 'MONTHLY' | 'YEARLY' | null;
  methodLabel: string;
}

/** One charge for a plan period (tax invoice). Ledger reference `sub_<id>`. */
export interface SubscriptionInvoiceRow {
  id: string;
  number: string;
  brandUserId: string;
  plan: BrandPlan;
  cycle: 'MONTHLY' | 'YEARLY';
  periodStart: string;
  periodEnd: string;
  priceCents: number;
  gstCents: number;
  intraState: boolean;
  methodLabel: string;
  kind: 'NEW' | 'UPGRADE' | 'RENEWAL';
  createdAt: string;
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
  purpose: 'ORDER' | 'SUBSCRIPTION';
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
  /** Optional GSTIN (v2.3): registered creators charge GST and have TCS withheld. */
  gstin?: string | null;
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
  plan: BrandPlan;
  stripeCustomerId: string | null;
  /** Indian state code (GST place of supply) and optional GSTIN (v2.3). */
  state?: string | null;
  gstin?: string | null;
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
  /** Phase D: SMS and WhatsApp are mocked into the same outbox (to = phone number). Default EMAIL. */
  channel?: 'EMAIL' | 'SMS' | 'WHATSAPP';
}

/** Phase D: saved lists of creators (FR-25). */
export interface SavedListRow {
  id: string;
  brandUserId: string;
  name: string;
  /** Newest first. */
  creatorUserIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Phase D: campaign invitations (FR-43). */
export interface InviteRow {
  id: string;
  campaignId: string;
  creatorUserId: string;
  message: string | null;
  status: 'INVITED' | 'DECLINED';
  createdAt: string;
}

/** Phase D: a creator's rating of a brand, one per completed order. */
export interface BrandReviewRow {
  id: string;
  orderId: string;
  brandUserId: string;
  creatorUserId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

/** Phase D: notification channels per category (FR-53). */
export interface NotificationPrefsRow {
  userId: string;
  phone: string | null;
  categories: Record<NotificationCategory, { email: boolean; sms: boolean; whatsapp: boolean }>;
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
  drafts: DraftRow[];
  shipments: ShipmentRow[];
  extensions: ExtensionRow[];
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
  savedLists: SavedListRow[];
  invites: InviteRow[];
  brandReviews: BrandReviewRow[];
  notificationPrefs: NotificationPrefsRow[];
  subscriptions: SubscriptionRow[];
  subscriptionInvoices: SubscriptionInvoiceRow[];
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
export const SCHEMA_VERSION = 14;

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
  seedAddons(creators.packages, SEED_IDS.creator);
  seedMetrics(orders.orders, orders.deliveries, now.toISOString());
  const admin = seedAdmin(now, { brandId: SEED_IDS.brand, leoId: SEED_IDS.creator, adminId: SEED_IDS.admin }, creators, orders, engagement);
  const out: Db = {
    schemaVersion: SCHEMA_VERSION,
    clockOffsetMs: 0,
    users: [
      user(SEED_IDS.brand, 'brand@demo.test', 'Maya Iyer', 'BRAND'),
      user(SEED_IDS.creator, 'creator@demo.test', 'Leo Fernandes', 'CREATOR'),
      user(SEED_IDS.newCreator, 'newcreator@demo.test', 'Ivy Mathew', 'CREATOR'),
      user(SEED_IDS.admin, 'admin@demo.test', 'Sam Mehta', 'ADMIN'),
      user(SEED_IDS.unverifiedBrand, 'unverified@demo.test', 'Theo Pinto', 'BRAND', false),
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
      { userId: SEED_IDS.brand, companyName: 'Saltbay Supply Co.', website: 'https://saltbay.example.com', logoUrl: null, industry: 'HOME', country: 'IN', plan: 'FREE', stripeCustomerId: 'cus_demosaltbay', state: 'KA', gstin: '29AAACS1234B1Z9' },
      { userId: SEED_IDS.unverifiedBrand, companyName: 'Fernhill Tea House', website: null, logoUrl: null, industry: 'FOOD', country: 'IN', state: 'WB', plan: 'FREE', stripeCustomerId: null },
      ...engagement.brandProfiles,
    ],
    oneTimeTokens: [],
    accessTokens: [],
    refreshTokens: [],
    outbox: [],
    feeConfigs: (['FREE', 'PRO', 'PREMIUM'] as const).map((plan) => ({ ...DEFAULT_FEES, plan, brandFeeBps: PLANS[plan].defaultBrandFeeBps, effectiveFrom: new Date(now.getTime() - 120 * 86_400_000).toISOString(), changedBy: null })),
    orders: orders.orders,
    orderEvents: orders.orderEvents,
    ledgerEntries: orders.ledgerEntries,
    orderInfo: orders.orderInfo,
    orderBriefs: orders.orderBriefs,
    deliveries: orders.deliveries,
    drafts: [],
    shipments: [],
    extensions: [],
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
    savedLists: [],
    invites: [],
    brandReviews: [],
    notificationPrefs: [],
    subscriptions: [],
    subscriptionInvoices: [],
    lastPayoutRunAt: now.toISOString(),
  };
  seedGrowth(out, now, { brandId: SEED_IDS.brand, leoId: SEED_IDS.creator });
  return out;
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
