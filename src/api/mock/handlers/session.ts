/**
 * Token issuing and checking for the mock: access token 15 min, rotating refresh token 7 days (FR-04).
 */
import type { AuthSession, Me } from '@/types';
import { getDb, now, randomToken, type UserRow } from '../db';
import { fail, type MockResponse } from '../http';

export const ACCESS_TTL_MS = 15 * 60_000;
export const REFRESH_TTL_MS = 7 * 86_400_000;

export function toMe(u: UserRow): Me {
  const db = getDb();
  const me: Me = {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    emailVerified: !!u.emailVerifiedAt,
    createdAt: u.createdAt,
  };
  if (u.role === 'CREATOR') {
    const p = db.creatorProfiles.find((c) => c.userId === u.id);
    if (p) me.creator = { username: p.username, vettingStatus: p.vettingStatus, rejectionReason: p.rejectionReason };
  }
  if (u.role === 'BRAND') {
    const p = db.brandProfiles.find((b) => b.userId === u.id);
    me.brand = { companyName: p?.companyName ?? null };
  }
  return me;
}

/** Signs a user in: new access token, and a refresh token in the given family (new family on sign-in). */
export function issueSession(user: UserRow, status = 200, familyId = randomToken(8)): MockResponse {
  const db = getDb();
  const t = now().getTime();
  const accessToken = `mock-at-${randomToken()}`;
  const refreshToken = `mock-rt-${randomToken()}`;
  db.accessTokens.push({ token: accessToken, userId: user.id, expiresAt: new Date(t + ACCESS_TTL_MS).toISOString() });
  db.refreshTokens.push({
    token: refreshToken,
    userId: user.id,
    familyId,
    expiresAt: new Date(t + REFRESH_TTL_MS).toISOString(),
    revokedAt: null,
  });
  const body: AuthSession = { accessToken, expiresIn: ACCESS_TTL_MS / 1000, user: toMe(user) };
  return { status, body, setRefreshCookie: refreshToken };
}

/** Revokes every session of a user (password reset, suspension, refresh-token reuse). */
export function revokeAllSessions(userId: string) {
  const db = getDb();
  const at = now().toISOString();
  db.accessTokens = db.accessTokens.filter((a) => a.userId !== userId);
  for (const r of db.refreshTokens) if (r.userId === userId && !r.revokedAt) r.revokedAt = at;
}

export function assertActive(user: UserRow) {
  if (user.status !== 'ACTIVE') {
    revokeAllSessions(user.id);
    fail(401, user.status === 'BANNED' ? 'This account has been closed.' : 'This account is suspended. Contact support.', 'ACCOUNT_SUSPENDED');
  }
}

/** Resolves the bearer token to a user, like the backend's JWT filter. */
export function authenticate(authorization: string | undefined): UserRow {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) fail(401, 'Please sign in.', 'NOT_AUTHENTICATED');
  const db = getDb();
  const row = db.accessTokens.find((a) => a.token === token);
  if (!row) fail(401, 'Your session has ended. Please sign in again.', 'TOKEN_INVALID');
  if (new Date(row.expiresAt) <= now()) fail(401, 'Your session expired.', 'TOKEN_EXPIRED');
  const user = db.users.find((u) => u.id === row.userId);
  if (!user) fail(401, 'Please sign in.', 'TOKEN_INVALID');
  assertActive(user);
  return user;
}
