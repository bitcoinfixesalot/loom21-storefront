import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { CartItem } from '../api/types';
import { TENANT } from '../tenant/tenant';

/**
 * The cart: product ids and quantities only, in localStorage per store (two stores in one browser never mix). Names
 * and prices always come from POST /quotes, so a stale cart can never show a wrong price at checkout. On the server
 * it is always empty.
 */
@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly storageKey = `l21:cart:${inject(TENANT).id}`;

  readonly items = signal<CartItem[]>(this.load());
  readonly count = computed(() => this.items().reduce((n, i) => n + i.quantity, 0));

  constructor() {
    effect(() => {
      const items = this.items();
      if (!this.isBrowser) return;
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(items));
      } catch {
        // Private mode or storage off: the cart lasts as long as the tab.
      }
    });
    if (this.isBrowser) {
      // Another tab changed the cart.
      window.addEventListener('storage', e => {
        if (e.key === this.storageKey) this.items.set(this.load());
      });
    }
  }

  quantityOf(productId: number): number {
    return this.items().find(i => i.productId === productId)?.quantity ?? 0;
  }

  add(productId: number, quantity = 1, max = 10): void {
    this.items.update(list => {
      const existing = list.find(i => i.productId === productId);
      return existing
        ? list.map(i => (i.productId === productId ? { ...i, quantity: Math.min(i.quantity + quantity, max) } : i))
        : [...list, { productId, quantity: Math.min(Math.max(1, quantity), max) }];
    });
  }

  set(productId: number, quantity: number): void {
    if (quantity <= 0) return this.remove(productId);
    this.items.update(list => list.map(i => (i.productId === productId ? { ...i, quantity } : i)));
  }

  remove(productId: number): void {
    this.items.update(list => list.filter(i => i.productId !== productId));
  }

  clear(): void {
    this.items.set([]);
  }

  private load(): CartItem[] {
    if (!this.isBrowser) return [];
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(this.storageKey) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((i): i is CartItem => Number.isInteger(i?.productId) && Number.isInteger(i?.quantity) && i.quantity > 0)
        .slice(0, 50)
        .map(i => ({ productId: i.productId, quantity: i.quantity }));
    } catch {
      return [];
    }
  }
}
