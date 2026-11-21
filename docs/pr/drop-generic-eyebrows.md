## Summary

Removes the generic grey label above page titles ("Creator workspace", "Brand workspace", "Admin") from 15 pages. It repeated what the sidebar already shows (area name and the highlighted page), and on phones it cost a line of space on every screen.

Labels that carry real information stay:

- **Brand dashboard:** the company name.
- **Onboarding:** "Get set up · about 15 minutes".
- **Hiring from a campaign:** "Campaign · *name*".
- **Admin dispute:** "Brand → Creator".
- **Campaign detail:** its status badge.
- **Checkout:** "Checkout" vs "Custom offer".
- **Order pages:** "Order #…".

## Pages changed

- Creator: Dashboard, Orders, Packages, Campaigns, Payouts
- Brand: Orders, Campaigns, Company profile, Payment methods; the dashboard no longer falls back to "Brand workspace" when there is no company name
- Admin: Vetting, Disputes, Reports, Users, Fees & plans, Audit log, Orders

## Checks

- `npm test`: 216 passing
- `tsc`, `npm run lint`: clean
- `npm run check:layout`: every screen at 360 px and 1280 px, no sideways scroll, no console errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
