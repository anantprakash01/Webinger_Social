/** Admin and report rules (FR-80 – FR-85), shared by the admin forms and the mock API. */
import { z } from 'zod';
import { parseDollarsToCents } from '@/lib/money';

export const MAX_FEE_BPS = 3000; // 30%

export const requiredReasonSchema = z.object({
  reason: z.string().trim().min(10, { error: 'Give a reason of at least 10 characters.' }).max(500, { error: 'Use at most 500 characters.' }),
});

export const resolveDisputeSchema = z
  .object({
    resolution: z.enum(['RELEASE', 'FULL_REFUND', 'PARTIAL_REFUND'], { error: 'Choose an outcome.' }),
    refundCents: z.number().int().positive().nullable().optional(),
    note: z.string().trim().min(10, { error: 'Explain the decision in at least 10 characters.' }).max(1000),
  })
  .refine((v) => v.resolution !== 'PARTIAL_REFUND' || (v.refundCents ?? 0) > 0, { error: 'Enter the refund amount.', path: ['refundCents'] });

export const userStatusChangeSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']),
  reason: z.string().trim().min(10, { error: 'Give a reason of at least 10 characters.' }).max(500),
});

const bps = z
  .number({ error: 'Enter a number of basis points.' })
  .int({ error: 'Whole basis points only.' })
  .min(0, { error: 'Cannot be negative.' })
  .max(MAX_FEE_BPS, { error: `At most ${MAX_FEE_BPS} bps (${MAX_FEE_BPS / 100}%).` });
export const feeUpdateSchema = z.object({ brandFeeBps: bps, creatorFeeBps: bps });

export const reportInputSchema = z.object({
  targetType: z.enum(['CREATOR', 'BRAND', 'MESSAGE', 'REVIEW']),
  targetId: z.string().trim().min(1).max(100),
  reason: z.enum(['SPAM', 'FAKE_ACCOUNT', 'INAPPROPRIATE', 'SCAM', 'OFF_PLATFORM_PAYMENT', 'OTHER'], { error: 'Choose a reason.' }),
  details: z.string().trim().max(1000, { error: 'Use at most 1000 characters.' }).nullable().optional(),
});

export const reportResolveSchema = z.object({
  status: z.enum(['DISMISSED', 'ACTION_TAKEN']),
  note: z.string().trim().min(5, { error: 'Add a short note (at least 5 characters).' }).max(1000),
});

export const REPORT_REASONS = [
  { value: 'SPAM', label: 'Spam' },
  { value: 'FAKE_ACCOUNT', label: 'Fake account or bought followers' },
  { value: 'INAPPROPRIATE', label: 'Inappropriate content' },
  { value: 'SCAM', label: 'Scam or fraud' },
  { value: 'OFF_PLATFORM_PAYMENT', label: 'Asking to pay outside the platform' },
  { value: 'OTHER', label: 'Something else' },
] as const;

/** Partial refund typed in dollars → cents, or null if invalid. */
export const refundToCents = (s: string) => parseDollarsToCents(s);
