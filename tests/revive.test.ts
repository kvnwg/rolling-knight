import { describe, expect, it } from 'vitest';
import { knightId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { addKnight, knightStats } from '../src/core/roster';
import { BIOMES } from '../src/world/biomes';
import { generateFloor } from '../src/world/mapgen';
import { floorMobs } from '../src/world/mobgen';
import { castSkill } from '../src/world/skills';
import { World, type HeroSpec } from '../src/world/world';

function squad(ids: string[]): HeroSpec[] {
  const s = newGame(1);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id.split('-') as [HeroSpec['rarity'], HeroSpec['cls']];
    return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
  });
}

function world(): World {
  const biome = BIOMES.hamlet;
  const map = generateFloor({ floor: 2, biome, seed: 99, boss: false });
  return new World({ map, biome, floor: 2, boss: false, mobTypes: floorMobs(biome, 2, 99), bossType: null, squad: squad([knightId('rare', 'cleric'), knightId('rare', 'blade'), knightId('rare', 'ranger')]), perks: [], controlled: 0, seed: 99, goldPerKill: 3 });
}

function fell(w: World, i: number): void {
  const h = w.heroes[i];
  h.hp = 0;
  h.downed = true;
}

describe('fallen knights', () => {
  it('stay down when the floor is cleared', () => {
    const w = world();
    fell(w, 1);
    for (const m of w.mobs) m.dead = true;
    for (let k = 0; k < 30; k++) w.update(1 / 60);
    expect(w.portalOpen).toBe(true);
    expect(w.heroes[1].downed).toBe(true);
  });

  it("aren't raised by the support's Common or Rare skills, only by its Epic and Legendary ones", () => {
    const w = world();
    const cleric = w.heroes[0];
    fell(w, 1);
    castSkill(w, cleric, 'mend');
    castSkill(w, cleric, 'sanctuary');
    expect(w.heroes[1].downed).toBe(true);
    castSkill(w, cleric, 'guardianAngel');
    expect(w.heroes[1].downed).toBe(false);
    fell(w, 2);
    castSkill(w, cleric, 'miracle');
    expect(w.heroes[2].downed).toBe(false);
  });
});
