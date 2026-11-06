import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { knightId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { addKnight, knightStats } from '../src/core/roster';
import { SHEETS, type SheetName } from '../src/render/pf/assets';
import { CAST_POSES, ICON_HALF, anchorOf, castAnchor, castFrame, castPose, castTop } from '../src/render/pf/castPose';
import { heroPose } from '../src/render/pf/heroAnim';
import { screenView, toScreen, toWorld } from '../src/render/view';
import { DIVE_RISE, STAMPED, diveTurns, slamPlace, stamped, wholePixels, type SlamPoints } from '../src/ui/fx/slamPath';
import { BIOMES } from '../src/world/biomes';
import type { Unit } from '../src/world/entities';
import { generateFloor } from '../src/world/mapgen';
import { floorMobs } from '../src/world/mobgen';
import { SLAM_ARRIVE, SLAM_BEATS, SPOT_HOLD, SPOT_IN, SPOT_OUT, crossed, slamArrive, slamBeat, spotLevel, spotTail } from '../src/world/slam';
import { SLAM_TIME, castSkill, onSkillRoll, rigSkill, startSkillRoll, type SkillRollEvent } from '../src/world/skills';
import { World, type HeroSpec } from '../src/world/world';
import { readPng } from '../tools/knights/lib/png';

const DT = 1 / 60;
const LEGENDARY = SLAM_TIME[4];

// ------------------------------------------------------------------ the beats

describe('a slam, beat by beat (world/slam.ts)', () => {
  it('runs its beats in order, each from 0 to 1, the morph into the spell last', () => {
    const order: string[] = [];
    let last = { beat: '', v: -1 };
    for (let u = 0; u <= 1; u += 0.001) {
      const b = slamBeat(u);
      if (b.beat !== last.beat) order.push(b.beat);
      else expect(b.v).toBeGreaterThanOrEqual(last.v);
      expect(b.v).toBeGreaterThanOrEqual(0);
      expect(b.v).toBeLessThanOrEqual(1);
      last = b;
    }
    expect(order).toEqual(['pop', 'fly', 'hover', 'slam', 'hold', 'morph']);
    expect(slamBeat(-1)).toEqual({ beat: 'pop', v: 0 });
    expect(slamBeat(2)).toEqual({ beat: 'morph', v: 1 });
  });

  it('marks each moment once, whatever the frame rate', () => {
    for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.1]) {
      for (const at of Object.values(SLAM_BEATS)) {
        let n = 0;
        for (let t = dt; t < LEGENDARY + dt; t += dt) if (crossed(t, dt, LEGENDARY, at)) n++;
        expect(n, `${at} at ${dt}`).toBe(1);
      }
    }
  });

  it('lands the icon in its spot a few frames before the cast; Meteor Storm’s, the first meteor, hits as it casts', () => {
    expect(slamArrive('meteorStorm')).toBe(1);
    for (const id of ['skyfall', 'excalibur', 'thousandArrows', 'miracle', 'titansWrath', 'rewind'] as const) expect(slamArrive(id)).toBe(SLAM_ARRIVE);
    expect(SLAM_ARRIVE).toBeGreaterThan(SLAM_BEATS.hold);
    // Seen sitting in its spot for at least a couple of frames at 60 fps, and not long enough to stall.
    expect((1 - SLAM_ARRIVE) * LEGENDARY).toBeGreaterThanOrEqual(2 / 60);
    expect((1 - SLAM_ARRIVE) * LEGENDARY).toBeLessThan(0.1);
  });

  it('darkens the world round the caster: in from the slam’s start, held through the cast and its first moments, then gone', () => {
    const at = (t: number) => spotLevel({ t, dur: LEGENDARY }, null);
    const after = (s: number) => spotLevel(null, s);
    expect(at(0)).toBe(0);
    expect(at(SPOT_IN)).toBe(1);
    expect(at(LEGENDARY)).toBe(1);
    expect(after(0)).toBe(1);
    expect(after(SPOT_HOLD)).toBe(1);
    expect(after(SPOT_HOLD + SPOT_OUT)).toBe(0);
    expect(spotTail()).toBeCloseTo(SPOT_HOLD + SPOT_OUT);
    expect(spotLevel(null, null)).toBe(0);
    // Easing in and out, never jumping.
    let prev = 0;
    for (let t = 0; t <= SPOT_IN; t += 0.01) {
      expect(at(t)).toBeGreaterThanOrEqual(prev);
      expect(at(t) - prev).toBeLessThan(0.15);
      prev = at(t);
    }
    prev = 1;
    for (let s = SPOT_HOLD; s <= SPOT_HOLD + SPOT_OUT; s += 0.01) {
      expect(after(s)).toBeLessThanOrEqual(prev);
      expect(prev - after(s)).toBeLessThan(0.15);
      prev = after(s);
    }
  });

  it('keeps it short with reduce motion: dark from the stamp to the cast, gone straight after', () => {
    const stamp = SLAM_BEATS.slam * LEGENDARY;
    expect(spotLevel({ t: stamp - 0.01, dur: LEGENDARY }, null, true)).toBe(0);
    expect(spotLevel({ t: stamp + SPOT_IN, dur: LEGENDARY }, null, true)).toBe(1);
    expect(spotLevel(null, 0, true)).toBe(1);
    expect(spotLevel(null, SPOT_OUT, true)).toBe(0);
    expect(spotTail(true)).toBeCloseTo(SPOT_OUT);
  });
});

// ------------------------------------------------------------------ the icon's path

const PTS: SlamPoints = {
  from: { x: 1180, y: 610, size: 60 },
  hang: { x: 600, y: 170, size: 240 },
  to: { x: 584, y: 380, size: 30 },
  short: 800,
};

describe('the slam’s icon on the screen (ui/fx/slamPath.ts)', () => {
  it('leaves the reel, is stamped over the knight and lands in its spot at the world’s pixel, in one unbroken motion', () => {
    const at = (u: number) => slamPlace(u, 0, PTS, 4, SLAM_ARRIVE);
    expect(at(0)).toMatchObject({ x: PTS.from.x, y: PTS.from.y, size: PTS.from.size });
    const s = at(SLAM_BEATS.slam);
    expect(s.x).toBe(PTS.hang.x);
    expect(s.y).toBe(PTS.hang.y);
    expect(s.size).toBeCloseTo(PTS.hang.size * STAMPED);
    expect(stamped(SLAM_BEATS.slam)).toBe(true);
    expect(stamped(SLAM_BEATS.slam - 0.001)).toBe(false);
    for (const u of [SLAM_ARRIVE, (SLAM_ARRIVE + 1) / 2, 1]) expect(at(u)).toMatchObject({ x: PTS.to.x, y: PTS.to.y, size: PTS.to.size, arrived: true });
    expect(at(SLAM_ARRIVE - 0.001).arrived).toBe(false);
    // No jumps anywhere along the way (a few px per half a thousandth of the slam at most).
    let p = at(0);
    for (let u = 0.0005; u <= 1; u += 0.0005) {
      const q = at(u);
      expect(Math.abs(q.x - p.x), `x at ${u}`).toBeLessThan(10);
      expect(Math.abs(q.y - p.y), `y at ${u}`).toBeLessThan(10);
      expect(Math.abs(q.size - p.size), `size at ${u}`).toBeLessThan(10);
      p = q;
    }
  });

  it('rises a touch before it dives, then falls faster and faster, shrinking as it goes', () => {
    const span = SLAM_ARRIVE - SLAM_BEATS.hold;
    const rise = slamPlace(SLAM_BEATS.hold + span * DIVE_RISE, 0, PTS, 4, SLAM_ARRIVE);
    expect(rise.y).toBeLessThan(PTS.hang.y);
    let last = Infinity;
    let step = 0;
    let prev = rise;
    for (let k = 1; k <= 20; k++) {
      const u = SLAM_BEATS.hold + span * (DIVE_RISE + ((1 - DIVE_RISE) * k) / 20);
      const q = slamPlace(u - 1e-9, 0, PTS, 4, SLAM_ARRIVE);
      const d = Math.hypot(q.x - PTS.to.x, q.y - PTS.to.y);
      expect(d).toBeLessThanOrEqual(last + 1e-6);
      expect(q.size).toBeLessThanOrEqual(prev.size + 1e-6);
      const moved = Math.hypot(q.x - prev.x, q.y - prev.y);
      if (k > 1) expect(moved).toBeGreaterThanOrEqual(step - 1e-6);
      step = moved;
      last = d;
      prev = q;
      expect(q.diving).toBe(true);
    }
  });

  it('falls all the way into its spot as the meteor, hitting it as the storm casts', () => {
    const at = (u: number) => slamPlace(u, 0, PTS, 4, slamArrive('meteorStorm'));
    expect(at(1)).toMatchObject({ x: PTS.to.x, y: PTS.to.y, size: PTS.to.size, arrived: true });
    expect(at(0.99).arrived).toBe(false);
    // The last frame before it hits (at 60 fps) covers more ground than any before it.
    const f = DT / LEGENDARY;
    const last = Math.hypot(at(1 - f).x - at(1 - 2 * f).x, at(1 - f).y - at(1 - 2 * f).y);
    const earlier = Math.hypot(at(0.8).x - at(0.8 - f).x, at(0.8).y - at(0.8 - f).y);
    expect(last).toBeGreaterThan(earlier);
  });

  it('turns a comet (drawn heading down and to the left) to face its dive, a quarter at a time', () => {
    // The art's heading turned `n` quarters clockwise on the screen (y down).
    const heading = (n: number): [number, number] => {
      let [x, y] = [-1, 1];
      for (let i = 0; i < n; i++) [x, y] = [-y, x];
      return [x, y];
    };
    for (const [dx, dy] of [[-30, 200], [30, 200], [40, -90], [-40, -90], [0, 150]]) {
      const [hx, hy] = heading(diveTurns(600, 170, 600 + dx, 170 + dy));
      if (dx) expect(Math.sign(hx), `${dx},${dy}`).toBe(Math.sign(dx));
      expect(Math.sign(hy), `${dx},${dy}`).toBe(Math.sign(dy));
    }
  });

  it('sizes an icon in whole device pixels a pixel, never less than one', () => {
    expect(wholePixels(100, 10, 1)).toBe(100);
    expect(wholePixels(103, 10, 1)).toBe(100);
    expect(wholePixels(106, 10, 1)).toBe(110);
    // A phone at 3 device pixels to the CSS pixel: 5 a pixel, as the world's are.
    expect(wholePixels((10 * 5) / 3, 10, 3) * 3).toBeCloseTo(50);
    expect(wholePixels(1, 10, 2)).toBe(5);
    for (const [s, dpr] of [[37.3, 1], [91.7, 2], [16.2, 3], [240, 1.5]]) expect(((wholePixels(s, 10, dpr) * dpr) / 10) % 1).toBeCloseTo(0);
  });
});

// ------------------------------------------------------------------ the world on the page

describe('the world on the page (render/view.ts)', () => {
  it('maps world pixels to CSS pixels and back, a sprite’s point on its whole pixel', () => {
    const v = screenView(100.4, 50.25, 6, 2);
    expect(v.k).toBe(3);
    const p = toScreen(v, 110, 60);
    expect(p.x).toBeCloseTo((110 - 100.4) * 3);
    expect(p.y).toBeCloseTo((60 - 50.25) * 3);
    const back = toWorld(v, p.x, p.y);
    expect(back.x).toBeCloseTo(110);
    expect(back.y).toBeCloseTo(60);
    expect(toScreen(v, 110.6, 60.4, true)).toEqual(toScreen(v, 111, 60));
  });
});

// ------------------------------------------------------------------ the caster's power-up

/** Loads a sheet's PNG into it (Node has no Image: the tools' decoder reads the file). */
function loadPixels(name: SheetName): void {
  if (SHEETS[name].ready) return;
  const img = readPng(fileURLToPath(new URL(`../src/assets/pf/${name}.png`, import.meta.url)));
  SHEETS[name].setPixels({ w: img.w, h: img.h, data: img.px });
}

const CAST_SHEETS = Object.keys(CAST_POSES) as SheetName[];

describe('the caster’s power-up (render/pf/castPose.ts)', () => {
  it('plays the victory pose to the slam: the crouch, the spring, the landing as the icon is stamped, then the weapon held high', () => {
    for (const name of CAST_SHEETS) {
      const side = CAST_POSES[name]!.side;
      for (const face of [1, -1] as const) {
        const pose = (u: number, calm = false) => castPose(name, { t: u * LEGENDARY, dur: LEGENDARY, face }, calm);
        const dir = side ? (face > 0 ? 'e' : 'w') : 's';
        expect(pose(0.05)).toMatchObject({ dir, i: 0, tip: null });
        expect(pose(0.3)).toMatchObject({ dir, i: 1 });
        expect(pose(SLAM_BEATS.slam + 0.01)).toMatchObject({ dir, i: 2 });
        expect(pose(0.9)).toMatchObject({ dir, i: 3 });
        for (const u of [0.3, 0.6, 0.9]) expect(pose(u).tip, `${name} ${u}`).not.toBeNull();
        // Up a pixel in the spring, trembling while the icon hangs; none of it with reduce motion.
        expect(pose(0.3).dy).toBe(-1);
        expect(pose(0.3, true)).toMatchObject({ dx: 0, dy: 0 });
        expect(pose(0.45, true)).toMatchObject({ dx: 0, dy: 0 });
        expect(pose(0.9)).toMatchObject({ dx: 0, dy: 0 });
        // Every beat a frame of the sheet's own victory clip.
        const clip = SHEETS[name].clip('victory', dir).map(([k]) => k);
        for (const u of [0.05, 0.3, 0.6, 0.9]) expect(clip).toContain(castFrame(name, pose(u)));
      }
    }
  });

  it('holds each weapon’s point on the weapon itself: the spear’s point, the sword’s, the staff’s head, the fist, the bow', () => {
    for (const name of CAST_SHEETS) {
      loadPixels(name);
      const sheet = SHEETS[name];
      const cell = sheet.meta.cell;
      for (const [dir, tips] of Object.entries(CAST_POSES[name]!.tips)) {
        tips!.forEach((px, i) => {
          if (!px) return;
          const k = sheet.clip('victory', dir as never)[i][0];
          const c = sheet.indices(k)[px[1] * cell + px[0]];
          const mat = c ? sheet.meta.colors[c - 1] : null;
          expect(mat, `${name} ${dir} ${i}: nothing at ${px}`).not.toBeNull();
          expect(mat![1], `${name} ${dir} ${i}: a shadow`).toBe(255);
          expect(mat![2], `${name} ${dir} ${i}: on the outline`).not.toBe('outline');
        });
      }
    }
  });

  it('reaches over the knight with its weapon, and further for what it holds up for the icon (Miracle’s light, Aeon’s clock)', () => {
    for (const name of CAST_SHEETS) {
      const top = castTop(name);
      const hold = castPose(name, { t: 1, dur: 1 }, true);
      expect(top, name).toBeLessThan(hold.tip![1]);
    }
    for (const skill of ['miracle', 'rewind'] as const) {
      const name = skill === 'miracle' ? 'rk_cleric' : 'rk_arcanist';
      const a = anchorOf(skill, name, castPose(name, { t: 1, dur: 1 }, true), 0, 0);
      expect(castTop(name, 1, skill)).toBeLessThanOrEqual(a.y - ICON_HALF);
      expect(castTop(name, 1, skill)).toBeLessThan(castTop(name));
    }
  });

  it('sends the icon where the spell starts: the weapon’s point as it’s held at the cast, or the spot the sim picked', () => {
    const h = { knightId: knightId('legendary', 'lancer'), cls: 'lancer', x: 200.4, y: 300.6 } as Unit;
    expect(castAnchor(h)).toBeNull();
    h.skillSlam = { skill: 'skyfall', t: 0.2, dur: LEGENDARY, free: false, luck: 1, face: 1 };
    const a = castAnchor(h)!;
    const hold = castPose('rk_lancer', { t: LEGENDARY, dur: LEGENDARY, face: 1 });
    expect(a).toEqual(anchorOf('skyfall', 'rk_lancer', hold, h.x, h.y));
    // The spear's point, over the knight's head and to its right hand (the screen's left), on a pixel's middle.
    expect(a.x).toBeLessThan(200);
    expect(a.y).toBeLessThan(300 - 10);
    expect(a.x % 1).toBeCloseTo(0.5);
    h.skillSlam = { skill: 'meteorStorm', t: 1, dur: LEGENDARY, free: false, luck: 1, face: 1, at: { x: 260, y: 310 } };
    expect(castAnchor(h)).toEqual({ x: 260, y: 310 });
  });

  it('is what the knight shows while its skill slams down', () => {
    const w = { time: 1, cleared: false, hub: false, camp: false, mobs: [], heroes: [], banner: 0, nearestEnemy: () => null } as unknown as World;
    const h = {
      uid: 4242, team: 'hero', x: 100, y: 100, vx: 0, vy: 0, r: 4, hp: 10, maxHp: 10, atk: 1, armor: 0, speed: 56, dir: 1, view: 'down', moving: false,
      animT: 0, swingT: 0, swingDur: 0.3, aimX: 1, aimY: 0, hurtT: 0, invuln: 0, dr: 1, drT: 0, stunT: 0, slowT: 0, burnT: 0, burnDps: 0, dead: false,
      flying: false, cls: 'ranger', knightId: 'rare-ranger', rarity: 'rare', slot: 0, atkCd: 0.8, atkT: 0.5, range: 20,
      skillSlam: { skill: 'thousandArrows', t: 0.3 * LEGENDARY, dur: LEGENDARY, free: false, luck: 1, face: -1 },
    } as unknown as Unit;
    const p = heroPose(w, h);
    const want = castPose('rk_ranger', h.skillSlam!);
    expect(p).toMatchObject({ anim: 'victory', dir: 'w', k: castFrame('rk_ranger', want), nudge: [want.dx, want.dy] });
  });
});

// ------------------------------------------------------------------ in the world

function squad(ids: string[]): HeroSpec[] {
  const s = newGame(1);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id.split('-') as [HeroSpec['rarity'], HeroSpec['cls']];
    return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
  });
}

/** A floor with the knights, and foes off to the leader's right, awake, harmless and hard to kill. */
function fight(ids: string[]): { w: World; h: Unit; foes: Unit[] } {
  const biome = BIOMES.hamlet;
  const map = generateFloor({ floor: 2, biome, seed: 99, boss: false });
  const w = new World({ map, biome, floor: 2, boss: false, mobTypes: floorMobs(biome, 2, 99), bossType: null, squad: squad(ids), perks: [], controlled: 0, seed: 99, goldPerKill: 3 });
  const h = w.heroes[0];
  const foes = w.mobs.filter((m) => !m.dead).slice(0, 4);
  foes.forEach((m, i) => {
    m.x = h.x + 40 + i * 6;
    m.y = h.y - 6 + i * 4;
    m.maxHp = m.hp = 1e9;
    m.atk = 0;
    w.wake(m);
  });
  for (const m of w.mobs) if (!foes.includes(m)) m.dead = true;
  return { w, h, foes };
}

/** Rolls `skill` (rigged) and runs the world up to its reveal: the slam just begun. */
function slamOf(w: World, h: Unit, skill: Parameters<typeof rigSkill>[1]): NonNullable<Unit['skillSlam']> {
  rigSkill(h, skill);
  h.specialT = 0;
  expect(startSkillRoll(w, h)).toBe(true);
  // (No roll after this one.)
  h.specialT = 99;
  for (let t = 0; t < 3 && !h.skillSlam; t += DT) {
    h.atkT = 99;
    w.update(DT);
  }
  expect(h.skillSlam?.skill).toBe(skill);
  return h.skillSlam!;
}

describe('a Legendary slamming down, in the world', () => {
  it('holds the knight where it stands, untouchable, facing its foes, and casts exactly as its slam ends', () => {
    const { w, h } = fight([knightId('legendary', 'lancer')]);
    h.dir = -1;
    const got: SkillRollEvent[] = [];
    const times: number[] = [];
    const stop = onSkillRoll((e) => {
      got.push(e);
      times.push(e.world.time);
    });
    try {
      const sl = slamOf(w, h, 'skyfall');
      expect(sl.dur).toBe(LEGENDARY);
      expect(sl.face).toBe(1);
      expect(h.dir).toBe(1);
      expect([h.aimX, h.aimY]).toEqual([1, 0]);
      const x0 = h.x;
      const y0 = h.y;
      const hp = h.hp;
      const t0 = sl.t;
      let lands = 0;
      w.fx.length = 0;
      while (h.skillSlam) {
        // Steering, dodging, a blow: none of it takes while the knight powers up.
        w.input.mx = 1;
        w.input.my = 1;
        w.input.dodge = true;
        w.damage(h, h.maxHp * 0.5, null);
        w.update(DT);
        lands += w.fx.filter((f) => f.kind === 'land' && f.x === h.x).length;
        w.fx.length = 0;
        if (h.skillSlam) {
          expect(h.x).toBe(x0);
          expect(h.y).toBe(y0);
          expect(h.rolling).toBeUndefined();
        }
      }
      expect(h.hp).toBe(hp);
      // Down from its spring as the icon is stamped: a ring of dust round its feet, once.
      expect(lands).toBe(1);
      const land = got.filter((e) => e.phase === 'land');
      expect(land.map((e) => e.skill.id)).toEqual(['skyfall']);
      // It cast the moment its slam ran out (SLAM_TIME after the reveal, to the frame).
      const revealAt = times[got.findIndex((e) => e.phase === 'reveal')];
      const landAt = times[got.findIndex((e) => e.phase === 'land')];
      expect(landAt - revealAt).toBeGreaterThan(LEGENDARY - t0 - DT - 1e-6);
      expect(landAt - revealAt).toBeLessThanOrEqual(LEGENDARY - t0 + 1e-6);
    } finally {
      stop();
    }
  });

  it('drops Meteor Storm’s icon on the thickest crowd as its first meteor: it hits there as the storm casts, the rest after', () => {
    const { w, h, foes } = fight([knightId('legendary', 'arcanist')]);
    const sl = slamOf(w, h, 'meteorStorm');
    while (h.skillSlam && h.skillSlam.t < SLAM_BEATS.hold * sl.dur - 1e-9) w.update(DT);
    w.update(DT);
    const at = h.skillSlam?.at;
    expect(at).toBeDefined();
    expect(foes.some((m) => Math.hypot(m.x - at!.x, m.y - at!.y) < 1)).toBe(true);
    // The storm's meteors as it casts (the first goes off within the frame).
    let meteors: Array<{ x: number; y: number; delay: number }> = [];
    const stop = onSkillRoll((e) => {
      if (e.phase === 'land') meteors = w.areas.filter((a) => a.kind === 'meteor').map((a) => ({ x: a.x, y: a.y, delay: a.delay }));
    });
    try {
      while (h.skillSlam) w.update(DT);
    } finally {
      stop();
    }
    expect(meteors.length).toBe(7);
    const first = meteors.filter((a) => a.x === at!.x && a.y === at!.y);
    expect(first.length).toBe(1);
    expect(first[0].delay).toBeLessThanOrEqual(0.02);
    for (const a of meteors) if (a !== first[0]) expect(a.delay).toBeGreaterThan(0.3);
  });

  it('marks a slammed cast’s bursts as the slam’s (the renderer flares the weapon, not the knight); a plain cast keeps its own', () => {
    for (const slammed of [true, false]) {
      const { w, h } = fight([knightId('legendary', 'blade')]);
      w.fx.length = 0;
      castSkill(w, h, 'excalibur', undefined, slammed);
      const bursts = w.fx.filter((f) => f.kind === 'portal' || f.kind === 'levelup');
      expect(bursts.length).toBe(2);
      for (const f of bursts) expect(f.src).toBe(slammed ? 'slam' : undefined);
    }
  });

  it('doesn’t call out a Rewind the HUD has stamped, and draws the world’s dice all the same', () => {
    const run = (say: boolean) => {
      const { w } = fight([knightId('mythic', 'arcanist')]);
      for (let t = 0; t < 1; t += DT) w.update(DT);
      expect(w.startRewind(say)).toBe(true);
      return { texts: w.texts.filter((t) => t.text === 'REWIND!').length, rng: w.rng.state };
    };
    const said = run(true);
    const quiet = run(false);
    expect(said.texts).toBe(1);
    expect(quiet.texts).toBe(0);
    expect(quiet.rng).toBe(said.rng);
  });
});
