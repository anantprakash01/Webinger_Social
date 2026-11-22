# Day and night mode

Adds a night (dark) theme to every screen. It follows the device's setting by default, and people can switch it themselves.

## What changes for people
- **Sun/moon button** in the public header, on the sign-in and sign-up pages, in the workspace sidebar (next to Sign out) and in the phone top bar. It switches between day and night.
- **Settings → Appearance:** Match my device, Day or Night.
- The choice is remembered on that device and applied before the page draws, so there is no white flash on load.
- Printed receipts and invoices always use day colours.

## How it's built
- `src/styles/tokens.css` keeps the Webinger day palette and adds a night set. The night set applies when the device prefers dark (unless the person chose Day) or when the person chose Night (`html[data-theme='dark']`).
- About 65 hard-coded colours across the stylesheets now use role tokens:
  - red as text vs red as a button fill;
  - navy as text vs navy as a panel;
  - text placed on red, dark or green fills;
  - chart bars, focus rings, loading skeletons, shadows and overlays.
- `src/lib/theme.ts` handles the preference (system / light / dark), the hook and storage. `src/components/ThemeToggle.tsx` has the button and the Settings choice.
- Hindi labels added for the new controls.

## Checks
- Night palette contrast (WCAG 2.1 AA):

  | Pair | Ratio |
  | --- | --- |
  | Body text on cards | 15:1 |
  | Secondary text | 6.8:1 or more |
  | Red text | 6.3:1 |
  | White on red buttons | 5:1 |
  | White on the hover red | 6.7:1 |
  | Status colours on their backgrounds | 6:1 or more |

- `check:a11y` now runs every public page and checkout in **both themes** at 360 px and 1280 px, with no violations. Its first night run caught a hover colour that was too light, which is now fixed.
- 269 unit and UI tests pass, including new theme tests. `tsc`, lint and build are clean, and `check:layout` passes at 360 px and 1280 px.
- I reviewed screenshots of the landing page, search, creator profile, checkout, dashboard, messages, settings and the admin finance page at both widths.

## For review
- The night palette is new: please confirm it fits the Webinger brand. The red is slightly lighter at night so it stays readable.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
