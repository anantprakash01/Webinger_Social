/**
 * Accessibility check (CLAUDE.md §5: WCAG 2.1 AA for public pages and checkout).
 * Runs axe-core with the WCAG 2.0/2.1 A + AA rules in the installed Microsoft Edge at 360 px and
 * 1280 px and fails on any violation.
 *
 *   npm run dev                      # in another terminal (mock mode)
 *   npm run check:a11y               # checks http://localhost:5173
 *   npm run check:a11y -- http://localhost:5181
 */
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:5173';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const PUBLIC = [
  ['landing', '/'],
  ['search', '/search'],
  ['search-filtered', '/search?platform=tiktok&niche=beauty'],
  ['profile', '/u/leomakes'],
  ['login', '/login'],
  ['signup', '/signup'],
  ['forgot-password', '/forgot-password'],
];

const problems = [];
const browser = await chromium.launch({ channel: 'msedge' });

async function audit(page, width, name) {
  await page.waitForTimeout(500);
  await page.waitForFunction(() => !document.querySelector('.skeleton'), null, { timeout: 5000 }).catch(() => {});
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const v of violations) {
    const where = v.nodes
      .slice(0, 3)
      .map((n) => n.target.join(' '))
      .join(' | ');
    problems.push(`${width}px ${name}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length}×: ${where})`);
  }
}

for (const width of [360, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  for (const [name, path] of PUBLIC) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await audit(page, width, name);
  }
  // Phone filter drawer on search.
  if (width === 360) {
    await page.goto(`${base}/search`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Filters/ }).click();
    await audit(page, width, 'search-filter-drawer');
  }
  // Checkout as a brand: package checkout, with validation errors showing, and the custom offer form.
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('brand@demo.test');
  await page.getByLabel('Password', { exact: true }).fill('demo1234');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/brand/'));
  await page.goto(`${base}/u/leomakes`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Buy / }).first().click();
  await page.waitForURL((u) => u.pathname.startsWith('/checkout/'));
  await audit(page, width, 'checkout');
  await page.getByRole('button', { name: /^Authorise/ }).click();
  await audit(page, width, 'checkout-errors');
  await page.goto(`${base}/checkout/offer/leomakes`, { waitUntil: 'networkidle' });
  await audit(page, width, 'offer-checkout');
  await ctx.close();
}
await browser.close();

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Accessibility OK: no WCAG 2.1 A/AA violations found by axe on public pages and checkout.');
