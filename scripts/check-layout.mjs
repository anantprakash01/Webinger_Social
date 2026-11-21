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
  ['brand-profile', '/brand/profile'],
  ['profile-as-brand', '/u/leomakes'],
];
// Week 3: a draft creator walks the setup wizard; an approved creator sees the workspace.
const AS_DRAFT_CREATOR = ['profile', 'socials', 'packages', 'portfolio', 'payouts', 'review'].map((s) => [`onboarding-${s}`, `/creator/onboarding?step=${s}`]);
const AS_CREATOR = [
  ['creator-dashboard', '/creator/dashboard'],
  ['creator-packages', '/creator/packages'],
  ['creator-onboarding-live', '/creator/onboarding?step=profile'],
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
  // Week 4: order list, a delivered order (review actions) and the custom-offer checkout.
  await check(page, width, 'brand-orders', '/brand/orders');
  await check(page, width, 'brand-orders-delivered', '/brand/orders?status=delivered');
  await page.locator('.row-link').first().click();
  await page.waitForURL(/\/brand\/orders\/[0-9A-Z]{26}$/);
  await check(page, width, 'brand-order-delivered');
  await page.getByRole('button', { name: /Request revision/ }).click();
  await check(page, width, 'brand-order-revision-dialog');
  await check(page, width, 'offer-checkout', '/checkout/offer/leomakes');
  await ctx.close();

  for (const [email, pages] of [['newcreator@demo.test', AS_DRAFT_CREATOR], ['creator@demo.test', AS_CREATOR]]) {
    const c = await browser.newContext({ viewport: { width, height: 800 } });
    const p = await c.newPage();
    p.on('pageerror', (e) => problems.push(`${width}px page error: ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && problems.push(`${width}px console error: ${m.text()}`));
    await p.goto(`${base}/login`, { waitUntil: 'networkidle' });
    await p.getByLabel('Email').fill(email);
    await p.getByLabel('Password', { exact: true }).fill('demo1234');
    await p.getByRole('button', { name: 'Log in' }).click();
    await p.waitForURL((url) => url.pathname.startsWith('/creator/'));
    for (const [name, path] of pages) await check(p, width, name, path);
    // The package editor drawer.
    await p.goto(`${base}/creator/packages`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Add package' }).click();
    await check(p, width, `package-editor-${email.split('@')[0]}`);
    if (email === 'creator@demo.test') {
      // Week 4: the creator's orders, a new order to accept, and the deliver dialog on an accepted one.
      await check(p, width, 'creator-orders', '/creator/orders');
      await check(p, width, 'creator-orders-pending', '/creator/orders?status=pending');
      await p.locator('.row-link').first().click();
      await p.waitForURL(/\/creator\/orders\/[0-9A-Z]{26}$/);
      await check(p, width, 'creator-order-pending');
      await p.goto(`${base}/creator/orders?status=in-progress`, { waitUntil: 'networkidle' });
      await p.locator('.row-link').first().click();
      await p.waitForURL(/\/creator\/orders\/[0-9A-Z]{26}$/);
      await p.getByRole('button', { name: /Deliver work/ }).click();
      await check(p, width, 'creator-deliver-dialog');
    }
    await c.close();
  }
}
await browser.close();

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Layout OK at 360 px and 1280 px: no sideways scroll, no errors.');
