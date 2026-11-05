/**
 * How the fight feels, Enter the Gungeon's way: short freezes on the blows that matter (hit-stop),
 * knockback that slides a foe back along the hit instead of popping it, and what happens when the
 * knight you steer is hit: the moment freezes, the screen shakes, and the knight blinks, untouchable,
 * for GRACE seconds (the renderer flashes the screen red as it starts).
 *
 * It's all the sim's, on the world's own clock (World.hitStop slows the whole world, every system
 * alike): the same seed and inputs play out the same, frame for frame, whatever draws them. Squadmates
 * (and the dev bot) get the knockback, but the freezes and the grace are for the knight you steer.
 *
 * Hooks: feelHit from World.damage (each hit landed), tickFeel from World.update (each frame).
 */
import { tickSnares } from './dash';
import { moveUnit, norm, type Unit } from './entities';
import type { World } from './world';

/** Seconds the knight you steer stays untouchable (and blinks) after it's hit. */
export const GRACE = 0.8;
/** The freeze when the knight you steer is hit. */
export const HURT_STOP = 0.06;
/** The freeze when its shot lands a crit. */
export const CRIT_STOP = 0.045;
/** A knockback slide eases off over about this long (s): most of it in the first few frames. */
const SLIDE = 0.055;
/** Freezes this close together (world s) don't stack up into a stutter. */
const STOP_GAP = 0.12;

const lastStop = new WeakMap<World, number>();

/** Is this knight the one you steer (Auto attack or not; not the dev bot playing it)? */
export function steered(w: World, h: Unit): boolean {
  return h.team === 'hero' && h.slot === w.controlled && !w.bot;
}

/**
 * Freezes the fight for `s` seconds (the longest asked for wins). A small one right after another is
 * skipped, unless `force`d (the knight you steer being hit always freezes).
 */
export function hitStop(w: World, s: number, force = false): void {
  const last = lastStop.get(w);
  if (!force && w.hitStop <= 0 && last !== undefined && w.time - last < STOP_GAP) return;
  if (s > w.hitStop) w.hitStop = s;
  lastStop.set(w, w.time);
}

/**
 * Knocks a unit `d` px along (kx, ky), as a slide that eases off (a boss doesn't budge, an elite
 * half as far). Adds to a slide already going.
 */
export function shove(u: Unit, kx: number, ky: number, d: number): void {
  if (u.boss || d <= 0) return;
  const [nx, ny] = norm(kx, ky);
  if (!nx && !ny) return;
  const v = (d * (u.elite ? 0.5 : 1)) / SLIDE;
  const s = (u.shove ??= { vx: 0, vy: 0 });
  s.vx += nx * v;
  s.vy += ny * v;
}

/**
 * A hit just landed on `target` (World.damage, after the HP came off). The knight you steer: a
 * freeze, a shake, and its grace. Its crits: a short freeze.
 */
export function feelHit(w: World, target: Unit, from: Unit | null, opts: { crit?: boolean }): void {
  if (target.team === 'hero') {
    if (!steered(w, target) || target.downed) return;
    target.graceT = GRACE;
    target.invuln = Math.max(target.invuln, GRACE);
    hitStop(w, HURT_STOP, true);
    w.shakeIt(3, 0.16);
    return;
  }
  if (opts.crit && from && steered(w, from)) hitStop(w, CRIT_STOP);
}

/** Every frame: slides play out, the grace runs down, the Rangers' snares wait for a foe (dash.ts). */
export function tickFeel(w: World, dt: number): void {
  tickSnares(w);
  for (const list of [w.heroes, w.mobs]) {
    for (const u of list) {
      if (u.graceT !== undefined && u.graceT > 0) u.graceT = Math.max(0, u.graceT - dt);
      const s = u.shove;
      if (!s) continue;
      if (u.dead || u.downed || u.rolling) {
        u.shove = undefined;
        continue;
      }
      moveUnit(w.map, u, s.vx * dt, s.vy * dt);
      const k = Math.exp(-dt / SLIDE);
      s.vx *= k;
      s.vy *= k;
      if (Math.hypot(s.vx, s.vy) < 6) u.shove = undefined;
    }
  }
}
