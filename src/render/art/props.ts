/**
 * Trees and props, painted from shapes in each biome's colors. Trees are built from rounded leaf
 * clumps, each lit from the top left with a few bright leaves on top (the look of the reference
 * village), then inked; the farm's orchard trees carry apples. Some props carry a light (torches,
 * lanterns, braziers, crystals, glowing mushrooms, jack-o'-lanterns) that the lighting pass picks up.
 */
import type { Biome, PropKind, TreeKind } from '../../world/biomes';
import { blank, type PixelBuf } from '../pixel/buf';
import { BODY_ANIMS, BODY_FRAMES } from '../packs/mannequin';
import { ball, hash, inkOutline, line, mixHex, rect, setRGB, shade } from './draw';
import { outlineTinted } from './ink';
import { townArt } from './town';
import { villageArt } from './village';
import { wildArt } from './wild';
import { dungeonPropArt, isDungeonProp } from '../packs/dungeonProps';

export interface PropArt {
  buf: PixelBuf;
  /** The base (where it stands), in sprite pixels. */
  ax: number;
  ay: number;
  /** A light it gives off: offset from the base, color, radius. */
  light?: { dx: number; dy: number; color: string; r: number; flicker: boolean };
  /** A fire to animate on top (torches, braziers): offset from the base. */
  flame?: { dx: number; dy: number; size: number };
  /** Pack props that move (a torch's flame, a banner, a flask): every frame (the first is `buf`), at `fps`. */
  frames?: PixelBuf[];
  fps?: number;
  /** Their flames, frame by frame, drawn again on the light-emitting layer. */
  glow?: PixelBuf[];
}

const BARK = ['#24160e', '#3e2a1a', '#5a3e28', '#7a5838'];
const WOOD = ['#3a2416', '#5e3e24', '#845a36', '#a8784a', '#c89a64'];
const IRON = ['#1e1e24', '#3a3a44', '#5a5a66', '#8a8a96'];
/** Straw: hay bales, wheat, the scarecrow's stuffing and hat. */
const HAY = ['#6a4a1a', '#9a7228', '#c89e3e', '#e6c463', '#f6e09a'];
const APPLES = ['#7a1a14', '#c0321e', '#f0684a'];

function ink(ramp: readonly string[]): string {
  return mixHex(shade(ramp[0], -0.6), '#140c14', 0.5);
}

function clumpTree(ramp: readonly string[], seed: number, w: number, h: number, droop: boolean, fruit?: readonly string[]): PropArt {
  const W = w + 4;
  const H = h + 4;
  const b = blank(W, H);
  const cx = W / 2;
  const ground = H - 2;
  const trunkH = Math.round(h * 0.3);
  // Trunk with a root flare.
  for (let y = ground - trunkH; y <= ground; y++) {
    const half = y > ground - 2 ? 3 : 2;
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) {
      const k = x < cx - 1 ? 2 : x < cx ? 1 : 0;
      setRGB(b, x, y, BARK[k + (y > ground - trunkH + 2 ? 1 : 0)] ?? BARK[3]);
    }
  }
  // Leaf clumps in a dome, back ones first.
  const cy = ground - trunkH - h * 0.32;
  const rx = w * 0.42;
  const ry = h * 0.36;
  const clumps: Array<[number, number, number]> = [];
  const n = 7 + Math.floor(hash(seed, 1) * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(seed, i) * 0.8;
    const d = 0.35 + hash(seed, i, 2) * 0.55;
    clumps.push([cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 3.6 + hash(seed, i, 3) * 2.6]);
  }
  clumps.push([cx, cy - ry * 0.25, 5.5]);
  clumps.sort((p, q) => p[1] - q[1]);
  const leaf = [ramp[0], ramp[1], ramp[2], ramp[3]];
  for (const [x, y, r] of clumps) ball(b, x, y, r, r * 0.9, leaf);
  // Bright leaves catching the light on the top-left of each clump.
  for (const [x, y, r] of clumps) {
    if (x > cx + rx * 0.4 && y > cy) continue;
    const lx = Math.round(x - r * 0.45);
    const ly = Math.round(y - r * 0.6);
    setRGB(b, lx, ly, ramp[4] ?? ramp[3]);
    setRGB(b, lx + 1, ly, ramp[3]);
    setRGB(b, lx + 1, ly - 1, ramp[4] ?? ramp[3]);
  }
  if (fruit) {
    // Apples hanging in the leaves: a 2 x 2 fruit, lit on its top-left pixel.
    clumps.forEach(([x, y, r], i) => {
      if (hash(seed, i, 11) > 0.62) return;
      const ax = Math.round(x + (hash(seed, i, 12) - 0.3) * r);
      const ay = Math.round(y + (hash(seed, i, 13) - 0.2) * r * 0.8);
      setRGB(b, ax, ay, fruit[2]);
      setRGB(b, ax + 1, ay, fruit[1]);
      setRGB(b, ax, ay + 1, fruit[1]);
      setRGB(b, ax + 1, ay + 1, fruit[0]);
    });
  }
  if (droop) {
    // Willow strands hanging from the canopy's edge.
    for (let x = Math.round(cx - rx); x <= Math.round(cx + rx); x += 2) {
      const len = 3 + Math.floor(hash(seed, x, 9) * 6);
      const y0 = Math.round(cy + ry * 0.5);
      for (let y = y0; y < y0 + len; y++) setRGB(b, x, y, (y - y0) % 2 ? ramp[1] : ramp[2]);
    }
  }
  return { buf: inkOutline(b, ink(ramp)), ax: Math.round(cx) + 1, ay: ground + 1 };
}

function pine(ramp: readonly string[], _seed: number, snowy: boolean, h: number): PropArt {
  const W = 22;
  const H = h + 4;
  const b = blank(W, H);
  const cx = W / 2;
  const ground = H - 2;
  rect(b, Math.round(cx - 1), ground - 4, 3, 5, BARK[1]);
  setRGB(b, Math.round(cx - 1), ground - 4, BARK[2]);
  const tiers = 4;
  const top = 2;
  const span = ground - 4 - top;
  for (let t = tiers - 1; t >= 0; t--) {
    const y0 = top + Math.round((t * span) / tiers) - 1;
    const y1 = top + Math.round(((t + 1.4) * span) / tiers);
    for (let y = y0; y <= Math.min(y1, ground - 4); y++) {
      const half = 1 + ((y - y0) / (y1 - y0 + 1)) * (3 + t * 1.8);
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        // Jagged hem along the bottom of each tier.
        if (y === y1 && (x + t) % 2 === 0) continue;
        const rel = (x - cx) / Math.max(1, half);
        let k = rel < -0.3 ? 3 : rel < 0.25 ? 2 : 1;
        if (y >= y1 - 1) k -= 1;
        let col = ramp[Math.max(0, k)];
        if (snowy && (y === y0 || y === y0 + 1) && rel < 0.5) col = y === y0 ? '#f4faff' : '#cfe0ee';
        if (snowy && rel < -0.6 && (y - y0) % 3 === 0) col = '#e8f2fa';
        setRGB(b, x, y, col);
      }
    }
  }
  if (snowy) setRGB(b, Math.round(cx), top - 1, '#ffffff');
  return { buf: inkOutline(b, ink(ramp)), ax: Math.round(cx) + 1, ay: ground + 1 };
}

function deadTree(ramp: readonly string[], seed: number): PropArt {
  const W = 22;
  const H = 28;
  const b = blank(W, H);
  const cx = W / 2;
  const ground = H - 2;
  const bark = [ramp[1], ramp[2], ramp[3], ramp[4] ?? ramp[3]];
  rect(b, Math.round(cx - 1), 8, 3, ground - 7, bark[1]);
  line(b, cx - 1, 8, cx - 1, ground, bark[2]);
  const branches = 4 + Math.floor(hash(seed, 1) * 3);
  for (let i = 0; i < branches; i++) {
    const y = 6 + Math.floor(hash(seed, i, 2) * 12);
    const dir = i % 2 ? 1 : -1;
    const len = 4 + Math.floor(hash(seed, i, 3) * 5);
    line(b, cx, y + 3, cx + dir * len, y - Math.floor(len * 0.6), bark[i % 2 ? 1 : 2]);
    line(b, cx + dir * len, y - Math.floor(len * 0.6), cx + dir * (len + 2), y - Math.floor(len * 0.6) - 2, bark[1]);
  }
  rect(b, Math.round(cx - 3), ground - 1, 7, 2, bark[1]);
  return { buf: inkOutline(b, ink(ramp)), ax: Math.round(cx) + 1, ay: ground + 1 };
}

function giantMushroom(_seed: number, glow: string): PropArt {
  const W = 22;
  const H = 24;
  const b = blank(W, H);
  const cx = W / 2;
  const ground = H - 2;
  rect(b, Math.round(cx - 2), ground - 10, 4, 11, '#d8ccb0');
  line(b, cx + 1, ground - 10, cx + 1, ground, '#a89c80');
  const cap = [shade(glow, -0.6), shade(glow, -0.35), glow, mixHex(glow, '#ffffff', 0.45)];
  ball(b, cx, ground - 12, 9, 5, cap);
  for (let i = 0; i < 5; i++) setRGB(b, cx - 6 + i * 3, ground - 14 + (i % 2) * 2, '#fff4e0');
  rect(b, Math.round(cx - 8), ground - 9, 16, 1, shade(glow, -0.65));
  return { buf: inkOutline(b, ink(cap)), ax: Math.round(cx) + 1, ay: ground + 1, light: { dx: 0, dy: -12, color: glow, r: 44, flicker: false } };
}

function crystalTree(ramp: readonly string[], seed: number): PropArt {
  const W = 20;
  const H = 26;
  const b = blank(W, H);
  const ground = H - 2;
  const spires = 3 + Math.floor(hash(seed, 1) * 3);
  for (let i = 0; i < spires; i++) {
    const x0 = 4 + Math.floor(hash(seed, i) * 12);
    const hgt = 8 + Math.floor(hash(seed, i, 2) * 14);
    const wid = 2 + Math.floor(hash(seed, i, 3) * 2);
    for (let y = ground - hgt; y <= ground; y++) {
      const half = Math.min(wid, Math.floor((y - (ground - hgt)) / 2));
      for (let x = x0 - half; x <= x0 + half; x++) setRGB(b, x, y, x < x0 ? ramp[3] : x === x0 ? ramp[4] ?? ramp[3] : ramp[2]);
    }
  }
  return { buf: inkOutline(b, ink(ramp)), ax: 10, ay: ground + 1, light: { dx: 0, dy: -10, color: ramp[3], r: 46, flicker: false } };
}

function cactus(ramp: readonly string[]): PropArt {
  const b = blank(14, 22);
  const g = [ramp[0], ramp[1], ramp[2], ramp[3]];
  rect(b, 5, 2, 4, 19, g[2]);
  rect(b, 5, 2, 1, 19, g[3]);
  rect(b, 8, 2, 1, 19, g[1]);
  rect(b, 1, 8, 3, 2, g[2]);
  rect(b, 1, 4, 3, 5, g[2]);
  rect(b, 10, 10, 3, 2, g[2]);
  rect(b, 10, 6, 3, 5, g[1]);
  for (let y = 4; y < 20; y += 3) setRGB(b, 6, y, '#f4e8c8');
  return { buf: inkOutline(b, ink(g)), ax: 8, ay: 22 };
}

export function treeArt(kind: TreeKind, biome: Biome, seed: number): PropArt {
  const r = biome.treeRamp;
  switch (kind) {
    case 'oak':
      return clumpTree(r, seed, 26, 30, false);
    case 'maple':
      return clumpTree(r, seed, 24, 28, false);
    case 'apple':
      return clumpTree(r, seed, 24, 27, false, APPLES);
    case 'willow':
      return clumpTree(r, seed, 26, 28, true);
    case 'pine':
      return pine(r, seed, false, 30);
    case 'snowPine':
      return pine(r, seed, true, 32);
    case 'dead':
      return deadTree(r, seed);
    case 'mushroom':
      return giantMushroom(seed, biome.id === 'forest' ? '#5ad8c8' : '#b88aff');
    case 'crystal':
      return crystalTree(r, seed);
    case 'cactus':
      return cactus(r);
  }
}

// ------------------------------------------------------------------ props

/** Five stone tones from the biome's wall colors (tree biomes have only three: lighten them out). */
function stoneRamp(biome: Biome): string[] {
  const f = biome.solid.face;
  if (f.length >= 5) return [f[0], f[1], f[2], f[3], f[4]];
  const mid = f[Math.min(f.length - 1, 2)];
  const base = mixHex(mid, '#8a8a90', 0.45);
  return [shade(base, -0.55), shade(base, -0.3), base, shade(base, 0.22), shade(base, 0.42)];
}

export function propArt(kind: PropKind, biome: Biome, seed: number): PropArt {
  // The dungeon's props come from the supplied packs, and so do the shared ones on its floors.
  if (isDungeonProp(kind)) return dungeonPropArt(kind, biome, seed)!;
  if (biome.tiles === 'dungeon') {
    const pack = dungeonPropArt(kind, biome, seed);
    if (pack) return pack;
  }
  const fire = biome.light.fire;
  const stone = stoneRamp(biome);
  switch (kind) {
    case 'rock': {
      const b = blank(13, 10);
      const w = 4 + Math.floor(hash(seed, 1) * 2);
      ball(b, 6, 6, w, 3.6, [stone[0], stone[1], stone[2], stone[3]]);
      if (biome.ground.kind === 'grass' || biome.ground.kind === 'moss') for (let x = 3; x < 9; x++) if (hash(seed, x) < 0.6) setRGB(b, x, 3, biome.ground.ramp[3]);
      if (biome.ground.kind === 'snow') for (let x = 3; x < 10; x++) setRGB(b, x, 3, '#f0f6fc');
      return { buf: outlineTinted(b), ax: 7, ay: 10 };
    }
    case 'bush': {
      const t = clumpTree(biome.treeRamp, seed, 12, 9, false);
      // A bush is just leaves: cut the trunk off by drawing it low.
      return { ...t, ay: t.ay - 2 };
    }
    case 'flowers': {
      const b = blank(9, 6);
      const acc = biome.ground.accent ?? ['#e8c86a', '#d76b5a'];
      for (let i = 0; i < 4; i++) {
        const x = 1 + Math.floor(hash(seed, i) * 7);
        const y = 1 + Math.floor(hash(seed, i, 2) * 3);
        setRGB(b, x, y + 1, biome.ground.ramp[1]);
        setRGB(b, x, y, acc[i % acc.length]);
        setRGB(b, x + 1, y, shade(acc[i % acc.length], -0.25));
      }
      return { buf: b, ax: 4, ay: 5 };
    }
    case 'barrel': {
      const b = blank(9, 11);
      for (let y = 1; y < 11; y++) {
        const half = y < 3 || y > 8 ? 3 : 4;
        for (let x = 4 - half; x <= 4 + half; x++) setRGB(b, x, y, WOOD[x < 3 ? 3 : x < 6 ? 2 : 1]);
      }
      rect(b, 1, 0, 7, 2, WOOD[3]);
      rect(b, 2, 0, 5, 1, WOOD[4]);
      for (const y of [3, 8]) rect(b, 0, y, 9, 1, IRON[2]);
      return { buf: outlineTinted(b), ax: 5, ay: 12 };
    }
    case 'crate': {
      const b = blank(11, 11);
      rect(b, 0, 0, 11, 3, WOOD[3]);
      rect(b, 0, 3, 11, 8, WOOD[2]);
      for (const x of [0, 10]) rect(b, x, 3, 1, 8, WOOD[1]);
      line(b, 1, 4, 9, 10, WOOD[1]);
      rect(b, 0, 10, 11, 1, WOOD[0]);
      rect(b, 1, 0, 9, 1, WOOD[4]);
      return { buf: outlineTinted(b), ax: 6, ay: 12 };
    }
    case 'bones':
    case 'skull': {
      const b = blank(9, 6);
      const bone = ['#8a8270', '#c8c0a8', '#ece4cc'];
      if (kind === 'skull') {
        ball(b, 4, 2.5, 2.6, 2.2, ['#8a8270', '#b8b098', '#d8d0b8', '#f0e8d0']);
        setRGB(b, 3, 3, '#1a1010');
        setRGB(b, 5, 3, '#1a1010');
      } else {
        line(b, 1, 4, 7, 2, bone[1]);
        setRGB(b, 1, 3, bone[2]);
        setRGB(b, 7, 1, bone[2]);
        line(b, 2, 1, 5, 4, bone[0]);
      }
      return { buf: b, ax: 4, ay: 5 };
    }
    case 'torch': {
      const b = blank(5, 9);
      rect(b, 2, 3, 1, 6, WOOD[1]);
      rect(b, 1, 3, 3, 1, IRON[2]);
      rect(b, 1, 5, 3, 1, IRON[1]);
      return { buf: outlineTinted(b), ax: 3, ay: 10, light: { dx: 0, dy: -11, color: fire, r: 58, flicker: true }, flame: { dx: 0, dy: -9, size: 1 } };
    }
    case 'lantern': {
      const b = blank(7, 18);
      rect(b, 3, 4, 1, 14, WOOD[1]);
      rect(b, 1, 3, 5, 1, WOOD[2]);
      rect(b, 1, 4, 3, 4, '#ffd98a');
      rect(b, 2, 5, 1, 2, '#fff4d0');
      rect(b, 1, 4, 1, 4, IRON[1]);
      rect(b, 0, 2, 6, 1, IRON[2]);
      return { buf: outlineTinted(b), ax: 4, ay: 19, light: { dx: -1, dy: -13, color: fire, r: 52, flicker: true } };
    }
    case 'brazier': {
      const b = blank(11, 11);
      ball(b, 5, 5, 5, 2.5, IRON);
      rect(b, 1, 3, 9, 1, '#ff9a3a');
      line(b, 2, 7, 1, 10, IRON[1]);
      line(b, 8, 7, 9, 10, IRON[1]);
      line(b, 5, 7, 5, 10, IRON[2]);
      return { buf: outlineTinted(b), ax: 6, ay: 12, light: { dx: 0, dy: -10, color: fire, r: 72, flicker: true }, flame: { dx: 0, dy: -9, size: 2 } };
    }
    case 'gravestone': {
      const b = blank(9, 12);
      const g = ['#2a2a34', '#4a4a58', '#6a6a7a', '#8a8a9c'];
      rect(b, 1, 3, 7, 9, g[2]);
      rect(b, 2, 1, 5, 2, g[2]);
      rect(b, 1, 3, 1, 9, g[3]);
      rect(b, 7, 3, 1, 9, g[1]);
      rect(b, 4, 4, 1, 4, g[0]);
      rect(b, 3, 5, 3, 1, g[0]);
      if (hash(seed, 2) < 0.5) for (let x = 1; x < 8; x++) if (hash(seed, x) < 0.5) setRGB(b, x, 11, '#3e5a3a');
      return { buf: outlineTinted(b), ax: 5, ay: 13 };
    }
    case 'crystalSmall': {
      const t = crystalTree(biome.id === 'crystal' ? biome.treeRamp : ['#1a2a5a', '#2a4a9a', '#4a8ad8', '#8ac8ff', '#e0f8ff'], seed);
      return { ...t, light: { dx: 0, dy: -8, color: biome.id === 'ember' ? '#ff8a4a' : '#7ac8ff', r: 34, flicker: false } };
    }
    case 'reeds': {
      const b = blank(9, 10);
      for (let i = 0; i < 4; i++) {
        const x = 1 + i * 2;
        const hgt = 5 + Math.floor(hash(seed, i) * 4);
        line(b, x, 9, x + (i % 2), 9 - hgt, '#4a6a2a');
        if (i % 2 === 0) rect(b, x, 9 - hgt, 1, 2, '#6a4024');
      }
      return { buf: b, ax: 4, ay: 9 };
    }
    case 'mushroomSmall': {
      const b = blank(9, 7);
      const glow = biome.id === 'swamp' ? '#c8ff6a' : '#5ad8c8';
      for (const [x, s] of [[2, 1], [6, 0]] as const) {
        rect(b, x, 4, 1, 3, '#d8ccb0');
        rect(b, x - 1 - s, 2 + (1 - s), 3 + s * 2, 2, glow);
        setRGB(b, x - 1 - s, 2 + (1 - s), mixHex(glow, '#ffffff', 0.5));
      }
      return { buf: outlineTinted(b), ax: 5, ay: 8, light: { dx: 0, dy: -4, color: glow, r: 22, flicker: false } };
    }
    case 'pumpkin': {
      const b = blank(10, 8);
      const p = ['#6e2a12', '#a6451f', '#e0702a', '#ffa046'];
      ball(b, 5, 4.5, 4.6, 3.4, p);
      line(b, 3, 2, 3, 7, p[1]);
      line(b, 7, 2, 7, 7, p[1]);
      rect(b, 5, 0, 1, 2, '#3a5a20');
      const carved = biome.id === 'graveyard';
      if (carved) {
        setRGB(b, 3, 4, '#ffe06a');
        setRGB(b, 7, 4, '#ffe06a');
        rect(b, 4, 6, 3, 1, '#ffe06a');
      }
      return { buf: outlineTinted(b), ax: 6, ay: 9, ...(carved ? { light: { dx: 0, dy: -4, color: '#ffb84a', r: 30, flicker: true } } : {}) };
    }
    case 'stump': {
      const b = blank(11, 8);
      ball(b, 5, 2.5, 4.5, 2, ['#8a6a44', '#a8845a', '#c8a474', '#e0c08c']);
      rect(b, 1, 3, 9, 4, BARK[2]);
      rect(b, 1, 3, 2, 4, BARK[3]);
      rect(b, 8, 3, 2, 4, BARK[1]);
      setRGB(b, 5, 2, '#8a6a44');
      return { buf: outlineTinted(b), ax: 6, ay: 9 };
    }
    case 'pillar': {
      const b = blank(10, 26);
      rect(b, 1, 0, 8, 3, stone[3]);
      rect(b, 2, 3, 6, 20, stone[2]);
      rect(b, 2, 3, 2, 20, stone[3]);
      rect(b, 6, 3, 2, 20, stone[1]);
      rect(b, 1, 23, 8, 3, stone[2]);
      if (hash(seed, 1) < 0.5) line(b, 4, 8, 6, 13, stone[0]);
      return { buf: outlineTinted(b), ax: 5, ay: 27 };
    }
    case 'statue': {
      // A knight statue: the mannequin in stone on a plinth.
      const f = BODY_FRAMES[BODY_ANIMS.idle_down[0]];
      const b = blank(f.rows[0].length + 2, f.rows.length + 9);
      const st = [stone[1], stone[2], stone[3], stone[4]];
      f.rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && setRGB(b, x + 1, y + 1, ch === 'k' || ch === 'e' ? stone[0] : st['hijtuvabclmnfg'.indexOf(ch) % 3 === 2 ? 2 : 'hijtuvabclmnfg'.indexOf(ch) % 3 === 1 ? 1 : 0])));
      rect(b, 3, f.rows.length + 1, b.w - 6, 6, stone[2]);
      rect(b, 3, f.rows.length + 1, b.w - 6, 1, stone[3]);
      return { buf: outlineTinted(b), ax: Math.round(b.w / 2) + 1, ay: b.h + 1 };
    }
    case 'well': {
      const b = blank(15, 18);
      rect(b, 1, 10, 13, 7, stone[2]);
      rect(b, 1, 10, 13, 1, stone[3]);
      rect(b, 3, 11, 9, 2, '#0e1a22');
      rect(b, 1, 16, 13, 1, stone[1]);
      rect(b, 2, 2, 1, 9, WOOD[1]);
      rect(b, 12, 2, 1, 9, WOOD[1]);
      rect(b, 0, 1, 15, 2, WOOD[3]);
      rect(b, 0, 0, 15, 1, WOOD[4]);
      return { buf: outlineTinted(b), ax: 8, ay: 18 };
    }
    case 'fence': {
      const b = blank(15, 9);
      for (const x of [1, 7, 13]) rect(b, x, 0, 2, 9, WOOD[2]);
      rect(b, 0, 2, 15, 1, WOOD[3]);
      rect(b, 0, 5, 15, 1, WOOD[2]);
      return { buf: outlineTinted(b), ax: 8, ay: 10 };
    }
    case 'cart': {
      const b = blank(17, 12);
      rect(b, 1, 2, 15, 5, WOOD[2]);
      rect(b, 1, 2, 15, 1, WOOD[4]);
      rect(b, 1, 6, 15, 1, WOOD[1]);
      ball(b, 4, 8.5, 2.6, 2.6, [IRON[0], WOOD[1], WOOD[2], WOOD[3]]);
      ball(b, 13, 8.5, 2.6, 2.6, [IRON[0], WOOD[1], WOOD[2], WOOD[3]]);
      if (biome.id === 'farmland') {
        // A load of hay, wisps poking out.
        ball(b, 8, 1, 6, 2.4, [HAY[1], HAY[2], HAY[3], HAY[4]]);
        for (const [x, y] of [[2, 0], [13, 1], [6, -1], [10, -1]] as const) setRGB(b, x, y + 1, HAY[3]);
      } else ball(b, 8, 1, 4, 2, ['#6e2a12', '#a6451f', '#e0702a', '#ffa046']);
      return { buf: outlineTinted(b), ax: 9, ay: 12 };
    }
    case 'stoneLantern': {
      const b = blank(11, 18);
      const st = ['#3a4440', '#5a6660', '#7a8880', '#9aa8a0'];
      rect(b, 1, 0, 9, 2, st[3]);
      rect(b, 2, 2, 7, 5, st[2]);
      rect(b, 4, 3, 3, 3, '#ffd98a');
      setRGB(b, 5, 4, '#fff4d0');
      rect(b, 3, 7, 5, 1, st[3]);
      rect(b, 4, 8, 3, 7, st[2]);
      rect(b, 2, 15, 7, 3, st[1]);
      return { buf: outlineTinted(b), ax: 6, ay: 19, light: { dx: 0, dy: -13, color: fire, r: 50, flicker: true } };
    }
    case 'campfire': {
      // A ring of stones round crossed logs; the flame is animated on top.
      const b = blank(17, 11);
      const st = ['#2a2a30', '#4a4a54', '#6e6e7a', '#9090a0'];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        ball(b, 8 + Math.cos(a) * 6.5, 6 + Math.sin(a) * 3.2, 1.6, 1.3, st);
      }
      line(b, 3, 8, 13, 4, WOOD[1]);
      line(b, 3, 7, 13, 3, WOOD[2]);
      line(b, 4, 3, 13, 8, WOOD[1]);
      line(b, 4, 4, 12, 8, WOOD[3]);
      rect(b, 6, 5, 5, 2, '#ff8a3a');
      setRGB(b, 8, 5, '#ffe08a');
      return { buf: outlineTinted(b), ax: 9, ay: 10, light: { dx: 0, dy: -8, color: fire, r: 110, flicker: true }, flame: { dx: 0, dy: -5, size: 3 } };
    }
    case 'tent': {
      // A canvas tent in 3/4 view, the flap open.
      const b = blank(26, 20);
      const cloth = ['#5a3a2a', '#8a5a3e', '#b8845a', '#d8aa78'];
      for (let y = 0; y < 18; y++) {
        const half = Math.round(1 + y * 0.68);
        for (let x = 13 - half; x <= 13 + half; x++) {
          const k = x < 13 - 1 ? (x < 13 - half * 0.5 ? 3 : 2) : x > 13 ? 1 : 2;
          setRGB(b, x, y + 1, cloth[k]);
        }
      }
      for (let y = 9; y < 19; y++) {
        const half = Math.round((y - 9) * 0.4);
        for (let x = 13 - half; x <= 13 + half; x++) setRGB(b, x, y, '#1a1014');
      }
      line(b, 13, 0, 13, 18, cloth[0]);
      rect(b, 12, 0, 3, 1, WOOD[2]);
      return { buf: outlineTinted(b), ax: 14, ay: 20 };
    }
    case 'house':
    case 'pot':
    case 'bench':
    case 'lampPost':
    case 'signpost':
    case 'sack':
    case 'woodpile':
    case 'noticeBoard':
    case 'flowerBed':
    case 'stall':
    case 'wellStone':
      return villageArt(kind, biome, seed);
    case 'lanternPost':
    case 'stringLights':
    case 'roughFence':
    case 'fern':
    case 'mossRock':
    case 'log':
    case 'brokenPillar':
    case 'stoneBlock':
    case 'ruinWall':
    case 'stairs':
      return wildArt(kind, biome, seed);
    case 'picket':
    case 'picketSide':
    case 'hedge':
    case 'fountain':
    case 'cafeTable':
    case 'stringPost':
    case 'bridgeRail':
      return townArt(kind, biome, seed);
    case 'hayBale':
    case 'cabbage':
    case 'wheat':
    case 'scarecrow':
    case 'trough':
    case 'sunflower':
      return farmProp(kind, seed);
    case 'banner': {
      const b = blank(9, 20);
      rect(b, 1, 0, 1, 20, WOOD[1]);
      rect(b, 2, 1, 6, 9, biome.mobs.palettes[0][1]);
      rect(b, 2, 1, 6, 1, biome.mobs.palettes[0][2]);
      setRGB(b, 4, 10, biome.mobs.palettes[0][1]);
      setRGB(b, 7, 10, biome.mobs.palettes[0][1]);
      return { buf: outlineTinted(b), ax: 2, ay: 21 };
    }
  }
}

// ------------------------------------------------------------------ the farm

/** A square hay bale in 3/4 view (top face, front face, two bands of twine) with its top-left at x, y. */
function bale(b: PixelBuf, x: number, y: number, w: number, top: number, front: number, seed: number): void {
  for (let yy = 0; yy < top + front; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const onTop = yy < top;
      let k = onTop ? (yy === 0 || xx === 0 ? 4 : 3) : yy === top + front - 1 ? 1 : xx < 2 ? 3 : xx > w - 3 ? 1 : 2;
      // Straw: short strokes a shade darker (lighter on the shaded end).
      if (hash(seed, xx >> 1, yy) < 0.2 && yy !== 0) k += onTop ? -1 : xx > w - 3 ? 1 : -1;
      setRGB(b, x + xx, y + yy, HAY[Math.max(0, Math.min(4, k))]);
    }
  }
  // The twine: on the top it runs front to back, on the front top to bottom.
  for (const tx of [Math.round(w * 0.28), Math.round(w * 0.72) - 1]) {
    for (let yy = 0; yy < top + front - 1; yy++) setRGB(b, x + tx, y + yy, yy < top ? '#a4442a' : '#7a2e1e');
  }
}

/** Plaid flannel: a cloth ramp crossed by darker stripes every few pixels. */
function plaid(x: number, y: number, k: number, cloth: readonly string[]): string {
  const stripe = x % 4 === 1 || y % 4 === 2;
  const both = x % 4 === 1 && y % 4 === 2;
  return cloth[Math.max(0, k - (both ? 2 : stripe ? 1 : 0))];
}

function farmProp(kind: 'hayBale' | 'cabbage' | 'wheat' | 'scarecrow' | 'trough' | 'sunflower', seed: number): PropArt {
  switch (kind) {
    case 'hayBale': {
      if (hash(seed, 1) < 0.4) {
        // A little stack: two bales and one on top.
        const b = blank(21, 15);
        bale(b, 0, 6, 11, 3, 6, seed);
        bale(b, 10, 6, 11, 3, 6, seed + 1);
        bale(b, 5, 0, 11, 3, 6, seed + 2);
        return { buf: outlineTinted(b), ax: 11, ay: 16 };
      }
      const b = blank(15, 11);
      bale(b, 0, 0, 15, 4, 7, seed);
      return { buf: outlineTinted(b), ax: 8, ay: 12 };
    }
    case 'cabbage': {
      const b = blank(12, 9);
      const leaf = ['#1c3e1c', '#2a5a26', '#3e7a30', '#5a9a3e'];
      const head = ['#5a9a40', '#80ba50', '#a8d26c', '#d4eca0'];
      // A rosette of loose outer leaves, each with a pale rib...
      const lobes: Array<[number, number]> = [[-3.4, -0.6], [3.4, -0.6], [-2.4, 1.6], [2.4, 1.6], [0, 2.4], [0, -2.2]];
      for (const [dx, dy] of lobes) ball(b, 6 + dx, 4.4 + dy, 2.5, 1.8, leaf);
      for (const [dx, dy] of lobes) if (dy > -2) line(b, 6 + dx * 0.55, 4.4 + dy * 0.55, 6 + dx * 1.05, 4.4 + dy * 1.05, '#8ac05a');
      // ...and the tight head in the middle, a wrapped leaf's edge curling across it.
      ball(b, 6, 4, 3.3, 2.7, head);
      setRGB(b, 7, 3, head[0]);
      setRGB(b, 8, 4, head[0]);
      setRGB(b, 7, 5, head[0]);
      setRGB(b, 4, 2, '#eef8c8');
      return { buf: outlineTinted(b), ax: 7, ay: 10 };
    }
    case 'wheat': {
      const b = blank(12, 14);
      const n = 6 + Math.floor(hash(seed, 1) * 2);
      for (let i = 0; i < n; i++) {
        // Back stalks first (darker), the front ones over them, each with a plump ear on top.
        const back = i % 2 === 0;
        const x = 1 + Math.round(((i + 0.5) / n) * 9 + (hash(seed, i, 2) - 0.5) * 1.5);
        const h = (back ? 8 : 6) + Math.floor(hash(seed, i, 3) * 4);
        const lean = hash(seed, i, 4) < 0.3 ? -1 : hash(seed, i, 4) > 0.7 ? 1 : 0;
        const top = 13 - h;
        line(b, x, 13, x + lean, top + 4, back ? HAY[1] : HAY[2]);
        const ex = x + lean;
        const lit = back ? 3 : 4;
        setRGB(b, ex, top, HAY[lit]);
        for (let y = top + 1; y <= top + 3; y++) {
          setRGB(b, ex, y, HAY[lit - (y === top + 3 ? 1 : 0)]);
          setRGB(b, ex + 1, y, HAY[lit - 2]);
        }
        if (!back) setRGB(b, ex - 1, top - 1, HAY[2]);
      }
      // A little shade at the roots.
      for (let x = 1; x < 11; x++) if (hash(seed, x, 5) < 0.6) setRGB(b, x, 13, '#4a3412');
      return { buf: b, ax: 6, ay: 13 };
    }
    case 'scarecrow': {
      const b = blank(15, 24);
      const cloth = ['#4a1814', '#7a261c', '#a83a28', '#d0604a'];
      const burlap = ['#5e4428', '#8c6c42', '#b89660', '#dcc08a'];
      // The post and the cross-bar it hangs on.
      rect(b, 7, 9, 1, 15, WOOD[2]);
      rect(b, 8, 9, 1, 15, WOOD[1]);
      rect(b, 1, 10, 13, 1, WOOD[3]);
      // The flannel shirt: sleeves along the bar, the body hanging below, lit from the top left.
      for (let y = 10; y < 18; y++) {
        for (let x = 0; x < 15; x++) {
          const sleeve = y <= 12 && x >= 1 && x <= 13;
          const body = x >= 4 && x <= 10 && y <= 16 + (x % 3 === 0 ? 1 : 0);
          if (!sleeve && !body) continue;
          const k = y === 10 || x <= 5 ? 3 : x >= 9 || y >= 15 ? 1 : 2;
          setRGB(b, x, y, plaid(x, y, k, cloth));
        }
      }
      // Straw poking out of the cuffs and the hem.
      for (const [x, y, c] of [[0, 11, 3], [0, 12, 2], [14, 11, 2], [14, 12, 1], [5, 17, 3], [7, 18, 2], [9, 17, 2], [6, 18, 3]] as const) setRGB(b, x, y, HAY[c]);
      // The sack head, tied at the neck, with a stitched face.
      ball(b, 7.5, 5.8, 3.4, 3.2, burlap);
      rect(b, 6, 9, 3, 1, '#6a4a22');
      setRGB(b, 6, 5, '#2a1a10');
      setRGB(b, 9, 5, '#2a1a10');
      for (let x = 5; x <= 9; x++) setRGB(b, x, 7, x % 2 ? '#2a1a10' : burlap[1]);
      // A battered straw hat.
      rect(b, 2, 3, 12, 1, HAY[2]);
      rect(b, 2, 3, 4, 1, HAY[3]);
      rect(b, 5, 0, 6, 3, HAY[2]);
      rect(b, 5, 0, 2, 3, HAY[3]);
      rect(b, 5, 0, 6, 1, HAY[4]);
      rect(b, 5, 2, 6, 1, '#8a2a22');
      setRGB(b, 13, 4, HAY[1]);
      if (hash(seed, 3) < 0.45) {
        // A crow sits on its arm, unimpressed.
        rect(b, 11, 8, 3, 2, '#1c1c28');
        setRGB(b, 11, 8, '#3a3e54');
        setRGB(b, 13, 7, '#1c1c28');
        setRGB(b, 14, 7, '#c8a050');
        setRGB(b, 10, 9, '#1c1c28');
      }
      return { buf: outlineTinted(b), ax: 8, ay: 25 };
    }
    case 'trough': {
      const b = blank(16, 8);
      // The box: a lit rim, slop inside, a planked front, stubby legs.
      rect(b, 0, 1, 16, 6, WOOD[2]);
      rect(b, 0, 1, 16, 1, WOOD[4]);
      rect(b, 0, 1, 1, 6, WOOD[3]);
      rect(b, 15, 1, 1, 6, WOOD[1]);
      rect(b, 1, 2, 14, 2, '#4e4422');
      rect(b, 1, 2, 14, 1, '#3a3218');
      for (const [x, c] of [[3, '#8a7a3a'], [4, '#8a7a3a'], [8, '#c0321e'], [11, '#6aa040'], [12, '#8a7a3a']] as const) setRGB(b, x, 3, c);
      rect(b, 1, 5, 14, 1, WOOD[1]);
      rect(b, 0, 7, 2, 1, WOOD[0]);
      rect(b, 14, 7, 2, 1, WOOD[0]);
      return { buf: outlineTinted(b), ax: 9, ay: 9 };
    }
    case 'sunflower': {
      const b = blank(9, 18);
      const tall = Math.floor(hash(seed, 1) * 3);
      line(b, 4, 17, 4, 6 - tall, '#3e6a26');
      // Leaves off the stem.
      rect(b, 2, 12, 2, 1, '#5e8e32');
      setRGB(b, 1, 11, '#7aaa3e');
      rect(b, 5, 14, 2, 1, '#4a7a2a');
      setRGB(b, 7, 13, '#5e8e32');
      // The head, turned to the afternoon sun.
      ball(b, 4.4, 4.2 - tall, 4, 3.8, ['#b8741a', '#e0a02a', '#f8cc3a', '#fff07a']);
      ball(b, 4.2, 4.4 - tall, 2, 1.9, ['#3a2210', '#5a3618', '#7a4e22', '#9a6a30']);
      return { buf: outlineTinted(b), ax: 5, ay: 19 };
    }
  }
}

/** Flame frames (animated fire for torches and braziers). */
export function flameArt(size: number, frame: number, color: string): PixelBuf {
  const w = 3 + size * 2;
  const h = 5 + size * 2;
  const b = blank(w, h);
  const cx = (w - 1) / 2;
  const sway = [0, 1, 0, -1][frame % 4];
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const half = Math.round((Math.sin(t * Math.PI * 0.85) * (w / 2)) * (t < 0.35 ? t / 0.35 : 1));
    const xs = Math.round(cx + sway * (1 - t));
    for (let x = xs - half; x <= xs + half; x++) {
      const core = Math.abs(x - xs) < half * 0.5 && t > 0.4;
      setRGB(b, x, y, core ? '#fff4c0' : t < 0.4 ? mixHex(color, '#ff3a1a', 0.3) : mixHex(color, '#ffd84a', 0.4));
    }
  }
  return b;
}
