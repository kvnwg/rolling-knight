import { afterEach, describe, expect, it } from 'vitest';
import { CLASSES, CLASS_IDS, KNIGHTS, SIGNATURES, knightId, type ClassId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { Rng } from '../src/core/rng';
import { addKnight, knightStats } from '../src/core/roster';
import {
  CLASS_SKILLS,
  LUCK_CAP,
  SKILLS,
  SKILL_IDS,
  SKILL_TIERS,
  rollSkill,
  signatureSkill,
  skillOdds,
  skillsFor,
  tierStep,
  type SkillId,
} from '../src/core/skillbook';
import { BIOMES } from '../src/world/biomes';
import type { Unit } from '../src/world/entities';
import { generateFloor } from '../src/world/mapgen';
import { floorMobs } from '../src/world/mobgen';
import { CAST_TIME, ROLL_TIME, SLAM_TIME, heroSpecial, onSkillRoll, rigSkill, rollLuck, slams, startSkillRoll, type SkillRollEvent } from '../src/world/skills';
import { World, type HeroSpec } from '../src/world/world';

const DT = 1 / 30;

function squad(ids: string[]): HeroSpec[] {
  const s = newGame(1);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id.split('-') as [HeroSpec['rarity'], HeroSpec['cls']];
    return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
  });
}

function world(ids: string[], perks: string[] = []): World {
  const biome = BIOMES.hamlet;
  const map = generateFloor({ floor: 2, biome, seed: 99, boss: false });
  return new World({ map, biome, floor: 2, boss: false, mobTypes: floorMobs(biome, 2, 99), bossType: null, squad: squad(ids), perks, controlled: 0, seed: 99, goldPerKill: 3 });
}

/** Brings `n` of the floor's mobs right up to the squad's leader, awake. */
function fightAt(w: World, n: number, gap = 26): Unit[] {
  const h = w.heroes[0];
  const mobs = w.mobs.filter((m) => !m.dead).slice(0, n);
  mobs.forEach((m, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    m.x = h.x + Math.cos(a) * gap;
    m.y = h.y + Math.sin(a) * gap * 0.6;
    w.wake(m);
  });
  return mobs;
}

function run(w: World, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) w.update(DT);
}

const stops: Array<() => void> = [];
function listen(): SkillRollEvent[] {
  const got: SkillRollEvent[] = [];
  stops.push(onSkillRoll((e) => got.push(e)));
  return got;
}
afterEach(() => {
  while (stops.length) stops.pop()!();
});

// ------------------------------------------------------------------ the book

describe('the skill book', () => {
  it('gives every class six skills from two commons up to a legendary, the old special as the rare, weights adding to 100', () => {
    for (const cls of CLASS_IDS) {
      const list = CLASS_SKILLS[cls].map((id) => SKILLS[id]);
      expect(list.map((s) => s.tier)).toEqual(['common', 'common', 'uncommon', 'rare', 'epic', 'legendary']);
      expect(list.reduce((a, s) => a + s.weight, 0)).toBe(100);
      for (let i = 1; i < list.length; i++) expect(list[i].weight).toBeLessThan(list[i - 1].weight);
      const classic = list.filter((s) => s.classic);
      expect(classic.length).toBe(1);
      expect(classic[0].tier).toBe('rare');
      expect(classic[0].name).toBe(CLASSES[cls].special.name);
      for (const s of list) {
        expect(s.cls).toBe(cls);
        expect(s.name.length).toBeGreaterThan(2);
        expect(s.text.length).toBeGreaterThan(10);
        expect(s.text).not.toMatch(/undefined|NaN/);
        expect(s.icon).toBeTruthy();
      }
    }
    // Every skill is on exactly one list (or is a signature's).
    const listed = new Set(CLASS_IDS.flatMap((c) => CLASS_SKILLS[c]));
    for (const id of SKILL_IDS) expect(listed.has(id) || SKILLS[id].cls === null).toBe(true);
  });

  it('rolls exactly the weights at luck 1, and over 20,000 rolls', () => {
    const odds = skillOdds('rare-blade', 1);
    odds.forEach((o) => expect(o.chance).toBeCloseTo(o.skill.weight / 100, 10));
    const rng = new Rng(7);
    const n = 20_000;
    const count = new Map<SkillId, number>();
    for (let i = 0; i < n; i++) {
      const s = rollSkill('rare-blade', 1, rng);
      count.set(s.id, (count.get(s.id) ?? 0) + 1);
    }
    for (const o of odds) {
      const got = (count.get(o.skill.id) ?? 0) / n;
      expect(Math.abs(got - o.chance)).toBeLessThan(Math.max(0.006, o.chance * 0.12));
    }
  });

  it('tilts toward the rarer tiers with luck, gently, and stops counting luck at the cap', () => {
    const at = (luck: number) => skillOdds('epic-ranger', luck);
    let prev = at(1);
    for (const luck of [1.5, 3, 10, 50, 300, LUCK_CAP]) {
      const now = at(luck);
      expect(now.reduce((a, o) => a + o.chance, 0)).toBeCloseTo(1, 10);
      now.forEach((o, i) => {
        // Commons only lose share; the rarest tiers only gain it.
        if (o.skill.tier === 'common') expect(o.chance).toBeLessThan(prev[i].chance);
        if (tierStep(o.skill.tier) >= 3) expect(o.chance).toBeGreaterThan(prev[i].chance);
      });
      prev = now;
    }
    const legendary = (luck: number) => at(luck).find((o) => o.skill.tier === 'legendary')!.chance;
    // Luck 10: a legendary is about twice as likely (2.5x its weight, less the others' growth); never wild.
    expect(legendary(10) / legendary(1)).toBeGreaterThan(1.6);
    expect(legendary(10) / legendary(1)).toBeLessThan(2.6);
    expect(legendary(100)).toBeLessThan(0.15);
    // Commons are still the most likely single outcome at luck 10.
    const ten = at(10);
    expect(ten[0].chance).toBeGreaterThan(Math.max(...ten.slice(2).map((o) => o.chance)));
    // Past the cap, luck counts as the cap (and nonsense luck as 1).
    expect(at(1e9).map((o) => o.chance)).toEqual(at(LUCK_CAP).map((o) => o.chance));
    expect(at(Number.NaN).map((o) => o.chance)).toEqual(at(1).map((o) => o.chance));
    expect(at(0.2).map((o) => o.chance)).toEqual(at(1).map((o) => o.chance));
    // And it shows in the rolls: luck 300 lands far more epics and legendaries than luck 1.
    const rare = (luck: number) => {
      const rng = new Rng(3);
      let k = 0;
      for (let i = 0; i < 6000; i++) if (tierStep(rollSkill('epic-ranger', luck, rng).tier) >= 3) k++;
      return k / 6000;
    };
    expect(rare(300)).toBeGreaterThan(rare(1) * 2);
  });
});

describe('signatures', () => {
  it('join only their own knight’s list, as the jackpot', () => {
    for (const k of KNIGHTS) {
      const list = skillsFor(k.id);
      const sig = SIGNATURES[k.id];
      if (sig) {
        expect(list.length).toBe(7);
        expect(list[6].id).toBe(sig.id);
        expect(list[6].tier).toBe('jackpot');
        expect(signatureSkill(k.id)?.id).toBe(sig.id);
      } else {
        expect(list.length).toBe(6);
        expect(list.some((s) => s.tier === 'jackpot' || s.cls === null)).toBe(false);
        expect(signatureSkill(k.id)).toBeNull();
      }
      expect(list.slice(0, 6).every((s) => s.cls === k.cls)).toBe(true);
    }
    expect(skillsFor('mythic-arcanist').map((s) => s.id)).toContain('rewind');
    expect(skillsFor('legendary-arcanist').map((s) => s.id)).not.toContain('rewind');
  });

  it('come up only for their knight, about as often as the odds say', () => {
    const rng = new Rng(11);
    let aeon = 0;
    for (let i = 0; i < 10_000; i++) {
      expect(rollSkill('legendary-arcanist', 50, rng).id).not.toBe('rewind');
      if (rollSkill('mythic-arcanist', 1, rng).id === 'rewind') aeon++;
    }
    const want = skillOdds('mythic-arcanist', 1).find((o) => o.skill.id === 'rewind')!.chance;
    expect(want).toBeCloseTo(2 / 102, 10);
    expect(Math.abs(aeon / 10_000 - want)).toBeLessThan(0.006);
  });
});

// ------------------------------------------------------------------ the roll

describe('a skill roll', () => {
  it('spins while the knight keeps moving, fires exactly that skill, and rolls the next straight away', () => {
    const w = world([knightId('rare', 'blade')]);
    const h = w.heroes[0];
    fightAt(w, 3);
    h.specialT = 0;
    h.invuln = 99;
    const got = listen();
    w.input.special = true;
    w.input.mx = 1;
    const x0 = h.x;
    w.update(DT);
    expect(h.skillRoll).toBeDefined();
    expect(got.filter((e) => e.phase === 'start').length).toBe(1);
    const decided = h.skillRoll!.skill;
    // Pressing again mid-spin does nothing; the knight walks on.
    for (let t = DT; t < ROLL_TIME - DT * 2; t += DT) {
      w.input.special = true;
      w.input.mx = 1;
      w.update(DT);
    }
    expect(h.skillRoll).toBeDefined();
    expect(got.filter((e) => e.phase === 'start').length).toBe(1);
    expect(h.x).toBeGreaterThan(x0 + 10);
    expect(h.lastSkill).toBeUndefined();
    expect(h.specialT).toBeLessThanOrEqual(0);
    // It stops on its skill: a Legendary slams down a moment later and only then fires; anything less fires now.
    run(w, 0.2);
    expect(got.filter((e) => e.phase === 'reveal').length).toBe(1);
    if (slams(SKILLS[decided].tier)) {
      expect(h.skillSlam?.skill).toBe(decided);
      expect(h.skillSlam!.dur).toBe(SLAM_TIME[tierStep(SKILLS[decided].tier)]);
      expect(got.filter((e) => e.phase === 'land').length).toBe(0);
      expect(heroSpecial(w, h, false)).toBe(false);
    } else {
      expect(h.skillSlam).toBeUndefined();
      expect(got.filter((e) => e.phase === 'land').length).toBe(1);
    }
    run(w, SLAM_TIME[SLAM_TIME.length - 1]);
    expect(h.skillSlam).toBeUndefined();
    const lands = got.filter((e) => e.phase === 'land');
    expect(lands.length).toBe(1);
    expect(lands[0].skill.id).toBe(decided);
    expect(h.lastSkill).toMatchObject({ skill: decided, n: 1, free: false });
    // No cooldown: in the fight the next roll is already spinning (roll, fire, roll, fire).
    expect(h.specialT).toBe(0);
    expect(h.skillRoll).toBeDefined();
    expect(got.filter((e) => e.phase === 'start').length).toBe(2);
    run(w, CAST_TIME * 2 + 0.3);
    expect(got.filter((e) => e.phase === 'land').length).toBeGreaterThanOrEqual(3);
  });

  it('leaves no cooldown: one roll at a time, the next as soon as it lands; stunned, none', () => {
    const w = world([knightId('rare', 'ranger')]);
    const h = w.heroes[0];
    expect(heroSpecial(w, h, false)).toBe(true);
    // One at a time: no second roll while one spins.
    expect(heroSpecial(w, h, false)).toBe(false);
    run(w, CAST_TIME + 0.1);
    expect(h.lastSkill?.n).toBe(1);
    expect(h.specialT).toBe(0);
    // Straight away again (out of a fight it waits for the button; here, the call).
    expect(heroSpecial(w, h, false)).toBe(true);
    run(w, CAST_TIME + 0.1);
    expect(h.lastSkill?.n).toBe(2);
    // A free roll (Tag Team) works the same.
    expect(heroSpecial(w, h, true)).toBe(true);
    run(w, CAST_TIME + 0.1);
    expect(h.lastSkill?.free).toBe(true);
    // Stunned: no roll (unless free).
    h.stunT = 1;
    expect(heroSpecial(w, h, false)).toBe(false);
    h.stunT = 0;
    expect(heroSpecial(w, h, false)).toBe(true);
  });

  it('rolls at the world’s luck', () => {
    const w = world([knightId('rare', 'cleric')]);
    expect(rollLuck(w)).toBe(1);
    Object.assign(w, { luck: 40 });
    expect(rollLuck(w)).toBe(40);
    const h = w.heroes[0];
    h.specialT = 0;
    heroSpecial(w, h, false);
    expect(h.skillRoll?.luck).toBe(40);
  });

  it('is lost if the knight falls mid-spin', () => {
    const w = world([knightId('rare', 'guardian'), knightId('rare', 'cleric')]);
    const h = w.heroes[0];
    h.specialT = 0;
    const got = listen();
    heroSpecial(w, h, false);
    w.update(DT);
    w.damage(h, h.maxHp * 10, null);
    expect(h.downed).toBe(true);
    run(w, 1);
    expect(h.skillRoll).toBeUndefined();
    expect(got.filter((e) => e.phase === 'land' && e.hero === h).length).toBe(0);
  });

  /** A knight of the skill's class (or the signature's owner), with two friends, 1 s into a quiet floor. */
  function stage(id: SkillId) {
    const cls = SKILLS[id].cls;
    const kid = cls ? knightId('rare', cls) : Object.keys(SIGNATURES).find((k) => SIGNATURES[k].id === id)!;
    const w = world([kid, knightId('rare', 'guardian' satisfies ClassId), knightId('rare', 'ranger')]);
    run(w, 1); // (Rewind needs a past to go back to.)
    const mobs = fightAt(w, 4);
    // Only the skill acts: no auto attacks or rolls from the squad, foes that can't hurt anyone.
    for (const o of w.heroes) {
      o.hp = o.maxHp * 0.5;
      o.atkT = 99;
      o.specialT = 99;
    }
    for (const m of w.mobs) m.atk = 0;
    const h = w.heroes[0];
    h.specialT = 0;
    return { w, h, mobs };
  }

  it('fires every skill in the book without a hitch, each doing what it does', () => {
    for (const id of SKILL_IDS) {
      const { w, h, mobs } = stage(id);
      const mobHp = mobs.reduce((a, m) => a + m.hp, 0);
      const heroHp = w.heroes.reduce((a, o) => a + o.hp, 0);
      const got = listen();
      rigSkill(h, id);
      expect(startSkillRoll(w, h), id).toBe(true);
      for (let t = 0; t < CAST_TIME + DT; t += DT) w.update(DT);
      expect(got.filter((e) => e.phase === 'land').map((e) => e.skill.id), id).toEqual([id]);
      expect(h.lastSkill?.skill).toBe(id);
      // The shout over the knight; your own Legendary's name is stamped on the screen as it slams down
      // instead (the HUD). (Rewind calls its own out.)
      if (id === 'rewind') expect(w.rewind !== null || w.texts.some((t) => t.text === 'TIME STOP!')).toBe(true);
      else expect(w.texts.some((t) => t.text === `${SKILLS[id].name.toUpperCase()}!`), id).toBe(!slams(SKILLS[id].tier));
      // Let every beat play out, then look for the skill's mark: only the skill could have left it.
      let marked = false;
      for (let t = 0; t < 3.5; t += DT) {
        w.update(DT);
        marked ||=
          mobs.reduce((a, m) => a + Math.max(0, m.hp), 0) < mobHp - 1 ||
          w.heroes.reduce((a, o) => a + o.hp, 0) > heroHp + 1 ||
          !!h.skillBuff ||
          h.drT > 0.5 ||
          w.heroes.some((o) => o.invuln > 0.5) ||
          w.rewind !== null;
      }
      expect(marked, id).toBe(true);
      // Its beats have all played (a later roll, chained on with no cooldown, may have queued its own).
      if ((h.lastSkill?.n ?? 0) === 1) expect(h.skillQueue, id).toBeUndefined();
    }
  });

  it('applies its numbers: stuns, slows, taunts, shields, boosts and heals', () => {
    const fire = (id: SkillId) => {
      const s = stage(id);
      rigSkill(s.h, id);
      startSkillRoll(s.w, s.h);
      for (let t = 0; t < CAST_TIME + DT && !s.h.lastSkill; t += DT) s.w.update(DT);
      s.w.update(DT);
      return s;
    };
    {
      const { mobs } = fire('groundPound');
      expect(mobs.filter((m) => !m.dead && m.stunT > 1).length).toBeGreaterThan(0);
    }
    {
      const { mobs } = fire('frostNova');
      expect(mobs.filter((m) => !m.dead && m.slowT > 2).length).toBeGreaterThan(0);
    }
    {
      const { h, mobs } = fire('rallyingTaunt');
      expect(mobs.filter((m) => !m.dead && m.tauntBy === h.uid && (m.tauntT ?? 0) > 3).length).toBeGreaterThan(0);
      expect(h.dr).toBeCloseTo(SKILLS.rallyingTaunt.n.dr);
    }
    {
      const { h } = fire('ironSkin');
      expect(h.dr).toBeCloseTo(SKILLS.ironSkin.n.dr);
      expect(h.drT).toBeGreaterThan(4);
      expect(h.hp).toBeCloseTo(h.maxHp * (0.5 + SKILLS.ironSkin.n.heal), 0);
    }
    {
      const { h } = fire('battleCry');
      expect(h.skillBuff?.atkSpd).toBe(SKILLS.battleCry.n.atkSpd);
      expect(h.skillBuff?.moveSpd).toBe(SKILLS.battleCry.n.moveSpd);
    }
    {
      const { w } = fire('mend');
      const healed = w.heroes.filter((o) => o.hp > o.maxHp * 0.7);
      expect(healed.length).toBe(1);
    }
    {
      const { w } = fire('aegis');
      expect(w.heroes.every((o) => o.drT > 5 && Math.abs(o.dr - SKILLS.aegis.n.dr) < 1e-9)).toBe(true);
    }
    {
      // Guardian Angel raises the fallen at half HP.
      const s = stage('guardianAngel');
      s.w.damage(s.w.heroes[1], 1e9, null);
      expect(s.w.heroes[1].downed).toBe(true);
      rigSkill(s.h, 'guardianAngel');
      startSkillRoll(s.w, s.h);
      for (let t = 0; t < CAST_TIME + DT && !s.h.lastSkill; t += DT) s.w.update(DT);
      s.w.update(DT);
      expect(s.w.heroes[1].downed).toBe(false);
      expect(s.w.heroes[1].hp / s.w.heroes[1].maxHp).toBeCloseTo(SKILLS.guardianAngel.n.revive, 1);
    }
  });

  it('Rewind (rigged, Aeon’s jackpot) takes the squad back: HP and fallen knights return, damage dealt stays', () => {
    const w = world([knightId('mythic', 'arcanist'), knightId('rare', 'guardian')]);
    const [aeon, tank] = w.heroes;
    run(w, 4.5);
    const startHp = tank.hp;
    const mob = w.mobs.find((m) => !m.dead)!;
    w.damage(tank, tank.maxHp * 10, null);
    expect(tank.downed).toBe(true);
    w.damage(mob, 5, aeon);
    const mobHp = mob.hp;
    aeon.specialT = 0;
    rigSkill(aeon, 'rewind');
    w.input.special = true;
    run(w, CAST_TIME + 0.1);
    expect(w.rewind).not.toBeNull();
    run(w, 1);
    expect(w.rewind).toBeNull();
    expect(tank.downed).toBe(false);
    expect(tank.hp).toBeGreaterThan(startHp * 0.5);
    expect(mob.hp).toBeLessThanOrEqual(mobHp);
  });
});

describe('allies', () => {
  it('roll on their own in a fight, the knight you control too, and only when one is on', () => {
    const w = world([knightId('rare', 'blade'), knightId('rare', 'guardian'), knightId('rare', 'ranger')]);
    const [me, tank, archer] = w.heroes;
    for (const h of w.heroes) h.specialT = 0;
    // No fight (every foe asleep far off, at the exit): nobody rolls.
    for (const m of w.mobs) {
      m.awake = false;
      m.x = w.map.exit.x;
      m.y = w.map.exit.y;
    }
    run(w, 2);
    expect(w.heroes.some((h) => h.lastSkill || h.skillRoll)).toBe(false);
    // A fight right on top of the squad.
    fightAt(w, 4, 30);
    const got = listen();
    run(w, 12);
    expect(tank.lastSkill?.n ?? 0).toBeGreaterThanOrEqual(1);
    expect(archer.lastSkill?.n ?? 0).toBeGreaterThanOrEqual(1);
    // Your knight's special rolls and fires with no button pressed.
    expect(me.lastSkill?.n ?? 0).toBeGreaterThanOrEqual(1);
    expect(got.filter((e) => e.phase === 'land' && e.hero === me).length).toBeGreaterThanOrEqual(1);
  });

  it('includes your knight on Auto, and Tag Team makes the knight switched to hit harder for a while', () => {
    const w = world([knightId('rare', 'arcanist'), knightId('rare', 'cleric')], ['tagTeam']);
    const [mage, cleric] = w.heroes;
    w.auto = true;
    mage.specialT = 0;
    fightAt(w, 4, 50);
    run(w, 6);
    expect(mage.lastSkill?.n ?? 0).toBeGreaterThanOrEqual(1);
    w.auto = false;
    expect(w.switchControl(1)).toBe(true);
    // No free spell on switching (switching has no cooldown): a few seconds of harder hits instead.
    expect(cleric.tagBoostT).toBeGreaterThan(3.9);
    run(w, 4.1);
    expect(cleric.tagBoostT ?? 0).toBeLessThanOrEqual(0);
    // At most once every 10 s.
    expect(w.switchControl(0)).toBe(true);
    expect(mage.tagBoostT ?? 0).toBeLessThanOrEqual(0);
  });

  it('keep rolling through a fight, every knight: roll, fire, roll, fire', () => {
    const w = world([knightId('rare', 'guardian'), knightId('rare', 'cleric')]);
    fightAt(w, 2, 80);
    for (const h of w.heroes) h.invuln = 99;
    run(w, CAST_TIME * 3 + 0.5);
    for (const h of w.heroes) expect(h.lastSkill?.n ?? 0, h.knightId).toBeGreaterThanOrEqual(2);
  });
});

it('every tier in the book is a real tier', () => {
  for (const id of SKILL_IDS) expect(SKILL_TIERS).toContain(SKILLS[id].tier);
});
