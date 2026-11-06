/**
 * The saved game. Everything the player keeps lives here; the dungeon floor itself (map, mobs,
 * projectiles) is rebuilt from `run` when the game loads.
 */
import type { ClassId } from './knights';
import type { Quest } from './quests';
import type { Rarity } from './rarity';
import type { TutorialSave } from './tutorial';

export type MutationId = 'gilded' | 'shadow' | 'radiant' | 'void';
export const MUTATIONS: MutationId[] = ['gilded', 'shadow', 'radiant', 'void'];

export interface KnightRec {
  id: string;
  level: number;
  /** The best mutation this knight has rolled with. */
  mutation: MutationId | null;
  /** Copies rolled in total (this run). */
  copies: number;
  /** When it was first rolled (play time, ms). */
  firstAt: number;
  /**
   * When it was first rolled by the wall clock (Date.now(), ms): the roster tags it NEW for 30
   * seconds after. Knights from saves older than this field have none, so they're never NEW.
   */
  gotAt?: number;
  /** Times the smith has reforged it (each costs more). */
  reforges?: number;
}

/** One reel's result for the current spin. */
export interface ReelResult {
  knightId: string;
  rarity: Rarity;
  cls: ClassId;
  mutation: MutationId | null;
  /** Luck tokens this reel landed before its knight, in order. */
  tokens: number[];
  /** Seconds into the spin when this reel lands. */
  landAt: number;
  landed: boolean;
  /** "1 in X" at luck 1 for its tier and mutation. */
  oneIn: number;
  drama: RollDrama | null;
  /** A quick spin of the start (an ordinary roll, rolled faster). */
  scripted?: 'warmup';
}

export type RollDrama = 'big' | 'huge' | 'insane' | 'hyper';

export interface Spin {
  id: number;
  reels: ReelResult[];
  /** Token steps where two or more reels landed a token together (combos). */
  combos: number[];
  lucky: boolean;
  golden: boolean;
  rigged: boolean;
  turbo: boolean;
  luck: number;
  spinSeconds: number;
  baseSpinSeconds: number;
  stepSeconds: number;
  restSeconds: number;
  /** 0 none, 1 or 2: how much the spin builds up (riser and glow). */
  tease: 0 | 1 | 2;
  landed: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  createdAt: number;
  savedAt: number;
  /** Total play time with the game open (ms). */
  playTimeMs: number;

  gold: number;
  /** Turbo spins waiting (each makes one spin run faster). */
  hourglasses: number;
  /** Perk points (from the first rebirth on): one per boss beaten for the first time in a run. */
  sigils: number;
  potionEndsAt: number | null;

  roster: Record<string, KnightRec>;
  /** Three squad slots (knight ids) and which one you control. */
  squad: Array<string | null>;
  /**
   * Squad slots you emptied on purpose (going down short-handed pays more gold): the hub doesn't
   * fill them again until you put someone in (or BEST SQUAD).
   */
  leftEmpty?: boolean[];
  controlled: number;

  upgrades: Record<string, number>;
  perks: string[];
  rebirths: number;
  /** Perk: Heirloom keeps this knight through the next rebirth. */

  roll: {
    count: number;
    spinCount: number;
    sinceLucky: number;
    /** Lucky Spins earned (jobs): each makes one of the next spins Lucky. */
    bankedLucky?: number;
    dry: number;
    timer: number;
    current: Spin | null;
    /** Big-reveal history: [play time ms, find score], rarest first. */
    hist: Array<[number, number]>;
    best: number;
    since: number | null;
    /** The start (and after a rebirth): quick ordinary spins until the squad is full, then ordinary play. */
    tutorial: 'warmup' | 'done' | 'rewarm';
    nextSpinId: number;
  };

  run: {
    floor: number;
    bestFloor: number;
    /** The player has been told this run can rebirth now (the alert comes once a run). */
    rebirthTold?: boolean;
    /** Bosses beaten this run (depth luck, sigils). */
    bosses: number;
    /** First floor of the current biome stretch: where a wiped squad starts again. */
    checkpoint: number;
    /** What you bought from merchants this run (core/runItems.ts): gone when you head back to camp. */
    items?: Partial<Record<import('./runItems').RunItemId, number>>;
    biomeSeed: number;
    deaths: number;
    /**
     * The deck of floor designs (core/deck.ts): those still to deal, next first. Every floor entered
     * takes the top one; an empty deck is shuffled anew.
     */
    designDeck: string[];
    /** The design the last floor was built to (a fresh deck never opens with it). */
    lastDesign: string | null;
    /** Floors entered this run, every return to one counted: part of each floor's seed, so a floor
     * you come back to is a new map. */
    visits: number;
  };

  codex: Record<string, { count: number; best: MutationId | null; firstAt: number }>;
  records: { bestOneIn: number; bestName: string | null; bestFloorEver: number; kills: number; spins: number };
  stats: {
    killsThisRun: number;
    goldPerMinute: number;
    goldWindow: Array<[number, number]>;
    /** Gold picked up in fights, all told; its last ten minutes' rate is what pays while you're away. */
    combatGold?: number;
    combatWindow?: Array<[number, number]>;
    combatPerMinute?: number;
  };

  settings: {
    sfx: number;
    music: number;
    /** Auto attack: your knight aims and attacks by itself (you still move and dodge). */
    autoPlay: boolean;
    reduceMotion: boolean;
    showDamage: boolean;
    /** Tilt-shift: the ground far past your knight goes soft, like a miniature. */
    tiltShift: boolean;
  };
  seen: {
    tutorialHints: string[];
    perksIntro: boolean;
    /** The first-boot tutorial (core/tutorial.ts): its steps done, its tips shown, or skipped. */
    tutorial: TutorialSave;
  };
  /** NPC jobs taken (three active at most; see core/quests.ts). */
  quests: Quest[];
}

/** 2: the run keeps a deck of floor designs (designDeck, lastDesign) and counts floor visits. */
export const SAVE_VERSION = 2;
