## Summary

Week 4 of the Phase 0 prototype: orders and the escrow state machine, end to end on the mock API. A brand can buy a package or send a custom offer, the creator accepts and delivers, and the brand approves (or asks for revisions, or disputes). Every money movement follows the order state machine and writes balanced ledger entries.

Requirements covered: FR-30 – FR-38, FR-60, FR-61, FR-64 (refund paths), plus FR-32 / FR-36 timing through "Simulate time".

## What's included

**API contract v0.4** (`docs/api/openapi.yaml`, types regenerated)
- `GET /orders/quote` — server-side price + brand fee for a package or a custom offer
- `POST /orders` with `Idempotency-Key` — card authorised, not captured; fees copied onto the order
- `GET /orders` (status filter, counts per status, server time), `GET /orders/{id}`
- `POST /orders/{id}/accept | decline | deliver | brief | approve | request-revision | dispute | cancel`
- `POST /orders/{id}/review`, `POST /reviews/{id}/reply`
- Mock-only (not in the contract): `POST /dev/simulate-time`, `GET /dev/clock`

**Mock backend**
- Every status change goes through `orderMachine.ts`, so payment states (authorised → captured → released / refunded / hold released) and ledger entries match what the Spring Boot `OrderStateMachine` will do
- Expiry and auto-approval jobs run before every mock request, like the backend's 5-minute jobs
- Idempotency keys stored per user; retries return the first result, a key reused on another endpoint is refused
- People who aren't part of an order get 404, so order ids can't be probed
- Revision requests now give the creator at least 3 more days
- 13 seeded orders, one in every state (custom offer, late order, dispute, partial refund), built by running the real state machine with back-dated clocks; two are near their deadline so "Simulate time" shows expiry and auto-approval straight away

**Screens**
- `/checkout/:packageId` and `/checkout/offer/:username` — brief (requirements, links, reference images, shipping), mock card form with Stripe's test cards, fee summary from the server, "authorised, not charged until the creator accepts" note
- `/brand/orders` and `/creator/orders` — status tabs with counts, "Your turn" and "Late" markers, deadline countdowns; rows become cards on phones
- Order detail (both sides) — "what happens next" with a live countdown (based on server time, so Simulate time moves it), only the actions the server allows, each confirmed in a dialog that says what happens to the money; deliver dialog (post links and files); deliveries by revision; editable brief before delivery; review and one creator reply; payment breakdown (brand: price, fee, total; creator: price, fee, what they receive); timeline
- Profile "Send custom offer" now opens the offer checkout
- Demo bar: **Simulate time** (+24 h, +73 h, +7 days)

**Fix**
- Stylesheets are now imported from `src/styles/index.ts` instead of `@import`s inside `global.css`. Vite did not reliably reload changes inside `@import`ed files, so a running dev server could keep serving stale CSS (the stuck CSS error seen earlier). Production CSS is byte-for-byte unchanged.

## Decisions to confirm

- Custom offers use "delivery within N days of acceptance" like packages, rather than a calendar due date
- Shipping: the brand gives a return address; the creator's delivery address is shared in chat after acceptance
- Revision requests give the creator at least 3 more days
- Packages that have orders can only be switched off, not deleted
- A declined card fails before any order exists; the real backend should create the order only after authorisation succeeds

## How to test

1. `npm install && npm run dev`
2. Log in as `brand@demo.test` / `demo1234`, open `/u/leomakes`, press **Buy**, write a brief and pay with `4242 4242 4242 4242` (any future expiry, any CVC). Try `4000 0000 0000 0002` to see a decline.
3. **View as → Creator · Approved**: open the new order, **Accept**, then **Deliver work** with a post link.
4. **View as → Brand**: **Approve and pay**, then leave a review. As the creator, reply to it.
5. On any pending or delivered order, use **Simulate time → +73 hours**: pending orders expire, deliveries are approved automatically.
6. From a profile, **Send custom offer** — the total updates as you type the price.

## Checks

- `npm test` — 154 passing (two clean runs)
- `tsc`, `npm run lint`, `npm run build` — clean
- `npm run check:layout` — every screen including order list, order detail, dialogs and both checkouts at 360 px and 1280 px in Edge: no sideways scroll, no console errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
