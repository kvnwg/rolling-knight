/**
 * The art a placed prop is drawn with, built once and kept. Props: five variants per kind, picked by
 * the prop's seed. Trees: their species, size, painted variant and depth in the wood (trees.ts).
 * Shared so the shadows baked into the ground (castShadows.ts) match the sprites standing on it.
 */
import type { Biome } from '../../world/biomes';
import type { Prop } from '../../world/mapgen';
import { propArt, type PropArt } from './props';
import { artForTree } from './trees';

const cache = new Map<string, PropArt>();

export type ArtProp = Pick<Prop, 'kind' | 'tree' | 'seed' | 'size' | 'variant' | 'depth'>;

/** A key naming a prop's art: props with the same key look the same. */
export function artKey(p: ArtProp, biome: Biome): string {
  if (p.kind === 'tree') return `tree|${biome.id}|${biome.name}|${p.tree ?? ''}|${p.size ?? ''}|${p.variant ?? p.seed % 4}|${p.depth ?? 0}`;
  return `prop|${biome.id}|${biome.name}|${p.kind}|${p.seed % 5}`;
}

export function artOf(p: ArtProp, biome: Biome): PropArt {
  const key = artKey(p, biome);
  let a = cache.get(key);
  if (!a) {
    a = p.kind === 'tree' ? artForTree(p, biome) : propArt(p.kind, biome, (p.seed % 5) * 104729 + 7);
    cache.set(key, a);
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  }
  return a;
}
