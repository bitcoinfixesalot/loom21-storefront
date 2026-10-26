import { createHash } from 'node:crypto';
import type { Tenant } from '../app/core/tenant/tenant';
import type { StorefrontEnv } from './env';

/** A request's store, with the secret its server-side API calls send. The secret never leaves the server. */
export interface ResolvedTenant {
  tenant: Tenant;
  serverSecret: string | null;
}

/**
 * Finds the store for a request's host. Single mode: always the one store in the env. Hosted mode (Phase 1b): the host
 * looked up through loom21's internal endpoint. null = no store here (unknown host, disabled storefront, revoked key).
 */
export interface TenantResolver {
  resolve(host: string): Promise<ResolvedTenant | null>;
}

const CACHE_MS = 5 * 60_000;
const FAILURE_CACHE_MS = 15_000;

/** The store id the browser keys its cart by: a short hash of the publishable key, so two stores never share a cart. */
export function tenantId(publishableKey: string): string {
  return createHash('sha256').update(publishableKey).digest('hex').slice(0, 12);
}

type Fetch = typeof fetch;

/**
 * Single mode. The store's language comes from GET /store; the answer is cached for 5 minutes (a refusal for 15
 * seconds, so a fixed key or re-enabled store comes back soon).
 */
export class SingleTenantResolver implements TenantResolver {
  private cached: { value: ResolvedTenant | null; until: number } | null = null;
  private pending: Promise<ResolvedTenant | null> | null = null;

  constructor(
    private readonly env: StorefrontEnv,
    private readonly fetchFn: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  resolve(): Promise<ResolvedTenant | null> {
    if (this.cached && this.cached.until > this.now()) return Promise.resolve(this.cached.value);
    this.pending ??= this.load().finally(() => (this.pending = null));
    return this.pending;
  }

  private async load(): Promise<ResolvedTenant | null> {
    const key = this.env.publishableKey!;
    const headers: Record<string, string> = { 'Loom21-Publishable-Key': key, Accept: 'application/json' };
    if (this.env.serverSecret) headers['Loom21-Server-Secret'] = this.env.serverSecret;
    try {
      const response = await this.fetchFn(`${this.env.apiBase}/store`, { headers, signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        console.error(
          `Loom21 storefront: GET /store answered ${response.status}. Check LOOM21_PUBLISHABLE_KEY and that the storefront is enabled.`,
        );
        this.cached = { value: null, until: this.now() + FAILURE_CACHE_MS };
        return null;
      }
      const store = (await response.json()) as { language?: string };
      const value: ResolvedTenant = {
        tenant: {
          id: tenantId(key),
          publishableKey: key,
          apiBase: this.env.apiBase,
          language: store.language === 'bg' ? 'bg' : 'en',
          baseUrl: this.env.publicBaseUrl!,
        },
        serverSecret: this.env.serverSecret,
      };
      this.cached = { value, until: this.now() + CACHE_MS };
      return value;
    } catch (e) {
      // The API is unreachable: keep serving the last known store if there is one.
      console.error('Loom21 storefront: the Storefront API is unreachable.', e);
      if (this.cached?.value) return this.cached.value;
      return null;
    }
  }
}

/** loom21's internal host lookup (GET /internal/storefront-hosts/{hostname}). */
interface HostAnswer {
  storefrontId: number;
  publishableKey: string | null;
  language: string;
  isEnabled: boolean;
}

const HOSTED_MAX_ENTRIES = 1000;
const HOSTED_MISS_MS = 30_000;

/**
 * Hosted mode (loom21's own deployment): the store is the request's host, looked up through loom21's internal endpoint
 * with the platform's host secret, and cached for 5 minutes (an unknown host for 30 seconds). A storefront turned off or
 * a domain removed takes at most that long to stop being served. The host secret is also the server secret of every
 * store's server-side API calls, so the API counts shoppers' IPs.
 */
export class HostedTenantResolver implements TenantResolver {
  private readonly cache = new Map<string, { value: ResolvedTenant | null; until: number }>();
  private readonly pending = new Map<string, Promise<ResolvedTenant | null>>();

  constructor(
    private readonly env: StorefrontEnv,
    private readonly fetchFn: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  resolve(host: string): Promise<ResolvedTenant | null> {
    const hostname = (host ?? '').trim().toLowerCase().replace(/\.$/, '');
    if (!/^[a-z0-9.-]{1,253}$/.test(hostname)) return Promise.resolve(null);
    const hit = this.cache.get(hostname);
    if (hit && hit.until > this.now()) {
      // Most recently used goes last, so the oldest is dropped first.
      this.cache.delete(hostname);
      this.cache.set(hostname, hit);
      return Promise.resolve(hit.value);
    }
    let pending = this.pending.get(hostname);
    if (!pending) {
      pending = this.load(hostname, hit?.value ?? null).finally(() => this.pending.delete(hostname));
      this.pending.set(hostname, pending);
    }
    return pending;
  }

  private remember(hostname: string, value: ResolvedTenant | null, ms: number): ResolvedTenant | null {
    this.cache.delete(hostname);
    this.cache.set(hostname, { value, until: this.now() + ms });
    while (this.cache.size > HOSTED_MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }

  private async load(hostname: string, stale: ResolvedTenant | null): Promise<ResolvedTenant | null> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.env.internalApiBase}/internal/storefront-hosts/${encodeURIComponent(hostname)}`, {
        headers: { 'Loom21-Host-Secret': this.env.hostSecret!, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
    } catch (e) {
      // loom21 is unreachable: keep serving what we knew.
      console.error(`Loom21 storefront: host lookup for ${hostname} failed.`, e);
      if (stale) return stale;
      throw e;
    }
    if (response.status === 404) return this.remember(hostname, null, HOSTED_MISS_MS);
    if (!response.ok) {
      console.error(`Loom21 storefront: host lookup for ${hostname} answered ${response.status}.`);
      if (stale) return stale;
      throw new Error(`Host lookup answered ${response.status}`);
    }
    const answer = (await response.json()) as HostAnswer;
    if (!answer.isEnabled || !answer.publishableKey) return this.remember(hostname, null, HOSTED_MISS_MS);
    return this.remember(
      hostname,
      {
        tenant: {
          // The storefront, not its key: rolling the key keeps the shoppers' carts.
          id: tenantId(`storefront-${answer.storefrontId}`),
          publishableKey: answer.publishableKey,
          apiBase: this.env.apiBase,
          language: answer.language === 'bg' ? 'bg' : 'en',
          baseUrl: `https://${hostname}`,
        },
        serverSecret: this.env.hostSecret,
      },
      CACHE_MS,
    );
  }
}

export function createTenantResolver(env: StorefrontEnv, fetchFn: Fetch = fetch): TenantResolver {
  return env.mode === 'hosted' ? new HostedTenantResolver(env, fetchFn) : new SingleTenantResolver(env, fetchFn);
}
