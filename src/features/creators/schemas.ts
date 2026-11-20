/**
 * Creator workspace rules (FR-10 – FR-14, FR-16). They mirror the backend Bean Validation:
 * the forms use them for instant feedback and the mock API uses the request schemas to answer 422.
 */
import { z } from 'zod';
import { RESERVED_USERNAMES } from '@/lib/catalog';
import { parseDollarsToCents } from '@/lib/money';
import { MIN_PRICE_CENTS } from '@/api/mock/fees';

export const MAX_ACTIVE_PACKAGES = 8; // FR-13
export const MAX_PORTFOLIO_ITEMS = 12; // FR-14
export const MAX_NICHES = 3; // FR-10
export const MAX_PRICE_CENTS = 10_000_000; // $100,000 sanity cap
export const MIN_AGE = 16;
export const MAX_AGE = 90;

const PLATFORM = z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'UGC'], { error: 'Choose a platform.' });
const NICHE = z.enum([
  'BEAUTY', 'FASHION', 'FITNESS', 'FOOD', 'TRAVEL', 'TECH', 'GAMING', 'LIFESTYLE', 'PARENTING',
  'FINANCE', 'HOME', 'PETS', 'MUSIC', 'EDUCATION', 'COMEDY', 'WELLNESS', 'SUSTAINABILITY', 'AUTOMOTIVE',
]);
const GENDER = z.enum(['FEMALE', 'MALE', 'NON_BINARY']);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, { error: 'Use at least 3 characters.' })
  .max(30, { error: 'Use at most 30 characters.' })
  .regex(/^[a-z][a-z0-9._]*$/, { error: 'Start with a letter; then letters, numbers, dots or underscores.' })
  .refine((u) => !RESERVED_USERNAMES.includes(u), { error: 'That username is reserved. Try another.' });

/** Age is checked against the current year so the rule never goes stale. */
const birthYearSchema = z
  .number({ error: 'Enter a year like 1995.' })
  .int()
  .refine((y) => {
    const age = new Date().getFullYear() - y;
    return age >= MIN_AGE && age <= MAX_AGE;
  }, { error: `You need to be between ${MIN_AGE} and ${MAX_AGE}.` });

/* ---------- Request bodies (match docs/api/openapi.yaml) ---------- */

export const creatorProfileInputSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(2, { error: 'Enter at least 2 characters.' }).max(60, { error: 'Use at most 60 characters.' }),
  bio: z
    .string()
    .trim()
    .min(30, { error: 'Write at least 30 characters so brands know what you do.' })
    .max(1000, { error: 'Use at most 1000 characters.' }),
  city: z.string().trim().min(2, { error: 'Enter your city.' }).max(80),
  country: z.string().length(2, { error: 'Choose your country.' }).toUpperCase(),
  gender: GENDER.nullable().optional(),
  birthYear: birthYearSchema.nullable().optional(),
  languages: z.array(z.string().length(2)).min(1, { error: 'Choose at least one language.' }).max(5, { error: 'Choose up to 5 languages.' }),
  niches: z
    .array(NICHE)
    .min(1, { error: 'Choose at least one niche.' })
    .max(MAX_NICHES, { error: `Choose up to ${MAX_NICHES} niches.` })
    .refine((n) => new Set(n).size === n.length, { error: 'Each niche only once.' }),
  photoUrl: z.string().min(1).nullable().optional(),
  coverUrls: z.array(z.string().min(1)).max(3).optional(),
});

export const socialAccountInputSchema = z.object({
  platform: PLATFORM,
  handle: z
    .string()
    .trim()
    .transform((h) => h.replace(/^@/, ''))
    .pipe(z.string().min(2, { error: 'Enter your handle.' }).max(40).regex(/^[A-Za-z0-9._]+$/, { error: 'Letters, numbers, dots and underscores only.' })),
  followers: z.number({ error: 'Enter a number.' }).int({ error: 'Whole numbers only.' }).min(0, { error: 'Cannot be negative.' }).max(1_000_000_000),
});

const packageFields = {
  platform: PLATFORM,
  title: z.string().trim().min(3, { error: 'Give the package a short title.' }).max(80, { error: 'Use at most 80 characters.' }),
  description: z.string().trim().min(10, { error: 'Describe what the brand gets (at least 10 characters).' }).max(1000),
  deliverables: z
    .array(z.string().trim().min(2, { error: 'Too short.' }).max(120, { error: 'Use at most 120 characters.' }))
    .min(1, { error: 'List at least one deliverable.' })
    .max(10, { error: 'List up to 10 deliverables.' }),
  // FR-12 acceptance: under $10 is rejected with a field error.
  priceCents: z
    .number({ error: 'Enter a price.' })
    .int({ error: 'Prices are whole cents.' })
    .min(MIN_PRICE_CENTS, { error: 'The minimum price is $10.' })
    .max(MAX_PRICE_CENTS, { error: 'The maximum price is $100,000.' }),
  // FR-12 acceptance: delivery days outside 1–60 are rejected with a field error.
  deliveryDays: z
    .number({ error: 'Enter the number of days.' })
    .int({ error: 'Whole days only.' })
    .min(1, { error: 'Delivery must be 1 to 60 days.' })
    .max(60, { error: 'Delivery must be 1 to 60 days.' }),
};

export const packageInputSchema = z.object({ ...packageFields, active: z.boolean().default(true) });
export const packagePatchSchema = z
  .object({
    platform: packageFields.platform.optional(),
    title: packageFields.title.optional(),
    description: packageFields.description.optional(),
    deliverables: packageFields.deliverables.optional(),
    priceCents: packageFields.priceCents.optional(),
    deliveryDays: packageFields.deliveryDays.optional(),
    active: z.boolean().optional(),
  })
  .refine((p) => Object.keys(p).length > 0, { error: 'Nothing to change.' });

export const portfolioItemInputSchema = z
  .object({
    type: z.enum(['IMAGE', 'VIDEO_LINK']),
    url: z.string().trim().min(1, { error: 'Add an image or a link.' }).max(2_000_000),
    caption: z.string().trim().max(140, { error: 'Use at most 140 characters.' }).nullable().optional(),
  })
  .refine((v) => v.type !== 'VIDEO_LINK' || /^https:\/\/[^\s]+\.[^\s]+/.test(v.url), {
    error: 'Paste a full link starting with https://',
    path: ['url'],
  });

export const onboardingLinkRequestSchema = z.object({
  returnUrl: z.string().startsWith('/', { error: 'Return URL must be an app path.' }).max(300),
});

/* ---------- Form-only schemas ---------- */

/** Package form: price typed in dollars, deliverables one per line. */
export const packageFormSchema = z
  .object({
    platform: PLATFORM,
    title: packageFields.title,
    description: packageFields.description,
    deliverablesText: z.string(),
    price: z.string().trim().min(1, { error: 'Enter a price.' }),
    deliveryDays: z.string().trim().min(1, { error: 'Enter the number of days.' }),
    active: z.boolean(),
  })
  .transform((v, ctx) => {
    const priceCents = parseDollarsToCents(v.price);
    if (priceCents === null) ctx.addIssue({ code: 'custom', path: ['price'], message: 'Enter an amount like 150 or 149.99.' });
    const days = /^\d+$/.test(v.deliveryDays) ? Number(v.deliveryDays) : NaN;
    const out = {
      platform: v.platform,
      title: v.title,
      description: v.description,
      deliverables: v.deliverablesText.split('\n').map((s) => s.trim()).filter(Boolean),
      priceCents: priceCents ?? 0,
      deliveryDays: days,
      active: v.active,
    };
    const checked = packageInputSchema.safeParse(out);
    if (!checked.success) {
      for (const i of checked.error.issues) {
        const key = i.path[0] === 'priceCents' ? 'price' : i.path[0] === 'deliverables' ? 'deliverablesText' : String(i.path[0]);
        if (key === 'price' && priceCents === null) continue;
        ctx.addIssue({ code: 'custom', path: [key], message: Number.isNaN(days) && key === 'deliveryDays' ? 'Enter a whole number of days.' : i.message });
      }
      return z.NEVER;
    }
    return checked.data;
  });
export type PackageForm = z.input<typeof packageFormSchema>;

/** Profile form: birth year typed as text, empty = not given. */
export const profileFormSchema = creatorProfileInputSchema.extend({
  birthYear: z
    .string()
    .trim()
    .transform((s, ctx) => {
      if (!s) return null;
      const y = /^\d{4}$/.test(s) ? Number(s) : NaN;
      const r = birthYearSchema.safeParse(y);
      if (!r.success) {
        ctx.addIssue({ code: 'custom', message: Number.isNaN(y) ? 'Enter a year like 1995.' : r.error.issues[0].message });
        return z.NEVER;
      }
      return r.data;
    }),
  gender: z.union([GENDER, z.literal('')]).transform((g) => (g === '' ? null : g)),
});
export type ProfileForm = z.input<typeof profileFormSchema>;

export const socialFormSchema = z.object({
  platform: PLATFORM,
  handle: z.string(),
  followers: z.string(),
}).transform((v, ctx) => {
  const followers = /^\d[\d,]*$/.test(v.followers.trim()) ? Number(v.followers.replace(/,/g, '')) : NaN;
  const r = socialAccountInputSchema.safeParse({ platform: v.platform, handle: v.handle, followers });
  if (!r.success) {
    for (const i of r.error.issues) ctx.addIssue({ code: 'custom', path: i.path, message: i.path[0] === 'followers' && Number.isNaN(followers) ? 'Enter a whole number, e.g. 12500.' : i.message });
    return z.NEVER;
  }
  return r.data;
});
export type SocialForm = z.input<typeof socialFormSchema>;
