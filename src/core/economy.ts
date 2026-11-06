/**
 * The economy's run scale. Every rebirth sends the next run ten floors deeper, where a kill pays
 * goldGrowth^10 times as much: so every price in a run (the tinker's tiers, combat rolls, the
 * knights' levels) is `BAL.economy.runPriceGrowth` times what it was the run before. Each run then
 * costs about what its depth pays, and the rebirth's own gold, luck and power are what make it go
 * faster than the last. (Merchants' wares, reforging and duplicates are priced from the floor you're
 * on or your best, so they scale already.)
 *
 * tools/econ.ts plays the game through several runs to check the pace (tests/economy.test.ts holds
 * the targets).
 */
import { BAL } from './balance';
import type { GameState } from './state';

/** Every price in this run, times this. */
export function priceScale(state: Partial<Pick<GameState, 'rebirths'>>): number {
  return Math.pow(BAL.economy.runPriceGrowth, Math.max(0, state.rebirths ?? 0));
}
