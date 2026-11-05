/**
 * Timing of the big reveal (Dumpster Legend's revealTiming.ts): the screen goes black, a heartbeat in
 * the dark, the knight rises and shines, then its "1 in X" counts up and lands. Bigger deals take longer.
 */
import type { RollDrama } from '../../core/state';

export const DRAMA_LEVEL: Record<RollDrama, number> = { big: 0, huge: 1, insane: 2, hyper: 3 };

/** HYPER RARE's showcase can't be skipped before this (ms from its start: the portal, then the burst). */
export const HYPER_LOCK_MS = 2400;

export interface RevealPhases {
  /** Fade to black. */
  black: number;
  /** Darkness with a heartbeat. */
  dark: number;
  /** The knight rises out of the dark. */
  appear: number;
  /** The odds count up. */
  count: number;
  /** Heartbeats in the dark. */
  beats: number;
}

export function revealPhases(drama: RollDrama, calm: boolean): RevealPhases {
  const lvl = DRAMA_LEVEL[drama];
  // HYPER RARE: the dark is the summoning, ending in the burst as the knight appears; it can't be
  // skipped until then (HYPER_LOCK_MS), reduce motion or not. Reduce motion shortens everything else.
  return {
    black: 250,
    dark: drama === 'hyper' ? HYPER_LOCK_MS - 250 : calm ? 300 : [700, 1300, 2000][lvl],
    appear: calm ? 400 : 650,
    count: calm ? [1100, 1400, 1700, 2000][lvl] : [1700, 2400, 3100, 3800][lvl],
    beats: calm ? 1 : [2, 3, 5, 7][lvl],
  };
}

/** Milliseconds from the start until the odds land. */
export function revealIntroMs(drama: RollDrama, calm: boolean): number {
  const p = revealPhases(drama, calm);
  return p.black + p.dark + p.appear + p.count;
}
