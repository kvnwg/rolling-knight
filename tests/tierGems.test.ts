import { describe, expect, it } from 'vitest';
import { RARITIES } from '../src/core/rarity';
import { tierGem, tierGemRows } from '../src/render/art/tierGems';
import { tally } from '../src/ui/WelcomeBack';

describe('tier icons', () => {
  it('every rarity has a 12 x 12 icon, outlined in ink', () => {
    for (const r of RARITIES) {
      const rows = tierGemRows(r);
      expect(rows.length).toBe(12);
      for (const row of rows) expect(row.length).toBe(12);
      const b = tierGem(r);
      expect([b.w, b.h]).toEqual([12, 12]);
      expect(rows.join('')).toContain('k');
    }
  });

  it('no two tiers share a silhouette', () => {
    const shapes = RARITIES.map((r) => tierGemRows(r).map((row) => row.replace(/[^.]/g, '#')).join('/'));
    expect(new Set(shapes).size).toBe(RARITIES.length);
  });
});

describe('the welcome back tally', () => {
  it('counts the pulls by tier, rarest first, with the new ones', () => {
    const kept = [
      { knightId: 'a', rarity: 'common' as const, mutation: null, isNew: false },
      { knightId: 'b', rarity: 'common' as const, mutation: null, isNew: true },
      { knightId: 'c', rarity: 'legendary' as const, mutation: null, isNew: true },
      { knightId: 'd', rarity: 'rare' as const, mutation: null, isNew: false },
    ];
    expect(tally({ kept })).toEqual([
      { rarity: 'legendary', n: 1, fresh: 1 },
      { rarity: 'rare', n: 1, fresh: 0 },
      { rarity: 'common', n: 2, fresh: 1 },
    ]);
  });
});
