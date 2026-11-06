/**
 * A merchant's wares on the floor (world/shop.ts): each on a little table under a red cloth with a
 * gold hem, the ware itself (its UI icon, outlined) floating over it. Pure buffers; the renderer bobs
 * the ware, adds its glow and hangs the price tag under the table.
 */
import { blank, fromRows, type PixelBuf } from '../pixel/buf';
import { isItemIcon, itemBuf } from './items';
import { UI_MD, UI_SM, UI_SPRITES, type UiIcon } from '../pixel/ui';
import { setRGB } from './draw';

const TABLE = [
  '.kkkkkkkkkkkkkk.',
  'kRRRRRRRRRRRRRSk',
  'kRSRRRRRRRRRRRrk',
  'krrrrrrrrrrrrrrk',
  'kyyyyyyyyyyyyyYk',
  'kdrdrdrdrdrdrdrk',
  'kkkkkkkkkkkkkkkk',
  '.kWk........kwk.',
  '.kWk........kwk.',
  '.kwk........kwk.',
  '.kkk........kkk.',
];
const COL: Record<string, string> = {
  k: '#1a1326',
  R: '#c8423e',
  S: '#e86a5e',
  r: '#9a2e32',
  d: '#6e1e26',
  y: '#e8b04a',
  Y: '#fff0a0',
  W: '#9a6a3e',
  w: '#5e3c22',
};

/** The table a ware stands on (16 x 11; its feet at the bottom row). */
export function wareTable(): PixelBuf {
  const b = blank(TABLE[0].length, TABLE.length);
  TABLE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] !== '.') setRGB(b, x, y, COL[row[x]]);
  });
  return b;
}

/** The ware itself: its icon at the UI's middle size (big enough to read on the table), or a piece of PixelForge gear. */
export function wareIcon(icon: string): PixelBuf {
  const gear = isItemIcon(icon) ? itemBuf(icon) : null;
  if (gear) return gear;
  const rows = UI_MD[icon as UiIcon] ?? UI_SPRITES[icon as UiIcon] ?? UI_SPRITES.star;
  const w = Math.max(...rows.map((r) => r.length));
  return fromRows(rows.map((r) => r.padEnd(w, '.')));
}

/** A coin for the price tag (the UI's small one). */
export function tagCoin(): PixelBuf {
  const rows = UI_SM.coin ?? UI_SPRITES.coin;
  const w = Math.max(...rows.map((r) => r.length));
  return fromRows(rows.map((r) => r.padEnd(w, '.')));
}
