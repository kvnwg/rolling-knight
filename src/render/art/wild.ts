/**
 * The wilds and the ruins in them: lantern posts and strings of little lights (both cast real light,
 * picked up by the light map and its bloom), rough split-rail fences, ferns, mossy rocks and fallen
 * logs, and old stonework: carved blocks, broken pillars, ruined walls with friezes, worn stairs
 * into a ledge. Stone is drawn in 3/4: each block outlined, its top face lighter than its front.
 */
import type { Biome } from '../../world/biomes';
import { blank, type PixelBuf } from '../pixel/buf';
import { ball, hash, line, rect, setRGB, shade } from './draw';
import { outlineTinted } from './ink';

interface Art {
  buf: PixelBuf;
  ax: number;
  ay: number;
  light?: { dx: number; dy: number; color: string; r: number; flicker: boolean };
  flame?: { dx: number; dy: number; size: number };
}

const BARK = ['#1e140c', '#33241a', '#4a3626', '#634a34', '#7e6046'];
const IRON = ['#16161c', '#2c2c36', '#4a4a56', '#72727e'];
const MOSS = ['#2a4a1e', '#3e6a28', '#5a8c34', '#7eae44'];
const IVY = ['#14301a', '#1e4a22', '#2e6a2c', '#4a8a36'];

/** Stone for ruins: the biome's own if it has walls of it, else an old teal-grey. */
function ruinStone(biome: Biome): string[] {
  const f = biome.solid.face;
  if (biome.solid.kind !== 'trees' && f.length >= 5) return [f[0], f[1], f[2], f[3], f[4]];
  return biome.id === 'desert' ? ['#5a3e28', '#7e5a3a', '#a07a52', '#c49c6e', '#e0c08e'] : ['#1a2624', '#2a3c38', '#3e5650', '#56746a', '#7a9a8a'];
}

/** A lit block in 3/4: top face (th rows) lighter, front face darker, a 1px dark joint round it. */
function block(b: PixelBuf, x: number, y: number, w: number, h: number, th: number, st: string[], seed: number): void {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    let k: number;
    if (yy < th) k = yy === 0 ? 4 : 3;
    else k = xx === 0 ? 3 : xx === w - 1 || yy === h - 1 ? 1 : 2;
    // A chip or two off the edges.
    if ((xx === 0 || xx === w - 1) && (yy === 0 || yy === h - 1) && hash(seed, xx, yy) < 0.6) continue;
    setRGB(b, x + xx, y + yy, st[k]);
  }
  rect(b, x, y + th, w, 1, st[1]);
}

function mossOn(b: PixelBuf, x: number, y: number, w: number, seed: number): void {
  for (let i = 0; i < w; i++) {
    if (hash(seed, i) < 0.45) continue;
    setRGB(b, x + i, y, MOSS[hash(seed, i, 2) < 0.5 ? 2 : 3]);
    if (hash(seed, i, 3) < 0.35) setRGB(b, x + i, y + 1, MOSS[1]);
  }
}

export type WildKind = 'lanternPost' | 'stringLights' | 'roughFence' | 'fern' | 'mossRock' | 'log' | 'brokenPillar' | 'stoneBlock' | 'ruinWall' | 'stairs';

export function wildArt(kind: WildKind, biome: Biome, seed: number): Art {
  const st = ruinStone(biome);
  const fire = biome.light.fire;
  switch (kind) {
    case 'lanternPost': {
      // A crooked wooden post with an arm, a lantern hanging from it.
      const b = blank(14, 34);
      for (let y = 6; y < 34; y++) {
        const x = 3 + (y < 18 ? 1 : 0);
        setRGB(b, x, y, BARK[3]);
        setRGB(b, x + 1, y, BARK[2]);
        setRGB(b, x + 2, y, BARK[1]);
      }
      rect(b, 3, 6, 10, 2, BARK[3]);
      rect(b, 3, 7, 10, 1, BARK[1]);
      line(b, 5, 9, 9, 7, BARK[2]);
      // The lantern on its hook.
      setRGB(b, 11, 8, IRON[2]);
      setRGB(b, 11, 9, IRON[2]);
      rect(b, 9, 10, 5, 1, IRON[2]);
      rect(b, 9, 11, 5, 6, IRON[1]);
      rect(b, 10, 11, 3, 5, '#ffcf6a');
      rect(b, 10, 11, 1, 3, '#fff4c8');
      setRGB(b, 11, 14, '#ff9a3a');
      rect(b, 9, 17, 5, 1, IRON[2]);
      setRGB(b, 11, 18, IRON[1]);
      // Roots of grass round the foot.
      for (const [x, c] of [[2, MOSS[2]], [6, MOSS[1]], [7, MOSS[2]]] as const) setRGB(b, x, 33, c);
      return { buf: outlineTinted(b), ax: 5, ay: 35, light: { dx: 7, dy: -21, color: fire, r: 84, flicker: true } };
    }
    case 'stringLights': {
      // A cord slung between two posts or trees, sagging, with warm bulbs along it (each a glass of
      // color round a white-hot core). Its foot is well below it, so whoever walks under the lights
      // is drawn behind them.
      const W = 64;
      const b = blank(W, 18);
      const cols = ['#ffe070', '#ff9a4a', '#ff6a6a', '#fff0b0', '#8ad0ff'];
      for (let x = 0; x < W; x++) {
        const t = x / (W - 1);
        const y = Math.round(2 + 9 * (1 - (2 * t - 1) ** 2));
        setRGB(b, x, y, '#3a2a1c');
        if (x % 6 === 3 && x > 2 && x < W - 3) {
          const c = cols[Math.floor(x / 6 + seed) % cols.length];
          setRGB(b, x - 1, y + 1, c);
          setRGB(b, x, y + 1, '#ffffff');
          setRGB(b, x + 1, y + 1, shade(c, -0.15));
          setRGB(b, x - 1, y + 2, shade(c, -0.1));
          setRGB(b, x, y + 2, c);
          setRGB(b, x + 1, y + 2, shade(c, -0.3));
          setRGB(b, x, y + 3, shade(c, -0.35));
        }
      }
      return { buf: b, ax: W / 2, ay: 18 + 42, light: { dx: 0, dy: -50, color: '#ffd080', r: 60, flicker: true } };
    }
    case 'roughFence': {
      // Split rails between two crooked posts, a little moss.
      const b = blank(17, 12);
      for (const [x, h] of [[1, 11], [14, 10]] as const) {
        rect(b, x, 12 - h, 2, h, BARK[3]);
        rect(b, x + 1, 12 - h, 1, h, BARK[1]);
        setRGB(b, x, 12 - h, BARK[4]);
      }
      line(b, 0, 4 + (seed % 2), 16, 3, BARK[3]);
      line(b, 0, 5 + (seed % 2), 16, 4, BARK[1]);
      line(b, 0, 8, 16, 8 + (hash(seed, 1) < 0.5 ? 1 : 0), BARK[2]);
      line(b, 0, 9, 16, 9 + (hash(seed, 1) < 0.5 ? 1 : 0), BARK[1]);
      if (hash(seed, 2) < 0.6) mossOn(b, 2, 2, 6, seed);
      return { buf: outlineTinted(b), ax: 9, ay: 13 };
    }
    case 'fern': {
      // A lush fern: fronds arching out of the middle, leaflets lit on top.
      const b = blank(20, 13);
      const fronds = 7;
      for (let f = 0; f < fronds; f++) {
        const a = Math.PI * (1.05 + (f / (fronds - 1)) * 0.9) + (hash(seed, f) - 0.5) * 0.2;
        const len = 7 + Math.floor(hash(seed, f, 2) * 3);
        let px = 10;
        let py = 11;
        for (let k = 1; k <= len; k++) {
          const droop = (k / len) ** 2 * 3;
          const x = Math.round(10 + Math.cos(a) * k * 1.15);
          const y = Math.round(11 + Math.sin(a) * k * 0.95 + droop);
          line(b, px, py, x, y, IVY[1]);
          // Leaflets either side of the stem.
          if (k > 1 && k % 2 === 0) {
            setRGB(b, x, y - 1, k > len * 0.6 ? IVY[3] : IVY[2]);
            setRGB(b, x + (Math.cos(a) > 0 ? -1 : 1), y + 1, IVY[1]);
          }
          px = x;
          py = y;
        }
        setRGB(b, px, py, '#8ac05a');
      }
      return { buf: outlineTinted(b), ax: 11, ay: 13 };
    }
    case 'mossRock': {
      const b = blank(16, 12);
      const w = 6 + Math.floor(hash(seed, 1) * 2);
      ball(b, 8, 7, w, 4.4, [st[0], st[1], st[2], st[3]]);
      // A cap of moss over the top, lit, draping down one side.
      for (let x = 8 - w + 1; x < 8 + w - 1; x++) {
        const top = 7 - Math.round(Math.sqrt(Math.max(0, 1 - ((x - 8) / w) ** 2)) * 4.4);
        const depth = 1 + Math.floor(hash(seed, x) * 2) + (x < 8 ? 1 : 0);
        for (let k = 0; k < depth; k++) setRGB(b, x, top + k, k === 0 ? MOSS[3] : MOSS[2]);
      }
      return { buf: outlineTinted(b), ax: 9, ay: 13 };
    }
    case 'log': {
      // A fallen trunk lying across: bark lit on top, the cut end showing its rings, moss and fungi.
      const b = blank(32, 12);
      for (let x = 2; x < 32; x++) for (let y = 2; y < 11; y++) {
        const k = y < 4 ? 4 : y < 6 ? 3 : y < 9 ? 2 : 1;
        setRGB(b, x, y, BARK[(x * 7 + y * 3) % 11 === 0 ? k - 1 : k]);
      }
      ball(b, 3, 6.5, 3, 4.6, ['#8a6a44', '#b08a5a', '#d0aa74', '#e8c890']);
      setRGB(b, 3, 6, '#8a6a44');
      setRGB(b, 4, 5, '#a88050');
      mossOn(b, 8, 2, 18, seed);
      for (const x of [20, 23]) {
        setRGB(b, x, 1, '#e8d8b0');
        setRGB(b, x - 1, 1, '#c8a878');
        setRGB(b, x, 0, '#f0e4c8');
      }
      return { buf: outlineTinted(b), ax: 17, ay: 12 };
    }
    case 'brokenPillar': {
      // A fluted stone column snapped off part way up, its base block, moss and ivy.
      const b = blank(14, 32);
      const h = 18 + Math.floor(hash(seed, 1) * 8);
      const top = 28 - h;
      block(b, 0, 26, 14, 6, 2, st, seed);
      for (let y = top; y < 26; y++) for (let x = 2; x < 12; x++) {
        // The broken top: a jagged line.
        if (y < top + Math.round(Math.abs(Math.sin(x * 1.7 + seed)) * 4)) continue;
        let k = x < 4 ? 4 : x < 6 ? 3 : x > 9 ? 1 : 2;
        if (x === 5 || x === 8) k -= 1;
        setRGB(b, x, y, st[k]);
      }
      // The snapped top catches the light.
      for (let x = 2; x < 12; x++) setRGB(b, x, top + Math.round(Math.abs(Math.sin(x * 1.7 + seed)) * 4), st[4]);
      for (let y = top + 6; y < 26; y += 2) setRGB(b, 10 + (y % 4 === 0 ? 0 : 1), y, IVY[2 + (y % 3 === 0 ? 1 : 0)]);
      mossOn(b, 1, 26, 12, seed + 3);
      return { buf: outlineTinted(b), ax: 7, ay: 33 };
    }
    case 'stoneBlock': {
      // A fallen carved block: lit top, a frieze of spirals on its front.
      const b = blank(16, 13);
      block(b, 0, 0, 16, 13, 4, st, seed);
      for (let i = 0; i < 3; i++) {
        const cx = 3 + i * 5;
        setRGB(b, cx, 7, st[0]);
        setRGB(b, cx + 1, 7, st[0]);
        setRGB(b, cx + 1, 8, st[0]);
        setRGB(b, cx, 9, st[0]);
        setRGB(b, cx - 1, 8, st[3]);
      }
      mossOn(b, 1, 0, 14, seed);
      return { buf: outlineTinted(b), ax: 8, ay: 14 };
    }
    case 'ruinWall': {
      // A stretch of old wall three tiles wide: courses of blocks, a carved frieze, a broken top
      // whose upper face shows, ivy hanging down, a block fallen at its foot.
      const W = 50;
      const b = blank(W, 44);
      const courses = [32, 25, 18, 11];
      // How high the wall still stands along its length.
      const height = (x: number) => 10 + Math.round(Math.abs(Math.sin(x * 0.11 + seed * 0.7)) * 14 + Math.sin(x * 0.37 + seed) * 3);
      for (let x = 0; x < W; x++) {
        const top = 44 - 6 - height(x);
        for (let y = Math.max(0, top); y < 44 - 6; y++) {
          const course = courses.findIndex((c) => y >= c - 1);
          const cy = course >= 0 ? courses[course] : 4;
          const bw = 9 + (course % 2) * 2;
          const bx = (x + course * 5) % bw;
          let k = 2;
          if (y === cy - 1 || bx === 0) k = 0;
          else if (y === cy) k = 3;
          else if (bx === 1) k = 3;
          else if (bx === bw - 1) k = 1;
          // The frieze band: a carved running scroll.
          if (y >= 25 && y <= 30 && k > 0) {
            const t = (x + Math.round(Math.sin(y * 1.1) * 1.5)) % 6;
            if (y === 25 || y === 30) k = 3;
            else if (t === 0 || (y === 27 && t === 3)) k = 0;
          }
          setRGB(b, x, y, st[k]);
        }
        // The broken top: its upper face, lighter.
        if (top >= 0) {
          setRGB(b, x, top, st[4]);
          setRGB(b, x, top + 1, st[3]);
        }
      }
      // The plinth.
      for (let x = 0; x < W; x++) {
        setRGB(b, x, 38, st[3]);
        for (let y = 39; y < 44; y++) setRGB(b, x, y, (x + 3) % 12 === 0 ? st[0] : y === 43 ? st[1] : st[2]);
      }
      // Ivy pouring over the top, moss in the joints.
      for (let k = 0; k < 4; k++) {
        const vx = 4 + Math.floor(hash(seed, k) * (W - 8));
        const top = 44 - 6 - height(vx);
        const len = 6 + Math.floor(hash(seed, k, 2) * 14);
        for (let y = top; y < Math.min(37, top + len); y++) {
          const wob = Math.round(Math.sin(y * 0.6 + k) * 1.2);
          setRGB(b, vx + wob, y, IVY[2]);
          if (y % 2 === 0) setRGB(b, vx + wob + 1, y, IVY[3]);
          if (y % 3 === 0) setRGB(b, vx + wob - 1, y, IVY[1]);
        }
      }
      for (let x = 0; x < W; x += 3) if (hash(seed, x, 9) < 0.4) setRGB(b, x, 37, MOSS[2]);
      return { buf: outlineTinted(b), ax: W / 2 + 1, ay: 45 };
    }
    case 'stairs': {
      // Worn steps climbing into a ledge: each tread lit, each riser in shade.
      const b = blank(22, 18);
      for (let s = 0; s < 4; s++) {
        const y = 14 - s * 4;
        const inset = s;
        for (let x = inset; x < 22 - inset; x++) {
          setRGB(b, x, y, st[4]);
          setRGB(b, x, y + 1, st[3]);
          setRGB(b, x, y + 2, x === inset ? st[2] : st[1]);
          setRGB(b, x, y + 3, st[1]);
        }
        if (hash(seed, s) < 0.5) setRGB(b, inset + 2 + Math.floor(hash(seed, s, 2) * 14), y, MOSS[2]);
      }
      return { buf: outlineTinted(b), ax: 11, ay: 19 };
    }
  }
}
