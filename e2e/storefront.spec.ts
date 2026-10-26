import { APIRequestContext, Page, expect, test } from '@playwright/test';

const MOCK = 'http://localhost:5179';
const BG = 'http://localhost:4101';

interface Logged {
  method: string;
  path: string;
  key: string | null;
  secret: string | null;
  clientIp: string | null;
  origin: string | null;
}

async function mock(request: APIRequestContext, path: string, data?: object): Promise<void> {
  await request.post(MOCK + path, { data: data ?? {} });
}

async function log(request: APIRequestContext): Promise<Logged[]> {
  return (await request.get(`${MOCK}/__test/log`)).json();
}

async function addToCart(page: Page, slug: string, quantity = 1): Promise<void> {
  await page.goto(`/p/${slug}`);
  await page.waitForLoadState('networkidle');
  for (let i = 1; i < quantity; i++) await page.getByRole('button', { name: 'More' }).click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByText('Added to your cart')).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await mock(request, '/__test/reset');
});

test.describe('server rendering', () => {
  test('a product page has its name, price, canonical URL and JSON-LD before any script runs', async ({ request }) => {
    const response = await request.get('/p/raw-honey');
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('<title>Raw Honey 500g | Bee shop</title>');
    expect(html).toContain('<link rel="canonical" href="http://localhost:4100/p/raw-honey">');
    expect(html).toContain('€12.00'); // 10 before VAT + 20%
    expect(html).toMatch(/<script type="application\/ld\+json"[^>]*>.*"@type":"Product".*"price":"12.00"/);
    expect(html).toContain('"@type":"BreadcrumbList"');
    // The description's <script> is shown as text, never run.
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  test('the server secret never reaches the browser, in the pages or the scripts', async ({ request }) => {
    for (const path of ['/', '/p/raw-honey', '/cart', '/checkout']) {
      const html = await (await request.get(path)).text();
      expect(html, path).not.toContain('l21_ss_');
      for (const src of html.match(/src="[^"]+\.js"/g) ?? []) {
        const js = await (await request.get(src.slice(5, -1))).text();
        expect(js, src).not.toContain('l21_ss_test');
      }
    }
  });

  test("server-side API calls carry the secret and the shopper's IP; browser calls never do", async ({ page, request }) => {
    await page.goto('/cart');
    await page.waitForLoadState('networkidle');
    await page.goto('/p/raw-honey');
    await page.waitForLoadState('networkidle');
    const calls = await log(request);
    const fromServer = calls.filter(c => !c.origin);
    const fromBrowser = calls.filter(c => c.origin);
    expect(fromServer.length).toBeGreaterThan(0);
    expect(fromServer.every(c => c.secret === 'l21_ss_test')).toBe(true);
    expect(fromServer.some(c => c.clientIp)).toBe(true);
    expect(fromBrowser.length).toBeGreaterThan(0); // the client-rendered cart loads the store itself
    expect(fromBrowser.every(c => c.secret === null && c.clientIp === null && c.key === 'l21_pk_live_test')).toBe(true);
  });

  test("hydration repeats none of the server's API calls", async ({ page, request }) => {
    await page.goto('/p/raw-honey');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('add-to-cart')).toBeEnabled();
    const browserGets = (await log(request)).filter(c => c.origin && c.method === 'GET');
    expect(browserGets).toEqual([]);
  });

  test('an unknown product is a 404 page with a 404 status', async ({ page }) => {
    const response = await page.goto('/p/no-such-thing');
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('not-found')).toBeVisible();
    expect((await page.request.get('/nowhere/at/all')).status()).toBe(404);
  });

  test('a disabled store answers 503 with a neutral page', async ({ request }) => {
    await mock(request, '/__test/config', { storeDisabled: true });
    const response = await request.get('/');
    expect(response.status()).toBe(503);
    expect(await response.text()).toContain("isn't taking orders");
  });

  test("robots.txt and sitemap.xml are the store's", async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /checkout');
    expect(robots).toContain('Sitemap: http://localhost:4100/sitemap.xml');
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('<loc>http://localhost:4100/p/raw-honey</loc>');
    expect(sitemap).toContain('<loc>http://localhost:4100/c/honey</loc>');
    expect(sitemap).toContain('<loc>http://localhost:4100/pages/terms</loc>');
  });

  test('cart, checkout and search are never indexed', async ({ request }) => {
    const search = await (await request.get('/search?q=honey')).text();
    expect(search).toContain('<meta name="robots" content="noindex">');
  });

  test('a page is served from the 30-second cache the second time', async ({ request }) => {
    await request.get(`${BG}/c/honey`);
    const second = await request.get(`${BG}/c/honey`);
    expect(second.headers()['x-cache']).toBe('HIT');
    expect((await request.get(`${BG}/search?q=x`)).headers()['x-cache']).toBeUndefined();
  });
});

test.describe('catalog', () => {
  test('a category sorts and pages; a store page renders its Markdown safely', async ({ page }) => {
    await page.goto('/c/honey');
    await expect(page.getByRole('heading', { level: 1, name: 'Honey' })).toBeVisible();
    await page.getByTestId('sort').selectOption('price_desc');
    await expect(page).toHaveURL(/sort=price_desc/);
    await expect(page.locator('.card__name').first()).toHaveText('Chestnut Honey (sold out)');

    await page.goto('/pages/terms');
    await expect(page.getByTestId('page-body').locator('strong')).toHaveText('14 days');
    await expect(page.getByTestId('page-body').locator('a')).not.toHaveAttribute('href', /^javascript:/);
  });

  test('a Bitcoin-only store shows sats; hidden Bitcoin prices show fiat only', async ({ page, request }) => {
    await mock(request, '/__test/config', { bitcoinOnly: true });
    await page.goto('/p/raw-honey');
    await expect(page.locator('.buy__price .price')).toHaveText(/sats$/);
    await mock(request, '/__test/config', { bitcoinOnly: false, hidePrices: true });
    await page.goto('/p/raw-honey');
    await expect(page.locator('.buy__price .price')).toHaveText('€12.00');
  });

  test('when the store takes no orders, Add to cart is disabled with a neutral message', async ({ page, request }) => {
    await mock(request, '/__test/config', { checkoutAvailable: false });
    await page.goto('/p/raw-honey');
    await expect(page.getByTestId('checkout-unavailable')).toHaveText('Ordering is temporarily unavailable.');
    await expect(page.getByTestId('add-to-cart')).toBeDisabled();
  });

  test('a Bulgarian store is in Bulgarian', async ({ page }) => {
    await page.goto(`${BG}/p/raw-honey`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'bg');
    await expect(page.getByTestId('add-to-cart')).toHaveText('Добави в количката');
    await expect(page.locator('.crumbs').getByRole('link', { name: 'Начало' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bee shop' })).toBeVisible(); // the logo link is named after the store
  });
});

test.describe('cart and checkout', () => {
  test('the cart survives a reload and is priced by the server', async ({ page }) => {
    await addToCart(page, 'raw-honey', 3);
    await page.goto('/cart');
    await expect(page.getByTestId('cart-lines')).toContainText('Raw Honey 500g');
    // 3 jars at the 3-jar tier (8.00) + 20% VAT
    await expect(page.getByTestId('cart-total')).toContainText('€28.80');
    await page.reload();
    await expect(page.getByTestId('cart-total')).toContainText('€28.80');
    await expect(page.getByTestId('cart-count')).toHaveText('3');
  });

  test('cart → checkout → Lightning → paid: the order number shows and the cart is empty', async ({ page, request }) => {
    await addToCart(page, 'raw-honey');
    await page.goto('/checkout');
    await page.getByTestId('email').fill('maria@example.com');
    await page.getByTestId('shipping-1').check();
    await page.getByTestId('method-lightning').check();
    await page.getByTestId('pay').click();

    await expect(page).toHaveURL(/\/checkout\/pay$/);
    await expect(page.getByTestId('lightning').locator('svg')).toBeVisible();
    await expect(page.getByTestId('open-wallet')).toHaveAttribute('href', /^lightning:lnbc/);

    await mock(request, '/__test/pay');
    await expect(page).toHaveURL(/\/checkout\/complete$/, { timeout: 10_000 });
    await expect(page.getByTestId('order-number')).toContainText('0000000042');
    await expect(page.getByText('m***@example.com')).toBeVisible();
    await page.goto('/cart');
    await expect(page.getByTestId('cart-empty')).toBeVisible();

    const created = (await log(request)).filter(c => c.method === 'POST' && c.path === '/checkouts');
    expect(created.length).toBe(1);
  });

  test('a delivery that needs an address asks for one', async ({ page }) => {
    await addToCart(page, 'raw-honey');
    await page.goto('/checkout');
    await page.getByTestId('email').fill('maria@example.com');
    await page.getByTestId('shipping-2').check();
    await expect(page.getByTestId('address')).toBeVisible();
    await page.getByTestId('pay').click();
    await expect(page.getByTestId('checkout-error')).toContainText('check the highlighted fields');
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test('not enough stock at checkout: the quantity is corrected with a message', async ({ page, request }) => {
    await addToCart(page, 'raw-honey', 3);
    await page.goto('/checkout');
    await page.getByTestId('email').fill('maria@example.com');
    await page.getByTestId('shipping-1').check();
    await mock(request, '/__test/config', { stock: { 100: 2 } });
    await page.getByTestId('pay').click();
    await expect(page.getByTestId('checkout-error')).toHaveText("Only 2 left. We've updated your quantity.");
    await page.goto('/cart');
    await expect(page.getByTestId('cart-count')).toHaveText('2');
  });

  test('on-chain shows the address QR; paying another way and cancelling work', async ({ page }) => {
    await addToCart(page, 'beeswax-candle');
    await page.goto('/checkout');
    await page.getByTestId('email').fill('maria@example.com');
    await page.getByTestId('shipping-1').check();
    await page.getByTestId('method-onchain').check();
    await page.getByTestId('pay').click();
    await expect(page.getByTestId('onchain').locator('svg')).toBeVisible();

    await page.reload(); // resumes from the session
    await expect(page.getByTestId('onchain')).toBeVisible();

    await page.getByTestId('other-way').click();
    await page.getByTestId('pay-lightning').click();
    await expect(page.getByTestId('lightning')).toBeVisible();

    await page.getByTestId('cancel').click();
    await page.getByTestId('cancel-yes').click();
    await expect(page.getByTestId('pay-ended')).toContainText('Order cancelled');
  });
});
