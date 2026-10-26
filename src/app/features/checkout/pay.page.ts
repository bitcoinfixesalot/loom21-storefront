import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { CheckoutStatus, PaymentMethodName } from '../../core/api/types';
import { CartStore } from '../../core/cart/cart.store';
import { CheckoutStore } from '../../core/checkout/checkout.store';
import { formatCountdown, formatSats } from '../../core/format';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { SeoService } from '../../core/seo/seo.service';
import { StoreConfig } from '../../core/store/store-config';
import { QrComponent } from '../../shared/qr.component';

/**
 * /checkout/pay (rendered in the browser), as the Buy button does it: a Lightning invoice as a QR code with "open in
 * wallet", copy and a countdown; on-chain as a bip21 QR code; a card on the hosted pay page in a new tab, with a link
 * when the tab was blocked. Polls every 2 seconds until the order is paid, expired or cancelled. Resumes after a
 * reload from sessionStorage.
 */
@Component({
  selector: 'app-pay-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, QrComponent],
  templateUrl: './pay.page.html',
})
export class PayPage implements OnInit {
  readonly store = inject(CheckoutStore);
  readonly config = inject(StoreConfig);
  private readonly cart = inject(CartStore);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);

  readonly checkout = this.store.checkout;
  readonly payment = computed(() => this.checkout()?.payment ?? null);
  readonly ended = signal<CheckoutStatus | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly copied = signal(false);
  readonly confirmCancel = signal(false);
  /** The checkout page says so (navigation state) when the card payment's tab was blocked. */
  readonly popupBlocked = signal(!!(history.state as { popupBlocked?: boolean } | null)?.popupBlocked);
  private readonly now = signal(Date.now());

  readonly countdown = computed(() => {
    const at = this.payment()?.expiresAt ?? this.checkout()?.expiresAt;
    return at ? formatCountdown(new Date(at).getTime() - this.now()) : '';
  });
  readonly sats = computed(() => {
    const amount = this.payment()?.amountSats;
    return amount ? formatSats(amount, this.i18n.locale) : '';
  });

  constructor() {
    inject(SeoService).set({ title: `${this.i18n.t('pay.title')} | ${this.config.store()?.name ?? ''}`, noindex: true });
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      this.store.stopPolling();
    });
  }

  ngOnInit(): void {
    if (!this.checkout()) return;
    this.store.startPolling(status => this.onEnd(status));
  }

  private onEnd(status: CheckoutStatus): void {
    if (status.status === 'paid') {
      this.cart.clear();
      void this.router.navigate(['/checkout/complete'], { replaceUrl: true });
    } else {
      this.ended.set(status);
    }
  }

  /** A method chosen here (after "Pay another way", or when none was opened yet). */
  async pay(method: PaymentMethodName): Promise<void> {
    if (this.busy()) return;
    const popup = method === 'card' ? window.open('about:blank', '_blank') : null;
    this.busy.set(true);
    this.error.set(null);
    try {
      const payment = await this.store.pay(method);
      if (popup && payment.hostedPaymentUrl) popup.location.href = payment.hostedPaymentUrl;
      else popup?.close();
      this.popupBlocked.set(method === 'card' && !popup);
    } catch (e) {
      popup?.close();
      this.error.set(this.i18n.error(e));
    } finally {
      this.busy.set(false);
    }
  }

  otherWay(): void {
    this.store.clearPayment();
    this.popupBlocked.set(false);
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // No clipboard (http, old browser): the text is on screen to copy by hand.
    }
  }

  async cancel(): Promise<void> {
    this.confirmCancel.set(false);
    try {
      await this.store.cancel();
    } catch (e) {
      this.error.set(this.i18n.error(e));
    }
    this.ended.set({ status: 'cancelled' } as CheckoutStatus);
  }
}
