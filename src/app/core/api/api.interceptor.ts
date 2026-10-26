import { HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import { TENANT } from '../tenant/tenant';

/** Headers only the server adds to its API calls (app.config.server.ts). Not provided in the browser. */
export const SERVER_API_HEADERS = new InjectionToken<Record<string, string>>('SERVER_API_HEADERS');

/**
 * Every call to the Storefront API carries the store's publishable key. On the server, also the server secret and the
 * shopper's IP (Loom21-Server-Secret, Loom21-Client-IP), so the API's per-IP limits count shoppers, not this server.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const tenant = inject(TENANT);
  if (!req.url.startsWith(tenant.apiBase)) return next(req);
  const serverHeaders = inject(SERVER_API_HEADERS, { optional: true }) ?? {};
  return next(req.clone({ setHeaders: { 'Loom21-Publishable-Key': tenant.publishableKey, ...serverHeaders } }));
};
