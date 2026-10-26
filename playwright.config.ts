import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the built store (npm run build first) and the mock Storefront API (e2e/mock-api.mjs).
 * Three store servers: English on 4100 (no page cache, so tests that change the shop see it at once), Bulgarian on
 * 4101 (with the 30-second page cache), and hosted mode on 4102, which serves whichever store a *.localhost host is.
 */
const api = 'http://localhost:5179/storefront/v1';
const store = (port: number, key: string, cacheSeconds: number) => ({
  command: 'node dist/loom21-storefront/server/server.mjs',
  url: `http://localhost:${port}/healthz`,
  reuseExistingServer: !process.env['CI'],
  timeout: 60_000,
  env: {
    LOOM21_API_BASE: api,
    LOOM21_PUBLISHABLE_KEY: key,
    LOOM21_SERVER_SECRET: 'l21_ss_test',
    PUBLIC_BASE_URL: `http://localhost:${port}`,
    HTML_CACHE_SECONDS: String(cacheSeconds),
    PORT: String(port),
  },
});

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node e2e/mock-api.mjs', url: 'http://localhost:5179/__test/log', reuseExistingServer: !process.env['CI'], timeout: 30_000 },
    store(4100, 'l21_pk_live_test', 0),
    store(4101, 'l21_pk_live_bg', 30),
    {
      command: 'node dist/loom21-storefront/server/server.mjs',
      url: 'http://localhost:4102/healthz',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: {
        STOREFRONT_MODE: 'hosted',
        LOOM21_API_BASE: api,
        LOOM21_HOST_SECRET: 'host-secret-test',
        LOOM21_INTERNAL_API_BASE: 'http://localhost:5179',
        HTML_CACHE_SECONDS: '0',
        PORT: '4102',
      },
    },
  ],
});
