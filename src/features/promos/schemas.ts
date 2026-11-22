/** Promo code rules (v3.3), shared by the admin form and the mock API. */
import { z } from 'zod';

export const promoCodeInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{4,20}$/, { error: 'Use 4 to 20 letters and numbers, e.g. DIWALI10.' }),
    description: z.string().trim().min(3, { error: 'Describe the offer in a few words.' }).max(120),
    kind: z.enum(['PERCENT', 'FLAT']),
    percentBps: z.number().int().min(100, { error: 'At least 1%.' }).max(5000, { error: 'At most 50%.' }).nullable().optional(),
    flatCents: z.number().int().min(10_000, { error: 'At least ₹100.' }).nullable().optional(),
    maxDiscountCents: z.number().int().min(10_000, { error: 'At least ₹100.' }).nullable().optional(),
    minOrderCents: z.number().int().min(0).nullable().optional(),
    firstOrderOnly: z.boolean().optional(),
    maxRedemptions: z.number().int().min(1).nullable().optional(),
    validUntil: z.iso.date({ error: 'Use a date.' }).nullable().optional(),
  })
  .refine((v) => (v.kind === 'PERCENT' ? !!v.percentBps : !!v.flatCents), { error: 'Enter the discount.', path: ['percentBps'] });
