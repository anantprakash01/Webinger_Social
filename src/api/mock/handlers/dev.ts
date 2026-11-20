/**
 * Mock-only endpoints (Phase 0). Never part of the production contract.
 *   GET  /dev/outbox?to=  — emails the system "sent", so reviewers can open verification and reset links
 *   POST /dev/reset       — restore the seed ("Reset demo data")
 */
import { getDb, resetDb } from '../db';
import { ok, type Handler } from '../http';

export const outbox: Handler = ({ req }) => {
  const to = req.query.get('to')?.toLowerCase();
  return ok(getDb().outbox.filter((m) => !to || m.to === to).slice(0, 20));
};

export const reset: Handler = () => {
  resetDb();
  return { status: 204, setRefreshCookie: null };
};
