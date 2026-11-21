## Summary

The prototype now targets **India: rupees (INR) and Razorpay**, with a complete payment flow on both sides:

- **Brands pay each order** by UPI, debit or credit card, netbanking or a wallet app (Paytm, PhonePe, Amazon Pay, MobiKwik). The payment is held when the order is placed and charged only when the creator accepts, as before. Cards and UPI IDs can be saved for next time.
- **Creators get paid** to a bank account or UPI ID (verified, with PAN). Money arrives every Monday automatically (which they can turn off), or whenever they choose with **Withdraw now**: standard (free) or instant (1%, at least ₹10).

API contract **v2.0.0** (breaking: Stripe → Razorpay). A brand wallet (prepaid balance) was built and then removed: in India a wallet used to pay other people is likely an RBI-regulated prepaid instrument.

## What changed

**Currency**
- All money in rupees, stored as integer paise. Shown in Indian format (₹1,25,000.00).
- Minimum package price ₹500. Seed prices converted at about ₹80 per $1.

**Brand payments**
- Checkout, custom offers and hiring from a campaign all use one payment picker: UPI, card (new or saved), netbanking (bank list) or wallet app. The brand's saved UPI ID is preselected.
- Flow, as with real Razorpay: `POST /payments/sessions` opens a Razorpay order for the exact total. The brand pays (Razorpay Custom Checkout; in the prototype, `POST /dev/razorpay/pay` stands in). `POST /orders` sends the payment id and signature.
- The server checks the signature, the amount and that the payment wasn't used before, all **before the order exists**, so a failed payment never creates an order.
- Card numbers never reach our servers. Saved cards are Razorpay tokens; only the network and last four digits are shown.
- New page **Payment methods** (`/brand/payment-methods`) to review and remove saved cards and UPI IDs.
- Order pages, receipts and the timeline show how the order was paid ("UPI · …", "Visa •••• 1111", "HDFC Bank netbanking").

**Creator payouts**
- The payout step in onboarding is now an in-app form: PAN and a bank account (number and IFSC) or a UPI ID, verified at once in the demo. It replaces the Stripe onboarding stand-in.
- `/creator/payouts`:
  - Payout account card (change account) and the weekly-payout on/off switch.
  - **Withdraw now** dialog: amount, standard or instant, fee and "you receive" shown before confirming.
  - Payout history with speed, fee and destination.
- The ledger posts instant-payout fees to platform revenue; every payout is audited and notified.

**Contract v2.0.0**
- New:
  - `POST /payments/sessions`
  - `GET/DELETE /payments/methods`
  - `GET/PUT /payouts/account`
  - `POST /payouts/withdrawals` (Idempotency-Key)
  - `PUT /payouts/settings`
- Changed: `payment` is now required on `POST /orders` and `POST /applications/{id}/accept`. `OrderPayment` gains `method` and `methodLabel`. `Payout` gains `feeCents`, `speed` and `destinationLabel`. `PayoutOverview` gains the account, settings and fee rules.
- Removed: `POST /payouts/onboarding-link` and `OrderCreated.stripeClientSecret`.
- `docs/backend-handover.md` describes the Razorpay rules for the backend (Route, RazorpayX, webhooks).

## Decisions to confirm

- Instant payout fee: 1%, at least ₹10. Minimum withdrawal: ₹500.
- Minimum package price: ₹500.
- No brand wallet. Bank payments go through netbanking or UPI.
- **New open questions for a CA/lawyer:** GST on platform fees, TDS under section 194-O on creator payouts, and whether the escrow model (Razorpay Route on-hold transfers) fits the RBI payment aggregator rules.

## How to test

1. `npm run dev`. As `brand@demo.test` / `demo1234`, open `/u/leomakes` → **Buy**. The saved UPI ID is preselected → **Pay ₹…**.
2. Try a new card `4000 0000 0000 0002` (declined, no order created), UPI `failure@razorpay` (failed), then netbanking (works).
3. **Payment methods** in the sidebar: remove a saved card.
4. As `creator@demo.test`: accept and deliver the order; as the brand, approve it.
5. As the creator, go to **Payouts → Withdraw now**: choose Instant and see the fee, then confirm. Also try **Change payout account** and the weekly switch.
6. As `newcreator@demo.test`: onboarding step 5 asks for PAN and bank details.

## Checks

- `npm test`: 216 passing (new: payment verification, all four methods, saved methods, withdrawals, weekly switch, failed UPI then netbanking at checkout)
- `tsc`, `npm run lint`, `npm run build`: clean
- `npm run check:layout`: every screen including the payment options, withdraw dialog and payout account form, at 360 px and 1280 px
- `npm run check:a11y`: no WCAG 2.1 A/AA violations
- `npm run check:contract`: types match v2.0.0
- `npm run test:e2e`: sign up → onboard (bank account) → approve → buy by UPI → deliver → approve → creator balance up ₹8,500 → instant withdrawal

🤖 Generated with [Claude Code](https://claude.com/claude-code)
