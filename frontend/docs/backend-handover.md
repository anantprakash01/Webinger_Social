# Backend handover — Phase 0 → Phase 1

> **Backend status (22 Nov 2026):** the API lives in `backend/` (repository root `README.md`). Built: foundation, Auth and `/me` (Weeks 7–8). Next: creators, search and vetting. Each section below is ported module by module; tick it here when it lands.


For the Spring Boot engineers building the Phase 1 API (CLAUDE.md §11). The React prototype runs entirely on an in-browser mock that follows the same rules the backend must follow. This document lists, per module, what the API must do and where the mock shows the expected behaviour.

- **Contract:** `docs/api/openapi.yaml` **v1.1.0** (v1.0.0 frozen 21 Nov 2026; v1.1 adds fields only, see "Contract v1.1" below). Implement it exactly. Any change needs a PR that bumps the version and regenerates the frontend types (`npm run gen:api`); `npm run check:contract` fails CI on drift.
- **Reference behaviour:** `src/api/mock/` — `server.ts` (routing, auth, idempotency, read-only impersonation), `handlers/*.ts` (one file per module), `orderMachine.ts`, `fees.ts`, `ledger.ts`, `payoutsCore.ts`. Unit tests next to them (`*.test.ts`) describe the expected cases and can be ported to JUnit.
- **Switching a module to the real API:** set `VITE_API_MODE=http` (everything goes through `src/api/client.ts`). Vite proxies `/api` and `/ws` to `localhost:8080`.

## Rules that apply everywhere

| Topic | Rule |
| --- | --- |
| IDs | 26-character ULIDs (`public_id`) in every URL and body. Never expose database ids. |
| Money | Integer cents + `currency` (USD in MVP). Fees in basis points, rounded half-up to whole cents (`fees.ts`). Never floats. |
| Errors | RFC 7807 `application/problem+json` with a machine `code`. 422 carries `errors: [{ field, message }]`; the frontend maps `field` onto form inputs, so field names must match the request body. |
| Status codes | 401 not signed in / token expired, 403 wrong role or not allowed, 404 unknown **or not yours** (never reveal another user's order or conversation), 409 state conflict, 422 validation. |
| Idempotency | `Idempotency-Key` on `POST /orders`, every order transition, `POST /applications/{id}/accept`, `POST /admin/disputes/{id}/resolve`. Store per user + key; replay the stored response; the same key on a different path → 422 `IDEMPOTENCY_KEY_REUSED`. |
| Pagination | `?page=&size=&sort=`, response `content` + `PageMeta` (`page`, `size`, `totalElements`, `totalPages`). Pages are 0-based in the API. |
| Validation | Bean Validation mirrors the Zod schemas in `src/features/*/schemas.ts` (the mock imports the same schemas). Keep messages user-readable; the frontend shows them as-is. |
| Time | UTC ISO-8601 everywhere. Order responses include `serverTime` so countdowns don't trust the device clock. |
| Read-only impersonation | A session started by `POST /admin/users/{id}/impersonate` carries the admin's id; any non-GET request except `/auth/logout` → 403 `READ_ONLY_IMPERSONATION`. No refresh token is issued for it. |

## Modules

### auth (FR-01 – FR-04)
Endpoints: `/auth/register`, `/login`, `/refresh`, `/logout`, `/oauth/google`, `/verify-email`, `/verify-email/resend`, `/forgot-password`, `/reset-password`. Mock: `handlers/auth.ts`, `handlers/session.ts`.
- Access token 15 min (JWT, `Authorization: Bearer`). Refresh token 7 days in an httpOnly, Secure, SameSite=Strict cookie scoped to `/api/v1/auth`, rotated on every use. Reuse of a rotated token revokes the whole family → 401 `REFRESH_REUSED`.
- Login: 10 per 15 min per IP → 429 `RATE_LIMITED`. Wrong email or password → the same 401 `INVALID_CREDENTIALS`. Suspended or banned users → 403 `ACCOUNT_SUSPENDED`.
- Google sign-up needs a role for new accounts (422 `ROLE_REQUIRED`).
- Verification and reset links are single-use; reset expires after 30 min (`TOKEN_EXPIRED` / `TOKEN_INVALID`). Resend: 5 per hour. Forgot-password always answers 202 (no account enumeration).
- Unverified users can browse but not place or accept orders (403 `EMAIL_NOT_VERIFIED` from the order core).
- Codes: `EMAIL_TAKEN`, `ALREADY_VERIFIED`, `GOOGLE_TOKEN_INVALID`, `REFRESH_EXPIRED`, `NOT_AUTHENTICATED`.

### user (`/me`)
`GET/PATCH /me`. Returns role, verification state, brand/creator summary, and `impersonatedBy` (admin's name) during a read-only view.

### creator + search (FR-10 – FR-24)
Public: `GET /creators` (search), `GET /creators/{username}`. Workspace: `/creators/me`, `/me/profile`, `/me/social-accounts`, `/me/packages`, `/me/portfolio`, `/me/submit-for-review`, `/me/stats`. Mock: `handlers/creators.ts`, `handlers/creatorMe.ts`.
- Only APPROVED creators whose user is ACTIVE appear in search or on the public profile; the owner and admins may preview otherwise. Profile GET counts a view unless it is the owner (FR-70).
- Search: keywords AND-matched over name, username, bio and niche labels, with relevance ranking; all FR-21 filters; 5 sorts; `size` max 24. With a `platform` filter, the card's reach and starting price use that platform.
- Username: 3–30 chars, starts with a letter, unique, reserved words blocked; locked after first approval (409 `USERNAME_LOCKED`).
- Packages: price ≥ $10, delivery 1–60 days, max 8 active (409 `PACKAGE_LIMIT`). Packages with orders can't be deleted, only switched off (409 `PACKAGE_HAS_ORDERS`). One social account per platform (`PLATFORM_EXISTS`). Portfolio max 12 (`PORTFOLIO_LIMIT`).
- Submitting for review needs a complete profile, at least one social, one active package and payouts set up (422 `PROFILE_INCOMPLETE` with the missing items).
- Edits are allowed while in review and after approval, with no re-review in MVP.

### brand (FR-05, FR-71)
`GET/PUT /brands/me/profile`, `GET /brands/me/stats`. Website normalised to https. Mock: `handlers/brands.ts`.

### file
`POST /files/presign` → S3 pre-signed PUT. Images JPEG/PNG/WebP ≤ 10 MB; deliverable video up to 500 MB. The mock stores downscaled data URLs instead.

### order — the core (FR-30 – FR-38, FR-60, FR-64)
Endpoints: `GET /orders/quote`, `POST /orders`, `GET /orders`, `GET /orders/{id}`, `POST /orders/{id}/accept|decline|deliver|brief|approve|request-revision|dispute|cancel`, `POST /orders/{id}/review`, `POST /reviews/{id}/reply`. Mock: `handlers/orders.ts` + **`orderMachine.ts`, the reference implementation of `OrderStateMachine`.**
- Every status change goes through one state machine; every money movement belongs to exactly one transition (CLAUDE.md §4). Port the cases in `orderMachine.test.ts` 1:1; target 100% branch coverage.
- Invalid transition → 409 `INVALID_TRANSITION`. Guard codes: `ACCEPT_WINDOW_PASSED`, `REVIEW_WINDOW_PASSED`, `REVISION_LIMIT` (max 2), `NOT_YET_DUE`, `NOT_ORDER_PARTICIPANT`, `INVALID_REFUND_AMOUNT`, `PRICE_TOO_LOW`, `INVALID_DELIVERY_DAYS`.
- Fees are copied onto the order at checkout from the current `fee_configs` row; later changes never alter existing orders.
- Deadlines: `accept_by` = created + 72 h; `due_at` = accepted + delivery days; `review_by` = delivered + 72 h. A revision request moves `due_at` to at least 3 days from now.
- `allowedActions` in the response drives the UI; the server re-checks every action anyway.
- Custom offers use "delivery within N days of acceptance", like packages. Order lists return `statusCounts` for the tabs.
- Checkout with a card that fails authorisation must not create an order. Create the order only after the PaymentIntent authorises.
- `orders.version` (`@Version`) so approve and auto-approve can't both win.
- Every transition emits an application event → notifications (both parties except the actor; system events go to both) and email.

### payment + ledger (FR-60 – FR-64) — India / Razorpay (contract v2.0)
Mock: `handlers/payments.ts`, `orderMachine.ts` (payment state), `ledger.ts`, `payoutsCore.ts`, `handlers/payouts.ts`.
- Currency INR, amounts in paise. Minimum package price ₹500.
- Checkout: `POST /payments/sessions` creates a Razorpay order for the exact total with `payment_capture=0`; the app pays it with Razorpay Custom Checkout (UPI, card, netbanking, wallet app); `POST /orders` (or `POST /applications/{id}/accept`) carries `{ sessionId, razorpayPaymentId, razorpaySignature }`. Verify the HMAC-SHA256 signature of `order_id|payment_id`, that the payment is `authorized` for the session amount and that the session is unused, **before** creating the order (402 `PAYMENT_FAILED`, 409 `AMOUNT_MISMATCH`, 409 `SESSION_USED`). Check email verification first (403 `EMAIL_NOT_VERIFIED`).
- Capture on accept; void/refund the authorisation on decline, expiry or cancel; refund (full or partial) to the original method on dispute.
- Saved methods are Razorpay customer tokens (RBI card-on-file tokenisation) and UPI IDs: `GET/DELETE /payments/methods`. Never store card numbers.
- No brand wallet: every order is paid through Razorpay.
- Double-entry ledger: accounts `BRAND_CHARGE`, `ESCROW`, `PLATFORM_REVENUE`, `CREATOR_BALANCE`, `PAYOUT`; each txn sums to zero (`findUnbalancedTxns` is the dev check; make it a DB-level test in Phase 1). Every txn is also an audit entry (`MONEY_MOVEMENT`).
- **Partial refund rule (provisional, see §16):** 1 cent up to the creator payout, taken from the creator's share; the platform keeps both fees. Full refund returns everything, including the brand fee.
- Payout account: `PUT /payouts/account` with PAN + bank account/IFSC or UPI ID creates/updates the Razorpay Route linked account and a RazorpayX fund account, and verifies it (penny drop / VPA validation). VERIFIED → `payoutStatus` ENABLED; FAILED keeps it PENDING with a reason. Orders to a creator without ENABLED payouts → 409 `CREATOR_PAYOUTS_DISABLED`.
- Payouts (FR-63) through RazorpayX: weekly every Monday 00:00 UTC for creators with `autoWeekly` on (`PUT /payouts/settings`), or on request with `POST /payouts/withdrawals` (Idempotency-Key): STANDARD (NEFT, free) or INSTANT (IMPS/UPI, 1% fee, min ₹10, posted to PLATFORM_REVENUE). Minimum ₹500; at most the available balance; needs a VERIFIED account (409 `PAYOUT_ACCOUNT_REQUIRED`). Each payout writes CREATOR_BALANCE → PAYOUT (+ fee), an audit entry and a `PAYOUT_SENT` notification.
- Webhooks: `POST /webhooks/razorpay`, signature-verified, idempotent through a webhook-events table (payment.authorized/captured/failed, refund.processed, payout.processed/reversed); hourly reconciliation job.
- Still to confirm with a CA: GST on platform fees, TDS under 194-O on creator payouts, and how both show on receipts.
- Receipts (FR-65): the prototype prints `/receipts/{orderId}` (brand receipt once captured; creator earnings statement once released). Phase 1 renders the same content as a PDF.

### jobs
Every 5 min: expire `PENDING_ACCEPTANCE` past `accept_by`; auto-approve `DELIVERED` past `review_by`. Hourly: overdue reminders, webhook reconciliation. Weekly: payouts. ShedLock on all of them. The mock runs the 5-minute jobs and payouts before every request (`runScheduledJobs`); the demo's "Simulate time" just moves the mock clock.

### campaign (FR-40 – FR-42)
`GET/POST /campaigns`, `GET /campaigns/{id}`, `POST /campaigns/{id}/close`, `POST /campaigns/{id}/applications`, `POST /applications/{id}/accept|reject|withdraw`. Mock: `handlers/campaigns.ts`.
- Brands see their own campaigns; creators see OPEN ones (or `applied=true`). Only approved creators apply (`CREATOR_NOT_APPROVED`); one application per campaign per creator (`ALREADY_APPLIED`); a withdrawn application can be re-sent (same row).
- Accepting an application places an order through the **same checkout core** as packages (`placeOrder`): price and delivery days from the application, campaign brief as the order brief.
- Closing declines pending applications; existing orders continue.

### chat + notification (FR-50 – FR-52)
`GET /conversations`, `GET/POST /conversations/{id}/messages`, `POST /conversations/{id}/read`, `GET /notifications`, `POST /notifications/read`. STOMP over `/ws` (Bearer token in CONNECT), topics `/user/queue/messages` and `/user/queue/notifications`. Mock: `handlers/chat.ts`, `notify.ts`, polling via `/dev/realtime/poll`.
- One conversation per order, participants only (others get 404).
- FR-51: before the order is COMPLETED, emails (incl. "(at)/(dot)") and phone-like runs of 7+ digits are masked **before storing**; the message carries `masked: true`. Port `maskContacts` and its tests.
- Chat messages don't create notifications; they show as unread counts.

### review (FR-38)
Brand reviews once per COMPLETED order (1–5 stars); the creator replies once. Updates `rating_avg` / `rating_count`.

### admin + audit (FR-80 – FR-85)
Endpoints: `GET /admin/summary`, `/admin/vetting`, `POST /admin/creators/{id}/approve|reject`, `GET /admin/disputes`, `POST /admin/disputes/{id}/resolve`, `GET /admin/users`, `PATCH /admin/users/{id}`, `POST /admin/users/{id}/impersonate`, `GET/PUT /admin/fees`, `GET /fees` (public current rates), `GET /admin/audit-logs`, `POST /reports`, `GET /admin/reports`, `POST /admin/reports/{id}/resolve`. Mock: `handlers/admin.ts`, `audit.ts`.
- All admin endpoints → 403 `ROLE_NOT_ALLOWED` for non-admins.
- Vetting: approve or reject (reason ≥ 10 chars) only from PENDING_REVIEW (409 otherwise); notify the creator (`PROFILE_APPROVED` / `PROFILE_REJECTED` + email).
- Disputes: RELEASE → `ADMIN_RELEASE`, FULL_REFUND / PARTIAL_REFUND → `ADMIN_REFUND` through the state machine; note ≥ 10 chars; idempotent.
- Users: ACTIVE / SUSPENDED / BANNED with a reason; not your own account (403 `SELF_CHANGE`); suspending or banning revokes all refresh tokens and hides a creator from search and profile.
- Impersonation: brands and creators only; audited as `IMPERSONATION_STARTED`; read-only (see above).
- Fees: 0–3000 bps each; a new row with `effective_from` and `changed_by`; audited as `FEES_CHANGED`.
- Reports: anyone signed in can report a creator (username), brand, message or review; 404 `TARGET_NOT_FOUND`, 409 `ALREADY_REPORTED` for a second open report on the same target by the same person. Admins mark ACTION_TAKEN or DISMISSED with a note.
- Audit log: append-only, newest first, filter by action; `before` / `after` JSON; IP recorded. Actions: `CREATOR_APPROVED`, `CREATOR_REJECTED`, `DISPUTE_RESOLVED`, `USER_STATUS_CHANGED`, `IMPERSONATION_STARTED`, `FEES_CHANGED`, `REPORT_RESOLVED`, `MONEY_MOVEMENT`, `PAYOUT_SENT`. Keep 7 years.

## Contract v1.1 (UX pass, additive)

| Change | Rule |
| --- | --- |
| `GET /orders` sort | Orders waiting on the caller first (`needsAction`), then open orders by nearest deadline, then the rest by newest activity. The dashboards' "Needs your action" list relies on it. |
| `CreatorProfile.completedOrders` | Completed orders for the creator. |
| `CreatorProfile.typicalAcceptHours` | Median hours from CREATE to ACCEPT over the last 20 accepted orders, rounded up, minimum 1; `null` with fewer than 3. |
| `BrandStats.spendByMonth` | Last 6 calendar months (UTC), oldest first, empty months included: captured totals by the month of capture minus refunds by the month of refund. |
| `ChatMessage.readAt` | When the other participant read the message (already tracked for unread counts). |
| `AdminUser.lastActiveAt` | Last sign-in or token refresh. The mock also counts order actions and chat messages for seeded users. `GET /admin/users` now lists newest accounts first. |

## Launch readiness (contract v2.2 – v2.6, branch `launch-readiness`)

All additive. Mock code to port: `handlers/account.ts`, `tax.ts`, `handlers/collab.ts`, `handlers/retention.ts`, `deliver.ts`, and the matching `*.test.ts`.

### Account (v2.2, DPDP / FR-06)
- `POST /me/password` (current password required; revokes other sessions), `POST /me/email` (re-verify the new address; old address told), `POST /me/sessions/revoke-others`, `GET /me/export` (JSON of everything we hold about the caller).
- `POST /me/deletion` schedules deletion in 30 days (409 `OPEN_ORDERS` while orders are open, 409 `BALANCE_REMAINING` while a creator has money to withdraw); `DELETE /me/deletion` cancels. A daily job anonymises the account after 30 days (orders, ledger and invoices are kept for tax law, with personal data removed).

### Admin cancel (FR-37)
- `POST /admin/orders/{id}/cancel` (Idempotency-Key, note ≥ 10): `ADMIN_CANCEL` from IN_PROGRESS or DELIVERED → REFUNDED, full refund to the original method; audited `ORDER_CANCELLED`.

### Indian taxes (v2.3) — confirm every rate with a CA
- `tax.ts` is the reference: GST 18% on both platform fees — CGST 9% + SGST 9% when the brand's state is the platform's (or unknown), else IGST 18%. GST-registered creators (GSTIN on a VERIFIED payout account) add 18% GST on their price, paid by the brand and passed through. At release: TDS u/s 194-O 0.1% of the price, and TCS u/s 52 CGST 0.5% for registered creators. Rounding: half-up on integer paise, per line.
- Taxes are computed at checkout and **copied onto the order** like the fees (`OrderTaxes`); later rate or profile changes never alter an order.
- Ledger accounts `GST_PAYABLE` and `TAX_WITHHELD`; every transaction still sums to zero. Brand total = price + creator GST + brand fee + GST on it. Creator payout = price + creator GST − creator fee − GST on it − TDS − TCS.
- Brand profile: `state` required for India, `gstin` optional (pattern, state code must match). Payout account: `gstin` optional, must contain the PAN. Receipts are tax invoices (SAC 998599 platform services; invoice no. `WC/<FY>/<id>`); `PayoutOverview` reports TDS/TCS for the financial year. Platform GSTIN/state are placeholders.

### Collaboration (v2.4)
- **Add-ons** on packages (`PackageAddon`: USAGE_RIGHTS with `usageDays` 7–365, RUSH with `rushDays` < delivery days, EXTRA_REVISION; one of each kind, ≥ ₹100). Chosen with `addonIds` on quote and checkout; the order fixes price (base + add-ons), delivery days (rush), `maxRevisions` (2 + extra) and a `usageRights` text. Unknown id → 422 `UNKNOWN_ADDON`. Editing a package keeps add-on ids by kind.
- **Drafts**: creator `POST /orders/{id}/drafts` while IN_PROGRESS (one PENDING at a time, 409 `DRAFT_PENDING`); brand `POST …/drafts/{draftId}/review` APPROVE or CHANGES (note ≥ 10). Drafts don't use revisions or move money.
- **Shipping**: brand `PUT /orders/{id}/shipment` (only when the brief needs shipping, 409 `NO_SHIPPING`; before delivery); creator `POST …/shipment/received` (409 `NOT_SHIPPED` / `ALREADY_RECEIVED`).
- **More time**: creator `POST /orders/{id}/extension` (1–14 days, reason, one pending); brand `POST …/extension/review` ACCEPT (moves `dueAt`, bumps `version`) or DECLINE.
- **Post results**: creator `PUT /orders/{id}/deliveries/{deliveryId}/metrics` on a POST_URL item once DELIVERED or COMPLETED; shown on the order and in `BrandStats.deliveredPosts`.
- Each writes an order event that is **not a state transition** (`DRAFT_SHARED`, `DRAFT_APPROVED`, `DRAFT_CHANGES_REQUESTED`, `SHIPPED`, `RECEIVED`, `EXTENSION_REQUESTED|ACCEPTED|DECLINED`, `METRICS_ADDED`; from = to status) and notifies the other side. Keep them out of `OrderStateMachine`.

### Retention and trust (v2.5)
- **Saved lists** (FR-25): brands only; max 20 lists × 200 creators; names unique per brand (409 `LIST_NAME_TAKEN`); add is idempotent; the list view only shows creators still approved and active.
- **Campaign invites** (FR-43): `POST /campaigns/{id}/invites` (open campaign, approved active creator, not away, not already invited or applied); creators see `myInvite` and `GET /campaigns?invited=true`; `POST /invites/{id}/decline`. An invite reads APPLIED once the creator has a live application. Notification type `CAMPAIGN_INVITE`.
- **Vacation mode**: `PUT /creators/me/availability` {away, until (inclusive, ≤ 1 year), message}. While away: `CreatorCard.away`, profile `availability`, and new orders / custom offers / hiring from campaigns / invites → 409 `CREATOR_AWAY`. Switches off by itself after `until`. Open orders continue.
- **Notification preferences** (FR-53): `GET/PUT /me/notification-preferences`; categories ORDERS, CAMPAIGNS, PAYOUTS, ACCOUNT, PRODUCT_NEWS × email / SMS / WhatsApp; in-app always on; SMS/WhatsApp need a +91 mobile (6–9 then 9 digits). Defaults: email on except PRODUCT_NEWS. Every notification goes through one delivery service (`deliver.ts`); security emails bypass it. SMS/WhatsApp providers (e.g. MSG91, Gupshup / WhatsApp Business API with DLT-registered templates) are not chosen yet.
- **Chat attachments**: one image (JPEG/PNG/WebP) or PDF ≤ 10 MB per message, uploaded with presign purpose `MESSAGE_ATTACHMENT` (the only purpose that accepts PDF); body may be empty when there is an attachment.
- **Brand ratings**: creator `POST /orders/{id}/brand-review` once, only when COMPLETED; `BrandRating` on campaigns and order detail.

### UI support (v2.6)
- `GET /creators?fastAccept=true`: creators whose `typicalAcceptHours` ≤ 24.
- `GET /creators/suggestions?q=`: up to 8 — niches and cities that start with the text, then approved creators by name word or username prefix. Public; cache briefly.

## Marketplace growth (contract v3.0 – v3.4, branch `marketplace-growth`)

Mock code to port: `handlers/chat.ts` (inquiries), `handlers/disputes.ts`, `handlers/plans.ts`, `handlers/promos.ts`, `handlers/finance.ts`, the ledger changes in `ledger.ts` / `orderMachine.ts`, and the matching `*.test.ts`. Shared rules: `src/lib/plans.ts`, `features/orders/schemas.ts` (disputes, promo code), `features/promos/schemas.ts`, `features/plans/schemas.ts`.

### Pre-booking inquiries (v3.0 — the one breaking change)
- `conversations.order_id` becomes nullable; inquiries store `brand_id` + `creator_id` (unique pair). `Conversation.kind` ORDER | INQUIRY; `orderId`/`orderStatus` null for inquiries.
- `POST /conversations/inquiries` (brand, verified email, approved active creator) opens or reuses the inquiry and stores the first message. Contacts are always masked in inquiries. New inquiries per rolling 30 days: FREE 5, PRO 50, PREMIUM unlimited → 429 `INQUIRY_LIMIT`. Notification `NEW_INQUIRY` only for a new inquiry. `GET /conversations/inquiries/allowance`; `CreatorProfile.myInquiryId`.

### Disputes (v3.1)
- `disputes` gains `reason_code`, `respond_by` (= opened + 48 h), `creator_response`, `responded_at`, `resolution_reason`; new table `dispute_evidence` (side, kind FILE|LINK, url, name, note). Max 5 items per side, only while OPEN.
- `POST /orders/{id}/dispute` takes optional `reasonCode`; `POST …/dispute/response` (creator, once, ≥ 20 chars, before `respond_by`: 409 `ALREADY_RESPONDED` / `RESPONSE_WINDOW_PASSED`); `POST …/dispute/evidence`. Presign purpose `DISPUTE_EVIDENCE` accepts PDF.
- `ResolveDisputeRequest.resolutionReason` is required. `GET /admin/disputes/report?days=` aggregates outcomes and reasons. Open disputes of PREMIUM brands sort first.

### Plans (FR-66, v3.2)
- `fee_configs` rows per plan (newest per plan applies); `PUT /admin/fees` takes `plan`. Quotes and orders use the brand's plan.
- `subscriptions` (brand, plan, cycle, period, cancel_at_period_end, next_plan, next_cycle, method) and `subscription_invoices` (number `WC/<FY>/S0001`, price, GST 18% CGST+SGST or IGST). Razorpay Subscriptions in production; the mock charges renewals in the scheduled jobs.
- Rules: higher plan or monthly→yearly starts today and is paid now (session purpose SUBSCRIPTION for price + GST, no proration); lower plan or yearly→monthly is scheduled for the period end; cancel keeps the plan until the period end; resume undoes either. Ledger per invoice `sub_<id>`: BRAND_CHARGE → PLATFORM_REVENUE (price) + GST_PAYABLE.
- `CampaignSummary.brandPlan` drives the "Pro brand" badge.

### Promo codes and referral credits (v3.3)
- New ledger account **PROMOTIONS** (platform marketing spend). Orders gain `discount` (promo_code, promo_cents, credit_cents), fixed at checkout. Brand is charged `total − discount` (≥ ₹1, else 422 `DISCOUNT_TOO_LARGE`).
  - Capture: BRAND_CHARGE (paid) + PROMOTIONS (discount) → ESCROW (full total). Release is unchanged.
  - Full refund (= what the brand paid): ESCROW → BRAND_CHARGE (paid) + PROMOTIONS (discount). Partial refund ≤ min(creator payout, paid).
  - CLOSED or fully refunded orders release the promo redemption and return the credit (`ORDER_RETURNED`).
- Promo validation on quote and order (422 field error `promoCode`): `PROMO_NOT_FOUND`, `PROMO_EXPIRED`, `PROMO_INACTIVE`, `PROMO_EXHAUSTED`, `PROMO_ALREADY_USED` (one use per brand), `PROMO_FIRST_ORDER` (brand has an order that is not CLOSED), `PROMO_MIN_ORDER` (on the price). Percent codes apply to the price, capped by `maxDiscountCents`.
- Credits: `credits` table of +/− entries per user; balance = sum. Promotional only — no purchase, withdrawal or transfer (not a prepaid instrument).
- Referrals: `users.referral_code`, `referred_by`, `referral_rewarded_at`. Sign-up `referralCode` must match the role (422 `REFERRAL_NOT_FOUND` / `REFERRAL_ROLE_MISMATCH`, checked before the account is created). Brand invitee +₹500 credit at sign-up; on the invitee's first COMPLETED order: inviting brand +₹1,000 credit, inviting creator +₹500 via PROMOTIONS → CREATOR_BALANCE (ref `ref_<referrer>_<referee>`, included in the creator's balance). Admin promo CRUD audited as `PROMO_CHANGED`.

### Finance (v3.4)
- `GET /admin/finance?days=` from the ledger (see `financeOverview`). Payout status FAILED with `failure_reason`: reversal PAYOUT (+ fee from PLATFORM_REVENUE) → CREATOR_BALANCE on the RazorpayX `payout.reversed`/`failed` webhook. `POST /admin/payouts/{id}/retry` once, to a VERIFIED account, if the balance still covers it (409 `NOT_FAILED`, `ALREADY_RETRIED`, `PAYOUT_ACCOUNT_NOT_VERIFIED`, `INSUFFICIENT_BALANCE`); audited `PAYOUT_RETRIED`.
- Reconciliation checks (port to the hourly job, plus Razorpay settlement and RazorpayX reports): balanced txns; BRAND_CHARGE per order = payment amount − refunds; ESCROW per order = total while accepted and unfinished, else 0; PAYOUT per payout = amount − fee (0 when failed); invoice charge = price + GST; Razorpay order amount = payment amount; no authorisation older than 5 days.

## Decisions still to confirm (CLAUDE.md §16 and §17)
- Partial-refund rule above (who absorbs a partial refund).
- Tax rates, TDS/TCS treatment and invoice format — confirm with a CA (CLAUDE.md §16).
- Legal pages (Terms, Privacy, Refunds) are templates for a lawyer; DPDP parental consent for creators under 18 (current minimum age 16).
- Username locked after first approval; no re-review of edits after approval.
- Brief shipping: brand gives a return address; the creator's address is exchanged in chat.
- Contact details stay masked in messages sent before completion (only masked text is stored).

## Test assets to port
- `src/api/mock/orderMachine.test.ts`, `fees.test.ts`, `ledger.test.ts` → JUnit (same cases, including the $200 fee example).
- `src/api/mock/handlers/*.test.ts` → Spring Boot integration tests (role and ownership checks, error codes).
- `e2e/smoke.spec.ts` (Playwright) runs against the real API by starting the app with `VITE_API_MODE=http`, once seed accounts exist.
