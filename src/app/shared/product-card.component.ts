import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProductSummary } from '../core/api/types';
import { AvailabilityBadgeComponent } from './availability-badge.component';
import { PriceComponent } from './price.component';

/** A product in a grid: photo, name, price, availability; the whole card links to its page. */
@Component({
  selector: 'app-product-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PriceComponent, AvailabilityBadgeComponent],
  template: `
    @let p = product();
    <a class="card" [routerLink]="link()">
      <div class="card__photo">
        @if (p.image) {
          <img
            [src]="p.image.normal"
            [alt]="p.name"
            width="400"
            height="400"
            [attr.loading]="eager() ? 'eager' : 'lazy'"
            [attr.fetchpriority]="eager() ? 'high' : null"
            decoding="async"
          />
        }
      </div>
      <span class="card__name">{{ p.name }}</span>
      <app-price [amount]="p.price" [sats]="p.priceSats" />
      @if (p.availability.status === 'out_of_stock' || p.availability.status === 'low_stock') {
        <app-availability [availability]="p.availability" />
      }
    </a>
  `,
})
export class ProductCardComponent {
  readonly product = input.required<ProductSummary>();
  /** The first cards on a page load at once (they are the largest paint). */
  readonly eager = input(false);
  readonly link = computed(() => ['/p', this.product().slug ?? String(this.product().id)]);
}
