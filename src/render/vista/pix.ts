/**
 * The vista's toolbox: RGBA pixel buffers painted at art resolution (pixel art keeps alpha at 0 or
 * 255; soft layers may use partial alpha), color helpers, a seeded random, smooth noise and a
 * Gaussian blur that soft layers get once per layout (never per frame).
 */
import { makeCanvas } from '../art/draw';

export type RGB = readonly [number, number, number];
export type Canvas = HTMLCanvasElement;

export function canvas(w: number, h: number): Canvas {
  return makeCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))) as Canvas;
}

export function ctx2d(c: Canvas): CanvasRenderingContext2D {
  return c.getContext('2d')!;
}

// ------------------------------------------------------------------ color

const hexCache = new Map<string, RGB>();

export function hex(h: string): RGB {
  let c = hexCache.get(h);
  if (!c) {
    const s = h.replace('#', '');
    c = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    hexCache.set(h, c);
  }
  return c;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function mul(a: RGB, k: number): RGB {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function css(c: RGB, a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}

export function luma(c: RGB): number {
  return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255;
}

export type Stops = ReadonlyArray<readonly [number, string]>;

/** A color along piecewise-linear stops. */
export function sample(stops: Stops, t: number): RGB {
  if (t <= stops[0][0]) return hex(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [a0, c0] = stops[i - 1];
      const [a1, c1] = stops[i];
      return mix(hex(c0), hex(c1), (t - a0) / (a1 - a0));
    }
  }
  return hex(stops[stops.length - 1][1]);
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ random

/** Seeded random (mulberry32), 0..1. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 0..1 from integers. */
export function h01(...n: number[]): number {
  let h = 0x811c9dc5;
  for (const v of n) {
    h ^= v | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

/** Smooth 1D value noise, -1..1, one feature per unit. */
export function noise1(seed: number): (x: number) => number {
  const r = rng(seed);
  const n = 512;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = r() * 2 - 1;
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = v[((i % n) + n) % n];
    const b = v[(((i + 1) % n) + n) % n];
    return a + (b - a) * f * f * (3 - 2 * f);
  };
}

/** Fractal 1D noise (octaves of noise1), roughly -1..1. */
export function fbm1(seed: number, octaves = 3): (x: number) => number {
  const ns = Array.from({ length: octaves }, (_, i) => noise1(seed * 31 + i * 977));
  return (x: number) => {
    let s = 0;
    let amp = 1;
    let tot = 0;
    for (let i = 0; i < octaves; i++) {
      s += ns[i](x * (1 << i)) * amp;
      tot += amp;
      amp *= 0.5;
    }
    return s / tot;
  };
}

// ------------------------------------------------------------------ pixel buffer

export class Pix {
  readonly w: number;
  readonly h: number;
  readonly d: Uint8ClampedArray;

  constructor(w: number, h: number) {
    this.w = Math.max(1, Math.ceil(w));
    this.h = Math.max(1, Math.ceil(h));
    this.d = new Uint8ClampedArray(this.w * this.h * 4);
  }

  set(x: number, y: number, c: RGB, a = 255): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
    this.d[i + 3] = a;
  }

  /** Paints `c` over the pixel at opacity k (0..1), keeping it opaque if it was. */
  over(x: number, y: number, c: RGB, k: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || k <= 0) return;
    const i = (y * this.w + x) * 4;
    const a0 = this.d[i + 3] / 255;
    const a = k + a0 * (1 - k);
    if (a <= 0) return;
    for (let j = 0; j < 3; j++) this.d[i + j] = (c[j] * k + this.d[i + j] * a0 * (1 - k)) / a;
    this.d[i + 3] = a * 255;
  }

  /** Tints an opaque pixel toward `c` by k, leaving transparent pixels alone. */
  tint(x: number, y: number, c: RGB, k: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (!this.d[i + 3]) return;
    for (let j = 0; j < 3; j++) this.d[i + j] += (c[j] - this.d[i + j]) * k;
  }

  a(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }

  rgb(x: number, y: number): RGB {
    const i = (clamp(y, 0, this.h - 1) * this.w + clamp(x, 0, this.w - 1)) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }

  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = Math.floor(y); yy < y + h; yy++) for (let xx = Math.floor(x); xx < x + w; xx++) this.set(xx, yy, c);
  }

  /** Copies the opaque pixels of `src` with its top left at (dx, dy). */
  blit(src: Pix, dx: number, dy: number): void {
    dx = Math.round(dx);
    dy = Math.round(dy);
    for (let y = 0; y < src.h; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < src.w; x++) {
        const tx = x + dx;
        if (tx < 0 || tx >= this.w) continue;
        const si = (y * src.w + x) * 4;
        const sa = src.d[si + 3];
        if (!sa) continue;
        const di = (ty * this.w + tx) * 4;
        if (sa === 255) {
          this.d[di] = src.d[si];
          this.d[di + 1] = src.d[si + 1];
          this.d[di + 2] = src.d[si + 2];
          this.d[di + 3] = 255;
        } else this.over(tx, ty, [src.d[si], src.d[si + 1], src.d[si + 2]], sa / 255);
      }
    }
  }

  clone(): Pix {
    const p = new Pix(this.w, this.h);
    p.d.set(this.d);
    return p;
  }

  toCanvas(): Canvas {
    const c = canvas(this.w, this.h);
    const g = ctx2d(c);
    const img = g.createImageData(this.w, this.h);
    img.data.set(this.d);
    g.putImageData(img, 0, 0);
    return c;
  }
}

/** Every pixel becomes an n x n block. */
export function upscale(src: Pix, n: number): Pix {
  if (n === 1) return src.clone();
  const out = new Pix(src.w * n, src.h * n);
  const s = src.d;
  const d = out.d;
  for (let y = 0; y < out.h; y++) {
    const sy = Math.floor(y / n);
    for (let x = 0; x < out.w; x++) {
      const si = (sy * src.w + Math.floor(x / n)) * 4;
      const di = (y * out.w + x) * 4;
      d[di] = s[si];
      d[di + 1] = s[si + 1];
      d[di + 2] = s[si + 2];
      d[di + 3] = s[si + 3];
    }
  }
  return out;
}

// ------------------------------------------------------------------ blur

/** Box widths whose three passes approximate a Gaussian of `sigma`. */
function boxes(sigma: number, n: number): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu));
}

function boxPass(src: Float32Array, dst: Float32Array, len: number, lines: number, stride: number, step: number, r: number, clampEdge: boolean): void {
  const k = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const o = l * stride;
    const first = clampEdge ? src[o] : 0;
    const last = clampEdge ? src[o + (len - 1) * step] : 0;
    let acc = first * r;
    for (let i = 0; i <= r; i++) acc += i < len ? src[o + i * step] : last;
    for (let i = 0; i < len; i++) {
      dst[o + i * step] = acc * k;
      const add = i + r + 1;
      const sub = i - r;
      acc += (add < len ? src[o + add * step] : last) - (sub >= 0 ? src[o + sub * step] : first);
    }
  }
}

/** Gaussian blur (three box passes) of one plane of values, in place (`tmp` is scratch of the same size). */
export function blurPlane(a: Float32Array, tmp: Float32Array, w: number, h: number, sigma: number, clampEdge = false): void {
  if (sigma < 0.3) return;
  for (const size of boxes(sigma, 3)) {
    const r = (size - 1) >> 1;
    if (r < 1) continue;
    boxPass(a, tmp, w, h, w, 1, r, clampEdge);
    boxPass(tmp, a, h, w, 1, w, r, clampEdge);
  }
}

/**
 * Gaussian blur (three box passes) of an RGBA buffer, in place, with premultiplied alpha so edges
 * don't darken. `clampEdge` repeats the border instead of fading into transparency.
 */
export function blurRGBA(d: Uint8ClampedArray, w: number, h: number, sigma: number, clampEdge = false): void {
  if (sigma < 0.3) return;
  const n = w * h;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3] / 255;
    ch[0][i] = d[i * 4] * a;
    ch[1][i] = d[i * 4 + 1] * a;
    ch[2][i] = d[i * 4 + 2] * a;
    ch[3][i] = a;
  }
  const tmp = new Float32Array(n);
  for (const size of boxes(sigma, 3)) {
    const r = (size - 1) >> 1;
    if (r < 1) continue;
    for (const c of ch) {
      boxPass(c, tmp, w, h, w, 1, r, clampEdge);
      boxPass(tmp, c, h, w, 1, w, r, clampEdge);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = ch[3][i];
    d[i * 4 + 3] = a * 255;
    if (a > 1 / 512) {
      d[i * 4] = ch[0][i] / a;
      d[i * 4 + 1] = ch[1][i] / a;
      d[i * 4 + 2] = ch[2][i] / a;
    }
  }
}

/** A blurred copy of a pixel layer, computed at `scale` times its resolution (blur in source pixels). */
export function blurred(src: Pix, sigma: number, scale = 1, clampEdge = false): Pix {
  const out = upscale(src, scale);
  blurRGBA(out.d, out.w, out.h, sigma * scale, clampEdge);
  return out;
}

// ------------------------------------------------------------------ glow sprites

const glowCache = new Map<string, Canvas>();

/** A soft round glow (color at the middle fading to nothing), cached per color. Draw it scaled. */
export function glowSprite(color: RGB, falloff = 1): Canvas {
  const key = `${color.map(Math.round).join(',')}|${falloff}`;
  let c = glowCache.get(key);
  if (c) return c;
  const S = 64;
  c = canvas(S, S);
  const g = ctx2d(c);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = Math.pow(1 - u, 1.6 * falloff) * (u < 0.999 ? 1 : 0);
    grad.addColorStop(u, css(color, a));
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  glowCache.set(key, c);
  return c;
}

/** A rectangle of a pixel buffer (outside reads as transparent). */
export function crop(src: Pix, x: number, y: number, w: number, h: number): Pix {
  const out = new Pix(w, h);
  for (let yy = 0; yy < out.h; yy++) {
    const sy = y + yy;
    if (sy < 0 || sy >= src.h) continue;
    for (let xx = 0; xx < out.w; xx++) {
      const sx = x + xx;
      if (sx < 0 || sx >= src.w) continue;
      const si = (sy * src.w + sx) * 4;
      const di = (yy * out.w + xx) * 4;
      out.d[di] = src.d[si];
      out.d[di + 1] = src.d[si + 1];
      out.d[di + 2] = src.d[si + 2];
      out.d[di + 3] = src.d[si + 3];
    }
  }
  return out;
}

/** The first row with any opaque pixel (h if none). */
export function firstRow(p: Pix): number {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.d[(y * p.w + x) * 4 + 3]) return y;
  return p.h;
}

/** Grows a buffer by n transparent pixels on every side. */
export function padPix(src: Pix, n: number): Pix {
  const out = new Pix(src.w + 2 * n, src.h + 2 * n);
  out.blit(src, n, n);
  return out;
}

/** Smooth 2D value noise, -1..1, one feature per unit. */
export function noise2(seed: number): (x: number, y: number) => number {
  const h = (ix: number, iy: number) => h01(ix, iy, seed) * 2 - 1;
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy);
    const b = h(ix + 1, iy);
    const c = h(ix, iy + 1);
    const d = h(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
