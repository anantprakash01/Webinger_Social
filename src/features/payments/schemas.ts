/**
 * Payment rules (v2.0, India / Razorpay), shared by the forms and the mock API, as the backend's Bean
 * Validation will mirror them. Amounts are integer paise.
 */
import { z } from 'zod';

/* ---------- Limits ---------- */
export const MIN_WITHDRAWAL_CENTS = 50_000; // ₹500
export const INSTANT_FEE_BPS = 100; // 1%
export const INSTANT_FEE_MIN_CENTS = 1_000; // ₹10

/** Instant payout fee: 1% of the amount, at least ₹10, rounded half-up to whole paise. */
export const instantFee = (amountCents: number) => Math.max(INSTANT_FEE_MIN_CENTS, Math.floor((amountCents * INSTANT_FEE_BPS + 5_000) / 10_000));

/* ---------- Methods offered at checkout ---------- */
export const NETBANKING_BANKS = [
  { code: 'HDFC', name: 'HDFC Bank' },
  { code: 'ICIC', name: 'ICICI Bank' },
  { code: 'SBIN', name: 'State Bank of India' },
  { code: 'UTIB', name: 'Axis Bank' },
  { code: 'KKBK', name: 'Kotak Mahindra Bank' },
  { code: 'YESB', name: 'Yes Bank' },
] as const;
export const WALLET_APPS = [
  { code: 'paytm', name: 'Paytm' },
  { code: 'phonepe', name: 'PhonePe' },
  { code: 'amazonpay', name: 'Amazon Pay' },
  { code: 'mobikwik', name: 'MobiKwik' },
] as const;

/** UPI ID (VPA): handle@bank. Razorpay's test IDs: success@razorpay pays, failure@razorpay fails. */
export const VPA = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
export const vpaSchema = z.string().trim().toLowerCase().regex(VPA, { error: 'Enter a UPI ID like name@okhdfcbank.' });

export function cardNetwork(number: string): string {
  if (/^4/.test(number)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(number)) return 'Mastercard';
  if (/^(60|65|81|82|508)/.test(number)) return 'RuPay';
  if (/^3[47]/.test(number)) return 'Amex';
  return 'Card';
}

/* ---------- Requests ---------- */
export const paymentSessionRequestSchema = z.object({
  purpose: z.enum(['ORDER']),
  amountCents: z.number().int().min(100),
});

/** Proof from Razorpay Checkout that the order total was authorised (sent with POST /orders). */
export const orderPaymentInputSchema = z.object({
  sessionId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const payoutAccountInputSchema = z
  .object({
    pan: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, { error: 'Enter your 10-character PAN, e.g. ABCDE1234F.' }),
    holderName: z.string().trim().min(2, { error: 'Enter the name on the account.' }).max(100),
    method: z.enum(['BANK_ACCOUNT', 'UPI']),
    accountNumber: z.string().trim().nullable().optional(),
    ifsc: z.string().trim().toUpperCase().nullable().optional(),
    vpa: z.string().trim().toLowerCase().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.method === 'BANK_ACCOUNT') {
      if (!/^[0-9]{9,18}$/.test(v.accountNumber ?? '')) ctx.addIssue({ code: 'custom', path: ['accountNumber'], message: 'Account numbers are 9 to 18 digits.' });
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.ifsc ?? '')) ctx.addIssue({ code: 'custom', path: ['ifsc'], message: 'Enter the 11-character IFSC, e.g. HDFC0001234.' });
    } else if (!VPA.test(v.vpa ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['vpa'], message: 'Enter a UPI ID like name@okaxis.' });
    }
  });
export type PayoutAccountFormInput = z.input<typeof payoutAccountInputSchema>;

export const withdrawalRequestSchema = z.object({
  amountCents: z.number({ error: 'Enter an amount.' }).int().min(MIN_WITHDRAWAL_CENTS, { error: 'The minimum withdrawal is ₹500.' }),
  speed: z.enum(['STANDARD', 'INSTANT']),
});

export const payoutSettingsSchema = z.object({ autoWeekly: z.boolean() });

/* ---------- Mock-only: what the brand does inside Razorpay Checkout ---------- */
export const mockCheckoutSchema = z.object({
  sessionId: z.string().min(1),
  method: z.enum(['UPI', 'CARD', 'NETBANKING', 'WALLET_APP']),
  savedMethodId: z.string().nullable().optional(),
  vpa: z.string().nullable().optional(),
  saveVpa: z.boolean().optional(),
  card: z.object({ number: z.string(), expiry: z.string(), cvc: z.string(), save: z.boolean().optional() }).nullable().optional(),
  bank: z.string().nullable().optional(),
  app: z.string().nullable().optional(),
});
export type MockCheckoutInput = z.input<typeof mockCheckoutSchema>;
