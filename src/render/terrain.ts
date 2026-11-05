/**
 * Paints a floor's ground once, when the floor is built: the biome's ground and path materials
 * (grass with tufts, rounded cobbles whose edges wear away into dirt, flagstones, snow, sand...) with
 * organic edges between them, the farm's tilled fields (plowed soil in furrows), pools of water or
 * lava with banks and foam, walls and cliffs drawn with their front faces (the 3/4 view), ambient
 * occlusion where floor meets wall, then the little things on the ground (decals.ts: flowers,
 * pebbles, leaves, roots, lily pads...) and the shadows everything standing casts toward the lower
 * right (castShadows.ts). Trees, props and everything that moves are drawn on top each frame
 * (renderer.ts).
 */
import type { Biome, GroundKind, Ramp } from '../world/biomes';
import { BLOCKED, FLOOR, LIQUID, SOLID, TILE, type FloorMap } from '../world/mapgen';
import { rgb } from './pixel/buf';
import { makeCanvas, mixHex, shade } from './art/draw';
import { DECALS, drawDecal, type DecalCtx, type DecalKind } from './art/decals';
import { castShadows } from './castShadows';
import { frontDecor } from './art/village';

// ------------------------------------------------------------------ noise

function h2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in [0, 1) at the given cell size. */
function vnoise(x: number, y: number, size: number, s: number): number {
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

/** Jittered-grid Voronoi: distance to nearest and second-nearest point, and the nearest cell's hash. */
function voronoi(x: number, y: number, size: number, s: number): [number, number, number] {
  const cx = Math.floor(x / size);
  const cy = Math.floor(y / size);
  let d1 = 1e9;
  let d2 = 1e9;
  let id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const gx = cx + ox;
    const gy = cy + oy;
    const px = (gx + 0.15 + h2(gx, gy, s) * 0.7) * size;
    const py = (gy + 0.15 + h2(gx, gy, s + 1) * 0.7) * size;
    const d = Math.hypot(x - px, y - py);
    if (d < d1) {
      d2 = d1;
      d1 = d;
      id = h2(gx, gy, s + 2);
    } else if (d < d2) d2 = d;
  }
  return [d1, d2, id];
}

// ------------------------------------------------------------------ materials

const clampK = (k: number, n: number) => Math.max(0, Math.min(n - 1, Math.round(k)));

/** Brick-like rows of stones: which stone a pixel is in and where in it. */
class Courses {
  private rows = new Map<number, number[]>();
  constructor(private seed: number, private rowH: number, private minW: number, private maxW: number) {}
  at(x: number, y: number): { sx: number; sy: number; w: number; h: number; id: number } {
    const row = Math.floor(y / this.rowH);
    let edges = this.rows.get(row);
    if (!edges) {
      edges = [];
      let p = -Math.floor(h2(row, 0, this.seed) * this.maxW);
      while (p < 4000) {
        edges.push(p);
        p += this.minW + Math.floor(h2(row, edges.length, this.seed + 7) * (this.maxW - this.minW + 1));
      }
      this.rows.set(row, edges);
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
    const w = (edges[lo + 1] ?? start + this.maxW) - start;
    return { sx: x - start, sy: y - row * this.rowH, w, h: this.rowH, id: h2(row, lo, this.seed + 3) };
  }
}

/**
 * Rounded cobbles: stones on a jittered grid (`size` apart), each pixel belonging to the stone whose
 * middle is nearest. Gives the stone, its middle and how far the pixel is from it and from the next
 * stone (close to both: the mortar between them).
 */
class Cobbles {
  constructor(private seed: number, private size: number) {}
  at(x: number, y: number): { gx: number; gy: number; px: number; py: number; d1: number; d2: number } {
    const size = this.size;
    const cx = Math.floor(x / size);
    const cy = Math.floor(y / size);
    let d1 = 1e9;
    let d2 = 1e9;
    let bx = 0;
    let by = 0;
    let bpx = 0;
    let bpy = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox;
      const gy = cy + oy;
      // Rows offset by half a stone, like laid cobbles.
      const px = (gx + 0.2 + h2(gx, gy, this.seed) * 0.6 + (gy & 1) * 0.5) * size;
      const py = (gy + 0.25 + h2(gx, gy, this.seed + 1) * 0.5) * size;
      const d = (x + 0.5 - px) ** 2 + ((y + 0.5 - py) * 1.15) ** 2;
      if (d < d1) {
        d2 = d1;
        d1 = d;
        bx = gx;
        by = gy;
        bpx = px;
        bpy = py;
      } else if (d < d2) d2 = d;
    }
    return { gx: bx, gy: by, px: bpx, py: bpy, d1: Math.sqrt(d1), d2: Math.sqrt(d2) };
  }
}

interface MatCtx {
  seed: number;
  ramp: Ramp;
  accent?: Ramp;
  courses?: Courses;
}

/** A material's color at a pixel. */
function paint(kind: GroundKind, x: number, y: number, m: MatCtx): string {
  const r = m.ramp;
  const s = m.seed;
  switch (kind) {
    case 'grass':
    case 'moss': {
      // Two or three close greens in broad soft patches, a sparse small tuft, the odd flower dot.
      const n = vnoise(x, y, 34, s) + (vnoise(x, y, 11, s + 1) - 0.5) * 0.18;
      let k = n < 0.4 ? 1.7 : n < 0.66 ? 2.35 : 2.95;
      const cx = Math.floor(x / 7);
      const cy = Math.floor(y / 6);
      if (h2(cx, cy, s + 2) < 0.3) {
        const tx = cx * 7 + 2 + Math.floor(h2(cx, cy, s + 3) * 3);
        const ty = cy * 6 + 2 + Math.floor(h2(cx, cy, s + 4) * 2);
        if (y === ty && (x === tx || x === tx + 2)) k += 0.9;
        else if (y === ty + 1 && x >= tx && x <= tx + 2) k -= 0.55;
      }
      if (m.accent) {
        const fx = Math.floor(x / 9);
        const fy = Math.floor(y / 9);
        if (h2(fx, fy, s + 5) < 0.16) {
          const px = fx * 9 + 2 + Math.floor(h2(fx, fy, s + 6) * 5);
          const py = fy * 9 + 2 + Math.floor(h2(fx, fy, s + 7) * 5);
          if (x === px && y === py) return m.accent[Math.floor(h2(fx, fy, s + 8) * m.accent.length)];
        }
      }
      return r[clampK(k, r.length)];
    }
    case 'cobble': {
      const c = m.courses!.at(x + (Math.floor(y / 5) % 2) * 3, y);
      const moss = vnoise(x, y, 18, s + 11) > 0.62;
      if (c.sx === 0 || c.sy === 0 || (c.sx === 1 && c.sy === 1) || (c.sx === c.w - 1 && c.sy === 1)) return moss ? '#3e5a2c' : r[0];
      let k = 2 + (c.id < 0.25 ? -0.6 : c.id > 0.75 ? 0.7 : 0) + (vnoise(x, y, 30, s + 12) - 0.5) * 0.8;
      if (c.sy === 1) k += 1;
      if (c.sy === c.h - 1 || c.sx === c.w - 1) k -= 1;
      return r[clampK(k, r.length)];
    }
    case 'flagstone': {
      const c = m.courses!.at(x + (Math.floor(y / 9) % 2) * 6, y);
      if (c.sx === 0 || c.sy === 0) return r[0];
      let k = 2 + (c.id - 0.5) * 1.6 + (vnoise(x, y, 14, s + 13) - 0.5) * 0.6;
      if (c.sy === 1 || c.sx === 1) k += 0.9;
      if (c.sy === c.h - 1 || c.sx === c.w - 1) k -= 0.9;
      // A crack across some slabs.
      if (c.id > 0.8 && Math.abs(c.sx - c.sy * (c.w / c.h) * 0.8 - 2) < 0.6) return r[1];
      if (m.accent && vnoise(x, y, 16, s + 14) > 0.7 && h2(x, y, s) < 0.6) return m.accent[0];
      return r[clampK(k, r.length)];
    }
    case 'dirt': {
      let k = 1.7 + vnoise(x, y, 20, s) * 1.5 + (vnoise(x, y, 6, s + 1) - 0.5) * 0.5;
      const cx = Math.floor(x / 7);
      const cy = Math.floor(y / 7);
      if (h2(cx, cy, s + 2) < 0.3) {
        const px = cx * 7 + 2 + Math.floor(h2(cx, cy, s + 3) * 3);
        const py = cy * 7 + 2 + Math.floor(h2(cx, cy, s + 4) * 3);
        if (y === py && (x === px || x === px + 1)) k = 3.4;
        else if (y === py + 1 && (x === px || x === px + 1)) k = 0.6;
      }
      return r[clampK(k, r.length)];
    }
    case 'snow': {
      let k = 2.6 + vnoise(x, y, 28, s) * 1.4 - (vnoise(x, y, 11, s + 1) > 0.7 ? 1 : 0);
      if (h2(x, y, s + 2) < 0.012) return '#ffffff';
      if ((x + Math.floor(vnoise(x, y, 40, s + 3) * 20)) % 37 === 0 && y % 3 === 0) k -= 0.6;
      return r[clampK(k, r.length)];
    }
    case 'ice': {
      let k = 2 + vnoise(x, y, 22, s) * 1.3;
      if (((x + y * 2) % 29 < 2) && vnoise(x, y, 30, s + 1) > 0.5) k = 4;
      const [d1, d2] = voronoi(x, y, 18, s + 2);
      if (d2 - d1 < 0.7) k = 1;
      return r[clampK(k, r.length)];
    }
    case 'sand': {
      const n = vnoise(x, y, 34, s);
      const v = Math.sin(x * 0.28 + y * 0.85 + n * 9);
      let k = 2 + (n - 0.5) * 1.2;
      if (v > 0.9) k = 3.3;
      else if (v < -0.93) k = 1.2;
      if (h2(Math.floor(x / 9), Math.floor(y / 9), s + 3) < 0.04 && h2(x, y, s) < 0.2) k = 0.5;
      return r[clampK(k, r.length)];
    }
    case 'mud': {
      const n = vnoise(x, y, 18, s);
      let k = 1.3 + n * 1.6;
      if (n > 0.72) k = 0;
      else if (n > 0.69) k = 3.4;
      if (m.accent && h2(Math.floor(x / 6), Math.floor(y / 6), s + 2) < 0.12 && h2(x, y, s + 3) < 0.35) return m.accent[0];
      return r[clampK(k, r.length)];
    }
    case 'tilled':
      return tilled(x, y, m, 1);
    case 'basalt':
    case 'crystalStone': {
      const [d1, d2, id] = voronoi(x, y, 11, s);
      if (d2 - d1 < 1.1) {
        if (m.accent && id < 0.18 && kind === 'basalt') return m.accent[0];
        return r[0];
      }
      let k = 1.4 + id * 1.6 + (d1 < 3 ? 0.6 : 0);
      if (kind === 'crystalStone' && m.accent && h2(x, y, s + 4) < 0.01) return m.accent[Math.floor(h2(x, y, s + 5) * m.accent.length)];
      return r[clampK(k, r.length)];
    }
  }
}

/**
 * Plowed soil: a ridge every 8 px with its slope lit from the top left and the furrow between in
 * shade, clods along the ridges and, if `field` says so, rows of seedlings. `field` is the field mask
 * value (mapgen.ts): 1 rows run east-west, 2 north-south, +4 seedlings.
 */
function tilled(x: number, y: number, m: MatCtx, field: number): string {
  const r = m.ramp;
  const s = m.seed;
  const ns = (field & 3) === 2;
  const along = ns ? y : x;
  const across = ns ? x : y;
  const p = across & 7;
  let k = [3.3, 2.9, 2.5, 2.2, 1.8, 1.05, 0.45, 1.25][p] + (vnoise(x, y, 22, s) - 0.5) * 0.8;
  const row = across >> 3;
  // Clods on the ridges: a lit lump with a shadow under it.
  const cell = Math.floor(along / 6);
  if (h2(cell, row, s + 1) < 0.45) {
    const c = cell * 6 + 1 + Math.floor(h2(cell, row, s + 2) * 4);
    const cp = 1 + Math.floor(h2(cell, row, s + 3) * 2);
    if (along === c && p === cp) k = 3.9;
    else if (along === c && p === cp + 1) k = 1.1;
  }
  if (field & 4 && m.accent) {
    // Seedlings along the ridge tops: two leaves over a stem.
    const sc = Math.floor(along / 5);
    if (h2(sc, row, s + 4) < 0.8) {
      const c = sc * 5 + 1 + Math.floor(h2(sc, row, s + 5) * 3);
      if (p === 2 && (along === c - 1 || along === c + 1)) return m.accent[1];
      if (p === 3 && along === c) return m.accent[0];
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

function hexToRgb(hex: string): [number, number, number] {
  return rgb(hex);
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

/** The floor's ground as RGBA pixels (no canvas: tools/preview.ts paints floors in Node with it). */
export function paintTerrainPixels(m: FloorMap, biome: Biome): Omit<Terrain, 'canvas'> & { w: number; h: number; px: Uint8ClampedArray } {
  const W = m.w * TILE;
  const H = m.h * TILE;
  const px = new Uint8ClampedArray(W * H * 4);
  const seed = m.seed & 0xffff;
  const tile = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? SOLID : m.tiles[ty * m.w + tx]);
  const pathAt = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? 0 : m.path[ty * m.w + tx]);
  const ground: MatCtx = { seed, ramp: biome.ground.ramp, accent: biome.ground.accent };
  const path: MatCtx = { seed: seed + 101, ramp: biome.path.ramp, accent: biome.path.accent };
  const fieldMat: MatCtx | null = biome.fields && m.field ? { seed: seed + 202, ramp: biome.fields.ramp, accent: biome.fields.accent } : null;
  const fieldAt = (tx: number, ty: number) => (!m.field || tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? 0 : m.field[ty * m.w + tx]);
  const isField = (tx: number, ty: number) => (fieldAt(tx, ty) ? 1 : 0);
  // A field pixel just past its tile's edge takes the furrows of the field it belongs to.
  const fieldOf = (tx: number, ty: number) => fieldAt(tx, ty) || fieldAt(tx, ty - 1) || fieldAt(tx, ty + 1) || fieldAt(tx - 1, ty) || fieldAt(tx + 1, ty) || 1;

  for (const mc of [[ground, biome.ground.kind], [path, biome.path.kind]] as const) {
    if (mc[1] === 'cobble') mc[0].courses = new Courses(mc[0].seed, 5, 4, 8);
    if (mc[1] === 'flagstone') mc[0].courses = new Courses(mc[0].seed, 9, 9, 15);
  }
  const face = biome.solid.face;
  const top = biome.solid.top;
  const liquid = biome.liquid;
  const glows: Terrain['glows'] = [];
  const liquidTiles: Terrain['liquid'] = [];
  // Smooth masks: the path material blends in with ragged edges; ponds get round shores.
  const bil = (fn: (tx: number, ty: number) => number, x: number, y: number) => {
    const fx = x / TILE - 0.5;
    const fy = y / TILE - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = fn(x0, y0);
    const b = fn(x0 + 1, y0);
    const c = fn(x0, y0 + 1);
    const d = fn(x0 + 1, y0 + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  const isLiquid = (tx: number, ty: number) => (tile(tx, ty) === LIQUID ? 1 : 0);
  // A town: every street paved, right up to the curbs.
  const isPath = biome.path.everywhere ? () => 1 : (tx: number, ty: number) => pathAt(tx, ty);
  const isOpen = (tx: number, ty: number) => (tile(tx, ty) === SOLID ? 0 : 1);
  // Fields keep neat edges (less raggedness than paths).
  const fieldMask = (x: number, y: number) => bil(isField, x, y) + (vnoise(x, y, 5, seed + 90) - 0.5) * 0.22;
  const set = (i: number, hex: string, dark = 0) => {
    const [r, g, b] = hexToRgb(hex);
    const f = 1 - dark;
    px[i] = r * f;
    px[i + 1] = g * f;
    px[i + 2] = b * f;
    px[i + 3] = 255;
  };
  const open = (tx: number, ty: number) => tile(tx, ty) !== SOLID && !m.canal?.[ty * m.w + tx];
  /** The stone curb round a lot, where it meets the street: a lit top, a face toward us on the south. */
  const curbAt = (tx: number, ty: number, lx: number, ly: number, C: Ramp): string | null => {
    const S = open(tx, ty + 1);
    const N = open(tx, ty - 1);
    const Wd = open(tx - 1, ty);
    const E = open(tx + 1, ty);
    if (S && ly >= 11) return ly === 11 ? C[2] : ly === 12 ? C[3] : ly === 15 ? C[0] : C[1];
    if (N && ly <= 2) return ly === 0 ? C[2] : ly === 1 ? C[3] : C[1];
    if (Wd && lx <= 2) return lx === 0 ? C[2] : lx === 1 ? C[3] : C[1];
    if (E && lx >= 13) return lx === 15 ? C[1] : lx === 14 ? C[2] : C[3];
    // Corners where the street turns.
    if (open(tx + 1, ty + 1) && lx >= 13 && ly >= 11) return ly === 15 ? C[0] : ly <= 12 ? C[2] : C[1];
    if (open(tx - 1, ty + 1) && lx <= 2 && ly >= 11) return ly === 15 ? C[0] : ly <= 12 ? C[2] : C[1];
    if (open(tx + 1, ty - 1) && lx >= 13 && ly <= 2) return C[2];
    if (open(tx - 1, ty - 1) && lx <= 2 && ly <= 2) return C[2];
    return null;
  };
  const isCanal = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? 0 : m.canal?.[ty * m.w + tx] ?? 0);
  const water = liquid?.ramp ?? ['#1e4a9a', '#2a62c0', '#3a7ad8', '#5a9ae8', '#8ac0f4'];
  const bank = biome.solid.curb ?? biome.path.ramp;
  /** A canal: saturated water with lighter streaks between stone banks (the north bank's face shows). */
  const canalAt = (x: number, y: number, lx: number, ly: number, tx: number, ty: number): string => {
    if (!isCanal(tx, ty - 1) && ly < 5) return ly === 0 ? bank[2] : ly === 1 ? bank[3] : ly === 4 ? bank[0] : bank[1];
    if (!isCanal(tx, ty + 1) && ly > 13) return ly === 14 ? bank[2] : bank[3];
    if (!isCanal(tx - 1, ty) && lx < 2) return lx === 0 ? bank[2] : bank[3];
    if (!isCanal(tx + 1, ty) && lx > 13) return lx === 15 ? bank[1] : bank[2];
    let k = 2 + (vnoise(x, y, 12, seed + 150) - 0.5) * 0.8;
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
  const cob = biome.path.kind === 'cobble' ? new Cobbles(seed + 140, 5) : null;
  // A cobbled road keeps a steadier edge than a dirt track (its stones wear it ragged instead).
  const ragged = cob ? 0.26 : 0.45;
  const pathMask = (x: number, y: number) => bil(isPath, x, y) + (vnoise(x, y, 6, seed + 80) - 0.5) * ragged;
  const stoneMask = new Map<number, number>();
  const warm = biome.path.ramp;
  const grey = warm.map((c) => mixHex(c, '#a6a6aa', 0.38));
  // The joints a soft shade under the darkest stone, not a black line.
  const mortar = shade(warm[0], -0.12);
  const dirt = biome.path.dirt ?? warm.map((c, k) => mixHex(c, biome.ground.ramp[Math.min(k, biome.ground.ramp.length - 1)], 0.35));
  let onDirt = false;
  /** The road at a pixel: a stone or mortar color, packed dirt (sets `onDirt`), or null (no road here). */
  const cobbleAt = (x: number, y: number, pm: number): string | null => {
    onDirt = false;
    const st = cob!.at(x, y);
    const key = st.gx * 8192 + st.gy;
    let mid = stoneMask.get(key);
    if (mid === undefined) {
      mid = pathMask(st.px, st.py);
      stoneMask.set(key, mid);
    }
    const id = h2(st.gx, st.gy, seed + 141);
    const cut = 0.47 + (h2(st.gx, st.gy, seed + 142) - 0.5) * 0.16;
    // A stone missing here and there inside the road; a grassy hollow where the noise says so.
    const lost = !biome.path.everywhere && (id < 0.02 || vnoise(st.px, st.py, 26, seed + 143) > 0.8);
    if (mid > cut && !lost) {
      const gap = st.d2 - st.d1;
      const dx = x + 0.5 - st.px;
      const dy = y + 0.5 - st.py;
      // A soft mortar line round every stone, moss in a few of the joints.
      if (gap < 0.95 || st.d1 > 3.3) return vnoise(x, y, 14, seed + 144) > 0.7 && h2(st.gx, st.gy, seed + 148) < 0.5 ? ((x + y) % 2 ? '#5c8a34' : '#6e9e3e') : mortar;
      const ramp = h2(st.gx, st.gy, seed + 145) < 0.35 ? grey : warm;
      let k = 2.1 + (id - 0.5) * 1.6;
      const side = dx + dy * 1.1;
      // Each stone a flat tone, its top-left rim lit, its bottom-right rim a little darker.
      if (gap < 1.8) k += side < 0 ? 0.8 : -0.45;
      return ramp[clampK(k, ramp.length)];
    }
    if (pm > 0.36) {
      // Packed dirt where the stones are gone, with the odd pebble.
      const k = 1.6 + vnoise(x, y, 9, seed + 146) * 1.2 + (h2(x, y, seed + 147) < 0.04 ? 1.4 : 0);
      onDirt = true;
      return dirt[clampK(k, dirt.length)];
    }
    return null;
  };

  for (let y = 0; y < H; y++) {
    const ty = Math.floor(y / TILE);
    const ly = y - ty * TILE;
    for (let x = 0; x < W; x++) {
      const tx = Math.floor(x / TILE);
      const lx = x - tx * TILE;
      const i = (y * W + x) * 4;
      const t = tile(tx, ty);
      if (t === SOLID) {
        const below = tile(tx, ty + 1);
        const faceTile = below !== SOLID;
        const canal = m.canal?.[ty * m.w + tx];
        if (canal) {
          set(i, canalAt(x, y, lx, ly, tx, ty));
          surf[y * W + x] = 3;
          continue;
        }
        if (biome.solid.kind === 'trees' && biome.solid.curb) {
          // A lot: bright ground for the trees, houses and gardens on it, a stone curb round it.
          const c = curbAt(tx, ty, lx, ly, biome.solid.curb);
          if (c) {
            set(i, c);
            surf[y * W + x] = 8;
          } else {
            set(i, paint(biome.ground.kind, x, y, ground), 0.03);
            surf[y * W + x] = 9;
          }
          continue;
        }
        if (biome.solid.kind === 'trees' && biome.solid.ledge && faceTile) {
          // A ledge: the wooded ground stands a step up, its earthy face toward us.
          set(i, ledgeFace(x, y, ly, ty, seed, biome.solid.ledge, biome.ground.ramp));
          surf[y * W + x] = 5;
          continue;
        }
        if (biome.solid.kind === 'trees') {
          // Under the trees: the same ground, sinking into deep shade away from the open floor (no hard
          // tile edges where a gap in the trees shows through).
          const open = bil(isOpen, x, y) + (vnoise(x, y, 6, seed + 51) - 0.5) * 0.35;
          const shadeAmt = Math.max(0.08, Math.min(0.42, 0.42 - open * 0.4));
          set(i, paint(biome.ground.kind, x, y, ground), Math.round(shadeAmt * 8) / 8);
          continue;
        }
        if (faceTile) surf[y * W + x] = 5;
        if (faceTile) {
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
            if (fy > 10 && vnoise(x, y, 6, seed + 61) > 0.62) k = Math.min(k, 1);
            set(i, face[clampK(k, face.length)]);
          } else {
            const n = vnoise(x * 0.5, y * 2.2, 5, seed + 62);
            let k = 1 + n * 2.4 + (fy < 4 ? 1 : 0) - (fy > 12 ? 0.8 : 0);
            if (Math.abs(((x * 0.5 + y * 2) % 7) - 3.5) < 0.3 && n > 0.5) k -= 1;
            if (fy <= 3) k = fy === 0 ? 4 : fy === 3 ? 1 : 3;
            set(i, face[clampK(k, face.length)]);
          }
          continue;
        }
        // The top of a wall: dark slabs (readable, not a void), a lit cap where it meets the floor.
        const n = vnoise(x, y, 8, seed + 63);
        let col = top[n > 0.6 ? 1 : 0];
        if ((lx === 0 || ly === 0) && (tx + ty) % 2 === 0) col = shade(top[0], -0.3);
        else if (lx === 1 && ly > 0 && h2(tx, ty, seed + 64) < 0.5) col = top[1];
        const capAbove = tile(tx, ty - 1) !== SOLID ? ly : 99;
        const capSide = Math.min(tile(tx - 1, ty) !== SOLID ? lx : 99, tile(tx + 1, ty) !== SOLID ? TILE - 1 - lx : 99);
        const cap = Math.min(capAbove, capSide);
        if (cap <= 2) col = cap === 0 ? face[4 % face.length] : cap === 1 ? face[3] : face[1];
        set(i, col);
        continue;
      }
      // Liquids, with round shores.
      const lq = liquid ? bil(isLiquid, x, y) + (vnoise(x, y, 7, seed + 70) - 0.5) * 0.3 : 0;
      if (liquid && lq > 0.5 && t !== BLOCKED) {
        const lr = liquid.ramp;
        const edge = lq < 0.62;
        const aboveDry = bil(isLiquid, x, y - 3) < 0.5;
        let k: number;
        if (liquid.kind === 'lava') {
          const n = vnoise(x, y, 9, seed + 71);
          k = 2 + (n - 0.5) * 3;
          if (vnoise(x, y, 4, seed + 72) > 0.75) k = 4;
          if (edge) k = 3;
        } else if (liquid.kind === 'chasm') {
          k = aboveDry ? 3 - (y % 3) * 0.5 : 0;
        } else {
          const n = vnoise(x, y, 14, seed + 73);
          k = 1 + n * 1.2 + (lq < 0.75 ? 0.8 : 0);
          if (Math.sin(x * 0.5 + Math.floor(y / 3) * 1.7) > 0.93 && y % 3 === 0) k = 3;
          if (edge) k = 4;
          if (aboveDry && !edge) k = 0.2;
          if (liquid.kind === 'swampWater' && h2(Math.floor(x / 5), Math.floor(y / 5), seed + 74) < 0.08) {
            set(i, '#4a7a2c');
            continue;
          }
        }
        set(i, lr[clampK(k, lr.length)]);
        surf[y * W + x] = edge ? 7 : 3;
        if (lx === 8 && ly === 8 && liquid.glow) glows.push({ x, y, color: liquid.glow, r: 34 });
        continue;
      }
      // A bridge's deck over a canal: planks across, darker gaps, the edges in shade.
      if (m.canal?.[ty * m.w + tx]) {
        const plank = ly % 3;
        const edge = lx < 2 || lx > 13;
        set(i, edge ? '#4a2e1c' : plank === 2 ? '#5a3a22' : plank === 0 ? '#a8784a' : (Math.floor(x / 5) + ty) % 2 ? '#8a5e38' : '#966a40');
        surf[y * W + x] = 0;
        continue;
      }
      // Ground or path, blending with a ragged edge.
      const pm = pathMask(x, y);
      let road: string | null = null;
      if (cob && pm > 0.2) road = cobbleAt(x, y, pm);
      const onPath = cob ? road !== null : pm > 0.5;
      const onField = !onPath && fieldMat !== null && fieldMask(x, y) > 0.5;
      let col = road ?? (onPath ? paint(biome.path.kind, x, y, path) : onField ? tilled(x, y, fieldMat!, fieldOf(tx, ty)) : paint(biome.ground.kind, x, y, ground));
      surf[y * W + x] = onField ? 4 : !onPath ? 1 : cob && onDirt ? 6 : 2;
      let dark = 0;
      // The ground's edge throws a little shadow onto the path below it.
      if (onPath && !cob) {
        const pmAbove = bil(isPath, x, y - 2) + (vnoise(x, y - 2, 6, seed + 80) - 0.5) * 0.45;
        if (pmAbove <= 0.5) dark += 0.28;
      }
      // A field lies a step below the grass: the grass edge shades its top and left rows.
      if (onField) {
        if (fieldMask(x, y - 2) <= 0.5) dark += 0.3;
        else if (fieldMask(x - 2, y) <= 0.5) dark += 0.18;
      }
      // A bank under the edge of water: the ground drops to the water line.
      if (liquid && liquid.kind !== 'lava') {
        const lqBelow = bil(isLiquid, x, y + 2) + (vnoise(x, y + 2, 7, seed + 70) - 0.5) * 0.3;
        if (lqBelow > 0.5) {
          col = paint(biome.ground.kind, x, y, ground);
          dark += 0.45;
        }
      }
      // Ambient occlusion where the floor meets walls (strongest under a wall's face).
      const sAbove = tile(tx, ty - 1) === SOLID ? ly : 99;
      const sLeft = tile(tx - 1, ty) === SOLID ? lx : 99;
      const sRight = tile(tx + 1, ty) === SOLID ? TILE - 1 - lx : 99;
      if (biome.solid.curb) {
        // The curb's crisp shadow on the street below and beside it.
        if (sAbove < 2) dark += sAbove === 0 ? 0.38 : 0.16;
        if (sLeft < 1) dark += 0.2;
      } else {
        const occ = Math.min(sAbove * 0.8, sLeft, sRight) + (vnoise(x, y, 4, seed + 52) - 0.5) * 3;
        if (occ < 6) dark += Math.round((6 - occ) * 1.5) / 1.5 * (biome.solid.kind === 'trees' ? 0.06 : 0.1);
      }
      set(i, col, Math.min(0.7, dark));
    }
  }
  for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) if (m.tiles[ty * m.w + tx] === LIQUID) liquidTiles.push({ x: tx * TILE + 8, y: ty * TILE + 8 });

  // --- the little things on the ground
  const table = DECALS[biome.id];
  const stone = stoneTones(biome);
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
      if (okAt(x, y)) set((y * W + x) * 4, hex);
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
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      const t = tile(tx, ty);
      if (t === SOLID || fieldAt(tx, ty)) continue;
      const wet = t === LIQUID;
      if (wet && (tile(tx - 1, ty) !== LIQUID || tile(tx + 1, ty) !== LIQUID || tile(tx, ty - 1) !== LIQUID || tile(tx, ty + 1) !== LIQUID)) continue;
      const near = wet ? null : solidNear(tx, ty);
      const cat = wet ? 'water' : near ? 'edge' : pathAt(tx, ty) ? 'path' : 'ground';
      // Meadows: patches of the open ground where flowers gather.
      const meadow = cat === 'ground' && vnoise(tx * TILE, ty * TILE, 90, seed + 610) > 0.62;
      const list: Array<[DecalKind, number]> = meadow ? [['flowers', 5], ['daisies', 5], ['tuft', 2]] : table[cat];
      if (!list.length || h2(tx, ty, seed + 600) * 100 >= table.density[cat] * (meadow ? 1.8 : 1)) continue;
      let x = tx * TILE + 3 + Math.floor(h2(tx, ty, seed + 601) * 10);
      let y = ty * TILE + 4 + Math.floor(h2(tx, ty, seed + 602) * 9);
      // Edge things hug the wall or the trees.
      if (near) {
        if (near[1] < 0) y = ty * TILE + 3;
        if (near[0] < 0) x = tx * TILE + 3;
        else if (near[0] > 0) x = tx * TILE + 12;
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
    const lr = liquid?.ramp ?? ['#1b3d4f', '#245a6b', '#2f7c86', '#55a7a6', '#9fd8cc'];
    for (let y = f.y - 14; y < f.y + f.h + 3; y++) {
      for (let x = f.x; x < f.x + f.w; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const u = (x - f.x) / Math.max(1, f.w - 1);
        let col: string;
        if (y < f.y) col = y === f.y - 14 || u < 0.12 || u > 0.88 ? lr[0] : (x + y) % 5 === 0 ? lr[3] : lr[1];
        else if (y < f.y + f.h) col = (x * 3 + Math.floor(y / 3)) % 4 === 0 ? lr[4] : u < 0.2 || u > 0.8 ? lr[2] : lr[3];
        else col = (x + y) % 2 ? '#e8f4f8' : lr[4];
        set((y * W + x) * 4, col);
      }
    }
  }

  // --- shadows thrown toward the lower right by everything standing
  const sh = castShadows(m, biome, W, H);
  for (let k = 0; k < sh.length; k++) {
    if (!sh[k]) continue;
    const i = k * 4;
    const [fr, fg, fb] = sh[k] === 2 ? SHADOW_CORE : SHADOW_EDGE;
    px[i] *= fr;
    px[i + 1] *= fg;
    px[i + 2] *= fb;
  }
  return { w: W, h: H, px, glows, liquid: liquidTiles };
}

/**
 * A ledge's face (16 px, the tile above the floor): a lip of grass hanging over the top edge, then
 * earth and rock in layers lit from above, roots dangling from the lip, moss in the cracks, and a dark
 * foot where it meets the floor.
 */
function ledgeFace(x: number, y: number, ly: number, ty: number, seed: number, L: Ramp, g: Ramp): string {
  const lip = 2 + (h2(x, ty, seed + 90) < 0.35 ? 1 : 0) + (h2(Math.floor(x / 3), ty, seed + 91) < 0.22 ? 2 : 0);
  if (ly < lip) return ly === 0 ? g[4] : ly === lip - 1 ? g[1] : g[3];
  // Roots hanging from the lip in some columns.
  const rootLen = h2(Math.floor(x / 2), ty, seed + 94) < 0.18 ? 4 + Math.floor(h2(x, ty, seed + 95) * 7) : 0;
  if (rootLen && ly < lip + rootLen && x % 2 === 0) return ly === lip + rootLen - 1 ? '#3a2a1c' : '#5a4430';
  const wob = Math.floor(vnoise(x, y, 7, seed + 92) * 3);
  const band = Math.floor((ly + wob) / 4);
  let k = 3.2 - ((ly - lip) / (16 - lip)) * 2.4 + (h2(Math.floor((x + band * 3) / 5), band + ty * 5, seed + 93) - 0.5) * 0.9;
  if ((ly + wob) % 4 === 0) k -= 1.1;
  if (h2(Math.floor(x / 4), ty * 7 + band, seed + 96) < 0.12 && x % 4 === 1) k = 0.3;
  if (ly >= 15) k = Math.min(k, 0.4);
  if (vnoise(x, y, 6, seed + 97) > 0.7 && ly < 13) return (x + ly) % 3 ? '#3e6a28' : '#5a8c34';
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
