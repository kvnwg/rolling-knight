/**
 * The Dungeon's ground, stamped tile by tile from the packs' tilesets (dungeonArt.ts) instead of
 * painted per pixel: every floor tile and every wall tile is picked from what's round it, so the
 * packs' walls, faces, caps, corners and floor rims fit any floor the rooms layout makes.
 *
 * Purple-brown stone (pack 1): the walls are thin. Floor to the south of a wall shows its brick face
 * (a 4 px cap on top); elsewhere the wall is a 7 px rim of brown stones hugging the floor, its outer
 * side a dark face falling into the void. A wall tile is put together from quarters (8 x 8), each
 * picked from its two sides and its corner: a cap, a rim, a corner stone, a turn, or void. Floors are
 * the pack's cracked flagstones, shaded 2 px along every wall.
 *
 * Blue stone (DungeonAssets): the walls are thick. A wall tile next to the floor is a mauve cap (a
 * column on the sides, a row to the south, a corner block where they meet); to the north the floor
 * sees a blue brick face with the cap over it. The floor carries a cobbled rim along its walls.
 */
import { SOLID, TILE, type FloorMap } from '../../world/mapgen';
import { dungeonLook } from '../../world/dungeonLook';
import { KEYS } from '../pixel/indexed';
import { rgb } from '../pixel/buf';
import { BLUE_TILES, PURPLE_TILES, type TileSet } from './dungeonArt';

type Tile = Uint8ClampedArray;

const decoded = new Map<TileSet, Map<string, Tile>>();

/** A tile set's tiles as RGBA (16 x 16), decoded once. */
function tilesOf(set: TileSet): Map<string, Tile> {
  let m = decoded.get(set);
  if (m) return m;
  m = new Map();
  const pal = set.pal.map((c) => rgb(c));
  for (const [name, rows] of Object.entries(set.tiles)) {
    const t = new Uint8ClampedArray(TILE * TILE * 4);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        const [r, g, b] = pal[KEYS.indexOf(ch)];
        const i = (y * TILE + x) * 4;
        t[i] = r;
        t[i + 1] = g;
        t[i + 2] = b;
        t[i + 3] = 255;
      }
    }
    m.set(name, t);
  }
  decoded.set(set, m);
  return m;
}

function h2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface Canvas {
  px: Uint8ClampedArray;
  surf: Uint8Array;
  W: number;
}

/** Copies a tile (or one 8 x 8 quarter of it) to tile (tx, ty); only its solid pixels. */
function put(c: Canvas, t: Tile | undefined, tx: number, ty: number, q?: [number, number], surf = 0): void {
  if (!t) return;
  const x0 = q ? q[0] * 8 : 0;
  const y0 = q ? q[1] * 8 : 0;
  const n = q ? 8 : TILE;
  for (let y = y0; y < y0 + n; y++) {
    for (let x = x0; x < x0 + n; x++) {
      const s = (y * TILE + x) * 4;
      if (!t[s + 3]) continue;
      const X = tx * TILE + x;
      const Y = ty * TILE + y;
      const d = (Y * c.W + X) * 4;
      c.px[d] = t[s];
      c.px[d + 1] = t[s + 1];
      c.px[d + 2] = t[s + 2];
      c.px[d + 3] = 255;
      c.surf[Y * c.W + X] = surf;
    }
  }
}

function fill(c: Canvas, hex: string, tx: number, ty: number, surf: number): void {
  const [r, g, b] = rgb(hex);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const X = tx * TILE + x;
      const Y = ty * TILE + y;
      const d = (Y * c.W + X) * 4;
      c.px[d] = r;
      c.px[d + 1] = g;
      c.px[d + 2] = b;
      c.px[d + 3] = 255;
      c.surf[Y * c.W + X] = surf;
    }
  }
}

function dot(c: Canvas, hex: string, X: number, Y: number): void {
  const [r, g, b] = rgb(hex);
  const d = (Y * c.W + X) * 4;
  c.px[d] = r;
  c.px[d + 1] = g;
  c.px[d + 2] = b;
  c.px[d + 3] = 255;
  c.surf[Y * c.W + X] = 0;
}

/** Surface codes (terrain.ts): decals go on floor (1), never on walls (0) or faces (5). */
const FLOOR_SURF = 1;
const FACE_SURF = 5;

/** Stamps the whole floor's ground into `px` (RGBA, the map's size in pixels) and marks `surf`. */
export function stampDungeon(m: FloorMap, px: Uint8ClampedArray, surf: Uint8Array): void {
  const c: Canvas = { px, surf, W: m.w * TILE };
  const solid = (x: number, y: number) => x < 0 || y < 0 || x >= m.w || y >= m.h || m.tiles[y * m.w + x] === SOLID;
  const seed = m.seed & 0xffff;
  if (dungeonLook(m.seed) === 'blue') stampBlue(m, c, solid, seed);
  else stampPurple(m, c, solid, seed);
}

type Solid = (x: number, y: number) => boolean;

// ------------------------------------------------------------------ purple-brown stone

/** Floor variants, the plain ones listed more often (the cracked ones are accents). */
const PURPLE_FLOORS = [5, 6, 9, 10, 0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15];

function stampPurple(m: FloorMap, c: Canvas, solid: Solid, seed: number): void {
  const T = tilesOf(PURPLE_TILES);
  const col = PURPLE_TILES.colors;
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      const v = h2(tx, ty, seed);
      if (!solid(tx, ty)) {
        // A flagstone, shaded 2 px along each wall (the outline's dark, then the shade).
        const k = PURPLE_FLOORS[Math.floor(Math.pow(v, 1.6) * PURPLE_FLOORS.length)];
        put(c, T.get(`floor${k}`), tx, ty, undefined, FLOOR_SURF);
        const X = tx * TILE;
        const Y = ty * TILE;
        const n = solid(tx, ty - 1);
        const s = solid(tx, ty + 1);
        const w = solid(tx - 1, ty);
        const e = solid(tx + 1, ty);
        // The shade lines first, then the dark lines outside them (so corners come out dark).
        for (const [hex, inner] of [[col.shade, 1], [col.void, 0]] as const) {
          for (let i = 0; i < TILE; i++) {
            if (n) dot(c, hex, X + i, Y + inner);
            if (s) dot(c, hex, X + i, Y + 15 - inner);
            if (w) dot(c, hex, X + inner, Y + i);
            if (e) dot(c, hex, X + 15 - inner, Y + i);
          }
        }
        // Inside corners: a dark pixel where only the diagonal is wall.
        if (solid(tx - 1, ty - 1) && !solid(tx - 1, ty) && !solid(tx, ty - 1)) dot(c, col.void, X, Y);
        if (solid(tx + 1, ty - 1) && !solid(tx + 1, ty) && !solid(tx, ty - 1)) dot(c, col.void, X + 15, Y);
        if (solid(tx - 1, ty + 1) && !solid(tx - 1, ty) && !solid(tx, ty + 1)) dot(c, col.void, X, Y + 15);
        if (solid(tx + 1, ty + 1) && !solid(tx + 1, ty) && !solid(tx, ty + 1)) dot(c, col.void, X + 15, Y + 15);
        continue;
      }
      fill(c, col.void, tx, ty, 0);
      // Floor to the south: the wall's brick face (its cap on top).
      if (!solid(tx, ty + 1)) {
        put(c, T.get(`face${Math.floor(v * 4)}`), tx, ty, undefined, FACE_SURF);
        continue;
      }
      const N = !solid(tx, ty - 1);
      const W = !solid(tx - 1, ty);
      const E = !solid(tx + 1, ty);
      const NW = !solid(tx - 1, ty - 1);
      const NE = !solid(tx + 1, ty - 1);
      // A face beside it (the neighbor's south is floor): the rim runs up alongside to the face's cap.
      const wFace = !W && !solid(tx - 1, ty + 1);
      const eFace = !E && !solid(tx + 1, ty + 1);
      const cap = T.get(`cap${Math.floor(h2(tx, ty, seed + 1) * 5)}`);
      const rim = 1 + Math.floor(h2(tx, ty, seed + 2) * 3);
      // Top quarters: a cap (floor to the north), a rim (floor to the side), a turn (both), a
      // corner stone (floor only at the corner), or void.
      let tl: string | null = null;
      if (N && W) put(c, T.get('innerNW'), tx, ty, [0, 0]);
      else if (N) (tl = 'cap'), put(c, cap, tx, ty, [0, 0]);
      else if (W) put(c, T.get(`rimL${rim}`), tx, ty, [0, 0]);
      else if (wFace) put(c, T.get('rimL0'), tx, ty, [0, 0]);
      else if (NW) (tl = 'corner'), put(c, T.get('cornerNW'), tx, ty, [0, 0]);
      let tr: string | null = null;
      if (N && E) put(c, T.get('innerNE'), tx, ty, [1, 0]);
      else if (N) (tr = 'cap'), put(c, cap, tx, ty, [1, 0]);
      else if (E) put(c, T.get(`rimR${rim}`), tx, ty, [1, 0]);
      else if (eFace) put(c, T.get('rimR0'), tx, ty, [1, 0]);
      else if (NE) (tr = 'corner'), put(c, T.get('cornerNE'), tx, ty, [1, 0]);
      // Bottom quarters: the rim going on down, or the dark face under a cap or corner stone.
      if (W) put(c, T.get(N ? 'innerNW' : `rimL${rim}`), tx, ty, [0, 1]);
      else if (wFace) put(c, T.get('rimL0'), tx, ty, [0, 1]);
      else if (tl === 'cap') put(c, cap, tx, ty, [0, 1]);
      else if (tl === 'corner') put(c, T.get('cornerNW'), tx, ty, [0, 1]);
      if (E) put(c, T.get(N ? 'innerNE' : `rimR${rim}`), tx, ty, [1, 1]);
      else if (eFace) put(c, T.get('rimR0'), tx, ty, [1, 1]);
      else if (tr === 'cap') put(c, cap, tx, ty, [1, 1]);
      else if (tr === 'corner') put(c, T.get('cornerNE'), tx, ty, [1, 1]);
    }
  }
}

// ------------------------------------------------------------------ blue stone

function stampBlue(m: FloorMap, c: Canvas, solid: Solid, seed: number): void {
  const T = tilesOf(BLUE_TILES);
  const col = BLUE_TILES.colors;
  const face = (x: number, y: number) => solid(x, y) && !solid(x, y + 1);
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      const v = h2(tx, ty, seed);
      const pick = (name: string, n: number, s = 0) => T.get(`${name}${Math.floor(h2(tx, ty, seed + 7 + s) * n)}`);
      if (!solid(tx, ty)) {
        fill(c, col.floor, tx, ty, FLOOR_SURF);
        if (v < 0.07) put(c, T.get(`crack${Math.floor(h2(tx, ty, seed + 3) * 3)}`), tx, ty, undefined, FLOOR_SURF);
        // The cobbled rim along the walls (and the shade down a side wall).
        const n = solid(tx, ty - 1);
        const s = solid(tx, ty + 1);
        const w = solid(tx - 1, ty);
        const e = solid(tx + 1, ty);
        if (w && !n && !s) put(c, pick('floorW', 3), tx, ty);
        if (e && !n && !s) put(c, pick('floorE', 3), tx, ty);
        if (n) {
          put(c, w ? T.get('floorNW') : e ? T.get('floorNE') : pick('floorN', 2), tx, ty);
          if (w && e) put(c, T.get('floorNE'), tx, ty);
        }
        if (s) {
          put(c, w ? T.get('floorSW') : e ? T.get('floorSE') : pick('floorS', 3), tx, ty);
          if (w && e) put(c, T.get('floorSE'), tx, ty);
        }
        continue;
      }
      fill(c, col.void, tx, ty, 0);
      if (face(tx, ty)) {
        put(c, pick('face', 2), tx, ty, undefined, FACE_SURF);
        continue;
      }
      const N = !solid(tx, ty - 1);
      const W = !solid(tx - 1, ty);
      const E = !solid(tx + 1, ty);
      const aboveFace = face(tx, ty + 1);
      if (E) put(c, pick('capW', 3), tx, ty);
      else if (W) put(c, pick('capE', 3), tx, ty);
      else if (N) put(c, pick('capS', 3), tx, ty);
      else if (aboveFace) put(c, pick('capN', 2), tx, ty);
      else if (!solid(tx + 1, ty + 1)) put(c, pick('capW', 3), tx, ty);
      else if (!solid(tx - 1, ty + 1)) put(c, pick('capE', 3), tx, ty);
      else if (!solid(tx + 1, ty - 1)) put(c, T.get('cornerBL'), tx, ty);
      else if (!solid(tx - 1, ty - 1)) put(c, T.get('cornerBR'), tx, ty);
      else if (face(tx + 1, ty + 1)) put(c, T.get('cornerTL'), tx, ty);
      else if (face(tx - 1, ty + 1)) put(c, T.get('cornerTR'), tx, ty);
    }
  }
}
