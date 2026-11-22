import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/api/client';
import { getDb } from '@/api/mock/db';
import { DEMO_PASSWORD } from '@/api/mock/demo';
import { App } from '@/app/App';
import { queryClient } from '@/app/queryClient';

async function signIn(email: string) {
  await api.auth.login(email, DEMO_PASSWORD);
  queryClient.clear();
}
function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}
const userId = (email: string) => getDb().users.find((u) => u.email === email)!.id;

beforeEach(async () => {
  await api.dev.reset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('admin console (Week 6)', () => {
  it('vetting queue: approving a creator removes them from the queue (FR-80)', async () => {
    const user = userEvent.setup();
    await signIn('admin@demo.test');
    renderAt('/admin/vetting');
    await screen.findByRole('heading', { name: 'Vetting queue' });
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(3));
    await user.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(2));
  });

  it('dispute console: a partial refund resolves the dispute (FR-81)', async () => {
    const user = userEvent.setup();
    await signIn('admin@demo.test');
    const d = getDb().disputes.find((x) => x.status === 'OPEN')!;
    renderAt(`/admin/disputes/${d.id}`);
    await screen.findByText('Chat between brand and creator');
    await user.click(screen.getByLabelText(/Partial refund/));
    await user.type(screen.getByLabelText('Refund amount (₹)'), '2000');
    await user.selectOptions(screen.getByLabelText('Reason (for the refund-reason log)'), 'QUALITY_BELOW_STANDARD');
    await user.type(screen.getByLabelText('Decision note'), 'Two of the three clips were usable.');
    await user.click(screen.getByRole('button', { name: 'Confirm decision' }));
    expect((await screen.findAllByText(/₹2,000\.00 refunded/)).length).toBeGreaterThan(0);
    expect(getDb().orders.find((o) => o.id === d.orderId)!.status).toBe('REFUNDED');
  });

  it('view as a brand is read-only and returns to the admin (FR-82)', async () => {
    const user = userEvent.setup();
    await signIn('admin@demo.test');
    renderAt('/admin/users?q=brand%40demo.test');
    await user.click(await screen.findByRole('button', { name: /^Manage / }));
    await user.click(await screen.findByRole('button', { name: /View as .* \(read-only\)/ }));
    expect(await screen.findByText(/Viewing as/)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/brand/dashboard');
    await user.click(screen.getByRole('button', { name: 'Stop viewing' }));
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(screen.queryByText(/Viewing as/)).not.toBeInTheDocument();
  });

  it('fees editor applies new rates to new orders only (FR-83)', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await signIn('admin@demo.test');
    renderAt('/admin/fees');
    const brandFee = await screen.findByLabelText('Free: brand fee (bps)');
    const form = within(brandFee.closest('form')!);
    await user.clear(brandFee);
    await user.type(brandFee, '800');
    expect(form.getByText(/brand pays/)).toHaveTextContent('₹10,944.00'); // ₹10,000 + 8% fee + 18% GST on the fee
    await user.click(form.getByRole('button', { name: 'Save fees' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Apply the new Free fees?' })).getByRole('button', { name: 'Apply fees' }));
    expect(await screen.findByText('Free fees updated for new orders')).toBeInTheDocument();
    expect(getDb().feeConfigs.at(-1)).toMatchObject({ plan: 'FREE', brandFeeBps: 800, creatorFeeBps: 1500 });
  });

  it('reports: a brand reports a profile and an admin dismisses it (FR-85)', async () => {
    const user = userEvent.setup();
    await signIn('brand@demo.test');
    const first = renderAt('/u/leomakes');
    await screen.findByText('Send custom offer');
    await user.click(screen.getByText('this profile').closest('button')!);
    const dialog = await screen.findByRole('dialog', { name: 'Report this profile' });
    await user.selectOptions(within(dialog).getByLabelText('What is wrong?'), 'SPAM');
    await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText(/we got your report/)).toBeInTheDocument();
    first.unmount();

    await signIn('admin@demo.test');
    renderAt('/admin/reports');
    const card = (await screen.findByText(/@leomakes/, { selector: 'a' })).closest('.card') as HTMLElement;
    await user.type(within(card).getByLabelText('Note'), 'Profile checked, looks fine.');
    await user.click(within(card).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(getDb().reports.find((r) => r.targetId === 'leomakes' && r.reporterId === userId('brand@demo.test'))!.status).toBe('DISMISSED'));
  });
});

describe('payouts and receipts (FR-63, FR-65)', () => {
  it('a creator sees their balance and earnings', async () => {
    await signIn('creator@demo.test');
    renderAt('/creator/payouts');
    expect(await screen.findByRole('heading', { name: 'Payouts' })).toBeInTheDocument();
    expect(screen.getByText('Available balance')).toBeInTheDocument();
    expect(screen.getByText('No payouts yet')).toBeInTheDocument();
    expect(screen.getAllByText(/^\+₹/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Withdraw now/ })).toBeEnabled();
  });

  it('a brand prints a receipt for a completed order', async () => {
    await signIn('brand@demo.test');
    const o = getDb().orders.find((x) => x.status === 'COMPLETED' && x.brandUserId === userId('brand@demo.test'))!;
    renderAt(`/brand/orders/${o.id}`);
    await userEvent.setup().click(await screen.findByRole('link', { name: /Receipt/ }));
    const receipt = await screen.findByRole('article', { name: 'Tax invoice' });
    // Saltbay is in Karnataka, like the platform: CGST + SGST on the service fee.
    expect(within(receipt).getByText('CGST 9%')).toBeInTheDocument();
    expect(within(receipt).getByText(/GSTIN 29AAACS1234B1Z9/)).toBeInTheDocument();
    expect(within(receipt).getByText(/Total paid/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print/ })).toBeInTheDocument();
  });
});
