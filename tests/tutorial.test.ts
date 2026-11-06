import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/newGame';
import { mend } from '../src/core/save';
import {
  AUTO_ASK,
  AUTO_READ,
  SKILLS_READ,
  TIP_MIN,
  TIP_REST,
  TIP_SECONDS,
  TUT_STEPS,
  TUT_TIPS,
  currentStep,
  freshTutorial,
  hasProgress,
  mendTutorial,
  newTutRun,
  restartTutorial,
  skipTutorial,
  tutorialDid,
  tutorialOn,
  tutorialView,
  type TutCtx,
  type TutorialSave,
  type TutRun,
} from '../src/core/tutorial';

/** A moment in the game, as the screen would describe it. */
function at(where: TutCtx['where'], o: Partial<TutCtx> = {}): TutCtx {
  return {
    where,
    touch: false,
    hasKnight: true,
    sealed: false,
    nearWarden: false,
    canLevel: false,
    levelShown: true,
    foeNear: false,
    rolling: false,
    castAgo: Infinity,
    exitOpen: true,
    doorInView: false,
    floor: 1,
    shopInView: false,
    canRebirth: false,
    soloShown: false,
    autoOn: false,
    ...o,
  };
}

/** The tutorial and its screen-side memory, played frame by frame on a clock. */
function play(t: TutorialSave = freshTutorial()) {
  const run: TutRun = newTutRun();
  let now = 0;
  return {
    t,
    run,
    /** The line now (advancing the clock a frame). */
    see(ctx: TutCtx, dt = 0.1) {
      now += dt;
      return tutorialView(t, run, ctx, now);
    },
    key(ctx: TutCtx, dt = 0.1) {
      return this.see(ctx, dt)?.key ?? null;
    },
    /** The line after `secs` seconds of the same moment. */
    wait(ctx: TutCtx, secs: number) {
      let v = null;
      for (let i = 0; i < Math.round(secs / 0.1); i++) v = this.see(ctx);
      return v?.key ?? null;
    },
    did(a: Parameters<typeof tutorialDid>[2]) {
      tutorialDid(t, run, a);
    },
  };
}

describe('the tutorial: who gets it', () => {
  it('starts with a new game, from the top', () => {
    const s = newGame(1);
    expect(s.seen.tutorial).toEqual({ done: [], tips: [], skipped: false });
    expect(currentStep(s.seen.tutorial)).toBe('seal');
    expect(tutorialOn(s.seen.tutorial)).toBe(true);
  });

  it('never comes out of the blue for a save from before it with progress behind it', () => {
    const cases: Array<(s: Record<string, unknown>) => void> = [
      (s) => ((s.roster as Record<string, unknown>)['common-blade'] = { id: 'common-blade', level: 1, mutation: null }),
      (s) => (s.gold = 120),
      (s) => (s.rebirths = 1),
      (s) => ((s.records as { spins: number }).spins = 3),
      (s) => ((s.records as { kills: number }).kills = 9),
      (s) => ((s.records as { bestFloorEver: number }).bestFloorEver = 4),
      (s) => ((s.run as { bestFloor: number }).bestFloor = 2),
      (s) => ((s.codex as Record<string, unknown>)['common-blade'] = 1),
    ];
    for (const make of cases) {
      const old = JSON.parse(JSON.stringify(newGame(2))) as Record<string, unknown>;
      delete (old.seen as Record<string, unknown>).tutorial;
      make(old);
      const s = mend(old);
      expect(s.seen.tutorial.skipped).toBe(true);
      expect(tutorialOn(s.seen.tutorial)).toBe(false);
      expect(tutorialView(s.seen.tutorial, newTutRun(), at('hub'), 1)).toBeNull();
    }
  });

  it('still comes for a save from before it with nothing in it yet', () => {
    const old = JSON.parse(JSON.stringify(newGame(3))) as Record<string, unknown>;
    delete (old.seen as Record<string, unknown>).tutorial;
    expect(mend(old).seen.tutorial).toEqual(freshTutorial());
    // (A save from before there was a `seen` at all, too.)
    delete old.seen;
    expect(mend(old).seen.tutorial).toEqual(freshTutorial());
  });

  it('tells progress from none', () => {
    expect(hasProgress({ roster: {}, codex: {}, gold: 0, rebirths: 0, records: { spins: 0, kills: 0, bestFloorEver: 1 }, run: { bestFloor: 1 } })).toBe(false);
    expect(hasProgress({})).toBe(false);
    expect(hasProgress({ gold: Number.NaN })).toBe(false);
    expect(hasProgress({ gold: 1 })).toBe(true);
  });

  it('keeps its place in a save, cleaned up', () => {
    const s = newGame(4);
    s.seen.tutorial = { done: ['seal', 'altar', 'move'], tips: ['shop'], skipped: false };
    s.gold = 50;
    const back = mend(JSON.parse(JSON.stringify(s)));
    expect(back.seen.tutorial).toEqual({ done: ['seal', 'altar', 'move'], tips: ['shop'], skipped: false });
    // Junk and repeats go; a skip stays skipped.
    expect(mendTutorial({ done: ['seal', 'altar', 'nope', 'altar', 3, 'talk'], tips: ['auto', 'auto', null], skipped: true }, {})).toEqual({ done: ['seal', 'altar', 'talk'], tips: ['auto'], skipped: true });
    // Something that isn't a tutorial at all: as if there were none.
    expect(mendTutorial('yes', { gold: 5 }).skipped).toBe(true);
    expect(mendTutorial([1, 2], {})).toEqual(freshTutorial());
    expect(mendTutorial({ skipped: 'yes' }, {}).skipped).toBe(false);
  });
});

describe('the tutorial: one step at a time', () => {
  it('walks a new player through, each step done by doing it', () => {
    const g = play();
    // A new game opens on the altar, sealed: the Oracle asks for the seal to be broken.
    expect(g.key(at('altar', { hasKnight: false, sealed: true }))).toBe('seal');
    expect(g.see(at('altar', { hasKnight: false, sealed: true }))!.target).toEqual({ kind: 'ui', id: 'seal' });
    expect(g.wait(at('altar', { hasKnight: false, sealed: true }), 5)).toBe('seal');
    // Broken, the altar spins: nothing until the first knight lands.
    expect(g.key(at('altar', { hasKnight: false }))).toBeNull();
    expect(g.key(at('altar'))).toBe('altar');
    // Closed: choosing who to play as says nothing; the hub says walk.
    expect(g.key(at('select'))).toBeNull();
    expect(g.t.done).toEqual(['seal', 'altar']);
    expect(g.key(at('hub'))).toBe('move');
    // Not done until you walk.
    expect(g.wait(at('hub'), 5)).toBe('move');
    g.did('moved');
    expect(g.key(at('hub'))).toBe('talk:walk');
    expect(g.see(at('hub'))!.target).toEqual({ kind: 'world', id: 'warden' });
    expect(g.key(at('hub', { nearWarden: true }))).toBe('talk:open');
    expect(g.see(at('hub', { nearWarden: true }))!.target).toEqual({ kind: 'ui', id: 'talk' });
    // His counter open: DESCEND.
    expect(g.key(at('warden'))).toBe('descend:warden');
    expect(g.t.done).toEqual(['seal', 'altar', 'move', 'talk']);
    // Closed it without going down: the steps.
    expect(g.key(at('hub'))).toBe('descend:steps');
    // Down: nothing until a foe is close.
    expect(g.key(at('busy'))).toBeNull();
    expect(g.key(at('dungeon'))).toBeNull();
    expect(g.t.done).toContain('descend');
    expect(g.key(at('dungeon', { foeNear: true }))).toBe('attack');
    expect(g.wait(at('dungeon', { foeNear: true, rolling: true }), 3)).toBe('attack');
    g.did('attacked');
    // The skill reel: up a few seconds, then done.
    expect(g.key(at('dungeon', { foeNear: true, rolling: true }))).toBe('skills');
    expect(g.wait(at('dungeon', { foeNear: true }), SKILLS_READ - 0.5)).toBe('skills');
    expect(g.wait(at('dungeon', { foeNear: true }), 1)).toBeNull();
    expect(g.t.done).toContain('skills');
    // The fight over: the door.
    expect(g.key(at('dungeon'))).toBe('exit:far');
    expect(g.key(at('dungeon', { doorInView: true }))).toBe('exit:near');
    g.did('exited');
    // Auto battle: tap AUTO; once it's on, how to take over; then the line goes.
    expect(g.key(at('dungeon', { floor: 2 }))).toBe('auto:ask');
    expect(g.see(at('dungeon', { floor: 2 }))!.target).toEqual({ kind: 'ui', id: 'auto' });
    expect(g.key(at('dungeon', { floor: 2, autoOn: true }))).toBe('auto:on');
    expect(g.wait(at('dungeon', { floor: 2, autoOn: true }), AUTO_READ + 0.2)).toBeNull();
    expect(g.t.done).toContain('auto');
    // Gold enough to level up: head back up, then to the warden, then LEVEL UP.
    expect(g.key(at('dungeon', { floor: 2, canLevel: true }))).toBe('camp');
    expect(g.key(at('dungeon', { floor: 2, canLevel: true, foeNear: true }))).toBeNull();
    expect(g.key(at('hub', { canLevel: true }))).toBe('spend:walk');
    expect(g.t.done).toContain('camp');
    // (The same words all the way to him: only the pointer moves, onto his button.)
    const near = g.see(at('hub', { canLevel: true, nearWarden: true }))!;
    expect(near.key).toBe('spend:open');
    expect(near.text).toBe(g.see(at('hub', { canLevel: true }))!.text);
    expect(g.key(at('warden', { canLevel: true }))).toBe('spend:level');
    expect(g.key(at('warden', { canLevel: true, levelShown: false }))).toBe('spend:tab');
    g.did('leveled');
    expect(g.key(at('warden'))).toBeNull();
    expect(currentStep(g.t)).toBeNull();
    expect(g.t.done).toEqual([...TUT_STEPS]);
  });

  it('shows nothing while something else has the screen', () => {
    const g = play();
    for (const where of ['busy', 'select', 'keeper'] as const) expect(g.key(at(where))).toBeNull();
    g.t.done = ['seal', 'altar', 'move', 'talk', 'descend'];
    expect(g.key(at('busy', { foeNear: true }))).toBeNull();
  });

  it('never shows a step before the one it waits for', () => {
    const g = play({ done: ['seal', 'altar', 'move', 'talk', 'descend'], tips: [], skipped: false });
    // In the dungeon, no foe yet: not the door (fight first).
    expect(g.key(at('dungeon'))).toBeNull();
    expect(g.key(at('dungeon', { canLevel: true }))).toBeNull();
    // At the hub with gold: not the warden yet either (the fight and the door come first).
    expect(g.key(at('hub', { canLevel: true }))).toBeNull();
    expect(g.t.done).not.toContain('camp');
    // Gold from duplicates before the first trip down: still the walk, and "go back up" isn't done.
    const h = play({ done: ['seal', 'altar'], tips: [], skipped: false });
    expect(h.key(at('hub', { canLevel: true }))).toBe('move');
    expect(h.key(at('warden', { canLevel: true }))).toBe('descend:warden');
    expect(h.t.done).toEqual(['seal', 'altar', 'move', 'talk']);
  });

  it("doesn't hold the door up for a skill roll it didn't see", () => {
    const g = play({ done: ['seal', 'altar', 'move', 'talk', 'descend'], tips: [], skipped: false });
    expect(g.key(at('dungeon', { foeNear: true }))).toBe('attack');
    g.did('killed');
    // The fight's over and no roll came: the door's next, and the skills line waits for a fight.
    expect(g.key(at('dungeon'))).toBe('exit:far');
    g.did('exited');
    // (Auto battle's line asks meanwhile; a roll's line comes first when one spins.)
    expect(g.key(at('dungeon', { floor: 2 }))).toBe('auto:ask');
    expect(g.key(at('dungeon', { floor: 2, foeNear: true, rolling: true }))).toBe('skills');
    // A cast just now brings it up too (the fight may be over before the next roll).
    const h = play({ done: ['seal', 'altar', 'move', 'talk', 'descend', 'attack'], tips: [], skipped: false });
    expect(h.key(at('dungeon', { castAgo: 0.5, doorInView: true }))).toBe('skills');
    expect(h.wait(at('dungeon', { doorInView: true }), SKILLS_READ + 0.2)).toBe('exit:near');
  });

  it('marks a step done when the player gets past it on their own', () => {
    const g = play({ done: ['seal', 'altar'], tips: [], skipped: false });
    // Straight down the steps without a word to the warden: move, talk and descend are all done.
    g.key(at('dungeon'));
    expect(g.t.done).toEqual(['seal', 'altar', 'move', 'talk', 'descend']);
    // Back up with gold (a wipe, say): no need to say go back up.
    const h = play({ done: ['seal', 'altar', 'move', 'talk', 'descend', 'attack', 'skills', 'exit'], tips: [], skipped: false });
    expect(h.key(at('hub', { canLevel: true }))).toBe('spend:walk');
    expect(h.t.done).toContain('camp');
  });

  it("shows auto battle, and lets it be if it isn't wanted", () => {
    const g = play({ done: ['seal', 'altar', 'move', 'talk', 'descend', 'attack', 'skills', 'exit'], tips: [], skipped: false });
    expect(g.key(at('dungeon', { floor: 2 }))).toBe('auto:ask');
    // Not tapped: the line asks a while, then goes, and the walk-through carries on.
    expect(g.wait(at('dungeon', { floor: 2 }), AUTO_ASK + 0.2)).toBeNull();
    expect(g.t.done).toContain('auto');
    expect(g.key(at('dungeon', { floor: 2, canLevel: true }))).toBe('camp');
  });

  it('lets auto battle do the fighting', () => {
    const g = play({ done: ['seal', 'altar', 'move', 'talk', 'descend'], tips: [], skipped: false });
    expect(g.key(at('dungeon', { foeNear: true, autoOn: true }))).toBeNull();
    expect(g.t.done).toContain('attack');
  });

  it('only says the door when the door is open', () => {
    const g = play({ done: ['seal', 'altar', 'move', 'talk', 'descend', 'attack', 'skills'], tips: [], skipped: false });
    expect(g.key(at('dungeon', { exitOpen: false }))).toBeNull();
    expect(g.key(at('dungeon'))).toBe('exit:far');
  });

  it('says tap and drag on a phone, keys and clicks on a computer', () => {
    const lines = (touch: boolean) => {
      const g = play();
      const out: string[] = [];
      const see = (c: TutCtx) => out.push(g.see({ ...c, touch })!.text);
      see(at('altar'));
      g.key(at('select'));
      see(at('hub'));
      g.did('moved');
      see(at('hub', { nearWarden: true }));
      see(at('warden'));
      g.key(at('dungeon'));
      see(at('dungeon', { foeNear: true }));
      g.did('attacked');
      g.did('exited');
      g.t.done.push('skills');
      see(at('dungeon'));
      see(at('dungeon', { autoOn: true }));
      g.t.done.push('auto');
      see(at('dungeon', { canLevel: true }));
      see(at('warden', { canLevel: true }));
      return out;
    };
    const phone = lines(true);
    const desk = lines(false);
    expect(phone).toEqual([
      'Your first knight! Now close the altar.',
      'Drag anywhere to walk.',
      'Tap [SQUAD] to see your squad.',
      'Your squad is set. Tap [DESCEND]!',
      'Hold [ATTACK] to fight.',
      'Tap [AUTO] and your knight plays on its own.',
      'Auto is on! Drag, or hold [ATTACK], to take over.',
      'Tap [CAMP] to go spend your gold.',
      'Tap [LEVEL UP] for a stronger knight.',
    ]);
    expect(desk).toEqual([
      'Your first knight! Now close the altar.',
      'Walk with [WASD] or the arrows.',
      'Press [E] to see your squad.',
      'Your squad is set. Click [DESCEND]!',
      'Hold [left click] to attack.',
      'Press [T] for [AUTO]: your knight plays itself.',
      'Auto is on! Move or attack to take over.',
      'Press [Esc] to go spend your gold.',
      'Click [LEVEL UP] for a stronger knight.',
    ]);
    // Every line short: one thing at a time.
    for (const text of [...phone, ...desk]) expect(text.replace(/[[\]]/g, '').length).toBeLessThanOrEqual(48);
  });
});

describe('the tutorial: skipping and replaying', () => {
  it('shows nothing once skipped, tips included', () => {
    const g = play();
    expect(g.key(at('altar'))).toBe('altar');
    skipTutorial(g.t);
    expect(g.key(at('altar'))).toBeNull();
    expect(g.key(at('dungeon', { shopInView: true, floor: 10 }))).toBeNull();
    g.did('moved');
    // (Only the seal, broken before it was skipped.)
    expect(g.t.done).toEqual(['seal']);
    expect(tutorialOn(g.t)).toBe(false);
    // Skipped is saved.
    const s = newGame(5);
    skipTutorial(s.seen.tutorial);
    expect(mend(JSON.parse(JSON.stringify(s))).seen.tutorial.skipped).toBe(true);
  });

  it('plays again from the top from Settings', () => {
    const g = play({ done: [...TUT_STEPS], tips: [...TUT_TIPS], skipped: true });
    restartTutorial(g.t);
    expect(g.t).toEqual(freshTutorial());
    expect(tutorialOn(g.t)).toBe(true);
    expect(g.key(at('altar'))).toBe('altar');
    // Replayed out in the dungeon, it picks up at the first thing it can show there.
    const h = play({ done: [...TUT_STEPS], tips: [], skipped: false });
    restartTutorial(h.t);
    expect(h.key(at('dungeon', { foeNear: true }))).toBe('attack');
  });
});

describe('the tutorial: one-off tips', () => {
  const after = () => play({ done: [...TUT_STEPS], tips: [], skipped: false });

  it('shows each tip once, the first time its thing comes up', () => {
    const g = after();
    expect(g.key(at('dungeon', { shopInView: true }))).toBe('tip:shop');
    expect(g.t.tips).toEqual(['shop']);
    // It stays up its time while its thing's there, then goes, and never comes back.
    expect(g.wait(at('dungeon', { shopInView: true }), TIP_SECONDS - 0.5)).toBe('tip:shop');
    expect(g.wait(at('dungeon', { shopInView: true }), 1)).toBeNull();
    expect(g.wait(at('dungeon', { shopInView: true }), 30)).toBeNull();
  });

  it('puts a tip away when its thing has gone, after a moment to read it', () => {
    const g = after();
    expect(g.key(at('dungeon', { shopInView: true }))).toBe('tip:shop');
    expect(g.wait(at('dungeon'), TIP_MIN - 0.5)).toBe('tip:shop');
    expect(g.wait(at('dungeon'), 1)).toBeNull();
    // Buying something puts it away at once.
    const h = after();
    h.key(at('dungeon', { shopInView: true }));
    h.did('bought');
    expect(h.key(at('dungeon', { shopInView: true }))).toBeNull();
  });

  it('leaves a breather between tips', () => {
    const g = after();
    g.key(at('dungeon', { shopInView: true }));
    g.did('bought');
    expect(g.key(at('dungeon', { floor: 10 }))).toBeNull();
    expect(g.wait(at('dungeon', { floor: 10 }), TIP_REST + 0.2)).toBe('tip:checkpoint');
  });

  it('has a tip for each later thing, where it comes up', () => {
    expect(after().key(at('dungeon', { floor: 10 }))).toBe('tip:checkpoint');
    expect(after().key(at('dungeon', { floor: 20 }))).toBe('tip:checkpoint');
    expect(after().key(at('dungeon', { floor: 7 }))).toBe('tip:auto');
    expect(after().key(at('hub', { canRebirth: true }))).toBe('tip:rebirth');
    expect(after().key(at('warden', { soloShown: true }))).toBe('tip:solo');
    expect(after().key(at('dungeon', { floor: 3 }))).toBe('tip:auto');
    // Not with a foe on you, nor with auto battle already on.
    expect(after().key(at('dungeon', { floor: 3, foeNear: true }))).toBeNull();
    expect(after().key(at('dungeon', { floor: 3, autoOn: true }))).toBeNull();
    // Turning auto battle on puts its tip away.
    const g = after();
    g.key(at('dungeon', { floor: 3 }));
    g.did('autoOn');
    expect(g.key(at('dungeon', { floor: 3, autoOn: true }))).toBeNull();
  });

  it('keeps the auto tip until the walk-through is done, and steps come before tips', () => {
    const g = play({ done: ['seal', 'altar', 'move', 'talk', 'descend', 'attack', 'skills'], tips: [], skipped: false });
    // (Floor 3, the door open: the door's line, not the tip.)
    expect(g.key(at('dungeon', { floor: 3 }))).toBe('exit:far');
    const h = play({ done: ['seal', 'altar', 'move', 'talk', 'descend', 'attack', 'skills', 'exit', 'auto'], tips: [], skipped: false });
    expect(h.key(at('dungeon', { floor: 3 }))).toBeNull();
    // Other tips don't wait: a merchant on floor 4 before the warden's been visited.
    expect(h.key(at('dungeon', { floor: 4, shopInView: true }))).toBe('tip:shop');
  });

  it('is done once every step and tip is', () => {
    const t: TutorialSave = { done: [...TUT_STEPS], tips: [...TUT_TIPS], skipped: false };
    expect(tutorialOn(t)).toBe(false);
    expect(tutorialView(t, newTutRun(), at('dungeon', { floor: 10, shopInView: true }), 1)).toBeNull();
  });
});
