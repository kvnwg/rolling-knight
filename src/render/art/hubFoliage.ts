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
  out.piece(L, 'canopy', 100, null);
}

type Kind = 'leafy' | 'fern' | 'bush' | 'tree' | 'monstera' | 'banana' | 'elephant';

/** One plant as its own y-sorted piece. `lean` tips its leaves toward the square (-1 left side, 1 right). */
function plant(out: HubOut, id: string, x: number, y: number, kind: Kind, size: number, tone: number, seed: number, lean: number): void {
  const tall = kind === 'tree' ? 2.6 : 1.7;
  const pad = size * 1.9 + 10;
  const L = new Layer(x - pad, y - pad * tall, pad * 2, pad * tall + 6);
  // Leaves fan up and lean in over the square: -PI/2 is straight up.
  const dir = -Math.PI / 2 + lean * 0.55;
  switch (kind) {
    case 'leafy':
      bigLeafPlant(L, x, y, { seed, size, tone, n: 7, dir, spread: 2.6 });
      break;
    case 'elephant':
      bigLeafPlant(L, x, y, { seed, size, tone, n: 5, dir, spread: 2.2, shape: 'round' });
      break;
    case 'banana':
      bigLeafPlant(L, x, y, { seed, size, tone, n: 6, shape: 'lance', dir, spread: 2.3 });
      break;
    case 'monstera':
      bigLeafPlant(L, x, y, { seed, size, tone, n: 6, notch: true, shape: 'round', dir, spread: 2.5 });
      break;
    case 'fern':
      fern(L, x, y, { seed, size, tone, n: 7 });
      break;
    case 'bush':
      clump(L, x, y - size * 0.7, size, size * 0.8, { seed, tone });
      break;
    case 'tree':
      tree(L, x, y, { seed, r: size, tone, trunk: 16 });
      break;
  }
  out.piece(L, id, y);
  if (kind === 'tree' || kind === 'bush') out.shadows.push({ kind: 'oval', x: x + 4, y: y + 1, rx: size * 0.6, ry: 3, strength: 0.4 });
}

/**
 * Greenery framing the square: a dense bank of big-leaved plants, ferns and bushes down the left and
 * right edges (leaning in), trees with lanterns hung in them, thick planting in the top corners beside
 * the stalls and round the bottom on either side of the steps. Everything is y-sorted.
 */
export function edgeGreens(out: HubOut): void {
  const kinds: Kind[] = ['leafy', 'fern', 'monstera', 'bush', 'banana', 'elephant', 'fern', 'leafy', 'bush'];
  let n = 0;
  const add = (x: number, y: number, kind: Kind, size: number, tone: number, lean: number) => plant(out, `green${n}`, x, y, kind, size, tone, 700 + n++ * 17, lean);
  // The two edges, an outer row and a softer inner row along the paving.
  for (const side of [-1, 1]) {
    const X = (x: number) => (side < 0 ? x : 480 - x);
    let i = 0;
    for (let y = 96; y < 520; y += 15 + Math.floor(h2(i, 1, 33) * 8)) {
      const k = kinds[(i * 4 + (side > 0 ? 3 : 0)) % kinds.length];
      const x = 6 + h2(i, 2, side + 40) * 26;
      const size = k === 'bush' ? 13 + h2(i, 3, 41) * 6 : k === 'fern' ? 16 + h2(i, 3, 42) * 6 : 20 + h2(i, 3, 43) * 9;
      add(X(x), y, k, size, 0.45 + h2(i, 4, 44) * 0.35, -side);
      i++;
    }
    // The inner row: low ferns and leaves spilling onto the paving's edge.
    for (let y = 206; y < 500; y += 34 + Math.floor(h2(i, 5, 45) * 18)) {
      add(X(40 + h2(i, 6, 46) * 8), y, i % 2 ? 'fern' : 'elephant', 12 + h2(i, 7, 47) * 5, 0.6 + h2(i, 8, 48) * 0.25, -side);
      i++;
    }
  }
  // Trees at the edges, a lantern hung from each.
  for (const [x, y, r] of [[18, 300, 30], [462, 304, 30], [14, 470, 28], [468, 474, 28], [30, 176, 24], [452, 178, 24]] as const) {
    add(x, y, 'tree', r, 0.42, 0);
  }
  for (const [x, y] of [[34, 266], [446, 270], [30, 436], [450, 440]] as const) hangingLantern(out, x, y, `treeLantern${x}`);
  // The top corners beside the stalls: thick planting in front of the trees.
  for (const [x, y, k, size] of [[8, 112, 'bush', 18], [34, 128, 'banana', 26], [16, 150, 'leafy', 24], [44, 170, 'fern', 16], [472, 112, 'bush', 18], [446, 128, 'banana', 26], [464, 150, 'leafy', 24], [436, 170, 'fern', 16]] as const) {
    add(x, y, k, size, 0.5, x < 240 ? 1 : -1);
  }
  // Round the bottom, either side of the steps: banks of bushes and big leaves.
  for (const side of [-1, 1]) {
    const X = (x: number) => (side < 0 ? x : 480 - x);
    let j = 0;
    for (let y = 486; y < 650; y += 14) {
      // The bank's inner edge follows the paving's curve toward the steps.
      const t = Math.max(0, (y - 470) / 75);
      const inner = Math.min(y > 540 ? 166 : 186, 40 + t * t * 150);
      for (let x = 4 + (j % 2) * 12; x < inner - 6; x += 24 + Math.floor(h2(j, x, 49) * 10)) {
        const k = kinds[(j * 3 + Math.floor(x / 24)) % kinds.length];
        const near = x > inner - 40;
        const size = (k === 'bush' ? 14 + h2(j, x, 50) * 7 : 18 + h2(j, x, 51) * 10) * (near ? 0.75 : 1);
        // Plants by the steps lean away from them, so the steps stay clear.
        add(X(x + h2(j, x, 52) * 6), y + Math.floor(h2(j, x, 53) * 6), k, size, 0.4 + h2(j, x, 54) * 0.35, near ? side * 0.5 : -side * 0.6);
      }
      j++;
    }
  }
}

/** A lantern hanging from a branch: a short chain, the glowing box. */
function hangingLantern(out: HubOut, x: number, y: number, id: string): void {
  const L = new Layer(x - 6, y - 8, 13, 22);
  for (let yy = y - 6; yy < y; yy++) L.px(x, yy, yy % 2 ? '#3a3a44' : '#5a5a66');
  lanternAt(L, x, y);
  L.outlineTinted(0.7);
  L.light(x, y + 6, 70, '#ffae4c', 0.55, 0.3);
  out.piece(L, id, y + 40, null);
}

function lanternAt(L: Layer, x: number, y: number): void {
  L.rect(x - 2, y, 5, 1, '#e0b040');
  L.rect(x - 3, y + 1, 7, 1, '#8a5a1a');
  for (let yy = y + 2; yy < y + 8; yy++) {
    for (let xx = x - 2; xx <= x + 2; xx++) {
      if (xx === x - 2 || xx === x + 2) L.px(xx, yy, '#363644');
      else L.gl(xx, yy, yy < y + 4 ? '#fff2c0' : xx === x - 1 ? '#ffe090' : '#ffc860');
    }
  }
  L.rect(x - 3, y + 8, 7, 1, '#8a5a1a');
  for (const [dx, dy] of [[-3, 3], [3, 3], [-3, 5], [3, 5], [0, 9], [-4, 4], [4, 4]] as const) L.halo(x + dx, y + dy, '#ffb850', 0.3);
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
