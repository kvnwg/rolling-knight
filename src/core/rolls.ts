/**
 * What the keepers' rolls share: the tinker's combat rolls (combatRoll.ts) and the sage's perk rolls
 * (perks.ts). Each roll pays its price and lands on one thing from a pool, picked by weight; how rare
 * that thing is (common to legendary, the altar's first five rarities) sets its reel's drama and color.
 */
import type { Rarity } from './rarity';

/** How rare a roll's result is, commonest first. */
export const ROLL_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const satisfies readonly Rarity[];
export type RollRarity = (typeof ROLL_RARITIES)[number];

/** 0 for Common up to 4 for Legendary. */
export function rollRarityIndex(r: RollRarity): number {
  return ROLL_RARITIES.indexOf(r);
}

/**
 * Picks one entry in proportion to its weight, with `u` uniform in [0, 1). Entries weighing 0 (or
 * less) never win; null when nothing weighs anything.
 */
export function pickWeighted<T extends { weight: number }>(entries: readonly T[], u: number): T | null {
  let total = 0;
  for (const e of entries) total += Math.max(0, e.weight);
  if (!(total > 0)) return null;
  let r = Math.min(Math.max(0, u), 1 - 1e-12) * total;
  let last: T | null = null;
  for (const e of entries) {
    if (!(e.weight > 0)) continue;
    last = e;
    r -= e.weight;
    if (r < 0) return e;
  }
  return last;
}

/** A price to two figures (1,234 is 1,200; 98,765 is 99,000), so the button reads cleanly. */
export function tidyPrice(n: number): number {
  if (!(n > 0)) return 0;
  if (n < 100) return Math.round(n);
  const step = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / step) * step;
}
