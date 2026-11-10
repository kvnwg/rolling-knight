/**
 * The foes' bullets, drawn (world/bullets.ts flies them). No DOM here: the preview sheet and the tests
 * draw them in Node; the game keeps each frame as a canvas (render/foeBullets.ts).
 *
 * ONE RULE, so a bullet is read at a glance on grass, snow, lava or a dark crypt floor: every foe's
 * bullet has the same near-black ink outline and a white-hot heart (nothing of the squad's has both,
 * nor has any pickup), and its hue says what it does:
 *   red     flies straight            (orb, dart, spit, pellet, pip, spark, wave)
 *   pink    bends: curves, weaves, homes, comes back   (a curving orb, spore, blade, wisp)
 *   orange  bursts: lands, splits, pops                (glob, seed, mine)
 * Its shape says which it is: a needle is fast, a fat pod will split, a crescent hugs the ground, an
 * eye is watching you. They're flat and crisp like every attack effect (the unlit top layer): no
 * glow, nothing half transparent; animation is stepped, a few frames each.
 */
import { HUE, type BulletForm, type BulletHue } from '../../world/bullets';
import { SHOT_DIRS, ballSprite, dirAngle } from '../vfx/art';
import type { Ramp } from '../vfx/look';
import { Draft, band, disc, ellipse, stroke, type VfxSprite } from '../vfx/raster';

/** The outline every foe's bullet wears. */
export const BULLET_INK = '#1c0812';
const WHITE = '#ffffff';

/** Each hue's shades: ink, dark, body, light, white. */
export const BULLET_RAMPS: Readonly<Record<BulletHue, Ramp>> = {
  red: [BULLET_INK, '#9c1428', HUE.red, '#ff9c8c', WHITE],
  pink: [BULLET_INK, '#961488', HUE.pink, '#ffa6e8', WHITE],
  orange: [BULLET_INK, '#b4500a', HUE.orange, '#ffdc6e', WHITE],
};

const RED = BULLET_RAMPS.red;
const PINK = BULLET_RAMPS.pink;
const ORANGE = BULLET_RAMPS.orange;

/** How many frames each kind has (per direction or look, where it has those). */
export const BULLET_FRAMES: Readonly<Record<BulletForm, number>> = {
  dart: 2, spit: 2, spore: 4, seed: 4, pip: 2, glob: 3, mine: 3, blade: 8, pellet: 2, wisp: 3, wave: 2, spark: 2,
};

const frameOf = (f: number, n: number) => ((f % n) + n) % n;

/** Paints rows of shade letters (d dark, b body, l light, w white, k ink) centered on (0, 0). */
function rows(d: Draft, art: readonly string[], r: Ramp, pri = 3, ox = 0, oy = 0): void {
  const h = art.length;
  const w = art[0].length;
  const cx = (w - 1) >> 1;
  const cy = (h - 1) >> 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = art[y][x];
      if (c === '.') continue;
      d.put(x - cx + ox, y - cy + oy, c === 'k' ? r[0] : c === 'd' ? r[1] : c === 'b' ? r[2] : c === 'l' ? r[3] : r[4], pri);
    }
  }
}

/** The plain slow orb: the glossy ball with its short tail (red straight, pink when it curves; big: a boss's). */
export function orbSprite(hue: BulletHue, dir: number, frame: number, big: boolean): VfxSprite {
  return ballSprite(BULLET_RAMPS[hue], dir, frame, big);
}

/**
 * A dart: a needle ten pixels long, white at its point, flights at its tail, and a streak of speed
 * behind it that flickers. Thin on purpose: it's the fast one.
 */
export function dartSprite(dir: number, frame: number): VfxSprite {
  const d = new Draft(12);
  const a = dirAngle(dir, SHOT_DIRS);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  stroke(-ux * 5, -uy * 5, ux * 4, uy * 4, (s) => (s < 0.2 ? 3 : 1), (x, y, s, across) => {
    const c = s < 0.2 ? (Math.abs(across) > 0.5 ? RED[2] : RED[3]) : s < 0.36 ? RED[2] : s < 0.58 ? RED[3] : WHITE;
    d.put(x, y, c, 3);
  });
  d.edge(BULLET_INK);
  // The streak: unoutlined, dithered, one frame longer than the other.
  const len = frame % 2 ? 5 : 3;
  stroke(-ux * 7, -uy * 7, -ux * (7 + len), -uy * (7 + len), () => 1, (x, y, s) => {
    if ((Math.round(s * len) + frame) % 2) return;
    d.put(x, y, s < 0.5 ? RED[3] : RED[2], 1);
  });
  return d.sprite();
}

/** A small glossy drop: its heart white, lit up on the left, its lower rim dark. */
function drop(d: Draft, r: Ramp, R: number, cx = 0, cy = 0): void {
  disc(cx, cy, R, (x, y, q) => {
    const rr = q * R;
    const lx = x - Math.round(cx);
    const ly = y - Math.round(cy);
    d.put(x, y, rr <= 0.8 ? WHITE : rr <= 1.7 ? r[3] : rr >= R - 0.9 && lx + ly > 0 ? r[1] : r[2], 3);
  });
}

/**
 * Spit. `fast`: just out of the mouth, a drop with a long tail. Hanging: it has braked to a wobbling
 * blob that drips.
 */
export function spitSprite(dir: number, frame: number, fast: boolean): VfxSprite {
  const d = new Draft(14);
  const f = frame % 2;
  if (fast) {
    const a = dirAngle(dir, SHOT_DIRS);
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    stroke(-ux * 2, -uy * 2, -ux * 9, -uy * 9, (s) => (s < 0.45 ? 3 : s < 0.8 ? 2 : 1), (x, y, s) => {
      if (s > 0.7 && (x + y + f) % 2) return;
      d.put(x, y, s < 0.35 ? RED[2] : RED[1], 2);
    });
    drop(d, RED, 2.3);
    d.edge(BULLET_INK);
    return d.sprite();
  }
  // Hanging: squashed one frame, tall the next, a drip letting go under it.
  if (f === 0) rows(d, ['.bbb.', 'blwbb', 'bwwlb', 'blllb', 'dbbbd', '.ddd.'], RED);
  else rows(d, ['.bbbb.', 'blwlbb', 'bwwllb', 'dblbbd', '.dddd.'], RED);
  d.edge(BULLET_INK);
  if (f === 0) d.put(0, 5, RED[2], 1);
  else {
    d.put(1, 4, RED[1], 1);
    d.put(1, 6, RED[2], 1);
  }
  return d.sprite();
}

/** A spore: a fuzzy puffball whose spines turn as it drifts (four frames: out straight, then on the slant). */
export function sporeSprite(frame: number): VfxSprite {
  const d = new Draft(10);
  const f = frameOf(frame, 4);
  rows(d, ['.bbb.', 'blllb', 'blwlb', 'bllbd', '.bdd.'], PINK);
  const long = f < 2;
  const spines: Array<[number, number]> = f % 2 === 0 ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (const [sx, sy] of spines) {
    const diag = sx !== 0 && sy !== 0;
    const base = diag ? 2 : 3;
    d.put(sx * base, sy * base, PINK[2], 3);
    if (long || diag) d.put(sx * (base + 1), sy * (base + 1), PINK[3], 3);
  }
  d.edge(BULLET_INK);
  return d.sprite();
}

/**
 * A seed pod: fat, ribbed, a curl of stem. Frames 0 and 1 it rocks as it flies; 2 and 3 it has swollen
 * and flashes white-hot: about to burst.
 */
export function seedSprite(frame: number): VfxSprite {
  const d = new Draft(10);
  const f = frameOf(frame, 4);
  if (f === 0) rows(d, ['..bbbb.', '.bllbbb', 'blwlbdb', 'bllbbdb', 'bbbbdbd', '.bbdbd.', '..ddd..'], ORANGE);
  else if (f === 1) rows(d, ['..bbb..', '.blllb.', 'bllwlbb', 'blllbdb', 'bbbbdbd', '.bdbdd.', '..bdd..'], ORANGE);
  else if (f === 2) rows(d, ['..bbbbb..', '.bllllbb.', 'bllwwwlbb', 'blwwwwllb', 'blwwwwlbd', 'bllwwllbd', '.bllllbd.', '..bbbdd..'], ORANGE);
  else rows(d, ['..lllll..', '.lwwwwll.', 'lwwwwwwll', 'lwwwwwwwl', 'lwwwwwwwl', 'llwwwwwll', '.llwwwll.', '..lllll..'], ORANGE);
  // The stem, up on its right.
  if (f < 2) {
    d.put(2, -4, ORANGE[1], 3);
    d.put(3, -5, ORANGE[1], 3);
  }
  d.edge(BULLET_INK);
  return d.sprite();
}

/** A pip: a seed's small bright diamond, twinkling. */
export function pipSprite(frame: number): VfxSprite {
  const d = new Draft(6);
  if (frame % 2 === 0) rows(d, ['.l.', 'lwl', '.b.'], RED);
  else rows(d, ['.b.', 'bwb', '.d.'], RED);
  d.edge(BULLET_INK);
  return d.sprite();
}

/** A pellet: a bead of shot three pixels across, glinting. */
export function pelletSprite(frame: number): VfxSprite {
  const d = new Draft(6);
  if (frame % 2 === 0) rows(d, ['lwl', 'wwb', 'lbd'], RED);
  else rows(d, ['blb', 'lwb', 'bbd'], RED);
  d.edge(BULLET_INK);
  return d.sprite();
}

/**
 * A glob in the air: stretched as it climbs, round and biggest at the top of its arc (nearest the
 * eye), stretched again coming down, a drop or two trailing after it.
 */
export function globSprite(frame: number): VfxSprite {
  const d = new Draft(10);
  const f = frameOf(frame, 3);
  if (f === 0) rows(d, ['.bbb.', 'bwlbb', 'bllbb', 'bbbbd', 'bbbdd', '.bdd.', '..d..'], ORANGE);
  else if (f === 1) rows(d, ['..bbb..', '.bwwlb.', 'bwwllbb', 'bllbbbd', 'bbbbbdd', '.bbbdd.', '..ddd..'], ORANGE);
  else rows(d, ['..b..', '.bbb.', 'bwlbb', 'bllbd', 'bbbdd', '.bdd.'], ORANGE);
  d.edge(BULLET_INK);
  // Drops shaken off it: below as it climbs, above as it falls.
  if (f === 0) d.put(1, 6, ORANGE[2], 1);
  if (f === 2) d.put(-1, -5, ORANGE[2], 1);
  return d.sprite();
}

/**
 * A mine on the ground: a studded shell round a hot core. Frame 0 it waits; 1 its core flares (it
 * blinks between the two, faster and faster); 2 white all over: now.
 */
export function mineSprite(frame: number): VfxSprite {
  const d = new Draft(10);
  const f = frameOf(frame, 3);
  if (f === 0) rows(d, ['..bbb..', '.bbbbb.', 'bbdldbb', 'bblwlbd', 'bbdldbd', '.bbbdd.', '..ddd..'], ORANGE);
  else if (f === 1) rows(d, ['..bbb..', '.bllbb.', 'blwwwlb', 'blwwwlb', 'blwwwlb', '.bbllb.', '..bbd..'], ORANGE);
  else rows(d, ['..lll..', '.lwwwl.', 'lwwwwwl', 'lwwwwwl', 'lwwwwwl', '.lwwwl.', '..lll..'], ORANGE);
  // Its studs, at the four corners.
  const stud = f === 2 ? ORANGE[3] : ORANGE[1];
  for (const [x, y] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) d.put(x, y, stud, 3);
  d.edge(BULLET_INK);
  return d.sprite();
}

/**
 * A thrown blade spinning, in eight steps of a turn (`spin` -1 turns it the other way): a goblin's
 * knife (look 0), a skeleton's bone (1), an orc's axe (2). Its edge is white, a smear of its turn behind it.
 */
export function bladeSprite(look: number, frame: number, spin: 1 | -1 = 1): VfxSprite {
  const d = new Draft(10);
  const f = frameOf(frame * spin, 8);
  const a = (f / 8) * Math.PI * 2;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  // (On the slant a 7-pixel stroke is 5 across: stretch it so the blade keeps its length.)
  const L = f % 2 ? 4.4 : 4;
  if (look === 1) {
    // A bone: a white shaft, a knuckle at each end.
    stroke(-ux * L, -uy * L, ux * L, uy * L, (s) => (s < 0.17 || s > 0.83 ? 3 : 1), (x, y, s, across) => {
      const end = s < 0.17 || s > 0.83;
      d.put(x, y, end ? (Math.abs(across) > 0.5 ? PINK[3] : WHITE) : s > 0.4 && s < 0.6 ? PINK[3] : WHITE, 3);
    });
  } else if (look === 2) {
    // An axe: a dark haft, a broad head on one side of its end.
    stroke(-ux * L, -uy * L, ux * L, uy * L, () => 1, (x, y, s) => d.put(x, y, s < 0.55 ? PINK[2] : PINK[3], 3));
    const hx = ux * (L - 1.5);
    const hy = uy * (L - 1.5);
    const px = -uy * spin;
    const py = ux * spin;
    // (One stroke three pixels thick laid along the haft's end, off to the side it turns toward.)
    stroke(hx - ux * 2 + px * 2, hy - uy * 2 + py * 2, hx + ux * 2 + px * 2, hy + uy * 2 + py * 2, (s) => (s < 0.15 || s > 0.85 ? 2 : 3), (x, y, s, across) => {
      d.put(x, y, across * spin >= 0.5 || s < 0.15 || s > 0.85 ? WHITE : PINK[3], 4);
    });
  } else {
    // A knife: a short dark grip, a cross-guard, a blade that whitens to its point.
    stroke(-ux * L, -uy * L, ux * (L + 0.5), uy * (L + 0.5), (s) => (s > 0.26 && s < 0.4 ? 3 : 1), (x, y, s) => {
      d.put(x, y, s < 0.26 ? PINK[2] : s < 0.4 ? PINK[3] : s < 0.55 ? PINK[3] : WHITE, 3);
    });
  }
  d.edge(BULLET_INK);
  // The smear of its turn: two pixels where its tip just was.
  const b = a - spin * 0.9;
  d.put(Math.cos(b) * (L + 1.5), Math.sin(b) * (L + 1.5), PINK[2], 1);
  d.put(Math.cos(b + Math.PI) * (L + 1.5), Math.sin(b + Math.PI) * (L + 1.5), PINK[1], 1);
  return d.sprite();
}

/**
 * A wisp: a round head with an eye, a flame of a tail licking back from the way it's going (eight
 * ways, three frames of flicker). `eye`: open on a knight, its pupil toward its heading; else shut.
 */
export function wispSprite(dir8: number, frame: number, eye: boolean): VfxSprite {
  const d = new Draft(14);
  const f = frameOf(frame, 3);
  const a = (frameOf(dir8, 8) / 8) * Math.PI * 2;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  // The tail: three wide at the head, wavering, thinning to a dithered point.
  const wob = f - 1;
  const ex = -ux * 8 - uy * wob * 1.5;
  const ey = -uy * 8 + ux * wob * 1.5;
  stroke(-ux * 2, -uy * 2, ex, ey, (s) => (s < 0.4 ? 3 : s < 0.75 ? 2 : 1), (x, y, s) => {
    if (s > 0.8 && (x + y + f) % 2) return;
    d.put(x, y, s < 0.3 ? PINK[2] : s < 0.7 ? PINK[1] : PINK[2], 2);
  });
  rows(d, ['.bbb.', 'bllbb', 'blllb', 'bbllb', '.bbd.'], PINK);
  d.edge(BULLET_INK);
  if (eye) {
    // A white eye two pixels square, its ink pupil on the side it's heading.
    for (const [x, y] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) d.put(x, y, WHITE, 4);
    d.put(ux > 0.3 ? 0 : -1, uy > 0.3 ? 0 : uy < -0.3 ? -1 : f === 1 ? -1 : 0, BULLET_INK, 5);
  } else {
    d.put(-1, 0, BULLET_INK, 4);
    d.put(0, 0, BULLET_INK, 4);
    d.put(1, -1, WHITE, 4);
  }
  return d.sprite();
}

/**
 * A wave: a crescent rolling along the ground, its leading edge white-hot, grit dragging behind it
 * (two frames). `big`: a boss's, wider.
 */
export function waveSprite(dir: number, frame: number, big: boolean): VfxSprite {
  const d = new Draft(18);
  const a = dirAngle(dir, SHOT_DIRS);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const R = big ? 11 : 8;
  const span = (big ? 100 : 112) * (Math.PI / 180);
  // The arc is the front of a circle whose middle trails behind the wave's own.
  const cx = -ux * (R - 2);
  const cy = -uy * (R - 2);
  band({
    cx, cy, R, k: 1, a0: a - span / 2, span, sign: 1, t0: 0, t1: 1,
    thick: (t) => 1 + 3 * Math.sin(Math.PI * t),
    paint: (x, y, _t, p, n) => d.put(x, y, p === 0 ? (n > 1 ? WHITE : RED[3]) : p === 1 ? (n > 2 ? RED[3] : RED[2]) : p === 2 && n > 3 ? RED[2] : RED[1], 3),
  });
  d.edge(BULLET_INK);
  // Grit behind it, alternating.
  const f = frame % 2;
  for (let i = -1; i <= 1; i++) {
    const back = 3 + ((i + f + 2) % 2) * 2;
    d.put(-ux * back - uy * i * 3, -uy * back + ux * i * 3, i === 0 ? RED[2] : RED[1], 1);
  }
  return d.sprite();
}

/** A spark: a four-pointed star that turns between a plus and a cross: a beam is a line of them. */
export function sparkSprite(frame: number): VfxSprite {
  const d = new Draft(6);
  if (frame % 2 === 0) rows(d, ['..l..', '..w..', 'lwwwl', '..w..', '..l..'], RED);
  else rows(d, ['l...l', '.w.w.', '..w..', '.w.w.', 'l...l'], RED);
  d.edge(BULLET_INK);
  return d.sprite();
}

/** How many steps a landing mark fills in (markSprite's `fill`: 0 empty .. MARK_STEPS full). */
export const MARK_STEPS = 4;

/**
 * Where a lobbed glob comes down: a ring on the ground `r` px across (flattened, as the ground is
 * seen), red with a dark rim outside it so it reads on any floor, a cross on the spot, and a dithered
 * red wash that fills it from the middle as the glob falls (`fill`). `hot`: its flash, white.
 */
export function markSprite(r: number, fill: number, hot: boolean): VfxSprite {
  const d = new Draft(r + 4);
  const k = 0.6;
  const wash = ((r - 2) * Math.max(0, Math.min(MARK_STEPS, fill))) / MARK_STEPS;
  if (wash > 0.5) disc(0, 0, wash, (x, y) => ((x + y) % 2 === 0 ? d.put(x, y, hot ? '#ff8a6a' : '#e0281c', 1) : undefined), k);
  ellipse(0, 0, r + 1, (r + 1) * k, (x, y) => d.put(x, y, '#3a0408', 2));
  ellipse(0, 0, r, r * k, (x, y) => d.put(x, y, hot ? WHITE : '#ff2e1e', 3));
  if (r >= 9) ellipse(0, 0, r - 1, (r - 1) * k, (x, y) => d.put(x, y, hot ? '#ffb4a4' : '#ff5a44', 3));
  for (const [x, y] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) d.put(x, y, hot || (x === 0 && y === 0) ? WHITE : '#ffb4a4', 4);
  return d.sprite();
}

/** Every kind, for the preview sheet and the tests: its frames in one direction and its first look. */
export const BULLET_ART: Readonly<Record<BulletForm, (dir: number, frame: number) => VfxSprite>> = {
  dart: (dir, f) => dartSprite(dir, f),
  spit: (dir, f) => spitSprite(dir, f, true),
  spore: (_dir, f) => sporeSprite(f),
  seed: (_dir, f) => seedSprite(f),
  pip: (_dir, f) => pipSprite(f),
  glob: (_dir, f) => globSprite(f),
  mine: (_dir, f) => mineSprite(f),
  blade: (_dir, f) => bladeSprite(0, f),
  pellet: (_dir, f) => pelletSprite(f),
  wisp: (dir, f) => wispSprite(Math.round(dir / 2), f, true),
  wave: (dir, f) => waveSprite(dir, f, false),
  spark: (_dir, f) => sparkSprite(f),
};
