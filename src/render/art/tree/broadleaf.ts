/**
 * Broad-leaved trees (oak, maple, apple, willow). The crown is a big lumpy mass of leaf clumps: a few
 * large lobes, each built from smaller clumps on its outside, around a dark core. Clumps in front
 * hide and shade the ones behind and below them, so each reads as its own rounded mass with a lit
 * top-left and a deep blue-green crevice under it. Limbs reach up into the crown and show through
 * the gaps along its underside; the trunk carries bark grooves, sits in the crown's shade at the top,
 * and flares into roots that spread over the ground.
 */
import { EMPTY, Paint, Scene, h2, leafCell, quant, rand, vnoise, type Ramp } from './core';

export const LEAF = 1;
export const BARK = 2;
export const STRAND = 3;

export interface BroadSpec {
  /** Crown size in px. */
  W: number;
  H: number;
  /** Trunk width and how much of it shows below the crown. */
  trunkW: number;
  trunkVis: number;
  /** Crown offset from the base (px, + right): a lean. */
  lean: number;
  roots: number;
  rootLen: number;
  /** Big masses in the crown, and the radius of the clumps they are built from. */
  lobes: number;
  clump: number;
  /** 0: a round crown; 1: broad and flat-bottomed (an old oak). */
  flat: number;
  /** Leaf ramps (6 tones each); clumps pick among them (autumn patchwork, or subtle hue variety). */
  leaf: Ramp[];
  /** Weights for the leaf ramps (defaults to equal). */
  leafMix?: number[];
  bark: Ramp;
  /** Moss on the roots and the foot of the trunk. */
  moss?: Ramp;
  /** Apples / blossoms: how many, and their ramp. */
  fruit?: { n: number; ramp: Ramp; size: number };
  /** Willow: hanging curtains of this length (px). */
  droop?: number;
  /** Leaf-cell size (px): the grain of the foliage. */
  grain: number;
  /** A cool rim of moonlight on the right edge (night biomes): the color, or none. */
  moonRim?: string;
  /** Grass at the foot: two tones. */
  grass?: readonly [string, string];
  seed: number;
}

export interface Built {
  paint: Paint;
  ax: number;
  ay: number;
  /** The crown's box in sprite px. */
  crown: { x: number; y: number; w: number; h: number };
  /** A few of the crown's colors, for falling leaves. */
  leafColors: string[];
}

interface Clump {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Which leaf ramp. */
  v: number;
}

export function paintBroadleaf(s: BroadSpec): Built {
  const R = rand(s.seed);
  const rootDrop = Math.max(2, Math.round(s.trunkW * 0.45));
  const rootSpan = Math.max(s.trunkW * 1.8, s.rootLen * 2 + s.trunkW);
  const droop = s.droop ?? 0;
  const SW = Math.ceil(Math.max(s.W + Math.abs(s.lean) * 2, rootSpan) + 6);
  const crownTop = 2;
  const SH = Math.ceil(crownTop + s.H + s.trunkVis + rootDrop + 2 + Math.max(0, droop - s.trunkVis - 4));
  const bx = Math.round(SW / 2 - s.lean * 0.35);
  const by = SH - 2 - rootDrop;
  const CX = bx + s.lean;
  const RX = s.W / 2;
  const RY = s.H / 2;
  const RZ = RX * 0.8;
  const CY = by - s.trunkVis - RY;
  const sc = new Scene(SW, SH);

  // ---- trunk, flare, roots, limbs
  const tw = s.trunkW / 2;
  const topX = bx + s.lean * 0.75;
  const topY = CY + RY * 0.05;
  const bend = (R() - 0.5) * s.trunkW * 0.5;
  const midX = (bx + topX) / 2 + bend;
  const midY = (by + topY) / 2;
  sc.tube(bx, by + 0.5, 0, tw, midX, midY, 0, tw * 0.86, BARK, 0, 1, 0);
  sc.tube(midX, midY, 0, tw * 0.86, topX, topY, 0, tw * 0.7, BARK, 0, 1, by - midY);
  // The flare: the trunk swells into its roots.
  const flare = Math.max(1.2, s.trunkW * 0.34);
  for (const side of [-1, 1]) {
    sc.tube(bx + side * tw * 0.75, by + 0.5, -0.5, flare, bx + side * tw * 0.2, by - s.trunkW * 0.9, 0, flare * 0.55, BARK, 0, 1, 0);
  }
  // Roots run out over the ground: left, right and toward the viewer (never straight back).
  const roots = s.roots;
  for (let k = 0; k < roots; k++) {
    const base = roots === 1 ? Math.PI / 2 : -0.25 + (k / (roots - 1)) * (Math.PI + 0.5);
    const a = base + (R() - 0.5) * 0.45;
    const len = s.rootLen * (0.6 + R() * 0.5) * (Math.abs(Math.sin(a)) > 0.7 ? 0.6 : 1);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const x0 = bx + ca * tw * 0.5;
    const y0 = by - 0.5 + sa * 0.5;
    const mx = bx + ca * len * 0.55 + (R() - 0.5) * 2;
    const my = by + sa * len * 0.55 * 0.42 + 0.4;
    const ex = bx + ca * len;
    const ey = by + sa * len * 0.42 + 0.8;
    const r0 = Math.max(1, s.trunkW * 0.3);
    sc.tube(x0, y0, sa * 2, r0, mx, my, sa * len * 0.5, r0 * 0.6, BARK, 1, 0.55, 0);
    sc.tube(mx, my, sa * len * 0.5, r0 * 0.6, ex, ey, sa * len * 0.8, 0.45, BARK, 1, 0.5, len * 0.55);
  }
  // Limbs up into the crown (mostly hidden; they show through the gaps underneath).
  const limbs = 2 + Math.floor(R() * 2) + (s.W > 60 ? 1 : 0);
  for (let k = 0; k < limbs; k++) {
    const t = limbs === 1 ? 0.5 : k / (limbs - 1);
    const ex = CX + (t - 0.5) * RX * 1.3 + (R() - 0.5) * RX * 0.2;
    const ey = CY - RY * (0.15 + R() * 0.35);
    const fx = topX + (ex - topX) * 0.12;
    const fy = topY + RY * 0.2;
    sc.tube(fx, fy, 0, tw * 0.62, ex, ey, (R() - 0.5) * 4, Math.max(0.6, tw * 0.22), BARK, 2, 1, 0);
    // A twig off each limb.
    const mx = fx + (ex - fx) * 0.55;
    const my = fy + (ey - fy) * 0.55;
    sc.tube(mx, my, 0, Math.max(0.6, tw * 0.3), mx + (ex - fx) * 0.35 + (t < 0.5 ? -1 : 1) * RX * 0.15, my - RY * 0.15, 1, 0.5, BARK, 2, 1, 0);
  }

  // ---- the crown
  const clumps: Clump[] = [];
  const mix = s.leafMix ?? s.leaf.map(() => 1);
  const mixTotal = mix.reduce((a, b) => a + b, 0);
  const pickV = (x: number, y: number) => {
    // Neighboring clumps tend to share a color (autumn turns in patches, not confetti).
    let r = vnoise(x, y, Math.max(6, RX * 0.5), s.seed + 17) * 0.75 + R() * 0.25;
    r *= mixTotal;
    for (let v = 0; v < mix.length; v++) {
      r -= mix[v];
      if (r < 0) return v;
    }
    return mix.length - 1;
  };
  const lobes: Array<{ x: number; y: number; z: number; r: number }> = [];
  const nL = s.lobes;
  const turn = R() * Math.PI * 2;
  for (let k = 0; k < nL; k++) {
    // Around the crown, starting at the top; the lower ones tucked up (a broad crown's flat underside).
    const a = turn + (k / nL) * Math.PI * 2 + (R() - 0.5) * (Math.PI / nL);
    const lx = Math.cos(a);
    let ly = Math.sin(a);
    if (ly > 0) ly *= 1 - s.flat * 0.45;
    const rho = 0.5 + R() * 0.14;
    const r = Math.min(RX, RY) * (0.5 + R() * 0.14);
    const x = CX + lx * RX * rho * 0.92;
    const y = CY + ly * RY * rho * 0.9 - RY * 0.04;
    const z = RZ * 0.42 * Math.sqrt(Math.max(0, 1 - rho * rho));
    lobes.push({ x, y, z, r });
  }
  // One or two lobes on the front face, a little up and left of center: the crown's lit mass.
  const fronts = s.W > 40 ? 2 : 1;
  for (let k = 0; k < fronts; k++) {
    lobes.push({ x: CX + (R() - 0.65) * RX * 0.5, y: CY - RY * (0.05 + R() * 0.25), z: RZ * 0.62, r: Math.min(RX, RY) * (0.45 + R() * 0.1) });
  }
  for (const L of lobes) {
    // Each lobe: clumps on its outer face (away from the crown's middle, and toward the viewer).
    const ox = L.x - CX;
    const oy = L.y - CY;
    const out = Math.atan2(oy / RY, ox / RX);
    const m = Math.max(3, Math.round((L.r * L.r) / (s.clump * s.clump) * 1.1));
    for (let j = 0; j < m; j++) {
      const a = out + (R() - 0.5) * Math.PI * 1.5;
      const d = L.r * (0.35 + R() * 0.45);
      const r = s.clump * (0.75 + R() * 0.55);
      const x = L.x + Math.cos(a) * d;
      let y = L.y + Math.sin(a) * d * 0.9;
      // Keep the underside fairly level.
      const bottom = CY + RY - r * 0.9;
      if (y > bottom) y = bottom - R() * 2;
      const z = L.z + Math.sqrt(Math.max(0, L.r * L.r - d * d)) * 0.55;
      clumps.push({ x, y, z, r, v: pickV(x, y) });
    }
    clumps.push({ x: L.x, y: L.y, z: L.z + L.r * 0.15, r: L.r * 0.82, v: pickV(L.x, L.y) });
  }
  // The dark core fills between the lobes (seen only in the gaps).
  const coreTag = 1000;
  sc.sphere(CX, CY + RY * 0.06, -RZ * 0.5, RX * 0.84, RY * 0.8, RZ * 0.55, LEAF, coreTag, { n: 22, amp: 0.1, ph: R() * 6 });
  const tagV: number[] = [];
  clumps.forEach((c, i) => {
    tagV[i] = c.v;
    const n = Math.max(5, Math.round((Math.PI * 2 * c.r) / 4.6));
    sc.sphere(c.x, c.y, c.z, c.r, c.r * 0.92, c.r * 0.9, LEAF, i, { n, amp: 0.13 + R() * 0.06, ph: R() * 6 });
  });

  // Willow curtains: strands from the crown's rim to near the ground, in front and behind.
  if (droop > 0) {
    const n = Math.round(s.W / 2.2);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = CX - RX * 0.95 + t * RX * 1.9 + (R() - 0.5) * 1.5;
      const rimY = CY + RY * Math.sqrt(Math.max(0, 1 - ((x - CX) / RX) ** 2)) * 0.55;
      const len = droop * (0.55 + R() * 0.5) * (1 - Math.abs(t - 0.5) * 0.7);
      const front = R() < 0.6;
      const z = front ? RZ * 0.45 * Math.sqrt(Math.max(0, 1 - ((x - CX) / RX) ** 2)) : -RZ * 0.6;
      const w = R() < 0.4 ? 1.2 : 0.8;
      const sway = (R() - 0.5) * 2;
      sc.tube(x, rimY - RY * 0.25, z, w, x + sway, rimY + len, z + 1, 0.55, STRAND, 3000 + k, 1, R() * 10);
    }
  }

  // ---- shade it
  const nV = s.leaf.length;
  // Palette slots: leaf ramps, then bark, moss, strands (willow: leaf ramp 0), fruit, grass.
  const ramps: Ramp[] = [...s.leaf, s.bark];
  const BARK_P = nV;
  let MOSS_P = -1;
  if (s.moss) {
    MOSS_P = ramps.length;
    ramps.push(s.moss);
  }
  let FRUIT_P = -1;
  if (s.fruit) {
    FRUIT_P = ramps.length;
    ramps.push(s.fruit.ramp);
  }
  let GRASS_P = -1;
  if (s.grass) {
    GRASS_P = ramps.length;
    ramps.push([s.grass[0], s.grass[1]]);
  }
  const P = new Paint(SW, SH, ramps);
  const grain = s.grain;
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const i = y * SW + x;
      const z = sc.z[i];
      if (z === EMPTY) continue;
      const mat = sc.mat[i];
      const lam = sc.lit(i);
      if (mat === LEAF || mat === STRAND) {
        const tag = sc.tag[i];
        const v0 = tag === coreTag ? 0 : tag >= 3000 ? 0 : tagV[tag] ?? 0;
        // The crown as one big lit ball, the clump as a small one, then shadows and crevices.
        const gx = (x + 0.5 - CX) / RX;
        const gy = (y + 0.5 - CY) / RY;
        const gz = Math.sqrt(Math.max(0.04, 1 - gx * gx - gy * gy));
        const gl = Math.hypot(gx, gy, gz);
        const lamG = (gx * -0.62 + gy * -0.74 + gz * 0.58) / gl;
        const sh = sc.shadow(x, y, 0.8, 16);
        const ao = sc.occlusion(x, y, 2.2);
        const lc = leafCell(x, y, grain, s.seed + 5);
        const bevel = -(lc.ox + lc.oy * 1.2) * 0.5;
        let v = 0.44 + 0.3 * lam + 0.3 * lamG - 0.3 * sh - 0.62 * ao + 0.12 * bevel + (lc.id - 0.5) * 0.1;
        if (tag === coreTag) v -= 0.22;
        // The underside, toward the trunk, sinks into shade.
        const under = (y + 0.5 - (CY + RY * 0.25)) / (RY * 0.75);
        if (under > 0) v -= under * 0.22;
        if (mat === STRAND) {
          // Strands: tone from height and the strand's own stripes.
          const lit = lam * 0.35 + lamG * 0.25;
          v = 0.42 + lit - (tag >= 3000 && z < 0 ? 0.25 : 0) - sh * 0.25 + (Math.floor(sc.tu[i] / 2) % 2 ? 0.08 : -0.04);
        }
        let lev = quant(v, 6, (lc.id - 0.5) * 0.35);
        // Highlights only where the crown faces the sun.
        if (lev >= 5 && (lamG < 0.35 || sh > 0.2)) lev = 4;
        P.set(x, y, v0, lev);
      } else if (mat === BARK) {
        const tag = sc.tag[i];
        const sh = sc.shadow(x, y, 0.55, 30);
        const ao = sc.occlusion(x, y, 2);
        const tu = sc.tu[i];
        const tv = sc.tv[i];
        // Bark grooves run along the trunk and wander; ridges between them catch the light.
        const across = tv * (tag === 0 ? s.trunkW * 0.5 : 2);
        const wob = vnoise(tu, across * 3, 5, s.seed + 31) * 2.2;
        const g = Math.sin((across + wob) * 2.3);
        let v = 0.5 + 0.42 * lam - 0.48 * sh - 0.5 * ao;
        if (g < -0.55) v -= 0.22;
        else if (g > 0.75) v += 0.08;
        // Knots and gnarls.
        if (tag === 0 && h2(Math.floor(tu / 6), Math.floor(across), s.seed + 33) < 0.05 && Math.abs(tv) < 0.6) v -= 0.18;
        let lev = quant(v, 5, (h2(x, y, s.seed) - 0.5) * 0.3);
        let pal = BARK_P;
        // Moss on the tops of roots and the trunk's foot.
        if (MOSS_P >= 0 && sc.ny[i] < -0.25 && (tag === 1 || (tag === 0 && y > by - s.trunkW * 1.2)) && vnoise(x, y, 4, s.seed + 41) > 0.45) {
          pal = MOSS_P;
          lev = Math.max(0, Math.min(4, lev));
        }
        P.set(x, y, pal, lev);
      }
    }
  }

  // ---- finishing: selective outlines, rims, feathered leaves, no strays
  const leafPals = new Set<number>(s.leaf.map((_, k) => k));
  const src = P.lev.slice();
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < SW && y < SH && src[y * SW + x] >= 0;
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const i = y * SW + x;
      if (src[i] < 0) continue;
      const pal = P.pal[i];
      const ex = (opaque(x - 1, y) ? 0 : -1) + (opaque(x + 1, y) ? 0 : 1);
      const ey = (opaque(x, y - 1) ? 0 : -1) + (opaque(x, y + 1) ? 0 : 1);
      if (ex === 0 && ey === 0 && opaque(x - 1, y) && opaque(x + 1, y) && opaque(x, y - 1) && opaque(x, y + 1)) continue;
      // Outward direction of the edge: shadow side (right, down) gets the ramp's darkest tones.
      const shadowSide = ex * 0.62 + ey * 0.74;
      if (leafPals.has(pal)) {
        if (shadowSide > 0.3) P.lev[i] = Math.min(src[i], ey > 0 ? 0 : 1);
        else if (shadowSide > -0.2) P.lev[i] = Math.max(0, src[i] - 1);
        // Rim: the sun-facing top edge keeps its light, a touch brighter.
        else if (src[i] >= 3 && h2(x, y, s.seed + 51) < 0.5) P.lev[i] = Math.min(5, src[i] + 1);
        if (s.moonRim && ex > 0 && ey <= 0 && y < CY + RY * 0.5) P.lev[i] = 4;
      } else if (pal === BARK_P) {
        if (ex > 0 || ey > 0) P.lev[i] = 0;
      }
    }
  }
  // Feather: leaves breaking out of the silhouette on the lit top and sides, notches between them.
  const crownBottom = by - s.trunkVis;
  for (let y = 1; y < SH - 1; y++) {
    for (let x = 1; x < SW - 1; x++) {
      const i = y * SW + x;
      if (src[i] >= 0 || y > crownBottom) continue;
      const nb: Array<[number, number]> = [[x, y + 1], [x + 1, y], [x - 1, y], [x, y - 1]];
      for (const [qx, qy] of nb) {
        const qi = qy * SW + qx;
        if (src[qi] < 0 || !leafPals.has(P.pal[qi])) continue;
        const r = h2(x, y, s.seed + 61);
        const below = qy > y;
        if ((below && r < 0.14) || (!below && r < 0.06)) {
          P.set(x, y, P.pal[qi], Math.max(0, P.lev[qi] - (below ? 0 : 1)));
        }
        break;
      }
    }
  }
  P.cleanOrphans(leafPals, (_p, lev) => lev === 5);

  // ---- fruit / blossoms: sparse, tucked into the lit side of the crown
  if (s.fruit && FRUIT_P >= 0) {
    const want = s.fruit.n;
    let placed = 0;
    for (let tries = 0; tries < want * 30 && placed < want; tries++) {
      const x = Math.round(CX + (R() - 0.5) * RX * 1.5);
      const y = Math.round(CY + (R() - 0.35) * RY * 1.3);
      const sz = s.fruit.size;
      let ok = true;
      for (let dy = -1; dy <= sz && ok; dy++) for (let dx = -1; dx <= sz && ok; dx++) {
        const lv = P.at(x + dx, y + dy);
        if (lv < 2 || !leafPals.has(P.palAt(x + dx, y + dy))) ok = false;
      }
      if (!ok) continue;
      const fr = s.fruit.ramp;
      for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) {
        const k = dx + dy === 0 ? fr.length - 1 : dx + dy >= sz ? 0 : Math.min(fr.length - 2, 1 + (dx + dy === 1 ? 1 : 0));
        P.set(x + dx, y + dy, FRUIT_P, sz === 1 ? fr.length - 2 : k);
      }
      placed++;
    }
  }

  // ---- grass at the foot (two tones, little blades over the roots)
  if (GRASS_P >= 0) {
    const span = Math.round(rootSpan * 0.5);
    for (let x = bx - span; x <= bx + span; x++) {
      if (h2(x, 7, s.seed + 71) > 0.45) continue;
      const hgt = 1 + Math.floor(h2(x, 8, s.seed + 71) * 3);
      const yb = by + Math.round(h2(x, 9, s.seed) * rootDrop);
      for (let k = 0; k < hgt; k++) P.set(x, yb - k, GRASS_P, k === hgt - 1 ? 1 : 0);
    }
  }

  const leafColors = [s.leaf[0][3], s.leaf[0][4], s.leaf[s.leaf.length - 1][3]];
  return {
    paint: P,
    ax: bx,
    ay: by,
    crown: { x: Math.round(CX - RX), y: Math.round(CY - RY), w: Math.round(RX * 2), h: Math.round(RY * 2) },
    leafColors,
  };
}
