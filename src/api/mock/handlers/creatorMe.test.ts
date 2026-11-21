import { creatorPayoutCents } from '../orderMachine';
import { VALID_PAYOUT_ACCOUNT } from '@/test/payments';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, currentUser } from '@/api/client';
import type { PackageInput } from '@/types';
import { getDb } from '../db';
import { DEMO_PASSWORD } from '../demo';

const validProfile = {
  username: 'ivycooks',
  displayName: 'Ivy Mathew',
  bio: 'Weeknight recipes and honest kitchen gadget reviews from a tiny flat.',
  city: 'Toronto',
  country: 'CA',
  languages: ['en'],
  niches: ['FOOD', 'HOME'] as ('FOOD' | 'HOME')[],
  photoUrl: '/demo/photo-05.svg',
  coverUrls: [],
};
const pkg = (over: Partial<PackageInput> = {}): PackageInput => ({
  platform: 'INSTAGRAM',
  title: 'Instagram Reel',
  description: 'One 30–60 s Reel featuring your product.',
  deliverables: ['1 Reel'],
  priceCents: 1_200_000,
  deliveryDays: 5,
  active: true,
  ...over,
});

async function expectError(p: Promise<unknown>, status: number, code?: string, field?: string) {
  const e = (await p.then(
    () => {
      throw new Error(`expected ${status}`);
    },
    (err) => err,
  )) as { status: number; code?: string; fieldErrors: Array<{ field: string }> };
  expect(e.status).toBe(status);
  if (code) expect(e.code).toBe(code);
  if (field) expect(e.fieldErrors.map((f) => f.field)).toContain(field);
  return e;
}

beforeEach(async () => {
  await api.dev.reset();
  await api.auth.login('newcreator@demo.test', DEMO_PASSWORD);
});

describe('creator profile (FR-10)', () => {
  it('starts as an empty draft with a checklist', async () => {
    const me = await api.creatorMe.get();
    expect(me.vettingStatus).toBe('DRAFT');
    expect(me.checklist).toEqual({ profile: false, photo: false, socials: false, packages: false, portfolio: false, payouts: false });
    expect(me.usernameLocked).toBe(false);
  });

  it('saves a valid profile and updates the signed-in name', async () => {
    const me = await api.creatorMe.updateProfile({ ...validProfile, displayName: 'Ivy S.' });
    expect(me).toMatchObject({ username: 'ivycooks', niches: ['FOOD', 'HOME'], checklist: { profile: true, photo: true } });
    expect((await api.me.get()).name).toBe('Ivy S.');
  });

  it('rejects bad input with field errors', async () => {
    const e = await expectError(
      api.creatorMe.updateProfile({ ...validProfile, username: '9bad name', bio: 'too short', niches: ['FOOD', 'HOME', 'PETS', 'TECH'] }),
      422,
      'VALIDATION_FAILED',
    );
    expect(e.fieldErrors.map((f) => f.field).sort()).toEqual(['bio', 'niches', 'username']);
    await expectError(api.creatorMe.updateProfile({ ...validProfile, username: 'admin' }), 422, undefined, 'username');
    await expectError(api.creatorMe.updateProfile({ ...validProfile, birthYear: new Date().getFullYear() - 10 }), 422, undefined, 'birthYear');
  });

  it('keeps usernames unique and locks them after approval', async () => {
    await expectError(api.creatorMe.updateProfile({ ...validProfile, username: 'LeoMakes' }), 409, 'USERNAME_TAKEN', 'username');
    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    const leo = await api.creatorMe.get();
    expect(leo.usernameLocked).toBe(true);
    await expectError(
      api.creatorMe.updateProfile({ ...validProfile, username: 'leonew', displayName: leo.displayName, bio: leo.bio!, city: leo.city!, country: leo.country!, languages: leo.languages, niches: leo.niches }),
      409,
      'USERNAME_LOCKED',
    );
  });

  it('is creator-only', async () => {
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    await expectError(api.creatorMe.get(), 403, 'ROLE_NOT_ALLOWED');
  });
});

describe('social accounts (FR-11)', () => {
  it('adds one account per platform and removes it', async () => {
    const s = await api.creatorMe.addSocial({ platform: 'TIKTOK', handle: '@ivy.cooks', followers: 12_500 });
    expect(s).toMatchObject({ platform: 'TIKTOK', handle: 'ivy.cooks', verified: false });
    await expectError(api.creatorMe.addSocial({ platform: 'TIKTOK', handle: 'other', followers: 1 }), 409, 'PLATFORM_EXISTS');
    await expectError(api.creatorMe.addSocial({ platform: 'INSTAGRAM', handle: 'bad handle!', followers: -1 }), 422);
    await api.creatorMe.removeSocial(s.id);
    expect((await api.creatorMe.get()).socials).toEqual([]);
  });

  it('cannot remove someone else’s account', async () => {
    const leoSocial = getDb().socialAccounts.find((x) => x.handle === 'leomakes')!;
    await expectError(api.creatorMe.removeSocial(leoSocial.id), 404);
  });
});

describe('packages (FR-12, FR-13)', () => {
  it('rejects price under ₹500 and delivery outside 1–60 days with field errors (FR-12 acceptance)', async () => {
    await expectError(api.creatorMe.createPackage(pkg({ priceCents: 49_999 })), 422, undefined, 'priceCents');
    await expectError(api.creatorMe.createPackage(pkg({ deliveryDays: 0 })), 422, undefined, 'deliveryDays');
    await expectError(api.creatorMe.createPackage(pkg({ deliveryDays: 61 })), 422, undefined, 'deliveryDays');
    await expectError(api.creatorMe.createPackage(pkg({ priceCents: 1500.5 })), 422, undefined, 'priceCents');
    expect((await api.creatorMe.createPackage(pkg({ priceCents: 50_000, deliveryDays: 60 }))).priceCents).toBe(50_000);
  });

  it('allows at most 8 active packages (FR-13)', async () => {
    for (let i = 0; i < 8; i++) await api.creatorMe.createPackage(pkg({ title: `Package ${i}` }));
    await expectError(api.creatorMe.createPackage(pkg({ title: 'Ninth' })), 409, 'PACKAGE_LIMIT');
    const off = await api.creatorMe.createPackage(pkg({ title: 'Ninth, inactive', active: false }));
    await expectError(api.creatorMe.updatePackage(off.id, { active: true }), 409, 'PACKAGE_LIMIT');
    const first = (await api.creatorMe.get()).packages.find((k) => k.title === 'Package 0')!;
    await api.creatorMe.updatePackage(first.id, { active: false });
    expect((await api.creatorMe.updatePackage(off.id, { active: true })).active).toBe(true);
  });

  it('edits and deletes only own packages', async () => {
    const k = await api.creatorMe.createPackage(pkg());
    expect((await api.creatorMe.updatePackage(k.id, { priceCents: 1_600_000, title: 'Reel + Story' })).priceCents).toBe(1_600_000);
    await api.creatorMe.deletePackage(k.id);
    expect((await api.creatorMe.get()).packages).toEqual([]);
    const leoPkg = getDb().packages.find((x) => x.creatorId === getDb().users.find((u) => u.email === 'creator@demo.test')!.id)!;
    await expectError(api.creatorMe.updatePackage(leoPkg.id, { priceCents: 50_000 }), 404);
  });

  it('shows a newly approved creator’s package in search', async () => {
    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    await api.creatorMe.createPackage(pkg({ title: 'Brand new package', priceCents: 50_000 }));
    expect((await api.creators.search({ q: 'leomakes' })).content[0].startingPriceCents).toBe(50_000);
  });
});

describe('portfolio (FR-14) and uploads', () => {
  it('adds images and https video links, max 12', async () => {
    await expectError(api.creatorMe.addPortfolioItem({ type: 'VIDEO_LINK', url: 'ftp://x' }), 422, undefined, 'url');
    await api.creatorMe.addPortfolioItem({ type: 'VIDEO_LINK', url: 'https://example.com/v/1', caption: 'Launch video' });
    for (let i = 0; i < 11; i++) await api.creatorMe.addPortfolioItem({ type: 'IMAGE', url: `/demo/work-0${(i % 9) + 1}.svg` });
    await expectError(api.creatorMe.addPortfolioItem({ type: 'IMAGE', url: '/demo/work-01.svg' }), 409, 'PORTFOLIO_LIMIT');
    const me = await api.creatorMe.get();
    expect(me.portfolio).toHaveLength(12);
    await api.creatorMe.removePortfolioItem(me.portfolio[0].id);
    expect((await api.creatorMe.get()).portfolio).toHaveLength(11);
  });

  it('uploads an image and refuses other files', async () => {
    const png = new File([new Uint8Array([137, 80, 78, 71])], 'me.png', { type: 'image/png' });
    expect(await api.files.upload(png, 'AVATAR')).toMatch(/^data:image\//);
    await expectError(api.files.upload(new File(['x'], 'cv.pdf', { type: 'application/pdf' }), 'AVATAR'), 422);
  });
});

describe('payouts (FR-62) and submit for review (FR-16)', () => {
  it('verifies a payout account (bank or UPI) and enables payouts', async () => {
    await expectError(api.payouts.saveAccount({ ...VALID_PAYOUT_ACCOUNT, pan: 'ABC123' }), 422);
    await expectError(api.payouts.saveAccount({ ...VALID_PAYOUT_ACCOUNT, ifsc: 'HDFC1234' }), 422);
    const failed = await api.payouts.saveAccount({ ...VALID_PAYOUT_ACCOUNT, accountNumber: '000000000' });
    expect(failed.status).toBe('FAILED');
    expect((await api.creatorMe.get()).payoutStatus).toBe('PENDING');
    const ok = await api.payouts.saveAccount({ ...VALID_PAYOUT_ACCOUNT, method: 'UPI', vpa: 'ivy@okaxis', accountNumber: null, ifsc: null });
    expect(ok).toMatchObject({ status: 'VERIFIED', destinationLabel: 'ivy@okaxis', panMasked: 'ABCDE••••F' });
    expect((await api.creatorMe.get()).payoutStatus).toBe('ENABLED');
  });

  it('lists what is missing, then submits, then can be approved or rejected and resubmitted', async () => {
    const e = await expectError(api.creatorMe.submitForReview(), 422, 'PROFILE_INCOMPLETE');
    expect(e.fieldErrors.map((f) => f.field)).toEqual(['profile', 'photo', 'socials', 'packages', 'payouts']);

    await api.creatorMe.updateProfile(validProfile);
    await api.creatorMe.addSocial({ platform: 'INSTAGRAM', handle: 'ivycooks', followers: 8_000 });
    await api.creatorMe.createPackage(pkg());
    await api.payouts.saveAccount(VALID_PAYOUT_ACCOUNT);

    const submitted = await api.creatorMe.submitForReview();
    expect(submitted.vettingStatus).toBe('PENDING_REVIEW');
    expect(submitted.submittedAt).not.toBeNull();
    await expectError(api.creatorMe.submitForReview(), 409, 'INVALID_VETTING_STATE');
    // Not public while in review
    await expect(api.creators.search({ q: 'ivycooks' })).resolves.toMatchObject({ totalElements: 0 });

    await expectError(api.dev.vettingDecision('REJECT'), 422, 'REASON_REQUIRED');
    const rejected = await api.dev.vettingDecision('REJECT', 'Add a clearer profile photo.');
    expect(rejected).toMatchObject({ vettingStatus: 'REJECTED', rejectionReason: 'Add a clearer profile photo.' });
    expect(currentUser()?.creator?.vettingStatus).toBe('REJECTED');

    expect((await api.creatorMe.submitForReview()).rejectionReason).toBeNull();
    const approved = await api.dev.vettingDecision('APPROVE');
    expect(approved).toMatchObject({ vettingStatus: 'APPROVED', usernameLocked: true });
    expect((await api.creators.search({ q: 'ivycooks' })).totalElements).toBe(1);
  });
});

describe('dashboard stats (FR-70)', () => {
  it('reports views, active packages and an order count for every status', async () => {
    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    const s = await api.creatorMe.stats();
    expect(s.profileViews).toBe(getDb().creatorProfiles.find((p) => p.username === 'leomakes')!.profileViews);
    expect(s.activePackages).toBeGreaterThan(0);
    expect(Object.keys(s.ordersByStatus).sort()).toEqual(['CLOSED', 'COMPLETED', 'DELIVERED', 'DISPUTED', 'IN_PROGRESS', 'PENDING_ACCEPTANCE', 'REFUNDED']);
    // Week 4 seed: Leo has one completed order (paid), two accepted ones (in escrow) and one pending.
    const leoId = getDb().users.find((u) => u.email === 'creator@demo.test')!.id;
    const mine = getDb().orders.filter((o) => o.creatorUserId === leoId);
    const payout = (o: (typeof mine)[number]) => creatorPayoutCents(o);
    const completed = mine.filter((o) => o.status === 'COMPLETED').reduce((sum, o) => sum + payout(o), 0);
    const escrow = mine.filter((o) => ['IN_PROGRESS', 'DELIVERED', 'DISPUTED'].includes(o.status)).reduce((sum, o) => sum + payout(o), 0);
    expect(completed).toBeGreaterThan(0);
    expect(s).toMatchObject({ availableCents: completed, lifetimeEarnedCents: completed, inEscrowCents: escrow, currency: 'INR' });
    expect(s.ordersByStatus.PENDING_ACCEPTANCE).toBe(mine.filter((o) => o.status === 'PENDING_ACCEPTANCE').length);
  });
});

describe('brand profile (FR-05)', () => {
  beforeEach(async () => {
    await api.auth.login('unverified@demo.test', DEMO_PASSWORD);
  });

  it('reads and saves the company profile, normalising the website', async () => {
    expect((await api.brands.getProfile()).companyName).toBe('Fernhill Tea House');
    const saved = await api.brands.updateProfile({ companyName: 'Fernhill Teas', website: 'http://fernhill.example.com/', industry: 'FOOD', country: 'gb' });
    expect(saved).toMatchObject({ companyName: 'Fernhill Teas', website: 'https://fernhill.example.com', country: 'GB', plan: 'FREE' });
    expect((await api.me.get()).brand?.companyName).toBe('Fernhill Teas');
  });

  it('validates and is brand-only', async () => {
    await expectError(api.brands.updateProfile({ companyName: 'X', website: 'not a site', industry: 'NOPE' as never, country: 'GB' }), 422);
    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    await expectError(api.brands.getProfile(), 403);
  });
});
