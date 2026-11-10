/**
 * How high the solid ground stands over the floor. Every floor's solid parts (the woods round a
 * clearing, a town's lots, a cave's rock, a crypt's walls) are raised ground: where one meets open
 * floor to its south we see its face, that many pixels tall (the 3/4 view), and it throws a shadow
 * that long onto the floor. The painting is render/relief.ts; this is the part the world needs too
 * (a tree mustn't stand on a face).
 */
import type { Biome } from './biomes';
import { SOLID, TILE, type FloorMap } from './mapgen';

const HEIGHT: Partial<Record<string, number>> = {
  hamlet: 14,
  farmland: 14,
  forest: 22,
  tundra: 20,
  swamp: 18,
  graveyard: 20,
  desert: 30,
  ember: 28,
  crystal: 30,
  shrine: 28,
  crypt: 30,
};

/** The face's height in pixels (0: the biome paints its own walls, from a tileset). */
export function reliefHeight(b: Biome): number {
  if (b.tiles) return 0;
  return HEIGHT[b.id] ?? (b.solid.kind === 'trees' ? 16 : 28);
}

/** A face never takes more than two tiles of the solid ground behind its foot (a number, not 2 * TILE: mapgen loads this file while it is itself loading). */
export const RELIEF_MAX = 32;

/**
 * A solid tile's part in a face: how far above the face's foot the tile's bottom row is (0 or a
 * tile) and the face's height there (it stops at the top of the solid ground: a wall one tile thick
 * shows one tile of face). Null when no face reaches the tile.
 */
export function faceSpan(solidAt: (tx: number, ty: number) => boolean, height: number, tx: number, ty: number): readonly [base: number, fh: number] | null {
  if (height <= 0 || !solidAt(tx, ty)) return null;
  if (!solidAt(tx, ty + 1)) return [0, Math.min(height, solidAt(tx, ty - 1) ? RELIEF_MAX : TILE)];
  if (!solidAt(tx, ty + 2) && height > TILE) return [TILE, Math.min(height, RELIEF_MAX)];
  return null;
}

/** A terrace's wall: a tile and a half tall. */
export const TIER_HEIGHT = 24;

function hash(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth noise over the tiles, `size` tiles to a blob. */
function blob(tx: number, ty: number, size: number, s: number): number {
  const fx = tx / size;
  const fy = ty / size;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const u = fx - x0;
  const v = fy - y0;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const a = hash(x0, y0, s);
  const b = hash(x0 + 1, y0, s);
  const c = hash(x0, y0 + 1, s);
  const d = hash(x0 + 1, y0 + 1, s);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

/**
 * Terraces: back from the floor's edge, parts of the raised ground stand a second step up (`m.tiers`),
 * held by a wall of their own with the ground below it running on to the floor's edge. Nothing walks
 * up there; it's what makes the woods and the hills behind a street climb away from you. They keep
 * clear of houses, of anything standing on the ground and of the floor's own edge, and come in
 * stretches at least two tiles wide and deep. (Not indoors: a crypt's walls go up into the dark.)
 */
export function buildTiers(m: FloorMap, b: Biome): void {
  if (!reliefHeight(b) || b.solid.kind === 'wall') return;
  const W = m.w;
  const H = m.h;
  const solid = (tx: number, ty: number) => tx < 0 || ty < 0 || tx >= W || ty >= H || (m.tiles[ty * W + tx] === SOLID && !m.canal?.[ty * W + tx]);
  const busy = new Uint8Array(W * H);
  if (m.reserved) busy.set(m.reserved);
  for (const p of m.props) {
    if (p.kind === 'tree') continue;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor((p.y - 1) / TILE);
    for (let oy = -2; oy <= 0; oy++) for (let ox = -1; ox <= 1; ox++) if (tx + ox >= 0 && ty + oy >= 0 && tx + ox < W && ty + oy < H) busy[(ty + oy) * W + tx + ox] = 1;
  }
  const ok = new Uint8Array(W * H);
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      let good = true;
      for (let oy = -2; oy <= 3 && good; oy++) for (let ox = -2; ox <= 2 && good; ox++) if (!solid(tx + ox, ty + oy)) good = false;
      for (let oy = -1; oy <= 1 && good; oy++) for (let ox = -1; ox <= 1 && good; ox++) if (tx + ox >= 0 && ty + oy >= 0 && tx + ox < W && ty + oy < H && busy[(ty + oy) * W + tx + ox]) good = false;
      ok[ty * W + tx] = good ? 1 : 0;
    }
  }
  let t = new Uint8Array(W * H);
  const seed = m.seed & 0xffff;
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) if (ok[ty * W + tx] && blob(tx, ty * 1.5, 7, seed + 31) > 0.47) t[ty * W + tx] = 1;
  const at = (g: Uint8Array, tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= W || ty >= H ? 0 : g[ty * W + tx]);
  // Round the blobs off, then drop what's too thin to read as a terrace.
  for (let pass = 0; pass < 2; pass++) {
    const n = new Uint8Array(W * H);
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      if (!ok[ty * W + tx]) continue;
      let c = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) c += at(t, tx + ox, ty + oy);
      n[ty * W + tx] = c >= 5 ? 1 : 0;
    }
    t = n;
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      if (!t[ty * W + tx]) continue;
      if ((!at(t, tx - 1, ty) && !at(t, tx + 1, ty)) || (!at(t, tx, ty - 1) && !at(t, tx, ty + 1))) t[ty * W + tx] = 0;
    }
  }
  if (t.some((v) => v === 1)) m.tiers = t;
}

/**
 * Where a pixel of a terrace sits on its wall: how many pixels up from the wall's foot, or -1 on the
 * terrace's top (or off the terraces).
 */
export function tierRise(m: Pick<FloorMap, 'w' | 'h' | 'tiers'>, tx: number, ty: number, ly: number): number {
  const t = m.tiers;
  if (!t || tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || !t[ty * m.w + tx]) return -1;
  const on = (y: number) => y < m.h && t[y * m.w + tx] === 1;
  const rise = !on(ty + 1) ? TILE - 1 - ly : !on(ty + 2) ? 2 * TILE - 1 - ly : 99;
  return rise < TIER_HEIGHT ? rise : -1;
}

/**
 * Trees and the faces: a tree whose foot would land on a face (the floor's edge or a terrace's wall)
 * stands on the ground above it instead, and the trees right in front of a terrace's wall are thinned
 * out so the wall shows between them.
 */
export function standOnRelief(m: FloorMap, b: Biome): void {
  const h = reliefHeight(b);
  if (!h) return;
  const solidAt = (tx: number, ty: number) => tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.tiles[ty * m.w + tx] === SOLID;
  const keep: typeof m.props = [];
  for (const p of m.props) {
    if (p.kind !== 'tree') {
      keep.push(p);
      continue;
    }
    const y0 = Math.floor(p.y - 1);
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(y0 / TILE);
    const span = faceSpan(solidAt, h, tx, ty);
    if (span) {
      const rise = span[0] + TILE - 1 - (y0 - ty * TILE);
      if (rise < span[1]) p.y -= span[1] - rise;
    } else if (m.tiers) {
      const rise = tierRise(m, tx, ty, y0 - ty * TILE);
      if (rise >= 0) p.y -= TIER_HEIGHT - rise;
      else if (!m.tiers[ty * m.w + tx] && (tierRise(m, tx, ty - 1, TILE - 1) >= 0 || tierRise(m, tx, ty - 2, TILE - 1) >= 0) && hash(Math.floor(p.x), y0, m.seed & 0xffff) < 0.8) continue;
    }
    keep.push(p);
  }
  m.props = keep;
}
