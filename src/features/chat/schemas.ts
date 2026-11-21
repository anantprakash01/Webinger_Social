/**
 * Chat rules (FR-50, FR-51). `maskContacts` runs on the server before a message is stored, while the
 * order is not yet completed, so contact details never reach the other side and deals stay on-platform.
 */
import { z } from 'zod';

export const MAX_MESSAGE_LENGTH = 2000;

export const messageInputSchema = z.object({
  body: z.string().trim().min(1, { error: 'Write a message.' }).max(MAX_MESSAGE_LENGTH, { error: `Use at most ${MAX_MESSAGE_LENGTH} characters.` }),
});

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
