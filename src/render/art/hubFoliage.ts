/**
 * The hub's greenery: lobed tree crowns in a dark wall behind the shop (Firefly Garden's round,
 * blocky trees, lit on top), big-leaved plants (elephant ears, monstera, banana) and ferns framing
 * the square's edges, bushes, and a front layer of huge glossy leaves over the bottom corners. Every
 * leaf is split light and dark along its midrib with a lime rim where it catches the light.
 */
import { clump, h2, Layer, LEAF, leaf, rk, tuft, type Ramp } from './hubKit';
import type { HubOut } from './hubScene';

const BARK: Ramp = ['#140c08', '#22160e', '#342216', '#48301e', '#5e4028', '#765236'];
/** A darker, bluer green for the trees deep in the night behind the shop. */
export const DEEP: Ramp = ['#050c0a', '#08140f', '#0d1f15', '#132b1b', '#1a3a22', '#244c2a', '#306032', '#3e7838', '#52923e', '#6aaa48'];

export interface PlantOpts {
  seed: number;
  /** Leaf length. */
  size: number;
  tone: number;
  /** How many leaves. */
  n?: number;
  /** The fan's center direction (radians; -PI/2 is straight up) and its spread. */
  dir?: number;
  spread?: number;
  shape?: 'broad' | 'lance' | 'round';
  notch?: boolean;
  ramp?: Ramp;
}

/**
 * A big-leaved plant: leaves on short stems fanning out of one clump, the ones at the back (pointing
 * up, away) drawn first and darker, the ones in front (pointing out and down) last and brighter.
 */
export function bigLeafPlant(L: Layer, x: number, y: number, o: PlantOpts): void {
  const n = o.n ?? 7;
  const dir = o.dir ?? -Math.PI / 2;
  const spread = o.spread ?? 2.4;
  const leaves: Array<{ a: number; len: number; front: number }> = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = dir + (t - 0.5) * spread + (h2(i, 1, o.seed) - 0.5) * 0.35;
    const len = o.size * (0.7 + h2(i, 2, o.seed) * 0.45);
    // How far toward the viewer: leaves pointing down (sin > 0) are in front.
    leaves.push({ a, len, front: Math.sin(a) + h2(i, 3, o.seed) * 0.3 });
  }
  leaves.sort((p, q) => p.front - q.front);
  leaves.forEach((lf, i) => {
    // A stem from the base to where the blade starts.
    const sx = x + Math.cos(lf.a) * lf.len * 0.18;
    const sy = y + Math.sin(lf.a) * lf.len * 0.18;
    const tone = Math.max(0, Math.min(1, o.tone + (lf.front + 0.4) * 0.18 + (h2(i, 4, o.seed) - 0.5) * 0.15));
    for (let t = 0; t < 1; t += 0.2) L.px(Math.round(x + (sx - x) * t), Math.round(y + (sy - y) * t), rk(o.ramp ?? LEAF, 2 + tone * 2));
    leaf(L, sx, sy, lf.a, lf.len, lf.len * (o.shape === 'lance' ? 0.32 : 0.52), { tone, seed: o.seed * 13 + i, shape: o.shape, notch: o.notch && i % 2 === 0, ramp: o.ramp });
  });
}

/** A fern: arching fronds, each a rib with little leaflets alternating along it. */
export function fern(L: Layer, x: number, y: number, o: { seed: number; size: number; tone: number; n?: number; ramp?: Ramp }): void {
  const r = o.ramp ?? LEAF;
  const n = o.n ?? 6;
  const fronds: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) fronds.push([-Math.PI / 2 + ((i + 0.5) / n - 0.5) * 2.8 + (h2(i, 1, o.seed) - 0.5) * 0.3, o.size * (0.75 + h2(i, 2, o.seed) * 0.4)]);
  fronds.sort((p, q) => Math.sin(p[0]) - Math.sin(q[0]));
  fronds.forEach(([a, len], i) => {
    const tone = o.tone + Math.sin(a) * 0.15 + 0.1;
    const steps = Math.ceil(len * 1.5);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      // The frond arches: up and out, then curling down at the tip.
      const px = x + Math.cos(a) * len * t;
      const py = y + Math.sin(a) * len * t + len * 0.45 * t * t * Math.abs(Math.cos(a)) + len * 0.15 * t * t;
      const k = 2 + tone * 3.5 + (1 - t) * 0.5;
      L.px(Math.round(px), Math.round(py), rk(r, k - 0.8));
      // Leaflets either side, shorter toward the tip.
      if (s % 2 === 0 && t > 0.08 && t < 0.97) {
        const ll = Math.max(1, Math.round((1 - t) * len * 0.22 + 1));
        const nx = -Math.sin(a);
        const ny = Math.cos(a);
        for (const side of [-1, 1]) {
          for (let q = 1; q <= ll; q++) {
            const lx = Math.round(px + nx * side * q + Math.cos(a) * q * 0.4);
            const ly = Math.round(py + ny * side * q + Math.sin(a) * q * 0.4 + q * 0.3);
            const lit = side * (nx * -0.6 + ny * -0.8) > 0;
            L.px(lx, ly, rk(r, k + (lit ? 1.2 : -0.2) + (q === ll ? 0.5 : 0)));
          }
        }
      }
    }
    void i;
  });
}

/** A tree: a short trunk flaring into roots and a big lobed crown on top. */
export function tree(L: Layer, x: number, y: number, o: { seed: number; r: number; tone: number; trunk: number; ramp?: Ramp }): void {
  const tw = Math.max(4, Math.round(o.r * 0.22));
  for (let yy = y - o.trunk; yy <= y; yy++) {
    const flare = yy > y - 3 ? y - 3 - yy + 3 : 0;
    for (let xx = x - tw - flare; xx <= x + tw + flare; xx++) {
      const t = (xx - (x - tw - flare)) / (2 * (tw + flare));
      const ridge = (xx + Math.floor(h2(xx, Math.floor(yy / 4), o.seed) * 3)) % 3 === 0;
      L.px(xx, yy, rk(BARK, 3.8 - t * 3 - (ridge ? 0.8 : 0)));
    }
  }
  clump(L, x, y - o.trunk - o.r * 0.6, o.r, o.r * 0.82, { seed: o.seed, tone: o.tone, ramp: o.ramp ?? LEAF, lobes: Math.max(5, Math.round(o.r / 4)) });
}

// ------------------------------------------------------------------ the hub's greenery

/** The dark wall of trees behind the shop and stalls (sorted behind everything). */
export function canopy(out: HubOut): void {
  const L = new Layer(-8, -10, 496, 150);
  // A far row: dark, blue-green masses filling the top edge.
  for (let i = 0; i < 14; i++) {
    const x = -10 + i * 37 + h2(i, 1, 5) * 14;
    clump(L, x, 8 + h2(i, 2, 5) * 10, 30, 24, { seed: 500 + i, tone: 0.08, ramp: DEEP });
  }
  // The near crowns either side of the shop, lit a little on top.
  const near: Array<[number, number, number, number]> = [
    [16, 74, 34, 0.32], [62, 60, 36, 0.38], [112, 66, 32, 0.4], [148, 44, 24, 0.3],
    [332, 44, 24, 0.3], [366, 64, 32, 0.4], [418, 58, 36, 0.38], [466, 76, 34, 0.32],
    [200, 22, 22, 0.2], [282, 22, 22, 0.2],
  ];
  near.sort((p, q) => p[1] - q[1]);
  near.forEach(([x, y, r, tone], i) => clump(L, x, y, r, r * 0.8, { seed: 520 + i, tone, ramp: DEEP, lobes: 8 }));
  out.piece(L, 'canopy', 100);
}

/** Greenery down the left and right edges and round the bottom: plants and bushes (y-sorted). */
export function edgeGreens(out: HubOut): void {
  // Each entry: x, y (base), kind, size, tone, seed.
  type G = [number, number, 'leafy' | 'fern' | 'bush' | 'tree' | 'monstera' | 'banana', number, number];
  const list: G[] = [
    // Left edge, top to bottom.
    [14, 196, 'banana', 26, 0.4], [30, 236, 'fern', 18, 0.45], [12, 280, 'tree', 30, 0.42], [34, 318, 'monstera', 18, 0.5],
    [18, 366, 'leafy', 22, 0.45], [36, 402, 'fern', 16, 0.5], [14, 440, 'tree', 28, 0.4], [40, 470, 'bush', 13, 0.5],
    // Right edge.
    [466, 196, 'banana', 26, 0.4], [450, 240, 'fern', 18, 0.45], [468, 284, 'tree', 30, 0.42], [446, 322, 'monstera', 18, 0.5],
    [462, 368, 'leafy', 22, 0.45], [444, 404, 'fern', 16, 0.5], [466, 442, 'tree', 28, 0.4], [440, 474, 'bush', 13, 0.5],
    // Round the bottom, either side of the steps.
    [70, 512, 'bush', 16, 0.45], [120, 530, 'leafy', 20, 0.55], [168, 552, 'fern', 15, 0.6],
    [410, 512, 'bush', 16, 0.45], [360, 530, 'leafy', 20, 0.55], [312, 552, 'fern', 15, 0.6],
  ];
  list.forEach(([x, y, kind, size, tone], i) => {
    const pad = size * 2 + 10;
    const L = new Layer(x - pad, y - pad * (kind === 'tree' ? 2.4 : 1.6), pad * 2, pad * (kind === 'tree' ? 2.4 : 1.6) + 6);
    const seed = 700 + i * 17;
    switch (kind) {
      case 'leafy':
        bigLeafPlant(L, x, y, { seed, size, tone, n: 7 });
        break;
      case 'banana':
        bigLeafPlant(L, x, y, { seed, size, tone, n: 6, shape: 'lance', spread: 2.2 });
        break;
      case 'monstera':
        bigLeafPlant(L, x, y, { seed, size, tone, n: 6, notch: true, shape: 'round' });
        break;
      case 'fern':
        fern(L, x, y, { seed, size, tone, n: 7 });
        break;
      case 'bush':
        clump(L, x, y - size * 0.7, size, size * 0.8, { seed, tone });
        tuft(L, x - size + 2, y, 3, 4, { seed, tone });
        break;
      case 'tree':
        tree(L, x, y, { seed, r: size, tone, trunk: 14 });
        break;
    }
    out.piece(L, `green${i}`, y);
    out.shadows.push({ kind: 'oval', x: x + 4, y: y + 1, rx: size * (kind === 'tree' ? 0.5 : 0.7), ry: 3, strength: 0.4 });
  });
}

/** Huge glossy leaves over the bottom corners and the lowest edges: drawn over everything. */
export function frontLeaves(out: HubOut): void {
  const L = new Layer(-20, 470, 520, 190);
  const left: Array<[number, number, number, number, number]> = [
    [-6, 640, -0.55, 70, 0.35], [10, 650, -0.95, 62, 0.45], [40, 660, -1.25, 54, 0.4], [-14, 600, -0.25, 58, 0.3],
    [70, 662, -1.45, 46, 0.5], [100, 668, -1.2, 40, 0.55], [-10, 560, -0.1, 44, 0.3],
  ];
  const right = left.map(([x, y, a, len, tone]) => [480 - x, y, -Math.PI - a, len, tone] as [number, number, number, number, number]);
  [...left, ...right].sort((p, q) => q[1] - p[1] || p[3] - q[3]).forEach(([x, y, a, len, tone], i) => {
    leaf(L, x, y, a, len, len * 0.5, { tone, seed: 900 + i, notch: i % 3 === 1, droop: 0.08 });
  });
  out.front(L, 'frontLeaves');
}
