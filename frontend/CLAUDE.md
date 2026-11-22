# Creator Marketplace — project memory for Claude

Read this file fully before doing any work. It holds every decision for this project. Keep it up to date: when a week or phase is finished, update the status tables and section 17 "Current state".

Source: "Creator Marketplace (Collabstr-style) — Requirements & Technical Design", 20 Nov 2026. Requirement IDs (FR-xx) below match that document and are used in tickets, commits and tests.

---

## 1. What we are building

A two-sided marketplace where **brands** discover, book and pay social media **creators**. The platform holds payment in **escrow** until the brand approves the work. Creators list priced packages; brands buy them or send custom offers; the platform earns a fee on both sides.

**Goals**
- A brand goes from search to a paid, accepted order in under 10 minutes.
- A creator publishes a priced profile in under 15 minutes.
- Every payment is held in escrow and released only on brand approval or auto-approval.
- Revenue from brand fees, creator fees and (later) brand subscriptions.

**Personas**
| Persona | Who | Needs |
| --- | --- | --- |
| Brand | Small or mid-size business, D2C store, agency | Find vetted creators fast, see prices up front, pay safely, track results |
| Creator | Instagram, TikTok, YouTube influencer or UGC creator | Public profile with packages, inbound orders, guaranteed payouts |
| Admin | Operations and trust & safety staff | Vet creators, resolve disputes, manage payouts, configure fees |

**Scope**
| Area | MVP (v1) | Later (v2+) |
| --- | --- | --- |
| Accounts | Email/password + Google, brand and creator roles | Team seats, agency sub-accounts |
| Creator profiles | Packages, portfolio, social links, verification badge | Auto-pulled audience demographics |
| Discovery | Search with filters | Saved lists, lookalike recommendations |
| Ordering | Buy package, custom offer, accept/decline, delivery, revisions | Bundles, recurring retainers |
| Payments | Stripe cards, escrow, fees, payouts | Multi-currency, Razorpay/UPI |
| Campaigns | Brand posts brief, creators apply | Invites, bulk hiring |
| Messaging | 1:1 chat per order | Pre-order chat (paid plans), attachments |
| Analytics | Post link tracking, manual metrics | Live post analytics, fake-follower reports |
| Subscriptions | Free plan only | Pro / Premium with lower fees |
| Admin | Vetting, disputes, users, fee config | Reporting dashboards, managed campaigns |

---

## 2. How we build it (same approach as the Webinger portal)

1. **Phase 0 — React prototype on dummy data first (Weeks 1–6).** Every screen for brand, creator, admin and public visitors runs against an in-browser mock API. The mock order state machine and fee calculator behave exactly as the real backend will.
2. **Phase 1 — Spring Boot backend (Weeks 7–18).** Built module by module against the frozen API contract. Each frontend module switches from mock to real API with one setting.
3. **Same UI as the Webinger portal:** reuse the Webinger design tokens and base components (section 9). Do not introduce a different look.
4. **One contract:** `docs/api/openapi.yaml` is the single source of truth between React and Spring Boot.

### Decisions that differ from the source document
| Source document says | This project does | Why |
| --- | --- | --- |
| React 18 | React 19 + TypeScript + Vite | Same as the Webinger portal; no feature in the doc needs 18 |
| Tailwind CSS + shadcn/ui | Webinger tokens + plain CSS components from the Webinger portal | Same UI as the earlier project |
| Zustand for auth/UI state | React context (as in Webinger) until state grows; Zustand allowed later | Fewer dependencies in Phase 0 |
| Axios client | `fetch` wrapper in `src/api/client.ts` with mock/http switch; add 401 → refresh retry | Same pattern as Webinger |
| Everything else (TanStack Query, React Hook Form + Zod, Stripe Payment Element, STOMP chat, openapi-typescript, Vitest, Playwright) | Adopted as written | — |
| (not specified) | TypeScript pinned to ~5.9 | openapi-typescript 7 does not accept TypeScript 7 yet; same version as Webinger |
| (not specified) | Refresh token in an httpOnly cookie on `/api/v1/auth`, not in the response body | Keeps it out of JS (convention 10); mock keeps a stand-in cookie in sessionStorage |
| (not specified) | Added `POST /auth/verify-email/resend` (5 per hour) | FR-02 needs a way to get a new link |
| Stripe, USD (global) | **India-first: INR (paise), Razorpay** — UPI, cards (saved as RBI tokens), netbanking, wallet apps; Razorpay Route for escrow/creator accounts, RazorpayX for payouts | Decided 22 Nov 2026 (contract v2.0.0). Minimum package price ₹500 |
| (not specified) | Creators can **Withdraw now** (standard NEFT free, instant IMPS/UPI 1%, min ₹10) on top of the weekly Monday payout, which they can turn off; minimum withdrawal ₹500 | Decided 22 Nov 2026 |
| (not specified) | **No brand wallet / prepaid balance** — every order is paid through Razorpay | A wallet paying third parties is likely an RBI-regulated prepaid instrument; dropped 22 Nov 2026 |
| (not specified) | Referral **credits** and promo codes are platform-funded discounts only (cannot be bought, withdrawn or transferred), funded by a PROMOTIONS ledger account | Keeps them outside the prepaid-instrument rules; decided 22 Nov 2026 |
| Pro/Premium in v2 (FR-66) | Brand plans built in the prototype (contract v3.2): Free 10%, Pro 5%, Premium 2% service fee | Requested 22 Nov 2026 |

---

## 3. Functional requirements

Priority: **P0** = MVP blocker, **P1** = MVP, **P2** = later. "Week" = Phase 0 prototype week that builds the screen.

### 3.1 Authentication and accounts
| ID | Requirement | Pri | Week |
| --- | --- | --- | --- |
| FR-01 | Sign up with email/password or Google, choosing role Brand or Creator | P0 | 1 |
| FR-02 | Email verification required before placing or accepting orders | P0 | 1 |
| FR-03 | Password reset via 30-minute email link | P0 | 1 |
| FR-04 | JWT access token 15 min + rotating refresh token 7 days | P0 | backend |
| FR-05 | Brand profile: company name, website, logo, industry, country | P1 | 3 |
| FR-06 | Account deactivation and data export | P2 | later |

### 3.2 Creator profile and packages
| ID | Requirement | Pri | Week |
| --- | --- | --- | --- |
| FR-10 | Profile: display name, bio, location, niches (max 3), languages, photo, cover images | P0 | 3 |
| FR-11 | Linked socials per platform (Instagram, TikTok, YouTube, UGC): handle, followers | P0 | 3 |
| FR-12 | Packages: platform, title, description, deliverables, price, delivery days 1–60 | P0 | 3 |
| FR-13 | Max 8 active packages; prices in USD for MVP | P1 | 3 |
| FR-14 | Portfolio up to 12 images or video links | P1 | 3 |
| FR-15 | Public profile `/u/{username}` without login | P0 | 2 |
| FR-16 | Profile live only after vetting: DRAFT → PENDING_REVIEW → APPROVED / REJECTED | P0 | 3 |

Acceptance (FR-12): price under $10 or delivery days outside 1–60 is rejected with a field error; an approved creator's new package appears in search within 1 minute.

### 3.3 Discovery and search
| ID | Requirement | Pri | Week |
| --- | --- | --- | --- |
| FR-20 | Keyword search across name, bio, niches | P0 | 2 |
| FR-21 | Filters: platform, niche, country/city, followers, price, language, gender, age range | P0 | 2 |
| FR-22 | Sort: relevance, price low→high, followers, rating, newest | P1 | 2 |
| FR-23 | 24 per page; p95 under 500 ms | P0 | 2 |
| FR-24 | Card: photo, name, top platform, followers, starting price, rating | P0 | 2 |
| FR-25 | Saved lists | P2 | later |

### 3.4 Orders and custom offers
| ID | Requirement | Pri | Week |
| --- | --- | --- | --- |
| FR-30 | Brand buys a package; card authorised, not captured, until creator accepts | P0 | 4 |
| FR-31 | Custom offer (deliverables, price, due date) from creator profile | P1 | 4 |
| FR-32 | Creator accepts/declines within 72 h, else order expires and hold is released | P0 | 4 |
| FR-33 | Brief: requirements, shipping need, links, reference files | P0 | 4 |
| FR-34 | Creator submits deliverables (files and/or post URLs) | P0 | 4 |
| FR-35 | Brand approves, requests revision (max 2) or disputes within 72 h of delivery | P0 | 4 |
| FR-36 | No brand action in 72 h = auto-approval and funds released | P0 | 4 |
| FR-37 | Cancel before acceptance; after acceptance via admin | P1 | 4 |
| FR-38 | Brand 1–5 star review; creator replies once | P1 | 4 |

### 3.5 Campaigns
| ID | Requirement | Pri | Week |
| --- | --- | --- | --- |
| FR-40 | Brand posts campaign: title, brief, platforms, budget per creator, niches, deadline | P1 | 5 |
| FR-41 | Approved creators browse and apply with pitch and price | P1 | 5 |
| FR-42 | Accepting an application creates an order (same flow as 3.4) | P1 | 5 |
| FR-43 | Invite specific creators | P2 | later |

### 3.6 Messaging and notifications
| ID | Requirement | Pri | Week |
| --- | --- | --- | --- |
| FR-50 | One chat thread per order, real-time via WebSocket | P0 | 5 |
| FR-51 | Mask emails and phone numbers in chat before completion | P1 | 5 |
| FR-52 | Email + in-app notification for every order state change | P0 | 5 |
| FR-53 | Notification preferences | P2 | later |

### 3.7 Payments, fees and payouts
| ID | Requirement | Pri | Week |
| --- | --- | --- | --- |
| FR-60 | Brand fee added at checkout (default 10%, configurable per plan) | P0 | 4 |
| FR-61 | Creator fee deducted from payout (default 15%) | P0 | 4 |
| FR-62 | Creator payout onboarding via Stripe Connect Express | P0 | 3 (mock) |
| FR-63 | Funds to creator balance on approval; bank payout on schedule | P0 | 6 |
| FR-64 | Refund on decline, expiry, or dispute ruled for brand | P0 | 4 |
| FR-65 | PDF receipts for every charge | P1 | 6 |
| FR-66 | Pro/Premium subscriptions via Stripe Billing | P2 | later |

### 3.8 Analytics
| ID | Requirement | Pri | Week |
| --- | --- | --- | --- |
| FR-70 | Creator dashboard: earnings, orders by status, profile views | P1 | 3 |
| FR-71 | Brand dashboard: spend, orders, delivered post links | P1 | 5 |
| FR-72 | Live post metrics from platform APIs | P2 | later |

### 3.9 Admin and trust & safety
| ID | Requirement | Pri | Week |
| --- | --- | --- | --- |
| FR-80 | Vetting queue: approve/reject with reason | P0 | 6 |
| FR-81 | Dispute console: order, chat, deliverables; release, full or partial refund | P0 | 6 |
| FR-82 | Users: suspend, ban, read-only impersonate | P1 | 6 |
| FR-83 | Fee and plan configuration without deploy | P1 | 6 |
| FR-84 | Audit log of admin actions and money movements | P0 | 6 |
| FR-85 | Report a user / content | P1 | 6 |

---

## 4. Order lifecycle, escrow and fees

The order state machine is the heart of the product. Every money movement is tied to exactly one state transition, and no other code path may move money. **The mock layer implements the same machine** so the prototype behaves like production.

```
[start] --brand pays (card authorised)--> PENDING_ACCEPTANCE
PENDING_ACCEPTANCE --creator accepts (card captured)--> IN_PROGRESS
PENDING_ACCEPTANCE --decline / cancel / 72 h (hold released)--> CLOSED
IN_PROGRESS --creator delivers--> DELIVERED
DELIVERED --revision requested (max 2)--> IN_PROGRESS
DELIVERED --brand approves or 72 h (creator paid)--> COMPLETED
DELIVERED --brand disputes--> DISPUTED
DISPUTED --admin releases--> COMPLETED
DISPUTED --admin refunds (full or partial)--> REFUNDED
```

States: `PENDING_ACCEPTANCE`, `IN_PROGRESS`, `DELIVERED`, `COMPLETED`, `DISPUTED`, `REFUNDED`, `CLOSED` (`close_reason`: `DECLINED`, `EXPIRED`, `CANCELED`). Transitions are validated in one `OrderStateMachine` class (backend) and one `orderMachine.ts` (mock), and written to `order_events`.

### 4.1 Money flow
1. **Checkout:** brand pays price + brand fee. Stripe PaymentIntent `capture_method=manual` (authorise only).
2. **Creator accepts:** capture. Ledger `BRAND_CHARGE` → `ESCROW`.
3. **Decline / 72 h:** cancel PaymentIntent; hold drops off; brand never charged.
4. **Approve / 72 h auto-approve:** `ESCROW` → `PLATFORM_REVENUE` (both fees) and `CREATOR_BALANCE` (price − creator fee). Stripe Transfer to connected account.
5. **Payout:** Stripe pays the creator's bank on schedule (e.g. weekly).
6. **Dispute for brand:** Stripe Refund (full/partial); reverse `ESCROW` → `BRAND_CHARGE`; remainder follows step 4.

### 4.2 Fee example ($200 package, default fees)
| Line | USD |
| --- | --- |
| Package price | 200.00 |
| Brand fee 10% | 20.00 |
| **Brand pays** | **220.00** |
| Creator fee 15% of price | 30.00 |
| **Creator receives** | **170.00** |
| Platform gross | 50.00 |
| Stripe processing (≈2.9% + $0.30 on $220, US cards) | ≈6.68 |
| Platform net | ≈43.32 |

Fees stored as basis points in `fee_configs` and **copied onto the order at checkout**, so fee changes never alter existing orders. All money is **integer cents** everywhere: API, database, mock, frontend. Format only at display time.

### 4.3 Scheduled jobs
| Job | Runs | Action |
| --- | --- | --- |
| Expire unaccepted orders | Every 5 min | `PENDING_ACCEPTANCE` past `accept_by` → `CLOSED` (EXPIRED), cancel PaymentIntent |
| Auto-approve deliveries | Every 5 min | `DELIVERED` past `review_by` → `COMPLETED`, release funds |
| Overdue reminders | Hourly | Email creator 24 h before `due_at`; flag late orders |
| Webhook reconciliation | Hourly | Compare Stripe objects with `payments`; alert on mismatch |

In the prototype, the admin area has a **"Simulate time"** control (demo only) that runs the expiry and auto-approve rules immediately, so reviewers can see those transitions.

---

## 5. Non-functional requirements
| Area | Requirement |
| --- | --- |
| Performance | API p95 < 300 ms (search < 500 ms); first load < 2.5 s on 4G |
| Scale (year 1) | 50k creators, 10k brands, 2k orders/day, 500 concurrent chat users |
| Availability | 99.5% monthly; webhooks retried and idempotent |
| Security | OWASP Top 10; BCrypt cost 12; HTTPS only; secrets in a vault |
| Authorisation | Roles BRAND, CREATOR, ADMIN + ownership checks on every order/chat endpoint |
| Payments | No card data on our servers (Stripe Elements); PCI SAQ-A |
| Money correctness | Integer minor units; double-entry ledger; each txn sums to zero |
| Privacy | GDPR + India DPDP: consent, export, deletion within 30 days |
| Audit | Immutable log of admin actions, order transitions, money movements; 7 years |
| Rate limiting | 100 req/min per user; 10 logins per 15 min per IP |
| Observability | JSON logs, Micrometer → Prometheus, OpenTelemetry, alerts on errors and webhook failures |
| Accessibility | WCAG 2.1 AA for public pages and checkout |
| Browsers | Last 2 versions of Chrome, Safari, Firefox, Edge; responsive down to **360 px** |
| Backups | MySQL PITR, daily snapshots 30 days; RPO 15 min, RTO 4 h |

---

## 6. Architecture

Modular monolith: one Spring Boot service with a package per domain, one MySQL database, one React SPA.

```
React SPA (TS, Vite, TanStack Query; S3 + CloudFront)
   │ HTTPS / WSS                 ╲ pre-signed upload
   ▼                              ▼
Spring Boot 3 API (Java 21)      Amazon S3 (media)
  Security + REST (JWT, roles, OpenAPI)
  Order + payment core (state machine, fees, ledger)
  Scheduled jobs (expiry, auto-approve)
  Real-time chat (WebSocket STOMP)
   │        │         │          │            │
 MySQL 8   Redis     S3      Stripe (API +   Email (SES)
 (RDS)  (cache, rate        signed webhooks)
        limits, chat relay)
```

| Layer | Technology |
| --- | --- |
| Language | Java 21 LTS, Spring Boot 3.x, Maven |
| Web | Spring Web MVC, Jakarta Bean Validation, springdoc-openapi |
| Security | Spring Security 6, OAuth2 resource server (JWT), OAuth2 client (Google), BCrypt |
| Persistence | Spring Data JPA, MySQL 8 (InnoDB, utf8mb4), Flyway, HikariCP |
| Boilerplate | MapStruct, Lombok |
| Real-time | Spring WebSocket + STOMP; Redis pub/sub relay when > 1 instance |
| Jobs | `@Scheduled` + ShedLock |
| Cache, rate limit | Redis, Bucket4j |
| Search | MySQL indexes + FULLTEXT; OpenSearch past ~100k creators |
| Payments | stripe-java |
| Files | AWS SDK v2, S3 pre-signed URLs |
| Local dev | Docker Compose: MySQL, Redis, MinIO, MailHog, Stripe CLI |

**Backend packages** (`com.yourco.marketplace`): `common/`, `auth/`, `user/`, `brand/`, `creator/`, `search/`, `order/` (Order, OrderStateMachine, OrderService, jobs), `payment/` (Stripe client, webhooks, payouts), `ledger/` (double-entry LedgerService), `campaign/`, `chat/`, `notification/`, `review/`, `file/`, `admin/`, `audit/`. Each module: `web/` (controllers + DTOs), `service/`, `domain/`, `repository/`.
Rule: a module calls another module's service interface only, never its repository. Cross-module side effects (order approved → notify, credit ledger) go through Spring application events.

---

## 7. Data model (MySQL 8)

All tables: `BIGINT` auto-increment PK, `public_id CHAR(26)` ULID exposed in APIs, `created_at` / `updated_at` UTC. Money `BIGINT` cents + `currency CHAR(3)`. Flyway migrations only.

| Table | Key columns | Relationships |
| --- | --- | --- |
| users | email (unique), password_hash, role (BRAND, CREATOR, ADMIN), status, email_verified_at | 1–1 brand or creator profile |
| refresh_tokens | user_id, token_hash, expires_at, revoked_at | → users |
| brand_profiles | user_id, company_name, website, logo_url, industry, country, stripe_customer_id, plan | 1–1 users |
| creator_profiles | user_id, username (unique), display_name, bio, city, country, gender, birth_year, vetting_status, rating_avg, rating_count, stripe_account_id | 1–1 users |
| creator_niches | creator_id, niche_id | creators ↔ niches |
| social_accounts | creator_id, platform, handle, url, followers, engagement_rate, verified_at | → creator_profiles |
| packages | creator_id, platform, title, description, deliverables, price_cents, delivery_days, active | → creator_profiles |
| portfolio_items | creator_id, type (IMAGE, VIDEO_LINK), url, sort_order | → creator_profiles |
| campaigns | brand_id, title, brief, platforms JSON, budget_cents, deadline, status | → brand_profiles |
| campaign_applications | campaign_id, creator_id, pitch, price_cents, status | unique (campaign_id, creator_id) |
| orders | brand_id, creator_id, package_id?, campaign_id?, status, price_cents, brand_fee_cents, creator_fee_cents, due_at, accept_by, review_by, revision_count, version | core entity |
| order_events | order_id, from_status, to_status, actor_id, note | append-only |
| order_briefs | order_id, requirements, needs_shipping, shipping_address JSON | 1–1 orders |
| deliverables | order_id, type (FILE, POST_URL), url, submitted_at, revision_no | → orders |
| payments | order_id, stripe_payment_intent_id, amount_cents, status (AUTHORIZED, CAPTURED, REFUNDED, CANCELED) | → orders |
| ledger_entries | txn_id, account (BRAND_CHARGE, ESCROW, PLATFORM_REVENUE, CREATOR_BALANCE, PAYOUT), debit_cents, credit_cents, order_id | each txn sums to zero |
| payouts | creator_id, amount_cents, stripe_transfer_id, status | → creator_profiles |
| disputes | order_id, opened_by, reason, status, resolution (RELEASE, FULL_REFUND, PARTIAL_REFUND), refund_cents, resolved_by | 1–1 orders |
| reviews | order_id (unique), rating, comment, creator_reply | 1–1 orders |
| conversations / messages | conversation.order_id; message: conversation_id, sender_id, body, attachment_url, read_at | 1 conversation per order |
| notifications | user_id, type, payload JSON, read_at | → users |
| files | owner_id, s3_key, mime_type, size_bytes | used by portfolio, deliverables, messages |
| fee_configs | plan, brand_fee_bps, creator_fee_bps, effective_from | admin-editable |
| audit_logs | actor_id, action, entity_type, entity_id, before JSON, after JSON, ip | append-only |
| stripe_webhook_events | event_id (unique), type, processed_at | webhook idempotency |

Indexes: `packages(creator_id, active)`, `orders(brand_id, status)`, `orders(creator_id, status)`, `orders(status, accept_by)`, `orders(status, review_by)`, `social_accounts(platform, followers)`, `messages(conversation_id, created_at)`.
Concurrency: `orders.version` is a JPA `@Version` column so approve and auto-approve cannot both win.

---

## 8. API (REST, `/api/v1`)

springdoc-openapi (Swagger UI `/swagger-ui`). Errors RFC 7807 problem+json. Lists `?page=&size=&sort=`. Money-moving endpoints accept `Idempotency-Key`.

| Module | Endpoints | Role |
| --- | --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/oauth/google`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password` | Public / any |
| Users | `GET /me`, `PATCH /me` | Any |
| Creators | `GET /creators` (search), `GET /creators/{username}` | Public |
| Creators | `PUT /creators/me/profile`, `POST /creators/me/submit-for-review`, `POST/PATCH/DELETE /creators/me/packages/{id}`, `POST/DELETE /creators/me/social-accounts/{id}` | Creator |
| Brands | `PUT /brands/me/profile` | Brand |
| Files | `POST /files/presign` | Any |
| Orders | `POST /orders` (returns Stripe client secret), `GET /orders`, `GET /orders/{id}` | Brand / Creator |
| Orders | `POST /orders/{id}/accept`, `/decline`, `/deliver` | Creator |
| Orders | `POST /orders/{id}/brief`, `/approve`, `/request-revision`, `/dispute` | Brand |
| Orders | `POST /orders/{id}/cancel` | Brand / Creator |
| Reviews | `POST /orders/{id}/review`, `POST /reviews/{id}/reply` | Brand / Creator |
| Campaigns | `POST /campaigns`, `GET /campaigns`, `GET /campaigns/{id}`, `POST /campaigns/{id}/applications`, `POST /applications/{id}/accept` | Brand / Creator |
| Chat | `GET /conversations`, `GET /conversations/{id}/messages`; WebSocket `/ws` (STOMP) topic `/user/queue/messages` | Participant |
| Payouts | `POST /payouts/onboarding-link`, `GET /payouts/balance` | Creator |
| Notifications | `GET /notifications`, `POST /notifications/read` | Any |
| Webhooks | `POST /webhooks/stripe` (signature-verified) | Stripe |
| Admin | `GET /admin/vetting`, `POST /admin/creators/{id}/approve`, `/reject`, `GET /admin/disputes`, `POST /admin/disputes/{id}/resolve`, `GET/PATCH /admin/users/{id}`, `PUT /admin/fees`, `GET /admin/audit-logs` | Admin |

Example — `POST /orders` with `Idempotency-Key`, body `{ creatorUsername, packageId, note }` → `201 { orderId, status: "PENDING_ACCEPTANCE", totalCents: 22000, brandFeeCents: 2000, acceptBy, stripeClientSecret }`.

Mock-only endpoint (Phase 0, never in production): `POST /dev/simulate-time { hours }` runs expiry and auto-approve rules.

---

## 9. Frontend (React) — same UI as the Webinger portal

### 9.1 Stack
| Concern | Choice |
| --- | --- |
| Build | React 19, TypeScript, Vite, PWA plugin |
| Routing | react-router-dom, lazy-loaded bundles per area |
| Server state | TanStack Query from Week 1 |
| Forms | React Hook Form + Zod (schemas mirror backend validation, e.g. FR-12) |
| UI | Webinger tokens + base components (copy from webinger-portal): Button, Card, Badge, Input, Progress, Avatar, Stat, PageHeader, EmptyState, ErrorState, PageSkeleton; react-icons (`react-icons/lu`) |
| Payments | `@stripe/react-stripe-js` Payment Element (mocked card form in Phase 0) |
| Real-time | `@stomp/stompjs` (polling mock in Phase 0) |
| API client | `src/api/client.ts` mock/http switch, 401 → refresh retry; types from openapi-typescript |
| Tests | Vitest + React Testing Library; Playwright end-to-end |

### 9.2 Look and layout (reuse exactly)
- White pages, heavy black geometric headlines (Inter 700–800), one red accent `--brand-red` (#D40000 until the final brand colour is chosen), navy panels, generous white space.
- Brand red only for primary buttons, active nav, key numbers. Errors use `--danger` with icon and text.
- **Day and night mode** (22 Nov 2026): every colour comes from `src/styles/tokens.css`, which has a night set (device setting, or the person's choice in `html[data-theme]`; print is always day). Use role tokens, never raw colours: `--brand-red` for fills vs `--brand-red-ink` for red text, `--navy` fills vs `--navy-ink` text, `--on-accent` / `--on-ink` / `--on-status` for text on fills, `--chart-1` for chart marks. `npm run check:a11y` checks both themes.
- Logged-in areas use the Webinger `AppShell`: sidebar on desktop, bottom nav (4 items + More) under 900 px, demo bar with "View as" switcher in mock mode.
- Public pages (landing, search, profile) use a `PublicLayout`: top header with logo, Search, Log in, Join as creator; footer.
- Tables collapse to cards with `data-label`; test at **360 px** (this project's minimum, stricter than Webinger's 390).
- Every screen handles loading, error and empty states.

### 9.3 Routes
| Route | Page | Access |
| --- | --- | --- |
| `/` | Landing | Public |
| `/search` | Creator search with filter sidebar (drawer on phones) | Public |
| `/u/:username` | Creator profile: packages, portfolio, reviews | Public |
| `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password` | Auth | Public |
| `/checkout/:packageId` | Brief + payment + fee breakdown | Brand |
| `/brand/dashboard`, `/brand/orders`, `/brand/orders/:id`, `/brand/campaigns`, `/brand/campaigns/:id`, `/brand/profile` | Brand workspace | Brand |
| `/creator/onboarding` | Wizard: profile, socials, packages, payout setup | Creator |
| `/creator/dashboard`, `/creator/orders`, `/creator/orders/:id`, `/creator/campaigns`, `/creator/packages`, `/creator/payouts` | Creator workspace | Creator |
| `/messages`, `/messages/:conversationId` | Chat | Participant |
| `/notifications` | Inbox | Any |
| `/admin/vetting`, `/admin/disputes`, `/admin/users`, `/admin/fees`, `/admin/audit`, `/admin/orders` | Admin | Admin |

### 9.4 Folder structure
```
docs/api/openapi.yaml
src/
  app/            routes, providers, guards (RequireRole), layouts (AppShell, PublicLayout)
  features/
    auth/ creators/ search/ checkout/ orders/ campaigns/ chat/ notifications/ payouts/ admin/
      api.ts  hooks.ts  schemas.ts  components/  pages/
  api/
    client.ts       only place that talks to a backend (mock | http)
    mock/
      db.ts           in-memory tables seeded with invented data
      orderMachine.ts same transitions and money rules as OrderStateMachine
      fees.ts         basis-point fee calculator (integer cents)
      ledger.ts       double-entry entries per transition
      handlers/       one file per API module, enforcing role + ownership
  components/ui/  Webinger base components
  lib/            money (cents → display), dates, stomp client
  styles/         index.ts (imports every stylesheet in order), tokens.css, base.css, …
  types/          generated OpenAPI types
```

### 9.5 Mock layer rules
1. The mock enforces the **same access rules** as the backend: role checks and ownership (a brand sees only its orders; a creator only orders addressed to them; an unapproved creator is invisible in search).
2. Every order transition goes through `orderMachine.ts`; invalid transitions return 409 problem+json, exactly like the backend.
3. Money is integer cents. Fees are copied onto the order at checkout. Each transition writes balanced ledger entries; a dev check asserts every txn sums to zero.
4. Seed data: about 60 invented creators across platforms, niches and cities, 3 brands, orders in every state, campaigns, chats, a dispute. No real people or brands.
5. Mock persists to `sessionStorage` so a refresh keeps demo state; a "Reset demo data" action restores the seed.
6. Mock-only features (Simulate time, Reset, View as) appear only when `VITE_API_MODE=mock`.

---

## 10. Phase 0 — React prototype on dummy data (Weeks 1–6)

| Week | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: scaffold, Webinger UI, contract v0, mock layer core, auth screens, role routing, layouts | Done (21 Nov 2026) |
| 2 | Public marketplace: landing, search, creator profile | Done (21 Nov 2026) |
| 3 | Creator side: onboarding wizard, packages, vetting status, payouts setup, creator dashboard; brand profile | Done (21 Nov 2026) |
| 4 | Orders: checkout, custom offers, order detail for both sides, full state machine, reviews | Done (21 Nov 2026) |
| 5 | Campaigns, chat, notifications, brand dashboard | Done (21 Nov 2026) |
| 6 | Admin console, payouts and receipts, polish, contract freeze | Done (21 Nov 2026) |

### Week 1 — Foundation
- Vite + React 19 + TS project; copy `tokens.css`, `global.css`, `components/ui`, `components/status`, `Logo` and `AppShell` pattern from webinger-portal. Add TanStack Query, React Hook Form, Zod.
- `.env.example`: `VITE_API_MODE=mock|http`, `VITE_API_BASE_URL=/api/v1`, `VITE_MOCK_DELAY_MS`. Vite proxy `/api` → `localhost:8080`.
- `docs/api/openapi.yaml` v0: auth endpoints, `/me`, shared schemas (Money as cents + currency, Problem, Page).
- Mock core: `db.ts`, `fees.ts`, `ledger.ts`, `orderMachine.ts` skeleton with unit tests (Vitest) for every transition and the $200 fee example.
- Auth screens: login, sign-up with role choice (FR-01), Google button (mock), verify-email screen and banner that blocks ordering until verified (FR-02), forgot/reset password (FR-03).
- Guards and layouts: `RequireRole` (BRAND, CREATOR, ADMIN), `PublicLayout`, `AppShell` per role with nav, demo "View as" switcher.
- Demo accounts (password `demo1234`): brand@demo.test, creator@demo.test (approved), newcreator@demo.test (draft), admin@demo.test.

### Week 2 — Public marketplace
- Landing `/`: hero, search box, platform shortcuts, featured creators, how it works for brands and creators, CTA to join.
- Search `/search` (FR-20–24): keyword, filters (platform, niche, country/city, follower range, price range, language, gender, age range), sort, 24 per page, URL query params hold all filters so links are shareable; filter drawer on phones; skeleton cards; empty state.
- Creator card (FR-24) and public profile `/u/:username` (FR-15): header with photo, cover, niches, socials and followers, verification badge, rating; packages list with price and delivery days and "Buy" / "Send custom offer"; portfolio grid; reviews. Works logged out; buying asks to log in as a brand.
- Contract: `GET /creators`, `GET /creators/{username}`.

### Week 3 — Creator side and brand profile
- `/creator/onboarding` wizard (target under 15 minutes): profile (FR-10), socials (FR-11), packages (FR-12, FR-13 with Zod rules: price ≥ $10, delivery 1–60, max 8 active), portfolio (FR-14), payout setup with mocked Stripe Connect onboarding (FR-62), submit for review.
- Vetting status banner: DRAFT, PENDING_REVIEW, APPROVED, REJECTED with reason (FR-16).
- `/creator/packages` manage, `/creator/dashboard` (FR-70): earnings, orders by status, profile views.
- `/brand/profile` (FR-05).
- Contract: creator profile, packages, social accounts, submit-for-review, presign upload (mocked), payouts onboarding link, brand profile.

### Week 4 — Orders and the state machine
- `/checkout/:packageId` (FR-30, FR-33, FR-60): brief form, order summary with price, brand fee and total in cents, mocked Payment Element, "card authorised, not charged until the creator accepts" note; `Idempotency-Key` sent.
- Custom offer from profile (FR-31).
- Order detail for brand and creator: status timeline from `order_events`, countdowns to `accept_by` / `review_by` / `due_at`, brief, deliverables, actions allowed only in valid states: accept/decline (FR-32), deliver files or post URLs (FR-34), approve / request revision with counter max 2 / dispute (FR-35), cancel (FR-37). Fee breakdown shows what the creator receives.
- Auto-expiry and auto-approval (FR-32, FR-36) through admin "Simulate time".
- Refund paths (FR-64) reflected in payment status and ledger.
- Reviews and creator reply (FR-38).
- Order lists `/brand/orders`, `/creator/orders` with status filters.
- Contract: all `/orders/*` endpoints and `/reviews/{id}/reply`.

### Week 5 — Campaigns, chat, notifications, brand dashboard
- Campaigns (FR-40–42): brand creates and manages campaigns, sees applications, accepts one → order created (same flow); creators browse open campaigns and apply with pitch and price.
- Chat (FR-50, FR-51): conversation list, thread per order, polling mock shaped like STOMP topics, email/phone masking before completion with a visible notice.
- Notifications (FR-52): bell with unread count, `/notifications` inbox, one notification per order state change.
- `/brand/dashboard` (FR-71): spend, orders by status, delivered post links.

### Week 6 — Admin, payouts, polish, freeze
- Admin: vetting queue with approve/reject + reason (FR-80); dispute console showing order, chat, deliverables with release / full refund / partial refund (FR-81); users suspend/ban/read-only impersonate (FR-82); fees and plans editor in basis points (FR-83); audit log (FR-84); reports queue (FR-85); order browser; Simulate time and Reset demo.
- Creator `/creator/payouts`: balance, transfers, payout history (FR-63); receipts as printable pages (FR-65 stand-in).
- Accessibility pass to WCAG 2.1 AA on public pages and checkout; 360 px review of every screen; Lighthouse check on landing and search.
- Playwright smoke: sign up → onboard → admin approves → brand searches → buys → creator accepts → delivers → brand approves → creator balance updated.
- Freeze the API contract; write backend handover notes per module.

**Phase 0 gate:** a brand completes search → paid, accepted order in under 10 minutes and a creator publishes a profile in under 15 minutes on the prototype; every FR marked Week 1–6 is clickable; contract frozen.

---

## 11. Phase 1 — Spring Boot backend (Weeks 7–18)

Follows the source document's 12-week MVP plan, shifted after the prototype. Switch each frontend module from mock to real as its backend lands.

| Weeks | Phase | Scope | Frontend switch |
| --- | --- | --- | --- |
| 7–8 | Foundation | Repo, CI/CD (GitHub Actions), Docker Compose, Flyway schema, auth (JWT + rotating refresh + Google), email verification, password reset, audit log base | Auth |
| 9–11 | Creator supply | Creator/brand profiles, packages, socials, portfolio with S3 pre-signed uploads, vetting queue, search with filters and FULLTEXT | Creators, search, vetting |
| 12–15 | Transactions | OrderStateMachine with 100% branch coverage, fee calculator, double-entry ledger, Stripe manual capture, webhooks with idempotency table, Connect Express onboarding and transfers, ShedLock jobs, WebSocket chat, notifications and email, campaigns | Orders, checkout, payouts, chat, notifications, campaigns |
| 16–18 | Launch readiness | Disputes, reviews, admin tools, fee config, receipts PDF, rate limiting, observability, E2E + k6 load tests, closed beta | Admin, reviews, receipts |

**Public launch gate:** closed beta runs 100 real orders with zero ledger mismatches.

Source estimate assumes 2 backend, 1 frontend and 1 full-stack/QA engineer; a smaller team needs proportionally longer.

**v2 after launch:** campaign invites, Pro/Premium subscriptions, live post analytics, Razorpay/UPI, saved lists, notification preferences, account export/deletion, shipments.

---

## 12. Integrations
| Service | Use | Notes |
| --- | --- | --- |
| Razorpay Payments | Authorise (`payment_capture=0`), capture on accept | UPI, cards, netbanking, wallet apps; Custom Checkout (`razorpay.js`) so methods render in our UI; check how long uncaptured payments are held before auto-refund |
| Razorpay Route | Creator linked accounts (PAN + bank KYC), transfers on hold until approval | Escrow-style release |
| RazorpayX Payouts | Weekly and on-demand payouts to bank (NEFT/IMPS) or UPI | Instant payouts charged 1% (min ₹10) to the creator |
| Razorpay Subscriptions | Pro/Premium plans (v2) | Plans map to `fee_configs` |
| AWS S3 + CloudFront | Images, portfolio, deliverables | Pre-signed uploads, max 500 MB video |
| SES / SendGrid | Email | Thymeleaf templates |
| Google OAuth | Sign-in | Spring Security OAuth2 client |
| Instagram, TikTok, YouTube APIs | Verify handles, metrics (v2) | App review per platform; MVP verifies manually |
| Sentry | Errors | Frontend + backend |

## 13. Testing
- Unit: JUnit 5 + Mockito; OrderStateMachine and fee calculator 100% branch coverage. Frontend mock machine and fees covered by Vitest with the same cases.
- Integration: Spring Boot Test + Testcontainers (MySQL, Redis).
- Contract: CI fails if generated frontend types drift from `openapi.yaml`.
- Payments: Stripe test mode + Stripe CLI webhook replay in CI.
- End-to-end: Playwright sign-up → profile → order → deliver → approve → payout.
- Load: k6 on search and checkout before launch.

## 14. DevOps
| Item | Choice |
| --- | --- |
| Source control | GitHub, trunk-based, short-lived branches, PR review required |
| CI/CD | GitHub Actions: build, test, Sonar, Docker image, deploy to staging on merge, production on tag |
| Environments | local (Docker Compose), staging, production |
| Hosting | AWS: ECS Fargate (API), RDS MySQL Multi-AZ, ElastiCache Redis, S3 + CloudFront |
| Secrets | Spring profiles + AWS Secrets Manager |
| Infra as code | Terraform |
| Monitoring | CloudWatch, Prometheus/Grafana, Sentry, uptime checks |
| Phase 0 preview | Frontend auto-deployed on every push (e.g. Cloudflare Pages, `VITE_API_MODE=mock`) so reviewers see each change |

## 15. Coding conventions
1. New data → `openapi.yaml` → generated types → mock handler → `api` method in `client.ts` → hook in `features/<x>/hooks.ts` → screen.
2. Components never call `fetch`; they use feature hooks built on TanStack Query.
3. Mock handlers enforce role + ownership and return the same error codes as the backend (401, 403, 404, 409, 422).
4. All money is integer cents with a currency; format only in `lib/money.ts`. Never use floating-point for money.
5. Order actions are offered only for states the machine allows; the server (or mock) re-checks anyway.
6. Zod schemas mirror backend Bean Validation rules; field errors map from 422 problem+json.
7. Every screen has loading, error and empty states; test at 360 px.
8. Use Webinger tokens only; brand red never for errors.
9. Seed data is invented; no real creators, brands or handles.
10. Never put tokens in localStorage; card data only in Stripe Elements; secrets never in code.
11. One module per AI session; commit when it works; reference FR IDs in commit messages.

## 16. Open questions
- [x] Launch market: **India-first, INR, Razorpay** (decided 22 Nov 2026).
- [ ] Tax: GST on platform fees, TDS under section 194-O on creator payouts, and how both show on receipts — confirm with a CA before launch. (Built with the standard rates in force: see section 17, launch readiness B.)
- [ ] DPDP: creators can sign up from age 16; under-18s need verifiable parental consent — raise the minimum to 18 or add a consent flow.
- [ ] SMS / WhatsApp provider and DLT registration for notification templates.
- [ ] RBI: confirm the escrow model (Razorpay Route on-hold transfers) fits the payment aggregator rules for a marketplace.
- [ ] Legal entity and licence needed to hold escrow in the launch country?
- [ ] Final fees: 10% brand + 15% creator, or lower creator fee early?
- [ ] Manual vetting capacity per day?
- [ ] Move public pages to Next.js for SEO from day one?
- [ ] Non-circumvention term (12 or 18 months) in the Terms?
- [x] Product name: **Webinger Collab** (decided 21 Nov 2026; was "Webinger Social").
- [ ] Domain and final brand colour (prototype uses Webinger UI and red).
- [ ] Is this a separate product or the influencer module of the Webinger portal? (assumed separate repo sharing the Webinger design system)
- [ ] Plan prices, promo and referral amounts, credit expiry, and GST on platform-funded discounts (see section 17, marketplace growth).
- [ ] Partial dispute refunds: who absorbs them? Provisional rule in `orderMachine.ts`: a partial refund (1 cent up to the creator's payout) comes out of the creator's share and the platform keeps both fees; a full refund returns everything incl. the brand fee. Confirm before Week 6 / backend.

## 17. Current state and next action

**Week 1 — Foundation: done (21 Nov 2026).** `npm test` 73 passing, `npm run build`, `npm run lint` and `tsc` clean.

What exists:
- Scaffold: React 19, TS 5.9, Vite 8, PWA plugin, TanStack Query, RHF + Zod 4, react-icons, Vitest + RTL. `@/` alias to `src/`. `.env.example` + Vite proxy `/api` → `localhost:8080`.
- Webinger UI: `src/styles/tokens.css` + `base.css` (copied), `components.css` (select/search/drawer/etc. from the portal), `marketplace.css` (public layout, role picker, verify banner). `src/components/ui` ported to TSX; `Logo` is a wordmark "Webinger COLLAB" (product renamed from "Webinger Social" on 21 Nov 2026) (`PRODUCT_NAME` in `Logo.tsx`).
- Contract v0: `docs/api/openapi.yaml` (auth, `/me`, Money/Problem/PageMeta/Ulid). Types generated to `src/types/openapi.ts`; app aliases in `src/types/index.ts`.
- Mock core: `fees.ts` (bps, half-up integer rounding), `ledger.ts` (balanced txns, builders per money movement, dev check), `orderMachine.ts` (all transitions, guards, 403/409/422 codes, `allowedEvents`, `dueSystemEvent` for Simulate time), `db.ts` (sessionStorage, seed, ULIDs, mock clock offset), `server.ts` router + `handlers/` (auth, me, dev). Orders are not exposed over the API yet (Week 4).
- `src/api/client.ts`: one request path for mock and http, 401 → refresh once → retry, session events consumed by `AuthContext`.
- Auth screens (`src/features/auth`): login (demo account picker), sign-up with role choice, Google (mock identity), verify-email (token + "check your inbox" + resend), forgot/reset password (30-min single-use link). Demo inbox box shows the "sent" emails.
- Guards and layouts: `RequireRole`, `GuestOnly`, `RequireVerified` (blocks `/checkout/*` for unverified brands), `AppShell` (sidebar / bottom nav + More, demo bar with View as + Reset demo data, verify-email banner), `PublicLayout`. Every route in §9.3 exists; later-week screens are placeholders listing their FR ids.
- Demo accounts as in §10 plus `unverified@demo.test` (brand, email not verified) to demo FR-02.

**Week 2 — Public marketplace: done (21 Nov 2026).** `npm test` 106 passing; `tsc`, lint, build and `npm run check:layout` (360 px + 1280 px in Edge) clean.

What exists:
- Contract v0.2: `GET /creators` (all FR-21 filters, 5 sorts, `size` max 24) and `GET /creators/{username}` (owner/admin can preview an unapproved profile; others get 404). Schemas: Platform, Niche, Gender, CreatorCard, CreatorProfile, SocialAccount, Package, PortfolioItem, Review.
- Shared lists in `src/lib/catalog.ts` (platforms, niches, languages, locations, follower/age buckets, sorts, `formatCompact`).
- Seed `src/api/mock/seed/creators.ts`: Leo (creator@demo.test) fully set up, Ivy still DRAFT, 58 invented approved creators + 3 PENDING_REVIEW + 1 REJECTED, with socials, packages, portfolio and reviews. Deterministic (fixed PRNG + fixed id epoch), so ids and links survive "Reset demo data". `SCHEMA_VERSION` = 2.
- Invented art: `public/demo/*.svg` (abstract, no people), regenerated by `npm run gen:art`. Social handles are invented and never linked (`url: null`); demo video links use example.com.
- Mock `handlers/creators.ts`: keyword AND-match on name/username/bio/niche with relevance scoring; with `platform`, the card's reach and starting price use that platform. Profile GET counts views (not the owner's), for FR-70. Server now persists after every request and supports `auth: 'optional'` routes.
- Screens: landing (`features/landing`; from 1024 px the hero shows 3 featured creators as overlapping cards with an escrow badge, linking to their profiles), search (`features/search`: URL holds all filters — prices in dollars, follower/age buckets by name, page 1-based; phone filter drawer; removable chips; skeletons; empty and error states), profile (`features/creators`: cover, photo, verified badge, niches, rating, audience, packages with Buy, portfolio, reviews). Guests who press Buy log in and go straight to `/checkout/:packageId`; creators/admins see Buy disabled with a reason. "Send custom offer" opens a Week 4 placeholder drawer.
- Fixed while checking at 360 px: the public footer forced a 712 px-wide page on phones (Week 1 bug); base `.btn` rules were overriding project styles (Google button had no border, phone-only Filters button showed on desktop) — `global.css` now only imports, in order tokens → base → components → marketplace → discovery.
- Test timeouts: Testing Library waits up to 5 s and tests up to 20 s (`src/test/setup.ts`, `vite.config.ts`), because full-page jsdom tests were flaky on a busy machine.
- `@playwright/test` added; `scripts/check-layout.mjs` drives the installed Edge (no browser download). Week 6 E2E can build on it.

Decisions to confirm:
- Seeded reviews point at orders that don't exist in the mock; Week 4 reviews will come from real mock orders.
- Gender and birth year are search filters only; the public profile does not show them.

**Week 3 — Creator side and brand profile: done (21 Nov 2026).** `npm test` 130 passing (3 clean runs in a row); `tsc`, lint, build and `npm run check:layout` (now also covers every wizard step, packages, dashboard, brand profile) clean.

What exists:
- Product renamed to **Webinger Collab** (logo, title, PWA manifest, README). Folder and repo names unchanged.
- Contract v0.3: `GET /creators/me`, `PUT /creators/me/profile`, `POST/DELETE /creators/me/social-accounts`, `POST/PATCH/DELETE /creators/me/packages`, `POST/DELETE /creators/me/portfolio`, `POST /creators/me/submit-for-review`, `GET /creators/me/stats`, `GET/PUT /brands/me/profile`, `POST /files/presign`, `POST /payouts/onboarding-link`. Mock-only: `POST /dev/stripe/connect-complete` (stands in for Stripe's webhook), `POST /dev/vetting-decision`.
- Rules (Zod, shared by forms and mock): `features/creators/schemas.ts` (username 3–30, starts with a letter, unique, reserved words; bio ≥ 30; niches 1–3; birth year age 16–90; price ≥ $10; delivery 1–60; max 8 active packages; max 12 portfolio items; video links https only), `features/brands/schemas.ts` (website normalised to https), `features/files/schemas.ts` (JPEG/PNG/WebP ≤ 10 MB).
- Mock `handlers/creatorMe.ts` (+ `decideVetting`, reused by the Week 6 admin queue), `brands.ts`, `files.ts`, `payouts.ts`. Rows gained `submittedAt`, `payoutStatus` (creators) and website/logo/industry/country/plan (brands); `SCHEMA_VERSION` = 3.
- Uploads: `api.files.upload` = presign → PUT (http) or, in mock mode, a downscaled data URL kept in the demo data. Every image picker also offers "Use a demo image" in mock mode.
- Screens: `/creator/onboarding` wizard (profile → socials → packages → portfolio (optional) → payouts → review & submit; step in the URL; becomes the profile editor after approval), `/creator/packages` (add/edit drawer, on/off switch, delete, n of 8), `/creator/dashboard` (FR-70: balance, escrow, lifetime, profile views, orders by status, setup card), `/brand/profile` (FR-05), `/dev/stripe-connect` (mock-only, clearly labelled, no Stripe branding). Vetting banner (FR-16) across the creator workspace; demo bar gets "Simulate review: Approve / Reject" while a profile is in review.
- Test runner: Vitest capped at 4 workers, query cache cleared after each test, result-count checks use text queries — page-level jsdom tests were flaky when all files ran at once.

Decisions to confirm:
- Username can change only until first approval (keeps brands' links working).
- Profile edits are allowed while in review and after approval, with no re-review in MVP.
- Payouts must be set up before submitting for review; portfolio is recommended, not required.
- Deleting a package removes it; from Week 4, packages with orders should be switched off instead (noted in `deleteMyPackage`).

**Week 4 — Orders and the state machine: done (21 Nov 2026).** `npm test` 154 passing (two clean runs); `tsc`, lint, build and `npm run check:layout` (now including order list, order detail, dialogs and both checkouts) clean.

What exists:
- Contract v0.4: `GET /orders/quote`, `POST /orders` (Idempotency-Key), `GET /orders` (status filter, `statusCounts`, `serverTime`), `GET /orders/{id}`, `POST /orders/{id}/accept|decline|deliver|brief|approve|request-revision|dispute|cancel`, `POST /orders/{id}/review`, `POST /reviews/{id}/reply`. Shared `IdempotencyKey` and `OrderId` parameters. Mock-only: `POST /dev/simulate-time`, `GET /dev/clock`.
- Mock `handlers/orders.ts`: every status change goes through `orderMachine.ts` (`applyTransition`), so payment states and ledger entries match the backend. Scheduled jobs (expire, auto-approve) run before every mock request. Idempotency: stored per user+key; a reused key on another path → 422 `IDEMPOTENCY_KEY_REUSED`. Non-participants get 404.
- `orderMachine.ts`: a revision request now moves the due date to at least 3 days from now (`REVISION_MIN_DAYS`).
- Seed `seed/orders.ts`: 13 orders between Saltbay and Leo plus invented creators, one in every state (incl. a custom offer, a late order, a dispute and a partial refund), built by running the machine with back-dated clocks. Two orders are close to their deadline, so "Simulate time" shows expiry and auto-approval straight away. `SCHEMA_VERSION` = 4.
- New tables: `orderInfo` (what was bought, snapshot), `orderBriefs`, `deliveries`, `disputes`, `idempotency`; reviews gained `brandUserId`.
- Screens: `/checkout/:packageId` and `/checkout/offer/:username` (brief, mock card element with Stripe's test numbers, server quote, "authorised, not charged" note); `/brand/orders`, `/creator/orders` (status tabs with counts, phone cards); order detail for both sides ("what happens next" with live countdown from server time, actions only from `allowedActions` in confirm dialogs, deliver dialog, deliveries, editable brief, review and one reply, payment card, timeline). Profile "Send custom offer" opens the offer checkout. Demo bar: **Simulate time** (+24 h, +73 h, +7 days).
- Stylesheets are now imported from `src/styles/index.ts` instead of `@import`s in `global.css`: Vite did not reliably refresh changes inside `@import`ed files, so a running dev server could serve stale CSS (including a stuck error).

Decisions to confirm:
- Custom offers ask for "delivery within N days of acceptance" (like packages), not a calendar due date, so the state machine stays the same for both.
- Brief shipping: the brand enters a return address; the creator's delivery address is exchanged in chat after acceptance (no address collection flow in MVP).
- Revision requests give the creator at least 3 more days.
- Packages with orders can't be deleted, only switched off (409 `PACKAGE_HAS_ORDERS`).
- The decline test card fails before an order exists (as Stripe's confirmation would); the real backend should create the order only after the authorisation succeeds.

**Week 5 — Campaigns, chat, notifications, brand dashboard: done (21 Nov 2026).** `npm test` 182 passing (two clean runs); `tsc`, lint, build and `npm run check:layout` (now incl. campaigns, application checkout, chat and notifications) clean.

What exists:
- Contract v0.5: `GET/POST /campaigns` (brands: own; creators: open, or `applied=true`), `GET /campaigns/{id}`, `POST /campaigns/{id}/close`, `POST /campaigns/{id}/applications`, `POST /applications/{id}/accept` (Idempotency-Key → order) `| reject | withdraw`, `GET /conversations`, `GET/POST /conversations/{id}/messages`, `POST /conversations/{id}/read`, `GET /notifications`, `POST /notifications/read`, `GET /brands/me/stats`. `OrderKind` gained CAMPAIGN; `OrderDetail` gained `campaignId`, `conversationId`. STOMP topics `/user/queue/messages` and `/user/queue/notifications` (WebSocket `/ws`). Mock-only: `GET /dev/realtime/poll`.
- Mock: `handlers/campaigns.ts` (accepting an application calls the shared `placeOrder` in `handlers/orders.ts` — same checkout core as packages, FR-42), `handlers/chat.ts` (chat, notifications, realtime poll), brand stats in `handlers/brands.ts`. `api/mock/notify.ts` builds one notification per order event for each participant who didn't cause it (system events: both); every one is also "emailed" to the demo outbox (FR-52). Each order gets a conversation.
- FR-51 masking: `features/chat/schemas.ts` `maskContacts` (emails incl. "(at)/(dot)", phone-like runs of 7+ digits) runs before a message is stored while the order isn't COMPLETED; masked messages carry `masked: true`.
- Seed `seed/engagement.ts`: 3 more invented brands (Copperleaf Candles, Tidewell Swim, Orbitfit Gear), 6 campaigns (one closed) with applications (Leo has pending and rejected ones), one conversation per order with messages on Leo's active orders (one masked), notifications derived from every seeded order event. `SCHEMA_VERSION` = 5.
- `src/lib/realtime.ts`: one `subscribe(topic, handler)` API — STOMP (`@stomp/stompjs`, Bearer token in CONNECT) in http mode, a poller in mock mode (`VITE_REALTIME_POLL_MS`, default 3000). `useRealtimeSync` in the app shell refreshes chat, notifications, orders and campaigns. Vite proxies `/ws` to the backend.
- Screens: `/brand/campaigns` (cards + new-campaign drawer), `/brand/campaigns/:id` (applications with reach and rating, accept → `/checkout/campaign/:campaignId/:applicationId`, decline, close), `/creator/campaigns` (open / my applications, platform and niche filters), `/creator/campaigns/:id` (apply, withdraw, link to the order once hired), `/messages` + `/messages/:id` (two panes on desktop, list → thread on phones, masking notice, Enter to send), `/notifications` (all / unread, mark all read), `/brand/dashboard` (FR-71). Unread badges on Messages / Notifications in the sidebar, bottom bar and More sheet; bell in the sidebar header and phone top bar; "Message" button on order detail.

Decisions to confirm:
- Campaigns list deliverables; the accepted creator's price and delivery days come from their application; the campaign brief (plus optional extra note) becomes the order brief.
- A creator who withdraws may re-apply (the same application row is reused: one per campaign per creator).
- Closing a campaign declines pending applications; orders already placed continue.
- Contact details stay masked in messages sent before completion (only the masked text is stored).
- Notifications go to the participant who didn't act; chat messages don't create notifications (they show as unread counts instead).

**Week 6 — Admin, payouts, polish, freeze: done (21 Nov 2026).** `npm test` 200 passing (two clean runs); `tsc`, lint, build, `npm run check:layout` (now incl. every admin screen, payouts, receipt, report dialog, "view as"), `npm run check:a11y` (no WCAG 2.1 A/AA violations), `npm run check:contract` and `npm run test:e2e` clean.

What exists:
- Contract **v1.0.0, frozen**: `/admin/summary`, `/admin/vetting`, `/admin/creators/{id}/approve|reject`, `/admin/disputes`, `/admin/disputes/{id}/resolve` (Idempotency-Key), `/admin/users`, `PATCH /admin/users/{id}`, `/admin/users/{id}/impersonate`, `GET/PUT /admin/fees`, public `GET /fees`, `/admin/audit-logs`, `POST /reports`, `/admin/reports`, `/admin/reports/{id}/resolve`, `GET /payouts/balance`. `Me.impersonatedBy`; `OrderSummary` gained `brand` and `creator`. `scripts/check-contract.mjs` (`npm run check:contract`) fails on drift between the YAML and `src/types/openapi.ts`.
- Mock: `handlers/admin.ts` (vetting reuses `decideVetting`; disputes go through `ADMIN_RELEASE` / `ADMIN_REFUND`; suspend/ban revokes sessions and hides creators from search and profile; fees add a new `feeConfigs` row; reports), `audit.ts` (every admin action + every ledger txn as `MONEY_MOVEMENT`), `payoutsCore.ts` (balances from the ledger; weekly Monday payouts run with the scheduled jobs; `PAYOUT_SENT` notification), `handlers/payouts.ts` (balance, transfers, payouts). Read-only impersonation: the server refuses every non-GET with 403 `READ_ONLY_IMPERSONATION`; the client keeps the admin session aside and `stopImpersonating` restores it. Seed `seed/admin.ts` (audit history, 3 reports). In-review creators now have payouts set up (Week 3 rule) and recent submit dates. `SCHEMA_VERSION` = 7.
- Screens: `/admin/vetting` (tabs, socials/packages/niches per creator, approve, reject with preset reasons), `/admin/disputes` + `/admin/disputes/:id` (order, deliveries, brief, chat transcript, timeline; release / full refund / partial refund capped at the creator payout, note required), `/admin/reports`, `/admin/users` (search, role/status filters, suspend/ban/reactivate with reason, **View as (read-only)** with a navy banner and "Stop viewing"), `/admin/fees` (bps with live $200 example, history), `/admin/audit` (action filter, before/after JSON), `/admin/orders` + `/admin/orders/:id` (all orders, Simulate +73 h, Reset demo). Sidebar badges for vetting, disputes and reports. `/creator/payouts` (available, escrow, paid out, lifetime, next Monday, bank payouts, earnings per order). `/receipts/:id` printable receipt (brand) / earnings statement (creator), "Receipt" button on order detail, print CSS. **Report** link (FR-85) on creator profiles and on other people's chat messages. Fee copy elsewhere reads the live rates (`GET /fees`).
- Accessibility: `@axe-core/playwright` + `scripts/check-a11y.mjs` over landing, search (incl. phone filter drawer), profile, login, sign-up, forgot password, checkout (incl. errors) and offer checkout at 360/1280 px. Fixed: logo links whose label didn't contain the visible wordmark text, pagination "Prev" vs "Previous page".
- Lighthouse (production build, simulated mobile 4G): accessibility, best practices and SEO 100; performance 80–87 (FCP 2.6–3.5 s, LCP 3.3–4.0 s, CLS 0, TBT 0). Fixed: Google Fonts no longer block first paint, service-worker registration deferred, `robots.txt` added. The rest is client-side rendering plus the mock API and seed shipping in prototype builds (absent in http mode); see the open Next.js question in §16.
- E2E: `playwright.config.ts` (Edge, own dev server on 5199) + `e2e/smoke.spec.ts` — the full §10 journey with a brand-new creator, ending with the creator balance +$170.00. Vitest now only picks up `src/**/*.test.*`.
- `docs/backend-handover.md`: per-module rules, error codes, jobs and tests to port, for the Spring Boot team.

Decisions to confirm:
- Suspending or banning signs the user out everywhere and hides a creator from search and the public profile; their open orders continue (admins handle them through disputes/cancel).
- "View as" is read-only and limited to brands and creators; the session is short-lived and has no refresh token.
- Fee changes apply to new orders only (already the rule); the editor caps each fee at 30% (3000 bps).
- Payouts run every Monday 00:00 UTC for creators with payouts enabled; the whole available balance is paid, no minimum.
- A person can have one open report per target; reporters stay anonymous to the reported user.

**Phase 0 complete.** The smoke test runs the creator setup and the brand search → paid, accepted order in seconds; the 10- and 15-minute targets still need a timed run with real people before the gate is formally signed off.

**UX pass (21 Nov 2026, branch `ux-pass`).** 19 fixes from a review of every screen: "Needs your action" list on both dashboards; orders sorted by urgency with red countdowns under 24 h; phone action bars (order page, checkout, profile); compact phone order cards; in-app confirm dialog replaces every `window.confirm`/`prompt` (`useConfirm` in `components/feedback.tsx`); toasts for every action (`toast()`); visible reason when buying is disabled; profile track record (orders completed, typical acceptance time), package platform filter, review filter and "show all", custom offer next to the packages; search cards show city only, a patterned placeholder and why they matched, sticky results bar; onboarding "Step N of 6" and gender/birth year moved to the review step; chat read receipts ("Seen"), order title first in the conversation list, report icon on hover; admin users search as you type with Joined / Last active, newest first, capitalised status, vetting focus moves to the next creator; demo bar collapses on phones; tab rows fade at the edge (`TabRow`); icon-only pagination on phones; one date rule in `lib/dates.ts` (relative under a week, then a date); landing has "Hire creators", a trust section with FAQ, and no repeated featured creators; brand dashboard spend chart and "View order →". Contract **v1.1.0** (additive): `completedOrders`, `typicalAcceptHours`, `spendByMonth`, `readAt`, `lastActiveAt`, urgency sort. Styles in `src/styles/ux.css`. 207 tests, layout, a11y, contract, build and E2E clean.

**Payments for India (22 Nov 2026, branch `payments-india`).** Contract **v2.0.0**: currency INR (paise; fields keep the `Cents` suffix; `lib/money.ts` formats ₹ with Indian grouping); Stripe replaced by Razorpay. Brands pay each order by **UPI, card, netbanking or wallet app**: `POST /payments/sessions` (Razorpay order for the exact total) → Razorpay Checkout (mock stand-in: `POST /dev/razorpay/pay`; test values success@razorpay / failure@razorpay, card 4111… pays, 4000…0002 declines) → `POST /orders` with the payment id + signature; the server verifies signature and amount before the order exists (402 `PAYMENT_FAILED`, 409 `AMOUNT_MISMATCH`, 409 `SESSION_USED`). Saved cards (tokens) and UPI IDs: `GET/DELETE /payments/methods`, page `/brand/payment-methods`. Creators: payout account `GET/PUT /payouts/account` (PAN + bank account/IFSC or UPI ID, verified; replaces Stripe onboarding), `POST /payouts/withdrawals` (Withdraw now: standard free, instant 1% min ₹10), `PUT /payouts/settings` (weekly payout on/off); payouts record speed, fee and destination. The brand wallet was built and then removed at the user's request. Seed prices converted (~₹80/$). 216 tests + E2E (incl. instant withdrawal), layout, a11y and contract checks clean.

**UI polish (22 Nov 2026, branch `drop-generic-eyebrows`).** Generic "Creator workspace" / "Brand workspace" / "Admin" labels above page titles removed (kept only labels that add information). Account menu behind the avatar (`app/layouts/AccountMenu.tsx`): real picture, Change photo/logo, profile and money links per role, Sign out. Contract **v2.1.0**: `Me.avatarUrl`, `PUT /me/avatar` (creators cannot remove their photo). Page titles stay (orientation on phones, one h1 per page for accessibility).

**Launch readiness (22 Nov 2026, branch `launch-readiness`).** All of section 18 built, phase by phase (one commit each). Contract **v2.6.0** (all additive since v2.1). 244 unit/UI tests, `tsc`, lint, build, `check:contract`, `check:layout` (now incl. saved lists, settings, the 24 h filter and creator invitations), `check:a11y` and the E2E smoke test clean. Backend notes for every new module: `docs/backend-handover.md` → "Launch readiness".

What exists (beyond the earlier weeks):
- **A:** `/terms`, `/privacy`, `/refunds` (templates for a lawyer); `/settings` (name, email with re-verification, password, sign out other devices, JSON export, delete with 30-day grace); a tab title on every page; admin cancel of an accepted order (FR-37, full refund).
- **B:** Indian taxes in `src/api/mock/tax.ts` (GST 18% on fees as CGST+SGST or IGST by the brand's state, GST on registered creators' price, TDS 194-O 0.1%, TCS 0.5%), copied onto each order; ledger `GST_PAYABLE` / `TAX_WITHHELD`; tax invoices and creator earnings statements; brand state + GSTIN, creator GSTIN.
- **C:** package add-ons (usage rights, rush, extra revision) chosen at checkout; drafts before posting; product shipping with tracking; requests for more time; manual post results (order page and brand dashboard). Mock: `handlers/collab.ts`; these are timeline events, not state-machine transitions.
- **D:** saved lists (`/brand/lists`), campaign invites (profile, lists; creators' Invitations tab), vacation mode (409 `CREATOR_AWAY`), notification preferences per category × email/SMS/WhatsApp (`api/mock/deliver.ts`; SMS/WhatsApp land in the demo outbox), chat attachments (image or PDF), creators rate brands. India-first seed: Indian names, ~85% Indian cities, regional languages. Demo accounts renamed (same emails): Maya Iyer (brand), Leo Fernandes (creator, Mumbai), Ivy Mathew (draft creator), Sam Mehta (admin), Theo Pinto (unverified brand).
- **E:** calmer workspace titles; `formatMoneyShort` / `<ShortMoney>` (₹82,200 · ₹1.2L · ₹2.5Cr); order progress stepper; search-box suggestions + recent searches + "accepts within 24 h"; notifications grouped by order with "mark as read"; brand "Get started" checklist; Hindi via `src/lib/i18n.tsx` (English text as key; shell, landing, auth, checkout translated; switcher in header/footer, auth pages and settings).
- Fixed on the way: search match reason split keywords on the letter "s"; the price chip showed `$`; the landing FAQ still mentioned the removed brand wallet; long `<select>` options (state names) widened forms at 360 px.
- `SCHEMA_VERSION` = 12.

Decisions to confirm:
- Hindi copy, legal templates and every tax rate need review (native speaker, lawyer, CA).
- SMS/WhatsApp provider (e.g. MSG91, Gupshup / WhatsApp Business API) and DLT template registration.
- Add-ons are one of each kind per package; rush must be faster than the package; usage rights 7–365 days.
- Drafts don't count as revisions; more time is 1–14 days per request, one pending request at a time.
- Away mode blocks new orders, custom offers, hiring from campaigns and invites; open orders continue.

**Marketplace growth (22 Nov 2026, branch `marketplace-growth`).** Contract **v3.4.0** (v3.0 is the only breaking change: `Conversation.orderId`/`orderStatus` may be null). 266 unit/UI tests, `tsc`, lint, build, `check:contract`, `check:layout` (incl. plan, referrals, finance, promo codes, inquiries), `check:a11y` and the E2E smoke test clean. Backend notes: `docs/backend-handover.md` → "Marketplace growth". `SCHEMA_VERSION` = 16; seed additions in `src/api/mock/seed/growth.ts`.

What exists:
- **Message before booking (v3.0):** brands message an approved creator from the profile (`POST /conversations/inquiries`); one inquiry per brand–creator pair, contacts always masked, new inquiries per rolling 30 days by plan (Free 5, Pro 50, Premium unlimited; 429 `INQUIRY_LIMIT`). Inquiry threads offer "See packages" / "Send an offer".
- **Disputes (v3.1):** brand picks a reason; creator answers once within 48 h; both sides add up to 5 evidence items (image/PDF upload, purpose `DISPUTE_EVIDENCE`, or https link); admin must record a resolution reason; "Refund reasons" tab (`GET /admin/disputes/report`); Premium brands' disputes listed first. `handlers/disputes.ts`, `components/DisputeCard.tsx`.
- **Plans (FR-66, v3.2):** Free 10% / Pro 5% (₹4,999/month) / Premium 2% (₹14,999/month), yearly = 10 months; catalog in `src/lib/plans.ts`, fees per plan in `fee_configs` (admin edits each). Upgrades paid now via Razorpay session purpose `SUBSCRIPTION` + 18% GST, no proration; downgrades/cancel at period end; renewals in the scheduled jobs. Ledger `sub_<invoiceId>`: BRAND_CHARGE → PLATFORM_REVENUE + GST_PAYABLE. `/brand/plan`, "Pro brand" badge on campaigns.
- **Promo codes and referral credits (v3.3):** platform-funded discounts. Order keeps its total, fees and creator payout; `discount` {promoCode, promoCents, creditCents}; brand pays total − discount (≥ ₹1). New ledger account **PROMOTIONS** funds the discount into escrow at capture; full refund returns what the brand paid and the discount to PROMOTIONS; closed/fully refunded orders give the code and credit back. Referrals: brand invitee ₹500 credit, inviting brand ₹1,000 credit after the invitee's first completed order; creators ₹500 balance bonus (PROMOTIONS → CREATOR_BALANCE, ref `ref_<referrer>_<referee>`). `/referrals`, `/admin/promos`, code field + invite banner on sign-up. `handlers/promos.ts`.
- **Finance (v3.4):** `/admin/finance` — flows and balances from the ledger, 6-month chart, failed payouts (status FAILED, money back to the balance) with one retry to a verified account, reconciliation (balanced txns, captured payments, escrow vs open orders, payouts, plan invoices, Razorpay amounts, holds older than 5 days). `handlers/finance.ts`.
- Demo: codes WELCOME500, DIWALI10, MONSOON15 (expired); Maya's referral code MAYA7K2Q (₹1,000 credit), Leo's LEO4XR8M; Copperleaf on Pro, Tidewell on Premium; an inquiry from Copperleaf to Leo; a failed payout in the finance queue.

Decisions to confirm:
- Plan prices and per-plan fees; no proration on upgrades; whether the creator fee should also vary by plan (it doesn't).
- Promo and referral amounts; credits never expire in the prototype (suggest 12 months); referral abuse rules (same device/GSTIN/PAN); referral via Google sign-up not supported yet.
- GST treatment of platform-funded discounts and referral bonuses (CA): invoices show the full value and the discount "borne by the platform".
- Dispute response window 48 h; admins may still decide earlier.

**Night mode (22 Nov 2026, branch `night-mode`).** Day / night switch (sun/moon) in the public header, the auth pages, the workspace sidebar footer and phone top bar; Settings → Appearance offers Match my device / Day / Night. Preference per device in localStorage `wc.theme` (`src/lib/theme.ts`), applied by an inline script in `index.html` before the first paint. Night palette contrast: body text 15:1, secondary 6.8:1+, red text 6.3:1, white on red 5:1; axe passes in both themes. 269 tests, layout and a11y clean.

**Monorepo + backend foundation (22 Nov 2026, branch `monorepo-backend`).** The repository root is now `d:\Webinger Social`: this app lives in `frontend/` (history kept as renames) and the Spring Boot API in `backend/` (first named `collab/`; Java 21, Spring Boot 4.2, MySQL 8 + Flyway; H2 in MySQL mode for tests and the `h2` profile). Root `CLAUDE.md` holds the backend rules. Done in the backend (Weeks 7–8): Flyway V1 (users, auth_sessions, refresh_tokens, one_time_tokens, message_outbox, brand/creator profile shells, audit_logs); problem+json errors with the mock's codes and messages; JWT access tokens (HS256, 15 min, `sid` = session) + rotating refresh token in an httpOnly cookie on `/api/v1/auth` with reuse detection; `/auth/*` (register, login, refresh, logout, Google with real ID-token verification and the mock token in demo mode, verify-email + resend 5/h, forgot/reset 30 min) and `/me` (GET, PATCH, PUT avatar); read-only impersonation guard; demo accounts and `/dev/outbox` when `app.demo=true`. 20 JUnit tests (the mock's auth cases ported) pass; the frontend in `VITE_API_MODE=http` signs up, signs in, refreshes, reloads and signs out against it. Gaps on purpose: referral codes at sign-up are ignored until the promos module; login rate limiting (Bucket4j) comes with launch readiness.

**Creator supply (22 Nov 2026, branch `creator-supply`, Phase 1 Weeks 9–11).** Backend in `backend/`: Flyway V2 (creator profile fields, niches/languages/covers, social_accounts, packages + deliverables + add-ons, portfolio_items, payout_accounts, saved_lists, stored_files). Endpoints matching the mock: `GET /creators` (all FR-21 filters, 5 sorts, relevance, platform view), `GET /creators/suggestions`, `GET /creators/{username}` (owner/admin preview, view counting), `/creators/me` (profile, socials, packages with add-ons, portfolio, submit-for-review, stats, availability), `GET/PUT /payouts/account` (verification simulated like the mock), `GET/PUT /brands/me/profile`, `/lists` (saved lists), `GET /admin/vetting` + approve/reject (audited), `POST /dev/vetting-decision`, `POST /files/presign` with a local stand-in for S3 (signed `PUT /files/uploads/{key}`, public `GET /files/{key}`, disk at `app.upload-dir`). Demo data: Leo's full profile plus 15 invented creators (12 approved, 2 in review, 1 rejected; `<username>@creators.demo.test`). 100 JUnit tests pass (80 new, ported from `creators.test.ts`, `creatorMe.test.ts` and the saved-list, vetting and upload rules). Differences from the mock, on purpose: picture links must be an app path or https (no `data:`/`javascript:`), max 2048 chars; money fractions are a 422, never rounded. Still zero/empty until their modules land: ratings and reviews, completed orders, typical acceptance time (so `fastAccept=true` finds nobody), `myInquiryId`, money and order counts in creator stats, `PACKAGE_HAS_ORDERS`, vetting notifications, `GET /brands/me/stats`, `GET /fees`.

**Orders, payments and ledger (22 Nov 2026, branch `orders-payments`, Phase 1 Weeks 12–15, module 1 of 5).** Backend: Flyway V3 (fee_configs per plan, payment_sessions, saved_payment_methods, orders with fees/taxes/discount copied on, order_deliverables/addons/briefs/events, deliveries, disputes, reviews, ledger_entries, idempotency_keys). `OrderStateMachine` is a pure port of `orderMachine.ts` (same states, guards, codes, money movements); `Money` (fees, GST/TDS/TCS) and `LedgerLines` (double entry) likewise. Endpoints matching the mock: `GET /orders/quote`, `POST /orders` (Idempotency-Key; payment verified by Razorpay HMAC before the order exists), `GET /orders`, `GET /orders/{id}`, `POST /orders/{id}/accept|decline|cancel|deliver|approve|request-revision|dispute|brief`, `POST /orders/{id}/review`, `POST /reviews/{id}/reply`, `GET /brands/me/stats`, `GET /fees`, `POST /payments/sessions`, `GET/DELETE /payments/methods`; demo-only `POST /dev/razorpay/pay`, `POST /dev/simulate-time`, `GET /dev/clock`. Scheduled job every minute (expire, auto-approve; optimistic lock on `orders.version`). Every posting is balanced, audited as MONEY_MOVEMENT, and tagged with the creator for balances. Creator cards, profile and dashboard now use real ratings, reviews, completed orders, typical acceptance time (so `fastAccept` works), earnings and order counts; `PACKAGE_HAS_ORDERS` enforced. Demo data: 13 Saltbay–Leo orders in every state (two near a deadline), a review, saved card + UPI. 187 JUnit tests (87 new: 57 unit tests ported from `orderMachine.test.ts`, `fees.test.ts`, `ledger.test.ts`, `tax.test.ts`; 30 API tests from `orders.test.ts` and `payments.test.ts`); live check of the full flow over HTTP. Razorpay is simulated (`order_sim…` ids, real HMAC check) until the account is connected. Not yet: notifications, chat thread ids (`conversationId` is empty), promo codes and credits (any code → 422 PROMO_NOT_FOUND), drafts/shipping/extensions, the dispute workflow after opening, admin cancel and dispute resolution endpoints, ShedLock.

**Payouts (23 Nov 2026, branch `payouts`, Weeks 12–15 module 2; stacked on `orders-payments`).** Flyway V4 (payouts, job_runs, creator_profiles.auto_weekly). `GET /payouts/balance` (available, escrow, lifetime, paid out, transfers from the ledger, payouts, account, rules, financial-year TDS/TCS), `POST /payouts/withdrawals` (Idempotency-Key; standard free, instant 1% min ₹10; min ₹500; 409 PAYOUT_ACCOUNT_REQUIRED), `PUT /payouts/settings` (weekly on/off). Weekly job pays the whole balance at each Monday 00:00 UTC boundary and marks arrivals PAID; Simulate time runs it too. Ledger CREATOR_BALANCE → PAYOUT (+ PLATFORM_REVENUE fee), ref `payout_<id>`, audited as PAYOUT. RazorpayX simulated. 195 JUnit tests (8 new). Not yet: failed payouts and retry (admin finance), payout notifications.

**Next: Weeks 12–15 module 3 — chat and notifications**, then campaigns, collaboration extras. The frontend screens built so far still need a browser check against the API (`VITE_API_MODE=http`).

**Earlier plan line (kept for reference): Phase 1, Weeks 7–8 — backend foundation (section 11)**, starting from `docs/backend-handover.md`. Switch the auth module to http first.

## 18. Launch-readiness backlog (agreed 22 Nov 2026, branch `launch-readiness`)

Built in this order; tick when done.

**Phase A — launch blockers**
- [x] Legal pages: Terms, Privacy (DPDP consent), Refund & cancellation policy (templates for a lawyer to review); linked from footer, sign-up and checkout.
- [x] Account settings: change password, change email (re-verify), sign out other devices, download my data (JSON), delete my account (30-day grace, DPDP / FR-06).
- [x] Browser tab title per page (WCAG 2.4.2).
- [x] FR-37: admin cancels an accepted order (full refund to the original method).

**Phase B — Indian taxes (standard rates in force, confirm with a CA)**
- GST 18% on platform fees (brand service fee and creator commission): CGST 9% + SGST 9% when the brand's state is the platform's state, else IGST 18%. Platform state/GSTIN are placeholders.
- GST-registered creators (optional GSTIN on the payout account) charge 18% GST on their price; the brand pays it and it is passed to the creator.
- TDS u/s 194-O: 0.1% of the creator's price (5% without PAN; PAN is mandatory here), withheld at release.
- TCS u/s 52 CGST Act: 0.5% of the creator's price for GST-registered creators, withheld at release.
- [x] Brand GSTIN + state on the company profile; creator GSTIN on the payout account.
- [x] Checkout, order and receipts show the tax lines; receipts become tax invoices; payout statements show TDS/TCS.
- [x] Ledger: GST_PAYABLE and TAX_WITHHELD accounts; every transaction still sums to zero.

**Phase C — collaboration flow**
- [x] Package add-ons: paid ad-usage rights, rush delivery, extra revision.
- [x] Draft approval before posting (share draft → brand approves or asks for changes → final delivery).
- [x] Product shipping: courier + tracking from the brand, "received" from the creator.
- [x] Deadline extension request (creator asks, brand accepts or declines).
- [x] Manual post metrics on delivery (views, likes, comments, reach) shown on the brand dashboard.

**Phase D — retention and trust**
- [x] Saved lists (FR-25) and campaign invites (FR-43).
- [x] Creator availability (vacation mode).
- [x] Notification preferences (FR-53) with email / SMS / WhatsApp channels (mocked).
- [x] Chat attachments.
- [x] Creators review brands.
- [x] India-first demo data (Indian cities and names).

**Phase E — UI**
- [x] Smaller page titles on workspace screens and phones.
- [x] Rupee shorthand (₹1.2L, ₹2.5Cr) on cards and stat tiles.
- [x] Order progress stepper.
- [x] Search suggestions, recent searches, "accepts within 24 h" filter.
- [x] Notifications grouped by order, mark one as read.
- [x] Dashboard setup checklist for new users.
- [x] Hindi language option (i18n framework; shell, landing, auth and checkout translated first).
