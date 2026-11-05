/**
 * Broad-leaved trees (oak, maple, apple, willow). The crown is a big lumpy mass built in three sizes
 * of form, the way a painter blocks it in: a few large lobes (each lit as one ball), the clumps that
 * make up each lobe (each with a lit crescent along its top-left rim), and leaves (a leaf-shaped
 * threshold map, so tone edges break into leaf clusters). Clumps in front hide and shade the ones
 * behind and below them, leaving deep blue-green crevices. The trunk forks just under the crown and
 * flares into buttress roots; willows hang curtains of strands from the crown's rim.
 */
import { EMPTY, Paint, Scene, h2, leafCell, quant, rand, type Ramp } from './core';
import { WOOD, buildTrunk, shadeBark, type Limb } from './wood';

export const LEAF = 1;
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
  barkGrain?: 'furrows' | 'plates' | 'smooth';
  /** Moss on the roots and the foot of the trunk. */
  moss?: Ramp;
  /** Apples / blossoms: how many, their ramp (dark to glint), and size (px). */
  fruit?: { n: number; ramp: Ramp; size: number };
  /** Willow: hanging curtains of this length (px). */
  droop?: number;
  /** Leaf-cell size (px): the grain of the foliage. */
  grain: number;
  /** A cool rim of moonlight on the crown's right edge (night biomes). */
  moonRim?: boolean;
  /** Grass at the foot: two tones. */
  grass?: readonly [string, string];
  /**
   * The garden look: a full outline in dark tones tinted from the foliage and bark (lit side,
   * shadow side, wood), rounder crowns, no stray leaves.
   */
  outline?: { lit: string; dark: string; wood: string };
  /** Blossom dots scattered over the crown: how many, and their ramp (shadow, body, glint). */
  blossom?: { n: number; ramp: Ramp };
  /** 0..1: pulls the lobes in toward a round, compact crown. */
  round?: number;
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

interface Lobe {
  x: number;
  y: number;
  z: number;
  r: number;
}

interface Clump extends Lobe {
  /** Which leaf ramp. */
  v: number;
  lobe: number;
}

export function paintBroadleaf(s: BroadSpec): Built {
  const R = rand(s.seed);
  const droop = s.droop ?? 0;
  const rootDrop = Math.max(2, Math.round(s.rootLen * 0.4));
  const rootSpan = s.trunkW + s.rootLen * 2.2;
  const SW = Math.ceil(Math.max(s.W + Math.abs(s.lean) * 2, rootSpan) + 6);
  const SH = Math.ceil(3 + s.H + s.trunkVis + rootDrop + 2 + Math.max(0, droop - s.trunkVis - 4));
  const bx = Math.round(SW / 2 - s.lean * 0.4);
  const by = SH - 2 - rootDrop;
  const CX = bx + s.lean;
  const RX = s.W / 2;
  const RY = s.H / 2;
  const RZ = RX * 0.8;
  const CY = by - s.trunkVis - RY;
  const sc = new Scene(SW, SH);

  // ---- wood: the fork sits just under the crown on big trees (inside it on small ones)
  const crownBottom = CY + RY;
  const fy = s.trunkVis > 10 ? crownBottom + s.trunkVis * 0.2 : crownBottom - RY * 0.2;
  const fx = bx + s.lean * 0.55;
  const nLimbs = s.W > 60 ? 3 : 2;
  const limbs: Limb[] = [];
  for (let k = 0; k < nLimbs; k++) {
    const t = k / (nLimbs - 1);
    limbs.push({ x: CX + (t - 0.5) * RX * 1.0 + (R() - 0.5) * RX * 0.12, y: CY - RY * (0.05 + R() * 0.25), z: (R() - 0.5) * 4, w: k === 1 && nLimbs === 3 ? 0.5 : 0.66 });
  }
  buildTrunk(sc, R, { bx, by, w: s.trunkW, fx, fy, limbs, roots: s.roots, rootLen: s.rootLen, flare: s.W > 60 ? 1 : 0.6, bend: (R() - 0.5) * s.trunkW * 0.6 });

  // ---- the crown: lobes round a ring (irregularly spaced, one sometimes reaching out), a front mass
  const lobes: Lobe[] = [];
  const nL = s.lobes;
  const a0 = -Math.PI / 2 + (R() - 0.5) * (Math.PI / nL);
  for (let k = 0; k < nL; k++) {
    const a = a0 + (k / nL) * Math.PI * 2 + (R() - 0.5) * (Math.PI / nL) * 0.8;
    const ca = Math.cos(a);
    let sa = Math.sin(a);
    const lower = sa > 0.35;
    if (sa > 0) sa *= 1 - s.flat * 0.4;
    const round = s.round ?? 0;
    let rho = (0.48 + R() * 0.16) * (1 - round * 0.18);
    let r = Math.min(RX, RY) * (0.44 + R() * 0.2) * (lower ? 0.85 : 1) * (1 + round * 0.12);
    if (!lower && R() < 0.3 * (1 - round)) {
      // A lobe reaching out past the others: the silhouette's irregularity.
      rho += 0.14;
      r *= 0.85;
    }
    lobes.push({ x: CX + ca * RX * rho * 0.92, y: CY + sa * RY * rho * 0.9 - RY * 0.05, z: RZ * 0.42 * Math.sqrt(Math.max(0, 1 - rho * rho)), r });
  }
  const fronts = s.W > 40 ? 2 : 1;
  for (let k = 0; k < fronts; k++) {
    lobes.push({ x: CX + (R() - 0.6) * RX * 0.5, y: CY - RY * (0.05 + R() * 0.25), z: RZ * 0.62, r: Math.min(RX, RY) * (0.42 + R() * 0.1) });
  }

  // Each lobe takes one ramp (an autumn crown turns branch by branch, not in spots).
  const mix = s.leafMix ?? s.leaf.map(() => 1);
  const mixTotal = mix.reduce((a, b) => a + b, 0);
  const lobeV = lobes.map(() => {
    let r = R() * mixTotal;
    for (let v = 0; v < mix.length; v++) {
      r -= mix[v];
      if (r < 0) return v;
    }
    return mix.length - 1;
  });
  // The front lobes keep the main ramp, so the crown's face reads as one color.
  for (let k = nL; k < lobes.length; k++) lobeV[k] = 0;
  const pickV = (li: number) => lobeV[li];
  const clumps: Clump[] = [];
  lobes.forEach((L, li) => {
    // Each lobe: clumps on its outer face (away from the crown's middle, and toward the viewer).
    const out = Math.atan2((L.y - CY) / RY, (L.x - CX) / RX);
    const m = Math.max(3, Math.round(((L.r * L.r) / (s.clump * s.clump)) * 1.1));
    for (let j = 0; j < m; j++) {
      const a = out + (R() - 0.5) * Math.PI * 1.5;
      const d = L.r * (0.35 + R() * 0.45);
      const r = s.clump * (0.7 + R() * R() * 0.9);
      const x = L.x + Math.cos(a) * d;
      let y = L.y + Math.sin(a) * d * 0.9;
      const bottom = CY + RY - r * 0.9;
      if (y > bottom) y = bottom - R() * 2;
      const z = L.z + Math.sqrt(Math.max(0, L.r * L.r - d * d)) * 0.55;
      clumps.push({ x, y, z, r, v: pickV(li), lobe: li });
    }
    clumps.push({ x: L.x, y: L.y, z: L.z + L.r * 0.15, r: L.r * 0.82, v: pickV(li), lobe: li });
  });
  // The dark core fills between the lobes (seen only in the gaps).
  const CORE = 1000;
  sc.sphere(CX, CY + RY * 0.06, -RZ * 0.5, RX * 0.84, RY * 0.8, RZ * 0.55, LEAF, CORE, { n: 22, amp: 0.1, ph: R() * 6 });
  clumps.forEach((c, i) => {
    const n = Math.max(5, Math.round((Math.PI * 2 * c.r) / 4.6));
    sc.sphere(c.x, c.y, c.z, c.r, c.r * 0.92, c.r * 0.9, LEAF, i, { n, amp: 0.13 + R() * 0.06, ph: R() * 6 });
  });

  // Willow curtains: strands from the crown's rim toward the ground, in front and behind.
  const STRANDS = 3000;
  if (droop > 0) {
    const n = Math.round(s.W / 2.1);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = CX - RX * 0.95 + t * RX * 1.9 + (R() - 0.5) * 1.5;
      const ux = (x - CX) / RX;
      const rimY = CY + RY * Math.sqrt(Math.max(0, 1 - ux * ux)) * 0.5;
      const len = droop * (0.5 + R() * 0.55) * (1 - Math.abs(t - 0.5) * 0.6);
      const front = R() < 0.62;
      const z = front ? RZ * 0.5 * Math.sqrt(Math.max(0, 1 - ux * ux)) + 2 : -RZ * 0.6;
      const w = R() < 0.4 ? 1.25 : 0.85;
      const sway = (R() - 0.5) * 2.5;
      sc.tube(x, rimY - RY * 0.3, z, w, x + sway, rimY + len, z + 1, 0.55, STRAND, STRANDS + k, 1, R() * 10);
    }
  }

  // ---- palette slots: leaf ramps, then bark, moss, fruit, grass
  const nV = s.leaf.length;
  const ramps: Ramp[] = [...s.leaf, s.bark];
  const BARK_P = nV;
  const MOSS_P = s.moss ? ramps.push(s.moss) - 1 : -1;
  const FRUIT_P = s.fruit ? ramps.push(s.fruit.ramp) - 1 : -1;
  const GRASS_P = s.grass ? ramps.push([s.grass[0], s.grass[1]]) - 1 : -1;
  const INK_P = s.outline ? ramps.push([s.outline.dark, s.outline.lit, s.outline.wood]) - 1 : -1;
  const BLOSSOM_P = s.blossom ? ramps.push(s.blossom.ramp) - 1 : -1;
  const P = new Paint(SW, SH, ramps);

  // ---- shade
  const grain = s.grain;
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const i = y * SW + x;
      const z = sc.z[i];
      if (z === EMPTY) continue;
      const mat = sc.mat[i];
      if (mat === WOOD) {
        shadeBark(sc, P, x, y, { pal: BARK_P, moss: MOSS_P, seed: s.seed, w: s.trunkW, grain: s.barkGrain ?? 'furrows', by, shade: 1 });
        continue;
      }
      const tag = sc.tag[i];
      const cl = tag >= 0 && tag < clumps.length ? clumps[tag] : null;
      const v0 = cl ? cl.v : 0;
      // Three sizes of form: the crown as one ball, the lobe as a ball, the clump as a rim-lit dome.
      const gx = (x + 0.5 - CX) / RX;
      const gy = (y + 0.5 - CY) / RY;
      const gz = Math.sqrt(Math.max(0.04, 1 - gx * gx - gy * gy));
      const lamG = (gx * -0.62 + gy * -0.74 + gz * 0.58) / Math.hypot(gx, gy, gz);
      let lamL = 0;
      if (cl) {
        const L = lobes[cl.lobe];
        const lx = (x + 0.5 - L.x) / (L.r * 1.25);
        const ly = (y + 0.5 - L.y) / (L.r * 1.25);
        const lz = Math.sqrt(Math.max(0.05, 1 - lx * lx - ly * ly));
        lamL = (lx * -0.62 + ly * -0.74 + lz * 0.58) / Math.hypot(lx, ly, lz);
      }
      const lamC = sc.nx[i] * -0.69 + sc.ny[i] * -0.69 + sc.nz[i] * 0.22;
      const sh = sc.shadow(x, y, 0.8, 16);
      const ao = sc.occlusion(x, y, 2.2);
      // Leaves: a little dome per leaf, lit on its top left, so tone edges break into leaf clusters.
      // The garden look's leaves are chunky horizontal bars (voxel tops); the wild look's are small.
      const lc = leafCell(x, y, grain, s.seed + 5, s.outline ? 1.7 : 1.12);
      const dome = 1 - 2 * Math.min(1, (lc.ox * lc.ox + lc.oy * lc.oy * 1.4) / 0.42);
      const bevel = s.outline ? -lc.oy * 1.6 : -(lc.ox + lc.oy);
      let v: number;
      if (mat === STRAND) {
        const back = z < 0;
        v = 0.42 + 0.3 * lamG + 0.18 * (sc.nx[i] * -0.8) - (back ? 0.28 : 0) - sh * 0.25 + (Math.floor(sc.tu[i] / 2) % 2 ? 0.07 : -0.05);
      } else {
        v = 0.415 + 0.16 * lamC + 0.24 * lamL + 0.24 * lamG - 0.3 * sh - 0.62 * ao + 0.055 * dome + 0.035 * bevel + (lc.id - 0.5) * 0.05;
        if (tag === CORE) v -= 0.22;
        // The underside, toward the trunk, sinks into shade.
        const under = (y + 0.5 - (CY + RY * 0.25)) / (RY * 0.75);
        if (under > 0) v -= under * 0.22;
      }
      let lev = quant(v, 6);
      // Highlights only where the crown faces the sun, on leaf tops.
      if (lev >= 5 && (lamG < 0.55 || sh > 0.1 || dome < 0)) lev = 4;
      P.set(x, y, v0, lev);
    }
  }

  // ---- finishing: selective outlines and rims, feathered leaves, no strays
  const leafPals = new Set<number>(s.leaf.map((_, k) => k));
  const src = P.lev.slice();
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < SW && y < SH && src[y * SW + x] >= 0;
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const i = y * SW + x;
      if (src[i] < 0) continue;
      const l = opaque(x - 1, y);
      const r = opaque(x + 1, y);
      const u = opaque(x, y - 1);
      const d = opaque(x, y + 1);
      if (l && r && u && d) continue;
      const ex = (l ? 0 : -1) + (r ? 0 : 1);
      const ey = (u ? 0 : -1) + (d ? 0 : 1);
      // Which way the edge faces: toward the sun (top left) or away (bottom right).
      const away = ex * 0.62 + ey * 0.74;
      const pal = P.pal[i];
      if (leafPals.has(pal) && s.outline) {
        // Outlined: the ring does the edge's work; just a tone down on the shadow side.
        if (away > 0.3) P.lev[i] = Math.max(0, Math.min(src[i] - 1, 2));
      } else if (leafPals.has(pal)) {
        if (away > 0.3) P.lev[i] = Math.min(src[i], ey > 0 ? 0 : 1);
        else if (away > -0.2) P.lev[i] = Math.max(0, src[i] - 1);
        else if (src[i] >= 3 && h2(x, y, s.seed + 51) < 0.5) P.lev[i] = Math.min(5, src[i] + 1);
        // Night: a cool rim of moonlight along the crown's upper right.
        if (s.moonRim && ex > 0 && y < CY + RY * 0.2 && src[i] >= 1) P.lev[i] = Math.max(P.lev[i], 3);
      } else if (pal === BARK_P || pal === MOSS_P) {
        if (ex > 0 || ey > 0) P.lev[i] = 0;
      }
    }
  }
  // Feather: single leaves breaking out of the silhouette, mostly hanging off the bottom of clumps.
  const leafTop = by - s.trunkVis;
  for (let y = 1; y < SH - 1 && !s.outline; y++) {
    for (let x = 1; x < SW - 1; x++) {
      if (src[y * SW + x] >= 0 || y > leafTop) continue;
      for (const [qx, qy] of [[x, y - 1], [x + 1, y], [x - 1, y], [x, y + 1]] as const) {
        const qi = qy * SW + qx;
        if (src[qi] < 0 || !leafPals.has(P.pal[qi])) continue;
        const hang = qy < y;
        const r = h2(x, y, s.seed + 61);
        if ((hang && r < 0.13) || (!hang && r < 0.05)) P.set(x, y, P.pal[qi], hang ? 0 : Math.max(0, P.lev[qi] - 1));
        break;
      }
    }
  }
  P.cleanOrphans(leafPals, (_p, lev) => lev === 5);

  // ---- the garden look's outline: a ring round the whole tree, dark green round the crown (a shade
  // lighter on the sun's side), dark brown round the wood
  if (INK_P >= 0) {
    const before = P.lev.slice();
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < SW && y < SH && before[y * SW + x] >= 0;
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        if (solid(x, y)) continue;
        let n = -1;
        let litSide = false;
        for (const [qx, qy, lit] of [[x + 1, y, true], [x, y + 1, true], [x - 1, y, false], [x, y - 1, false]] as const) {
          if (!solid(qx, qy)) continue;
          n = qy * SW + qx;
          litSide = lit;
          break;
        }
        if (n < 0) continue;
        const wood = P.pal[n] === BARK_P || P.pal[n] === MOSS_P;
        P.set(x, y, INK_P, wood ? 2 : litSide ? 1 : 0);
      }
    }
  }

  // ---- blossoms: pale dots spread evenly over the crown, white where the sun is, pink in the shade
  if (s.blossom && BLOSSOM_P >= 0) {
    const pts: Array<[number, number]> = [];
    const minD = Math.max(3, Math.sqrt((RX * RY * 3.1) / Math.max(1, s.blossom.n)) * 0.75);
    for (let tries = 0; tries < s.blossom.n * 30 && pts.length < s.blossom.n; tries++) {
      const x = Math.round(CX + (R() * 2 - 1) * RX);
      const y = Math.round(CY + (R() * 2 - 1) * RY);
      const lv = P.at(x, y);
      if (lv < 1 || !leafPals.has(P.palAt(x, y))) continue;
      if (!leafPals.has(P.palAt(x + 1, y)) || !leafPals.has(P.palAt(x, y + 1)) || !leafPals.has(P.palAt(x - 1, y)) || !leafPals.has(P.palAt(x, y - 1)) || !leafPals.has(P.palAt(x + 1, y + 1)) || !leafPals.has(P.palAt(x + 2, y)) || !leafPals.has(P.palAt(x, y + 2))) continue;
      if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < minD)) continue;
      pts.push([x, y]);
      const k = lv >= 4 ? 2 : lv >= 2 ? 1 : 0;
      P.set(x, y, BLOSSOM_P, k);
      // Bigger crowns: blossoms are little 2 x 2 flowers, lit on the top left.
      if (s.W > 36) {
        P.set(x + 1, y, BLOSSOM_P, Math.max(0, k - 1));
        P.set(x, y + 1, BLOSSOM_P, Math.max(0, k - 1));
        if (R() < 0.5) P.set(x + 1, y + 1, BLOSSOM_P, 0);
      }
    }
  }

  // ---- fruit / blossoms: sparse, tucked into the lit side of the crown
  if (s.fruit && FRUIT_P >= 0) {
    const fr = s.fruit.ramp;
    const sz = s.fruit.size;
    let placed = 0;
    for (let tries = 0; tries < s.fruit.n * 40 && placed < s.fruit.n; tries++) {
      const x = Math.round(CX + (R() - 0.55) * RX * 1.4);
      const y = Math.round(CY + (R() - 0.4) * RY * 1.3);
      let ok = true;
      for (let dy = -1; dy <= sz && ok; dy++) for (let dx = -1; dx <= sz && ok; dx++) {
        if (P.at(x + dx, y + dy) < 2 || !leafPals.has(P.palAt(x + dx, y + dy))) ok = false;
      }
      if (!ok) continue;
      for (let dy = 0; dy < sz; dy++) {
        for (let dx = 0; dx < sz; dx++) {
          // Lit on the top left, a glint, shadow on the bottom right.
          const k = sz === 1 ? 2 : dx === 0 && dy === 0 ? 3 : dx + dy >= sz ? 0 : dx + dy === sz - 1 ? 1 : 2;
          P.set(x + dx, y + dy, FRUIT_P, Math.min(fr.length - 1, k));
        }
      }
      placed++;
    }
  }

  // ---- grass at the foot: little blades in front of the roots
  if (GRASS_P >= 0) {
    const span = Math.round(rootSpan * 0.55);
    for (let x = bx - span; x <= bx + span; x++) {
      if (h2(x, 7, s.seed + 71) > 0.42) continue;
      const hgt = 1 + Math.floor(h2(x, 8, s.seed + 71) * 3);
      const yb = by + Math.round(h2(x, 9, s.seed) * rootDrop);
      for (let k = 0; k < hgt; k++) P.set(x, yb - k, GRASS_P, k === hgt - 1 ? 1 : 0);
    }
  }

  return {
    paint: P,
    ax: bx,
    ay: by,
    crown: { x: Math.round(CX - RX), y: Math.round(CY - RY), w: Math.round(RX * 2), h: Math.round(RY * 2) },
    leafColors: [s.leaf[0][3], s.leaf[0][4], s.leaf[nV - 1][2]],
  };
}
