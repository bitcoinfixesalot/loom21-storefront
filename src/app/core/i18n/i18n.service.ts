import { Injectable, Pipe, PipeTransform, inject } from '@angular/core';
import { ApiError, KNOWN_ERRORS } from '../api/api-error';
import { TENANT } from '../tenant/tenant';
import bg from './bg.json';
import en from './en.json';

export type Language = 'en' | 'bg';
export type TextKey = keyof typeof en;
export type TextParams = Record<string, string | number | null | undefined>;

const TEXTS: Record<Language, Record<TextKey, string>> = { en, bg };

/** Fills {name} placeholders. */
export function format(text: string, params: TextParams = {}): string {
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}

/**
 * The store's texts at runtime, in its one language (the storefront's, from the API), so one build serves stores in
 * different languages. `scripts/check-i18n.mjs` keeps en.json and bg.json to the same keys.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly language: Language = inject(TENANT).language === 'bg' ? 'bg' : 'en';
  /** For Intl number and date formats. */
  readonly locale = this.language === 'bg' ? 'bg-BG' : 'en-GB';

  t(key: TextKey, params?: TextParams): string {
    return format(TEXTS[this.language][key] ?? TEXTS.en[key] ?? key, params);
  }

  /** What the buyer reads for a failed call: never the API's code or its English detail. */
  error(error: unknown): string {
    const e = ApiError.from(error);
    if (e.code === 'insufficient_stock') return this.t('error.insufficient_stock', { n: e.problem?.lines?.[0]?.available ?? 0 });
    return (KNOWN_ERRORS as readonly string[]).includes(e.code) ? this.t(`error.${e.code}` as TextKey) : this.t('error.unknown');
  }
}

/**
 * {{ 'cart.title' | t }} or {{ 'catalog.count' | t: { n: 3 } }}. Takes any string so templates can build a key
 * ('checkout.method.' + m); a missing key shows as itself, and check-i18n.mjs keeps the two files in step.
 */
@Pipe({ name: 't' })
export class TPipe implements PipeTransform {
  private readonly i18n = inject(I18n);

  transform(key: TextKey | (string & {}), params?: TextParams): string {
    return this.i18n.t(key as TextKey, params);
  }
}
