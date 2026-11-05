/**
 * The art a placed prop is drawn with: five variants per kind, picked by the prop's seed (the same
 * lookup the renderer's prepareFloor makes), built once and kept. Shared so the shadows baked into the
 * ground (castShadows.ts) match the sprites standing on it.
 */
import type { Biome } from '../../world/biomes';
import type { Prop } from '../../world/mapgen';
import { propArt, treeArt, type PropArt } from './props';

const cache = new Map<string, PropArt>();

export function artOf(p: Pick<Prop, 'kind' | 'tree' | 'seed'>, biome: Biome): PropArt {
  const variant = p.seed % 5;
  const key = `${biome.id}|${biome.name}|${p.kind}|${p.tree ?? ''}|${variant}`;
  let a = cache.get(key);
  if (!a) {
    a = p.kind === 'tree' ? treeArt(p.tree!, biome, variant * 7919 + 13) : propArt(p.kind, biome, variant * 104729 + 7);
    cache.set(key, a);
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  }
  return a;
}
