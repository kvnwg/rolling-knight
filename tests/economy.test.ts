/**
 * The economy's pace (core/economy.ts, BAL.economy, BAL.offline, BAL.roster.sellKills). The whole
 * run-by-run pace is played out by tools/econ.ts (npm run econ); these hold the rules it rests on.
 */
import { describe, expect, it } from 'vitest';
import { BAL } from '../src/core/balance';
import { combatRollPrice } from '../src/core/combatRoll';
import { priceScale } from '../src/core/economy';
import { knightId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { runOffline } from '../src/core/offline';
import { Rng } from '../src/core/rng';
import { addKnight, dupeGold, killGold, levelCost } from '../src/core/roster';
import { upgradeCost } from '../src/core/upgrades';

const fresh = (rebirths = 0) => {
  const s = newGame(7);
  s.rebirths = rebirths;
  s.roll.tutorial = 'done';
  return s;
};

describe('the economy', () => {
  it('prices every run to its depth: each rebirth multiplies every price by the run scale', () => {
    const g = BAL.economy.runPriceGrowth;
    expect(g).toBeGreaterThan(1);
    // A rebirth's run goes ten floors deeper, where a kill pays goldGrowth^10: the scale stays under
    // that, so each run still goes a little faster than the last (with the rebirth's own gold on top).
    expect(g).toBeLessThan(Math.pow(BAL.dungeon.goldGrowth, BAL.rebirth.floorPer));
    for (const k of [1, 2, 3]) {
      const a = fresh(0);
      const b = fresh(k);
      expect(priceScale(b)).toBeCloseTo(Math.pow(g, k), 9);
      // (Prices are whole coins, or tidied to two figures for combat rolls.)
      const near = (x: number) => expect(Math.abs(x / Math.pow(g, k) - 1)).toBeLessThan(0.05);
      near(upgradeCost(b, 'luck') / upgradeCost(a, 'luck'));
      near(combatRollPrice(b) / combatRollPrice(a));
      const id = knightId('rare', 'guardian');
      addKnight(a, id, null, 0);
      addKnight(b, id, null, 0);
      near(levelCost(b, id) / levelCost(a, id));
    }
  });

  it("pays a night away from the fights' own rate, about an hour's worth, whatever gold piled up", () => {
    const s = fresh(1);
    s.stats.combatPerMinute = 1000;
    // A purse that grew fast (duplicates, a sale, nothing spent) doesn't count: only the fights do.
    s.stats.goldPerMinute = 1e9;
    const rep = runOffline(s, new Rng(3), 8 * 3600, 1_700_000_000_000)!;
    expect(rep.gold).toBe(Math.round(1000 * 8 * 60 * BAL.offline.efficiency));
    const minutesOfPlay = rep.gold / 1000;
    expect(minutesOfPlay).toBeGreaterThan(40);
    expect(minutesOfPlay).toBeLessThan(80);
  });

  it('a night away with Night Watch maxed is still only a few hours of play', () => {
    const s = fresh(1);
    s.upgrades.offline = 5;
    s.stats.combatPerMinute = 1000;
    const rep = runOffline(s, new Rng(3), 8 * 3600, 1_700_000_000_000)!;
    expect(rep.gold / 1000 / 60).toBeLessThan(3.5);
  });

  it('caps the night at 8 hours and the rolls it makes', () => {
    const s = fresh(1);
    s.stats.combatPerMinute = 1000;
    const rep = runOffline(s, new Rng(3), 48 * 3600, 1_700_000_000_000)!;
    expect(rep.seconds).toBe(BAL.offline.capHours * 3600);
    expect(rep.rolls).toBeLessThanOrEqual(BAL.offline.maxRolls);
  });

  it("turns duplicates into a few kills' worth of gold, a Legendary's about ten", () => {
    const s = fresh(0);
    s.run.bestFloor = 30;
    const kill = killGold(30);
    const worth = (rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic') => dupeGold(s, knightId(rarity, 'guardian')) / kill;
    expect(worth('common')).toBeLessThanOrEqual(1);
    expect(worth('rare')).toBeLessThanOrEqual(3);
    expect(worth('epic')).toBeLessThanOrEqual(5);
    expect(worth('legendary')).toBeCloseTo(BAL.roster.sellKills.legendary, 0);
    expect(worth('legendary')).toBeLessThanOrEqual(12);
    expect(worth('mythic')).toBeLessThanOrEqual(60);
  });
});
