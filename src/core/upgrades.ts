/**
 * Gold upgrades, sold by the tinker on two tabs: Luck (the altar's and fortune's lines) and Combat
 * (the squad's and chance lines). The tinker's counter shows each line as a card
 * (src/ui/keeper/TinkerShop.tsx); each tab can also be seen as its upgrade map (Dumpster Legend's
 * honeycomb: src/ui/upgrades/UpgradeMap.tsx, the hex layout src/core/upgradeTree.ts). Every line is a
 * chain of tiers bought in order (Luck I, Luck II, ...), one hex each, and each tab grows out of its
 * root: Luck I, and Whetstone I for Combat. A line's first tier opens once the tier it hangs off (in
 * its own tab) is owned. Gold "special" hexes are one-offs (and the very expensive Extra Reel line).
 * Each tier costs `growth` times the last. Bought with gold within a run; a rebirth resets them.
 *
 * Four kinds of line:
 *  - the altar's: luck, spins, reels, mutations, bad-luck protection;
 *  - the squad's: damage, HP, speed, and Quick Roll (skill rolls spin faster and recharge sooner);
 *  - fortune: gold, Luck Potions, nights away, kills that pay out;
 *  - chance: combat tricks that roll their dice in every fight (a LUCKY hit for x5, a coin flip for
 *    double or nothing, bouncing arrows, foes tripping and fumbling, a second wind). Their numbers are
 *    in src/core/chance.ts; src/world/chance.ts plays them in the dungeon.
 *
 * `upgradeFx` turns the tiers owned into the numbers the rest of the game reads.
 */
import type { GameState } from './state';

export type UpgradeId =
  // the altar
  | 'luck' | 'horseshoe' | 'spinSpeed' | 'luckySpin' | 'luckyStreak' | 'goldenWheel' | 'goldenSpin' | 'turbo' | 'sands'
  | 'extraReel' | 'alchemy' | 'pity' | 'loadedDice' | 'philosopher'
  // fortune
  | 'greed' | 'treasury' | 'coinShower' | 'jackpot' | 'potionTime' | 'offline'
  // the squad
  | 'might' | 'excalibur' | 'vitality' | 'dragonscale' | 'swiftness' | 'quickRoll' | 'giantSlayer' | 'lifesteal'
  // chance
  | 'luckyStrike' | 'doubleOrNothing' | 'twoHeaded' | 'wildMagic' | 'ladyLuck' | 'ricochet' | 'secondWind' | 'butterfingers' | 'pratfall';

/** What a line changes: the altar's rolls, the squad's numbers, gold and fortune, or combat by chance. */
export type UpgradeKind = 'altar' | 'squad' | 'fortune' | 'chance';

/** The tinker's two tabs: rolling luck (the altar and fortune) and combat (the squad and chance). */
export type UpgradeTab = 'luck' | 'combat';
export const UPGRADE_TABS: readonly UpgradeTab[] = ['luck', 'combat'];

/** The tab a line is sold on. */
export function upgradeTab(def: Pick<UpgradeDef, 'kind'>): UpgradeTab {
  return def.kind === 'altar' || def.kind === 'fortune' ? 'luck' : 'combat';
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  kind: UpgradeKind;
  /** The old flat list's two groups (the reels, and everything else), kept for screens that list by them. */
  group: 'altar' | 'squad';
  max: number;
  /** Price of the first tier; each tier after costs `growth` times the last. */
  cost: number;
  growth: number;
  /** What the line does, in a sentence (the buy card). */
  desc: string;
  /** What one more tier adds (tier n, 1-based; the old list's line and the tier ladder). */
  text: (tier: number) => string;
  icon: string;
  /** Hangs off this tier of another line on its tab (every line but the tabs' roots, Luck and Whetstone). */
  requires?: { id: UpgradeId; tier: number };
  /**
   * Its hexes on its tab's map, as steps from the hex it hangs off (a root's from its first tier):
   * n, ne, se, s, sw, nw, with `*k` repeating a step (src/core/upgradeTree.ts).
   */
  path: string;
  /** A gold hex: a one-off (or the Extra Reel line). */
  special?: boolean;
  /** It rolls dice in the fight (src/world/chance.ts): its card says "Chance". */
  rolls?: boolean;
}

export const UPGRADES: UpgradeDef[] = [
  // ---------------------------------------------------------------- the root and the altar (north)
  {
    id: 'luck', name: 'Luck', kind: 'altar', group: 'altar', max: 8, cost: 120, growth: 3, icon: 'clover', path: 'n*7',
    desc: 'More luck on every spin. The root of the whole map.',
    text: () => '+15% luck',
  },
  {
    id: 'horseshoe', name: 'Lucky Horseshoe', kind: 'altar', group: 'altar', max: 1, cost: 400_000, growth: 1, icon: 'horseshoe', path: 'n', special: true,
    requires: { id: 'luck', tier: 8 },
    desc: 'Nailed over the altar for good: a big jump in luck on top of Luck VIII.',
    text: () => '+30% luck',
  },
  {
    id: 'spinSpeed', name: 'Spin Speed', kind: 'altar', group: 'altar', max: 8, cost: 100, growth: 3, icon: 'reel', path: 'ne*8',
    requires: { id: 'luck', tier: 1 },
    desc: 'The altar spins faster: more knights a minute (never under 0.7 s a spin).',
    text: () => 'Spins 14% faster',
  },
  {
    id: 'sands', name: 'Sands of Fortune', kind: 'altar', group: 'altar', max: 5, cost: 800, growth: 3.4, icon: 'sandglass', path: 'se ne se ne se', rolls: true,
    requires: { id: 'spinSpeed', tier: 2 },
    desc: 'Any kill can drop an Hourglass: one spin at turbo speed.',
    text: () => '+1% of kills drop an Hourglass',
  },
  {
    id: 'luckySpin', name: 'Lucky Spins', kind: 'altar', group: 'altar', max: 6, cost: 300, growth: 3.2, icon: 'dice', path: 'n*6',
    requires: { id: 'spinSpeed', tier: 3 },
    desc: 'Lucky Spins (extra luck for one spin) come around more often.',
    text: () => 'Lucky Spins come 1 spin sooner',
  },
  {
    id: 'luckyStreak', name: 'Lucky Streak', kind: 'altar', group: 'altar', max: 4, cost: 1500, growth: 3.5, icon: 'star', path: 'ne*4',
    requires: { id: 'luckySpin', tier: 2 },
    desc: 'Lucky Spins get luckier.',
    text: () => '+0.5x luck on Lucky Spins',
  },
  {
    id: 'goldenWheel', name: 'Golden Wheel', kind: 'altar', group: 'altar', max: 1, cost: 20_000, growth: 1, icon: 'wheel', path: 'n', special: true,
    requires: { id: 'luckyStreak', tier: 2 },
    desc: 'Unlocks Golden Spins: any spin can turn golden, for x5 luck.',
    text: () => '2% of spins are Golden (x5 luck)',
  },
  {
    id: 'goldenSpin', name: 'Golden Spins', kind: 'altar', group: 'altar', max: 4, cost: 8000, growth: 4, icon: 'reelGold', path: 'n n ne ne',
    requires: { id: 'goldenWheel', tier: 1 },
    desc: 'Golden Spins come up more often.',
    text: () => '+2% Golden Spin chance',
  },
  {
    id: 'turbo', name: 'Turbo Power', kind: 'altar', group: 'altar', max: 4, cost: 700, growth: 3, icon: 'bolt', path: 'se*4',
    requires: { id: 'spinSpeed', tier: 6 },
    desc: 'Hourglass spins go even faster (down to 0.45 s).',
    text: () => 'Hourglass spins +50% faster',
  },
  {
    id: 'extraReel', name: 'Extra Reel', kind: 'altar', group: 'altar', max: 4, cost: 6000, growth: 15, icon: 'reelPlus', path: 'nw*4', special: true,
    requires: { id: 'luck', tier: 1 },
    desc: 'One more reel on every spin: one more knight each time. Very expensive.',
    text: () => '+1 reel: one more knight every spin',
  },
  {
    id: 'alchemy', name: 'Alchemy', kind: 'altar', group: 'altar', max: 6, cost: 600, growth: 3.3, icon: 'flask', path: 'nw*6',
    requires: { id: 'luck', tier: 3 },
    desc: 'Mutations (Gilded, Shadow, Radiant, Void) come up more often.',
    text: () => 'Mutations 25% more likely',
  },
  {
    id: 'pity', name: 'Pity Shield', kind: 'altar', group: 'altar', max: 8, cost: 900, growth: 2.6, icon: 'shield', path: 'n*8',
    requires: { id: 'alchemy', tier: 2 },
    desc: 'Bad-luck protection kicks in sooner.',
    text: () => 'Epic+ guaranteed 4 rolls sooner',
  },
  {
    id: 'loadedDice', name: 'Loaded Dice', kind: 'altar', group: 'altar', max: 5, cost: 3000, growth: 3.5, icon: 'loadedDice', path: 'n*5',
    requires: { id: 'alchemy', tier: 4 },
    desc: "Your knights' skill rolls lean rarer.",
    text: () => '+40% skill-roll luck',
  },
  {
    id: 'philosopher', name: "Philosopher's Stone", kind: 'altar', group: 'altar', max: 1, cost: 300_000, growth: 1, icon: 'stone', path: 'nw', special: true,
    requires: { id: 'alchemy', tier: 6 },
    desc: 'Mutations twice as likely, on top of Alchemy.',
    text: () => 'Mutations x2',
  },
  // ---------------------------------------------------------------- fortune (south-east)
  {
    id: 'greed', name: 'Greed', kind: 'fortune', group: 'squad', max: 8, cost: 150, growth: 2.8, icon: 'coin', path: 'se*8',
    requires: { id: 'luck', tier: 1 },
    desc: 'More gold from everything.',
    text: () => '+15% gold',
  },
  {
    id: 'treasury', name: 'Royal Treasury', kind: 'fortune', group: 'squad', max: 1, cost: 500_000, growth: 1, icon: 'treasure', path: 'se', special: true,
    requires: { id: 'greed', tier: 8 },
    desc: 'A huge gold bonus on top of Greed.',
    text: () => '+100% gold',
  },
  {
    id: 'coinShower', name: 'Coin Shower', kind: 'fortune', group: 'squad', max: 5, cost: 600, growth: 3.4, icon: 'coinShower', path: 'ne se ne se ne', rolls: true,
    requires: { id: 'greed', tier: 2 },
    desc: 'Any kill can burst into a shower of gold: three times its coins.',
    text: () => '+4% of kills shower gold',
  },
  {
    id: 'jackpot', name: 'Jackpot', kind: 'fortune', group: 'squad', max: 3, cost: 25_000, growth: 5, icon: 'jackpot', path: 'se*3', rolls: true,
    requires: { id: 'coinShower', tier: 5 },
    desc: 'A tiny chance a kill wins a Lucky Spin at the altar (a Luck Potion if one is due anyway).',
    text: () => '+0.25% of kills win a Lucky Spin',
  },
  {
    id: 'potionTime', name: 'Potion Time', kind: 'fortune', group: 'squad', max: 6, cost: 500, growth: 3, icon: 'potion', path: 's*6',
    requires: { id: 'greed', tier: 4 },
    desc: 'Luck Potions last longer.',
    text: () => 'Luck Potions last 20 s longer',
  },
  {
    id: 'offline', name: 'Night Watch', kind: 'fortune', group: 'squad', max: 5, cost: 1500, growth: 3, icon: 'moon', path: 'se*5',
    requires: { id: 'potionTime', tier: 2 },
    desc: 'The altar and the squad earn more while you are away.',
    text: () => '+40% rolls and gold while away',
  },
  // ---------------------------------------------------------------- the squad: the Combat tab's root (north and south)
  {
    id: 'might', name: 'Whetstone', kind: 'squad', group: 'squad', max: 8, cost: 80, growth: 4.2, icon: 'sword', path: 'n*7',
    desc: 'The whole squad hits harder. The root of the Combat tab.',
    text: () => '+18% squad damage',
  },
  {
    id: 'excalibur', name: 'Excalibur', kind: 'squad', group: 'squad', max: 1, cost: 1_500_000, growth: 1, icon: 'excalibur', path: 'n', special: true,
    requires: { id: 'might', tier: 8 },
    desc: 'A big damage bonus on top of Whetstone.',
    text: () => '+30% squad damage',
  },
  {
    id: 'giantSlayer', name: 'Giant Slayer', kind: 'squad', group: 'squad', max: 6, cost: 1500, growth: 3, icon: 'skull', path: 'ne se ne se ne se',
    requires: { id: 'might', tier: 5 },
    desc: 'More damage to elites and bosses.',
    text: () => '+15% damage to elites and bosses',
  },
  {
    id: 'lifesteal', name: 'Leechblade', kind: 'squad', group: 'squad', max: 5, cost: 2000, growth: 3.5, icon: 'drop', path: 'ne se ne se ne',
    requires: { id: 'might', tier: 7 },
    desc: 'Every hit heals the knight that landed it a little.',
    text: () => '+2% of damage dealt heals',
  },
  {
    id: 'vitality', name: 'Plate Mail', kind: 'squad', group: 'squad', max: 8, cost: 80, growth: 4.2, icon: 'heart', path: 's*8',
    requires: { id: 'might', tier: 1 },
    desc: 'More HP for the whole squad.',
    text: () => '+18% squad HP',
  },
  {
    id: 'dragonscale', name: 'Dragonscale', kind: 'squad', group: 'squad', max: 1, cost: 1_500_000, growth: 1, icon: 'scale', path: 's', special: true,
    requires: { id: 'vitality', tier: 8 },
    desc: 'A big HP bonus on top of Plate Mail.',
    text: () => '+30% squad HP',
  },
  {
    id: 'swiftness', name: 'Swift Boots', kind: 'squad', group: 'squad', max: 5, cost: 400, growth: 3.2, icon: 'boot', path: 'se se s s s',
    requires: { id: 'vitality', tier: 1 },
    desc: 'The squad moves and attacks faster.',
    text: () => '+6% move and attack speed',
  },
  {
    id: 'quickRoll', name: 'Quick Roll', kind: 'squad', group: 'squad', max: 5, cost: 900, growth: 3.4, icon: 'quickRoll', path: 'ne se ne se ne',
    requires: { id: 'swiftness', tier: 1 },
    desc: "Your knights' skill rolls spin faster, so skills come out quicker.",
    text: () => 'Skill rolls spin 12% faster, cooldown 6% shorter',
  },
  // ---------------------------------------------------------------- chance (west and south-west of Whetstone I)
  {
    id: 'luckyStrike', name: 'Lucky Strike', kind: 'chance', group: 'squad', max: 6, cost: 250, growth: 3.4, icon: 'luckyStrike', path: 'nw sw nw sw nw sw', rolls: true,
    requires: { id: 'might', tier: 1 },
    desc: 'Any hit can be a LUCKY hit: x5 damage.',
    text: () => '+1.5% of hits are LUCKY (x5)',
  },
  {
    id: 'doubleOrNothing', name: 'Double or Nothing', kind: 'chance', group: 'squad', max: 4, cost: 400, growth: 3, icon: 'coinFlip', path: 'nw*4', rolls: true,
    requires: { id: 'luckyStrike', tier: 3 },
    desc: 'Some hits flip a coin: double damage, or nothing at all.',
    text: () => '+10% of hits flip the coin',
  },
  {
    id: 'twoHeaded', name: 'Two-Headed Coin', kind: 'chance', group: 'squad', max: 1, cost: 60_000, growth: 1, icon: 'twoHeaded', path: 'nw', rolls: true, special: true,
    requires: { id: 'doubleOrNothing', tier: 4 },
    desc: "Double or Nothing's coin lands double two times in three.",
    text: () => 'The coin lands double 2 in 3',
  },
  {
    id: 'ricochet', name: 'Ricochet', kind: 'chance', group: 'squad', max: 5, cost: 900, growth: 3.5, icon: 'ricochet', path: 'sw nw sw nw sw', rolls: true,
    requires: { id: 'luckyStrike', tier: 6 },
    desc: 'Arrows and bolts sometimes bounce on to another foe nearby.',
    text: () => '+8% of arrows and bolts bounce',
  },
  {
    id: 'wildMagic', name: 'Wild Magic', kind: 'chance', group: 'squad', max: 5, cost: 5000, growth: 3.5, icon: 'wildMagic', path: 'n*5', rolls: true,
    requires: { id: 'doubleOrNothing', tier: 4 },
    desc: "Any hit can cast a random spell from the knights' kits: Meteor, Arrow Rain, Whirlwind...",
    text: () => '+1% of hits cast a random spell',
  },
  {
    id: 'ladyLuck', name: 'Lady Luck', kind: 'chance', group: 'squad', max: 1, cost: 2_500_000, growth: 1, icon: 'ladyLuck', path: 'n', rolls: true, special: true,
    requires: { id: 'wildMagic', tier: 5 },
    desc: 'She smiles on the squad: every chance on this map comes up 25% more often.',
    text: () => 'Every chance x1.25',
  },
  {
    id: 'secondWind', name: 'Second Wind', kind: 'chance', group: 'squad', max: 4, cost: 1200, growth: 4, icon: 'feather', path: 'sw*4', rolls: true,
    requires: { id: 'vitality', tier: 2 },
    desc: 'Once a floor, a knight may shrug off a killing blow and get back up.',
    text: () => '+15% chance to cheat death',
  },
  {
    id: 'butterfingers', name: 'Butterfingers', kind: 'chance', group: 'squad', max: 5, cost: 700, growth: 3.3, icon: 'butterfingers', path: 'sw*5', rolls: true,
    requires: { id: 'vitality', tier: 4 },
    desc: "Foes sometimes fumble an attack: it does nothing, and they're dazed picking it up.",
    text: () => "+3% of foes' hits fumbled",
  },
  {
    id: 'pratfall', name: 'Pratfall', kind: 'chance', group: 'squad', max: 5, cost: 2500, growth: 3.2, icon: 'banana', path: 'sw*5', rolls: true,
    requires: { id: 'vitality', tier: 6 },
    desc: 'Foes trip over their own feet now and then, and lie stunned for a moment.',
    text: () => '+2% a second that a foe trips',
  },
];

export const UPGRADES_BY_ID = new Map<UpgradeId, UpgradeDef>(UPGRADES.map((u) => [u.id, u]));

export function upgradeDef(id: string): UpgradeDef | undefined {
  return UPGRADES_BY_ID.get(id as UpgradeId);
}

/** Tiers owned of a line (clamped to the line's tiers, so an old save never counts more). */
export function tier(state: Pick<GameState, 'upgrades'>, id: UpgradeId): number {
  const def = UPGRADES_BY_ID.get(id);
  const raw = Math.floor(state.upgrades[id] ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return def ? Math.min(def.max, raw) : raw;
}

/** The price of tier `level + 1` of a line. */
export function upgradeCostAt(def: UpgradeDef, level: number): number {
  return Math.max(1, Math.round(def.cost * Math.pow(def.growth, level)));
}

/** The price of the next tier of a line. */
export function upgradeCost(state: Pick<GameState, 'upgrades'>, id: UpgradeId): number {
  return upgradeCostAt(UPGRADES_BY_ID.get(id)!, tier(state, id));
}

/** True once the tier this line hangs off is owned (the tabs' roots, Luck and Whetstone, are always open). */
export function upgradeUnlocked(state: Pick<GameState, 'upgrades'>, id: UpgradeId): boolean {
  const def = UPGRADES_BY_ID.get(id);
  if (!def) return false;
  return !def.requires || tier(state, def.requires.id) >= def.requires.tier;
}

export function canBuy(state: Pick<GameState, 'upgrades' | 'gold'>, id: UpgradeId): boolean {
  const def = UPGRADES_BY_ID.get(id);
  if (!def || !upgradeUnlocked(state, id)) return false;
  return tier(state, id) < def.max && state.gold >= upgradeCost(state, id);
}

export function buyUpgrade(state: Pick<GameState, 'upgrades' | 'gold'>, id: UpgradeId): boolean {
  if (!canBuy(state, id)) return false;
  state.gold -= upgradeCost(state, id);
  state.upgrades[id] = tier(state, id) + 1;
  return true;
}

/** Lines that are open, not maxed and affordable right now. */
export function affordableUpgrades(state: Pick<GameState, 'upgrades' | 'gold'>): UpgradeDef[] {
  return UPGRADES.filter((u) => canBuy(state, u.id));
}

export type UpgradeNodeState = 'owned' | 'open' | 'locked';

/** One hex on the map: owned, open (the next tier, ready to buy), or locked (further out). */
export function upgradeNodeState(state: Pick<GameState, 'upgrades'>, id: UpgradeId, t: number): UpgradeNodeState {
  const def = UPGRADES_BY_ID.get(id);
  if (!def) return 'locked';
  const level = tier(state, id);
  if (level >= t) return 'owned';
  return level === t - 1 && upgradeUnlocked(state, id) ? 'open' : 'locked';
}

/** Parents before children, so one pass in this order can check each line's requirement. */
const ORDER: UpgradeDef[] = (() => {
  const depth = (d: UpgradeDef): number => (d.requires ? 1 + depth(UPGRADES_BY_ID.get(d.requires.id)!) : 0);
  return [...UPGRADES].sort((a, b) => depth(a) - depth(b));
})();

/**
 * Tidies a save's upgrades for the map: drops unknown lines, clamps tiers to each line's max, and
 * clears lines whose parent tier isn't owned (a save from the old flat list). Call it on load.
 */
export function sanitizeUpgrades(state: Pick<GameState, 'upgrades'>): void {
  // Before the two tabs, Plate Mail hung off Luck I; now it hangs off Whetstone I (the Combat tab's
  // root). A save with Plate Mail and no Whetstone keeps it, with Whetstone I on the house.
  if ((Number(state.upgrades.vitality) || 0) >= 1 && !((Number(state.upgrades.might) || 0) >= 1)) state.upgrades.might = 1;
  const out: Record<string, number> = {};
  for (const def of ORDER) {
    const level = Math.min(def.max, Math.max(0, Math.floor(Number(state.upgrades[def.id]) || 0)));
    if (level > 0 && (!def.requires || (out[def.requires.id] ?? 0) >= def.requires.tier)) out[def.id] = level;
  }
  state.upgrades = out;
}

/** Quick Roll, per tier: a skill roll spins this much shorter, and its cooldown this much shorter (percent). */
export const QUICK_ROLL = { spinPct: 12 } as const;

/** Everything the altar, fortune and squad lines do, as numbers (the chance lines: chance.ts). */
export function upgradeFx(state: Pick<GameState, 'upgrades'>) {
  const t = (id: UpgradeId) => tier(state, id);
  return {
    luck: 0.15 * t('luck') + 0.3 * t('horseshoe'),
    spinLevels: t('spinSpeed'),
    reels: t('extraReel'),
    pity: 4 * t('pity'),
    luckyEvery: t('luckySpin'),
    luckyMult: 0.5 * t('luckyStreak'),
    goldenChance: 0.02 * (t('goldenWheel') + t('goldenSpin')),
    mutationMult: Math.pow(1.25, t('alchemy')) * (t('philosopher') > 0 ? 2 : 1),
    turboPower: 0.5 * t('turbo'),
    potionSeconds: 20 * t('potionTime'),
    atkPct: 18 * t('might') + 30 * t('excalibur'),
    hpPct: 18 * t('vitality') + 30 * t('dragonscale'),
    goldPct: 15 * t('greed') + 100 * t('treasury'),
    speedPct: 6 * t('swiftness'),
    /** Quick Roll: how much shorter a skill roll spins, and how much shorter its cooldown, in percent. */
    rollSpinPct: QUICK_ROLL.spinPct * t('quickRoll'),
    offlineEff: 0.4 * t('offline'),
  };
}

export type UpgradeFx = ReturnType<typeof upgradeFx>;
