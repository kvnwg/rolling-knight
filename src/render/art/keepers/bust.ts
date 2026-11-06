/**
 * A keeper drawn big, from the waist up behind their counter, as an anime pixel portrait: the same
 * person as their little hub figure (the skin, hair, beard, glasses, hat, clothes and panel come from
 * their NpcLook), in natural proportions. A head about two fifths of what shows above the counter,
 * with a defined jaw and a slightly pointed chin, on a neck; shoulders more than twice as wide as the
 * face; slender arms down the sides to the hands resting on the counter, one holding their tool (or
 * bent at the elbow to grip a staff standing beside them).
 * Up close the face gets big anime eyes (a heavy upper lash line, an iris dark under the lid and light
 * at its foot, a pupil and a white glint, all lit from the same side), thin brows that carry the mood,
 * a nose of one shadow pixel, a small mouth and a soft blush. Hair comes in locks, each a tapering
 * strand lit on the side toward the light with a dark line where it lies over the next, and a band of
 * shine across the crown; cloth gets soft folds; everything is cel shaded in a few hue-shifted steps
 * (cool shadows, warm lights) from the top left, with a coloured line round the figure, lighter where
 * the light catches the edge.
 *
 * Painted in two passes round the counter: `paintBust` draws the head and body (the counter, painted
 * after, hides the body's foot), and the `front` it returns draws what rests on the counter top in
 * front of it: the sleeves' ends over its edge, the hands and whatever they hold.
 */
import type { NpcLook } from '../../../world/npcs';
import { mixHex } from '../draw';
import { Layer, oval, rk } from '../hubKit';
import { figureMask } from './light';
import { beardRamp, cel, hairRamp, lum, outline, PLUM, skinRamp } from './ramps';

export type BustTool = 'wrench' | 'hammer' | 'tongs' | 'candle' | 'quill' | 'staff' | 'spear' | 'magnifier' | 'orbStaff';

export interface BustSpec {
  look: NpcLook;
  /** Lines round the eyes, heavier lids, a softer jaw. */
  old?: boolean;
  /** Lashes, a flick at the eyes' outer corners, rosier lips, a slighter build. */
  lashes?: boolean;
  /** Eyes that glow in the dark of a hood (the Oracle's). */
  glowEyes?: string;
  /** The hand on the right (as you look) holds this. */
  tool?: BustTool;
  /** Looks a little to one side: -1 left, 1 right (moves the irises). */
  look2?: -1 | 0 | 1;
  /** A smile (default), a flat mouth, or a grin. */
  mouth?: 'smile' | 'flat' | 'grin';
  /** The brows: soft (default), raised (bright and curious) or stern (drawn down toward the nose). */
  brows?: 'soft' | 'raised' | 'stern';
  /** The irises' colour (else the look's eyes, else a warm brown). */
  iris?: string;
}

type P = readonly [number, number];

// ------------------------------------------------------------------ proportions

/** From the skull's top down to the counter top (the hair and hats go higher). */
const FIG_H = 55;
/** The face's half-width on each row from the skull's top to the chin: a round crown, straight
 * sides past the eyes, then the jaw curving in to a small, slightly pointed chin. */
const FACE = [4, 6, 7, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 8, 7, 7, 6, 4, 3, 1];
const HEAD_H = FACE.length;
/** The lash line's row; the eyes' left columns from the middle (each six wide). */
const EYE_Y = 11;
const EYE_X = [-8, 3] as const;
const NOSE_Y = 18;
const MOUTH_Y = 20;
/** How far right of the middle a tall staff stands (held in the right hand). */
const STAFF_DX = 26;

/** Where everything sits, from the bust's middle (cx) and the counter top (base). */
export function bustGeometry(cx: number, base: number) {
  const top = base - FIG_H;
  return {
    cx,
    base,
    /** The skull's top row (hair and hats go higher). */
    top,
    /** The eyes' top row (their lash line). */
    eyeY: top + EYE_Y,
    /** The mouth's row. */
    mouthY: top + MOUTH_Y,
    /** The chin's row. */
    chin: top + HEAD_H - 1,
    /** The shoulders' top, beside the neck. */
    sy: top + 24,
    /** The head's middle (for halos round it). */
    headY: top + 10,
  };
}
type Geo = ReturnType<typeof bustGeometry>;

export interface BustOut {
  /** Paints the hands (and the sleeves' ends over the counter's edge) and anything held, over the counter top. Call after the counter. */
  front: (L: Layer) => void;
  /** The eyes' pixels shut (a blink): [x, y, color]. */
  blink: Array<[number, number, string]>;
}

const isStaff = (t?: BustTool): t is 'staff' | 'spear' | 'orbStaff' => t === 'staff' || t === 'spear' || t === 'orbStaff';

// ------------------------------------------------------------------ colour

const WHITE = '#fbf6f2';
const GLINT = '#ffffff';

interface Pal {
  skin: string[];
  hair: string[];
  shirt: string[];
  arm: string[];
  bare: boolean;
  mail: boolean;
  slim: boolean;
}

function palette(spec: BustSpec): Pal {
  const look = spec.look;
  const skin = skinRamp(look.skin);
  const bare = !!look.sleeves && look.sleeves[1] === look.skin[1];
  return {
    skin,
    hair: hairRamp(look.hair),
    shirt: cel(look.shirt),
    arm: bare ? skin : cel(look.sleeves ?? look.shirt),
    bare,
    // (A guard's sleeves of mail go with his helm; anyone else's are cloth.)
    mail: !!look.sleeves && !bare && look.hat?.kind === 'kettle',
    slim: !!spec.lashes,
  };
}

// ------------------------------------------------------------------ the bust

/**
 * Paints a keeper's head and body on its own layer (outlined there) and copies it onto `L`. `cx` is
 * the bust's middle, `base` the counter top's row. The blink is whatever differs when the same
 * keeper is painted with their eyes shut (so it follows glasses, hoods and shadows by itself).
 */
export function paintBust(L: Layer, cx: number, base: number, spec: BustSpec): BustOut {
  const g = bustGeometry(cx, base);
  const open = figure(g, spec, false);
  const shut = figure(g, spec, true);
  const blink: Array<[number, number, string]> = [];
  for (let y = open.y0; y < open.y0 + open.h; y++) {
    for (let x = open.x0; x < open.x0 + open.w; x++) {
      const b = shut.get(x, y);
      if (b && b !== open.get(x, y)) blink.push([x, y, b]);
    }
  }
  L.merge(open);
  // The keeper is lit smoothly (light.ts): what shows above the counter, which hides the rest.
  const lit = (src: Layer, F: Layer, y1: number) => {
    const mask = figureMask(F);
    for (let y = src.y0; y < Math.min(y1, src.y0 + src.h); y++) {
      for (let x = src.x0; x < src.x0 + src.w; x++) if (src.a(x, y) && F.inside(x, y)) mask[(y - F.y0) * F.w + (x - F.x0)] = 1;
    }
  };
  lit(open, L, base);
  return {
    blink,
    front: (F: Layer) => {
      const A = new Layer(cx - 46, base - 46, 93, 54);
      arms(A, g, spec);
      outline(A);
      // A soft shadow on the counter top under the hands and sleeves.
      for (let x = A.x0; x < A.x0 + A.w; x++) {
        let low = -1;
        for (let y = A.y0 + A.h - 1; y >= A.y0 && low < 0; y--) if (A.a(x, y)) low = y;
        if (low < base - 1) continue;
        F.tone(x, low + 1, -0.3);
        F.tone(x, low + 2, -0.14);
      }
      F.merge(A);
      lit(A, F, A.y0 + A.h);
    },
  };
}

function figure(g: Geo, spec: BustSpec, shut: boolean): Layer {
  const { cx, base, top } = g;
  // Room well above anything a keeper wears or holds, so nothing is cut off here (the scene clips).
  const B = new Layer(cx - 46, top - 40, 93, base - top + 46);
  const look = spec.look;
  const pal = palette(spec);
  if (isStaff(spec.tool)) staff(B, g, spec.tool);
  if (look.hat?.kind === 'hood') hoodBack(B, g, cel(look.hat.ramp));
  if (look.hairStyle === 'bob' || look.hairStyle === 'bun') hairBack(B, g, look, pal.hair);
  body(B, g, look, pal, isStaff(spec.tool));
  if (look.panel) panel(B, g, look, pal);
  if (isStaff(spec.tool)) staffArm(B, g, pal);
  head(B, g, pal.skin, spec);
  face(B, g, spec, pal, shut);
  hairDo(B, g, look, pal);
  if (look.beard) beard(B, g, look.beard, beardRamp(look.beardRamp ?? look.hair), pal.skin);
  if (look.hat) hat(B, g, look, pal, spec);
  brows(B, g, spec, pal);
  if (look.glasses) glasses(B, g);
  outline(B);
  return B;
}

// ------------------------------------------------------------------ tone patches and locks

/**
 * A patch of tones (fractional ramp steps) painted before it's turned into colour, so its shading can
 * be worked over (a band of shine, the lines where one lock lies over another) before it's laid down.
 * Each pixel also remembers which lock painted it (-1: none of them).
 */
class Tones {
  readonly t: Float32Array;
  readonly id: Int16Array;
  constructor(
    readonly x0: number,
    readonly y0: number,
    readonly w: number,
    readonly h: number,
  ) {
    this.t = new Float32Array(w * h).fill(NaN);
    this.id = new Int16Array(w * h).fill(-1);
  }
  private at(x: number, y: number): number {
    const lx = x - this.x0;
    const ly = y - this.y0;
    return lx >= 0 && ly >= 0 && lx < this.w && ly < this.h ? ly * this.w + lx : -1;
  }
  set(x: number, y: number, k: number, id = -1): void {
    const i = this.at(x, y);
    if (i < 0) return;
    this.t[i] = k;
    this.id[i] = Number.isNaN(k) ? -1 : id;
  }
  get(x: number, y: number): number {
    const i = this.at(x, y);
    return i < 0 ? NaN : this.t[i];
  }
  idAt(x: number, y: number): number {
    const i = this.at(x, y);
    return i < 0 ? -1 : this.id[i];
  }
  has(x: number, y: number): boolean {
    return !Number.isNaN(this.get(x, y));
  }
  /**
   * Where a lock lies over one behind it, the one behind gets a dark line along the front one's lower
   * and right edges (its shadow, the light being up and to the left).
   */
  castLines(dark: number): void {
    const src = this.id.slice();
    for (let ly = 0; ly < this.h; ly++) {
      for (let lx = 0; lx < this.w; lx++) {
        const i = ly * this.w + lx;
        const me = src[i];
        if (me < 0) continue;
        const up = ly > 0 ? src[i - this.w] : -1;
        const left = lx > 0 ? src[i - 1] : -1;
        if (up > me || left > me) this.t[i] = Math.min(this.t[i], dark);
      }
    }
  }
  /** Lays the patch down in a ramp's colours. */
  commit(B: Layer, ramp: readonly string[]): void {
    for (let ly = 0; ly < this.h; ly++) {
      for (let lx = 0; lx < this.w; lx++) {
        const k = this.t[ly * this.w + lx];
        if (!Number.isNaN(k)) B.px(lx + this.x0, ly + this.y0, rk(ramp, k));
      }
    }
  }
}

/** A lock of hair (or beard): a strand tapering from its root to its tip along a curve, from (ox, oy). */
interface Lock {
  a: P;
  c: P;
  b: P;
  /** Half-width at the root. */
  w: number;
  /** A tone offset (locks further back are darker). */
  t?: number;
}

function bez(a: P, c: P, b: P, t: number): [number, number] {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

/**
 * Paints locks into a tone patch, back to front (each remembered by its index plus `id0`). Each is
 * flat in the middle, lit along the side that faces the light (up and to the left) and a step darker
 * along its other side; `castLines` then draws where they overlap.
 */
function paintLocks(T: Tones, ox: number, oy: number, locks: readonly Lock[], o: { taper?: number; id0?: number } = {}): void {
  locks.forEach((lk, li) => {
    const N = 48;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= N; i++) {
      const [x, y] = bez(lk.a, lk.c, lk.b, i / N);
      pts.push([ox + x, oy + y]);
    }
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const R = lk.w + 1;
    for (let y = Math.floor(y0 - R); y <= Math.ceil(y1 + R); y++) {
      for (let x = Math.floor(x0 - R); x <= Math.ceil(x1 + R); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let best = Infinity;
        let bi = 0;
        for (let i = 0; i <= N; i++) {
          const dx = px - pts[i][0];
          const dy = py - pts[i][1];
          const d = dx * dx + dy * dy;
          if (d < best) {
            best = d;
            bi = i;
          }
        }
        const t = bi / N;
        const hw = Math.max(0.6, lk.w * Math.pow(1 - t, o.taper ?? 0.85));
        const d = Math.sqrt(best);
        if (d > hw) continue;
        const nx = d > 0.01 ? (px - pts[bi][0]) / d : 0;
        const ny = d > 0.01 ? (py - pts[bi][1]) / d : 0;
        const lit = -nx * 0.62 - ny * 0.78;
        const f = d / hw;
        let k = 2 + (lk.t ?? 0);
        if (f > 0.4 && lit > 0.3) k += 1;
        else if (f > 0.5 && lit < -0.3) k -= 1;
        T.set(x, y, k, (o.id0 ?? 0) + li);
      }
    }
  });
}

// ------------------------------------------------------------------ the body

/** The row (from the skull's top) where a staff-holder's right elbow bends, the forearm going out to the staff. */
const ELBOW = 44;

/**
 * The body's shape on a row (from the skull's top): above the armpits one piece, the neck widening
 * into sloped shoulders and round caps; below them the chest narrowing to the waist, with an arm
 * hanging at each side, drawn in a little toward the hands on the counter, a sliver of wall between
 * arm and waist low down.
 */
function bodyRow(r: number, slim: boolean): { torso: number; armIn: number; armOut: number } {
  const SH = slim ? [4, 6, 9, 12, 14, 15, 16, 17, 18] : [4, 7, 11, 14, 16, 18, 19, 20, 21];
  if (r < 22) return { torso: 0, armIn: 99, armOut: 0 };
  if (r <= 30) return { torso: SH[r - 22], armIn: slim ? 13 : 15, armOut: SH[r - 22] };
  const waist = slim ? 10 : 12;
  const chest = slim ? 13 : 15;
  const torso = Math.round(chest - (chest - waist) * Math.min(1, (r - 31) / 14));
  const t = Math.min(1, (r - 31) / 24);
  return { torso, armIn: Math.round((slim ? 13 : 15) - t * 1.2), armOut: Math.round((slim ? 18 : 21) - t * 2.4) };
}
/** The body's outer half-width on a row. */
function bodyHW(r: number, slim: boolean): number {
  const b = bodyRow(r, slim);
  return Math.max(b.torso, b.armOut);
}

/** The neck: shaded under the jaw, the chin's shadow a deeper step right under it. */
function neck(B: Layer, g: Geo, S: string[]): void {
  const { cx, top } = g;
  for (let r = 17; r <= 27; r++) {
    for (let dx = -3; dx <= 3; dx++) {
      let k = 2;
      if (r >= 25 && dx <= 0) k = 3;
      if (dx === 3) k = 1;
      if (r === 23 || r === 24) k = dx <= -2 ? 2 : 1;
      B.px(cx + dx, top + r, S[k]);
    }
  }
}

/** An arm's tone at offset `o` across it (0 at the inner edge, `w` the outer): round, lit from the left. */
function armK(o: number, w: number, left: boolean): number {
  if (left) return o === 0 ? 1 : o === 1 ? 2 : o === w ? 2 : 3;
  return o === 0 ? 0.6 : o >= w - 1 ? 0.6 : 1.4;
}

function body(B: Layer, g: Geo, look: NpcLook, pal: Pal, staffArm: boolean): void {
  const { cx, top, base } = g;
  const { shirt, arm, slim } = pal;
  neck(B, g, pal.skin);
  const robe = !!look.dress;
  /** The chest's light: lit across the front from the left, turning into shadow past the breastbone's right. */
  const chestK = (dx: number, r: number, torso: number) => {
    const term = r <= 34 ? 5 : 4;
    let k = dx <= term ? 3 : dx < torso - 1 ? 2 : 1;
    if (dx <= -torso + 1 && r > 30) k = 2;
    return k;
  };
  const cloth = new Tones(cx - 24, top + 20, 49, base - top - 10);
  for (let r = 22; r <= base - top + 4; r++) {
    const { torso, armIn, armOut } = bodyRow(r, slim);
    const hw = Math.max(torso, armOut);
    for (let dx = -hw; dx <= hw; dx++) {
      const a = Math.abs(dx);
      let isArm = a >= armIn && a <= armOut && r >= 28;
      // A staff-holder's right arm bends at the elbow and reaches out to the staff (drawn below).
      if (isArm && staffArm && dx > 0 && r > ELBOW) isArm = false;
      if (!isArm && a > torso) continue;
      // The neck stays bare above the neckline (a round one on a robe, an open V on a shirt).
      if (a <= 3 && r <= (robe ? 25 : 24)) continue;
      if (!robe && r >= 25 && r <= 28 && a <= 28 - r - 1) continue;
      const x = cx + dx;
      const y = top + r;
      if (isArm) {
        // An arm hanging at the side: round, lit down its outer left, a dark crease against the chest;
        // the right arm in shadow, darkest at its outer edge; the shoulder's cap catching the light.
        const o = a - armIn;
        const w = armOut - armIn;
        let k = armK(o, w, dx < 0);
        if (r <= 30 && dx < 0 && o >= 1 && o < w) k = 4;
        if (r <= 29 && dx > 0 && o < w) k = 2;
        if (pal.mail && o >= 1 && r > 30) {
          // Mail: rows of rings, each row's top catching the light.
          const q = Math.floor((r - 31) / 2);
          k += (r - 31) % 2 ? -0.9 : (dx + q + 40) % 3 === 0 ? -0.8 : 0.4;
        }
        if (pal.bare && dx < 0 && o === 3 && r >= 33 && r <= 40) k = 4;
        B.px(x, y, rk(arm, k));
        continue;
      }
      // The chest: lit from the left, the shadow side to the right, the shoulders' tops brighter, the
      // shadow the head casts under the neck.
      let k = chestK(dx, r, torso);
      if (r <= 25 && dx < 0) k = 3.6;
      if (r <= 27 && dx < -7 && a < hw - 1) k = 4;
      if (r <= 25 && dx > 4) k = 2;
      if (a >= hw - 1 && r < 28) k = dx < 0 ? 2 : 0.6;
      if (r >= 25 && r <= 27 && a <= 5 - (r - 25)) k = Math.min(k, 1.6);
      if (a === torso && r >= 31) k = dx < 0 ? 2 : 0.6;
      cloth.set(x, y, k);
    }
  }
  // Soft folds in the cloth, each a crease with a lit ridge along its upper left: pulled from the
  // armpits toward the chest, a fold down from under the collar, gathers above the waist and below it.
  const s = slim ? 0.84 : 1;
  const FOLDS: Array<[P, P, P]> = [
    [[-14, 31], [-11, 35], [-7, 40]],
    [[13, 31], [10, 35], [7, 41]],
    [[-1, 31], [-2, 35], [-1, 39]],
    [[-9, 43], [-8, 46], [-7, 48]],
    [[-3, 44], [-4, 46], [-3, 48]],
    [[4, 43], [3, 46], [4, 48]],
    [[9, 43], [8, 46], [8, 48]],
    [[-6, 52], [-6, 54], [-7, 56]],
    [[5, 52], [5, 54], [6, 56]],
  ];
  for (const [a, c, b] of FOLDS) crease(cloth, cx, top, [a[0] * s, a[1]], [c[0] * s, c[1]], [b[0] * s, b[1]]);
  cloth.commit(B, shirt);
  // The sleeves crease where the elbows bend.
  if (!pal.mail && !pal.bare) {
    for (const side of [-1, 1] as const) {
      if (side > 0 && staffArm) continue;
      const b = bodyRow(36, slim);
      const m = (side * (b.armIn + b.armOut)) / 2;
      const onArm = (x: number, y: number) => {
        const r = y - top;
        const br = bodyRow(r, slim);
        const a = Math.abs(x - cx);
        return r > 30 && a > br.armIn && a < br.armOut && B.a(x, y) > 0;
      };
      const SLEEVE: Array<[P, P, P]> = [
        [[m - side * 2, 44], [m, 45], [m + side * 2, 47]],
      ];
      for (const [p0, p1, p2] of SLEEVE) {
        markCrease(cx, top, p0, p1, p2, (x, y, ridge) => {
          if (onArm(x, y)) B.px(x, y, ridge ? rk(arm, side < 0 ? 4 : 2) : rk(arm, side < 0 ? 1 : 0.4));
        });
      }
    }
  }
  collar(B, g, look, pal);
}

/** Walks a fold's curve (from the figure's middle and crown), calling back for its crease and, in its middle, the lit ridge beside it. */
function markCrease(cx: number, top: number, a: P, c: P, b: P, put: (x: number, y: number, ridge: boolean) => void): void {
  const seen = new Set<string>();
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const [fx, fr] = bez(a, c, b, i / N);
    const x = cx + Math.round(fx);
    const y = top + Math.round(fr);
    if (seen.has(`${x},${y}`)) continue;
    seen.add(`${x},${y}`);
    put(x, y, false);
    if (i > N * 0.2 && i < N * 0.8) put(x - 1, y, true);
  }
}

/** A fold in a tone patch: the crease a step and a bit darker, its ridge a step lighter (only where there's cloth); a soft one just a shallow crease. */
function crease(T: Tones, cx: number, top: number, a: P, c: P, b: P, soft = false): void {
  const marks: Array<[number, number, boolean]> = [];
  markCrease(cx, top, a, c, b, (x, y, ridge) => marks.push([x, y, ridge]));
  const creases = new Set(marks.filter((m) => !m[2]).map((m) => `${m[0]},${m[1]}`));
  for (const [x, y, ridge] of marks) {
    const k = T.get(x, y);
    if (Number.isNaN(k) || (ridge && (soft || creases.has(`${x},${y}`)))) continue;
    T.set(x, y, ridge ? Math.min(4, k + 1) : Math.max(0.6, k - (soft ? 0.8 : 1.3)));
  }
}

/** A staff-holder's right forearm, from the elbow out to the staff, and the fist round it. */
function staffArm(B: Layer, g: Geo, pal: Pal): void {
  const { cx, top } = g;
  const b = bodyRow(ELBOW, pal.slim);
  const ex = cx + (b.armIn + b.armOut) / 2;
  const ey = top + ELBOW;
  const hx = cx + STAFF_DX;
  const hy = top + ELBOW - 3;
  const wx = hx - 2.5;
  const wy = hy + 0.5;
  capsule(B, ex, ey, wx, wy, 3.2, 2.4, pal.arm, false);
  if (!pal.bare) cuff(B, ex, ey, wx, wy, pal.arm, false);
  // Closed round the staff: knuckles in front of it, the thumb wrapped over the top.
  const S = pal.skin;
  for (const [dx, dy, k] of [[-2, -1, 3], [-1, -2, 3], [0, -2, 3], [-1, -1, 4], [0, -1, 3], [1, -1, 2], [-2, 0, 3], [-1, 0, 3], [0, 0, 3], [1, 0, 2], [-2, 1, 2], [-1, 1, 2], [0, 1, 2], [1, 1, 1], [-1, 2, 1], [0, 2, 1]] as const) B.px(hx + dx, hy + dy, S[k]);
}

/** A round limb from (x0, y0) to (x1, y1), radius r0 to r1, lit on its upper left. */
function capsule(L: Layer, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, ramp: string[], left: boolean): void {
  const len = Math.max(0.01, Math.hypot(x1 - x0, y1 - y0));
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const R = Math.max(r0, r1) + 1;
  for (let y = Math.floor(Math.min(y0, y1) - R); y <= Math.ceil(Math.max(y0, y1) + R); y++) {
    for (let x = Math.floor(Math.min(x0, x1) - R); x <= Math.ceil(Math.max(x0, x1) + R); x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - x0) * ux + (py - y0) * uy) / len));
      const ax = x0 + (x1 - x0) * t;
      const ay = y0 + (y1 - y0) * t;
      const rr = r0 + (r1 - r0) * t;
      const d = Math.hypot(px - ax, py - ay);
      if (d > rr) continue;
      const nx = (px - ax) / (d || 1);
      const ny = (py - ay) / (d || 1);
      const lit = -nx * 0.6 - ny * 0.8;
      const f = d / rr;
      let k = left ? 3 : 2;
      if (f > 0.45 && lit > 0.3) k += 1;
      if (f > 0.5 && lit < -0.3) k -= left ? 1 : 1.2;
      L.px(x, y, rk(ramp, k));
    }
  }
}

/** A cuff round a limb's end: a band two pixels deep, lit on its upper side. */
function cuff(L: Layer, x0: number, y0: number, x1: number, y1: number, ramp: string[], left: boolean): void {
  const len = Math.max(0.01, Math.hypot(x1 - x0, y1 - y0));
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  for (let i = -2; i <= 2; i++) {
    for (const j of [0.5, 1.5]) {
      const x = Math.floor(x1 - ux * j + uy * i);
      const y = Math.floor(y1 - uy * j - ux * i);
      L.px(x, y, rk(ramp, i <= -1 ? 4 : i >= 2 ? 1 : left ? 3 : 2));
    }
  }
}

function collar(B: Layer, g: Geo, look: NpcLook, pal: Pal): void {
  const { cx, top } = g;
  const S = pal.skin;
  const C = pal.shirt;
  if (look.dress) {
    // A robe's round neckline: a rolled hem round the throat, lit on the left.
    for (let dx = -5; dx <= 5; dx++) {
      const a = Math.abs(dx);
      const r = a <= 3 ? 26 : a === 4 ? 25 : 24;
      B.px(cx + dx, top + r, rk(C, dx <= 0 ? 4 : 2.6 - dx * 0.2));
      B.px(cx + dx, top + r + 1, rk(C, 1.4));
    }
    return;
  }
  // An open shirt: the V of skin to the breastbone, the collar's two points lying either side of it.
  for (let r = 25; r <= 27; r++) for (let dx = -(27 - r); dx <= 27 - r; dx++) B.px(cx + dx, top + r, rk(S, r === 27 ? 1.6 : dx > 0 ? 2 : 3));
  B.px(cx, top + 28, rk(C, 1));
  for (const s of [-1, 1]) {
    // Each point: a lit flap folding out over the shoulder, a darker edge under it.
    const flap: Array<[number, number]> = [[3, 24], [4, 24], [5, 24], [3, 25], [4, 25], [5, 25], [2, 26], [3, 26], [4, 26], [2, 27], [3, 27], [1, 28], [2, 28]];
    for (const [ax, r] of flap) B.px(cx + s * ax, top + r, rk(C, s < 0 ? 4 : 3 - (r - 24) * 0.15));
    for (const [ax, r] of [[6, 24], [6, 25], [5, 26], [4, 27], [3, 28], [2, 29]] as const) B.px(cx + s * ax, top + r, rk(C, s < 0 ? 2 : 1));
  }
}

/** The waist's row (from the skull's top): a belt or a cord sits here, a little above the counter. */
const WAIST = 49;

function panel(B: Layer, g: Geo, look: NpcLook, pal: Pal): void {
  const { cx, top, base } = g;
  const kind = look.panel!.kind;
  const r2 = look.panel!.ramp;
  const R = cel([mixHex(r2[0], '#000000', 0.25), r2[0], r2[1]]);
  const bottom = base - top + 4;
  const on = (x: number, y: number) => B.a(x, y) > 0;
  if (kind === 'apron' || kind === 'bib') {
    // A bib from the chest down, its straps over the shoulders, its top hem turned over, a pocket
    // stitched on it with a pencil and a screwdriver standing in it; the skirt below the waist tie.
    const t = 31;
    const T = new Tones(cx - 10, top + t, 21, bottom - t + 1);
    for (let r = t; r <= bottom; r++) {
      const hw = r < WAIST ? 6 + Math.min(2, Math.floor((r - t) / 6)) : 9;
      for (let dx = -hw; dx <= hw; dx++) {
        let k = dx <= 2 ? 3 : 2;
        if (r === t) k = 4;
        if (r === t + 1) k = dx <= 2 ? 2 : 1;
        if (dx === hw) k = 1;
        if (dx === -hw) k = 4;
        T.set(cx + dx, top + r, k);
      }
    }
    crease(T, cx, top, [-5, 33], [-6, 38], [-5, 44]);
    for (const x of [-5, 0, 5]) crease(T, cx, top, [x, 52], [x, 54], [x, 57], true);
    T.commit(B, R);
    for (const s of [-1, 1]) {
      // The strap, up over the shoulder.
      for (let r = 23; r < t; r++) {
        const x = cx + s * (6 + Math.max(0, Math.min(3, Math.floor((t - r) / 2))));
        B.px(x, top + r, rk(R, s < 0 ? 4 : 2));
        B.px(x + s, top + r, rk(R, s < 0 ? 2 : 1));
      }
      B.px(cx + s * 5, top + t + 1, s < 0 ? '#f8d468' : '#b8862a');
    }
    const py = t + 7;
    for (let dx = -4; dx <= 3; dx++) {
      B.px(cx + dx, top + py, rk(R, 4));
      B.px(cx + dx, top + py + 1, rk(R, 1));
    }
    for (let r = py + 1; r <= py + 6; r++) {
      B.px(cx - 4, top + r, rk(R, 4));
      B.px(cx + 3, top + r, rk(R, 1));
    }
    for (let dx = -3; dx <= 2; dx++) B.px(cx + dx, top + py + 6, rk(R, 1));
    // A pencil and a screwdriver in the pocket.
    for (const [dy, c] of [[-4, '#3a2a24'], [-3, '#f8d468'], [-2, '#f0c040'], [-1, '#c89030'], [0, '#c89030']] as const) B.px(cx + 1, top + py + dy, c);
    for (const [dy, c] of [[-3, '#d8dce8'], [-2, '#a8acbc'], [-1, '#c8302a'], [0, '#8a1a1a']] as const) B.px(cx - 2, top + py + dy, c);
    belt(B, g, pal, R, 'tie');
    return;
  }
  if (kind === 'vest') {
    // An open vest: its two fronts either side of the shirt, meeting lower down, a lapel turned back
    // at the top, buttons down one edge, a pocket welt on each side.
    for (let r = 24; r <= bottom; r++) {
      const open = Math.max(1, 5 - Math.floor((r - 26) / 3));
      const b = bodyRow(r, pal.slim);
      const hw = r < 28 ? b.torso : Math.min(b.torso, b.armIn - 1);
      for (const s of [-1, 1]) {
        for (let a = open; a <= hw; a++) {
          if (r < 26 && a < 4) continue;
          let k = s < 0 ? 3 : 1.6;
          if (a === open) k = s < 0 ? 4 : 2.4;
          if (a === open + 1 && r < 32) k = s < 0 ? 3.6 : 2;
          if (a === hw) k = s < 0 ? 2 : 0.8;
          B.px(cx + s * a, top + r, rk(R, k));
        }
      }
      if (r >= 34 && r < WAIST - 1 && (r - 34) % 5 === 0) {
        B.px(cx - open - 1, top + r, '#f8d468');
        B.px(cx - open - 1, top + r + 1, '#9a6a1a');
      }
    }
    for (const s of [-1, 1]) for (let a = 5; a <= 8; a++) B.px(cx + s * a, top + 43, rk(R, 0.6));
    belt(B, g, pal, null, 'leather');
    return;
  }
  if (kind === 'shawl') {
    // A shawl over both shoulders, its ends falling down the front either side of the chest (out
    // over the arms beside a long beard), a woven border down their inner edges, a fringe at the ends.
    const long = look.beard === 'long';
    const [e0, e1] = long ? [9, 15] : [4, 10];
    const endFoot = long ? bottom : 47;
    for (let r = 22; r <= endFoot; r++) {
      const hw = bodyHW(r, pal.slim);
      for (let dx = -hw; dx <= hw; dx++) {
        const a = Math.abs(dx);
        const over = r <= 27 && a >= 4;
        const end = r > 27 && a >= e0 && a <= e1;
        if ((!over && !end) || !on(cx + dx, top + r)) continue;
        let k = dx < 0 ? 3 : 1.8;
        if (r <= 24 && dx < 0) k = 4;
        if (end && a === e0) k = dx < 0 ? 4 : 2.6;
        if (end && a === e0 + 1) k = dx < 0 ? 2.4 : 1;
        if (end && a === e1) k = dx < 0 ? 1.6 : 0.6;
        if (over && a === hw) k = dx < 0 ? 2 : 0.6;
        if (end && r >= endFoot - 1 && !long) k = (dx + r) % 2 ? 1 : 3;
        B.px(cx + dx, top + r, rk(R, k));
      }
    }
    if (look.dress && !long) {
      // A brooch at the throat.
      for (const [dx, dy, c] of [[0, 0, '#ff6a8a'], [-1, 0, '#f8d468'], [1, 0, '#b8862a'], [0, -1, '#f8d468'], [0, 1, '#b8862a']] as const) B.px(cx + dx, top + 27 + dy, c);
    }
    belt(B, g, pal, R, 'cord');
    return;
  }
  if (kind === 'tabard') {
    // A tabard of gold cloth down the front, cinched at the waist: a deep gold field lit along its left
    // edge and shaded down its right, a bright border inside its edges, soft folds where it hangs, a
    // sun worked on the chest.
    const T = new Tones(cx - 8, top + 26, 17, bottom - 24);
    for (let r = 27; r <= bottom; r++) {
      const hw = r < 30 ? 4 + (r - 27) : r < WAIST ? 6 : r <= WAIST + 2 ? 5 : 6;
      for (let dx = -hw; dx <= hw; dx++) {
        const a = Math.abs(dx);
        let k = dx <= 0 ? 2.6 : 2;
        if (a === hw) k = dx < 0 ? 3 : 1;
        else if (a === hw - 1 && r > 28) k = dx < 0 ? 4 : 3;
        if (r === 27) k = dx < 2 ? 4 : 3;
        if (r === 28 && a < hw - 1) k = 1;
        T.set(cx + dx, top + r, k);
      }
    }
    for (const [a, c, b] of [[[-2, 42], [-3, 45], [-2, 48]], [[2, 41], [2, 45], [3, 48]], [[-3, 52], [-3, 54], [-4, 57]], [[2, 52], [3, 54], [3, 57]]] as Array<[P, P, P]>) crease(T, cx, top, a, c, b, true);
    T.commit(B, R);
    const sy = top + 35;
    const SUN = ['#8a2e10', '#c8501a', '#ff8a2a', '#ffc860', '#fff0b0'];
    oval(B, cx, sy, 2.4, 2.4, (_x, _y, nx, ny) => rk(SUN, 2.8 - nx * 1.1 - ny * 1.1));
    for (const [dx, dy] of [[0, -4], [0, 4], [-4, 0], [4, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]]) B.px(cx + dx, sy + dy, dx + dy < 0 ? SUN[3] : SUN[1]);
    belt(B, g, pal, null, look.dress ? 'cord' : 'leather');
  }
}

/**
 * Something round the waist: a leather belt with a brass buckle, an apron's tie, or a twisted cord
 * knotted at the side with its ends hanging.
 */
function belt(B: Layer, g: Geo, pal: Pal, R: string[] | null, kind: 'leather' | 'tie' | 'cord'): void {
  const { cx, top } = g;
  const tw = bodyRow(WAIST, pal.slim).torso;
  if (kind === 'leather') {
    const L = ['#24140e', '#44281a', '#6a4228', '#8e5e38', '#b07a4a'];
    for (let dx = -tw; dx <= tw; dx++) {
      const sh = dx > tw - 4 ? 1 : 0;
      B.px(cx + dx, top + WAIST, rk(L, 3 - sh));
      B.px(cx + dx, top + WAIST + 1, rk(L, 2 - sh));
      B.px(cx + dx, top + WAIST + 2, rk(L, 0.6));
    }
    const BR = ['#5a3a10', '#b8862a', '#f0c850', '#fff0a8'];
    for (const [dx, dy, k] of [[-2, 0, 3], [-1, 0, 3], [0, 0, 2], [1, 0, 2], [-2, 1, 2], [1, 1, 1], [-2, 2, 1], [-1, 2, 1], [0, 2, 1], [1, 2, 0]] as const) B.px(cx + dx, top + WAIST + dy, BR[k]);
    B.px(cx - 1, top + WAIST + 1, L[0]);
    B.px(cx, top + WAIST + 1, L[1]);
    return;
  }
  const C = R ?? cel(['#6a4a10', '#b8862a', '#f0c850']);
  if (kind === 'tie') {
    for (let dx = -tw; dx <= tw; dx++) {
      B.px(cx + dx, top + WAIST, rk(C, dx < 3 ? 4 : 3));
      B.px(cx + dx, top + WAIST + 1, rk(C, 1));
    }
    return;
  }
  // A twisted cord: its twists lit on their upper left, knotted on the left with two ends hanging.
  for (let dx = -tw; dx <= tw; dx++) {
    const ph = (dx + 40) % 3;
    B.px(cx + dx, top + WAIST, rk(C, ph === 0 ? 4 : ph === 1 ? 3 : 2) );
    B.px(cx + dx, top + WAIST + 1, rk(C, ph === 2 ? 3 : ph === 0 ? 2 : 1));
  }
  const kx = cx - Math.round(tw * 0.55);
  for (const [dx, dy, k] of [[-1, -1, 3], [0, -1, 4], [1, -1, 3], [-1, 0, 4], [0, 0, 3], [1, 0, 2], [-1, 1, 2], [0, 1, 2], [1, 1, 1]] as const) B.px(kx + dx, top + WAIST + dy, rk(C, k));
  for (let i = 2; i <= 5; i++) {
    B.px(kx - 1 - Math.floor(i / 3), top + WAIST + i, rk(C, i % 2 ? 3 : 2));
    B.px(kx + 1, top + WAIST + i, rk(C, i % 2 ? 2 : 1));
  }
}

// ------------------------------------------------------------------ the head and face

const inHead = (dx: number, r: number) => r >= 0 && r < HEAD_H && Math.abs(dx) <= FACE[r];

/** The light on the face: lit and flat, a cool shadow down the far cheek and along the jaw. */
function skinK(dx: number, r: number): number {
  const hw = FACE[Math.max(0, Math.min(HEAD_H - 1, r))];
  const e = hw - dx;
  const sw = r < 6 ? 1 : r < 16 ? 2 : r < 19 ? 3 : 4;
  if (e < sw) return e < 1 && r >= 16 ? 1 : 2;
  if (r === HEAD_H - 1) return dx <= -1 ? 3 : 2;
  return 3;
}

function head(B: Layer, g: Geo, S: string[], spec: BustSpec): void {
  const { cx, top } = g;
  for (let r = 0; r < HEAD_H; r++) for (let dx = -FACE[r]; dx <= FACE[r]; dx++) B.px(cx + dx, top + r, S[skinK(dx, r)]);
  // The ears, at the eyes' height, the right one in shadow, a hollow in each.
  const look = spec.look;
  if (look.hat?.kind === 'hood' || look.hat?.kind === 'kettle') return;
  for (const s of [-1, 1]) {
    const lit = s < 0 ? 3 : 2;
    for (const [ax, r, k] of [[10, 12, lit], [10, 13, lit - 1], [11, 13, lit], [10, 14, lit - 1], [11, 14, lit], [10, 15, lit - 0.5], [11, 15, lit - 0.6], [10, 16, lit - 1]] as const) {
      B.px(cx + s * ax, top + r, S[Math.max(0, Math.round(k))]);
    }
  }
}

interface EyeOpts {
  iris: readonly string[];
  lash: string;
  lashes: boolean;
  look: number;
  glow: boolean;
  shut: boolean;
  old: boolean;
  stern: boolean;
  /** The skin at a pixel (for the lids). */
  lid: (x: number, y: number) => string;
  shade: string;
}

/*
 * The left eye (as you look), six wide and six tall from its lash line, its outer corner at column 0;
 * the right eye is its mirror (the glint stays on each iris's upper left: the light is on the left).
 * L lash   l soft lash   W white   w shaded white   D iris under the lid   M iris   B iris's lit foot
 * P pupil   s lid
 */
const EYE = ['LLLLL.', 'LDDDDl', 'wMPPDW', 'WMPPMW', '.BMMB.', '..BB..'];
const EYE_LASH = ['LLLLLl', 'LLDDDL', 'LMPPDW', 'wMPPMW', '.BMMB.', '..BB..'];
const EYE_STERN = ['......', 'LLLLLl', 'LDPPDW', 'wMPPMW', '.BMMB.', '..BB..'];
const EYE_OLD = ['......', 'LLLLL.', 'sDDDDl', 'wMPPMW', '.BMMB.', '......'];
const EYE_SHUT = ['......', '......', '......', 'L....l', '.LLLL.', '......'];
const EYE_SHUT_LASH = ['......', '......', '......', 'LL...l', '.LLLL.', '......'];

function eye(B: Layer, x0: number, y: number, s: -1 | 1, o: EyeOpts): void {
  const tpl = o.shut ? (o.lashes ? EYE_SHUT_LASH : EYE_SHUT) : o.old ? EYE_OLD : o.stern ? EYE_STERN : o.lashes ? EYE_LASH : EYE;
  const [d, m, l] = o.iris;
  // (A glowing eye keeps a dark slit of a pupil in its light.)
  const pupil = o.glow ? mixHex(d, PLUM, 0.7) : mixHex(d, PLUM, 0.55);
  // A glance: the iris (and pupil) slide a pixel, the white closing in behind.
  const at = (c: number, r: number): string => {
    const cc = s < 0 ? c : 5 - c;
    return tpl[r][cc];
  };
  const iris = (ch: string) => 'DMBP'.includes(ch);
  let glinted = false;
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      let ch = at(c, r);
      // Slide the iris for a glance: take the role from the next pixel over.
      if (o.look && !o.shut && r >= 1) {
        const src = at(Math.max(0, Math.min(5, c - o.look)), r);
        if (iris(src) || iris(ch)) ch = iris(src) ? src : 'W';
      }
      const X = x0 + c;
      const Y = y + r;
      if (o.shut) {
        // The lids down: skin over the eye, a little shade over the lash line.
        if (ch === '.') B.px(X, Y, r === 2 ? o.shade : o.lid(X, Y));
        else B.px(X, Y, ch === 'l' ? mixHex(o.lash, o.lid(X, Y), 0.45) : o.lash);
        continue;
      }
      if (ch === '.') continue;
      let col: string;
      switch (ch) {
        case 'L':
          col = o.lash;
          break;
        case 'l':
          col = mixHex(o.lash, o.lid(X, Y), 0.45);
          break;
        case 's':
          col = o.shade;
          break;
        case 'W':
          col = o.glow ? mixHex(m, PLUM, 0.6) : WHITE;
          break;
        case 'w':
          col = o.glow ? mixHex(m, PLUM, 0.75) : mixHex(WHITE, '#9a88b0', 0.42);
          break;
        case 'D':
          col = mixHex(d, o.lash, 0.35);
          break;
        case 'P':
          col = pupil;
          break;
        case 'B':
          col = l;
          break;
        default:
          col = m;
      }
      // The glint: the first iris pixel on the row under the lid's shadow.
      if (!glinted && r === 2 && iris(ch)) {
        col = GLINT;
        glinted = true;
      }
      if (o.glow && iris(ch)) B.gl(X, Y, col);
      else B.px(X, Y, col);
    }
  }
  // Lashes: a flick past the outer corner.
  if (o.lashes && !o.shut) {
    const ox = s < 0 ? x0 - 1 : x0 + 6;
    B.px(ox, y, o.lash);
    B.px(ox + (s < 0 ? -1 : 1), y - 1, mixHex(o.lash, o.lid(ox, y - 1), 0.4));
  }
  if (o.lashes && o.shut) B.px(s < 0 ? x0 - 1 : x0 + 6, y + 3, o.lash);
}

function face(B: Layer, g: Geo, spec: BustSpec, pal: Pal, shut: boolean): void {
  const { cx, top, eyeY } = g;
  const look = spec.look;
  const S = pal.skin;
  const lid = (x: number, y: number) => S[Math.min(3, skinK(x - cx, y - top))];
  const glow = spec.glowEyes;
  const ic = spec.iris ?? (look.eyes && look.eyes !== '#1a1020' ? look.eyes : '#a8682a');
  const iris = glow
    ? [mixHex(glow, '#c0400a', 0.45), glow, mixHex(glow, '#fff8d0', 0.6)]
    : [mixHex(ic, '#140a24', 0.42), ic, mixHex(ic, '#fff4dc', 0.5)];
  const lash = mixHex(PLUM, pal.hair[0], 0.2);
  for (const [i, s] of [-1, 1].entries()) {
    eye(B, cx + EYE_X[i], eyeY, s as -1 | 1, {
      iris,
      lash,
      lashes: !!spec.lashes,
      look: spec.look2 ?? 0,
      glow: !!glow,
      shut,
      old: !!spec.old,
      stern: spec.brows === 'stern',
      lid,
      shade: S[2],
    });
  }
  // The nose: one shadow pixel under its tip, the light on its bridge.
  B.px(cx + 1, top + NOSE_Y, S[2]);
  B.px(cx, top + NOSE_Y - 1, S[4]);
  // A soft blush under each eye (fainter on darker skin, where it would read as a patch).
  const dark = lum(S[3]) < 150;
  const blush = mixHex(S[3], '#ff5a78', dark ? 0.16 : 0.3);
  const blush2 = mixHex(S[3], '#ff5a78', dark ? 0.08 : 0.16);
  for (const s of [-1, 1]) {
    for (const ax of [5, 6, 7]) B.px(cx + s * ax, top + 17, ax === 6 ? blush : blush2);
    B.px(cx + s * 6, top + 18, blush2);
  }
  // The mouth: small, under the nose (lower when a mustache sits over it).
  const m = spec.mouth ?? 'smile';
  const my = top + MOUTH_Y + (look.beard === 'mustache' || look.beard === 'full' || look.beard === 'long' ? 1 : 0);
  const lip = spec.lashes ? mixHex(S[1], '#b02848', 0.45) : mixHex(S[0], '#6a1828', 0.3);
  const lipSoft = mixHex(lip, S[3], 0.5);
  if (m === 'grin') {
    // Open, the top teeth showing.
    B.px(cx - 2, my - 1, lipSoft);
    B.px(cx + 2, my - 1, lipSoft);
    for (let x = cx - 1; x <= cx + 1; x++) B.px(x, my, '#f4ece4');
    B.px(cx - 2, my, lip);
    B.px(cx + 2, my, lip);
    B.px(cx - 1, my + 1, lip);
    B.px(cx, my + 1, mixHex(lip, '#e06070', 0.5));
    B.px(cx + 1, my + 1, lip);
  } else if (m === 'smile') {
    B.px(cx - 2, my - 1, lipSoft);
    B.px(cx + 2, my - 1, lipSoft);
    for (let x = cx - 1; x <= cx + 1; x++) B.px(x, my, x === cx ? lip : mixHex(lip, lipSoft, 0.3));
  } else {
    for (let x = cx - 1; x <= cx + 1; x++) B.px(x, my, x === cx + 1 ? lipSoft : lip);
  }
  if (spec.old) {
    // Lines under the eyes and from the nose past the mouth.
    for (const s of [-1, 1]) {
      const x0 = cx + (s < 0 ? EYE_X[0] : EYE_X[1]);
      for (let c = 1; c <= 4; c++) B.px(x0 + c, eyeY + 6, mixHex(S[2], S[3], 0.4));
      B.px(cx + s * 4, my - 2, S[2]);
      B.px(cx + s * 5, my - 1, S[2]);
    }
  }
}

/**
 * The brows: thin strokes over the eyes carrying the mood, drawn over the fringe the way anime draws
 * them (white and bushy on the old sage).
 */
function brows(B: Layer, g: Geo, spec: BustSpec, pal: Pal): void {
  const { cx, eyeY } = g;
  const look = spec.look;
  const S = pal.skin;
  const bald = look.hairStyle === 'bald';
  const browR = bald || look.hairStyle === 'none' ? hairRamp(look.beardRamp ?? look.hair) : pal.hair;
  const bc = mixHex(browR[1], PLUM, 0.15);
  const bl = mixHex(browR[2], S[2], 0.35);
  const mood = spec.brows ?? 'soft';
  const bushy = look.beard === 'long';
  for (const [i, s] of [-1, 1].entries()) {
    const x0 = cx + EYE_X[i];
    // Five pixels from the outer end in: each one's lift above the lash line.
    const lift = bushy ? [3, 4, 4, 4, 3] : mood === 'raised' ? [3, 4, 5, 5, 4] : mood === 'stern' ? [3, 3, 2, 2, 1] : [2, 3, 3, 3, 3];
    for (let j = 0; j < 5; j++) {
      const x = s < 0 ? x0 + j : x0 + 5 - j;
      const y = eyeY - lift[j];
      B.px(x, y, j === 0 && !bushy ? bl : bushy ? rk(browR, s < 0 ? 3 : 2) : bc);
      if (bushy || mood === 'stern') B.px(x, y + 1, bushy ? rk(browR, s < 0 ? 2 : 1) : j === 0 || j === 4 ? bl : bc);
      if (bushy && j >= 1 && j <= 3) B.px(x, y - 1, rk(browR, 4));
    }
  }
}

// ------------------------------------------------------------------ hair

/** Where the hair's shine band runs: an arc across the crown, on the lit side, broken where locks overlap. */
function shine(T: Tones, cx: number, top: number, cy: number, R: number, x1: number): void {
  for (let y = T.y0; y < T.y0 + T.h; y++) {
    for (let x = T.x0; x < T.x0 + T.w; x++) {
      const k = T.get(x, y);
      if (Number.isNaN(k) || k < 1.6 || x - cx > x1) continue;
      const d = Math.hypot(x + 0.5 - cx - 1, y + 0.5 - top - cy) - R;
      if (Math.abs(d) < 0.62) T.set(x, y, x - cx < x1 - 5 ? 4 : 3, T.idAt(x, y));
      else if (d > 0 && d < 1.4 && k >= 2.5) T.set(x, y, 3, T.idAt(x, y));
    }
  }
}

/** The mass of hair over the skull under the locks: a dark cap from the crown down to `brow` at the middle and `side` at the temples. */
function cap(T: Tones, cx: number, top: number, brow: number, side: number, extra: number): void {
  for (let r = -2; r <= side; r++) {
    for (let dx = -14; dx <= 14; dx++) {
      const a = Math.abs(dx);
      const skull = r < 0 ? 4 - (r + 1) * 3 - 3 : FACE[Math.min(HEAD_H - 1, r)];
      if (a > skull + extra) continue;
      if (r < 0 && a > 7 + r * 2) continue;
      // Down the sides to `side`, at the middle only to `brow`, curving between.
      const reach = brow + (side - brow) * Math.min(1, Math.pow(a / 9, 2));
      if (r > reach) continue;
      T.set(cx + dx, top + r, dx < -2 ? 1.6 : 1.1, 0);
    }
  }
}

/** Hair that hangs behind the head and shoulders (a bob's back), painted before the body. */
function hairBack(B: Layer, g: Geo, look: NpcLook, H: string[]): void {
  const { cx, top } = g;
  if (look.hairStyle !== 'bob' || look.hat?.kind === 'hood') return;
  for (let r = 4; r <= 23; r++) {
    const hw = r < 8 ? 12 : r < 20 ? 13 : 13 - (r - 19);
    for (let dx = -hw; dx <= hw; dx++) B.px(cx + dx, top + r, rk(H, dx < 0 ? 1 : 0.6));
  }
}

/** Messy and spiky: three spikes off the crown, one out each side, locks over the ears, and a fringe
 * falling over the brow with one lock down between the eyes. */
const SHORT: readonly Lock[] = [
  { a: [-5, 6], c: [-11, 3], b: [-15, 5], w: 3.6, t: -0.2 },
  { a: [5, 6], c: [11, 4], b: [14, 7], w: 3.4, t: -0.4 },
  { a: [-2, 4], c: [-6, -1], b: [-9, -4], w: 3.9 },
  { a: [3, 4], c: [7, -1], b: [10, -3], w: 3.7, t: -0.2 },
  { a: [0, 5], c: [0, -2], b: [2, -6], w: 3.9, t: 0.1 },
  { a: [-7, 6], c: [-11, 10], b: [-11, 16], w: 3, t: -0.1 },
  { a: [7, 6], c: [11, 10], b: [11, 16], w: 3, t: -0.4 },
  { a: [-4, 2], c: [-8, 6], b: [-9, 11], w: 3.6 },
  { a: [5, 2], c: [8, 6], b: [8, 11], w: 3.6, t: -0.2 },
  { a: [-1, 2], c: [-4, 6], b: [-5, 10], w: 3.4, t: 0.1 },
  { a: [2, 2], c: [3, 7], b: [1, 13], w: 3.2 },
];

/** A bob: the crown, the sides falling straight past the cheeks to the jaw, a soft blunt fringe in four locks. */
const BOB: readonly Lock[] = [
  { a: [-6, 2], c: [-13, 10], b: [-11, 22], w: 3.6, t: -0.2 },
  { a: [6, 2], c: [13, 10], b: [11, 22], w: 3.6, t: -0.4 },
  { a: [-4, 3], c: [-10, 9], b: [-9, 20], w: 3.2 },
  { a: [4, 3], c: [10, 9], b: [9, 20], w: 3.2, t: -0.2 },
  { a: [-5, 1], c: [-7, 5], b: [-7, 10], w: 3 },
  { a: [5, 1], c: [6, 5], b: [6, 10], w: 3, t: -0.2 },
  { a: [-2, 1], c: [-3, 6], b: [-3, 10], w: 3, t: 0.1 },
  { a: [2, 1], c: [2, 6], b: [1, 10], w: 3 },
];

function hairDo(B: Layer, g: Geo, look: NpcLook, pal: Pal): void {
  const { cx, top } = g;
  const H = pal.hair;
  const S = pal.skin;
  const style = look.hairStyle;
  if (style === 'none') return;
  const T = new Tones(cx - 17, top - 9, 35, 36);
  if (style === 'bald') {
    // A shine on the crown, a tuft of hair over each ear (in locks), swept back.
    for (const [dx, r, k] of [[-5, 2, 4], [-4, 2, 4], [-6, 3, 4], [-5, 3, 4], [-3, 1, 4], [-7, 4, 4]] as const) B.px(cx + dx, top + r, S[k]);
    const TUFTS: Lock[] = [
      { a: [-7, 6], c: [-11, 9], b: [-10, 15], w: 2.4 },
      { a: [-6, 7], c: [-10, 11], b: [-11, 16], w: 1.8, t: -0.3 },
      { a: [7, 6], c: [11, 9], b: [10, 15], w: 2.4, t: -0.4 },
      { a: [6, 7], c: [10, 11], b: [11, 16], w: 1.8, t: -0.6 },
    ];
    paintLocks(T, cx, top, TUFTS, { id0: 1 });
    T.castLines(0.7);
    T.commit(B, H);
    return;
  }
  const helm = look.hat?.kind === 'kettle';
  if (style === 'short') {
    if (!helm) cap(T, cx, top, 4, 9, 1);
    paintLocks(T, cx, top, helm ? SHORT.filter((l) => Math.abs(l.b[0]) >= 11 && l.b[1] > 6) : SHORT, { id0: 1 });
  } else if (style === 'bob') {
    cap(T, cx, top, 4, 12, 2);
    paintLocks(T, cx, top, BOB, { id0: 1 });
  } else {
    // Pulled back into a bun (under a scarf): smooth bands from the brow back, parted in the middle.
    const BUN: Lock[] = [
      { a: [-1, 2], c: [-8, 3], b: [-11, 12], w: 3 },
      { a: [1, 2], c: [8, 3], b: [11, 12], w: 3, t: -0.3 },
      { a: [-2, 3], c: [-6, 6], b: [-10, 14], w: 2.2, t: 0.2 },
      { a: [2, 3], c: [6, 6], b: [10, 14], w: 2.2, t: -0.2 },
    ];
    paintLocks(T, cx, top, BUN, { id0: 1 });
  }
  T.castLines(0.6);
  if (!helm) shine(T, cx, top, 13, style === 'bob' ? 12.2 : 11.4, 3);
  T.commit(B, H);
  // The shadow the fringe casts on the brow.
  for (let x = T.x0; x < T.x0 + T.w; x++) {
    let low = -1;
    for (let y = T.y0 + T.h - 1; y >= T.y0; y--) {
      if (T.has(x, y)) {
        low = y;
        break;
      }
    }
    if (low < 0) continue;
    const dx = x - cx;
    const r = low + 1 - top;
    if (inHead(dx, r) && !T.has(x, low + 1) && r < EYE_Y) B.px(x, low + 1, S[Math.max(1, skinK(dx, r) - 1)]);
  }
}

// ------------------------------------------------------------------ beards

function beard(B: Layer, g: Geo, kind: NonNullable<NpcLook['beard']>, R: string[], S: string[]): void {
  const { cx, top, base } = g;
  if (kind === 'stubble') {
    for (let r = 19; r < HEAD_H; r++) for (let dx = -FACE[r] + 1; dx <= FACE[r] - 1; dx++) if (r > 20 || Math.abs(dx) >= 4) B.tint(cx + dx, top + r, R[1], 0.25);
    return;
  }
  const stache = () => {
    // Two thick curls under the nose, parted in the middle, their ends drooping past the mouth.
    const M = ['.aaaa.aaaa.', 'bbbbbcbbbbb', 'bc.......cb', 'c.........c'];
    M.forEach((row, i) => {
      for (let j = 0; j < row.length; j++) {
        if (row[j] === '.') continue;
        const dx = j - 5;
        B.px(cx + dx, top + 19 + i, rk(R, (row[j] === 'a' ? 3.6 : row[j] === 'b' ? 2.4 : 1) - (dx > 0 ? 0.5 : 0)));
      }
    });
  };
  if (kind === 'mustache') {
    stache();
    return;
  }
  if (kind === 'goatee') {
    stache();
    for (let r = 22; r <= 26; r++) for (let dx = -2; dx <= 2; dx++) if (r < 26 || Math.abs(dx) <= 1) B.px(cx + dx, top + r, rk(R, 2.6 - dx * 0.3));
    return;
  }
  // Full or long: from the sideburns down along the jaw and over the chin in locks (the long one
  // down the chest to the counter, tapering, with a slow wave), the cheeks clear above it.
  const long = kind === 'long';
  const T = new Tones(cx - 18, top + 8, 37, base - top + 2);
  const foot = long ? base - top + 1 : 31;
  const locks: Lock[] = long
    ? [
        { a: [-9, 14], c: [-12, 30], b: [-6, foot], w: 3.4, t: -0.2 },
        { a: [9, 14], c: [12, 30], b: [6, foot - 1], w: 3.4, t: -0.5 },
        { a: [-6, 19], c: [-9, 34], b: [-3, foot + 1], w: 3.4 },
        { a: [6, 19], c: [8, 34], b: [3, foot + 1], w: 3.4, t: -0.3 },
        { a: [-2, 21], c: [-4, 36], b: [0, foot + 2], w: 3.4, t: 0.15 },
        { a: [2, 21], c: [3, 34], b: [1, foot], w: 2.8, t: -0.1 },
      ]
    : [
        { a: [-9, 11], c: [-11, 22], b: [-7, 29], w: 2.8, t: -0.2 },
        { a: [9, 11], c: [11, 22], b: [7, 29], w: 2.8, t: -0.5 },
        { a: [-6, 18], c: [-7, 26], b: [-3, 31], w: 3 },
        { a: [6, 18], c: [7, 26], b: [3, 31], w: 3, t: -0.3 },
        { a: [0, 21], c: [-1, 27], b: [0, 32], w: 3, t: 0.15 },
      ];
  // The beard's mass under its locks, dark (what shows between them is more beard, not the robe),
  // tapering to a soft point.
  for (let r = 14; r <= foot - 1; r++) {
    const t = Math.max(0, (r - 21) / Math.max(1, foot - 21));
    const hw = r < 21 ? 12 : Math.round((long ? 12 : 11) - t * (long ? 7 : 8));
    for (let dx = -hw; dx <= hw; dx++) T.set(cx + dx, top + r, dx < -2 ? 1.6 : 1.1, 0);
  }
  paintLocks(T, cx, top, locks, { taper: 0.7, id0: 1 });
  T.castLines(0.7);
  // Clear the cheeks and the mouth: the beard starts along the jaw.
  for (let r = 8; r <= 24; r++) {
    for (let dx = -16; dx <= 16; dx++) {
      const a = Math.abs(dx);
      const cheek = r <= 15 ? (a <= 8 ? 1 : 0) : r <= 18 ? (a <= 7 ? 1 : 0) : r <= 19 ? (a <= 5 ? 1 : 0) : r <= 21 ? (a <= 2 ? 1 : 0) : 0;
      if (cheek) T.set(cx + dx, top + r, NaN);
    }
  }
  T.commit(B, R);
  stache();
  // The mouth shows through under the mustache.
  B.px(cx - 1, top + MOUTH_Y + 1, S[1]);
  B.px(cx, top + MOUTH_Y + 1, S[0]);
  B.px(cx + 1, top + MOUTH_Y + 1, S[1]);
}

// ------------------------------------------------------------------ glasses

function glasses(B: Layer, g: Geo): void {
  const { cx, eyeY } = g;
  // Thin round brass frames: lit along their top left, a darker step round their lower right, the
  // glass faintly bright with a glint low on it; a bridge over the nose, the arms back to the ears.
  const BR = ['#4a2a18', '#94642a', '#e0b056', '#fff4c0'];
  const RING = ['..xxxx..', '.x....x.', 'x......x', 'x......x', 'x......x', 'x......x', '.x....x.', '..xxxx..'];
  for (const [i, s] of [-1, 1].entries()) {
    const x0 = cx + EYE_X[i] - 1;
    const y0 = eyeY - 1;
    RING.forEach((row, ry) => {
      const a = row.indexOf('x');
      const z = row.lastIndexOf('x');
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] === 'x') B.px(x0 + rx, y0 + ry, rx + ry <= 5 ? BR[2] : rx + ry >= 10 ? BR[0] : BR[1]);
        else if (rx > a && rx < z) B.tint(x0 + rx, y0 + ry, '#e4f4ff', 0.12);
      }
    });
    B.px(x0 + 5, y0 + 6, mixHex(BR[3], '#dff2ff', 0.5));
    B.px(x0 + 6, y0 + 5, '#ffffff');
    for (let a = 10; a <= 11; a++) B.px(cx + s * a, eyeY + 1, BR[0]);
  }
  B.px(cx - 1, eyeY + 1, BR[1]);
  B.px(cx, eyeY, BR[2]);
  B.px(cx + 1, eyeY + 1, BR[0]);
}

// ------------------------------------------------------------------ hats

function hat(B: Layer, g: Geo, look: NpcLook, pal: Pal, spec: BustSpec): void {
  const { cx, top } = g;
  const h = look.hat!;
  const r = cel(h.ramp);
  const trim = h.trim ? cel([mixHex(h.trim[0], '#000000', 0.3), h.trim[0], h.trim[1]]) : null;
  if (h.kind === 'hood') {
    hood(B, g, r, trim, pal, spec);
    return;
  }
  if (h.kind === 'kerchief') {
    // A grey bun pinned up behind, peeking over the scarf.
    oval(B, cx - 6, top - 3, 4.5, 3.5, (_x, _y, nx, ny) => rk(pal.hair, 2.6 - nx * 0.9 - ny * 0.9 + (nx < -0.2 && ny < -0.2 ? 0.8 : 0)));
    B.px(cx - 8, top - 5, pal.hair[4]);
    // The scarf, wrapped over the crown: its edge runs across the brow and dips at the temples, a
    // folded hem along it, small light dots, knotted on top with two ears.
    const edge = (a: number) => (a <= 6 ? 5 : a <= 9 ? 6 : a <= 11 ? 8 : 10);
    for (let dx = -12; dx <= 12; dx++) {
      const a = Math.abs(dx);
      const t0 = a <= 4 ? -3 : a <= 7 ? -2 : a <= 9 ? -1 : a <= 11 ? 1 : 3;
      const bot = edge(a);
      for (let rr = t0; rr <= bot; rr++) {
        const hem = rr >= bot - 1;
        let k = dx <= 2 ? 3 : 2;
        if (rr <= t0 + 1 && dx < 0) k = 4;
        if (hem) k = rr === bot - 1 ? (dx <= 2 ? 4 : 3) : 1;
        if (a === 12 || (a === 11 && rr > 3)) k = Math.min(k, dx < 0 ? 2 : 1);
        let c = rk(r, k);
        if (!hem && rr >= 0 && (rr + 1) % 3 === 0 && (dx + 40 + (rr % 2 ? 0 : 2)) % 4 === 0) c = rk(r, Math.min(4, k + 1.6));
        B.px(cx + dx, top + rr, c);
      }
    }
    // The knot, up on the right, its two ears sticking out.
    oval(B, cx + 6, top - 3, 2.5, 2, (_x, _y, nx, ny) => rk(r, 2.6 - nx - ny * 0.6));
    for (const [dx, dy, k] of [[3, -6, 3], [4, -6, 2.6], [4, -5, 2.2], [2, -7, 3.4], [8, -5, 2.2], [9, -5, 1.8], [9, -6, 2.4], [10, -6, 1.8], [10, -7, 2]] as const) B.px(cx + dx, top + dy, rk(r, k));
    return;
  }
  if (h.kind === 'beret') {
    // A soft cap sitting on the crown, tipped down to the right over the hair, a band of gold trim
    // round it, a stalk on top.
    const ocx = cx + 2;
    const ocy = top;
    for (let y = ocy - 6; y <= ocy + 6; y++) {
      for (let x = ocx - 15; x <= ocx + 15; x++) {
        const nx = (x + 0.5 - ocx) / 14;
        const ny = (y + 0.5 - ocy - (x - ocx) * 0.14) / 4.6;
        if (nx * nx + ny * ny > 1) continue;
        let k = nx < 0.1 ? 3 : 2;
        if (ny < -0.4 && nx < 0) k = 4;
        if (ny > 0.36) k = 1;
        let c = rk(r, k);
        if (trim && ny > 0.46 && ny < 0.98 && nx > -0.94) c = rk(trim, nx < 0.2 ? 3 : 2);
        B.px(x, y, c);
      }
    }
    B.px(ocx + 1, ocy - 6, trim ? trim[3] : r[4]);
    B.px(ocx + 1, ocy - 5, trim ? trim[2] : r[3]);
    B.px(ocx + 2, ocy - 5, trim ? trim[1] : r[2]);
    return;
  }
  if (h.kind === 'kettle') {
    kettle(B, g, r);
    return;
  }
  if (h.kind === 'straw') {
    // A wide straw hat, its band in the trim.
    for (let y = top - 7; y <= top + 3; y++) {
      for (let x = cx - 17; x <= cx + 17; x++) {
        const dx = x - cx;
        const rr = y - top;
        const crown = rr <= -1 && Math.abs(dx) <= 9 - Math.max(0, -rr - 4) * 2;
        const brim = rr >= 0 && rr <= 2 && Math.abs(dx) <= 17 - rr;
        if (!crown && !brim) continue;
        let k = dx < 2 ? 3 : 2;
        if (brim) k = rr === 0 ? (dx < 0 ? 4 : 3) : rr === 2 ? 1 : 2;
        if (crown && rr >= -2 && trim) {
          B.px(x, y, rk(trim, dx < 0 ? 3 : 2));
          continue;
        }
        B.px(x, y, rk(r, k + ((x + y) % 3 === 0 && !brim ? -0.6 : 0)));
      }
    }
    return;
  }
  // Anything else: a simple cap.
  oval(B, cx, top + 2, 12, 6, (_x, y, nx, ny) => (y > top + 5 ? null : rk(r, 2.4 - nx - ny)));
}

/**
 * An iron kettle helm, polished: a round dome with a low ridge down its middle, a riveted band round
 * its foot and a wide brim. The light from the top left lays a bright streak across the dome and
 * leaves a dark core down its right; the brim shades the brow.
 */
function kettle(B: Layer, g: Geo, r: string[]): void {
  const { cx, top } = g;
  const SHINE = '#f2f6fc';
  const DOME = [5, 8, 10, 11, 12, 12, 13, 13, 13, 13];
  for (let i = 0; i < DOME.length; i++) {
    const rr = i - 5;
    for (let dx = -DOME[i]; dx <= DOME[i]; dx++) {
      const nx = dx / 13.5;
      const ny = (rr - 5) / 10;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const diff = Math.max(0, -nx * 0.55 - ny * 0.6 + nz * 0.58);
      let k = 0.3 + diff * 3.6;
      if (nx > 0.8) k += 0.7;
      if (rr < 3 && rr > -5) {
        if (dx === 0) k += 0.8;
        if (dx === 1) k -= 0.8;
      }
      let c = rk(r, k);
      const arc = Math.hypot(dx - 2, rr - 8) - 11.3;
      if (Math.abs(arc) < 0.6 && dx <= -2 && dx >= -9 && rr <= 1) c = dx >= -7 && dx <= -4 ? SHINE : r[4];
      if (rr === 3) c = rk(r, dx < 0 ? 1.6 : 1);
      if (rr === 4) c = rk(r, dx < 0 ? 3 : 2);
      B.px(cx + dx, top + rr, c);
    }
  }
  for (const dx of [-10, -5, 5, 10]) {
    B.px(cx + dx, top + 3, dx < 0 ? SHINE : r[4]);
    B.px(cx + dx + 1, top + 4, r[0]);
  }
  // The brim: its top lit, a bright lip, the underside in shadow.
  for (const [rr, hw, k0] of [[5, 16, 3.3], [6, 17, 2.4], [7, 16, 0.8]] as const) {
    for (let dx = -hw; dx <= hw; dx++) B.px(cx + dx, top + rr, rk(r, k0 - dx / (rr === 7 ? 30 : 16)));
  }
  B.px(cx - 13, top + 5, SHINE);
  B.px(cx - 12, top + 5, SHINE);
  for (let x = cx - 11; x <= cx + 11; x++) for (const rr of [8, 9]) if (inHead(x - cx, rr)) B.tone(x, top + rr, rr === 8 ? -0.36 : -0.18);
}

/** The hood's back and the cape over the shoulders, behind the head (painted before the body). */
function hoodBack(B: Layer, g: Geo, r: string[]): void {
  const { cx, top } = g;
  for (let rr = 4; rr <= 30; rr++) {
    const hw = rr < 22 ? 14 : 15 + Math.min(4, rr - 22);
    for (let dx = -hw; dx <= hw; dx++) B.px(cx + dx, top + rr, rk(r, 0.6));
  }
}

/**
 * The hood: round over the head with a soft point leaning right, its opening framing the face, falling
 * to a short cape over the shoulders; a trim round the opening and down the front.
 */
function hood(B: Layer, g: Geo, r: string[], trim: string[] | null, pal: Pal, spec: BustSpec): void {
  const { cx, top } = g;
  const deep = !!spec.glowEyes;
  // The opening: an oval round the face, its top just over the brow.
  const ocy = top + 13.5;
  const orx = 10.5;
  const ory = 11.8;
  const e = (x: number, y: number) => Math.pow((x + 0.5 - cx) / orx, 2) + Math.pow((y + 0.5 - ocy) / ory, 2);
  // The hood's outer half-width by row (from the skull's top): above, a soft point; widest at the cheeks.
  const HW = [9, 11, 12, 13, 13, 14, 14, 14, 14, 15, 15, 15, 15, 15, 15, 15, 15, 14, 14, 14, 13, 13];
  const spanAt = (rr: number): [number, number] | null => {
    if (rr < -5) return null;
    if (rr < 0) return [[1, 2], [-2, 4], [-5, 6], [-7, 8], [-8, 9]][rr + 5] as [number, number];
    if (rr < HW.length) return [-HW[rr], HW[rr]];
    return null;
  };
  // Hair under the hood: swept to the sides across the brow from a middle parting.
  for (let dx = -9; dx <= 9; dx++) {
    const a = Math.abs(dx);
    const b = 5 + Math.min(5, Math.round(a / 1.8));
    for (let rr = 2; rr <= b; rr++) {
      if (e(cx + dx, top + rr) >= 1) continue;
      let k = dx < 0 ? 3 : 2;
      if (rr === b) k = 1;
      if (a === 0) k = 1;
      if (rr === 4 && dx < -1 && dx > -6) k = 4;
      const c = rk(pal.hair, k);
      B.px(cx + dx, top + rr, deep ? mixHex(c, r[0], 0.45) : c);
    }
    if (inHead(dx, b + 1) && e(cx + dx, top + b + 1) < 1) B.px(cx + dx, top + b + 1, pal.skin[2]);
  }
  for (let rr = -5; rr < HW.length; rr++) {
    const span = spanAt(rr);
    if (!span) continue;
    const y = top + rr;
    for (let dx = span[0]; dx <= span[1]; dx++) {
      const x = cx + dx;
      const ee = e(x, y);
      if (ee < 1) {
        if (!inHead(dx, rr)) {
          // The hood's lining, dark beside the face.
          B.px(x, y, rk(r, 0));
          continue;
        }
        // The face in the hood's shadow, deepest under its brim: on the Oracle a deep violet dark
        // (her eyes shine out of it), on anyone else a shade round the opening's edge.
        const depth = (y - (ocy - ory)) / (2 * ory);
        if (deep) B.tint(x, y, r[0], 0.2 + Math.max(0, 0.42 - depth) * 1.1);
        else if (ee > 0.74 || depth < 0.2) B.tone(x, y, -0.2);
        continue;
      }
      let k = dx < 0 ? 3 : 2;
      if (rr < 3 && dx < 1) k = 4;
      if (Math.abs(dx) === span[1] && dx > 0) k = 1;
      // Folds falling from the crown.
      if ((dx === -6 && rr < 3 && rr > -3) || (dx === 6 && rr < 2 && rr > -3) || (Math.abs(dx) === 13 && rr > 8 && rr < 19)) k -= 1;
      B.px(x, y, rk(r, k));
      if (trim && ee < 1.32) B.px(x, y, rk(trim, ee > 1.17 ? (dx < 0 ? 2 : 1) : dx < 2 ? 3 : 2));
    }
  }
  // The cape over the shoulders and down the front, open below the chin, trimmed down its edges.
  const bottom = 32;
  for (let rr = 21; rr <= bottom; rr++) {
    const hw = bodyHW(rr, pal.slim) + (rr < 28 ? 1 : 0);
    const open = rr < 25 ? 0 : 2 + (rr - 25);
    for (let dx = -hw; dx <= hw; dx++) {
      const a = Math.abs(dx);
      if (rr < 24 && a <= 3) continue;
      if (rr >= 24 && a <= open) continue;
      let k = dx < 0 ? 3 : 2;
      if (rr <= 23 && dx < 0) k = 4;
      if (a === hw) k = dx < 0 ? 2 : 0.6;
      if (rr === bottom) k = 1;
      if ((dx === -11 || dx === 12) && rr > 25) k -= 1;
      B.px(cx + dx, top + rr, rk(r, k));
      if (trim && rr >= 24 && a <= open + 2) B.px(cx + dx, top + rr, rk(trim, a === open + 1 || a === open + 2 ? (dx < 0 ? 3 : 2) : 1));
    }
  }
}

// ------------------------------------------------------------------ arms, hands and tools (over the counter)

function arms(F: Layer, g: Geo, spec: BustSpec): void {
  const { cx, base } = g;
  const pal = palette(spec);
  const holdsStaff = isStaff(spec.tool);
  const b = bodyRow(base - g.top, pal.slim);
  const hx = Math.round((b.armIn + b.armOut) / 2);
  // The tool stands in the right hand.
  if (spec.tool && !holdsStaff) tool(F, cx + hx, base + 1, spec.tool);
  for (const s of [-1, 1] as const) {
    if (s > 0 && holdsStaff) continue;
    // The sleeve's end over the counter's edge, a cuff round the wrist.
    for (let dx = b.armIn; dx <= b.armOut; dx++) {
      for (const r of [-2, -1]) {
        const o = dx - b.armIn;
        const w = b.armOut - b.armIn;
        let k = pal.bare ? armK(o, w, s < 0) : r === -2 ? (s < 0 ? 4 : 3) : s < 0 ? 3 : 2;
        if (!pal.bare && (o === 0 || o === w)) k -= 1;
        F.px(cx + s * dx, base + r, rk(pal.arm, k));
      }
    }
    hand(F, cx + s * hx, base, s, pal.skin, !!spec.tool && s > 0);
  }
}

/**
 * A hand resting on the counter, seen from a little above: the back of the hand lit, the fingers
 * lying toward you with a shadow between each, the thumb along its inner side. Holding a tool, a fist
 * round the handle instead, the knuckles in a row.
 */
function hand(F: Layer, x: number, y: number, s: -1 | 1, S: string[], fist: boolean): void {
  // Rows from the wrist down; columns from the outer side in (mirrored for the right hand).
  //   H back of the hand, lit   h its shaded side   g a gap between fingers   f a fingertip
  //   t the thumb   n a knuckle
  const OPEN = ['.HHHh.', 'HHHHht', 'hghghT', '.f.f.t'];
  const FIST = ['.HHHh.', 'HnnnnT', 'hhhhht', '.fff..'];
  const rows = fist ? FIST : OPEN;
  const at = (i: number) => (s < 0 ? i - 3 : 2 - i);
  rows.forEach((row, ry) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      let k = ch === 'H' ? 4 : ch === 'n' ? 4 : ch === 'g' ? 1 : ch === 'T' ? 3 : ch === 't' ? 2 : ch === 'f' ? 2 : 3;
      if (s > 0) k -= ch === 'H' || ch === 'n' ? 1 : ch === 'g' ? 0 : 0.6;
      F.px(x + at(i), y + ry, S[Math.max(0, Math.min(4, Math.round(k)))]);
    }
  });
}

/** A tall staff (or spear, or orb staff) standing at the keeper's right, held in the right hand. */
function staff(B: Layer, g: Geo, kind: 'staff' | 'spear' | 'orbStaff'): void {
  const WOOD = ['#2a160c', '#4a2c18', '#6e4426', '#946a40', '#b88c5a'];
  const METAL = ['#2a2a34', '#4c4c5c', '#7a7a8e', '#b0b0c2', '#e6e8f0'];
  const x = g.cx + STAFF_DX;
  const y0 = g.base + 2;
  const y1 = g.top + (kind === 'spear' ? 4 : 1);
  for (let y = y1; y <= y0; y++) {
    B.px(x, y, rk(WOOD, 3 + (y % 7 === 0 ? -1 : 0)));
    B.px(x + 1, y, rk(WOOD, 1.6));
  }
  if (kind === 'spear') {
    // A leaf-shaped head with a ridge down its middle (lit left, shaded right), a brass collar on
    // its socket, and a red tassel hanging under it.
    const SPEAR = ['..A..', '..Ab.', '.aAb.', '.aAbc', 'aaAbc', 'aaAbc', '.aAb.', '..Ab.', '..Bb.'];
    const SC: Record<string, string> = { A: '#f2f6fc', a: METAL[3], b: METAL[2], c: METAL[1], B: METAL[1] };
    SPEAR.forEach((row, i) => {
      for (let j = 0; j < row.length; j++) if (row[j] !== '.') B.px(x - 2 + j, y1 - 10 + i, SC[row[j]]);
    });
    for (let dx = -1; dx <= 2; dx++) B.px(x + dx, y1 - 1, rk(['#5a3a10', '#b8862a', '#f0c850'], 2.2 - dx / 2));
    for (let dx = -1; dx <= 2; dx++) B.px(x + dx, y1, rk(['#5a3a10', '#b8862a', '#f0c850'], 1.2 - dx / 3));
    for (const [dx, dy, c] of [[-1, 1, '#6a1a14'], [-1, 2, '#c8382a'], [-2, 2, '#e05a40'], [-1, 3, '#a8302a'], [-2, 3, '#c8382a'], [-2, 4, '#a8302a'], [-1, 4, '#6a1a14'], [-2, 5, '#6a1a14']] as const) B.px(x + dx, y1 + dy, c);
  } else if (kind === 'orbStaff') {
    oval(B, x + 0.5, y1 - 4, 3.6, 3.6, (xx, yy, nx, ny) => {
      B.gl(xx, yy, rk(['#3a1a6a', '#6a3ab8', '#9a6af0', '#d0b0ff', '#fff4ff'], 2.6 - nx * 1.2 - ny * 1.2));
      return null;
    });
    for (let dx = -1; dx <= 2; dx++) B.px(x + dx, y1, rk(['#5a3a10', '#b8862a', '#f0c850'], 1.6 - dx / 3));
    B.light(x, y1 - 4, 34, '#b08aff', 0.55, 0.15);
  } else {
    // The sage's staff: a crook at the top, a band of brass.
    for (const [dx, dy] of [[0, -1], [0, -2], [1, -3], [2, -3], [3, -2], [3, -1], [3, 0], [4, -2]]) B.px(x + dx, y1 + dy, rk(WOOD, dx === 4 ? 1.6 : 3.2));
    B.px(x, y1 + 6, '#f0c850');
    B.px(x + 1, y1 + 6, '#b8862a');
  }
}

/** A tool standing up from the right hand at (x, y): its handle in the fist, the business end high. */
function tool(F: Layer, x: number, y: number, kind: BustTool): void {
  const METAL = ['#2a2a34', '#4c4c5c', '#7a7a8e', '#b0b0c2', '#e6e8f0'];
  const WOOD = ['#2a160c', '#4a2c18', '#6e4426', '#946a40', '#b88c5a'];
  const BRASS = ['#3a200c', '#8a5a1a', '#c8902a', '#f0c850', '#fff0a8'];
  const v = (x0: number, y0: number, y1: number, ramp: string[], k = 2) => {
    for (let yy = y0; yy <= y1; yy++) {
      F.px(x0, yy, rk(ramp, k + 0.8));
      F.px(x0 + 1, yy, rk(ramp, k - 0.6));
    }
  };
  if (kind === 'wrench') {
    v(x, y - 12, y, METAL, 2.4);
    for (const [dx, dy] of [[-2, -13], [-2, -14], [-2, -15], [-1, -16], [0, -16], [1, -16], [2, -16], [3, -15], [3, -14], [3, -13], [2, -12], [-1, -12]]) F.px(x + dx, y + dy, rk(METAL, dx < 1 ? 3.6 : 2));
    return;
  }
  if (kind === 'hammer') {
    v(x, y - 10, y, WOOD, 2.6);
    const IRON = ['#141418', '#24242c', '#3a3a46', '#585866', '#8a8a9a'];
    for (let dy = -15; dy <= -11; dy++) {
      for (let dx = -3; dx <= 5; dx++) {
        let k = 2.1 - dx / 7 + (dy === -15 ? 1.3 : 0) - (dy === -11 ? 0.9 : 0);
        if (dx === -3 || dx === 5) k -= 0.7;
        F.px(x + dx, y + dy, rk(IRON, k));
      }
    }
    for (let dy = -14; dy <= -12; dy++) F.px(x + 6, y + dy, rk(IRON, 3.4));
    return;
  }
  if (kind === 'tongs') {
    for (let dy = -15; dy <= 0; dy++) {
      const spread = dy < -10 ? Math.floor((-10 - dy) / 2) : 0;
      F.px(x - spread, y + dy, rk(METAL, 3));
      F.px(x + 1 + spread, y + dy, rk(METAL, 1.8));
    }
    return;
  }
  if (kind === 'magnifier') {
    v(x, y - 7, y, WOOD, 2.6);
    oval(F, x + 1, y - 12, 4.6, 4.6, (_xx, _yy, nx, ny) => {
      const d = nx * nx + ny * ny;
      if (d > 0.58) return rk(BRASS, 2.6 - nx - ny);
      return mixHex('#a8d8e8', '#ffffff', nx < -0.15 && ny < -0.15 ? 0.6 : 0.1);
    });
    return;
  }
  if (kind === 'quill') {
    for (let i = 0; i < 14; i++) {
      F.px(x + Math.floor(i / 3), y - i, i < 4 ? '#3a2a24' : rk(['#c8c0b0', '#e8e2d6', '#fffaf2'], 1 + (i % 2)));
      if (i >= 5) F.px(x + 1 + Math.floor(i / 3), y - i, rk(['#b0a898', '#d8d0c2', '#f2ece0'], 1));
    }
    return;
  }
  if (kind === 'candle') {
    // A candle in a brass dish, its flame glowing.
    for (let dx = -2; dx <= 3; dx++) F.px(x + dx, y - 3, rk(BRASS, 2.6 - dx / 3));
    for (let dy = -10; dy <= -4; dy++) {
      F.px(x, y + dy, '#fff4e0');
      F.px(x + 1, y + dy, '#d4bf9c');
    }
    F.px(x - 1, y - 8, '#f4e6cc');
    F.px(x, y - 11, '#3a2a24');
    F.gl(x, y - 12, '#ffb040');
    F.gl(x, y - 13, '#ffe080');
    F.gl(x + 1, y - 13, '#ffd060');
    F.gl(x, y - 14, '#fff4c0');
    F.gl(x, y - 15, '#ffe080');
    F.light(x, y - 13, 30, '#ffb060', 0.5, 0.3);
  }
}
