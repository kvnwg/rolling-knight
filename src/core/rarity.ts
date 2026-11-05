/**
 * Rarity tiers, rarest last. A roll tries tiers from rarest to commonest; each hits with a chance of
 * luck ÷ X (X is the tier's "1 in X" at luck 1), and the first hit wins. If nothing hits it's Common.
 * Side effect (as in Dumpster Legend): once luck reaches a tier's X, every tier below it stops dropping.
 */
import type { Rng } from './rng';

export const RARITIES = [
  'common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'ancient', 'exalted', 'celestial', 'astral', 'divine', 'eternal', 'primordial',
] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_ODDS: Record<Rarity, number> = {
  common: 1,
  uncommon: 3,
  rare: 12,
  epic: 80,
  legendary: 1000,
  mythic: 25_000,
  ancient: 60_000,
  exalted: 150_000,
  celestial: 400_000,
  astral: 1_000_000,
  divine: 5_000_000,
  eternal: 25_000_000,
  primordial: 250_000_000,
};

export const RARITY_NAME: Record<Rarity, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic', ancient: 'Ancient',
  exalted: 'Exalted', celestial: 'Celestial', astral: 'Astral', divine: 'Divine', eternal: 'Eternal', primordial: 'Primordial',
};

/** UI color per tier (Dumpster Legend's ladder: gray, green, blue, purple, gold, pink...). */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#a8a8b0',
  uncommon: '#5cc65a',
  rare: '#3d9cf0',
  epic: '#b05ae8',
  legendary: '#ffb81f',
  mythic: '#ff4fa3',
  ancient: '#d2884a',
  exalted: '#ff3b4e',
  celestial: '#38e8ff',
  astral: '#4dffb4',
  divine: '#fff4d6',
  eternal: '#c9b3ff',
  primordial: '#fff07a',
};

/** Base stat multiplier per tier (Dumpster Legend's rarity mults). */
export const RARITY_STAT: Record<Rarity, number> = {
  common: 1, uncommon: 1.4, rare: 2, epic: 3, legendary: 4.8, mythic: 8, ancient: 9.5, exalted: 11,
  celestial: 12.5, astral: 14, divine: 18, eternal: 23, primordial: 30,
};

export function rarityIndex(r: Rarity): number {
  return RARITIES.indexOf(r);
}

export function rarityAtLeast(r: Rarity, min: Rarity): boolean {
  return rarityIndex(r) >= rarityIndex(min);
}

export function higherRarity(a: Rarity | null, b: Rarity | null): Rarity | null {
  if (!a) return b;
  if (!b) return a;
  return rarityAtLeast(a, b) ? a : b;
}

/** Exact probability of each tier at `luck`, with nothing below `min`. */
export function rarityChances(luck: number, min: Rarity = 'common'): Record<Rarity, number> {
  const out = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  let remaining = 1;
  for (let i = RARITIES.length - 1; i >= 1; i--) {
    const r = RARITIES[i];
    if (!rarityAtLeast(r, min) || r === min) break;
    const p = Math.min(1, luck / RARITY_ODDS[r]);
    out[r] = remaining * p;
    remaining *= 1 - p;
  }
  out[min] += remaining;
  return out;
}

/** Rolls a tier: tried from rarest down; anything below `min` is never rolled. */
export function rollRarity(luck: number, rng: Rng, min: Rarity = 'common'): Rarity {
  for (let i = RARITIES.length - 1; i >= 1; i--) {
    const r = RARITIES[i];
    if (!rarityAtLeast(r, min) || r === min) break;
    if (rng.chance(Math.min(1, luck / RARITY_ODDS[r]))) return r;
  }
  return min;
}

/** "1 in X" of rolling exactly this tier at luck 1 (Common is about 1 in 1.6). */
export function tierOneIn(r: Rarity): number {
  return 1 / rarityChances(1)[r];
}

/** "1 in X" of this tier or better at `luck`: how rare a find is for you right now. */
export function tierOrBetterOneIn(r: Rarity, luck: number): number {
  const c = rarityChances(Math.max(1, luck));
  let p = 0;
  for (const t of RARITIES) if (rarityAtLeast(t, r)) p += c[t];
  return p > 0 ? 1 / p : Infinity;
}
