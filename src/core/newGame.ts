/** A fresh save, and the state a rebirth starts from. */
import { BAL } from './balance';
import { shuffleDeck } from './deck';
import { Rng } from './rng';
import { SAVE_VERSION, type GameState } from './state';
import { freshTutorial } from './tutorial';

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
    // A new game walks you through it (core/tutorial.ts).
    seen: { tutorialHints: [], perksIntro: false, tutorial: freshTutorial() },
    quests: [],
  };
}

/** Floor needed for the next rebirth. */
export function rebirthFloor(rebirths: number): number {
  return BAL.rebirth.baseFloor + BAL.rebirth.floorPer * rebirths;
}

/** The floor a wipe on `floor` sends the squad back to: the last checkpoint (every 10th floor), or the first. */
export function checkpointFor(floor: number): number {
  const k = BAL.dungeon.checkpointEvery;
  return Math.max(1, floor - (floor % k));
}

/** A boss guards every fifth floor. */
const BOSS_EVERY = 5;

/**
 * The floor a trip back to camp sets the run to: the one after the last boss you beat on the way
 * down (from 13, back to 11; from 15, where the boss still stands, back to 11; from 16, 16), or the
 * first. Never further back than the run's `checkpoint` (a wipe goes there, and a walk to camp is
 * never worse than a wipe): standing on a checkpoint floor with its boss still up, you keep it.
 */
export function campFloor(floor: number, checkpoint = 1): number {
  return Math.max(1, Math.min(floor, checkpoint), floor - ((floor - 1) % BOSS_EVERY));
}

export function canRebirth(state: GameState): boolean {
  return state.run.bestFloor >= rebirthFloor(state.rebirths);
}

/**
 * Rebirth: start over from Floor 1 with permanently more luck, gold and stats, and new classes to
 * roll. Gold, upgrades, every knight (with its levels and its extras), perks and sigils go: no knight
 * ever comes through. The Codex, records and settings stay.
 */
export function rebirth(state: GameState): boolean {
  if (!canRebirth(state)) return false;
  state.rebirths += 1;
  state.gold = 0;
  state.hourglasses = 0;
  state.upgrades = {};
  state.perks = [];
  state.sigils = state.rebirths; // one per rebirth to start each run
  // Extras go with the knights they belong to. They are gold not yet collected (the broker pays what
  // each was locked in at), and a rebirth takes all your gold: cashing them in here would only fill a
  // purse that was just emptied, and carrying them over would bring the last run's prices into a
  // fresh one (no gold ever comes through). So they go the way of the gold, never silently: the
  // Shrine's YOU LOSE list shows how many are waiting and what they'd fetch, while there's still time
  // to sell them and spend it.
  state.roster = {};
  state.squad = [null, null, null];
  state.leftEmpty = [false, false, false];
  state.controlled = 0;
  state.potionEndsAt = null;
  // The deck of floor designs carries on through the rebirth (no design comes round early).
  const { designDeck, lastDesign } = state.run;
  state.run = { floor: 1, bestFloor: 1, bosses: 0, checkpoint: 1, biomeSeed: Rng.hashSeed(state.seed ^ (state.rebirths * 7919)), deaths: 0, designDeck, lastDesign, visits: 0 };
  state.stats.killsThisRun = 0;
  // No gold comes through: not as time away paid at the last run's fight rate, nor as a job taken at
  // the last run's depth and handed in on floor 1.
  state.stats.goldPerMinute = 0;
  state.stats.goldWindow = [];
  state.stats.combatPerMinute = 0;
  state.stats.combatWindow = [];
  state.quests = [];
  state.roll.current = null;
  state.roll.timer = 0;
  state.roll.sinceLucky = 0;
  state.roll.dry = 0;
  // A new run warms up with three quick spins so the squad fills straight away (no knight ever comes
  // through a rebirth: every run is rolled fresh).
  state.roll.tutorial = 'rewarm';
  state.roll.spinCount = 0;
  return true;
}
