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
      scripted?: 'warmup' | 'first' | 'beginner';
    }
  | { type: 'token'; spinId: number; reel: number; value: number; total: number; combo: boolean }
  | { type: 'potion'; seconds: number }
  | { type: 'gold'; amount: number; x?: number; y?: number }
  | { type: 'floorStart'; floor: number; biome: string; boss: boolean }
  | { type: 'floorClear'; floor: number }
  | { type: 'bossDown'; floor: number; first: boolean }
  | { type: 'wipe'; floor: number; back: number }
  | { type: 'rebirth'; count: number }
  | { type: 'toast'; text: string; tone?: 'good' | 'bad' | 'info' | 'gold' };

export type EventSink = (e: CoreEvent) => void;
