/**
 * Hash and value noise for the baked ground (terrain.ts, art/grass.ts): deterministic from a seed,
 * the same in the browser and in Node tools.
 */

/** A hash of a lattice point and a seed, in [0, 1). */
export function h2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in [0, 1) at the given cell size. */
export function vnoise(x: number, y: number, size: number, s: number): number {
  const fx = x / size;
  const fy = y / size;
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

/** Lattice cells kept round a floor's edge (stone middles and edge checks reach past it). */
export const NPAD = 3;

/**
 * Value noise over a floor (`w` x `h` px) with its lattice worked out once: exactly vnoise's values,
 * a few times faster. Points past the lattice fall back to hashing.
 */
export class VNoise {
  private L: Float64Array;
  private cw: number;
  private ch: number;
  /** For whole-pixel x in [0, w): its lattice column and smoothed offset (see `row`, `atRow`). */
  private xi: Int32Array | null = null;
  private xt: Float64Array | null = null;
  private rowK = 0;
  private rowTy = 0;
  constructor(private size: number, private s: number, private w: number, h: number) {
    this.cw = Math.ceil(w / size) + 2 * NPAD + 2;
    this.ch = Math.ceil(h / size) + 2 * NPAD + 2;
    this.L = new Float64Array(this.cw * this.ch);
    for (let j = 0; j < this.ch; j++) for (let i = 0; i < this.cw; i++) this.L[j * this.cw + i] = h2(i - NPAD, j - NPAD, s);
  }

  /**
   * Readies row `y` (whole pixels, 0 <= y < h) for `atRow`: the same values as `at`, without the
   * divisions and smoothing per pixel.
   */
  row(y: number): void {
    if (!this.xi) {
      const n = Math.ceil(this.w);
      this.xi = new Int32Array(n);
      this.xt = new Float64Array(n);
      for (let x = 0; x < n; x++) {
        const fx = x / this.size;
        const x0 = Math.floor(fx);
        this.xi[x] = x0 + NPAD;
        this.xt[x] = smooth(fx - x0);
      }
    }
    const fy = y / this.size;
    const y0 = Math.floor(fy);
    this.rowTy = smooth(fy - y0);
    this.rowK = (y0 + NPAD) * this.cw;
  }

  /** The noise at whole pixel x (0 <= x < w) on the row readied by `row`. */
  atRow(x: number): number {
    const L = this.L;
    const k = this.rowK + this.xi![x];
    const a = L[k];
    const b = L[k + 1];
    const c = L[k + this.cw];
    const d = L[k + this.cw + 1];
    const tx = this.xt![x];
    const ty = this.rowTy;
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }

  at(x: number, y: number): number {
    const size = this.size;
    const fx = x / size;
    const fy = y / size;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const i = x0 + NPAD;
    const j = y0 + NPAD;
    let a: number;
    let b: number;
    let c: number;
    let d: number;
    if (i >= 0 && j >= 0 && i + 1 < this.cw && j + 1 < this.ch) {
      const L = this.L;
      const k = j * this.cw + i;
      a = L[k];
      b = L[k + 1];
      c = L[k + this.cw];
      d = L[k + this.cw + 1];
    } else {
      a = h2(x0, y0, this.s);
      b = h2(x0 + 1, y0, this.s);
      c = h2(x0, y0 + 1, this.s);
      d = h2(x0 + 1, y0 + 1, this.s);
    }
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
}
