import { describe, expect, it } from 'vitest';
import {
  COMBAT_LINES, COMBAT_ROLL, COMBAT_TIERS_MAX, canRollCombat, combatOdds, combatPoolOpen, combatRollPrice, combatRollPriceAt, combatRollsAffordable, combatTiers, lineWeight, rollCombat, tierRarity,
} from '../src/core/combatRoll';
import { CLASSES, knightId } from '../src/core/knights';
import { newGame, rebirth } from '../src/core/newGame';
import { PERKS, PERK_ROLL, acceptPerk, canRollPerk, passedPerk, perkOdds, perkOffer, perkRollPrice, perkRollsAffordable, perkWeight, rejectPerk, rollAndTakePerk, rollPerk } from '../src/core/perks';
import { knightRating } from '../src/core/power';
import { Rng } from '../src/core/rng';
import { pickWeighted, tidyPrice } from '../src/core/rolls';
import { addKnight, knightStats } from '../src/core/roster';
import { mend } from '../src/core/save';
import type { GameState } from '../src/core/state';
import { effectAt, tabLines } from '../src/core/upgradeTree';
import { ATTACK_SPEED, UPGRADES_BY_ID, tier, upgradeFx, type UpgradeId } from '../src/core/upgrades';

function game(ups: Partial<Record<UpgradeId, number>> = {}, gold = 0): GameState {
  const s = newGame(1);
  s.roll.tutorial = 'done';
  s.gold = gold;
  Object.assign(s.upgrades, ups);
  return s;
}

/** Every combat line at its last tier. */
function maxed(): Partial<Record<UpgradeId, number>> {
  return Object.fromEntries(COMBAT_LINES.map((u) => [u.id, u.max]));
}

/** Numbers for `rand` in turn (then the last one forever), counting how many were drawn. */
function seq(values: number[]): { rand: () => number; drawn: () => number } {
  let i = 0;
  return { rand: () => values[Math.min(i++, values.length - 1)], drawn: () => i };
}

/** The first draw that lands the combat roll on `id` in this state. */
function uFor(s: GameState, id: UpgradeId): number {
  let acc = 0;
  for (const o of combatOdds(s)) {
    if (o.def.id === id) return acc + o.chance / 2;
    acc += o.chance;
  }
  throw new Error(`${id} is not in the roll`);
}

/**
 * What buying every combat tier cost before combat upgrades were rolled: the old Combat map's 17 lines
 * and 75 tiers, each at cost × growth^tier.
 */
const OLD_COMBAT_TOTAL = 13_612_424;

// ------------------------------------------------------------------ the odds

describe('the combat roll: odds', () => {
  it('has every combat line in the roll from the start, the squad lines and the chance lines', () => {
    const odds = combatOdds(game());
    expect(odds.map((o) => o.def.id).sort()).toEqual(tabLines('combat').map((u) => u.id).sort());
    for (const id of ['might', 'vitality', 'atkSpeed', 'quickRoll', 'swiftness', 'luckyStrike', 'doubleOrNothing', 'ricochet', 'wildMagic', 'secondWind', 'butterfingers', 'pratfall'] as const) {
      expect(odds.find((o) => o.def.id === id)!.chance, id).toBeGreaterThan(0);
    }
    for (const o of odds) expect([o.tier, o.next], o.def.id).toEqual([0, 1]);
    expect(odds.reduce((t, o) => t + o.chance, 0)).toBeCloseTo(1, 12);
  });

  it('makes higher tiers rarer, but gently: Strength II to III a bit rarer than Attack Speed 0 to I, not wildly', () => {
    const odds = combatOdds(game({ might: 2 }));
    const str3 = odds.find((o) => o.def.id === 'might')!;
    const as1 = odds.find((o) => o.def.id === 'atkSpeed')!;
    expect(str3.next).toBe(3);
    const ratio = str3.chance / as1.chance;
    expect(ratio).toBeLessThan(0.9);
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeCloseTo(COMBAT_ROLL.weight.falloff ** 2, 9);
    // Every tier a little rarer than the last; even Strength VIII about a fifth as likely as a first tier.
    for (const u of COMBAT_LINES) {
      for (let t = 2; t <= u.max; t++) {
        expect(lineWeight(u, t), `${u.id} ${t}`).toBeLessThan(lineWeight(u, t - 1));
        expect(lineWeight(u, t) / lineWeight(u, t - 1), `${u.id} ${t}`).toBeCloseTo(0.8, 9);
      }
    }
    expect(lineWeight(UPGRADES_BY_ID.get('might')!, 8) / lineWeight(UPGRADES_BY_ID.get('might')!, 1)).toBeGreaterThan(1 / 6);
  });

  it('gives the one-offs a lower base (about an eighth tier), and names how rare each tier is', () => {
    const might = UPGRADES_BY_ID.get('might')!;
    for (const id of ['excalibur', 'dragonscale', 'twoHeaded', 'ladyLuck'] as const) {
      const u = UPGRADES_BY_ID.get(id)!;
      expect(u.special && u.max === 1, id).toBe(true);
      expect(lineWeight(u, 1), id).toBe(COMBAT_ROLL.weight.oneOff);
      expect(lineWeight(u, 1), id).toBeLessThan(lineWeight(might, 7));
      expect(lineWeight(u, 1), id).toBeCloseTo(lineWeight(might, 8), 1);
      expect(tierRarity(u, 1), id).toBe('legendary');
    }
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((t) => tierRarity(might, t))).toEqual(['common', 'common', 'uncommon', 'uncommon', 'rare', 'rare', 'epic', 'epic']);
  });

  it('takes a maxed line out of the roll', () => {
    const odds = combatOdds(game({ might: 8, excalibur: 1 }));
    for (const id of ['might', 'excalibur'] as const) {
      const o = odds.find((x) => x.def.id === id)!;
      expect([o.chance, o.next, o.rarity], id).toEqual([0, null, null]);
    }
    expect(odds.reduce((t, o) => t + o.chance, 0)).toBeCloseTo(1, 12);
  });

  it('lands on each line about as often as its odds say', () => {
    const s = game();
    const want = Object.fromEntries(combatOdds(s).map((o) => [o.def.id, o.chance]));
    const rng = new Rng(5);
    const got: Record<string, number> = {};
    const n = 30_000;
    for (let i = 0; i < n; i++) {
      s.upgrades = {};
      s.gold = 1e9;
      const r = rollCombat(s, () => rng.next())!;
      got[r.id] = (got[r.id] ?? 0) + 1;
    }
    for (const [id, p] of Object.entries(want)) expect((got[id] ?? 0) / n, id).toBeCloseTo(p, 2);
  });
});

// ------------------------------------------------------------------ the price

describe('the combat roll: price', () => {
  it('starts at 150 gold and climbs with the combat tiers owned (Luck tiers leave it alone)', () => {
    expect(combatRollPrice(game())).toBe(150);
    expect(combatRollPrice(game({ luck: 6, greed: 3 }))).toBe(150);
    expect(combatRollPrice(game({ might: 2, ricochet: 1 }))).toBe(combatRollPriceAt(3));
    // Each tier owned makes the next roll about 12% dearer (a step can read 3% to 25%, rounded to two figures).
    let last = 0;
    for (let n = 0; n < COMBAT_TIERS_MAX; n++) {
      const p = combatRollPriceAt(n);
      expect(p, `${n}`).toBeGreaterThan(last);
      if (n > 0) {
        expect(p / last, `${n}`).toBeGreaterThan(1.03);
        expect(p / last, `${n}`).toBeLessThan(1.25);
      }
      last = p;
    }
    expect(combatRollPriceAt(40) / combatRollPriceAt(20)).toBeCloseTo(COMBAT_ROLL.price.growth ** 20, 0);
    // About what the old Combat tab's dearest tiers cost, at the very end.
    expect(combatRollPriceAt(COMBAT_TIERS_MAX - 1)).toBeGreaterThan(500_000);
    expect(combatRollPriceAt(COMBAT_TIERS_MAX - 1)).toBeLessThan(3_000_000);
  });

  it('reads cleanly: two figures', () => {
    expect(tidyPrice(150)).toBe(150);
    expect(tidyPrice(168)).toBe(170);
    expect(tidyPrice(1234)).toBe(1200);
    expect(tidyPrice(98_765)).toBe(99_000);
    expect(tidyPrice(1_349_999)).toBe(1_300_000);
    expect(tidyPrice(99)).toBe(99);
    for (let n = 0; n < COMBAT_TIERS_MAX; n++) {
      const p = combatRollPriceAt(n);
      expect(String(p).replace(/0+$/, '').length, `${p}`).toBeLessThanOrEqual(2);
    }
  });

  it('costs about what buying every combat tier did to max the tab out', () => {
    const rng = new Rng(17);
    const totals: number[] = [];
    let rolls = 0;
    for (let k = 0; k < 150; k++) {
      const s = game({}, 1e12);
      while (combatPoolOpen(s)) {
        expect(rollCombat(s, () => rng.next())).not.toBeNull();
        rolls++;
      }
      expect(combatTiers(s)).toBe(COMBAT_TIERS_MAX);
      totals.push(1e12 - s.gold);
    }
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    expect(mean / OLD_COMBAT_TOTAL).toBeGreaterThan(0.7);
    expect(mean / OLD_COMBAT_TOTAL).toBeLessThan(1.3);
    // Doubles save a few rolls.
    expect(rolls / totals.length).toBeLessThan(COMBAT_TIERS_MAX);
    expect(rolls / totals.length).toBeGreaterThan(COMBAT_TIERS_MAX * 0.85);
  });

  it('counts the rolls the gold covers in a row', () => {
    expect(combatRollsAffordable(game({}, 149))).toBe(0);
    expect(combatRollsAffordable(game({}, 150))).toBe(1);
    expect(combatRollsAffordable(game({}, 150 + combatRollPriceAt(1)))).toBe(2);
    expect(combatRollsAffordable(game({}, 1e12), 9)).toBe(9);
  });
});

// ------------------------------------------------------------------ rolling

describe('the combat roll: rolling', () => {
  it('pays its price and gives the line it lands on a tier, drawing three numbers', () => {
    const s = game({}, 1000);
    const r = seq([uFor(s, 'atkSpeed'), 0.5, 0.5]);
    const roll = rollCombat(s, r.rand)!;
    expect(roll).toMatchObject({ id: 'atkSpeed', from: 0, to: 1, rarity: 'common', double: false, free: false, price: 150, paid: 150 });
    expect(roll.chance).toBeCloseTo(1 / combatOdds(game()).reduce((t, o) => t + o.weight, 0), 9);
    expect(r.drawn()).toBe(3);
    expect(s.gold).toBe(850);
    expect(tier(s, 'atkSpeed')).toBe(1);
    expect(combatRollPrice(s)).toBe(combatRollPriceAt(1));
  });

  it('now and then doubles up: two tiers when the line has room, just one when it has one left', () => {
    const s = game({}, 1e9);
    const two = rollCombat(s, seq([uFor(s, 'might'), 0, 0.5]).rand)!;
    expect([two.id, two.from, two.to, two.double]).toEqual(['might', 0, 2, true]);
    expect(combatRollPrice(s)).toBe(combatRollPriceAt(2));
    s.upgrades.might = 7;
    const last = rollCombat(s, seq([uFor(s, 'might'), 0, 0.5]).rand)!;
    expect([last.from, last.to, last.double]).toEqual([7, 8, false]);
    const oneOff = rollCombat(s, seq([uFor(s, 'excalibur'), 0, 0.5]).rand)!;
    expect([oneOff.id, oneOff.to, oneOff.double, oneOff.rarity]).toEqual(['excalibur', 1, false, 'legendary']);
  });

  it('now and then is free: the gold stays', () => {
    const s = game({}, 500);
    const r = rollCombat(s, seq([uFor(s, 'pratfall'), 0.5, 0]).rand)!;
    expect([r.id, r.free, r.paid, r.price]).toEqual(['pratfall', true, 0, 150]);
    expect(s.gold).toBe(500);
    expect(tier(s, 'pratfall')).toBe(1);
  });

  it("can't roll short of gold: nothing paid, nothing given", () => {
    const s = game({}, 149);
    expect(canRollCombat(s)).toBe(false);
    expect(rollCombat(s, () => 0.5)).toBeNull();
    expect(s.gold).toBe(149);
    expect(s.upgrades).toEqual({});
  });

  it('has nothing to roll once every combat line is maxed', () => {
    const s = game(maxed(), 1e15);
    expect(combatTiers(s)).toBe(COMBAT_TIERS_MAX);
    expect(combatPoolOpen(s)).toBe(false);
    expect(canRollCombat(s)).toBe(false);
    expect(combatRollsAffordable(s)).toBe(0);
    expect(combatOdds(s).every((o) => o.chance === 0)).toBe(true);
    expect(rollCombat(s, () => 0.5)).toBeNull();
    expect(s.gold).toBe(1e15);
    // One line short of full: every roll lands on it.
    const t = game({ ...maxed(), pratfall: 4 }, 1e15);
    for (const u of [0, 0.3, 0.999]) {
      t.upgrades.pratfall = 4;
      expect(rollCombat(t, seq([u, 0.5, 0.5]).rand)?.id).toBe('pratfall');
    }
  });

  it('never takes a line past its last tier, whatever the dice', () => {
    const s = game({}, 1e15);
    const rng = new Rng(3);
    for (let i = 0; i < 400 && combatPoolOpen(s); i++) rollCombat(s, () => rng.next());
    for (const u of COMBAT_LINES) expect(tier(s, u.id), u.id).toBeLessThanOrEqual(u.max);
    expect(s.upgrades).toEqual(maxed());
  });

  it('picks by weight, and never what weighs nothing', () => {
    const rows = [{ k: 'a', weight: 1 }, { k: 'b', weight: 0 }, { k: 'c', weight: 3 }];
    expect(pickWeighted(rows, 0)?.k).toBe('a');
    expect(pickWeighted(rows, 0.249)?.k).toBe('a');
    expect(pickWeighted(rows, 0.25)?.k).toBe('c');
    expect(pickWeighted(rows, 0.999999)?.k).toBe('c');
    expect(pickWeighted(rows, 1)?.k).toBe('c');
    expect(pickWeighted([{ weight: 0 }], 0.5)).toBeNull();
    expect(pickWeighted([], 0.5)).toBeNull();
  });
});

// ------------------------------------------------------------------ Attack Speed

describe('Attack Speed', () => {
  it('is a new combat line: six tiers, each 6% off the attack cooldown', () => {
    const u = UPGRADES_BY_ID.get('atkSpeed')!;
    expect(u).toMatchObject({ name: 'Attack Speed', kind: 'squad', max: 6, icon: 'atkSpeed' });
    expect(ATTACK_SPEED.cdPct).toBe(6);
    for (let t = 0; t <= 6; t++) expect(upgradeFx(game({ atkSpeed: t })).atkCdPct).toBe(6 * t);
    expect(effectAt(game(), 'atkSpeed', 2)).toBe('-12% attack cooldown');
    expect(effectAt(game(), 'atkSpeed', 6)).toBe('-36% attack cooldown');
  });

  it("shortens every knight's attack cooldown, and nothing else", () => {
    for (const cls of ['guardian', 'blade', 'ranger', 'cleric', 'arcanist', 'lancer'] as const) {
      const id = knightId('epic', cls);
      const plain = game();
      addKnight(plain, id, null);
      const fast = game({ atkSpeed: 6 });
      addKnight(fast, id, null);
      const a = knightStats(plain, id);
      const b = knightStats(fast, id);
      expect(a.atkCd).toBeCloseTo(CLASSES[cls].atkCd, 9);
      expect(b.atkCd).toBeCloseTo(a.atkCd * 0.64, 9);
      expect([b.hp, b.atk, b.speed, b.rollTimeMult, b.dodgeCd]).toEqual([a.hp, a.atk, a.speed, a.rollTimeMult, a.dodgeCd]);
      // A third more hits a second makes the knight rate higher (its rating is sqrt(dps x hp)).
      expect(knightRating(fast, id) / knightRating(plain, id)).toBeCloseTo(Math.sqrt(1 / 0.64), 6);
    }
  });

  it('leaves the walking to Move Speed, which no longer touches the attack cooldown', () => {
    const id = knightId('rare', 'blade');
    const plain = game();
    addKnight(plain, id, null);
    const quick = game({ swiftness: 5 });
    addKnight(quick, id, null);
    expect(UPGRADES_BY_ID.get('swiftness')!.name).toBe('Move Speed');
    expect(knightStats(quick, id).speed).toBeCloseTo(knightStats(plain, id).speed * 1.3, 9);
    expect(knightStats(quick, id).atkCd).toBeCloseTo(knightStats(plain, id).atkCd, 9);
    expect(effectAt(quick, 'swiftness', 5)).toBe('+30% move speed');
  });
});

// ------------------------------------------------------------------ the sage's roll

describe("the sage's roll", () => {
  function sage(sigils = 100): GameState {
    const s = game();
    s.rebirths = 1;
    s.sigils = sigils;
    return s;
  }

  it("lands on a perk you don't have yet, never one you have, until there are none left", () => {
    const s = sage();
    const rng = new Rng(9);
    const got: string[] = [];
    while (canRollPerk(s)) {
      const before = [...s.perks];
      const r = rollAndTakePerk(s, () => rng.next())!;
      expect(before, r.perk.id).not.toContain(r.perk.id);
      got.push(r.perk.id);
    }
    expect(new Set(got).size).toBe(PERKS.length);
    expect([...s.perks].sort()).toEqual(PERKS.map((p) => p.id).sort());
    expect(perkOdds(s)).toEqual([]);
    expect(rollPerk(s, () => 0.5)).toBeNull();
    // Fifty sigils for all twenty: five at 1, five at 2, five at 3, five at 4.
    expect(s.sigils).toBe(50);
  });

  it('costs a sigil, and one more for every five perks owned', () => {
    expect(PERK_ROLL).toEqual({ base: 1, per: 5 });
    const s = sage();
    const prices: number[] = [];
    for (let i = 0; i < PERKS.length; i++) {
      prices.push(perkRollPrice(s));
      rollAndTakePerk(s, () => 0.5);
    }
    expect(prices).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
    expect(perkRollsAffordable(sage(7))).toBe(6);
  });

  it('weighs each perk by its old sigil price: Commons come up four times as often as Epics', () => {
    expect(PERKS.map((p) => p.rarity).filter((r) => r === 'common').length).toBe(4);
    expect(PERKS.map((p) => p.rarity).filter((r) => r === 'epic').length).toBe(4);
    const odds = perkOdds(sage());
    expect(odds.length).toBe(PERKS.length);
    expect(odds.reduce((t, o) => t + o.chance, 0)).toBeCloseTo(1, 12);
    const of = (id: string) => odds.find((o) => o.perk.id === id)!.chance;
    expect(of('glassCannon') / of('kamikaze')).toBeCloseTo(4, 9);
    expect(of('glassCannon') / of('bloodPact')).toBeCloseTo(2, 9);
    expect(of('glassCannon') / of('berserker')).toBeCloseTo(3, 9);
    expect([perkWeight({ rarity: 'common' }), perkWeight({ rarity: 'uncommon' }), perkWeight({ rarity: 'rare' }), perkWeight({ rarity: 'epic' })]).toEqual([1, 1 / 2, 1 / 3, 1 / 4]);
    // The tree's first perks aren't needed first any more: the roll can open on a deep one.
    const s = sage();
    let acc = 0;
    for (const o of perkOdds(s)) {
      if (o.perk.id === 'kamikaze') break;
      acc += o.chance;
    }
    expect(rollPerk(s, () => acc + 0.001)?.perk.id).toBe('kamikaze');
  });

  it('opens after the first rebirth, and takes the sigils it costs', () => {
    const s = sage();
    s.rebirths = 0;
    expect(canRollPerk(s)).toBe(false);
    expect(perkRollsAffordable(s)).toBe(0);
    expect(rollPerk(s, () => 0.5)).toBeNull();
    expect(s.sigils).toBe(100);
    const t = sage(0);
    expect(rollPerk(t, () => 0.5)).toBeNull();
    t.sigils = 1;
    expect(rollAndTakePerk(t, () => 0.5)?.price).toBe(1);
    expect(t.sigils).toBe(0);
  });

  it('lands an offer, not a purchase: nothing is paid or owned until it is accepted, and no new roll until it is answered', () => {
    const s = sage(3);
    const r = rollPerk(s, () => 0)!;
    expect(r.perk.id).toBe('handMeDowns');
    expect(perkOffer(s)?.id).toBe('handMeDowns');
    expect(s.sigils).toBe(3);
    expect(s.perks).toEqual([]);
    // It waits on the counter: the roll is shut, and the tab still counts what the sigils cover.
    expect(canRollPerk(s)).toBe(false);
    expect(rollPerk(s, () => 0.9)).toBeNull();
    expect(perkOffer(s)?.id).toBe('handMeDowns');
    expect(perkRollsAffordable(s)).toBe(3);
    // ACCEPT: paid now, and it's yours.
    expect(acceptPerk(s)?.id).toBe('handMeDowns');
    expect(s.sigils).toBe(2);
    expect(s.perks).toEqual(['handMeDowns']);
    expect(perkOffer(s)).toBeNull();
    expect(acceptPerk(s)).toBeNull();
    expect(rejectPerk(s)).toBeNull();
    expect(canRollPerk(s)).toBe(true);
  });

  it('REJECT costs nothing, and that perk is out of the roll for the rest of the run', () => {
    const s = sage(100);
    // Four-Leaf Litter: 3x luck tokens for extras at half the gold. Not everyone's bargain.
    let acc = 0;
    for (const o of perkOdds(s)) {
      if (o.perk.id === 'fourLeafLitter') break;
      acc += o.chance;
    }
    expect(rollPerk(s, () => acc + 0.001)?.perk.id).toBe('fourLeafLitter');
    expect(rejectPerk(s)?.id).toBe('fourLeafLitter');
    expect(s.sigils).toBe(100);
    expect(s.perks).toEqual([]);
    expect(passedPerk(s, 'fourLeafLitter')).toBe(true);
    expect(perkOffer(s)).toBeNull();
    expect(perkOdds(s).map((o) => o.perk.id)).not.toContain('fourLeafLitter');
    expect(perkOdds(s).length).toBe(PERKS.length - 1);
    expect(perkOdds(s).reduce((t, o) => t + o.chance, 0)).toBeCloseTo(1, 12);
    // The same draw can't land it again: he has others to show.
    const rng = new Rng(4);
    for (let i = 0; i < 200 && canRollPerk(s); i++) {
      expect(rollPerk(s, () => rng.next())!.perk.id).not.toBe('fourLeafLitter');
      rejectPerk(s);
    }
    // Everything turned down: nothing left to roll, nothing owned, not a sigil spent.
    expect(perkOdds(s)).toEqual([]);
    expect(canRollPerk(s)).toBe(false);
    expect(s.perksPassed.length).toBe(PERKS.length);
    expect(s.perks).toEqual([]);
    expect(s.sigils).toBe(100);
  });

  it('the price climbs with every five perks shown, taken or turned down: fishing for a better one costs', () => {
    const s = sage(100);
    for (let i = 0; i < 4; i++) {
      rollPerk(s, () => 0.5);
      rejectPerk(s);
    }
    expect(perkRollPrice(s)).toBe(1);
    rollPerk(s, () => 0.5);
    rejectPerk(s);
    // Five looks, none taken: the first perk bought now costs two.
    expect(s.sigils).toBe(100);
    expect(perkRollPrice(s)).toBe(2);
    expect(rollAndTakePerk(s, () => 0.5)?.price).toBe(2);
    expect(s.sigils).toBe(98);
    expect(s.perks.length).toBe(1);
    // A purse of one sigil can look at five and take one of them, no more.
    const poor = sage(1);
    for (let i = 0; i < 5; i++) {
      expect(canRollPerk(poor)).toBe(true);
      rollPerk(poor, () => 0.5);
      rejectPerk(poor);
    }
    expect(canRollPerk(poor)).toBe(false);
    expect(perkRollsAffordable(poor)).toBe(0);
  });

  it('a rebirth clears what was turned down and what was on the counter', () => {
    const s = sage(5);
    s.run.bestFloor = 999;
    rollPerk(s, () => 0);
    rejectPerk(s);
    rollPerk(s, () => 0);
    expect(s.perksPassed.length).toBe(1);
    expect(perkOffer(s)).not.toBeNull();
    expect(rebirth(s)).toBe(true);
    expect(s.perksPassed).toEqual([]);
    expect(s.perkOffer).toBeNull();
    expect(perkOdds(s).length).toBe(PERKS.length);
  });
});

// ------------------------------------------------------------------ saves

describe('an older save', () => {
  it('keeps its upgrades and perks: combat tiers whose old parents are gone stay; unknown or repeated perks go', () => {
    const old = game({ luck: 2, quickRoll: 3, ladyLuck: 1, pratfall: 2 });
    old.rebirths = 1;
    old.perks = ['glassCannon', 'shieldWall'];
    const raw = JSON.parse(JSON.stringify(old));
    raw.perks = ['glassCannon', 'glassCannon', 'nope', 7, 'heirloom', 'shieldWall'];
    const s = mend(raw);
    expect(s.upgrades).toEqual({ luck: 2, quickRoll: 3, ladyLuck: 1, pratfall: 2 });
    // (Heirloom, which kept a knight through a rebirth, is gone: an old save's copy is dropped.)
    expect(s.perks).toEqual(['glassCannon', 'shieldWall']);
    expect(perkOdds(s).map((o) => o.perk.id)).not.toContain('glassCannon');
    expect(mend({ ...raw, perks: 'junk' }).perks).toEqual([]);
    // A save from before perks could be turned down has no rejections and nothing on the counter.
    delete raw.perksPassed;
    delete raw.perkOffer;
    expect(mend(raw).perksPassed).toEqual([]);
    expect(mend(raw).perkOffer).toBeNull();
    // A damaged list keeps only real perks that aren't owned; an offer he couldn't make goes.
    const t = mend({ ...raw, perksPassed: ['bloodPact', 'bloodPact', 'nope', 3, 'glassCannon'], perkOffer: 'berserker' });
    expect(t.perksPassed).toEqual(['bloodPact']);
    expect(t.perkOffer).toBe('berserker');
    expect(mend({ ...raw, perkOffer: 'glassCannon' }).perkOffer).toBeNull();
    expect(mend({ ...raw, perksPassed: ['bloodPact'], perkOffer: 'bloodPact' }).perkOffer).toBeNull();
    expect(mend({ ...raw, perkOffer: 'nope' }).perkOffer).toBeNull();
  });
});
