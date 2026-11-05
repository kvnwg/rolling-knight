/**
 * Perks open after the first rebirth. Sigils (one for every boss beaten for the first time in a
 * run, plus one per rebirth at the start of each run) roll for them at the sage's: a roll lands on
 * a random perk you don't have yet, never one you have. Common perks come up most and Epic ones
 * least: a perk weighs 1 / its old sigil price (Common 1, Uncommon 1/2, Rare 1/3, Epic 1/4). A roll
 * costs a sigil, and a sigil more for every five perks owned (50 sigils for all twenty, about what
 * buying them did). A rebirth clears every perk, so each run builds its own combination. Most perks
 * change how the game plays rather than adding a little: they come with a trade-off. The four trees
 * only sort them.
 */
import { pickWeighted, rollRarityIndex, type RollRarity } from './rolls';
import type { GameState } from './state';

export type PerkTree = 'underdog' | 'command' | 'reels' | 'chaos';

/** A perk's rarity on the sage's roll. */
export type PerkRarity = Exclude<RollRarity, 'legendary'>;

export interface PerkDef {
  id: string;
  tree: PerkTree;
  name: string;
  /** How rare a roll is to land it (Common most often, Epic least). */
  rarity: PerkRarity;
  /** What it does in a few words, on its card (the whole of it is in `text`). */
  short: string;
  text: string;
  icon: string;
}

export const PERK_TREES: Array<{ id: PerkTree; name: string; text: string; color: string }> = [
  { id: 'underdog', name: 'Underdogs', text: 'Make cheap knights worth keeping.', color: '#8fbf5a' },
  { id: 'command', name: 'Command', text: 'Change how you lead the squad.', color: '#5aa7e0' },
  { id: 'reels', name: 'Rigged Reels', text: 'Bend the Summoning Altar.', color: '#e0b84a' },
  { id: 'chaos', name: 'Bad Ideas', text: 'Big swings, bigger risks.', color: '#e05a5a' },
];

export const PERKS: PerkDef[] = [
  // Underdogs
  { id: 'humbleBeginnings', tree: 'underdog', name: 'Humble Beginnings', rarity: 'common', icon: 'pitchfork', short: 'Commons level up 3x better', text: 'Common and Uncommon knights get 3× as much from every level-up.' },
  { id: 'peasantLevy', tree: 'underdog', name: 'Peasant Levy', rarity: 'uncommon', icon: 'scroll', short: 'More Commons, 3x gold each', text: 'Every 4th spin rolls at luck 1, so Commons keep coming. Common and Uncommon duplicates turn into 3x the gold.' },
  { id: 'ragsToRiches', tree: 'underdog', name: 'Rags to Riches', rarity: 'uncommon', icon: 'coin', short: 'Low-tier knights +25% stats a tier', text: 'Knights below Legendary get +25% stats for each tier they are below it.' },
  { id: 'peasantRevolt', tree: 'underdog', name: 'Peasant Revolt', rarity: 'rare', icon: 'torch', short: 'Low-tier squad: 2x damage', text: 'A squad of only Common, Uncommon and Rare knights deals double damage and dodges twice as often.' },
  { id: 'handMeDowns', tree: 'underdog', name: 'Hand-Me-Downs', rarity: 'epic', icon: 'chest', short: 'Common level-ups cost half', text: 'Common and Uncommon knights cost half the gold to level up.' },
  // Command
  { id: 'tagTeam', tree: 'command', name: 'Tag Team', rarity: 'common', icon: 'swap', short: 'Switch in: +30% damage for 4 s', text: 'The knight you switch to hits 30% harder for 4 seconds (at most once every 10 s).' },
  { id: 'loneWolf', tree: 'command', name: 'Lone Wolf', rarity: 'uncommon', icon: 'wolf', short: 'Fight alone: x3 HP, x2.5 damage', text: 'Your other two knights stay at camp. The one you control gets ×3 HP, ×2.5 damage and 30% faster specials.' },
  { id: 'hiveMind', tree: 'command', name: 'Hive Mind', rarity: 'uncommon', icon: 'eye', short: 'The squad dodges with you', text: 'When you dodge, your whole squad dodges with you. Allies\' skill rolls spin twice as fast.' },
  { id: 'warBanner', tree: 'command', name: 'War Banner', rarity: 'rare', icon: 'banner', short: 'Your hits speed up the squad', text: 'Each hit by the knight you control gives the squad +4% attack speed for 3 s, stacking to +40%.' },
  { id: 'heirloom', tree: 'command', name: 'Heirloom', rarity: 'epic', icon: 'crown', short: 'Keep your knight through rebirth', text: 'Your controlled knight survives your next rebirth with its levels.' },
  // Rigged Reels
  { id: 'fourLeafLitter', tree: 'reels', name: 'Four-Leaf Litter', rarity: 'common', icon: 'clover', short: '3x luck tokens, half sell price', text: 'Luck tokens land 3× as often. Duplicates sell for half.' },
  { id: 'bootlegReel', tree: 'reels', name: 'Bootleg Reel', rarity: 'uncommon', icon: 'reel', short: '+1 reel, slower spins', text: '+1 reel, but every spin is 50% slower.' },
  { id: 'greasedGears', tree: 'reels', name: 'Greased Gears', rarity: 'uncommon', icon: 'gear', short: 'Spins twice as fast', text: 'Spins run twice as fast, past the usual limit.' },
  { id: 'pawnShop', tree: 'reels', name: 'Pawn Shop', rarity: 'rare', icon: 'coin', short: 'Copies sell for 4x gold', text: 'Selling duplicates pays 4× the gold.' },
  { id: 'riggedJackpot', tree: 'reels', name: 'Rigged Jackpot', rarity: 'epic', icon: 'star', short: 'Every 25th spin: Legendary+', text: 'Every 25th spin, every reel lands Legendary or better.' },
  // Bad Ideas
  { id: 'glassCannon', tree: 'chaos', name: 'Glass Cannon', rarity: 'common', icon: 'skull', short: '2x damage, half HP', text: 'Double damage, half HP.' },
  { id: 'rollDancer', tree: 'chaos', name: 'Roll Dancer', rarity: 'uncommon', icon: 'boot', short: 'Dodge rolls cut through foes', text: 'Dodge rolls slice everything they pass through and recharge 50% faster. Auto attacks are 20% slower.' },
  { id: 'bloodPact', tree: 'chaos', name: 'Blood Pact', rarity: 'uncommon', icon: 'drop', short: 'Hits heal you; no Cleric heals', text: 'Every hit heals for 5% of its damage, but healing from Clerics does nothing.' },
  { id: 'berserker', tree: 'chaos', name: 'Berserker', rarity: 'rare', icon: 'axe', short: 'More damage at low HP', text: 'Up to +150% damage the lower a knight\'s HP.' },
  { id: 'kamikaze', tree: 'chaos', name: 'Kamikaze', rarity: 'epic', icon: 'bomb', short: 'Dodge rolls drop bombs', text: 'Every dodge roll leaves a bomb that blows up for 300% damage.' },
];

export const PERKS_BY_ID = new Map(PERKS.map((p) => [p.id, p]));

export function hasPerk(state: Pick<GameState, 'perks'>, id: string): boolean {
  return state.perks.includes(id);
}

export function perksOpen(state: Pick<GameState, 'rebirths'>): boolean {
  return state.rebirths >= 1;
}

// ------------------------------------------------------------------ the sage's roll

/** A roll's price: `base` sigils, and one more for every `per` perks owned. */
export const PERK_ROLL = { base: 1, per: 5 } as const;

/** What a perk weighs in the roll: 1 / its old sigil price (Common 1 to Epic 1/4). */
export function perkWeight(p: Pick<PerkDef, 'rarity'>): number {
  return 1 / (rollRarityIndex(p.rarity) + 1);
}

/** The sigils the next roll costs. */
export function perkRollPrice(state: Pick<GameState, 'perks'>): number {
  return PERK_ROLL.base + Math.floor(state.perks.length / PERK_ROLL.per);
}

/** Every perk not owned yet, with its chance on the next roll (the owned ones are out of it). */
export function perkOdds(state: Pick<GameState, 'perks'>): Array<{ perk: PerkDef; weight: number; chance: number }> {
  const rows = PERKS.filter((p) => !hasPerk(state, p.id)).map((perk) => ({ perk, weight: perkWeight(perk), chance: 0 }));
  const total = rows.reduce((s, r) => s + r.weight, 0);
  if (total > 0) for (const r of rows) r.chance = r.weight / total;
  return rows;
}

export function canRollPerk(state: Pick<GameState, 'perks' | 'rebirths' | 'sigils'>): boolean {
  return perksOpen(state) && PERKS.some((p) => !hasPerk(state, p.id)) && state.sigils >= perkRollPrice(state);
}

/** How many rolls the sigils cover in a row (each price as it climbs). */
export function perkRollsAffordable(state: Pick<GameState, 'perks' | 'rebirths' | 'sigils'>): number {
  if (!perksOpen(state)) return 0;
  let sigils = state.sigils;
  let owned = state.perks.length;
  let n = 0;
  const left = PERKS.filter((p) => !hasPerk(state, p.id)).length;
  while (n < left) {
    const price = PERK_ROLL.base + Math.floor(owned / PERK_ROLL.per);
    if (sigils < price) break;
    sigils -= price;
    owned++;
    n++;
  }
  return n;
}

export interface PerkRoll {
  perk: PerkDef;
  /** The chance the roll had of landing it. */
  chance: number;
  /** Sigils paid. */
  price: number;
}

/**
 * Rolls: pays the sigils and lands on a random perk not owned yet, by weight (`rand` uniform in
 * [0, 1), one number a roll). Null, and nothing paid, before the first rebirth, with every perk
 * owned, or short of sigils.
 */
export function rollPerk(state: Pick<GameState, 'perks' | 'rebirths' | 'sigils'>, rand: () => number): PerkRoll | null {
  if (!canRollPerk(state)) return null;
  const price = perkRollPrice(state);
  const pick = pickWeighted(perkOdds(state), rand());
  if (!pick) return null;
  state.sigils -= price;
  state.perks.push(pick.perk.id);
  return { perk: pick.perk, chance: pick.chance, price };
}
