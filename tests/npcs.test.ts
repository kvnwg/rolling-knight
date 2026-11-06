import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIVE_QUESTS,
  addQuest,
  makeQuest,
  questEvent,
  mobKind,
  questAsk,
  questGoal,
  questMatches,
  rewardText,
  turnInQuest,
  type Quest,
  type QuestKind,
} from '../src/core/quests';
import { mend } from '../src/core/save';
import { newGame } from '../src/core/newGame';
import { addKnight, knightStats } from '../src/core/roster';
import { npcFrame, npcHeight, npcPortrait, questMarker, NPC_H, NPC_W } from '../src/render/art/npcs';
import { mobFrame } from '../src/render/art/mobs';
import { propArt } from '../src/render/art/props';
import { BIOME_ORDER, BIOMES, isBossFloor } from '../src/world/biomes';
import { CAMP_CLEAR, CAMP_PIECES, CAMP_PLANS, campMiddle, type Camp } from '../src/world/camps';
import { moveUnit } from '../src/world/entities';
import { TALK_RANGE } from '../src/world/hubWorld';
import { BLOCKED, FLOOR, TILE, bfs, generateFloor, tileAt } from '../src/world/mapgen';
import { floorMobs, type BossMove } from '../src/world/mobgen';
import { World, type HeroSpec } from '../src/world/world';
import {
  NPC_DEFS,
  SHOPKEEPER,
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

function squad(ids: string[]): HeroSpec[] {
  const s = newGame(1);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id.split('-') as [HeroSpec['rarity'], HeroSpec['cls']];
    return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
  });
}

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
    // Short lines: a couple of lines on a phone (the job's details are on its card, in icons).
    expect(n.text.length, `${label}: ${id} too long: ${n.text}`).toBeLessThanOrEqual(100);
    for (const c of n.choices) expect(c.label.length, `${label}: ${id} label "${c.label}"`).toBeLessThanOrEqual(30);
    // A job's card: clean words, short enough for its lines, something on offer.
    if (n.job) {
      expect(['offer', 'taken', 'progress', 'done', 'contract']).toContain(n.job.stage);
      for (const s of [n.job.title, n.job.goal, n.job.fine ?? 'x']) {
        expect(s, `${label}: ${id} job`).not.toMatch(/undefined|NaN|\{|\}/);
        expect(s, `${label}: ${id} job font-safe`).toMatch(FONT_SAFE);
      }
      expect(n.job.goal.length).toBeLessThanOrEqual(32);
      expect(n.job.title.length).toBeLessThanOrEqual(30);
      if (n.job.progress !== undefined) expect(n.job.progress >= 0 && n.job.progress <= 1).toBe(true);
      expect(Object.values(n.job.reward).some(Boolean), `${label}: ${id} job pays`).toBe(true);
    }
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

/** Every floor tile reachable from the start? */
function connected(map: ReturnType<typeof generateFloor>): boolean {
  const d = bfs(map, Math.floor(map.start.x / TILE), Math.floor(map.start.y / TILE));
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === FLOOR && d[i] < 0) return false;
  return true;
}

describe('NPC placement', () => {
  it('puts every NPC at a set-up of their own that suits the biome, off the fighting, deterministically', () => {
    let floorsWithNpcs = 0;
    let floorsChecked = 0;
    for (const id of BIOME_ORDER) {
      const plan = CAMP_PLANS[id];
      for (const floor of [1, 2, 3, 4, 5, 7, 9, 12, 21, 33]) {
        for (const seed of [7, 1234]) {
          const gen = () => generateFloor({ floor, biome: BIOMES[id], seed: seed + floor, boss: isBossFloor(floor) });
          const map = gen();
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
            const label = `${id} ${floor} #${seed} ${n.def.id}`;
            const c = n.camp!;
            expect(c, `${label}: a set-up`).toBeDefined();
            expect(c.biome).toBe(id);
            expect([n.x, n.y]).toEqual([c.stand.x, c.stand.y]);
            // Its pieces stand where the biome's plan puts them.
            for (const pc of plan.pieces) expect(map.props.some((p) => p.kind === pc.kind && p.x === c.tx * TILE + pc.x && p.y === c.ty * TILE + pc.y), `${label}: ${pc.kind}`).toBe(true);
            // It blocks what it stands on and keeps its front open.
            plan.rows.forEach((row, r) =>
              [...row].forEach((ch, col) => {
                const t = tileAt(map, c.tx + col, c.ty + r);
                if (ch === '#' || ch === 'N') expect(t, `${label}: ${ch} at ${col},${r}`).toBe(BLOCKED);
                else if (ch !== ' ') expect(t, `${label}: ${ch} at ${col},${r}`).toBe(FLOOR);
              }),
            );
            // You can walk up to the spot in front and talk to them from there.
            const tx = Math.floor(c.talk.x / TILE);
            const ty = Math.floor(c.talk.y / TILE);
            expect(tileAt(map, tx, ty)).toBe(FLOOR);
            expect(dist[ty * map.w + tx], `${label}: reachable`).toBeGreaterThanOrEqual(0);
            expect(Math.hypot(c.talk.x - n.x, c.talk.y - n.y)).toBeLessThan(TALK_RANGE);
            // No mob spawns at a set-up, and it keeps clear of the squad's start and the portal.
            const mid = campMiddle(c);
            for (const s of map.spawns) expect(Math.hypot(s.x - mid.x, s.y - mid.y), `${label}: mob too close`).toBeGreaterThanOrEqual(CAMP_CLEAR);
            expect(Math.hypot(map.start.x - n.x, map.start.y - n.y)).toBeGreaterThanOrEqual(36);
            expect(Math.hypot(map.exit.x - n.x, map.exit.y - n.y)).toBeGreaterThanOrEqual(64);
            expect(n.floor).toBe(floor);
            expect(n.demon).toBe(n.def.kind === 'demon');
            if (n.demon) expect(demonDefFor(n.seed)).toBe(n.def);
          }
          if (npcs.length === 2) {
            expect(Math.hypot(npcs[0].x - npcs[1].x, npcs[0].y - npcs[1].y)).toBeGreaterThanOrEqual(96);
            const [a, b] = npcs.map((n) => n.camp!);
            expect(a.tx + a.w <= b.tx || b.tx + b.w <= a.tx || a.ty + a.h <= b.ty || b.ty + b.h <= a.ty, `${id} ${floor}: set-ups overlap`).toBe(true);
          }
          // The same floor, biome and seed: the same NPCs at the same set-ups.
          if (seed === 7 && floor % 2 === 1) {
            const again = placeNpcs(gen(), floor, id, seed);
            const key = (l: Npc[]) => l.map((n) => [n.def.id, n.x, n.y, n.view, n.dir, n.seed, n.questIndex, n.room, n.camp?.tx, n.camp?.ty].join(':'));
            expect(key(again)).toEqual(key(npcs));
          }
        }
      }
    }
    expect(floorsWithNpcs / floorsChecked).toBeGreaterThan(0.5);
  }, 240_000);

  it('never lets a set-up cut the floor in two or strand a mob', () => {
    for (const id of BIOME_ORDER) {
      for (const floor of [2, 3, 4, 7, 8, 13, 24]) {
        for (const seed of [3, 77, 2024]) {
          const map = generateFloor({ floor, biome: BIOMES[id], seed: seed * 13 + floor, boss: false });
          const before = map.spawns.length;
          placeNpcs(map, floor, id, seed);
          expect(connected(map), `${id} ${floor} #${seed}`).toBe(true);
          const d = bfs(map, Math.floor(map.start.x / TILE), Math.floor(map.start.y / TILE));
          const ex = Math.floor(map.exit.x / TILE);
          const ey = Math.floor(map.exit.y / TILE);
          expect(tileAt(map, ex, ey)).toBe(FLOOR);
          expect(d[ey * map.w + ex]).toBeGreaterThanOrEqual(0);
          // Mobs moved off a set-up still come, somewhere they can be reached.
          expect(map.spawns.length, `${id} ${floor} #${seed}: spawns`).toBe(before);
          for (const s of map.spawns) {
            expect(tileAt(map, Math.floor(s.x / TILE), Math.floor(s.y / TILE))).toBe(FLOOR);
            expect(d[Math.floor(s.y / TILE) * map.w + Math.floor(s.x / TILE)]).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  }, 240_000);

  it('gives every biome its own set-up, most often in a nook of its own off the start or a side room', () => {
    for (const id of BIOME_ORDER) {
      const camps: Camp[] = [];
      let mapsWithCamps = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const floor = 2 + (seed % 3);
        const map = generateFloor({ floor, biome: BIOMES[id], seed: seed * 31, boss: false });
        const npcs = placeNpcs(map, floor, id, seed);
        if (npcs.length) mapsWithCamps++;
        for (const n of npcs) {
          camps.push(n.camp!);
          // The set-up's pieces are the biome's own (and only its own).
          const shared = new Set<string>(['campfire', 'woodpile', 'lanternPost']);
          const kinds = new Set<string>(map.props.filter((p) => p.kind !== 'tree' && CAMP_PIECES.has(p.kind) && !shared.has(p.kind)).map((p) => p.kind));
          for (const pc of CAMP_PLANS[id].pieces) if (!['campfire', 'woodpile', 'lanternPost'].includes(pc.kind)) expect(kinds.has(pc.kind), `${id}: ${pc.kind}`).toBe(true);
          for (const k of kinds) expect(CAMP_PLANS[id].pieces.some((pc) => pc.kind === k), `${id}: ${k} is another biome's`).toBe(true);
        }
      }
      expect(mapsWithCamps).toBeGreaterThan(6);
      const quiet = camps.filter((c) => c.nook).length / camps.length;
      // The town's and the farm's walls are fenced lots: their stalls and carts stand by the street.
      if (id !== 'hamlet' && id !== 'farmland') expect(quiet, `${id}: nooks`).toBeGreaterThan(0.7);
    }
    // Every biome has a plan of its own, three tiles wide with an open row in front.
    const kinds = new Set<string>();
    for (const id of BIOME_ORDER) {
      const plan = CAMP_PLANS[id];
      expect(plan.rows.every((r) => r.length === 3)).toBe(true);
      expect(plan.rows[plan.rows.length - 1]).toBe('...');
      expect(plan.rows.join('')).toMatch(/[Nn]/);
      kinds.add(plan.pieces.map((p) => p.kind).join(','));
    }
    expect(kinds.size).toBe(BIOME_ORDER.length);
  }, 240_000);

  it('lets you talk from in front of the counter, and a demon behind one vaults it to fight', () => {
    const map = generateFloor({ floor: 2, biome: BIOMES.hamlet, seed: 41, boss: false });
    const npcs = placeNpcs(map, 2, 'hamlet', 41);
    const n = npcs[0];
    expect(n.camp).toBeDefined();
    // The stall's keeper stands behind its counter (a blocked tile).
    expect(tileAt(map, Math.floor(n.x / TILE), Math.floor(n.y / TILE))).toBe(BLOCKED);
    const w = new World({ map, biome: BIOMES.hamlet, floor: 2, boss: false, mobTypes: floorMobs(BIOMES.hamlet, 2, 41), bossType: null, squad: squad(['common-blade', 'common-ranger']), perks: [], controlled: 0, seed: 41, goldPerKill: 3, npcs: [n] });
    const lead = w.leader()!;
    lead.x = n.camp!.talk.x;
    lead.y = n.camp!.talk.y;
    expect(w.nearNpc()).toBe(n);
    lead.y += 40;
    expect(w.nearNpc()).toBe(null);
    // Gary was keeping the stall all along.
    let seed = 1;
    while (demonDefFor(seed).id !== 'gary') seed++;
    const gary: Npc = { ...n, def: demonDefFor(seed), seed, demon: true };
    w.npcs = [gary];
    w.unmaskDemon(gary);
    const m = w.mobs[w.mobs.length - 1];
    expect(m.boss).toBe(true);
    expect(tileAt(map, Math.floor(m.x / TILE), Math.floor(m.y / TILE))).toBe(FLOOR);
    const x0 = m.x;
    const y0 = m.y;
    expect(moveUnit(map, m, 0, 3) || moveUnit(map, m, 3, 0) || moveUnit(map, m, -3, 0)).toBe(true);
    expect(Math.hypot(m.x - x0, m.y - y0)).toBeGreaterThan(0);
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
    // The job stands apart from the small talk: its reply is marked, and its line comes with a card.
    expect(ask.job).toBe(true);
    expect(g.start.choices.filter((c) => c.job)).toEqual([ask]);
    expect(g.start.job).toBeUndefined();
    const offer = (g.quest.choices.find((c) => c.action?.type === 'acceptQuest')!.action as { quest: Quest }).quest;
    expect(g.quest.job).toMatchObject({ stage: 'offer', title: offer.title, goal: questAsk(offer), reward: offer.reward });
    // ...its goal as an icon and a number: slay this many of that pest.
    expect(g.quest.job?.aim).toEqual({ kind: 'slay', n: offer.target, mob: offer.mobName });
    expect(mobKind(offer.mobName!)).toBe(offer.mobName!.includes('Slime') ? 'slime' : 'goblin');
    expect(g.quest.text).not.toMatch(/Reward:/);
    const yes = g.quest.choices.find((c) => c.action?.type === 'acceptQuest')!;
    expect(yes.job).toBe(true);
    const r1 = applyDialogAction(npc, yes, quests);
    expect(r1.accepted?.giver).toBe('farmer');
    expect(quests.length).toBe(1);
    expect(npc.questTaken).toBe(true);
    expect(npcMarker(npc, quests)).toBe(null);
    expect(g.questYes.job?.stage).toBe('taken');
    // While it's going, the farmer reminds you instead of offering another: the card shows how far along.
    const g2 = dialogFor(npc, ctx());
    expect(g2.quest).toBeUndefined();
    expect(g2.start.job).toMatchObject({ stage: 'progress', title: quests[0].title, goal: questGoal(quests[0]), progress: 0 });
    expect(g2.start.job?.aim).toMatchObject({ kind: 'slay', n: quests[0].target, done: 0 });
    expect(g2.questRecap.job?.stage).toBe('progress');
    // Kill its pests (and their kin); other mobs don't count.
    const q = quests[0];
    expect(questEvent(quests, { type: 'kill', elite: false, boss: false, mobName: 'Rowdy Goblin' })).toEqual([]);
    expect(q.progress).toBe(q.mobName && /Goblin/.test(q.mobName) ? 1 : 0);
    let finished: Quest[] = [];
    for (let i = 0; i < 20 && !q.done; i++) finished = questEvent(quests, { type: 'kill', elite: false, boss: false, mobName: q.mobName ?? 'Grumpy Slime' });
    expect(q.done).toBe(true);
    expect(finished).toEqual([q]);
    expect(npcMarker(npc, quests)).toBe('turnIn');
    // Handing it back: the card says it's done and what it pays.
    const g3 = dialogFor(npc, ctx());
    expect(g3.start.job).toMatchObject({ stage: 'done', title: q.title });
    expect(g3.start.job?.reward).toEqual(q.reward);
    expect(rewardText(g3.start.job!.reward)).toBe(rewardText(q.reward));
    expect(g3.start.choices[0].job).toBe(true);
    const r2 = applyDialogAction(npc, g3.start.choices[0], quests);
    expect(r2.turnedIn).toBe(q);
    expect(r2.reward?.gold).toBe(q.reward.gold);
    expect(q.turnedIn).toBe(true);
    expect(r2.close).toBe(true);
  });

  it('marks the job apart from the small talk, for every giver and every demon\'s deal', () => {
    const JOB_NODES = new Set(['quest', 'questYes', 'questRecap', 'deal', 'sell']);
    for (const def of NPC_DEFS) {
      for (const seed of [1, 2, 5]) {
        const npc = makeNpc(def, 0, 0, 4, 'hamlet', seed);
        const g = dialogFor(npc, ctxFor());
        // Small talk carries no card; the job's lines do.
        for (const [id, n] of Object.entries(g)) if (!JOB_NODES.has(id)) expect(n.job, `${def.id} ${id}`).toBeUndefined();
        for (const n of Object.values(g)) {
          for (const c of n.choices) {
            if (!c.job) continue;
            // A marked reply takes or hands back a job, or leads to a line with its card.
            expect(c.action?.type === 'acceptQuest' || c.action?.type === 'turnIn' || (c.next !== undefined && g[c.next].job !== undefined), `${def.id}: "${c.label}"`).toBe(true);
          }
          for (const c of n.choices) if (c.action?.type === 'acceptQuest' || c.action?.type === 'turnIn') expect(c.job, `${def.id}: "${c.label}"`).toBe(true);
        }
        if (def.kind !== 'demon' && def.quests.length) {
          expect(g.quest.job?.stage, def.id).toBe('offer');
          expect(g.start.choices.some((c) => c.job && c.next === 'quest'), def.id).toBe(true);
        }
        if (def.kind !== 'demon' && !def.quests.length) expect(Object.values(g).some((n) => n.job), def.id).toBe(false);
      }
      // A job under way: the opener is its reminder, with its card.
      const npc = makeNpc(def, 0, 0, 3, 'hamlet', 5);
      const q = questFor(npc, 5);
      if (q && def.kind !== 'demon') {
        const going = dialogFor(npc, ctxFor({ activeQuests: [{ ...q, progress: 1 }] }));
        expect(going.start.job, def.id).toMatchObject({ stage: 'progress', title: q.title });
        expect(going.start.text).not.toMatch(/\(.*\d\/\d.*\)/);
        const back = dialogFor(npc, ctxFor({ activeQuests: [{ ...q, done: true, progress: q.target }] }));
        expect(back.start.job, def.id).toMatchObject({ stage: 'done', reward: q.reward });
      }
    }
    // The demons' deals come as contracts, fine print and all; Nana only has cookies.
    const byId = (id: string) => NPC_DEFS.find((d) => d.id === id)!;
    expect(dialogFor(makeNpc(byId('gary'), 0, 0, 4, 'hamlet', 3), ctxFor()).deal.job).toMatchObject({ stage: 'contract', reward: { hourglasses: 3 } });
    expect(dialogFor(makeNpc(byId('lou'), 0, 0, 4, 'hamlet', 3), ctxFor()).sell.job?.fine).toBeTruthy();
    expect(Object.values(dialogFor(makeNpc(byId('nana'), 0, 0, 4, 'hamlet', 3), ctxFor())).some((n) => n.job)).toBe(false);
    expect(dialogFor(makeNpc(byId('gary'), 0, 0, 4, 'hamlet', 3), ctxFor()).deal.job?.aim.kind).toBe('sign');
    // A job going deeper aims at its floor; a pick-up job, at its thing.
    const reachJob = { ...quest('reach', { target: 2, floorTaken: 7, progress: 1 }), giver: 'ghost' };
    const ghost = makeNpc(byId('ghost'), 0, 0, 7, 'hamlet', 2);
    expect(dialogFor(ghost, ctxFor({ activeQuests: [reachJob] })).start.job?.aim).toMatchObject({ kind: 'reach', n: 9, done: 8 });
    expect(questAsk(quest('slay', { target: 6, mobName: 'Grumpy Slime' }))).toBe('Slay 6 slimes');
    // Every monster family has a kind for its icon.
    expect([mobKind('Grumpy Slime'), mobKind('Rowdy Goblin'), mobKind('Feral Hound'), mobKind('Crypt Bat'), mobKind('Barnyard Hog'), mobKind('Nothing At All')]).toEqual(['slime', 'goblin', 'beast', 'flyer', 'hog', null]);
    expect(questAsk(quest('reach', { target: 2, floorTaken: 7 }))).toBe('Reach floor 9');
    expect(questAsk(quest('collect', { target: 1, item: 'hourglass' }))).toBe('Find an hourglass');
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

  it('stands the merchant tall like the keepers, facing whichever way, with a portrait the size of anyone\'s', () => {
    expect(SHOPKEEPER.look.tall).toBeTruthy();
    for (const view of ['down', 'side', 'up'] as const) {
      for (const dir of [1, -1] as const) {
        const fr = npcFrame(SHOPKEEPER, 'idle', view, 3, dir);
        expect(fr.faced, view).toBe(true);
        expect(npcHeight(fr), `${view} ${dir}`).toBeGreaterThanOrEqual(36);
        expect(npcHeight(fr), `${view} ${dir}`).toBeLessThanOrEqual(48);
        // Standing on her feet.
        let feet = 0;
        for (let x = 0; x < fr.buf.w; x++) if (fr.buf.px[(fr.ay * fr.buf.w + x) * 4 + 3]) feet++;
        expect(feet, view).toBeGreaterThan(3);
      }
    }
    // The folk on the floors stay on the little mannequin.
    for (const def of NPC_DEFS) expect(def.look.tall, def.id).toBeFalsy();
    // Portraits for the talk card and a conversation: all one size; hers is her head and shoulders.
    for (const def of [...NPC_DEFS, SHOPKEEPER]) {
      const p = npcPortrait(def);
      expect([p.w, p.h], def.id).toEqual([NPC_W, NPC_H]);
      let opaque = 0;
      for (let i = 3; i < p.px.length; i += 4) if (p.px[i]) opaque++;
      expect(opaque, def.id).toBeGreaterThan(80);
    }
  });

  it('draws every biome\'s set-up, lit where the night needs it', () => {
    const NIGHT = ['forest', 'crypt', 'swamp', 'graveyard', 'ember', 'crystal', 'shrine'];
    for (const id of BIOME_ORDER) {
      let lights = 0;
      for (const pc of CAMP_PLANS[id].pieces) {
        for (const seed of [7, 104736, 209465]) {
          const a = propArt(pc.kind, BIOMES[id], seed);
          let opaque = 0;
          for (let i = 3; i < a.buf.px.length; i += 4) if (a.buf.px[i]) opaque++;
          expect(opaque, `${id} ${pc.kind}`).toBeGreaterThan(pc.kind === 'logSeat' ? 60 : 90);
          expect(a.ax >= 0 && a.ax <= a.buf.w && a.ay >= 0 && a.ay <= a.buf.h, `${id} ${pc.kind}: anchor`).toBe(true);
          // Pieces fit their plan's three tiles (a hair of overhang allowed).
          expect(a.buf.w, `${id} ${pc.kind}: width`).toBeLessThanOrEqual(56);
          if (seed === 7 && a.light) lights++;
        }
      }
      if (NIGHT.includes(id)) expect(lights, `${id}: a light`).toBeGreaterThan(0);
    }
  });
});
