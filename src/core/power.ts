/**
 * The balancing system: Power, par and difficulty.
 *
 * POWER. Every knight has a rating from its real dungeon stats: damage per second and HP, each measured
 * against a level-1 Common of its class with no upgrades (that knight rates 100). So it counts rarity,
 * level, mutation, upgrades, rebirths and perks alike, and every class is on the same scale. Squad
 * Power is the three ratings added up: three level-1 Commons make 300.
 *
 * PAR. The Squad Power the game expects on each floor, from floor 1 (where the tutorial's first finds
 * put you) growing a fixed share every floor.
 *
 * DIFFICULTY. What a floor's foes are built for, set when the floor starts. At par it is par. A squad
 * above par meets foes that grow with it, partly: power^0.6, so four times par clears about 1.7x faster
 * than par, not four times, and nothing folds in one hit. A squad below par gets only a gentle hand
 * (power^0.2): the wall is real, and rolling, levelling and upgrading are how you climb it.
 *
 * FOES are built from targets, not raw numbers. At a difficulty D, an ordinary foe takes `ttk.mob`
 * seconds of the damage of a squad of Power D to kill, and each of its hits takes `hit.mob` of an
 * average knight's HP in that squad; elites and bosses have their own targets. Each foe type keeps its
 * own shape against the plain chaser (a tank has three times its HP, a bomber hits more than twice as hard).
 */
import { BAL } from './balance';
import { CLASSES, knightDef } from './knights';
import { knightStats } from './roster';
import type { GameState } from './state';

const B = BAL.balance;

/** The squad every number is measured against: Common Guardian, Blade and Ranger at level 1. */
const REF_CLASSES = ['guardian', 'blade', 'ranger'] as const;
/** Squad Power of that squad. */
export const REF_POWER = 300;
/** Its auto attacks' damage per second, together, and its knights' average HP. */
export const REF_DPS = REF_CLASSES.reduce((s, c) => s + CLASSES[c].atk / CLASSES[c].atkCd, 0);
export const REF_HP = REF_CLASSES.reduce((s, c) => s + CLASSES[c].hp, 0) / REF_CLASSES.length;
/** The plain foe every type's shape is measured against (the chaser's base stats). */
export const REF_FOE = { hp: 30, atk: 6 };

// ------------------------------------------------------------------ power

/** A knight's rating: 100 for a level-1 Common of its class with no upgrades. */
export function knightRating(state: GameState, id: string): number {
  const st = knightStats(state, id);
  const cls = CLASSES[knightDef(id).cls];
  const dps = st.atk / st.atkCd / (cls.atk / cls.atkCd);
  const hp = st.hp / cls.hp;
  return 100 * Math.sqrt(Math.max(0, dps * hp));
}

/** The three squad ratings added up (an empty slot adds nothing). */
export function squadPower(state: GameState): number {
  return state.squad.reduce((s, id) => s + (id && state.roster[id] ? knightRating(state, id) : 0), 0);
}

// ------------------------------------------------------------------ par and difficulty

/** The Squad Power the game expects on `floor`. */
export function floorPar(floor: number): number {
  return B.parBase * Math.pow(B.parGrowth, Math.max(0, floor - 1));
}

export type Challenge = 'deadly' | 'hard' | 'fair' | 'easy' | 'trivial';

export const CHALLENGE: Record<Challenge, { name: string; color: string; text: string }> = {
  deadly: { name: 'Deadly', color: '#ff5a5a', text: 'Far too strong for this squad. Roll, level and upgrade first.' },
  hard: { name: 'Hard', color: '#ff9a3a', text: 'Tough fights. Dodge the big hits and keep the healer alive.' },
  fair: { name: 'Fair', color: '#ffcf4a', text: 'A fair fight for this squad.' },
  easy: { name: 'Easy', color: '#8af07a', text: 'Your squad is ahead of this floor.' },
  trivial: { name: 'Trivial', color: '#7fd6ff', text: 'Far ahead. The foes rise to meet you, but the deeper floors pay more.' },
};

export interface Difficulty {
  /** The floor's par, the squad's power, and power / par. */
  par: number;
  power: number;
  ratio: number;
  /** What the foes are built for, in Squad Power. */
  value: number;
  challenge: Challenge;
}

export function challengeOf(ratio: number): Challenge {
  if (ratio < 0.5) return 'deadly';
  if (ratio < 0.8) return 'hard';
  if (ratio < 1.3) return 'fair';
  if (ratio < 4) return 'easy';
  return 'trivial';
}

/** What a floor's foes are built for, given the squad's power when it starts. */
export function floorDifficulty(floor: number, power: number): Difficulty {
  const par = floorPar(floor);
  const ratio = power > 0 ? power / par : 1;
  const band = ratio >= 1 ? Math.pow(ratio, B.aboveExp) : Math.pow(ratio, B.belowExp);
  const value = par * Math.max(B.minBand, Math.min(B.maxBand, band));
  return { par, power, ratio, value, challenge: challengeOf(ratio) };
}

// ------------------------------------------------------------------ foes

export type FoeTier = 'mob' | 'elite' | 'boss';

/** A foe's HP and hit at difficulty `d` (in Squad Power), for its type's shape and its tier. */
export function foeStats(shape: { hp: number; atk: number }, d: number, tier: FoeTier): { hp: number; atk: number } {
  const k = d / REF_POWER;
  const dps = REF_DPS * k;
  const hp = REF_HP * k;
  if (tier === 'boss') return { hp: B.ttk.boss * dps, atk: B.hit.boss * hp };
  const sh = shape.hp / REF_FOE.hp;
  const sa = shape.atk / REF_FOE.atk;
  return { hp: B.ttk[tier] * dps * sh, atk: B.hit[tier] * hp * sa };
}

/**
 * The fight a floor offers a squad, in seconds and shares: how long the squad's damage takes to kill a
 * plain foe, an elite and the boss, and how much of a knight's HP one hit takes (for the balance
 * report and tests).
 */
export function fightReport(floor: number, power: number) {
  const d = floorDifficulty(floor, power);
  const squadDps = REF_DPS * (power / REF_POWER);
  const knightHp = REF_HP * (power / REF_POWER);
  const at = (tier: FoeTier) => {
    const f = foeStats(REF_FOE, d.value, tier);
    return { ttk: f.hp / squadDps, hit: f.atk / knightHp };
  };
  return { ...d, mob: at('mob'), elite: at('elite'), boss: at('boss') };
}
