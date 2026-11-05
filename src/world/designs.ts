/**
 * Floor designs: the shapes a floor can take, dealt from a shuffled deck (core/deck.ts) so the same
 * one doesn't come round again until every design has been played. Each lays out the floor's rooms
 * and carves its floor (a `Shaper` knows the biome's style: blobby caves, square halls indoors); the
 * rest of the floor (cave smoothing, paths, pools, houses and wilds, trees, props, mobs) is the same
 * for every design (mapgen.ts).
 *
 *  - chain:      rooms in a zig-zag column from the start up to the exit, a side room or two.
 *  - loop:       round a lake, a chasm, a copse or a block of houses: two ways to the exit.
 *  - plaza:      a big square with spokes to rooms round it; the way out is behind one of them.
 *  - serpent:    long lanes stacked up, switching back at their ends.
 *  - gauntlet:   round arenas joined by narrow bridges over water, a chasm or lava.
 *  - crossroads: an avenue to the exit crossed by a road out to an east and a west wing.
 *  - islands:    one wide field broken up by islands of cover (rocks, copses, pillars, gardens).
 *  - valley:     a long winding valley with ledges along its sides.
 *  - maze:       corridors and small chambers (a dungeon indoors, a warren of tunnels in a cave).
 *  - spiral:     a ring road that winds almost all the way round a walled keep before it lets you in.
 *
 * Every design keeps the start at its own pocket away from the foes, a clear way to the exit, side
 * rooms off the way (for folk to camp in), and on boss floors a different approach to the same fair
 * arena (its approach rooms stay quiet: only the arena has foes).
 */
import type { Rng } from '../core/rng';
import type { DesignId } from '../core/deck';
import type { Biome } from './biomes';
import { FLOOR, LIQUID, SOLID, type FloorMap, type Room } from './mapgen';

/** Tiles of solid ground kept round every floor. */
const MARGIN = 4;

export interface Pt {
  cx: number;
  cy: number;
}

type Area = Pt & { rx: number; ry: number };

export interface Layout {
  /** In the order spawns, props and decor see them. */
  rooms: Room[];
  start: Room;
  /** The exit room, or on a boss floor the arena. */
  exit: Room;
  /** After the cave smoothing: lakes, moats, ledges, islands of cover (things smoothing would blur). */
  after?: () => void;
}

export interface Design {
  id: DesignId;
  name: string;
  layout(g: Shaper): Layout;
}

/**
 * Carves a floor in its biome's style. `room` and `corridor` are the classic chain's (blobs and
 * wandering passages in caves, rectangles and L-shaped halls indoors); the rest are for the shapes
 * the other designs need.
 */
export class Shaper {
  m!: FloorMap;
  W = 0;
  H = 0;
  /** Blobby caves (or square halls indoors). */
  readonly cave: boolean;
  /** A liquid for lakes, moats and bridges (water, a chasm, lava; a paved town keeps its water in canals). */
  readonly wet: boolean;
  /** The town: its solid ground is lots for houses and gardens. */
  readonly town: boolean;
  /** 0 to 3: deeper floors are bigger. */
  readonly depth: number;

  constructor(
    readonly rng: Rng,
    readonly biome: Biome,
    readonly floor: number,
    readonly boss: boolean,
    readonly seed: number,
  ) {
    this.cave = biome.layout === 'cave';
    this.wet = !!biome.liquid && !biome.path.everywhere;
    this.town = !!biome.path.everywhere;
    this.depth = Math.min(3, Math.floor(floor / 10));
  }

  begin(W: number, H: number): void {
    this.W = W;
    this.H = H;
    this.m = { w: W, h: H, tiles: new Uint8Array(W * H), path: new Uint8Array(W * H), rooms: [], start: { x: 0, y: 0 }, exit: { x: 0, y: 0 }, props: [], spawns: [], seed: this.seed };
  }

  /** Sets a tile (never in the two tiles round the edge). */
  set(x: number, y: number, v: number): void {
    if (x < 2 || y < 2 || x >= this.W - 2 || y >= this.H - 2) return;
    this.m.tiles[y * this.W + x] = v;
  }

  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return SOLID;
    return this.m.tiles[y * this.W + x];
  }

  markPath(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    this.m.path[y * this.W + x] = 1;
  }

  /** The classic room: two or three overlapping wobbly ellipses in a cave, a rectangle indoors. */
  room(r: Room): void {
    const { rng } = this;
    if (this.cave) {
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
              this.set(x, yy, FLOOR);
              break;
            }
          }
        }
      }
    } else {
      for (let yy = r.cy - r.ry; yy <= r.cy + r.ry; yy++) for (let x = r.cx - r.rx; x <= r.cx + r.rx; x++) this.set(x, yy, FLOOR);
    }
  }

  /** The classic corridor: a wandering passage with a cobbled middle in a cave, an L-shaped hall indoors. */
  corridor(a: Pt, b: Pt): void {
    const { rng, W } = this;
    if (this.cave) {
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
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 2; ox++) this.set(x + ox, yy + oy, FLOOR);
        this.markPath(x, yy);
        if (rng.chance(0.5)) this.markPath(x + rng.pick([-1, 1]), yy);
      }
    } else {
      // An L-shaped hall, 3 wide.
      const bend = rng.chance(0.5);
      const hx = (x0: number, x1: number, yy: number) => {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          for (let o = -1; o <= 1; o++) this.set(x, yy + o, FLOOR);
          this.markPath(x, yy);
        }
      };
      const vy = (y0: number, y1: number, x: number) => {
        for (let yy = Math.min(y0, y1); yy <= Math.max(y0, y1); yy++) {
          for (let o = -1; o <= 1; o++) this.set(x + o, yy, FLOOR);
          this.markPath(x, yy);
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
  }

  /** Corridors through waypoints, in order. */
  route(...pts: Pt[]): void {
    for (let i = 0; i < pts.length - 1; i++) this.corridor(pts[i], pts[i + 1]);
  }

  /** An open space: one softly wobbling oval in a cave (no extra lobes, so its shape holds), a rectangle indoors. */
  space(r: Area, wobble = 0.12): void {
    if (this.cave) this.oval(r.cx, r.cy, r.rx, r.ry, FLOOR, wobble);
    else this.box(r.cx - r.rx, r.cy - r.ry, r.cx + r.rx, r.cy + r.ry, FLOOR);
  }

  /** Fills a wobbly oval with `v`, only over tiles that are `from` (if given). */
  oval(cx: number, cy: number, rx: number, ry: number, v: number, wobble = 0.12, from = -1): void {
    const phase = this.rng.next() * Math.PI * 2;
    const k = 1 + wobble;
    for (let y = Math.floor(cy - ry * k) - 1; y <= Math.ceil(cy + ry * k) + 1; y++) {
      for (let x = Math.floor(cx - rx * k) - 1; x <= Math.ceil(cx + rx * k) + 1; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const a = Math.atan2(y - cy, x - cx);
        const wob = 1 + wobble * (0.67 * Math.sin(a * 3 + phase) + 0.33 * Math.sin(a * 5 + phase * 2));
        if (dx * dx + dy * dy <= wob * wob && (from < 0 || this.at(x, y) === from)) this.set(x, y, v);
      }
    }
  }

  /** Fills a rectangle of tiles (inclusive) with `v`, only over tiles that are `from` (if given). */
  box(x0: number, y0: number, x1: number, y1: number, v: number, from = -1): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (from < 0 || this.at(x, y) === from) this.set(x, y, v);
  }

  /**
   * A straight band `half` tiles either side of the line (a bridge, an avenue), all of it road: lamps,
   * fences and furniture stand beside it, never in it, so it's never pinched narrower than it is.
   */
  lane(a: Pt, b: Pt, half = 1): void {
    this.walk(a, b, (x, y) => {
      for (let oy = -half; oy <= half; oy++) {
        for (let ox = -half; ox <= half; ox++) {
          this.set(x + ox, y + oy, FLOOR);
          this.markPath(x + ox, y + oy);
        }
      }
    });
  }

  /**
   * A gallery `half` tiles either side of the line: a string of overlapping wobbly ovals in a cave (a
   * tunnel with a ragged edge), a straight band indoors. Its middle is on the path.
   */
  tube(a: Pt, b: Pt, half: number): void {
    if (!this.cave) return this.lane(a, b, half);
    const n = Math.max(1, Math.round(Math.hypot(b.cx - a.cx, b.cy - a.cy) / 3));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(a.cx + ((b.cx - a.cx) * k) / n);
      const y = Math.round(a.cy + ((b.cy - a.cy) * k) / n);
      this.oval(x, y, half + 1.5, half + 0.5, FLOOR, 0.18);
    }
    this.walk(a, b, (x, y) => this.markPath(x, y));
  }

  /** Marks the path material along a line (a trail over open ground), carving nothing. */
  trail(a: Pt, b: Pt): void {
    this.walk(a, b, (x, y) => this.markPath(x, y));
  }

  /** Every tile along a line, edge to edge (a step across and a step down never meet only at a corner). */
  private walk(a: Pt, b: Pt, fn: (x: number, y: number) => void): void {
    let x = Math.round(a.cx);
    let y = Math.round(a.cy);
    const x1 = Math.round(b.cx);
    const y1 = Math.round(b.cy);
    const n = Math.max(Math.abs(x1 - x), Math.abs(y1 - y));
    fn(x, y);
    for (let k = 1; k <= n; k++) {
      const nx = Math.round(a.cx + ((b.cx - a.cx) * k) / n);
      const ny = Math.round(a.cy + ((b.cy - a.cy) * k) / n);
      if (nx !== x && ny !== y) fn(nx, y);
      x = nx;
      y = ny;
      fn(x, y);
    }
  }

  /** A room's center kept clear of the map's margin. */
  clampX(cx: number, rx: number): number {
    return Math.max(MARGIN + rx + 1, Math.min(this.W - MARGIN - rx - 2, Math.round(cx)));
  }
}

// ------------------------------------------------------------------ shared pieces

/** How many rooms with foes in them (the exit and side rooms count, the start doesn't): about the chain's. */
function fights(g: Shaper): number {
  return 5 + g.depth + g.rng.int(0, 1);
}

function startRoom(g: Shaper, cx: number, cy: number): Room {
  return { cx, cy, rx: g.cave ? 4 : 5, ry: g.cave ? 3 : 4, kind: 'start' };
}

function arenaRoom(cx: number, cy: number): Room {
  return { cx, cy, rx: 11, ry: 9, kind: 'arena' };
}

/** A fighting room's size: a little smaller than the chain's big blobs (designs fit more round it). */
function roomSize(g: Shaper): { rx: number; ry: number } {
  const { rng } = g;
  if (g.cave) return { rx: rng.int(5, 7), ry: rng.int(4, 5) };
  return { rx: rng.int(4, 6), ry: rng.int(3, 4) };
}

function sideSize(g: Shaper): { rx: number; ry: number } {
  return { rx: g.cave ? g.rng.int(3, 4) : 3, ry: 3 };
}

/** On a boss floor only the arena has foes: everything on the way there is quiet. */
function hush(g: Shaper, rooms: Room[]): void {
  if (g.boss) for (const r of rooms) if (r.kind === 'normal' || r.kind === 'side') r.quiet = true;
}

/** Moves rooms up or down so the topmost sits just under the margin; returns the bottom-most edge. */
function settle(rooms: Area[]): number {
  const top = Math.min(...rooms.map((r) => r.cy - r.ry));
  const dy = MARGIN + 2 - top;
  for (const r of rooms) r.cy += dy;
  return Math.max(...rooms.map((r) => r.cy + r.ry));
}

// ------------------------------------------------------------------ chain

/** Rooms in a zig-zag column from the start (bottom) to the exit (top), a side room or two. */
function chain(g: Shaper): Layout {
  const { rng, cave, boss, floor } = g;
  const W = 46;
  const margin = MARGIN;
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
  g.begin(W, y + margin);
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
  for (const r of rooms) g.room(r);
  for (let i = 0; i < main.length - 1; i++) g.corridor(main[i], main[i + 1]);
  for (const [p, s] of sides) g.corridor(p, s);
  return { rooms, start: main[main.length - 1], exit: main[0] };
}

// ------------------------------------------------------------------ loop

/**
 * Round something in the middle (a lake, a chasm or a lava pit, a copse, a mesa, a block of houses):
 * from the start a fork, then a way up each side past a room or two to the exit beyond.
 */
function loop(g: Shaper): Layout {
  const { rng, cave, boss } = g;
  const W = 50;
  const ox = W / 2 + rng.int(-1, 1);
  const per = boss ? 0 : g.depth >= 2 ? 3 : 2;
  const branch = { rx: cave ? 5 : 4, ry: cave ? rng.int(4, 5) : rng.int(3, 4) };
  // The obstacle as wide as the branches either side of it allow.
  const orx = Math.min(boss ? 5 : 8, ox - (MARGIN + 2 * branch.rx + 4));
  const ory = boss ? rng.int(4, 5) : 9 + g.depth * 2 + rng.int(0, 2);
  const exit: Room = boss ? arenaRoom(ox, 0) : { cx: ox + rng.int(-3, 3), cy: 0, rx: cave ? rng.int(5, 6) : rng.int(4, 5), ry: cave ? 4 : 3, kind: 'exit' };
  let y = MARGIN + 2;
  exit.cy = y + exit.ry;
  y = exit.cy + exit.ry + rng.int(4, 5);
  const oy = y + ory;
  y = oy + ory + rng.int(4, 5);
  const fork: Room = { cx: ox + rng.int(-2, 2), cy: 0, rx: cave ? 5 : 4, ry: 3, kind: 'normal', quiet: true };
  fork.cy = y + fork.ry;
  y = fork.cy + fork.ry + rng.int(4, 6);
  const start = startRoom(g, fork.cx + rng.int(-3, 3), 0);
  start.cy = y + start.ry;
  g.begin(W, start.cy + start.ry + MARGIN + 2);
  const lake = g.wet && (g.biome.layout === 'rooms' || rng.chance(0.65));
  // The branches: rooms up each side, hugging the obstacle.
  const wx = ox - orx - 2 - branch.rx;
  const ex = ox + orx + 2 + branch.rx;
  const west: Room[] = [];
  const east: Room[] = [];
  for (let k = 0; k < per; k++) {
    const t = (k / Math.max(1, per - 1)) * 2 - 1;
    const by = Math.round(oy + t * ory * 0.6);
    west.push({ cx: wx + rng.int(-1, 0), cy: by + rng.int(-1, 1), rx: branch.rx, ry: branch.ry, kind: 'normal' });
    east.push({ cx: ex + rng.int(0, 1), cy: by + rng.int(-1, 1), rx: branch.rx, ry: branch.ry, kind: 'normal' });
  }
  // Side rooms in the bottom corners, off the fork.
  const sides: Room[] = [];
  if (!boss) {
    for (const dir of rng.shuffle([-1, 1]).slice(0, rng.int(1, 2))) {
      const s = sideSize(g);
      sides.push({ cx: g.clampX(ox + dir * rng.int(12, 15), s.rx), cy: start.cy - rng.int(0, 2), ...s, kind: 'side' });
    }
  }
  const rooms: Room[] = [exit, ...west, ...east, fork, ...sides, start];
  if (lake) {
    // A shore all round the water, so the two ways meet round it.
    g.oval(ox, oy, orx + 2, ory + 2, FLOOR, 0.1);
  }
  for (const r of [exit, fork, start]) g.space(r);
  for (const r of [...west, ...east, ...sides]) g.space(r);
  // Each way: out from the fork along its side, up past its rooms, and in to the exit from the side.
  const topY = exit.cy + (boss ? exit.ry - 2 : 0);
  g.route(fork, { cx: wx, cy: fork.cy }, ...west.slice().reverse(), { cx: wx, cy: topY }, { cx: exit.cx, cy: topY });
  g.route(fork, { cx: ex, cy: fork.cy }, ...east.slice().reverse(), { cx: ex, cy: topY }, { cx: exit.cx, cy: topY });
  g.corridor(start, fork);
  for (const s of sides) g.corridor({ cx: s.cx < ox ? wx : ex, cy: fork.cy }, s);
  hush(g, rooms);
  return {
    rooms,
    start,
    exit,
    after: () => {
      if (lake) {
        g.oval(ox, oy, orx, ory, LIQUID, 0.14, FLOOR);
        // A big lake has an islet of rocks or trees.
        if (orx >= 5 && ory >= 9) g.oval(ox, oy, Math.max(1.5, orx * 0.35), ory * 0.3, SOLID, 0.2, LIQUID);
      } else {
        // The block in the middle stays whole (a room's lobe may have bitten into it).
        g.oval(ox, oy, orx, ory, SOLID, 0.1, FLOOR);
      }
    },
  };
}

// ------------------------------------------------------------------ plaza

/** A big square in the middle, spokes out to rooms round it, and the way out behind one of them. */
function plaza(g: Shaper): Layout {
  const { rng, cave, boss } = g;
  const W = 52;
  const mid = W / 2;
  const P: Room = { cx: mid + rng.int(-1, 1), cy: 0, rx: boss ? 5 : cave ? 7 : 6, ry: boss ? 4 : cave ? 6 : 5, kind: 'normal' };
  const spoke = (dir: -1 | 0 | 1): Room => {
    const s = boss ? sideSize(g) : g.cave ? { rx: rng.int(4, 5), ry: rng.int(4, 5) } : { rx: rng.int(4, 5), ry: 4 };
    if (dir === 0) return { cx: P.cx + rng.int(-6, 6), cy: P.cy - P.ry - rng.int(5, 7) - s.ry, ...s, kind: 'normal' };
    const cx = dir < 0 ? MARGIN + s.rx + 2 : W - MARGIN - s.rx - 3;
    return { cx, cy: P.cy + rng.int(-3, 2), ...s, kind: 'normal' };
  };
  const west = spoke(-1);
  const east = spoke(1);
  const north: Room = boss ? arenaRoom(P.cx, P.cy - P.ry - rng.int(5, 6) - 9) : spoke(0);
  const rooms: Room[] = [];
  let exit: Room;
  const extra: Room[] = [];
  const links: Array<[Pt, Pt]> = [];
  if (boss) exit = north;
  else {
    // The way out is behind the west or the east spoke (or past the north room).
    const via = rng.weighted([[west, 2], [east, 2], [north, 1]] as const);
    let from: Room = via;
    if (g.depth >= 2) {
      // Deeper down, one more room on the way.
      const s = roomSize(g);
      const r: Room = { cx: g.clampX(via.cx + rng.int(-2, 2), s.rx), cy: via.cy - via.ry - rng.int(5, 6) - s.ry, ...s, kind: 'normal' };
      extra.push(r);
      links.push([via, r]);
      from = r;
    }
    const ex = { rx: cave ? rng.int(5, 6) : rng.int(4, 5), ry: 4 };
    exit = { cx: g.clampX(from.cx + (via === west ? 1 : via === east ? -1 : 0) * rng.int(0, 4), ex.rx), cy: from.cy - from.ry - rng.int(5, 7) - ex.ry, ...ex, kind: 'exit' };
    links.push([from, exit]);
  }
  // Side rooms below the west and east spokes.
  const sides: Room[] = [];
  if (!boss) {
    for (const s of rng.shuffle([west, east]).slice(0, rng.int(1, 2))) {
      const sz = sideSize(g);
      sides.push({ cx: s.cx + rng.int(-1, 1), cy: s.cy + s.ry + rng.int(4, 6) + sz.ry, ...sz, kind: 'side' });
    }
  }
  const start = startRoom(g, P.cx + rng.int(-4, 4), P.cy + P.ry + rng.int(5, 7) + (cave ? 3 : 4));
  rooms.push(exit, ...extra, north, west, east, P, ...sides, start);
  const uniq = [...new Set(rooms)];
  const bottom = settle(uniq);
  g.begin(W, bottom + MARGIN + 3);
  for (const r of uniq) g.space(r);
  g.corridor(start, P);
  for (const s of [west, east, north]) g.corridor(P, s);
  for (const [a, b] of links) g.corridor(a, b);
  for (const s of sides) g.corridor(s.cx < mid ? west : east, s);
  hush(g, uniq);
  return { rooms: uniq, start, exit };
}

// ------------------------------------------------------------------ serpent

/** Long lanes stacked one over another, switching back at their ends: the start at the bottom's far end. */
function serpent(g: Shaper): Layout {
  const { rng, cave, boss } = g;
  const W = 46;
  // A column beside the lanes for side rooms, on one side or the other.
  const sideRight = rng.chance(0.5);
  const xL = sideRight ? 6 : 12;
  const xR = sideRight ? 33 : 39;
  const n = boss ? 2 : 4 + Math.min(2, Math.floor(g.floor / 12)) + rng.int(0, 1);
  const hy = cave ? 3 : 2;
  const wall = cave ? 4 : 3;
  const pitch = 2 * hy + 1 + wall;
  let top = MARGIN + 2;
  let arena: Room | null = null;
  if (boss) {
    arena = arenaRoom(W / 2, top + 9);
    top = arena.cy + arena.ry + 5;
  }
  const laneY = (i: number) => top + hy + i * pitch;
  g.begin(W, laneY(n - 1) + hy + MARGIN + 3);
  // Lane i (0 at the top) is entered at its left end or its right; the bottom one at the start.
  const entersLeft: boolean[] = [];
  entersLeft[n - 1] = rng.chance(0.5);
  for (let i = n - 2; i >= 0; i--) entersLeft[i] = !entersLeft[i + 1];
  const endX = (left: boolean) => (left ? xL + 2 : xR - 2);
  const turnX = (left: boolean) => (left ? xL + 3 : xR - 3);
  for (let i = 0; i < n; i++) g.tube({ cx: xL, cy: laneY(i) }, { cx: xR, cy: laneY(i) }, hy);
  // The turns: lane i+1 leaves at the end lane i is entered from.
  for (let i = 0; i < n - 1; i++) g.lane({ cx: turnX(entersLeft[i]), cy: laneY(i + 1) }, { cx: turnX(entersLeft[i]), cy: laneY(i) }, 1);
  const start = startRoom(g, endX(entersLeft[n - 1]), laneY(n - 1));
  start.ry = hy;
  const rooms: Room[] = [];
  let exit: Room;
  if (arena) {
    exit = arena;
    g.space(arena);
    const x = turnX(!entersLeft[0]);
    g.corridor({ cx: x, cy: laneY(0) }, { cx: Math.max(arena.cx - 7, Math.min(arena.cx + 7, x)), cy: arena.cy + arena.ry - 2 });
  } else {
    exit = { cx: endX(!entersLeft[0]), cy: laneY(0), rx: cave ? 4 : 3, ry: hy + 1, kind: 'exit' };
    g.space(exit);
  }
  rooms.push(exit);
  // Fighting rooms along the lanes: each lane's middle first (staggered left and right, so two never
  // face each other through one wall), then their far ends; none by the start or the exit.
  if (!boss) {
    const want = fights(g) - 2;
    const mid = (xL + xR) / 2;
    const spots: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) spots.push([i, mid + (i % 2 ? 4 : -4) + rng.int(-2, 2)]);
    for (let i = 0; i < n; i++) spots.push([i, i % 2 ? xL + 6 : xR - 6]);
    const ok = ([i, x]: [number, number]) => !(i === n - 1 && Math.abs(x - start.cx) < 11) && !(i === 0 && Math.abs(x - exit.cx) < 9);
    for (const [i, x] of spots.filter(ok).slice(0, want)) {
      const r: Room = { cx: Math.round(x), cy: laneY(i), rx: cave ? rng.int(5, 6) : rng.int(4, 5), ry: hy, kind: 'normal' };
      rooms.push(r);
      g.space(r, 0.08);
    }
  }
  // Side rooms in the column beside the lanes, each off a lane's end.
  if (!boss) {
    const lanes = rng.shuffle([...Array(n).keys()].filter((i) => i > 0 && i < n - 1));
    for (const i of lanes.slice(0, rng.int(1, 2))) {
      const s = { rx: 3, ry: Math.min(hy, 3) };
      const r: Room = { cx: sideRight ? xR + 6 : xL - 6, cy: laneY(i), ...s, kind: 'side' };
      rooms.push(r);
      g.space(r);
      g.lane({ cx: sideRight ? xR : xL, cy: laneY(i) }, r, 1);
    }
  }
  rooms.push(start);
  g.space(start);
  hush(g, rooms);
  return { rooms, start, exit };
}

// ------------------------------------------------------------------ gauntlet

/** Round arenas one above another, joined by narrow bridges over water, a chasm or lava. */
function gauntlet(g: Shaper): Layout {
  const { rng, cave, boss } = g;
  const W = 56;
  const mid = W / 2;
  const areas: Room[] = [];
  if (boss) {
    areas.push(arenaRoom(mid, 0));
    if (rng.chance(0.5)) areas.push({ cx: mid + rng.pick([-4, 4]), cy: 0, rx: 4, ry: 3, kind: 'normal' });
  } else {
    areas.push({ cx: mid + rng.int(-2, 2), cy: 0, rx: cave ? 5 : 4, ry: cave ? 4 : 3, kind: 'exit' });
    const n = 3 + (g.floor >= 15 ? 1 : 0) + rng.int(0, 1);
    for (let k = 0; k < n; k++) {
      const s = cave ? { rx: rng.int(6, 8), ry: rng.int(5, 6) } : { rx: rng.int(5, 7), ry: rng.int(4, 5) };
      areas.push({ cx: mid + (k % 2 ? 1 : -1) * rng.int(2, 4), cy: 0, ...s, kind: 'normal' });
    }
  }
  const start = startRoom(g, mid + rng.int(-2, 2), 0);
  areas.push(start);
  let y = MARGIN + 2;
  const gaps: number[] = [];
  for (const a of areas) {
    a.cy = y + a.ry;
    const gap = boss ? rng.int(7, 9) : rng.int(5, 7);
    gaps.push(gap);
    y = a.cy + a.ry + gap;
  }
  g.begin(W, start.cy + start.ry + MARGIN + 3);
  for (const a of areas) g.space(a, 0.08);
  // The bridges, three wide, straight up from one to the next. Each spans a gap (in tiles: from a0 to
  // a1 along it, `at` across it).
  type Gap = { up: boolean; at: number; a0: number; a1: number };
  const gapsUnder: Gap[] = [];
  for (let k = 0; k < areas.length - 1; k++) {
    const a = areas[k];
    const b = areas[k + 1];
    const x = Math.round((a.cx + b.cx) / 2);
    g.lane({ cx: x, cy: a.cy }, { cx: x, cy: b.cy }, 1);
    gapsUnder.push({ up: true, at: x, a0: a.cy + a.ry, a1: b.cy - b.ry });
  }
  // Side islands off an arena or two, each on a short bridge of its own.
  const rooms: Room[] = [...areas.slice(0, -1)];
  if (!boss) {
    const arenas = rng.shuffle(areas.filter((a) => a.kind === 'normal'));
    let want = rng.int(1, 2);
    for (const a of arenas) {
      if (want <= 0) break;
      const dir = a.cx < mid ? -1 : 1;
      const s = sideSize(g);
      const edge = a.cx + dir * a.rx;
      const cx = edge + dir * (rng.int(3, 4) + s.rx);
      if (cx - s.rx < MARGIN + 1 || cx + s.rx > W - MARGIN - 2) continue;
      want--;
      const r: Room = { cx, cy: a.cy + rng.int(-1, 1), ...s, kind: 'side' };
      rooms.push(r);
      g.space(r, 0.08);
      g.lane({ cx: a.cx, cy: r.cy }, r, 1);
      gapsUnder.push({ up: false, at: r.cy, a0: Math.min(edge, cx - dir * s.rx), a1: Math.max(edge, cx - dir * s.rx) });
    }
  }
  rooms.push(start);
  hush(g, rooms);
  return {
    rooms,
    start,
    exit: areas[0],
    after: () => {
      if (!g.wet) return;
      // Water (a chasm, lava) under every bridge, filling its gap from wall to wall.
      for (const b of gapsUnder) {
        const len = b.a1 - b.a0;
        if (len < 2) continue;
        const half = len / 2 + 1;
        const c = (b.a0 + b.a1) / 2;
        const wide = b.up ? rng.int(7, 10) : rng.int(4, 5);
        const [x, y, rx, ry] = b.up ? [b.at, c, wide, half] : [c, b.at, half, wide];
        if (cave) g.oval(x, y, rx, ry, LIQUID, 0.15, SOLID);
        else g.box(Math.round(x - rx + (b.up ? 0 : 1)), Math.round(y - ry + (b.up ? 1 : 0)), Math.round(x + rx - (b.up ? 0 : 1)), Math.round(y + ry - (b.up ? 1 : 0)), LIQUID, SOLID);
      }
    },
  };
}

// ------------------------------------------------------------------ crossroads

/** An avenue from the start up to the exit, crossed in the middle by a road out to two wings. */
function crossroads(g: Shaper): Layout {
  const { rng, cave, boss } = g;
  const W = 50;
  const ax = W / 2 + rng.int(-2, 2);
  // The exit, the crossing, the two wings and a side room are five of the floor's fights; the rest
  // are rooms along the avenue, south of the crossing first.
  const along = boss ? 0 : Math.max(1, fights(g) - 5);
  const nSouth = Math.ceil(along / 2);
  const nNorth = along - nSouth;
  const avenue: Room[] = [];
  const exit: Room = boss ? arenaRoom(ax, 0) : { cx: ax + rng.int(-2, 2), cy: 0, rx: cave ? rng.int(5, 6) : rng.int(4, 5), ry: 4, kind: 'exit' };
  avenue.push(exit);
  for (let k = 0; k < nNorth; k++) avenue.push({ cx: ax + rng.int(-3, 3), cy: 0, ...roomSize(g), kind: 'normal' });
  const cross: Room = { cx: ax, cy: 0, rx: boss ? 4 : cave ? rng.int(6, 7) : rng.int(5, 6), ry: boss ? 3 : cave ? 5 : 4, kind: 'normal' };
  avenue.push(cross);
  for (let k = 0; k < nSouth; k++) avenue.push({ cx: ax + rng.int(-3, 3), cy: 0, ...roomSize(g), kind: 'normal' });
  const start = startRoom(g, ax + rng.int(-2, 2), 0);
  avenue.push(start);
  let y = MARGIN + 2;
  for (const r of avenue) {
    r.cy = y + r.ry;
    y = r.cy + r.ry + rng.int(4, 6);
  }
  // The wings: out along the cross road, a room at each end and a side room off it.
  const wing = (dir: -1 | 1): Room => {
    const s = boss ? sideSize(g) : roomSize(g);
    return { cx: dir < 0 ? MARGIN + s.rx + 2 : W - MARGIN - s.rx - 3, cy: cross.cy + rng.int(-2, 2), ...s, kind: 'normal' };
  };
  const west = wing(-1);
  const east = wing(1);
  const sides: Room[] = [];
  if (!boss) {
    for (const w of rng.shuffle([west, east]).slice(0, g.depth >= 2 ? 2 : 1)) {
      const s = sideSize(g);
      const up = rng.chance(0.5) ? -1 : 1;
      sides.push({ cx: w.cx + rng.int(-1, 2) * (w === west ? 1 : -1), cy: w.cy + up * (w.ry + rng.int(4, 5) + s.ry), ...s, kind: 'side' });
    }
  }
  const all = [...avenue, west, east, ...sides];
  const bottom = settle(all);
  g.begin(W, bottom + MARGIN + 3);
  // The roads: straight, three wide (the avenue from the start to the exit, the cross road wing to wing).
  g.lane({ cx: ax, cy: start.cy }, { cx: ax, cy: exit.cy }, 1);
  g.lane({ cx: west.cx, cy: cross.cy }, { cx: east.cx, cy: cross.cy }, 1);
  for (const r of all) g.space(r);
  for (const r of avenue) if (r.cx !== ax) g.trail({ cx: ax, cy: r.cy }, r);
  for (const w of [west, east]) if (w.cy !== cross.cy) g.corridor({ cx: w.cx, cy: cross.cy }, w);
  for (const s of sides) g.corridor(s.cx < ax ? west : east, s);
  const rooms: Room[] = [exit, ...avenue.slice(1, -1), west, east, ...sides, start];
  hush(g, rooms);
  return { rooms, start, exit };
}

// ------------------------------------------------------------------ islands

/** One wide field from the start up to the exit, broken by islands of cover for open fights. */
function islands(g: Shaper): Layout {
  const { rng, cave, boss } = g;
  const W = 46;
  const mid = W / 2;
  const fw = cave ? 14 : 13;
  const zones = boss ? 2 : Math.max(4, fights(g) - 2);
  const zry = cave ? 6 : 5;
  const exit: Room = boss ? arenaRoom(mid, 0) : { cx: mid + rng.int(-3, 3), cy: 0, rx: 4, ry: 3, kind: 'exit' };
  let y = MARGIN + 2;
  exit.cy = y + exit.ry;
  // Coves off the field's top corners (side rooms), either side of the way out.
  const sides: Room[] = [];
  if (!boss) {
    for (const dir of rng.shuffle([-1, 1]).slice(0, rng.int(1, 2))) {
      const s = sideSize(g);
      sides.push({ cx: mid + dir * rng.int(11, 12), cy: exit.cy + rng.int(0, 1), ...s, kind: 'side' });
    }
  }
  y = Math.max(exit.cy + exit.ry, ...sides.map((s) => s.cy + s.ry)) + rng.int(3, 4);
  const fieldTop = y;
  const zoneRooms: Room[] = [];
  for (let k = 0; k < zones; k++) {
    zoneRooms.push({ cx: mid + rng.int(-2, 2), cy: y + zry, rx: fw - 2, ry: zry, kind: 'normal' });
    y += 2 * zry + 1;
  }
  const fieldBottom = y - 1;
  y += rng.int(4, 5);
  const start = startRoom(g, mid + rng.int(-3, 3), 0);
  start.cy = y + start.ry;
  g.begin(W, start.cy + start.ry + MARGIN + 3);
  // The field: a rounded rectangle with ragged edges.
  const p1 = rng.next() * 6.28;
  const p2 = rng.next() * 6.28;
  for (let yy = fieldTop; yy <= fieldBottom; yy++) {
    const t = Math.min(yy - fieldTop, fieldBottom - yy);
    const round = t < 3 ? 3 - t : 0;
    const l = mid - fw + round + (cave ? Math.round(1.3 * Math.sin(yy * 0.41 + p1) + 0.8 * Math.sin(yy * 0.13 + p2)) : 0);
    const r = mid + fw - round + (cave ? Math.round(1.3 * Math.sin(yy * 0.37 + p2) + 0.8 * Math.sin(yy * 0.11 + p1)) : 0);
    g.box(l, yy, r, yy, FLOOR);
  }
  g.space(exit);
  g.space(start);
  for (const s of sides) g.space(s);
  g.corridor(exit, { cx: exit.cx, cy: fieldTop + 2 });
  g.corridor(start, { cx: start.cx, cy: fieldBottom - 2 });
  for (const s of sides) g.corridor(s, { cx: s.cx + (s.cx < mid ? 2 : -2), cy: fieldTop + 2 });
  // A trail across the field from the start to the exit, by each zone's middle.
  const pts: Pt[] = [{ cx: start.cx, cy: fieldBottom }, ...zoneRooms.slice().reverse().map((z) => ({ cx: z.cx + rng.int(-4, 4), cy: z.cy })), { cx: exit.cx, cy: fieldTop }];
  for (let k = 0; k < pts.length - 1; k++) g.trail(pts[k], pts[k + 1]);
  const rooms: Room[] = [exit, ...zoneRooms, ...sides, start];
  hush(g, rooms);
  return {
    rooms,
    start,
    exit,
    after: () => {
      // Islands of cover on a staggered grid: rocks and copses in a cave (here and there a pond),
      // rows of pillars indoors, gardens in a town (big enough for a house). Each has open floor all
      // round it (so none can cut the field in two) and two tiles at least between it and the next.
      const W2 = g.W;
      const island = new Uint8Array(W2 * g.H);
      const indoor = !cave;
      const stepY = g.town ? 7 : indoor ? 5 : 5;
      const stepX = g.town ? 8 : indoor ? 5 : 6;
      let row = 0;
      for (let cy = fieldTop + 3; cy <= fieldBottom - 3; cy += stepY + (indoor ? 0 : rng.int(0, 1)), row++) {
        for (let cx = mid - fw + 2 + (row % 2 && !indoor ? Math.floor(stepX / 2) : 0); cx <= mid + fw - 2; cx += stepX) {
          const x = cx + (indoor ? 0 : rng.int(-1, 1));
          const yy = cy + (indoor ? 0 : rng.int(-1, 1));
          if (!rng.chance(indoor ? 0.9 : 0.85)) continue;
          if (zoneRooms.some((z) => Math.abs(z.cx - x) <= 3 && Math.abs(z.cy - yy) <= 2)) continue;
          // Its size in tiles.
          const [w, h] = g.town ? rng.pick([[5, 5], [4, 5], [5, 4], [3, 3]] as const) : indoor ? rng.pick([[2, 2], [2, 2], [3, 2], [2, 3]] as const) : rng.pick([[3, 3], [3, 3], [4, 3], [3, 2], [5, 3], [2, 2]] as const);
          const x0 = x - Math.floor(w / 2);
          const y0 = yy - Math.floor(h / 2);
          let clear = true;
          for (let ty = y0 - 2; ty <= y0 + h + 1 && clear; ty++) {
            for (let tx = x0 - 2; tx <= x0 + w + 1 && clear; tx++) {
              const ring1 = tx >= x0 - 1 && tx <= x0 + w && ty >= y0 - 1 && ty <= y0 + h;
              if (island[ty * W2 + tx]) clear = false;
              else if (ring1 && (g.at(tx, ty) !== FLOOR || g.m.path[ty * W2 + tx])) clear = false;
            }
          }
          if (!clear) continue;
          const v = g.wet && !indoor && rng.chance(0.2) ? LIQUID : SOLID;
          if (cave && !g.town) g.oval(x0 + (w - 1) / 2, y0 + (h - 1) / 2, w / 2 - 0.05, h / 2 - 0.05, v, 0.12, FLOOR);
          else g.box(x0, y0, x0 + w - 1, y0 + h - 1, v);
          for (let ty = y0; ty < y0 + h; ty++) for (let tx = x0; tx < x0 + w; tx++) island[ty * W2 + tx] = 1;
        }
      }
    },
  };
}

// ------------------------------------------------------------------ valley

/** A long valley winding up from the start to the exit, with ledges along its sides. */
function valley(g: Shaper): Layout {
  const { rng, cave, boss } = g;
  const W = 46;
  const mid = W / 2;
  const amp = rng.int(4, 6);
  const period = rng.int(34, 48);
  const p1 = rng.next() * Math.PI * 2;
  const p2 = rng.next() * Math.PI * 2;
  const len = boss ? 24 : 58 + 8 * g.depth + rng.int(0, 8);
  const center = (y: number) => Math.round(mid + amp * Math.sin((y / period) * Math.PI * 2 + p1));
  const half = (y: number) => (cave ? 4 : 3) + Math.round(1.1 * Math.sin((y / 17) * Math.PI * 2 + p2) + 0.4);
  const exit: Room = boss ? arenaRoom(mid, 0) : { cx: 0, cy: 0, rx: cave ? 5 : 4, ry: 4, kind: 'exit' };
  exit.cy = MARGIN + 2 + exit.ry;
  const vTop = exit.cy + exit.ry - 1;
  const vBottom = vTop + len;
  if (!boss) exit.cx = center(exit.cy);
  const start = startRoom(g, center(vBottom), vBottom + 1);
  g.begin(W, start.cy + start.ry + MARGIN + 3);
  for (let y = vTop; y <= vBottom; y++) {
    const c = center(y);
    const h = half(y);
    g.box(c - h, y, c + h, y, FLOOR);
    g.markPath(c, y);
    if (y % 3) g.markPath(c + (y % 2 ? 1 : -1), y);
  }
  g.space(exit);
  g.space(start);
  // Rooms (wider bends) along it.
  const rooms: Room[] = [exit];
  const want = boss ? 1 : Math.max(2, fights(g) - 3);
  const step = (vBottom - vTop - 12) / Math.max(1, want);
  const along: Room[] = [];
  for (let k = 0; k < want; k++) {
    const y = Math.round(vTop + 6 + step * (k + 0.5));
    const r: Room = { cx: center(y), cy: y, rx: half(y) + 2, ry: cave ? 4 : 3, kind: 'normal' };
    along.push(r);
    g.space(r, 0.1);
  }
  rooms.push(...along);
  const ledges: Room[] = [];
  hush(g, rooms);
  rooms.push(start);
  return {
    rooms,
    start,
    exit,
    after: () => {
      // Ledges: a strip of floor beside the valley behind a low ridge, open to the valley at one end,
      // between the bends where the valley is narrow, on the side it has swung away from.
      const n = boss ? 1 : 2 + (g.depth >= 2 ? 1 : 0);
      const marks: number[] = [];
      const ends = [vTop + 4, ...along.map((r) => r.cy), vBottom - 4];
      for (let k = 0; k < ends.length - 1; k++) marks.push(Math.round((ends[k] + ends[k + 1]) / 2));
      for (const cy of rng.shuffle(marks).slice(0, n)) {
        const side = center(cy) > mid ? -1 : 1;
        const y0 = cy - rng.int(4, 5);
        const y1 = cy + rng.int(4, 5);
        const wide = cave ? 4 : 3;
        // How far the valley reaches on that side, row by row (the ridge stands two tiles past it).
        let far = side > 0 ? 0 : W;
        for (let y = y0 - 1; y <= y1 + 1; y++) {
          let x = center(Math.min(vBottom, Math.max(vTop, y)));
          while (g.at(x + side, y) === FLOOR && x > 2 && x < W - 3) x += side;
          far = side > 0 ? Math.max(far, x) : Math.min(far, x);
        }
        const x0 = far + side * 3;
        const x1 = x0 + side * (wide - 1);
        let ok = Math.min(x0, x1) >= MARGIN && Math.max(x0, x1) <= W - MARGIN - 1;
        for (let y = y0 - 1; y <= y1 + 1 && ok; y++) for (let x = Math.min(x0, x1) - 1; x <= Math.max(x0, x1) + 1; x++) if (g.at(x, y) !== SOLID) ok = false;
        if (!ok) continue;
        g.box(x0, y0, x1, y1, FLOOR);
        // The way up: the ridge open at the ledge's lower (or upper) end.
        const ramp = rng.chance(0.6) ? y1 - 2 : y0;
        for (let y = ramp; y <= ramp + 2; y++) {
          let x = center(Math.min(vBottom, Math.max(vTop, y)));
          while (g.at(x + side, y) === FLOOR && x !== x0) x += side;
          for (let xx = x; side > 0 ? xx < x0 : xx > x0; xx += side) g.set(xx, y, FLOOR);
          if (y === ramp + 1) g.trail({ cx: x - side, cy: y }, { cx: x0, cy: y });
        }
        const ledge: Room = { cx: Math.round((x0 + x1) / 2), cy, rx: Math.max(1, Math.floor(wide / 2)), ry: Math.floor((y1 - y0) / 2), kind: 'side' };
        if (boss) ledge.quiet = true;
        ledges.push(ledge);
      }
      // The ledges join the rooms (before the start, which stays last).
      rooms.splice(rooms.length - 1, 0, ...ledges);
    },
  };
}

// ------------------------------------------------------------------ maze

/** A grid of cells joined into a maze (with a few loops), chambers in some of them, corridors between. */
function maze(g: Shaper): Layout {
  const { rng, cave, boss } = g;
  const cols = 4;
  const cw = 10;
  const ch = cave ? 10 : 9;
  const W = cols * cw + 6;
  const rows = boss ? 3 : 6 + Math.min(3, Math.floor(g.floor / 10)) + rng.int(0, 1);
  let top = MARGIN + 2;
  let arena: Room | null = null;
  if (boss) {
    arena = arenaRoom(W / 2, top + 9);
    top = arena.cy + arena.ry + 3;
  }
  const cellX = (c: number) => 3 + Math.floor(cw / 2) + c * cw;
  const cellY = (r: number) => top + Math.floor(ch / 2) + r * ch;
  g.begin(W, cellY(rows - 1) + Math.ceil(ch / 2) + MARGIN + 2);
  const N = cols * rows;
  const id = (c: number, r: number) => r * cols + c;
  const links = new Set<number>();
  const key = (a: number, b: number) => Math.min(a, b) * N + Math.max(a, b);
  const nbrs = (i: number) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const out: number[] = [];
    if (c > 0) out.push(i - 1);
    if (c < cols - 1) out.push(i + 1);
    if (r > 0) out.push(i - cols);
    if (r < rows - 1) out.push(i + cols);
    return out;
  };
  // A spanning tree by a random walk that backs up when it's stuck (the classic maze).
  const startCell = id(rng.int(1, 2), rows - 1);
  const seen = new Uint8Array(N);
  const stack = [startCell];
  seen[startCell] = 1;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const open = nbrs(cur).filter((j) => !seen[j]);
    if (!open.length) {
      stack.pop();
      continue;
    }
    const nx = rng.pick(open);
    links.add(key(cur, nx));
    seen[nx] = 1;
    stack.push(nx);
  }
  // A few loops, so clearing it doesn't mean walking every dead end twice.
  for (let i = 0; i < N; i++) for (const j of nbrs(i)) if (j > i && !links.has(key(i, j)) && rng.chance(0.2)) links.add(key(i, j));
  const degree = (i: number) => nbrs(i).filter((j) => links.has(key(i, j))).length;
  // The exit: the top-row cell farthest from the start.
  const dist = new Int32Array(N).fill(-1);
  dist[startCell] = 0;
  const q = [startCell];
  while (q.length) {
    const i = q.shift()!;
    for (const j of nbrs(i)) if (links.has(key(i, j)) && dist[j] < 0) (dist[j] = dist[i] + 1), q.push(j);
  }
  let exitCell = 0;
  for (let c = 0; c < cols; c++) if (dist[id(c, 0)] > dist[exitCell]) exitCell = id(c, 0);
  // Corridors.
  for (const k of links) {
    const a = Math.floor(k / N);
    const b = k % N;
    g.corridor({ cx: cellX(a % cols), cy: cellY(Math.floor(a / cols)) }, { cx: cellX(b % cols), cy: cellY(Math.floor(b / cols)) });
  }
  // Chambers: the start, the exit, dead ends (side rooms) and a few more.
  const at = (i: number) => ({ cx: cellX(i % cols), cy: cellY(Math.floor(i / cols)) });
  const start = startRoom(g, at(startCell).cx, at(startCell).cy);
  start.rx = 3;
  start.ry = 2;
  const rooms: Room[] = [];
  let exit: Room;
  if (arena) {
    exit = arena;
    g.space(arena);
    const topCell = id(rng.int(1, 2), 0);
    g.corridor(at(topCell), { cx: at(topCell).cx, cy: arena.cy + arena.ry - 2 });
  } else {
    exit = { ...at(exitCell), rx: cave ? 4 : 3, ry: cave ? 3 : 2, kind: 'exit' };
    g.space(exit);
  }
  rooms.push(exit);
  if (!boss) {
    const others = rng.shuffle([...Array(N).keys()].filter((i) => i !== startCell && i !== exitCell && dist[i] > 1));
    others.sort((a, b) => Number(degree(b) === 1) - Number(degree(a) === 1));
    const want = fights(g) - 1;
    let sides = 0;
    for (const i of others.slice(0, want)) {
      const dead = degree(i) === 1 && sides < 2;
      if (dead) sides++;
      const r: Room = { ...at(i), rx: cave ? rng.int(3, 4) : 3, ry: cave ? rng.int(2, 3) : rng.int(2, 3), kind: dead ? 'side' : 'normal' };
      rooms.push(r);
      g.space(r, 0.1);
    }
  } else {
    // A quiet chamber or two on the way.
    for (const i of rng.shuffle([...Array(N).keys()].filter((i) => i !== startCell)).slice(0, 2)) {
      const r: Room = { ...at(i), rx: 2, ry: 2, kind: 'normal', quiet: true };
      rooms.push(r);
      g.space(r);
    }
  }
  rooms.push(start);
  g.space(start);
  return { rooms, start, exit };
}

// ------------------------------------------------------------------ spiral

/**
 * A walled keep in the middle with the exit (or the arena) inside, and a ring road round it. The way
 * in from the start meets the ring at the bottom; a wall blocks the ring just to one side, so the
 * road winds all the way round before the gate into the keep.
 */
function spiral(g: Shaper): Layout {
  const { rng, cave, boss } = g;
  const W = 46;
  const cx = W / 2;
  const hw = cave ? 2 : 1;
  const Rx = boss ? 17 : 14 + Math.min(2, g.depth);
  const Ry = boss ? 15 : 12 + Math.min(2, g.depth);
  // Side nooks above the ring (room for them on top).
  const nookSpace = boss ? 0 : 9;
  const cy = MARGIN + 2 + nookSpace + Ry + hw;
  const start = startRoom(g, cx + rng.int(-2, 2), cy + Ry + hw + rng.int(5, 6) + (cave ? 3 : 4));
  g.begin(W, start.cy + start.ry + MARGIN + 3);
  const keep: Room = boss ? arenaRoom(cx, cy) : { cx, cy, rx: cave ? 5 : 4, ry: cave ? 4 : 3, kind: 'exit' };
  // Which way round: the plug just past the bottom on one side, the gate just past it.
  const dir = rng.chance(0.5) ? 1 : -1;
  const deg = Math.PI / 180;
  const plug = Math.PI / 2 + dir * 22 * deg;
  // (Indoors the gate is in the middle of a side, so its hall runs straight in.)
  const gate = Math.PI / 2 + dir * (cave ? 48 : 90) * deg;
  const ringAt = (a: number) => ({ cx: Math.round(cx + Rx * Math.cos(a)), cy: Math.round(cy + Ry * Math.sin(a)) });
  // The ring: an elliptical band in a cave, four straight halls indoors.
  if (cave) {
    for (let y = cy - Ry - hw - 2; y <= cy + Ry + hw + 2; y++) {
      for (let x = cx - Rx - hw - 2; x <= cx + Rx + hw + 2; x++) {
        const outer = ((x - cx) / (Rx + hw + 0.5)) ** 2 + ((y - cy) / (Ry + hw + 0.5)) ** 2;
        const inner = ((x - cx) / (Rx - hw - 0.5)) ** 2 + ((y - cy) / (Ry - hw - 0.5)) ** 2;
        if (outer <= 1 && inner > 1) g.set(x, y, FLOOR);
      }
    }
    for (let k = 0; k < 72; k++) g.markPath(ringAt((k / 72) * Math.PI * 2).cx, ringAt((k / 72) * Math.PI * 2).cy);
  } else {
    const x0 = cx - Rx;
    const x1 = cx + Rx;
    const y0 = cy - Ry;
    const y1 = cy + Ry;
    g.lane({ cx: x0, cy: y0 }, { cx: x1, cy: y0 }, hw);
    g.lane({ cx: x1, cy: y0 }, { cx: x1, cy: y1 }, hw);
    g.lane({ cx: x1, cy: y1 }, { cx: x0, cy: y1 }, hw);
    g.lane({ cx: x0, cy: y1 }, { cx: x0, cy: y0 }, hw);
  }
  const square = (a: number) => {
    // Indoors the ring is a rectangle: a point on it at the angle's direction.
    if (cave) return ringAt(a);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const t = Math.min(Math.abs(Rx / (dx || 1e-9)), Math.abs(Ry / (dy || 1e-9)));
    return { cx: Math.round(cx + dx * t), cy: Math.round(cy + dy * t) };
  };
  // Rooms along the ring, round the long way from the bottom to the gate.
  const rooms: Room[] = [keep];
  const want = boss ? 0 : fights(g) - 2;
  for (let k = 0; k < want; k++) {
    const a = Math.PI / 2 - dir * ((k + 1) / (want + 1)) * (2 * Math.PI - 75 * deg);
    const p = square(a);
    const s = roomSize(g);
    const r: Room = { ...p, rx: Math.min(s.rx, 5), ry: Math.min(s.ry, 4), kind: 'normal' };
    rooms.push(r);
    g.space(r, 0.1);
  }
  // Side nooks off the top of the ring.
  if (!boss) {
    for (const a of rng.shuffle([-Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5]).slice(0, rng.int(1, 2))) {
      const p = square(a);
      const s = sideSize(g);
      const r: Room = { cx: p.cx, cy: p.cy - hw - rng.int(3, 4) - s.ry, ...s, kind: 'side' };
      rooms.push(r);
      g.space(r);
      g.corridor(p, r);
    }
  }
  // The keep and its gate, the way in from the start.
  g.space(keep);
  const gp = square(gate);
  g.lane(gp, { cx: Math.round(cx + (gp.cx - cx) * 0.2), cy: Math.round(cy + (gp.cy - cy) * 0.2) }, 1);
  const bottom = square(Math.PI / 2);
  g.corridor(start, { cx: bottom.cx, cy: bottom.cy });
  g.space(start);
  rooms.push(start);
  hush(g, rooms);
  return {
    rooms,
    start,
    exit: keep,
    after: () => {
      // The plug: the ring walled off just past the way in, so the short way round is shut.
      const pp = square(plug);
      const span = hw + 2;
      for (let y = pp.cy - span; y <= pp.cy + span; y++) {
        for (let x = pp.cx - span; x <= pp.cx + span; x++) {
          const a = Math.atan2((y - cy) / Ry, (x - cx) / Rx);
          let d = a - plug;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          if (Math.abs(d) * Math.min(Rx, Ry) <= 1.6 && g.at(x, y) === FLOOR) g.set(x, y, SOLID);
        }
      }
    },
  };
}

// ------------------------------------------------------------------ the deck's designs

export const DESIGNS: Record<DesignId, Design> = {
  chain: { id: 'chain', name: 'The Long Way', layout: chain },
  loop: { id: 'loop', name: 'Two Roads', layout: loop },
  plaza: { id: 'plaza', name: 'The Square', layout: plaza },
  serpent: { id: 'serpent', name: 'Switchbacks', layout: serpent },
  gauntlet: { id: 'gauntlet', name: 'The Gauntlet', layout: gauntlet },
  crossroads: { id: 'crossroads', name: 'Crossroads', layout: crossroads },
  islands: { id: 'islands', name: 'Open Ground', layout: islands },
  valley: { id: 'valley', name: 'The Valley', layout: valley },
  maze: { id: 'maze', name: 'The Warren', layout: maze },
  spiral: { id: 'spiral', name: 'The Keep', layout: spiral },
};
