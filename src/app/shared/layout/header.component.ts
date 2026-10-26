import { ChangeDetectionStrategy, Component, afterNextRender, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CartStore } from '../../core/cart/cart.store';
import { TPipe } from '../../core/i18n/i18n.service';
import { StoreConfig } from '../../core/store/store-config';

/** The store's name or logo, a search box (a plain GET form, works without JavaScript) and the cart. */
@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe],
  template: `
    <a class="skip" href="#main">{{ 'nav.skip' | t }}</a>
    <header class="header">
      <div class="header__inner container">
        <a routerLink="/" class="brand">
          @if (config.store()?.logoUrl; as logo) {
            <img [src]="logo" [alt]="config.store()?.name" height="40" />
          } @else {
            <span class="brand__name">{{ config.store()?.name }}</span>
          }
        </a>
        <form class="search" role="search" action="/search" method="get" (submit)="search($event)">
          <input type="search" name="q" [placeholder]="'search.placeholder' | t" [attr.aria-label]="'nav.search' | t" maxlength="100" />
        </form>
        <a
          routerLink="/cart"
          class="cart-link"
          data-testid="cart-link"
          [attr.aria-label]="ready() ? ('nav.cartCount' | t: { n: cart.count() }) : ('nav.cart' | t)"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5.2 4l.9 2H20a1 1 0 0 1 .9 1.4l-3.4 6.5a2 2 0 0 1-1.8 1.1H8.1l-1 1.8V17h12v2H7a2 2 0 0 1-1.8-3l1.4-2.5L3 4H1V2h3.3l.9 2Z"
            />
          </svg>
          <span class="cart-link__text">{{ 'nav.cart' | t }}</span>
          @if (ready() && cart.count() > 0) {
            <span class="cart-link__count" data-testid="cart-count">{{ cart.count() }}</span>
          }
        </a>
      </div>
    </header>
  `,
})
export class HeaderComponent {
  readonly config = inject(StoreConfig);
  readonly cart = inject(CartStore);
  private readonly router = inject(Router);
  /** The cart lives in the browser: its count shows only after hydration, so the server's HTML never disagrees. */
  readonly ready = signal(false);

  constructor() {
    afterNextRender(() => this.ready.set(true));
  }

  search(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const q = (new FormData(form).get('q') ?? '').toString().trim();
    void this.router.navigate(['/search'], { queryParams: q ? { q } : {} });
  }
}
