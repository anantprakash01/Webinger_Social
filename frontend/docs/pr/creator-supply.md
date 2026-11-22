# Creators, search and vetting in the backend (Phase 1, Weeks 9–11)

## What changes
- **Database (Flyway V2):** creator profile fields, niches, languages, cover images, social accounts, packages with deliverables and add-ons, portfolio, payout accounts, saved lists and uploaded files. Portable between MySQL 8 and H2.
- **Module layout:** `creator` and `brand` now follow `domain / repository / service / web` like the other modules.
- **Endpoints, matching the frontend's mock** (same paths, fields, status codes, error codes and messages):
  - **Search (FR-20 – FR-24):** `GET /creators` with every filter, 5 sorts, keyword relevance and the per-platform view of reach and starting price; `GET /creators/suggestions`.
  - **Public profile (FR-15):** `GET /creators/{username}`. Only approved creators of active accounts; the creator and admins can preview. Views by others are counted (FR-70).
  - **Creator workspace (FR-10 – FR-16):** profile, social accounts, packages with add-ons, portfolio, submit for review, dashboard stats, vacation mode.
  - **Payout account (FR-62):** `GET/PUT /payouts/account`. Verification is simulated as in the mock until Razorpay is wired in.
  - **Brand profile (FR-05):** `GET/PUT /brands/me/profile`, with website clean-up and the GST state/GSTIN rules.
  - **Saved lists (FR-25):** `/lists`.
  - **Vetting (FR-80):** `GET /admin/vetting`, `POST /admin/creators/{id}/approve|reject`, each decision in the audit log (FR-84); demo-only `POST /dev/vetting-decision`.
  - **Uploads:** `POST /files/presign`. Until S3 is set up, files go to local disk: a signed `PUT /files/uploads/{key}` link valid for 10 minutes, served from `GET /files/{key}`. The frontend's upload code works unchanged.
- **Demo data:** Leo's full profile as in the mock, plus 15 invented creators (12 approved, 2 in review, 1 rejected). Password `demo1234`, emails `<username>@creators.demo.test`.

## Checks
- `./mvnw test`: **100 tests pass** on H2, no Docker (80 new).
  - `creators.test.ts` and `creatorMe.test.ts` ported, plus cases for add-ons, availability, payout accounts, saved lists, vetting, uploads, brand GST rules and search parameters.
- **Live check** against the running app (`h2` profile) over HTTP: search, profile, suggestions, error responses, and the full upload cycle (presign → PUT → GET → use as profile photo).

## Differences from the mock, on purpose
- Picture links must be an app path or an `https://` link, at most 2048 characters. `data:`, `javascript:`, plain `http:` and `//host` links are refused.
- A money amount with a fraction (e.g. `1500.5`) is a 422 on that field, never rounded.

## Not yet
- Until their modules exist, these return zero or empty: ratings and reviews, completed orders, typical acceptance time (so the "accepts within 24 h" filter finds nobody), `myInquiryId`, money and order counts in creator stats, `PACKAGE_HAS_ORDERS`, vetting notifications, `GET /brands/me/stats`, `GET /fees`.
- PAN and bank details are stored in plain columns; encrypt them (or keep only Razorpay's references) before launch.
- The frontend screens have not yet been run against this API in the browser (`VITE_API_MODE=http`).
- **Next:** that browser check, then Weeks 12–15 (orders, payments, ledger, chat, notifications, campaigns).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
