/**
 * How a trap looks at a moment (world/traps.ts says which frame): the pack art cut into what lies on
 * the floor (the spikes' holes, a flat plate, the vent's grate, the saw's slot, drawn before anyone
 * standing) and what stands up (the flame, the saw blade, a plate on its edge, sorted with everyone
 * by the row it stands on). Flames are drawn again on the light-emitting layer.
 */
import type { PixelBuf } from '../pixel/buf';
import { blank } from '../pixel/buf';
import { frameBuf } from '../pixel/indexed';
import { trapPhase, type Trap } from '../../world/traps';
import { DUNGEON_SPRITES, type DungeonSprite } from './dungeonArt';

export interface TrapPiece {
  /** Names the pixels (for the renderer's canvas cache). */
  key: string;
  buf: PixelBuf;
  /** World pixels: the sprite's top left. */
  x: number;
  y: number;
  /** Lies on the floor (drawn under everyone), or stands (sorted by `base`). */
  flat: boolean;
  base: number;
  /** Bright pixels that also go on the light-emitting layer. */
  glow?: { key: string; buf: PixelBuf };
}

const frames = new Map<string, PixelBuf>();

function frame(name: DungeonSprite, i: number): PixelBuf {
  const key = `${name}|${i}`;
  let b = frames.get(key);
  if (!b) {
    const s = DUNGEON_SPRITES[name];
    b = frameBuf(s, s.anims.idle.frames[i]);
    frames.set(key, b);
  }
  return b;
}

const FLAME_MIN = 200;

/** The vent's flame pixels (bright and warm), for the glow. */
function flameOf(i: number): PixelBuf {
  const key = `vent-glow|${i}`;
  let g = frames.get(key);
  if (!g) {
    const b = frame('vent', i);
    g = blank(b.w, b.h);
    for (let k = 0; k < b.px.length; k += 4) {
      if (b.px[k + 3] && b.px[k] > FLAME_MIN && b.px[k] > b.px[k + 2] + 60) g.px.set(b.px.subarray(k, k + 4), k);
    }
    frames.set(key, g);
  }
  return g;
}

/** What a trap shows at world time `t`. */
export function trapPieces(tr: Pick<Trap, 'kind' | 'x' | 'y' | 'phase' | 'reach' | 'armedAt'>, t: number): TrapPiece[] {
  const ph = trapPhase(tr, t);
  const x = tr.x - 8;
  switch (tr.kind) {
    case 'spikes':
      return [{ key: `spikes|${ph.frame}`, buf: frame('spikes', ph.frame), x, y: tr.y - 8, flat: ph.frame >= 2, base: tr.y + 4 }];
    case 'vent': {
      // The grate sits on the tile (its bottom row 6 px below the middle); the flame rises from it.
      const piece: TrapPiece = { key: `vent|${ph.frame}`, buf: frame('vent', ph.frame), x, y: tr.y + 6 - 63, flat: ph.frame === 0, base: tr.y + 6 };
      if (ph.frame >= 2 && ph.frame <= 7) piece.glow = { key: `vent-glow|${ph.frame}`, buf: flameOf(ph.frame) };
      return [piece];
    }
    case 'saw': {
      const track = frame('sawTrack', 0);
      const disc = frame('saw', ph.frame);
      const sx = tr.x + (ph.offset ?? 0);
      return [
        { key: 'sawTrack', buf: track, x: tr.x - Math.floor(track.w / 2), y: tr.y - 2, flat: true, base: tr.y },
        { key: `saw|${ph.frame}`, buf: disc, x: sx - Math.floor(disc.w / 2), y: tr.y + 2 - disc.h, flat: false, base: tr.y + 2 },
      ];
    }
    case 'plate': {
      const upright = ph.frame !== 0 && ph.frame !== 4;
      return [{ key: `plate|${ph.frame}`, buf: frame('plate', ph.frame), x, y: tr.y + 8 - 24, flat: !upright, base: tr.y + 7 }];
    }
  }
}
