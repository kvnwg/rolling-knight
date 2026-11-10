/**
 * Pixel pictures in the UI: Dumpster Legend's UI icons (src/render/pixel/ui.ts) plus a few drawn for
 * this game, and PixelForge's gear-set item icons (`item:<set>:<piece>`, render/art/items.ts), all
 * shown at exactly one art pixel = var(--px) CSS px, so the UI and its icons share one pixel size.
 */
import type { CSSProperties } from 'react';
import { isItemIcon, itemBuf, type ItemIcon } from '../render/art/items';
import { tierGem } from '../render/art/tierGems';
import type { Rarity } from '../core/rarity';
import { fromRows, type PixelBuf, type Rows } from '../render/pixel/buf';
import { LUCK_TOKENS, UI_MD, UI_SM, UI_SPRITES, UI_XS, type UiIcon } from '../render/pixel/ui';

/** Icons this game adds (same palette keys as the rest of the pixel art). */
const EXTRA: Record<string, Rows> = {
  helm: [
    '................',
    '......kkkk......',
    '....kk5554kk....',
    '...k55555443k...',
    '..k5555554433k..',
    '..k5554444433k..',
    '.k55544444433k..',
    '.k5kkkkkkkkk3k..',
    '.k4k1111111k2k..',
    '.k44kkkkkkk32k..',
    '.k443343343322k.',
    '..k4433433322k..',
    '..kk4433333kk...',
    '....kkkkkkk.....',
    '................',
    '................',
  ],
  tent: [
    '................',
    '.......kk.......',
    '......kTTk......',
    '.....kTttNk.....',
    '....kTTtkNNk....',
    '...kTTtkxkNNk...',
    '..kTTttkxxkNNk..',
    '..kTTtkxxxkNnk..',
    '.kTTttkxxxxkNnk.',
    '.kTttkxxxxxxkNnk',
    'kTTttkxxxxxxkNnk',
    'kkkkkkkkkkkkkkkk',
    '.k............k.',
    '................',
    '................',
    '................',
  ],
  hourglass: ['kkkkkkk', 'knNNNnk', '.kYYYk.', '..kyk..', '..kCk..', '.kCYCk.', 'kCYYYCk', 'knNNNnk', 'kkkkkkk'],
  // The roster's own: spare copies (two cards, one behind the other), the leader's crown, power
  // (crossed swords, small enough to sit beside a number).
  copies: ['..kkkkkk', '..k5554k', 'kkkkkk4k', 'kWWWTk4k', 'kWWWTk4k', 'kWWWTkkk', 'kTTTTk..', 'kkkkkk..'],
  crown: ['k...k...k', 'ky.kyk.yk', 'kykyYykyk', 'kyyyYyyyk', 'kyRyCyRyk', 'kyyyyyyOk', 'kOOOOOOOk', 'kkkkkkkkk'],
  might: ['kk....kk', 'k5k..k5k', '.k5kk5k.', '..k55k..', '..k55k..', '.kykkyk.', 'kyk..kyk', 'kk....kk'],
  boot: ['....kkk...', '...kNtNk..', '...kNtNk..', '...kNtNk..', '..kNNtNk..', '.kNNNNtkk.', 'knNNNNNttk', 'knnnnnnnnk', 'kkkkkkkkkk'],
  shard: ['...k...', '..kCk..', '.kCwck.', '.kCcck.', 'kCCcUck', '.kCcUk.', '..kUk..', '...k...'],
  sigil: ['...kkk...', '..kMmVk..', '.kMmmmVk.', 'kMmkkkmVk', 'kmmkMkmvk', 'kVmkkkmvk', '.kVmmmvk.', '..kVvvk..', '...kkk...'],
  // The Lancer's: a lance on the slant, steel at its tip, a red pennant under it.
  lance: ['......kkk', '.....kWWk', '....kW5kk', '.kkky5k..', 'kRRykk...', 'kRRyk....', '.kykk....', 'kyk......', 'kk.......'],
  swords: [
    'kk......kk',
    'k5k....k5k',
    '.k5k..k5k.',
    '..k5kk5k..',
    '...k55k...',
    '...k55k...',
    '..kykkyk..',
    '.kyk..kyk.',
    'kbk....kbk',
    'kk......kk',
  ],
  // What a folk's job asks you to slay, by kind of monster (and the boss, crowned), and a quill for a
  // demon's contract. 9 x 9, lit from the top left.
  mobSlime: ['.........', '...kkk...', '..kLLlk..', '.kLlllGk.', 'kLlkllkGk', 'klllllGGk', 'kGlllGGgk', '.kkkkkkk.', '.........'],
  mobBeast: ['k.......k', 'kk.....kk', 'knk...knk', 'kNNkkkNNk', 'kNyNNNyNk', 'kNNNtNNnk', '.kNtTtnk.', '..kTkTk..', '...kkk...'],
  mobGoblin: ['.........', '...kkk...', 'k.kGlGk.k', 'kGkllGkGk', '.kGlllGk.', '.kGRlRGk.', '.kGlllGk.', '..kGwGk..', '...kkk...'],
  mobFlyer: ['.........', 'k.......k', 'kk.k.k.kk', 'kVkkkkkVk', 'kVmyVyVVk', '.kVVVVVk.', '..kVVVk..', '...k.k...', '.........'],
  mobPlant: ['...kk.kk.', '..kLLkLLk', '..klLkLlk', '...kkGkk.', '.kRRkGk..', 'kReRRkk..', 'kRkwkRk..', '.kRRRk...', '..kkk....'],
  mobGolem: ['.kkkkkkk.', 'k5444443k', 'k4kc4ck3k', 'k4444433k', 'k43kkk33k', 'k4433332k', '.k33322k.', 'k3k...k2k', 'kk.....kk'],
  mobBug: ['..k...k..', '...kkk...', '..kxxxk..', '.kcUUUUk.', 'kcUUkUUuk', 'kUUUkUUuk', '.kUUkUuk.', '..kkkkk..', '.k.....k.'],
  mobPumpkin: ['....kGk..', '...kkkk..', '.kkOOOOk.', 'kOyOOOOok', 'kOkyOykok', 'kOOOOOOok', 'kOkkkkOok', '.kOOOOok.', '..kkkkk..'],
  mobGhost: ['..kkkkk..', '.kwwwW5k.', 'kwwkwk54k', 'kwwwwW54k', 'kwwWW554k', 'kwW5W544k', 'kW5W5544k', 'k5k5k4k4k', 'kk.k.k.kk'],
  mobHog: ['k.......k', 'kPk...kPk', 'kPPkkkPPk', 'kPkPPPkPk', 'kPPPPPPqk', 'kPPqqqPqk', 'kPqkqkqqk', '.kPqqqqk.', '..kkkkk..'],
  mobRam: ['.kk...kk.', 'k45kkk54k', 'k4kWWWk3k', 'k4kWWWk3k', '.kWkWkWk.', '..kWWWk..', '..kW5Wk..', '..kt5tk..', '...kkk...'],
  mobHen: ['...kRk...', '..kRRk...', '..kwwkk..', '.kwkwwOk.', 'kwwwwkk..', 'kwwwwwwk.', 'kwwwww5k.', '.kwww5k..', '..kOkOk..'],
  mobAny: ['k.......k', 'kVk...kVk', '.kVkkkVk.', 'kVmVVVVVk', 'kVyVVVyVk', 'kVVVVVVvk', '.kVwVwVk.', '..kkkkk..', '.........'],
  deeper: ['...kkk...', '...kYk...', '...kyk...', 'kkkkykkkk', 'kYyyyyyOk', '.kyyyyOk.', '..kyyOk..', '...kOk...', '....k....'],
  boss: ['.k.k.k.k.', '.kykykyk.', '.kyyyyyk.', '.kkkkkkk.', 'k5555543k', 'k5kk5kk3k', 'k5555543k', '.k5k5k3k.', '..kkkkk..'],
  quill: ['.......kk', '......kWk', '.....kW5k', '....kW5k.', '...kW5k..', '..kW5k...', '.kx5k....', 'kxkk.....', 'kk.......'],
};

/** Smaller cuts of a few of them, for the tiny size (beside a card's line of text). */
const EXTRA_XS: Partial<Record<keyof typeof EXTRA, Rows>> = {
  copies: ['..kkkkk', '..k554k', 'kkkkk4k', 'kWWTk4k', 'kWWTkkk', 'kTTTk..', 'kkkkk..'],
  lance: ['...kkk', '.kkWWk', 'kRRy5k', 'kRykkk', 'kykk..', 'kk....'],
};

/** A rarity's own icon (render/art/tierGems.ts): `tier:legendary`. */
export type TierIcon = `tier:${Rarity}`;

export type IconName = UiIcon | keyof typeof EXTRA | `token${2 | 3 | 5 | 10}` | ItemIcon | TierIcon;
export type IconSize = 'xs' | 'sm' | 'md' | 'lg';

const urls = new Map<string, { url: string; w: number; h: number }>();

function rowsFor(icon: IconName, size: IconSize): Rows | undefined {
  if (icon.startsWith('token')) return LUCK_TOKENS[Number(icon.slice(5)) as 2 | 3 | 5 | 10];
  if (icon in EXTRA) return (size === 'xs' ? EXTRA_XS[icon as keyof typeof EXTRA] : undefined) ?? EXTRA[icon as keyof typeof EXTRA];
  const ui = icon as UiIcon;
  if (size === 'xs') return UI_XS[ui] ?? UI_SM[ui] ?? UI_MD[ui] ?? UI_SPRITES[ui];
  if (size === 'sm') return UI_SM[ui] ?? UI_MD[ui] ?? UI_SPRITES[ui];
  if (size === 'md') return UI_MD[ui] ?? UI_SPRITES[ui];
  return UI_SPRITES[ui];
}

export function iconArt(icon: IconName, size: IconSize = 'md'): { url: string; w: number; h: number } {
  const key = `${icon}|${size}`;
  let a = urls.get(key);
  if (a) return a;
  let b: PixelBuf | null = isItemIcon(icon) ? itemBuf(icon) : icon.startsWith('tier:') ? tierGem(icon.slice(5) as Rarity) : null;
  if (!b) {
    const rows = rowsFor(icon, size) ?? UI_SPRITES.star;
    const w = Math.max(...rows.map((r) => r.length));
    b = fromRows(rows.map((r) => r.padEnd(w, '.')));
  }
  const c = document.createElement('canvas');
  c.width = b.w;
  c.height = b.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(b.w, b.h);
  img.data.set(b.px);
  ctx.putImageData(img, 0, 0);
  a = { url: c.toDataURL(), w: b.w, h: b.h };
  urls.set(key, a);
  return a;
}

/** An icon at one art pixel per var(--px) (times `s`). */
export function Px({ icon, size = 'md', s = 1, className, style }: { icon: IconName; size?: IconSize; s?: number; className?: string; style?: CSSProperties }) {
  const a = iconArt(icon, size);
  return (
    <img
      className={`px ${className ?? ''}`}
      src={a.url}
      alt=""
      draggable={false}
      style={{ width: `calc(${a.w * s} * var(--px))`, height: `calc(${a.h * s} * var(--px))`, flex: 'none', ...style }}
    />
  );
}
