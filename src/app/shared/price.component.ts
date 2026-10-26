import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../core/i18n/i18n.service';
import { StoreConfig } from '../core/store/store-config';

/** A unit price as the buyer pays it: VAT included, in fiat, sats or both as the store's Bitcoin settings say. */
@Component({
  selector: 'app-price',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="price">{{ text() }}</span>
    @if (showVat() && vatNote()) {
      <span class="price__vat">{{ vatNote() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 8px;
    }
    .price {
      font-weight: 600;
    }
    .price__vat {
      font-size: 0.8rem;
      color: var(--muted);
    }
  `,
})
export class PriceComponent {
  /** One unit before VAT, as the API gives it. */
  readonly amount = input.required<number>();
  readonly sats = input<number | null>(null);
  readonly showVat = input(false);

  private readonly config = inject(StoreConfig);
  private readonly i18n = inject(I18n);

  readonly text = computed(() => this.config.price(this.amount(), this.sats()));
  readonly vatNote = computed(() => {
    const vat = this.config.store()?.vat;
    return vat?.charged ? this.i18n.t('price.inclVat', { rate: vat.rate }) : '';
  });
}
