/** Auth hooks on TanStack Query. Screens use these, never `api` or fetch directly. */
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, isMock } from '@/api/client';
import { mockGoogleIdToken } from '@/api/mock/demo';
import type { RegisterRequest, ResetPasswordRequest, SignupRole } from '@/types';

export const authKeys = {
  outbox: (to: string) => ['dev', 'outbox', to] as const,
};

export const useLogin = () => useMutation({ mutationFn: (v: { email: string; password: string }) => api.auth.login(v.email, v.password) });

export const useRegister = () => useMutation({ mutationFn: (v: RegisterRequest) => api.auth.register(v) });

/**
 * "Continue with Google". In mock mode the ID token is a fixed invented identity.
 * Phase 1: get the ID token from Google Identity Services, then call the same endpoint.
 */
export const useGoogleAuth = () =>
  useMutation({
    mutationFn: (v: { role?: SignupRole }) => {
      if (!isMock) throw new Error('Google sign-in is connected in Phase 1.');
      return api.auth.google({ idToken: mockGoogleIdToken(), role: v.role });
    },
  });

export const useVerifyEmail = () => useMutation({ mutationFn: (token: string) => api.auth.verifyEmail(token) });

export const useResendVerification = () => useMutation({ mutationFn: () => api.auth.resendVerification() });

export const useForgotPassword = () => useMutation({ mutationFn: (email: string) => api.auth.forgotPassword(email) });

export const useResetPassword = () => useMutation({ mutationFn: (v: ResetPasswordRequest) => api.auth.resetPassword(v) });

export const useLogout = () => useMutation({ mutationFn: () => api.auth.logout() });

/** Prototype only: the emails the mock "sent" to an address, newest first. */
export const useDemoOutbox = (to: string | undefined, enabled = true) =>
  useQuery({
    queryKey: authKeys.outbox(to ?? ''),
    queryFn: () => api.dev.outbox(to),
    enabled: isMock && enabled && !!to,
    staleTime: 0,
  });
