/**
 * Gold upgrades, bought in tiers within a run (a rebirth resets them). Each tier costs `growth`
 * times the last. Two groups: the Summoning Altar's (the reels) and the Squad's.
 */
import type { GameState } from './state';

export type UpgradeId =
  | 'luck' | 'spinSpeed' | 'extraReel' | 'pity' | 'luckySpin' | 'goldenSpin' | 'alchemy' | 'turbo' | 'potionTime'
  | 'might' | 'vitality' | 'greed' | 'swiftness' | 'offline';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  group: 'altar' | 'squad';
  max: number;
  cost: number;
  growth: number;
  /** Text for tier n (1-based) of this upgrade. */
  text: (tier: number) => string;
  icon: string;
  /** Needs this many tiers of another upgrade first. */
  requires?: { id: UpgradeId; tier: number };
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'luck', name: 'Luck', group: 'altar', max: 8, cost: 120, growth: 3, icon: 'clover', text: () => '+15% luck' },
  { id: 'spinSpeed', name: 'Spin Speed', group: 'altar', max: 8, cost: 100, growth: 3, icon: 'hourglass', text: () => 'Spins 14% faster (never under 0.7 s)' },
  { id: 'pity', name: 'Pity Shield', group: 'altar', max: 8, cost: 200, growth: 3, icon: 'shield', text: () => 'Epic+ guaranteed 4 rolls sooner (down to 8)' },
  { id: 'luckySpin', name: 'Lucky Spin', group: 'altar', max: 6, cost: 300, growth: 3.2, icon: 'star', text: () => 'Lucky Spins come 1 spin sooner and give +⅓ luck' },
  { id: 'goldenSpin', name: 'Golden Wheel', group: 'altar', max: 5, cost: 2500, growth: 4, icon: 'sun', text: (t) => (t === 1 ? 'Each spin: 2% chance of a Golden Spin (×5 luck)' : '+2% Golden Spin chance') },
  { id: 'alchemy', name: 'Alchemy', group: 'altar', max: 5, cost: 600, growth: 3.5, icon: 'flask', text: () => 'Mutations 30% more likely' },
  { id: 'turbo', name: 'Turbo Power', group: 'altar', max: 4, cost: 700, growth: 3, icon: 'bolt', text: () => 'Hourglass spins +50% faster (down to 0.45 s)' },
  { id: 'potionTime', name: 'Potion Time', group: 'altar', max: 4, cost: 500, growth: 3, icon: 'potion', text: () => 'Luck Potions last 20 s longer' },
  { id: 'extraReel', name: 'Extra Reel', group: 'altar', max: 4, cost: 6000, growth: 15, icon: 'reel', text: () => '+1 reel: one more knight every spin' },
  { id: 'might', name: 'Whetstone', group: 'squad', max: 12, cost: 80, growth: 2.6, icon: 'sword', text: () => '+12% squad damage' },
  { id: 'vitality', name: 'Plate Mail', group: 'squad', max: 12, cost: 80, growth: 2.6, icon: 'heart', text: () => '+12% squad HP' },
  { id: 'greed', name: 'Greed', group: 'squad', max: 8, cost: 150, growth: 2.8, icon: 'coin', text: () => '+15% gold' },
  { id: 'swiftness', name: 'Swift Boots', group: 'squad', max: 5, cost: 400, growth: 3.2, icon: 'boot', text: () => '+6% move and attack speed' },
  { id: 'offline', name: 'Night Watch', group: 'squad', max: 5, cost: 400, growth: 3, icon: 'moon', text: () => '+40% rolls and gold while away' },
];

export const UPGRADES_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export function tier(state: Pick<GameState, 'upgrades'>, id: UpgradeId): number {
  return state.upgrades[id] ?? 0;
}

export function upgradeCost(state: Pick<GameState, 'upgrades'>, id: UpgradeId): number {
  const def = UPGRADES_BY_ID.get(id)!;
  return Math.round(def.cost * Math.pow(def.growth, tier(state, id)));
}

export function canBuy(state: GameState, id: UpgradeId): boolean {
  const def = UPGRADES_BY_ID.get(id)!;
  return tier(state, id) < def.max && state.gold >= upgradeCost(state, id);
}

export function buyUpgrade(state: GameState, id: UpgradeId): boolean {
  if (!canBuy(state, id)) return false;
  state.gold -= upgradeCost(state, id);
  state.upgrades[id] = tier(state, id) + 1;
  return true;
}

/** Everything the upgrades do, as numbers. */
export function upgradeFx(state: Pick<GameState, 'upgrades'>) {
  const t = (id: UpgradeId) => tier(state, id);
  return {
    luck: 0.15 * t('luck'),
    spinLevels: t('spinSpeed'),
    reels: t('extraReel'),
    pity: 4 * t('pity'),
    luckyEvery: t('luckySpin'),
    luckyMult: t('luckySpin') / 3,
    goldenChance: t('goldenSpin') > 0 ? 0.02 * t('goldenSpin') : 0,
    mutationMult: Math.pow(1.3, t('alchemy')),
    turboPower: 0.5 * t('turbo'),
    potionSeconds: 20 * t('potionTime'),
    atkPct: 12 * t('might'),
    hpPct: 12 * t('vitality'),
    goldPct: 15 * t('greed'),
    speedPct: 6 * t('swiftness'),
    offlineEff: 0.4 * t('offline'),
  };
}
