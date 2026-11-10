/**
 * Trees, painted for every biome in several sizes. `treeArt2(kind, biome, seed, size)` drops in where
 * `treeArt` was: the same PropArt (anchored at the trunk's foot, the crown above the trunk so the
 * renderer's sway bends only the crown), plus a suggested shadow pool, the crown's box (for
 * see-through checks and falling leaves) and leaf colors.
 *
 * Leafy trees (oaks, maples, apples, willows, bushes) are drawn after the user's reference
 * (tree/clumps.ts): crowns of many round leaf clumps lit on the top left over deep green gaps, leaves
 * dripping from their lower edge, reddish-brown trunks with a light stripe that fork into branches,
 * spreading roots, vines; four silhouettes (a heavy dome, an umbrella, a round lollipop, a split tree)
 * in each biome's tree colors (biomes.ts treeRamp), autumn and blossom ones among them. Conifers, dead
 * trees, mushrooms, crystals and cacti keep their painters (tree/conifer.ts, tree/odd.ts).
 * Every tree gets its own shape and a small shift of hue and value from its seed; `depth` darkens and
 * fogs the trees deep in a wood so the rows behind recede.
 */
import type { Biome, TreeKind } from '../../world/biomes';
import { TREE_VARIANTS, type TreeSize } from '../../world/forest';
import type { PropArt } from './props';
import type { Ramp } from './tree/core';
import { shade } from './draw';
import { paintClumpTree, type ClumpSpec, type CrownShape } from './tree/clumps';
import { paintConifer, type ConiferSpec } from './tree/conifer';
import { paintCactus, paintCrystal, paintDead, paintMushroom } from './tree/odd';
import { BARK, INK, LEAF, MOSS, MOSS_DARK, NEEDLE, PETALS, SNOW, APPLE, deepen, jitter, mixC, shiftRamp, veil } from './tree/palette';

export type { TreeSize };

/** Bush: a trunkless clump of leaves (garden beds, hedges). The rest are trees, 28 to 90 px wide. */
export const TREE_SIZES: readonly TreeSize[] = ['bush', 'small', 'medium', 'huge'];

export interface TreeOpts {
  /**
   * 0 at the edge of the wood; 1 and 2 deeper in: darker and cooler (or veiled in the biome's fog),
   * so rows behind recede. Ignored by the garden look.
   */
  depth?: number;
}

export interface TreeArt extends PropArt {
  /** A soft shadow pool on the ground: its middle as an offset from the base, and its radii (px). */
  shadow: { dx: number; dy: number; rx: number; ry: number };
  /** The crown's box as offsets from the base (y negative is up). */
  crown: { x: number; y: number; w: number; h: number };
  /** Colors for leaves falling from it (empty: none fall). */
  leaves: string[];
}

type Look = 'garden' | 'wild';

/** Which look a biome's trees take. */
export function lookOf(biome: Biome): Look {
  return biome.id === 'hamlet' || biome.id === 'farmland' || biome.id === 'shrine' ? 'garden' : 'wild';
}

const cache = new Map<string, TreeArt>();

export function treeArt2(kind: TreeKind, biome: Biome, seed: number, size: TreeSize = 'medium', opts: TreeOpts = {}): TreeArt {
  const depth = Math.max(0, Math.min(2, Math.round(opts.depth ?? 0)));
  const key = `${kind}|${biome.id}|${biome.name}|${seed}|${size}|${depth}`;
  let a = cache.get(key);
  if (!a) {
    a = build(kind, biome, seed >>> 0, size, depth);
    cache.set(key, a);
    if (cache.size > 800) cache.delete(cache.keys().next().value!);
  }
  return a;
}

/**
 * The art for a placed tree prop. Props from `placeTrees` carry their size, variant and depth; older
 * props (room trees, the camp) fall back to a medium tree picked by the seed.
 */
export function artForTree(p: { tree?: TreeKind; seed: number; size?: TreeSize; variant?: number; depth?: number }, biome: Biome): TreeArt {
  const variant = p.variant ?? p.seed % TREE_VARIANTS;
  return treeArt2(p.tree ?? 'oak', biome, variant * 7919 + 13, p.size ?? 'medium', { depth: p.depth ?? 0 });
}

// ------------------------------------------------------------------ helpers

function r01(seed: number, k: number): number {
  let h = Math.imul(seed ^ (k * 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A size jitter of +-8% from the seed. */
function sj(seed: number, k = 0): number {
  return 0.92 + r01(seed, 90 + k) * 0.16;
}

/** Ramps darkened (or fogged) for trees deep in a wood. */
function recede(r: Ramp, biome: Biome, depth: number): string[] {
  if (depth <= 0) return [...r];
  const fog = biome.light.fog;
  if (fog) return veil(deepen(r, depth * 0.22), fog, depth * 0.11);
  return deepen(r, depth * 0.38);
}

/** A six-tone foliage ramp from a biome's five-tone tree ramp (for kinds a biome doesn't plan for). */
function fromBiome(r: Ramp): string[] {
  const d = mixC(r[0], '#05080c', 0.35);
  return [d, r[0], r[1], r[2], r[3], r[4] ?? mixC(r[3], '#ffffff', 0.3)];
}

/**
 * A crown's six tones (gaps, shade, dusk, mid, light, rim) from a biome's tree ramp: its deep green
 * deepened for the gaps, its light pushed toward its brightest so a clump's lit cap stands well off
 * its mid green (as in the reference), the brightest kept for the rims (unless that's the snow's white).
 */
function fromTree(r: Ramp): string[] {
  const top = r[4] ?? r[3];
  const snowy = top.toLowerCase() >= '#e0';
  const rim = snowy ? mixC(r[3], '#f4ffd0', 0.3) : top;
  const base = [mixC(r[0], '#04100c', 0.4), mixC(r[0], r[1], 0.45), shade(r[1], -0.06), r[2], mixC(r[3], rim, 0.55), mixC(rim, '#f4ffe0', 0.2)];
  // Richer than the ramp itself, the way the reference's greens are: the darks slid toward blue-green
  // (a crown's body sits off the yellow-green lawn under it), the lit caps bright and fresh.
  return base.map((c, k) => shiftRamp([c], [12, 10, 9, 6, 1, -3][k], [1.3, 1.3, 1.3, 1.26, 1.22, 1.1][k], [1, 1, 1, 0.97, 1.06, 1.06][k])[0]);
}

/** Needles from a biome's tree ramp: its crown tones, deeper and bluer (a conifer is darker than a broadleaf). */
function pineFrom(r: Ramp): string[] {
  return fromTree(r).map((c, k) => shiftRamp([c], 14 - k, 1.05, [0.78, 0.8, 0.8, 0.8, 0.82, 0.86][k])[0]);
}

/** Reddish-brown bark after the reference: deep plum, the trunk, its light side, the light stripe. */
const RED_BARK: Ramp = ['#22101a', '#33161f', '#5b3138', '#8e5252', '#aa7564'];

function grassOf(biome: Biome): [string, string] | undefined {
  const g = biome.ground;
  if (g.kind !== 'grass' && g.kind !== 'moss' && g.kind !== 'mud') return undefined;
  return [g.ramp[1], g.ramp[3]];
}

interface LeafLook {
  leaf: Ramp[];
  mix?: number[];
  ink?: { lit: string; dark: string; wood: string };
  blossom?: boolean;
  fruit?: boolean;
  moonRim?: boolean;
  bark: Ramp;
  moss?: Ramp;
  /** Falling leaf colors. */
  fall: string[];
}

/** Foliage for broad-leaved trees, per biome, with seeded variety (autumn, blossom). */
function leafLook(kind: TreeKind, biome: Biome, seed: number): LeafLook {
  const pick = r01(seed, 1);
  const j = (r: Ramp, k = 0) => jitter(r, seed + k);
  const green = fromTree(biome.treeRamp);
  switch (biome.id) {
    case 'hamlet': {
      if (kind === 'maple') {
        if (pick < 0.22) return { leaf: [j(LEAF.goldleaf), j(LEAF.orange, 3)], mix: [3, 1], ink: INK.goldleaf, bark: RED_BARK, fall: [LEAF.gold[4], LEAF.orange[4]] };
        if (pick < 0.34) return { leaf: [j(LEAF.orange), j(LEAF.red, 3)], mix: [2, 1], ink: INK.crimson, bark: RED_BARK, fall: [LEAF.orange[4], LEAF.red[4]] };
        return { leaf: [j(shiftRamp(green, -8, 1.02, 1.04))], ink: INK.garden, blossom: pick < 0.7, bark: RED_BARK, fall: [green[4]] };
      }
      if (pick < 0.1) return { leaf: [j(LEAF.goldleaf)], ink: INK.goldleaf, bark: RED_BARK, fall: [LEAF.goldleaf[4], LEAF.goldleaf[3]] };
      return { leaf: [j(green)], ink: INK.garden, blossom: pick < 0.55, bark: RED_BARK, moss: MOSS, fall: [green[4], PETALS[1]] };
    }
    case 'farmland': {
      if (kind === 'apple') return { leaf: [j(green)], ink: INK.garden, fruit: true, bark: RED_BARK, fall: [green[4]] };
      if (pick < 0.45) return { leaf: [j(LEAF.goldleaf), j(LEAF.orange, 3)], mix: [3, 1], ink: INK.goldleaf, bark: RED_BARK, fall: [LEAF.gold[4], LEAF.orange[4]] };
      return { leaf: [j(green)], ink: INK.garden, blossom: pick < 0.6, bark: RED_BARK, fall: [green[4]] };
    }
    case 'shrine': {
      if (pick < 0.6) return { leaf: [j(LEAF.sakura)], ink: INK.sakura, blossom: true, bark: RED_BARK, fall: [LEAF.sakura[4], LEAF.sakura[5]] };
      return { leaf: [j(LEAF.crimson), j(LEAF.red, 3)], mix: [3, 1], ink: INK.crimson, bark: RED_BARK, fall: [LEAF.crimson[4], LEAF.red[4]] };
    }
    case 'forest': {
      if (pick < 0.2) return { leaf: [j(LEAF.rust), j(green, 3)], mix: [3, 1], bark: RED_BARK, moss: MOSS_DARK, fall: [LEAF.rust[4], LEAF.rust[3]] };
      return { leaf: [j(green)], bark: RED_BARK, moss: MOSS_DARK, fall: [green[4], green[3]] };
    }
    case 'swamp':
      return { leaf: [j(green)], bark: kind === 'willow' ? BARK.willow : BARK.bog, moss: MOSS_DARK, fall: [green[4]] };
    case 'graveyard':
      return { leaf: [j(shiftRamp(LEAF.gloom, 40, 0.5, 0.85))], moonRim: true, bark: BARK.grave, fall: [] };
    case 'tundra':
      return { leaf: [j(shiftRamp(LEAF.gloom, 10, 0.6, 1.1))], bark: BARK.frost, fall: [] };
    default: {
      const f = fromBiome(biome.treeRamp);
      return { leaf: [j(f)], bark: RED_BARK, fall: [f[4]] };
    }
  }
}

// ------------------------------------------------------------------ species

function build(kind: TreeKind, biome: Biome, seed: number, size: TreeSize, depth: number): TreeArt {
  const look = lookOf(biome);
  switch (kind) {
    case 'oak':
    case 'maple':
    case 'apple':
    case 'willow':
      return broad(kind, biome, seed, size, depth, look);
    case 'pine':
    case 'snowPine':
      return conifer(kind, biome, seed, size, depth, look);
    case 'dead': {
      const b = paintDead({ biome: biome.id, seed, size, bark: recede(biome.id === 'graveyard' ? BARK.grave : biome.id === 'swamp' ? BARK.bog : biome.id === 'forest' ? BARK.dead : BARK.dead, biome, depth), moss: biome.id === 'swamp' ? MOSS_DARK : undefined });
      return finish(b.paint.toBuf(), b.ax, b.ay, b.crown, [], 0.5);
    }
    case 'mushroom': {
      const glow = biome.id === 'swamp' ? '#b88aff' : '#5ad8c8';
      const b = paintMushroom({ seed, size, glow });
      const art = finish(b.paint.toBuf(), b.ax, b.ay, b.crown, [], 0.7);
      return { ...art, light: { dx: 0, dy: -Math.round(b.crown.h * 0.6), color: glow, r: 30 + b.crown.w, flicker: false } };
    }
    case 'crystal': {
      const b = paintCrystal({ seed, size, ramp: biome.id === 'crystal' ? biome.treeRamp : ['#1a2a5a', '#2a4a9a', '#4a8ad8', '#8ac8ff', '#e0f8ff'] });
      const art = finish(b.paint.toBuf(), b.ax, b.ay, b.crown, [], 0.5);
      return { ...art, light: { dx: 0, dy: -Math.round(b.crown.h * 0.5), color: biome.treeRamp[3] ?? '#8ac8ff', r: 30 + b.crown.w, flicker: false } };
    }
    case 'cactus': {
      const b = paintCactus({ seed, size });
      return finish(b.paint.toBuf(), b.ax, b.ay, b.crown, [], 0.45);
    }
  }
}

/** Broad-leaved sizes: crown, trunk and how much of it shows, roots. They match forest.ts's DIM. */
const BROAD: Record<'oak' | 'maple' | 'apple' | 'willow', Record<TreeSize, { W: number; H: number; trunkW: number; trunkVis: number; roots: number; rootLen: number; droop?: number }>> = {
  oak: {
    bush: { W: 22, H: 16, trunkW: 2, trunkVis: 0, roots: 0, rootLen: 0 },
    small: { W: 32, H: 27, trunkW: 4, trunkVis: 7, roots: 2, rootLen: 4 },
    medium: { W: 52, H: 43, trunkW: 7, trunkVis: 10, roots: 4, rootLen: 6 },
    huge: { W: 86, H: 67, trunkW: 15, trunkVis: 19, roots: 5, rootLen: 12 },
  },
  maple: {
    bush: { W: 20, H: 17, trunkW: 2, trunkVis: 0, roots: 0, rootLen: 0 },
    small: { W: 28, H: 29, trunkW: 3, trunkVis: 8, roots: 2, rootLen: 3 },
    medium: { W: 44, H: 46, trunkW: 6, trunkVis: 12, roots: 3, rootLen: 5 },
    huge: { W: 70, H: 70, trunkW: 10, trunkVis: 18, roots: 4, rootLen: 9 },
  },
  apple: {
    bush: { W: 20, H: 15, trunkW: 2, trunkVis: 0, roots: 0, rootLen: 0 },
    small: { W: 28, H: 22, trunkW: 4, trunkVis: 6, roots: 2, rootLen: 3 },
    medium: { W: 40, H: 31, trunkW: 5, trunkVis: 8, roots: 3, rootLen: 4 },
    huge: { W: 56, H: 42, trunkW: 8, trunkVis: 11, roots: 4, rootLen: 6 },
  },
  willow: {
    bush: { W: 22, H: 14, trunkW: 2, trunkVis: 2, roots: 0, rootLen: 0, droop: 8 },
    small: { W: 34, H: 22, trunkW: 5, trunkVis: 13, roots: 2, rootLen: 4, droop: 17 },
    medium: { W: 54, H: 32, trunkW: 8, trunkVis: 19, roots: 3, rootLen: 6, droop: 27 },
    huge: { W: 82, H: 46, trunkW: 12, trunkVis: 27, roots: 4, rootLen: 10, droop: 40 },
  },
};

/** The silhouettes each kind grows into (weights): heavy domes, umbrellas, round lollipops, split trees. */
const SHAPES: Record<'oak' | 'maple' | 'apple' | 'willow', Array<[CrownShape, number]>> = {
  oak: [['dome', 5], ['split', 3], ['umbrella', 2], ['round', 1]],
  maple: [['round', 4], ['split', 3], ['umbrella', 2], ['dome', 1]],
  apple: [['round', 5], ['dome', 3], ['umbrella', 2]],
  willow: [['dome', 1]],
};

function broad(kind: 'oak' | 'maple' | 'apple' | 'willow', biome: Biome, seed: number, size: TreeSize, depth: number, look: Look): TreeArt {
  const base = BROAD[kind][size];
  const L = leafLook(kind, biome, seed);
  const garden = look === 'garden';
  const shapes = SHAPES[kind];
  let u = r01(seed, 7) * shapes.reduce((a, [, w]) => a + w, 0);
  let shape: CrownShape = shapes[0][0];
  for (const [sh, w] of shapes) {
    u -= w;
    if (u < 0) {
      shape = sh;
      break;
    }
  }
  if (size === 'bush') shape = 'round';
  // Umbrellas spread wide and low on a taller trunk; lollipops stand round; split trees carry a side clump.
  const kw = shape === 'umbrella' ? 1.1 : shape === 'round' ? 0.9 : shape === 'split' ? 0.86 : 1;
  const kh = shape === 'umbrella' ? 0.78 : shape === 'round' ? 0.98 : 1;
  const kt = shape === 'umbrella' ? 1.35 : shape === 'round' ? 1.25 : shape === 'split' ? 1.2 : 1;
  const W = Math.round(base.W * sj(seed) * kw);
  const H = Math.round(base.H * sj(seed, 1) * kh);
  const leaf = L.leaf.map((r) => recede(r, biome, garden ? 0 : depth));
  const spec: ClumpSpec = {
    W,
    H,
    trunkW: Math.max(2, Math.round(base.trunkW * (shape === 'dome' ? 1 : shape === 'round' ? 0.7 : 0.85))),
    trunkVis: base.trunkVis ? Math.round(base.trunkVis * sj(seed, 2) * kt) : 0,
    lean: Math.round((r01(seed, 3) - 0.5) * W * (shape === 'dome' ? 0.2 : 0.12)),
    roots: base.roots,
    rootLen: base.rootLen,
    shape,
    leaf,
    leafMix: L.mix,
    bark: recede(L.bark, biome, garden ? 0 : depth),
    grass: size === 'bush' ? undefined : grassOf(biome),
    droop: base.droop,
    seed,
  };
  if (L.blossom) spec.blossom = { n: size === 'bush' ? 2 : Math.round((W * H) / 640), ramp: biome.id === 'shrine' ? ['#d890a8', '#ffd4e0', '#ffffff'] : PETALS };
  if (L.fruit && size !== 'bush') spec.fruit = { n: size === 'huge' ? 8 : size === 'medium' ? 6 : 3, ramp: APPLE, size: size === 'small' ? 1 : 2 };
  const b = paintClumpTree(spec);
  return finish(b.paint.toBuf(), b.ax, b.ay, b.crown, L.fall, 1);
}

const PINE: Record<TreeSize, Omit<ConiferSpec, 'needle' | 'bark' | 'seed' | 'droop' | 'bare'>> = {
  bush: { H: 22, W: 16, trunkW: 2, tiers: 3 },
  small: { H: 46, W: 22, trunkW: 3, tiers: 5 },
  medium: { H: 72, W: 32, trunkW: 5, tiers: 7 },
  huge: { H: 100, W: 44, trunkW: 7, tiers: 8 },
};

function conifer(kind: 'pine' | 'snowPine', biome: Biome, seed: number, size: TreeSize, depth: number, look: Look): TreeArt {
  const base = PINE[size];
  const garden = look === 'garden';
  let needle: Ramp = NEEDLE.green;
  let bark: Ramp = BARK.pine;
  let snow: Ramp | undefined;
  let frost = false;
  if (garden) {
    // The garden's conifers: the crowns' greens taken deeper and bluer (dark accents among the
    // oaks, no outline), reddish bark like theirs.
    needle = biome.id === 'shrine' ? NEEDLE.shrine : pineFrom(biome.treeRamp);
    bark = RED_BARK;
  } else if (biome.id === 'forest') {
    needle = pineFrom(biome.treeRamp);
    bark = RED_BARK;
  } else if (biome.id === 'tundra' || kind === 'snowPine') {
    needle = NEEDLE.frost;
    bark = BARK.frost;
    if (kind === 'snowPine') snow = SNOW;
    else frost = true;
  } else if (biome.id === 'graveyard') {
    needle = NEEDLE.grave;
    bark = BARK.grave;
  }
  // Old pines (the misty woods) lose their lower boughs; young ones keep them to the ground.
  const old = !garden && size === 'huge' ? 0.22 + r01(seed, 5) * 0.16 : !garden && size === 'medium' && r01(seed, 5) < 0.4 ? 0.2 : 0.08 + r01(seed, 5) * 0.06;
  const b = paintConifer({
    ...base,
    H: Math.round(base.H * sj(seed)),
    W: Math.round(base.W * sj(seed, 1)),
    bare: size === 'bush' ? 0.02 : old,
    droop: 0.6 + r01(seed, 6) * 0.4,
    needle: recede(jitter(needle, seed, 5, 0.05), biome, garden ? 0 : depth),
    bark: recede(bark, biome, garden ? 0 : depth),
    snow: snow ? recede(snow, biome, depth * 0.6) : undefined,
    frost,
    grass: size === 'bush' ? undefined : grassOf(biome),
    seed,
  });
  return finish(b.paint.toBuf(), b.ax, b.ay, b.crown, [], 0.55);
}

/**
 * The PropArt plus the extras: the crown box relative to the base, and a shadow pool. The light comes
 * from the top left, so the pool sits to the lower right of the foot, about as wide as the crown.
 */
function finish(buf: TreeArt['buf'], ax: number, ay: number, crown: { x: number; y: number; w: number; h: number }, leaves: string[], spread: number): TreeArt {
  const rx = Math.max(4, Math.round(crown.w * 0.42 * spread + 3));
  return {
    buf,
    ax,
    ay,
    crown: { x: crown.x - ax, y: crown.y - ay, w: crown.w, h: crown.h },
    shadow: { dx: Math.round(rx * 0.35), dy: Math.max(1, Math.round(rx * 0.12)), rx, ry: Math.max(2, Math.round(rx * 0.38)) },
    leaves,
  };
}
