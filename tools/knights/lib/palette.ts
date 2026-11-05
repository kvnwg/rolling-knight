/**
 * The colors the knight sheets are drawn in (before any rarity repaints them), one 8-tone ramp per
 * material (ink, deep, shadow, mid, light, highlight, spec, rim: see raster.ts), and how a frame's
 * labels become colors. Every (material, shade) gets its own exact color in a sheet, so the game can
 * read a pixel's color back as its material and shade.
 */
import { oklchToHex, toneRamp } from '../../../src/render/pf/color';
import { MATS, type Canvas, type Mat } from './raster';

/** Blue steel, royal blue cloth, cream linen, gold, red-brown leather and so on: a "Rare" knight. */
export const BASE: Record<Mat, string[]> = {
  metal: toneRamp([0.4, 0.52, 0.64, 0.76, 0.88, 0.98], 0.035, 250, { specC: 0.012, warm: 10 }),
  cloth: toneRamp([0.33, 0.42, 0.52, 0.62, 0.72, 0.8], 0.13, 262),
  linen: toneRamp([0.5, 0.62, 0.74, 0.85, 0.93, 0.97], 0.035, 85, { cool: 40 }),
  accent: toneRamp([0.45, 0.58, 0.7, 0.81, 0.9, 0.97], 0.12, 78, { cool: 30, specC: 0.04 }),
  trim: toneRamp([0.45, 0.58, 0.7, 0.81, 0.9, 0.97], 0.11, 80, { cool: 30 }),
  etch: toneRamp([0.45, 0.58, 0.7, 0.81, 0.9, 0.97], 0.11, 80, { cool: 30 }),
  leather: toneRamp([0.3, 0.38, 0.47, 0.56, 0.65, 0.72], 0.07, 42),
  skin: [...toneRamp([0.5, 0.61, 0.72, 0.81, 0.89, 0.72], 0.075, 45, { cool: 12, warm: 6 }).slice(0, 6), oklchToHex(0.73, 0.1, 18), toneRamp([0.5], 0.075, 45)[7]],
  hair: toneRamp([0.3, 0.39, 0.49, 0.59, 0.69, 0.78], 0.08, 55),
  eyes: [oklchToHex(0.16, 0.03, 280), oklchToHex(0.22, 0.04, 270), oklchToHex(0.42, 0.11, 245), oklchToHex(0.55, 0.12, 235), oklchToHex(0.7, 0.1, 220), oklchToHex(0.97, 0.01, 90), oklchToHex(0.97, 0.01, 90), oklchToHex(0.3, 0.04, 280)],
  glow: toneRamp([0.6, 0.7, 0.8, 0.88, 0.94, 0.99], 0.16, 75, { cool: 25, specC: 0.05, inkL: 0.45 }),
  gem: toneRamp([0.36, 0.46, 0.57, 0.7, 0.84, 0.97], 0.17, 18, { cool: 15, specC: 0.03 }),
  plume: toneRamp([0.36, 0.46, 0.56, 0.66, 0.75, 0.83], 0.16, 25),
  wood: toneRamp([0.31, 0.39, 0.48, 0.57, 0.66, 0.74], 0.075, 58),
  cape: toneRamp([0.3, 0.38, 0.47, 0.57, 0.67, 0.75], 0.13, 262),
  star: toneRamp([0.3, 0.38, 0.47, 0.57, 0.67, 0.75], 0.13, 262),
};

export const SHADOW_HEX = '#1c1430';
export const SHADOW_ALPHA = 92;

/** Materials that light themselves: their outline is their own deep tone, never ink. */
export const SELF_LIT: ReadonlySet<Mat> = new Set<Mat>(['glow']);

export type PalColor = [hex: string, alpha: number, mat: string, shade: number, role?: string];

const rgbOf = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const;
const hexOf = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;

/**
 * A sheet's palette, built as frames are added: index 0 is transparent, then the ground shadow, then
 * every (material, shade) in the order first used. Colors that two entries would share are nudged a
 * step apart so each stays readable as its own material.
 */
export class SheetPalette {
  readonly colors: PalColor[] = [[SHADOW_HEX, SHADOW_ALPHA, 'shadow', 0]];
  private index = new Map<string, number>();
  private used = new Set<string>([SHADOW_HEX]);

  constructor(private base: Record<Mat, string[]> = BASE) {}

  /** The palette index (1-based) for a material and shade. */
  of(m: Mat, s: number): number {
    const key = `${m}.${s}`;
    let i = this.index.get(key);
    if (i !== undefined) return i;
    let hex = this.base[m][s];
    let [r, g, b] = rgbOf(hex);
    for (let n = 1; this.used.has(hex); n++) {
      const d = Math.ceil(n / 3) * (n % 2 ? 1 : -1);
      hex = hexOf(r + (n % 3 === 0 ? d : 0), g + (n % 3 === 1 ? d : 0), b + (n % 3 === 2 ? d : 0));
    }
    this.used.add(hex);
    this.colors.push([hex, 255, m, s, ...(s === 0 || s === 7 ? ['line'] : [])] as PalColor);
    i = this.colors.length;
    this.index.set(key, i);
    return i;
  }

  rgba(i: number): [number, number, number, number] {
    if (i === 0) return [0, 0, 0, 0];
    const [hex, a] = this.colors[i - 1];
    const [r, g, b] = rgbOf(hex);
    return [r, g, b, a];
  }
}

/** A finished canvas as palette indices (cell x cell). */
export function toIndices(c: Canvas, pal: SheetPalette): Uint8Array {
  const out = new Uint8Array(c.w * c.h);
  for (let i = 0; i < out.length; i++) {
    if (c.mat[i] >= 0) out[i] = pal.of(MATS[c.mat[i]], c.shade[i]);
    else if (c.shadow[i]) out[i] = 1;
  }
  return out;
}

/** A canvas straight to RGBA in the base colors (or a ramp override per material), for previews. */
export function toRgba(c: Canvas, ramps: Partial<Record<Mat, readonly string[]>> = {}): Uint8ClampedArray {
  const px = new Uint8ClampedArray(c.w * c.h * 4);
  const [sr, sg, sb] = rgbOf(SHADOW_HEX);
  for (let i = 0; i < c.w * c.h; i++) {
    if (c.mat[i] >= 0) {
      const m = MATS[c.mat[i]];
      const r = ramps[m] ?? BASE[m];
      const [R, G, B] = rgbOf(r[Math.min(c.shade[i], r.length - 1)]);
      px.set([R, G, B, 255], i * 4);
    } else if (c.shadow[i]) px.set([sr, sg, sb, SHADOW_ALPHA], i * 4);
  }
  return px;
}
