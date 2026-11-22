/**
 * Mock for the admin console (FR-80 – FR-85) and the public report endpoint. Admin role only, except
 * POST /reports. Every admin action writes an audit entry (FR-84).
 */
import { deliver } from '../deliver';
import { feeUpdateSchema, reportInputSchema, reportResolveSchema, requiredReasonSchema, resolveDisputeSchema, userStatusChangeSchema } from '@/features/admin/schemas';
import { formatMoney } from '@/lib/money';
import type { AdminDispute, AdminSummary, AdminUser, AdminUserPage, AuditPage, FeeSettings, Report, VettingItem } from '@/types';
import { audit } from '../audit';
import { getDb, now, ulid, type DisputeRow, type ReportRow, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';
import { brandPaidCents } from '../orderMachine';
import { decideVetting, toCreatorMe } from './creatorMe';
import { applyTransition, moneyOf } from './orders';
import { toDisputeView } from './disputes';
import { feeConfigFor, toFeeEntry } from './plans';
import { PLAN_ORDER, PLANS } from '@/lib/plans';
import { issueSession, revokeAllSessions } from './session';

function requireAdmin(user: UserRow) {
  if (user.role !== 'ADMIN') fail(403, 'Admins only.', 'ROLE_NOT_ALLOWED');
}
const actor = (u: UserRow) => ({ kind: 'USER' as const, userId: u.id, role: u.role, emailVerified: !!u.emailVerifiedAt });

function party(userId: string) {
  const db = getDb();
  const c = db.creatorProfiles.find((p) => p.userId === userId);
  if (c) return { name: c.displayName, photoUrl: c.photoUrl, username: c.username };
  const b = db.brandProfiles.find((x) => x.userId === userId);
  return { name: b?.companyName ?? db.users.find((u) => u.id === userId)?.name ?? 'Unknown', photoUrl: b?.logoUrl ?? null, username: null };
}

function notify(userId: string, type: 'PROFILE_APPROVED' | 'PROFILE_REJECTED', title: string, body: string, link: string) {
  deliver(userId, { type, title, body, link }, 'ACCOUNT');
}

/* ---------- Summary ---------- */

export const getAdminSummary: Handler = ({ user }) => {
  requireAdmin(user);
  const db = getDb();
  const body: AdminSummary = {
    pendingVetting: db.creatorProfiles.filter((p) => p.vettingStatus === 'PENDING_REVIEW').length,
    openDisputes: db.disputes.filter((d) => d.status === 'OPEN').length,
    openReports: db.reports.filter((r) => r.status === 'OPEN').length,
  };
  return ok(body);
};

/* ---------- Vetting (FR-80) ---------- */

function toVettingItem(userId: string): VettingItem {
  const db = getDb();
  const p = db.creatorProfiles.find((c) => c.userId === userId)!;
  const me = toCreatorMe(p);
  return {
    creatorId: p.userId,
    username: p.username,
    displayName: p.displayName,
    email: db.users.find((u) => u.id === p.userId)?.email ?? '',
    photoUrl: p.photoUrl,
    bio: p.bio,
    city: p.city,
    country: p.country,
    niches: p.niches,
    languages: p.languages,
    socials: me.socials,
    packages: me.packages,
    portfolio: me.portfolio,
    vettingStatus: p.vettingStatus,
    rejectionReason: p.rejectionReason,
    submittedAt: p.submittedAt,
    createdAt: p.createdAt,
  };
}

export const listVetting: Handler = ({ req, user }) => {
  requireAdmin(user);
  const status = req.query.get('status') ?? 'PENDING_REVIEW';
  const rows = getDb()
    .creatorProfiles.filter((p) => p.vettingStatus === status)
    .sort((a, b) => (a.submittedAt ?? a.createdAt).localeCompare(b.submittedAt ?? b.createdAt));
  return ok({ content: (status === 'PENDING_REVIEW' ? rows : rows.reverse().slice(0, 50)).map((p) => toVettingItem(p.userId)) });
};

function vettingTarget(id: string) {
  const p = getDb().creatorProfiles.find((c) => c.userId === id);
  if (!p) fail(404, 'No such creator.', 'CREATOR_NOT_FOUND');
  return p;
}

export const approveCreator: Handler = ({ params, user }) => {
  requireAdmin(user);
  const p = vettingTarget(params.id);
  decideVetting(p, 'APPROVE');
  audit(user, { action: 'CREATOR_APPROVED', entityType: 'CREATOR_PROFILE', entityId: p.userId, summary: `Approved ${p.displayName} (@${p.username})`, before: { vettingStatus: 'PENDING_REVIEW' }, after: { vettingStatus: 'APPROVED' } });
  notify(p.userId, 'PROFILE_APPROVED', 'Your profile is live', 'Our team approved your profile. Brands can now find you in search.', '/creator/dashboard');
  return ok(toVettingItem(p.userId));
};

export const rejectCreator: Handler = ({ req, params, user }) => {
  requireAdmin(user);
  const p = vettingTarget(params.id);
  const { reason } = parseBody(requiredReasonSchema, req.body);
  decideVetting(p, 'REJECT', reason);
  audit(user, { action: 'CREATOR_REJECTED', entityType: 'CREATOR_PROFILE', entityId: p.userId, summary: `Rejected ${p.displayName}: ${reason}`, before: { vettingStatus: 'PENDING_REVIEW' }, after: { vettingStatus: 'REJECTED', reason } });
  notify(p.userId, 'PROFILE_REJECTED', 'Your profile needs changes', `Our team's note: “${reason}”`, '/creator/onboarding?step=review');
  return ok(toVettingItem(p.userId));
};

/* ---------- Disputes (FR-81) ---------- */

function toDispute(d: DisputeRow): AdminDispute {
  const db = getDb();
  const o = db.orders.find((x) => x.id === d.orderId)!;
  const info = db.orderInfo.find((i) => i.orderId === o.id)!;
  return {
    id: d.id,
    orderId: o.id,
    orderTitle: info.title,
    brand: party(o.brandUserId),
    creator: party(o.creatorUserId),
    money: moneyOf(o),
    ...toDisputeView(d),
    resolvedAt: d.resolvedAt,
    brandPlan: db.brandProfiles.find((b) => b.userId === o.brandUserId)?.plan ?? 'FREE',
  };
}

export const listDisputes: Handler = ({ req, user }) => {
  requireAdmin(user);
  const status = req.query.get('status');
  const rows = getDb()
    .disputes.filter((d) => !status || d.status === status)
    .map(toDispute)
    // Open first; among open ones Premium brands first (plan benefit), then oldest. Resolved: newest first.
    .sort(
      (a, b) =>
        Number(a.status === 'RESOLVED') - Number(b.status === 'RESOLVED') ||
        (a.status === 'OPEN' ? Number(b.brandPlan === 'PREMIUM') - Number(a.brandPlan === 'PREMIUM') || a.openedAt.localeCompare(b.openedAt) : (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? '')),
    );
  return ok({ content: rows });
};

export const resolveDispute: Handler = ({ req, params, user }) => {
  requireAdmin(user);
  const db = getDb();
  const d = db.disputes.find((x) => x.id === params.id);
  if (!d) fail(404, 'No such dispute.', 'DISPUTE_NOT_FOUND');
  if (d.status !== 'OPEN') fail(409, 'This dispute is already resolved.', 'DISPUTE_RESOLVED');
  const body = parseBody(resolveDisputeSchema, req.body);
  const order = db.orders.find((o) => o.id === d.orderId)!;
  // A full refund returns what the brand paid (after any promo or credit, v3.3).
  const refund = body.resolution === 'FULL_REFUND' ? brandPaidCents(order) : body.resolution === 'PARTIAL_REFUND' ? body.refundCents! : 0;
  // The state machine validates the amount (1 cent .. creator payout, or the full total).
  if (body.resolution === 'RELEASE') applyTransition(order, { type: 'ADMIN_RELEASE', note: body.note }, actor(user));
  else applyTransition(order, { type: 'ADMIN_REFUND', refundCents: refund, note: body.note }, actor(user));
  Object.assign(d, { status: 'RESOLVED', resolution: body.resolution, resolutionReason: body.resolutionReason, refundCents: refund, resolvedBy: user.id, resolvedAt: now().toISOString(), resolutionNote: body.note });
  audit(user, {
    action: 'DISPUTE_RESOLVED',
    entityType: 'ORDER',
    entityId: order.id,
    summary: `Dispute resolved: ${body.resolution.toLowerCase().replace('_', ' ')}${refund ? `, ${formatMoney(refund)} refunded` : ''}`,
    before: { status: 'DISPUTED' },
    after: { resolution: body.resolution, resolutionReason: body.resolutionReason, refundCents: refund, note: body.note },
  });
  return ok(toDispute(d));
};

/* ---------- Users (FR-82) ---------- */

/** Latest of: sign-in or refresh, an order action, a chat message (seeded users have only the last two). */
function lastActive(u: UserRow): string | null {
  const db = getDb();
  const times = [
    u.lastActiveAt ?? null,
    ...db.orderEvents.filter((e) => e.actorId === u.id).map((e) => e.at),
    ...db.messages.filter((m) => m.senderUserId === u.id).map((m) => m.createdAt),
  ].filter((x): x is string => !!x);
  return times.length ? times.reduce((a, b) => (a > b ? a : b)) : null;
}

function toAdminUser(u: UserRow): AdminUser {
  const db = getDb();
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    emailVerified: !!u.emailVerifiedAt,
    createdAt: u.createdAt,
    lastActiveAt: lastActive(u),
    orderCount: db.orders.filter((o) => o.brandUserId === u.id || o.creatorUserId === u.id).length,
    label: u.role === 'BRAND' ? (db.brandProfiles.find((b) => b.userId === u.id)?.companyName ?? null) : u.role === 'CREATOR' ? (db.creatorProfiles.find((p) => p.userId === u.id)?.username ?? null) : null,
  };
}

export const listUsers: Handler = ({ req, user }) => {
  requireAdmin(user);
  const q = (req.query.get('q') ?? '').trim().toLowerCase();
  const role = req.query.get('role');
  const status = req.query.get('status');
  const page = Math.max(0, Number(req.query.get('page') ?? 0) || 0);
  const size = Math.min(50, Math.max(1, Number(req.query.get('size') ?? 20) || 20));
  const rows = getDb()
    .users.map(toAdminUser)
    .filter((u) => (!q || `${u.name} ${u.email} ${u.label ?? ''}`.toLowerCase().includes(q)) && (!role || u.role === role) && (!status || u.status === status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name));
  const body: AdminUserPage = { content: rows.slice(page * size, (page + 1) * size), page, size, totalElements: rows.length, totalPages: Math.ceil(rows.length / size) };
  return ok(body);
};

export const updateUserStatus: Handler = ({ req, params, user }) => {
  requireAdmin(user);
  const target = getDb().users.find((u) => u.id === params.id);
  if (!target) fail(404, 'No such user.', 'USER_NOT_FOUND');
  if (target.id === user.id) fail(403, 'You cannot change your own status.', 'SELF_CHANGE');
  const body = parseBody(userStatusChangeSchema, req.body);
  const before = target.status;
  target.status = body.status;
  target.updatedAt = now().toISOString();
  if (body.status !== 'ACTIVE') revokeAllSessions(target.id);
  audit(user, { action: 'USER_STATUS_CHANGED', entityType: 'USER', entityId: target.id, summary: `${target.name}: ${before} → ${body.status} (${body.reason})`, before: { status: before }, after: { status: body.status, reason: body.reason } });
  return ok(toAdminUser(target));
};

export const impersonateUser: Handler = ({ params, user }) => {
  requireAdmin(user);
  const target = getDb().users.find((u) => u.id === params.id);
  if (!target) fail(404, 'No such user.', 'USER_NOT_FOUND');
  if (target.role === 'ADMIN') fail(403, 'Admins cannot be impersonated.', 'ROLE_NOT_ALLOWED');
  audit(user, { action: 'IMPERSONATION_STARTED', entityType: 'USER', entityId: target.id, summary: `Read-only view as ${target.name} (${target.email})`, before: null, after: null });
  return issueSession(target, 200, undefined, { impersonator: user });
};

/* ---------- Fees (FR-83) ---------- */

const feeSettings = (): FeeSettings => ({
  current: toFeeEntry(feeConfigFor('FREE')),
  plans: PLAN_ORDER.map((p) => toFeeEntry(feeConfigFor(p))),
  history: [...getDb().feeConfigs].reverse().map(toFeeEntry),
});

export const getFees: Handler = ({ user }) => {
  requireAdmin(user);
  return ok(feeSettings());
};

export const updateFees: Handler = ({ req, user }) => {
  requireAdmin(user);
  const body = parseBody(feeUpdateSchema, req.body);
  const plan = body.plan ?? 'FREE';
  const before = feeConfigFor(plan);
  getDb().feeConfigs.push({ plan, brandFeeBps: body.brandFeeBps, creatorFeeBps: body.creatorFeeBps, effectiveFrom: now().toISOString(), changedBy: user.id });
  audit(user, {
    action: 'FEES_CHANGED',
    entityType: 'FEE_CONFIG',
    entityId: plan,
    summary: `${PLANS[plan].name} plan fees: brand ${before.brandFeeBps / 100}% → ${body.brandFeeBps / 100}%, creator ${before.creatorFeeBps / 100}% → ${body.creatorFeeBps / 100}%`,
    before: { brandFeeBps: before.brandFeeBps, creatorFeeBps: before.creatorFeeBps },
    after: { plan, brandFeeBps: body.brandFeeBps, creatorFeeBps: body.creatorFeeBps },
  });
  return ok(feeSettings());
};

/* ---------- Audit log (FR-84) ---------- */

export const listAuditLogs: Handler = ({ req, user }) => {
  requireAdmin(user);
  const action = req.query.get('action');
  const page = Math.max(0, Number(req.query.get('page') ?? 0) || 0);
  const size = Math.min(100, Math.max(1, Number(req.query.get('size') ?? 50) || 50));
  const rows = getDb()
    .auditLogs.filter((a) => !action || a.action === action)
    .sort((a, b) => b.at.localeCompare(a.at));
  const body: AuditPage = {
    content: rows.slice(page * size, (page + 1) * size).map(({ actorId, ...r }) => (void actorId, r)),
    page,
    size,
    totalElements: rows.length,
    totalPages: Math.ceil(rows.length / size),
  };
  return ok(body);
};

/* ---------- Reports (FR-85) ---------- */

function targetOf(r: Pick<ReportRow, 'targetType' | 'targetId'>): { label: string; link: string | null } | null {
  const db = getDb();
  switch (r.targetType) {
    case 'CREATOR': {
      const p = db.creatorProfiles.find((c) => c.username === r.targetId);
      return p ? { label: `Creator ${p.displayName} (@${p.username})`, link: `/u/${p.username}` } : null;
    }
    case 'BRAND': {
      const b = db.brandProfiles.find((x) => x.userId === r.targetId);
      const u = db.users.find((x) => x.id === r.targetId);
      return u ? { label: `Brand ${b?.companyName ?? u.name}`, link: null } : null;
    }
    case 'MESSAGE': {
      const m = db.messages.find((x) => x.id === r.targetId);
      return m ? { label: `Message: “${m.body.slice(0, 80)}”`, link: `/messages/${m.conversationId}` } : null;
    }
    case 'REVIEW': {
      const rv = db.reviews.find((x) => x.id === r.targetId);
      return rv ? { label: `Review by ${rv.brandName}: “${(rv.comment ?? '').slice(0, 80)}”`, link: null } : null;
    }
  }
}

function toReport(r: ReportRow): Report {
  const t = targetOf(r);
  return {
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    targetLabel: t?.label ?? 'Deleted content',
    targetLink: t?.link ?? null,
    reason: r.reason,
    details: r.details,
    reporterName: getDb().users.find((u) => u.id === r.reporterId)?.name ?? 'Unknown',
    status: r.status,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    resolutionNote: r.resolutionNote,
  };
}

export const createReport: Handler = ({ req, user }) => {
  const body = parseBody(reportInputSchema, req.body);
  if (!targetOf(body)) fail(404, 'We could not find what you are reporting.', 'TARGET_NOT_FOUND');
  const db = getDb();
  if (db.reports.some((r) => r.reporterId === user.id && r.targetType === body.targetType && r.targetId === body.targetId && r.status === 'OPEN')) {
    fail(409, 'You already reported this. Our team will look at it.', 'ALREADY_REPORTED');
  }
  const row: ReportRow = { id: ulid(now().getTime()), reporterId: user.id, ...body, details: body.details ?? null, status: 'OPEN', createdAt: now().toISOString(), resolvedAt: null, resolvedBy: null, resolutionNote: null };
  db.reports.unshift(row);
  return ok(toReport(row), 201);
};

export const listReports: Handler = ({ req, user }) => {
  requireAdmin(user);
  const status = req.query.get('status');
  const rows = getDb()
    .reports.filter((r) => !status || r.status === status)
    .sort((a, b) => Number(a.status !== 'OPEN') - Number(b.status !== 'OPEN') || b.createdAt.localeCompare(a.createdAt));
  return ok({ content: rows.map(toReport) });
};

export const resolveReport: Handler = ({ req, params, user }) => {
  requireAdmin(user);
  const r = getDb().reports.find((x) => x.id === params.id);
  if (!r) fail(404, 'No such report.', 'REPORT_NOT_FOUND');
  if (r.status !== 'OPEN') fail(409, 'This report is already closed.', 'REPORT_CLOSED');
  const body = parseBody(reportResolveSchema, req.body);
  Object.assign(r, { status: body.status, resolutionNote: body.note, resolvedAt: now().toISOString(), resolvedBy: user.id });
  audit(user, { action: 'REPORT_RESOLVED', entityType: 'REPORT', entityId: r.id, summary: `Report ${body.status === 'DISMISSED' ? 'dismissed' : 'actioned'}: ${body.note}`, before: { status: 'OPEN' }, after: { status: body.status } });
  return ok(toReport(r));
};

/* ---------- FR-37: cancel an accepted order ---------- */

export const cancelOrderAsAdmin: Handler = ({ req, params, user }) => {
  requireAdmin(user);
  const { reason } = parseBody(requiredReasonSchema, req.body);
  const db = getDb();
  const order = db.orders.find((o) => o.id === params.id);
  if (!order) fail(404, 'No such order.', 'ORDER_NOT_FOUND');
  const before = order.status;
  const next = applyTransition(order, { type: 'ADMIN_CANCEL', note: reason }, actor(user));
  audit(user, {
    action: 'ORDER_CANCELLED',
    entityType: 'ORDER',
    entityId: order.id,
    summary: `Order cancelled after acceptance, ${formatMoney(next.payment.refundedCents)} refunded`,
    before: { status: before },
    after: { status: next.status, refundedCents: next.payment.refundedCents, reason },
  });
  return ok({ orderId: next.id, status: next.status, refundedCents: next.payment.refundedCents });
};
