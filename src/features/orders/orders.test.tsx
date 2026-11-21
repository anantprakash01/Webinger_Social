import { formatMoney } from '@/lib/money';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/api/client';
import { getDb } from '@/api/mock/db';
import { DEMO_PASSWORD } from '@/api/mock/demo';
import { App } from '@/app/App';
import { queryClient } from '@/app/queryClient';

/** Signs in as someone else between renders. The app clears its cache on sign-in only while mounted. */
async function switchTo(email: string) {
  await api.auth.login(email, DEMO_PASSWORD);
  queryClient.clear();
}

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}
const leoPackage = () => {
  const leo = getDb().users.find((u) => u.email === 'creator@demo.test')!.id;
  return getDb().packages.filter((k) => k.creatorId === leo && k.active).sort((a, b) => a.priceCents - b.priceCents)[0];
};

async function fillBrief(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('What do you need?'), 'Show the linen tote in a morning routine, natural light please.');
}

/** Pays with a new card (the brand's saved UPI ID is preselected otherwise). */
async function useNewCard(user: ReturnType<typeof userEvent.setup>, card: string) {
  await user.click(screen.getByRole('radio', { name: /^Debit or credit card/ }));
  await user.click(await screen.findByRole('radio', { name: 'New card' }));
  await user.type(screen.getByLabelText('Card number'), card);
  await user.type(screen.getByLabelText('Expiry'), '12 / 39');
  await user.type(screen.getByLabelText('CVC'), '123');
}

beforeEach(async () => {
  await api.dev.reset();
});

describe('checkout (FR-30, FR-33, FR-60)', () => {
  it('a brand buys a package; the creator accepts and delivers; the brand approves and reviews', async () => {
    const user = userEvent.setup();
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    const pkg = leoPackage();
    const { unmount } = renderAt(`/checkout/${pkg.id}`);

    // Summary comes from the server quote: price + 10% fee.
    expect(await screen.findByRole('heading', { name: 'Book this package' })).toBeInTheDocument();
    const total = pkg.priceCents + Math.floor((pkg.priceCents * 1000 + 5000) / 10000);
    const totalText = formatMoney(total);
    expect(screen.getAllByText(totalText).length).toBeGreaterThan(0);

    // The saved UPI ID is preselected; paying authorises the total through Razorpay (mocked).
    await fillBrief(user);
    expect(await screen.findByRole('radio', { name: 'saltbay@okhdfcbank' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: `Pay ${totalText}` }));
    expect(await screen.findByText(/Order placed\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Waiting for Leo to accept' })).toBeInTheDocument();
    const orderId = window.location.pathname.split('/').pop()!;
    unmount();

    // Creator accepts and delivers.
    await switchTo('creator@demo.test');
    const second = renderAt(`/creator/orders/${orderId}`);
    await user.click(await screen.findByRole('button', { name: /Accept order/ }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Accept this order?' })).getByRole('button', { name: 'Accept order' }));
    expect(await screen.findByRole('heading', { name: 'In progress — deliver when ready' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Deliver work/ }));
    const deliver = await screen.findByRole('dialog', { name: 'Deliver your work' });
    await user.type(within(deliver).getByLabelText('Link to the live post'), 'https://example.com/p/123');
    await user.click(within(deliver).getByRole('button', { name: /Add link/ }));
    await user.click(within(deliver).getByRole('button', { name: /^Deliver$/ }));
    expect(await screen.findByRole('heading', { name: 'Delivered — waiting for the brand' })).toBeInTheDocument();
    second.unmount();

    // Brand approves and reviews.
    await switchTo('brand@demo.test');
    renderAt(`/brand/orders/${orderId}`);
    await user.click(await screen.findByRole('button', { name: /Approve and pay/ }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Approve and release payment?' })).getByRole('button', { name: 'Approve and pay' }));
    expect(await screen.findByRole('heading', { name: 'Completed' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '5 stars' }));
    await user.type(screen.getByLabelText('Comment (optional)'), 'Fantastic, on time.');
    await user.click(screen.getByRole('button', { name: 'Post review' }));
    expect(await screen.findByText('Fantastic, on time.')).toBeInTheDocument();
    expect(getDb().ledgerEntries.filter((e) => e.orderId === orderId && e.account === 'CREATOR_BALANCE')[0].debitCents).toBe(pkg.priceCents - Math.floor((pkg.priceCents * 1500 + 5000) / 10000));
  }, 60_000);

  it('shows a decline for the decline test card and creates no order', async () => {
    const user = userEvent.setup();
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    const before = getDb().orders.length;
    renderAt(`/checkout/${leoPackage().id}`);
    await fillBrief(user);
    await useNewCard(user, '4000 0000 0000 0002');
    await user.click(screen.getByRole('button', { name: /^Pay / }));
    expect(await screen.findByText('Your card was declined by the bank. Try another card or UPI.')).toBeInTheDocument();
    expect(getDb().orders.length).toBe(before);
  });

  it('a failed UPI payment creates no order; netbanking then works', async () => {
    const user = userEvent.setup();
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    const before = getDb().orders.length;
    renderAt(`/checkout/${leoPackage().id}`);
    await fillBrief(user);
    await user.click(await screen.findByRole('radio', { name: 'Another UPI ID' }));
    await user.type(screen.getByLabelText('UPI ID'), 'failure@razorpay');
    await user.click(screen.getByRole('button', { name: /^Pay / }));
    expect(await screen.findByText(/declined in the UPI app/)).toBeInTheDocument();
    expect(getDb().orders.length).toBe(before);
    await user.click(screen.getByRole('radio', { name: /^Netbanking/ }));
    await user.selectOptions(screen.getByLabelText('Your bank'), 'HDFC');
    await user.click(screen.getByRole('button', { name: /^Pay / }));
    expect(await screen.findByText(/Order placed\./)).toBeInTheDocument();
    expect(getDb().orders.at(-1)!.payment).toMatchObject({ method: 'NETBANKING', methodLabel: 'HDFC Bank netbanking', status: 'AUTHORIZED' });
  });

  it('validates the brief and payment details before calling the API', async () => {
    const user = userEvent.setup();
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    renderAt(`/checkout/${leoPackage().id}`);
    await user.click(await screen.findByRole('radio', { name: /^Debit or credit card/ }));
    await user.click(await screen.findByRole('radio', { name: 'New card' }));
    await user.click(screen.getByRole('button', { name: /^Pay / }));
    expect(await screen.findByText('Tell the creator what you need (at least 20 characters).')).toBeInTheDocument();
    expect(screen.getByText('Enter the 16-digit card number.')).toBeInTheDocument();
  });
});

describe('custom offer (FR-31)', () => {
  it('opens from the profile and quotes the price live', async () => {
    const user = userEvent.setup();
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    renderAt('/u/leomakes');
    await user.click(await screen.findByRole('button', { name: /Send custom offer/ }));
    expect(await screen.findByRole('heading', { name: 'Send Leo an offer' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Title'), 'Desk tour feature');
    await user.type(screen.getByLabelText('Deliverables'), '1 YouTube integration');
    await user.type(screen.getByLabelText('Price (₹)'), '10000');
    expect(await screen.findByRole('button', { name: /₹11,000\.00/ })).toBeInTheDocument();
    await fillBrief(user);
    await user.click(screen.getByRole('button', { name: /Send offer and pay/ }));
    expect(await screen.findByText(/Order placed\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Desk tour feature' })).toBeInTheDocument();
  }, 30_000);
});

describe('order lists and Simulate time (FR-32, FR-36)', () => {
  it('filters by status with counts', async () => {
    const user = userEvent.setup();
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    renderAt('/brand/orders');
    const delivered = await screen.findByRole('button', { name: /^Delivered/ });
    await user.click(delivered);
    await waitFor(() => expect(window.location.search).toBe('?status=delivered'));
    await waitFor(() => expect(screen.getAllByText('Delivered', { selector: '.badge' }).length).toBeGreaterThan(0));
    expect(screen.queryByText('Awaiting acceptance', { selector: '.badge' })).not.toBeInTheDocument();
  });

  it('expires a pending order when the demo clock moves 73 hours', async () => {
    const user = userEvent.setup();
    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    const pending = getDb().orders.find((o) => o.status === 'PENDING_ACCEPTANCE' && o.creatorUserId === getDb().users.find((u) => u.email === 'creator@demo.test')!.id)!;
    renderAt(`/creator/orders/${pending.id}`);
    expect(await screen.findByRole('heading', { name: 'New order — accept or decline' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Simulate time'), '73');
    expect(await screen.findByRole('heading', { name: 'Expired' })).toBeInTheDocument();
    expect(screen.getByText(/expired, \d+ auto-approved/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accept order/ })).not.toBeInTheDocument();
  });
});
