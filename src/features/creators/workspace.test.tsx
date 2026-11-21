import { VALID_PAYOUT_ACCOUNT } from '@/test/payments';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/api/client';
import { DEMO_PASSWORD } from '@/api/mock/demo';
import { App } from '@/app/App';

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

beforeEach(async () => {
  await api.dev.reset();
});

/** Picks the first demo image in the picker labelled `label`. */
async function pickDemoImage(user: ReturnType<typeof userEvent.setup>, label: string) {
  const picker = screen.getByText(label, { selector: '.field__label' }).closest('.imgpick') as HTMLElement;
  await user.click(within(picker).getByRole('button', { name: 'Use a demo image' }));
  await user.click(await screen.findByRole('button', { name: 'Demo image 3' }));
}

describe('onboarding wizard (FR-10 – FR-16, FR-62)', () => {
  it('takes a draft creator from empty profile to submitted, then approved', async () => {
    await api.auth.login('newcreator@demo.test', DEMO_PASSWORD);
    renderAt('/creator/onboarding');
    const user = userEvent.setup();

    // 1. Profile
    expect(await screen.findByRole('heading', { name: '1. Profile' })).toBeInTheDocument();
    await pickDemoImage(user, 'Profile photo');
    expect(screen.getByLabelText('Username')).toHaveValue('ivysandoval');
    await user.type(screen.getByLabelText('Bio'), 'Weeknight recipes and honest kitchen gadget reviews from a tiny flat.');
    await user.selectOptions(screen.getByLabelText('Country'), 'CA');
    await user.type(screen.getByLabelText('City'), 'Toronto');
    await user.click(screen.getByRole('checkbox', { name: 'Food & drink' }));
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    // 2. Socials
    expect(await screen.findByRole('heading', { name: '2. Social accounts' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Platform'), 'TIKTOK');
    await user.type(screen.getByLabelText('Handle'), '@ivy.cooks');
    await user.type(screen.getByLabelText('Followers'), '12,500');
    await user.click(screen.getByRole('button', { name: 'Link account' }));
    expect(await screen.findByText(/@ivy\.cooks · 12\.5K followers/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    // 3. Packages
    expect(await screen.findByRole('heading', { name: '3. Packages' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Add package' }));
    const drawer = await screen.findByRole('dialog', { name: 'New package' });
    await user.type(within(drawer).getByLabelText('Title'), 'TikTok recipe video');
    await user.type(within(drawer).getByLabelText('What the brand gets'), 'A 30–60 s recipe video using your product.');
    await user.type(within(drawer).getByLabelText('Deliverables'), '1 TikTok video{enter}Raw footage');
    await user.type(within(drawer).getByLabelText('Price (₹)'), '15000');
    await user.click(within(drawer).getByRole('button', { name: 'Add package' }));
    expect(await screen.findByText('TikTok recipe video')).toBeInTheDocument();
    expect(screen.getByText('₹15,000.00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    // 4. Portfolio (optional)
    expect(await screen.findByRole('heading', { name: '4. Portfolio' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Skip for now/ }));

    // 5. Payouts: PAN + bank account, verified by Razorpay (mocked)
    expect(await screen.findByRole('heading', { name: '5. Payouts' })).toBeInTheDocument();
    await user.type(await screen.findByLabelText(/^PAN/), 'ABCDE1234F');
    await user.type(screen.getByLabelText('Account number'), '50100123456789');
    await user.type(screen.getByLabelText('IFSC'), 'HDFC0001234');
    await user.click(screen.getByRole('button', { name: 'Verify and save' }));
    expect(await screen.findByText('Payouts are set up.')).toBeInTheDocument();
    expect(screen.getAllByText(/HDFC Bank •••• 6789/).length).toBeGreaterThan(0);
    expect(window.location.search).toBe('?step=payouts');
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    // 6. Review and submit
    expect(await screen.findByRole('heading', { name: '6. Review & submit' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Submit for review/ }));
    expect(await screen.findByText('Your profile is with our team.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit for review/ })).not.toBeInTheDocument();

    // Demo bar stands in for the admin queue
    await user.click(within(screen.getByRole('group', { name: 'Simulate review' })).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('heading', { name: 'Edit your profile' })).toBeInTheDocument();
    expect((await api.creators.search({ q: 'ivysandoval' })).totalElements).toBe(1);
  }, 60_000); // six steps and ~30 interactions in jsdom

  it('shows field errors from the package rules (FR-12 acceptance)', async () => {
    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    renderAt('/creator/packages');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add package' }));
    const drawer = await screen.findByRole('dialog', { name: 'New package' });
    await user.type(within(drawer).getByLabelText('Title'), 'Cheap thing');
    await user.type(within(drawer).getByLabelText('What the brand gets'), 'Something small and quick.');
    await user.type(within(drawer).getByLabelText('Deliverables'), 'One thing');
    await user.type(within(drawer).getByLabelText('Price (₹)'), '499');
    await user.clear(within(drawer).getByLabelText('Delivery (days)'));
    await user.type(within(drawer).getByLabelText('Delivery (days)'), '61');
    await user.click(within(drawer).getByRole('button', { name: 'Add package' }));
    expect(await within(drawer).findByText('The minimum price is ₹500.')).toBeInTheDocument();
    expect(within(drawer).getByText('Delivery must be 1 to 60 days.')).toBeInTheDocument();
  });

  it('switches a package off and on from the packages page', async () => {
    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    renderAt('/creator/packages');
    const [first] = await screen.findAllByRole('switch');
    expect(first).toBeChecked();
    const user = userEvent.setup();
    await user.click(first);
    await waitFor(() => expect(screen.getAllByRole('switch')[screen.getAllByRole('switch').length - 1]).not.toBeChecked());
    expect(screen.getByText('Off')).toBeInTheDocument();
  });
});

describe('vetting banner (FR-16)', () => {
  it('shows the rejection reason across the workspace and links to fix it', async () => {
    await api.auth.login('newcreator@demo.test', DEMO_PASSWORD);
    // Fast-forward the setup through the API, then reject.
    await api.creatorMe.updateProfile({ username: 'ivyx', displayName: 'Ivy', bio: 'Weeknight recipes and honest gadget reviews.', city: 'Toronto', country: 'CA', languages: ['en'], niches: ['FOOD'], photoUrl: '/demo/photo-03.svg', coverUrls: [] });
    await api.creatorMe.addSocial({ platform: 'INSTAGRAM', handle: 'ivyx', followers: 900 });
    await api.creatorMe.createPackage({ platform: 'INSTAGRAM', title: 'Reel', description: 'One short Reel.', deliverables: ['1 Reel'], priceCents: 400_000, deliveryDays: 4, active: true });
    await api.payouts.saveAccount(VALID_PAYOUT_ACCOUNT);
    await api.creatorMe.submitForReview();
    await api.dev.vettingDecision('REJECT', 'Please link a public account.');

    renderAt('/creator/packages');
    expect(await screen.findByText(/Please link a public account\./)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Fix and resubmit' }));
    expect(await screen.findByRole('button', { name: /Resubmit for review/ })).toBeInTheDocument();
  });

  it('dashboard shows the live state and the FR-70 numbers', async () => {
    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    renderAt('/creator/dashboard');
    expect(await screen.findByText('Your profile is live.')).toBeInTheDocument();
    expect(screen.getByText('Profile views')).toBeInTheDocument();
    // Week 4 seed: Leo has orders waiting, in progress and completed.
    expect(screen.getByText('Awaiting acceptance')).toBeInTheDocument();
    expect(screen.getByText(/of 8 active/)).toBeInTheDocument();
  });
});

describe('brand profile (FR-05)', () => {
  it('saves the company profile and updates the sidebar name', async () => {
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    renderAt('/brand/profile');
    const user = userEvent.setup();
    const name = await screen.findByLabelText('Company name');
    await user.clear(name);
    await user.type(name, 'Saltbay Goods');
    await user.clear(screen.getByLabelText('Website'));
    await user.type(screen.getByLabelText('Website'), 'not a website');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Enter a website like yourbrand.com')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Website'));
    await user.type(screen.getByLabelText('Website'), 'saltbaygoods.example.com');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Company profile saved')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toHaveTextContent('Saltbay Goods');
  });
});

vi.stubGlobal('confirm', () => true);
