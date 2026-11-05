/**
 * The saved game. Everything the player keeps lives here; the dungeon floor itself (map, mobs,
 * projectiles) is rebuilt from `run` when the game loads.
 */
import type { ClassId } from './knights';
import type { Rarity } from './rarity';

export type MutationId = 'gilded' | 'shadow' | 'radiant' | 'void';
export const MUTATIONS: MutationId[] = ['gilded', 'shadow', 'radiant', 'void'];

export type DupeRule = 'keep' | 'shard' | 'sell';

export interface KnightRec {
  id: string;
  level: number;
  shards: number;
  /** Duplicate copies waiting to be sold or broken into shards. */
  dupes: number;
  /** The best mutation this knight has rolled with. */
  mutation: MutationId | null;
  /** Copies rolled in total (this run). */
  copies: number;
  /** When it was first rolled (play time, ms). */
  firstAt: number;
  /** Not yet looked at in the Knights tab. */
  isNew: boolean;
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
  /** Beginner's luck and the tutorial's scripted finds are labeled. */
  scripted?: 'warmup' | 'first' | 'beginner';
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
  controlled: number;
  dupeRules: Record<Rarity, DupeRule>;

  upgrades: Record<string, number>;
  perks: string[];
  rebirths: number;
  /** Perk: Heirloom keeps this knight through the next rebirth. */
  heirloom: string | null;

  roll: {
    count: number;
    spinCount: number;
    sinceLucky: number;
    dry: number;
    timer: number;
    current: Spin | null;
    /** Big-reveal history: [play time ms, find score], rarest first. */
    hist: Array<[number, number]>;
    best: number;
    since: number | null;
    /** The tutorial: warm-up spins, the first Legendary, then beginner's luck. */
    tutorial: 'warmup' | 'first' | 'beginner' | 'done' | 'rewarm';
    beginnerAt: number | null;
    nextSpinId: number;
  };

  run: {
    floor: number;
    bestFloor: number;
    /** Bosses beaten this run (depth luck, sigils). */
    bosses: number;
    /** First floor of the current biome stretch: where a wiped squad starts again. */
    checkpoint: number;
    biomeSeed: number;
    deaths: number;
  };

  codex: Record<string, { count: number; best: MutationId | null; firstAt: number }>;
  records: { bestOneIn: number; bestName: string | null; bestFloorEver: number; kills: number; spins: number };
  stats: { killsThisRun: number; goldPerMinute: number; goldWindow: Array<[number, number]> };

  settings: {
    sfx: number;
    music: number;
    autoPlay: boolean;
    reduceMotion: boolean;
    showDamage: boolean;
    /** Tilt-shift: the ground far past your knight goes soft, like a miniature. */
    tiltShift: boolean;
  };
  seen: { tutorialHints: string[]; perksIntro: boolean };
}

export const SAVE_VERSION = 1;
