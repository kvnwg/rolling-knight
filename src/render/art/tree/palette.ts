/**
 * Tree colors. Every ramp is hand-picked and hue-shifted the way a pixel artist builds one: shadows
 * slide toward blue (deep blue-green gaps under a green crown, plum under an autumn one), lights
 * toward yellow (lime highlights, gold on the autumn ones). Each tree then gets its own small shift of
 * hue and value, so a stand of the same species never looks stamped.
 */
import { rgb, toHex } from '../../pixel/buf';
import type { Ramp } from './core';

// ------------------------------------------------------------------ color math

export function toHsv(hex: string): [number, number, number] {
  const [r0, g0, b0] = rgb(hex);
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}

export function fromHsv(h: number, s: number, v: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  v = Math.max(0, Math.min(1, v));
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function mixC(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Shifts a whole ramp: hue in degrees, saturation and value as multipliers around 1. */
export function shiftRamp(r: Ramp, dh: number, ds = 1, dv = 1): string[] {
  return r.map((c) => {
    const [h, s, v] = toHsv(c);
    return fromHsv(h + dh, s * ds, v * dv);
  });
}

/** Pulls a ramp toward a color (fog, deep shade): `t` 0..1, the darks pulled a little less. */
export function veil(r: Ramp, color: string, t: number): string[] {
  return r.map((c, i) => mixC(c, color, t * (0.7 + (0.3 * i) / Math.max(1, r.length - 1))));
}

/** Darkens a ramp toward its own darkest tone and toward `night` (depth into the woods). */
export function deepen(r: Ramp, t: number, night = '#0a0e18'): string[] {
  return r.map((c) => {
    const [h, s, v] = toHsv(c);
    return mixC(fromHsv(h + 8 * t, s * (1 - 0.25 * t), v * (1 - 0.42 * t)), night, 0.12 * t);
  });
}

// ------------------------------------------------------------------ ramps (darkest first)

/** Foliage: six tones (gap, shadow, body dark, body, light, highlight). */
export const LEAF = {
  /** The village's lush summer oaks: teal gaps to lime tops. */
  lush: ['#0b2428', '#143a36', '#1f573b', '#33783e', '#5c9e40', '#a8d05a'],
  /** Farm and orchard greens: warmer, a touch of olive. */
  orchard: ['#132619', '#203f21', '#325e28', '#4e812f', '#7aa63a', '#bcd35a'],
  /** Field maples: yellow-green, light and airy. */
  maple: ['#11281e', '#1b4227', '#2b632c', '#458733', '#70ab3d', '#b4d65e'],
  /** The Gloomwood at night: blue-green, the lights still clearly green so clumps read in the dark. */
  gloom: ['#06141a', '#0b2327', '#123832', '#1c4f3d', '#2d6c4a', '#4f925d'],
  /** Bog willows: olive and moss. */
  bog: ['#0f1a15', '#1a2a1c', '#283f23', '#3b562b', '#567236', '#86a24c'],
  gold: ['#2a1817', '#552c1b', '#8b471e', '#c0782a', '#e2aa3a', '#f8da6c'],
  orange: ['#2a1418', '#52211d', '#8a3420', '#bf5426', '#e2843a', '#f7b85e'],
  red: ['#260f17', '#4b1620', '#7c2224', '#ad352a', '#d65f36', '#f09a5a'],
  /** Gloomwood autumn: rust and amber, dim. */
  rust: ['#160d12', '#311719', '#57281e', '#824125', '#aa6630', '#d29648'],
  sakura: ['#3a1a2e', '#62284a', '#97456b', '#c96f92', '#eba1ba', '#ffd8e4'],
  /** Shrine maples: deep crimson to coral. */
  crimson: ['#240c16', '#48121f', '#781c25', '#a82c2c', '#d4523a', '#f2905e'],
} as const;

/** Needles: six tones, cooler and darker than broad leaves. */
export const NEEDLE = {
  green: ['#081a1d', '#0e2c2b', '#163f35', '#21573f', '#30714a', '#4f9158'],
  gloom: ['#061215', '#0a1f22', '#11312e', '#1a4637', '#275e42', '#417c50'],
  frost: ['#0a1b24', '#112e37', '#1a4246', '#255853', '#346e62', '#538a78'],
  grave: ['#08090f', '#0f131b', '#161f28', '#202d33', '#2c3c3e', '#42554f'],
  shrine: ['#0b1915', '#122a21', '#1b3e2b', '#265633', '#376e3b', '#5a8e48'],
} as const;

export const SNOW: Ramp = ['#5d7398', '#8aa2c4', '#b8cce2', '#e2edf7', '#ffffff'];

/** Bark: five tones. */
export const BARK = {
  oak: ['#1a120f', '#30221a', '#4b3626', '#6a5036', '#8e6e4c'],
  night: ['#0c0a0d', '#191416', '#29211f', '#3c3029', '#544336'],
  /** Pines: the reddish-brown of the misty woods. */
  pine: ['#210f0e', '#401c16', '#66301f', '#8f472a', '#b7683f'],
  pineNight: ['#130b0c', '#251413', '#3a211b', '#533024', '#6f4331'],
  apple: ['#1f130e', '#392518', '#553923', '#755233', '#977149'],
  willow: ['#14130f', '#262318', '#393423', '#514a31', '#6b6443'],
  dead: ['#131012', '#292124', '#443836', '#64564e', '#88796a'],
  grave: ['#0a080d', '#18141e', '#292231', '#3c3346', '#54495f'],
  bog: ['#10120e', '#21241a', '#353829', '#4d4f3a', '#686a4e'],
  cherry: ['#190d13', '#311920', '#4c292f', '#6b3f3f', '#8b5a55'],
  frost: ['#151216', '#2a2128', '#453840', '#66565a', '#8c7e80'],
} as const;

export const MOSS: Ramp = ['#17301c', '#26492a', '#3a6633', '#5a8a3c', '#86b04e'];
export const MOSS_DARK: Ramp = ['#0b1a14', '#12281d', '#1b3a25', '#28512d', '#3c6c38'];

/** Apples: shadow, body, lit, glint. */
export const APPLE: Ramp = ['#4a0f14', '#8e1d1c', '#c4382a', '#f0805a'];
export const BLOSSOM: Ramp = ['#a86a86', '#e0a6bc', '#fff0f4'];

/** A tree's own small shift, so neighbors differ: hue +-`dh`, value and saturation a few percent. */
export function jitter(r: Ramp, seed: number, dh = 7, dv = 0.06): string[] {
  const a = ((seed * 2654435761) >>> 0) / 4294967296;
  const b = ((seed * 2246822519 + 3266489917) >>> 0) / 4294967296;
  const c = ((seed * 3266489917 + 668265263) >>> 0) / 4294967296;
  return shiftRamp(r, (a - 0.5) * 2 * dh, 1 + (b - 0.5) * 0.14, 1 + (c - 0.5) * 2 * dv);
}
