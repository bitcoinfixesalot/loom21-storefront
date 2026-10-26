import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { scriptJson } from '../json';
import { TENANT } from '../tenant/tenant';

/** Markdown or HTML as plain text, for a meta description: no tags, no link targets, no emphasis marks. */
export function plainText(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SeoTags {
  title: string;
  description?: string | null;
  /** The page's path, e.g. /p/raw-honey; the canonical URL is the store's base URL plus this. */
  path?: string;
  image?: string | null;
  noindex?: boolean;
  type?: 'website' | 'product';
}

/**
 * A page's title, description, canonical URL, Open Graph tags and JSON-LD. Set while the server renders, so they are
 * in the HTML before any script runs.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly baseUrl = inject(TENANT).baseUrl;

  set(tags: SeoTags): void {
    this.title.setTitle(tags.title);
    const description = plainText(tags.description).slice(0, 300);
    this.tag('name', 'description', description);
    this.tag('name', 'robots', tags.noindex ? 'noindex' : null);
    this.tag('property', 'og:title', tags.title);
    this.tag('property', 'og:description', description);
    this.tag('property', 'og:type', tags.type ?? 'website');
    this.tag('property', 'og:image', tags.image ?? null);
    const url = tags.path !== undefined && !tags.noindex ? this.baseUrl + tags.path : null;
    this.tag('property', 'og:url', url);
    this.canonical(url);
    this.setJsonLd(null);
  }

  /** Product, BreadcrumbList… as one <script type="application/ld+json">; null removes it. */
  setJsonLd(data: object | object[] | null): void {
    const head = this.document.head;
    head.querySelector('script[data-l21-ld]')?.remove();
    if (!data) return;
    const script = this.document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-l21-ld', '');
    script.textContent = scriptJson(data);
    head.appendChild(script);
  }

  private tag(attr: 'name' | 'property', key: string, content: string | null): void {
    const selector = `${attr}="${key}"`;
    if (content) this.meta.updateTag({ [attr]: key, content }, selector);
    else this.meta.removeTag(selector);
  }

  private canonical(url: string | null): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!url) {
      link?.remove();
      return;
    }
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', url);
  }
}
