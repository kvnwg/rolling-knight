/**
 * The small pixel pieces the good-roll effects draw (from Dumpster Legend's UI sheet, same palette):
 * luck tokens (16 x 16, a four-leaf clover with a plaque reading ×N), the four-point sparkle (7 x 7)
 * and the payline arrow (4 x 6). Rows of palette keys, '.' transparent, turned into data URLs once.
 */
const PAL: Record<string, string> = {
  k: '#1a1326',
  w: '#ffffff',
  o: '#b8501c',
  O: '#ef8a22',
  y: '#f5c638',
  Y: '#fff28c',
  g: '#1f4f3a',
  G: '#2f8a45',
  l: '#5dc14c',
  L: '#b0ec6c',
  U: '#2f56a6',
  c: '#3fa1e3',
  V: '#7546b8',
  m: '#ae7ee6',
};

type Rows = readonly string[];

const DIGITS: Record<string, Rows> = {
  x: ['...', '#.#', '.#.', '#.#', '...'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#', '##', '.#', '.#', '.#'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '5': ['###', '#..', '###', '..#', '###'],
};

const TOKEN_TOP: Rows = ['..kk.kk..kk.kk..', '.kLlkLlkkLlkLlk.', '.kllllGkkllllGk.', '..kllGk..kllGk..', '...kGk....kGk...'];
const TOKEN_BOTTOM: Rows = ['..klGGk..klGGk..', '.kllGGGkkllGGGk.', '.kllkGgkkllkGgk.', '..kk.kk..kk.kk..'];

/** The clover with a plaque across it reading "×N" (plaque light and mid colors, digit color). */
function luckToken(x: number, light: string, mid: string, digit: string): Rows {
  const glyphs = ['x', ...String(x)].map((c) => DIGITS[c] ?? DIGITS.x);
  const gap = x >= 10 ? 1 : 2;
  const width = glyphs.reduce((n, g) => n + g[0].length, 0) + gap + (glyphs.length - 2);
  const rows: string[] = [];
  for (let y = 0; y < 5; y++) {
    const cells = Array.from({ length: 14 }, () => mid);
    let cx = Math.floor((14 - width) / 2);
    glyphs.forEach((g, i) => {
      for (let gx = 0; gx < g[y].length; gx++) if (g[y][gx] === '#') cells[cx + gx] = digit;
      cx += g[0].length + (i === 0 ? gap : 1);
    });
    rows.push(`k${cells.join('')}k`);
  }
  rows[0] = rows[0].replaceAll(mid, light);
  return [...TOKEN_TOP, '.kkkkkkkkkkkkkk.', ...rows, '.kkkkkkkkkkkkkk.', ...TOKEN_BOTTOM];
}

const TOKENS: Record<number, Rows> = {
  2: luckToken(2, 'l', 'G', 'w'),
  3: luckToken(3, 'c', 'U', 'w'),
  5: luckToken(5, 'm', 'V', 'w'),
  10: luckToken(10, 'y', 'O', 'w'),
};

const SPARKLE: Rows = ['...Y...', '...w...', '..YwY..', 'YwwwwwY', '..YwY..', '...w...', '...Y...'];
const PAYLINE: Rows = ['kk..', 'kYk.', 'kyyk', 'kyOk', 'kOk.', 'kk..'];

export interface PixelPic {
  url: string;
  /** Size in art pixels. */
  w: number;
  h: number;
}

const cache = new Map<string, PixelPic>();

function pic(key: string, rows: Rows, flip = false): PixelPic {
  const hit = cache.get(key);
  if (hit) return hit;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][flip ? w - 1 - x : x];
        const col = ch ? PAL[ch] : undefined;
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  const out = { url: c.toDataURL(), w, h };
  cache.set(key, out);
  return out;
}

/** A luck token's picture (16 x 16); a value without its own art shows the ×10 plaque's colors. */
export function tokenPic(x: number): PixelPic {
  const rows = TOKENS[x] ?? luckToken(Math.min(99, x), 'y', 'O', 'w');
  return pic(`token:${x}`, rows);
}

export function sparklePic(): PixelPic {
  return pic('sparkle', SPARKLE);
}

/** The payline's arrow, pointing right (flipped: pointing left, for the right end). */
export function paylinePic(flip = false): PixelPic {
  return pic(`payline:${flip}`, PAYLINE, flip);
}
