import type { ResolvedTenant } from './tenant-resolver';

/** robots.txt: everything may be crawled except the cart, checkout and search (which also say noindex). */
export function robotsTxt(baseUrl: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /cart',
    'Disallow: /checkout',
    'Disallow: /search',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

interface Entry {
  path: string;
  lastmod?: string;
}

export function sitemapXml(baseUrl: string, entries: Entry[]): string {
  const urls = entries
    .map(
      e =>
        `  <url><loc>${xmlEscape(baseUrl + e.path)}</loc>${e.lastmod ? `<lastmod>${xmlEscape(e.lastmod.slice(0, 10))}</lastmod>` : ''}</url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

type Fetch = typeof fetch;
const CACHE_MS = 10 * 60_000;

/** sitemap.xml per store, from GET /sitemap and GET /pages, cached for 10 minutes. */
export class SitemapBuilder {
  private readonly cache = new Map<string, { xml: string; until: number }>();

  constructor(
    private readonly fetchFn: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async build(resolved: ResolvedTenant): Promise<string> {
    const { tenant } = resolved;
    const hit = this.cache.get(tenant.id);
    if (hit && hit.until > this.now()) return hit.xml;

    const headers: Record<string, string> = { 'Loom21-Publishable-Key': tenant.publishableKey, Accept: 'application/json' };
    if (resolved.serverSecret) headers['Loom21-Server-Secret'] = resolved.serverSecret;
    const get = async <T>(path: string): Promise<T> => {
      const response = await this.fetchFn(`${tenant.apiBase}${path}`, { headers, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
      return (await response.json()) as T;
    };
    const [sitemap, pages] = await Promise.all([
      get<{ categories: { slug: string; updatedAt: string }[]; products: { slug: string; updatedAt: string }[] }>('/sitemap'),
      get<{ type: string; updatedAt: string }[]>('/pages'),
    ]);
    const xml = sitemapXml(tenant.baseUrl, [
      { path: '/' },
      ...sitemap.categories.map(c => ({ path: `/c/${encodeURIComponent(c.slug)}`, lastmod: c.updatedAt })),
      ...sitemap.products.map(p => ({ path: `/p/${encodeURIComponent(p.slug)}`, lastmod: p.updatedAt })),
      ...pages.map(p => ({ path: `/pages/${encodeURIComponent(p.type)}`, lastmod: p.updatedAt })),
    ]);
    this.cache.set(tenant.id, { xml, until: this.now() + CACHE_MS });
    return xml;
  }
}

/** The page for a request with no store behind it: a disabled storefront, a revoked key, an unknown host. */
export function storeUnavailableHtml(language: 'en' | 'bg' = 'en'): string {
  const text =
    language === 'bg'
      ? { title: 'Магазинът не е достъпен', body: 'Този магазин в момента не е достъпен. Моля, опитайте по-късно.' }
      : { title: "This store isn't available", body: "This store isn't available right now. Please try again later." };
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${text.title}</title><style>body{font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;color:#1d1d1f;background:#fafafa}@media(prefers-color-scheme:dark){body{color:#eee;background:#141414}}main{max-width:28rem;text-align:center}</style></head><body><main><h1>${text.title}</h1><p>${text.body}</p></main></body></html>`;
}
