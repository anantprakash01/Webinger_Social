import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/api/client';
import { getDb } from '@/api/mock/db';
import { DEMO_PASSWORD } from '@/api/mock/demo';
import { APPROVED_SEED_CREATORS } from '@/api/mock/seed/creators';
import { App } from '@/app/App';

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}
const cards = () => screen.getAllByRole('article');

beforeEach(async () => {
  await api.dev.reset();
});

describe('search page', () => {
  it('shows 24 cards and the total count (FR-23)', async () => {
    renderAt('/search');
    // Text query on the h2: role queries over a page of 24 cards are too slow in jsdom under load.
    expect(await screen.findByText(`${APPROVED_SEED_CREATORS + 1} creators`, { selector: 'h2' })).toBeInTheDocument();
    expect(cards()).toHaveLength(24);
    expect(screen.getByRole('navigation', { name: 'Pages' })).toHaveTextContent('Page 1 of 3');
  });

  it('reads filters from the URL and shows them as removable chips', async () => {
    renderAt('/search?platform=youtube&niche=tech');
    const expected = (await api.creators.search({ platform: 'YOUTUBE', niche: 'TECH' })).totalElements;
    expect(await screen.findByText(new RegExp(`^${expected} creators?$`), { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /YouTube/ })).toHaveAttribute('aria-pressed', 'true');
    const user = userEvent.setup();
    await user.click(within(screen.getByRole('list', { name: 'Active filters' })).getByRole('button', { name: 'Remove filter Tech' }));
    await waitFor(() => expect(window.location.search).toBe('?platform=youtube'));
  });

  it('puts the keyword in the URL after typing stops (shareable links)', async () => {
    renderAt('/search');
    const user = userEvent.setup();
    await user.type(await screen.findByRole('searchbox', { name: 'Search creators' }), 'leomakes');
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('q')).toBe('leomakes'));
    expect(await screen.findByText('1 creator', { selector: 'h2' })).toBeInTheDocument();
    expect(within(cards()[0]).getByText('Leo Fernandes')).toBeInTheDocument();
  });

  it('changing a filter goes back to page 1', async () => {
    renderAt('/search?page=2');
    const user = userEvent.setup();
    await screen.findAllByRole('article');
    await user.selectOptions(screen.getAllByLabelText('Niche')[0], 'FOOD');
    await waitFor(() => expect(window.location.search).toBe('?niche=food'));
  });

  it('shows an empty state with a way out', async () => {
    renderAt('/search?q=zzzz-no-match');
    expect(await screen.findByText('No creators match')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await screen.findAllByRole('article')).toHaveLength(24);
  });
});

describe('creator profile', () => {
  it('works logged out and shows packages, portfolio and reviews (FR-15)', async () => {
    renderAt('/u/leomakes');
    expect(await screen.findByRole('heading', { level: 1, name: /Leo Fernandes/ })).toBeInTheDocument();
    const leoPackages = getDb().packages.filter((k) => k.creatorId === getDb().creatorProfiles.find((p) => p.username === 'leomakes')!.userId);
    expect(screen.getAllByRole('button', { name: /^Buy / })).toHaveLength(leoPackages.length);
    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument();
    expect(screen.getByText('7 reviews')).toBeInTheDocument();
  });

  it('asks a guest to log in as a brand, then continues to checkout', async () => {
    renderAt('/u/leomakes');
    const user = userEvent.setup();
    const [firstBuy] = await screen.findAllByRole('button', { name: /^Buy / });
    await user.click(firstBuy);
    expect(await screen.findByText('Log in with a brand account to buy this package.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'brand@demo.test');
    await user.type(screen.getByLabelText('Password'), DEMO_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Book this package' })).toBeInTheDocument();
    expect(window.location.pathname).toMatch(/^\/checkout\/[0-9A-Z]{26}$/);
  });

  it('does not let creators buy', async () => {
    await api.auth.login('creator@demo.test', DEMO_PASSWORD);
    renderAt('/u/leomakes');
    const buttons = await screen.findAllByRole('button', { name: /^Buy / });
    for (const b of buttons) expect(b).toBeDisabled();
    expect(screen.getByText(/Only brand accounts can buy packages./)).toBeInTheDocument();
  });

  it('shows not found for unknown or unapproved creators', async () => {
    const pending = getDb().creatorProfiles.find((p) => p.vettingStatus === 'PENDING_REVIEW')!;
    renderAt(`/u/${pending.username}`);
    expect(await screen.findByText('Creator not found')).toBeInTheDocument();
  });

  it('a search card links to the profile', async () => {
    renderAt('/search?q=leomakes');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: /Leo Fernandes/ }));
    expect(await screen.findByRole('heading', { level: 1, name: /Leo Fernandes/ })).toBeInTheDocument();
  });
});

describe('landing page', () => {
  it('shows featured creators and searches from the hero', async () => {
    renderAt('/');
    const featured = await screen.findByRole('region', { name: 'Featured creators' });
    await waitFor(() => expect(within(featured).getAllByRole('article')).toHaveLength(8));
    // Hero visual: three of the featured creators, each linking to its profile.
    const heroLinks = within(screen.getByRole('complementary', { name: 'Creators you can book' })).getAllByRole('link');
    expect(heroLinks).toHaveLength(3);
    for (const a of heroLinks) expect(a.getAttribute('href')).toMatch(/^\/u\/[a-z0-9]+$/);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox', { name: 'Search creators' }), 'fitness');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/search?q=fitness'));
  });
});
