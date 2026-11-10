import { describe, expect, it } from 'vitest';
import { knightId, type ClassId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { addKnight, knightStats } from '../src/core/roster';
import { BULLET_ART, BULLET_FRAMES, BULLET_INK, BULLET_RAMPS, markSprite, orbSprite } from '../src/render/art/bullets';
import { mineFrame } from '../src/render/foeBullets';
import { aimHolds, bulletSpeed, density, quakeRing, threatened, volley } from '../src/world/ai';
import { BIOME_ORDER, BIOMES, type BodyPlan } from '../src/world/biomes';
import {
  BLADE_BULGE, FORMS, HUE, MINE_FUSE, MINE_TOSS, SPIT_DRIFT, SPORE_SWAY, airborne, bossPattern, cuttable, fire, kick, lob, payload, sitting,
  type BulletForm,
} from '../src/world/bullets';
import type { Shot, Unit } from '../src/world/entities';
import { FLOOR, SOLID, TILE, type FloorMap } from '../src/world/mapgen';
import { startSwing } from '../src/world/melee';
import { BASE, LUNGES, floorBoss, floorMobs, gunFor, kickFor, lungeFor, quakeFor, quakeFormFor, type Behavior, type Gun, type Lunge, type MobType, type Volley } from '../src/world/mobgen';
import { heroDodge } from '../src/world/skills';
import { World, type HeroSpec } from '../src/world/world';

const DT = 1 / 60;
const FORM_NAMES = Object.keys(FORMS) as BulletForm[];

function squad(ids: string[]): HeroSpec[] {
  const s = newGame(1);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id.split('-') as [HeroSpec['rarity'], HeroSpec['cls']];
    return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
  });
}

/** A mob design as mobgen builds it for this body and behavior (its lunge, its gun, what it shakes loose). */
function mobType(plan: BodyPlan, behavior: Behavior, biome = 'hamlet'): MobType {
  const b = BASE[behavior];
  const lunge = lungeFor(biome, plan, behavior, false);
  const gun = gunFor(plan, behavior, lunge, b.atkCd, b.range);
  const quake = quakeFor(plan, behavior);
  const quakeForm = quakeFormFor(plan, behavior);
  const k = kickFor(behavior);
  return {
    id: `${biome}-2-0`, name: 'Test', plan, behavior, ramp: ['#3b2a1e', '#6a4a2c', '#9a6d3e', '#c99a5a'], eye: '#ffe066',
    size: 1, radius: 5, hp: b.hp, atk: b.atk, speed: b.speed, range: b.range, atkCd: b.atkCd,
    flying: plan === 'flyer' || plan === 'ghost', features: { horns: false, spikes: false, crest: false, eyes: 2, tail: false, seed: 1 },
    shot: { speed: 75, color: '#ff6a6a', radius: 3 },
    ...(lunge ? { lunge } : {}), ...(gun ? { gun } : {}), ...(quake ? { quake } : {}), ...(quakeForm ? { quakeForm } : {}), ...(k ? { kick: k } : {}),
  };
}

/** A plain arena: open floor walled round, `n` tiles each way. */
function arena(n = 30): FloorMap {
  const tiles = new Uint8Array(n * n).fill(FLOOR);
  for (let i = 0; i < n; i++) tiles[i] = tiles[(n - 1) * n + i] = tiles[i * n] = tiles[i * n + n - 1] = SOLID;
  const mid = (n / 2) * TILE;
  return { w: n, h: n, tiles, path: new Uint8Array(n * n), rooms: [], start: { x: mid, y: mid }, exit: { x: TILE * 2, y: TILE * 2 }, props: [], spawns: [], seed: 1 };
}

/**
 * One knight (yours, standing still: it neither moves nor dodges by itself) in the middle of an open
 * arena, and one awake foe of `type` `dx` px to its right that does nothing unless the test makes it
 * (it stands, its cooldowns far off): the test fires its bullets by hand.
 */
function stage(type: MobType = mobType('humanoid', 'ranged'), dx = 90, cls: ClassId = 'guardian', floor = 2) {
  const map = arena();
  const w = new World({ map, biome: BIOMES.hamlet, floor, boss: false, mobTypes: [type], bossType: null, squad: squad([knightId('rare', cls)]), perks: [], controlled: 0, seed: 99, goldPerKill: 3 });
  w.mobs = [];
  const h = w.heroes[0];
  h.x = (map.w / 2) * TILE + TILE / 2;
  h.y = (map.h / 2) * TILE + TILE / 2;
  h.specialT = 999;
  h.atkT = 999;
  const m = w.makeMob(type, h.x + dx, h.y, false, false);
  m.awake = true;
  m.hp = m.maxHp = 1e9;
  m.speed = 0;
  m.atkT = m.gunT = m.lungeT = m.throwT = 999;
  w.mobs.push(m);
  w.refreshFlows();
  return { w, h, m };
}

function run(w: World, seconds: number, until: () => boolean = () => false): number {
  let t = 0;
  for (; t < seconds && !until(); t += DT) w.update(DT);
  return t;
}

const foes = (w: World) => w.shots.filter((s) => s.team === 'mob');
const of = (w: World, form: BulletForm) => foes(w).filter((s) => s.b?.form === form);
/** The angle from a foe's muzzle to a knight's body. */
const aimAt = (m: Unit, h: Unit) => Math.atan2(h.y - 6 - (m.y - 6), h.x - m.x);

describe('each kind of bullet flies its own way', () => {
  it('a dart is fast, thin and straight', () => {
    const { w, m } = stage();
    const sp = bulletSpeed(w, m);
    const s = fire(w, m, 'dart', m.x, m.y - 6, Math.PI, sp, 0.9);
    expect(Math.hypot(s.vx, s.vy)).toBeGreaterThan(sp * 1.5);
    expect(s.r).toBeLessThan(2);
    const y0 = s.y;
    run(w, 0.3);
    expect(s.y).toBeCloseTo(y0, 5);
    expect(m.x - s.x).toBeGreaterThan(sp * 1.5 * 0.29);
  });

  it('spit leaves fast, brakes, and hangs in the air', () => {
    const { w, m } = stage();
    const sp = bulletSpeed(w, m);
    const s = fire(w, m, 'spit', m.x, m.y - 40, -Math.PI / 2, sp, 0.9);
    expect(Math.hypot(s.vx, s.vy)).toBeGreaterThan(sp * 2);
    run(w, 1.2);
    expect(w.shots.includes(s)).toBe(true);
    expect(Math.hypot(s.vx, s.vy)).toBeLessThan(sp * (SPIT_DRIFT + 0.1));
    expect(Math.hypot(s.vx, s.vy)).toBeGreaterThan(sp * SPIT_DRIFT * 0.95);
  });

  it('a spore weaves from side to side as it drifts', () => {
    const { w, m } = stage();
    const s = fire(w, m, 'spore', m.x, m.y - 60, Math.PI, bulletSpeed(w, m), 0.6, { side: 1 });
    const y0 = s.y;
    let lo = 0;
    let hi = 0;
    run(w, 1.1, () => {
      lo = Math.min(lo, s.y - y0);
      hi = Math.max(hi, s.y - y0);
      return false;
    });
    expect(hi).toBeGreaterThan(SPORE_SWAY * 0.8);
    expect(lo).toBeLessThan(-SPORE_SWAY * 0.8);
    expect(m.x - s.x).toBeGreaterThan(40);
    // Two of a volley lean opposite ways.
    const a = fire(w, m, 'spore', m.x, m.y - 60, Math.PI, 70, 0.6);
    const b = fire(w, m, 'spore', m.x, m.y - 60, Math.PI, 70, 0.6);
    expect(a.b!.side).toBe(-b.b!.side);
  });

  it('a seed swells, then bursts into a fan of pips ahead of it', () => {
    const { w, m, h } = stage(mobType('plant', 'ranged'), 110);
    const s = fire(w, m, 'seed', m.x, m.y - 6, aimAt(m, h), bulletSpeed(w, m), 1, { reach: 110, n: 4, kid: 0.5 });
    expect(s.b!.T).toBeGreaterThan(0.6);
    run(w, s.b!.T - 0.1);
    expect(w.shots.includes(s)).toBe(true);
    expect(of(w, 'pip')).toHaveLength(0);
    run(w, 0.15);
    expect(w.shots.includes(s)).toBe(false);
    const pips = of(w, 'pip');
    expect(pips).toHaveLength(4);
    // They fan out toward the knight (all heading left here), each its own way, well short of it.
    for (const p of pips) expect(p.vx).toBeLessThan(0);
    expect(new Set(pips.map((p) => Math.round(Math.atan2(p.vy, p.vx) * 100))).size).toBe(4);
    expect(pips[0].x - h.x).toBeGreaterThan(20);
    for (const p of pips) expect(p.dmg).toBeCloseTo(m.atk * 0.5, 5);
  });

  it('a glob is lobbed onto its mark: it hits who stands in its ring as it lands, and nobody on the way', () => {
    const { w, m, h } = stage(mobType('slime', 'chaser'), 80);
    // Over the knight's head, onto a spot 50 px behind it: nothing on the way.
    const over = lob(w, m, 'glob', m.x, m.y - 6, h.x - 50, h.y, 70, 0.9, { ring: 10 });
    expect(airborne(over)).toBe(true);
    const hp = h.hp;
    let peak = 0;
    run(w, 3, () => {
      peak = Math.max(peak, over.b!.z);
      return !w.shots.includes(over);
    });
    expect(peak).toBeGreaterThan(12);
    expect(h.hp).toBe(hp);
    expect(Math.hypot(over.x - (h.x - 50), over.y - h.y)).toBeLessThan(1);
    // Onto the knight: its ring is known from the throw, and that's where it comes down.
    const on = lob(w, m, 'glob', m.x, m.y - 6, h.x + 4, h.y - 3, 70, 0.9, { ring: 10 });
    expect([on.b!.tx, on.b!.ty]).toEqual([h.x + 4, h.y - 3]);
    const t = run(w, 3, () => !w.shots.includes(on));
    expect(t).toBeGreaterThan(0.9);
    expect(h.hp).toBeLessThan(hp);
  });

  it('a mine is tossed, sits ticking, then pops into a ring of pips', () => {
    const { w, m, h } = stage(mobType('pumpkin', 'chaser'), 80);
    const s = lob(w, m, 'mine', m.x, m.y - 6, h.x + 30, h.y, 70, 0, { n: 6, kid: 0.2 });
    run(w, MINE_TOSS + 0.1);
    expect(sitting(s)).toBe(true);
    expect([s.x, s.y]).toEqual([h.x + 30, h.y]);
    // It blinks faster as its fuse runs down, and ends white.
    expect(mineFrame({ ...s.b!, t: MINE_TOSS + MINE_FUSE - 0.05 })).toBe(2);
    const hp = h.hp;
    run(w, MINE_FUSE - 0.2);
    expect(w.shots.includes(s)).toBe(true);
    expect(h.hp).toBe(hp);
    run(w, 0.15);
    expect(w.shots.includes(s)).toBe(false);
    const pips = of(w, 'pip');
    expect(pips).toHaveLength(6);
    const ways = pips.map((p) => Math.atan2(p.vy, p.vx)).sort((a, b) => a - b);
    for (let i = 1; i < ways.length; i++) expect(ways[i] - ways[i - 1]).toBeCloseTo((Math.PI * 2) / 6, 3);
  });

  it('a blade flies straight out past its target, then loops back to where it was thrown from', () => {
    const { w, m } = stage(mobType('humanoid', 'chaser'));
    const s = fire(w, m, 'blade', m.x, m.y - 60, Math.PI, bulletSpeed(w, m), 0.9, { reach: 70, side: 1 });
    const [x0, y0] = [s.x, s.y];
    let far = 0;
    let outSide = 0;
    let backSide = 0;
    const t = run(w, 5, () => {
      far = Math.max(far, x0 - s.x);
      if (s.b!.t <= s.b!.T) outSide = Math.max(outSide, Math.abs(s.y - y0));
      else backSide = Math.max(backSide, Math.abs(s.y - y0));
      return !w.shots.includes(s);
    });
    // Out to just past its target (70 px off) dead straight, and back round a bulge to one side.
    expect(far).toBeGreaterThan(74);
    expect(far).toBeLessThan(92);
    expect(outSide).toBeLessThan(1);
    expect(backSide).toBeGreaterThan(BLADE_BULGE * 0.8);
    expect(Math.hypot(s.x - x0, s.y - y0)).toBeLessThan(6);
    expect(t).toBeCloseTo(s.b!.T * 2, 0);
  });

  it('a blade that missed on the way out can still hit on the way back', () => {
    const { w, m, h } = stage(mobType('humanoid', 'chaser'), 70);
    // The knight stands beside its line, on the side its loop comes back round: missed going, caught coming.
    const s = fire(w, m, 'blade', m.x, m.y - 6, Math.PI, bulletSpeed(w, m), 0.9, { reach: 80, side: 1 });
    h.y -= BLADE_BULGE;
    const hp = h.hp;
    run(w, s.b!.T);
    expect(h.hp).toBe(hp);
    run(w, 4, () => !w.shots.includes(s));
    expect(s.b!.t).toBeLessThan(s.b!.T * 2 - 0.1);
    expect(h.hp).toBeLessThan(hp);
  });

  it('pellets are quick and soon spent', () => {
    const { w, m } = stage(mobType('beast', 'chaser'));
    const s = fire(w, m, 'pellet', m.x, m.y - 60, Math.PI, bulletSpeed(w, m), 0.2);
    const x0 = s.x;
    run(w, 1, () => !w.shots.includes(s));
    expect(x0 - s.x).toBeGreaterThan(35);
    expect(x0 - s.x).toBeLessThan(70);
  });

  it('a wisp turns after a knight, slower than a knight walks', () => {
    const { w, m, h } = stage(mobType('ghost', 'caster'), 80);
    // Let go straight up: nowhere near the knight's way.
    const s = fire(w, m, 'wisp', m.x, m.y - 6, -Math.PI / 2, bulletSpeed(w, m), 0.6);
    expect(Math.hypot(s.vx, s.vy)).toBeLessThan(50);
    const off = () => {
      const want = Math.atan2(h.y - 6 - s.y, h.x - s.x);
      const a = Math.atan2(s.vy, s.vx) - want;
      return Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    };
    const before = off();
    run(w, 0.8);
    expect(s.b!.eye).toBe(1);
    expect(off()).toBeLessThan(before - 0.8);
    const hp = h.hp;
    run(w, 5, () => !w.shots.includes(s));
    expect(h.hp).toBeLessThan(hp);
  });

  it('a wave rolls on through a knight (hit once), and a swing does not stop it', () => {
    const { w, m, h } = stage(mobType('golem', 'tank'), 60);
    const s = fire(w, m, 'wave', m.x - 20, m.y - 6, Math.PI, bulletSpeed(w, m), 0.65);
    expect(cuttable(s)).toBe(false);
    const hp = h.hp;
    run(w, 1.2, () => s.x < h.x - 12);
    expect(w.shots.includes(s)).toBe(true);
    expect(h.hp).toBeLessThan(hp);
    const after = h.hp;
    run(w, 0.2);
    expect(h.hp).toBe(after);
  });

  it('an elite shaman fires a beam: a quick stream of sparks down the line its wind-up held', () => {
    const type = mobType('humanoid', 'caster');
    expect(type.gun!.elite).toBe('beam');
    const { w, m, h } = stage(type, 80);
    m.elite = true;
    m.volley = 1;
    m.atkT = 0;
    run(w, 1, () => m.move === 'shoot');
    expect(m.gunKind).toBe('beam');
    expect(aimHolds(m)).toBe(true);
    // Past half its wind-up the line holds, wherever the knight goes.
    run(w, 1, () => (m.windT ?? 0) <= (m.windDur ?? 0) * 0.5);
    const held = [m.moveX, m.moveY];
    h.y -= 60;
    const fired = new Set<Shot>();
    run(w, 1.6, () => {
      for (const s of of(w, 'spark')) fired.add(s);
      return false;
    });
    expect([m.moveX, m.moveY]).toEqual(held);
    expect(fired.size).toBe(5 + density(w, m));
    // (All down the one line, toward where the knight stood: none bends after it.)
    for (const s of fired) expect(Math.abs(Math.atan2(s.vy, s.vx))).toBeGreaterThan(Math.PI - 0.1);
    // (The plain shaman still curves its slow orbs in.)
    m.elite = false;
    w.shots = [];
    volley(w, m, type.gun!.kind, h.x, h.y);
    expect(foes(w).every((s) => !s.b && s.curve && s.color === HUE.pink)).toBe(true);
  });

  it('an archer shows the line its dart will take, and the dart flies down it', () => {
    const { w, m, h } = stage(mobType('humanoid', 'ranged'), 80);
    m.atkT = 0;
    run(w, 1, () => m.move === 'shoot');
    expect(aimHolds(m)).toBe(true);
    expect(m.windDur).toBeGreaterThanOrEqual(0.5);
    run(w, 1, () => (m.windT ?? 0) <= (m.windDur ?? 0) * 0.5);
    // The knight steps aside once the line has stopped following it: the dart goes where it stood.
    const stood = h.y;
    h.y += 40;
    run(w, 1, () => of(w, 'dart').length > 0);
    const s = of(w, 'dart')[0];
    expect(Math.abs(s.vy)).toBeLessThan(Math.abs(s.vx) * 0.1);
    const hp = h.hp;
    run(w, 1.5);
    expect(h.hp).toBe(hp);
    expect(stood).toBe(h.y - 40);
  });
});

describe('every kind is fair: seen coming, cut or rolled through', () => {
  /** Each kind set on its way to hit the knight standing still, from where its foe would fire it. */
  const SHOTS: Record<BulletForm, (w: World, m: Unit, h: Unit) => void> = {
    dart: (w, m, h) => void fire(w, m, 'dart', m.x, m.y - 6, aimAt(m, h), 75, 0.9),
    spit: (w, m, h) => void fire(w, m, 'spit', m.x, m.y - 6, aimAt(m, h), 75, 0.9),
    spore: (w, m, h) => void fire(w, m, 'spore', m.x, m.y - 6, aimAt(m, h), 75, 0.6, { side: 1 }),
    seed: (w, m, h) => void fire(w, m, 'seed', m.x, m.y - 6, aimAt(m, h), 75, 1, { reach: m.x - h.x, n: 5, kid: 0.5 }),
    pip: (w, m, h) => void fire(w, m, 'pip', h.x + 50, h.y - 6, Math.PI, 75, 0.5),
    glob: (w, m, h) => void lob(w, m, 'glob', m.x, m.y - 6, h.x, h.y, 75, 0.9),
    mine: (w, m, h) => void lob(w, m, 'mine', m.x, m.y - 6, h.x + 14, h.y, 75, 0, { n: 12, kid: 0.2 }),
    blade: (w, m, h) => void fire(w, m, 'blade', m.x, m.y - 6, aimAt(m, h), 75, 0.9, { reach: m.x - h.x, side: 1 }),
    pellet: (w, m, h) => void fire(w, m, 'pellet', h.x + 40, h.y - 6, Math.PI, 75, 0.2),
    wisp: (w, m, h) => void fire(w, m, 'wisp', m.x, m.y - 6, aimAt(m, h) + 0.5, 75, 0.6),
    wave: (w, m, h) => void fire(w, m, 'wave', m.x, m.y - 6, aimAt(m, h), 75, 0.65),
    spark: (w, m, h) => void fire(w, m, 'spark', m.x, m.y - 6, aimAt(m, h), 75, 0.4),
  };

  it('a knight on Auto sees each one coming in time to roll (threatened)', () => {
    for (const form of FORM_NAMES) {
      const { w, m, h } = stage(undefined, 70);
      SHOTS[form](w, m, h);
      const hp = h.hp;
      let seen = -1;
      let t = 0;
      for (; t < 8 && h.hp === hp; t += DT) {
        if (seen < 0 && threatened(w, h)) seen = t;
        w.update(DT);
      }
      expect(h.hp, `${form} lands`).toBeLessThan(hp);
      expect(seen, `${form} is seen`).toBeGreaterThanOrEqual(0);
      // The squad's AI looks every 0.12 s, and a roll is untouchable from its first frame.
      expect(t - seen, `${form} is seen in time`).toBeGreaterThanOrEqual(0.14);
      // ...and not so early that the roll is over before it gets there (rolls last about a quarter of a second).
      expect(t - seen, `${form} isn't cried wolf over`).toBeLessThanOrEqual(0.55);
    }
  });

  it('the way out it gives is a real one: rolling that way, the knight is missed', () => {
    for (const form of FORM_NAMES) {
      const { w, m, h } = stage(undefined, 70);
      SHOTS[form](w, m, h);
      const hp = h.hp;
      let rolled = false;
      for (let t = 0; t < 8; t += DT) {
        const out = threatened(w, h);
        if (out && !rolled) rolled = heroDodge(w, h, out[0], out[1]);
        w.update(DT);
        if (rolled && !foes(w).length) break;
      }
      expect(rolled, form).toBe(true);
      // (A wisp comes round again, as it should: one roll is asked to beat one pass, so it's let off here.)
      if (form !== 'wisp') expect(h.hp, form).toBe(hp);
    }
  });

  it('a roll through one is a PERFECT roll, whatever the kind', () => {
    for (const form of FORM_NAMES) {
      // (A Cleric's plain roll: the Guardian's own, a Shield Bash, knocks shots down instead.)
      const { w, m, h } = stage(undefined, 70, 'cleric');
      SHOTS[form](w, m, h);
      const hp = h.hp;
      let rolled = false;
      for (let t = 0; t < 8 && !w.events.some((e) => e.type === 'perfect'); t += DT) {
        // Rolling toward the foe, into the shot, at the last moment.
        if (!rolled && threatened(w, h)) {
          const lookAhead = foes(w).some((s) => {
            const b = s.b!;
            if (b.form === 'glob') return b.T - b.t < 0.03;
            if (b.form === 'mine') return b.fly + b.T - b.t < 0.02;
            return Math.hypot(s.x - h.x, s.y - (h.y - 6)) < 16;
          });
          if (lookAhead) rolled = heroDodge(w, h, 1, 0);
        }
        w.update(DT);
      }
      expect(rolled, form).toBe(true);
      expect(w.events.filter((e) => e.type === 'perfect').length, form).toBe(1);
      expect(h.hp, form).toBe(hp);
    }
  });

  it('a swing cuts what a blade could reach: everything but a glob in its arc and a wave on the ground', () => {
    for (const form of FORM_NAMES) {
      const { w, m, h } = stage(undefined, 70, 'guardian');
      // Each one right in front of the knight.
      let s: Shot;
      if (form === 'glob') {
        s = lob(w, m, 'glob', h.x + 30, h.y - 6, h.x + 12, h.y, 75, 0.9, { flight: 1 });
        s.b!.t = 0.5;
      } else if (form === 'mine') {
        s = lob(w, m, 'mine', h.x + 30, h.y - 6, h.x + 12, h.y, 75, 0, {});
      } else s = fire(w, m, form, h.x + 12, h.y - 6, Math.PI, 5, 0.5, { reach: 200 });
      const want = form !== 'glob' && form !== 'wave' && form !== 'mine';
      expect(cuttable(s), form).toBe(want);
      startSwing(w, h, 1, 0, 1, false);
      expect(w.shots.includes(s), form).toBe(!want);
      expect(w.events.some((e) => e.type === 'clink'), form).toBe(want);
      if (form === 'mine') {
        // In the air it can't be reached; once it sits, a swing smashes it before it pops (no pips).
        run(w, MINE_TOSS + 0.05);
        expect(cuttable(s)).toBe(true);
        startSwing(w, h, 1, 0, 1, false);
        expect(w.shots.includes(s)).toBe(false);
        run(w, MINE_FUSE + 0.2);
        expect(of(w, 'pip')).toHaveLength(0);
      }
    }
  });

  it('a Blade sends a cut one back as its own plain shot', () => {
    const { w, m, h } = stage(undefined, 70, 'blade');
    fire(w, m, 'blade', h.x + 12, h.y - 6, Math.PI, 5, 0.9, { reach: 200 });
    startSwing(w, h, 1, 0, 1, false);
    const back = w.shots.filter((s) => s.team === 'hero');
    expect(back).toHaveLength(1);
    expect(back[0].b).toBeUndefined();
    expect(back[0].vx).toBeGreaterThan(100);
  });

  it('a knight\'s shot knocks a wisp or a sitting mine down', () => {
    const { w, m, h } = stage(mobType('ghost', 'caster'), 70);
    const wisp = fire(w, m, 'wisp', h.x + 40, h.y - 6, Math.PI, 75, 0.6);
    const arrow = (x: number, y: number): Shot => ({ uid: 880000 + w.shots.length, team: 'hero', x, y, vx: 200, vy: 0, r: 2, dmg: 1, life: 1, kind: 'arrow', color: '#ffffff', from: h.uid });
    const a = arrow(h.x + 10, h.y - 6);
    w.shots.push(a);
    run(w, 0.4, () => !w.shots.includes(wisp));
    expect(w.shots.includes(wisp)).toBe(false);
    expect(w.shots.includes(a)).toBe(false);
    expect(w.events.some((e) => e.type === 'clink')).toBe(true);
    const mine = lob(w, m, 'mine', h.x + 40, h.y - 6, h.x + 40, h.y, 75, 0, {});
    run(w, MINE_TOSS + 0.05);
    w.shots.push(arrow(h.x + 10, h.y - 6));
    run(w, 0.4, () => !w.shots.includes(mine));
    expect(w.shots.includes(mine)).toBe(false);
    expect(of(w, 'pip')).toHaveLength(0);
    // (Not a dart: only what's slow enough to aim at.)
    expect(FORM_NAMES.filter((f) => FORMS[f].shoot)).toEqual(['mine', 'wisp']);
  });
});

describe('every family of monster has bullets of its own', () => {
  /** What a kind fires that isn't the plain orb: its gun's bullets or pattern, what it shakes loose, the clods it kicks up. */
  const own = (t: MobType): string[] => [t.gun?.form, t.gun?.elite, t.quake ? t.quakeForm : undefined, t.kick ? 'pellet' : undefined].filter((x): x is BulletForm => !!x);

  it('across the bestiary: every kind of foe fires something that isn\'t the plain orb, and each body plan has its signature', () => {
    const byPlan = new Map<BodyPlan, Set<string>>();
    for (const id of BIOME_ORDER) {
      for (const floor of [1, 3, 8, 12, 17, 22, 27]) {
        for (const seed of [1, 2, 3, 4]) {
          for (const t of floorMobs(BIOMES[id], floor, seed)) {
            expect(own(t).length, `${t.name} (${t.plan} ${t.behavior})`).toBeGreaterThan(0);
            const set = byPlan.get(t.plan) ?? new Set<string>();
            own(t).forEach((f) => set.add(f));
            byPlan.set(t.plan, set);
          }
        }
      }
    }
    const plans: BodyPlan[] = ['slime', 'beast', 'humanoid', 'flyer', 'plant', 'golem', 'bug', 'pumpkin', 'ghost', 'pig', 'ram', 'chicken'];
    for (const p of plans) expect(byPlan.get(p)?.size ?? 0, p).toBeGreaterThan(0);
    expect([...byPlan.get('slime')!]).toContain('glob');
    expect([...byPlan.get('beast')!]).toContain('pellet');
    expect([...byPlan.get('humanoid')!].sort()).toEqual(['beam', 'blade', 'dart']);
    expect([...byPlan.get('flyer')!]).toEqual(['spit']);
    expect([...byPlan.get('plant')!].sort()).toEqual(['seed', 'spore']);
    expect([...byPlan.get('golem')!]).toEqual(['wave']);
    expect([...byPlan.get('bug')!]).toContain('spore');
    expect([...byPlan.get('pumpkin')!]).toContain('mine');
    expect([...byPlan.get('ghost')!]).toEqual(['wisp']);
    expect([...byPlan.get('chicken')!]).toEqual(['mine']);
    // Eight kinds and more in play, besides the plain orb (which the shamans keep).
    const all = new Set([...byPlan.values()].flatMap((s) => [...s]));
    expect(all.size).toBeGreaterThanOrEqual(10);
  });

  it('deeper biomes show more kinds than the first', () => {
    const kinds = (id: string) => {
      const set = new Set<string>();
      for (const seed of [1, 2, 3, 4, 5, 6]) for (const t of floorMobs(BIOMES[id as keyof typeof BIOMES], 12, seed)) own(t).forEach((f) => set.add(f));
      return set.size;
    };
    expect(kinds('hamlet')).toBeGreaterThanOrEqual(3);
    for (const id of ['swamp', 'graveyard', 'shrine', 'crypt']) expect(kinds(id), id).toBeGreaterThanOrEqual(4);
  });

  it('humanoids throw by who they are: a goblin a knife, a skeleton bones, an orc axes', () => {
    const look = (biome: string, horns: boolean) => gunFor('humanoid', 'chaser', lungeFor(biome, 'humanoid', 'chaser', horns), 1, 12)!;
    expect(look('hamlet', false)).toMatchObject({ form: 'blade', look: 0, kind: 'aimed' });
    expect(look('crypt', false)).toMatchObject({ form: 'blade', look: 1, kind: 'burst' });
    expect(look('tundra', false)).toMatchObject({ form: 'blade', look: 2, kind: 'fan' });
  });

  it('what heavy movers shake loose is their own: globs splash onto marked spots, crescents roll out, clods fly on', () => {
    // A slime's landing: its globs start at the ring's edge and come down outside it.
    const { w, m } = stage(mobType('slime', 'chaser'));
    quakeRing(w, m, m.x, m.y, m.type!.quake!, 13);
    const globs = of(w, 'glob');
    expect(globs).toHaveLength(quakeFor('slime', 'chaser'));
    for (const s of globs) expect(Math.hypot(s.b!.tx - m.x, (s.b!.ty - m.y) / 0.8)).toBeGreaterThan(13 + 10);
    // A golem's slam: crescents.
    const g = stage(mobType('golem', 'tank'));
    quakeRing(g.w, g.m, g.m.x, g.m.y, g.m.type!.quake!, 26);
    expect(of(g.w, 'wave').length).toBeGreaterThanOrEqual(6);
    // A charger's charge: clods on ahead, in a cone.
    const c = stage(mobType('pig', 'charger'));
    kick(c.w, c.m, -1, 0, 0, 70);
    const clods = of(c.w, 'pellet');
    expect(clods).toHaveLength(3);
    for (const s of clods) expect(s.vx).toBeLessThan(-40);
  });

  it('a boss mixes its kind\'s own patterns in: every other ring and fan, never heavier than the plain one', () => {
    for (const plan of ['slime', 'golem', 'beast', 'humanoid', 'ghost', 'pumpkin', 'pig', 'ram'] as BodyPlan[]) {
      for (const move of ['ring', 'fan'] as const) {
        for (const enraged of [false, true]) {
          const { w, m, h } = stage({ ...mobType(plan, plan === 'golem' ? 'tank' : plan === 'ghost' ? 'caster' : 'chaser'), boss: { title: 'T', moves: ['ring'] } }, 80);
          m.boss = true;
          const tag = `${plan} ${move}${enraged ? ' enraged' : ''}`;
          // The first is the plain one's turn.
          expect(bossPattern(w, m, move, h, enraged, 70), tag).toBe(false);
          expect(w.shots).toHaveLength(0);
          expect(bossPattern(w, m, move, h, enraged, 70), tag).toBe(true);
          const fired = new Set<Shot>();
          run(w, 1, () => {
            for (const s of foes(w)) if (s.b?.form !== 'pip' || plan === 'pumpkin') fired.add(s);
            return false;
          });
          const own = [...fired].filter((s) => s.b && !(plan === 'pumpkin' && s.b.form === 'pip'));
          expect(own.length, tag).toBeGreaterThan(0);
          const total = own.reduce((sum, s) => sum + payload(s), 0) / m.atk;
          const plain = move === 'ring' ? (enraged ? 20 : 14) : enraged ? 7 : 5;
          expect(total, tag).toBeLessThanOrEqual(plain);
        }
      }
    }
    // Real bosses carry their kind's bullets for what they shake loose as they land, too.
    for (const id of BIOME_ORDER) {
      const b = floorBoss(BIOMES[id], 5, 3);
      expect(b.quakeForm ?? 'orb', `${id} ${b.plan}`).toBe(quakeFormFor(b.plan, b.behavior) ?? 'orb');
    }
  });
});

// ------------------------------------------------------------------ the balance

/** The guns as they were before the bullets got kinds of their own: every one fired the plain orb. */
function oldGun(plan: BodyPlan, behavior: Behavior, lunge: Lunge | undefined, atkCd: number, range: number): Gun | undefined {
  switch (behavior) {
    case 'ranged':
      if (plan === 'plant') return { kind: 'ring', cd: atkCd * 1.5, min: 0, max: range, wind: 0.6 };
      if (plan === 'flyer') return { kind: 'burst', cd: atkCd * 1.3, min: 0, max: range, wind: 0.5 };
      return { kind: 'aimed', alt: 'fan', every: 3, cd: atkCd, min: 0, max: range, wind: 0.45 };
    case 'caster':
      return { kind: 'curve', cd: atkCd * 0.9, min: 0, max: range, wind: 0.55 };
    case 'chaser':
      if (plan === 'humanoid') return { kind: lunge?.name === 'thrust' ? 'burst' : lunge?.name === 'shoulder' ? 'fan' : 'aimed', cd: 2.4, min: 34, max: 110, wind: 0.45 };
      if (plan === 'bug') return { kind: 'fan', cd: 2.8, min: 30, max: 100, wind: 0.5 };
      return undefined;
    case 'swarm':
      return plan === 'ghost' ? { kind: 'curve', cd: 3.6, min: 30, max: 100, wind: 0.5 } : { kind: 'aimed', cd: 3.6, min: 30, max: 100, wind: 0.45 };
    default:
      return undefined;
  }
}

function oldQuake(plan: BodyPlan, behavior: Behavior): number {
  if (behavior === 'tank' || behavior === 'bomber') return 8;
  return plan === 'slime' || plan === 'pumpkin' ? 6 : 0;
}

/** A floor's foe as it was: the same body, stats and lunge, the old gun, plain orbs shaken loose, no clods. */
function asBefore(t: MobType): MobType {
  const { gun: _g, quake: _q, quakeForm: _f, kick: _k, ...rest } = t;
  const gun = oldGun(t.plan, t.behavior, t.lunge, t.atkCd, t.range);
  const quake = oldQuake(t.plan, t.behavior);
  return { ...rest, ...(gun ? { gun } : {}), ...(quake ? { quake } : {}) };
}

/** A bomber lives about this long before it goes off (its one blast, and what that shakes loose, is spread over it). */
const BOMBER_LIFE = 8;

/** Seconds from one of a kind's lunges to its next. */
const lungeCycle = (L: Lunge) => L.cd + L.wind + L.dur + L.recover;

/**
 * What one foe of this type throws at the squad, in damage a second (the most its bullets could do:
 * every bullet of every volley, its pips for a seed or a mine), on `floor`: its gun's volleys over
 * their cycle, what it shakes loose each time it lands, slams or goes off, and its clods.
 */
function shotRate(t: MobType, floor: number): number {
  const { w, m, h } = stage(t, 80, 'guardian', floor);
  h.invuln = 1e9;
  /** Everything a volley of `kind` fires (a burst goes on for a moment; a seed's or a mine's pips aren't counted twice). */
  const fires = (kind: Volley): number => {
    w.shots = [];
    m.burst = undefined;
    const seen = new Map<number, number>();
    const tally = () => {
      for (const s of foes(w)) if (!seen.has(s.uid) && s.b?.form !== 'pip') seen.set(s.uid, payload(s));
      return false;
    };
    volley(w, m, kind, h.x, h.y);
    tally();
    run(w, 0.7, tally);
    let sum = 0;
    for (const v of seen.values()) sum += v;
    return sum;
  };
  let rate = 0;
  const g = t.gun;
  if (g) {
    const main = fires(g.kind);
    const each = g.alt && g.every ? main * (1 - 1 / g.every) + fires(g.alt) / g.every : main;
    // Archers and spitters fire every attack; a caster every other one (its circle between); the rest when their gun is ready.
    const cycle = t.behavior === 'ranged' ? t.atkCd : t.behavior === 'caster' ? t.atkCd * 2 : g.cd + g.wind;
    rate += each / cycle;
  }
  if (t.quake) {
    w.shots = [];
    quakeRing(w, m, m.x, m.y, t.quake, 13);
    const loose = foes(w).reduce((sum, s) => sum + payload(s), 0);
    rate += loose / (t.behavior === 'bomber' ? BOMBER_LIFE : t.behavior === 'tank' ? t.atkCd : lungeCycle(t.lunge ?? LUNGES.hop));
  }
  if (t.kick && t.lunge) {
    w.shots = [];
    kick(w, m, -1, 0, density(w, m), bulletSpeed(w, m));
    rate += foes(w).reduce((sum, s) => sum + payload(s), 0) / lungeCycle(t.lunge);
  }
  return rate;
}

/**
 * What the same foe deals up close, in damage a second, the same before and after: its bites, its
 * lunge's hit, a caster's circle, a tank's slam, a bomber's blast (ai.ts's numbers).
 */
function meleeRate(t: MobType, floor: number): number {
  const { m } = stage(t, 80, 'guardian', floor);
  const atk = m.atk;
  let rate = 0;
  if (t.lunge) rate += (atk * t.lunge.dmg) / lungeCycle(t.lunge);
  switch (t.behavior) {
    case 'chaser':
    case 'swarm':
      rate += atk / t.atkCd;
      break;
    case 'charger':
      rate += (atk * 0.6) / 1.7;
      break;
    case 'caster':
      rate += (atk * 1.4) / (t.atkCd * 2);
      break;
    case 'tank':
      rate += (atk * 1.15) / t.atkCd;
      break;
    case 'bomber':
      rate += (atk * 1.6) / BOMBER_LIFE;
      break;
    default:
      break;
  }
  return rate;
}

describe('the new bullets don\'t make a floor hit harder', () => {
  const FLOORS = [1, 3, 6, 8, 12, 17, 22, 27];
  const SEEDS = [1, 2, 3];

  interface FloorSum {
    name: string;
    shotsBefore: number;
    shotsAfter: number;
    melee: number;
    /** A foe on it that had no bullets before (a beast, a hog, a ram). */
    newlyArmed: boolean;
  }

  const floors: FloorSum[] = [];
  const perType = new Map<string, { before: number; after: number }>();
  for (const id of BIOME_ORDER) {
    for (const floor of FLOORS) {
      for (const seed of SEEDS) {
        const sum: FloorSum = { name: `${id} floor ${floor} seed ${seed}`, shotsBefore: 0, shotsAfter: 0, melee: 0, newlyArmed: false };
        for (const t of floorMobs(BIOMES[id], floor, seed)) {
          const before = shotRate(asBefore(t), floor);
          const after = shotRate(t, floor);
          sum.shotsBefore += before;
          sum.shotsAfter += after;
          sum.melee += meleeRate(t, floor);
          if (before === 0 && after > 0) sum.newlyArmed = true;
          const key = `${t.plan} ${t.behavior}${t.plan === 'humanoid' && t.behavior === 'chaser' ? ` ${t.lunge?.name}` : ''} d${floor <= 10 ? 0 : floor <= 20 ? 1 : 2}`;
          // (In shares of the foe's own attack, so floors of different strength compare.)
          const { m } = stage(t, 80, 'guardian', floor);
          perType.set(key, { before: before / m.atk, after: after / m.atk });
        }
        floors.push(sum);
      }
    }
  }

  it('a floor\'s whole incoming damage (its foes\' shots and blows together) stays within 15% of before, for the same foes', () => {
    let worst = 1;
    let least = 1;
    for (const f of floors) {
      const ratio = (f.melee + f.shotsAfter) / (f.melee + f.shotsBefore);
      worst = Math.max(worst, ratio);
      least = Math.min(least, ratio);
      expect(ratio, f.name).toBeLessThanOrEqual(1.15);
      expect(ratio, f.name).toBeGreaterThanOrEqual(0.85);
    }
    const before = floors.reduce((s, f) => s + f.melee + f.shotsBefore, 0);
    const after = floors.reduce((s, f) => s + f.melee + f.shotsAfter, 0);
    console.log(`incoming damage, all ${floors.length} floors: x${(after / before).toFixed(3)} of before (a floor's least x${least.toFixed(3)}, most x${worst.toFixed(3)})`);
    expect(after / before).toBeGreaterThan(0.95);
    expect(after / before).toBeLessThan(1.05);
  });

  it('the shots alone, over every floor, stay within 15% of before; and no foe that shot before throws more than 15% more', () => {
    const before = floors.reduce((s, f) => s + f.shotsBefore, 0);
    const after = floors.reduce((s, f) => s + f.shotsAfter, 0);
    console.log(`shot damage a second, all floors: x${(after / before).toFixed(3)} of before`);
    expect(after / before).toBeGreaterThan(0.85);
    expect(after / before).toBeLessThan(1.15);
    for (const [key, r] of perType) {
      if (r.before > 0) expect(r.after / r.before, key).toBeLessThanOrEqual(1.15);
      // The families that had no bullets get only a light signature: under a fifth of an attack a second.
      else expect(r.after, key).toBeLessThanOrEqual(0.2);
    }
    // Floor by floor, the shots alone are within 15% on most; the rest are floors where a family that
    // had no bullets at all (beasts, the farm's hogs and rams) now has its light signature, on floors
    // where shots were a small part of the fight: there, what's new is under a tenth of the floor's whole.
    let within = 0;
    for (const f of floors) {
      const ratio = f.shotsAfter / f.shotsBefore;
      if (ratio <= 1.15) within++;
      else {
        expect(f.newlyArmed, f.name).toBe(true);
        expect((f.shotsAfter - f.shotsBefore) / (f.melee + f.shotsBefore), f.name).toBeLessThan(0.1);
      }
      expect(ratio, f.name).toBeGreaterThan(0.75);
    }
    console.log(`floors whose shots alone are within 15% of before (or under): ${within} of ${floors.length}; the rest have a newly armed beast, hog or ram, under +10% of the floor's whole`);
    expect(within / floors.length).toBeGreaterThan(0.85);
  });

  it('more bullets in a pattern means less each: no bullet of a volley hits as hard as a bite', () => {
    for (const [plan, behavior] of [['humanoid', 'ranged'], ['plant', 'ranged'], ['plant', 'caster'], ['ghost', 'caster'], ['bug', 'chaser'], ['beast', 'chaser'], ['slime', 'chaser'], ['pumpkin', 'chaser'], ['flyer', 'ranged']] as Array<[BodyPlan, Behavior]>) {
      for (const floor of [2, 15, 25]) {
        const t = mobType(plan, behavior);
        const { w, m, h } = stage(t, 80, 'guardian', floor);
        volley(w, m, t.gun!.kind, h.x, h.y);
        for (const s of foes(w)) expect(s.dmg, `${plan} ${behavior} floor ${floor}`).toBeLessThan(m.atk);
      }
    }
  });
});

// ------------------------------------------------------------------ the art

describe('the bullets\' art keeps one rule', () => {
  const pixels = (buf: { w: number; h: number; px: Uint8ClampedArray }) => {
    const out: string[] = [];
    for (let i = 0; i < buf.w * buf.h; i++) {
      if (!buf.px[i * 4 + 3]) continue;
      out.push(`#${[0, 1, 2].map((k) => buf.px[i * 4 + k].toString(16).padStart(2, '0')).join('')}`);
    }
    return out;
  };
  /** A frame as one string, where its pixels are and all. */
  const print = (buf: { w: number; h: number; px: Uint8ClampedArray }) => `${buf.w}x${buf.h}:${Array.from(buf.px).join(',')}`;

  it('every kind has its frames, each with the same ink outline, a white-hot heart and its hue', () => {
    for (const form of FORM_NAMES) {
      const ramp = BULLET_RAMPS[FORMS[form].hue];
      expect(BULLET_FRAMES[form], form).toBeGreaterThanOrEqual(2);
      const frames = new Set<string>();
      for (let f = 0; f < BULLET_FRAMES[form]; f++) {
        const s = BULLET_ART[form](0, f);
        expect(s.buf, `${form} ${f}`).not.toBeNull();
        const px = pixels(s.buf!);
        expect(px.filter((c) => c === BULLET_INK).length, `${form} ${f} ink`).toBeGreaterThanOrEqual(8);
        expect(px.some((c) => c === '#ffffff'), `${form} ${f} heart`).toBe(true);
        // Nothing but its own hue's shades: no stray colors.
        for (const c of px) expect(ramp, `${form} ${f} ${c}`).toContain(c);
        // Small enough to read as a bullet, big enough to see.
        expect(Math.max(s.buf!.w, s.buf!.h), form).toBeLessThanOrEqual(22);
        expect(Math.max(s.buf!.w, s.buf!.h), form).toBeGreaterThanOrEqual(5);
        frames.add(print(s.buf!));
      }
      // It moves: no two frames in a row the same.
      expect(frames.size, form).toBeGreaterThanOrEqual(2);
    }
  });

  it('the ink is on the outside: every lit pixel at a sprite\'s edge is outlined', () => {
    for (const form of ['spore', 'seed', 'mine', 'glob', 'wisp', 'wave', 'spark', 'pip', 'pellet', 'blade'] as BulletForm[]) {
      const buf = BULLET_ART[form](0, 0).buf!;
      const at = (x: number, y: number) => (x < 0 || y < 0 || x >= buf.w || y >= buf.h || !buf.px[(y * buf.w + x) * 4 + 3] ? null : buf.px.slice((y * buf.w + x) * 4, (y * buf.w + x) * 4 + 3).join(','));
      const ink = [0, 1, 2].map((k) => parseInt(BULLET_INK.slice(1 + k * 2, 3 + k * 2), 16)).join(',');
      let bare = 0;
      let lit = 0;
      for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) {
        const c = at(x, y);
        if (!c || c === ink) continue;
        lit++;
        if ([at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((n) => n === null)) bare++;
      }
      // (But for the loose bits drawn to trail off: a blade's smear, a wave's grit, a glob's drip.)
      expect(bare, form).toBeLessThanOrEqual(Math.max(4, lit * 0.12));
    }
  });

  it('hue says what it does: red flies straight, pink bends, orange bursts', () => {
    const hue = (f: BulletForm) => FORMS[f].hue;
    for (const f of ['dart', 'spit', 'pellet', 'pip', 'spark', 'wave'] as BulletForm[]) expect(hue(f), f).toBe('red');
    for (const f of ['spore', 'blade', 'wisp'] as BulletForm[]) expect(hue(f), f).toBe('pink');
    for (const f of ['seed', 'glob', 'mine'] as BulletForm[]) expect(hue(f), f).toBe('orange');
    // The plain orb too: red, pink when it curves; and a bullet's color is its hue's (its pop, its clink).
    const { w, m, h } = stage(mobType('humanoid', 'caster'));
    volley(w, m, 'aimed', h.x, h.y);
    volley(w, m, 'curve', h.x, h.y);
    expect(foes(w).map((s) => s.color)).toEqual([HUE.red, HUE.pink, HUE.pink]);
    for (const f of FORM_NAMES) expect(fire(w, m, f, m.x, m.y, 0, 70, 0.5).color, f).toBe(HUE[hue(f)]);
    expect(orbSprite('red', 0, 0, false).buf).not.toBeNull();
    expect(orbSprite('pink', 3, 1, true).buf!.w).toBeGreaterThan(orbSprite('pink', 3, 1, false).buf!.w - 1);
  });

  it('a glob\'s landing mark fills as it falls and flashes white', () => {
    const a = markSprite(10, 1, false).buf!;
    const b = markSprite(10, 4, false).buf!;
    const hot = markSprite(10, 4, true).buf!;
    expect(pixels(b).length).toBeGreaterThan(pixels(a).length);
    expect(pixels(hot).filter((c) => c === '#ffffff').length).toBeGreaterThan(pixels(b).filter((c) => c === '#ffffff').length + 10);
    // Flattened, as rings on the ground are.
    expect(a.h).toBeLessThan(a.w * 0.7);
  });
});
