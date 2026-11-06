/**
 * The keepers (and the floors' merchant) as figures in the world, in the style of their portraits
 * (keepers/bust.ts), about a knight's height: drawn on a frame 38 px from crown to sole (a head nine
 * pixels wide with big eyes: a lash line over an iris lit at its foot and a white glint; a neck,
 * shoulders half again as wide as the head, slender arms), with rows of the hips and the legs taken
 * out as they're painted (SHORT), so they stand 25 px tall, a little under three heads. Cel shaded
 * in a few hue-shifted steps of each material (keepers/ramps.ts), lit from the top left, with a
 * coloured outline. Facing you, from the side or from behind, standing or sitting; the idle breathes
 * (the upper body sinks a pixel and rises again) and blinks now and then.
 *
 * A figure facing left is painted with its light from the right and then turned round, so the light
 * still comes from the top left of the screen.
 */
import type { NpcDef, NpcLook, Ramp3 } from '../../world/npcs';
import { blank, flipX, type PixelBuf } from '../pixel/buf';
import { mixHex } from './draw';
import { Layer } from './hubKit';
import { beardRamp, cel, hairRamp, lum, outline, PLUM, skinRamp } from './keepers/ramps';
import type { View } from './knights';

export type TallPose = 'stand' | 'sit';
export type TallTool = 'hammer' | 'wrench' | 'candle' | 'tongs' | 'book' | 'cup';

/** A tall figure's frame: room above for hats and staffs, the soles near the bottom. */
export const TALL_W = 40;
export const TALL_H = 56;
const CX = 20;
const FOOT = 54;
/** The crown's row (the hair and hats go higher). */
const TOP = FOOT - 37;
/** How far a sitting figure's upper body drops onto the seat. */
const SIT = 8;
/**
 * The figure's rows (0 the crown, 37 the sole) left out, standing and sitting: two at the hips under
 * the belt, and the legs' long middle (standing), or two across the lap and the shins (sitting).
 * Whatever falls on them isn't painted and everything above them comes down, so the face, the hair and
 * the hats keep every pixel while the figure stands about a knight's height.
 */
const SHORT: Record<TallPose, readonly number[]> = {
  stand: [17, 18, ...Array.from({ length: 11 }, (_, i) => 23 + i)],
  sit: [17, 18, 26, 27, 30, 31, 32, 33, 34],
};
/** Frames in the idle: four a second, breathing in two-second swells, a blink every four seconds. */
export const TALL_FRAMES = 16;

export interface TallFrame {
  buf: PixelBuf;
  /** Pixels that glow (a candle's flame, the Oracle's eyes), same size as buf, or null. */
  glow: PixelBuf | null;
  /** The soles (or, sitting, the floor under the feet), in frame pixels. */
  ax: number;
  ay: number;
  /** How far the figure (hat, staff and all) reaches above its anchor. */
  height: number;
}

/** Whether a look is drawn as a tall figure. */
export const isTall = (look: NpcLook) => !!look.tall;

// ------------------------------------------------------------------ the painter

interface Pal {
  skin: string[];
  hair: string[];
  shirt: string[];
  arm: string[];
  pants: string[];
  shoes: string[];
  beard: string[];
  panel: string[] | null;
  hat: string[] | null;
  trim: string[] | null;
  iris: string[];
  lash: string;
  lip: string;
  bare: boolean;
  mail: boolean;
}

function ramp2(r: readonly [string, string]): Ramp3 {
  return [mixHex(r[0], '#000000', 0.3), r[0], r[1]];
}

/**
 * Cloth for a small figure: the portraits' cel steps, but pale cloth a step deeper all through (a
 * white robe under the hub's warm lamps would otherwise burn out to a blank).
 */
function cloth(r: Ramp3): string[] {
  const c = cel(r);
  return lum(r[2]) > 205 ? [c[0], c[0], c[1], c[2], c[3]] : c;
}

function palette(look: NpcLook): Pal {
  const skin = skinRamp(look.skin);
  const bare = !!look.sleeves && look.sleeves[1] === look.skin[1];
  const ic = look.eyes ?? '#8a5a2a';
  return {
    skin,
    hair: hairRamp(look.hair),
    shirt: cloth(look.shirt),
    arm: bare ? skin : cloth(look.sleeves ?? look.shirt),
    pants: cloth(look.pants),
    shoes: cel(ramp2(look.shoes)),
    beard: beardRamp(look.beardRamp ?? look.hair),
    panel: look.panel ? cel(ramp2(look.panel.ramp)) : null,
    hat: look.hat ? cloth(look.hat.ramp) : null,
    trim: look.hat?.trim ? cel(ramp2(look.hat.trim)) : null,
    iris: [mixHex(ic, '#140a24', 0.4), ic, mixHex(ic, '#fff4dc', 0.45)],
    lash: mixHex(PLUM, hairRamp(look.hair)[0], 0.2),
    lip: look.tall?.slim ? mixHex(skin[1], '#b02848', 0.4) : skin[1],
    bare,
    // (A guard's sleeves of mail go with his helm; anyone else's are cloth.)
    mail: !!look.sleeves && !bare && look.hat?.kind === 'kettle',
  };
}

/** One figure being painted: where, which way, and what state it's in. */
interface Fig {
  L: Layer;
  /** Rows left out (SHORT), and how far each row comes down for them (from row -16 on). */
  cut: ReadonlySet<number>;
  drop: readonly number[];
  look: NpcLook;
  pal: Pal;
  slim: boolean;
  dress: boolean;
  view: View;
  sit: boolean;
  /** The light's side as painted: 1 from the left, -1 from the right (a figure painted to be turned round). */
  light: 1 | -1;
  /** The upper body's drop (a breath, and the seat when sitting). */
  up: number;
  shut: boolean;
}

/** The frame row of the figure's row `r` (rows left out bring everything above them down). */
function row(F: Fig, r: number, upper: boolean): number {
  return TOP + r + (F.drop[Math.max(0, Math.min(F.drop.length - 1, r + 16))] ?? 0) + (upper ? F.up : 0);
}

/** Paints at (dx, r) from the figure's middle and its crown; the upper body (head, torso, arms) moves with the breath. */
function px(F: Fig, dx: number, r: number, c: string | null | undefined, upper = true): void {
  if (F.cut.has(r)) return;
  F.L.px(CX + dx, row(F, r, upper), c);
}
function gl(F: Fig, dx: number, r: number, c: string, upper = true): void {
  if (F.cut.has(r)) return;
  F.L.gl(CX + dx, row(F, r, upper), c);
}
/** Is a column on the lit side (toward the light)? */
const litSide = (F: Fig, dx: number) => F.light * dx < 0;

/**
 * Stamps a template of tone digits ('0' deepest to '4' brightest, '.' clear; 'k' a dark line) with its
 * column `ox` on the figure's middle and its first row at `r0`.
 */
function stamp(F: Fig, rows: readonly string[], ox: number, r0: number, ramp: readonly string[], upper = true): void {
  rows.forEach((row, i) => {
    for (let j = 0; j < row.length; j++) {
      const ch = row[j];
      if (ch === '.') continue;
      px(F, j - ox, r0 + i, ch === 'k' ? mixHex(ramp[0], PLUM, 0.5) : ramp[Number(ch)], upper);
    }
  });
}

// ------------------------------------------------------------------ shapes

/** The head's half-width on each row, facing you: a round crown, full cheeks, a small pointed chin. */
const HEAD_F = [2, 3, 4, 4, 4, 4, 4, 3, 1];
/** The head from the side (facing right): [back, front] on each row; the nose at row 5, the chin forward. */
const HEAD_S: ReadonlyArray<readonly [number, number]> = [[-2, 1], [-3, 2], [-4, 3], [-4, 3], [-4, 3], [-4, 4], [-4, 3], [-3, 3], [-1, 2]];
/** The torso's half-width from the shoulders (row 10) to the hips (row 19). */
const TORSO_B = [6, 5, 5, 5, 5, 4, 4, 5, 5, 5];
const TORSO_S = [5, 4, 4, 4, 4, 3, 3, 4, 4, 4];
/** From the side: [back, front] from the shoulders to the hips. */
const TORSO_SIDE_B: ReadonlyArray<readonly [number, number]> = [[-3, 2], [-3, 3], [-3, 3], [-3, 3], [-3, 3], [-2, 2], [-2, 2], [-3, 2], [-3, 2], [-3, 2]];
const TORSO_SIDE_S: ReadonlyArray<readonly [number, number]> = [[-2, 2], [-3, 2], [-3, 3], [-3, 3], [-2, 2], [-2, 2], [-2, 1], [-2, 2], [-3, 2], [-3, 2]];
/** A leg's [inner, outer] columns from the crotch (row 20) to the ankle (row 35). */
const LEG_B: ReadonlyArray<readonly [number, number]> = [[0, 5], [1, 5], [1, 4], [1, 4], [1, 4], [1, 4], [1, 4], [1, 4], [1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 3]];
const LEG_S: ReadonlyArray<readonly [number, number]> = [[0, 4], [1, 4], [1, 4], [1, 4], [1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 2], [1, 2], [1, 2], [1, 2], [1, 3]];

const torso = (F: Fig, r: number) => (F.slim ? TORSO_S : TORSO_B)[Math.min(19, r) - 10];
const torsoSide = (F: Fig, r: number) => (F.slim ? TORSO_SIDE_S : TORSO_SIDE_B)[r - 10];
const armCols = (F: Fig): [number, number] => (F.slim ? [5, 6] : [6, 7]);
/** A robe's half-width on a row, from the waist down to the hem (flaring by the rows that show). */
const skirtHW = (F: Fig, r: number) => {
  if (r < 17) return torso(F, Math.min(19, r));
  let shown = 0;
  for (let k = 17; k < r; k++) if (!F.cut.has(k)) shown++;
  return (F.slim ? 4 : 5) + Math.floor(shown / 3);
};

// ------------------------------------------------------------------ the figure

/**
 * A tall figure in a pose. `frame` counts up freely (the idle breathes and blinks); `dir` is which way
 * a side view faces (1 right, -1 left: the frame comes back already facing it).
 */
export function tallFrame(def: NpcDef, pose: TallPose, view: View, frame: number, tool?: TallTool, dir: 1 | -1 = 1, whole = false): TallFrame {
  const f = ((frame % TALL_FRAMES) + TALL_FRAMES) % TALL_FRAMES;
  const d = view === 'side' ? dir : 1;
  // Painted once each (the renderer asks every frame): treat the buffers as read-only.
  const key = `${def.id}|${pose}|${view}|${f}|${tool ?? ''}|${d}|${whole ? 1 : 0}`;
  let fr = painted.get(key);
  if (!fr) {
    if (painted.size > 600) painted.clear();
    fr = paintTall(def, pose, view, f, tool, d, whole);
    painted.set(key, fr);
  }
  return fr;
}

const painted = new Map<string, TallFrame>();

function paintTall(def: NpcDef, pose: TallPose, view: View, f: number, tool: TallTool | undefined, dir: 1 | -1, whole: boolean): TallFrame {
  const look = def.look;
  const breath = f % 8 >= 4 ? 1 : 0;
  const L = new Layer(0, 0, TALL_W, TALL_H);
  const turn = view === 'side' && dir < 0;
  // (`whole`: the figure as drawn, every row: the talk card's portrait crops its head and shoulders.)
  const cut = new Set(whole ? [] : SHORT[pose]);
  const drop = Array.from({ length: 16 + 38 }, (_, i) => [...cut].filter((c) => c > i - 16).length);
  const F: Fig = {
    L,
    cut,
    drop,
    look,
    pal: palette(look),
    slim: !!look.tall?.slim,
    dress: !!look.dress,
    view,
    sit: pose === 'sit',
    light: turn ? -1 : 1,
    up: breath + (pose === 'sit' ? SIT : 0),
    shut: f === 10,
  };
  if (view === 'side') side(F, tool);
  else frontBack(F, view === 'up', tool);
  let buf = L.buf;
  let glow: PixelBuf | null = hasGlow(L.glow) ? L.glow : null;
  if (turn) {
    buf = flipX(buf);
    if (glow) glow = flipX(glow);
  }
  const O = new Layer(0, 0, TALL_W, TALL_H);
  O.buf.px.set(buf.px);
  outline(O, 0.55, 0.7, 0.82);
  return { buf: O.buf, glow, ax: turn ? TALL_W - 1 - CX : CX, ay: FOOT, height: reachOf(O.buf, FOOT) };
}

function hasGlow(g: PixelBuf): boolean {
  for (let i = 3; i < g.px.length; i += 4) if (g.px[i]) return true;
  return false;
}

/** Rows from a frame's anchor up to its topmost opaque pixel (how far it reaches above where it stands). */
export function reachOf(b: PixelBuf, ay: number): number {
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.px[(y * b.w + x) * 4 + 3]) return ay - y;
  return 0;
}

/** A tall figure's head and shoulders, facing you, `w` x `h` (for a talk card's portrait). */
export function tallPortrait(def: NpcDef, w: number, h: number): PixelBuf {
  const src = tallFrame(def, 'stand', 'down', 0, undefined, 1, true).buf;
  const out = blank(w, h);
  const x0 = CX - Math.floor(w / 2);
  const y0 = TOP - 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y0 + y) * src.w + x0 + x) * 4;
      out.px.set(src.px.subarray(si, si + 4), (y * w + x) * 4);
    }
  }
  return out;
}

// ------------------------------------------------------------------ facing you, or from behind

function frontBack(F: Fig, back: boolean, tool?: TallTool): void {
  const { look, pal } = F;
  if (look.pack && !back) packBehind(F);
  if (look.item && !back) longItem(F, look.item, 'down');
  if (F.sit) lapFront(F, back);
  else if (F.dress) skirtFront(F);
  else legsFront(F);
  torsoFront(F, back);
  if (pal.panel) panelFront(F, back);
  armsFront(F, back);
  neck(F, 0);
  headFront(F);
  if (!back) faceFront(F);
  hairFront(F, back);
  if (look.beard && !back) beardFront(F);
  if (look.glasses && !back) glassesFront(F);
  if (look.hat) hatFront(F, back);
  if (look.pack && back) packBack(F);
  if (!back) {
    if (look.item) heldItem(F, look.item, 'down');
    if (tool) heldTool(F, tool, 'down');
  }
}

function legsFront(F: Fig): void {
  const LEG = F.slim ? LEG_S : LEG_B;
  const P = F.pal.pants;
  for (let r = 20; r <= 35; r++) {
    const [i, o] = LEG[r - 20];
    for (const s of [-1, 1] as const) {
      const lit = litSide(F, s);
      for (let a = i; a <= o; a++) {
        let k = lit ? (a === o ? 3 : a === i ? 2 : 3) : a === i ? 2 : a === o ? 1 : 2;
        // The knee: a crease across the trouser leg.
        if (r === 28 && a > i && a < o) k -= 1;
        px(F, s * a, r, P[k], false);
      }
    }
  }
  feet(F, [1, 3], [1, 4]);
}

/** The shoes: [inner, outer] columns on the instep's row and the sole's. */
function feet(F: Fig, top: readonly [number, number], sole: readonly [number, number]): void {
  const S = F.pal.shoes;
  for (const s of [-1, 1] as const) {
    const lit = litSide(F, s);
    for (let a = top[0]; a <= top[1]; a++) px(F, s * a, 36, S[lit ? 3 : 2], false);
    for (let a = sole[0]; a <= sole[1]; a++) px(F, s * a, 37, S[lit ? (a === sole[1] ? 2 : 3) : 1], false);
  }
}

function skirtFront(F: Fig): void {
  const C = F.pal.shirt;
  for (let r = 15; r <= 35; r++) {
    const hw = skirtHW(F, r);
    for (let dx = -hw; dx <= hw; dx++) {
      const sx = F.light * dx;
      let k = sx <= 0 ? 3 : sx <= hw - 2 ? 2 : 1;
      if (sx === -hw) k = 2;
      // Two soft folds falling from the hips.
      if (r >= 22 && (dx === -2 || dx === 3)) k = F.light * dx < 0 ? 2 : 1;
      if (r >= 22 && dx === -3) k = 4;
      if (r === 35) k = Math.max(1, k - 1);
      px(F, dx, r, C[k], r < 20);
    }
  }
  feet(F, [1, 2], [1, 3]);
}

/** Sitting, facing you (or from behind): the thighs coming toward you, the shins down, the feet. */
function lapFront(F: Fig, back: boolean): void {
  const P = F.dress ? F.pal.shirt : F.pal.pants;
  const hw = F.slim ? 5 : 6;
  for (let r = 25; r <= 29; r++) {
    for (let dx = -hw; dx <= hw; dx++) {
      if (r === 29 && Math.abs(dx) < 2 && !F.dress) continue;
      const k = r === 25 ? (back ? 2 : 3) : r === 29 ? 1 : F.light * dx <= 0 ? 3 : 2;
      px(F, dx, r, P[k], false);
    }
  }
  if (back) return;
  for (let r = 30; r <= 35; r++) {
    for (const s of [-1, 1] as const) {
      for (let a = 2; a <= 4; a++) {
        if (F.dress && r > 33) continue;
        px(F, s * a, r, P[litSide(F, s) ? (a === 4 ? 3 : 2) : a === 2 ? 2 : 1], false);
      }
    }
  }
  feet(F, [2, 4], [2, 5]);
}

function torsoFront(F: Fig, back: boolean): void {
  const { pal } = F;
  const C = pal.shirt;
  const last = F.dress && !F.sit ? 16 : 19;
  for (let r = 10; r <= last; r++) {
    const hw = torso(F, r);
    for (let dx = -hw; dx <= hw; dx++) {
      const a = Math.abs(dx);
      const sx = F.light * dx;
      if (!back && r === 10 && a <= 1) {
        // The neck's opening: a round one on a robe, an open collar on a shirt.
        px(F, dx, r, F.dress ? C[1] : pal.skin[2]);
        continue;
      }
      let k = sx <= 1 ? 3 : sx <= 3 ? 2 : 1;
      if (r === 10) k = sx < 0 ? 4 : 2;
      if (a === hw && r > 10) k = sx < 0 ? 2 : 1;
      if (!back && r === 11 && a <= 1) k = F.dress ? 4 : 1;
      if (!back && !F.dress && r === 11 && a === 2) k = 4;
      px(F, dx, r, C[k]);
    }
  }
  if (!back && !F.dress && !pal.panel) {
    // Buttons down the front.
    for (const r of [13, 15, 17]) px(F, 0, r, C[1]);
  }
  // A belt, or a cord at a robe's waist (not under an apron, nor between a stole's ends, where it
  // would join them into a letter H).
  const kind = F.look.panel?.kind;
  if (kind !== 'apron' && kind !== 'bib' && kind !== 'shawl') belt(F, back);
}

function belt(F: Fig, back: boolean): void {
  const r = F.dress ? 15 : 16;
  const hw = torso(F, r);
  const cord = F.dress;
  const B = cord ? cel(['#6a4a10', '#b8862a', '#f0c850']) : cel(['#24140e', '#4a2c1a', '#7a4e2c']);
  for (let dx = -hw; dx <= hw; dx++) px(F, dx, r, B[cord ? ((dx + 20) % 2 ? 3 : 2) : F.light * dx < 2 ? 3 : 2]);
  if (!back && !cord) px(F, 0, r, '#f0c850');
  if (!back && cord) {
    px(F, -2, r + 1, B[3]);
    px(F, -2, r + 2, B[2]);
  }
}

function panelFront(F: Fig, back: boolean): void {
  const R = F.pal.panel!;
  const kind = F.look.panel!.kind;
  if (kind === 'apron' || kind === 'bib') {
    if (back) {
      // The straps crossing the back, the tie at the waist.
      for (let r = 10; r <= 15; r++) {
        px(F, -3 + (r - 10), r, R[2]);
        px(F, 3 - (r - 10), r, R[1]);
      }
      for (let dx = -torso(F, 16); dx <= torso(F, 16); dx++) px(F, dx, 16, R[2]);
      px(F, -1, 17, R[3]);
      px(F, 1, 17, R[2]);
      return;
    }
    // The bib over the chest, the straps up to the neck, a pocket, the skirt to the knees.
    for (let r = 12; r <= 27; r++) {
      const hw = r < 16 ? 3 : 4;
      for (let dx = -hw; dx <= hw; dx++) {
        let k = F.light * dx <= 1 ? 3 : 2;
        if (r === 12) k = 4;
        if (Math.abs(dx) === hw) k = F.light * dx < 0 ? 3 : 1;
        if (r === 16) k = 4;
        if (r === 20 && Math.abs(dx) <= 2) k = 1;
        px(F, dx, r, R[k], r < 20);
      }
    }
    for (const s of [-1, 1]) {
      px(F, s * 3, 10, R[litSide(F, s) ? 4 : 2]);
      px(F, s * 3, 11, R[litSide(F, s) ? 3 : 2]);
    }
    return;
  }
  if (kind === 'vest') {
    for (let r = 10; r <= 18; r++) {
      const hw = torso(F, r);
      for (let dx = -hw; dx <= hw; dx++) {
        const a = Math.abs(dx);
        if (!back && a <= (r < 13 ? 2 : 1)) continue;
        const k = r === 10 ? (F.light * dx < 0 ? 4 : 2) : F.light * dx < 0 ? (a === 2 && !back ? 4 : 3) : a === hw ? 1 : 2;
        px(F, dx, r, R[k]);
      }
    }
    return;
  }
  if (kind === 'tabard') {
    for (let r = 11; r <= 27; r++) {
      for (let dx = -2; dx <= 2; dx++) {
        let k = F.light * dx <= 0 ? 3 : 2;
        if (Math.abs(dx) === 2) k = F.light * dx < 0 ? 4 : 1;
        if (r === 27) k = 1;
        px(F, dx, r, R[k], r < 20);
      }
    }
    if (!back) {
      // The sun on the chest.
      px(F, 0, 13, '#ff8a2a');
      px(F, 0, 12, '#ffc860');
      px(F, -1, 13, '#ffc860');
      px(F, 1, 13, '#c8501a');
      px(F, 0, 14, '#c8501a');
    }
    return;
  }
  // A stole round the neck, its two ends falling straight down the front (beside a long beard), down
  // the back from behind; the ends fringed.
  const long = F.look.beard === 'long';
  const foot = long ? 21 : 19;
  for (const s of [-1, 1] as const) {
    const lit = litSide(F, s);
    for (let r = 10; r <= foot; r++) {
      const a = r <= 11 ? 2 + (r - 10) : long ? 4 : 3;
      if (back) {
        px(F, s * a, r, R[lit ? 3 : 2]);
        continue;
      }
      px(F, s * a, r, R[r === foot ? 2 : lit ? 4 : 2]);
      px(F, s * (a + 1), r, R[r === foot ? 1 : lit ? 3 : 1]);
    }
    if (!back) {
      // The fringe at the end.
      px(F, s * (long ? 4 : 3), foot + 1, R[lit ? 3 : 1]);
      px(F, s * (long ? 5 : 4), foot + 1, R[1]);
    }
  }
}

function armsFront(F: Fig, back: boolean): void {
  const { pal } = F;
  const [a0, a1] = armCols(F);
  for (const s of [-1, 1] as const) {
    const lit = litSide(F, s);
    for (let r = 11; r <= 19; r++) {
      for (let a = a0; a <= a1; a++) {
        let k = lit ? (a === a1 ? 3 : 2) : a === a0 ? 2 : 1;
        if (r === 11) k += 1;
        if (pal.mail && r % 2 === 0) k -= 1;
        if (!pal.bare && r === 19) k = lit ? 4 : 2;
        px(F, s * a, r, pal.arm[Math.max(0, Math.min(4, k))]);
      }
    }
    // The hands.
    for (let a = a0; a <= a1; a++) {
      px(F, s * a, 20, pal.skin[lit ? 3 : 2]);
      px(F, s * a, 21, pal.skin[lit ? (back ? 2 : 3) : 1]);
    }
  }
}

function neck(F: Fig, x0: number): void {
  const S = F.pal.skin;
  for (let dx = -1; dx <= 1; dx++) px(F, x0 + dx, 9, S[F.light * dx < 1 ? 2 : 1]);
}

function headFront(F: Fig): void {
  const S = F.pal.skin;
  for (let r = 0; r < HEAD_F.length; r++) {
    const hw = HEAD_F[r];
    for (let dx = -hw; dx <= hw; dx++) {
      let k = F.light * dx === hw ? 2 : 3;
      if (r === 8 && F.light * dx >= 0) k = 2;
      px(F, dx, r, S[k]);
    }
  }
  const hk = F.look.hat?.kind;
  if (hk === 'hood' || hk === 'kettle' || F.look.hairStyle === 'bob') return;
  // The ears.
  for (const s of [-1, 1] as const) {
    px(F, s * 5, 4, S[litSide(F, s) ? 3 : 2]);
    px(F, s * 5, 5, S[litSide(F, s) ? 2 : 1]);
  }
}

/**
 * The face, facing you: big eyes (a lash line over an iris dark at its top and bright at its foot,
 * a white glint on each iris's upper left), a small mouth, a touch of blush.
 */
function faceFront(F: Fig): void {
  const { pal } = F;
  const glow = !!F.look.tall?.glow;
  const old = F.look.beard === 'long';
  const S = pal.skin;
  for (const s of [-1, 1] as const) {
    const x0 = s < 0 ? -3 : 2;
    if (F.shut) {
      px(F, x0, 4, S[3]);
      px(F, x0 + 1, 4, S[3]);
      px(F, x0, 5, S[2]);
      px(F, x0 + 1, 5, S[2]);
      px(F, x0, 6, pal.lash);
      px(F, x0 + 1, 6, pal.lash);
      continue;
    }
    if (old) {
      // Older eyes: a heavier lid, the iris narrower under it.
      px(F, x0, 4, S[2]);
      px(F, x0 + 1, 4, S[2]);
      px(F, x0, 5, pal.lash);
      px(F, x0 + 1, 5, pal.lash);
      px(F, x0, 6, pal.iris[1]);
      px(F, x0 + 1, 6, s < 0 ? pal.iris[2] : pal.iris[1]);
      continue;
    }
    px(F, x0, 4, pal.lash);
    px(F, x0 + 1, 4, pal.lash);
    const put = glow ? (dx: number, r: number, c: string) => gl(F, dx, r, c) : (dx: number, r: number, c: string) => px(F, dx, r, c);
    put(x0, 5, glow ? pal.iris[2] : '#ffffff');
    put(x0 + 1, 5, pal.iris[glow ? 1 : 0]);
    put(x0, 6, pal.iris[glow ? 1 : 2]);
    put(x0 + 1, 6, pal.iris[glow ? 0 : 2]);
    if (F.slim) px(F, s < 0 ? x0 - 1 : x0 + 2, 4, pal.lash);
  }
  // The mouth, and a touch of blush on the cheeks.
  px(F, 0, 7, pal.lip);
  if (F.slim && lum(S[3]) > 150) for (const s of [-1, 1]) px(F, s * 3, 7, mixHex(S[3], '#ff6a82', 0.3));
}

// ------------------------------------------------------------------ hair, beards, glasses and hats (facing you)

/*
 * Hair templates, facing you: tone digits ('0' deepest to '4' shine), columns -6..6 (the middle on
 * column 6), rows from three above the crown. From behind, the BACK ones.
 */
const HAIR_F: Record<'short' | 'bob' | 'bun' | 'bald', readonly string[]> = {
  short: [
    '....3...2....',
    '...33..32.2..',
    '..34433322...',
    '.34443333222.',
    '3443433332221',
    '.3332232322 .',
    '.32.3.2..2.1.',
    '.32...2....1.',
    '.2.........1.',
  ],
  bob: [
    '.............',
    '....33322....',
    '..344433322..',
    '.34443333221.',
    '.34433333221.',
    '.333333332221',
    '.32.......21.',
    '.32.......21.',
    '.32.......21.',
    '.32.......21.',
    '.22.......11.',
  ],
  bun: [
    '.....333.....',
    '....34332....',
    '.....332.....',
    '...3333322...',
    '..344333322..',
    '.3333232221..',
    '.32.......1..',
    '.2.........1.',
  ],
  bald: [
    '.............',
    '.............',
    '.............',
    '.............',
    '.............',
    '.............',
    '.............',
    '..3.......1..',
    '.32.......21.',
    '.2.........1.',
  ],
};
const HAIR_BACK: Record<'short' | 'bob' | 'bun' | 'bald', readonly string[]> = {
  short: [
    '....3...2....',
    '...33..32.2..',
    '..34433322...',
    '.34443333222.',
    '3443433332221',
    '.3333333322 .',
    '.3333333322..',
    '.3332223221..',
    '..3222222211.',
    '...22222211..',
    '....22221....',
  ],
  bob: [
    '.............',
    '....33322....',
    '..344433322..',
    '.34443333221.',
    '.34433333221.',
    '.333333332221',
    '.33333333221.',
    '.33333332221.',
    '.32333322221.',
    '.32233222211.',
    '.22222222211.',
  ],
  bun: [
    '.....333.....',
    '....34332....',
    '.....332.....',
    '...3333322...',
    '..344333322..',
    '.3333332221..',
    '.3333332221..',
    '.2333322211..',
    '..22222221...',
  ],
  bald: [
    '.............',
    '.............',
    '.............',
    '.............',
    '.............',
    '.............',
    '.............',
    '..3.......1..',
    '.32222222221.',
    '.22222222211.',
  ],
};

function hairFront(F: Fig, back: boolean): void {
  const st = F.look.hairStyle;
  if (st === 'none') return;
  const hk = F.look.hat?.kind;
  const T = (back ? HAIR_BACK : HAIR_F)[st];
  if (hk === 'kettle' || hk === 'beret' || hk === 'straw' || hk === 'kerchief') {
    // Under a hat only what falls below its brim shows.
    stamp(F, T.slice(6), 6, 3, F.pal.hair);
    return;
  }
  if (st === 'bald' && !back) {
    // The crown's shine.
    px(F, -2, 1, F.pal.skin[4]);
    px(F, -1, 1, F.pal.skin[4]);
  }
  stamp(F, T, 6, -3, F.pal.hair);
}

function beardFront(F: Fig): void {
  const B = F.pal.beard;
  if (F.look.beard === 'mustache') {
    stamp(F, ['.3332.', '2....1'], 3, 7, B);
    px(F, 0, 7, F.pal.skin[2]);
    return;
  }
  if (F.look.beard === 'long') {
    stamp(F, ['3.......1', '43332221', '.433322.', '.343321.', '..3322..', '..3321..', '..3321..', '...32...', '...32...', '...21...', '...2....'], 4, 5, B);
    px(F, 0, 7, F.pal.skin[1]);
    return;
  }
  if (F.look.beard === 'full') {
    stamp(F, ['3.......1', '33.....21', '.3433322.', '.343322..', '..3321...', '...21....'], 4, 5, B);
    px(F, 0, 7, F.pal.skin[1]);
    return;
  }
  if (F.look.beard === 'goatee') stamp(F, ['.21.', '.21.'], 1, 8, B);
}

function glassesFront(F: Fig): void {
  // Small round brass frames: their outer rims, the bridge over the nose, a glint on each lens' foot.
  const BR = ['#4a2a18', '#94642a', '#e0b056'];
  for (const s of [-1, 1] as const) {
    const x0 = s < 0 ? -3 : 2;
    px(F, s < 0 ? x0 - 1 : x0 + 2, 5, BR[s < 0 ? 2 : 0]);
    px(F, s < 0 ? x0 - 1 : x0 + 2, 6, BR[1]);
  }
  px(F, -1, 5, BR[1]);
  px(F, 0, 4, BR[2]);
  px(F, 1, 5, BR[1]);
}

/*
 * Hats facing you: columns -7..7 (the middle on column 7). Tone digits in the hat's own ramp, 't'
 * its trim (light), 'u' trim (dark), '.' clear, 'x' clear and keeps the face (the hood's opening).
 */
/** A hood facing you: a soft point, its trimmed opening framing the whole face, falling to a short cape. */
const HOOD_F = [
  '......333......',
  '....3443332....',
  '...344433322...',
  '..34443333222..',
  '.34ttttttttt22.',
  '34t.........u21',
  '34t.........u21',
  '33t.........u21',
  '33t.........u21',
  '33t.........u21',
  '32tt.......uu21',
  '.332tt...uu221.',
  '3333322.2222211',
  '333322222222211',
];
const HOOD_BACK = [
  '.......33......',
  '.....334332....',
  '....34433322...',
  '...3443333222..',
  '..344333333222.',
  '..343333333322.',
  '..333333333221.',
  '..333333332221.',
  '..333333332221.',
  '..333333322221.',
  '..332333222221.',
  '.33332322222211',
  '.333332222222211',
];
const KETTLE_F = ['....334433.....', '...34443332....', '..3443333322...', '..44333333221..', '.4344444443321.', '..1111111111...'];
const KERCHIEF_F = ['.........2.3...', '....33332343...', '...3443333222..', '..344344343221.', '..3333333332221', '..2211111111.1.'];
const BERET_F = ['......u.......', '...3333322....', '.344443333221.', '34444333332221', '.ttttttttuuu..'];
const STRAW_F = ['.....3333......', '....343332.....', '....tttttu.....', '.344443333322..', '33333333333221.'];

function hatFront(F: Fig, back: boolean): void {
  const h = F.look.hat!;
  const R = F.pal.hat!;
  const T = F.pal.trim ?? R;
  const draw = (rows: readonly string[], r0: number) => {
    rows.forEach((row, i) => {
      for (let j = 0; j < row.length; j++) {
        const ch = row[j];
        if (ch === '.' || ch === 'x') continue;
        const c = ch === 't' ? T[3] : ch === 'u' ? T[1] : R[Number(ch)];
        px(F, j - 7, r0 + i, c);
      }
    });
  };
  if (h.kind === 'hood') {
    draw(back ? HOOD_BACK : HOOD_F, -3);
    if (!back && F.look.tall?.glow) {
      // Her face in the hood's shadow, her hair swept from a parting under its brim.
      for (let r = 2; r <= 4; r++) for (let dx = -4; dx <= 4; dx++) F.L.tint(CX + dx, row(F, r, true), R[0], r === 2 ? 0.4 : r === 3 ? 0.22 : 0.1);
    }
    if (!back) {
      const H = F.pal.hair;
      for (let dx = -4; dx <= 4; dx++) px(F, dx, 2, dx === 0 ? H[1] : H[dx < 0 ? 3 : 2]);
      px(F, -4, 3, H[2]);
      px(F, 4, 3, H[1]);
    }
    return;
  }
  if (h.kind === 'kettle') {
    draw(KETTLE_F, -3);
    return;
  }
  if (h.kind === 'kerchief') {
    draw(KERCHIEF_F, -3);
    return;
  }
  if (h.kind === 'beret') {
    draw(BERET_F, -3);
    return;
  }
  draw(STRAW_F, -3);
}

// ------------------------------------------------------------------ the side view (painted facing right)

function side(F: Fig, tool?: TallTool): void {
  const { look, pal } = F;
  const long = !!look.item && LONG.has(look.item);
  if (look.pack) packSide(F);
  if (F.sit) lapSide(F);
  else if (F.dress) skirtSide(F);
  else legsSide(F);
  torsoSideP(F);
  if (pal.panel) panelSide(F);
  neck(F, 0);
  headSide(F);
  faceSide(F);
  hairSide(F);
  if (look.beard) beardSide(F);
  if (look.glasses) {
    px(F, 1, 4, '#e0b056');
    px(F, 2, 4, '#94642a');
    px(F, 3, 5, '#e0b056');
    px(F, 0, 5, '#4a2a18');
  }
  if (look.hat) hatSide(F);
  // A staff or a spear stands in front of the face, gripped in the near hand held out to it.
  if (long) longItem(F, look.item!, 'side');
  armSide(F, long || tool === 'candle');
  if (look.item && !long) heldItem(F, look.item, 'side');
  if (tool) heldTool(F, tool, 'side');
}

/** [back, front] columns of the far and near legs from the crotch down, from the side. */
function legsSide(F: Fig): void {
  const P = F.pal.pants;
  for (let r = 20; r <= 35; r++) {
    const thigh = r <= 27;
    // The far leg, a step behind and darker.
    const [f0, f1] = thigh ? [-3, 1] : [-2, 0];
    for (let dx = f0; dx <= f1; dx++) px(F, dx, r, P[1], false);
    const [n0, n1] = thigh ? [-2, 2] : [-1, 1];
    for (let dx = n0; dx <= n1; dx++) {
      let k = 3;
      if (dx === n0) k = F.light > 0 ? 3 : 2;
      if (dx === n1) k = F.light > 0 ? 2 : 3;
      if (r === 28 && dx === n1) k = 1;
      px(F, dx, r, P[k], false);
    }
  }
  // The shoes: the far one a step behind in shadow, the near one's toe forward.
  const S = F.pal.shoes;
  for (let dx = -2; dx <= 1; dx++) px(F, dx, 36, S[1], false);
  for (let dx = -1; dx <= 2; dx++) px(F, dx, 36, S[3], false);
  for (let dx = -2; dx <= 3; dx++) px(F, dx, 37, S[2], false);
}

function skirtSide(F: Fig): void {
  const C = F.pal.shirt;
  for (let r = 15; r <= 35; r++) {
    const b = r < 17 ? -2 : -3 - Math.floor((r - 17) / 5);
    const fr = r < 17 ? 2 : 2 + Math.floor((r - 17) / 7);
    for (let dx = b; dx <= fr; dx++) {
      let k = 3;
      if (dx === b) k = F.light > 0 ? 3 : 1;
      if (dx === fr) k = F.light > 0 ? 1 : 3;
      if (r >= 22 && dx === Math.round((b + fr) / 2)) k = 2;
      if (r === 35) k = Math.max(1, k - 1);
      px(F, dx, r, C[k], r < 20);
    }
  }
  const S = F.pal.shoes;
  for (let dx = 0; dx <= 3; dx++) px(F, dx, 36, S[dx === 3 ? 2 : 3], false);
  for (let dx = 0; dx <= 3; dx++) px(F, dx, 37, S[1], false);
}

/** Sitting, from the side: the thighs out level from the seat to the knee, the shins down, the feet forward. */
function lapSide(F: Fig): void {
  const P = F.dress ? F.pal.shirt : F.pal.pants;
  for (let r = 25; r <= 28; r++) {
    for (let dx = -3; dx <= 6; dx++) {
      let k = r === 25 ? 4 : r === 28 ? 1 : 3;
      if (F.dress && r === 25) k = 3;
      px(F, dx, r, P[k], false);
    }
  }
  for (let r = 29; r <= 35; r++) {
    const [a, b] = F.dress ? [3, 7] : [4, 6];
    for (let dx = a; dx <= b; dx++) {
      if (F.dress && r < 31 && dx === a) continue;
      let k = dx === a ? (F.light > 0 ? 3 : 2) : dx === b ? (F.light > 0 ? 1 : 3) : 3;
      if (F.dress && r === 35) k = 1;
      px(F, dx, r, P[k], false);
    }
  }
  const S = F.pal.shoes;
  for (let dx = 4; dx <= 7; dx++) px(F, dx, 36, S[3], false);
  for (let dx = 4; dx <= 8; dx++) px(F, dx, 37, S[1], false);
}

function torsoSideP(F: Fig): void {
  const C = F.pal.shirt;
  const last = F.dress && !F.sit ? 16 : 19;
  for (let r = 10; r <= last; r++) {
    const [b, fr] = torsoSide(F, r);
    for (let dx = b; dx <= fr; dx++) {
      let k = 3;
      if (dx === b) k = F.light > 0 ? 3 : 1;
      if (dx === fr) k = F.light > 0 ? 1 : 3;
      if (r === 10) k = 4;
      px(F, dx, r, C[k]);
    }
  }
  if (!(F.look.panel && (F.look.panel.kind === 'apron' || F.look.panel.kind === 'bib'))) {
    const r = F.dress ? 15 : 16;
    const [b, fr] = torsoSide(F, r);
    const cord = F.dress;
    const B = cord ? cel(['#6a4a10', '#b8862a', '#f0c850']) : cel(['#24140e', '#4a2c1a', '#7a4e2c']);
    for (let dx = b; dx <= fr; dx++) px(F, dx, r, B[(dx + 20) % 2 && cord ? 2 : 3]);
  }
}

function panelSide(F: Fig): void {
  const R = F.pal.panel!;
  const kind = F.look.panel!.kind;
  if (kind === 'apron' || kind === 'bib') {
    for (let r = 12; r <= 27; r++) {
      const fr = r < 20 ? torsoSide(F, Math.min(19, r))[1] + 1 : 3;
      px(F, fr, r, R[F.light > 0 ? 2 : 3], r < 20);
      px(F, fr - 1, r, R[3], r < 20);
    }
    for (let r = 10; r <= 11; r++) px(F, 0, r, R[3]);
    px(F, -1, 16, R[3]);
    px(F, -2, 16, R[2]);
    return;
  }
  if (kind === 'vest') {
    for (let r = 10; r <= 18; r++) {
      const [b] = torsoSide(F, r);
      for (let dx = b; dx <= 0; dx++) px(F, dx, r, R[dx === b ? (F.light > 0 ? 3 : 1) : 3]);
    }
    return;
  }
  if (kind === 'tabard') {
    for (let r = 11; r <= 27; r++) {
      const fr = r < 20 ? torsoSide(F, Math.min(19, r))[1] : 2;
      const bk = r < 20 ? torsoSide(F, Math.min(19, r))[0] : -3;
      px(F, fr, r, R[F.light > 0 ? 2 : 4], r < 20);
      px(F, fr - 1, r, R[3], r < 20);
      px(F, bk, r, R[F.light > 0 ? 3 : 1], r < 20);
    }
    return;
  }
  // A shawl over the shoulder, its end hanging down the front.
  for (let r = 10; r <= 12; r++) {
    const [b, fr] = torsoSide(F, r);
    for (let dx = b; dx <= fr; dx++) px(F, dx, r, R[r === 10 ? 4 : 3]);
  }
  for (let r = 13; r <= 18; r++) {
    px(F, 2, r, R[F.light > 0 ? 2 : 4]);
    px(F, 1, r, R[3]);
  }
}

function armSide(F: Fig, bent: boolean): void {
  const { pal } = F;
  if (bent) {
    // Bent at the elbow, the forearm out in front, the hand holding something up (or gripping a staff).
    for (let r = 11; r <= 15; r++) {
      for (const dx of [-1, 0]) {
        let k = dx === -1 ? (F.light > 0 ? 3 : 2) : F.light > 0 ? 2 : 3;
        if (r === 11) k += 1;
        if (pal.mail && r % 2 === 0) k -= 1;
        px(F, dx, r, pal.arm[Math.max(0, Math.min(4, k))]);
      }
    }
    for (const dx of [1, 2, 3]) {
      px(F, dx, 15, pal.arm[dx === 3 && !pal.bare ? 4 : 3]);
      px(F, dx, 16, pal.arm[1]);
    }
    px(F, 4, 15, pal.skin[3]);
    px(F, 5, 15, pal.skin[F.light > 0 ? 2 : 3]);
    px(F, 4, 16, pal.skin[2]);
    px(F, 5, 16, pal.skin[1]);
    return;
  }
  for (let r = 11; r <= 19; r++) {
    for (const dx of [-1, 0]) {
      let k = dx === -1 ? (F.light > 0 ? 3 : 2) : F.light > 0 ? 2 : 3;
      if (r === 11) k += 1;
      if (pal.mail && r % 2 === 0) k -= 1;
      if (!pal.bare && r === 19) k = 4;
      px(F, dx, r, pal.arm[Math.max(0, Math.min(4, k))]);
    }
    // The arm's shadow on the side of the chest in front of it.
    if (r > 11 && r < 19 && torsoSide(F, r)[1] >= 1) px(F, 1, r, F.pal.shirt[F.light > 0 ? 1 : 2]);
  }
  for (const dx of [-1, 0]) {
    px(F, dx, 20, pal.skin[3]);
    px(F, dx, 21, pal.skin[2]);
  }
}

function headSide(F: Fig): void {
  const S = F.pal.skin;
  HEAD_S.forEach(([b, fr], r) => {
    for (let dx = b; dx <= fr; dx++) {
      let k = 3;
      if (r >= 7 && dx <= 0) k = 2;
      if (r === 5 && dx === fr) k = 4;
      px(F, dx, r, S[k]);
    }
  });
  // The ear.
  px(F, -1, 4, S[2]);
  px(F, -1, 5, S[1]);
}

function faceSide(F: Fig): void {
  const { pal } = F;
  const glow = !!F.look.tall?.glow;
  const S = pal.skin;
  if (F.shut || F.look.beard === 'long') {
    px(F, 1, 4, S[3]);
    px(F, 2, 4, S[2]);
    px(F, 1, 5, pal.lash);
    px(F, 2, 5, pal.lash);
    if (F.look.beard === 'long' && !F.shut) px(F, 2, 6, pal.iris[1]);
  } else {
    px(F, 1, 4, pal.lash);
    px(F, 2, 4, pal.lash);
    if (F.slim) px(F, 0, 4, pal.lash);
    const put = glow ? (dx: number, r: number, c: string) => gl(F, dx, r, c) : (dx: number, r: number, c: string) => px(F, dx, r, c);
    put(1, 5, glow ? pal.iris[1] : pal.iris[0]);
    put(2, 5, glow ? pal.iris[2] : '#ffffff');
    put(1, 6, pal.iris[glow ? 1 : 2]);
    put(2, 6, pal.iris[2]);
  }
  px(F, 3, 7, pal.lip);
}

/* Hair from the side (facing right): columns -6..4 (the middle on column 6), rows from three above the crown. */
const HAIR_S: Record<'short' | 'bob' | 'bun' | 'bald', readonly string[]> = {
  short: [
    '...3..2....',
    '..33.322...',
    '.3443332...',
    '34443333222',
    '444333333.2',
    '.33333332..',
    '.3333322...',
    '.3332.2....',
    '.3322......',
    '..322......',
    '...21......',
  ],
  bob: [
    '...........',
    '...33322...',
    '..3443332..',
    '.344433322.',
    '.344333322.',
    '.333333332.',
    '.33333332..',
    '.3333332...',
    '.3332222...',
    '.3322222...',
    '.322222....',
    '..2222.....',
  ],
  bun: [
    '.333.......',
    '34432......',
    '.3332......',
    '..33332....',
    '.34433322..',
    '.33333322..',
    '.333332....',
    '.33322.....',
    '..322......',
  ],
  bald: [
    '...........',
    '...........',
    '...........',
    '...........',
    '...........',
    '...........',
    '...........',
    '..32.......',
    '.322.......',
    '.22........',
  ],
};

function hairSide(F: Fig): void {
  const st = F.look.hairStyle;
  if (st === 'none') return;
  const hk = F.look.hat?.kind;
  const T = HAIR_S[st];
  if (hk === 'kettle' || hk === 'beret' || hk === 'straw' || hk === 'kerchief') {
    stamp(F, T.slice(6), 6, 3, F.pal.hair);
    return;
  }
  if (st === 'bald') {
    px(F, -1, 1, F.pal.skin[4]);
    px(F, 0, 1, F.pal.skin[4]);
  }
  stamp(F, T, 6, -3, F.pal.hair);
}

function beardSide(F: Fig): void {
  const B = F.pal.beard;
  if (F.look.beard === 'mustache') {
    px(F, 2, 7, B[3]);
    px(F, 3, 7, B[2]);
    px(F, 2, 8, B[1]);
    return;
  }
  if (F.look.beard === 'long') {
    stamp(F, ['3....', '43321', '33322', '.3332', '.3332', '..332', '..322', '..32.', '..32.', '...2.', '...2.'], 1, 5, B);
    return;
  }
  if (F.look.beard === 'full') {
    stamp(F, ['3....', '43321', '33322', '.3321', '..21.'], 1, 5, B);
  }
}

/* Hats from the side (facing right): columns -7..7 (the middle on column 7). */
/** A hood from the side: puffed over the crown, its trimmed edge framing the face from the brow down to the throat, a drape over the shoulder. */
const HOOD_S = [
  '......333......',
  '....3443332....',
  '...344433332...',
  '..34443333322..',
  '..34443tttt....',
  '.344433t.......',
  '.344333t.......',
  '.343333t.......',
  '.343332t.......',
  '.333332t.......',
  '.33332t........',
  '.3332tt........',
  '.3332tt........',
  '33322222u......',
  '3332222221.....',
  '.33222221......',
];
/** An iron kettle helm from the side: a round dome, a wide brim. */
const KETTLE_S = ['.....3344.....', '...34443332...', '..3444333322..', '..3443333322..', '..3433333221..', '.444444444332.', '..1111111111..'];
const KERCHIEF_S = ['.23...........', '2343333.......', '.34433332.....', '.344343332....', '.3333333322...', '.2211111111...', '.21...........', '.1............'];
const BERET_S = ['.....u........', '..3333322.....', '.34443333221..', '344443333322..', '.tttttttuu....'];

function hatSide(F: Fig): void {
  const h = F.look.hat!;
  const R = F.pal.hat!;
  const T = F.pal.trim ?? R;
  const draw = (rows: readonly string[], r0: number) => {
    rows.forEach((row, i) => {
      for (let j = 0; j < row.length; j++) {
        const ch = row[j];
        if (ch === '.') continue;
        px(F, j - 7, r0 + i, ch === 't' ? T[3] : ch === 'u' ? T[1] : R[Number(ch)]);
      }
    });
  };
  if (h.kind === 'hood') {
    draw(HOOD_S, -3);
    // Her hair under the brim, a lock down the temple.
    const H = F.pal.hair;
    px(F, 1, 2, H[3]);
    px(F, 2, 2, H[2]);
    px(F, 1, 3, H[2]);
    if (F.look.tall?.glow) for (let dx = -1; dx <= 3; dx++) for (let r = 2; r <= 4; r++) F.L.tint(CX + dx, row(F, r, true), R[0], 0.4);
    return;
  }
  if (h.kind === 'kettle') {
    draw(KETTLE_S, -3);
    return;
  }
  if (h.kind === 'kerchief') {
    draw(KERCHIEF_S, -3);
    return;
  }
  if (h.kind === 'beret') {
    draw(BERET_S, -3);
    return;
  }
  draw(STRAW_F, -3);
}

// ------------------------------------------------------------------ packs, things held

function packBehind(F: Fig): void {
  const R = cel(F.look.pack!);
  // From the front: its top roll over the shoulders, its sides past them.
  for (let r = 7; r <= 18; r++) {
    for (let dx = -7; dx <= 7; dx++) {
      if (r < 9 && Math.abs(dx) > 5) continue;
      const k = r === 7 ? 3 : F.light * dx < 0 ? 2 : 1;
      px(F, dx, r, r < 9 ? cel(['#7a6a50', '#b8a888', '#e8dcc0'])[r === 7 ? 3 : 2] : R[k]);
    }
  }
}

function packBack(F: Fig): void {
  const R = cel(F.look.pack!);
  for (let r = 8; r <= 19; r++) {
    for (let dx = -5; dx <= 5; dx++) {
      let k = F.light * dx <= 0 ? 3 : 2;
      if (Math.abs(dx) === 5) k = 1;
      if (r === 8) k = 4;
      if (r === 13) k = 1;
      px(F, dx, r, r < 10 ? cel(['#7a6a50', '#b8a888', '#e8dcc0'])[r === 8 ? 3 : 2] : R[k]);
    }
  }
  px(F, 0, 15, '#ffd86a');
}

function packSide(F: Fig): void {
  const R = cel(F.look.pack!);
  for (let r = 8; r <= 20; r++) {
    for (let dx = -8; dx <= -3; dx++) {
      let k = dx === -8 ? (F.light > 0 ? 3 : 1) : 2;
      if (r === 13) k = 1;
      px(F, dx, r, r < 10 ? cel(['#7a6a50', '#b8a888', '#e8dcc0'])[r === 8 ? 3 : 2] : R[k]);
    }
  }
}

/** Where a figure's hand holds things: facing you the hand on the right (as you look); from the side the near hand. */
function handAt(F: Fig, view: 'down' | 'side'): [number, number] {
  if (view === 'side') return [0, 20];
  return [armCols(F)[1] - 0.5, 20];
}

/** The things held that stand on the floor. */
const LONG: ReadonlySet<NpcLook['item']> = new Set(['staff', 'orbStaff', 'spear', 'pitchfork']);

/**
 * Long things stand on the floor, held in the hand: beside the figure facing you, in front of the face
 * from the side (painted before the hand that grips them).
 */
function longItem(F: Fig, item: NonNullable<NpcLook['item']>, view: 'down' | 'side'): void {
  if (!LONG.has(item)) return;
  const x = view === 'side' ? 5 : armCols(F)[1] + 1;
  const WOOD = ['#2a160c', '#4a2c18', '#6e4426', '#946a40', '#b88c5a'];
  const top = item === 'spear' ? -3 : -2;
  const seat = F.sit ? SIT : 0;
  for (let r = top + seat; r <= 37; r++) {
    px(F, x, r, WOOD[3], false);
    px(F, x + 1, r, WOOD[1], false);
  }
  const t = top + seat;
  if (item === 'orbStaff') {
    const ORB = ['#3a1a6a', '#6a3ab8', '#9a6af0', '#d0b0ff', '#fff4ff'];
    for (const [dx, dy, k] of [[0, -3, 3], [1, -3, 2], [-1, -2, 3], [0, -2, 4], [1, -2, 2], [2, -2, 1], [-1, -1, 2], [0, -1, 3], [1, -1, 2], [2, -1, 1], [0, 0, 1], [1, 0, 1]] as const) F.L.gl(CX + x + dx, row(F, t + dy, false), ORB[k]);
    px(F, x, t + 1, '#f0c850', false);
    px(F, x + 1, t + 1, '#b8862a', false);
    F.L.light(CX + x, row(F, t - 2, false), 18, '#b08aff', 0.4);
  } else if (item === 'spear') {
    const M = ['#2a2a34', '#7a7a8e', '#b0b0c2', '#f2f6fc'];
    for (const [dx, dy, k] of [[0, -5, 3], [0, -4, 3], [1, -4, 1], [-1, -3, 2], [0, -3, 3], [1, -3, 1], [-1, -2, 2], [0, -2, 3], [1, -2, 1], [0, -1, 2], [1, -1, 1]] as const) px(F, x + dx, t + dy, M[k], false);
    px(F, x, t, '#f0c850', false);
    px(F, x + 1, t, '#b8862a', false);
    px(F, x - 1, t + 1, '#c8382a', false);
    px(F, x - 1, t + 2, '#8a2020', false);
  } else if (item === 'staff') {
    // A crook at the top.
    for (const [dx, dy, k] of [[0, -1, 3], [0, -2, 3], [1, -3, 3], [2, -3, 3], [3, -2, 2], [3, -1, 1]] as const) px(F, x + dx, t + dy, WOOD[k], false);
    px(F, x, t + 4, '#f0c850', false);
  }
}

/** Short things held in the hand, painted over it. */
function heldItem(F: Fig, item: NonNullable<NpcLook['item']>, view: 'down' | 'side'): void {
  const [hx, hy] = handAt(F, view);
  const x = Math.round(hx);
  if (item === 'ledger' || item === 'map' || item === 'scroll') {
    // A book held against the hip: a red cover, the pages' edge.
    const C = ['#5a1414', '#8a2020', '#c8302a', '#e85040'];
    for (let r = hy - 4; r <= hy; r++) {
      for (let dx = 0; dx <= 2; dx++) px(F, x - 1 + dx, r, dx === 2 ? '#f2e6c6' : C[r === hy - 4 ? 3 : dx === 0 ? 2 : 1]);
    }
  }
}

/** A keeper's tool in the hand: a wrench, a candle on a dish (lit), a hammer, tongs, a book, a cup. */
function heldTool(F: Fig, tool: TallTool, view: 'down' | 'side'): void {
  const M = ['#2a2a34', '#5a6072', '#9aa2b2', '#e6e8f0'];
  if (tool === 'candle') {
    const [x, y] = view === 'side' ? [5, 14] : [Math.round(handAt(F, view)[0]), 19];
    const BR = ['#5a3a10', '#b8862a', '#f0c850'];
    px(F, x - 1, y, BR[1]);
    px(F, x, y, BR[2]);
    px(F, x + 1, y, BR[1]);
    px(F, x, y - 1, '#fff4e0');
    px(F, x, y - 2, '#fff4e0');
    px(F, x, y - 3, '#3a2a24');
    gl(F, x, y - 4, '#ffb040');
    gl(F, x, y - 5, '#fff4c0');
    F.L.halo(CX + x, row(F, y - 6, true), '#ffd060', 0.5);
    F.L.light(CX + x, row(F, y - 4, true), 24, '#ffb060', 0.45, 0.3);
    return;
  }
  const [hx, hy] = handAt(F, view);
  const x = Math.round(hx);
  if (tool === 'wrench') {
    for (let r = hy - 6; r <= hy; r++) px(F, x, r, M[r % 2 ? 2 : 3]);
    for (const [dx, dy, k] of [[-1, -7, 3], [-1, -8, 3], [0, -9, 2], [1, -8, 2], [1, -7, 1], [0, -6, 2]] as const) px(F, x + dx, hy + dy, M[k]);
    return;
  }
  if (tool === 'hammer') {
    for (let r = hy - 5; r <= hy; r++) px(F, x, r, '#946a40');
    for (let dx = -2; dx <= 2; dx++) {
      px(F, x + dx, hy - 7, M[2]);
      px(F, x + dx, hy - 6, M[1]);
    }
    return;
  }
  if (tool === 'tongs') {
    for (let r = hy - 6; r <= hy; r++) {
      px(F, x, r, M[3]);
      if (r < hy - 3) px(F, x + 1, r - 1, M[1]);
    }
    return;
  }
  if (tool === 'book') {
    for (let r = hy - 3; r <= hy; r++) for (let dx = 0; dx <= 2; dx++) px(F, x - 1 + dx, r, dx === 2 ? '#f2e6c6' : '#a8302a');
    return;
  }
  // A cup.
  for (let dx = -1; dx <= 1; dx++) {
    px(F, x + dx, hy - 2, '#f4ead2');
    px(F, x + dx, hy - 1, '#9a6a3a');
  }
}
