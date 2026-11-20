import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { workspaceKeys } from '@/features/creators/workspaceHooks';

/**
 * FR-62: starts Stripe Connect onboarding. Stripe's link is an external page (full navigation);
 * the mock's link is an in-app path.
 */
export function useStartPayoutOnboarding() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (returnUrl: string) => api.payouts.onboardingLink(returnUrl),
    onSuccess: (link) => {
      if (link.url.startsWith('/')) navigate(link.url);
      else window.location.assign(link.url);
    },
  });
}

/** Mock only: what Stripe's webhook would do when the creator finishes onboarding. */
export function useCompleteMockOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => api.dev.completeConnectOnboarding(accountId),
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.me }),
  });
}
