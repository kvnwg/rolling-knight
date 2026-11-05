/**
 * Where trees stand. The solid ground of a tree biome is no longer a carpet of identical trees: it is
 * planted the way a gardener or a wood would plant it, with a few big trees of mixed sizes and the
 * ground showing between them.
 *
 *  - Gardens (hamlet, camp, shrine): clumps of two to four trees, one big one with smaller ones and
 *    often a dark conifer tucked in, spaced with grass between; single specimen trees; low bushes in
 *    short rows along the edges of the lots. Trunks stay visible: a tree never stands where the crown
 *    of a tree in front of it would hide its trunk.
 *  - The farm: an orchard of apple trees in rows, with golden oaks here and there.
 *  - Woods (Gloomwood, tundra): denser and layered, the biggest trees deepest in, trunks along the
 *    edge of the floor, rows behind darker (`depth`), broken by clearings.
 *  - Groves (bog, graveyard): scattered clumps of one to three with wide gaps.
 *
 * Every tree's foot stands on solid ground (never on a house's lot), and its crown may only reach a
 * few pixels over the walkable floor, so the paths stay readable. Usage (mapgen.ts, in place of the
 * forest-wall loop): `for (const t of placeTrees(m, biome, propRng.fork(7))) m.props.push(t);`
 */
import type { Rng } from '../core/rng';
import type { Biome, TreeKind } from './biomes';
import { SOLID, TILE, type FloorMap, type Prop } from './mapgen';

export type TreeSize = 'bush' | 'small' | 'medium' | 'huge';

/** How many painted variants of each kind and size a floor uses (the renderer caches one sprite each). */
export const TREE_VARIANTS = 4;

export interface TreeProp extends Prop {
  kind: 'tree';
  tree: TreeKind;
  size: TreeSize;
  /** Which painted variant (0..TREE_VARIANTS-1). */
  variant: number;
  /** 0 at the edge of a wood, 1 or 2 deeper in (drawn darker). */
  depth: number;
}

/**
 * Nominal sizes (px) for planning: crown width, height from the foot to the top of the crown, the
 * crown's bottom above the foot, trunk width. They match the painter (src/render/art/trees.ts).
 */
const DIM: Record<TreeKind, Record<TreeSize, readonly [w: number, h: number, under: number, trunk: number]>> = {
  oak: { bush: [22, 18, 0, 2], small: [32, 36, 7, 4], medium: [52, 55, 10, 7], huge: [86, 88, 19, 15] },
  maple: { bush: [20, 19, 0, 2], small: [28, 39, 8, 3], medium: [44, 60, 12, 6], huge: [70, 90, 18, 10] },
  apple: { bush: [20, 17, 0, 2], small: [28, 30, 6, 4], medium: [40, 41, 8, 5], huge: [56, 55, 11, 8] },
  willow: { bush: [22, 18, 2, 2], small: [34, 37, 13, 5], medium: [54, 53, 19, 8], huge: [82, 75, 27, 12] },
  pine: { bush: [16, 22, 2, 2], small: [22, 46, 4, 3], medium: [32, 72, 8, 5], huge: [44, 100, 25, 7] },
  snowPine: { bush: [16, 22, 2, 2], small: [22, 46, 4, 3], medium: [32, 72, 8, 5], huge: [44, 100, 25, 7] },
  dead: { bush: [18, 18, 6, 3], small: [30, 40, 14, 4], medium: [44, 60, 22, 6], huge: [64, 86, 32, 9] },
  mushroom: { bush: [16, 16, 6, 2], small: [24, 25, 10, 3], medium: [38, 40, 16, 4], huge: [55, 58, 24, 6] },
  crystal: { bush: [14, 15, 0, 3], small: [22, 23, 0, 4], medium: [34, 35, 0, 6], huge: [50, 52, 0, 9] },
  cactus: { bush: [10, 12, 0, 6], small: [16, 20, 0, 10], medium: [26, 34, 0, 7], huge: [36, 48, 0, 10] },
};

export function treeDims(kind: TreeKind, size: TreeSize): { w: number; h: number; under: number; trunk: number } {
  const [w, h, under, trunk] = DIM[kind][size];
  return { w, h, under, trunk };
}

type Style = 'garden' | 'orchard' | 'woods' | 'grove';

function styleOf(biome: Biome): Style {
  switch (biome.id) {
    case 'farmland':
      return 'orchard';
    case 'forest':
    case 'tundra':
      return 'woods';
    case 'swamp':
    case 'graveyard':
      return 'grove';
    default:
      return 'garden';
  }
}

/** The species a biome's woods are made of, with weights. The garden's conifers are dark accents. */
function speciesOf(biome: Biome): Array<[TreeKind, number]> {
  switch (biome.id) {
    case 'hamlet':
      return [['oak', 5], ['maple', 3], ['pine', 2]];
    case 'farmland':
      return [['apple', 6], ['oak', 3], ['pine', 1]];
    case 'forest':
      return [['oak', 5], ['pine', 4], ['dead', 1]];
    case 'tundra':
      return [['snowPine', 4], ['pine', 1]];
    case 'swamp':
      return [['willow', 5], ['dead', 3], ['mushroom', 1]];
    case 'graveyard':
      return [['dead', 6], ['pine', 3]];
    case 'shrine':
      return [['maple', 5], ['pine', 2]];
    default: {
      const k = biome.solid.trees ?? biome.trees;
      return k.length ? k.map((t) => [t, 1] as [TreeKind, number]) : [['oak', 1]];
    }
  }
}

/** A tree for a room's floor (one blocked tile): small or medium, never huge. */
export function roomTree(biome: Biome, rng: Rng): { tree: TreeKind; size: TreeSize; variant: number } {
  const kinds = biome.trees.length ? biome.trees : speciesOf(biome).map(([k]) => k);
  const tree = rng.pick(kinds);
  const size: TreeSize = tree === 'cactus' || tree === 'crystal' || tree === 'mushroom' ? rng.pick(['small', 'medium'] as const) : rng.weighted([['small', 2], ['medium', 3]] as const);
  return { tree, size, variant: rng.int(0, TREE_VARIANTS - 1) };
}

interface Planned {
  x: number;
  y: number;
  kind: TreeKind;
  size: TreeSize;
  depth: number;
}

export function placeTrees(m: FloorMap, biome: Biome, rng: Rng): TreeProp[] {
  const W = m.w;
  const H = m.h;
  const solidAt = (tx: number, ty: number) => tx < 0 || ty < 0 || tx >= W || ty >= H || m.tiles[ty * W + tx] === SOLID;
  const reservedAt = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < W && ty < H && !!m.reserved?.[ty * W + tx];
  // Distance (tiles) from every solid tile to the nearest open one (two-pass chamfer).
  const dist = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dist[i] = m.tiles[i] === SOLID ? 1e6 : 0;
  const relax = (i: number, j: number, c: number) => {
    if (dist[j] + c < dist[i]) dist[i] = dist[j] + c;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (x > 0) relax(i, i - 1, 1);
    if (y > 0) relax(i, i - W, 1);
    if (x > 0 && y > 0) relax(i, i - W - 1, 1.41);
    if (x < W - 1 && y > 0) relax(i, i - W + 1, 1.41);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (x < W - 1) relax(i, i + 1, 1);
    if (y < H - 1) relax(i, i + W, 1);
    if (x < W - 1 && y < H - 1) relax(i, i + W + 1, 1.41);
    if (x > 0 && y < H - 1) relax(i, i + W - 1, 1.41);
  }
  const dAt = (px: number, py: number) => {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    return tx < 0 || ty < 0 || tx >= W || ty >= H ? 99 : dist[ty * W + tx];
  };
  const style = styleOf(biome);
  const species = speciesOf(biome);
  // Species grow in patches (a stand of pines here, oaks there), not salt-and-pepper.
  const patchSeed = rng.int(0, 1 << 30);
  const kindAt = (px: number, py: number, salt: number): TreeKind => {
    const n = (noise(px / 120, py / 120, patchSeed) * 0.75 + hashf(Math.floor(px), Math.floor(py), salt) * 0.25) * species.reduce((a, [, w]) => a + w, 0);
    let acc = 0;
    for (const [k, w] of species) {
      acc += w;
      if (n < acc) return k;
    }
    return species[species.length - 1][0];
  };

  const planned: Planned[] = [];
  /** May a tree of this kind and size stand with its foot at (x, y)? */
  const fits = (x: number, y: number, kind: TreeKind, size: TreeSize, overhang: number): boolean => {
    const d = treeDims(kind, size);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor((y - 1) / TILE);
    // The foot and the trunk on solid ground, off any house's lot.
    for (const ox of [-d.trunk / 2, 0, d.trunk / 2]) {
      const fx = Math.floor((x + ox) / TILE);
      if (!solidAt(fx, ty) || reservedAt(fx, ty)) return false;
    }
    if (!solidAt(tx, Math.floor((y + 3) / TILE))) {
      // The roots may spill onto the floor's edge, but only a little.
      if (dAt(x, y + 3) <= 0 && overhang < 6) return false;
    }
    // The crown over the floor by `overhang` px at most; never over a house.
    const x0 = x - d.w / 2;
    const x1 = x + d.w / 2;
    const y0 = y - d.h;
    const y1 = y - d.under;
    for (let py = y0; py <= y1; py += 4) {
      for (let px = x0; px <= x1; px += 4) {
        // An ellipse inside the crown box.
        const ux = (px - x) / (d.w / 2);
        const uy = (py - (y0 + y1) / 2) / Math.max(1, (y1 - y0) / 2);
        if (ux * ux + uy * uy > 1) continue;
        const ptx = Math.floor(px / TILE);
        const pty = Math.floor(py / TILE);
        if (reservedAt(ptx, pty)) return false;
        if (!solidAt(ptx, pty)) {
          // How deep into the floor is this point? (distance to the nearest solid tile, roughly)
          if (floorDepth(m, px, py, overhang)) return false;
        }
      }
    }
    return true;
  };
  /** Does a crown of the new tree hide an existing tree's trunk, or the reverse? Are trunks too close? */
  const clashes = (x: number, y: number, kind: TreeKind, size: TreeSize, minGap: number): boolean => {
    const d = treeDims(kind, size);
    for (const p of planned) {
      const e = treeDims(p.kind, p.size);
      const gap = Math.hypot(p.x - x, (p.y - y) * 1.3);
      if (gap < (d.trunk + e.trunk) / 2 + minGap) return true;
      // A tree lower on screen is in front: its crown must not cover the other's trunk.
      const [front, fd, back, bd] = y > p.y ? [{ x, y }, d, p, e] : [p, e, { x, y }, d];
      const trunkTop = back.y - bd.under;
      if (Math.abs(front.x - back.x) < fd.w * 0.42 + bd.trunk / 2 && back.y > front.y - fd.h + 2 && trunkTop < front.y - fd.under + 2) return true;
    }
    return false;
  };
  const add = (x: number, y: number, kind: TreeKind, size: TreeSize, depth: number) => planned.push({ x: Math.round(x), y: Math.round(y), kind, size, depth });

  // ---- candidate spots: every solid tile, best first (near the floor), shuffled within a band
  const spots: Array<{ x: number; y: number; d: number; r: number }> = [];
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const d = dist[ty * W + tx];
    if (d <= 0 || (d > 12 && style !== 'garden' && style !== 'grove') || reservedAt(tx, ty)) continue;
    spots.push({ x: tx * TILE + 8, y: ty * TILE + 12, d, r: rng.next() });
  }

  if (style === 'garden' || style === 'grove') {
    const grove = style === 'grove';
    // Clump centers: Poisson-disk over all the solid ground; near the floor first, a little closer
    // together deeper in (the backdrop reads as woodland, never as an empty lawn).
    spots.sort((a, b) => a.d + a.r * 3 - (b.d + b.r * 3));
    const centers: Array<{ x: number; y: number; d: number }> = [];
    for (const s of spots) {
      // Open lawns here and there: no clumps where the low noise dips.
      if (s.d > 1.5 && noise(s.x / 210, s.y / 210, patchSeed + 13) < (grove ? 0.3 : 0.27)) continue;
      const spacing = (grove ? 5.6 : s.d <= 4 ? 5.2 : 4.5) * TILE;
      if (centers.some((c) => Math.hypot(c.x - s.x, (c.y - s.y) * 1.15) < spacing * (0.85 + s.r * 0.3))) continue;
      centers.push({ x: s.x + rng.int(-6, 6), y: s.y + rng.int(-4, 4), d: s.d });
    }
    for (const c of centers) {
      // One big tree with smaller ones round it, often a dark conifer tucked in, bushes at its feet.
      const n = grove ? rng.weighted([[1, 3], [2, 4], [3, 2]] as const) : rng.weighted([[2, 3], [3, 5], [4, 3]] as const);
      const lead = kindAt(c.x, c.y, 1);
      const leadKind: TreeKind = lead === 'pine' && biome.id !== 'graveyard' ? 'oak' : lead;
      const sizes: TreeSize[] = [rng.weighted([['huge', c.d > 3 ? 4 : 2], ['medium', 6], ['small', 1]] as const)];
      for (let k = 1; k < n; k++) sizes.push(rng.weighted([['medium', 4], ['small', 3]] as const));
      const conifer = species.some(([k]) => k === 'pine') && rng.chance(grove ? 0.3 : 0.5);
      const members: Array<{ x: number; y: number; kind: TreeKind; size: TreeSize }> = [];
      for (let k = 0; k < n; k++) {
        let kind: TreeKind = k === 0 ? leadKind : conifer && k === 1 ? 'pine' : kindAt(c.x + k * 13, c.y, 3 + k);
        if (kind === 'pine' && k === 0) kind = leadKind;
        let size = sizes[k];
        let done = false;
        for (let tries = 0; tries < 14 && !done; tries++) {
          // Later tries: a size smaller.
          if (tries === 9 && size !== 'small') size = size === 'huge' ? 'medium' : 'small';
          const d0 = treeDims(kind, size);
          const a = rng.next() * Math.PI * 2;
          const r = k === 0 ? rng.next() * 6 : (d0.w * 0.4 + treeDims(leadKind, sizes[0]).w * 0.26) * (0.8 + rng.next() * 0.3);
          const x = c.x + Math.cos(a) * r;
          const y = c.y + Math.sin(a) * r * 0.6;
          if (!fits(x, y, kind, size, 10) || clashes(x, y, kind, size, grove ? 8 : 3)) continue;
          add(x, y, kind, size, 0);
          members.push({ x, y, kind, size });
          done = true;
        }
        if (k === 0 && !done) break;
      }
      // Bushes at the clump's feet, in front.
      if (!grove && members.length) {
        const nb = rng.weighted([[0, 2], [1, 3], [2, 2]] as const);
        for (let k = 0; k < nb; k++) {
          const m0 = rng.pick(members);
          const d0 = treeDims(m0.kind, m0.size);
          const kind = kindAt(m0.x, m0.y, 11) === 'pine' ? 'oak' : kindAt(m0.x, m0.y, 11);
          for (let tries = 0; tries < 6; tries++) {
            const x = m0.x + (rng.next() - 0.5) * d0.w * 0.9;
            const y = m0.y + 4 + rng.next() * 8;
            if (!fits(x, y, kind, 'bush', 8) || clashes(x, y, kind, 'bush', 2)) continue;
            add(x, y, kind, 'bush', 0);
            break;
          }
        }
      }
    }
    if (!grove) {
      // Bushes in short rows along the edges of the lots (a bed along the curb).
      const edge = spots.filter((s) => s.d <= 1.01).sort((a, b) => a.y - b.y || a.x - b.x);
      let run = 0;
      for (const s of edge) {
        if (run <= 0 && rng.chance(0.6)) continue;
        if (run <= 0) run = rng.int(2, 4);
        run--;
        const kind = kindAt(s.x, s.y, 9) === 'pine' ? 'oak' : kindAt(s.x, s.y, 9);
        const x = s.x + rng.int(-3, 3);
        const y = s.y + rng.int(0, 3);
        if (!fits(x, y, kind, 'bush', 8) || clashes(x, y, kind, 'bush', 1)) {
          run = 0;
          continue;
        }
        add(x, y, kind, 'bush', 0);
      }
    }
  } else if (style === 'orchard') {
    // An orchard: apple trees in rows on a grid, every other row shifted; oaks where rows don't fit.
    const gx = 3 * TILE;
    const gy = Math.round(2.6 * TILE);
    const ox = rng.int(0, gx - 1);
    const oy = rng.int(0, gy - 1);
    for (let y = oy + 12; y < H * TILE; y += gy) {
      const row = Math.round((y - oy) / gy);
      for (let x = ox + (row % 2) * (gx / 2); x < W * TILE; x += gx) {
        const d = dAt(x, y);
        if (d <= 0 || d > 9) continue;
        const kind: TreeKind = d > 1.5 && noise(x / 140, y / 140, patchSeed) > 0.72 ? 'oak' : 'apple';
        const size: TreeSize = kind === 'oak' ? rng.weighted([['medium', 2], ['huge', 1]] as const) : rng.weighted([['small', 2], ['medium', 5], ['huge', 1]] as const);
        const x2 = x + rng.int(-2, 2);
        const y2 = y + rng.int(-1, 1);
        if (!fits(x2, y2, kind, size, 8) || clashes(x2, y2, kind, size, 3)) {
          if (fits(x2, y2, 'apple', 'small', 8) && !clashes(x2, y2, 'apple', 'small', 3)) add(x2, y2, 'apple', 'small', 0);
          continue;
        }
        add(x2, y2, kind, size, 0);
      }
    }
  } else {
    // Woods: trunks along the floor's edge, bigger trees behind, darker the deeper; clearings.
    spots.sort((a, b) => a.d - b.d || a.r - b.r);
    for (const s of spots) {
      if (noise(s.x / 90, s.y / 90, patchSeed + 7) < 0.2 && s.d > 1.5) continue;
      const depth = s.d <= 2 ? 0 : s.d <= 5 ? 1 : 2;
      const kind = kindAt(s.x, s.y, 5);
      const sizes: TreeSize[] = depth === 0 ? (rng.chance(0.5) ? ['huge', 'medium', 'small'] : ['medium', 'huge', 'small']) : ['huge', 'medium'];
      const x = s.x + rng.int(-6, 6);
      const y = s.y + rng.int(-4, 4);
      for (const size of sizes) {
        const d = treeDims(kind, size);
        // Trunks keep a tree's width or so apart (crowns overlap), more deeper in.
        const near = planned.some((p) => Math.hypot(p.x - x, (p.y - y) * 1.5) < (d.w + treeDims(p.kind, p.size).w) * (depth === 0 ? 0.3 : 0.36));
        if (near) continue;
        if (!fits(x, y, kind, size, 14) || clashes(x, y, kind, size, 3)) continue;
        add(x, y, kind, size, depth);
        break;
      }
    }
    // A sprinkle of saplings and bushes along the edge of the floor.
    for (const s of spots) {
      if (s.d > 1.01 || !rng.chance(0.18)) continue;
      const kind = kindAt(s.x, s.y, 8);
      const size: TreeSize = rng.chance(0.5) ? 'bush' : 'small';
      if (fits(s.x, s.y + 2, kind, size, 8) && !clashes(s.x, s.y + 2, kind, size, 3)) add(s.x + rng.int(-3, 3), s.y + 2, kind, size, 0);
    }
  }

  return planned.map((p) => ({
    kind: 'tree' as const,
    tree: p.kind,
    size: p.size,
    variant: rng.int(0, TREE_VARIANTS - 1),
    depth: p.depth,
    x: p.x,
    y: p.y,
    solid: true,
    seed: rng.int(0, 1 << 30),
    edge: true,
  }));
}

/** True if (px, py) lies on the floor more than `overhang` px from any solid tile. */
function floorDepth(m: FloorMap, px: number, py: number, overhang: number): boolean {
  const r = overhang;
  for (const [ox, oy] of [[-r, 0], [r, 0], [0, -r], [0, r], [-r * 0.7, -r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, r * 0.7]] as const) {
    const tx = Math.floor((px + ox) / TILE);
    const ty = Math.floor((py + oy) / TILE);
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.tiles[ty * m.w + tx] === SOLID) return false;
  }
  return true;
}

function hashf(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise, 0..1. */
function noise(x: number, y: number, s: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  let tx = x - x0;
  let ty = y - y0;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = hashf(x0, y0, s);
  const b = hashf(x0 + 1, y0, s);
  const c = hashf(x0, y0 + 1, s);
  const d = hashf(x0 + 1, y0 + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
