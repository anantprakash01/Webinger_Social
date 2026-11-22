# Launch readiness: legal, Indian taxes, collaboration flow, retention, UI (contract v2.6.0)

Builds the whole launch-readiness backlog agreed on 22 Nov 2026 (CLAUDE.md §18), one commit per phase. Everything still runs on the in-browser mock; the contract grows additively from v2.1.0 to **v2.6.0**, and `docs/backend-handover.md` → "Launch readiness" describes every new rule for the Spring Boot team.

## What changes for people

### A — launch blockers
- **Legal pages**: `/terms`, `/privacy` (DPDP consent, grievance officer), `/refunds`. Linked from the footer, sign-up and checkout. **Templates — a lawyer must review them.**
- **Account settings** (`/settings`): change name, email (re-verify), password; sign out other devices; download my data (JSON); delete my account with a 30-day grace period (blocked while orders are open or a creator has a balance).
- **Tab titles** on every page (WCAG 2.4.2).
- **Admin cancels an accepted order** (FR-37): full refund to the original payment method, audited.

### B — Indian taxes (standard rates in force; confirm with a CA)
- GST 18% on the platform's fees: CGST 9% + SGST 9% when the brand is in the platform's state, otherwise IGST 18%.
- GST-registered creators charge 18% GST on their price; the brand pays it and it passes to the creator.
- TDS u/s 194-O (0.1%) and, for registered creators, TCS u/s 52 CGST (0.5%) are withheld at release.
- Brands add their state and GSTIN; creators can add a GSTIN to their payout account. Checkout, orders and receipts show every tax line; receipts are tax invoices; creators see TDS/TCS for the financial year.
- Ledger gains `GST_PAYABLE` and `TAX_WITHHELD`; every transaction still sums to zero.

### C — collaboration flow
- **Package add-ons**: paid ad-usage rights, rush delivery, extra revision — set by the creator, ticked by the brand at checkout, fixed on the order.
- **Drafts before posting**: the creator shares a draft; the brand approves it or asks for changes (doesn't use a revision).
- **Product shipping**: the brand adds courier and tracking; the creator confirms receipt.
- **More time**: the creator asks for 1–14 extra days; the brand accepts (due date moves) or declines.
- **Post results**: the creator records views, likes, comments, shares and reach on delivered posts; the brand sees them on the order and as totals on the dashboard.

### D — retention and trust
- **Saved lists** (FR-25) from profiles and search cards; `/brand/lists`.
- **Campaign invites** (FR-43) from profiles and saved lists; creators get an Invitations tab and can decline.
- **Vacation mode**: creators pause new orders; profiles and cards show "Away"; open orders continue.
- **Notification preferences** (FR-53): email / SMS / WhatsApp per category with a +91 mobile number. SMS and WhatsApp are simulated in the prototype.
- **Chat attachments**: one image or PDF per message.
- **Creators rate brands** after completion; the rating shows on campaigns and orders.
- **India-first demo data**: Indian names and cities, regional languages. Demo logins are unchanged; display names changed (Leo Fernandes, Maya Iyer, Ivy Mathew, Sam Mehta, Theo Pinto).

### E — UI
- Smaller page titles inside the workspace and on phones.
- Rupee shorthand on stat tiles and cards (₹82,200 · ₹1.2L · ₹2.5Cr), with the exact amount on hover and for screen readers.
- Order progress stepper on every order.
- Search: suggestions as you type (creators, niches, cities), recent searches, "Usually accepts within 24 h" filter.
- Notifications grouped by order, with "mark as read" on each.
- "Get started" checklist on the brand dashboard.
- **Hindi**: language switcher (header/footer, sign-in pages, settings); the shell, home page, sign-in/sign-up and checkout are translated. **The Hindi copy needs a native speaker's review.**

### Fixed along the way
- Search cards explained matches wrongly: keywords were split on the letter "s" instead of spaces.
- The price filter chip showed `$` instead of `₹`.
- The home-page FAQ still mentioned the brand wallet that was removed in v2.0.
- Long dropdown options (Indian state names) pushed the brand profile form off screen at 360 px.

## Contract (v2.1.0 → v2.6.0, additive)
| Version | Adds |
| --- | --- |
| 2.2 | `/me/password`, `/me/email`, `/me/sessions/revoke-others`, `/me/export`, `/me/deletion`; `/admin/orders/{id}/cancel` |
| 2.3 | `OrderTaxes` on quotes and orders, `taxParties`, brand `state`/`gstin`, payout `gstin`, TDS/TCS totals |
| 2.4 | Package add-ons, drafts, shipment, extension, post metrics; collaboration event types |
| 2.5 | Saved lists, availability, invites, notification preferences, chat attachments, brand reviews/ratings |
| 2.6 | `fastAccept` search filter, `/creators/suggestions` |

## Checks
- 244 unit and UI tests pass; `tsc`, lint and build clean; `check:contract` in sync (v2.6.0).
- `check:layout` (360 px and 1280 px) now also covers saved lists, settings, the 24 h filter and creator invitations — no sideways scroll, no console errors.
- `check:a11y`: no WCAG 2.1 A/AA violations on public pages and checkout.
- E2E smoke (sign-up → onboarding → approval → search → paid order → delivery → approval → instant withdrawal) passes.
- Mock data version is 12, so open demo tabs reset to the new seed.

## Needs a decision or outside review before launch
- Tax rates, TDS/TCS handling and the invoice format — a CA.
- Terms, Privacy and Refund pages — a lawyer.
- Hindi copy — a native speaker.
- DPDP: creators can sign up from 16; under-18s need verifiable parental consent (raise the minimum to 18 or add a consent flow).
- SMS / WhatsApp provider and DLT template registration.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
