/**
 * The mock backend: routes a request to a handler, enforces authentication, and turns errors
 * into problem+json exactly like the Spring Boot API. The API client calls `handle()` instead of
 * `fetch()` when VITE_API_MODE=mock.
 */
import { ApiError } from '@/types';
import { getDb, saveDb } from './db';
import { HttpError, type Handler, type MockRequest, type MockResponse } from './http';
import { findUnbalancedTxns } from './ledger';
import { TransitionError } from './orderMachine';
import * as auth from './handlers/auth';
import * as brands from './handlers/brands';
import * as creatorMe from './handlers/creatorMe';
import * as creators from './handlers/creators';
import * as files from './handlers/files';
import * as payouts from './handlers/payouts';
import * as dev from './handlers/dev';
import * as me from './handlers/me';
import { authenticate } from './handlers/session';

interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  /** true = a valid access token is required (401 otherwise). 'optional' = used when sent. */
  auth: boolean | 'optional';
  handler: Handler;
}

/** One line per path in docs/api/openapi.yaml, plus the mock-only /dev endpoints. */
const ROUTES: Route[] = [
  { method: 'POST', path: '/auth/register', auth: false, handler: auth.register },
  { method: 'POST', path: '/auth/login', auth: false, handler: auth.login },
  { method: 'POST', path: '/auth/refresh', auth: false, handler: auth.refresh },
  { method: 'POST', path: '/auth/logout', auth: false, handler: auth.logout },
  { method: 'POST', path: '/auth/oauth/google', auth: false, handler: auth.google },
  { method: 'POST', path: '/auth/verify-email', auth: false, handler: auth.verifyEmail },
  { method: 'POST', path: '/auth/verify-email/resend', auth: true, handler: auth.resendVerification },
  { method: 'POST', path: '/auth/forgot-password', auth: false, handler: auth.forgotPassword },
  { method: 'POST', path: '/auth/reset-password', auth: false, handler: auth.resetPassword },
  { method: 'GET', path: '/me', auth: true, handler: me.getMe },
  // /creators/me/* before /creators/:username, which would otherwise match "me".
  { method: 'GET', path: '/creators/me', auth: true, handler: creatorMe.getMyCreatorProfile },
  { method: 'PUT', path: '/creators/me/profile', auth: true, handler: creatorMe.updateMyCreatorProfile },
  { method: 'POST', path: '/creators/me/social-accounts', auth: true, handler: creatorMe.addMySocialAccount },
  { method: 'DELETE', path: '/creators/me/social-accounts/:id', auth: true, handler: creatorMe.removeMySocialAccount },
  { method: 'POST', path: '/creators/me/packages', auth: true, handler: creatorMe.createMyPackage },
  { method: 'PATCH', path: '/creators/me/packages/:id', auth: true, handler: creatorMe.updateMyPackage },
  { method: 'DELETE', path: '/creators/me/packages/:id', auth: true, handler: creatorMe.deleteMyPackage },
  { method: 'POST', path: '/creators/me/portfolio', auth: true, handler: creatorMe.addMyPortfolioItem },
  { method: 'DELETE', path: '/creators/me/portfolio/:id', auth: true, handler: creatorMe.removeMyPortfolioItem },
  { method: 'POST', path: '/creators/me/submit-for-review', auth: true, handler: creatorMe.submitMyProfileForReview },
  { method: 'GET', path: '/creators/me/stats', auth: true, handler: creatorMe.getMyCreatorStats },
  { method: 'GET', path: '/creators', auth: false, handler: creators.searchCreators },
  { method: 'GET', path: '/creators/:username', auth: 'optional', handler: creators.getCreatorProfile },
  { method: 'PATCH', path: '/me', auth: true, handler: me.updateMe },
  { method: 'GET', path: '/brands/me/profile', auth: true, handler: brands.getMyBrandProfile },
  { method: 'PUT', path: '/brands/me/profile', auth: true, handler: brands.updateMyBrandProfile },
  { method: 'POST', path: '/files/presign', auth: true, handler: files.presignUpload },
  { method: 'POST', path: '/payouts/onboarding-link', auth: true, handler: payouts.createPayoutOnboardingLink },
  // Mock only
  { method: 'POST', path: '/dev/stripe/connect-complete', auth: true, handler: payouts.completeMockConnectOnboarding },
  { method: 'POST', path: '/dev/vetting-decision', auth: true, handler: dev.vettingDecision },
  { method: 'GET', path: '/dev/outbox', auth: false, handler: dev.outbox },
  { method: 'POST', path: '/dev/reset', auth: false, handler: dev.reset },
];

function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/');
  const b = path.split('/');
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

const problem = (status: number, title: string, detail: string, code?: string): MockResponse => ({
  status,
  body: { type: 'about:blank', status, title, detail, code },
});

export function handle(req: MockRequest): MockResponse {
  const path = req.path.replace(/\/+$/, '') || '/';
  let pathMatched = false;
  for (const route of ROUTES) {
    const params = match(route.path, path);
    if (!params) continue;
    pathMatched = true;
    if (route.method !== req.method) continue;
    try {
      const wantsUser = route.auth === true || (route.auth === 'optional' && !!req.headers.authorization);
      const user = wantsUser ? authenticate(req.headers.authorization) : (undefined as never);
      return route.handler({ req, params, user });
    } catch (e) {
      if (e instanceof HttpError) return { status: e.problem.status, body: e.problem };
      if (e instanceof TransitionError) return problem(e.status, e.status === 409 ? 'Conflict' : e.status === 403 ? 'Forbidden' : 'Validation failed', e.message, e.code);
      if (e instanceof ApiError) return { status: e.status, body: e.problem };
      console.error('[mock] handler crashed', e);
      return problem(500, 'Internal server error', 'Something went wrong on our side.');
    } finally {
      // GETs can write too (e.g. profile view counts), so persist after every request.
      saveDb();
      if (req.method !== 'GET' && import.meta.env.DEV) {
        const bad = findUnbalancedTxns(getDb().ledgerEntries);
        if (bad.length) console.error('[mock] ledger transactions do not sum to zero:', bad);
      }
    }
  }
  return pathMatched
    ? problem(405, 'Method not allowed', `${req.method} is not supported on ${path}.`)
    : problem(404, 'Not found', `No endpoint ${req.method} ${path}.`);
}
