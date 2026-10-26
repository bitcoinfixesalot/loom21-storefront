import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { StorefrontApi } from '../api/storefront-api';
import type { Checkout, CheckoutRequest, CheckoutStatus, Payment, PaymentMethodName } from '../api/types';
import { newIdempotencyKey } from '../format';
import { TENANT } from '../tenant/tenant';

/** What a reload needs to resume: the checkout and the payment on screen. Never the buyer's details. */
export interface SavedCheckout {
  token: string;
  expiresAt: string;
  total: number;
  currency: string;
  paymentMethods: PaymentMethodName[];
  payment?: Payment;
}

/** A paid order, for the confirmation page after the checkout itself is cleared. */
export interface CompletedOrder {
  orderNumber: string | null;
  buyerEmail: string | null;
  receiptUrl: string | null;
}

export const POLL_MS = 2000;

/**
 * The buyer's checkout: created from the cart, paid, polled every 2 seconds until it ends. Kept in sessionStorage per
 * store, so a reload or a trip to a wallet app resumes it. One Idempotency-Key per attempt: a retry after a network
 * error gets the same checkout, not a second one.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutStore {
  private readonly api = inject(StorefrontApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly key = `l21:checkout:${inject(TENANT).id}`;
  private readonly doneKey = `l21:done:${inject(TENANT).id}`;

  readonly checkout = signal<SavedCheckout | null>(this.read<SavedCheckout>(this.key));
  readonly status = signal<CheckoutStatus | null>(null);

  /** The key of the attempt in progress, kept until it succeeds, so a retry is the same attempt. */
  private attempt: { key: string; body: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private etag: string | null = null;
  private polling = false;
  private readonly onVisibility = () => {
    if (!this.polling) return;
    clearTimeout(this.timer);
    if (!document.hidden) void this.tick();
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  /** Holds the stock and creates the order. Retrying the same request reuses its Idempotency-Key. */
  async start(request: CheckoutRequest): Promise<SavedCheckout> {
    const body = JSON.stringify(request);
    if (this.attempt?.body !== body) this.attempt = { key: newIdempotencyKey(), body };
    const created: Checkout = await firstValueFrom(this.api.createCheckout(request, this.attempt.key));
    this.attempt = null;
    const saved: SavedCheckout = {
      token: created.checkoutToken,
      expiresAt: created.expiresAt,
      total: created.total,
      currency: created.currency,
      paymentMethods: created.paymentMethods,
    };
    this.save(saved);
    this.status.set(null);
    return saved;
  }

  async pay(method: PaymentMethodName): Promise<Payment> {
    const current = this.checkout();
    if (!current) throw new Error('No checkout');
    const payment = await firstValueFrom(this.api.pay(current.token, method));
    // A payment that lasts longer extends the reservation.
    const expiresAt = payment.expiresAt && payment.expiresAt > current.expiresAt ? payment.expiresAt : current.expiresAt;
    this.save({ ...current, payment, expiresAt });
    return payment;
  }

  /** Back to choosing a method (the open invoice just expires on its own). */
  clearPayment(): void {
    const current = this.checkout();
    if (current) this.save({ ...current, payment: undefined });
  }

  async cancel(): Promise<void> {
    const current = this.checkout();
    if (!current) return;
    this.stopPolling();
    try {
      this.status.set(await firstValueFrom(this.api.cancel(current.token)));
    } finally {
      this.forget();
    }
  }

  /** Polls until the checkout is paid, expired or cancelled. Pauses while the tab is hidden. */
  startPolling(onEnd: (status: CheckoutStatus) => void): void {
    if (!this.isBrowser || this.polling || !this.checkout()) return;
    this.polling = true;
    this.etag = null;
    this.onEnd = onEnd;
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.tick();
  }

  stopPolling(): void {
    this.polling = false;
    clearTimeout(this.timer);
    if (this.isBrowser) document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onEnd: (status: CheckoutStatus) => void = () => {};

  private async tick(): Promise<void> {
    const current = this.checkout();
    if (!this.polling || !current) return;
    try {
      const poll = await firstValueFrom(this.api.status(current.token, this.etag));
      if (!this.polling) return;
      this.etag = poll.etag;
      if (poll.status) {
        this.status.set(poll.status);
        if (poll.status.status !== 'awaiting_payment') {
          this.stopPolling();
          if (poll.status.status === 'paid') this.complete(poll.status);
          else this.forget();
          this.onEnd(poll.status);
          return;
        }
      }
    } catch {
      // A failed poll is skipped; the next one tries again.
    }
    clearTimeout(this.timer);
    if (this.polling && !document.hidden) this.timer = setTimeout(() => void this.tick(), POLL_MS);
  }

  /** The order the confirmation page shows, once. */
  completed(): CompletedOrder | null {
    return this.read<CompletedOrder>(this.doneKey);
  }

  private complete(status: CheckoutStatus): void {
    this.write(this.doneKey, { orderNumber: status.orderNumber, buyerEmail: status.buyerEmail, receiptUrl: status.receiptUrl });
    this.forget();
  }

  forget(): void {
    this.checkout.set(null);
    this.remove(this.key);
  }

  private save(saved: SavedCheckout): void {
    this.checkout.set(saved);
    this.write(this.key, saved);
  }

  private read<T>(key: string): T | null {
    if (!this.isBrowser) return null;
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? 'null') as T | null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    if (!this.isBrowser) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage off: the checkout just won't survive a reload.
    }
  }

  private remove(key: string): void {
    if (!this.isBrowser) return;
    try {
      sessionStorage.removeItem(key);
    } catch {
      // As above.
    }
  }
}
