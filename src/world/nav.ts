/**
 * Getting about, for the squad's knights (the two the AI moves, and yours on Auto). Everything a
 * knight walks to goes through here: its place beside the leader, the foe it's after, the hurt
 * friend a healer goes to, the way out, open ground to back off into.
 *
 *  - A grid of 4 px cells over the floor, built once per floor and kept, marking where a knight's
 *    body can stand: walls, water, tree trunks and props all count, just as they do for walking.
 *  - Paths on it by A* (a step right by a wall costs a little more, so paths keep off the walls where
 *    there's room), pulled straight wherever a body can walk straight, and planned again when the goal
 *    moves on, every second or so, or when the knight is pushed off its way. A far goal is reached a
 *    stretch at a time, along a coarse route over whole tiles, so no one plan is big. Planning has a
 *    budget each frame (phones): a knight that misses out keeps the way it had for a frame.
 *  - A goal a knight can't stand on or can't get to (a place in the formation that falls in a tree, a
 *    foe hovering over water) becomes the nearest spot it can.
 *  - Feelers: when the way ahead is blocked, the knight turns a little either side, to slip round a
 *    corner or a trunk instead of pushing into it.
 *  - Kiting toward open ground: of sixteen ways round, the one with the most room, away from the foes.
 *  - A watch on headway toward where it's going (not just whether it moved: sliding to and fro along a
 *    wall isn't headway). None for a moment and it plans again; then it steps aside; then, as a last
 *    resort, it hops to a free spot by its leader (yours, on Auto, a short hop along its way), so no
 *    knight is ever left pushing into a wall.
 */
import { clear, dist, norm, walkClear, type Unit } from './entities';
import type { Flow } from './flow';
import { FLOOR, TILE, type FloorMap } from './mapgen';
import type { World } from './world';

/** The grid's cells (px): four to a tile each way. */
export const CELL = 4;
const PER = TILE / CELL;
/** How far (cells) the room round a cell is counted. */
const ROOM_CAP = 6;
/** What a step costs on top, by the room the cell stepped onto has (1: right by a wall). */
const CLOSE = [0, 1, 0.35, 0.12, 0, 0, 0];
/** Cells one plan may look at, and all the plans in a frame together (phones). */
const PLAN_CAP = 3000;
const FRAME_BUDGET = 5000;
/** A goal more than this many tiles along the way is planned a stretch (this long) at a time. */
const STRETCH = 8;
/** Seconds a path is kept before it's planned again anyway. */
const REPLAN = 1.2;
/** The watch: seconds without headway before it plans again, steps aside, and hops. */
const REPLAN_AFTER = 0.5;
const SIDESTEP_AFTER = 0.75;
const HOP_AFTER = 1.5;
/** The watch's window (s), and the share of the way it should have got that counts as headway. */
const WATCH = 0.25;
const HEADWAY = 0.3;
/** The long look (s), and the share of the way it should have got that it must be from where it started (not just to and fro). */
const LONG = 0.8;
const GAINED = 0.2;

const SQRT2 = Math.SQRT2;
/** What a step into a squadmate's body costs on top (enough to go round one where there's room). */
const BUMP = 6;
/** (Floor, as read in the loops below: a constant of the module's own is quicker there than the import.) */
const OPEN = FLOOR;
// The eight steps: the four edge-on ones first.
const DX = [1, -1, 0, 0, 1, -1, 1, -1];
const DY = [0, 0, 1, -1, 1, 1, -1, -1];

export interface NavGrid {
  m: FloorMap;
  /** The body radius it was built for. */
  r: number;
  /** Cells across and down. */
  w: number;
  h: number;
  /** 1 where a body of radius r stands clear with its middle at the cell's middle. */
  ok: Uint8Array;
  /** Which connected piece each standable cell belongs to (0 where it can't stand). */
  part: Uint16Array;
  /** Cells from each standable cell to the nearest one it can't stand in (up to ROOM_CAP). */
  room: Uint8Array;
}

/**
 * The planner's scratch, shared by every grid (one plan runs at a time) and grown to the biggest floor
 * yet, so a new floor brings only its own few small arrays (nothing big for the garbage collector to
 * stop the game for). `mark` holds 2 * stamp for a cell seen in the plan under way, 1 more once done.
 */
const scratch = {
  n: 0,
  g: new Float32Array(0),
  from: new Int32Array(0),
  mark: new Uint32Array(0),
  stamp: 0,
  heap: new Int32Array(8 * (PLAN_CAP + 2)),
  heapF: new Float32Array(8 * (PLAN_CAP + 2)),
  // The coarse route's (whole tiles).
  tn: 0,
  tFrom: new Int32Array(0),
  tMark: new Uint32Array(0),
  tStamp: 0,
  tQ: new Int32Array(0),
};

/** The scratch, big enough for n cells and t tiles. */
function scratchFor(n: number, t: number): typeof scratch {
  if (scratch.n < n) {
    scratch.n = n;
    scratch.g = new Float32Array(n);
    scratch.from = new Int32Array(n);
    scratch.mark = new Uint32Array(n);
    scratch.stamp = 0;
  }
  if (scratch.tn < t) {
    scratch.tn = t;
    scratch.tFrom = new Int32Array(t);
    scratch.tMark = new Uint32Array(t);
    scratch.tStamp = 0;
    scratch.tQ = new Int32Array(t);
  }
  return scratch;
}

/** Every floor's grids, by its tiles (one per body radius; the knights all share one). */
const grids = new WeakMap<Uint8Array, NavGrid[]>();

/** The nav grid of this floor for bodies of radius r: built the first time it's asked for, then kept. */
export function navGrid(m: FloorMap, r: number): NavGrid {
  const list = grids.get(m.tiles);
  const had = list?.find((g) => g.r === r && g.m.w === m.w && g.m.h === m.h);
  if (had) return had;
  const W = m.w * PER;
  const H = m.h * PER;
  const N = W * H;
  const ok = new Uint8Array(N);
  // A body there is clear when the tiles under its box's four corners are all floor (what clear()
  // asks of the map, worked out by row and by column once rather than cell by cell).
  const tiles = m.tiles;
  const left = new Int32Array(W);
  const right = new Int32Array(W);
  for (let cx = 0; cx < W; cx++) {
    left[cx] = Math.floor(((cx + 0.5) * CELL - r) / TILE);
    right[cx] = Math.floor(((cx + 0.5) * CELL + r) / TILE);
  }
  for (let cy = 0; cy < H; cy++) {
    const top = Math.floor(((cy + 0.5) * CELL - r * 0.6) / TILE);
    const bottom = Math.floor(((cy + 0.5) * CELL + r * 0.6) / TILE);
    if (top < 0 || bottom >= m.h) continue;
    const a = top * m.w;
    const b = bottom * m.w;
    for (let cx = 0; cx < W; cx++) {
      const l = left[cx];
      const rt = right[cx];
      if (l < 0 || rt >= m.w) continue;
      if (tiles[a + l] === OPEN && tiles[a + rt] === OPEN && tiles[b + l] === OPEN && tiles[b + rt] === OPEN) ok[cy * W + cx] = 1;
    }
  }
  // Connected pieces (edge-on steps are enough: a diagonal step needs both its sides open anyway).
  const part = new Uint16Array(N);
  const stack = scratchFor(N, m.w * m.h).from;
  let label = 0;
  for (let i = 0; i < N; i++) {
    if (!ok[i] || part[i]) continue;
    // (Past the 65535th piece, a few tiny ones share a label: they're never planned across anyway.)
    if (label < 0xffff) label++;
    let top = 0;
    stack[top++] = i;
    part[i] = label;
    while (top > 0) {
      const c = stack[--top];
      const cx = c % W;
      if (cx > 0 && ok[c - 1] && !part[c - 1]) (part[c - 1] = label), (stack[top++] = c - 1);
      if (cx < W - 1 && ok[c + 1] && !part[c + 1]) (part[c + 1] = label), (stack[top++] = c + 1);
      if (c >= W && ok[c - W] && !part[c - W]) (part[c - W] = label), (stack[top++] = c - W);
      if (c < N - W && ok[c + W] && !part[c + W]) (part[c + W] = label), (stack[top++] = c + W);
    }
  }
  // Room: cells to the nearest one a body can't stand in, any way round (two passes). A standable
  // cell is never on the grid's edge (the map's border is wall), so its eight neighbors are all on it.
  const room = new Uint8Array(N);
  for (let i = W; i < N - W; i++) {
    if (!ok[i]) continue;
    room[i] = Math.min(ROOM_CAP, 1 + Math.min(room[i - 1], room[i - W - 1], room[i - W], room[i - W + 1]));
  }
  for (let i = N - W - 1; i >= W; i--) {
    if (!ok[i]) continue;
    room[i] = Math.min(room[i], 1 + Math.min(room[i + 1], room[i + W + 1], room[i + W], room[i + W - 1]));
  }
  const g: NavGrid = { m, r, w: W, h: H, ok, part, room };
  grids.set(m.tiles, [...(list ?? []), g]);
  return g;
}

function cellAt(g: NavGrid, x: number, y: number): number {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  return cx < 0 || cy < 0 || cx >= g.w || cy >= g.h ? -1 : cy * g.w + cx;
}

const midX = (g: NavGrid, c: number) => ((c % g.w) + 0.5) * CELL;
const midY = (g: NavGrid, c: number) => (((c / g.w) | 0) + 0.5) * CELL;

/** The connected piece a body standing at (x, y) is in (0 if it can't be told). */
export function partAt(g: NavGrid, x: number, y: number): number {
  const c = startCell(g, x, y);
  return c < 0 ? 0 : g.part[c];
}

/** The standable cell nearest (x, y) that a body there can walk straight to (-1 if none close). */
function startCell(g: NavGrid, x: number, y: number): number {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  let best = -1;
  let bd = Infinity;
  for (let ring = 1; ring <= 2 && best < 0; ring++) {
    for (let oy = -ring; oy <= ring; oy++) {
      for (let ox = -ring; ox <= ring; ox++) {
        const nx = cx + ox;
        const ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
        const c = ny * g.w + nx;
        if (!g.ok[c]) continue;
        const px = (nx + 0.5) * CELL;
        const py = (ny + 0.5) * CELL;
        const d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < bd && walkClear(g.m, x, y, px, py, g.r)) {
          bd = d;
          best = c;
        }
      }
    }
  }
  return best;
}

/**
 * The standable cell of piece `part` nearest (x, y), searching out ring by ring up to `rings` cells,
 * that `accept` (if given) agrees to; -1 if none.
 */
function nearestCell(g: NavGrid, x: number, y: number, part: number, rings: number, accept?: (c: number) => boolean): number {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  let best = -1;
  let bd = Infinity;
  let foundAt = -1;
  const look = (nx: number, ny: number, k: number) => {
    if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) return;
    const c = ny * g.w + nx;
    if (!g.ok[c] || (part && g.part[c] !== part)) return;
    const d = ((nx + 0.5) * CELL - x) ** 2 + ((ny + 0.5) * CELL - y) ** 2;
    if (d >= bd || (accept && !accept(c))) return;
    bd = d;
    best = c;
    if (foundAt < 0) foundAt = k;
  };
  for (let k = 0; k <= rings; k++) {
    // (A cell on the next ring can still be a little nearer than one found on this one.)
    if (foundAt >= 0 && k > foundAt + 1) break;
    if (k === 0) {
      look(cx, cy, 0);
      continue;
    }
    for (let o = -k; o <= k; o++) {
      look(cx + o, cy - k, k);
      look(cx + o, cy + k, k);
    }
    for (let o = -k + 1; o <= k - 1; o++) {
      look(cx - k, cy + o, k);
      look(cx + k, cy + o, k);
    }
  }
  return best;
}

/**
 * A spot a body of radius r can stand on, in the same piece as (fromX, fromY), as close to (x, y) as
 * there is within `reach` px (`inSight`: one a body could walk straight to from there), or null.
 */
export function freeSpot(w: World, x: number, y: number, r: number, fromX = x, fromY = y, reach = 48, inSight = false): [number, number] | null {
  const g = navGrid(w.map, r);
  const part = partAt(g, fromX, fromY);
  const seen = (px: number, py: number) => !inSight || walkClear(w.map, fromX, fromY, px, py, r);
  if (part && clear(w.map, x, y, r, false) && partAt(g, x, y) === part && seen(x, y)) return [x, y];
  const c = nearestCell(g, x, y, part, Math.ceil(reach / CELL), inSight ? (c) => seen(midX(g, c), midY(g, c)) : undefined);
  return c < 0 ? null : [midX(g, c), midY(g, c)];
}

/**
 * A* on the grid from cell s toward cell t, looking at no more than `cap` cells: the cell it got to (t,
 * or the one nearest t when it ran out) and how many it looked at. The way back is in scratch.from.
 */
function astar(g: NavGrid, s: number, t: number, cap: number, others: readonly number[]): { end: number; reached: boolean; used: number } {
  const W = g.w;
  const H = g.h;
  const { ok, room } = g;
  const S = scratchFor(W * H, 0);
  const { from, mark, heap, heapF } = S;
  // Squadmates standing about: a step that would bump into one costs more (they move, so it isn't barred).
  const near = (2 * g.r + 1) ** 2;
  const bumps = (c: number) => {
    const x = ((c % W) + 0.5) * CELL;
    const y = (((c / W) | 0) + 0.5) * CELL;
    for (let k = 0; k < others.length; k += 2) if ((others[k] - x) ** 2 + (others[k + 1] - y) ** 2 < near) return BUMP;
    return 0;
  };
  const G = S.g;
  const st = ++S.stamp;
  const SEEN = 2 * st;
  const DONE = SEEN + 1;
  const tx = t % W;
  const ty = (t / W) | 0;
  const K = SQRT2 - 1;
  const est = (c: number) => {
    const dx = Math.abs((c % W) - tx);
    const dy = Math.abs(((c / W) | 0) - ty);
    return dx > dy ? dx + K * dy : dy + K * dx;
  };
  let n = 0;
  const push = (c: number, f: number) => {
    let i = n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= f) break;
      heap[i] = heap[p];
      heapF[i] = heapF[p];
      i = p;
    }
    heap[i] = c;
    heapF[i] = f;
  };
  const pop = () => {
    const top = heap[0];
    n--;
    const lc = heap[n];
    const lf = heapF[n];
    let i = 0;
    for (;;) {
      let k = 2 * i + 1;
      if (k >= n) break;
      if (k + 1 < n && heapF[k + 1] < heapF[k]) k++;
      if (heapF[k] >= lf) break;
      heap[i] = heap[k];
      heapF[i] = heapF[k];
      i = k;
    }
    heap[i] = lc;
    heapF[i] = lf;
    return top;
  };
  G[s] = 0;
  mark[s] = SEEN;
  from[s] = -1;
  push(s, est(s));
  let best = s;
  let bestH = est(s);
  let used = 0;
  let reached = false;
  while (n > 0) {
    const c = pop();
    if (mark[c] === DONE) continue;
    mark[c] = DONE;
    if (c === t) {
      reached = true;
      best = c;
      break;
    }
    if (++used > cap) break;
    const hc = est(c);
    if (hc < bestH) {
      bestH = hc;
      best = c;
    }
    const cx = c % W;
    const cy = (c / W) | 0;
    const gc = G[c];
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nb = ny * W + nx;
      if (!ok[nb] || mark[nb] === DONE) continue;
      // No cutting corners: both cells beside a diagonal step must be open.
      if (k >= 4 && (!ok[cy * W + nx] || !ok[ny * W + cx])) continue;
      const ng = gc + (k >= 4 ? SQRT2 : 1) * (1 + CLOSE[room[nb]] + (others.length ? bumps(nb) : 0));
      if (mark[nb] === SEEN && ng >= G[nb]) continue;
      mark[nb] = SEEN;
      G[nb] = ng;
      from[nb] = c;
      if (n < heap.length) push(nb, ng + est(nb));
    }
  }
  return { end: best, reached, used };
}

/**
 * The coarse route over whole tiles from (x, y) toward (ex, ey): a tile STRETCH steps along it (the
 * goal's own when it's nearer), as the cell in that tile's middle; -1 when there's no way. Also what
 * it cost (tiles looked at).
 */
function stretchOf(g: NavGrid, x: number, y: number, ex: number, ey: number): { cell: number; far: boolean; used: number } {
  const m = g.m;
  const TW = m.w;
  const s = Math.floor(y / TILE) * TW + Math.floor(x / TILE);
  const t = Math.floor(ey / TILE) * TW + Math.floor(ex / TILE);
  const S = scratchFor(0, m.w * m.h);
  const { tFrom, tMark: tSeen, tQ } = S;
  const st = ++S.tStamp;
  let head = 0;
  let tail = 0;
  tSeen[s] = st;
  tFrom[s] = -1;
  tQ[tail++] = s;
  let found = s === t;
  while (head < tail && !found) {
    const c = tQ[head++];
    const cx = c % TW;
    for (let k = 0; k < 4; k++) {
      if ((k === 0 && cx >= TW - 1) || (k === 1 && cx <= 0)) continue;
      const nb = c + (k === 0 ? 1 : k === 1 ? -1 : k === 2 ? TW : -TW);
      if (nb < 0 || nb >= m.tiles.length || tSeen[nb] === st || m.tiles[nb] !== OPEN) continue;
      tSeen[nb] = st;
      tFrom[nb] = c;
      tQ[tail++] = nb;
      if (nb === t) {
        found = true;
        break;
      }
    }
  }
  if (!found) return { cell: -1, far: false, used: tail };
  // Back from the goal's tile: how many steps, then the tile STRETCH steps from the start.
  let steps = 0;
  for (let c = t; tFrom[c] !== -1 && c !== s; c = tFrom[c]) steps++;
  if (steps <= STRETCH) return { cell: -1, far: false, used: tail };
  let c = t;
  for (let k = steps; k > STRETCH; k--) c = tFrom[c];
  const tx = c % TW;
  const ty = (c / TW) | 0;
  // (The cell just past the tile's middle: a floor tile's middle is always clear for a knight.)
  return { cell: (ty * PER + PER / 2) * g.w + tx * PER + PER / 2, far: true, used: tail };
}

/**
 * Pulls a path (x, y pairs) straight wherever a body can walk straight (and wouldn't walk into one of
 * the squadmates in `others`).
 */
function pull(m: FloorMap, p: number[], r: number, others: readonly number[]): number[] {
  const n = p.length / 2;
  if (n <= 2) return p;
  const out = [p[0], p[1]];
  let a = 0;
  while (a < n - 1) {
    let b = a + 1;
    for (let k = a + 2; k < n; k++) {
      // (A pixel to spare, so the knight doesn't scrape every corner on the way.)
      if (walkClear(m, p[2 * a], p[2 * a + 1], p[2 * k], p[2 * k + 1], r + 1) && !through(others, p[2 * a], p[2 * a + 1], p[2 * k], p[2 * k + 1], 2 * r)) b = k;
      else if (k > b + 3) break;
    }
    out.push(p[2 * b], p[2 * b + 1]);
    a = b;
  }
  return out;
}

/**
 * Does the straight line from a to b pass within `d` px of any of these points (x, y pairs)? Not one it
 * only leaves behind (nearest where it starts): heading away from a squadmate isn't into it.
 */
function through(pts: readonly number[], ax: number, ay: number, bx: number, by: number, d: number): boolean {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 <= 0) return false;
  for (let k = 0; k < pts.length; k += 2) {
    const t = ((pts[k] - ax) * vx + (pts[k + 1] - ay) * vy) / len2;
    if (t <= 0) continue;
    const c = Math.min(1, t);
    if ((ax + vx * c - pts[k]) ** 2 + (ay + vy * c - pts[k + 1]) ** 2 < d * d) return true;
  }
  return false;
}

/**
 * The other standing knights a path from where h stands should keep clear of (x, y pairs); none for the
 * leader, which shoulders its squadmates aside (world.ts separate).
 */
function others(w: World, h: Unit): number[] {
  const out: number[] = [];
  if (h === w.leader()) return out;
  for (const o of w.heroes) if (o !== h && !o.downed) out.push(o.x, o.y);
  return out;
}

/** A knight's way about: its path, its place by the leader, its kiting, and the watch on its headway. */
export interface NavState {
  /** The goal its path was planned for, and where that path really ends (the goal, or the nearest spot to it a knight can reach). */
  gx: number;
  gy: number;
  ex: number;
  ey: number;
  /** The path (x, y pairs, from where it stood when it planned) and the point it's heading for. */
  path: number[] | null;
  i: number;
  /** The path stops short of the goal (a stretch of a long way, or the planner's limit): it plans on from its end. */
  partial: boolean;
  /** World time it was planned; plan afresh next time. */
  at: number;
  force: boolean;
  /** Which way it means to go (before the feelers turn it), and the world time it last asked. */
  idx: number;
  idy: number;
  navAt: number;
  /** Which way the feelers last turned it (1 or -1; 0 straight on). */
  side: number;
  /** The last look straight at the goal: from where, at where, when, and whether a body could walk it. */
  sx: number;
  sy: number;
  sgx: number;
  sgy: number;
  sAt: number;
  sOk: boolean;
  /** The last look along the path: from where, for which point, and when. */
  ax: number;
  ay: number;
  ai: number;
  aAt: number;
  /** Its place in the formation: as asked, and the spot it stands for it (and when that was worked out). */
  fsx: number;
  fsy: number;
  fox: number;
  foy: number;
  foAt: number;
  /** Settled near the leader with no way closer (another squadmate in the way): where the leader stood. */
  settled: boolean;
  setX: number;
  setY: number;
  /** Kiting: the way it's backing off, and when it looks again. */
  kdx: number;
  kdy: number;
  kT: number;
  // --- the watch on its headway
  /** Where it was when its last move was decided, the world time, the way it meant to go, how far it should get. */
  wx: number;
  wy: number;
  wt: number;
  wdx: number;
  wdy: number;
  wexp: number;
  /** That move was its way to a goal (navTo's), not a raw one (kiting, circling a foe). */
  wnav: boolean;
  /** This window: seconds into it, the headway made and the headway it should have made, frames and frames it meant to move. */
  bucket: number;
  useful: number;
  expected: number;
  frames: number;
  wanted: number;
  /**
   * The long look (LONG s): where it stood at the start, seconds in, frames and frames on its way to a
   * goal, how far it should have got; and seconds left that a window's headway doesn't count (it went
   * to and fro).
   */
  lx: number;
  ly: number;
  lt: number;
  lf: number;
  lw: number;
  lexp: number;
  loopT: number;
  /** Long looks gone to and fro in a row about the same spot (where, and when the last was). */
  loops: number;
  loopX: number;
  loopY: number;
  loopAt: number;
  /** Seconds without headway (the escalation: plan again, step aside, hop), and how far up it has gone. */
  noProg: number;
  stage: number;
  /** Seconds left stepping aside, and which way. */
  sideT: number;
  sdx: number;
  sdy: number;
  /** How many times it has hopped back to its leader (tests and tools). */
  hops: number;
}

export function navOf(u: Unit): NavState {
  const ai = u.ai!;
  return (ai.nav ??= {
    gx: 0, gy: 0, ex: 0, ey: 0, path: null, i: 0, partial: false, at: -1e9, force: false, idx: 0, idy: 0, navAt: -1, side: 0,
    sx: 0, sy: 0, sgx: 0, sgy: 0, sAt: -1e9, sOk: false, ax: 0, ay: 0, ai: -1, aAt: -1e9,
    fsx: 0, fsy: 0, fox: 0, foy: 0, foAt: -1e9, settled: false, setX: 0, setY: 0, kdx: 0, kdy: 0, kT: -1e9,
    wx: u.x, wy: u.y, wt: -1e9, wdx: 0, wdy: 0, wexp: 0, wnav: false, bucket: 0, useful: 0, expected: 0, frames: 0, wanted: 0,
    lx: u.x, ly: u.y, lt: 0, lf: 0, lw: 0, lexp: 0, loopT: 0, loops: 0, loopX: 0, loopY: 0, loopAt: -1e9,
    noProg: 0, stage: 0, sideT: 0, sdx: 0, sdy: 0, hops: 0,
  });
}

/** The frame's planning left, per world (it starts afresh each time the world's clock moves on). */
const budgets = new WeakMap<World, { t: number; left: number }>();

function budget(w: World): { t: number; left: number } {
  let b = budgets.get(w);
  if (!b) budgets.set(w, (b = { t: -1, left: 0 }));
  if (b.t !== w.time) {
    b.t = w.time;
    b.left = FRAME_BUDGET;
  }
  return b;
}

/** Cells planned so far this frame in world w, against the frame's budget (tests and tools). */
export function navSpent(w: World): { spent: number; budget: number } {
  return { spent: FRAME_BUDGET - budget(w).left, budget: FRAME_BUDGET };
}

/**
 * Plans a path for knight h toward (gx, gy). False when it couldn't this frame (the frame's planning
 * spent, or the knight in a spot it can't be told from): it keeps the way it had.
 */
function plan(w: World, h: Unit, nav: NavState, gx: number, gy: number): boolean {
  const b = budget(w);
  if (b.left < 300) return false;
  const g = navGrid(w.map, h.r);
  const s = startCell(g, h.x, h.y);
  if (s < 0) return false;
  const part = g.part[s];
  // Where it really goes: the goal, or the nearest spot to it a knight can stand on and get to.
  const gc = cellAt(g, gx, gy);
  const exact = gc >= 0 && g.ok[gc] && g.part[gc] === part && clear(w.map, gx, gy, h.r, false);
  const t = exact ? gc : nearestCell(g, gx, gy, part, 16);
  nav.gx = gx;
  nav.gy = gy;
  nav.at = w.time;
  nav.force = false;
  if (t < 0) {
    // Nowhere near it can be reached from here: it stays put.
    nav.path = [h.x, h.y];
    nav.i = 1;
    nav.partial = false;
    nav.ex = h.x;
    nav.ey = h.y;
    return true;
  }
  let ex = exact ? gx : midX(g, t);
  let ey = exact ? gy : midY(g, t);
  // A far goal: this stretch of the coarse route first.
  const far = stretchOf(g, h.x, h.y, ex, ey);
  b.left -= far.used >> 2;
  let to = t;
  let partial = false;
  if (far.far && g.ok[far.cell] && g.part[far.cell] === part) {
    to = far.cell;
    partial = true;
  }
  const bodies = others(w, h);
  const res = astar(g, s, to, Math.max(200, Math.min(PLAN_CAP, b.left)), bodies);
  b.left -= res.used;
  if (!res.reached) partial = true;
  const cells: number[] = [];
  for (let c = res.end; c !== -1; c = scratch.from[c]) cells.push(c);
  cells.reverse();
  // From where it stands: the cells' middles, keeping only the turns, then where it's going.
  const pts = [h.x, h.y];
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    const turn = k === 0 || k === cells.length - 1 || cells[k + 1] - c !== c - cells[k - 1];
    if (turn) pts.push(midX(g, c), midY(g, c));
  }
  if (!partial) {
    const n = pts.length;
    if (walkClear(w.map, pts[n - 2], pts[n - 1], ex, ey, h.r)) pts.push(ex, ey);
    else {
      ex = pts[n - 2];
      ey = pts[n - 1];
    }
  }
  nav.path = pull(w.map, pts, h.r, bodies);
  nav.i = 1;
  nav.aAt = -1e9;
  nav.partial = partial;
  nav.ex = partial ? gx : ex;
  nav.ey = partial ? gy : ey;
  return true;
}

/**
 * Which way to go to get round to (dx, dy) from where u stands: straight on if a body can, else the
 * nearest turn either side that can (the side it turned last, first), up to a right angle. Null if
 * none can.
 */
function feel(w: World, u: Unit, nav: NavState, dx: number, dy: number, look: number): [number, number] | null {
  const [nx, ny] = norm(dx, dy);
  if (!nx && !ny) return null;
  const open = (ex: number, ey: number) => walkClear(w.map, u.x, u.y, ex, ey, u.r) && !squadmateIn(w, u, ex, ey);
  if (open(u.x + nx * look, u.y + ny * look)) {
    nav.side = 0;
    return [nx, ny];
  }
  const first = nav.side || 1;
  for (const a of TURNS) {
    for (const s of [first, -first]) {
      const c = Math.cos(a * s);
      const n = Math.sin(a * s);
      const rx = nx * c - ny * n;
      const ry = nx * n + ny * c;
      if (open(u.x + rx * look, u.y + ry * look)) {
        nav.side = s;
        return [rx, ry];
      }
    }
  }
  return null;
}

/**
 * Would a step to (x, y) push u into a squadmate (closer than their two bodies, and closer than it is
 * now)? Then the feelers take it round them, as round a trunk, rather than shoving through. (Not the
 * leader: it shoulders its squadmates aside.)
 */
function squadmateIn(w: World, u: Unit, x: number, y: number): boolean {
  if (u.team !== 'hero' || u === w.leader()) return false;
  for (const o of w.heroes) {
    if (o === u || o.downed) continue;
    const d = dist(x, y, o.x, o.y);
    if (d < u.r + o.r && d < dist(u.x, u.y, o.x, o.y)) return true;
  }
  return false;
}

const TURNS = [0.4, 0.8, 1.2, 1.57];

/** Heads u toward (dx, dy), feeling its way round what's in front (it means to go that way). */
function heading(w: World, u: Unit, nav: NavState, dx: number, dy: number, d: number): [number, number] {
  const [nx, ny] = norm(dx, dy);
  nav.idx = nx;
  nav.idy = ny;
  nav.navAt = w.time;
  return feel(w, u, nav, nx, ny, Math.max(2, Math.min(7, d))) ?? [nx, ny];
}

function idle(w: World, nav: NavState): [number, number] {
  nav.idx = 0;
  nav.idy = 0;
  nav.navAt = w.time;
  return [0, 0];
}

/**
 * Walks knight h toward (gx, gy): straight there when a body can walk it, else along a path (planned,
 * kept and planned again as needed); [0, 0] once within `arrive` px of it, or at the nearest spot to it
 * a knight can reach. Returns the way to move this frame.
 */
export function navTo(w: World, h: Unit, gx: number, gy: number, arrive = 4): [number, number] {
  const nav = navOf(h);
  const d = dist(h.x, h.y, gx, gy);
  if (d <= arrive) {
    nav.path = null;
    return idle(w, nav);
  }
  // Straight there when a body can walk it (most of the time, in the open) and no squadmate stands in
  // the way (a little more room than that asked of the way while it's on a path round one, so it
  // doesn't flip from one to the other as they shift about).
  if (d < 240 && straight(w, h, nav, gx, gy) && !through(others(w, h), h.x, h.y, gx, gy, 2 * h.r + (nav.path ? 2 : 0))) {
    nav.path = null;
    return heading(w, h, nav, gx - h.x, gy - h.y, d);
  }
  const moved = dist(gx, gy, nav.gx, nav.gy);
  if (!nav.path || nav.force || moved > Math.max(6, d * 0.2) || w.time - nav.at > REPLAN) plan(w, h, nav, gx, gy);
  // No path yet (the frame's planning spent): straight on for now, feeling its way.
  if (!nav.path) return heading(w, h, nav, gx - h.x, gy - h.y, d);
  let p = along(w, h, nav);
  if (p === LOST || (p === END && nav.partial)) {
    // Pushed off its way, or at the end of a stretch: plan on from here.
    if (plan(w, h, nav, gx, gy)) p = along(w, h, nav);
    if (p === LOST) return heading(w, h, nav, gx - h.x, gy - h.y, d);
  }
  if (p === END) return idle(w, nav);
  const P = nav.path!;
  const x = P[2 * nav.i];
  const y = P[2 * nav.i + 1];
  return heading(w, h, nav, x - h.x, y - h.y, dist(h.x, h.y, x, y));
}

const END = -1;
const LOST = -2;

/**
 * Can h walk straight to (gx, gy)? Asked again once it or the goal has moved a little, or a moment
 * on (a long look down the way isn't free, and a pixel or two seldom changes the answer).
 */
function straight(w: World, h: Unit, nav: NavState, gx: number, gy: number): boolean {
  if (Math.abs(h.x - nav.sx) + Math.abs(h.y - nav.sy) < 2.5 && Math.abs(gx - nav.sgx) + Math.abs(gy - nav.sgy) < 2.5 && w.time - nav.sAt < 0.15) return nav.sOk;
  nav.sx = h.x;
  nav.sy = h.y;
  nav.sgx = gx;
  nav.sgy = gy;
  nav.sAt = w.time;
  return (nav.sOk = walkClear(w.map, h.x, h.y, gx, gy, h.r));
}

/** Moves on along the path past the points reached (or seen past); the point to head for, END or LOST. */
function along(w: World, h: Unit, nav: NavState): number {
  const P = nav.path!;
  const n = P.length / 2;
  while (nav.i < n && dist(h.x, h.y, P[2 * nav.i], P[2 * nav.i + 1]) < 2.5) nav.i++;
  if (nav.i >= n) return END;
  // (The looks below again only once it has moved a little, or a moment on.)
  if (nav.i === nav.ai && Math.abs(h.x - nav.ax) + Math.abs(h.y - nav.ay) < 2.5 && w.time - nav.aAt < 0.15) return nav.i;
  // A later point in a straight line from here (it was pushed, or rolled, on past the one it was
  // heading for): head for the farthest of the next few instead.
  const bodies = others(w, h);
  for (let k = Math.min(n - 1, nav.i + 3); k > nav.i; k--) {
    if (walkClear(w.map, h.x, h.y, P[2 * k], P[2 * k + 1], h.r) && !through(bodies, h.x, h.y, P[2 * k], P[2 * k + 1], 2 * h.r)) {
      nav.i = k;
      break;
    }
  }
  if (!walkClear(w.map, h.x, h.y, P[2 * nav.i], P[2 * nav.i + 1], h.r)) return LOST;
  nav.ai = nav.i;
  nav.ax = h.x;
  nav.ay = h.y;
  nav.aAt = w.time;
  return nav.i;
}

/**
 * Follows a flow field (the way to the nearest foe, or out) for knight h: toward the tile a few steps
 * on along it, walked to as any goal is (so the way is smooth and no corner is scraped).
 */
export function navFlow(w: World, h: Unit, f: Flow): [number, number] {
  let tx = Math.floor(h.x / TILE);
  let ty = Math.floor(h.y / TILE);
  for (let k = 0; k < 6; k++) {
    const here = f.dist[ty * f.w + tx];
    if (here <= 0) break;
    let bx = tx;
    let by = ty;
    let best = here;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = tx + ox;
        const ny = ty + oy;
        if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h) continue;
        const d = f.dist[ny * f.w + nx];
        if (d < 0 || d >= best) continue;
        if (ox && oy && (f.dist[ty * f.w + nx] < 0 || f.dist[ny * f.w + tx] < 0)) continue;
        best = d;
        bx = nx;
        by = ny;
      }
    }
    if (bx === tx && by === ty) break;
    tx = bx;
    ty = by;
  }
  return navTo(w, h, tx * TILE + TILE / 2, ty * TILE + TILE / 2, 3);
}

/**
 * A raw move (dx, dy) (a squadmate circling its foe), turned to slip round what's in front; nothing
 * when every way that side is blocked (rather than push into it).
 */
export function navNudge(w: World, h: Unit, dx: number, dy: number): [number, number] {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [0, 0];
  const f = feel(w, h, navOf(h), dx, dy, 5);
  return f ? [f[0] * len, f[1] * len] : [0, 0];
}

/**
 * Where squadmate h should stand to be at (sx, sy) beside its leader: there, if a body can stand there
 * and the leader could walk straight to it; else the nearest spot that is (not one another squadmate
 * already stands for); the leader's own spot when there's none close.
 */
export function besideLeader(w: World, h: Unit, lead: Unit, sx: number, sy: number): [number, number] {
  const nav = navOf(h);
  if (Math.abs(sx - nav.fsx) < 1.5 && Math.abs(sy - nav.fsy) < 1.5 && w.time - nav.foAt < 0.5) return [nav.fox, nav.foy];
  nav.fsx = sx;
  nav.fsy = sy;
  nav.foAt = w.time;
  // (The spot another squadmate has lately worked out for itself.)
  const taken = (x: number, y: number) => {
    for (const o of w.heroes) {
      const on = o.ai?.nav;
      if (o === h || o === lead || o.downed || !on || w.time - on.foAt >= 1) continue;
      if (dist(x, y, on.fox, on.foy) < 9) return true;
    }
    return false;
  };
  const fits = (x: number, y: number) => walkClear(w.map, lead.x, lead.y, x, y, h.r) && !taken(x, y);
  nav.fox = lead.x;
  nav.foy = lead.y;
  if (clear(w.map, sx, sy, h.r, false) && fits(sx, sy)) {
    nav.fox = sx;
    nav.foy = sy;
  } else {
    const g = navGrid(w.map, h.r);
    const part = partAt(g, lead.x, lead.y);
    const c = part ? nearestCell(g, sx, sy, part, 6, (c) => fits(midX(g, c), midY(g, c))) : -1;
    if (c >= 0) {
      nav.fox = midX(g, c);
      nav.foy = midY(g, c);
    }
  }
  return [nav.fox, nav.foy];
}

/**
 * Which way to back off from these foes: of sixteen ways round, the one with the most open ground
 * (how far a body can walk that way, and how much room there is where it gets to), farthest from the
 * foes and not toward them, a little in favor of the way it was already going and of staying near its
 * leader. It holds that way a moment (no dithering) while it stays open. [0, 0] when boxed in.
 */
export function kiteDir(w: World, h: Unit, foes: readonly Unit[], lead: Unit | undefined): [number, number] {
  const nav = navOf(h);
  if (w.time < nav.kT && walkClear(w.map, h.x, h.y, h.x + nav.kdx * 6, h.y + nav.kdy * 6, h.r)) return [nav.kdx, nav.kdy];
  const g = navGrid(w.map, h.r);
  const recent = w.time < nav.kT + 0.5;
  let best = -Infinity;
  let bx = 0;
  let by = 0;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // How far a body can walk this way (up to 48 px).
    let run = 0;
    for (let s = 4; s <= 48; s += 4) {
      if (!clear(w.map, h.x + dx * s, h.y + dy * s, h.r, false)) break;
      run = s;
    }
    if (run < 4) continue;
    const x = h.x + dx * run;
    const y = h.y + dy * run;
    let near = 90;
    let toward = -1;
    for (const f of foes) {
      near = Math.min(near, dist(x, y, f.x, f.y));
      const [fx, fy] = norm(f.x - h.x, f.y - h.y);
      toward = Math.max(toward, dx * fx + dy * fy);
    }
    const c = cellAt(g, x, y);
    const room = c >= 0 ? g.room[c] / ROOM_CAP : 0;
    let score = run / 48 + room * 0.8 + near / 90 - Math.max(-1, toward) * 0.9;
    if (recent) score += (dx * nav.kdx + dy * nav.kdy) * 0.25;
    if (lead && lead !== h) score -= Math.max(0, dist(x, y, lead.x, lead.y) - 70) / 100;
    if (score > best) {
      best = score;
      bx = dx;
      by = dy;
    }
  }
  if (best === -Infinity) return [0, 0];
  nav.kdx = bx;
  nav.kdy = by;
  nav.kT = w.time + 0.2;
  return [bx, by];
}

/** Can knight h walk this frame (not rolling, landing, stunned, lunging or powering up a Legendary)? */
function free(h: Unit): boolean {
  return !h.rolling && !h.landing && h.stunT <= 0 && !h.skillSlam && h.channel?.kind !== 'lunge';
}

/**
 * The watch, once a frame before knight h's move is decided: how much headway did its last move make
 * toward where it meant to go? None for a while and it escalates: plans again, steps aside, and at
 * last hops to a free spot by its leader.
 */
export function navWatch(w: World, h: Unit, lead: Unit | undefined, dt: number): void {
  const nav = navOf(h);
  if (w.time - nav.wt > dt * 3 + 0.05) {
    // A gap (it was steered by hand, or down): the watch starts afresh.
    restartWatch(h, nav);
    nav.noProg = 0;
    nav.stage = 0;
    nav.sideT = 0;
    return;
  }
  // (Stepping aside isn't the way it means to go: the watch waits for it to finish.)
  if (nav.sideT > 0) {
    nav.sideT -= dt;
    if (nav.sideT <= 0) {
      nav.force = true;
      restartWatch(h, nav);
    }
    return;
  }
  nav.frames++;
  if (nav.wexp > 0) {
    nav.wanted++;
    nav.useful += (h.x - nav.wx) * nav.wdx + (h.y - nav.wy) * nav.wdy;
    nav.expected += nav.wexp;
  }
  // The long look: on its way to a goal the whole time, yet hardly any further from where it started
  // (to and fro, each step its way but the steps undoing each other) is no headway either.
  if (nav.loopT > 0) nav.loopT -= dt;
  nav.lt += dt;
  nav.lf++;
  if (nav.wexp > 0 && nav.wnav) {
    nav.lw++;
    nav.lexp += nav.wexp;
  }
  if (nav.lt >= LONG) {
    if (nav.lw >= nav.lf * 0.9 && nav.lexp > 8 && dist(h.x, h.y, nav.lx, nav.ly) < nav.lexp * GAINED) {
      // The first time, it steps aside; back at the same spot and to and fro again, it's as good as
      // pinned there (the step aside didn't help): it hops.
      const again = w.time - nav.loopAt < 6 && dist(h.x, h.y, nav.loopX, nav.loopY) < 16;
      nav.loops = again ? nav.loops + 1 : 1;
      nav.loopX = h.x;
      nav.loopY = h.y;
      nav.loopAt = w.time;
      nav.noProg = Math.max(nav.noProg + nav.lt, nav.loops >= 2 ? HOP_AFTER : SIDESTEP_AFTER);
      if (nav.loops < 2 && nav.stage >= 2) nav.stage = 1;
      nav.loopT = LONG;
    }
    nav.lx = h.x;
    nav.ly = h.y;
    nav.lt = nav.lf = nav.lw = nav.lexp = 0;
  }
  nav.bucket += dt;
  if (nav.bucket < WATCH) return;
  if (nav.wanted < nav.frames * 0.3) {
    // Not trying to go anywhere: nothing to watch.
    nav.noProg = 0;
    nav.stage = 0;
  } else if (nav.wanted >= nav.frames * 0.7) {
    if (nav.useful < nav.expected * HEADWAY) nav.noProg += nav.bucket;
    // (Headway takes a window of no headway back, not all of them: stuck, freed, stuck again climbs
    // on. Not while it's going to and fro, though.)
    else if (nav.loopT <= 0) nav.noProg = Math.max(0, nav.noProg - nav.bucket);
    if (nav.noProg <= 0) nav.stage = 0;
  }
  nav.bucket = nav.useful = nav.expected = nav.frames = nav.wanted = 0;
  if (nav.noProg >= HOP_AFTER) hop(w, h, lead, nav);
  else if (nav.noProg >= SIDESTEP_AFTER && nav.stage < 2) {
    nav.stage = 2;
    stepAside(w, h, nav);
  } else if (nav.noProg >= REPLAN_AFTER && nav.stage < 1) {
    nav.stage = 1;
    nav.force = true;
  }
}

/** The watch's windows start over from where h stands (what has piled up without headway stays). */
function restartWatch(h: Unit, nav: NavState): void {
  nav.bucket = nav.useful = nav.expected = nav.frames = nav.wanted = 0;
  nav.lx = h.x;
  nav.ly = h.y;
  nav.lt = nav.lf = nav.lw = nav.lexp = 0;
  nav.loopT = 0;
}

/** Steps aside for a moment: the way round from where it meant to go with the most room to walk. */
function stepAside(w: World, h: Unit, nav: NavState): void {
  const [mx, my] = nav.wdx || nav.wdy ? [nav.wdx, nav.wdy] : [1, 0];
  let best = 0;
  let bx = 0;
  let by = 0;
  for (const a of [1.05, -1.05, 1.57, -1.57, 2.1, -2.1, 2.6, -2.6, Math.PI]) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const dx = mx * c - my * s;
    const dy = mx * s + my * c;
    let run = 0;
    for (let k = 4; k <= 24; k += 4) {
      if (!walkClear(w.map, h.x, h.y, h.x + dx * k, h.y + dy * k, h.r)) break;
      run = k;
    }
    // (Of two as open, the one nearer the way it meant to go.)
    const score = run + (dx * mx + dy * my) * 2;
    if (run >= 8 && score > best) {
      best = score;
      bx = dx;
      by = dy;
    }
  }
  if (!best) return;
  nav.sideT = 0.4;
  nav.sdx = bx;
  nav.sdy = by;
  nav.path = null;
}

/**
 * The last resort: a squadmate hops to a free spot at its leader's side (a puff of dust where it was,
 * a glint where it lands), wherever it is; the leader (on Auto) a short hop on along its way.
 */
function hop(w: World, h: Unit, lead: Unit | undefined, nav: NavState): void {
  let spot: [number, number] | null = null;
  if (lead && lead !== h) spot = freeSpot(w, lead.x - lead.aimX * 12, lead.y + 8, h.r, lead.x, lead.y, 40, true);
  else if (nav.path && nav.i < nav.path.length / 2) {
    const x = nav.path[2 * nav.i];
    const y = nav.path[2 * nav.i + 1];
    const [dx, dy] = norm(x - h.x, y - h.y);
    const k = Math.min(20, dist(h.x, h.y, x, y));
    spot = freeSpot(w, h.x + dx * k, h.y + dy * k, h.r, h.x, h.y, 12);
  }
  nav.noProg = 0;
  nav.stage = 0;
  if (!spot) return;
  w.fx.push({ kind: 'dust', x: h.x, y: h.y });
  h.x = spot[0];
  h.y = spot[1];
  w.fx.push({ kind: 'spark', x: h.x, y: h.y - 8, color: '#e8f0ff' });
  nav.path = null;
  nav.force = true;
  nav.wx = h.x;
  nav.wy = h.y;
  restartWatch(h, nav);
  nav.hops++;
}

/**
 * What knight h will do with its move this frame (the AI's `want`): a step aside overrides it while
 * one lasts; and the watch notes where it is and which way it means to go, for next frame's look.
 */
export function navCommit(w: World, h: Unit, want: [number, number], dt: number): [number, number] {
  const nav = navOf(h);
  let out = want;
  const can = free(h);
  if (nav.sideT > 0 && can && Math.hypot(want[0], want[1]) > 0.3) {
    if (walkClear(w.map, h.x, h.y, h.x + nav.sdx * 4, h.y + nav.sdy * 4, h.r)) out = [nav.sdx, nav.sdy];
    else {
      nav.sideT = 0;
      nav.force = true;
    }
  }
  nav.wx = h.x;
  nav.wy = h.y;
  nav.wt = w.time;
  const len = Math.hypot(out[0], out[1]);
  if (can && len > 0.3 && nav.sideT <= 0) {
    // The way it means to go: a path's way before the feelers turned it, or the move itself.
    const fromNav = nav.navAt === w.time && !!(nav.idx || nav.idy);
    [nav.wdx, nav.wdy] = fromNav ? [nav.idx, nav.idy] : norm(out[0], out[1]);
    nav.wexp = Math.min(1, len) * h.speed * (h.slowT > 0 ? 0.6 : 1) * dt;
    nav.wnav = fromNav;
  } else {
    nav.wexp = 0;
    nav.wnav = false;
  }
  return out;
}
