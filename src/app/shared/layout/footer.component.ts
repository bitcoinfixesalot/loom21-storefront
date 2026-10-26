import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TPipe } from '../../core/i18n/i18n.service';
import { StoreConfig } from '../../core/store/store-config';

/** The store's pages, contact, social links, footer text and, when the plan shows it, "Powered by Loom21". */
@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe],
  template: `
    @let store = config.store();
    <footer class="footer">
      <div class="container footer__inner">
        @if (config.pages().length) {
          <nav [attr.aria-label]="'footer.pages' | t">
            <h2 class="footer__title">{{ 'footer.pages' | t }}</h2>
            <ul>
              @for (p of config.pages(); track p.type) {
                <li>
                  <a [routerLink]="['/pages', p.type]">{{ p.title }}</a>
                </li>
              }
            </ul>
          </nav>
        }
        @if (store?.supportEmail) {
          <div>
            <h2 class="footer__title">{{ 'footer.contact' | t }}</h2>
            <a [href]="'mailto:' + store!.supportEmail">{{ store!.supportEmail }}</a>
          </div>
        }
        @if (social().length) {
          <div>
            <h2 class="footer__title">{{ 'footer.social' | t }}</h2>
            <ul>
              @for (link of social(); track link.url) {
                <li>
                  <a [href]="link.url" rel="noopener me" target="_blank">{{ link.label }}</a>
                </li>
              }
            </ul>
          </div>
        }
      </div>
      <div class="container footer__bottom">
        @if (store?.footerText) {
          <p class="footer__text">{{ store!.footerText }}</p>
        }
        @if (store?.showPoweredBy) {
          <a class="powered" href="https://loom21.com/?utm_source=storefront" rel="noopener" data-testid="powered-by">{{
            'footer.poweredBy' | t
          }}</a>
        }
      </div>
    </footer>
  `,
})
export class FooterComponent {
  readonly config = inject(StoreConfig);

  /** The social links with a readable name: the site's, without www. (instagram.com, x.com…). */
  readonly social = computed(() =>
    (this.config.store()?.socialLinks ?? [])
      .filter(url => url.startsWith('https://'))
      .map(url => {
        try {
          return { url, label: new URL(url).hostname.replace(/^www\./, '') };
        } catch {
          return null;
        }
      })
      .filter((l): l is { url: string; label: string } => !!l),
  );
}
