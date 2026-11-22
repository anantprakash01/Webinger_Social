/**
 * Dispute handling (v3.1): the creator's response within 48 hours, evidence from both sides, and the
 * refund-reason log for admins. Opening and resolving still go through the order state machine
 * (DISPUTE, ADMIN_RELEASE / ADMIN_REFUND); nothing here moves money.
 */
import { disputeEvidenceSchema, disputeResponseSchema, MAX_EVIDENCE_PER_SIDE, DISPUTE_RESPONSE_HOURS } from '@/features/orders/schemas';
import type { DisputeReport, DisputeView } from '@/types';
import { deliver } from '../deliver';
import { getDb, now, ulid, type DisputeRow, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';
import { toDetail, visibleOrder } from './orders';

const HOUR = 3_600_000;

/** The creator's deadline: 48 hours after the dispute was opened. */
export const respondByOf = (d: DisputeRow) => d.respondBy ?? new Date(new Date(d.createdAt).getTime() + DISPUTE_RESPONSE_HOURS * HOUR).toISOString();

export const toDisputeView = (d: DisputeRow): DisputeView => ({
  reason: d.reason,
  status: d.status,
  openedAt: d.createdAt,
  resolution: d.resolution,
  refundCents: d.refundCents,
  reasonCode: d.reasonCode ?? 'OTHER',
  respondBy: respondByOf(d),
  creatorResponse: d.creatorResponse ?? null,
  respondedAt: d.respondedAt ?? null,
  evidence: (d.evidence ?? []).map((e) => ({ ...e })),
  resolutionReason: d.resolutionReason ?? null,
  resolutionNote: d.resolutionNote ?? null,
});

/** What the viewer may still do on an open dispute (for allowedActions). */
export function disputeActionsFor(orderId: string, user: UserRow): Array<'DISPUTE_RESPOND' | 'ADD_EVIDENCE'> {
  const d = getDb().disputes.find((x) => x.orderId === orderId);
  if (!d || d.status !== 'OPEN' || user.role === 'ADMIN') return [];
  const out: Array<'DISPUTE_RESPOND' | 'ADD_EVIDENCE'> = [];
  if (user.role === 'CREATOR' && !d.creatorResponse && now().toISOString() < respondByOf(d)) out.push('DISPUTE_RESPOND');
  const side = user.role === 'BRAND' ? 'BRAND' : 'CREATOR';
  if ((d.evidence ?? []).filter((e) => e.by === side).length < MAX_EVIDENCE_PER_SIDE) out.push('ADD_EVIDENCE');
  return out;
}

function openDisputeFor(user: UserRow, orderId: string) {
  const o = visibleOrder(user, orderId);
  const d = getDb().disputes.find((x) => x.orderId === o.id);
  if (!d) fail(404, 'This order has no dispute.', 'DISPUTE_NOT_FOUND');
  if (d.status !== 'OPEN') fail(409, 'This dispute is already resolved.', 'DISPUTE_RESOLVED');
  return { o, d };
}

export const respondToDispute: Handler = ({ req, params, user }) => {
  if (user.role !== 'CREATOR') fail(403, 'Only the creator can respond to a dispute.', 'ROLE_NOT_ALLOWED');
  const { o, d } = openDisputeFor(user, params.id);
  if (d.creatorResponse) fail(409, 'You already responded to this dispute.', 'ALREADY_RESPONDED');
  if (now().toISOString() >= respondByOf(d)) fail(409, 'The 48-hour window to respond has passed. Our team will decide with what it has.', 'RESPONSE_WINDOW_PASSED');
  const { response } = parseBody(disputeResponseSchema, req.body);
  d.creatorResponse = response;
  d.respondedAt = now().toISOString();
  const creator = getDb().creatorProfiles.find((p) => p.userId === user.id)?.displayName ?? 'The creator';
  deliver(o.brandUserId, { type: 'DISPUTE_UPDATE', title: `${creator} responded to your dispute`, body: response.length > 120 ? `${response.slice(0, 117)}…` : response, link: `/brand/orders/${o.id}` }, 'ORDERS');
  return ok(toDetail(o, user));
};

export const addDisputeEvidence: Handler = ({ req, params, user }) => {
  if (user.role !== 'BRAND' && user.role !== 'CREATOR') fail(403, 'Only the brand and the creator can add evidence.', 'ROLE_NOT_ALLOWED');
  const { o, d } = openDisputeFor(user, params.id);
  const side = user.role === 'BRAND' ? 'BRAND' : 'CREATOR';
  const mine = (d.evidence ?? []).filter((e) => e.by === side);
  if (mine.length >= MAX_EVIDENCE_PER_SIDE) fail(409, `You can add up to ${MAX_EVIDENCE_PER_SIDE} items of evidence.`, 'EVIDENCE_LIMIT');
  const body = parseBody(disputeEvidenceSchema, req.body);
  d.evidence = [...(d.evidence ?? []), { id: ulid(now().getTime()), by: side, kind: body.kind, url: body.url, name: body.name ?? null, note: body.note ?? null, at: now().toISOString() }];
  return ok(toDetail(o, user));
};

/* ---------- Admin: refund-reason log ---------- */

export function disputeReport(days: number): DisputeReport {
  const db = getDb();
  const since = new Date(now().getTime() - days * 24 * HOUR).toISOString();
  const resolved = db.disputes.filter((d) => d.status === 'RESOLVED' && (d.resolvedAt ?? '') >= since);
  const opened = db.disputes.filter((d) => d.createdAt >= since);
  const byReason = new Map<NonNullable<DisputeRow['resolutionReason']>, { count: number; refundedCents: number }>();
  for (const d of resolved) {
    const k = d.resolutionReason ?? 'OTHER';
    const cur = byReason.get(k) ?? { count: 0, refundedCents: 0 };
    byReason.set(k, { count: cur.count + 1, refundedCents: cur.refundedCents + (d.refundCents ?? 0) });
  }
  const byBrand = new Map<NonNullable<DisputeRow['reasonCode']>, number>();
  for (const d of opened) byBrand.set(d.reasonCode ?? 'OTHER', (byBrand.get(d.reasonCode ?? 'OTHER') ?? 0) + 1);
  const hours = resolved.filter((d) => d.resolvedAt).map((d) => (new Date(d.resolvedAt!).getTime() - new Date(d.createdAt).getTime()) / HOUR);
  return {
    days,
    resolved: resolved.length,
    open: db.disputes.filter((d) => d.status === 'OPEN').length,
    released: resolved.filter((d) => d.resolution === 'RELEASE').length,
    fullRefunds: resolved.filter((d) => d.resolution === 'FULL_REFUND').length,
    partialRefunds: resolved.filter((d) => d.resolution === 'PARTIAL_REFUND').length,
    refundedCents: resolved.reduce((s, d) => s + (d.refundCents ?? 0), 0),
    avgHoursToResolve: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null,
    byReason: [...byReason].map(([reason, v]) => ({ reason, ...v })).sort((a, b) => b.count - a.count || b.refundedCents - a.refundedCents),
    byBrandReason: [...byBrand].map(([reasonCode, count]) => ({ reasonCode, count })).sort((a, b) => b.count - a.count),
  };
}

export const getDisputeReport: Handler = ({ req, user }) => {
  if (user.role !== 'ADMIN') fail(403, 'Admins only.', 'ROLE_NOT_ALLOWED');
  const days = Math.min(365, Math.max(1, Number(req.query.get('days') ?? 90) || 90));
  return ok(disputeReport(days));
};
