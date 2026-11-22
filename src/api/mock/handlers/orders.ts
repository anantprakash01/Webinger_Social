/**
 * Mock for the Orders and Reviews modules (FR-30 – FR-38, FR-60, FR-64).
 * Every status change goes through orderMachine.ts (rule 9.5.2), so states, guards, error codes,
 * payment states and ledger entries match the backend's OrderStateMachine.
 */
import { deliver } from '../deliver';
import { assertAvailable, brandRatingOf, brandReviewOf } from './retention';
import { calculateTaxes, NO_TAXES, PLATFORM_GSTIN, PLATFORM_STATE } from '../tax';
import {
  briefSchema,
  DISPUTE_RESPONSE_HOURS,
  disputeRequestSchema,
  deliverRequestSchema,
  noteRequestSchema,
  orderCreateRequestSchema,
  quoteQuerySchema,
  reasonRequestSchema,
  replyRequestSchema,
  reviewRequestSchema,
} from '@/features/orders/schemas';
import type { DisputeReasonCode, OrderAction, OrderCreated, OrderDetail, OrderEventView, OrderPage, OrderParty, OrderQuote, OrderSummary, Platform, Review } from '@/types';
import { orderEventNotifications } from '../notify';
import { disputeActionsFor, toDisputeView } from './disputes';
import { auditLedger } from '../audit';
import { runPayouts } from '../payoutsCore';
import { resolveOrderPayment } from './payments';
import { runAccountDeletions } from './account';
import { calculateFees } from '../fees';
import { getDb, now, ulid, type CreatorProfileRow, type OrderBriefRow, type PackageRow, type ReviewRow, type UserRow } from '../db';
import type { PackageAddon } from '@/types';
import { fail, ok, parseBody, type Handler } from '../http';
import {
  ACCEPT_WINDOW_HOURS,
  brandTotalCents,
  creatorPayoutCents,
  allowedEvents,
  createOrder as machineCreate,
  dueSystemEvent,
  MAX_REVISIONS,
  maxRevisionsOf,
  transition,
  type Actor,
  type MockOrder,
  type OrderEvent,
  type OrderEventInput,
  type OrderEventType,
  type OrderStatus,
} from '../orderMachine';

const CURRENCY = 'INR';
const ALL_STATUSES: OrderStatus[] = ['PENDING_ACCEPTANCE', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED', 'DISPUTED', 'REFUNDED', 'CLOSED'];

/* ---------- Helpers ---------- */

export const actorOf = (u: UserRow): Actor => ({ kind: 'USER', userId: u.id, role: u.role, emailVerified: !!u.emailVerifiedAt });

function requireBrand(user: UserRow) {
  if (user.role !== 'BRAND') fail(403, 'Only brand accounts can do this.', 'ROLE_NOT_ALLOWED');
}

/** The order if the user takes part in it (admins see all). Others get 404, so ids cannot be probed. */
export function visibleOrder(user: UserRow, id: string): MockOrder {
  const o = getDb().orders.find((x) => x.id === id);
  const mine = o && (user.role === 'ADMIN' || (user.role === 'BRAND' && o.brandUserId === user.id) || (user.role === 'CREATOR' && o.creatorUserId === user.id));
  if (!o || !mine) fail(404, 'No such order.', 'ORDER_NOT_FOUND');
  return o;
}

function approvedCreator(username: string): CreatorProfileRow {
  const p = getDb().creatorProfiles.find((c) => c.username?.toLowerCase() === username.toLowerCase());
  if (!p || p.vettingStatus !== 'APPROVED') fail(404, 'No creator with that username.', 'CREATOR_NOT_FOUND');
  return p;
}

/** The newest fee config applies to new orders (FR-83); it is copied onto the order. */
const feeConfig = () => {
  const rows = getDb().feeConfigs;
  return rows[rows.length - 1];
};

/** Runs one transition and stores everything it produced. */
export function applyTransition(order: MockOrder, e: OrderEventInput, actor: Actor): MockOrder {
  const db = getDb();
  const res = transition(order, e, actor, { now: now(), newId: () => ulid(now().getTime()) });
  db.orders[db.orders.indexOf(order)] = res.order;
  db.orderEvents.push(res.event);
  db.ledgerEntries.push(...res.ledger);
  auditLedger(res.ledger, actor.kind === 'USER' ? (db.users.find((u) => u.id === actor.userId) ?? null) : null);
  if (e.type === 'DISPUTE' && actor.kind === 'USER') {
    db.disputes.push({ id: ulid(now().getTime()), orderId: order.id, openedBy: actor.userId, reason: e.note ?? '', status: 'OPEN', resolution: null, refundCents: null, resolvedBy: null, createdAt: now().toISOString(), resolvedAt: null });
  }
  notifyOrderEvent(res.order, res.event);
  return res.order;
}

/** FR-52: in-app notification + email to each participant who did not cause the event. */
export function notifyOrderEvent(o: MockOrder, e: OrderEvent) {
  const db = getDb();
  const info = db.orderInfo.find((i) => i.orderId === o.id);
  if (!info) return;
  const drafts = orderEventNotifications(e, o, { title: info.title, brandName: brandParty(o.brandUserId).name, creatorName: creatorParty(o.creatorUserId).name });
  for (const n of drafts) {
    if (n.userId === e.actorId) continue;
    deliver(n.userId, { type: n.type, title: n.title, body: n.body, link: n.link }, 'ORDERS');
  }
}

/**
 * Scheduled jobs (section 4.3): expire unaccepted orders and auto-approve deliveries whose window passed.
 * The backend runs these every 5 minutes; the mock runs them before every request.
 */
export function runScheduledJobs(): { expired: number; autoApproved: number } {
  const counts = { expired: 0, autoApproved: 0 };
  const t = now();
  for (const o of [...getDb().orders]) {
    const due = dueSystemEvent(o, t);
    if (!due) continue;
    applyTransition(o, { type: due }, { kind: 'SYSTEM' });
    if (due === 'EXPIRE') counts.expired += 1;
    else counts.autoApproved += 1;
  }
  runPayouts();
  runAccountDeletions();
  return counts;
}

function creatorParty(userId: string): OrderParty {
  const p = getDb().creatorProfiles.find((c) => c.userId === userId);
  return { name: p?.displayName ?? 'Creator', photoUrl: p?.photoUrl ?? null, username: p?.username ?? null };
}
function brandParty(userId: string): OrderParty {
  const db = getDb();
  const b = db.brandProfiles.find((x) => x.userId === userId);
  return { name: b?.companyName ?? db.users.find((u) => u.id === userId)?.name ?? 'Brand', photoUrl: b?.logoUrl ?? null, username: null };
}

const reviewOf = (orderId: string) => getDb().reviews.find((r) => r.orderId === orderId) ?? null;
const toReview = (r: ReviewRow): Review => ({ id: r.id, rating: r.rating, comment: r.comment, brandName: r.brandName, createdAt: r.createdAt, creatorReply: r.creatorReply, repliedAt: r.repliedAt });

/** Machine events the viewer may fire, plus non-transition actions (brief, review, reply). */
function actionsFor(o: MockOrder, user: UserRow): OrderAction[] {
  const machine: Partial<Record<OrderEventType, OrderAction>> = {
    ACCEPT: 'ACCEPT', DECLINE: 'DECLINE', CANCEL: 'CANCEL', DELIVER: 'DELIVER', APPROVE: 'APPROVE', REQUEST_REVISION: 'REQUEST_REVISION', DISPUTE: 'DISPUTE', ADMIN_CANCEL: 'ADMIN_CANCEL',
  };
  const out = allowedEvents(o, actorOf(user), now()).map((e) => machine[e]).filter((a): a is OrderAction => !!a);
  const review = reviewOf(o.id);
  if (user.role === 'BRAND' && (o.status === 'PENDING_ACCEPTANCE' || o.status === 'IN_PROGRESS')) out.push('EDIT_BRIEF');
  if (user.role === 'BRAND' && o.status === 'COMPLETED' && !review) out.push('REVIEW');
  if (user.role === 'CREATOR' && review && !review.creatorReply) out.push('REPLY');
  out.push(...disputeActionsFor(o.id, user));
  return out;
}

const NEEDS_ACTION: OrderAction[] = ['ACCEPT', 'DELIVER', 'APPROVE'];

function toSummary(o: MockOrder, user: UserRow): OrderSummary {
  const info = getDb().orderInfo.find((i) => i.orderId === o.id)!;
  const t = now().getTime();
  const nextDeadline =
    o.status === 'PENDING_ACCEPTANCE' ? { kind: 'ACCEPT' as const, at: o.acceptBy } : o.status === 'IN_PROGRESS' && o.dueAt ? { kind: 'DUE' as const, at: o.dueAt } : o.status === 'DELIVERED' && o.reviewBy ? { kind: 'REVIEW' as const, at: o.reviewBy } : null;
  return {
    id: o.id,
    status: o.status,
    closeReason: o.closeReason,
    kind: info.kind,
    title: info.title,
    platform: info.platform,
    counterparty: user.role === 'CREATOR' ? brandParty(o.brandUserId) : creatorParty(o.creatorUserId),
    brand: brandParty(o.brandUserId),
    creator: creatorParty(o.creatorUserId),
    money: {
      currency: o.currency,
      priceCents: o.priceCents,
      brandFeeCents: o.brandFeeCents,
      totalCents: brandTotalCents(o),
      creatorFeeCents: o.creatorFeeCents,
      creatorPayoutCents: creatorPayoutCents(o),
      taxes: o.taxes ?? NO_TAXES,
    },
    nextDeadline,
    late: o.status === 'IN_PROGRESS' && !!o.dueAt && new Date(o.dueAt).getTime() < t,
    needsAction: actionsFor(o, user).some((a) => NEEDS_ACTION.includes(a)),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function actorRole(actorId: string | null): OrderEventView['actor'] {
  if (!actorId) return 'SYSTEM';
  return getDb().users.find((u) => u.id === actorId)?.role ?? 'SYSTEM';
}

export function toDetail(o: MockOrder, user: UserRow): OrderDetail {
  const db = getDb();
  const info = db.orderInfo.find((i) => i.orderId === o.id)!;
  const brief = db.orderBriefs.find((b) => b.orderId === o.id);
  const dispute = db.disputes.find((d) => d.orderId === o.id);
  const review = reviewOf(o.id);
  return {
    ...toSummary(o, user),
    packageId: o.packageId,
    campaignId: o.campaignId,
    conversationId: db.conversations.find((c) => c.orderId === o.id)?.id ?? '',
    deliverables: info.deliverables,
    deliveryDays: o.deliveryDays,
    payment: { ...o.payment },
    acceptBy: o.acceptBy,
    dueAt: o.dueAt,
    reviewBy: o.reviewBy,
    revisionCount: o.revisionCount,
    maxRevisions: maxRevisionsOf(o),
    brief: brief
      ? { requirements: brief.requirements, needsShipping: brief.needsShipping, shippingAddress: brief.shippingAddress, links: brief.links, referenceFiles: brief.referenceFiles }
      : { requirements: '', needsShipping: false, shippingAddress: null, links: [], referenceFiles: [] },
    deliveries: db.deliveries
      .filter((d) => d.orderId === o.id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map((d) => ({ id: d.id, revisionNo: d.revisionNo, items: d.items.map((i) => ({ type: i.type, url: i.url, name: i.name ?? null, metrics: i.metrics ?? null })), note: d.note, submittedAt: d.submittedAt })),
    events: db.orderEvents
      .filter((e) => e.orderId === o.id)
      .map((e) => ({ type: e.type, fromStatus: e.fromStatus, toStatus: e.toStatus, actor: actorRole(e.actorId), note: e.note, at: e.at })),
    dispute: dispute ? toDisputeView(dispute) : null,
    review: review ? toReview(review) : null,
    allowedActions: actionsFor(o, user),
    serverTime: now().toISOString(),
    taxParties: taxPartiesOf(o),
    brandReview: brandReviewOf(o.id),
    brandRating: brandRatingOf(o.brandUserId),
    addons: info.addons ?? [],
    usageRights: info.usageRights ?? null,
    drafts: db.drafts
      .filter((d) => d.orderId === o.id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map((d) => ({ id: d.id, items: d.items.map((i) => ({ type: i.type, url: i.url, name: i.name ?? null, metrics: null })), note: d.note, status: d.status, feedback: d.feedback, submittedAt: d.submittedAt, reviewedAt: d.reviewedAt })),
    shipment: (() => {
      const s = db.shipments.find((x) => x.orderId === o.id);
      return s ? { courier: s.courier, trackingNumber: s.trackingNumber, shippedAt: s.shippedAt, receivedAt: s.receivedAt } : null;
    })(),
    extension: (() => {
      const x = db.extensions.filter((e) => e.orderId === o.id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
      return x ? { extraDays: x.extraDays, reason: x.reason, status: x.status, requestedAt: x.requestedAt, decidedAt: x.decidedAt, newDueAt: x.newDueAt } : null;
    })(),
  };
}

/* ---------- Package add-ons (phase C) ---------- */

export const toAddon = (a: PackageAddon): PackageAddon => ({ id: a.id, kind: a.kind, title: a.title, priceCents: a.priceCents, usageDays: a.usageDays ?? null, rushDays: a.rushDays ?? null });

/**
 * Price, delivery days and revisions for a package with the chosen add-ons. Everything is fixed on the
 * order at checkout, like the fees: rush replaces the delivery days, an extra revision raises the limit.
 */
export function withAddons(k: PackageRow, ids: string[]) {
  const chosen = [...new Set(ids)].map((id) => {
    const a = (k.addons ?? []).find((x) => x.id === id);
    if (!a) fail(422, 'This add-on is not offered with the package.', 'UNKNOWN_ADDON', [{ field: 'addonIds', message: 'Unknown add-on.' }]);
    return toAddon(a);
  });
  const rush = chosen.find((a) => a.kind === 'RUSH');
  const usage = chosen.find((a) => a.kind === 'USAGE_RIGHTS');
  return {
    addons: chosen,
    priceCents: k.priceCents + chosen.reduce((s, a) => s + a.priceCents, 0),
    deliveryDays: rush?.rushDays ?? k.deliveryDays,
    maxRevisions: MAX_REVISIONS + chosen.filter((a) => a.kind === 'EXTRA_REVISION').length,
    usageRights: usage ? `Paid ads for ${usage.usageDays} days` : null,
  };
}

/* ---------- Quote and checkout ---------- */

export const quoteOrder: Handler = ({ req, user }) => {
  requireBrand(user);
  const q = parseBody(quoteQuerySchema, Object.fromEntries(req.query));
  const db = getDb();
  let creator: CreatorProfileRow;
  let pkg: OrderQuote['package'] = null;
  let priceCents: number;
  if (q.packageId) {
    const k = db.packages.find((x) => x.id === q.packageId);
    const owner = k && db.creatorProfiles.find((c) => c.userId === k.creatorId);
    if (!k || !owner || owner.vettingStatus !== 'APPROVED') fail(404, 'This package does not exist.', 'PACKAGE_NOT_FOUND');
    if (!k.active) fail(409, 'This package is no longer offered.', 'PACKAGE_UNAVAILABLE');
    creator = owner;
    pkg = { id: k.id, platform: k.platform, title: k.title, description: k.description, deliverables: k.deliverables, priceCents: k.priceCents, currency: CURRENCY, deliveryDays: k.deliveryDays, addons: (k.addons ?? []).map(toAddon) };
    priceCents = withAddons(k, q.addonIds ? q.addonIds.split(',').filter(Boolean) : []).priceCents;
  } else {
    creator = approvedCreator(q.creatorUsername!);
    priceCents = q.priceCents!;
  }
  const f = calculateFees(priceCents, feeConfig());
  const taxes = calculateTaxes(f, taxContext(user, creator.userId));
  const body: OrderQuote = {
    kind: pkg ? 'PACKAGE' : 'CUSTOM_OFFER',
    creator: creatorParty(creator.userId),
    package: pkg,
    priceCents: f.priceCents,
    brandFeeCents: f.brandFeeCents,
    totalCents: brandTotalCents({ ...f, taxes }),
    brandFeeBps: feeConfig().brandFeeBps,
    taxes,
    currency: CURRENCY,
    acceptWindowHours: ACCEPT_WINDOW_HOURS,
  };
  return ok(body);
};

export const createOrder: Handler = ({ req, user }) => {
  requireBrand(user);
  const body = parseBody(orderCreateRequestSchema, req.body);
  const db = getDb();
  let creator: CreatorProfileRow;
  let line: OrderLine;
  if (body.packageId) {
    const k = db.packages.find((x) => x.id === body.packageId);
    const owner = k && db.creatorProfiles.find((c) => c.userId === k.creatorId);
    if (!k || !owner || owner.vettingStatus !== 'APPROVED') fail(404, 'This package does not exist.', 'PACKAGE_NOT_FOUND');
    if (!k.active) fail(409, 'This package is no longer offered.', 'PACKAGE_UNAVAILABLE');
    creator = owner;
    const x = withAddons(k, body.addonIds ?? []);
    line = { kind: 'PACKAGE', packageId: k.id, campaignId: null, title: k.title, platform: k.platform, deliverables: k.deliverables, priceCents: x.priceCents, deliveryDays: x.deliveryDays, maxRevisions: x.maxRevisions, addons: x.addons, usageRights: x.usageRights };
  } else {
    creator = approvedCreator(body.creatorUsername!);
    const o = body.offer!;
    line = { kind: 'CUSTOM_OFFER', packageId: null, campaignId: null, title: o.title, platform: o.platform, deliverables: o.deliverables, priceCents: o.priceCents, deliveryDays: o.deliveryDays };
  }
  return ok(placeOrder(user, creator, line, normaliseBrief(body.brief), body.payment), 201);
};

/**
 * GST place of supply and the creator's registration (v2.3): intra-state when the brand's state is the
 * platform's (or unknown); GST-registered when the creator's payout account has a GSTIN.
 */
export function taxContext(brand: UserRow | undefined, creatorUserId: string) {
  const db = getDb();
  const state = brand ? db.brandProfiles.find((b) => b.userId === brand.id)?.state : null;
  return {
    intraState: !state || state === PLATFORM_STATE,
    creatorGstRegistered: !!db.payoutAccounts.find((a) => a.creatorId === creatorUserId && a.status === 'VERIFIED')?.gstin,
  };
}

/** GSTINs and states for tax invoices (v2.3). */
function taxPartiesOf(o: MockOrder) {
  const db = getDb();
  const b = db.brandProfiles.find((x) => x.userId === o.brandUserId);
  return {
    platformGstin: PLATFORM_GSTIN,
    platformState: PLATFORM_STATE,
    brandGstin: b?.gstin ?? null,
    brandState: b?.state ?? null,
    creatorGstin: o.taxes?.creatorGstRegistered ? (db.payoutAccounts.find((a) => a.creatorId === o.creatorUserId)?.gstin ?? null) : null,
  };
}

export interface OrderLine {
  kind: 'PACKAGE' | 'CUSTOM_OFFER' | 'CAMPAIGN';
  packageId: string | null;
  campaignId: string | null;
  title: string;
  platform: Platform;
  deliverables: string[];
  priceCents: number;
  deliveryDays: number;
  /** Phase C add-ons (packages only). */
  maxRevisions?: number;
  addons?: PackageAddon[];
  usageRights?: string | null;
}

/**
 * Checkout core shared by packages, custom offers and accepted campaign applications (FR-42: same flow).
 * FR-30: authorise, don't capture. The machine checks role, verified email (FR-02), price and days.
 */
export function placeOrder(user: UserRow, creator: CreatorProfileRow, line: OrderLine, brief: Omit<OrderBriefRow, 'orderId' | 'updatedAt'>, payment: unknown): OrderCreated {
  assertAvailable(creator);
  if (creator.payoutStatus !== 'ENABLED') fail(409, 'This creator cannot take paid orders yet.', 'CREATOR_PAYOUTS_DISABLED');
  if (!user.emailVerifiedAt) fail(403, 'Verify your email before placing orders.', 'EMAIL_NOT_VERIFIED');
  const db = getDb();
  // v2.0: verify the payment (Razorpay proof or wallet balance) for the exact total before the order exists.
  const fees = feeConfig();
  const tax = taxContext(user, creator.userId);
  const f = calculateFees(line.priceCents, fees);
  const pay = resolveOrderPayment(user, payment, brandTotalCents({ ...f, taxes: calculateTaxes(f, tax) }));
  const { order, event } = machineCreate(
    { id: ulid(now().getTime()), creatorUserId: creator.userId, packageId: line.packageId, campaignId: line.campaignId, priceCents: line.priceCents, deliveryDays: line.deliveryDays, fees, payment: pay.info, tax, maxRevisions: line.maxRevisions },
    actorOf(user),
    { now: now() },
  );
  pay.commit(order.id);
  const paymentIntentId = `pay_mock${order.id.slice(-12).toLowerCase()}`;
  db.orders.push(order);
  db.orderEvents.push(event);
  db.orderInfo.push({ orderId: order.id, kind: line.kind, title: line.title, platform: line.platform, deliverables: line.deliverables, paymentIntentId, addons: line.addons ?? [], usageRights: line.usageRights ?? null });
  db.orderBriefs.push({ orderId: order.id, ...brief, updatedAt: order.createdAt });
  db.conversations.push({ id: ulid(now().getTime()), orderId: order.id, createdAt: order.createdAt });
  notifyOrderEvent(order, event);
  return {
    orderId: order.id,
    status: order.status,
    priceCents: order.priceCents,
    brandFeeCents: order.brandFeeCents,
    totalCents: brandTotalCents(order),
    currency: order.currency,
    acceptBy: order.acceptBy,
  };
}

export function normaliseBrief(b: ReturnType<typeof briefSchema.parse>): Omit<OrderBriefRow, 'orderId' | 'updatedAt'> {
  return { requirements: b.requirements, needsShipping: b.needsShipping, shippingAddress: b.needsShipping ? (b.shippingAddress ?? null) : null, links: b.links, referenceFiles: b.referenceFiles };
}

/* ---------- Reading ---------- */

export const listOrders: Handler = ({ req, user }) => {
  const db = getDb();
  const mine = db.orders.filter((o) => user.role === 'ADMIN' || (user.role === 'BRAND' ? o.brandUserId === user.id : user.role === 'CREATOR' && o.creatorUserId === user.id));
  const wanted = (req.query.get('status') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const bad = wanted.find((s) => !ALL_STATUSES.includes(s as OrderStatus));
  if (bad) fail(422, `Unknown status ${bad}.`, 'VALIDATION_FAILED', [{ field: 'status', message: 'Unknown status.' }]);
  const page = Math.max(0, Number(req.query.get('page') ?? 0) || 0);
  const size = Math.min(50, Math.max(1, Number(req.query.get('size') ?? 20) || 20));
  // v1.1 urgency order: waiting on the caller, then open orders by nearest deadline, then newest activity.
  const rows = mine.filter((o) => wanted.length === 0 || wanted.includes(o.status)).map((o) => toSummary(o, user));
  const rank = (s: OrderSummary) => (s.needsAction ? 0 : s.nextDeadline ? 1 : 2);
  const filtered = rows.sort(
    (a, b) => rank(a) - rank(b) || (a.nextDeadline && b.nextDeadline ? a.nextDeadline.at.localeCompare(b.nextDeadline.at) : 0) || b.updatedAt.localeCompare(a.updatedAt),
  );
  const body: OrderPage = {
    content: filtered.slice(page * size, (page + 1) * size),
    page,
    size,
    totalElements: filtered.length,
    totalPages: Math.ceil(filtered.length / size),
    statusCounts: Object.fromEntries(ALL_STATUSES.map((s) => [s, mine.filter((o) => o.status === s).length])),
    serverTime: now().toISOString(),
  };
  return ok(body);
};

export const getOrder: Handler = ({ params, user }) => ok(toDetail(visibleOrder(user, params.id), user));

/* ---------- Actions (each one machine transition) ---------- */

function act(type: 'ACCEPT' | 'DECLINE' | 'CANCEL' | 'APPROVE' | 'REQUEST_REVISION' | 'DISPUTE'): Handler {
  return ({ req, params, user }) => {
    const order = visibleOrder(user, params.id);
    let note: string | undefined;
    let reasonCode: DisputeReasonCode | undefined;
    if (type === 'REQUEST_REVISION') note = parseBody(noteRequestSchema, req.body).note;
    if (type === 'DISPUTE') ({ note, reasonCode } = parseBody(disputeRequestSchema, req.body));
    if (type === 'DECLINE' || type === 'CANCEL') note = parseBody(reasonRequestSchema, req.body ?? {}).reason ?? undefined;
    const next = applyTransition(order, { type, note } as OrderEventInput, actorOf(user));
    if (type === 'DISPUTE') {
      // v3.1: the brand's reason and the creator's 48-hour window to respond.
      const d = getDb().disputes.find((x) => x.orderId === order.id)!;
      d.reasonCode = reasonCode ?? 'OTHER';
      d.respondBy = new Date(now().getTime() + DISPUTE_RESPONSE_HOURS * 3_600_000).toISOString();
      d.evidence = [];
    }
    return ok(toDetail(next, user));
  };
}

export const acceptOrder = act('ACCEPT');
export const declineOrder = act('DECLINE');
export const cancelOrder = act('CANCEL');
export const approveOrder = act('APPROVE');
export const requestRevision = act('REQUEST_REVISION');
export const disputeOrder = act('DISPUTE');

export const deliverOrder: Handler = ({ req, params, user }) => {
  const order = visibleOrder(user, params.id);
  const body = parseBody(deliverRequestSchema, req.body);
  const revisionNo = order.revisionCount;
  const next = applyTransition(order, { type: 'DELIVER' }, actorOf(user));
  getDb().deliveries.push({
    id: ulid(now().getTime()),
    orderId: order.id,
    revisionNo,
    items: body.items.map((i) => ({ type: i.type, url: i.url, name: i.name ?? null })),
    note: body.note ?? null,
    submittedAt: now().toISOString(),
  });
  return ok(toDetail(next, user));
};

export const updateOrderBrief: Handler = ({ req, params, user }) => {
  const order = visibleOrder(user, params.id);
  if (user.role !== 'BRAND') fail(403, 'Only the brand can edit the brief.', 'ROLE_NOT_ALLOWED');
  if (order.status !== 'PENDING_ACCEPTANCE' && order.status !== 'IN_PROGRESS') fail(409, 'The brief can only change before delivery.', 'INVALID_TRANSITION');
  const b = parseBody(briefSchema, req.body);
  const row = getDb().orderBriefs.find((x) => x.orderId === order.id)!;
  Object.assign(row, normaliseBrief(b), { updatedAt: now().toISOString() });
  return ok(toDetail(order, user));
};

/* ---------- Reviews (FR-38) ---------- */

export const reviewOrder: Handler = ({ req, params, user }) => {
  const order = visibleOrder(user, params.id);
  if (user.role !== 'BRAND') fail(403, 'Only the brand can review an order.', 'ROLE_NOT_ALLOWED');
  if (order.status !== 'COMPLETED') fail(409, 'You can review an order once it is completed.', 'ORDER_NOT_COMPLETED');
  if (reviewOf(order.id)) fail(409, 'You already reviewed this order.', 'ALREADY_REVIEWED');
  const body = parseBody(reviewRequestSchema, req.body);
  const row: ReviewRow = {
    id: ulid(now().getTime()),
    orderId: order.id,
    creatorId: order.creatorUserId,
    brandUserId: user.id,
    brandName: brandParty(user.id).name,
    rating: body.rating,
    comment: body.comment || null,
    creatorReply: null,
    repliedAt: null,
    createdAt: now().toISOString(),
  };
  getDb().reviews.push(row);
  return ok(toReview(row), 201);
};

export const replyToReview: Handler = ({ req, params, user }) => {
  const r = getDb().reviews.find((x) => x.id === params.id);
  if (!r || user.role !== 'CREATOR' || r.creatorId !== user.id) fail(404, 'No such review.', 'REVIEW_NOT_FOUND');
  if (r.creatorReply) fail(409, 'You already replied to this review.', 'ALREADY_REPLIED');
  const body = parseBody(replyRequestSchema, req.body);
  r.creatorReply = body.reply;
  r.repliedAt = now().toISOString();
  return ok(toReview(r));
};

/* ---------- Mock-only: Simulate time ---------- */

export const simulateTime: Handler = ({ req }) => {
  const hours = Number((req.body as { hours?: unknown } | undefined)?.hours);
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) fail(422, 'Hours must be a whole number from 1 to 720.', 'VALIDATION_FAILED', [{ field: 'hours', message: '1 to 720.' }]);
  getDb().clockOffsetMs += hours * 3_600_000;
  const jobs = runScheduledJobs();
  return ok({ offsetHours: Math.round(getDb().clockOffsetMs / 3_600_000), now: now().toISOString(), ...jobs });
};

export const getClock: Handler = () => ok({ offsetHours: Math.round(getDb().clockOffsetMs / 3_600_000), now: now().toISOString() });
