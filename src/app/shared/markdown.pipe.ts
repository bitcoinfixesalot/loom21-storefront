import { Pipe, PipeTransform } from '@angular/core';
import { Marked } from 'marked';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Markdown the merchant wrote: raw HTML in it is shown as text, never as markup. */
const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
  },
});

/** Markdown → HTML for a product's description or a store page. */
export function renderMarkdown(text: string | null | undefined): string {
  return text ? (markdown.parse(text, { async: false }) as string) : '';
}

/**
 * `<div [innerHTML]="text | markdown">`. Two layers: marked escapes raw HTML, and Angular's sanitiser (on the server
 * and in the browser) removes anything unsafe that's left, like javascript: links. Never bypass the sanitiser here.
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(text: string | null | undefined): string {
    return renderMarkdown(text);
  }
}
