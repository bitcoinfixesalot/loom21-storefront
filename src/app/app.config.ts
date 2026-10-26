import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay, withHttpTransferCacheOptions, withIncrementalHydration } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { apiInterceptor } from './core/api/api.interceptor';
import { responseStatus } from './core/http-status';
import { StoreConfig } from './core/store/store-config';
import { provideTenant } from './core/tenant/tenant';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideTenant(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
    // GET calls made while the server renders are handed to the browser, so hydration doesn't repeat them.
    provideClientHydration(withEventReplay(), withIncrementalHydration(), withHttpTransferCacheOptions({ includePostRequests: false })),
    // The store (name, currency, Bitcoin settings, look) before the first render. A failure (storefront disabled, key
    // revoked) shows the unavailable notice, with status 503 when the server renders it.
    provideAppInitializer(() => {
      const setStatus = responseStatus();
      return inject(StoreConfig)
        .load()
        .catch(e => {
          console.error('Loom21 storefront: GET /store failed', e);
          setStatus(503);
        });
    }),
  ],
};
