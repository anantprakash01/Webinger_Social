import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/api/client';
import { DEMO_PASSWORD } from '@/api/mock/demo';
import { App } from './App';

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

async function logInWithForm(email: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), DEMO_PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
  return user;
}

beforeEach(async () => {
  await api.dev.reset();
});

describe('role routing and guards', () => {
  it('sends guests to /login and back to the page they wanted after sign-in', async () => {
    renderAt('/brand/orders');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    await logInWithForm('brand@demo.test');
    expect(await screen.findByRole('heading', { name: 'Orders' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/brand/orders');
  });

  it('lands each role on its own home', async () => {
    renderAt('/login');
    await logInWithForm('creator@demo.test');
    expect(await screen.findByRole('heading', { name: 'Hi, Leo' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/creator/dashboard');
  });

  it('sends a draft creator to onboarding', async () => {
    renderAt('/login');
    await logInWithForm('newcreator@demo.test');
    expect(await screen.findByRole('heading', { name: 'Set up your creator profile' })).toBeInTheDocument();
  });

  it('keeps a brand out of the admin area', async () => {
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    renderAt('/admin/vetting');
    expect(await screen.findByRole('heading', { name: 'Hi, Maya' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/brand/dashboard');
  });

  it('shows the admin console to admins', async () => {
    await api.auth.login('admin@demo.test', DEMO_PASSWORD);
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: 'Vetting queue' })).toBeInTheDocument();
  });
});

describe('email verification (FR-02)', () => {
  it('blocks checkout for an unverified brand and shows the banner', async () => {
    await api.auth.login('unverified@demo.test', DEMO_PASSWORD);
    renderAt('/checkout/PKG1');
    expect(await screen.findByRole('heading', { name: 'Verify your email to place orders' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Confirm your email');
  });

  it('lets a verified brand reach checkout', async () => {
    await api.auth.login('brand@demo.test', DEMO_PASSWORD);
    renderAt('/checkout/PKG1');
    expect(await screen.findByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
  });

  it('signs up a brand, then verifies through the demo inbox link', async () => {
    renderAt('/signup');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /I'm a brand/ }));
    await user.type(screen.getByLabelText('Your full name'), 'Rina Patel');
    await user.type(screen.getByLabelText('Work email'), 'rina@example.test');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    await user.click(await screen.findByRole('link', { name: 'Open the link from this email' }));
    expect(await screen.findByRole('heading', { name: 'Email confirmed' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Continue' }));
    await waitFor(() => expect(window.location.pathname).toBe('/brand/dashboard'));
    expect(screen.queryByText(/Confirm your email/)).not.toBeInTheDocument();
  });

  it('shows field errors from the schema without calling the API', async () => {
    renderAt('/signup');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Choose whether you are a brand or a creator.')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Accept the terms to create an account.')).toBeInTheDocument();
  });
});
