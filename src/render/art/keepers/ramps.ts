/**
 * The keepers' colours and line for their big portraits (bust.ts) and the scenes round them: soft cel
 * shading in five hue-shifted steps per material (cool
 * shadows, warm lights) built from an NpcLook's three, and a 1 px coloured outline that leans to a deep
 * plum (never black), lighter where the edge faces the light.
 */
import type { Ramp3 } from '../../../world/npcs';
import { mixHex } from '../draw';
import type { Layer } from '../hubKit';

/** The deep plum every line leans to. */
export const PLUM = '#24122e';

export const lum = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return ((v >> 16) & 255) * 0.3 + ((v >> 8) & 255) * 0.59 + (v & 255) * 0.11;
};

/**
 * Five cel steps from a look's three: a cool deep shadow, the shadow, the mid, the light and a warm
 * highlight. Pale cloth (a white robe) shades into cool lilac greys.
 */
export function cel(r: Ramp3): string[] {
  if (lum(r[2]) > 205) return [mixHex(r[0], '#5a4a78', 0.45), mixHex(r[0], '#9a8aa8', 0.55), mixHex(r[1], '#c8bcd0', 0.5), mixHex(r[2], '#fff6ea', 0.2), '#fffcf6'];
  return [mixHex(r[0], '#120a26', 0.45), mixHex(r[0], '#2c1c50', 0.12), r[1], mixHex(r[2], '#fff2d4', 0.06), mixHex(r[2], '#fff4dc', 0.42)];
}

/** Skin: a mauve line, a rosy deep shadow, a cool rose shadow, the lit skin and its light. */
export function skinRamp(r: Ramp3): string[] {
  return [mixHex(r[0], '#3a1230', 0.5), mixHex(r[0], '#8a3a5c', 0.22), mixHex(r[1], '#c46a80', 0.2), r[2], mixHex(r[2], '#fffaf2', 0.42)];
}

/**
 * Hair: a deep shadow, the shadow, the mid, the light and the shine. Black hair reads as navy in this
 * style (indigo lights, a blue sheen); the rest shift cool in the shadows and warm in the light.
 */
export function hairRamp(r: Ramp3): string[] {
  if (lum(r[1]) < 70) return [mixHex(r[0], '#080818', 0.5), mixHex(r[0], '#1a1e3e', 0.55), mixHex(r[1], '#2a3262', 0.5), mixHex(r[2], '#46568e', 0.55), '#7a8ec8'];
  return [mixHex(r[0], '#1a0c2a', 0.42), mixHex(r[0], r[1], 0.4), r[1], mixHex(r[2], '#fff4dc', 0.08), mixHex(r[2], '#fffcf4', 0.55)];
}

/** A beard's or a mustache's: like the hair, but black stays a deep plum-brown (a navy mustache reads as blue). */
export function beardRamp(r: Ramp3): string[] {
  if (lum(r[1]) >= 70) return hairRamp(r);
  return [mixHex(r[0], '#0c0610', 0.5), mixHex(r[0], '#24161e', 0.55), mixHex(r[1], '#3a2a34', 0.5), mixHex(r[2], '#5e4a56', 0.5), '#8a7884'];
}

/**
 * A figure's outline, drawn on the clear pixels round it: each takes its darkest neighbour's colour
 * pushed toward the deep plum, much lighter where the edge faces the light (above and to the left)
 * and deepest on the shadowed side and underneath. Lines inside a figure are painted as darker steps
 * of their own colours, never this ink. `lit`, `mid` and `dark` are how far toward the plum.
 */
export function outline(L: Layer, lit = 0.58, mid = 0.72, dark = 0.84): void {
  const src = L.buf.px.slice();
  const W = L.w;
  const H = L.h;
  // [dx, dy, lit]: a neighbour to the right of or below the clear pixel means the edge faces up or
  // left, into the light.
  const NB = [[1, 0, 1], [0, 1, 1], [-1, 0, 0], [0, -1, 0]] as const;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (src[(y * W + x) * 4 + 3]) continue;
      let best = -1;
      let bl = 1e9;
      let lit2 = 0;
      let shaded = 0;
      for (const [dx, dy, l] of NB) {
        const X = x + dx;
        const Y = y + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const i = (Y * W + X) * 4;
        if (!src[i + 3]) continue;
        if (l) lit2++;
        else shaded++;
        const v = src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11;
        if (v < bl) {
          bl = v;
          best = i;
        }
      }
      if (best < 0) continue;
      const t = lit2 && !shaded ? lit : !lit2 ? dark : mid;
      const o = (y * W + x) * 4;
      L.buf.px[o] = Math.round(src[best] * (1 - t) + 0x24 * t);
      L.buf.px[o + 1] = Math.round(src[best + 1] * (1 - t) + 0x12 * t);
      L.buf.px[o + 2] = Math.round(src[best + 2] * (1 - t) + 0x2e * t);
      L.buf.px[o + 3] = 255;
    }
  }
}
