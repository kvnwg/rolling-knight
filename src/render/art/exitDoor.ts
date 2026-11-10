/**
 * The way down: a carved archway standing at the exit. Dusk-purple stone outside (pillars and an
 * outer ring of voussoirs with a gold bead moulding), golden sandstone inside (jambs and an inner
 * ring of nine voussoirs under a keystone and its crest), two worn steps in front. While the way is
 * open a golden vortex turns in the doorway and its warm light catches the stone round it; while
 * it's sealed (a boss floor before the boss falls) the doorway is dark behind an iron portcullis,
 * which winds up into the arch when the boss dies.
 *
 * Painted pixel by pixel with the hub's kit (albedo plus an emissive twin), lit from the top left.
 * Every piece covers the same rectangle, so they stack: the doorway (open[k] or sealed, then bars[k])
 * under the frame, then the rim light and the lit stones over it. The anchor (DOOR_AX, DOOR_AY) is
 * the middle of the threshold, where the doorway's floor meets the top step; the doorway itself (where
 * you stand to go down) is the 16 px tile just above it.
 */
import { IRON, Layer, h2, rk, type Ramp } from './hubKit';

const CX = 26; // the mirror axis, between pixels 25 and 26
const S = 33; // the springline: the arch starts here and the pillars go down from it
const T = 63; // the threshold: the first row of the steps
const RI = 11; // half the doorway's width (and the inner ring's inner radius)
const RJ = 17; // the jambs' and inner ring's outer edge
const RG = 18; // the dark joint between the inner and the outer work
const RO = 25.5; // the outer silhouette
const VY = S + 2; // the vortex's eye
export const DOOR_W = 52;
export const DOOR_H = T + 8;
/** Where the threshold's middle is in every piece's buffer (pieces have a 1 px margin for the outline). */
export const DOOR_AX = CX + 1;
export const DOOR_AY = T + 1;
/** Animation frames of the open doorway, and steps of the portcullis winding up. */
export const DOOR_FRAMES = 8;
export const BAR_STEPS = 12;
/** The vortex's eye, straight up from the anchor (px): where the squad is pulled in, going through. */
export const DOOR_EYE = VY - T;

/** Dusk stone: purple-black shadow up to a warm lilac. */
const DUSK: Ramp = ['#170c1b', '#24142b', '#341f3c', '#462c4e', '#5a3a5e', '#704a6c', '#8a5e78', '#a47684'];
/** Sandstone: rust shadow up to cream gold. */
const SAND: Ramp = ['#3a1c1e', '#582b25', '#7c422e', '#a35f38', '#c47f44', '#e0a052', '#f2c068', '#ffde94', '#fff2c8'];
/** The vortex: deep amber to white. */
const GLOW: Ramp = ['#2c1206', '#4a1f08', '#6e300a', '#98480e', '#c06614', '#e08a1e', '#f6ae30', '#ffcc4c', '#ffe484', '#fff3bc', '#fffdf0'];
/** The sealed doorway: near black with a little violet. */
const VOID: Ramp = ['#0a060e', '#110a18', '#191022', '#22162e', '#2e1e3c'];
const LEAF: Ramp = ['#0f2414', '#1b3a1c', '#2c5426', '#457030', '#62903a'];

const fx = (x: number) => x + 0.5 - CX;

/** A ramp's colour with a little per-pixel grain (no checkerboard dither on small stones). */
function tex(r: Ramp, k: number, x: number, y: number, grain = 0.55): string {
  return rk(r, k + (h2(x, y, 77) - 0.5) * grain);
}

/** Distance from the arch's centre (above the springline) or from the axis (below). */
function radius(x: number, y: number): number {
  const dx = fx(x);
  const dy = y + 0.5 - S;
  return dy < 0 ? Math.hypot(dx, dy) : Math.abs(dx);
}

/** 0 at the left springline, 1 at the right (above the springline only). */
function arc(x: number, y: number): number {
  const a = Math.atan2(-(y + 0.5 - S), fx(x));
  return 1 - a / Math.PI;
}

/** Inside the doorway (above the threshold). */
function inOpening(x: number, y: number): boolean {
  return y < T && y >= S - RI - 1 && radius(x, y) < RI;
}

/** Which inner voussoir (0..8, the keystone is 4) a pixel of the inner ring belongs to, or -1. */
function innerStone(x: number, y: number): number {
  if (y + 0.5 >= S) return -1;
  const r = radius(x, y);
  // The keystone: a wedge wider at the top, standing a little proud of the ring at both ends.
  if (r >= RI - 1 && r < RG + 3 && Math.abs(fx(x)) < 2.6 + (r - RI) * 0.22 && y + 0.5 < S - 6) return 4;
  if (r < RI || r >= RJ) return -1;
  return Math.min(8, Math.max(0, Math.floor(arc(x, y) * 9)));
}

function newLayer(): Layer {
  return new Layer(-1, -1, DOOR_W + 2, DOOR_H + 2);
}

// ------------------------------------------------------------------ the frame

function paintFrame(): Layer {
  const L = newLayer();
  // --- the outer work: pillars and the outer ring, dusk stone in big blocks
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < DOOR_W; x++) {
      const r = radius(x, y);
      const above = y + 0.5 < S;
      if (r < RG || r >= RO) continue;
      if (above) {
        // 15 voussoirs round the outer ring; the joints between them radiate.
        const t = arc(x, y) * 15;
        const k = Math.floor(t);
        const f = t - k;
        const joint = f < 0.09 || r >= RO - 0.6;
        const lit = 1 - Math.abs(arc(x, y) - 0.28) * 1.6; // the upper left faces the light
        let v = 3.2 + lit * 1.6 + (h2(k, 0, 11) - 0.5) * 0.9;
        if (r > RO - 1.7) v += 1.2; // the top face of the ring catches the light
        if (r < RG + 1.1) v -= 1.1; // and its inner edge falls in shadow
        if (f > 0.85) v -= 0.6;
        if (f < 0.2) v += 0.5;
        // A carved gold bead runs round the middle of the ring.
        if (Math.abs(r - 21.6) < 0.55) {
          L.px(x, y, rk(SAND, 3.7 + lit * 3));
          continue;
        }
        if (joint && r < RO - 0.6) L.px(x, y, DUSK[0]);
        else L.px(x, y, tex(DUSK, v, x, y));
      } else {
        // The pillars: a stack of tall blocks, lit down their left side, the top of each one gilded.
        if (y >= T - 4) continue; // (the plinth goes here, below)
        if (y < S + 3) continue; // (the capital)
        const left = fx(x) < 0;
        const inner = r < RG + 1; // the face toward the jamb
        const outer = r > RO - 1.5;
        const course = Math.floor((y - S - 3) / 6);
        const iy = y - S - 3 - course * 6;
        if (iy === 5) {
          L.px(x, y, DUSK[0]);
          continue;
        }
        let v = 3.6 + (h2(course, left ? 1 : 2, 12) - 0.5) * 0.8;
        if (left ? outer : inner) v += 1.3;
        if (left ? inner : outer) v -= 1.4;
        if (iy === 0) {
          L.px(x, y, rk(SAND, left ? (outer ? 6 : 5) : inner ? 4 : 3));
          continue;
        }
        if (iy === 4) v -= 0.8;
        // A sunk panel down the middle of each block.
        const m = Math.abs(r - 21.75);
        if (iy >= 1 && iy <= 3 && m < 1.6) v -= m < 0.8 ? 1.4 : 0.6;
        L.px(x, y, tex(DUSK, v, x, y));
      }
    }
  }
  // Capitals over the pillars: a gilded band a pixel proud of the pillar each side.
  for (let y = S; y < S + 3; y++) {
    for (let x = 0; x < DOOR_W; x++) {
      const r = radius(x, y);
      if (r < RG - 1 || r >= RO + 0.5) continue;
      const left = fx(x) < 0;
      const edge = r >= RO - 0.5 || r < RG;
      const v = y === S ? (left ? 6.4 : 5) : y === S + 1 ? (left ? 4.6 : 3.6) : 1.6;
      L.px(x, y, rk(SAND, v - (edge && y > S ? 1 : 0)));
    }
  }
  // Plinths at the foot of the pillars.
  for (let y = T - 4; y < T; y++) {
    for (let x = 0; x < DOOR_W; x++) {
      const r = radius(x, y);
      if (r < RG - 1 || r >= RO + 0.5) continue;
      const left = fx(x) < 0;
      let v = y === T - 4 ? 5.2 : y === T - 1 ? 2.2 : 3.6;
      if (left ? r > RO - 0.5 : r < RG) v += 0.8;
      if (left ? r < RG : r > RO - 0.5) v -= 0.8;
      L.px(x, y, tex(DUSK, v, x, y));
    }
  }
  // --- the dark joint between the outer work and the inner
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < DOOR_W; x++) {
      const r = radius(x, y);
      if (r >= RJ && r < RG && !(y >= S && y < S + 3)) L.px(x, y, DUSK[0]);
    }
  }
  // --- the inner work: sandstone jambs and nine voussoirs
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < DOOR_W; x++) {
      const r = radius(x, y);
      const above = y + 0.5 < S;
      const left = fx(x) < 0;
      if (above) {
        const k = innerStone(x, y);
        if (k < 0) continue;
        if (k === 4) {
          // The keystone: taller than the rest, wider at the top, gilded.
          const ax = Math.abs(fx(x));
          let v = 5.2 - ax * 0.25 + (fx(x) < 0 ? 0.8 : -0.4);
          if (r > RG + 1.4) v += 1.2;
          if (r < RI) v -= 1.5;
          if (ax > 3.6) v -= 1.5;
          L.px(x, y, tex(SAND, v, x, y, 0.4));
          continue;
        }
        const t = arc(x, y) * 9 - k;
        const lit = 1 - Math.abs(arc(x, y) - 0.25) * 1.7;
        if (t < 0.1 || t > 0.94) {
          L.px(x, y, SAND[0]);
          continue;
        }
        let v = 3.4 + lit * 2 + (h2(k, 3, 13) - 0.5) * 0.7;
        if (r > RJ - 1.2) v += 1; // the outer edge catches the light
        if (r < RI + 1) v -= 1.2; // the inner edge: shadow toward the doorway
        if (t < 0.25) v += 0.5;
        if (t > 0.8) v -= 0.6;
        L.px(x, y, tex(SAND, v, x, y));
      } else {
        if (r < RI || r >= RJ) continue;
        // Jambs: sandstone courses, a gilt edge toward the light and a carved groove up the middle.
        const course = Math.floor((y - S) / 5);
        const iy = y - S - course * 5;
        if (iy === 4) {
          L.px(x, y, SAND[1]);
          continue;
        }
        const faceLight = left ? r > RJ - 1.2 : r < RI + 1;
        const faceDark = left ? r < RI + 1 : r > RJ - 1.2;
        let v = 3.8 + (h2(course, left ? 5 : 6, 14) - 0.5) * 0.8;
        if (faceLight) v += 1.6;
        if (faceDark) v -= 1.6;
        if (iy === 0) v += 1;
        if (Math.abs(r - 14) < 0.6 && iy > 0 && iy < 4) v -= 1.5;
        L.px(x, y, tex(SAND, v, x, y));
      }
    }
  }
  // Runes carved on the inner voussoirs (they glow while the way is open: see paintRim).
  for (const [x, y] of runePixels()) L.px(x, y, SAND[1]);
  // --- the crest over the keystone: a gilt finial with a gem
  const crest = [
    '....#....',
    '...###...',
    '...#o#...',
    '..##o##..',
    '.#.###.#.',
    '##.###.##',
    '#########',
  ];
  const top = Math.round(S - RO) - crest.length + 2;
  crest.forEach((row, ry) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '.') continue;
      const x = CX - 5 + i;
      const y = top + ry;
      if (row[i] === 'o') {
        L.px(x, y, '#ff9a3a');
        continue;
      }
      const v = 5.4 + (x < CX ? 1 : -0.6) - (ry === row.length - 1 ? 1 : 0) + (ry < 2 ? 1 : 0);
      L.px(x, y, rk(SAND, v));
    }
  });
  // A few sprigs where the stone holds water: on the ring's shoulders, and a vine down a pillar.
  const sprigs: Array<[number, number[][]]> = [
    [0.12, [[0, 0], [0, -1], [-1, -1], [-1, -2]]],
    [0.2, [[0, 0], [1, -1], [0, -1], [1, -2], [2, -2]]],
    [0.83, [[0, 0], [0, -1], [1, -1], [1, -2]]],
    [0.9, [[0, 0], [1, 0], [1, -1], [2, -1]]],
  ];
  for (const [a, shape] of sprigs) {
    const ang = Math.PI * (1 - a);
    const x = Math.floor(CX + Math.cos(ang) * (RO - 0.6));
    const y = Math.floor(S - Math.sin(ang) * (RO - 0.6));
    shape.forEach(([dx, dy], i) => L.px(x + dx, y + dy, rk(LEAF, 1 + Math.min(3, i + (dy < -1 ? 1 : 0)))));
  }
  for (const [x, y, k] of [[1, S + 3, 2], [1, S + 4, 3], [2, S + 5, 2], [2, S + 6, 1], [1, S + 7, 2], [50, S + 3, 3], [50, S + 4, 2], [49, S + 5, 1]]) L.px(x, y, LEAF[k]);
  // --- the steps: a landing and one step below it, worn sandstone slabs
  const steps: Array<{ y0: number; top: number; face: number; half: number; seed: number }> = [
    { y0: T, top: 3, face: 2, half: 21, seed: 1 },
    { y0: T + 5, top: 2, face: 1, half: 24, seed: 2 },
  ];
  for (const st of steps) {
    for (let y = st.y0; y < st.y0 + st.top + st.face; y++) {
      for (let x = 0; x < DOOR_W; x++) {
        const ax = Math.abs(fx(x));
        if (ax > st.half) continue;
        const onTop = y < st.y0 + st.top;
        const slab = Math.floor((x + st.seed * 4) / 9);
        const jx = (x + st.seed * 4) % 9 === 0;
        let v = onTop ? 4.4 - (y - st.y0) * 0.5 : 2.2 - (y - st.y0 - st.top) * 0.6;
        v += (h2(slab, st.seed, 15) - 0.5) * 0.8 - (ax / st.half) * 1.2;
        if (fx(x) < 0 && onTop) v += 0.3;
        if (ax > st.half - 1) v -= 0.8;
        if (jx && onTop) v = 1.4;
        // Worn smooth in the middle, where everyone walks.
        if (onTop && ax < 6) v += 0.5;
        L.px(x, y, tex(SAND, v, x, y, 0.4));
      }
    }
  }
  L.outlineTinted(0.74);
  return L;
}

/** One small carved rune in the middle of each inner voussoir but the keystone. */
function runePixels(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const shapes = [
    [[0, 0], [0, -1], [1, -1]],
    [[0, 0], [1, 0], [0, -1]],
    [[0, 0], [0, -1], [-1, -1]],
    [[0, 0], [1, -1]],
  ];
  for (let k = 0; k < 9; k++) {
    if (k === 4) continue;
    const a = Math.PI * (1 - (k + 0.5) / 9);
    const r = (RI + RJ) / 2;
    const x = Math.floor(CX + Math.cos(a) * r);
    const y = Math.floor(S - Math.sin(a) * r);
    for (const [dx, dy] of shapes[k % 4]) out.push([x + dx, y + dy + 1]);
  }
  return out;
}

// ------------------------------------------------------------------ the doorway

/** The open doorway, frame k: a golden vortex (two arms round a white-hot eye), a ring of runes, a lane of light and rising sparks. */
function paintOpen(k: number): Layer {
  const L = newLayer();
  const ph = (k / DOOR_FRAMES) * Math.PI * 2;
  const DR = 9.5; // the vortex's radius
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < DOOR_W; x++) {
      if (!inOpening(x, y)) continue;
      const dx = fx(x);
      const dy = y + 0.5 - VY;
      const r = Math.hypot(dx, dy);
      const th = Math.atan2(dy, dx);
      // Depth: darker at the doorway's edge, as if it went a long way back.
      const edge = Math.min(RI - radius(x, y), T - y);
      let v: number;
      if (r < DR) {
        const t = 1 - r / DR;
        const band = Math.cos(2 * th - r * 0.78 + ph);
        v = 4.2 + t * 4.6 + (band > 0.3 ? 1.3 : band < -0.45 ? -1 : 0);
        if (r < 2.1) v = 10;
        else if (r < 3.2) v = Math.max(v, 9);
        if (r > DR - 1) v = Math.max(v, 6.5);
      } else {
        // The deep round it: dark amber, warmer near the vortex.
        const t = Math.max(0, 1 - (r - DR) / 9);
        v = 1.1 + t * t * 2.6;
        // A ring of runes turning the other way.
        const rune = Math.floor(((th - ph / 4 + Math.PI * 4) * 14) / (Math.PI * 2)) % 2;
        if (Math.abs(r - (DR + 1.8)) < 0.55 && rune === 0) v = 5.4;
        // The lane of light running in from the threshold toward the eye.
        if (y + 0.5 > VY + DR) {
          const along = (y + 0.5 - VY - DR) / (T - VY - DR);
          const half = 1 + along * 5.5;
          const ax = Math.abs(dx);
          if (ax < half) v = Math.max(v, 2.6 + along * 2.2 - (ax / half) * 1.4 + (ax < 0.9 ? 1.2 : 0));
        }
      }
      if (edge < 1.5) v -= 1;
      L.gl(x, y, rk(GLOW, v));
    }
  }
  // Sparks rising through it, each on its own beat.
  for (let i = 0; i < 10; i++) {
    const bx = Math.round(CX - 9 + h2(i, 1, 21) * 18);
    const span = T - (S - RI) - 4;
    const by = Math.round(T - 3 - ((h2(i, 2, 21) * span + k * 2.2 * (0.7 + h2(i, 3, 21) * 0.6)) % span));
    if (!inOpening(bx, by) || Math.hypot(fx(bx), by + 0.5 - VY) < DR) continue;
    L.gl(bx, by, i % 3 ? '#fff3bc' : '#ffffff');
    if (h2(i, 4, 21) > 0.5 && inOpening(bx, by + 1)) L.gl(bx, by + 1, '#f6ae30');
  }
  return L;
}

/** The sealed doorway: dark, a faint violet swirl far back. */
function paintSealed(): Layer {
  const L = newLayer();
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < DOOR_W; x++) {
      if (!inOpening(x, y)) continue;
      const dx = fx(x);
      const dy = y + 0.5 - VY;
      const r = Math.hypot(dx, dy);
      const th = Math.atan2(dy, dx);
      const band = Math.cos(2 * th - r * 0.78);
      const core = Math.max(0, 1 - r / 12);
      const edge = Math.min(RI - radius(x, y), T - y);
      let v = core * 2.6 + (core > 0 && band > 0.3 ? 0.9 : 0);
      if (edge < 1.5) v -= 0.6;
      L.px(x, y, rk(VOID, v));
    }
  }
  return L;
}

/** The portcullis wound up `f` (0 down .. 1 gone into the arch): iron bars, cross bars, riveted, spiked. */
function paintBars(f: number): Layer {
  const L = newLayer();
  const H = T - (S - RI);
  const lift = Math.round(f * (H + 3));
  // Five bars, two pixels each, symmetric about the axis.
  const barAt = (x: number) => {
    const p = x - (CX - 9);
    return p >= 0 && p < 18 && p % 4 < 2 ? (p % 4 === 0 ? 'l' : 'r') : null;
  };
  for (let y = S - RI - 1; y < T; y++) {
    for (let x = 0; x < DOOR_W; x++) {
      const yy = y - lift; // where this bar pixel shows
      if (!inOpening(x, yy)) continue;
      const b = barAt(x);
      const cross = (y - (S - 6)) % 11;
      const onCross = y > S - 9 && y < T - 4 && (cross === 0 || cross === 1);
      if (!b && !onCross) continue;
      // The bars end in points.
      if (b && y === T - 1 && b !== 'l') continue;
      let v: number;
      if (b && onCross) v = 5.2; // a rivet where they cross
      else if (b) v = b === 'l' ? 4.2 : 2.4;
      else v = cross === 0 ? 3.8 : 1.8;
      L.px(x, yy, rk(IRON, v));
    }
  }
  return L;
}

/** The vortex's warm light on the stone round the doorway and on the steps; the runes alight. */
function paintRim(frame: Layer): Layer {
  const L = newLayer();
  const near = (x: number, y: number, d: number) => {
    for (let r = 1; r <= d; r++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (inOpening(x + ox, y + oy)) return r;
    return 0;
  };
  for (let y = 0; y < DOOR_H; y++) {
    for (let x = 0; x < DOOR_W; x++) {
      if (inOpening(x, y)) continue;
      const c = frame.get(x, y);
      if (!c) continue;
      const d = y < T ? near(x, y, 3) : 0;
      if (d) {
        const t = d === 1 ? 0.5 : d === 2 ? 0.3 : 0.14;
        L.px(x, y, mixTo(c, '#ffc860', t));
        L.halo(x, y, '#ffb040', t * 0.5);
        continue;
      }
      if (y >= T && Math.abs(fx(x)) < 14 - (y - T) * 0.6) {
        const t = 0.42 - (y - T) * 0.04 - Math.abs(fx(x)) * 0.02;
        if (t > 0.05) {
          L.px(x, y, mixTo(c, '#ffd070', t));
          L.halo(x, y, '#ffb040', t * 0.35);
        }
      }
    }
  }
  for (const [x, y] of runePixels()) L.gl(x, y, '#ffe484');
  return L;
}

/**
 * The inner ring's stones all lit, while the squad goes through the doorway: the stone's own light
 * and dark kept, pulled `t` of the way to `hot` (the flare as the swirl takes the squad is nearly
 * white, its runes white-hot).
 */
function paintLit(frame: Layer, hot: string, t: number): Layer {
  const L = newLayer();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < DOOR_W; x++) {
      if (innerStone(x, y) < 0) continue;
      const c = frame.get(x, y);
      if (!c) continue;
      L.gl(x, y, mixTo(c, hot, t));
    }
  }
  if (t > 0.6) for (const [x, y] of runePixels()) L.gl(x, y, '#fffdf0');
  return L;
}

function mixTo(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export interface DoorArt {
  frame: Layer;
  open: Layer[];
  sealed: Layer;
  bars: Layer[];
  rim: Layer;
  /** The inner ring lit while the squad goes through, and flaring as the swirl takes it. */
  lit: Layer;
  flare: Layer;
}

let art: DoorArt | null = null;

/** The door's pieces (painted once). */
export function doorArt(): DoorArt {
  if (art) return art;
  const frame = paintFrame();
  art = {
    frame,
    open: Array.from({ length: DOOR_FRAMES }, (_, k) => paintOpen(k)),
    sealed: paintSealed(),
    bars: Array.from({ length: BAR_STEPS + 1 }, (_, k) => paintBars(k / BAR_STEPS)),
    rim: paintRim(frame),
    lit: paintLit(frame, '#fff4c8', 0.45),
    flare: paintLit(frame, '#fffdf0', 0.8),
  };
  return art;
}

/** The doorway's box in the pieces' buffers (where someone standing in front cuts the glow). */
export const DOOR_OPENING = { x: CX - RI + 1, y: S - RI + 1, w: RI * 2, h: T - (S - RI) };
