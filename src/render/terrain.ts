/**
 * Paints a floor's ground once, when the floor is built: the biome's ground and path materials
 * (grass, cobbles, flagstones, snow, sand...) with organic edges between them, pools of water or lava
 * with banks and foam, walls and cliffs drawn with their front faces (the 3/4 view), and ambient
 * occlusion where floor meets wall. Trees, props and everything that moves are drawn on top each
 * frame (renderer.ts).
 */
import type { Biome, GroundKind, Ramp } from '../world/biomes';
import { BLOCKED, FLOOR, LIQUID, SOLID, TILE, type FloorMap } from '../world/mapgen';
import { rgb } from './pixel/buf';
import { makeCanvas } from './art/draw';

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
      let k = 1.6 + vnoise(x, y, 26, s) * 1.6 + (vnoise(x, y, 9, s + 1) - 0.5) * 0.7;
      // Tufts: little bright blades with a shadow under them.
      const cx = Math.floor(x / 5);
      const cy = Math.floor(y / 5);
      const hh = h2(cx, cy, s + 2);
      if (hh < 0.6) {
        const tx = cx * 5 + 1 + Math.floor(h2(cx, cy, s + 3) * 3);
        const ty = cy * 5 + 1 + Math.floor(h2(cx, cy, s + 4) * 3);
        if (x === tx && y === ty) k += 1.2;
        else if ((x === tx - 1 || x === tx + 1) && y === ty + 1) k += 0.7;
        else if (x === tx && y === ty + 1) k -= 0.9;
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
  const W = m.w * TILE;
  const H = m.h * TILE;
  const canvas = makeCanvas(W, H) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const seed = m.seed & 0xffff;
  const tile = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? SOLID : m.tiles[ty * m.w + tx]);
  const pathAt = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? 0 : m.path[ty * m.w + tx]);
  const ground: MatCtx = { seed, ramp: biome.ground.ramp, accent: biome.ground.accent };
  const path: MatCtx = { seed: seed + 101, ramp: biome.path.ramp, accent: biome.path.accent };
  for (const mc of [[ground, biome.ground.kind], [path, biome.path.kind]] as const) {
    if (mc[1] === 'cobble') mc[0].courses = new Courses(mc[0].seed, 5, 4, 8);
    if (mc[1] === 'flagstone') mc[0].courses = new Courses(mc[0].seed, 9, 9, 15);
  }
  const under = biome.solid.underRamp ?? biome.solid.top;
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
  const set = (i: number, hex: string, dark = 0) => {
    const [r, g, b] = hexToRgb(hex);
    const f = 1 - dark;
    px[i] = r * f;
    px[i + 1] = g * f;
    px[i + 2] = b * f;
    px[i + 3] = 255;
  };
  const wallFaceH = biome.solid.kind === 'trees' ? 6 : TILE;

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
          // Under the trees: dark forest floor, with a bushy rim where it meets the open ground.
          const n = vnoise(x, y, 10, seed + 50);
          const rim = faceTile && ly >= TILE - wallFaceH + Math.round((vnoise(x, ty * 16, 5, seed + 51) - 0.5) * 6);
          if (rim) {
            const k = ly >= TILE - 2 ? 0 : n > 0.5 ? 2 : 1;
            set(i, [under[0], biome.treeRamp[1], biome.treeRamp[2]][k] ?? under[1]);
          } else set(i, under[n > 0.55 ? 1 : 0]);
          continue;
        }
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
        if (lx === 8 && ly === 8 && liquid.glow) glows.push({ x, y, color: liquid.glow, r: 34 });
        continue;
      }
      // Ground or path, blending with a ragged edge.
      const pm = bil(isPath, x, y) + (vnoise(x, y, 6, seed + 80) - 0.5) * 0.45;
      const onPath = pm > 0.5;
      let col = onPath ? paint(biome.path.kind, x, y, path) : paint(biome.ground.kind, x, y, ground);
      let dark = 0;
      // The ground's edge throws a little shadow onto the path below it.
      if (onPath) {
        const pmAbove = bil(isPath, x, y - 2) + (vnoise(x, y - 2, 6, seed + 80) - 0.5) * 0.45;
        if (pmAbove <= 0.5) dark += 0.28;
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
  ctx.putImageData(img, 0, 0);
  return { canvas, glows, liquid: liquidTiles };
}

export { FLOOR };
