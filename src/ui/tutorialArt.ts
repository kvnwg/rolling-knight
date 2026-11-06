/**
 * The tutorial's pieces, as pixel art in the game's palette (render/pixel/palette.ts), lit from the
 * top left with an ink outline: the pointing glove (the icon set's tutorial hand, with a brass cuff)
 * for the buttons, a brass arrow (the icon set's arrow, cast in brass) for spots in the world, and
 * the ring that pulses round a button (a 9-slice: a soft gold glow, an ink line, a bright gold line).
 *
 * The glove and the arrow are drawn once and turned to point each way here, as art (flipped or
 * turned on the grid, the cuff's bands swapped back), so the light still falls from the top left
 * whichever way they point; a CSS rotation would light them from below. Pure rows and buffers here;
 * the screen turns them into images (ui/Tutorial.tsx).
 */
import { blank, fromRows, type PixelBuf, type Rows } from '../render/pixel/buf';

/** The way a pointer points (at its target). */
export type PtrDir = 'up' | 'down' | 'left' | 'right';

/** The glove, finger up (the cuff at the bottom). 16 x 16. */
export const GLOVE: Rows = [
  '......kk........',
  '.....kwWk.......',
  '.....kWWk.......',
  '.....kWWk.......',
  '.....kWWkkk.....',
  '.....kWWkWWkkk..',
  '.kk..kWWkWWkWWk.',
  'kwWk.kWWkWWkWTk.',
  'kWWWkkWWWWWWWTk.',
  '.kWWWWWWWWWWWTk.',
  '..kWWWWWWWWWWTk.',
  '...kWWWWWWWWTTk.',
  '....kWWWWWWTTk..',
  '....kYyyyyyOk...',
  '....kOOOOOOok...',
  '....kkkkkkkkk...',
];

/** The arrow, pointing down (the tip at the bottom middle). 14 x 13. */
export const ARROW: Rows = [
  '...kkkkkkkk...',
  '...kYYYYYOk...',
  '...kYyyyyOk...',
  '...kYyyyyOk...',
  '...kYyyyyOk...',
  '.kkkYyyyyOkkk.',
  'kYYYyyyyyyYOok',
  '.kYyyyyyyyyOk.',
  '..kYyyyyyyOk..',
  '...kYyyyyOk...',
  '....kYyyOk....',
  '.....kyOk.....',
  '......kk......',
];

/** Where each picture's tip is in its 16 x 16 box, pointing each way (art px, from its top left). */
export const PTR_TIP: Record<'hand' | 'arrow', Record<PtrDir, readonly [number, number]>> = {
  hand: { up: [7, 0], down: [7, 16], right: [16, 7], left: [0, 7] },
  arrow: { down: [8, 14], up: [8, 2], right: [14, 8], left: [2, 8] },
};

const flipV = (r: Rows): string[] => [...r].reverse();
const mirror = (r: Rows): string[] => r.map((row) => [...row].reverse().join(''));
/** Across the diagonal: what pointed down points right, its left side on top. */
const transpose = (r: Rows): string[] => Array.from({ length: r[0].length }, (_, x) => Array.from({ length: r.length }, (_, y) => r[y][x]).join(''));
/** Swaps two rows' pixels of the given colors (the cuff's bands), leaving the outline. */
function swapRows(r: string[], a: number, b: number, chars: string): string[] {
  const out = [...r];
  const ra = [...out[a]];
  const rb = [...out[b]];
  for (let x = 0; x < ra.length; x++) {
    if (chars.includes(ra[x]) && chars.includes(rb[x])) [ra[x], rb[x]] = [rb[x], ra[x]];
  }
  out[a] = ra.join('');
  out[b] = rb.join('');
  return out;
}
const swapCols = (r: string[], a: number, b: number, chars: string): string[] => transpose(swapRows(transpose(r), a, b, chars));

const CUFF = 'YyOo';

/** The glove's rows pointing `dir`. */
export function gloveRows(dir: PtrDir): string[] {
  // Down: upside down, the cuff's light band back on top.
  const down = swapRows(flipV(GLOVE), 1, 2, CUFF);
  if (dir === 'up') return [...GLOVE];
  if (dir === 'down') return down;
  // Right: the thumb on top, the shade along the bottom, the cuff on the left (its light end outside).
  const right = transpose(down);
  if (dir === 'right') return right;
  // Left: the right one mirrored, the cuff's bands swapped back (the light one inside, by the hand).
  return swapCols(mirror(right), 13, 14, CUFF);
}

/** The arrow's rows pointing `dir`, in a 16 x 16 box. */
export function arrowRows(dir: PtrDir): string[] {
  const pad = '.'.repeat(16);
  const down = [pad, ...ARROW.map((row) => `.${row}.`), pad, pad];
  if (dir === 'down') return down;
  if (dir === 'up') return flipV(down);
  // Right: its light side on top; left: that mirrored.
  const right = transpose(down);
  return dir === 'right' ? right : mirror(right);
}

/** The ring round a button: 13 x 13, sliced 6 a side (the middle stays clear). */
export const RING_N = 13;
export const RING_SLICE = 6;

/**
 * Bands from the outside in (each one follows the rounded outline a pixel further in): a soft gold
 * glow, the ink line, bright gold (lighter on the pulse's bright beat), a deeper gold, a faint ink line
 * against the button.
 */
export function ringBuf(bright: boolean): PixelBuf {
  const n = RING_N;
  const b = blank(n, n);
  const bands: Array<[string, number]> = [
    ['#ffd257', bright ? 140 : 80],
    ['#2b170c', 255],
    [bright ? '#fff7cf' : '#ffe17a', 255],
    ['#f0a42c', 255],
    ['#2b170c', 120],
  ];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cx = Math.min(x, n - 1 - x);
      const cy = Math.min(y, n - 1 - y);
      // How far in from the outline: a 45-degree cut of two pixels rounds the corners.
      const depth = Math.min(cx, cy, cx + cy - 2);
      const band = depth >= 0 ? bands[depth] : undefined;
      if (!band) continue;
      const [hex, a] = band;
      const i = (y * n + x) * 4;
      b.px[i] = parseInt(hex.slice(1, 3), 16);
      b.px[i + 1] = parseInt(hex.slice(3, 5), 16);
      b.px[i + 2] = parseInt(hex.slice(5, 7), 16);
      b.px[i + 3] = a;
    }
  }
  return b;
}

export const gloveBuf = (dir: PtrDir): PixelBuf => fromRows(gloveRows(dir));
export const arrowBuf = (dir: PtrDir): PixelBuf => fromRows(arrowRows(dir));
