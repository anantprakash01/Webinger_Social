/** Payments and payouts hooks (v2.0, India / Razorpay). */
import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '@/api/client';
import { useAuth } from '@/app/AuthContext';
import { toast } from '@/components/feedback';
import { formatMoney } from '@/lib/money';
import { payWithRazorpay } from '@/lib/razorpay';
import type { OrderPaymentInput, PayoutAccountInput } from '@/types';
import type { PayChoice } from './components/PaymentPicker';

export const paymentKeys = { methods: ['payments', 'methods'] as const, payouts: ['creators', 'me', 'payouts'] as const };

/* ---------- Brand: paying and saved methods ---------- */

export function useSavedMethods() {
  const { user } = useAuth();
  return useQuery({ queryKey: paymentKeys.methods, queryFn: () => api.payments.methods(), enabled: user?.role === 'BRAND' });
}
export function useRemoveSavedMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.payments.removeMethod(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: paymentKeys.methods });
      toast('Payment method removed');
    },
  });
}

/**
 * Pays the order total through Razorpay before the order is created: opens a session for the exact
 * amount, pays it with the brand's chosen method (Razorpay, or the mock's stand-in) and returns the proof
 * that goes with `POST /orders`.
 */
export async function collectOrderPayment(choice: PayChoice, totalCents: number): Promise<OrderPaymentInput> {
  const session = await api.payments.session(totalCents);
  const proof = await payWithRazorpay(session, {
    method: choice.method,
    savedMethodId: choice.savedMethodId,
    vpa: choice.method === 'UPI' ? choice.vpa.trim() : null,
    saveVpa: choice.method === 'UPI' ? choice.saveVpa : false,
    card: choice.method === 'CARD' && !choice.savedMethodId ? { ...choice.card } : null,
    bank: choice.method === 'NETBANKING' ? choice.bank : null,
    app: choice.method === 'WALLET_APP' ? choice.app : null,
  });
  return { sessionId: session.id, ...proof };
}

/* ---------- Creator: payout account, withdrawals, settings ---------- */

export const usePayoutOverview = () => useQuery({ queryKey: paymentKeys.payouts, queryFn: () => api.payouts.balance() });

export function useSavePayoutAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: PayoutAccountInput) => api.payouts.saveAccount(v),
    onSuccess: async (a) => {
      await Promise.all([qc.invalidateQueries({ queryKey: paymentKeys.payouts }), qc.invalidateQueries({ queryKey: ['creators', 'me'] }), api.me.get()]);
      toast(a.status === 'VERIFIED' ? `Payouts will go to ${a.destinationLabel}` : 'We could not verify that account', a.status === 'VERIFIED' ? 'ok' : 'error');
    },
  });
}

export function useWithdraw() {
  const qc = useQueryClient();
  const key = useRef<string | null>(null);
  return useMutation({
    mutationFn: (v: { amountCents: number; speed: 'STANDARD' | 'INSTANT' }) => api.payouts.withdraw(v, (key.current ??= newIdempotencyKey())),
    onSuccess: (p) => {
      key.current = null;
      void qc.invalidateQueries({ queryKey: ['creators', 'me'] });
      toast(`${formatMoney(p.amountCents - p.feeCents)} on its way to ${p.destinationLabel}`);
    },
  });
}

export function usePayoutSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (autoWeekly: boolean) => api.payouts.settings(autoWeekly),
    onSuccess: (o) => {
      qc.setQueryData(paymentKeys.payouts, o);
      toast(o.autoWeekly ? 'Weekly payouts turned on' : 'Weekly payouts turned off. Withdraw whenever you like.');
    },
  });
}
