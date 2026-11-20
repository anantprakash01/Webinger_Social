import { beforeEach, describe, expect, it } from 'vitest';
import { api, currentUser } from '@/api/client';
import { ApiError } from '@/types';
import { getDb, resetDb } from '../db';
import { DEMO_PASSWORD, mockGoogleIdToken } from '../demo';
import { RESET_TTL_MS } from './auth';
import { ACCESS_TTL_MS } from './session';

const tokenFrom = (link: string | null) => new URL(link ?? '', 'http://x').searchParams.get('token')!;

async function expectApiError(p: Promise<unknown>, status: number, code?: string) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(status);
    if (code) expect((e as ApiError).code).toBe(code);
    return e as ApiError;
  }
  throw new Error(`Expected ${status}`);
}

beforeEach(async () => {
  await api.dev.reset();
});

describe('sign up and verify (FR-01, FR-02)', () => {
  it('registers an unverified brand, emails a link, and verifies it', async () => {
    const me = await api.auth.register({ role: 'BRAND', name: 'Rina Patel', email: 'Rina@Example.test', password: 'secret123', acceptTerms: true });
    expect(me).toMatchObject({ role: 'BRAND', email: 'rina@example.test', emailVerified: false, brand: { companyName: null } });
    expect(currentUser()?.id).toBe(me.id);

    const [mail] = await api.dev.outbox('rina@example.test');
    expect(mail.subject).toMatch(/confirm/i);
    const verified = await api.auth.verifyEmail(tokenFrom(mail.link));
    expect(verified.emailVerified).toBe(true);
    expect(currentUser()?.emailVerified).toBe(true);

    // Single use
    await expectApiError(api.auth.verifyEmail(tokenFrom(mail.link)), 422, 'TOKEN_INVALID');
  });

  it('creates creators as DRAFT', async () => {
    const me = await api.auth.register({ role: 'CREATOR', name: 'Kai Brennan', email: 'kai@example.test', password: 'secret123', acceptTerms: true });
    expect(me.creator).toEqual({ username: null, vettingStatus: 'DRAFT', rejectionReason: null });
  });

  it('answers 422 with field errors and 409 for a taken email', async () => {
    const bad = await expectApiError(
      api.auth.register({ role: 'BRAND', name: 'R', email: 'nope', password: 'short', acceptTerms: true }),
      422,
      'VALIDATION_FAILED',
    );
    expect(bad.fieldErrors.map((f) => f.field).sort()).toEqual(['email', 'name', 'password']);

    const taken = await expectApiError(
      api.auth.register({ role: 'BRAND', name: 'Maya', email: 'brand@demo.test', password: 'secret123', acceptTerms: true }),
      409,
      'EMAIL_TAKEN',
    );
    expect(taken.fieldErrors[0].field).toBe('email');
  });

  it('resend is refused once verified', async () => {
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    await expectApiError(api.auth.resendVerification(), 409, 'ALREADY_VERIFIED');
  });
});

describe('sign in', () => {
  it('signs in the demo accounts with the right roles', async () => {
    expect((await api.auth.login('brand@demo.test', DEMO_PASSWORD)).role).toBe('BRAND');
    expect((await api.auth.login('creator@demo.test', DEMO_PASSWORD)).creator?.vettingStatus).toBe('APPROVED');
    expect((await api.auth.login('newcreator@demo.test', DEMO_PASSWORD)).creator?.vettingStatus).toBe('DRAFT');
    expect((await api.auth.login('admin@demo.test', DEMO_PASSWORD)).role).toBe('ADMIN');
  });

  it('gives the same 401 for unknown email and wrong password', async () => {
    const a = await expectApiError(api.auth.login('nobody@demo.test', DEMO_PASSWORD), 401, 'INVALID_CREDENTIALS');
    const b = await expectApiError(api.auth.login('brand@demo.test', 'wrong-pass1'), 401, 'INVALID_CREDENTIALS');
    expect(a.message).toBe(b.message);
  });

  it('Google: new address needs a role, then signs in', async () => {
    await expectApiError(api.auth.google({ idToken: mockGoogleIdToken() }), 422, 'ROLE_REQUIRED');
    const me = await api.auth.google({ idToken: mockGoogleIdToken(), role: 'CREATOR' });
    expect(me).toMatchObject({ role: 'CREATOR', emailVerified: true });
    await api.auth.logout();
    expect((await api.auth.google({ idToken: mockGoogleIdToken() })).id).toBe(me.id);
  });
});

describe('access and refresh tokens (FR-04)', () => {
  it('refreshes an expired access token transparently and rotates the refresh token', async () => {
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    const before = getDb().refreshTokens.filter((r) => !r.revokedAt).length;
    getDb().clockOffsetMs = ACCESS_TTL_MS + 1_000;
    const me = await api.me.get();
    expect(me.email).toBe('brand@demo.test');
    const live = getDb().refreshTokens.filter((r) => !r.revokedAt);
    expect(live).toHaveLength(before);
    expect(getDb().refreshTokens.some((r) => r.revokedAt)).toBe(true);
  });

  it('signs out when the refresh token has expired too', async () => {
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    getDb().clockOffsetMs = 8 * 86_400_000;
    await expectApiError(api.me.get(), 401);
    expect(currentUser()).toBeNull();
  });

  it('rejects calls without a session', async () => {
    await expectApiError(api.me.get(), 401, 'NOT_AUTHENTICATED');
  });
});

describe('password reset (FR-03)', () => {
  it('always answers 202, emails a 30-minute link, and revokes sessions on success', async () => {
    await api.auth.forgotPassword('nobody@demo.test');
    expect(await api.dev.outbox('nobody@demo.test')).toEqual([]);

    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    await api.auth.forgotPassword('creator@demo.test');
    const [mail] = await api.dev.outbox('creator@demo.test');
    await api.auth.resetPassword({ token: tokenFrom(mail.link), password: 'newpass99' });
    expect(currentUser()).toBeNull();
    expect(getDb().refreshTokens.filter((r) => !r.revokedAt && r.userId === getDb().users.find((u) => u.email === 'creator@demo.test')!.id)).toEqual([]);

    await expectApiError(api.auth.login('creator@demo.test', DEMO_PASSWORD), 401);
    expect((await api.auth.login('creator@demo.test', 'newpass99')).role).toBe('CREATOR');
  });

  it('expires the link after 30 minutes', async () => {
    await api.auth.forgotPassword('brand@demo.test');
    const [mail] = await api.dev.outbox('brand@demo.test');
    getDb().clockOffsetMs = RESET_TTL_MS;
    await expectApiError(api.auth.resetPassword({ token: tokenFrom(mail.link), password: 'newpass99' }), 422, 'TOKEN_EXPIRED');
  });

  it('a newer link replaces the older one', async () => {
    await api.auth.forgotPassword('brand@demo.test');
    await api.auth.forgotPassword('brand@demo.test');
    const [newer, older] = await api.dev.outbox('brand@demo.test');
    await expectApiError(api.auth.resetPassword({ token: tokenFrom(older.link), password: 'newpass99' }), 422, 'TOKEN_INVALID');
    await api.auth.resetPassword({ token: tokenFrom(newer.link), password: 'newpass99' });
  });
});

describe('mock persistence', () => {
  it('reset restores the seed', async () => {
    await api.auth.register({ role: 'BRAND', name: 'Temp User', email: 'temp@example.test', password: 'secret123', acceptTerms: true });
    resetDb();
    expect(getDb().users.some((u) => u.email === 'temp@example.test')).toBe(false);
  });
});
