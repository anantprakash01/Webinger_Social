/** Brand profile rules (FR-05), shared by the form and the mock API. */
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

export const brandProfileInputSchema = z.object({
  companyName: z.string().trim().min(2, { error: 'Enter your company name.' }).max(100, { error: 'Use at most 100 characters.' }),
  website: z.union([websiteSchema, z.null()]).optional(),
  logoUrl: z.string().min(1).nullable().optional(),
  industry: INDUSTRY,
  country: z.string().length(2, { error: 'Choose your country.' }).toUpperCase(),
});

export const brandProfileFormSchema = brandProfileInputSchema.extend({
  website: websiteSchema,
});
export type BrandProfileForm = z.input<typeof brandProfileFormSchema>;
