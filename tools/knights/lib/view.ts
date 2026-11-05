/**
 * Review images for the knight tools: frames laid out on a board, enlarged with nearest neighbor,
 * over flat backdrops (a mid stone, a bright grass and a dark cave tone) so the outline and the
 * colors can be judged where they will be seen.
 */
import { writeRgba, type Rgba } from './png';

export const BACKDROPS = {
  stone: '#5b5d6b',
  grass: '#7fae5a',
  cave: '#232233',
  sand: '#c9b48a',
  ui: '#2a2238',
} as const;

const rgbOf = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

export class Board {
  readonly img: Rgba;

  constructor(w: number, h: number, bg = '#2a2238') {
    this.img = { w, h, px: new Uint8ClampedArray(w * h * 4) };
    this.fill(0, 0, w, h, bg);
  }

  fill(x0: number, y0: number, w: number, h: number, hex: string): void {
    const [r, g, b] = rgbOf(hex);
    for (let y = Math.max(0, y0); y < Math.min(this.img.h, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(this.img.w, x0 + w); x++) this.img.px.set([r, g, b, 255], (y * this.img.w + x) * 4);
    }
  }

  /** Draws RGBA pixels (w x h) at (x0, y0), `scale` board pixels per pixel, alpha blended. */
  draw(px: Uint8ClampedArray, w: number, h: number, x0: number, y0: number, scale = 1): void {
    for (let y = 0; y < h * scale; y++) {
      for (let x = 0; x < w * scale; x++) {
        const bx = x0 + x;
        const by = y0 + y;
        if (bx < 0 || by < 0 || bx >= this.img.w || by >= this.img.h) continue;
        const i = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4;
        const a = px[i + 3] / 255;
        if (!a) continue;
        const o = (by * this.img.w + bx) * 4;
        for (let k = 0; k < 3; k++) this.img.px[o + k] = Math.round(px[i + k] * a + this.img.px[o + k] * (1 - a));
        this.img.px[o + 3] = 255;
      }
    }
  }

  save(path: string, scale = 1): void {
    writeRgba(path, this.img, scale);
  }
}

/** A tiny 3x5 pixel font for labels on review boards. */
const FONT: Record<string, string> = {
  a: '010101111101101', b: '110101110101110', c: '011100100100011', d: '110101101101110', e: '111100110100111', f: '111100110100100',
  g: '011100101101011', h: '101101111101101', i: '111010010010111', j: '001001001101010', k: '101101110101101', l: '100100100100111',
  m: '101111111101101', n: '110101101101101', o: '010101101101010', p: '110101110100100', q: '010101101110011', r: '110101110101101',
  s: '011100010001110', t: '111010010010010', u: '101101101101111', v: '101101101101010', w: '101101111111101', x: '101101010101101',
  y: '101101010010010', z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100110101010', '7': '111001010010010', '8': '010101010101010', '9': '010101011001110',
  ' ': '000000000000000', '-': '000000111000000', '_': '000000000000111', '.': '000000000000010', ':': '000010000010000', '/': '001001010100100',
  '(': '010100100100010', ')': '010001001001010', '+': '000010111010000',
};

export function label(b: Board, text: string, x: number, y: number, hex = '#e8e0f0', scale = 1): void {
  let cx = x;
  for (const ch of text.toLowerCase()) {
    const f = FONT[ch] ?? FONT[' '];
    for (let i = 0; i < 15; i++) if (f[i] === '1') b.fill(cx + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale, hex);
    cx += 4 * scale;
  }
}
