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

/** Grass tufts: a few blade shapes as [dx, dy, tone change], the tips lit, a shadow at the root. */
const TUFTS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[-1, -2, 1.3], [1, -2, 1.2], [-1, -1, 0.6], [0, -1, 0.9], [1, -1, 0.5], [-1, 0, -0.8], [0, 0, -0.8], [1, 0, -0.7]],
  [[0, -2, 1.3], [-1, -1, 1.0], [0, -1, 0.6], [-1, 0, -0.8], [0, 0, -0.8]],
  [[-2, -2, 1.1], [0, -2, 1.3], [2, -2, 1.0], [-2, -1, 0.5], [-1, -1, 0.8], [0, -1, 0.6], [1, -1, 0.8], [2, -1, 0.4], [-2, 0, -0.7], [-1, 0, -0.8], [0, 0, -0.8], [1, 0, -0.8], [2, 0, -0.6]],
  [[1, -3, 1.3], [0, -2, 1.0], [1, -2, 0.7], [-1, -1, 1.1], [0, -1, 0.6], [-1, 0, -0.8], [0, 0, -0.8], [1, 0, -0.6]],
];
const TUFT_AT = TUFTS.map((t) => new Map(t.map(([dx, dy, d]) => [dx * 16 + dy, d])));

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
      // Patches of lighter and darker grass with soft organic edges, three tones.
      const n = vnoise(x, y, 30, s) + (vnoise(x, y, 9, s + 1) - 0.5) * 0.32;
      let k = n < 0.38 ? 1.45 : n < 0.62 ? 2.1 : 2.75;
      // Short tufts on a jittered grid: lit tips over a darker root.
      const cx = Math.floor(x / 6);
      const cy = Math.floor((y + 2) / 5);
      if (h2(cx, cy, s + 2) < 0.55) {
        const tx = cx * 6 + 2 + Math.floor(h2(cx, cy, s + 3) * 3);
        const ty = cy * 5 + 2 + Math.floor(h2(cx, cy, s + 4) * 2);
        const d = TUFT_AT[Math.floor(h2(cx, cy, s + 6) * TUFTS.length)].get((x - tx) * 16 + (y - ty));
        if (d !== undefined) k += d;
      }
      if (m.accent && kind === 'grass') {
        const fx = Math.floor(x / 11);
        const fy = Math.floor(y / 11);
        const fh = h2(fx, fy, s + 5);
        if (fh < 0.09) {
          const px = fx * 11 + 3 + Math.floor(h2(fx, fy, s + 6) * 5);
          const py = fy * 11 + 3 + Math.floor(h2(fx, fy, s + 7) * 5);
          const col = m.accent[Math.floor(h2(fx, fy, s + 8) * m.accent.length)];
          if (x === px && y === py) return col;
          if (x === px && y === py + 1) return r[1];
        }
      }
      if (kind === 'moss' && m.accent && h2(Math.floor(x / 13), Math.floor(y / 13), s + 9) < 0.06 && h2(x, y, s) < 0.4) return m.accent[0];
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
  const isPath = (tx: number, ty: number) => pathAt(tx, ty);
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
  // What each pixel is (decals only go where they belong).
  const surf = new Uint8Array(W * H);
  // Cobbled roads: whole stones, so the road's edge wears away stone by stone into packed dirt,
  // then grass; grass grows in the mortar and some stones are greyer than others.
  const cob = biome.path.kind === 'cobble' ? new Cobbles(seed + 140, 7) : null;
  // A cobbled road keeps a steadier edge than a dirt track (its stones wear it ragged instead).
  const ragged = cob ? 0.26 : 0.45;
  const pathMask = (x: number, y: number) => bil(isPath, x, y) + (vnoise(x, y, 6, seed + 80) - 0.5) * ragged;
  const stoneMask = new Map<number, number>();
  const warm = biome.path.ramp;
  const grey = warm.map((c) => mixHex(c, '#86868a', 0.38));
  const mortar = shade(warm[0], -0.25);
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
    const lost = id < 0.02 || vnoise(st.px, st.py, 26, seed + 143) > 0.8;
    if (mid > cut && !lost) {
      const gap = st.d2 - st.d1;
      const dx = x + 0.5 - st.px;
      const dy = y + 0.5 - st.py;
      const grassy = vnoise(x, y, 16, seed + 144) > 0.57;
      if (gap < 1.15 || st.d1 > 4.6) return grassy ? biome.ground.ramp[(x + y) % 3 === 0 ? 3 : 2] : mortar;
      const ramp = h2(st.gx, st.gy, seed + 145) < 0.3 ? grey : warm;
      let k = 2.15 + (id - 0.5) * 0.8;
      const side = dx + dy * 1.1;
      // A bevel: the rim lit on the top left, shaded on the bottom right; a soft spot of light on top.
      if (gap < 2.5 || st.d1 > 3.4) k += side < 0 ? 1 : -1;
      else if (dx < -0.5 && dy < -0.5) k += 0.45;
      if (grassy && side > 0 && gap < 2.5 && vnoise(x, y, 16, seed + 144) > 0.66) return biome.ground.ramp[2];
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
        if (biome.solid.kind === 'trees') {
          // Under the trees: the same ground, sinking into deep shade away from the open floor (no hard
          // tile edges where a gap in the trees shows through).
          const open = bil(isOpen, x, y) + (vnoise(x, y, 6, seed + 51) - 0.5) * 0.35;
          const shadeAmt = Math.max(0.28, Math.min(0.78, 0.78 - open * 0.75));
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
            if (fy <= 1) k = 4;
            if (fy >= TILE - 2) k = Math.min(k, 0.6);
            // Grime and moss toward the bottom.
            if (fy > 10 && vnoise(x, y, 6, seed + 61) > 0.62) k = Math.min(k, 1);
            set(i, face[clampK(k, face.length)]);
          } else {
            const n = vnoise(x * 0.5, y * 2.2, 5, seed + 62);
            let k = 1 + n * 2.4 + (fy < 4 ? 1 : 0) - (fy > 12 ? 0.8 : 0);
            if (Math.abs(((x * 0.5 + y * 2) % 7) - 3.5) < 0.3 && n > 0.5) k -= 1;
            if (fy <= 1) k = 4;
            set(i, face[clampK(k, face.length)]);
          }
          continue;
        }
        // The top of a wall: dark, with a lit rim along floor edges.
        const n = vnoise(x, y, 8, seed + 63);
        let col = top[n > 0.6 ? 1 : 0];
        const nearFloorAbove = ly <= 1 && tile(tx, ty - 1) !== SOLID;
        const nearSide = (lx <= 1 && tile(tx - 1, ty) !== SOLID) || (lx >= TILE - 2 && tile(tx + 1, ty) !== SOLID);
        if (nearFloorAbove || nearSide) col = face[3];
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
      const occ = Math.min(sAbove * 0.8, sLeft, sRight) + (vnoise(x, y, 4, seed + 52) - 0.5) * 3;
      if (occ < 6) dark += Math.round((6 - occ) * 1.5) / 1.5 * (biome.solid.kind === 'trees' ? 0.06 : 0.1);
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
