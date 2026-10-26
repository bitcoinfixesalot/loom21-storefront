// Downloads the Storefront API's OpenAPI document into openapi/storefront-v1.json, for `npm run api:types`.
//   LOOM21_API_BASE=https://app.loom21.com/storefront/v1 npm run api:fetch
import { mkdirSync, writeFileSync } from 'node:fs';

const base = (process.env.LOOM21_API_BASE || 'https://app.loom21.com/storefront/v1').replace(/\/+$/, '');
const response = await fetch(`${base}/openapi.json`);
if (!response.ok) {
  console.error(`GET ${base}/openapi.json answered ${response.status}`);
  process.exit(1);
}
const json = await response.json();
mkdirSync(new URL('../openapi/', import.meta.url), { recursive: true });
writeFileSync(new URL('../openapi/storefront-v1.json', import.meta.url), JSON.stringify(json, null, 2) + '\n');
console.log(`Saved openapi/storefront-v1.json from ${base}. Now run: npm run api:types`);
