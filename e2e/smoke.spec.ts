/**
 * Phase 0 smoke test (CLAUDE.md §10, Week 6): sign up → onboard → admin approves → brand searches
 * → buys (UPI through Razorpay, mocked) → creator accepts → delivers → brand approves → creator
 * balance updated → creator withdraws instantly.
 *
 * The mock keeps its data in sessionStorage, so the whole journey happens in one browser tab and
 * the roles take turns by signing out and in.
 */
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'smoke-pass-2026';
const CREATOR = { name: 'Nova Quill', email: 'nova.quill@smoke.test', username: 'novaquill' };

async function logIn(page: Page, email: string, password = 'demo1234') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function signOut(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL((u) => u.pathname === '/login');
}

async function pickDemoImage(page: Page, label: string) {
  const picker = page.locator('.imgpick').filter({ has: page.locator('.field__label', { hasText: label }) });
  await picker.getByRole('button', { name: 'Use a demo image' }).click();
  await page.getByRole('button', { name: 'Demo image 3' }).click();
}

const cents = (s: string) => Math.round(Number(s.replace(/[^0-9.]/g, '')) * 100);
const availableBalance = (page: Page) => page.locator('.stat').filter({ hasText: 'Available balance' }).locator('.stat__value');

test('a new creator gets booked and paid', async ({ page }) => {
  // 1. Sign up as a creator and verify the email (FR-01, FR-02).
  await page.goto('/');
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/signup?role=creator');
  await page.getByLabel('Your name').fill(CREATOR.name);
  await page.getByLabel('Email').fill(CREATOR.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/verify-email');
  await page.getByRole('link', { name: 'Open the link from this email' }).click();
  await expect(page.getByText(`${CREATOR.email} is verified`)).toBeVisible();
  await page.getByRole('link', { name: 'Continue' }).click();
  await page.waitForURL('**/creator/**');

  // 2. Onboarding wizard (FR-10 – FR-16, FR-62).
  await page.goto('/creator/onboarding?step=profile');
  await expect(page.getByRole('heading', { name: '1. Profile' })).toBeVisible();
  await pickDemoImage(page, 'Profile photo');
  await expect(page.getByLabel('Username')).toHaveValue(CREATOR.username);
  await page.getByLabel('Bio').fill('Small-batch ceramics, slow mornings and honest reviews of things for the home.');
  await page.getByLabel('Country').selectOption('CA');
  await page.getByLabel('City').fill('Halifax');
  await page.locator('label.chipgroup__chip', { hasText: 'Home & decor' }).click();
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page.getByRole('heading', { name: '2. Social accounts' })).toBeVisible();
  await page.getByLabel('Platform').selectOption('INSTAGRAM');
  await page.getByLabel('Handle').fill('@nova.quill.smoke');
  await page.getByLabel('Followers').fill('48200');
  await page.getByRole('button', { name: 'Link account' }).click();
  await expect(page.getByText(/@nova\.quill\.smoke · 48\.2K followers/)).toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click();

  await expect(page.getByRole('heading', { name: '3. Packages' })).toBeVisible();
  await page.getByRole('button', { name: 'Add package' }).click();
  const drawer = page.getByRole('dialog', { name: 'New package' });
  await drawer.getByLabel('Title').fill('Instagram Reel: pottery unboxing');
  await drawer.getByLabel('What the brand gets').fill('A 30–45 s Reel unboxing and using your product at home.');
  await drawer.getByLabel('Deliverables').fill('1 Instagram Reel');
  await drawer.getByLabel('Deliverables').press('Enter');
  await drawer.getByLabel('Price (₹)').fill('10000');
  await drawer.getByRole('button', { name: 'Add package' }).click();
  await expect(page.getByText('Instagram Reel: pottery unboxing').first()).toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click();

  await expect(page.getByRole('heading', { name: '4. Portfolio' })).toBeVisible();
  await page.getByRole('button', { name: /Skip for now/ }).click();

  await expect(page.getByRole('heading', { name: '5. Payouts' })).toBeVisible();
  await page.getByLabel(/^PAN/).fill('ABCDE1234F');
  await page.getByLabel('Account number').fill('50100987654321');
  await page.getByLabel('IFSC').fill('ICIC0004321');
  await page.getByRole('button', { name: 'Verify and save' }).click();
  await expect(page.getByText('Payouts are set up.')).toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click();

  await expect(page.getByRole('heading', { name: '6. Review & submit' })).toBeVisible();
  await page.getByRole('button', { name: /Submit for review/ }).click();
  await expect(page.getByText('Your profile is with our team.').first()).toBeVisible();
  await signOut(page);

  // 3. Admin approves the profile (FR-80).
  await logIn(page, 'admin@demo.test');
  await page.goto('/admin/vetting');
  const card = page.locator('.card').filter({ hasText: `@${CREATOR.username}` });
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toHaveCount(0);
  await signOut(page);

  // 4. A brand finds the creator in search (FR-20) and buys the package (FR-30, FR-33, FR-60).
  await logIn(page, 'brand@demo.test');
  await page.goto(`/search?q=${CREATOR.username}`);
  await page.getByRole('link', { name: new RegExp(CREATOR.name) }).first().click();
  await page.waitForURL(`**/u/${CREATOR.username}`);
  await page.getByRole('button', { name: /^Buy / }).first().click();
  await page.waitForURL('**/checkout/**');
  await page.getByLabel('What do you need?').fill('Unbox our stoneware mug set in your morning routine, natural light please.');
  // Pay by UPI: Saltbay's saved UPI ID is preselected. ₹10,000 + 10% fee = ₹11,000.
  await expect(page.getByRole('radio', { name: 'saltbay@okhdfcbank' })).toBeChecked();
  await page.getByRole('button', { name: 'Pay ₹11,000.00' }).click();
  await expect(page.getByText('Order placed.')).toBeVisible();
  const orderPath = new URL(page.url()).pathname;
  const orderId = orderPath.split('/').pop()!;
  await signOut(page);

  // 5. The creator accepts and delivers (FR-32, FR-34).
  await logIn(page, CREATOR.email, PASSWORD);
  await page.goto(`/creator/orders/${orderId}`);
  await page.getByRole('button', { name: /Accept order/ }).click();
  await page.getByRole('dialog', { name: 'Accept this order?' }).getByRole('button', { name: 'Accept order' }).click();
  await page.getByRole('button', { name: /Deliver work/ }).click();
  const deliver = page.getByRole('dialog', { name: 'Deliver your work' });
  await deliver.getByLabel('Link to the live post').fill('https://example.com/p/smoke-reel');
  await deliver.getByRole('button', { name: /Add link/ }).click();
  await deliver.getByRole('button', { name: /^Deliver$/ }).click();
  await expect(page.getByRole('heading', { name: 'Delivered — waiting for the brand' })).toBeVisible();
  await page.goto('/creator/payouts');
  const before = cents(await availableBalance(page).innerText());
  await signOut(page);

  // 6. The brand approves (FR-35): ₹10,000 − 15% = ₹8,500 goes to the creator's balance (FR-61, FR-63).
  await logIn(page, 'brand@demo.test');
  await page.goto(orderPath);
  await page.getByRole('button', { name: /Approve and pay/ }).click();
  await page.getByRole('dialog', { name: 'Approve and release payment?' }).getByRole('button', { name: 'Approve and pay' }).click();
  await expect(page.getByText(/₹8,500\.00 was released/)).toBeVisible();
  await signOut(page);

  await logIn(page, CREATOR.email, PASSWORD);
  await page.goto('/creator/payouts');
  await expect.poll(async () => cents(await availableBalance(page).innerText())).toBe(before + 850_000);
  await expect(page.getByText('+₹8,500.00')).toBeVisible();

  // 7. Withdraw now, instantly (1% fee): the money goes to the verified ICICI account.
  await page.getByRole('button', { name: /Withdraw now/ }).click();
  const w = page.getByRole('dialog', { name: 'Withdraw now' });
  await w.getByLabel('Amount (₹)').fill('8500');
  await w.getByText('Instant', { exact: true }).click();
  await expect(w.getByText('₹8,415.00').first()).toBeVisible();
  await w.getByRole('button', { name: /^Withdraw/ }).click();
  await expect(page.getByText(/Instant withdrawal to ICICI Bank •••• 4321/)).toBeVisible();
});
