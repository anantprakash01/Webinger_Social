/**
 * Brand plans (FR-66, contract v3.0). Shared by the mock server and the screens so prices and limits
 * read the same everywhere. The service fee per plan lives in fee_configs (admin-editable, FR-83);
 * the defaults here only seed it.
 */
import type { components } from '@/types/openapi';

export type BrandPlan = components['schemas']['BrandPlan'];
export type BillingCycle = 'MONTHLY' | 'YEARLY';

export interface PlanInfo {
  id: BrandPlan;
  name: string;
  /** Excluding GST. Integer paise. */
  monthlyCents: number;
  /** Two months free. Excluding GST. */
  yearlyCents: number;
  /** Default service fee (bps) seeded into fee_configs. */
  defaultBrandFeeBps: number;
  /** New pre-booking inquiries per rolling 30 days; null = unlimited. */
  inquiryLimit: number | null;
  tagline: string;
  features: string[];
}

export const PLANS: Record<BrandPlan, PlanInfo> = {
  FREE: {
    id: 'FREE',
    name: 'Free',
    monthlyCents: 0,
    yearlyCents: 0,
    defaultBrandFeeBps: 1000,
    inquiryLimit: 5,
    tagline: 'For trying the marketplace',
    features: ['Book any creator', 'Campaigns and saved lists', '5 pre-booking chats a month', 'Escrow on every order'],
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    monthlyCents: 4_999_00,
    yearlyCents: 49_990_00,
    defaultBrandFeeBps: 500,
    inquiryLimit: 50,
    tagline: 'For brands hiring every month',
    features: ['Service fee cut to 5%', '50 pre-booking chats a month', '“Pro brand” badge creators can see', 'Priority email support'],
  },
  PREMIUM: {
    id: 'PREMIUM',
    name: 'Premium',
    monthlyCents: 14_999_00,
    yearlyCents: 1_49_990_00,
    defaultBrandFeeBps: 200,
    inquiryLimit: null,
    tagline: 'For agencies and large teams',
    features: ['Service fee cut to 2%', 'Unlimited pre-booking chats', '“Premium brand” badge', 'Disputes handled first', 'Dedicated account manager'],
  },
};

export const PLAN_ORDER: BrandPlan[] = ['FREE', 'PRO', 'PREMIUM'];

export const planPriceCents = (plan: BrandPlan, cycle: BillingCycle) => (cycle === 'YEARLY' ? PLANS[plan].yearlyCents : PLANS[plan].monthlyCents);

/** Rolling window for the inquiry limit. */
export const INQUIRY_WINDOW_DAYS = 30;
