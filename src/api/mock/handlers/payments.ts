/**
 * Payments mock (v2.0, India / Razorpay).
 *
 * Real flow: server opens a Razorpay order (`POST /payments/sessions`) → brand pays in Razorpay Checkout
 * (UPI, card, netbanking or a wallet app) → Checkout returns payment id + signature → the app sends them
 * with the order → the server verifies the HMAC signature and the amount, then creates the order with
 * the payment authorised. It is captured when the creator accepts.
 *
 * The mock plays Razorpay's part with `POST /dev/razorpay/pay` (mock-only), which validates what the
 * brand entered, applies Razorpay's test outcomes (failure@razorpay, the decline card) and returns a
 * payment id and signature. Card numbers never leave that call: only network and last four digits are kept.
 */
import { mockCardSchema, DECLINE_TEST_CARD } from '@/features/orders/schemas';
import { cardNetwork, mockCheckoutSchema, NETBANKING_BANKS, orderPaymentInputSchema, paymentSessionRequestSchema, VPA, WALLET_APPS } from '@/features/payments/schemas';
import type { PaymentSession, SavedPaymentMethod } from '@/types';
import { getDb, now, randomToken, ulid, type PaymentSessionRow, type SavedMethodRow, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';
import type { OrderPaymentInfo } from '../orderMachine';

const SESSION_TTL_MS = 30 * 60_000;
const KEY_ID = 'rzp_test_mockkey';

function requireBrand(user: UserRow) {
  if (user.role !== 'BRAND') fail(403, 'Only brand accounts can pay.', 'ROLE_NOT_ALLOWED');
}

/** Stand-in for HMAC-SHA256(order_id|payment_id, key_secret). The backend uses the real HMAC. */
const sign = (razorpayOrderId: string, paymentId: string) => `mock_hmac_${[...`${razorpayOrderId}|${paymentId}`].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381).toString(16)}`;

const toSession = (s: PaymentSessionRow): PaymentSession => ({
  id: s.id,
  purpose: s.purpose,
  amountCents: s.amountCents,
  currency: 'INR',
  razorpayOrderId: s.razorpayOrderId,
  razorpayKeyId: KEY_ID,
  expiresAt: s.expiresAt,
});

export const createPaymentSession: Handler = ({ req, user }) => {
  requireBrand(user);
  const body = parseBody(paymentSessionRequestSchema, req.body);
  const t = now();
  const row: PaymentSessionRow = {
    id: `ps_${ulid(t.getTime()).toLowerCase()}`,
    userId: user.id,
    purpose: body.purpose,
    amountCents: body.amountCents,
    razorpayOrderId: `order_mock${randomToken(7)}`,
    createdAt: t.toISOString(),
    expiresAt: new Date(t.getTime() + SESSION_TTL_MS).toISOString(),
    payment: null,
    usedBy: null,
  };
  getDb().paymentSessions.push(row);
  return ok(toSession(row), 201);
};

/* ---------- Mock-only: the brand paying inside Razorpay Checkout ---------- */

export const mockRazorpayPay: Handler = ({ req, user }) => {
  requireBrand(user);
  const body = parseBody(mockCheckoutSchema, req.body);
  const db = getDb();
  const s = db.paymentSessions.find((x) => x.id === body.sessionId && x.userId === user.id);
  if (!s) fail(404, 'Payment session not found.', 'NOT_FOUND');
  if (s.payment || s.usedBy) fail(409, 'This payment was already made.', 'SESSION_USED');
  if (s.expiresAt < now().toISOString()) fail(409, 'The payment window expired. Please try again.', 'SESSION_EXPIRED');

  let label = '';
  const saved = body.savedMethodId ? db.savedMethods.find((m) => m.id === body.savedMethodId && m.userId === user.id) : null;
  if (body.savedMethodId && !saved) fail(404, 'Saved payment method not found.', 'NOT_FOUND');

  switch (body.method) {
    case 'UPI': {
      const vpa = (saved?.vpa ?? body.vpa ?? '').trim().toLowerCase();
      if (!VPA.test(vpa)) fail(422, 'Enter a valid UPI ID.', 'VALIDATION_FAILED', [{ field: 'vpa', message: 'Enter a UPI ID like name@okhdfcbank.' }]);
      if (vpa === 'failure@razorpay') fail(402, 'The payment was declined in the UPI app. Try again or use another method.', 'PAYMENT_FAILED');
      if (body.saveVpa && !saved && !db.savedMethods.some((m) => m.userId === user.id && m.vpa === vpa))
        db.savedMethods.push({ id: `token_mock${randomToken(6)}`, userId: user.id, type: 'UPI', network: null, last4: null, expiry: null, vpa, createdAt: now().toISOString() });
      label = `UPI · ${vpa}`;
      break;
    }
    case 'CARD': {
      if (saved) {
        label = `${saved.network} •••• ${saved.last4}`;
        break;
      }
      const r = mockCardSchema.safeParse(body.card ?? {});
      if (!r.success) fail(422, 'Check the card details.', 'VALIDATION_FAILED', r.error.issues.map((i) => ({ field: `card.${String(i.path[0])}`, message: i.message })));
      if (r.data.number === DECLINE_TEST_CARD) fail(402, 'Your card was declined by the bank. Try another card or UPI.', 'PAYMENT_FAILED');
      const network = cardNetwork(r.data.number);
      const last4 = r.data.number.slice(-4);
      const [mm, yy] = r.data.expiry.split('/').map((x) => x.trim());
      if (body.card?.save && !db.savedMethods.some((m) => m.userId === user.id && m.last4 === last4 && m.network === network))
        db.savedMethods.push({ id: `token_mock${randomToken(6)}`, userId: user.id, type: 'CARD', network, last4, expiry: `${mm}/${yy}`, vpa: null, createdAt: now().toISOString() });
      label = `${network} •••• ${last4}`;
      break;
    }
    case 'NETBANKING': {
      const bank = NETBANKING_BANKS.find((b) => b.code === body.bank);
      if (!bank) fail(422, 'Choose your bank.', 'VALIDATION_FAILED', [{ field: 'bank', message: 'Choose your bank.' }]);
      label = `${bank.name} netbanking`;
      break;
    }
    case 'WALLET_APP': {
      const app = WALLET_APPS.find((a) => a.code === body.app);
      if (!app) fail(422, 'Choose a wallet.', 'VALIDATION_FAILED', [{ field: 'app', message: 'Choose a wallet.' }]);
      label = `${app.name} wallet`;
      break;
    }
  }
  const paymentId = `pay_mock${randomToken(7)}`;
  s.payment = { id: paymentId, signature: sign(s.razorpayOrderId, paymentId), method: body.method, methodLabel: label, status: 'AUTHORIZED' };
  return ok({ razorpayPaymentId: paymentId, razorpaySignature: s.payment.signature });
};

/* ---------- Order payments (used by POST /orders and POST /applications/{id}/accept) ---------- */

/**
 * Verifies Checkout's proof for a session of exactly `totalCents` before the order exists, so a failed or
 * forged payment never creates one. Returns what the order records, and `commit` to call with the order id.
 */
export function resolveOrderPayment(user: UserRow, raw: unknown, totalCents: number): { info: OrderPaymentInfo; commit: (orderId: string) => void } {
  const r = orderPaymentInputSchema.safeParse(raw);
  if (!r.success) fail(422, 'Complete the payment first.', 'VALIDATION_FAILED', [{ field: 'payment', message: 'Complete the payment first.' }]);
  const p = r.data;
  const s = getDb().paymentSessions.find((x) => x.id === p.sessionId && x.userId === user.id && x.purpose === 'ORDER');
  if (!s) fail(404, 'Payment session not found.', 'NOT_FOUND');
  if (s.usedBy) fail(409, 'This payment was already used.', 'SESSION_USED');
  if (!s.payment || s.payment.id !== p.razorpayPaymentId || p.razorpaySignature !== sign(s.razorpayOrderId, p.razorpayPaymentId))
    fail(402, 'We could not verify the payment. You have not been charged; please try again.', 'PAYMENT_FAILED');
  if (s.amountCents !== totalCents)
    fail(409, 'The price changed after you started paying. Your payment will be released; please review the new total and pay again.', 'AMOUNT_MISMATCH');
  return {
    info: { method: s.payment.method, methodLabel: s.payment.methodLabel },
    commit: (orderId) => {
      s.usedBy = orderId;
    },
  };
}

/* ---------- Saved methods ---------- */

const toSaved = (m: SavedMethodRow): SavedPaymentMethod => ({
  id: m.id,
  type: m.type,
  label: m.type === 'CARD' ? `${m.network} •••• ${m.last4}` : m.vpa!,
  network: m.network,
  last4: m.last4,
  expiry: m.expiry,
  vpa: m.vpa,
  createdAt: m.createdAt,
});

export const listPaymentMethods: Handler = ({ user }) => {
  requireBrand(user);
  return ok({ content: getDb().savedMethods.filter((m) => m.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toSaved) });
};

export const deletePaymentMethod: Handler = ({ params, user }) => {
  requireBrand(user);
  const db = getDb();
  const i = db.savedMethods.findIndex((m) => m.id === params.id && m.userId === user.id);
  if (i < 0) fail(404, 'Saved payment method not found.', 'NOT_FOUND');
  db.savedMethods.splice(i, 1);
  return { status: 204, body: undefined };
};
