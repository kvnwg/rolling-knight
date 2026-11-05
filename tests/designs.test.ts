import { describe, expect, it } from 'vitest';
import { FLOOR_DESIGNS, cleanDeck, drawDesign, shuffleDeck, type DeckState, type DesignId } from '../src/core/deck';
import { knightId } from '../src/core/knights';
import { newGame, rebirth } from '../src/core/newGame';
import { addKnight, knightStats } from '../src/core/roster';
import { mend } from '../src/core/save';
import { SAVE_VERSION } from '../src/core/state';
import { Game } from '../src/game';
import { BIOME_ORDER, BIOMES, isBossFloor, type BiomeId } from '../src/world/biomes';
import { DESIGNS } from '../src/world/designs';
import { FLOOR, TILE, bfs, generateFloor, tileAt, type FloorMap } from '../src/world/mapgen';
import { floorMobs } from '../src/world/mobgen';
import { World, type HeroSpec } from '../src/world/world';

const at = (p: { x: number; y: number }) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)] as const;

function build(design: DesignId, biome: BiomeId, floor: number, seed: number): FloorMap {
  return generateFloor({ floor, biome: BIOMES[biome], seed, boss: isBossFloor(floor), design });
}

/** Everything a floor is, as one string (to compare two builds). */
function fingerprint(m: FloorMap): string {
  return JSON.stringify([m.w, m.h, Array.from(m.tiles), Array.from(m.path), m.props, m.spawns, m.rooms, m.start, m.exit, m.waterfalls, m.field && Array.from(m.field), m.canal && Array.from(m.canal)]);
}

describe('floor designs', () => {
  it('are all in the deck, each with a name', () => {
    expect(Object.keys(DESIGNS).sort()).toEqual([...FLOOR_DESIGNS].sort());
    expect(FLOOR_DESIGNS.length).toBeGreaterThanOrEqual(8);
    for (const d of FLOOR_DESIGNS) expect(DESIGNS[d].name.length).toBeGreaterThan(3);
  });

  for (const design of FLOOR_DESIGNS) {
    it(`${design}: every biome's floors are one piece, with the exit and every foe reachable from the start`, () => {
      BIOME_ORDER.forEach((id, bi) => {
        for (const floor of [2, 5, 13, 30]) {
          const m = build(design, id, floor, 1234 + floor * 7 + bi);
          const tag = `${design} ${id} ${floor}`;
          expect(m.design, tag).toBe(design);
          const [sx, sy] = at(m.start);
          const d = bfs(m, sx, sy);
          let open = 0;
          let reached = 0;
          for (let i = 0; i < m.tiles.length; i++) {
            if (m.tiles[i] !== FLOOR) continue;
            open++;
            if (d[i] >= 0) reached++;
          }
          expect(reached, tag).toBe(open);
          const [ex, ey] = at(m.exit);
          expect(tileAt(m, ex, ey), tag).toBe(FLOOR);
          expect(d[ey * m.w + ex], tag).toBeGreaterThan(0);
          for (const s of m.spawns) {
            const [x, y] = at(s);
            expect(d[y * m.w + x], `${tag}: a foe at ${x},${y}`).toBeGreaterThanOrEqual(0);
            // Nobody waits right on top of the start.
            if (!s.boss) expect(Math.hypot(s.x - m.start.x, s.y - m.start.y), tag).toBeGreaterThan(7 * TILE);
          }
          const boss = isBossFloor(floor);
          expect(m.spawns.some((s) => s.boss), tag).toBe(boss);
          if (boss) {
            // The same fair arena on every design: only the boss in it, its middle clear.
            expect(m.spawns.length, tag).toBe(1);
            const arena = m.rooms.find((r) => r.kind === 'arena')!;
            expect([arena.rx, arena.ry], tag).toEqual([11, 9]);
            for (let y = arena.cy - 2; y <= arena.cy + 2; y++) for (let x = arena.cx - 2; x <= arena.cx + 2; x++) expect(tileAt(m, x, y), tag).toBe(FLOOR);
            const [bx, by] = at(m.spawns[0]);
            expect(tileAt(m, bx, by), tag).toBe(FLOOR);
          } else {
            // Foes in every fighting room; a side room or two off the way (folk camp in them).
            for (const r of m.rooms) if (r.kind !== 'start' && !r.quiet) expect(m.spawns.some((s) => m.rooms[s.room] === r), `${tag}: ${r.kind} room at ${r.cx},${r.cy}`).toBe(true);
            expect(m.rooms.filter((r) => r.kind === 'side').length, tag).toBeGreaterThan(0);
            expect(m.spawns.length, tag).toBeGreaterThan(8);
          }
        }
      });
    });
  }

  it('are the same for the same seed, and differ from one seed to the next', () => {
    for (const design of FLOOR_DESIGNS) {
      for (const [id, floor] of [['hamlet', 3], ['crypt', 22], ['forest', 15]] as const) {
        const a = build(design, id, floor, 77);
        const b = build(design, id, floor, 77);
        expect(fingerprint(b), `${design} ${id}`).toBe(fingerprint(a));
        expect(Array.from(build(design, id, floor, 78).tiles), `${design} ${id}`).not.toEqual(Array.from(a.tiles));
      }
    }
  });

  it('are different shapes, not reseeds of one', () => {
    // The same biome, floor and seed built to each design: every pair differs, in size or in shape
    // (how much of the map is floor, how far the exit is from the start).
    const traits = FLOOR_DESIGNS.map((design) => {
      const m = build(design, 'desert', 7, 4242);
      const [sx, sy] = at(m.start);
      const [ex, ey] = at(m.exit);
      const open = m.tiles.reduce((n, t) => n + (t === FLOOR ? 1 : 0), 0);
      return { design, w: m.w, h: m.h, fill: open / m.tiles.length, walk: bfs(m, sx, sy)[ey * m.w + ex] };
    });
    for (let i = 0; i < traits.length; i++) {
      for (let j = i + 1; j < traits.length; j++) {
        const a = traits[i];
        const b = traits[j];
        const same = a.w === b.w && a.h === b.h && Math.abs(a.fill - b.fill) < 0.02 && Math.abs(a.walk - b.walk) < 4;
        expect(same, `${a.design} vs ${b.design}`).toBe(false);
      }
    }
    expect(new Set(traits.map((t) => `${t.w}x${t.h}`)).size).toBeGreaterThanOrEqual(6);
  });

  it('leave the chain of rooms exactly as it was when no design is asked for', () => {
    const m = generateFloor({ floor: 9, biome: BIOMES.forest, seed: 31, boss: false });
    expect(m.design).toBe('chain');
    expect(fingerprint(generateFloor({ floor: 9, biome: BIOMES.forest, seed: 31, boss: false, design: 'chain' }))).toBe(fingerprint(m));
  });
});

describe('the deck of designs', () => {
  it('deals every design once before any comes round again, and never one twice in a row', () => {
    const n = FLOOR_DESIGNS.length;
    for (const start of [1, 2, 3]) {
      const run: DeckState = { designDeck: shuffleDeck(start, null), lastDesign: null };
      const dealt: DesignId[] = [];
      // Enough reshuffles that the new deck often comes up with the last card on top.
      for (let i = 0; i < n * 60; i++) dealt.push(drawDesign(run, start * 1000 + i));
      for (let k = 0; k < dealt.length; k += n) expect(new Set(dealt.slice(k, k + n)).size).toBe(n);
      for (let i = 1; i < dealt.length; i++) expect(dealt[i], `deal ${i}`).not.toBe(dealt[i - 1]);
    }
  });

  it('opens a new game with the plain chain, then plays the rest in a shuffled order', () => {
    const orders = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = newGame(seed);
      expect(s.run.designDeck[0]).toBe('chain');
      expect([...s.run.designDeck].sort()).toEqual([...FLOOR_DESIGNS].sort());
      orders.add(s.run.designDeck.join());
      // The same save deals the same cards.
      expect(newGame(seed).run.designDeck).toEqual(s.run.designDeck);
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('shrugs off a damaged deck', () => {
    expect(cleanDeck(['maze', 'bogus', 'loop', 'maze', 3, null])).toEqual(['maze', 'loop']);
    expect(cleanDeck('maze')).toEqual([]);
    // The card just played on top (only a damaged save could do that) waits its turn.
    const run: DeckState = { designDeck: ['loop', 'maze'], lastDesign: 'loop' };
    expect(drawDesign(run, 1)).toBe('maze');
    const lone: DeckState = { designDeck: ['loop'], lastDesign: 'loop' };
    expect(drawDesign(lone, 1)).not.toBe('loop');
  });

  it('carries on through a rebirth', () => {
    const s = newGame(11);
    s.run.bestFloor = 40;
    s.run.designDeck = ['maze', 'loop', 'spiral'];
    s.run.lastDesign = 'valley';
    s.run.visits = 12;
    expect(rebirth(s)).toBe(true);
    expect(s.run.designDeck).toEqual(['maze', 'loop', 'spiral']);
    expect(s.run.lastDesign).toBe('valley');
    expect(s.run.visits).toBe(0);
  });
});

describe('saves from before floor designs', () => {
  function oldSave(seed: number) {
    const s = JSON.parse(JSON.stringify(newGame(seed)));
    delete s.run.designDeck;
    delete s.run.lastDesign;
    delete s.run.visits;
    s.version = 1;
    return s;
  }

  it('get a full deck that opens with something other than the chain they played every floor', () => {
    const s = mend(oldSave(7));
    expect(s.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(2);
    expect([...s.run.designDeck].sort()).toEqual([...FLOOR_DESIGNS].sort());
    expect(s.run.lastDesign).toBe('chain');
    expect(s.run.visits).toBe(0);
    expect(drawDesign(s.run, 99)).not.toBe('chain');
    // The same old save always migrates the same way.
    expect(mend(oldSave(7)).run.designDeck).toEqual(mend(oldSave(7)).run.designDeck);
  });

  it('keep a deck in progress (minus anything that is not a design) through saving and loading', () => {
    const s = newGame(9);
    s.run.designDeck = ['maze', 'loop'];
    s.run.lastDesign = 'gauntlet';
    s.run.visits = 5;
    const back = mend(JSON.parse(JSON.stringify(s)));
    expect(back.run.designDeck).toEqual(['maze', 'loop']);
    expect(back.run.lastDesign).toBe('gauntlet');
    expect(back.run.visits).toBe(5);
    const bad = JSON.parse(JSON.stringify(s));
    bad.run.designDeck = ['maze', 'bogus', 7];
    bad.run.lastDesign = 'nope';
    bad.run.visits = -3;
    const mended = mend(bad);
    expect(mended.run.designDeck).toEqual(['maze']);
    expect(mended.run.lastDesign).toBeNull();
    expect(mended.run.visits).toBe(0);
  });
});

describe('floors in the game', () => {
  it('play every design before any comes round again, starting with the chain', () => {
    const g = new Game(true);
    const seen: Array<string | undefined> = [];
    for (let f = 1; f <= FLOOR_DESIGNS.length; f++) {
      g.startFloor(f);
      seen.push(g.world!.map.design);
    }
    expect(seen[0]).toBe('chain');
    expect(new Set(seen).size).toBe(FLOOR_DESIGNS.length);
    g.startFloor(11);
    expect(g.world!.map.design).not.toBe(seen[seen.length - 1]);
  });

  it('build a floor you walk back into afresh, to the next design', () => {
    const g = new Game(true);
    g.startFloor(3);
    const first = g.world!.map;
    g.startFloor(3);
    const again = g.world!.map;
    expect(g.state.run.visits).toBe(2);
    expect(again.design).not.toBe(first.design);
    expect(Array.from(again.tiles)).not.toEqual(Array.from(first.tiles));
    // A wipe sends the squad back to the checkpoint: that's a new map too.
    g.state.run.deaths++;
    g.startFloor(1);
    expect(g.world!.map.design).not.toBe(again.design);
  });
});

describe('a squad on Auto', () => {
  function squad(ids: string[]): HeroSpec[] {
    const s = newGame(1);
    ids.forEach((id) => addKnight(s, id, null));
    return ids.map((id, slot) => {
      const [rarity, cls] = id.split('-') as [HeroSpec['rarity'], HeroSpec['cls']];
      return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
    });
  }

  for (const [design, biome] of FLOOR_DESIGNS.map((d, i) => [d, BIOME_ORDER[i % BIOME_ORDER.length]] as const)) {
    it(`clears a ${design} floor (${biome}) on its own and leaves by the portal`, () => {
      const floor = 3;
      const seed = 4321;
      const map = build(design, biome, floor, seed);
      const w = new World({ map, biome: BIOMES[biome], floor, boss: false, mobTypes: floorMobs(BIOMES[biome], floor, seed), bossType: null, squad: squad([knightId('mythic', 'guardian'), knightId('mythic', 'ranger'), knightId('mythic', 'cleric')]), perks: [], controlled: 0, seed, goldPerKill: 3 });
      w.bot = true;
      for (let t = 0; t < 300 && !w.exited; t += 1 / 30) w.update(1 / 30);
      expect(w.cleared, `${w.mobs.filter((m) => !m.dead).length} foes left`).toBe(true);
      expect(w.exited).toBe(true);
    });
  }
});

describe('the way down', () => {
  it('stands as an archway: a walkable doorway with room for its steps, blocked pillars and back, reached from the start', () => {
    let backed = 0;
    let total = 0;
    for (const design of FLOOR_DESIGNS) {
      BIOME_ORDER.forEach((id, bi) => {
        for (const floor of [3, 5, 10, 22]) {
          const m = build(design, id, floor, 4321 + floor * 11 + bi);
          const tag = `${design} ${id} ${floor}`;
          const [tx, ty] = at(m.exit);
          expect(tileAt(m, tx, ty), tag).toBe(FLOOR);
          for (const d of [-1, 0, 1]) expect(tileAt(m, tx + d, ty + 1), `${tag}: steps`).toBe(FLOOR);
          const [sx, sy] = at(m.start);
          expect(bfs(m, sx, sy)[ty * m.w + tx], `${tag}: reachable`).toBeGreaterThanOrEqual(0);
          total++;
          if (tileAt(m, tx - 1, ty) !== FLOOR && tileAt(m, tx + 1, ty) !== FLOOR && tileAt(m, tx, ty - 1) !== FLOOR) backed++;
          if (isBossFloor(floor)) {
            // At the arena's far end, well clear of where the boss stands.
            const boss = m.spawns.find((s) => s.boss)!;
            expect(boss.y - m.exit.y, tag).toBeGreaterThanOrEqual(3 * TILE);
          }
        }
      });
    }
    // Nearly always a proper doorway (pillars and back blocked).
    expect(backed / total).toBeGreaterThan(0.9);
  });
});
