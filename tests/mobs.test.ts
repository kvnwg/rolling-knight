import { describe, expect, it } from 'vitest';
import { CLASSES, knightId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { addKnight, knightStats } from '../src/core/roster';
import { isStill, mobMotion } from '../src/render/mobMotion';
import { bulletSpeed, threatened, volley } from '../src/world/ai';
import { BIOME_ORDER, BIOMES } from '../src/world/biomes';
import { inRing, type Unit } from '../src/world/entities';
import { FLOOR, LIQUID, SOLID, TILE, type FloorMap } from '../src/world/mapgen';
import { BASE, LUNGES, OGRE_LOB, floorMobs, gunFor, lungeFor, quakeFor, type Behavior, type MobType } from '../src/world/mobgen';
import type { BodyPlan } from '../src/world/biomes';
import { heroDodge } from '../src/world/skills';
import { SPAWN_IN, World, type HeroSpec } from '../src/world/world';

const DT = 1 / 60;

function squad(ids: string[]): HeroSpec[] {
  const s = newGame(1);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id.split('-') as [HeroSpec['rarity'], HeroSpec['cls']];
    return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
  });
}

/**
 * A mob design with its body's lunge (and an ogre's throw), as mobgen builds them; `armed`, its gun and
 * the bullets it shakes loose too (left out by default, so a test of a lunge sees only the lunge).
 */
function mobType(plan: BodyPlan, behavior: Behavior, biome = 'hamlet', armed = false): MobType {
  const b = BASE[behavior];
  const lunge = lungeFor(biome, plan, behavior, false);
  const gun = armed ? gunFor(plan, behavior, lunge, b.atkCd, b.range) : undefined;
  const quake = armed ? quakeFor(plan, behavior) : 0;
  return {
    id: `${biome}-2-0`, name: 'Test', plan, behavior, ramp: ['#3b2a1e', '#6a4a2c', '#9a6d3e', '#c99a5a'], eye: '#ffe066',
    size: plan === 'golem' ? 1.25 : 1, radius: plan === 'golem' ? 6 : 5, hp: b.hp, atk: b.atk, speed: b.speed, range: b.range, atkCd: b.atkCd,
    flying: plan === 'flyer', features: { horns: false, spikes: false, crest: false, eyes: 2, tail: false, seed: 1 },
    shot: { speed: 75, color: '#ff6a6a', radius: 3 },
    ...(lunge ? { lunge } : {}), ...(plan === 'golem' ? { lob: OGRE_LOB } : {}), ...(gun ? { gun } : {}), ...(quake ? { quake } : {}),
  };
}

/** A plain arena: open floor walled round, `n` tiles each way (nothing else on it). */
function arena(n = 24): FloorMap {
  const tiles = new Uint8Array(n * n).fill(FLOOR);
  for (let i = 0; i < n; i++) {
    tiles[i] = tiles[(n - 1) * n + i] = tiles[i * n] = tiles[i * n + n - 1] = SOLID;
  }
  const mid = (n / 2) * TILE;
  return { w: n, h: n, tiles, path: new Uint8Array(n * n), rooms: [], start: { x: mid, y: mid }, exit: { x: TILE * 2, y: TILE * 2 }, props: [], spawns: [], seed: 1 };
}

/**
 * A floor with one knight (yours, standing still: not on Auto, so it neither moves nor dodges by
 * itself) in the middle of an open arena and one awake mob of `type` `dx` px to its right, nothing
 * else on it. The mob is hard to kill, so the knight's auto attacks don't end the test.
 */
function duel(type: MobType, dx: number, cls: 'guardian' | 'blade' = 'guardian') {
  const biome = BIOMES.hamlet;
  const map = arena();
  const tx = map.w / 2;
  const ty = map.h / 2;
  const w = new World({ map, biome, floor: 2, boss: false, mobTypes: [type], bossType: null, squad: squad([knightId('rare', cls)]), perks: [], controlled: 0, seed: 99, goldPerKill: 3 });
  w.mobs = [];
  const h = w.heroes[0];
  h.x = tx * TILE + TILE / 2;
  h.y = ty * TILE + TILE / 2;
  // (The knight's skill rolls held: in a fight they chain one after another, and these are about the foe.)
  h.specialT = 999;
  const m = w.makeMob(type, h.x + dx, h.y, false, false);
  m.awake = true;
  m.hp = m.maxHp = 1e9;
  w.mobs.push(m);
  w.refreshFlows();
  return { w, h, m, map, tx, ty };
}

function run(w: World, seconds: number, until: () => boolean = () => false): void {
  for (let t = 0; t < seconds && !until(); t += DT) w.update(DT);
}

const perfects = (w: World) => w.events.filter((e) => e.type === 'perfect').length;

describe('monsters, faster and harder', () => {
  it('come on at nearly a knight\'s pace (and even ogres jog)', () => {
    const slowest = Math.min(...Object.values(CLASSES).map((c) => c.speed));
    expect(BASE.chaser.speed).toBeGreaterThan(slowest * 0.85);
    expect(BASE.swarm.speed).toBeGreaterThan(slowest);
    expect(BASE.tank.speed).toBeGreaterThanOrEqual(30);
    for (const b of Object.values(BASE)) expect(b.speed).toBeGreaterThanOrEqual(30);
  });

  it('close the gap the way their bodies say: wolves pounce, slimes hop, goblins stab, bats swoop, ogres leap and throw', () => {
    expect(lungeFor('hamlet', 'beast', 'chaser', false)?.name).toBe('pounce');
    expect(lungeFor('hamlet', 'beast', 'charger', false)?.name).toBe('charge');
    expect(lungeFor('hamlet', 'slime', 'chaser', false)?.name).toBe('hop');
    expect(lungeFor('hamlet', 'humanoid', 'chaser', false)?.name).toBe('stab');
    expect(lungeFor('hamlet', 'humanoid', 'chaser', true)?.name).toBe('shoulder');
    expect(lungeFor('tundra', 'humanoid', 'chaser', false)?.name).toBe('shoulder');
    expect(lungeFor('crypt', 'humanoid', 'chaser', false)?.name).toBe('thrust');
    expect(lungeFor('hamlet', 'humanoid', 'ranged', false)).toBeUndefined();
    expect(lungeFor('hamlet', 'flyer', 'swarm', false)?.name).toBe('swoop');
    expect(lungeFor('farmland', 'pig', 'charger', false)?.name).toBe('charge');
    expect(lungeFor('tundra', 'golem', 'tank', false)?.name).toBe('slam');
    for (const L of Object.values(LUNGES)) {
      // Every tell is long enough to see on a phone, and every one leaves the mob open after.
      expect(L.wind).toBeGreaterThanOrEqual(0.35);
      expect(L.recover).toBeGreaterThanOrEqual(0.3);
      expect(L.min).toBeLessThan(L.max);
    }
    // Floors design them in: every hamlet floor has something that lunges, and tundra golems throw.
    for (let f = 1; f <= 4; f++) expect(floorMobs(BIOMES.hamlet, f, 7).some((t) => t.lunge)).toBe(true);
    for (const seed of [1, 2, 3, 4, 5, 6]) for (const t of floorMobs(BIOMES.tundra, 17, seed)) if (t.plan === 'golem') expect(t.lob).toBeDefined();
  });
});

describe('an ogre that can\'t reach you', () => {
  it('throws a boulder across the water: a ring where it will land, then the hit', () => {
    const ogre = mobType('golem', 'tank', 'tundra');
    const { w, h, m, map, tx, ty } = duel(ogre, 6 * TILE);
    // The knight on an island: a ring of water two tiles out (sight crosses water; feet don't).
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === 2) map.tiles[(ty + dy) * map.w + tx + dx] = LIQUID;
    w.refreshFlows();
    m.throwT = 0;
    m.lungeT = 0;
    const hp = h.hp;
    run(w, 3, () => w.areas.some((a) => a.kind === 'boulder'));
    const boulder = w.areas.find((a) => a.kind === 'boulder');
    expect(boulder).toBeDefined();
    // It comes down where the knight stands, with time to see it coming.
    expect(inRing(h.x, h.y, h.r, boulder!.x, boulder!.y, boulder!.r)).toBe(true);
    expect(boulder!.delay).toBeGreaterThan(0.5);
    expect(boulder!.flight).toBeGreaterThan(0.5);
    run(w, 2, () => !w.areas.some((a) => a.kind === 'boulder'));
    expect(h.hp).toBeLessThan(hp);
    // (And it never got across.)
    expect(Math.hypot(m.x - h.x, m.y - h.y)).toBeGreaterThan(2 * TILE);
  });

  it('just comes for you when it can: no boulder, it closes in (or leaps)', () => {
    const ogre = mobType('golem', 'tank', 'tundra');
    const { w, h, m } = duel(ogre, 6 * TILE);
    m.throwT = 0;
    let leapt = false;
    run(w, 3, () => {
      if (m.rush?.kind === 'leap') leapt = true;
      return Math.hypot(m.x - h.x, m.y - h.y) < m.r + h.r + 16;
    });
    expect(w.areas.some((a) => a.kind === 'boulder')).toBe(false);
    expect(leapt || Math.hypot(m.x - h.x, m.y - h.y) < m.r + h.r + 16).toBe(true);
  });

  it('throws at a knight that keeps away from it for a while', () => {
    const ogre = mobType('golem', 'tank', 'tundra');
    const { w, h, m } = duel(ogre, 5 * TILE);
    m.throwT = 0;
    m.lungeT = 99;
    // The knight keeps stepping back out of reach.
    let thrown = false;
    run(w, 6, () => {
      if (Math.hypot(m.x - h.x, m.y - h.y) < 60) h.x -= 1.2;
      thrown = w.areas.some((a) => a.kind === 'boulder');
      return thrown;
    });
    expect(thrown).toBe(true);
  });
});

describe('dashes and leaps', () => {
  /** Runs until the mob's dash or leap is under way (it winds up first: the tell). */
  function untilRush(w: World, m: Unit): void {
    m.lungeT = 0;
    run(w, 3, () => !!m.rush);
    expect(m.rush).toBeDefined();
  }

  it('a goblin\'s dash-stab winds up (its lane locks halfway), then hits a knight standing in it', () => {
    const { w, h, m } = duel(mobType('humanoid', 'chaser'), 44);
    m.lungeT = 0;
    run(w, 1, () => (m.windT ?? 0) > 0);
    expect(m.move).toBe('dash');
    // While it winds up, the squad's AI sees it coming once the aim holds.
    const aim = [m.moveX, m.moveY];
    run(w, (m.windDur ?? 0) * 0.6);
    expect(threatened(w, h)).not.toBeNull();
    expect([m.moveX, m.moveY]).toEqual(aim);
    const hp = h.hp;
    run(w, 1, () => !m.rush && (m.recoverT ?? 0) > 0);
    expect(h.hp).toBeLessThan(hp);
    expect(perfects(w)).toBe(0);
  });

  it('a dash goes straight through a knight mid-roll: no damage, and a perfect roll', () => {
    const { w, h, m } = duel(mobType('humanoid', 'chaser'), 44, 'blade');
    untilRush(w, m);
    const hp = h.hp;
    // Roll into it, through the dash.
    expect(heroDodge(w, h, -(m.rush!.x1 - m.rush!.x0), 0)).toBe(true);
    run(w, 0.6, () => !m.rush);
    expect(m.rush).toBeUndefined();
    expect(h.hp).toBe(hp);
    expect(perfects(w)).toBe(1);
  });

  it('a wolf\'s pounce lands on a knight standing on its ring, but not on one rolling as it lands', () => {
    for (const roll of [false, true]) {
      const { w, h, m } = duel(mobType('beast', 'chaser'), 60, 'blade');
      untilRush(w, m);
      expect(m.rush!.kind).toBe('leap');
      expect(inRing(h.x, h.y, h.r, m.rush!.x1, m.rush!.y1, m.rush!.r)).toBe(true);
      const hp = h.hp;
      // About to land: roll now (or don't).
      run(w, 1, () => !!m.rush && m.rush.t + 2 * DT >= m.rush.dur);
      if (roll) expect(heroDodge(w, h, 0, 1)).toBe(true);
      run(w, 0.5, () => !m.rush);
      expect(m.rush).toBeUndefined();
      if (roll) {
        expect(h.hp).toBe(hp);
        expect(perfects(w)).toBe(1);
      } else {
        expect(h.hp).toBeLessThan(hp);
        expect(perfects(w)).toBe(0);
      }
    }
  });

  it('a slime hops the same way, and the squad\'s AI sees its landing ring', () => {
    const { w, h, m } = duel(mobType('slime', 'chaser'), 50);
    m.lungeT = 0;
    run(w, 1, () => (m.windT ?? 0) > 0);
    expect(m.move).toBe('leap');
    run(w, (m.windDur ?? 0) * 0.6);
    const out = threatened(w, h);
    expect(out).not.toBeNull();
    // Away from where it will land.
    expect(out![0] * (h.x - m.spotX!) + out![1] * (h.y - m.spotY!)).toBeGreaterThanOrEqual(0);
  });
});

describe('perfect rolls', () => {
  it('fire once per roll, however many hits go through it, and again on the next roll', () => {
    const { w, h, m } = duel(mobType('humanoid', 'ranged'), 200, 'blade');
    m.atkT = 99;
    const shoot = () => {
      for (let k = 0; k < 2; k++) w.shots.push({ uid: 9000 + k + w.shots.length, team: 'mob', x: h.x, y: h.y - 6, vx: 0, vy: 0, r: 3, dmg: 5, life: 0.2, kind: 'bullet', color: '#ff6a6a', from: m.uid });
    };
    // A shot that lands on a knight standing there is just a hit.
    shoot();
    const hp = h.hp;
    run(w, 0.1);
    expect(h.hp).toBeLessThan(hp);
    expect(perfects(w)).toBe(0);
    run(w, 2);
    // Two shots through one roll: one perfect roll.
    expect(heroDodge(w, h, 0, 1)).toBe(true);
    shoot();
    run(w, 0.15);
    expect(perfects(w)).toBe(1);
    expect(w.texts.filter((t) => t.style === 'perfect').length).toBe(1);
    expect(w.events.find((e) => e.type === 'perfect')).toMatchObject({ slot: h.slot, mine: true });
    run(w, 2);
    w.shots = [];
    // A roll with nothing to dodge isn't perfect.
    expect(heroDodge(w, h, 1, 0)).toBe(true);
    run(w, 2);
    expect(perfects(w)).toBe(1);
    // The next roll that something goes through is.
    expect(heroDodge(w, h, -1, 0)).toBe(true);
    shoot();
    run(w, 0.15);
    expect(perfects(w)).toBe(2);
  });

  it('count a boulder or a blast going off on a rolling knight, not lingering fire', () => {
    const { w, h, m } = duel(mobType('humanoid', 'ranged'), 200, 'blade');
    m.atkT = 99;
    w.areas.push({ uid: 7001, team: 'mob', x: h.x, y: h.y, r: 30, delay: 0, dur: 2, tick: 0.1, tickT: 0, dmg: 5, kind: 'fire', from: m.uid, color: '#ff7a2a', t: 0 });
    heroDodge(w, h, 0, 1);
    run(w, 0.3);
    expect(perfects(w)).toBe(0);
    w.areas = [];
    run(w, 2);
    w.areas.push({ uid: 7002, team: 'mob', x: h.x, y: h.y, r: 18, delay: 0.05, dur: 0, tick: 1, tickT: 0, dmg: 50, kind: 'boulder', from: m.uid, color: '#888888', t: 0, x0: m.x, y0: m.y, z0: 30, flight: 0.05 });
    const hp = h.hp;
    heroDodge(w, h, 0, 1);
    run(w, 0.2);
    expect(perfects(w)).toBe(1);
    expect(h.hp).toBe(hp);
  });
});

describe('lunges in the renderer (generic motion)', () => {
  const unit = (extra: Partial<Unit>): Unit => ({ ...duel(mobType('beast', 'chaser'), 60).m, ...extra });

  it('crouches through the wind-up, flies an arc off its shadow, and squashes as it lands', () => {
    const wind = mobMotion(unit({ windT: 0.1, windDur: 0.45, move: 'leap' }), 1);
    expect(wind.tall).toBeLessThan(0);
    expect(wind.wide).toBeGreaterThan(0);
    expect(wind.tell).toBeGreaterThan(0);
    const rush = { kind: 'leap' as const, move: 'leap', name: 'pounce', x0: 0, y0: 0, x1: 60, y1: 0, t: 0.2, dur: 0.4, height: 14, dmg: 1, knock: 1, r: 12, through: false, recover: 0.4, big: false, hit: new Set<number>() };
    const top = mobMotion(unit({ rush }), 1);
    expect(top.lift).toBe(14);
    expect(top.shadow).toBeLessThan(0.6);
    expect(top.trail).toBe(true);
    const up = mobMotion(unit({ rush: { ...rush, t: 0.05 } }), 1);
    expect(up.lift).toBeGreaterThan(0);
    expect(up.lift).toBeLessThan(top.lift);
    expect(up.tall).toBeGreaterThan(0);
    const land = mobMotion(unit({ recoverT: 0.38, recoverDur: 0.4 }), 1);
    expect(land.lift).toBe(0);
    expect(land.tall).toBeLessThan(0);
    expect(land.wide).toBeGreaterThan(0);
    expect(isStill(mobMotion(unit({ recoverT: 0.1, recoverDur: 0.4 }), 1))).toBe(true);
    // Whole pixels, always.
    for (const mo of [wind, top, up, land]) for (const v of [mo.lift, mo.wide, mo.tall, mo.jitter]) expect(Number.isInteger(v)).toBe(true);
  });

  it('stretches a dash along its way and dips a swooping flyer', () => {
    const rush = { kind: 'dash' as const, move: 'dash', name: 'stab', x0: 0, y0: 0, x1: 50, y1: 0, t: 0.08, dur: 0.17, height: 0, dmg: 1, knock: 1, r: 3, through: false, recover: 0.3, big: false, hit: new Set<number>() };
    const across = mobMotion(unit({ rush }), 1);
    expect(across.wide).toBeGreaterThan(0);
    expect(across.trail).toBe(true);
    const down = mobMotion(unit({ rush: { ...rush, x1: 0, y1: 50 } }), 1);
    expect(down.tall).toBeGreaterThan(0);
    const bat = mobMotion(unit({ flying: true, rush: { ...rush, name: 'swoop' } }), 1);
    expect(bat.lift).toBeLessThan(0);
  });

  it('warns red through every wind-up: the body pulsing red, a red outline holding', () => {
    let on = 0;
    for (let k = 0; k < 20; k++) {
      const mo = mobMotion(unit({ windT: 0.3, windDur: 0.36, move: 'bite' }), k * 0.03);
      expect(mo.outline).toBe(1);
      if (mo.warn) on++;
    }
    // A couple of frames on, a couple off.
    expect(on).toBeGreaterThan(4);
    expect(on).toBeLessThan(16);
    expect(mobMotion(unit({ windT: 0 }), 1).outline).toBe(0);
  });
});

describe('readable bullets (Enter the Gungeon style)', () => {
  it('every kind of foe has a dash, a leap or a gun, its bullets slower than any knight\'s shot', () => {
    for (const id of BIOME_ORDER) {
      for (const floor of [1, 3, 12, 22]) {
        for (const seed of [1, 2, 3]) {
          for (const t of floorMobs(BIOMES[id], floor, seed)) expect(!!(t.lunge || t.gun), `${t.name} (${t.plan} ${t.behavior})`).toBe(true);
        }
      }
    }
    const slowestKnightShot = 120; // the Cleric's orb
    for (const floor of [2, 25]) {
      const { w, m } = duel(mobType('humanoid', 'ranged', 'hamlet', true), 60);
      w.floor = floor;
      const sp = bulletSpeed(w, m);
      expect(sp).toBeGreaterThanOrEqual(60);
      expect(sp).toBeLessThanOrEqual(100);
      expect(sp).toBeLessThan(slowestKnightShot);
    }
  });

  it('fire after a tell, in patterns denser deeper down and from elites', () => {
    const count = (floor: number, elite: boolean, kind: Parameters<typeof volley>[2]) => {
      const { w, m, h } = duel(mobType('humanoid', 'ranged', 'hamlet', true), 60);
      w.floor = floor;
      m.elite = elite;
      m.atkT = m.gunT = m.lungeT = 99;
      volley(w, m, kind, h.x, h.y);
      // (A burst fires the rest of its shots over the next moments; an archer's darts are quick, and
      // one may have landed by then: every shot fired counts.)
      const fired = new Set<number>();
      const tally = () => {
        for (const s of w.shots) if (s.team === 'mob') fired.add(s.uid);
        return false;
      };
      tally();
      run(w, 0.6, tally);
      return fired.size;
    };
    expect(count(2, false, 'aimed')).toBe(1);
    expect(count(2, false, 'fan')).toBe(3);
    expect(count(25, false, 'fan')).toBe(5);
    expect(count(2, true, 'fan')).toBe(4);
    expect(count(2, false, 'burst')).toBe(2);
    expect(count(25, false, 'burst')).toBe(4);
    expect(count(2, false, 'ring')).toBe(6);
    expect(count(25, false, 'ring')).toBe(10);
    expect(count(2, false, 'curve')).toBe(2);
    // An archer winds up first (the tell: no shot yet), then fires; its third volley is a fan.
    const { w, m } = duel(mobType('humanoid', 'ranged', 'hamlet', true), 60);
    m.atkT = 0;
    m.lungeT = 99;
    w.update(DT);
    expect(m.move).toBe('shoot');
    expect(m.windT).toBeGreaterThan(0.3);
    expect(w.shots.length).toBe(0);
    run(w, 0.6, () => w.shots.length > 0);
    expect(w.shots.filter((s) => s.team === 'mob').length).toBe(1);
    m.volley = 2;
    w.shots = [];
    m.atkT = 0;
    run(w, 1, () => w.shots.length > 0);
    expect(w.shots.filter((s) => s.team === 'mob').length).toBe(3);
  });

  it('curve some of their bullets in', () => {
    const { w, m, h } = duel(mobType('humanoid', 'caster', 'hamlet', true), 70);
    m.atkT = m.gunT = 99;
    volley(w, m, 'curve', h.x, h.y);
    const s = w.shots.find((x) => x.team === 'mob')!;
    expect(s.curve).toBeDefined();
    const before = Math.atan2(s.vy, s.vx);
    run(w, 0.3);
    expect(Math.abs(Math.atan2(s.vy, s.vx) - before)).toBeGreaterThan(0.15);
  });

  it('rise into a fight: a moment before a foe that wakes does anything', () => {
    const { w, m } = duel(mobType('humanoid', 'chaser', 'hamlet', true), 40);
    m.awake = false;
    m.gunT = 0;
    m.lungeT = 0;
    m.atkT = 0;
    w.wake(m);
    expect(m.spawnT).toBeCloseTo(SPAWN_IN, 5);
    const at = [m.x, m.y];
    run(w, SPAWN_IN - 0.1);
    expect(m.windT ?? 0).toBe(0);
    expect(m.rush).toBeUndefined();
    expect(w.shots.length).toBe(0);
    expect([m.x, m.y]).toEqual(at);
    run(w, 0.5);
    expect((m.windT ?? 0) > 0 || !!m.rush || m.x !== at[0]).toBe(true);
  });

  it('shake bullets loose from the edge of a landing ring, for whoever stood clear', () => {
    const { w, m } = duel(mobType('slime', 'chaser', 'hamlet', true), 50);
    m.gunT = 99;
    m.lungeT = 0;
    run(w, 3, () => !!m.rush);
    const r = m.rush!;
    run(w, 1, () => !m.rush);
    const shots = w.shots.filter((s) => s.team === 'mob');
    expect(shots.length).toBe(quakeFor('slime', 'chaser'));
    for (const s of shots) expect(Math.hypot(s.x - m.x, s.y + 6 - m.y)).toBeGreaterThan(r.r * 0.9);
  });

  it('an ogre\'s throw shows its ring through the wind-up, and the boulder comes down there', () => {
    const { w, h, m, map, tx, ty } = duel(mobType('golem', 'tank', 'tundra'), 6 * TILE);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === 2) map.tiles[(ty + dy) * map.w + tx + dx] = LIQUID;
    w.refreshFlows();
    m.throwT = 0;
    run(w, 1, () => m.move === 'throw');
    expect(m.spotX).toBeDefined();
    // Past half the wind-up the spot holds, even if the knight moves.
    run(w, (m.windDur ?? 0) * 0.6);
    const spot = [m.spotX, m.spotY];
    h.x += 10;
    run(w, 1, () => w.areas.some((a) => a.kind === 'boulder'));
    const b = w.areas.find((a) => a.kind === 'boulder')!;
    expect([b.x, b.y]).toEqual(spot);
  });
});
