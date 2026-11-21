## Summary

A UX pass over every screen of the prototype: 19 fixes from a screen-by-screen review, mainly about **showing people what needs their attention** and **making phones easier to use**. The API contract moves to **v1.1.0** with additive fields only.

## What changed

**Priorities and urgency**
1. **"Needs your action"** at the top of both dashboards: orders waiting on you, nearest deadline first, with a one-tap Accept / Deliver / Review button. Shows "You're all caught up" when nothing is waiting.
2. **Orders sorted by urgency** (waiting on you → nearest deadline → newest); countdowns under 24 hours are red.

**Phones**
3. Desktop checkout: the summary and Authorise button stay beside the card form while scrolling (confirmed with real-viewport screenshots).
4. **Action bars above the bottom nav**: the order page's main action (shown only once the action panel scrolls out of view), checkout total + Authorise, and "Packages from $X · See packages" on creator profiles.
5. **Compact order cards**: title, one status row with the amount, the deadline on one line.
14. The demo bar collapses to one **Demo controls** button.
15. Rows of tabs **fade at the edge** when more are scrolled out of view.
16. Pagination uses **icon-only arrows**, so it no longer wraps.

**Consistency**
6. All six `window.confirm` / `window.prompt` pop-ups are now **in-app dialogs** (`useConfirm`).
7. **Toasts** confirm every action (orders, packages, profile, campaigns, admin decisions). Inline "Saved." messages were removed so there's one pattern.
8. When buying is turned off (creator or admin viewing a profile), the **reason is shown as text**, not a hover tooltip.
17. **One date rule** (`lib/dates.ts`): relative under a week ("3 h ago", "yesterday"), then a date ("Nov 3", with the year only if it differs). The order timeline and audit log keep exact date and time on purpose.

**Screens**
9. **Creator profile**: orders completed and typical acceptance time in the header; platform filter for packages; "Send custom offer" moved next to the packages; reviews get a rating filter and "Show all N reviews".
10. **Search**: cards show the city only; creators without a photo get a soft generated pattern instead of big initials; keyword results say why they matched ("Matches niche: Beauty", "Mentions … in their bio"); the result count and filter chips stay visible while scrolling.
11. **Onboarding**: "Step 1 of 6 · 2 of 5 required items done"; the optional gender and birth year moved from step 1 to the review step (still on the profile form once live).
12. **Messages**: the order title leads each conversation; **"Seen"** under your last read message; the report flag appears on hover (always on touch screens).
13. **Admin**: user search applies as you type; **Joined** and **Last active** columns; newest accounts first; capitalised status badges; after approving or rejecting, focus moves to the next creator in the queue.
18. **Landing**: a **Hire creators** button for brands in the header (one "Join" on phones); a "Your money is protected" section with an FAQ; the featured grid no longer repeats the hero's creators.
19. **Brand dashboard**: a **spend per month** chart (6 months, hover for values, screen-reader table) and "View order →" links.

**Contract v1.1.0 (additive)**
- `CreatorProfile.completedOrders`, `CreatorProfile.typicalAcceptHours`
- `BrandStats.spendByMonth`
- `ChatMessage.readAt`
- `AdminUser.lastActiveAt`; admin users listed newest first
- `GET /orders` sorted by urgency

Backend rules for each are in `docs/backend-handover.md`.

## How to test

1. `npm run dev`, log in as `creator@demo.test`: the dashboard opens with **Needs your action**; `/creator/orders` lists the 2-hours-left order first, in red.
2. As `brand@demo.test`: dashboard chart and action list; open a delivered order on a phone-sized window and scroll: an **Approve** bar appears.
3. `/u/leomakes`: track record in the header, package and review filters; on a phone a "See packages" bar.
4. `/search?q=beauty`: cards explain the match; scroll and the count/filters stay.
5. Delete a package or close a campaign: in-app dialog, then a toast.
6. As admin: `/admin/users` (type to search), approve a creator in **Vetting** and focus moves to the next one.

## Checks

- `npm test` — 207 passing (7 new: date rule, urgency sort, v1.1 fields, action list)
- `tsc`, `npm run lint`, `npm run build` — clean
- `npm run check:layout` — every screen at 360 px and 1280 px, no sideways scroll, no console errors
- `npm run check:a11y` — no WCAG 2.1 A/AA violations
- `npm run check:contract` — types match v1.1.0
- `npm run test:e2e` — smoke test passing

🤖 Generated with [Claude Code](https://claude.com/claude-code)
