import { toast } from '@/components/feedback';
import { useRef } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '@/api/client';
import { useAuth } from '@/app/AuthContext';
import type { FeeUpdate, ReportInput, ReportResolveRequest, ResolveDisputeRequest, UserStatusChange } from '@/types';

export const adminKeys = { all: ['admin'] as const };

/** Every admin change can affect queues, orders, users and money: refresh broadly. */
function useRefresh() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries();
}

export function useAdminSummary() {
  const { user } = useAuth();
  return useQuery({ queryKey: ['admin', 'summary'], queryFn: () => api.admin.summary(), enabled: user?.role === 'ADMIN' && !user.impersonatedBy });
}

export const useVettingQueue = (status: string) => useQuery({ queryKey: ['admin', 'vetting', status], queryFn: () => api.admin.vetting(status) });
export function useVettingDecision() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (v: { id: string; decision: 'APPROVE' | 'REJECT'; reason?: string }) => (v.decision === 'APPROVE' ? api.admin.approveCreator(v.id) : api.admin.rejectCreator(v.id, v.reason!)),
    onSuccess: (c, v) => {
      refresh();
      toast(v.decision === 'APPROVE' ? `${c.displayName} approved. Their profile is live.` : `${c.displayName} rejected. They can fix and resubmit.`);
    },
  });
}

export const useDisputes = (status?: string) => useQuery({ queryKey: ['admin', 'disputes', status ?? 'all'], queryFn: () => api.admin.disputes(status) });
export const useDisputeReport = (days: number) => useQuery({ queryKey: ['admin', 'disputes', 'report', days], queryFn: () => api.admin.disputeReport(days) });
export function useResolveDispute(id: string) {
  const key = useRef<string | null>(null);
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: ResolveDisputeRequest) => api.admin.resolveDispute(id, body, (key.current ??= newIdempotencyKey())),
    onSuccess: () => {
      key.current = null;
      refresh();
      toast('Dispute resolved');
    },
  });
}

export const useAdminUsers = (q: { q?: string; role?: string; status?: string; page?: number }) =>
  useQuery({ queryKey: ['admin', 'users', q], queryFn: () => api.admin.users(q), placeholderData: keepPreviousData });
export function useUpdateUserStatus() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (v: { id: string; body: UserStatusChange }) => api.admin.updateUser(v.id, v.body), onSuccess: (u) => {
    refresh();
    toast(`${u.name} is now ${u.status.toLowerCase()}`);
  } });
}
export const useImpersonate = () => useMutation({ mutationFn: (id: string) => api.admin.impersonate(id) });

export const useFees = () => useQuery({ queryKey: ['admin', 'fees'], queryFn: () => api.admin.fees() });
export function useUpdateFees() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (v: FeeUpdate) => api.admin.updateFees(v), onSuccess: refresh });
}
/** Public current rates, for explanatory copy elsewhere in the app. */
export const useCurrentFees = () => useQuery({ queryKey: ['fees', 'current'], queryFn: () => api.fees.current(), staleTime: 60_000 });

export const useAuditLog = (action: string | undefined, page: number) =>
  useQuery({ queryKey: ['admin', 'audit', action ?? 'all', page], queryFn: () => api.admin.audit({ action, page }), placeholderData: keepPreviousData });

export const useReports = (status?: string) => useQuery({ queryKey: ['admin', 'reports', status ?? 'all'], queryFn: () => api.admin.reports(status) });
export function useResolveReport() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (v: { id: string; body: ReportResolveRequest }) => api.admin.resolveReport(v.id, v.body), onSuccess: (rep) => {
    refresh();
    toast(rep.status === 'DISMISSED' ? 'Report dismissed' : 'Report closed: action taken');
  } });
}
export const useCreateReport = () => useMutation({ mutationFn: (v: ReportInput) => api.reports.create(v) });

