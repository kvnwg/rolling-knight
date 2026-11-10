/**
 * The way down: touching a floor's open portal swirls the squad straight into it (no standing in it
 * first). While the portal has the squad nothing reaches it, nothing it's told to do happens and
 * nothing new joins the fight; once it's through, the next floor comes up at once and the squad pops
 * out there.
 */
import { describe, expect, it } from 'vitest';
import { knightId, type ClassId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { addKnight, knightStats } from '../src/core/roster';
import { Game, PORTAL_CUT, PORTAL_REVEAL } from '../src/game';
import { lightBuf, planPulls, pullAt, shrinkBuf, shrinkStep, starBuf } from '../src/render/warpFx';
import { blank, type PixelBuf } from '../src/render/pixel/buf';
import { BIOMES } from '../src/world/biomes';
import { generateFloor } from '../src/world/mapgen';
import { floorBoss, floorMobs } from '../src/world/mobgen';
import { ARRIVE_TIME, WARP_CALM, WARP_TIME, World, type HeroSpec } from '../src/world/world';

const DT = 1 / 60;
const CLASSES: ClassId[] = ['blade', 'ranger', 'arcanist'];

function squad(classes: ClassId[] = CLASSES): HeroSpec[] {
  const s = newGame(1);
  const ids = classes.map((c) => knightId('rare', c));
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => ({ knightId: id, cls: classes[slot], rarity: 'rare', mutation: null, stats: knightStats(s, id), slot, hpShare: 1 }));
}

/** Floor 2 of the hamlet (its way down open from the start, foes about), or floor 5 (a boss floor, shut until its boss falls). */
function floor(boss = false): World {
  const biome = BIOMES.hamlet;
  const f = boss ? 5 : 2;
  const seed = boss ? 7 : 99;
  const map = generateFloor({ floor: f, biome, seed, boss });
  return new World({ map, biome, floor: f, boss, mobTypes: floorMobs(biome, f, seed), bossType: boss ? floorBoss(biome, f, seed) : null, squad: squad(), perks: [], controlled: 0, seed, goldPerKill: 3 });
}

/** The leader steps onto the doorway. */
function touch(w: World): void {
  const l = w.leader()!;
  l.x = w.map.exit.x;
  l.y = w.map.exit.y;
}

const count = (w: World, type: string) => w.events.filter((e) => e.type === type).length;

/** A game on floor 2 with a squad of three, the floor's fade in over. */
function game(reduceMotion = false): Game {
  const g = new Game(true);
  const s = g.state;
  s.roll.tutorial = 'done';
  s.settings.reduceMotion = reduceMotion;
  for (const c of CLASSES) addKnight(s, knightId('rare', c), null);
  s.squad = CLASSES.map((c) => knightId('rare', c));
  s.run.floor = 2;
  g.inDungeon = true;
  g.startFloor(2);
  for (let i = 0; i < 90; i++) g.tick(DT);
  return g;
}

describe('the way down', () => {
  it('takes the squad the moment the leader touches the open portal, and goes down once the swirl is through', () => {
    const w = floor();
    expect(w.portalOpen).toBe(true);
    expect(w.livingMobs().length).toBeGreaterThan(5);
    touch(w);
    w.update(DT);
    // At once: no standing in it.
    expect(w.warp).not.toBeNull();
    expect(count(w, 'warp')).toBe(1);
    expect(w.exited).toBe(false);
    // A big hit freezing the moment doesn't stretch the swirl.
    w.hitStop = 0.3;
    let t = 0;
    while (!w.exited && t < 3) {
      w.update(DT);
      t += DT;
    }
    expect(w.exited).toBe(true);
    expect(count(w, 'exit')).toBe(1);
    expect(t).toBeGreaterThan(WARP_TIME - 3 * DT);
    expect(t).toBeLessThanOrEqual(WARP_TIME + DT);
  });

  it('brings the next floor up within the swirl and a blink of a cut, the squad popping out there', () => {
    const g = game();
    const w = g.world!;
    expect(w.floor).toBe(2);
    touch(w);
    g.tick(DT);
    expect(g.world).toBe(w);
    expect(w.warp).not.toBeNull();
    let t = 0;
    while (g.world === w && t < 3) {
      g.tick(DT);
      t += DT;
    }
    // The swirl, then the cut to black: the next floor is up by then.
    expect(g.world).not.toBe(w);
    expect(g.world!.floor).toBe(3);
    expect(g.state.run.floor).toBe(3);
    expect(t).toBeLessThanOrEqual(WARP_TIME + 1 / PORTAL_CUT + 2 * DT);
    // The squad pops out, out of reach and still meanwhile; the floor comes up fast.
    const next = g.world!;
    expect(next.arrive).not.toBeNull();
    expect(next.warping()).toBe(true);
    expect(g.fade).toBe(1);
    let k = 0;
    while (g.fade > 0 && k < 120) {
      g.tick(DT);
      k++;
    }
    expect(k * DT).toBeLessThanOrEqual(1 / PORTAL_REVEAL + 2 * DT);
    for (let i = 0; i < Math.ceil(ARRIVE_TIME / DT); i++) g.tick(DT);
    expect(next.arrive).toBeNull();
    expect(next.warping()).toBe(false);
    // Down one floor, and only one, for all the leader stood in the doorway the whole way.
    expect(g.world).toBe(next);
    expect(g.state.run.floor).toBe(3);
  });

  it('does nothing at a shut portal (a boss floor before its boss falls); open, it takes the squad', () => {
    const w = floor(true);
    expect(w.portalOpen).toBe(false);
    for (const h of w.heroes) h.hp = h.maxHp = 1e9;
    for (let i = 0; i < 60; i++) {
      touch(w);
      w.update(DT);
    }
    expect(w.warp).toBeNull();
    expect(w.exited).toBe(false);
    expect(count(w, 'warp') + count(w, 'exit')).toBe(0);
    w.killMob(w.floorBoss!);
    w.update(DT);
    expect(w.portalOpen).toBe(true);
    touch(w);
    w.update(DT);
    expect(w.warp).not.toBeNull();
  });

  it('keeps the squad out of reach while it goes: no blow, shot, blast, fire, burn or trap lands, and no perfect roll is had for it', () => {
    const w = floor();
    touch(w);
    w.update(DT);
    expect(w.warp).not.toBeNull();
    const h = w.leader()!;
    const hp = w.heroes.map((x) => x.hp);
    const foe = w.livingMobs()[0];
    // Rolled just before: what passes through now is the portal's doing, not the roll's.
    h.dodge = { until: w.time + 1, perfect: false };
    expect(w.damage(h, 500, foe)).toBe(0);
    expect(w.untouchable(h)).toBe(true);
    w.shots.push({ uid: 9001, team: 'mob', x: h.x, y: h.y - 6, vx: 0, vy: 0, r: 4, dmg: 500, life: 1, kind: 'bullet', color: '#ff4a3a', from: foe.uid });
    w.areas.push({ uid: 9002, team: 'mob', x: h.x, y: h.y, r: 30, delay: 0.02, dur: 0, tick: 1, tickT: 0, dmg: 500, kind: 'blast', from: foe.uid, color: '#ff4a3a', t: 0 });
    w.areas.push({ uid: 9003, team: 'mob', x: h.x, y: h.y, r: 30, delay: 0, dur: 1, tick: 0.05, tickT: 0, dmg: 500, kind: 'fire', from: foe.uid, color: '#ff7a2a', t: 0 });
    for (const x of w.heroes) {
      x.burnT = 2;
      x.burnDps = 500;
    }
    // A saw blade running right under it (a saw is always out).
    w.traps.push({ kind: 'saw', x: h.x, y: h.y, phase: 0, reach: 0, hits: new Map(), armedAt: -1 });
    for (let i = 0; i < 25; i++) w.update(DT);
    expect(w.heroes.map((x) => x.hp)).toEqual(hp);
    expect(w.heroes.some((x) => x.downed)).toBe(false);
    // The shot went straight through (it's still flying).
    expect(w.shots.some((s) => s.uid === 9001)).toBe(true);
    expect(h.dodge.perfect).toBe(false);
    expect(count(w, 'perfect')).toBe(0);
    expect(count(w, 'heroDown') + count(w, 'wipe')).toBe(0);
  });

  it('wakes nothing new while it goes (a sleeping foe right by the squad stays asleep)', () => {
    const put = (w: World) => {
      const h = w.leader()!;
      const m = w.mobs.find((x) => !x.dead && !x.awake && !x.boss)!;
      m.x = h.x + 6;
      m.y = h.y;
      return m;
    };
    // (Without a portal, a foe that close wakes.)
    const awake = floor();
    const m0 = put(awake);
    for (let i = 0; i < 10; i++) awake.update(DT);
    expect(m0.awake).toBe(true);
    const w = floor();
    touch(w);
    w.update(DT);
    expect(w.warp).not.toBeNull();
    const m = put(w);
    for (let i = 0; i < 20; i++) w.update(DT);
    expect(m.awake).toBe(false);
    w.wake(m);
    expect(m.awake).toBe(false);
  });

  it('holds the squad still while it goes: no input, no AI, no roll, no switching, no shop or talk', () => {
    const w = floor();
    touch(w);
    w.update(DT);
    expect(w.warp).not.toBeNull();
    const at = w.heroes.map((h) => [h.x, h.y]);
    for (let i = 0; i < 20; i++) {
      w.input.mx = 1;
      w.input.my = 1;
      w.input.dodge = true;
      w.input.special = true;
      w.input.attack = true;
      w.update(DT);
    }
    expect(w.heroes.map((h) => [h.x, h.y])).toEqual(at);
    expect(w.heroes.some((h) => h.rolling || h.skillRoll || h.swing)).toBe(false);
    expect(w.switchControl(1)).toBe(false);
    expect(w.controlled).toBe(0);
    expect(w.nearWare()).toBeNull();
    expect(w.nearNpc()).toBeNull();
  });

  it('can only go once, however long the leader stands in the doorway', () => {
    const w = floor();
    for (let t = 0; t < WARP_TIME * 4; t += DT) {
      touch(w);
      w.update(DT);
    }
    expect(count(w, 'warp')).toBe(1);
    expect(count(w, 'exit')).toBe(1);
  });

  it('lets a squad playing itself (the dev bot) through only once its floor is cleared', () => {
    const w = floor();
    w.bot = true;
    for (let i = 0; i < 30; i++) {
      touch(w);
      w.update(DT);
    }
    expect(w.cleared).toBe(false);
    expect(w.warp).toBeNull();
    for (const m of w.livingMobs()) w.killMob(m);
    touch(w);
    w.update(DT);
    expect(w.cleared).toBe(true);
    expect(w.warp).not.toBeNull();
  });

  it('with reduce motion is a quick flash and the cut, and the squad is simply there on the next floor', () => {
    const w = floor();
    w.calm = true;
    touch(w);
    w.update(DT);
    expect(w.warp!.dur).toBe(WARP_CALM);
    const g = game(true);
    const first = g.world!;
    touch(first);
    let t = 0;
    while (g.world === first && t < 3) {
      g.tick(DT);
      t += DT;
    }
    expect(g.world!.floor).toBe(3);
    expect(t).toBeLessThanOrEqual(WARP_CALM + 1 / PORTAL_CUT + 3 * DT);
    expect(g.world!.arrive).toBeNull();
    expect(g.world!.warping()).toBe(false);
  });
});

describe('the swirl, drawn', () => {
  /** A knight-ish sprite: a 10 x 16 block with a 1 px dark outline, a soft shadow row under it. */
  function sprite(): PixelBuf {
    const b = blank(32, 32);
    for (let y = 8; y < 24; y++) {
      for (let x = 11; x < 21; x++) {
        const edge = x === 11 || x === 20 || y === 8 || y === 23;
        b.px.set(edge ? [58, 38, 58, 255] : [80 + x * 4, 120, 200 - y * 3, 255], (y * 32 + x) * 4);
      }
    }
    for (let x = 10; x < 22; x++) b.px.set([0, 0, 0, 90], (24 * 32 + x) * 4);
    return b;
  }

  it('shrinks a knight in whole steps by nearest neighbour: every pixel one of the frame’s, its shadow left behind', () => {
    const src = sprite();
    const colors = new Set<string>();
    for (let i = 0; i < src.px.length; i += 4) if (src.px[i + 3] === 255) colors.add(src.px.slice(i, i + 3).join());
    for (const [scale, w, h] of [[1, 10, 16], [0.75, 8, 12], [0.5, 5, 8], [0.25, 3, 4]] as const) {
      const { buf, cx, cy } = shrinkBuf(src, scale);
      expect([buf.w, buf.h]).toEqual([w, h]);
      expect([cx, cy]).toEqual([16, 16]);
      for (let i = 0; i < buf.px.length; i += 4) {
        expect([0, 255]).toContain(buf.px[i + 3]);
        if (buf.px[i + 3]) expect(colors.has(buf.px.slice(i, i + 3).join())).toBe(true);
      }
    }
    // The portal's light eating in from the outline a ring a step: a gold rim; a pale rim with gold
    // inside it; then all of it, white-hot within a gold edge.
    const b = shrinkBuf(src, 1).buf;
    const px = (l: PixelBuf, x: number, y: number) => Array.from(l.px.slice((y * l.w + x) * 4, (y * l.w + x) * 4 + 4));
    const [one, two, all] = [1, 2, 3].map((d) => lightBuf(b, d));
    expect(px(one, 0, 5)).toEqual([0xff, 0xcc, 0x4c, 255]);
    expect(px(one, 1, 5)[3]).toBe(0);
    expect(px(two, 0, 5)).toEqual([0xff, 0xe4, 0x84, 255]);
    expect(px(two, 1, 5)).toEqual([0xff, 0xcc, 0x4c, 255]);
    expect(px(two, 2, 5)[3]).toBe(0);
    expect(px(all, 0, 5)).toEqual([0xff, 0xcc, 0x4c, 255]);
    expect(px(all, 4, 8)).toEqual([0xff, 0xfd, 0xf0, 255]);
    // Never outside the knight.
    for (let i = 3; i < b.px.length; i += 4) if (!b.px[i]) expect(all.px[i]).toBe(0);
  });

  it('pulls every knight into the eye along a whirl, nearest first, all of them in before the swirl ends', () => {
    const plans = planPulls([
      { r: 60, a: Math.PI / 2 + 0.3 },
      { r: 9, a: Math.PI / 2 },
      { r: 30, a: Math.PI / 2 - 0.4 },
    ]);
    // The one in the doorway whirls first; each is gone into the eye before the eye bursts.
    expect(plans[1].whirl).toBeLessThan(plans[2].whirl);
    expect(plans[2].whirl).toBeLessThan(plans[0].whirl);
    for (const p of plans) {
      expect(p.end).toBeLessThanOrEqual(WARP_TIME - 0.1 + 1e-9);
      const s = pullAt(p, 0);
      expect(Math.hypot(s.x, s.y)).toBeCloseTo(p.r0, 6);
      const e = pullAt(p, p.end);
      expect(Math.hypot(e.x, e.y)).toBeLessThan(1e-6);
      expect(e.q).toBe(1);
      // Ever closer to the eye, turning the way the vortex's arms do (counter-clockwise on screen).
      let last = Infinity;
      let turned = 0;
      let prev = Math.atan2(s.y, s.x);
      for (let t = 0; t <= p.end; t += 0.01) {
        const at = pullAt(p, t);
        const r = Math.hypot(at.x, at.y);
        expect(r).toBeLessThanOrEqual(last + 1e-9);
        last = r;
        if (r > 0.5) {
          const a = Math.atan2(at.y, at.x);
          turned += ((a - prev + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
          prev = a;
        }
      }
      expect(turned).toBeLessThan(-Math.PI * 2);
    }
    // The steps it shrinks through as it whirls: whole to a quarter, a spark, a point, gone.
    const steps = [0, 0.2, 0.4, 0.6, 0.8, 0.9, 1].map(shrinkStep);
    expect(steps).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('twinkles in a crisp star: a white heart, arms of the portal’s light, gold tips', () => {
    for (const r of [1, 2, 3, 6, 11]) {
      const s = starBuf(r);
      expect([s.w, s.h]).toEqual([r * 2 + 1, r * 2 + 1]);
      const at = (x: number, y: number) => Array.from(s.px.slice((y * s.w + x) * 4, (y * s.w + x) * 4 + 4));
      expect(at(r, r)).toEqual([0xff, 0xfd, 0xf0, 255]);
      // Symmetric four ways, every pixel solid or empty.
      for (let y = 0; y < s.h; y++) {
        for (let x = 0; x < s.w; x++) {
          expect(at(x, y)).toEqual(at(s.w - 1 - x, y));
          expect(at(x, y)).toEqual(at(y, x));
          expect([0, 255]).toContain(at(x, y)[3]);
        }
      }
      if (r > 1) expect(at(r * 2, r)).toEqual([0xff, 0xcc, 0x4c, 255]);
    }
  });
});
