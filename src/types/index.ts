/**
 * App-facing names for the generated contract types.
 * Never edit src/types/openapi.ts by hand: change docs/api/openapi.yaml and run `npm run gen:api`.
 */
import type { components } from './openapi';

type S = components['schemas'];

export type Money = S['Money'];
export type Problem = S['Problem'];
export type FieldError = S['FieldError'];
export type PageMeta = S['PageMeta'];
export type Page<T> = PageMeta & { content: T[] };

export type Role = S['Role'];
export type SignupRole = S['SignupRole'];
export type UserStatus = S['UserStatus'];
export type VettingStatus = S['VettingStatus'];
export type Me = S['Me'];
export type UpdateMeRequest = S['UpdateMeRequest'];

export type AuthSession = S['AuthSession'];
export type RegisterRequest = S['RegisterRequest'];
export type LoginRequest = S['LoginRequest'];
export type GoogleAuthRequest = S['GoogleAuthRequest'];
export type ResetPasswordRequest = S['ResetPasswordRequest'];

export type Platform = S['Platform'];
export type Niche = S['Niche'];
export type Gender = S['Gender'];
export type PlatformReach = S['PlatformReach'];
export type CreatorCard = S['CreatorCard'];
export type CreatorSearchPage = S['CreatorSearchPage'];
export type CreatorProfile = S['CreatorProfile'];
export type SocialAccount = S['SocialAccount'];
export type Package = S['Package'];
export type PortfolioItem = S['PortfolioItem'];
export type Review = S['Review'];
export type CreatorProfileInput = S['CreatorProfileInput'];
export type SocialAccountInput = S['SocialAccountInput'];
export type PackageInput = S['PackageInput'];
export type PackagePatch = S['PackagePatch'];
export type OwnPackage = S['OwnPackage'];
export type PortfolioItemInput = S['PortfolioItemInput'];
export type PayoutStatus = S['PayoutStatus'];
export type CreatorChecklist = S['CreatorChecklist'];
export type CreatorMe = S['CreatorMe'];
export type CreatorStats = S['CreatorStats'];
export type BrandIndustry = S['BrandIndustry'];
export type BrandProfile = S['BrandProfile'];
export type BrandProfileInput = S['BrandProfileInput'];
export type PresignRequest = S['PresignRequest'];
export type PresignResponse = S['PresignResponse'];
export type OnboardingLink = S['OnboardingLink'];
export type OrderStatusApi = S['OrderStatus'];
export type CloseReason = S['CloseReason'];
export type PaymentStatus = S['PaymentStatus'];
export type OrderAction = S['OrderAction'];
export type OrderKind = S['OrderKind'];
export type ShippingAddress = S['ShippingAddress'];
export type OrderBrief = S['OrderBrief'];
export type CustomOfferInput = S['CustomOfferInput'];
export type OrderCreateRequest = S['OrderCreateRequest'];
export type OrderCreated = S['OrderCreated'];
export type OrderQuote = S['OrderQuote'];
export type OrderParty = S['OrderParty'];
export type OrderMoney = S['OrderMoney'];
export type OrderSummary = S['OrderSummary'];
export type OrderPage = S['OrderPage'];
export type DeliveryItem = S['DeliveryItem'];
export type Delivery = S['Delivery'];
export type OrderEventView = S['OrderEventView'];
export type DisputeView = S['DisputeView'];
export type OrderDetail = S['OrderDetail'];
export type DeliverRequest = S['DeliverRequest'];
export type ReviewRequest = S['ReviewRequest'];
export type CreatorSearchQuery = NonNullable<import('./openapi').operations['searchCreators']['parameters']['query']>;

export const ROLE_LABEL: Record<Role, string> = {
  BRAND: 'Brand',
  CREATOR: 'Creator',
  ADMIN: 'Admin',
};

/** Error thrown by the API client for any non-2xx answer (RFC 7807 problem+json). */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors: FieldError[];
  readonly problem: Problem;
  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code;
    this.fieldErrors = problem.errors ?? [];
    this.problem = problem;
  }
}
