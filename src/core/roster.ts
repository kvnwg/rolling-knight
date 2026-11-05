/**
 * Your knights: you own each knight once (its first pull); every later pull of it is a spare copy
 * you either break down into that knight's shards or sell for gold, and shards (plus gold) level
 * that knight up. Neither ever touches the knight itself: only its spares go.
 * Also the squad: three slots, one of them yours to control. Empty slots fill themselves with your
 * strongest free knight; anything else is your choice (or Best squad).
 */
import { BAL } from './balance';
import { CLASSES, knightDef, type ClassId } from './knights';
import { hasPerk } from './perks';
import { RARITY_STAT, rarityIndex, type Rarity } from './rarity';
import type { GameState, KnightRec, MutationId } from './state';
import { MUTATIONS } from './state';
import { upgradeFx } from './upgrades';
import { skillRollCd } from './skillbook';

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
  /** Seconds between skill rolls (Quick Roll shortens it). */
  specialCd: number;
  /** A skill roll's spin, as a share of the usual (world/skills.ts ROLL_TIME): Quick Roll shortens it. */
  rollTimeMult: number;
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
  const specialCd = skillRollCd(id) * (1 - up.skillCdPct / 100);
  return { hp, atk, armor: cls.armor, speed: cls.speed * speedMult, atkCd, range: cls.range, dodgeCd, specialCd, rollTimeMult: 1 - up.rollSpinPct / 100 };
}

// ------------------------------------------------------------------ spare copies (duplicates)

/** Shards one spare copy breaks down into. */
export function shardsPerDupe(state: Pick<GameState, 'perks'>, rarity: Rarity): number {
  return hasPerk(state, 'peasantLevy') && isUnderdog(rarity) ? 2 : 1;
}

/** Gold for one kill on `floor` before multipliers. */
// ------------------------------------------------------------------ the smith's reforge

/** Gold for reforging this knight: kills' worth at your best floor, more for rarer knights and each time. */
export function reforgeCost(state: GameState, id: string): number {
  const R = BAL.roster.reforge;
  const rec = state.roster[id];
  const base = R.kills * killGold(Math.max(1, state.run.bestFloor)) * (1 + R.rarityStep * rarityIndex(knightDef(id).rarity));
  return Math.round(base * Math.pow(R.growth, rec?.reforges ?? 0));
}

/** The chance a reforge lands each mutation (rarest first, as the altar rolls them). */
export function reforgeOdds(): Array<[MutationId, number]> {
  return MUTATIONS.map((m) => [m, Math.min(1, BAL.roster.reforge.oddsMult / BAL.mutations[m].oneIn)] as [MutationId, number]);
}

export function canReforge(state: GameState, id: string): boolean {
  const rec = state.roster[id];
  return !!rec && rec.mutation !== 'void' && state.gold >= reforgeCost(state, id);
}

/**
 * Reforge: pay, then roll for a mutation at boosted odds (rarest first). A better one than the knight
 * has replaces it; anything else leaves it as it was.
 */
export function reforge(state: GameState, id: string, rand: () => number): { rolled: MutationId | null; improved: boolean } | null {
  if (!canReforge(state, id)) return null;
  const rec = state.roster[id];
  state.gold -= reforgeCost(state, id);
  rec.reforges = (rec.reforges ?? 0) + 1;
  let rolled: MutationId | null = null;
  const odds = reforgeOdds();
  for (let i = odds.length - 1; i >= 0; i--) {
    if (rand() < odds[i][1]) {
      rolled = odds[i][0];
      break;
    }
  }
  const rank = (m: MutationId | null) => (m ? MUTATIONS.indexOf(m) : -1);
  const improved = rolled !== null && rank(rolled) > rank(rec.mutation);
  if (improved) rec.mutation = rolled;
  return { rolled, improved };
}

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

/** How many spare copies a request for `n` of them takes: a whole number, never more than the knight has. */
function spareCount(rec: KnightRec | undefined, n: number): number {
  if (!rec) return 0;
  const k = Math.floor(Math.min(n, rec.dupes));
  return Number.isFinite(k) && k > 0 ? k : 0;
}

/**
 * What `n` of a knight's spare copies (all of them by default) would give: the shards breaking them
 * down adds to this knight, or the gold selling them pays. `copies` is how many that really is.
 */
export function spareYield(state: GameState, id: string, n = Infinity): { copies: number; shards: number; gold: number } {
  const copies = spareCount(state.roster[id], n);
  if (copies === 0) return { copies, shards: 0, gold: 0 };
  return { copies, shards: copies * shardsPerDupe(state, knightDef(id).rarity), gold: sellValue(state, id) * copies };
}

/**
 * Breaks `n` of a knight's spare copies (all by default) down into its shards. Returns the shards
 * this knight got. The knight itself always stays; with no spares nothing happens.
 */
export function shardDupes(state: GameState, id: string, n = Infinity): number {
  const rec = state.roster[id];
  const k = spareCount(rec, n);
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

/** Sells `n` of a knight's spare copies (all by default). Returns the gold. The knight itself always stays. */
export function sellDupes(state: GameState, id: string, n = Infinity): number {
  const rec = state.roster[id];
  const k = spareCount(rec, n);
  if (k <= 0) return 0;
  rec.dupes -= k;
  const g = sellValue(state, id) * k;
  state.gold += g;
  return g;
}

export function totalDupes(state: GameState): number {
  return Object.values(state.roster).reduce((s, r) => s + r.dupes, 0);
}

/** Every knight that has spare copies (most spares first), with what all of them would give. */
export function spareList(state: GameState): Array<{ id: string; copies: number; shards: number; gold: number }> {
  return Object.keys(state.roster)
    .map((id) => ({ id, ...spareYield(state, id) }))
    .filter((x) => x.copies > 0)
    .sort((a, b) => b.copies - a.copies || rarityIndex(knightDef(b.id).rarity) - rarityIndex(knightDef(a.id).rarity));
}

/** Breaks down every knight's spare copies (the scrap dealer's "all at once", after you confirm). Returns the shards. */
export function shardAll(state: GameState): number {
  let n = 0;
  for (const id of Object.keys(state.roster)) n += shardDupes(state, id);
  return n;
}

/** Sells every knight's spare copies (the scrap dealer's "all at once", after you confirm). Returns the gold. */
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

/** How long a knight wears its NEW tag after it first joins your roster (real time). */
export const NEW_FOR_MS = 30_000;

/** First joined within the last 30 seconds of real time (`now` is the wall clock), so it still wears its NEW tag. */
export function isNewKnight(rec: Pick<KnightRec, 'gotAt'> | null | undefined, now: number): boolean {
  const at = rec?.gotAt;
  if (typeof at !== 'number' || !Number.isFinite(at)) return false;
  const age = now - at;
  return age >= 0 && age < NEW_FOR_MS;
}

export type AddResult = { kind: 'new' } | { kind: 'dupe'; auto: 'keep' | 'shard' | 'sell'; gold: number; shards: number; mutationUp: boolean };

function betterMutation(a: MutationId | null, b: MutationId | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return MUTATIONS.indexOf(a) > MUTATIONS.indexOf(b);
}

/**
 * A rolled knight arrives: a new knight joins (stamped with the wall clock `now`, for its NEW tag),
 * a repeat becomes a spare copy (or goes by its rarity's rule straight away).
 */
export function addKnight(state: GameState, id: string, mutation: MutationId | null, now = Date.now()): AddResult {
  const def = knightDef(id);
  const codex = (state.codex[id] ??= { count: 0, best: null, firstAt: state.playTimeMs });
  codex.count += 1;
  if (betterMutation(mutation, codex.best)) codex.best = mutation;
  const rec = state.roster[id];
  if (!rec) {
    state.roster[id] = { id, level: 1, shards: 0, dupes: 0, mutation, copies: 1, firstAt: state.playTimeMs, gotAt: now };
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
