/** What the core tells the screen and the speakers about. */
import type { Rarity } from './rarity';
import type { MutationId, RollDrama, Spin } from './state';
import type { AddResult } from './roster';

export type CoreEvent =
  | { type: 'spinStart'; spin: Spin }
  | {
      type: 'land';
      spinId: number;
      reel: number;
      knightId: string;
      rarity: Rarity;
      mutation: MutationId | null;
      oneIn: number;
      mult: number;
      drama: RollDrama | null;
      result: AddResult;
      newRecord: boolean;
      scripted?: 'warmup';
    }
  | { type: 'token'; spinId: number; reel: number; value: number; total: number; combo: boolean }
  | { type: 'potion'; seconds: number }
  | { type: 'gold'; amount: number; x?: number; y?: number }
  | { type: 'floorStart'; floor: number; biome: string; boss: boolean }
  /** Your knight walked down the hub's steps: the dungeon is next. */
  | { type: 'descend' }
  | { type: 'floorClear'; floor: number }
  /** A boss floor's way down opened: its boss fell. */
  | { type: 'portalOpen'; floor: number }
  | { type: 'bossDown'; floor: number; first: boolean }
  | { type: 'wipe'; floor: number; back: number }
  | { type: 'rebirth'; count: number }
  /** A knight's dodge roll made something miss it (once per roll); `mine`: the knight you control. */
  | { type: 'perfectRoll'; mine: boolean }
  | { type: 'toast'; text: string; tone?: 'good' | 'bad' | 'info' | 'gold' };

export type EventSink = (e: CoreEvent) => void;
