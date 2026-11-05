/**
 * Aiming: where the knight you steer attacks. Twin-stick, as in Enter the Gungeon: it moves one way
 * and attacks another, and the blow or the shot goes exactly where it aims.
 *
 *   the mouse    a world point (World.input.aimX/aimY): the knight aims at it, from its hands
 *                (HOLD_Y above its feet), so a shot's path runs through the cursor
 *   a drag       touch: dragging from the Attack button like a right stick (aimDx/aimDy) aims that way
 *   neither      touch: auto-aim (autoTarget) at the best foe, locked on until it falls or leaves range
 *   Auto attack  not attacking yourself: the auto-aim picks a foe in reach and the knight attacks it
 *
 * Squadmates (and the dev bot) aim at their AI's target (aimAt). Nothing here rolls the sim's dice,
 * so aiming never changes how a seed plays out.
 */
import { dist, lineOfSight, norm, type Unit } from './entities';
import type { World } from './world';

/** How high above its feet a knight holds its weapon: its aim and its shots start from here. */
export const HOLD_Y = 8;
/** Where a unit's body is, above its feet (what shots hit: World's updateShots). */
export const BODY_Y = 6;

/** The way from knight h's hands to foe t's body (a unit vector; the knight's facing if they overlap). */
export function aimAt(h: Unit, t: Pick<Unit, 'x' | 'y'>): [number, number] {
  const [x, y] = norm(t.x - h.x, t.y - BODY_Y - (h.y - HOLD_Y));
  return x || y ? [x, y] : facingOf(h);
}

/** The way knight h faces (its last aim, else left or right). */
export function facingOf(h: Unit): [number, number] {
  const [x, y] = norm(h.aimX, h.aimY);
  return x || y ? [x, y] : [h.dir, 0];
}

/** The aim the controls give for knight h (the drag's direction, else toward the mouse), or null. */
export function inputAim(w: World, h: Unit): [number, number] | null {
  const i = w.input;
  if (i.aimDx != null && i.aimDy != null) {
    const [x, y] = norm(i.aimDx, i.aimDy);
    if (x || y) return [x, y];
  }
  if (i.aimX != null && i.aimY != null) {
    const [x, y] = norm(i.aimX - h.x, i.aimY - (h.y - HOLD_Y));
    if (x || y) return [x, y];
  }
  return null;
}

/** How far the auto-aim looks: a melee knight a stride past its reach, a ranged one a little past its range. */
export function autoRange(h: Unit): number {
  const melee = h.cls === 'guardian' || h.cls === 'blade' || h.cls === 'lancer';
  return melee ? (h.range ?? 20) + 44 : (h.range ?? 100) * 1.15;
}

/** Foes within this angle of where the knight is moving count as ahead of it. */
export const AHEAD = (38 * Math.PI) / 180;
/** A locked foe is kept while it's within this many times the auto-aim's range. */
export const KEEP = 1.25;

function inSight(w: World, h: Unit, e: Unit): boolean {
  return lineOfSight(w.map, h.x, h.y - 4, e.x, e.y - 4);
}

/**
 * The foe the auto-aim picks for knight h, moving along (mx, my), within `range` of its edge (the
 * touch auto-aim's reach, or Auto attack's: what the knight's attack reaches): the one it's locked
 * on, while that one stands, in sight and in range; else the nearest in a cone ahead of where it's
 * moving; else the nearest in range and in sight. It locks on (h.aimLock) to what it picks; null for none.
 */
export function autoTarget(w: World, h: Unit, mx: number, my: number, range = autoRange(h)): Unit | null {
  if (h.aimLock != null) {
    const lock = w.mobs.find((m) => m.uid === h.aimLock && !m.dead);
    if (lock && dist(lock.x, lock.y, h.x, h.y) - lock.r <= range * KEEP && inSight(w, h, lock)) return lock;
  }
  const [nx, ny] = norm(mx, my);
  const moving = nx !== 0 || ny !== 0;
  const cone = Math.cos(AHEAD);
  let ahead: Unit | null = null;
  let aheadD = Infinity;
  let near: Unit | null = null;
  let nearD = Infinity;
  for (const e of w.mobs) {
    if (e.dead) continue;
    const d = dist(e.x, e.y, h.x, h.y) - e.r;
    if (d > range || !inSight(w, h, e)) continue;
    if (d < nearD) {
      nearD = d;
      near = e;
    }
    if (moving && d < aheadD) {
      const [ex, ey] = norm(e.x - h.x, e.y - h.y);
      if (ex * nx + ey * ny >= cone) {
        aheadD = d;
        ahead = e;
      }
    }
  }
  const pick = ahead ?? near;
  h.aimLock = pick ? pick.uid : null;
  return pick;
}

/**
 * The aim of the knight you steer this tick, moving along (mx, my): the controls' aim, else the
 * auto-aim's foe, else the way it's going, else the way it faces.
 */
export function steerAim(w: World, h: Unit, mx: number, my: number): [number, number] {
  const a = inputAim(w, h);
  if (a) {
    h.aimLock = null;
    return a;
  }
  const t = autoTarget(w, h, mx, my);
  if (t) return aimAt(h, t);
  const [x, y] = norm(mx, my);
  return x || y ? [x, y] : facingOf(h);
}
