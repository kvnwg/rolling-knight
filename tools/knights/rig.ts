/**
 * The knights' rig: what a frame's pose says (where the body, head, hands and weapon are, how the legs
 * stand, how the loose parts lag), and the helpers every class draws with: limbs from shoulder to
 * hand, the ground shadow, mirroring east into west, and the anchors the game hangs capes, halos and
 * stun stars from.
 *
 * Coordinates are the 48 x 48 cell's, the pivot (feet, centered) at (23, 40). Light comes from the
 * top left. Facing: s (toward the viewer), e (right), n (away); w is e mirrored around x = 23.
 */
import { type Cell, type Mat, type Piece } from './lib/raster';

export const CELL = 48;
export const PX = 23;
export const PY = 40;

export type Dir3 = 's' | 'e' | 'n';
export type Dir4 = Dir3 | 'w';

export type Face = 'open' | 'blink' | 'shut' | 'hurt' | 'ko' | 'stun' | 'joy' | 'focus';

/** A frame's pose. Offsets are whole pixels; +y is down. */
export interface Pose {
  /** Leg pose name (the class's leg set draws it). */
  legs: string;
  /** Upper body offset from rest (torso, head, arms follow). */
  bx: number;
  by: number;
  /** Head offset on top of the body's. */
  hx: number;
  hy: number;
  /** Weapon pose name (the class decides where the hand goes and what it holds). */
  wpn: string;
  /** Off hand pose name (shield, book, buckler, a free hand). */
  off: string;
  /**
   * Loose parts (crest, plume, scarf, pennant, hat tip, cape): how far they trail the body this frame
   * [dx, dy] (one frame behind), and a flutter phase for cloth in the wind (0 rest, 1..3 flutter).
   */
  lag: [number, number];
  flutter: number;
  face: Face;
  /** Everything moved by this (a jump, a knockback). */
  whole: [number, number];
  /** Quarter turns clockwise (rolls, lying down), around the body's middle. */
  rot: number;
  /** Ground shadow size (1 standing, smaller in the air). */
  shadow: number;
  /** A drawn smear (the class knows its shapes), or ''. */
  smear: string;
  /** Free-form extras a class reads (a crouch, a glow pulse...). */
  tag: string;
}

export const REST: Pose = { legs: 'stand', bx: 0, by: 0, hx: 0, hy: 0, wpn: 'rest', off: 'rest', lag: [0, 0], flutter: 0, face: 'open', whole: [0, 0], rot: 0, shadow: 1, smear: '', tag: '' };

export function pose(p: Partial<Pose>): Pose {
  return { ...REST, ...p };
}

/** What a class draws for a frame: the body (and its held things), and a cape layer when worn. */
export interface Drawn {
  pieces: Piece[];
  /** The rarity cape (Epic and up): drawn behind the body, or over it facing north. */
  cape?: { pieces: Piece[]; front: boolean };
  /** Chin, back and hip anchors, and the head's top middle (halo, stun stars). */
  chin: [number, number];
  back: [number, number];
  hip: [number, number];
  head: [number, number];
}

export interface Kit {
  name: string;
  draw(dir: Dir3, p: Pose): Drawn;
}

// ------------------------------------------------------------------ limbs

const sgn = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);

/**
 * A limb from (x0, y0) to (x1, y1), `thick` pixels across, shaded as a lit tube: the side facing the
 * top left in `lit`, the other side in `dark`, the middle in `mid`. Steps are 4-connected so the
 * limb never breaks at 1x.
 */
export function limb(x0: number, y0: number, x1: number, y1: number, mat: Mat, thick = 2, mid = 3, lit = 4, dark = 2): Cell[] {
  const pts: Array<[number, number]> = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = sgn(x1 - x0);
  const sy = sgn(y1 - y0);
  let err = dx + dy;
  pts.push([x, y]);
  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 >= dy && x !== x1) {
      err += dy;
      x += sx;
      pts.push([x, y]);
    }
    if (e2 <= dx && y !== y1) {
      err += dx;
      y += sy;
      pts.push([x, y]);
    }
  }
  const out = new Map<string, Cell>();
  const vertical = Math.abs(y1 - y0) >= Math.abs(x1 - x0);
  for (const [px, py] of pts) {
    for (let t = 0; t < thick; t++) {
      // Thickness goes across the limb: sideways for a mostly vertical limb, down for a horizontal one.
      const cx = vertical ? px + t : px;
      const cy = vertical ? py : py + t;
      const shade = thick === 1 ? mid : t === 0 ? lit : t === thick - 1 ? dark : mid;
      out.set(`${cx},${cy}`, [cx, cy, mat, shade]);
    }
  }
  return [...out.values()];
}

/** Cells moved by (dx, dy). */
export function moved(cells: readonly Cell[], dx: number, dy: number): Cell[] {
  return cells.map(([x, y, m, s]) => [x + dx, y + dy, m, s] as const);
}

/** Cells mirrored around x = PX (for drawing a left side from a right side). */
export function flipped(cells: readonly Cell[]): Cell[] {
  return cells.map(([x, y, m, s]) => [2 * PX - x, y, m, s] as const);
}

/** Recolors the eyes for a face state: closed eyes become a line of the surrounding skin's shadow. */
export function faceCells(eyes: ReadonlyArray<readonly [number, number, number]>, face: Face, skin: Mat = 'skin'): Cell[] {
  // eyes: [x, y, shade] of the open eye pixels (shade 1 pupil, 2 iris, 5 glint).
  const cells: Cell[] = [];
  if (face === 'open' || face === 'focus') {
    for (const [x, y, s] of eyes) cells.push([x, y, 'eyes', s]);
    return cells;
  }
  const rows = new Map<number, number[]>();
  for (const [x, y] of eyes) rows.set(y, [...(rows.get(y) ?? []), x]);
  const bottom = Math.max(...eyes.map(([, y]) => y));
  for (const [x, y] of eyes) {
    if (face === 'blink' || face === 'shut' || face === 'ko' || face === 'stun') cells.push([x, y, skin, y === bottom ? 1 : 3]);
    else if (face === 'joy') cells.push([x, y, skin, y === bottom - 1 ? 1 : 3]);
    else cells.push([x, y, skin, y === bottom ? 1 : 3]);
  }
  return cells;
}

// ------------------------------------------------------------------ held things

/** The points of a line from (x0, y0) to (x1, y1), 8-connected (a thin shaft). */
export function linePts(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = sgn(x1 - x0);
  const sy = sgn(y1 - y0);
  let err = dx + dy;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

/** A 1 px shaft from (x0, y0) to (x1, y1), its shade per point given by `shade(i, n)`. */
export function stick(x0: number, y0: number, x1: number, y1: number, mat: Mat, shade: (i: number, n: number) => number = () => 3): Cell[] {
  const pts = linePts(x0, y0, x1, y1);
  return pts.map(([x, y], i) => [x, y, mat, shade(i, pts.length)] as const);
}
