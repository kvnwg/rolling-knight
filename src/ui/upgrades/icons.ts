/**
 * The upgrade map's icons as pictures (data URLs, one image pixel per art pixel, cached): the UI's
 * own icons (px.tsx) where a line uses one, else this map's (iconRows.ts). Two sizes, as Dumpster
 * Legend's map has: about 10 x 10 on the hexes, and a bigger one for the buy card and the popup (the
 * 16 x 16 original, or a Scale2x version of a 10 x 10 icon: finer art at the same pixel size, never a
 * blow-up).
 */
import { READ } from '../readCanvas';
import { fromRows, scale2x, type PixelBuf } from '../../render/pixel/buf';
import { UI_SPRITES } from '../../render/pixel/ui';
import { iconArt, type IconName } from '../px';
import { UPGRADE_ICON_ROWS } from './iconRows';

export interface IconPic {
  url: string;
  /** Size in art pixels. */
  w: number;
  h: number;
}

const cache = new Map<string, IconPic>();

function toPic(b: PixelBuf): IconPic {
  const c = document.createElement('canvas');
  c.width = b.w;
  c.height = b.h;
  const ctx = c.getContext('2d', READ)!;
  const img = ctx.createImageData(b.w, b.h);
  img.data.set(b.px);
  ctx.putImageData(img, 0, 0);
  return { url: c.toDataURL(), w: b.w, h: b.h };
}

function custom(icon: string, big: boolean): IconPic | null {
  const rows = UPGRADE_ICON_ROWS[icon];
  if (!rows) return null;
  const b = fromRows(rows);
  return toPic(big ? scale2x(b) : b);
}

/** A line's icon for its hex (about 10 x 10). */
export function hexIcon(icon: string): IconPic {
  const key = `hex|${icon}`;
  let a = cache.get(key);
  if (!a) {
    a = custom(icon, false) ?? iconArt(icon as IconName, 'md');
    cache.set(key, a);
  }
  return a;
}

/** A line's icon for the buy card and the popup (16 x 16, or 20 x 20 for this map's own icons). */
export function cardIcon(icon: string): IconPic {
  const key = `card|${icon}`;
  let a = cache.get(key);
  if (!a) {
    a = custom(icon, true) ?? (icon in UI_SPRITES ? iconArt(icon as IconName, 'lg') : iconArt(icon as IconName, 'md'));
    cache.set(key, a);
  }
  return a;
}
