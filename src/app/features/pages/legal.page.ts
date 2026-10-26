import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, map, of, startWith, switchMap, tap } from 'rxjs';
import { StorefrontApi } from '../../core/api/storefront-api';
import type { Page } from '../../core/api/types';
import { SeoService } from '../../core/seo/seo.service';
import { StoreConfig } from '../../core/store/store-config';
import { MarkdownPipe } from '../../shared/markdown.pipe';
import { NotFoundPage } from '../not-found/not-found.page';

type State = { kind: 'loading' } | { kind: 'missing' } | { kind: 'ready'; page: Page };

/** /pages/:type: the store's about, terms, privacy, returns, shipping or seller details page, from its Markdown. */
@Component({
  selector: 'app-legal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarkdownPipe, NotFoundPage],
  template: `
    @let s = state();
    @switch (s.kind) {
      @case ('ready') {
        <article class="container section prose prose--page" [innerHTML]="body(s.page) | markdown" data-testid="page-body"></article>
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
export class LegalPage {
  private readonly api = inject(StorefrontApi);
  private readonly seo = inject(SeoService);
  private readonly config = inject(StoreConfig);

  readonly state = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map(params => params.get('type') ?? ''),
      switchMap(type =>
        this.api.page(type).pipe(
          map((page): State => ({ kind: 'ready', page })),
          catchError(() => of<State>({ kind: 'missing' })),
          tap(state => {
            if (state.kind === 'ready')
              this.seo.set({ title: `${state.page.title} | ${this.config.store()?.name ?? ''}`, path: `/pages/${state.page.type}` });
          }),
          startWith<State>({ kind: 'loading' }),
        ),
      ),
    ),
    { initialValue: { kind: 'loading' } as State },
  );

  /** The page's own heading when its Markdown has none. */
  body(page: Page): string {
    return /^\s*#\s/.test(page.bodyMarkdown) ? page.bodyMarkdown : `# ${page.title}\n\n${page.bodyMarkdown}`;
  }
}
