import { describe, expect, it } from 'vitest';
import { keeperFrame, HUB_CAST, HUB_TOOLS } from '../src/render/art/hubNpcs';
import { HUB_CX, HUB_DESCEND_Y, HUB_STEPS_Y, buildHub } from '../src/render/art/hubScene';
import { Game } from '../src/game';
import { HUB_COLS, HUB_H, HUB_ROWS, HUB_W, hubScene, type HubStation } from '../src/world/hub';
import { TALK_RANGE } from '../src/world/hubWorld';
import { FLOOR, TILE, bfs, tileAt } from '../src/world/mapgen';

/** Everything a keeper says is drawable in the bitmap font too. */
const FONT_SAFE = /^[A-Za-z0-9 .,!?:'"\-+/%()]+$/;

/** How far a spot is from talking to a station, the way World.nearStation measures it. */
function talkDist(st: HubStation, x: number, y: number): number {
  return Math.min(Math.hypot(x - st.x, y - st.y), Math.hypot(x - st.talk.x, y - st.talk.y) + 6);
}

function checksum(px: Uint8ClampedArray): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < px.length; i += 7) h = Math.imul(h ^ px[i], 0x01000193);
  return h >>> 0;
}

describe('hub', () => {
  it('is painted the same every time', () => {
    const a = buildHub();
    const b = buildHub();
    expect(checksum(a.ground.px)).toBe(checksum(b.ground.px));
    expect(a.sprites.map((s) => `${s.id}@${s.x},${s.y}:${checksum(s.buf.px)}`)).toEqual(b.sprites.map((s) => `${s.id}@${s.x},${s.y}:${checksum(s.buf.px)}`));
    expect(a.lights).toEqual(b.lights);
  });

  it('covers the whole map with art, and every layer stays inside it', () => {
    const s = hubScene();
    expect(s.ground.w).toBe(HUB_W);
    expect(s.ground.h).toBe(HUB_H);
    expect(s.map.w).toBe(HUB_COLS);
    expect(s.map.h).toBe(HUB_ROWS);
    for (const p of s.sprites) {
      expect(Number.isInteger(p.x - p.ax) && Number.isInteger(p.y - p.ay)).toBe(true);
      expect(p.x - p.ax).toBeLessThan(HUB_W);
      expect(p.x - p.ax + p.buf.w).toBeGreaterThan(0);
      expect(p.y - p.ay).toBeLessThan(HUB_H);
    }
    for (const g of s.emissive) {
      for (const f of g.frames ?? []) expect([f.w, f.h]).toEqual([g.buf.w, g.buf.h]);
    }
    expect(s.lights.length).toBeGreaterThan(20);
    for (const l of s.lights) expect(l.intensity).toBeLessThanOrEqual(1);
  });

  it('has one keeper per job (or a board), each with a sign and a greeting', () => {
    const s = hubScene();
    const ids = s.stations.map((st) => st.id).sort();
    // (No quartermaster, smith or scrap dealer: the warden picks and levels the squad, duplicates turn into gold.)
    expect(ids).toEqual(['altar', 'gate', 'perks', 'quests', 'rebirth', 'upgrades']);
    for (const st of s.stations) {
      expect(st.name.length).toBeGreaterThan(0);
      expect(st.job.length).toBeGreaterThan(0);
      expect(st.sign.length).toBeGreaterThan(0);
      expect(st.greeting).toMatch(FONT_SAFE);
      expect(st.name).toMatch(FONT_SAFE);
      if (st.id !== 'quests') expect(st.def).not.toBeNull();
    }
  });

  it('lets you walk from the spawn to a spot within talking range of every keeper', () => {
    const s = hubScene();
    const sx = Math.floor(s.spawn.x / TILE);
    const sy = Math.floor(s.spawn.y / TILE);
    expect(tileAt(s.map, sx, sy)).toBe(FLOOR);
    const d = bfs(s.map, sx, sy);
    for (const st of s.stations) {
      const tx = Math.floor(st.talk.x / TILE);
      const ty = Math.floor(st.talk.y / TILE);
      expect(tileAt(s.map, tx, ty), st.id).toBe(FLOOR);
      expect(d[ty * s.map.w + tx], st.id).toBeGreaterThanOrEqual(0);
      expect(Math.hypot(st.talk.x - st.x, st.talk.y - st.y), st.id).toBeLessThan(TALK_RANGE);
    }
  });

  it('gives each keeper a talk spot of their own: standing on it you talk to them, not a neighbour', () => {
    const s = hubScene();
    for (const st of s.stations) {
      const mine = talkDist(st, st.talk.x, st.talk.y);
      expect(mine, st.id).toBeLessThan(TALK_RANGE);
      for (const other of s.stations) {
        if (other === st) continue;
        expect(talkDist(other, st.talk.x, st.talk.y), `${st.id} vs ${other.id}`).toBeGreaterThan(mine);
        // Not stacked: every talk spot on its own tile.
        const same = Math.floor(other.talk.x / TILE) === Math.floor(st.talk.x / TILE) && Math.floor(other.talk.y / TILE) === Math.floor(st.talk.y / TILE);
        expect(same, `${st.id} and ${other.id} share a tile`).toBe(false);
      }
    }
    // Arriving at the hub, nobody is in talking range yet (the hint shows first).
    for (const st of s.stations) expect(talkDist(st, s.spawn.x, s.spawn.y), st.id).toBeGreaterThanOrEqual(TALK_RANGE);
  });

  it('is a compact court: a phone-sized core with leaves and roof round it', () => {
    const s = hubScene();
    // Wide enough for a landscape screen at the hub's zoom (about 240 px), tall enough for an
    // upright phone's (about 320).
    expect(s.w).toBeGreaterThanOrEqual(240);
    expect(s.h).toBeGreaterThanOrEqual(320);
    // Every keeper (and every talk spot) within the phone-sized middle.
    for (const st of s.stations) {
      expect(Math.abs(st.x - HUB_CX), st.id).toBeLessThan(85);
      expect(Math.abs(st.talk.x - HUB_CX), st.id).toBeLessThan(85);
      expect(st.y, st.id).toBeLessThan(HUB_DESCEND_Y);
    }
  });

  it('lets you walk down the steps far enough to go into the dungeon', () => {
    const s = hubScene();
    const d = bfs(s.map, Math.floor(s.spawn.x / TILE), Math.floor(s.spawn.y / TILE));
    const tx = Math.floor(HUB_CX / TILE);
    const ty = Math.floor((HUB_DESCEND_Y + 4) / TILE);
    expect(tileAt(s.map, tx, ty)).toBe(FLOOR);
    expect(d[ty * s.map.w + tx]).toBeGreaterThanOrEqual(0);
    // The spawn is above the steps: arriving at the hub never takes you straight back down.
    expect(s.spawn.y).toBeLessThan(HUB_STEPS_Y);
  });

  it('takes you into the dungeon when you walk down the steps, and back to the head of the steps after', () => {
    const g = new Game(true);
    for (let t = 0; t < 3; t += 1 / 30) g.tick(1 / 30);
    expect(g.inDungeon).toBe(false);
    const l = g.hub!.leader()!;
    l.y = HUB_DESCEND_Y + 2;
    for (let t = 0; t < 1.5; t += 1 / 30) g.tick(1 / 30);
    expect(g.inDungeon).toBe(true);
    expect(g.world).not.toBeNull();
    expect(g.hub!.leader()!.y).toBe(hubScene().spawn.y);
    g.leaveDungeon();
    for (let t = 0; t < 1; t += 1 / 30) g.tick(1 / 30);
    expect(g.inDungeon).toBe(false);
  });

  it('draws every keeper standing and sitting, facing any way', () => {
    for (const [k, def] of Object.entries(HUB_CAST)) {
      for (const pose of ['stand', 'sit'] as const) {
        for (const view of ['down', 'side', 'up'] as const) {
          const fr = keeperFrame(def, pose, view, 1, HUB_TOOLS[k as keyof typeof HUB_CAST]);
          let opaque = 0;
          for (let i = 3; i < fr.buf.px.length; i += 4) if (fr.buf.px[i]) opaque++;
          expect(opaque, `${k} ${pose} ${view}`).toBeGreaterThan(60);
          expect(fr.ax).toBeGreaterThan(0);
        }
      }
    }
  });

  it('stands the keepers tall, in their portraits\' style: breathing, blinking, lit from the left either way they face', () => {
    const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
      return n;
    };
    const keepers = Object.entries(HUB_CAST).filter(([, def]) => def.look.tall);
    expect(keepers.length).toBeGreaterThanOrEqual(5);
    for (const [k, def] of keepers) {
      const tool = HUB_TOOLS[k as keyof typeof HUB_CAST];
      // About twice a knight's height standing (hats and staffs on top), less sitting.
      const stand = keeperFrame(def, 'stand', 'down', 0, tool);
      expect(stand.height, k).toBeGreaterThanOrEqual(36);
      expect(stand.height, k).toBeLessThanOrEqual(48);
      expect(keeperFrame(def, 'sit', 'side', 0, tool).height, k).toBeLessThan(stand.height);
      // The idle: a breath moves the upper body; a blink changes only a few pixels (the eyes).
      const breath = keeperFrame(def, 'stand', 'down', 4, tool);
      expect(diff(stand.buf.px, breath.buf.px), k).toBeGreaterThan(30);
      const blink = keeperFrame(def, 'stand', 'down', 10, tool);
      const open = keeperFrame(def, 'stand', 'down', 9, tool);
      const shut = diff(open.buf.px, blink.buf.px);
      expect(shut, k).toBeGreaterThan(0);
      expect(shut, k).toBeLessThan(20);
      // Facing left is painted that way round, not mirrored: the light stays on the top left.
      const right = keeperFrame(def, 'stand', 'side', 0, tool, 1);
      const left = keeperFrame(def, 'stand', 'side', 0, tool, -1);
      const W = right.buf.w;
      const mirrored = new Uint8ClampedArray(right.buf.px.length);
      for (let y = 0; y < right.buf.h; y++) for (let x = 0; x < W; x++) mirrored.set(right.buf.px.subarray((y * W + x) * 4, (y * W + x) * 4 + 4), (y * W + W - 1 - x) * 4);
      expect(diff(mirrored, left.buf.px), k).toBeGreaterThan(20);
      expect(left.ax, k).toBe(W - 1 - right.ax);
    }
  });
});
