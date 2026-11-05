/**
 * The Dungeon's props, drawn from the supplied packs (dungeonArt.ts): torches on the walls and the
 * side walls, the red shield banner and the tall banners, rings, cell doors, cobwebs in the corners,
 * barrels, crates, pots, chests, casks, cabinets, armor, pedestals, candles and candlesticks, flasks,
 * coins, a sword, rubble and bones. Animated ones (flames, the banner, flasks, coins) carry their
 * frames; flames carry their glow (the same pixels again, for the light-emitting layer) and a light.
 *
 * Where a prop sits (world/dungeonDecor.ts): wall things stand on a wall's face tile, their base the
 * face's bottom row, drawn where the pack draws them in its own tile; floor things stand on a tile
 * like every other prop (their base 2 px above the prop's foot point). Variants come from the seed:
 * a side torch's seed says which wall it leans out of, a cobweb's which corner it fills.
 */
import type { Biome, DungeonPropKind, PropKind } from '../../world/biomes';
import { blank, flipX } from '../pixel/buf';
import { frameBuf } from '../pixel/indexed';
import type { PropArt } from '../art/props';
import { DUNGEON_SPRITES, type DungeonSprite } from './dungeonArt';

const DUNGEON_KINDS: ReadonlySet<string> = new Set<DungeonPropKind>([
  'wallBanner', 'hangingBanner', 'wallRing', 'cellDoor', 'blueDoor', 'sideTorch', 'cobweb', 'chest', 'candles', 'candlestick', 'flask',
  'pedestal', 'armor', 'dragonSkull', 'cabinet', 'rubble', 'coins', 'sword',
]);

/** Is this one of the dungeon's own prop kinds? */
export function isDungeonProp(kind: PropKind): kind is DungeonPropKind {
  return DUNGEON_KINDS.has(kind);
}

/** Flame colors in the packs' lights (their glow is drawn again on the light-emitting layer). */
const FLAME = new Set(['#bc4c51', '#d1851e', '#ffd569', '#ea4f36', '#f57d4a', '#f9c22b']);

interface Look {
  sprite: DungeonSprite;
  /** Drawn at (x - ax, y - ay) from the prop's point (in the drawn, maybe flipped, sprite). */
  ax: number;
  ay: number;
  flip?: boolean;
  light?: PropArt['light'];
  glow?: boolean;
}

const cache = new Map<string, PropArt>();

function art(l: Look): PropArt {
  const key = `${l.sprite}|${l.ax}|${l.ay}|${l.flip ? 1 : 0}|${l.light?.color ?? ''}`;
  let a = cache.get(key);
  if (a) return a;
  const sheet = DUNGEON_SPRITES[l.sprite];
  const seq = sheet.anims.idle.frames;
  const frames = seq.map((i) => {
    const b = frameBuf(sheet, i);
    return l.flip ? flipX(b) : b;
  });
  const glow = l.glow
    ? frames.map((b) => {
        const g = blank(b.w, b.h);
        for (let i = 0; i < b.px.length; i += 4) {
          if (!b.px[i + 3]) continue;
          const hex = `#${[b.px[i], b.px[i + 1], b.px[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
          if (FLAME.has(hex)) g.px.set(b.px.subarray(i, i + 4), i);
        }
        return g;
      })
    : undefined;
  a = {
    buf: frames[0],
    ax: l.ax,
    ay: l.ay,
    ...(frames.length > 1 ? { frames, fps: sheet.anims.idle.fps } : {}),
    ...(glow ? { glow } : {}),
    ...(l.light ? { light: l.light } : {}),
  };
  cache.set(key, a);
  return a;
}

/** A floor thing: its base 2 px above the prop's foot point, centered. */
function floor(sprite: DungeonSprite, light?: PropArt['light'], glow = false): Look {
  const s = DUNGEON_SPRITES[sprite];
  return { sprite, ax: Math.floor(s.w / 2), ay: s.h + 1, light, glow };
}

function pick<T>(seed: number, list: readonly T[]): T {
  let h = Math.imul(seed ^ 0x5bd1e995, 0x45d9f3b);
  h ^= h >>> 15;
  return list[(h >>> 0) % list.length];
}

/** The variant the decor asked for (it sets a prop's seed % 5); propArt gets (seed % 5) * 104729 + 7. */
function variant(seed: number): number {
  return Math.round((seed - 7) / 104729) % 5;
}

/**
 * The pack art for a prop in the dungeon: its own kinds always, the shared ones (torches, braziers,
 * barrels, crates, pots, bones and skulls) when the floor is the dungeon's. Null: not a pack prop.
 */
export function dungeonPropArt(kind: PropKind, biome: Biome, seed: number): PropArt | null {
  const fire = biome.light.fire;
  const v = variant(seed);
  switch (kind) {
    // --- on the walls
    case 'torch':
      // The pack's wall torch, on the face tile where the pack draws it.
      return art({ sprite: 'torch', ax: 8, ay: 15, light: { dx: 0, dy: -10, color: fire, r: 66, flicker: true }, glow: true });
    case 'sideTorch':
      // Leaning out of a side wall's rim: odd variants hang on a wall with the floor to its west.
      return v % 2
        ? art({ sprite: 'sideTorch', ax: 17, ay: 15, flip: true, light: { dx: -2, dy: -10, color: fire, r: 58, flicker: true }, glow: true })
        : art({ sprite: 'sideTorch', ax: -2, ay: 15, light: { dx: 6, dy: -10, color: fire, r: 58, flicker: true }, glow: true });
    case 'wallBanner':
      return art({ sprite: v % 2 ? 'flag' : 'banner', ax: 8, ay: 15 });
    case 'hangingBanner':
      return art({ sprite: pick(seed, ['bannerRed', 'bannerBlue', 'bannerRed'] as const), ax: 11, ay: 33 });
    case 'wallRing':
      return art({ sprite: v % 2 ? 'ring' : 'hook', ax: 8, ay: 15 });
    case 'cellDoor':
      return art({ sprite: v % 2 ? 'archDoor' : 'door', ax: 16, ay: 15 });
    case 'blueDoor':
      return art({ sprite: v % 2 ? 'blueDoorway' : 'blueDoor', ax: 16, ay: 45 });
    case 'cobweb':
      // In the floor tile's corner by the walls: 0, 3 top left; 1, 2 top right (flat on the floor).
      return v === 0 || v === 4 ? art({ sprite: 'cobweb', ax: 8, ay: 0 }) : v === 1 ? art({ sprite: 'cobweb', ax: 8, ay: 0, flip: true }) : v === 2 ? art({ sprite: 'cobwebSmall', ax: 8, ay: 0 }) : art({ sprite: 'cobwebSmall', ax: 8, ay: 0, flip: true });
    // --- on the floor
    case 'brazier':
      return art(floor('candlestick2', { dx: 0, dy: -15, color: fire, r: 62, flicker: true }, true));
    case 'candlestick':
      return art(floor(pick(seed, ['candlestick', 'candlestick2'] as const), { dx: 0, dy: -13, color: fire, r: 46, flicker: true }, true));
    case 'candles':
      return art(floor(pick(seed, ['candlesBlue', 'candlesPurple', 'candlesWhite'] as const), { dx: 0, dy: -11, color: '#ffb05a', r: 40, flicker: true }, true));
    case 'barrel':
      return art(floor('barrel'));
    case 'crate':
      return art(floor(pick(seed, ['box', 'box2', 'miniBox', 'miniBox2', 'box'] as const)));
    case 'pot':
      return art(floor(pick(seed, ['pot', 'pots', 'pots2', 'pot'] as const)));
    case 'chest':
      return art(floor(pick(seed, ['chest', 'miniChest', 'chest'] as const)));
    case 'cabinet':
      return art(floor('cabinet'));
    case 'armor':
      return art(floor(pick(seed, ['armor', 'armor2'] as const)));
    case 'pedestal':
      return art(floor(pick(seed, ['pedestal', 'pedestalRed', 'pedestalBlue'] as const)));
    case 'dragonSkull':
      return art(floor(pick(seed, ['dragonSkull', 'skullBig'] as const)));
    case 'flask':
      return art(floor(pick(seed, ['flask1', 'flask2', 'flask3', 'flask4'] as const)));
    case 'coins':
      return art(floor('coin'));
    case 'sword':
      return art(floor('sword'));
    case 'rubble':
      return art(floor(pick(seed, ['rubble', 'rubbleSmall'] as const)));
    case 'bones':
      return art(floor('bones'));
    case 'skull':
      return art(floor('skullBone'));
    default:
      return null;
  }
}
