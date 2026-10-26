import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartStore } from '../../core/cart/cart.store';
import { CheckoutStore } from '../../core/checkout/checkout.store';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { SeoService } from '../../core/seo/seo.service';
import { StoreConfig } from '../../core/store/store-config';

/** /checkout/complete (rendered in the browser): the order number, where the receipt went, and back to the store. */
@Component({
  selector: 'app-complete-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe],
  template: `
    <div class="container section complete" data-testid="complete">
      <h1>{{ 'complete.title' | t }}</h1>
      @if (order; as o) {
        @if (o.orderNumber) {
          <p data-testid="order-number">{{ 'complete.paid' | t: { order: o.orderNumber } }}</p>
        }
        @if (o.buyerEmail) {
          <p class="muted">{{ 'complete.receiptTo' | t: { email: o.buyerEmail } }}</p>
        }
        @if (o.receiptUrl) {
          <p>
            <a [href]="o.receiptUrl" target="_blank" rel="noopener">{{ 'complete.receipt' | t }}</a>
          </p>
        }
      }
      <a class="button button--primary" routerLink="/">{{ 'complete.continue' | t }}</a>
    </div>
  `,
})
export class CompletePage {
  readonly order = inject(CheckoutStore).completed();

  constructor() {
    // Paid: the cart's items are bought. (Opened without an order, the cart stays.)
    if (this.order) inject(CartStore).clear();
    const i18n = inject(I18n);
    inject(SeoService).set({ title: `${i18n.t('complete.title')} | ${inject(StoreConfig).store()?.name ?? ''}`, noindex: true });
  }
}
