/**
 * Conifers: a straight trunk with tiers of drooping boughs, narrowing to a leader at the top. Each
 * tier is a shallow cone seen from above at an angle (a pointed top at the trunk, tips out at the
 * sides, a hem that curves down toward the viewer), split into boughs that hang lower in their
 * middles and leave notches between them. Upper tiers hide and shade the tiers under them, so every
 * tier shows a lit top and a dark band under the hem above it. Old pines lose their lower boughs and
 * show a tall, reddish trunk with broken stubs; snow sits on the tops of the tiers.
 */
import { EMPTY, Paint, Scene, h2, leafCell, quant, rand, vnoise, type Ramp } from './core';
import { WOOD, buildTrunk, shadeBark } from './wood';

const NEEDLE = 4;

export interface ConiferSpec {
  /** Total height (base to tip) and the widest tier's width. */
  H: number;
  W: number;
  trunkW: number;
  /** Fraction of the height that is bare trunk under the lowest tier. */
  bare: number;
  tiers: number;
  /** How far boughs hang at their tips (0..1). */
  droop: number;
  needle: Ramp;
  bark: Ramp;
  snow?: Ramp;
  /** Frost: the tier tops a shade paler (no snow lying). */
  frost?: boolean;
  outline?: { lit: string; dark: string; wood: string };
  /** Grass at the foot. */
  grass?: readonly [string, string];
  seed: number;
}

export interface ConiferBuilt {
  paint: Paint;
  ax: number;
  ay: number;
  crown: { x: number; y: number; w: number; h: number };
}

interface Tier {
  y: number;
  h: number;
  w: number;
  ax: number;
  boughs: number[];
}

export function paintConifer(s: ConiferSpec): ConiferBuilt {
  const R = rand(s.seed);
  const SW = Math.ceil(s.W + 8);
  const SH = Math.ceil(s.H + 7);
  const bx = Math.round(SW / 2);
  const by = SH - 3;
  const lean = (R() - 0.5) * s.W * 0.08;
  const tipY = by - s.H;
  const crownBottom = by - s.H * s.bare;
  const Hc = crownBottom - tipY;
  const sc = new Scene(SW, SH);

  // ---- trunk (to near the tip), stubs of lost boughs on the bare part
  const trunkTopY = tipY + Hc * 0.12;
  buildTrunk(sc, R, { bx, by, w: s.trunkW, fx: bx + lean, fy: trunkTopY, limbs: [], roots: s.trunkW >= 5 ? 3 : 2, rootLen: s.trunkW * 0.9, flare: 0.5, bend: 0 });
  if (s.bare > 0.18) {
    const stubs = Math.round(s.H * s.bare / 9);
    for (let k = 0; k < stubs; k++) {
      const y = crownBottom + (by - crownBottom) * (0.15 + R() * 0.55);
      const side = R() < 0.5 ? -1 : 1;
      const x = bx + lean * ((by - y) / s.H) + side * s.trunkW * 0.4;
      sc.tube(x, y, 1, 0.7, x + side * (2 + R() * 3), y + 1 + R() * 2, 1.5, 0.5, WOOD, 2, 1, 0);
    }
  }

  // ---- tiers, top down
  const tiers: Tier[] = [];
  const n = s.tiers;
  for (let k = 0; k < n; k++) {
    const f0 = Math.pow(k / n, 1.08);
    const f1 = Math.pow((k + 1) / n, 1.08);
    const y = tipY + Hc * f0 * 0.94 + (k === 0 ? 0 : (R() - 0.5) * 2);
    const h = Math.max(4, Hc * (f1 - f0) * 1.6 + 2);
    const w = Math.max(2.5, (s.W / 2) * Math.pow((k + 1) / n, 0.8) * (0.88 + R() * 0.22));
    const ax = bx + lean * (1 - (y - tipY) / s.H) + (R() - 0.5) * 1.2;
    const nb = Math.max(2, Math.round(w / 3.2));
    const boughs: number[] = [];
    for (let j = 0; j < nb; j++) boughs.push(-1 + ((j + 0.5) / nb) * 2 + (R() - 0.5) * (0.6 / nb));
    tiers.push({ y, h, w, ax, boughs });
  }
  // Paint the tiers into the scene (the depth buffer sorts out who covers whom).
  const tierOf = new Int16Array(SW * SH).fill(-1);
  const tierT = new Float32Array(SW * SH);
  const tierB = new Float32Array(SW * SH);
  tiers.forEach((t, k) => {
    for (let y = Math.max(0, Math.floor(t.y - 1)); y <= Math.min(SH - 1, Math.ceil(t.y + t.h + 3)); y++) {
      for (let x = Math.max(0, Math.floor(t.ax - t.w - 3)); x <= Math.min(SW - 1, Math.ceil(t.ax + t.w + 3)); x++) {
        const u = (x + 0.5 - t.ax) / t.w;
        const au = Math.abs(u);
        // Which bough, and where across it (-1..1).
        let bj = 0;
        let bd = 9;
        for (let j = 0; j < t.boughs.length; j++) {
          const d = Math.abs(u - t.boughs[j]);
          if (d < bd) {
            bd = d;
            bj = j;
          }
        }
        const half = 1 / t.boughs.length;
        const b = (u - t.boughs[bj]) / half;
        // Bough tips reach past the tier's line at the sides.
        const reach = 1 + (au > 0.6 ? 0.12 * Math.max(0, 1 - b * b) : 0);
        if (au > reach) continue;
        const top = t.y + t.h * 0.44 * Math.pow(Math.min(1, au), 1.2) - (au < 0.15 ? 1 : 0);
        // The hem hangs lower in the middle of each bough and at the hooked tips, with needle teeth.
        const droop = s.droop * t.h * 0.16 * Math.max(0, 1 - b * b);
        const hook = au > 0.55 ? (au - 0.55) * t.h * 0.55 : 0;
        const p3 = (((x + k * 2) % 3) + 3) % 3;
        const teeth = p3 === 1 ? -1.1 : p3 === 0 ? 0 : 0.7;
        const bottom = t.y + t.h * (0.76 + 0.16 * Math.sqrt(Math.max(0, 1 - Math.min(1, au) ** 2))) + droop + hook - teeth - (Math.abs(b) > 0.85 ? 1.4 : 0);
        if (y + 0.5 < top || y + 0.5 > bottom) continue;
        const tt = (y + 0.5 - top) / Math.max(1, bottom - top);
        const zz = t.w * 0.8 * Math.sqrt(Math.max(0, 1 - Math.min(1, au) ** 2)) * (0.35 + 0.65 * tt) + (n - k) * 0.01 + Math.max(0, 1 - b * b) * 0.8;
        const i = y * SW + x;
        if (zz <= sc.z[i]) continue;
        // A cone's face: the sides turn away, the top faces the sky, the hem faces down and out.
        const nx = u * 0.7 + b * 0.25;
        const ny = -0.7 + 1.05 * tt;
        const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
        const l = Math.hypot(nx, ny, nz);
        sc.z[i] = zz;
        sc.nx[i] = nx / l;
        sc.ny[i] = ny / l;
        sc.nz[i] = nz / l;
        sc.mat[i] = NEEDLE;
        sc.tag[i] = 100 + k;
        sc.tu[i] = b;
        sc.tv[i] = tt;
        tierOf[i] = k;
        tierT[i] = tt;
        tierB[i] = b;
      }
    }
  });
  // The leader: a thin spike above the top tier.
  const lead = Math.max(2, Math.round(s.H * 0.04));
  for (let k = 0; k < lead; k++) {
    const x = Math.round(tiers[0].ax - 0.5);
    const y = Math.round(tiers[0].y) - k;
    const i = y * SW + x;
    if (y < 0) break;
    sc.z[i] = 50;
    sc.nx[i] = -0.3;
    sc.ny[i] = -0.6;
    sc.nz[i] = 0.74;
    sc.mat[i] = NEEDLE;
    sc.tag[i] = 99;
    tierT[i] = 0.2;
  }

  // ---- palette
  const ramps: Ramp[] = [s.needle, s.bark];
  const N_P = 0;
  const BARK_P = 1;
  const SNOW_P = s.snow ? ramps.push(s.snow) - 1 : -1;
  const INK_P = s.outline ? ramps.push([s.outline.dark, s.outline.lit, s.outline.wood]) - 1 : -1;
  const GRASS_P = s.grass ? ramps.push([s.grass[0], s.grass[1]]) - 1 : -1;
  const P = new Paint(SW, SH, ramps);

  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const i = y * SW + x;
      if (sc.z[i] === EMPTY) continue;
      if (sc.mat[i] === WOOD) {
        shadeBark(sc, P, x, y, { pal: BARK_P, moss: -1, seed: s.seed, w: s.trunkW, grain: 'plates', by, shade: 0.8 });
        continue;
      }
      const lam = sc.lit(i);
      const sh = sc.shadow(x, y, 0.6, 18);
      const ao = sc.occlusion(x, y, 2);
      const tt = tierT[i];
      const b = tierB[i];
      // Needle tufts: small clumps that hang (taller than wide), lit on top.
      const lc = leafCell(x, y, 2.6, s.seed + 7, 0.8);
      const tuft = -lc.oy * 0.6 - lc.ox * 0.3;
      let v = 0.4 + 0.4 * lam - 0.34 * sh - 0.55 * ao + 0.06 * tuft + 0.08 * (1 - b * b) - 0.05;
      // The underside of each hem drops into shade, and so does the band of tier right under it.
      if (tt > 0.8) v -= 0.12;
      const k = tierOf[i];
      if (k > 0 && (tierOf[i - SW] === k - 1 || (y > 1 && tierOf[i - 2 * SW] === k - 1))) v -= tierOf[i - SW] === k - 1 ? 0.3 : 0.16;
      let lev = quant(v, 6, (lc.id - 0.5) * 0.3);
      if (lev >= 5 && lam < 0.55) lev = 4;
      let pal = N_P;
      if (SNOW_P >= 0 && tt < 0.42 + (vnoise(x, y, 3, s.seed + 9) - 0.5) * 0.3 && sc.ny[i] < -0.15 && sh < 0.6) {
        // Snow on the tier tops: brilliant in the sun, blue in the shade.
        pal = SNOW_P;
        lev = quant(0.35 + 0.55 * lam - 0.3 * sh + (lc.id - 0.5) * 0.1, 5);
      } else if (s.frost && tt < 0.3 && lev < 5) lev += 1;
      P.set(x, y, pal, lev);
    }
  }

  // ---- finishing: the shadow side's edge, an outline for the garden look, no strays
  const src = P.lev.slice();
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < SW && y < SH && src[y * SW + x] >= 0;
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const i = y * SW + x;
      if (src[i] < 0) continue;
      const r = !opaque(x + 1, y);
      const d = !opaque(x, y + 1);
      const l = !opaque(x - 1, y);
      if (!(r || d || l || !opaque(x, y - 1))) continue;
      if (P.pal[i] === N_P && (r || d)) P.lev[i] = Math.min(src[i], d ? 0 : 1);
      else if (P.pal[i] === N_P && l && src[i] > 1 && INK_P < 0) P.lev[i] = Math.max(1, src[i] - 1);
      else if (P.pal[i] === BARK_P && (r || d)) P.lev[i] = 0;
    }
  }
  P.cleanOrphans(new Set([N_P]), (_p, lev) => lev === 5);
  if (INK_P >= 0) {
    const before = P.lev.slice();
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < SW && y < SH && before[y * SW + x] >= 0;
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        if (solid(x, y)) continue;
        let n = -1;
        let lit = false;
        for (const [qx, qy, l] of [[x + 1, y, true], [x, y + 1, true], [x - 1, y, false], [x, y - 1, false]] as const) {
          if (!solid(qx, qy)) continue;
          n = qy * SW + qx;
          lit = l;
          break;
        }
        if (n < 0) continue;
        P.set(x, y, INK_P, P.pal[n] === BARK_P ? 2 : lit ? 1 : 0);
      }
    }
  }
  if (GRASS_P >= 0) {
    for (let x = bx - s.trunkW * 2; x <= bx + s.trunkW * 2; x++) {
      if (h2(x, 7, s.seed + 71) > 0.45) continue;
      const hgt = 1 + Math.floor(h2(x, 8, s.seed + 71) * 3);
      const yb = by + Math.round(h2(x, 9, s.seed) * 2);
      for (let k = 0; k < hgt; k++) P.set(x, yb - k, GRASS_P, k === hgt - 1 ? 1 : 0);
    }
  }
  const wMax = Math.max(...tiers.map((t) => t.w));
  return { paint: P, ax: bx, ay: by, crown: { x: Math.round(bx - wMax), y: Math.round(tipY), w: Math.round(wMax * 2), h: Math.round(Hc) } };
}
