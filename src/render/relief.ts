/**
 * The faces of raised ground (world/relief.ts says how high each biome's stands). The solid parts of
 * a floor are a storey up from the floor you walk on, and in the 3/4 view that shows as a face
 * wherever one has open floor to its south:
 *  - woods, lawns and lots: a retaining wall of big slate blocks in courses, the ground's grass (or
 *    snow) hanging over its top edge in tufts, moss in the joints and a vine here and there; along
 *    the raised ground's other edges a row of kerb stones;
 *  - crypts: tall brickwork under a lit cap, a string course below it, a plinth of big stones at the
 *    foot, grime toward the floor;
 *  - caves and canyons: rock in shelves, each shelf's lip lit and its underside in shade, cracks
 *    running down it, darker toward the foot.
 * Faces are lit from the top left like everything else: the left end of a wall catches the light, the
 * right end is in shade. The shadow raised ground throws on the floor is castShadows.ts.
 */
import type { Biome, Ramp } from '../world/biomes';
import { TILE } from '../world/mapgen';
import { faceSpan, reliefHeight, TIER_HEIGHT } from '../world/relief';
import { mixHex } from './art/draw';
import { rgb } from './pixel/buf';
import { h2, VNoise } from './noise';

type Kind = 'retaining' | 'brick' | 'strata';

/** The walls' stone, dark to light, for the biomes whose raised ground is held up by one. */
const STONE: Partial<Record<string, Ramp>> = {
  hamlet: ['#39424e', '#4a5562', '#5e6a76', '#7c8890', '#a9b1ae'],
  farmland: ['#3e362c', '#544a3c', '#6e6250', '#8c8068', '#b0a488'],
  forest: ['#27313c', '#36424f', '#495866', '#647582', '#8d9da4'],
  tundra: ['#34435c', '#46587a', '#5c7096', '#7e94b4', '#b4c8dc'],
  swamp: ['#1e241a', '#2c3424', '#3e4830', '#566042', '#748058'],
  graveyard: ['#1c1a22', '#2a2832', '#3c3a46', '#54525e', '#74727e'],
};

const MOSS: Partial<Record<string, readonly [string, string]>> = {
  hamlet: ['#4f8a34', '#6fae45'],
  farmland: ['#5a7a2e', '#7a9a3e'],
  forest: ['#2e5a34', '#447a40'],
  swamp: ['#3a5a26', '#557a32'],
  graveyard: ['#2a3a34', '#3a5046'],
  crypt: ['#2a4a3a', '#3a6a4c'],
  shrine: ['#2e5a48', '#48806a'],
};

function hexI(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (r << 16) | (g << 8) | b;
}

/** A tone along the stone ramp, as `at`'s painters hand it back (a colour is 0 or more). */
const enc = (k: number) => -1 - Math.max(0, k) * 16;

const clampK = (k: number, n: number) => Math.max(0, Math.min(n - 1, Math.round(k)));

export interface Relief {
  /** How tall a face stands, in pixels. */
  height: number;
  /** The colour of a pixel of solid ground that's on a face or a kerb stone; -1 on the top. */
  at(x: number, y: number, tx: number, ty: number, lx: number, ly: number): number;
}

/** The biome's faces over this floor (null: the biome paints its own walls). */
export function makeRelief(biome: Biome, seed: number, W: number, H: number, solidAt: (tx: number, ty: number) => boolean, tiers?: Uint8Array): Relief | null {
  const height = reliefHeight(biome);
  if (!height) return null;
  const kind: Kind = biome.solid.kind === 'trees' ? 'retaining' : biome.solid.kind === 'wall' ? 'brick' : 'strata';
  const S = Int32Array.from(kind === 'retaining' ? STONE[biome.id] ?? biome.solid.ledge ?? biome.solid.face : biome.solid.face, hexI);
  const n = S.length;
  const g = biome.ground.ramp;
  // The ground's edge hanging over a retaining wall: its underside, its body, its lit top.
  const lip = kind === 'retaining' ? [hexI(g[1]), hexI(g[Math.min(3, g.length - 1)]), hexI(g[g.length - 1])] : null;
  const mossC = MOSS[biome.id];
  const moss = mossC ? [hexI(mossC[0]), hexI(mossC[1])] : null;
  const kerb = kind === 'retaining' && !biome.solid.curb;
  const nMoss = new VNoise(6, seed + 97, W, H);
  const nRock = kind === 'strata' ? new VNoise(5, seed + 62, W * 0.5 + 2, H * 2.2 + 3) : null;
  const nWob = kind === 'strata' ? new VNoise(22, seed + 66, W, H) : null;
  const span = (tx: number, ty: number) => faceSpan(solidAt, height, tx, ty);
  const MW = Math.round(W / TILE);
  const MH = Math.round(H / TILE);
  /** A terrace (the second step up) at the tile? */
  const tier = (tx: number, ty: number) => !!tiers && tx >= 0 && ty >= 0 && tx < MW && ty < MH && tiers[ty * MW + tx] === 1;

  /** Stone for a tone `k` along the ramp. */
  const tone = (k: number) => S[clampK(k, n)];
  // The light coping on a stair's plinths.
  const stoneS = kind === 'retaining' ? STONE[biome.id] ?? biome.solid.ledge ?? biome.solid.face : biome.solid.face;
  const cap = [hexI(mixHex(stoneS[stoneS.length - 1], '#e4dcb8', 0.55)), hexI(mixHex(stoneS[stoneS.length - 2], '#c8c0a0', 0.45))];
  // Flights of steps up a retaining wall, two tiles wide, here and there along the longer walls
  // (1 a flight's left tile, 2 its right), by the tile row of the wall's foot: the terraces' walls
  // in `stairT`, the walls at the floor's edge in `stairF`.
  const stairT = new Uint8Array(MW * MH);
  const stairF = new Uint8Array(MW * MH);
  if (kind === 'retaining') {
    const runs = (foot: (tx: number, ty: number) => boolean, out: Uint8Array, chance: number, salt: number) => {
      for (let ty = 1; ty < MH - 1; ty++) {
        let tx = 0;
        while (tx < MW) {
          if (!foot(tx, ty)) {
            tx++;
            continue;
          }
          const x0 = tx;
          while (tx < MW && foot(tx, ty)) tx++;
          const len = tx - x0;
          if (len < 4 || h2(x0, ty, seed + salt) > chance) continue;
          const at = x0 + 1 + Math.floor(h2(x0, ty, seed + salt + 1) * (len - 3));
          out[ty * MW + at] = 1;
          out[ty * MW + at + 1] = 2;
        }
      }
    };
    runs((tx, ty) => tier(tx, ty) && !tier(tx, ty + 1), stairT, 0.6, 120);
    if (kerb) runs((tx, ty) => solidAt(tx, ty) && !solidAt(tx, ty + 1) && solidAt(tx, ty - 1) && tx > 0 && tx < MW - 1 && ty < MH - 1, stairF, 0.3, 124);
  }
  /** A flight of steps between two plinths: `sx` along its two tiles, `fy` down from the wall's top. */
  const stair = (sx: number, fy: number, fh: number, row: number): number => {
    if (sx < 5 || sx >= 27) {
      const u = sx < 5 ? sx : sx - 27;
      if (fy <= 1) return cap[fy];
      if (fy === 2) return tone(0.6);
      if (fy >= fh - 1) return tone(0);
      if ((fy - 3) % 8 === 7) return tone(1);
      return tone(u === 0 ? 3.5 : u === 4 ? 1.2 : 2.6);
    }
    const step = Math.floor(fy / 4);
    const sy = fy % 4;
    // The left plinth's shadow lies across the steps' left end.
    const shade = sx < 8 ? 1 : 0;
    if (moss && sy <= 1 && h2(Math.floor(sx / 3) + step * 13, row, seed + 126) < 0.1) return moss[sy];
    return sy === 0 && !shade ? cap[1] : tone((sy === 0 ? 4 : sy === 1 ? 3.6 : sy === 2 ? 2.2 : 1) - shade);
  };
  /** The wall running away from us along a raised edge, seen from the side: a strip `d` pixels in. */
  const sideAt = (d: number, y: number, west: boolean): number => {
    if (d === 3) return lip ? lip[west ? 2 : 1] : -1;
    const seam = y % 7 === 3;
    if (west) return tone(seam ? 1.6 : d === 0 ? 3.7 : 3);
    return tone(seam ? 0.3 : d === 0 ? 0.7 : 1.5);
  };


  // A retaining wall: `fy` rows down from its top, `row` the tile row of its foot.
  const retaining = (x: number, y: number, fy: number, fh: number, row: number): number => {
    const l = lip!;
    const drip = 2 + (h2(x, row, seed + 90) < 0.35 ? 1 : 0) + (h2(Math.floor(x / 3), row, seed + 91) < 0.22 ? 2 : 0);
    if (fy < drip) return fy === 0 ? l[2] : fy === drip - 1 ? l[0] : l[1];
    // The lip's shadow on the stone right under it.
    if (fy === drip) return S[0];
    // A vine hanging from the lip, a leaf on it now and then.
    if (moss) {
      const vx = Math.floor(x / 2);
      if (h2(vx, row, seed + 94) < 0.1 && x % 2 === 0) {
        const len = 4 + Math.floor(h2(vx, row, seed + 95) * (fh - 8));
        if (fy < drip + len) return (fy + vx) % 4 === 0 ? moss[1] : moss[0];
      }
    }
    // Courses of big blocks, each course shifted along from the one above.
    const bh = fh >= 20 ? 7 : 6;
    const r = fy - 2;
    const course = Math.floor(r / bh);
    const by = r - course * bh;
    const bw = 13;
    const bxAll = x + course * 6 + Math.floor(h2(course, row, seed + 92) * 5);
    const block = Math.floor(bxAll / bw);
    const bx = bxAll - block * bw;
    const id = h2(block, course + row * 7, seed + 93);
    let k = 2.1 + (id - 0.5) * 1.3 - course * 0.3;
    if (by === bh - 1 || bx === 0) k = 0.5 - course * 0.25;
    else if (by === 0) k += 0.9;
    else if (bx === bw - 1) k -= 0.5;
    // A chipped corner on some blocks.
    else if (id > 0.8 && by === 1 && bx === 1) k -= 1;
    if (fy >= fh - 1) k = 0;
    else if (fy >= fh - 3) k -= 0.7;
    // Moss, thickest in the joints and near the grass.
    if (moss && fy < fh - 2) {
      const mv = nMoss.at(x, y) + (by === bh - 1 || bx === 0 ? 0.12 : 0) + (fy < drip + 4 ? 0.1 : 0);
      if (mv > 0.72) return mv > 0.82 ? moss[1] : moss[0];
    }
    return enc(k);
  };

  // A crypt's wall: bricks under a lit cap, a plinth at the foot.
  const brick = (x: number, y: number, fy: number, fh: number, row: number): number => {
    if (fy <= 3) return -1 - (fy === 0 ? 4 : fy === 3 ? 1 : 3) * 16;
    // Pilasters every three tiles along a tall wall: a lit left edge, a shaded right one, a shadow
    // on the wall beside them, wider at the capital and the base.
    if (fh >= 24) {
      const wide = fy <= 6 || fy >= fh - 5 ? 1 : 0;
      const u = ((x + 4) % 48) - 1 + wide;
      const w = 6 + wide * 2;
      if (u >= 0 && u < w + 2) {
        if (fy >= fh - 1) return enc(0.3);
        if (u >= w) return enc(fy === 4 ? 0 : 0.7);
        if (fy === 4) return enc(1);
        if (fy === 7 || fy === fh - 6) return enc(u === 0 ? 2 : 0.8);
        return enc(u === 0 ? 4 : u === w - 1 ? 1.3 : (fy - 8) % 9 === 8 && !wide ? 1.9 : 2.9 - (fy / fh) * 0.6);
      }
    }
    // The cap's shadow, then a string course.
    if (fy === 4) return -1;
    if (fh >= 24 && fy >= 9 && fy <= 10) return -1 - (fy === 9 ? 3.2 : 0.6) * 16;
    const plinth = fh >= 24 ? 6 : 0;
    if (fy >= fh - plinth) {
      const py = fy - (fh - plinth);
      const bx = (x + row * 5) % 16;
      let k = py === 0 ? 3.3 : bx === 0 ? 0.4 : 1.7 + (h2(Math.floor((x + row * 5) / 16), row, seed + 65) - 0.5) * 0.8;
      if (fy >= fh - 1) k = 0.3;
      return enc(k);
    }
    const bw = 8;
    const bh = 4;
    const r = fy - 1;
    const course = Math.floor(r / bh);
    const bxAll = x + (course % 2) * 4;
    const bx = bxAll % bw;
    const by = r % bh;
    const id = h2(Math.floor(bxAll / bw), course + row * 9, seed + 60);
    let k = 2 + (id - 0.5) * 1.4;
    if (by === 0 || bx === 0) k = 0;
    else if (by === 1) k += 0.8;
    else if (bx === bw - 1) k -= 0.6;
    if (k > 0) k += (fh / 2 - fy) / fh * 1.3;
    // Grime and moss toward the floor.
    if (fy > fh * 0.55 && nMoss.at(x, y) > 0.62) {
      if (moss && nMoss.at(x + 40, y + 17) > 0.6 && k > 0) return (x + fy) % 3 ? moss[0] : moss[1];
      k = Math.min(k, 1);
    }
    return enc(k);
  };

  // A cliff: rock in shelves.
  const strata = (x: number, y: number, fy: number, fh: number, row: number): number => {
    if (fy <= 3) return -1 - (fy === 0 ? 4 : fy === 1 ? 3.4 : fy === 2 ? 3 : 1) * 16;
    const nv = nRock!.at(x * 0.5, y * 2.2);
    // Shelves every so many rows, their edges wandering along the wall.
    const wob = Math.floor(nWob!.at(x, row * 31) * 6);
    const r = fy + wob;
    const shelfH = 8;
    const sy = r % shelfH;
    const shelf = Math.floor(r / shelfH);
    let k = 1.3 + nv * 2 + (h2(shelf, row, seed + 67) - 0.5) * 0.7 - (fy / fh) * 1.1;
    // The rock stands in rough columns: each bulges toward us, lit on its left, a fissure between.
    const cw = 26;
    const cxx = x + Math.floor(nWob!.at(x * 0.3 + 90, fy * 3 + row * 17) * 10) + row * 7;
    const cu = (cxx % cw) / cw;
    if (cxx % cw === 0 && h2(Math.floor(cxx / cw), row, seed + 70) < 0.8) k -= 1.6;
    else k += (0.42 - cu) * 1.3;
    if (sy === 0) k += 1.2;
    else if (sy === shelfH - 1) k -= 1.3;
    else if (sy === 1) k += 0.4;
    // Cracks down a shelf.
    const cx = Math.floor((x + shelf * 5) / 9);
    if ((x + shelf * 5) % 9 === Math.floor(h2(cx, shelf + row * 3, seed + 68) * 9) && h2(cx, shelf + row * 5, seed + 69) < 0.55 && sy > 0) k -= 1.2;
    if (moss && sy <= 1 && nMoss.at(x, y) > 0.7) return (x + fy) % 3 ? moss[0] : moss[1];
    if (fy >= fh - 2) k = Math.min(k, fy === fh - 1 ? 0 : 0.8);
    return enc(k);
  };

  const paint = kind === 'retaining' ? retaining : kind === 'brick' ? brick : strata;

  return {
    height,
    at(x, y, tx, ty, lx, ly) {
      const sp = span(tx, ty);
      if (sp) {
        const rise = sp[0] + TILE - 1 - ly;
        const fh = sp[1];
        if (rise < fh) {
          const st = stairF[(ty + (sp[0] ? 1 : 0)) * MW + tx];
          if (st && fh >= TILE) return stair(lx + (st - 1) * TILE, fh - 1 - rise, fh, ty);
          const v = paint(x, y, fh - 1 - rise, fh, ty + (sp[0] ? 1 : 0));
          if (v >= 0) return v;
          let k = (-1 - v) / 16;
          // The wall's ends: the left one catches the light, the right one is in shade.
          if (lx === 0 && !solidAt(tx - 1, ty)) k += 1.1;
          else if (lx === TILE - 1 && !solidAt(tx + 1, ty)) k -= 1.1;
          return tone(k);
        }
      }
      // A terrace: its wall where the ground drops away to the south, a rim along its other edges.
      if (tier(tx, ty)) {
        const foot = !tier(tx, ty + 1) ? 0 : !tier(tx, ty + 2) ? 1 : -1;
        const rise = foot < 0 ? 99 : foot * TILE + TILE - 1 - ly;
        if (rise < TIER_HEIGHT) {
          const fy = TIER_HEIGHT - 1 - rise;
          const st = stairT[(ty + foot) * MW + tx];
          if (st) return stair(lx + (st - 1) * TILE, fy, TIER_HEIGHT, ty + foot);
          const v = paint(x, y, fy, TIER_HEIGHT, ty + foot);
          if (v >= 0) return v;
          let k = (-1 - v) / 16;
          if (lx === 0 && !tier(tx - 1, ty)) k += 1.1;
          else if (lx === TILE - 1 && !tier(tx + 1, ty)) k -= 1.1;
          return tone(k);
        }
        if (kind === 'retaining') {
          if (lx <= 3 && !tier(tx - 1, ty)) return sideAt(lx, y, true);
          if (lx >= TILE - 4 && !tier(tx + 1, ty)) return sideAt(TILE - 1 - lx, y, false);
          if (ly <= 1 && !tier(tx, ty - 1)) return lip![ly === 0 ? 2 : 1];
        } else {
          let d = 9;
          let lit = 0;
          if (!tier(tx, ty - 1)) d = ly;
          if (!tier(tx - 1, ty) && lx < d) {
            d = lx;
            lit = 0.6;
          }
          if (!tier(tx + 1, ty) && TILE - 1 - lx < d) {
            d = TILE - 1 - lx;
            lit = -1.2;
          }
          if (d <= 3) return tone((d === 0 ? 4 : d === 1 ? 3.2 : d === 2 ? 2.4 : 1) + lit);
        }
        return -1;
      }
      if (!kerb) return -1;
      if (lx <= 3 && !solidAt(tx - 1, ty)) return sideAt(lx, y, true);
      if (lx >= TILE - 4 && !solidAt(tx + 1, ty)) return sideAt(TILE - 1 - lx, y, false);
      if (ly <= 1 && !solidAt(tx, ty - 1)) return lip![ly === 0 ? 2 : 1];
      return -1;
    },
  };
}
