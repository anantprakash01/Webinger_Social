/**
 * Paying through Razorpay (v2.0). The app renders its own method picker (UPI, card, netbanking, wallet
 * app) and hands the details to Razorpay, so card data never touches our servers:
 *
 * - http mode: Razorpay Custom Checkout (`razorpay.js`, `createPayment`) sends the details straight to
 *   Razorpay and resolves with the payment id and signature. UPI and card OTP steps happen in Razorpay's
 *   own popup or the customer's UPI app. (Phase 1: check option names against Razorpay's current docs.)
 * - mock mode: `POST /dev/razorpay/pay` plays Razorpay's part and returns the same two values.
 */
import { api, isMock } from '@/api/client';
import type { MockCheckoutInput } from '@/features/payments/schemas';
import type { PaymentSession } from '@/types';

export interface RazorpayResult {
  razorpayPaymentId: string;
  razorpaySignature: string;
}

interface RazorpayInstance {
  createPayment(data: Record<string, unknown>): void;
  on(event: 'payment.success' | 'payment.error', cb: (r: Record<string, unknown>) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (opts: { key: string }) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/razorpay.js';
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load the payment form. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Pays a session with the method details the brand chose. Throws ApiError / Error on failure. */
export async function payWithRazorpay(session: PaymentSession, details: Omit<MockCheckoutInput, 'sessionId'>): Promise<RazorpayResult> {
  if (isMock) return api.dev.razorpayPay({ ...details, sessionId: session.id });
  await loadScript();
  const rzp = new window.Razorpay!({ key: session.razorpayKeyId });
  const data: Record<string, unknown> = { amount: session.amountCents, currency: session.currency, order_id: session.razorpayOrderId, method: details.method.toLowerCase() };
  if (details.method === 'UPI') data.vpa = details.vpa;
  if (details.method === 'NETBANKING') data.bank = details.bank;
  if (details.method === 'WALLET_APP') {
    data.method = 'wallet';
    data.wallet = details.app;
  }
  if (details.method === 'CARD' && details.savedMethodId) data.token = details.savedMethodId;
  if (details.method === 'CARD' && details.card) {
    const [mm, yy] = details.card.expiry.split('/').map((x) => x.trim());
    Object.assign(data, { 'card[number]': details.card.number.replace(/\s+/g, ''), 'card[expiry_month]': mm, 'card[expiry_year]': yy, 'card[cvv]': details.card.cvc, save: details.card.save ? 1 : 0 });
  }
  return new Promise((resolve, reject) => {
    rzp.on('payment.success', (r) => resolve({ razorpayPaymentId: String(r.razorpay_payment_id), razorpaySignature: String(r.razorpay_signature) }));
    rzp.on('payment.error', (r) => reject(new Error(String((r.error as { description?: string } | undefined)?.description ?? 'The payment failed. Try again or use another method.'))));
    rzp.createPayment(data);
  });
}
