/**
 * Which stone a Dungeon floor is built of: the purple-brown stone (thin walls, a brick face to the
 * north) or the blue stone (thick mauve caps, a blue brick face, a cobbled rim round the floor). One
 * look per floor, picked by its seed, so a floor never mixes the two.
 */
export type DungeonLook = 'purple' | 'blue';

export function dungeonLook(seed: number): DungeonLook {
  let h = Math.imul(seed ^ 0x2d1b5a3, 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) % 5 < 3 ? 'purple' : 'blue';
}
