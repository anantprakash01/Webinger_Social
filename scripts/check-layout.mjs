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
  ['creator-payouts', '/creator/payouts'],
];
const AS_ADMIN = [
  ['admin-vetting', '/admin/vetting'],
  ['admin-disputes', '/admin/disputes'],
  ['admin-reports', '/admin/reports'],
  ['admin-users', '/admin/users'],
  ['admin-fees', '/admin/fees'],
  ['admin-audit', '/admin/audit'],
  ['admin-orders', '/admin/orders'],
];

const problems = [];
const browser = await chromium.launch({ channel: 'msedge' });

async function check(page, width, name, path) {
  if (path) await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  // Screens that chain requests may still be loading; wait (briefly) for skeletons to go.
  await page.waitForFunction(() => !document.querySelector('.skeleton'), null, { timeout: 5000 }).catch(() => {});
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
  // Week 5: campaigns, a campaign with applications, application checkout, chat, notifications.
  await check(page, width, 'brand-campaigns', '/brand/campaigns');
  await page.locator('.campaign-card__link').first().click();
  await page.waitForURL(/\/brand\/campaigns\/[0-9A-Z]{26}$/);
  await check(page, width, 'brand-campaign-detail');
  await page.getByRole('button', { name: 'Accept and pay' }).first().click();
  await page.waitForURL(/\/checkout\/campaign\//);
  await check(page, width, 'application-checkout');
  await check(page, width, 'brand-messages', '/messages');
  await page.locator('.conv').first().click();
  await page.waitForURL(/\/messages\/[0-9A-Z]{26}$/);
  await check(page, width, 'brand-thread');
  await check(page, width, 'brand-notifications', '/notifications');
  // Week 6: printable receipt for a completed order, and the report dialog on a profile.
  // The inbox may still be updating its own URL; retry if that interrupts this navigation.
  const completed = `${base}/brand/orders?status=completed`;
  await page.goto(completed, { waitUntil: 'networkidle' }).catch(() => page.goto(completed, { waitUntil: 'networkidle' }));
  await page.locator('.row-link').first().click();
  await page.waitForURL((u) => /^\/brand\/orders\/[0-9A-Z]{26}$/.test(u.pathname));
  await page.getByRole('link', { name: /Receipt/ }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/receipts/'));
  await check(page, width, 'brand-receipt');
  await page.goto(`${base}/u/leomakes`, { waitUntil: 'networkidle' });
  await page.locator('.report-link').first().click();
  await check(page, width, 'report-dialog');
  await ctx.close();

  // Week 6: the admin console, including a dispute and the read-only "view as" banner.
  const a = await browser.newContext({ viewport: { width, height: 800 } });
  const ap = await a.newPage();
  ap.on('pageerror', (e) => problems.push(`${width}px page error: ${e.message}`));
  ap.on('console', (m) => m.type() === 'error' && problems.push(`${width}px console error: ${m.text()}`));
  await ap.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await ap.getByLabel('Email').fill('admin@demo.test');
  await ap.getByLabel('Password', { exact: true }).fill('demo1234');
  await ap.getByRole('button', { name: 'Log in' }).click();
  await ap.waitForURL((u) => u.pathname.startsWith('/admin/'));
  for (const [name, path] of AS_ADMIN) await check(ap, width, name, path);
  await ap.goto(`${base}/admin/disputes`, { waitUntil: 'networkidle' });
  await ap.locator('.row-link').first().click();
  await ap.waitForURL((u) => u.pathname.startsWith('/admin/disputes/'));
  await check(ap, width, 'admin-dispute-detail');
  await ap.goto(`${base}/admin/orders`, { waitUntil: 'networkidle' });
  await ap.locator('.row-link').first().click();
  await ap.waitForURL((u) => u.pathname.startsWith('/admin/orders/'));
  await check(ap, width, 'admin-order-detail');
  await ap.goto(`${base}/admin/users?q=brand%40demo.test`, { waitUntil: 'networkidle' });
  await ap.getByRole('button', { name: /^Manage / }).first().click();
  await check(ap, width, 'admin-user-drawer');
  await ap.getByRole('button', { name: /View as/ }).click();
  await ap.waitForURL((u) => u.pathname === '/brand/dashboard');
  await check(ap, width, 'admin-viewing-as-brand');
  await ap.getByRole('button', { name: 'Stop viewing' }).click();
  await ap.waitForURL((u) => u.pathname === '/admin/users');
  await a.close();

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
      // Week 5: browse campaigns and open one to apply.
      await check(p, width, 'creator-campaigns', '/creator/campaigns');
      await p.locator('.campaign-card__link').first().click();
      await p.waitForURL(/\/creator\/campaigns\/[0-9A-Z]{26}$/);
      await check(p, width, 'creator-campaign-detail');
      await check(p, width, 'creator-messages', '/messages');
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
