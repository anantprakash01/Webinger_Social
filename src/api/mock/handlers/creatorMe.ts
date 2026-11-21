/**
 * Mock for the creator workspace (FR-10 – FR-16, FR-70): the signed-in creator's own profile,
 * socials, packages, portfolio, submit-for-review and dashboard stats. Creator role only.
 */
import {
  creatorProfileInputSchema,
  MAX_ACTIVE_PACKAGES,
  MAX_PORTFOLIO_ITEMS,
  packageInputSchema,
  packagePatchSchema,
  portfolioItemInputSchema,
  socialAccountInputSchema,
} from '@/features/creators/schemas';
import type { CreatorChecklist, CreatorMe, CreatorStats, OwnPackage, SocialAccount } from '@/types';
import { getDb, now, ulid, type CreatorProfileRow, type PackageRow, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';
import type { OrderStatus } from '../orderMachine';
import { creatorMoney } from '../payoutsCore';

const CURRENCY = 'INR';

/** The creator profile of the signed-in user, or 403 for other roles. */
export function myProfile(user: UserRow): CreatorProfileRow {
  if (user.role !== 'CREATOR') fail(403, 'Only creator accounts have a creator profile.', 'ROLE_NOT_ALLOWED');
  const p = getDb().creatorProfiles.find((c) => c.userId === user.id);
  if (!p) fail(404, 'Creator profile not found.', 'CREATOR_NOT_FOUND');
  return p;
}

const toOwnPackage = (k: PackageRow): OwnPackage => ({
  id: k.id,
  platform: k.platform,
  title: k.title,
  description: k.description,
  deliverables: k.deliverables,
  priceCents: k.priceCents,
  currency: CURRENCY,
  deliveryDays: k.deliveryDays,
  active: k.active,
});

const activeCount = (creatorId: string) => getDb().packages.filter((k) => k.creatorId === creatorId && k.active).length;

export function checklistOf(p: CreatorProfileRow): CreatorChecklist {
  const db = getDb();
  return {
    profile: !!(p.username && p.displayName && p.bio && p.city && p.country && p.niches.length && p.languages.length),
    photo: !!p.photoUrl,
    socials: db.socialAccounts.some((s) => s.creatorId === p.userId),
    packages: activeCount(p.userId) > 0,
    portfolio: db.portfolioItems.some((i) => i.creatorId === p.userId),
    payouts: p.payoutStatus !== 'NOT_STARTED',
  };
}

export function toCreatorMe(p: CreatorProfileRow): CreatorMe {
  const db = getDb();
  return {
    username: p.username,
    displayName: p.displayName,
    bio: p.bio,
    city: p.city,
    country: p.country,
    gender: p.gender,
    birthYear: p.birthYear,
    languages: p.languages,
    niches: p.niches,
    photoUrl: p.photoUrl,
    coverUrls: p.coverUrls,
    vettingStatus: p.vettingStatus,
    rejectionReason: p.rejectionReason,
    submittedAt: p.submittedAt,
    socials: db.socialAccounts
      .filter((s) => s.creatorId === p.userId)
      .sort((a, b) => b.followers - a.followers)
      .map((s): SocialAccount => ({ id: s.id, platform: s.platform, handle: s.handle, url: s.url, followers: s.followers, engagementRateBps: s.engagementRateBps, verified: !!s.verifiedAt })),
    packages: db.packages
      .filter((k) => k.creatorId === p.userId)
      .sort((a, b) => Number(b.active) - Number(a.active) || a.priceCents - b.priceCents)
      .map(toOwnPackage),
    portfolio: db.portfolioItems
      .filter((i) => i.creatorId === p.userId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({ id: i.id, type: i.type, url: i.url, caption: i.caption })),
    payoutStatus: p.payoutStatus,
    checklist: checklistOf(p),
    usernameLocked: !!p.approvedAt,
  };
}

/* ---------- Profile ---------- */

export const getMyCreatorProfile: Handler = ({ user }) => ok(toCreatorMe(myProfile(user)));

export const updateMyCreatorProfile: Handler = ({ req, user }) => {
  const p = myProfile(user);
  const body = parseBody(creatorProfileInputSchema, req.body);
  if (body.username !== p.username) {
    if (p.approvedAt) {
      fail(409, 'Your username cannot change after approval, because brands already link to it.', 'USERNAME_LOCKED', [
        { field: 'username', message: 'Locked after approval.' },
      ]);
    }
    const taken = getDb().creatorProfiles.some((c) => c.userId !== p.userId && c.username?.toLowerCase() === body.username);
    if (taken) fail(409, 'That username is taken.', 'USERNAME_TAKEN', [{ field: 'username', message: 'That username is taken. Try another.' }]);
  }
  Object.assign(p, {
    username: body.username,
    displayName: body.displayName,
    bio: body.bio,
    city: body.city,
    country: body.country,
    gender: body.gender ?? null,
    birthYear: body.birthYear ?? null,
    languages: [...new Set(body.languages)],
    niches: body.niches,
    photoUrl: body.photoUrl ?? null,
    coverUrls: body.coverUrls ?? [],
  });
  user.name = body.displayName;
  user.updatedAt = now().toISOString();
  return ok(toCreatorMe(p));
};

/* ---------- Social accounts (FR-11) ---------- */

export const addMySocialAccount: Handler = ({ req, user }) => {
  const p = myProfile(user);
  const body = parseBody(socialAccountInputSchema, req.body);
  const db = getDb();
  if (db.socialAccounts.some((s) => s.creatorId === p.userId && s.platform === body.platform)) {
    fail(409, 'You already linked an account on that platform. Remove it first to change it.', 'PLATFORM_EXISTS', [
      { field: 'platform', message: 'Already linked.' },
    ]);
  }
  const row = { id: ulid(now().getTime()), creatorId: p.userId, platform: body.platform, handle: body.handle, url: null, followers: body.followers, engagementRateBps: null, verifiedAt: null };
  db.socialAccounts.push(row);
  return ok({ id: row.id, platform: row.platform, handle: row.handle, url: null, followers: row.followers, engagementRateBps: null, verified: false } satisfies SocialAccount, 201);
};

export const removeMySocialAccount: Handler = ({ params, user }) => {
  const p = myProfile(user);
  const db = getDb();
  const i = db.socialAccounts.findIndex((s) => s.id === params.id && s.creatorId === p.userId);
  if (i < 0) fail(404, 'No such social account.', 'NOT_FOUND');
  db.socialAccounts.splice(i, 1);
  return { status: 204 };
};

/* ---------- Packages (FR-12, FR-13) ---------- */

function ownPackage(user: UserRow, id: string): PackageRow {
  const p = myProfile(user);
  const k = getDb().packages.find((x) => x.id === id && x.creatorId === p.userId);
  if (!k) fail(404, 'No such package.', 'NOT_FOUND');
  return k;
}

const limitError = () =>
  fail(409, `You can have at most ${MAX_ACTIVE_PACKAGES} active packages. Switch one off first.`, 'PACKAGE_LIMIT', [
    { field: 'active', message: `At most ${MAX_ACTIVE_PACKAGES} active packages.` },
  ]);

export const createMyPackage: Handler = ({ req, user }) => {
  const p = myProfile(user);
  const body = parseBody(packageInputSchema, req.body);
  if (body.active && activeCount(p.userId) >= MAX_ACTIVE_PACKAGES) limitError();
  const row: PackageRow = { id: ulid(now().getTime()), creatorId: p.userId, ...body, createdAt: now().toISOString() };
  getDb().packages.push(row);
  return ok(toOwnPackage(row), 201);
};

export const updateMyPackage: Handler = ({ req, params, user }) => {
  const k = ownPackage(user, params.id);
  const patch = parseBody(packagePatchSchema, req.body);
  if (patch.active === true && !k.active && activeCount(k.creatorId) >= MAX_ACTIVE_PACKAGES) limitError();
  Object.assign(k, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
  return ok(toOwnPackage(k));
};

export const deleteMyPackage: Handler = ({ params, user }) => {
  const k = ownPackage(user, params.id);
  const db = getDb();
  // Orders keep a snapshot of what was bought, but the package stays for reference once it has orders.
  if (db.orders.some((o) => o.packageId === k.id)) {
    fail(409, 'This package has orders, so it can only be switched off, not deleted.', 'PACKAGE_HAS_ORDERS');
  }
  db.packages.splice(db.packages.indexOf(k), 1);
  return { status: 204 };
};

/* ---------- Portfolio (FR-14) ---------- */

export const addMyPortfolioItem: Handler = ({ req, user }) => {
  const p = myProfile(user);
  const body = parseBody(portfolioItemInputSchema, req.body);
  const db = getDb();
  const mine = db.portfolioItems.filter((i) => i.creatorId === p.userId);
  if (mine.length >= MAX_PORTFOLIO_ITEMS) {
    fail(409, `Your portfolio can hold ${MAX_PORTFOLIO_ITEMS} items. Remove one first.`, 'PORTFOLIO_LIMIT');
  }
  const row = { id: ulid(now().getTime()), creatorId: p.userId, type: body.type, url: body.url, caption: body.caption || null, sortOrder: Math.max(-1, ...mine.map((i) => i.sortOrder)) + 1 };
  db.portfolioItems.push(row);
  return ok({ id: row.id, type: row.type, url: row.url, caption: row.caption }, 201);
};

export const removeMyPortfolioItem: Handler = ({ params, user }) => {
  const p = myProfile(user);
  const db = getDb();
  const i = db.portfolioItems.findIndex((x) => x.id === params.id && x.creatorId === p.userId);
  if (i < 0) fail(404, 'No such portfolio item.', 'NOT_FOUND');
  db.portfolioItems.splice(i, 1);
  return { status: 204 };
};

/* ---------- Vetting (FR-16) ---------- */

const MISSING: Record<Exclude<keyof CreatorChecklist, 'portfolio'>, string> = {
  profile: 'Complete your profile: username, bio, location, niches and languages.',
  photo: 'Add a profile photo.',
  socials: 'Link at least one social account.',
  packages: 'Create at least one active package.',
  payouts: 'Set up payouts so you can be paid.',
};

export const submitMyProfileForReview: Handler = ({ user }) => {
  const p = myProfile(user);
  if (p.vettingStatus !== 'DRAFT' && p.vettingStatus !== 'REJECTED') {
    fail(409, p.vettingStatus === 'PENDING_REVIEW' ? 'Your profile is already with our team.' : 'Your profile is already approved.', 'INVALID_VETTING_STATE');
  }
  const c = checklistOf(p);
  const missing = (Object.keys(MISSING) as Array<keyof typeof MISSING>).filter((k) => !c[k]);
  if (missing.length) {
    fail(422, 'A few things are missing before we can review your profile.', 'PROFILE_INCOMPLETE', missing.map((field) => ({ field, message: MISSING[field] })));
  }
  p.vettingStatus = 'PENDING_REVIEW';
  p.rejectionReason = null;
  p.submittedAt = now().toISOString();
  return ok(toCreatorMe(p));
};

/**
 * Approve or reject a profile in review. Used by the mock-only demo control now and by the
 * admin vetting queue in Week 6 (FR-80), so both follow the same rule.
 */
export function decideVetting(p: CreatorProfileRow, decision: 'APPROVE' | 'REJECT', reason?: string | null) {
  if (p.vettingStatus !== 'PENDING_REVIEW') fail(409, 'Only profiles waiting for review can be decided.', 'INVALID_VETTING_STATE');
  if (decision === 'REJECT' && !reason?.trim()) fail(422, 'Give the creator a reason.', 'REASON_REQUIRED', [{ field: 'reason', message: 'Required when rejecting.' }]);
  if (decision === 'APPROVE') {
    p.vettingStatus = 'APPROVED';
    p.approvedAt ??= now().toISOString();
    p.rejectionReason = null;
  } else {
    p.vettingStatus = 'REJECTED';
    p.rejectionReason = reason!.trim();
  }
}

/* ---------- Dashboard (FR-70) ---------- */

const ORDER_STATUSES: OrderStatus[] = ['PENDING_ACCEPTANCE', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED', 'DISPUTED', 'REFUNDED', 'CLOSED'];

export const getMyCreatorStats: Handler = ({ user }) => {
  const p = myProfile(user);
  const db = getDb();
  const orders = db.orders.filter((o) => o.creatorUserId === p.userId);
  const money = creatorMoney(p.userId);
  const ordersByStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, orders.filter((o) => o.status === s).length]));
  const body: CreatorStats = {
    currency: CURRENCY,
    availableCents: money.availableCents,
    inEscrowCents: money.inEscrowCents,
    lifetimeEarnedCents: money.lifetimeEarnedCents,
    ordersByStatus,
    profileViews: p.profileViews,
    activePackages: activeCount(p.userId),
  };
  return ok(body);
};
