import { describe, expect, it } from 'vitest';
import { knightId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { addKnight, knightStats } from '../src/core/roster';
import { BIOMES } from '../src/world/biomes';
import { dist } from '../src/world/entities';
import { BLOCKED, FLOOR, TILE, generateFloor, tileAt } from '../src/world/mapgen';
import { floorMobs } from '../src/world/mobgen';
import { World, type HeroSpec } from '../src/world/world';

function squad(ids: string[]): HeroSpec[] {
  const s = newGame(1);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id.split('-') as [HeroSpec['rarity'], HeroSpec['cls']];
    return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
  });
}

const DT = 1 / 60;

function run(w: World, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) w.update(DT);
}

describe('squadmates following you', () => {
  it('walk round a tree between them and you instead of pushing into it', () => {
    const biome = BIOMES.hamlet;
    let tested = 0;
    for (const seed of [99, 7, 1234, 42]) {
      const map = generateFloor({ floor: 2, biome, seed, boss: false });
      // A prop tile (a tree's trunk) with open floor two tiles left and right of it.
      let spot: [number, number] | null = null;
      for (let ty = 2; ty < map.h - 2 && !spot; ty++) {
        for (let tx = 3; tx < map.w - 3 && !spot; tx++) {
          if (tileAt(map, tx, ty) !== BLOCKED) continue;
          const open = (x: number, y: number) => tileAt(map, x, y) === FLOOR;
          if (open(tx - 1, ty) && open(tx - 2, ty) && open(tx + 1, ty) && open(tx + 2, ty) && open(tx - 2, ty + 1) && open(tx + 2, ty + 1)) spot = [tx, ty];
        }
      }
      if (!spot) continue;
      const w = new World({ map, biome, floor: 2, boss: false, mobTypes: floorMobs(biome, 2, seed), bossType: null, squad: squad([knightId('rare', 'blade'), knightId('rare', 'cleric')]), perks: [], controlled: 0, seed, goldPerKill: 3 });
      for (const m of w.mobs) m.dead = true;
      const [me, ally] = w.heroes;
      const cy = spot[1] * TILE + TILE / 2;
      me.x = (spot[0] + 2) * TILE + TILE / 2;
      me.y = cy;
      ally.x = (spot[0] - 2) * TILE + TILE / 2;
      ally.y = cy;
      w.refreshFlows();
      run(w, 5);
      expect(dist(ally.x, ally.y, me.x, me.y)).toBeLessThan(40);
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  });
});
