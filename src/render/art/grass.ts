/**
 * Lawns: the grass and moss of a floor, baked into the ground with the terrain (terrain.ts), on the
 * art grid (one art pixel per pixel, no smoothing). In two steps:
 *  - `color`, per pixel while the ground is painted: the lawn's base in three greens a step apart,
 *    lush (darker) and sunlit (lighter) patches among the plain lawn, their edges dithered in little
 *    blade-shaped dashes; dry straw-colored patches where the biome has them;
 *  - `dress`, once the ground is down: tiny blade marks all over (the texture), then clover and moss
 *    cushions, pebbles, fallen leaves and petals, tufts of blades in three sizes (lit tips, dark roots,
 *    a little shadow to the lower right), flower clusters in the biome's colors, the odd ring of
 *    mushrooms, and blades breaking the lawn's edges where it meets a path, a field, a curb or a wall.
 * How much of each grows where follows a slow "richness" field: calm stretches with little but the
 * texture, rich ones thick with tufts and flowers, the edges of woods and walls richer still. Every
 * tone comes from the biome's own greens (each look below starts from its ground ramp), so fights stay
 * readable: the broad tones are calm and the detail is in small, high-frequency marks.
 */
import type { Biome } from '../../world/biomes';
import { rgb } from '../pixel/buf';
import { h2, VNoise } from '../noise';
import { mixHex, shade } from './draw';

/** A flower's shape: a plus with a center (daisy), a 2x2 cup, a 2x2 with a dark eye, a bell, a speck. */
export type Species = 'daisy' | 'cup' | 'poppy' | 'bell' | 'speck';

export interface GrassLook {
  /** Eight greens: the shade at the blades' roots, dark, lush lawn, lawn, sunlit lawn, light, tips, glints. */
  g: readonly string[];
  /** Dry grass, the same eight steps (worn, straw-colored patches); none: the lawn stays green. */
  dry?: readonly string[];
  /** Patch size (px), and where the noise turns lush (below) and sunlit (above); dry above `dryAt`. */
  patch: number;
  lush: number;
  sun: number;
  dryAt?: number;
  /** Blade marks: the chance per 4 x 3 cell (lush, plain, sunlit). */
  marks: readonly [number, number, number];
  /** Tufts per 10 000 px at full richness: small, medium, large. */
  tufts: readonly [number, number, number];
  /** Clover patches and their four tones (shade, dark, leaf, lit leaf); per 10 000 px. */
  clover: number;
  cloverTone?: readonly string[];
  /** Flower clusters per 10 000 px, and what grows: species, color, weight. */
  flowers: number;
  species: ReadonlyArray<readonly [Species, string, number]>;
  pebbles: number;
  /** Fairy rings per 100 000 px, and the caps (shade, cap, lit). */
  rings: number;
  caps?: readonly string[];
  /** Drifts of fallen leaves per 10 000 px, their colors. */
  leaves: number;
  leafTone?: readonly string[];
  /** Moss cushions per 10 000 px (shade, dark, moss, lit). */
  moss: number;
  mossTone?: readonly string[];
  /** Drifts of petals per 10 000 px. */
  petals: number;
  petalTone?: readonly string[];
  /** Blades over the lawn's edges: chance per edge pixel. */
  fringe: number;
}

/** Five steps of a flower's color: shade, body, lit, a glint, and its eye (white petals shade softer). */
function bloom(c: string, eye = '#f0b838'): string[] {
  const [r, g, b] = rgb(c);
  const pale = r + g + b > 600;
  return [pale ? mixHex(c, '#8aa0a0', 0.42) : shade(c, -0.38), c, mixHex(c, '#ffffff', pale ? 0.5 : 0.38), mixHex(c, '#ffffff', 0.75), eye];
}

const LOOKS: Record<string, GrassLook> = {
  // The village's lawns, after Firefly Garden: bright, lush, a little yellow in the sun, blue-green in
  // the shade; buttercups, marigolds and daisies, clover, the odd fairy ring.
  hamlet: {
    g: ['#1d4b27', '#2c6825', '#448a28', '#58a02d', '#69b033', '#82c23d', '#a6d651', '#d0ec84'],
    patch: 46,
    lush: 0.4,
    sun: 0.63,
    marks: [0.72, 0.5, 0.42],
    tufts: [40, 14, 3],
    clover: 3,
    cloverTone: ['#2c7040', '#3f8c4a', '#5cac58', '#8ccf74'],
    flowers: 7,
    species: [['cup', '#f8d838', 4], ['daisy', '#f6f2e2', 4], ['poppy', '#f08a30', 2], ['bell', '#9a8ae8', 1]],
    pebbles: 0.5,
    rings: 0.7,
    caps: ['#8a2a1c', '#d0472e', '#f6dcc0'],
    leaves: 0.25,
    leafTone: ['#c8642a', '#e09a3a', '#d8b850'],
    moss: 0,
    petals: 0,
    fringe: 0.5,
  },
  // The farm: a late-summer meadow, warmer and yellower, worn to straw in patches; dandelions, daisies,
  // pink clover, hay.
  farmland: {
    g: ['#22341b', '#344d22', '#496a28', '#5e812e', '#739536', '#8dab40', '#b2c65a', '#dae08c'],
    dry: ['#3a3418', '#5a4e24', '#7a6a32', '#94823e', '#a8944a', '#c0aa58', '#d8c47a', '#eedca0'],
    patch: 52,
    lush: 0.38,
    sun: 0.64,
    dryAt: 0.71,
    marks: [0.48, 0.38, 0.3],
    tufts: [24, 10, 2.6],
    clover: 1.6,
    cloverTone: ['#33522a', '#476e36', '#628e46', '#8eb664'],
    flowers: 3.4,
    species: [['cup', '#f4d65a', 4], ['daisy', '#fbf4e0', 3], ['poppy', '#e8904a', 2], ['cup', '#e08aa8', 2]],
    pebbles: 0.7,
    rings: 0.25,
    caps: ['#6a4426', '#a8784a', '#e8cfa0'],
    leaves: 0.3,
    leafTone: ['#a8842a', '#c89a3a', '#8a5a2a'],
    moss: 0,
    petals: 0,
    fringe: 0.55,
  },
  // Gloomwood: a dark mossy floor at night, blue-green; cushions of brighter moss, leaf litter, tiny
  // glowing flowers.
  forest: {
    g: ['#0b1513', '#13211c', '#1b2e25', '#24392d', '#2f4734', '#3c5a3d', '#52744a', '#6c9058'],
    // Bare earth under the leaf litter, in patches between the moss.
    dry: ['#0e100b', '#181a12', '#212418', '#2b2d1e', '#363724', '#47462d', '#5f5b39', '#7c7548'],
    patch: 40,
    lush: 0.42,
    sun: 0.62,
    dryAt: 0.68,
    marks: [0.45, 0.35, 0.3],
    tufts: [16, 6, 1.6],
    clover: 0.8,
    cloverTone: ['#142a20', '#1f402e', '#2f5a3c', '#467a50'],
    flowers: 1.2,
    species: [['speck', '#6fd0c0', 3], ['bell', '#b48ae0', 2], ['speck', '#e0d070', 1]],
    pebbles: 0.6,
    rings: 0.5,
    caps: ['#5a3a20', '#9a6a3a', '#e0c49a'],
    leaves: 4,
    leafTone: ['#6a4a2c', '#8a5e34', '#a8642a', '#5a5a2a', '#9a7a3a'],
    moss: 5.5,
    mossTone: ['#13281c', '#24442a', '#3a6433', '#5a8a3c'],
    petals: 0,
    fringe: 0.45,
  },
  // The shrine's velvet moss: soft cushions, star moss, pink petals drifting off the maples.
  shrine: {
    g: ['#101c19', '#18291f', '#213628', '#2b4632', '#36563b', '#456a47', '#5c845a', '#7ca270'],
    patch: 44,
    lush: 0.4,
    sun: 0.62,
    marks: [0.42, 0.32, 0.28],
    tufts: [12, 4, 1],
    clover: 0.6,
    cloverTone: ['#1a3024', '#26442e', '#365e3e', '#507e54'],
    flowers: 1.8,
    species: [['cup', '#e8a0c0', 3], ['speck', '#ffe0a0', 2], ['daisy', '#f4ecf0', 1]],
    pebbles: 0.6,
    rings: 0.2,
    caps: ['#6a2a3a', '#b04a5e', '#f0c8d0'],
    leaves: 0.4,
    leafTone: ['#a82c2c', '#d4523a', '#781c25'],
    moss: 4,
    mossTone: ['#132a20', '#24442e', '#36603a', '#52804a'],
    petals: 5,
    petalTone: ['#c96f92', '#eba1ba', '#ffd8e4', '#eba1ba'],
    fringe: 0.4,
  },
  // Hollow Graves: thin blue-grey grass gone to straw, dead tufts, fallen leaves, a few violets.
  graveyard: {
    g: ['#0d1214', '#141b1f', '#1b2428', '#232e32', '#2c393c', '#394846', '#4e5b52', '#6c7466'],
    dry: ['#14141a', '#1e1e22', '#2a2a2c', '#353532', '#41403a', '#504c40', '#665e4c', '#827660'],
    patch: 40,
    lush: 0.4,
    sun: 0.64,
    dryAt: 0.66,
    marks: [0.42, 0.34, 0.3],
    tufts: [18, 7, 2],
    clover: 0,
    flowers: 0.7,
    species: [['bell', '#a07ad0', 3], ['speck', '#c8b8e8', 1]],
    pebbles: 0.8,
    rings: 0.3,
    caps: ['#3a2a3e', '#6a4a72', '#c8b0d0'],
    leaves: 1.6,
    leafTone: ['#4a3424', '#5e4430', '#6e5a3a'],
    moss: 0.6,
    mossTone: ['#121c1c', '#1a2a28', '#263a34', '#344c42'],
    petals: 0,
    fringe: 0.4,
  },
  // The bog's grassy causeways: rank wet grass, olive.
  swamp: {
    g: ['#121a0f', '#1b2715', '#26361c', '#314625', '#3e582e', '#4f6c38', '#668646', '#88a65a'],
    patch: 40,
    lush: 0.42,
    sun: 0.62,
    marks: [0.45, 0.36, 0.3],
    tufts: [22, 9, 2.4],
    clover: 0.6,
    cloverTone: ['#1c3020', '#2a4628', '#3c6234', '#58824a'],
    flowers: 0.6,
    species: [['cup', '#c0b050', 2], ['speck', '#e8e0a0', 1]],
    pebbles: 0.3,
    rings: 0.2,
    caps: ['#4a3a20', '#8a7040', '#d8c890'],
    leaves: 0.4,
    leafTone: ['#5a4a2a', '#6a5a30'],
    moss: 1.2,
    mossTone: ['#14241a', '#203a24', '#2e5230', '#46703c'],
    petals: 0,
    fringe: 0.45,
  },
};

/** A look for a biome's lawn: its own, or one built from its ground ramp. */
export function grassLook(biome: Biome, material: 'ground' | 'path'): GrassLook {
  const own = LOOKS[biome.id];
  if (own) return own;
  const r = material === 'ground' ? biome.ground.ramp : biome.path.ramp;
  const acc = (material === 'ground' ? biome.ground.accent : biome.path.accent) ?? ['#e8c86a', '#f0eee0'];
  const deep = mixHex(shade(r[0], -0.3), '#0a1a24', 0.25);
  return {
    g: [deep, r[0], mixHex(r[1], r[2], 0.4), r[2], r[3], mixHex(r[3], r[4], 0.6), r[4], mixHex(r[4], '#f0f0c0', 0.4)],
    patch: 44,
    lush: 0.4,
    sun: 0.63,
    marks: [0.45, 0.36, 0.3],
    tufts: [20, 7, 2],
    clover: 0,
    flowers: 1.5,
    species: acc.map((c) => ['cup', c, 1] as const),
    pebbles: 0.5,
    rings: 0,
    leaves: 0,
    moss: 0,
    petals: 0,
    fringe: 0.45,
  };
}

// ------------------------------------------------------------------ stamps

/**
 * Ordered dither in blade-shaped dashes (each value covers a 1 x 2 pair of pixels, rows staggered),
 * so the patches' edges break up like grass, not like a screen. Offsets in [-0.5, 0.5).
 */
const DITHER = [0, 8, 4, 12, 0, 8, 4, 12, 10, 2, 14, 6, 10, 2, 14, 6].map((v) => (v + 1) / 16 - 0.5);

/**
 * A blade: its root's x (from the tuft's middle), height, how far its tip leans out (px), and depth
 * (0 at the back, 2 in front).
 */
type Blade = readonly [x: number, h: number, lean: number, depth: number];

/** Op lists: dx, dy, tone (steps from the patch's own green), flattened. */
type Ops = Int8Array;

/**
 * Tufts, placed blade by blade, each a fan springing from one clump of roots: small (3-5 px across),
 * medium (6-8) and big clumps (10-13), the middle blades upright and tallest, the outer ones leaning
 * out and lower.
 */
const TUFT_BLADES: Blade[][][] = [
  [
    [[0, 3, -2, 1], [0, 4, 0, 2], [0, 3, 2, 1]],
    [[0, 3, -1, 2], [1, 3, 2, 1], [0, 2, 0, 0]],
    [[-1, 2, -1, 1], [0, 4, 1, 2], [1, 2, 2, 0]],
    [[0, 3, -2, 2], [0, 2, 1, 0], [1, 3, 1, 1]],
    [[0, 4, -1, 2], [0, 3, 2, 1], [-1, 2, -2, 0], [1, 2, 0, 0]],
  ],
  [
    [[-1, 3, -3, 1], [-1, 5, -1, 2], [0, 4, 0, 0], [0, 6, 0, 2], [1, 5, 1, 1], [1, 4, 3, 2], [0, 3, -2, 0]],
    [[-1, 4, -3, 2], [0, 5, -1, 1], [0, 3, 1, 0], [1, 6, 1, 2], [1, 4, 3, 1], [0, 2, -1, 2]],
    [[-1, 3, -2, 0], [-1, 5, -2, 2], [0, 6, 0, 1], [1, 5, 2, 2], [1, 3, 3, 1], [0, 3, 1, 2]],
  ],
  [
    [[-2, 3, -4, 0], [-2, 5, -3, 1], [-1, 6, -2, 2], [-1, 4, -1, 0], [0, 7, -1, 1], [0, 8, 0, 2], [1, 6, 1, 0], [1, 7, 2, 2], [2, 5, 3, 1], [2, 3, 4, 2], [0, 4, 1, 2], [-1, 3, -2, 2]],
    [[-2, 4, -4, 1], [-2, 3, -2, 0], [-1, 6, -3, 2], [-1, 7, -1, 1], [0, 5, 0, 0], [0, 7, 1, 2], [1, 8, 1, 1], [1, 5, 3, 2], [2, 4, 4, 1], [2, 3, 2, 0], [0, 3, -1, 2]],
    [[-2, 3, -3, 2], [-1, 5, -4, 0], [-1, 7, -2, 2], [0, 6, -1, 0], [0, 8, 0, 1], [1, 7, 1, 2], [1, 5, 2, 0], [2, 6, 3, 1], [2, 4, 4, 2], [0, 4, 0, 2], [1, 3, 2, 2]],
  ],
];

/** A blade's tone at height k of h: dark roots, bright tips catching the sun; blades at the back darker. */
function bladeTone(k: number, h: number, depth: number): number {
  if (k === 0) return depth === 2 ? -2 : -3;
  if (k === h - 1) return depth === 0 ? 0 : depth + 1;
  if (k < h / 2) return depth === 2 ? 0 : -1;
  return depth === 0 ? -1 : depth;
}

/** A tuft's op list, its roots along y = 0 round x = 0; `flip` mirrors it. */
function tuftOps(blades: Blade[], flip: boolean): Ops {
  const ops: number[] = [];
  const sorted = [...blades].sort((a, b) => a[3] - b[3]);
  for (const [bx, h, lean, depth] of sorted) {
    for (let k = 0; k < h; k++) {
      const t = h > 1 ? k / (h - 1) : 0;
      let x = bx + Math.round(lean * t ** 1.25);
      if (flip) x = -x;
      ops.push(x, -k, bladeTone(k, h, depth));
    }
  }
  return Int8Array.from(ops);
}

const TUFTS: Ops[][] = TUFT_BLADES.map((set) => set.flatMap((b) => [tuftOps(b, false), tuftOps(b, true)]));
/** How far a tuft's roots spread each side of its middle (for the shade at its foot). */
const TUFT_ROOTS = [1, 2, 3];

/**
 * Blade marks for the texture, as (dx, dy, tone) ops, all of them single blades or pairs standing up
 * from the ground (y = 0): dark blades, blades leaning left or right, blades with a lit tip, lit tips.
 */
const MARKS: Ops[] = [
  Int8Array.from([0, 0, -1, 0, -1, -1]),
  Int8Array.from([0, 0, -1, 1, -1, -1]),
  Int8Array.from([1, 0, -1, 0, -1, -1]),
  Int8Array.from([0, 0, -1, 0, -1, 1]),
  Int8Array.from([0, 0, -1, 0, -1, -1, 2, 0, -1, 2, -1, 1]),
  Int8Array.from([0, 0, 1]),
  Int8Array.from([0, 0, 0, 0, -1, 1]),
  Int8Array.from([0, 0, 1, 1, -1, 2]),
];
/** Which marks each patch uses: lush grass shows dark blades, sunlit grass lit tips. */
const MARK_SETS = [
  [0, 0, 1, 2, 4, 3],
  [0, 1, 2, 3, 3, 6],
  [3, 5, 5, 6, 7, 1],
];

// ------------------------------------------------------------------ the lawn

/** Where the dressing may paint: the floor's pixels and what each one is. */
export interface DressCtx {
  W: number;
  H: number;
  px: Uint8ClampedArray;
  /** What each pixel is (terrain.ts's surface codes). */
  surf: Uint8Array;
  /** How much each pixel was darkened (0..255): under trees, by walls, on banks. */
  shade: Uint8Array;
  /** By surface code: 1 where this lawn is. */
  mine: Uint8Array;
  /** By surface code: 1 where blades at the lawn's edge may lean out over (paths, fields, curbs, wall feet). */
  spill: Uint8Array;
  /** Is (x, y) near the edge of the woods or a wall (richer growth)? */
  edge(x: number, y: number): boolean;
  /** Tiles (`tile` px square, `tilesW` across) where the ground changes kind: the only places with edges. */
  mixed: Uint8Array;
  tile: number;
  tilesW: number;
  /** Stone tones for pebbles, dark to light. */
  stone: readonly string[];
}

export class Grass {
  /** Each pixel's patch: green or dry ramp (bit 3) and the patch's own step (2 lush, 3 plain, 4 sunlit); 0 none. */
  readonly zone: Uint8Array;
  private nA: VNoise;
  private nB: VNoise;
  private nDry: VNoise | null;
  private nRich: VNoise;
  /** Every step of both ramps as 0xRRGGBB, by zone code (ramp * 8 + step). */
  private packed = new Int32Array(16);
  /** RGB of every step of both ramps: (ramp * 8 + step) * 3. */
  private rgb = new Uint8Array(16 * 3);
  private ditherAmp: number;

  constructor(private look: GrassLook, private seed: number, private W: number, H: number) {
    this.zone = new Uint8Array(W * H);
    this.nA = new VNoise(look.patch, seed + 701, W, H);
    this.nB = new VNoise(Math.round(look.patch / 3), seed + 702, W, H);
    this.nDry = look.dry ? new VNoise(Math.round(look.patch * 1.3), seed + 703, W, H) : null;
    this.nRich = new VNoise(88, seed + 704, W, H);
    const ramps = [look.g, look.dry ?? look.g];
    ramps.forEach((r, ri) => r.forEach((c, k) => {
      const [cr, cg, cb] = rgb(c);
      this.packed[ri * 8 + k] = (cr << 16) | (cg << 8) | cb;
      this.rgb.set([cr, cg, cb], (ri * 8 + k) * 3);
    }));
    // A few px of dithered edge round each patch (dry patches a crisper one).
    this.ditherAmp = 2.6 / look.patch;
  }

  private rowY = -1;

  /** The lawn's color at whole pixel (x, y) as 0xRRGGBB, remembering the patch there for the dressing. */
  color(x: number, y: number): number {
    const L = this.look;
    if (y !== this.rowY) {
      this.rowY = y;
      this.nA.row(y);
      this.nB.row(y);
      this.nDry?.row(y);
    }
    const d = DITHER[((y & 3) << 2) | (x & 3)] * this.ditherAmp;
    const n = this.nA.atRow(x) * 0.72 + this.nB.atRow(x) * 0.28 + d;
    let z = n < L.lush ? 2 : n > L.sun ? 4 : 3;
    if (this.nDry && this.nDry.atRow(x) + d * 0.6 > L.dryAt!) z += 8;
    this.zone[y * this.W + x] = z;
    return this.packed[z];
  }

  /** Paints the blades, tufts, clover, flowers and the rest over the finished ground. */
  dress(c: DressCtx): void {
    const { W, H, px, surf, shade: dk, mine, spill } = c;
    const L = this.look;
    const S = this.seed;
    const zone = this.zone;
    const RGB = this.rgb;

    // --- painting helpers (all clipped to the floor; `mine` pixels only unless spilling)
    /** A pixel `d` steps from patch `z`'s green, at the pixel's own shade (or `f`, spilling over an edge). */
    const rel = (x: number, y: number, z: number, d: number, f = -1) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const j = y * W + x;
      const s = surf[j];
      if (f < 0) {
        if (!mine[s]) return;
        f = 1 - dk[j] / 255;
      } else if (!mine[s] && !spill[s]) return;
      let k = (z & 7) + d;
      k = k < 0 ? 0 : k > 7 ? 7 : k;
      const t = ((z >> 3) * 8 + k) * 3;
      const i = j * 4;
      px[i] = RGB[t] * f;
      px[i + 1] = RGB[t + 1] * f;
      px[i + 2] = RGB[t + 2] * f;
    };
    /** A pixel in a color of its own (flowers, stones), shaded like the lawn under it. */
    const put = (x: number, y: number, col: readonly number[]) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const j = y * W + x;
      if (!mine[surf[j]]) return;
      const f = 1 - dk[j] / 255;
      const i = j * 4;
      px[i] = col[0] * f;
      px[i + 1] = col[1] * f;
      px[i + 2] = col[2] * f;
    };
    /** Darkens a pixel of the lawn (or one a blade leans over) by `f`. */
    const darken = (x: number, y: number, f: number) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const j = y * W + x;
      if (!mine[surf[j]] && !spill[surf[j]]) return;
      const i = j * 4;
      px[i] *= f;
      px[i + 1] *= f;
      px[i + 2] *= f;
    };
    const lawn = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mine[surf[y * W + x]] === 1;
    const zoneAt = (x: number, y: number) => zone[y * W + x] || 3;
    const rich = (x: number, y: number) => this.nRich.at(x, y) + (c.edge(x, y) ? 0.25 : 0);
    /** Stamps ops at (x, y) in patch z; blades above the root row may lean out over the lawn's edges. */
    const stamp = (ops: Ops, x: number, y: number, z: number) => {
      const f = 1 - dk[y * W + x] / 255;
      for (let k = 0; k < ops.length; k += 3) {
        const dy = ops[k + 1];
        rel(x + ops[k], y + dy, z, ops[k + 2], dy < 0 ? f : -1);
      }
    };
    /** Places something on a jittered grid of `cell` px, `per10k` per 10 000 px at full richness. */
    const scatter = (cell: number, per10k: number, salt: number, fn: (x: number, y: number, u: number) => void) => {
      if (per10k <= 0) return;
      const p = (per10k * cell * cell) / 10000;
      const cols = Math.ceil(W / cell);
      const rows = Math.ceil(H / cell);
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const u = h2(cx, cy, S + salt);
          if (u >= p) continue;
          const x = cx * cell + Math.floor(h2(cx, cy, S + salt + 1) * cell);
          const y = cy * cell + Math.floor(h2(cx, cy, S + salt + 2) * cell);
          if (!lawn(x, y)) continue;
          // Richness thins things out in calm stretches and crowds them in rich ones.
          if (u / p > Math.min(1, Math.max(0.15, 0.25 + (rich(x, y) - 0.3) * 1.5))) continue;
          fn(x, y, h2(cx, cy, S + salt + 3));
        }
      }
    };

    // --- the texture: blade marks on a jittered 4 x 3 grid, thicker in the lush patches
    // (One hash per cell: its low byte the chance, the next bits the place in the cell and the mark.)
    for (let cy = 0; cy * 3 < H; cy++) {
      for (let cx = 0; cx * 4 < W; cx++) {
        const hv = (h2(cx, cy, S + 710) * 4294967296) >>> 0;
        const u = (hv & 255) / 256;
        if (u > 0.85) continue;
        const x = cx * 4 + ((hv >>> 8) & 3);
        const y = cy * 3 + ((hv >>> 10) & 3) % 3;
        if (!lawn(x, y)) continue;
        const z = zoneAt(x, y);
        const p = (z & 7) - 2;
        if (u > L.marks[p]) continue;
        const set = MARK_SETS[p];
        const ops = MARKS[set[(hv >>> 12) % set.length]];
        for (let k = 0; k < ops.length; k += 3) rel(x + ops[k], y + ops[k + 1], z, ops[k + 2]);
      }
    }

    // --- clover: a mat of three-leaved sprigs, lit on their top-left leaflets, now and then a flower
    if (L.clover > 0 && L.cloverTone) {
      const ct = L.cloverTone.map(rgb);
      const flower = [rgb('#f6f0ee'), rgb('#e2c6d4'), rgb('#c89aae')];
      scatter(26, L.clover, 720, (x, y, u) => {
        const n = 5 + Math.floor(u * 8);
        const rx = 5 + u * 3;
        const ry = 2.5 + u * 1.6;
        const spots: Array<[number, number]> = [];
        for (let k = 0; k < n * 3 && spots.length < n; k++) {
          const a = h2(x + k, y, S + 721) * Math.PI * 2;
          const r = Math.sqrt(h2(x, y + k, S + 722));
          const sx = Math.round(x + Math.cos(a) * rx * r);
          const sy = Math.round(y + Math.sin(a) * ry * r);
          if (spots.some(([px, py]) => Math.abs(px - sx) < 3 && Math.abs(py - sy) < 2)) continue;
          spots.push([sx, sy]);
        }
        spots.sort((p, q) => p[1] - q[1]);
        // Each sprig a little round leaf cluster: lit on its top-left, darker round the lower right,
        // a touch of shade under it.
        for (const [sx, sy] of spots) {
          put(sx + 1, sy + 1, ct[0]);
          put(sx + 2, sy, ct[0]);
          put(sx, sy, ct[2]);
          put(sx + 1, sy, ct[1]);
          put(sx, sy + 1, ct[1]);
          put(sx, sy - 1, ct[3]);
          put(sx - 1, sy, ct[3]);
          put(sx + 1, sy - 1, ct[2]);
        }
        if (u > 0.45) {
          const [fx, fy] = spots[Math.floor(u * 97) % spots.length];
          put(fx, fy - 1, flower[0]);
          put(fx + 1, fy - 1, flower[1]);
          put(fx, fy, flower[1]);
          put(fx + 1, fy, flower[2]);
        }
      });
    }

    // --- moss cushions: little rounded mounds, lit from the top left
    if (L.moss > 0 && L.mossTone) {
      const mt = L.mossTone.map(rgb);
      scatter(18, L.moss, 730, (x, y, u) => {
        const n = 1 + Math.floor(u * 4);
        for (let k = 0; k < n; k++) {
          const mx = x + Math.round((h2(x, k, S + 731) - 0.5) * 9);
          const my = y + Math.round((h2(y, k, S + 732) - 0.5) * 5);
          const rx = 1.8 + h2(mx, my, S + 733) * 2.4;
          const ry = 1.1 + h2(mx, my, S + 734) * 1.1;
          for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry) + 1; dy++) {
            for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
              const e = (dx / (rx + 0.3)) ** 2 + (dy / (ry + 0.3)) ** 2;
              if (dy === Math.ceil(ry) + 1) {
                // Its shadow on the ground, to the lower right.
                if (dx >= 0 && e < 2.2) put(mx + dx, my + dy, mt[0]);
                continue;
              }
              if (e > 1) continue;
              const lit = -dx / (rx + 0.3) * 0.6 - dy / (ry + 0.3) * 0.8;
              put(mx + dx, my + dy, mt[lit > 0.45 ? 3 : lit > -0.25 ? 2 : 1]);
            }
          }
        }
      });
    }

    // --- pebbles
    if (L.pebbles > 0) {
      const st = c.stone.map(rgb);
      scatter(40, L.pebbles, 740, (x, y, u) => {
        const n = 1 + Math.floor(u * 3);
        for (let k = 0; k < n; k++) {
          const sx = x + Math.round((h2(x, k, S + 741) - 0.5) * 7);
          const sy = y + Math.round((h2(y, k, S + 742) - 0.5) * 4);
          const big = h2(sx, sy, S + 743) < 0.4;
          put(sx, sy, st[4]);
          put(sx + 1, sy, st[3]);
          if (big) {
            put(sx - 1, sy + 1, st[3]);
            put(sx, sy + 1, st[2]);
            put(sx + 1, sy + 1, st[1]);
            darken(sx + 2, sy + 1, 0.72);
            darken(sx, sy + 2, 0.72);
            darken(sx + 1, sy + 2, 0.72);
          } else {
            put(sx, sy + 1, st[2]);
            put(sx + 1, sy + 1, st[1]);
            darken(sx + 2, sy + 1, 0.75);
            darken(sx + 1, sy + 2, 0.75);
          }
        }
      });
    }

    // --- fallen leaves and petals, in drifts
    const drift = (tone: readonly string[], per10k: number, salt: number, petal: boolean) => {
      if (per10k <= 0) return;
      const cols = tone.map(rgb);
      const darks = tone.map((t) => rgb(shade(t, -0.3)));
      scatter(30, per10k, salt, (x, y, u) => {
        const n = 4 + Math.floor(u * 8);
        for (let k = 0; k < n; k++) {
          const lx = x + Math.round((h2(x, k, S + salt + 5) - 0.5) * 16);
          const ly = y + Math.round((h2(y, k, S + salt + 6) - 0.5) * 8);
          const ci = Math.floor(h2(lx, ly, S + salt + 7) * cols.length);
          const shape = h2(lx, ly, S + salt + 8);
          put(lx, ly, cols[ci]);
          if (petal) {
            if (shape < 0.4) put(lx + 1, ly, darks[ci]);
          } else if (shape < 0.4) put(lx + 1, ly, darks[ci]);
          else if (shape < 0.75) put(lx + 1, ly + 1, darks[ci]);
          else put(lx, ly + 1, darks[ci]);
          darken(lx + 1, ly + (shape < 0.4 ? 1 : 2), 0.8);
        }
      });
    };
    if (L.leafTone) drift(L.leafTone, L.leaves, 750, false);
    if (L.petalTone) drift(L.petalTone, L.petals, 760, true);

    // --- tufts: small ones scattered, medium ones fewer, big clumps where it's rich
    const tuftAt = (size: number, x: number, y: number, u: number) => {
      const set = TUFTS[size];
      const ops = set[Math.floor(u * set.length)];
      const z = zoneAt(x, y);
      // The shade at its foot, cast a little to the lower right.
      const half = TUFT_ROOTS[size];
      for (let dx = -half + 1; dx <= half + 1; dx++) darken(x + dx, y + 1, dx === -half + 1 || dx === half + 1 ? 0.88 : 0.76);
      stamp(ops, x, y, z);
    };
    for (let size = 0; size < 3; size++) {
      scatter([9, 16, 26][size], L.tufts[size], 770 + size * 10, (x, y, u) => tuftAt(size, x, y, u));
    }
    // Patches of long grass where it's richest: a lush hollow crowded with tufts, back to front.
    scatter(40, L.tufts[2] * 0.9, 795, (x, y, u) => {
      if (rich(x, y) < 0.62) return;
      const z = zoneAt(x, y);
      const rx = 6 + u * 6;
      const ry = 3 + u * 2;
      for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
        for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
          if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) continue;
          if ((x + dx + y + dy) & 1 && (dx / rx) ** 2 + (dy / ry) ** 2 > 0.6) continue;
          rel(x + dx, y + dy, z, -1);
        }
      }
      const n = 4 + Math.floor(u * 5);
      const spots: Array<[number, number]> = [];
      for (let k = 0; k < n; k++) spots.push([x + Math.round((h2(x, k, S + 796) - 0.5) * rx * 1.7), y + Math.round((h2(y, k, S + 797) - 0.5) * ry * 1.6)]);
      spots.sort((p, q) => p[1] - q[1]);
      spots.forEach(([sx, sy], k) => {
        if (lawn(sx, sy)) tuftAt(k % 3 === 0 ? 1 : 0, sx, sy, h2(sx, sy, S + 798));
      });
    });

    // --- flowers: clusters of one or two kinds on a few leaves
    if (L.flowers > 0) {
      const kinds = L.species.map(([sp, col, w]) => ({ sp, w, tone: bloom(col).map(rgb) }));
      const total = kinds.reduce((a, k) => a + k.w, 0);
      const pick = (u: number) => {
        let r = u * total;
        for (const k of kinds) {
          r -= k.w;
          if (r < 0) return k;
        }
        return kinds[kinds.length - 1];
      };
      /** A clump of `n` flowers, kind a with now and then one of kind b, its foot at (x, y). */
      const clump = (x: number, y: number, a: (typeof kinds)[number], b: (typeof kinds)[number], n: number) => {
        if (!lawn(x, y)) return;
        const z = zoneAt(x, y);
        // The clump's foot: a few leaves in a low mound, lit on top, a little shade under the middle.
        const rx = 2 + n * 0.55;
        for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
          const v = h2(x + dx, y, S + 805);
          const out = Math.abs(dx) / rx;
          if (out > 1 || (out > 0.6 && v < 0.55)) continue;
          if (out < 0.5) rel(x + dx + 1, y + 1, z, -1);
          rel(x + dx, y, z, (x + dx) & 1 ? -1 : 0);
          if (v > 0.45 && out < 0.85) rel(x + dx, y - 1, z, v > 0.75 ? 2 : 1);
        }
        // Heads on stems of a few lengths, none crowding another.
        const heads: Array<[number, number]> = [];
        for (let k = 0; k < n * 4 && heads.length < n; k++) {
          const fx = x + Math.round((h2(x, k, S + 803) - 0.5) * rx * 2);
          const fy = y - 2 - Math.floor(h2(y, k, S + 804) * 3);
          if (!lawn(fx, y) || heads.some(([hx, hy]) => Math.abs(hx - fx) < 2 && Math.abs(hy - fy) < 2)) continue;
          heads.push([fx, fy]);
        }
        heads.sort((p, q) => p[1] - q[1]);
        for (const [fx, fy] of heads) {
          for (let sy = fy + 1; sy < y; sy++) rel(fx, sy, z, sy === y - 1 ? -2 : -1);
          if (fy < y - 3) rel(fx + (fx & 1 ? 1 : -1), fy + 2, z, 1);
        }
        heads.forEach(([fx, fy], k) => {
          const f = k % 3 === 2 ? b : a;
          const t = f.tone;
          switch (f.sp) {
            case 'daisy':
              put(fx, fy, t[4]);
              put(fx - 1, fy, t[3]);
              put(fx, fy - 1, t[3]);
              put(fx + 1, fy, t[1]);
              put(fx, fy + 1, t[0]);
              break;
            case 'cup':
              put(fx, fy, t[3]);
              put(fx + 1, fy, t[2]);
              put(fx, fy + 1, t[1]);
              put(fx + 1, fy + 1, t[0]);
              break;
            case 'poppy':
              put(fx, fy, t[2]);
              put(fx + 1, fy, t[1]);
              put(fx, fy + 1, t[1]);
              put(fx + 1, fy + 1, t[0]);
              put(fx, fy - 1, t[3]);
              break;
            case 'bell':
              put(fx, fy, t[2]);
              put(fx, fy + 1, t[0]);
              put(fx + 1, fy, t[1]);
              break;
            case 'speck':
              put(fx, fy, t[3]);
              if (k % 2) put(fx + 1, fy, t[1]);
              break;
          }
        });
      };
      scatter(22, L.flowers, 800, (x, y, u) => {
        const a = pick(u);
        const b = pick(h2(x, y, S + 801));
        clump(x, y, a, b, 3 + Math.floor(h2(x, y, S + 802) * 5));
        // Where it's richest, a little bed of them: two more clumps of the same flowers alongside.
        if (rich(x, y) > 0.62 && h2(x, y, S + 806) < 0.5) {
          clump(x - 5 - Math.floor(u * 3), y + 4 + Math.floor(h2(y, x, S + 810) * 2), a, b, 3 + Math.floor(h2(y, x, S + 807) * 3));
          clump(x + 4 + Math.floor(u * 4), y - 4 - Math.floor(h2(x, y, S + 808) * 2), a, a, 2 + Math.floor(h2(x, y, S + 809) * 3));
        }
      });
    }

    // --- fairy rings: a ring of greener grass with little mushrooms round it
    if (L.rings > 0 && L.caps) {
      const cap = L.caps.map(rgb);
      const stem = rgb('#efe2c8');
      scatter(64, L.rings / 10, 820, (x, y, u) => {
        const rx = 7 + u * 5;
        const ry = rx * 0.55;
        const z = zoneAt(x, y);
        for (let k = 0; k < 64; k++) {
          const a = (k / 64) * Math.PI * 2;
          rel(Math.round(x + Math.cos(a) * rx), Math.round(y + Math.sin(a) * ry), z, -1);
        }
        const n = 6 + Math.floor(u * 6);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + h2(x, k, S + 821) * 0.5;
          if (h2(y, k, S + 822) < 0.2) continue;
          const mx = Math.round(x + Math.cos(a) * rx);
          const my = Math.round(y + Math.sin(a) * ry);
          put(mx, my, stem);
          put(mx - 1, my - 1, cap[2]);
          put(mx, my - 1, cap[1]);
          put(mx + 1, my - 1, cap[0]);
          darken(mx + 1, my, 0.7);
        }
      });
    }

    // --- the lawn's edges: blades leaning out over paths, fields, curbs and the feet of walls,
    // and now and then a whole clump
    // (Only tiles where the ground changes kind can have an edge.)
    for (let ty = 0; ty * c.tile < H; ty++) for (let tx = 0; tx * c.tile < W; tx++) {
      if (!c.mixed[ty * c.tilesW + tx]) continue;
      const y1 = Math.min(H - 1, (ty + 1) * c.tile);
      const x1 = Math.min(W - 1, (tx + 1) * c.tile);
      for (let y = Math.max(1, ty * c.tile); y < y1; y++) for (let x = Math.max(1, tx * c.tile); x < x1; x++) {
        const j = y * W + x;
        if (!mine[surf[j]]) continue;
        const up = spill[surf[j - W]];
        const down = spill[surf[j + W]];
        const left = spill[surf[j - 1]];
        const right = spill[surf[j + 1]];
        if (!(up | down | left | right)) continue;
        const u = h2(x, y, S + 900);
        const z = zone[j] || 3;
        const f = 1 - dk[j] / 255;
        if (up) {
          if (u < 0.05) {
            tuftAt(u < 0.015 ? 1 : 0, x, y + 1, h2(x, y, S + 901));
            continue;
          }
          if (u < L.fringe) {
            const len = 1 + (u < L.fringe * 0.45 ? 1 : 0) + (u < L.fringe * 0.15 ? 1 : 0);
            const lean = h2(x, y, S + 902) < 0.5 ? -1 : 1;
            for (let k = 1; k <= len; k++) rel(x + (k === len && len > 1 ? lean : 0), y - k, z, k === len ? 2 : 1, f);
          }
        } else if (down) {
          if (u < L.fringe * 0.8) {
            rel(x, y + 1, z, 0, f);
            if (u < L.fringe * 0.3) rel(x + (u < L.fringe * 0.15 ? 1 : 0), y + 2, z, -1, f);
            darken(x + 1, y + 2, 0.85);
          }
        }
        if ((left || right) && !up && u > 1 - L.fringe * 0.6) {
          const dir = left ? -1 : 1;
          rel(x + dir, y, z, 1, f);
          if (u > 1 - L.fringe * 0.25) rel(x + dir * 2, y - 1, z, 2, f);
        }
      }
    }
  }
}
