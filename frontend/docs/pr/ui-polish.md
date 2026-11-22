## Summary

Two small UI improvements: an account menu behind the avatar, and removing a redundant label above page titles.

### Account menu (contract v2.1.0, additive)

The avatar now shows the real picture (creator photo, brand logo, otherwise initials) and opens a menu, as on most platforms:

- name and email, with a camera badge on the picture
- **Change photo** / **Change logo** (upload, or a demo image in the prototype)
- creators: **View public profile**, **Edit profile**, **Payouts**
- brands: **Company profile**, **Payment methods**
- **Sign out**

It sits in the sidebar on desktop (opens upwards) and the top bar on phones (opens downwards), and closes on outside click, Escape or navigation. In a read-only "view as" session there is no Change photo. API: `Me.avatarUrl` and `PUT /me/avatar` (creators can replace their photo but not remove it, since review needs one; brands can remove their logo).

### Page labels

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

- `npm test`: 218 passing (new: picture API rules, account menu flow)
- `tsc`, `npm run lint`: clean
- `npm run check:layout`: every screen at 360 px and 1280 px, including the open account menu: no sideways scroll, no console errors
- `npm run check:a11y`, `npm run check:contract` (v2.1.0): clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
