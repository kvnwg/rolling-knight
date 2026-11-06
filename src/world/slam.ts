/**
 * A Legendary's slam (and the jackpot's), beat by beat. When a knight's skill roll stops on a skill
 * that slams (skills.ts SLAM_TIME), the next SLAM_TIME seconds play as one action on the world's
 * clock, the icon on the screen and the knight in the world moving together:
 *
 *   beat    the icon (ui/SpellSlam.tsx)                 the knight (render/pf/castPose.ts)
 *   pop     pops out of the HUD's spell reel            crouches: the wind-up
 *   fly     flies up over the knight, growing           springs up, weapon raised, a glow round it
 *   hover   hangs there, trembling                      hangs in the air, trembling with it
 *   slam    slams onto the screen: its name stamped     lands (the ground shakes under your own)
 *   hold    settles                                     holds the weapon high, its tip shining
 *   morph   shrinks and drops into where the spell      the icon goes into the spear's tip, the raised
 *           starts, lands there a beat before it casts  sword, the bow, the light over the Cleric, the
 *           and flares (Meteor Storm's hits as it does) clock over Aeon, or falls as the first meteor
 *
 * Meanwhile the world goes dark round the caster (render/castFx.ts), from the slam's start through the
 * first moments of the cast. Everything here is a share of the slam's length or seconds of world time,
 * so hit-stops and slow frames hold the icon, the pose and the dark alike.
 *
 * Pure numbers: no world, no DOM.
 */
import type { SkillId } from '../core/skillbook';

/** Where each beat ends, as a share of the slam (the morph runs from `hold` to the end, the cast). */
export const SLAM_BEATS = { pop: 0.08, fly: 0.4, hover: 0.52, slam: 0.58, hold: 0.7 } as const;

export type SlamBeat = keyof typeof SLAM_BEATS | 'morph';

const ORDER: ReadonlyArray<keyof typeof SLAM_BEATS> = ['pop', 'fly', 'hover', 'slam', 'hold'];

/** The beat at share `u` of a slam (0 to 1), and how far through that beat it is (0 to 1). */
export function slamBeat(u: number): { beat: SlamBeat; v: number } {
  const x = Math.max(0, Math.min(1, u));
  let from = 0;
  for (const b of ORDER) {
    const to = SLAM_BEATS[b];
    if (x < to) return { beat: b, v: (x - from) / (to - from) };
    from = to;
  }
  return { beat: 'morph', v: Math.min(1, (x - from) / (1 - from)) };
}

/**
 * The share of the slam at which its icon reaches where the spell starts: a beat before the cast, so
 * it's seen landing in the spear's tip (or the sword, the bow...) and flaring there before the spell
 * goes off; Meteor Storm's icon is the storm's first meteor and hits as the storm casts.
 */
export function slamArrive(skill: SkillId): number {
  return skill === 'meteorStorm' ? 1 : SLAM_ARRIVE;
}
export const SLAM_ARRIVE = 0.95;

/** Has a slam of length `dur` passed share `at` in the step from `t - dt` to `t` (world seconds)? */
export function crossed(t: number, dt: number, dur: number, at: number): boolean {
  const mark = at * dur;
  return t - dt < mark && t >= mark;
}

// ------------------------------------------------------------------ the dark round the caster

/** Seconds the dark takes to come and to go. */
export const SPOT_IN = 0.2;
export const SPOT_OUT = 0.2;
/** Seconds it stays after the cast (the spell's first moments), before it goes. */
export const SPOT_HOLD = 0.4;

const ease = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/**
 * How dark the world is round a caster (0 to 1): coming in over SPOT_IN from the slam's start, held
 * through the cast and SPOT_HOLD past it, gone SPOT_OUT later. `slam` is the slam under way (its time
 * and length), `sinceCast` the world seconds since its skill cast (null: none). Reduce motion: a short
 * dark, from the slam's stamp to the cast and gone straight after.
 */
export function spotLevel(slam: { t: number; dur: number } | null, sinceCast: number | null, calm = false): number {
  if (slam) {
    const from = calm ? SLAM_BEATS.slam * slam.dur : 0;
    return ease((slam.t - from) / SPOT_IN);
  }
  if (sinceCast === null || sinceCast < 0) return 0;
  const hold = calm ? 0 : SPOT_HOLD;
  return 1 - ease((sinceCast - hold) / SPOT_OUT);
}

/** How long after its cast a slam's dark is still there (s): past this a cast needs no looking at. */
export function spotTail(calm = false): number {
  return (calm ? 0 : SPOT_HOLD) + SPOT_OUT;
}
