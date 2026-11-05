/**
 * The attack effects, drawn from code on the art grid (no DOM: the preview sheet and the tests draw
 * them in Node; the game caches each frame as a canvas). Every frame is a VfxSprite: its pixels and
 * its anchor. They're flat and crisp: drawn on the unlit top layer, they never glow, bloom or light
 * the scene, and nothing is half transparent (fades step down a ramp, thin out or dither).
 *
 * Swings ride a unit's chest (CHEST above its feet) and point along its aim, snapped to SWING_DIRS
 * directions; nothing here knows the knight's sprite. They're solid white smears in the classic
 * pixel-art way (see the swings section). Projectiles turn in SHOT_DIRS directions; the arrow is
 * hand-drawn at 0, 22.5 and 45 degrees and turned by exact mirrors and transposes, never resampled.
 * Impacts are bursts sized to the hit.
 */
import type { Shot } from '../../world/entities';
import { hexToOklch, oklchToHex } from '../pf/color';
import { rainbowShade, type Ramp, type SwingStyle, type VfxLook } from './look';
import { Draft, band, disc, ellipse, hash3, plus, star, stroke, type VfxSprite } from './raster';

export type { VfxSprite };

/** Effects ride this far above a unit's feet: its chest. */
export const CHEST = 9;
/** Aims snap to this many directions for swings, and shots turn in this many. */
export const SWING_DIRS = 32;
export const SHOT_DIRS = 16;
/**
 * Frames in a swing and the share of the swing each shows (they add up to 1): the smear and the
 * streak (the two that show), then two of nothing but Kevin's shockwave rolling out.
 */
export const SWING_FRAMES = 4;
export const SWING_TIMING: readonly number[] = [0.22, 0.22, 0.28, 0.28];
/** Frames in an impact, each this long (s). */
export const IMPACT_FRAMES = 4;
export const IMPACT_FRAME_S = 0.06;
/** Frames in a projectile's loop. */
export const BOLT_FRAMES = 6;
export const ORB_FRAMES = 8;
export const FIRE_FRAMES = 6;
export const BULLET_FRAMES = 4;

const DEG = Math.PI / 180;

/** The direction index (0 = right, counting clockwise on screen) nearest to (x, y). */
export function dirIndex(x: number, y: number, n: number): number {
  if (!x && !y) return 0;
  const a = Math.atan2(y, x);
  return ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
}

export function dirAngle(i: number, n: number): number {
  return (i / n) * Math.PI * 2;
}

/** Which frame of a swing shows `u` (0..1) of the way through it. */
export function swingFrameAt(u: number): number {
  let acc = 0;
  for (let i = 0; i < SWING_TIMING.length; i++) {
    acc += SWING_TIMING[i];
    if (u < acc) return i;
  }
  return SWING_TIMING.length - 1;
}

// ------------------------------------------------------------------ colors

/** The class colors a shot keeps whatever the tier (its core): arcane, holy, fire, steel. */
export const ARCANE: Ramp = ['#2a1450', '#5a2ab0', '#9a6aff', '#d8c4ff', '#ffffff'];
export const HOLY: Ramp = ['#7a5a20', '#c8963a', '#f4d070', '#fff2b8', '#ffffff'];
export const FIRE: Ramp = ['#5a1008', '#b8300c', '#ff7a1a', '#ffd04a', '#fffbe0'];
export const STEEL: Ramp = ['#3a4050', '#6a7488', '#a8b2c4', '#e4eaf2', '#ffffff'];
/** Dust and grit (a shot into a wall, a blow's kick-up). */
export const DUST: Ramp = ['#3a3230', '#6a5e54', '#a0927e', '#d2c6ae', '#f2ead8'];

const rampCache = new Map<string, Ramp>();

/** A five-shade ramp round any color (mob bullets, skill shots), in even OKLCH steps. */
export function rampFrom(hex: string): Ramp {
  let r = rampCache.get(hex);
  if (r) return r;
  const [L, C, h] = hexToOklch(hex);
  const c = Math.max(0.05, Math.min(0.2, C));
  r = [
    oklchToHex(0.3, c * 0.75, h - 8),
    oklchToHex(0.46, c * 0.95, h - 4),
    oklchToHex(Math.max(0.6, Math.min(0.8, L)), c, h),
    oklchToHex(0.87, c * 0.5, h + 4),
    oklchToHex(0.97, c * 0.12, h + 6),
  ];
  rampCache.set(hex, r);
  return r;
}

const rainbowTable = new Map<number, string>();

/** Shade i of a look at t (0..1) along the stroke: its ramp, or for the primordial the turning rainbow. */
export function tone(L: VfxLook, i: number, t = 0.5): string {
  const k = i < 0 ? 0 : i > 4 ? 4 : i | 0;
  if (!L.rainbow) return L.ramp[k];
  const h = Math.round(((((L.hue + t * 150) % 360) + 360) % 360) / 10) % 36;
  const key = k * 64 + h;
  let c = rainbowTable.get(key);
  if (!c) {
    c = rainbowShade(k, h * 10);
    rainbowTable.set(key, c);
  }
  return c;
}

/** The accent at t: its own color, the rainbow half a turn on, or (absolute) black ink. */
function accentOf(L: VfxLook, t: number): string {
  return L.rainbow ? tone(L, 3, t + 0.5) : L.accent;
}

const toneOf = (r: Ramp, i: number) => r[i < 0 ? 0 : i > 4 ? 4 : i | 0];

// ------------------------------------------------------------------ swings

/**
 * The strokes, after the classic pixel-art sword smear: on the tick the blow lands, ONE solid
 * flat-white wedge sweeps from behind the head, over, and far out in front to a crisp point, a thin
 * return line under it; the next frame thins it to a long tapered streak; then it's gone (the knight
 * finishes the follow-through). No gradient inside, no glow, no particles: hard pixel edges in a
 * couple of pale tones, and the shape and the speed sell the power. A tier tints the smear's edge
 * (uncommon), thickens that edge (rare) and lays more smears behind it (epic: one, celestial: two);
 * absolute (Kevin's) is the biggest and cleanest, white with black ink, and its blows ring out in
 * shockwaves.
 */
interface SmearGeom {
  kind: 'smear';
  /** The ellipse the blade's tip runs round (px): forward and side semi-axes, its center this far ahead of the chest. */
  a: number;
  b: number;
  cu: number;
  /** The sweep, in degrees round from the front toward the smear's side: it starts at `from` (180: straight back) and ends `past` beyond the front. */
  from: number;
  past: number;
  /** Thickest (px) and where along the sweep (0..1). */
  thick: number;
  peak: number;
  /** The return line, from the tip back to this point (in a and b, under the knight); null: none. */
  back: readonly [number, number] | null;
  /** All the way round (the lance's sweep). */
  full?: boolean;
}

interface SpikeGeom {
  kind: 'spike';
  reach: number;
  width: number;
}

const GEOM: Record<SwingStyle, SmearGeom | SpikeGeom> = {
  slash: { kind: 'smear', a: 26, b: 13, cu: 8, from: 166, past: 14, thick: 9, peak: 0.74, back: [-0.3, -0.85] },
  chop: { kind: 'smear', a: 19, b: 15, cu: 8, from: 140, past: 40, thick: 11, peak: 0.62, back: null },
  cleave: { kind: 'smear', a: 26, b: 17, cu: 8, from: 172, past: 10, thick: 10, peak: 0.66, back: [-0.18, -0.66] },
  bash: { kind: 'smear', a: 15, b: 13, cu: 7, from: 118, past: 32, thick: 10, peak: 0.52, back: null },
  slam: { kind: 'smear', a: 14, b: 13, cu: 6, from: 160, past: 44, thick: 9, peak: 0.6, back: [-0.2, -0.5] },
  spin: { kind: 'smear', a: 22, b: 15, cu: 0, from: 180, past: 180, thick: 6, peak: 0.84, back: null, full: true },
  thrust: { kind: 'spike', reach: 44, width: 6 },
  stab: { kind: 'spike', reach: 22, width: 4 },
  impale: { kind: 'spike', reach: 62, width: 7 },
};

/** The 3/4 view squashes what's drawn round a knight a little, top to bottom. */
const SQUASH = 0.86;

/** How far a swing style reaches from the chest (px; culling). */
export function swingReach(style: SwingStyle): number {
  const g = GEOM[style];
  return g.kind === 'smear' ? g.cu + g.a + 6 : g.reach + 4;
}

/** Thickness along a smear: a hair at its start, fullest at `peak`, a point at its tip. */
function profile(t: number, peak: number): number {
  if (t <= peak) return Math.pow(Math.sin(((t / peak) * Math.PI) / 2), 0.85);
  return Math.pow(Math.cos((((t - peak) / (1 - peak)) * Math.PI) / 2), 0.55);
}

/** The edge tones: the reference's pale steel at common, the tier's own light and mid after; Kevin's ink. */
function edgeTones(L: VfxLook, t: number): [string, string] {
  if (L.mono) return ['#000000', '#000000'];
  if (L.level === 0) return ['#c7cfdd', '#92a1b9'];
  return [tone(L, 3, t), tone(L, 2, t)];
}

/** A smear's frame: [the part of the sweep shown, thickness scale, size scale, return line]. */
const SMEAR_FRAMES: ReadonlyArray<{ t0: number; th: number; grow: number; back: boolean } | null> = [
  { t0: 0, th: 1, grow: 1, back: true },
  { t0: 0.34, th: 0.34, grow: 1.08, back: false },
  null,
  null,
];

interface Frame2 {
  /** Forward and the smear's side, on screen (unit vectors before the squash). */
  fx: number;
  fy: number;
  sx: number;
  sy: number;
}

/** The forward and side axes for an aim index: the smear rides the top side (for straight up and down aims, the `sign` side). */
function axes(dir: number, sign: 1 | -1): Frame2 {
  const a = dirAngle(dir, SWING_DIRS);
  const fx = Math.cos(a);
  const fy = Math.sin(a);
  let sx = fy;
  let sy = -fx;
  if (Math.abs(sy) < 0.25 ? sx * sign < 0 : sy > 0) {
    sx = -sx;
    sy = -sy;
  }
  return { fx, fy, sx, sy };
}

/**
 * Rasterizes a smear: every pixel within `thick(t)` pixels (minor-axis count) inside the edge of
 * the ellipse its blade runs round, between the sweep's start and tip. `paint` gets t along the
 * sweep, p the row counted in from the edge (0 = the outer rim) and n the rows there.
 */
function smear(g: SmearGeom, sc: number, ax: Frame2, rot: number, t0: number, thick: (t: number) => number, paint: (x: number, y: number, t: number, p: number, n: number) => void): void {
  // Turned back by `rot` degrees (the layers behind lag the lead smear).
  const cr = Math.cos(rot * DEG);
  const sr = Math.sin(rot * DEG);
  const fx = ax.fx * cr - ax.sx * sr;
  const fy = ax.fy * cr - ax.sy * sr;
  const sx = ax.sx * cr + ax.fx * sr;
  const sy = ax.sy * cr + ax.fy * sr;
  const A = g.a * sc;
  const B = g.b * sc;
  const C = g.cu * sc;
  const span = g.from + g.past;
  const R = Math.ceil(C + Math.max(A, B) + 2);
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const yy = y / SQUASH;
      const u = x * fx + yy * fy;
      const v = x * sx + yy * sy;
      const eu = (u - C) / A;
      const ev = v / B;
      const rho = Math.sqrt(eu * eu + ev * ev);
      if (rho > 1.2 || rho < 0.15) continue;
      const th = (Math.atan2(ev, eu) * 180) / Math.PI;
      let t: number;
      if (g.full) t = ((((g.from - th) % 360) + 360) % 360) / 360;
      else {
        if (th > g.from || th < -g.past) continue;
        t = (g.from - th) / span;
      }
      if (t < t0) continue;
      // Rows in from the edge, counted on the screen's minor axis (a clean 1-pixel line has one per column).
      const gu = eu / (A * rho);
      const gv = ev / (B * rho);
      const gx = gu * fx + gv * sx;
      const gy = (gu * fy + gv * sy) / SQUASH;
      const depth = (1 - rho) / Math.max(Math.abs(gx), Math.abs(gy), 1e-6) + 0.5;
      const n = Math.max(1, Math.round(thick(t)));
      if (depth < 0 || depth >= n) continue;
      paint(x, y, t, Math.floor(depth), n);
    }
  }
}

/** A point of the smear's ellipse (local: u forward, v toward its side) on screen. */
function onScreen(ax: Frame2, u: number, v: number): [number, number] {
  return [u * ax.fx + v * ax.sx, (u * ax.fy + v * ax.sy) * SQUASH];
}

/**
 * A swing's frame: its style, the look (tier colors and extras), the aim's direction index (of
 * SWING_DIRS), which side it rides on a straight up or down aim, the frame (of SWING_FRAMES: the
 * smear, the streak, then nothing but a shockwave for Kevin) and whether it crit.
 */
export function swingSprite(style: SwingStyle, L: VfxLook, dir: number, sign: 1 | -1, frame: number, crit: boolean): VfxSprite {
  const g = GEOM[style];
  const f = Math.max(0, Math.min(SWING_FRAMES - 1, frame | 0));
  const d = new Draft(L.mono ? 92 : 72);
  const sc = L.scale * (crit ? 1.12 : 1);
  if (g.kind === 'smear') smearSwing(d, g, L, axes(dir, sign), f, sc, crit);
  else spikeSwing(d, g, L, dir, f, sc, crit);
  // Kevin's blows ring out: a white shockwave with a black line under it, rolling out over the ground.
  if (L.mono && f >= 1) {
    const rx = (12 + f * 9) * sc;
    ellipse(0, CHEST - 1, rx, rx * 0.4, (x, y, a) => {
      if (f === 3 && Math.floor(a * 56) % 2) return;
      d.put(x, y, f === 3 ? '#d8d8e0' : '#ffffff', 1);
      if (f <= 2) d.put(x, y + 1, '#000000', 0);
    });
  }
  return d.sprite();
}

function smearSwing(d: Draft, g: SmearGeom, L: VfxLook, ax: Frame2, f: number, sc: number, crit: boolean): void {
  const F = SMEAR_FRAMES[f];
  // Eternal and up: when the streak is gone its rim lingers one frame more, a dotted line in its color.
  if (!F && f === 2 && L.linger && !L.mono) {
    smear(g, sc * 1.1, ax, 0, 0.45, () => 1, (x, y, t) => {
      if ((x + y) % 2) return;
      d.put(x, y, tone(L, 3, t), 2);
    });
  }
  if (!F) return;
  const T = g.thick * (0.85 + 0.15 * sc) + (crit ? 1 : 0) + (L.mono ? 2 : 0);
  const thick = (t: number) => 1 + (T * F.th - 1) * profile(t, g.peak);
  const s = sc * F.grow;
  // The layers behind (epic and up; Kevin's is black): the same smear lagging, in the tier's colors.
  const layers = L.mono ? 1 : L.echoes;
  for (let e = layers; e >= 1; e--) {
    const lag = (g.full ? 26 : 20) * e;
    smear(g, s * (1 - 0.05 * e), ax, -lag, F.t0, (t) => thick(t) * 0.9, (x, y, t, p, n) => {
      if (L.mono) {
        d.put(x, y, '#000000', 1);
        return;
      }
      const body = L.rainbow ? tone(L, 2, t + 0.3 * e) : e === 1 ? tone(L, 2, t) : accentOf(L, t);
      d.put(x, y, p === n - 1 && n >= 3 ? tone(L, 1, t) : body, 1);
    });
  }
  // The smear: flat white, its inner edge (and its thin start) in the edge tones.
  smear(g, s, ax, 0, F.t0, thick, (x, y, t, p, n) => {
    const [e1, e2] = edgeTones(L, t);
    const tv = (t - F.t0) / (1 - F.t0);
    let c = '#ffffff';
    if (n >= 3 && p === n - 1) c = L.edge && n >= 5 ? e2 : e1;
    else if (L.edge && n >= 5 && p === n - 2) c = e1;
    else if (tv < 0.2 && p > 0) c = e1;
    if (L.mono && p === 0 && f === 0 && tv > 0.15) c = '#000000';
    if (tv < 0.07 && (x + y) % 2) return;
    d.put(x, y, c, 3);
  });
  // The return line: from the tip back under the knight, thin, white then pale.
  if (F.back && g.back) {
    const tipT = -g.past * DEG;
    const [tx, ty] = onScreen(ax, (g.cu + g.a * Math.cos(tipT)) * s, g.b * Math.sin(tipT) * s);
    const [bx, by] = onScreen(ax, (g.cu + g.a * g.back[0]) * s, g.b * g.back[1] * s);
    stroke(tx, ty, bx, by, (q) => (q < 0.22 ? 2 : 1), (x, y, q) => {
      const [e1] = edgeTones(L, 1);
      d.put(x, y, q > 0.72 ? (L.mono ? '#000000' : e1) : '#ffffff', 2);
    });
    // Mythic and up: a second return line in the accent color, a step under the first.
    if (L.double && !L.mono) {
      const [ox, oy] = onScreen(ax, 0, -2.5);
      stroke(tx + ox, ty + oy, bx + ox * 1.6, by + oy * 1.6, () => 1, (x, y, q) => {
        if (q > 0.85) return;
        d.put(x, y, accentOf(L, q), 1);
      });
    }
  }
  // Exalted and up: the tip glints as the smear lands (a small crisp star).
  if (f === 0 && L.star && !L.mono) {
    const tipT = -g.past * DEG;
    const [tx, ty] = onScreen(ax, (g.cu + g.a * Math.cos(tipT)) * s, g.b * Math.sin(tipT) * s);
    star(d, tx, ty, 2 + (L.level >= 8 ? 1 : 0), ['#ffffff', '#ffffff', tone(L, 3, 1), tone(L, 2, 1)], 4, false);
  }
}

function spikeSwing(d: Draft, g: SpikeGeom, L: VfxLook, dir: number, f: number, sc: number, crit: boolean): void {
  if (f > 2 || (f === 2 && (!L.linger || L.mono))) return;
  const a = dirAngle(dir, SWING_DIRS);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const m = Math.max(Math.abs(ux), Math.abs(uy));
  // Across, in minor-axis pixels; the return line rides the lower side.
  let nx = -uy / m;
  let ny = ux / m;
  if (ny < 0 || (Math.abs(ny) < 0.1 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const reach = g.reach * (1 + (sc - 1) * 0.6) * (f === 1 ? 1.1 : 1);
  const W = g.width + (L.level >= 8 ? 1 : 0) + (crit ? 1 : 0) + (L.mono ? 2 : 0);
  const base = 3;
  const P = (s: number, off = 0): [number, number] => [ux * (base + (reach - base) * s) + nx * off, uy * (base + (reach - base) * s) + ny * off];
  // Eternal and up: the streak's line lingers one frame more, dotted, in its color.
  if (f === 2) {
    const [x0, y0] = P(0.45);
    const [x1, y1] = P(1);
    stroke(x0, y0, x1, y1, () => 1, (x, y, q) => {
      if ((x + y) % 2) return;
      d.put(x, y, tone(L, 3, q), 2);
    });
    return;
  }
  const s0 = f === 0 ? 0 : 0.42;
  const width = (s: number) => {
    const w = f === 0 ? W : Math.max(1, Math.round(W * 0.4));
    if (s > 0.84) return Math.max(1, Math.round((w * (1 - s)) / 0.16));
    return Math.max(1, Math.round(w * Math.min(1, 0.2 + s * 1.1)));
  };
  // The layers behind: a wider spike in the tier's colors, a step back.
  const layers = L.mono ? 1 : L.echoes;
  for (let e = layers; e >= 1; e--) {
    const [x0, y0] = P(s0 - 0.06 * e);
    const [x1, y1] = P(1 - 0.08 * e);
    stroke(x0, y0, x1, y1, (q) => width(s0 + q * (1 - s0)) + 2 * e, (x, y, q) => d.put(x, y, L.mono ? '#000000' : e === 1 ? tone(L, 2, q) : accentOf(L, q), 1));
  }
  const [x0, y0] = P(s0);
  const [x1, y1] = P(1);
  stroke(x0, y0, x1, y1, (q) => width(s0 + q * (1 - s0)), (x, y, q, across) => {
    const s = s0 + q * (1 - s0);
    const w = width(s);
    const [e1, e2] = edgeTones(L, s);
    // The outermost row on each side is the edge.
    const lo = -w / 2 + (w % 2 === 0 ? 0.5 : 0);
    const edge = w >= 3 && (across < lo + 0.5 || across >= lo + w - 1.5);
    let c = edge ? (L.edge ? e2 : e1) : '#ffffff';
    if (s < 0.12) c = e1;
    if (s < 0.06 && (x + y) % 2) return;
    d.put(x, y, c, 3);
  });
  // On the hit: a speed line either side, and the point flashes (a crisp four-point star).
  if (f === 0) {
    const off = W / 2 + 2;
    for (const [side, a0, a1] of [[1, 0.3, 0.92], [-1, 0.5, 0.86]] as const) {
      const [rx0, ry0] = P(a0, off * side);
      const [rx1, ry1] = P(a1, off * side);
      stroke(rx0, ry0, rx1, ry1, () => 1, (x, y, q) => d.put(x, y, q < 0.3 ? edgeTones(L, q)[0] : '#ffffff', 2));
    }
    // Mythic and up: a second pair of speed lines, in the accent color.
    if (L.double && !L.mono) {
      for (const side of [1, -1]) {
        const [qx0, qy0] = P(0.55, (off + 2) * side);
        const [qx1, qy1] = P(0.8, (off + 2) * side);
        stroke(qx0, qy0, qx1, qy1, () => 1, (x, y, q) => d.put(x, y, accentOf(L, q), 1));
      }
    }
    const [tx, ty] = P(1);
    const [e1] = edgeTones(L, 1);
    star(d, tx + ux, ty + uy, 2 + (crit ? 1 : 0) + (L.star ? 1 : 0) + (L.level >= 8 ? 1 : 0), ['#ffffff', '#ffffff', '#ffffff', e1, e1], 4, L.star && !L.mono);
  }
}

// ------------------------------------------------------------------ channels

/** Whirlwind: two smears chasing round the knight (dir: where the lead one's tip is). */
export function whirlSprite(L: VfxLook, dir: number, flick: number): VfxSprite {
  const d = new Draft(48);
  const g: SmearGeom = { kind: 'smear', a: 20, b: 15, cu: 0, from: 150, past: 0, thick: 6, peak: 0.78, back: null };
  const T = 6 * L.scale + (L.mono ? 2 : 0);
  const base = axes(dir, 1);
  for (const flip of [1, -1]) {
    // The second smear opposite the first.
    const ax: Frame2 = { fx: base.fx * flip, fy: base.fy * flip, sx: base.sx * flip, sy: base.sy * flip };
    for (let e = L.mono ? 1 : L.echoes; e >= 1; e--) {
      smear(g, L.scale * 0.96, ax, -22 * e, 0, (t) => 1 + (T * 0.8 - 1) * profile(t, 0.78), (x, y, t) => d.put(x, y, L.mono ? '#000000' : e === 1 ? tone(L, 2, t) : accentOf(L, t), 1));
    }
    smear(g, L.scale, ax, 0, 0, (t) => 1 + (T - 1) * profile(t, 0.78), (x, y, t, p, n) => {
      const [e1, e2] = edgeTones(L, t);
      let c = '#ffffff';
      if (n >= 3 && p === n - 1) c = L.edge && n >= 5 ? e2 : e1;
      else if (t < 0.2 && p > 0) c = e1;
      if (t < 0.08 && (x + y + flick) % 2) return;
      d.put(x, y, c, 3);
    });
  }
  return d.sprite();
}

/** A lunge: a white spike leading the charge, the air streaming past behind (phase: 0..2, it scrolls). */
export function lungeSprite(L: VfxLook, dir: number, phase: number): VfxSprite {
  const d = new Draft(64);
  const a = dirAngle(dir, SWING_DIRS);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const m = Math.max(Math.abs(ux), Math.abs(uy));
  const nx = -uy / m;
  const ny = ux / m;
  const W = 3 + (L.level >= 8 ? 1 : 0) + (L.mono ? 1 : 0);
  if (L.echoes > 0 || L.mono) {
    stroke(ux * 3, uy * 3, ux * 22, uy * 22, (s) => (s > 0.82 ? Math.max(1, Math.round(((W + 2) * (1 - s)) / 0.18)) : W + 2), (x, y, s) => d.put(x, y, L.mono ? '#000000' : tone(L, 2, s), 1));
  }
  stroke(ux * 4, uy * 4, ux * 24, uy * 24, (s) => (s > 0.82 ? Math.max(1, Math.round((W * (1 - s)) / 0.18)) : Math.max(1, Math.round(W * Math.min(1, 0.3 + s)))), (x, y, s, across) => {
    const [e1, e2] = edgeTones(L, s);
    const edge = Math.abs(across) >= W / 2 - 0.5 && W >= 3;
    d.put(x, y, s < 0.15 ? e1 : edge ? (L.edge ? e2 : e1) : '#ffffff', 3);
  });
  // Speed lines streaming back past the knight.
  const LINES: Array<[number, number, number]> = [[0, 2, 24], [-3, 6, 16], [3, 4, 18], [-6, 9, 12], [6, 11, 10]];
  for (const [across, start, len] of LINES) {
    const b0 = 9 + start + phase * 3;
    const b1 = b0 + len * (0.8 + 0.2 * L.trail);
    stroke(-ux * b0 + nx * across, -uy * b0 + ny * across, -ux * b1 + nx * across, -uy * b1 + ny * across, () => 1, (x, y, s) => {
      if (s > 0.7 && (x + y) % 2) return;
      d.put(x, y, s < 0.45 ? '#ffffff' : edgeTones(L, s)[0], 2);
    });
  }
  return d.sprite();
}

// ------------------------------------------------------------------ projectiles

/**
 * The arrow, hand-drawn pointing right, 22.5 degrees down and 45 degrees down (the anchor is the head's
 * base, '@' marks it). T tip, H head, h barbs, S shaft, s shaft shade, F feather, f feather root, n nock.
 */
const ARROW_ART: ReadonlyArray<readonly string[]> = [
  [
    '.FF......h..',
    'nffsSSSSs@HT',
    '.FF......h..',
  ],
  [
    '.F.........',
    'nfF........',
    'FFfs.......',
    '....SSS.h..',
    '.......s@..',
    '........hHT',
  ],
  [
    'n........',
    '.fF......',
    '.FfF.....',
    '..Fs.....',
    '....S....',
    '.....S...',
    '......sh.',
    '......h@.',
    '........T',
  ],
];

interface ArtPoint {
  x: number;
  y: number;
  c: string;
}

function parseArt(rows: readonly string[]): ArtPoint[] {
  let ax = 0;
  let ay = 0;
  rows.forEach((r, y) => {
    const x = r.indexOf('@');
    if (x >= 0) {
      ax = x;
      ay = y;
    }
  });
  const out: ArtPoint[] = [];
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) if (r[x] !== '.') out.push({ x: x - ax, y: y - ay, c: r[x] === '@' ? 'H' : r[x] });
  });
  return out;
}

const ARROW_POINTS = ARROW_ART.map(parseArt);

/** A base drawing turned to one of 16 directions by exact mirrors and transposes. */
function orient(base: readonly ArtPoint[][], dir: number): ArtPoint[] {
  const i = ((dir % 16) + 16) % 16;
  // 0..4 within the first quadrant (0 to 90 degrees), the rest mirrored.
  const q = i <= 8 ? i : 16 - i;
  const flipY = i > 8;
  const flipX = q > 4;
  const p = flipX ? 8 - q : q;
  const src = p <= 2 ? base[p] : base[4 - p];
  const tr = p > 2;
  return src.map((o) => {
    let x = tr ? o.y : o.x;
    let y = tr ? o.x : o.y;
    if (flipX) x = -x;
    if (flipY) y = -y;
    return { x, y, c: o.c };
  });
}

const ARROW_BODY: Record<string, string> = { T: '#ffffff', H: '#dce4ee', h: '#7a8498', S: '#c89058', s: '#7a4a28', n: '#3a263a' };

/**
 * An arrow in flight: steel head, wooden shaft, fletching (in the tier's color from uncommon), and
 * a motion streak behind it that grows with the tier; heavy (a skill's) arrows get a colored rim.
 */
export function arrowSprite(L: VfxLook, dir: number, heavy: boolean, frame: number): VfxSprite {
  const d = new Draft(36);
  const pts = orient(ARROW_POINTS, dir);
  const a = dirAngle(dir, SHOT_DIRS);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const m = Math.max(Math.abs(ux), Math.abs(uy));
  const fe = L.level === 0 ? ['#ece6dc', '#a8a0a0'] : L.mono ? ['#ffffff', '#000000'] : [tone(L, 3, 0.8), tone(L, 1, 0.8)];
  let nock: ArtPoint = pts[0];
  for (const p of pts) {
    if (p.c === 'n') nock = p;
    const c = p.c === 'F' ? fe[0] : p.c === 'f' ? fe[1] : ARROW_BODY[p.c];
    d.put(p.x, p.y, c, 5);
  }
  if (L.edge && !L.mono) d.edge(tone(L, 0));
  // After-images: the arrow a moment ago, a dithered ghost in the tier's shades (epic and up).
  for (let e = L.echoes; e >= 1; e--) {
    const back = Math.round(10 * e);
    const ox = Math.round(-ux * back);
    const oy = Math.round(-uy * back);
    for (const p of pts) {
      if (p.c === 'n' || p.c === 'F' || (p.x + p.y + e) % 2) continue;
      d.put(p.x + ox, p.y + oy, tone(L, e === 1 ? 2 : 1, 0.5), 1);
    }
  }
  // The streak.
  const len = Math.round((heavy ? 7 : 4) * L.trail) + (heavy ? 2 : 0);
  const sx = nock.x - ux / m;
  const sy = nock.y - uy / m;
  const streak = (off: number, n: number, pri: number, col: (s: number) => string | null) => {
    const ox = (-uy / m) * off;
    const oy = (ux / m) * off;
    stroke(sx + ox, sy + oy, sx - ux * n + ox, sy - uy * n + oy, () => 1, (x, y, s) => {
      const c = col(s);
      if (!c) return;
      if (s > 0.6 && (x + y + frame) % 2) return;
      d.put(x, y, c, pri);
    });
  };
  streak(0, len, 3, (s) => (L.level === 0 ? (s < 0.3 ? '#e4eaf2' : s < 0.65 ? '#a8b4c8' : '#6c7890') : tone(L, s < 0.3 ? 3 : s < 0.65 ? 2 : 1, s)));
  if (L.double) {
    for (const side of [-2, 2]) streak(side, Math.round(len * 0.7), 2, (s) => (s < 0.4 ? accentOf(L, s) : tone(L, 1, s)));
  }
  // Heavy arrows (a skill's) and the rarer tiers: a colored rim round the arrow.
  if (heavy || L.level >= 8) {
    for (const p of pts) {
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!d.has(p.x + ox, p.y + oy)) d.put(p.x + ox, p.y + oy, L.mono ? '#000000' : tone(L, heavy ? 2 : 1, 0.7), 0);
      }
    }
  }
  if (L.star && frame % 2 === 0) {
    const tip = pts.find((p) => p.c === 'T') ?? pts[0];
    d.put(tip.x + Math.round(ux), tip.y + Math.round(uy), tone(L, 4, 1), 6);
  }
  return d.sprite();
}

/**
 * A spear in flight (the Lancer's javelin, Skyfall's shards): a leaf-shaped steel head, a wooden
 * shaft, a ribbon in the tier's color and speed lines alongside.
 */
export function spearSprite(L: VfxLook, dir: number, small: boolean, frame: number): VfxSprite {
  const d = new Draft(36);
  const a = dirAngle(dir, SHOT_DIRS);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const m = Math.max(Math.abs(ux), Math.abs(uy));
  const nx = -uy / m;
  const ny = ux / m;
  const head = small ? 3 : 5;
  const shaft = small ? 6 : 11;
  // Shaft.
  stroke(0, 0, -ux * shaft, -uy * shaft, () => 1, (x, y, s) => d.put(x, y, s < 0.5 ? '#b07a44' : '#7a4a28', 4));
  // Head: a leaf, widest a third of the way, hot at the point.
  stroke(ux, uy, ux * (head + 1), uy * (head + 1), (s) => (small ? 1 : s < 0.65 ? 3 : 1), (x, y, s, across) => {
    const c = s > 0.82 ? '#ffffff' : Math.abs(across) < 0.5 ? '#e4eaf2' : '#8a94a8';
    d.put(x, y, c, 5);
  });
  if (L.edge && !L.mono) d.edge(tone(L, 0));
  // Ribbon at the head's base.
  const rib = L.level === 0 ? '#c8402a' : L.mono ? '#000000' : tone(L, 2, 0.5);
  const flap = frame % 2 ? 1 : 0;
  d.put(Math.round(-ux * 1 + nx * 1), Math.round(-uy * 1 + ny * 1), rib, 3);
  d.put(Math.round(-ux * (2 + flap) + nx * (1 + flap)), Math.round(-uy * (2 + flap) + ny * (1 + flap)), L.level === 0 ? '#8a2418' : tone(L, 1, 0.5), 3);
  // Speed lines.
  const len = Math.round((small ? 4 : 6) * L.trail);
  for (const side of small ? [0] : [-2, 2]) {
    const ox = nx * side;
    const oy = ny * side;
    const b0 = shaft * (side ? 0.3 : 1) + 1;
    stroke(-ux * b0 + ox, -uy * b0 + oy, -ux * (b0 + len) + ox, -uy * (b0 + len) + oy, () => 1, (x, y, s) => {
      if (s > 0.6 && (x + y + frame) % 2) return;
      d.put(x, y, L.level === 0 ? (s < 0.5 ? '#e4eaf2' : '#a8b4c8') : tone(L, s < 0.5 ? 3 : 2, s), 2);
    });
  }
  if (L.echoes > 0 && !small) {
    for (let e = 1; e <= L.echoes; e++) {
      const back = 7 * e;
      stroke(-ux * back, -uy * back, -ux * (back + shaft * 0.7), -uy * (back + shaft * 0.7), () => 1, (x, y) => d.put(x, y, tone(L, 2 - e, 0.5), 1));
    }
  }
  if (L.star && frame % 2 === 0) d.put(Math.round(ux * (head + 2)), Math.round(uy * (head + 2)), tone(L, 4, 1), 6);
  return d.sprite();
}

/**
 * The Arcanist's bolt: a white-hot core in an arcane shell that throbs, sparks orbiting it on a
 * tilted ring (passing behind it and in front; two, three from mythic) in the tier's color from
 * uncommon. Its trail is drawn live (it curves as it homes).
 */
export function boltSprite(L: VfxLook, frame: number, core: Ramp = ARCANE): VfxSprite {
  const d = new Draft(14);
  const f = ((frame % BOLT_FRAMES) + BOLT_FRAMES) % BOLT_FRAMES;
  const r = 2.3 + (f % 3 === 0 ? 0.6 : f % 3 === 1 ? 0.3 : 0);
  // A white-hot heart in lavender, an arcane rim.
  disc(0, 0, r, (x, y, q) => d.put(x, y, toneOf(core, q < 0.42 ? 4 : q < 0.78 ? 3 : 2), 3));
  // It twinkles: a four-point flare through the heart every third frame, a short one between.
  const flare = f % 3 === 0 ? Math.round(r + 2) : f % 3 === 1 ? Math.round(r + 1) : 0;
  if (flare) star(d, 0, 0, flare, [toneOf(core, 4), toneOf(core, 4), toneOf(core, 4), toneOf(core, 3), toneOf(core, 2), toneOf(core, 2)], 3, false);
  if (L.edge && !L.mono) d.edge(tone(L, 0));
  // Arcane crackle: a few dark-violet pixels round it, different every frame.
  for (let i = 0; i < 7; i++) {
    const ang = hash3(i, f, 11) * Math.PI * 2;
    const rr = r + 1 + hash3(i, f, 23) * 1.6;
    const x = Math.round(Math.cos(ang) * rr);
    const y = Math.round(Math.sin(ang) * rr);
    if (!d.has(x, y)) d.put(x, y, toneOf(core, i % 3 ? 1 : 2), 1);
  }
  // Sparks orbiting on a tilted ring: in front of it, then behind it; tails against their way.
  const sparks = L.double ? 3 : 2;
  const col = L.level === 0 ? [toneOf(core, 4), toneOf(core, 3), toneOf(core, 2)] : [tone(L, 4, 0.2), tone(L, 3, 0.2), tone(L, 2, 0.2)];
  const rx = 5.5 + (L.level >= 8 ? 1 : 0);
  const ry = 2.6;
  for (let i = 0; i < sparks; i++) {
    const ang = (f / BOLT_FRAMES) * Math.PI * 2 + (i / sparks) * Math.PI * 2;
    for (let k = 2; k >= 0; k--) {
      const b = ang - k * 0.34;
      const front = Math.sin(b) > 0;
      d.put(Math.round(Math.cos(b) * rx), Math.round(Math.sin(b) * ry) - 1, col[k], front ? 4 : 2);
    }
  }
  if (L.star && f % 3 === 2) star(d, 0, 0, 4, [toneOf(core, 4), toneOf(core, 4), tone(L, 3), tone(L, 2), tone(L, 1)], 5, true);
  return d.sprite();
}

/**
 * The Cleric's holy orb: a soft gold core that swells and settles inside a halo of four arcs of
 * light turning round it (the tier's color between them from uncommon; a second, counter-turning
 * halo from mythic), motes winking at the corners, a cross of light at its heart from exalted.
 */
export function orbSprite(L: VfxLook, frame: number): VfxSprite {
  const d = new Draft(14);
  const f = ((frame % ORB_FRAMES) + ORB_FRAMES) % ORB_FRAMES;
  const pulse = 0.5 + 0.5 * Math.sin((f / ORB_FRAMES) * Math.PI * 2);
  const r = 2.3 + pulse * 0.9;
  disc(0, 0, r, (x, y, q) => d.put(x, y, toneOf(HOLY, q < 0.4 ? 4 : q < 0.74 ? 3 : 2), 3));
  if (L.edge && !L.mono) d.edge(tone(L, 0));
  const tint = L.level === 0 ? toneOf(HOLY, 2) : tone(L, 3, 0.3);
  const R = 5 + (L.level >= 8 ? 1 : 0);
  // Four arcs of light turning round it, bright at their leading ends.
  ellipse(0, 0, R, R, (x, y, t) => {
    const u = (((t + f / (ORB_FRAMES * 4)) % 0.25) + 0.25) % 0.25 / 0.25;
    if (u > 0.62) return;
    d.put(x, y, u < 0.2 ? toneOf(HOLY, 4) : u < 0.44 ? toneOf(HOLY, 3) : tint, 2);
  });
  if (L.double) {
    ellipse(0, 0, R + 2, R + 2, (x, y, t) => {
      const u = (((t - f / (ORB_FRAMES * 3)) % 0.334) + 0.334) % 0.334 / 0.334;
      if (u > 0.3) return;
      d.put(x, y, accentOf(L, t), 2);
    });
  }
  // Motes winking at the corners, one pair then the other.
  const m = R + 1;
  for (const [x, y] of f % 4 < 2 ? [[m - 1, -(m - 1)], [-(m - 1), m - 1]] : [[-(m - 1), -(m - 1)], [m - 1, m - 1]]) d.put(x, y, f % 2 ? tint : toneOf(HOLY, 4), 4);
  if (L.star) {
    const len = 2 + Math.round(pulse * 2);
    star(d, 0, 0, len + 1, [toneOf(HOLY, 4), toneOf(HOLY, 4), toneOf(HOLY, 4), toneOf(HOLY, 3), tone(L, 3)], 5, false);
  }
  return d.sprite();
}

/** A fireball that flickers: a white-yellow heart, orange and red licking back from it. */
export function fireSprite(frame: number, dir: number): VfxSprite {
  const d = new Draft(14);
  const f = ((frame % FIRE_FRAMES) + FIRE_FRAMES) % FIRE_FRAMES;
  const a = dirAngle(dir, SHOT_DIRS);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  for (let y = -7; y <= 7; y++) {
    for (let x = -9; x <= 9; x++) {
      // Distance in the flame's own frame: round at the front, licking out behind.
      const along = x * ux + y * uy;
      const across = -x * uy + y * ux;
      const back = Math.max(0, -along);
      const wob = (hash3(x + 31, y + 17, f) - 0.5) * 1.1 + Math.sin(back * 1.3 - f * 1.9 + across) * 0.55;
      const r = Math.hypot(Math.max(0, along) * 1.1, across) + back * 0.42 + wob;
      const reach = 3.8 - back * 0.06;
      if (r > reach || back > 8) continue;
      const q = r / reach;
      const i = q < 0.3 ? 4 : q < 0.52 ? 3 : q < 0.76 ? 2 : q < 0.92 ? 1 : 0;
      d.put(x, y, toneOf(FIRE, i), 3);
    }
  }
  return d.sprite();
}

const dangerCache = new Map<string, Ramp>();

/**
 * A foe's shot's colors: always a danger color, whatever the foe's own (a hot pink for the cool
 * hues and the greys' sake, red for the reds, orange for the yellows and oranges), so a bullet never
 * blends into the floor or reads as one of the knights' own shots: ink, dark, the body, light, white.
 */
export function dangerRamp(hex: string): Ramp {
  let r = dangerCache.get(hex);
  if (r) return r;
  const [, C, h] = hexToOklch(hex);
  const hue = C < 0.03 ? 22 : h >= 15 && h < 45 ? 26 : h >= 45 && h < 115 ? 50 : 352;
  r = [oklchToHex(0.2, 0.07, hue), oklchToHex(0.47, 0.19, hue - 4), oklchToHex(0.64, 0.24, hue), oklchToHex(0.84, 0.12, hue + 6), '#ffffff'];
  dangerCache.set(hex, r);
  return r;
}

/**
 * A foe's shot, made to be tracked at a glance on bright grass, white snow or a dark crypt: a big
 * glossy ball (7 px; a boss's 9) in a danger color, a white-hot heart, a highlight up on its left,
 * its lower rim a shade darker, a 1-pixel ink outline all round; it throbs (bigger, its heart
 * flaring) and drags a short tail. Big: a boss's.
 */
export function bulletSprite(color: string, dir: number, frame: number, big: boolean): VfxSprite {
  return ballSprite(dangerRamp(color), dir, frame, big);
}

/**
 * A foe's shot a Blade cut and sent back, now the knight's own: the same ball, in the knight's colors
 * (pale steel at common) instead of a danger color, so it never reads as one still coming at you.
 */
export function reflectSprite(L: VfxLook, dir: number, frame: number): VfxSprite {
  const r: Ramp = L.level === 0 ? ['#1e2a40', '#4a6a98', '#9ec4f0', '#e4f2ff', '#ffffff'] : L.mono ? ['#000000', '#3a3a44', '#d8d8e0', '#f4f4f8', '#ffffff'] : [tone(L, 0), tone(L, 1), tone(L, 2), tone(L, 3), '#ffffff'];
  return ballSprite(r, dir, frame, false);
}

/** A glossy ball in ramp `r` (ink, dark, body, light, white) with a tail behind it along `dir`. */
function ballSprite(r: Ramp, dir: number, frame: number, big: boolean): VfxSprite {
  const d = new Draft(16);
  const f = ((frame % BULLET_FRAMES) + BULLET_FRAMES) % BULLET_FRAMES;
  const pulse = f === 1 || f === 2;
  const R = (big ? 3.9 : 3.1) + (pulse ? 0.45 : 0);
  // The tail: two pixels wide behind the ball, then one, dithered out.
  const a = dirAngle(dir, SHOT_DIRS);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const tail = big ? 7 : 5;
  stroke(-ux * (R + 0.5), -uy * (R + 0.5), -ux * (R + tail), -uy * (R + tail), (s) => (s < 0.5 ? 2 : 1), (x, y, s) => {
    if (s > 0.6 && (x + y + f) % 2) return;
    d.put(x, y, s < 0.4 ? r[2] : r[1], 1);
  });
  // The ink outline all round, then the ball.
  disc(0, 0, R + 1, (x, y) => d.put(x, y, r[0], 2));
  const heart = (big ? 1.5 : 1.1) + (f === 2 ? 0.6 : 0);
  disc(0, 0, R, (x, y, q) => {
    const rr = q * R;
    let c: string;
    if (rr <= heart) c = '#ffffff';
    else if (rr <= heart + 1.1) c = r[3];
    else if (rr >= R - 0.9 && x + y > 0) c = r[1];
    else c = r[2];
    d.put(x, y, c, 3);
  });
  // The gloss: a highlight up on the left.
  const g = Math.max(1, Math.round(R * 0.55));
  d.put(-g, -g, '#ffffff', 4);
  d.put(-g + 1, -g, r[3], 4);
  return d.sprite();
}

/** Every kind of shot the sim fires, drawn (a Record over Shot['kind']: a new kind won't build without art). */
export const SHOT_ART: Readonly<Record<Shot['kind'], { frames: number; draw: (L: VfxLook, dir: number, frame: number) => VfxSprite }>> = {
  arrow: { frames: 2, draw: (L, dir, f) => arrowSprite(L, dir, false, f) },
  spear: { frames: 2, draw: (L, dir, f) => spearSprite(L, dir, false, f) },
  bolt: { frames: BOLT_FRAMES, draw: (L, _dir, f) => boltSprite(L, f) },
  orb: { frames: ORB_FRAMES, draw: (L, _dir, f) => orbSprite(L, f) },
  fire: { frames: FIRE_FRAMES, draw: (_L, dir, f) => fireSprite(f, dir) },
  bullet: { frames: BULLET_FRAMES, draw: (_L, dir, f) => bulletSprite('#ff6a6a', dir, f, false) },
};

// ------------------------------------------------------------------ impacts

/**
 * spark: an arrow or a spear landing (splinters fly); burst: a bolt's or a fireball's blast (a hot
 * flash, a ring racing out); holy: the orb's (a cross of light, a ring); pop: a foe's shot (small, in
 * its color); thud: the Guardian's blow (a flash at the foe, a shock ring at its feet); cut: a blade
 * through a foe (a hot line across it that splits and flies apart); pierce: a lance through a foe (a
 * streak out the far side, a ring); wall: grit off a wall; fizzle: a shot that ran out; clink: a foe's
 * shot cut out of the air by a swing (a white star, steel chips flying off); muzzle: a shot leaving
 * the knight's hands (a flare along its way, gone in a blink).
 */
export type ImpactKind = 'spark' | 'burst' | 'holy' | 'pop' | 'thud' | 'cut' | 'pierce' | 'wall' | 'fizzle' | 'clink' | 'muzzle';

export const IMPACT_KINDS: readonly ImpactKind[] = ['spark', 'burst', 'holy', 'pop', 'thud', 'cut', 'pierce', 'wall', 'fizzle', 'clink', 'muzzle'];

/**
 * An impact's frame. `core` colors it (the shot's class colors), `L` adds the tier's extras (rings,
 * star bursts, rays), `size` scales it (1 = an ordinary hit; crits and splashes are bigger); `dir`
 * (of SHOT_DIRS) turns the ones that have a direction (cut: along the cut, pierce: along the thrust).
 */
export function impactSprite(kind: ImpactKind, L: VfxLook, core: Ramp, size: number, frame: number, dir = 0): VfxSprite {
  const d = new Draft(44);
  const f = Math.max(0, Math.min(IMPACT_FRAMES - 1, frame | 0));
  const c = (i: number) => toneOf(core, i);
  const s = size;
  const spin = (Math.floor(s * 7) % 3) * 0.35;
  const a = dirAngle(dir, SHOT_DIRS);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  switch (kind) {
    case 'cut': {
      // One white line across the foe; the next frame it splits and the halves slide apart; gone.
      if (f >= 2) break;
      const len = (f === 0 ? 8 : 9) * s;
      const gap = f === 0 ? 0 : 2 * s;
      for (const side of [-1, 1]) {
        stroke(ux * gap * side, uy * gap * side, ux * len * side, uy * len * side, (q) => (f === 0 && q < 0.4 ? 2 : 1), (x, y, q) => {
          const e = q > (f === 0 ? 0.8 : 0.55);
          d.put(x, y, L.mono ? (e ? '#000000' : '#ffffff') : e ? c(3) : '#ffffff', 4);
        });
      }
      break;
    }
    case 'pierce': {
      // The lance goes through: a white streak out the far side, then shorter and further; gone.
      if (f >= 2) break;
      const r0 = (f === 0 ? -3 : 4) * s;
      const r1 = r0 + (f === 0 ? 12 : 8) * s;
      stroke(ux * r0, uy * r0, ux * r1, uy * r1, (q) => (f === 0 && q > 0.25 && q < 0.75 ? 2 : 1), (x, y, q) => {
        const e = q < 0.2;
        d.put(x, y, L.mono ? (e ? '#000000' : '#ffffff') : e ? c(3) : '#ffffff', 4);
      });
      break;
    }
    case 'spark':
    case 'wall': {
      const rays = kind === 'wall' ? 5 : 7;
      if (f === 0) {
        star(d, 0, 0, Math.max(1, Math.round(2 * s)), [c(4), c(4), c(3), c(2)], 4, true);
      } else {
        for (let i = 0; i < rays; i++) {
          if (f === 3 && i % 2) continue;
          const ang = (i / rays) * Math.PI * 2 + spin + (i % 2) * 0.25;
          const r0 = (0.5 + f * 1.6) * s;
          const r1 = r0 + (f === 1 ? 2.2 : f === 2 ? 1.2 : 0) * s;
          const col = f === 1 ? c(i % 2 ? 3 : 4) : f === 2 ? c(i % 2 ? 2 : 3) : c(1);
          stroke(Math.cos(ang) * r0, Math.sin(ang) * r0 * 0.85, Math.cos(ang) * r1, Math.sin(ang) * r1 * 0.85, () => 1, (x, y) => d.put(x, y, col, 3));
        }
        if (f === 1) d.put(0, 0, c(3), 2);
      }
      break;
    }
    case 'burst':
    case 'pop':
    case 'holy': {
      const R = (kind === 'pop' ? 3 : 4.5) * s;
      const k = 0.85;
      if (f === 0) {
        disc(0, 0, Math.max(1.6, R * 0.5), (x, y, q) => d.put(x, y, c(q < 0.55 ? 4 : 3), 3));
        star(d, 0, 0, Math.max(2, Math.round(R * 0.9)), [c(4), c(4), c(4), c(3), c(3), c(2)], 2, false);
      } else {
        const rr = R * (0.85 + f * 0.6);
        band({
          cx: 0,
          cy: 0,
          R: rr,
          k,
          a0: 0,
          span: Math.PI * 2,
          sign: 1,
          t0: 0,
          t1: 1,
          thick: () => (f === 1 ? 2 : 1),
          paint: (x, y, t, p) => {
            if (f === 2 && Math.floor(t * 26 + spin * 4) % 5 === 4) return;
            if (f === 3 && Math.floor(t * 26) % 2) return;
            d.put(x, y, c(f === 1 ? (p === 0 ? 4 : 2) : f === 2 ? 2 : 1), 2);
          },
        });
        if (f === 1) d.put(0, 0, c(4), 3);
        // Sparks thrown out past the ring.
        if (kind !== 'pop') {
          const n = 6;
          for (let i = 0; i < n; i++) {
            if (f === 3 && i % 2) continue;
            const ang = (i / n) * Math.PI * 2 + spin + 0.3;
            const r = rr + 1.5 + f;
            const x = Math.round(Math.cos(ang) * r);
            const y = Math.round(Math.sin(ang) * r * k);
            d.put(x, y, c(f === 1 ? 4 : f === 2 ? 3 : 2), 3);
            if (f === 1) d.put(Math.round(Math.cos(ang) * (r - 1)), Math.round(Math.sin(ang) * (r - 1) * k), c(3), 3);
          }
        }
      }
      if (kind === 'holy' && f <= 2) {
        // A cross of light, taller than wide.
        const up = Math.round((f === 0 ? 7 : f === 1 ? 5 : 3) * s);
        for (let i = 1; i <= up; i++) d.put(0, -i, c(i < up - 1 ? 4 : 3), 4);
        for (let i = 1; i <= Math.round(up * 0.55); i++) {
          d.put(0, i, c(3), 4);
          d.put(i, 0, c(i < 2 ? 4 : 3), 4);
          d.put(-i, 0, c(i < 2 ? 4 : 3), 4);
        }
      }
      break;
    }
    case 'thud': {
      // A flash at the foe's chest, a shock ring at its feet, grit kicked up.
      if (f <= 1) star(d, 0, 0, Math.round((f === 0 ? 3 : 2) * s), f === 0 ? [c(4), c(4), c(3), c(2), c(2)] : [c(3), c(3), c(2), c(1)], 4, f === 0);
      const rx = (5.5 + f * 3) * s;
      band({
        cx: 0,
        cy: CHEST,
        R: rx,
        k: 0.4,
        a0: 0,
        span: Math.PI * 2,
        sign: 1,
        t0: 0,
        t1: 1,
        thick: () => (f <= 1 ? 2 : 1),
        paint: (x, y, t, p) => {
          if (f >= 2 && Math.floor(t * 24) % (f === 2 ? 4 : 2) === 1) return;
          d.put(x, y, c(f === 0 ? 4 : f === 1 ? (p === 0 ? 4 : 2) : f === 2 ? 2 : 1), 2);
        },
      });
      if (f >= 1) {
        // Grit and dust puffing up at the ring's sides.
        for (let i = 0; i < 6; i++) {
          const ang = Math.PI * (0.9 + (i / 5) * 1.2) + (i % 2) * 0.2;
          const r = rx + 1 + (i % 2);
          const x = Math.round(Math.cos(ang) * r);
          const y = Math.round(CHEST + Math.sin(ang) * r * 0.4) - (f - 1) * (1 + (i % 2));
          const dc = DUST[f === 1 ? 3 : f === 2 ? 2 : 1];
          d.put(x, y, dc, 1);
          if (f <= 2 && i % 2 === 0) d.put(x + (x < 0 ? -1 : 1), y, dc, 1);
        }
      }
      break;
    }
    case 'fizzle': {
      if (f === 0) plus(d, 0, 0, c(3), c(1), 2);
      else if (f === 1) {
        d.put(-1, -1, c(2), 2);
        d.put(1, 1, c(1), 2);
      }
      break;
    }
    case 'clink': {
      // A white star where the shot was; then steel chips fly off on the diagonals, and are gone.
      const steel = L.mono ? ['#ffffff', '#ffffff', '#000000', '#000000'] : ['#ffffff', '#ffffff', STEEL[3], STEEL[2], STEEL[1]];
      if (f === 0) {
        star(d, 0, 0, Math.max(2, Math.round(3 * s)), steel, 4, true);
        d.put(0, 0, '#ffffff', 5);
      } else if (f <= 2) {
        const r0 = (f === 1 ? 2 : 4) * s;
        for (let i = 0; i < 4; i++) {
          const ang = Math.PI / 4 + (i * Math.PI) / 2 + spin * 0.4;
          const x = Math.cos(ang) * r0;
          const y = Math.sin(ang) * r0 * 0.85;
          stroke(x, y, x + Math.cos(ang) * (f === 1 ? 1.6 : 0.6), y + Math.sin(ang) * (f === 1 ? 1.6 : 0.6), () => 1, (px, py, q) => d.put(px, py, f === 1 ? (q < 0.5 ? '#ffffff' : STEEL[3]) : STEEL[2], 3));
        }
        // A spark of the shot's own color, thrown out along one diagonal.
        if (f === 1) d.put(Math.round(-ux * 3), Math.round(-uy * 3), c(3), 2);
      }
      break;
    }
    case 'muzzle': {
      // A flare out of the hands along the shot's way: hot at the root, a point at the tip, sparks off
      // its sides; then a short stub; then nothing.
      if (f >= 2) break;
      const len = (f === 0 ? 5 : 3) * s;
      stroke(0, 0, ux * len, uy * len, (q) => (f === 0 && q < 0.45 ? 3 : 1), (x, y, q) => d.put(x, y, q < 0.35 ? '#ffffff' : q < 0.7 ? c(4) : c(3), 4));
      if (f === 0) {
        for (const side of [-1, 1]) {
          const nx = -uy * side;
          const ny = ux * side;
          d.put(Math.round(ux * 2 + nx * 2.4), Math.round(uy * 2 + ny * 2.4), c(3), 2);
        }
      }
      break;
    }
  }
  if (kind !== 'wall' && kind !== 'fizzle' && kind !== 'pop' && kind !== 'cut' && kind !== 'pierce' && kind !== 'clink' && kind !== 'muzzle') impactExtras(d, kind, L, s, f);
  return d.sprite();
}

/** The tier's extras on an impact: a ring, a star burst, light rays; Kevin's: a black and white shockwave. */
function impactExtras(d: Draft, kind: ImpactKind, L: VfxLook, s: number, f: number): void {
  const cy = kind === 'thud' ? CHEST : 0;
  if (L.mono) {
    const rx = (5 + f * 5) * s;
    ellipse(0, cy, rx, rx * (kind === 'thud' ? 0.42 : 0.8), (x, y, t) => {
      if (f === 3 && Math.floor(t * 30) % 2) return;
      d.put(x, y, '#ffffff', 1);
      if (f <= 2) d.put(x, y + 1, '#000000', 0);
    });
    return;
  }
  if (L.ring && f >= 1) {
    const rx = (4 + f * 3.2) * s;
    ellipse(0, cy, rx, rx * (kind === 'thud' ? 0.42 : 0.8), (x, y, t) => {
      if (f === 3 && Math.floor(t * 26) % 2) return;
      d.put(x, y, f === 1 ? accentOf(L, t) : tone(L, 4 - f, t), 1);
    });
  }
  if (L.star && f <= 1) {
    const len = Math.round((4 + (L.level >= 8 ? 2 : 0)) * s) - f;
    star(d, 0, 0, len, [tone(L, 4), tone(L, 4), tone(L, 4), tone(L, 3), tone(L, 3), tone(L, 2), tone(L, 1)], 5, f === 0);
  }
  if (L.rays && (f === 1 || f === 2)) {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const r0 = (3 + f * 2) * s;
      const r1 = r0 + 3 * s;
      stroke(Math.cos(ang) * r0, Math.sin(ang) * r0, Math.cos(ang) * r1, Math.sin(ang) * r1, () => 1, (x, y, q) => d.put(x, y, tone(L, f === 1 ? (q < 0.5 ? 4 : 3) : 2, i / 8), 1));
    }
  }
}
