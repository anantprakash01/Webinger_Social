/** Campaign rules (FR-40 – FR-42), shared by the forms and the mock API. */
import { z } from 'zod';
import { MIN_PRICE_CENTS } from '@/api/mock/fees';
import { parseDollarsToCents } from '@/lib/money';
import { MAX_NICHES, MAX_PRICE_CENTS } from '@/features/creators/schemas';

const PLATFORM = z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'UGC']);
const NICHE = z.enum([
  'BEAUTY', 'FASHION', 'FITNESS', 'FOOD', 'TRAVEL', 'TECH', 'GAMING', 'LIFESTYLE', 'PARENTING',
  'FINANCE', 'HOME', 'PETS', 'MUSIC', 'EDUCATION', 'COMEDY', 'WELLNESS', 'SUSTAINABILITY', 'AUTOMOTIVE',
]);
export const MAX_DEADLINE_DAYS = 180;

const money = (what: string) =>
  z
    .number({ error: `Enter ${what}.` })
    .int({ error: 'Whole cents only.' })
    .min(MIN_PRICE_CENTS, { error: 'The minimum is $10.' })
    .max(MAX_PRICE_CENTS, { error: 'The maximum is $100,000.' });

/** YYYY-MM-DD, from tomorrow up to 180 days ahead (checked against `today`, the server's date in the mock). */
export const deadlineSchema = (today: Date = new Date()) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Choose a date.' })
    .refine((d) => {
      const t = Date.parse(`${d}T00:00:00Z`);
      const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
      const days = (t - base) / 86_400_000;
      return Number.isFinite(t) && days >= 1 && days <= MAX_DEADLINE_DAYS;
    }, { error: `Choose a date between tomorrow and ${MAX_DEADLINE_DAYS} days from now.` });

export const campaignInputSchema = (today?: Date) =>
  z.object({
    title: z.string().trim().min(5, { error: 'Give the campaign a title (at least 5 characters).' }).max(100, { error: 'Use at most 100 characters.' }),
    brief: z.string().trim().min(30, { error: 'Describe the campaign in at least 30 characters.' }).max(4000, { error: 'Use at most 4000 characters.' }),
    platforms: z
      .array(PLATFORM)
      .min(1, { error: 'Choose at least one platform.' })
      .refine((p) => new Set(p).size === p.length, { error: 'Each platform only once.' }),
    niches: z
      .array(NICHE)
      .min(1, { error: 'Choose at least one niche.' })
      .max(MAX_NICHES, { error: `Choose up to ${MAX_NICHES} niches.` })
      .refine((n) => new Set(n).size === n.length, { error: 'Each niche only once.' }),
    deliverables: z
      .array(z.string().trim().min(2, { error: 'Too short.' }).max(120))
      .min(1, { error: 'List at least one deliverable.' })
      .max(10, { error: 'List up to 10 deliverables.' }),
    budgetPerCreatorCents: money('a budget per creator'),
    deadline: deadlineSchema(today),
  });

export const applicationInputSchema = z.object({
  pitch: z.string().trim().min(30, { error: 'Tell the brand why you are a good fit (at least 30 characters).' }).max(1000, { error: 'Use at most 1000 characters.' }),
  priceCents: money('your price'),
  deliveryDays: z.number({ error: 'Enter the number of days.' }).int().min(1, { error: 'Delivery must be 1 to 60 days.' }).max(60, { error: 'Delivery must be 1 to 60 days.' }),
});

export const applicationAcceptSchema = z.object({ note: z.string().trim().max(2000).nullable().optional() }).default({});

/* ---------- Form-only ---------- */

export interface CampaignFormValues {
  title: string;
  brief: string;
  platforms: Array<z.infer<typeof PLATFORM>>;
  niches: Array<z.infer<typeof NICHE>>;
  deliverablesText: string;
  budget: string;
  deadline: string;
}

export const campaignFormSchema = z
  .object({
    title: z.string(),
    brief: z.string(),
    platforms: z.array(PLATFORM),
    niches: z.array(NICHE),
    deliverablesText: z.string(),
    budget: z.string(),
    deadline: z.string(),
  })
  .transform((v, ctx) => {
    const cents = parseDollarsToCents(v.budget);
    if (cents === null) ctx.addIssue({ code: 'custom', path: ['budget'], message: v.budget.trim() ? 'Enter an amount like 250.' : 'Enter a budget per creator.' });
    const r = campaignInputSchema().safeParse({
      title: v.title,
      brief: v.brief,
      platforms: v.platforms,
      niches: v.niches,
      deliverables: v.deliverablesText.split('\n').map((s) => s.trim()).filter(Boolean),
      budgetPerCreatorCents: cents ?? 0,
      deadline: v.deadline,
    });
    if (!r.success) {
      for (const i of r.error.issues) {
        const key = i.path[0] === 'budgetPerCreatorCents' ? 'budget' : i.path[0] === 'deliverables' ? 'deliverablesText' : String(i.path[0]);
        if (key === 'budget' && cents === null) continue;
        ctx.addIssue({ code: 'custom', path: [key], message: i.message });
      }
      return z.NEVER;
    }
    return r.data;
  });

export const applicationFormSchema = z
  .object({ pitch: z.string(), price: z.string(), deliveryDays: z.string() })
  .transform((v, ctx) => {
    const cents = parseDollarsToCents(v.price);
    const days = /^\d+$/.test(v.deliveryDays.trim()) ? Number(v.deliveryDays) : NaN;
    if (cents === null) ctx.addIssue({ code: 'custom', path: ['price'], message: v.price.trim() ? 'Enter an amount like 250.' : 'Enter your price.' });
    const r = applicationInputSchema.safeParse({ pitch: v.pitch, priceCents: cents ?? 0, deliveryDays: days });
    if (!r.success) {
      for (const i of r.error.issues) {
        const key = i.path[0] === 'priceCents' ? 'price' : String(i.path[0]);
        if (key === 'price' && cents === null) continue;
        ctx.addIssue({ code: 'custom', path: [key], message: key === 'deliveryDays' && Number.isNaN(days) ? 'Enter a whole number of days.' : i.message });
      }
      return z.NEVER;
    }
    return r.data;
  });
export type ApplicationFormValues = z.input<typeof applicationFormSchema>;
