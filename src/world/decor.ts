/**
 * Dressing a floor so it looks lived-in. The hamlet gets houses along the north edges of its rooms
 * (standing in the trees with their fronts to the room, so they never block the way), a yard in
 * front of each (pots by the door, a footpath down to the road, barrels and crates, a bench, a wood
 * pile), lamp posts along the road, a well and a market stall on its squares, sign posts and a
 * notice board. Everything solid that lands on the floor is checked never to cut the floor in two.
 *
 * Runs after the trees are placed: anything that needs room (a house) clears the trees in its way and
 * marks its ground in `m.reserved`, so a tree placer that runs later can keep off it too.
 */
import { Rng } from '../core/rng';
import type { Biome, PropKind } from './biomes';
import { BLOCKED, FLOOR, SOLID, TILE, tileAt, type FloorMap, type Room } from './mapgen';

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
  if (c.biome.id === 'hamlet') village(c);
}

// ------------------------------------------------------------------ helpers

function at(m: FloorMap, x: number, y: number): number {
  return tileAt(m, x, y);
}

function free(c: DecorCtx, x: number, y: number): boolean {
  const i = y * c.m.w + x;
  return at(c.m, x, y) === FLOOR && !c.occupied.has(i) && !c.nearCenter(x, y) && !c.m.field?.[i];
}

/** A solid prop on a floor tile (blocking it), if that leaves every floor tile reachable. */
function solidProp(c: DecorCtx, kind: PropKind, x: number, y: number, dx = 0, dy = 0, seed = c.rng.int(0, 1 << 30)): boolean {
  const { m } = c;
  const i = y * m.w + x;
  if (!free(c, x, y) || m.path[i]) return false;
  m.tiles[i] = BLOCKED;
  if (!c.connected()) {
    m.tiles[i] = FLOOR;
    return false;
  }
  c.occupied.add(i);
  m.props.push({ kind, x: x * TILE + 8 + dx, y: y * TILE + 13 + dy, solid: true, seed });
  return true;
}

/** Several props sharing one blocked tile (a heap of barrels and a crate). */
function cluster(c: DecorCtx, x: number, y: number, kinds: PropKind[]): boolean {
  const { m } = c;
  const i = y * m.w + x;
  if (!free(c, x, y) || m.path[i]) return false;
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

function markPath(m: FloorMap, x: number, y: number): void {
  if (x >= 0 && y >= 0 && x < m.w && y < m.h) m.path[y * m.w + x] = 1;
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

// ------------------------------------------------------------------ the village

function village(c: DecorCtx): void {
  const { m, rng } = c;
  // --- houses: along the north edge of a room, fronts to the room. A house may take in a few floor
  // tiles behind its front and straighten the row before it, if every floor tile stays reachable.
  type Lot = { tx: number; ty: number; tiles: 4 | 5; fill: number[]; clear: number[]; score: number };
  const lots: Lot[] = [];
  const W = m.w;
  // How near the road a row of tiles is (houses want to face it).
  const roadNear = (x0: number, x1: number, y: number) => {
    for (let d = 1; d <= 4; d++) for (let x = x0 - 1; x <= x1 + 1; x++) if (m.path[(y + d) * W + x] || m.path[y * W + x - d] || m.path[y * W + x1 + d]) return 5 - d;
    return 0;
  };
  for (let ty = 7; ty < m.h - 4; ty++) {
    for (let tx = 3; tx < W - 8; tx++) {
      for (const tiles of [5, 4] as const) {
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
  type Spot = { tx: number; ty: number; tiles: 4 | 5 };
  const houses: Array<Spot & { door: number }> = [];
  for (const s of lots) {
    if (houses.length >= 12) break;
    if (houses.some((h) => s.tx < h.tx + h.tiles + 1 && h.tx < s.tx + s.tiles + 1 && Math.abs(s.ty - h.ty) < 7)) continue;
    // Still as it was when this lot was looked at (an earlier house may have changed things)?
    if (s.fill.some((i) => m.tiles[i] !== FLOOR) || s.clear.some((i) => m.tiles[i] !== SOLID)) continue;
    for (const i of s.fill) m.tiles[i] = SOLID;
    for (const i of s.clear) m.tiles[i] = FLOOR;
    if (!c.connected()) {
      for (const i of s.fill) m.tiles[i] = FLOOR;
      for (const i of s.clear) m.tiles[i] = SOLID;
      continue;
    }
    const variant = s.tiles === 4 ? rng.int(0, 2) : rng.int(3, 4);
    const seed = rng.int(0, 1 << 24) * 5 + variant;
    const L = houseLayout(variant);
    const x = s.tx * TILE + s.tiles * 8;
    const y = (s.ty + 1) * TILE - 1;
    clearTrees(m, s.tx - 1, s.ty - 5, s.tx + s.tiles, s.ty + 1);
    reserve(m, s.tx - 1, s.ty - 5, s.tx + s.tiles, s.ty);
    m.props.push({ kind: 'house', x, y, solid: true, seed });
    houses.push({ tx: s.tx, ty: s.ty, tiles: s.tiles, door: Math.floor((x - s.tiles * 8 + L.door) / TILE) });
  }
  // --- each house's yard
  for (const h of houses) {
    const fy = h.ty + 1;
    // A footpath of stones from the door down to the road (or a step of them, if the road is far).
    let reach = 0;
    for (let y = fy; y < fy + 7; y++) {
      if (at(m, h.door, y) !== FLOOR) break;
      if (m.path[y * m.w + h.door]) {
        reach = y;
        break;
      }
    }
    for (let y = fy; y < (reach || fy + 2); y++) if (at(m, h.door, y) === FLOOR) markPath(m, h.door, y);
    for (let y = fy; y < fy + 2; y++) c.occupied.add(y * m.w + h.door);
    // Pots either side of the door, against the wall.
    for (const side of [-1, 1]) if (rng.chance(0.75)) decorProp(c, 'pot', (h.door + 0.5) * TILE + side * 9, fy * TILE + 3);
    // A couple of the yard's things along the front, clear of the door.
    const things: PropKind[][] = [['barrel', 'barrel', 'crate'], ['bench'], ['woodpile'], ['sack', 'barrel'], ['flowerBed'], ['crate', 'crate'], ['barrel', 'barrel']];
    const xs = [];
    for (let x = h.tx; x < h.tx + h.tiles; x++) if (Math.abs(x - h.door) > 1) xs.push(x);
    rng.shuffle(xs);
    let n = rng.int(1, 2);
    for (const x of xs) {
      if (n <= 0) break;
      const pick = rng.pick(things);
      if (pick.length > 1 ? cluster(c, x, fy, pick) : solidProp(c, pick[0], x, fy, 0, -6)) n--;
    }
  }
  // --- lamp posts along the road, a lamp every so often
  const lamps: Array<[number, number]> = [];
  for (let y = 2; y < m.h - 2; y++) {
    for (let x = 2; x < m.w - 2; x++) {
      if (!m.path[y * m.w + x] || at(m, x, y) !== FLOOR) continue;
      if (lamps.some(([lx, ly]) => Math.abs(lx - x) + Math.abs(ly - y) < 13)) continue;
      // Beside the road, not on it.
      for (const [ox] of rng.shuffle([[-2, 0], [2, 0], [-1, 0], [1, 0]] as Array<[number, number]>)) {
        const lx = x + ox;
        if (m.path[y * m.w + lx] || !free(c, lx, y)) continue;
        if (solidProp(c, 'lampPost', lx, y, ox < 0 ? 4 : -4, -2)) {
          lamps.push([lx, y]);
          break;
        }
      }
    }
  }
  // --- the squares: a well in one, a market stall in another, a notice board by the start
  const squares = c.rooms.filter((r) => r.kind === 'normal' || r.kind === 'side');
  rng.shuffle(squares);
  let well = false;
  let stall = false;
  for (const r of squares) {
    if (!well) {
      for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 1], [-2, 1]] as const) {
        const x = r.cx + ox;
        const y = r.cy + oy;
        if (!free(c, x, y) || !free(c, x + 1, y)) continue;
        // The well blocks its tile; a pail on the next one.
        const saved = m.path[y * m.w + x];
        m.path[y * m.w + x] = 0;
        if (solidProp(c, 'wellStone', x, y, 3, 2)) {
          well = true;
          decorProp(c, 'barrel', (x + 1) * TILE + 12, y * TILE + 14);
          break;
        }
        m.path[y * m.w + x] = saved;
      }
      if (well) continue;
    }
    if (!stall) {
      for (let k = 0; k < 12 && !stall; k++) {
        const x = r.cx + rng.int(-r.rx + 2, r.rx - 3);
        const y = r.cy + rng.int(-r.ry + 1, r.ry - 2);
        if (!free(c, x, y) || !free(c, x + 1, y) || m.path[y * m.w + x] || m.path[y * m.w + x + 1]) continue;
        if (!solidProp(c, 'stall', x, y, 8, 0)) continue;
        if (!solidProp(c, 'crate', x + 1, y, 6, 6)) {
          // The stall stands over two tiles: both blocked, or it doesn't stand here.
          m.tiles[y * m.w + x] = FLOOR;
          c.occupied.delete(y * m.w + x);
          m.props.pop();
          continue;
        }
        stall = true;
      }
    }
  }
  const start = c.rooms.find((r) => r.kind === 'start');
  if (start) {
    for (const [ox, oy] of rng.shuffle([[-3, -2], [3, -2], [-3, 1], [3, 1]] as Array<[number, number]>)) {
      if (solidProp(c, rng.chance(0.5) ? 'signpost' : 'noticeBoard', start.cx + ox, start.cy + oy, 0, -2)) break;
    }
  }
  const exit = c.rooms.find((r) => r.kind === 'exit');
  if (exit) for (const [ox, oy] of [[-4, 1], [4, 1], [-4, -1], [4, -1]] as const) if (solidProp(c, 'signpost', exit.cx + ox, exit.cy + oy, 0, -2)) break;
}
