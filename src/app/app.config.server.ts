import { ApplicationConfig, REQUEST_CONTEXT, inject, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { SERVER_API_HEADERS } from './core/api/api.interceptor';
import type { ServerRequestContext } from './core/tenant/tenant';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Server-side API calls only: the store server's secret and the shopper's IP (docs: "Server secret").
    {
      provide: SERVER_API_HEADERS,
      useFactory: (): Record<string, string> => {
        const context = inject(REQUEST_CONTEXT, { optional: true }) as ServerRequestContext | null;
        if (!context?.serverSecret) return {};
        const headers: Record<string, string> = { 'Loom21-Server-Secret': context.serverSecret };
        if (context.clientIp) headers['Loom21-Client-IP'] = context.clientIp.replace(/^::ffff:/, '');
        return headers;
      },
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
