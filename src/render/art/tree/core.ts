/**
 * The tree painter's workbench. A tree is first built as a tiny depth-buffered scene at art
 * resolution: leaf clumps are bumpy spheres, trunks, limbs and roots are tapered tubes, each pixel
 * keeping the front-most surface's depth, normal and material. That gives every species the same
 * believable light for free (top-left sun, clumps shading the clumps under them, the crown's shadow
 * on the trunk, dark crevices between clumps). Then it is finished the way a pixel artist would:
 * a few hand-picked tones per material, bands that break along leaf-sized clusters instead of smooth
 * contours, selective outlines (the darkest tone of the ramp on the shadow side, never black), and
 * no stray single pixels.
 */
import { blank, rgb, type PixelBuf } from '../../pixel/buf';

/** A color ramp, darkest first. */
export type Ramp = readonly string[];

export const EMPTY = -1e9;

function norm3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** The sun: from the top left of the screen and a little toward the viewer. */
export const SUN = norm3(-0.62, -0.74, 0.58);
/** The sun's direction across the screen (a unit step), for marching shadows. */
const SUN_SX = SUN[0] / Math.sqrt(SUN[0] * SUN[0] + SUN[1] * SUN[1]);
const SUN_SY = SUN[1] / Math.sqrt(SUN[0] * SUN[0] + SUN[1] * SUN[1]);

/** Deterministic 0..1 noise from integers. */
export function h2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A seeded random stream (mulberry32). */
export function rand(seed: number): () => number {
  let a = (seed ^ 0x5bd1e995) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise, 0..1, at the given cell size. */
export function vnoise(x: number, y: number, size: number, s: number): number {
  const fx = x / size;
  const fy = y / size;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  let tx = fx - x0;
  let ty = fy - y0;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = h2(x0, y0, s);
  const b = h2(x0 + 1, y0, s);
  const c = h2(x0, y0 + 1, s);
  const d = h2(x0 + 1, y0 + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/**
 * Leaf cells: a jittered grid of leaf centers (Worley). For a pixel, the nearest leaf's center, its
 * offset from it (-1..1 of the cell), and the leaf's own random value. `LeafGrid` is the fast form
 * the painters use (cell points computed once, results in fields, nothing allocated per pixel).
 */
export function leafCell(x: number, y: number, size: number, s: number, aspect = 1.12): { cx: number; cy: number; ox: number; oy: number; id: number; edge: number } {
  const g = new LeafGrid(size, s, aspect, x + 2, y + 2);
  g.at(x, y);
  return { cx: g.cx, cy: g.cy, ox: g.ox, oy: g.oy, id: g.id, edge: g.edge };
}

export class LeafGrid {
  cx = 0;
  cy = 0;
  ox = 0;
  oy = 0;
  id = 0;
  edge = 0;
  private gw: number;
  private gh: number;
  /** Per cell: point x, point y, size factor, id (cells from -1 to the far edge + 1). */
  private pts: Float64Array;

  constructor(readonly size: number, readonly seed: number, readonly aspect: number, w: number, h: number) {
    this.gw = Math.ceil(w / size) + 3;
    this.gh = Math.ceil(h / size) + 3;
    this.pts = new Float64Array(this.gw * this.gh * 4);
    for (let j = 0; j < this.gh; j++) {
      for (let i = 0; i < this.gw; i++) {
        const cx = i - 1;
        const cy = j - 1;
        const o = (j * this.gw + i) * 4;
        this.pts[o] = (cx + 0.05 + h2(cx, cy, seed) * 0.9) * size;
        this.pts[o + 1] = (cy + 0.05 + h2(cx, cy, seed + 1) * 0.9) * size;
        this.pts[o + 2] = 0.8 + h2(cx, cy, seed + 3) * 0.45;
        this.pts[o + 3] = h2(cx, cy, seed + 2);
      }
    }
  }

  at(x: number, y: number): void {
    const size = this.size;
    const gx = Math.floor(x / size);
    const gy = Math.floor(y / size);
    let best = 1e9;
    let second = 1e9;
    const P = this.pts;
    for (let oy = -1; oy <= 1; oy++) {
      const j = Math.min(this.gh - 1, Math.max(0, gy + oy + 1));
      for (let ox = -1; ox <= 1; ox++) {
        const i = Math.min(this.gw - 1, Math.max(0, gx + ox + 1));
        const o = (j * this.gw + i) * 4;
        const dx = x + 0.5 - P[o];
        const dy = (y + 0.5 - P[o + 1]) * this.aspect;
        const d = Math.sqrt(dx * dx + dy * dy) / P[o + 2];
        if (d < best) {
          second = best;
          best = d;
          this.cx = P[o];
          this.cy = P[o + 1];
          this.id = P[o + 3];
        } else if (d < second) second = d;
      }
    }
    this.ox = (x + 0.5 - this.cx) / size;
    this.oy = (y + 0.5 - this.cy) / size;
    this.edge = second - best;
  }
}

export interface Scallop {
  /** Bumps round the rim. */
  n: number;
  /** How deep the notches between bumps cut (fraction of the radius). */
  amp: number;
  ph: number;
}

/**
 * The depth-buffered scene. Coordinates are sprite pixels (x right, y down); z points at the viewer.
 * Every write keeps the front-most surface.
 */
export class Scene {
  readonly z: Float32Array;
  readonly nx: Float32Array;
  readonly ny: Float32Array;
  readonly nz: Float32Array;
  readonly mat: Uint8Array;
  readonly tag: Int16Array;
  /** Texture coordinates: along a tube (px) and across it (-1..1), or a clump's local offset. */
  readonly tu: Float32Array;
  readonly tv: Float32Array;

  constructor(readonly w: number, readonly h: number) {
    const n = w * h;
    this.z = new Float32Array(n).fill(EMPTY);
    this.nx = new Float32Array(n);
    this.ny = new Float32Array(n);
    this.nz = new Float32Array(n);
    this.mat = new Uint8Array(n);
    this.tag = new Int16Array(n).fill(-1);
    this.tu = new Float32Array(n);
    this.tv = new Float32Array(n);
  }

  private put(i: number, z: number, nx: number, ny: number, nz: number, mat: number, tag: number, tu: number, tv: number): void {
    if (z <= this.z[i]) return;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    this.z[i] = z;
    this.nx[i] = nx / l;
    this.ny[i] = ny / l;
    this.nz[i] = nz / l;
    this.mat[i] = mat;
    this.tag[i] = tag;
    this.tu[i] = tu;
    this.tv[i] = tv;
  }

  /** A (bumpy) ellipsoid: a leaf clump, a mushroom cap, a stone. */
  sphere(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, mat: number, tag: number, sc?: Scallop): void {
    const x0 = Math.max(0, Math.floor(cx - rx - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx + 1));
    const y0 = Math.max(0, Math.floor(cy - ry - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d2 = dx * dx + dy * dy;
        // Outside the ball (a scallop only ever cuts in), or behind something nearer than it can reach.
        if (d2 >= 1 || this.z[y * this.w + x] >= cz + rz) continue;
        const d = Math.sqrt(d2);
        let f = 1;
        if (sc && d > 0.3) {
          const a = Math.atan2(dy, dx);
          f = 1 - sc.amp + sc.amp * Math.sqrt(Math.abs(Math.sin((sc.n * a) / 2 + sc.ph)));
        }
        const q = d / f;
        if (q >= 1) continue;
        const s = Math.sqrt(1 - q * q);
        this.put(y * this.w + x, cz + rz * s, dx / f, dy / f, s, mat, tag, dx, dy);
      }
    }
  }

  /**
   * A tapered tube from (x0, y0, z0) to (x1, y1, z1), radius r0 to r1 (a trunk, limb or root).
   * `flat` < 1 squashes its depth (roots lying on the ground). `u0` offsets the along-texture.
   */
  tube(x0: number, y0: number, z0: number, r0: number, x1: number, y1: number, z1: number, r1: number, mat: number, tag: number, flat = 1, u0 = 0): void {
    const rmax = Math.max(r0, r1);
    const bx0 = Math.max(0, Math.floor(Math.min(x0, x1) - rmax - 1));
    const bx1 = Math.min(this.w - 1, Math.ceil(Math.max(x0, x1) + rmax + 1));
    const by0 = Math.max(0, Math.floor(Math.min(y0, y1) - rmax - 1));
    const by1 = Math.min(this.h - 1, Math.ceil(Math.max(y0, y1) + rmax + 1));
    const ax = x1 - x0;
    const ay = y1 - y0;
    const len2 = ax * ax + ay * ay || 1;
    const len = Math.sqrt(len2);
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const px = x + 0.5 - x0;
        const py = y + 0.5 - y0;
        const t = Math.max(0, Math.min(1, (px * ax + py * ay) / len2));
        const ex = px - ax * t;
        const ey = py - ay * t;
        const d = Math.sqrt(ex * ex + ey * ey);
        const r = r0 + (r1 - r0) * t;
        if (d >= r || r <= 0.2) continue;
        const q = d / r;
        const s = Math.sqrt(1 - q * q);
        const side = ax * ey - ay * ex >= 0 ? 1 : -1;
        this.put(y * this.w + x, z0 + (z1 - z0) * t + r * s * flat, ex / r, ey / r, s, mat, tag, u0 + t * len, side * q);
      }
    }
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** The surface depth at a pixel (EMPTY outside). */
  depth(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return EMPTY;
    return this.z[y * this.w + x];
  }

  /** Lambert against the sun, -1..1. */
  lit(i: number): number {
    return this.nx[i] * SUN[0] + this.ny[i] * SUN[1] + this.nz[i] * SUN[2];
  }

  /**
   * 0..1: how much of the sun is blocked at this pixel, by marching toward the sun over the depth
   * buffer. `rise` is how fast the ray climbs (depth px per screen px): higher, shorter shadows.
   */
  shadow(x: number, y: number, rise = 0.9, steps = 24): number {
    const i = y * this.w + x;
    const z0 = this.z[i];
    if (z0 === EMPTY) return 0;
    let blocked = 0;
    for (let k = 1; k <= steps; k++) {
      const qx = Math.round(x + SUN_SX * k);
      const qy = Math.round(y + SUN_SY * k);
      if (qx < 0 || qy < 0 || qx >= this.w || qy >= this.h) break;
      const zq = this.z[qy * this.w + qx];
      if (zq === EMPTY) continue;
      const over = zq - (z0 + rise * k);
      if (over > 0.6) {
        blocked = Math.max(blocked, Math.min(1, over / 2.2));
        if (blocked >= 1) break;
      }
    }
    return blocked;
  }

  /** 0..1: how sunk a pixel is below its neighbors (crevices between clumps, under limbs). */
  occlusion(x: number, y: number, r = 2.5): number {
    const i = y * this.w + x;
    const z0 = this.z[i];
    if (z0 === EMPTY) return 0;
    const offs = ringOffsets(r);
    let acc = 0;
    for (let k = 0; k < 16; k += 2) {
      const zq = this.depth(x + offs[k], y + offs[k + 1]);
      if (zq === EMPTY) continue;
      const v = (zq - z0 - 0.5) / (r * 1.6);
      acc += v <= 0 ? 0 : v >= 1 ? 1 : v;
    }
    return acc / 8;
  }

  /** True where a pixel touches empty space (4-neighbors). */
  // (see ringOffsets below)
  edge(x: number, y: number): boolean {
    return this.depth(x - 1, y) === EMPTY || this.depth(x + 1, y) === EMPTY || this.depth(x, y - 1) === EMPTY || this.depth(x, y + 1) === EMPTY;
  }
}

const rings = new Map<number, Int8Array>();
/** Eight points round a circle of radius r, rounded to pixels (dx, dy pairs). */
function ringOffsets(r: number): Int8Array {
  let o = rings.get(r);
  if (!o) {
    o = new Int8Array(16);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      o[k * 2] = Math.round(Math.cos(a) * r);
      o[k * 2 + 1] = Math.round(Math.sin(a) * r);
    }
    rings.set(r, o);
  }
  return o;
}

/**
 * The finished picture before it becomes RGBA: per pixel a ramp (palette slot) and a tone in it.
 * Finishing passes work here, where "one tone darker" means something.
 */
export class Paint {
  readonly lev: Int8Array;
  readonly pal: Uint8Array;

  constructor(readonly w: number, readonly h: number, readonly ramps: Ramp[]) {
    this.lev = new Int8Array(w * h).fill(-1);
    this.pal = new Uint8Array(w * h);
  }

  set(x: number, y: number, pal: number, lev: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    const r = this.ramps[pal];
    this.pal[i] = pal;
    this.lev[i] = Math.max(0, Math.min(r.length - 1, Math.round(lev)));
  }

  clear(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.lev[y * this.w + x] = -1;
  }

  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.lev[y * this.w + x];
  }

  palAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.lev[y * this.w + x] < 0 ? -1 : this.pal[y * this.w + x];
  }

  opaque(x: number, y: number): boolean {
    return this.at(x, y) >= 0;
  }

  /**
   * Removes stray pixels: a pixel whose four neighbors are all one other tone of the same ramp takes
   * that tone (keeps `keep` tones, the deliberate sparkles).
   */
  cleanOrphans(pals: ReadonlySet<number>, keep: (pal: number, lev: number) => boolean = () => false): void {
    const src = this.lev.slice();
    const W = this.w;
    const H = this.h;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const v = src[i];
        if (v < 0 || !pals.has(this.pal[i]) || keep(this.pal[i], v)) continue;
        const a = src[i - 1];
        const b = src[i + 1];
        const c = src[i - W];
        const d = src[i + W];
        if (a < 0 || b < 0 || c < 0 || d < 0) continue;
        if (a === v || b === v || c === v || d === v) continue;
        // A lone pixel: it takes the neighbors' tone nearest its own.
        let best = a;
        if (Math.abs(b - v) < Math.abs(best - v)) best = b;
        if (Math.abs(c - v) < Math.abs(best - v)) best = c;
        if (Math.abs(d - v) < Math.abs(best - v)) best = d;
        this.lev[i] = best;
      }
    }
  }

  /**
   * A 1-pixel ring round everything opaque, in palette slot `pal`: tone `dark` where the ring is on
   * the shadow side (right of or below the shape), `lit` on the sun's side, or what `pick` says for
   * the neighbor it hugs (wood gets its own ink).
   */
  ring(pal: number, pick: (neighborPal: number, litSide: boolean) => number): void {
    const before = this.lev.slice();
    const W = this.w;
    const H = this.h;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (before[i] >= 0) continue;
        let n = -1;
        let lit = false;
        if (x + 1 < W && before[i + 1] >= 0) {
          n = i + 1;
          lit = true;
        } else if (y + 1 < H && before[i + W] >= 0) {
          n = i + W;
          lit = true;
        } else if (x > 0 && before[i - 1] >= 0) n = i - 1;
        else if (y > 0 && before[i - W] >= 0) n = i - W;
        if (n < 0) continue;
        this.pal[i] = pal;
        const r = this.ramps[pal];
        this.lev[i] = Math.max(0, Math.min(r.length - 1, pick(this.pal[n], lit)));
      }
    }
  }

  toBuf(): PixelBuf {
    const b = blank(this.w, this.h);
    for (let i = 0; i < this.lev.length; i++) {
      const l = this.lev[i];
      if (l < 0) continue;
      const [r, g, bl] = rgb(this.ramps[this.pal[i]][l]);
      b.px[i * 4] = r;
      b.px[i * 4 + 1] = g;
      b.px[i * 4 + 2] = bl;
      b.px[i * 4 + 3] = 255;
    }
    return b;
  }
}

/** Quantizes 0..1 into `n` tones with per-pixel threshold jitter `j` (-0.5..0.5 of a step). */
export function quant(v: number, n: number, j = 0): number {
  return Math.max(0, Math.min(n - 1, Math.floor(v * n + j)));
}
