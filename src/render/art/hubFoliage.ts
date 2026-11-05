/**
 * The hub's greenery: dark lobed tree crowns past the roof's ends, a dense bank of big-leaved plants
 * (elephant ears, monstera, banana), ferns and flowering bushes down both sides of the court leaning
 * in over its edges, more round the steps, and a front layer of huge glossy leaves over the bottom
 * corners. Every leaf is split light and dark along its midrib with a lime rim where it catches the
 * light; near the shop the lamps warm them, toward the edges they go dark and cool.
 */
import { clump, h2, Layer, LEAF, leaf, rk, type Ramp } from './hubKit';
import type { HubOut } from './hubScene';

const BARK: Ramp = ['#140c08', '#22160e', '#342216', '#48301e', '#5e4028', '#765236'];
/** A darker, bluer green for the trees deep in the night behind the shop. */
export const DEEP: Ramp = ['#050c0a', '#08140f', '#0d1f15', '#132b1b', '#1a3a22', '#244c2a', '#306032', '#3e7838', '#52923e', '#6aaa48'];
const FLOWERS = [['#c8304a', '#ff5a6a', '#ffd0d8'], ['#d0507a', '#ff8ab8', '#fff0f4'], ['#c87a20', '#ffb04a', '#fff0c0'], ['#d8d0c0', '#ffffff', '#ffe080'], ['#8a4ad0', '#c08aff', '#f0e0ff']];

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
    leaves.push({ a, len, front: Math.sin(a) + h2(i, 3, o.seed) * 0.3 });
  }
  leaves.sort((p, q) => p.front - q.front);
  leaves.forEach((lf, i) => {
    const sx = x + Math.cos(lf.a) * lf.len * 0.15;
    const sy = y + Math.sin(lf.a) * lf.len * 0.15;
    const tone = Math.max(0, Math.min(1, o.tone + (lf.front + 0.4) * 0.18 + (h2(i, 4, o.seed) - 0.5) * 0.15));
    for (let t = 0; t < 1; t += 0.25) L.px(Math.round(x + (sx - x) * t), Math.round(y + (sy - y) * t), rk(o.ramp ?? LEAF, 2 + tone * 2));
    leaf(L, sx, sy, lf.a, lf.len, lf.len * (o.shape === 'lance' ? 0.32 : 0.52), { tone, seed: o.seed * 13 + i, shape: o.shape, notch: o.notch && i % 2 === 0, ramp: o.ramp });
  });
}

/** A fern: arching fronds, each a rib with little leaflets alternating along it. */
export function fern(L: Layer, x: number, y: number, o: { seed: number; size: number; tone: number; n?: number; ramp?: Ramp; dir?: number }): void {
  const r = o.ramp ?? LEAF;
  const n = o.n ?? 6;
  const dir = o.dir ?? 0;
  const fronds: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) fronds.push([-Math.PI / 2 + dir + ((i + 0.5) / n - 0.5) * 2.8 + (h2(i, 1, o.seed) - 0.5) * 0.3, o.size * (0.75 + h2(i, 2, o.seed) * 0.4)]);
  fronds.sort((p, q) => Math.sin(p[0]) - Math.sin(q[0]));
  for (const [a, len] of fronds) {
    const tone = o.tone + Math.sin(a) * 0.15 + 0.1;
    const steps = Math.ceil(len * 1.5);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x + Math.cos(a) * len * t;
      const py = y + Math.sin(a) * len * t + len * 0.45 * t * t * Math.abs(Math.cos(a)) + len * 0.15 * t * t;
      const k = 2 + tone * 3.5 + (1 - t) * 0.5;
      L.px(Math.round(px), Math.round(py), rk(r, k - 0.8));
      if (s % 2 === 0 && t > 0.08 && t < 0.97) {
        const ll = Math.max(1, Math.round((1 - t) * len * 0.2 + 1));
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
  }
}

/** A flowering bush: a lobed clump of small leaves dotted with flowers. */
function floweringBush(L: Layer, x: number, y: number, rx: number, ry: number, seed: number, tone: number, cols: readonly string[] | null): void {
  clump(L, x, y - ry * 0.8, rx, ry, { seed, tone });
  if (!cols) return;
  const n = Math.round(rx * ry * 0.09);
  for (let i = 0; i < n; i++) {
    const fx = Math.round(x - rx * 0.8 + h2(i, 1, seed) * rx * 1.6);
    const fy = Math.round(y - ry * 1.6 + h2(i, 2, seed) * ry * 1.3);
    if (!L.a(fx, fy) || !L.a(fx + 1, fy + 1)) continue;
    const f = FLOWERS[Math.floor(h2(i, 3, seed) * FLOWERS.length) % FLOWERS.length];
    const c = cols[i % cols.length];
    L.px(fx, fy, c);
    L.px(fx + 1, fy, f[0]);
    L.px(fx, fy - 1, f[2]);
  }
}

/** A tree: a short trunk flaring into roots and a big lobed crown on top. */
export function tree(L: Layer, x: number, y: number, o: { seed: number; r: number; tone: number; trunk: number; ramp?: Ramp }): void {
  const tw = Math.max(2, Math.round(o.r * 0.2));
  for (let yy = y - o.trunk; yy <= y; yy++) {
    const flare = yy > y - 3 ? yy - (y - 3) : 0;
    for (let xx = x - tw - flare; xx <= x + tw + flare; xx++) {
      const t = (xx - (x - tw - flare)) / Math.max(1, 2 * (tw + flare));
      const ridge = (xx + Math.floor(h2(xx, Math.floor(yy / 4), o.seed) * 3)) % 3 === 0;
      L.px(xx, yy, rk(BARK, 3.8 - t * 3 - (ridge ? 0.8 : 0)));
    }
  }
  clump(L, x, y - o.trunk - o.r * 0.6, o.r, o.r * 0.82, { seed: o.seed, tone: o.tone, ramp: o.ramp ?? LEAF, lobes: Math.max(5, Math.round(o.r / 3)) });
}

// ------------------------------------------------------------------ the hub's greenery

/** Dark tree crowns past the roof's ends, at the top corners (sorted behind the shop). */
export function canopy(out: HubOut): void {
  const L = new Layer(-10, -12, 276, 104);
  const crowns: Array<[number, number, number, number]> = [
    [2, 6, 18, 0.12], [14, 34, 16, 0.2], [4, 60, 15, 0.26], [24, 8, 12, 0.16],
    [254, 6, 18, 0.12], [242, 34, 16, 0.2], [252, 60, 15, 0.26], [232, 8, 12, 0.16],
  ];
  crowns.sort((p, q) => p[1] - q[1]);
  crowns.forEach(([x, y, r, tone], i) => clump(L, x, y, r, r * 0.8, { seed: 520 + i, tone, ramp: DEEP, lobes: 7 }));
  out.piece(L, 'canopy', 60, null);
}

type Kind = 'leafy' | 'fern' | 'bush' | 'flowers' | 'monstera' | 'banana' | 'elephant' | 'tree';

/** One plant as its own y-sorted piece. `lean` tips its leaves toward the court (-1 left side, 1 right). */
export function plant(out: HubOut, id: string, x: number, y: number, kind: Kind, size: number, tone: number, seed: number, lean: number, block = false): void {
  const tall = kind === 'tree' ? 2.8 : 1.8;
  const pad = size * 1.9 + 8;
  const L = new Layer(x - pad, y - pad * tall, pad * 2, pad * tall + 6);
  const dir = -Math.PI / 2 + lean * 0.5;
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
      fern(L, x, y, { seed, size, tone, n: 7, dir: lean * 0.3 });
      break;
    case 'bush':
      floweringBush(L, x, y, size, size * 0.8, seed, tone, null);
      break;
    case 'flowers':
      floweringBush(L, x, y, size, size * 0.8, seed, tone, FLOWERS[seed % FLOWERS.length]);
      break;
    case 'tree':
      tree(L, x, y, { seed, r: size, tone, trunk: 10 });
      break;
  }
  out.piece(L, id, y, block ? { x0: x - size * 0.4, y0: y - 5, x1: x + size * 0.4, y1: y } : null);
  if (kind === 'bush' || kind === 'flowers' || kind === 'tree') out.shadows.push({ kind: 'oval', x: x + 2, y: y + 1, rx: size * 0.6, ry: 2.4, strength: 0.4 });
}

/**
 * The bank of greenery down both sides of the court (big leaves, ferns, flowering bushes, a small tree
 * each side with a lantern in it), leaning in over the paving's edge, and the planting round the steps
 * below the curb.
 */
export function edgeGreens(out: HubOut): void {
  let n = 0;
  const add = (x: number, y: number, kind: Kind, size: number, tone: number, lean: number) => plant(out, `green${n}`, x, y, kind, size, tone, 700 + n++ * 17, lean);
  const kinds: Kind[] = ['leafy', 'fern', 'monstera', 'flowers', 'banana', 'elephant', 'bush', 'leafy', 'fern'];
  for (const side of [-1, 1]) {
    const X = (x: number) => (side < 0 ? x : 256 - x);
    // Trees at the back, beside the shop's corners.
    add(X(8), 92, 'tree', 15, 0.38, 0);
    // The outer rank: big plants, back to front.
    let i = side < 0 ? 0 : 3;
    for (let y = 84; y < 300; y += 13 + Math.floor(h2(i, 1, 33) * 6)) {
      const k = kinds[i % kinds.length];
      const x = 4 + h2(i, 2, side + 40) * 16;
      const size = k === 'bush' || k === 'flowers' ? 8 + h2(i, 3, 41) * 3 : k === 'fern' ? 10 + h2(i, 3, 42) * 3 : 11 + h2(i, 3, 43) * 4;
      add(X(x), y, k, size, 0.4 + h2(i, 4, 44) * 0.3, -side);
      i++;
    }
    // The middle rank, between the outer bank and the court's edge.
    for (let y = 150; y < 240; y += 17 + Math.floor(h2(i, 5, 45) * 8)) {
      const k: Kind = (['fern', 'elephant', 'flowers', 'leafy'] as const)[i % 4];
      add(X(26 + h2(i, 6, 46) * 6), y, k, k === 'flowers' ? 7 + h2(i, 7, 47) * 2 : 9 + h2(i, 7, 47) * 3, 0.5 + h2(i, 8, 48) * 0.2, -side);
      i++;
    }
  }
  // Below the curb, out toward the corners: banks of bushes, ferns and big leaves going dark (the
  // bed by the steps is stepsGarden's).
  for (const side of [-1, 1]) {
    const X = (x: number) => (side < 0 ? x : 256 - x);
    let j = side < 0 ? 0 : 5;
    for (let y = 262; y < 346; y += 12) {
      const reach = y < 300 ? 58 : 92;
      for (let x = 6 + (j % 2) * 9; x < reach; x += 16 + Math.floor(h2(j, x, 49) * 8)) {
        const k = kinds[(j * 3 + Math.floor(x / 16)) % kinds.length];
        const size = k === 'bush' || k === 'flowers' ? 8 + h2(j, x, 50) * 3 : 10 + h2(j, x, 51) * 5;
        add(X(x + h2(j, x, 52) * 5), y + Math.floor(h2(j, x, 53) * 5), k, size, 0.3 + h2(j, x, 54) * 0.3 - (y - 262) / 300, -side * 0.5);
      }
      j++;
    }
  }
}

/**
 * The bed either side of the head of the steps, lit by the lanterns on the step posts: flowering
 * bushes (pink, red, yellow), ferns and big leaves leaning over the curb, a lantern among them; then
 * darker plants going down beside the steps. `landing`: the warden's stone landing, kept clear.
 */
export function stepsGarden(out: HubOut, sx0: number, sx1: number, curb: number, landing: { x0: number; x1: number; y1: number }): void {
  let n = 0;
  const add = (x: number, y: number, kind: Kind, size: number, tone: number, lean: number, seed?: number) => plant(out, `bed${n}`, x, y, kind, size, tone, seed ?? 1300 + n++ * 31, lean);
  // Left of the steps: at the curb, then going down.
  add(sx0 - 40, curb + 9, 'fern', 10, 0.72, 0.4);
  add(sx0 - 22, curb + 12, 'flowers', 8, 0.78, 0.3, 1301);
  add(sx0 - 54, curb + 14, 'leafy', 11, 0.62, 0.6);
  add(sx0 - 10, curb + 26, 'elephant', 10, 0.55, 0.6);
  add(sx0 - 34, curb + 30, 'flowers', 9, 0.6, 0.4, 1304);
  add(sx0 - 8, curb + 46, 'leafy', 11, 0.42, 0.6);
  add(sx0 - 30, curb + 50, 'monstera', 12, 0.4, 0.4);
  // Right: beside the landing, then below it.
  add(landing.x1 + 12, curb + 10, 'flowers', 8, 0.78, -0.3, 1302);
  add(landing.x1 + 30, curb + 13, 'fern', 10, 0.66, -0.5);
  add(landing.x0 + 4, landing.y1 + 14, 'elephant', 10, 0.55, -0.6);
  add(landing.x1 + 4, landing.y1 + 18, 'flowers', 9, 0.6, -0.4, 1303);
  add(sx1 + 10, curb + 48, 'leafy', 11, 0.42, -0.6);
  add(landing.x1 + 22, curb + 50, 'monstera', 12, 0.4, -0.4);
  // Low ferns and leaves filling the bed between them, darker going down.
  for (let y = curb + 16; y < curb + 100; y += 9) {
    for (let x = 30 + ((y / 9) % 2) * 6; x < 230; x += 13) {
      const jx = x + Math.floor(h2(x, y, 1305) * 6) - 3;
      if (jx > sx0 - 8 && jx < sx1 + 8) continue;
      if (jx > landing.x0 - 4 && jx < landing.x1 + 2 && y < landing.y1 + 10) continue;
      const k: Kind = h2(x, y, 1306) < 0.55 ? 'fern' : h2(x, y, 1307) < 0.5 ? 'elephant' : 'bush';
      const depth = (y - curb) / 100;
      plant(out, `bedFill${n++}`, jx, y + Math.floor(h2(x, y, 1308) * 4), k, 6 + h2(x, y, 1309) * 3, 0.52 - depth * 0.35 + h2(x, y, 1310) * 0.1, 1400 + n * 7, jx < 128 ? 0.4 : -0.4);
    }
  }
  // A lantern on a short stake among the left bed's flowers.
  const L = new Layer(sx0 - 33, curb + 2, 9, 20);
  const lx = sx0 - 29;
  for (let y = curb + 9; y < curb + 20; y++) {
    L.px(lx, y, '#3a3a44');
    L.px(lx + 1, y, '#22222a');
  }
  L.rect(lx - 1, curb + 2, 4, 1, '#e0b040');
  for (let y = curb + 3; y < curb + 8; y++) for (let x = lx - 1; x <= lx + 2; x++) L.gl(x, y, x === lx - 1 || x === lx + 2 ? '#c8862a' : y < curb + 5 ? '#fff2c0' : '#ffc860');
  L.rect(lx - 1, curb + 8, 4, 1, '#8a5a1a');
  for (const [dx, dy] of [[-2, 4], [3, 4], [-2, 6], [3, 6], [0, 9], [1, 1]] as const) L.halo(lx + dx, curb + dy, '#ffb850', 0.3);
  L.outlineTinted(0.7);
  L.light(lx, curb + 6, 40, '#ffb458', 0.5, 0.3);
  out.piece(L, 'bedLantern', curb + 20, null);
}

/**
 * Lush plants right at the court's edges, leaning in over the paving (on a phone held upright they
 * frame the screen's sides), lit warm by lanterns hung among them; the brightest greens in the hub.
 */
export function courtGreens(out: HubOut): void {
  let n = 0;
  const add = (x: number, y: number, kind: Kind, size: number, tone: number, lean: number) => plant(out, `court${n}`, x, y, kind, size, tone, 900 + n++ * 23, lean);
  // Left edge, top to bottom.
  add(50, 172, 'leafy', 12, 0.75, 1);
  add(54, 212, 'flowers', 9, 0.72, 1);
  add(42, 226, 'monstera', 11, 0.62, 1);
  // Right edge.
  add(207, 164, 'monstera', 12, 0.75, -1);
  add(206, 214, 'flowers', 9, 0.72, -1);
  add(216, 230, 'leafy', 11, 0.62, -1);
  // Lanterns hung in them.
  hangingLantern(out, 41, 148, 'courtLanternL');
  hangingLantern(out, 216, 140, 'courtLanternR');
}

/** A lantern hanging from a branch: a short chain, the glowing box. */
export function hangingLantern(out: HubOut, x: number, y: number, id: string): void {
  const L = new Layer(x - 5, y - 6, 11, 16);
  for (let yy = y - 5; yy < y; yy++) L.px(x, yy, yy % 2 ? '#3a3a44' : '#5a5a66');
  L.rect(x - 1, y, 3, 1, '#e0b040');
  L.rect(x - 2, y + 1, 5, 1, '#8a5a1a');
  for (let yy = y + 2; yy < y + 6; yy++) {
    for (let xx = x - 2; xx <= x + 2; xx++) {
      if (xx === x - 2 || xx === x + 2) L.px(xx, yy, '#363644');
      else L.gl(xx, yy, yy < y + 3 ? '#fff2c0' : xx === x - 1 ? '#ffe090' : '#ffc860');
    }
  }
  L.rect(x - 2, y + 6, 5, 1, '#8a5a1a');
  for (const [dx, dy] of [[-3, 3], [3, 3], [-3, 4], [3, 4], [0, 7]] as const) L.halo(x + dx, y + dy, '#ffb850', 0.3);
  L.outlineTinted(0.7);
  L.light(x, y + 4, 40, '#ffae4c', 0.42, 0.3);
  out.piece(L, id, y + 30, null);
}

/** Huge glossy leaves over the bottom corners and the lowest edges: drawn over everything. */
export function frontLeaves(out: HubOut): void {
  const L = new Layer(-16, 250, 288, 100);
  const left: Array<[number, number, number, number, number]> = [
    [-4, 340, -0.6, 36, 0.35], [6, 346, -0.95, 32, 0.42], [24, 350, -1.25, 28, 0.4], [-8, 312, -0.25, 30, 0.32],
    [42, 350, -1.45, 24, 0.5], [-6, 286, -0.12, 22, 0.3],
  ];
  const right = left.map(([x, y, a, len, tone]) => [256 - x, y, -Math.PI - a, len, tone] as [number, number, number, number, number]);
  [...left, ...right].sort((p, q) => q[1] - p[1] || p[3] - q[3]).forEach(([x, y, a, len, tone], i) => {
    leaf(L, x, y, a, len, len * 0.5, { tone, seed: 900 + i, notch: i % 3 === 1, droop: 0.08 });
  });
  out.front(L, 'frontLeaves');
}

/**
 * Fireflies resting in the leaves (each a glowing dot with a soft halo), and the spots where the
 * renderer should set more of them drifting.
 */
export function fireflies(out: HubOut): void {
  const spots: Array<[number, number]> = [];
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const y = 70 + h2(i, 1, 61) * 250;
    const x = side < 0 ? 3 + h2(i, 2, 61) * 30 : 253 - h2(i, 2, 61) * 30;
    spots.push([Math.round(x), Math.round(y)]);
  }
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    spots.push([Math.round(side < 0 ? 20 + h2(i, 5, 63) * 70 : 236 - h2(i, 5, 63) * 70), Math.round(268 + h2(i, 6, 63) * 60)]);
  }
  for (let i = 0; i < 4; i++) spots.push([Math.round(4 + h2(i, 3, 62) * 248), Math.round(4 + h2(i, 4, 62) * 40)]);
  const L = new Layer(0, 0, 256, 336);
  for (const [x, y] of spots) {
    const c = h2(x, y, 64) < 0.5 ? '#e8ff8a' : '#c8ff6a';
    L.gl(x, y, '#fbffd8');
    L.twinkles.push({ x, y, r: 2, period: 6, on: 4, phase: Math.floor(h2(x, y, 65) * 6) });
    for (const [dx, dy, a] of [[1, 0, 0.55], [-1, 0, 0.55], [0, 1, 0.55], [0, -1, 0.55], [1, 1, 0.22], [-1, 1, 0.22], [1, -1, 0.22], [-1, -1, 0.22]] as const) L.halo(x + dx, y + dy, c, a);
    out.lights.push({ x, y, r: 9, color: '#c8ff7a', intensity: 0.3 });
  }
  out.glowOf(L, 'fireflies', 1000);
  out.motes.push(
    { x: 18, y: 190, rx: 16, ry: 110, kind: 'firefly', color: '#d8ff7a', count: 5 },
    { x: 238, y: 190, rx: 16, ry: 110, kind: 'firefly', color: '#d8ff7a', count: 5 },
    { x: 54, y: 300, rx: 46, ry: 28, kind: 'firefly', color: '#d8ff7a', count: 4 },
    { x: 202, y: 300, rx: 46, ry: 28, kind: 'firefly', color: '#d8ff7a', count: 4 },
    { x: 128, y: 24, rx: 110, ry: 20, kind: 'firefly', color: '#e8ff9a', count: 3 },
    { x: 128, y: 150, rx: 50, ry: 30, kind: 'mote', color: '#ffe0a0', count: 6 },
  );
}
