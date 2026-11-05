import { describe, expect, it, vi } from 'vitest';
import { knightId, type ClassId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import type { Rarity } from '../src/core/rarity';
import { addKnight, knightStats } from '../src/core/roster';
import { AIM_CAP, Camera } from '../src/render/camera';
import { AHEAD, HOLD_Y, autoRange, autoTarget } from '../src/world/aim';
import { BIOMES } from '../src/world/biomes';
import { lineOfSight, norm, type Shot, type Unit } from '../src/world/entities';
import { GRACE, HURT_STOP } from '../src/world/feel';
import { generateFloor } from '../src/world/mapgen';
import { REFLECT_SPEED, SWINGS, inSwing } from '../src/world/melee';
import { floorMobs } from '../src/world/mobgen';
import { ROLL_SAFE, SHOT_SPEED, STEER_CD } from '../src/world/skills';
import { World, type HeroSpec } from '../src/world/world';

const DT = 1 / 60;

function squad(ids: string[]): HeroSpec[] {
  const s = newGame(1);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id.split('-') as [Rarity, ClassId];
    return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
  });
}

/** A floor with this squad (the first knight is yours), every foe sent to sleep far off. */
function world(classes: ClassId[], seed = 99, rarity: Rarity = 'rare'): World {
  const biome = BIOMES.hamlet;
  const map = generateFloor({ floor: 2, biome, seed, boss: false });
  const w = new World({ map, biome, floor: 2, boss: false, mobTypes: floorMobs(biome, 2, seed), bossType: null, squad: squad(classes.map((c) => knightId(rarity, c))), perks: [], controlled: 0, seed, goldPerKill: 3 });
  const h = w.heroes[0];
  for (const m of w.mobs) {
    m.awake = false;
    // Out of the way: nothing near the start room.
    if (Math.hypot(m.x - h.x, m.y - h.y) < 200) m.x += 400;
  }
  // Ready to attack (a floor starts with a short wait), skill rolls far off.
  for (const k of w.heroes) {
    k.atkT = 0;
    k.specialT = 999;
  }
  return w;
}

/** Puts foe #i at (dx, dy) from knight h, awake, standing still (its AI can't move it). */
function foeAt(w: World, h: Unit, i: number, dx: number, dy: number): Unit {
  const m = w.mobs[i];
  m.x = h.x + dx;
  m.y = h.y + dy;
  m.awake = true;
  m.stunT = 99;
  m.hp = m.maxHp = 1e6;
  expect(lineOfSight(w.map, h.x, h.y - 4, m.x, m.y - 4), 'the test needs open floor').toBe(true);
  return m;
}

/** A foe's bullet at (dx, dy) from knight h's body, flying toward it. */
function bulletAt(w: World, h: Unit, dx: number, dy: number, speed = 70): Shot {
  const [nx, ny] = norm(-dx, -dy);
  const s: Shot = { uid: 777000 + w.shots.length, team: 'mob', x: h.x + dx, y: h.y - 6 + dy, vx: nx * speed, vy: ny * speed, r: 3, dmg: 5, life: 3, kind: 'bullet', color: '#ff6a6a', from: w.mobs[0].uid };
  w.shots.push(s);
  return s;
}

function run(w: World, seconds: number, dt = DT): void {
  for (let t = 0; t < seconds - 1e-9; t += dt) w.update(dt);
}

/** Your knight aims at the world point (x, y) and holds the attack. */
function aimAndAttack(w: World, x: number, y: number): void {
  w.input.attack = true;
  w.input.aimX = x;
  w.input.aimY = y;
}

// ------------------------------------------------------------------ aiming

describe('aiming', () => {
  it('sends your knight\'s shots exactly along the aim, from its hands, faster than any foe\'s', () => {
    for (const cls of ['ranger', 'cleric', 'arcanist'] as const) {
      const w = world([cls]);
      const h = w.heroes[0];
      // Up and to the left, at an awkward angle, nothing there.
      const ax = h.x - 50;
      const ay = h.y - 70;
      aimAndAttack(w, ax, ay);
      w.update(DT);
      const s = w.shots.find((x) => x.team === 'hero' && x.from === h.uid)!;
      expect(s, cls).toBeDefined();
      const [wx, wy] = norm(ax - h.x, ay - (h.y - HOLD_Y));
      const [sx, sy] = norm(s.vx, s.vy);
      expect(sx, cls).toBeCloseTo(wx, 9);
      expect(sy, cls).toBeCloseTo(wy, 9);
      // Its path runs through the cursor: the point off the line is a rounding error.
      const off = Math.abs((ax - s.x) * sy - (ay - s.y) * sx);
      expect(off, cls).toBeLessThan(1e-6);
      expect(Math.hypot(s.vx, s.vy), cls).toBeGreaterThan(85 * 1.8);
      // The knight turns to its aim.
      expect(h.aimX).toBeCloseTo(wx, 9);
      expect(h.aimY).toBeCloseTo(wy, 9);
    }
    expect(Math.min(...Object.values(SHOT_SPEED))).toBeGreaterThan(85 * 1.8);
  });

  it('keeps the arcane bolt\'s light homing as its own (a nudge, not a lock-on)', () => {
    const w = world(['arcanist']);
    const h = w.heroes[0];
    aimAndAttack(w, h.x + 60, h.y);
    w.update(DT);
    const s = w.shots.find((x) => x.team === 'hero')!;
    expect(s.homing).toBeGreaterThan(0);
    expect(s.homing).toBeLessThan(3);
    expect(w.shots.find((x) => x.team === 'hero' && x.kind === 'arrow')).toBeUndefined();
  });

  it('swings melee along the aim, all the way round, at the class\'s rate while it walks at full speed', () => {
    const w = world(['blade']);
    const h = w.heroes[0];
    for (const ang of [0, 0.7, 2.2, -2.9, -1.2]) {
      w.input.attack = false;
      run(w, 0.8);
      const ax = h.x + Math.cos(ang) * 40;
      const ay = h.y - HOLD_Y + Math.sin(ang) * 40;
      aimAndAttack(w, ax, ay);
      w.update(DT);
      expect(h.swing, `angle ${ang}`).toBeDefined();
      expect(h.swing!.ax).toBeCloseTo(Math.cos(ang), 9);
      expect(h.swing!.ay).toBeCloseTo(Math.sin(ang), 9);
    }
    // Held, walking: blows at the class's rate (a touch quicker for the knight you steer), and the
    // knight keeps its full speed.
    w.input.attack = false;
    run(w, 1);
    const swings: number[] = [];
    const strides: number[] = [];
    let last = h.swingT;
    // Walking right (and back and forth, to stay off the walls), aiming the other way.
    for (let t = 0; t < 2; t += DT) {
      w.input.mx = Math.floor(t / 0.5) % 2 ? -1 : 1;
      aimAndAttack(w, h.x - w.input.mx * 40, h.y - 20);
      const x0 = h.x;
      const free = !h.shove && !h.swing;
      w.update(DT);
      if (free && !h.shove) strides.push(Math.abs(h.x - x0));
      if (h.swingT > last + 1e-6) swings.push(w.time);
      last = h.swingT;
    }
    w.input.mx = 0;
    const gaps = swings.slice(1).map((t, i) => t - swings[i]);
    for (const g of gaps) expect(g).toBeCloseTo(h.atkCd! * STEER_CD, 1);
    expect(swings.length).toBeGreaterThanOrEqual(3);
    // Between the little steps into its blows, it walks at its full speed.
    expect(strides.length).toBeGreaterThan(20);
    for (const s of strides) expect(s).toBeCloseTo(h.speed * DT, 6);
    // It faces its aim, not the walk: last walking left, aiming right.
    expect(h.aimX).toBeGreaterThan(0.8);
    expect(h.dir).toBe(1);
    expect(h.aiming).toBeGreaterThan(0);
  });

  it('auto-aims on touch: the foe ahead of where you move, else the nearest; locked on until it falls or leaves range', () => {
    const w = world(['blade']);
    const h = w.heroes[0];
    // One close behind, one a little further ahead (to the right).
    const behind = foeAt(w, h, 0, -26, 4);
    const ahead = foeAt(w, h, 1, 40, -6);
    expect(autoTarget(w, h, 1, 0)).toBe(ahead);
    expect(h.aimLock).toBe(ahead.uid);
    // Standing still: the nearest.
    h.aimLock = null;
    expect(autoTarget(w, h, 0, 0)).toBe(behind);
    // Locked on: it keeps that foe even as another comes nearer, and whichever way you move.
    h.aimLock = null;
    autoTarget(w, h, 1, 0);
    behind.x = h.x - 12;
    expect(autoTarget(w, h, -1, 0)).toBe(ahead);
    // It falls: the next pick.
    ahead.dead = true;
    expect(autoTarget(w, h, -1, 0)).toBe(behind);
    // A locked foe that leaves range is let go.
    ahead.dead = false;
    h.aimLock = ahead.uid;
    ahead.x = h.x + autoRange(h) * 1.4;
    expect(autoTarget(w, h, 1, 0)).toBe(behind);
    // Nothing in range: nothing.
    behind.x = h.x - autoRange(h) * 2;
    h.aimLock = null;
    expect(autoTarget(w, h, 1, 0)).toBeNull();
    expect(h.aimLock).toBeNull();
    expect(AHEAD).toBeGreaterThan(0.3);
  });

  it('Auto attack: your knight aims and attacks by itself at foes in reach, while moving and dodging stay yours', () => {
    const w = world(['ranger']);
    const h = w.heroes[0];
    w.auto = true;
    const m = foeAt(w, h, 0, 70, -10);
    const x0 = h.x;
    const y0 = h.y;
    // No button held: it shoots the foe in reach, facing it, locked on (the brackets show).
    w.update(DT);
    const s = w.shots.find((x) => x.team === 'hero' && x.from === h.uid);
    expect(s).toBeDefined();
    const [ax, ay] = norm(m.x - h.x, m.y - 6 - (h.y - HOLD_Y));
    expect(norm(s!.vx, s!.vy)[0]).toBeCloseTo(ax, 6);
    expect(norm(s!.vx, s!.vy)[1]).toBeCloseTo(ay, 6);
    expect(h.aimLock).toBe(m.uid);
    expect(h.aiming).toBeGreaterThan(0);
    // It doesn't walk anywhere by itself...
    run(w, 1);
    expect(Math.hypot(h.x - x0, h.y - y0)).toBeLessThan(1);
    // ...you move it (attacking all the while, facing its foe)...
    w.input.mx = -1;
    let shots = 0;
    for (let t = 0; t < 1; t += DT) {
      const n = w.shots.length;
      w.update(DT);
      if (w.shots.length > n) shots++;
    }
    expect(h.x).toBeLessThan(x0 - h.speed * 0.8);
    expect(shots).toBeGreaterThanOrEqual(1);
    expect(h.aimX).toBeGreaterThan(0.8);
    // ...and you dodge.
    w.input.dodge = true;
    w.update(DT);
    expect(h.rolling).toBeDefined();
    w.input.mx = 0;
    // A foe out of reach isn't attacked (a blade's swing reaches about 36 px).
    const v = world(['blade']);
    v.auto = true;
    const far = foeAt(v, v.heroes[0], 0, 60, 0);
    run(v, 0.5);
    expect(v.heroes[0].swingT).toBe(0);
    expect(far.hp).toBe(far.maxHp);
    // The dev bot, by contrast, walks your knight into the fight by itself.
    const b = world(['blade']);
    b.bot = true;
    const k = b.heroes[0];
    foeAt(b, k, 0, 60, 0);
    const bx = k.x;
    run(b, 1);
    expect(k.x - bx).toBeGreaterThan(10);
  });

  it('holding Attack on touch swings at the auto-aim\'s foe; dragging aims instead', () => {
    const w = world(['blade']);
    const h = w.heroes[0];
    const m = foeAt(w, h, 0, 0, -24);
    const hp = m.hp;
    w.input.attack = true;
    w.update(DT);
    expect(h.aimLock).toBe(m.uid);
    expect(h.swing!.ay).toBeLessThan(-0.9);
    expect(m.hp).toBeLessThan(hp);
    // The Attack button dragged to the left: it swings left, and the lock is dropped.
    w.input.aimDx = -1;
    w.input.aimDy = 0;
    run(w, 0.7);
    expect(h.aimLock).toBeNull();
    expect(h.swing?.ax ?? h.aimX).toBeLessThan(-0.99);
    // Let go: no lock, no more blows.
    w.input.attack = false;
    w.input.aimDx = w.input.aimDy = null;
    w.update(DT);
    expect(h.aimLock).toBeNull();
  });
});

// ------------------------------------------------------------------ melee

describe('melee swings', () => {
  it('hit only in front: the Blade\'s wide arc, the Guardian\'s short one, the Lancer\'s long line', () => {
    const cases: Array<[ClassId, Array<[number, number, boolean]>]> = [
      // [x, y from the knight, hit?] with the aim straight right.
      ['blade', [[22, 0, true], [12, -16, true], [10, 18, true], [-14, 0, false], [-6, -20, false], [44, 0, false]]],
      ['guardian', [[18, 0, true], [12, 10, true], [-14, 0, false], [0, -26, false], [34, 0, false]]],
      ['lancer', [[20, 0, true], [42, 2, true], [30, -17, false], [-12, 0, false], [0, 16, false], [64, 0, false]]],
    ];
    for (const [cls, spots] of cases) {
      const w = world([cls]);
      const h = w.heroes[0];
      const foes = spots.map(([x, y], i) => foeAt(w, h, i, x, y));
      const before = foes.map((m) => m.hp);
      aimAndAttack(w, h.x + 50, h.y - HOLD_Y);
      w.update(DT);
      spots.forEach(([x, y, hit], i) => expect(foes[i].hp < before[i], `${cls} at ${x},${y}`).toBe(hit));
    }
  });

  it('is a live hitbox: a foe walking in while it lasts is hit, once', () => {
    const w = world(['blade']);
    const h = w.heroes[0];
    const m = foeAt(w, h, 0, 60, 0);
    aimAndAttack(w, h.x + 50, h.y - HOLD_Y);
    w.update(DT);
    w.input.attack = false;
    const hp = m.hp;
    m.x = h.x + 20;
    w.update(DT);
    expect(m.hp).toBeLessThan(hp);
    const once = m.hp;
    w.update(DT);
    expect(m.hp).toBe(once);
    // Long gone after its live window.
    run(w, SWINGS.blade.live + 0.05);
    expect(h.swing).toBeUndefined();
  });

  it('knocks foes back along the hit, a slide over a few frames (the Guardian\'s furthest)', () => {
    const dist: Record<string, number> = {};
    for (const cls of ['blade', 'guardian'] as const) {
      const w = world([cls]);
      const h = w.heroes[0];
      const m = foeAt(w, h, 0, 16, 0);
      const x0 = m.x;
      aimAndAttack(w, h.x + 50, h.y - HOLD_Y);
      w.update(DT);
      w.input.attack = false;
      // Not all at once: a slide.
      expect(m.x - x0).toBeLessThan(SWINGS[cls].knock * 0.7);
      run(w, 0.5);
      dist[cls] = m.x - x0;
      expect(dist[cls], cls).toBeGreaterThan(SWINGS[cls].knock * 0.6);
      expect(Math.abs(m.y - (h.y + 0)), cls).toBeLessThan(6);
    }
    expect(dist.guardian).toBeGreaterThan(dist.blade * 1.5);
  });

  it('cut foes\' shots out of the air: the Blade sends them back along its aim, the Guardian knocks them down', () => {
    for (const cls of ['blade', 'guardian'] as const) {
      const w = world([cls]);
      const h = w.heroes[0];
      const s = bulletAt(w, h, 16, -4);
      const behind = bulletAt(w, h, -40, 0);
      aimAndAttack(w, h.x + 50, h.y - HOLD_Y);
      w.update(DT);
      expect(w.shots.includes(s), cls).toBe(false);
      expect(w.shots.includes(behind), cls).toBe(true);
      expect(w.events.some((e) => e.type === 'clink'), cls).toBe(true);
      expect(w.fx.some((f) => f.src === 'cut'), cls).toBe(true);
      const back = w.shots.filter((x) => x.team === 'hero');
      if (cls === 'blade') {
        expect(back).toHaveLength(1);
        const [bx, by] = norm(back[0].vx, back[0].vy);
        expect(bx).toBeCloseTo(h.swing!.ax, 9);
        expect(by).toBeCloseTo(h.swing!.ay, 9);
        expect(Math.hypot(back[0].vx, back[0].vy)).toBeGreaterThanOrEqual(REFLECT_SPEED);
        expect(back[0].from).toBe(h.uid);
      } else expect(back).toHaveLength(0);
      // The knight wasn't hit by it.
      expect(h.hp).toBe(h.maxHp);
    }
  });

  it('a sent-back shot hits the foes it flies into', () => {
    const w = world(['blade']);
    const h = w.heroes[0];
    const m = foeAt(w, h, 0, 70, 0);
    const hp = m.hp;
    bulletAt(w, h, 14, 0);
    aimAndAttack(w, h.x + 50, h.y - HOLD_Y);
    w.update(DT);
    w.input.attack = false;
    run(w, 0.6);
    expect(m.hp).toBeLessThan(hp);
  });

  it('the Lancer\'s thrust pops every shot along its line, out to its reach', () => {
    const w = world(['lancer']);
    const h = w.heroes[0];
    const near = bulletAt(w, h, 12, 0);
    const far = bulletAt(w, h, 40, 2);
    const off = bulletAt(w, h, 24, 18);
    aimAndAttack(w, h.x + 50, h.y - HOLD_Y);
    w.update(DT);
    expect(w.shots.includes(near)).toBe(false);
    expect(w.shots.includes(far)).toBe(false);
    expect(w.shots.includes(off)).toBe(true);
    expect(w.shots.filter((x) => x.team === 'hero')).toHaveLength(0);
  });

  it('squadmates\' swings cut shots too', () => {
    const w = world(['ranger', 'blade']);
    const ally = w.heroes[1];
    const m = foeAt(w, ally, 0, 18, 0);
    const s = bulletAt(w, ally, 12, -3);
    w.update(DT);
    expect(ally.swing).toBeDefined();
    expect(m.hp).toBeLessThan(m.maxHp);
    expect(w.shots.includes(s)).toBe(false);
    // Sent back (a Blade's), heard as a squadmate's clink.
    expect(w.events.filter((e) => e.type === 'clink')).toEqual([expect.objectContaining({ reflect: true, mine: false })]);
  });

  it('measures arcs with the shot\'s own size, and never behind the knight', () => {
    const arc = { shape: 'arc' as const, ax: 1, ay: 0, reach: 30, half: (72 * Math.PI) / 180 };
    expect(inSwing(arc, 20, 0, 3)).toBe(true);
    expect(inSwing(arc, 32, 0, 3)).toBe(true);
    expect(inSwing(arc, 34, 0, 3)).toBe(false);
    expect(inSwing(arc, -10, 0, 3)).toBe(false);
    expect(inSwing(arc, 0, -12, 3)).toBe(false);
    expect(inSwing(arc, 2, 0, 3)).toBe(true);
  });
});

// ------------------------------------------------------------------ feel

describe('the fight\'s feel', () => {
  it('freezes the moment on your blows: a short hit-stop, with Auto attack too, none for squadmates or the dev bot', () => {
    const w = world(['blade', 'blade']);
    const h = w.heroes[0];
    foeAt(w, h, 0, 18, 0);
    aimAndAttack(w, h.x + 50, h.y - HOLD_Y);
    w.update(DT);
    expect(w.hitStop).toBeGreaterThanOrEqual(0.04);
    expect(w.hitStop).toBeLessThanOrEqual(0.07);
    // A squadmate's blows don't stop the world.
    const v = world(['ranger', 'blade']);
    foeAt(v, v.heroes[1], 0, 18, 0);
    v.update(DT);
    expect(v.heroes[1].swing).toBeDefined();
    expect(v.hitStop).toBe(0);
    // Auto attack swinging for you: still your knight's blows.
    const u = world(['blade']);
    u.auto = true;
    foeAt(u, u.heroes[0], 0, 18, 0);
    u.update(DT);
    expect(u.heroes[0].swing).toBeDefined();
    expect(u.hitStop).toBeGreaterThan(0);
    // The dev bot playing your knight: no freezes.
    const a = world(['blade']);
    a.bot = true;
    foeAt(a, a.heroes[0], 0, 18, 0);
    a.update(DT);
    expect(a.heroes[0].swing).toBeDefined();
    expect(a.hitStop).toBe(0);
  });

  it('a hit-stop holds every system alike, and the same seed and inputs play out the same with it', async () => {
    // During a freeze a foe's bullet barely moves.
    const w = world(['blade']);
    const s = bulletAt(w, w.heroes[0], 120, 0);
    w.hitStop = 0.05;
    const x0 = s.x;
    w.update(0.05);
    expect(Math.abs(s.x - x0)).toBeCloseTo(70 * 0.05 * 0.15, 6);
    // A freeze is as long at any frame rate.
    const a = world(['blade']);
    const b = world(['blade']);
    a.hitStop = b.hitStop = 0.05;
    run(a, 0.2, 1 / 30);
    run(b, 0.2, 1 / 120);
    expect(a.time).toBeCloseTo(b.time, 9);
    // Two runs of a fight full of freezes come out the same, frame for frame. (Each on fresh modules:
    // units are numbered from one counter, and foes' footwork is phased by their numbers.)
    const fight = async () => {
      vi.resetModules();
      const { World: FreshWorld } = await import('../src/world/world');
      const biome = BIOMES.hamlet;
      const map = generateFloor({ floor: 2, biome, seed: 7, boss: false });
      const v = new FreshWorld({ map, biome, floor: 2, boss: false, mobTypes: floorMobs(biome, 2, 7), bossType: null, squad: squad(['blade', 'ranger', 'cleric'].map((c) => knightId('rare', c as ClassId))), perks: [], controlled: 0, seed: 7, goldPerKill: 3 });
      const h = v.heroes[0];
      for (const m of v.mobs) if (Math.hypot(m.x - h.x, m.y - h.y) < 200) m.x += 400;
      for (let i = 0; i < 4; i++) {
        const m = v.mobs[i];
        m.x = h.x + 22 + i * 6;
        m.y = h.y + (i - 1.5) * 10;
        v.wake(m);
      }
      const out: number[] = [];
      let stops = 0;
      for (let f = 0; f < 240; f++) {
        aimAndAttack(v, h.x + 40, h.y - 10 + Math.sin(f / 20) * 30);
        v.input.mx = Math.sin(f / 30);
        v.update(f % 3 === 0 ? 1 / 30 : 1 / 60);
        if (v.hitStop > 0) stops++;
        if (f % 20 === 0) out.push(v.time, v.hitStop, h.x, h.y, h.hp, ...v.mobs.slice(0, 4).map((m) => m.hp + m.x + m.y));
      }
      return { out, stops };
    };
    const one = await fight();
    const two = await fight();
    expect(one.stops).toBeGreaterThan(2);
    expect(two.out).toEqual(one.out);
  });

  it('when your knight is hit: a freeze, a shake, and 0.8 s of blinking invulnerability; not for squadmates', () => {
    const w = world(['blade', 'ranger']);
    const [h, ally] = w.heroes;
    const m = w.mobs[0];
    expect(w.damage(h, 10, m)).toBeGreaterThan(0);
    expect(h.graceT).toBe(GRACE);
    expect(w.hitStop).toBeCloseTo(HURT_STOP, 9);
    expect(w.shake).toBeGreaterThan(0);
    // Untouchable for the grace...
    expect(w.damage(h, 10, m)).toBe(0);
    run(w, GRACE - 0.15);
    expect(w.damage(h, 10, m)).toBe(0);
    // ...then hittable again.
    run(w, 0.3);
    expect(h.graceT).toBe(0);
    expect(w.damage(h, 10, m)).toBeGreaterThan(0);
    // A squadmate takes its hits as before.
    expect(w.damage(ally, 10, m)).toBeGreaterThan(0);
    expect(ally.graceT ?? 0).toBe(0);
    expect(w.damage(ally, 10, m)).toBeGreaterThan(0);
  });

  it('the dodge roll: toward where you move (or your aim, standing), untouchable for most of it, then a landing; no attacks', () => {
    const w = world(['blade']);
    const h = w.heroes[0];
    // Standing still, aiming down: it rolls down.
    w.input.aimX = h.x;
    w.input.aimY = h.y + 60;
    w.input.dodge = true;
    w.update(DT);
    expect(h.rolling).toBeDefined();
    expect(h.rolling!.dy).toBeGreaterThan(0.99);
    const whole = h.rolling!.dur + h.rolling!.land!;
    expect(h.rolling!.dur / whole).toBeCloseTo(ROLL_SAFE, 6);
    expect(ROLL_SAFE).toBeGreaterThanOrEqual(0.7);
    // Untouchable in the air, bullets and blows alike; attacking does nothing.
    w.input.attack = true;
    const s = bulletAt(w, h, 0, 0);
    s.vx = s.vy = 0;
    w.update(DT);
    expect(h.hp).toBe(h.maxHp);
    expect(w.damage(h, 10, w.mobs[0])).toBe(0);
    expect(h.swing).toBeUndefined();
    // (Rolling through the bullet was a PERFECT roll.)
    expect(h.dodge?.perfect).toBe(true);
    w.shots.length = 0;
    // The landing: hittable, still no blows.
    while (h.rolling) w.update(DT);
    expect(h.landing).toBeDefined();
    while (h.landing && h.invuln > 0) w.update(DT / 4);
    expect(h.landing).toBeDefined();
    expect(w.damage(h, 10, w.mobs[0])).toBeGreaterThan(0);
    expect(h.swing).toBeUndefined();
    // On its feet: it attacks again.
    w.shots.length = 0;
    run(w, 0.2);
    expect(h.landing).toBeUndefined();
    expect(h.swingT).toBeGreaterThan(0);
    // Moving: it rolls the way it moves, whatever it aims at.
    const v = world(['ranger']);
    const k = v.heroes[0];
    v.input.aimX = k.x + 80;
    v.input.aimY = k.y;
    v.input.mx = -1;
    v.input.dodge = true;
    v.update(DT);
    expect(k.rolling!.dx).toBeLessThan(-0.99);
  });

  it('leans the camera a quarter of the way toward the aim, capped, and back when you stop aiming', () => {
    const cam = new Camera();
    const frame = (aim: { x: number; y: number } | null) => ({ dt: 1 / 60, map: 'm', mapW: 4000, mapH: 4000, viewW: 432, viewH: 270, focusX: 0.5, focusY: 0.5, lead: { uid: 1, x: 2000, y: 2000 }, foes: [], aim });
    cam.update(frame(null));
    const x0 = cam.x;
    for (let i = 0; i < 240; i++) cam.update(frame({ x: 2080, y: 2000 }));
    expect(cam.x - x0).toBeCloseTo(20, 0);
    for (let i = 0; i < 240; i++) cam.update(frame({ x: 2800, y: 2000 }));
    expect(cam.x - x0).toBeCloseTo(Math.min(AIM_CAP.px, 432 * AIM_CAP.x), 0);
    for (let i = 0; i < 240; i++) cam.update(frame(null));
    expect(cam.x - x0).toBeCloseTo(0, 0);
  });
});
