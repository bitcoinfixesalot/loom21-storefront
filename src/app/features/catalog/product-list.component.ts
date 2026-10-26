import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Paged, ProductSort, ProductSummary } from '../../core/api/types';
import { TPipe } from '../../core/i18n/i18n.service';
import { ProductCardComponent } from '../../shared/product-card.component';

export const PAGE_SIZE = 24;
export const SORTS: ProductSort[] = ['newest', 'name', 'price_asc', 'price_desc'];

export function readSort(value: string | null): ProductSort {
  return (SORTS as string[]).includes(value ?? '') ? (value as ProductSort) : 'newest';
}

export function readPage(value: string | null): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 1 ? n : 1;
}

/** A page of products with its sort and pager; both keep the other query parameters (q) as they are. */
@Component({
  selector: 'app-product-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, ProductCardComponent],
  template: `
    @let p = paged();
    <div class="list-bar">
      <span class="muted">{{ 'catalog.count' | t: { n: p.totalCount } }}</span>
      <label class="sort">
        {{ 'catalog.sort' | t }}
        <select [value]="sort()" (change)="setSort($any($event.target).value)" data-testid="sort">
          @for (s of sorts; track s) {
            <option [value]="s" [selected]="s === sort()">{{ 'catalog.sort.' + s | t }}</option>
          }
        </select>
      </label>
    </div>
    @if (p.items.length) {
      <div class="grid">
        @for (item of p.items; track item.id; let i = $index) {
          <app-product-card [product]="item" [eager]="i < 4" />
        }
      </div>
    } @else {
      <p class="muted">{{ 'catalog.empty' | t }}</p>
    }
    @if (pages() > 1) {
      <nav class="pager" aria-label="pagination">
        @if (p.page > 1) {
          <a [routerLink]="[]" [queryParams]="{ page: p.page - 1 === 1 ? null : p.page - 1 }" queryParamsHandling="merge" rel="prev"
            >← {{ 'catalog.prev' | t }}</a
          >
        }
        <span>{{ 'catalog.page' | t: { page: p.page, pages: pages() } }}</span>
        @if (p.page < pages()) {
          <a [routerLink]="[]" [queryParams]="{ page: p.page + 1 }" queryParamsHandling="merge" rel="next">{{ 'catalog.next' | t }} →</a>
        }
      </nav>
    }
  `,
})
export class ProductListComponent {
  readonly paged = input.required<Paged<ProductSummary>>();
  readonly sort = input<ProductSort>('newest');

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly sorts = SORTS;
  readonly pages = computed(() => Math.max(1, Math.ceil(this.paged().totalCount / Math.max(1, this.paged().pageSize))));

  setSort(sort: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: sort === 'newest' ? null : sort, page: null },
      queryParamsHandling: 'merge',
    });
  }
}
