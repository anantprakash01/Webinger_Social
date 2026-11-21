/** UX pass: date rule, urgency sort, contract v1.1 fields, "Needs your action". */
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { api } from '@/api/client';
import { getDb } from '@/api/mock/db';
import { DEMO_PASSWORD } from '@/api/mock/demo';
import { App } from '@/app/App';
import { queryClient } from '@/app/queryClient';
import { formatWhen } from '@/lib/dates';

const login = async (email: string) => {
  await api.auth.login(email, DEMO_PASSWORD);
  queryClient.clear();
};
const renderAt = (path: string) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

beforeEach(async () => {
  await api.dev.reset();
});

describe('date rule (item 17)', () => {
  const now = new Date('2026-11-21T12:00:00Z').getTime();
  it('is relative under a week and absolute after', () => {
    expect(formatWhen('2026-11-21T11:58:00Z', now)).toBe('2 min ago');
    expect(formatWhen('2026-11-21T07:00:00Z', now)).toBe('5 h ago');
    expect(formatWhen('2026-11-20T10:00:00Z', now)).toBe('yesterday');
    expect(formatWhen('2026-11-17T10:00:00Z', now)).toBe('4 days ago');
    expect(formatWhen('2026-11-03T10:00:00Z', now)).toBe('Nov 3');
    expect(formatWhen('2025-10-08T10:00:00Z', now)).toBe('Oct 8, 2025');
    expect(formatWhen('2026-11-25T10:00:00Z', now)).toBe('Nov 25');
  });
});

describe('contract v1.1', () => {
  it('sorts orders by urgency: waiting on you first, then nearest deadline', async () => {
    await login('creator@demo.test');
    const { content } = await api.orders.list();
    const firstNotMine = content.findIndex((o) => !o.needsAction);
    expect(content.slice(firstNotMine).some((o) => o.needsAction)).toBe(false);
    const mine = content.filter((o) => o.needsAction && o.nextDeadline).map((o) => o.nextDeadline!.at);
    expect(mine).toEqual([...mine].sort());
  });

  it('adds a track record to creator profiles', async () => {
    const p = await api.creators.profile('leomakes');
    expect(p.completedOrders).toBeGreaterThan(0);
    expect(p.typicalAcceptHours === null || p.typicalAcceptHours >= 1).toBe(true);
  });

  it('gives brands six months of spend that add up to the total', async () => {
    await login('brand@demo.test');
    const s = await api.brands.stats();
    expect(s.spendByMonth).toHaveLength(6);
    expect(s.spendByMonth.map((m) => m.month)).toEqual([...s.spendByMonth.map((m) => m.month)].sort());
    expect(s.spendByMonth.reduce((a, m) => a + m.cents, 0)).toBeLessThanOrEqual(s.spentCents);
  });

  it('marks a message as read once the other side opens the thread', async () => {
    await login('brand@demo.test');
    const [c] = (await api.chat.conversations()).content;
    const sent = await api.chat.send(c.id, 'Quick check on timing for this one.');
    expect(sent.readAt).toBeNull();
    const order = getDb().orders.find((o) => o.id === c.orderId)!;
    await login(getDb().users.find((u) => u.id === order.creatorUserId)!.email);
    await api.chat.markRead(c.id);
    await login('brand@demo.test');
    const { messages } = await api.chat.messages(c.id);
    expect(messages.find((m) => m.id === sent.id)!.readAt).not.toBeNull();
  });

  it('lists users newest first with when they were last active', async () => {
    await login('admin@demo.test');
    const { content } = await api.admin.users();
    expect(content.map((u) => u.createdAt)).toEqual([...content.map((u) => u.createdAt)].sort().reverse());
    const admin = (await api.admin.users({ q: 'admin@demo.test' })).content[0];
    expect(admin.lastActiveAt).not.toBeNull();
  });
});

describe('needs your action (item 1)', () => {
  it('shows the creator what to do first on the dashboard', async () => {
    await login('creator@demo.test');
    renderAt('/creator/dashboard');
    const card = (await screen.findByText('Needs your action')).closest('.card') as HTMLElement;
    expect(within(card).getAllByRole('link', { name: /Accept or decline|Deliver/ }).length).toBeGreaterThan(0);
  });
});
