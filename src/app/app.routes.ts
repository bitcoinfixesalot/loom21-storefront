import { Routes } from '@angular/router';

/** Section 5 of the plan. How each renders (server or browser) is in app.routes.server.ts. */
export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home.page').then(m => m.HomePage) },
  { path: 'c/:slug', loadComponent: () => import('./features/catalog/category.page').then(m => m.CategoryPage) },
  { path: 'p/:slug', loadComponent: () => import('./features/product/product.page').then(m => m.ProductPage) },
  { path: 'search', loadComponent: () => import('./features/catalog/search.page').then(m => m.SearchPage) },
  { path: 'pages/:type', loadComponent: () => import('./features/pages/legal.page').then(m => m.LegalPage) },
  { path: 'cart', loadComponent: () => import('./features/cart/cart.page').then(m => m.CartPage) },
  { path: 'checkout', loadComponent: () => import('./features/checkout/checkout.page').then(m => m.CheckoutPage) },
  { path: 'checkout/pay', loadComponent: () => import('./features/checkout/pay.page').then(m => m.PayPage) },
  { path: 'checkout/complete', loadComponent: () => import('./features/checkout/complete.page').then(m => m.CompletePage) },
  { path: '**', loadComponent: () => import('./features/not-found/not-found.page').then(m => m.NotFoundPage) },
];
