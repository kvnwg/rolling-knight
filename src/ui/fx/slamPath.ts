/**
 * Where the spell slam's icon is on the screen through a slam (ui/SpellSlam.tsx; the beats are
 * world/slam.ts's): out of the reel, up over the knight growing, trembling there, slammed down, a
 * squash as it lands, then a rise and a dive into where the spell starts, shrinking to the world's own
 * pixel as it goes. It gets there a beat before the cast (slamArrive) and sits there flaring until the
 * spell goes off. Pure geometry in CSS px.
 */
import { SLAM_BEATS, slamBeat } from '../../world/slam';

export interface SlamPoints {
  /** The big reel's window, where the icon leaves from: its middle and its size. */
  from: { x: number; y: number; size: number };
  /** Where it hangs over the knight to be stamped, and its size there. */
  hang: { x: number; y: number; size: number };
  /** Where it lands (the spear's tip, the light over the Cleric...) and its size there. */
  to: { x: number; y: number; size: number };
  /** The screen's short side. */
  short: number;
}

export interface SlamPlace {
  x: number;
  y: number;
  size: number;
  /** A squash (x and y scale) as it's stamped. */
  sx: number;
  sy: number;
  /** Its glow's strength, the rays behind it (0 to 1), and whether afterimages trail it. */
  glow: number;
  rays: number;
  trail: boolean;
  /** Diving into its spot (it may turn to face the way it goes), and how far through the dive (0 to 1). */
  diving: boolean;
  dive: number;
  /** In its spot, waiting for the spell to go off: it flares there. */
  arrived: boolean;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The share of the dive spent rising first (the wind-up before it drops). */
export const DIVE_RISE = 0.18;
/** The squash's steps as the icon is stamped: [x, y] scales. */
const SQUASH: ReadonlyArray<readonly [number, number]> = [[1.22, 0.78], [1.08, 0.93], [0.94, 1.08], [1, 1]];
/** The stamped icon's size, a share of its hanging size. */
export const STAMPED = 0.92;

/**
 * The icon at share `u` of the slam (`t` its world seconds, for the tremble), for a tier `step` (4
 * Legendary, 5 the jackpot), getting to `to` at share `arrive` (world/slam.ts slamArrive) and staying
 * there, at `to`'s size, until the end.
 */
export function slamPlace(u: number, t: number, p: SlamPoints, step: number, arrive = 1): SlamPlace {
  const { from, hang, to, short } = p;
  const { beat, v } = slamBeat(u);
  const out: SlamPlace = { x: hang.x, y: hang.y, size: hang.size, sx: 1, sy: 1, glow: 1, rays: 0, trail: false, diving: false, dive: 0, arrived: false };
  switch (beat) {
    case 'pop': {
      const e = easeOut(v);
      return { ...out, x: from.x, y: from.y - e * from.size * 0.25, size: from.size * (1 + 0.4 * e), glow: e };
    }
    case 'fly': {
      const e = easeInOut(v);
      const sx = from.x;
      const sy = from.y - from.size * 0.25;
      const kx = (sx + hang.x) / 2 + (sx > hang.x ? 1 : -1) * short * 0.08;
      const ky = Math.min(sy, hang.y) - short * 0.1;
      return {
        ...out,
        x: (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * kx + e * e * hang.x,
        y: (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * ky + e * e * hang.y,
        size: from.size * 1.4 + (hang.size * 1.14 - from.size * 1.4) * easeIn(Math.min(1, v * 1.15)),
        rays: Math.max(0, (v - 0.6) / 0.4),
        trail: v > 0.05,
      };
    }
    case 'hover': {
      // Trembling harder the rarer it is, and the nearer the slam.
      const amp = (1 + step) * (0.4 + v);
      return { ...out, x: hang.x + Math.round(Math.sin(t * 97) * amp), y: hang.y + Math.round(Math.cos(t * 83) * amp * 0.6), size: hang.size * (1.14 + 0.05 * v), glow: 1 + v, rays: 1 };
    }
    case 'slam':
      return { ...out, size: hang.size * (1.19 - (1.19 - STAMPED) * easeIn(v)), glow: 2, rays: 1 };
    case 'hold': {
      const [qx, qy] = SQUASH[Math.min(SQUASH.length - 1, Math.floor(v * SQUASH.length * 1.6))];
      return { ...out, size: hang.size * STAMPED, sx: qx, sy: qy, glow: 2, rays: 1 - v };
    }
    default: {
      // Landed: in its spot at the world's pixel, flaring, until the spell goes off.
      if (u >= arrive) return { ...out, x: to.x, y: to.y, size: to.size, glow: 2, diving: true, dive: 1, arrived: true };
      // The dive: up a little first, then down into its spot, faster and faster, shrinking as it goes.
      const d = Math.min(1, (u - SLAM_BEATS.hold) / Math.max(1e-6, arrive - SLAM_BEATS.hold));
      const big = hang.size * STAMPED;
      if (d < DIVE_RISE) {
        const e = easeOut(d / DIVE_RISE);
        return { ...out, y: hang.y - e * short * 0.035, size: big * (1 + 0.05 * e), glow: 2, diving: true, dive: d };
      }
      const w = (d - DIVE_RISE) / (1 - DIVE_RISE);
      const k = w * w;
      const lift = short * 0.035 * (1 - easeOut(w));
      return {
        ...out,
        x: hang.x + (to.x - hang.x) * k,
        y: hang.y + (to.y - hang.y) * k - lift,
        size: big * 1.05 + (to.size - big * 1.05) * easeOut(w),
        glow: 2 - w,
        trail: w > 0.12,
        diving: true,
        dive: d,
      };
    }
  }
}

/** Is share `u` of the slam past the stamp (its name and its flash are up)? */
export function stamped(u: number): boolean {
  return u >= SLAM_BEATS.slam;
}

/**
 * Turns (quarters, clockwise) that point an icon drawn heading down and to the left (a comet: its
 * rock low on the left, its fire streaming up to the right) the way it dives, from (x0, y0) to (x1, y1)
 * on the screen: 0 down-left, 1 up-left, 2 up-right, 3 down-right.
 */
export function diveTurns(x0: number, y0: number, x1: number, y1: number): 0 | 1 | 2 | 3 {
  const right = x1 > x0;
  const down = y1 >= y0;
  return down ? (right ? 3 : 0) : right ? 2 : 1;
}

/**
 * A size snapped so each of an icon's `n` pixels is a whole number of device pixels (at `dpr`
 * device pixels a CSS pixel), never under one device pixel a pixel.
 */
export function wholePixels(size: number, n: number, dpr: number): number {
  return (Math.max(1, Math.round((size * dpr) / n)) * n) / dpr;
}
