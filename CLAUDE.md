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
  styles/         tokens.css, global.css
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
| 4 | Orders: checkout, custom offers, order detail for both sides, full state machine, reviews | |
| 5 | Campaigns, chat, notifications, brand dashboard | |
| 6 | Admin console, payouts and receipts, polish, contract freeze | |

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
| Stripe Payments | Authorise and capture | Authorisations expire after ~7 days, so capture on accept and hold in our ledger until approval |
| Stripe Connect Express | Creator KYC and payouts | Transfer to connected account on release |
| Stripe Billing | Subscriptions (v2) | Plans map to `fee_configs` |
| Razorpay / UPI | India (v2) | Check RBI rules on marketplace escrow (payment aggregator licensing) |
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
- [ ] Launch market: global (USD, Stripe) or India-first (INR, Razorpay)? Changes the payment design.
- [ ] Legal entity and licence needed to hold escrow in the launch country?
- [ ] Final fees: 10% brand + 15% creator, or lower creator fee early?
- [ ] Manual vetting capacity per day?
- [ ] Move public pages to Next.js for SEO from day one?
- [ ] Non-circumvention term (12 or 18 months) in the Terms?
- [x] Product name: **Webinger Collab** (decided 21 Nov 2026; was "Webinger Social").
- [ ] Domain and final brand colour (prototype uses Webinger UI and red).
- [ ] Is this a separate product or the influencer module of the Webinger portal? (assumed separate repo sharing the Webinger design system)
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

**Next: Week 4 — Orders and the state machine (section 10).** Start with the contract (all `/orders/*` endpoints, `/reviews/{id}/reply`), then wire `orderMachine.ts` into mock handlers, then checkout and the order detail screens.
