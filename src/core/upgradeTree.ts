/**
 * The upgrade maps' honeycomb (Dumpster Legend's hexLayout.ts): every tier of every upgrade line is
 * one hex on a flat-top grid in doubled coordinates, `col` the column and `row` counting half-hex
 * steps down, so a hex's neighbors are 2 rows up or down in its column, or 1 row up or down in the
 * next column. Each of the tinker's tabs has its own map with its own root at the center (Luck I for
 * Luck, Whetstone I for Combat), and each line's path walks from the tier it hangs off.
 *
 * Also the reveal rules: owned hexes and the next buyable ones show, the hexes one step past a
 * buyable one show as "?", and everything further out stays hidden.
 */
import { BAL } from './balance';
import { CHANCE, chanceFx, skillRollLuck } from './chance';
import { luckyEvery, luckyMult } from './luck';
import { drySpell, reelCount, spinCycle } from './roller';
import type { GameState } from './state';
import { UPGRADES, UPGRADES_BY_ID, UPGRADE_TABS, tier, upgradeFx, upgradeNodeState, upgradeTab, type UpgradeDef, type UpgradeId, type UpgradeTab } from './upgrades';

export const HEX_STEPS = {
  n: [0, -2],
  ne: [1, -1],
  se: [1, 1],
  s: [0, 2],
  sw: [-1, 1],
  nw: [-1, -1],
} as const;

export type HexStep = keyof typeof HEX_STEPS;

export interface HexNode {
  /** `${line id}:${tier}` */
  key: string;
  id: UpgradeId;
  tier: number;
  col: number;
  row: number;
  /** The hex this one hangs off (the tier before, or the parent line's tier); null for Luck I. */
  prev: string | null;
  special: boolean;
}

export const nodeKey = (id: string, t: number) => `${id}:${t}`;

/** Expands `ne*3 n` into `['ne', 'ne', 'ne', 'n']`. Unknown steps come back as they are, for the caller to reject. */
export function expandPath(path: string): string[] {
  const out: string[] = [];
  for (const tok of path.split(' ').filter(Boolean)) {
    const [dir, count] = tok.split('*');
    const n = count === undefined ? 1 : Number(count);
    for (let i = 0; i < n; i++) out.push(dir);
  }
  return out;
}

interface LineLike {
  id: string;
  max: number;
  path: string;
  special?: boolean;
  requires?: { id: string; tier: number };
}

/** Lays out every tier of every line. `errors` lists anything that makes the map invalid (overlaps, bad paths). */
export function layoutUpgradeMap(lines: readonly LineLike[]): { nodes: HexNode[]; errors: string[] } {
  const nodes: HexNode[] = [];
  const errors: string[] = [];
  const byKey = new Map<string, HexNode>();
  const taken = new Map<string, string>();
  const pending = [...lines];
  const roots = lines.filter((l) => !l.requires);
  if (roots.length !== 1) errors.push(`the upgrade map needs exactly one root line, found ${roots.length}`);
  // Place lines whose parent is already placed until nothing changes.
  let progress = true;
  while (pending.length > 0 && progress) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const line = pending[i];
      const parentKey = line.requires ? nodeKey(line.requires.id, line.requires.tier) : null;
      const parent = parentKey ? byKey.get(parentKey) : null;
      if (parentKey && !parent) continue;
      pending.splice(i--, 1);
      progress = true;
      const steps = expandPath(line.path);
      const want = parent ? line.max : line.max - 1;
      if (steps.length !== want) errors.push(`upgrade ${line.id}: path has ${steps.length} steps, needs ${want}`);
      let col = parent ? parent.col : 0;
      let row = parent ? parent.row : 0;
      let prev: string | null = parent ? parent.key : null;
      for (let t = 1; t <= line.max; t++) {
        if (t > 1 || parent) {
          const name = steps[parent ? t - 1 : t - 2];
          const step = HEX_STEPS[name as HexStep];
          if (!step) {
            errors.push(`upgrade ${line.id}: bad step "${name}"`);
            break;
          }
          col += step[0];
          row += step[1];
        }
        const key = nodeKey(line.id, t);
        const cell = `${col},${row}`;
        const other = taken.get(cell);
        if (other) errors.push(`upgrade ${key} overlaps ${other} on the map`);
        taken.set(cell, key);
        const node: HexNode = { key, id: line.id as UpgradeId, tier: t, col, row, prev, special: !!line.special };
        nodes.push(node);
        byKey.set(key, node);
        prev = key;
      }
    }
  }
  for (const line of pending) errors.push(`upgrade ${line.id} hangs off ${line.requires?.id} tier ${line.requires?.tier}, which is not on the map`);
  return { nodes, errors };
}

/** The lines sold on a tab, in the order UPGRADES lists them. */
export function tabLines(tab: UpgradeTab): UpgradeDef[] {
  return UPGRADES.filter((u) => upgradeTab(u) === tab);
}

const LAYOUTS = Object.fromEntries(UPGRADE_TABS.map((t) => [t, layoutUpgradeMap(tabLines(t))])) as Record<UpgradeTab, ReturnType<typeof layoutUpgradeMap>>;

/** Each tab's map: every hex of its lines, parents before children, its root at (0, 0). */
export const UPGRADE_MAPS: Readonly<Record<UpgradeTab, readonly HexNode[]>> = { luck: LAYOUTS.luck.nodes, combat: LAYOUTS.combat.nodes };
/** Every hex of both maps (each sits on its own tab's map). */
export const UPGRADE_MAP: readonly HexNode[] = UPGRADE_TABS.flatMap((t) => UPGRADE_MAPS[t]);
/** Problems with the maps' layout (none, or a test fails). A line that hangs off another tab's line counts. */
export const UPGRADE_MAP_ERRORS: readonly string[] = UPGRADE_TABS.flatMap((t) => LAYOUTS[t].errors.map((e) => `${t} map: ${e}`));
export const HEX_BY_KEY: ReadonlyMap<string, HexNode> = new Map(UPGRADE_MAP.map((n) => [n.key, n]));
/** Each tab's root hex, the center of its map: Luck I and Whetstone I. */
export const ROOT_KEYS: Readonly<Record<UpgradeTab, string>> = Object.fromEntries(
  UPGRADE_TABS.map((t) => [t, nodeKey(tabLines(t).find((u) => !u.requires)?.id ?? '', 1)]),
) as Record<UpgradeTab, string>;
/** Luck I, the center of the Luck map. */
export const ROOT_KEY = ROOT_KEYS.luck;

/** The tab a hex is on. */
export function hexTab(n: Pick<HexNode, 'id'>): UpgradeTab {
  return upgradeTab(UPGRADES_BY_ID.get(n.id)!);
}

/** Hex distance from its map's root (the opening ripple spreads ring by ring). */
export function hexRing(n: Pick<HexNode, 'col' | 'row'>): number {
  return Math.max(Math.abs(n.col), (Math.abs(n.col) + Math.abs(n.row)) / 2);
}

// ------------------------------------------------------------------ what each hex shows

/** What a hex shows: owned, open (buyable next), mystery ("?", one step past an open hex). Hidden hexes are null. */
export type HexView = 'owned' | 'open' | 'mystery';

export function hexView(state: Pick<GameState, 'upgrades'>, n: HexNode): HexView | null {
  const st = upgradeNodeState(state, n.id, n.tier);
  if (st !== 'locked') return st;
  const prev = n.prev ? HEX_BY_KEY.get(n.prev) : undefined;
  return prev && upgradeNodeState(state, prev.id, prev.tier) === 'open' ? 'mystery' : null;
}

/** Every hex that shows (on one tab's map, or both), with what it shows. */
export function visibleHexes(state: Pick<GameState, 'upgrades'>, tab?: UpgradeTab): Array<{ node: HexNode; view: HexView }> {
  const out: Array<{ node: HexNode; view: HexView }> = [];
  for (const n of tab ? UPGRADE_MAPS[tab] : UPGRADE_MAP) {
    const view = hexView(state, n);
    if (view) out.push({ node: n, view });
  }
  return out;
}

const ROMAN: Array<[number, string]> = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n: number): string {
  let out = '';
  for (const [v, sym] of ROMAN) while (n >= v) (out += sym), (n -= v);
  return out;
}

/** "Luck III", or just the name for a one-off. */
export function nodeName(n: Pick<HexNode, 'id' | 'tier'>): string {
  const def = UPGRADES_BY_ID.get(n.id)!;
  return def.max > 1 ? `${def.name} ${roman(n.tier)}` : def.name;
}

/** The line's def for a hex. */
export function lineOf(n: Pick<HexNode, 'id'>): UpgradeDef {
  return UPGRADES_BY_ID.get(n.id)!;
}

/** The hex of a line's next tier (or its last, when maxed). */
export function nextHex(state: Pick<GameState, 'upgrades'>, id: UpgradeId): HexNode | undefined {
  const def = UPGRADES_BY_ID.get(id);
  if (!def) return undefined;
  return HEX_BY_KEY.get(nodeKey(id, Math.min(def.max, tier(state, id) + 1)));
}

// ------------------------------------------------------------------ what a line does, in words

/** A share as a percentage: 0.25 -> "25%", 0.0025 -> "0.25%", 0.015 -> "1.5%". */
export function pctText(v: number): string {
  const p = v * 100;
  const r = p >= 10 ? Math.round(p) : p >= 1 ? Math.round(p * 10) / 10 : Math.round(p * 100) / 100;
  return `${r}%`;
}

const times = (v: number) => `x${Math.round(v * 100) / 100}`;

/**
 * What a line adds up to with `level` tiers owned (everything else as it is), as the buy card shows it:
 * "+45% luck", "every 7 spins", "4.5% of hits are LUCKY". The card shows the tier before and after.
 */
export function effectAt(state: GameState, id: UpgradeId, level: number): string {
  const st = { ...state, upgrades: { ...state.upgrades, [id]: Math.max(0, level) } } as GameState;
  const fx = upgradeFx(st);
  const ch = chanceFx(st);
  const n = Math.max(0, level);
  switch (id) {
    case 'luck':
    case 'horseshoe':
      return `+${pctText(fx.luck)} luck`;
    case 'spinSpeed': {
      const base = spinCycle({ ...st, upgrades: { ...st.upgrades, spinSpeed: 0 } } as GameState);
      return `${pctText(base / spinCycle(st) - 1)} faster spins`;
    }
    case 'sands':
      return `${pctText(ch.sands)} of kills drop an Hourglass`;
    case 'luckySpin':
      return `a Lucky Spin every ${luckyEvery(st)} spins`;
    case 'luckyStreak':
      return `${times(luckyMult(st))} luck on Lucky Spins`;
    case 'goldenWheel':
    case 'goldenSpin':
      return `${pctText(fx.goldenChance)} Golden Spins`;
    case 'turbo':
      return `Hourglass spins ${times(BAL.roll.turboSpeedMult + fx.turboPower)} as fast`;
    case 'extraReel':
      return `${reelCount(st)} reel${reelCount(st) === 1 ? '' : 's'}`;
    case 'alchemy':
    case 'philosopher':
      return `${times(fx.mutationMult)} mutations`;
    case 'pity':
      return `Epic+ guaranteed after ${drySpell(st)} rolls`;
    case 'loadedDice':
      return `${times(skillRollLuck(st))} skill-roll luck`;
    case 'greed':
    case 'treasury':
      return `+${fx.goldPct}% gold`;
    case 'coinShower':
      return `${pctText(ch.coinShower)} of kills shower gold`;
    case 'jackpot':
      return `${pctText(ch.jackpot)} of kills win a Lucky Spin`;
    case 'potionTime':
      return `${BAL.luck.potionSeconds + fx.potionSeconds} s Luck Potions`;
    case 'offline':
      return `${Math.round((BAL.offline.efficiency + fx.offlineEff) * 100)}% while away`;
    case 'might':
    case 'excalibur':
      return `+${fx.atkPct}% squad damage`;
    case 'vitality':
    case 'dragonscale':
      return `+${fx.hpPct}% squad HP`;
    case 'swiftness':
      return `+${fx.speedPct}% speed`;
    case 'quickRoll':
      return `-${fx.rollSpinPct}% roll time`;
    case 'giantSlayer':
      return `+${pctText(ch.giantSlayer)} vs elites and bosses`;
    case 'lifesteal':
      return `${pctText(ch.lifesteal)} of damage heals`;
    case 'luckyStrike':
      return `${pctText(ch.luckyStrike)} of hits LUCKY (x${CHANCE.luckyStrike.mult})`;
    case 'doubleOrNothing':
      return `${pctText(ch.coinFlip)} of hits flip the coin`;
    case 'twoHeaded':
      return n > 0 ? 'the coin lands double 2 in 3' : 'the coin lands double 1 in 2';
    case 'ricochet':
      return `${pctText(ch.ricochet)} of arrows and bolts bounce`;
    case 'wildMagic':
      return `${pctText(ch.wildMagic)} of hits cast a spell`;
    case 'ladyLuck':
      return n > 0 ? 'every chance x1.25' : 'every chance x1';
    case 'secondWind':
      return `${pctText(ch.secondWind)} to cheat death`;
    case 'butterfingers':
      return `${pctText(ch.butterfingers)} of foes' hits fumbled`;
    case 'pratfall':
      return `${pctText(ch.pratfall)} a second a foe trips`;
  }
}
