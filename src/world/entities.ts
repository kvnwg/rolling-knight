/** Units, shots, ground effects and the bits of geometry they share. */
import type { ClassId } from '../core/knights';
import type { Rarity } from '../core/rarity';
import type { MutationId } from '../core/state';
import { BLOCKED, FLOOR, LIQUID, TILE, tileAt, type FloorMap } from './mapgen';
import type { MobType } from './mobgen';

export type Team = 'hero' | 'mob';
export type View = 'down' | 'up' | 'side';

export interface Unit {
  uid: number;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  atk: number;
  armor: number;
  speed: number;
  /** Facing: -1 left, 1 right; and which way the body is drawn. */
  dir: 1 | -1;
  view: View;
  moving: boolean;
  /** Seconds into the current animation. */
  animT: number;
  /** Seconds left on the attack pose (weapon swing, bow draw). */
  swingT: number;
  swingDur: number;
  aimX: number;
  aimY: number;
  hurtT: number;
  /** Seconds left untouchable. */
  invuln: number;
  /** Damage taken is multiplied by this while drTimer > 0. */
  dr: number;
  drT: number;
  stunT: number;
  slowT: number;
  burnT: number;
  burnDps: number;
  dead: boolean;
  flying: boolean;
  // --- heroes
  knightId?: string;
  cls?: ClassId;
  rarity?: Rarity;
  mutation?: MutationId | null;
  slot?: number;
  atkCd?: number;
  atkT?: number;
  range?: number;
  dodgeCd?: number;
  dodgeT?: number;
  specialCd?: number;
  specialT?: number;
  /** An active dodge: direction, time left, speed. */
  rolling?: { dx: number; dy: number; t: number; dur: number; speed: number; kind: 'roll' | 'blink' | 'vault' | 'flip'; hit: Set<number> };
  /** An active special (Whirlwind, Dragon Lunge, Taunt). */
  channel?: { kind: 'whirlwind' | 'lunge' | 'taunt'; t: number; dur: number; tick: number; dx: number; dy: number; hit: Set<number> };
  downed?: boolean;
  /** AI memory. */
  ai?: { target: number | null; think: number; dodgeThink: number; wanderX: number; wanderY: number; stuck: number };
  // --- mobs
  type?: MobType;
  elite?: boolean;
  boss?: boolean;
  awake?: boolean;
  room?: number;
  /** Mob attack state: winding up (telegraph), then the move. */
  windT?: number;
  windDur?: number;
  move?: string;
  moveX?: number;
  moveY?: number;
  chargeT?: number;
  tauntBy?: number | null;
  tauntT?: number;
  bossT?: number;
  bossPhase?: number;
  spawnT?: number;
}

export interface Shot {
  uid: number;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  kind: 'arrow' | 'orb' | 'bolt' | 'bullet' | 'spear' | 'fire';
  color: string;
  homing?: number;
  splash?: number;
  pierce?: number;
  heal?: number;
  from: number;
  hit?: Set<number>;
}

export interface Area {
  uid: number;
  team: Team;
  x: number;
  y: number;
  r: number;
  /** Seconds until it goes off (the telegraph); then it lasts `dur`, ticking every `tick`. */
  delay: number;
  dur: number;
  tick: number;
  tickT: number;
  dmg: number;
  heal?: number;
  kind: 'meteor' | 'fire' | 'rain' | 'slam' | 'blast' | 'sanctuary' | 'glow' | 'bomb' | 'poison';
  from: number;
  color: string;
  done?: boolean;
  t: number;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  big: boolean;
}

export interface Pickup {
  uid: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  kind: 'gold' | 'potion' | 'hourglass';
  amount: number;
  t: number;
  taken: boolean;
}

/** Things the renderer should burst into particles (hits, deaths, spells). */
export interface Fx {
  kind: 'hit' | 'crit' | 'death' | 'heal' | 'dust' | 'blast' | 'spark' | 'levelup' | 'portal' | 'shock' | 'revive' | 'coin';
  x: number;
  y: number;
  color?: string;
  size?: number;
  dir?: number;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function norm(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y);
  return l > 1e-6 ? [x / l, y / l] : [0, 0];
}

/** Can a unit stand here? (Flyers cross water and lava, not walls or props.) */
export function passable(m: FloorMap, x: number, y: number, flying: boolean): boolean {
  const t = tileAt(m, Math.floor(x / TILE), Math.floor(y / TILE));
  return t === FLOOR || (flying && t === LIQUID) || (flying && t === BLOCKED);
}

function clear(m: FloorMap, x: number, y: number, r: number, flying: boolean): boolean {
  // The body is a box r wide each side and r/2 deep: feet, not the head, bump walls (3/4 view).
  const ry = r * 0.6;
  return passable(m, x - r, y - ry, flying) && passable(m, x + r, y - ry, flying) && passable(m, x - r, y + ry, flying) && passable(m, x + r, y + ry, flying);
}

/** Moves a unit by (dx, dy), sliding along walls. Returns true if it moved at all. */
export function moveUnit(m: FloorMap, u: Pick<Unit, 'x' | 'y' | 'r' | 'flying'>, dx: number, dy: number): boolean {
  let moved = false;
  if (dx !== 0 && clear(m, u.x + dx, u.y, u.r, u.flying)) {
    u.x += dx;
    moved = true;
  }
  if (dy !== 0 && clear(m, u.x, u.y + dy, u.r, u.flying)) {
    u.y += dy;
    moved = true;
  }
  return moved;
}

/** Walls between two points? (Water and props don't block sight.) */
export function lineOfSight(m: FloorMap, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(d / 6);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    if (tileAt(m, Math.floor(x / TILE), Math.floor(y / TILE)) === 0) return false;
  }
  return true;
}
