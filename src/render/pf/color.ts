/**
 * OKLCH color math for PixelForge recolors. PixelForge builds every material ramp in OKLCH (even
 * lightness steps, a few degrees warmer per lighter shade, muted chroma), so the game's own ramps
 * (rarity armor, biome monsters) are made the same way: keep a material's lightness steps and change
 * only its hue and chroma, and the sprite keeps its shading.
 */

export type Oklch = [L: number, C: number, h: number];

function toLinear(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, v)) * 255);
}

export function hexToOklch(hex: string): Oklch {
  const r = toLinear(parseInt(hex.slice(1, 3), 16));
  const g = toLinear(parseInt(hex.slice(3, 5), 16));
  const b = toLinear(parseInt(hex.slice(5, 7), 16));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return [L, Math.hypot(A, B), h];
}

/** OKLCH to linear sRGB (may be out of gamut). */
function lab(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH to hex; chroma is reduced until the color fits in sRGB (so hue and lightness hold). */
export function oklchToHex(L: number, C: number, h: number): string {
  let c = Math.max(0, C);
  let rgb = lab(L, c, h);
  for (let i = 0; i < 24 && rgb.some((v) => v < -1e-4 || v > 1 + 1e-4); i++) {
    c *= 0.9;
    rgb = lab(L, c, h);
  }
  return `#${rgb.map((v) => fromLinear(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A ramp in PixelForge's manner: one color per lightness in `Ls` (dark to light) at chroma `C` and
 * hue `h`, each lighter shade `shift` degrees warmer (toward yellow, from either side).
 */
export function ramp(Ls: readonly number[], C: number, h: number, shift = 5): string[] {
  return Ls.map((L, i) => oklchToHex(L, C, warmer(h, shift * i)));
}

/** Turns hue `h` by `deg` toward yellow (about 95 degrees), from whichever side is closer. */
export function warmer(h: number, deg: number): number {
  const d = ((95 - h + 540) % 360) - 180;
  if (Math.abs(d) <= deg) return 95;
  return (h + Math.sign(d) * deg + 360) % 360;
}

/** A ramp with the same lightness steps as `like` (a PixelForge preset), in another hue and chroma. */
export function rampLike(like: readonly string[], C: number, h: number, shift = 5, dL = 0): string[] {
  return ramp(
    like.map((x) => Math.max(0.3, Math.min(0.82, hexToOklch(x)[0] + dL))),
    C,
    h,
    shift,
  );
}

export function mixHexes(a: string, b: string, t: number): string {
  const p = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  const f = (i: number) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0');
  return `#${f(1)}${f(3)}${f(5)}`;
}

/** The same ramp `dL` lighter (or darker), each color keeping its own hue and chroma. */
export function shiftL(r: readonly string[], dL: number): string[] {
  if (!dL) return [...r];
  return r.map((x) => {
    const [L, C, h] = hexToOklch(x);
    return oklchToHex(Math.max(0.3, Math.min(0.85, L + dL)), C, h);
  });
}
