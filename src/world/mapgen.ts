/**
 * Procedural floors. A floor is a chain of rooms from the start (bottom) to the exit (top), with a
 * side room or two, joined by corridors. Cave biomes get blobby rooms and winding passages smoothed
 * by a cellular pass; crypts and lava caves get rectangular rooms and straight halls. Then pools,
 * paths, the farm's crop fields, props and lights, and the mob packs. Every floor is checked to be
 * fully connected.
 */
import { Rng } from '../core/rng';
import { BIOMES, type Biome, type PropKind, type TreeKind } from './biomes';
import { dressFloor } from './decor';
import { placeTrees, roomTree, type TreeSize } from './forest';

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
  /** Water falling over a ledge's face into a pool (world pixels: its left, top, width, height). */
  waterfalls?: Array<{ x: number; y: number; w: number; h: number }>;
  rooms: Room[];
  start: { x: number; y: number };
  exit: { x: number; y: number };
  props: Prop[];
  spawns: Spawn[];
  seed: number;
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

/** Breadth-first distances (in tiles) from (sx, sy) over walkable tiles; -1 unreachable. */
export function bfs(m: FloorMap, sx: number, sy: number, passable: (t: number) => boolean = (t) => t === FLOOR): Int32Array {
  const dist = new Int32Array(m.w * m.h).fill(-1);
  if (!passable(tileAt(m, sx, sy))) return dist;
  const q = new Int32Array(m.w * m.h);
  let head = 0;
  let tail = 0;
  const s = idx(m, sx, sy);
  dist[s] = 0;
  q[tail++] = s;
  while (head < tail) {
    const c = q[head++];
    const cx = c % m.w;
    const cy = (c / m.w) | 0;
    const d = dist[c] + 1;
    if (cx > 0) visit(c - 1);
    if (cx < m.w - 1) visit(c + 1);
    if (cy > 0) visit(c - m.w);
    if (cy < m.h - 1) visit(c + m.w);
    function visit(n: number) {
      if (dist[n] >= 0 || !passable(m.tiles[n])) return;
      dist[n] = d;
      q[tail++] = n;
    }
  }
  return dist;
}

function countReach(m: FloorMap, sx: number, sy: number): number {
  let n = 0;
  const d = bfs(m, sx, sy);
  for (let i = 0; i < d.length; i++) if (d[i] >= 0) n++;
  return n;
}

function countFloor(m: FloorMap): number {
  let n = 0;
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === FLOOR) n++;
  return n;
}

export interface GenOptions {
  floor: number;
  biome: Biome;
  seed: number;
  boss: boolean;
}

export function generateFloor(opts: GenOptions): FloorMap {
  const { biome, boss, floor } = opts;
  const rng = new Rng(Rng.hashSeed(opts.seed ^ (floor * 2654435761)));
  const cave = biome.layout === 'cave';
  const W = 46;
  const margin = 4;
  // --- rooms, top (exit) to bottom (start)
  const main: Room[] = [];
  const nMain = boss ? 2 : 5 + Math.min(3, Math.floor(floor / 10)) + rng.int(0, 1);
  let y = margin + 2;
  let px = W / 2;
  for (let i = 0; i < nMain; i++) {
    const kind: Room['kind'] = i === 0 ? (boss ? 'arena' : 'exit') : i === nMain - 1 ? 'start' : 'normal';
    let rx: number;
    let ry: number;
    if (kind === 'arena') {
      rx = 11;
      ry = 9;
    } else if (kind === 'start') {
      rx = cave ? 4 : 5;
      ry = cave ? 3 : 4;
    } else {
      rx = cave ? rng.int(6, 9) : rng.int(4, 7);
      ry = cave ? rng.int(5, 7) : rng.int(4, 5);
    }
    const lo = margin + rx + 1;
    const hi = W - margin - rx - 2;
    const cx = Math.round(Math.max(lo, Math.min(hi, px + rng.int(-12, 12))));
    const cy = y + ry;
    main.push({ cx, cy, rx, ry, kind });
    px = cx;
    y = cy + ry + rng.int(5, 8);
  }
  const H = y + margin;
  const m: FloorMap = {
    w: W,
    h: H,
    tiles: new Uint8Array(W * H),
    path: new Uint8Array(W * H),
    rooms: [],
    start: { x: 0, y: 0 },
    exit: { x: 0, y: 0 },
    props: [],
    spawns: [],
    seed: opts.seed,
  };
  const rooms: Room[] = [...main];
  // Side rooms hang off the main chain (not on boss floors).
  const sides: Array<[Room, Room]> = [];
  if (!boss) {
    const nSide = rng.int(1, 2);
    for (let k = 0; k < nSide; k++) {
      const parent = main[rng.int(1, main.length - 2)];
      const dir = parent.cx < W / 2 ? 1 : -1;
      const rx = cave ? rng.int(3, 5) : rng.int(3, 4);
      const ry = cave ? rng.int(3, 4) : 3;
      const cx = Math.max(margin + rx + 1, Math.min(W - margin - rx - 2, parent.cx + dir * rng.int(13, 17)));
      const side: Room = { cx, cy: parent.cy + rng.int(-2, 2), rx, ry, kind: 'side' };
      rooms.push(side);
      sides.push([parent, side]);
    }
  }
  m.rooms = rooms;

  const set = (x: number, yy: number, v: number) => {
    if (x < 2 || yy < 2 || x >= W - 2 || yy >= H - 2) return;
    m.tiles[yy * W + x] = v;
  };
  const markPath = (x: number, yy: number) => {
    if (x < 0 || yy < 0 || x >= W || yy >= H) return;
    m.path[yy * W + x] = 1;
  };

  // --- carve rooms
  for (const r of rooms) {
    if (cave) {
      // A blob: two or three overlapping ellipses with a wobbly edge.
      const blobs = [{ x: r.cx, y: r.cy, rx: r.rx, ry: r.ry }];
      if (r.kind !== 'start') {
        for (let b = 0; b < rng.int(1, 2); b++) {
          blobs.push({ x: r.cx + rng.int(-r.rx + 2, r.rx - 2), y: r.cy + rng.int(-1, 1), rx: Math.max(2, r.rx - rng.int(1, 3)), ry: Math.max(2, r.ry - rng.int(0, 2)) });
        }
      }
      const phase = rng.next() * Math.PI * 2;
      for (let yy = r.cy - r.ry - 3; yy <= r.cy + r.ry + 3; yy++) {
        for (let x = r.cx - r.rx - 4; x <= r.cx + r.rx + 4; x++) {
          for (const b of blobs) {
            const a = Math.atan2(yy - b.y, x - b.x);
            const wob = 1 + 0.16 * Math.sin(a * 3 + phase) + 0.08 * Math.sin(a * 5 + phase * 2);
            const d = ((x - b.x) / b.rx) ** 2 + ((yy - b.y) / b.ry) ** 2;
            if (d <= wob * wob) {
              set(x, yy, FLOOR);
              break;
            }
          }
        }
      }
    } else {
      for (let yy = r.cy - r.ry; yy <= r.cy + r.ry; yy++) for (let x = r.cx - r.rx; x <= r.cx + r.rx; x++) set(x, yy, FLOOR);
    }
  }

  // --- corridors
  const corridor = (a: Room, b: Room) => {
    if (cave) {
      // A wandering passage, 3 wide, with a cobbled (path) middle.
      let x = a.cx;
      let yy = a.cy;
      let guard = 0;
      while ((Math.abs(x - b.cx) > 0 || Math.abs(yy - b.cy) > 0) && guard++ < 400) {
        const dx = Math.sign(b.cx - x);
        const dy = Math.sign(b.cy - yy);
        if (dx !== 0 && (dy === 0 || rng.chance(Math.abs(b.cx - x) / (Math.abs(b.cx - x) + Math.abs(b.cy - yy) + 1)))) x += dx;
        else yy += dy;
        if (rng.chance(0.08)) x += rng.pick([-1, 1]);
        x = Math.max(3, Math.min(W - 4, x));
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 2; ox++) set(x + ox, yy + oy, FLOOR);
        markPath(x, yy);
        if (rng.chance(0.5)) markPath(x + rng.pick([-1, 1]), yy);
      }
    } else {
      // An L-shaped hall, 3 wide.
      const bend = rng.chance(0.5);
      const hx = (x0: number, x1: number, yy: number) => {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          for (let o = -1; o <= 1; o++) set(x, yy + o, FLOOR);
          markPath(x, yy);
        }
      };
      const vy = (y0: number, y1: number, x: number) => {
        for (let yy = Math.min(y0, y1); yy <= Math.max(y0, y1); yy++) {
          for (let o = -1; o <= 1; o++) set(x + o, yy, FLOOR);
          markPath(x, yy);
        }
      };
      if (bend) {
        hx(a.cx, b.cx, a.cy);
        vy(a.cy, b.cy, b.cx);
      } else {
        vy(a.cy, b.cy, a.cx);
        hx(a.cx, b.cx, b.cy);
      }
    }
  };
  for (let i = 0; i < main.length - 1; i++) corridor(main[i], main[i + 1]);
  for (const [p, s] of sides) corridor(p, s);

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
  const start = main[main.length - 1];
  const exit = main[0];
  // Room centers are always open.
  for (const r of [start, exit]) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) set(r.cx + ox, r.cy + oy, FLOOR);
  const reach = bfs(m, start.cx, start.cy);
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === FLOOR && reach[i] < 0) m.tiles[i] = SOLID;

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
  const total = () => countFloor(m);
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
            if (m.tiles[i] === FLOOR && !m.path[i]) {
              m.tiles[i] = LIQUID;
              changed.push(i);
            }
          }
        }
        if (changed.length && countReach(m, start.cx, start.cy) !== total()) for (const i of changed) m.tiles[i] = FLOOR;
      }
    }
  }

  // --- props
  const propRng = rng.fork(1);
  const occupied = new Set<number>();
  const nearCenter = (x: number, yy: number) => rooms.some((r) => (r.kind === 'start' || r.kind === 'exit' || r.kind === 'arena') && Math.abs(x - r.cx) <= 2 && Math.abs(yy - r.cy) <= 2);
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
        m.props.push({ kind: 'torch', x: x * TILE + 8, y: yy * TILE + 15, solid: false, seed: propRng.int(0, 1 << 30), edge: true });
      }
    }
  }
  // Room props: trees, rocks, barrels... standing on the floor.
  const weights = biome.props;
  const decor: PropKind[] = ['flowers', 'bones', 'mushroomSmall', 'reeds', 'skull', 'wheat', 'cabbage', 'sunflower', 'fern'];
  const blocking = (k: PropKind) => !decor.includes(k) && k !== 'torch';
  // Houses, yards, lamps, squares and set pieces (decor.ts).
  dressFloor({ m, biome, rng: new Rng(Rng.hashSeed(opts.seed ^ Math.imul(floor, 40503) ^ 0xdec0)), rooms, occupied, nearCenter, connected: () => countReach(m, start.cx, start.cy) === total() });
  // The woods (forest.ts): clumps of trees on the solid ground, clear of the lots and buildings decor reserved.
  if (biome.solid.kind === 'trees') for (const t of placeTrees(m, biome, propRng.fork(7))) m.props.push(t);
  if (biome.fields) plantFields(m, biome, rooms, propRng.fork(3), occupied, nearCenter, () => countReach(m, start.cx, start.cy) === total());
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
        m.tiles[i] = BLOCKED;
        if (countReach(m, start.cx, start.cy) !== total()) {
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
  // Lanterns by the exit.
  m.props.push({ kind: biome.id === 'shrine' ? 'stoneLantern' : biome.layout === 'rooms' ? 'brazier' : 'lantern', x: exit.cx * TILE - 24, y: exit.cy * TILE + 4, solid: false, seed: 1 });
  m.props.push({ kind: biome.id === 'shrine' ? 'stoneLantern' : biome.layout === 'rooms' ? 'brazier' : 'lantern', x: exit.cx * TILE + 40, y: exit.cy * TILE + 4, solid: false, seed: 2 });

  // --- spawns
  const spawnRng = rng.fork(2);
  rooms.forEach((r, ri) => {
    if (r.kind === 'start') return;
    if (r.kind === 'arena') {
      m.spawns.push({ x: r.cx * TILE + 8, y: (r.cy - 3) * TILE + 8, room: ri, elite: false, boss: true });
      return;
    }
    const pack = Math.min(9, 3 + Math.floor(floor / 6) + spawnRng.int(0, 2) + (r.kind === 'side' ? -1 : 0));
    const eliteChance = Math.min(0.3, 0.08 + floor * 0.006);
    for (let k = 0; k < pack; k++) {
      for (let tries = 0; tries < 12; tries++) {
        const x = r.cx + spawnRng.int(-r.rx + 1, r.rx - 1);
        const yy = r.cy + spawnRng.int(-r.ry + 1, r.ry - 1);
        if (tileAt(m, x, yy) !== FLOOR) continue;
        m.spawns.push({ x: x * TILE + 8, y: yy * TILE + 8, room: ri, elite: spawnRng.chance(eliteChance), boss: false });
        break;
      }
    }
  });

  m.start = { x: start.cx * TILE + 8, y: start.cy * TILE + 8 };
  m.exit = { x: exit.cx * TILE + 8, y: (exit.cy - (boss ? 0 : 1)) * TILE + 8 };
  return m;
}

/**
 * The farm's fields: in each room off the tracks, a rectangle or two of plowed soil with a crop
 * planted along its furrows (cabbages, wheat, a pumpkin patch, or only seedlings), and along the back
 * a fence (never one that cuts the floor in two) or a row of sunflowers. Crops don't block walking.
 */
function plantFields(m: FloorMap, biome: Biome, rooms: Room[], rng: Rng, occupied: Set<number>, nearCenter: (x: number, y: number) => boolean, connected: () => boolean): void {
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
              m.tiles[i] = BLOCKED;
              if (!connected()) {
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
