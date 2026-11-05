/**
 * The roll's sounds wherever you are (ported from Dumpster Legend's tokenFx.ts and the build-up part of
 * its rollController). A luck token's chime, a combo's jingle and a build-up's riser belong to their
 * moment in the spin, whether or not any reels are on screen: the reels (AltarReels) play them as they
 * show them, and `watchRollSounds` plays them from the spin's clock for when none are mounted. Each one
 * plays once per spin, whichever comes first (they agree to a frame: both run on the core's roll timer).
 */
import type { Spin } from '../../core/state';
import type { Game } from '../../game';
import { fxSound } from './fxSound';
import { teasePlan } from './reelDrama';
import { comboOf, reelStops } from './reelTiming';

const heard = new WeakMap<Spin, Set<string>>();

function once(spin: Spin, key: string): boolean {
  let set = heard.get(spin);
  if (!set) heard.set(spin, (set = new Set()));
  if (set.has(key)) return false;
  set.add(key);
  return true;
}

/** Token `step` of reel `reel` landed: its chime (level = its place in the reel's chain), once. */
export function tokenSound(spin: Spin, reel: number, step: number): void {
  if (once(spin, `t${reel}:${step}`)) fxSound('token', step);
}

/** Combo step `k`'s tokens merged (level = how many reels), once. */
export function comboSound(spin: Spin, k: number, reels: number): void {
  if (once(spin, `c${k}`)) fxSound('combo', reels);
}

/** A build-up starts climbing toward its find (level = the find's rarity index), once. */
export function riserSound(spin: Spin, tier: number): void {
  if (once(spin, 'riser')) fxSound('riser', tier);
}

/** The combo steps whose every token has landed (each reel with a token then has gone past it). */
export function combosDone(matched: readonly number[], mults: readonly (readonly number[])[], reached: readonly number[]): number[] {
  return matched.filter((k) => mults.every((mm, i) => mm.length <= k || reached[i] > k));
}

/**
 * Plays every spin's token chimes, combo jingles (as the merge lands) and build-up riser on the spin's
 * clock, reels on screen or not. Call once; it returns its stop. What's already past when a spin is
 * first seen (the game was away, or loaded mid-spin) isn't played late.
 */
export function watchRollSounds(game: Game, comboDelayMs = 390): () => void {
  let raf = 0;
  let spin: Spin | null = null;
  let stops: Array<Array<{ at: number; token: number | null }>> = [];
  let plan: ReturnType<typeof teasePlan> = null;
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const cur = game.state.roll.current;
    if (!cur) return;
    const el = game.state.roll.timer * 1000;
    if (cur !== spin) {
      spin = cur;
      stops = cur.reels.map((_, i) => reelStops(cur, i));
      plan = teasePlan(cur);
      if (plan && el >= plan.land) once(cur, 'riser');
      // Joined late: what's long past stays quiet.
      stops.forEach((st, i) => st.forEach((s, k) => s.token !== null && s.at < el - 150 && once(cur, `t${i}:${k}`)));
      cur.combos.forEach((k) => {
        const reached = stops.map((st) => st.filter((s) => s.at < el - 150).length);
        if (combosDone(cur.combos, cur.reels.map((r) => r.tokens), reached).includes(k)) once(cur, `c${k}`);
      });
    }
    const reached = stops.map((st) => st.filter((s) => s.at <= el).length);
    const mults = cur.reels.map((r) => r.tokens);
    stops.forEach((st, i) =>
      st.forEach((s, k) => {
        if (s.token === null || s.at > el) return;
        tokenSound(cur, i, k);
      }),
    );
    // The build-up's riser (rare for you lately, or the full reveal), as the glow starts to climb.
    if (plan && plan.level >= 1 && el >= plan.from + (plan.land - plan.from) * 0.1 && el < plan.land) riserSound(cur, plan.tiers[plan.tiers.length - 1]);
    for (const k of combosDone(cur.combos, mults, reached)) {
      const key = `w${k}`;
      if (!once(cur, key)) continue;
      const n = comboOf(mults, k).reels.length;
      timers.push(setTimeout(() => comboSound(cur, k, n), comboDelayMs));
    }
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
  };
}
