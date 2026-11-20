/** Upload rules for POST /files/presign. Checked in the browser first so people see the reason at once. */
import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const presignRequestSchema = z.object({
  purpose: z.enum(['AVATAR', 'COVER', 'PORTFOLIO', 'BRAND_LOGO']),
  fileName: z.string().min(1).max(200),
  contentType: z.enum(IMAGE_TYPES, { error: 'Use a JPEG, PNG or WebP image.' }),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES, { error: 'Images can be at most 10 MB.' }),
});

/** Human-readable reason a file cannot be uploaded, or null when it is fine. */
export function uploadProblem(file: File): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Use a JPEG, PNG or WebP image.';
  if (file.size > MAX_UPLOAD_BYTES) return 'Images can be at most 10 MB.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}
