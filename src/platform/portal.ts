/**
 * The portal the game is published on, if any: one object the game asks about loading, play, ads,
 * saves, sound and the device. Today that is CrazyGames (platform/crazygames.ts); in any other build
 * nothing answers and every call is a no-op, so the game never needs to ask where it is.
 */
import { CrazyGames } from './crazygames';

export type { AdOutcome } from './crazygames';

export const portal = new CrazyGames();

let touch: boolean | null = null;

/**
 * Whether to draw the touch controls and leave out the keyboard hints. A portal knows the device
 * (a laptop with a touchscreen is still a desktop: CrazyGames asks games not to go by touch support);
 * with no portal it's the browser's touch support, as before. Asked at render time, after the
 * portal has started, and the answer kept.
 */
export function touchUi(): boolean {
  if (touch !== null) return touch;
  const device = portal.device;
  if (device) touch = device !== 'desktop';
  else touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  return touch;
}
