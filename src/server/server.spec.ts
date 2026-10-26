import { EnvError, readEnv } from './env';
import { HtmlCache, isCacheable } from './html-cache';
import { robotsTxt, sitemapXml } from './sitemap';
import { withTenant } from './tenant-tag';
import { HostedTenantResolver, SingleTenantResolver, tenantId } from './tenant-resolver';
import type { Tenant } from '../app/core/tenant/tenant';

const single = {
  LOOM21_PUBLISHABLE_KEY: 'l21_pk_live_abc',
  PUBLIC_BASE_URL: 'https://shop.example.com/',
  LOOM21_API_BASE: 'https://app.loom21.com/storefront/v1/',
};

describe('readEnv', () => {
  it('reads single mode, trimming slashes', () => {
    const env = readEnv({ ...single, LOOM21_SERVER_SECRET: 'l21_ss_x', TRUST_PROXY: 'true', HTML_CACHE_SECONDS: '0' });
    expect(env.mode).toBe('single');
    expect(env.apiBase).toBe('https://app.loom21.com/storefront/v1');
    expect(env.publicBaseUrl).toBe('https://shop.example.com');
    expect(env.serverSecret).toBe('l21_ss_x');
    expect(env.trustProxy).toBe(true);
    expect(env.htmlCacheSeconds).toBe(0);
  });

  it('trusts proxies by hop count, or all of them, or none', () => {
    expect(readEnv({ ...single, TRUST_PROXY: '2' }).trustProxy).toBe(2);
    expect(readEnv({ ...single, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(readEnv({ ...single, TRUST_PROXY: '0' }).trustProxy).toBe(false);
    expect(readEnv({ ...single }).trustProxy).toBe(false);
  });

  it('refuses a single mode without a key or base URL, and a secret that is not one', () => {
    expect(() => readEnv({ PUBLIC_BASE_URL: 'https://x.example' })).toThrow(EnvError);
    expect(() => readEnv({ LOOM21_PUBLISHABLE_KEY: 'l21_pk_live_abc' })).toThrow(/PUBLIC_BASE_URL/);
    expect(() => readEnv({ ...single, LOOM21_SERVER_SECRET: 'l21_pk_live_oops' })).toThrow(/l21_ss_/);
    expect(() => readEnv({ ...single, STOREFRONT_MODE: 'multi' })).toThrow(/single or hosted/);
  });
});

describe('the tenant written into pages', () => {
  const tenant = {
    id: 'abc',
    publishableKey: 'l21_pk_live_abc',
    apiBase: 'https://api',
    language: 'bg' as const,
    baseUrl: 'https://shop',
    serverSecret: 'l21_ss_NEVER', // an extra field must never reach the page
  } as Tenant;

  it('has the public fields only, never a secret, and sets the page language', () => {
    const html = withTenant('<!doctype html><html lang="en"><head><title>x</title></head><body></body></html>', tenant);
    expect(html).toContain('<html lang="bg">');
    expect(html).toContain('<script id="l21-tenant" type="application/json">{"id":"abc"');
    expect(html).not.toContain('l21_ss_');
  });

  it('cannot be broken out of with </script>', () => {
    const html = withTenant('<html lang="en"><head></head></html>', { ...tenant, baseUrl: 'https://x/</script><script>alert(1)</script>' });
    expect(html).not.toContain('</script><script>alert');
  });
});

describe('SingleTenantResolver', () => {
  const env = readEnv({ ...single, LOOM21_SERVER_SECRET: 'l21_ss_s' });

  it('loads the store once, with the key and the secret, and keeps the secret out of the tenant', async () => {
    const calls: RequestInit[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      calls.push(init);
      return new Response(JSON.stringify({ language: 'bg' }), { status: 200 });
    }) as unknown as typeof fetch;
    const resolver = new SingleTenantResolver(env, fetchFn);

    const first = await resolver.resolve();
    await resolver.resolve();

    expect(calls.length).toBe(1);
    expect((calls[0].headers as Record<string, string>)['Loom21-Server-Secret']).toBe('l21_ss_s');
    expect(first?.tenant).toEqual({
      id: tenantId('l21_pk_live_abc'),
      publishableKey: 'l21_pk_live_abc',
      apiBase: env.apiBase,
      language: 'bg',
      baseUrl: 'https://shop.example.com',
    });
    expect(JSON.stringify(first?.tenant)).not.toContain('l21_ss_');
    expect(first?.serverSecret).toBe('l21_ss_s');
  });

  it('is null when the API refuses the key, and tries again after 15 seconds', async () => {
    let t = 0;
    let status = 401;
    const fetchFn = (async () => new Response('{}', { status })) as unknown as typeof fetch;
    const resolver = new SingleTenantResolver(env, fetchFn, () => t);

    expect(await resolver.resolve()).toBeNull();
    status = 200;
    t = 10_000;
    expect(await resolver.resolve()).toBeNull();
    t = 16_000;
    expect(await resolver.resolve()).not.toBeNull();
  });

  it('two stores get two different cart ids', () => {
    expect(tenantId('l21_pk_live_a')).not.toBe(tenantId('l21_pk_live_b'));
  });
});

describe('HtmlCache', () => {
  it('caches catalog GET pages only', () => {
    for (const path of ['/', '/c/honey', '/p/raw-honey', '/pages/terms']) expect(isCacheable('GET', path)).toBe(true);
    for (const path of ['/cart', '/checkout', '/checkout/pay', '/search', '/p/a/b']) expect(isCacheable('GET', path)).toBe(false);
    expect(isCacheable('POST', '/')).toBe(false);
  });

  it('keeps a page for its seconds, per store, and drops the oldest first', () => {
    let now = 0;
    const cache = new HtmlCache(30, 2, () => now);
    const page = { status: 200, headers: [], body: 'x' };
    cache.set('a', '/', page);
    expect(cache.get('b', '/')).toBeNull();
    expect(cache.get('a', '/')?.body).toBe('x');
    now = 31_000;
    expect(cache.get('a', '/')).toBeNull();
    cache.set('a', '/1', page);
    cache.set('a', '/2', page);
    cache.set('a', '/3', page);
    expect(cache.size).toBe(2);
    expect(cache.get('a', '/1')).toBeNull();
    cache.set('a', '/404', { ...page, status: 404 });
    expect(cache.get('a', '/404')).toBeNull();
  });
});

describe('robots.txt and sitemap.xml', () => {
  it('keeps crawlers out of the cart, checkout and search, and points to the sitemap', () => {
    const robots = robotsTxt('https://shop.example.com');
    expect(robots).toContain('Disallow: /cart');
    expect(robots).toContain('Disallow: /checkout');
    expect(robots).toContain('Disallow: /search');
    expect(robots).toContain('Sitemap: https://shop.example.com/sitemap.xml');
  });

  it('escapes addresses and shortens dates', () => {
    const xml = sitemapXml('https://shop', [{ path: '/p/a&b', lastmod: '2026-10-20T10:00:00Z' }]);
    expect(xml).toContain('<loc>https://shop/p/a&amp;b</loc><lastmod>2026-10-20</lastmod>');
  });
});

describe('HostedTenantResolver', () => {
  const hosted = readEnv({
    STOREFRONT_MODE: 'hosted',
    LOOM21_HOST_SECRET: 'host-secret',
    LOOM21_INTERNAL_API_BASE: 'http://loom21-api:8081',
    LOOM21_API_BASE: 'https://app.loom21.com/storefront/v1',
  });

  function lookups(answers: Record<string, { status: number; body?: object } | 'down'>) {
    const calls: { url: string; secret: string | undefined }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, secret: (init.headers as Record<string, string>)['Loom21-Host-Secret'] });
      const host = decodeURIComponent(url.split('/').pop()!);
      const answer = answers[host] ?? { status: 404 };
      if (answer === 'down') throw new TypeError('fetch failed');
      return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status });
    }) as unknown as typeof fetch;
    return { calls, fetchFn };
  }

  const bees = { status: 200, body: { storefrontId: 7, publishableKey: 'l21_pk_live_bees', language: 'bg', isEnabled: true } };

  it('needs the host secret and the internal address', () => {
    expect(() => readEnv({ STOREFRONT_MODE: 'hosted', LOOM21_INTERNAL_API_BASE: 'http://x:8081' })).toThrow(/LOOM21_HOST_SECRET/);
    expect(() => readEnv({ STOREFRONT_MODE: 'hosted', LOOM21_HOST_SECRET: 's' })).toThrow(/LOOM21_INTERNAL_API_BASE/);
  });

  it('looks a host up with the host secret, caches it, and keeps the secret out of the tenant', async () => {
    const { calls, fetchFn } = lookups({ 'shop.bees.example': bees });
    const resolver = new HostedTenantResolver(hosted, fetchFn);

    const first = await resolver.resolve('Shop.Bees.Example');
    await resolver.resolve('shop.bees.example');

    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe('http://loom21-api:8081/internal/storefront-hosts/shop.bees.example');
    expect(calls[0].secret).toBe('host-secret');
    expect(first?.tenant).toEqual({
      id: tenantId('storefront-7'),
      publishableKey: 'l21_pk_live_bees',
      apiBase: 'https://app.loom21.com/storefront/v1',
      language: 'bg',
      baseUrl: 'https://shop.bees.example',
    });
    expect(JSON.stringify(first?.tenant)).not.toContain('host-secret');
    expect(first?.serverSecret).toBe('host-secret'); // its server-side API calls send it
  });

  it('an unknown host or a turned-off store is no store, asked again after 30 seconds', async () => {
    let t = 0;
    const answers: Record<string, { status: number; body?: object }> = {
      'off.example': { status: 200, body: { storefrontId: 8, publishableKey: 'l21_pk_live_x', language: 'en', isEnabled: false } },
    };
    const { calls, fetchFn } = lookups(answers);
    const resolver = new HostedTenantResolver(hosted, fetchFn, () => t);

    expect(await resolver.resolve('nobody.example')).toBeNull();
    expect(await resolver.resolve('off.example')).toBeNull();
    expect(await resolver.resolve('nobody.example')).toBeNull();
    expect(calls.length).toBe(2);
    answers['nobody.example'] = bees;
    t = 31_000;
    expect(await resolver.resolve('nobody.example')).not.toBeNull();
    expect(await resolver.resolve('bad host!')).toBeNull(); // never looked up
    expect(calls.length).toBe(3);
  });

  it('keeps serving a known store when loom21 is unreachable', async () => {
    let t = 0;
    const answers: Record<string, { status: number; body?: object } | 'down'> = { 'shop.bees.example': bees };
    const { fetchFn } = lookups(answers);
    const resolver = new HostedTenantResolver(hosted, fetchFn, () => t);
    await resolver.resolve('shop.bees.example');

    answers['shop.bees.example'] = 'down';
    t = 6 * 60_000;
    expect((await resolver.resolve('shop.bees.example'))?.tenant.publishableKey).toBe('l21_pk_live_bees');
    await expect(resolver.resolve('new.example')).resolves.toBeNull(); // 404 from the fake
  });
});
