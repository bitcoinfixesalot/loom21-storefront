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

/** Phase 1b: hosted mode resolves the host through loom21's internal endpoint. Not built yet. */
export class HostedTenantResolver implements TenantResolver {
  constructor(private readonly env: StorefrontEnv) {}

  resolve(): Promise<ResolvedTenant | null> {
    throw new Error(`Hosted mode (STOREFRONT_MODE=hosted) is not built yet; it comes with Phase 1b. Use single mode. (${this.env.mode})`);
  }
}

export function createTenantResolver(env: StorefrontEnv, fetchFn: Fetch = fetch): TenantResolver {
  return env.mode === 'hosted' ? new HostedTenantResolver(env) : new SingleTenantResolver(env, fetchFn);
}
