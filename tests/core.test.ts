import { describe, expect, it } from 'vitest';
import { BAL } from '../src/core/balance';
import { KNIGHTS, knightId } from '../src/core/knights';
import { currentLuck, oneInFor } from '../src/core/luck';
import { canRebirth, newGame, rebirth } from '../src/core/newGame';
import { buyPerk } from '../src/core/perks';
import { RARITIES, RARITY_ODDS, rarityAtLeast, rarityChances, rollRarity } from '../src/core/rarity';
import { Rng } from '../src/core/rng';
import { chainFloor, comboSteps, performSpin, reelCount, rollTokens, spinCycle, tokenMult } from '../src/core/roller';
import { addKnight, knightPower, levelMult, levelUp, sellDupes, shardDupes } from '../src/core/roster';
import type { GameState } from '../src/core/state';

function done(seed = 1): GameState {
  const s = newGame(seed);
  s.roll.tutorial = 'done';
  return s;
}

describe('rarity', () => {
  it('has 13 tiers, each rarer than the last', () => {
    expect(RARITIES.length).toBe(13);
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

  it('runs the tutorial: Common, Uncommon, Rare, then a Legendary', () => {
    const s = newGame(5);
    const rng = new Rng(5);
    const got = [0, 1, 2, 3].map(() => performSpin(s, rng, Date.now())[0]);
    expect(got.map((r) => r.rarity)).toEqual(['common', 'uncommon', 'rare', 'legendary']);
    expect(s.squad.filter(Boolean).length).toBe(3);
    expect(s.roll.tutorial).toBe('beginner');
    // Beginner's luck: a x3 then x5 chain into an Exalted, when its moment comes.
    s.roll.beginnerAt = 0;
    const b = performSpin(s, rng, Date.now())[0];
    expect(b.tokens).toEqual([3, 5]);
    expect(b.rarity).toBe('exalted');
    expect(b.scripted).toBe('beginner');
    expect(s.roll.tutorial).toBe('done');
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
  it('has a knight per class per tier', () => {
    expect(KNIGHTS.length).toBe(13 * 6);
  });

  it('turns repeats into duplicates you can shard or sell', () => {
    const s = done();
    const id = knightId('common', 'blade');
    expect(addKnight(s, id, null).kind).toBe('new');
    addKnight(s, id, null);
    addKnight(s, id, null);
    expect(s.roster[id].dupes).toBe(2);
    expect(shardDupes(s, id, 1)).toBe(1);
    expect(s.roster[id].shards).toBe(1);
    const g = sellDupes(s, id);
    expect(g).toBeGreaterThan(0);
    expect(s.gold).toBe(g);
    expect(s.roster[id].dupes).toBe(0);
  });

  it('levels up with shards and gold', () => {
    const s = done();
    const id = knightId('rare', 'ranger');
    addKnight(s, id, null);
    s.roster[id].shards = 10;
    s.gold = 1e6;
    const p = knightPower(s, s.roster[id]);
    expect(levelUp(s, id)).toBe(true);
    expect(s.roster[id].level).toBe(2);
    expect(knightPower(s, s.roster[id])).toBeGreaterThan(p);
  });

  it('Humble Beginnings makes Common level-ups 3x as effective', () => {
    const s = done();
    const before = levelMult(s, 'common', 11) - 1;
    s.rebirths = 1;
    s.sigils = 5;
    expect(buyPerk(s, 'humbleBeginnings')).toBe(true);
    expect(levelMult(s, 'common', 11) - 1).toBeCloseTo(before * 3, 9);
    expect(levelMult(s, 'legendary', 11) - 1).toBeCloseTo(before, 9);
  });

  it('shows the 1 in X with mutations', () => {
    expect(oneInFor('legendary', null)).toBeGreaterThan(900);
    expect(oneInFor('legendary', 'gilded')).toBeGreaterThan(oneInFor('legendary', null) * 20);
  });
});

describe('rebirth', () => {
  it('needs floor 10, wipes the run and keeps the codex', () => {
    const s = done();
    addKnight(s, knightId('epic', 'blade'), null);
    s.gold = 999;
    expect(canRebirth(s)).toBe(false);
    s.run.bestFloor = 10;
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
