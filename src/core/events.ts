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
  /** The squad stepped into a floor's open portal: it swirls in, and the next floor follows. */
  | { type: 'warp'; floor: number }
  | { type: 'bossDown'; floor: number; first: boolean }
  /** A checkpoint floor (every 10th) reached: a wipe from here on comes back to it. */
  | { type: 'checkpoint'; floor: number }
  /** A ware bought off a merchant's display (core/runItems.ts). */
  | { type: 'bought'; item: import('./runItems').RunItemId; price: number }
  /** A ware taken off a merchant's display without paying (world/thief.ts); `first`: the theft that turned her on you. */
  | { type: 'stolen'; item: import('./runItems').RunItemId; first: boolean }
  /** The merchant you stole from comes for you: fought like a boss. */
  | { type: 'merchantFury'; name: string }
  /** She's beaten: what's left on her stall is yours. */
  | { type: 'merchantDown'; name: string }
  | { type: 'wipe'; floor: number; back: number }
  /** Left for camp: the run steps back from `from` to `back` (core/newGame.ts campFloor), and the `revived` knights who had fallen are up again. */
  | { type: 'camp'; from: number; back: number; revived: number }
  /**
   * A natural pause between two stretches of play, with the screen black: the squad has just left a
   * boss floor through its portal ('boss'), or been carried back to the hub after a wipe ('wipe').
   * Where a portal may show an ad (ui/App.tsx); the game does nothing with it itself.
   */
  | { type: 'break'; kind: 'boss' | 'wipe' }
  | { type: 'rebirth'; count: number }
  /** This run just reached the floor a rebirth needs (once a run). */
  | { type: 'rebirthReady'; next: number }
  /** A knight's dodge roll made something miss it (once per roll); `mine`: the knight you control. */
  | { type: 'perfectRoll'; mine: boolean }
  /** A knight's swing cut a foe's shot out of the air, at (x, y) on the floor (`reflect`: sent back; `mine`: your knight's). */
  | { type: 'clink'; x: number; y: number; reflect: boolean; mine: boolean }
  | { type: 'toast'; text: string; tone?: 'good' | 'bad' | 'info' | 'gold' };

export type EventSink = (e: CoreEvent) => void;
