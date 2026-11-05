/**
 * Dressing a floor so it looks like a place. The hamlet becomes a town: its floor all cobbled
 * streets, the walls around them bright lots behind stone curbs, with half-timbered houses fronting
 * the streets (standing in the lots, so they never block the way), picket fences and hedges along the
 * lots with gates and flowers, a market square (striped stalls, a fountain with planters, strings of
 * lights between posts, café tables), lamp posts along the curbs, a well, benches and barrels, sign
 * posts, and a canal through the lots under a plank bridge. The other biomes get their wilds
 * (WILDS): ruins in the walls, lights along the paths, strings of lights across the narrows, a camp,
 * a ring of something in a quiet room, fences, waterfalls from the ledges into pools, stairs.
 * Everything solid that lands on the floor is checked never to cut the floor in two.
 *
 * Runs after the trees are placed: anything that needs room (a house, a ruin, a canal, a fence)
 * clears the trees in its way and marks its ground in `m.reserved`, so a tree placer that runs later
 * can keep off it too.
 */
import { Rng } from '../core/rng';
import type { Biome, PropKind } from './biomes';
import { BLOCKED, FLOOR, SOLID, TILE, tileAt, type FloorMap, type Room } from './mapgen';
import { dressDungeon } from './dungeonDecor';
import { CRYPT_TRAPS, placeTraps } from './traps';

export interface DecorCtx {
  m: FloorMap;
  biome: Biome;
  rng: Rng;
  rooms: Room[];
  occupied: Set<number>;
  /** Near a start, exit or arena middle (kept clear). */
  nearCenter(x: number, y: number): boolean;
  /** Is all the floor still reachable from the start? */
  connected(): boolean;
}

export interface HouseLayout {
  /** Width in tiles (its front spans this many tiles). */
  tiles: 4 | 5;
  storeys: 1 | 2;
  /** The door's middle, in pixels from the front's left edge. */
  door: number;
  roof: 'terracotta' | 'brick' | 'slate' | 'thatch';
  /** Picks shutter and flower colors. */
  tint: number;
  /** The chimney's middle, in pixels from the front's left edge. */
  chimney: number;
}

/** A house's shape from its variant (its seed % 5): three narrow houses and two wide ones. */
export function houseLayout(variant: number): HouseLayout {
  const v = ((variant % 5) + 5) % 5;
  const tiles = v < 3 ? 4 : 5;
  const W = tiles * 16;
  const storeys: 1 | 2 = v === 2 ? 1 : 2;
  const door = [Math.round(W * 0.3), Math.round(W * 0.68), Math.round(W * 0.5), Math.round(W * 0.38), Math.round(W * 0.62)][v];
  const roof = (['terracotta', 'brick', 'thatch', 'terracotta', 'slate'] as const)[v];
  return { tiles, storeys, door, roof, tint: v, chimney: v % 2 ? Math.round(W * 0.22) : Math.round(W * 0.74) };
}

export function dressFloor(c: DecorCtx): void {
  if (c.biome.solid.ledge) standOnLedges(c.m);
  if (c.biome.id === 'hamlet') village(c);
  else if (c.biome.id === 'dungeon') dressDungeon(c);
  else {
    const cfg = WILDS[c.biome.id];
    if (cfg) wilds(c, cfg);
    // The crypt has a few of the dungeon's traps.
    if (c.biome.id === 'crypt') placeTraps(c, CRYPT_TRAPS);
    // The farm's lots are fenced and hedged like the town's.
    if (c.biome.id === 'farmland') lotEdges(c, ['roughFence', 'roughFence', 'hedge'], null);
  }
}

// ------------------------------------------------------------------ helpers

function at(m: FloorMap, x: number, y: number): number {
  return tileAt(m, x, y);
}

export function free(c: DecorCtx, x: number, y: number): boolean {
  const i = y * c.m.w + x;
  return at(c.m, x, y) === FLOOR && !c.occupied.has(i) && !c.nearCenter(x, y) && !c.m.field?.[i];
}

/** A solid prop on a floor tile (blocking it), if that leaves every floor tile reachable. Off the
 * road (the corridors' line), unless `paved` (a town paves everything; keep off its middle line). */
export function solidProp(c: DecorCtx, kind: PropKind, x: number, y: number, dx = 0, dy = 0, seed = c.rng.int(0, 1 << 30), paved = false): boolean {
  const { m } = c;
  const i = y * m.w + x;
  if (!free(c, x, y) || (m.path[i] && !paved) || (paved && onRoute(m, x, y))) return false;
  m.tiles[i] = BLOCKED;
  if (!c.connected()) {
    m.tiles[i] = FLOOR;
    return false;
  }
  c.occupied.add(i);
  m.props.push({ kind, x: x * TILE + 8 + dx, y: y * TILE + 13 + dy, solid: true, seed });
  return true;
}

/** The street's middle line (the corridors' path before it was widened): kept clear. */
function onRoute(m: FloorMap, x: number, y: number): boolean {
  return !!m.route?.[y * m.w + x];
}

/** Several props sharing one blocked tile (a heap of barrels and a crate). */
export function cluster(c: DecorCtx, x: number, y: number, kinds: PropKind[], paved = false): boolean {
  const { m } = c;
  const i = y * m.w + x;
  if (!free(c, x, y) || (m.path[i] && !paved) || (paved && onRoute(m, x, y))) return false;
  m.tiles[i] = BLOCKED;
  if (!c.connected()) {
    m.tiles[i] = FLOOR;
    return false;
  }
  c.occupied.add(i);
  const offs: Array<[number, number]> = [[-4, -2], [4, -1], [0, 2], [-6, 2], [6, 3]];
  kinds.forEach((kind, k) => m.props.push({ kind, x: x * TILE + 8 + offs[k][0], y: y * TILE + 11 + offs[k][1], solid: true, seed: c.rng.int(0, 1 << 30) }));
  return true;
}

function decorProp(c: DecorCtx, kind: PropKind, px: number, py: number): void {
  c.m.props.push({ kind, x: Math.round(px), y: Math.round(py), solid: false, seed: c.rng.int(0, 1 << 30) });
}

function reserve(m: FloorMap, x0: number, y0: number, x1: number, y1: number): void {
  m.reserved ??= new Uint8Array(m.w * m.h);
  for (let y = Math.max(0, y0); y <= Math.min(m.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(m.w - 1, x1); x++) m.reserved[y * m.w + x] = 1;
}

/** Drops trees standing in a rectangle of tiles (where something bigger stands now). */
function clearTrees(m: FloorMap, x0: number, y0: number, x1: number, y1: number): void {
  m.props = m.props.filter((p) => {
    if (p.kind !== 'tree') return true;
    const tx = p.x / TILE;
    const ty = (p.y - 1) / TILE;
    return !(tx >= x0 && tx < x1 + 1 && ty >= y0 && ty < y1 + 1);
  });
}

/**
 * Lots for big things standing in the walls with their fronts to a room (houses, stretches of ruined
 * wall): `tiles` wide, five tall, mostly in the solid band along a room's north edge and near the
 * road. A lot may take in a few floor tiles behind its front and straighten the row before it, as
 * long as every floor tile stays reachable. The trees in it are cleared and its ground reserved.
 */
function placeLots(c: DecorCtx, sizes: number[], max: number, gap: number): Array<{ tx: number; ty: number; tiles: number }> {
  const { m, rng } = c;
  const W = m.w;
  type Lot = { tx: number; ty: number; tiles: number; fill: number[]; clear: number[]; score: number };
  const lots: Lot[] = [];
  const roadNear = (x0: number, x1: number, y: number) => {
    for (let d = 1; d <= 4; d++) for (let x = x0 - 1; x <= x1 + 1; x++) if (m.path[(y + d) * W + x] || m.path[y * W + x - d] || m.path[y * W + x1 + d]) return 5 - d;
    return 0;
  };
  for (let ty = 7; ty < m.h - 4; ty++) {
    for (let tx = 3; tx < W - 8; tx++) {
      for (const tiles of sizes) {
        if (tx + tiles > W - 3) continue;
        const fill: number[] = [];
        const clear: number[] = [];
        let ok = true;
        let solid = 0;
        let front = 0;
        for (let x = tx; x < tx + tiles && ok; x++) {
          for (let y = ty - 4; y <= ty && ok; y++) {
            const i = y * W + x;
            const t = at(m, x, y);
            if (m.reserved?.[i]) ok = false;
            else if (t === SOLID) solid++;
            else if (t === FLOOR && !m.path[i] && !c.nearCenter(x, y)) fill.push(i);
            else ok = false;
          }
          const f = (ty + 1) * W + x;
          const ft = at(m, x, ty + 1);
          if (ft === SOLID) clear.push(f);
          else if (ft === FLOOR && !c.nearCenter(x, ty + 1)) front++;
          else ok = false;
        }
        // Mostly in the trees, with a floor (or a yard cut into the trees) before it, near the road.
        if (!ok || fill.length > 8 || solid < tiles * 3) continue;
        const road = roadNear(tx, tx + tiles - 1, ty + 1);
        if (!road && front < tiles - 1) continue;
        lots.push({ tx, ty, tiles, fill, clear, score: solid * 0.5 + road * 3 + front * 2 - clear.length - fill.length * 0.5 + rng.next() * 5 });
      }
    }
  }
  lots.sort((a, b) => b.score - a.score);
  const placed: Array<{ tx: number; ty: number; tiles: number }> = [];
  for (const s of lots) {
    if (placed.length >= max) break;
    if (s.fill.some((i) => m.tiles[i] !== FLOOR) || s.clear.some((i) => m.tiles[i] !== SOLID)) continue;
    if (s.fill.concat(s.clear).some((i) => m.reserved?.[i])) continue;
    let near = false;
    for (let y = s.ty - 4; y <= s.ty && !near; y++) for (let x = s.tx - gap; x < s.tx + s.tiles + gap && !near; x++) if (m.reserved?.[y * W + x]) near = true;
    if (near) continue;
    for (const i of s.fill) m.tiles[i] = SOLID;
    for (const i of s.clear) m.tiles[i] = FLOOR;
    if (!c.connected()) {
      for (const i of s.fill) m.tiles[i] = FLOOR;
      for (const i of s.clear) m.tiles[i] = SOLID;
      continue;
    }
    clearTrees(m, s.tx - 1, s.ty - 5, s.tx + s.tiles, s.ty + 1);
    reserve(m, s.tx, s.ty - 5, s.tx + s.tiles - 1, s.ty);
    placed.push({ tx: s.tx, ty: s.ty, tiles: s.tiles });
  }
  return placed;
}

// ------------------------------------------------------------------ the village

function village(c: DecorCtx): void {
  const { m, rng } = c;
  const W = m.w;
  // --- a canal across the town where the street narrows, a bridge carrying the street over it
  canalAndBridge(c);
  // --- houses along the north edges of the lots, near the street
  const houses: Array<{ tx: number; ty: number; tiles: number; door: number }> = [];
  for (const lot of placeLots(c, [5, 4], 12, 1)) {
    const variant = lot.tiles === 4 ? rng.int(0, 2) : rng.int(3, 4);
    const seed = rng.int(0, 1 << 24) * 5 + variant;
    const L = houseLayout(variant);
    const x = lot.tx * TILE + lot.tiles * 8;
    const y = (lot.ty + 1) * TILE - 1;
    m.props.push({ kind: 'house', x, y, solid: true, seed });
    houses.push({ ...lot, door: Math.floor((x - lot.tiles * 8 + L.door) / TILE) });
  }
  // --- each house's front: pots by the door, a thing or two beside it
  for (const h of houses) {
    const fy = h.ty + 1;
    for (let y = fy; y < fy + 2; y++) c.occupied.add(y * W + h.door);
    for (const side of [-1, 1]) if (rng.chance(0.75)) decorProp(c, 'pot', (h.door + 0.5) * TILE + side * 9, fy * TILE + 3);
    const things: PropKind[][] = [['barrel', 'barrel', 'crate'], ['bench'], ['flowerBed'], ['sack', 'barrel'], ['cafeTable'], ['barrel', 'barrel']];
    const xs: number[] = [];
    for (let x = h.tx; x < h.tx + h.tiles; x++) if (Math.abs(x - h.door) > 1) xs.push(x);
    rng.shuffle(xs);
    let n = rng.int(0, 2);
    for (const x of xs) {
      if (n <= 0) break;
      const pick = rng.pick(things);
      if (pick.length > 1 ? cluster(c, x, fy, pick, true) : solidProp(c, pick[0], x, fy, 0, -6, undefined, true)) n--;
    }
  }
  // --- fences and hedges round the lots, a gate here and there
  lotEdges(c, ['picket', 'picket', 'hedge'], 'picketSide');
  // --- the market square: stalls, a fountain, strings of lights between posts, tables
  market(c);
  // --- lamp posts along the curbs, every so often
  const lamps: Array<[number, number]> = [];
  for (let y = 2; y < m.h - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (at(m, x, y) !== FLOOR) continue;
      const curb = at(m, x - 1, y) === SOLID ? -1 : at(m, x + 1, y) === SOLID ? 1 : 0;
      if (!curb || lamps.some(([lx, ly]) => Math.abs(lx - x) + Math.abs(ly - y) < 11)) continue;
      if (solidProp(c, 'lampPost', x, y, curb * 4, -2, undefined, true)) lamps.push([x, y]);
    }
  }
  // --- the other squares: a well, benches, planters, barrels by the walls
  const squares = c.rooms.filter((r) => r.kind === 'normal' || r.kind === 'side' || r.kind === 'exit');
  rng.shuffle(squares);
  let well = false;
  for (const r of squares) {
    if (!well) {
      for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 1], [-2, 1]] as const) {
        if (solidProp(c, 'wellStone', r.cx + ox, r.cy + oy, 3, 2, undefined, true)) {
          well = true;
          break;
        }
      }
    }
    for (let k = 0; k < 6; k++) {
      const x = r.cx + rng.int(-r.rx, r.rx);
      const y = r.cy + rng.int(-r.ry, r.ry);
      // Things stand against the curbs, not in the middle of the street.
      const byWall = at(m, x - 1, y) === SOLID || at(m, x + 1, y) === SOLID || at(m, x, y - 1) === SOLID;
      if (!byWall) continue;
      const pick = rng.pick([['bench'], ['flowerBed'], ['barrel', 'barrel', 'crate'], ['crate', 'crate'], ['sack', 'barrel'], ['pot', 'pot']] as PropKind[][]);
      if (pick.length > 1) cluster(c, x, y, pick, true);
      else solidProp(c, pick[0], x, y, 0, -6, undefined, true);
    }
  }
  // --- sign posts: by the start, and by the way out
  const start = c.rooms.find((r) => r.kind === 'start');
  if (start) for (const [ox, oy] of rng.shuffle([[-3, -2], [3, -2], [-3, 1], [3, 1]] as Array<[number, number]>)) if (solidProp(c, rng.chance(0.5) ? 'signpost' : 'noticeBoard', start.cx + ox, start.cy + oy, 0, -2, undefined, true)) break;
  const exit = c.rooms.find((r) => r.kind === 'exit');
  if (exit) for (const [ox, oy] of [[-4, 1], [4, 1], [-4, -1], [4, -1]] as const) if (solidProp(c, 'signpost', exit.cx + ox, exit.cy + oy, 0, -2, undefined, true)) break;
}

/** Fences and hedges along the lots' edges where they meet the street (on the lot side of the curb),
 * with a gap for a gate now and then and flowers behind them. */
function lotEdges(c: DecorCtx, front: PropKind[], side: PropKind | null): void {
  const { m, rng } = c;
  const W = m.w;
  const lot = (x: number, y: number) => at(m, x, y) === SOLID && !m.reserved?.[y * W + x] && !m.canal?.[y * W + x];
  const street = (x: number, y: number) => at(m, x, y) !== SOLID && !m.canal?.[y * W + x];
  const marked: number[] = [];
  // Runs along the lots' south edges (the street below them): a picket fence or a hedge.
  for (let y = 2; y < m.h - 2; y++) {
    let x = 1;
    while (x < W - 1) {
      if (!(lot(x, y) && street(x, y + 1))) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < W - 1 && lot(x, y) && street(x, y + 1)) x++;
      const kind = rng.pick(front);
      const gate = x - x0 >= 4 ? x0 + rng.int(1, x - x0 - 2) : -1;
      for (let k = x0; k < x; k++) {
        if (k === gate) continue;
        m.props.push({ kind, x: k * TILE + 8, y: y * TILE + 11, solid: true, seed: rng.int(0, 1 << 30) });
        marked.push(y * W + k);
      }
    }
  }
  // The lots' north edges (the street above them): a fence along the top.
  for (let y = 2; y < m.h - 2; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!lot(x, y) || !street(x, y - 1) || street(x, y + 1)) continue;
      if (rng.chance(0.15)) continue;
      m.props.push({ kind: front[0], x: x * TILE + 8, y: y * TILE + 5, solid: true, seed: rng.int(0, 1 << 30) });
      marked.push(y * W + x);
    }
  }
  // Their sides: a fence running along beside the street.
  for (let y = 2; y < m.h - 2 && side; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!lot(x, y) || street(x, y + 1)) continue;
      const left = street(x - 1, y);
      const right = street(x + 1, y);
      if (left === right) continue;
      m.props.push({ kind: side!, x: x * TILE + (left ? 2 : 14), y: y * TILE + 15, solid: true, seed: rng.int(0, 1 << 30) });
      marked.push(y * W + x);
    }
  }
  // Trees keep off the edges.
  m.reserved ??= new Uint8Array(W * m.h);
  for (const i of marked) m.reserved[i] = 1;
  m.props = m.props.filter((p) => p.kind !== 'tree' || !marked.includes(Math.floor((p.y - 1) / TILE) * W + Math.floor(p.x / TILE)));
}

/** The market: in the biggest room, two striped stalls against its walls, a fountain in the middle
 * with planters round it, strings of lights between posts over the square, tables under umbrellas. */
function market(c: DecorCtx): void {
  const { m, rng } = c;
  const W = m.w;
  const rooms = c.rooms.filter((r) => r.kind === 'normal').sort((a, b) => b.rx * b.ry - a.rx * a.ry);
  const r = rooms[0];
  if (!r) return;
  // The fountain: three tiles by two, in the middle of the square.
  for (const [ox, oy] of [[0, 1], [0, 0], [-1, 1], [1, 1], [0, 2]] as const) {
    const x0 = r.cx + ox - 1;
    const y0 = r.cy + oy;
    const tiles: number[] = [];
    let ok = true;
    for (let y = y0; y < y0 + 2; y++) for (let x = x0; x < x0 + 3; x++) {
      if (!free(c, x, y)) ok = false;
      tiles.push(y * W + x);
    }
    if (!ok) continue;
    for (const i of tiles) m.tiles[i] = BLOCKED;
    if (!c.connected()) {
      for (const i of tiles) m.tiles[i] = FLOOR;
      continue;
    }
    for (const i of tiles) c.occupied.add(i);
    m.props.push({ kind: 'fountain', x: (x0 + 1) * TILE + 8, y: (y0 + 1) * TILE + 14, solid: true, seed: rng.int(0, 1 << 30) });
    for (const [px, py] of [[x0 - 1, y0], [x0 + 3, y0], [x0 - 1, y0 + 1], [x0 + 3, y0 + 1]] as const) if (rng.chance(0.7)) solidProp(c, 'flowerBed', px, py, 0, -4, undefined, true);
    break;
  }
  // Two stalls against the square's walls.
  let stalls = 0;
  for (let k = 0; k < 40 && stalls < 2; k++) {
    const x = r.cx + rng.int(-r.rx, r.rx - 2);
    const y = r.cy + rng.int(-r.ry, r.ry);
    const wall = at(m, x, y - 1) === SOLID || at(m, x + 1, y - 1) === SOLID;
    if (!wall || !free(c, x, y) || !free(c, x + 1, y) || !free(c, x + 2, y)) continue;
    const tiles = [y * W + x, y * W + x + 1, y * W + x + 2];
    for (const i of tiles) m.tiles[i] = BLOCKED;
    if (!c.connected()) {
      for (const i of tiles) m.tiles[i] = FLOOR;
      continue;
    }
    for (const i of tiles) c.occupied.add(i);
    m.props.push({ kind: 'stall', x: (x + 1) * TILE + 8, y: y * TILE + 14, solid: true, seed: rng.int(0, 1 << 30) });
    stalls++;
  }
  // Strings of lights across the square between two posts.
  for (let k = 0; k < 30; k++) {
    const y = r.cy + rng.int(-r.ry + 1, r.ry - 1);
    const x0 = r.cx - rng.int(2, 4);
    const x1 = x0 + 4;
    if (!free(c, x0, y) || !free(c, x1, y)) continue;
    if (!solidProp(c, 'stringPost', x0, y, 0, 0, undefined, true)) continue;
    if (!solidProp(c, 'stringPost', x1, y, 0, 0, undefined, true)) continue;
    decorProp(c, 'stringLights', (x0 + x1 + 1) * TILE / 2, y * TILE + 13 + 30);
    break;
  }
  // Tables under umbrellas round the edges of the square.
  let tables = 0;
  for (let k = 0; k < 30 && tables < 3; k++) {
    const x = r.cx + rng.int(-r.rx, r.rx);
    const y = r.cy + rng.int(-r.ry, r.ry);
    if (solidProp(c, 'cafeTable', x, y, 0, -2, undefined, true)) tables++;
  }
}

/** A canal across the town: two rows of water through the lots where the street is narrow enough
 * for a bridge, the street carried over it on a plank deck between two rails. */
function canalAndBridge(c: DecorCtx): void {
  const { m, rng } = c;
  const W = m.w;
  const rows: number[] = [];
  for (let y = 8; y < m.h - 10; y++) {
    // Exactly one run of floor across both rows, three to five tiles wide, no pools or squares.
    let ok = true;
    let run: [number, number] | null = null;
    for (const yy of [y, y + 1]) {
      let x = 0;
      let runs = 0;
      while (x < W) {
        if (at(m, x, yy) === SOLID) {
          x++;
          continue;
        }
        const x0 = x;
        while (x < W && at(m, x, yy) !== SOLID) x++;
        runs++;
        if (!run) run = [x0, x];
        else if (run[0] !== x0 || run[1] !== x) ok = false;
      }
      if (runs !== 1) ok = false;
    }
    if (!ok || !run || run[1] - run[0] < 3 || run[1] - run[0] > 5) continue;
    let clear = true;
    for (let x = run[0]; x < run[1]; x++) for (const yy of [y, y + 1]) if (at(m, x, yy) !== FLOOR || c.nearCenter(x, yy)) clear = false;
    if (clear) rows.push(y);
  }
  if (!rows.length) return;
  const y = rows[Math.floor(rng.next() * rows.length)];
  m.canal ??= new Uint8Array(W * m.h);
  let bx0 = W;
  let bx1 = 0;
  for (let x = 1; x < W - 1; x++) {
    for (const yy of [y, y + 1]) {
      m.canal[yy * W + x] = 1;
      if (at(m, x, yy) === FLOOR) {
        c.occupied.add(yy * W + x);
        bx0 = Math.min(bx0, x);
        bx1 = Math.max(bx1, x);
      }
    }
  }
  clearTrees(m, 0, y - 1, W - 1, y + 1);
  reserve(m, 0, y, W - 1, y + 1);
  // The bridge's two rails, at the deck's sides.
  m.props.push({ kind: 'bridgeRail', x: bx0 * TILE + 2, y: (y + 2) * TILE + 6, solid: false, seed: 1 });
  m.props.push({ kind: 'bridgeRail', x: (bx1 + 1) * TILE - 2, y: (y + 2) * TILE + 6, solid: false, seed: 2 });
}

// ------------------------------------------------------------------ the wilds

/** On raised ground a tree whose foot would sit on the ledge's face stands on its top instead. */
function standOnLedges(m: FloorMap): void {
  for (const p of m.props) {
    if (p.kind !== 'tree') continue;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor((p.y - 1) / TILE);
    if (at(m, tx, ty) === SOLID && at(m, tx, ty + 1) !== SOLID) p.y = ty * TILE + 1;
  }
}

/** Lantern posts (or another light) beside a path, one every so often. */
function pathLights(c: DecorCtx, kind: PropKind, spacing: number, max: number): void {
  const { m, rng } = c;
  const lamps: Array<[number, number]> = [];
  for (let y = 2; y < m.h - 2 && lamps.length < max; y++) {
    for (let x = 2; x < m.w - 2 && lamps.length < max; x++) {
      if (!m.path[y * m.w + x] || at(m, x, y) !== FLOOR) continue;
      if (lamps.some(([lx, ly]) => Math.abs(lx - x) + Math.abs(ly - y) < spacing)) continue;
      for (const [ox] of rng.shuffle([[-2, 0], [2, 0], [-1, 0], [1, 0]] as Array<[number, number]>)) {
        const lx = x + ox;
        if (m.path[y * m.w + lx] || !free(c, lx, y)) continue;
        if (solidProp(c, kind, lx, y, ox < 0 ? 4 : -4, -2)) {
          lamps.push([lx, y]);
          break;
        }
      }
    }
  }
}

/** Strings of little lights slung across narrow passages, between the trees either side. */
function stringLights(c: DecorCtx, max: number): void {
  const { m, rng } = c;
  const rows: Array<[number, number, number]> = [];
  for (let y = 4; y < m.h - 4; y++) {
    let x = 2;
    while (x < m.w - 2) {
      if (at(m, x, y) !== FLOOR) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < m.w - 2 && at(m, x, y) !== SOLID) x++;
      const w = x - x0;
      if (w >= 3 && w <= 5 && at(m, x0 - 1, y) === SOLID && at(m, x, y) === SOLID && m.path[y * m.w + x0 + 1]) rows.push([x0, x, y]);
    }
  }
  rng.shuffle(rows);
  const used: number[] = [];
  for (const [x0, x1, y] of rows) {
    if (used.length >= max) break;
    if (used.some((u) => Math.abs(u - y) < 12)) continue;
    used.push(y);
    decorProp(c, 'stringLights', ((x0 + x1) / 2) * TILE, (y + 3) * TILE);
  }
}

/** A pool at the foot of a ledge with water falling into it over the face, rocks at its sides. */
function waterfall(c: DecorCtx): boolean {
  const { m, rng } = c;
  const spots: Array<[number, number]> = [];
  for (let y = 4; y < m.h - 5; y++) {
    for (let x = 3; x < m.w - 5; x++) {
      // The face over the pool, and two tiles of ledge top behind it for the stream.
      if (at(m, x, y) !== SOLID || at(m, x + 1, y) !== SOLID || at(m, x, y - 1) !== SOLID || at(m, x + 1, y - 1) !== SOLID) continue;
      let ok = true;
      for (let yy = y + 1; yy <= y + 2 && ok; yy++) for (let xx = x - 1; xx <= x + 2 && ok; xx++) if (!free(c, xx, yy) || m.path[yy * m.w + xx]) ok = false;
      if (ok && !m.reserved?.[y * m.w + x]) spots.push([x, y]);
    }
  }
  rng.shuffle(spots);
  for (const [x, y] of spots.slice(0, 20)) {
    const pool: number[] = [];
    for (let yy = y + 1; yy <= y + 2; yy++) for (let xx = x - 1; xx <= x + 2; xx++) if (!((yy === y + 2) && (xx === x - 1 || xx === x + 2))) pool.push(yy * m.w + xx);
    for (const i of pool) m.tiles[i] = 2;
    if (!c.connected()) {
      for (const i of pool) m.tiles[i] = FLOOR;
      continue;
    }
    for (const i of pool) c.occupied.add(i);
    (m.waterfalls ??= []).push({ x: x * TILE + 6, y: y * TILE + 2, w: 18, h: 13 });
    clearTrees(m, x, y - 1, x + 1, y);
    reserve(m, x, y - 2, x + 1, y);
    // Mossy rocks either side of the pool.
    for (const [rx, ry] of [[x - 2, y + 1], [x + 3, y + 1], [x - 2, y + 2], [x + 3, y + 2]] as const) if (rng.chance(0.6)) solidProp(c, 'mossRock', rx, ry);
    return true;
  }
  return false;
}

/** How a biome's wilds are dressed: its ruins, the lights along its paths, a camp, a ring of
 * something in a quiet room, the fences by its paths, and whether water falls from its ledges. */
interface WildsCfg {
  /** Stretches of ruined wall in the walls of the rooms (with pillars and fallen blocks before them). */
  ruins: number;
  /** The light along the paths, how far apart, how many. */
  lights?: { kind: PropKind; spacing: number; max: number };
  /** Strings of lights across narrow passages. */
  strings?: number;
  /** A camp in a side room: a tent, a fire, a log, a lantern. */
  camp?: boolean;
  /** A ring of these in a quiet room (glowing mushrooms, stone lanterns, gravestones...). */
  ring?: { kind: PropKind; n: number; solid: boolean };
  /** Fences by the path where it crosses a room. */
  fence?: PropKind;
  waterfalls?: number;
  /** Stairs climbing into the ledges. */
  stairs?: number;
}

const WILDS: Partial<Record<string, WildsCfg>> = {
  forest: { ruins: 3, lights: { kind: 'lanternPost', spacing: 9, max: 14 }, strings: 3, camp: true, ring: { kind: 'mushroomSmall', n: 8, solid: false }, fence: 'roughFence', waterfalls: 2, stairs: 3 },
  farmland: { ruins: 0, lights: { kind: 'lantern', spacing: 12, max: 8 }, fence: 'roughFence', camp: false },
  tundra: { ruins: 1, lights: { kind: 'lanternPost', spacing: 12, max: 8 }, camp: true, ring: { kind: 'crystalSmall', n: 6, solid: true }, fence: 'roughFence' },
  swamp: { ruins: 1, lights: { kind: 'lanternPost', spacing: 10, max: 10 }, strings: 1, camp: true, ring: { kind: 'mushroomSmall', n: 9, solid: false }, fence: 'roughFence' },
  desert: { ruins: 4, lights: { kind: 'brazier', spacing: 12, max: 8 }, ring: { kind: 'brokenPillar', n: 6, solid: true } },
  graveyard: { ruins: 2, lights: { kind: 'lanternPost', spacing: 10, max: 10 }, ring: { kind: 'gravestone', n: 7, solid: true }, fence: 'picket' },
  shrine: { ruins: 2, lights: { kind: 'stoneLantern', spacing: 8, max: 14 }, strings: 2, ring: { kind: 'stoneLantern', n: 6, solid: true } },
  crystal: { ruins: 1, lights: { kind: 'crystalSmall', spacing: 9, max: 12 }, ring: { kind: 'crystalSmall', n: 7, solid: true } },
  ember: { ruins: 2, lights: { kind: 'brazier', spacing: 10, max: 10 }, ring: { kind: 'brokenPillar', n: 6, solid: true } },
  crypt: { ruins: 0, lights: { kind: 'brazier', spacing: 11, max: 8 }, ring: { kind: 'pillar', n: 6, solid: true } },
};

function wilds(c: DecorCtx, cfg: WildsCfg): void {
  const { m, rng } = c;
  // --- old ruins in the walls of the rooms: a stretch of carved wall, a pillar or two and fallen
  // blocks before it, a light beside it
  if (cfg.ruins && c.biome.layout === 'cave') {
    for (const lot of placeLots(c, [3], cfg.ruins, 2)) {
      m.props.push({ kind: 'ruinWall', x: lot.tx * TILE + 24, y: (lot.ty + 1) * TILE - 1, solid: true, seed: rng.int(0, 1 << 30) });
      const fy = lot.ty + 1;
      for (const [dx, kind] of rng.shuffle([[-1, 'brokenPillar'], [3, 'brokenPillar'], [0, 'stoneBlock'], [2, 'stoneBlock']] as Array<[number, PropKind]>).slice(0, 2)) solidProp(c, kind, lot.tx + dx, fy + (kind === 'stoneBlock' ? 1 : 0));
      if (cfg.lights) decorProp(c, cfg.lights.kind, (lot.tx + 1.5) * TILE + 20, fy * TILE + 6);
    }
  }
  // Stairs up into the ledge, here and there along the faces.
  let stairs = 0;
  for (let y = 4; y < m.h - 3 && stairs < (cfg.stairs ?? 0); y++) {
    for (let x = 3; x < m.w - 3 && stairs < (cfg.stairs ?? 0); x++) {
      if (at(m, x, y) !== SOLID || at(m, x, y + 1) !== FLOOR || at(m, x - 1, y + 1) !== FLOOR || at(m, x + 1, y + 1) !== FLOOR) continue;
      if (m.reserved?.[y * m.w + x] || !rng.chance(0.04)) continue;
      decorProp(c, 'stairs', x * TILE + 8, (y + 1) * TILE + 2);
      clearTrees(m, x, y, x, y);
      reserve(m, x, y - 1, x, y);
      stairs++;
    }
  }
  // --- water falling from the ledges into pools
  for (let k = 0; k < (cfg.waterfalls ?? 0); k++) if (k === 0 || m.h > 100) waterfall(c);
  // --- lights along the path, strings of lights across the narrows
  if (cfg.lights) pathLights(c, cfg.lights.kind, cfg.lights.spacing, cfg.lights.max);
  if (cfg.strings) stringLights(c, cfg.strings);
  // --- a camp in a side room: a tent, a fire, log seats, a lantern
  const side = c.rooms.find((r) => r.kind === 'side');
  if (cfg.camp && side && solidProp(c, 'campfire', side.cx, side.cy)) {
    solidProp(c, 'tent', side.cx - 2, side.cy - 1);
    solidProp(c, 'log', side.cx, side.cy + 2);
    decorProp(c, 'lanternPost', (side.cx + 2) * TILE + 8, side.cy * TILE + 4);
  }
  // --- a ring of something in a quiet room
  const quiet = c.rooms.filter((r) => r.kind === 'normal');
  const ringRoom = cfg.ring && quiet.length ? rng.pick(quiet) : undefined;
  if (cfg.ring && ringRoom) {
    const cx = ringRoom.cx + rng.int(-2, 2);
    const cy = ringRoom.cy + rng.int(-1, 1);
    if (!c.nearCenter(cx, cy)) {
      for (let k = 0; k < cfg.ring.n; k++) {
        const a = (k / cfg.ring.n) * Math.PI * 2;
        if (cfg.ring.solid) solidProp(c, cfg.ring.kind, cx + Math.round(Math.cos(a) * 2.5), cy + Math.round(Math.sin(a) * 1.8));
        else decorProp(c, cfg.ring.kind, cx * TILE + 8 + Math.cos(a) * 22, cy * TILE + 8 + Math.sin(a) * 13);
      }
    }
  }
  // --- fences along the path where it runs across a room
  if (cfg.fence) {
    let fences = 0;
    for (let y = 3; y < m.h - 3 && fences < 10; y++) {
      for (let x = 3; x < m.w - 3 && fences < 10; x++) {
        const i = y * m.w + x;
        if (!m.path[i] || !m.path[i - 1] || !m.path[i + 1] || m.path[i - m.w] || !rng.chance(0.25)) continue;
        if (solidProp(c, cfg.fence, x, y - 1, 0, 2)) fences++;
      }
    }
  }
}
