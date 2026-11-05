/**
 * Spare copies (each knight is owned once; later pulls of it are its spares), the per-knight Break
 * down / Sell that only ever take spares, the scrap dealer's every-spare-at-once, the 30-second NEW
 * tag, and the short odds the cards show.
 */
import { describe, expect, it } from 'vitest';
import { knightId } from '../src/core/knights';
import { newGame, rebirth } from '../src/core/newGame';
import { RARITIES, RARITY_ODDS } from '../src/core/rarity';
import {
  NEW_FOR_MS, addKnight, isNewKnight, sellAll, sellDupes, sellValue, shardAll, shardDupes, spareList, spareYield, totalDupes,
} from '../src/core/roster';
import { mend } from '../src/core/save';
import type { GameState } from '../src/core/state';
import { oneInShort, short } from '../src/ui/format';

const T0 = 1_700_000_000_000;

function done(seed = 1): GameState {
  const s = newGame(seed);
  s.roll.tutorial = 'done';
  return s;
}

/** Pulls knight `id` once, then `spares` more times: you own it once and hold that many spares. */
function own(s: GameState, id: string, spares: number, at = T0): void {
  for (let i = 0; i <= spares; i++) addKnight(s, id, null, at);
}

const blade = knightId('rare', 'blade');
const cleric = knightId('epic', 'cleric');

describe('spare copies, one knight at a time', () => {
  it('a repeat pull is a spare copy; the first pull is the knight', () => {
    const s = done();
    own(s, blade, 3);
    expect(Object.keys(s.roster)).toEqual([blade]);
    expect(s.roster[blade].dupes).toBe(3);
    expect(s.roster[blade].copies).toBe(4);
  });

  it('Break down 1 turns one spare into shards for that knight; the knight stays', () => {
    const s = done();
    own(s, blade, 4);
    const level = s.roster[blade].level;
    expect(shardDupes(s, blade, 1)).toBe(1);
    expect(s.roster[blade]).toBeDefined();
    expect(s.roster[blade].dupes).toBe(3);
    expect(s.roster[blade].shards).toBe(1);
    expect(s.roster[blade].level).toBe(level);
    expect(s.roster[blade].copies).toBe(5);
  });

  it('Break down all takes every spare and nothing more', () => {
    const s = done();
    own(s, blade, 4);
    expect(shardDupes(s, blade)).toBe(4);
    expect(s.roster[blade].dupes).toBe(0);
    expect(s.roster[blade].shards).toBe(4);
    // Again, with none left: nothing happens and the knight is still yours.
    expect(shardDupes(s, blade)).toBe(0);
    expect(s.roster[blade].shards).toBe(4);
    expect(s.roster[blade]).toBeDefined();
  });

  it('Sell 1 and Sell all pay gold for spares only; the knight itself is never sold', () => {
    const s = done();
    own(s, cleric, 3);
    const each = sellValue(s, cleric);
    expect(sellDupes(s, cleric, 1)).toBe(each);
    expect(s.gold).toBe(each);
    expect(s.roster[cleric].dupes).toBe(2);
    expect(sellDupes(s, cleric)).toBe(each * 2);
    expect(s.gold).toBe(each * 3);
    expect(s.roster[cleric].dupes).toBe(0);
    // No spares: selling does nothing at all.
    expect(sellDupes(s, cleric)).toBe(0);
    expect(sellDupes(s, cleric, 1)).toBe(0);
    expect(s.gold).toBe(each * 3);
    expect(s.roster[cleric]).toBeDefined();
    expect(s.squad).toContain(cleric);
  });

  it('a knight with no spares can be neither broken down nor sold', () => {
    const s = done();
    own(s, blade, 0);
    expect(shardDupes(s, blade, 1)).toBe(0);
    expect(sellDupes(s, blade, 1)).toBe(0);
    expect(s.gold).toBe(0);
    expect(s.roster[blade]).toMatchObject({ dupes: 0, shards: 0, level: 1 });
  });

  it('takes what there is, and odd requests take nothing', () => {
    const s = done();
    own(s, blade, 2);
    for (const n of [0, -3, Number.NaN, 0.5]) {
      expect(shardDupes(s, blade, n)).toBe(0);
      expect(sellDupes(s, blade, n)).toBe(0);
    }
    expect(s.roster[blade].dupes).toBe(2);
    expect(shardDupes(s, blade, 1.9)).toBe(1);
    expect(sellDupes(s, blade, 99)).toBe(sellValue(s, blade));
    expect(s.roster[blade].dupes).toBe(0);
    expect(shardDupes(s, 'common-nobody', 1)).toBe(0);
    expect(sellDupes(s, 'common-nobody', 1)).toBe(0);
  });

  it("never touches another knight's spares", () => {
    const s = done();
    own(s, blade, 3);
    own(s, cleric, 5);
    shardDupes(s, blade);
    sellDupes(s, blade);
    expect(s.roster[cleric].dupes).toBe(5);
    expect(s.roster[cleric].shards).toBe(0);
  });

  it('spareYield says exactly what each button gives', () => {
    const s = done();
    own(s, cleric, 4);
    const one = spareYield(s, cleric, 1);
    const all = spareYield(s, cleric);
    expect(one).toEqual({ copies: 1, shards: 1, gold: sellValue(s, cleric) });
    expect(all).toEqual({ copies: 4, shards: 4, gold: sellValue(s, cleric) * 4 });
    expect(spareYield(s, blade)).toEqual({ copies: 0, shards: 0, gold: 0 });
    const a = done();
    own(a, cleric, 4);
    expect(shardDupes(a, cleric, 1)).toBe(one.shards);
    expect(sellDupes(a, cleric)).toBe(spareYield(s, cleric, 3).gold);
  });

  it('Peasant Levy: a Common spare breaks into 2 shards, and the button says so', () => {
    const s = done();
    s.perks.push('peasantLevy');
    const common = knightId('common', 'ranger');
    own(s, common, 2);
    expect(spareYield(s, common, 1).shards).toBe(2);
    expect(shardDupes(s, common, 1)).toBe(2);
    expect(s.roster[common].shards).toBe(2);
  });

  it("Hand-Me-Downs: shards for the knight's classmates too, never their spares", () => {
    const s = done();
    s.perks.push('handMeDowns');
    const other = knightId('common', 'blade');
    own(s, blade, 2);
    own(s, other, 1);
    expect(shardDupes(s, blade)).toBe(2);
    expect(s.roster[other].shards).toBe(2);
    expect(s.roster[other].dupes).toBe(1);
  });

  it("a rebirth's Heirloom keeps its knight (its spares go with the run)", () => {
    const s = done();
    own(s, blade, 2);
    s.perks.push('heirloom');
    s.squad = [blade, null, null];
    s.controlled = 0;
    s.run.bestFloor = 99;
    expect(rebirth(s)).toBe(true);
    expect(Object.keys(s.roster)).toEqual([blade]);
    expect(s.roster[blade].dupes).toBe(0);
  });
});

describe("the scrap dealer's every spare at once", () => {
  it('lists every knight with spares (most first) and what all of them give', () => {
    const s = done();
    own(s, blade, 2);
    own(s, cleric, 5);
    own(s, knightId('common', 'guardian'), 0);
    const list = spareList(s);
    expect(list.map((x) => x.id)).toEqual([cleric, blade]);
    expect(list[0]).toEqual({ id: cleric, ...spareYield(s, cleric) });
    expect(list.reduce((a, x) => a + x.copies, 0)).toBe(totalDupes(s));
  });

  it('sells or breaks down only spares: every knight stays', () => {
    const s = done();
    own(s, blade, 2);
    own(s, cleric, 5);
    own(s, knightId('common', 'guardian'), 0);
    const owned = Object.keys(s.roster).sort();
    const gold = spareList(s).reduce((a, x) => a + x.gold, 0);
    expect(sellAll(s)).toBe(gold);
    expect(Object.keys(s.roster).sort()).toEqual(owned);
    expect(totalDupes(s)).toBe(0);
    own(s, blade, 1);
    s.roster[blade].dupes = 3;
    expect(shardAll(s)).toBe(3);
    expect(Object.keys(s.roster).sort()).toEqual(owned);
    expect(spareList(s)).toEqual([]);
  });
});

describe('NEW: only for 30 seconds of real time after a knight first joins', () => {
  it('stamps the wall clock when a knight first joins, not when a spare lands', () => {
    const s = done();
    addKnight(s, blade, null, T0);
    expect(s.roster[blade].gotAt).toBe(T0);
    addKnight(s, blade, null, T0 + 20_000);
    expect(s.roster[blade].gotAt).toBe(T0);
  });

  it('shows NEW within 30 s, and never again after', () => {
    const s = done();
    addKnight(s, blade, null, T0);
    const rec = s.roster[blade];
    expect(NEW_FOR_MS).toBe(30_000);
    expect(isNewKnight(rec, T0)).toBe(true);
    expect(isNewKnight(rec, T0 + 29_999)).toBe(true);
    expect(isNewKnight(rec, T0 + 30_000)).toBe(false);
    expect(isNewKnight(rec, T0 + 3_600_000)).toBe(false);
    // A clock set back before the stamp doesn't bring it back either.
    expect(isNewKnight(rec, T0 - 1)).toBe(false);
    expect(isNewKnight(undefined, T0)).toBe(false);
  });

  it('knights from older saves never show NEW, and their old flag goes', () => {
    const s = done();
    own(s, blade, 1);
    // An older save: knights flagged NEW until opened, no wall-clock stamp.
    const raw = JSON.parse(JSON.stringify(s));
    for (const rec of Object.values(raw.roster) as Array<Record<string, unknown>>) {
      rec.isNew = true;
      delete rec.gotAt;
    }
    const loaded = mend(raw);
    expect(isNewKnight(loaded.roster[blade], Date.now())).toBe(false);
    expect('isNew' in loaded.roster[blade]).toBe(false);
    expect(loaded.roster[blade].dupes).toBe(1);
  });

  it('the stamp is saved: a knight that just joined is still NEW after a reload', () => {
    const s = done();
    const now = Date.now();
    addKnight(s, blade, null, now - 5_000);
    const loaded = mend(JSON.parse(JSON.stringify(s)));
    expect(loaded.roster[blade].gotAt).toBe(now - 5_000);
    expect(isNewKnight(loaded.roster[blade], now)).toBe(true);
  });
});

describe('short odds on the cards', () => {
  it('formats counts short', () => {
    expect(short(80)).toBe('80');
    expect(short(1000)).toBe('1K');
    expect(short(2500)).toBe('2.5K');
    expect(short(12_345)).toBe('12.3K');
    expect(short(150_000)).toBe('150K');
    expect(short(999_960)).toBe('1M');
    expect(short(25_000_000)).toBe('25M');
    expect(short(2_500_000_000)).toBe('2.5B');
  });

  it("gives every rarity's 1 in N as the altar's table has it, short", () => {
    expect(oneInShort(RARITY_ODDS.epic)).toBe('1 in 80');
    expect(oneInShort(RARITY_ODDS.legendary)).toBe('1 in 1K');
    expect(oneInShort(RARITY_ODDS.mythic)).toBe('1 in 25K');
    for (const r of RARITIES) {
      const text = oneInShort(RARITY_ODDS[r]);
      expect(text).toMatch(/^1 in \d+(\.\d)?[KMBT]?$/);
      expect(text.length).toBeLessThanOrEqual(10);
    }
    // The top tier's, in billions (one knight, 1 in 2.5 billion).
    expect(oneInShort(2_500_000_000)).toBe('1 in 2.5B');
  });
});
