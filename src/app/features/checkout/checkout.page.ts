import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription, startWith } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { StorefrontApi } from '../../core/api/storefront-api';
import type { CheckoutRequest, PaymentMethodName, Quote } from '../../core/api/types';
import { CartStore } from '../../core/cart/cart.store';
import { CheckoutStore } from '../../core/checkout/checkout.store';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { SeoService } from '../../core/seo/seo.service';
import { StoreConfig } from '../../core/store/store-config';

/** EU and EEA countries, then a few common others; names in the store's language (Intl.DisplayNames). */
const COUNTRIES = [
  'BG',
  'AT',
  'BE',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
  'CH',
  'GB',
  'RS',
  'MK',
  'TR',
  'US',
  'CA',
];

/**
 * /checkout (rendered in the browser): the buyer's details, delivery and payment method, then POST /checkouts (which
 * holds the stock) and the payment. A card payment opens its tab inside the click, before any await, so popup
 * blockers allow it; the hosted page is loaded into it once the API answers.
 */
@Component({
  selector: 'app-checkout-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TPipe],
  templateUrl: './checkout.page.html',
})
export class CheckoutPage {
  readonly config = inject(StoreConfig);
  readonly cart = inject(CartStore);
  readonly checkoutStore = inject(CheckoutStore);
  private readonly api = inject(StorefrontApi);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  private readonly fb = inject(FormBuilder);

  readonly methods = computed(() => (this.config.store()?.paymentMethods ?? []) as PaymentMethodName[]);
  readonly shippingMethods = computed(() => this.config.store()?.shippingMethods ?? []);
  readonly termsPage = computed(() => this.config.pages().some(p => p.type === 'terms'));
  readonly countries = (() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([this.i18n.locale], { type: 'region' });
    } catch {
      names = null;
    }
    return COUNTRIES.map(code => ({ code, name: names?.of(code) ?? code }));
  })();

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(256)]],
    name: ['', [Validators.maxLength(200)]],
    phone: ['', [Validators.maxLength(50)]],
    shippingMethodId: [null as number | null],
    line1: ['', [Validators.maxLength(200)]],
    line2: ['', [Validators.maxLength(200)]],
    city: ['', [Validators.maxLength(100)]],
    region: ['', [Validators.maxLength(100)]],
    postcode: ['', [Validators.maxLength(20)]],
    country: [this.i18n.language === 'bg' ? 'BG' : ''],
    note: ['', [Validators.maxLength(1000)]],
    method: ['' as PaymentMethodName | ''],
  });

  private readonly shippingId = toSignal(this.form.controls.shippingMethodId.valueChanges.pipe(startWith(null as number | null)), {
    initialValue: null,
  });
  readonly needsAddress = computed(() => this.shippingMethods().find(m => m.id === this.shippingId())?.requiresAddress ?? false);

  readonly quote = signal<Quote | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);
  private quoting: Subscription | null = null;

  constructor() {
    inject(SeoService).set({ title: `${this.i18n.t('checkout.title')} | ${this.config.store()?.name ?? ''}`, noindex: true });
    const methods = this.methods();
    if (methods.length) this.form.controls.method.setValue(methods[0]);
    const shipping = this.shippingMethods();
    if (shipping.length === 1) this.form.controls.shippingMethodId.setValue(shipping[0].id);

    effect(() => this.price(this.cart.items(), this.shippingId()));
  }

  private price(items: { productId: number; quantity: number }[], shippingMethodId: number | null): void {
    this.quoting?.unsubscribe();
    if (!items.length) return this.quote.set(null);
    this.quoting = this.api.quote({ items, shippingMethodId }).subscribe({
      next: quote => this.quote.set(quote),
      error: e => this.error.set(this.i18n.error(e)),
    });
  }

  invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  /** Address fields required only for a delivery that needs one; a delivery choice only when the store offers any. */
  private validate(): boolean {
    const c = this.form.controls;
    const required = (name: 'line1' | 'city' | 'country', on: boolean) => {
      c[name].setValidators(on ? [Validators.required, Validators.maxLength(name === 'country' ? 2 : 200)] : [Validators.maxLength(200)]);
      c[name].updateValueAndValidity();
    };
    const address = this.needsAddress();
    required('line1', address);
    required('city', address);
    required('country', address);
    c.shippingMethodId.setValidators(this.shippingMethods().length ? [Validators.required] : []);
    c.shippingMethodId.updateValueAndValidity();
    c.method.setValidators([Validators.required]);
    c.method.updateValueAndValidity();
    this.form.markAllAsTouched();
    return this.form.valid;
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.busy() || !this.validate() || !this.cart.items().length) {
      if (this.form.invalid) this.error.set(this.i18n.t('error.validation_failed'));
      return;
    }
    const v = this.form.getRawValue();
    const method = v.method as PaymentMethodName;
    // Opened inside the click, before any await: a popup opened later is blocked.
    const popup = method === 'card' ? window.open('about:blank', '_blank') : null;

    const request: CheckoutRequest = {
      items: this.cart.items(),
      shippingMethodId: v.shippingMethodId,
      note: v.note.trim() || null,
      buyer: {
        email: v.email.trim(),
        name: v.name.trim() || null,
        phone: v.phone.trim() || null,
        shippingAddress: this.needsAddress()
          ? {
              line1: v.line1.trim(),
              line2: v.line2.trim() || null,
              city: v.city.trim(),
              region: v.region.trim() || null,
              postcode: v.postcode.trim() || null,
              country: v.country,
            }
          : null,
      },
    };

    this.busy.set(true);
    try {
      await this.checkoutStore.start(request);
      const payment = await this.checkoutStore.pay(method);
      if (popup && payment.hostedPaymentUrl) popup.location.href = payment.hostedPaymentUrl;
      else popup?.close();
      await this.router.navigate(['/checkout/pay'], { state: { popupBlocked: method === 'card' && !popup } });
    } catch (e) {
      popup?.close();
      const error = ApiError.from(e);
      if (error.code === 'insufficient_stock') this.applyStock(error);
      this.error.set(this.i18n.error(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** "Only 2 left": the cart takes what is available, and drops what is gone. */
  private applyStock(error: ApiError): void {
    for (const line of error.problem?.lines ?? []) {
      const available = Math.floor(line.available);
      if (available > 0) this.cart.set(line.productId, available);
      else this.cart.remove(line.productId);
    }
  }
}
