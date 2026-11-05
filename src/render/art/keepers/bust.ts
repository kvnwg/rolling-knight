/**
 * A keeper drawn big, from the waist up behind their counter: the same person as their little hub
 * sprite (art/hubNpcs.ts: the skin, hair, beard, glasses, hat, shirt and panel come from their NpcLook)
 * and, like it, a chibi: a big round head, about three fifths of the figure above the counter, on a
 * small narrow body with short shoulders, stubby forearms and mitten hands resting on the counter.
 * Up close the face gets big eyes with lash lines and glints, set a little below the middle of the
 * face, a tiny nose, a small mouth, a soft blush and small ears; hair comes in chunky locks with a
 * clear sheen; a hood has its shadowed opening and trim; cloth its folds, collar, buttons and seams.
 * Lit from the top left like the rest of the game's art (the scene's lamps do the rest: light.ts),
 * with a dark line round the figure and lighter lines inside it.
 *
 * Painted in two passes round the counter: `paintBust` draws the head and body (the counter, painted
 * after, hides the body's foot), and the `front` it returns draws what rests on the counter top in
 * front of it: the forearms, the hands and whatever they hold.
 */
import type { NpcLook, Ramp3 } from '../../../world/npcs';
import { mixHex } from '../draw';
import { Layer, oval, rk } from '../hubKit';
import { figureMask } from './light';

export type BustTool = 'wrench' | 'hammer' | 'tongs' | 'candle' | 'quill' | 'staff' | 'spear' | 'magnifier' | 'orbStaff';

export interface BustSpec {
  look: NpcLook;
  /** Lines round the eyes and a softer jaw. */
  old?: boolean;
  /** Lashes and rosier lips. */
  lashes?: boolean;
  /** Eyes that glow in the dark of a hood (the Oracle's). */
  glowEyes?: string;
  /** The hand on the right (as you look) holds this, upright on the counter. */
  tool?: BustTool;
  /** Looks a little to one side: -1 left, 1 right (moves the eyes). */
  look2?: -1 | 0 | 1;
  /** A smile (default), a flat mouth, or a grin. */
  mouth?: 'smile' | 'flat' | 'grin';
  /** The brows: soft (default), raised (bright and curious) or stern (drawn down toward the nose). */
  brows?: 'soft' | 'raised' | 'stern';
}

/** Five steps from a look's three: deep shadow, shadow, mid, light, highlight. */
function ramp5(r: Ramp3): string[] {
  return [mixHex(r[0], '#1a0a12', 0.45), r[0], r[1], r[2], mixHex(r[2], '#fff6ea', 0.38)];
}
/** Four from a look's two (panels): shadow, mid, light, highlight. */
function ramp4(r: readonly [string, string]): string[] {
  return [mixHex(r[0], '#1a0a12', 0.35), r[0], r[1], mixHex(r[1], '#fff6ea', 0.3)];
}

const INK = '#1e0f12';
const WHITE = '#f8f2ea';
const GLINT = '#fffdf6';

/** The head's half-width on each row from its top: a big round skull, full cheeks, a small soft chin. */
const HEAD = [5, 8, 10, 11, 12, 13, 13, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 13, 13, 12, 12, 11, 10, 8, 6, 3];
const HEAD_H = HEAD.length;
/** From the skull's top down to the counter top (the hair is two rows higher). */
const FIG_H = 48;
/** Hair's half-width on the rows from two above the skull: the volume it has round the head. */
const HAIR_HW = [6, 8, 10, 11, 12, 13, 14, 15, 15, 16];
/** How far right of the middle a tall staff stands (held in the right hand). */
const STAFF_DX = 20;
/** The eyes' left columns, from the middle (each is six wide). */
const EYE_X = [-9, 4] as const;

/** Where everything sits, from the bust's middle (cx) and the counter top (base). */
export function bustGeometry(cx: number, base: number) {
  const top = base - FIG_H;
  return {
    cx,
    base,
    /** The skull's top row (hair and hats go higher). */
    top,
    /** The eyes' top row (their lash line): they sit a little below the head's middle. */
    eyeY: top + 13,
    /** The mouth's row. */
    mouthY: top + 22,
    /** The chin's row. */
    chin: top + HEAD_H - 1,
    /** The shoulders' top, beside the jaw (the head sits right on them). */
    sy: top + 24,
  };
}
type Geo = ReturnType<typeof bustGeometry>;

export interface BustOut {
  /** Paints the arms, hands and anything held, over the counter top. Call after the counter. */
  front: (L: Layer) => void;
  /** The eyes' pixels shut (a blink): [x, y, color]. */
  blink: Array<[number, number, string]>;
}

const isStaff = (t?: BustTool): t is 'staff' | 'spear' | 'orbStaff' => t === 'staff' || t === 'spear' || t === 'orbStaff';

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
      const A = new Layer(cx - 34, base - 34, 69, 42);
      arms(A, g, spec);
      selOutline(A);
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
  const B = new Layer(cx - 40, top - 40, 81, base - top + 46);
  const look = spec.look;
  const skin = ramp5(look.skin);
  const hair = ramp5(look.hair);
  const shirt = ramp5(look.shirt);
  const bare = !!look.sleeves && look.sleeves[1] === look.skin[1];
  const arm = bare ? skin : ramp5(look.sleeves ?? look.shirt);
  body(B, g, shirt, arm, bare, !!look.sleeves && !bare);
  collar(B, g, look, shirt, skin);
  if (look.panel) panel(B, g, look.panel.kind, ramp4(look.panel.ramp), look);
  if (look.sleeves && !bare) pauldrons(B, g, arm);
  head(B, g, skin);
  ears(B, g, skin, look);
  face(B, g, spec, skin, hair, shut);
  hairDo(B, g, look, hair, skin);
  if (look.beard) beard(B, g, look.beard, ramp5(look.beardRamp ?? look.hair));
  if (look.glasses) glasses(B, g);
  if (look.hat) hat(B, g, look, ramp5(look.hat.ramp), look.hat.trim ? ramp4(look.hat.trim) : null, hair, spec);
  if (isStaff(spec.tool)) staff(B, g, spec.tool);
  selOutline(B);
  return B;
}

// ------------------------------------------------------------------ outlines

/**
 * The figure's outline, drawn on the clear pixels round it: each takes its darkest neighbour's
 * colour pushed far toward a deep purple-black, a touch lighter on the side the light comes from
 * (top left) than on the shadowed side. Lines inside the figure are painted as darker steps of their
 * own colours, never this ink.
 */
function selOutline(L: Layer): void {
  const src = L.buf.px.slice();
  const W = L.w;
  const H = L.h;
  const NB = [[1, 0, true], [0, 1, true], [-1, 0, false], [0, -1, false]] as const;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (src[(y * W + x) * 4 + 3]) continue;
      let best = -1;
      let bl = 1e9;
      let lit = false;
      let shaded = false;
      for (const [dx, dy, l] of NB) {
        const X = x + dx;
        const Y = y + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const i = (Y * W + X) * 4;
        if (!src[i + 3]) continue;
        if (l) lit = true;
        else shaded = true;
        const lum = src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11;
        if (lum < bl) {
          bl = lum;
          best = i;
        }
      }
      if (best < 0) continue;
      const t = lit && !shaded ? 0.7 : 0.8;
      const o = (y * W + x) * 4;
      L.buf.px[o] = Math.round(src[best] * (1 - t) + 18 * t);
      L.buf.px[o + 1] = Math.round(src[best + 1] * (1 - t) + 10 * t);
      L.buf.px[o + 2] = Math.round(src[best + 2] * (1 - t) + 20 * t);
      L.buf.px[o + 3] = 255;
    }
  }
}

// ------------------------------------------------------------------ the body

/** The shoulders' outer half-width on the rows down from their top: short and round. */
const SHOULDER = [7, 9, 11, 12];
const shoulderHW = (d: number) => SHOULDER[Math.max(0, Math.min(SHOULDER.length - 1, d))];

function body(B: Layer, g: Geo, shirt: string[], arm: string[], bare: boolean, mail: boolean): void {
  const { cx, sy, base } = g;
  for (let y = sy; y <= base + 4; y++) {
    const d = y - sy;
    const hw = shoulderHW(d);
    for (let dx = -hw; dx <= hw; dx++) {
      const x = cx + dx;
      const a = Math.abs(dx);
      if (a >= 8) {
        // An upper arm, hanging close at the side, round: lit down its left, the right arm in shadow,
        // the shoulder's cap catching the light; the crease against the chest a darker step.
        const t = (a - 8) / 4;
        let k = dx < 0 ? 1.9 + t * 1.3 : 2.1 - t * 1.0;
        if (d <= 3) k += 0.6;
        if (a === 8 && d > 2) k = dx < 0 ? 1.3 : 1.2;
        // A fold where the elbow bends.
        if (y === base - 6 && a >= 9 && a <= 10) k -= 0.7;
        // Bare arms: a lit bicep. Mail sleeves: rows of rings, each row's tops catching the light.
        if (bare && dx < 0 && a === 10 && d >= 5 && d <= 9) k += 0.6;
        if (mail && a > 8 && d > 5) {
          const q = (d - 6) >> 1;
          k += (d - 6) % 2 ? -0.75 : (dx + q * 2 + 30) % 3 === 0 ? -0.85 : 0;
        }
        B.px(x, y, rk(arm, k));
      } else {
        // The chest: lit from the left, the tops of the shoulders brighter, a soft fold either side.
        let k = 2.55 - dx / 10;
        if (d <= 1) k += 0.5;
        if ((dx === -5 || dx === 4) && d >= 12) k -= 0.5;
        B.px(x, y, rk(shirt, k));
      }
    }
  }
}

/**
 * Steel plates over a mailed warden's shoulders: each a low dome lit on its top left, its lower edge
 * rolled (a bright line over a dark one), a rivet at its peak.
 */
function pauldrons(B: Layer, g: Geo, r: string[]): void {
  const { cx, sy } = g;
  for (const s of [-1, 1]) {
    const pcx = cx + s * 10;
    const pcy = sy + 2.5;
    for (let y = sy - 2; y <= sy + 7; y++) {
      for (let x = pcx - 6; x <= pcx + 6; x++) {
        const nx = (x + 0.5 - pcx) / 4.9;
        const ny = (y + 0.5 - pcy) / 3.9;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        let k = 3.1 - nx * 0.9 - ny * 1.3 - (s > 0 ? 0.6 : 0);
        if (ny > 0.2 && d > 0.52) k = d > 0.8 ? 0.6 : 3.7 - nx * 0.5 - (s > 0 ? 0.6 : 0);
        B.px(x, y, rk(r, k));
      }
    }
    B.px(pcx - 1, sy + 1, s < 0 ? '#f2f6fc' : r[4]);
    B.px(pcx, sy + 2, r[0]);
  }
}

function collar(B: Layer, g: Geo, look: NpcLook, shirt: string[], skin: string[]): void {
  const { cx, sy } = g;
  // The throat in the chin's shadow.
  for (let x = cx - 2; x <= cx + 2; x++) B.px(x, sy + 3, rk(skin, 1));
  if (look.dress) {
    // A robe's round neckline.
    for (let x = cx - 3; x <= cx + 3; x++) B.px(x, sy + 4, rk(shirt, Math.abs(x - cx) === 3 ? 1.6 : 3.4 - (x - cx) * 0.3));
    return;
  }
  // A shirt's open neck: a V of skin, the collar's two points either side of it.
  for (let x = cx - 1; x <= cx + 1; x++) B.px(x, sy + 4, rk(skin, 1.8 - (x - cx) * 0.3));
  B.px(cx, sy + 5, rk(skin, 1.6));
  for (const s of [-1, 1]) {
    const k = s < 0 ? 3.8 : 2.6;
    for (const [ax, ay] of [[2, 3], [3, 3], [4, 3], [2, 4], [3, 4], [1, 5], [2, 5], [1, 6]] as const) B.px(cx + s * ax, sy + ay, rk(shirt, k - (ay - 3) * 0.3));
    // The collar's edge, a darker line under it.
    for (const [ax, ay] of [[5, 4], [4, 5], [3, 6], [2, 7]] as const) B.px(cx + s * ax, sy + ay, rk(shirt, 1.4));
  }
  B.px(cx, sy + 6, rk(shirt, 1.2));
}

function panel(B: Layer, g: Geo, kind: NonNullable<NpcLook['panel']>['kind'], r: string[], look: NpcLook): void {
  const { cx, sy, base } = g;
  const bottom = base + 4;
  if (kind === 'apron' || kind === 'bib') {
    // A bib from the chest down, its straps up over the chest to the neck, a pocket with a pencil.
    const t = sy + 8;
    for (let y = t; y <= bottom; y++) {
      const hw = y === t ? 5 : 6;
      for (let dx = -hw; dx <= hw; dx++) {
        let k = 2.1 - dx / 14;
        if (y === t) k += 0.8;
        if (dx === hw) k -= 0.8;
        if (dx === -hw) k += 0.4;
        B.px(cx + dx, y, rk(r, k));
      }
    }
    for (const s of [-1, 1]) {
      for (let i = 1; i <= 6; i++) {
        const x = cx + s * (5 - Math.floor(i / 3));
        B.px(x, t - i, rk(r, s < 0 ? 2.4 : 1.5));
      }
      // A brass rivet where each strap meets the bib.
      B.px(cx + s * 4, t + 1, s < 0 ? '#f0c850' : '#b8862a');
    }
    // The pocket: stitched edges, a pencil standing in it.
    const py = t + 5;
    for (let x = cx - 3; x <= cx + 3; x++) {
      B.px(x, py, rk(r, 3));
      B.px(x, py + 1, rk(r, 0.9));
      B.px(x, py + 5, rk(r, 0.9));
    }
    for (let y = py + 1; y <= py + 5; y++) {
      B.px(cx - 3, y, rk(r, 2.6));
      B.px(cx + 3, y, rk(r, 0.8));
    }
    B.px(cx + 1, py - 3, '#3a2a24');
    B.px(cx + 1, py - 2, '#e8c040');
    B.px(cx + 1, py - 1, '#e8c040');
    B.px(cx + 1, py, '#c89030');
    return;
  }
  if (kind === 'vest') {
    // An open vest: two fronts either side of the shirt, meeting lower down, buttons down one edge,
    // a pocket welt on each side.
    for (let y = sy + 2; y <= bottom; y++) {
      const d = y - sy;
      const open = Math.max(1, 5 - Math.floor(d / 3));
      for (const s of [-1, 1]) {
        for (let a = open; a <= 7; a++) {
          let k = 2.3 - (s * a) / 9;
          if (a === open) k += s < 0 ? 1 : -0.7;
          if (a === 7) k -= 0.6;
          if (d <= 3) k += 0.4;
          B.px(cx + s * a, y, rk(r, k));
        }
      }
      if (d >= 8 && d % 4 === 0) B.px(cx - open - 1, y, '#f0c850');
      if (d >= 8 && d % 4 === 1) B.px(cx - open - 1, y, '#9a6a1a');
    }
    for (const s of [-1, 1]) for (let a = 3; a <= 6; a++) B.px(cx + s * a, sy + 16, rk(r, 0.6));
    return;
  }
  if (kind === 'shawl') {
    // A shawl over both shoulders, its ends falling down the front either side of the chest (out over
    // the arms, beside a long beard), a woven border down their outer edges.
    const [e0, e1] = look.beard === 'long' ? [8, 12] : [3, 7];
    for (let y = sy; y <= bottom; y++) {
      const d = y - sy;
      for (let dx = -12; dx <= 12; dx++) {
        const a = Math.abs(dx);
        const over = d <= 4 && a >= 2 && a <= shoulderHW(d);
        const end = d > 4 && a >= e0 && a <= e1;
        if (!over && !end) continue;
        let k = 2.3 - dx / 12;
        if (end && a === e0) k += dx < 0 ? 0.9 : -0.6;
        if (end && a === e1) k -= 0.6;
        if (end && a === e1 - 1) k -= 0.35;
        if (d <= 1) k += 0.5;
        B.px(cx + dx, y, rk(r, k));
      }
    }
    if (look.dress) {
      // A brooch at the throat.
      B.px(cx, sy + 4, '#ff6a8a');
      B.px(cx - 1, sy + 4, '#f8d468');
      B.px(cx + 1, sy + 4, '#b8862a');
      B.px(cx, sy + 3, '#f8d468');
      B.px(cx, sy + 5, '#b8862a');
    }
    return;
  }
  if (kind === 'tabard') {
    // A tabard down the front: its edges lit on the left and shaded on the right, a border worked a
    // step darker just inside them, a lit hem at the neck, and a sun on the chest.
    for (let y = sy + 4; y <= bottom; y++) {
      for (let dx = -6; dx <= 6; dx++) {
        const a = Math.abs(dx);
        let k = 2.25 - dx / 11;
        if (a === 6) k = dx < 0 ? 3 : 0.6;
        else if (a === 5 && y > sy + 4) k -= 0.75;
        if (y === sy + 4) k = 3.2 - dx / 12;
        B.px(cx + dx, y, rk(r, k));
      }
    }
    const syy = sy + 12;
    const SUN = ['#8a2e10', '#c8501a', '#ff8a2a', '#ffc860', '#fff0b0'];
    oval(B, cx, syy, 2.6, 2.6, (_x, _y, nx, ny) => rk(SUN, 2.8 - nx * 1.1 - ny * 1.1));
    for (const [dx, dy] of [[0, -4], [0, 4], [-4, 0], [4, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]]) B.px(cx + dx, syy + dy, dx + dy < 0 ? SUN[2] : SUN[1]);
  }
}

// ------------------------------------------------------------------ the head and face

/** The light on the face at a head pixel, as a ramp5 index: broad and even, rounding off into shadow down the right and under the jaw. */
function skinK(dx: number, r: number): number {
  const hw = HEAD[Math.max(0, Math.min(HEAD_H - 1, r))] + 0.5;
  const nx = dx / hw;
  return 3.2 - Math.max(0, nx - 0.66) * 3.4 - Math.max(0, r - 21) * 0.24;
}
const inHead = (dx: number, r: number) => r >= 0 && r < HEAD_H && Math.abs(dx) <= HEAD[r];

function head(B: Layer, g: Geo, skin: string[]): void {
  const { cx, top } = g;
  for (let r = 0; r < HEAD_H; r++) for (let dx = -HEAD[r]; dx <= HEAD[r]; dx++) B.px(cx + dx, top + r, rk(skin, skinK(dx, r)));
}

function ears(B: Layer, g: Geo, skin: string[], look: NpcLook): void {
  const { cx, top } = g;
  if (look.hat?.kind === 'hood' || look.hairStyle === 'bob') return;
  // Small round ears at the eyes' height, the right one in shadow, a hollow in each.
  for (const s of [-1, 1]) {
    const lit = s < 0 ? 3 : 1.8;
    for (const [ax, rr, k] of [[15, 14, lit], [15, 15, lit - 0.9], [16, 15, lit], [15, 16, lit - 0.9], [16, 16, lit - 0.3], [15, 17, lit - 0.4]] as const) B.px(cx + s * ax, top + rr, rk(skin, k));
  }
}

interface EyeOpts {
  iris: readonly string[];
  lash: string;
  lashes: boolean;
  look: number;
  glow: boolean;
  shut: boolean;
  /** The skin at a pixel (for the lids). */
  lid: (x: number, y: number) => string;
  shadow: string;
  /** A heavier upper lid over the iris (a stern look). */
  heavy: boolean;
}

/**
 * One eye, six pixels wide and six tall, its lash line on row y; `s` is -1 for the left eye (as you
 * look), 1 for the right. A lash line heavier at the outer corner; the iris dark under it and
 * lighter toward its foot, with a big glint at its top left (on both eyes: the light is on the
 * left); a sliver of white either side.
 */
function eye(B: Layer, x0: number, y: number, s: -1 | 1, o: EyeOpts): void {
  const out = s < 0 ? 0 : 5;
  const inn = 5 - out;
  const P = (c: number, r: number, col: string) => B.px(x0 + c, y + r, col);
  const soft = (c: number, r: number) => mixHex(o.lash, o.lid(x0 + c, y + r), 0.45);
  if (o.shut) {
    // The lids down: skin over the eye, the lash line along its foot in a soft curve.
    for (let r = -1; r <= 5; r++) for (let c = -1; c <= 6; c++) if (r >= 0 || c === out + s) P(c, r, o.lid(x0 + c, y + r));
    for (let c = 1; c <= 4; c++) P(c, 4, o.lash);
    P(out, 3, o.lash);
    P(inn, 3, soft(inn, 3));
    if (o.lashes) P(out + s, 3, o.lash);
    return;
  }
  for (let c = 1; c <= 4; c++) P(c, 0, o.lash);
  P(out, 1, o.lash);
  P(inn, 1, soft(inn, 1));
  if (o.lashes) {
    P(out, 0, o.lash);
    P(out + s, -1, o.lash);
  }
  const i0 = 1 + o.look;
  const [d, m, l] = o.iris;
  const ip = (c: number, r: number, col: string) => (o.glow ? B.gl(x0 + c, y + r, col) : P(c, r, col));
  for (let r = 1; r <= 5; r++) {
    for (let c = 0; c <= 5; c++) {
      if ((r === 1 || r === 5) && (c === 0 || c === 5)) continue;
      const ic = c - i0;
      if (ic < 0 || ic > 3) {
        // The white, shaded under the lid and toward the right.
        P(c, r, o.glow ? o.shadow : r === 1 || r === 5 || c > i0 + 3 ? mixHex(WHITE, o.lid(x0 + c, y + r), 0.4) : WHITE);
        continue;
      }
      let col = m;
      if (r === 1) col = o.heavy ? mixHex(o.lash, d, 0.4) : d;
      else if ((r === 2 && ic <= 1) || (r === 3 && ic === 0)) col = GLINT;
      else if (r === 5) col = ic === 0 || ic === 3 ? d : l;
      else if (r === 4 && ic === 2) col = l;
      ip(c, r, col);
    }
  }
}

function face(B: Layer, g: Geo, spec: BustSpec, skin: string[], hair: string[], shut: boolean): void {
  const { cx, top, eyeY } = g;
  const look = spec.look;
  const lid = (x: number, y: number) => rk(skin, skinK(x - cx, y - top) - 0.15);
  const eyeC = look.eyes ?? '#2a1a14';
  const glow = spec.glowEyes;
  const iris = glow ? [mixHex(glow, '#c0400a', 0.5), glow, '#fff6c8'] : [mixHex(eyeC, '#06030a', 0.45), eyeC, mixHex(eyeC, '#d89060', 0.42)];
  const lash = mixHex(INK, skin[0], 0.1);
  for (const [i, s] of [-1, 1].entries()) {
    eye(B, cx + EYE_X[i], eyeY, s as -1 | 1, { iris, lash, lashes: !!spec.lashes, look: spec.look2 ?? 0, glow: !!glow, shut, lid, shadow: rk(skin, 1), heavy: spec.brows === 'stern' });
  }
  // The brows: short soft strokes over the eyes (drooping white ones on the old sage).
  const bald = look.hairStyle === 'bald';
  const browR = bald ? ramp5(look.beardRamp ?? look.hair) : hair;
  const bc = mixHex(browR[1], INK, 0.25);
  const bl = mixHex(browR[2], INK, 0.1);
  for (const [i, s] of [-1, 1].entries()) {
    const x0 = cx + EYE_X[i];
    const by = eyeY - 2;
    if (look.beard === 'long') {
      for (let j = 0; j <= 5; j++) {
        const x = s < 0 ? x0 + 4 - j : x0 + 1 + j;
        const yy = by - 1 + (j >= 4 ? 1 : 0) + (j >= 5 ? 1 : 0);
        B.px(x, yy, rk(browR, s < 0 ? 3.4 : 2.6));
        if (j >= 1 && j <= 3) B.px(x, yy + 1, rk(browR, s < 0 ? 2.4 : 1.8));
      }
      continue;
    }
    // Four pixels from the outer end in, each row's lift by the mood: soft drops at the outer end, raised
    // arches up, stern slants down toward the nose. Bald heads get them thick (nothing hides them).
    const lift = { soft: [1, 0, 0, 0], raised: [0, -1, -1, 0], stern: [-1, -1, 0, 1] }[spec.brows ?? 'soft'];
    for (let o = 0; o < 4; o++) {
      const x = s < 0 ? x0 + o : x0 + 5 - o;
      const yy = by + lift[o];
      B.px(x, yy, o === (s < 0 ? 0 : 3) ? bl : bc);
      if (bald) B.px(x, yy - 1, o === 1 || o === 2 ? bl : bc);
    }
  }
  // The nose: just a shade, and the light on its tip.
  B.px(cx, eyeY + 7, rk(skin, skinK(0, 20) - 1));
  B.px(cx - 1, eyeY + 6, rk(skin, 4));
  // A soft blush under each eye.
  const blush = mixHex(rk(skin, 3), '#ff5a6e', 0.3);
  const blush2 = mixHex(rk(skin, 3), '#ff5a6e', 0.17);
  for (const s of [-1, 1]) {
    for (const ax of [8, 9, 10]) B.px(cx + s * ax, eyeY + 6, ax === 9 ? blush : blush2);
    for (const ax of [9, 10]) B.px(cx + s * ax, eyeY + 7, blush2);
  }
  // The mouth: small, under the nose (lower when a mustache sits over it).
  const m = spec.mouth ?? 'smile';
  const my = g.mouthY + (look.beard === 'mustache' || look.beard === 'full' || look.beard === 'long' ? 1 : 0);
  const lip = spec.lashes ? mixHex(skin[1], '#a02838', 0.5) : mixHex(skin[0], '#4a1018', 0.42);
  const lipSoft = mixHex(lip, rk(skin, 3), 0.45);
  if (m === 'grin') {
    // Open, teeth showing.
    B.px(cx - 2, my - 1, lipSoft);
    B.px(cx + 2, my - 1, lipSoft);
    for (let x = cx - 2; x <= cx + 2; x++) B.px(x, my, Math.abs(x - cx) === 2 ? lip : '#f2e8dc');
    B.px(cx - 1, my + 1, lip);
    B.px(cx, my + 1, '#c8505a');
    B.px(cx + 1, my + 1, lip);
  } else if (m === 'smile') {
    B.px(cx - 2, my - 1, lipSoft);
    B.px(cx + 2, my - 1, lipSoft);
    for (let x = cx - 1; x <= cx + 1; x++) B.px(x, my, lip);
  } else {
    for (let x = cx - 1; x <= cx + 1; x++) B.px(x, my, lip);
  }
  if (spec.old) {
    // Crow's feet, and smile lines.
    for (const s of [-1, 1]) {
      const ox = cx + s * 10;
      B.px(ox, eyeY + 1, rk(skin, skinK(ox - cx, 14) - 1));
      B.px(ox, eyeY + 3, rk(skin, skinK(ox - cx, 16) - 1));
      B.px(cx + s * 4, my - 2, rk(skin, skinK(s * 4, 20) - 0.8));
      B.px(cx + s * 4, my - 1, rk(skin, skinK(s * 4, 21) - 0.8));
    }
  }
}

// ------------------------------------------------------------------ hair

/** The top row of the hair's volume in a column (dx from the middle), or null past its edge. */
function domeTop(dx: number): number | null {
  const a = Math.abs(dx);
  for (let i = 0; i < HAIR_HW.length; i++) if (HAIR_HW[i] >= a) return i - 2;
  return null;
}

/**
 * Each cut's hairline: the hair's lowest row (from the skull's top) in each column from dx -16 to
 * 16, laid by hand: the locks of a fringe come to points, the notches between them part the hair.
 */
const CUTS: Record<'short' | 'bob' | 'bun', readonly number[]> = {
  // Short: a fringe of chunky locks swept a little to the right, sideburns, the ears showing.
  short: [11, 12, 14, 14, 12, 9, 10, 11, 9, 8, 9, 10, 10, 11, 9, 8, 9, 10, 10, 11, 9, 8, 9, 10, 10, 11, 9, 8, 10, 14, 14, 12, 11],
  // A bob: a blunt fringe of four round-ended locks, the sides falling straight to the jaw.
  bob: [21, 22, 22, 21, 13, 12, 11, 11, 11, 10, 9, 10, 11, 11, 11, 10, 9, 10, 11, 11, 11, 10, 9, 10, 11, 11, 11, 12, 13, 21, 22, 22, 21],
  // Pulled back under a scarf: a parted band at the brow, locks over the temples.
  bun: [-9, -9, 13, 13, 12, 11, 9, 8, 8, 8, 8, 8, 8, 8, 8, 8, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 11, 12, 13, 13, -9, -9],
};

function hairDo(B: Layer, g: Geo, look: NpcLook, hair: string[], skin: string[]): void {
  const { cx, top } = g;
  const style = look.hairStyle;
  if (style === 'none') return;
  if (style === 'bald') {
    // A shine on the crown, a tuft of hair over each ear.
    for (const [dx, rr, k] of [[-6, 3, 4], [-5, 2, 4], [-4, 2, 4], [-7, 4, 3.6], [-3, 2, 3.6], [-5, 3, 3.6]] as const) B.px(cx + dx, top + rr, rk(skin, k));
    // Each tuft hugs the skull above the ear in two locks: [row, inner, outer] from the middle.
    const TUFT = [[7, 12, 14], [8, 12, 15], [9, 13, 16], [10, 13, 16], [11, 13, 16], [12, 13, 15], [13, 13, 14]] as const;
    for (const s of [-1, 1]) {
      for (const [rr, inner, outer] of TUFT) {
        for (let a: number = inner; a <= outer; a++) {
          let k = s < 0 ? 3 - (a - inner) * 0.35 : 1.9 - (a - inner) * 0.2;
          if (rr === 7) k += 0.5;
          if (rr === 10 && a === outer) k -= 0.8;
          if (rr === 13) k -= 0.5;
          B.px(cx + s * a, top + rr, rk(hair, k));
        }
      }
    }
    return;
  }
  const cut = CUTS[style];
  // Under a helm's brim only the sides show.
  const helm = look.hat?.kind === 'kettle';
  const bottomAt = (dx: number) => (Math.abs(dx) > 16 ? -9 : helm && Math.abs(dx) <= 12 ? Math.min(8, cut[dx + 16]) : cut[dx + 16]);
  const crown = 2;
  // The partings: lines from each notch in the hairline up toward the crown.
  const line = new Set<string>();
  for (let dx = -13; dx <= 13; dx++) {
    const b = bottomAt(dx);
    if (b < 0 || !(b < bottomAt(dx - 1) && b <= bottomAt(dx + 1))) continue;
    for (let i = 0; i <= 5; i++) line.add(`${Math.round(dx + ((crown - dx) * i) / (b + 6))},${b - i}`);
  }
  const on = (dx: number, r: number) => line.has(`${dx},${r}`);
  for (let dx = -16; dx <= 16; dx++) {
    const bot = bottomAt(dx);
    const t0 = domeTop(dx);
    if (bot < -2 || t0 === null) continue;
    for (let r = t0; r <= bot; r++) {
      let k = 2.3 - dx * 0.055 - (r - 4) * 0.045;
      if (on(dx, r)) k = 1;
      else if (on(dx - 1, r)) k += 0.6;
      else if (on(dx + 1, r)) k -= 0.5;
      if (r === bot) k -= 0.5;
      // The sheen: a band of light across the crown on the lit side.
      const sd = Math.hypot(dx - 3, r - 14) - 13.4;
      if (dx <= 5 && r <= 7 && !on(dx, r) && r < bot) {
        if (Math.abs(sd) < 0.65) k = 4;
        else if (Math.abs(sd) < 1.35 && dx <= 1) k = Math.max(k, 3.3);
      }
      B.px(cx + dx, top + r, rk(hair, k));
    }
    // The shadow the hair casts on the brow.
    if (inHead(dx, bot + 1) && !(helm && Math.abs(dx) <= 12)) B.px(cx + dx, top + bot + 1, rk(skin, skinK(dx, bot + 1) - 1));
  }
  if (style === 'short') {
    // A tuft sticking up off the crown.
    for (const [dx, dy, k] of [[1, -3, 2.6], [2, -3, 2.2], [2, -4, 2.8], [3, -5, 2.4]] as const) B.px(cx + dx, top + dy, rk(hair, k));
  }
  if (style === 'bob') {
    // The sides fall a little wider than the head, and behind the jaw; the ends curl in.
    for (const s of [-1, 1]) {
      for (let r = 8; r <= 20; r++) B.px(cx + s * 17, top + r, rk(hair, s < 0 ? 2.4 : 1.2));
      for (let r = 19; r <= 24; r++) {
        for (let a = HEAD[Math.min(HEAD_H - 1, r)] + 1; a <= 15; a++) {
          if (r <= 22 && a >= 13) continue;
          B.px(cx + s * a, top + r, rk(hair, 0.8));
        }
      }
    }
  }
}

// ------------------------------------------------------------------ beards

function beard(B: Layer, g: Geo, kind: NonNullable<NpcLook['beard']>, r: string[]): void {
  const { cx, top, base } = g;
  const tone = (dx: number, k: number) => rk(r, k - dx * 0.05);
  // The mustache: two thick curls under the nose, their ends drooping.
  const stache = () => {
    for (let dx = -5; dx <= 5; dx++) {
      const a = Math.abs(dx);
      if (a >= 1 && a <= 4) B.px(cx + dx, top + 21, tone(dx, 3.4 - a * 0.1));
      B.px(cx + dx, top + 22, tone(dx, a === 0 ? 1.6 : 2.6));
      if (a >= 4) B.px(cx + dx, top + 23, tone(dx, 1.9));
    }
    B.px(cx - 6, top + 23, tone(-6, 1.8));
    B.px(cx + 6, top + 23, tone(6, 1.2));
  };
  if (kind === 'stubble') {
    // A shadow of stubble along the jaw (a shade, not a speckle).
    for (let rr = 21; rr <= 25; rr++) for (let dx = -HEAD[rr] + 2; dx <= HEAD[rr] - 2; dx++) if (rr > 22 || Math.abs(dx) >= 5) B.tone(cx + dx, top + rr, -0.14);
    return;
  }
  if (kind === 'mustache') {
    // A thick handlebar: two lit curls parted under the nose, their ends drooping past the mouth.
    const M = ['..aaaa.aaaa..', '.bbbbbcbbbbb.', 'bbc.......cbb', 'b...........b'];
    M.forEach((row, i) => {
      for (let j = 0; j < row.length; j++) {
        if (row[j] === '.') continue;
        const dx = j - 6;
        B.px(cx + dx, top + 21 + i, tone(dx, row[j] === 'a' ? 3.4 : row[j] === 'b' ? 2.3 : 1.1));
      }
    });
    return;
  }
  if (kind === 'goatee') {
    stache();
    for (let rr = 24; rr <= 28; rr++) for (let dx = -2; dx <= 2; dx++) if (rr < 28 || Math.abs(dx) <= 1) B.px(cx + dx, top + rr, tone(dx, 2.4));
    return;
  }
  // Full or long: from the sideburns down along the jaw, over the chin and onto the chest (the long
  // one tapering to the counter), in big locks that curve in toward its foot, lit on the left; the
  // cheeks stay clear above it and the mouth shows through under the mustache.
  const long = kind === 'long';
  const foot = long ? base - top + 2 : 32;
  const FULL = [15, 15, 15, 15, 15, 14, 14, 13, 12, 11, 9, 7];
  const LONG = [14, 14, 14, 13, 12, 11, 10, 10, 10, 9, 9, 9, 9, 9, 8, 8, 8, 8, 8, 8, 7];
  const hwAt = (rr: number) => (rr <= 20 ? 15 : long ? LONG[Math.min(LONG.length - 1, rr - 21)] : FULL[Math.min(FULL.length - 1, rr - 21)]);
  // The beard's top edge across each cheek, from the sideburn down to the mustache.
  const cheek = (rr: number) => (rr <= 17 ? 13 : rr >= 22 ? 0 : [12, 11, 9, 7][rr - 18]);
  const LOCKS = [-9, -4, 1, 6, 11];
  const lockX = (i: number, rr: number) => {
    const t = Math.max(0, (rr - 21) / (foot - 21));
    return Math.round(LOCKS[i] * (1 - 0.45 * t));
  };
  for (let rr = 12; rr <= foot; rr++) {
    const wave = long && rr > 24 ? Math.round(Math.sin(rr * 0.5) * 0.7) : 0;
    const hw = hwAt(rr);
    // The long beard's three locks keep to its width as it tapers, with a slow wave.
    const lines = long && rr > 22 ? [-0.55, 0.05, 0.62].map((f) => Math.round(f * hw + Math.sin(rr * 0.3 + f * 4) * 0.5)) : LOCKS.map((_, i) => lockX(i, rr));
    for (let dx = -hw + wave; dx <= hw + wave; dx++) {
      const a = Math.abs(dx);
      if (rr <= 17 && (a < 13 || a > 14)) continue;
      if (rr > 17 && a < cheek(rr)) continue;
      if ((rr === 23 && a <= 2) || (rr === 24 && a <= 1 && !long)) continue;
      // Points at the foot: only the middles of the locks reach the bottom.
      if (rr >= foot - 1) {
        const mids = lines.slice(0, -1).map((l, i) => (l + lines[i + 1]) / 2).concat([lines[0] - 2.5, lines[lines.length - 1] + 2.5]);
        const near = Math.min(...mids.map((m) => Math.abs(dx - m)));
        if (near > (rr === foot ? 0.6 : 1.6)) continue;
      }
      let k = 2.75 - Math.max(0, rr - 23) * 0.035;
      if (lines.includes(dx)) k -= 0.95;
      else if (lines.includes(dx - 1)) k += 0.45;
      else if (lines.includes(dx + 1)) k -= 0.3;
      // A sheen high on the left, the far side turning away from the light.
      if (rr >= 21 && rr <= 25 && dx >= -11 && dx <= -6 && !lines.includes(dx)) k += 0.6;
      if (dx >= hw + wave - 1) k -= 0.5;
      if (rr >= foot - 1) k -= 0.35;
      B.px(cx + dx, top + rr, tone(dx, k));
    }
  }
  stache();
}

// ------------------------------------------------------------------ glasses

function glasses(B: Layer, g: Geo): void {
  const { cx, eyeY } = g;
  const frame = '#3a2a24';
  const lit = '#8a7262';
  // A round frame round each eye, lit on its top left, the lens faintly bright.
  const RING = ['..xxxxxx..', '.x......x.', 'x........x', 'x........x', 'x........x', 'x........x', '.x......x.', '..xxxxxx..'];
  for (const [i, s] of [-1, 1].entries()) {
    const x0 = cx + EYE_X[i] - 2;
    const y0 = eyeY - 1;
    RING.forEach((row, ry) => {
      const a = row.indexOf('x');
      const z = row.lastIndexOf('x');
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] === 'x') B.px(x0 + rx, y0 + ry, rx + ry < 5 ? lit : frame);
        else if (rx > a && rx < z) B.tint(x0 + rx, y0 + ry, '#e8f6ff', 0.14);
      }
    });
    // A glint across the glass, low on the right.
    B.px(x0 + 8, y0 + 5, GLINT);
    B.px(x0 + 7, y0 + 6, '#dff2ff');
    // The arm back to the ear.
    for (let a = 12; a <= 14; a++) B.px(cx + s * a, eyeY + 1, frame);
  }
  B.px(cx - 1, eyeY + 1, frame);
  B.px(cx, eyeY, frame);
  B.px(cx + 1, eyeY + 1, frame);
}

// ------------------------------------------------------------------ hats

function hat(B: Layer, g: Geo, look: NpcLook, r: string[], trim: string[] | null, hair: string[], spec: BustSpec): void {
  const { cx, top } = g;
  const kind = look.hat!.kind;
  if (kind === 'hood') {
    hood(B, g, r, trim, hair, spec);
    return;
  }
  if (kind === 'kerchief') {
    // A gray bun pinned up behind, peeking over the scarf.
    oval(B, cx - 5, top - 4, 4.5, 3.5, (_x, _y, nx, ny) => rk(hair, 2.6 - nx * 0.9 - ny * 0.9 + (nx < -0.2 && ny < -0.2 ? 0.8 : 0)));
    B.px(cx - 7, top - 6, rk(hair, 4));
    B.px(cx - 3, top - 4, rk(hair, 1.2));
    B.px(cx - 4, top - 3, rk(hair, 1.2));
    // The scarf, wrapped over the crown: its edge runs across the brow and dips at the temples, a
    // folded hem along it, small light dots, knotted on top with two ears.
    const edge = (a: number) => (a <= 8 ? 6 : a <= 11 ? 7 : a <= 13 ? 8 : 9);
    for (let dx = -16; dx <= 16; dx++) {
      const t0 = domeTop(dx);
      if (t0 === null) continue;
      const bot = edge(Math.abs(dx));
      for (let rr = t0; rr <= bot; rr++) {
        const hem = rr >= bot - 1;
        let k = 2.6 - dx / 14 - (rr + 2) * 0.05;
        if (hem) k = rr === bot - 1 ? 3.3 - dx / 12 : 2 - dx / 14;
        let c = rk(r, k);
        if (!hem && rr >= 0 && rr % 3 === 1 && (dx + 32 + (rr % 2 ? 0 : 2)) % 4 === 0) c = rk(r, Math.min(4, k + 1.7));
        B.px(cx + dx, top + rr, c);
      }
    }
    // The knot, up on the right, its two ears sticking out.
    oval(B, cx + 7, top - 2, 2.5, 2, (_x, _y, nx, ny) => rk(r, 2.6 - nx - ny * 0.6));
    for (const [dx, dy, k] of [[4, -5, 3], [5, -5, 2.6], [5, -4, 2.2], [3, -6, 3.2], [9, -4, 2.2], [10, -4, 1.8], [10, -5, 2.4], [11, -5, 1.8], [11, -6, 2]] as const) B.px(cx + dx, top + dy, rk(r, k));
    return;
  }
  if (kind === 'beret') {
    // A wide flat cap tipped down to the right over the hair, a band of gold trim, a stalk on top.
    const ocx = cx + 2;
    const ocy = top - 1;
    for (let y = ocy - 7; y <= ocy + 7; y++) {
      for (let x = ocx - 19; x <= ocx + 19; x++) {
        const nx = (x + 0.5 - ocx) / 18.5;
        const ny = (y + 0.5 - ocy - (x - ocx) * 0.1) / 5.6;
        if (nx * nx + ny * ny > 1) continue;
        let k = 2.5 - nx * 0.9 - ny * 1.1;
        if (ny > 0.45) k = 1.2;
        let c = rk(r, k);
        if (trim && ny > 0.5 && ny < 0.95 && nx > -0.92) c = rk(trim, 2.4 - nx * 1.2);
        B.px(x, y, c);
      }
    }
    B.px(ocx + 1, ocy - 7, trim ? trim[3] : r[4]);
    B.px(ocx + 1, ocy - 6, trim ? trim[2] : r[3]);
    B.px(ocx + 2, ocy - 6, trim ? trim[1] : r[2]);
    return;
  }
  if (kind === 'kettle') {
    kettle(B, g, r);
    return;
  }
  // Anything else: a simple cap.
  oval(B, cx, top + 2, 15, 6, (_x, y, nx, ny) => (y > top + 5 ? null : rk(r, 2.4 - nx - ny)));
}

/**
 * An iron kettle helm, polished: a round dome with a low ridge down its middle, a riveted band round
 * its foot and a wide brim. The light from the top left lays a bright streak across the dome and
 * leaves a dark core down its right, with a little light thrown back off the far edge; the brim
 * shades the brow.
 */
function kettle(B: Layer, g: Geo, r: string[]): void {
  const { cx, top } = g;
  const SHINE = '#f2f6fc';
  // The dome's half-width on the rows from five above the skull to its band.
  const DOME = [6, 10, 12, 14, 15, 15, 16, 16, 16, 16, 16];
  for (let i = 0; i < DOME.length; i++) {
    const rr = i - 5;
    for (let dx = -DOME[i]; dx <= DOME[i]; dx++) {
      const nx = dx / 16.5;
      const ny = (rr - 6) / 11.5;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const diff = Math.max(0, -nx * 0.55 - ny * 0.6 + nz * 0.58);
      let k = 0.25 + diff * 3.5;
      if (nx > 0.8) k += 0.9;
      // The ridge: lit on its left, a shadow on its right.
      if (rr < 4 && rr > -5) {
        if (dx === 0) k += 0.9;
        if (dx === 1) k -= 0.8;
      }
      let c = rk(r, k);
      // The streak of shine: a short arc on the upper left, brightest at its middle.
      const arc = Math.hypot(dx - 2, rr - 9) - 13.3;
      if (Math.abs(arc) < 0.62 && dx <= -2 && dx >= -11 && rr <= 2) c = dx >= -8 && dx <= -4 ? SHINE : r[4];
      // The band round the dome's foot, darker, its lower edge catching the light.
      if (rr === 4) c = rk(r, 1.5 - dx / 20);
      if (rr === 5) c = rk(r, 2.6 - dx / 12);
      B.px(cx + dx, top + rr, c);
    }
  }
  // Rivets on the band, each lit on its top left with a speck of shadow under it.
  for (const dx of [-13, -7, 6, 12]) {
    B.px(cx + dx, top + 4, dx < 0 ? SHINE : r[4]);
    B.px(cx + dx + 1, top + 5, r[0]);
  }
  // The brim: its top lit, a bright lip, the underside in shadow.
  for (const [rr, hw, k0] of [[6, 19, 3.3], [7, 20, 2.4], [8, 19, 0.8]] as const) {
    for (let dx = -hw; dx <= hw; dx++) B.px(cx + dx, top + rr, rk(r, k0 - dx / (rr === 8 ? 28 : 15)));
  }
  B.px(cx - 15, top + 6, SHINE);
  B.px(cx - 14, top + 6, SHINE);
  for (let x = cx - 14; x <= cx + 14; x++) for (const rr of [9, 10]) if (inHead(x - cx, rr)) B.tone(x, top + rr, rr === 9 ? -0.38 : -0.2);
}

/**
 * The hood's half-width on each row from the skull's top: round over the head and widest at the
 * cheeks, drawn in at the neck, then out over the shoulders as a short cape.
 */
const HOOD = [13, 14, 15, 16, 16, 17, 17, 17, 18, 18, 18, 18, 18, 18, 18, 18, 18, 17, 17, 17, 16, 16, 15, 15, 14, 14, 15, 15, 16, 16, 17, 17, 17];

/** The hood's left and right edges (from the middle) on a row: above the skull, a soft point leaning right. */
function hoodSpan(rr: number, foot: number): [number, number] | null {
  if (rr < -5 || rr > foot) return null;
  if (rr < 0) return [[1, 2], [-1, 3], [-5, 5], [-8, 9], [-11, 11]][rr + 5] as [number, number];
  const hw = HOOD[Math.min(rr, HOOD.length - 1)];
  return [-hw, hw];
}

function hood(B: Layer, g: Geo, r: string[], trim: string[] | null, hair: string[], spec: BustSpec): void {
  const { cx, top, sy } = g;
  const foot = sy + 8 - top;
  // The face's opening: an oval round the face.
  const ocy = top + 15.5;
  const e = (x: number, y: number) => Math.pow((x - cx) / 12, 2) + Math.pow((y - ocy) / 11.8, 2);
  const deep = !!spec.glowEyes;
  for (let rr = -5; rr <= foot; rr++) {
    const span = hoodSpan(rr, foot);
    if (!span) continue;
    const y = top + rr;
    for (let dx = span[0]; dx <= span[1]; dx++) {
      const x = cx + dx;
      const ee = e(x, y);
      if (ee < 1) {
        if (!inHead(dx, rr)) {
          // The hood's lining in the dark behind the neck.
          B.px(x, y, rk(r, 0));
          continue;
        }
        // The face in the hood's shadow, deepest under its brim: on the Oracle a deep violet dark
        // (her eyes shine out of it), on anyone else just a shade at the opening's edge.
        const depth = (y - (ocy - 11.8)) / 23.6;
        if (deep) B.tint(x, y, r[0], 0.48 + Math.max(0, 0.34 - depth) * 0.9);
        else if (ee > 0.72 || depth < 0.17) B.tone(x, y, -0.25);
        continue;
      }
      // The cape's front opening below the chin.
      if (rr > 26 && Math.abs(dx) < 4 + (rr - 26)) continue;
      let k = 2.4 - dx / 13;
      if (rr < 2) k += 0.4;
      // Folds falling from the crown and over the shoulders.
      if ((Math.abs(dx) === 16 && rr > 6 && rr < 21) || (dx === -6 && rr < 3 && rr > -3) || (dx === 7 && rr < 2 && rr > -3)) k -= 0.6;
      if (rr > 26 && (dx === -10 || dx === 11)) k -= 0.6;
      if (rr === foot) k -= 0.5;
      B.px(x, y, rk(r, k));
      // The trim round the opening and down the cape's front edges.
      if (trim && (ee < 1.3 || (rr > 26 && Math.abs(dx) < 6 + (rr - 26)))) B.px(x, y, rk(trim, 2.5 - dx / 9 - (ee > 1.16 && rr <= 26 ? 0.8 : 0)));
    }
  }
  // Hair under the hood, parted in the middle and swept to the sides across the brow.
  for (let dx = -10; dx <= 10; dx++) {
    const a = Math.abs(dx);
    const b = 6 + Math.min(4, Math.round(a / 2.6));
    for (let rr = 4; rr <= b; rr++) {
      if (e(cx + dx, top + rr) >= 1) continue;
      let k = 2.7 - dx * 0.07 - (rr - 4) * 0.12;
      if (rr === b) k -= 0.6;
      if (a === 0) k = 1.3;
      if (rr === 5 && dx < -1 && dx > -7) k = 4;
      const c = rk(hair, k);
      B.px(cx + dx, top + rr, deep ? mixHex(c, r[0], 0.4) : c);
    }
    if (inHead(dx, b + 1) && e(cx + dx, top + b + 1) < 1) B.tone(cx + dx, top + b + 1, -0.2);
  }
}

// ------------------------------------------------------------------ arms, hands and tools (over the counter)

function arms(F: Layer, g: Geo, spec: BustSpec): void {
  const { cx, base } = g;
  const look = spec.look;
  const skin = ramp5(look.skin);
  const bare = !!look.sleeves && look.sleeves[1] === look.skin[1];
  const sleeve = bare ? skin : ramp5(look.sleeves ?? look.shirt);
  const holdsStaff = isStaff(spec.tool);
  // The tool stands in the right hand (a candle a step further out, clear of a tabard's gold).
  if (spec.tool && !holdsStaff) tool(F, cx + (spec.tool === 'candle' ? 7 : 5), base, spec.tool);
  for (const s of [-1, 1] as const) {
    const reach = s > 0 && holdsStaff;
    // The forearm: a short round sleeve, foreshortened as it comes forward onto the counter (reaching
    // out to the staff on the right), lit along its top, a cuff at the wrist.
    const ex = cx + s * 10;
    const ey = base - 3;
    const hx = reach ? cx + STAFF_DX : cx + s * 6;
    const hy = reach ? base - 1 : base;
    const wx = reach ? hx - 4 : cx + s * 8;
    const wy = hy - 1;
    const len = Math.max(1, Math.hypot(wx - ex, wy - ey));
    for (let y = ey - 4; y <= wy + 4; y++) {
      for (let x = Math.min(ex, wx) - 4; x <= Math.max(ex, wx) + 4; x++) {
        const t = Math.max(0, Math.min(1, ((x - ex) * (wx - ex) + (y - ey) * (wy - ey)) / (len * len)));
        const px = ex + (wx - ex) * t;
        const py = ey + (wy - ey) * t;
        const rr = 3 - t * 0.5;
        if (Math.hypot(x - px, y - py) > rr) continue;
        let k = 2.7 - (y - py) * 0.45 - (s > 0 ? 0.45 : 0);
        if (y - py > rr - 1.2) k = 1;
        F.px(x, y, rk(sleeve, k));
      }
    }
    if (!bare) {
      const dir = Math.sign(hx - wx) || -s;
      for (let y = wy - 2; y <= wy + 2; y++) F.px(wx + dir, y, rk(sleeve, y === wy - 2 ? 3.8 : y === wy + 2 ? 1.2 : 3 - (s > 0 ? 0.5 : 0)));
    }
    // The hand: a round mitten resting on the counter, the thumb on top, lit on its left.
    const k0 = s > 0 ? 2.6 : 3;
    oval(F, hx + 0.5, hy + 0.5, 3.1, 2.6, (_x, y, nx, ny) => rk(skin, k0 - nx * 0.5 - ny * 0.9 - (y >= hy + 2 ? 0.5 : 0)));
    const th = reach ? hx - 1 : hx + (s < 0 ? 1 : -1);
    F.px(th, hy - 3, rk(skin, k0 + 0.6));
    F.px(th + 1, hy - 3, rk(skin, k0));
    F.px(th + (s < 0 ? 1 : 0), hy - 2, rk(skin, k0 - 0.9));
    // The fingers' line.
    for (const fx of [-1, 0, 1]) F.px(hx + fx, hy + 1, rk(skin, k0 - 1.2));
  }
}

/** A tall staff (or spear, or orb staff) standing at the keeper's right, held in the right hand. */
function staff(B: Layer, g: Geo, kind: 'staff' | 'spear' | 'orbStaff'): void {
  const WOOD = ['#2a160c', '#4a2c18', '#6e4426', '#946a40', '#b88c5a'];
  const METAL = ['#2a2a34', '#4c4c5c', '#7a7a8e', '#b0b0c2', '#e6e8f0'];
  const x = g.cx + STAFF_DX;
  const y0 = g.base + 2;
  const y1 = g.top - 3;
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
    // The jaw: an open C at the top.
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
    // The striking face, worn bright.
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
