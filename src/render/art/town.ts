/**
 * The town's furniture: white picket fences (along a lot's front, or running down its side), box
 * hedges, a fountain for the square, café tables under striped umbrellas, posts to hang strings of
 * lights from, a bridge's railings and a market stall with striped awning and crates of produce.
 * Drawn like little voxel models: a lit top face, a darker front, an outline tinted from their own
 * colors, light from the top left.
 */
import type { Biome } from '../../world/biomes';
import { blank, type PixelBuf } from '../pixel/buf';
import { ball, hash, line, mixHex, rect, setRGB, shade } from './draw';
import { outlineTinted } from './ink';

interface Art {
  buf: PixelBuf;
  ax: number;
  ay: number;
  light?: { dx: number; dy: number; color: string; r: number; flicker: boolean };
}

const PAINT = ['#8a8680', '#c4c0b8', '#e8e4dc', '#fbf8f0'];
const HEDGE = ['#1e4a1a', '#2c6424', '#3e802e', '#56a03a', '#7ac04e'];
const STONE = ['#5a5650', '#7e7a72', '#a6a298', '#c8c4b8', '#e2ded2'];
const WOOD = ['#3a2416', '#5e3e24', '#845a36', '#a8784a', '#c89a64'];
const WATER = ['#1e4a9a', '#2a62c0', '#3a7ad8', '#5a9ae8', '#a8d8fc'];

export type TownKind = 'picket' | 'picketSide' | 'hedge' | 'fountain' | 'cafeTable' | 'stringPost' | 'bridgeRail';

export function townArt(kind: TownKind, biome: Biome, seed: number): Art {
  switch (kind) {
    case 'picket': {
      // Pickets with pointed tops in front of two rails.
      const b = blank(16, 11);
      rect(b, 0, 3, 16, 2, PAINT[1]);
      rect(b, 0, 3, 16, 1, PAINT[2]);
      rect(b, 0, 7, 16, 2, PAINT[1]);
      rect(b, 0, 7, 16, 1, PAINT[2]);
      for (let k = 0; k < 5; k++) {
        const x = 1 + k * 3;
        setRGB(b, x, 0, PAINT[3]);
        rect(b, x, 1, 1, 10, PAINT[3]);
        rect(b, x + 1, 1, 1, 10, PAINT[1]);
        setRGB(b, x + 1, 10, PAINT[0]);
      }
      return { buf: outlineTinted(b, 0.55), ax: 9, ay: 12 };
    }
    case 'picketSide': {
      // A fence running away from us: its rail seen end-on, a picket tip every few pixels.
      const b = blank(5, 19);
      rect(b, 1, 2, 3, 17, PAINT[2]);
      rect(b, 3, 2, 1, 17, PAINT[1]);
      for (let y = 1; y < 19; y += 4) {
        rect(b, 0, y, 5, 1, PAINT[3]);
        setRGB(b, 4, y, PAINT[1]);
      }
      rect(b, 1, 18, 3, 1, PAINT[0]);
      return { buf: outlineTinted(b, 0.55), ax: 3, ay: 20 };
    }
    case 'hedge': {
      // A clipped box hedge: a lit top face of leaves, a darker front, the odd flower.
      const b = blank(16, 13);
      for (let y = 0; y < 13; y++) for (let x = 0; x < 16; x++) {
        const top = y < 5;
        let k = top ? (y === 0 ? 4 : 3) : y === 12 ? 0 : x < 2 ? 2 : 1;
        // Leaf texture: lit flecks on top, shadow flecks on the front.
        const n = hash(seed, x, y);
        if (n < 0.18) k += top ? 1 : 1;
        else if (n > 0.86) k -= 1;
        setRGB(b, x, y, HEDGE[Math.max(0, Math.min(4, k))]);
      }
      if (hash(seed, 1) < 0.4) for (let k = 0; k < 4; k++) setRGB(b, 2 + Math.floor(hash(seed, k, 3) * 12), 1 + Math.floor(hash(seed, k, 4) * 8), hash(seed, 9) < 0.5 ? '#f4b8cc' : '#f8f4e8');
      return { buf: outlineTinted(b, 0.6), ax: 9, ay: 14 };
    }
    case 'fountain': {
      // A round stone basin (lit rim, its front in shade), water inside with bright streaks, a
      // pedestal with a bowl in the middle and water spilling from it.
      const W = 46;
      const b = blank(W, 34);
      const cx = W / 2;
      // The basin's front wall.
      for (let y = 22; y < 34; y++) for (let x = 0; x < W; x++) {
        const dx = (x + 0.5 - cx) / (W / 2);
        if (Math.abs(dx) > 1) continue;
        const bottom = 28 + Math.round(Math.sqrt(1 - dx * dx) * 5);
        if (y > bottom) continue;
        setRGB(b, x, y, y === bottom ? STONE[0] : (x + Math.floor(y / 3) * 2) % 7 === 0 ? STONE[1] : x < W * 0.3 ? STONE[3] : STONE[2]);
      }
      // The rim and the water, seen from above.
      for (let y = 6; y < 30; y++) for (let x = 0; x < W; x++) {
        const dx = (x + 0.5 - cx) / (W / 2);
        const dy = (y + 0.5 - 17) / 12;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        if (d > 0.72) setRGB(b, x, y, dy < 0 && dx < 0.2 ? STONE[4] : STONE[3]);
        else {
          let col = WATER[dy < -0.3 ? 1 : 2];
          if ((x * 5 + y * 3) % 17 === 0) col = WATER[4];
          else if ((x * 3 + y * 7) % 23 === 0) col = WATER[3];
          if (d > 0.62 && dy < 0) col = WATER[0];
          setRGB(b, x, y, col);
        }
      }
      // The pedestal and its bowl.
      rect(b, cx - 3, 8, 6, 12, STONE[2]);
      rect(b, cx - 3, 8, 2, 12, STONE[4]);
      rect(b, cx + 2, 8, 1, 12, STONE[1]);
      ball(b, cx, 7, 9, 3.2, [STONE[1], STONE[2], STONE[3], STONE[4]]);
      for (let x = -6; x <= 6; x++) setRGB(b, cx + x, 6, WATER[x < 0 ? 3 : 2]);
      rect(b, cx - 1, 0, 2, 6, STONE[3]);
      setRGB(b, cx - 1, 0, STONE[4]);
      // Water spilling over the bowl's lip.
      for (const x of [-8, -5, 5, 8]) for (let y = 8; y < 13; y++) setRGB(b, cx + x, y, (y + x) % 2 ? WATER[4] : WATER[3]);
      return { buf: outlineTinted(b, 0.6), ax: Math.round(cx) + 1, ay: 35 };
    }
    case 'cafeTable': {
      // A round table, two chairs, a striped umbrella over it.
      const b = blank(22, 26);
      const cloth = hash(seed, 1) < 0.5 ? ['#a8282a', '#d84a3a', '#f4ece0'] : ['#2a4ea0', '#4a72c8', '#f4ece0'];
      line(b, 11, 6, 11, 20, '#5a5a62');
      for (let y = 0; y < 7; y++) {
        const half = Math.round(2 + y * 1.5);
        for (let x = 11 - half; x <= 11 + half; x++) {
          const stripe = Math.floor((x - 11 + 20) / 3) % 2;
          setRGB(b, x, y + 1, y === 6 ? shade(cloth[stripe ? 0 : 2], -0.25) : stripe ? cloth[1] : cloth[2]);
        }
      }
      setRGB(b, 11, 0, cloth[0]);
      // Chairs either side, the table between them.
      for (const cx of [2, 17]) {
        rect(b, cx, 15, 3, 3, WOOD[3]);
        rect(b, cx, 15, 3, 1, WOOD[4]);
        rect(b, cx, 18, 1, 4, WOOD[1]);
        rect(b, cx + 2, 18, 1, 4, WOOD[1]);
        rect(b, cx + (cx < 11 ? 0 : 2), 11, 1, 4, WOOD[2]);
      }
      ball(b, 11, 18, 6, 2.4, [WOOD[1], WOOD[2], WOOD[3], WOOD[4]]);
      rect(b, 10, 20, 2, 5, WOOD[1]);
      rect(b, 8, 25, 6, 1, WOOD[0]);
      return { buf: outlineTinted(b, 0.6), ax: 12, ay: 27 };
    }
    case 'stringPost': {
      // A slim post to hang a string of lights from, a little cap on top.
      const b = blank(5, 30);
      rect(b, 1, 3, 3, 27, WOOD[2]);
      rect(b, 1, 3, 1, 27, WOOD[3]);
      rect(b, 3, 3, 1, 27, WOOD[1]);
      rect(b, 0, 1, 5, 2, WOOD[3]);
      rect(b, 0, 1, 5, 1, WOOD[4]);
      setRGB(b, 2, 0, '#e8c060');
      return { buf: outlineTinted(b, 0.6), ax: 3, ay: 31, light: { dx: 0, dy: -29, color: biome.light.fire, r: 26, flicker: true } };
    }
    case 'bridgeRail': {
      // A bridge's side rail running across the canal: posts and a top rail, seen from the side.
      const b = blank(5, 44);
      for (let y = 0; y < 44; y++) {
        setRGB(b, 1, y, WOOD[3]);
        setRGB(b, 2, y, WOOD[2]);
        setRGB(b, 3, y, WOOD[1]);
      }
      for (const y of [0, 14, 29, 40]) {
        rect(b, 0, y, 5, 4, WOOD[2]);
        rect(b, 0, y, 5, 1, WOOD[4]);
        rect(b, 4, y + 1, 1, 3, WOOD[1]);
      }
      return { buf: outlineTinted(b, 0.6), ax: 3, ay: 45 };
    }
  }
}

/** A market stall, red and white or blue and white: a striped awning (its lit top and a scalloped
 * valance), posts, a counter in the same stripes with crates of produce on it. */
export function stallArt(seed: number): Art {
  const b = blank(40, 34);
  const ways = [['#9a1e22', '#d63a34', '#f4ece0', '#fffaf2'], ['#1e3e8a', '#3a64c0', '#f4ece0', '#fffaf2'], ['#5a2a7a', '#8a4ab0', '#f8e8a0', '#fff8d0']];
  const C = ways[Math.floor(hash(seed, 1) * ways.length)];
  const stripe = (x: number) => Math.floor(x / 5) % 2 === 0;
  // Posts.
  rect(b, 2, 10, 2, 24, WOOD[2]);
  rect(b, 36, 10, 2, 24, WOOD[1]);
  // The awning: a lit top face sloping toward us, then the valance with a scalloped hem.
  for (let y = 0; y < 10; y++) {
    const inset = Math.max(0, 4 - y);
    for (let x = inset; x < 40 - inset; x++) setRGB(b, x, y, stripe(x) ? (y < 3 ? C[1] : C[0]) : y < 3 ? C[3] : C[2]);
  }
  for (let x = 0; x < 40; x++) {
    setRGB(b, x, 10, stripe(x) ? C[0] : shade(C[2], -0.15));
    if (x % 5 !== 4) setRGB(b, x, 11, stripe(x) ? shade(C[0], -0.2) : shade(C[2], -0.3));
  }
  // Rolled ends of the awning.
  rect(b, 0, 0, 3, 3, '#c89a30');
  rect(b, 37, 0, 3, 3, '#c89a30');
  // The shade under the awning, the goods on the counter.
  rect(b, 4, 12, 32, 9, '#3a2a24');
  const goods = ['#e8822a', '#7ab43a', '#e8c43a', '#8a4ab0', '#d63a34', '#f0e0a0'];
  for (let k = 0; k < 6; k++) {
    const gx = 5 + k * 5;
    const col = goods[(k + Math.floor(hash(seed, 2) * 6)) % goods.length];
    // A crate with its produce heaped on top.
    rect(b, gx, 19, 5, 3, WOOD[3]);
    rect(b, gx, 19, 5, 1, WOOD[4]);
    rect(b, gx, 16, 5, 3, col);
    rect(b, gx, 16, 5, 1, mixHex(col, '#ffffff', 0.35));
    setRGB(b, gx + 4, 18, shade(col, -0.35));
  }
  // The counter's front, striped.
  for (let y = 22; y < 31; y++) for (let x = 2; x < 38; x++) setRGB(b, x, y, y === 22 ? WOOD[4] : y === 30 ? shade(C[0], -0.4) : stripe(x) ? C[1] : C[2]);
  return { buf: outlineTinted(b, 0.6), ax: 21, ay: 35 };
}
