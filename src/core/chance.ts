/**
 * The chance lines of the upgrade map, as numbers: combat tricks that roll their dice in every fight.
 * This file is pure (no world, no DOM): what each line's tiers add up to, and the rolls themselves,
 * which take an Rng so a run stays the same for the same seed. src/world/chance.ts plays them on a
 * dungeon floor (hits, kills, a knight going down, foes tripping).
 *
 *  - Lucky Strike: any hit can be LUCKY, x5 damage.
 *  - Double or Nothing: some hits flip a coin, double or nothing (Two-Headed Coin: double 2 in 3).
 *  - Ricochet: arrows and bolts sometimes bounce on to another foe.
 *  - Wild Magic: any hit can cast a random spell from the knights' kits.
 *  - Second Wind: once a floor, a knight may shrug off a killing blow.
 *  - Butterfingers: foes sometimes fumble an attack (no damage, and they're dazed).
 *  - Pratfall: foes trip over their own feet now and then.
 *  - Coin Shower: any kill can burst into three times its gold.
 *  - Jackpot: a tiny chance a kill wins a Lucky Spin.
 *  - Sands of Fortune: any kill can drop an Hourglass.
 *  - Giant Slayer and Leechblade (squad lines, played on hits too): more damage to elites and
 *    bosses, and a little healing from every hit.
 *  - Lady Luck: every chance above comes up 25% more often.
 *  - Loaded Dice: skill rolls lean rarer (`skillRollLuck`, for the skill roller to read).
 */
import type { Rng } from './rng';
import type { GameState } from './state';
import { tier } from './upgrades';

/** No chance ever reaches certainty. */
const CAP = 0.95;
const cap = (p: number) => Math.max(0, Math.min(CAP, p));

export const CHANCE = {
  luckyStrike: { perTier: 0.015, mult: 5 },
  doubleOrNothing: { perTier: 0.1, heads: 0.5, twoHeaded: 2 / 3 },
  ricochet: { perTier: 0.08, dmg: 0.8, maxBounces: 3, range: 72 },
  wildMagic: { perTier: 0.01, cooldown: 4 },
  secondWind: { perTier: 0.15, hpShare: 0.3, invuln: 1.2 },
  butterfingers: { perTier: 0.03, daze: 1, bossShare: 0.5 },
  pratfall: { perTier: 0.02, stun: 1.6, eliteStun: 0.8 },
  coinShower: { perTier: 0.04, mult: 3 },
  jackpot: { perTier: 0.0025 },
  sands: { perTier: 0.01 },
  giantSlayer: { perTier: 0.15 },
  lifesteal: { perTier: 0.02 },
  ladyLuck: 1.25,
  loadedDice: { perTier: 0.4 },
} as const;

/** What the chance lines add up to for this save's tiers. Every chance is a probability (0 to 0.95). */
export interface ChanceFx {
  /** Chance a hit is LUCKY, and what a LUCKY hit multiplies by. */
  luckyStrike: number;
  luckyMult: number;
  /** Chance a hit flips the coin, and the chance the coin lands double. */
  coinFlip: number;
  coinHeads: number;
  /** Chance an arrow or bolt bounces on, its damage share after a bounce, and the most bounces a shot makes. */
  ricochet: number;
  ricochetDmg: number;
  ricochetMax: number;
  /** Chance a hit casts a random spell, and the seconds a knight waits before it can again. */
  wildMagic: number;
  wildMagicCd: number;
  /** Chance a killing blow is shrugged off (once a floor per knight), and the HP share it leaves. */
  secondWind: number;
  secondWindHp: number;
  /** Chance a foe's hit is fumbled. */
  butterfingers: number;
  /** Chance a second that a walking foe trips. */
  pratfall: number;
  /** Chance a kill showers gold, and how many times its gold the shower is. */
  coinShower: number;
  coinShowerMult: number;
  /** Chance a kill wins a Lucky Spin. */
  jackpot: number;
  /** Chance a kill drops an Hourglass. */
  sands: number;
  /** Extra damage share against elites and bosses. */
  giantSlayer: number;
  /** Share of damage dealt that heals the knight who dealt it. */
  lifesteal: number;
  /** What Lady Luck multiplies every chance by (1 without her). */
  ladyLuck: number;
  /** True when any line here does anything (the world skips everything otherwise). */
  any: boolean;
}

export function chanceFx(state: Pick<GameState, 'upgrades'>): ChanceFx {
  const C = CHANCE;
  const lady = tier(state, 'ladyLuck') > 0 ? C.ladyLuck : 1;
  const p = (id: Parameters<typeof tier>[1], per: number) => cap(tier(state, id) * per * lady);
  const fx: ChanceFx = {
    luckyStrike: p('luckyStrike', C.luckyStrike.perTier),
    luckyMult: C.luckyStrike.mult,
    // (The coin is variance, not luck: Lady Luck leaves how often it flips alone.)
    coinFlip: cap(tier(state, 'doubleOrNothing') * C.doubleOrNothing.perTier),
    coinHeads: tier(state, 'twoHeaded') > 0 ? C.doubleOrNothing.twoHeaded : C.doubleOrNothing.heads,
    ricochet: p('ricochet', C.ricochet.perTier),
    ricochetDmg: C.ricochet.dmg,
    ricochetMax: C.ricochet.maxBounces,
    wildMagic: p('wildMagic', C.wildMagic.perTier),
    wildMagicCd: C.wildMagic.cooldown,
    secondWind: p('secondWind', C.secondWind.perTier),
    secondWindHp: C.secondWind.hpShare,
    butterfingers: p('butterfingers', C.butterfingers.perTier),
    pratfall: p('pratfall', C.pratfall.perTier),
    coinShower: p('coinShower', C.coinShower.perTier),
    coinShowerMult: C.coinShower.mult,
    jackpot: p('jackpot', C.jackpot.perTier),
    sands: p('sands', C.sands.perTier),
    giantSlayer: tier(state, 'giantSlayer') * C.giantSlayer.perTier,
    lifesteal: tier(state, 'lifesteal') * C.lifesteal.perTier,
    ladyLuck: lady,
    any: false,
  };
  fx.any =
    fx.luckyStrike + fx.coinFlip + fx.ricochet + fx.wildMagic + fx.secondWind + fx.butterfingers + fx.pratfall + fx.coinShower + fx.jackpot + fx.sands + fx.giantSlayer + fx.lifesteal > 0;
  return fx;
}

/**
 * Loaded Dice, for the per-class skill rolls: a luck multiplier for the skill roll (1 with no tiers,
 * +40% a tier). Multiply the skill roll's luck by it, the way the altar's luck works: each rarer
 * skill tier hits with a chance of luck / X.
 */
export function skillRollLuck(state: Pick<GameState, 'upgrades'>): number {
  return 1 + tier(state, 'loadedDice') * CHANCE.loadedDice.perTier;
}

// ------------------------------------------------------------------ the rolls (pure)

export type CoinFace = 'double' | 'nothing';

export interface HitRoll {
  /** What the hit's damage is multiplied by (0 when the coin says nothing). */
  mult: number;
  lucky: boolean;
  coin: CoinFace | null;
  /** The target is an elite or a boss and Giant Slayer added to the hit. */
  giant: boolean;
}

/**
 * The dice on one hit by a knight: the coin first (nothing ends it), then a LUCKY hit, then Giant
 * Slayer. Rolls only the dice that can matter, so a save without these lines never touches the Rng.
 */
export function rollHit(fx: ChanceFx, rng: Rng, bigFoe: boolean): HitRoll {
  let mult = 1;
  let coin: CoinFace | null = null;
  if (fx.coinFlip > 0 && rng.chance(fx.coinFlip)) {
    coin = rng.chance(fx.coinHeads) ? 'double' : 'nothing';
    if (coin === 'nothing') return { mult: 0, lucky: false, coin, giant: false };
    mult *= 2;
  }
  const lucky = fx.luckyStrike > 0 && rng.chance(fx.luckyStrike);
  if (lucky) mult *= fx.luckyMult;
  const giant = bigFoe && fx.giantSlayer > 0;
  if (giant) mult *= 1 + fx.giantSlayer;
  return { mult, lucky, coin, giant };
}

/** The average a hit is multiplied by (for the buy card and the tests): coin, LUCKY, Giant Slayer. */
export function expectedHitMult(fx: ChanceFx, bigFoe: boolean): number {
  const coin = 1 - fx.coinFlip + fx.coinFlip * fx.coinHeads * 2;
  const lucky = 1 + fx.luckyStrike * (fx.luckyMult - 1);
  return coin * lucky * (bigFoe ? 1 + fx.giantSlayer : 1);
}

/** What a kill sets off: a coin shower, a jackpot, an Hourglass. */
export interface KillRoll {
  shower: boolean;
  jackpot: boolean;
  hourglass: boolean;
}

export function rollKill(fx: ChanceFx, rng: Rng): KillRoll {
  return {
    shower: fx.coinShower > 0 && rng.chance(fx.coinShower),
    jackpot: fx.jackpot > 0 && rng.chance(fx.jackpot),
    hourglass: fx.sands > 0 && rng.chance(fx.sands),
  };
}

/** Chance a walking foe trips within `dt` seconds (Pratfall's per-second chance, spread over frames). */
export function tripChance(fx: ChanceFx, dt: number): number {
  return fx.pratfall > 0 ? 1 - Math.pow(1 - fx.pratfall, Math.max(0, dt)) : 0;
}
