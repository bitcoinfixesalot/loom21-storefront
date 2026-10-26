import type { Store } from './api/types';

/** How prices show: the shop's Bitcoin settings decide (Bitcoin only → sats; hidden Bitcoin prices → fiat). */
export type PriceDisplay = 'fiat' | 'sats' | 'both';

export function priceDisplay(bitcoin: Store['bitcoin']): PriceDisplay {
  if (bitcoin.bitcoinOnly) return 'sats';
  if (bitcoin.hidePrices) return 'fiat';
  return 'both';
}

/** The buyer's price: the API's prices are before VAT, and VAT is added on the total. */
export function withVat(amount: number, vat: Store['vat']): number {
  return vat.charged ? amount * (1 + vat.rate / 100) : amount;
}

export function formatFiat(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatSats(sats: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(Math.round(sats)) + (locale.startsWith('bg') ? ' сат.' : ' sats');
}

/** "€12.00 · 13,450 sats", or one of the two. Sats are left out when the API gave none. */
export function formatPrice(mode: PriceDisplay, amount: number, currency: string, sats: number | null | undefined, locale: string): string {
  const fiat = formatFiat(amount, currency, locale);
  if (sats == null || sats <= 0) return fiat;
  const btc = formatSats(sats, locale);
  return mode === 'fiat' ? fiat : mode === 'sats' ? btc : `${fiat} · ${btc}`;
}

/** A whole quantity between 1 and what one line may order. */
export function clampQuantity(value: unknown, max: number): number {
  const n = Math.floor(Number(value));
  const top = Math.max(1, Math.floor(max) || 1);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), top) : 1;
}

/** "14:05" or "1:02:05" until the given time; "0:00" once it's past. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** A UUID for Idempotency-Key; crypto.randomUUID is missing on plain-http pages. */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
