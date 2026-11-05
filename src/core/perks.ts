/**
 * Perks open after the first rebirth. Sigils (one for every boss beaten for the first time in a
 * run, plus one per rebirth at the start of each run) buy them from four trees; deeper perks need
 * the ones above them. A rebirth clears every perk, so each run builds its own combination.
 * Most perks change how the game plays rather than adding a little: they come with a trade-off.
 */
import type { GameState } from './state';

export type PerkTree = 'underdog' | 'command' | 'reels' | 'chaos';

export interface PerkDef {
  id: string;
  tree: PerkTree;
  name: string;
  cost: number;
  requires: string[];
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
  { id: 'humbleBeginnings', tree: 'underdog', name: 'Humble Beginnings', cost: 1, requires: [], icon: 'pitchfork', short: 'Commons level up 3x better', text: 'Common and Uncommon knights get 3× as much from every level-up.' },
  { id: 'peasantLevy', tree: 'underdog', name: 'Peasant Levy', cost: 2, requires: ['humbleBeginnings'], icon: 'scroll', short: 'More Commons, 3x gold each', text: 'Every 4th spin rolls at luck 1, so Commons keep coming. Common and Uncommon duplicates turn into 3x the gold.' },
  { id: 'ragsToRiches', tree: 'underdog', name: 'Rags to Riches', cost: 2, requires: ['humbleBeginnings'], icon: 'coin', short: 'Low-tier knights +25% stats a tier', text: 'Knights below Legendary get +25% stats for each tier they are below it.' },
  { id: 'peasantRevolt', tree: 'underdog', name: 'Peasant Revolt', cost: 3, requires: ['peasantLevy', 'ragsToRiches'], icon: 'torch', short: 'Low-tier squad: 2x damage', text: 'A squad of only Common, Uncommon and Rare knights deals double damage and dodges twice as often.' },
  { id: 'handMeDowns', tree: 'underdog', name: 'Hand-Me-Downs', cost: 4, requires: ['peasantRevolt'], icon: 'chest', short: 'Common level-ups cost half', text: 'Common and Uncommon knights cost half the gold to level up.' },
  // Command
  { id: 'tagTeam', tree: 'command', name: 'Tag Team', cost: 1, requires: [], icon: 'swap', short: 'Switching lands a skill at once', text: 'Switching knights makes the incoming knight\'s skill roll land at once (once every 8 s).' },
  { id: 'loneWolf', tree: 'command', name: 'Lone Wolf', cost: 2, requires: ['tagTeam'], icon: 'wolf', short: 'Fight alone: x3 HP, x2.5 damage', text: 'Your other two knights stay at camp. The one you control gets ×3 HP, ×2.5 damage and 30% faster specials.' },
  { id: 'hiveMind', tree: 'command', name: 'Hive Mind', cost: 2, requires: ['tagTeam'], icon: 'eye', short: 'The squad dodges with you', text: 'When you dodge, your whole squad dodges with you. Allies\' specials recharge twice as fast.' },
  { id: 'warBanner', tree: 'command', name: 'War Banner', cost: 3, requires: ['loneWolf', 'hiveMind'], icon: 'banner', short: 'Your hits speed up the squad', text: 'Each hit by the knight you control gives the squad +4% attack speed for 3 s, stacking to +40%.' },
  { id: 'heirloom', tree: 'command', name: 'Heirloom', cost: 4, requires: ['warBanner'], icon: 'crown', short: 'Keep your knight through rebirth', text: 'Your controlled knight survives your next rebirth with its levels.' },
  // Rigged Reels
  { id: 'fourLeafLitter', tree: 'reels', name: 'Four-Leaf Litter', cost: 1, requires: [], icon: 'clover', short: '3x luck tokens, half sell price', text: 'Luck tokens land 3× as often. Duplicates sell for half.' },
  { id: 'bootlegReel', tree: 'reels', name: 'Bootleg Reel', cost: 2, requires: ['fourLeafLitter'], icon: 'reel', short: '+1 reel, slower spins', text: '+1 reel, but every spin is 50% slower.' },
  { id: 'greasedGears', tree: 'reels', name: 'Greased Gears', cost: 2, requires: ['fourLeafLitter'], icon: 'gear', short: 'Spins twice as fast', text: 'Spins run twice as fast, past the usual limit.' },
  { id: 'pawnShop', tree: 'reels', name: 'Pawn Shop', cost: 3, requires: ['bootlegReel', 'greasedGears'], icon: 'coin', short: 'Copies sell for 4x gold', text: 'Selling duplicates pays 4× the gold.' },
  { id: 'riggedJackpot', tree: 'reels', name: 'Rigged Jackpot', cost: 4, requires: ['pawnShop'], icon: 'star', short: 'Every 25th spin: Legendary+', text: 'Every 25th spin, every reel lands Legendary or better.' },
  // Bad Ideas
  { id: 'glassCannon', tree: 'chaos', name: 'Glass Cannon', cost: 1, requires: [], icon: 'skull', short: '2x damage, half HP', text: 'Double damage, half HP.' },
  { id: 'rollDancer', tree: 'chaos', name: 'Roll Dancer', cost: 2, requires: ['glassCannon'], icon: 'boot', short: 'Dodge rolls cut through foes', text: 'Dodge rolls slice everything they pass through and recharge 50% faster. Auto attacks are 20% slower.' },
  { id: 'bloodPact', tree: 'chaos', name: 'Blood Pact', cost: 2, requires: ['glassCannon'], icon: 'drop', short: 'Hits heal you; no Cleric heals', text: 'Every hit heals for 5% of its damage, but healing from Clerics does nothing.' },
  { id: 'berserker', tree: 'chaos', name: 'Berserker', cost: 3, requires: ['rollDancer', 'bloodPact'], icon: 'axe', short: 'More damage at low HP', text: 'Up to +150% damage the lower a knight\'s HP.' },
  { id: 'kamikaze', tree: 'chaos', name: 'Kamikaze', cost: 4, requires: ['berserker'], icon: 'bomb', short: 'Dodge rolls drop bombs', text: 'Every dodge roll leaves a bomb that blows up for 300% damage.' },
];

export const PERKS_BY_ID = new Map(PERKS.map((p) => [p.id, p]));

export function hasPerk(state: Pick<GameState, 'perks'>, id: string): boolean {
  return state.perks.includes(id);
}

export function perksOpen(state: Pick<GameState, 'rebirths'>): boolean {
  return state.rebirths >= 1;
}

export function canBuyPerk(state: GameState, id: string): boolean {
  const p = PERKS_BY_ID.get(id);
  if (!p || !perksOpen(state) || hasPerk(state, id) || state.sigils < p.cost) return false;
  return p.requires.every((r) => hasPerk(state, r)) || (p.requires.length > 1 && p.requires.some((r) => hasPerk(state, r)));
}

export function buyPerk(state: GameState, id: string): boolean {
  if (!canBuyPerk(state, id)) return false;
  const p = PERKS_BY_ID.get(id)!;
  state.sigils -= p.cost;
  state.perks.push(id);
  return true;
}
