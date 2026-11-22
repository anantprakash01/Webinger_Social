/**
 * Phase D — retention and trust: saved lists (FR-25), vacation mode, notification preferences (FR-53),
 * campaign invites (FR-43) and creators' reviews of brands.
 */
import { availabilitySchema, brandReviewSchema, inviteInputSchema, notificationPrefsSchema, savedListInputSchema } from '@/features/retention/schemas';
import type { BrandRating, BrandReview, CampaignInvite, CreatorAvailability, SavedList, SavedListDetail } from '@/types';
import { CATEGORIES, deliver, prefsOf, toPreferences } from '../deliver';
import { getDb, now, ulid, type CreatorProfileRow, type InviteRow, type SavedListRow, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';
import { isOpen } from './campaigns';
import { cardFor } from './creators';
import { visibleOrder } from './orders';

export const MAX_LISTS = 20;
export const MAX_LIST_SIZE = 200;

/* ---------- Vacation mode ---------- */

const today = () => now().toISOString().slice(0, 10);

/** Away now: switched on and `until` (inclusive) not yet passed. */
export const isAway = (p: Pick<CreatorProfileRow, 'availability'> | undefined) => !!p?.availability?.away && (!p.availability.until || p.availability.until >= today());

export const availabilityOf = (p: CreatorProfileRow): CreatorAvailability =>
  isAway(p) ? { away: true, until: p.availability!.until ?? null, message: p.availability!.message ?? null } : { away: false, until: null, message: null };

/** Refuses new work for a creator who is away (orders, custom offers, hiring from a campaign, invites). */
export function assertAvailable(p: CreatorProfileRow) {
  if (isAway(p)) {
    const until = p.availability?.until;
    fail(409, `${p.displayName} is away${until ? ` until ${until}` : ''} and not taking new orders.`, 'CREATOR_AWAY');
  }
}

export const saveAvailability: Handler = ({ req, user }) => {
  if (user.role !== 'CREATOR') fail(403, 'Only creators have availability.', 'ROLE_NOT_ALLOWED');
  const p = getDb().creatorProfiles.find((c) => c.userId === user.id);
  if (!p) fail(404, 'Creator profile not found.', 'CREATOR_NOT_FOUND');
  const body = parseBody(availabilitySchema(today()), req.body);
  p.availability = body.away ? { away: true, until: body.until ?? null, message: body.message ?? null } : { away: false, until: null, message: null };
  return ok(availabilityOf(p));
};

/* ---------- Saved lists (FR-25) ---------- */

function requireBrand(user: UserRow) {
  if (user.role !== 'BRAND') fail(403, 'Saved lists are for brand accounts.', 'ROLE_NOT_ALLOWED');
}

function ownList(user: UserRow, id: string): SavedListRow {
  requireBrand(user);
  const l = getDb().savedLists.find((x) => x.id === id && x.brandUserId === user.id);
  if (!l) fail(404, 'No such list.', 'NOT_FOUND');
  return l;
}

const usernameOf = (userId: string) => getDb().creatorProfiles.find((p) => p.userId === userId)?.username ?? null;

const toList = (l: SavedListRow): SavedList => ({
  id: l.id,
  name: l.name,
  usernames: l.creatorUserIds.map(usernameOf).filter((u): u is string => !!u),
  createdAt: l.createdAt,
  updatedAt: l.updatedAt,
});

function uniqueName(user: UserRow, name: string, except?: string) {
  if (getDb().savedLists.some((l) => l.brandUserId === user.id && l.id !== except && l.name.toLowerCase() === name.toLowerCase()))
    fail(409, 'You already have a list with that name.', 'LIST_NAME_TAKEN', [{ field: 'name', message: 'You already have a list with that name.' }]);
}

export const listSavedLists: Handler = ({ user }) => {
  requireBrand(user);
  return ok(getDb().savedLists.filter((l) => l.brandUserId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toList));
};

export const createSavedList: Handler = ({ req, user }) => {
  requireBrand(user);
  const { name } = parseBody(savedListInputSchema, req.body);
  const db = getDb();
  if (db.savedLists.filter((l) => l.brandUserId === user.id).length >= MAX_LISTS) fail(409, `You can have up to ${MAX_LISTS} lists.`, 'LIST_LIMIT');
  uniqueName(user, name);
  const at = now().toISOString();
  const row: SavedListRow = { id: ulid(now().getTime()), brandUserId: user.id, name, creatorUserIds: [], createdAt: at, updatedAt: at };
  db.savedLists.push(row);
  return ok(toList(row), 201);
};

export const getSavedList: Handler = ({ params, user }) => {
  const l = ownList(user, params.listId);
  const db = getDb();
  const creators = l.creatorUserIds
    .map((id) => db.creatorProfiles.find((p) => p.userId === id))
    .filter((p): p is CreatorProfileRow & { username: string } => !!p?.username && p.vettingStatus === 'APPROVED' && db.users.find((u) => u.id === p.userId)?.status === 'ACTIVE')
    .map((p) => cardFor(p)!.card);
  const body: SavedListDetail = { ...toList(l), creators };
  return ok(body);
};

export const renameSavedList: Handler = ({ req, params, user }) => {
  const l = ownList(user, params.listId);
  const { name } = parseBody(savedListInputSchema, req.body);
  uniqueName(user, name, l.id);
  l.name = name;
  l.updatedAt = now().toISOString();
  return ok(toList(l));
};

export const deleteSavedList: Handler = ({ params, user }) => {
  const l = ownList(user, params.listId);
  const db = getDb();
  db.savedLists.splice(db.savedLists.indexOf(l), 1);
  return { status: 204 };
};

function listedCreator(username: string): CreatorProfileRow {
  const p = getDb().creatorProfiles.find((c) => c.username?.toLowerCase() === username.toLowerCase() && c.vettingStatus === 'APPROVED');
  if (!p) fail(404, 'No creator with that username.', 'CREATOR_NOT_FOUND');
  return p;
}

export const addToSavedList: Handler = ({ params, user }) => {
  const l = ownList(user, params.listId);
  const p = listedCreator(params.username);
  if (!l.creatorUserIds.includes(p.userId)) {
    if (l.creatorUserIds.length >= MAX_LIST_SIZE) fail(409, `A list holds up to ${MAX_LIST_SIZE} creators.`, 'LIST_FULL');
    l.creatorUserIds.unshift(p.userId);
    l.updatedAt = now().toISOString();
  }
  return ok(toList(l));
};

export const removeFromSavedList: Handler = ({ params, user }) => {
  const l = ownList(user, params.listId);
  const p = listedCreator(params.username);
  l.creatorUserIds = l.creatorUserIds.filter((id) => id !== p.userId);
  l.updatedAt = now().toISOString();
  return ok(toList(l));
};

/* ---------- Notification preferences (FR-53) ---------- */

export const getNotificationPreferences: Handler = ({ user }) => ok(toPreferences(prefsOf(user.id)));

export const saveNotificationPreferences: Handler = ({ req, user }) => {
  const body = parseBody(notificationPrefsSchema, req.body);
  const db = getDb();
  const row = { userId: user.id, phone: body.phone ?? null, categories: Object.fromEntries(CATEGORIES.map((c) => [c, { email: false, sms: false, whatsapp: false }])) as ReturnType<typeof prefsOf>['categories'] };
  for (const c of body.categories) row.categories[c.category] = { email: c.email, sms: c.sms, whatsapp: c.whatsapp };
  const i = db.notificationPrefs.findIndex((p) => p.userId === user.id);
  if (i >= 0) db.notificationPrefs[i] = row;
  else db.notificationPrefs.push(row);
  return ok(toPreferences(row));
};

/* ---------- Campaign invites (FR-43) ---------- */

export function toInvite(i: InviteRow): CampaignInvite {
  const db = getDb();
  const p = db.creatorProfiles.find((x) => x.userId === i.creatorUserId);
  const app = db.applications.find((a) => a.campaignId === i.campaignId && a.creatorUserId === i.creatorUserId && a.status !== 'WITHDRAWN');
  return {
    id: i.id,
    campaignId: i.campaignId,
    campaignTitle: db.campaigns.find((c) => c.id === i.campaignId)?.title ?? 'Campaign',
    creator: { name: p?.displayName ?? 'Creator', photoUrl: p?.photoUrl ?? null, username: p?.username ?? null },
    message: i.message,
    status: app ? 'APPLIED' : i.status,
    createdAt: i.createdAt,
  };
}

export const inviteToCampaign: Handler = ({ req, params, user }) => {
  if (user.role !== 'BRAND') fail(403, 'Only brands can invite creators.', 'ROLE_NOT_ALLOWED');
  const db = getDb();
  const c = db.campaigns.find((x) => x.id === params.id && x.brandUserId === user.id);
  if (!c) fail(404, 'No such campaign.', 'CAMPAIGN_NOT_FOUND');
  if (!isOpen(c)) fail(409, 'This campaign is closed.', 'CAMPAIGN_CLOSED');
  const body = parseBody(inviteInputSchema, req.body);
  const p = listedCreator(body.username);
  if (db.users.find((u) => u.id === p.userId)?.status !== 'ACTIVE') fail(404, 'No creator with that username.', 'CREATOR_NOT_FOUND');
  assertAvailable(p);
  if (db.invites.some((i) => i.campaignId === c.id && i.creatorUserId === p.userId)) fail(409, `${p.displayName} is already invited.`, 'ALREADY_INVITED');
  if (db.applications.some((a) => a.campaignId === c.id && a.creatorUserId === p.userId && a.status !== 'WITHDRAWN')) fail(409, `${p.displayName} already applied.`, 'ALREADY_APPLIED');
  const row: InviteRow = { id: ulid(now().getTime()), campaignId: c.id, creatorUserId: p.userId, message: body.message || null, status: 'INVITED', createdAt: now().toISOString() };
  db.invites.push(row);
  const brand = db.brandProfiles.find((b) => b.userId === user.id)?.companyName ?? 'A brand';
  deliver(p.userId, { type: 'CAMPAIGN_INVITE', title: `${brand} invited you to a campaign`, body: `“${c.title}”${row.message ? ` — “${row.message}”` : ''}. Apply with your pitch and price.`, link: `/creator/campaigns/${c.id}` }, 'CAMPAIGNS');
  return ok(toInvite(row), 201);
};

export const declineInvite: Handler = ({ params, user }) => {
  const i = getDb().invites.find((x) => x.id === params.id && x.creatorUserId === user.id);
  if (!i) fail(404, 'No such invitation.', 'NOT_FOUND');
  if (toInvite(i).status === 'APPLIED') fail(409, 'You already applied.', 'ALREADY_APPLIED');
  i.status = 'DECLINED';
  return ok(toInvite(i));
};

/* ---------- Creators review brands ---------- */

export function brandRatingOf(brandUserId: string): BrandRating {
  const rs = getDb().brandReviews.filter((r) => r.brandUserId === brandUserId);
  if (rs.length === 0) return { ratingAvg: null, ratingCount: 0 };
  return { ratingAvg: Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10, ratingCount: rs.length };
}

export const brandReviewOf = (orderId: string): BrandReview | null => {
  const r = getDb().brandReviews.find((x) => x.orderId === orderId);
  return r ? { id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt } : null;
};

export const reviewBrand: Handler = ({ req, params, user }) => {
  const o = visibleOrder(user, params.id);
  if (user.role !== 'CREATOR') fail(403, 'Only the creator can rate the brand.', 'ROLE_NOT_ALLOWED');
  if (o.status !== 'COMPLETED') fail(409, 'You can rate the brand once the order is completed.', 'INVALID_TRANSITION');
  const db = getDb();
  if (db.brandReviews.some((r) => r.orderId === o.id)) fail(409, 'You already rated this brand for this order.', 'ALREADY_REVIEWED');
  const body = parseBody(brandReviewSchema, req.body);
  const row = { id: ulid(now().getTime()), orderId: o.id, brandUserId: o.brandUserId, creatorUserId: user.id, rating: body.rating, comment: body.comment || null, createdAt: now().toISOString() };
  db.brandReviews.push(row);
  const name = db.creatorProfiles.find((p) => p.userId === user.id)?.displayName ?? 'The creator';
  deliver(o.brandUserId, { type: 'ORDER_EVENT', title: `${name} rated working with you`, body: `${row.rating} star${row.rating === 1 ? '' : 's'}${row.comment ? `: “${row.comment}”` : '.'}`, link: `/brand/orders/${o.id}` }, 'ORDERS');
  return ok(brandReviewOf(o.id), 201);
};
