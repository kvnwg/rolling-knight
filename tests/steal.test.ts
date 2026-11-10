import { describe, expect, it } from 'vitest';
import { BAL } from '../src/core/balance';
import type { CoreEvent } from '../src/core/events';
import { knightId } from '../src/core/knights';
import { addKnight, goldMult, killGold } from '../src/core/roster';
import { thiefPrice, warePrice } from '../src/core/runItems';
import { Game } from '../src/game';
import { furiousFrame, dazedFrame, turningFrame } from '../src/render/art/furious';
import { mobFrame } from '../src/render/art/mobs';
import { NPC_H, NPC_W } from '../src/render/art/npcs';
import { mobPaint } from '../src/render/pf/mobLook';
import { mobMotion } from '../src/render/mobMotion';
import { BIOMES } from '../src/world/biomes';
import { dist } from '../src/world/entities';
import { FLOOR, TILE, generateFloor, tileAt } from '../src/world/mapgen';
import { floorBoss } from '../src/world/mobgen';
import { placeNpcs } from '../src/world/npcs';
import { placeShop } from '../src/world/shop';
import { THIEF_FALL, THIEF_SEETHE, THIEF_TAUNTS, THIEF_TURN, VAULT_TIME, furious, furiousMerchantType, isMerchant, merchantOf, wouldBeBoss } from '../src/world/thief';
import type { World } from '../src/world/world';

const T = BAL.shop.thief;
/** Everything she shouts is drawable in the bitmap font. */
const FONT_SAFE = /^[A-Za-z0-9 .,!?:'"\-+/%()]+$/;

/** A game on floor `floor` with a shop (seeds tried until one has one), the squad's leader standing at her first ware. */
function shopGame(floor = 4, gold = 0): { g: Game; events: CoreEvent[] } {
  const g = new Game(true);
  const s = g.state;
  s.roll.tutorial = 'done';
  s.rebirths = 2;
  for (const c of ['guardian', 'blade', 'ranger'] as const) addKnight(s, knightId('epic', c), null);
  s.squad = [knightId('epic', 'guardian'), knightId('epic', 'blade'), knightId('epic', 'ranger')];
  s.gold = gold;
  g.inDungeon = true;
  const events: CoreEvent[] = [];
  g.on((e) => events.push(e));
  toShop(g, floor);
  return { g, events };
}

/** Starts floors until one has a shop, and stands the squad at its first ware. */
function toShop(g: Game, floor: number): void {
  for (let i = 0; i < 60; i++) {
    g.state.run.biomeSeed = 1000 + i * 17;
    g.startFloor(floor);
    if (g.world!.wares.length) return standAt(g.world!, 0);
  }
  throw new Error('no shop in 60 tries');
}

function standAt(w: World, i: number): void {
  const ware = w.wares[i];
  const lead = w.leader()!;
  lead.x = ware.x;
  lead.y = ware.y + 6;
  w.heroes.filter((h) => h !== lead).forEach((h, k) => {
    h.x = ware.x + (k ? 10 : -10);
    h.y = ware.y + 12;
  });
}

/** Plays `seconds` of the game. `safe`: the squad can't be hurt meanwhile (a 3x boss makes short work of it). */
function play(g: Game, seconds: number, safe = false): void {
  for (let t = 0; t < seconds; t += 1 / 30) {
    if (safe && g.world) for (const h of g.world.heroes) h.hp = h.maxHp;
    g.tick(1 / 30);
  }
}

/** Steals the first ware and plays through her warning and her vault: she's on the floor, furious. */
function robbed(floor = 4): { g: Game; w: World; events: CoreEvent[] } {
  const { g, events } = shopGame(floor);
  const w = g.world!;
  // (Only her: the floor's own foes would get in the way of what's measured.)
  w.mobs = [];
  expect(g.stealWare(w.wares[0])).toBe('ok');
  play(g, T.turn + VAULT_TIME + 0.4, true);
  return { g, w, events };
}

describe('stealing from a merchant', () => {
  it('takes the ware for nothing, works like a bought one, and marks you a thief', () => {
    const { g, events } = shopGame(4, 3);
    const w = g.world!;
    const ware = w.wares[0];
    ware.item = 'whetstone';
    const atk = w.heroes[0].atk;
    expect(g.buyWare(ware)).toBe('short');
    expect(g.stealWare(ware)).toBe('ok');
    expect(g.state.gold).toBe(3);
    expect(ware.sold).toBe(true);
    expect(g.state.run.items).toMatchObject({ whetstone: 1 });
    expect(w.heroes[0].atk).toBeCloseTo(atk * 1.2, 6);
    expect(g.state.run.thief).toBe(true);
    expect(events.some((e) => e.type === 'stolen' && e.first && e.item === 'whetstone')).toBe(true);
    // Gone is gone.
    expect(g.stealWare(ware)).toBe('gone');
  });

  it('turns her on you: a beat of warning at her stall, then she vaults the counter and is a foe', () => {
    const { g, events } = shopGame();
    const w = g.world!;
    const her = merchantOf(w)!;
    expect(isMerchant(her)).toBe(true);
    const foes = w.mobs.length;
    const behind = tileAt(w.map, Math.floor(her.x / TILE), Math.floor(her.y / TILE)) !== FLOOR;
    g.stealWare(w.wares[0]);
    // The warning: she's still at her stall (past talking), shouting; nothing to fight yet.
    expect(w.fury).not.toBeNull();
    expect(w.fury!.unit).toBeNull();
    expect(w.npcs).toContain(her);
    expect(w.mobs.length).toBe(foes);
    expect(w.texts.some((t) => THIEF_TURN.includes(t.text))).toBe(true);
    const lead = w.leader()!;
    [lead.x, lead.y] = [her.camp!.talk.x, her.camp!.talk.y];
    expect(w.nearNpc()).toBeNull();
    standAt(w, 1 % w.wares.length);
    play(g, T.turn - 0.2, true);
    expect(w.fury!.unit).toBeNull();
    play(g, 0.3, true);
    // She's turned: off the list of folk, on the floor as a foe, mid-vault from behind her counter.
    const m = w.fury!.unit!;
    expect(m).toBeTruthy();
    expect(w.npcs).not.toContain(her);
    expect(merchantOf(w)).toBeNull();
    expect(w.mobs).toContain(m);
    expect(m.team).toBe('mob');
    expect(m.awake).toBe(true);
    expect(furious(w)).toBe(true);
    expect(events.some((e) => e.type === 'merchantFury')).toBe(true);
    // (Where her set-up has no counter between you, a tent or a cart, she just steps out.)
    expect(!!m.vault).toBe(behind);
    expect(mobMotion(m, w.time).lift).toBeGreaterThanOrEqual(0);
    play(g, VAULT_TIME + 0.1, true);
    // Landed on open floor in front of her stall, where a body can walk.
    expect(m.vault).toBeUndefined();
    expect(tileAt(w.map, Math.floor(m.x / TILE), Math.floor(m.y / TILE))).toBe(FLOOR);
    expect(dist(m.x, m.y, her.camp!.talk.x, her.camp!.talk.y)).toBeLessThan(24);
  });

  it('has 3x the HP and 3x the hit of the boss this floor would have had', () => {
    for (const floor of [4, 7, 12]) {
      const { w } = robbed(floor);
      const m = w.fury!.unit!;
      // The floor's boss, from its own generator and seed, built as World builds a boss floor's.
      const boss = w.makeMob(floorBoss(w.biome, w.floor, w.seed), 0, 0, false, true);
      expect(T.might).toBe(3);
      expect(m.maxHp, `floor ${floor}`).toBeCloseTo(boss.maxHp * 3, 6);
      expect(m.atk, `floor ${floor}`).toBeCloseTo(boss.atk * 3, 6);
      const would = wouldBeBoss(w);
      expect(would.type.boss).toBeDefined();
      expect(would.hp).toBeCloseTo(boss.maxHp, 6);
      expect(would.atk).toBeCloseTo(boss.atk, 6);
    }
  });

  it('is a boss for the HUD: her own bar, her name and title, a merchant\'s moves', () => {
    const { g, w } = robbed();
    const m = w.fury!.unit!;
    expect(w.bossUnit).toBe(m);
    expect(m.boss).toBe(true);
    expect(m.type!.name).toBe('Furious Merchant');
    expect(m.type!.boss!.title).toContain('Madame Thrift');
    // Coins and wares thrown, and a barge: she summons no one, and never slams or leaps.
    expect([...m.type!.boss!.moves].sort()).toEqual(['charge', 'fan', 'rain', 'ring']);
    // She's not the floor's boss: the way down is as open as it was, and stays so.
    expect(w.floorBoss).toBeNull();
    expect(w.portalOpen).toBe(true);
    // She fights: within a few seconds her coins are in the air or her wares are coming down.
    let attacked = false;
    for (let i = 0; i < 300 && !attacked; i++) {
      play(g, 1 / 30, true);
      attacked = w.shots.some((s) => s.team === 'mob' && s.from === m.uid) || w.areas.some((a) => a.team === 'mob' && a.from === m.uid) || !!m.rush;
    }
    expect(attacked).toBe(true);
    for (const s of w.shots.filter((x) => x.from === m.uid)) expect(s.kind).toBe('bullet');
  });

  it('is never hostile without a theft: buying, talking, a fight right at her stall', () => {
    const { g } = shopGame(4, 1e6);
    const w = g.world!;
    const her = merchantOf(w)!;
    expect(g.buyWare(w.wares[0])).toBe('ok');
    // The squad fights the floor's foes on her doorstep for a while: she minds her stall.
    for (const m of w.mobs.slice(0, 4)) {
      m.x = her.camp!.talk.x + 20;
      m.y = her.camp!.talk.y + 30;
      w.wake(m);
    }
    play(g, 12, true);
    expect(w.fury).toBeNull();
    expect(w.npcs).toContain(her);
    expect(w.mobs.some((m) => m.type!.id.includes('-merchant-'))).toBe(false);
    expect(w.bossUnit).toBeNull();
    expect(g.state.run.thief).toBeFalsy();
  });

  it('the squad goes for her once she\'s hostile, and Auto hunts her before it leaves', () => {
    const { g, w } = robbed();
    const m = w.fury!.unit!;
    // The two squadmates the AI plays: she's the foe they find (the leader, yours, stands by).
    expect(w.livingMobs()).toContain(m);
    expect(w.nearestEnemy(w.heroes[1], 400, false)).toBe(m);
    play(g, 4, true);
    const after = m.hp;
    expect(after).toBeLessThan(m.maxHp);
    // On Auto your knight fights her too, and the floor isn't done while she stands.
    expect(w.cleared).toBe(false);
    expect(w.goalFlow).not.toBeNull();
    g.setAuto(true);
    w.bot = true;
    play(g, 4, true);
    expect(m.hp).toBeLessThan(after);
    expect(w.exited).toBe(false);
  });

  it('leaves the rest of her stall free for the grabbing, and sells nothing', () => {
    const { g, w, events } = robbed();
    const rest = w.wares.filter((x) => !x.sold);
    if (!rest.length) return;
    g.state.gold = 1e6;
    expect(g.buyWare(rest[0])).toBe('closed');
    expect(g.state.gold).toBe(1e6);
    // No asking a second time: she's already after you.
    rest[0].item = 'draught';
    expect(g.reachForWare(rest[0])).toBe('ok');
    expect(g.state.gold).toBe(1e6);
    expect(events.filter((e) => e.type === 'stolen').map((e) => (e.type === 'stolen' ? e.first : null))).toEqual([true, false]);
    expect(events.filter((e) => e.type === 'merchantFury').length).toBe(1);
  });

  it('beating her pays: a pile of gold, no floor boss\'s spoils, and her stall for the taking', () => {
    const { g, w, events } = robbed();
    const s = g.state;
    const m = w.fury!.unit!;
    const [bosses, sigils, hourglasses, gold] = [s.run.bosses, s.sigils, s.hourglasses, s.gold];
    w.damage(m, m.maxHp * 2, w.heroes[0]);
    expect(m.dead).toBe(true);
    expect(furious(w)).toBe(false);
    expect(w.bossUnit).toBeNull();
    expect(w.fury!.fell).not.toBeNull();
    expect(w.texts.some((t) => THIEF_FALL.includes(t.text))).toBe(true);
    const loot = w.pickups.filter((p) => p.kind === 'gold').reduce((sum, p) => sum + p.amount, 0);
    expect(loot).toBeGreaterThan(w.goldPerKill * T.loot * 0.9);
    expect(loot).toBeLessThan(w.goldPerKill * T.loot * 1.1);
    // Worth a few wares at this floor's prices.
    const ware = warePrice('ironTonic', killGold(w.floor) * goldMult(s));
    expect(loot).toBeGreaterThan(ware * 3);
    expect(w.pickups.some((p) => p.kind === 'hourglass')).toBe(false);
    play(g, 4, true);
    expect(s.gold).toBeGreaterThanOrEqual(gold + Math.floor(loot * 0.95));
    expect(events.some((e) => e.type === 'merchantDown')).toBe(true);
    expect(events.some((e) => e.type === 'bossDown')).toBe(false);
    expect([s.run.bosses, s.sigils, s.hourglasses]).toEqual([bosses, sigils, hourglasses]);
    // Every other foe gone too: the floor is cleared, like any other.
    expect(w.cleared).toBe(true);
    const rest = w.wares.find((x) => !x.sold);
    if (rest) {
      rest.item = 'helm';
      const before = s.gold;
      expect(g.reachForWare(rest)).toBe('ok');
      expect(s.gold).toBe(before);
    }
  });

  it('going down to her is a wipe like any other, and the run forgets the theft back at camp', () => {
    const { g, w, events } = robbed();
    const m = w.fury!.unit!;
    const deaths = g.state.run.deaths;
    for (const h of w.heroes) w.damage(h, h.maxHp * 100, m);
    expect(w.wiped).toBe(true);
    g.tick(1 / 30);
    expect(g.state.run.deaths).toBe(deaths + 1);
    expect(events.some((e) => e.type === 'wipe')).toBe(true);
    for (let t = 0; t < 3; t += 1 / 30) g.tick(1 / 30);
    expect(g.inDungeon).toBe(false);
    expect(g.state.run.thief).toBe(false);
    expect(g.state.run.items).toEqual({});
  });
});

describe('a thief\'s name', () => {
  it('costs half again at every later merchant this run, until you head back to camp', () => {
    const { g } = shopGame(4);
    const s = g.state;
    g.stealWare(g.world!.wares[0]);
    expect(s.run.thief).toBe(true);
    // A later floor's merchant: every tag is a thief's price.
    toShop(g, 7);
    const w = g.world!;
    expect(w.fury).toBeNull();
    const per = killGold(7) * goldMult(s);
    for (const ware of w.wares) {
      const fair = warePrice(ware.item, per);
      expect(ware.price).toBe(thiefPrice(fair));
      expect(ware.price).toBeGreaterThan(fair);
      expect(ware.price / fair).toBeGreaterThan(1.35);
      expect(ware.price / fair).toBeLessThan(1.65);
    }
    expect(T.markup).toBe(1.5);
    // She greets you coldly (and says why).
    const hello = g.dialogFor(merchantOf(w)!).start.text;
    expect(hello).toMatch(/thief|half/i);
    expect(hello).toMatch(FONT_SAFE);
    // Back at camp the run is over, the name with it.
    g.leaveDungeon();
    expect(s.run.thief).toBe(false);
    g.inDungeon = true;
    toShop(g, 7);
    for (const ware of g.world!.wares) expect(ware.price).toBe(warePrice(ware.item, per));
    expect(g.dialogFor(merchantOf(g.world!)!).start.text).not.toMatch(/the thief|by half/i);
  });

  it('is the same shop either way: only the tags differ', () => {
    let made = 0;
    for (let k = 0; k < 12; k++) {
      const seed = 400 + k * 53;
      const build = (thief: boolean) => {
        const map = generateFloor({ floor: 4, biome: BIOMES.hamlet, seed, boss: false });
        const npcs = placeNpcs(map, 4, 'hamlet', seed, []);
        return placeShop(map, 4, 'hamlet', seed, killGold(4), npcs.flatMap((n) => (n.camp ? [n.camp] : [])), thief);
      };
      const [fair, dear] = [build(false), build(true)];
      expect(!!fair).toBe(!!dear);
      if (!fair || !dear) continue;
      made++;
      expect(dear.wares.map((x) => [x.item, x.x, x.y])).toEqual(fair.wares.map((x) => [x.item, x.x, x.y]));
      dear.wares.forEach((x, i) => expect(x.price).toBe(thiefPrice(fair.wares[i].price)));
    }
    expect(made).toBeGreaterThan(3);
  });

  it('hints at it before you try: her greeting warns thieves off', () => {
    const { g } = shopGame();
    const hello = g.dialogFor(merchantOf(g.world!)!).start.text;
    expect(hello).toMatch(/thieves get what's coming/i);
    for (const line of [...THIEF_TURN, ...THIEF_TAUNTS, ...THIEF_SEETHE, ...THIEF_FALL]) expect(line).toMatch(FONT_SAFE);
  });
});

describe('only the player steals', () => {
  it('asks before the first theft: one reach asks, a second does it, and stepping away forgets', () => {
    const { g } = shopGame();
    const w = g.world!;
    const ware = w.wares[0];
    expect(g.reachForWare(ware)).toBe('ask');
    expect(g.stealAsked).toBe(ware.uid);
    expect(ware.sold).toBe(false);
    expect(w.fury).toBeNull();
    // Walk off: the question is dropped, and the next reach asks again.
    const lead = w.leader()!;
    lead.y += 40;
    g.tick(1 / 30);
    expect(g.stealAsked).toBeNull();
    standAt(w, 0);
    expect(g.reachForWare(ware)).toBe('ask');
    g.tick(1 / 30);
    expect(g.reachForWare(ware)).toBe('ok');
    expect(ware.sold).toBe(true);
    expect(w.fury).not.toBeNull();
    expect(g.stealAsked).toBeNull();
  });

  it('Auto and the dev bot never steal: a long stay at her wares, an asked-once steal left hanging', () => {
    for (const how of ['auto', 'bot'] as const) {
      const { g } = shopGame(4, 0);
      const w = g.world!;
      if (how === 'auto') g.setAuto(true);
      else {
        g.bot = true;
        w.bot = true;
      }
      // Even with the question already asked, nothing but a second reach by the player answers it.
      expect(g.reachForWare(w.wares[0])).toBe('ask');
      for (let t = 0; t < 30; t += 1 / 30) {
        for (const h of w.heroes) h.hp = h.maxHp;
        // (Now and then the squad is back at the stall, wherever the fight took it.)
        if (Math.floor(t * 30) % 90 === 0) standAt(w, Math.floor(t) % w.wares.length);
        g.tick(1 / 30);
        if (g.world !== w) break;
      }
      expect(w.fury, how).toBeNull();
      expect(w.wares.every((x) => !x.sold), how).toBe(true);
      expect(g.state.run.thief, how).toBeFalsy();
      expect(merchantOf(w), how).not.toBeNull();
    }
  });
});

describe('her picture', () => {
  it('is herself, furious: her own chibi at twice the size, a frame for every pose', () => {
    const t = furiousMerchantType('hamlet', 4, { def: { name: 'Madame Thrift', look: { shirt: ['#1e3a4a', '#2e5a6e', '#4a8296'] } }, seed: 7 } as never);
    // No PixelForge monster stands in for her.
    expect(mobPaint(t, false, true)).toBeNull();
    const seen = new Set<string>();
    for (const pose of ['idle', 'walk', 'wind', 'strike'] as const) {
      for (let f = 0; f < 4; f++) {
        const fr = mobFrame(t, pose, f, 'down', false, true);
        expect(fr).toBe(furiousFrame(pose, f));
        expect([fr.buf.w, fr.buf.h]).toEqual([NPC_W * 2, NPC_H * 2]);
        // Twice the size means every pixel is a 2 x 2 block.
        for (let y = 0; y < fr.buf.h; y += 2) for (let x = 0; x < fr.buf.w; x += 2) {
          const i = (y * fr.buf.w + x) * 4;
          for (const j of [i + 4, i + fr.buf.w * 4, i + fr.buf.w * 4 + 4]) expect(fr.buf.px[j + 3]).toBe(fr.buf.px[i + 3]);
        }
        // Her feet are on the frame's ground line.
        expect(fr.buf.px[((fr.ay - 1) * fr.buf.w + fr.ax) * 4 + 3]).toBeGreaterThan(0);
        seen.add(`${pose}:${Array.from(fr.buf.px).join(',').length}:${fr.buf.px.reduce((a, b, i) => (a + b * (i % 251)) % 1000003, 0)}`);
      }
    }
    // The poses differ (a wind-up isn't the idle, a strike isn't the wind-up).
    expect(seen.size).toBeGreaterThanOrEqual(8);
    // The turn and the daze are at her own size.
    for (const a of [turningFrame(0), dazedFrame(0), dazedFrame(6)]) expect([a.buf.w, a.buf.h]).toEqual([NPC_W, NPC_H]);
  });
});
