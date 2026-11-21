/**
 * Chat rules (FR-50, FR-51). `maskContacts` runs on the server before a message is stored, while the
 * order is not yet completed, so contact details never reach the other side and deals stay on-platform.
 */
import { z } from 'zod';

export const MAX_MESSAGE_LENGTH = 2000;

export const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const attachmentSchema = z.object({
  url: z.string().min(1).max(15_000_000),
  name: z.string().trim().min(1).max(200),
  contentType: z.enum(ATTACHMENT_TYPES, { error: 'Send an image or a PDF.' }),
  sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024, { error: 'Files can be at most 10 MB.' }),
});

/** Text, an attachment (phase D), or both. */
export const messageInputSchema = z
  .object({
    body: z.string().trim().max(MAX_MESSAGE_LENGTH, { error: `Use at most ${MAX_MESSAGE_LENGTH} characters.` }).default(''),
    attachment: attachmentSchema.nullable().optional(),
  })
  .refine((v) => v.body.length > 0 || !!v.attachment, { error: 'Write a message.', path: ['body'] });

export const markReadSchema = z
  .object({ ids: z.array(z.string().min(1)).max(100).optional(), all: z.boolean().optional() })
  .refine((v) => v.all === true || (v.ids?.length ?? 0) > 0, { error: 'Send ids, or all: true.', path: ['ids'] });

const EMAIL = /[A-Za-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Za-z0-9-]+(?:\s*(?:\.|\(dot\)|\[dot\])\s*[A-Za-z0-9-]+)+/gi;
/** Runs of digits with common separators, 7 or more digits in total (phone-like). */
const PHONE_CANDIDATE = /\+?\(?\d[\d\s().\-/]{5,}\d/g;

/** Replaces emails and phone numbers. Returns the new text and whether anything was hidden. */
export function maskContacts(text: string): { text: string; masked: boolean } {
  let masked = false;
  let out = text.replace(EMAIL, () => {
    masked = true;
    return '[email hidden]';
  });
  out = out.replace(PHONE_CANDIDATE, (m) => {
    if (m.replace(/\D/g, '').length < 7) return m;
    masked = true;
    return '[phone hidden]';
  });
  return { text: out, masked };
}
