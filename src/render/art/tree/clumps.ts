/**
 * Leafy trees the way a pixel artist draws them: the crown is many round leaf clumps (8 to 13 px
 * across), each lit on its top left in the light green with a few darker leaves flecked through it,
 * the mid green across its middle and the shade at its lower right, overlapping (the lower ones in
 * front) over a deep green where the gaps show; little leaves drip from the crown's lower edge. No
 * outline: the shaded edges and the deep gaps do that work. Under it a reddish-brown trunk with a light
 * stripe down its lit side and dark grooves, twisting and forking into branches that show in the gaps
 * under the crown, roots spreading at its foot, a vine or two climbing it.
 *
 * Shapes: a dome (a heavy oak on a thick leaning trunk), an umbrella (wide and flat on a forked
 * trunk), a round lollipop on a thin one, a split tree (two trunks, a crown and an offset side clump);
 * willows hang curtains from a flat crown; bushes are a low mound of clumps.
 */
import { Paint, h2, rand, type Ramp } from './core';

export type CrownShape = 'dome' | 'umbrella' | 'round' | 'split';

export interface ClumpSpec {
  /** Crown size in px. */
  W: number;
  H: number;
  /** Trunk width and how much of it shows below the crown (0: a bush). */
  trunkW: number;
  trunkVis: number;
  /** Crown offset from the foot (px, + right). */
  lean: number;
  roots: number;
  rootLen: number;
  shape: CrownShape;
  /** Leaf ramps (6 tones: gap, shade, shade-mid, mid, light, highlight); clumps pick among them. */
  leaf: Ramp[];
  leafMix?: number[];
  /** Bark: 5 tones, dark to the light stripe. */
  bark: Ramp;
  grass?: readonly [string, string];
  fruit?: { n: number; ramp: Ramp; size: number };
  blossom?: { n: number; ramp: Ramp };
  /** Willow: strands hanging this far (px). */
  droop?: number;
  seed: number;
}

export interface ClumpBuilt {
  paint: Paint;
  ax: number;
  ay: number;
  crown: { x: number; y: number; w: number; h: number };
}

/** Leaf tones in a 6-tone ramp. */
const GAP = 0;
const SHADE = 1;
const DUSK = 2;
const MID = 3;
const LIGHT = 4;
const RIM = 5;

interface Lobe {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

interface Clump {
  x: number;
  y: number;
  r: number;
  v: number;
  /** The crown's light on it: + on the sunny upper left, - on the shaded lower right. */
  sun: number;
  ph: number;
  k: number;
}

export function paintClumpTree(s: ClumpSpec): ClumpBuilt {
  const R = rand(s.seed);
  const bush = s.trunkVis <= 0;
  const droop = s.droop ?? 0;
  const rootDrop = bush ? 1 : Math.max(2, Math.round(s.rootLen * 0.35));
  const rootSpan = s.trunkW + s.rootLen * 2.4 + 4;
  const side = s.shape === 'split' ? s.W * 0.22 : 0;
  const SW = Math.ceil(Math.max(s.W + side + Math.abs(s.lean) * 2 + 6, rootSpan + 4));
  const SH = Math.ceil(s.H + s.trunkVis + rootDrop + 6 + Math.max(0, droop - s.trunkVis));
  const bx = Math.round(SW / 2 - s.lean * 0.4 - side * 0.35);
  const by = SH - 2 - rootDrop;
  const CX = bx + s.lean;
  const RX = s.W / 2;
  const RY = s.H / 2;
  const CY = by - s.trunkVis - RY + (bush ? RY * 0.15 : 0);

  // ---- palette slots: leaf ramps, then bark, fruit, grass, blossom
  const nV = s.leaf.length;
  const ramps: Ramp[] = [...s.leaf, s.bark];
  const BARK_P = nV;
  const FRUIT_P = s.fruit ? ramps.push(s.fruit.ramp) - 1 : -1;
  const GRASS_P = s.grass ? ramps.push([s.grass[0], s.grass[1]]) - 1 : -1;
  const BLOSSOM_P = s.blossom ? ramps.push(s.blossom.ramp) - 1 : -1;
  const P = new Paint(SW, SH, ramps);
  const leafAt = (x: number, y: number) => {
    const p = P.palAt(x, y);
    return p >= 0 && p < nV;
  };

  // ---- the crown's outline, as a few overlapping ellipses
  const lobes: Lobe[] = [];
  let flatBottom = Infinity;
  switch (s.shape) {
    case 'dome':
      lobes.push({ x: CX, y: CY, rx: RX, ry: RY });
      flatBottom = CY + RY * 0.82;
      break;
    case 'umbrella':
      lobes.push({ x: CX, y: CY - RY * 0.12, rx: RX * 1.02, ry: RY * 0.86 });
      flatBottom = CY + RY * 0.5;
      break;
    case 'round':
      lobes.push({ x: CX, y: CY, rx: RX * 0.94, ry: RY * 0.98 });
      break;
    case 'split': {
      const dir = R() < 0.5 ? -1 : 1;
      lobes.push({ x: CX - dir * RX * 0.12, y: CY - RY * 0.06, rx: RX * 0.84, ry: RY * 0.9 });
      lobes.push({ x: CX + dir * (RX * 0.78 + side * 0.5), y: CY + RY * 0.42, rx: RX * 0.36 + 2, ry: RY * 0.36 + 1.5 });
      break;
    }
  }
  if (bush) flatBottom = by + 1;
  const inside = (x: number, y: number, shrink: number) => {
    if (y > flatBottom - shrink * 0.4) return false;
    for (const L of lobes) {
      const ex = (x - L.x) / Math.max(1, L.rx - shrink);
      const ey = (y - L.y) / Math.max(1, L.ry - shrink);
      if (ex * ex + ey * ey <= 1) return true;
    }
    return false;
  };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const L of lobes) {
    minX = Math.min(minX, L.x - L.rx);
    maxX = Math.max(maxX, L.x + L.rx);
    minY = Math.min(minY, L.y - L.ry);
    maxY = Math.max(maxY, Math.min(flatBottom, L.y + L.ry));
  }

  // ---- wood: the trunk, forking into branches that reach into the crown; roots; a vine
  const crownBottom = maxY;
  if (!bush) {
    const fork = s.shape === 'umbrella' ? 0.5 : s.shape === 'split' ? 0.42 : s.shape === 'round' ? 0.82 : 1.05;
    const topY = crownBottom - Math.min(RY * 0.35, 6);
    const visH = by - topY;
    const fy = Math.round(by - visH * Math.min(1, fork));
    const bend = (R() - 0.5) * s.trunkW * 1.4 + (s.shape === 'dome' ? s.lean * 0.4 : 0);
    const fx = bx + s.lean * 0.45 + bend * 0.3;
    // Branches from the fork into the crown (drawn first: the trunk and the crown go over them).
    const targets: Array<[number, number]> = [];
    if (s.shape === 'split') {
      targets.push([lobes[0].x, lobes[0].y + RY * 0.2], [lobes[1].x, lobes[1].y + lobes[1].ry * 0.3]);
      targets.push([lobes[0].x + (lobes[1].x > lobes[0].x ? -1 : 1) * RX * 0.4, lobes[0].y + RY * 0.25]);
    } else if (s.shape === 'umbrella') {
      targets.push([CX - RX * 0.5, CY + RY * 0.15], [CX + RX * 0.48, CY + RY * 0.12], [CX + (R() - 0.5) * RX * 0.3, CY - RY * 0.1]);
    } else {
      targets.push([CX - RX * 0.32, CY + RY * 0.2], [CX + RX * 0.3, CY + RY * 0.15]);
      if (s.W > 50) targets.push([CX + (R() - 0.5) * RX * 0.4, CY - RY * 0.2]);
    }
    const bw = Math.max(1.2, s.trunkW * (s.shape === 'dome' ? 0.62 : 0.5));
    for (const [tx, ty] of targets) limb(P, BARK_P, fx, fy + 1, tx, ty, bw, 1, s.seed);
    // The trunk: tapering up from a flared foot, bending as it goes.
    for (let y = by; y >= fy; y--) {
      const t = (by - y) / Math.max(1, by - fy);
      const cx = bx + (fx - bx) * t + bend * Math.sin(t * Math.PI) * 0.5;
      const flare = Math.max(0, 1 - (by - y) / 3) * Math.min(3, s.trunkW * 0.4);
      const half = (s.trunkW * (1 - t * 0.28)) / 2 + flare;
      barkRow(P, BARK_P, cx - half, cx + half, y, s.seed);
    }
    // Roots spreading over the ground either side.
    for (let k = 0; k < s.roots; k++) {
      const dir = k % 2 ? 1 : -1;
      const len = s.rootLen * (0.6 + R() * 0.5) * (k >= 2 ? 0.6 : 1);
      const x0 = bx + dir * (s.trunkW / 2 - 1);
      // Low along the ground, sinking into it as they go.
      limb(P, BARK_P, x0, by - 0.5 - (k >= 2 ? 1 : 0), x0 + dir * len, by + 0.5 + R() * Math.min(1.5, rootDrop), Math.min(3, s.trunkW * 0.42 + 0.9), 0.9, s.seed + k);
    }
    // A vine or two climbing the trunk: little leaves up its face.
    const vines = s.trunkW >= 4 ? 1 + (R() < 0.5 ? 1 : 0) : R() < 0.5 ? 1 : 0;
    for (let k = 0; k < vines; k++) {
      let vx = Math.round(bx + (R() - 0.6) * s.trunkW * 0.6);
      const len = 3 + Math.floor(R() * Math.min(9, (by - fy) * 0.6));
      for (let j = 0; j < len; j++) {
        const y = by - 1 - j;
        if (P.palAt(vx, y) !== BARK_P) break;
        P.set(vx, y, 0, j % 3 === 0 ? LIGHT : MID);
        if (j % 3 === 1) P.set(vx + (j % 2 ? 1 : -1), y, 0, LIGHT);
        if (R() < 0.35) vx += R() < 0.5 ? 1 : -1;
      }
    }
  }

  // ---- the crown: a deep green core for the gaps, then the clumps, top ones first
  const r0 = Math.max(3.2, Math.min(6.8, Math.min(s.W, s.H * 1.25) / 9.5));
  const coreSkip = s.shape === 'dome' || bush ? Infinity : CY + RY * 0.45;
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      if (y > coreSkip || !inside(x + 0.5, y + 0.5, r0 * 1.05)) continue;
      P.set(x, y, 0, GAP);
    }
  }
  const mix = s.leafMix ?? s.leaf.map(() => 1);
  const mixTotal = mix.reduce((a, b) => a + b, 0);
  const pickV = () => {
    let r = R() * mixTotal;
    for (let v = 0; v < mix.length; v++) {
      r -= mix[v];
      if (r < 0) return v;
    }
    return mix.length - 1;
  };
  const clumps: Clump[] = [];
  const sx = r0 * 1.5;
  const sy = r0 * 1.28;
  for (let row = 0; minY + row * sy <= maxY + r0; row++) {
    const y0 = minY + r0 * 0.4 + row * sy;
    for (let col = -1; minX + col * sx <= maxX + r0; col++) {
      const x = minX + (col + (row % 2 ? 0.5 : 0)) * sx + (R() - 0.5) * r0 * 0.75;
      const y = y0 + (R() - 0.5) * r0 * 0.6;
      if (!inside(x, y, r0 * 0.5)) continue;
      // Now and then a clump left out deep inside: a gap where the dark shows.
      if (inside(x, y, r0 * 2.2) && R() < 0.045) continue;
      const gx = (x - CX) / RX;
      const gy = (y - CY) / RY;
      clumps.push({ x, y, r: r0 * (0.92 + R() * 0.3), v: pickV(), sun: -gx * 0.32 - gy * 0.42 - (gy > 0.55 ? 0.2 : 0), ph: R() * 6.28, k: 4 + Math.floor(R() * 3) });
    }
  }
  clumps.sort((a, b) => a.y - b.y + (a.x - b.x) * 0.02);
  const topY = Math.min(...clumps.map((c) => c.y));
  for (const c of clumps) {
    const rr = Math.ceil(c.r + 1);
    for (let y = Math.floor(c.y - rr); y <= Math.ceil(c.y + rr); y++) {
      for (let x = Math.floor(c.x - rr); x <= Math.ceil(c.x + rr); x++) {
        const dx = x + 0.5 - c.x;
        const dy = y + 0.5 - c.y;
        const a = Math.atan2(dy, dx);
        const re = c.r * (1 + 0.09 * Math.sin(a * c.k + c.ph));
        const d = Math.sqrt(dx * dx + dy * dy) / re;
        if (d > 1) continue;
        const lit = (-dx * 0.5 - dy * 0.86) / re;
        const n = h2(x, y, s.seed + 11);
        // A light cap on top (toward the left), the mid green across the middle, the shade below.
        const v = lit * 0.95 + (1 - d) * 0.12 + c.sun * 0.5 + (n - 0.5) * 0.1;
        let lev = v > 0.22 ? LIGHT : v > -0.22 ? MID : v > -0.52 ? DUSK : SHADE;
        // A dark crescent round its lower edge, so it stands off the clump below and beside it.
        if (d > 0.74 && lit < -0.2) lev = d > 0.9 && lit < -0.5 ? GAP : Math.min(lev, SHADE);
        // Leaves flecked through the light cap, and a few lit ones in the mid green.
        if (lev === LIGHT && n < 0.1) lev = MID;
        else if (lev === MID && v > 0 && n > 0.94) lev = LIGHT;
        // The sunniest tops of the crown catch a brighter rim.
        if (lev === LIGHT && c.y < topY + r0 * 1.6 && lit > 0.5 && d > 0.6 && n > 0.4) lev = RIM;
        P.set(x, y, c.v, lev);
      }
    }
  }

  // ---- the crown's silhouette, edged in its own dark greens so it stands off a bright lawn: the shade
  // on the sun's side (the light caps a pixel in), the deep green of the gaps on the shadow side
  {
    const src = P.lev.slice();
    const pal0 = P.pal.slice();
    const isLeaf = (x: number, y: number) => x >= 0 && y >= 0 && x < SW && y < SH && src[y * SW + x] >= 0 && pal0[y * SW + x] < nV;
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        const i = y * SW + x;
        if (src[i] < 0 || pal0[i] >= nV) continue;
        const openL = !isLeaf(x - 1, y);
        const openU = !isLeaf(x, y - 1);
        const openR = !isLeaf(x + 1, y);
        const openD = !isLeaf(x, y + 1);
        if (!(openL || openU || openR || openD)) continue;
        if ((openR || openD) && !(openL || openU)) P.lev[i] = GAP;
        else P.lev[i] = Math.min(src[i], openU && !openL && src[i] >= LIGHT && h2(x, y, s.seed + 5) < 0.3 ? DUSK : SHADE);
      }
    }
  }

  // ---- willow: curtains of leaves hanging from the crown's edge
  if (droop > 0) {
    const n = Math.round(s.W / 2.2);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = Math.round(CX - RX * 0.95 + t * RX * 1.9 + (R() - 0.5) * 1.2);
      const ux = (x - CX) / RX;
      const y0 = Math.round(CY + RY * Math.sqrt(Math.max(0, 1 - ux * ux)) * 0.55 - 1);
      const len = Math.round(droop * (0.45 + R() * 0.55) * (1 - Math.abs(t - 0.5) * 0.7));
      for (let j = 0; j < len; j++) {
        const lev = j === len - 1 ? LIGHT : (j + k) % 3 === 0 ? SHADE : j < 3 ? DUSK : MID;
        P.set(x + (j > len * 0.6 && k % 3 === 0 ? 1 : 0), y0 + j, 0, lev);
      }
    }
  }

  // ---- leaves dripping from the crown's lower edge
  if (!bush) {
    for (let x = 1; x < SW - 1; x++) {
      let yb = -1;
      for (let y = SH - 1; y >= 0; y--) {
        if (leafAt(x, y)) {
          yb = y;
          break;
        }
      }
      if (yb < 0 || yb > crownBottom + 2) continue;
      const u = h2(x, yb, s.seed + 21);
      const pal = P.palAt(x, yb);
      if (u < 0.3) {
        P.set(x, yb + 1, pal, u < 0.12 ? MID : SHADE);
        if (u < 0.1) P.set(x, yb + 2, pal, SHADE);
      } else if (u > 0.94) P.set(x, yb + 2 + Math.floor(h2(x, 3, s.seed) * 3), pal, LIGHT);
    }
  }

  // ---- blossoms and fruit, on the lit faces of the clumps
  const R2 = rand(s.seed + 99);
  if (s.blossom && BLOSSOM_P >= 0) {
    const pts: Array<[number, number]> = [];
    const minD = Math.max(3, Math.sqrt((RX * RY * 3.1) / Math.max(1, s.blossom.n)) * 0.7);
    for (let tries = 0; tries < s.blossom.n * 40 && pts.length < s.blossom.n; tries++) {
      const x = Math.round(minX + R2() * (maxX - minX));
      const y = Math.round(minY + R2() * (maxY - minY));
      const lv = P.at(x, y);
      if (lv < MID || !leafAt(x, y) || !leafAt(x + 1, y + 1) || !leafAt(x - 1, y) || !leafAt(x, y - 1)) continue;
      if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < minD)) continue;
      pts.push([x, y]);
      const k = lv >= LIGHT ? 2 : 1;
      P.set(x, y, BLOSSOM_P, k);
      if (s.W > 34) {
        P.set(x + 1, y, BLOSSOM_P, k - 1);
        P.set(x, y + 1, BLOSSOM_P, 0);
      }
    }
  }
  if (s.fruit && FRUIT_P >= 0) {
    const sz = s.fruit.size;
    let placed = 0;
    for (let tries = 0; tries < s.fruit.n * 50 && placed < s.fruit.n; tries++) {
      const x = Math.round(minX + 2 + R2() * (maxX - minX - 4));
      const y = Math.round(minY + (maxY - minY) * (0.3 + R2() * 0.6));
      let ok = true;
      for (let dy = -1; dy <= sz && ok; dy++) for (let dx = -1; dx <= sz && ok; dx++) if (!leafAt(x + dx, y + dy) || P.at(x + dx, y + dy) < DUSK) ok = false;
      if (!ok) continue;
      for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) P.set(x + dx, y + dy, FRUIT_P, sz === 1 ? 2 : dx === 0 && dy === 0 ? 3 : dx + dy >= sz ? 0 : dx + dy === sz - 1 ? 1 : 2);
      // A dark leaf over its stalk.
      P.set(x + sz - 1, y - 1, P.palAt(x + sz - 1, y - 1) >= 0 ? P.palAt(x + sz - 1, y - 1) : 0, SHADE);
      placed++;
    }
  }

  // ---- grass at the foot
  if (GRASS_P >= 0 && !bush) {
    const span = Math.round(rootSpan * 0.5);
    for (let x = bx - span; x <= bx + span; x++) {
      if (h2(x, 7, s.seed + 71) > 0.4) continue;
      const hgt = 1 + Math.floor(h2(x, 8, s.seed + 71) * 3);
      const yb = by + 1 + Math.round(h2(x, 9, s.seed) * (rootDrop - 1));
      for (let k = 0; k < hgt; k++) P.set(x, yb - k, GRASS_P, k === hgt - 1 ? 1 : 0);
    }
  }

  return {
    paint: P,
    ax: bx,
    ay: by,
    crown: { x: Math.round(minX), y: Math.round(minY), w: Math.round(maxX - minX), h: Math.round(maxY - minY) },
  };
}

/**
 * One row of bark between xl and xr: a dark edge on the right, the light stripe a pixel in from the
 * left, grooves down the middle.
 */
function barkRow(P: Paint, pal: number, xl: number, xr: number, y: number, seed: number): void {
  const a = Math.round(xl);
  const b = Math.max(a, Math.round(xr) - 1);
  const w = b - a + 1;
  for (let x = a; x <= b; x++) {
    const u = w <= 1 ? 0.5 : (x - a) / (w - 1);
    let lev: number;
    if (w <= 2) lev = x === a ? 3 : 1;
    else if (x === b) lev = 0;
    else if (x === a) lev = w >= 5 ? 2 : 3;
    else if (x === a + 1) lev = 4;
    else if (u < 0.35) lev = 3;
    else if (u < 0.72) lev = 2;
    else lev = 1;
    // Grooves running down the bark, and a few lit ridges.
    const g = h2(x, Math.floor(y / 3), seed + 41);
    if (lev === 2 && g < 0.22) lev = 1;
    else if (lev === 3 && g < 0.12) lev = 2;
    else if (lev === 2 && g > 0.9) lev = 3;
    P.set(x, y, pal, lev);
  }
}

/** A branch or a root from (x0, y0) to (x1, y1), w0 px wide at its start tapering to w1: lit on top. */
function limb(P: Paint, pal: number, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, seed: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(2, Math.ceil(len * 1.5));
  // A slight crook along the way.
  const crook = (h2(Math.round(x0), Math.round(y1), seed + 31) - 0.5) * Math.min(4, len * 0.18);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * crook;
    const y = y0 + (y1 - y0) * t;
    const w = w0 + (w1 - w0) * t;
    const h = Math.max(0.5, w / 2);
    for (let yy = Math.round(y - h); yy <= Math.round(y + h - 0.5); yy++) {
      for (let xx = Math.round(x - h); xx <= Math.round(x + h - 0.5); xx++) {
        const top = yy <= y - h + 1;
        const right = xx >= x + h - 1;
        P.set(xx, yy, pal, top && !right ? 3 : right ? 0 : 1);
      }
    }
    // The light stripe along its top edge.
    if (w >= 1.5) P.set(Math.round(x - h + 0.5), Math.round(y - h), pal, 4);
  }
}
