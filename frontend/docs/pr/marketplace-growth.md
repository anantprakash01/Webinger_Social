# Marketplace growth: message before booking, disputes, plans, promo codes and referrals, finance (contract v3.4.0)

Five features from the post-launch-readiness review, one commit each, all on the in-browser mock. Contract v2.6.0 → **v3.4.0**. The only breaking change is in v3.0: `Conversation.orderId` and `orderStatus` can now be null for pre-booking chats. `docs/backend-handover.md` → "Marketplace growth" has every rule for the Spring Boot team.

## What changes for people

### Message before booking (v3.0)
- Brands can **message a creator from their profile** before paying. There is one conversation per brand and creator, and email addresses and phone numbers are always hidden.
- The thread offers **See packages** and **Send an offer** so the deal moves onto the platform.
- New conversations per 30 days depend on the plan: Free 5, Pro 50, Premium unlimited.

### Disputes (v3.1)
- Brands pick a reason when they open a dispute.
- The creator can **respond once within 48 hours**.
- Both sides can add up to **5 pieces of evidence** each: an image, a PDF or a link.
- Admins must record **why** they decided. The new **Refund reasons** tab shows outcomes, amounts refunded and reasons for any period.
- Premium brands' disputes are listed first.

### Pro and Premium plans (FR-66, v3.2)

| Plan | Price | Service fee | Pre-booking chats |
| --- | --- | --- | --- |
| Free | ₹0 | 10% | 5 a month |
| Pro | ₹4,999/month | 5% | 50 a month |
| Premium | ₹14,999/month | 2% | Unlimited |

- Yearly billing costs 10 months. Every charge adds 18% GST and gets a GST invoice.
- Upgrades are paid now through Razorpay and start a new period today (no proration). Downgrades and cancellations take effect when the paid period ends. Renewals charge automatically.
- New `/brand/plan` page, and a **Pro brand / Premium brand** badge on campaigns.
- Admins edit the fees for each plan separately.

### Promo codes and referral credits (v3.3)
- At checkout, brands can enter a **promo code** and/or use their **referral credit**, and see "You pay".
- The platform pays for the discount. The creator's payout and the fees don't change.
- If the order is not accepted or is fully refunded, the code and the credit are given back.
- **Refer and earn** (`/referrals`) for brands and creators:
  - an invited brand gets ₹500 off;
  - the brand who invited them gets ₹1,000 credit after the new brand's first completed order;
  - a creator gets a ₹500 bonus in their balance after the creator they invited completes a first order.
- Sign-up accepts a referral code and shows who sent the invite.
- Credits can't be bought, withdrawn or transferred, so they are not a wallet.
- Admins create, pause and track promo codes (`/admin/promos`). Receipts show the discount as paid for by the platform.

### Finance dashboard (v3.4)
- `/admin/finance` shows the following, all from the ledger:
  - for the period: order volume, platform revenue, refunds, promotions, GST, TDS/TCS and payouts;
  - as of now: escrow, money owed to creators, GST payable and payment holds;
  - a 6-month chart.
- **Failed payouts:** the money goes back to the creator's balance. An admin can retry once to a verified account. Creators see the failure on their payouts page.
- **Reconciliation** compares the ledger with payments, escrow, payouts, plan invoices and Razorpay amounts. It also flags payments held uncaptured for more than 5 days. On the demo data everything matches.

## Money and ledger
- New account **PROMOTIONS**.
  - At capture, the brand's payment plus PROMOTIONS fund escrow at the full order total.
  - A full refund returns what the brand paid, and the discount goes back to PROMOTIONS.
  - Creator referral bonuses: PROMOTIONS → CREATOR_BALANCE.
- Plan charges: BRAND_CHARGE → PLATFORM_REVENUE + GST_PAYABLE, referenced as `sub_<invoice>`.
- Failed payouts are reversed: PAYOUT → CREATOR_BALANCE.
- Every transaction still sums to zero. Every money movement, including seeded ones, is in the audit log.

## Checks
- 266 unit and UI tests pass. `tsc`, lint and build are clean, and `check:contract` is in sync (v3.4.0).
- New test files: `inquiries`, `disputes`, `plans`, `promos` and `finance`, plus a checkout UI test for promo codes and credit.
- `check:layout` passes at 360 px and 1280 px, now including plan, referrals, messages, finance, promo codes and referral sign-up.
- `check:a11y` finds no WCAG 2.1 A/AA violations. The E2E smoke test passes.
- Mock data version is 16, so open demo tabs reset to the new seed.

## Demo
- Promo codes: `DIWALI10` (10% up to ₹2,000, minimum ₹5,000), `WELCOME500` (first order) and `MONSOON15` (expired).
- Maya (brand@demo.test) has ₹1,000 referral credit and the code `MAYA7K2Q`. Leo's code is `LEO4XR8M`.
- Copperleaf Candles is on Pro and has sent Leo a pre-booking message. Tidewell Swim is on Premium.
- The open dispute waits for the creator's response. The finance page has one failed payout to retry.

## Needs a decision or outside review
- Plan prices and fees, no proration, promo and referral amounts, and credit expiry (12 months suggested).
- Referral abuse rules. Referral codes with Google sign-up are not supported yet.
- GST on platform-funded discounts and referral bonuses: a CA needs to confirm.
- The 48-hour dispute response window.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
