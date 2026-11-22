/**
 * Account settings (launch-readiness phase A, contract v2.2): change password and email, sign out other
 * devices, download my data, delete my account with a 30-day grace period (DPDP Act / FR-06).
 */
import { z } from 'zod';
import { emailSchema, passwordSchema } from '@/features/auth/schemas';
import { audit } from '../audit';
import { getDb, mockHash, now, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';
import { creatorMoney } from '../payoutsCore';
import { sendEmail, sendVerification } from './auth';
import { revokeAllSessions, toMe } from './session';

export const DELETION_GRACE_DAYS = 30;
const DAY = 86_400_000;

function checkPassword(user: UserRow, password: string | undefined) {
  // Google-only accounts have no password; they confirm by being signed in.
  if (user.passwordHash && user.passwordHash !== mockHash(password ?? '')) fail(422, 'Your current password is incorrect.', 'VALIDATION_FAILED', [{ field: 'currentPassword', message: 'Incorrect password.' }]);
}

const changePasswordSchema = z.object({ currentPassword: z.string().optional(), newPassword: passwordSchema });

/** Changes the password and signs out every other device. */
export const changePassword: Handler = ({ req, user }) => {
  const body = parseBody(changePasswordSchema, req.body);
  checkPassword(user, body.currentPassword);
  user.passwordHash = mockHash(body.newPassword);
  user.updatedAt = now().toISOString();
  revokeOthers(user, req.refreshCookie);
  sendEmail(user.email, 'Your password was changed', `Hi ${user.name}, your Webinger Collab password was just changed. If this wasn't you, reset it now and contact us.`, '/forgot-password');
  return { status: 204, body: undefined };
};

const changeEmailSchema = z.object({ newEmail: emailSchema, currentPassword: z.string().optional() });

/** Changes the sign-in email; the new address must be verified again (orders need a verified email, FR-02). */
export const changeEmail: Handler = ({ req, user }) => {
  const body = parseBody(changeEmailSchema, req.body);
  checkPassword(user, body.currentPassword);
  const db = getDb();
  const email = body.newEmail.toLowerCase();
  if (email === user.email) fail(422, 'That is already your email.', 'VALIDATION_FAILED', [{ field: 'newEmail', message: 'That is already your email.' }]);
  if (db.users.some((u) => u.email === email)) fail(409, 'This email already has an account.', 'EMAIL_TAKEN', [{ field: 'newEmail', message: 'This email already has an account.' }]);
  const old = user.email;
  user.email = email;
  user.emailVerifiedAt = null;
  user.updatedAt = now().toISOString();
  sendEmail(old, 'Your sign-in email was changed', `Hi ${user.name}, your Webinger Collab email was changed to ${email}. If this wasn't you, contact us right away.`, null);
  sendVerification(user);
  return ok(toMe(user));
};

/** Ends every session except this one (the current refresh-token family). */
function revokeOthers(user: UserRow, refreshCookie: string | null): number {
  const db = getDb();
  const current = db.refreshTokens.find((r) => r.token === refreshCookie && r.userId === user.id)?.familyId;
  const at = now().toISOString();
  let n = 0;
  const families = new Set<string>();
  for (const r of db.refreshTokens) {
    if (r.userId !== user.id || r.revokedAt || r.familyId === current) continue;
    r.revokedAt = at;
    families.add(r.familyId);
    n += 1;
  }
  return families.size || n;
}

export const signOutOtherDevices: Handler = ({ req, user }) => ok({ signedOut: revokeOthers(user, req.refreshCookie) });

/** DPDP right of access: everything we hold about the user, as JSON. */
export const exportMyData: Handler = ({ user }) => {
  const db = getDb();
  const mine = db.orders.filter((o) => o.brandUserId === user.id || o.creatorUserId === user.id);
  const ids = new Set(mine.map((o) => o.id));
  const conversations = new Set(db.conversations.filter((c) => (c.orderId === null ? c.brandUserId === user.id || c.creatorUserId === user.id : ids.has(c.orderId))).map((c) => c.id));
  const { passwordHash: _ph, googleSub: _gs, ...account } = user;
  void _ph;
  void _gs;
  return ok({
    exportedAt: now().toISOString(),
    account,
    creatorProfile: db.creatorProfiles.find((p) => p.userId === user.id) ?? null,
    socialAccounts: db.socialAccounts.filter((s) => s.creatorId === user.id),
    packages: db.packages.filter((k) => k.creatorId === user.id),
    portfolio: db.portfolioItems.filter((i) => i.creatorId === user.id),
    brandProfile: db.brandProfiles.find((b) => b.userId === user.id) ?? null,
    payoutAccount: db.payoutAccounts.filter((a) => a.creatorId === user.id).map((a) => ({ ...a, accountNumber: a.accountNumber ? `••••${a.accountNumber.slice(-4)}` : null })),
    savedPaymentMethods: db.savedMethods.filter((m) => m.userId === user.id),
    orders: mine.map((o) => ({ ...o, info: db.orderInfo.find((i) => i.orderId === o.id), brief: db.orderBriefs.find((b) => b.orderId === o.id) })),
    messagesSent: db.messages.filter((m) => m.senderUserId === user.id && conversations.has(m.conversationId)),
    reviews: db.reviews.filter((r) => r.creatorId === user.id || r.brandUserId === user.id),
    payouts: db.payouts.filter((p) => p.creatorId === user.id),
    notifications: db.notifications.filter((n) => n.userId === user.id),
  });
};

const OPEN = ['PENDING_ACCEPTANCE', 'IN_PROGRESS', 'DELIVERED', 'DISPUTED'];
const deletionSchema = z.object({ currentPassword: z.string().optional(), reason: z.string().max(500).nullable().optional() });

/** DPDP right to erasure: schedule deletion in 30 days; open orders and balances must be settled first. */
export const requestDeletion: Handler = ({ req, user }) => {
  const body = parseBody(deletionSchema, req.body);
  checkPassword(user, body.currentPassword);
  const db = getDb();
  const open = db.orders.filter((o) => (o.brandUserId === user.id || o.creatorUserId === user.id) && OPEN.includes(o.status)).length;
  if (open) fail(409, `You have ${open} open order${open === 1 ? '' : 's'}. Finish or cancel ${open === 1 ? 'it' : 'them'} before deleting your account.`, 'OPEN_ORDERS');
  if (user.role === 'CREATOR' && creatorMoney(user.id).availableCents > 0) fail(409, 'Withdraw your available balance before deleting your account.', 'BALANCE_REMAINING');
  if (user.role === 'ADMIN') fail(403, 'Admin accounts are closed by another admin.', 'ROLE_NOT_ALLOWED');
  user.deletionScheduledFor = new Date(now().getTime() + DELETION_GRACE_DAYS * DAY).toISOString();
  audit(user, { action: 'ACCOUNT_DELETION_REQUESTED', entityType: 'USER', entityId: user.id, summary: `Deletion scheduled for ${user.deletionScheduledFor.slice(0, 10)}`, before: null, after: { reason: body.reason ?? null } });
  sendEmail(user.email, 'Your account will be deleted', `Hi ${user.name}, your Webinger Collab account will be deleted on ${user.deletionScheduledFor.slice(0, 10)}. Sign in and cancel before then if you change your mind.`, '/settings');
  return ok(toMe(user));
};

export const cancelDeletion: Handler = ({ user }) => {
  user.deletionScheduledFor = null;
  return ok(toMe(user));
};

/**
 * Scheduled job: erase accounts whose grace period has passed. Orders, invoices and payouts stay
 * (tax law), but the person is anonymised and can no longer sign in.
 */
export function runAccountDeletions() {
  const db = getDb();
  const t = now();
  for (const u of db.users) {
    if (!u.deletionScheduledFor || new Date(u.deletionScheduledFor) > t) continue;
    revokeAllSessions(u.id);
    u.name = 'Deleted user';
    u.email = `deleted-${u.id.toLowerCase()}@deleted.invalid`;
    u.passwordHash = null;
    u.googleSub = null;
    u.status = 'BANNED';
    u.deletionScheduledFor = null;
    u.deletedAt = t.toISOString();
    const p = db.creatorProfiles.find((c) => c.userId === u.id);
    if (p) Object.assign(p, { displayName: 'Deleted creator', bio: null, photoUrl: null, coverUrls: [] });
    db.socialAccounts = db.socialAccounts.filter((s) => s.creatorId !== u.id);
    db.portfolioItems = db.portfolioItems.filter((i) => i.creatorId !== u.id);
    db.savedMethods = db.savedMethods.filter((m) => m.userId !== u.id);
    const b = db.brandProfiles.find((x) => x.userId === u.id);
    if (b) Object.assign(b, { website: null, logoUrl: null });
  }
}
