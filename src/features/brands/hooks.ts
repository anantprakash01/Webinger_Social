import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { BrandProfileInput } from '@/types';

export const brandKeys = { profile: ['brands', 'me', 'profile'] as const };

export const useBrandProfile = () => useQuery({ queryKey: brandKeys.profile, queryFn: () => api.brands.getProfile() });

/** Saves the company profile (FR-05) and refreshes `/me`, whose company name shows in the sidebar. */
export function useSaveBrandProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: BrandProfileInput) => api.brands.updateProfile(v),
    onSuccess: async (saved) => {
      qc.setQueryData(brandKeys.profile, saved);
      await api.me.get();
    },
  });
}

/** FR-71 dashboard numbers. */
export const useBrandStats = () => useQuery({ queryKey: ['brands', 'me', 'stats'], queryFn: () => api.brands.stats() });
