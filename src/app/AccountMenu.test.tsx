import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/api/client';
import { getDb } from '@/api/mock/db';
import { DEMO_PASSWORD } from '@/api/mock/demo';
import { App } from '@/app/App';
import { queryClient } from '@/app/queryClient';

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

describe('account picture API (v2.1)', () => {
  it('creators change but never remove their photo; brands change or remove their logo', async () => {
    const leo = await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    expect(leo.avatarUrl).toBeTruthy();
    expect((await api.me.updateAvatar('/demo/photo-07.svg')).avatarUrl).toBe('/demo/photo-07.svg');
    expect((await api.creators.profile('leomakes')).photoUrl).toBe('/demo/photo-07.svg');
    await expect(api.me.updateAvatar(null)).rejects.toMatchObject({ status: 422 });

    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    expect((await api.me.updateAvatar('/demo/photo-03.svg')).avatarUrl).toBe('/demo/photo-03.svg');
    expect((await api.brands.getProfile()).logoUrl).toBe('/demo/photo-03.svg');
    expect((await api.me.updateAvatar(null)).avatarUrl).toBeNull();
  });
});

describe('account menu', () => {
  it('opens from the avatar, links to the right pages and changes the photo', async () => {
    const user = userEvent.setup();
    await login('creator@demo.test');
    renderAt('/creator/dashboard');
    const sidebar = await screen.findByRole('complementary', { name: 'Main navigation' });
    await user.click(within(sidebar).getByRole('button', { expanded: false, name: /Leo Marin/ }));
    const menu = sidebar.querySelector('.account__menu') as HTMLElement;
    expect(within(menu).getByText('creator@demo.test')).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: /View public profile/ })).toHaveAttribute('href', '/u/leomakes');
    expect(within(menu).getByRole('link', { name: /Payouts/ })).toHaveAttribute('href', '/creator/payouts');

    await user.click(within(menu).getByRole('button', { name: /^Change photo$/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Change your photo' });
    await user.click(within(dialog).getByRole('button', { name: 'Use a demo image' }));
    await user.click(await screen.findByRole('button', { name: 'Demo image 5' }));
    expect(await screen.findByText('Photo updated')).toBeInTheDocument();
    const leoId = getDb().users.find((u) => u.email === 'creator@demo.test')!.id;
    expect(getDb().creatorProfiles.find((p) => p.userId === leoId)!.photoUrl).toBe('/demo/photo-05.svg');
  });
});
