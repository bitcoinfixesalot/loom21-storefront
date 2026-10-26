import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StorefrontApi } from '../api/storefront-api';
import type { PageSummary, Store } from '../api/types';
import { formatPrice, priceDisplay, withVat } from '../format';
import { I18n } from '../i18n/i18n.service';
import { TENANT } from '../tenant/tenant';

/**
 * The store (GET /store) and its published pages (GET /pages), loaded once before the first render
 * (app.config.ts). Sets the accent colour as the --accent CSS variable on <html>, on the server too.
 */
@Injectable({ providedIn: 'root' })
export class StoreConfig {
  private readonly api = inject(StorefrontApi);
  private readonly document = inject(DOCUMENT);
  private readonly i18n = inject(I18n);
  /** The store's own address, for absolute URLs (canonical, JSON-LD). */
  readonly baseUrl = inject(TENANT).baseUrl;
  private readonly tenantId = inject(TENANT).id;

  readonly store = signal<Store | null>(null);
  readonly pages = signal<PageSummary[]>([]);
  readonly display = computed(() => priceDisplay(this.store()?.bitcoin ?? { hidePrices: false, bitcoinOnly: false }));
  readonly canOrder = computed(() => !!this.store()?.checkoutAvailable);

  async load(): Promise<void> {
    if (!this.tenantId) return; // the build reading the routes: no store
    const [store, pages] = await Promise.all([
      firstValueFrom(this.api.store()),
      firstValueFrom(this.api.pages()).catch(() => [] as PageSummary[]),
    ]);
    this.store.set(store);
    this.pages.set(pages);
    const accent = store.accentColor;
    if (accent && /^#[0-9a-f]{6}$/i.test(accent)) this.document.documentElement.style.setProperty('--accent', accent);
  }

  /** A unit price as the buyer pays it (VAT included), in the shop's display. Sats are scaled with the VAT too. */
  price(amount: number, sats: number | null | undefined): string {
    const store = this.store();
    if (!store) return '';
    const gross = withVat(amount, store.vat);
    const grossSats = sats == null ? null : withVat(sats, store.vat);
    return formatPrice(this.display(), gross, store.currency, grossSats, this.i18n.locale);
  }

  /** An amount that already includes VAT (a quote's total). */
  amount(amount: number, sats?: number | null): string {
    const store = this.store();
    return store ? formatPrice(this.display(), amount, store.currency, sats, this.i18n.locale) : '';
  }

  /** The price with VAT, as a number (for JSON-LD). */
  gross(amount: number): number {
    const store = this.store();
    return store ? Math.round(withVat(amount, store.vat) * 100) / 100 : amount;
  }
}
