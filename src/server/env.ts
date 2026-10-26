/**
 * The store server's settings, from environment variables (.env.example). The only place secrets are read: they go
 * to the server-side API calls through the request context, never into anything sent to a browser.
 */
export type StorefrontMode = 'single' | 'hosted';

export interface StorefrontEnv {
  mode: StorefrontMode;
  /** The Storefront API, e.g. https://app.loom21.com/storefront/v1 (no trailing slash). */
  apiBase: string;
  /** Single mode: the storefront's publishable key. */
  publishableKey: string | null;
  /** Single mode, optional: lets the API count shoppers' IPs instead of this server's. */
  serverSecret: string | null;
  /** Single mode: the store's own address, for canonical URLs and the sitemap. */
  publicBaseUrl: string | null;
  /** Hosted mode (Phase 1b): the platform's secret for the internal host lookup. */
  hostSecret: string | null;
  internalApiBase: string | null;
  htmlCacheSeconds: number;
  trustProxy: boolean;
  port: number;
}

export class EnvError extends Error {}

const trimSlash = (url: string) => url.replace(/\/+$/, '');

function httpUrl(name: string, value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
    return trimSlash(url.toString());
  } catch {
    throw new EnvError(`${name} must be an http(s) address, got "${value}".`);
  }
}

export function readEnv(env: Record<string, string | undefined> = process.env): StorefrontEnv {
  const mode = (env['STOREFRONT_MODE'] || 'single').trim().toLowerCase();
  if (mode !== 'single' && mode !== 'hosted') throw new EnvError(`STOREFRONT_MODE must be single or hosted, got "${mode}".`);

  const result: StorefrontEnv = {
    mode,
    apiBase: httpUrl('LOOM21_API_BASE', env['LOOM21_API_BASE']) ?? 'https://app.loom21.com/storefront/v1',
    publishableKey: env['LOOM21_PUBLISHABLE_KEY']?.trim() || null,
    serverSecret: env['LOOM21_SERVER_SECRET']?.trim() || null,
    publicBaseUrl: httpUrl('PUBLIC_BASE_URL', env['PUBLIC_BASE_URL']),
    hostSecret: env['LOOM21_HOST_SECRET']?.trim() || null,
    internalApiBase: httpUrl('LOOM21_INTERNAL_API_BASE', env['LOOM21_INTERNAL_API_BASE']),
    htmlCacheSeconds: Math.max(0, Number(env['HTML_CACHE_SECONDS'] ?? 30) || 0),
    trustProxy: (env['TRUST_PROXY'] ?? '').trim().toLowerCase() === 'true',
    port: Number(env['PORT']) || 4000,
  };

  if (mode === 'single') {
    if (!result.publishableKey?.startsWith('l21_pk_'))
      throw new EnvError('LOOM21_PUBLISHABLE_KEY is required in single mode (l21_pk_live_…, Settings → Storefronts → Developer).');
    if (!result.publicBaseUrl) throw new EnvError('PUBLIC_BASE_URL is required in single mode, e.g. https://shop.example.com.');
    if (result.serverSecret && !result.serverSecret.startsWith('l21_ss_'))
      throw new EnvError('LOOM21_SERVER_SECRET must start with l21_ss_ (Settings → Storefronts → Developer → Server secret).');
  }
  return result;
}
