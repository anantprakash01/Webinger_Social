/**
 * Creator workspace hooks (Week 3): own profile, socials, packages, portfolio, vetting, stats.
 * Every change refreshes the workspace data and the public pages that show it (profile, search),
 * and changes that affect the signed-in user (name, vetting status) refresh `/me` too.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { CreatorProfileInput, PackageInput, PackagePatch, PortfolioItemInput, SocialAccountInput } from '@/types';

export const workspaceKeys = {
  me: ['creators', 'me'] as const,
  stats: ['creators', 'me', 'stats'] as const,
};

export const useMyCreator = () => useQuery({ queryKey: workspaceKeys.me, queryFn: () => api.creatorMe.get() });

export const useCreatorStats = () => useQuery({ queryKey: workspaceKeys.stats, queryFn: () => api.creatorMe.stats() });

/** Wraps a workspace mutation with the right cache refreshes. */
function useWorkspaceMutation<V, R>(fn: (v: V) => Promise<R>, opts: { refreshMe?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      if (opts.refreshMe) await api.me.get();
      await Promise.all([
        qc.invalidateQueries({ queryKey: workspaceKeys.me }),
        qc.invalidateQueries({ queryKey: ['creators', 'profile'] }),
        qc.invalidateQueries({ queryKey: ['creators', 'search'] }),
      ]);
    },
  });
}

export const useSaveCreatorProfile = () => useWorkspaceMutation((v: CreatorProfileInput) => api.creatorMe.updateProfile(v), { refreshMe: true });
export const useAddSocial = () => useWorkspaceMutation((v: SocialAccountInput) => api.creatorMe.addSocial(v));
export const useRemoveSocial = () => useWorkspaceMutation((id: string) => api.creatorMe.removeSocial(id));
export const useCreatePackage = () => useWorkspaceMutation((v: PackageInput) => api.creatorMe.createPackage(v));
export const useUpdatePackage = () => useWorkspaceMutation((v: { id: string; patch: PackagePatch }) => api.creatorMe.updatePackage(v.id, v.patch));
export const useDeletePackage = () => useWorkspaceMutation((id: string) => api.creatorMe.deletePackage(id));
export const useAddPortfolioItem = () => useWorkspaceMutation((v: PortfolioItemInput) => api.creatorMe.addPortfolioItem(v));
export const useRemovePortfolioItem = () => useWorkspaceMutation((id: string) => api.creatorMe.removePortfolioItem(id));
export const useSubmitForReview = () => useWorkspaceMutation(() => api.creatorMe.submitForReview(), { refreshMe: true });

/** Mock-only: the demo bar's "Simulate review" control. */
export const useDemoVettingDecision = () =>
  useWorkspaceMutation((v: { decision: 'APPROVE' | 'REJECT'; reason?: string }) => api.dev.vettingDecision(v.decision, v.reason));
