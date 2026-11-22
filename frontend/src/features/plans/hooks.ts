/** Brand plan hooks (FR-66, v3.2). */
import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '@/api/client';
import { useAuth } from '@/app/AuthContext';
import { toast } from '@/components/feedback';
import { payWithRazorpay } from '@/lib/razorpay';
import type { BillingCycle, BrandPlan } from '@/lib/plans';
import type { OrderPaymentInput } from '@/types';
import type { PayChoice } from '@/features/payments/components/PaymentPicker';

export const planKeys = { subscription: ['brands', 'subscription'] as const, offers: ['fees', 'current'] as const };

export function useSubscription() {
  const { user } = useAuth();
  return useQuery({ queryKey: planKeys.subscription, queryFn: () => api.brands.subscription(), enabled: user?.role === 'BRAND' });
}

/** Public plan list with prices and current fees (GET /fees). */
export const usePlanOffers = () => useQuery({ queryKey: planKeys.offers, queryFn: () => api.fees.current(), staleTime: 60_000 });

/** Pays a plan charge through Razorpay (session purpose SUBSCRIPTION) and returns the proof. */
async function collectPlanPayment(choice: PayChoice, totalCents: number): Promise<OrderPaymentInput> {
  const session = await api.payments.session(totalCents, 'SUBSCRIPTION');
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

export function useChangePlan() {
  const qc = useQueryClient();
  const key = useRef<string | null>(null);
  return useMutation({
    mutationFn: async (v: { plan: BrandPlan; cycle: BillingCycle; pay?: { choice: PayChoice; totalCents: number } }) => {
      key.current ??= newIdempotencyKey();
      const payment = v.pay ? await collectPlanPayment(v.pay.choice, v.pay.totalCents) : null;
      return api.brands.changeSubscription({ plan: v.plan, cycle: v.cycle, payment }, key.current);
    },
    onSuccess: (s) => {
      key.current = null;
      qc.setQueryData(planKeys.subscription, s);
      void qc.invalidateQueries({ queryKey: ['brands'] });
      void qc.invalidateQueries({ queryKey: ['chat'] });
    },
    onError: () => {
      key.current = null;
    },
  });
}

export function useCancelPlan() {
  const qc = useQueryClient();
  return {
    cancel: useMutation({
      mutationFn: () => api.brands.cancelSubscription(),
      onSuccess: (s) => {
        qc.setQueryData(planKeys.subscription, s);
        toast('Your plan will end at the close of this billing period');
      },
    }),
    resume: useMutation({
      mutationFn: () => api.brands.resumeSubscription(),
      onSuccess: (s) => {
        qc.setQueryData(planKeys.subscription, s);
        toast('Your plan will renew as before');
      },
    }),
  };
}
