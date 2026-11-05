/**
 * The tinker's categories (TinkerShop.tsx): down the left of the Luck tab's list of cards, and the
 * headings of the Combat tab's list of lines and odds. Every upgrade line is in exactly one, on its
 * own tab (tests/keepers.test.ts checks). Plain data, so tests can read it.
 */
import type { UpgradeId, UpgradeTab } from '../../core/upgrades';

export interface TinkerCat {
  id: string;
  label: string;
  /** The upgrade icon on its button (iconRows.ts, or one of the UI's). */
  icon: string;
  lines: UpgradeId[];
}

export const TINKER_CATS: Record<UpgradeTab, TinkerCat[]> = {
  luck: [
    { id: 'luck', label: 'LUCK', icon: 'clover', lines: ['luck', 'horseshoe', 'luckySpin', 'luckyStreak', 'goldenWheel', 'goldenSpin'] },
    { id: 'reels', label: 'REELS', icon: 'reel', lines: ['spinSpeed', 'turbo', 'sands', 'extraReel'] },
    { id: 'odds', label: 'ODDS', icon: 'flask', lines: ['alchemy', 'philosopher', 'pity', 'loadedDice'] },
    { id: 'fortune', label: 'GOLD', icon: 'coin', lines: ['greed', 'treasury', 'coinShower', 'jackpot', 'potionTime', 'offline'] },
  ],
  combat: [
    { id: 'attack', label: 'ATTACK', icon: 'sword', lines: ['might', 'excalibur', 'giantSlayer', 'lifesteal'] },
    { id: 'defense', label: 'DEFEND', icon: 'heart', lines: ['vitality', 'dragonscale', 'secondWind'] },
    { id: 'speed', label: 'SPEED', icon: 'atkSpeed', lines: ['atkSpeed', 'swiftness', 'quickRoll'] },
    { id: 'chance', label: 'CHANCE', icon: 'luckyStrike', lines: ['luckyStrike', 'doubleOrNothing', 'twoHeaded', 'ricochet', 'wildMagic', 'ladyLuck', 'butterfingers', 'pratfall'] },
  ],
};
