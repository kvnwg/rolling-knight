import { describe, expect, it } from 'vitest';
import { FLOOR_DESIGNS } from '../src/core/deck';
import { knightId, type ClassId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { addKnight, knightStats } from '../src/core/roster';
import { BIOMES, type BiomeId } from '../src/world/biomes';
import { dist, moveUnit, norm, walkClear, type Unit } from '../src/world/entities';
import { BLOCKED, FLOOR, LIQUID, SOLID, TILE, bfs, generateFloor, tileAt, type FloorMap } from '../src/world/mapgen';
import { floorMobs } from '../src/world/mobgen';
import { CELL, navGrid, navOf, navSpent, navTo } from '../src/world/nav';
import { World, type HeroSpec } from '../src/world/world';

function squad(classes: ClassId[], rarity: HeroSpec['rarity'] = 'rare'): HeroSpec[] {
  const s = newGame(1);
  const ids = classes.map((c) => knightId(rarity, c));
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => ({ knightId: id, cls: classes[slot], rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 }));
}

/**
 * A floor drawn in text: '#' wall, '.' floor, 'T' a prop or a tree's trunk (blocks walking, not
 * sight), '~' water; any other letter is floor with a named spot at its tile's middle.
 */
function layout(rows: string[]): { map: FloorMap; at: Record<string, { x: number; y: number }> } {
  const h = rows.length;
  const w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  const at: Record<string, { x: number; y: number }> = {};
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      tiles[y * w + x] = c === '#' ? SOLID : c === 'T' ? BLOCKED : c === '~' ? LIQUID : FLOOR;
      if (/[A-SU-Za-z]/.test(c)) at[c] = { x: x * TILE + 8, y: y * TILE + 8 };
    }
  }
  const map: FloorMap = { w, h, tiles, path: new Uint8Array(w * h), rooms: [], start: { x: 24, y: 24 }, exit: { x: 24, y: 24 }, props: [], spawns: [], seed: 1 };
  return { map, at };
}

function world(map: FloorMap, classes: ClassId[]): World {
  const biome = BIOMES.forest;
  return new World({ map, biome, floor: 3, boss: false, mobTypes: floorMobs(biome, 3, 1), bossType: null, squad: squad(classes), perks: [], controlled: 0, seed: 1, goldPerKill: 1 });
}

/** A foe that stays where the test puts it: it never hits, never falls, never winds anything up. */
function dummy(w: World, x: number, y: number): Unit {
  const t = { ...w.mobTypes[0], behavior: 'chaser' as const, lunge: undefined, gun: undefined, lob: undefined };
  const m = w.makeMob(t, x, y, false, false);
  m.awake = true;
  m.atk = 0;
  m.hp = m.maxHp = 1e9;
  m.speed = 0;
  w.mobs.push(m);
  w.refreshFlows();
  return m;
}

const DT = 1 / 60;

/**
 * Runs the world `secs` seconds (`each` before every frame). Returns each knight's longest spell of
 * being pinned: wanting to move (the nav layer's watch says so) yet staying within 3 px.
 */
function run(w: World, secs: number, each?: () => void, dt = DT): number[] {
  const worst = w.heroes.map(() => 0);
  const spell = w.heroes.map((h) => ({ t: 0, x: h.x, y: h.y }));
  for (let t = 0; t < secs - 1e-9; t += dt) {
    each?.();
    w.update(dt);
    w.heroes.forEach((h, i) => {
      const s = spell[i];
      const wants = !h.downed && (h.ai?.nav?.wexp ?? 0) > 0;
      if (!wants || dist(h.x, h.y, s.x, s.y) > 3) {
        s.t = 0;
        s.x = h.x;
        s.y = h.y;
        return;
      }
      s.t += dt;
      worst[i] = Math.max(worst[i], s.t);
    });
  }
  return worst;
}

const hops = (w: World) => w.heroes.reduce((a, h) => a + (h.ai?.nav?.hops ?? 0), 0);

/**
 * Walks h by navTo alone toward (gx, gy) for up to `secs` (at 60 px/s, colliding as walking does),
 * calling `each` with every path it's given; true once navTo says it's there.
 */
function walk(w: World, h: Unit, gx: number, gy: number, secs: number, each?: (path: number[]) => void): boolean {
  let last: number[] | null = null;
  for (let t = 0; t < secs; t += DT) {
    w.time += DT;
    const [mx, my] = navTo(w, h, gx, gy, 3);
    const p = navOf(h).path;
    if (p && p !== last) each?.(p);
    last = p;
    if (!mx && !my) return true;
    moveUnit(w.map, h, mx * 60 * DT, my * 60 * DT);
  }
  return false;
}

describe('the nav grid', () => {
  it("marks where a knight's body can stand: walls, water and trunks all count", () => {
    const { map, at } = layout(['#######', '#..T..#', '#.....#', '#~~~~~#', '#.....#', '#..A..#', '#######']);
    const g = navGrid(map, 4);
    const ok = (x: number, y: number) => g.ok[Math.floor(y / CELL) * g.w + Math.floor(x / CELL)] === 1;
    // A floor tile's middle, yes; in the trunk, on the water or in the wall, no.
    expect(ok(2 * TILE + 8, 2 * TILE + 8)).toBe(true);
    expect(ok(3 * TILE + 8, TILE + 8)).toBe(false);
    expect(ok(3 * TILE + 8, 3 * TILE + 8)).toBe(false);
    expect(ok(8, 8)).toBe(false);
    // Hard by the trunk's side the body would overlap it (it's 4 px each side): no.
    expect(ok(3 * TILE - 2, TILE + 8)).toBe(false);
    expect(ok(3 * TILE - 6, TILE + 8)).toBe(true);
    // The water cuts the floor in two: its far side is another piece, which no path crosses to.
    const part = (x: number, y: number) => g.part[Math.floor(y / CELL) * g.w + Math.floor(x / CELL)];
    expect(part(at.A.x, at.A.y)).not.toBe(part(2 * TILE + 8, 2 * TILE + 8));
    // Built once per floor: asked again, it's the same grid.
    expect(navGrid(map, 4)).toBe(g);
  });

  it('plans round a wall, the path pulled straight wherever a body can walk straight', () => {
    const { map, at } = layout(['##########', '#A.......#', '#........#', '######.###', '#........#', '#B.......#', '##########']);
    const w = world(map, ['ranger']);
    const h = w.heroes[0];
    Object.assign(h, at.A);
    // Its first step heads for the gap, not straight down into the wall.
    expect(navTo(w, h, at.B.x, at.B.y)[0]).toBeGreaterThan(0.5);
    // Each path it's given is a few straight legs (the planner's steps pulled straight), each walkable.
    let paths = 0;
    const arrived = walk(w, h, at.B.x, at.B.y, 6, (p) => {
      paths++;
      expect(p.length / 2).toBeLessThanOrEqual(5);
      for (let k = 0; k + 3 < p.length; k += 2) expect(walkClear(map, p[k], p[k + 1], p[k + 2], p[k + 3], h.r)).toBe(true);
    });
    expect(paths).toBeGreaterThan(0);
    expect(arrived).toBe(true);
    expect(dist(h.x, h.y, at.B.x, at.B.y)).toBeLessThanOrEqual(3);
  });

  it('turns a goal inside a trunk, or across water, into the nearest spot the knight can get to', () => {
    // The middle of a trunk: it ends beside it.
    const a = layout(['#########', '#.......#', '#...T...#', '#.......#', '#A......#', '#########']);
    const w = world(a.map, ['ranger']);
    const h = w.heroes[0];
    Object.assign(h, a.at.A);
    const trunk = { x: 4 * TILE + 8, y: 2 * TILE + 8 };
    expect(walk(w, h, trunk.x, trunk.y, 4)).toBe(true);
    expect(dist(h.x, h.y, trunk.x, trunk.y)).toBeLessThan(16);
    // The far bank of the water (cut off: no way round): it walks to the water's edge and stops there.
    const b = layout(['#########', '#.......#', '#.......#', '#~~~~~~~#', '#.......#', '#A......#', '#########']);
    const w2 = world(b.map, ['ranger']);
    const k = w2.heroes[0];
    Object.assign(k, b.at.A);
    expect(walk(w2, k, 4 * TILE + 8, TILE + 8, 4)).toBe(true);
    expect(k.y).toBeGreaterThan(4 * TILE);
    expect(k.y).toBeLessThan(4 * TILE + 8);
    expect(Math.abs(k.x - (4 * TILE + 8))).toBeLessThan(6);
  });

  it('plans within a budget each frame (phones): past it, a knight keeps its way and plans the next frame', () => {
    const m = generateFloor({ floor: 12, biome: BIOMES.forest, seed: 5, boss: false, design: 'maze' });
    const w = new World({ map: m, biome: BIOMES.forest, floor: 12, boss: false, mobTypes: floorMobs(BIOMES.forest, 12, 5), bossType: null, squad: squad(['ranger']), perks: [], controlled: 0, seed: 5, goldPerKill: 1 });
    const floors: number[] = [];
    for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === FLOOR) floors.push(i);
    const spot = (i: number) => ({ x: (i % m.w) * TILE + 8, y: Math.floor(i / m.w) * TILE + 8 });
    // Thirty knights, each after a spot far off round the maze (too far to just walk at), all in the one frame.
    const knights: Unit[] = [];
    const goals: Array<{ x: number; y: number }> = [];
    for (let k = 0; knights.length < 30; k++) {
      const from = spot(floors[(k * 97) % floors.length]);
      const to = spot(floors[(k * 131 + 400) % floors.length]);
      if (dist(from.x, from.y, to.x, to.y) < 300) continue;
      knights.push({ ...w.heroes[0], ...from, ai: { target: null, think: 0, dodgeThink: 0, wanderX: 0, wanderY: 0, stuck: 0 } });
      goals.push(to);
    }
    knights.forEach((h, k) => navTo(w, h, goals[k].x, goals[k].y));
    const { spent, budget } = navSpent(w);
    expect(spent).toBeGreaterThan(0);
    expect(spent).toBeLessThanOrEqual(budget + 1500);
    const planned = knights.filter((h) => navOf(h).path).length;
    expect(planned).toBeLessThan(knights.length);
    // The next frames, the rest have their turn.
    for (let f = 0; f < 20 && knights.some((h) => !navOf(h).path); f++) {
      w.time += DT;
      knights.forEach((h, k) => navTo(w, h, goals[k].x, goals[k].y));
    }
    expect(knights.every((h) => navOf(h).path)).toBe(true);
  });
});

describe('squadmates (and your knight on Auto) never get pinned', () => {
  it('walk round a trunk to a leader standing right behind it', () => {
    const { map, at } = layout(['#########', '#.......#', '#.......#', '#..ATL..#', '#.......#', '#.......#', '#########']);
    const w = world(map, ['guardian', 'ranger', 'cleric']);
    const [me, a, b] = w.heroes;
    Object.assign(me, at.L);
    Object.assign(a, at.A);
    Object.assign(b, { x: at.A.x, y: at.A.y + 10 });
    const pinned = run(w, 5, () => Object.assign(me, at.L));
    expect(Math.max(...pinned)).toBeLessThan(1);
    // Both end up at the leader's side of the trunk, settled.
    for (const h of [a, b]) {
      expect(dist(h.x, h.y, me.x, me.y)).toBeLessThan(28);
      expect(h.x).toBeGreaterThan(at.L.x - 16);
      expect(h.moving).toBe(false);
    }
  });

  it('get round a diagonal line of trunks (no squeezing into the corner-to-corner gaps)', () => {
    // Your knight on Auto (a blade) after a foe on the far side: the old way pushed straight at it, wedged
    // between two trunks that touch at their corners.
    const { map, at } = layout(['############', '#..........#', '#......T.M.#', '#.....T....#', '#....T.....#', '#...T......#', '#.L........#', '############']);
    const w = world(map, ['blade']);
    w.bot = true;
    const h = w.heroes[0];
    Object.assign(h, at.L);
    const m = dummy(w, at.M.x, at.M.y);
    const pinned = run(w, 6, () => Object.assign(m, at.M, { windT: 0 }));
    expect(pinned[0]).toBeLessThan(1);
    expect(dist(h.x, h.y, m.x, m.y)).toBeLessThan(h.range! * 0.8 + 2);
  });

  it('get out of a U-shaped pocket, whether following the leader or after a foe beyond its bottom', () => {
    const rows = ['###########', '#.........#', '#..T...T..#', '#..T.A.T..#', '#..T...T..#', '#..TTTTT..#', '#.........#', '#....L....#', '#.........#', '###########'];
    // A squadmate in the pocket, its leader just below the pocket's bottom.
    {
      const { map, at } = layout(rows);
      const w = world(map, ['guardian', 'ranger']);
      const [me, a] = w.heroes;
      Object.assign(me, at.L);
      Object.assign(a, at.A);
      const pinned = run(w, 6, () => Object.assign(me, at.L));
      expect(pinned[1]).toBeLessThan(1);
      expect(dist(a.x, a.y, me.x, me.y)).toBeLessThan(28);
    }
    // Your blade on Auto in the pocket, its foe below (in sight: props don't block it).
    {
      const { map, at } = layout(rows);
      const w = world(map, ['blade']);
      w.bot = true;
      const h = w.heroes[0];
      Object.assign(h, at.A);
      const m = dummy(w, at.L.x, at.L.y);
      const pinned = run(w, 6, () => Object.assign(m, at.L, { windT: 0 }));
      expect(pinned[0]).toBeLessThan(1);
      expect(dist(h.x, h.y, m.x, m.y)).toBeLessThan(h.range! * 0.8 + 2);
    }
  });

  it('kite toward open ground, never backing into a corner', () => {
    const { map, at } = layout(['############', '#A.........#', '#..........#', '#..........#', '#..........#', '#..........#', '#.......M..#', '#..........#', '############']);
    const w = world(map, ['ranger']);
    w.bot = true;
    const h = w.heroes[0];
    Object.assign(h, { x: at.A.x + 10, y: at.A.y + 10 });
    const m = dummy(w, at.M.x, at.M.y);
    let cornered = 0;
    let longest = 0;
    let caught = 0;
    const pinned = run(w, 8, () => {
      // The foe walks straight at the archer, a little slower than it.
      const [dx, dy] = norm(h.x - m.x, h.y - m.y);
      if (dist(h.x, h.y, m.x, m.y) > m.r + h.r) {
        m.x += dx * 40 * DT;
        m.y += dy * 40 * DT;
      }
      // (No dodge rolls: this is about where it walks.)
      h.dodgeT = 99;
      const inCorner = (h.x - TILE < 14 && h.y - TILE < 28) || (h.x - TILE < 28 && h.y - TILE < 14);
      cornered = inCorner ? cornered + DT : 0;
      longest = Math.max(longest, cornered);
      if (dist(h.x, h.y, m.x, m.y) < m.r + h.r + 4) caught += DT;
    });
    // Out of the corner at once, along the wall into the open; the foe all but never on top of it.
    // (The old way backed it straight into the corner, where the foe stood on it to the end.)
    expect(longest).toBeLessThan(1.2);
    expect(caught).toBeLessThan(0.5);
    expect(pinned[0]).toBeLessThan(1);
  });

  it("stand at the nearest free spot when their place in the formation falls in a tree or a wall", () => {
    // Slot 1 stands 14 px right of the leader and 10 px down: here that's in a trunk...
    {
      const { map, at } = layout(['#########', '#.......#', '#...L...#', '#....T..#', '#.......#', '#.A.....#', '#########']);
      const w = world(map, ['guardian', 'ranger']);
      const [me, a] = w.heroes;
      const spot = { x: at.L.x + 4, y: at.L.y + 4 };
      Object.assign(me, spot);
      Object.assign(a, at.A);
      const pinned = run(w, 6, () => Object.assign(me, spot));
      expect(pinned[1]).toBeLessThan(1);
      expect(a.moving).toBe(false);
      expect(dist(a.x, a.y, me.x, me.y)).toBeLessThan(24);
      // (Its spot is beside the leader, out of the trunk, where the leader could walk straight to it.)
      expect(walkClear(map, me.x, me.y, a.x, a.y, a.r)).toBe(true);
    }
    // ...and here, with the leader against the wall, in the wall.
    {
      const { map, at } = layout(['#########', '#.......#', '#......L#', '#.......#', '#.......#', '#.A.....#', '#########']);
      const w = world(map, ['guardian', 'ranger']);
      const [me, a] = w.heroes;
      const spot = { x: at.L.x + 3, y: at.L.y + 5 };
      Object.assign(me, spot);
      Object.assign(a, at.A);
      const pinned = run(w, 6, () => Object.assign(me, spot));
      expect(pinned[1]).toBeLessThan(1);
      expect(a.moving).toBe(false);
      expect(dist(a.x, a.y, me.x, me.y)).toBeLessThan(24);
    }
  });

  it('chase a foe round a trunk (your knight on Auto), and go round a wall to help a fight out of sight', () => {
    {
      const { map, at } = layout(['###########', '#.........#', '#.........#', '#..L.T.M..#', '#.........#', '#.........#', '###########']);
      const w = world(map, ['blade']);
      w.bot = true;
      const h = w.heroes[0];
      Object.assign(h, at.L);
      const m = dummy(w, at.M.x, at.M.y);
      const pinned = run(w, 5, () => Object.assign(m, at.M, { windT: 0 }));
      expect(pinned[0]).toBeLessThan(1);
      expect(dist(h.x, h.y, m.x, m.y)).toBeLessThan(h.range! * 0.8 + 2);
    }
    {
      const { map, at } = layout(['############', '#..........#', '#.L......A.#', '#..........#', '##.#########', '#..........#', '#.......M..#', '#..........#', '############']);
      const w = world(map, ['guardian', 'blade']);
      const [me, a] = w.heroes;
      Object.assign(me, at.L);
      Object.assign(a, at.A);
      const m = dummy(w, at.M.x, at.M.y);
      const pinned = run(w, 6, () => {
        Object.assign(me, at.L, { hp: me.maxHp });
        Object.assign(m, at.M, { windT: 0 });
      });
      expect(pinned[1]).toBeLessThan(1);
      expect(dist(a.x, a.y, m.x, m.y)).toBeLessThan(a.range! * 0.8 + 2);
    }
  });

  it('hop back to the leader as a last resort, from any distance, when nothing else gets them out', () => {
    // A squadmate whose way out is shut after it planned (a wall the grid never heard of), close to
    // the leader as the crow flies (the old hop never came within 36 px of it).
    const { map, at } = layout(['#########', '#..A#L..#', '#...#...#', '#...#...#', '#.......#', '#########']);
    const w = world(map, ['guardian', 'ranger']);
    const [me, a] = w.heroes;
    Object.assign(me, at.L);
    Object.assign(a, at.A);
    run(w, 0.5, () => Object.assign(me, at.L));
    expect(navOf(a).path).not.toBeNull();
    // Shut it in: the bottom row of its pocket becomes wall (only walking knows).
    for (let x = 1; x <= 3; x++) map.tiles[4 * map.w + x] = SOLID;
    const pinned = run(w, 5, () => Object.assign(me, at.L));
    expect(pinned[1]).toBeLessThan(2);
    expect(hops(w)).toBeGreaterThanOrEqual(1);
    expect(dist(a.x, a.y, me.x, me.y)).toBeLessThan(40);
    // ...with a puff of dust where it was (in the pocket) and a glint where it landed (by the leader).
    expect(w.fx.some((f) => f.kind === 'dust' && f.x < 4 * TILE)).toBe(true);
    expect(w.fx.some((f) => f.kind === 'spark' && f.color === '#e8f0ff' && dist(f.x, f.y + 8, me.x, me.y) < 40)).toBe(true);
  });
});

describe('a soak over many floors', () => {
  /**
   * Floors to soak: the woods most of all. (Every biome at about floor 12's crowd: a floor's layout is its
   * biome's and its design's, and deeper down only the fights get thicker, and slower to run.)
   */
  const FLOORS: Array<[BiomeId, number]> = [
    ['forest', 11], ['forest', 12], ['forest', 13], ['forest', 14], ['forest', 11], ['forest', 12],
    ['hamlet', 4], ['farmland', 8], ['tundra', 12], ['swamp', 12], ['graveyard', 12], ['dungeon', 12], ['crypt', 12], ['shrine', 12],
  ];

  it('the squad on Auto: no knight is ever pinned, and the last-resort hop all but never comes', () => {
    let worst = 0;
    let where = '';
    let hopped = 0;
    FLOORS.forEach(([b, floor], k) => {
      const biome = BIOMES[b];
      const seed = 300 + k * 41;
      const design = FLOOR_DESIGNS[(k * 3) % FLOOR_DESIGNS.length];
      const map = generateFloor({ floor, biome, seed, boss: false, design });
      const classes: ClassId[][] = [['guardian', 'ranger', 'cleric'], ['blade', 'arcanist', 'ranger'], ['lancer', 'cleric', 'arcanist']];
      const w = new World({ map, biome, floor, boss: false, mobTypes: floorMobs(biome, floor, seed), bossType: null, squad: squad(classes[k % 3], 'legendary'), perks: [], controlled: 0, seed, goldPerKill: 1 });
      w.bot = true;
      // (Tough enough to stay on their feet: this is about walking, not winning.)
      w.guard = 0.25;
      const pinned = run(w, 20, undefined, 1 / 30);
      pinned.forEach((p, i) => {
        if (p > worst) {
          worst = p;
          where = `${b} ${design} seed ${seed}, knight ${i}`;
        }
      });
      hopped += hops(w);
    });
    expect(worst, where).toBeLessThan(2);
    expect(hopped).toBeLessThanOrEqual(2);
  });

  it('following you round the woods: squadmates keep up, never pinned, however you walk or where you stop', () => {
    let worst = 0;
    let where = '';
    let hopped = 0;
    let behind = 0;
    for (const [k, [b, floor]] of FLOORS.slice(0, 8).entries()) {
      const biome = BIOMES[b];
      const seed = 700 + k * 53;
      const design = FLOOR_DESIGNS[(k * 7 + 2) % FLOOR_DESIGNS.length];
      const map = generateFloor({ floor, biome, seed, boss: false, design });
      const w = new World({ map, biome, floor, boss: false, mobTypes: floorMobs(biome, floor, seed), bossType: null, squad: squad(['guardian', 'ranger', 'cleric']), perks: [], controlled: 0, seed, goldPerKill: 1 });
      w.mobs = [];
      // You: off to a spot (half the time one right by a tree or a wall), cutting corners and a little
      // sloppy on the way, then standing there a moment.
      const lead = w.heroes[0];
      const spots: number[] = [];
      const hugging: number[] = [];
      for (let i = 0; i < map.tiles.length; i++) {
        if (map.tiles[i] !== FLOOR) continue;
        spots.push(i);
        const x = i % map.w;
        const y = Math.floor(i / map.w);
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tileAt(map, x + dx, y + dy) !== FLOOR)) hugging.push(i);
      }
      let rs = seed;
      const rand = () => (rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296;
      let field: Int32Array | null = null;
      let goal = -1;
      let rest = 0;
      const pinned = run(
        w,
        30,
        () => {
          const tx = Math.floor(lead.x / TILE);
          const ty = Math.floor(lead.y / TILE);
          if (!field || field[ty * map.w + tx] <= 0) {
            if (field && rest <= 0) rest = 1.5;
            rest -= 1 / 30;
            if (rest > 0) {
              w.input.mx = w.input.my = 0;
              return;
            }
            const pool = rand() < 0.5 ? hugging : spots;
            goal = pool[Math.floor(rand() * pool.length)];
            field = bfs(map, goal % map.w, Math.floor(goal / map.w));
          }
          let best = field[ty * map.w + tx];
          let bx = tx;
          let by = ty;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const d = field[(ty + oy) * map.w + tx + ox];
              if ((!ox && !oy) || d < 0 || d >= best) continue;
              if (ox && oy && (field[ty * map.w + tx + ox] < 0 || field[(ty + oy) * map.w + tx] < 0)) continue;
              best = d;
              bx = tx + ox;
              by = ty + oy;
            }
          }
          const [dx, dy] = norm(bx * TILE + 8 - lead.x, by * TILE + 8 - lead.y);
          const wob = Math.sin(w.time * 1.7 + k) * 0.35;
          w.input.mx = dx - dy * wob;
          w.input.my = dy + dx * wob;
          // (How far the squad trails: a knight far behind for long is as lost as a pinned one.)
          for (const h of w.heroes) if (h !== lead && dist(h.x, h.y, lead.x, lead.y) > 160) behind += 1 / 30;
        },
        1 / 30,
      );
      pinned.forEach((p, i) => {
        if (p > worst) {
          worst = p;
          where = `${b} ${design} seed ${seed}, knight ${i}`;
        }
      });
      hopped += hops(w);
    }
    expect(worst, where).toBeLessThan(2);
    expect(hopped).toBeLessThanOrEqual(2);
    expect(behind).toBeLessThan(10);
  });
});
