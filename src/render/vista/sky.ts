/**
 * The vista's sky: the sunset gradient, pixel cumulus and streaky stratus.
 *
 * Cumulus are built like real ones: a heap of spheres (a flat base, a lumpy body, puffs whose tops
 * trace the cloud's silhouette). Each pixel takes the normal of the sphere nearest the viewer, is lit
 * by the low sun (from its side and from below, as at sunset) with soft self-shadowing (a short march
 * toward the light through the cloud's own mask), then is quantized into clean tone bands and cleaned
 * of stray pixels. The result reads as big pixel-art shapes with lilac shadows and coral-gold lining.
 */
import { clamp, hex, mix, Pix, rng, sample, type RGB, type Stops } from './pix';

/** The sky from the top of the view (0) down to the horizon (1), and a little past it. */
export const SKY: Stops = [
  [0.0, '#120e36'],
  [0.12, '#1c1650'],
  [0.26, '#2c1f68'],
  [0.4, '#45287c'],
  [0.53, '#6b3389'],
  [0.65, '#9c4290'],
  [0.76, '#d0588e'],
  [0.85, '#f47a86'],
  [0.92, '#ffa07e'],
  [0.97, '#ffc386'],
  [1.0, '#ffd895'],
  [1.2, '#ffe4ae'],
];

export function skyAt(v: number): RGB {
  return sample(SKY, v);
}

/** Cloud tones from deepest shadow to the sun-lit lining. */
const CLOUD_RAMP: readonly RGB[] = ['#54418c', '#6c509e', '#8a5ea8', '#ac69aa', '#cf729e', '#ea7f94', '#ff998c', '#ffb98e', '#ffdba4'].map(hex);

export type CloudKind = 'tower' | 'bank' | 'puff';

export interface CloudOpts {
  w: number;
  h: number;
  seed: number;
  kind: CloudKind;
  /** +1 when the sun is to the cloud's right, -1 to its left. */
  side: number;
  /** How far the sun sits to the side (0 = straight below, 1 = far off to the side). */
  sideK: number;
  /** The sky behind the cloud, and how much the cloud fades into it (distance haze). */
  haze: RGB;
  hazeK: number;
  /** Lifts or lowers the whole tone ramp (clouds near the sun glow more). */
  gain: number;
}

interface Ball {
  x: number;
  y: number;
  z: number;
  r: number;
}

export function cumulus(o: CloudOpts): Pix {
  const r = rng(o.seed);
  const W = Math.max(8, Math.round(o.w));
  const H = Math.max(6, Math.round(o.h));
  // The silhouette: a sum of humps over a low body; the base is flat in the middle, lifting at the ends.
  const humps: Array<[number, number, number]> = [];
  let body = 0.4;
  if (o.kind === 'tower') {
    const c = 0.46 + r() * 0.08;
    humps.push([W * c, W * 0.1, H * 0.97]);
    humps.push([W * (c - 0.07), W * 0.08, H * 0.86]);
    humps.push([W * (c + 0.08), W * 0.08, H * 0.82]);
    humps.push([W * (c - 0.19), W * 0.09, H * (0.66 + r() * 0.08)]);
    humps.push([W * (c + 0.2), W * 0.09, H * (0.7 + r() * 0.08)]);
    humps.push([W * (c - 0.33), W * 0.08, H * (0.42 + r() * 0.08)]);
    humps.push([W * (c + 0.34), W * 0.08, H * (0.46 + r() * 0.08)]);
    body = 0.32;
  } else if (o.kind === 'bank') {
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) humps.push([W * (0.18 + (0.64 * i) / (n - 1) + (r() - 0.5) * 0.06), W * (0.13 + r() * 0.04), H * (0.62 + r() * 0.38)]);
    body = 0.5;
  } else {
    humps.push([W * (0.46 + r() * 0.08), W * 0.2, H * 0.95]);
    humps.push([W * 0.26, W * 0.13, H * 0.62]);
    humps.push([W * 0.73, W * 0.13, H * 0.68]);
  }
  const lo = Math.min(...humps.map(([c, sp]) => c - sp * 1.2));
  const hi = Math.max(...humps.map(([c, sp]) => c + sp * 1.2));
  const prof = (x: number) => {
    let m = 0;
    for (const [c, sp, hh] of humps) m = Math.max(m, hh * Math.exp(-(((x - c) / sp) ** 2)));
    const u = clamp((x - lo) / (hi - lo), 0, 1);
    const bodyH = H * body * Math.pow(Math.sin(u * Math.PI), 0.6);
    return Math.max(m, bodyH);
  };
  const baseAt = (x: number) => {
    const u = clamp((x - lo) / (hi - lo), 0, 1);
    const edge = Math.min(u, 1 - u) * 2;
    return H - 1 - Math.pow(1 - clamp(edge * 3, 0, 1), 2) * H * 0.16;
  };
  // Lobes in stacked rows: tops tracing the silhouette, a middle row, a row along the base. Lower
  // rows are nearer the viewer, so each upper puff peeks over the one in front of it.
  const balls: Ball[] = [];
  const row = (frac: number, size: number, spacing: number, zBias: number) => {
    let bx = lo + r() * H * 0.08;
    while (bx < hi) {
      const ph = prof(bx);
      if (ph > 4) {
        const rad = clamp(ph * size * (0.8 + r() * 0.4) + 1.5, 3, H * 0.3);
        const cy = frac >= 1 ? H - 1 - ph + rad * (0.92 + r() * 0.1) : H - 1 - ph * frac;
        balls.push({ x: bx + (r() - 0.5) * rad * 0.3, y: Math.min(cy, baseAt(bx) - rad * 0.35), z: zBias + (cy / H) * H * 0.35 + r() * rad * 0.25, r: rad });
        bx += rad * spacing * (0.85 + r() * 0.3);
      } else bx += 2;
    }
  };
  row(1, 0.24, 0.8, 0);
  row(0.62, 0.26, 0.85, 2);
  row(0.3, 0.22, 0.8, 4);
  for (let bx = lo + (hi - lo) * 0.08; bx < hi - (hi - lo) * 0.08; bx += H * (0.13 + r() * 0.07)) {
    const ph = prof(bx);
    if (ph < 6) continue;
    const rad = clamp(ph * 0.17 + r() * 2, 3, H * 0.17);
    balls.push({ x: bx, y: baseAt(bx) - rad * 0.45, z: 6 + H * 0.35 + rad * 0.2, r: rad });
  }
  // A filler behind everything so no holes show.
  for (let bx = W * 0.03; bx < W * 0.97; bx += Math.max(2, H * 0.06)) {
    const ph = prof(bx);
    if (ph < 3) continue;
    const rad = Math.min(ph * 0.42, W * 0.18);
    balls.push({ x: bx, y: H - 1 - ph * 0.82 + rad, z: -H, r: rad });
  }

  // Nearest surface per pixel (a z-buffer over the spheres).
  const N = W * H;
  const zb = new Float32Array(N).fill(-1e9);
  const nx = new Float32Array(N);
  const ny = new Float32Array(N);
  const nz = new Float32Array(N).fill(-1);
  const own = new Int16Array(N).fill(-1);
  for (let bi = 0; bi < balls.length; bi++) {
    const b = balls[bi];
    const x0 = Math.max(0, Math.floor(b.x - b.r));
    const x1 = Math.min(W - 1, Math.ceil(b.x + b.r));
    const y0 = Math.max(0, Math.floor(b.y - b.r));
    const y1 = Math.min(H - 1, Math.ceil(b.y + b.r));
    const r2 = b.r * b.r;
    for (let y = y0; y <= y1; y++) {
      for (let xx = x0; xx <= x1; xx++) {
        if (y > baseAt(xx)) continue;
        const dx = xx + 0.5 - b.x;
        const dy = y + 0.5 - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const dz = Math.sqrt(r2 - d2);
        const z = b.z + dz;
        const i = y * W + xx;
        if (z > zb[i]) {
          zb[i] = z;
          nx[i] = dx / b.r;
          ny[i] = dy / b.r;
          nz[i] = dz / b.r;
          own[i] = bi;
        }
      }
    }
  }
  const m = new Uint8Array(N);
  for (let i = 0; i < N; i++) m[i] = nz[i] >= 0 ? 1 : 0;
  const at = (xx: number, y: number) => (xx < 0 || y < 0 || xx >= W || y >= H ? 0 : m[y * W + xx]);
  // Tidy the edge: no lone pixels sticking out, no pinholes.
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) {
      for (let xx = 0; xx < W; xx++) {
        const k = at(xx - 1, y) + at(xx + 1, y) + at(xx, y - 1) + at(xx, y + 1);
        const i = y * W + xx;
        if (m[i] && k <= 1) m[i] = 0;
        else if (!m[i] && k >= 3) {
          m[i] = 1;
          nx[i] = 0;
          ny[i] = 0;
          nz[i] = 1;
        }
      }
    }
  }

  // The sun is low, off to one side and below: light comes from there, a little toward us.
  const lx = o.side * (0.35 + 0.75 * o.sideK);
  const ly = 0.7;
  const lz = 0.55;
  const ll = Math.hypot(lx, ly, lz);
  const L3 = [lx / ll, ly / ll, lz / ll];
  const l2 = Math.hypot(lx, ly);
  const sx = lx / l2;
  const sy = ly / l2;
  const tones = CLOUD_RAMP.length;
  const tone = new Int8Array(N).fill(-1);
  const bandW = Math.max(2, H * 0.09);
  const reach = bandW * tones;
  for (let y = 0; y < H; y++) {
    for (let xx = 0; xx < W; xx++) {
      const i = y * W + xx;
      if (!m[i]) continue;
      // Bands are offset copies of the silhouette: distance into the cloud from its sunlit edge.
      let depth = 0;
      for (let d = 1; d <= reach; d += 1) {
        if (!at(Math.round(xx + sx * d), Math.round(y + sy * d))) break;
        depth = d;
      }
      // Each lobe has its own base tone (higher lobes sit deeper in shadow), so tone changes follow lobe outlines.
      const b = own[i] >= 0 ? balls[own[i]] : null;
      const lobeTone = !b || b.z < -H * 0.5 ? 2 : b.y < H * 0.2 ? 2 : 3;
      let k = Math.max(lobeTone, Math.round(tones - 2 - depth / bandW + (o.gain - 1) * 4 - 0.2));
      // A lobe's crescent toward the sun lifts a step.
      const lam = nx[i] * L3[0] + ny[i] * L3[1] + nz[i] * L3[2];
      if (lam > 0.8 && depth < bandW * 3) k += 1;
      // Creases: where a nearer lobe overlaps this one, a line of shadow along its edge.
      for (const d of [1, 2]) {
        const ox = Math.round(xx + sx * d);
        const oy = Math.round(y + sy * d);
        if (!at(ox, oy)) break;
        const j = oy * W + ox;
        if (own[j] !== own[i] && zb[j] > zb[i] + 2.5) {
          k -= 1;
          break;
        }
      }
      // The lining: edges that face the sun.
      if (depth === 0) k = Math.max(k, tones - 1);
      tone[i] = clamp(k, 0, tones - 1);
    }
  }
  // Clean bands: a pixel unlike all four neighbors takes their most common tone.
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < H; y++) {
      for (let xx = 0; xx < W; xx++) {
        const i = y * W + xx;
        if (tone[i] < 0) continue;
        const nb: number[] = [];
        if (xx > 0 && tone[i - 1] >= 0) nb.push(tone[i - 1]);
        if (xx < W - 1 && tone[i + 1] >= 0) nb.push(tone[i + 1]);
        if (y > 0 && tone[i - W] >= 0) nb.push(tone[i - W]);
        if (y < H - 1 && tone[i + W] >= 0) nb.push(tone[i + W]);
        if (nb.length < 2) continue;
        let same = 0;
        for (const v of nb) if (v === tone[i]) same++;
        if (same >= 1) continue;
        const counts = new Map<number, number>();
        for (const v of nb) counts.set(v, (counts.get(v) ?? 0) + 1);
        let best = nb[0];
        for (const [v, c] of counts) if (c > (counts.get(best) ?? 0)) best = v;
        tone[i] = best;
      }
    }
  }
  const ramp = CLOUD_RAMP.map((c, k) => mix(c, o.haze, o.hazeK * (1 - (k / (tones - 1)) * 0.7)));
  const out = new Pix(W, H);
  for (let i = 0; i < N; i++) if (tone[i] >= 0) out.set(i % W, Math.floor(i / W), ramp[tone[i]]);
  return out;
}

/**
 * A streak of stratus: a few overlapping thin runs, darker on top, lit along the bottom edge by the
 * low sun. `v` is its height in the sky (0 top .. 1 horizon); low streaks are gold, high ones rose.
 */
export function streak(len: number, thick: number, seed: number, v: number, haze: RGB): Pix {
  const r = rng(seed);
  const W = Math.max(6, Math.round(len));
  const T = Math.max(2, Math.round(thick));
  const H = T + 4;
  const out = new Pix(W, H);
  const lit = mix(sample([[0, '#e27ab0'], [0.45, '#ff8fa4'], [0.75, '#ffb08c'], [1, '#ffe0a6']], v), haze, 0.15);
  const mid = mix(sample([[0, '#9a5aa6'], [0.45, '#c8689e'], [0.75, '#ef8090'], [1, '#ffbf8e']], v), haze, 0.25);
  const top = mix(sample([[0, '#5e3c8c'], [0.45, '#8a4c96'], [0.75, '#c06290'], [1, '#f39a88']], v), haze, 0.35);
  const segs = 2 + Math.floor(r() * 3);
  for (let s = 0; s < segs; s++) {
    const segLen = W * (0.45 + r() * 0.5);
    const x0 = (W - segLen) * r();
    const t = Math.max(1, T - Math.floor(r() * 2));
    const y0 = 1 + Math.floor(r() * (H - t - 2));
    for (let row = 0; row < t; row++) {
      // Rows taper toward the ends, the lower ones longest (a flat lit base).
      const u = (row + 1) / t;
      const shrink = (1 - u) * segLen * (0.18 + r() * 0.12);
      const a = Math.round(x0 + shrink * (0.4 + r() * 0.6));
      const b = Math.round(x0 + segLen - shrink * (0.4 + r() * 0.6));
      const c = row >= t - 2 ? lit : row >= t - 3 ? mid : top;
      for (let x = a; x <= b; x++) {
        // Never paint a darker tone over a lit one from another run.
        const y = y0 + row;
        if (out.a(x, y) && c === top) continue;
        out.set(x, y, c);
      }
    }
  }
  return out;
}
