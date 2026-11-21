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
import { uploadProblem } from '@/features/files/schemas';
import {
  ApiError,
  type AuthSession,
  type BrandProfile,
  type BrandProfileInput,
  type CreatorMe,
  type CreatorProfileInput,
  type CreatorStats,
  type OnboardingLink,
  type OwnPackage,
  type PackageInput,
  type PackagePatch,
  type PortfolioItem,
  type PortfolioItemInput,
  type PresignRequest,
  type PresignResponse,
  type SocialAccount,
  type SocialAccountInput,
  type DeliverRequest,
  type OrderBrief,
  type OrderCreated,
  type OrderCreateRequest,
  type OrderDetail,
  type OrderPage,
  type OrderQuote,
  type Review,
  type ReviewRequest,
  type Application,
  type ApplicationInput,
  type BrandStats,
  type CampaignDetail,
  type CampaignInput,
  type CampaignPage,
  type ChatMessage,
  type ConversationList,
  type MarkReadRequest,
  type MessageList,
  type NotificationPage,
  type CreatorProfile, type CreatorSearchPage, type CreatorSearchQuery, type GoogleAuthRequest, type Me, type Problem, type RegisterRequest, type ResetPasswordRequest, type UpdateMeRequest } from '@/types';

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
/** For the STOMP connection header (http mode). Never stored anywhere else. */
export const accessToken = (): string | null => session?.accessToken ?? null;

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

const enc = encodeURIComponent;

/** Longest side per upload purpose, so demo images stay small enough for sessionStorage. */
const DEMO_MAX_SIDE: Record<PresignRequest['purpose'], number> = { AVATAR: 480, BRAND_LOGO: 480, PORTFOLIO: 1080, COVER: 1600, BRIEF_REFERENCE: 1080, DELIVERABLE: 1600 };

/** Mock mode only: a JPEG data URL of the image, downscaled when the browser can. */
async function toDemoDataUrl(file: File, purpose: PresignRequest['purpose']): Promise<string> {
  if (typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, DEMO_MAX_SIDE[purpose] / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.82);
      }
    } catch {
      /* fall through to the plain copy */
    }
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new ApiError({ type: 'about:blank', status: 422, title: 'Validation failed', detail: 'That image could not be read.' }));
    r.readAsDataURL(file);
  });
}

export interface SimulatedTime {
  offsetHours: number;
  now: string;
  expired: number;
  autoApproved: number;
}

function orderAction(id: string, action: string, body: unknown, idempotencyKey: string) {
  return request<OrderDetail>('POST', `/orders/${enc(id)}/${action}`, { body, headers: { 'idempotency-key': idempotencyKey } });
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
  creators: {
    /** Public search (FR-20 – FR-24). */
    search: (query: CreatorSearchQuery) => request<CreatorSearchPage>('GET', '/creators', { query }),
    /** Public profile (FR-15). Sends the token when signed in, so owners and admins can preview. */
    profile: (username: string) => request<CreatorProfile>('GET', `/creators/${encodeURIComponent(username)}`),
  },
  /** The signed-in creator's workspace (Week 3). */
  creatorMe: {
    get: () => request<CreatorMe>('GET', '/creators/me'),
    updateProfile: (body: CreatorProfileInput) => request<CreatorMe>('PUT', '/creators/me/profile', { body }),
    addSocial: (body: SocialAccountInput) => request<SocialAccount>('POST', '/creators/me/social-accounts', { body }),
    removeSocial: (id: string) => request<void>('DELETE', `/creators/me/social-accounts/${enc(id)}`),
    createPackage: (body: PackageInput) => request<OwnPackage>('POST', '/creators/me/packages', { body }),
    updatePackage: (id: string, body: PackagePatch) => request<OwnPackage>('PATCH', `/creators/me/packages/${enc(id)}`, { body }),
    deletePackage: (id: string) => request<void>('DELETE', `/creators/me/packages/${enc(id)}`),
    addPortfolioItem: (body: PortfolioItemInput) => request<PortfolioItem>('POST', '/creators/me/portfolio', { body }),
    removePortfolioItem: (id: string) => request<void>('DELETE', `/creators/me/portfolio/${enc(id)}`),
    submitForReview: () => request<CreatorMe>('POST', '/creators/me/submit-for-review'),
    stats: () => request<CreatorStats>('GET', '/creators/me/stats'),
  },
  brands: {
    getProfile: () => request<BrandProfile>('GET', '/brands/me/profile'),
    updateProfile: (body: BrandProfileInput) => request<BrandProfile>('PUT', '/brands/me/profile', { body }),
    /** FR-71 dashboard numbers. */
    stats: () => request<BrandStats>('GET', '/brands/me/stats'),
  },
  payouts: {
    /** FR-62: Stripe Connect Express onboarding. The browser then goes to `url`. */
    onboardingLink: (returnUrl: string) => request<OnboardingLink>('POST', '/payouts/onboarding-link', { body: { returnUrl } }),
  },
  files: {
    /**
     * Uploads an image and returns the URL to save on the profile.
     * http: presign → PUT the file to storage → the presigned `fileUrl`.
     * mock: presign (so validation matches) → a downscaled data URL kept in the demo data.
     */
    async upload(file: File, purpose: PresignRequest['purpose']): Promise<string> {
      const problem = uploadProblem(file);
      if (problem) throw new ApiError({ type: 'about:blank', status: 422, title: 'Validation failed', detail: problem, errors: [{ field: 'file', message: problem }] });
      const target = await request<PresignResponse>('POST', '/files/presign', {
        body: { purpose, fileName: file.name.slice(0, 200), contentType: file.type as PresignRequest['contentType'], sizeBytes: file.size } satisfies PresignRequest,
      });
      if (isMock) return toDemoDataUrl(file, purpose);
      const res = await fetch(target.uploadUrl, { method: target.method, headers: target.headers, body: file });
      if (!res.ok) throw new ApiError({ type: 'about:blank', status: res.status, title: 'Upload failed', detail: 'The image could not be uploaded. Try again.' });
      return target.fileUrl;
    },
  },
  /** Orders (Week 4). Money-moving calls send an Idempotency-Key; reuse it when retrying the same action. */
  orders: {
    quote: (q: { packageId?: string; creatorUsername?: string; priceCents?: number }) => request<OrderQuote>('GET', '/orders/quote', { query: q }),
    create: (body: OrderCreateRequest, idempotencyKey: string) =>
      request<OrderCreated>('POST', '/orders', { body, headers: { 'idempotency-key': idempotencyKey } }),
    list: (q: { status?: string; page?: number; size?: number } = {}) => request<OrderPage>('GET', '/orders', { query: q }),
    get: (id: string) => request<OrderDetail>('GET', `/orders/${enc(id)}`),
    accept: (id: string, key: string) => orderAction(id, 'accept', undefined, key),
    decline: (id: string, reason: string | null, key: string) => orderAction(id, 'decline', { reason }, key),
    cancel: (id: string, reason: string | null, key: string) => orderAction(id, 'cancel', { reason }, key),
    deliver: (id: string, body: DeliverRequest, key: string) => orderAction(id, 'deliver', body, key),
    approve: (id: string, key: string) => orderAction(id, 'approve', undefined, key),
    requestRevision: (id: string, note: string, key: string) => orderAction(id, 'request-revision', { note }, key),
    dispute: (id: string, note: string, key: string) => orderAction(id, 'dispute', { note }, key),
    updateBrief: (id: string, brief: OrderBrief) => request<OrderDetail>('POST', `/orders/${enc(id)}/brief`, { body: brief }),
    review: (id: string, body: ReviewRequest) => request<Review>('POST', `/orders/${enc(id)}/review`, { body }),
    reply: (reviewId: string, reply: string) => request<Review>('POST', `/reviews/${enc(reviewId)}/reply`, { body: { reply } }),
  },
  /** Campaigns (Week 5, FR-40 – FR-42). */
  campaigns: {
    list: (q: { platform?: string; niche?: string; applied?: boolean; page?: number; size?: number } = {}) => request<CampaignPage>('GET', '/campaigns', { query: q }),
    create: (body: CampaignInput) => request<CampaignDetail>('POST', '/campaigns', { body }),
    get: (id: string) => request<CampaignDetail>('GET', `/campaigns/${enc(id)}`),
    close: (id: string) => request<CampaignDetail>('POST', `/campaigns/${enc(id)}/close`),
    apply: (id: string, body: ApplicationInput) => request<Application>('POST', `/campaigns/${enc(id)}/applications`, { body }),
    /** FR-42: places an order (card authorised), so it carries an Idempotency-Key. */
    acceptApplication: (id: string, note: string | null, idempotencyKey: string) =>
      request<OrderCreated>('POST', `/applications/${enc(id)}/accept`, { body: { note }, headers: { 'idempotency-key': idempotencyKey } }),
    rejectApplication: (id: string) => request<Application>('POST', `/applications/${enc(id)}/reject`, { body: {} }),
    withdrawApplication: (id: string) => request<Application>('POST', `/applications/${enc(id)}/withdraw`),
  },
  /** Chat (FR-50, FR-51). Live updates arrive through src/lib/realtime.ts. */
  chat: {
    conversations: () => request<ConversationList>('GET', '/conversations'),
    messages: (id: string, after?: string) => request<MessageList>('GET', `/conversations/${enc(id)}/messages`, { query: { after } }),
    send: (id: string, body: string) => request<ChatMessage>('POST', `/conversations/${enc(id)}/messages`, { body: { body } }),
    markRead: (id: string) => request<void>('POST', `/conversations/${enc(id)}/read`),
  },
  /** Notifications (FR-52). */
  notifications: {
    list: (q: { unreadOnly?: boolean; page?: number; size?: number } = {}) => request<NotificationPage>('GET', '/notifications', { query: q }),
    markRead: (body: MarkReadRequest) => request<void>('POST', '/notifications/read', { body }),
  },
  /** Mock-only helpers. Calling them in http mode is a programming error. */
  dev: {
    /** Stand-in for the STOMP broker: events for this user since `since`. */
    pollRealtime: (since?: string) => request<{ events: Array<{ topic: string; at: string; payload: unknown }>; serverTime: string }>('GET', '/dev/realtime/poll', { query: { since } }),
    /** "Simulate time": moves the mock clock forward and runs expiry / auto-approve. */
    simulateTime: (hours: number) => request<SimulatedTime>('POST', '/dev/simulate-time', { body: { hours }, auth: false }),
    clock: () => request<{ offsetHours: number; now: string }>('GET', '/dev/clock', { auth: false }),
    outbox: (to?: string) => request<OutboxEmail[]>('GET', '/dev/outbox', { query: { to }, auth: false }),
    async reset(): Promise<void> {
      await request<void>('POST', '/dev/reset', { auth: false });
      clearSession(null);
    },
    /** Stands in for Stripe's account.updated webhook after the mock onboarding page. */
    completeConnectOnboarding: (accountId: string) => request<{ payoutStatus: string }>('POST', '/dev/stripe/connect-complete', { body: { accountId } }),
    /** Stands in for the admin vetting queue (Week 6) so every vetting state can be demoed. */
    async vettingDecision(decision: 'APPROVE' | 'REJECT', reason?: string): Promise<CreatorMe> {
      const me = await request<CreatorMe>('POST', '/dev/vetting-decision', { body: { decision, reason } });
      await api.me.get();
      return me;
    },
  },
};
