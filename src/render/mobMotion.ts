/**
 * How a mob's whole body moves on top of whatever frame it shows, read from the sim every frame
 * (nothing here changes the sim). It's generic, so it works the same for PixelForge's sheets, the
 * game's own sprites and any monster art drawn later:
 *
 *   wind-up of a lunge   a crouch that deepens (squashed wider and shorter), shivering at the end; a
 *                        flash as it starts and a "!" over the head that blinks faster as it nears
 *   wind-up of a throw   rearing up (a little taller), the "!" too
 *   leap                 an arc: the body lifted off its shadow (which stays on the ground and shrinks),
 *                        stretched tall on the way up and down, afterimages behind
 *   dash                 stretched along the way it goes, afterimages and dust behind; a flyer's swoop
 *                        dips toward the ground mid-way
 *   landing / stopping   squashed flat for a beat, then springing back
 *
 * Squash and stretch are whole pixels of the body's size, about its feet; big bodies (ogres, bosses)
 * squash further.
 */
import type { Unit } from '../world/entities';

export interface MobMotion {
  /** Pixels the body is lifted off the ground (its shadow stays down); negative dips a flyer toward it. */
  lift: number;
  /** Whole pixels wider (+) or narrower (-), and taller (+) or shorter (-): squash and stretch about the feet. */
  wide: number;
  tall: number;
  /** A sideways shiver (whole px) as a wind-up comes to its end. */
  jitter: number;
  /** The ground shadow's size against standing (smaller the higher it flies). */
  shadow: number;
  /** Afterimages trail it (a dash, a leap in flight). */
  trail: boolean;
  /** The tell over its head: 0 none, else how bright this frame (it blinks faster as the move nears). */
  tell: number;
  /**
   * The red warning through any wind-up (a bite, a shot, a cast, a slam, a lunge, a throw, a boss's
   * move): this frame the body is drawn red (it pulses on and off, faster near the end)...
   */
  warn: boolean;
  /** ...and a crisp red outline holds round it the whole time (0 none, 1 on). */
  outline: number;
  /** How solid it's drawn (rising into a fight it fades in, in quarter steps). */
  fade: number;
}

export const STILL: Readonly<MobMotion> = { lift: 0, wide: 0, tall: 0, jitter: 0, shadow: 1, trail: false, tell: 0, warn: false, outline: 0, fade: 1 };

/** Seconds a foe takes to rise into a fight (world.ts SPAWN_IN). */
const RISE = 0.6;

/** The red warning for a wind-up `p` (0 to 1) of the way through: the body red a couple of frames on, a couple off. */
export function warnPulse(p: number, now: number): boolean {
  return Math.floor(now * (p > 0.7 ? 20 : 12)) % 2 === 0;
}

/** The big moves (a "!" over the head as they wind up; bosses' every move too), and the lunges (they crouch). */
const TOLD = new Set(['dash', 'charge', 'leap', 'throw', 'slam', 'bomb']);
const LUNGE = new Set(['dash', 'charge', 'leap']);

/** Is this motion the plain standing body (nothing to move, squash, lift or fade)? */
export function isStill(mo: MobMotion): boolean {
  return mo.lift === 0 && mo.wide === 0 && mo.tall === 0 && mo.jitter === 0 && mo.fade === 1;
}

/** The "!" over the head: steady for the first half of the wind-up, then blinking, faster at the end. */
function tellBlink(p: number, now: number): number {
  if (p < 0.5) return 1;
  const rate = p > 0.8 ? 16 : 8;
  return Math.floor(now * rate) % 2 ? 1 : 0.35;
}

export function mobMotion(m: Unit, now: number): MobMotion {
  const big = !!m.boss || (m.type?.size ?? 1) > 1.2;
  const amp = big ? 2 : 1;
  const rise = m.spawnT ?? 0;
  if (rise > 0) {
    // Rising into the fight: it grows up out of a squat, fading in.
    const k = Math.min(1, rise / RISE);
    return { ...STILL, wide: Math.round(2 * k), tall: -Math.round(5 * k * amp), fade: Math.max(0.25, Math.round((1 - k) * 4) / 4) };
  }
  const v = m.vault;
  if (v) {
    // A vault (a merchant over her counter): the same arc as a leap, without the afterimages.
    const p = Math.min(1, v.t / Math.max(0.01, v.dur));
    const lift = Math.round(v.height * 4 * p * (1 - p));
    return { ...STILL, lift, wide: p < 0.3 || p > 0.75 ? -1 : 0, tall: p < 0.3 || p > 0.75 ? amp : 0, shadow: Math.max(0.5, 1 - (lift / Math.max(1, v.height)) * 0.5) };
  }
  const r = m.rush;
  if (r) {
    const p = Math.min(1, r.t / Math.max(0.01, r.dur));
    if (r.kind === 'leap') {
      // A parabola: up fast, a hang at the top, down fast. Stretched tall leaving and coming down.
      const lift = Math.round(r.height * 4 * p * (1 - p));
      const s = p < 0.3 || p > 0.75 ? amp : 0;
      return { ...STILL, lift, wide: -Math.min(1, s), tall: s, shadow: Math.max(0.4, 1 - (lift / Math.max(1, r.height)) * 0.6), trail: true };
    }
    // A dash: stretched along its way (and a little thinner across); a flyer's swoop dips mid-way.
    const sideways = Math.abs(r.x1 - r.x0) >= Math.abs(r.y1 - r.y0);
    const dip = m.flying ? -Math.round(Math.sin(p * Math.PI) * 4) : 0;
    return { ...STILL, lift: dip, wide: sideways ? 2 * amp : -1, tall: sideways ? -1 : 2 * amp, trail: true };
  }
  const rec = m.recoverT ?? 0;
  if (rec > 0) {
    // Down: squashed flat for a beat, then springing back.
    const since = (m.recoverDur ?? rec) - rec;
    if (since < 0.08) return { ...STILL, wide: 2 * amp, tall: -2 * amp };
    if (since < 0.17) return { ...STILL, wide: amp, tall: -amp };
    return STILL;
  }
  const wind = m.windT ?? 0;
  if (wind > 0) {
    const p = 1 - wind / Math.max(0.01, m.windDur ?? wind);
    const warn = warnPulse(p, now);
    const tell = m.boss || (m.move && TOLD.has(m.move)) ? tellBlink(p, now) : 0;
    const deep = Math.min(1, p / 0.7);
    if (m.move === 'throw') return { ...STILL, tall: Math.round(deep * amp), tell, warn, outline: 1 };
    if (!m.move || !LUNGE.has(m.move)) return { ...STILL, tell, warn, outline: 1 };
    const crouch = Math.round(deep * 2 * amp);
    const jitter = p > 0.65 ? (Math.floor(now * 30) % 2 ? 1 : -1) : 0;
    return { ...STILL, wide: crouch, tall: -crouch, jitter, tell, warn, outline: 1 };
  }
  return STILL;
}

/**
 * Where a thrown boulder is `p` (0 to 1) of the way through its flight from (x0, y0), z0 up, to the
 * ground at (x1, y1): its spot on the ground and its height over it (a lob: it rises, then drops).
 */
export function boulderAt(x0: number, y0: number, z0: number, x1: number, y1: number, p: number): { x: number; y: number; z: number } {
  const q = Math.max(0, Math.min(1, p));
  const d = Math.hypot(x1 - x0, y1 - y0);
  const arc = 24 + d * 0.3;
  return { x: x0 + (x1 - x0) * q, y: y0 + (y1 - y0) * q, z: z0 * (1 - q) + arc * 4 * q * (1 - q) };
}
