import { describe, expect, it } from 'vitest';
import { BAL } from '../src/core/balance';
import { knightId } from '../src/core/knights';
import { addKnight, killGold } from '../src/core/roster';
import { RUN_ITEMS, RUN_ITEM_IDS, canStack, runMults, warePrice } from '../src/core/runItems';
import { SKILLS, tierStep } from '../src/core/skillbook';
import { Game } from '../src/game';
import { BIOMES, isBossFloor } from '../src/world/biomes';
import { FLOOR, TILE, bfs, generateFloor, tileAt } from '../src/world/mapgen';
import { placeNpcs } from '../src/world/npcs';
import { placeShop, shopChance } from '../src/world/shop';

describe('run items', () => {
  it('add up: tonics multiply, fangs and thorns are shares, stacks stop at their max', () => {
    expect(runMults({})).toMatchObject({ dmg: 1, hp: 1, atkSpd: 1, gold: 1, luck: 1, lifesteal: 0, thorns: 0, phoenix: 0 });
    const m = runMults({ whetstone: 2, ironTonic: 1, swiftTonic: 1, fang: 1, thorns: 1, idol: 1, charm: 1, phoenix: 2 });
    expect(m.dmg).toBeCloseTo(1.4, 9);
    expect(m.hp).toBeCloseTo(1.25, 9);
    expect(m.atkSpd).toBeCloseTo(1.15, 9);
    expect(m.lifesteal).toBeCloseTo(0.04, 9);
    expect(m.thorns).toBeCloseTo(0.3, 9);
    expect(m.gold).toBeCloseTo(1.3, 9);
    expect(m.luck).toBeCloseTo(1.25, 9);
    expect(m.phoenix).toBe(2);
    expect(runMults({ whetstone: 99 }).dmg).toBeCloseTo(1 + 0.2 * RUN_ITEMS.whetstone.max, 9);
    expect(canStack({ idol: RUN_ITEMS.idol.max }, 'idol')).toBe(false);
    expect(canStack({ idol: 1 }, 'idol')).toBe(true);
    // A heal or a scroll can always be bought again.
    expect(canStack({}, 'draught')).toBe(true);
  });

  it('cost a tidy number of the floor\'s gold, dearer for the stronger stuff, and more deeper down', () => {
    for (const id of RUN_ITEM_IDS) {
      const p = warePrice(id, killGold(5));
      expect(p, id).toBeGreaterThan(0);
      expect(warePrice(id, killGold(30)), id).toBeGreaterThan(p);
    }
    expect(warePrice('scroll', 10)).toBeGreaterThan(warePrice('draught', 10));
    expect(warePrice('draught', 37) % 5).toBe(0);
  });
});

describe('shops on a floor', () => {
  it('turn up now and then: never on floor 1 or a boss floor, most often just before a boss', () => {
    expect(shopChance(1)).toBe(0);
    expect(shopChance(5)).toBe(0);
    expect(shopChance(4)).toBe(BAL.shop.chanceBeforeBoss);
    expect(shopChance(7)).toBe(BAL.shop.chance);
  });

  it('keep a merchant at her set-up, wares on open floor in front, nothing spawning in her room, all reachable', () => {
    let made = 0;
    for (const biome of ['hamlet', 'forest', 'dungeon', 'swamp', 'desert'] as const) {
      for (let k = 0; k < 6; k++) {
        const floor = isBossFloor(4 + k) ? 3 + k : 4 + k;
        const seed = 900 + k * 37;
        const map = generateFloor({ floor, biome: BIOMES[biome], seed, boss: false });
        const npcs = placeNpcs(map, floor, biome, seed, []);
        const shop = placeShop(map, floor, biome, seed, killGold(floor), npcs.flatMap((n) => (n.camp ? [n.camp] : [])));
        if (!shop) continue;
        made++;
        const tag = `${biome} ${floor} ${seed}`;
        expect(shop.wares.length, tag).toBeGreaterThanOrEqual(1);
        expect(new Set(shop.wares.map((w) => w.item)).size, tag).toBe(shop.wares.length);
        if (shop.room >= 0) expect(map.spawns.filter((s) => !s.boss && s.room === shop.room).length, tag).toBe(0);
        const [sx, sy] = [Math.floor(map.start.x / TILE), Math.floor(map.start.y / TILE)];
        const reach = bfs(map, sx, sy);
        for (const w of shop.wares) {
          const tx = Math.floor(w.x / TILE);
          const ty = Math.floor(w.y / TILE);
          expect(tileAt(map, tx, ty), tag).toBe(FLOOR);
          expect(reach[ty * map.w + tx], tag).toBeGreaterThanOrEqual(0);
          expect(w.price, tag).toBeGreaterThan(0);
        }
        expect(shop.merchant.def.id).toBe('shopkeeper');
      }
    }
    expect(made).toBeGreaterThan(5);
  });
});

describe('buying', () => {
  /** A game on a floor with a shop (the seed and floor tried until one has one), gold to spend. */
  function shopGame(): Game {
    const g = new Game(true);
    const s = g.state;
    s.roll.tutorial = 'done';
    s.rebirths = 2;
    for (const c of ['guardian', 'blade', 'cleric'] as const) addKnight(s, knightId('rare', c), null);
    s.squad = [knightId('rare', 'guardian'), knightId('rare', 'blade'), knightId('rare', 'cleric')];
    s.gold = 1e6;
    g.inDungeon = true;
    for (let i = 0; i < 40; i++) {
      s.run.biomeSeed = 1000 + i * 17;
      g.startFloor(4);
      if (g.world!.wares.length) return g;
    }
    throw new Error('no shop in 40 tries');
  }

  it('takes the price, heals the squad on a draught, and is gone once sold', () => {
    const g = shopGame();
    const w = g.world!;
    const ware = w.wares[0];
    ware.item = 'draught';
    for (const h of w.heroes) h.hp = h.maxHp * 0.2;
    const gold = g.state.gold;
    expect(g.buyWare(ware)).toBe('ok');
    expect(g.state.gold).toBe(gold - ware.price);
    for (const h of w.heroes) expect(h.hp).toBeGreaterThan(h.maxHp * 0.75);
    expect(g.buyWare(ware)).toBe('gone');
    // Short of gold: nothing happens.
    const next = w.wares.find((x) => !x.sold);
    if (next) {
      g.state.gold = next.price - 1;
      expect(g.buyWare(next)).toBe('short');
      expect(next.sold).toBe(false);
    }
  });

  it('keeps tonics for the run (the squad on this floor and the next), and loses them back at camp', () => {
    const g = shopGame();
    const w = g.world!;
    const h = w.heroes[0];
    const atk = h.atk;
    const maxHp = h.maxHp;
    const ware = w.wares[0];
    ware.item = 'whetstone';
    expect(g.buyWare(ware)).toBe('ok');
    expect(h.atk).toBeCloseTo(atk * 1.2, 6);
    const w2 = w.wares[1] ?? w.wares[0];
    w2.sold = false;
    w2.item = 'ironTonic';
    expect(g.buyWare(w2)).toBe('ok');
    expect(h.maxHp).toBeCloseTo(maxHp * 1.25, 6);
    expect(g.state.run.items).toMatchObject({ whetstone: 1, ironTonic: 1 });
    // The next floor is built with them.
    g.startFloor(6);
    const h2 = g.world!.heroes.find((x) => x.knightId === h.knightId)!;
    expect(h2.atk).toBeCloseTo(atk * 1.2, 6);
    // Back at camp, the run is over.
    g.leaveDungeon();
    expect(g.state.run.items).toEqual({});
  });

  it('a Phoenix Feather catches the next knight to fall; a Spell Scroll rigs the next roll Epic or better', () => {
    const g = shopGame();
    const w = g.world!;
    const ware = w.wares[0];
    ware.item = 'phoenix';
    expect(g.buyWare(ware)).toBe('ok');
    expect(w.phoenix).toBe(1);
    const h = w.heroes[1];
    w.damage(h, h.maxHp * 10, null);
    expect(h.downed).toBe(false);
    expect(h.hp).toBeCloseTo(h.maxHp * 0.5, 6);
    expect(w.phoenix).toBe(0);
    // The world tells the game; the feather's gone from the run too.
    g.tick(1 / 30);
    expect(g.state.run.items?.phoenix ?? 0).toBe(0);
    const scroll = w.wares[1] ?? w.wares[0];
    scroll.sold = false;
    scroll.item = 'scroll';
    expect(g.buyWare(scroll)).toBe('ok');
    const me = w.heroes.find((x) => x.slot === w.controlled)!;
    expect(me.skillRig).toBeDefined();
    expect(tierStep(SKILLS[me.skillRig!].tier)).toBeGreaterThanOrEqual(3);
  });
});
