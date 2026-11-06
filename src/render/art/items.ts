/**
 * PixelForge's gear-set item icons (src/assets/pf/items.json, made by tools/packs/pixelforge.py from
 * PixelForge's `pf icons`): a 16 x 16 icon for every piece of its eight gear sets (iron, leather,
 * gold, crystal, traveler, crimson, forest, azure), helmet to ring, each its own little palette and
 * rows of it. Named `item:<set>:<piece>` (item:iron:headwear, item:forest:amulet), they go wherever
 * the UI's own icons go (ui/px.tsx) and onto a merchant's tables (art/wares.ts).
 */
import data from '../../assets/pf/items.json';
import { blank, type PixelBuf } from '../pixel/buf';

export type ItemIcon = `item:${string}`;

interface ItemArt {
  label: string;
  pal: string[];
  rows: string[];
}

const ICONS = (data as { cell: number; icons: Record<string, ItemArt> }).icons;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function isItemIcon(name: string): name is ItemIcon {
  return name.startsWith('item:');
}

/** The icon's art, or null if PixelForge has no such piece. */
export function itemArt(name: ItemIcon): ItemArt | null {
  return ICONS[name.slice(5)] ?? null;
}

const bufs = new Map<string, PixelBuf>();

/** The icon as pixels (16 x 16; read-only), or null if there's no such piece. */
export function itemBuf(name: ItemIcon): PixelBuf | null {
  let b = bufs.get(name);
  if (b) return b;
  const art = itemArt(name);
  if (!art) return null;
  const h = art.rows.length;
  const w = Math.max(...art.rows.map((r) => r.length));
  b = blank(w, h);
  art.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const k = ALPHABET.indexOf(row[x]);
      if (k < 0) continue;
      const hex = art.pal[k];
      const i = (y * w + x) * 4;
      b!.px[i] = parseInt(hex.slice(1, 3), 16);
      b!.px[i + 1] = parseInt(hex.slice(3, 5), 16);
      b!.px[i + 2] = parseInt(hex.slice(5, 7), 16);
      b!.px[i + 3] = hex.length > 7 ? parseInt(hex.slice(7, 9), 16) : 255;
    }
  });
  bufs.set(name, b);
  return b;
}

/** Every icon's name (for tests and previews). */
export function itemIcons(): ItemIcon[] {
  return Object.keys(ICONS).map((k) => `item:${k}` as ItemIcon);
}
