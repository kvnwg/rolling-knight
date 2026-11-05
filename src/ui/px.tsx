/**
 * Pixel pictures in the UI: Dumpster Legend's UI icons (src/render/pixel/ui.ts) plus a few drawn for
 * this game, all shown at exactly one art pixel = var(--px) CSS px, so the UI and its icons share one
 * pixel size.
 */
import type { CSSProperties } from 'react';
import { fromRows, type Rows } from '../render/pixel/buf';
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
  boot: ['....kkk...', '...kNtNk..', '...kNtNk..', '...kNtNk..', '..kNNtNk..', '.kNNNNtkk.', 'knNNNNNttk', 'knnnnnnnnk', 'kkkkkkkkkk'],
  shard: ['...k...', '..kCk..', '.kCwck.', '.kCcck.', 'kCCcUck', '.kCcUk.', '..kUk..', '...k...'],
  sigil: ['...kkk...', '..kMmVk..', '.kMmmmVk.', 'kMmkkkmVk', 'kmmkMkmvk', 'kVmkkkmvk', '.kVmmmvk.', '..kVvvk..', '...kkk...'],
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
};

export type IconName = UiIcon | keyof typeof EXTRA | `token${2 | 3 | 5 | 10}`;
export type IconSize = 'xs' | 'sm' | 'md' | 'lg';

const urls = new Map<string, { url: string; w: number; h: number }>();

function rowsFor(icon: IconName, size: IconSize): Rows | undefined {
  if (icon.startsWith('token')) return LUCK_TOKENS[Number(icon.slice(5)) as 2 | 3 | 5 | 10];
  if (icon in EXTRA) return EXTRA[icon as keyof typeof EXTRA];
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
  const rows = rowsFor(icon, size) ?? UI_SPRITES.star;
  const w = Math.max(...rows.map((r) => r.length));
  const b = fromRows(rows.map((r) => r.padEnd(w, '.')));
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
