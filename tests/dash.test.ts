import { describe, expect, it } from 'vitest';
import { CLASSES, KEVIN_ID, knightId, type ClassId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import type { Rarity } from '../src/core/rarity';
import { addKnight, knightStats } from '../src/core/roster';
import { BIOMES } from '../src/world/biomes';
import { DASH, DASHES, dashLabel } from '../src/world/dash';
import { dist, lineOfSight, norm, walkClear, type Shot, type Unit } from '../src/world/entities';
import { FLOOR, SOLID, TILE, tileAt, type FloorMap } from '../src/world/mapgen';
import { floorMobs } from '../src/world/mobgen';
import { heroDodge } from '../src/world/skills';
import { World, type HeroSpec } from '../src/world/world';

const DT = 1 / 60;

function squad(ids: string[]): HeroSpec[] {
  const s = newGame(1);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id === KEVIN_ID ? (['absolute', 'blade'] as [Rarity, ClassId]) : (id.split('-') as [Rarity, ClassId]);
    return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
  });
}

/** An open arena, walled round. */
function arena(n = 30): FloorMap {
  const tiles = new Uint8Array(n * n).fill(FLOOR);
  for (let i = 0; i < n; i++) tiles[i] = tiles[(n - 1) * n + i] = tiles[i * n] = tiles[i * n + n - 1] = SOLID;
  const mid = (n / 2) * TILE;
  return { w: n, h: n, tiles, path: new Uint8Array(n * n), rooms: [], start: { x: mid, y: mid }, exit: { x: TILE * 2, y: TILE * 2 }, props: [], spawns: [], seed: 1 };
}

/**
 * An open arena with this squad in the middle (the first knight is yours), a few of the floor's foes
 * asleep in a far corner to bring over, the knights' skill rolls and attacks held.
 */
function world(ids: string[], perks: string[] = []): World {
  const biome = BIOMES.hamlet;
  const types = floorMobs(biome, 2, 99);
  const w = new World({ map: arena(), biome, floor: 2, boss: false, mobTypes: types, bossType: null, squad: squad(ids), perks, controlled: 0, seed: 99, goldPerKill: 3 });
  for (let i = 0; i < 4; i++) {
    const m = w.makeMob(types[i % types.length], 40 + i * 24, 40, false, false);
    m.awake = false;
    w.mobs.push(m);
  }
  for (const k of w.heroes) {
    k.specialT = 999;
    k.atkT = 999;
  }
  return w;
}

const of = (cls: ClassId) => world([knightId('rare', cls)]);

/** Foe #i at (dx, dy) from knight h: awake, sturdy, harmless, standing still unless `free`. */
function foeAt(w: World, h: Unit, i: number, dx: number, dy: number, free = false): Unit {
  const m = w.mobs[i];
  m.x = h.x + dx;
  m.y = h.y + dy;
  w.wake(m);
  m.spawnT = 0;
  m.hp = m.maxHp = 1e6;
  m.atk = 0;
  m.elite = false;
  if (!free) m.stunT = 99;
  expect(lineOfSight(w.map, h.x, h.y - 4, m.x, m.y - 4), 'the test needs open floor').toBe(true);
  return m;
}

function run(w: World, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) w.update(DT);
}

/** Your knight dashes along (dx, dy) (this frame). */
function dash(w: World, dx: number, dy: number): Unit {
  const h = w.heroes[0];
  w.input.mx = dx;
  w.input.my = dy;
  w.input.dodge = true;
  w.update(DT);
  w.input.mx = w.input.my = 0;
  return h;
}

/** A way out of knight h with `len` px of open floor (for the distance checks). */
function openWay(w: World, h: Unit, len: number): [number, number] {
  const r = Math.SQRT1_2;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [r, r], [-r, r], [r, -r], [-r, -r]] as Array<[number, number]>) {
    if (walkClear(w.map, h.x, h.y, h.x + dx * len, h.y + dy * len, h.r + 2)) return [dx, dy];
  }
  throw new Error('no open way');
}

/** Until the knight is on its feet again. */
function settle(w: World, h: Unit): void {
  for (let i = 0; i < 120 && (h.rolling || h.landing); i++) w.update(DT);
}

describe('each class dashes its own way', () => {
  it('labels the dodge key with the class\'s move, and gives every class one', () => {
    const want: Record<ClassId, string> = { guardian: 'SHIELD BASH', ranger: 'SHOT/SNARE', blade: 'SHADOWSTEP', cleric: 'BLESSED STEP', arcanist: 'BLINK', lancer: 'LUNGE' };
    for (const cls of Object.keys(want) as ClassId[]) {
      expect(dashLabel({ cls })).toBe(want[cls]);
      expect(CLASSES[cls].dodge.name.length).toBeGreaterThan(3);
    }
    expect(Object.keys(DASHES).sort()).toEqual(Object.keys(CLASSES).sort());
  });

  it('guardian: SHIELD BASH hits what it runs into, knocks it aside and staggers it; a boss only takes the blow; shots are blocked', () => {
    const w = of('guardian');
    const h = w.heroes[0];
    const below = foeAt(w, h, 0, 18, 3, true);
    const above = foeAt(w, h, 1, 34, -3, true);
    const boss = foeAt(w, h, 2, 26, 30, true);
    boss.boss = true;
    boss.x = h.x + 28;
    boss.y = h.y + 1;
    // (Put the boss on the line, the two others just off it.)
    below.y = h.y + 9;
    above.y = h.y - 9;
    below.x = h.x + 14;
    above.x = h.x + 40;
    const s: Shot = { uid: 4242, team: 'mob', x: h.x + 22, y: h.y - 6, vx: -60, vy: 0, r: 3, dmg: 5, life: 3, kind: 'bullet', color: '#ff6a6a', from: boss.uid };
    w.shots.push(s);
    const y = [below.y, above.y, boss.y];
    const bx = boss.x;
    dash(w, 1, 0);
    expect(h.rolling?.kind).toBe('bash');
    run(w, 0.4);
    // Each takes the blow: 120% of an attack.
    for (const m of [below, above, boss]) expect(m.maxHp - m.hp, 'the blow').toBeCloseTo(h.atk * DASH.bash.dmg, 0);
    // Knocked aside, off the line: the one below further down, the one above further up; staggered.
    expect(below.y - y[0]).toBeGreaterThan(DASH.bash.knock * 0.6);
    expect(y[1] - above.y).toBeGreaterThan(DASH.bash.knock * 0.6);
    // The boss stands its ground, unstaggered.
    expect(Math.abs(boss.y - y[2]) + Math.abs(boss.x - bx)).toBeLessThan(1);
    expect(boss.stunT).toBe(0);
    // The shot it met was blocked.
    expect(w.shots.includes(s)).toBe(false);
    expect(h.hp).toBe(h.maxHp);
  });

  it('guardian: the bash staggers for a moment', () => {
    const w = of('guardian');
    const h = w.heroes[0];
    const m = foeAt(w, h, 0, 16, 0, true);
    dash(w, 1, 0);
    for (let i = 0; i < 30 && m.hp === m.maxHp; i++) w.update(DT);
    expect(m.stunT).toBeGreaterThan(DASH.bash.stagger - 0.05);
  });

  it('ranger: toward a foe, a roll and a piercing POWER SHOT at it as the roll ends', () => {
    const w = of('ranger');
    const h = w.heroes[0];
    const m = foeAt(w, h, 0, 80, -6);
    dash(w, 1, 0);
    expect(h.rolling?.kind).toBe('roll');
    expect(h.rolling?.shot).toBe(m.uid);
    expect(w.areas.some((a) => a.kind === 'snare')).toBe(false);
    for (let i = 0; i < 60 && h.rolling; i++) w.update(DT);
    const s = w.shots.find((x) => x.team === 'hero' && x.from === h.uid)!;
    expect(s).toBeDefined();
    expect(s.dmg).toBeCloseTo(h.atk * DASH.shot.dmg, 6);
    // (It may already be through the foe: it pierces three.)
    expect((s.pierce ?? 0) + (s.hit?.size ?? 0)).toBe(DASH.shot.pierce);
    const [ax, ay] = norm(m.x - s.x, m.y - 6 - s.y);
    expect(norm(s.vx, s.vy)[0]).toBeCloseTo(ax, 1);
    expect(norm(s.vx, s.vy)[1]).toBeCloseTo(ay, 1);
    run(w, 0.5);
    expect(m.maxHp - m.hp).toBeGreaterThanOrEqual(h.atk * DASH.shot.dmg * 0.99);
  });

  it('ranger: away from the foes (or none near), a backflip and a SNARE where it started: the first foe in is rooted and bitten, a boss only slowed', () => {
    const w = of('ranger');
    const h = w.heroes[0];
    const m = foeAt(w, h, 0, 70, 0, true);
    const x0 = h.x;
    const y0 = h.y;
    dash(w, -1, 0);
    expect(h.rolling?.kind).toBe('flip');
    const snare = w.areas.find((a) => a.kind === 'snare')!;
    expect(snare).toBeDefined();
    expect(dist(snare.x, snare.y, x0, y0)).toBeLessThan(1);
    settle(w, h);
    // A foe steps in: rooted (it can't go anywhere) for 2 s, and bitten for half an attack.
    m.stunT = 0;
    m.x = snare.x + 2;
    m.y = snare.y;
    w.update(DT);
    expect(m.stunT).toBeGreaterThan(DASH.snare.root - 0.1);
    expect(m.maxHp - m.hp).toBeCloseTo(h.atk * DASH.snare.dmg, 0);
    expect(w.areas.some((a) => a.kind === 'snare' && !a.done)).toBe(false);
    // A boss is only slowed.
    h.dodgeT = 0;
    dash(w, -1, 0);
    settle(w, h);
    const s2 = w.areas.find((a) => a.kind === 'snare' && !a.done)!;
    const boss = foeAt(w, h, 1, 60, 0, true);
    boss.boss = true;
    boss.stunT = 0;
    boss.x = s2.x;
    boss.y = s2.y;
    w.update(DT);
    expect(boss.slowT).toBeGreaterThan(DASH.snare.slow - 0.1);
    expect(boss.stunT).toBe(0);
  });

  it('ranger: snares lie 8 s, two at a time', () => {
    const w = of('ranger');
    const h = w.heroes[0];
    for (let i = 0; i < 3; i++) {
      h.dodgeT = 0;
      dash(w, i % 2 ? 1 : -1, 0);
      settle(w, h);
    }
    expect(w.areas.filter((a) => a.kind === 'snare' && !a.done)).toHaveLength(DASH.snare.max);
    run(w, DASH.snare.life + 0.2);
    expect(w.areas.filter((a) => a.kind === 'snare')).toHaveLength(0);
  });

  it('blade (and Kevin): SHADOWSTEP, ready again in half a second, a little longer than a plain roll', () => {
    for (const id of [knightId('rare', 'blade'), KEVIN_ID]) {
      const w = world([id]);
      const h = w.heroes[0];
      const x0 = h.x;
      dash(w, 1, 0);
      expect(h.rolling?.kind, id).toBe('shadow');
      // (A frame has gone by since it started.)
      expect(h.dodgeT).toBeCloseTo(0.5 - DT, 6);
      settle(w, h);
      expect(h.x - x0).toBeGreaterThan(55);
      // Half a second after it started, it goes again.
      run(w, 0.5 - DASHES.blade.dur);
      h.dodgeT = Math.max(0, h.dodgeT!);
      w.update(DT);
      expect(heroDodge(w, h, -1, 0)).toBe(true);
    }
    expect(DASHES.blade.dur).toBeGreaterThan(0.3);
  });

  it('cleric: BLESSED STEP leaves a holy circle where it started that heals allies inside, about 6% a second', () => {
    const w = world([knightId('rare', 'cleric'), knightId('rare', 'guardian')]);
    const [h, ally] = w.heroes;
    ally.x = h.x + 6;
    ally.y = h.y + 2;
    ally.hp = ally.maxHp * 0.4;
    dash(w, -1, 0);
    const circle = w.areas.find((a) => a.kind === 'bless')!;
    expect(circle).toBeDefined();
    expect(circle.r).toBe(DASH.bless.r);
    expect(circle.dur).toBeCloseTo(DASH.bless.dur, 1);
    // (The ally stays in it.)
    const before = ally.hp;
    for (let t = 0; t < 2; t += DT) {
      ally.x = circle.x + 4;
      ally.y = circle.y;
      w.update(DT);
    }
    const share = (ally.hp - before) / ally.maxHp;
    expect(share).toBeGreaterThan(DASH.bless.heal * 2 * 0.7);
    expect(share).toBeLessThan(DASH.bless.heal * 2 * 1.4);
  });

  it('arcanist: BLINK goes there at once, 1.3 times as far, never through a wall, and bursts where it left', () => {
    const w = of('arcanist');
    const h = w.heroes[0];
    const [dx, dy] = openWay(w, h, DASHES.arcanist.dist + 8);
    const near = foeAt(w, h, 0, -dx * 10, -dy * 10 + 3);
    const x0 = h.x;
    const y0 = h.y;
    dash(w, dx, dy);
    expect(h.rolling?.kind).toBe('blink');
    // Instantly (the first frame), 1.3 times the old 60 px.
    expect(DASHES.arcanist.dist).toBeCloseTo(60 * 1.3, 0);
    expect(Math.abs(dist(h.x, h.y, x0, y0) - DASHES.arcanist.dist)).toBeLessThan(2);
    // Untouchable through the blink.
    expect(w.damage(h, 10, near)).toBe(0);
    // The burst where it left.
    expect(near.maxHp - near.hp).toBeCloseTo(h.atk * DASH.blink.dmg, 0);
    // Toward a wall: it stops at it, on the floor, never through.
    settle(w, h);
    const v = of('arcanist');
    const k = v.heroes[0];
    let wall = 0;
    for (let s = 1; s < 400 && !wall; s++) if (tileAt(v.map, Math.floor(k.x / TILE), Math.floor((k.y - s) / TILE)) !== FLOOR) wall = s;
    expect(wall).toBeGreaterThan(0);
    k.y -= Math.max(0, wall - 30);
    const ky = k.y;
    dash(v, 0, -1);
    expect(tileAt(v.map, Math.floor(k.x / TILE), Math.floor(k.y / TILE))).toBe(FLOOR);
    expect(lineOfSight(v.map, k.x, ky, k.x, k.y)).toBe(true);
    expect(ky - k.y).toBeLessThan(DASHES.arcanist.dist);
  });

  it('lancer: SPEAR LUNGE, fast and long, hits every foe it goes through and pushes it on; a boss takes the blow', () => {
    const w = of('lancer');
    const h = w.heroes[0];
    const [dx, dy] = openWay(w, h, DASHES.lancer.dist + 10);
    // Foes along the way (a little off the line), a boss among them.
    const at = (along: number, off: number): [number, number] => [dx * along - dy * off, dy * along + dx * off];
    const a = foeAt(w, h, 0, ...at(24, 2), true);
    const b = foeAt(w, h, 1, ...at(60, -2), true);
    const boss = foeAt(w, h, 2, ...at(42, 0), true);
    boss.boss = true;
    const x0 = h.x;
    const y0 = h.y;
    const a0 = [a.x, a.y];
    const boss0 = [boss.x, boss.y];
    dash(w, dx, dy);
    expect(h.rolling?.kind).toBe('lunge');
    settle(w, h);
    expect(dist(h.x, h.y, x0, y0)).toBeGreaterThan(70);
    for (const m of [a, b, boss]) expect(m.maxHp - m.hp, 'the blow').toBeCloseTo(h.atk * DASH.lunge.dmg, 0);
    // Pushed on ahead, along the lunge.
    expect((a.x - a0[0]) * dx + (a.y - a0[1]) * dy).toBeGreaterThan(4);
    expect(Math.abs(boss.x - boss0[0]) + Math.abs(boss.y - boss0[1])).toBeLessThan(1);
    expect(DASHES.lancer.dist).toBeCloseTo(70 * 1.3, 0);
    expect(DASHES.lancer.dist / DASHES.lancer.dur).toBeGreaterThan(70 / 0.36);
  });

  it('squadmates dash their own way too, and the dodge perks still work on top', () => {
    const w = world([knightId('rare', 'ranger'), knightId('rare', 'guardian'), knightId('rare', 'lancer')], ['hiveMind', 'kamikaze', 'rollDancer']);
    const [me, tank, lancer] = w.heroes;
    expect(heroDodge(w, tank, 0, 1)).toBe(true);
    expect(tank.rolling?.kind).toBe('bash');
    settle(w, tank);
    tank.dodgeT = 0;
    // Hive Mind: the squad dodges with you, each its own dash; Kamikaze leaves its bomb.
    dash(w, -1, 0);
    expect(me.rolling?.kind).toBe('flip');
    expect(tank.rolling?.kind).toBe('bash');
    expect(lancer.rolling?.kind).toBe('lunge');
    expect(w.areas.some((a) => a.kind === 'bomb')).toBe(true);
    // Roll Dancer: a roll slices what it passes.
    const v = world([knightId('rare', 'cleric')], ['rollDancer']);
    const k = v.heroes[0];
    const m = foeAt(v, k, 0, 16, 0);
    dash(v, 1, 0);
    run(v, 0.3);
    expect(m.hp).toBeLessThan(m.maxHp);
  });
});
