/**
 * The only module that talks to a backend (convention 2). Components never call fetch directly;
 * they use feature hooks built on TanStack Query, which call `api` here.
 *
 * VITE_API_MODE=mock → requests are answered in the browser by src/api/mock/server.ts (Phase 0)
 * VITE_API_MODE=http → requests go to the Spring Boot API at VITE_API_BASE_URL (Phase 1+)
 *
 * Both modes share one request path, including the 401 → refresh → retry-once logic,
 * so switching a module from mock to real changes nothing in any screen.
 */
import { ApiError, type AuthSession, type GoogleAuthRequest, type Me, type Problem, type RegisterRequest, type ResetPasswordRequest, type UpdateMeRequest } from '@/types';

const MODE = (import.meta.env.VITE_API_MODE ?? 'mock') as 'mock' | 'http';
const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const DELAY = Number(import.meta.env.VITE_MOCK_DELAY_MS ?? 350);

export const isMock = MODE === 'mock';

/* ---------- Session ---------- */
// The access token lives in memory. In http mode the refresh token is an httpOnly cookie the
// browser sends to /auth/refresh, so a page reload restores the session through `restoreSession()`.
// In mock mode there is no real cookie, so the mock session and its stand-in refresh cookie are kept
// in sessionStorage (never localStorage, convention 10).

interface ClientSession {
  accessToken: string;
  user: Me;
}

const SESSION_KEY = 'cm.mock.session';
const COOKIE_KEY = 'cm.mock.refreshCookie';

const store = {
  get<T>(key: string): T | null {
    if (!isMock) return null;
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    if (!isMock) return;
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable (private mode): memory still works */
    }
  },
};

let session: ClientSession | null = store.get<ClientSession>(SESSION_KEY);

export type SessionEvent = { type: 'signedIn' | 'userChanged'; user: Me } | { type: 'signedOut'; reason: string | null };
const listeners = new Set<(e: SessionEvent) => void>();

/** The auth context subscribes here; returns an unsubscribe function. */
export function onSessionEvent(fn: (e: SessionEvent) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const emit = (e: SessionEvent) => listeners.forEach((fn) => fn(e));

export const currentUser = (): Me | null => session?.user ?? null;

function setSession(s: AuthSession, type: 'signedIn' | 'userChanged') {
  session = { accessToken: s.accessToken, user: s.user };
  store.set(SESSION_KEY, session);
  emit({ type, user: s.user });
}

function setUser(user: Me) {
  if (!session) return;
  session = { ...session, user };
  store.set(SESSION_KEY, session);
  emit({ type: 'userChanged', user });
}

let signOutReason: string | null = null;
/** The login page shows, once, why the user was signed out (session expired, account suspended…). */
export function takeSignOutReason() {
  const r = signOutReason;
  signOutReason = null;
  return r;
}

function clearSession(reason: string | null) {
  const had = !!session;
  session = null;
  store.set(SESSION_KEY, null);
  if (had) {
    signOutReason = reason;
    emit({ type: 'signedOut', reason });
  }
}

/* ---------- Transport ---------- */

interface RawResponse {
  status: number;
  body: unknown;
}

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  /** Send the access token (default true). */
  auth?: boolean;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toQuery(query: RequestOptions['query']) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  return sp;
}

async function mockTransport(method: string, path: string, opts: RequestOptions, headers: Record<string, string>): Promise<RawResponse> {
  const { handle } = await import('./mock/server');
  await wait(DELAY);
  const res = handle({
    method,
    path,
    query: toQuery(opts.query),
    // Serialise like the network would, so handlers never share objects with the UI.
    body: opts.body === undefined ? undefined : JSON.parse(JSON.stringify(opts.body)),
    headers,
    refreshCookie: store.get<string>(COOKIE_KEY),
  });
  if (res.setRefreshCookie !== undefined) store.set(COOKIE_KEY, res.setRefreshCookie);
  return { status: res.status, body: res.body === undefined ? undefined : structuredClone(res.body) };
}

async function httpTransport(method: string, path: string, opts: RequestOptions, headers: Record<string, string>): Promise<RawResponse> {
  const qs = toQuery(opts.query).toString();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ''}`, {
      method,
      credentials: 'include',
      headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), Accept: 'application/json', ...headers },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    return { status: 0, body: { status: 0, title: 'Network error', detail: 'Could not reach the server. Check your connection and try again.' } };
  }
  let body: unknown;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  return { status: res.status, body };
}

function send(method: string, path: string, opts: RequestOptions): Promise<RawResponse> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.auth !== false && session) headers.authorization = `Bearer ${session.accessToken}`;
  return isMock ? mockTransport(method, path, opts, headers) : httpTransport(method, path, opts, headers);
}

/* ---------- Refresh (FR-04): one in flight at a time ---------- */

let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await send('POST', '/auth/refresh', { auth: false });
      if (res.status === 200) {
        setSession(res.body as AuthSession, session ? 'userChanged' : 'signedIn');
        return true;
      }
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

const toProblem = (res: RawResponse): Problem => {
  const b = res.body as Partial<Problem> | undefined;
  return { status: res.status, title: b?.title ?? 'Request failed', ...b } as Problem;
};

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await send(method, path, opts);
  // Access token expired: refresh once and retry. Auth endpoints answer 401 for wrong credentials, so skip them.
  if (res.status === 401 && opts.auth !== false && session && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await send(method, path, opts);
    if (res.status === 401) {
      const p = toProblem(res);
      clearSession(p.detail ?? 'Your session ended. Please sign in again.');
      throw new ApiError(p);
    }
  }
  if (res.status < 200 || res.status >= 300) throw new ApiError(toProblem(res));
  return res.body as T;
}

/** Key for money-moving requests; reuse the same key when retrying the same action. */
export const newIdempotencyKey = () => crypto.randomUUID();

/* ---------- Endpoints (one per path in docs/api/openapi.yaml) ---------- */

export interface OutboxEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  link: string | null;
  createdAt: string;
}

export const api = {
  auth: {
    async register(body: RegisterRequest): Promise<Me> {
      const s = await request<AuthSession>('POST', '/auth/register', { body, auth: false });
      setSession(s, 'signedIn');
      return s.user;
    },
    async login(email: string, password: string): Promise<Me> {
      const s = await request<AuthSession>('POST', '/auth/login', { body: { email, password }, auth: false });
      setSession(s, 'signedIn');
      return s.user;
    },
    async google(body: GoogleAuthRequest): Promise<Me> {
      const s = await request<AuthSession>('POST', '/auth/oauth/google', { body, auth: false });
      setSession(s, 'signedIn');
      return s.user;
    },
    async logout(): Promise<void> {
      try {
        await request<void>('POST', '/auth/logout');
      } finally {
        clearSession(null);
      }
    },
    /** On app start in http mode: turn the refresh cookie back into a session, if there is one. */
    async restoreSession(): Promise<Me | null> {
      if (session) return session.user;
      return (await refreshSession()) ? currentUser() : null;
    },
    async verifyEmail(token: string): Promise<Me> {
      const user = await request<Me>('POST', '/auth/verify-email', { body: { token }, auth: false });
      if (session?.user.id === user.id) setUser(user);
      return user;
    },
    resendVerification: () => request<void>('POST', '/auth/verify-email/resend'),
    forgotPassword: (email: string) => request<void>('POST', '/auth/forgot-password', { body: { email }, auth: false }),
    async resetPassword(body: ResetPasswordRequest): Promise<void> {
      await request<void>('POST', '/auth/reset-password', { body, auth: false });
      // Every session of that user was revoked; if it was us, we are signed out too.
      clearSession(null);
    },
  },
  me: {
    async get(): Promise<Me> {
      const user = await request<Me>('GET', '/me');
      setUser(user);
      return user;
    },
    async update(body: UpdateMeRequest): Promise<Me> {
      const user = await request<Me>('PATCH', '/me', { body });
      setUser(user);
      return user;
    },
  },
  /** Mock-only helpers. Calling them in http mode is a programming error. */
  dev: {
    outbox: (to?: string) => request<OutboxEmail[]>('GET', '/dev/outbox', { query: { to }, auth: false }),
    async reset(): Promise<void> {
      await request<void>('POST', '/dev/reset', { auth: false });
      clearSession(null);
    },
  },
};
