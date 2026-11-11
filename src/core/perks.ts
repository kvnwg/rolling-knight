/**
 * Perks open after the first rebirth. Sigils (one for every boss beaten for the first time in a
 * run, plus one per rebirth at the start of each run) roll for them at the sage's: a roll lands on
 * a random perk he hasn't shown you yet this run. Common perks come up most and Epic ones least: a
 * perk weighs 1 / its old sigil price (Common 1, Uncommon 1/2, Rare 1/3, Epic 1/4).
 *
 * What a roll lands on is an offer, not a purchase: ACCEPT it (the sigils are paid then, and it's
 * yours for the run) or REJECT it (nothing is paid, and he won't offer that one again this run).
 * Many perks change how the game plays and come with a trade-off, so the choice is the player's:
 * nobody is handed half-price extras they didn't want. Turning offers down isn't free for ever,
 * though: a roll costs a sigil, and a sigil more for every five perks he has shown you, taken or
 * not (50 sigils for all twenty, taking every one). Reject the first five to fish for a better one
 * and the next costs two.
 *
 * A rebirth clears every perk and every rejection, so each run builds its own combination. The four
 * trees only sort them.
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
  // (Rarest for the strongest: half-price levels are a Common find, a low-tier squad at double damage an Epic one.)
  { id: 'handMeDowns', tree: 'underdog', name: 'Hand-Me-Downs', rarity: 'common', icon: 'chest', short: 'Common level-ups cost half', text: 'Common and Uncommon knights cost half the gold to level up.' },
  { id: 'peasantLevy', tree: 'underdog', name: 'Peasant Levy', rarity: 'uncommon', icon: 'scroll', short: 'Common extras worth 3x gold', text: 'Extras of Common and Uncommon knights are worth 3× the gold.' },
  { id: 'ragsToRiches', tree: 'underdog', name: 'Rags to Riches', rarity: 'uncommon', icon: 'coin', short: 'Low-tier knights +25% stats a tier', text: 'Knights below Legendary get +25% stats for each tier they are below it.' },
  { id: 'humbleBeginnings', tree: 'underdog', name: 'Humble Beginnings', rarity: 'rare', icon: 'pitchfork', short: 'Commons level up 3x better', text: 'Common and Uncommon knights get 3× as much from every level-up.' },
  { id: 'peasantRevolt', tree: 'underdog', name: 'Peasant Revolt', rarity: 'epic', icon: 'torch', short: 'Low-tier squad: 2x damage', text: 'A squad of only Common, Uncommon and Rare knights deals double damage, and its dodge rolls recharge twice as fast.' },
  // Command
  { id: 'vanguard', tree: 'command', name: 'Vanguard', rarity: 'common', icon: 'swap', short: 'Your leader hits 25% harder', text: 'The knight you lead (the one you play, on Auto or not) hits 25% harder. Switch leaders and it goes with you.' },
  { id: 'loneWolf', tree: 'command', name: 'Lone Wolf', rarity: 'uncommon', icon: 'wolf', short: 'Go alone: x3 HP, x2.5 damage', text: 'Go down alone (leave the other squad slots empty) and your knight gets ×3 HP, ×2.5 damage and skill rolls that spin 30% faster. With a squad, nothing changes.' },
  { id: 'hiveMind', tree: 'command', name: 'Hive Mind', rarity: 'uncommon', icon: 'eye', short: 'The squad dodges with you', text: 'When you dodge, your whole squad dodges with you. Allies\' skill rolls spin twice as fast.' },
  { id: 'warBanner', tree: 'command', name: 'War Banner', rarity: 'rare', icon: 'banner', short: 'Your hits speed up the squad', text: 'Each hit by the knight you control gives the squad +4% attack speed for 3 s, stacking to +40%.' },
  { id: 'shieldWall', tree: 'command', name: 'Shield Wall', rarity: 'epic', icon: 'shield', short: 'Squad +35% HP', text: 'Every knight in the squad has 35% more HP.' },
  // Rigged Reels
  { id: 'fourLeafLitter', tree: 'reels', name: 'Four-Leaf Litter', rarity: 'common', icon: 'clover', short: '3x luck tokens, extras worth half', text: 'Luck tokens land 3× as often. Extras are worth half the gold.' },
  { id: 'bootlegReel', tree: 'reels', name: 'Bootleg Reel', rarity: 'uncommon', icon: 'reel', short: '+1 reel, slower spins', text: '+1 reel, but every spin is 50% slower.' },
  { id: 'greasedGears', tree: 'reels', name: 'Greased Gears', rarity: 'uncommon', icon: 'gear', short: 'Spins twice as fast', text: 'Spins run twice as fast, past the usual limit.' },
  { id: 'pawnShop', tree: 'reels', name: 'Pawn Shop', rarity: 'rare', icon: 'coin', short: 'Extras worth 4x gold', text: 'Extras are worth 4× the gold.' },
  { id: 'riggedJackpot', tree: 'reels', name: 'Rigged Jackpot', rarity: 'epic', icon: 'star', short: 'Every 25th spin: Legendary+', text: 'Every 25th spin, every reel lands Legendary or better.' },
  // Bad Ideas
  { id: 'glassCannon', tree: 'chaos', name: 'Glass Cannon', rarity: 'common', icon: 'skull', short: '2x damage, half HP', text: 'Double damage, half HP.' },
  { id: 'rollDancer', tree: 'chaos', name: 'Roll Dancer', rarity: 'uncommon', icon: 'boot', short: 'Dodge rolls cut through foes', text: 'Dodge rolls slice everything they pass through and recharge twice as fast. Attacks are 20% slower.' },
  { id: 'bloodPact', tree: 'chaos', name: 'Blood Pact', rarity: 'uncommon', icon: 'drop', short: 'Hits heal you; no Cleric heals', text: "Every hit heals for 5% of its damage, but Clerics' healing does nothing (they can still raise the fallen)." },
  { id: 'berserker', tree: 'chaos', name: 'Berserker', rarity: 'rare', icon: 'axe', short: 'More damage at low HP', text: 'Up to +150% damage the lower a knight\'s HP.' },
  { id: 'kamikaze', tree: 'chaos', name: 'Powder Trail', rarity: 'epic', icon: 'bomb', short: 'Dodge rolls drop bombs', text: 'Every dodge roll leaves a bomb that blows up for 300% damage.' },
];

export const PERKS_BY_ID = new Map(PERKS.map((p) => [p.id, p]));

export function hasPerk(state: Pick<GameState, 'perks'>, id: string): boolean {
  return state.perks.includes(id);
}

/** What the sage's roll works on: the perks owned, those turned down this run, and the offer on his counter. */
export type PerkBook = Pick<GameState, 'perks' | 'perksPassed' | 'perkOffer'>;
type Purse = Pick<GameState, 'rebirths' | 'sigils'>;

/** Turned down this run (REJECT): out of the roll until the next rebirth. */
export function passedPerk(state: Pick<GameState, 'perksPassed'>, id: string): boolean {
  return (state.perksPassed ?? []).includes(id);
}

/** The perk on the sage's counter, waiting for ACCEPT or REJECT (null: none). */
export function perkOffer(state: Pick<GameState, 'perkOffer'>): PerkDef | null {
  return (state.perkOffer && PERKS_BY_ID.get(state.perkOffer)) || null;
}

/** How many perks the sage has shown you this run, taken or turned down (the price climbs with it). */
export function perksShown(state: Pick<GameState, 'perks' | 'perksPassed'>): number {
  return state.perks.length + (state.perksPassed ?? []).length;
}

export function perksOpen(state: Pick<GameState, 'rebirths'>): boolean {
  return state.rebirths >= 1;
}

// ------------------------------------------------------------------ the sage's roll

/** A roll's price: `base` sigils, and one more for every `per` perks the sage has shown you (taken or turned down). */
export const PERK_ROLL = { base: 1, per: 5 } as const;

/** What a perk weighs in the roll: 1 / its old sigil price (Common 1 to Epic 1/4). */
export function perkWeight(p: Pick<PerkDef, 'rarity'>): number {
  return 1 / (rollRarityIndex(p.rarity) + 1);
}

/**
 * The sigils the next perk costs: what ACCEPT takes for the offer on the counter, or what a roll
 * needs in the purse (a roll itself takes nothing: the sigils are paid when its offer is accepted).
 */
export function perkRollPrice(state: Pick<GameState, 'perks' | 'perksPassed'>): number {
  return PERK_ROLL.base + Math.floor(perksShown(state) / PERK_ROLL.per);
}

/** In the roll: not owned, and not turned down this run. */
function inRoll(state: Pick<GameState, 'perks' | 'perksPassed'>, p: PerkDef): boolean {
  return !hasPerk(state, p.id) && !passedPerk(state, p.id);
}

/** Every perk still in the roll, with its chance on the next one (owned and turned-down perks are out of it). */
export function perkOdds(state: Pick<GameState, 'perks' | 'perksPassed'>): Array<{ perk: PerkDef; weight: number; chance: number }> {
  const rows = PERKS.filter((p) => inRoll(state, p)).map((perk) => ({ perk, weight: perkWeight(perk), chance: 0 }));
  const total = rows.reduce((s, r) => s + r.weight, 0);
  if (total > 0) for (const r of rows) r.chance = r.weight / total;
  return rows;
}

/** A roll can start: perks are open, nothing is waiting on the counter, the roll isn't empty, and the purse covers what it lands on. */
export function canRollPerk(state: PerkBook & Purse): boolean {
  return perksOpen(state) && !perkOffer(state) && PERKS.some((p) => inRoll(state, p)) && state.sigils >= perkRollPrice(state);
}

/**
 * How many perks the sigils cover in a row, taking each as it comes (each price as it climbs): the
 * number on the sage's tab. An offer on the counter is the first of them.
 */
export function perkRollsAffordable(state: PerkBook & Purse): number {
  if (!perksOpen(state)) return 0;
  let sigils = state.sigils;
  let shown = perksShown(state);
  let n = 0;
  const left = PERKS.filter((p) => inRoll(state, p)).length;
  while (n < left) {
    const price = PERK_ROLL.base + Math.floor(shown / PERK_ROLL.per);
    if (sigils < price) break;
    sigils -= price;
    shown++;
    n++;
  }
  return n;
}

export interface PerkRoll {
  perk: PerkDef;
  /** The chance the roll had of landing it. */
  chance: number;
  /** Sigils it costs to accept (nothing is paid for the roll itself). */
  price: number;
}

/**
 * Rolls: lands on a random perk still in the roll, by weight (`rand` uniform in [0, 1), one number
 * a roll), and puts it on the counter as an offer (acceptPerk, rejectPerk). Nothing is paid yet.
 * Null before the first rebirth, with an offer already waiting, with nothing left in the roll, or
 * short of the sigils the offer would cost.
 */
export function rollPerk(state: PerkBook & Purse, rand: () => number): PerkRoll | null {
  if (!canRollPerk(state)) return null;
  const price = perkRollPrice(state);
  const pick = pickWeighted(perkOdds(state), rand());
  if (!pick) return null;
  state.perkOffer = pick.perk.id;
  return { perk: pick.perk, chance: pick.chance, price };
}

/** ACCEPT: the offer's sigils are paid and the perk is yours for the run. Null with nothing on the counter (or, somehow, too few sigils). */
export function acceptPerk(state: PerkBook & Purse): PerkDef | null {
  const perk = perkOffer(state);
  if (!perk) return null;
  const price = perkRollPrice(state);
  if (state.sigils < price) return null;
  state.sigils -= price;
  state.perkOffer = null;
  if (!hasPerk(state, perk.id)) state.perks.push(perk.id);
  return perk;
}

/**
 * REJECT: the offer goes back, nothing paid, and it's out of the roll for the rest of the run (it
 * still counts as shown: the price climbs with every five perks seen, taken or not).
 */
export function rejectPerk(state: PerkBook): PerkDef | null {
  const perk = perkOffer(state);
  if (!perk) return null;
  state.perkOffer = null;
  state.perksPassed ??= [];
  if (!passedPerk(state, perk.id)) state.perksPassed.push(perk.id);
  return perk;
}

/** A roll taken as it lands (the bots in tools/, and tests that only want the perk): rollPerk, then acceptPerk. */
export function rollAndTakePerk(state: PerkBook & Purse, rand: () => number): PerkRoll | null {
  const r = rollPerk(state, rand);
  if (r) acceptPerk(state);
  return r;
}
