/** Upload rules for POST /files/presign. Checked in the browser first so people see the reason at once. */
import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const presignRequestSchema = z
  .object({
    purpose: z.enum(['AVATAR', 'COVER', 'PORTFOLIO', 'BRAND_LOGO', 'BRIEF_REFERENCE', 'DELIVERABLE', 'MESSAGE_ATTACHMENT']),
    fileName: z.string().min(1).max(200),
    contentType: z.enum([...IMAGE_TYPES, 'application/pdf'], { error: 'Use a JPEG, PNG or WebP image.' }),
    sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES, { error: 'Images can be at most 10 MB.' }),
  })
  // Phase D: PDFs only as chat attachments.
  .refine((v) => v.contentType !== 'application/pdf' || v.purpose === 'MESSAGE_ATTACHMENT', { error: 'Use a JPEG, PNG or WebP image.', path: ['contentType'] });

/** Human-readable reason a file cannot be uploaded, or null when it is fine. */
export function uploadProblem(file: File, purpose?: string): string | null {
  const pdfOk = purpose === 'MESSAGE_ATTACHMENT' && file.type === 'application/pdf';
  if (!pdfOk && !(IMAGE_TYPES as readonly string[]).includes(file.type)) return purpose === 'MESSAGE_ATTACHMENT' ? 'Send an image (JPEG, PNG, WebP) or a PDF.' : 'Use a JPEG, PNG or WebP image.';
  if (file.size > MAX_UPLOAD_BYTES) return pdfOk ? 'Files can be at most 10 MB.' : 'Images can be at most 10 MB.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}
