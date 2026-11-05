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

/** Turns hue `h` toward hue `to` by `deg` degrees at most (the short way round). */
export function hueToward(h: number, to: number, deg: number): number {
  const d = ((to - h + 540) % 360) - 180;
  if (Math.abs(d) <= deg) return to;
  return (h + Math.sign(d) * deg + 360) % 360;
}

/** Hue the knights' shadows lean toward (blue-violet) and their lights (warm yellow). */
export const COOL_HUE = 285;
export const WARM_HUE = 85;

export interface ToneOpts {
  /** Degrees the shadows turn toward blue-violet. */
  cool?: number;
  /** Degrees the lights turn toward warm yellow. */
  warm?: number;
  /** The ink's lightness (default: a step under the deep tone). */
  inkL?: number;
  /** Chroma of the specular tone (default: a little of the mid's). */
  specC?: number;
}

/**
 * A knight material ramp of 8 colors: ink, deep, shadow, mid, light, highlight, spec, rim (the
 * order the knight sheets' shades use). `L` holds the six body lightnesses, deep to spec. The darks
 * lean cool (toward blue-violet) and the lights warm, the way a painter shifts hue instead of only
 * darkening; chroma peaks in the middle tones and fades toward the spec. The ink is the material's
 * own near-black (outlines tinted by what they border); the rim, a hair lighter, is the outline on
 * the lit top-left side, so the line stays crisp and dark all round but never flat.
 */
export function toneRamp(L: readonly number[], C: number, h: number, o: ToneOpts = {}): string[] {
  const cool = o.cool ?? 22;
  const warm = o.warm ?? 14;
  const hues = [cool, cool * 0.5, 0, -warm * 0.45, -warm * 0.85, -warm];
  const chroma = [0.88, 1, 1, 0.94, 0.78, 0.5];
  const body = L.slice(0, 6).map((l, i) => {
    const h2 = hues[i] > 0 ? hueToward(h, COOL_HUE, hues[i]) : hueToward(h, WARM_HUE, -hues[i]);
    const c = i === 5 && o.specC !== undefined ? o.specC : C * chroma[i];
    return oklchToHex(l, c, h2);
  });
  while (body.length < 6) body.push(body[body.length - 1]);
  const inkL = o.inkL ?? Math.max(0.12, Math.min(0.2, L[0] - 0.17));
  const inkH = hueToward(h, COOL_HUE, cool * 1.7 + 8);
  const ink = oklchToHex(inkL, Math.min(0.06, C * 0.55 + 0.02), inkH);
  const rim = oklchToHex(inkL + Math.max(0.025, (L[0] - inkL) * 0.22), Math.min(0.08, C * 0.7 + 0.02), hueToward(h, COOL_HUE, cool * 1.2));
  return [ink, ...body, rim];
}
