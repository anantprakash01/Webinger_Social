/**
 * Indian taxes on an order (launch-readiness phase B). Standard rates in force (confirm with a CA):
 *
 * - GST 18% on the platform's fees (the brand's service fee and the creator's commission). Supply of the
 *   platform's service: CGST 9% + SGST 9% when the brand is in the platform's state, IGST 18% otherwise.
 * - GST-registered creators charge 18% GST on their price; the brand pays it and it is passed to them.
 * - TDS u/s 194-O of the Income-tax Act: 0.1% of the creator's price (gross, excluding GST), withheld at release.
 *   (5% without PAN — PAN is mandatory for payouts here, so never applies.)
 * - TCS u/s 52 of the CGST Act: 0.5% of the creator's price for GST-registered creators, withheld at release.
 *
 * Rounding: half up to the paisa per line, integer arithmetic only (same as fees.ts).
 */
import { applyBps } from './fees';

export const GST_BPS = 1_800;
export const TDS_194O_BPS = 10;
export const TCS_GST_BPS = 50;

/** Placeholders until the company is registered. */
export const PLATFORM_STATE = 'KA';
export const PLATFORM_GSTIN = '29AAACW0000A1Z5';
export const PLATFORM_LEGAL_NAME = '[Company legal name]';
/** SAC for the platform's commission (other support services n.e.c.) and for the creator's advertising service. */
export const SAC_PLATFORM = '998599';
export const SAC_CREATOR = '998361';

export interface OrderTaxes {
  /** Brand's state is the platform's state: CGST + SGST instead of IGST. */
  intraState: boolean;
  creatorGstRegistered: boolean;
  creatorGstCents: number;
  brandFeeGstCents: number;
  creatorFeeGstCents: number;
  tdsCents: number;
  tcsCents: number;
}

export const NO_TAXES: OrderTaxes = { intraState: true, creatorGstRegistered: false, creatorGstCents: 0, brandFeeGstCents: 0, creatorFeeGstCents: 0, tdsCents: 0, tcsCents: 0 };

export function calculateTaxes(p: { priceCents: number; brandFeeCents: number; creatorFeeCents: number }, ctx: { intraState: boolean; creatorGstRegistered: boolean }): OrderTaxes {
  return {
    intraState: ctx.intraState,
    creatorGstRegistered: ctx.creatorGstRegistered,
    creatorGstCents: ctx.creatorGstRegistered ? applyBps(p.priceCents, GST_BPS) : 0,
    brandFeeGstCents: applyBps(p.brandFeeCents, GST_BPS),
    creatorFeeGstCents: applyBps(p.creatorFeeCents, GST_BPS),
    tdsCents: applyBps(p.priceCents, TDS_194O_BPS),
    tcsCents: ctx.creatorGstRegistered ? applyBps(p.priceCents, TCS_GST_BPS) : 0,
  };
}

/** CGST/SGST halves of an intra-state GST amount (the odd paisa goes to SGST). */
export const splitGst = (gstCents: number) => ({ cgstCents: Math.floor(gstCents / 2), sgstCents: gstCents - Math.floor(gstCents / 2) });

/** Indian states and union territories with their GST state codes (first two digits of a GSTIN). */
export const INDIAN_STATES: Array<{ code: string; gst: string; name: string }> = [
  { code: 'AN', gst: '35', name: 'Andaman and Nicobar Islands' },
  { code: 'AP', gst: '37', name: 'Andhra Pradesh' },
  { code: 'AR', gst: '12', name: 'Arunachal Pradesh' },
  { code: 'AS', gst: '18', name: 'Assam' },
  { code: 'BR', gst: '10', name: 'Bihar' },
  { code: 'CH', gst: '04', name: 'Chandigarh' },
  { code: 'CT', gst: '22', name: 'Chhattisgarh' },
  { code: 'DN', gst: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: 'DL', gst: '07', name: 'Delhi' },
  { code: 'GA', gst: '30', name: 'Goa' },
  { code: 'GJ', gst: '24', name: 'Gujarat' },
  { code: 'HR', gst: '06', name: 'Haryana' },
  { code: 'HP', gst: '02', name: 'Himachal Pradesh' },
  { code: 'JK', gst: '01', name: 'Jammu and Kashmir' },
  { code: 'JH', gst: '20', name: 'Jharkhand' },
  { code: 'KA', gst: '29', name: 'Karnataka' },
  { code: 'KL', gst: '32', name: 'Kerala' },
  { code: 'LA', gst: '38', name: 'Ladakh' },
  { code: 'LD', gst: '31', name: 'Lakshadweep' },
  { code: 'MP', gst: '23', name: 'Madhya Pradesh' },
  { code: 'MH', gst: '27', name: 'Maharashtra' },
  { code: 'MN', gst: '14', name: 'Manipur' },
  { code: 'ML', gst: '17', name: 'Meghalaya' },
  { code: 'MZ', gst: '15', name: 'Mizoram' },
  { code: 'NL', gst: '13', name: 'Nagaland' },
  { code: 'OR', gst: '21', name: 'Odisha' },
  { code: 'PY', gst: '34', name: 'Puducherry' },
  { code: 'PB', gst: '03', name: 'Punjab' },
  { code: 'RJ', gst: '08', name: 'Rajasthan' },
  { code: 'SK', gst: '11', name: 'Sikkim' },
  { code: 'TN', gst: '33', name: 'Tamil Nadu' },
  { code: 'TG', gst: '36', name: 'Telangana' },
  { code: 'TR', gst: '16', name: 'Tripura' },
  { code: 'UP', gst: '09', name: 'Uttar Pradesh' },
  { code: 'UK', gst: '05', name: 'Uttarakhand' },
  { code: 'WB', gst: '19', name: 'West Bengal' },
];
export const stateName = (code: string | null | undefined) => INDIAN_STATES.find((s) => s.code === code)?.name ?? null;

/** GSTIN: 2-digit state code + PAN + entity number + Z + checksum character. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
