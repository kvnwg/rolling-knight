/**
 * Renders the dragon's shapes to a pixel-art frame: rays marched at S x S samples per pixel, shaded
 * (a key light from the upper left, a rim light from behind, soft shadows, ambient occlusion, the
 * ground's darkness), patterned (scales, belly plates, ringed horns, veined wings), then brought down
 * to whole pixels in a small set of shades per material, with lines where one part passes in front of
 * another, a dark outline, and the soft shadow on the ground.
 */
import { Bins, MAT, nearest, sceneDist, TEX, type M3, type Prim, type V3 } from './sdf';

export type Dir = 's' | 'e' | 'n' | 'w';

/** The camera looks down at this angle (radians from level). */
export const ELEV = (28 * Math.PI) / 180;

/** Shades per material (dark to light). */
export const SHADES: Record<number, number> = {
  [MAT.scales]: 7,
  [MAT.belly]: 4,
  [MAT.horn]: 5,
  [MAT.membrane]: 4,
  [MAT.teeth]: 2,
  [MAT.mouth]: 3,
  [MAT.eyes]: 2,
  [MAT.trail]: 3,
};

/** Model to camera: the facing turns the model about z, then the camera tilts down. */
export function camera(dir: Dir, yaw = 0): M3 {
  const base = { s: -Math.PI / 2, e: 0, n: Math.PI / 2, w: Math.PI }[dir] + yaw;
  const f: V3 = [Math.cos(base), Math.sin(base), 0];
  const l: V3 = [-f[1], f[0], 0];
  const u: V3 = [0, 0, 1];
  // World (columns f, l, u) then the camera rows.
  const W: M3 = [
    [f[0], l[0], u[0]],
    [f[1], l[1], u[1]],
    [f[2], l[2], u[2]],
  ];
  const s = Math.sin(ELEV);
  const c = Math.cos(ELEV);
  const C: M3 = [
    [1, 0, 0],
    [0, -s, -c],
    [0, c, -s],
  ];
  const out: M3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) out[i][k] = C[i][0] * W[0][k] + C[i][1] * W[1][k] + C[i][2] * W[2][k];
  return out;
}

/** A model point's place on the frame (px, relative to the pivot) and its depth. */
export function project(m: M3, v: V3): V3 {
  return [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];
}

const nrm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Toward the key light (camera space: up the screen is -y, toward the eye is -z). */
const KEY = nrm([-0.55, -0.7, -0.45]);
/** The rim light comes from behind, above and to the right. */
const RIM = nrm([0.55, -0.55, 0.62]);

export interface Frame {
  w: number;
  h: number;
  /** Per pixel: material (0 empty), shade, and flags. */
  mat: Uint8Array;
  shade: Uint8Array;
  /** 1 outline, 2 ground shadow, 3 a line inside the body. */
  kind: Uint8Array;
  depth: Float32Array;
}

export interface RenderOpts {
  w: number;
  h: number;
  px: number;
  py: number;
  ss: number;
  /** The ground shadow's footprint in model space: centre x, y and half sizes. */
  shadow: [number, number, number, number];
}

/**
 * Each facing is drawn a little turned toward the eye (a three-quarter view reads better than a flat
 * front or a flat profile): south and north turn their heads to the right of the screen, east and
 * west turn a little toward the camera.
 */
export const YAW: Record<Dir, number> = { s: 0.2, e: -0.28, n: 0.2, w: 0.28 };

/** One frame of `prims` (model space) seen facing `dir`. */
export function render(prims: Prim[], dir: Dir, o: RenderOpts, yaw = YAW[dir]): Frame {
  const M = camera(dir, yaw);
  const cam = prims.map((p) => p.placed(M, [0, 0, 0]));
  const bins = new Bins(cam, [0, 0, 1], 6);
  const sbins = new Bins(cam, KEY, 6);
  const S = o.ss;
  const W = o.w * S;
  const H = o.h * S;
  const smat = new Uint8Array(W * H);
  const sval = new Float32Array(W * H);
  const stex = new Float32Array(W * H);
  const sdep = new Float32Array(W * H).fill(1e9);
  const sgrp = new Uint8Array(W * H);
  const range = new Map<number[], [number, number]>();
  const sinE = Math.sin(ELEV);
  const cosE = Math.cos(ELEV);
  for (let sy = 0; sy < H; sy++) {
    const y = (sy + 0.5) / S - o.py;
    for (let sx = 0; sx < W; sx++) {
      const x = (sx + 0.5) / S - o.px;
      const list = bins.at(x, y, 0);
      if (!list) continue;
      let r = range.get(list);
      if (!r) {
        let z0 = 1e9;
        let z1 = -1e9;
        for (const i of list) {
          const p = cam[i];
          z0 = Math.min(z0, p.bz - p.br - p.k);
          z1 = Math.max(z1, p.bz + p.br + p.k);
        }
        r = [z0, z1];
        range.set(list, r);
      }
      let z = r[0];
      let hit = false;
      for (let it = 0; it < 160 && z < r[1]; it++) {
        const d = sceneDist(cam, list, x, y, z);
        if (d < 0.02) {
          hit = true;
          break;
        }
        z += Math.max(0.03, d * 0.85);
      }
      if (!hit) continue;
      const i = sy * W + sx;
      // The surface's normal (four taps).
      const e = 0.18;
      const d1 = sceneDist(cam, list, x + e, y - e, z - e);
      const d2 = sceneDist(cam, list, x - e, y - e, z + e);
      const d3 = sceneDist(cam, list, x - e, y + e, z - e);
      const d4 = sceneDist(cam, list, x + e, y + e, z + e);
      const n = nrm([d1 - d2 - d3 + d4, -d1 - d2 + d3 + d4, -d1 + d2 - d3 + d4]);
      const pi = nearest(cam, list, x, y, z);
      const p = cam[pi];
      let mat = p.mat;
      if (p.bellyC && mat === MAT.scales && n[0] * p.bellyC[0] + n[1] * p.bellyC[1] + n[2] * p.bellyC[2] > 0.38) mat = MAT.belly;
      // Light.
      const ndl = n[0] * KEY[0] + n[1] * KEY[1] + n[2] * KEY[2];
      let diff = Math.max(0, (ndl + 0.25) / 1.25);
      // Soft shadow toward the key light.
      let sh = 1;
      {
        let t = 0.9;
        const ox = x + n[0] * 0.6;
        const oy = y + n[1] * 0.6;
        const oz = z + n[2] * 0.6;
        for (let k = 0; k < 48 && t < 90; k++) {
          const qx = ox + KEY[0] * t;
          const qy = oy + KEY[1] * t;
          const qz = oz + KEY[2] * t;
          const sl = sbins.at(qx, qy, qz);
          if (!sl) break;
          const d = sceneDist(cam, sl, qx, qy, qz);
          if (d < 0.05) {
            sh = 0;
            break;
          }
          sh = Math.min(sh, (3.5 * d) / t);
          t += Math.max(0.4, d);
        }
        sh = Math.max(0, Math.min(1, sh));
      }
      // Ambient occlusion along the normal.
      let occ = 0;
      let wgt = 1;
      for (const hh of [1.2, 2.6, 4.6, 7.5]) {
        const d = sceneDist(cam, list, x + n[0] * hh, y + n[1] * hh, z + n[2] * hh);
        occ += Math.max(0, hh - d) * wgt;
        wgt *= 0.6;
      }
      const ao = Math.max(0.35, 1 - occ * 0.16);
      const facing = Math.max(0, -n[2]);
      const rim = Math.max(0, n[0] * RIM[0] + n[1] * RIM[1] + n[2] * RIM[2]) * Math.pow(1 - facing, 1.4);
      // How high this is above the ground: the low parts sit in the dark.
      const height = -(y * cosE + z * sinE);
      const ground = 0.72 + 0.28 * Math.min(1, Math.max(0, height / 24));
      let v = (0.04 + 0.96 * diff * (0.32 + 0.68 * sh)) * ao * ground + rim * 0.95;
      if (mat === MAT.membrane) v = (0.05 + 0.75 * diff * (0.45 + 0.55 * sh)) * ao + Math.max(0, -ndl) * 0.25 + rim * 0.5;
      if (mat === MAT.eyes) v = facing > 0.86 ? 1 : 0;
      if (mat === MAT.horn) v = Math.max(v, p.glow) + p.glow * 0.25;
      if (mat === MAT.trail) v = 0.5 + 0.5 * diff;
      if (mat === MAT.mouth) v = 0.12 + p.glow * 0.88 + 0.15 * diff;
      // Patterns.
      let tex = 0;
      if (p.tex !== TEX.none || mat === MAT.belly) {
        const [u, w] = p.uv(x, y, z);
        const sz = p.texSize;
        if (mat === MAT.belly) {
          // Plates across the belly: a dark seam between each.
          const q = u / (sz * 0.85);
          const fr = q - Math.floor(q);
          tex = fr > 0.78 ? -0.9 : fr < 0.3 ? 0.25 : 0;
        } else if (p.tex === TEX.scales) {
          // Scales as a mosaic of plates (cells of a jittered grid on the surface): a dark seam where
          // two plates meet, the plate's upper face a touch lighter.
          const [f1, f2, cu, cv] = worley(u / sz, w / sz);
          const seam = f2 - f1;
          tex = seam < 0.16 ? -1 : seam < 0.3 ? -0.4 : cv - (w / sz) > 0.12 && f1 < 0.45 ? 0.3 : 0;
          void cu;
        } else if (p.tex === TEX.rings) {
          const q = u / sz;
          const fr = q - Math.floor(q);
          tex = fr < 0.3 ? -0.7 : fr < 0.55 ? 0.25 : 0;
        } else if (p.tex === TEX.veins) {
          const q = w / sz;
          const fr = q - Math.floor(q);
          tex = fr < 0.12 ? -0.6 : 0;
        }
      }
      smat[i] = mat;
      sval[i] = v;
      stex[i] = tex;
      sdep[i] = z;
      sgrp[i] = p.group;
    }
  }
  return resolve(smat, sval, stex, sdep, sgrp, o, M);
}

/** Cell noise: distances to the nearest and second-nearest jittered point, and the nearest's place. */
function worley(x: number, y: number): [number, number, number, number] {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let bx = 0;
  let by = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i;
      const cy = iy + j;
      // Row-offset grid (like scales laid in courses) with a little jitter.
      const h = Math.sin(cx * 127.1 + cy * 311.7) * 43758.5453;
      const h2 = Math.sin(cx * 269.5 + cy * 183.3) * 43758.5453;
      const px = cx + 0.5 + (cy & 1 ? 0.5 : 0) * 0 + (h - Math.floor(h) - 0.5) * 0.5;
      const py = cy + 0.5 + (h2 - Math.floor(h2) - 0.5) * 0.5;
      const d = Math.hypot(x - px, y - py);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        bx = px;
        by = py;
      } else if (d < f2) f2 = d;
    }
  }
  return [f1, f2, bx, by];
}

/** Samples down to pixels: coverage, the material that wins each pixel, its shade; lines, outline, shadow. */
function resolve(smat: Uint8Array, sval: Float32Array, stex: Float32Array, sdep: Float32Array, sgrp: Uint8Array, o: RenderOpts, M: M3): Frame {
  const { w, h, ss: S } = o;
  const W = w * S;
  const mat = new Uint8Array(w * h);
  const shade = new Uint8Array(w * h);
  const kind = new Uint8Array(w * h);
  const depth = new Float32Array(w * h).fill(1e9);
  const grp = new Uint8Array(w * h);
  const need = Math.ceil(S * S * 0.42);
  const counts = new Map<number, number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      counts.clear();
      let covered = 0;
      let eyes = 0;
      let dmin = 1e9;
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const k = (y * S + j) * W + x * S + i;
          const m = smat[k];
          if (!m) continue;
          covered++;
          if (m === MAT.eyes) eyes++;
          counts.set(m, (counts.get(m) ?? 0) + 1);
          dmin = Math.min(dmin, sdep[k]);
        }
      }
      if (covered < need && !(eyes >= 2)) continue;
      // The material: eyes win where they show at all; otherwise the most samples (the nearest breaks ties).
      let best = 0;
      let bc = -1;
      for (const [m, c] of counts) {
        if (c > bc) {
          bc = c;
          best = m;
        }
      }
      if (eyes >= 2) best = MAT.eyes;
      let v = 0;
      let t = 0;
      let n = 0;
      const gc = new Map<number, number>();
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const k = (y * S + j) * W + x * S + i;
          if (smat[k] !== best) continue;
          v += sval[k];
          t += stex[k];
          n++;
          gc.set(sgrp[k], (gc.get(sgrp[k]) ?? 0) + 1);
        }
      }
      v /= n;
      t /= n;
      let g = 0;
      let gn = -1;
      for (const [k, c] of gc) {
        if (c > gn) {
          gn = c;
          g = k;
        }
      }
      const N = SHADES[best];
      const q = Math.max(0, Math.min(N - 1, Math.round(Math.pow(Math.max(0, Math.min(1, v)), 0.9) * (N - 1) + t)));
      const at = y * w + x;
      mat[at] = best;
      shade[at] = q;
      depth[at] = dmin;
      grp[at] = g;
    }
  }
  // Lines: a pixel just behind an edge of something nearer (a big step in depth, or another part a
  // little nearer) darkens to its material's deepest shade.
  const line = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = y * w + x;
      if (!mat[a] || mat[a] === MAT.eyes || mat[a] === MAT.mouth || mat[a] === MAT.trail) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const b = ny * w + nx;
        if (!mat[b]) continue;
        const step = depth[a] - depth[b];
        if (step > 6 || (grp[a] !== grp[b] && step > 2.2)) {
          line[a] = 1;
          break;
        }
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (line[i]) {
      kind[i] = 3;
      shade[i] = 0;
    }
  }
  // Outline: every empty pixel touching the body.
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && mat[y * w + x] > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = y * w + x;
      if (mat[a]) continue;
      if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) kind[a] = 1;
    }
  }
  // The soft shadow on the ground: the body's footprint, flattened by the camera.
  const [cx, cy, hx, hy] = o.shadow;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = y * w + x;
      if (mat[a] || kind[a]) continue;
      // Back from the screen to the ground plane (z = 0): solve the camera's x, y for model x, y.
      const sxp = x + 0.5 - o.px;
      const syp = y + 0.5 - o.py;
      const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
      const mx = (sxp * M[1][1] - M[0][1] * syp) / det;
      const my = (M[0][0] * syp - M[1][0] * sxp) / det;
      if (((mx - cx) / hx) ** 2 + ((my - cy) / hy) ** 2 <= 1) kind[a] = 2;
    }
  }
  return { w, h, mat, shade, kind, depth };
}
