/** Mock for the Users module: GET /me, PATCH /me. */
import { updateMeRequestSchema } from '@/features/auth/schemas';
import { getDb, now } from '../db';
import { ok, parseBody, type Handler } from '../http';
import { toMe } from './session';

export const getMe: Handler = ({ user, impersonatedBy }) => ok(toMe(user, impersonatedBy ?? null));

export const updateMe: Handler = ({ req, user }) => {
  const body = parseBody(updateMeRequestSchema, req.body);
  if (body.name) {
    user.name = body.name;
    const creator = getDb().creatorProfiles.find((c) => c.userId === user.id);
    if (creator && creator.displayName === '') creator.displayName = body.name;
  }
  user.updatedAt = now().toISOString();
  return ok(toMe(user));
};
