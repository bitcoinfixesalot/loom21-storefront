import { isPlatformServer } from '@angular/common';
import { DOCUMENT, InjectionToken, PLATFORM_ID, Provider, REQUEST_CONTEXT, inject } from '@angular/core';

/**
 * The store a request is for, as the app sees it. Public by design: the server writes it into every page
 * (`<script id="l21-tenant">`, src/server/tenant-tag.ts), including the client-rendered cart and checkout.
 * NEVER put the server secret or the host secret in here.
 */
export interface Tenant {
  /** A short id for this store in the browser's storage (a hash of its key in single mode). */
  id: string;
  /** Public by design: browsers send it with every API call. */
  publishableKey: string;
  apiBase: string;
  language: 'en' | 'bg';
  /** The store's own address, for canonical URLs: https://shop.example.com */
  baseUrl: string;
}

/** What the server passes Angular for one request (AngularNodeAppEngine.handle's context). Never sent to the browser. */
export interface ServerRequestContext {
  tenant: Tenant;
  /** The shopper's IP, for the API's per-IP limits. */
  clientIp: string | null;
  /** The store server's secret (single mode) or the platform's (hosted). */
  serverSecret: string | null;
}

export const TENANT = new InjectionToken<Tenant>('TENANT');
export const TENANT_TAG_ID = 'l21-tenant';

/** Only the public fields, so nothing else on an object can reach the page. */
export function publicTenant(t: Tenant): Tenant {
  return { id: t.id, publishableKey: t.publishableKey, apiBase: t.apiBase, language: t.language, baseUrl: t.baseUrl };
}

/**
 * No store: the build, which boots the app on the server once to read its routes, without a request. Its `id` is empty,
 * and StoreConfig loads nothing for it.
 */
export const NO_TENANT: Tenant = { id: '', publishableKey: '', apiBase: 'http://localhost', language: 'en', baseUrl: '' };

/** On the server: the request context's tenant. In the browser: the one the server wrote into the page. */
export function provideTenant(): Provider {
  return {
    provide: TENANT,
    useFactory: () => {
      const context = inject(REQUEST_CONTEXT, { optional: true }) as ServerRequestContext | null;
      if (context?.tenant) return publicTenant(context.tenant);
      const text = inject(DOCUMENT).getElementById(TENANT_TAG_ID)?.textContent;
      if (text) return JSON.parse(text) as Tenant;
      if (isPlatformServer(inject(PLATFORM_ID))) return NO_TENANT;
      throw new Error('Loom21 storefront: tenant missing from the page');
    },
  };
}
