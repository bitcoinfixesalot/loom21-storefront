const LINE_SEPARATORS = new RegExp('[\\u2028\\u2029]', 'g');

/** JSON safe inside a <script>: no "</script>", no HTML comment openers, no line separators. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATORS, c => (c === ' ' ? '\\u2028' : '\\u2029'));
}
