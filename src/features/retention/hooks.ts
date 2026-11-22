/** Phase D hooks: saved lists, invites, vacation mode, notification preferences, brand reviews. */
import { toast } from '@/components/feedback';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/app/AuthContext';
import type { CreatorAvailability, NotificationPreferences, ReviewRequest } from '@/types';

export const listKeys = {
  all: ['lists'] as const,
  detail: (id: string) => ['lists', 'detail', id] as const,
};

/** Brands only; other roles get an empty, disabled query. */
export function useSavedLists() {
  const { user } = useAuth();
  return useQuery({ queryKey: listKeys.all, queryFn: () => api.lists.all(), enabled: user?.role === 'BRAND' });
}

export const useSavedList = (id: string) => useQuery({ queryKey: listKeys.detail(id), queryFn: () => api.lists.get(id) });

function useRefreshLists() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: listKeys.all });
}

export function useListMutations() {
  const refresh = useRefreshLists();
  const opts = { onSuccess: refresh };
  return {
    create: useMutation({ mutationFn: (name: string) => api.lists.create(name), ...opts }),
    rename: useMutation({ mutationFn: (v: { id: string; name: string }) => api.lists.rename(v.id, v.name), ...opts }),
    remove: useMutation({ mutationFn: (id: string) => api.lists.remove(id), ...opts }),
    add: useMutation({ mutationFn: (v: { id: string; username: string }) => api.lists.add(v.id, v.username), ...opts }),
    drop: useMutation({ mutationFn: (v: { id: string; username: string }) => api.lists.drop(v.id, v.username), ...opts }),
  };
}

export function useInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { campaignId: string; username: string; message: string | null }) => api.campaigns.invite(v.campaignId, v.username, v.message),
    onSuccess: (i) => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast(`Invited ${i.creator.name.split(' ')[0]} to “${i.campaignTitle}”`);
    },
  });
}

export function useDeclineInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.campaigns.declineInvite(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast('Invitation declined');
    },
  });
}

export function useSaveAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CreatorAvailability) => api.creatorMe.saveAvailability(v),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ['creators'] });
      toast(a.away ? 'Away mode is on' : 'You are taking orders again');
    },
  });
}

export const prefsKey = ['notification-preferences'] as const;
export const useNotificationPrefs = () => useQuery({ queryKey: prefsKey, queryFn: () => api.notifications.preferences() });

export function useSaveNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: NotificationPreferences) => api.notifications.savePreferences(v),
    onSuccess: (p) => {
      qc.setQueryData(prefsKey, p);
      toast('Notification settings saved');
    },
  });
}

export function useReviewBrand(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ReviewRequest) => api.orders.reviewBrand(orderId, v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      toast('Thanks — your rating was posted');
    },
  });
}
