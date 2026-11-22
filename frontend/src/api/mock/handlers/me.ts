/** Mock for the Users module: GET /me, PATCH /me, PUT /me/avatar. */
import { z } from 'zod';
import { updateMeRequestSchema } from '@/features/auth/schemas';
import { getDb, now } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';
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

const avatarSchema = z.object({ url: z.string().min(1).max(2_000_000).nullable() });

/** v2.1: the account picture — creator photo, brand logo or admin avatar. */
export const updateMyAvatar: Handler = ({ req, user }) => {
  const { url } = parseBody(avatarSchema, req.body);
  const db = getDb();
  if (user.role === 'CREATOR') {
    if (!url) fail(422, 'Your profile needs a photo. Choose a new one instead.', 'VALIDATION_FAILED', [{ field: 'url', message: 'Your profile needs a photo.' }]);
    const p = db.creatorProfiles.find((c) => c.userId === user.id);
    if (p) p.photoUrl = url;
  } else if (user.role === 'BRAND') {
    const b = db.brandProfiles.find((x) => x.userId === user.id);
    if (b) b.logoUrl = url;
  } else {
    user.avatarUrl = url;
  }
  user.updatedAt = now().toISOString();
  return ok(toMe(user));
};
