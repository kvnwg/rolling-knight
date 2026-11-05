/**
 * The battle's bitmap font, drawn on the art grid (one font pixel is one art pixel, P screen pixels),
 * so text sits on the same pixel grid as everything else in battle. Three faces (sizes on the 6 px grid):
 *  - small, 3 x 5 (M, N, W and a few symbols wider), 18 x 30 screen px: fine print;
 *  - big, 5 x 7 (I, 1 and punctuation narrower), 30 x 42: damage and heal numbers, the boss's name and
 *    HP, notices, the world title's kicker ("WORLD 1");
 *  - huge, 7 x 9 bold (2-pixel stems, 1-pixel bars; I, T, Y, 1 six wide, punctuation narrower),
 *    42 x 54: banners (FIGHT!, BOSS!, VICTORY!), stamps (CRIT!, K.O.), crit and level-up numbers and
 *    the world's name on its title card.
 * Uppercase only (lowercase is shown in capitals), digits and . , ! ? : ' " - + × / % · ( ) ∞.
 * Anything else shows as '?'. Text gets a 1 art pixel outline in the scene's ink (it joins across the
 * one-pixel gaps between letters, so a word reads as one shape), optionally a drop shadow (one more
 * ink row under it), and fill colors per glyph row, so a lighter top row or a stepped gradient is a
 * list of colors.
 *
 * Pure buffers (no DOM): tests check the glyph tables and the layout in Node.
 */
import { blank, rgb, type PixelBuf } from './buf';

export interface Face {
  /** Glyph height in art pixels. */
  h: number;
  /** Width of a space. */
  space: number;
  /** Rows of '#' (ink) and '.' per character; all rows of a glyph have its width. */
  glyphs: Readonly<Record<string, readonly string[]>>;
}

export type FaceName = 'small' | 'big' | 'huge';

const SMALL_GLYPHS: Record<string, readonly string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '.#.', '.#.'],
  '8': ['.#.', '#.#', '.#.', '#.#', '.#.'],
  '9': ['###', '#.#', '###', '..#', '###'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '.#', '#.'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  ':': ['.', '#', '.', '#', '.'],
  "'": ['#', '#', '.', '.', '.'],
  '"': ['#.#', '#.#', '...', '...', '...'],
  '-': ['...', '...', '###', '...', '...'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '×': ['...', '#.#', '.#.', '#.#', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '·': ['.', '.', '#', '.', '.'],
  '(': ['.#', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '#.'],
  '∞': ['.....', '##.##', '#.#.#', '##.##', '.....'],
};

const BIG_GLYPHS: Record<string, readonly string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  // A small top loop so 8 never reads as B (straight back, equal bowls).
  '8': ['.###.', '.#.#.', '.#.#.', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '..', '..', '.#', '#.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  ':': ['.', '.', '#', '.', '.', '#', '.'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  '"': ['#.#', '#.#', '...', '...', '...', '...', '...'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '·': ['.', '.', '.', '#', '.', '.', '.'],
  '(': ['..#', '.#.', '#..', '#..', '#..', '.#.', '..#'],
  ')': ['#..', '.#.', '..#', '..#', '..#', '.#.', '#..'],
  '∞': ['.......', '.......', '.##.##.', '#..#..#', '.##.##.', '.......', '.......'],
};

/** 7 x 9 bold: two-pixel stems and one-pixel bars, for titles that have to read at a glance. */
const HUGE_GLYPHS: Record<string, readonly string[]> = {
  A: ['.#####.', '##...##', '##...##', '##...##', '#######', '##...##', '##...##', '##...##', '##...##'],
  B: ['######.', '##...##', '##...##', '##...##', '######.', '##...##', '##...##', '##...##', '######.'],
  C: ['.######', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '.######'],
  D: ['#####..', '##..##.', '##...##', '##...##', '##...##', '##...##', '##...##', '##..##.', '#####..'],
  E: ['#######', '##.....', '##.....', '##.....', '######.', '##.....', '##.....', '##.....', '#######'],
  F: ['#######', '##.....', '##.....', '##.....', '######.', '##.....', '##.....', '##.....', '##.....'],
  G: ['.#####.', '##...##', '##.....', '##.....', '##..###', '##...##', '##...##', '##...##', '.######'],
  H: ['##...##', '##...##', '##...##', '##...##', '#######', '##...##', '##...##', '##...##', '##...##'],
  I: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '######'],
  J: ['.....##', '.....##', '.....##', '.....##', '.....##', '.....##', '##...##', '##...##', '.#####.'],
  K: ['##...##', '##..##.', '##.##..', '####...', '###....', '####...', '##.##..', '##..##.', '##...##'],
  L: ['##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '#######'],
  M: ['##...##', '###.###', '#######', '##.#.##', '##.#.##', '##...##', '##...##', '##...##', '##...##'],
  N: ['##...##', '###..##', '###..##', '##.#.##', '##.#.##', '##..###', '##..###', '##...##', '##...##'],
  O: ['.#####.', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
  P: ['######.', '##...##', '##...##', '##...##', '######.', '##.....', '##.....', '##.....', '##.....'],
  Q: ['.#####.', '##...##', '##...##', '##...##', '##...##', '##...##', '##.#.##', '##..##.', '.###.##'],
  R: ['######.', '##...##', '##...##', '##...##', '######.', '##.##..', '##..##.', '##...##', '##...##'],
  S: ['.######', '##.....', '##.....', '##.....', '.#####.', '.....##', '.....##', '.....##', '######.'],
  T: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  U: ['##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
  V: ['##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '.##.##.', '..###..', '...#...'],
  W: ['##...##', '##...##', '##...##', '##...##', '##.#.##', '##.#.##', '#######', '###.###', '##...##'],
  X: ['##...##', '##...##', '.##.##.', '..###..', '...#...', '..###..', '.##.##.', '##...##', '##...##'],
  Y: ['##..##', '##..##', '##..##', '.####.', '..##..', '..##..', '..##..', '..##..', '..##..'],
  Z: ['#######', '.....##', '.....##', '....##.', '...##..', '..##...', '.##....', '##.....', '#######'],
  '0': ['.#####.', '##...##', '##...##', '##..###', '##.#.##', '###..##', '##...##', '##...##', '.#####.'],
  '1': ['..##..', '.###..', '####..', '..##..', '..##..', '..##..', '..##..', '..##..', '######'],
  '2': ['.#####.', '##...##', '.....##', '.....##', '...###.', '.###...', '##.....', '##.....', '#######'],
  '3': ['.#####.', '##...##', '.....##', '.....##', '..####.', '.....##', '.....##', '##...##', '.#####.'],
  '4': ['....###', '...####', '..##.##', '.##..##', '##...##', '#######', '.....##', '.....##', '.....##'],
  '5': ['#######', '##.....', '##.....', '######.', '.....##', '.....##', '.....##', '##...##', '.#####.'],
  '6': ['..####.', '.##....', '##.....', '##.....', '######.', '##...##', '##...##', '##...##', '.#####.'],
  '7': ['#######', '.....##', '.....##', '....##.', '...##..', '..##...', '..##...', '..##...', '..##...'],
  // A small top loop so 8 never reads as B.
  '8': ['..###..', '.##.##.', '.##.##.', '..###..', '.#####.', '##...##', '##...##', '##...##', '.#####.'],
  '9': ['.#####.', '##...##', '##...##', '##...##', '.######', '.....##', '.....##', '....##.', '.####..'],
  '.': ['..', '..', '..', '..', '..', '..', '..', '##', '##'],
  ',': ['..', '..', '..', '..', '..', '..', '##', '.#', '#.'],
  '!': ['##', '##', '##', '##', '##', '##', '..', '##', '##'],
  '?': ['.#####.', '##...##', '.....##', '....##.', '...##..', '...##..', '.......', '...##..', '...##..'],
  ':': ['..', '..', '##', '##', '..', '..', '##', '##', '..'],
  "'": ['##', '##', '#.', '..', '..', '..', '..', '..', '..'],
  '"': ['##.##', '##.##', '#..#.', '.....', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '.....', '#####', '.....', '.....', '.....', '.....'],
  '+': ['......', '......', '..##..', '..##..', '######', '..##..', '..##..', '......', '......'],
  '×': ['.......', '.......', '##...##', '.##.##.', '..###..', '.##.##.', '##...##', '.......', '.......'],
  '/': ['.....##', '.....##', '....##.', '...##..', '...##..', '..##...', '.##....', '##.....', '##.....'],
  '%': ['##....#', '##...##', '....##.', '...##..', '...##..', '..##...', '.##....', '##...##', '#....##'],
  '·': ['..', '..', '..', '##', '##', '..', '..', '..', '..'],
  '(': ['..##', '.##.', '##..', '##..', '##..', '##..', '##..', '.##.', '..##'],
  ')': ['##..', '.##.', '..##', '..##', '..##', '..##', '..##', '.##.', '##..'],
  '∞': ['.........', '.........', '.##...##.', '#..#.#..#', '#...#...#', '#..#.#..#', '.##...##.', '.........', '.........'],
};

export const FACES: Readonly<Record<FaceName, Face>> = {
  small: { h: 5, space: 2, glyphs: SMALL_GLYPHS },
  big: { h: 7, space: 3, glyphs: BIG_GLYPHS },
  huge: { h: 9, space: 4, glyphs: HUGE_GLYPHS },
};

/** The characters every face draws (besides the space). */
export const CHARSET = Object.keys(SMALL_GLYPHS).join('');

/** A character as the font shows it: capitals, typographic quotes and dashes folded to plain ones. */
function fold(ch: string): string {
  const up = ch.toUpperCase();
  if (up.length !== 1) return up;
  if (up === '’' || up === '‘') return "'";
  if (up === '“' || up === '”') return '"';
  if (up === '–' || up === '—') return '-';
  return up;
}

/** The rows of `ch` in `face` ('?' for anything the font doesn't draw; spaces are blank). */
export function glyph(face: Face, ch: string): readonly string[] {
  if (ch === ' ') return Array.from({ length: face.h }, () => '.'.repeat(face.space));
  return face.glyphs[ch] ?? face.glyphs['?'];
}

/** The characters of `text` as the font shows them (capitals; folded quotes and dashes). */
export function fontChars(text: string): string[] {
  const out: string[] = [];
  for (const ch of text) {
    for (const c of fold(ch)) out.push(c);
  }
  return out;
}

/** Width of one line of text in art pixels (glyphs and the one-pixel gaps between them, no outline). */
export function lineWidth(text: string, face: Face): number {
  const chars = fontChars(text);
  let w = 0;
  chars.forEach((ch, i) => {
    w += glyph(face, ch)[0].length + (i > 0 ? 1 : 0);
  });
  return w;
}

/**
 * Splits text into lines no wider than `maxW` art pixels, breaking at spaces (and after '-' or '/'
 * when a word alone is too wide). Explicit '\n' always breaks.
 */
export function wrapText(text: string, face: Face, maxW = Infinity): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ').filter((w, _, all) => w.length > 0 || all.length === 1)) {
      const next = line ? `${line} ${word}` : word;
      if (!line || lineWidth(next, face) <= maxW) {
        line = next;
        continue;
      }
      lines.push(line);
      line = word;
    }
    // A single word wider than the room breaks after a hyphen or slash if it has one.
    while (lineWidth(line, face) > maxW) {
      const cut = Math.max(line.lastIndexOf('-', line.length - 2), line.lastIndexOf('/', line.length - 2));
      if (cut <= 0) break;
      lines.push(line.slice(0, cut + 1));
      line = line.slice(cut + 1);
    }
    lines.push(line);
  }
  return lines;
}

/**
 * wrapText with lines as even as it can make them: the narrowest width that still needs no more lines
 * ("GUY WHO IS CONCERNED / ABOUT POWERFUL RACCOON", not "...CONCERNED ABOUT / POWERFUL RACCOON").
 */
export function wrapBalanced(text: string, face: Face, maxW = Infinity): string[] {
  const lines = wrapText(text, face, maxW);
  if (lines.length < 2) return lines;
  let lo = Math.max(...wrapText(text, face, 0).map((l) => lineWidth(l, face)));
  let hi = Math.max(...lines.map((l) => lineWidth(l, face)));
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (wrapText(text, face, mid).length <= lines.length) hi = mid;
    else lo = mid + 1;
  }
  return wrapText(text, face, hi);
}

export interface TextStyle {
  face: FaceName;
  /** Fill color, or one color per glyph row from the top (a lighter top row, a stepped gradient). */
  fill: string | readonly string[];
  /** Outline color, 1 art pixel all round (corners included); null for none. Default: the ink. */
  ink?: string | null;
  /** One more ink row under the outline. */
  shadow?: boolean;
  /** Wrap lines to this many art pixels (glyphs only, outline not counted), as evenly as it can. */
  maxW?: number;
  /** How lines line up with each other (default: centered). */
  align?: 'left' | 'center' | 'right';
  /**
   * A kicker: the text's first line (up to its first '\n') is set in this face over the rest, its
   * outline merged with the title's ("WORLD 1" over "SUNNY SUBURBS"). Not wrapped, no shadow.
   */
  lead?: FaceName;
}

/** The battle's ink: text outlines (the scene's line color). */
export const TEXT_INK = '#1a1326';

/** Rows between the tops of two lines (the outlines between them merge into one row). */
export function linePitch(face: Face): number {
  return face.h + 1;
}

/**
 * Renders text into a buffer: glyphs filled, outlined, with a 1 pixel border all round for the
 * outline (and one more row at the bottom for the shadow). Fully opaque or fully clear pixels only.
 * With `lead`, the first line is a kicker in that face over the rest (stackText).
 */
export function renderText(text: string, style: TextStyle): PixelBuf {
  const cut = style.lead ? text.indexOf('\n') : -1;
  if (style.lead && cut >= 0) {
    const kicker = renderText(text.slice(0, cut), { ...style, face: style.lead, lead: undefined, shadow: false, maxW: undefined });
    const title = renderText(text.slice(cut + 1), { ...style, lead: undefined });
    return stackText([kicker, title], style.ink === null ? 1 : -1, style.align);
  }
  const face = FACES[style.face];
  const lines = wrapBalanced(text, face, style.maxW);
  const widths = lines.map((l) => lineWidth(l, face));
  const inner = Math.max(1, ...widths);
  const pitch = linePitch(face);
  const ink = style.ink === undefined ? TEXT_INK : style.ink;
  const pad = ink ? 1 : 0;
  const shadow = ink && style.shadow ? 1 : 0;
  const innerH = lines.length * face.h + (lines.length - 1) * (pitch - face.h);
  const b = blank(inner + pad * 2, innerH + pad * 2 + shadow);
  const fills = (typeof style.fill === 'string' ? [style.fill] : style.fill).map((c) => rgb(c));
  const mask = new Uint8Array(b.w * b.h);
  lines.forEach((line, li) => {
    const w = widths[li];
    let x = pad + (style.align === 'left' ? 0 : style.align === 'right' ? inner - w : Math.floor((inner - w) / 2));
    const y0 = pad + li * pitch;
    for (const ch of fontChars(line)) {
      const rows = glyph(face, ch);
      rows.forEach((row, gy) => {
        const [r, g, bl] = fills[Math.min(gy, fills.length - 1)];
        for (let gx = 0; gx < row.length; gx++) {
          if (row[gx] !== '#') continue;
          const i = (y0 + gy) * b.w + x + gx;
          mask[i] = 1;
          b.px[i * 4] = r;
          b.px[i * 4 + 1] = g;
          b.px[i * 4 + 2] = bl;
          b.px[i * 4 + 3] = 255;
        }
      });
      x += rows[0].length + 1;
    }
  });
  if (ink) {
    const [r, g, bl] = rgb(ink);
    const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < b.w && y < b.h && mask[y * b.w + x] === 1;
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        if (mask[y * b.w + x]) continue;
        let near = false;
        for (let dy = -1 - shadow; dy <= 1 && !near; dy++) {
          for (let dx = -1; dx <= 1 && !near; dx++) near = filled(x + dx, y + dy);
        }
        if (!near) continue;
        const i = (y * b.w + x) * 4;
        b.px[i] = r;
        b.px[i + 1] = g;
        b.px[i + 2] = bl;
        b.px[i + 3] = 255;
      }
    }
  }
  return b;
}

/**
 * Text buffers one under another, `gap` rows apart (-1: the outlines of the two share a row), lined
 * up like the lines of one text (centered by default). Opaque pixels win where they overlap.
 */
export function stackText(parts: readonly PixelBuf[], gap = -1, align: TextStyle['align'] = 'center'): PixelBuf {
  const w = Math.max(1, ...parts.map((p) => p.w));
  const h = parts.reduce((sum, p) => sum + p.h, 0) + gap * Math.max(0, parts.length - 1);
  const b = blank(w, Math.max(1, h));
  let y = 0;
  for (const p of parts) {
    const x0 = align === 'left' ? 0 : align === 'right' ? w - p.w : Math.floor((w - p.w) / 2);
    for (let py = 0; py < p.h; py++) {
      for (let px = 0; px < p.w; px++) {
        const si = (py * p.w + px) * 4;
        if (!p.px[si + 3]) continue;
        b.px.set(p.px.subarray(si, si + 4), ((y + py) * w + x0 + px) * 4);
      }
    }
    y += p.h + gap;
  }
  return b;
}

/**
 * A stepped gradient for a glyph face: `n` row colors from `top` to `bottom` in two or three flat
 * bands (pixel art steps, not a smooth ramp).
 */
export function gradientRows(top: string, bottom: string, n: number): string[] {
  const [r1, g1, b1] = rgb(top);
  const [r2, g2, b2] = rgb(bottom);
  const steps = n >= 7 ? 3 : 2;
  const hex = (k: number) => {
    const c = [r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k].map((v) => Math.round(v).toString(16).padStart(2, '0'));
    return `#${c.join('')}`;
  };
  return Array.from({ length: n }, (_, y) => {
    const band = Math.min(steps - 1, Math.floor((y / n) * steps));
    return hex(band / (steps - 1));
  });
}

/**
 * A notice plate: text buffers centered one under another on a panel in flat bands of `bg` (top to
 * bottom), framed in `ink` with cut corners and a one-row shadow under the frame.
 */
export function renderPlate(parts: readonly PixelBuf[], bg: readonly string[], opts: { ink?: string; padX?: number; padY?: number; gap?: number } = {}): PixelBuf {
  const ink = rgb(opts.ink ?? TEXT_INK);
  const padX = opts.padX ?? 4;
  const padY = opts.padY ?? 2;
  const gap = opts.gap ?? 2;
  const innerW = Math.max(1, ...parts.map((p) => p.w)) + padX * 2;
  const innerH = parts.reduce((h, p) => h + p.h, 0) + gap * Math.max(0, parts.length - 1) + padY * 2;
  const b = blank(innerW + 2, innerH + 3);
  const fill = (x: number, y: number, w: number, h: number, c: readonly [number, number, number]) => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const i = (yy * b.w + xx) * 4;
        b.px[i] = c[0];
        b.px[i + 1] = c[1];
        b.px[i + 2] = c[2];
        b.px[i + 3] = 255;
      }
    }
  };
  // The frame (corners cut) and the shadow row under it.
  fill(1, 0, innerW, 1, ink);
  fill(0, 1, 1, innerH, ink);
  fill(innerW + 1, 1, 1, innerH, ink);
  fill(1, innerH + 1, innerW, 2, ink);
  // The panel in flat bands.
  for (let y = 0; y < innerH; y++) fill(1, 1 + y, innerW, 1, rgb(bg[Math.min(bg.length - 1, Math.floor((y / innerH) * bg.length))]));
  let y = 1 + padY;
  for (const p of parts) {
    const x0 = 1 + Math.floor((innerW - p.w) / 2);
    for (let py = 0; py < p.h; py++) {
      for (let px = 0; px < p.w; px++) {
        const si = (py * p.w + px) * 4;
        if (!p.px[si + 3]) continue;
        b.px.set(p.px.subarray(si, si + 4), ((y + py) * b.w + x0 + px) * 4);
      }
    }
    y += p.h + gap;
  }
  return b;
}
