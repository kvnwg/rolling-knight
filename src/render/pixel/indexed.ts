/**
 * Art taken from asset packs (and Kevin's raccoon sheet) keeps its own colors: each sheet carries
 * a small palette, and its rows index into it with KEYS ('.' is transparent). It decodes into the
 * same PixelBuf as the palette-key art, so it runs in the browser and in Node tools alike.
 *
 * Every frame of a sheet has the same size, so one anchor (ground contact for characters, center
 * for effects) works for all of them. Animations list frame indexes, so poses can be reused.
 */
import { blank, rgb, type PixelBuf } from './buf';

/** Palette entry k is written as KEYS[k] (89 keys; '.' is transparent, quotes and backslash are never keys). */
export const KEYS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-/:;<=>?@[]^_{|}~';

export type IndexedRows = readonly string[];

export interface Anim {
  /** Frames per second. */
  fps: number;
  loop: boolean;
  /** Indexes into AnimSheet.frames. */
  frames: readonly number[];
}

export interface AnimSheet {
  /** Frame size in art pixels. */
  w: number;
  h: number;
  /** Ground contact (characters) or center (effects), in frame pixels. */
  anchor: { readonly x: number; readonly y: number };
  /** Which way the art faces as drawn. */
  faces: 'left' | 'right';
  /** '#rrggbb' colors, indexed by KEYS. */
  pal: readonly string[];
  frames: readonly IndexedRows[];
  anims: Readonly<Record<string, Anim>>;
}

const KEY_INDEX = new Map([...KEYS].map((ch, i) => [ch, i]));

/** Decodes indexed rows. `recolor` swaps palette entries (by index) for other '#rrggbb' colors. */
export function fromIndexed(rows: IndexedRows, pal: readonly string[], recolor?: ReadonlyMap<number, string>): PixelBuf {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const b = blank(w, h);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const k = KEY_INDEX.get(ch);
      if (k === undefined || k >= pal.length) continue;
      const [r, g, bl] = rgb(recolor?.get(k) ?? pal[k]);
      const i = (y * w + x) * 4;
      b.px[i] = r;
      b.px[i + 1] = g;
      b.px[i + 2] = bl;
      b.px[i + 3] = 255;
    }
  }
  return b;
}

/** Throws if a sheet's frames are the wrong size, use unknown indexes, or animations point nowhere. */
export function checkSheet(name: string, s: AnimSheet): void {
  if (s.pal.length > KEYS.length) throw new Error(`${name}: palette too big`);
  for (const c of s.pal) if (!/^#[0-9a-fA-F]{6}$/.test(c)) throw new Error(`${name}: bad color ${c}`);
  s.frames.forEach((rows, f) => {
    if (rows.length !== s.h) throw new Error(`${name}: frame ${f} is ${rows.length} rows, expected ${s.h}`);
    rows.forEach((row, y) => {
      if (row.length !== s.w) throw new Error(`${name}: frame ${f} row ${y} is ${row.length} wide, expected ${s.w}`);
      for (const ch of row) {
        if (ch === '.') continue;
        const k = KEY_INDEX.get(ch);
        if (k === undefined || k >= s.pal.length) throw new Error(`${name}: frame ${f} row ${y} uses unknown index "${ch}"`);
      }
    });
  });
  for (const [anim, a] of Object.entries(s.anims)) {
    if (a.frames.length === 0) throw new Error(`${name}.${anim}: no frames`);
    for (const f of a.frames) if (!(f >= 0 && f < s.frames.length)) throw new Error(`${name}.${anim}: frame ${f} out of range`);
    if (!(a.fps > 0)) throw new Error(`${name}.${anim}: fps must be positive`);
  }
}

/** One frame of a sheet as a buffer. */
export function frameBuf(s: AnimSheet, frame: number, recolor?: ReadonlyMap<number, string>): PixelBuf {
  return fromIndexed(s.frames[frame], s.pal, recolor);
}
