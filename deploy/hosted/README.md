# Hosted mode: loom21's own deployment

One storefront deployment serves every merchant's store: on `{label}.loom21.shop`, made for each storefront, and on custom domains the merchant verifies (Settings → Storefronts → Domains). The store is chosen by the request's host.

```
shopper ──HTTPS──▶ Cloudflare (for SaaS) ──▶ storefront Container App (STOREFRONT_MODE=hosted)
                                                   │ host lookup: http://loom21-api:8081/internal/… (host secret)
                                                   │ catalog: https://app.loom21.com/storefront/v1 (key + host secret + shopper IP)
                                                   ▼
                                         loom21 API Container App ── SQL Server
shopper's browser ──HTTPS (publishable key)──▶ app.loom21.com/storefront/v1   (cart, checkout, payment)
```

This guide is the setup we chose: **Azure Container Apps** for both apps, in **one environment**, and **Cloudflare for SaaS** for HTTPS. Steps marked *check* depend on Azure and Cloudflare behaviour we haven't tried on production yet.

## 1. The shop domain on Cloudflare

1. Register the shop domain (e.g. `loom21.shop`) and add its zone to Cloudflare. Cloudflare for SaaS needs the zone there.
2. DNS records, both **proxied** (orange cloud), pointing at the storefront Container App's own address (`storefront.<env>.azurecontainerapps.io`):
   - `*` (every store's subdomain),
   - `stores` (the target merchants point their custom domains to).
3. SSL/TLS → Custom Hostnames: enable Cloudflare for SaaS and set the **fallback origin** to `stores.loom21.shop`.
4. Create an API token with **Zone → SSL and Certificates → Edit** on this zone. loom21 uses it to add a custom hostname when a merchant's domain is verified, and remove it when the domain goes.
5. **Host header** (*check*). Azure's ingress only answers for the app's own address and its bound domains, so requests can't reach it with a merchant's host name:
   - an Origin Rule on the zone sets the **Host header** to the storefront app's `*.azurecontainerapps.io` address;
   - a Transform Rule (request header) sets `X-Forwarded-Host` to the original host (`http.host`).

   The storefront reads the store's host from `X-Forwarded-Host` (with `TRUST_PROXY`, below).

## 2. The loom21 API

Settings (Container App environment variables; the two secrets as Container Apps secrets):

| Setting | Value |
|---|---|
| `StorefrontHosting__ShopDomain` | `loom21.shop` |
| `StorefrontHosting__CnameTarget` | `stores.loom21.shop` |
| `StorefrontHosting__InternalPort` | `8081` |
| `StorefrontHosting__HostSecret` | a long random string (secret), the same as the storefront's `LOOM21_HOST_SECRET` |
| `StorefrontHosting__Cloudflare__ZoneId` | the zone's id |
| `StorefrontHosting__Cloudflare__ApiToken` | the token from step 1.4 (secret) |

**The internal port stays inside the environment.** The API listens on 8081 too, and serves `/internal/…` only there, checking the port the connection really arrived on. Add it as an additional port mapping that isn't external (*check* the exact shape against `az containerapp` docs):

```yaml
properties:
  configuration:
    ingress:
      external: true
      targetPort: 80
      additionalPortMappings:
        - external: false   # reachable only from apps in the same Container Apps environment
          targetPort: 8081
          exposedPort: 8081
```

The public ingress (port 80) answers 404 for `/internal`, and the internal port answers 404 for everything else. The host lookup also needs the host secret.

Then run `Loom21.Data/Scripts/StorefrontPhase1b.sql` (after `StorefrontPhase1a.sql`) and deploy. Existing storefronts get their subdomain within 10 minutes (the background job), or when their Domains tab is opened.

## 3. The storefront

A second Container App in the **same environment**, from the image `ghcr.io/<owner>/loom21-storefront` (or built from this repository):

| Variable | Value |
|---|---|
| `STOREFRONT_MODE` | `hosted` |
| `LOOM21_API_BASE` | `https://app.loom21.com/storefront/v1` |
| `LOOM21_INTERNAL_API_BASE` | `http://<api-app-name>:8081` |
| `LOOM21_HOST_SECRET` | the same secret as the API's `StorefrontHosting__HostSecret` |
| `TRUST_PROXY` | `2` (Cloudflare, then Azure's ingress: the shopper's IP and host come from the forwarded headers they add) |
| `HTML_CACHE_SECONDS` | `30` |
| `PORT` | `4000` (the ingress's target port) |

External ingress on port 4000; health probe `GET /healthz`. The storefront keeps no state of its own (only short caches), so it can run more than one replica.

## What a merchant does

1. Their storefront has `https://{label}.loom21.shop` at once (Domains tab).
2. On Starter and up, they add `shop.example.com`. The tab shows two records to add at their DNS provider:
   - `CNAME shop.example.com → stores.loom21.shop`
   - `TXT _loom21-verify.shop.example.com → loom21-…` (a token for this domain)
3. loom21 checks them every 10 minutes for 48 hours, or at once with **Check**. When both are right, it adds the host name to Cloudflare, which issues the certificate, and the domain shows **Verified**. The domain is then an allowed origin of the storefront automatically.
4. Removing the domain removes it from Cloudflare too. A deleted storefront's domains are freed.

## Without Cloudflare: Caddy

`Caddyfile` here is the plan's original reference: Caddy with a wildcard certificate (DNS-01) and on-demand TLS for custom domains, gated by loom21's `GET /internal/storefront-domains/allowed?domain=` ("ask"). It needs Caddy on ports 80 and 443 on the same private network as the API's internal port. We don't run it this way; it stays for self-hosters of hosted mode.
