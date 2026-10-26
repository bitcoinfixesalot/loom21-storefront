import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { Availability } from '../core/api/types';
import { I18n } from '../core/i18n/i18n.service';

/** In stock / Low stock / Sold out, and "3 left" when the store shows exact stock. */
@Component({
  selector: 'app-availability',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="'badge badge--' + availability().status">{{ text() }}</span>`,
})
export class AvailabilityBadgeComponent {
  readonly availability = input.required<Availability>();
  private readonly i18n = inject(I18n);

  readonly text = computed(() => {
    const a = this.availability();
    if (a.status !== 'out_of_stock' && a.quantity != null) return this.i18n.t('stock.left', { n: a.quantity });
    return this.i18n.t(`stock.${a.status}`);
  });
}
