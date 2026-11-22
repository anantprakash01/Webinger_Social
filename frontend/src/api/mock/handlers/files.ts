/**
 * Mock for POST /files/presign. The real backend returns an S3 pre-signed PUT URL.
 * In mock mode there is no storage: the API client keeps a downscaled copy of the image as a
 * data URL instead of PUTting it (see `api.files.upload`), so `uploadUrl`/`fileUrl` here are placeholders.
 */
import { presignRequestSchema } from '@/features/files/schemas';
import type { PresignResponse } from '@/types';
import { now, randomToken } from '../db';
import { ok, parseBody, type Handler } from '../http';

export const presignUpload: Handler = ({ req, user }) => {
  const body = parseBody(presignRequestSchema, req.body);
  const ext = body.contentType.split('/')[1];
  const key = `${body.purpose.toLowerCase()}/${user.id}/${randomToken(8)}.${ext}`;
  const res: PresignResponse = {
    uploadUrl: `mock-upload://${key}`,
    method: 'PUT',
    headers: { 'Content-Type': body.contentType },
    fileUrl: `mock-file://${key}`,
    expiresAt: new Date(now().getTime() + 10 * 60_000).toISOString(),
  };
  return ok(res);
};
