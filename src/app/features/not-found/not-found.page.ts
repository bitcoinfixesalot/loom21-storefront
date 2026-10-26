import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { responseStatus } from '../../core/http-status';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { SeoService } from '../../core/seo/seo.service';

/** Any unknown address, and products, categories or pages that aren't published: status 404, never indexed. */
@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe],
  template: `
    <div class="container section not-found" data-testid="not-found">
      <h1>{{ 'notFound.title' | t }}</h1>
      <p>{{ 'notFound.text' | t }}</p>
      <a class="button" routerLink="/">{{ 'notFound.home' | t }}</a>
    </div>
  `,
})
export class NotFoundPage {
  constructor() {
    responseStatus()(404);
    inject(SeoService).set({ title: inject(I18n).t('notFound.title'), noindex: true });
  }
}
