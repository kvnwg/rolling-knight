/**
 * A knight's power-up while its Legendary (or the jackpot) slams down (world/slam.ts has the beats):
 * its sheet's victory pose, played to the slam, and the point the slam's icon drops into.
 *
 *   wind-up   the victory's first frame: a crouch, the weapon low
 *   spring    its second: up off the ground, weapon raised, a pixel higher as it rises, trembling
 *             while the icon hangs over the screen
 *   land      its third, as the icon is stamped on the screen
 *   hold      its fourth, the weapon held high, until the skill casts
 *
 * The knight faces the camera, the weapon raised in its right hand (the screen's left): the Lancer's
 * spear, the Blade's sword (Kevin's too), the Guardian's fist, the Cleric's and the Arcanist's staves.
 * The Ranger turns side-on to its foes, its bow held up before it. The icon goes into the spear's tip,
 * the sword's point, the fist, the bow; the Cleric's light gathers over its staff and Aeon's clock
 * over its hat (render/castFx.ts draws them), and Meteor Storm's icon falls as the storm's first
 * meteor, on the spot the sim picked (Unit.skillSlam.at).
 *
 * Pure: the sheets' JSON only (no pixels), so the HUD can ask where the icon goes before any art loads.
 */
import type { SkillId } from '../../core/skillbook';
import type { Unit } from '../../world/entities';
import { SLAM_BEATS } from '../../world/slam';
import { SHEETS, type SheetName } from './assets';
import { KNIGHT_SHEET, knightSheet } from './knightLook';
import type { Dir } from './sheet';

type Px = readonly [number, number];

/**
 * Per knight sheet: whether the power-up is side-on (else facing the camera) and, per victory frame
 * (0 to 3), the pixel of the raised weapon's point in the cell (none in the crouch).
 */
export const CAST_POSES: Readonly<Partial<Record<SheetName, { side: boolean; tips: Partial<Record<Dir, readonly [null, Px, Px, Px]>> }>>> = {
  rk_guardian: { side: false, tips: { s: [null, [9, 10], [9, 14], [9, 13]] } },
  rk_blade: { side: false, tips: { s: [null, [9, 8], [9, 12], [9, 11]] } },
  // (Kevin is a Blade on PixelForge's humanoid rig: his sword goes up where the Blade's does.)
  rk_kevin: { side: false, tips: { s: [null, [9, 8], [9, 12], [9, 11]] } },
  rk_lancer: { side: false, tips: { s: [null, [9, 7], [9, 11], [9, 10]] } },
  rk_cleric: { side: false, tips: { s: [null, [8, 9], [8, 13], [8, 12]] } },
  rk_arcanist: { side: false, tips: { s: [null, [8, 9], [8, 13], [8, 12]] } },
  rk_ranger: { side: true, tips: { e: [null, [23, 15], [23, 19], [23, 18]], w: [null, [7, 16], [7, 19], [7, 18]] } },
};

/** The share of the slam the crouch lasts, and the landing frame's after the stamp. */
const WIND = 0.12;
const LAND = 0.05;
/** The spring rises a pixel past this share of the slam. */
const RISE = 0.22;
/** The light over the Cleric's staff, and Aeon's clock over its hat: px above (the clock's middle). */
export const ORB_UP = 7;
export const CLOCK_UP = 8;

export interface CastPose {
  /** The victory clip's facing, and the frame's place in it (0 to 3). */
  dir: Dir;
  i: number;
  /** Code motion on top of the frame (px): the rise, the tremble. */
  dx: number;
  dy: number;
  /** The raised weapon's point from the feet (world px, the pixel's middle), or null in the crouch. */
  tip: [number, number] | null;
}

/** The sheet a knight is drawn from (its own, or its class's). */
export function sheetOf(h: Pick<Unit, 'knightId' | 'cls'>): SheetName {
  return h.knightId ? knightSheet(h.knightId) : KNIGHT_SHEET[h.cls!];
}

/** The power-up's frame `t` seconds into a slam of `dur` (reduce motion: no rise, no tremble). */
export function castPose(sheet: SheetName, slam: { t: number; dur: number; face?: 1 | -1 }, calm = false): CastPose {
  const spec = CAST_POSES[sheet] ?? CAST_POSES.rk_blade!;
  const dir: Dir = spec.side ? (slam.face === -1 ? 'w' : 'e') : 's';
  const u = slam.t / Math.max(1e-6, slam.dur);
  const i = u < WIND ? 0 : u < SLAM_BEATS.slam ? 1 : u < SLAM_BEATS.slam + LAND ? 2 : 3;
  let dx = 0;
  let dy = 0;
  if (!calm && i === 1) {
    if (u >= RISE) dy = -1;
    // Hanging there with the icon, it trembles a pixel.
    if (u >= SLAM_BEATS.fly) dx = Math.floor(slam.t / 0.05) % 2;
  }
  const px = spec.tips[dir]?.[i] ?? null;
  const [ox, oy] = SHEETS[sheet].meta.pivot;
  return { dir, i, dx, dy, tip: px ? [px[0] + 0.5 - ox + dx, px[1] + 0.5 - oy + dy] : null };
}

/** The frame (sheet index) a pose shows. */
export function castFrame(sheet: SheetName, p: CastPose): number {
  const f = SHEETS[sheet].clip('victory', p.dir);
  return f[Math.min(p.i, f.length - 1)][0];
}

/** Half the slam's icon at the world's pixel (the skill icons are 10 px square): what it covers round its spot. */
export const ICON_HALF = 5;

/**
 * How far over the feet the power-up reaches at its highest (px, negative: up): its spring's head or
 * weapon, or, for `skill`, what's held up over it for the icon to land in (Miracle's light, Aeon's
 * clock) with the icon's half round it. The HUD stamps the skill's name above this.
 */
export function castTop(sheet: SheetName, face: 1 | -1 = 1, skill?: SkillId): number {
  const meta = SHEETS[sheet].meta;
  let top = 0;
  // (A moment in each of the spring, the landing and the hold.)
  for (const t of [0.3, 0.6, 1]) {
    const p = castPose(sheet, { t, dur: 1, face }, true);
    top = Math.min(top, (meta.tops[castFrame(sheet, p)]?.[0] ?? 4) - meta.pivot[1], p.tip ? p.tip[1] - 0.5 : 0);
    if (skill === 'miracle' || skill === 'rewind') top = Math.min(top, anchorOf(skill, sheet, p, 0, 0).y - ICON_HALF);
  }
  return top - 1;
}

/**
 * Where a skill's slam ends, from a knight standing at (x, y) in pose `p`: the raised weapon's point,
 * the light over the Cleric's staff (Miracle), the clock over Aeon's hat (Rewind). In world px, the
 * middle of the pixel it's on as the knight is drawn (sprites stand on whole pixels): floor() of it
 * is that pixel.
 */
export function anchorOf(skill: SkillId, sheet: SheetName, p: CastPose, x: number, y: number): { x: number; y: number } {
  const bx = Math.round(x);
  const by = Math.round(y);
  const tip = p.tip ?? [-5.5, -17.5];
  if (skill === 'miracle') return { x: bx + tip[0], y: by + tip[1] - ORB_UP };
  if (skill === 'rewind') {
    const meta = SHEETS[sheet].meta;
    const top = meta.tops[castFrame(sheet, p)]?.[0] ?? 4;
    return { x: bx + 0.5 + p.dx, y: by + top - meta.pivot[1] + p.dy - CLOCK_UP + 0.5 };
  }
  return { x: bx + tip[0], y: by + tip[1] };
}

/**
 * Where knight h's slam is taking its icon (world px): where its spell starts, in the pose it casts
 * from (the hold), or Meteor Storm's first meteor's spot once picked. Null with no slam under way.
 */
export function castAnchor(h: Unit): { x: number; y: number } | null {
  const sl = h.skillSlam;
  if (!sl) return null;
  if (sl.at) return { x: sl.at.x, y: sl.at.y };
  const sheet = sheetOf(h);
  return anchorOf(sl.skill, sheet, castPose(sheet, { t: sl.dur, dur: sl.dur, face: sl.face }), h.x, h.y);
}
