import { describe, expect, it } from 'vitest';
import { BAL } from '../src/core/balance';
import { CHANCE, chanceFx, expectedHitMult, rollHit, rollKill, skillRollLuck, tripChance } from '../src/core/chance';
import { CLASSES, knightId } from '../src/core/knights';
import { currentLuck, luckyEvery, luckyMult } from '../src/core/luck';
import { newGame } from '../src/core/newGame';
import { Rng } from '../src/core/rng';
import { drySpell, reelCount, spinCycle } from '../src/core/roller';
import { addKnight, knightStats } from '../src/core/roster';
import type { GameState } from '../src/core/state';
import {
  HEX_BY_KEY, ROOT_KEY, UPGRADE_MAP, UPGRADE_MAP_ERRORS, effectAt, hexView, layoutUpgradeMap, nodeKey, nodeName, pctText, tabLines, visibleHexes,
} from '../src/core/upgradeTree';
import {
  QUICK_ROLL, UPGRADES, UPGRADES_BY_ID, UPGRADE_TABS, buyUpgrade, canBuy, sanitizeUpgrades, tier, upgradeCost, upgradeCostAt, upgradeFx, upgradeNodeState, upgradeTab, upgradeUnlocked,
  type UpgradeId,
} from '../src/core/upgrades';
import { combatOdds, lineWeight, rollCombat } from '../src/core/combatRoll';
import { BIOMES } from '../src/world/biomes';
import { castWildMagic, chanceOf, onFloorStart, onHeroHit, onHeroHurt, onKill, onShotHit, onTick, WILD_SPELLS } from '../src/world/chance';
import type { Shot, Unit } from '../src/world/entities';
import { generateFloor } from '../src/world/mapgen';
import { floorMobs } from '../src/world/mobgen';
import { World, type HeroSpec } from '../src/world/world';
import { ROLL_TIME, onSkillRoll, rollTime, startSkillRoll } from '../src/world/skills';
import { Game } from '../src/game';

function game(ups: Partial<Record<UpgradeId, number>> = {}, gold = 0): GameState {
  const s = newGame(1);
  s.roll.tutorial = 'done';
  s.gold = gold;
  Object.assign(s.upgrades, ups);
  return s;
}

/** A roll's numbers that land it on combat line `id` (no double, not free). */
function landOn(s: GameState, id: UpgradeId): () => number {
  const odds = combatOdds(s);
  let acc = 0;
  for (const o of odds) {
    if (o.def.id === id) {
      const q = [acc + o.chance / 2, 0.99, 0.99];
      return () => q.shift() ?? 0.99;
    }
    acc += o.chance;
  }
  throw new Error(`${id} is not in the roll`);
}

/** Every tier of every line up to (not including) `id`'s first tier, so `id` is open. */
function openLine(id: UpgradeId, ups: Partial<Record<UpgradeId, number>> = {}): Partial<Record<UpgradeId, number>> {
  const out = { ...ups };
  let d = UPGRADES_BY_ID.get(id)!;
  while (d.requires) {
    out[d.requires.id] = Math.max(out[d.requires.id] ?? 0, d.requires.tier);
    d = UPGRADES_BY_ID.get(d.requires.id)!;
  }
  return out;
}

/** An Rng that returns the given numbers in turn (then the last one forever). */
function fixedRng(values: number[]): Rng {
  const r = new Rng(1);
  let i = 0;
  r.next = () => values[Math.min(i++, values.length - 1)];
  return r;
}

/** Counts the Rng's draws. */
function counted(r: Rng): { rng: Rng; draws: () => number } {
  let n = 0;
  const next = r.next.bind(r);
  r.next = () => (n++, next());
  return { rng: r, draws: () => n };
}

function squad(ids: string[], ups: Partial<Record<UpgradeId, number>> = {}): HeroSpec[] {
  const s = newGame(1);
  Object.assign(s.upgrades, ups);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id.split('-') as [HeroSpec['rarity'], HeroSpec['cls']];
    return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
  });
}

function world(ids = [knightId('rare', 'ranger'), knightId('rare', 'guardian')], seed = 99, ups: Partial<Record<UpgradeId, number>> = {}): World {
  const biome = BIOMES.hamlet;
  const map = generateFloor({ floor: 2, biome, seed, boss: false });
  return new World({ map, biome, floor: 2, boss: false, mobTypes: floorMobs(biome, 2, seed), bossType: null, squad: squad(ids, ups), perks: [], controlled: 0, seed, goldPerKill: 10 });
}

const firstMob = (w: World): Unit => w.mobs.find((m) => !m.dead && !m.boss)!;

// ------------------------------------------------------------------ the map

describe('the upgrade map', () => {
  it('splits the lines over two tabs: Luck (the altar and fortune, bought) and Combat (the squad and chance, rolled)', () => {
    expect(UPGRADE_TABS).toEqual(['luck', 'combat']);
    for (const u of UPGRADES) expect(upgradeTab(u), u.id).toBe(u.kind === 'altar' || u.kind === 'fortune' ? 'luck' : 'combat');
    expect(tabLines('luck').length + tabLines('combat').length).toBe(UPGRADES.length);
    // A Luck line only ever hangs off another Luck line, from one root: Luck.
    for (const u of tabLines('luck')) if (u.requires) expect(upgradeTab(UPGRADES_BY_ID.get(u.requires.id)!), u.id).toBe('luck');
    expect(tabLines('luck').filter((u) => !u.requires).map((u) => u.id)).toEqual(['luck']);
    // Combat lines hang off nothing, have no place on a map and no price: every one is in the roll from the start.
    for (const u of tabLines('combat')) {
      expect(u.requires, u.id).toBeUndefined();
      expect(u.path, u.id).toBeUndefined();
      expect(u.cost, u.id).toBeUndefined();
      expect(upgradeUnlocked(game(), u.id), u.id).toBe(true);
    }
  });

  it('lays the Luck tab out as its map, every tier one hex, none overlapping, growing from Luck I', () => {
    expect(UPGRADE_MAP_ERRORS).toEqual([]);
    expect(UPGRADE_MAP.length).toBe(tabLines('luck').reduce((n, u) => n + u.max, 0));
    expect(ROOT_KEY).toBe('luck:1');
    const root = HEX_BY_KEY.get(ROOT_KEY)!;
    expect([root.col, root.row, root.prev]).toEqual([0, 0, null]);
    const cells = new Set(UPGRADE_MAP.map((n) => `${n.col},${n.row}`));
    expect(cells.size).toBe(UPGRADE_MAP.length);
    for (const n of UPGRADE_MAP) {
      expect(upgradeTab(UPGRADES_BY_ID.get(n.id)!), n.key).toBe('luck');
      // Doubled coordinates: col + row is always even, and every hex sits next to the one it hangs off.
      expect(Math.abs(n.col + n.row) % 2).toBe(0);
      if (!n.prev) {
        expect(n.key).toBe(ROOT_KEY);
        continue;
      }
      const p = HEX_BY_KEY.get(n.prev)!;
      const dc = n.col - p.col;
      const dr = n.row - p.row;
      expect((dc === 0 && Math.abs(dr) === 2) || (Math.abs(dc) === 1 && Math.abs(dr) === 1), n.key).toBe(true);
    }
    // The combat lines aren't on it.
    for (const u of tabLines('combat')) expect(HEX_BY_KEY.has(nodeKey(u.id, 1)), u.id).toBe(false);
    // A line hanging off one that isn't on the map has nowhere to grow from; a line with no path can't be placed.
    const bad = layoutUpgradeMap([{ id: 'a', max: 2, path: 'n' }, { id: 'b', max: 1, path: 'n', requires: { id: 'might', tier: 1 } }, { id: 'c', max: 1, requires: { id: 'a', tier: 2 } }]);
    expect(bad.errors.some((e) => e.includes('not on the map'))).toBe(true);
    expect(bad.errors.some((e) => e.includes('c has no path'))).toBe(true);
  });

  it('keeps every RK line and adds the new ones, each with a name, a description and an icon', () => {
    for (const id of ['luck', 'spinSpeed', 'pity', 'luckySpin', 'goldenSpin', 'alchemy', 'turbo', 'potionTime', 'extraReel', 'might', 'vitality', 'greed', 'swiftness', 'offline'] as const) {
      expect(UPGRADES_BY_ID.has(id), id).toBe(true);
    }
    // The quirky combat lines roll their dice in the fight; Loaded Dice leans the skill rolls instead.
    for (const id of ['luckyStrike', 'doubleOrNothing', 'ricochet', 'pratfall', 'secondWind', 'coinShower', 'jackpot', 'butterfingers', 'wildMagic'] as const) {
      expect(UPGRADES_BY_ID.get(id)?.rolls, id).toBe(true);
    }
    expect(UPGRADES_BY_ID.get('loadedDice')?.rolls).toBeUndefined();
    // The old flat list's two groups still hold every line (screens that list by them show them all).
    expect(UPGRADES.every((u) => u.group === 'altar' || u.group === 'squad')).toBe(true);
    for (const u of UPGRADES) {
      expect(u.name.length, u.id).toBeGreaterThan(2);
      expect(u.desc.length, u.id).toBeGreaterThan(10);
      expect(u.icon.length, u.id).toBeGreaterThan(2);
      expect(u.text(1).length, u.id).toBeGreaterThan(3);
      if (u.special) expect(u.max === 1 || u.id === 'extraReel', u.id).toBe(true);
    }
  });

  it('reports a bad layout (overlaps, wrong path lengths, missing parents)', () => {
    const bad = layoutUpgradeMap([
      { id: 'a', max: 2, path: 'n' },
      { id: 'b', max: 1, path: 'n', requires: { id: 'a', tier: 1 } },
      { id: 'c', max: 2, path: 'ne', requires: { id: 'a', tier: 2 } },
      { id: 'd', max: 1, path: 's', requires: { id: 'zzz', tier: 1 } },
    ]);
    expect(bad.errors.some((e) => e.includes('overlaps'))).toBe(true);
    expect(bad.errors.some((e) => e.includes('path has 1 steps, needs 2'))).toBe(true);
    expect(bad.errors.some((e) => e.includes('not on the map'))).toBe(true);
  });

  it('names tiers with Roman numerals, one-offs plainly', () => {
    expect(nodeName({ id: 'luck', tier: 4 })).toBe('Luck IV');
    expect(nodeName({ id: 'might', tier: 8 })).toBe('Strength VIII');
    expect(nodeName({ id: 'atkSpeed', tier: 2 })).toBe('Attack Speed II');
    expect(nodeName({ id: 'horseshoe', tier: 1 })).toBe('Lucky Horseshoe');
  });
});

// ------------------------------------------------------------------ costs and buying

describe('costs', () => {
  it('start at the line base and grow by its factor each tier (Luck lines; combat lines are rolled, never bought)', () => {
    for (const u of tabLines('luck')) {
      const s = game();
      const cost = u.cost!;
      const growth = u.growth!;
      expect(upgradeCost(s, u.id)).toBe(Math.round(cost));
      for (let t = 1; t < u.max; t++) {
        s.upgrades[u.id] = t;
        expect(upgradeCost(s, u.id)).toBe(Math.max(1, Math.round(cost * Math.pow(growth, t))));
        expect(upgradeCost(s, u.id)).toBeGreaterThanOrEqual(upgradeCostAt(u, t - 1));
      }
    }
    expect(upgradeCostAt(UPGRADES_BY_ID.get('luck')!, 0)).toBe(120);
    expect(upgradeCostAt(UPGRADES_BY_ID.get('luck')!, 2)).toBe(1080);
    const rich = game({}, 1e15);
    for (const u of tabLines('combat')) {
      expect(upgradeCost(rich, u.id), u.id).toBe(Infinity);
      expect(canBuy(rich, u.id), u.id).toBe(false);
      expect(buyUpgrade(rich, u.id), u.id).toBe(false);
    }
    expect(rich.gold).toBe(1e15);
    expect(rich.upgrades).toEqual({});
  });

  it('take the gold and add a tier, never past the last one', () => {
    const s = game({}, 1e12);
    expect(buyUpgrade(s, 'luck')).toBe(true);
    expect(s.gold).toBe(1e12 - 120);
    expect(tier(s, 'luck')).toBe(1);
    for (let i = 0; i < 20; i++) buyUpgrade(s, 'luck');
    expect(tier(s, 'luck')).toBe(8);
    expect(canBuy(s, 'luck')).toBe(false);
    expect(buyUpgrade(s, 'luck')).toBe(false);
  });

  it("can't be bought short of gold, or before the tier a line hangs off", () => {
    const s = game({}, 100);
    expect(buyUpgrade(s, 'luck')).toBe(false);
    expect(s.gold).toBe(100);
    s.gold = 1e9;
    // Spin Speed hangs off Luck I; Lucky Spins off Spin Speed III.
    expect(upgradeUnlocked(s, 'spinSpeed')).toBe(false);
    expect(buyUpgrade(s, 'spinSpeed')).toBe(false);
    buyUpgrade(s, 'luck');
    expect(buyUpgrade(s, 'spinSpeed')).toBe(true);
    expect(buyUpgrade(s, 'luckySpin')).toBe(false);
    buyUpgrade(s, 'spinSpeed');
    buyUpgrade(s, 'spinSpeed');
    expect(buyUpgrade(s, 'luckySpin')).toBe(true);
  });

  it('open a line deep in the map once every tier on the way to it is owned', () => {
    for (const id of ['philosopher', 'jackpot', 'goldenSpin', 'loadedDice', 'turbo', 'offline'] as const) {
      const s = game(openLine(id), 1e12);
      expect(upgradeUnlocked(s, id), id).toBe(true);
      expect(hexView(s, HEX_BY_KEY.get(nodeKey(id, 1))!), id).toBe('open');
      expect(buyUpgrade(s, id), id).toBe(true);
      const d = UPGRADES_BY_ID.get(id)!.requires!;
      s.upgrades[d.id] = d.tier - 1;
      expect(upgradeUnlocked(s, id), id).toBe(false);
    }
  });

  it('tidy an old flat-list save: unknown lines go, tiers clamp, orphaned lines are cleared', () => {
    const s = game({ might: 12, spinSpeed: 3, luck: 2, luckySpin: 2 } as never);
    (s.upgrades as Record<string, number>).bogus = 4;
    // Old saves count no more than a line has, even before tidying.
    expect(tier(s, 'might')).toBe(8);
    sanitizeUpgrades(s);
    expect(s.upgrades).toEqual({ luck: 2, spinSpeed: 3, might: 8, luckySpin: 2 });
    const orphan = game({ luckySpin: 3, pity: 2 });
    sanitizeUpgrades(orphan);
    expect(orphan.upgrades).toEqual({});
  });

  it('keep every combat tier a save owns: combat lines hang off nothing now (they are rolled)', () => {
    // Bought on the old Combat map (each hung off another); every tier stays, nothing is added.
    const s = game({ luck: 1, vitality: 4, secondWind: 2, swiftness: 1, quickRoll: 3, ladyLuck: 1, twoHeaded: 1 });
    sanitizeUpgrades(s);
    expect(s.upgrades).toEqual({ luck: 1, vitality: 4, secondWind: 2, swiftness: 1, quickRoll: 3, ladyLuck: 1, twoHeaded: 1 });
    // Tiers still clamp to the line's.
    const t = game({ might: 11, excalibur: 3 });
    sanitizeUpgrades(t);
    expect(t.upgrades).toEqual({ might: 8, excalibur: 1 });
  });
});

// ------------------------------------------------------------------ reveal rules

describe('what the map shows', () => {
  it('opens on its root, with "?" on its neighbors and nothing else', () => {
    const s = game();
    const luck = visibleHexes(s);
    expect(luck.find((h) => h.node.key === 'luck:1')?.view).toBe('open');
    expect(luck.filter((h) => h.view === 'mystery').map((h) => h.node.key).sort()).toEqual(['extraReel:1', 'greed:1', 'luck:2', 'spinSpeed:1']);
    expect(luck.length).toBe(5);
  });

  it('shows owned tiers bright, the next ones with a price, one step past them "?", and hides the rest', () => {
    const s = game({ luck: 3 });
    const at = (key: string) => hexView(s, HEX_BY_KEY.get(key)!);
    expect(at('luck:1')).toBe('owned');
    expect(at('luck:3')).toBe('owned');
    expect(at('luck:4')).toBe('open');
    expect(at('luck:5')).toBe('mystery');
    expect(at('luck:6')).toBeNull();
    // Luck III opens Alchemy I (it hangs off it); Alchemy II is "?", Alchemy III hidden.
    expect(at('alchemy:1')).toBe('open');
    expect(at('alchemy:2')).toBe('mystery');
    expect(at('alchemy:3')).toBeNull();
    // The spokes off Luck I are open; their second tiers "?".
    for (const id of ['spinSpeed', 'greed', 'extraReel'] as const) {
      expect(at(nodeKey(id, 1))).toBe('open');
      expect(at(nodeKey(id, 2))).toBe('mystery');
      expect(at(nodeKey(id, 3))).toBeNull();
    }
    // A branch shows only once its spoke reaches the tier it hangs off.
    expect(at('luckySpin:1')).toBeNull();
    s.upgrades.spinSpeed = 2;
    expect(at('luckySpin:1')).toBe('mystery');
    s.upgrades.spinSpeed = 3;
    expect(at('luckySpin:1')).toBe('open');
  });

  it('shows a gold special as "?" next to an open hex, then open, then owned', () => {
    const s = game({ luck: 6 });
    expect(hexView(s, HEX_BY_KEY.get('horseshoe:1')!)).toBeNull();
    s.upgrades.luck = 7;
    expect(hexView(s, HEX_BY_KEY.get('horseshoe:1')!)).toBe('mystery');
    s.upgrades.luck = 8;
    expect(hexView(s, HEX_BY_KEY.get('horseshoe:1')!)).toBe('open');
    expect(HEX_BY_KEY.get('horseshoe:1')!.special).toBe(true);
    s.upgrades.horseshoe = 1;
    expect(upgradeNodeState(s, 'horseshoe', 1)).toBe('owned');
  });
});

// ------------------------------------------------------------------ effects

describe('effects', () => {
  it('add up as the lines say, and the altar reads them', () => {
    const s = game({ luck: 8, horseshoe: 1, luckySpin: 6, luckyStreak: 4, goldenWheel: 1, goldenSpin: 4, pity: 8, extraReel: 4, spinSpeed: 8, alchemy: 6, philosopher: 1 });
    const fx = upgradeFx(s);
    expect(fx.luck).toBeCloseTo(0.15 * 8 + 0.3, 9);
    expect(currentLuck(s, Date.now())).toBeCloseTo(1 + 1.5, 9);
    expect(luckyEvery(s)).toBe(BAL.roll.luckyMinEvery);
    expect(luckyMult(s)).toBe(BAL.roll.luckyMult + 2);
    expect(fx.goldenChance).toBeCloseTo(0.1, 9);
    expect(drySpell(s)).toBe(BAL.roll.pity.min);
    expect(reelCount(s)).toBe(5);
    expect(spinCycle(s)).toBeGreaterThanOrEqual(BAL.roll.minCycleSeconds);
    expect(fx.mutationMult).toBeCloseTo(Math.pow(1.25, 6) * 2, 9);
  });

  it('keep the old lines at the same top end, in fewer, bigger tiers', () => {
    const s = game({ might: 8, vitality: 8, greed: 8, swiftness: 5, offline: 5, potionTime: 4, turbo: 4 });
    const fx = upgradeFx(s);
    expect(fx.atkPct).toBe(144);
    expect(fx.hpPct).toBe(144);
    expect(fx.goldPct).toBe(120);
    expect(fx.speedPct).toBe(30);
    expect(fx.offlineEff).toBeCloseTo(5 * BAL.offline.perTier, 9);
    expect(fx.potionSeconds).toBe(80);
    expect(fx.turboPower).toBe(2);
    s.upgrades.excalibur = 1;
    s.upgrades.dragonscale = 1;
    s.upgrades.treasury = 1;
    expect(upgradeFx(s).atkPct).toBe(174);
    expect(upgradeFx(s).hpPct).toBe(174);
    expect(upgradeFx(s).goldPct).toBe(220);
  });

  it('describe themselves for the buy card, before and after the next tier', () => {
    const s = game();
    expect(effectAt(s, 'luck', 0)).toBe('+0% luck');
    expect(effectAt(s, 'luck', 3)).toBe('+45% luck');
    expect(effectAt(s, 'luckySpin', 6)).toBe('a Lucky Spin every 4 spins');
    expect(effectAt(s, 'luckyStrike', 6)).toBe('9% of hits LUCKY (x5)');
    expect(effectAt(s, 'jackpot', 1)).toBe('0.25% of kills win a Lucky Spin');
    expect(effectAt(s, 'pity', 8)).toBe('Epic+ guaranteed after 8 rolls');
    expect(effectAt(s, 'extraReel', 2)).toBe('3 reels');
    expect(effectAt(s, 'potionTime', 6)).toBe('180 s Luck Potions');
    for (const u of UPGRADES) for (let t = 0; t <= u.max; t++) expect(effectAt(s, u.id, t).length, `${u.id} ${t}`).toBeGreaterThan(3);
    expect(pctText(0.0025)).toBe('0.25%');
    expect(pctText(0.045)).toBe('4.5%');
    expect(pctText(0.6)).toBe('60%');
  });
});

// ------------------------------------------------------------------ Quick Roll

describe('Quick Roll', () => {
  it('is a Combat line in the roll from the start: five tiers, a little rarer each', () => {
    const q = UPGRADES_BY_ID.get('quickRoll')!;
    expect(upgradeTab(q)).toBe('combat');
    expect(q.kind).toBe('squad');
    expect(q.max).toBe(5);
    expect(q.requires).toBeUndefined();
    expect(HEX_BY_KEY.get('quickRoll:1')).toBeUndefined();
    for (let t = 2; t <= 5; t++) expect(lineWeight(q, t)).toBeLessThan(lineWeight(q, t - 1));
    const s = game({}, 1e12);
    expect(combatOdds(s).find((o) => o.def.id === 'quickRoll')!.chance).toBeGreaterThan(0);
    for (let t = 0; t < 5; t++) expect(rollCombat(s, landOn(s, 'quickRoll'))?.id).toBe('quickRoll');
    expect(tier(s, 'quickRoll')).toBe(5);
    expect(combatOdds(s).find((o) => o.def.id === 'quickRoll')!.chance).toBe(0);
  });

  it('per tier: the roll spins 12% shorter (there is no cooldown to shorten)', () => {
    expect(QUICK_ROLL).toEqual({ spinPct: 12 });
    for (let t = 0; t <= 5; t++) expect(upgradeFx(game({ quickRoll: t })).rollSpinPct).toBe(12 * t);
    expect(effectAt(game(), 'quickRoll', 0)).toBe('-0% roll time');
    expect(effectAt(game(), 'quickRoll', 3)).toBe('-36% roll time');
  });

  it("shortens every knight's roll spin in its stats, and nothing else", () => {
    for (const cls of ['guardian', 'blade', 'ranger', 'cleric', 'arcanist', 'lancer'] as const) {
      const id = knightId('epic', cls);
      const plain = game();
      addKnight(plain, id, null);
      const quick = game({ quickRoll: 5 });
      addKnight(quick, id, null);
      const a = knightStats(plain, id);
      const b = knightStats(quick, id);
      expect(a.specialCd).toBeCloseTo(CLASSES[cls].specialCd, 9);
      expect(a.rollTimeMult).toBe(1);
      expect(b.specialCd).toBeCloseTo(a.specialCd, 9);
      expect(b.rollTimeMult).toBeCloseTo(0.4, 9);
      expect(b.atk).toBeCloseTo(a.atk, 9);
      expect(b.hp).toBeCloseTo(a.hp, 9);
      expect(b.atkCd).toBeCloseTo(a.atkCd, 9);
    }
  });

  it('lands a skill roll sooner in the fight, and leaves no cooldown behind it', () => {
    const id = knightId('rare', 'blade');
    const spin = (ups: Partial<Record<UpgradeId, number>>) => {
      const w = world([id], 7, ups);
      const h = w.heroes[0];
      h.specialT = 0;
      const landed: number[] = [];
      const stop = onSkillRoll((e) => {
        if (e.phase === 'reveal' && e.hero === h) landed.push(w.time);
      });
      const t0 = w.time;
      expect(startSkillRoll(w, h)).toBe(true);
      const dur = h.skillRoll!.dur;
      for (let i = 0; i < Math.ceil((ROLL_TIME + 0.5) * 60) && !landed.length; i++) w.update(1 / 60);
      stop();
      return { dur, took: landed[0] - t0, cd: h.specialCd!, left: h.specialT!, mult: h.rollTimeMult };
    };
    const plain = spin({});
    expect(plain.dur).toBeCloseTo(ROLL_TIME, 9);
    expect(plain.took).toBeGreaterThanOrEqual(ROLL_TIME - 1e-6);
    const quick = spin(openLine('quickRoll', { quickRoll: 5 }));
    expect(quick.mult).toBeCloseTo(0.4, 9);
    expect(quick.dur).toBeCloseTo(ROLL_TIME * 0.4, 9);
    expect(quick.took).toBeLessThan(ROLL_TIME * 0.4 + 0.02);
    expect(quick.took).toBeLessThan(plain.took - 0.3);
    // No cooldown starts as it lands (the next roll waits only for the skill to finish firing).
    expect(plain.left).toBe(0);
    expect(quick.left).toBe(0);
    // A unit without the field spins for ROLL_TIME.
    expect(rollTime({})).toBe(ROLL_TIME);
    expect(rollTime({ rollTimeMult: 0.76 })).toBeCloseTo(ROLL_TIME * 0.76, 9);
  });

  it('reaches the knights already on a floor when it is rolled', () => {
    const g = new Game(true);
    for (let t = 0; t < 30; t += 1 / 30) g.tick(1 / 30);
    g.enterDungeon();
    for (let t = 0; t < 3; t += 1 / 30) g.tick(1 / 30);
    const w = g.world!;
    expect(w.heroes.length).toBeGreaterThan(0);
    const before = w.heroes.map((h) => h.specialCd!);
    expect(w.heroes.every((h) => (h.rollTimeMult ?? 1) === 1)).toBe(true);
    g.state.gold = 1e9;
    for (let t = 0; t < 2; t++) expect(rollCombat(g.state, landOn(g.state, 'quickRoll'))?.id).toBe('quickRoll');
    g.syncSquad();
    w.heroes.forEach((h, i) => {
      expect(h.rollTimeMult).toBeCloseTo(0.76, 9);
      expect(h.specialCd!).toBeCloseTo(before[i], 6);
    });
  });
});

// ------------------------------------------------------------------ the chance numbers

describe('chance numbers', () => {
  it('add up per tier, Lady Luck lifts them all by a quarter, and none reaches certainty', () => {
    const s = game({ luckyStrike: 6, doubleOrNothing: 4, ricochet: 5, wildMagic: 5, secondWind: 4, butterfingers: 5, pratfall: 5, coinShower: 5, jackpot: 3, sands: 5, giantSlayer: 6, lifesteal: 5 });
    const fx = chanceFx(s);
    expect(fx.luckyStrike).toBeCloseTo(0.09, 9);
    expect(fx.coinFlip).toBeCloseTo(0.4, 9);
    expect(fx.coinHeads).toBe(0.5);
    expect(fx.ricochet).toBeCloseTo(0.4, 9);
    expect(fx.wildMagic).toBeCloseTo(0.05, 9);
    expect(fx.secondWind).toBeCloseTo(0.6, 9);
    expect(fx.butterfingers).toBeCloseTo(0.15, 9);
    expect(fx.pratfall).toBeCloseTo(0.1, 9);
    expect(fx.coinShower).toBeCloseTo(0.2, 9);
    expect(fx.jackpot).toBeCloseTo(0.0075, 9);
    expect(fx.sands).toBeCloseTo(0.05, 9);
    expect(fx.giantSlayer).toBeCloseTo(0.9, 9);
    expect(fx.lifesteal).toBeCloseTo(0.1, 9);
    s.upgrades.ladyLuck = 1;
    s.upgrades.twoHeaded = 1;
    const lady = chanceFx(s);
    expect(lady.luckyStrike).toBeCloseTo(0.09 * 1.25, 9);
    expect(lady.secondWind).toBeCloseTo(0.75, 9);
    // The coin is variance, not luck: it flips as often, but lands double 2 in 3.
    expect(lady.coinFlip).toBeCloseTo(0.4, 9);
    expect(lady.coinHeads).toBeCloseTo(2 / 3, 9);
    s.upgrades.secondWind = 99;
    expect(chanceFx(s).secondWind).toBeLessThanOrEqual(0.95);
    expect(chanceFx(game()).any).toBe(false);
  });

  it('roll hits at the right rates: the coin, LUCKY x5, and Giant Slayer on big foes', () => {
    const fx = chanceFx(game({ luckyStrike: 6, doubleOrNothing: 4, giantSlayer: 2 }));
    const rng = new Rng(11);
    const n = 40_000;
    let flips = 0;
    let doubles = 0;
    let nothing = 0;
    let lucky = 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const r = rollHit(fx, rng, false);
      if (r.coin) flips++;
      if (r.coin === 'double') doubles++;
      if (r.coin === 'nothing') nothing++;
      if (r.lucky) lucky++;
      total += r.mult;
    }
    expect(flips / n).toBeCloseTo(0.4, 1);
    expect(doubles / flips).toBeCloseTo(0.5, 1);
    expect(nothing / flips).toBeCloseTo(0.5, 1);
    // LUCKY rolls only on hits the coin didn't zero: 9% of those.
    expect(lucky / (n - nothing)).toBeCloseTo(0.09, 2);
    expect(total / n).toBeCloseTo(expectedHitMult(fx, false), 1);
    expect(expectedHitMult(fx, false)).toBeCloseTo(1.36, 9);
    const big = rollHit(chanceFx(game({ giantSlayer: 2 })), rng, true);
    expect(big.mult).toBeCloseTo(1.3, 9);
    expect(big.giant).toBe(true);
  });

  it('land the Two-Headed Coin double two times in three', () => {
    const fx = chanceFx(game({ doubleOrNothing: 4, twoHeaded: 1 }));
    const rng = new Rng(5);
    let flips = 0;
    let doubles = 0;
    for (let i = 0; i < 30_000; i++) {
      const r = rollHit(fx, rng, false);
      if (r.coin) flips++;
      if (r.coin === 'double') doubles++;
    }
    expect(doubles / flips).toBeCloseTo(2 / 3, 1);
    expect(expectedHitMult(fx, false)).toBeCloseTo(0.6 + 0.4 * (4 / 3), 9);
  });

  it('roll kills at the right rates, and Pratfall spreads its chance a second over the frames', () => {
    const fx = chanceFx(game({ coinShower: 5, jackpot: 3, sands: 5 }));
    const rng = new Rng(3);
    const n = 100_000;
    const c = { shower: 0, jackpot: 0, hourglass: 0 };
    for (let i = 0; i < n; i++) {
      const r = rollKill(fx, rng);
      if (r.shower) c.shower++;
      if (r.jackpot) c.jackpot++;
      if (r.hourglass) c.hourglass++;
    }
    expect(c.shower / n).toBeCloseTo(0.2, 2);
    expect(c.hourglass / n).toBeCloseTo(0.05, 2);
    expect(c.jackpot / n).toBeGreaterThan(0.005);
    expect(c.jackpot / n).toBeLessThan(0.01);
    const trip = chanceFx(game({ pratfall: 5 }));
    // Thirty frames of a second add up to the per-second chance.
    expect(1 - Math.pow(1 - tripChance(trip, 1 / 30), 30)).toBeCloseTo(0.1, 9);
    expect(tripChance(chanceFx(game()), 1 / 30)).toBe(0);
  });

  it('never touch the dice without the lines that need them', () => {
    const fx = chanceFx(game());
    const { rng, draws } = counted(new Rng(1));
    for (let i = 0; i < 50; i++) {
      rollHit(fx, rng, true);
      rollKill(fx, rng);
    }
    expect(draws()).toBe(0);
  });

  it('give Loaded Dice a luck multiplier for the skill rolls', () => {
    expect(skillRollLuck(game())).toBe(1);
    expect(skillRollLuck(game({ loadedDice: 5 }))).toBeCloseTo(1 + 5 * CHANCE.loadedDice.perTier, 9);
  });
});

// ------------------------------------------------------------------ the hooks on a floor

describe('the chance hooks in a fight', () => {
  it('do nothing on a floor that was never bound, or with no chance lines', () => {
    const w = world();
    const h = w.heroes[0];
    const m = firstMob(w);
    const before = w.rng.state;
    expect(onHeroHit(w, h, m, 50)).toBe(50);
    expect(onHeroHurt(w, h, 30, m)).toBe(30);
    onKill(w, m);
    onTick(w, 1 / 30);
    expect(chanceOf(w)).toBeNull();
    onFloorStart(w, game({ luck: 8, might: 8 }));
    expect(onHeroHit(w, h, m, 50)).toBe(50);
    expect(onHeroHurt(w, h, 30, m)).toBe(30);
    onKill(w, m);
    onTick(w, 1);
    expect(w.rng.state).toBe(before);
    expect(w.pickups.length).toBe(0);
  });

  it('LUCKY: x5, shown as a crit in clover green', () => {
    const w = world();
    onFloorStart(w, game({ luckyStrike: 6 }));
    w.rng = fixedRng([0]);
    const opts: { crit?: boolean; color?: string } = {};
    expect(onHeroHit(w, w.heroes[0], firstMob(w), 40, opts)).toBe(200);
    expect(opts.crit).toBe(true);
    expect(w.texts.some((t) => t.text === 'LUCKY!')).toBe(true);
    w.rng = fixedRng([0.5]);
    expect(onHeroHit(w, w.heroes[0], firstMob(w), 40)).toBe(40);
  });

  it('Double or Nothing: heads doubles the hit, tails deals none', () => {
    const w = world();
    onFloorStart(w, game({ doubleOrNothing: 4 }));
    w.rng = fixedRng([0, 0.1]);
    expect(onHeroHit(w, w.heroes[0], firstMob(w), 30)).toBe(60);
    w.rng = fixedRng([0, 0.9]);
    expect(onHeroHit(w, w.heroes[0], firstMob(w), 30)).toBe(0);
    expect(w.texts.some((t) => t.text === 'NOTHING')).toBe(true);
    w.rng = fixedRng([0.5]);
    expect(onHeroHit(w, w.heroes[0], firstMob(w), 30)).toBe(30);
  });

  it('Giant Slayer hits elites and bosses harder; Leechblade heals the hitter', () => {
    const w = world();
    onFloorStart(w, game({ giantSlayer: 4, lifesteal: 5 }));
    const h = w.heroes[0];
    const m = firstMob(w);
    expect(onHeroHit(w, h, m, 100)).toBe(100);
    m.elite = true;
    expect(onHeroHit(w, h, m, 100)).toBeCloseTo(160, 9);
    h.hp = 10;
    onHeroHit(w, h, m, 100);
    expect(h.hp).toBeCloseTo(10 + 160 * 0.1, 9);
  });

  it('Butterfingers: a fumbled hit does nothing and leaves the foe dazed', () => {
    const w = world();
    onFloorStart(w, game({ butterfingers: 5 }));
    const h = w.heroes[0];
    const m = firstMob(w);
    w.rng = fixedRng([0]);
    expect(onHeroHurt(w, h, 25, m)).toBe(0);
    expect(m.stunT).toBeGreaterThan(0);
    expect(w.texts.some((t) => t.text === 'FUMBLE!')).toBe(true);
    w.rng = fixedRng([0.9]);
    expect(onHeroHurt(w, h, 25, m)).toBe(25);
    // Only foes fumble.
    w.rng = fixedRng([0]);
    expect(onHeroHurt(w, h, 25, null)).toBe(25);
  });

  it('Butterfingers: a foe that fumbles in the middle of its dash just stops, dazed', () => {
    const w = world();
    onFloorStart(w, game({ butterfingers: 5 }));
    const h = w.heroes[0];
    const m = firstMob(w);
    for (const o of w.heroes) o.invuln = 0;
    // A dash that runs into the knight this frame.
    m.awake = true;
    m.x = h.x - 6;
    m.y = h.y;
    m.rush = { kind: 'dash', move: 'dash', name: 'charge', x0: m.x, y0: m.y, x1: m.x + 60, y1: m.y, t: 0, dur: 0.4, height: 0, dmg: 1, knock: 0, r: 8, through: false, recover: 0.5, big: false, hit: new Set() };
    w.rng = fixedRng([0]);
    const hp = h.hp;
    expect(() => w.update(1 / 60)).not.toThrow();
    expect(h.hp).toBe(hp);
    expect(m.stunT).toBeGreaterThan(0);
    expect(m.rush).toBeUndefined();
    expect(() => w.update(1 / 60)).not.toThrow();
  });

  it('Second Wind: shrugs off one killing blow a floor per knight, leaving it on its feet', () => {
    const w = world();
    const s = game({ secondWind: 4 });
    onFloorStart(w, s);
    const h = w.heroes[0];
    w.rng = fixedRng([0]);
    h.hp = 20;
    expect(onHeroHurt(w, h, 15, null)).toBe(15);
    expect(onHeroHurt(w, h, 500, null)).toBe(0);
    expect(h.hp).toBeCloseTo(Math.round(h.maxHp * CHANCE.secondWind.hpShare), 9);
    expect(h.invuln).toBeGreaterThan(0);
    expect(w.texts.some((t) => t.text === 'SECOND WIND!')).toBe(true);
    // Used up for this floor...
    expect(onHeroHurt(w, h, 1e6, null)).toBe(1e6);
    // ...and ready again on the next.
    onFloorStart(w, s);
    expect(onHeroHurt(w, h, 1e6, null)).toBe(0);
  });

  it('Coin Shower bursts three times a kill\'s gold; Sands of Fortune drops an Hourglass', () => {
    const w = world();
    onFloorStart(w, game({ coinShower: 5, sands: 5 }));
    const m = firstMob(w);
    w.rng = fixedRng([0]);
    onKill(w, m);
    const gold = w.pickups.filter((p) => p.kind === 'gold').reduce((a, p) => a + p.amount, 0);
    expect(gold).toBeGreaterThanOrEqual(30 - 6);
    expect(gold).toBeLessThanOrEqual(30 + 6);
    expect(w.pickups.filter((p) => p.kind === 'hourglass').length).toBe(1);
    expect(w.texts.some((t) => t.text === 'COIN SHOWER!')).toBe(true);
  });

  it('Jackpot wins the next spin a Lucky Spin, or a Luck Potion when one is due anyway', () => {
    const w = world();
    const s = game({ jackpot: 3 });
    onFloorStart(w, s);
    s.roll.sinceLucky = 0;
    w.rng = fixedRng([0]);
    onKill(w, firstMob(w));
    expect(s.roll.sinceLucky).toBe(luckyEvery(s) - 1);
    expect(w.texts.some((t) => t.text === 'JACKPOT!')).toBe(true);
    expect(w.pickups.some((p) => p.kind === 'potion')).toBe(false);
    onKill(w, firstMob(w));
    expect(w.pickups.some((p) => p.kind === 'potion')).toBe(true);
  });

  it('Ricochet: an arrow bounces on to the nearest other foe, weaker, three times at most', () => {
    const w = world();
    onFloorStart(w, game({ ricochet: 5 }));
    const h = w.heroes[0];
    const [a, b, c, d] = w.mobs.filter((m) => !m.dead && !m.boss);
    // A row of foes 30 px apart (the map's own layout shouldn't decide what's in range).
    b.x = a.x + 30;
    b.y = a.y;
    c.x = b.x + 30;
    c.y = a.y;
    d.x = c.x + 30;
    d.y = a.y;
    const shot: Shot = { uid: 1, team: 'hero', x: a.x - 10, y: a.y - 6, vx: 200, vy: 0, r: 2, dmg: 50, life: 1, kind: 'arrow', color: '#f0e0b0', from: h.uid };
    w.rng = fixedRng([0]);
    onShotHit(w, shot, a);
    expect(w.shots.length).toBe(1);
    const next = w.shots[0];
    expect(next.dmg).toBeCloseTo(50 * CHANCE.ricochet.dmg, 9);
    expect(next.hit?.has(a.uid)).toBe(true);
    expect(next.vx).toBeGreaterThan(0);
    // Orbs don't bounce; a shot stops after three.
    onShotHit(w, { ...shot, kind: 'orb' }, a);
    expect(w.shots.length).toBe(1);
    let cur = next;
    for (let i = 0; i < 4; i++) {
      onShotHit(w, cur, b);
      cur = w.shots[w.shots.length - 1];
    }
    expect(w.shots.length).toBe(3);
  });

  it('Pratfall trips walking foes (never bosses) and stuns them', () => {
    const w = world();
    onFloorStart(w, game({ pratfall: 5 }));
    const m = firstMob(w);
    m.awake = true;
    m.moving = true;
    w.rng = fixedRng([0]);
    onTick(w, 1 / 30);
    expect(m.stunT).toBeCloseTo(CHANCE.pratfall.stun, 9);
    expect(w.texts.some((t) => t.text === 'TRIP!')).toBe(true);
    const b = w.mobs.find((x) => x !== m && !x.dead)!;
    b.boss = true;
    b.awake = true;
    b.moving = true;
    onTick(w, 1);
    expect(b.stunT).toBe(0);
  });

  it('Wild Magic casts a random spell from the kits, then waits before that knight can again', () => {
    const w = world();
    onFloorStart(w, game({ wildMagic: 5 }));
    const h = w.heroes[0];
    const m = firstMob(w);
    w.rng = fixedRng([0]);
    const areas = w.areas.length;
    onHeroHit(w, h, m, 10);
    expect(w.areas.length + w.shots.length).toBeGreaterThan(areas);
    const n = w.areas.length + w.shots.length;
    onHeroHit(w, h, m, 10);
    expect(w.areas.length + w.shots.length).toBe(n);
    for (const spell of WILD_SPELLS) {
      const w2 = world();
      const before = w2.areas.length + w2.shots.length;
      const hp = w2.heroes.map((x) => (x.hp = x.maxHp * 0.5));
      const t = firstMob(w2);
      t.x = w2.heroes[0].x + 12;
      t.y = w2.heroes[0].y;
      const tHp = t.hp;
      expect(castWildMagic(w2, w2.heroes[0], t, spell)).toBe(spell);
      // Nothing is hit there and then (it runs inside World.damage): spells land as areas and shots.
      expect(t.hp, spell).toBe(tHp);
      const changed = w2.areas.length + w2.shots.length > before || w2.heroes.some((x, i) => x.hp > hp[i]);
      expect(changed, spell).toBe(true);
      if (spell === 'light') continue;
      for (let k = 0; k < 40; k++) w2.update(1 / 30);
      expect(t.hp < tHp || t.dead, spell).toBe(true);
    }
  });

  it('play out the same for the same seed', () => {
    const run = () => {
      const w = world();
      onFloorStart(w, game({ luckyStrike: 6, doubleOrNothing: 4, coinShower: 5, butterfingers: 5, pratfall: 5 }));
      const out: number[] = [];
      const h = w.heroes[0];
      for (let i = 0; i < 200; i++) {
        const m = w.mobs[i % w.mobs.length];
        m.awake = true;
        m.moving = true;
        out.push(onHeroHit(w, h, m, 10), onHeroHurt(w, h, 1, m));
        onTick(w, 1 / 30);
      }
      onKill(w, firstMob(w));
      return [...out, w.pickups.length, w.rng.state];
    };
    expect(run()).toEqual(run());
  });
});
