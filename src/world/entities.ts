/** Units, shots, ground effects and the bits of geometry they share. */
import type { ClassId } from '../core/knights';
import type { Rarity } from '../core/rarity';
import type { SkillId } from '../core/skillbook';
import type { MutationId } from '../core/state';
import { BLOCKED, FLOOR, LIQUID, TILE, tileAt, type FloorMap } from './mapgen';
import type { MobType, Volley } from './mobgen';

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
  /** A skill roll's spin, as a share of ROLL_TIME (Quick Roll shortens it; 1 when left out). */
  rollTimeMult?: number;
  /** Tag Team: seconds left hitting harder after being switched to. */
  tagBoostT?: number;
  /** An active dodge: direction, time left, speed. */
  rolling?: { dx: number; dy: number; t: number; dur: number; speed: number; kind: 'roll' | 'blink' | 'vault' | 'flip'; hit: Set<number> };
  /**
   * The last dodge roll (skills.ts heroDodge): the world time its untouchable window ends, and whether
   * something has already missed the knight because of it (a perfect roll is marked once per roll).
   */
  dodge?: { until: number; perfect: boolean };
  /**
   * An active skill that takes a moment (Whirlwind, a lunge). `dmg` (× attack), `r`, `speed` and
   * `knock` are the skill's own numbers (Whirlwind's and Dragon Lunge's when left out).
   */
  channel?: { kind: 'whirlwind' | 'lunge' | 'taunt'; t: number; dur: number; tick: number; dx: number; dy: number; hit: Set<number>; dmg?: number; r?: number; speed?: number; knock?: number; every?: number };
  downed?: boolean;
  // --- skill rolls (src/world/skills.ts; the skills themselves: src/core/skillbook.ts)
  /**
   * A skill roll spinning: the skill it lands on (decided as it starts, like the altar), seconds in,
   * its length, a free roll (Tag Team: no cooldown after), the luck it rolled at and a seed for the
   * HUD's reel. It lands, and the skill fires, when t reaches dur.
   */
  skillRoll?: { skill: SkillId; t: number; dur: number; free: boolean; luck: number; seed: number };
  /**
   * A roll that just landed, its skill on the way to the middle of the screen: it casts as it slams
   * down (`t` reaches `dur`, longer for rarer skills: SLAM_TIME in skills.ts).
   */
  skillSlam?: { skill: SkillId; t: number; dur: number; free: boolean; luck: number };
  /** The last skill a roll landed on: which, the world time it landed, a count of landings (the HUD's cue). */
  lastSkill?: { skill: SkillId; at: number; n: number; free: boolean };
  /** The next roll lands on this skill (tests and dev tools: rigSkill in skills.ts). */
  skillRig?: SkillId;
  /** A skill's boost: attack speed and move speed multipliers, seconds left of `dur`, its color. */
  skillBuff?: { t: number; dur: number; atkSpd: number; moveSpd: number; color: string };
  /** Beats of a skill still to come (a second slash, aftershocks, a landing): seconds until each. */
  skillQueue?: Array<{ t: number; run: () => void }>;
  /** AI memory. */
  ai?: {
    target: number | null;
    think: number;
    dodgeThink: number;
    wanderX: number;
    wanderY: number;
    stuck: number;
    /** Heroes: the target's HP when last seen, and how long it hasn't dropped (a shot that can't land). */
    lastHp?: number;
    noHitT?: number;
    /** Heroes: seconds the skill roll has been ready in this fight without a good moment to roll. */
    rollWait?: number;
    /** Heroes: where it was at the last progress check, the next check, and seconds left on a detour. */
    lastX?: number;
    lastY?: number;
    checkT?: number;
    detourT?: number;
    /** Mobs: whether a body its size can walk straight to its target (checked every `think` seconds). */
    direct?: boolean;
  };
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
  /** A dash's (or a charge's) heading, or a shot's target point. */
  moveX?: number;
  moveY?: number;
  /** Where a leap will land or a throw will come down (it follows the target until halfway through the wind-up, then holds). */
  spotX?: number;
  spotY?: number;
  /** A dash or a leap in flight (ai.ts); then `recoverT` seconds (of `recoverDur`) standing spent. */
  rush?: Rush;
  recoverT?: number;
  recoverDur?: number;
  /** Seconds until it can lunge (dash or leap) again, and throw again. */
  lungeT?: number;
  throwT?: number;
  /** Seconds it has been after its target without getting there (an ogre that can't reach throws). */
  chaseT?: number;
  /** Volleys loosed (an archer fans every third one out), the one it's winding up, seconds until its gun is ready again, and a burst still firing. */
  volley?: number;
  gunKind?: Volley;
  gunT?: number;
  burst?: { n: number; t: number; tx: number; ty: number };
  tauntBy?: number | null;
  tauntT?: number;
  bossT?: number;
  bossPhase?: number;
  spawnT?: number;
}

/**
 * A mob's dash or leap in flight: which move it is ('dash', 'charge', 'leap'), the lunge's look
 * (mobgen's LungeName, or 'boss'), where it left from and where it's headed, seconds in and its length,
 * a leap's height, its hit (x attack), knockback and reach (a dash's contact past the body, a leap's
 * landing ring), whether it runs on through whoever it hits, the seconds it stands spent after, a big
 * one (it shakes the ground), and who it has already hit (or missed).
 */
export interface Rush {
  kind: 'dash' | 'leap';
  move: string;
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  height: number;
  dmg: number;
  knock: number;
  r: number;
  through: boolean;
  recover: number;
  big: boolean;
  hit: Set<number>;
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
  /** A foe's bullet that bends as it flies (radians a second; a 'curve' volley). */
  curve?: number;
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
  /** ('boulder': an ogre's thrown rock coming down; 'rubble': what's left of it, for show.) */
  kind: 'meteor' | 'fire' | 'rain' | 'slam' | 'blast' | 'sanctuary' | 'glow' | 'bomb' | 'poison' | 'boulder' | 'rubble';
  from: number;
  color: string;
  done?: boolean;
  t: number;
  /** A thrown boulder: where it left the thrower's hands (and how high above the ground), and its whole flight (s). */
  x0?: number;
  y0?: number;
  z0?: number;
  flight?: number;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  big: boolean;
  /** Drawn its own way: 'perfect' pops in gold over a knight that rolled through a hit. */
  style?: 'perfect';
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
  /** ('land': a dash or a leap coming down, a ring of dust; 'perfect': a knight rolled through a hit.) */
  kind: 'hit' | 'crit' | 'death' | 'heal' | 'dust' | 'blast' | 'spark' | 'levelup' | 'portal' | 'shock' | 'revive' | 'coin' | 'land' | 'perfect';
  x: number;
  y: number;
  color?: string;
  size?: number;
  dir?: number;
  /** What made it, so the renderer can pick the right effect (a slime pops, a knight falls, a slam shakes the ground). */
  src?: 'slime' | 'hero' | 'boss' | 'slam' | 'bomb' | 'meteor' | 'taunt' | 'boulder';
  /** The unit it belongs to (a perfect roll's knight). */
  uid?: number;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** Rings on the ground are drawn r wide and this share of r tall (the 3/4 view). */
export const RING_Y = 0.6;

/**
 * Is a body of radius `br` standing at (x, y) inside a ring of radius `r` round (cx, cy), as the ring
 * is drawn on the ground? (What a landing or a boulder hits: what you see is what you get.)
 */
export function inRing(x: number, y: number, br: number, cx: number, cy: number, r: number): boolean {
  const dx = (x - cx) / (r + br);
  const dy = (y - cy) / (r * RING_Y + br);
  return dx * dx + dy * dy <= 1;
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

/**
 * Can a body of radius `r` walk straight from a to b? Unlike sight, anything it can't stand on blocks
 * it: walls, props such as tree trunks, water (for walkers). Checked every 3 px along the way.
 */
export function walkClear(m: FloorMap, ax: number, ay: number, bx: number, by: number, r: number, flying = false): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / 3);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!clear(m, ax + (bx - ax) * t, ay + (by - ay) * t, r, flying)) return false;
  }
  return true;
}

/**
 * Walls between two points? (Water and props don't block sight.) Walks every tile the line crosses
 * (not samples along it), so a line that clips a wall's corner is blocked, just as a shot would be.
 * The tiles the line starts and ends in don't count.
 */
export function lineOfSight(m: FloorMap, ax: number, ay: number, bx: number, by: number): boolean {
  let tx = Math.floor(ax / TILE);
  let ty = Math.floor(ay / TILE);
  const ex = Math.floor(bx / TILE);
  const ey = Math.floor(by / TILE);
  const dx = bx - ax;
  const dy = by - ay;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const dX = dx !== 0 ? TILE / Math.abs(dx) : Infinity;
  const dY = dy !== 0 ? TILE / Math.abs(dy) : Infinity;
  let maxX = dx !== 0 ? (stepX > 0 ? (tx + 1) * TILE - ax : ax - tx * TILE) / Math.abs(dx) : Infinity;
  let maxY = dy !== 0 ? (stepY > 0 ? (ty + 1) * TILE - ay : ay - ty * TILE) / Math.abs(dy) : Infinity;
  for (let i = 0; i < 512 && (tx !== ex || ty !== ey); i++) {
    if (maxX < maxY) {
      if (maxX > 1) break;
      maxX += dX;
      tx += stepX;
    } else {
      if (maxY > 1) break;
      maxY += dY;
      ty += stepY;
    }
    if ((tx !== ex || ty !== ey) && tileAt(m, tx, ty) === 0) return false;
  }
  return true;
}
