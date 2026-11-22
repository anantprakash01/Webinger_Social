/**
 * Mock for the Auth module (FR-01 to FR-04). Same behaviour as the backend auth package.
 */
import { linkReferral, resolveReferral } from './promos';
import {
  forgotPasswordRequestSchema,
  googleAuthRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
} from '@/features/auth/schemas';
import { getDb, mockHash, now, randomToken, ulid, type OneTimeTokenRow, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler, type MockResponse } from '../http';
import { assertActive, issueSession, revokeAllSessions, toMe } from './session';

export const VERIFY_TTL_MS = 24 * 3_600_000;
export const RESET_TTL_MS = 30 * 60_000; // FR-03: 30-minute link
const RESEND_LIMIT_PER_HOUR = 5;

/* ---------- helpers ---------- */

const findByEmail = (email: string) => getDb().users.find((u) => u.email === email.toLowerCase());

function createUser(input: { email: string; name: string; role: 'BRAND' | 'CREATOR'; passwordHash: string | null; googleSub?: string; verified: boolean }): UserRow {
  const db = getDb();
  const at = now().toISOString();
  const user: UserRow = {
    id: ulid(now().getTime()),
    email: input.email.toLowerCase(),
    name: input.name,
    role: input.role,
    status: 'ACTIVE',
    passwordHash: input.passwordHash,
    googleSub: input.googleSub ?? null,
    emailVerifiedAt: input.verified ? at : null,
    createdAt: at,
    updatedAt: at,
  };
  db.users.push(user);
  if (input.role === 'CREATOR') {
    db.creatorProfiles.push({
      userId: user.id,
      username: null,
      displayName: input.name,
      bio: null,
      city: null,
      country: null,
      gender: null,
      birthYear: null,
      languages: [],
      niches: [],
      photoUrl: null,
      coverUrls: [],
      vettingStatus: 'DRAFT',
      rejectionReason: null,
      approvedAt: null,
      submittedAt: null,
      profileViews: 0,
      stripeAccountId: null,
      payoutStatus: 'NOT_STARTED',
      createdAt: at,
    });
  } else {
    db.brandProfiles.push({ userId: user.id, companyName: null, website: null, logoUrl: null, industry: null, country: null, plan: 'FREE', stripeCustomerId: null });
  }
  return user;
}

function issueOneTimeToken(user: UserRow, kind: OneTimeTokenRow['kind']): string {
  const db = getDb();
  const at = now();
  // A new link replaces older unused links of the same kind.
  for (const t of db.oneTimeTokens) if (t.userId === user.id && t.kind === kind && !t.usedAt) t.usedAt = at.toISOString();
  const token = randomToken();
  const ttl = kind === 'VERIFY_EMAIL' ? VERIFY_TTL_MS : RESET_TTL_MS;
  db.oneTimeTokens.push({ token, userId: user.id, kind, expiresAt: new Date(at.getTime() + ttl).toISOString(), usedAt: null, createdAt: at.toISOString() });
  return token;
}

export function sendEmail(to: string, subject: string, body: string, link: string | null) {
  getDb().outbox.unshift({ id: ulid(now().getTime()), to, subject, body, link, createdAt: now().toISOString() });
}

export function sendVerification(user: UserRow) {
  const token = issueOneTimeToken(user, 'VERIFY_EMAIL');
  sendEmail(
    user.email,
    'Confirm your email address',
    `Hi ${user.name}, confirm your email to start ${user.role === 'BRAND' ? 'booking creators' : 'accepting orders'}. The link works for 24 hours.`,
    `/verify-email?token=${token}`,
  );
}

/** Finds a usable one-time token, or answers 422 like the backend. */
function consumeToken(token: string, kind: OneTimeTokenRow['kind']): UserRow {
  const db = getDb();
  const row = db.oneTimeTokens.find((t) => t.token === token && t.kind === kind);
  const what = kind === 'VERIFY_EMAIL' ? 'verification' : 'reset';
  if (!row || row.usedAt) fail(422, `This ${what} link is no longer valid. Ask for a new one.`, 'TOKEN_INVALID', [{ field: 'token', message: 'Invalid link' }]);
  if (new Date(row.expiresAt) <= now()) fail(422, `This ${what} link has expired. Ask for a new one.`, 'TOKEN_EXPIRED', [{ field: 'token', message: 'Expired link' }]);
  const user = db.users.find((u) => u.id === row.userId);
  if (!user) fail(422, `This ${what} link is no longer valid.`, 'TOKEN_INVALID');
  row.usedAt = now().toISOString();
  return user;
}

/* ---------- handlers ---------- */

export const register: Handler = ({ req }) => {
  const body = parseBody(registerRequestSchema, req.body);
  if (findByEmail(body.email)) {
    fail(409, 'This email already has an account. Sign in instead.', 'EMAIL_TAKEN', [{ field: 'email', message: 'This email already has an account.' }]);
  }
  const referrer = resolveReferral(body.referralCode, body.role);
  const user = createUser({ email: body.email, name: body.name, role: body.role, passwordHash: mockHash(body.password), verified: false });
  linkReferral(user, referrer);
  sendVerification(user);
  return issueSession(user, 201);
};

export const login: Handler = ({ req }) => {
  const body = parseBody(loginRequestSchema, req.body);
  const user = findByEmail(body.email);
  // Same answer for unknown email and wrong password, so the form cannot be used to find accounts.
  if (!user || !user.passwordHash || user.passwordHash !== mockHash(body.password)) {
    fail(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
  }
  if (user.status !== 'ACTIVE') fail(403, 'This account is suspended. Contact support.', 'ACCOUNT_SUSPENDED');
  return issueSession(user);
};

export const refresh: Handler = ({ req }) => {
  const db = getDb();
  const row = req.refreshCookie ? db.refreshTokens.find((r) => r.token === req.refreshCookie) : undefined;
  if (!row) return { ...unauthorized('Please sign in.'), setRefreshCookie: null };
  if (row.revokedAt) {
    // Reuse of a rotated token: someone may have stolen it. End every session in that family.
    for (const r of db.refreshTokens) if (r.familyId === row.familyId && !r.revokedAt) r.revokedAt = now().toISOString();
    return { ...unauthorized('Your session has ended. Please sign in again.', 'REFRESH_REUSED'), setRefreshCookie: null };
  }
  if (new Date(row.expiresAt) <= now()) return { ...unauthorized('Your session expired. Please sign in again.', 'REFRESH_EXPIRED'), setRefreshCookie: null };
  const user = db.users.find((u) => u.id === row.userId);
  if (!user) return { ...unauthorized('Please sign in.'), setRefreshCookie: null };
  assertActive(user);
  row.revokedAt = now().toISOString();
  return issueSession(user, 200, row.familyId);
};

function unauthorized(detail: string, code = 'NOT_AUTHENTICATED'): MockResponse {
  return { status: 401, body: { type: 'about:blank', status: 401, title: 'Unauthorized', detail, code } };
}

export const logout: Handler = ({ req }) => {
  const db = getDb();
  const bearer = req.headers.authorization?.replace(/^Bearer /, '');
  if (bearer) db.accessTokens = db.accessTokens.filter((a) => a.token !== bearer);
  const row = req.refreshCookie ? db.refreshTokens.find((r) => r.token === req.refreshCookie) : undefined;
  if (row && !row.revokedAt) row.revokedAt = now().toISOString();
  return { status: 204, setRefreshCookie: null };
};

export const google: Handler = ({ req }) => {
  const body = parseBody(googleAuthRequestSchema, req.body);
  // Mock ID token: mock-google:<sub>:<email>:<name>. The backend verifies Google's signature instead.
  const m = /^mock-google:([^:]+):([^:]+):(.+)$/.exec(body.idToken);
  if (!m) fail(401, 'Google sign-in failed. Try again.', 'GOOGLE_TOKEN_INVALID');
  const [, sub, email, name] = m;
  const db = getDb();
  let user = db.users.find((u) => u.googleSub === sub) ?? findByEmail(email);
  if (user) {
    if (user.status !== 'ACTIVE') fail(403, 'This account is suspended. Contact support.', 'ACCOUNT_SUSPENDED');
    // Link Google to an existing email account; Google has verified the address.
    user.googleSub = sub;
    user.emailVerifiedAt ??= now().toISOString();
    return issueSession(user);
  }
  if (!body.role) {
    fail(422, 'There is no account for this Google address yet. Choose Brand or Creator to sign up.', 'ROLE_REQUIRED', [
      { field: 'role', message: 'Choose whether you are a brand or a creator.' },
    ]);
  }
  user = createUser({ email, name, role: body.role, passwordHash: null, googleSub: sub, verified: true });
  return issueSession(user, 201);
};

export const verifyEmail: Handler = ({ req }) => {
  const { token } = parseBody(verifyEmailRequestSchema, req.body);
  const user = consumeToken(token, 'VERIFY_EMAIL');
  user.emailVerifiedAt ??= now().toISOString();
  user.updatedAt = now().toISOString();
  return ok(toMe(user));
};

export const resendVerification: Handler = ({ user }) => {
  if (user.emailVerifiedAt) fail(409, 'Your email is already verified.', 'ALREADY_VERIFIED');
  const hourAgo = now().getTime() - 3_600_000;
  const recent = getDb().oneTimeTokens.filter((t) => t.userId === user.id && t.kind === 'VERIFY_EMAIL' && new Date(t.createdAt).getTime() > hourAgo);
  if (recent.length >= RESEND_LIMIT_PER_HOUR) fail(429, 'Too many emails sent. Try again in an hour.', 'RATE_LIMITED');
  sendVerification(user);
  return { status: 202 };
};

export const forgotPassword: Handler = ({ req }) => {
  const { email } = parseBody(forgotPasswordRequestSchema, req.body);
  const user = findByEmail(email);
  if (user && user.status === 'ACTIVE') {
    const token = issueOneTimeToken(user, 'RESET_PASSWORD');
    sendEmail(user.email, 'Reset your password', 'Use this link to choose a new password. It works for 30 minutes and only once.', `/reset-password?token=${token}`);
  }
  // Always 202, whether or not the account exists.
  return { status: 202 };
};

export const resetPassword: Handler = ({ req }) => {
  const body = parseBody(resetPasswordRequestSchema, req.body);
  const user = consumeToken(body.token, 'RESET_PASSWORD');
  user.passwordHash = mockHash(body.password);
  // The link proves the person controls the inbox.
  user.emailVerifiedAt ??= now().toISOString();
  user.updatedAt = now().toISOString();
  revokeAllSessions(user.id);
  sendEmail(user.email, 'Your password was changed', 'If this was not you, contact support right away.', null);
  return { status: 204 };
};
