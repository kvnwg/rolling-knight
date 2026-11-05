import { describe, expect, it } from 'vitest';
import { KNIGHTS } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { addKnight, canReforge, reforge, reforgeCost, reforgeOdds } from '../src/core/roster';

const id = KNIGHTS.find((k) => k.rarity === 'rare')!.id;

describe("the smith's reforge", () => {
  it('costs gold that climbs with every reforge, and more for rarer knights', () => {
    const s = newGame(3);
    addKnight(s, id, null);
    s.gold = 1e12;
    const first = reforgeCost(s, id);
    reforge(s, id, () => 0.99);
    expect(reforgeCost(s, id)).toBeGreaterThan(first);
    const epic = KNIGHTS.find((k) => k.rarity === 'epic')!.id;
    addKnight(s, epic, null);
    expect(reforgeCost(s, epic)).toBeGreaterThan(first);
  });

  it('never makes a knight worse, and a better roll sticks', () => {
    const s = newGame(4);
    addKnight(s, id, null);
    s.gold = 1e12;
    s.roster[id].mutation = 'shadow';
    // A roll that lands Gilded (worse than Shadow) changes nothing.
    const gildedOnly = (() => {
      const odds = reforgeOdds();
      let n = 0;
      // Fail void, radiant and shadow; pass gilded.
      return () => (n++ < odds.length - 1 ? 0.999 : 0);
    })();
    const r1 = reforge(s, id, gildedOnly)!;
    expect(r1.rolled).toBe('gilded');
    expect(r1.improved).toBe(false);
    expect(s.roster[id].mutation).toBe('shadow');
    // Landing Void (the first, rarest check) upgrades it.
    const r2 = reforge(s, id, () => 0)!;
    expect(r2.rolled).toBe('void');
    expect(r2.improved).toBe(true);
    expect(s.roster[id].mutation).toBe('void');
    expect(canReforge(s, id)).toBe(false);
  });

  it("can't be paid for without the gold", () => {
    const s = newGame(5);
    addKnight(s, id, null);
    s.gold = 0;
    expect(canReforge(s, id)).toBe(false);
    expect(reforge(s, id, () => 0)).toBeNull();
  });
});
