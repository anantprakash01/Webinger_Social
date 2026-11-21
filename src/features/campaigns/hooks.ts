import { toast } from '@/components/feedback';
import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '@/api/client';
import type { ApplicationInput, CampaignInput, OrderPaymentInput } from '@/types';

export const campaignKeys = {
  all: ['campaigns'] as const,
  list: (q: object) => ['campaigns', 'list', q] as const,
  detail: (id: string) => ['campaigns', 'detail', id] as const,
};

export const useCampaigns = (q: { platform?: string; niche?: string; applied?: boolean } = {}) =>
  useQuery({ queryKey: campaignKeys.list(q), queryFn: () => api.campaigns.list({ ...q, size: 50 }) });

export const useCampaign = (id: string) => useQuery({ queryKey: campaignKeys.detail(id), queryFn: () => api.campaigns.get(id) });

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: campaignKeys.all });
    void qc.invalidateQueries({ queryKey: ['brands'] });
  };
}

export function useCreateCampaign() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (v: CampaignInput) => api.campaigns.create(v), onSuccess: () => {
    refresh();
    toast('Campaign posted');
  } });
}

export function useCloseCampaign(id: string) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => api.campaigns.close(id), onSuccess: refresh });
}

export function useApply(id: string) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (v: ApplicationInput) => api.campaigns.apply(id, v), onSuccess: () => {
    refresh();
    toast('Application sent');
  } });
}

export function useWithdrawApplication() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (applicationId: string) => api.campaigns.withdrawApplication(applicationId), onSuccess: () => {
    refresh();
    toast('Application withdrawn');
  } });
}

export function useRejectApplication() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (applicationId: string) => api.campaigns.rejectApplication(applicationId), onSuccess: () => {
    refresh();
    toast('Application declined');
  } });
}

/** FR-42: places an order, so it carries an Idempotency-Key kept across retries. */
export function useAcceptApplication(applicationId: string) {
  const key = useRef<string | null>(null);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { note: string | null; payment: OrderPaymentInput }) => api.campaigns.acceptApplication(applicationId, v.note, v.payment, (key.current ??= newIdempotencyKey())),
    onSuccess: () => {
      key.current = null;
      void qc.invalidateQueries();
    },
  });
}
