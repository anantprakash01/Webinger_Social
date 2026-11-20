/**
 * Demo sign-in helpers for the prototype's login page and "View as" switcher.
 * Kept apart from the seed data so a real-API build does not need the mock tables.
 */
import type { Role } from '@/types';

export const DEMO_PASSWORD = 'demo1234';

export const demoAccounts: Array<{ role: Role; email: string; note: string }> = [
  { role: 'BRAND', email: 'brand@demo.test', note: 'Saltbay Supply Co.' },
  { role: 'BRAND', email: 'unverified@demo.test', note: 'Email not verified' },
  { role: 'CREATOR', email: 'creator@demo.test', note: 'Approved' },
  { role: 'CREATOR', email: 'newcreator@demo.test', note: 'Draft profile' },
  { role: 'ADMIN', email: 'admin@demo.test', note: 'Operations' },
];

/**
 * Invented Google identity used by the mock "Continue with Google" button.
 * The mock ID token is `mock-google:<sub>:<email>:<name>`; the backend verifies a real Google ID token.
 */
export const MOCK_GOOGLE_IDENTITY = { sub: 'g-100200300', email: 'jordan.reyes@gmail.demo.test', name: 'Jordan Reyes' };
export const mockGoogleIdToken = (g = MOCK_GOOGLE_IDENTITY) => `mock-google:${g.sub}:${g.email}:${g.name}`;
