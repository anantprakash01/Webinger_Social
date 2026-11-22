/**
 * Order rules (FR-30 – FR-38). Request schemas mirror the backend Bean Validation; the mock answers 422
 * with them. Form schemas add the browser-side shapes (rupees, one deliverable per line).
 */
import { z } from 'zod';
import { MIN_PRICE_CENTS } from '@/api/mock/fees';
import { parseAmount } from '@/lib/money';
import { MAX_PRICE_CENTS } from '@/features/creators/schemas';

const PLATFORM = z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'UGC'], { error: 'Choose a platform.' });
const httpsUrl = (msg: string) =>
  z
    .string()
    .trim()
    .max(500)
    .refine((u) => /^https:\/\/[^\s/]+\.[^\s]+/.test(u), { error: msg });

export const shippingAddressSchema = z.object({
  name: z.string().trim().min(2, { error: 'Enter the recipient’s name.' }).max(100),
  line1: z.string().trim().min(3, { error: 'Enter the street address.' }).max(200),
  line2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(2, { error: 'Enter the city.' }).max(100),
  postalCode: z.string().trim().min(2, { error: 'Enter the postal code.' }).max(20),
  country: z.string().length(2, { error: 'Choose the country.' }).toUpperCase(),
});

/** FR-33 brief. */
export const briefSchema = z
  .object({
    requirements: z
      .string()
      .trim()
      .min(20, { error: 'Tell the creator what you need (at least 20 characters).' })
      .max(4000, { error: 'Use at most 4000 characters.' }),
    needsShipping: z.boolean(),
    shippingAddress: shippingAddressSchema.nullable().optional(),
    links: z.array(httpsUrl('Links must start with https://')).max(5, { error: 'Add up to 5 links.' }).default([]),
    referenceFiles: z.array(z.string().min(1)).max(5, { error: 'Add up to 5 files.' }).default([]),
  })
  .refine((b) => !b.needsShipping || !!b.shippingAddress, { error: 'Add the address the product ships from.', path: ['shippingAddress'] });

/** FR-31 custom offer. Same limits as packages. */
export const customOfferSchema = z.object({
  title: z.string().trim().min(3, { error: 'Give the offer a short title.' }).max(80, { error: 'Use at most 80 characters.' }),
  platform: PLATFORM,
  deliverables: z
    .array(z.string().trim().min(2, { error: 'Too short.' }).max(120))
    .min(1, { error: 'List at least one deliverable.' })
    .max(10, { error: 'List up to 10 deliverables.' }),
  priceCents: z
    .number({ error: 'Enter a price.' })
    .int({ error: 'Prices are whole cents.' })
    .min(MIN_PRICE_CENTS, { error: 'The minimum price is ₹500.' })
    .max(MAX_PRICE_CENTS, { error: 'The maximum price is ₹50,00,000.' }),
  deliveryDays: z.number({ error: 'Enter the number of days.' }).int().min(1, { error: 'Delivery must be 1 to 60 days.' }).max(60, { error: 'Delivery must be 1 to 60 days.' }),
});

export const orderCreateRequestSchema = z
  .object({
    packageId: z.string().min(1).optional(),
    creatorUsername: z.string().trim().toLowerCase().min(1).optional(),
    offer: customOfferSchema.optional(),
    brief: briefSchema,
    /** Checked by the payments module (v2.0): Razorpay proof or the brand wallet. */
    payment: z.unknown(),
    /** Phase C: package add-ons chosen at checkout. */
    addonIds: z.array(z.string().min(1)).max(5).optional(),
  })
  .refine((v) => (v.packageId ? !v.offer && !v.creatorUsername : !!v.offer && !!v.creatorUsername), {
    error: 'Send either a packageId, or a creatorUsername with an offer.',
    path: ['packageId'],
  });

export const deliveryItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('FILE'), url: z.string().min(1, { error: 'Upload a file.' }), name: z.string().trim().max(200).nullable().optional() }),
  z.object({ type: z.literal('POST_URL'), url: httpsUrl('Paste the full post link, starting with https://'), name: z.string().trim().max(200).nullable().optional() }),
]);

export const deliverRequestSchema = z.object({
  items: z.array(deliveryItemSchema).min(1, { error: 'Add at least one file or post link.' }).max(10, { error: 'Add up to 10 items.' }),
  note: z.string().trim().max(1000, { error: 'Use at most 1000 characters.' }).nullable().optional(),
});

/* ---------- Collaboration (phase C) ---------- */

export const draftReviewSchema = z
  .object({
    decision: z.enum(['APPROVE', 'CHANGES']),
    note: z.string().trim().max(2000, { error: 'Use at most 2000 characters.' }).nullable().optional(),
  })
  .refine((v) => v.decision === 'APPROVE' || (v.note ?? '').length >= 10, { error: 'Explain the changes in at least 10 characters.', path: ['note'] });

export const shipmentSchema = z.object({
  courier: z.string().trim().min(2, { error: 'Name the courier.' }).max(60),
  trackingNumber: z
    .string()
    .trim()
    .min(4, { error: 'Enter the tracking number.' })
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, { error: 'Letters, digits and dashes only.' }),
});

export const MAX_EXTENSION_DAYS = 14;
export const extensionRequestSchema = z.object({
  extraDays: z.number({ error: 'Enter the number of days.' }).int({ error: 'Whole days only.' }).min(1, { error: '1 to 14 days.' }).max(MAX_EXTENSION_DAYS, { error: '1 to 14 days.' }),
  reason: z.string().trim().min(10, { error: 'Explain in at least 10 characters.' }).max(500),
});
export const extensionReviewSchema = z.object({ decision: z.enum(['ACCEPT', 'DECLINE']) });

const count = z.number({ error: 'Enter a number.' }).int({ error: 'Whole numbers only.' }).min(0, { error: 'Cannot be negative.' }).max(10_000_000_000);
export const postMetricsSchema = z.object({
  itemIndex: z.number().int().min(0),
  views: count,
  likes: count,
  comments: count,
  shares: count.nullable().optional(),
  reach: count.nullable().optional(),
});

export const noteRequestSchema = z.object({
  note: z.string().trim().min(10, { error: 'Explain in at least 10 characters.' }).max(2000, { error: 'Use at most 2000 characters.' }),
});

export const reasonRequestSchema = z.object({ reason: z.string().trim().max(500).nullable().optional() }).default({});

/* ---------- Disputes (v3.1) ---------- */

export const DISPUTE_RESPONSE_HOURS = 48;
export const MAX_EVIDENCE_PER_SIDE = 5;

export const DISPUTE_REASONS = [
  { value: 'NOT_AS_BRIEFED', label: 'Doesn’t follow the brief' },
  { value: 'LOW_QUALITY', label: 'Quality is too low' },
  { value: 'NOT_DELIVERED', label: 'Not delivered / files missing' },
  { value: 'LATE', label: 'Delivered too late to use' },
  { value: 'POST_REMOVED', label: 'Post was deleted or edited' },
  { value: 'OTHER', label: 'Something else' },
] as const;
export type DisputeReasonValue = (typeof DISPUTE_REASONS)[number]['value'];

export const RESOLUTION_REASONS = [
  { value: 'WORK_MATCHES_BRIEF', label: 'Work matches the brief' },
  { value: 'BRIEF_NOT_FOLLOWED', label: 'Brief not followed' },
  { value: 'QUALITY_BELOW_STANDARD', label: 'Quality below standard' },
  { value: 'WORK_NOT_DELIVERED', label: 'Work not delivered' },
  { value: 'DELIVERED_LATE', label: 'Delivered late' },
  { value: 'POST_TAKEN_DOWN', label: 'Post taken down' },
  { value: 'CREATOR_UNRESPONSIVE', label: 'Creator did not respond' },
  { value: 'BRAND_UNRESPONSIVE', label: 'Brand did not respond' },
  { value: 'SETTLED_BY_PARTIES', label: 'Settled between the two sides' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const disputeRequestSchema = noteRequestSchema.extend({
  reasonCode: z.enum(DISPUTE_REASONS.map((r) => r.value) as [DisputeReasonValue, ...DisputeReasonValue[]]).default('OTHER'),
});

export const disputeResponseSchema = z.object({
  response: z.string().trim().min(20, { error: 'Explain your side in at least 20 characters.' }).max(2000, { error: 'Use at most 2000 characters.' }),
});

export const disputeEvidenceSchema = z
  .object({
    kind: z.enum(['FILE', 'LINK']),
    url: z.string().trim().min(1, { error: 'Add a file or a link.' }).max(15_000_000),
    name: z.string().trim().max(200).nullable().optional(),
    note: z.string().trim().max(500, { error: 'Use at most 500 characters.' }).nullable().optional(),
  })
  .refine((v) => v.kind !== 'LINK' || /^https:\/\/[^\s]+\.[^\s]+/.test(v.url), { error: 'Use a full https:// link.', path: ['url'] });

export const reviewRequestSchema = z.object({
  rating: z.number({ error: 'Choose a rating.' }).int().min(1, { error: 'Choose 1 to 5 stars.' }).max(5, { error: 'Choose 1 to 5 stars.' }),
  comment: z.string().trim().max(1000, { error: 'Use at most 1000 characters.' }).nullable().optional(),
});

export const replyRequestSchema = z.object({
  reply: z.string().trim().min(2, { error: 'Write a short reply.' }).max(500, { error: 'Use at most 500 characters.' }),
});

export const quoteQuerySchema = z
  .object({
    packageId: z.string().min(1).optional(),
    creatorUsername: z.string().trim().toLowerCase().min(1).optional(),
    priceCents: z.coerce.number().int().min(MIN_PRICE_CENTS, { error: 'The minimum price is ₹500.' }).max(MAX_PRICE_CENTS).optional(),
    addonIds: z.string().max(400).optional(),
  })
  .refine((q) => !!q.packageId || (!!q.creatorUsername && q.priceCents !== undefined), {
    error: 'Send a packageId, or a creatorUsername with a priceCents.',
    path: ['packageId'],
  });

/* ---------- Form-only ---------- */

/** Custom-offer fields as typed: price in rupees, deliverables one per line, days as text. */
export const offerFormSchema = z
  .object({
    title: z.string(),
    platform: PLATFORM,
    deliverablesText: z.string(),
    price: z.string(),
    deliveryDays: z.string(),
  })
  .transform((v, ctx) => {
    const priceCents = parseAmount(v.price);
    const days = /^\d+$/.test(v.deliveryDays.trim()) ? Number(v.deliveryDays) : NaN;
    if (priceCents === null) ctx.addIssue({ code: 'custom', path: ['price'], message: v.price.trim() ? 'Enter an amount like 150 or 149.99.' : 'Enter a price.' });
    const r = customOfferSchema.safeParse({
      title: v.title,
      platform: v.platform,
      deliverables: v.deliverablesText.split('\n').map((s) => s.trim()).filter(Boolean),
      priceCents: priceCents ?? 0,
      deliveryDays: days,
    });
    if (!r.success) {
      for (const i of r.error.issues) {
        const key = i.path[0] === 'priceCents' ? 'price' : i.path[0] === 'deliverables' ? 'deliverablesText' : String(i.path[0]);
        if (key === 'price' && priceCents === null) continue;
        ctx.addIssue({ code: 'custom', path: [key], message: key === 'deliveryDays' && Number.isNaN(days) ? 'Enter a whole number of days.' : i.message });
      }
      return z.NEVER;
    }
    return r.data;
  });
export type OfferForm = z.input<typeof offerFormSchema>;

/**
 * Mock card element (Phase 0). Real card data goes only to Razorpay (Custom
 * Checkout); this validates the shape for the mock's Razorpay stand-in and its test numbers.
 */
export const DECLINE_TEST_CARD = '4000000000000002';
export const SUCCESS_TEST_CARD = '4242424242424242';
export const mockCardSchema = z.object({
  number: z
    .string()
    .transform((s) => s.replace(/\s+/g, ''))
    .refine((n) => /^\d{16}$/.test(n) && luhn(n), { error: 'Enter a valid card number.' }),
  expiry: z
    .string()
    .trim()
    .refine((e) => {
      const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(e);
      if (!m) return false;
      const month = Number(m[1]);
      const year = 2000 + Number(m[2]);
      const now = new Date();
      return month >= 1 && month <= 12 && (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1));
    }, { error: 'Enter a future expiry date as MM / YY.' }),
  cvc: z.string().trim().regex(/^\d{3,4}$/, { error: 'Enter the 3 or 4 digits on the back.' }),
});
export type MockCard = z.input<typeof mockCardSchema>;

function luhn(n: string) {
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/* ---------- Checkout / brief form (strings as typed, validated with the request schemas) ---------- */

export interface CheckoutFormValues {
  requirements: string;
  linksText: string;
  referenceFiles: string[];
  needsShipping: boolean;
  shipName: string;
  shipLine1: string;
  shipLine2: string;
  shipCity: string;
  shipPostal: string;
  shipCountry: string;
  // Custom offer only
  title: string;
  platform: 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE' | 'UGC';
  deliverablesText: string;
  price: string;
  deliveryDays: string;
  // Mock card element only
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
}

export interface CheckoutFormOutput {
  /** Null when the form has no brief (accepting a campaign application reuses the campaign brief). */
  brief: z.output<typeof briefSchema> | null;
  offer: z.output<typeof customOfferSchema> | null;
  card: { number: string } | null;
}

const BRIEF_FIELD: Record<string, keyof CheckoutFormValues> = {
  requirements: 'requirements',
  links: 'linksText',
  referenceFiles: 'referenceFiles',
  needsShipping: 'needsShipping',
  shippingAddress: 'shipName',
  name: 'shipName',
  line1: 'shipLine1',
  line2: 'shipLine2',
  city: 'shipCity',
  postalCode: 'shipPostal',
  country: 'shipCountry',
};
const OFFER_FIELD: Record<string, keyof CheckoutFormValues> = {
  title: 'title',
  platform: 'platform',
  deliverablesText: 'deliverablesText',
  price: 'price',
  deliveryDays: 'deliveryDays',
};
const CARD_FIELD: Record<string, keyof CheckoutFormValues> = { number: 'cardNumber', expiry: 'cardExpiry', cvc: 'cardCvc' };

/** Maps an API field ("brief.shippingAddress.city", "offer.priceCents") to the form input that shows it. */
export function formFieldFor(apiField: string): keyof CheckoutFormValues | null {
  const parts = apiField.split('.');
  if (parts[0] === 'brief') return BRIEF_FIELD[parts[parts.length - 1]] ?? BRIEF_FIELD[parts[1]] ?? null;
  if (parts[0] === 'offer') return parts[1] === 'priceCents' ? 'price' : parts[1] === 'deliverables' ? 'deliverablesText' : OFFER_FIELD[parts[1]] ?? null;
  return null;
}

export function makeCheckoutSchema(opts: { offer: boolean; card: boolean; brief?: boolean }) {
  const withBrief = opts.brief ?? true;
  return z
    .object({
      requirements: z.string(),
      linksText: z.string(),
      referenceFiles: z.array(z.string()),
      needsShipping: z.boolean(),
      shipName: z.string(),
      shipLine1: z.string(),
      shipLine2: z.string(),
      shipCity: z.string(),
      shipPostal: z.string(),
      shipCountry: z.string(),
      title: z.string(),
      platform: z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'UGC']),
      deliverablesText: z.string(),
      price: z.string(),
      deliveryDays: z.string(),
      cardNumber: z.string(),
      cardExpiry: z.string(),
      cardCvc: z.string(),
    })
    .transform((v, ctx): CheckoutFormOutput => {
      let failed = false;
      const report = (path: keyof CheckoutFormValues, message: string) => {
        failed = true;
        ctx.addIssue({ code: 'custom', path: [path], message });
      };

      const brief = briefSchema.safeParse({
        requirements: v.requirements,
        needsShipping: v.needsShipping,
        shippingAddress: v.needsShipping
          ? { name: v.shipName, line1: v.shipLine1, line2: v.shipLine2 || null, city: v.shipCity, postalCode: v.shipPostal, country: v.shipCountry }
          : null,
        links: v.linksText.split('\n').map((s) => s.trim()).filter(Boolean),
        referenceFiles: v.referenceFiles,
      });
      if (withBrief && !brief.success) {
        for (const i of brief.error.issues) {
          const key = BRIEF_FIELD[String(i.path[i.path.length - 1])] ?? BRIEF_FIELD[String(i.path[0])];
          if (key) report(key, i.message);
        }
      }

      let offer: CheckoutFormOutput['offer'] = null;
      if (opts.offer) {
        const r = offerFormSchema.safeParse({ title: v.title, platform: v.platform, deliverablesText: v.deliverablesText, price: v.price, deliveryDays: v.deliveryDays });
        if (r.success) offer = r.data;
        else for (const i of r.error.issues) report(OFFER_FIELD[String(i.path[0])] ?? 'title', i.message);
      }

      let card: CheckoutFormOutput['card'] = null;
      if (opts.card) {
        const r = mockCardSchema.safeParse({ number: v.cardNumber, expiry: v.cardExpiry, cvc: v.cardCvc });
        if (r.success) card = { number: r.data.number };
        else for (const i of r.error.issues) report(CARD_FIELD[String(i.path[0])], i.message);
      }

      if (failed || (withBrief && !brief.success)) return z.NEVER;
      return { brief: withBrief && brief.success ? brief.data : null, offer, card };
    });
}

export const emptyCheckoutForm = (over: Partial<CheckoutFormValues> = {}): CheckoutFormValues => ({
  requirements: '',
  linksText: '',
  referenceFiles: [],
  needsShipping: false,
  shipName: '',
  shipLine1: '',
  shipLine2: '',
  shipCity: '',
  shipPostal: '',
  shipCountry: '',
  title: '',
  platform: 'INSTAGRAM',
  deliverablesText: '',
  price: '',
  deliveryDays: '7',
  cardNumber: '',
  cardExpiry: '',
  cardCvc: '',
  ...over,
});
