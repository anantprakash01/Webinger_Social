/**
 * Mock for payout onboarding (FR-62, Stripe Connect Express).
 * The real flow: create the connected account → Stripe-hosted onboarding link → Stripe sends the
 * creator back to `returnUrl` → `account.updated` webhook marks payouts enabled.
 * The mock link opens an in-app imitation of Stripe's page (`/dev/stripe-connect`), whose submit button
 * calls `POST /dev/stripe/connect-complete` — standing in for the webhook.
 */
import { onboardingLinkRequestSchema } from '@/features/creators/schemas';
import type { OnboardingLink } from '@/types';
import { getDb, now, randomToken } from '../db';
import { creatorMoney, nextMonday } from '../payoutsCore';
import type { PayoutOverview } from '@/types';
import { fail, ok, parseBody, type Handler } from '../http';
import { myProfile } from './creatorMe';

export const createPayoutOnboardingLink: Handler = ({ req, user }) => {
  const p = myProfile(user);
  const { returnUrl } = parseBody(onboardingLinkRequestSchema, req.body);
  p.stripeAccountId ??= `acct_mock${randomToken(6)}`;
  const qs = new URLSearchParams({ account: p.stripeAccountId, return: returnUrl });
  const body: OnboardingLink = { url: `/dev/stripe-connect?${qs}`, expiresAt: new Date(now().getTime() + 5 * 60_000).toISOString() };
  return ok(body);
};

/** Mock-only: what Stripe's account.updated webhook would do once the creator finishes onboarding. */
export const completeMockConnectOnboarding: Handler = ({ req, user }) => {
  const p = myProfile(user);
  const accountId = (req.body as { accountId?: string } | undefined)?.accountId;
  if (!accountId || accountId !== p.stripeAccountId) fail(404, 'Unknown connected account.', 'NOT_FOUND');
  p.payoutStatus = 'ENABLED';
  return ok({ payoutStatus: p.payoutStatus });
};

/** FR-63: balance, transfers (approved work) and bank payouts. */
export const getPayoutBalance: Handler = ({ user }) => {
  const p = myProfile(user);
  const db = getDb();
  const money = creatorMoney(p.userId);
  const mine = new Set(db.orders.filter((o) => o.creatorUserId === p.userId).map((o) => o.id));
  const body: PayoutOverview = {
    currency: 'USD',
    availableCents: money.availableCents,
    inEscrowCents: money.inEscrowCents,
    lifetimeEarnedCents: money.lifetimeEarnedCents,
    paidOutCents: money.paidOutCents,
    nextPayoutAt: nextMonday(now()).toISOString(),
    schedule: 'WEEKLY_MONDAY',
    payoutStatus: p.payoutStatus,
    transfers: db.ledgerEntries
      .filter((e) => e.account === 'CREATOR_BALANCE' && e.debitCents > 0 && mine.has(e.orderId))
      .map((e) => ({ orderId: e.orderId, orderTitle: db.orderInfo.find((i) => i.orderId === e.orderId)?.title ?? 'Order', amountCents: e.debitCents, at: e.createdAt }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    payouts: db.payouts
      .filter((x) => x.creatorId === p.userId)
      .map((x) => ({ id: x.id, amountCents: x.amountCents, status: x.status, createdAt: x.createdAt, arrivalDate: x.arrivalDate }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
  return ok(body);
};
