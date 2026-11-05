/**
 * Ground decals: the little things painted into a floor's ground when it is baked (terrain.ts):
 * grass tufts, flower clusters, pebbles, fallen leaves, mushrooms, roots, ferns, moss, puddles,
 * cracks, bones, scorch marks, cobwebs, lily pads and lotus. Each is a few pixels drawn through a
 * `DecalCtx`, lit from the top left like everything else, in the biome's colors. Which decals a
 * biome scatters, and where (open ground, paths, along walls and trees, on water), is in DECALS.
 */
import type { BiomeId, Ramp } from '../../world/biomes';
import { hash, mixHex, shade } from './draw';

export type DecalKind =
  | 'tuft' | 'flowers' | 'daisies' | 'pebbles' | 'leaves' | 'mushrooms' | 'glowShrooms' | 'roots' | 'fern' | 'clover' | 'moss'
  | 'puddle' | 'crack' | 'bones' | 'scorch' | 'blood' | 'cobweb' | 'lily' | 'lotus' | 'reedBed' | 'twigs' | 'snowDrift'
  | 'iceCrack' | 'sandRipple' | 'shells' | 'ash' | 'emberCrack' | 'shards' | 'petals' | 'needles' | 'rubble' | 'hay';

export interface DecalCtx {
  /** Paints one pixel (ignored off the floor or where the decal may not go). */
  put(x: number, y: number, hex: string): void;
  /** Darkens the pixel already there (0..1). */
  dark(x: number, y: number, f: number): void;
  /** The biome's ground ramp, dark to light. */
  ground: Ramp;
  /** Flower colors. */
  accent: Ramp;
  /** Stone tones, dark to light. */
  stone: Ramp;
  /** Something that glows here (glowing mushrooms, ember cracks): becomes a light. */
  glow(x: number, y: number, color: string, r: number): void;
}

const LEAF_DARK = '#1c3a1e';
const LEAF = '#2e5a2c';
const AUTUMN = ['#c8642a', '#e09a3a', '#a8442a', '#d8b850', '#8a5a2a'];

/** Where a biome scatters what, and how much (decals per 100 tiles of each kind of place). */
export interface DecalTable {
  ground: Array<[DecalKind, number]>;
  path: Array<[DecalKind, number]>;
  /** Floor beside walls and trees. */
  edge: Array<[DecalKind, number]>;
  water: Array<[DecalKind, number]>;
  density: { ground: number; path: number; edge: number; water: number };
}

export const DECALS: Record<BiomeId, DecalTable> = {
  hamlet: {
    ground: [['tuft', 9], ['flowers', 8], ['daisies', 6], ['clover', 3], ['pebbles', 2], ['leaves', 1], ['mushrooms', 1]],
    path: [['pebbles', 3], ['tuft', 3], ['puddle', 1], ['crack', 1], ['leaves', 1]],
    edge: [['flowers', 8], ['fern', 4], ['roots', 3], ['tuft', 4], ['mushrooms', 1], ['daisies', 4]],
    water: [['lily', 5], ['lotus', 2], ['reedBed', 2]],
    density: { ground: 48, path: 12, edge: 65, water: 30 },
  },
  farmland: {
    ground: [['tuft', 10], ['daisies', 4], ['flowers', 3], ['clover', 3], ['hay', 3], ['pebbles', 2]],
    path: [['pebbles', 3], ['hay', 2], ['tuft', 2], ['puddle', 1]],
    edge: [['flowers', 4], ['fern', 2], ['roots', 3], ['tuft', 5], ['leaves', 2]],
    water: [['lily', 5], ['lotus', 1], ['reedBed', 2]],
    density: { ground: 26, path: 10, edge: 40, water: 20 },
  },
  forest: {
    ground: [['leaves', 6], ['fern', 5], ['tuft', 5], ['moss', 4], ['mushrooms', 3], ['glowShrooms', 2], ['twigs', 3], ['pebbles', 2], ['roots', 2]],
    path: [['leaves', 5], ['twigs', 3], ['pebbles', 2], ['roots', 2], ['puddle', 1]],
    edge: [['fern', 8], ['roots', 7], ['moss', 4], ['mushrooms', 3], ['glowShrooms', 3], ['leaves', 4]],
    water: [['lily', 6], ['lotus', 2], ['reedBed', 1]],
    density: { ground: 42, path: 16, edge: 60, water: 24 },
  },
  tundra: {
    ground: [['snowDrift', 6], ['pebbles', 3], ['iceCrack', 2], ['twigs', 2], ['needles', 2]],
    path: [['iceCrack', 4], ['snowDrift', 2], ['pebbles', 1]],
    edge: [['snowDrift', 6], ['pebbles', 3], ['roots', 2], ['needles', 3]],
    water: [['iceCrack', 3]],
    density: { ground: 22, path: 12, edge: 40, water: 10 },
  },
  crypt: {
    ground: [['crack', 6], ['bones', 3], ['rubble', 4], ['moss', 3], ['blood', 1], ['cobweb', 1]],
    path: [['crack', 5], ['rubble', 2], ['moss', 2], ['bones', 1]],
    edge: [['cobweb', 5], ['rubble', 5], ['bones', 3], ['moss', 4], ['crack', 2]],
    water: [],
    density: { ground: 26, path: 18, edge: 50, water: 0 },
  },
  swamp: {
    ground: [['moss', 5], ['puddle', 4], ['mushrooms', 3], ['glowShrooms', 3], ['twigs', 3], ['tuft', 4], ['roots', 2]],
    path: [['moss', 3], ['tuft', 3], ['puddle', 2], ['twigs', 2]],
    edge: [['roots', 6], ['fern', 4], ['glowShrooms', 4], ['mushrooms', 3], ['moss', 4]],
    water: [['lily', 8], ['lotus', 2], ['reedBed', 5]],
    density: { ground: 36, path: 14, edge: 55, water: 32 },
  },
  desert: {
    ground: [['sandRipple', 6], ['pebbles', 4], ['bones', 2], ['shells', 2], ['crack', 2], ['rubble', 2]],
    path: [['crack', 4], ['sandRipple', 3], ['rubble', 2], ['pebbles', 2]],
    edge: [['rubble', 6], ['pebbles', 4], ['bones', 2], ['sandRipple', 2]],
    water: [['lily', 4], ['reedBed', 3]],
    density: { ground: 22, path: 16, edge: 40, water: 16 },
  },
  graveyard: {
    ground: [['tuft', 6], ['leaves', 5], ['bones', 2], ['mushrooms', 2], ['glowShrooms', 2], ['twigs', 4], ['pebbles', 2], ['moss', 2]],
    path: [['leaves', 4], ['twigs', 3], ['crack', 2], ['pebbles', 2]],
    edge: [['roots', 5], ['leaves', 5], ['bones', 2], ['glowShrooms', 3], ['cobweb', 2], ['fern', 2]],
    water: [],
    density: { ground: 32, path: 14, edge: 50, water: 0 },
  },
  ember: {
    ground: [['emberCrack', 5], ['ash', 5], ['scorch', 3], ['rubble', 3], ['bones', 2], ['crack', 2]],
    path: [['crack', 4], ['ash', 3], ['emberCrack', 2], ['scorch', 2]],
    edge: [['rubble', 6], ['emberCrack', 4], ['ash', 3], ['bones', 2]],
    water: [],
    density: { ground: 30, path: 16, edge: 46, water: 0 },
  },
  crystal: {
    ground: [['shards', 6], ['pebbles', 3], ['glowShrooms', 4], ['moss', 2], ['crack', 2]],
    path: [['shards', 3], ['crack', 3], ['pebbles', 2]],
    edge: [['shards', 7], ['glowShrooms', 5], ['rubble', 3], ['moss', 2]],
    water: [['lily', 2]],
    density: { ground: 30, path: 12, edge: 52, water: 8 },
  },
  shrine: {
    ground: [['petals', 7], ['moss', 4], ['tuft', 4], ['flowers', 3], ['pebbles', 2], ['fern', 2]],
    path: [['petals', 5], ['moss', 3], ['crack', 1]],
    edge: [['fern', 5], ['moss', 5], ['petals', 5], ['flowers', 3], ['roots', 2]],
    water: [['lily', 6], ['lotus', 4]],
    density: { ground: 34, path: 16, edge: 52, water: 30 },
  },
};

/** Draws one decal with its anchor at (x, y). */
export function drawDecal(kind: DecalKind, c: DecalCtx, x: number, y: number, seed: number): void {
  const r = (i: number) => hash(seed, i);
  const g = c.ground;
  switch (kind) {
    case 'tuft': {
      // A tall clump of blades: lit tips, darker roots and a shadow on the ground under it.
      const blades = 3 + Math.floor(r(1) * 3);
      for (let i = 0; i < blades; i++) {
        const bx = x + i * 2 - blades + Math.round(r(i + 2) - 0.5);
        const h = 2 + Math.floor(r(i + 9) * 3);
        for (let k = 0; k < h; k++) c.put(bx + (k === h - 1 && i % 2 ? 1 : 0), y - k, k === h - 1 ? g[4] : k === 0 ? g[1] : g[3]);
      }
      for (let i = -blades; i <= blades - 1; i++) c.dark(x + i, y + 1, 0.25);
      return;
    }
    case 'flowers':
    case 'daisies': {
      // A leafy clump with flowers in it (one or two colors), each lit on its top-left pixel.
      const n = 4 + Math.floor(r(1) * 5);
      for (let i = 0; i < 13; i++) {
        const lx = x + Math.round((r(i + 20) - 0.5) * 11);
        const ly = y + Math.round((r(i + 30) - 0.5) * 5);
        c.put(lx, ly, i % 3 ? LEAF : LEAF_DARK);
        c.put(lx + 1, ly, LEAF_DARK);
      }
      const cols = kind === 'daisies' ? ['#f4f0e0', '#f4f0e0', '#f0d860'] : c.accent;
      const a = Math.floor(r(2) * cols.length);
      for (let i = 0; i < n; i++) {
        const fx = x + Math.round((r(i + 40) - 0.5) * 10);
        const fy = y - 1 + Math.round((r(i + 50) - 0.5) * 5);
        const col = cols[(a + (i % 2 && r(3) < 0.5 ? 1 : 0)) % cols.length];
        if (kind === 'daisies') {
          c.put(fx, fy, col);
          c.put(fx + 1, fy, shade(col, -0.12));
          c.put(fx, fy + 1, shade(col, -0.2));
          c.put(fx + 1, fy + 1, '#e8b830');
        } else {
          c.put(fx, fy, mixHex(col, '#ffffff', 0.35));
          c.put(fx + 1, fy, col);
          c.put(fx, fy + 1, col);
          c.put(fx + 1, fy + 1, shade(col, -0.35));
        }
      }
      return;
    }
    case 'clover': {
      for (let i = 0; i < 5; i++) {
        const lx = x + Math.round((r(i) - 0.5) * 8);
        const ly = y + Math.round((r(i + 7) - 0.5) * 4);
        c.put(lx, ly, g[3]);
        c.put(lx + 1, ly, g[2]);
        c.put(lx, ly + 1, g[1]);
      }
      return;
    }
    case 'pebbles': {
      const n = 2 + Math.floor(r(1) * 3);
      for (let i = 0; i < n; i++) {
        const px = x + Math.round((r(i + 2) - 0.5) * 9);
        const py = y + Math.round((r(i + 8) - 0.5) * 5);
        const big = r(i + 14) < 0.4;
        c.put(px, py, c.stone[3]);
        c.put(px + 1, py, c.stone[2]);
        if (big) {
          c.put(px, py + 1, c.stone[2]);
          c.put(px + 1, py + 1, c.stone[1]);
          c.put(px + 2, py + 1, c.stone[1]);
          c.dark(px + 1, py + 2, 0.3);
          c.dark(px + 2, py + 2, 0.3);
        } else c.dark(px + 1, py + 1, 0.3);
      }
      return;
    }
    case 'leaves':
    case 'petals':
    case 'needles': {
      // Fallen leaves (petals, pine needles): little two-pixel flecks, some curled.
      const n = 5 + Math.floor(r(1) * 6);
      const cols = kind === 'petals' ? ['#f4b8cc', '#e88aa8', '#fcd8e4'] : kind === 'needles' ? ['#6a4a2a', '#8a6236', '#4a3420'] : AUTUMN;
      for (let i = 0; i < n; i++) {
        const lx = x + Math.round((r(i + 2) - 0.5) * 14);
        const ly = y + Math.round((r(i + 20) - 0.5) * 8);
        const col = cols[Math.floor(r(i + 40) * cols.length)];
        c.put(lx, ly, col);
        if (kind === 'needles') c.put(lx + 1, ly + 1, col);
        else c.put(lx + (r(i + 60) < 0.5 ? 1 : 0), ly + (r(i + 60) < 0.5 ? 0 : 1), shade(col, -0.25));
      }
      return;
    }
    case 'mushrooms':
    case 'glowShrooms': {
      const glowing = kind === 'glowShrooms';
      const cap = glowing ? (r(9) < 0.5 ? ['#2a8a8a', '#5ad8c8', '#c8fff0'] : ['#5a3a9a', '#a87ae8', '#ecd8ff']) : r(9) < 0.5 ? ['#7a1a14', '#c8322a', '#f4e8d8'] : ['#5a3a20', '#9a6a3a', '#e0c49a'];
      const n = 2 + Math.floor(r(1) * 3);
      for (let i = 0; i < n; i++) {
        const mx = x + i * 3 - n + Math.round(r(i + 2) - 0.5);
        const my = y + Math.round((r(i + 5) - 0.5) * 3);
        const tall = r(i + 11) < 0.4 ? 1 : 0;
        c.put(mx, my, '#e8dcc0');
        if (tall) c.put(mx, my - 1, '#d8ccb0');
        c.put(mx - 1, my - 1 - tall, cap[1]);
        c.put(mx, my - 1 - tall, cap[1]);
        c.put(mx + 1, my - 1 - tall, cap[0]);
        c.put(mx, my - 2 - tall, cap[2]);
        c.put(mx - 1, my - 2 - tall, cap[1]);
        c.dark(mx + 1, my + 1, 0.3);
      }
      if (glowing) c.glow(x, y - 2, cap[1], 20);
      return;
    }
    case 'roots': {
      // Roots snaking out from the trees over the ground, lit on top.
      const dir = r(1) < 0.5 ? -1 : 1;
      const len = 6 + Math.floor(r(2) * 8);
      let ry = y;
      for (let i = 0; i < len; i++) {
        const rx = x + i * dir;
        if (r(i + 10) < 0.3) ry += r(i + 30) < 0.5 ? -1 : 1;
        c.put(rx, ry, '#6a4a2e');
        c.put(rx, ry - 1, '#8a6a42');
        c.dark(rx, ry + 1, 0.35);
        if (i === Math.floor(len / 2)) {
          c.put(rx, ry + 2, '#5a3e26');
          c.put(rx + dir, ry + 3, '#5a3e26');
        }
      }
      return;
    }
    case 'fern': {
      // A fern lying open: fronds fanning from the middle, light tips.
      const fronds = 5 + Math.floor(r(1) * 3);
      for (let f = 0; f < fronds; f++) {
        const a = Math.PI * (1.05 + (f / (fronds - 1)) * 0.9);
        const len = 4 + Math.floor(r(f + 3) * 3);
        for (let k = 1; k <= len; k++) {
          const fx = Math.round(x + Math.cos(a) * k * 1.3);
          const fy = Math.round(y + Math.sin(a) * k * 0.8);
          c.put(fx, fy, k === len ? '#8ac05a' : k > len / 2 ? '#4e8a36' : '#2e5e26');
          if (k % 2 === 0) c.put(fx, fy + 1, '#24461e');
        }
      }
      c.dark(x, y + 1, 0.3);
      return;
    }
    case 'moss': {
      for (let i = 0; i < 10; i++) {
        const mx = x + Math.round((r(i) - 0.5) * 10);
        const my = y + Math.round((r(i + 20) - 0.5) * 5);
        c.put(mx, my, i % 4 === 0 ? '#7aa83e' : i % 2 ? '#3e6a2a' : '#4e7e30');
      }
      return;
    }
    case 'puddle': {
      const w = 4 + Math.floor(r(1) * 4);
      for (let dx = -w; dx <= w; dx++) {
        const hh = Math.round(Math.sqrt(1 - (dx / (w + 0.5)) ** 2) * 2);
        for (let dy = -hh; dy <= hh; dy++) c.put(x + dx, y + dy, dy === -hh ? '#5a6a7a' : dx < 0 && dy < 0 ? '#8aa0b4' : '#4a5a6a');
      }
      c.put(x - 1, y - 1, '#c8dcec');
      c.put(x, y - 1, '#a8c0d4');
      return;
    }
    case 'crack':
    case 'iceCrack':
    case 'emberCrack': {
      const col = kind === 'iceCrack' ? '#e8f4ff' : kind === 'emberCrack' ? '#ff8a2a' : shade(c.stone[0], -0.3);
      let cx = x;
      let cy = y;
      const len = 6 + Math.floor(r(1) * 8);
      for (let i = 0; i < len; i++) {
        cx += r(i + 3) < 0.6 ? 1 : 0;
        cy += r(i + 3) >= 0.6 ? 1 : r(i + 9) < 0.3 ? -1 : 0;
        c.put(cx, cy, col);
        if (kind === 'emberCrack') c.put(cx, cy + 1, '#8a1a0a');
        if (i === 3) {
          c.put(cx + 1, cy + 1, col);
          c.put(cx + 2, cy + 2, col);
        }
      }
      if (kind === 'emberCrack') c.glow(x + 3, y + 2, '#ff6a1a', 22);
      return;
    }
    case 'bones': {
      const bone = ['#8a8270', '#c8c0a8', '#ece4cc'];
      c.put(x - 2, y, bone[2]);
      c.put(x - 1, y, bone[1]);
      c.put(x, y, bone[1]);
      c.put(x + 1, y, bone[1]);
      c.put(x + 2, y, bone[2]);
      c.put(x - 2, y + 1, bone[1]);
      c.put(x + 2, y - 1, bone[1]);
      c.dark(x, y + 1, 0.3);
      if (r(1) < 0.5) {
        // A skull beside it.
        c.put(x + 4, y - 1, bone[2]);
        c.put(x + 5, y - 1, bone[1]);
        c.put(x + 4, y, '#2a2018');
        c.put(x + 5, y, bone[1]);
        c.dark(x + 5, y + 1, 0.3);
      }
      return;
    }
    case 'scorch':
    case 'ash': {
      const rad = kind === 'scorch' ? 5 : 3;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad * 2; dx <= rad * 2; dx++) {
        const d = (dx / (rad * 2)) ** 2 + (dy / rad) ** 2;
        if (d > 1 || hash(seed, dx, dy) > 1.2 - d) continue;
        if (kind === 'scorch') c.dark(x + dx, y + dy, 0.45);
        else c.put(x + dx, y + dy, d < 0.3 ? '#5a5050' : '#3a3434');
      }
      return;
    }
    case 'blood': {
      for (let i = 0; i < 7; i++) c.put(x + Math.round((r(i) - 0.5) * 8), y + Math.round((r(i + 9) - 0.5) * 4), i % 2 ? '#5a1010' : '#7a1a14');
      return;
    }
    case 'cobweb': {
      // A web in a corner: spokes and two sagging threads.
      const col = '#d8d8e0';
      for (let k = 0; k < 7; k++) {
        c.put(x + k, y, k % 2 ? col : '#a8a8b4');
        c.put(x, y + k, k % 2 ? col : '#a8a8b4');
        if (k < 6) c.put(x + k, y + k, '#b8b8c4');
      }
      for (let k = 0; k < 5; k++) c.put(x + 3 + Math.floor(k / 2), y + 1 + k, '#9a9aa8');
      for (let k = 0; k < 4; k++) c.put(x + 1 + k, y + 4 - Math.floor(k / 2), '#9a9aa8');
      return;
    }
    case 'lily':
    case 'lotus': {
      // A lily pad: a round leaf with its notch, lit rim; a lotus flower on some.
      const w = 3 + Math.floor(r(1) * 2);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -w; dx <= w; dx++) {
        if ((dx / (w + 0.5)) ** 2 + (dy / 2.5) ** 2 > 1) continue;
        if (dx >= 0 && dx <= 2 && dy === 0) continue;
        c.put(x + dx, y + dy, dy < 0 && dx < 0 ? '#6aaa3e' : dy > 0 ? '#2e6a2a' : '#4a8a34');
      }
      c.dark(x + 1, y + 3, 0.3);
      if (kind === 'lotus') {
        c.put(x - 1, y - 2, '#fce0ec');
        c.put(x, y - 3, '#f4a8c8');
        c.put(x + 1, y - 2, '#e888b0');
        c.put(x, y - 2, '#fff0d0');
        c.put(x - 1, y - 1, '#e888b0');
        c.put(x + 1, y - 1, '#c8608a');
      }
      return;
    }
    case 'reedBed': {
      for (let i = 0; i < 6; i++) {
        const rx = x + i * 2 - 6;
        const h = 4 + Math.floor(r(i) * 5);
        for (let k = 0; k < h; k++) c.put(rx + (k > h - 2 && i % 2 ? 1 : 0), y - k, k === h - 1 ? '#8ab050' : '#4a7a2a');
        if (i % 2 === 0) {
          c.put(rx, y - h, '#6a4024');
          c.put(rx, y - h - 1, '#8a5a30');
        }
      }
      return;
    }
    case 'twigs': {
      for (let i = 0; i < 3; i++) {
        const tx = x + Math.round((r(i) - 0.5) * 10);
        const ty = y + Math.round((r(i + 5) - 0.5) * 6);
        const len = 3 + Math.floor(r(i + 9) * 4);
        for (let k = 0; k < len; k++) c.put(tx + k, ty + (i % 2 ? Math.floor(k / 2) : -Math.floor(k / 3)), k === 0 ? '#8a6a42' : '#5a4028');
      }
      return;
    }
    case 'snowDrift': {
      const w = 5 + Math.floor(r(1) * 5);
      for (let dx = -w; dx <= w; dx++) {
        const hh = Math.round((1 - Math.abs(dx) / (w + 1)) * 2.4);
        for (let dy = 0; dy <= hh; dy++) c.put(x + dx, y - dy, dy === hh ? '#ffffff' : '#e4eef8');
        c.dark(x + dx + 1, y + 1, 0.12);
      }
      return;
    }
    case 'sandRipple': {
      for (let k = 0; k < 3; k++) for (let dx = 0; dx < 10; dx++) {
        const yy = y + k * 3 + Math.round(Math.sin((dx + k * 2) * 0.6) * 1);
        c.put(x + dx, yy, shade(c.ground[3], 0.08));
        c.dark(x + dx, yy + 1, 0.12);
      }
      return;
    }
    case 'shells': {
      c.put(x, y, '#f0e0c8');
      c.put(x + 1, y, '#d8b898');
      c.put(x, y + 1, '#c89878');
      c.put(x + 4, y + 2, '#e8d0b0');
      c.dark(x + 1, y + 1, 0.3);
      return;
    }
    case 'shards': {
      const cols = ['#7ae8ff', '#c08aff', '#ff8ad8'];
      const col = cols[Math.floor(r(1) * cols.length)];
      for (let i = 0; i < 3; i++) {
        const sx = x + i * 3 - 3;
        const h = 2 + Math.floor(r(i + 2) * 3);
        for (let k = 0; k < h; k++) c.put(sx, y - k, k === h - 1 ? '#ffffff' : col);
        c.put(sx + 1, y, shade(col, -0.35));
      }
      c.glow(x, y - 2, col, 16);
      return;
    }
    case 'rubble': {
      const n = 3 + Math.floor(r(1) * 4);
      for (let i = 0; i < n; i++) {
        const bx = x + Math.round((r(i + 2) - 0.5) * 12);
        const by = y + Math.round((r(i + 9) - 0.5) * 6);
        const w = 1 + Math.floor(r(i + 15) * 3);
        for (let dx = 0; dx <= w; dx++) {
          c.put(bx + dx, by, c.stone[3]);
          c.put(bx + dx, by + 1, c.stone[dx === w ? 1 : 2]);
          c.dark(bx + dx + 1, by + 2, 0.3);
        }
      }
      return;
    }
    case 'hay': {
      for (let i = 0; i < 8; i++) {
        const hx = x + Math.round((r(i) - 0.5) * 12);
        const hy = y + Math.round((r(i + 9) - 0.5) * 5);
        c.put(hx, hy, i % 2 ? '#e6c463' : '#c89e3e');
        c.put(hx + 1, hy + (i % 3 === 0 ? 1 : 0), '#9a7228');
      }
      return;
    }
  }
}
