# Loom21 Storefront

An open-source online store for [Loom21](https://loom21.com) merchants: home, categories, product pages, search, cart, and checkout with **Bitcoin (Lightning and on-chain) and card**. It is an Angular app rendered on the server, and it talks to Loom21 **only through the public [Storefront API](https://app.loom21.com/storefront/v1/openapi.json)**, the same API anyone gets.

- **Own your money:** every payment goes to the merchant's own processor (their Lightning wallet, BTCPay Server, Stripe).
- **Own your data:** the store keeps nothing. Products, stock, orders and customers live in Loom21, which exports them.
- **Own your integrations:** MIT licensed, on a public API. Don't like it? Fork it.

No cookies, no analytics, no third-party scripts or fonts. The browser keeps only the cart (product ids and quantities), so there is no consent banner to show.

## Quick start with Docker

1. In Loom21, open **Settings → Storefronts** and create a storefront (or open yours):
   - **Developer → Publishable key**: copy it.
   - **Developer → Server secret → Generate**: copy it now; it is shown once.
   - **Developer → Allowed websites**: add your store's address, e.g. `https://shop.example.com`. The cart and checkout call the API from the shopper's browser, so without it they can't load.
   - Publish some products (Products → Storefront tab, or tick them and Publish).
2. Copy `.env.example` to `.env` and fill it in.
3. Copy `docker-compose.example.yml` to `docker-compose.yml`, and put your domain in `deploy/single/Caddyfile`.
4. Point your domain's DNS at the server and run `docker compose up -d`. Caddy gets the HTTPS certificate by itself.

Or without Compose: `docker run --env-file .env -p 4000:4000 ghcr.io/bitcoinfixesalot/loom21-storefront`, behind your own proxy.

## Settings (environment variables)

| Variable | Default | |
|---|---|---|
| `STOREFRONT_MODE` | `single` | One store from the key below. `hosted` is loom21's own multi-store deployment (below). |
| `LOOM21_API_BASE` | `https://app.loom21.com/storefront/v1` | The Storefront API. |
| `LOOM21_PUBLISHABLE_KEY` | required | `l21_pk_live_…` from the storefront's Developer tab. Public by design: browsers send it. |
| `LOOM21_SERVER_SECRET` | strongly recommended | `l21_ss_…`. **Server only, never sent to a browser.** See below. |
| `PUBLIC_BASE_URL` | required | Your store's address, for canonical URLs and `sitemap.xml`. |
| `HTML_CACHE_SECONDS` | `30` | How long catalog pages are cached in memory (0 = off). |
| `TRUST_PROXY` | `false` | Behind proxies, so the shopper's IP comes from `X-Forwarded-For`: `true` behind one proxy you control (Caddy), or the number of proxies in front (`2` behind Cloudflare and Azure's ingress), so a shopper can't fake their IP. |
| `PORT` | `4000` | |

**Why the server secret.** The store renders its pages on your server, so every catalog request reaches the API from your server's IP, and the API's per-IP limit (120 reads a minute) would throttle your whole store as if it were one shopper. With the secret, the server also sends each shopper's IP (`Loom21-Client-IP`), and the API counts shoppers instead. The API refuses a wrong secret (401 `invalid_server_secret`), so a typo shows up at once. Browsers never see it: it isn't in the pages or the scripts (the tests check), and the API doesn't let a browser send it.

## Pages

| Address | Rendered | |
|---|---|---|
| `/` | server | The store, its categories, the 12 newest products |
| `/c/:slug` | server | A category, 24 a page, sortable |
| `/p/:slug` | server | A product, with JSON-LD; a real 404 when it isn't published |
| `/search?q=` | server | Search (no text: every product). Not indexed. |
| `/pages/:type` | server | About, terms, privacy, returns, shipping, seller details: written in Loom21 (Storefronts → Pages) |
| `/cart`, `/checkout`, `/checkout/pay`, `/checkout/complete` | browser | Not indexed |
| `/sitemap.xml`, `/robots.txt`, `/healthz` | server | |

Prices are the server's: the cart holds only ids and quantities, and every total comes from the API's quote, so a stale cart can't show a wrong price. Product pages show prices with VAT, in fiat, sats or both as the merchant's Bitcoin settings say; the cart and checkout list them before VAT, with the VAT on its own line. Availability on a product page is as of when the page was rendered (up to `HTML_CACHE_SECONDS` old); the quote and the checkout always check again.

Paying works like the [Buy button](https://github.com/bitcoinfixesalot/loom21-buy-button): a Lightning invoice as a QR code with "Open in wallet", an on-chain address as a QR code, or the card payment page in a new tab. The page checks every 2 seconds until the order is paid, and survives a reload.

A storefront that is turned off (or whose key was revoked) gets a neutral "isn't taking orders" page with status 503.

## Hosted mode

loom21 runs this same code for every merchant (`STOREFRONT_MODE=hosted`): one deployment, the store chosen by the request's host, on `{label}.loom21.shop` and on custom domains merchants verify in Settings → Storefronts → Domains. The host is looked up through loom21's internal endpoint with a platform secret (`LOOM21_HOST_SECRET`, `LOOM21_INTERNAL_API_BASE`), cached for 5 minutes. How it's deployed: [deploy/hosted/README.md](deploy/hosted/README.md).

## Run it locally

Against the mock API in this repo (no Loom21 account needed):

```bash
npm ci
npm run build
npm run mock-api &           # http://localhost:5179/storefront/v1, key l21_pk_live_test
LOOM21_API_BASE=http://localhost:5179/storefront/v1 LOOM21_PUBLISHABLE_KEY=l21_pk_live_test \
  LOOM21_SERVER_SECRET=l21_ss_test PUBLIC_BASE_URL=http://localhost:4000 npm run serve
```

Against your own Loom21 (a dev API on your machine works too): put its values in `.env` and run `npm run build && npm run serve`. Add `http://localhost:4000` to the storefront's Allowed websites.

For development with live reload: `npm start`, with the same variables set in your shell.

## Tests

- `npm run lint`: types, the English and Bulgarian texts have the same keys, formatting.
- `npm test`: unit tests (Vitest).
- `npm run build && npm run e2e`: Playwright against the mock API. It starts the mock and three store servers: English on 4100, Bulgarian on 4101, and hosted mode on 4102 (stores at `bees.localhost:4102`, `pchelin.localhost:4102`).
- `npm run lighthouse`: performance, SEO and accessibility of the home and product pages, with the mock and a store running on port 4100.

## The API's types

`src/app/core/api/types.ts` has the API's models. They are checked against the API's OpenAPI document at build time (`schema-check.ts`): when the API adds or drops a field, the build fails until the types follow.

```bash
LOOM21_API_BASE=https://app.loom21.com/storefront/v1 npm run api:fetch
npm run api:types
```

## Fork it, theme it

- **Colours and spacing:** the tokens at the top of `src/styles.scss`. The merchant's accent colour (Storefronts → Look & SEO) overrides `--accent`.
- **Texts:** `src/app/core/i18n/en.json` and `bg.json`. A new language is a new file with the same keys, and its code in `I18n`.
- **Pages:** `src/app/features/`. Each fetches what it needs from `StorefrontApi`.
- Keep the rules that protect the merchant and the shopper: never put the server secret in browser code (`Tenant` must stay public), never trust a price from the cart, and render the merchant's Markdown only through `MarkdownPipe` (raw HTML is escaped, and Angular's sanitiser removes the rest).

## Installing

`npm ci` uses `legacy-peer-deps` (`.npmrc`): Vite lists an optional Vitest 5 peer that conflicts with the Vitest 4 Angular's test runner needs, and npm 11 fails on it otherwise.

## Licence

MIT. See [LICENSE](LICENSE).
