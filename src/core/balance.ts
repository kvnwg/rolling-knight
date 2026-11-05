/**
 * Every tunable number in one place. The rolling numbers follow Dumpster Legend's dumpster
 * (spin timing, the luck ÷ X rarity roll, luck tokens and their chains and combos, bad-luck
 * protection, Lucky and Golden Spins, reveals judged against your own recent finds).
 */
export const BAL = {
  roll: {
    spinSeconds: 2.6,
    restSeconds: 0.9,
    /** Spin Speed upgrades can't take a cycle below this (Greased Gears can). */
    minCycleSeconds: 0.7,
    /** Each Spin Speed tier multiplies the cycle by (1 - this): 8 tiers take 3.5 s to about 1 s. */
    speedPerLevel: 0.14,
    turboSpeedMult: 2,
    minTurboCycleSeconds: 0.45,
    maxReels: 5,
    luckyEvery: 10,
    luckyMinEvery: 4,
    luckyMult: 2,
    goldenMult: 5,
    tokens: {
      chance: 0.05,
      maxChance: 0.5,
      chainChance: 0.5,
      maxSteps: 4,
      holdSeconds: 0.6,
      values: [
        [2, 60],
        [3, 25],
        [5, 11],
        [10, 4],
      ] as Array<[number, number]>,
      /** A chain multiplying luck by at least x guarantees this rarity or better. */
      floors: [
        { x: 25, rarity: 'epic' },
        { x: 50, rarity: 'legendary' },
        { x: 250, rarity: 'mythic' },
      ] as const,
    },
    pity: { drySpell: 40, perTier: 4, min: 8, rarity: 'epic' as const },
    riggedEvery: 25,
  },
  /** Mutations: a second roll on every knight, rarest first, independent of luck (Alchemy raises it). */
  mutations: {
    gilded: { oneIn: 25, statPct: 20 },
    shadow: { oneIn: 150, statPct: 45 },
    radiant: { oneIn: 1000, statPct: 90 },
    void: { oneIn: 10000, statPct: 200 },
  },
  luck: {
    potionMult: 2,
    potionSeconds: 60,
    /** Depth: +5% luck for every boss beaten this run (one every 5 floors), up to 30 bosses. */
    depthPerBoss: 0.05,
    depthMaxBosses: 29,
  },
  feel: {
    buildUp: { windowMinutes: [0.5, 2], tierOneIn: 6 },
    bigRoll: { windowMinutes: [5, 50, 500], coverShare: 0.1, minHistoryMinutes: 2, tierOneIn: 20, historyMax: 48, hyperOneIn: 100000, hyperWatchMinutes: 10 },
    reels: { nearMissChance: 0.65, cellsPerSecond: 13 },
  },
  offline: { capHours: 8, efficiency: 0.75, perTier: 0.4, rollSlowdown: 10, maxRolls: 1000, keepRarity: 'epic' as const, minAwaySeconds: 60 },
  /**
   * The start: ordinary rolls (no scripted finds), just quick ones (`cycle` seconds) until you have
   * `knights` knights for a squad, at most `maxSpins` of them.
   */
  tutorial: {
    cycle: 1.6,
    knights: 3,
    maxSpins: 10,
  },
  roster: {
    /**
     * Gold for level L -> L+1: goldBase * goldGrowth^(L-1), times (1 + rarityStep * the rarity's
     * index) so a rare knight costs more to raise than a common one. Gold is all it takes.
     */
    goldBase: 40,
    goldGrowth: 1.32,
    rarityStep: 0.5,
    maxLevel: 60,
    /** Each level adds this share of the knight's base stats (additive). */
    levelPct: 0.1,
    /**
     * The smith's reforge: a roll for a better mutation at `oddsMult` times the usual odds (it never
     * makes a knight worse). Costs `kills` kills' worth of gold at your best floor, more for rarer
     * knights, and `growth` times more every time that knight is reforged.
     */
    reforge: { kills: 40, rarityStep: 0.6, growth: 1.35, oddsMult: 6 },
    /** Gold a duplicate turns into when it's rolled, in kills' worth of gold at your best floor. */
    sellKills: {
      common: 1, uncommon: 2, rare: 5, epic: 15, legendary: 80, mythic: 600, ancient: 900, exalted: 1400,
      celestial: 2200, astral: 3500, divine: 6000, eternal: 10000, primordial: 20000, absolute: 100000,
    },
  },
  /**
   * The balancing system (power.ts): par is the Squad Power expected on a floor; foes are built so that
   * at their difficulty a plain foe takes `ttk.mob` seconds of the squad's damage and each hit takes
   * `hit.mob` of a knight's HP. Above par foes grow by (power / par)^aboveExp, below by ^belowExp.
   */
  balance: {
    parBase: 750,
    parGrowth: 1.1,
    /**
     * Quick, dangerous fights: a plain foe goes down fast (0.6 s of the squad's damage, so a couple
     * of your knight's hits) and every one of its blows hurts (8.5% of a knight). Elites and bosses
     * last longer and hit harder. (Neither sponges nor pushovers.)
     */
    ttk: { mob: 0.6, elite: 2.6, boss: 18 },
    hit: { mob: 0.085, elite: 0.12, boss: 0.15 },
    /**
     * The first floors bite a little harder than par alone would say (a fresh squad is usually ahead of
     * par there): on floor 1 foes hit `hit` more and take `ttk` longer to kill, fading evenly to the
     * plain targets by floor `until`.
     */
    early: { until: 10, hit: 0.2, ttk: 0.1 },
    aboveExp: 0.6,
    belowExp: 0.2,
    minBand: 0.5,
    maxBand: 50,
  },
  dungeon: {
    goldGrowth: 1.14,
    goldPerKill: 3,
    floorsPerBiome: 5,
    /** Missing HP restored between floors. */
    healBetweenFloors: 0.5,
    reviveHpPct: 0.35,
    drops: { potionMob: 0.003, potionElite: 0.05, potionBoss: 0.3, hourglassElite: 0.25, hourglassBoss: 5 },
  },
  rebirth: { baseFloor: 15, floorPer: 10, luckPer: 0.25, goldMultPer: 0.5, statPctPer: 30 },
  perks: { unlockRebirths: 1, sigilsPerBoss: 1 },
} as const;

export type Bal = typeof BAL;
