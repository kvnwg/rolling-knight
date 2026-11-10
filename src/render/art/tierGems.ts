/**
 * A little icon for each rarity, 12 x 12, so a tier reads at a glance in a list (the welcome back's
 * tally of what the altar rolled): the commoner tiers are stones and cut gems, each cut grander
 * than the last, and the rare ones are signs of their own:
 *   Common a river pebble, Uncommon an emerald cut, Rare a brilliant, Epic a hexagon,
 *   Legendary a star, Mythic a heart, Ancient a rune tablet, Exalted a ruby shield in gold,
 *   Celestial a four-point star, Astral a crescent moon and its star, Divine a sun,
 *   Eternal a ring, Primordial an egg cracking with light, Absolute a prism splitting light.
 * Drawn in roles (ink, dark, mid, light, shine, white, and gold for settings), coloured from the
 * rarity's own colour, so each sits with the tier's name in its colour.
 */
import { RARITY_COLOR, type Rarity } from '../../core/rarity';
import { mixHex } from './draw';
import { fromRows, type PixelBuf } from '../pixel/buf';

type Rows = readonly string[];

const ICONS: Record<Rarity, Rows> = {
  common: [
    '............',
    '............',
    '............',
    '....kkkkk...',
    '..kkmmmllkk.',
    '.kmmmmmmlhlk',
    '.kdmmmmmmllk',
    '.kddmmmmmmmk',
    '..kdddmmmmk.',
    '...kkkddkk..',
    '......kk....',
    '............',
  ],
  uncommon: [
    '............',
    '...kkkkkk...',
    '..khhllllk..',
    '.khlmmmmmdk.',
    '.klmllllmdk.',
    '.klmlwllmdk.',
    '.klmllllmdk.',
    '.klmllllmdk.',
    '.kdmmmmmmdk.',
    '..kddddddk..',
    '...kkkkkk...',
    '............',
  ],
  rare: [
    '............',
    '...kkkkkk...',
    '..khwllmmk..',
    '.khllllmmdk.',
    'kkkkkkkkkkkk',
    '.kllmmmmddk.',
    '..kllmmddk..',
    '...kllmdk...',
    '....klmk....',
    '.....kk.....',
    '............',
    '............',
  ],
  epic: [
    '....kkkk....',
    '...khllmk...',
    '..khlwllmk..',
    '.khllllmmdk.',
    'khlllllmmmdk',
    'klllllmmmmdk',
    'kmmmmmmmmddk',
    'kmmmmmmmdddk',
    '.kmmmmmdddk.',
    '..kmmmdddk..',
    '...kmdddk...',
    '....kkkk....',
  ],
  legendary: [
    '.....kk.....',
    '....kwlk....',
    '....kllk....',
    'kkkkkllmkkkk',
    'khhlllllmmdk',
    '.khllllmmdk.',
    '..kllllmmk..',
    '..kllmmmdk..',
    '.klmmkkmmdk.',
    '.kmdk..kmdk.',
    '.kkk....kkk.',
    '............',
  ],
  mythic: [
    '............',
    '.kkk...kkk..',
    'khhlk.khlmk.',
    'khwllkllmmdk',
    'kllllllmmmdk',
    'klllllmmmmdk',
    '.kllllmmmdk.',
    '..kllmmmdk..',
    '...klmmdk...',
    '....kmdk....',
    '.....kk.....',
    '............',
  ],
  ancient: [
    '............',
    '..kkkkkkkk..',
    '.kllllllmmk.',
    'kllmmmmmmmdk',
    'klmmmAmmmmdk',
    'klmmAwAmmmdk',
    'klmmmAmmmmdk',
    'klmmAmAmmmdk',
    'kdmAmmmAmmdk',
    '.kddddddddk.',
    '..kkkkkkkk..',
    '............',
  ],
  exalted: [
    '............',
    'kkkkkkkkkkkk',
    'kAAAAAAAAAak',
    'kAhllmmmmdak',
    'kAlwlmmmddak',
    'kAllmmmmddak',
    '.kAlmmmmdak.',
    '..kAmmmdak..',
    '...kAmdak...',
    '....kAak....',
    '.....kk.....',
    '............',
  ],
  celestial: [
    '.....kk.....',
    '.....kwk....',
    '....klwk....',
    '....kllk....',
    '.kkkkllmkkk.',
    'kwwhlllmmmdk',
    '.kkkkmmmkkk.',
    '....kmmk....',
    '....kmdk....',
    '.....kdk....',
    '.....kk.....',
    '............',
  ],
  astral: [
    '...kkkk.....',
    '..khllk.....',
    '.khlllk...k.',
    '.kllmk...kwk',
    'klllk.....k.',
    'kllmk.......',
    'kllmk.......',
    'kllmmk....k.',
    '.kmmmdkkkdk.',
    '.kdmmmddddk.',
    '..kkdddddk..',
    '....kkkkk...',
  ],
  divine: [
    '.....kk.....',
    '..k..kk..k..',
    '...k.kk.k...',
    '....kkkk....',
    '.kkkhwllkkk.',
    'kkkkwlllmkkk',
    '...klllmmk..',
    '.kkkllmmdkk.',
    '....kkkkk...',
    '...k.kk.k...',
    '..k..kk..k..',
    '.....kk.....',
  ],
  eternal: [
    '....kkkk....',
    '..kkhwllkk..',
    '.khlkkkkmdk.',
    'khlk....kmdk',
    'klk......kdk',
    'klk......kdk',
    'klk......kdk',
    'kmmk....kddk',
    '.kmdkkkkddk.',
    '..kkddddkk..',
    '....kkkk....',
    '............',
  ],
  primordial: [
    '....kkkk....',
    '...khwlmk...',
    '..khllmmdk..',
    '..klllmmdk..',
    '.khllAmmmdk.',
    '.kllAwAmmdk.',
    '.klmmAmAmdk.',
    '.klmmmmAAdk.',
    '.kmmmmmmddk.',
    '..kmmmmddk..',
    '...kkkkkk...',
    '............',
  ],
  absolute: [
    '.....kk.....',
    '....kwwk....',
    '....kwwk....',
    '...kwwhhk...',
    '...kwhhhk..k',
    '..kwhhhhhkrk',
    '..kwhhhhhkok',
    '.kwhhhhhhkyk',
    '.kwhhhhhhkgk',
    'kwwwhhhhhkck',
    'kkkkkkkkkkbk',
    '..........vk',
  ],
};

const INK = '#1a1326';

/** The icon's roles coloured for its rarity. */
function colours(r: Rarity): Record<string, string> {
  const c = RARITY_COLOR[r];
  // The palest tiers lean on their own tint more, so their icons don't wash out to white.
  const pale = r === 'divine' || r === 'absolute' || r === 'eternal';
  return {
    k: INK,
    d: mixHex(c, INK, pale ? 0.55 : 0.42),
    m: pale ? mixHex(c, '#b89a5a', 0.3) : c,
    l: mixHex(c, '#ffffff', 0.38),
    h: mixHex(c, '#ffffff', pale ? 0.5 : 0.72),
    w: '#ffffff',
    A: '#ffd86a',
    a: '#b8862a',
    // The prism's spectrum.
    r: '#ff5a6a',
    o: '#ffa83a',
    y: '#ffe85a',
    g: '#6af08a',
    c: '#4ad4ff',
    b: '#6a8aff',
    v: '#c86aff',
  };
}

const cache = new Map<Rarity, PixelBuf>();

/** The rarity's icon (12 x 12; read-only). */
export function tierGem(r: Rarity): PixelBuf {
  let b = cache.get(r);
  if (!b) {
    b = fromRows(ICONS[r], colours(r));
    cache.set(r, b);
  }
  return b;
}

/** The rows, for checking (tests). */
export function tierGemRows(r: Rarity): Rows {
  return ICONS[r];
}
