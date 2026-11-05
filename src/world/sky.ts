/**
 * The sky over a floor. Out in the open, each floor rolls its weather from its seed: mostly clear,
 * sometimes overcast, sometimes rain. Underground and indoors there is no sky. The first floor is
 * always clear, and the hub and camp keep their own light.
 *
 * The renderer draws the rain and softens the light under cloud (src/render/rain.ts, the grade).
 */
import type { Biome } from './biomes';

export type SkyKind = 'clear' | 'overcast' | 'rain';

export interface Sky {
  kind: SkyKind;
  /** How hard it rains, 0 (dry) to 1. */
  rain: number;
}

/** Biomes under an open sky. */
const OPEN_AIR: ReadonlySet<string> = new Set(['hamlet', 'farmland', 'forest', 'swamp', 'graveyard', 'shrine']);

let forced: SkyKind | null = null;

/** Dev: every floor gets this sky (null to roll as usual). */
export function forceSky(kind: SkyKind | null): void {
  forced = kind;
}

export const CLEAR: Sky = { kind: 'clear', rain: 0 };

export function skyOf(biome: Biome, seed: number, floor: number): Sky {
  if (!OPEN_AIR.has(biome.id) || biome.layout === 'rooms') return CLEAR;
  const roll = hash(seed ^ Math.imul(floor, 0x9e3779b1));
  const kind: SkyKind = forced ?? (floor <= 1 ? 'clear' : roll < 0.5 ? 'clear' : roll < 0.72 ? 'overcast' : 'rain');
  if (kind === 'rain') return { kind, rain: 0.55 + 0.45 * hash(seed + floor * 31 + 7) };
  return { kind, rain: 0 };
}

function hash(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
