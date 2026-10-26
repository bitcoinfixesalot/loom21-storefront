import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import type { ServerRequestContext } from './app/core/tenant/tenant';
import { EnvError, StorefrontEnv, readEnv } from './server/env';
import { HtmlCache, isCacheable } from './server/html-cache';
import { SitemapBuilder, robotsTxt, storeUnavailableHtml } from './server/sitemap';
import { withTenant } from './server/tenant-tag';
import { ResolvedTenant, TenantResolver, createTenantResolver } from './server/tenant-resolver';

const browserDistFolder = join(import.meta.dirname, '../browser');

export interface StoreServerDeps {
  env: StorefrontEnv;
  resolver?: TenantResolver;
  fetchFn?: typeof fetch;
}

/** The hosts the Angular engine renders for: the store's own, plus localhost for running it locally. */
function allowedHosts(env: StorefrontEnv): string[] {
  const hosts = ['localhost', '127.0.0.1'];
  if (env.publicBaseUrl) hosts.push(new URL(env.publicBaseUrl).hostname);
  return hosts;
}

/**
 * The store's Express app: /healthz, /robots.txt and /sitemap.xml per store, the built browser files, then every
 * other request rendered by Angular for its store, with the 30-second page cache for catalog pages.
 */
export function createStoreServer({ env, resolver = createTenantResolver(env), fetchFn = fetch }: StoreServerDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  // Behind Caddy or another proxy: req.ip is the shopper's (X-Forwarded-For), which the API's per-IP limits count.
  app.set('trust proxy', env.trustProxy);

  const angularApp = new AngularNodeAppEngine({ allowedHosts: allowedHosts(env), trustProxyHeaders: env.trustProxy });
  const htmlCache = new HtmlCache(env.htmlCacheSeconds);
  const sitemaps = new SitemapBuilder(fetchFn);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.type('text/plain').setHeader('Cache-Control', 'no-store').send('ok');
  });

  const tenantFor = async (req: express.Request, res: express.Response): Promise<ResolvedTenant | null> => {
    const resolved = await resolver.resolve(req.hostname);
    if (!resolved) {
      // No store here: a plain page, 503 in single mode (it should come back), 404 for an unknown host.
      res.status(env.mode === 'single' ? 503 : 404).setHeader('Cache-Control', 'no-store');
      if (env.mode === 'single') res.setHeader('Retry-After', '60');
      res.type('html').send(storeUnavailableHtml());
    }
    return resolved;
  };

  app.get('/robots.txt', async (req, res, next) => {
    try {
      const resolved = await tenantFor(req, res);
      if (!resolved) return;
      res.type('text/plain').setHeader('Cache-Control', 'public, max-age=3600').send(robotsTxt(resolved.tenant.baseUrl));
    } catch (e) {
      next(e);
    }
  });

  app.get('/sitemap.xml', async (req, res, next) => {
    try {
      const resolved = await tenantFor(req, res);
      if (!resolved) return;
      const xml = await sitemaps.build(resolved);
      res.type('application/xml').setHeader('Cache-Control', 'public, max-age=600').send(xml);
    } catch (e) {
      next(e);
    }
  });

  app.use(express.static(browserDistFolder, { maxAge: '1y', index: false, redirect: false }));

  app.use(async (req, res, next) => {
    try {
      const resolved = await tenantFor(req, res);
      if (!resolved) return;
      const { tenant } = resolved;

      const cacheable = htmlCache.enabled && isCacheable(req.method, req.path);
      const cached = cacheable ? htmlCache.get(tenant.id, req.originalUrl) : null;
      if (cached) {
        res.status(cached.status);
        for (const [name, value] of cached.headers) res.setHeader(name, value);
        res.setHeader('X-Cache', 'HIT');
        res.send(cached.body);
        return;
      }

      const context: ServerRequestContext = { tenant, clientIp: req.ip ?? null, serverSecret: resolved.serverSecret };
      const response = await angularApp.handle(req, context);
      if (!response) return next();

      const type = response.headers.get('content-type') ?? '';
      if (!type.includes('text/html')) {
        await writeResponseToNodeResponse(response, res);
        return;
      }

      // Every page, server- or client-rendered, gets the store's public tenant (never a secret).
      const body = withTenant(await response.text(), tenant);
      const headers: [string, string][] = [];
      response.headers.forEach((value, name) => {
        if (name !== 'content-length') headers.push([name, value]);
      });
      if (!headers.some(([name]) => name === 'cache-control')) headers.push(['cache-control', 'no-cache']);
      if (cacheable) htmlCache.set(tenant.id, req.originalUrl, { status: response.status, headers, body });

      res.status(response.status);
      for (const [name, value] of headers) res.setHeader(name, value);
      res.send(body);
    } catch (e) {
      next(e);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Loom21 storefront:', error);
    if (res.headersSent) return;
    res
      .status(error instanceof EnvError ? 500 : 503)
      .setHeader('Cache-Control', 'no-store')
      .type('html')
      .send(storeUnavailableHtml());
  });

  return app;
}

/** The store app, made on first use: the Angular CLI imports this file during a build, which has no env. */
let storeServer: express.Express | null = null;

const entry = express();
entry.disable('x-powered-by');
entry.use((req, res, next) => {
  try {
    storeServer ??= createStoreServer({ env: readEnv() });
  } catch (e) {
    console.error(e instanceof EnvError ? `Loom21 storefront: ${e.message}` : e);
    res
      .status(500)
      .type('text/plain')
      .send(e instanceof EnvError ? `Storefront misconfigured: ${e.message}` : 'Storefront error');
    return;
  }
  storeServer(req, res, next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const env = readEnv(); // fail fast on a bad configuration when started for real
  storeServer = createStoreServer({ env });
  entry.listen(env.port, error => {
    if (error) throw error;
    console.log(`Loom21 storefront (${env.mode} mode) listening on http://localhost:${env.port}`);
  });
}

/** Request handler used by the Angular CLI (dev server and build). */
export const reqHandler = createNodeRequestHandler(entry);
