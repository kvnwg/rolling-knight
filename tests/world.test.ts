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
    for (const biome of [BIOMES.hamlet, BIOMES.farmland]) {
      const m = generateFloor({ floor: 9, biome, seed: 77, boss: false });
      for (const p of m.props) if (p.solid && p.kind !== 'tree') expect([BLOCKED, FLOOR]).toContain(tileAt(m, Math.floor(p.x / TILE), Math.floor((p.y - 1) / TILE)));
    }
  });

  it('are the same for the same seed', () => {
    const a = generateFloor({ floor: 7, biome: BIOMES.forest, seed: 5, boss: false });
    const b = generateFloor({ floor: 7, biome: BIOMES.forest, seed: 5, boss: false });
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
  });

  it('change biome every five floors and never end', () => {
    expect(biomeForFloor(1, 1).id).toBe('hamlet');
    expect(biomeForFloor(6, 1).id).toBe('farmland');
    expect(biomeForFloor(10, 1).id).toBe('farmland');
    expect(biomeForFloor(11, 1).id).toBe('forest');
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

describe('the farm', () => {
  const farm = BIOMES.farmland;
  const isFarmName = (plan: string, name: string) => (farm.mobs.names?.[plan as keyof typeof farm.mobs.names] ?? []).includes(name);

  it('has pigs and rams on every floor, with names from its joke tables', () => {
    for (let floor = 6; floor <= 9; floor++) {
      for (const seed of [1, 2, 3, 99, 1234]) {
        const types = floorMobs(farm, floor, seed);
        const plans = types.map((t) => t.plan);
        expect(plans).toContain('pig');
        expect(plans).toContain('ram');
        for (const t of types) {
          expect(isFarmName(t.plan, t.name), `${t.plan}: ${t.name}`).toBe(true);
          expect(farm.mobs.adjectives.some((a) => t.name.startsWith(`${a} `))).toBe(false);
        }
      }
    }
  });

  it('is ruled by a huge pig with a name and title of its own', () => {
    const titles = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const boss = floorBoss(farm, 10, seed);
      expect(boss.plan).toBe('pig');
      expect(farm.mobs.boss!.names.some(([n, t]) => n === boss.name && t === boss.boss!.title)).toBe(true);
      expect(boss.boss!.moves).toContain('ring');
      expect(boss.boss!.moves).toContain('charge');
      expect(new Set(boss.boss!.moves).size).toBe(3);
      titles.add(boss.boss!.title);
    }
    expect(titles.size).toBeGreaterThan(1);
  });

  it('plows fields off the tracks, with crops standing on them that never block the way', () => {
    let fields = 0;
    let crops = 0;
    for (const seed of [5, 77, 1234]) {
      const m = generateFloor({ floor: 7, biome: farm, seed, boss: false });
      expect(m.field).toBeDefined();
      for (let i = 0; i < m.tiles.length; i++) {
        if (!m.field![i]) continue;
        fields++;
        expect(m.tiles[i]).toBe(FLOOR);
        expect(m.path[i]).toBe(0);
      }
      for (const p of m.props) {
        if (p.kind !== 'cabbage' && p.kind !== 'wheat' && !(p.kind === 'pumpkin' && !p.solid)) continue;
        crops++;
        const i = Math.floor(p.y / TILE) * m.w + Math.floor(p.x / TILE);
        expect(p.solid).toBe(false);
        expect(m.tiles[i]).toBe(FLOOR);
      }
    }
    expect(fields).toBeGreaterThan(20);
    expect(crops).toBeGreaterThan(20);
  });

  it('took the pigs and rams away from the hamlet, whose mobs keep their plain names', () => {
    expect(BIOMES.hamlet.mobs.plans).not.toContain('pig');
    expect(BIOMES.hamlet.mobs.plans).not.toContain('ram');
    for (const floor of [1, 2, 3, 4, 14]) {
      for (const t of floorMobs(BIOMES.hamlet, floor, 7)) {
        expect(['pig', 'ram', 'chicken']).not.toContain(t.plan);
        expect(BIOMES.hamlet.mobs.adjectives.some((a) => t.name.startsWith(`${a} `))).toBe(true);
      }
    }
    expect(generateFloor({ floor: 3, biome: BIOMES.hamlet, seed: 9, boss: false }).field).toBeUndefined();
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
  it('rolls a squad at camp, then heads into floor 1 and keeps going', () => {
    const g = new Game(true);
    g.setAuto(true);
    // At camp the altar rolls and the squad fills itself, but no floor starts until you set out.
    for (let t = 0; t < 30; t += 1 / 30) g.tick(1 / 30);
    expect(g.state.squad.filter(Boolean).length).toBe(3);
    expect(g.inDungeon).toBe(false);
    expect(g.state.records.spins).toBeGreaterThanOrEqual(4);
    g.enterDungeon();
    for (let t = 0; t < 10; t += 1 / 30) g.tick(1 / 30);
    expect(g.inDungeon).toBe(true);
    expect(g.world).not.toBeNull();
    expect(g.world!.heroes.length).toBe(3);
    g.leaveDungeon();
    expect(g.inDungeon).toBe(false);
  });
});
