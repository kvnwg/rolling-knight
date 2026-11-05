/**
 * Your knights: the first copy of a knight joins the roster; every later copy is a duplicate you
 * either sell for gold or break into shards, and shards (plus gold) level that knight up.
 * Also the squad: three slots, one of them yours to control. Empty slots fill themselves with your
 * strongest free knight; anything else is your choice (or Best squad).
 */
import { BAL } from './balance';
import { CLASSES, knightDef, specialOf, type ClassId } from './knights';
import { hasPerk } from './perks';
import { RARITY_STAT, rarityIndex, type Rarity } from './rarity';
import type { GameState, KnightRec, MutationId } from './state';
import { MUTATIONS } from './state';
import { upgradeFx } from './upgrades';

const LEGENDARY = rarityIndex('legendary');

export function isUnderdog(r: Rarity): boolean {
  return r === 'common' || r === 'uncommon';
}

/** Share of base stats each level adds (Humble Beginnings: 3× for Common and Uncommon). */
export function levelGain(state: Pick<GameState, 'perks'>, rarity: Rarity): number {
  return BAL.roster.levelPct * (hasPerk(state, 'humbleBeginnings') && isUnderdog(rarity) ? 3 : 1);
}

export function levelMult(state: Pick<GameState, 'perks'>, rarity: Rarity, level: number): number {
  return 1 + levelGain(state, rarity) * (level - 1);
}

export function mutationMult(m: MutationId | null): number {
  return m ? 1 + BAL.mutations[m].statPct / 100 : 1;
}

export function rarityMult(state: Pick<GameState, 'perks'>, rarity: Rarity): number {
  const base = RARITY_STAT[rarity];
  const below = LEGENDARY - rarityIndex(rarity);
  return hasPerk(state, 'ragsToRiches') && below > 0 ? base * (1 + 0.25 * below) : base;
}

export function rebirthStatMult(rebirths: number): number {
  return 1 + (BAL.rebirth.statPctPer / 100) * rebirths;
}

/** Power: one number for a knight's strength (rarity × level × mutation), 100 for a fresh Common. */
export function knightPower(state: Pick<GameState, 'perks'>, rec: Pick<KnightRec, 'id' | 'level' | 'mutation'>): number {
  const def = knightDef(rec.id);
  return Math.round(100 * rarityMult(state, def.rarity) * levelMult(state, def.rarity, rec.level) * mutationMult(rec.mutation));
}

export interface KnightStats {
  hp: number;
  atk: number;
  armor: number;
  speed: number;
  atkCd: number;
  range: number;
  dodgeCd: number;
  specialCd: number;
}

/** A knight's stats in the dungeon (before effects that depend on the moment, like Berserker). */
export function knightStats(state: GameState, id: string): KnightStats {
  const rec = state.roster[id];
  const def = knightDef(id);
  const cls = CLASSES[def.cls];
  const up = upgradeFx(state);
  const m = rarityMult(state, def.rarity) * levelMult(state, def.rarity, rec?.level ?? 1) * mutationMult(rec?.mutation ?? null) * rebirthStatMult(state.rebirths);
  let hp = cls.hp * m * (1 + up.hpPct / 100);
  let atk = cls.atk * m * (1 + up.atkPct / 100);
  if (hasPerk(state, 'glassCannon')) {
    hp *= 0.5;
    atk *= 2;
  }
  const speedMult = 1 + up.speedPct / 100;
  let atkCd = cls.atkCd / speedMult;
  if (hasPerk(state, 'rollDancer')) atkCd *= 1.2;
  let dodgeCd = cls.dodgeCd;
  if (hasPerk(state, 'rollDancer')) dodgeCd *= 0.5;
  return { hp, atk, armor: cls.armor, speed: cls.speed * speedMult, atkCd, range: cls.range, dodgeCd, specialCd: specialOf(id).cd };
}

// ------------------------------------------------------------------ duplicates

export function shardsPerDupe(state: Pick<GameState, 'perks'>, rarity: Rarity): number {
  return hasPerk(state, 'peasantLevy') && isUnderdog(rarity) ? 2 : 1;
}

/** Gold for one kill on `floor` before multipliers. */
export function killGold(floor: number): number {
  return BAL.dungeon.goldPerKill * Math.pow(BAL.dungeon.goldGrowth, Math.max(0, floor - 1));
}

export function goldMult(state: GameState): number {
  return (1 + upgradeFx(state).goldPct / 100) * (1 + BAL.rebirth.goldMultPer * state.rebirths);
}

export function sellValue(state: GameState, id: string): number {
  const def = knightDef(id);
  let v = BAL.roster.sellKills[def.rarity] * killGold(Math.max(1, state.run.bestFloor)) * goldMult(state);
  if (hasPerk(state, 'pawnShop')) v *= 4;
  if (hasPerk(state, 'fourLeafLitter')) v *= 0.5;
  return Math.max(1, Math.round(v));
}

export function shardDupes(state: GameState, id: string, n = Infinity): number {
  const rec = state.roster[id];
  if (!rec) return 0;
  const k = Math.min(n, rec.dupes);
  if (k <= 0) return 0;
  const def = knightDef(id);
  rec.dupes -= k;
  const per = shardsPerDupe(state, def.rarity);
  rec.shards += k * per;
  if (hasPerk(state, 'handMeDowns')) {
    for (const other of Object.values(state.roster)) if (other.id !== id && knightDef(other.id).cls === def.cls) other.shards += k;
  }
  return k * per;
}

export function sellDupes(state: GameState, id: string, n = Infinity): number {
  const rec = state.roster[id];
  if (!rec) return 0;
  const k = Math.min(n, rec.dupes);
  if (k <= 0) return 0;
  rec.dupes -= k;
  const g = sellValue(state, id) * k;
  state.gold += g;
  return g;
}

export function totalDupes(state: GameState): number {
  return Object.values(state.roster).reduce((s, r) => s + r.dupes, 0);
}

export function shardAll(state: GameState): number {
  let n = 0;
  for (const id of Object.keys(state.roster)) n += shardDupes(state, id);
  return n;
}

export function sellAll(state: GameState): number {
  let g = 0;
  for (const id of Object.keys(state.roster)) g += sellDupes(state, id);
  return g;
}

// ------------------------------------------------------------------ levels

export function levelCost(level: number): { shards: number; gold: number } {
  return { shards: level, gold: Math.round(BAL.roster.goldBase * Math.pow(BAL.roster.goldGrowth, level - 1)) };
}

export function canLevel(state: GameState, id: string): boolean {
  const rec = state.roster[id];
  if (!rec || rec.level >= BAL.roster.maxLevel) return false;
  const c = levelCost(rec.level);
  return rec.shards >= c.shards && state.gold >= c.gold;
}

export function levelUp(state: GameState, id: string): boolean {
  if (!canLevel(state, id)) return false;
  const rec = state.roster[id];
  const c = levelCost(rec.level);
  rec.shards -= c.shards;
  state.gold -= c.gold;
  rec.level += 1;
  return true;
}

// ------------------------------------------------------------------ adding knights

export type AddResult = { kind: 'new' } | { kind: 'dupe'; auto: 'keep' | 'shard' | 'sell'; gold: number; shards: number; mutationUp: boolean };

function betterMutation(a: MutationId | null, b: MutationId | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return MUTATIONS.indexOf(a) > MUTATIONS.indexOf(b);
}

/** A rolled knight arrives: a new knight joins, a duplicate goes to the pile (or its auto rule). */
export function addKnight(state: GameState, id: string, mutation: MutationId | null): AddResult {
  const def = knightDef(id);
  const codex = (state.codex[id] ??= { count: 0, best: null, firstAt: state.playTimeMs });
  codex.count += 1;
  if (betterMutation(mutation, codex.best)) codex.best = mutation;
  const rec = state.roster[id];
  if (!rec) {
    state.roster[id] = { id, level: 1, shards: 0, dupes: 0, mutation, copies: 1, firstAt: state.playTimeMs, isNew: true };
    fillSquad(state);
    return { kind: 'new' };
  }
  rec.copies += 1;
  const mutationUp = betterMutation(mutation, rec.mutation);
  if (mutationUp) rec.mutation = mutation;
  rec.dupes += 1;
  const rule = state.dupeRules[def.rarity];
  let gold = 0;
  let shards = 0;
  if (rule === 'shard') shards = shardDupes(state, id, 1);
  else if (rule === 'sell') gold = sellDupes(state, id, 1);
  return { kind: 'dupe', auto: rule, gold, shards, mutationUp };
}

// ------------------------------------------------------------------ squad

export function rankedKnights(state: GameState): string[] {
  return Object.values(state.roster)
    .sort((a, b) => knightPower(state, b) - knightPower(state, a))
    .map((r) => r.id);
}

/** Empty squad slots take your strongest knights that aren't in the squad. */
export function fillSquad(state: GameState): void {
  for (let i = 0; i < state.squad.length; i++) {
    if (state.squad[i]) continue;
    const free = rankedKnights(state).find((id) => !state.squad.includes(id));
    if (free) state.squad[i] = free;
  }
}

/** Your three strongest knights, keeping the one you control in its slot if it makes the cut. */
export function bestSquad(state: GameState): void {
  const top = rankedKnights(state).slice(0, 3);
  const keep = state.squad[state.controlled];
  const next: Array<string | null> = [null, null, null];
  if (keep && top.includes(keep)) next[state.controlled] = keep;
  for (const id of top) {
    if (next.includes(id)) continue;
    const slot = next.findIndex((x) => x === null);
    if (slot >= 0) next[slot] = id;
  }
  state.squad = next;
}

export function setSquadSlot(state: GameState, slot: number, id: string | null): void {
  if (id) {
    const other = state.squad.indexOf(id);
    if (other >= 0) state.squad[other] = state.squad[slot];
  }
  state.squad[slot] = id;
}

export function classOf(id: string): ClassId {
  return knightDef(id).cls;
}
