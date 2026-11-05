/** A fresh save, and the state a rebirth starts from. */
import { BAL } from './balance';
import { shuffleDeck } from './deck';
import { Rng } from './rng';
import { SAVE_VERSION, type GameState } from './state';

export function newGame(seed = Date.now()): GameState {
  const s = Rng.hashSeed(seed);
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    seed: s,
    rngState: s,
    createdAt: now,
    savedAt: now,
    playTimeMs: 0,
    gold: 0,
    hourglasses: 0,
    sigils: 0,
    potionEndsAt: null,
    roster: {},
    squad: [null, null, null],
    controlled: 0,
    upgrades: {},
    perks: [],
    rebirths: 0,
    heirloom: null,
    roll: {
      count: 0,
      spinCount: 0,
      sinceLucky: 0,
      dry: 0,
      timer: 0,
      current: null,
      hist: [],
      best: 0,
      since: null,
      tutorial: 'warmup',
      nextSpinId: 1,
    },
    // The first floor ever is the plain chain of rooms; after that the deck takes over.
    run: { floor: 1, bestFloor: 1, bosses: 0, checkpoint: 1, biomeSeed: Rng.hashSeed(s ^ 0xbeef), deaths: 0, designDeck: shuffleDeck(s, null, 'chain'), lastDesign: null, visits: 0 },
    codex: {},
    records: { bestOneIn: 0, bestName: null, bestFloorEver: 1, kills: 0, spins: 0 },
    stats: { killsThisRun: 0, goldPerMinute: 0, goldWindow: [] },
    settings: { sfx: 0.7, music: 0.5, autoPlay: false, reduceMotion: false, showDamage: true, tiltShift: true },
    seen: { tutorialHints: [], perksIntro: false },
    quests: [],
  };
}

/** Floor needed for the next rebirth. */
export function rebirthFloor(rebirths: number): number {
  return BAL.rebirth.baseFloor + BAL.rebirth.floorPer * rebirths;
}

export function canRebirth(state: GameState): boolean {
  return state.run.bestFloor >= rebirthFloor(state.rebirths);
}

/**
 * Rebirth: start over from Floor 1 with permanently more luck, gold and stats, and new classes to
 * roll. Gold, upgrades, knights (with their levels), perks and sigils go.
 * The Codex, records and settings stay. Heirloom (a perk) keeps one knight.
 */
export function rebirth(state: GameState): boolean {
  if (!canRebirth(state)) return false;
  const heir = state.perks.includes('heirloom') ? state.squad[state.controlled] : null;
  const kept = heir ? state.roster[heir] : null;
  state.rebirths += 1;
  state.gold = 0;
  state.hourglasses = 0;
  state.upgrades = {};
  state.perks = [];
  state.sigils = state.rebirths; // one per rebirth to start each run
  state.roster = {};
  state.squad = [null, null, null];
  state.controlled = 0;
  if (kept) {
    state.roster[kept.id] = { ...kept };
    state.squad[0] = kept.id;
  }
  state.heirloom = kept?.id ?? null;
  state.potionEndsAt = null;
  // The deck of floor designs carries on through the rebirth (no design comes round early).
  const { designDeck, lastDesign } = state.run;
  state.run = { floor: 1, bestFloor: 1, bosses: 0, checkpoint: 1, biomeSeed: Rng.hashSeed(state.seed ^ (state.rebirths * 7919)), deaths: 0, designDeck, lastDesign, visits: 0 };
  state.stats.killsThisRun = 0;
  state.roll.current = null;
  state.roll.timer = 0;
  state.roll.sinceLucky = 0;
  state.roll.dry = 0;
  // A new run warms up with three quick spins so the squad fills straight away.
  state.roll.tutorial = kept ? 'done' : 'rewarm';
  if (!kept) state.roll.spinCount = 0;
  return true;
}
