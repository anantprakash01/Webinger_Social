import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/api/client';
import { getDb } from '@/api/mock/db';
import { DEMO_PASSWORD } from '@/api/mock/demo';
import { App } from '@/app/App';
import { queryClient } from '@/app/queryClient';

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}
async function switchTo(email: string) {
  await api.auth.login(email, DEMO_PASSWORD);
  queryClient.clear();
}
const leoId = () => getDb().users.find((u) => u.email === 'creator@demo.test')!.id;

beforeEach(async () => {
  await api.dev.reset();
});

describe('campaigns (FR-40 – FR-42)', () => {
  it('a brand posts a campaign, a creator applies, the brand hires and pays', async () => {
    const user = userEvent.setup();
    await switchTo('brand@demo.test');
    const first = renderAt('/brand/campaigns');
    await user.click(await screen.findByRole('button', { name: /New campaign/ }));
    const form = await screen.findByRole('dialog', { name: 'New campaign' });
    await user.type(within(form).getByLabelText('Title'), 'Winter cosy edit');
    await user.type(within(form).getByLabelText('Brief'), 'Show our wool throw in a cosy evening setting with warm light.');
    await user.click(within(form).getByRole('checkbox', { name: 'Home & decor' }));
    await user.type(within(form).getByLabelText('Deliverables'), '1 Reel');
    await user.type(within(form).getByLabelText('Budget per creator (USD)'), '250');
    await user.click(within(form).getByRole('button', { name: 'Post campaign' }));
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/brand\/campaigns\/[0-9A-Z]{26}$/));
    expect(await screen.findByRole('heading', { level: 1, name: 'Winter cosy edit' })).toBeInTheDocument();
    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
    const campaignId = window.location.pathname.split('/').pop()!;
    first.unmount();

    // Leo applies.
    await switchTo('creator@demo.test');
    const second = renderAt(`/creator/campaigns/${campaignId}`);
    await user.type(await screen.findByLabelText('Your pitch'), 'I film cosy evening routines every week; this throw would fit perfectly.');
    await user.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByText('Applied — waiting')).toBeInTheDocument();
    second.unmount();

    // The brand accepts and pays (same checkout flow, FR-42).
    await switchTo('brand@demo.test');
    renderAt(`/brand/campaigns/${campaignId}`);
    await user.click(await screen.findByRole('button', { name: 'Accept and pay' }));
    expect(await screen.findByRole('heading', { name: 'Hire Leo' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Card number'), '4242 4242 4242 4242');
    await user.type(screen.getByLabelText('Expiry'), '12 / 39');
    await user.type(screen.getByLabelText('CVC'), '123');
    await user.click(screen.getByRole('button', { name: /Accept and authorise \$275\.00/ }));
    expect(await screen.findByText(/Order placed\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Winter cosy edit' })).toBeInTheDocument();
    const order = getDb().orders.find((o) => o.campaignId === campaignId)!;
    expect(order).toMatchObject({ creatorUserId: leoId(), priceCents: 25_000, status: 'PENDING_ACCEPTANCE' });
  }, 60_000);

  it('creators see open campaigns from every brand and their own applications', async () => {
    const user = userEvent.setup();
    await switchTo('creator@demo.test');
    renderAt('/creator/campaigns');
    expect(await screen.findByText('Home workout corner')).toBeInTheDocument();
    expect(screen.getByText('Orbitfit Gear')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'My applications' }));
    expect(await screen.findByText('Not selected')).toBeInTheDocument();
  });
});

describe('chat (FR-50, FR-51)', () => {
  it('opens the order thread, masks contact details and shows the notice', async () => {
    const user = userEvent.setup();
    await switchTo('brand@demo.test');
    const inProgress = getDb().orders.find((o) => o.status === 'IN_PROGRESS' && o.creatorUserId === leoId())!;
    renderAt(`/brand/orders/${inProgress.id}`);
    await user.click(await screen.findByRole('link', { name: 'Message' }));
    expect(await screen.findByText(/Email addresses and phone numbers are hidden/)).toBeInTheDocument();
    // Seeded message from Leo; messages load after the conversation list, so wait for them.
    expect((await screen.findAllByText(/\[phone hidden\]/)).length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText(/^Message /), 'Reach me at maya@saltbay.example.com{enter}');
    expect(await screen.findByText('Reach me at [email hidden]')).toBeInTheDocument();
  });

  it('delivers a new message from the other side live, through the realtime feed', async () => {
    await switchTo('creator@demo.test');
    const order = getDb().orders.find((o) => o.status === 'IN_PROGRESS' && o.creatorUserId === leoId())!;
    const conv = getDb().conversations.find((c) => c.orderId === order.id)!;
    renderAt(`/messages/${conv.id}`);
    await screen.findByText(/Email addresses and phone numbers are hidden/);
    // Brand sends a message "from another device": straight into the mock.
    getDb().messages.push({ id: '01ZZZZZZZZZZZZZZZZZZZZZZZZ', conversationId: conv.id, senderUserId: order.brandUserId, body: 'Live hello from Saltbay', masked: false, createdAt: new Date(Date.now() + 1000).toISOString(), readAt: null });
    expect(await screen.findByText('Live hello from Saltbay', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe('notifications (FR-52) and brand dashboard (FR-71)', () => {
  it('the bell shows unread, the inbox opens the order and marks it read', async () => {
    const user = userEvent.setup();
    await switchTo('brand@demo.test');
    renderAt('/notifications');
    const bell = await screen.findAllByRole('link', { name: /Notifications, \d+ unread/ });
    const before = Number(/(\d+) unread/.exec(bell[0].getAttribute('aria-label')!)![1]);
    const unread = (await screen.findAllByText(/^Unread:/, { selector: '.sr-only' }))[0].closest('button')!;
    await user.click(unread);
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/brand\/orders\//));
    await waitFor(() => {
      const label = screen.getAllByRole('link', { name: /^Notifications/ })[0].getAttribute('aria-label')!;
      expect(label === 'Notifications' ? 0 : Number(/(\d+) unread/.exec(label)![1])).toBe(before - 1);
    });
  });

  it('marks everything read', async () => {
    const user = userEvent.setup();
    await switchTo('creator@demo.test');
    renderAt('/notifications');
    await user.click(await screen.findByRole('button', { name: /Mark all as read/ }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Mark all as read/ })).not.toBeInTheDocument());
  });

  it('the brand dashboard shows spend, orders by status and delivered posts', async () => {
    await switchTo('brand@demo.test');
    renderAt('/brand/dashboard');
    expect(await screen.findByText('Spent')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delivered posts' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /opens in a new tab/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /4 applications to review/ })).toBeInTheDocument();
  });
});
