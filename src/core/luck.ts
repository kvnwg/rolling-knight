/**
 * Luck, Dumpster Legend's formula with the dungeon's depth in place of the Dumpster Level:
 *   (1 + Luck upgrades + Depth) × rebirths × Luck Potion
 * Depth is +5% for every boss beaten this run, up to +145%. Lucky Spins, Golden Spins and luck
 * tokens multiply a single spin or reel on top (roller.ts).
 * Also here: how rare a find is *for you* (the full-screen reveal is judged against your own recent
 * finds, so it comes at a steady pace early and late).
 */
import { BAL } from './balance';
import { RARITIES, RARITY_ODDS, rarityAtLeast, rarityChances, tierOrBetterOneIn, type Rarity } from './rarity';
import type { GameState, MutationId, RollDrama } from './state';
import { upgradeFx } from './upgrades';

export interface LuckBreakdown {
  upgrades: number;
  depth: number;
  rebirthMult: number;
  potionMult: number;
  potionEndsAt: number | null;
  total: number;
}

export function luckBreakdown(state: GameState, now: number): LuckBreakdown {
  const upgrades = upgradeFx(state).luck;
  const depth = Math.min(BAL.luck.depthMaxBosses, state.run.bosses) * BAL.luck.depthPerBoss;
  const rebirthMult = 1 + state.rebirths * BAL.rebirth.luckPer;
  const potion = state.potionEndsAt !== null && now < state.potionEndsAt;
  const potionMult = potion ? BAL.luck.potionMult : 1;
  const total = (1 + upgrades + depth) * rebirthMult * potionMult;
  return { upgrades, depth, rebirthMult, potionMult, potionEndsAt: potion ? state.potionEndsAt : null, total };
}

export function currentLuck(state: GameState, now: number): number {
  const v = luckBreakdown(state, now).total;
  return Number.isFinite(v) && v >= 1 ? v : 1;
}

export function luckyEvery(state: GameState): number {
  return Math.max(BAL.roll.luckyMinEvery, BAL.roll.luckyEvery - upgradeFx(state).luckyEvery);
}

export function luckyMult(state: GameState): number {
  return BAL.roll.luckyMult + upgradeFx(state).luckyMult;
}

/** Chance of each mutation (independent of luck; Alchemy multiplies it). */
export function mutationChance(id: MutationId, mult = 1): number {
  return Math.min(1, mult / BAL.mutations[id].oneIn);
}

/** "1 in X" shown on a knight: its tier at luck 1, times its mutation's odds. */
export function oneInFor(rarity: Rarity, mutation: MutationId | null): number {
  const tier = 1 / rarityChances(1)[rarity];
  const mut = mutation ? BAL.mutations[mutation].oneIn : 1;
  return Math.max(1, Math.round(tier * mut));
}

/** How rare a find is for you right now (only compared with other finds, never shown). */
export function findScore(rarity: Rarity, mutation: MutationId | null, luck: number, mutMult: number): number {
  const mut = mutation ? 1 / mutationChance(mutation, mutMult) : 1;
  return tierOrBetterOneIn(rarity, luck) * mut;
}

const DRAMAS: RollDrama[] = ['big', 'huge', 'insane'];

/**
 * Which finds of a spin get the full-screen reveal, and how much the spin builds up. A find gets the
 * reveal when its tier is at least 1 in 20 at your luck and it is rarer, for you, than everything in
 * the last 5 minutes (big), 50 minutes (huge) or 500 minutes (insane) of play. HYPER RARE is the
 * rarest find of your whole game, at least 1 in 100,000 for your luck, after 10 minutes of play.
 * Build-ups use 30-second and 2-minute windows; nothing is judged in a new game's first 2 minutes.
 */
export function judgeFinds(
  state: GameState,
  finds: ReadonlyArray<{ rarity: Rarity; mutation: MutationId | null }>,
  luck: number,
): { drama: Array<RollDrama | null>; tease: 0 | 1 | 2 } {
  const b = BAL.feel.bigRoll;
  const bu = BAL.feel.buildUp;
  const r = state.roll;
  const now = state.playTimeMs;
  r.since ??= now;
  const MIN = 60_000;
  const watched = Math.max(0, now - r.since);
  const longest = Math.max(...b.windowMinutes, ...bu.windowMinutes) * MIN;
  r.hist = r.hist.filter(([at]) => at >= now - longest);
  const rarestSince = (ms: number) => r.hist.find(([at]) => at >= now - ms)?.[1] ?? 0;
  const beats = (score: number, windows: readonly number[]) => {
    let k = 0;
    for (const w of windows) {
      const ms = w * MIN;
      if (watched < Math.min(ms, Math.max(b.minHistoryMinutes * MIN, ms * b.coverShare))) break;
      if (score <= rarestSince(ms)) break;
      k++;
    }
    return k;
  };
  const l = Math.max(1, luck);
  const mm = upgradeFx(state).mutationMult;
  const scores = finds.map((f) => {
    const s = findScore(f.rarity, f.mutation, l, mm);
    return Number.isFinite(s) ? s : 0;
  });
  const tierOk = finds.map((f) => tierOrBetterOneIn(f.rarity, l) >= b.tierOneIn);
  const drama: Array<RollDrama | null> = finds.map((_, i) => {
    if (!tierOk[i]) return null;
    const k = beats(scores[i], b.windowMinutes);
    return k > 0 ? DRAMAS[k - 1] : null;
  });
  let top = -1;
  scores.forEach((s, i) => {
    if (tierOk[i] && (top < 0 || s > scores[top])) top = i;
  });
  if (top >= 0 && scores[top] > r.best && scores[top] >= b.hyperOneIn && watched >= b.hyperWatchMinutes * MIN) drama[top] = 'hyper';
  r.best = Math.max(r.best, ...scores);
  let tease: 0 | 1 | 2 = 0;
  finds.forEach((f, i) => {
    if (tierOrBetterOneIn(f.rarity, l) < bu.tierOneIn) return;
    tease = Math.max(tease, beats(scores[i], bu.windowMinutes)) as 0 | 1 | 2;
  });
  for (const s of scores) {
    while (r.hist.length > 0 && r.hist[r.hist.length - 1][1] <= s) r.hist.pop();
    r.hist.push([now, s]);
  }
  if (r.hist.length > b.historyMax) r.hist.splice(0, r.hist.length - b.historyMax);
  return { drama, tease };
}

/** The least tier a reveal needs at this luck (for the Luck panel). */
export function revealBar(luck: number): Rarity {
  return RARITIES.find((t) => tierOrBetterOneIn(t, luck) >= BAL.feel.bigRoll.tierOneIn) ?? 'primordial';
}

/** Tiers that can still drop at this luck (luck at or past a tier's X stops everything below it). */
export function lowestDroppable(luck: number): Rarity {
  let low: Rarity = 'common';
  for (const t of RARITIES) if (t !== 'common' && luck >= RARITY_ODDS[t]) low = t;
  return low;
}

export { rarityAtLeast };
