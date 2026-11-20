/**
 * Mock for payout onboarding (FR-62, Stripe Connect Express).
 * The real flow: create the connected account → Stripe-hosted onboarding link → Stripe sends the
 * creator back to `returnUrl` → `account.updated` webhook marks payouts enabled.
 * The mock link opens an in-app imitation of Stripe's page (`/dev/stripe-connect`), whose submit button
 * calls `POST /dev/stripe/connect-complete` — standing in for the webhook.
 */
import { onboardingLinkRequestSchema } from '@/features/creators/schemas';
import type { OnboardingLink } from '@/types';
import { now, randomToken } from '../db';
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
