/**
 * The portal (CrazyGames): the SDK is told what it needs to hear and no more, an ad stops the game
 * and its sound only while it lasts, saves go to the player's account and fall back to the browser,
 * and with no SDK on the page nothing here does anything. And the game's side of it: where a break
 * for an ad falls, and the two rewards for watching one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreEvent } from '../src/core/events';
import type { OfflineReport } from '../src/core/offline';
import { loadGame, SAVE_KEY, saveGame, setSaveStore, type SaveStore } from '../src/core/save';
import { newGame } from '../src/core/newGame';
import { FAVOUR_EVERY_MS, Game } from '../src/game';
import { CrazyGames } from '../src/platform/crazygames';
import { HUB_DESCEND_Y } from '../src/render/art/hubScene';

interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (e: { code: string; message: string }) => void;
}

/** CrazyGames' SDK as the game sees it: every call written down, ads answered by the test. */
function fakeSdk(o: { environment?: string; initFails?: boolean; dataOff?: boolean; launchFlow?: string } = {}) {
  const calls: string[] = [];
  const data = new Map<string, string>();
  const settingsFns: Array<(s: { muteAudio?: boolean }) => void> = [];
  const authFns: Array<(user: unknown) => void> = [];
  let pending: AdCallbacks | null = null;
  const off = () => {
    throw { code: 'dataModuleDisabled', message: 'The data module is disabled.' };
  };
  const sdk = {
    init: async () => {
      calls.push('init');
      if (o.initFails) throw new Error('no portal');
    },
    environment: o.environment ?? 'crazygames',
    game: {
      loadingStart: () => calls.push('loadingStart'),
      loadingStop: () => calls.push('loadingStop'),
      gameplayStart: () => calls.push('gameplayStart'),
      gameplayStop: () => calls.push('gameplayStop'),
      happytime: () => calls.push('happytime'),
      settings: { muteAudio: false },
      addSettingsChangeListener: (fn: (s: { muteAudio?: boolean }) => void) => settingsFns.push(fn),
    },
    ad: {
      initInfo: { launchFlow: o.launchFlow ?? 'full' },
      requestAd: (type: string, cb: AdCallbacks) => {
        calls.push(`requestAd:${type}`);
        pending = cb;
      },
    },
    data: {
      getItem: (k: string) => (o.dataOff ? off() : (data.get(k) ?? null)),
      setItem: (k: string, v: string) => (o.dataOff ? off() : void data.set(k, v)),
      removeItem: (k: string) => (o.dataOff ? off() : void data.delete(k)),
    },
    user: {
      systemInfo: { device: { type: 'mobile' } },
      addAuthListener: (fn: (user: unknown) => void) => authFns.push(fn),
    },
  };
  return {
    sdk,
    calls,
    data,
    /** The ad the game asked for, to answer. */
    ad: () => pending!,
    setMute(on: boolean) {
      sdk.game.settings.muteAudio = on;
      for (const fn of settingsFns) fn(sdk.game.settings);
    },
    signIn: () => authFns.forEach((fn) => fn({ username: 'someone' })),
  };
}

function memoryStore(): SaveStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

const g = globalThis as unknown as { window?: unknown; localStorage?: unknown; location?: unknown };

async function onCrazyGames(o: Parameters<typeof fakeSdk>[0] = {}) {
  const fake = fakeSdk(o);
  g.window = { CrazyGames: { SDK: fake.sdk } };
  const portal = new CrazyGames();
  await portal.init();
  return { portal, ...fake };
}

describe('the CrazyGames SDK', () => {
  let browser: ReturnType<typeof memoryStore>;
  beforeEach(() => {
    browser = memoryStore();
    g.localStorage = browser;
    g.location = { reload: vi.fn() };
  });
  afterEach(() => {
    delete g.window;
    delete g.localStorage;
    delete g.location;
    vi.useRealTimers();
  });

  it('with no SDK on the page, nothing happens and nothing breaks', async () => {
    const portal = new CrazyGames();
    await portal.init();
    expect(portal.on).toBe(false);
    portal.loadingStart();
    portal.gameplay(true);
    portal.happytime();
    expect(await portal.ad('midgame')).toBe('none');
    expect(portal.busy).toBe(false);
    expect(portal.rewards).toBe(false);
    expect(portal.muted).toBe(false);
    expect(portal.store()).toBeNull();
    expect(portal.device).toBeNull();
  });

  it('an SDK that fails to start, or runs off CrazyGames, leaves the game on its own', async () => {
    expect((await onCrazyGames({ initFails: true })).portal.on).toBe(false);
    const elsewhere = await onCrazyGames({ environment: 'disabled' });
    expect(elsewhere.portal.on).toBe(false);
    expect(elsewhere.portal.store()).toBeNull();
  });

  it('hears loading once, and each change between play and a break once', async () => {
    const { portal, calls } = await onCrazyGames();
    portal.loadingStart();
    portal.loadingStart();
    portal.loadingStop();
    portal.loadingStop();
    portal.gameplay(true);
    portal.gameplay(true);
    portal.gameplay(false);
    portal.gameplay(false);
    portal.gameplay(true);
    expect(calls).toEqual(['init', 'loadingStart', 'loadingStop', 'gameplayStart', 'gameplayStop', 'gameplayStart']);
  });

  it('an ad holds the game from the ask, and mutes it and stops play only while it shows', async () => {
    const { portal, calls, ad } = await onCrazyGames();
    const muted: boolean[] = [];
    portal.onMute((m) => muted.push(m));
    portal.gameplay(true);
    const over = portal.ad('midgame');
    // Asked for: the game waits, but nothing is silenced yet (most asks come back empty).
    expect(portal.busy).toBe(true);
    expect(portal.muted).toBe(false);
    expect(calls.at(-1)).toBe('requestAd:midgame');
    ad().adStarted!();
    expect(portal.muted).toBe(true);
    expect(calls.at(-1)).toBe('gameplayStop');
    // (The game still says "playing" ten times a second: an ad on screen is never play.)
    portal.gameplay(true);
    expect(calls.at(-1)).toBe('gameplayStop');
    ad().adFinished!();
    expect(await over).toBe('done');
    expect(portal.busy).toBe(false);
    expect(portal.muted).toBe(false);
    expect(calls.at(-1)).toBe('gameplayStart');
    expect(muted).toEqual([false, true, false]);
  });

  it('no ad to show: the game goes straight on, never muted, play never stopped', async () => {
    const { portal, calls, ad } = await onCrazyGames();
    portal.gameplay(true);
    const over = portal.ad('midgame');
    ad().adError!({ code: 'adCooldown', message: 'too soon' });
    expect(await over).toBe('none');
    expect(portal.busy).toBe(false);
    expect(calls.filter((c) => c === 'gameplayStop')).toEqual([]);
    // One ask at a time: a second while the first is out is turned away.
    const first = portal.ad('rewarded');
    expect(await portal.ad('rewarded')).toBe('none');
    ad().adError!({ code: 'unfilled', message: 'none' });
    expect(await first).toBe('none');
    expect(portal.rewards).toBe(true);
  });

  it('ads switched off (Basic Launch): rewarded offers go, for good', async () => {
    const { portal, calls, ad } = await onCrazyGames();
    expect(portal.rewards).toBe(true);
    const over = portal.ad('rewarded');
    ad().adError!({ code: 'adsDisabled', message: 'Ads are not allowed in basic launch flow' });
    expect(await over).toBe('off');
    expect(portal.rewards).toBe(false);
    const n = calls.length;
    expect(await portal.ad('rewarded')).toBe('off');
    expect(calls.length).toBe(n);
    // When the SDK already knows at the start, nothing is offered at all.
    expect((await onCrazyGames({ launchFlow: 'basic' })).portal.rewards).toBe(false);
  });

  it('an ask that is never answered lets the game go in the end; an ad that has started is waited out', async () => {
    vi.useFakeTimers();
    const { portal, ad } = await onCrazyGames();
    const over = portal.ad('midgame');
    expect(portal.busy).toBe(true);
    await vi.advanceTimersByTimeAsync(91_000);
    expect(await over).toBe('none');
    expect(portal.busy).toBe(false);
    // A long ad: the game stays held and silent for all of it.
    const long = portal.ad('rewarded');
    ad().adStarted!();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(portal.busy).toBe(true);
    expect(portal.muted).toBe(true);
    ad().adFinished!();
    expect(await long).toBe('done');
  });

  it("the portal's mute switch is above the game's own volume", async () => {
    const { portal, setMute } = await onCrazyGames();
    const muted: boolean[] = [];
    portal.onMute((m) => muted.push(m));
    setMute(true);
    setMute(false);
    expect(muted).toEqual([false, true, false]);
  });

  it("saves go to the player's account, and a save from before it is found", async () => {
    const { portal, data } = await onCrazyGames();
    const store = portal.store()!;
    browser.setItem('k', 'from the browser');
    expect(store.getItem('k')).toBe('from the browser');
    store.setItem('k', 'on the account');
    expect(data.get('k')).toBe('on the account');
    expect(store.getItem('k')).toBe('on the account');
    expect(browser.getItem('k')).toBe('from the browser');
    store.removeItem('k');
    expect(store.getItem('k')).toBeNull();
  });

  it("with the data module switched off for the game, the browser's own storage takes over", async () => {
    const { portal } = await onCrazyGames({ dataOff: true });
    const store = portal.store()!;
    expect(store.getItem('k')).toBeNull();
    store.setItem('k', 'v');
    expect(browser.getItem('k')).toBe('v');
    expect(store.getItem('k')).toBe('v');
  });

  it("a guest who signs in: nothing more is saved over their account, and the game starts again from it", async () => {
    vi.useFakeTimers();
    const { portal, data, signIn } = await onCrazyGames();
    const store = portal.store()!;
    store.setItem('k', 'guest');
    signIn();
    data.set('k', 'account');
    store.setItem('k', 'guest again');
    store.removeItem('k');
    expect(data.get('k')).toBe('account');
    await vi.advanceTimersByTimeAsync(2000);
    expect((g.location as { reload: ReturnType<typeof vi.fn> }).reload).toHaveBeenCalledTimes(1);
  });

  it('says what the device is', async () => {
    expect((await onCrazyGames()).portal.device).toBe('mobile');
  });
});

describe('saves in a store of the portal\'s', () => {
  afterEach(() => setSaveStore(null));

  it('are written to it and read back from it', () => {
    const store = memoryStore();
    setSaveStore(store);
    const s = newGame(7);
    s.gold = 1234;
    saveGame(s);
    expect(store.map.has(SAVE_KEY)).toBe(true);
    expect(loadGame()!.gold).toBe(1234);
  });

  it('a store that throws costs nothing but the save', () => {
    const broken: SaveStore = {
      getItem: () => {
        throw new Error('gone');
      },
      setItem: () => {
        throw new Error('gone');
      },
      removeItem: () => {
        throw new Error('gone');
      },
    };
    setSaveStore(broken);
    expect(() => saveGame(newGame(7))).not.toThrow();
    expect(loadGame()).toBeNull();
  });
});

/** A new game, down the hub's steps and into the dungeon. */
function inTheDungeon(): { game: Game; events: CoreEvent[] } {
  const game = new Game(true);
  const events: CoreEvent[] = [];
  game.on((e) => events.push(e));
  for (let t = 0; t < 3; t += 1 / 30) game.tick(1 / 30);
  game.hub!.leader()!.y = HUB_DESCEND_Y + 2;
  for (let t = 0; t < 1.5; t += 1 / 30) game.tick(1 / 30);
  expect(game.inDungeon).toBe(true);
  return { game, events };
}

const breaks = (events: CoreEvent[]) => events.flatMap((e) => (e.type === 'break' ? [e.kind] : []));

describe('where an ad may fall', () => {
  it('after a wipe, as the hub comes up', () => {
    const { game, events } = inTheDungeon();
    const w = game.world!;
    for (const h of w.heroes) w.damage(h, h.maxHp * 100, null);
    for (let t = 0; t < 0.5; t += 1 / 30) game.tick(1 / 30);
    expect(breaks(events)).toEqual([]);
    for (let t = 0; t < 3; t += 1 / 30) game.tick(1 / 30);
    expect(game.inDungeon).toBe(false);
    expect(breaks(events)).toEqual(['wipe']);
  });

  it("through a boss floor's portal: in the dark, before the next floor is made, which waits while the game is paused", () => {
    const { game, events } = inTheDungeon();
    game.startFloor(5);
    game.world!.events.push({ type: 'exit' });
    let n = 0;
    while (!breaks(events).length && n++ < 120) game.tick(1 / 60);
    expect(breaks(events)).toEqual(['boss']);
    expect(game.fade).toBe(1);
    expect(game.state.run.floor).toBe(5);
    // (An ad is up: the app pauses the game. The next floor waits for it.)
    game.paused = true;
    for (let i = 0; i < 30; i++) game.tick(1 / 60);
    expect(game.state.run.floor).toBe(5);
    game.paused = false;
    game.tick(1 / 60);
    expect(game.state.run.floor).toBe(6);
    expect(breaks(events)).toEqual(['boss']);
  });

  it('never between ordinary floors, nor on the way back to camp', () => {
    const { game, events } = inTheDungeon();
    game.startFloor(3);
    game.world!.events.push({ type: 'exit' });
    for (let i = 0; i < 120; i++) game.tick(1 / 60);
    expect(game.state.run.floor).toBe(4);
    game.leaveDungeon();
    for (let i = 0; i < 60; i++) game.tick(1 / 60);
    expect(breaks(events)).toEqual([]);
  });
});

describe('rewards for watching an ad', () => {
  it("the Oracle's Favour is a Luck Potion, once every ten minutes", () => {
    const game = new Game(true);
    const events: CoreEvent[] = [];
    game.on((e) => events.push(e));
    const now = Date.now();
    expect(game.favourWait(now)).toBe(0);
    expect(game.takeFavour(now)).toBe(true);
    expect(events.some((e) => e.type === 'potion')).toBe(true);
    expect(game.state.potionEndsAt! - Date.now()).toBeGreaterThan((game.potionSeconds() - 2) * 1000);
    expect(game.favourWait(now)).toBe(FAVOUR_EVERY_MS / 1000);
    expect(game.takeFavour(now + 60_000)).toBe(false);
    expect(game.takeFavour(now + FAVOUR_EVERY_MS)).toBe(true);
  });

  it("a night away's gold is paid a second time, once", () => {
    const game = new Game(true);
    const report: OfflineReport = { seconds: 3600, rolls: 0, kept: [], extras: 0, gold: 500 };
    const before = game.state.gold;
    expect(game.doubleAway(report)).toBe(500);
    expect(game.state.gold).toBe(before + 500);
    expect(game.doubleAway(report)).toBe(0);
    expect(game.state.gold).toBe(before + 500);
    expect(game.doubleAway({ ...report, gold: 0, doubled: false })).toBe(0);
  });
});
