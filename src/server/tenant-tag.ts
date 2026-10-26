import { scriptJson } from '../app/core/json';
import { TENANT_TAG_ID, Tenant, publicTenant } from '../app/core/tenant/tenant';

/**
 * Writes the store's public tenant into a page, and its language into <html lang>: server-rendered and client-rendered
 * pages alike, so the browser app always knows its store. Only `publicTenant`'s fields, never a secret.
 */
export function withTenant(html: string, tenant: Tenant): string {
  const tag = `<script id="${TENANT_TAG_ID}" type="application/json">${scriptJson(publicTenant(tenant))}</script>`;
  const lang = html.replace(/<html([^>]*?)\slang="[^"]*"/i, `<html$1 lang="${tenant.language}"`);
  return lang.includes('</head>') ? lang.replace('</head>', `${tag}</head>`) : tag + lang;
}
