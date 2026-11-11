/**
 * Traps: real hazards on the Dungeon's floors (and a few in the crypt), timed and telegraphed, that a
 * dodge roll carries you through (a rolling knight is untouchable) and that hurt mobs as well as
 * knights, so a foe can be led over them.
 *
 *   spikes   a tile of spikes: down (holes), the tips show (the warning), then up for most of a
 *            second. Laid in patches and across halls, staggered so a wave runs through them.
 *   vent     a fire vent: a spark and a small flame (the warning), then a column of fire that
 *            burns whoever stands over it, then embers.
 *   saw      a saw blade running to and fro along a slot in the floor, always out.
 *   plate    a pressure plate: step on it and it starts to turn over (the warning), its spiked side
 *            comes up and hurts whoever is still on it, then it turns back and rests.
 *
 * Every trap's cycle is a function of the floor's clock (a plate's from when it was stepped on), so
 * the sim and the renderer read the same moment from `trapPhase`. Knights lose a share of their HP
 * per hit; mobs a bigger share (bosses hardly any), flyers float over them. Placement runs with the
 * rest of the floor's dressing (decor.ts): on open floor, never by the start or the exit, and marked
 * occupied so props keep off them.
 */
import type { Rng } from '../core/rng';
import type { DecorCtx } from './decor';
import { dist, type Unit } from './entities';
import { FLOOR, TILE, tileAt, type FloorMap } from './mapgen';
import type { World } from './world';

export type TrapKind = 'spikes' | 'vent' | 'saw' | 'plate';

/** A trap as the floor's generator lays it. */
export interface TrapSpot {
  kind: TrapKind;
  /** World pixels: the middle of its tile (a saw: the middle of its slot). */
  x: number;
  y: number;
  /** Seconds added to the floor's clock for its cycle (staggers a row). */
  phase: number;
  /** A saw's slot: how far the blade runs each way from the middle (px). */
  reach?: number;
}

declare module './mapgen' {
  interface FloorMap {
    /** Traps on this floor (traps.ts). */
    traps?: TrapSpot[];
  }
}

/** A trap in play: its spot, when each unit was last hurt by it, and a plate's trigger. */
export interface Trap extends TrapSpot {
  hits: Map<number, number>;
  /** A plate: when it was stepped on (world time), or -1 at rest. */
  armedAt: number;
}

/** How long one cycle lasts (s), how often it can hurt the same unit, and the share of HP it takes. */
export const TRAP_SPEC: Readonly<Record<TrapKind, { period: number; every: number; hero: number; mob: number }>> = {
  spikes: { period: 3, every: 0.9, hero: 0.07, mob: 0.18 },
  vent: { period: 3.6, every: 0.3, hero: 0.035, mob: 0.09 },
  saw: { period: 2.6, every: 0.7, hero: 0.08, mob: 0.2 },
  plate: { period: 1.6, every: 1, hero: 0.09, mob: 0.22 },
};

/** A plate rests this long after turning back before it can be set off again. */
const PLATE_REST = 0.9;

/** What a trap is doing at a moment: the frame its art shows, whether it hurts, whether it warns. */
export interface TrapPhase {
  frame: number;
  active: boolean;
  warn: boolean;
  /** A saw: where the blade is along its slot (px from the middle). */
  offset?: number;
}

/**
 * The trap's state at world time `t`. Frames index the pack art: spikes 0 up, 1 half, 2 down, 3 the
 * tips; vent 0 off, 1 a spark, 2 to 6 the flame growing, 7 sparks, 8 embers; plate 0 flat, 1 to 3
 * turning over, 4 spikes up, 5 to 7 turning back; saw 0 to 5 the blade turning.
 */
export function trapPhase(tr: Pick<Trap, 'kind' | 'phase' | 'reach' | 'armedAt'>, t: number): TrapPhase {
  const spec = TRAP_SPEC[tr.kind];
  switch (tr.kind) {
    case 'spikes': {
      const u = (((t + tr.phase) % spec.period) + spec.period) % spec.period;
      if (u < 1.5) return { frame: 2, active: false, warn: false };
      if (u < 2.1) return { frame: 3, active: false, warn: true };
      if (u < 2.2) return { frame: 1, active: true, warn: false };
      if (u < 2.8) return { frame: 0, active: true, warn: false };
      return { frame: 1, active: true, warn: false };
    }
    case 'vent': {
      const u = (((t + tr.phase) % spec.period) + spec.period) % spec.period;
      if (u < 1.6) return { frame: 0, active: false, warn: false };
      if (u < 2) return { frame: 1, active: false, warn: true };
      if (u < 2.2) return { frame: 2, active: false, warn: true };
      if (u < 2.35) return { frame: 3, active: true, warn: false };
      if (u < 3.05) return { frame: [4, 5, 6, 5, 6, 6][Math.min(5, Math.floor((u - 2.35) / 0.12))], active: true, warn: false };
      if (u < 3.3) return { frame: 7, active: false, warn: false };
      return { frame: 8, active: false, warn: false };
    }
    case 'saw': {
      // To and fro along the slot, easing at the ends; the blade turns all the while.
      const u = (((t + tr.phase) % spec.period) + spec.period) % spec.period / spec.period;
      const s = Math.sin(u * Math.PI * 2);
      return { frame: Math.floor((t + tr.phase) * 16) % 6, active: true, warn: false, offset: Math.round(s * (tr.reach ?? 16)) };
    }
    case 'plate': {
      if (tr.armedAt < 0) return { frame: 0, active: false, warn: false };
      const u = t - tr.armedAt;
      if (u < 0.36) return { frame: 1 + Math.min(2, Math.floor(u / 0.12)), active: false, warn: true };
      if (u < 1.2) return { frame: 4, active: true, warn: false };
      if (u < 1.56) return { frame: 5 + Math.min(2, Math.floor((u - 1.2) / 0.12)), active: false, warn: false };
      return { frame: 0, active: false, warn: false };
    }
  }
}

/** The traps of a floor, ready to play. */
/**
 * The tiles a trap can hurt on (a saw's whole run, not just where it starts): nothing is put down on
 * these (a foe asleep on spikes is hurt awake, and its room with it, before the squad has moved; a
 * ware on a vent costs HP to buy).
 */
export function trapTiles(m: FloorMap): Set<number> {
  const out = new Set<number>();
  for (const t of m.traps ?? []) {
    const tx = Math.floor(t.x / TILE);
    const ty = Math.floor(t.y / TILE);
    const run = t.kind === 'saw' ? Math.ceil((t.reach ?? 16) / TILE) : 0;
    for (let d = -run; d <= run; d++) out.add(ty * m.w + tx + d);
  }
  return out;
}

export function makeTraps(m: FloorMap): Trap[] {
  return (m.traps ?? []).map((s) => ({ ...s, hits: new Map(), armedAt: -1 }));
}

/** Is a unit's foot on this trap's tile (or in a saw's or a vent's reach)? */
function touches(tr: Trap, u: Unit, ph: TrapPhase): boolean {
  if (tr.kind === 'saw') return dist(u.x, u.y, tr.x + (ph.offset ?? 0), tr.y) < 8 + u.r * 0.4;
  if (tr.kind === 'vent') return dist(u.x, u.y, tr.x, tr.y) < 9 + u.r * 0.3;
  return Math.abs(u.x - tr.x) < TILE / 2 + 1 && Math.abs(u.y - tr.y) < TILE / 2 + 1;
}

/** Moves every trap on and hurts what stands in an active one. Knights mid-roll pass untouched. */
export function updateTraps(w: World, traps: Trap[]): void {
  if (!traps.length) return;
  const units = [...w.heroes.filter((h) => !h.downed), ...w.mobs.filter((m) => !m.dead)];
  for (const tr of traps) {
    // A plate at rest is set off by anyone stepping on it (not flyers).
    if (tr.kind === 'plate' && (tr.armedAt < 0 || w.time - tr.armedAt > TRAP_SPEC.plate.period + PLATE_REST)) {
      tr.armedAt = -1;
      if (units.some((u) => !u.flying && touches(tr, u, { frame: 0, active: false, warn: false }))) tr.armedAt = w.time;
    }
    const ph = trapPhase(tr, w.time);
    if (!ph.active) continue;
    const spec = TRAP_SPEC[tr.kind];
    for (const u of units) {
      if (u.flying || u.dead || u.downed || u.rolling || u.invuln > 0) continue;
      if (!touches(tr, u, ph)) continue;
      const last = tr.hits.get(u.uid);
      if (last !== undefined && w.time - last < spec.every) continue;
      tr.hits.set(u.uid, w.time);
      const share = u.team === 'hero' ? spec.hero : u.boss ? 0.01 : spec.mob * (u.elite ? 0.5 : 1);
      const kx = u.x - (tr.x + (ph.offset ?? 0));
      const ky = u.y - tr.y;
      w.damage(u, u.maxHp * share, null, { knock: tr.kind === 'saw' ? 6 : 2, kx: kx || 1, ky, color: u.team === 'hero' ? '#ff7a5a' : '#ffb07a' });
      if (tr.kind === 'vent') w.fx.push({ kind: 'spark', x: u.x, y: u.y - 4, color: '#ff8a3a' });
    }
  }
}

// ------------------------------------------------------------------ placing them

/** How many traps a floor gets, and of what. */
export interface TrapPlan {
  kinds: Array<[TrapKind, number]>;
  /** Chance a room gets a set of traps. */
  rooms: number;
  /** Chance a straight stretch of hall gets a line across it. */
  halls: number;
}

export const DUNGEON_TRAPS: TrapPlan = { kinds: [['spikes', 4], ['vent', 3], ['saw', 2], ['plate', 2]], rooms: 0.8, halls: 0.5 };
export const CRYPT_TRAPS: TrapPlan = { kinds: [['spikes', 3], ['vent', 1], ['plate', 1]], rooms: 0.4, halls: 0.3 };

/** Lays a floor's traps (in its rooms and across its halls) and marks their tiles occupied. */
export function placeTraps(c: DecorCtx, plan: TrapPlan): void {
  const { m, rng } = c;
  const traps: TrapSpot[] = (m.traps ??= []);
  const W = m.w;
  const start = c.rooms.find((r) => r.kind === 'start');
  const ok = (x: number, y: number) => {
    const i = y * W + x;
    if (tileAt(m, x, y) !== FLOOR || c.occupied.has(i) || c.nearCenter(x, y)) return false;
    // Never in the start room (the squad arrives there) or right by its door.
    if (start && Math.abs(x - start.cx) <= start.rx + 2 && Math.abs(y - start.cy) <= start.ry + 2) return false;
    return true;
  };
  const take = (x: number, y: number) => c.occupied.add(y * W + x);
  const at = (kind: TrapKind, x: number, y: number, phase: number, reach?: number) =>
    traps.push({ kind, x: x * TILE + 8, y: y * TILE + 8, phase: Math.round(phase * 100) / 100, ...(reach ? { reach } : {}) });
  // --- the rooms: a set of one kind in each
  for (const r of c.rooms) {
    if (r.kind === 'start' || r.kind === 'arena' || !rng.chance(plan.rooms)) continue;
    const kind = rng.weighted(plan.kinds);
    for (let tries = 0; tries < 24; tries++) {
      if (layRoom(kind, r.cx + rng.int(-r.rx + 1, r.rx - 1), r.cy + rng.int(-r.ry + 1, r.ry - 1), rng, ok, take, at)) break;
    }
  }
  // --- the halls: a line across, here and there (the halls' middle line, away from the rooms)
  const lines: Array<[number, number, boolean]> = [];
  for (let y = 2; y < m.h - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (!m.route?.[i] || m.path[i] || c.rooms.some((r) => Math.abs(x - r.cx) <= r.rx + 1 && Math.abs(y - r.cy) <= r.ry + 1)) continue;
      // A hall running north-south has its walls either side; east-west, above and below.
      const ns = tileAt(m, x - 2, y) !== FLOOR && tileAt(m, x + 2, y) !== FLOOR && [-1, 0, 1].every((d) => ok(x + d, y));
      const ew = tileAt(m, x, y - 2) !== FLOOR && tileAt(m, x, y + 2) !== FLOOR && [-1, 0, 1].every((d) => ok(x, y + d));
      if (ns || ew) lines.push([x, y, ns]);
    }
  }
  rng.shuffle(lines);
  const used: Array<[number, number]> = [];
  const want = Math.round(lines.length / 9 * plan.halls);
  for (const [x, y, ns] of lines) {
    if (used.length >= want) break;
    if (used.some(([ux, uy]) => Math.abs(ux - x) + Math.abs(uy - y) < 10)) continue;
    if (![-1, 0, 1].every((d) => (ns ? ok(x + d, y) : ok(x, y + d)))) continue;
    used.push([x, y]);
    // Spikes across the hall, a wave running through them; now and then a plate in the middle.
    const plate = rng.chance(0.25);
    for (const d of [-1, 0, 1]) {
      const tx = ns ? x + d : x;
      const ty = ns ? y : y + d;
      if (plate && d !== 0) continue;
      at(plate ? 'plate' : 'spikes', tx, ty, (d + 1) * 0.3);
      take(tx, ty);
    }
  }
}

/** One room's set of traps of a kind around (x, y); false if it doesn't fit there. */
function layRoom(
  kind: TrapKind,
  x: number,
  y: number,
  rng: Rng,
  ok: (x: number, y: number) => boolean,
  take: (x: number, y: number) => void,
  at: (kind: TrapKind, x: number, y: number, phase: number, reach?: number) => void,
): boolean {
  const all = (cells: Array<[number, number]>) => cells.every(([cx, cy]) => ok(cx, cy));
  switch (kind) {
    case 'spikes': {
      // A patch, its columns a beat apart (a wave you can walk behind).
      const w = rng.int(2, 3);
      const h = rng.int(1, 2);
      const cells: Array<[number, number]> = [];
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push([x + dx, y + dy]);
      if (!all(cells)) return false;
      for (const [cx, cy] of cells) {
        at('spikes', cx, cy, (cx - x) * 0.35);
        take(cx, cy);
      }
      return true;
    }
    case 'vent': {
      // Two or three vents in a row, every other one firing half a cycle apart.
      const n = rng.int(2, 3);
      const cells: Array<[number, number]> = [];
      for (let k = 0; k < n; k++) cells.push([x + k * 2, y]);
      if (!all(cells) || !all(cells.map(([cx, cy]) => [cx, cy - 1] as [number, number]))) return false;
      cells.forEach(([cx, cy], k) => {
        at('vent', cx, cy, k % 2 ? 1.8 : 0);
        take(cx, cy);
      });
      return true;
    }
    case 'saw': {
      // A slot three tiles long, the blade running its length.
      const cells: Array<[number, number]> = [[x - 1, y], [x, y], [x + 1, y]];
      if (!all(cells) || !all([[x - 2, y], [x + 2, y]])) return false;
      at('saw', x, y, rng.next() * 2.6, 17);
      for (const [cx, cy] of cells) take(cx, cy);
      return true;
    }
    case 'plate': {
      // A plate or two in the way.
      const cells: Array<[number, number]> = rng.chance(0.5) ? [[x, y]] : [[x, y], [x + 2, y + rng.int(-1, 1)]];
      if (!all(cells)) return false;
      for (const [cx, cy] of cells) {
        at('plate', cx, cy, 0);
        take(cx, cy);
      }
      return true;
    }
  }
}
