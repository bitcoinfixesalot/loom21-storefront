import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * The cart and checkout render in the browser (they live on the buyer's cart and session, and are never indexed);
 * every catalog page renders on the server for each request, for search engines and a fast first paint. Nothing is
 * prerendered: stores and their catalogs change all the time.
 */
export const serverRoutes: ServerRoute[] = [
  { path: 'cart', renderMode: RenderMode.Client },
  { path: 'checkout', renderMode: RenderMode.Client },
  { path: 'checkout/**', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server },
];
