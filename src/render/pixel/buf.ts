/**
 * Pure pixel buffers (RGBA, no DOM) so the same art code runs in the browser and in Node tools.
 * Sprites are authored as rows of palette characters (see palette.ts); '.' is transparent.
 * Every operation here works at 1 art pixel = 1 buffer pixel; scaling happens only at the end.
 */
import { PAL } from './palette';

export interface PixelBuf {
  w: number;
  h: number;
  /** RGBA, row-major. Alpha is 0 or 255. */
  px: Uint8ClampedArray;
}

export type Rows = readonly string[];

/** A named entry for preview sheets (tools/pixelSheet.ts). */
export interface SheetEntry {
  name: string;
  buf: PixelBuf;
}

export function blank(w: number, h: number): PixelBuf {
  return { w, h, px: new Uint8ClampedArray(w * h * 4) };
}

const rgbaCache = new Map<string, [number, number, number]>();

export function rgb(hex: string): [number, number, number] {
  let c = rgbaCache.get(hex);
  if (!c) {
    const h = hex.replace('#', '');
    c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    rgbaCache.set(hex, c);
  }
  return c;
}

export function toHex(r: number, g: number, b: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

/** Resolves a palette key or a #hex color. */
export function color(c: string): string {
  if (c.startsWith('#')) return c;
  const hex = (PAL as Record<string, string>)[c];
  if (!hex) throw new Error(`Unknown palette key "${c}"`);
  return hex;
}

/** Throws if rows are ragged or use characters outside the palette. */
export function checkRows(name: string, rows: Rows): void {
  if (rows.length === 0) throw new Error(`${name}: no rows`);
  const w = rows[0].length;
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${name}: row ${y} is ${row.length} wide, expected ${w}`);
    for (const ch of row) {
      if (ch !== '.' && !(ch in PAL)) throw new Error(`${name}: row ${y} uses unknown key "${ch}"`);
    }
  });
}

/**
 * Builds a buffer from rows. `recolor` swaps keys for other keys or #hex colors
 * (used for world recolors and rarity tints).
 */
export function fromRows(rows: Rows, recolor?: Partial<Record<string, string>>): PixelBuf {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const b = blank(w, h);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const mapped = recolor?.[ch] ?? ch;
      const [r, g, bl] = rgb(color(mapped));
      const i = (y * w + x) * 4;
      b.px[i] = r;
      b.px[i + 1] = g;
      b.px[i + 2] = bl;
      b.px[i + 3] = 255;
    }
  }
  return b;
}

export function alphaAt(b: PixelBuf, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return 0;
  return b.px[(y * b.w + x) * 4 + 3];
}

export function setPx(b: PixelBuf, x: number, y: number, hex: string): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const [r, g, bl] = rgb(color(hex));
  const i = (y * b.w + x) * 4;
  b.px[i] = r;
  b.px[i + 1] = g;
  b.px[i + 2] = bl;
  b.px[i + 3] = 255;
}

export function clearPx(b: PixelBuf, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  b.px[(y * b.w + x) * 4 + 3] = 0;
}

export function fill(b: PixelBuf, x: number, y: number, w: number, h: number, hex: string): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPx(b, xx, yy, hex);
}

/** Copies the opaque pixels of `src` onto `dst` at (x, y). `wrapX` repeats across a tiling edge. */
export function blit(dst: PixelBuf, src: PixelBuf, x: number, y: number, opts: { flipX?: boolean; wrapX?: boolean } = {}): void {
  for (let sy = 0; sy < src.h; sy++) {
    for (let sx = 0; sx < src.w; sx++) {
      const si = (sy * src.w + (opts.flipX ? src.w - 1 - sx : sx)) * 4;
      if (src.px[si + 3] === 0) continue;
      let dx = x + sx;
      const dy = y + sy;
      if (opts.wrapX) dx = ((dx % dst.w) + dst.w) % dst.w;
      if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
      const di = (dy * dst.w + dx) * 4;
      dst.px[di] = src.px[si];
      dst.px[di + 1] = src.px[si + 1];
      dst.px[di + 2] = src.px[si + 2];
      dst.px[di + 3] = 255;
    }
  }
}

/** Blits rows straight onto a buffer (shorthand for blit(fromRows(...))). */
export function stamp(dst: PixelBuf, rows: Rows, x: number, y: number, opts: { flipX?: boolean; wrapX?: boolean; recolor?: Partial<Record<string, string>> } = {}): void {
  blit(dst, fromRows(rows, opts.recolor), x, y, opts);
}

/** Every pixel becomes an n x n block (for art drawn at a coarser pixel size). */
export function scaleUp(b: PixelBuf, n: number): PixelBuf {
  const out = blank(b.w * n, b.h * n);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const si = (Math.floor(y / n) * b.w + Math.floor(x / n)) * 4;
      out.px.set(b.px.subarray(si, si + 4), (y * out.w + x) * 4);
    }
  }
  return out;
}

/**
 * Half resolution: each 2 x 2 block becomes one pixel. A block is opaque when at least `minOpaque`
 * of its pixels are; it takes its most common color, ties going to the darker one (keeps outlines).
 */
export function downsample2(b: PixelBuf, minOpaque = 2): PixelBuf {
  const w = Math.ceil(b.w / 2);
  const h = Math.ceil(b.h / 2);
  const out = blank(w, h);
  const lum = (i: number) => b.px[i] * 0.3 + b.px[i + 1] * 0.59 + b.px[i + 2] * 0.11;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx: number[] = [];
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx;
          const sy = y * 2 + dy;
          if (sx >= b.w || sy >= b.h) continue;
          const i = (sy * b.w + sx) * 4;
          if (b.px[i + 3]) idx.push(i);
        }
      }
      if (idx.length < minOpaque) continue;
      let best = idx[0];
      let bestN = 0;
      for (const i of idx) {
        let n = 0;
        for (const j of idx) if (b.px[i] === b.px[j] && b.px[i + 1] === b.px[j + 1] && b.px[i + 2] === b.px[j + 2]) n++;
        if (n > bestN || (n === bestN && lum(i) < lum(best))) {
          best = i;
          bestN = n;
        }
      }
      out.px.set([b.px[best], b.px[best + 1], b.px[best + 2], 255], (y * w + x) * 4);
    }
  }
  return out;
}

export function clone(b: PixelBuf): PixelBuf {
  return { w: b.w, h: b.h, px: new Uint8ClampedArray(b.px) };
}

export function flipX(b: PixelBuf): PixelBuf {
  const out = blank(b.w, b.h);
  blit(out, b, 0, 0, { flipX: true });
  return out;
}

/** Rotates by quarter turns clockwise (pixel-perfect). */
export function rot90(b: PixelBuf, turns = 1): PixelBuf {
  let cur = b;
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) {
    const out = blank(cur.h, cur.w);
    for (let y = 0; y < cur.h; y++) {
      for (let x = 0; x < cur.w; x++) {
        const si = (y * cur.w + x) * 4;
        const nx = cur.h - 1 - y;
        const ny = x;
        const di = (ny * out.w + nx) * 4;
        out.px.set(cur.px.subarray(si, si + 4), di);
      }
    }
    cur = out;
  }
  return cur;
}

/** Grows the canvas by `n` transparent pixels on every side. */
export function pad(b: PixelBuf, n: number): PixelBuf {
  const out = blank(b.w + 2 * n, b.h + 2 * n);
  blit(out, b, n, n);
  return out;
}

/** Adds a 1px outline around every opaque shape (grows the canvas by 1px on each side). */
export function outline(b: PixelBuf, hex: string = PAL.k, diagonal = false): PixelBuf {
  const out = pad(b, 1);
  const src = clone(out);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      if (alphaAt(src, x, y)) continue;
      const near =
        alphaAt(src, x - 1, y) || alphaAt(src, x + 1, y) || alphaAt(src, x, y - 1) || alphaAt(src, x, y + 1) ||
        (diagonal && (alphaAt(src, x - 1, y - 1) || alphaAt(src, x + 1, y - 1) || alphaAt(src, x - 1, y + 1) || alphaAt(src, x + 1, y + 1)));
      if (near) setPx(out, x, y, hex);
    }
  }
  return out;
}

/** Every opaque pixel in one color (the blacked-out "mystery" look). */
export function silhouette(b: PixelBuf, hex: string = PAL.k): PixelBuf {
  const out = clone(b);
  const [r, g, bl] = rgb(color(hex));
  for (let i = 0; i < out.px.length; i += 4) {
    if (out.px[i + 3] === 0) continue;
    out.px[i] = r;
    out.px[i + 1] = g;
    out.px[i + 2] = bl;
  }
  return out;
}

/** Tight bounds of the opaque pixels. */
export function bounds(b: PixelBuf): { x: number; y: number; w: number; h: number } {
  let x0 = b.w;
  let y0 = b.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (!alphaAt(b, x, y)) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function crop(b: PixelBuf, x: number, y: number, w: number, h: number): PixelBuf {
  const out = blank(w, h);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const sx = x + xx;
      const sy = y + yy;
      if (sx < 0 || sy < 0 || sx >= b.w || sy >= b.h) continue;
      const si = (sy * b.w + sx) * 4;
      out.px.set(b.px.subarray(si, si + 4), (yy * w + xx) * 4);
    }
  }
  return out;
}

/** Mixes two colors (t = 0 gives a, 1 gives b). */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(color(a));
  const [r2, g2, b2] = rgb(color(b));
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** A dark / mid / light ramp built around one color, for recoloring sprites per world. */
export function rampOf(hex: string): [string, string, string] {
  return [mix(hex, '#1a1326', 0.38), color(hex), mix(hex, '#ffffff', 0.32)];
}

/** Deterministic 0..1 noise for scattering details. */
export function hash01(i: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Scale2x (EPX): twice the resolution, each pixel becoming 2 x 2 and taking a neighbor's color where
 * two neighbors agree along a diagonal. Diagonals come out smoother and no new colors appear, so a
 * big icon keeps the game's pixel size instead of showing doubled pixels. Outside the edge counts
 * as transparent.
 */
export function scale2x(b: PixelBuf): PixelBuf {
  const out = blank(b.w * 2, b.h * 2);
  // A pixel's color as one number (every transparent pixel is the same).
  const at = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= b.w || y >= b.h) return -1;
    const i = (y * b.w + x) * 4;
    return b.px[i + 3] === 0 ? -1 : (b.px[i] << 16) | (b.px[i + 1] << 8) | b.px[i + 2];
  };
  const put = (x: number, y: number, v: number) => {
    if (v < 0) return;
    const i = (y * out.w + x) * 4;
    out.px[i] = (v >> 16) & 255;
    out.px[i + 1] = (v >> 8) & 255;
    out.px[i + 2] = v & 255;
    out.px[i + 3] = 255;
  };
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const p = at(x, y);
      const a = at(x, y - 1);
      const r = at(x + 1, y);
      const l = at(x - 1, y);
      const d = at(x, y + 1);
      put(2 * x, 2 * y, l === a && l !== d && a !== r ? a : p);
      put(2 * x + 1, 2 * y, a === r && a !== l && r !== d ? r : p);
      put(2 * x, 2 * y + 1, d === l && d !== r && l !== a ? l : p);
      put(2 * x + 1, 2 * y + 1, r === d && r !== a && d !== l ? d : p);
    }
  }
  return out;
}

/**
 * Scale3x (AdvMAME3x): three times the resolution, the Scale2x idea on a 3 x 3 block. Each pixel takes
 * a neighbor's color at its corners and edges where neighbors agree along a diagonal, so slopes come
 * out as finer steps and no new colors appear. Outside the edge counts as transparent.
 */
export function scale3x(b: PixelBuf): PixelBuf {
  const out = blank(b.w * 3, b.h * 3);
  const at = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= b.w || y >= b.h) return -1;
    const i = (y * b.w + x) * 4;
    return b.px[i + 3] === 0 ? -1 : (b.px[i] << 16) | (b.px[i + 1] << 8) | b.px[i + 2];
  };
  const put = (x: number, y: number, v: number) => {
    if (v < 0) return;
    const i = (y * out.w + x) * 4;
    out.px[i] = (v >> 16) & 255;
    out.px[i + 1] = (v >> 8) & 255;
    out.px[i + 2] = v & 255;
    out.px[i + 3] = 255;
  };
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      // A B C / D E F / G H I around E.
      const a = at(x - 1, y - 1);
      const bb = at(x, y - 1);
      const c = at(x + 1, y - 1);
      const d = at(x - 1, y);
      const e = at(x, y);
      const f = at(x + 1, y);
      const g = at(x - 1, y + 1);
      const h = at(x, y + 1);
      const i = at(x + 1, y + 1);
      const db = d === bb && bb !== f && d !== h;
      const bf = bb === f && bb !== d && f !== h;
      const dh = d === h && d !== f && h !== bb;
      const hf = h === f && d !== f && bb !== h;
      const cells = [
        db ? d : e,
        (db && e !== c) || (bf && e !== a) ? bb : e,
        bf ? f : e,
        (db && e !== g) || (dh && e !== a) ? d : e,
        e,
        (bf && e !== i) || (hf && e !== c) ? f : e,
        dh ? d : e,
        (dh && e !== i) || (hf && e !== g) ? h : e,
        hf ? f : e,
      ];
      for (let k = 0; k < 9; k++) put(3 * x + (k % 3), 3 * y + Math.floor(k / 3), cells[k]);
    }
  }
  return out;
}

/** Grows a buffer by `n` pixels on every side, repeating its edge pixels outward (for full-view art). */
export function padEdges(b: PixelBuf, n: number): PixelBuf {
  const out = blank(b.w + 2 * n, b.h + 2 * n);
  for (let y = 0; y < out.h; y++) {
    const sy = Math.max(0, Math.min(b.h - 1, y - n));
    for (let x = 0; x < out.w; x++) {
      const sx = Math.max(0, Math.min(b.w - 1, x - n));
      const si = (sy * b.w + sx) * 4;
      out.px.set(b.px.subarray(si, si + 4), (y * out.w + x) * 4);
    }
  }
  return out;
}

/**
 * The pixels of a line through the given points, in order (Bresenham, 8-connected, each pixel once):
 * a 1-pixel line on the art grid.
 */
export function linePixels(points: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const seen = new Set<string>();
  const add = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push([x, y]);
  };
  if (points.length === 1) add(Math.round(points[0][0]), Math.round(points[0][1]));
  for (let i = 0; i + 1 < points.length; i++) {
    let x0 = Math.round(points[i][0]);
    let y0 = Math.round(points[i][1]);
    const x1 = Math.round(points[i + 1][0]);
    const y1 = Math.round(points[i + 1][1]);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      add(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  return out;
}
