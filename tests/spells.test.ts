import { describe, expect, it } from 'vitest';
import { knightId, type ClassId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { addKnight, knightStats } from '../src/core/roster';
import type { SkillId } from '../src/core/skillbook';
import { MAGIC_SHEETS, type MagicName } from '../src/render/packs/magic';
import { checkSheet, frameBuf } from '../src/render/pixel/indexed';
import { Spells } from '../src/render/spells';
import { BIOMES } from '../src/world/biomes';
import type { Fx } from '../src/world/entities';
import { generateFloor } from '../src/world/mapgen';
import { floorMobs } from '../src/world/mobgen';
import { ROLL_TIME, rigSkill, startSkillRoll } from '../src/world/skills';
import { World } from '../src/world/world';

const DT = 1 / 30;

describe('the spells\' sheets (src/render/packs/magic.ts)', () => {
  it('are well formed: frames the right size, known colors, animations in range', () => {
    for (const [name, s] of Object.entries(MAGIC_SHEETS)) expect(() => checkSheet(name, s)).not.toThrow();
  });

  it('play only frames with pixels in them, every pixel all or nothing, anchored on the frame', () => {
    for (const [name, s] of Object.entries(MAGIC_SHEETS)) {
      expect(s.anchor.x >= 0 && s.anchor.x < s.w && s.anchor.y >= 0 && s.anchor.y < s.h, `${name} anchor`).toBe(true);
      for (const [anim, a] of Object.entries(s.anims)) {
        for (const f of a.frames) {
          const px = frameBuf(s, f).px;
          let n = 0;
          for (let i = 3; i < px.length; i += 4) {
            expect(px[i] === 0 || px[i] === 255, `${name}.${anim} frame ${f}: half-transparent pixels`).toBe(true);
            if (px[i]) n++;
          }
          expect(n, `${name}.${anim} frame ${f} is empty`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keep the packs\' pixels 1:1: nothing bigger than a pack frame (64 px, the Craftpix strips 72) and an edge', () => {
    for (const [name, s] of Object.entries(MAGIC_SHEETS)) expect(Math.max(s.w, s.h), name).toBeLessThanOrEqual(72 + 2);
  });
});

// ------------------------------------------------------------------ cast in a real fight

function fight(cls: ClassId): World {
  const id = knightId('legendary', cls);
  const s = newGame(1);
  addKnight(s, id, null);
  const biome = BIOMES.hamlet;
  const map = generateFloor({ floor: 2, biome, seed: 99, boss: false });
  const w = new World({
    map, biome, floor: 2, boss: false, mobTypes: floorMobs(biome, 2, 99), bossType: null,
    squad: [{ knightId: id, cls, rarity: 'legendary', mutation: null, stats: knightStats(s, id), slot: 0, hpShare: 1 }],
    perks: [], controlled: 0, seed: 99, goldPerKill: 3,
  });
  const h = w.heroes[0];
  h.maxHp = h.hp = 1e9;
  w.mobs.filter((m) => !m.dead).slice(0, 6).forEach((m, i) => {
    const a = (i / 6) * Math.PI * 2;
    m.x = h.x + Math.cos(a) * 30;
    m.y = h.y + Math.sin(a) * 18;
    m.maxHp = m.hp = 1e9;
    w.wake(m);
  });
  return w;
}

/**
 * Rolls `skill` (rigged) and runs the fight as the renderer watches it: each frame the spells read the
 * world, then take the bursts they want from w.fx (the renderer drains the rest). What they played,
 * and the art the areas were drawn with.
 */
function cast(skill: SkillId, cls: ClassId, seconds = 4): { plays: Map<string, number>; areas: Set<MagicName>; claims: Map<string, number> } {
  const w = fight(cls);
  const h = w.heroes[0];
  const sp = new Spells();
  sp.update(w);
  rigSkill(h, skill);
  expect(startSkillRoll(w, h, { free: true })).toBe(true);
  const plays = new Map<string, number>();
  const areas = new Set<MagicName>();
  const claims = new Map<string, number>();
  const counted = new WeakSet<object>();
  let landed = false;
  const x0 = h.x;
  const y0 = h.y;
  for (let t = 0; t < ROLL_TIME + seconds; t += DT) {
    // (The knight's own attacks would only add bursts no skill makes.)
    h.atkT = 999;
    // (Held where it stood until the skill fires: a Legendary's slam takes a beat, and a knight
    // jostled up to a wall meanwhile would cut Excalibur's line short.)
    if (!landed) {
      h.x = x0;
      h.y = y0;
    }
    w.update(DT);
    // (Once it lands, no other roll: the knight's AI chains the next one on in the same frame.)
    if (h.lastSkill) {
      landed = true;
      h.specialT = 999;
      h.skillRoll = undefined;
      h.skillSlam = undefined;
    }
    sp.update(w);
    for (const a of w.areas) {
      const art = sp.areaArt(a);
      if (art) areas.add(art);
    }
    for (const f of w.fx) {
      const c = sp.claim(f, w);
      if (c) claims.set(`${f.kind}/${f.src ?? ''}`, (claims.get(`${f.kind}/${f.src ?? ''}`) ?? 0) + 1);
    }
    w.fx.length = 0;
    for (const p of sp.playing()) {
      if (counted.has(p)) continue;
      counted.add(p);
      plays.set(`${p.name}.${p.anim}`, (plays.get(`${p.name}.${p.anim}`) ?? 0) + 1);
    }
  }
  expect(landed, `${skill} landed`).toBe(true);
  return { plays, areas, claims };
}

describe('the spells at play', () => {
  it('drops a fireball on each meteor\'s ring and blows it up where it lands', () => {
    const one = cast('meteor', 'arcanist');
    expect(one.areas).toEqual(new Set(['meteor']));
    expect([...one.plays]).toEqual([['explosion.play', 1]]);
    const storm = cast('meteorStorm', 'arcanist');
    expect(storm.areas).toEqual(new Set(['meteor']));
    expect([...storm.plays]).toEqual([['explosion.play', 7]]);
  });

  it('opens the Singularity\'s vortex over its spot, and its burst is no fireball', () => {
    const r = cast('singularity', 'arcanist');
    expect(r.areas).toEqual(new Set(['portal']));
    expect(r.claims.get('blast/')).toBe(1);
    expect(r.plays.size).toBe(0);
  });

  it('bursts rock out of the ground round the Guardian for Titan\'s Wrath and each aftershock', () => {
    const r = cast('titansWrath', 'guardian');
    // The quake and its three aftershocks: five spikes, then three each.
    expect(r.claims.get('blast/slam')).toBe(4);
    expect([...r.plays]).toEqual([['quake.play', 5 + 3 * 3]]);
  });

  it('drives molten spears down round the Lancer where Skyfall lands (no meteor\'s explosion)', () => {
    const r = cast('skyfall', 'lancer');
    expect([...r.plays]).toEqual([['spear.play', 6]]);
  });

  it('strikes every foe of a Miracle with a pillar of light, and Smite\'s spot with a ray of it', () => {
    const miracle = cast('miracle', 'cleric');
    expect(miracle.plays.get('pillar.play')).toBeGreaterThanOrEqual(6);
    expect(miracle.plays.size).toBe(1);
    const smite = cast('smite', 'cleric');
    expect([...smite.plays]).toEqual([['pillar.ray', 1]]);
  });

  it('lights Excalibur\'s line with rays, and a whole pillar on its last and biggest blast', () => {
    const r = cast('excalibur', 'blade');
    expect(r.plays.get('pillar.ray')).toBeGreaterThanOrEqual(2);
    expect(r.plays.get('pillar.play')).toBe(1);
    expect(r.plays.size).toBe(2);
  });

  it('rings the Arcanist with ice for Frost Nova', () => {
    const r = cast('frostNova', 'arcanist');
    expect([...r.plays]).toEqual([['frost.play', 8]]);
  });

  it('leaves every other burst to the renderer: a foe\'s slam or bomb, another skill\'s blast', () => {
    for (const [skill, cls] of [['groundPound', 'guardian'], ['battleCry', 'blade'], ['snare', 'ranger'], ['magicMissiles', 'arcanist']] as const) {
      const r = cast(skill, cls);
      expect(r.plays.size, skill).toBe(0);
      expect(r.claims.size, skill).toBe(0);
    }
    const w = fight('guardian');
    const sp = new Spells();
    sp.update(w);
    const foe: Fx[] = [
      { kind: 'blast', x: w.heroes[0].x, y: w.heroes[0].y, color: '#ffb04a', size: 4, src: 'slam' },
      { kind: 'blast', x: 10, y: 10, color: '#ffb04a', size: 2, src: 'bomb' },
      { kind: 'blast', x: 10, y: 10, color: '#fff7b0', size: 1 },
    ];
    for (const f of foe) expect(sp.claim(f, w)).toBe(null);
  });
});
