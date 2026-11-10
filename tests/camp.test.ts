import { describe, expect, it } from 'vitest';
import type { CoreEvent } from '../src/core/events';
import { campFloor, checkpointFor } from '../src/core/newGame';
import { Game } from '../src/game';
import { HUB_DESCEND_Y } from '../src/render/art/hubScene';
import { rewindTick } from '../src/ui/fx/FloorRewind';

describe('back to camp', () => {
  it('the run steps back to the floor after the last boss beaten', () => {
    expect([1, 3, 5, 6, 9, 10, 11, 13, 15, 16, 20, 21].map((f) => campFloor(f))).toEqual([1, 1, 1, 6, 6, 6, 11, 11, 11, 16, 16, 21]);
    // Never further than a wipe would send you: on a checkpoint floor with its boss still up, you keep it.
    expect(campFloor(10, 10)).toBe(10);
    expect(campFloor(13, 10)).toBe(11);
    for (let f = 1; f <= 80; f++) {
      expect(campFloor(f, checkpointFor(f))).toBeGreaterThanOrEqual(checkpointFor(f));
      expect(campFloor(f, checkpointFor(f))).toBeLessThanOrEqual(f);
    }
  });

  it('leaving sets the floor back, says so, and gets the fallen up', () => {
    const g = new Game(true);
    const events: CoreEvent[] = [];
    g.on((e) => events.push(e));
    for (let t = 0; t < 3; t += 1 / 30) g.tick(1 / 30);
    g.hub!.leader()!.y = HUB_DESCEND_Y + 2;
    for (let t = 0; t < 1.5; t += 1 / 30) g.tick(1 / 30);
    expect(g.inDungeon).toBe(true);
    g.startFloor(13);
    g.state.run.floor = 13;
    const hero = g.world!.heroes[0];
    hero.downed = true;
    hero.hp = 0;
    g.leaveDungeon();
    expect(g.inDungeon).toBe(false);
    expect(g.state.run.floor).toBe(11);
    expect(g.world).toBeNull();
    const camp = events.find((e) => e.type === 'camp');
    expect(camp).toEqual({ type: 'camp', from: 13, back: 11, revived: 1 });
    // Down again: everyone on their feet and whole.
    g.enterDungeon();
    expect(g.world!.floor).toBe(11);
    for (const h of g.world!.heroes) {
      expect(h.downed).toBeFalsy();
      expect(h.hp).toBe(h.maxHp);
    }
    // A second call from camp does nothing.
    g.leaveDungeon();
    const n = events.filter((e) => e.type === 'camp').length;
    g.leaveDungeon();
    expect(events.filter((e) => e.type === 'camp').length).toBe(n);
  });

  it('the count ticks at a readable pace however far it has to go', () => {
    expect(rewindTick(0)).toBe(0);
    for (let s = 1; s <= 4; s++) {
      expect(rewindTick(s)).toBeGreaterThanOrEqual(150);
      expect(rewindTick(s) * s).toBeLessThanOrEqual(1300);
    }
  });
});
