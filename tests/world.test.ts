import { describe, expect, it } from 'vitest';
import { knightId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { addKnight, knightStats } from '../src/core/roster';
import { Game } from '../src/game';
import { BIOME_ORDER, BIOMES, biomeForFloor, isBossFloor } from '../src/world/biomes';
import { BLOCKED, FLOOR, TILE, bfs, generateFloor, tileAt } from '../src/world/mapgen';
import { floorBoss, floorMobs } from '../src/world/mobgen';
import { World, type HeroSpec } from '../src/world/world';

function squad(ids: string[]): HeroSpec[] {
  const s = newGame(1);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id.split('-') as [HeroSpec['rarity'], HeroSpec['cls']];
    return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
  });
}

describe('floors', () => {
  it('are fully connected, with the start, exit and every spawn on open floor, in every biome', () => {
    for (const id of BIOME_ORDER) {
      for (const floor of [1, 4, 5, 13, 30]) {
        const m = generateFloor({ floor, biome: BIOMES[id], seed: 1234 + floor, boss: isBossFloor(floor) });
        const sx = Math.floor(m.start.x / TILE);
        const sy = Math.floor(m.start.y / TILE);
        const d = bfs(m, sx, sy);
        let floorTiles = 0;
        let reached = 0;
        for (let i = 0; i < m.tiles.length; i++) {
          if (m.tiles[i] !== FLOOR) continue;
          floorTiles++;
          if (d[i] >= 0) reached++;
        }
        expect(reached, `${id} floor ${floor}`).toBe(floorTiles);
        expect(tileAt(m, Math.floor(m.exit.x / TILE), Math.floor(m.exit.y / TILE))).toBe(FLOOR);
        for (const sp of m.spawns) expect(d[Math.floor(sp.y / TILE) * m.w + Math.floor(sp.x / TILE)]).toBeGreaterThanOrEqual(0);
        expect(m.spawns.some((s) => s.boss)).toBe(isBossFloor(floor));
      }
    }
  });

  it('never let a prop block the way', () => {
    const m = generateFloor({ floor: 9, biome: BIOMES.hamlet, seed: 77, boss: false });
    for (const p of m.props) if (p.solid && p.kind !== 'tree') expect([BLOCKED, FLOOR]).toContain(tileAt(m, Math.floor(p.x / TILE), Math.floor((p.y - 1) / TILE)));
  });

  it('are the same for the same seed', () => {
    const a = generateFloor({ floor: 7, biome: BIOMES.forest, seed: 5, boss: false });
    const b = generateFloor({ floor: 7, biome: BIOMES.forest, seed: 5, boss: false });
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
  });

  it('change biome every five floors and never end', () => {
    expect(biomeForFloor(1, 1).id).toBe('hamlet');
    expect(biomeForFloor(6, 1).id).toBe('forest');
    expect(biomeForFloor(500, 1)).toBeDefined();
  });
});

describe('mobs', () => {
  it('design three or four types per floor and a boss every fifth', () => {
    for (const id of BIOME_ORDER) {
      const types = floorMobs(BIOMES[id], 14, 3);
      expect(types.length).toBe(4);
      for (const t of types) {
        expect(t.name.length).toBeGreaterThan(3);
        expect(t.hp).toBeGreaterThan(0);
      }
      const boss = floorBoss(BIOMES[id], 15, 3);
      expect(boss.boss?.moves.length).toBe(3);
      expect(boss.hp).toBeGreaterThan(types[0].hp * 20);
    }
  });
});

describe('the squad in a fight', () => {
  function world(ids: string[], floor = 2) {
    const biome = BIOMES.hamlet;
    const map = generateFloor({ floor, biome, seed: 99, boss: false });
    return new World({ map, biome, floor, boss: false, mobTypes: floorMobs(biome, floor, 99), bossType: null, squad: squad(ids), perks: [], controlled: 0, seed: 99, goldPerKill: 3 });
  }

  it('clears an early floor on its own (Auto) and opens the portal', () => {
    const w = world([knightId('legendary', 'guardian'), knightId('legendary', 'ranger'), knightId('legendary', 'cleric')]);
    w.auto = true;
    for (let t = 0; t < 240 && !w.exited; t += 1 / 30) w.update(1 / 30);
    expect(w.cleared).toBe(true);
    expect(w.exited).toBe(true);
  });

  it('auto attacks without being told to', () => {
    const w = world([knightId('rare', 'ranger')]);
    const h = w.heroes[0];
    const m = w.mobs.find((x) => !x.dead)!;
    // The mob steps up close in the open start room.
    m.x = h.x + 30;
    m.y = h.y;
    w.wake(m);
    const hp = m.hp;
    for (let t = 0; t < 2; t += 1 / 30) w.update(1 / 30);
    expect(m.hp).toBeLessThan(hp);
  });

  it('dodge rolls make a knight untouchable while rolling', () => {
    const w = world([knightId('rare', 'blade')]);
    const h = w.heroes[0];
    w.input.dodge = true;
    w.input.mx = 1;
    w.update(1 / 30);
    expect(h.rolling).toBeDefined();
    expect(w.damage(h, 50, null)).toBe(0);
  });

  it('Rewind takes the squad back 4 seconds: HP and fallen knights return, damage dealt stays', () => {
    const w = world([knightId('mythic', 'arcanist'), knightId('rare', 'guardian')]);
    const [aeon, tank] = w.heroes;
    for (let t = 0; t < 4.5; t += 1 / 30) w.update(1 / 30);
    const startHp = tank.hp;
    const mob = w.mobs.find((m) => !m.dead)!;
    w.damage(tank, tank.maxHp * 10, null);
    expect(tank.downed).toBe(true);
    w.damage(mob, 5, aeon);
    const mobHp = mob.hp;
    aeon.specialT = 0;
    w.input.special = true;
    for (let t = 0; t < 1.2; t += 1 / 30) w.update(1 / 30);
    expect(w.rewind).toBeNull();
    expect(tank.downed).toBe(false);
    expect(tank.hp).toBeGreaterThan(startHp * 0.5);
    expect(mob.hp).toBeLessThanOrEqual(mobHp);
  });
});

describe('the game', () => {
  it('rolls a squad, starts floor 1 and keeps going', () => {
    const g = new Game(true);
    g.setAuto(true);
    for (let t = 0; t < 30; t += 1 / 30) g.tick(1 / 30);
    expect(g.state.squad.filter(Boolean).length).toBe(3);
    expect(g.world).not.toBeNull();
    expect(g.state.records.spins).toBeGreaterThanOrEqual(4);
  });
});
