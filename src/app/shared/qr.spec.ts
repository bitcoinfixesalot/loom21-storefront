import jsQR from 'jsqr';
import { qrMatrix, qrSvg } from './qr';

/** Draws the matrix 4 px a module with the quiet zone, and reads it back with jsQR, an independent decoder. */
function decode(matrix: boolean[][]): string | null {
  const scale = 4;
  const quiet = 4;
  const size = (matrix.length + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
    }),
  );
  return jsQR(pixels, size, size)?.data ?? null;
}

// The full test suite lives in the Buy button repository; these check the copy here still reads back.
describe('QR encoder (copied from the Buy button)', () => {
  it('encodes a Lightning invoice and a bip21 URI that decode back', () => {
    const bolt11 = 'LNBC125U1PJQ0XYZPP5' + 'QQQSYQCYQ5RQWZQFQQQSYQCYQ5RQWZQFQQQSYQCYQ5RQWZQFQYPQ'.repeat(4);
    expect(decode(qrMatrix(bolt11))).toBe(bolt11);
    const bip21 = 'bitcoin:bc1qmockaddress0000000000000000000000000?amount=0.00012000';
    expect(decode(qrMatrix(bip21))).toBe(bip21);
  });

  it('makes an SVG with an escaped label', () => {
    const svg = qrSvg('hello', 'a "label" <x>');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('<x>');
  });
});
