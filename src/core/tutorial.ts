/**
 * The tutorial: the first time the game is played, one short line at a time walks you through it,
 * each with a pointer on the one thing it's about (a button, a keeper, the door, a foe), and each one
 * done when you've done that thing, never on a "Next". In the order a new player meets them:
 *
 *  - seal:    a new game opens on the Oracle's altar, sealed: break the seal to summon;
 *  - altar:   your first knight lands at the Oracle's altar: close it;
 *  - move:    walk (drag on a phone; WASD or the arrows on a computer);
 *  - talk:    walk up to Warden Tobb and open his counter (he keeps your squad);
 *  - descend: DESCEND at his counter (or walk down the steps);
 *  - attack:  with a foe close, attack;
 *  - skills:  your knight's skills roll and cast on their own (the line stays up a few seconds);
 *  - exit:    the door to the next floor;
 *  - auto:    auto battle: tap AUTO and your knight fights and goes down on its own; once it's on,
 *             how to take over (steer or attack); the line goes after a while either way;
 *  - camp:    once there's gold enough to level your knight up, head back up;
 *  - spend:   level a knight up at Warden Tobb's counter.
 *
 * Each step waits for the one before it (TUT_AFTER) and shows when its moment comes: the line on the
 * screen is the first step not done whose moment is now. So a fight that ends before a skill rolls
 * doesn't hold up the door: the skills line waits for the next fight. A step the player gets past on
 * their own (walking down the steps without asking the warden) is done as they pass it.
 *
 * After that, a single one-off tip the first time each later thing comes up: a merchant on a floor,
 * the first checkpoint, rebirth (stronger for good), going down short-handed, auto battle.
 *
 * One line at a time, and none while something else has the screen. A new game gets it; a save from
 * before it with any progress behind it (knights, gold, floors) never does (core/save.ts). Skipping
 * turns it all off; Settings plays it again. It never pauses or blocks anything.
 *
 * Pure logic, for the tests: the screen (ui/Tutorial.tsx) says where the player is and what they did
 * (TutCtx, tutorialDid), and draws the line that comes back (tutorialView).
 */
import { BAL } from './balance';

export const TUT_STEPS = ['seal', 'altar', 'move', 'talk', 'descend', 'attack', 'skills', 'exit', 'auto', 'camp', 'spend'] as const;
export type TutStepId = (typeof TUT_STEPS)[number];
export const TUT_TIPS = ['shop', 'checkpoint', 'rebirth', 'solo', 'auto'] as const;
export type TutTipId = (typeof TUT_TIPS)[number];

/** The step each one waits for: it never shows before that one's done. */
export const TUT_AFTER: Record<TutStepId, TutStepId | null> = {
  seal: null,
  altar: 'seal',
  move: 'altar',
  talk: 'move',
  descend: 'talk',
  attack: 'descend',
  skills: 'attack',
  exit: 'attack',
  auto: 'exit',
  camp: 'exit',
  spend: 'camp',
};

/** What the save keeps (GameState.seen.tutorial). */
export interface TutorialSave {
  /** Steps done, in the order they were done. */
  done: TutStepId[];
  /** One-off tips already shown (each shows once, ever). */
  tips: TutTipId[];
  /** Skipped (or a save from before the tutorial): nothing shows, tips included. */
  skipped: boolean;
}

/** Where the player is, as the tutorial sees it. */
export type TutWhere =
  /** At the hub, the Oracle's altar open. */
  | 'altar'
  /** At the hub, Warden Tobb's counter open. */
  | 'warden'
  /** At the hub, another keeper's counter open. */
  | 'keeper'
  /** Choosing who to play as. */
  | 'select'
  /** Walking round the hub. */
  | 'hub'
  /** On a floor of the dungeon. */
  | 'dungeon'
  /** Something else has the screen (a reveal, a sheet, a talk, a fade, a floor's banner, a wipe). */
  | 'busy';

/** What the screen knows right now. */
export interface TutCtx {
  where: TutWhere;
  /** A touch screen: the lines say tap and drag rather than click and keys. */
  touch: boolean;
  /** Someone in the squad (there's a knight to play). */
  hasKnight: boolean;
  /** The altar is still sealed (a new game, before its first summon). */
  sealed: boolean;
  /** At the hub, standing by Warden Tobb (his button is up). */
  nearWarden: boolean;
  /** Gold enough to level up the knight you play. */
  canLevel: boolean;
  /** At Warden Tobb's counter: the LEVEL UP of the knight you play is on it (his SQUAD tab is open). */
  levelShown: boolean;
  /** In the dungeon: an awake foe close to your knight. */
  foeNear: boolean;
  /** Your knight's skill reel is spinning. */
  rolling: boolean;
  /** Seconds since your knight last cast a skill (Infinity: not lately). */
  castAgo: number;
  /** The floor's door is open (a boss floor's opens when its boss falls). */
  exitOpen: boolean;
  /** The floor's door is on the screen. */
  doorInView: boolean;
  /** The floor you're on (or going down to). */
  floor: number;
  /** A merchant's wares on the screen. */
  shopInView: boolean;
  /** The first rebirth is open (Sister Maren will do it now). */
  canRebirth: boolean;
  /** Warden Tobb's counter shows the short-handed gold line. */
  soloShown: boolean;
  /** Auto battle is on. */
  autoOn: boolean;
}

/** What a line points at: a part of the screen, or a spot in the world. */
export type TutTarget =
  | { kind: 'ui'; id: 'seal' | 'close' | 'talk' | 'descend' | 'level' | 'squadTab' | 'attack' | 'reel' | 'camp' | 'auto' | 'floor' | 'solo' }
  | { kind: 'world'; id: 'knight' | 'warden' | 'steps' | 'foe' | 'door' | 'shop' | 'shrine' };

/** The line on the screen. */
export interface TutView {
  /** Which line (a step or a tip, and which way of putting it): a new key is a new line. */
  key: string;
  tip: boolean;
  /** The words, the ones to stress in [brackets]. */
  text: string;
  target: TutTarget;
}

/** What the screen remembers between frames (not saved: a reload starts it afresh). */
export interface TutRun {
  /** The line on the screen and when it came up (seconds). */
  key: string | null;
  since: number;
  /** The tip on the screen, when it came up and when it goes at the latest. */
  tip: TutTipId | null;
  tipAt: number;
  tipUntil: number;
  /** No new tip before this (a breather after the last one). */
  restUntil: number;
}

/** Things the player does that finish a step or put a tip away (the screen reports them). */
export type TutAction =
  /** Walked a little way at the hub. */
  | 'moved'
  /** Held attack with a foe close. */
  | 'attacked'
  /** A foe fell. */
  | 'killed'
  /** Went through the door to the next floor. */
  | 'exited'
  /** Levelled a knight up at the hub. */
  | 'leveled'
  /** Bought something off a merchant. */
  | 'bought'
  /** Turned auto battle on. */
  | 'autoOn';

/** Seconds the skills line stays up (it shows as a reel spins; a roll takes 1.8 s to cast). */
export const SKILLS_READ = 4;
/** The skills line comes up this long after a cast too (the fight may be over before the next roll). */
export const SKILLS_LATE = 2;
/** Seconds the auto battle line waits to be tapped, and stays up once it's on (how to take over). */
export const AUTO_ASK = 9;
export const AUTO_READ = 5;
/** Seconds a tip stays up at most, and at least (unless the player leaves for somewhere else). */
export const TIP_SECONDS = 7;
export const TIP_MIN = 2.5;
/** Seconds after a tip before the next one. */
export const TIP_REST = 2;

export function freshTutorial(): TutorialSave {
  return { done: [], tips: [], skipped: false };
}

export function newTutRun(): TutRun {
  return { key: null, since: 0, tip: null, tipAt: 0, tipUntil: 0, restUntil: 0 };
}

const isStep = (x: unknown): x is TutStepId => typeof x === 'string' && (TUT_STEPS as readonly string[]).includes(x);
const isTip = (x: unknown): x is TutTipId => typeof x === 'string' && (TUT_TIPS as readonly string[]).includes(x);

/** The parts of a save that show whether anything has happened in it. */
export interface ProgressOf {
  roster?: Record<string, unknown>;
  codex?: Record<string, unknown>;
  gold?: number;
  rebirths?: number;
  records?: { spins?: number; kills?: number; bestFloorEver?: number };
  run?: { bestFloor?: number };
}

/** Anything behind a save: a knight rolled, gold, a foe beaten, a floor past the first, a rebirth. */
export function hasProgress(s: ProgressOf): boolean {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const keys = (o: unknown) => (o && typeof o === 'object' ? Object.keys(o).length : 0);
  return (
    keys(s.roster) > 0 ||
    keys(s.codex) > 0 ||
    n(s.gold) > 0 ||
    n(s.rebirths) > 0 ||
    n(s.records?.spins) > 0 ||
    n(s.records?.kills) > 0 ||
    n(s.records?.bestFloorEver) > 1 ||
    n(s.run?.bestFloor) > 1
  );
}

/**
 * The tutorial a loaded save goes on with: its own, cleaned up; or, for a save from before there was
 * one, none at all if anything has happened in it (a player with progress never gets it out of the
 * blue), and a fresh one if not.
 */
export function mendTutorial(raw: unknown, save: ProgressOf): TutorialSave {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return hasProgress(save) ? { done: [], tips: [], skipped: true } : freshTutorial();
  const r = raw as { done?: unknown; tips?: unknown; skipped?: unknown };
  return {
    done: [...new Set(Array.isArray(r.done) ? r.done.filter(isStep) : [])],
    tips: [...new Set(Array.isArray(r.tips) ? r.tips.filter(isTip) : [])],
    skipped: r.skipped === true,
  };
}

/** The first step not done yet (null: the walk-through is over). */
export function currentStep(t: TutorialSave): TutStepId | null {
  return TUT_STEPS.find((s) => !t.done.includes(s)) ?? null;
}

/** Still something to show: steps left or tips to come, and not skipped. */
export function tutorialOn(t: TutorialSave): boolean {
  return !t.skipped && (currentStep(t) !== null || t.tips.length < TUT_TIPS.length);
}

export function skipTutorial(t: TutorialSave): void {
  t.skipped = true;
}

/** From the top again (Settings): every step and tip to come. */
export function restartTutorial(t: TutorialSave): void {
  t.done = [];
  t.tips = [];
  t.skipped = false;
}

/** Floors where the run is saved (a wipe past them comes back to them): every 10th. */
function isCheckpoint(floor: number): boolean {
  const k = BAL.dungeon.checkpointEvery;
  return floor >= k && floor % k === 0;
}

const AT_HUB: readonly TutWhere[] = ['hub', 'warden', 'keeper'];

/** The step is behind the player now: they did it, or went on past it. */
function settled(step: TutStepId, ctx: TutCtx, run: TutRun, now: number): boolean {
  const w = ctx.where;
  switch (step) {
    case 'seal':
      return !ctx.sealed;
    case 'altar':
      return ctx.hasKnight && w !== 'altar' && w !== 'busy';
    case 'move':
      return w === 'dungeon' || w === 'warden';
    case 'talk':
      return w === 'warden' || w === 'dungeon';
    case 'descend':
      return w === 'dungeon';
    case 'attack':
      // Auto battle fights for you.
      return w === 'dungeon' && ctx.autoOn;
    case 'skills':
      return run.key === 'skills' && now - run.since >= SKILLS_READ;
    case 'auto':
      // Read once it's on (how to take over), or let be: the line asks for a while, then goes.
      return (run.key === 'auto:on' && now - run.since >= AUTO_READ) || (run.key === 'auto:ask' && now - run.since >= AUTO_ASK);
    case 'camp':
      // Back up with gold to spend (whichever way: CAMP, or a wipe).
      return ctx.canLevel && AT_HUB.includes(w);
    default:
      return false;
  }
}

const ui = (id: Extract<TutTarget, { kind: 'ui' }>['id']): TutTarget => ({ kind: 'ui', id });
const world = (id: Extract<TutTarget, { kind: 'world' }>['id']): TutTarget => ({ kind: 'world', id });
const line = (key: string, text: string, target: TutTarget, tip = false): TutView => ({ key, text, target, tip });

/** The step's line for where the player is (null: it waits for a moment it fits). */
function stepView(step: TutStepId, ctx: TutCtx, run: TutRun): TutView | null {
  const { where, touch } = ctx;
  switch (step) {
    case 'seal':
      // (The Oracle, over her sealed altar.)
      return where === 'altar' && ctx.sealed ? line('seal', touch ? 'Tap the [seal] to summon your first knight!' : 'Click the [seal] to summon your first knight!', ui('seal')) : null;
    case 'altar':
      return where === 'altar' && ctx.hasKnight ? line('altar', 'Your first knight! Now close the altar.', ui('close')) : null;
    case 'move':
      return where === 'hub' ? line('move', touch ? 'Drag anywhere to walk.' : 'Walk with [WASD] or the arrows.', world('knight')) : null;
    case 'talk':
      if (where !== 'hub') return null;
      // (His button at the hub says SQUAD: it opens his counter, where your squad is and DESCEND goes down.)
      return ctx.nearWarden
        ? line('talk:open', touch ? 'Tap [SQUAD] to see your squad.' : 'Press [E] to see your squad.', ui('talk'))
        : line('talk:walk', 'Walk up to [Warden Tobb].', world('warden'));
    case 'descend':
      if (where === 'warden') return line('descend:warden', touch ? 'Your squad is set. Tap [DESCEND]!' : 'Your squad is set. Click [DESCEND]!', ui('descend'));
      return where === 'hub' ? line('descend:steps', 'Walk down the [steps].', world('steps')) : null;
    case 'attack':
      if (where !== 'dungeon' || !ctx.foeNear || ctx.autoOn) return null;
      return touch ? line('attack', 'Hold [ATTACK] to fight.', ui('attack')) : line('attack', 'Hold [left click] to attack.', world('foe'));
    case 'skills':
      return where === 'dungeon' && (ctx.rolling || ctx.castAgo < SKILLS_LATE || run.key === 'skills') ? line('skills', 'Skills roll and cast on their own!', ui('reel')) : null;
    case 'auto':
      if (where !== 'dungeon') return null;
      if (ctx.autoOn) return line('auto:on', touch ? 'Auto is on! Drag, or hold [ATTACK], to take over.' : 'Auto is on! Move or attack to take over.', ui('auto'));
      return ctx.foeNear && run.key !== 'auto:ask' ? null : line('auto:ask', touch ? 'Tap [AUTO] and your knight plays on its own.' : 'Press [T] for [AUTO]: your knight plays itself.', ui('auto'));
    case 'exit':
      if (where !== 'dungeon' || ctx.foeNear || !ctx.exitOpen) return null;
      return ctx.doorInView ? line('exit:near', 'Step into the [door] to go deeper.', world('door')) : line('exit:far', 'Find the [door] to go deeper.', world('door'));
    case 'camp':
      if (where !== 'dungeon' || !ctx.canLevel || ctx.foeNear) return null;
      return line('camp', touch ? 'Tap [CAMP] to go spend your gold.' : 'Press [Esc] to go spend your gold.', ui('camp'));
    case 'spend':
      if (!ctx.canLevel) return null;
      if (where === 'warden') {
        if (!ctx.levelShown) return line('spend:tab', 'Open the [SQUAD] tab to level up.', ui('squadTab'));
        return line('spend:level', touch ? 'Tap [LEVEL UP] for a stronger knight.' : 'Click [LEVEL UP] for a stronger knight.', ui('level'));
      }
      if (where !== 'hub') return null;
      // The same line all the way to him: walking up, then on his button.
      return line(ctx.nearWarden ? 'spend:open' : 'spend:walk', 'Take your gold to [Warden Tobb].', ctx.nearWarden ? ui('talk') : world('warden'));
  }
}

/** The tips, each for the first time its thing comes up. */
function tipView(tip: TutTipId): TutView {
  switch (tip) {
    case 'shop':
      return line('tip:shop', 'A merchant! Walk up to her wares.', world('shop'), true);
    case 'checkpoint':
      return line('tip:checkpoint', "Checkpoint! If you fall, you'll come back here.", ui('floor'), true);
    case 'rebirth':
      return line('tip:rebirth', '[Rebirth] here: start over stronger, for good!', world('shrine'), true);
    case 'solo':
      return line('tip:solo', 'Fewer knights, more gold!', ui('solo'), true);
    case 'auto':
      return line('tip:auto', '[AUTO] lets your knight fight on its own.', ui('auto'), true);
  }
}

/** Where a tip lives, and whether its moment is here. */
const TIP_WHERE: Record<TutTipId, TutWhere> = { shop: 'dungeon', checkpoint: 'dungeon', rebirth: 'hub', solo: 'warden', auto: 'dungeon' };

function tipMoment(tip: TutTipId, t: TutorialSave, ctx: TutCtx): boolean {
  if (ctx.where !== TIP_WHERE[tip]) return false;
  switch (tip) {
    case 'shop':
      return ctx.shopInView && !ctx.foeNear;
    case 'checkpoint':
      return isCheckpoint(ctx.floor) && !ctx.foeNear;
    case 'rebirth':
      return ctx.canRebirth;
    case 'solo':
      return ctx.soloShown;
    case 'auto':
      return !ctx.autoOn && !ctx.foeNear && ctx.floor >= 3 && currentStep(t) === null;
  }
}

function show(run: TutRun, v: TutView, now: number): TutView {
  if (run.key !== v.key) {
    run.key = v.key;
    run.since = now;
  }
  return v;
}

function none(run: TutRun): null {
  run.key = null;
  return null;
}

/**
 * What to show now (`now` in seconds), or null. Steps the player has got past are marked done on the
 * way; a tip that comes up is marked shown (it never comes again).
 */
export function tutorialView(t: TutorialSave, run: TutRun, ctx: TutCtx, now: number): TutView | null {
  if (t.skipped) {
    run.tip = null;
    return none(run);
  }
  // Steps gone past (in order, so a run of them goes at once: down the steps without a word to the
  // warden). Only a step whose turn has come: gold to spend at the hub before the door's been found
  // isn't "came back up to spend it".
  for (const s of TUT_STEPS) {
    const after = TUT_AFTER[s];
    if (!t.done.includes(s) && (!after || t.done.includes(after)) && settled(s, ctx, run, now)) t.done.push(s);
  }
  // A tip on the screen keeps it for its time (or until the player is somewhere else, or did it).
  if (run.tip) {
    const tip = run.tip;
    const holds = ctx.where === TIP_WHERE[tip] && now < run.tipUntil && (now - run.tipAt < TIP_MIN || tipMoment(tip, t, ctx));
    if (holds) return show(run, tipView(tip), now);
    run.tip = null;
    run.restUntil = now + TIP_REST;
  }
  // The first step not done whose turn has come (the one before it done) and whose moment is now.
  for (const s of TUT_STEPS) {
    if (t.done.includes(s)) continue;
    const after = TUT_AFTER[s];
    if (after && !t.done.includes(after)) continue;
    const v = stepView(s, ctx, run);
    if (v) return show(run, v, now);
  }
  if (now < run.restUntil) return none(run);
  const tip = TUT_TIPS.find((id) => !t.tips.includes(id) && tipMoment(id, t, ctx));
  if (!tip) return none(run);
  t.tips.push(tip);
  run.tip = tip;
  run.tipAt = now;
  run.tipUntil = now + TIP_SECONDS;
  return show(run, tipView(tip), now);
}

/**
 * The player did something: the step it's for is done, whenever they did it (found the door before a
 * fight, levelled up before being told to), and a tip it's for goes.
 */
export function tutorialDid(t: TutorialSave, run: TutRun, action: TutAction): void {
  if (t.skipped) return;
  const finish = (s: TutStepId) => {
    if (!t.done.includes(s)) t.done.push(s);
  };
  switch (action) {
    case 'moved':
      finish('move');
      break;
    case 'attacked':
    case 'killed':
      finish('attack');
      break;
    case 'exited':
      finish('exit');
      break;
    case 'leveled':
      finish('spend');
      break;
    case 'bought':
      if (run.tip === 'shop') run.tipUntil = 0;
      break;
    case 'autoOn':
      if (run.tip === 'auto') run.tipUntil = 0;
      break;
  }
}
