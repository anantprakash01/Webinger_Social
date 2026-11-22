/**
 * Phase C — the collaboration around an order: drafts shared for approval before posting, product
 * shipping, requests for more time and manual post results. None of these change the order status or
 * move money (the state machine stays the single path for that); each writes an order event for the
 * timeline and notifies the other side (FR-52).
 */
import { draftReviewSchema, deliverRequestSchema, extensionRequestSchema, extensionReviewSchema, postMetricsSchema, shipmentSchema } from '@/features/orders/schemas';
import { getDb, now, ulid, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';
import type { CollabEventType, MockOrder } from '../orderMachine';
import { notifyOrderEvent, toDetail, visibleOrder } from './orders';

const DAY = 86_400_000;

function record(o: MockOrder, user: UserRow, type: CollabEventType, note: string | null = null) {
  const e = { orderId: o.id, type, fromStatus: o.status, toStatus: o.status, actorId: user.id, note, at: now().toISOString() };
  getDb().orderEvents.push(e);
  notifyOrderEvent(o, e);
}

function as(user: UserRow, role: 'BRAND' | 'CREATOR', what: string) {
  if (user.role !== role) fail(403, `Only the ${role === 'BRAND' ? 'brand' : 'creator'} can ${what}.`, 'ROLE_NOT_ALLOWED');
}

const inState = (o: MockOrder, states: MockOrder['status'][], detail: string) => {
  if (!states.includes(o.status)) fail(409, detail, 'INVALID_TRANSITION');
};

/* ---------- Drafts ---------- */

export const shareDraft: Handler = ({ req, params, user }) => {
  const o = visibleOrder(user, params.id);
  as(user, 'CREATOR', 'share a draft');
  inState(o, ['IN_PROGRESS'], 'Drafts can be shared while the order is in progress.');
  const db = getDb();
  if (db.drafts.some((d) => d.orderId === o.id && d.status === 'PENDING'))
    fail(409, 'The brand is still reviewing your last draft.', 'DRAFT_PENDING');
  const body = parseBody(deliverRequestSchema, req.body);
  db.drafts.push({
    id: ulid(now().getTime()),
    orderId: o.id,
    items: body.items.map((i) => ({ type: i.type, url: i.url, name: i.name ?? null })),
    note: body.note ?? null,
    status: 'PENDING',
    feedback: null,
    submittedAt: now().toISOString(),
    reviewedAt: null,
  });
  record(o, user, 'DRAFT_SHARED', body.note ?? null);
  return ok(toDetail(o, user), 201);
};

export const reviewDraft: Handler = ({ req, params, user }) => {
  const o = visibleOrder(user, params.id);
  as(user, 'BRAND', 'review drafts');
  const d = getDb().drafts.find((x) => x.id === params.draftId && x.orderId === o.id);
  if (!d) fail(404, 'No such draft.', 'NOT_FOUND');
  if (d.status !== 'PENDING') fail(409, 'This draft has already been reviewed.', 'DRAFT_REVIEWED');
  inState(o, ['IN_PROGRESS'], 'Drafts can be reviewed while the order is in progress.');
  const body = parseBody(draftReviewSchema, req.body);
  d.status = body.decision === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED';
  d.feedback = body.note || null;
  d.reviewedAt = now().toISOString();
  record(o, user, body.decision === 'APPROVE' ? 'DRAFT_APPROVED' : 'DRAFT_CHANGES_REQUESTED', d.feedback);
  return ok(toDetail(o, user));
};

/* ---------- Product shipping ---------- */

export const saveShipment: Handler = ({ req, params, user }) => {
  const o = visibleOrder(user, params.id);
  as(user, 'BRAND', 'add shipping');
  const db = getDb();
  if (!db.orderBriefs.find((b) => b.orderId === o.id)?.needsShipping) fail(409, 'This order does not need a product shipped.', 'NO_SHIPPING');
  inState(o, ['PENDING_ACCEPTANCE', 'IN_PROGRESS'], 'Shipping can be added before delivery.');
  const body = parseBody(shipmentSchema, req.body);
  const existing = db.shipments.find((s) => s.orderId === o.id);
  if (existing?.receivedAt) fail(409, 'The creator already received the product.', 'ALREADY_RECEIVED');
  if (existing) Object.assign(existing, body, { shippedAt: now().toISOString() });
  else db.shipments.push({ orderId: o.id, ...body, shippedAt: now().toISOString(), receivedAt: null });
  record(o, user, 'SHIPPED', `${body.courier} ${body.trackingNumber}`);
  return ok(toDetail(o, user));
};

export const markReceived: Handler = ({ params, user }) => {
  const o = visibleOrder(user, params.id);
  as(user, 'CREATOR', 'confirm receipt');
  const s = getDb().shipments.find((x) => x.orderId === o.id);
  if (!s) fail(409, 'Nothing has been shipped yet.', 'NOT_SHIPPED');
  if (s.receivedAt) fail(409, 'Already marked as received.', 'ALREADY_RECEIVED');
  inState(o, ['PENDING_ACCEPTANCE', 'IN_PROGRESS'], 'Receipt can be confirmed before delivery.');
  s.receivedAt = now().toISOString();
  record(o, user, 'RECEIVED');
  return ok(toDetail(o, user));
};

/* ---------- More time ---------- */

export const requestExtension: Handler = ({ req, params, user }) => {
  const o = visibleOrder(user, params.id);
  as(user, 'CREATOR', 'ask for more time');
  inState(o, ['IN_PROGRESS'], 'More time can be requested while the order is in progress.');
  const db = getDb();
  if (db.extensions.some((x) => x.orderId === o.id && x.status === 'PENDING')) fail(409, 'You already asked for more time; wait for the brand.', 'EXTENSION_PENDING');
  const body = parseBody(extensionRequestSchema, req.body);
  const base = o.dueAt ? new Date(o.dueAt).getTime() : now().getTime();
  db.extensions.push({
    id: ulid(now().getTime()),
    orderId: o.id,
    extraDays: body.extraDays,
    reason: body.reason,
    status: 'PENDING',
    requestedAt: now().toISOString(),
    decidedAt: null,
    newDueAt: new Date(base + body.extraDays * DAY).toISOString(),
  });
  record(o, user, 'EXTENSION_REQUESTED', `${body.extraDays} more day${body.extraDays === 1 ? '' : 's'} — ${body.reason}`);
  return ok(toDetail(o, user), 201);
};

export const reviewExtension: Handler = ({ req, params, user }) => {
  const o = visibleOrder(user, params.id);
  as(user, 'BRAND', 'answer a request for more time');
  const x = getDb().extensions.find((e) => e.orderId === o.id && e.status === 'PENDING');
  if (!x) fail(409, 'There is no pending request for more time.', 'NO_PENDING_EXTENSION');
  inState(o, ['IN_PROGRESS'], 'The order is no longer in progress.');
  const { decision } = parseBody(extensionReviewSchema, req.body);
  x.status = decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
  x.decidedAt = now().toISOString();
  if (decision === 'ACCEPT') {
    o.dueAt = x.newDueAt;
    o.version += 1;
    o.updatedAt = now().toISOString();
  }
  record(o, user, decision === 'ACCEPT' ? 'EXTENSION_ACCEPTED' : 'EXTENSION_DECLINED');
  return ok(toDetail(o, user));
};

/* ---------- Post results ---------- */

export const savePostMetrics: Handler = ({ req, params, user }) => {
  const o = visibleOrder(user, params.id);
  as(user, 'CREATOR', 'add post results');
  inState(o, ['DELIVERED', 'COMPLETED'], 'Results can be added once the post is delivered.');
  const d = getDb().deliveries.find((x) => x.id === params.deliveryId && x.orderId === o.id);
  if (!d) fail(404, 'No such delivery.', 'NOT_FOUND');
  const body = parseBody(postMetricsSchema, req.body);
  const item = d.items[body.itemIndex];
  if (!item || item.type !== 'POST_URL') fail(422, 'Results can only be added to a post link.', 'VALIDATION_FAILED', [{ field: 'itemIndex', message: 'Not a post link.' }]);
  const first = !item.metrics;
  item.metrics = { views: body.views, likes: body.likes, comments: body.comments, shares: body.shares ?? null, reach: body.reach ?? null, recordedAt: now().toISOString() };
  if (first) record(o, user, 'METRICS_ADDED');
  return ok(toDetail(o, user));
};
