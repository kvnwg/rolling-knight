/**
 * Procedural floors. Each floor is built to a design (designs.ts: a chain of rooms, a loop round a
 * lake, a plaza with spokes, switchbacks, arenas and bridges, a crossroads, open ground with islands
 * of cover, a valley with ledges, a maze, a keep with a ring road), dealt from a deck so they don't
 * repeat (core/deck.ts). The design lays out the rooms and carves the floor in the biome's style:
 * cave biomes get blobby rooms and winding passages smoothed by a cellular pass; crypts and lava
 * caves get rectangular rooms and straight halls. Then, for every design alike: pools, paths, the
 * farm's crop fields, the town's houses and the wilds (decor.ts), props and lights, and the mob
 * packs. Every floor is checked to be fully connected.
 */
import { Rng } from '../core/rng';
import type { DesignId } from '../core/deck';
import { BIOMES, type Biome, type PropKind, type TreeKind } from './biomes';
import { dressFloor } from './decor';
import { buildTiers, standOnRelief } from './relief';
import { DESIGNS, Shaper } from './designs';
import { placeTrees, roomTree, type TreeSize } from './forest';
import { trapTiles } from './traps';

export const TILE = 16;
export const SOLID = 0;
export const FLOOR = 1;
export const LIQUID = 2;
/** Floor with a prop standing on it: blocks walking, not shots. */
export const BLOCKED = 3;

export interface Room {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  kind: 'start' | 'normal' | 'exit' | 'arena' | 'side';
  /** No foes here (the rooms on a boss floor's way to its arena). */
  quiet?: boolean;
}

export interface Prop {
  kind: PropKind | 'tree';
  tree?: TreeKind;
  /** World pixels: the base (feet) of the prop. */
  x: number;
  y: number;
  /** Blocks walking. */
  solid: boolean;
  seed: number;
  /** Part of the forest wall (drawn denser and darker). */
  edge?: boolean;
  /** Trees (forest.ts): how big, which painted variant, and how deep in the wood (drawn darker). */
  size?: TreeSize;
  variant?: number;
  depth?: number;
}

export interface Spawn {
  x: number;
  y: number;
  room: number;
  elite: boolean;
  boss: boolean;
}

export interface FloorMap {
  w: number;
  h: number;
  tiles: Uint8Array;
  /** 1 where the floor uses the biome's path material. */
  path: Uint8Array;
  /**
   * Tilled crop fields (biomes with `fields`): 0 none, else 1 furrows run east-west, 2 north-south,
   * plus 4 where seedlings grow in them.
   */
  field?: Uint8Array;
  /** Tiles something big stands on (a house and its roof): trees keep off them. */
  reserved?: Uint8Array;
  /** The corridors' middle line, before roads were widened (kept clear of furniture). */
  route?: Uint8Array;
  /** A canal through the lots: 1 water (in the lots), and on the street the bridge's deck over it. */
  canal?: Uint8Array;
  /** Terraces (relief.ts): 1 where the solid ground stands a second step up. */
  tiers?: Uint8Array;
  /** Water falling over a ledge's face into a pool (world pixels: its left, top, width, height). */
  waterfalls?: Array<{ x: number; y: number; w: number; h: number }>;
  rooms: Room[];
  start: { x: number; y: number };
  exit: { x: number; y: number };
  props: Prop[];
  spawns: Spawn[];
  seed: number;
  /** The design the floor was built to (generated floors; designs.ts). */
  design?: DesignId;
}

export function idx(m: Pick<FloorMap, 'w'>, x: number, y: number): number {
  return y * m.w + x;
}

export function tileAt(m: FloorMap, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return SOLID;
  return m.tiles[ty * m.w + tx];
}

export function walkable(m: FloorMap, tx: number, ty: number): boolean {
  return tileAt(m, tx, ty) === FLOOR;
}

/** Tiles that stop shots (walls and cliffs; not water, lava or props). */
export function blocksShots(m: FloorMap, tx: number, ty: number): boolean {
  return tileAt(m, tx, ty) === SOLID;
}

/** How many open floor tiles in a row from (x, y) going (dx, dy), not counting (x, y), up to `cap`. */
function openRun(m: FloorMap, x: number, y: number, dx: number, dy: number, cap = 3): number {
  let n = 0;
  while (n < cap && tileAt(m, x + dx * (n + 1), y + dy * (n + 1)) === FLOOR) n++;
  return n;
}

/**
 * Would a prop on the floor tile (x, y) squeeze the way past it to less than three tiles, across or
 * up and down? (Against a wall in a room it leaves plenty; at the side of a corridor three wide, or in
 * the middle of one four or five wide, it wouldn't. A squad turning back through a squeeze can jam.)
 */
export function squeezes(m: FloorMap, x: number, y: number): boolean {
  return Math.max(openRun(m, x, y, -1, 0), openRun(m, x, y, 1, 0)) < 3 || Math.max(openRun(m, x, y, 0, -1), openRun(m, x, y, 0, 1)) < 3;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Does any of these (just closed) tiles leave a gap of one or two floor tiles to the next obstacle? */
function narrowGap(m: FloorMap, tiles: readonly number[]): boolean {
  return tiles.some((i) => {
    const x = i % m.w;
    const y = (i / m.w) | 0;
    for (const [dx, dy] of DIRS) {
      const n = openRun(m, x, y, dx, dy);
      if (n === 1 || n === 2) return true;
    }
    return false;
  });
}

/** Breadth-first distances (in tiles) from (sx, sy) over walkable tiles; -1 unreachable. */
export function bfs(m: FloorMap, sx: number, sy: number, passable: (t: number) => boolean = (t) => t === FLOOR): Int32Array {
  const W = m.w;
  const N = W * m.h;
  const dist = new Int32Array(N).fill(-1);
  if (!passable(tileAt(m, sx, sy))) return dist;
  const tiles = m.tiles;
  const q = new Int32Array(N);
  let head = 0;
  let tail = 0;
  const s = idx(m, sx, sy);
  dist[s] = 0;
  q[tail++] = s;
  while (head < tail) {
    const c = q[head++];
    const cx = c % W;
    const d = dist[c] + 1;
    let n = c - 1;
    if (cx > 0 && dist[n] < 0 && passable(tiles[n])) {
      dist[n] = d;
      q[tail++] = n;
    }
    n = c + 1;
    if (cx < W - 1 && dist[n] < 0 && passable(tiles[n])) {
      dist[n] = d;
      q[tail++] = n;
    }
    n = c - W;
    if (n >= 0 && dist[n] < 0 && passable(tiles[n])) {
      dist[n] = d;
      q[tail++] = n;
    }
    n = c + W;
    if (n < N && dist[n] < 0 && passable(tiles[n])) {
      dist[n] = d;
      q[tail++] = n;
    }
  }
  return dist;
}

/**
 * Keeps a floor in one piece: is every floor tile still reachable from the start? It reuses its
 * buffers, and when only one tile has just been closed (a prop stood on it) it first looks round
 * that tile: if the open tiles beside it still join up among themselves, nothing can have been cut
 * off and no search is needed.
 */
export class Reach {
  private mark: Int32Array;
  private q: Int32Array;
  private stamp = 0;
  private ring: number[];

  constructor(
    private m: FloorMap,
    private sx: number,
    private sy: number,
  ) {
    this.mark = new Int32Array(m.w * m.h);
    this.q = new Int32Array(m.w * m.h);
    const W = m.w;
    // The eight round a tile in order (N, NE, E, SE, S, SW, W, NW): the edge-on ones at even places.
    this.ring = [-W, -W + 1, 1, W + 1, W, W - 1, -1, -W - 1];
  }

  /** Every floor tile reachable from the start? */
  all(): boolean {
    const W = this.m.w;
    const N = W * this.m.h;
    const t = this.m.tiles;
    let total = 0;
    for (let i = 0; i < N; i++) if (t[i] === FLOOR) total++;
    const s = this.sy * W + this.sx;
    if (t[s] !== FLOOR) return total === 0;
    const mark = this.mark;
    const q = this.q;
    const st = ++this.stamp;
    let head = 0;
    let tail = 0;
    mark[s] = st;
    q[tail++] = s;
    while (head < tail) {
      const c = q[head++];
      const cx = c % W;
      let n = c - 1;
      if (cx > 0 && mark[n] !== st && t[n] === FLOOR) {
        mark[n] = st;
        q[tail++] = n;
      }
      n = c + 1;
      if (cx < W - 1 && mark[n] !== st && t[n] === FLOOR) {
        mark[n] = st;
        q[tail++] = n;
      }
      n = c - W;
      if (n >= 0 && mark[n] !== st && t[n] === FLOOR) {
        mark[n] = st;
        q[tail++] = n;
      }
      n = c + W;
      if (n < N && mark[n] !== st && t[n] === FLOOR) {
        mark[n] = st;
        q[tail++] = n;
      }
    }
    return tail === total;
  }

  /** Still all one piece, now that floor tile `i` is closed (and it was before)? */
  closed(i: number): boolean {
    const W = this.m.w;
    const t = this.m.tiles;
    const x = i % W;
    const y = (i / W) | 0;
    if (x < 1 || y < 1 || x >= W - 1 || y >= this.m.h - 1 || i === this.sy * W + this.sx) return this.all();
    let open = 0;
    for (let k = 0; k < 8; k++) if (t[i + this.ring[k]] === FLOOR) open |= 1 << k;
    if (open === 255) return true;
    // Runs of open tiles round it that hold an edge-on neighbor: one (or none) and nothing was cut.
    let k0 = 0;
    while (open & (1 << k0)) k0++;
    let runs = 0;
    let inRun = false;
    let edgeOn = false;
    for (let j = 1; j <= 8; j++) {
      const k = (k0 + j) & 7;
      if (open & (1 << k)) {
        if (!inRun) {
          inRun = true;
          edgeOn = false;
        }
        if ((k & 1) === 0) edgeOn = true;
      } else if (inRun) {
        if (edgeOn) runs++;
        inRun = false;
      }
    }
    return runs <= 1 || this.all();
  }
}

export interface GenOptions {
  floor: number;
  biome: Biome;
  seed: number;
  boss: boolean;
  /** The floor's design (designs.ts): the chain of rooms when left out. */
  design?: DesignId;
}

export function generateFloor(opts: GenOptions): FloorMap {
  const { biome, boss, floor } = opts;
  const rng = new Rng(Rng.hashSeed(opts.seed ^ (floor * 2654435761)));
  const cave = biome.layout === 'cave';
  const design = opts.design ?? 'chain';
  // --- the design lays out the rooms and carves the floor
  const g = new Shaper(rng, biome, floor, boss, opts.seed);
  const plan = DESIGNS[design].layout(g);
  const m = g.m;
  const W = m.w;
  const H = m.h;
  m.design = design;
  const rooms = plan.rooms;
  m.rooms = rooms;
  const set = (x: number, yy: number, v: number) => g.set(x, yy, v);
  const markPath = (x: number, yy: number) => g.markPath(x, yy);

  // --- smooth caves (a couple of cellular passes), then keep only what the start reaches
  if (cave) {
    for (let pass = 0; pass < 2; pass++) {
      const next = m.tiles.slice();
      for (let yy = 2; yy < H - 2; yy++) {
        for (let x = 2; x < W - 2; x++) {
          let n = 0;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && m.tiles[(yy + oy) * W + x + ox] === FLOOR) n++;
          const c = m.tiles[yy * W + x];
          if (c === SOLID && n >= 6) next[yy * W + x] = FLOOR;
          else if (c === FLOOR && n <= 2) next[yy * W + x] = SOLID;
        }
      }
      m.tiles = next;
    }
  }
  // Lakes, moats, ledges, islands of cover: the design's touches that smoothing would blur.
  plan.after?.();
  const start = plan.start;
  const exit = plan.exit;
  // Room centers are always open.
  for (const r of [start, exit]) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) set(r.cx + ox, r.cy + oy, FLOOR);
  let reach = bfs(m, start.cx, start.cy);
  if (reach[exit.cy * W + exit.cx] < 0) {
    // (Never meant to happen: a plain hall to an exit the design left cut off.)
    g.lane(start, { cx: start.cx, cy: exit.cy }, 1);
    g.lane({ cx: start.cx, cy: exit.cy }, exit, 1);
    reach = bfs(m, start.cx, start.cy);
  }
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === FLOOR && reach[i] < 0) m.tiles[i] = SOLID;
  /** Is the floor still all one piece? (Pass the one tile just closed, if that was the only change.) */
  const whole = new Reach(m, start.cx, start.cy);
  const connected = (closed?: number) => (closed === undefined ? whole.all() : whole.closed(closed));
  // --- the way down: an archway at the back of the exit room (on a boss floor, the arena's far wall)
  const door = placeDoor(m, exit, boss, () => whole.all());
  m.exit = { x: door.tx * TILE + 8, y: door.ty * TILE + 8 };
  const byDoor = (x: number, yy: number) => Math.abs(x - door.tx) <= 2 && yy >= door.ty - 4 && yy <= door.ty + 1;

  // --- room plazas on the path material
  for (const r of rooms) {
    if (r.kind === 'start' || r.kind === 'exit' || r.kind === 'arena' || rng.chance(0.4)) {
      const pr = Math.max(2, Math.round((Math.min(r.rx, r.ry) - 1) * (biome.path.plaza ?? 1)));
      for (let yy = r.cy - pr; yy <= r.cy + pr; yy++) {
        for (let x = r.cx - pr - 1; x <= r.cx + pr + 1; x++) {
          if (((x - r.cx) / (pr + 1)) ** 2 + ((yy - r.cy) / pr) ** 2 <= 1 + rng.next() * 0.3) markPath(x, yy);
        }
      }
    }
  }
  m.route = m.path.slice();
  // Wider roads: the path spreads a tile or two either side, over open floor.
  for (let k = 0; k < (biome.path.wide ?? 0); k++) {
    const grown = m.path.slice();
    for (let yy = 1; yy < H - 1; yy++) for (let x = 1; x < W - 1; x++) {
      const i = yy * W + x;
      if (m.path[i] || m.tiles[i] !== FLOOR) continue;
      if (m.path[i - 1] || m.path[i + 1] || m.path[i - W] || m.path[i + W]) grown[i] = 1;
    }
    m.path = grown;
  }
  if (!cave) {
    // Crypt-style floors: every room is paved; halls stay the darker material.
    for (let i = 0; i < m.path.length; i++) m.path[i] = m.path[i] ? 0 : 1;
  }

  // --- pools (never cutting the floor in two)
  const ends = rooms.filter((r) => r.kind === 'start' || r.kind === 'exit' || r.kind === 'arena');
  const dryAt = (x: number, yy: number) => byDoor(x, yy) || ends.some((r) => Math.abs(x - r.cx) <= 2 && (Math.abs(yy - r.cy) <= 2 || (r.kind === 'arena' && Math.abs(yy - (r.cy - 3)) <= 1)));
  // (A paved town keeps its water in canals, not in pools on the street.)
  if (biome.liquid && !biome.path.everywhere) {
    for (const r of rooms) {
      if (r.kind === 'start' || r.kind === 'exit' || !rng.chance(r.kind === 'arena' ? 0.6 : 0.45)) continue;
      const pools = r.kind === 'arena' ? 2 : 1;
      for (let p = 0; p < pools; p++) {
        const lx = r.cx + rng.int(-r.rx + 2, r.rx - 2);
        const ly = r.cy + rng.int(-r.ry + 2, r.ry - 2);
        const lrx = rng.int(1, 3);
        const lry = rng.int(1, 2);
        if (Math.abs(lx - r.cx) < 2 && Math.abs(ly - r.cy) < 2 && r.kind === 'arena') continue;
        const changed: number[] = [];
        for (let yy = ly - lry; yy <= ly + lry; yy++) {
          for (let x = lx - lrx - 1; x <= lx + lrx + 1; x++) {
            if (((x - lx) / (lrx + 0.5)) ** 2 + ((yy - ly) / (lry + 0.5)) ** 2 > 1) continue;
            const i = yy * W + x;
            // Never over the middle of the start, the exit or the arena, nor where the boss stands
            // (indoors those aren't paved, so the path doesn't keep the water off them).
            if (dryAt(x, yy)) continue;
            if (m.tiles[i] === FLOOR && !m.path[i]) {
              m.tiles[i] = LIQUID;
              changed.push(i);
            }
          }
        }
        // (Nor leaving a squeeze between the water and a wall.)
        if (changed.length && (narrowGap(m, changed) || !connected())) for (const i of changed) m.tiles[i] = FLOOR;
      }
    }
  }

  // --- props
  const propRng = rng.fork(1);
  const occupied = new Set<number>();
  // (An arena's boss stands three tiles above the middle, and is wide: its row and the tiles either side stay clear too.)
  const nearCenter = (x: number, yy: number) =>
    byDoor(x, yy) ||
    rooms.some((r) => (r.kind === 'start' || r.kind === 'exit' || r.kind === 'arena') && Math.abs(x - r.cx) <= 2 && (Math.abs(yy - r.cy) <= 2 || (r.kind === 'arena' && yy >= r.cy - 4 && yy < r.cy)));
  const floorTiles: number[] = [];
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === FLOOR) floorTiles.push(i);
  // Wall torches over room walls (rooms layout): on solid tiles with floor right below.
  const lightsWanted = biome.layout === 'rooms' || biome.solid.kind === 'cliff';
  if (lightsWanted) {
    for (let yy = 1; yy < H - 1; yy++) {
      for (let x = 1; x < W - 1; x++) {
        if (m.tiles[yy * W + x] !== SOLID || m.tiles[(yy + 1) * W + x] !== FLOOR) continue;
        if (m.tiles[yy * W + x - 1] !== SOLID || m.tiles[yy * W + x + 1] !== SOLID) continue;
        if ((x * 7 + yy * 13) % 9 !== 0 || !propRng.chance(0.55)) continue;
        if (Math.abs(x - door.tx) <= 2 && yy >= door.ty - 4 && yy <= door.ty) continue;
        m.props.push({ kind: 'torch', x: x * TILE + 8, y: yy * TILE + 15, solid: false, seed: propRng.int(0, 1 << 30), edge: true });
      }
    }
  }
  // Room props: trees, rocks, barrels... standing on the floor.
  const weights = biome.props;
  const decor: PropKind[] = ['flowers', 'bones', 'mushroomSmall', 'reeds', 'skull', 'wheat', 'cabbage', 'sunflower', 'fern'];
  const blocking = (k: PropKind) => !decor.includes(k) && k !== 'torch';
  // Houses, yards, lamps, squares and set pieces (decor.ts).
  dressFloor({ m, biome, rng: new Rng(Rng.hashSeed(opts.seed ^ Math.imul(floor, 40503) ^ 0xdec0)), rooms, occupied, nearCenter, connected });
  // The woods (forest.ts): clumps of trees on the solid ground, clear of the lots and buildings decor reserved.
  buildTiers(m, biome);
  if (biome.solid.kind === 'trees') for (const t of placeTrees(m, biome, propRng.fork(7))) m.props.push(t);
  standOnRelief(m, biome);
  if (biome.fields) plantFields(m, biome, rooms, propRng.fork(3), occupied, nearCenter, connected);
  for (const r of rooms) {
    if (r.kind === 'start') continue;
    const area = r.rx * r.ry;
    const n = Math.round(area * (r.kind === 'arena' ? 0.06 : 0.12)) + propRng.int(0, 2);
    for (let k = 0; k < n; k++) {
      const x = r.cx + propRng.int(-r.rx, r.rx);
      const yy = r.cy + propRng.int(-r.ry, r.ry);
      const i = yy * W + x;
      if (tileAt(m, x, yy) !== FLOOR || occupied.has(i) || nearCenter(x, yy) || m.field?.[i]) continue;
      const useTree = biome.trees.length > 0 && propRng.chance(0.14);
      const kind: PropKind | 'tree' = useTree ? 'tree' : propRng.weighted(weights);
      const solid = kind === 'tree' || blocking(kind as PropKind);
      // Solid props (and tall sunflowers) stay off the paths, and never cut the floor in two.
      if ((solid || kind === 'sunflower') && m.path[i]) continue;
      if (solid) {
        if (squeezes(m, x, yy)) continue;
        m.tiles[i] = BLOCKED;
        if (!connected(i)) {
          m.tiles[i] = FLOOR;
          continue;
        }
      }
      occupied.add(i);
      m.props.push({
        kind,
        ...(kind === 'tree' ? roomTree(biome, propRng) : {}),
        x: x * TILE + 8 + (solid ? 0 : propRng.int(-4, 4)),
        y: yy * TILE + (solid ? 13 : 8 + propRng.int(-3, 5)),
        solid,
        seed: propRng.int(0, 1 << 30),
      });
    }
  }
  // Scatter little decor on open floor everywhere.
  for (const i of floorTiles) {
    if (m.tiles[i] !== FLOOR || occupied.has(i) || m.field?.[i] || !propRng.chance(0.05)) continue;
    const pick = biome.props.filter(([k]) => decor.includes(k) && !(k === 'sunflower' && m.path[i]));
    if (!pick.length) break;
    const x = i % W;
    const yy = (i / W) | 0;
    m.props.push({ kind: propRng.weighted(pick), x: x * TILE + 8 + propRng.int(-5, 5), y: yy * TILE + 8 + propRng.int(-4, 5), solid: false, seed: propRng.int(0, 1 << 30) });
  }

  // --- spawns
  const spawnRng = rng.fork(2);
  const trapped = trapTiles(m);
  rooms.forEach((r, ri) => {
    if (r.kind === 'start' || r.quiet) return;
    if (r.kind === 'arena') {
      // Three tiles above the middle, unless a prop took that tile: then just inside the clear middle.
      const by = tileAt(m, r.cx, r.cy - 3) === FLOOR ? r.cy - 3 : r.cy - 2;
      m.spawns.push({ x: r.cx * TILE + 8, y: by * TILE + 8, room: ri, elite: false, boss: true });
      return;
    }
    const pack = Math.min(9, 3 + Math.floor(floor / 6) + spawnRng.int(0, 2) + (r.kind === 'side' ? -1 : 0));
    const eliteChance = Math.min(0.3, 0.08 + floor * 0.006);
    for (let k = 0; k < pack; k++) {
      for (let tries = 0; tries < 12; tries++) {
        const x = r.cx + spawnRng.int(-r.rx + 1, r.rx - 1);
        const yy = r.cy + spawnRng.int(-r.ry + 1, r.ry - 1);
        if (tileAt(m, x, yy) !== FLOOR || trapped.has(yy * m.w + x)) continue;
        // Never close enough to the start to wake as the squad arrives.
        if (Math.hypot(x - start.cx, yy - start.cy) < 8) continue;
        m.spawns.push({ x: x * TILE + 8, y: yy * TILE + 8, room: ri, elite: spawnRng.chance(eliteChance), boss: false });
        break;
      }
    }
  });

  m.start = { x: start.cx * TILE + 8, y: start.cy * TILE + 8 };
  return m;
}

/**
 * Where the way down's archway stands: three tiles wide, its doorway the middle one (the exit), with
 * open floor in front for its steps. Best against the back wall of the exit room (the arena's far wall
 * on a boss floor, well clear of where the boss stands); else anywhere along the room's top half. Its
 * pillars block, and so does the tile behind the doorway, so you walk into the doorway and stop; a
 * block that would cut the floor in two stays open. With nowhere that fits, the doorway is just
 * above the room's middle.
 */
function placeDoor(m: FloorMap, room: Room, boss: boolean, whole: () => boolean): { tx: number; ty: number } {
  const open = (x: number, y: number) => tileAt(m, x, y) === FLOOR;
  const fits = (x: number, y: number) => [-1, 0, 1].every((d) => open(x + d, y) && open(x + d, y + 1));
  const backed = (x: number, y: number) => [-1, 0, 1].every((d) => !open(x + d, y - 1));
  const lo = room.cy - room.ry - 2;
  const hi = boss ? room.cy - 6 : room.cy - 1;
  let at: { tx: number; ty: number } | null = null;
  for (const needBack of [true, false]) {
    for (const dx of [0, -1, 1, -2, 2, -3, 3]) {
      for (let y = lo; y <= hi && !at; y++) if (fits(room.cx + dx, y) && (!needBack || backed(room.cx + dx, y))) at = { tx: room.cx + dx, ty: y };
      if (at) break;
    }
    if (at) break;
  }
  at ??= { tx: room.cx, ty: room.cy - (boss ? 0 : 1) };
  const block = (x: number, y: number) => {
    const i = y * m.w + x;
    if (m.tiles[i] !== FLOOR) return;
    m.tiles[i] = BLOCKED;
    if (!whole()) m.tiles[i] = FLOOR;
  };
  block(at.tx - 1, at.ty);
  block(at.tx + 1, at.ty);
  block(at.tx, at.ty - 1);
  return at;
}

/**
 * The farm's fields: in each room off the tracks, a rectangle or two of plowed soil with a crop
 * planted along its furrows (cabbages, wheat, a pumpkin patch, or only seedlings), and along the back
 * a fence (never one that cuts the floor in two) or a row of sunflowers. Crops don't block walking.
 */
function plantFields(m: FloorMap, biome: Biome, rooms: Room[], rng: Rng, occupied: Set<number>, nearCenter: (x: number, y: number) => boolean, connected: (closed?: number) => boolean): void {
  const W = m.w;
  const field = new Uint8Array(m.w * m.h);
  m.field = field;
  const crops = biome.fields!.crops;
  const add = (kind: PropKind, x: number, y: number) => m.props.push({ kind, x: Math.round(x), y: Math.round(y), solid: false, seed: rng.int(0, 1 << 30) });
  for (const r of rooms) {
    if (r.kind === 'start') continue;
    const want = r.kind === 'side' ? 1 : r.rx * r.ry >= 30 ? 2 : 1;
    for (let f = 0; f < want; f++) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const fw = rng.int(3, 6);
        const fh = rng.int(2, 3);
        const x0 = r.cx + rng.int(-r.rx, r.rx - fw + 1);
        const y0 = r.cy + rng.int(-r.ry, r.ry - fh + 1);
        let ok = true;
        // The whole rectangle on open, unpaved floor, with a strip of grass round it.
        for (let yy = y0 - 1; yy <= y0 + fh && ok; yy++) {
          for (let x = x0 - 1; x <= x0 + fw && ok; x++) {
            const inside = yy >= y0 && yy < y0 + fh && x >= x0 && x < x0 + fw;
            if (x < 0 || yy < 0 || x >= W || yy >= m.h) ok = false;
            else if (field[yy * W + x]) ok = false;
            else if (inside && (tileAt(m, x, yy) !== FLOOR || m.path[yy * W + x] || occupied.has(yy * W + x) || nearCenter(x, yy))) ok = false;
          }
        }
        if (!ok) continue;
        const crop = rng.weighted(crops);
        const ns = rng.chance(0.3);
        const val = (ns ? 2 : 1) | (crop === 'sprouts' || crop === 'pumpkin' ? 4 : 0);
        for (let yy = y0; yy < y0 + fh; yy++) {
          for (let x = x0; x < x0 + fw; x++) {
            field[yy * W + x] = val;
            occupied.add(yy * W + x);
          }
        }
        // Crops stand on the ridges (a ridge every 8 px; a plant's base sits on its lower half).
        if (crop !== 'sprouts') {
          const step = crop === 'cabbage' ? 13 : crop === 'wheat' ? 6 : 13;
          const px0 = x0 * TILE;
          const py0 = y0 * TILE;
          const pw = fw * TILE;
          const ph = fh * TILE;
          const lines = ns ? pw / 8 : ph / 8;
          for (let l = 0; l < lines; l++) {
            // Cabbages are wide: one on every other ridge, so the soil shows between the rows.
            if (crop === 'cabbage' && l % 2) continue;
            const across = l * 8 + (ns ? 3 : 4);
            const len = ns ? ph : pw;
            // Wheat stands thick; cabbages and pumpkins in staggered rows with soil showing between.
            const off = crop === 'wheat' ? 3 : 6 + ((crop === 'cabbage' ? l >> 1 : l) % 2) * Math.floor(step / 2);
            for (let a = off; a <= len - 4; a += step) {
              if (crop === 'pumpkin' && !rng.chance(0.55)) continue;
              const j = rng.int(-1, 1);
              if (ns) add(crop, px0 + across, py0 + a + j);
              else add(crop, px0 + a + j, py0 + across);
            }
          }
        }
        // Along the back: a fence, or sunflowers, or nothing.
        const back = rng.weighted([['fence', 5], ['sunflower', 3], ['none', 3]] as const);
        if (back !== 'none') {
          const yy = y0 - 1;
          for (let x = x0; x < x0 + fw; x++) {
            const i = yy * W + x;
            if (tileAt(m, x, yy) !== FLOOR || m.path[i] || occupied.has(i) || nearCenter(x, yy)) continue;
            if (back === 'fence') {
              if (squeezes(m, x, yy)) continue;
              m.tiles[i] = BLOCKED;
              if (!connected(i)) {
                m.tiles[i] = FLOOR;
                continue;
              }
              m.props.push({ kind: 'fence', x: x * TILE + 8, y: yy * TILE + 13, solid: true, seed: rng.int(0, 1 << 30) });
            } else {
              add('sunflower', x * TILE + 4 + rng.int(0, 1), yy * TILE + 13);
              add('sunflower', x * TILE + 12 + rng.int(-1, 0), yy * TILE + 12);
            }
            occupied.add(i);
          }
        }
        break;
      }
    }
  }
}

/**
 * The camp: a clearing in the woods with a campfire in the middle, the squad's tents, a well, a cart,
 * lanterns, and the glowing gate to the dungeon at the top of the path. No mobs.
 */
export function campMap(): FloorMap {
  const W = 30;
  const H = 24;
  const m: FloorMap = { w: W, h: H, tiles: new Uint8Array(W * H), path: new Uint8Array(W * H), rooms: [], start: { x: 0, y: 0 }, exit: { x: 0, y: 0 }, props: [], spawns: [], seed: 4242 };
  const rng = new Rng(4242);
  const cx = 15;
  const cy = 13;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = Math.atan2(y - cy, x - cx);
      const wob = 1 + 0.1 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 5);
      const inClearing = ((x - cx) / 10) ** 2 + ((y - cy) / 7.5) ** 2 <= wob * wob;
      // The path north to the gate.
      const inPath = Math.abs(x - cx) <= 1 && y >= 2 && y < cy;
      if (inClearing || inPath) m.tiles[y * W + x] = FLOOR;
      // The cobbled plaza round the fire and the path.
      if (((x - cx) / 3.6) ** 2 + ((y - cy) / 2.8) ** 2 <= 1.1 || (inPath && Math.abs(x - cx) <= 1)) m.path[y * W + x] = 1;
    }
  }
  m.rooms = [{ cx, cy, rx: 10, ry: 7, kind: 'start' }];
  const at = (tx: number, ty: number) => ({ x: tx * TILE + 8, y: ty * TILE + 13 });
  const add = (kind: Prop['kind'], tx: number, ty: number, solid = true, extra: Partial<Prop> = {}) => {
    const p = at(tx, ty);
    if (solid) m.tiles[ty * W + tx] = BLOCKED;
    m.props.push({ kind, x: p.x, y: p.y, solid, seed: rng.int(0, 1 << 30), ...extra });
  };
  add('campfire', cx, cy);
  add('tent', cx - 6, cy - 3);
  add('tent', cx + 6, cy - 3);
  add('well', cx - 7, cy + 3);
  add('cart', cx + 7, cy + 3);
  add('barrel', cx + 9, cy + 2);
  add('crate', cx + 9, cy + 4);
  add('barrel', cx - 9, cy - 1);
  add('lantern', cx - 2, cy - 5, false);
  add('lantern', cx + 3, cy - 5, false);
  add('lantern', cx - 4, cy + 5, false);
  add('lantern', cx + 5, cy + 5, false);
  add('banner', cx - 2, 4, false);
  add('banner', cx + 2, 4, false);
  add('stump', cx - 4, cy + 2);
  add('stump', cx + 4, cy + 2);
  for (let i = 0; i < 18; i++) {
    const x = rng.int(cx - 9, cx + 9);
    const y = rng.int(cy - 6, cy + 6);
    if (m.tiles[y * W + x] !== FLOOR || m.path[y * W + x]) continue;
    m.props.push({ kind: rng.chance(0.6) ? 'flowers' : 'mushroomSmall', ...at(x, y), y: y * TILE + 8, solid: false, seed: rng.int(0, 1 << 30) });
  }
  // The woods all round.
  for (const t of placeTrees(m, BIOMES.hamlet, rng)) m.props.push(t);
  m.props.sort((a, b) => a.y - b.y);
  m.start = { x: cx * TILE + 8, y: (cy + 2) * TILE + 8 };
  m.exit = { x: cx * TILE + 8, y: 3 * TILE + 8 };
  return m;
}
