// Fails when en.json and bg.json don't have the same keys, or a text is empty: no untranslated text ships.
import { readFileSync } from 'node:fs';

const dir = new URL('../src/app/core/i18n/', import.meta.url);
const files = ['en.json', 'bg.json'];
const texts = Object.fromEntries(files.map(f => [f, JSON.parse(readFileSync(new URL(f, dir), 'utf8'))]));

let problems = 0;
for (const a of files)
  for (const b of files) {
    if (a === b) continue;
    for (const key of Object.keys(texts[a])) {
      if (!(key in texts[b])) {
        console.error(`${b} is missing "${key}" (it is in ${a})`);
        problems++;
      }
    }
  }
for (const f of files)
  for (const [key, text] of Object.entries(texts[f])) {
    if (typeof text !== 'string' || !text.trim()) {
      console.error(`${f}: "${key}" is empty`);
      problems++;
    }
  }

if (problems) process.exit(1);
console.log(`i18n: ${Object.keys(texts['en.json']).length} keys, same in ${files.join(' and ')}.`);
