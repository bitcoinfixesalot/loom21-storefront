import type { components } from './schema';
import type * as T from './types';

/**
 * Compile-time only: each hand-written type in types.ts has exactly the fields of its generated schema type. After
 * `npm run api:fetch && npm run api:types`, a field the API added or dropped fails `npm run lint` and the build here.
 */
type Schemas = components['schemas'];
type SameKeys<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never] ? true : false;
type Assert<T extends true> = T;

export type SchemaCheck = [
  Assert<SameKeys<T.Store, Schemas['StoreResponse']>>,
  Assert<SameKeys<T.ShippingMethod, Schemas['ShippingMethodResponse']>>,
  Assert<SameKeys<T.Category, Schemas['CategoryResponse']>>,
  Assert<SameKeys<T.ProductImage, Schemas['ProductImageResponse']>>,
  Assert<SameKeys<T.Availability, Schemas['AvailabilityResponse']>>,
  Assert<SameKeys<T.ProductSummary, Schemas['ProductSummaryResponse']>>,
  Assert<SameKeys<T.Product, Schemas['ProductResponse']>>,
  Assert<SameKeys<T.PriceTier, Schemas['PriceTierResponse']>>,
  Assert<SameKeys<T.CustomField, Schemas['CustomFieldResponse']>>,
  Assert<SameKeys<T.Paged<T.ProductSummary>, Schemas['ProductSummaryResponsePagedResponse']>>,
  Assert<SameKeys<T.Sitemap, Schemas['SitemapResponse']>>,
  Assert<SameKeys<T.SitemapEntry, Schemas['SitemapEntryResponse']>>,
  Assert<SameKeys<T.PageSummary, Schemas['PageSummaryResponse']>>,
  Assert<SameKeys<T.Page, Schemas['PageResponse']>>,
  Assert<SameKeys<T.CartItem, Schemas['CartItemRequest']>>,
  Assert<SameKeys<T.QuoteRequest, Schemas['QuoteRequest']>>,
  Assert<SameKeys<T.Quote, Schemas['QuoteResponse']>>,
  Assert<SameKeys<T.QuoteLine, Schemas['QuoteLineResponse']>>,
  Assert<SameKeys<T.QuoteWarning, Schemas['QuoteWarningResponse']>>,
  Assert<SameKeys<T.BuyerAddress, Schemas['BuyerAddressRequest']>>,
  Assert<SameKeys<T.Buyer, Schemas['BuyerRequest']>>,
  Assert<SameKeys<T.CheckoutRequest, Schemas['CheckoutRequest']>>,
  Assert<SameKeys<T.Checkout, Schemas['CheckoutResponse']>>,
  Assert<SameKeys<T.Payment, Schemas['PaymentResponse']>>,
  Assert<SameKeys<T.CheckoutStatus, Schemas['CheckoutStatusResponse']>>,
];
