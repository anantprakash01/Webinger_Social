/**
 * Mock-only endpoints (Phase 0). Never part of the production contract.
 *   GET  /dev/outbox?to=  — emails the system "sent", so reviewers can open verification and reset links
 *   POST /dev/reset       — restore the seed ("Reset demo data")
 *   POST /dev/vetting-decision — approve or reject the signed-in creator's profile in review, so a
 *                           reviewer can see every vetting state before the admin console exists (Week 6)
 */
import { getDb, resetDb } from '../db';
import { fail, ok, type Handler } from '../http';
import { decideVetting, myProfile, toCreatorMe } from './creatorMe';

export const outbox: Handler = ({ req }) => {
  const to = req.query.get('to')?.toLowerCase();
  return ok(getDb().outbox.filter((m) => !to || m.to === to).slice(0, 20));
};

export const reset: Handler = () => {
  resetDb();
  return { status: 204, setRefreshCookie: null };
};

export const vettingDecision: Handler = ({ req, user }) => {
  const p = myProfile(user);
  const body = (req.body ?? {}) as { decision?: string; reason?: string };
  if (body.decision !== 'APPROVE' && body.decision !== 'REJECT') fail(422, 'Decision must be APPROVE or REJECT.', 'VALIDATION_FAILED');
  decideVetting(p, body.decision, body.reason);
  return ok(toCreatorMe(p));
};
