/**
 * Recolored PixelForge frames, cached: as pixel buffers (menus, the camp scene) and as canvases (the
 * renderer). A frame is recolored the first time it is asked for in a paint and kept; nothing is
 * redone per drawn frame. Knights get their extras baked in here: an Epic-and-up cape (behind the
 * body, or over the back facing north), and the halo as its own small sprite.
 */
import { toCanvas } from '../art/draw';
import { blank, blit, type PixelBuf } from '../pixel/buf';
import { SHEETS, type SheetName } from './assets';
import { knightPaint, PRIMORDIAL_STILL, type KnightPaint } from './knightLook';
import type { Dir, Recolor } from './sheet';

export const OUTLINE = '#3a263a';
export const FLASH = '#efe2c8';

const palettes = new Map<string, Uint8ClampedArray>();
const bufs = new Map<string, PixelBuf>();
const canvases = new Map<string, HTMLCanvasElement>();
const masks = new Map<string, HTMLCanvasElement>();

function remember<T>(m: Map<string, T>, key: string, make: () => T, cap: number): T {
  let v = m.get(key);
  if (v === undefined) {
    v = make();
    m.set(key, v);
    if (m.size > cap) m.delete(m.keys().next().value!);
  }
  return v;
}

/** A paint for any sheet: its recolor, a key naming it, and whether frames flash. */
export interface Paint {
  recolor: Recolor;
  key: string;
  /** Knights: cape colors (baked into the frames), or null. */
  cape?: readonly string[] | null;
}

function paletteOf(name: SheetName, p: Paint, flash: boolean): Uint8ClampedArray {
  return remember(palettes, `${name}|${p.key}|${flash ? 1 : 0}`, () => SHEETS[name].palette(p.recolor, flash ? FLASH : undefined), 600);
}

const NO_CAPE: ReadonlySet<string> = new Set(['death', 'death_crumble', 'roll', 'backflip', 'vault', 'dodge']);

/** Draws `src` over `dst` where `src` is solid (opaque pixels only; the soft shadow stays `dst`'s). */
function over(dst: PixelBuf, src: PixelBuf): void {
  for (let i = 0; i < dst.px.length; i += 4) if (src.px[i + 3] === 255) dst.px.set(src.px.subarray(i, i + 4), i);
}

/** One frame (distinct frame `k` of a sheet) in a paint, as a pixel buffer. `anim` and `dir` say how to fit a cape. */
export function frameBuf(name: SheetName, k: number, p: Paint, flash = false, anim = '', dir: Dir = 's'): PixelBuf {
  const capeOn = !!p.cape && !NO_CAPE.has(anim);
  return remember(bufs, `${name}|${k}|${p.key}|${flash ? 1 : 0}|${capeOn ? `${anim}${dir}` : ''}`, () => {
    const sheet = SHEETS[name];
    const pal = paletteOf(name, p, flash);
    const layers = sheet.meta.capes?.[k];
    if (capeOn && layers) {
      // The sheet draws its own cape: the layer behind, the body, the layer in front.
      const [back, front] = layers;
      const b = back >= 0 ? sheet.frameBuf(back, pal) : blank(sheet.meta.cell, sheet.meta.cell);
      const body = sheet.frameBuf(k, pal);
      for (let i = 0; i < b.px.length; i += 4) if (!b.px[i + 3] && body.px[i + 3]) b.px.set(body.px.subarray(i, i + 4), i);
      over(b, body);
      if (front >= 0) over(b, sheet.frameBuf(front, pal));
      return b;
    }
    const b = sheet.frameBuf(k, pal);
    const a = sheet.meta.anchors?.[k];
    if (capeOn && a && !sheet.meta.capes) addCape(b, dir, a, flash ? [FLASH, FLASH] : p.cape!, sheet.meta.cell / 32);
    return b;
  }, 1500);
}

/** A frame's solid pixels (its soft ground shadow left out) as a white mask, for the light range (post.ts cap). */
export function frameMask(name: SheetName, k: number, p: Paint, flash = false, anim = '', dir: Dir = 's'): HTMLCanvasElement {
  const capeOn = !!p.cape && !NO_CAPE.has(anim);
  return remember(masks, `${name}|${k}|${p.key}|${capeOn ? `${anim}${dir}` : ''}`, () => {
    const src = frameBuf(name, k, p, flash, anim, dir);
    const b = blank(src.w, src.h);
    for (let i = 3; i < src.px.length; i += 4) if (src.px[i] === 255) b.px.set([255, 255, 255, 255], i - 3);
    return toCanvas(b);
  }, 2500);
}

/** The same, as a canvas for the renderer. */
export function frameCanvas(name: SheetName, k: number, p: Paint, flash = false, anim = '', dir: Dir = 's'): HTMLCanvasElement {
  const capeOn = !!p.cape && !NO_CAPE.has(anim);
  return remember(canvases, `${name}|${k}|${p.key}|${flash ? 1 : 0}|${capeOn ? `${anim}${dir}` : ''}`, () => toCanvas(frameBuf(name, k, p, flash, anim, dir)), 2500);
}

/**
 * A cape in the knight's cloth, hung from the rig's anchors (chin, back, hip): trailing behind the
 * body facing east and west (only empty pixels are painted, so the body stays in front), over the
 * back facing north, hidden facing south. It gets the same 1 px plum outline as everything else.
 * `scale` grows it with the sheet (1 for 32 px cells); diagonals hang it as their side view does.
 */
export function addCape(b: PixelBuf, facingDir: Dir, a: readonly number[], cape: readonly string[], scale = 1): void {
  const dir: Dir = facingDir.length === 2 ? (facingDir.includes('e') ? 'e' : 'w') : facingDir;
  // Facing south the cape hangs behind the body, out of sight (as the game's capes always did).
  if (dir === 's') return;
  const [cx, cy, bx, , , hy] = a;
  const top = cy + 1;
  const bottom = hy + 2;
  const H = Math.max(1, bottom - top);
  const W = b.w;
  const mask = new Uint8Array(W * b.h);
  const over = dir === 'n';
  const put = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < W && y < b.h) mask[y * W + x] = 1;
  };
  for (let y = top; y <= bottom; y++) {
    const r = (y - top) / H;
    if (dir === 'e' || dir === 'w') {
      const s = dir === 'e' ? -1 : 1;
      const reach = Math.round((2 + r * 2.6) * scale);
      for (let k = -1; k <= reach; k++) put(bx + s * k, y);
    } else if (over) {
      const half = Math.round((r > 0.55 ? 4 : 3) * scale);
      for (let x = cx - half; x <= cx + half; x++) put(x, y);
    }
  }
  const alpha = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= b.h ? 0 : b.px[(y * W + x) * 4 + 3]);
  const inMask = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < b.h && mask[y * W + x] === 1;
  const set = (x: number, y: number, hex: string) => {
    const i = (y * W + x) * 4;
    b.px[i] = parseInt(hex.slice(1, 3), 16);
    b.px[i + 1] = parseInt(hex.slice(3, 5), 16);
    b.px[i + 2] = parseInt(hex.slice(5, 7), 16);
    b.px[i + 3] = 255;
  };
  // Which pixels the cape shows on: empty ones (and the ground shadow) behind; all of its shape over the back.
  const painted = new Uint8Array(W * b.h);
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      if (!over && alpha(x, y) === 255) continue;
      painted[y * W + x] = 1;
    }
  }
  const isPainted = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < b.h && painted[y * W + x] === 1;
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < W; x++) {
      if (!painted[y * W + x]) continue;
      let hex = cape[0];
      if (over) {
        const edge = !inMask(x - 1, y) || !inMask(x + 1, y) || !inMask(x, y - 1) || !inMask(x, y + 1);
        hex = edge ? OUTLINE : x === cx || y === bottom - 1 ? cape[0] : cape[1];
      } else {
        // Lit from above: the top of the drape and its outer fold catch the light.
        const outer = !isPainted(x - 1, y) || !isPainted(x + 1, y);
        hex = y <= top + 1 || (outer && y < bottom - 1 && (x + y) % 3 !== 0) ? cape[1] : cape[0];
      }
      set(x, y, hex);
    }
  }
  if (!over) {
    // The outline: a ring round the painted cape, on empty pixels only.
    const ring: Array<[number, number]> = [];
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < W; x++) {
        if (isPainted(x, y) || alpha(x, y) === 255) continue;
        if (isPainted(x - 1, y) || isPainted(x + 1, y) || isPainted(x, y - 1) || isPainted(x, y + 1)) ring.push([x, y]);
      }
    }
    for (const [x, y] of ring) set(x, y, OUTLINE);
  }
}

/** The halo's width for a sheet: 7 px on PixelForge's 32 px cells, growing with the cell (always odd). */
export function haloWidth(name: SheetName): number {
  return Math.max(7, Math.round((SHEETS[name].meta.cell * 7) / 32 / 2) * 2 + 1);
}

/** A halo (Celestial and up): a `w` x 3 ring, light in front. Drawn over the head by the callers. */
export function haloBuf(colors: readonly [string, string], w = 7): PixelBuf {
  const inner = w - 2;
  const rows = [`.${'b'.repeat(inner)}.`, `a${'.'.repeat(inner)}a`, `.${'a'.repeat(inner)}.`];
  const b = blank(w, 3);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const hex = ch === 'a' ? colors[0] : colors[1];
      const i = (y * w + x) * 4;
      b.px[i] = parseInt(hex.slice(1, 3), 16);
      b.px[i + 1] = parseInt(hex.slice(3, 5), 16);
      b.px[i + 2] = parseInt(hex.slice(5, 7), 16);
      b.px[i + 3] = 255;
    }),
  );
  return b;
}

export function haloCanvas(colors: readonly [string, string], w = 7): HTMLCanvasElement {
  return remember(canvases, `halo|${w}|${colors.join('|')}`, () => toCanvas(haloBuf(colors, w)), 2500);
}

/**
 * The top of the head for a frame, [x, y] in frame pixels: the rig's head anchor when the sheet has
 * one (anchors[6], [7]), else the topmost solid row's middle.
 */
export function headTop(name: SheetName, k: number): [number, number] {
  const meta = SHEETS[name].meta;
  const a = meta.anchors?.[k];
  if (a && a.length >= 8) return [a[6], a[7]];
  const [top, mid] = meta.tops[k];
  return [mid, top];
}

/** Where the halo goes for a frame: its top-left in frame pixels (just above the top of the head). */
export function haloSpot(name: SheetName, k: number): [number, number] {
  const [x, y] = headTop(name, k);
  const w = haloWidth(name);
  return [x - (w >> 1), Math.max(0, y - 4)];
}

/**
 * The box every knight sheet's standing frames fit in, relative to the pivot (the feet): [left, top,
 * right, bottom], inclusive, with room for a halo over the head. Portraits are cut to it, so a new
 * sheet of any size or shape is framed whole. Needs the sheets' pixels (null before they load).
 */
export function knightBounds(names: readonly SheetName[]): [number, number, number, number] | null {
  let box: [number, number, number, number] | null = null;
  for (const name of names) {
    const sheet = SHEETS[name];
    if (!sheet.ready) return null;
    const { cell, pivot } = sheet.meta;
    const dirs = sheet.meta.dirs ?? ['s', 'e', 'n', 'w'];
    for (const d of dirs) {
      if (!sheet.has('idle', d)) continue;
      for (const [k] of sheet.clip('idle', d)) {
        const idx = sheet.indices(k);
        for (let y = 0; y < cell; y++) {
          for (let x = 0; x < cell; x++) {
            if (!idx[y * cell + x]) continue;
            const rx = x - pivot[0];
            const ry = y - pivot[1];
            box = box ? [Math.min(box[0], rx), Math.min(box[1], ry), Math.max(box[2], rx), Math.max(box[3], ry)] : [rx, ry, rx, ry];
          }
        }
        // A halo floats over the head.
        const [hx, hy] = headTop(name, k);
        const w = haloWidth(name);
        if (box) box = [Math.min(box[0], hx - (w >> 1) - pivot[0]), Math.min(box[1], hy - 4 - pivot[1]), Math.max(box[2], hx + (w >> 1) - pivot[0]), box[3]];
      }
    }
  }
  return box;
}

/**
 * A knight standing for the menus and the camp: idle frame `i` facing `dir`, recolored, cape and
 * halo baked in, on the sheet's full cell (pivot as the sheet's).
 */
export function knightStill(id: string, mutation: KnightPaint['mutation'], dir: Dir = 's', i = 0, step = PRIMORDIAL_STILL): { buf: PixelBuf; pivot: readonly [number, number]; paint: KnightPaint } {
  const paint = knightPaint(id, mutation, step);
  const sheet = SHEETS[paint.sheet];
  const frames = sheet.clip('idle', dir);
  const k = frames[((i % frames.length) + frames.length) % frames.length][0];
  const src = frameBuf(paint.sheet, k, paint, false, 'idle', dir);
  // A copy (blit would make the soft ground shadow opaque).
  const buf: PixelBuf = { w: src.w, h: src.h, px: new Uint8ClampedArray(src.px) };
  if (paint.halo) {
    const [hx, hy] = haloSpot(paint.sheet, k);
    blit(buf, haloBuf(paint.halo, haloWidth(paint.sheet)), hx, hy);
  }
  return { buf, pivot: sheet.meta.pivot, paint };
}
