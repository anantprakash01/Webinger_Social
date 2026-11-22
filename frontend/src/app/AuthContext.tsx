/**
 * Auth state as React context (CLAUDE.md §2: context, as in Webinger, until state grows).
 * The API client owns the session; this context mirrors it for rendering.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, currentUser, onSessionEvent } from '@/api/client';
import type { Me } from '@/types';
import { queryClient } from './queryClient';

interface AuthValue {
  user: Me | null;
  /** False until the app has tried to restore a session (http mode reads the refresh cookie). */
  ready: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(currentUser);
  const [ready, setReady] = useState(() => currentUser() !== null);

  useEffect(
    () =>
      onSessionEvent((e) => {
        if (e.type === 'signedOut') {
          queryClient.clear();
          setUser(null);
        } else {
          // Cached data belongs to the previous user (e.g. after "View as"); never show it to the next one.
          if (e.type === 'signedIn') queryClient.clear();
          setUser(e.user);
        }
      }),
    [],
  );

  useEffect(() => {
    if (ready) return;
    let live = true;
    api.auth
      .restoreSession()
      .catch(() => null)
      .finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [ready]);

  const value = useMemo<AuthValue>(() => ({ user, ready, logout: () => api.auth.logout() }), [user, ready]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Where each user lands after signing in. A creator still setting up goes to onboarding. */
export function homePath(user: Me): string {
  switch (user.role) {
    case 'BRAND':
      return '/brand/dashboard';
    case 'CREATOR':
      return user.creator?.vettingStatus === 'DRAFT' ? '/creator/onboarding' : '/creator/dashboard';
    case 'ADMIN':
      return '/admin/vetting';
  }
}

/** First path segment owned by each role, used to decide whether a "from" redirect is allowed. */
export const AREA_PREFIX = { BRAND: ['/brand', '/checkout'], CREATOR: ['/creator'], ADMIN: ['/admin'] } as const;
export const SHARED_PREFIXES = ['/messages', '/notifications'];

/** Public pages anyone may return to after signing in (e.g. the profile they were looking at). */
const PUBLIC_PREFIXES = ['/search', '/u'];

export function canOpen(user: Me, path: string): boolean {
  const pathname = path.split(/[?#]/)[0];
  return [...AREA_PREFIX[user.role], ...SHARED_PREFIXES, ...PUBLIC_PREFIXES].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
