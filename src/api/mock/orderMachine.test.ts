import { describe, expect, it } from 'vitest';
import { DEFAULT_FEES } from './fees';
import { accountBalance, findUnbalancedTxns, type LedgerEntry } from './ledger';
import {
  allowedEvents,
  createOrder,
  dueSystemEvent,
  transition,
  TransitionError,
  type Actor,
  type MockOrder,
  type OrderEventInput,
  type OrderStatus,
} from './orderMachine';

const T0 = new Date('2026-11-20T10:00:00.000Z');
const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000);

const brand: Actor = { kind: 'USER', userId: 'B1', role: 'BRAND', emailVerified: true };
const otherBrand: Actor = { kind: 'USER', userId: 'B2', role: 'BRAND', emailVerified: true };
const creator: Actor = { kind: 'USER', userId: 'C1', role: 'CREATOR', emailVerified: true };
const otherCreator: Actor = { kind: 'USER', userId: 'C2', role: 'CREATOR', emailVerified: true };
const admin: Actor = { kind: 'USER', userId: 'A1', role: 'ADMIN', emailVerified: true };
const system: Actor = { kind: 'SYSTEM' };

let txn = 0;
const ctx = (now: Date = T0) => ({ now, newId: () => `T${++txn}` });

/** A fresh $200 order with default fees, placed at T0. */
function newOrder(): MockOrder {
  return createOrder({ id: 'O1', creatorUserId: 'C1', priceCents: 20_000, deliveryDays: 5, fees: DEFAULT_FEES }, brand, ctx()).order;
}

/** Runs a list of [event, actor, hoursAfterT0] and collects the ledger. */
function run(steps: Array<[OrderEventInput, Actor, number?]>) {
  let order = newOrder();
  const ledger: LedgerEntry[] = [];
  for (const [e, a, h = 0] of steps) {
    const r = transition(order, e, a, ctx(hours(h)));
    order = r.order;
    ledger.push(...r.ledger);
  }
  return { order, ledger };
}

function expectError(fn: () => unknown, status: number, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(TransitionError);
    expect((e as TransitionError).status).toBe(status);
    expect((e as TransitionError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${status} ${code}`);
}

describe('createOrder (checkout, FR-30)', () => {
  it('authorises price + brand fee and copies fees onto the order', () => {
    const o = newOrder();
    expect(o.status).toBe('PENDING_ACCEPTANCE');
    expect(o.priceCents).toBe(20_000);
    expect(o.brandFeeCents).toBe(2_000);
    expect(o.creatorFeeCents).toBe(3_000);
    expect(o.brandFeeBps).toBe(1000);
    expect(o.creatorFeeBps).toBe(1500);
    expect(o.payment).toEqual({ status: 'AUTHORIZED', amountCents: 22_000, refundedCents: 0 });
    expect(o.acceptBy).toBe(hours(72).toISOString());
  });

  it('only verified brands can order (FR-02)', () => {
    const input = { id: 'O', creatorUserId: 'C1', priceCents: 20_000, deliveryDays: 5, fees: DEFAULT_FEES };
    expectError(() => createOrder(input, creator, ctx()), 403, 'ROLE_NOT_ALLOWED');
    expectError(() => createOrder(input, { ...brand, emailVerified: false } as Actor, ctx()), 403, 'EMAIL_NOT_VERIFIED');
  });

  it('validates price and delivery days (FR-12)', () => {
    const base = { id: 'O', creatorUserId: 'C1', priceCents: 20_000, deliveryDays: 5, fees: DEFAULT_FEES };
    expectError(() => createOrder({ ...base, priceCents: 999 }, brand, ctx()), 422, 'PRICE_TOO_LOW');
    expectError(() => createOrder({ ...base, priceCents: 1500.5 }, brand, ctx()), 422, 'PRICE_TOO_LOW');
    expectError(() => createOrder({ ...base, deliveryDays: 0 }, brand, ctx()), 422, 'INVALID_DELIVERY_DAYS');
    expectError(() => createOrder({ ...base, deliveryDays: 61 }, brand, ctx()), 422, 'INVALID_DELIVERY_DAYS');
    expect(createOrder({ ...base, priceCents: 1_000, deliveryDays: 60 }, brand, ctx()).order.status).toBe('PENDING_ACCEPTANCE');
  });
});

describe('PENDING_ACCEPTANCE', () => {
  it('ACCEPT → IN_PROGRESS, captures the card into escrow, sets due date', () => {
    const { order, ledger } = run([[{ type: 'ACCEPT' }, creator, 1]]);
    expect(order.status).toBe('IN_PROGRESS');
    expect(order.payment.status).toBe('CAPTURED');
    expect(order.dueAt).toBe(hours(1 + 5 * 24).toISOString());
    expect(accountBalance(ledger, 'ESCROW')).toBe(22_000);
    expect(accountBalance(ledger, 'BRAND_CHARGE')).toBe(-22_000);
    expect(order.version).toBe(1);
  });

  it.each([
    ['DECLINE', creator, 'DECLINED'],
    ['CANCEL', brand, 'CANCELED'],
    ['CANCEL', creator, 'CANCELED'],
  ] as const)('%s by %s → CLOSED (%s), hold released, no ledger', (type, actor, reason) => {
    const r = transition(newOrder(), { type } as OrderEventInput, actor, ctx());
    expect(r.order.status).toBe('CLOSED');
    expect(r.order.closeReason).toBe(reason);
    expect(r.order.payment.status).toBe('CANCELED');
    expect(r.paymentAction).toBe('CANCEL');
    expect(r.ledger).toEqual([]);
  });

  it('EXPIRE only after 72 h (FR-32)', () => {
    expectError(() => transition(newOrder(), { type: 'EXPIRE' }, system, ctx(hours(71))), 409, 'NOT_YET_DUE');
    const r = transition(newOrder(), { type: 'EXPIRE' }, system, ctx(hours(72)));
    expect(r.order.status).toBe('CLOSED');
    expect(r.order.closeReason).toBe('EXPIRED');
    expect(r.order.payment.status).toBe('CANCELED');
  });

  it('cannot accept after the window, nor without a verified email', () => {
    expectError(() => transition(newOrder(), { type: 'ACCEPT' }, creator, ctx(hours(72))), 409, 'ACCEPT_WINDOW_PASSED');
    expectError(() => transition(newOrder(), { type: 'ACCEPT' }, { ...creator, emailVerified: false } as Actor, ctx()), 403, 'EMAIL_NOT_VERIFIED');
  });

  it('enforces role and ownership', () => {
    expectError(() => transition(newOrder(), { type: 'ACCEPT' }, brand, ctx()), 403, 'ROLE_NOT_ALLOWED');
    expectError(() => transition(newOrder(), { type: 'ACCEPT' }, otherCreator, ctx()), 403, 'NOT_ORDER_PARTICIPANT');
    expectError(() => transition(newOrder(), { type: 'CANCEL' }, otherBrand, ctx()), 403, 'NOT_ORDER_PARTICIPANT');
    expectError(() => transition(newOrder(), { type: 'EXPIRE' }, admin, ctx(hours(80))), 403, 'ROLE_NOT_ALLOWED');
  });
});

describe('IN_PROGRESS and DELIVERED', () => {
  const delivered = (): Array<[OrderEventInput, Actor, number?]> => [
    [{ type: 'ACCEPT' }, creator, 1],
    [{ type: 'DELIVER' }, creator, 48],
  ];

  it('DELIVER → DELIVERED with a 72 h review window', () => {
    const { order } = run(delivered());
    expect(order.status).toBe('DELIVERED');
    expect(order.reviewBy).toBe(hours(48 + 72).toISOString());
  });

  it('APPROVE → COMPLETED, creator gets price − creator fee, platform both fees', () => {
    const { order, ledger } = run([...delivered(), [{ type: 'APPROVE' }, brand, 50]]);
    expect(order.status).toBe('COMPLETED');
    expect(accountBalance(ledger, 'ESCROW')).toBe(0);
    expect(accountBalance(ledger, 'CREATOR_BALANCE')).toBe(17_000);
    expect(accountBalance(ledger, 'PLATFORM_REVENUE')).toBe(5_000);
    expect(findUnbalancedTxns(ledger)).toEqual([]);
  });

  it('AUTO_APPROVE only after 72 h without brand action (FR-36)', () => {
    let { order } = run(delivered());
    expectError(() => transition(order, { type: 'AUTO_APPROVE' }, system, ctx(hours(48 + 71))), 409, 'NOT_YET_DUE');
    const r = transition(order, { type: 'AUTO_APPROVE' }, system, ctx(hours(48 + 72)));
    order = r.order;
    expect(order.status).toBe('COMPLETED');
    expect(accountBalance(r.ledger, 'CREATOR_BALANCE')).toBe(17_000);
  });

  it('brand cannot approve, dispute or ask for revision after the window', () => {
    const { order } = run(delivered());
    for (const type of ['APPROVE', 'DISPUTE', 'REQUEST_REVISION'] as const) {
      expectError(() => transition(order, { type }, brand, ctx(hours(48 + 72))), 409, 'REVIEW_WINDOW_PASSED');
    }
  });

  it('REQUEST_REVISION → IN_PROGRESS, max 2 (FR-35)', () => {
    const { order } = run([
      ...delivered(),
      [{ type: 'REQUEST_REVISION' }, brand, 50],
      [{ type: 'DELIVER' }, creator, 60],
      [{ type: 'REQUEST_REVISION' }, brand, 61],
      [{ type: 'DELIVER' }, creator, 70],
    ]);
    expect(order.revisionCount).toBe(2);
    expect(order.status).toBe('DELIVERED');
    expectError(() => transition(order, { type: 'REQUEST_REVISION' }, brand, ctx(hours(71))), 409, 'REVISION_LIMIT');
    expect(allowedEvents(order, brand, hours(71))).toEqual(['APPROVE', 'DISPUTE']);
  });

  it('DISPUTE → DISPUTED, money stays in escrow', () => {
    const { order, ledger } = run([...delivered(), [{ type: 'DISPUTE', note: 'Wrong product shown' }, brand, 50]]);
    expect(order.status).toBe('DISPUTED');
    expect(accountBalance(ledger, 'ESCROW')).toBe(22_000);
  });
});

describe('DISPUTED (admin)', () => {
  const disputed = (): Array<[OrderEventInput, Actor, number?]> => [
    [{ type: 'ACCEPT' }, creator, 1],
    [{ type: 'DELIVER' }, creator, 48],
    [{ type: 'DISPUTE' }, brand, 50],
  ];

  it('ADMIN_RELEASE → COMPLETED and pays the creator', () => {
    const { order, ledger } = run([...disputed(), [{ type: 'ADMIN_RELEASE' }, admin, 60]]);
    expect(order.status).toBe('COMPLETED');
    expect(accountBalance(ledger, 'CREATOR_BALANCE')).toBe(17_000);
  });

  it('ADMIN_REFUND full → REFUNDED, everything back to the brand', () => {
    const { order, ledger } = run([...disputed(), [{ type: 'ADMIN_REFUND', refundCents: 22_000 }, admin, 60]]);
    expect(order.status).toBe('REFUNDED');
    expect(order.payment).toMatchObject({ status: 'REFUNDED', refundedCents: 22_000 });
    expect(accountBalance(ledger, 'ESCROW')).toBe(0);
    expect(accountBalance(ledger, 'BRAND_CHARGE')).toBe(0);
    expect(accountBalance(ledger, 'CREATOR_BALANCE')).toBe(0);
    expect(accountBalance(ledger, 'PLATFORM_REVENUE')).toBe(0);
  });

  it('ADMIN_REFUND partial: refund out of the creator share, rest released', () => {
    const { order, ledger } = run([...disputed(), [{ type: 'ADMIN_REFUND', refundCents: 7_000 }, admin, 60]]);
    expect(order.status).toBe('REFUNDED');
    expect(accountBalance(ledger, 'ESCROW')).toBe(0);
    expect(accountBalance(ledger, 'BRAND_CHARGE')).toBe(-15_000);
    expect(accountBalance(ledger, 'CREATOR_BALANCE')).toBe(10_000);
    expect(accountBalance(ledger, 'PLATFORM_REVENUE')).toBe(5_000);
    expect(findUnbalancedTxns(ledger)).toEqual([]);
  });

  it('rejects refund amounts outside the allowed range', () => {
    const { order } = run(disputed());
    for (const refundCents of [0, -1, 17_001, 21_999, 22_001, 100.5]) {
      expectError(() => transition(order, { type: 'ADMIN_REFUND', refundCents }, admin, ctx(hours(60))), 422, 'INVALID_REFUND_AMOUNT');
    }
  });

  it('only admins resolve disputes', () => {
    const { order } = run(disputed());
    expectError(() => transition(order, { type: 'ADMIN_RELEASE' }, brand, ctx(hours(60))), 403, 'ROLE_NOT_ALLOWED');
  });
});

describe('invalid transitions return 409', () => {
  const states: Record<Exclude<OrderStatus, 'PENDING_ACCEPTANCE'>, Array<[OrderEventInput, Actor, number?]>> = {
    IN_PROGRESS: [[{ type: 'ACCEPT' }, creator, 1]],
    DELIVERED: [
      [{ type: 'ACCEPT' }, creator, 1],
      [{ type: 'DELIVER' }, creator, 2],
    ],
    COMPLETED: [
      [{ type: 'ACCEPT' }, creator, 1],
      [{ type: 'DELIVER' }, creator, 2],
      [{ type: 'APPROVE' }, brand, 3],
    ],
    DISPUTED: [
      [{ type: 'ACCEPT' }, creator, 1],
      [{ type: 'DELIVER' }, creator, 2],
      [{ type: 'DISPUTE' }, brand, 3],
    ],
    REFUNDED: [
      [{ type: 'ACCEPT' }, creator, 1],
      [{ type: 'DELIVER' }, creator, 2],
      [{ type: 'DISPUTE' }, brand, 3],
      [{ type: 'ADMIN_REFUND', refundCents: 22_000 }, admin, 4],
    ],
    CLOSED: [[{ type: 'DECLINE' }, creator, 1]],
  };

  it.each(Object.entries(states))('%s rejects actions from other states', (_state, steps) => {
    const { order } = run(steps);
    const wrong: Array<[OrderEventInput, Actor]> = [
      [{ type: 'ACCEPT' }, creator],
      [{ type: 'DECLINE' }, creator],
      [{ type: 'CANCEL' }, brand],
      [{ type: 'DELIVER' }, creator],
      [{ type: 'APPROVE' }, brand],
      [{ type: 'ADMIN_RELEASE' }, admin],
    ];
    const allowed = allowedEvents(order, creator, hours(5)).concat(allowedEvents(order, brand, hours(5)), allowedEvents(order, admin, hours(5)));
    for (const [e, a] of wrong) {
      if (allowed.includes(e.type)) continue;
      expectError(() => transition(order, e, a, ctx(hours(5))), 409, 'INVALID_TRANSITION');
    }
  });

  it('terminal states allow nothing', () => {
    for (const s of ['COMPLETED', 'REFUNDED', 'CLOSED'] as const) {
      const { order } = run(states[s]);
      for (const a of [brand, creator, admin, system]) expect(allowedEvents(order, a, hours(500))).toEqual([]);
    }
  });
});

describe('allowedEvents and dueSystemEvent', () => {
  it('lists what each side may do on a new order', () => {
    const o = newOrder();
    expect(allowedEvents(o, creator, T0)).toEqual(['ACCEPT', 'DECLINE', 'CANCEL']);
    expect(allowedEvents(o, brand, T0)).toEqual(['CANCEL']);
    expect(allowedEvents(o, otherBrand, T0)).toEqual([]);
    expect(allowedEvents(o, system, T0)).toEqual([]);
    expect(allowedEvents(o, system, hours(72))).toEqual(['EXPIRE']);
  });

  it('reports due scheduled jobs', () => {
    expect(dueSystemEvent(newOrder(), hours(10))).toBeNull();
    expect(dueSystemEvent(newOrder(), hours(72))).toBe('EXPIRE');
    const { order } = run([
      [{ type: 'ACCEPT' }, creator, 1],
      [{ type: 'DELIVER' }, creator, 2],
    ]);
    expect(dueSystemEvent(order, hours(73))).toBe(null);
    expect(dueSystemEvent(order, hours(74))).toBe('AUTO_APPROVE');
  });

  it('does not mutate the input order', () => {
    const o = newOrder();
    const copy = structuredClone(o);
    transition(o, { type: 'ACCEPT' }, creator, ctx());
    expect(o).toEqual(copy);
  });
});
