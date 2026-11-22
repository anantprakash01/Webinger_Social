/**
 * Mock for Campaigns (FR-40 – FR-42). Brands post campaigns; approved creators apply with a pitch and a
 * price; accepting an application places an order through the same checkout core as packages (FR-42).
 */
import { deliver } from '../deliver';
import { brandRatingOf, toInvite } from './retention';
import { planOf } from './plans';
import { applicationAcceptSchema, applicationInputSchema, campaignInputSchema } from '@/features/campaigns/schemas';
import { reasonRequestSchema } from '@/features/orders/schemas';
import type { Application, CampaignDetail, CampaignPage, CampaignSummary } from '@/types';
import { getDb, now, ulid, type ApplicationRow, type CampaignRow, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';
import { placeOrder } from './orders';

const CURRENCY = 'INR';

/** Open = status OPEN and the deadline (last day to apply, inclusive) has not passed. */
export const isOpen = (c: CampaignRow) => c.status === 'OPEN' && c.deadline >= now().toISOString().slice(0, 10);

function brandParty(userId: string) {
  const db = getDb();
  const b = db.brandProfiles.find((x) => x.userId === userId);
  return { name: b?.companyName ?? db.users.find((u) => u.id === userId)?.name ?? 'Brand', photoUrl: b?.logoUrl ?? null, username: null };
}

function toApplication(a: ApplicationRow): Application {
  const db = getDb();
  const p = db.creatorProfiles.find((c) => c.userId === a.creatorUserId);
  const socials = db.socialAccounts.filter((s) => s.creatorId === a.creatorUserId).sort((x, y) => y.followers - x.followers);
  const reviews = db.reviews.filter((r) => r.creatorId === a.creatorUserId);
  return {
    id: a.id,
    campaignId: a.campaignId,
    creator: { name: p?.displayName ?? 'Creator', photoUrl: p?.photoUrl ?? null, username: p?.username ?? null },
    reach: socials[0] ? { platform: socials[0].platform, handle: socials[0].handle, followers: socials[0].followers } : null,
    ratingAvg: reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : null,
    ratingCount: reviews.length,
    pitch: a.pitch,
    priceCents: a.priceCents,
    currency: CURRENCY,
    deliveryDays: a.deliveryDays,
    status: a.status,
    orderId: a.orderId,
    createdAt: a.createdAt,
  };
}

function toSummary(c: CampaignRow, viewer: UserRow): CampaignSummary {
  const apps = getDb().applications.filter((a) => a.campaignId === c.id);
  const mine = viewer.role === 'CREATOR' ? apps.find((a) => a.creatorUserId === viewer.id) : undefined;
  const invite = viewer.role === 'CREATOR' ? getDb().invites.find((i) => i.campaignId === c.id && i.creatorUserId === viewer.id) : undefined;
  return {
    id: c.id,
    brand: brandParty(c.brandUserId),
    title: c.title,
    platforms: c.platforms,
    niches: c.niches,
    budgetPerCreatorCents: c.budgetPerCreatorCents,
    currency: CURRENCY,
    deadline: c.deadline,
    status: c.status,
    open: isOpen(c),
    applicationCount: viewer.id === c.brandUserId ? apps.filter((a) => a.status !== 'WITHDRAWN').length : 0,
    myApplication: mine ? toApplication(mine) : null,
    myInvite: invite ? toInvite(invite) : null,
    brandRating: brandRatingOf(c.brandUserId),
    brandPlan: planOf(c.brandUserId),
    createdAt: c.createdAt,
  };
}

function toDetail(c: CampaignRow, viewer: UserRow): CampaignDetail {
  const owner = viewer.id === c.brandUserId || viewer.role === 'ADMIN';
  return {
    ...toSummary(c, viewer),
    brief: c.brief,
    deliverables: c.deliverables,
    applications: owner
      ? getDb()
          .applications.filter((a) => a.campaignId === c.id && a.status !== 'WITHDRAWN')
          .sort((a, b) => Number(a.status !== 'PENDING') - Number(b.status !== 'PENDING') || b.createdAt.localeCompare(a.createdAt))
          .map(toApplication)
      : [],
    invites: owner
      ? getDb()
          .invites.filter((i) => i.campaignId === c.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(toInvite)
      : [],
  };
}

/** Brands see their own campaigns; creators see open ones and ones they applied to; others 404. */
function visibleCampaign(user: UserRow, id: string): CampaignRow {
  const db = getDb();
  const c = db.campaigns.find((x) => x.id === id);
  const visible =
    c &&
    (user.role === 'ADMIN' ||
      (user.role === 'BRAND' && c.brandUserId === user.id) ||
      (user.role === 'CREATOR' && (isOpen(c) || db.applications.some((a) => a.campaignId === c.id && a.creatorUserId === user.id))));
  if (!c || !visible) fail(404, 'No such campaign.', 'CAMPAIGN_NOT_FOUND');
  return c;
}

function notify(userId: string, type: 'NEW_APPLICATION' | 'APPLICATION_ACCEPTED' | 'APPLICATION_REJECTED', title: string, body: string, link: string) {
  deliver(userId, { type, title, body, link }, 'CAMPAIGNS');
}

/* ---------- Campaigns ---------- */

export const listCampaigns: Handler = ({ req, user }) => {
  const db = getDb();
  const platform = req.query.get('platform') ?? undefined;
  const niche = req.query.get('niche') ?? undefined;
  const page = Math.max(0, Number(req.query.get('page') ?? 0) || 0);
  const size = Math.min(50, Math.max(1, Number(req.query.get('size') ?? 20) || 20));
  let rows: CampaignRow[];
  if (user.role === 'BRAND') rows = db.campaigns.filter((c) => c.brandUserId === user.id);
  else if (user.role === 'CREATOR' && req.query.get('applied') === 'true') {
    const mine = new Set(db.applications.filter((a) => a.creatorUserId === user.id && a.status !== 'WITHDRAWN').map((a) => a.campaignId));
    rows = db.campaigns.filter((c) => mine.has(c.id));
  } else if (user.role === 'CREATOR' && req.query.get('invited') === 'true') {
    const invited = new Set(db.invites.filter((i) => i.creatorUserId === user.id && i.status === 'INVITED').map((i) => i.campaignId));
    rows = db.campaigns.filter((c) => invited.has(c.id) && isOpen(c));
  } else if (user.role === 'CREATOR') rows = db.campaigns.filter((c) => isOpen(c));
  else rows = [...db.campaigns];
  rows = rows
    .filter((c) => (!platform || c.platforms.includes(platform as CampaignRow['platforms'][number])) && (!niche || c.niches.includes(niche as CampaignRow['niches'][number])))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const body: CampaignPage = {
    content: rows.slice(page * size, (page + 1) * size).map((c) => toSummary(c, user)),
    page,
    size,
    totalElements: rows.length,
    totalPages: Math.ceil(rows.length / size),
  };
  return ok(body);
};

export const createCampaign: Handler = ({ req, user }) => {
  if (user.role !== 'BRAND') fail(403, 'Only brand accounts can post campaigns.', 'ROLE_NOT_ALLOWED');
  if (!user.emailVerifiedAt) fail(403, 'Verify your email before posting campaigns.', 'EMAIL_NOT_VERIFIED');
  const body = parseBody(campaignInputSchema(now()), req.body);
  const row: CampaignRow = { id: ulid(now().getTime()), brandUserId: user.id, ...body, status: 'OPEN', createdAt: now().toISOString(), closedAt: null };
  getDb().campaigns.push(row);
  return ok(toDetail(row, user), 201);
};

export const getCampaign: Handler = ({ params, user }) => ok(toDetail(visibleCampaign(user, params.id), user));

export const closeCampaign: Handler = ({ params, user }) => {
  const c = visibleCampaign(user, params.id);
  if (c.brandUserId !== user.id) fail(404, 'No such campaign.', 'CAMPAIGN_NOT_FOUND');
  if (c.status === 'CLOSED') fail(409, 'This campaign is already closed.', 'CAMPAIGN_CLOSED');
  c.status = 'CLOSED';
  c.closedAt = now().toISOString();
  for (const a of getDb().applications.filter((x) => x.campaignId === c.id && x.status === 'PENDING')) {
    a.status = 'REJECTED';
    a.decidedAt = now().toISOString();
    notify(a.creatorUserId, 'APPLICATION_REJECTED', `“${c.title}” has closed`, 'The brand closed the campaign before choosing your application.', `/creator/campaigns/${c.id}`);
  }
  return ok(toDetail(c, user));
};

/* ---------- Applications ---------- */

export const applyToCampaign: Handler = ({ req, params, user }) => {
  if (user.role !== 'CREATOR') fail(403, 'Only creators can apply to campaigns.', 'ROLE_NOT_ALLOWED');
  const db = getDb();
  const profile = db.creatorProfiles.find((p) => p.userId === user.id);
  if (profile?.vettingStatus !== 'APPROVED') fail(403, 'Your profile needs to be approved before you can apply.', 'CREATOR_NOT_APPROVED');
  const c = visibleCampaign(user, params.id);
  if (!isOpen(c)) fail(409, 'This campaign is no longer taking applications.', 'CAMPAIGN_CLOSED');
  // One application per creator per campaign (unique in the data model); a withdrawn one can be re-sent.
  const existing = db.applications.find((a) => a.campaignId === c.id && a.creatorUserId === user.id);
  if (existing && existing.status !== 'WITHDRAWN') fail(409, 'You already applied to this campaign.', 'ALREADY_APPLIED');
  const body = parseBody(applicationInputSchema, req.body);
  const fresh = { ...body, status: 'PENDING' as const, orderId: null, createdAt: now().toISOString(), decidedAt: null };
  const row: ApplicationRow = existing ? Object.assign(existing, fresh) : { id: ulid(now().getTime()), campaignId: c.id, creatorUserId: user.id, ...fresh };
  if (!existing) db.applications.push(row);
  notify(c.brandUserId, 'NEW_APPLICATION', `New application for “${c.title}”`, `${profile.displayName} applied.`, `/brand/campaigns/${c.id}`);
  return ok(toApplication(row), 201);
};

function ownApplication(user: UserRow, id: string): { a: ApplicationRow; c: CampaignRow } {
  const db = getDb();
  const a = db.applications.find((x) => x.id === id);
  const c = a && db.campaigns.find((x) => x.id === a.campaignId);
  const allowed = a && c && ((user.role === 'BRAND' && c.brandUserId === user.id) || (user.role === 'CREATOR' && a.creatorUserId === user.id));
  if (!a || !c || !allowed) fail(404, 'No such application.', 'APPLICATION_NOT_FOUND');
  return { a, c };
}

/** FR-42: accepting places an order — card authorised, creator still accepts within 72 h. */
export const acceptApplication: Handler = ({ req, params, user }) => {
  const { a, c } = ownApplication(user, params.id);
  if (user.role !== 'BRAND') fail(403, 'Only the brand can accept an application.', 'ROLE_NOT_ALLOWED');
  if (a.status !== 'PENDING') fail(409, `This application is already ${a.status.toLowerCase()}.`, 'APPLICATION_DECIDED');
  const { note, payment } = parseBody(applicationAcceptSchema, req.body ?? {});
  const db = getDb();
  const creator = db.creatorProfiles.find((p) => p.userId === a.creatorUserId);
  if (!creator || creator.vettingStatus !== 'APPROVED') fail(409, 'This creator can no longer take orders.', 'CREATOR_UNAVAILABLE');
  const platform = db.socialAccounts.filter((s) => s.creatorId === a.creatorUserId && c.platforms.includes(s.platform)).sort((x, y) => y.followers - x.followers)[0]?.platform ?? c.platforms[0];
  const created = placeOrder(
    user,
    creator,
    { kind: 'CAMPAIGN', packageId: null, campaignId: c.id, title: c.title, platform, deliverables: c.deliverables, priceCents: a.priceCents, deliveryDays: a.deliveryDays },
    { requirements: note ? `${c.brief}\n\n${note}` : c.brief, needsShipping: false, shippingAddress: null, links: [], referenceFiles: [] },
    payment,
  );
  a.status = 'ACCEPTED';
  a.orderId = created.orderId;
  a.decidedAt = now().toISOString();
  notify(a.creatorUserId, 'APPLICATION_ACCEPTED', `${brandParty(c.brandUserId).name} chose you for “${c.title}”`, 'An order is waiting for you to accept within 72 hours.', `/creator/orders/${created.orderId}`);
  return ok(created, 201);
};

export const rejectApplication: Handler = ({ req, params, user }) => {
  const { a, c } = ownApplication(user, params.id);
  if (user.role !== 'BRAND') fail(403, 'Only the brand can decline an application.', 'ROLE_NOT_ALLOWED');
  if (a.status !== 'PENDING') fail(409, `This application is already ${a.status.toLowerCase()}.`, 'APPLICATION_DECIDED');
  parseBody(reasonRequestSchema, req.body ?? {});
  a.status = 'REJECTED';
  a.decidedAt = now().toISOString();
  notify(a.creatorUserId, 'APPLICATION_REJECTED', `${brandParty(c.brandUserId).name} chose other creators`, `Your application to “${c.title}” was not selected.`, `/creator/campaigns/${c.id}`);
  return ok(toApplication(a));
};

export const withdrawApplication: Handler = ({ params, user }) => {
  const { a } = ownApplication(user, params.id);
  if (user.role !== 'CREATOR') fail(403, 'Only the creator can withdraw an application.', 'ROLE_NOT_ALLOWED');
  if (a.status !== 'PENDING') fail(409, `This application is already ${a.status.toLowerCase()}.`, 'APPLICATION_DECIDED');
  a.status = 'WITHDRAWN';
  a.decidedAt = now().toISOString();
  return ok(toApplication(a));
};
