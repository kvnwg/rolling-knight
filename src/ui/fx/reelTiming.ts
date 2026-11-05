/**
 * When each reel of a spin stops (ported from Dumpster Legend's reelTiming.ts, on Rolling Knight's
 * clock): the core decides it, each reel landing its knight at `landAt` seconds into the spin. A reel
 * with luck tokens stops on each token first, one token step (`spin.stepSeconds`: the hold plus a whole
 * spin's length) apart, so it never shows a result before the core has it.
 */
import { BAL } from '../../core/balance';
import { comboValue, tokenMult } from '../../core/roller';
import type { Spin } from '../../core/state';

export interface ReelStop {
  /** Milliseconds after the spin starts. */
  at: number;
  /** The token's multiplier, or null for the knight. */
  token: number | null;
}

/** How long a reel holds on a luck token before rolling again (ms). */
export function tokenHoldMs(): number {
  return BAL.roll.tokens.holdSeconds * 1000;
}

/** Every stop of reel `i`: its tokens in order, then its knight (the last entry). */
export function reelStops(spin: Spin, i: number): ReelStop[] {
  const r = spin.reels[i];
  const step = spin.stepSeconds * 1000;
  const land = r.landAt * 1000;
  const first = land - r.tokens.length * step;
  const stops: ReelStop[] = r.tokens.map((x, j) => ({ at: first + j * step, token: x }));
  stops.push({ at: land, token: null });
  return stops;
}

/** The reels in combo step `k` (those landing a token then), each one's token, and their product. */
export function comboOf(mults: ReadonlyArray<readonly number[]>, k: number): { reels: number[]; values: number[]; product: number } {
  const reels = mults.map((m, i) => (m.length > k ? i : -1)).filter((i) => i >= 0);
  return { reels, values: reels.map((i) => mults[i][k]), product: comboValue(mults, k) };
}

/** Reel `reel`'s luck after its first `steps` tokens, the `combos` steps counting their whole combo. */
export function chainMult(mults: ReadonlyArray<readonly number[]>, reel: number, combos: readonly number[] = [], steps = Infinity): number {
  return tokenMult(mults, reel, combos, steps);
}
