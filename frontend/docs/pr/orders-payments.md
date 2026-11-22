# Orders, payments and the ledger in the backend (Phase 1, Weeks 12–15, module 1)

## What changes
- **Database (Flyway V3):** fees per plan, payment sessions, saved payment methods, orders (fees, taxes and discount copied on at checkout), deliverables, add-ons, briefs, the order timeline, deliveries, disputes, reviews, the ledger and idempotency keys.
- **Core logic, ported one-to-one from the mock:**
  - `OrderStateMachine` (from `orderMachine.ts`): same states, transitions, guards, error codes and money movements. It's pure: it takes the current state and returns the next state, the event, the ledger lines and the payment action.
  - `Money` (from `fees.ts` and `tax.ts`): fees in basis points rounded half up, GST 18% on platform fees, GST on the price for registered creators, TDS 0.1% and TCS 0.5%. Integer paise only.
  - `LedgerLines` (from `ledger.ts`): one builder per money movement. Any transaction that doesn't sum to zero is refused.
- **Endpoints, matching the mock:**
  - **Checkout (FR-30, FR-31, FR-60):** `GET /orders/quote`, then `POST /orders` with an `Idempotency-Key`. The Razorpay payment is checked (signature and exact amount) before the order exists.
  - **Orders (FR-32 – FR-37):** list (urgent first) and detail, plus accept, decline, cancel, deliver, approve, request revision, dispute and edit brief. Every status change goes through the state machine.
  - **Reviews (FR-38):** `POST /orders/{id}/review` and `POST /reviews/{id}/reply`.
  - **Payments:** `POST /payments/sessions`, and `GET`/`DELETE /payments/methods`.
  - **Fees and dashboards:** public `GET /fees` with the plans, and `GET /brands/me/stats` (FR-71).
  - **Demo only:** `POST /dev/razorpay/pay` (stands in for Razorpay Checkout, with Razorpay's test values), `POST /dev/simulate-time` and `GET /dev/clock`.
- **Scheduled job:** every minute, orders not accepted within 72 hours expire and deliveries not reviewed within 72 hours are approved automatically. An order that two people act on at the same moment changes only once (optimistic lock).
- **Ledger:** every money movement is a balanced transaction, also written to the audit log (`MONEY_MOVEMENT`). Creator balances are summed from it.
- **Creator side now uses real data:**
  - Ratings and reviews on cards and profiles.
  - Completed orders and typical acceptance time, so the "accepts within 24 h" filter works.
  - Earnings and order counts on the creator dashboard.
  - A package with orders can no longer be deleted (`PACKAGE_HAS_ORDERS`).
- **Demo data:** 13 orders between Saltbay and Leo, at least one in every state. Two are close to a deadline, so "Simulate time" shows an expiry and an auto-approval straight away. Also one review, and a saved card and UPI ID for Saltbay.

## Checks
- `./mvnw test`: **187 tests pass** on H2, no Docker (87 new).
  - 57 unit tests ported from `orderMachine.test.ts`, `fees.test.ts`, `ledger.test.ts` and `tax.test.ts`, including the ₹10,000 example: the brand pays ₹11,180 and the creator receives ₹8,220.
  - 30 API tests ported from `orders.test.ts` and `payments.test.ts`: checkout, idempotency, every action, refusals out of turn, Simulate time, failed, forged, reused and wrong-amount payments, saved methods, fees and dashboards.
- **Live check** on the running app (`h2` profile): quote, payment session, simulated Checkout, order, then accept, deliver, approve and review over HTTP.

## Not yet
- Razorpay is simulated: session ids are `order_sim…` and capture, release and refund are only logged. The signature check uses Razorpay's real algorithm. Connecting the account changes only session creation and those gateway calls.
- Coming in later modules:
  - Notifications.
  - Chat threads (`conversationId` is empty).
  - Promo codes and credits (any code gets 422 `PROMO_NOT_FOUND`).
  - Drafts, shipping and extensions.
  - The dispute workflow after opening, and the admin endpoints for cancelling orders and resolving disputes.
  - ShedLock, needed before running more than one instance.
- **Next:** payouts (balance, withdrawals, weekly payouts), then chat and notifications, campaigns, and collaboration extras.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
