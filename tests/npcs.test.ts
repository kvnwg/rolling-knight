import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIVE_QUESTS,
  addQuest,
  makeQuest,
  questEvent,
  questGoal,
  questMatches,
  rewardText,
  turnInQuest,
  type Quest,
  type QuestKind,
} from '../src/core/quests';
import { mend } from '../src/core/save';
import { npcFrame, questMarker, NPC_H, NPC_W } from '../src/render/art/npcs';
import { mobFrame } from '../src/render/art/mobs';
import { BIOME_ORDER, BIOMES, isBossFloor } from '../src/world/biomes';
import { FLOOR, TILE, bfs, generateFloor, tileAt } from '../src/world/mapgen';
import { floorMobs, type BossMove } from '../src/world/mobgen';
import {
  NPC_DEFS,
  applyDialogAction,
  demonDefFor,
  demonMobType,
  demonTaunts,
  demonTauntsFor,
  dialogFor,
  makeNpc,
  npcMarker,
  placeNpcs,
  questFor,
  type DialogCtx,
  type DialogNode,
  type Npc,
} from '../src/world/npcs';

/** Everything an NPC says is drawable in the bitmap font too. */
const FONT_SAFE = /^[A-Za-z0-9 .,!?:'"\-+/%()]+$/;

function ctxFor(over: Partial<DialogCtx> = {}): DialogCtx {
  return { floor: 4, biomeName: 'Mossy Hamlet', activeQuests: [], goldPerKill: 5, mobNames: ['Grumpy Slime', 'Rowdy Goblin', 'Mangy Hound'], ...over };
}

function quest(kind: QuestKind, over: Partial<Quest> = {}): Quest {
  return { ...makeQuest({ giver: 'test', kind, floor: 3, goldPerKill: 4, seed: 11 }), ...over };
}

/** Checks a dialog graph: links resolve, everything is reachable from 'start', text is clean. */
function checkGraph(g: Record<string, DialogNode>, label: string): void {
  expect(g.start, `${label}: start`).toBeDefined();
  const seen = new Set<string>(['start']);
  const todo = ['start'];
  while (todo.length) {
    const id = todo.pop()!;
    const n = g[id];
    expect(n, `${label}: node ${id}`).toBeDefined();
    expect(n.choices.length, `${label}: ${id} has choices`).toBeGreaterThan(0);
    for (const c of n.choices) {
      if (c.next !== undefined) {
        expect(g[c.next], `${label}: ${id} -> ${c.next}`).toBeDefined();
        if (!seen.has(c.next)) {
          seen.add(c.next);
          todo.push(c.next);
        }
      }
    }
  }
  expect([...Object.keys(g)].filter((k) => !seen.has(k)), `${label}: unreachable nodes`).toEqual([]);
  for (const [id, n] of Object.entries(g)) {
    for (const s of [n.speaker, n.text, ...n.choices.map((c) => c.label)]) {
      expect(s.length, `${label}: ${id} empty text`).toBeGreaterThan(0);
      expect(s, `${label}: ${id}`).not.toMatch(/undefined|NaN|\{|\}/);
      expect(s, `${label}: ${id} font-safe`).toMatch(FONT_SAFE);
    }
    // Text sized for a dialog box.
    expect(n.text.length, `${label}: ${id} too long`).toBeLessThanOrEqual(190);
    for (const c of n.choices) expect(c.label.length, `${label}: ${id} label "${c.label}"`).toBeLessThanOrEqual(30);
  }
}

/** Nodes reachable from `from` (inclusive). */
function reach(g: Record<string, DialogNode>, from: string): Set<string> {
  const seen = new Set<string>([from]);
  const todo = [from];
  while (todo.length) for (const c of g[todo.pop()!].choices) if (c.next && !seen.has(c.next)) seen.add(c.next), todo.push(c.next);
  return seen;
}

function actions(g: Record<string, DialogNode>) {
  return Object.values(g).flatMap((n) => n.choices.map((c) => c.action).filter((a) => a !== undefined));
}

describe('NPC placement', () => {
  it('stands NPCs on open floor in normal and side rooms, away from mobs, deterministically', () => {
    let floorsWithNpcs = 0;
    let floorsChecked = 0;
    for (const id of BIOME_ORDER) {
      for (const floor of [1, 2, 3, 4, 5, 6, 7, 9, 12, 15, 21, 33]) {
        for (const seed of [7, 1234]) {
          const map = generateFloor({ floor, biome: BIOMES[id], seed: seed + floor, boss: isBossFloor(floor) });
          const npcs = placeNpcs(map, floor, id, seed);
          if (isBossFloor(floor)) {
            expect(npcs, `${id} ${floor}: none on boss floors`).toEqual([]);
            continue;
          }
          floorsChecked++;
          if (npcs.length) floorsWithNpcs++;
          expect(npcs.length).toBeLessThanOrEqual(2);
          const dist = bfs(map, Math.floor(map.start.x / TILE), Math.floor(map.start.y / TILE));
          for (const n of npcs) {
            const tx = Math.floor(n.x / TILE);
            const ty = Math.floor(n.y / TILE);
            for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) expect(tileAt(map, tx + ox, ty + oy), `${id} ${floor} ${n.def.id}`).toBe(FLOOR);
            expect(dist[ty * map.w + tx]).toBeGreaterThanOrEqual(0);
            expect(['normal', 'side', 'exit']).toContain(map.rooms[n.room].kind);
            for (const s of map.spawns) expect(Math.hypot(s.x - n.x, s.y - n.y)).toBeGreaterThanOrEqual(40);
            expect(Math.hypot(map.start.x - n.x, map.start.y - n.y)).toBeGreaterThanOrEqual(72);
            expect(n.floor).toBe(floor);
            expect(n.demon).toBe(n.def.kind === 'demon');
            if (n.demon) expect(demonDefFor(n.seed)).toBe(n.def);
          }
          if (npcs.length === 2) expect(Math.hypot(npcs[0].x - npcs[1].x, npcs[0].y - npcs[1].y)).toBeGreaterThan(64);
          // Same map, floor, biome and seed: the same NPCs in the same places.
          const again = placeNpcs(map, floor, id, seed);
          const key = (l: Npc[]) => l.map((n) => [n.def.id, n.x, n.y, n.view, n.dir, n.seed, n.questIndex, n.room].join(':'));
          expect(key(again)).toEqual(key(npcs));
        }
      }
    }
    expect(floorsWithNpcs / floorsChecked).toBeGreaterThan(0.5);
  });

  it('puts a demon in disguise on about one floor in eight, and somebody on floor 1', () => {
    let demonFloors = 0;
    let n = 0;
    let firstFloors = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const m1 = generateFloor({ floor: 1, biome: BIOMES.hamlet, seed, boss: false });
      if (placeNpcs(m1, 1, 'hamlet', seed).length) firstFloors++;
      for (const floor of [2, 3, 6, 8, 11, 13]) {
        const map = generateFloor({ floor, biome: BIOMES.forest, seed: seed * 31 + floor, boss: false });
        n++;
        if (placeNpcs(map, floor, 'forest', seed).some((x) => x.demon)) demonFloors++;
      }
    }
    expect(firstFloors).toBeGreaterThanOrEqual(38);
    expect(demonFloors / n).toBeGreaterThan(0.05);
    expect(demonFloors / n).toBeLessThan(0.25);
  });

  it('brings back the giver of a finished job', () => {
    const done = { ...quest('slay', { giver: 'chef' }), done: true, progress: 99 };
    let back = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const map = generateFloor({ floor: 7, biome: BIOMES.swamp, seed, boss: false });
      const npcs = placeNpcs(map, 7, 'swamp', seed, [done]);
      if (npcs[0]?.def.id === 'chef') back++;
    }
    expect(back).toBeGreaterThanOrEqual(9);
  });
});

describe('NPC dialog', () => {
  it('every graph links up and reaches every node from start, in every state', () => {
    for (const def of NPC_DEFS) {
      const states: Array<[string, (n: Npc) => void, Partial<DialogCtx>]> = [
        ['fresh', () => {}, {}],
        ['again', (n) => (n.talkedTo = 1), {}],
        ['fed up', (n) => (n.talkedTo = 2), {}],
        ['cleared', () => {}, { cleared: true }],
        ['gifted', (n) => (n.gifted = true), {}],
        ['gifted again', (n) => ((n.gifted = true), (n.talkedTo = 1)), {}],
        ['busy', () => {}, { activeQuests: [quest('slay'), quest('reach', { id: 'b' }), quest('boss', { id: 'c' })] }],
        ['waiting', () => {}, { activeQuests: [{ ...(questFor(makeNpc(def, 0, 0, 3, 'hamlet', 5), 5) ?? quest('slay')), giver: def.id }] }],
        ['turn in', () => {}, { activeQuests: [{ ...(questFor(makeNpc(def, 0, 0, 3, 'hamlet', 5), 5) ?? quest('slay')), giver: def.id, done: true }] }],
        ['taken', (n) => (n.questTaken = true), {}],
        ['revealed', (n) => (n.revealed = true), {}],
        ['no mobs', () => {}, { mobNames: [] }],
      ];
      for (const seed of [1, 2, 3, 99]) {
        for (const [label, setup, over] of states) {
          const npc = makeNpc(def, 100, 100, 4, 'hamlet', seed);
          setup(npc);
          const g = dialogFor(npc, ctxFor(over));
          checkGraph(g, `${def.id} ${label} #${seed}`);
          const acts = actions(g);
          // Only demons fight.
          if (def.kind !== 'demon') expect(acts.some((a) => a.type === 'fight'), `${def.id} ${label}`).toBe(false);
          // A gift can't be taken twice in one conversation.
          for (const n of Object.values(g)) {
            for (const c of n.choices) {
              if (c.action?.type !== 'reward' || !c.next) continue;
              const after = reach(g, c.next);
              expect([...after].some((id) => g[id].choices.some((x) => x.action?.type === 'reward')), `${def.id} ${label}: double gift`).toBe(false);
            }
          }
          for (const a of acts) {
            if (a.type !== 'acceptQuest') continue;
            expect(label).not.toBe('busy');
            expect(a.quest.giver).toBe(def.id);
            expect(a.quest.target).toBeGreaterThan(0);
            expect(a.quest.reward.gold).toBeGreaterThan(0);
            expect(a.quest.done).toBe(false);
            expect(a.quest.text).toMatch(FONT_SAFE);
          }
          if (label === 'turn in' && def.quests.length) expect(g.start.choices[0].action?.type).toBe('turnIn');
          if (label === 'revealed' && def.demon) expect(acts.every((a) => a.type === 'fight')).toBe(true);
        }
      }
    }
  });

  it('demons can always be caught out and fought, and stay in disguise if you leave', () => {
    for (const def of NPC_DEFS.filter((d) => d.kind === 'demon')) {
      for (const [talked, cleared] of [[0, false], [1, false], [2, false], [0, true]] as const) {
        const npc = makeNpc(def, 0, 0, 6, 'crypt', 3);
        npc.talkedTo = talked;
        const g = dialogFor(npc, ctxFor({ cleared }));
        const all = reach(g, 'start');
        expect([...all].some((id) => g[id].choices.some((c) => c.action?.type === 'fight')), def.id).toBe(true);
        expect(g.reveal.speaker).toContain(def.demon!.title);
        if (talked < 2 && !cleared) expect(g.start.choices.some((c) => c.action?.type === 'close'), `${def.id} can walk away`).toBe(true);
      }
    }
  });

  it('runs a whole job: offer, accept, progress, hand back', () => {
    const def = NPC_DEFS.find((d) => d.id === 'farmer')!;
    // Find a farmer whose job is the pest one.
    let npc = makeNpc(def, 0, 0, 3, 'hamlet', 1, ['Grumpy Slime', 'Rowdy Goblin']);
    for (let s = 2; def.quests[npc.questIndex].kind !== 'slay'; s++) npc = makeNpc(def, 0, 0, 3, 'hamlet', s, ['Grumpy Slime', 'Rowdy Goblin']);
    const quests: Quest[] = [];
    const ctx = () => ctxFor({ floor: 3, activeQuests: quests, mobNames: undefined });
    expect(npcMarker(npc, quests)).toBe('offer');
    const g = dialogFor(npc, ctx());
    const ask = g.start.choices.find((c) => c.next === 'quest')!;
    expect(ask).toBeDefined();
    const yes = g.quest.choices.find((c) => c.action?.type === 'acceptQuest')!;
    const r1 = applyDialogAction(npc, yes, quests);
    expect(r1.accepted?.giver).toBe('farmer');
    expect(quests.length).toBe(1);
    expect(npc.questTaken).toBe(true);
    expect(npcMarker(npc, quests)).toBe(null);
    // While it's going, the farmer reminds you instead of offering another.
    const g2 = dialogFor(npc, ctx());
    expect(g2.quest).toBeUndefined();
    expect(g2.start.text).toContain(questGoal(quests[0]));
    // Kill its pests (and their kin); other mobs don't count.
    const q = quests[0];
    expect(questEvent(quests, { type: 'kill', elite: false, boss: false, mobName: 'Rowdy Goblin' })).toEqual([]);
    expect(q.progress).toBe(q.mobName && /Goblin/.test(q.mobName) ? 1 : 0);
    let finished: Quest[] = [];
    for (let i = 0; i < 20 && !q.done; i++) finished = questEvent(quests, { type: 'kill', elite: false, boss: false, mobName: q.mobName ?? 'Grumpy Slime' });
    expect(q.done).toBe(true);
    expect(finished).toEqual([q]);
    expect(npcMarker(npc, quests)).toBe('turnIn');
    // Handing it back.
    const g3 = dialogFor(npc, ctx());
    expect(g3.start.text).toContain(rewardText(q.reward));
    const r2 = applyDialogAction(npc, g3.start.choices[0], quests);
    expect(r2.turnedIn).toBe(q);
    expect(r2.reward?.gold).toBe(q.reward.gold);
    expect(q.turnedIn).toBe(true);
    expect(r2.close).toBe(true);
  });

  it('applies gifts once and unmasks demons', () => {
    const rocks = makeNpc(NPC_DEFS.find((d) => d.id === 'rocks')!, 0, 0, 2, 'tundra', 4);
    const g = dialogFor(rocks, ctxFor());
    const giftChoice = g.gotit.choices[0];
    expect(giftChoice.action?.type).toBe('reward');
    const quests: Quest[] = [];
    expect(applyDialogAction(rocks, giftChoice, quests).reward?.gold).toBeGreaterThan(0);
    expect(applyDialogAction(rocks, giftChoice, quests).reward).toBeNull();
    expect(dialogFor(rocks, ctxFor()).gotit.choices.some((c) => c.action?.type === 'reward')).toBe(false);
    const gary = makeNpc(NPC_DEFS.find((d) => d.id === 'gary')!, 0, 0, 2, 'tundra', 4);
    const res = applyDialogAction(gary, dialogFor(gary, ctxFor()).reveal.choices[0], quests);
    expect(res.fight).toBe(true);
    expect(gary.revealed).toBe(true);
    expect(npcMarker(gary, quests)).toBe(null);
  });
});

describe('quests', () => {
  it('complete from kills, floors and pickups, once each', () => {
    const slay = quest('slay', { id: 's', target: 3 });
    const pest = quest('slay', { id: 'p', target: 2, mobName: 'Grumpy Slime' });
    const elite = quest('slayElite', { id: 'e', target: 2 });
    const boss = quest('boss', { id: 'b', target: 1 });
    const reach = quest('reach', { id: 'r', target: 2, floorTaken: 3 });
    const coins = quest('collect', { id: 'c', target: 2, item: 'gold' });
    const glass = quest('collect', { id: 'h', target: 1, item: 'hourglass' });
    const qs = [slay, pest, elite, boss, reach, coins, glass];
    expect(questEvent(qs, { type: 'kill', elite: false, boss: false, mobName: 'Feral Ooze' }).map((q) => q.id)).toEqual([]);
    expect(pest.progress).toBe(1); // an ooze is a slime's kin
    expect(questEvent(qs, { type: 'kill', elite: false, boss: false, mobName: 'Rowdy Goblin' })).toEqual([]);
    expect(pest.progress).toBe(1);
    expect(questEvent(qs, { type: 'kill', elite: true, boss: false, mobName: 'Bog Blob' }).map((q) => q.id).sort()).toEqual(['p', 's']);
    expect(elite.progress).toBe(1);
    expect(boss.progress).toBe(0);
    expect(questEvent(qs, { type: 'kill', elite: false, boss: true, mobName: 'Grumblor' }).map((q) => q.id).sort()).toEqual(['b', 'e']);
    // Done quests don't move again.
    expect(questEvent(qs, { type: 'kill', elite: true, boss: true, mobName: 'Grumpy Slime' })).toEqual([]);
    expect(slay.progress).toBe(3);
    expect(questEvent(qs, { type: 'floor', floor: 4 })).toEqual([]);
    expect(reach.progress).toBe(1);
    expect(questEvent(qs, { type: 'floor', floor: 2 })).toEqual([]); // a wipe sends you back: no progress lost
    expect(reach.progress).toBe(1);
    expect(questEvent(qs, { type: 'floor', floor: 5 })).toEqual([reach]);
    expect(questEvent(qs, { type: 'pickup', kind: 'potion' })).toEqual([]);
    expect(questEvent(qs, { type: 'pickup', kind: 'gold' })).toEqual([]);
    expect(questEvent(qs, { type: 'pickup', kind: 'hourglass' })).toEqual([glass]);
    expect(questEvent(qs, { type: 'pickup', kind: 'gold' })).toEqual([coins]);
    expect(qs.every((q) => q.done)).toBe(true);
  });

  it('match mobs by kin, not by accident', () => {
    expect(questMatches('Grumpy Slime', 'Bog Popper')).toBe(true);
    expect(questMatches('Feral Wolf', 'Gloom Boar')).toBe(true);
    expect(questMatches('Barnyard Ram', 'Rampaging Goblin')).toBe(false);
    expect(questMatches('Moss Tick', 'Shard Beetle')).toBe(true);
    expect(questMatches('Crypt Ghoul', 'Moss Spore Pod')).toBe(false);
  });

  it('allow three at a time, pay in kills worth of gold, and hand back', () => {
    const qs: Quest[] = [];
    for (let i = 0; i < 5; i++) addQuest(qs, makeQuest({ giver: `g${i}`, kind: 'slay', floor: 2, goldPerKill: 3, seed: i }));
    expect(qs.length).toBe(MAX_ACTIVE_QUESTS);
    expect(addQuest(qs, { ...qs[0] })).toBe(false);
    for (const kind of ['slay', 'slayElite', 'boss', 'reach', 'collect'] as const) {
      const cheap = makeQuest({ giver: 'x', kind, floor: 9, goldPerKill: 1, seed: 5 });
      const rich = makeQuest({ giver: 'x', kind, floor: 9, goldPerKill: 100, seed: 5 });
      expect(rich.target).toBe(cheap.target);
      expect(rich.reward.gold! / cheap.reward.gold!).toBeCloseTo(100, -1);
      expect(cheap.text).toMatch(FONT_SAFE);
    }
    qs[1].done = true;
    expect(turnInQuest(qs, 'g0')).toBeNull();
    expect(turnInQuest(qs, 'g1')).toBe(qs[1]);
    expect(qs[1].turnedIn).toBe(true);
    expect(addQuest(qs, makeQuest({ giver: 'g9', kind: 'boss', floor: 2, goldPerKill: 3, seed: 9 }))).toBe(true);
  });

  it('are kept by saves, and old saves get an empty list', () => {
    expect(mend({ gold: 5 }).quests).toEqual([]);
    const q = quest('reach');
    expect(mend({ quests: [q] }).quests).toEqual([q]);
  });
});

describe('the demon unmasked', () => {
  const MOVES: BossMove[] = ['ring', 'fan', 'charge', 'slam', 'summon', 'rain'];
  it('is a valid mini-boss with about 15 times a normal mob\'s HP', () => {
    // A normal mob: the melee chasers every biome fields.
    const chasers = BIOME_ORDER.flatMap((b) => [3, 8, 13].flatMap((f) => floorMobs(BIOMES[b], f, f * 7).filter((t) => t.behavior === 'chaser').map((t) => t.hp))).sort((a, b) => a - b);
    const normal = chasers[Math.floor(chasers.length / 2)];
    const ids = new Set<string>();
    for (const biome of BIOME_ORDER) {
      for (const seed of [1, 2, 3, 4, 5, 77, 1000]) {
        const floor = 2 + (seed % 9);
        const t = demonMobType(floor, biome, seed);
        const def = demonDefFor(seed);
        expect(t.name).toBe(def.demon!.name);
        expect(t.boss?.title).toBe(def.demon!.title);
        expect(t.plan).toBe('humanoid');
        expect(t.boss!.moves.length).toBe(3);
        expect(new Set(t.boss!.moves).size).toBe(3);
        for (const m of t.boss!.moves) expect(MOVES).toContain(m);
        expect(t.hp / normal).toBeGreaterThan(12);
        expect(t.hp / normal).toBeLessThan(18);
        for (const v of [t.hp, t.atk, t.speed, t.range, t.atkCd, t.radius, t.size]) expect(Number.isFinite(v) && v > 0).toBe(true);
        expect(t.ramp.length).toBe(4);
        for (const c of [...t.ramp, t.eye, t.shot!.color]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
        ids.add(t.id);
        for (const pose of ['idle', 'walk', 'wind', 'strike'] as const) {
          for (const boss of [false, true]) {
            const fr = mobFrame(t, pose, 1, 'down', false, boss);
            expect(fr.buf.w).toBeGreaterThan(10);
          }
        }
      }
    }
    expect(ids.size).toBeGreaterThan(20);
    expect(demonTaunts.length).toBeGreaterThan(8);
    for (const def of NPC_DEFS.filter((d) => d.demon)) {
      const taunts = demonTauntsFor(def);
      for (const s of def.demon!.taunts) expect(taunts).toContain(s);
      for (const s of taunts) expect(s).toMatch(FONT_SAFE);
    }
  });
});

describe('NPC art', () => {
  it('dresses every NPC on the mannequin in every view', () => {
    for (const def of NPC_DEFS) {
      for (const view of ['down', 'side', 'up'] as const) {
        for (const anim of ['idle', 'walk'] as const) {
          for (let f = 0; f < 4; f++) {
            const fr = npcFrame(def, anim, view, f);
            expect(fr.buf.w).toBe(NPC_W);
            expect(fr.buf.h).toBe(NPC_H);
            let opaque = 0;
            for (let i = 3; i < fr.buf.px.length; i += 4) if (fr.buf.px[i]) opaque++;
            expect(opaque, `${def.id} ${view} ${anim} ${f}`).toBeGreaterThan(80);
            // Something stands on the feet row (the ghost floats a little).
            let feet = 0;
            for (let y = fr.ay - 3; y <= fr.ay; y++) for (let x = 0; x < fr.buf.w; x++) if (fr.buf.px[(y * fr.buf.w + x) * 4 + 3]) feet++;
            expect(feet, `${def.id} ${view}`).toBeGreaterThan(3);
          }
        }
      }
    }
    const offer = questMarker('offer');
    const back = questMarker('turnIn');
    expect(offer.w * offer.h).toBeGreaterThan(50);
    expect(Array.from(offer.px)).not.toEqual(Array.from(back.px));
  });
});
