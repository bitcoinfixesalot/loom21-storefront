import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of, startWith, switchMap, tap } from 'rxjs';
import { StorefrontApi } from '../../core/api/storefront-api';
import type { Category, Paged, ProductSort, ProductSummary } from '../../core/api/types';
import { responseStatus } from '../../core/http-status';
import { TPipe } from '../../core/i18n/i18n.service';
import { SeoService } from '../../core/seo/seo.service';
import { StoreConfig } from '../../core/store/store-config';
import { NotFoundPage } from '../not-found/not-found.page';
import { PAGE_SIZE, ProductListComponent, readPage, readSort } from './product-list.component';

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'ready'; category: Category; products: Paged<ProductSummary>; sort: ProductSort };

/** /c/:slug: one category's products, 24 a page, sorted. An unknown category is a 404. */
@Component({
  selector: 'app-category-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, ProductListComponent, NotFoundPage],
  template: `
    @let s = state();
    @switch (s.kind) {
      @case ('ready') {
        <div class="container section">
          <nav class="crumbs" aria-label="breadcrumb">
            <a routerLink="/">{{ 'nav.home' | t }}</a> / <span aria-current="page">{{ s.category.name }}</span>
          </nav>
          <h1>{{ s.category.name }}</h1>
          <app-product-list [paged]="s.products" [sort]="s.sort" />
        </div>
      }
      @case ('missing') {
        <app-not-found-page />
      }
      @default {
        <div class="container section" aria-busy="true"></div>
      }
    }
  `,
})
export class CategoryPage {
  private readonly api = inject(StorefrontApi);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly config = inject(StoreConfig);
  private readonly status = responseStatus();

  readonly state = toSignal(
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
      map(([params, query]) => ({ slug: params.get('slug') ?? '', page: readPage(query.get('page')), sort: readSort(query.get('sort')) })),
      switchMap(({ slug, page, sort }) =>
        combineLatest([this.api.categories(), this.api.products({ category: slug, sort, page, pageSize: PAGE_SIZE })]).pipe(
          map(([categories, products]): State => {
            const category = categories.find(c => c.slug === slug);
            return category ? { kind: 'ready', category, products, sort } : { kind: 'missing' };
          }),
          catchError(() => of<State>({ kind: 'missing' })),
          tap(state => this.describe(state, slug, page)),
          startWith<State>({ kind: 'loading' }),
        ),
      ),
    ),
    { initialValue: { kind: 'loading' } as State },
  );

  private describe(state: State, slug: string, page: number): void {
    if (state.kind === 'missing') {
      this.status(404);
      return;
    }
    if (state.kind !== 'ready') return;
    const store = this.config.store()?.name ?? '';
    this.seo.set({
      title: `${state.category.name} | ${store}`,
      description: this.config.store()?.seoDescription,
      path: `/c/${slug}${page > 1 ? `?page=${page}` : ''}`,
      image: state.category.pictureUrl,
    });
    this.seo.setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: store, item: this.config.baseUrl + '/' },
        { '@type': 'ListItem', position: 2, name: state.category.name, item: `${this.config.baseUrl}/c/${slug}` },
      ],
    });
  }
}
