// A fake Loom21 Storefront API (/storefront/v1) for local runs and the Playwright tests: a small bee shop, prices
// before VAT, a checkout that is paid when the test says so. Not the real thing: the real API's rules live in loom21.
//   node e2e/mock-api.mjs            → http://localhost:5179/storefront/v1
// Test controls (not part of the real API):
//   GET  /__test/log       every API request seen, with the headers that matter
//   POST /__test/reset     forget requests, checkouts and overrides
//   POST /__test/config    { storeDisabled, checkoutAvailable, language, bitcoinOnly, hidePrices, stock: { [id]: n } }
//   POST /__test/pay       pays every open checkout
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.MOCK_API_PORT || 5179);
const KEY = process.env.MOCK_API_KEY || 'l21_pk_live_test';
// A second store on the same API, in Bulgarian (the tests run a second store server with it).
const BG_KEY = 'l21_pk_live_bg';
const SECRET = process.env.MOCK_API_SECRET || 'l21_ss_test';
const BASE = '/storefront/v1';
const now = '2026-10-20T10:00:00Z';

const categories = [
  { id: '11111111-1111-1111-1111-111111111111', slug: 'honey', name: 'Honey', pictureUrl: null, updatedAt: now },
  { id: '22222222-2222-2222-2222-222222222222', slug: 'candles', name: 'Candles', pictureUrl: null, updatedAt: now },
];

const image = name => ({
  thumb: `https://picsum.photos/seed/${name}/160/160`,
  normal: `https://picsum.photos/seed/${name}/400/400`,
  large: `https://picsum.photos/seed/${name}/800/800`,
});

const baseProducts = [
  {
    id: 100,
    slug: 'raw-honey',
    name: 'Raw Honey 500g',
    categoryId: categories[0].id,
    category: 'Honey',
    categorySlug: 'honey',
    brand: 'Bee shop',
    model: null,
    measure: 'jar',
    isService: false,
    price: 10,
    code: 'H-500',
    publicDescription: 'Cold-extracted **acacia** honey from the Balkans.\n\n<script>alert(1)</script>',
    stock: 5,
    created: 3,
    customFields: [{ name: 'material', label: 'Jar', value: 'glass' }],
    priceTiers: [{ minQuantity: 3, unitPrice: 8 }],
    images: 2,
  },
  {
    id: 101,
    slug: 'beeswax-candle',
    name: 'Beeswax Candle',
    categoryId: categories[1].id,
    category: 'Candles',
    categorySlug: 'candles',
    brand: null,
    model: null,
    measure: 'pc',
    isService: false,
    price: 6,
    code: null,
    publicDescription: null,
    stock: 1,
    created: 2,
    customFields: [],
    priceTiers: [],
    images: 1,
  },
  {
    id: 102,
    slug: 'hive-inspection',
    name: 'Hive inspection',
    categoryId: null,
    category: null,
    categorySlug: null,
    brand: null,
    model: null,
    measure: 'h',
    isService: true,
    price: 50,
    code: null,
    publicDescription: 'An hour with a beekeeper.',
    stock: null,
    created: 1,
    customFields: [],
    priceTiers: [],
    images: 0,
  },
  {
    id: 103,
    slug: 'sold-out-jar',
    name: 'Chestnut Honey (sold out)',
    categoryId: categories[0].id,
    category: 'Honey',
    categorySlug: 'honey',
    brand: null,
    model: null,
    measure: 'jar',
    isService: false,
    price: 12,
    code: null,
    publicDescription: null,
    stock: 0,
    created: 0,
    customFields: [],
    priceTiers: [],
    images: 1,
  },
];

const pages = [
  { type: 'about', title: 'About us', bodyMarkdown: '# About us\n\nBees since 1990.', updatedAt: now },
  {
    type: 'terms',
    title: 'Terms and conditions',
    bodyMarkdown: '# Terms\n\n1. You may withdraw within **14 days**.\n\n[evil](javascript:alert(1))',
    updatedAt: now,
  },
];

const shippingMethods = [
  { id: 1, name: 'Pickup', price: 0, requiresAddress: false },
  { id: 2, name: 'Courier', price: 5, requiresAddress: true },
];

const BTC_RATE = 100_000; // EUR per BTC
const sats = eur => Math.round((eur / BTC_RATE) * 1e8);

let state;
function reset() {
  state = {
    log: [],
    checkouts: new Map(),
    idempotency: new Map(),
    config: { storeDisabled: false, checkoutAvailable: true, language: 'en', bitcoinOnly: false, hidePrices: false, stock: {} },
  };
}
reset();

const stockOf = p => (p.id in state.config.stock ? state.config.stock[p.id] : p.stock);
const MAX_LINE = 10;

function availability(p) {
  if (p.isService) return { status: 'in_stock', quantity: null, maxQuantity: MAX_LINE };
  const s = stockOf(p);
  if (s <= 0) return { status: 'out_of_stock', quantity: null, maxQuantity: 0 };
  return { status: s <= 2 ? 'low_stock' : 'in_stock', quantity: null, maxQuantity: Math.min(s, MAX_LINE) };
}

function unitPrice(p, quantity) {
  const tier = [...p.priceTiers].reverse().find(t => quantity >= t.minQuantity);
  return tier ? tier.unitPrice : p.price;
}

function summary(p) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    categoryId: p.categoryId,
    brand: p.brand,
    measure: p.measure,
    isService: p.isService,
    price: p.price,
    priceSats: state.config.hidePrices ? null : sats(p.price),
    currency: 'EUR',
    image: p.images ? image(p.slug) : null,
    availability: availability(p),
    updatedAt: now,
  };
}

function full(p) {
  return {
    ...summary(p),
    category: p.category,
    model: p.model,
    priceTiers: p.priceTiers,
    images: Array.from({ length: p.images }, (_, i) => image(`${p.slug}-${i}`)),
    customFields: p.customFields,
    code: p.code,
    publicDescription: p.publicDescription,
    categorySlug: p.categorySlug,
  };
}

function store() {
  const c = state.config;
  return {
    name: 'Bee shop',
    logoUrl: null,
    supportEmail: 'help@bees.example',
    currency: 'EUR',
    paymentMethods: c.bitcoinOnly ? ['lightning', 'onchain'] : ['lightning', 'onchain', 'card'],
    shippingMethods,
    bitcoin: { hidePrices: c.hidePrices, bitcoinOnly: c.bitcoinOnly },
    vat: { charged: true, rate: 20 },
    stockDisplay: 'bucket',
    checkoutAvailable: c.checkoutAvailable,
    showPoweredBy: true,
    language: state.language ?? c.language,
    seoTitle: 'Bee shop: raw honey from the Balkans',
    seoDescription: 'Honey, candles and hive inspections.',
    accentColor: '#c47f00',
    socialLinks: ['https://instagram.com/bees'],
    footerText: 'Bee shop Ltd, Sofia',
  };
}

function quote(items, shippingMethodId) {
  const lines = [];
  const warnings = [];
  for (const item of items) {
    const p = baseProducts.find(x => x.id === item.productId);
    if (!p) {
      warnings.push({ code: 'product_unavailable', productId: item.productId, message: 'Not available.' });
      continue;
    }
    const a = availability(p);
    if (a.status === 'out_of_stock') {
      warnings.push({ code: 'out_of_stock', productId: p.id, message: 'Sold out.' });
      continue;
    }
    let quantity = item.quantity;
    if (quantity > a.maxQuantity) {
      quantity = a.maxQuantity;
      warnings.push({ code: 'quantity_over_max', productId: p.id, message: 'Over the maximum.' });
    }
    const u = unitPrice(p, quantity);
    lines.push({
      productId: p.id,
      name: p.name,
      quantity,
      unitPrice: u,
      lineTotal: +(u * quantity).toFixed(2),
      priceSource: 'base',
      availability: a.status,
      maxQuantity: a.maxQuantity,
    });
  }
  const subtotal = +lines.reduce((s, l) => s + l.lineTotal, 0).toFixed(2);
  const method = shippingMethods.find(m => m.id === shippingMethodId);
  if (shippingMethodId != null && !method) warnings.push({ code: 'shipping_method_unknown', productId: null, message: 'Unknown method.' });
  const shipping = method?.price ?? 0;
  const vat = +((subtotal + shipping) * 0.2).toFixed(2);
  const total = +(subtotal + shipping + vat).toFixed(2);
  return {
    currency: 'EUR',
    lines,
    subtotal,
    shipping,
    vat: { rate: 20, amount: vat },
    total,
    totalSats: state.config.hidePrices ? null : sats(total),
    btcRate: { value: BTC_RATE, source: 'mock', asOf: now },
    warnings,
  };
}

const problem = (res, status, code, extra = {}) =>
  send(
    res,
    status,
    { type: `https://loom21.com/docs/storefront-api/errors#${code}`, title: 'Error', status, detail: code, code, ...extra },
    'application/problem+json',
  );

function send(res, status, body, type = 'application/json', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Expose-Headers', 'ETag, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After');
  }
}

async function body(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

const statusOf = c => ({
  status: c.status,
  orderNumber: c.status === 'paid' ? '0000000042' : null,
  expiresAt: c.expiresAt,
  paidAt: c.status === 'paid' ? new Date().toISOString() : null,
  method: c.payment?.method ?? null,
  total: c.total,
  currency: 'EUR',
  buyerEmail: c.email.replace(/^(.).*(@.*)$/, '$1***$2'),
  receiptUrl: c.status === 'paid' ? 'https://app.loom21.com/receipt/test' : null,
  hostedPaymentUrl: c.payment?.hostedPaymentUrl ?? null,
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  cors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin ?? '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      // Like the real API: never Loom21-Server-Secret.
      'Access-Control-Allow-Headers': 'Loom21-Publishable-Key, Content-Type, Idempotency-Key, If-None-Match',
      'Access-Control-Max-Age': '600',
    });
    return res.end();
  }

  if (path.startsWith('/__test/')) {
    if (path === '/__test/log') return send(res, 200, state.log);
    if (path === '/__test/reset') {
      reset();
      return send(res, 204);
    }
    if (path === '/__test/config') {
      Object.assign(state.config, (await body(req)) ?? {});
      return send(res, 204);
    }
    if (path === '/__test/pay') {
      for (const c of state.checkouts.values()) if (c.status === 'awaiting_payment') c.status = 'paid';
      return send(res, 204);
    }
    return send(res, 404, { error: 'unknown test control' });
  }

  if (!path.startsWith(BASE)) return send(res, 404, { error: 'not the storefront API' });
  const route = path.slice(BASE.length) || '/';
  state.log.push({
    method: req.method,
    path: route + url.search,
    key: req.headers['loom21-publishable-key'] ?? null,
    secret: req.headers['loom21-server-secret'] ?? null,
    clientIp: req.headers['loom21-client-ip'] ?? null,
    origin: req.headers.origin ?? null,
  });

  const key = req.headers['loom21-publishable-key'];
  if ((key !== KEY && key !== BG_KEY) || state.config.storeDisabled) return problem(res, 401, 'invalid_key');
  state.language = key === BG_KEY ? 'bg' : state.config.language;
  if (req.headers['loom21-server-secret'] && req.headers['loom21-server-secret'] !== SECRET)
    return problem(res, 401, 'invalid_server_secret');

  let m;
  if (req.method === 'GET' && route === '/store') return send(res, 200, store());
  if (req.method === 'GET' && route === '/categories') return send(res, 200, categories);
  if (req.method === 'GET' && route === '/pages')
    return send(
      res,
      200,
      pages.map(({ type, title, updatedAt }) => ({ type, title, updatedAt })),
    );
  if (req.method === 'GET' && (m = route.match(/^\/pages\/([^/]+)$/))) {
    const page = pages.find(p => p.type === decodeURIComponent(m[1]));
    return page ? send(res, 200, page) : problem(res, 404, 'not_found');
  }
  if (req.method === 'GET' && route === '/sitemap')
    return send(res, 200, {
      categories: categories.map(c => ({ slug: c.slug, updatedAt: now })),
      products: baseProducts.map(p => ({ slug: p.slug, updatedAt: now })),
    });

  if (req.method === 'GET' && route === '/products') {
    let list = [...baseProducts];
    const category = url.searchParams.get('category');
    if (category) {
      const c = categories.find(x => x.slug === category || x.id === category);
      list = c ? list.filter(p => p.categoryId === c.id) : [];
    }
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    const sort = url.searchParams.get('sort') || 'newest';
    if (!['newest', 'name', 'price_asc', 'price_desc'].includes(sort))
      return problem(res, 422, 'validation_failed', { errors: { sort: ['bad sort'] } });
    const by = {
      newest: (a, b) => b.created - a.created,
      name: (a, b) => a.name.localeCompare(b.name),
      price_asc: (a, b) => a.price - b.price,
      price_desc: (a, b) => b.price - a.price,
    }[sort];
    list.sort(by);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20));
    return send(res, 200, {
      items: list.slice((page - 1) * pageSize, page * pageSize).map(summary),
      page,
      pageSize,
      totalCount: list.length,
    });
  }
  if (req.method === 'GET' && (m = route.match(/^\/products\/([^/]+)$/))) {
    const key = decodeURIComponent(m[1]);
    const p = baseProducts.find(x => x.slug === key || String(x.id) === key);
    return p ? send(res, 200, full(p)) : problem(res, 404, 'not_found');
  }

  if (req.method === 'POST' && route === '/quotes') {
    const b = await body(req);
    if (!b?.items?.length) return problem(res, 422, 'validation_failed', { errors: { items: ['required'] } });
    return send(res, 200, quote(b.items, b.shippingMethodId ?? null));
  }

  if (req.method === 'POST' && route === '/checkouts') {
    if (!state.config.checkoutAvailable) return problem(res, 409, 'storefront_unavailable');
    const idem = req.headers['idempotency-key'];
    if (!idem) return problem(res, 422, 'validation_failed', { errors: { 'Idempotency-Key': ['required'] } });
    const b = await body(req);
    if (!b?.buyer?.email || !b.items?.length) return problem(res, 422, 'validation_failed', { errors: { 'buyer.email': ['required'] } });
    const known = state.idempotency.get(idem);
    if (known) return send(res, 201, known);
    const short = [];
    for (const item of b.items) {
      const p = baseProducts.find(x => x.id === item.productId);
      if (p && !p.isService && stockOf(p) < item.quantity)
        short.push({ productId: p.id, requested: item.quantity, available: Math.max(0, stockOf(p)) });
    }
    if (short.length) return problem(res, 409, 'insufficient_stock', { lines: short });
    const q = quote(b.items, b.shippingMethodId ?? null);
    const token = 'chk_' + randomUUID().replace(/-/g, '');
    const checkout = {
      token,
      id: randomUUID(),
      status: 'awaiting_payment',
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      total: q.total,
      email: b.buyer.email,
      payment: null,
      payments: 0,
    };
    state.checkouts.set(token, checkout);
    const response = {
      checkoutToken: token,
      checkoutId: checkout.id,
      status: checkout.status,
      orderNumber: null,
      expiresAt: checkout.expiresAt,
      total: q.total,
      currency: 'EUR',
      paymentMethods: store().paymentMethods,
    };
    state.idempotency.set(idem, response);
    return send(res, 201, response);
  }

  if ((m = route.match(/^\/checkouts\/([^/]+)(\/payments|\/cancel)?$/))) {
    const c = state.checkouts.get(decodeURIComponent(m[1]));
    if (!c) return problem(res, 404, 'not_found');
    if (req.method === 'POST' && m[2] === '/payments') {
      if (c.status === 'paid') return problem(res, 409, 'checkout_paid');
      if (c.status !== 'awaiting_payment') return problem(res, 409, 'checkout_expired');
      const method = (await body(req))?.method;
      if (!store().paymentMethods.includes(method)) return problem(res, 409, 'payment_method_unavailable');
      if (++c.payments > 5) return problem(res, 409, 'too_many_payment_attempts');
      const amountSats = sats(c.total);
      const hostedPaymentUrl = `http://localhost:${PORT}/__pay/${c.token}`;
      c.payment = {
        paymentId: 'pay_' + c.payments,
        method,
        processor: method === 'card' ? 'stripe' : method === 'onchain' ? 'btcpay' : 'lightning_address',
        amountSats: method === 'card' ? null : amountSats,
        bolt11: method === 'lightning' ? 'lnbc' + amountSats + 'n1pmockinvoice' + c.payments : null,
        onchainAddress: method === 'onchain' ? 'bc1qmockaddress0000000000000000000000000' : null,
        bip21: method === 'onchain' ? `bitcoin:bc1qmockaddress0000000000000000000000000?amount=${(amountSats / 1e8).toFixed(8)}` : null,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        hostedPaymentUrl,
      };
      return send(res, 201, c.payment);
    }
    if (req.method === 'POST' && m[2] === '/cancel') {
      if (c.status === 'paid') return problem(res, 409, 'checkout_paid');
      c.status = 'cancelled';
      return send(res, 200, statusOf(c));
    }
    if (req.method === 'GET' && !m[2]) {
      const s = statusOf(c);
      const etag =
        '"' +
        Buffer.from(JSON.stringify([s.status, s.method]))
          .toString('base64url')
          .slice(0, 16) +
        '"';
      if (req.headers['if-none-match'] === etag) return send(res, 304, undefined, 'application/json', { ETag: etag });
      return send(res, 200, s, 'application/json', { ETag: etag, 'Cache-Control': 'no-cache' });
    }
  }
  return problem(res, 404, 'not_found');
});

server.listen(PORT, () => console.log(`Mock Loom21 Storefront API on http://localhost:${PORT}${BASE} (key ${KEY})`));
