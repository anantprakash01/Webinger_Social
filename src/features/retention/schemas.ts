/** Phase D rules (shared by forms and the mock): saved lists, vacation mode, invites, notification preferences, brand reviews. */
import { z } from 'zod';

export const savedListInputSchema = z.object({
  name: z.string().trim().min(2, { error: 'Name the list (2+ characters).' }).max(60, { error: 'Use at most 60 characters.' }),
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `today` is YYYY-MM-DD in the server's clock; "until" must not be in the past and at most a year out. */
export const availabilitySchema = (today: string) =>
  z
    .object({
      away: z.boolean(),
      until: z.string().regex(DATE, { error: 'Pick a date.' }).nullable().optional(),
      message: z.string().trim().max(200, { error: 'Use at most 200 characters.' }).nullable().optional(),
    })
    .refine((v) => !v.away || !v.until || v.until >= today, { error: 'Pick today or a later date.', path: ['until'] })
    .refine(
      (v) => {
        if (!v.away || !v.until) return true;
        const max = new Date(`${today}T00:00:00Z`);
        max.setUTCFullYear(max.getUTCFullYear() + 1);
        return v.until <= max.toISOString().slice(0, 10);
      },
      { error: 'Up to a year ahead.', path: ['until'] },
    );

export const inviteInputSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, { error: 'Choose a creator.' }),
  message: z.string().trim().max(500, { error: 'Use at most 500 characters.' }).nullable().optional(),
});

/** Indian mobile: +91 and 10 digits starting 6–9. Accepts spaces/dashes and a bare 10-digit number. */
export const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;
export function normalisePhone(raw: string): string {
  const d = raw.replace(/[\s()-]/g, '');
  if (/^[6-9]\d{9}$/.test(d)) return `+91${d}`;
  if (/^91[6-9]\d{9}$/.test(d)) return `+${d}`;
  if (/^0[6-9]\d{9}$/.test(d)) return `+91${d.slice(1)}`;
  return d;
}

export const NOTIFICATION_CATEGORIES = ['ORDERS', 'CAMPAIGNS', 'PAYOUTS', 'ACCOUNT', 'PRODUCT_NEWS'] as const;

export const notificationPrefsSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .transform((s) => (s ? normalisePhone(s) : null))
      .refine((s) => s === null || INDIAN_MOBILE.test(s), { error: 'Enter a 10-digit Indian mobile number.' })
      .nullable()
      .optional(),
    categories: z
      .array(z.object({ category: z.enum(NOTIFICATION_CATEGORIES), email: z.boolean(), sms: z.boolean(), whatsapp: z.boolean() }))
      .max(NOTIFICATION_CATEGORIES.length),
  })
  .refine((v) => !!v.phone || v.categories.every((c) => !c.sms && !c.whatsapp), { error: 'Add a mobile number for SMS or WhatsApp.', path: ['phone'] });

export const brandReviewSchema = z.object({
  rating: z.number({ error: 'Choose a rating.' }).int().min(1, { error: 'Choose 1 to 5 stars.' }).max(5, { error: 'Choose 1 to 5 stars.' }),
  comment: z.string().trim().max(1000, { error: 'Use at most 1000 characters.' }).nullable().optional(),
});
