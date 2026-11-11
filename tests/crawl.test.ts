/**
 * Things a comb through the game for bugs turned up, each pinned here so it stays fixed.
 */
import { describe, expect, it } from 'vitest';
import { FLOOR_DESIGNS } from '../src/core/deck';
import { knightId } from '../src/core/knights';
import { newGame, rebirth } from '../src/core/newGame';
import { runOffline } from '../src/core/offline';
import { startSpin } from '../src/core/roller';
import { Rng } from '../src/core/rng';
import { addKnight, knightStats, levelCost, sellValue } from '../src/core/roster';
import { mend } from '../src/core/save';
import { Game } from '../src/game';
import { BIOMES } from '../src/world/biomes';
import { clear } from '../src/world/entities';
import { TILE, generateFloor } from '../src/world/mapgen';
import { floorMobs } from '../src/world/mobgen';
import { placeNpcs } from '../src/world/npcs';
import { placeShop } from '../src/world/shop';
import { provoke } from '../src/world/thief';
import { trapTiles } from '../src/world/traps';
import { World, type HeroSpec } from '../src/world/world';

function squad(ids: string[]): HeroSpec[] {
  const s = newGame(1);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id.split('-') as [HeroSpec['rarity'], HeroSpec['cls']];
    const stats = knightStats(s, id);
    stats.hp *= 1e6;
    return { knightId: id, cls, rarity, mutation: null, stats, slot, hpShare: 1 };
  });
}

const TRIO = [knightId('epic', 'guardian'), knightId('epic', 'blade'), knightId('epic', 'ranger')];

function floorOf(biome: keyof typeof BIOMES, floor: number, seed: number, design = FLOOR_DESIGNS[0]): World {
  const map = generateFloor({ floor, biome: BIOMES[biome], seed, boss: false, design });
  return new World({ map, biome: BIOMES[biome], floor, boss: false, mobTypes: floorMobs(BIOMES[biome], floor, seed), bossType: null, squad: squad(TRIO), perks: [], controlled: 0, seed, goldPerKill: 10 });
}

/** A game at the hub with a squad, ready to go down. */
function ready(): Game {
  const g = new Game(true);
  for (let t = 0; t < 12; t += 1 / 30) g.tick(1 / 30);
  return g;
}

describe('coins', () => {
  it('a coin flying to the leader lands, whatever the frame rate (it used to overshoot and circle for good)', () => {
    for (const fps of [60, 30, 20, 10]) {
      const w = floorOf('forest', 3, 77);
      w.mobs = [];
      w.traps = [];
      w.pickups = [];
      const lead = w.leader()!;
      w.pickups.push({ uid: 1, x: lead.x + 600, y: lead.y, vx: 0, vy: 0, z: 0, vz: 0, kind: 'gold', amount: 5, t: 0, taken: false });
      let got = 0;
      for (let i = 0; i < 12 * fps; i++) {
        w.update(1 / fps);
        got += w.events.filter((e) => e.type === 'pickup').length;
        w.events.length = 0;
        w.fx.length = 0;
      }
      expect(got, `${fps} fps`).toBe(1);
      expect(w.pickups.length).toBe(0);
    }
  });

  it("a pile lying on the floor waits for a knight to come by (and comes in when the floor's cleared)", () => {
    let w: World | null = null;
    for (let seed = 5; seed < 400 && !w; seed += 7) {
      const tryW = floorOf('dungeon', 22, seed);
      const lead = tryW.leader()!;
      if (tryW.pickups.some((p) => Math.hypot(p.x - lead.x, p.y - lead.y) > 120)) w = tryW;
    }
    expect(w).not.toBeNull();
    const far = w!.pickups.filter((p) => Math.hypot(p.x - w!.leader()!.x, p.y - w!.leader()!.y) > 120);
    const at = far.map((p) => [p.x, p.y]);
    w!.traps = [];
    const keep = w!.mobs;
    // (The foes are parked: nothing wakes, nothing dies, the floor isn't cleared.)
    for (const m of keep) m.awake = false;
    for (let i = 0; i < 180; i++) {
      w!.update(1 / 60);
      w!.events.length = 0;
      w!.fx.length = 0;
    }
    far.forEach((p, i) => expect([p.x, p.y]).toEqual(at[i]));
    // Every foe gone: the floor is cleared and what's lying about comes in.
    w!.mobs = [];
    let got = 0;
    for (let i = 0; i < 60 * 30 && w!.pickups.length; i++) {
      w!.update(1 / 60);
      got += w!.events.filter((e) => e.type === 'pickup').length;
      w!.events.length = 0;
      w!.fx.length = 0;
    }
    expect(w!.pickups.length).toBe(0);
    expect(got).toBeGreaterThanOrEqual(far.length);
  });

  it('coins banked at the portal are not left to be picked up again', () => {
    const g = ready();
    g.enterDungeon();
    const w = g.world!;
    w.mobs = [];
    for (let i = 0; i < 120; i++) g.tick(1 / 60);
    const lead = w.leader()!;
    lead.x = w.map.exit.x;
    lead.y = w.map.exit.y;
    for (let k = 0; k < 6; k++) w.pickups.push({ uid: 900000 + k, x: lead.x + 20 + k * 4, y: lead.y - 8, vx: 0, vy: 0, z: 0, vz: 0, kind: 'gold', amount: 100, t: 0.2 + k * 0.02, taken: false });
    const gold0 = g.state.gold;
    for (let t = 0; t < 4 && g.world === w; t += 1 / 60) g.tick(1 / 60);
    expect(g.state.gold - gold0).toBe(600);
  });
});

describe('floors', () => {
  it('no foe or ware is put down on a trap (dungeon and crypt)', () => {
    let floors = 0;
    for (const biome of ['dungeon', 'crypt'] as const) {
      for (const design of FLOOR_DESIGNS) {
        for (let k = 0; k < 6; k++) {
          const seed = 11 + k * 37;
          const floor = 22 + k;
          const map = generateFloor({ floor, biome: BIOMES[biome], seed, boss: false, design });
          const npcs = placeNpcs(map, floor, biome, seed, []);
          const shop = placeShop(map, floor, biome, seed, 10, npcs.flatMap((n) => (n.camp ? [n.camp] : [])), false);
          const trapped = trapTiles(map);
          const on = (x: number, y: number) => trapped.has(Math.floor(y / TILE) * map.w + Math.floor(x / TILE));
          for (const s of map.spawns) expect(on(s.x, s.y), `${biome} ${design} ${seed} spawn`).toBe(false);
          for (const ware of shop?.wares ?? []) expect(on(ware.x, ware.y), `${biome} ${design} ${seed} ware`).toBe(false);
          floors++;
        }
      }
    }
    expect(floors).toBeGreaterThan(50);
  });

  it('a boss has room to move where it stands', () => {
    for (const biome of ['dungeon', 'crypt', 'ember'] as const) {
      for (let k = 0; k < 60; k++) {
        const map = generateFloor({ floor: 10, biome: BIOMES[biome], seed: 900 + k * 17, boss: true, design: FLOOR_DESIGNS[k % FLOOR_DESIGNS.length] });
        const boss = map.spawns.find((s) => s.boss)!;
        expect(clear(map, boss.x, boss.y, 12, false), `${biome} seed ${900 + k * 17}`).toBe(true);
      }
    }
  });

  it('a robbed merchant lands where she can move (not wedged between her stall posts)', () => {
    let shops = 0;
    for (const biome of ['forest', 'tundra', 'dungeon', 'desert', 'graveyard', 'ember'] as const) {
      for (let k = 0; k < 200 && shops < 400; k++) {
        const floor = 4;
        const seed = 5000 + k * 13;
        const map = generateFloor({ floor, biome: BIOMES[biome], seed, boss: false, design: FLOOR_DESIGNS[0] });
        const npcs = placeNpcs(map, floor, biome, seed, []);
        const shop = placeShop(map, floor, biome, seed, 10, npcs.flatMap((n) => (n.camp ? [n.camp] : [])), false);
        if (!shop) continue;
        npcs.push(shop.merchant);
        const w = new World({ map, biome: BIOMES[biome], floor, boss: false, mobTypes: floorMobs(BIOMES[biome], floor, seed), bossType: null, squad: squad(TRIO), perks: [], controlled: 0, seed, goldPerKill: 10, npcs });
        w.wares = shop.wares;
        w.mobs = [];
        w.heroes.forEach((h, i) => {
          h.x = shop.wares[0].x + i * 10;
          h.y = shop.wares[0].y + 20;
        });
        const step = (secs: number) => {
          for (let t = 0; t < secs; t += 1 / 60) {
            w.update(1 / 60);
            w.fx.length = 0;
            w.events.length = 0;
          }
        };
        step(0.5);
        provoke(w);
        for (let t = 0; t < 20 && !w.fury!.unit; t += 0.1) step(0.1);
        const m = w.fury!.unit!;
        step(1.5);
        expect(clear(map, m.x, m.y, m.r, false), `${biome} seed ${seed}`).toBe(true);
        shops++;
        if (shops % 3 === 0) break;
      }
    }
    expect(shops).toBeGreaterThanOrEqual(6);
  });
});

describe('the run', () => {
  it('camp from a boss floor whose boss has fallen goes on to the next floor, not back before the boss', () => {
    const g = ready();
    g.enterDungeon();
    g.startFloor(5);
    const w = g.world!;
    expect(w.boss).toBe(true);
    expect(g.campTarget()).toBe(1);
    w.portalOpen = true;
    expect(g.campTarget()).toBe(6);
    g.leaveDungeon();
    expect(g.state.run.floor).toBe(6);
  });

  it('camp is no way round a wipe', () => {
    const g = ready();
    g.enterDungeon();
    g.startFloor(19);
    g.state.run.checkpoint = 10;
    for (const h of [...g.world!.heroes]) g.world!.downHero(h);
    for (let i = 0; i < 10 && !g.wiping; i++) g.tick(1 / 60);
    expect(g.wiping).toBe(true);
    g.leaveDungeon();
    expect(g.inDungeon).toBe(false);
    expect(g.state.run.floor).toBe(10);
  });

  it('a knight rolled during a dive waits at the hub', () => {
    const g = ready();
    const s = g.state;
    s.rebirths = 2;
    // One knight in the squad, the other places open.
    const first = s.squad.find(Boolean)!;
    s.squad = [first, null, null];
    s.leftEmpty = [false, false, false];
    for (const id of Object.keys(s.roster)) if (id !== first) delete s.roster[id];
    g.enterDungeon();
    expect(g.world!.heroes.length).toBe(1);
    for (let t = 0; t < 40; t += 1 / 20) g.tick(1 / 20);
    if (g.inDungeon && g.world) expect(s.squad.filter(Boolean).length).toBe(1);
  });

  it('rebirth takes the fight rate and the jobs with it (no gold comes through)', () => {
    const s = newGame(3);
    s.run.bestFloor = 200;
    s.run.floor = 200;
    s.run.bosses = 40;
    s.stats.combatPerMinute = 1e6;
    s.stats.combatWindow = [[1, 2]];
    s.stats.goldPerMinute = 5;
    s.quests = [{} as never];
    expect(rebirth(s)).toBe(true);
    expect(s.stats.combatPerMinute).toBe(0);
    expect(s.stats.combatWindow).toEqual([]);
    expect(s.stats.goldPerMinute).toBe(0);
    expect(s.quests).toEqual([]);
  });

  it("selling refunds half the levels at this run's prices", () => {
    const s = newGame(5);
    s.rebirths = 2;
    const id = knightId('rare', 'blade');
    addKnight(s, id, null);
    let paid = 0;
    for (let L = 1; L < 20; L++) {
      s.roster[id].level = L;
      paid += levelCost(s, id);
    }
    s.roster[id].level = 20;
    const base = (() => {
      const lvl1 = { ...s, roster: { [id]: { ...s.roster[id], level: 1 } } } as typeof s;
      return sellValue(lvl1, id);
    })();
    const refund = sellValue(s, id) - base;
    expect(refund / paid).toBeGreaterThan(0.45);
    expect(refund / paid).toBeLessThan(0.55);
  });
});

describe('time away and saves', () => {
  const settled = () => {
    const s = newGame(9);
    s.roll.tutorial = 'done';
    s.roll.sealed = false;
    for (const c of ['guardian', 'blade', 'ranger'] as const) addKnight(s, knightId('common', c), null);
    return s;
  };

  it("spins while away don't spend Hourglasses", () => {
    const s = settled();
    s.hourglasses = 50;
    const report = runOffline(s, new Rng(4), 3600, 1_000_000);
    expect(report).not.toBeNull();
    expect(report!.rolls).toBeGreaterThan(0);
    expect(s.hourglasses).toBe(50);
  });

  it('a spin in flight is kept by a save and lands (its knights and what it spent are not lost)', () => {
    const s = settled();
    const rng = new Rng(8);
    const spin = startSpin(s, rng, 1_000_000, () => {});
    expect(spin.landed).toBe(false);
    const want = spin.reels.map((r) => r.knightId);
    const loaded = mend(JSON.parse(JSON.stringify(s)));
    expect(loaded.roll.current).not.toBeNull();
    expect(loaded.roll.current!.reels.map((r) => r.knightId)).toEqual(want);
    // ...and time away lands it before anything else is rolled.
    const before = Object.values(loaded.codex).reduce((n, c) => n + c.count, 0);
    const report = runOffline(loaded, new Rng(8), 3600, 2_000_000)!;
    expect(report.kept.slice(0, want.length).map((k) => k.knightId)).toEqual(want);
    expect(Object.values(loaded.codex).reduce((n, c) => n + c.count, 0)).toBe(before + report.kept.length);
    // A damaged spin goes.
    const bad = JSON.parse(JSON.stringify(s));
    bad.roll.current.reels[0].knightId = 'nobody-at-all';
    expect(mend(bad).roll.current).toBeNull();
  });

  it("a record that isn't a knight is dropped on load (it used to throw on every start)", () => {
    const s = settled();
    const raw = JSON.parse(JSON.stringify(s));
    raw.roster['absolute-ranger'] = { id: 'absolute-ranger', level: 3, mutation: null, copies: 1, extras: 0, extrasGold: 0 };
    raw.squad = ['absolute-ranger', null, null];
    const out = mend(raw);
    expect(out.roster['absolute-ranger']).toBeUndefined();
    expect(out.squad.includes('absolute-ranger')).toBe(false);
    expect(() => runOffline(out, new Rng(2), 3600, 5_000_000)).not.toThrow();
  });
});

describe('a graphics reset', () => {
  it('a kept canvas paints itself again when the browser gives it back, and the count of wiped ones comes back to none', async () => {
    const { canvasesHealing, graphicsReset, healingGivenUp, heals, onGraphicsReset } = await import('../src/render/art/draw');
    const fake = () => {
      const on = new Map<string, () => void>();
      return { on, c: { addEventListener: (t: string, f: () => void) => on.set(t, f) } as unknown as HTMLCanvasElement };
    };
    const a = fake();
    const b = fake();
    let painted = 0;
    heals(a.c, () => painted++);
    heals(b.c, () => painted++);
    expect(canvasesHealing()).toBe(0);
    a.on.get('contextlost')!();
    a.on.get('contextlost')!();
    b.on.get('contextlost')!();
    expect(canvasesHealing()).toBe(2);
    a.on.get('contextrestored')!();
    expect(canvasesHealing()).toBe(1);
    expect(painted).toBe(1);
    // (One that was thrown away while wiped never reports back: the wait gives up on the count.)
    healingGivenUp();
    expect(canvasesHealing()).toBe(0);
    b.on.get('contextrestored')!();
    expect(canvasesHealing()).toBe(0);
    expect(painted).toBe(2);
    let forgot = 0;
    onGraphicsReset(() => forgot++);
    graphicsReset();
    expect(forgot).toBe(1);
  });
});
