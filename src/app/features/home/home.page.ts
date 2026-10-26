import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { StorefrontApi } from '../../core/api/storefront-api';
import type { Category, ProductSummary } from '../../core/api/types';
import { TPipe } from '../../core/i18n/i18n.service';
import { SeoService } from '../../core/seo/seo.service';
import { StoreConfig } from '../../core/store/store-config';
import { ProductCardComponent } from '../../shared/product-card.component';

interface HomeData {
  categories: Category[];
  newest: ProductSummary[];
}

/** The store's front page: its name and description, its categories and the 12 newest products. */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, ProductCardComponent],
  template: `
    @let store = config.store();
    <section class="hero container">
      <h1>{{ store?.name }}</h1>
      @if (store?.seoDescription) {
        <p class="hero__text">{{ store!.seoDescription }}</p>
      }
    </section>

    @if (data(); as d) {
      @if (d.categories.length) {
        <section class="container section">
          <h2 class="section__title">{{ 'home.categories' | t }}</h2>
          <ul class="chips">
            @for (c of d.categories; track c.id) {
              <li>
                <a class="chip" [routerLink]="['/c', c.slug]">{{ c.name }}</a>
              </li>
            }
          </ul>
        </section>
      }
      <section class="container section">
        <h2 class="section__title">{{ 'home.newest' | t }}</h2>
        @if (d.newest.length) {
          <div class="grid">
            @for (p of d.newest; track p.id; let i = $index) {
              <app-product-card [product]="p" [eager]="i < 4" />
            }
          </div>
          <p class="more">
            <a routerLink="/search">{{ 'home.all' | t }} →</a>
          </p>
        } @else {
          <p class="muted">{{ 'home.empty' | t }}</p>
        }
      </section>
    }
  `,
})
export class HomePage {
  readonly config = inject(StoreConfig);
  private readonly api = inject(StorefrontApi);

  readonly data = toSignal<HomeData>(
    forkJoin({
      categories: this.api.categories().pipe(catchError(() => of([] as Category[]))),
      newest: this.api.products({ sort: 'newest', pageSize: 12 }).pipe(
        map(page => page.items),
        catchError(() => of([] as ProductSummary[])),
      ),
    }),
  );

  constructor() {
    const store = this.config.store();
    inject(SeoService).set({
      title: store?.seoTitle || store?.name || '',
      description: store?.seoDescription,
      path: '/',
      image: store?.logoUrl,
    });
  }
}
