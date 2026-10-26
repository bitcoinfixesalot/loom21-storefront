import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { TENANT } from '../tenant/tenant';
import { ApiError } from './api-error';
import type {
  Category,
  Checkout,
  CheckoutRequest,
  CheckoutStatus,
  Page,
  PageSummary,
  PageType,
  Paged,
  Payment,
  PaymentMethodName,
  Product,
  ProductSort,
  ProductSummary,
  Quote,
  QuoteRequest,
  Store,
} from './types';

export interface ProductQuery {
  category?: string | null;
  q?: string | null;
  sort?: ProductSort | null;
  page?: number;
  pageSize?: number;
}

/** A status poll's answer: the status, or null when it hasn't changed since `etag` (304). */
export interface StatusPoll {
  status: CheckoutStatus | null;
  etag: string | null;
}

/**
 * The public Storefront API (/storefront/v1), typed. Errors come out as ApiError. GET calls made while the server
 * renders a page are handed to the browser (HTTP transfer cache), so hydration doesn't repeat them.
 */
@Injectable({ providedIn: 'root' })
export class StorefrontApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(TENANT).apiBase;

  private get<T>(path: string, params?: HttpParams): Observable<T> {
    return this.http.get<T>(this.base + path, { params }).pipe(catchError(e => throwError(() => ApiError.from(e))));
  }

  private post<T>(path: string, body: unknown, headers?: HttpHeaders): Observable<T> {
    return this.http.post<T>(this.base + path, body, { headers }).pipe(catchError(e => throwError(() => ApiError.from(e))));
  }

  store(): Observable<Store> {
    return this.get<Store>('/store');
  }

  categories(): Observable<Category[]> {
    return this.get<Category[]>('/categories');
  }

  products(query: ProductQuery = {}): Observable<Paged<ProductSummary>> {
    let params = new HttpParams();
    for (const [name, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') params = params.set(name, String(value));
    }
    return this.get<Paged<ProductSummary>>('/products', params);
  }

  product(idOrSlug: string): Observable<Product> {
    return this.get<Product>(`/products/${encodeURIComponent(idOrSlug)}`);
  }

  pages(): Observable<PageSummary[]> {
    return this.get<PageSummary[]>('/pages');
  }

  page(type: PageType | string): Observable<Page> {
    return this.get<Page>(`/pages/${encodeURIComponent(type)}`);
  }

  quote(request: QuoteRequest): Observable<Quote> {
    return this.post<Quote>('/quotes', request);
  }

  /** One Idempotency-Key per checkout attempt: a retry with the same key and body gets the same checkout back. */
  createCheckout(request: CheckoutRequest, idempotencyKey: string): Observable<Checkout> {
    return this.post<Checkout>('/checkouts', request, new HttpHeaders({ 'Idempotency-Key': idempotencyKey }));
  }

  pay(token: string, method: PaymentMethodName): Observable<Payment> {
    return this.post<Payment>(`/checkouts/${encodeURIComponent(token)}/payments`, { method });
  }

  /** The checkout's status; with `etag`, a 304 (unchanged) comes back as `status: null`. */
  status(token: string, etag: string | null = null): Observable<StatusPoll> {
    const headers = etag ? new HttpHeaders({ 'If-None-Match': etag }) : undefined;
    return this.http.get<CheckoutStatus>(`${this.base}/checkouts/${encodeURIComponent(token)}`, { headers, observe: 'response' }).pipe(
      map(response => ({ status: response.body, etag: response.headers.get('ETag') ?? etag })),
      catchError((e: unknown) =>
        e instanceof HttpErrorResponse && e.status === 304 ? of({ status: null, etag }) : throwError(() => ApiError.from(e)),
      ),
    );
  }

  cancel(token: string): Observable<CheckoutStatus> {
    return this.post<CheckoutStatus>(`/checkouts/${encodeURIComponent(token)}/cancel`, {});
  }
}
