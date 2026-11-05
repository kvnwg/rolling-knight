/**
 * The altar's sense of occasion (ported from Dumpster Legend's reelDrama.ts): which spin builds up to
 * its result, how, and how big each result lands.
 *
 * Build-up (a "tease"): the reel with the spin's biggest find slows into a crawl while the machine
 * glows. The glow starts at a lower tier's color and flickers up tier by tier, reaching the real tier
 * as the reel stops, so a glow never shows its ceiling and every glow carries some hope. A find getting
 * the full-screen reveal always builds up (the rarer, the longer the crawl and the harder the machine
 * shakes); the spin's `tease` (the core's judgment) gives smaller ones; an uncommon find sometimes gets
 * a small glow that climbs only to its own tier. A glow never climbs past the real result. Commons
 * never glow.
 */
import { rarityIndex, tierOrBetterOneIn } from '../../core/rarity';
import type { RollDrama, Spin } from '../../core/state';
import { reelStops, tokenHoldMs } from './reelTiming';
import { hash } from './util';

/** 0: a small glow for an uncommon result; 1, 2: rare and very rare for you lately; 3: the full reveal. */
export type TeaseLevel = 0 | 1 | 2 | 3;

export interface Tease {
  reel: number;
  /** When the glow starts and when the reel stops on its result (ms after the spin starts). */
  from: number;
  land: number;
  /** The glow's tiers (rarity indexes), lowest first; the last is the result's own. */
  tiers: number[];
  /** When each tier takes over (ms): the first at `from`, the last at `land`. */
  times: number[];
  level: TeaseLevel;
  /** How much the reel's last approach slows (0 to 1, reelStrip.ts). */
  slow: number;
}

const DRAMA_RANK: Record<RollDrama, number> = { big: 1, huge: 2, insane: 3, hyper: 4 };
/** Uncommon results (1 in 6 or rarer at your luck) glow a little this often, plain ones (1 in 2) now and then. */
const HOPE_CHANCE = 0.35;
const LOW_HOPE_CHANCE = 0.06;

/** The spin's build-up, or null for a plain spin. */
export function teasePlan(spin: Spin): Tease | null {
  if (spin.reels.length === 0) return null;
  // Reels stop in landing order; the rarest (the last to stop among equals) is the one to watch.
  const order = spin.reels.map((_, i) => i).sort((a, b) => spin.reels[a].landAt - spin.reels[b].landAt || a - b);
  let reel = order[0];
  for (const i of order) if (rarityIndex(spin.reels[i].rarity) >= rarityIndex(spin.reels[reel].rarity)) reel = i;
  let top = 0;
  for (const i of order) {
    const d = spin.reels[i].drama;
    if (d && DRAMA_RANK[d] >= top) {
      top = DRAMA_RANK[d];
      reel = i;
    }
  }
  const scripted = spin.reels[0]?.scripted;
  const tutorialFind = scripted === 'first' || scripted === 'beginner';
  if (tutorialFind) reel = 0;
  const r = spin.reels[reel];
  const tier = rarityIndex(r.rarity);
  if (tier < 1) return null;
  const odds = tierOrBetterOneIn(r.rarity, Math.max(1, spin.luck));
  const u = hash(spin.id * 31 + reel * 7 + 7);
  const u2 = hash(spin.id * 53 + reel * 5 + 11);
  let level: TeaseLevel;
  if (r.drama || tutorialFind) level = 3;
  else if (spin.tease >= 2) level = 2;
  else if (spin.tease >= 1) level = 1;
  else if (odds >= 6 && u < HOPE_CHANCE) level = 0;
  else if (odds >= 2 && u < LOW_HOPE_CHANCE) level = 0;
  else return null;
  // Where the glow starts: one or two tiers down (never giving away the ceiling); for the rarest,
  // anywhere from Rare to Legendary, climbing through every tier in between.
  const start = level === 0 ? tier - (u2 < 0.6 ? 1 : 0) : tier <= 4 ? tier - 1 - Math.floor(u2 * 2) : 2 + Math.floor(u2 * 3);
  const lo = Math.max(1, Math.min(tier, start));
  const tiers: number[] = [];
  for (let k = lo; k <= tier; k++) tiers.push(k);
  const stops = reelStops(spin, reel);
  const land = stops[stops.length - 1].at;
  const begin = stops.length > 1 ? Math.min(land, stops[stops.length - 2].at + tokenHoldMs()) : 0;
  const span = land - begin;
  const dur = Math.min(span * [0.42, 0.62, 0.68, 0.72][level], [750, 1500, 1800, 2100][level]);
  const from = land - dur;
  const m = tiers.length;
  const times = tiers.map((_, k) => (k === 0 ? from : k === m - 1 ? land : from + dur * (0.3 + (0.52 * (k - 1)) / Math.max(1, m - 2))));
  return { reel, from, land, tiers, times, level, slow: [0.35, 0.75, 0.9, 1][level] };
}

/** What the glow shows `ms` into the spin: its tier (null before it starts), how strong (1 to 3), its step. */
export function glowAt(plan: Tease, ms: number): { tier: number | null; strength: number; step: number } {
  if (ms < plan.from) return { tier: null, strength: 0, step: -1 };
  let step = 0;
  while (step + 1 < plan.times.length && ms >= plan.times[step + 1]) step++;
  const k = Math.min(1, (ms - plan.from) / Math.max(1, plan.land - plan.from));
  const strength = plan.level === 0 ? 1 + Math.floor(k * 1.99) : 1 + Math.floor(k * 2.99);
  return { tier: plan.tiers[step], strength, step };
}

/** How long a tier step flickers between the old and the new color (ms). */
export function flickerMs(plan: Tease): number {
  const gaps = plan.times.slice(1).map((t, k) => t - plan.times[k]);
  return Math.max(70, Math.min(170, Math.min(...gaps, 999) * 0.8));
}

/**
 * How big a result lands, by tier (rarity index): every stop thuds and flashes the payline; Rare and up
 * throw sparks and swooshes; Epic and up get light rays behind the result; Legendary and up stamp their
 * tier over the reel; Mythic and up rain confetti.
 */
export function landFx(tier: number): { sparks: number; rays: boolean; stamp: boolean; confetti: boolean } {
  return {
    sparks: tier >= 4 ? 10 : tier >= 3 ? 8 : tier >= 2 ? 6 : 0,
    rays: tier >= 3,
    stamp: tier >= 4,
    confetti: tier >= 5,
  };
}
