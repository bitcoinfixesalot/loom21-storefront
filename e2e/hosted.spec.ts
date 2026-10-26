import { APIRequestContext, expect, test } from '@playwright/test';

// Hosted mode (STOREFRONT_MODE=hosted on port 4102): one server, the store chosen by the request's host. Browsers
// resolve *.localhost to this machine, so each host is a different store of the mock API.
const MOCK = 'http://localhost:5179';
const at = (host: string, path = '/') => `http://${host}.localhost:4102${path}`;

interface Logged {
  method: string;
  path: string;
  key: string | null;
  secret: string | null;
  clientIp: string | null;
  origin: string | null;
}

async function log(request: APIRequestContext): Promise<Logged[]> {
  return (await request.get(`${MOCK}/__test/log`)).json();
}

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__test/reset`, { data: {} });
});

test('each host is its own store, in its own language', async ({ page }) => {
  await page.goto(at('bees', '/p/raw-honey'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('add-to-cart')).toHaveText('Add to cart');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://bees.localhost/p/raw-honey');

  await page.goto(at('pchelin', '/p/raw-honey'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'bg');
  await expect(page.getByTestId('add-to-cart')).toHaveText('Добави в количката');
});

test('an unknown host and a turned-off store get the unavailable page with 404', async ({ page }) => {
  for (const host of ['nobody', 'closed']) {
    const response = await page.goto(at(host));
    expect(response?.status(), host).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("This store isn't available");
  }
});

test('the host lookup and server-side API calls carry the host secret; the page never does', async ({ page, request }) => {
  const response = await page.goto(at('fresh', '/'));
  const html = (await response?.text()) ?? '';
  expect(html).not.toContain('host-secret');

  const calls = await log(request);
  const lookups = calls.filter(c => c.path.startsWith('/internal/storefront-hosts/'));
  expect(lookups.map(c => c.path)).toContain('/internal/storefront-hosts/fresh.localhost');
  expect(lookups.every(c => c.secret === 'host-secret-test')).toBe(true);
  const serverApiCalls = calls.filter(c => !c.origin && !c.path.startsWith('/internal/'));
  expect(serverApiCalls.length).toBeGreaterThan(0);
  expect(serverApiCalls.every(c => c.secret === 'host-secret-test' && c.clientIp)).toBe(true);
});

test("two hosted stores don't share a cart", async ({ page }) => {
  await page.goto(at('bees', '/p/raw-honey'));
  await page.waitForLoadState('networkidle');
  await page.getByTestId('add-to-cart').click();
  await page.goto(at('bees', '/cart'));
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  // Another host is another origin and another store id: its own (empty) cart.
  await page.goto(at('pchelin', '/cart'));
  await expect(page.getByTestId('cart-empty')).toBeVisible();
});

test('robots.txt and the sitemap name the host they were asked on', async ({ page }) => {
  await page.goto(at('bees', '/robots.txt'));
  await expect(page.locator('body')).toContainText('Sitemap: https://bees.localhost/sitemap.xml');
  await page.goto(at('pchelin', '/sitemap.xml'));
  expect(await page.content()).toContain('https://pchelin.localhost/p/raw-honey');
});
