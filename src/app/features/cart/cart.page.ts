import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { StorefrontApi } from '../../core/api/storefront-api';
import type { Quote, QuoteLine } from '../../core/api/types';
import { CartStore } from '../../core/cart/cart.store';
import { clampQuantity } from '../../core/format';
import { I18n, TPipe, TextKey } from '../../core/i18n/i18n.service';
import { SeoService } from '../../core/seo/seo.service';
import { StoreConfig } from '../../core/store/store-config';

/**
 * /cart (rendered in the browser): the cart priced by POST /quotes every time it changes, so names, prices, VAT and
 * availability are always the server's. Lines the quote leaves out are dropped from the cart with a message.
 */
@Component({
  selector: 'app-cart-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe],
  template: `
    <div class="container section cart">
      <h1>{{ 'cart.title' | t }}</h1>
      @for (w of warnings(); track w) {
        <p class="notice" role="status">{{ w }}</p>
      }
      @if (error()) {
        <p class="notice notice--error" role="alert">{{ error() }}</p>
      }
      @if (cart.items().length === 0) {
        <p class="muted" data-testid="cart-empty">{{ 'cart.empty' | t }}</p>
        <a class="button" routerLink="/">{{ 'cart.continue' | t }}</a>
      } @else if (quote(); as q) {
        <ul class="lines" data-testid="cart-lines">
          @for (line of q.lines; track line.productId) {
            <li class="line">
              <span class="line__name">{{ line.name }}</span>
              <div class="stepper" role="group" [attr.aria-label]="'product.quantity' | t">
                <button type="button" (click)="set(line, line.quantity - 1)" [attr.aria-label]="'product.less' | t">−</button>
                <input
                  type="number"
                  inputmode="numeric"
                  min="1"
                  [max]="line.maxQuantity"
                  [value]="line.quantity"
                  (change)="set(line, $any($event.target).value)"
                  [attr.aria-label]="'product.quantity' | t"
                />
                <button
                  type="button"
                  (click)="set(line, line.quantity + 1)"
                  [disabled]="line.quantity >= line.maxQuantity"
                  [attr.aria-label]="'product.more' | t"
                >
                  +
                </button>
              </div>
              <span class="line__total">{{ config.amount(line.lineTotal) }}</span>
              <button
                type="button"
                class="link-button"
                (click)="remove(line.productId)"
                [attr.aria-label]="'cart.removeItem' | t: { name: line.name }"
              >
                {{ 'cart.remove' | t }}
              </button>
            </li>
          }
        </ul>
        <dl class="totals">
          <dt>{{ 'cart.subtotal' | t }}</dt>
          <dd>{{ config.amount(q.subtotal) }}</dd>
          @if (config.store()?.shippingMethods?.length) {
            <dt>{{ 'cart.shipping' | t }}</dt>
            <dd class="muted">{{ 'cart.shippingLater' | t }}</dd>
          }
          @if (q.vat.amount > 0) {
            <dt>{{ 'cart.vat' | t: { rate: q.vat.rate } }}</dt>
            <dd>{{ config.amount(q.vat.amount) }}</dd>
          }
          <dt class="totals__total">{{ 'cart.total' | t }}</dt>
          <dd class="totals__total" data-testid="cart-total">{{ config.amount(q.total, q.totalSats) }}</dd>
        </dl>
        <p class="muted small">{{ 'cart.pricesExplained' | t }}</p>
        @if (!config.canOrder()) {
          <p class="notice">{{ 'store.checkoutUnavailable' | t }}</p>
        }
        <div class="actions">
          <a class="button" routerLink="/">{{ 'cart.continue' | t }}</a>
          <a
            class="button button--primary"
            routerLink="/checkout"
            [class.is-disabled]="!canCheckout()"
            [attr.aria-disabled]="!canCheckout()"
            (click)="!canCheckout() && $event.preventDefault()"
            data-testid="checkout"
          >
            {{ 'cart.checkout' | t }}
          </a>
        </div>
      } @else {
        <p class="muted" aria-busy="true">{{ 'cart.updating' | t }}</p>
      }
    </div>
  `,
})
export class CartPage {
  readonly cart = inject(CartStore);
  readonly config = inject(StoreConfig);
  private readonly api = inject(StorefrontApi);
  private readonly i18n = inject(I18n);

  readonly quote = signal<Quote | null>(null);
  readonly warnings = signal<string[]>([]);
  readonly error = signal<string | null>(null);
  readonly canCheckout = computed(() => this.config.canOrder() && (this.quote()?.lines.length ?? 0) > 0);
  private request: Subscription | null = null;

  constructor() {
    inject(SeoService).set({ title: `${this.i18n.t('cart.title')} | ${this.config.store()?.name ?? ''}`, noindex: true });
    effect(() => this.price(this.cart.items()));
  }

  set(line: QuoteLine, value: unknown): void {
    const n = Math.floor(Number(value));
    if (n <= 0) return this.remove(line.productId);
    this.cart.set(line.productId, clampQuantity(n, line.maxQuantity));
  }

  remove(productId: number): void {
    this.cart.remove(productId);
  }

  private price(items: { productId: number; quantity: number }[]): void {
    this.request?.unsubscribe();
    if (items.length === 0) {
      this.quote.set(null);
      return;
    }
    this.request = this.api.quote({ items }).subscribe({
      next: quote => {
        this.error.set(null);
        this.quote.set(quote);
        // The quote after a reconcile has no warnings left; keep the ones that explained the change.
        if (quote.warnings.length || !this.reconciled)
          this.warnings.set(quote.warnings.map(w => this.warningText(w.code, w.productId, quote)));
        this.reconciled = false;
        this.reconcile(quote);
      },
      error: e => this.error.set(this.i18n.error(e)),
    });
  }

  /** The cart follows the quote: lines it left out go, quantities over the line maximum come down. */
  private reconcile(quote: Quote): void {
    const priced = new Map(quote.lines.map(l => [l.productId, l]));
    for (const item of this.cart.items()) {
      const line = priced.get(item.productId);
      if (!line) this.cart.remove(item.productId);
      else if (line.quantity !== item.quantity) this.cart.set(item.productId, line.quantity);
      else continue;
      this.reconciled = true;
    }
  }

  private reconciled = false;

  private warningText(code: string, productId: number | null, quote: Quote): string {
    const line = quote.lines.find(l => l.productId === productId);
    const key = `cart.warning.${code}` as TextKey;
    return this.i18n.t(key, { name: line?.name ?? '', n: line?.maxQuantity ?? '' }) || this.i18n.t('error.unknown');
  }
}
