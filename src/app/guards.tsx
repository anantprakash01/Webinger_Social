/**
 * Route guards. These are a convenience for the UI only: real protection is the API refusing the
 * call (401/403) — the mock does that too. Hiding a page in React secures nothing.
 */
import { useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@/types';
import { VerifyEmailGate } from '@/features/auth/components/VerifyEmailGate';
import { homePath, useAuth } from './AuthContext';

/** Signed-in users with one of these roles; others go to their own home, guests to /login. */
export function RequireRole({ roles }: { roles?: Role[] }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePath(user)} replace />;
  return <Outlet />;
}

/**
 * Pages only for signed-out visitors (login, sign-up): someone already signed in when the page
 * opens goes home. A sign-in that happens on the page is left to the page, which decides where to go
 * next (the page the user wanted, or the verify-email step) — redirecting here would race it.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [signedInOnArrival] = useState(() => user !== null);
  if (user && signedInOnArrival) return <Navigate to={homePath(user)} replace />;
  return <>{children}</>;
}

/** FR-02: placing or accepting orders needs a verified email. Wrap those screens in this. */
export function RequireVerified({ children, action = 'place orders' }: { children: ReactNode; action?: string }) {
  const { user } = useAuth();
  if (user && !user.emailVerified) return <VerifyEmailGate action={action} />;
  return <>{children}</>;
}
