/**
 * While you're away the altar keeps rolling under the same rules (tokens, Lucky and Golden Spins,
 * bad-luck protection), at 1/10 speed and 75% efficiency (Night Watch adds 40% per tier), stopping
 * at 1,000 rolls or 8 hours. Only Epic-or-better finds are kept; the rest are dropped. The squad's
 * gold income runs on too, from your recent gold per minute.
 */
import { BAL } from './balance';
import { rarityAtLeast, type Rarity } from './rarity';
import type { Rng } from './rng';
import { landReels, reelCount, spinCycle, startSpin } from './roller';
import type { GameState, MutationId } from './state';
import { upgradeFx } from './upgrades';

export interface OfflineReport {
  seconds: number;
  rolls: number;
  kept: Array<{ knightId: string; rarity: Rarity; mutation: MutationId | null; isNew: boolean }>;
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
  let done = 0;
  // Spins run for real, but only Epic-or-better finds stay (the rest never arrive).
  const savedHist = state.roll.hist;
  while (done < rolls) {
    const spin = startSpin(state, rng, nowMs, () => {});
    for (const r of spin.reels) {
      if (done >= rolls) {
        r.landed = true; // past the cap: never rolled
        continue;
      }
      if (!rarityAtLeast(r.rarity, BAL.offline.keepRarity)) {
        r.landed = true; // dropped, but it still counts toward bad-luck protection
        state.roll.dry += 1;
        state.roll.count += 1;
      }
      done += 1;
    }
    const before = new Set(Object.keys(state.roster));
    landReels(state, (e) => {
      if (e.type === 'land') kept.push({ knightId: e.knightId, rarity: e.rarity, mutation: e.mutation, isNew: !before.has(e.knightId) });
    });
    state.roll.current = null;
    state.roll.timer = 0;
  }
  state.roll.hist = savedHist;
  const gold = Math.round(state.stats.goldPerMinute * (seconds / 60) * eff);
  state.gold += gold;
  return { seconds, rolls, kept, gold };
}
