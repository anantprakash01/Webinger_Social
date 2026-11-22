/** Brand plan rules (FR-66, v3.2), shared by the plan page and the mock API. */
import { z } from 'zod';
import { orderPaymentInputSchema } from '@/features/payments/schemas';

export const subscriptionRequestSchema = z.object({
  plan: z.enum(['FREE', 'PRO', 'PREMIUM'], { error: 'Choose a plan.' }),
  cycle: z.enum(['MONTHLY', 'YEARLY'], { error: 'Choose monthly or yearly billing.' }),
  payment: orderPaymentInputSchema.nullable().optional(),
});
