/**
 * Reel strips (ported from Dumpster Legend's reelStrip.ts). A strip is the column of cells a reel rolls
 * through in one spin: the last result at the bottom, fillers, then (for a reel landing luck tokens)
 * each token with more fillers after it, the knight, and two cells on top.
 *
 * Fillers are a tease, not a sample: they lean much rarer than the real odds, with a near miss next to
 * most results (BAL.feel.reels), and now and then a token rolls past. They only show classes you can
 * roll. Only the landed results come from the real odds.
 *
 * Motion (stripAt): each stretch kicks back a little, launches, cruises, brakes and clunks a little past
 * the line before settling on it, always arriving exactly at its stop time. A stretch marked `slow` (a
 * rare result's build-up, reelDrama.ts) brakes early into a long crawl toward the line.
 */
import { BAL } from '../../core/balance';
import { knightId, type ClassId } from '../../core/knights';
import { RARITIES, rarityAtLeast, tierOneIn, type Rarity } from '../../core/rarity';
import type { MutationId, Spin } from '../../core/state';
import { reelStops, tokenHoldMs } from './reelTiming';
import { hash } from './util';

export interface StripCell {
  /** The knight shown (unused for a token). */
  id: string;
  rarity: Rarity;
  mutation: MutationId | null;
  /** Its "1 in X". */
  odds: number;
  /** A real result (shown in color once landed), not a filler. */
  real: boolean;
  /** A luck token's multiplier, or null for a knight. */
  token: number | null;
}

export interface StripStop {
  /** Index of the cell it stops on. */
  idx: number;
  /** Milliseconds after the spin starts. */
  at: number;
  token: number | null;
  /** 0 to 1: how much the approach to this stop slows into a crawl (a rare result's build-up). */
  slow?: number;
}

export interface Strip {
  cells: StripCell[];
  /** Tokens first, the knight last. */
  stops: StripStop[];
}

/** Fillers rolling past, by tier (Dumpster Legend's fillerWeights, by tier index). */
const FILLER: readonly number[] = [12, 16, 18, 20, 18, 10, 8, 7, 6, 6, 4, 3, 2];
/** A near miss next to the result: Legendary or better. */
const NEAR_MISS: readonly number[] = [0, 0, 0, 0, 50, 33, 30, 26, 22, 17, 12, 8, 5];
/** Epic-or-better fillers show a mutation's odds this often (Dumpster Legend's flairChance). */
const FLAIR = 0.3;
/** Cells in a reel's first stretch, at least. */
const MIN_CELLS = 9;

const BASE_ODDS = RARITIES.map((r) => Math.max(1, Math.round(tierOneIn(r))));

function pickRarity(u: number, weights: readonly number[]): Rarity {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < RARITIES.length; i++) {
    acc += weights[i] / total;
    if (u < acc) return RARITIES[i];
  }
  return 'common';
}

const TOKEN_VALUES = BAL.roll.tokens.values.map(([x]) => x);

/** A made-up cell rolling past: a knight rarer than real odds, or (rarely) a luck token. */
export function filler(seed: number, nearMiss: boolean, classes: readonly ClassId[], tokens = true): StripCell {
  if (tokens && !nearMiss && hash(seed * 23 + 11) < BAL.roll.tokens.chance * 0.2) {
    const x = TOKEN_VALUES[Math.floor(hash(seed * 29 + 4) * TOKEN_VALUES.length)];
    return { id: '', rarity: 'common', mutation: null, odds: 1, real: false, token: x };
  }
  const rarity = pickRarity(hash(seed * 7 + 1), nearMiss ? NEAR_MISS : FILLER);
  const cls = classes[Math.floor(hash(seed * 13 + 5) * classes.length)] ?? 'guardian';
  let odds = BASE_ODDS[RARITIES.indexOf(rarity)];
  if (rarityAtLeast(rarity, 'epic') && hash(seed * 17 + 9) < FLAIR) {
    const u = hash(seed * 19 + 3);
    odds = Math.round(odds * (u < 0.6 ? BAL.mutations.gilded.oneIn : u < 0.9 ? BAL.mutations.shadow.oneIn : BAL.mutations.radiant.oneIn));
  }
  return { id: knightId(rarity, cls), rarity, mutation: null, odds, real: false, token: null };
}

export function resultCell(spin: Spin, i: number): StripCell {
  const r = spin.reels[i];
  return { id: r.knightId, rarity: r.rarity, mutation: r.mutation, odds: r.oneIn, real: true, token: null };
}

function tokenCell(x: number): StripCell {
  return { id: '', rarity: 'common', mutation: null, odds: 1, real: true, token: x };
}

/**
 * Reel `i`'s strip for a spin: starts from `prev` (the cell it rested on), rolls through fillers to each
 * token and finally its knight. `slow` (0 to 1) makes the last approach crawl (reelDrama.ts); that
 * stretch gets fewer cells so its shorter cruise stays a readable speed.
 */
export function buildStrip(spin: Spin, i: number, prev: StripCell | undefined, classes: readonly ClassId[], slow = 0): Strip {
  const cellsPerSecond = BAL.feel.reels.cellsPerSecond;
  const r = spin.reels[i];
  const timeline = reelStops(spin, i);
  const seed = spin.id * 97 + i * 13;
  const tease = !rarityAtLeast(r.rarity, 'legendary') && hash(seed + 77) < BAL.feel.reels.nearMissChance;
  const above = hash(seed + 91) < 0.5;
  const cells: StripCell[] = [prev ?? filler(seed, false, classes, false)];
  const stops: StripStop[] = [];
  let from = 0;
  timeline.forEach((st, j) => {
    const startAt = j === 0 ? 0 : Math.min(st.at, timeline[j - 1].at + tokenHoldMs());
    const secs = (st.at - startAt) / 1000;
    const last = j === timeline.length - 1;
    const crawl = last ? slow : 0;
    const k = Math.max(j === 0 ? MIN_CELLS : 4, Math.round(secs * cellsPerSecond * (1 - 0.4 * crawl)));
    for (let c = 1; c < k; c++) cells.push(filler(seed + j * 977 + c * 31, last && tease && !above && c === k - 1, classes, !last || c < k - 2));
    cells.push(st.token === null ? resultCell(spin, i) : tokenCell(st.token));
    from += k;
    stops.push({ idx: from, at: st.at, token: st.token, ...(crawl > 0 ? { slow: crawl } : {}) });
  });
  cells.push(filler(seed + 7001, tease && above, classes, false));
  cells.push(filler(seed + 7002, false, classes, false));
  return { cells, stops };
}

/** Samples per travel curve. */
const SAMPLES = 240;
const curves = new Map<string, Float32Array>();

/** The wind-up before a stretch launches (ms, at most): the reel kicks back, then lets go. */
function kickMs(ms: number): number {
  return Math.min(150, ms * 0.12);
}

/**
 * Where a reel is along a stretch of `k` cells lasting `ms`, sampled at SAMPLES + 1 moments: it waits
 * out most of the wind-up, speeds up, cruises, then brakes onto the line, still moving a little when it
 * gets there (the clunk takes over). `slow` brakes earlier and harder into a long crawl.
 */
function curve(k: number, ms: number, slow: number): Float32Array {
  const key = `${k}|${Math.round(ms)}|${slow}`;
  const hit = curves.get(key);
  if (hit) return hit;
  const hold = (0.55 * kickMs(ms)) / ms;
  const ramp = Math.min(0.15, 180 / ms);
  const brakeAt = 0.5 - 0.27 * slow;
  const tail = 0.1 - 0.09 * slow;
  const bend = 2 + 1.5 * slow;
  const speed = (x: number) => {
    if (x < hold) return 0;
    if (x < hold + ramp) {
      const u = (x - hold) / ramp;
      return u * u * (3 - 2 * u);
    }
    if (x < brakeAt) return 1;
    return tail + (1 - tail) * Math.pow(1 - (x - brakeAt) / (1 - brakeAt), bend);
  };
  const out = new Float32Array(SAMPLES + 1);
  let acc = 0;
  let v0 = speed(0);
  for (let s = 1; s <= SAMPLES; s++) {
    const v1 = speed(s / SAMPLES);
    acc += (v0 + v1) / 2;
    out[s] = acc;
    v0 = v1;
  }
  for (let s = 0; s <= SAMPLES; s++) out[s] = (out[s] / acc) * k;
  if (curves.size > 96) curves.clear();
  curves.set(key, out);
  return out;
}

/** Cells travelled `t` ms into a stretch of `k` cells lasting `ms`: the kick back, the curve, the clunk. */
function travel(k: number, t: number, ms: number, slow: number): number {
  if (t >= ms) return k;
  const c = curve(k, ms, slow);
  const f = (t / ms) * SAMPLES;
  const s = Math.floor(f);
  let p = c[s] + (c[Math.min(SAMPLES, s + 1)] - c[s]) * (f - s);
  const kick = kickMs(ms);
  if (t < kick) p -= 0.16 * Math.sin((Math.PI * t) / kick) ** 2;
  const clunk = Math.min(130, ms * 0.1);
  if (t > ms - clunk) p += (0.17 - 0.07 * slow) * Math.sin((Math.PI * (t - (ms - clunk))) / clunk);
  return p;
}

/**
 * Where a strip is `ms` into the spin: `p` in cells from the bottom (fractional while moving) and how
 * many stops it has reached. Between stops it holds on a token, then rolls on to the next stop.
 * `calm` (reduce motion): the strip doesn't move; each stop just shows.
 */
export function stripAt(strip: Strip, ms: number, calm = false): { p: number; reached: number } {
  let prevIdx = 0;
  let prevAt = 0;
  for (let j = 0; j < strip.stops.length; j++) {
    const st = strip.stops[j];
    const startAt = j === 0 ? 0 : Math.min(st.at, prevAt + tokenHoldMs());
    if (ms < st.at) {
      if (ms <= startAt) return { p: prevIdx, reached: j };
      const k = st.idx - prevIdx;
      return { p: prevIdx + (calm ? 0 : travel(k, ms - startAt, Math.max(1, st.at - startAt), st.slow ?? 0)), reached: j };
    }
    prevIdx = st.idx;
    prevAt = st.at;
  }
  return { p: prevIdx, reached: strip.stops.length };
}
