import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TPipe } from './core/i18n/i18n.service';
import { StoreConfig } from './core/store/store-config';
import { FooterComponent } from './shared/layout/footer.component';
import { HeaderComponent } from './shared/layout/header.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, TPipe],
  template: `
    @if (config.store()) {
      <app-header />
      <main id="main" tabindex="-1">
        <router-outlet />
      </main>
      @defer (hydrate on viewport) {
        <app-footer />
      }
    } @else {
      <main id="main" class="container section">
        <h1>{{ 'error.storefront_unavailable' | t }}</h1>
      </main>
    }
  `,
})
export class App {
  readonly config = inject(StoreConfig);
}
