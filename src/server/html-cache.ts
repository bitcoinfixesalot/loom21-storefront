/**
 * A tiny in-memory cache of server-rendered catalog pages, per store and URL, for HTML_CACHE_SECONDS (30 s by default).
 * Only GET requests for catalog pages (home, categories, products, the store's pages) that answered 200. Never the
 * cart, checkout or search. Availability on a cached page may be up to that old; quotes and checkouts are always
 * fresh, so a buyer can never pay a stale price.
 */
export interface CachedPage {
  status: number;
  headers: [string, string][];
  body: string;
}

const CATALOG = /^\/(?:$|c\/[^/]+\/?$|p\/[^/]+\/?$|pages\/[^/]+\/?$)/;

export function isCacheable(method: string, path: string): boolean {
  return method === 'GET' && CATALOG.test(path);
}

export class HtmlCache {
  private readonly pages = new Map<string, { page: CachedPage; until: number }>();

  constructor(
    private readonly seconds: number,
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  get enabled(): boolean {
    return this.seconds > 0;
  }

  private key(tenantId: string, url: string): string {
    return `${tenantId}|${url}`;
  }

  get(tenantId: string, url: string): CachedPage | null {
    const key = this.key(tenantId, url);
    const hit = this.pages.get(key);
    if (!hit) return null;
    if (hit.until <= this.now()) {
      this.pages.delete(key);
      return null;
    }
    // Most recently used goes last, so the oldest is dropped first.
    this.pages.delete(key);
    this.pages.set(key, hit);
    return hit.page;
  }

  set(tenantId: string, url: string, page: CachedPage): void {
    if (!this.enabled || page.status !== 200) return;
    const key = this.key(tenantId, url);
    this.pages.delete(key);
    this.pages.set(key, { page, until: this.now() + this.seconds * 1000 });
    while (this.pages.size > this.maxEntries) this.pages.delete(this.pages.keys().next().value!);
  }

  get size(): number {
    return this.pages.size;
  }
}
