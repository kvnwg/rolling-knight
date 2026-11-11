/**
 * The tinker's Combat tab: combat upgrades are rolled for gold, never bought. A roll pays the price
 * and lands on one combat line that isn't maxed, which gains a tier. Every combat line (the squad's
 * and the chance lines, src/core/upgrades.ts) is in the roll from the start.
 *
 * Odds. A line weighs `line` × `falloff`^(its next tier - 1): higher tiers come up less often, but
 * gently (Strength III is about 1.6 times rarer than Attack Speed I, Strength VIII about 5 times),
 * so the tab fills out evenly. The one-offs (Excalibur, Dragonscale, Two-Headed Coin, Lady Luck)
 * weigh `oneOff`, about as rare as an eighth tier. How rare a result is sets its reel's drama:
 * tiers I and II are Common, III and IV Uncommon, V and VI Rare, VII and VIII Epic, a one-off
 * Legendary.
 *
 * Price. `base` × `growth`^(combat tiers owned), to two figures: about what the cheapest combat tiers
 * cost when they were bought, and maxing the tab costs about what buying every tier did (tests check).
 *
 * Variance. One roll in ten is a DOUBLE: the line gains two tiers (when it has two to go). One in
 * twenty is FREE: the gold comes back.
 *
 * The first roll is on the house (once a save, rebirths or not): the tutorial asks for it before a
 * new player has the gold.
 */
import { priceScale } from './economy';
import { pickWeighted, tidyPrice, type RollRarity } from './rolls';
import type { GameState } from './state';
import { UPGRADES, tier, upgradeTab, type UpgradeDef, type UpgradeId } from './upgrades';

export const COMBAT_ROLL = {
  price: { base: 150, growth: 1.12 },
  weight: { line: 1, oneOff: 0.2, falloff: 0.8 },
  double: 0.1,
  free: 0.05,
} as const;

/** Every combat line, in the order UPGRADES lists them. */
export const COMBAT_LINES: readonly UpgradeDef[] = UPGRADES.filter((u) => upgradeTab(u) === 'combat');

/** Combat tiers in all (every line maxed). */
export const COMBAT_TIERS_MAX = COMBAT_LINES.reduce((n, u) => n + u.max, 0);

/** Combat tiers owned, over every line. */
export function combatTiers(state: Pick<GameState, 'upgrades'>): number {
  return COMBAT_LINES.reduce((n, u) => n + tier(state, u.id), 0);
}

/** The price of a roll with `owned` combat tiers owned. */
export function combatRollPriceAt(owned: number, scale = 1): number {
  const P = COMBAT_ROLL.price;
  return tidyPrice(P.base * Math.pow(P.growth, Math.max(0, owned)) * scale);
}

/** What the next roll costs. */
export function combatRollPrice(state: Pick<GameState, 'upgrades'> & Partial<Pick<GameState, 'rebirths'>>): number {
  return combatRollPriceAt(combatTiers(state), priceScale(state));
}

/** A line's weight in the roll for landing its tier `next` (1-based). */
export function lineWeight(def: Pick<UpgradeDef, 'special'>, next: number): number {
  const W = COMBAT_ROLL.weight;
  return (def.special ? W.oneOff : W.line) * Math.pow(W.falloff, Math.max(0, next - 1));
}

const TIER_RARITY: readonly RollRarity[] = ['common', 'common', 'uncommon', 'uncommon', 'rare', 'rare', 'epic', 'epic'];

/** How rare tier `t` of a line is (its reel's drama and color). */
export function tierRarity(def: Pick<UpgradeDef, 'special'>, t: number): RollRarity {
  if (def.special) return 'legendary';
  return TIER_RARITY[Math.max(0, Math.min(TIER_RARITY.length - 1, t - 1))];
}

export interface LineOdds {
  def: UpgradeDef;
  /** Tiers owned. */
  tier: number;
  /** The tier a roll landing here gives (null when maxed). */
  next: number | null;
  weight: number;
  /** The chance the next roll lands on this line (0 when maxed). */
  chance: number;
  /** How rare its next tier is (null when maxed). */
  rarity: RollRarity | null;
}

/** Every combat line with its tier and its chance on the next roll. */
export function combatOdds(state: Pick<GameState, 'upgrades'>): LineOdds[] {
  const rows = COMBAT_LINES.map((def) => {
    const t = tier(state, def.id);
    const next = t < def.max ? t + 1 : null;
    return { def, tier: t, next, weight: next ? lineWeight(def, next) : 0, chance: 0, rarity: next ? tierRarity(def, next) : null };
  });
  const total = rows.reduce((s, r) => s + r.weight, 0);
  if (total > 0) for (const r of rows) r.chance = r.weight / total;
  return rows;
}

/** Some combat line still has a tier to give. */
export function combatPoolOpen(state: Pick<GameState, 'upgrades'>): boolean {
  return combatTiers(state) < COMBAT_TIERS_MAX;
}

/** The first roll is still to come, and free (a state without `seen`, as in tests, has none). */
export function combatGift(state: Partial<Pick<GameState, 'seen'>>): boolean {
  return !!state.seen && !state.seen.combatGift;
}

export function canRollCombat(state: Pick<GameState, 'upgrades' | 'gold'> & Partial<Pick<GameState, 'seen'>>): boolean {
  return combatPoolOpen(state) && (combatGift(state) || state.gold >= combatRollPrice(state));
}

/** How many rolls the gold covers in a row (each one dearer than the last), up to `cap`. */
export function combatRollsAffordable(state: Pick<GameState, 'upgrades' | 'gold'> & Partial<Pick<GameState, 'rebirths' | 'seen'>>, cap = 99): number {
  let gold = state.gold;
  let owned = combatTiers(state);
  let n = 0;
  const scale = priceScale(state);
  // (The free first roll costs nothing, and the next is priced as if it gave one tier.)
  if (cap > 0 && owned < COMBAT_TIERS_MAX && combatGift(state)) {
    owned++;
    n++;
  }
  while (n < cap && owned < COMBAT_TIERS_MAX) {
    const price = combatRollPriceAt(owned, scale);
    if (gold < price) break;
    gold -= price;
    owned++;
    n++;
  }
  return n;
}

export interface CombatRoll {
  id: UpgradeId;
  /** Tiers before and after (two apart on a double). */
  from: number;
  to: number;
  /** The chance the roll had of landing this line. */
  chance: number;
  /** How rare the tier it landed is. */
  rarity: RollRarity;
  /** Two tiers instead of one. */
  double: boolean;
  /** The gold came back. */
  free: boolean;
  /** The first roll, on the house: it never cost anything. */
  gift: boolean;
  /** The roll's price, and the gold it took (0 when free or a gift). */
  price: number;
  paid: number;
}

/**
 * Rolls: pays, picks a line by weight and gives it a tier (two on a double). `rand` gives uniform
 * numbers in [0, 1); a roll always takes three (the pick, the double, the free roll). Null, and
 * nothing paid, when every line is maxed or the gold is short. The first roll (combatGift) takes no
 * gold, and isn't FREE as well (nothing to give back).
 */
export function rollCombat(state: Pick<GameState, 'upgrades' | 'gold'> & Partial<Pick<GameState, 'seen'>>, rand: () => number): CombatRoll | null {
  if (!canRollCombat(state)) return null;
  const gift = combatGift(state);
  const price = combatRollPrice(state);
  const odds = combatOdds(state);
  const u = rand();
  const dbl = rand() < COMBAT_ROLL.double;
  const free = rand() < COMBAT_ROLL.free;
  const pick = pickWeighted(odds, u);
  if (!pick || pick.next === null) return null;
  const from = pick.tier;
  const double = dbl && pick.def.max - from >= 2;
  const to = from + (double ? 2 : 1);
  const paid = free || gift ? 0 : price;
  state.gold -= paid;
  state.upgrades[pick.def.id] = to;
  if (gift) state.seen!.combatGift = true;
  return { id: pick.def.id, from, to, chance: pick.chance, rarity: tierRarity(pick.def, from + 1), double, free: free && !gift, gift, price, paid };
}
