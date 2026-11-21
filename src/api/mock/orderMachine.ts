/**
 * Order state machine for the mock (section 4). Mirrors the backend OrderStateMachine exactly:
 * the same states, transitions, guards, error codes and money movements.
 *
 *   [start] --brand pays (card authorised)--> PENDING_ACCEPTANCE
 *   PENDING_ACCEPTANCE --creator accepts (card captured)--> IN_PROGRESS
 *   PENDING_ACCEPTANCE --decline / cancel / 72 h (hold released)--> CLOSED
 *   IN_PROGRESS --creator delivers--> DELIVERED
 *   DELIVERED --revision requested (max 2)--> IN_PROGRESS
 *   DELIVERED --brand approves or 72 h (creator paid)--> COMPLETED
 *   DELIVERED --brand disputes--> DISPUTED
 *   DISPUTED --admin releases--> COMPLETED
 *   DISPUTED --admin refunds (full or partial)--> REFUNDED
 *
 * Every money movement is tied to exactly one transition, and no other code path may move money.
 * The functions here are pure: they take the order and return the next order, the event to append
 * to order_events, the ledger entries and the payment action. The caller (a mock handler) stores them.
 */
import { calculateFees, MIN_PRICE_CENTS, type FeeConfig } from './fees';
import { captureLines, postTxn, refundLines, releaseLines, type LedgerEntry, type LedgerLine } from './ledger';

/* ---------- Types ---------- */

export type OrderStatus =
  | 'PENDING_ACCEPTANCE'
  | 'IN_PROGRESS'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'REFUNDED'
  | 'CLOSED';

export type CloseReason = 'DECLINED' | 'EXPIRED' | 'CANCELED';

export type PaymentStatus = 'AUTHORIZED' | 'CAPTURED' | 'REFUNDED' | 'CANCELED';
export type PaymentMethod = 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET_APP';

/** How the order was paid through Razorpay (v2.0), for display and receipts. */
export interface OrderPaymentInfo {
  method: PaymentMethod;
  methodLabel: string;
}

export interface MockOrder {
  id: string;
  brandUserId: string;
  creatorUserId: string;
  packageId: string | null;
  campaignId: string | null;
  status: OrderStatus;
  closeReason: CloseReason | null;
  currency: string;
  /** Fees are copied onto the order at checkout, so later fee changes never alter it. */
  priceCents: number;
  brandFeeCents: number;
  creatorFeeCents: number;
  brandFeeBps: number;
  creatorFeeBps: number;
  deliveryDays: number;
  acceptBy: string;
  dueAt: string | null;
  reviewBy: string | null;
  revisionCount: number;
  /** Optimistic lock, like the JPA @Version column: approve and auto-approve cannot both win. */
  version: number;
  payment: { status: PaymentStatus; amountCents: number; refundedCents: number } & OrderPaymentInfo;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEvent {
  orderId: string;
  type: OrderEventType | 'CREATE';
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorId: string | null;
  note: string | null;
  at: string;
}

export type OrderEventInput =
  | { type: 'ACCEPT' }
  | { type: 'DECLINE'; note?: string }
  | { type: 'CANCEL'; note?: string }
  | { type: 'EXPIRE' }
  | { type: 'DELIVER' }
  | { type: 'REQUEST_REVISION'; note?: string }
  | { type: 'APPROVE' }
  | { type: 'AUTO_APPROVE' }
  | { type: 'DISPUTE'; note?: string }
  | { type: 'ADMIN_RELEASE'; note?: string }
  | { type: 'ADMIN_REFUND'; refundCents: number; note?: string }
  /** FR-37: an admin cancels an accepted order; the brand gets a full refund. */
  | { type: 'ADMIN_CANCEL'; note?: string };

export type OrderEventType = OrderEventInput['type'];

export type Actor =
  | { kind: 'USER'; userId: string; role: 'BRAND' | 'CREATOR' | 'ADMIN'; emailVerified: boolean }
  | { kind: 'SYSTEM' };

export type PaymentAction = 'AUTHORIZE' | 'CAPTURE' | 'CANCEL' | 'REFUND' | null;

export interface TransitionResult {
  order: MockOrder;
  event: OrderEvent;
  ledger: LedgerEntry[];
  paymentAction: PaymentAction;
}

export interface MachineContext {
  now: Date;
  /** New transaction id for ledger postings. */
  newId: () => string;
}

/** Error with the HTTP status the backend would answer. Handlers turn it into problem+json. */
export class TransitionError extends Error {
  constructor(
    readonly status: 403 | 409 | 422,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TransitionError';
  }
}

/* ---------- Rules ---------- */

export const ACCEPT_WINDOW_HOURS = 72;
export const REVIEW_WINDOW_HOURS = 72;
export const MAX_REVISIONS = 2;
/** A revision request gives the creator at least this many days, even if the original due date has passed. */
export const REVISION_MIN_DAYS = 3;
export const MIN_DELIVERY_DAYS = 1;
export const MAX_DELIVERY_DAYS = 60;

type ActorRole = 'BRAND' | 'CREATOR' | 'ADMIN' | 'SYSTEM';

const RULES: Record<OrderEventType, { from: OrderStatus | OrderStatus[]; to: OrderStatus; by: ActorRole[] }> = {
  ACCEPT: { from: 'PENDING_ACCEPTANCE', to: 'IN_PROGRESS', by: ['CREATOR'] },
  DECLINE: { from: 'PENDING_ACCEPTANCE', to: 'CLOSED', by: ['CREATOR'] },
  CANCEL: { from: 'PENDING_ACCEPTANCE', to: 'CLOSED', by: ['BRAND', 'CREATOR'] },
  EXPIRE: { from: 'PENDING_ACCEPTANCE', to: 'CLOSED', by: ['SYSTEM'] },
  DELIVER: { from: 'IN_PROGRESS', to: 'DELIVERED', by: ['CREATOR'] },
  REQUEST_REVISION: { from: 'DELIVERED', to: 'IN_PROGRESS', by: ['BRAND'] },
  APPROVE: { from: 'DELIVERED', to: 'COMPLETED', by: ['BRAND'] },
  AUTO_APPROVE: { from: 'DELIVERED', to: 'COMPLETED', by: ['SYSTEM'] },
  DISPUTE: { from: 'DELIVERED', to: 'DISPUTED', by: ['BRAND'] },
  ADMIN_RELEASE: { from: 'DISPUTED', to: 'COMPLETED', by: ['ADMIN'] },
  ADMIN_REFUND: { from: 'DISPUTED', to: 'REFUNDED', by: ['ADMIN'] },
  ADMIN_CANCEL: { from: ['IN_PROGRESS', 'DELIVERED'], to: 'REFUNDED', by: ['ADMIN'] },
};

const fromOk = (rule: (typeof RULES)[OrderEventType], s: OrderStatus) => (Array.isArray(rule.from) ? rule.from.includes(s) : rule.from === s);

export const ORDER_EVENT_TYPES = Object.keys(RULES) as OrderEventType[];

const HOUR = 3_600_000;
const addHours = (d: Date, h: number) => new Date(d.getTime() + h * HOUR).toISOString();
const isPast = (iso: string | null, now: Date) => !!iso && now.getTime() >= new Date(iso).getTime();

const roleOf = (a: Actor): ActorRole => (a.kind === 'SYSTEM' ? 'SYSTEM' : a.role);
const actorId = (a: Actor) => (a.kind === 'SYSTEM' ? null : a.userId);

/** Amount the brand paid in total (price + brand fee). */
export const brandTotalCents = (o: Pick<MockOrder, 'priceCents' | 'brandFeeCents'>) => o.priceCents + o.brandFeeCents;
/** Amount the creator receives on release before any partial refund. */
export const creatorPayoutCents = (o: Pick<MockOrder, 'priceCents' | 'creatorFeeCents'>) => o.priceCents - o.creatorFeeCents;

/* ---------- Checks shared by every transition ---------- */

function checkActor(order: MockOrder, rule: (typeof RULES)[OrderEventType], actor: Actor) {
  const role = roleOf(actor);
  if (!rule.by.includes(role)) {
    throw new TransitionError(403, 'ROLE_NOT_ALLOWED', `A ${role.toLowerCase()} cannot do this.`);
  }
  if (actor.kind === 'USER') {
    if (actor.role === 'BRAND' && actor.userId !== order.brandUserId) {
      throw new TransitionError(403, 'NOT_ORDER_PARTICIPANT', 'This order belongs to another brand.');
    }
    if (actor.role === 'CREATOR' && actor.userId !== order.creatorUserId) {
      throw new TransitionError(403, 'NOT_ORDER_PARTICIPANT', 'This order is addressed to another creator.');
    }
  }
}

/** Extra guards per event, beyond "right state, right actor". Return an error or null. */
function guard(order: MockOrder, e: OrderEventInput, actor: Actor, now: Date): TransitionError | null {
  switch (e.type) {
    case 'ACCEPT':
      if (actor.kind === 'USER' && !actor.emailVerified)
        return new TransitionError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before accepting orders.');
      if (isPast(order.acceptBy, now)) return new TransitionError(409, 'ACCEPT_WINDOW_PASSED', 'The 72-hour window to accept has passed.');
      return null;
    case 'EXPIRE':
      return isPast(order.acceptBy, now) ? null : new TransitionError(409, 'NOT_YET_DUE', 'The order can still be accepted.');
    case 'REQUEST_REVISION':
      if (order.revisionCount >= MAX_REVISIONS)
        return new TransitionError(409, 'REVISION_LIMIT', `Only ${MAX_REVISIONS} revisions are included.`);
      return isPast(order.reviewBy, now) ? new TransitionError(409, 'REVIEW_WINDOW_PASSED', 'The 72-hour review window has passed.') : null;
    case 'APPROVE':
    case 'DISPUTE':
      return isPast(order.reviewBy, now)
        ? new TransitionError(409, 'REVIEW_WINDOW_PASSED', 'The 72-hour review window has passed.')
        : null;
    case 'AUTO_APPROVE':
      return isPast(order.reviewBy, now) ? null : new TransitionError(409, 'NOT_YET_DUE', 'The brand still has time to review.');
    case 'ADMIN_REFUND': {
      const total = brandTotalCents(order);
      const r = e.refundCents;
      const full = r === total;
      const partial = Number.isSafeInteger(r) && r > 0 && r <= creatorPayoutCents(order);
      return full || partial
        ? null
        : new TransitionError(
            422,
            'INVALID_REFUND_AMOUNT',
            `Refund the full ${total} cents, or a partial amount from 1 to ${creatorPayoutCents(order)} cents.`,
          );
    }
    default:
      return null;
  }
}

/* ---------- Public API ---------- */

/** Events this actor may fire on this order right now. The UI offers only these (convention 5). */
export function allowedEvents(order: MockOrder, actor: Actor, now: Date): OrderEventType[] {
  return ORDER_EVENT_TYPES.filter((type) => {
    const rule = RULES[type];
    if (!fromOk(rule, order.status)) return false;
    try {
      checkActor(order, rule, actor);
    } catch {
      return false;
    }
    const probe: OrderEventInput = type === 'ADMIN_REFUND' ? { type, refundCents: brandTotalCents(order) } : ({ type } as OrderEventInput);
    return guard(order, probe, actor, now) === null;
  });
}

export function transition(order: MockOrder, e: OrderEventInput, actor: Actor, ctx: MachineContext): TransitionResult {
  const rule = RULES[e.type];
  if (!rule) throw new TransitionError(422, 'UNKNOWN_EVENT', `Unknown order action ${(e as { type: string }).type}.`);
  checkActor(order, rule, actor);
  if (!fromOk(rule, order.status)) {
    throw new TransitionError(
      409,
      'INVALID_TRANSITION',
      `Cannot ${e.type.toLowerCase().replace(/_/g, ' ')} an order that is ${order.status.toLowerCase().replace(/_/g, ' ')}.`,
    );
  }
  const blocked = guard(order, e, actor, ctx.now);
  if (blocked) throw blocked;

  const at = ctx.now.toISOString();
  const next: MockOrder = {
    ...order,
    payment: { ...order.payment },
    status: rule.to,
    version: order.version + 1,
    updatedAt: at,
  };
  let lines: LedgerLine[] | null = null;
  let memo = '';
  let paymentAction: PaymentAction = null;

  switch (e.type) {
    case 'ACCEPT':
      next.dueAt = addHours(ctx.now, order.deliveryDays * 24);
      next.payment.status = 'CAPTURED';
      paymentAction = 'CAPTURE';
      lines = captureLines(brandTotalCents(order));
      memo = 'Payment captured on acceptance';
      break;
    case 'DECLINE':
    case 'CANCEL':
    case 'EXPIRE':
      next.closeReason = e.type === 'DECLINE' ? 'DECLINED' : e.type === 'CANCEL' ? 'CANCELED' : 'EXPIRED';
      // Authorisation released: the brand is never charged and nothing reaches the ledger.
      next.payment.status = 'CANCELED';
      paymentAction = 'CANCEL';
      break;
    case 'DELIVER':
      next.reviewBy = addHours(ctx.now, REVIEW_WINDOW_HOURS);
      break;
    case 'REQUEST_REVISION': {
      next.revisionCount = order.revisionCount + 1;
      next.reviewBy = null;
      const floor = addHours(ctx.now, REVISION_MIN_DAYS * 24);
      next.dueAt = order.dueAt && order.dueAt > floor ? order.dueAt : floor;
      break;
    }
    case 'APPROVE':
    case 'AUTO_APPROVE':
    case 'ADMIN_RELEASE':
      lines = releaseLines({ escrowCents: brandTotalCents(order), creatorPayoutCents: creatorPayoutCents(order) });
      memo = e.type === 'AUTO_APPROVE' ? 'Auto-approved after 72 h' : e.type === 'ADMIN_RELEASE' ? 'Dispute resolved: released' : 'Approved by brand';
      break;
    case 'DISPUTE':
      break;
    case 'ADMIN_REFUND': {
      const total = brandTotalCents(order);
      next.payment.status = 'REFUNDED';
      next.payment.refundedCents = e.refundCents;
      paymentAction = 'REFUND';
      if (e.refundCents === total) {
        lines = refundLines(total);
        memo = 'Dispute resolved: full refund';
      } else {
        // Partial refund comes out of the creator's share; the remainder follows the release rule (step 4).
        // Provisional rule until the fee policy for partial refunds is decided (section 16).
        lines = [
          ...refundLines(e.refundCents),
          ...releaseLines({
            escrowCents: total - e.refundCents,
            creatorPayoutCents: creatorPayoutCents(order) - e.refundCents,
          }),
        ];
        memo = 'Dispute resolved: partial refund';
      }
      break;
    }
    case 'ADMIN_CANCEL': {
      const total = brandTotalCents(order);
      next.payment.status = 'REFUNDED';
      next.payment.refundedCents = total;
      paymentAction = 'REFUND';
      lines = refundLines(total);
      memo = 'Cancelled by admin: full refund';
      break;
    }
  }

  const ledger = lines ? postTxn(lines, { txnId: ctx.newId(), orderId: order.id, memo, at }) : [];
  const note = 'note' in e ? (e.note ?? null) : null;
  return {
    order: next,
    event: { orderId: order.id, type: e.type, fromStatus: order.status, toStatus: next.status, actorId: actorId(actor), note, at },
    ledger,
    paymentAction,
  };
}

export interface NewOrderInput {
  id: string;
  creatorUserId: string;
  packageId?: string | null;
  campaignId?: string | null;
  priceCents: number;
  deliveryDays: number;
  currency?: string;
  fees: FeeConfig;
  /** Defaults to a card payment (seed data and older callers). */
  payment?: OrderPaymentInfo;
}

export const DEFAULT_PAYMENT: OrderPaymentInfo = { method: 'CARD', methodLabel: 'Visa •••• 1111' };

/** Checkout (FR-30): payment authorised, not captured. Fees are copied onto the order (section 4.2). */
export function createOrder(input: NewOrderInput, actor: Actor, ctx: Pick<MachineContext, 'now'>): { order: MockOrder; event: OrderEvent; paymentAction: PaymentAction } {
  if (actor.kind !== 'USER' || actor.role !== 'BRAND') throw new TransitionError(403, 'ROLE_NOT_ALLOWED', 'Only brands can place orders.');
  if (!actor.emailVerified) throw new TransitionError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before placing orders.');
  if (!Number.isSafeInteger(input.priceCents) || input.priceCents < MIN_PRICE_CENTS)
    throw new TransitionError(422, 'PRICE_TOO_LOW', 'The minimum price is ₹500.');
  if (!Number.isInteger(input.deliveryDays) || input.deliveryDays < MIN_DELIVERY_DAYS || input.deliveryDays > MAX_DELIVERY_DAYS)
    throw new TransitionError(422, 'INVALID_DELIVERY_DAYS', 'Delivery must be between 1 and 60 days.');

  const f = calculateFees(input.priceCents, input.fees);
  const at = ctx.now.toISOString();
  const order: MockOrder = {
    id: input.id,
    brandUserId: actor.userId,
    creatorUserId: input.creatorUserId,
    packageId: input.packageId ?? null,
    campaignId: input.campaignId ?? null,
    status: 'PENDING_ACCEPTANCE',
    closeReason: null,
    currency: input.currency ?? 'INR',
    priceCents: f.priceCents,
    brandFeeCents: f.brandFeeCents,
    creatorFeeCents: f.creatorFeeCents,
    brandFeeBps: input.fees.brandFeeBps,
    creatorFeeBps: input.fees.creatorFeeBps,
    deliveryDays: input.deliveryDays,
    acceptBy: addHours(ctx.now, ACCEPT_WINDOW_HOURS),
    dueAt: null,
    reviewBy: null,
    revisionCount: 0,
    version: 0,
    payment: { status: 'AUTHORIZED', amountCents: f.brandTotalCents, refundedCents: 0, ...(input.payment ?? DEFAULT_PAYMENT) },
    createdAt: at,
    updatedAt: at,
  };
  return {
    order,
    event: { orderId: order.id, type: 'CREATE', fromStatus: null, toStatus: 'PENDING_ACCEPTANCE', actorId: actor.userId, note: null, at },
    paymentAction: 'AUTHORIZE',
  };
}

/**
 * Scheduled jobs (section 4.3) as one pure step: which system events are due for this order now.
 * Used by "Simulate time" in the admin demo controls.
 */
export function dueSystemEvent(order: MockOrder, now: Date): 'EXPIRE' | 'AUTO_APPROVE' | null {
  if (order.status === 'PENDING_ACCEPTANCE' && isPast(order.acceptBy, now)) return 'EXPIRE';
  if (order.status === 'DELIVERED' && isPast(order.reviewBy, now)) return 'AUTO_APPROVE';
  return null;
}
