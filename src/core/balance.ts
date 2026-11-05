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
  tutorial: {
    warmup: [
      { rarity: 'common', cls: 'guardian' },
      { rarity: 'uncommon', cls: 'ranger' },
      { rarity: 'rare', cls: 'cleric' },
    ] as const,
    firstFind: { rarity: 'legendary', cls: 'blade' } as const,
    /** Beginner's luck: about 45 s after the first floor starts, a x3 then x5 chain into an Exalted Ranger. */
    beginnerAfterSeconds: 45,
    beginnerTokens: [3, 5],
    beginnerFind: { rarity: 'exalted', cls: 'ranger' } as const,
  },
  roster: {
    /** Shards needed for level L -> L+1: L shards. Gold: goldBase * goldGrowth^(L-1). */
    goldBase: 20,
    goldGrowth: 1.32,
    maxLevel: 60,
    /** Each level adds this share of the knight's base stats (additive). */
    levelPct: 0.1,
    /** Gold for selling a duplicate, in kills' worth of gold at your best floor. */
    sellKills: {
      common: 1, uncommon: 2, rare: 5, epic: 15, legendary: 80, mythic: 600, ancient: 900, exalted: 1400,
      celestial: 2200, astral: 3500, divine: 6000, eternal: 10000, primordial: 20000,
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
    ttk: { mob: 1.4, elite: 5.5, boss: 28 },
    hit: { mob: 0.05, elite: 0.075, boss: 0.1 },
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
