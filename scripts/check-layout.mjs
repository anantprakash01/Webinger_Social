/**
 * Layout smoke check (CLAUDE.md convention 7: test at 360 px).
 * Opens key screens at 360 px and 1280 px in the installed Microsoft Edge, fails on horizontal
 * overflow, page errors or console errors, and optionally saves full-page screenshots.
 *
 *   npm run dev                       # in another terminal (mock mode)
 *   npm run check:layout              # checks http://localhost:5173
 *   npm run check:layout -- http://localhost:5181 ./shots
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:5173';
const shots = process.argv[3];
if (shots) mkdirSync(shots, { recursive: true });

const PUBLIC = [
  ['landing', '/'],
  ['search', '/search'],
  ['search-filtered', '/search?platform=tiktok&niche=beauty'],
  ['profile', '/u/leomakes'],
  ['login', '/login'],
  ['signup', '/signup?role=creator'],
  ['forgot-password', '/forgot-password'],
];
const AS_BRAND = [
  ['brand-dashboard', '/brand/dashboard'],
  ['profile-as-brand', '/u/leomakes'],
];

const problems = [];
const browser = await chromium.launch({ channel: 'msedge' });

async function check(page, width, name, path) {
  if (path) await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) problems.push(`${width}px ${name}: scrolls sideways by ${overflow}px`);
  if (shots) await page.screenshot({ path: `${shots}/${name}-${width}.png`, fullPage: true });
}

for (const width of [360, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${width}px page error: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${width}px console error: ${m.text()}`));
  for (const [name, path] of PUBLIC) await check(page, width, name, path);

  // Guest buys a package → logs in as a brand → lands on checkout.
  await page.goto(`${base}/u/leomakes`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Buy / }).first().click();
  await page.getByLabel('Email').fill('brand@demo.test');
  await page.getByLabel('Password', { exact: true }).fill('demo1234');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/checkout\//);
  await check(page, width, 'checkout');
  for (const [name, path] of AS_BRAND) await check(page, width, name, path);
  await ctx.close();
}
await browser.close();

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Layout OK at 360 px and 1280 px: no sideways scroll, no errors.');
