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
export type CampaignStatus = S['CampaignStatus'];
export type CampaignInput = S['CampaignInput'];
export type CampaignSummary = S['CampaignSummary'];
export type CampaignDetail = S['CampaignDetail'];
export type CampaignPage = S['CampaignPage'];
export type ApplicationStatus = S['ApplicationStatus'];
export type Application = S['Application'];
export type ApplicationInput = S['ApplicationInput'];
export type ChatMessage = S['ChatMessage'];
export type MessageList = S['MessageList'];
export type Conversation = S['Conversation'];
export type ConversationList = S['ConversationList'];
export type NotificationType = S['NotificationType'];
export type AppNotification = S['Notification'];
export type NotificationPage = S['NotificationPage'];
export type MarkReadRequest = S['MarkReadRequest'];
export type DeliveredPost = S['DeliveredPost'];
export type BrandStats = S['BrandStats'];
export type AdminSummary = S['AdminSummary'];
export type VettingItem = S['VettingItem'];
export type AdminDispute = S['AdminDispute'];
export type ResolveDisputeRequest = S['ResolveDisputeRequest'];
export type AdminUser = S['AdminUser'];
export type AdminUserPage = S['AdminUserPage'];
export type UserStatusChange = S['UserStatusChange'];
export type FeeRates = S['FeeRates'];
export type FeeConfigEntry = S['FeeConfigEntry'];
export type FeeSettings = S['FeeSettings'];
export type FeeUpdate = S['FeeUpdate'];
export type AuditAction = S['AuditAction'];
export type AuditEntry = S['AuditEntry'];
export type AuditPage = S['AuditPage'];
export type ReportTargetType = S['ReportTargetType'];
export type ReportReason = S['ReportReason'];
export type ReportStatus = S['ReportStatus'];
export type ReportInput = S['ReportInput'];
export type Report = S['Report'];
export type ReportResolveRequest = S['ReportResolveRequest'];
export type Transfer = S['Transfer'];
export type Payout = S['Payout'];
export type PayoutOverview = S['PayoutOverview'];
// Payments and payouts (v2.0, India / Razorpay)
export type PaymentMethodType = S['PaymentMethodType'];
export type OrderTaxes = S['OrderTaxes'];
export type PackageAddon = S['PackageAddon'];
export type Draft = S['Draft'];
export type Shipment = S['Shipment'];
export type Extension = S['Extension'];
export type PostMetrics = S['PostMetrics'];
export type PostMetricsInput = S['PostMetricsInput'];
export type PaymentSession = S['PaymentSession'];
export type OrderPaymentInput = S['OrderPaymentInput'];
export type SavedPaymentMethod = S['SavedPaymentMethod'];
export type PayoutAccount = S['PayoutAccount'];
export type PayoutAccountInput = S['PayoutAccountInput'];
export type WithdrawalRequest = S['WithdrawalRequest'];
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

/* Phase D (v2.5) */
export type SavedList = S['SavedList'];
export type SavedListDetail = S['SavedListDetail'];
export type CreatorAvailability = S['CreatorAvailability'];
export type CampaignInvite = S['CampaignInvite'];
export type BrandRating = S['BrandRating'];
export type BrandReview = S['BrandReview'];
export type NotificationCategory = S['NotificationCategory'];
export type NotificationPreferences = S['NotificationPreferences'];
export type MessageAttachment = S['MessageAttachment'];
export type SearchSuggestion = S['SearchSuggestion'];

/* v3.0 */
export type InquiryAllowance = S['InquiryAllowance'];
export type BrandPlanApi = S['BrandPlan'];
export type DisputeReasonCode = S['DisputeReasonCode'];
export type ResolutionReason = S['ResolutionReason'];
export type DisputeEvidence = S['DisputeEvidence'];
export type DisputeEvidenceInput = S['DisputeEvidenceInput'];
export type DisputeReport = S['DisputeReport'];
export type PlanOffer = S['PlanOffer'];
export type PublicFees = S['PublicFees'];
export type BrandSubscription = S['BrandSubscription'];
export type SubscriptionInvoice = S['SubscriptionInvoice'];
export type SubscriptionRequest = S['SubscriptionRequest'];
