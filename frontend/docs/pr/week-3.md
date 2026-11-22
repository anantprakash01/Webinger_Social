## Summary

Week 3 of the Phase 0 prototype: the creator side and the brand profile, on the mock API. A new creator can now go from sign-up to a submitted, priced profile; brands can fill in their company profile. Also renames the product from "Webinger Social" to **Webinger Collab**.

Requirements covered: FR-05, FR-10 – FR-16, FR-62 (mocked), FR-70.

## What's included

**Rename (separate commit)**
- Logo wordmark "Webinger COLLAB", page title, PWA manifest, README, CLAUDE.md. Folder and repo names unchanged.

**API contract v0.3** (`docs/api/openapi.yaml`, types regenerated)
- Creator workspace: `GET /creators/me`, `PUT /creators/me/profile`, social accounts, packages (`POST/PATCH/DELETE`), portfolio, `POST /creators/me/submit-for-review`, `GET /creators/me/stats`
- `GET/PUT /brands/me/profile`, `POST /files/presign`, `POST /payouts/onboarding-link`
- Mock-only (not in the contract): `POST /dev/stripe/connect-complete`, `POST /dev/vetting-decision`

**Rules** — Zod schemas shared by the forms and the mock, so both reject the same input
- Username 3–30 characters, starts with a letter, unique, not reserved, locked after approval
- Bio at least 30 characters, 1–3 niches, at least one language; gender and birth year optional (search filters only, never shown)
- Package price at least $10, delivery 1–60 days, at most 8 active packages (FR-12, FR-13)
- At most 12 portfolio items; images JPEG/PNG/WebP up to 10 MB; video links must be https
- Submitting needs profile details, a photo, a social account, an active package and payouts set up

**Screens**
- `/creator/onboarding` — six-step wizard: profile → social accounts → packages → portfolio (optional) → payouts → review & submit. The step is in the URL; after approval the same screens become the profile editor.
- `/creator/packages` — add/edit drawer, on/off switch, delete, "n of 8 active"
- `/creator/dashboard` (FR-70) — available balance, in escrow, lifetime earnings, profile views, orders by status, setup summary
- `/brand/profile` (FR-05) — company name, website, logo, industry, country, plan
- Vetting banner (FR-16) across the creator workspace: draft, in review, changes needed (with the team's reason), live
- Mock only: a clearly labelled stand-in for the Stripe Connect onboarding page (no Stripe branding), "Use a demo image" on image pickers, and "Simulate review: Approve / Reject" in the demo bar while a profile is in review

**Fixes**
- At 360 px the wizard's step list widened the page (screen-reader-only text escaped its scroll area); the header was 3 px too wide after the rename
- Brand profile now shows "Saved." after saving
- Test suite: Vitest capped at 4 workers, query cache cleared between tests, cheaper result-count queries — page-level tests were flaky when every file ran at once (suite now ~15 s instead of ~31 s)

## Decisions to confirm

- Payouts must be set up before submitting for review; the portfolio is recommended, not required
- Creators can keep editing while in review and after approval, with no second review in the MVP
- Deleting a package removes it; from Week 4, packages with orders should be switched off instead

## How to test

1. `npm install && npm run dev` (mock mode is the default)
2. Log in as `newcreator@demo.test` / `demo1234` and walk the wizard. Use "Use a demo image" for photos and "Set up payouts with Stripe" → "Submit details (demo)".
3. Submit for review, then use **Simulate review → Approve** in the demo bar; the profile appears in `/search`.
4. Try a package priced $9.99 or with 61 delivery days — both show field errors.
5. Log in as `brand@demo.test` and edit `/brand/profile`; the sidebar shows the new company name.

## Checks

- `npm test` — 130 passing (three clean runs in a row)
- `tsc`, `npm run lint`, `npm run build` — clean
- `npm run check:layout` — every screen, including each wizard step, at 360 px and 1280 px in Edge: no sideways scroll, no console errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
