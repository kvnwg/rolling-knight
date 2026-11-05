import { describe, expect, it } from 'vitest';
import { keeperFrame, HUB_CAST, HUB_TOOLS } from '../src/render/art/hubNpcs';
import { HUB_DESCEND_Y, HUB_STEPS_Y, buildHub } from '../src/render/art/hubScene';
import { Game } from '../src/game';
import { HUB_COLS, HUB_H, HUB_ROWS, HUB_W, hubScene } from '../src/world/hub';
import { FLOOR, TILE, bfs, tileAt } from '../src/world/mapgen';

/** Everything a keeper says is drawable in the bitmap font too. */
const FONT_SAFE = /^[A-Za-z0-9 .,!?:'"\-+/%()]+$/;
/** world/hubWorld.ts talks to a keeper within this many px. */
const TALK_RANGE = 26;

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

  it('has every station, with a keeper (or a board), a sign and a greeting', () => {
    const s = hubScene();
    const ids = s.stations.map((st) => st.id).sort();
    expect(ids).toEqual(['altar', 'gate', 'perks', 'quests', 'rebirth', 'scrap', 'smith', 'squad', 'upgrades']);
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

  it('lets you walk down the steps far enough to go into the dungeon', () => {
    const s = hubScene();
    const d = bfs(s.map, Math.floor(s.spawn.x / TILE), Math.floor(s.spawn.y / TILE));
    const tx = Math.floor(240 / TILE);
    const ty = Math.floor((HUB_DESCEND_Y + 4) / TILE);
    expect(tileAt(s.map, tx, ty)).toBe(FLOOR);
    expect(d[ty * s.map.w + tx]).toBeGreaterThanOrEqual(0);
    // The spawn is above the steps: arriving at the hub never takes you straight back down.
    expect(s.spawn.y).toBeLessThan(HUB_STEPS_Y);
  });

  it('takes you into the dungeon when you walk down the steps, and back to the top of the square after', () => {
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
});
