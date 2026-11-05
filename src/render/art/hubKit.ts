/**
 * The hub's painting kit: a layer you draw on in hub coordinates (albedo plus an emissive twin and the
 * lights it gives off), and the materials the hub is built from, each drawn pixel by pixel and lit
 * from the top left like the rest of the game's art: planks and timber with grain, knots and nails;
 * shingles; dressed stone; big glossy leaves and leaf clumps; glass that glows. Nothing here is
 * random at run time: every bit of variation comes from hashing the pixel's position with a seed.
 */
import { blank, type PixelBuf } from '../pixel/buf';
import { mixHex, setRGB, shade } from './draw';

export type Ramp = readonly string[];

// ------------------------------------------------------------------ noise

/** Hash of an integer position and a seed, in [0, 1). */
export function h2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in [0, 1) with cells `sx` wide and `sy` tall (streaky when they differ). */
export function vnoise(x: number, y: number, sx: number, sy: number, s: number): number {
  const fx = x / sx;
  const fy = y / sy;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const a = h2(x0, y0, s);
  const b = h2(x0 + 1, y0, s);
  const c = h2(x0, y0 + 1, s);
  const d = h2(x0 + 1, y0 + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** A ramp's color at a fractional index (rounded, clamped). */
export function rk(r: Ramp, k: number): string {
  return r[Math.max(0, Math.min(r.length - 1, Math.round(k)))];
}

/** A 2x2 ordered dither: true on half the pixels of a fractional step. */
export function dith(x: number, y: number, f: number): boolean {
  const m = [0.125, 0.625, 0.875, 0.375][(x & 1) + ((y & 1) << 1)];
  return f > m;
}

/** A ramp's color at a fractional index, dithered between the two nearest steps. */
export function rkd(r: Ramp, k: number, x: number, y: number): string {
  const c = Math.max(0, Math.min(r.length - 1, k));
  const lo = Math.floor(c);
  return r[Math.min(r.length - 1, dith(x, y, c - lo) ? lo + 1 : lo)];
}

// ------------------------------------------------------------------ the layer

export interface LightSpec {
  x: number;
  y: number;
  r: number;
  color: string;
  intensity: number;
  /** 0 steady, up to 1 for a fire's flicker. */
  flicker?: number;
}

/**
 * A piece of the hub being painted: an albedo buffer and its emissive twin, both covering the same
 * rectangle of the hub, addressed in hub pixels, and the lights it carries.
 */
export class Layer {
  readonly buf: PixelBuf;
  readonly glow: PixelBuf;
  readonly lights: LightSpec[] = [];
  constructor(readonly x0: number, readonly y0: number, readonly w: number, readonly h: number) {
    this.buf = blank(w, h);
    this.glow = blank(w, h);
  }
  inside(x: number, y: number): boolean {
    const lx = (x | 0) - this.x0;
    const ly = (y | 0) - this.y0;
    return lx >= 0 && ly >= 0 && lx < this.w && ly < this.h;
  }
  px(x: number, y: number, c: string | null | undefined): void {
    if (!c) return;
    setRGB(this.buf, Math.floor(x) - this.x0, Math.floor(y) - this.y0, c);
  }
  /** An emissive pixel (also painted into the albedo, so the piece reads without the glow pass). */
  gl(x: number, y: number, c: string | null | undefined, base?: string): void {
    if (!c) return;
    setRGB(this.glow, Math.floor(x) - this.x0, Math.floor(y) - this.y0, c);
    setRGB(this.buf, Math.floor(x) - this.x0, Math.floor(y) - this.y0, base ?? c);
  }
  /** Removes a pixel's glow (something in front of a window). */
  unglow(x: number, y: number): void {
    const lx = Math.floor(x) - this.x0;
    const ly = Math.floor(y) - this.y0;
    if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return;
    this.glow.px[(ly * this.w + lx) * 4 + 3] = 0;
  }
  a(x: number, y: number): number {
    const lx = Math.floor(x) - this.x0;
    const ly = Math.floor(y) - this.y0;
    if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return 0;
    return this.buf.px[(ly * this.w + lx) * 4 + 3];
  }
  get(x: number, y: number): string | null {
    const lx = Math.floor(x) - this.x0;
    const ly = Math.floor(y) - this.y0;
    if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return null;
    const i = (ly * this.w + lx) * 4;
    if (!this.buf.px[i + 3]) return null;
    const f = (v: number) => v.toString(16).padStart(2, '0');
    return `#${f(this.buf.px[i])}${f(this.buf.px[i + 1])}${f(this.buf.px[i + 2])}`;
  }
  /** Darkens (t < 0) or lightens an existing pixel. */
  tone(x: number, y: number, t: number): void {
    const c = this.get(x, y);
    if (c) this.px(x, y, shade(c, t));
  }
  /** Mixes an existing pixel toward a color. */
  tint(x: number, y: number, hex: string, t: number): void {
    const c = this.get(x, y);
    if (c) this.px(x, y, mixHex(c, hex, t));
  }
  rect(x: number, y: number, w: number, h: number, c: string | ((x: number, y: number) => string | null)): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, typeof c === 'string' ? c : c(xx, yy));
  }
  light(x: number, y: number, r: number, color: string, intensity: number, flicker = 0): void {
    this.lights.push({ x, y, r, color, intensity, ...(flicker ? { flicker } : {}) });
  }
  /** Pastes a buffer (opaque pixels) with its top-left at hub (x, y); `under` keeps what's there. */
  paste(src: PixelBuf, x: number, y: number, opts: { under?: boolean; flip?: boolean; glow?: boolean } = {}): void {
    for (let sy = 0; sy < src.h; sy++) {
      for (let sx = 0; sx < src.w; sx++) {
        const si = (sy * src.w + (opts.flip ? src.w - 1 - sx : sx)) * 4;
        if (!src.px[si + 3]) continue;
        const X = x + sx;
        const Y = y + sy;
        if (opts.under && this.a(X, Y)) continue;
        const lx = X - this.x0;
        const ly = Y - this.y0;
        if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) continue;
        const di = (ly * this.w + lx) * 4;
        const t = opts.glow ? this.glow : this.buf;
        t.px[di] = src.px[si];
        t.px[di + 1] = src.px[si + 1];
        t.px[di + 2] = src.px[si + 2];
        t.px[di + 3] = 255;
        if (opts.glow) {
          this.buf.px[di] = src.px[si];
          this.buf.px[di + 1] = src.px[si + 1];
          this.buf.px[di + 2] = src.px[si + 2];
          this.buf.px[di + 3] = 255;
        }
      }
    }
  }
  /** Copies another layer's pixels (albedo, glow and lights) onto this one. */
  merge(o: Layer): void {
    for (let y = 0; y < o.h; y++) {
      for (let x = 0; x < o.w; x++) {
        const i = (y * o.w + x) * 4;
        const X = x + o.x0 - this.x0;
        const Y = y + o.y0 - this.y0;
        if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue;
        const j = (Y * this.w + X) * 4;
        if (o.buf.px[i + 3]) this.buf.px.set(o.buf.px.subarray(i, i + 4), j);
        if (o.glow.px[i + 3]) this.glow.px.set(o.glow.px.subarray(i, i + 4), j);
        else if (o.buf.px[i + 3]) this.glow.px[j + 3] = 0;
      }
    }
    this.lights.push(...o.lights);
  }
  /**
   * A 1-pixel ink line round everything opaque, drawn on the transparent pixels next to it (the
   * shapes keep their size). `diag` closes the corners too.
   */
  outline(ink: string, diag = false): void {
    const src = this.buf.px.slice();
    const W = this.w;
    const H = this.h;
    const op = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] > 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (op(x, y)) continue;
        const n = op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1) || (diag && (op(x - 1, y - 1) || op(x + 1, y - 1) || op(x - 1, y + 1) || op(x + 1, y + 1)));
        if (n) setRGB(this.buf, x, y, ink);
      }
    }
  }
}

// ------------------------------------------------------------------ shapes

/** Fills a polygon (hub coordinates), the color picked per pixel. Pixel centers inside are filled. */
export function poly(L: Layer, pts: ReadonlyArray<readonly [number, number]>, c: string | ((x: number, y: number) => string | null)): void {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [, y] of pts) {
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) L.px(x, y, typeof c === 'string' ? c : c(x, y));
    }
  }
}

/** Fills an ellipse; the color function gets the pixel and its normalized offset from the center. */
export function oval(L: Layer, cx: number, cy: number, rx: number, ry: number, c: string | ((x: number, y: number, nx: number, ny: number) => string | null)): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      L.px(x, y, typeof c === 'string' ? c : c(x, y, nx, ny));
    }
  }
}

/** A lit ball: brightest toward the top left, a ramp from dark to light. */
export function sphere(L: Layer, cx: number, cy: number, rx: number, ry: number, ramp: Ramp, opts: { spec?: string; glow?: boolean } = {}): void {
  oval(L, cx, cy, rx, ry, (x, y, nx, ny) => {
    const d = nx * nx + ny * ny;
    const lit = -nx * 0.5 - ny * 0.7 + 0.45 * (1 - d);
    const k = (ramp.length - 1) * (0.42 + lit * 0.6);
    const c = rkd(ramp, k, x, y);
    if (opts.glow) L.gl(x, y, c);
    return opts.glow ? null : c;
  });
  if (opts.spec) {
    const sx = Math.round(cx - rx * 0.4);
    const sy = Math.round(cy - ry * 0.45);
    if (opts.glow) L.gl(sx, sy, opts.spec);
    else L.px(sx, sy, opts.spec);
  }
}

export function hline(L: Layer, x0: number, x1: number, y: number, c: string | ((x: number) => string | null)): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) L.px(x, y, typeof c === 'string' ? c : c(x));
}

export function vline(L: Layer, x: number, y0: number, y1: number, c: string | ((y: number) => string | null)): void {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) L.px(x, y, typeof c === 'string' ? c : c(y));
}

/** Bresenham line through the given points; the color can depend on the step. */
export function path(L: Layer, pts: ReadonlyArray<readonly [number, number]>, c: string | ((x: number, y: number, i: number) => string | null), glow = false): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    let x0 = Math.round(pts[i][0]);
    let y0 = Math.round(pts[i][1]);
    const x1 = Math.round(pts[i + 1][0]);
    const y1 = Math.round(pts[i + 1][1]);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (!out.length || out[out.length - 1][0] !== x0 || out[out.length - 1][1] !== y0) out.push([x0, y0]);
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
  out.forEach(([x, y], i) => {
    const col = typeof c === 'string' ? c : c(x, y, i);
    if (glow) L.gl(x, y, col);
    else L.px(x, y, col);
  });
  return out;
}

/** Points along a hanging curve (a rope or a string of lights) between two points, `sag` px down. */
export function sagCurve(x0: number, y0: number, x1: number, y1: number, sag: number): Array<[number, number]> {
  const n = Math.max(2, Math.ceil(Math.abs(x1 - x0)) + 1);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)]);
  }
  return pts;
}

// ------------------------------------------------------------------ materials

/** Warm timber, dark to light (beams, posts, shelves). */
export const TIMBER: Ramp = ['#140c0a', '#24160f', '#352117', '#4a2f1f', '#5f3e28', '#7a5234', '#946a44'];
/** Lighter planks (decks, tables, crates), dark to light. */
export const PLANK: Ramp = ['#2a1a12', '#432a1a', '#5e3c24', '#7a5030', '#97663c', '#b3804c', '#cc9c62', '#e2bb80'];
/** Iron, dark to light. */
export const IRON: Ramp = ['#121218', '#22222c', '#363644', '#4c4c5c', '#6a6a7c', '#8e8ea0', '#b8b8c8'];
/** Brass and gold, dark to light. */
export const GOLD: Ramp = ['#3a200c', '#5e3812', '#8a5a1a', '#b8862a', '#e0b040', '#f8d468', '#fff0a8', '#fffbe6'];
/** Warm stone (dressed blocks), dark to light. */
export const STONE: Ramp = ['#2a2426', '#3e3638', '#554b4a', '#6e6260', '#8a7c76', '#a69890', '#c2b4a8'];
/** Leaves, dark to light: deep shadow, greens, lime highlights. */
export const LEAF: Ramp = ['#08160c', '#0f2a14', '#17401a', '#215a20', '#2f7626', '#43922c', '#62ae34', '#8ccb3e', '#b8e45a', '#e0f590'];

export const INK = '#120a0a';

export interface PlankOpts {
  /** Planks run horizontally (boards stacked down) or vertically (boards side by side). */
  dir: 'h' | 'v';
  /** Board width across the grain. */
  board: number;
  seed: number;
  ramp?: Ramp;
  /** Base tone index on the ramp. */
  base?: number;
  /** End joints (boards shorter than the run), roughly every this many px along the grain. */
  joint?: number;
  /** Nail heads at the joints and ends. */
  nails?: boolean;
  /** Extra darkening toward the bottom (0..1) and the right. */
  shadeBottom?: number;
}

/**
 * Boards with grain: each board its own tone, a lit edge on its top (or left) side and a dark seam on
 * the other, streaky grain along it, the odd knot, end joints with nails.
 */
export function planks(L: Layer, x: number, y: number, w: number, h: number, o: PlankOpts): void {
  const r = o.ramp ?? PLANK;
  const base = o.base ?? r.length * 0.55;
  const s = o.seed;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const along = o.dir === 'h' ? xx - x : yy - y;
      const across = o.dir === 'h' ? yy - y : xx - x;
      const bi = Math.floor(across / o.board);
      const inB = across - bi * o.board;
      // End joints: each board breaks at its own places.
      let seg = 0;
      let segStart = 0;
      if (o.joint) {
        const off = Math.floor(h2(bi, 0, s) * o.joint);
        seg = Math.floor((along + off) / o.joint);
        segStart = seg * o.joint - off;
      }
      const id = h2(bi, seg, s + 1);
      let k = base + (id - 0.5) * 1.6;
      // Grain: long streaks along the board.
      const g = o.dir === 'h' ? vnoise(xx, yy * 5 + bi * 31, 9, 1.4, s + 2) : vnoise(xx * 5 + bi * 31, yy, 1.4, 9, s + 2);
      k += (g - 0.5) * 1.5;
      if (inB === 0) k += 1.1;
      if (inB === o.board - 1) k -= 1.6;
      if (o.joint && along === segStart) k = 0.6;
      if (o.joint && along === segStart + 1) k += 0.8;
      // A knot now and then: a dark eye with a lighter ring.
      const kx = Math.floor(along / 13);
      if (h2(bi, kx, s + 3) < 0.18) {
        const cx = kx * 13 + 4 + Math.floor(h2(bi, kx, s + 4) * 6);
        const cy = Math.floor(o.board / 2);
        const d = Math.abs(along - cx) * 0.6 + Math.abs(inB - cy);
        if (d < 0.8) k = 0.5;
        else if (d < 1.6) k -= 0.9;
      }
      if (o.shadeBottom) k -= ((yy - y) / Math.max(1, h)) * o.shadeBottom * 2;
      L.px(xx, yy, rkd(r, k, xx, yy));
      if (o.nails && o.joint && (along === segStart + 2 || along === segStart - 3) && inB === Math.floor(o.board / 2)) L.px(xx, yy, rk(r, r.length - 1));
    }
  }
}

/** A squared timber (beam or post) with grain along it, lit on its top/left face, dark underneath. */
export function timber(L: Layer, x: number, y: number, w: number, h: number, seed: number, ramp: Ramp = TIMBER, base = 3.4): void {
  const horiz = w >= h;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const across = horiz ? yy - y : xx - x;
      const span = horiz ? h : w;
      let k = base + (vnoise(horiz ? xx : xx * 6, horiz ? yy * 6 : yy, horiz ? 7 : 1.2, horiz ? 1.2 : 7, seed) - 0.5) * 1.4;
      if (across === 0) k += 1.4;
      else if (across === 1 && span > 3) k += 0.5;
      if (across === span - 1) k -= 1.5;
      L.px(xx, yy, rkd(ramp, k, xx, yy));
    }
  }
}

/** Shingles over a region (any shape: `inside` says which pixels), rows offset by half a shingle. */
export function shingles(L: Layer, x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean, o: { w: number; h: number; ramp: Ramp; seed: number; base?: number; moss?: Ramp; rowShade?: (y: number) => number }): void {
  const r = o.ramp;
  const base = o.base ?? (r.length - 1) * 0.55;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue;
      const row = Math.floor((y - y0) / o.h);
      const iy = y - y0 - row * o.h;
      const off = row % 2 ? Math.floor(o.w / 2) : 0;
      const col = Math.floor((x - x0 + off) / o.w);
      const ix = x - x0 + off - col * o.w;
      const id = h2(col, row, o.seed);
      let k = base + (id - 0.5) * 1.5 + (o.rowShade ? o.rowShade(y) : 0);
      // A shingle: lit top edge, darkening toward its rounded lower edge, a dark gap at its side and a
      // shadow line under it where the next row overlaps.
      if (iy === 0) k += 0.9;
      if (iy === o.h - 1) k = 0.4;
      else if (iy === o.h - 2) k -= 0.7;
      if (ix === 0) k = Math.min(k, 0.8);
      if (ix === 1) k += 0.4;
      if (iy === o.h - 2 && (ix === 1 || ix === o.w - 1)) k = 0.6;
      // Weathering: a few darker or lighter shingles, and moss in the gaps.
      if (id > 0.93) k -= 1;
      if (id < 0.05) k += 0.8;
      let c = rkd(r, k, x, y);
      if (o.moss && iy >= o.h - 2 && h2(x, y, o.seed + 9) < 0.18 && vnoise(x, y, 14, 10, o.seed + 5) > 0.58) c = rk(o.moss, 1 + h2(x, y, o.seed + 3) * 2);
      L.px(x, y, c);
    }
  }
}

/** Dressed stone blocks in courses with mortar between, each block lit on its top-left edge. */
export function blocks(L: Layer, x0: number, y0: number, w: number, h: number, o: { bw: number; bh: number; seed: number; ramp?: Ramp; mortar?: string; base?: number; moss?: Ramp; inside?: (x: number, y: number) => boolean }): void {
  const r = o.ramp ?? STONE;
  const mortar = o.mortar ?? r[0];
  const base = o.base ?? (r.length - 1) * 0.55;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (o.inside && !o.inside(x, y)) continue;
      const row = Math.floor((y - y0) / o.bh);
      const iy = y - y0 - row * o.bh;
      const shift = Math.floor(h2(row, 0, o.seed) * o.bw);
      const col = Math.floor((x - x0 + shift) / o.bw);
      const ix = x - x0 + shift - col * o.bw;
      // Uneven block lengths: some joints move a pixel or two.
      const id = h2(col, row, o.seed + 1);
      if (iy === o.bh - 1 || ix === 0) {
        L.px(x, y, mortar);
        continue;
      }
      let k = base + (id - 0.5) * 1.4 + (vnoise(x, y, 5, 4, o.seed + 2) - 0.5) * 0.9;
      if (iy === 0) k += 1;
      if (ix === 1) k += 0.6;
      if (iy === o.bh - 2) k -= 0.8;
      if (ix === o.bw - 1) k -= 0.6;
      // Chips and pits.
      if (h2(x, y, o.seed + 3) < 0.04) k -= 1.2;
      let c = rkd(r, k, x, y);
      if (o.moss && iy >= o.bh - 3 && vnoise(x, y, 9, 6, o.seed + 4) > 0.6 && h2(x, y, o.seed + 5) < 0.5) c = rk(o.moss, 2 + h2(x, y, o.seed + 6) * 3);
      L.px(x, y, c);
    }
  }
}

// ------------------------------------------------------------------ leaves

export interface LeafOpts {
  /** Ramp indexes for the leaf: shadow side, lit side (LEAF ramp by default). */
  ramp?: Ramp;
  /** Overall tone: 0 deep in the back, 1 bright in front. */
  tone: number;
  seed: number;
  /** Width profile: 'broad' (banana, monstera), 'lance' (narrow, pointed), 'round'. */
  shape?: 'broad' | 'lance' | 'round';
  ink?: string;
  /** Draws a lime rim on the side facing the light. */
  rim?: boolean;
  /** Notches cut into the edge (monstera). */
  notch?: boolean;
}

/**
 * One leaf from its stem point along `ang` (radians, 0 = right, y down), `len` long, `wid` at its
 * widest. Split along the midrib: the half facing the light (up and left) is lighter. Veins run off
 * the rib, the edge gets an ink line, the lit edge a lime rim. The leaf curls: its far end droops.
 */
export function leaf(L: Layer, x0: number, y0: number, ang: number, len: number, wid: number, o: LeafOpts): void {
  const r = o.ramp ?? LEAF;
  const ink = o.ink ?? r[0];
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const shape = o.shape ?? 'broad';
  // The leaf droops under its weight: the midrib bends down a little toward the tip.
  const droop = len * 0.12 * Math.abs(ca);
  const ribAt = (t: number): [number, number] => [x0 + ca * len * t, y0 + sa * len * t + droop * t * t];
  const halfW = (t: number) => {
    if (t <= 0 || t >= 1) return 0;
    if (shape === 'lance') return wid * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 1.1) * 0.5;
    if (shape === 'round') return wid * Math.sqrt(Math.sin(Math.PI * t)) * 0.5;
    return wid * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.75) * 0.5;
  };
  // Bounding box.
  const pad = wid + 2;
  const xs = [x0, x0 + ca * len];
  const ys = [y0, y0 + sa * len + droop];
  const bx0 = Math.floor(Math.min(...xs) - pad);
  const bx1 = Math.ceil(Math.max(...xs) + pad);
  const by0 = Math.floor(Math.min(...ys) - pad);
  const by1 = Math.ceil(Math.max(...ys) + pad);
  // Sample the rib finely, map each pixel to (t, v): t along, v across (+ to the leaf's left).
  const N = Math.max(8, Math.ceil(len * 2));
  const rib: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) rib.push(ribAt(i / N));
  const mask = new Map<number, [number, number]>();
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let best = 1e9;
      let bt = 0;
      let bv = 0;
      for (let i = 0; i < N; i++) {
        const [ax, ay] = rib[i];
        const [cx, cy] = rib[i + 1];
        const dx = cx - ax;
        const dy = cy - ay;
        const l2 = dx * dx + dy * dy || 1;
        let u = ((px - ax) * dx + (py - ay) * dy) / l2;
        u = Math.max(0, Math.min(1, u));
        const qx = ax + dx * u;
        const qy = ay + dy * u;
        const d = Math.hypot(px - qx, py - qy);
        if (d < best) {
          best = d;
          bt = (i + u) / N;
          // Which side: the cross product's sign.
          bv = Math.sign(dx * (py - ay) - dy * (px - ax)) * d;
        }
      }
      let hw = halfW(bt);
      if (o.notch && bt > 0.2 && bt < 0.85) {
        const slot = Math.floor(bt * 7 + (bv > 0 ? 0.5 : 0));
        const fr = bt * 7 + (bv > 0 ? 0.5 : 0) - slot;
        if (fr > 0.42 && fr < 0.58 && Math.abs(bv) > hw * 0.45) hw = 0;
      }
      if (Math.abs(bv) <= hw) mask.set(y * 4096 + x, [bt, bv / Math.max(0.5, hw)]);
    }
  }
  // Which side faces the light (up-left): the normal on the +v side.
  const nx = -sa;
  const ny = ca;
  const plusLit = nx * -0.6 + ny * -0.8 > 0;
  const has = (x: number, y: number) => mask.has(y * 4096 + x);
  for (const [key, [t, v]] of mask) {
    const y = Math.floor(key / 4096);
    const x = key - y * 4096;
    const lit = (v > 0) === plusLit;
    let k = 1.2 + o.tone * 4.4 + (lit ? 1.3 : -0.4);
    // Shade toward the tip and the base, lighter in the middle of each half.
    k -= Math.abs(t - 0.45) * 1.2;
    k += (1 - Math.abs(v)) * 0.4 * (lit ? 1 : 0.4);
    // Veins: slanted lines off the rib, a step darker.
    const vein = Math.abs(((t * len * 0.55 + Math.abs(v) * wid * 0.22) % 3) - 1.5) < 0.38 && Math.abs(v) > 0.18 && Math.abs(v) < 0.85;
    if (vein) k -= 0.9;
    // The midrib: a pale line on the lit side of the leaf.
    if (Math.abs(v) < 0.14 && t > 0.06 && t < 0.92) k = Math.max(k, 1.6 + o.tone * 4.4 + (lit ? 0.6 : 0.2));
    if (h2(x, y, o.seed) < 0.06) k += 0.6;
    let c = rkd(r, k, x, y);
    // Edges: ink outside the shape on the shadow side, a lime rim on the lit edge.
    const edge = !has(x - 1, y) || !has(x + 1, y) || !has(x, y - 1) || !has(x, y + 1);
    if (edge) {
      if (lit && o.rim !== false && (!has(x, y - 1) || !has(x - 1, y))) c = rk(r, Math.min(r.length - 1, 2.5 + o.tone * 6.5));
      else if (!lit) c = rk(r, Math.max(0, k - 1.4));
    }
    L.px(x, y, c);
  }
  // Ink round the leaf (only where nothing is drawn yet: leaves behind keep their pixels).
  for (const key of mask.keys()) {
    const y = Math.floor(key / 4096);
    const x = key - y * 4096;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (has(x + dx, y + dy)) continue;
      if (!L.a(x + dx, y + dy) || dy === 1) L.px(x + dx, y + dy, ink);
    }
  }
}

/** A round clump of small leaves (bushes, the tops of potted plants), lit from the top left. */
export function clump(L: Layer, cx: number, cy: number, rx: number, ry: number, o: { seed: number; tone: number; ramp?: Ramp; ink?: string; leaf?: number }): void {
  const r = o.ramp ?? LEAF;
  const lw = o.leaf ?? 3;
  // Little leaves scattered over the dome, back (top) ones first.
  const items: Array<[number, number, number]> = [];
  const n = Math.round((rx * ry) / (lw * 1.4));
  for (let i = 0; i < n; i++) {
    const a = h2(i, 1, o.seed) * Math.PI * 2;
    const d = Math.sqrt(h2(i, 2, o.seed));
    items.push([cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, h2(i, 3, o.seed)]);
  }
  items.sort((p, q) => p[1] - q[1]);
  // A dark mass first so gaps read as depth.
  oval(L, cx, cy + 0.5, rx, ry, (x, y, nx, ny) => rkd(r, 0.6 + o.tone * 1.6 - ny * 0.6 - nx * 0.2 + h2(x, y, o.seed) * 0.5, x, y));
  for (const [x, y, id] of items) {
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    const lit = -nx * 0.55 - ny * 0.8;
    const k = 1.6 + o.tone * 3.6 + lit * 1.8 + (id - 0.5) * 0.8;
    // A leaf: a small lens shape pointing outward from the center, lighter on its upper edge.
    const ang = Math.atan2(y - cy, x - cx) + (id - 0.5) * 0.8;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    for (let t = -lw; t <= lw; t++) {
      const half = Math.round((lw - Math.abs(t)) * 0.55);
      for (let v = -half; v <= half; v++) {
        const px = Math.round(x + ca * t * 0.8 - sa * v);
        const py = Math.round(y + sa * t * 0.8 + ca * v * 0.7);
        const top = v === -half && half > 0;
        L.px(px, py, rkd(r, k + (top ? 0.9 : 0) - (v === half && half > 0 ? 0.8 : 0), px, py));
      }
    }
  }
}

/** Grass blades or fronds fanning up from a base line. */
export function tuft(L: Layer, x: number, y: number, n: number, h: number, o: { seed: number; tone: number; ramp?: Ramp; spread?: number }): void {
  const r = o.ramp ?? LEAF;
  for (let i = 0; i < n; i++) {
    const lean = (i - (n - 1) / 2) * (o.spread ?? 0.7) + (h2(i, 1, o.seed) - 0.5) * 0.8;
    const hh = h * (0.6 + h2(i, 2, o.seed) * 0.5);
    const bx = x + Math.round((i - (n - 1) / 2) * 1.2);
    for (let t = 0; t < hh; t++) {
      const u = t / hh;
      const px = Math.round(bx + lean * u * u * hh * 0.35);
      const py = y - t;
      L.px(px, py, rk(r, 1.5 + o.tone * 4 + u * 2.4 + (i % 2) * 0.6));
    }
  }
}
