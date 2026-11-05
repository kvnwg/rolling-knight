/**
 * The Summoning Altar: free reels that never stop, Dumpster Legend's dumpster with knights.
 * - Every spin rolls one knight per reel; every result is decided the instant the spin starts, and
 *   the spinning reels are only the animation. The reels land one by one.
 * - A spin takes 2.6 s plus a 0.9 s rest (3.5 s); 8 tiers of Spin Speed bring it to about 1 s, never
 *   under 0.7 s (Greased Gears goes past that). An Hourglass from fighting makes a spin twice as fast
 *   (Turbo Power more), unless the spin builds up to a rare find: then it plays at normal speed and
 *   the Hourglass waits.
 * - Luck tokens: before a reel lands, a 5% chance of a token instead (×2 60%, ×3 25%, ×5 11%,
 *   ×10 4%); the reel spins again with a 50% chance of another, up to 4 in a row, multiplying. Tokens
 *   landing in the same round on two or more reels make a combo: each counts the product of that
 *   round's tokens. Chains of ×25, ×50 and ×250 guarantee Epic, Legendary and Mythic or better.
 * - Every 10th spin is a Lucky Spin (×2 luck), Golden Spins (×5) come with the Golden Wheel, and bad-
 *   luck protection guarantees an Epic after 40 rolls without one.
 */
import { BAL } from './balance';
import type { EventSink } from './events';
import { CLASSES, knightId, unlockedClasses, type ClassId } from './knights';
import { currentLuck, judgeFinds, luckyEvery, luckyMult, mutationChance, oneInFor } from './luck';
import { hasPerk } from './perks';
import { higherRarity, rarityAtLeast, rollRarity, type Rarity } from './rarity';
import type { Rng } from './rng';
import { addKnight } from './roster';
import type { GameState, MutationId, ReelResult, Spin } from './state';
import { MUTATIONS } from './state';
import { upgradeFx } from './upgrades';

/** Seconds for one spin cycle (spin + rest). */
export function spinCycle(state: GameState, turbo = false): number {
  const r = BAL.roll;
  const fx = upgradeFx(state);
  const cycle = Math.max(r.minCycleSeconds, (r.spinSeconds + r.restSeconds) * Math.pow(1 - r.speedPerLevel, fx.spinLevels));
  const base = turbo ? Math.max(r.minTurboCycleSeconds, cycle / (r.turboSpeedMult + fx.turboPower)) : cycle;
  let mult = 1;
  if (hasPerk(state, 'greasedGears')) mult *= 0.5;
  if (hasPerk(state, 'bootlegReel')) mult *= 1.5;
  return base * mult;
}

export function spinShare(): number {
  return BAL.roll.spinSeconds / (BAL.roll.spinSeconds + BAL.roll.restSeconds);
}

export function reelCount(state: GameState): number {
  const extra = upgradeFx(state).reels + (hasPerk(state, 'bootlegReel') ? 1 : 0);
  return Math.max(1, Math.min(BAL.roll.maxReels, 1 + extra));
}

export function drySpell(state: GameState): number {
  return Math.max(BAL.roll.pity.min, BAL.roll.pity.drySpell - upgradeFx(state).pity);
}

export function tokenChance(state: GameState): number {
  return Math.min(BAL.roll.tokens.maxChance, BAL.roll.tokens.chance * (hasPerk(state, 'fourLeafLitter') ? 3 : 1));
}

/** The luck tokens a reel lands before its knight, in order (usually none). */
export function rollTokens(rng: Rng, first: number): number[] {
  const t = BAL.roll.tokens;
  const out: number[] = [];
  while (out.length < t.maxSteps && rng.chance(out.length === 0 ? first : t.chainChance)) out.push(rng.weighted(t.values));
  return out;
}

/** Token rounds where two or more reels landed a token together. */
export function comboSteps(all: ReadonlyArray<readonly number[]>): number[] {
  const out: number[] = [];
  const steps = Math.max(0, ...all.map((m) => m.length));
  for (let k = 0; k < steps; k++) if (all.filter((m) => m.length > k).length >= 2) out.push(k);
  return out;
}

export function comboValue(all: ReadonlyArray<readonly number[]>, k: number): number {
  return all.reduce((a, m) => (m.length > k ? a * m[k] : a), 1);
}

/** Reel `reel`'s luck multiplier from its first `steps` tokens (combo rounds count the round's product). */
export function tokenMult(all: ReadonlyArray<readonly number[]>, reel: number, combos: readonly number[] = [], steps = Infinity): number {
  const mults = all[reel] ?? [];
  let x = 1;
  for (let k = 0; k < Math.min(steps, mults.length); k++) x *= combos.includes(k) ? comboValue(all, k) : mults[k];
  return Math.min(x, 10_000);
}

/** The least rarity a chain multiplying luck by `mult` guarantees, or null. */
export function chainFloor(mult: number): Rarity | null {
  let out: Rarity | null = null;
  for (const f of BAL.roll.tokens.floors) if (mult >= f.x) out = higherRarity(out, f.rarity);
  return out;
}

export function rollMutation(rng: Rng, mult: number): MutationId | null {
  for (let i = MUTATIONS.length - 1; i >= 0; i--) if (rng.chance(mutationChance(MUTATIONS[i], mult))) return MUTATIONS[i];
  return null;
}

export function tokenStepSeconds(baseSpinSeconds: number): number {
  return BAL.roll.tokens.holdSeconds + baseSpinSeconds;
}

interface Pick {
  rarity: Rarity;
  cls: ClassId;
  mutation: MutationId | null;
  scripted?: ReelResult['scripted'];
}

/** Starts a spin: rolls every reel's result now (the animation only shows it). */
export function startSpin(state: GameState, rng: Rng, nowMs: number, emit: EventSink): Spin {
  const r = state.roll;
  const tut = r.tutorial;
  const fx = upgradeFx(state);
  const n = reelCount(state);
  const classes = unlockedClasses(state.rebirths);
  let luck = currentLuck(state, nowMs);
  // Peasant Levy: every 4th spin rolls at luck 1 so Commons keep coming.
  if (hasPerk(state, 'peasantLevy') && r.spinCount % 4 === 3) luck = 1;
  let lucky = false;
  let golden = false;
  // The start: quick spins (ordinary rolls, no luck tricks) until there's a squad.
  const warm = tut === 'warmup' || tut === 'rewarm';
  const scriptedSpin = warm;
  if (!scriptedSpin && tut === 'done') {
    r.sinceLucky += 1;
    if (r.sinceLucky >= luckyEvery(state)) {
      lucky = true;
      r.sinceLucky = 0;
      luck *= luckyMult(state);
    } else if ((r.bankedLucky ?? 0) > 0) {
      // A Lucky Spin earned elsewhere (a job's reward) comes up on the next spin.
      lucky = true;
      r.bankedLucky = (r.bankedLucky ?? 0) - 1;
      luck *= luckyMult(state);
    }
    if (fx.goldenChance > 0 && rng.chance(fx.goldenChance)) {
      golden = true;
      luck *= BAL.roll.goldenMult;
    }
  }
  const rigged = !scriptedSpin && hasPerk(state, 'riggedJackpot') && (r.spinCount + 1) % BAL.roll.riggedEvery === 0;
  // Every reel's tokens first: tokens landing together multiply (combos).
  const first = tokenChance(state);
  const tokens: number[][] = Array.from({ length: n }, () => (tut === 'done' ? rollTokens(rng, first) : []));
  const combos = comboSteps(tokens);
  const picks: Pick[] = [];
  let dry = r.dry;
  for (let i = 0; i < n; i++) {
    const mult = tokenMult(tokens, i, combos);
    let pick: Pick;
    {
      const pity = tut === 'done' && dry >= drySpell(state) ? BAL.roll.pity.rarity : null;
      const floor = higherRarity(higherRarity(chainFloor(mult), pity), rigged ? 'legendary' : null) ?? 'common';
      const rarity = scriptedSpin || tut !== 'done' ? rollRarity(Math.min(luck, 2), rng) : rollRarity(luck * mult, rng, floor);
      // (The Absolute tier has one knight, whatever classes are unlocked: Kevin.)
      pick = { rarity, cls: rarity === 'absolute' ? 'blade' : rng.pick(classes), mutation: rollMutation(rng, fx.mutationMult), ...(warm ? { scripted: 'warmup' as const } : {}) };
    }
    dry = rarityAtLeast(pick.rarity, BAL.roll.pity.rarity) ? 0 : dry + 1;
    picks.push(pick);
  }
  const judged = judgeFinds(state, picks, luck);
  const buildsUp = scriptedSpin || judged.tease > 0 || judged.drama.some((d) => d !== null);
  const turbo = state.hourglasses >= 1 && !buildsUp && tut === 'done';
  if (turbo) state.hourglasses -= 1;
  // The warm-up spins are quick, so the squad is ready within a few seconds.
  const cycle = warm ? BAL.tutorial.cycle : spinCycle(state, turbo);
  const baseSpinSeconds = cycle * spinShare();
  const stepSeconds = tokenStepSeconds(baseSpinSeconds);
  // Reels land one by one: each later reel waits a little longer.
  const stagger = Math.min(0.35, baseSpinSeconds * 0.12);
  const reels: ReelResult[] = picks.map((p, i) => ({
    knightId: knightId(p.rarity, p.cls),
    rarity: p.rarity,
    cls: p.cls,
    mutation: p.mutation,
    tokens: tokens[i],
    landAt: baseSpinSeconds + i * stagger + tokens[i].length * stepSeconds,
    landed: false,
    oneIn: oneInFor(p.rarity, p.mutation),
    drama: judged.drama[i],
    ...(p.scripted ? { scripted: p.scripted } : {}),
  }));
  const spinSeconds = Math.max(...reels.map((x) => x.landAt));
  const spin: Spin = {
    id: r.nextSpinId++,
    reels,
    combos,
    lucky,
    golden,
    rigged,
    turbo,
    luck,
    spinSeconds,
    baseSpinSeconds,
    stepSeconds,
    restSeconds: cycle - baseSpinSeconds,
    tease: judged.tease,
    landed: false,
  };
  r.current = spin;
  r.timer = 0;
  r.spinCount += 1;
  // (The start ends when the squad can be filled: checked as the knights land, in rollTick.)
  if (warm && r.spinCount >= BAL.tutorial.maxSpins) r.tutorial = 'done';
  emit({ type: 'spinStart', spin: structuredClone(spin) });
  return spin;
}

/** Lands every reel due by `upTo` seconds into the spin (all of them by default). */
export function landReels(state: GameState, emit: EventSink, upTo = Infinity): void {
  const spin = state.roll.current;
  if (!spin || spin.landed) return;
  const all = spin.reels.map((x) => x.tokens);
  spin.reels.forEach((reel, i) => {
    if (reel.landed || reel.landAt > upTo + 1e-9) return;
    reel.landed = true;
    state.roll.count += 1;
    state.records.spins += 1;
    state.roll.dry = rarityAtLeast(reel.rarity, BAL.roll.pity.rarity) ? 0 : state.roll.dry + 1;
    const newRecord = reel.oneIn > state.records.bestOneIn;
    if (newRecord) {
      state.records.bestOneIn = reel.oneIn;
      state.records.bestName = reel.knightId;
    }
    const result = addKnight(state, reel.knightId, reel.mutation);
    emit({
      type: 'land',
      spinId: spin.id,
      reel: i,
      knightId: reel.knightId,
      rarity: reel.rarity,
      mutation: reel.mutation,
      oneIn: reel.oneIn,
      mult: tokenMult(all, i, spin.combos),
      drama: reel.drama,
      result,
      newRecord,
      ...(reel.scripted ? { scripted: reel.scripted } : {}),
    });
  });
  spin.landed = spin.reels.every((x) => x.landed);
}

function nextLanding(spin: Spin): number {
  let at = Infinity;
  for (const x of spin.reels) if (!x.landed) at = Math.min(at, x.landAt);
  return at;
}

/** Advances the altar by `dt` seconds: spin, land reel by reel, rest, spin again. */
export function rollTick(state: GameState, rng: Rng, nowMs: number, dt: number, emit: EventSink): void {
  let t = dt;
  for (let guard = 0; guard < 40; guard++) {
    if (!state.roll.current) {
      // The start's quick spins end once there are knights enough for a squad.
      if (state.roll.tutorial !== 'done' && Object.keys(state.roster).length >= BAL.tutorial.knights) state.roll.tutorial = 'done';
      startSpin(state, rng, nowMs, emit);
    }
    const cur = state.roll.current!;
    const total = cur.spinSeconds + cur.restSeconds;
    const land = nextLanding(cur);
    const step = Math.max(0, Math.min(t, Math.min(land, total) - state.roll.timer));
    state.roll.timer += step;
    t -= step;
    if (!cur.landed && state.roll.timer >= land - 1e-9) {
      landReels(state, emit, state.roll.timer);
      continue;
    }
    if (state.roll.timer < total - 1e-9) return;
    state.roll.current = null;
    state.roll.timer = 0;
    if (t <= 1e-9) return;
  }
}

/** One whole spin at once (tests and tools); returns its reels. */
export function performSpin(state: GameState, rng: Rng, nowMs: number, emit: EventSink = () => {}): ReelResult[] {
  if (state.roll.current && !state.roll.current.landed) landReels(state, emit);
  const spin = startSpin(state, rng, nowMs, emit);
  landReels(state, emit);
  state.roll.current = null;
  state.roll.timer = 0;
  return spin.reels;
}

export function classLabel(cls: ClassId): string {
  return CLASSES[cls].name;
}
