/** Test helpers for v2.0 payments: pay like the app does (session → Razorpay stand-in → proof). */
import { api } from '@/api/client';
import type { MockCheckoutInput } from '@/features/payments/schemas';
import type { OrderPaymentInput, PayoutAccountInput } from '@/types';

/** For calls expected to fail before the payment is looked at (validation, role, state checks). */
export const UNPAID: OrderPaymentInput = { sessionId: 'unpaid', razorpayPaymentId: 'unpaid', razorpaySignature: 'unpaid' };

/** Pays `totalCents` by UPI (Razorpay's success@razorpay) unless told otherwise. */
export async function payTotal(totalCents: number, how: Omit<MockCheckoutInput, 'sessionId'> = { method: 'UPI', vpa: 'success@razorpay' }): Promise<OrderPaymentInput> {
  const s = await api.payments.session(totalCents);
  const proof = await api.dev.razorpayPay({ ...how, sessionId: s.id });
  return { sessionId: s.id, ...proof };
}

/** Pays the quoted total for a package or a custom-offer price. */
export async function payFor(q: { packageId?: string; creatorUsername?: string; priceCents?: number }): Promise<OrderPaymentInput> {
  return payTotal((await api.orders.quote(q)).totalCents);
}

export const VALID_PAYOUT_ACCOUNT: PayoutAccountInput = { pan: 'ABCDE1234F', holderName: 'Ivy Sandoval', method: 'BANK_ACCOUNT', accountNumber: '50100123456789', ifsc: 'HDFC0001234' };
