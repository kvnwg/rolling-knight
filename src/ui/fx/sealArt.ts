/**
 * The pixel art of the Oracle's altar seal (AltarSeal.tsx), drawn by code once and kept as data URLs:
 *
 *  - the seal: a round gold-rimmed disc of deep violet, a ring of cyan runes and an eight-point star
 *    in the middle; a second frame with the runes and the star lit brighter (it breathes between the
 *    two); and the seal cracked down the middle with light pouring out of the crack, whole and as its
 *    two halves (each half keeps its side of the glowing crack, so they part with a lit edge each);
 *  - the bindings across the reels: a strip of runes for the bands (across and down);
 *  - the ring of light that goes out as it breaks.
 *
 * One art pixel per canvas pixel; the page scales them by var(--px), pixelated. Lit from the top left
 * like the rest of the game's UI art, the game's ink round everything.
 */

/** The seal's size in art pixels (odd: a center pixel). */
export const SEAL = 33;
const C = (SEAL - 1) / 2;

const INK = '#1a1326';
const RIM = ['#7a3e1a', '#c27424', '#f0b240', '#fff0a0'] as const;
const RIM_EDGE = '#4a2412';
const FIELD = ['#22103a', '#331a58', '#46287a'] as const;
const RUNE_DIM = '#2a7f9e';
const RUNE = ['#3fd0e8', '#c8fbff'] as const;
const STAR = ['#9a4ae0', '#d48cff', '#f4d8ff', '#ffffff'] as const;
const CRACK = ['#ffd24a', '#fff6c8'] as const;

type Px = (string | null)[][];

function grid(w: number, h: number): Px {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => null));
}

function toUrl(px: Px): string {
  if (typeof document === 'undefined') return '';
  const h = px.length;
  const w = px[0].length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = px[y][x];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c.toDataURL();
}

/** How lit a spot on a curved surface is, from the top left: 1 facing the light, -1 away. */
function lit(x: number, y: number): number {
  const dx = x - C;
  const dy = y - C;
  const d = Math.hypot(dx, dy) || 1;
  return -(dx * 0.6 + dy * 0.8) / d;
}

/** Tiny rune glyphs (3 x 3), one per spot round the ring. */
const GLYPHS: readonly (readonly string[])[] = [
  ['#.#', '.#.', '#.#'],
  ['###', '..#', '.#.'],
  ['.#.', '###', '.#.'],
  ['#..', '###', '..#'],
  ['##.', '#.#', '.##'],
  ['.#.', '#.#', '###'],
  ['#.#', '#.#', '.#.'],
  ['###', '.#.', '#.#'],
];

/** Where the crack runs (x per row, from the top): a zigzag down the middle. */
const CRACK_X = [0, 0, 1, 1, 0, -1, -1, 0, 1, 2, 1, 0, -1, -1, 0, 1, 1, 0, -1, -2, -1, 0, 0, 1, 0, -1, -1, 0, 1, 1, 0, -1, 0].map((o) => C + o);

function drawSeal(bright: boolean, cracked: boolean): Px {
  const px = grid(SEAL, SEAL);
  for (let y = 0; y < SEAL; y++) {
    for (let x = 0; x < SEAL; x++) {
      const d = Math.hypot(x - C, y - C);
      if (d > 16.4) continue;
      const l = lit(x, y);
      if (d > 15.4) px[y][x] = INK;
      else if (d > 13.4) {
        // The rim: a raised gold ring, lit on its top left.
        px[y][x] = l > 0.6 ? RIM[3] : l > 0.1 ? RIM[2] : l > -0.5 ? RIM[1] : RIM[0];
      } else if (d > 12.5) px[y][x] = RIM_EDGE;
      else {
        // The field: a sunken disc, darker under the rim's top left, lighter toward the bottom right.
        px[y][x] = d > 11.2 && l > -0.2 ? FIELD[0] : d < 6 ? FIELD[2] : l < -0.3 ? FIELD[2] : FIELD[1];
      }
    }
  }
  // Studs round the rim, every 45 degrees (a light pixel with its shadow).
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.round(C + Math.cos(a) * 14.4);
    const y = Math.round(C + Math.sin(a) * 14.4);
    px[y][x] = RIM[3];
    if (px[y + 1]?.[x + 1] && px[y + 1][x + 1] !== INK) px[y + 1][x + 1] = RIM[0];
  }
  // The rune ring: a dim line, and a glyph every 45 degrees on it.
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const x = Math.round(C + Math.cos(a) * 9.6);
    const y = Math.round(C + Math.sin(a) * 9.6);
    px[y][x] = RUNE_DIM;
  }
  GLYPHS.forEach((g, k) => {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
    const gx = Math.round(C + Math.cos(a) * 9.6) - 1;
    const gy = Math.round(C + Math.sin(a) * 9.6) - 1;
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        if (g[j][i] === '#') px[gy + j][gx + i] = bright && (i + j) % 2 === 0 ? RUNE[1] : RUNE[0];
        else px[gy + j][gx + i] = FIELD[0];
      }
    }
  });
  // The star: four long rays and four short ones, white at the heart.
  const rays: Array<[number, number, number]> = [
    [0, -1, 6],
    [0, 1, 6],
    [-1, 0, 6],
    [1, 0, 6],
    [-1, -1, 3],
    [1, -1, 3],
    [-1, 1, 3],
    [1, 1, 3],
  ];
  for (const [dx, dy, n] of rays) {
    for (let s = 1; s <= n; s++) {
      const f = s / n;
      px[C + dy * s][C + dx * s] = f > 0.8 ? STAR[0] : f > 0.45 ? STAR[1] : bright ? STAR[3] : STAR[2];
    }
  }
  // (The long rays are three pixels wide at the base.)
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]) {
    for (const s of [1, 2]) {
      const x = C + dx * s;
      const y = C + dy * s;
      px[y + dx][x + dy] = STAR[s === 1 ? 2 : 1];
      px[y - dx][x - dy] = STAR[s === 1 ? 2 : 1];
    }
  }
  px[C][C] = STAR[3];
  if (cracked) {
    // A jagged crack top to bottom, light pouring out of it (two pixels: one for each half).
    for (let y = 1; y < SEAL - 1; y++) {
      const x = CRACK_X[y];
      if (!px[y][x] || px[y][x] === INK) continue;
      px[y][x] = CRACK[1];
      if (px[y][x + 1] && px[y][x + 1] !== INK) px[y][x + 1] = CRACK[1];
      // A glow either side of it.
      if (px[y][x - 1] && px[y][x - 1] !== INK) px[y][x - 1] = CRACK[0];
      if (px[y][x + 2] && px[y][x + 2] !== INK) px[y][x + 2] = CRACK[0];
    }
    // Two short branches off the heart.
    for (const [x, y] of [
      [C - 3, C - 4],
      [C - 4, C - 5],
      [C - 5, C - 5],
      [C + 4, C + 3],
      [C + 5, C + 4],
      [C + 6, C + 4],
    ]) {
      if (px[y][x] && px[y][x] !== INK) px[y][x] = CRACK[0];
    }
  }
  return px;
}

/** One side of the cracked seal: the left keeps the crack's first light pixel, the right its second. */
function half(px: Px, side: 'left' | 'right'): Px {
  const out = grid(SEAL, SEAL);
  for (let y = 0; y < SEAL; y++) {
    const cut = CRACK_X[y];
    for (let x = 0; x < SEAL; x++) {
      const keep = side === 'left' ? x <= cut : x > cut;
      if (keep) out[y][x] = px[y][x];
    }
  }
  return out;
}

/** A strip of runes for the bindings: glyphs on a band, `along` it (across or down). */
function runeStrip(down: boolean): Px {
  const n = 6;
  const len = n * 6;
  const px = down ? grid(5, len) : grid(len, 5);
  for (let k = 0; k < n; k++) {
    const g = GLYPHS[(k * 3) % GLYPHS.length];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        if (g[j][i] !== '#') continue;
        const a = k * 6 + 1 + i;
        const b = 1 + j;
        const col = (i + j + k) % 3 === 0 ? RUNE[1] : RUNE[0];
        if (down) px[a][b] = col;
        else px[b][a] = col;
      }
    }
  }
  return px;
}

/** The ring of light that goes out as the seal breaks: a circle two pixels thick. */
function ringPx(): Px {
  const n = 41;
  const c = (n - 1) / 2;
  const px = grid(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d > 19.5 && d <= 20.5) px[y][x] = STAR[1];
      else if (d > 18.5 && d <= 19.5) px[y][x] = STAR[3];
    }
  }
  return px;
}

export interface SealArt {
  /** The seal at rest, and lit brighter (it breathes between them). */
  whole: string;
  bright: string;
  /** Cracked, whole; and its halves. */
  cracked: string;
  left: string;
  right: string;
  /** Rune strips for the bands across (36 x 5) and down (5 x 36). */
  runesAcross: string;
  runesDown: string;
  /** The ring of light (41 x 41). */
  ring: string;
}

let art: SealArt | null = null;

export function sealArt(): SealArt {
  if (art) return art;
  const cracked = drawSeal(true, true);
  art = {
    whole: toUrl(drawSeal(false, false)),
    bright: toUrl(drawSeal(true, false)),
    cracked: toUrl(cracked),
    left: toUrl(half(cracked, 'left')),
    right: toUrl(half(cracked, 'right')),
    runesAcross: toUrl(runeStrip(false)),
    runesDown: toUrl(runeStrip(true)),
    ring: toUrl(ringPx()),
  };
  return art;
}
