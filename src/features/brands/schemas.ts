/** Brand profile rules (FR-05), shared by the form and the mock API. */
import { GSTIN_PATTERN, INDIAN_STATES } from '@/api/mock/tax';
import { z } from 'zod';

const INDUSTRY = z.enum(['BEAUTY', 'FASHION', 'FOOD', 'HEALTH', 'HOME', 'TECH', 'TRAVEL', 'FINANCE', 'EDUCATION', 'PETS', 'AGENCY', 'OTHER'], {
  error: 'Choose an industry.',
});

/** Accepts "example.com", "http://…" or "https://…" and stores https://… ; empty = no website. */
const websiteSchema = z
  .string()
  .trim()
  .max(200, { error: 'Use at most 200 characters.' })
  .transform((s, ctx) => {
    if (!s) return null;
    const withScheme = /^https?:\/\//i.test(s) ? s.replace(/^http:\/\//i, 'https://') : `https://${s}`;
    try {
      const u = new URL(withScheme);
      if (!u.hostname.includes('.')) throw new Error('no dot');
      return u.toString().replace(/\/$/, '');
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a website like yourbrand.com' });
      return z.NEVER;
    }
  });

const baseBrand = z.object({
  companyName: z.string().trim().min(2, { error: 'Enter your company name.' }).max(100, { error: 'Use at most 100 characters.' }),
  website: z.union([websiteSchema, z.null()]).optional(),
  logoUrl: z.string().min(1).nullable().optional(),
  industry: INDUSTRY,
  country: z.string().length(2, { error: 'Choose your country.' }).toUpperCase(),
  /** v2.3: Indian state (GST place of supply) and optional GSTIN for input tax credit. */
  state: z.string().trim().toUpperCase().nullable().optional(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .transform((s) => s || null)
    .nullable()
    .optional(),
});

function checkTax(v: { country: string; state?: string | null; gstin?: string | null }, ctx: z.RefinementCtx) {
  if (v.country !== 'IN') return;
  const st = INDIAN_STATES.find((s) => s.code === v.state);
  if (!st) ctx.addIssue({ code: 'custom', path: ['state'], message: 'Choose your state (needed for GST on our invoices).' });
  if (v.gstin) {
    if (!GSTIN_PATTERN.test(v.gstin)) ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'Enter a 15-character GSTIN, e.g. 29ABCDE1234F1Z5.' });
    else if (st && v.gstin.slice(0, 2) !== st.gst) ctx.addIssue({ code: 'custom', path: ['gstin'], message: `A ${st.name} GSTIN starts with ${st.gst}.` });
  }
}

export const brandProfileInputSchema = baseBrand.superRefine(checkTax);

export const brandProfileFormSchema = baseBrand.extend({ website: websiteSchema }).superRefine(checkTax);
export type BrandProfileForm = z.input<typeof brandProfileFormSchema>;
