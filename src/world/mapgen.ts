/**
 * Procedural floors. A floor is a chain of rooms from the start (bottom) to the exit (top), with a
 * side room or two, joined by corridors. Cave biomes get blobby rooms and winding passages smoothed
 * by a cellular pass; crypts and lava caves get rectangular rooms and straight halls. Then pools,
 * paths, props and lights, and the mob packs. Every floor is checked to be fully connected.
 */
import { Rng } from '../core/rng';
import type { Biome, PropKind, TreeKind } from './biomes';

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
      rx = cave ? rng.int(5, 8) : rng.int(4, 7);
      ry = cave ? rng.int(4, 6) : rng.int(4, 5);
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
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) set(x + ox, yy + oy, FLOOR);
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
      const pr = Math.max(2, Math.min(r.rx, r.ry) - 1);
      for (let yy = r.cy - pr; yy <= r.cy + pr; yy++) {
        for (let x = r.cx - pr - 1; x <= r.cx + pr + 1; x++) {
          if (((x - r.cx) / (pr + 1)) ** 2 + ((yy - r.cy) / pr) ** 2 <= 1 + rng.next() * 0.3) markPath(x, yy);
        }
      }
    }
  }
  if (!cave) {
    // Crypt-style floors: every room is paved; halls stay the darker material.
    for (let i = 0; i < m.path.length; i++) m.path[i] = m.path[i] ? 0 : 1;
  }

  // --- pools (never cutting the floor in two)
  const total = () => countFloor(m);
  if (biome.liquid) {
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
  const solidNextToFloor = (x: number, yy: number) => {
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (tileAt(m, x + ox, yy + oy) === FLOOR) return true;
    return false;
  };
  // The forest wall: trees on solid ground near the floor (denser at the edge).
  if (biome.solid.kind === 'trees') {
    const kinds = biome.solid.trees ?? biome.trees;
    for (let yy = 0; yy < H; yy++) {
      for (let x = 0; x < W; x++) {
        if (m.tiles[yy * W + x] !== SOLID) continue;
        const edge = solidNextToFloor(x, yy);
        if (!edge && !propRng.chance(0.18)) continue;
        if (!edge && (x + yy) % 2 === 1) continue;
        m.props.push({
          kind: 'tree',
          tree: propRng.pick(kinds),
          x: x * TILE + 8 + propRng.int(-4, 4),
          y: yy * TILE + 14 + propRng.int(-3, 2),
          solid: true,
          seed: propRng.int(0, 1 << 30),
          edge: true,
        });
      }
    }
  }
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
  const decor: PropKind[] = ['flowers', 'bones', 'mushroomSmall', 'reeds', 'skull'];
  const blocking = (k: PropKind) => !decor.includes(k) && k !== 'torch';
  for (const r of rooms) {
    if (r.kind === 'start') continue;
    const area = r.rx * r.ry;
    const n = Math.round(area * (r.kind === 'arena' ? 0.06 : 0.12)) + propRng.int(0, 2);
    for (let k = 0; k < n; k++) {
      const x = r.cx + propRng.int(-r.rx, r.rx);
      const yy = r.cy + propRng.int(-r.ry, r.ry);
      const i = yy * W + x;
      if (tileAt(m, x, yy) !== FLOOR || occupied.has(i) || nearCenter(x, yy)) continue;
      const useTree = biome.trees.length > 0 && propRng.chance(0.28);
      const kind: PropKind | 'tree' = useTree ? 'tree' : propRng.weighted(weights);
      const solid = kind === 'tree' || blocking(kind as PropKind);
      // Solid props stay off the paths and never cut the floor in two.
      if (solid && m.path[i]) continue;
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
        tree: kind === 'tree' ? propRng.pick(biome.trees) : undefined,
        x: x * TILE + 8 + (solid ? 0 : propRng.int(-4, 4)),
        y: yy * TILE + (solid ? 13 : 8 + propRng.int(-3, 5)),
        solid,
        seed: propRng.int(0, 1 << 30),
      });
    }
  }
  // Scatter little decor on open floor everywhere.
  for (const i of floorTiles) {
    if (m.tiles[i] !== FLOOR || occupied.has(i) || !propRng.chance(0.05)) continue;
    const pick = biome.props.filter(([k]) => decor.includes(k));
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
