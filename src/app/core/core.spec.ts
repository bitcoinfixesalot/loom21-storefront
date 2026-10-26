import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import bg from './i18n/bg.json';
import en from './i18n/en.json';
import { ApiError } from './api/api-error';
import { SERVER_API_HEADERS, apiInterceptor } from './api/api.interceptor';
import { CartStore } from './cart/cart.store';
import { clampQuantity, formatCountdown, formatPrice, priceDisplay, withVat } from './format';
import { I18n } from './i18n/i18n.service';
import { plainText } from './seo/seo.service';
import { TENANT, Tenant } from './tenant/tenant';
import { renderMarkdown } from '../shared/markdown.pipe';

const tenant = (id = 'shop-a', language: 'en' | 'bg' = 'en'): Tenant => ({
  id,
  publishableKey: 'l21_pk_live_x',
  apiBase: 'https://api.test/storefront/v1',
  language,
  baseUrl: 'https://shop.test',
});

describe('prices', () => {
  it("the store's Bitcoin settings decide fiat, sats or both", () => {
    expect(priceDisplay({ bitcoinOnly: true, hidePrices: false })).toBe('sats');
    expect(priceDisplay({ bitcoinOnly: false, hidePrices: true })).toBe('fiat');
    expect(priceDisplay({ bitcoinOnly: false, hidePrices: false })).toBe('both');
  });

  it('adds VAT when charged, and leaves sats out when there are none', () => {
    expect(withVat(10, { charged: true, rate: 20 })).toBe(12);
    expect(withVat(10, { charged: false, rate: 20 })).toBe(10);
    expect(formatPrice('both', 12, 'EUR', 12_000, 'en-GB')).toBe('€12.00 · 12,000 sats');
    expect(formatPrice('both', 12, 'EUR', null, 'en-GB')).toBe('€12.00');
    expect(formatPrice('sats', 12, 'EUR', 12_000, 'bg-BG')).toContain('сат.');
  });

  it('clamps quantities and counts down', () => {
    expect(clampQuantity('7', 5)).toBe(5);
    expect(clampQuantity(-2, 5)).toBe(1);
    expect(clampQuantity('x', 5)).toBe(1);
    expect(formatCountdown(65_000)).toBe('1:05');
    expect(formatCountdown(-1)).toBe('0:00');
  });
});

describe('texts', () => {
  it('English and Bulgarian have the same keys, none empty', () => {
    expect(Object.keys(bg).sort()).toEqual(Object.keys(en).sort());
    for (const [key, text] of Object.entries(bg)) expect(text, key).not.toBe('');
  });

  it("a failed call reads as the buyer's text, never the API's code or English detail", () => {
    TestBed.configureTestingModule({ providers: [{ provide: TENANT, useValue: tenant('a', 'bg') }] });
    const i18n = TestBed.inject(I18n);
    const stock = new HttpErrorResponse({
      status: 409,
      error: { code: 'insufficient_stock', detail: 'Not enough', lines: [{ productId: 1, requested: 3, available: 2 }] },
    });
    expect(i18n.error(stock)).toBe('Остават само 2. Обновихме количеството.');
    expect(i18n.error(new HttpErrorResponse({ status: 0 }))).toBe(bg['error.network']);
    expect(i18n.error(new HttpErrorResponse({ status: 418, error: { code: 'teapot', detail: 'English detail' } }))).toBe(
      bg['error.unknown'],
    );
    expect(ApiError.from(new HttpErrorResponse({ status: 404 })).code).toBe('not_found');
  });
});

describe('Markdown the merchant wrote', () => {
  it('becomes HTML, with raw HTML shown as text', () => {
    const html = renderMarkdown('# Hi\n\n**bold** <script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(html).toContain('<h1>Hi</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
  });

  it('is plain text in a meta description', () => {
    expect(plainText('# Title\n\n**Raw** [honey](https://x) <b>now</b>')).toBe('Title Raw honey now');
  });
});

describe('the cart', () => {
  beforeEach(() => localStorage.clear());

  function cartFor(id: string): CartStore {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: TENANT, useValue: tenant(id) }] });
    return TestBed.inject(CartStore);
  }

  it('keeps ids and quantities per store, capped at the line maximum', () => {
    const a = cartFor('shop-a');
    a.add(100, 2, 10);
    a.add(100, 9, 10);
    a.add(101, 1, 10);
    TestBed.tick();
    expect(a.items()).toEqual([
      { productId: 100, quantity: 10 },
      { productId: 101, quantity: 1 },
    ]);
    expect(a.count()).toBe(11);
    expect(JSON.parse(localStorage.getItem('l21:cart:shop-a')!)).toEqual(a.items());

    const b = cartFor('shop-b');
    expect(b.items()).toEqual([]); // two stores in one browser never mix
    expect(cartFor('shop-a').items().length).toBe(2); // and it survives a reload
  });

  it('ignores a damaged stored cart', () => {
    localStorage.setItem('l21:cart:shop-a', '[{"productId":"x","quantity":1},{"productId":5,"quantity":2}]');
    expect(cartFor('shop-a').items()).toEqual([{ productId: 5, quantity: 2 }]);
    localStorage.setItem('l21:cart:shop-a', 'not json');
    expect(cartFor('shop-a').items()).toEqual([]);
  });
});

describe('the API interceptor', () => {
  function headersOf(serverHeaders: Record<string, string> | null, url = 'https://api.test/storefront/v1/store') {
    TestBed.resetTestingModule();
    const providers: unknown[] = [{ provide: TENANT, useValue: tenant() }];
    if (serverHeaders) providers.push({ provide: SERVER_API_HEADERS, useValue: serverHeaders });
    TestBed.configureTestingModule({ providers: providers as never[] });
    let sent: HttpRequest<unknown> | null = null;
    TestBed.runInInjectionContext(() =>
      apiInterceptor(new HttpRequest('GET', url), req => {
        sent = req;
        return of(new HttpResponse());
      }).subscribe(),
    );
    return sent!.headers;
  }

  it("sends the key; only the server adds the secret and the shopper's IP", () => {
    const browser = headersOf(null);
    expect(browser.get('Loom21-Publishable-Key')).toBe('l21_pk_live_x');
    expect(browser.has('Loom21-Server-Secret')).toBe(false);

    const server = headersOf({ 'Loom21-Server-Secret': 'l21_ss_s', 'Loom21-Client-IP': '203.0.113.7' });
    expect(server.get('Loom21-Server-Secret')).toBe('l21_ss_s');
    expect(server.get('Loom21-Client-IP')).toBe('203.0.113.7');
  });

  it('adds nothing to calls that are not the Storefront API', () => {
    expect(headersOf({ 'Loom21-Server-Secret': 'l21_ss_s' }, 'https://elsewhere.test/x').has('Loom21-Publishable-Key')).toBe(false);
  });
});
