/**
 * Character sheets in the game (PixelForge exports packed by tools/packs/pixelforge.py, or the game's
 * own tools/knights): the animations as frames and durations per direction, each distinct frame once
 * in an indexed PNG, and the palette with the material and shade of every color.
 *
 * Any cell size and pivot work: everything that places a frame reads `cell` and `pivot`. Sheets draw
 * the four facings s, e, n, w and may add the diagonals se, sw, ne, nw (listed in `dirs`); a facing
 * a sheet doesn't draw falls back to the nearest one it does (a diagonal to its side view).
 *
 * Recoloring is a palette swap per frame: a frame's pixels are read once as palette indices, then
 * any recolor (rarity armor, a mutation, a biome's monster) is a lookup per pixel into that recolor's
 * palette, done the first time that frame is drawn in that recolor and cached. Nothing is scaled,
 * rotated or flipped: west is the sheet's own drawing.
 */
import { blank, type PixelBuf } from '../pixel/buf';

export type Dir = 's' | 'e' | 'n' | 'w' | 'se' | 'sw' | 'ne' | 'nw';
/** The four facings every sheet draws. */
export const DIRS: readonly Dir[] = ['s', 'e', 'n', 'w'];
/** All eight, for sheets that draw the diagonals too. */
export const DIRS8: readonly Dir[] = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw'];

/** Where a facing a sheet doesn't draw falls back to, nearest first. */
const FALLBACK: Record<Dir, readonly Dir[]> = {
  s: ['s'],
  e: ['e'],
  n: ['n'],
  w: ['w', 'e'],
  se: ['se', 'e', 's'],
  sw: ['sw', 'w', 'e', 's'],
  ne: ['ne', 'e', 'n'],
  nw: ['nw', 'w', 'e', 'n'],
};

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
  /** Cell size (frames are cell x cell) and the pivot (the feet, on the ground) in a cell. */
  cell: number;
  pivot: [number, number];
  cols: number;
  count: number;
  /**
   * [hex, alpha, material, shade, role?]; palette index = position + 1 (0 is transparent). A role of
   * 'line' marks an outline color: it stays dark in a hit flash, like the 'outline' material.
   */
  colors: Array<[string, number, string, number] | [string, number, string, number, string]>;
  /** Per frame: the top of the head (the topmost solid row) and the middle of it (-1 when empty). */
  tops: Array<[number, number]>;
  anims: Record<string, PFAnim>;
  /**
   * Knights, per frame: chin x, y, back x, y, hip x, y (the rig's anchors), optionally followed by the
   * head's top x, y (halos and stun stars go there; `tops` when it's missing).
   */
  anchors?: Array<number[] | null>;
  /** The facings drawn (default s, e, n, w). */
  dirs?: Dir[];
  /**
   * Knights that draw their own capes: per frame, the distinct frames of the cape behind the body and
   * in front of it (-1 for none). Without this the game hangs a cape from the anchors.
   */
  capes?: Array<[number, number] | null>;
}

/**
 * The fastest a walk's frames may change (s). PixelForge draws a walk at its own pace (a knight's
 * 10 px stride every 520 ms is about 19 px/s) and the game moves knights at 50 to 64 px/s: stepped by
 * distance alone, the legs would flick every 40 ms. Past this pace the feet slide a little instead.
 */
export const WALK_MIN_FRAME = 0.09;

/** The share of the distance walked to step a cycle of `cyclePx` drawn px over `frames` frames by, at `speed` px/s. */
export function walkPace(cyclePx: number, frames: number, speed: number): number {
  return Math.min(1, cyclePx / Math.max(1e-3, speed * frames * WALK_MIN_FRAME));
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

  /** True when the sheet draws the diagonal facings. */
  get eightWay(): boolean {
    return !!this.meta.dirs?.includes('se');
  }

  /** The facing `anim` shows for `dir`: `dir` itself when drawn, else the nearest drawn one. */
  drawnDir(anim: string, dir: Dir): Dir {
    const a = this.meta.anims[anim];
    if (!a) return dir;
    return FALLBACK[dir].find((d) => a.dirs[d]) ?? (a.dirs.s ? 's' : (Object.keys(a.dirs)[0] as Dir));
  }

  /** The frames of `anim` facing `dir` (falls back to the nearest drawn direction, never flips). */
  clip(anim: string, dir: Dir): FrameRef[] {
    const a = this.meta.anims[anim];
    if (!a) throw new Error(`${this.meta.name}: no ${anim}`);
    return a.dirs[this.drawnDir(anim, dir)] ?? (Object.values(a.dirs)[0] as FrameRef[]);
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
    this.meta.colors.forEach(([hex, a, mat, shade, role], i) => {
      let rgb = rgbOf(hex);
      const r = recolor[mat];
      if (r && r.length) rgb = rgbOf(r[Math.min(shade, r.length - 1)]);
      if (fl && mat !== 'outline' && mat !== 'shadow' && role !== 'line') rgb = fl;
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

/** The facing for a vector among eight (45 degree sectors). */
export function facing8(dx: number, dy: number): Dir {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return 's';
  const i = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  return (['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] as const)[i];
}
