/**
 * The wares a floor's merchant sells (world/shop.ts sets out the shop): things for this run only.
 * Heals and revives help now; tonics, charms and trinkets last until you head back to camp (a wipe,
 * or going up yourself), stacking when bought again. Prices follow the floor's gold, so a shop is
 * always worth a look and never a free lunch.
 */
import { BAL } from './balance';
import type { IconName } from '../ui/px';

export type RunItemId = 'draught' | 'phoenix' | 'whetstone' | 'ironTonic' | 'swiftTonic' | 'fang' | 'thorns' | 'idol' | 'charm' | 'scroll';

export interface RunItemDef {
  id: RunItemId;
  name: string;
  icon: IconName;
  /** A few words for the price tag's card. */
  short: string;
  /** The whole story. */
  text: string;
  /** Price, in kills' worth of this floor's gold. */
  cost: number;
  /** How often a shop has it out (relative). */
  weight: number;
  /** Works on the spot (a heal, a scroll) rather than staying with the squad for the run. */
  now?: boolean;
  /** The most of it that stacks in one run. */
  max: number;
}

export const RUN_ITEMS: Readonly<Record<RunItemId, RunItemDef>> = {
  draught: { id: 'draught', name: 'Healing Draught', icon: 'potion', short: 'Heal the squad 60%', text: 'Every standing knight gets back 60% of their HP, now.', cost: 7, weight: 30, now: true, max: 99 },
  phoenix: { id: 'phoenix', name: 'Phoenix Feather', icon: 'rebirth', short: 'The next knight to fall gets up', text: 'The next knight to fall this run springs back up at half HP.', cost: 14, weight: 14, max: 3 },
  whetstone: { id: 'whetstone', name: 'Whetstone Oil', icon: 'sword', short: '+20% damage this run', text: 'The squad hits 20% harder until you head back to camp.', cost: 16, weight: 14, max: 5 },
  ironTonic: { id: 'ironTonic', name: 'Iron Tonic', icon: 'heart', short: '+25% max HP this run', text: 'Every knight has 25% more HP until you head back to camp.', cost: 14, weight: 14, max: 5 },
  swiftTonic: { id: 'swiftTonic', name: 'Swift Tonic', icon: 'bolt', short: '+15% attack speed this run', text: 'The squad attacks 15% faster until you head back to camp.', cost: 16, weight: 12, max: 5 },
  fang: { id: 'fang', name: 'Vampire Fang', icon: 'drop', short: 'Hits heal 4% of the damage', text: 'Every hit the squad lands heals the hitter for 4% of the damage, this run.', cost: 18, weight: 9, max: 4 },
  thorns: { id: 'thorns', name: 'Thorn Mail', icon: 'shield', short: 'Foes that hit you take 30% back', text: 'Foes that hit a knight up close take 30% of it back, this run.', cost: 15, weight: 9, max: 4 },
  idol: { id: 'idol', name: 'Golden Idol', icon: 'treasure', short: '+30% gold this run', text: 'All the gold you find is worth 30% more until you head back to camp.', cost: 20, weight: 8, max: 3 },
  charm: { id: 'charm', name: 'Lucky Charm', icon: 'clover', short: '+25% luck this run', text: 'Luck (skill rolls and the altar) is 25% higher until you head back to camp.', cost: 20, weight: 8, max: 3 },
  scroll: { id: 'scroll', name: 'Spell Scroll', icon: 'book', short: 'Your next skill roll: Epic or better', text: 'The skill roll of the knight you play lands on an Epic or Legendary skill next time.', cost: 22, weight: 7, now: true, max: 99 },
};

export const RUN_ITEM_IDS = Object.keys(RUN_ITEMS) as RunItemId[];

export type RunItems = Partial<Record<RunItemId, number>>;

/** What the run's items add up to: multipliers for stats, gold and luck; shares for lifesteal and thorns; revives left. */
export interface RunMults {
  dmg: number;
  hp: number;
  atkSpd: number;
  gold: number;
  luck: number;
  lifesteal: number;
  thorns: number;
  phoenix: number;
}

export function runMults(items: RunItems | undefined): RunMults {
  const n = (id: RunItemId) => Math.max(0, Math.min(RUN_ITEMS[id].max, Math.floor(items?.[id] ?? 0)));
  return {
    dmg: 1 + 0.2 * n('whetstone'),
    hp: 1 + 0.25 * n('ironTonic'),
    atkSpd: 1 + 0.15 * n('swiftTonic'),
    gold: 1 + 0.3 * n('idol'),
    luck: 1 + 0.25 * n('charm'),
    lifesteal: 0.04 * n('fang'),
    thorns: 0.3 * n('thorns'),
    phoenix: n('phoenix'),
  };
}

/** A ware's price on `floor`: its cost in kills' worth of that floor's gold, rounded to a tidy figure. */
export function warePrice(id: RunItemId, killGold: number): number {
  const g = Math.max(1, RUN_ITEMS[id].cost * killGold * BAL.shop.priceMult);
  const step = g >= 1000 ? 50 : g >= 200 ? 10 : g >= 50 ? 5 : 1;
  return Math.max(step, Math.round(g / step) * step);
}

/** Can another of this be bought this run (stacking items stop at their max)? */
export function canStack(items: RunItems | undefined, id: RunItemId): boolean {
  const d = RUN_ITEMS[id];
  return d.now || (items?.[id] ?? 0) < d.max;
}
