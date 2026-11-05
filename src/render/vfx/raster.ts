/**
 * Pixel rasterizers for effect sprites, on the art grid (no DOM: the preview sheet and the tests run
 * them in Node). Shapes are tested per pixel center, and thickness is measured along the minor axis
 * the way a pixel artist counts it: a 1-pixel arc or line has exactly one pixel per row or column
 * (Bresenham-clean, no doubled corners, no gaps), a 3-pixel line three.
 *
 * A Draft is a small paint surface centered on its anchor (local 0,0 is the effect's origin). Each
 * pixel has a color and a priority (higher wins, equal: the later paint wins). sprite() crops it to
 * what was painted. Effects are drawn crisp and flat (unlit, never glowing): no layers to choose.
 */
import { blank, rgb, type PixelBuf } from '../pixel/buf';

const TAU = Math.PI * 2;

/** An effect frame, and where its anchor pixel is (buf is null when nothing was painted). */
export interface VfxSprite {
  buf: PixelBuf | null;
  ax: number;
  ay: number;
}

export class Draft {
  readonly size: number;
  private readonly half: number;
  private readonly col: Int32Array;
  private readonly pri: Uint8Array;

  constructor(half = 48) {
    this.half = half;
    this.size = half * 2 + 1;
    this.col = new Int32Array(this.size * this.size).fill(-1);
    this.pri = new Uint8Array(this.size * this.size);
  }

  private idx(x: number, y: number): number {
    const bx = Math.round(x) + this.half;
    const by = Math.round(y) + this.half;
    if (bx < 0 || by < 0 || bx >= this.size || by >= this.size) return -1;
    return by * this.size + bx;
  }

  /** Paints a pixel (local coords) unless a higher-priority one is there. */
  put(x: number, y: number, hex: string, pri = 1): void {
    const i = this.idx(x, y);
    if (i < 0 || pri < this.pri[i]) return;
    const [r, g, b] = rgb(hex);
    this.col[i] = (r << 16) | (g << 8) | b;
    this.pri[i] = pri;
  }

  has(x: number, y: number): boolean {
    const i = this.idx(x, y);
    return i >= 0 && this.col[i] >= 0;
  }



  /** Cropped to what was painted (null when nothing was). */
  sprite(): VfxSprite {
    let x0 = this.size;
    let y0 = this.size;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      if (this.col[y * this.size + x] < 0) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    if (x1 < 0) return { buf: null, ax: 0, ay: 0 };
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const buf = blank(w, h);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const c = this.col[y * this.size + x];
      if (c < 0) continue;
      const i = ((y - y0) * w + (x - x0)) * 4;
      buf.px[i] = (c >> 16) & 255;
      buf.px[i + 1] = (c >> 8) & 255;
      buf.px[i + 2] = c & 255;
      buf.px[i + 3] = 255;
    }
    return { buf, ax: this.half - x0, ay: this.half - y0 };
  }

  /**
   * An ink edge: every empty pixel next to a painted one (4-neighbors) on the outside of what's there
   * now, in `hex`, under everything (priority 0). It sets a shape off any floor.
   */
  edge(hex: string, only?: (x: number, y: number) => boolean): void {
    const S = this.size;
    const add: number[] = [];
    for (let by = 0; by < S; by++) for (let bx = 0; bx < S; bx++) {
      const i = by * S + bx;
      if (this.col[i] >= 0) continue;
      const near = (bx > 0 && this.col[i - 1] >= 0) || (bx < S - 1 && this.col[i + 1] >= 0) || (by > 0 && this.col[i - S] >= 0) || (by < S - 1 && this.col[i + S] >= 0);
      if (near && (!only || only(bx - this.half, by - this.half))) add.push(i);
    }
    const [r, g, b] = rgb(hex);
    for (const i of add) {
      this.col[i] = (r << 16) | (g << 8) | b;
      this.pri[i] = 0;
    }
  }
}

// ------------------------------------------------------------------ arcs

export interface BandOpts {
  /** Center (local px) and outer radius across; the arc is flattened to k of that down the screen. */
  cx: number;
  cy: number;
  R: number;
  k: number;
  /** Start angle (radians, screen convention: y down, measured before the flattening), sweep and its way. */
  a0: number;
  span: number;
  sign: 1 | -1;
  /** The part of the sweep shown, 0..1. */
  t0: number;
  t1: number;
  /** Pixels across (counted along the minor axis) at t; under 1 is still one pixel. */
  thick: (t: number) => number;
  /**
   * Paints one pixel: t along the sweep (0 at its start), p the pixel's row counted in from the outer
   * edge (0 = the rim), n how many rows the band has there.
   */
  paint: (x: number, y: number, t: number, p: number, n: number) => void;
}

/**
 * A band along an elliptic arc (a crescent when its thickness varies): every pixel whose center lies
 * within `thick` pixels inside the ellipse's edge, between the swept angles.
 */
export function band(o: BandOpts): void {
  const R = Math.max(1, o.R);
  const k = o.k;
  const x0 = Math.floor(o.cx - R - 1);
  const x1 = Math.ceil(o.cx + R + 1);
  const y0 = Math.floor(o.cy - R * k - 1);
  const y1 = Math.ceil(o.cy + R * k + 1);
  const RR = R * R;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - o.cx;
      const dy = y - o.cy;
      const uy = dy / k;
      const rho = Math.sqrt(dx * dx + uy * uy) / R;
      if (rho > 1.15 || rho < 0.15) continue;
      let rel = (Math.atan2(uy, dx) - o.a0) * o.sign;
      rel = ((rel % TAU) + TAU) % TAU;
      if (rel > o.span + 1e-9) continue;
      const t = o.span > 0 ? rel / o.span : 0;
      if (t < o.t0 || t > o.t1) continue;
      // Distance in from the edge, in pixels along the minor axis (the gradient's larger component).
      const gx = Math.abs(dx) / (RR * rho);
      const gy = Math.abs(dy) / (k * k * RR * rho);
      const g = Math.max(gx, gy, 1e-6);
      const depth = (1 - rho) / g + 0.5;
      const n = Math.max(1, Math.round(o.thick(t)));
      if (depth < 0 || depth >= n) continue;
      o.paint(x, y, t, Math.floor(depth), n);
    }
  }
}


/** A 1-pixel ellipse (rx across, ry down), painted through `paint` with its angle (0..1 round it). */
export function ellipse(cx: number, cy: number, rx: number, ry: number, paint: (x: number, y: number, a: number) => void): void {
  band({
    cx,
    cy,
    R: rx,
    k: ry / Math.max(0.5, rx),
    a0: 0,
    span: TAU,
    sign: 1,
    t0: 0,
    t1: 1,
    thick: () => 1,
    paint: (x, y, t) => paint(x, y, t),
  });
}

// ------------------------------------------------------------------ lines

/**
 * A straight stroke from (x0, y0) to (x1, y1), `width(s)` pixels wide at s (0 at the start, 1 at
 * the end), counted along the minor axis: width 1 is a clean Bresenham line at any angle.
 * `paint` gets s and the signed offset across the line (in those pixels).
 */
export function stroke(x0: number, y0: number, x1: number, y1: number, width: (s: number) => number, paint: (x: number, y: number, s: number, across: number) => void): void {
  const ax = x1 - x0;
  const ay = y1 - y0;
  const len = Math.hypot(ax, ay);
  if (len < 1e-6) {
    if (width(1) > 0) paint(Math.round(x1), Math.round(y1), 1, 0);
    return;
  }
  const ux = ax / len;
  const uy = ay / len;
  const m = Math.max(Math.abs(ux), Math.abs(uy));
  const xMajor = Math.abs(ax) >= Math.abs(ay);
  const major = xMajor ? ax : ay;
  const slack = 0.5 / Math.abs(major);
  let wmax = 0;
  for (let i = 0; i <= 8; i++) wmax = Math.max(wmax, width(i / 8));
  const pad = Math.ceil(wmax) + 1;
  const bx0 = Math.floor(Math.min(x0, x1)) - pad;
  const bx1 = Math.ceil(Math.max(x0, x1)) + pad;
  const by0 = Math.floor(Math.min(y0, y1)) - pad;
  const by1 = Math.ceil(Math.max(y0, y1)) + pad;
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const px = x - x0;
      const py = y - y0;
      // How far along, on the major axis (so the ends are square to the grid, as Bresenham's are).
      const sm = (xMajor ? px : py) / major;
      if (sm < -slack || sm > 1 + slack) continue;
      const s = Math.max(0, Math.min(1, sm));
      const w = width(s);
      if (w <= 0) continue;
      const across = (py * ux - px * uy) / m;
      // Centered: odd widths straddle the line, even ones lean to one side (so no half pixels).
      const lo = -w / 2 + (w % 2 === 0 ? 0.5 : 0);
      if (across < lo - 0.5 + 1e-9 || across >= lo + w - 0.5 + 1e-9) continue;
      paint(x, y, s, across);
    }
  }
}

// ------------------------------------------------------------------ stamps

/**
 * A star: a hot center, four rays `len` long along the axes (fading out along `fade`), diagonal rays
 * half as long. fade[i] is the color at step i from the center (the last repeats).
 */
export function star(d: Draft, x: number, y: number, len: number, fade: readonly string[], pri: number, diag = true): void {
  const cx = Math.round(x);
  const cy = Math.round(y);
  d.put(cx, cy, fade[0], pri);
  for (let i = 1; i <= len; i++) {
    const c = fade[Math.min(fade.length - 1, i)];
    d.put(cx + i, cy, c, pri);
    d.put(cx - i, cy, c, pri);
    d.put(cx, cy + i, c, pri);
    d.put(cx, cy - i, c, pri);
  }
  if (!diag) return;
  const dl = Math.floor(len / 2);
  for (let i = 1; i <= dl; i++) {
    const c = fade[Math.min(fade.length - 1, i + 1)];
    d.put(cx + i, cy + i, c, pri);
    d.put(cx - i, cy + i, c, pri);
    d.put(cx + i, cy - i, c, pri);
    d.put(cx - i, cy - i, c, pri);
  }
}

/** A 3x3 plus (a twinkle): `core` in the middle, `arm` round it. */
export function plus(d: Draft, x: number, y: number, core: string, arm: string, pri: number): void {
  const cx = Math.round(x);
  const cy = Math.round(y);
  d.put(cx - 1, cy, arm, pri);
  d.put(cx + 1, cy, arm, pri);
  d.put(cx, cy - 1, arm, pri);
  d.put(cx, cy + 1, arm, pri);
  d.put(cx, cy, core, pri);
}

/** A filled disc of radius r (pixel centers within r), colored by the distance from its center. */
export function disc(cx: number, cy: number, r: number, paint: (x: number, y: number, d: number) => void, k = 1): void {
  const R = Math.ceil(r) + 1;
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const d = Math.hypot(x + Math.round(cx) - cx, (y + Math.round(cy) - cy) / k);
    if (d <= r) paint(Math.round(cx) + x, Math.round(cy) + y, d / Math.max(1e-6, r));
  }
}


/** A small deterministic hash in 0..1 (dither, sparkle placement). */
export function hash3(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
