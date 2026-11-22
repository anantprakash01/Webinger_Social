/**
 * End-to-end tests (CLAUDE.md §13). Runs the prototype in mock mode in the installed Microsoft
 * Edge, so no browser download is needed. `npm run test:e2e` starts its own dev server.
 */
import { defineConfig } from '@playwright/test';

const PORT = 5199;

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'msedge',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_API_MODE: 'mock', VITE_MOCK_DELAY_MS: '100', VITE_REALTIME_POLL_MS: '3000' },
  },
});
