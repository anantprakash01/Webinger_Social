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
import * as admin from './handlers/admin';
import * as brands from './handlers/brands';
import * as campaigns from './handlers/campaigns';
import * as chat from './handlers/chat';
import * as creatorMe from './handlers/creatorMe';
import * as creators from './handlers/creators';
import * as files from './handlers/files';
import * as orders from './handlers/orders';
import * as payouts from './handlers/payouts';
import * as payments from './handlers/payments';
import * as account from './handlers/account';
import * as dev from './handlers/dev';
import * as me from './handlers/me';
import { authenticate, impersonatorOf } from './handlers/session';

interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  /** true = a valid access token is required (401 otherwise). 'optional' = used when sent. */
  auth: boolean | 'optional';
  /** Money-moving: honours the Idempotency-Key header (a retry returns the first result). */
  idempotent?: true;
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
  { method: 'PUT', path: '/me/avatar', auth: true, handler: me.updateMyAvatar },
  { method: 'POST', path: '/me/password', auth: true, handler: account.changePassword },
  { method: 'POST', path: '/me/email', auth: true, handler: account.changeEmail },
  { method: 'POST', path: '/me/sessions/revoke-others', auth: true, handler: account.signOutOtherDevices },
  { method: 'GET', path: '/me/export', auth: true, handler: account.exportMyData },
  { method: 'POST', path: '/me/deletion', auth: true, handler: account.requestDeletion },
  { method: 'DELETE', path: '/me/deletion', auth: true, handler: account.cancelDeletion },
  // Orders (Week 4). /orders/quote before /orders/:id, which would otherwise match "quote".
  { method: 'GET', path: '/orders/quote', auth: true, handler: orders.quoteOrder },
  { method: 'POST', path: '/orders', auth: true, handler: orders.createOrder, idempotent: true },
  { method: 'GET', path: '/orders', auth: true, handler: orders.listOrders },
  { method: 'GET', path: '/orders/:id', auth: true, handler: orders.getOrder },
  { method: 'POST', path: '/orders/:id/accept', auth: true, handler: orders.acceptOrder, idempotent: true },
  { method: 'POST', path: '/orders/:id/decline', auth: true, handler: orders.declineOrder, idempotent: true },
  { method: 'POST', path: '/orders/:id/deliver', auth: true, handler: orders.deliverOrder, idempotent: true },
  { method: 'POST', path: '/orders/:id/brief', auth: true, handler: orders.updateOrderBrief },
  { method: 'POST', path: '/orders/:id/approve', auth: true, handler: orders.approveOrder, idempotent: true },
  { method: 'POST', path: '/orders/:id/request-revision', auth: true, handler: orders.requestRevision, idempotent: true },
  { method: 'POST', path: '/orders/:id/dispute', auth: true, handler: orders.disputeOrder, idempotent: true },
  { method: 'POST', path: '/orders/:id/cancel', auth: true, handler: orders.cancelOrder, idempotent: true },
  { method: 'POST', path: '/orders/:id/review', auth: true, handler: orders.reviewOrder },
  { method: 'POST', path: '/reviews/:id/reply', auth: true, handler: orders.replyToReview },
  // Campaigns (Week 5)
  { method: 'GET', path: '/campaigns', auth: true, handler: campaigns.listCampaigns },
  { method: 'POST', path: '/campaigns', auth: true, handler: campaigns.createCampaign },
  { method: 'GET', path: '/campaigns/:id', auth: true, handler: campaigns.getCampaign },
  { method: 'POST', path: '/campaigns/:id/close', auth: true, handler: campaigns.closeCampaign },
  { method: 'POST', path: '/campaigns/:id/applications', auth: true, handler: campaigns.applyToCampaign },
  { method: 'POST', path: '/applications/:id/accept', auth: true, handler: campaigns.acceptApplication, idempotent: true },
  { method: 'POST', path: '/applications/:id/reject', auth: true, handler: campaigns.rejectApplication },
  { method: 'POST', path: '/applications/:id/withdraw', auth: true, handler: campaigns.withdrawApplication },
  // Chat and notifications (Week 5)
  { method: 'GET', path: '/conversations', auth: true, handler: chat.listConversations },
  { method: 'GET', path: '/conversations/:id/messages', auth: true, handler: chat.listMessages },
  { method: 'POST', path: '/conversations/:id/messages', auth: true, handler: chat.sendMessage },
  { method: 'POST', path: '/conversations/:id/read', auth: true, handler: chat.markConversationRead },
  { method: 'GET', path: '/notifications', auth: true, handler: chat.listNotifications },
  { method: 'POST', path: '/notifications/read', auth: true, handler: chat.markNotificationsRead },
  { method: 'GET', path: '/brands/me/stats', auth: true, handler: brands.getMyBrandStats },
  // Admin (Week 6)
  { method: 'GET', path: '/admin/summary', auth: true, handler: admin.getAdminSummary },
  { method: 'GET', path: '/admin/vetting', auth: true, handler: admin.listVetting },
  { method: 'POST', path: '/admin/creators/:id/approve', auth: true, handler: admin.approveCreator },
  { method: 'POST', path: '/admin/creators/:id/reject', auth: true, handler: admin.rejectCreator },
  { method: 'GET', path: '/admin/disputes', auth: true, handler: admin.listDisputes },
  { method: 'POST', path: '/admin/disputes/:id/resolve', auth: true, handler: admin.resolveDispute, idempotent: true },
  { method: 'POST', path: '/admin/orders/:id/cancel', auth: true, handler: admin.cancelOrderAsAdmin, idempotent: true },
  { method: 'GET', path: '/admin/users', auth: true, handler: admin.listUsers },
  { method: 'PATCH', path: '/admin/users/:id', auth: true, handler: admin.updateUserStatus },
  { method: 'POST', path: '/admin/users/:id/impersonate', auth: true, handler: admin.impersonateUser },
  { method: 'GET', path: '/admin/fees', auth: true, handler: admin.getFees },
  { method: 'PUT', path: '/admin/fees', auth: true, handler: admin.updateFees },
  { method: 'GET', path: '/fees', auth: false, handler: admin.getCurrentFees },
  { method: 'GET', path: '/admin/audit-logs', auth: true, handler: admin.listAuditLogs },
  { method: 'POST', path: '/reports', auth: true, handler: admin.createReport },
  { method: 'GET', path: '/admin/reports', auth: true, handler: admin.listReports },
  { method: 'POST', path: '/admin/reports/:id/resolve', auth: true, handler: admin.resolveReport },
  { method: 'GET', path: '/payouts/balance', auth: true, handler: payouts.getPayoutBalance },
  { method: 'GET', path: '/payouts/account', auth: true, handler: payouts.getPayoutAccount },
  { method: 'PUT', path: '/payouts/account', auth: true, handler: payouts.savePayoutAccount },
  { method: 'POST', path: '/payouts/withdrawals', auth: true, handler: payouts.createWithdrawal, idempotent: true },
  { method: 'PUT', path: '/payouts/settings', auth: true, handler: payouts.updatePayoutSettings },
  // Payments (v2.0, Razorpay)
  { method: 'POST', path: '/payments/sessions', auth: true, handler: payments.createPaymentSession },
  { method: 'GET', path: '/payments/methods', auth: true, handler: payments.listPaymentMethods },
  { method: 'DELETE', path: '/payments/methods/:id', auth: true, handler: payments.deletePaymentMethod },
  { method: 'GET', path: '/brands/me/profile', auth: true, handler: brands.getMyBrandProfile },
  { method: 'PUT', path: '/brands/me/profile', auth: true, handler: brands.updateMyBrandProfile },
  { method: 'POST', path: '/files/presign', auth: true, handler: files.presignUpload },
  // Mock only
  { method: 'POST', path: '/dev/razorpay/pay', auth: true, handler: payments.mockRazorpayPay },
  { method: 'POST', path: '/dev/vetting-decision', auth: true, handler: dev.vettingDecision },
  { method: 'POST', path: '/dev/simulate-time', auth: false, handler: orders.simulateTime },
  { method: 'GET', path: '/dev/clock', auth: false, handler: orders.getClock },
  { method: 'GET', path: '/dev/realtime/poll', auth: true, handler: chat.pollRealtime },
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
  // Scheduled jobs (expiry, auto-approve) catch up before every request, like the backend's 5-minute jobs.
  orders.runScheduledJobs();
  let pathMatched = false;
  for (const route of ROUTES) {
    const params = match(route.path, path);
    if (!params) continue;
    pathMatched = true;
    if (route.method !== req.method) continue;
    try {
      const wantsUser = route.auth === true || (route.auth === 'optional' && !!req.headers.authorization);
      const user = wantsUser ? authenticate(req.headers.authorization) : (undefined as never);
      const impersonatedBy = wantsUser ? impersonatorOf(req.headers.authorization) : null;
      // FR-82: impersonation is read-only. Signing out is the one write it may do.
      if (impersonatedBy && req.method !== 'GET' && path !== '/auth/logout') {
        return problem(403, 'Forbidden', 'This is a read-only view. Stop viewing as this user to make changes.', 'READ_ONLY_IMPERSONATION');
      }
      const key = route.idempotent && user ? req.headers['idempotency-key'] : undefined;
      if (key) {
        const seen = getDb().idempotency.find((r) => r.key === key && r.userId === user.id);
        if (seen) {
          if (seen.method !== req.method || seen.path !== path) {
            return problem(422, 'Validation failed', 'This Idempotency-Key was already used for a different request.', 'IDEMPOTENCY_KEY_REUSED');
          }
          return { status: seen.status, body: structuredClone(seen.body) };
        }
      }
      const res = route.handler({ req, params, user, impersonatedBy });
      if (key && res.status >= 200 && res.status < 300) {
        getDb().idempotency.push({ key, userId: user.id, method: req.method, path, status: res.status, body: structuredClone(res.body), createdAt: new Date().toISOString() });
      }
      return res;
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
