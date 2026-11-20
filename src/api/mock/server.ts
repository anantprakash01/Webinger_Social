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
import * as dev from './handlers/dev';
import * as me from './handlers/me';
import { authenticate } from './handlers/session';

interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  /** true = a valid access token is required (401 otherwise). */
  auth: boolean;
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
  { method: 'PATCH', path: '/me', auth: true, handler: me.updateMe },
  // Mock only
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
      const user = route.auth ? authenticate(req.headers.authorization) : (undefined as never);
      return route.handler({ req, params, user });
    } catch (e) {
      if (e instanceof HttpError) return { status: e.problem.status, body: e.problem };
      if (e instanceof TransitionError) return problem(e.status, e.status === 409 ? 'Conflict' : e.status === 403 ? 'Forbidden' : 'Validation failed', e.message, e.code);
      if (e instanceof ApiError) return { status: e.status, body: e.problem };
      console.error('[mock] handler crashed', e);
      return problem(500, 'Internal server error', 'Something went wrong on our side.');
    } finally {
      if (req.method !== 'GET') {
        saveDb();
        if (import.meta.env.DEV) {
          const bad = findUnbalancedTxns(getDb().ledgerEntries);
          if (bad.length) console.error('[mock] ledger transactions do not sum to zero:', bad);
        }
      }
    }
  }
  return pathMatched
    ? problem(405, 'Method not allowed', `${req.method} is not supported on ${path}.`)
    : problem(404, 'Not found', `No endpoint ${req.method} ${path}.`);
}
