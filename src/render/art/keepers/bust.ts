/**
 * A keeper drawn big, from the waist up behind their counter: the same person as their little hub
 * sprite (art/hubNpcs.ts: the skin, hair, beard, glasses, hat, shirt and panel come from their NpcLook)
 * at about four times the size, so the face gets real eyes with lids and glints, brows, a nose, a
 * mouth, ears and cheeks; hair gets strands and a sheen; a hood its shadowed opening and trim; cloth
 * its folds, collar, buttons and seams. Lit from the top left like the rest of the game's art (the
 * scene's lamps do the rest: light.ts).
 *
 * Painted in two passes round the counter: `paintBust` draws the head and body (the counter, painted
 * after, hides the body's foot), and the `front` it returns draws what rests on the counter top in
 * front of it: the forearms, the hands and whatever they hold.
 */
import type { NpcLook, Ramp3 } from '../../../world/npcs';
import { mixHex } from '../draw';
import { h2, Layer, oval, rk } from '../hubKit';

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
/** The head's half-width on each row from its top: round, full cheeks, a soft chin. */
const HEAD = [4, 6, 7, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 8, 8, 7, 7, 6, 5, 3];
const HEAD_H = HEAD.length;

/** Where everything sits, from the bust's middle (cx) and the counter top (base). */
export function bustGeometry(cx: number, base: number) {
  const top = base - 50;
  return {
    cx,
    base,
    /** The head's top row and its middle row. */
    top,
    mid: top + 10,
    /** The eyes' row (their lid line). */
    eyeY: top + 10,
    /** The shoulders' top. */
    sy: top + HEAD_H + 2,
  };
}

export interface BustOut {
  /** Paints the arms, hands and anything held, over the counter top. Call after the counter. */
  front: (L: Layer) => void;
  /** The eyes' pixels shut (a blink): [x, y, color]. */
  blink: Array<[number, number, string]>;
}

/**
 * Paints a keeper's head and body on its own layer (outlined there) and copies it onto `L`. `cx` is
 * the bust's middle, `base` the counter top's row.
 */
export function paintBust(L: Layer, cx: number, base: number, spec: BustSpec): BustOut {
  const g = bustGeometry(cx, base);
  const B = new Layer(cx - 40, g.top - 14, 81, base - g.top + 22);
  const look = spec.look;
  const skin = ramp5(look.skin);
  const hair = ramp5(look.hair);
  const shirt = ramp5(look.shirt);
  const sleeves = ramp5(look.sleeves ?? look.shirt);
  const bareArms = !!look.sleeves && look.sleeves[1] === look.skin[1];
  const { top, sy } = g;

  // ---------------------------------------------------------------- the body
  // The torso: round shoulders off the neck, the chest under them, a little narrower toward the waist.
  const hwT = (y: number): number => {
    const d = y - sy;
    if (d < 0) return 0;
    return [8, 11, 13, 14, 14, 14, 14][Math.min(6, d)] - (d > 16 ? 1 : 0);
  };
  for (let y = sy; y <= base + 4; y++) {
    const hw = hwT(y);
    for (let x = cx - hw; x <= cx + hw; x++) {
      const dx = x - cx;
      // Lit from the left: brighter on the left, darker toward the right.
      let k = 2.3 - dx / 18 + (h2(x, y, 7) - 0.5) * 0.22;
      if (dx === hw) k -= 0.8;
      if (dx === -hw) k += 0.3;
      if (y <= sy + 1) k += 0.45;
      // A few soft folds down the front.
      if (y > sy + 9 && (dx === -6 || dx === 5) && h2(x, y >> 2, 3) < 0.7) k -= 0.45;
      B.px(x, y, rk(shirt, k));
    }
  }
  // The upper arms, hanging either side of the torso to the elbows (the forearms lie on the counter).
  const armR = bareArms ? skin : sleeves;
  for (const side of [-1, 1]) {
    for (let y = sy + 2; y <= base - 2; y++) {
      const d = y - sy;
      // The shoulder's cap rounds over, then the arm hangs nearly straight.
      const outer = d < 2 ? 15 : d < 4 ? 17 : d < 7 ? 18 : 18;
      const inner = d < 4 ? 12 : 14;
      for (let a = inner; a <= outer; a++) {
        const x = cx + side * a;
        // Each arm lit on its left edge, the right arm deeper in shadow.
        let k = 2.2 - (side > 0 ? 0.55 : 0) + (a === (side < 0 ? outer : inner) ? 0.7 : 0) - (a === (side < 0 ? inner : outer) ? 0.8 : 0);
        if (d <= 3) k += 0.35;
        B.px(x, y, rk(armR, k));
      }
      // The crease between arm and body.
      if (d >= 4) B.px(cx + side * 13, y, rk(side < 0 ? shirt : armR, 0.7));
    }
  }
  // The neck, shadowed under the chin.
  for (let y = top + HEAD_H - 2; y <= sy + 2; y++) {
    for (let x = cx - 3; x <= cx + 3; x++) B.px(x, y, rk(skin, y < sy ? 1 : 1.6 - (x - cx) / 5));
  }
  // The collar: a V at the neck, a darker edge round it.
  collar(B, g, look, shirt, skin);
  // Panels over the shirt.
  if (look.panel) panel(B, g, look.panel.kind, ramp4(look.panel.ramp), look);

  // ---------------------------------------------------------------- the head
  const inHead = (x: number, y: number) => {
    const r = y - top;
    return r >= 0 && r < HEAD_H && Math.abs(x - cx) <= HEAD[r];
  };
  for (let r = 0; r < HEAD_H; r++) {
    const y = top + r;
    for (let dx = -HEAD[r]; dx <= HEAD[r]; dx++) {
      const x = cx + dx;
      const nx = dx / 9.5;
      const ny = (r - 10) / 10.5;
      let k = 2.4 - nx * 1.15 - ny * 0.35;
      if (dx >= HEAD[r] - 1) k -= 0.7;
      if (dx === HEAD[r]) k -= 0.4;
      if (r >= HEAD_H - 3) k -= 0.5;
      // The cheekbone's light, and the jaw's shadow on the right.
      if (r >= 12 && r <= 15 && dx >= -7 && dx <= -4) k += 0.35;
      if (r >= 15 && dx >= 4) k -= 0.45;
      B.px(x, y, rk(skin, k));
    }
  }
  // Ears.
  for (const s of [-1, 1]) {
    const ex = cx + s * 10;
    for (let y = top + 10; y <= top + 14; y++) {
      const w = y === top + 10 || y === top + 14 ? 0 : 1;
      for (let i = 0; i <= w; i++) B.px(ex + s * i, y, rk(skin, s < 0 ? (i ? 2.6 : 1.6) : i ? 1.4 : 1));
    }
    B.px(ex, top + 12, rk(skin, 0.6));
  }
  const blink: Array<[number, number, string]> = [];
  face(B, g, spec, skin, hair, blink);
  // Hair (under any hat), beard, glasses, hat.
  hairDo(B, g, look, hair, skin, inHead);
  if (look.beard) beard(B, g, look.beard, ramp5(look.beardRamp ?? look.hair), skin);
  if (look.glasses) glasses(B, g);
  if (look.hat) hat(B, g, look.hat.kind, ramp5(look.hat.ramp), look.hat.trim ? ramp4(look.hat.trim) : null, hair, look);

  if (spec.tool === 'staff' || spec.tool === 'spear' || spec.tool === 'orbStaff') staff(B, cx + 23, base + 2, top - 10, spec.tool);

  B.outlineTinted(0.78, false);
  L.merge(B);

  return {
    blink,
    front: (F: Layer) => {
      const A = new Layer(cx - 32, g.top - 20, 65, base - g.top + 26);
      arms(A, g, spec, skin, bareArms ? skin : sleeves);
      A.outlineTinted(0.78, false);
      F.merge(A);
    },
  };
}

// ------------------------------------------------------------------ the face

function face(B: Layer, g: ReturnType<typeof bustGeometry>, spec: BustSpec, skin: string[], hair: string[], blink: Array<[number, number, string]>): void {
  const { cx, top } = g;
  const y = top + 10;
  const look = spec.look;
  const iris = spec.glowEyes ?? look.eyes ?? '#2a1a14';
  const irisDark = spec.glowEyes ? mixHex(spec.glowEyes, '#ff8a2a', 0.4) : mixHex(iris, '#0a0408', 0.5);
  const white = '#f6f0e8';
  const lid = mixHex(skin[0], INK, 0.55);
  const off = spec.look2 ?? 0;
  for (const s of [-1, 1]) {
    // Each eye, four pixels from its outer corner in: a lid line over white, a two-pixel iris with a
    // glint (moved by where the keeper looks) and white; the iris's lower half under it.
    const ex = cx + s * 4;
    const col = (i: number) => ex + (s < 0 ? i - 2 : 2 - i);
    for (let i = 0; i < 4; i++) B.px(col(i), y, lid);
    if (spec.lashes) {
      B.px(col(0) + s, y - 1, lid);
      B.px(col(0) + s, y, lid);
    }
    const row = y + 1;
    // Glowing eyes sit in shadow (no whites): only the light in them shows.
    const sclera = spec.glowEyes ? rk(skin, 0.6) : white;
    B.px(col(0), row, sclera);
    B.px(col(3), row, spec.glowEyes ? rk(skin, 0.8) : mixHex(white, skin[1], 0.35));
    if (spec.glowEyes) {
      B.px(col(0), row + 1, rk(skin, 0.8));
      B.px(col(3), row + 1, rk(skin, 0.9));
    }
    const ia = Math.min(col(1), col(2)) + off;
    B.px(ia, row, iris);
    B.px(ia + 1, row, irisDark);
    B.px(ia, row + 1, irisDark);
    B.px(ia + 1, row + 1, mixHex(irisDark, INK, 0.3));
    B.px(col(0), row + 1, rk(skin, 2.2));
    B.px(col(3), row + 1, rk(skin, 1.7));
    // The glint.
    B.px(ia, row, spec.glowEyes ? '#fff8c0' : mixHex(iris, '#ffffff', 0.6));
    if (spec.glowEyes) {
      B.gl(ia, row, '#fff8c0');
      B.gl(ia + 1, row, spec.glowEyes);
      B.gl(ia, row + 1, spec.glowEyes);
      B.gl(ia + 1, row + 1, irisDark);
    }
    // Under the eye.
    B.px(col(1), row + 2, rk(skin, spec.old ? 1.4 : 2));
    B.px(col(2), row + 2, rk(skin, spec.old ? 1.4 : 2));
    if (spec.old) {
      B.px(col(0) + s, row + 1, rk(skin, 1.4));
      B.px(col(0), row + 2, rk(skin, 1.6));
    }
    // A blink: the lid comes down over the eye.
    for (let i = 0; i < 4; i++) {
      blink.push([col(i), row, rk(skin, 1.8)]);
      blink.push([col(i), row + 1, i === 0 || i === 3 ? rk(skin, 2) : lid]);
    }
    // The brow, a little arched.
    const bc = mixHex(hair[1], INK, 0.3);
    for (let i = 0; i < 4; i++) B.px(col(i), y - 2 - (i === 1 || i === 2 ? 1 : 0), i === 3 ? hair[2] : bc);
  }
  // The nose: a shadow down its right side, a lit tip.
  B.px(cx + 1, y + 3, rk(skin, 1.7));
  B.px(cx + 1, y + 4, rk(skin, 1.3));
  B.px(cx, y + 5, rk(skin, 1));
  B.px(cx + 1, y + 5, rk(skin, 0.8));
  B.px(cx - 1, y + 4, rk(skin, 3.3));
  // Cheeks.
  const blush = mixHex(skin[2], '#e0505a', 0.32);
  for (const x of [cx - 7, cx - 6, cx + 5, cx + 6]) B.px(x, y + 5, blush);
  // The mouth.
  const m = spec.mouth ?? 'smile';
  const lip = spec.lashes ? mixHex(skin[1], '#b0303a', 0.45) : mixHex(skin[0], '#6a2028', 0.3);
  const my = y + 7;
  for (let x = cx - 2; x <= cx + 2; x++) B.px(x, my, lip);
  if (m === 'smile' || m === 'grin') {
    B.px(cx - 3, my - 1, lip);
    B.px(cx + 3, my - 1, lip);
  }
  if (m === 'grin') {
    for (let x = cx - 1; x <= cx + 1; x++) B.px(x, my + 1, '#f4ece0');
    B.px(cx - 2, my + 1, lip);
    B.px(cx + 2, my + 1, lip);
  } else {
    B.px(cx, my + 1, rk(skin, 3));
    B.px(cx - 1, my + 1, rk(skin, 2.6));
  }
  if (spec.old) {
    // Smile lines and a furrowed brow.
    B.px(cx - 5, my - 1, rk(skin, 1.5));
    B.px(cx - 5, my, rk(skin, 1.5));
    B.px(cx + 5, my - 1, rk(skin, 1.2));
    B.px(cx + 5, my, rk(skin, 1.2));
  }
}

// ------------------------------------------------------------------ hair

function hairDo(B: Layer, g: ReturnType<typeof bustGeometry>, look: NpcLook, hair: string[], skin: string[], inHead: (x: number, y: number) => boolean): void {
  const { cx, top } = g;
  const style = look.hairStyle;
  const tone = (x: number, y: number, base: number) => {
    // Strands: streaks running down and out from the crown, a sheen on the upper left.
    const dx = x - cx;
    const strand = h2(Math.floor((dx * 2 + (y - top)) / 3), 0, 13) - 0.5;
    let k = base + strand * 1.1 - dx / 14;
    if (dx < -2 && dx > -7 && y - top >= 1 && y - top <= 3) k += 1.1;
    return rk(hair, k);
  };
  if (style === 'none') return;
  if (style === 'bald') {
    // A sheen on the crown, a fringe of hair over the ears and round the back.
    B.px(cx - 4, top + 2, rk(skin, 4));
    B.px(cx - 3, top + 2, rk(skin, 4));
    B.px(cx - 4, top + 3, rk(skin, 3.4));
    for (const s of [-1, 1]) {
      for (let y = top + 6; y <= top + 12; y++) {
        const w = y < top + 8 ? 1 : 2;
        for (let i = 0; i < w; i++) B.px(cx + s * (9 - i), y, tone(cx + s * (9 - i), y, 2.2));
      }
      B.px(cx + s * 10, top + 9, tone(cx + s * 10, top + 9, 1.8));
      B.px(cx + s * 10, top + 8, tone(cx + s * 10, top + 8, 1.8));
    }
    return;
  }
  // Every other style: a cap of hair over the top of the head to a hairline above the brows.
  const line = (dx: number) => {
    // The hairline: low at the temples, a parting a little left of the middle.
    const a = Math.abs(dx);
    if (style === 'bob') return top + (a >= 7 ? 9 : a >= 4 ? 7 : 6);
    if (style === 'bun') return top + (a >= 8 ? 9 : a >= 5 ? 6 : 5);
    return top + (a >= 8 ? 9 : dx >= -2 && dx <= 1 ? 4 : 5);
  };
  for (let y = top - 1; y <= top + 12; y++) {
    for (let x = cx - 10; x <= cx + 10; x++) {
      const dx = x - cx;
      const inCap = (inHead(x, y) || (y === top - 1 && Math.abs(dx) <= 3) || (Math.abs(dx) <= HEAD[Math.max(0, y - top)] + 1 && y - top < 9 && y - top >= 1)) && y < line(dx);
      if (!inCap) continue;
      B.px(x, y, tone(x, y, 2.4 - (y - top) * 0.08));
    }
  }
  // A fringe's uneven edge and the shadow it casts on the forehead.
  for (let x = cx - 8; x <= cx + 8; x++) {
    const y = line(x - cx);
    if (h2(x, 1, 9) < 0.35 && style !== 'bun') B.px(x, y, tone(x, y, 1.8));
    if (inHead(x, y + (h2(x, 1, 9) < 0.35 && style !== 'bun' ? 1 : 0))) B.tone(x, y + (h2(x, 1, 9) < 0.35 && style !== 'bun' ? 1 : 0), -0.18);
  }
  if (style === 'bob') {
    // Curtains of hair either side of the face, down to the jaw.
    for (const s of [-1, 1]) {
      for (let y = top + 6; y <= top + 17; y++) {
        const inner = 8 - (y > top + 14 ? 1 : 0);
        for (let a = inner; a <= 11; a++) {
          if (y > top + 15 && a > 10) continue;
          B.px(cx + s * a, y, tone(cx + s * a, y, s < 0 ? 2.4 : 1.6));
        }
      }
      // The ends curl in under the jaw.
      B.px(cx + s * 9, top + 18, tone(cx + s * 9, top + 18, 1.4));
      B.px(cx + s * 10, top + 17, tone(cx + s * 10, top + 17, 1.5));
    }
  }
  if (style === 'bun') {
    // A bun on the crown.
    oval(B, look.hat?.kind === 'kerchief' ? cx - 4 : cx + 2, top - 3, 4.5, 3.5, (x, y, nx, ny) => tone(x, y, 2.6 - nx * 0.8 - ny * 0.8));
    B.px(look.hat?.kind === 'kerchief' ? cx - 5 : cx + 1, top - 5, rk(hair, 4));
    // Wisps at the temples.
    B.px(cx - 10, top + 9, tone(cx - 10, top + 9, 2));
    B.px(cx + 10, top + 9, tone(cx + 10, top + 9, 1.4));
  }
  if (style === 'short') {
    // Short sides over the ears.
    for (const s of [-1, 1]) for (let y = top + 6; y <= top + 10; y++) B.px(cx + s * 9, y, tone(cx + s * 9, y, s < 0 ? 2 : 1.4));
  }
}

// ------------------------------------------------------------------ beards

function beard(B: Layer, g: ReturnType<typeof bustGeometry>, kind: NonNullable<NpcLook['beard']>, r: string[], skin: string[]): void {
  const { cx, top } = g;
  const my = top + 17;
  const tone = (x: number, y: number, base: number) => {
    const dx = x - cx;
    const strand = h2(Math.floor(dx * 1.5 + (y % 2)), Math.floor(y / 3), 21) - 0.5;
    return rk(r, base + strand * 1.2 - dx / 10);
  };
  // A mustache, over the lip.
  const stache = () => {
    for (let x = cx - 4; x <= cx + 4; x++) {
      const a = Math.abs(x - cx);
      B.px(x, my - 1, tone(x, my - 1, 2.8 - a * 0.1));
      if (a >= 2) B.px(x, my, tone(x, my, 2.2));
    }
    B.px(cx - 5, my + 1, tone(cx - 5, my + 1, 2));
    B.px(cx + 5, my + 1, tone(cx + 5, my + 1, 1.5));
    B.px(cx, my, skin[1]);
  };
  if (kind === 'stubble') {
    for (let y = my - 2; y <= top + 20; y++) for (let x = cx - 7; x <= cx + 7; x++) if (h2(x, y, 4) < 0.35) B.tone(x, y, -0.22);
    return;
  }
  if (kind === 'mustache') {
    stache();
    return;
  }
  if (kind === 'goatee') {
    stache();
    for (let y = my + 1; y <= top + 22; y++) for (let x = cx - 2; x <= cx + 2; x++) B.px(x, y, tone(x, y, 2.3));
    return;
  }
  // Full or long: round the jaw from ear to ear, the mouth showing through.
  const bottom = kind === 'long' ? g.base + 2 : top + 25;
  for (let y = top + 12; y <= bottom; y++) {
    const d = y - (top + 12);
    let hw: number;
    if (kind === 'long') hw = y <= top + 20 ? Math.min(9, 7 + d) : Math.max(3, 9 - Math.floor((y - top - 20) / 4));
    else hw = y <= top + 19 ? 9 : Math.max(2, 9 - (y - top - 19) * 1.4);
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const dx = x - cx;
      // Leave the cheeks above the jaw line clear.
      if (y < my - 1 && Math.abs(dx) < 9 - (my - 1 - y) * 0.6 - 1) continue;
      if (y < top + 15 && Math.abs(dx) < 8) continue;
      // The mouth.
      if (y === my && Math.abs(dx) <= 1) continue;
      // Wavy strands at the long beard's foot.
      if (kind === 'long' && y > bottom - 3 && h2(x, 3, 2) < 0.4) continue;
      B.px(x, y, tone(x, y, 2.5 - (y - top - 12) * 0.03));
    }
  }
  stache();
}

// ------------------------------------------------------------------ glasses

function glasses(B: Layer, g: ReturnType<typeof bustGeometry>): void {
  const { cx, top } = g;
  const y = top + 9;
  const frame = '#3a2a24';
  const glint = '#f4fbff';
  for (const s of [-1, 1]) {
    const ex = cx + s * 4;
    // A round frame round each eye.
    for (let i = -2; i <= 1; i++) {
      B.px(ex + (s < 0 ? i : -i), y, frame);
      B.px(ex + (s < 0 ? i : -i), y + 4, frame);
    }
    for (let j = 1; j <= 3; j++) {
      B.px(ex + (s < 0 ? -3 : 3), y + j, frame);
      B.px(ex + (s < 0 ? 2 : -2), y + j, frame);
    }
    // A lens glint.
    B.px(ex + (s < 0 ? -2 : 1), y + 1, glint);
    // The arm back to the ear.
    B.px(ex + s * 4, y + 1, frame);
    B.px(ex + s * 5, y + 1, frame);
  }
  B.px(cx, y + 2, frame);
  B.px(cx - 1, y + 1, frame);
  B.px(cx + 1, y + 1, frame);
}

// ------------------------------------------------------------------ hats

function hat(B: Layer, g: ReturnType<typeof bustGeometry>, kind: NonNullable<NpcLook['hat']>['kind'], r: string[], trim: string[] | null, hair: string[], look: NpcLook): void {
  const { cx, top, sy } = g;
  if (kind === 'hood') {
    // A deep hood: round over the head, falling to the shoulders, the face in its shadowed opening.
    const ox = 13;
    const oyTop = top - 6;
    for (let y = oyTop; y <= sy + 5; y++) {
      for (let x = cx - ox - 3; x <= cx + ox + 3; x++) {
        const dx = x - cx;
        const t = (y - oyTop) / (sy + 5 - oyTop);
        // The hood's outline: a dome on top, widening to the shoulders.
        const hw = y < top + 8 ? Math.sqrt(Math.max(0, 1 - Math.pow((top + 8 - y) / 14.5, 2))) * 13 : 13 + Math.max(0, (y - sy + 3) * 1.4);
        if (Math.abs(dx) > hw) continue;
        // The face opening: an oval round the face.
        const fx = dx / 8.6;
        const fy = (y - (top + 12)) / 10;
        const inOpen = fx * fx + fy * fy < 1 && y > top + 2;
        if (inOpen) {
          // The shadow just inside the opening.
          if (fx * fx + fy * fy > 0.72) B.tone(x, y, -0.55);
          continue;
        }
        let k = 2.3 - dx / 11 - (t > 0.8 ? 0.4 : 0);
        // Folds falling from the crown.
        if ((Math.abs(dx) === 6 || Math.abs(dx) === 10) && y > top + 2) k -= 0.5;
        if (dx < -4 && y < top + 2) k += 0.8;
        B.px(x, y, rk(r, k));
        // The trim round the opening.
        if (trim && fx * fx + fy * fy < 1.32 && y > top + 1) B.px(x, y, rk(trim, 2 - dx / 10));
      }
    }
    // A few strands of hair across the forehead, under the hood (the Oracle's white hair).
    if (look.hairStyle === 'none') {
      for (let x = cx - 5; x <= cx + 4; x++) B.px(x, top + 3 + (x % 3 === 0 ? 1 : 0), rk(hair, 3 - (x - cx) / 6));
      for (let x = cx - 6; x <= cx + 5; x += 2) B.px(x, top + 4, rk(hair, 2.4));
    }
    return;
  }
  if (kind === 'kerchief') {
    // A headscarf tied over the crown: it covers the top of the head down to a folded hem above the
    // brow (the hair shows beneath it at the temples), dotted, knotted on top with two little ears.
    for (let y = top - 2; y <= top + 4; y++) {
      for (let x = cx - 10; x <= cx + 10; x++) {
        const dx = x - cx;
        const rr = y - top;
        const hw = rr < 0 ? 7 + rr + 1 : Math.min(10, (HEAD[Math.min(HEAD_H - 1, rr)] ?? 9) + 1);
        if (Math.abs(dx) > hw) continue;
        // The hem curves up a little at the temples.
        if (rr === 4 && Math.abs(dx) >= 7) continue;
        const hem = rr >= 3;
        let k = 2.5 - dx / 13 + (hem ? 0.7 : 0) - (rr === 4 ? 0.9 : 0);
        if (rr === -2 || Math.abs(dx) === hw) k -= 0.6;
        let c = rk(r, k);
        if (!hem && (x * 3 + y * 5) % 7 === 0) c = '#fff4e0';
        B.px(x, y, c);
      }
    }
    // The knot on top, a little to the right, its two ears sticking up.
    oval(B, cx + 5, top - 2, 2.5, 2, (_x, _y, nx, ny) => rk(r, 2.6 - nx - ny * 0.6));
    for (const [dx, dy, k] of [[3, -5, 2.6], [4, -4, 2.2], [3, -4, 3], [7, -5, 1.8], [8, -5, 1.6], [7, -4, 2], [8, -6, 2.2]] as const) B.px(cx + dx, top + dy, rk(r, k));
    return;
  }
  if (kind === 'beret') {
    // A flat round cap tipped to one side, a trim band, a little stalk.
    oval(B, cx + 2, top + 1, 12, 5, (_x, _y, nx, ny) => {
      let k = 2.4 - nx * 0.9 - ny * 0.9;
      if (ny > 0.55) k -= 0.6;
      return rk(r, k);
    });
    if (trim) for (let x = cx - 9; x <= cx + 10; x++) B.px(x, top + 4 + (x > cx + 6 ? 1 : 0), rk(trim, 2.3 - (x - cx) / 9));
    B.px(cx + 3, top - 5, r[1]);
    B.px(cx + 3, top - 4, r[2]);
    return;
  }
  if (kind === 'kettle') {
    // An iron kettle helm: a dome, a wide brim, rivets.
    oval(B, cx, top + 3, 10, 9, (_x, y, nx, ny) => (y > top + 6 ? null : rk(r, 1.7 - nx * 1.1 - ny * 0.6 + (nx < -0.35 && ny < -0.45 ? 1.1 : 0))));
    for (let x = cx - 14; x <= cx + 14; x++) {
      B.px(x, top + 6, rk(r, 2.4 - (x - cx) / 12));
      B.px(x, top + 7, rk(r, 1 - (x - cx) / 16));
    }
    for (const x of [cx - 6, cx, cx + 6]) B.px(x, top + 4, rk(r, 3.2));
    return;
  }
  // Anything else: a simple cap.
  oval(B, cx, top + 2, 10, 5, (_x, y, nx, ny) => (y > top + 4 ? null : rk(r, 2.4 - nx - ny)));
}

// ------------------------------------------------------------------ collar and panels

function collar(B: Layer, g: ReturnType<typeof bustGeometry>, look: NpcLook, shirt: string[], skin: string[]): void {
  const { cx, sy } = g;
  if (look.dress && look.panel?.kind === 'shawl') return;
  // A V at the throat, its edges a step darker, a lit fold on the left.
  for (let i = 0; i <= 3; i++) {
    for (let x = cx - 3 + i; x <= cx + 3 - i; x++) B.px(x, sy + i, rk(skin, 2 - (x - cx) / 6 - i * 0.2));
    B.px(cx - 4 + i, sy + i, rk(shirt, 3.6));
    B.px(cx + 4 - i, sy + i, rk(shirt, 1.2));
  }
  B.px(cx, sy + 4, rk(shirt, 1));
}

function panel(B: Layer, g: ReturnType<typeof bustGeometry>, kind: NonNullable<NpcLook['panel']>['kind'], r: string[], look: NpcLook): void {
  const { cx, sy, base } = g;
  if (kind === 'apron' || kind === 'bib') {
    // A bib from the chest down, straps over the shoulders round the neck, a pocket.
    for (let y = sy + 7; y <= base + 4; y++) {
      const hw = y < sy + 9 ? 7 : 8;
      for (let x = cx - hw; x <= cx + hw; x++) {
        const dx = x - cx;
        let k = 2 - dx / 20 + (h2(x, y, 5) - 0.5) * 0.3;
        if (dx === hw) k -= 0.7;
        if (dx === -hw) k += 0.3;
        if (y === sy + 7) k += 0.7;
        B.px(x, y, rk(r, k));
      }
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i <= 7; i++) {
        const x = cx + s * (7 - Math.floor(i / 2.4));
        B.px(x, sy + 7 - i, rk(r, s < 0 ? 2.4 : 1.4));
        B.px(x + s, sy + 7 - i, rk(r, s < 0 ? 1.8 : 1));
      }
    }
    // The pocket, and a pencil in it.
    for (let x = cx - 4; x <= cx + 4; x++) {
      B.px(x, sy + 14, rk(r, 0.6));
      B.px(x, sy + 19, rk(r, 0.8));
    }
    for (let y = sy + 14; y <= sy + 19; y++) {
      B.px(cx - 4, y, rk(r, 0.7));
      B.px(cx + 4, y, rk(r, 0.7));
    }
    B.px(cx + 2, sy + 12, '#e8c040');
    B.px(cx + 2, sy + 13, '#c89030');
    B.px(cx + 2, sy + 11, '#3a2a24');
    return;
  }
  if (kind === 'vest') {
    // An open vest: two fronts either side of the shirt, buttons down one edge.
    for (let y = sy + 1; y <= base + 4; y++) {
      const hw = Math.max(0, Math.min(14, (y - sy) * 3 + 6));
      const inner = 3 + Math.floor((y - sy) / 6);
      for (const s of [-1, 1]) {
        for (let a = inner; a <= Math.min(hw, 13); a++) {
          const x = cx + s * a;
          let k = 2.1 - (s * a) / 26 - (s > 0 ? 0.25 : 0);
          if (a === inner) k += s < 0 ? 0.8 : -0.5;
          if (a === 13) k -= 0.5;
          B.px(x, y, rk(r, k));
        }
      }
      if ((y - sy) % 5 === 3) B.px(cx - inner - 1, y, '#e0b040');
    }
    return;
  }
  if (kind === 'shawl') {
    // A shawl over both shoulders, its ends falling down the front, fringed.
    for (let y = sy - 1; y <= base + 4; y++) {
      for (let x = cx - 18; x <= cx + 18; x++) {
        const dx = x - cx;
        const a = Math.abs(dx);
        const onShoulders = y <= sy + 5 && a <= 4 + (y - sy + 1) * 3 && a >= 3 - Math.max(0, y - sy);
        const ends = y > sy + 5 && a >= 4 && a <= 9;
        if (!onShoulders && !ends) continue;
        let k = 2.2 - dx / 12;
        if (a === 4 && ends) k += dx < 0 ? 0.8 : -0.5;
        if (y === sy - 1) k += 0.6;
        if (ends && (y - sy) % 4 === 0) k -= 0.4;
        B.px(x, y, rk(r, k));
      }
    }
    if (look.dress) {
      // A brooch at the throat.
      B.px(cx, sy + 1, '#ff6a8a');
      B.px(cx - 1, sy + 1, '#f8d468');
      B.px(cx + 1, sy + 1, '#b8862a');
      B.px(cx, sy, '#f8d468');
      B.px(cx, sy + 2, '#b8862a');
    }
    return;
  }
  if (kind === 'tabard') {
    // A tabard down the front, edged, with a sun on it.
    for (let y = sy + 2; y <= base + 4; y++) {
      for (let x = cx - 7; x <= cx + 7; x++) {
        const dx = x - cx;
        let k = 2 - dx / 10;
        if (Math.abs(dx) === 7) k = dx < 0 ? 3 : 0.6;
        if (Math.abs(dx) === 6) k -= 0.3;
        B.px(x, y, rk(r, k));
      }
    }
    // The sun.
    const sx = cx;
    const syy = sy + 13;
    oval(B, sx, syy, 2.6, 2.6, (_x, _y, nx, ny) => rk(['#8a3a1a', '#d8641a', '#ff9a3a', '#ffd070'], 2.4 - nx - ny));
    for (const [dx, dy] of [[0, -4], [0, 4], [-4, 0], [4, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]]) B.px(sx + dx, syy + dy, '#e8a040');
  }
}

// ------------------------------------------------------------------ arms, hands and tools (over the counter)

function arms(F: Layer, g: ReturnType<typeof bustGeometry>, spec: BustSpec, skin: string[], sleeve: string[]): void {
  const { cx, base } = g;
  for (const side of [-1, 1]) {
    // The forearm: from the elbow (low at the side) in along the counter to the wrist, round in
    // section (lit along its top), a cuff at the wrist.
    const ex = cx + side * 16;
    const ey = base - 3;
    const wx = cx + side * 8;
    const wy = base;
    const len = Math.hypot(wx - ex, wy - ey);
    for (let y = base - 7; y <= base + 3; y++) {
      for (let x = Math.min(ex, wx) - 3; x <= Math.max(ex, wx) + 3; x++) {
        const t = ((x - ex) * (wx - ex) + (y - ey) * (wy - ey)) / (len * len);
        if (t < -0.15 || t > 1) continue;
        const px = ex + (wx - ex) * Math.max(0, t);
        const py = ey + (wy - ey) * Math.max(0, t);
        const off = y - py;
        const r = 2.6 - t * 0.5;
        if (Math.abs(x - px) > 3.2 || Math.abs(off) > r) continue;
        let k = 2.4 - off * 0.55 - (side > 0 ? 0.4 : 0);
        if (off > r - 1) k = 0.9;
        F.px(x, y, rk(sleeve, k));
      }
    }
    // The cuff.
    for (let y = base - 2; y <= base + 2; y++) F.px(wx - side, y, rk(sleeve, 1.1 + (y === base - 2 ? 1.2 : 0)));
    // The hand: a rounded fist resting on the counter, knuckles catching the light, fingers below.
    const hx0 = Math.min(wx, wx - side * 5);
    for (let y = base - 2; y <= base + 2; y++) {
      for (let x = hx0; x <= hx0 + 4; x++) {
        const corner = (y === base - 2 || y === base + 2) && (x === hx0 || x === hx0 + 4);
        if (corner) continue;
        let k = 2.5 - (y - base) * 0.5 - (side > 0 ? 0.3 : 0);
        if (y === base - 2) k += 0.6;
        F.px(x, y, rk(skin, k));
      }
    }
    // Finger lines and the thumb.
    for (const fx of [1, 2, 3]) F.px(hx0 + fx, base + 1, rk(skin, 1));
    F.px(side < 0 ? hx0 + 4 : hx0, base - 1, rk(skin, 1.3));
  }
  if (spec.tool && spec.tool !== 'staff' && spec.tool !== 'spear' && spec.tool !== 'orbStaff') tool(F, cx + 6, base - 2, spec.tool);
}

/** A tall staff (or spear) standing beside the keeper, from the floor to above their head. */
function staff(B: Layer, x: number, y0: number, y1: number, kind: BustTool): void {
  const WOOD = ['#2a160c', '#4a2c18', '#6e4426', '#946a40', '#b88c5a'];
  const METAL = ['#2a2a34', '#4c4c5c', '#7a7a8e', '#b0b0c2', '#e6e8f0'];
  for (let y = y1; y <= y0; y++) {
    B.px(x, y, rk(WOOD, 3 + (y % 7 === 0 ? -1 : 0)));
    B.px(x + 1, y, rk(WOOD, 1.6));
  }
  if (kind === 'spear') {
    for (let dy = 0; dy < 10; dy++) {
      const w = dy < 2 ? 0 : 1;
      for (let dx = -w; dx <= w + 1; dx++) B.px(x + dx, y1 - 10 + dy, rk(METAL, 3.2 - dx * 0.9));
    }
    for (let dx = -2; dx <= 3; dx++) B.px(x + dx, y1, rk(['#5a3a10', '#b8862a', '#f0c850'], 1.5 - dx / 3));
  } else if (kind === 'orbStaff') {
    oval(B, x + 0.5, y1 - 4, 3.5, 3.5, (xx, yy, nx, ny) => {
      B.gl(xx, yy, rk(['#3a1a6a', '#6a3ab8', '#9a6af0', '#d0b0ff', '#fff4ff'], 2.6 - nx * 1.2 - ny * 1.2));
      return null;
    });
    B.light(x, y1 - 4, 34, '#b08aff', 0.55, 0.15);
  } else {
    // The sage's staff: a crook at the top, a band of brass.
    for (const [dx, dy] of [[0, -1], [0, -2], [1, -3], [2, -3], [3, -2], [3, -1], [3, 0]]) B.px(x + dx, y1 + dy, rk(WOOD, 3.2));
    B.px(x, y1 + 6, '#f0c850');
    B.px(x + 1, y1 + 6, '#b8862a');
  }
}

/** A tool standing up from the hand at (x, y): its handle in the fist, the business end high. */
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
    v(x, y - 18, y - 1, METAL, 2.4);
    // The jaw: an open C at the top.
    for (const [dx, dy] of [[-2, -19], [-2, -20], [-2, -21], [-1, -22], [0, -22], [1, -22], [2, -22], [3, -21], [3, -20], [3, -19], [2, -18], [-1, -18]]) F.px(x + dx, y + dy, rk(METAL, dx < 1 ? 3.6 : 2));
    F.px(x, y - 20, null);
    return;
  }
  if (kind === 'hammer') {
    v(x, y - 15, y - 1, WOOD, 2.6);
    const IRON = ['#141418', '#24242c', '#3a3a46', '#585866', '#8a8a9a'];
    for (let dy = -20; dy <= -15; dy++) {
      for (let dx = -3; dx <= 5; dx++) {
        let k = 2.1 - dx / 7 + (dy === -20 ? 1.3 : 0) - (dy === -15 ? 0.9 : 0);
        if (dx === -3 || dx === 5) k -= 0.7;
        F.px(x + dx, y + dy, rk(IRON, k));
      }
    }
    // The striking face, worn bright.
    for (let dy = -19; dy <= -16; dy++) F.px(x + 6, y + dy, rk(IRON, 3.4));
    return;
  }
  if (kind === 'tongs') {
    for (let dy = -20; dy <= -1; dy++) {
      const spread = dy < -14 ? Math.floor((-14 - dy) / 2) : 0;
      F.px(x - spread, y + dy, rk(METAL, 3));
      F.px(x + 1 + spread, y + dy, rk(METAL, 1.8));
    }
    return;
  }
  if (kind === 'magnifier') {
    v(x, y - 9, y - 1, WOOD, 2.6);
    oval(F, x + 1, y - 14, 5, 5, (_xx, _yy, nx, ny) => {
      const d = nx * nx + ny * ny;
      if (d > 0.62) return rk(BRASS, 2.6 - nx - ny);
      return mixHex('#a8d8e8', '#ffffff', nx < -0.2 && ny < -0.2 ? 0.6 : 0.1);
    });
    return;
  }
  if (kind === 'quill') {
    for (let i = 0; i < 14; i++) {
      F.px(x + Math.floor(i / 3), y - 1 - i, i < 4 ? '#3a2a24' : rk(['#c8c0b0', '#e8e2d6', '#fffaf2'], 1 + (i % 2)));
      if (i >= 5) F.px(x + 1 + Math.floor(i / 3), y - 1 - i, rk(['#b0a898', '#d8d0c2', '#f2ece0'], 1));
    }
    return;
  }
  if (kind === 'candle') {
    // A candle in a brass dish, its flame glowing.
    for (let dx = -2; dx <= 3; dx++) F.px(x + dx, y - 1, rk(BRASS, 2.6 - dx / 3));
    for (let dy = -9; dy <= -2; dy++) {
      F.px(x, y + dy, '#fff4e0');
      F.px(x + 1, y + dy, '#e8d8c0');
    }
    F.px(x, y - 10, '#3a2a24');
    F.gl(x, y - 11, '#ffb040');
    F.gl(x, y - 12, '#ffe080');
    F.gl(x + 1, y - 12, '#ffd060');
    F.gl(x, y - 13, '#fff4c0');
    F.gl(x, y - 14, '#ffe080');
    F.light(x, y - 12, 34, '#ffb060', 0.7, 0.3);
    return;
  }
  void BRASS;
}
