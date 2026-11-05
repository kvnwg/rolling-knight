/**
 * PixelForge sheets in the game (made by tools/packs/pixelforge.py from PixelForge's exports): the
 * animations as frames and durations per direction, each distinct frame once in an indexed PNG, and
 * the palette with the material and shade of every color.
 *
 * Recoloring is a palette swap per frame: a frame's pixels are read once as palette indices, then
 * any recolor (rarity armor, a mutation, a biome's monster) is a lookup per pixel into that recolor's
 * palette, done the first time that frame is drawn in that recolor and cached. Nothing is scaled,
 * rotated or flipped: west is PixelForge's own drawing.
 */
import { blank, type PixelBuf } from '../pixel/buf';

export type Dir = 's' | 'e' | 'n' | 'w';
export const DIRS: readonly Dir[] = ['s', 'e', 'n', 'w'];

/** [frame index, ms] */
export type FrameRef = [number, number];

export interface PFAnim {
  loop: boolean;
  dirs: Partial<Record<Dir, FrameRef[]>>;
  /** One letter per frame: w(indup), a(ctive), r(ecovery), or '-'. */
  phases?: string;
  /** [frame, type, fx?]: windup, hit, spawn, vfx, recover, summon, footstep. */
  events?: Array<[number, string, string?]>;
  loopFrames?: number[];
  /** Pixels the feet carry the body each frame (walks). */
  stride?: number[];
  /** FX: the pixel placed on the point it plays at, per direction. */
  pivots?: Partial<Record<Dir, [number, number]>>;
}

export interface PFMeta {
  name: string;
  cell: number;
  pivot: [number, number];
  cols: number;
  count: number;
  /** [hex, alpha, material, shade]; palette index = position + 1 (0 is transparent). */
  colors: Array<[string, number, string, number]>;
  /** Per frame: the topmost solid row and the middle of it (-1 when empty). */
  tops: Array<[number, number]>;
  anims: Record<string, PFAnim>;
  /** Knights, per frame: chin x, y, back x, y, hip x, y (the rig's anchors). */
  anchors?: Array<number[] | null>;
}

/** Material name -> ramp (dark to light) to paint it with instead of its own. */
export type Recolor = Partial<Record<string, readonly string[]>>;

/** Pixels of one decoded sheet image (RGBA, row-major). */
export interface SheetPixels {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

const rgbOf = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

export class PFSheet {
  readonly meta: PFMeta;
  private pixels: SheetPixels | null = null;
  private cells: Array<Uint8Array | undefined> = [];
  /** Packed RGB -> palette index, for reading the decoded image back. */
  private lookup = new Map<number, number>();
  private shadowIndex = 0;

  constructor(meta: PFMeta) {
    this.meta = meta;
    meta.colors.forEach(([hex, a, mat], i) => {
      if (a < 255 || mat === 'shadow') this.shadowIndex = i + 1;
      else {
        const [r, g, b] = rgbOf(hex);
        this.lookup.set((r << 16) | (g << 8) | b, i + 1);
      }
    });
  }

  get ready(): boolean {
    return !!this.pixels;
  }

  setPixels(p: SheetPixels): void {
    this.pixels = p;
    this.cells = [];
  }

  has(anim: string, dir?: Dir): boolean {
    const a = this.meta.anims[anim];
    return !!a && (!dir || !!a.dirs[dir]);
  }

  /** The frames of `anim` facing `dir` (falls back to another drawn direction, never flips). */
  clip(anim: string, dir: Dir): FrameRef[] {
    const a = this.meta.anims[anim];
    if (!a) throw new Error(`${this.meta.name}: no ${anim}`);
    return a.dirs[dir] ?? a.dirs.s ?? a.dirs.e ?? (Object.values(a.dirs)[0] as FrameRef[]);
  }

  /** A frame's palette indices (cell x cell), read from the image the first time. */
  indices(k: number): Uint8Array {
    let f = this.cells[k];
    if (f) return f;
    const { cell, cols } = this.meta;
    f = new Uint8Array(cell * cell);
    const p = this.pixels;
    if (p) {
      const ox = (k % cols) * cell;
      const oy = Math.floor(k / cols) * cell;
      const colors = this.meta.colors.map(([hex]) => rgbOf(hex));
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const i = ((oy + y) * p.w + ox + x) * 4;
          const a = p.data[i + 3];
          if (!a) continue;
          if (a < 250) {
            f[y * cell + x] = this.shadowIndex;
            continue;
          }
          const r = p.data[i];
          const g = p.data[i + 1];
          const b = p.data[i + 2];
          let idx = this.lookup.get((r << 16) | (g << 8) | b);
          if (idx === undefined) {
            // A browser that adds noise to canvas reads: take the nearest palette color.
            let best = Infinity;
            idx = 1;
            colors.forEach(([cr, cg, cb], j) => {
              if (j + 1 === this.shadowIndex) return;
              const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
              if (d < best) {
                best = d;
                idx = j + 1;
              }
            });
            this.lookup.set((r << 16) | (g << 8) | b, idx);
          }
          f[y * cell + x] = idx;
        }
      }
    }
    if (p) this.cells[k] = f;
    return f;
  }

  /**
   * The palette for a recolor: RGBA per index. A material's ramp is matched by shade (a ramp with
   * fewer shades than the material repeats its last one). `flash` paints every color but the
   * outline and the shadow in one color (hit flashes).
   */
  palette(recolor: Recolor = {}, flash?: string): Uint8ClampedArray {
    const pal = new Uint8ClampedArray((this.meta.colors.length + 1) * 4);
    const fl = flash ? rgbOf(flash) : null;
    this.meta.colors.forEach(([hex, a, mat, shade], i) => {
      let rgb = rgbOf(hex);
      const r = recolor[mat];
      if (r && r.length) rgb = rgbOf(r[Math.min(shade, r.length - 1)]);
      if (fl && mat !== 'outline' && mat !== 'shadow') rgb = fl;
      pal.set([rgb[0], rgb[1], rgb[2], a], (i + 1) * 4);
    });
    return pal;
  }

  /** One frame, recolored, as a pixel buffer (cell x cell). */
  frameBuf(k: number, pal: Uint8ClampedArray): PixelBuf {
    const { cell } = this.meta;
    const idx = this.indices(k);
    const b = blank(cell, cell);
    for (let i = 0; i < idx.length; i++) {
      const c = idx[i];
      if (!c) continue;
      b.px[i * 4] = pal[c * 4];
      b.px[i * 4 + 1] = pal[c * 4 + 1];
      b.px[i * 4 + 2] = pal[c * 4 + 2];
      b.px[i * 4 + 3] = pal[c * 4 + 3];
    }
    return b;
  }
}

/** Where a frame sits in a clip at `ms` into it (looping or holding the last frame). */
export function frameAt(frames: readonly FrameRef[], ms: number, loop: boolean): number {
  const total = frames.reduce((s, f) => s + f[1], 0);
  let t = loop ? ((ms % total) + total) % total : Math.max(0, ms);
  for (let i = 0; i < frames.length; i++) {
    if (t < frames[i][1]) return i;
    t -= frames[i][1];
  }
  return frames.length - 1;
}

/** A clip's total length in ms. */
export function clipMs(frames: readonly FrameRef[]): number {
  return frames.reduce((s, f) => s + f[1], 0);
}

/** The frame an event (hit, spawn, ...) fires on, or -1. */
export function eventFrame(anim: PFAnim, ...types: string[]): number {
  const e = anim.events?.find((ev) => types.includes(ev[1]));
  return e ? e[0] : -1;
}

/** The facing for a vector: its dominant axis (the same rule as the game's own facing). */
export function facing(dx: number, dy: number): Dir {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'e' : 'w';
  return dy >= 0 ? 's' : 'n';
}
