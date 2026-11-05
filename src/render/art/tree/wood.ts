/**
 * Wood: trunks, forks, limbs and roots, built into a tree's scene, and bark shading. A trunk swells
 * into buttress roots at its foot that run out over the ground and dive into it; higher up it forks
 * into limbs that reach into the crown. Bark is lit by a raking light from the left (so a trunk reads
 * round), cut by fissures that wander along the wood (deep furrows for oaks, stacked plates for pines,
 * smooth for young wood), and dappled where the crown shades it.
 */
import { Paint, Scene, h2, quant, vnoise } from './core';

export const WOOD = 2;
/** Tags: the trunk, roots, limbs (finishing passes treat them a little differently). */
export const T_TRUNK = 0;
export const T_ROOT = 1;
export const T_LIMB = 2;

export interface Limb {
  /** End point (absolute sprite px) and depth. */
  x: number;
  y: number;
  z?: number;
  /** Width at the fork, as a fraction of the trunk's. */
  w?: number;
}

export interface TrunkSpec {
  /** The base (where the trunk meets the ground). */
  bx: number;
  by: number;
  /** Trunk width (px). */
  w: number;
  /** The fork (absolute px): where the trunk splits into its limbs. */
  fx: number;
  fy: number;
  limbs: Limb[];
  roots: number;
  rootLen: number;
  /** 0..1: how much the foot swells into buttresses. */
  flare: number;
  /** Sideways wander of the trunk (px). */
  bend: number;
}

export function buildTrunk(sc: Scene, R: () => number, t: TrunkSpec): void {
  const tw = t.w / 2;
  // The bole, in two bends.
  const mx = (t.bx + t.fx) / 2 + t.bend;
  const my = (t.by + t.fy) / 2;
  sc.tube(t.bx, t.by + 0.5, 0, tw, mx, my, 0, tw * 0.9, WOOD, T_TRUNK, 1, 0);
  sc.tube(mx, my, 0, tw * 0.9, t.fx, t.fy, 0, tw * 0.82, WOOD, T_TRUNK, 1, t.by - my);
  // The foot swells.
  if (t.flare > 0) {
    const f = tw * (0.45 + t.flare * 0.35);
    for (const side of [-1, 1]) sc.tube(t.bx + side * tw * 0.7, t.by + 0.5, -0.5, f, t.bx + side * tw * 0.25, t.by - t.w * (0.6 + t.flare * 0.5), 0, f * 0.45, WOOD, T_TRUNK, 1, 0);
  }
  // Limbs from the fork, each with a twig or two.
  for (const L of t.limbs) {
    const w0 = tw * (L.w ?? 0.62);
    const z1 = L.z ?? 0;
    const kx = t.fx + (L.x - t.fx) * 0.5 + (R() - 0.5) * tw;
    const ky = t.fy + (L.y - t.fy) * 0.5;
    sc.tube(t.fx, t.fy + tw * 0.5, 0, w0, kx, ky, z1 * 0.5, w0 * 0.7, WOOD, T_LIMB, 1, 0);
    sc.tube(kx, ky, z1 * 0.5, w0 * 0.7, L.x, L.y, z1, Math.max(0.55, w0 * 0.3), WOOD, T_LIMB, 1, 8);
    const side = L.x < t.fx ? -1 : 1;
    sc.tube(kx, ky, z1 * 0.5, Math.max(0.6, w0 * 0.42), kx + side * Math.abs(L.y - t.fy) * 0.35, ky - Math.abs(L.y - t.fy) * 0.32, z1, 0.55, WOOD, T_LIMB, 1, 3);
  }
  // Buttress roots: leave the trunk a little above the ground, run out over it, dive into it.
  const sides = [-0.1, Math.PI + 0.1, 0.5, Math.PI - 0.5, Math.PI / 2 + (R() - 0.5) * 0.7, 0.2, Math.PI - 0.2];
  for (let k = 0; k < t.roots; k++) {
    const a = sides[k % sides.length] + (R() - 0.5) * 0.3;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const len = t.rootLen * (0.65 + R() * 0.5) * (1 - Math.max(0, sa) * 0.5);
    const r0 = Math.max(1.2, t.w * 0.26);
    const x0 = t.bx + ca * tw * 0.5;
    const y0 = t.by - t.w * (0.3 + R() * 0.25) * (0.6 + t.flare * 0.6);
    const x1 = t.bx + ca * (tw + len * 0.35);
    const y1 = t.by + sa * len * 0.16 + 0.4;
    const z1 = sa * (tw + len * 0.35) * 0.8;
    sc.tube(x0, y0, sa * tw * 0.5, r0, x1, y1, z1, r0 * 0.7, WOOD, T_ROOT, 0.85, 0);
    const x2 = t.bx + ca * (tw + len) + (R() - 0.5) * 1.5;
    const y2 = t.by + sa * len * 0.4 + 1;
    sc.tube(x1, y1, z1, r0 * 0.7, x2, y2, sa * len * 0.8, Math.max(0.6, r0 * 0.3), WOOD, T_ROOT, 0.6, len * 0.35);
  }
}

export interface BarkLook {
  pal: number;
  /** Moss palette slot (moss on the tops of roots and the trunk's foot), or -1. */
  moss: number;
  seed: number;
  /** Trunk width, for the fissure spacing. */
  w: number;
  grain: 'furrows' | 'plates' | 'smooth';
  /** The ground line: moss and the darkest contact only near it. */
  by: number;
  /** How strongly the crown shades the trunk (0..1). */
  shade: number;
}

/** A raking light from the left for wood, so trunks read round. */
const WL: readonly [number, number, number] = [-0.8, -0.34, 0.5];
const WL_INV = 1 / Math.sqrt(WL[0] * WL[0] + WL[1] * WL[1] + WL[2] * WL[2]);

/** Shades one wood pixel of the scene into the paint (5-tone bark ramps). */
export function shadeBark(sc: Scene, P: Paint, x: number, y: number, b: BarkLook): void {
  const i = y * sc.w + x;
  const tag = sc.tag[i];
  const lam = (sc.nx[i] * WL[0] + sc.ny[i] * WL[1] + sc.nz[i] * WL[2]) * WL_INV;
  // The crown's shade, broken into dapples of sun near its edge.
  let sh = sc.shadow(x, y, 0.5, 34) * b.shade;
  if (sh > 0 && sh < 1) sh *= vnoise(x, y, 3, b.seed + 91) > 0.42 ? 1 : 0.35;
  else if (sh >= 1 && vnoise(x, y, 3, b.seed + 91) < 0.18) sh = 0.5;
  const ao = sc.occlusion(x, y, 2) * 0.8;
  const tu = sc.tu[i];
  const tv = sc.tv[i];
  let v = 0.5 + 0.36 * lam - 0.42 * sh - 0.45 * ao;
  const across = tv * (tag === T_TRUNK ? b.w * 0.5 : tag === T_ROOT ? 2.5 : 2);
  if (b.grain === 'furrows') {
    // Furrows: dark cracks at uneven spacing that wander along the wood; the ridge left of each crack
    // catches the light.
    const f = across + (vnoise(tu * 0.7, 0, 4, b.seed + 31) - 0.5) * 3 + (vnoise(tu * 0.3, across, 7, b.seed + 37) - 0.5) * 2;
    const cell = 2.6 + h2(Math.floor(f / 2.6), 0, b.seed + 39) * 1.4;
    const fr = ((f % cell) + cell) % cell / cell;
    if (fr < 0.22) v -= 0.24;
    else if (fr < 0.42 && lam > 0) v += 0.07;
    // Now and then a crack across, the furrows of an old oak breaking into blocks.
    if (tag === T_TRUNK && h2(Math.floor(f / cell), Math.floor(tu / 5), b.seed + 41) < 0.12 && Math.floor(tu) % 5 === 0) v -= 0.16;
  } else if (b.grain === 'plates') {
    // Pine bark: stacked scaly plates, lighter in the middle, dark seams round them.
    const row = Math.floor(tu / 3.2);
    const off = h2(row, 0, b.seed + 43) * 3;
    const col = Math.floor((across + off) / 2.4);
    const pu = ((tu % 3.2) + 3.2) % 3.2;
    const pv = (((across + off) % 2.4) + 2.4) % 2.4;
    if (pu < 0.8 || pv < 0.55) v -= 0.2;
    else if (h2(row, col, b.seed + 45) < 0.3) v += 0.08;
  } else {
    // Young wood: faint streaks.
    if (vnoise(tu * 0.5, across * 2, 3, b.seed + 47) < 0.25) v -= 0.08;
  }
  // Knots.
  if (tag === T_TRUNK && Math.abs(tv) < 0.55 && h2(Math.floor(tu / 7), Math.floor(across / 3), b.seed + 49) < 0.04) v -= 0.2;
  let lev = quant(v, 5, (h2(x, y, b.seed) - 0.5) * 0.25);
  let pal = b.pal;
  // Moss on the tops of roots and the foot of the trunk.
  if (b.moss >= 0 && sc.ny[i] < -0.2 && (tag === T_ROOT || (tag === T_TRUNK && y > b.by - b.w * 1.3)) && vnoise(x, y, 4, b.seed + 51) > 0.42) {
    pal = b.moss;
    lev = Math.min(4, lev + (lam > 0.3 ? 1 : 0));
  }
  P.set(x, y, pal, lev);
}
