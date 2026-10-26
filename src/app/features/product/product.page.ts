import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap, tap } from 'rxjs';
import { StorefrontApi } from '../../core/api/storefront-api';
import type { Product } from '../../core/api/types';
import { CartStore } from '../../core/cart/cart.store';
import { clampQuantity } from '../../core/format';
import { responseStatus } from '../../core/http-status';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { SeoService } from '../../core/seo/seo.service';
import { StoreConfig } from '../../core/store/store-config';
import { AvailabilityBadgeComponent } from '../../shared/availability-badge.component';
import { MarkdownPipe } from '../../shared/markdown.pipe';
import { PriceComponent } from '../../shared/price.component';
import { NotFoundPage } from '../not-found/not-found.page';

type State = { kind: 'loading' } | { kind: 'missing' } | { kind: 'ready'; product: Product };

/**
 * /p/:slug: the product page, rendered on the server with its JSON-LD. An unpublished or unknown product is a 404.
 * Availability here is as of the render (up to the page cache's 30 seconds); the cart's quote is always fresh.
 */
@Component({
  selector: 'app-product-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, PriceComponent, AvailabilityBadgeComponent, MarkdownPipe, NotFoundPage],
  template: `
    @let s = state();
    @switch (s.kind) {
      @case ('ready') {
        @let p = s.product;
        <article class="container section product">
          <nav class="crumbs" aria-label="breadcrumb">
            <a routerLink="/">{{ 'nav.home' | t }}</a>
            @if (p.category && p.categorySlug) {
              / <a [routerLink]="['/c', p.categorySlug]">{{ p.category }}</a>
            }
          </nav>
          <div class="product__layout">
            <div class="gallery">
              @if (p.images.length) {
                @let image = p.images[photo() < p.images.length ? photo() : 0];
                <img class="gallery__main" [src]="image.large" [alt]="p.name" width="800" height="800" fetchpriority="high" />
                @if (p.images.length > 1) {
                  <div class="gallery__thumbs">
                    @for (img of p.images; track img.thumb; let i = $index) {
                      <button
                        type="button"
                        class="gallery__thumb"
                        [class.is-active]="i === photo()"
                        (click)="photo.set(i)"
                        [attr.aria-label]="'product.photo' | t: { n: i + 1, total: p.images.length }"
                      >
                        <img [src]="img.thumb" alt="" width="80" height="80" loading="lazy" />
                      </button>
                    }
                  </div>
                }
              } @else {
                <div class="gallery__main gallery__empty"></div>
              }
            </div>

            <div class="buy">
              <h1>{{ p.name }}</h1>
              <app-price [amount]="p.price" [sats]="p.priceSats" [showVat]="true" class="buy__price" />
              <app-availability [availability]="p.availability" />

              @if (p.priceTiers.length) {
                <div class="tiers">
                  <strong>{{ 'product.tiers' | t }}</strong>
                  <ul>
                    @for (tier of p.priceTiers; track tier.minQuantity) {
                      <li>{{ 'product.tier' | t: { n: tier.minQuantity, price: config.price(tier.unitPrice, null) } }}</li>
                    }
                  </ul>
                </div>
              }

              @if (!config.canOrder()) {
                <p class="notice" data-testid="checkout-unavailable">{{ 'store.checkoutUnavailable' | t }}</p>
              }
              <div class="buy__row">
                <div class="stepper" role="group" [attr.aria-label]="'product.quantity' | t">
                  <button
                    type="button"
                    (click)="setQuantity(quantity() - 1)"
                    [disabled]="quantity() <= 1"
                    [attr.aria-label]="'product.less' | t"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputmode="numeric"
                    min="1"
                    [max]="max()"
                    [value]="quantity()"
                    (change)="setQuantity($any($event.target).value)"
                    [attr.aria-label]="'product.quantity' | t"
                  />
                  <button
                    type="button"
                    (click)="setQuantity(quantity() + 1)"
                    [disabled]="quantity() >= max()"
                    [attr.aria-label]="'product.more' | t"
                  >
                    +
                  </button>
                </div>
                <button type="button" class="button button--primary" (click)="add(p)" [disabled]="!canAdd()" data-testid="add-to-cart">
                  {{ 'product.addToCart' | t }}
                </button>
              </div>
              @if (added()) {
                <p class="added" role="status">
                  {{ 'product.added' | t }} · <a routerLink="/cart">{{ 'product.viewCart' | t }}</a>
                </p>
              }

              @if (p.publicDescription) {
                <div class="prose" [innerHTML]="p.publicDescription | markdown" data-testid="description"></div>
              }

              @if (p.customFields.length || p.brand || p.model || p.code) {
                <h2 class="section__title">{{ 'product.details' | t }}</h2>
                <dl class="details">
                  @if (p.brand) {
                    <dt>{{ 'product.brand' | t }}</dt>
                    <dd>{{ p.brand }}</dd>
                  }
                  @if (p.model) {
                    <dt>{{ 'product.model' | t }}</dt>
                    <dd>{{ p.model }}</dd>
                  }
                  @for (f of p.customFields; track f.name) {
                    <dt>{{ f.label }}</dt>
                    <dd>{{ fieldValue(f.value) }}</dd>
                  }
                  @if (p.code) {
                    <dt>{{ 'product.code' | t }}</dt>
                    <dd>{{ p.code }}</dd>
                  }
                </dl>
              }
            </div>
          </div>
        </article>
      }
      @case ('missing') {
        <app-not-found-page />
      }
      @default {
        <div class="container section" aria-busy="true"></div>
      }
    }
  `,
})
export class ProductPage {
  readonly config = inject(StoreConfig);
  private readonly api = inject(StorefrontApi);
  private readonly cart = inject(CartStore);
  private readonly seo = inject(SeoService);
  private readonly i18n = inject(I18n);
  private readonly status = responseStatus();

  readonly photo = signal(0);
  readonly quantity = signal(1);
  readonly added = signal(false);

  readonly state = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map(params => params.get('slug') ?? ''),
      switchMap(slug =>
        this.api.product(slug).pipe(
          map((product): State => ({ kind: 'ready', product })),
          catchError(() => of<State>({ kind: 'missing' })),
          tap(state => this.describe(state)),
          startWith<State>({ kind: 'loading' }),
        ),
      ),
      tap(() => {
        this.photo.set(0);
        this.quantity.set(1);
        this.added.set(false);
      }),
    ),
    { initialValue: { kind: 'loading' } as State },
  );

  private readonly product = computed(() => {
    const s = this.state();
    return s.kind === 'ready' ? s.product : null;
  });

  /** What this line may still take: the per-line maximum less what the cart already has. */
  readonly max = computed(() => {
    const p = this.product();
    return p ? Math.max(1, p.availability.maxQuantity - this.cart.quantityOf(p.id)) : 1;
  });

  readonly canAdd = computed(() => {
    const p = this.product();
    return (
      !!p && this.config.canOrder() && p.availability.status !== 'out_of_stock' && p.availability.maxQuantity > this.cart.quantityOf(p.id)
    );
  });

  setQuantity(value: unknown): void {
    this.quantity.set(clampQuantity(value, this.max()));
  }

  add(product: Product): void {
    this.cart.add(product.id, this.quantity(), product.availability.maxQuantity);
    this.added.set(true);
    this.quantity.set(1);
  }

  fieldValue(value: unknown): string {
    if (typeof value === 'boolean') return value ? '✓' : '—';
    if (value === null || value === undefined) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  private describe(state: State): void {
    if (state.kind === 'missing') {
      this.status(404);
      this.seo.set({ title: this.i18n.t('notFound.title'), noindex: true });
      return;
    }
    if (state.kind !== 'ready') return;
    const p = state.product;
    const store = this.config.store();
    const path = `/p/${p.slug ?? p.id}`;
    const image = p.images[0]?.large ?? null;
    this.seo.set({
      title: `${p.name} | ${store?.name ?? ''}`,
      description: p.publicDescription ?? store?.seoDescription,
      path,
      image,
      type: 'product',
    });
    const crumbs = [{ name: store?.name ?? '', item: this.config.baseUrl + '/' }];
    if (p.category && p.categorySlug) crumbs.push({ name: p.category, item: `${this.config.baseUrl}/c/${p.categorySlug}` });
    crumbs.push({ name: p.name, item: this.config.baseUrl + path });
    this.seo.setJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: p.name,
        image: p.images.map(i => i.large),
        description: p.publicDescription ?? undefined,
        sku: p.code ?? undefined,
        brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined,
        offers: {
          '@type': 'Offer',
          price: this.config.gross(p.price).toFixed(2),
          priceCurrency: p.currency,
          availability: p.availability.status === 'out_of_stock' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          url: this.config.baseUrl + path,
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
      },
    ]);
  }
}
