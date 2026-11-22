# Creator payouts in the backend (Phase 1, Weeks 12–15, module 2)

> Builds on `orders-payments`, which adds the ledger it uses. Merge that PR first.

## What changes
- **Database (Flyway V4):** a `payouts` table, `job_runs` to track when the weekly payout last ran, and a weekly-payout setting on creator profiles (on by default).
- **Endpoints, matching the mock (FR-62, FR-63):**
  - `GET /payouts/balance`:
    - the available balance, money in escrow, lifetime earnings and amount paid out;
    - transfers (approved work moved to the balance, with order titles) and the payout history;
    - the payout account, the next Monday payout and the withdrawal rules;
    - TDS and TCS withheld this financial year (April to March).
  - `POST /payouts/withdrawals`, with an `Idempotency-Key`: standard is free and arrives the next working day; instant costs 1% (at least ₹10) and arrives in minutes. Minimum ₹500, at most the available balance. Without a verified payout account the answer is 409 `PAYOUT_ACCOUNT_REQUIRED`.
  - `PUT /payouts/settings`: turn the weekly payout on or off.
- **Weekly payout:** at each Monday 00:00 UTC, creators with the weekly payout on and a verified account are paid their whole balance. Payouts are marked PAID when they arrive. The demo "Simulate time" control runs this too.
- **Ledger:** each payout is a balanced transaction (`CREATOR_BALANCE` → `PAYOUT`, plus `PLATFORM_REVENUE` for an instant fee), referenced `payout_<id>` and recorded in the audit log as a payout.

## Checks
- `./mvnw test`: **195 tests pass** (8 new): the withdrawal cases ported from the mock's `payments.test.ts`, plus the overview, retries with the same key, the Monday run with the weekly payout on and off, roles, and financial-year and Monday date rules.
- **Live check** on the running app: an instant withdrawal of ₹1,000 charged a ₹10 fee and reduced the balance by ₹1,000.

## Not yet
- RazorpayX is simulated: payouts always succeed and arrive after the usual delay.
- Failed payouts and the admin retry come with the finance tools. Payout notifications come with the notifications module.
- ShedLock, needed before running more than one instance.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
