/**
 * The Storefront API's models with their real nullability. The generated `schema.d.ts` (npm run api:types) marks every
 * field optional because the API's OpenAPI document doesn't say which are never null; `schema-check.ts` makes the build
 * fail when these and the generated ones stop having the same fields.
 */

export type PaymentMethodName = 'lightning' | 'onchain' | 'card';
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'available';
export type CheckoutState = 'awaiting_payment' | 'paid' | 'expired' | 'cancelled';
export type ProductSort = 'newest' | 'name' | 'price_asc' | 'price_desc';
export type PageType = 'about' | 'terms' | 'privacy' | 'returns' | 'shipping' | 'imprint';

export interface ShippingMethod {
  id: number;
  name: string;
  /** Before VAT. */
  price: number;
  requiresAddress: boolean;
}

export interface Store {
  name: string;
  logoUrl: string | null;
  supportEmail: string | null;
  currency: string;
  paymentMethods: PaymentMethodName[];
  shippingMethods: ShippingMethod[];
  bitcoin: { hidePrices: boolean; bitcoinOnly: boolean };
  vat: { charged: boolean; rate: number };
  stockDisplay: 'bucket' | 'exact' | 'hidden';
  checkoutAvailable: boolean;
  showPoweredBy: boolean;
  language: string;
  seoTitle: string | null;
  seoDescription: string | null;
  accentColor: string | null;
  socialLinks: string[];
  footerText: string | null;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  pictureUrl: string | null;
  updatedAt: string;
}

export interface ProductImage {
  thumb: string;
  normal: string;
  large: string;
}

export interface Availability {
  status: StockStatus;
  /** Only in exact mode. */
  quantity: number | null;
  /** What one line may order. */
  maxQuantity: number;
}

export interface ProductSummary {
  id: number;
  slug: string | null;
  name: string;
  categoryId: string | null;
  brand: string | null;
  measure: string | null;
  isService: boolean;
  /** One unit before VAT. */
  price: number;
  priceSats: number | null;
  currency: string;
  image: ProductImage | null;
  availability: Availability;
  updatedAt: string;
}

export interface PriceTier {
  minQuantity: number;
  unitPrice: number;
}

export interface CustomField {
  name: string;
  label: string;
  value: unknown;
}

export interface Product {
  id: number;
  slug: string | null;
  name: string;
  categoryId: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  measure: string | null;
  isService: boolean;
  price: number;
  priceSats: number | null;
  currency: string;
  priceTiers: PriceTier[];
  images: ProductImage[];
  customFields: CustomField[];
  availability: Availability;
  code: string | null;
  /** Plain text or simple Markdown, as the merchant wrote it. */
  publicDescription: string | null;
  categorySlug: string | null;
  updatedAt: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface SitemapEntry {
  slug: string;
  updatedAt: string;
}

export interface Sitemap {
  categories: SitemapEntry[];
  products: SitemapEntry[];
}

export interface PageSummary {
  type: PageType;
  title: string;
  updatedAt: string;
}

export interface Page extends PageSummary {
  /** Raw Markdown: render it sanitised. */
  bodyMarkdown: string;
}

export interface CartItem {
  productId: number;
  quantity: number;
}

export interface QuoteRequest {
  items: CartItem[];
  shippingMethodId?: number | null;
}

export interface QuoteLine {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  priceSource: string;
  availability: StockStatus;
  maxQuantity: number;
}

export interface QuoteWarning {
  code: 'product_unavailable' | 'quantity_over_max' | 'out_of_stock' | 'shipping_method_unknown' | string;
  productId: number | null;
  message: string;
}

export interface Quote {
  currency: string;
  lines: QuoteLine[];
  subtotal: number;
  shipping: number;
  vat: { rate: number; amount: number };
  total: number;
  totalSats: number | null;
  btcRate: { value: number; source: string; asOf: string } | null;
  warnings: QuoteWarning[];
}

export interface BuyerAddress {
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postcode?: string | null;
  /** ISO 3166-1 alpha-2. */
  country: string;
}

export interface Buyer {
  email: string;
  name?: string | null;
  phone?: string | null;
  shippingAddress?: BuyerAddress | null;
}

export interface CheckoutRequest {
  items: CartItem[];
  shippingMethodId?: number | null;
  buyer: Buyer;
  note?: string | null;
}

export interface Checkout {
  /** Given in this answer only: it reads and pays the checkout. */
  checkoutToken: string;
  checkoutId: string;
  status: CheckoutState;
  orderNumber: string | null;
  expiresAt: string;
  total: number;
  currency: string;
  paymentMethods: PaymentMethodName[];
}

export interface Payment {
  paymentId: string | null;
  method: PaymentMethodName;
  processor: string;
  amountSats: number | null;
  bolt11: string | null;
  onchainAddress: string | null;
  bip21: string | null;
  expiresAt: string | null;
  hostedPaymentUrl: string | null;
}

export interface CheckoutStatus {
  status: CheckoutState;
  orderNumber: string | null;
  expiresAt: string;
  paidAt: string | null;
  method: PaymentMethodName | null;
  total: number;
  currency: string;
  /** Masked: m***@example.com */
  buyerEmail: string | null;
  receiptUrl: string | null;
  hostedPaymentUrl: string | null;
}
