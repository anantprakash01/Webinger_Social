## Summary

Week 5 of the Phase 0 prototype: campaigns, order chat, notifications and the brand dashboard, on the mock API. Brands can post a campaign and hire applicants through the same checkout as packages; every order has a chat thread with contact details hidden until completion; every order state change notifies the other side in the app and by email; brands get a dashboard with spend and delivered posts.

Requirements covered: FR-40 – FR-42, FR-50 – FR-52, FR-71.

## What's included

**API contract v0.5** (`docs/api/openapi.yaml`, types regenerated)
- Campaigns: `GET/POST /campaigns` (brands see their own; creators see open ones, or `applied=true`), `GET /campaigns/{id}`, `POST /campaigns/{id}/close`, `POST /campaigns/{id}/applications`
- Applications: `POST /applications/{id}/accept` (Idempotency-Key — places an order), `/reject`, `/withdraw`
- Chat: `GET /conversations`, `GET/POST /conversations/{id}/messages`, `POST /conversations/{id}/read`; live updates on STOMP topics `/user/queue/messages` and `/user/queue/notifications` over `/ws`
- Notifications: `GET /notifications` (with unread count), `POST /notifications/read`
- `GET /brands/me/stats`; orders gain `CAMPAIGN` kind, `campaignId` and `conversationId`
- Mock-only (not in the contract): `GET /dev/realtime/poll`

**Mock backend**
- Accepting an application uses the same checkout core as buying a package (FR-42): card authorised for the applied price plus fee, creator accepts within 72 h, campaign brief becomes the order brief
- One conversation per order; email addresses and phone numbers are replaced with `[email hidden]` / `[phone hidden]` before storing while the order isn't completed (FR-51)
- One notification per order state change for each participant who didn't cause it, plus an email to the demo inbox (FR-52); campaign applications and decisions notify too
- Seed: three more invented brands, six campaigns with applications, a conversation per order with messages, notifications from every seeded order event

**Real time**
- `src/lib/realtime.ts`: one `subscribe(topic, handler)` API — `@stomp/stompjs` over `/ws` in real mode, a poller in mock mode (`VITE_REALTIME_POLL_MS`). The app shell keeps chat, notifications, orders and campaigns fresh from it. Vite proxies `/ws` to the backend.

**Screens**
- Brand: `/brand/campaigns` (new-campaign form), campaign detail with applications (reach, rating, pitch, price) → **Accept and pay** checkout, decline, close; `/brand/dashboard` with spend, money in escrow, card holds, orders by status and delivered post links
- Creator: `/creator/campaigns` (open campaigns with filters, my applications), campaign detail to apply or withdraw, link to the order once hired
- `/messages` — two panes on desktop, list then thread on phones, masking notice, Enter to send; **Message** button on every order
- `/notifications` — all / unread, click to open, mark all as read
- Unread badges on Messages and Notifications (sidebar, phone bottom bar, More sheet) and a bell in the sidebar header and phone top bar

## Decisions to confirm

- The accepted creator's price and delivery days come from their application; the campaign brief (plus an optional note) becomes the order brief
- A creator who withdraws can re-apply (one application per creator per campaign)
- Closing a campaign declines pending applications; orders already placed continue
- Only the masked text of a message is stored before completion
- Chat messages show as unread counts rather than notifications

## How to test

1. `npm install && npm run dev`
2. As `brand@demo.test` / `demo1234`: **Campaigns → New campaign**, post it.
3. **View as → Creator · Approved**: **Campaigns**, open the new campaign, send an application.
4. Back as the brand: open the campaign, **Accept and pay** with card `4242 4242 4242 4242` → an order is created for Leo.
5. On any order, **Message**: try sending an email address or phone number — it shows as hidden. Switch accounts and the message arrives within a few seconds.
6. Watch the bell: accepting, delivering and approving orders create notifications for the other side.
7. `/brand/dashboard` shows spend, orders by status and delivered post links.

## Checks

- `npm test` — 182 passing (two clean runs)
- `tsc`, `npm run lint`, `npm run build` — clean
- `npm run check:layout` — all screens incl. campaigns, application checkout, chat and notifications at 360 px and 1280 px in Edge: no sideways scroll, no console errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
