# Backend handover — Phase 0 → Phase 1

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

## Decisions still to confirm (CLAUDE.md §16 and §17)
- Partial-refund rule above (who absorbs a partial refund).
- Launch market and payment provider (USD/Stripe vs INR/Razorpay) — changes the payment module.
- Username locked after first approval; no re-review of edits after approval.
- Brief shipping: brand gives a return address; the creator's address is exchanged in chat.
- Contact details stay masked in messages sent before completion (only masked text is stored).

## Test assets to port
- `src/api/mock/orderMachine.test.ts`, `fees.test.ts`, `ledger.test.ts` → JUnit (same cases, including the $200 fee example).
- `src/api/mock/handlers/*.test.ts` → Spring Boot integration tests (role and ownership checks, error codes).
- `e2e/smoke.spec.ts` (Playwright) runs against the real API by starting the app with `VITE_API_MODE=http`, once seed accounts exist.
