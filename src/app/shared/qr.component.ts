import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { qrSvg } from './qr';

/** A QR code as inline SVG, made in the browser from the invoice or address (no image request, no library). */
@Component({
  selector: 'app-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="qr" [innerHTML]="svg()"></div>`,
  styles: `
    .qr {
      width: min(280px, 100%);
      aspect-ratio: 1;
      margin: 0 auto;
      padding: 8px;
      background: #fff;
      border-radius: 12px;
    }
    .qr ::ng-deep svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class QrComponent {
  readonly text = input.required<string>();
  readonly label = input.required<string>();
  private readonly sanitizer = inject(DomSanitizer);

  // Our own SVG from our own encoder (text is escaped in it), so it is trusted; Angular's sanitiser would drop SVG.
  readonly svg = computed(() => this.sanitizer.bypassSecurityTrustHtml(qrSvg(this.text(), this.label())));
}
