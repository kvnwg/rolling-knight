import { describe, expect, it } from 'vitest';
import { BAL } from '../src/core/balance';
import { KNIGHTS } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { REF_DPS, REF_FOE, REF_HP, REF_POWER, fightReport, floorDifficulty, floorPar, foeStats, knightRating, squadPower } from '../src/core/power';
import { addKnight, levelUp } from '../src/core/roster';
import type { GameState } from '../src/core/state';

const B = BAL.balance;

function squadOf(ids: string[]): GameState {
  const s = newGame(1);
  for (const id of ids) addKnight(s, id, null);
  s.squad = [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null];
  return s;
}
const first = (rarity: string, cls: string) => KNIGHTS.find((k) => k.rarity === rarity && k.cls === cls)!.id;

describe('power', () => {
  it('rates a level-1 Common 100 whatever its class, so three make 300', () => {
    const s = squadOf([first('common', 'guardian'), first('common', 'blade'), first('common', 'ranger')]);
    for (const id of s.squad) expect(knightRating(s, id!)).toBeCloseTo(100, 5);
    expect(squadPower(s)).toBeCloseTo(REF_POWER, 5);
  });

  it('grows with rarity and level, and an empty slot adds nothing', () => {
    const s = squadOf([first('legendary', 'blade'), first('common', 'ranger')]);
    const legend = knightRating(s, s.squad[0]!);
    expect(legend).toBeCloseTo(480, 0);
    const before = squadPower(s);
    s.roster[s.squad[1]!].shards = 999;
    s.gold = 1e9;
    levelUp(s, s.squad[1]!);
    expect(squadPower(s)).toBeGreaterThan(before);
    expect(squadPower(s)).toBeCloseTo(legend + knightRating(s, s.squad[1]!), 5);
  });
});

describe('difficulty', () => {
  it('par grows every floor', () => {
    for (let f = 1; f < 60; f++) expect(floorPar(f + 1)).toBeGreaterThan(floorPar(f));
    expect(floorPar(1)).toBe(B.parBase);
  });

  it('at par, a plain foe takes ttk.mob seconds of the squad and hits for hit.mob of a knight', () => {
    for (const f of [1, 7, 20, 45]) {
      const r = fightReport(f, floorPar(f));
      expect(r.challenge).toBe('fair');
      expect(r.mob.ttk).toBeCloseTo(B.ttk.mob, 5);
      expect(r.mob.hit).toBeCloseTo(B.hit.mob, 5);
      expect(r.elite.ttk).toBeCloseTo(B.ttk.elite, 5);
      expect(r.boss.ttk).toBeCloseTo(B.ttk.boss, 5);
    }
  });

  it('a squad far above par still meets foes worth fighting (nothing folds in one hit)', () => {
    // Ten times par (the tutorial's Exalted on floor 1 is about 2.4x).
    const r = fightReport(3, floorPar(3) * 10);
    expect(r.challenge).toBe('trivial');
    // A one-hit kill would be well under a tenth of a second of the whole squad's damage.
    expect(r.mob.ttk).toBeGreaterThan(0.5);
    expect(r.mob.hit).toBeGreaterThan(0.015);
    expect(r.boss.ttk).toBeGreaterThan(10);
    // ...but being stronger always pays: faster than par, and smaller hits.
    expect(r.mob.ttk).toBeLessThan(B.ttk.mob);
    expect(r.mob.hit).toBeLessThan(B.hit.mob);
  });

  it('a squad below par gets only a gentle hand: the wall is real', () => {
    const r = fightReport(20, floorPar(20) * 0.4);
    expect(r.challenge).toBe('deadly');
    expect(r.value).toBeGreaterThan(floorPar(20) * 0.8);
    expect(r.mob.ttk).toBeGreaterThan(B.ttk.mob * 2);
    expect(r.mob.hit).toBeGreaterThan(B.hit.mob * 2);
  });

  it('for the same squad, deeper floors are always tougher', () => {
    const power = 5000;
    let last = 0;
    for (let f = 1; f < 50; f++) {
      const d = floorDifficulty(f, power).value;
      expect(d).toBeGreaterThan(last);
      last = d;
    }
  });

  it('more power never makes a floor slower or more dangerous', () => {
    let lastTtk = Infinity;
    let lastHit = Infinity;
    for (let p = 200; p < 200000; p *= 1.3) {
      const r = fightReport(12, p);
      expect(r.mob.ttk).toBeLessThanOrEqual(lastTtk + 1e-9);
      expect(r.mob.hit).toBeLessThanOrEqual(lastHit + 1e-9);
      lastTtk = r.mob.ttk;
      lastHit = r.mob.hit;
    }
  });

  it('foe types keep their shape against the plain chaser', () => {
    const d = 3000;
    const plain = foeStats(REF_FOE, d, 'mob');
    const tank = foeStats({ hp: REF_FOE.hp * 3, atk: REF_FOE.atk }, d, 'mob');
    expect(tank.hp / plain.hp).toBeCloseTo(3, 5);
    expect(plain.hp).toBeCloseTo(B.ttk.mob * REF_DPS * (d / REF_POWER), 5);
    expect(plain.atk).toBeCloseTo(B.hit.mob * REF_HP * (d / REF_POWER), 5);
    const elite = foeStats(REF_FOE, d, 'elite');
    expect(elite.hp / plain.hp).toBeCloseTo(B.ttk.elite / B.ttk.mob, 5);
  });
});
