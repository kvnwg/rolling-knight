/**
 * Paints a floor's ground once, when the floor is built: the biome's ground and path materials
 * (lawns with blades, tufts and flowers, rounded cobbles whose edges wear away into dirt, flagstones,
 * snow, sand...) with organic edges between them, the farm's tilled fields (plowed soil in furrows),
 * pools of water or lava with banks and foam, walls and cliffs drawn with their front faces (the 3/4
 * view), ambient occlusion where floor meets wall, then the little things on the ground (decals.ts:
 * pebbles, leaves, roots, lily pads...) and the shadows everything standing casts toward the lower
 * right (castShadows.ts). Trees, props and everything that moves are drawn on top each frame
 * (renderer.ts).
 *
 * It runs on a phone while a floor loads, so it is written for speed: colors are packed 0xRRGGBB
 * numbers, the tile masks are typed arrays with a border (no bounds checks), each tile knows what is
 * near it (the math for the edges of paths, fields, water and walls runs only where one can be),
 * and value noise reads a lattice worked out once per floor.
 */
import type { Biome, GroundKind, Ramp } from '../world/biomes';
import { BLOCKED, FLOOR, LIQUID, SOLID, TILE, type FloorMap } from '../world/mapgen';
import { rgb } from './pixel/buf';
import { makeCanvas, mixHex, shade } from './art/draw';
import { DECALS, drawDecal, type DecalCtx, type DecalKind } from './art/decals';
import { castShadows } from './castShadows';
import { frontDecor } from './art/village';
import { Grass, grassLook, type GrassLook } from './art/grass';
import { h2, NPAD, VNoise, vnoise } from './noise';

// ------------------------------------------------------------------ colors

/** A #hex color as a packed 0xRRGGBB number. */
function hexI(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (r << 16) | (g << 8) | b;
}

function rampI(r: Ramp): Int32Array {
  return Int32Array.from(r, hexI);
}

// ------------------------------------------------------------------ noise

/**
 * Jittered-grid Voronoi with its points worked out once: after `at`, `d1` and `d2` are the distances
 * to the nearest and second-nearest point and `id` the nearest cell's hash.
 */
class Voronoi {
  d1 = 0;
  d2 = 0;
  id = 0;
  private PX: Float64Array;
  private PY: Float64Array;
  private ID: Float64Array;
  private cw: number;
  private ch: number;
  constructor(private size: number, private s: number, w: number, h: number) {
    this.cw = Math.ceil(w / size) + 2 * NPAD + 2;
    this.ch = Math.ceil(h / size) + 2 * NPAD + 2;
    const n = this.cw * this.ch;
    this.PX = new Float64Array(n);
    this.PY = new Float64Array(n);
    this.ID = new Float64Array(n);
    for (let j = 0; j < this.ch; j++) {
      for (let i = 0; i < this.cw; i++) {
        const gx = i - NPAD;
        const gy = j - NPAD;
        const k = j * this.cw + i;
        this.PX[k] = (gx + 0.15 + h2(gx, gy, s) * 0.7) * size;
        this.PY[k] = (gy + 0.15 + h2(gx, gy, s + 1) * 0.7) * size;
        this.ID[k] = h2(gx, gy, s + 2);
      }
    }
  }

  at(x: number, y: number): void {
    const size = this.size;
    const cx = Math.floor(x / size);
    const cy = Math.floor(y / size);
    let d1 = 1e9;
    let d2 = 1e9;
    let id = 0;
    const inside = cx - 1 + NPAD >= 0 && cy - 1 + NPAD >= 0 && cx + 1 + NPAD < this.cw && cy + 1 + NPAD < this.ch;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox;
        const gy = cy + oy;
        let px: number;
        let py: number;
        let k = 0;
        if (inside) {
          k = (gy + NPAD) * this.cw + gx + NPAD;
          px = this.PX[k];
          py = this.PY[k];
        } else {
          px = (gx + 0.15 + h2(gx, gy, this.s) * 0.7) * size;
          py = (gy + 0.15 + h2(gx, gy, this.s + 1) * 0.7) * size;
        }
        const d = Math.hypot(x - px, y - py);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = inside ? this.ID[k] : h2(gx, gy, this.s + 2);
        } else if (d < d2) d2 = d;
      }
    }
    this.d1 = d1;
    this.d2 = d2;
    this.id = id;
  }
}

// ------------------------------------------------------------------ materials

const clampK = (k: number, n: number) => Math.max(0, Math.min(n - 1, Math.round(k)));

/** Brick-like rows of stones: which stone a pixel is in and where in it (after `at`: sx, sy, w, h, id). */
class Courses {
  sx = 0;
  sy = 0;
  w = 0;
  h = 0;
  id = 0;
  private rows = new Map<number, number[]>();
  private lastRow = NaN;
  private lastEdges: number[] = [];
  constructor(private seed: number, private rowH: number, private minW: number, private maxW: number) {}
  at(x: number, y: number): void {
    const row = Math.floor(y / this.rowH);
    let edges: number[];
    if (row === this.lastRow) edges = this.lastEdges;
    else {
      let e = this.rows.get(row);
      if (!e) {
        e = [];
        let p = -Math.floor(h2(row, 0, this.seed) * this.maxW);
        while (p < 4000) {
          e.push(p);
          p += this.minW + Math.floor(h2(row, e.length, this.seed + 7) * (this.maxW - this.minW + 1));
        }
        this.rows.set(row, e);
      }
      edges = e;
      this.lastRow = row;
      this.lastEdges = e;
    }
    // Binary search for the stone containing x.
    let lo = 0;
    let hi = edges.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (edges[mid] <= x) lo = mid;
      else hi = mid - 1;
    }
    const start = edges[lo];
    this.sx = x - start;
    this.sy = y - row * this.rowH;
    this.w = (edges[lo + 1] ?? start + this.maxW) - start;
    this.h = this.rowH;
    this.id = h2(row, lo, this.seed + 3);
  }
}

/**
 * Rounded cobbles: stones on a jittered grid (`size` apart), each pixel belonging to the stone whose
 * middle is nearest. After `at`: the stone (gx, gy), its middle (px, py) and how far the pixel is from
 * it and from the next stone (d1, d2; close to both: the mortar between them).
 */
class Cobbles {
  gx = 0;
  gy = 0;
  px = 0;
  py = 0;
  d1 = 0;
  d2 = 0;
  /** The nearest stone's cell (an index for per-stone data), or -1 past the floor's edge. */
  k = -1;
  /** How many cells there are. */
  readonly cells: number;
  private PX: Float64Array;
  private PY: Float64Array;
  private cw: number;
  private ch: number;
  constructor(private seed: number, private size: number, w: number, h: number) {
    this.cw = Math.ceil(w / size) + 2 * NPAD + 2;
    this.ch = Math.ceil(h / size) + 2 * NPAD + 2;
    this.cells = this.cw * this.ch;
    this.PX = new Float64Array(this.cw * this.ch);
    this.PY = new Float64Array(this.cw * this.ch);
    for (let j = 0; j < this.ch; j++) {
      for (let i = 0; i < this.cw; i++) {
        const [px, py] = this.point(i - NPAD, j - NPAD);
        this.PX[j * this.cw + i] = px;
        this.PY[j * this.cw + i] = py;
      }
    }
  }

  private point(gx: number, gy: number): [number, number] {
    // Rows offset by half a stone, like laid cobbles.
    return [(gx + 0.2 + h2(gx, gy, this.seed) * 0.6 + (gy & 1) * 0.5) * this.size, (gy + 0.25 + h2(gx, gy, this.seed + 1) * 0.5) * this.size];
  }

  at(x: number, y: number): void {
    const size = this.size;
    const cx = Math.floor(x / size);
    const cy = Math.floor(y / size);
    let d1 = 1e9;
    let d2 = 1e9;
    let bx = 0;
    let by = 0;
    let bpx = 0;
    let bpy = 0;
    let bk = -1;
    const inside = cx - 1 + NPAD >= 0 && cy - 1 + NPAD >= 0 && cx + 1 + NPAD < this.cw && cy + 1 + NPAD < this.ch;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox;
        const gy = cy + oy;
        let px: number;
        let py: number;
        let k = -1;
        if (inside) {
          k = (gy + NPAD) * this.cw + gx + NPAD;
          px = this.PX[k];
          py = this.PY[k];
        } else [px, py] = this.point(gx, gy);
        const ex = x + 0.5 - px;
        const ey = (y + 0.5 - py) * 1.15;
        const d = ex * ex + ey * ey;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          bx = gx;
          by = gy;
          bpx = px;
          bpy = py;
          bk = k;
        } else if (d < d2) d2 = d;
      }
    }
    this.gx = bx;
    this.gy = by;
    this.px = bpx;
    this.py = bpy;
    this.k = bk;
    this.d1 = Math.sqrt(d1);
    this.d2 = Math.sqrt(d2);
  }
}

interface MatCtx {
  kind: GroundKind;
  seed: number;
  /** The ramp and accents as packed colors. */
  r: Int32Array;
  a: Int32Array | null;
  courses?: Courses;
  /** The material's noise fields (which ones depends on its kind: see makeMat). */
  n: VNoise[];
  voronoi?: Voronoi;
  /** A lawn (grass and moss): its patches, then its blades, tufts and flowers (art/grass.ts). */
  grass?: Grass;
  /** The row its noise fields are readied for (VNoise.row), and the last cell hash it looked up. */
  rowY: number;
  cellKey: number;
  cellVal: number;
}

/** Readies a material's noise for row y (paint and tilled read it with atRow). */
function matRow(m: MatCtx, y: number): void {
  if (y === m.rowY) return;
  m.rowY = y;
  for (const n of m.n) n.row(y);
}

/** h2 of a material's cell (cx, cy), remembered for the next pixel in the same cell. */
function cellHash(m: MatCtx, cx: number, cy: number, s: number): number {
  const key = cx * 65536 + cy;
  if (key !== m.cellKey) {
    m.cellKey = key;
    m.cellVal = h2(cx, cy, s);
  }
  return m.cellVal;
}

/** A material for a floor `w` x `h` px, with the noise its kind paints with (a lawn in `look`). */
function makeMat(kind: GroundKind, seed: number, ramp: Ramp, accent: Ramp | undefined, w: number, h: number, look?: GrassLook): MatCtx {
  const N = (size: number, ds: number) => new VNoise(size, seed + ds, w, h);
  const m: MatCtx = { kind, seed, r: rampI(ramp), a: accent ? rampI(accent) : null, n: [], rowY: -1, cellKey: -1, cellVal: 0 };
  switch (kind) {
    case 'grass':
    case 'moss':
      if (look) m.grass = new Grass(look, seed, w, h);
      break;
    case 'cobble':
      m.courses = new Courses(seed, 5, 4, 8);
      m.n = [N(18, 11), N(30, 12)];
      break;
    case 'flagstone':
      m.courses = new Courses(seed, 9, 9, 15);
      m.n = [N(14, 13), N(16, 14)];
      break;
    case 'dirt':
      m.n = [N(20, 0), N(6, 1)];
      break;
    case 'snow':
      m.n = [N(28, 0), N(11, 1), N(40, 3)];
      break;
    case 'ice':
      m.n = [N(22, 0), N(30, 1)];
      m.voronoi = new Voronoi(18, seed + 2, w, h);
      break;
    case 'sand':
      m.n = [N(34, 0)];
      break;
    case 'mud':
      m.n = [N(18, 0)];
      break;
    case 'tilled':
      m.n = [N(22, 0)];
      break;
    case 'basalt':
    case 'crystalStone':
      m.voronoi = new Voronoi(11, seed, w, h);
      break;
  }
  return m;
}

/** A material's color at a pixel (0xRRGGBB). */
function paint(kind: GroundKind, x: number, y: number, m: MatCtx): number {
  const r = m.r;
  const s = m.seed;
  const n0 = m.n[0];
  const n1 = m.n[1];
  matRow(m, y);
  switch (kind) {
    case 'grass':
    case 'moss':
      // The lawn's patches; its blades and flowers come after (Grass.dress).
      return m.grass!.color(x, y);
    case 'cobble': {
      const c = m.courses!;
      c.at(x + (Math.floor(y / 5) % 2) * 3, y);
      const moss = n0.atRow(x) > 0.62;
      if (c.sx === 0 || c.sy === 0 || (c.sx === 1 && c.sy === 1) || (c.sx === c.w - 1 && c.sy === 1)) return moss ? 0x3e5a2c : r[0];
      let k = 2 + (c.id < 0.25 ? -0.6 : c.id > 0.75 ? 0.7 : 0) + (n1.atRow(x) - 0.5) * 0.8;
      if (c.sy === 1) k += 1;
      if (c.sy === c.h - 1 || c.sx === c.w - 1) k -= 1;
      return r[clampK(k, r.length)];
    }
    case 'flagstone': {
      const c = m.courses!;
      c.at(x + (Math.floor(y / 9) % 2) * 6, y);
      if (c.sx === 0 || c.sy === 0) return r[0];
      let k = 2 + (c.id - 0.5) * 1.6 + (n0.atRow(x) - 0.5) * 0.6;
      if (c.sy === 1 || c.sx === 1) k += 0.9;
      if (c.sy === c.h - 1 || c.sx === c.w - 1) k -= 0.9;
      // A crack across some slabs.
      if (c.id > 0.8 && Math.abs(c.sx - c.sy * (c.w / c.h) * 0.8 - 2) < 0.6) return r[1];
      if (m.a && n1.atRow(x) > 0.7 && h2(x, y, s) < 0.6) return m.a[0];
      return r[clampK(k, r.length)];
    }
    case 'dirt': {
      let k = 1.7 + n0.atRow(x) * 1.5 + (n1.atRow(x) - 0.5) * 0.5;
      const cx = Math.floor(x / 7);
      const cy = Math.floor(y / 7);
      if (cellHash(m, cx, cy, s + 2) < 0.3) {
        const px = cx * 7 + 2 + Math.floor(h2(cx, cy, s + 3) * 3);
        const py = cy * 7 + 2 + Math.floor(h2(cx, cy, s + 4) * 3);
        if (y === py && (x === px || x === px + 1)) k = 3.4;
        else if (y === py + 1 && (x === px || x === px + 1)) k = 0.6;
      }
      return r[clampK(k, r.length)];
    }
    case 'snow': {
      let k = 2.6 + n0.atRow(x) * 1.4 - (n1.atRow(x) > 0.7 ? 1 : 0);
      if (h2(x, y, s + 2) < 0.012) return 0xffffff;
      if ((x + Math.floor(m.n[2].atRow(x) * 20)) % 37 === 0 && y % 3 === 0) k -= 0.6;
      return r[clampK(k, r.length)];
    }
    case 'ice': {
      let k = 2 + n0.atRow(x) * 1.3;
      if (((x + y * 2) % 29 < 2) && n1.atRow(x) > 0.5) k = 4;
      const v = m.voronoi!;
      v.at(x, y);
      if (v.d2 - v.d1 < 0.7) k = 1;
      return r[clampK(k, r.length)];
    }
    case 'sand': {
      const n = n0.atRow(x);
      const v = Math.sin(x * 0.28 + y * 0.85 + n * 9);
      let k = 2 + (n - 0.5) * 1.2;
      if (v > 0.9) k = 3.3;
      else if (v < -0.93) k = 1.2;
      if (h2(Math.floor(x / 9), Math.floor(y / 9), s + 3) < 0.04 && h2(x, y, s) < 0.2) k = 0.5;
      return r[clampK(k, r.length)];
    }
    case 'mud': {
      const n = n0.atRow(x);
      let k = 1.3 + n * 1.6;
      if (n > 0.72) k = 0;
      else if (n > 0.69) k = 3.4;
      if (m.a && cellHash(m, Math.floor(x / 6), Math.floor(y / 6), s + 2) < 0.12 && h2(x, y, s + 3) < 0.35) return m.a[0];
      return r[clampK(k, r.length)];
    }
    case 'tilled':
      return tilled(x, y, m, 1);
    case 'basalt':
    case 'crystalStone': {
      const v = m.voronoi!;
      v.at(x, y);
      if (v.d2 - v.d1 < 1.1) {
        if (m.a && v.id < 0.18 && kind === 'basalt') return m.a[0];
        return r[0];
      }
      const k = 1.4 + v.id * 1.6 + (v.d1 < 3 ? 0.6 : 0);
      if (kind === 'crystalStone' && m.a && h2(x, y, s + 4) < 0.01) return m.a[Math.floor(h2(x, y, s + 5) * m.a.length)];
      return r[clampK(k, r.length)];
    }
  }
}

/** A furrow's tone across its 8 px: the ridge's lit slope, the shaded furrow. */
const FURROW = [3.3, 2.9, 2.5, 2.2, 1.8, 1.05, 0.45, 1.25];

/**
 * Plowed soil: a ridge every 8 px with its slope lit from the top left and the furrow between in
 * shade, clods along the ridges and, if `field` says so, rows of seedlings. `field` is the field mask
 * value (mapgen.ts): 1 rows run east-west, 2 north-south, +4 seedlings. `m` must be a 'tilled' material.
 */
function tilled(x: number, y: number, m: MatCtx, field: number): number {
  const r = m.r;
  const s = m.seed;
  const ns = (field & 3) === 2;
  const along = ns ? y : x;
  const across = ns ? x : y;
  const p = across & 7;
  matRow(m, y);
  let k = FURROW[p] + (m.n[0].atRow(x) - 0.5) * 0.8;
  const row = across >> 3;
  // Clods on the ridges: a lit lump with a shadow under it.
  const cell = Math.floor(along / 6);
  if (h2(cell, row, s + 1) < 0.45) {
    const c = cell * 6 + 1 + Math.floor(h2(cell, row, s + 2) * 4);
    const cp = 1 + Math.floor(h2(cell, row, s + 3) * 2);
    if (along === c && p === cp) k = 3.9;
    else if (along === c && p === cp + 1) k = 1.1;
  }
  if (field & 4 && m.a) {
    // Seedlings along the ridge tops: two leaves over a stem.
    const sc = Math.floor(along / 5);
    if (h2(sc, row, s + 4) < 0.8) {
      const c = sc * 5 + 1 + Math.floor(h2(sc, row, s + 5) * 3);
      if (p === 2 && (along === c - 1 || along === c + 1)) return m.a[1];
      if (p === 3 && along === c) return m.a[0];
    }
  }
  return r[clampK(k, r.length)];
}

// ------------------------------------------------------------------ the floor

export interface Terrain {
  canvas: HTMLCanvasElement;
  /** Light spots baked from the ground (lava, glowing water), in world pixels. */
  glows: Array<{ x: number; y: number; color: string; r: number }>;
  /** Liquid tiles, for the shimmer drawn each frame. */
  liquid: Array<{ x: number; y: number }>;
}

export function paintTerrain(m: FloorMap, biome: Biome): Terrain {
  const t = paintTerrainPixels(m, biome);
  const canvas = makeCanvas(t.w, t.h) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(t.w, t.h);
  img.data.set(t.px);
  ctx.putImageData(img, 0, 0);
  return { canvas, glows: t.glows, liquid: t.liquid };
}

/** Tiles of border round the tile masks (lookups a little past the floor's edge need no checks). */
const TPAD = 4;

/**
 * What a pixel is (`surf`): 0 nothing in particular, 1 the ground, 2 the path, 3 water, 4 a field, 5 a
 * wall's face or a ledge, 6 a road's worn dirt, 7 the water's edge, 8 a curb, 9 a lot, and this: the
 * ground under the trees.
 */
const SURF_WOODS = 10;

/** What's near an open tile (in it or the eight round it), so the edge math runs only there. */
const NEAR_LIQ = 1;
const NEAR_PATH = 2;
const ALL_PATH = 4;
const NEAR_FIELD = 8;
const ALL_FIELD = 16;
/** A wall or the trees just above, left or right of it. */
const NEAR_WALL = 32;
/** Any open tile in or round it (for the trees' shade). */
const NEAR_OPEN = 64;

/** The floor's ground as RGBA pixels (no canvas: tools/preview.ts paints floors in Node with it). */
export function paintTerrainPixels(m: FloorMap, biome: Biome): Omit<Terrain, 'canvas'> & { w: number; h: number; px: Uint8ClampedArray } {
  const W = m.w * TILE;
  const H = m.h * TILE;
  const px = new Uint8ClampedArray(W * H * 4);
  const seed = m.seed & 0xffff;
  const MW = m.w;
  const MH = m.h;

  // --- tile masks with a border, read without bounds checks
  const GW = MW + TPAD * 2;
  const GH = MH + TPAD * 2;
  const grid = (fn: (tx: number, ty: number) => number): Float64Array => {
    const g = new Float64Array(GW * GH);
    for (let ty = -TPAD; ty < MH + TPAD; ty++) for (let tx = -TPAD; tx < MW + TPAD; tx++) g[(ty + TPAD) * GW + tx + TPAD] = fn(tx, ty);
    return g;
  };
  const inMap = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < MW && ty < MH;
  const tileOf = (tx: number, ty: number) => (inMap(tx, ty) ? m.tiles[ty * MW + tx] : SOLID);
  const T = new Uint8Array(GW * GH);
  for (let ty = -TPAD; ty < MH + TPAD; ty++) for (let tx = -TPAD; tx < MW + TPAD; tx++) T[(ty + TPAD) * GW + tx + TPAD] = tileOf(tx, ty);
  /** The tile at (tx, ty): SOLID past the floor's edge (and past the border). */
  const tile = (tx: number, ty: number) => {
    const gx = tx + TPAD;
    const gy = ty + TPAD;
    return gx >= 0 && gy >= 0 && gx < GW && gy < GH ? T[gy * GW + gx] : SOLID;
  };
  const pathAt = (tx: number, ty: number) => (inMap(tx, ty) ? m.path[ty * MW + tx] : 0);
  const fieldAt = (tx: number, ty: number) => (!m.field || !inMap(tx, ty) ? 0 : m.field[ty * MW + tx]);
  const isCanal = (tx: number, ty: number) => (inMap(tx, ty) ? m.canal?.[ty * MW + tx] ?? 0 : 0);
  const LIQ = grid((tx, ty) => (tileOf(tx, ty) === LIQUID ? 1 : 0));
  // A town: every street paved, right up to the curbs.
  const PATH = biome.path.everywhere ? grid(() => 1) : grid(pathAt);
  const OPEN = grid((tx, ty) => (tileOf(tx, ty) === SOLID ? 0 : 1));
  const FIELD = m.field ? grid((tx, ty) => (fieldAt(tx, ty) ? 1 : 0)) : null;
  /** Smooth masks: a tile mask read between tile middles (the path blends in with ragged edges, ponds get round shores). */
  const bil = (g: Float64Array, x: number, y: number) => {
    const fx = x / TILE - 0.5;
    const fy = y / TILE - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const gx = x0 + TPAD;
    const gy = y0 + TPAD;
    let a: number;
    let b: number;
    let c: number;
    let d: number;
    if (gx >= 0 && gy >= 0 && gx + 1 < GW && gy + 1 < GH) {
      const k = gy * GW + gx;
      a = g[k];
      b = g[k + 1];
      c = g[k + GW];
      d = g[k + GW + 1];
    } else {
      // Far past the edge: what the border holds.
      const v = g[0];
      a = b = c = d = v;
    }
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  // What's near each open tile.
  const near = new Uint8Array(MW * MH);
  for (let ty = 0; ty < MH; ty++) {
    for (let tx = 0; tx < MW; tx++) {
      let f = 0;
      let allPath = true;
      let allField = !!FIELD;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const k = (ty + oy + TPAD) * GW + tx + ox + TPAD;
          if (LIQ[k]) f |= NEAR_LIQ;
          if (PATH[k]) f |= NEAR_PATH;
          else allPath = false;
          if (FIELD && FIELD[k]) f |= NEAR_FIELD;
          else allField = false;
        }
      }
      if (allPath) f |= ALL_PATH;
      if (allField) f |= ALL_FIELD;
      const k = (ty + TPAD) * GW + tx + TPAD;
      if (T[k - GW] === SOLID || T[k - 1] === SOLID || T[k + 1] === SOLID) f |= NEAR_WALL;
      let open = false;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (OPEN[k + oy * GW + ox]) open = true;
      if (open) f |= NEAR_OPEN;
      near[ty * MW + tx] = f;
    }
  }

  const lawnKind = (k: GroundKind) => k === 'grass' || k === 'moss';
  const ground = makeMat(biome.ground.kind, seed, biome.ground.ramp, biome.ground.accent, W, H, lawnKind(biome.ground.kind) ? grassLook(biome, 'ground') : undefined);
  const path = makeMat(biome.path.kind, seed + 101, biome.path.ramp, biome.path.accent, W, H, lawnKind(biome.path.kind) ? grassLook(biome, 'path') : undefined);
  const fieldMat: MatCtx | null = biome.fields && m.field ? makeMat('tilled', seed + 202, biome.fields.ramp, biome.fields.accent, W, H) : null;
  // A field pixel just past its tile's edge takes the furrows of the field it belongs to.
  const fieldOf = (tx: number, ty: number) => fieldAt(tx, ty) || fieldAt(tx, ty - 1) || fieldAt(tx, ty + 1) || fieldAt(tx - 1, ty) || fieldAt(tx + 1, ty) || 1;

  const face = rampI(biome.solid.face);
  const top = rampI(biome.solid.top);
  const topSeam = hexI(shade(biome.solid.top[0], -0.3));
  const liquid = biome.liquid;
  const liqR = liquid ? rampI(liquid.ramp) : null;
  const glows: Terrain['glows'] = [];
  const liquidTiles: Terrain['liquid'] = [];
  const N = (size: number, s: number, w = W, h = H) => new VNoise(size, s, w, h);
  const nLiq = liquid ? N(7, seed + 70) : null;
  const nLava = liquid?.kind === 'lava' ? [N(9, seed + 71), N(4, seed + 72)] : null;
  const nWater = liquid && liquid.kind !== 'lava' && liquid.kind !== 'chasm' ? N(14, seed + 73) : null;
  const nPath = N(6, seed + 80);
  const nField = FIELD ? N(5, seed + 90) : null;
  const nOpen = biome.solid.kind === 'trees' ? N(6, seed + 51) : null;
  const nAO = biome.solid.curb ? null : N(4, seed + 52);
  const nGrime = biome.solid.kind === 'wall' ? N(6, seed + 61) : null;
  const nCliff = biome.solid.kind !== 'wall' && biome.solid.kind !== 'trees' ? N(5, seed + 62, W * 0.5 + 2, H * 2.2 + 3) : null;
  const nTop = biome.solid.kind !== 'trees' ? N(8, seed + 63) : null;
  const nCanal = m.canal ? N(12, seed + 150) : null;
  const ledgeN = biome.solid.ledge ? [N(7, seed + 92), N(6, seed + 97)] : null;
  const ledgeR = biome.solid.ledge ? rampI(biome.solid.ledge) : null;
  const groundR = rampI(biome.ground.ramp);

  // How much each pixel was darkened (0..255), so a lawn's blades and flowers sink into the same shade.
  const shadeOf = new Uint8Array(W * H);
  // (A pixel nothing darkens is one 32-bit store: alpha, blue, green, red from the top byte down.)
  const px32 = new Uint32Array(px.buffer, px.byteOffset, W * H);
  const set = (i: number, c: number, dark = 0) => {
    if (dark === 0) {
      px32[i >> 2] = (0xff000000 | ((c & 255) << 16) | (c & 0xff00) | (c >>> 16)) >>> 0;
      shadeOf[i >> 2] = 0;
      return;
    }
    const f = 1 - dark;
    px[i] = (c >> 16) * f;
    px[i + 1] = ((c >> 8) & 255) * f;
    px[i + 2] = (c & 255) * f;
    px[i + 3] = 255;
    shadeOf[i >> 2] = dark * 255 + 0.5;
  };
  /** Open street round a lot's tile (no canal): bit 1 S, 2 N, 4 W, 8 E, 16 SE, 32 SW, 64 NE, 128 NW. */
  const openNb = new Uint8Array(MW * MH);
  {
    const open = (tx: number, ty: number) => tile(tx, ty) !== SOLID && !m.canal?.[ty * MW + tx];
    for (let ty = 0; ty < MH; ty++) {
      for (let tx = 0; tx < MW; tx++) {
        openNb[ty * MW + tx] =
          (open(tx, ty + 1) ? 1 : 0) | (open(tx, ty - 1) ? 2 : 0) | (open(tx - 1, ty) ? 4 : 0) | (open(tx + 1, ty) ? 8 : 0) |
          (open(tx + 1, ty + 1) ? 16 : 0) | (open(tx - 1, ty + 1) ? 32 : 0) | (open(tx + 1, ty - 1) ? 64 : 0) | (open(tx - 1, ty - 1) ? 128 : 0);
      }
    }
  }
  const curbR = biome.solid.curb ? rampI(biome.solid.curb) : null;
  /** The stone curb round a lot, where it meets the street: a lit top, a face toward us on the south (-1: none here). */
  const curbAt = (tx: number, ty: number, lx: number, ly: number, C: Int32Array): number => {
    if (lx >= 3 && lx <= 12 && ly >= 3 && ly <= 10) return -1;
    const o = openNb[ty * MW + tx];
    if (o & 1 && ly >= 11) return ly === 11 ? C[2] : ly === 12 ? C[3] : ly === 15 ? C[0] : C[1];
    if (o & 2 && ly <= 2) return ly === 0 ? C[2] : ly === 1 ? C[3] : C[1];
    if (o & 4 && lx <= 2) return lx === 0 ? C[2] : lx === 1 ? C[3] : C[1];
    if (o & 8 && lx >= 13) return lx === 15 ? C[1] : lx === 14 ? C[2] : C[3];
    // Corners where the street turns.
    if (o & 16 && lx >= 13 && ly >= 11) return ly === 15 ? C[0] : ly <= 12 ? C[2] : C[1];
    if (o & 32 && lx <= 2 && ly >= 11) return ly === 15 ? C[0] : ly <= 12 ? C[2] : C[1];
    if (o & 64 && lx >= 13 && ly <= 2) return C[2];
    if (o & 128 && lx <= 2 && ly <= 2) return C[2];
    return -1;
  };
  const water = rampI(liquid?.ramp ?? ['#1e4a9a', '#2a62c0', '#3a7ad8', '#5a9ae8', '#8ac0f4']);
  const bank = rampI(biome.solid.curb ?? biome.path.ramp);
  /** A canal: saturated water with lighter streaks between stone banks (the north bank's face shows). */
  const canalAt = (x: number, y: number, lx: number, ly: number, tx: number, ty: number): number => {
    if (!isCanal(tx, ty - 1) && ly < 5) return ly === 0 ? bank[2] : ly === 1 ? bank[3] : ly === 4 ? bank[0] : bank[1];
    if (!isCanal(tx, ty + 1) && ly > 13) return ly === 14 ? bank[2] : bank[3];
    if (!isCanal(tx - 1, ty) && lx < 2) return lx === 0 ? bank[2] : bank[3];
    if (!isCanal(tx + 1, ty) && lx > 13) return lx === 15 ? bank[1] : bank[2];
    let k = 2 + (nCanal!.at(x, y) - 0.5) * 0.8;
    // Streaks along the flow, a pixel or two long.
    if ((x * 7 + Math.floor(y / 2) * 13) % 23 === 0) k = 3.6;
    else if ((x * 5 + y * 3) % 31 === 0) k = 3;
    if (!isCanal(tx, ty - 1) && ly < 7) k = Math.min(k, 1);
    return water[clampK(k, water.length)];
  };
  // What each pixel is (decals only go where they belong).
  const surf = new Uint8Array(W * H);
  // Cobbled roads: whole stones, so the road's edge wears away stone by stone into packed dirt,
  // then grass; grass grows in the mortar and some stones are greyer than others.
  const cob = biome.path.kind === 'cobble' ? new Cobbles(seed + 140, 5, W, H) : null;
  // A cobbled road keeps a steadier edge than a dirt track (its stones wear it ragged instead).
  const ragged = cob ? 0.26 : 0.45;
  const pathMask = (x: number, y: number) => bil(PATH, x, y) + (nPath.at(x, y) - 0.5) * ragged;
  const stoneMask = new Map<number, number>();
  const warmS = biome.path.ramp;
  const warm = rampI(warmS);
  const grey = rampI(warmS.map((c) => mixHex(c, '#a6a6aa', 0.38)));
  // The joints a soft shade under the darkest stone, not a black line.
  const mortar = hexI(shade(warmS[0], -0.12));
  const dirt = rampI(biome.path.dirt ?? warmS.map((c, k) => mixHex(c, biome.ground.ramp[Math.min(k, biome.ground.ramp.length - 1)], 0.35)));
  const nMortar = cob ? N(14, seed + 144) : null;
  const nDirt = cob ? N(9, seed + 146) : null;
  // What each stone is, worked out the first time a pixel of it is painted: 1 laid (2 more if grey,
  // 4 more if moss grows in its joints), 0 gone; and its tone.
  const stoneKind = cob ? new Uint8Array(cob.cells) : null;
  const stoneId = cob ? new Float64Array(cob.cells) : null;
  const stoneDone = cob ? new Uint8Array(cob.cells) : null;
  let onDirt = false;
  /** The road at a pixel: a stone or mortar color, packed dirt (sets `onDirt`), or -1 (no road here). */
  const cobbleAt = (x: number, y: number, pm: number): number => {
    onDirt = false;
    const st = cob!;
    st.at(x, y);
    let kind: number;
    let id: number;
    if (st.k >= 0 && stoneDone![st.k]) {
      kind = stoneKind![st.k];
      id = stoneId![st.k];
    } else {
      const key = st.gx * 8192 + st.gy;
      let mid = stoneMask.get(key);
      if (mid === undefined) {
        mid = pathMask(st.px, st.py);
        stoneMask.set(key, mid);
      }
      id = h2(st.gx, st.gy, seed + 141);
      const cut = 0.47 + (h2(st.gx, st.gy, seed + 142) - 0.5) * 0.16;
      // A stone missing here and there inside the road; a grassy hollow where the noise says so.
      const lost = !biome.path.everywhere && (id < 0.02 || vnoise(st.px, st.py, 26, seed + 143) > 0.8);
      kind = mid > cut && !lost ? 1 | (h2(st.gx, st.gy, seed + 145) < 0.35 ? 2 : 0) | (h2(st.gx, st.gy, seed + 148) < 0.5 ? 4 : 0) : 0;
      if (st.k >= 0) {
        stoneKind![st.k] = kind;
        stoneId![st.k] = id;
        stoneDone![st.k] = 1;
      }
    }
    if (kind & 1) {
      const gap = st.d2 - st.d1;
      const dx = x + 0.5 - st.px;
      const dy = y + 0.5 - st.py;
      // A soft mortar line round every stone, moss in a few of the joints.
      if (gap < 0.95 || st.d1 > 3.3) return nMortar!.at(x, y) > 0.7 && kind & 4 ? ((x + y) % 2 ? 0x5c8a34 : 0x6e9e3e) : mortar;
      const ramp = kind & 2 ? grey : warm;
      let k = 2.1 + (id - 0.5) * 1.6;
      const side = dx + dy * 1.1;
      // Each stone a flat tone, its top-left rim lit, its bottom-right rim a little darker.
      if (gap < 1.8) k += side < 0 ? 0.8 : -0.45;
      return ramp[clampK(k, ramp.length)];
    }
    if (pm > 0.36) {
      // Packed dirt where the stones are gone, with the odd pebble.
      const k = 1.6 + nDirt!.at(x, y) * 1.2 + (h2(x, y, seed + 147) < 0.04 ? 1.4 : 0);
      onDirt = true;
      return dirt[clampK(k, dirt.length)];
    }
    return -1;
  };
  /** Is the floor at (x, y) the path material (not for cobbles)? The noise only where it can matter. */
  const onPathAt = (x: number, y: number): boolean => {
    const b = bil(PATH, x, y);
    if (b < 0.27) return false;
    if (b > 0.73) return true;
    return b + (nPath.at(x, y) - 0.5) * 0.45 > 0.5;
  };
  /** The field mask at (x, y) above one half? */
  const fieldIn = (x: number, y: number): boolean => {
    const b = bil(FIELD!, x, y);
    if (b < 0.38) return false;
    if (b > 0.62) return true;
    return b + (nField!.at(x, y) - 0.5) * 0.22 > 0.5;
  };
  /** Water (or lava) at (x, y), by the round-shored mask? */
  const liquidIn = (x: number, y: number): boolean => {
    const b = bil(LIQ, x, y);
    if (b < 0.34) return false;
    return b + (nLiq!.at(x, y) - 0.5) * 0.3 > 0.5;
  };
  const trees = biome.solid.kind === 'trees';
  const ledge = biome.solid.ledge;
  const bankable = !!liquid && liquid.kind !== 'lava';

  for (let y = 0; y < H; y++) {
    const ty = Math.floor(y / TILE);
    const ly = y - ty * TILE;
    const rowT = (ty + TPAD) * GW + TPAD;
    for (let tx = 0; tx < MW; tx++) {
      // What the tile is and what's round it, once for its 16 pixels in this row.
      const t = T[rowT + tx];
      const faceTile = T[rowT + GW + tx] !== SOLID;
      const canal = m.canal ? m.canal[ty * MW + tx] : 0;
      const fl = near[ty * MW + tx];
      for (let lx = 0; lx < TILE; lx++) {
      const x = tx * TILE + lx;
      const i = (y * W + x) * 4;
      if (t === SOLID) {
        if (canal) {
          set(i, canalAt(x, y, lx, ly, tx, ty));
          surf[y * W + x] = 3;
          continue;
        }
        if (trees && curbR) {
          // A lot: bright ground for the trees, houses and gardens on it, a stone curb round it.
          const c = curbAt(tx, ty, lx, ly, curbR);
          if (c >= 0) {
            set(i, c);
            surf[y * W + x] = 8;
          } else {
            set(i, paint(ground.kind, x, y, ground), 0.03);
            surf[y * W + x] = 9;
          }
          continue;
        }
        if (trees && ledge && faceTile) {
          // A ledge: the wooded ground stands a step up, its earthy face toward us.
          set(i, ledgeFace(x, y, ly, ty, seed, ledgeR!, groundR, ledgeN!));
          surf[y * W + x] = 5;
          continue;
        }
        if (trees) {
          // Under the trees: the same ground, sinking into deep shade away from the open floor (no hard
          // tile edges where a gap in the trees shows through).
          // (Deep in the woods the mask is nothing but zeros: the shade is 3/8, the noise can't move it.)
          const b = fl & NEAR_OPEN ? bil(OPEN, x, y) : 0;
          let dark = 0.375;
          if (b !== 0) {
            const open = b + (nOpen!.at(x, y) - 0.5) * 0.35;
            const shadeAmt = Math.max(0.08, Math.min(0.42, 0.42 - open * 0.4));
            dark = Math.round(shadeAmt * 8) / 8;
          }
          set(i, paint(ground.kind, x, y, ground), dark);
          surf[y * W + x] = SURF_WOODS;
          continue;
        }
        if (faceTile) {
          surf[y * W + x] = 5;
          // The wall's front face (3/4 view), bricks for crypts, rock strata for cliffs.
          const fy = ly;
          if (biome.solid.kind === 'wall') {
            const bw = 8;
            const bh = 4;
            const row = Math.floor(fy / bh);
            const bx = (x + (row % 2) * 4) % bw;
            const by = fy % bh;
            const id = h2(Math.floor((x + (row % 2) * 4) / bw), row + ty * 4, seed + 60);
            let k = 2 + (id - 0.5) * 1.4;
            if (by === 0 || bx === 0) k = 0;
            else if (by === 1) k += 0.8;
            else if (bx === bw - 1) k -= 0.6;
            if (k > 0) k += (TILE / 2 - fy) / TILE;
            // The wall's lit top cap.
            if (fy <= 3) k = fy === 0 ? 4 : fy === 3 ? 1 : 3;
            if (fy >= TILE - 2) k = Math.min(k, 0.6);
            // Grime and moss toward the bottom.
            if (fy > 10 && nGrime!.at(x, y) > 0.62) k = Math.min(k, 1);
            set(i, face[clampK(k, face.length)]);
          } else {
            const n = nCliff!.at(x * 0.5, y * 2.2);
            let k = 1 + n * 2.4 + (fy < 4 ? 1 : 0) - (fy > 12 ? 0.8 : 0);
            if (Math.abs(((x * 0.5 + y * 2) % 7) - 3.5) < 0.3 && n > 0.5) k -= 1;
            if (fy <= 3) k = fy === 0 ? 4 : fy === 3 ? 1 : 3;
            set(i, face[clampK(k, face.length)]);
          }
          continue;
        }
        // The top of a wall: dark slabs (readable, not a void), a lit cap where it meets the floor.
        const n = nTop!.at(x, y);
        let col = top[n > 0.6 ? 1 : 0];
        if ((lx === 0 || ly === 0) && (tx + ty) % 2 === 0) col = topSeam;
        else if (lx === 1 && ly > 0 && h2(tx, ty, seed + 64) < 0.5) col = top[1];
        const capAbove = T[rowT - GW + tx] !== SOLID ? ly : 99;
        const capSide = Math.min(T[rowT + tx - 1] !== SOLID ? lx : 99, T[rowT + tx + 1] !== SOLID ? TILE - 1 - lx : 99);
        const cap = Math.min(capAbove, capSide);
        if (cap <= 2) col = cap === 0 ? face[4 % face.length] : cap === 1 ? face[3] : face[1];
        set(i, col);
        continue;
      }
      // Liquids, with round shores.
      if (liqR && t !== BLOCKED && fl & NEAR_LIQ) {
        const bl = bil(LIQ, x, y);
        const lq = bl < 0.34 ? 0 : bl + (nLiq!.at(x, y) - 0.5) * 0.3;
        if (lq > 0.5) {
          const edge = lq < 0.62;
          const aboveDry = bil(LIQ, x, y - 3) < 0.5;
          let k: number;
          if (liquid!.kind === 'lava') {
            const n = nLava![0].at(x, y);
            k = 2 + (n - 0.5) * 3;
            if (nLava![1].at(x, y) > 0.75) k = 4;
            if (edge) k = 3;
          } else if (liquid!.kind === 'chasm') {
            k = aboveDry ? 3 - (y % 3) * 0.5 : 0;
          } else {
            const n = nWater!.at(x, y);
            k = 1 + n * 1.2 + (lq < 0.75 ? 0.8 : 0);
            if (Math.sin(x * 0.5 + Math.floor(y / 3) * 1.7) > 0.93 && y % 3 === 0) k = 3;
            if (edge) k = 4;
            if (aboveDry && !edge) k = 0.2;
            if (liquid!.kind === 'swampWater' && h2(Math.floor(x / 5), Math.floor(y / 5), seed + 74) < 0.08) {
              set(i, 0x4a7a2c);
              continue;
            }
          }
          set(i, liqR[clampK(k, liqR.length)]);
          surf[y * W + x] = edge ? 7 : 3;
          if (lx === 8 && ly === 8 && liquid!.glow) glows.push({ x, y, color: liquid!.glow, r: 34 });
          continue;
        }
      }
      // A bridge's deck over a canal: planks across, darker gaps, the edges in shade.
      if (canal) {
        const plank = ly % 3;
        const edge = lx < 2 || lx > 13;
        set(i, edge ? 0x4a2e1c : plank === 2 ? 0x5a3a22 : plank === 0 ? 0xa8784a : (Math.floor(x / 5) + ty) % 2 ? 0x8a5e38 : 0x966a40);
        surf[y * W + x] = 0;
        continue;
      }
      // Ground or path, blending with a ragged edge.
      let road = -1;
      let onPath: boolean;
      if (cob) {
        // (Only the road's edges need the noise: past half, it's road whatever the noise says.)
        if (fl & ALL_PATH) road = cobbleAt(x, y, 1);
        else if (fl & NEAR_PATH) {
          const b = bil(PATH, x, y);
          if (b >= 0.5) road = cobbleAt(x, y, 1);
          else if (b >= 0.07) {
            const pm = b + (nPath.at(x, y) - 0.5) * ragged;
            if (pm > 0.2) road = cobbleAt(x, y, pm);
          }
        }
        onPath = road >= 0;
      } else onPath = fl & ALL_PATH ? true : fl & NEAR_PATH ? onPathAt(x, y) : false;
      const onField = !onPath && fieldMat !== null && (fl & ALL_FIELD ? true : fl & NEAR_FIELD ? fieldIn(x, y) : false);
      let col = road >= 0 ? road : onPath ? paint(path.kind, x, y, path) : onField ? tilled(x, y, fieldMat!, fieldOf(tx, ty)) : paint(ground.kind, x, y, ground);
      surf[y * W + x] = onField ? 4 : !onPath ? 1 : cob && onDirt ? 6 : 2;
      let dark = 0;
      // The ground's edge throws a little shadow onto the path below it.
      if (onPath && !cob && !(fl & ALL_PATH) && !onPathAt(x, y - 2)) dark += 0.28;
      // A field lies a step below the grass: the grass edge shades its top and left rows.
      if (onField && !(fl & ALL_FIELD)) {
        if (!fieldIn(x, y - 2)) dark += 0.3;
        else if (!fieldIn(x - 2, y)) dark += 0.18;
      }
      // A bank under the edge of water: the ground drops to the water line.
      if (bankable && fl & NEAR_LIQ && liquidIn(x, y + 2)) {
        col = paint(ground.kind, x, y, ground);
        dark += 0.45;
      }
      // Ambient occlusion where the floor meets walls (strongest under a wall's face).
      if (fl & NEAR_WALL) {
        const sAbove = T[rowT - GW + tx] === SOLID ? ly : 99;
        const sLeft = T[rowT + tx - 1] === SOLID ? lx : 99;
        const sRight = T[rowT + tx + 1] === SOLID ? TILE - 1 - lx : 99;
        if (curbR) {
          // The curb's crisp shadow on the street below and beside it.
          if (sAbove < 2) dark += sAbove === 0 ? 0.38 : 0.16;
          if (sLeft < 1) dark += 0.2;
        } else {
          const nearest = Math.min(sAbove * 0.8, sLeft, sRight);
          if (nearest < 7.5) {
            const occ = nearest + (nAO!.at(x, y) - 0.5) * 3;
            if (occ < 6) dark += Math.round((6 - occ) * 1.5) / 1.5 * (trees ? 0.06 : 0.1);
          }
        }
      }
      set(i, col, Math.min(0.7, dark));
      }
    }
  }
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) if (m.tiles[ty * MW + tx] === LIQUID) liquidTiles.push({ x: tx * TILE + 8, y: ty * TILE + 8 });
  const stone = stoneTones(biome);

  // --- the lawns' blades, tufts, clover and flowers, and their edges breaking over paths and walls
  if (ground.grass || path.grass) {
    // Tiles at the edge of the woods or by a wall (the lawn grows thicker there).
    const edgeT = new Uint8Array(MW * MH);
    for (let ty = 0; ty < MH; ty++) {
      for (let tx = 0; tx < MW; tx++) {
        const solid = tile(tx, ty) === SOLID;
        let mixed = false;
        for (let oy = -1; oy <= 1 && !mixed; oy++) for (let ox = -1; ox <= 1 && !mixed; ox++) if ((tile(tx + ox, ty + oy) === SOLID) !== solid) mixed = true;
        edgeT[ty * MW + tx] = mixed ? 1 : 0;
      }
    }
    const edge = (x: number, y: number) => {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      return inMap(tx, ty) && edgeT[ty * MW + tx] === 1;
    };
    // Tiles where the ground changes kind within a tile of them (solid or open, path, field, water).
    const mixed = new Uint8Array(MW * MH);
    const kindAt = (k: number) => (T[k] === SOLID ? 1 : 0) | (PATH[k] ? 2 : 0) | (FIELD && FIELD[k] ? 4 : 0) | (LIQ[k] ? 8 : 0);
    for (let ty = 0; ty < MH; ty++) {
      for (let tx = 0; tx < MW; tx++) {
        const k0 = (ty + TPAD) * GW + tx + TPAD;
        const own = kindAt(k0);
        let diff = !!m.canal;
        for (let oy = -1; oy <= 1 && !diff; oy++) for (let ox = -1; ox <= 1 && !diff; ox++) if (kindAt(k0 + oy * GW + ox) !== own) diff = true;
        mixed[ty * MW + tx] = diff ? 1 : 0;
      }
    }
    const codes = (list: number[]) => {
      const a = new Uint8Array(256);
      for (const s of list) a[s] = 1;
      return a;
    };
    for (const [mat, mine, spill] of [
      [ground, [1, 9, SURF_WOODS], [2, 4, 5, 6, 8]],
      [path, [2], [1, 4, 5, 6]],
    ] as const) {
      if (!mat.grass) continue;
      mat.grass.dress({ W, H, px, surf, shade: shadeOf, mine: codes([...mine]), spill: codes([...spill]), edge, mixed, tile: TILE, tilesW: MW, stone });
    }
  }

  // --- the little things on the ground
  const table = DECALS[biome.id];
  let target = 1;
  let glowsLeft = 70;
  const okAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const s = surf[y * W + x];
    // Ground decals spill onto the worn dirt at a road's edge, water ones stay off the shore.
    return s === target || (target === 1 && s === 6) || (target === 6 && s === 1);
  };
  const dc: DecalCtx = {
    put: (x, y, hex) => {
      x = Math.round(x);
      y = Math.round(y);
      if (okAt(x, y)) set((y * W + x) * 4, hexI(hex));
    },
    dark: (x, y, f) => {
      x = Math.round(x);
      y = Math.round(y);
      if (!okAt(x, y)) return;
      const i = (y * W + x) * 4;
      px[i] *= 1 - f;
      px[i + 1] *= 1 - f;
      px[i + 2] *= 1 - f;
    },
    ground: biome.ground.ramp,
    accent: biome.ground.accent ?? ['#e8c86a', '#d76b5a', '#f0eee0'],
    stone,
    glow: (x, y, color, r) => {
      if (glowsLeft-- > 0) glows.push({ x: Math.round(x), y: Math.round(y), color, r });
    },
  };
  const solidNear = (tx: number, ty: number) => {
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (tile(tx + ox, ty + oy) === SOLID) return [ox, oy] as const;
    return null;
  };
  for (let ty = 0; ty < MH; ty++) {
    for (let tx = 0; tx < MW; tx++) {
      const t = tile(tx, ty);
      if (t === SOLID || fieldAt(tx, ty)) continue;
      const wet = t === LIQUID;
      if (wet && (tile(tx - 1, ty) !== LIQUID || tile(tx + 1, ty) !== LIQUID || tile(tx, ty - 1) !== LIQUID || tile(tx, ty + 1) !== LIQUID)) continue;
      const nearSolid = wet ? null : solidNear(tx, ty);
      const cat = wet ? 'water' : nearSolid ? 'edge' : pathAt(tx, ty) ? 'path' : 'ground';
      // Meadows: patches of the open ground where flowers gather (a lawn grows its own).
      const meadow = cat === 'ground' && !ground.grass && vnoise(tx * TILE, ty * TILE, 90, seed + 610) > 0.62;
      const list: Array<[DecalKind, number]> = meadow ? [['flowers', 5], ['daisies', 5], ['tuft', 2]] : table[cat];
      if (!list.length || h2(tx, ty, seed + 600) * 100 >= table.density[cat] * (meadow ? 1.8 : 1)) continue;
      let x = tx * TILE + 3 + Math.floor(h2(tx, ty, seed + 601) * 10);
      let y = ty * TILE + 4 + Math.floor(h2(tx, ty, seed + 602) * 9);
      // Edge things hug the wall or the trees.
      if (nearSolid) {
        if (nearSolid[1] < 0) y = ty * TILE + 3;
        if (nearSolid[0] < 0) x = tx * TILE + 3;
        else if (nearSolid[0] > 0) x = tx * TILE + 12;
      }
      const s0 = surf[y * W + x];
      target = s0 === 7 ? 3 : s0;
      if (target === 0 || target === 4 || target === 5) continue;
      drawDecal(pickDecal(list, h2(tx, ty, seed + 603)), dc, x, y, Math.floor(h2(tx, ty, seed + 604) * 1e9));
    }
  }
  // Flowers, pots and tufts along house fronts and other walls a prop says to dress.
  for (const p of m.props) {
    for (const d of frontDecor(p)) {
      target = 1;
      drawDecal(d.kind, dc, d.x, d.y, d.seed);
    }
  }

  // --- waterfalls: a stream on the ledge's top, the water over its face, foam where it lands
  for (const f of m.waterfalls ?? []) {
    const lr = rampI(liquid?.ramp ?? ['#1b3d4f', '#245a6b', '#2f7c86', '#55a7a6', '#9fd8cc']);
    for (let y = f.y - 14; y < f.y + f.h + 3; y++) {
      for (let x = f.x; x < f.x + f.w; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const u = (x - f.x) / Math.max(1, f.w - 1);
        let col: number;
        if (y < f.y) col = y === f.y - 14 || u < 0.12 || u > 0.88 ? lr[0] : (x + y) % 5 === 0 ? lr[3] : lr[1];
        else if (y < f.y + f.h) col = (x * 3 + Math.floor(y / 3)) % 4 === 0 ? lr[4] : u < 0.2 || u > 0.8 ? lr[2] : lr[3];
        else col = (x + y) % 2 ? 0xe8f4f8 : lr[4];
        set((y * W + x) * 4, col);
      }
    }
  }

  // --- shadows thrown toward the lower right by everything standing
  const sh = castShadows(m, biome, W, H);
  for (let k = 0; k < sh.length; k++) {
    const v = sh[k];
    if (!v) continue;
    const S = v === 2 ? SHADOW_CORE : SHADOW_EDGE;
    const i = k * 4;
    px[i] *= S[0];
    px[i + 1] *= S[1];
    px[i + 2] *= S[2];
  }
  return { w: W, h: H, px, glows, liquid: liquidTiles };
}

/**
 * A ledge's face (16 px, the tile above the floor): a lip of grass hanging over the top edge, then
 * earth and rock in layers lit from above, roots dangling from the lip, moss in the cracks, and a dark
 * foot where it meets the floor. `n`: the face's two noise fields (sizes 7 and 6).
 */
function ledgeFace(x: number, y: number, ly: number, ty: number, seed: number, L: Int32Array, g: Int32Array, n: VNoise[]): number {
  const lip = 2 + (h2(x, ty, seed + 90) < 0.35 ? 1 : 0) + (h2(Math.floor(x / 3), ty, seed + 91) < 0.22 ? 2 : 0);
  if (ly < lip) return ly === 0 ? g[4] : ly === lip - 1 ? g[1] : g[3];
  // Roots hanging from the lip in some columns.
  const rootLen = h2(Math.floor(x / 2), ty, seed + 94) < 0.18 ? 4 + Math.floor(h2(x, ty, seed + 95) * 7) : 0;
  if (rootLen && ly < lip + rootLen && x % 2 === 0) return ly === lip + rootLen - 1 ? 0x3a2a1c : 0x5a4430;
  const wob = Math.floor(n[0].at(x, y) * 3);
  const band = Math.floor((ly + wob) / 4);
  let k = 3.2 - ((ly - lip) / (16 - lip)) * 2.4 + (h2(Math.floor((x + band * 3) / 5), band + ty * 5, seed + 93) - 0.5) * 0.9;
  if ((ly + wob) % 4 === 0) k -= 1.1;
  if (h2(Math.floor(x / 4), ty * 7 + band, seed + 96) < 0.12 && x % 4 === 1) k = 0.3;
  if (ly >= 15) k = Math.min(k, 0.4);
  if (n[1].at(x, y) > 0.7 && ly < 13) return (x + ly) % 3 ? 0x3e6a28 : 0x5a8c34;
  return L[clampK(k, L.length)];
}

/** Cast shadows: darker and cooler (a core, and a softer edge round it). */
const SHADOW_CORE = [0.58, 0.62, 0.76] as const;
const SHADOW_EDGE = [0.78, 0.8, 0.88] as const;

function pickDecal(list: Array<[DecalKind, number]>, u: number): DecalKind {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = u * total;
  for (const [k, w] of list) {
    r -= w;
    if (r < 0) return k;
  }
  return list[list.length - 1][0];
}

/** Five stone tones for pebbles and rubble, from the biome's walls or its path. */
function stoneTones(biome: Biome): string[] {
  const f = biome.solid.face;
  if (f.length >= 5) return [f[0], f[1], f[2], f[3], f[4]];
  const mid = biome.path.kind === 'cobble' || biome.path.kind === 'flagstone' ? biome.path.ramp[2] : mixHex(f[Math.min(f.length - 1, 2)], '#8a8a90', 0.45);
  return [shade(mid, -0.55), shade(mid, -0.3), mid, shade(mid, 0.22), shade(mid, 0.42)];
}

export { FLOOR };
