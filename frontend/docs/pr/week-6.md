## Summary

Week 6, the last week of the Phase 0 prototype: the admin console, creator payouts, printable receipts, an accessibility and performance pass, an end-to-end smoke test, and the API contract frozen at **v1.0.0** with handover notes for the Spring Boot team.

Requirements covered: FR-63, FR-65 (printable stand-in for the PDF), FR-80 – FR-85.

## What's included

**API contract v1.0.0 — frozen** (`docs/api/openapi.yaml`, types regenerated)
- Admin: `GET /admin/summary`, `GET /admin/vetting`, `POST /admin/creators/{id}/approve|reject`, `GET /admin/disputes`, `POST /admin/disputes/{id}/resolve` (Idempotency-Key), `GET /admin/users`, `PATCH /admin/users/{id}`, `POST /admin/users/{id}/impersonate`, `GET/PUT /admin/fees`, `GET /admin/audit-logs`, `GET /admin/reports`, `POST /admin/reports/{id}/resolve`
- Everyone: `POST /reports`, public `GET /fees`; creators: `GET /payouts/balance`
- `Me.impersonatedBy`; order summaries now include both `brand` and `creator`
- `npm run check:contract` fails if the generated types drift from the YAML. Changes after the freeze need a version bump.

**Mock backend**
- Vetting reuses the Week 3 decision logic and notifies the creator; disputes resolve through the state machine (`ADMIN_RELEASE` / `ADMIN_REFUND`), so payment status and the ledger stay correct; a partial refund is capped at the creator's payout
- Suspending or banning a user signs them out everywhere and hides a creator from search and their public profile
- **View as** (read-only): the API refuses every change with 403 `READ_ONLY_IMPERSONATION`; the admin's own session is restored on "Stop viewing"
- Fee changes add a new fee row; new orders use it, existing orders keep their fees
- Audit log of every admin action and every money movement (one entry per ledger transaction)
- Weekly payouts: every Monday the available balance goes to each creator with payouts set up, with a ledger entry, an audit entry and a notification
- Seed: audit history, three reports; creators in review now have payouts set up and recent submit dates (`SCHEMA_VERSION` 7, so old demo data resets)

**Screens**
- Admin: **Vetting** (approve, reject with preset reasons), **Disputes** + dispute console (order, deliveries, brief, chat, timeline; release / full refund / partial refund with a required note), **Reports**, **Users** (search, filters, suspend / ban / reactivate with a reason, View as), **Fees & plans** (basis points with a live $200 example and history), **Audit log** (filter, before/after details), **Orders** (every order, admin order detail, Simulate +73 h, Reset demo). Sidebar badges count waiting vetting, disputes and reports.
- Creator `/creator/payouts`: available balance, in escrow, paid to bank, lifetime earnings, next payout date, bank payout history and earnings per order
- `/receipts/:id`: receipt for the brand, earnings statement for the creator; **Receipt** button on order detail; prints without the app chrome
- **Report** link on creator profiles and on other people's chat messages
- Fee wording on the packages editor and brand profile now uses the live rates

**Quality**
- Accessibility: `npm run check:a11y` runs axe (WCAG 2.1 A/AA) over landing, search (incl. phone filter drawer), profile, login, sign-up, forgot password and both checkouts at 360 px and 1280 px — no violations. Fixed logo links and the pagination button, whose accessible names didn't include their visible text.
- Lighthouse on a production build (simulated mobile 4G), landing and search: accessibility, best practices and SEO 100; performance 80–87. Fonts no longer block first paint, service-worker registration is deferred, `robots.txt` added. The rest comes from client-side rendering and the mock data that only ships in prototype builds.
- `npm run test:e2e`: Playwright smoke test in Edge — new creator signs up, onboards, admin approves, brand finds and buys, creator accepts and delivers, brand approves, creator balance goes up by $170.00
- `docs/backend-handover.md`: per-module rules, error codes, jobs and tests to port

## Decisions to confirm

- Suspended or banned users' open orders continue; admins handle them through disputes or cancellation
- View as is read-only and only for brands and creators
- The fee editor caps each fee at 30% (3000 bps)
- Payouts run every Monday 00:00 UTC and pay the whole available balance, with no minimum
- One open report per person per target; reporters stay anonymous
- Still open from earlier: who absorbs partial refunds (currently the creator's share)

## How to test

1. `npm install && npm run dev`, log in as `admin@demo.test` / `demo1234`
2. **Vetting**: approve one creator, reject another with a reason
3. **Disputes**: open the dispute, choose **Partial refund**, enter an amount and a note, confirm
4. **Users**: search `brand@demo.test`, **Manage → View as** — try any change (refused), then **Stop viewing**
5. **Fees & plans**: change the brand fee to 800 bps; buy a package as the brand and see 8% at checkout
6. **Audit log**: every step above is listed
7. As `creator@demo.test`: `/creator/payouts`; then use **Simulate time → +7 days** to see a bank payout
8. As `brand@demo.test`: open a completed order → **Receipt** → print
9. On `/u/leomakes` as the brand: **Report**

## Checks

- `npm test` — 200 passing (two clean runs)
- `tsc`, `npm run lint`, `npm run build` — clean
- `npm run check:layout` — all screens incl. every admin screen, payouts, receipt, report dialog and View as at 360 px and 1280 px in Edge: no sideways scroll, no console errors
- `npm run check:a11y` — no WCAG 2.1 A/AA violations
- `npm run check:contract` — types match v1.0.0
- `npm run test:e2e` — smoke test passing

🤖 Generated with [Claude Code](https://claude.com/claude-code)
