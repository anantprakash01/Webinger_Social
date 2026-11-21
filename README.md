# Webinger Collab — Creator Marketplace (frontend)

React 19 + TypeScript + Vite prototype of a two-sided creator marketplace with escrow payments.
Phase 0 runs entirely on an in-browser mock API; Phase 1 switches each module to the Spring Boot API.
Project decisions and current status live in `CLAUDE.md`.

## Run

```bash
npm install
cp .env.example .env.local   # optional; mock mode is the default
npm run dev                  # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server. `/api` is proxied to `localhost:8080` for http mode. |
| `npm run build` | Typecheck + production build (with PWA service worker). |
| `npm test` | Vitest: fee calculator, ledger, order state machine, every mock API module, and page-level UI tests. |
| `npm run test:e2e` | Playwright smoke test in Microsoft Edge (starts its own dev server): sign up → onboard → admin approves → brand buys → creator delivers → brand approves → creator balance updated. |
| `npm run lint` | ESLint (TypeScript + React hooks). |
| `npm run gen:api` | Regenerate `src/types/openapi.ts` from `docs/api/openapi.yaml`. |
| `npm run check:contract` | Fails if `src/types/openapi.ts` no longer matches the contract (now v2.0.0, India / Razorpay). |
| `npm run gen:art` | Regenerate the abstract demo images in `public/demo/`. |
| `npm run check:layout` | With `npm run dev` running: checks key screens at 360 px and 1280 px in Microsoft Edge (no sideways scroll, no console errors). Pass a base URL and a folder to also save screenshots. |
| `npm run check:a11y` | With `npm run dev` running: axe-core WCAG 2.1 A/AA check of public pages, auth screens and checkout at 360 px and 1280 px. |

## Environment

| Variable | Values | Default |
| --- | --- | --- |
| `VITE_API_MODE` | `mock` (in-browser fake API) or `http` (Spring Boot) | `mock` |
| `VITE_API_BASE_URL` | Base path of the real API | `/api/v1` |
| `VITE_MOCK_DELAY_MS` | Artificial mock latency so loading states show | `350` |

## Demo accounts (mock mode, password `demo1234`)

| Email | Role | State |
| --- | --- | --- |
| brand@demo.test | Brand | Verified, company "Saltbay Supply Co." |
| unverified@demo.test | Brand | Email not verified — checkout is blocked (FR-02) |
| creator@demo.test | Creator | Approved |
| newcreator@demo.test | Creator | Draft profile — lands on onboarding |
| admin@demo.test | Admin | — |

The marketplace has 59 invented, approved creators to search (plus 4 not yet approved, which never appear).
Try `/search`, `/u/leomakes`, or press **Buy** on a profile while logged out.

To walk the creator setup (Week 3), log in as `newcreator@demo.test`: the wizard covers profile, socials,
packages, portfolio, payouts (PAN + bank account or UPI ID, verified at once in the demo) and submit for review. While the
profile is in review, the demo bar shows **Simulate review: Approve / Reject**. Brands edit their company at
`/brand/profile`.

Orders: as `brand@demo.test`, press **Buy** on `/u/leomakes` and pay in rupees by UPI, card, netbanking or a wallet
app (Razorpay, mocked). The brand's saved UPI ID is preselected; `failure@razorpay` shows a failed UPI payment, card
`4111 1111 1111 1111` pays and `4000 0000 0000 0002` is declined (any future expiry and CVC). Switch to
`creator@demo.test` with **View as** to accept and deliver, then back to the brand to approve and review.
The demo bar's **Simulate time** moves the clock forward so orders expire or auto-approve after 72 hours.

Campaigns, chat and notifications (Week 5): as the brand, post a campaign at `/brand/campaigns` and hire an
applicant (**Accept and pay**). As a creator, browse and apply at `/creator/campaigns`. Every order has a chat
(**Message** on the order page); emails and phone numbers are hidden until the order is completed. The bell
and the badges show unread notifications and messages; they update live (polling in mock mode, STOMP later).

Admin console (Week 6): log in as `admin@demo.test`. **Vetting** approves or rejects creators in review,
**Disputes** opens the dispute console (order, deliveries, brief, chat) to release, fully refund or partly refund,
**Reports** handles reports sent with the **Report** link on profiles and chat messages, **Users** suspends,
bans or opens a read-only **View as** session, **Fees & plans** changes the fees for new orders, **Audit log**
lists every admin action and money movement, and **Orders** browses every order with Simulate time and Reset.
Creators see their balance and earnings at `/creator/payouts`, get paid every Monday (can be turned off) and can
**Withdraw now** (standard free, instant 1%); brands manage saved cards and UPI IDs at `/brand/payment-methods`; every charged order has a
printable **Receipt**.

"Continue with Google" signs in as an invented Google identity. Emails (verification, password reset)
appear in a **demo inbox** box on the relevant screens. The demo bar inside the app has **View as** and
**Reset demo data**. Demo state lives in `sessionStorage`, so it survives a refresh but not a new tab.

## Layout

```
docs/api/openapi.yaml     API contract (single source of truth, v2.0.0)
docs/backend-handover.md  what the Spring Boot API must do, module by module
e2e/                      Playwright smoke test
scripts/                  layout, accessibility and contract checks; demo art generator
src/app/                  routes, auth context, guards, layouts (AppShell, PublicLayout), not-found page
src/features/auth/        schemas (Zod), hooks (TanStack Query), components, pages
src/features/landing/     landing page
src/features/search/      search page, filters, creator card, URL <-> query mapping
src/features/creators/    public creator profile, creator workspace (wizard, packages, dashboard)
src/features/brands/      brand company profile
src/features/files/       image uploads (presign) and the image picker
src/features/payments/    Razorpay payment picker, saved methods, payout account form, payout hooks
src/features/payouts/     creator payouts page (balance, withdraw now, history)
src/features/admin/       admin console, report dialog
src/api/client.ts         the only module that talks to a backend (mock | http), 401 → refresh → retry
src/api/mock/             db, seed, fees, ledger, orderMachine, server (router) and handlers
src/components/ui/        Webinger base components
src/lib/                  money formatting, catalog (platforms, niches, locations), form error mapping
src/styles/               Webinger tokens and styles; index.ts imports them in order
src/features/orders/      checkout, order lists, order detail, reviews, receipts
src/features/campaigns/   campaigns, applications, application checkout
src/features/chat/        messages, notifications, contact masking
src/lib/realtime.ts       STOMP client (http) or poller (mock) behind one subscribe() API
```
