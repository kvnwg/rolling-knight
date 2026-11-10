/**
 * While you're away the altar keeps rolling under the same rules (tokens, Lucky and Golden Spins,
 * bad-luck protection), at 1/10 speed, stopping at BAL.offline.maxRolls rolls or 8 hours. Every pull
 * lands as it would with you there: a new knight joins your roster, and a repeat is kept as an extra
 * for Bram the Broker to sell, worth only a share (`dupeShare`) of what a repeat usually fetches. The
 * squad's fight income runs on at `efficiency` of its last ten minutes' rate (picked-up gold, not
 * extras sold, knights sold or spending; Night Watch adds `perTier` a tier): a night away is worth
 * about an hour of play.
 */
import { BAL } from './balance';
import type { Rarity } from './rarity';
import type { Rng } from './rng';
import { landReels, reelCount, spinCycle, startSpin } from './roller';
import type { GameState, MutationId } from './state';
import { upgradeFx } from './upgrades';

export interface OfflineReport {
  seconds: number;
  rolls: number;
  /** Every pull while away, in order: a knight new to you (`isNew`), or a repeat kept as an extra. */
  kept: Array<{ knightId: string; rarity: Rarity; mutation: MutationId | null; isNew: boolean }>;
  /** How many of those pulls were repeats, kept as extras (Bram the Broker sells them). */
  extras: number;
  /** The squad's fight gold while away (in the purse already). */
  gold: number;
}

export function offlineEfficiency(state: GameState): number {
  return BAL.offline.efficiency + upgradeFx(state).offlineEff;
}

export function runOffline(state: GameState, rng: Rng, awaySeconds: number, nowMs: number): OfflineReport | null {
  if (awaySeconds < BAL.offline.minAwaySeconds || state.roll.tutorial !== 'done') return null;
  const seconds = Math.min(awaySeconds, BAL.offline.capHours * 3600);
  const eff = offlineEfficiency(state);
  const perSpin = spinCycle(state) * BAL.offline.rollSlowdown;
  const reels = reelCount(state);
  const rolls = Math.min(BAL.offline.maxRolls, Math.floor((seconds / perSpin) * reels * eff));
  const kept: OfflineReport['kept'] = [];
  let extras = 0;
  let done = 0;
  // Spins run for real (the big-reveal history is left as it was: nobody saw them).
  const savedHist = state.roll.hist;
  while (done < rolls) {
    const spin = startSpin(state, rng, nowMs, () => {});
    for (const r of spin.reels) {
      if (done >= rolls) r.landed = true; // past the cap: never rolled
      else done += 1;
    }
    landReels(
      state,
      (e) => {
        if (e.type !== 'land') return;
        kept.push({ knightId: e.knightId, rarity: e.rarity, mutation: e.mutation, isNew: e.result.kind === 'new' });
        if (e.result.kind === 'dupe') extras += 1;
      },
      Infinity,
      BAL.offline.dupeShare,
    );
    state.roll.current = null;
    state.roll.timer = 0;
  }
  state.roll.hist = savedHist;
  const rate = state.stats.combatPerMinute ?? Math.min(state.stats.goldPerMinute, 0);
  const gold = Math.round(rate * (seconds / 60) * eff);
  state.gold += gold;
  return { seconds, rolls, kept, extras, gold };
}
