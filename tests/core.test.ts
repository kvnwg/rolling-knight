import { describe, expect, it } from 'vitest';
import { BAL } from '../src/core/balance';
import { KNIGHTS, knightId } from '../src/core/knights';
import { currentLuck, oneInFor } from '../src/core/luck';
import { canRebirth, checkpointFor, newGame, rebirth } from '../src/core/newGame';
import { rollPerk } from '../src/core/perks';
import { RARITIES, RARITY_ODDS, RARITY_STAT, rarityAtLeast, rarityChances, rollRarity } from '../src/core/rarity';
import { Rng } from '../src/core/rng';
import { chainFloor, comboSteps, performSpin, reelCount, rollTokens, spinCycle, tokenMult } from '../src/core/roller';
import { addKnight, benchKnight, bestSquad, dupeGold, fillSquad, knightPower, levelCost, levelMult, levelUp, sanitizeSquad, setSquadSlot, soloBonus, squadSlots } from '../src/core/roster';
import { mend } from '../src/core/save';
import type { GameState } from '../src/core/state';

function done(seed = 1): GameState {
  const s = newGame(seed);
  s.roll.tutorial = 'done';
  return s;
}

describe('rarity', () => {
  it('has 13 tiers, each rarer than the last', () => {
    expect(RARITIES.length).toBe(14);
    for (let i = 2; i < RARITIES.length; i++) expect(RARITY_ODDS[RARITIES[i]]).toBeGreaterThan(RARITY_ODDS[RARITIES[i - 1]]);
  });

  it('chances add to 1 and match the luck ÷ X table', () => {
    for (const luck of [1, 5, 50]) {
      const c = rarityChances(luck);
      expect(Object.values(c).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
    // At luck 1 the Legendary roll itself is 1 in 1,000 (before rarer tiers are tried).
    expect(rarityChances(1).legendary).toBeCloseTo((1 / 1000) * [...RARITIES].slice(5).reduce((p, r) => p * (1 - 1 / RARITY_ODDS[r]), 1), 9);
  });

  it('stops dropping a tier once luck reaches the tier above it', () => {
    expect(rarityChances(3).common).toBe(0);
    expect(rarityChances(12).uncommon).toBe(0);
    expect(rarityChances(80).rare).toBe(0);
  });

  it('rolls within 1% of the exact odds over 20,000 rolls', () => {
    const rng = new Rng(7);
    const n = 20000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const r = rollRarity(5, rng);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    const exact = rarityChances(5);
    for (const r of ['uncommon', 'rare', 'epic'] as const) expect(Math.abs((counts[r] ?? 0) / n - exact[r])).toBeLessThan(0.01);
  });
});

describe('reels', () => {
  it('starts at 3.5 s a cycle, never under 0.7 s from Spin Speed', () => {
    const s = done();
    expect(spinCycle(s)).toBeCloseTo(3.5, 5);
    s.upgrades.spinSpeed = 8;
    expect(spinCycle(s)).toBeGreaterThanOrEqual(0.7);
    expect(spinCycle(s)).toBeLessThan(1.2);
    s.perks = ['greasedGears'];
    expect(spinCycle(s)).toBeLessThan(0.7);
  });

  it('adds reels up to 5', () => {
    const s = done();
    expect(reelCount(s)).toBe(1);
    s.upgrades.extraReel = 4;
    s.perks = ['bootlegReel'];
    expect(reelCount(s)).toBe(5);
  });

  it('chains tokens and multiplies combos', () => {
    const all = [[2, 5], [5], []];
    expect(comboSteps(all)).toEqual([0]);
    expect(tokenMult(all, 0, [0])).toBe(10 * 5);
    expect(tokenMult(all, 1, [0])).toBe(10);
    expect(chainFloor(25)).toBe('epic');
    expect(chainFloor(50)).toBe('legendary');
    expect(chainFloor(250)).toBe('mythic');
    expect(chainFloor(10)).toBeNull();
  });

  it('lands a first token about 5% of the time and chains at 50%', () => {
    const rng = new Rng(3);
    let any = 0;
    let chained = 0;
    for (let i = 0; i < 40000; i++) {
      const t = rollTokens(rng, 0.05);
      if (t.length) any++;
      if (t.length >= 2) chained++;
    }
    expect(any / 40000).toBeGreaterThan(0.045);
    expect(any / 40000).toBeLessThan(0.055);
    expect(chained / any).toBeGreaterThan(0.45);
    expect(chained / any).toBeLessThan(0.55);
  });

  it('starts on ordinary rolls: quick spins until there is a squad, no scripted finds', () => {
    const s = newGame(5);
    const rng = new Rng(5);
    const got: string[] = [];
    for (let i = 0; i < 12 && s.roll.tutorial !== 'done'; i++) {
      got.push(...performSpin(s, rng, Date.now()).map((r) => r.rarity));
      // (The start ends as the knights land: rollTick checks the roster.)
      if (Object.keys(s.roster).length >= BAL.tutorial.knights) s.roll.tutorial = 'done';
    }
    expect(Object.keys(s.roster).length).toBeGreaterThanOrEqual(BAL.tutorial.knights);
    // Three slots from the start: the first three knights fill them.
    expect(s.squad.filter(Boolean).length).toBe(3);
    // Ordinary low rolls: nothing above Rare at the start's luck.
    for (const r of got) expect(rarityAtLeast(r as never, 'epic'), r).toBe(false);
  });

  it('guarantees an Epic after 40 dry rolls', () => {
    const s = done(9);
    const rng = new Rng(9);
    s.roll.dry = BAL.roll.pity.drySpell;
    const r = performSpin(s, rng, Date.now())[0];
    expect(rarityAtLeast(r.rarity, 'epic')).toBe(true);
  });

  it('every 10th spin is lucky', () => {
    const s = done(2);
    const rng = new Rng(2);
    let lucky = 0;
    for (let i = 0; i < 100; i++) {
      const before = s.roll.sinceLucky;
      performSpin(s, rng, Date.now());
      if (s.roll.sinceLucky === 0 && before === 9) lucky++;
    }
    expect(lucky).toBe(10);
  });
});

describe('roster', () => {
  it('has a knight per class per tier, and one Absolute knight: Kevin', () => {
    expect(KNIGHTS.length).toBe(13 * 6 + 1);
    const top = KNIGHTS.filter((k) => k.rarity === 'absolute');
    expect(top.map((k) => k.name)).toEqual(['Kevin']);
    expect(RARITY_STAT.absolute).toBeGreaterThan(RARITY_STAT.primordial * 3);
  });

  it('turns a repeat straight into gold (a better mutation it rolled with sticks)', () => {
    const s = done();
    const id = knightId('common', 'blade');
    expect(addKnight(s, id, null).kind).toBe('new');
    const each = dupeGold(s, id);
    const r = addKnight(s, id, 'gilded');
    expect(r).toEqual({ kind: 'dupe', gold: each, mutationUp: true });
    expect(s.gold).toBe(each);
    expect(s.roster[id].mutation).toBe('gilded');
    expect(s.roster[id].copies).toBe(2);
  });

  it('levels up with gold alone, more for rarer knights', () => {
    const s = done();
    const id = knightId('rare', 'ranger');
    addKnight(s, id, null);
    s.gold = 1e6;
    const p = knightPower(s, s.roster[id]);
    expect(levelUp(s, id)).toBe(true);
    expect(s.roster[id].level).toBe(2);
    expect(knightPower(s, s.roster[id])).toBeGreaterThan(p);
    addKnight(s, knightId('common', 'ranger'), null);
    addKnight(s, knightId('legendary', 'ranger'), null);
    // Much, much more for a higher tier: a Legendary over 10x a Common at the same level.
    expect(levelCost(s, knightId('legendary', 'ranger'))).toBeGreaterThan(10 * levelCost(s, knightId('common', 'ranger')));
    s.gold = 0;
    expect(levelUp(s, id)).toBe(false);
  });

  it("cashes an old save's spare copies and shards in as gold", () => {
    const old = done();
    const id = knightId('epic', 'cleric');
    addKnight(old, id, null);
    const raw = JSON.parse(JSON.stringify(old));
    raw.roster[id].dupes = 3;
    raw.roster[id].shards = 4;
    raw.dupeRules = { common: 'sell' };
    const s = mend(raw);
    expect(s.gold).toBe(3 * dupeGold(s, id) + Math.round(4 * dupeGold(s, id) * 0.5));
    expect('dupes' in s.roster[id]).toBe(false);
    expect('shards' in s.roster[id]).toBe(false);
    expect('dupeRules' in s).toBe(false);
  });

  it('Humble Beginnings makes Common level-ups 3x as effective', () => {
    const s = done();
    const before = levelMult(s, 'common', 11) - 1;
    s.rebirths = 1;
    s.sigils = 5;
    // (The first perk in the roll, a draw of 0, is Hand-Me-Downs; this one's a Rare find.)
    expect(rollPerk(s, () => 0)?.perk.id).toBe('handMeDowns');
    s.perks.push('humbleBeginnings');
    expect(levelMult(s, 'common', 11) - 1).toBeCloseTo(before * 3, 9);
    expect(levelMult(s, 'legendary', 11) - 1).toBeCloseTo(before, 9);
  });

  it('shows the 1 in X with mutations', () => {
    expect(oneInFor('legendary', null)).toBeGreaterThan(900);
    expect(oneInFor('legendary', 'gilded')).toBeGreaterThan(oneInFor('legendary', null) * 20);
  });
});

describe('rebirth', () => {
  it('needs floor 30, wipes the run and keeps the codex', () => {
    const s = done();
    addKnight(s, knightId('epic', 'blade'), null);
    s.gold = 999;
    expect(canRebirth(s)).toBe(false);
    // (Not after a few minutes' play: floor 15 used to open it.)
    s.run.bestFloor = 29;
    expect(canRebirth(s)).toBe(false);
    s.run.bestFloor = 30;
    const luck = currentLuck(s, Date.now());
    expect(rebirth(s)).toBe(true);
    expect(s.rebirths).toBe(1);
    expect(s.gold).toBe(0);
    expect(Object.keys(s.roster)).toHaveLength(0);
    expect(Object.keys(s.codex)).toHaveLength(1);
    expect(currentLuck(s, Date.now())).toBeCloseTo(luck * 1.25, 5);
    expect(s.sigils).toBe(1);
  });
});

describe('checkpoints', () => {
  it('save the run every 10 floors: a wipe on floor 25 goes back to 20, before floor 10 to the start', () => {
    expect(checkpointFor(25)).toBe(20);
    expect(checkpointFor(20)).toBe(20);
    expect(checkpointFor(29)).toBe(20);
    expect(checkpointFor(30)).toBe(30);
    expect(checkpointFor(10)).toBe(10);
    expect(checkpointFor(9)).toBe(1);
    expect(checkpointFor(1)).toBe(1);
  });
});

describe('squad slots', () => {
  it('are all three open from the start', () => {
    expect(squadSlots({ rebirths: 0 })).toBe(3);
    expect(squadSlots({ rebirths: 9 })).toBe(3);
  });

  it("take a whole squad of three on a new game (filling, best squad, putting one in), and keep a save's three", () => {
    const s = newGame(3);
    for (const id of [knightId('common', 'guardian'), knightId('rare', 'blade'), knightId('epic', 'ranger')]) addKnight(s, id, null);
    s.squad = [null, null, null];
    fillSquad(s);
    expect(s.squad.filter(Boolean).length).toBe(3);
    bestSquad(s);
    expect(s.squad[0]).toBe(knightId('epic', 'ranger'));
    expect(s.squad.filter(Boolean).length).toBe(3);
    setSquadSlot(s, 1, knightId('rare', 'blade'));
    expect(s.squad[1]).toBe(knightId('rare', 'blade'));
    // A save's three knights stay, the one played too.
    s.squad = [knightId('common', 'guardian'), knightId('rare', 'blade'), knightId('epic', 'ranger')];
    s.controlled = 2;
    sanitizeSquad(s);
    expect(s.squad).toEqual([knightId('common', 'guardian'), knightId('rare', 'blade'), knightId('epic', 'ranger')]);
    expect(s.controlled).toBe(2);
  });

  it('stay empty once you empty them (the hub doesn\'t refill them) until you put someone in or pick the best squad', () => {
    const s = newGame(6);
    for (const id of [knightId('rare', 'guardian'), knightId('rare', 'blade'), knightId('rare', 'ranger')]) addKnight(s, id, null);
    s.rebirths = 2;
    bestSquad(s);
    expect(s.squad.filter(Boolean).length).toBe(3);
    s.controlled = 1;
    expect(benchKnight(s, 1)).toBe(true);
    expect(benchKnight(s, 2)).toBe(true);
    // The last one stays: somebody goes down.
    expect(benchKnight(s, 0)).toBe(false);
    expect(s.squad.filter(Boolean).length).toBe(1);
    expect(s.controlled).toBe(0);
    fillSquad(s);
    expect(s.squad.filter(Boolean).length).toBe(1);
    expect(soloBonus(s)).toBeCloseTo(2, 9);
    setSquadSlot(s, 2, knightId('rare', 'blade'));
    fillSquad(s);
    expect(s.squad.filter(Boolean).length).toBe(2);
    bestSquad(s);
    expect(s.squad.filter(Boolean).length).toBe(3);
  });

  it('pay more gold going down short-handed: half again for every open slot left empty', () => {
    const s = newGame(4);
    for (const id of [knightId('rare', 'guardian'), knightId('rare', 'blade'), knightId('rare', 'ranger')]) addKnight(s, id, null);
    s.rebirths = 2;
    s.squad = [knightId('rare', 'guardian'), null, null];
    expect(soloBonus(s)).toBeCloseTo(2, 9);
    s.squad = [knightId('rare', 'guardian'), knightId('rare', 'blade'), null];
    expect(soloBonus(s)).toBeCloseTo(1.5, 9);
    s.squad = [knightId('rare', 'guardian'), knightId('rare', 'blade'), knightId('rare', 'ranger')];
    expect(soloBonus(s)).toBe(1);
    // A new game has all three slots, so going down alone pays double there too.
    s.rebirths = 0;
    s.squad = [knightId('rare', 'guardian'), null, null];
    expect(soloBonus(s)).toBeCloseTo(2, 9);
  });
});
