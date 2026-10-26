import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, map, of, startWith, switchMap, tap } from 'rxjs';
import { StorefrontApi } from '../../core/api/storefront-api';
import type { Paged, ProductSort, ProductSummary } from '../../core/api/types';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { SeoService } from '../../core/seo/seo.service';
import { StoreConfig } from '../../core/store/store-config';
import { PAGE_SIZE, ProductListComponent, readPage, readSort } from './product-list.component';

interface State {
  q: string;
  sort: ProductSort;
  products: Paged<ProductSummary> | null;
}

/** /search?q=: products whose name has the text; no text lists them all. Never indexed. */
@Component({
  selector: 'app-search-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, ProductListComponent],
  template: `
    @let s = state();
    <div class="container section">
      <h1>{{ s.q ? ('search.results' | t: { q: s.q }) : ('home.all' | t) }}</h1>
      <form class="search search--page" role="search" action="/search" method="get">
        <input
          type="search"
          name="q"
          [value]="s.q"
          [placeholder]="'search.placeholder' | t"
          [attr.aria-label]="'nav.search' | t"
          maxlength="100"
        />
        <button type="submit" class="button">{{ 'nav.search' | t }}</button>
      </form>
      @if (s.products; as products) {
        @if (s.q && products.totalCount === 0) {
          <p class="muted">{{ 'search.none' | t: { q: s.q } }}</p>
        } @else {
          <app-product-list [paged]="products" [sort]="s.sort" />
        }
      }
    </div>
  `,
})
export class SearchPage {
  private readonly api = inject(StorefrontApi);
  private readonly seo = inject(SeoService);
  private readonly i18n = inject(I18n);
  private readonly config = inject(StoreConfig);

  readonly state = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(
      map(query => ({
        q: (query.get('q') ?? '').trim().slice(0, 100),
        sort: readSort(query.get('sort')),
        page: readPage(query.get('page')),
      })),
      tap(({ q }) =>
        this.seo.set({
          title: `${q ? this.i18n.t('search.results', { q }) : this.i18n.t('home.all')} | ${this.config.store()?.name ?? ''}`,
          noindex: true,
        }),
      ),
      switchMap(({ q, sort, page }) =>
        this.api.products({ q, sort, page, pageSize: PAGE_SIZE }).pipe(
          map((products): State => ({ q, sort, products })),
          catchError(() => of<State>({ q, sort, products: null })),
          startWith<State>({ q, sort, products: null }),
        ),
      ),
    ),
    { initialValue: { q: '', sort: 'newest', products: null } as State },
  );
}
