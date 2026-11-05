/**
 * The odd ones: dead trees (a gnarled trunk splitting into crooked limbs and twigs, with grey moss
 * hanging from them in the bog), giant glowing mushrooms (a pale stalk with a ring, a domed cap with
 * spots and a band of glowing gills under its rim), crystal clusters (faceted prisms, lit faces left,
 * dark faces right, a glint down the front edge) and cacti (ribbed saguaros with arms, barrels with a
 * flower on top).
 */
import { EMPTY, Paint, Scene, h2, quant, rand, vnoise, type Ramp } from './core';
import { WOOD, T_LIMB, buildTrunk, shadeBark, type Limb } from './wood';
import { mixC } from './palette';

type Size = 'bush' | 'small' | 'medium' | 'huge';

export interface OddBuilt {
  paint: Paint;
  ax: number;
  ay: number;
  crown: { x: number; y: number; w: number; h: number };
}

/** Darkens the shadow-side edge pixels (right and bottom) of the given palettes to their darkest tones. */
function edgeDark(P: Paint, pals: ReadonlySet<number>): void {
  const src = P.lev.slice();
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < P.w && y < P.h && src[y * P.w + x] >= 0;
  for (let y = 0; y < P.h; y++) {
    for (let x = 0; x < P.w; x++) {
      const i = y * P.w + x;
      if (src[i] < 0 || !pals.has(P.pal[i])) continue;
      if (!op(x + 1, y) || !op(x, y + 1)) P.lev[i] = 0;
      else if (!op(x - 1, y) || !op(x, y - 1)) P.lev[i] = Math.max(1, src[i] - 1);
    }
  }
}

// ------------------------------------------------------------------ dead trees

const DEAD_SIZE: Record<Size, { W: number; H: number; w: number; depth: number }> = {
  bush: { W: 18, H: 18, w: 3, depth: 2 },
  small: { W: 30, H: 40, w: 5, depth: 3 },
  medium: { W: 46, H: 60, w: 7, depth: 4 },
  huge: { W: 66, H: 86, w: 11, depth: 4 },
};

export function paintDead(o: { biome: string; seed: number; size: Size; bark: Ramp; moss?: Ramp }): OddBuilt {
  const R = rand(o.seed);
  const S = DEAD_SIZE[o.size];
  const W = S.W * (0.92 + R() * 0.16);
  const H = S.H * (0.92 + R() * 0.16);
  const SW = Math.ceil(W + 12);
  const SH = Math.ceil(H + 8);
  const bx = Math.round(SW / 2);
  const by = SH - 4;
  const sc = new Scene(SW, SH);
  const forkY = by - H * (0.3 + R() * 0.14);
  const fx = bx + (R() - 0.5) * S.w;
  const limbs: Limb[] = [];
  const tips: Array<[number, number]> = [];
  // Crooked limbs from the fork, each splitting into smaller and smaller crooked twigs; three bends
  // to a branch, and now and then one snapped off short.
  const grow = (x0: number, y0: number, ang: number, len: number, w: number, d: number, z: number) => {
    let x = x0;
    let y = y0;
    let a = ang;
    let ww = w;
    for (let seg = 0; seg < 3; seg++) {
      a += (R() - 0.5) * 0.55;
      const l = len / 3;
      const nx = x + Math.sin(a) * l;
      const ny = y - Math.cos(a) * l;
      const nw = Math.max(0.5, ww * 0.84);
      sc.tube(x, y, z, ww, nx, ny, z, nw, WOOD, T_LIMB, 1, seg * l);
      x = nx;
      y = ny;
      ww = nw;
    }
    if (d <= 0 || ww < 0.7) {
      tips.push([x, y]);
      return;
    }
    const n = R() < 0.35 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const spread = 0.3 + R() * 0.4;
      const na = a + (k === 0 ? -spread : k === 1 ? spread : (R() - 0.5) * 0.3);
      const broken = d <= 2 && R() < 0.15;
      grow(x, y, na, len * (broken ? 0.3 : 0.64 + R() * 0.14), ww * 0.72, broken ? 0 : d - 1, z + (R() - 0.5) * 3);
    }
  };
  const nL = R() < 0.45 ? 3 : 2;
  for (let k = 0; k < nL; k++) {
    const t = k / (nL - 1);
    const ang = (t - 0.5) * 1.1 + (R() - 0.5) * 0.3;
    limbs.push({ x: fx + Math.sin(ang) * 2, y: forkY - 2, w: 0.7 });
    grow(fx, forkY, ang, H * (0.26 + R() * 0.08), S.w * 0.5, S.depth, (R() - 0.5) * 3);
  }
  // Snags: stubs of lost limbs on the trunk.
  for (let k = 0; k < (o.size === 'huge' ? 3 : 1); k++) {
    const y = by - (by - forkY) * (0.35 + R() * 0.45);
    const side = R() < 0.5 ? -1 : 1;
    sc.tube(bx + side * S.w * 0.3, y, 1, Math.max(0.8, S.w * 0.22), bx + side * S.w * (0.8 + R() * 0.5), y - 2 - R() * 3, 1.5, 0.6, WOOD, T_LIMB, 1, 0);
  }
  buildTrunk(sc, R, { bx, by, w: S.w, fx, fy: forkY, limbs, roots: o.size === 'huge' ? 4 : o.size === 'bush' ? 1 : 3, rootLen: S.w * 1.1, flare: 0.8, bend: (R() - 0.5) * S.w });
  const ramps: Ramp[] = [o.bark];
  const MOSS_P = o.moss ? ramps.push(['#3a4436', '#5a6650', '#7e8a6e', '#a0aa8a']) - 1 : -1;
  const P = new Paint(SW, SH, ramps);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (sc.z[y * SW + x] !== EMPTY) shadeBark(sc, P, x, y, { pal: 0, moss: -1, seed: o.seed, w: S.w, grain: 'furrows', by, shade: 0 });
  edgeDark(P, new Set([0]));
  // Grey moss hanging from the limbs (the bog).
  if (MOSS_P >= 0) {
    for (const [tx, ty] of tips) {
      if (R() < 0.45) continue;
      const len = 3 + Math.floor(R() * (o.size === 'huge' ? 12 : 8));
      const x0 = Math.round(tx - (tx - bx) * 0.25);
      const y0 = Math.round(ty + 2);
      for (let k = 0; k < len; k++) {
        const x = x0 + (k > len * 0.6 && (k & 1) ? 1 : 0);
        if (P.at(x, y0 + k) >= 0 && P.palAt(x, y0 + k) === 0 && k < 2) continue;
        P.set(x, y0 + k, MOSS_P, k === 0 ? 3 : k < len - 2 ? 2 - (k & 1) : 1);
      }
    }
  }
  return { paint: P, ax: bx, ay: by, crown: { x: Math.round(bx - W / 2), y: Math.round(by - H), w: Math.round(W), h: Math.round(H * 0.6) } };
}

// ------------------------------------------------------------------ giant mushrooms

const STEM: Ramp = ['#2e2a34', '#5e5664', '#9a9098', '#cfc4bc', '#f2eadc'];

export function paintMushroom(o: { seed: number; size: Size; glow: string }): OddBuilt {
  const R = rand(o.seed);
  const base = { bush: 13, small: 20, medium: 32, huge: 46 }[o.size];
  const SW = Math.ceil(base * 1.5 + 10);
  const SH = Math.ceil(base * 1.35 + 8);
  const bx = Math.round(SW / 2);
  const by = SH - 3;
  const sc = new Scene(SW, SH);
  const STALK = 6;
  const CAP = 7;
  const GILL = 8;
  // One big mushroom, and on the bigger sizes a smaller one or two at its foot.
  const shrooms: Array<{ x: number; capW: number; h: number; lean: number; z: number }> = [{ x: bx, capW: base, h: base * 0.7, lean: (R() - 0.5) * base * 0.25, z: 0 }];
  if (o.size === 'huge' || o.size === 'medium') {
    shrooms.push({ x: bx + base * (0.48 + R() * 0.1), capW: base * 0.48, h: base * 0.36, lean: base * 0.1, z: 4 });
    if (o.size === 'huge') shrooms.push({ x: bx - base * (0.45 + R() * 0.1), capW: base * 0.38, h: base * 0.26, lean: -base * 0.08, z: 6 });
  }
  shrooms.forEach((m, k) => {
    const stalkW = Math.max(1.3, m.capW * 0.17);
    const capY = by - m.h;
    const midX = m.x + m.lean * 0.5 + (R() - 0.5) * 2;
    sc.tube(m.x, by, m.z, stalkW * 1.25, midX, by - m.h * 0.5, m.z, stalkW, STALK, k, 1, 0);
    sc.tube(midX, by - m.h * 0.5, m.z, stalkW, m.x + m.lean, capY + m.capW * 0.1, m.z, stalkW * 0.9, STALK, k, 1, m.h * 0.5);
    // The ring round the stalk.
    if (m.capW > 18) sc.sphere(m.x + m.lean * 0.8, capY + m.h * 0.3, m.z + stalkW * 0.5, stalkW * 1.7, stalkW * 0.55, stalkW * 0.5, STALK, 50 + k);
    // The gills: a glowing band just under the cap's rim (only its front shows).
    sc.sphere(m.x + m.lean, capY + m.capW * 0.12, m.z - 1, m.capW * 0.46, m.capW * 0.17, m.capW * 0.1, GILL, 60 + k);
    // The cap: a wide dome.
    sc.sphere(m.x + m.lean, capY - m.capW * 0.08, m.z + 2, m.capW * 0.52, m.capW * 0.38, m.capW * 0.36, CAP, 70 + k, { n: Math.round(m.capW / 3), amp: 0.04, ph: R() * 6 });
  });
  const glow = o.glow;
  const capR: Ramp = [mixC(glow, '#0a0a18', 0.82), mixC(glow, '#0e0c22', 0.64), mixC(glow, '#141030', 0.42), mixC(glow, '#1a1438', 0.18), glow, mixC(glow, '#ffffff', 0.5)];
  const gillR: Ramp = [mixC(glow, '#101020', 0.5), glow, mixC(glow, '#ffffff', 0.4), mixC(glow, '#ffffff', 0.75)];
  const P = new Paint(SW, SH, [STEM, capR, gillR, ['#e8fff8', '#ffffff']]);
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const i = y * SW + x;
      if (sc.z[i] === EMPTY) continue;
      const lam = sc.lit(i);
      const sh = sc.shadow(x, y, 0.7, 20);
      const ao = sc.occlusion(x, y, 2);
      const m = sc.mat[i];
      if (m === STALK) P.set(x, y, 0, quant(0.5 + 0.4 * lam - 0.45 * sh - 0.4 * ao, 5));
      else if (m === GILL) P.set(x, y, 2, quant(0.55 + 0.3 * lam - 0.25 * ao + (x % 2 ? 0.1 : -0.1), 4));
      else {
        let lev = quant(0.42 + 0.42 * lam - 0.3 * sh - 0.5 * ao + (vnoise(x, y, 3, o.seed) - 0.5) * 0.12, 6);
        // Spots on the cap.
        const cx = Math.floor(x / 5);
        const cy = Math.floor(y / 4);
        if (h2(cx, cy, o.seed + 3) < 0.3 && x % 5 <= 1 && y % 4 <= 1 && sc.ny[i] < 0.3) {
          P.set(x, y, 3, lam > 0.3 && x % 5 === 0 && y % 4 === 0 ? 1 : 0);
          continue;
        }
        if (lev >= 5 && lam < 0.6) lev = 4;
        P.set(x, y, 1, lev);
      }
    }
  }
  edgeDark(P, new Set([0, 1]));
  P.cleanOrphans(new Set([1]));
  return { paint: P, ax: bx, ay: by, crown: { x: Math.round(bx - base * 0.6), y: Math.round(by - base * 1.25), w: Math.round(base * 1.2), h: Math.round(base * 0.7) } };
}

// ------------------------------------------------------------------ crystals

export function paintCrystal(o: { seed: number; size: Size; ramp: Ramp }): OddBuilt {
  const R = rand(o.seed);
  const base = { bush: 12, small: 18, medium: 28, huge: 42 }[o.size];
  const SW = Math.ceil(base * 1.4 + 8);
  const SH = Math.ceil(base * 1.5 + 6);
  const bx = Math.round(SW / 2);
  const by = SH - 3;
  const ramp = o.ramp;
  const r5 = [ramp[0], ramp[1], ramp[2], ramp[3], ramp[4] ?? ramp[3]];
  const P = new Paint(SW, SH, [r5, ['#ffffff']]);
  // Prisms, back (tall, middle) to front (short, sides).
  const n = o.size === 'bush' ? 2 : o.size === 'small' ? 3 : o.size === 'medium' ? 4 : 6;
  const prisms: Array<{ x: number; w: number; h: number; tilt: number }> = [];
  for (let k = 0; k < n; k++) {
    const side = k === 0 ? 0 : (k % 2 ? -1 : 1) * (0.25 + R() * 0.45);
    prisms.push({ x: bx + side * base * 0.55, w: Math.max(2, base * (k === 0 ? 0.22 : 0.12 + R() * 0.08)), h: base * (k === 0 ? 1.25 : 0.45 + R() * 0.5), tilt: side * 0.45 + (R() - 0.5) * 0.2 });
  }
  prisms.sort((a, b) => b.h - a.h);
  for (const p of prisms) {
    const tipH = p.w * 1.3;
    for (let yy = 0; yy <= p.h; yy++) {
      const y = by - yy;
      const cx = p.x + p.tilt * yy;
      // Half-width: full on the shaft, tapering to the point.
      const fromTop = p.h - yy;
      const hw = fromTop < tipH ? (p.w * fromTop) / tipH : p.w;
      for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
        const u = (x + 0.5 - cx) / Math.max(0.5, hw);
        if (Math.abs(u) > 1) continue;
        // Three faces: lit left, front, dark right; the tip's facets a step brighter.
        let lev = u < -0.35 ? 3 : u < 0.35 ? 2 : 1;
        if (fromTop < tipH) lev += u < 0 ? 1 : 0;
        if (Math.abs(u + 0.35) < 0.18 && fromTop > tipH) lev = 4;
        P.set(x, y, 0, Math.min(4, lev));
      }
    }
    // A glint near the tip.
    P.set(Math.round(p.x + p.tilt * (p.h - tipH) - p.w * 0.3), Math.round(by - p.h + tipH), 1, 0);
  }
  // Rubble at the foot.
  for (let k = 0; k < 4; k++) {
    const x = Math.round(bx + (R() - 0.5) * base * 0.9);
    P.set(x, by, 0, 1);
    P.set(x + 1, by, 0, 2);
    P.set(x, by - 1, 0, 3);
  }
  edgeDark(P, new Set([0]));
  return { paint: P, ax: bx, ay: by, crown: { x: Math.round(bx - base * 0.6), y: Math.round(by - base * 1.25), w: Math.round(base * 1.2), h: Math.round(base) } };
}

// ------------------------------------------------------------------ cacti

const CACTUS: Ramp = ['#12281a', '#1f4126', '#2f5d33', '#457a42', '#64994f', '#93bf6c'];

export function paintCactus(o: { seed: number; size: Size }): OddBuilt {
  const R = rand(o.seed);
  const H = { bush: 12, small: 20, medium: 34, huge: 48 }[o.size] * (0.92 + R() * 0.16);
  const SW = Math.ceil(H * 0.9 + 10);
  const SH = Math.ceil(H + 8);
  const bx = Math.round(SW / 2);
  const by = SH - 3;
  const sc = new Scene(SW, SH);
  const BODY = 9;
  const flowers: Array<[number, number]> = [];
  if (o.size === 'bush' || o.size === 'small') {
    // A barrel cactus: a squat ribbed ball.
    const r = H * 0.42;
    sc.sphere(bx, by - r * 0.95, 0, r, r * 1.05, r, BODY, 0);
    flowers.push([bx, Math.round(by - r * 2)]);
  } else {
    // A saguaro: a ribbed column with arms that bend up.
    const w = H * 0.1 + 1.5;
    sc.tube(bx, by, 0, w, bx, by - H + w, 0, w * 0.95, BODY, 0, 1, 0);
    flowers.push([bx, Math.round(by - H + 1)]);
    const arms = o.size === 'huge' ? 2 + (R() < 0.5 ? 1 : 0) : 1 + (R() < 0.5 ? 1 : 0);
    for (let k = 0; k < arms; k++) {
      const side = k % 2 ? 1 : -1;
      const y0 = by - H * (0.32 + R() * 0.25);
      const out = w * (1.6 + R() * 0.8);
      const up = H * (0.18 + R() * 0.2);
      const aw = w * 0.72;
      sc.tube(bx, y0, 1, aw, bx + side * out, y0 + 1, 1.5, aw, BODY, 1 + k, 1, 0);
      sc.tube(bx + side * out, y0 + 1, 1.5, aw, bx + side * out, y0 - up, 1.5, aw * 0.95, BODY, 1 + k, 1, 4);
      if (R() < 0.5) flowers.push([Math.round(bx + side * out), Math.round(y0 - up - aw + 1)]);
    }
  }
  const P = new Paint(SW, SH, [CACTUS, ['#9a2a4a', '#e86a8a', '#ffd0dc'], ['#e8dcae', '#fff6dc']]);
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const i = y * SW + x;
      if (sc.z[i] === EMPTY) continue;
      const lam = sc.nx[i] * -0.8 + sc.ny[i] * -0.3 + sc.nz[i] * 0.5;
      const ao = sc.occlusion(x, y, 2);
      const sh = sc.shadow(x, y, 0.7, 14);
      // Ribs: the column's surface folds every couple of pixels across it.
      const across = sc.tag[i] === 0 && o.size !== 'bush' && o.size !== 'small' ? sc.tv[i] * 3.2 : (x + 0.5 - bx) / 2;
      const rib = Math.cos(across * Math.PI);
      const v = 0.42 + 0.4 * lam - 0.4 * ao - 0.3 * sh + rib * 0.1;
      P.set(x, y, 0, quant(v, 6));
      // Spines along the ribs' crests.
      if (rib > 0.85 && h2(x, y, o.seed + 5) < 0.3 && lam > -0.2) P.set(x, y, 2, lam > 0.3 ? 1 : 0);
    }
  }
  edgeDark(P, new Set([0]));
  for (const [fx, fy] of flowers) {
    if (R() < 0.45) continue;
    P.set(fx - 1, fy, 1, 1);
    P.set(fx + 1, fy, 1, 0);
    P.set(fx, fy - 1, 1, 2);
    P.set(fx, fy, 1, 1);
  }
  return { paint: P, ax: bx, ay: by, crown: { x: Math.round(bx - H * 0.4), y: Math.round(by - H), w: Math.round(H * 0.8), h: Math.round(H * 0.6) } };
}
