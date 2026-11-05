/**
 * The melee smears side by side in every main direction, a few tiers, both frames, at the game's
 * pixel size with a stand-in knight: npx tsx tools/vfxSmearCheck.ts out.png [style]
 */
import type { Rarity } from '../src/core/rarity';
import { setRGB } from '../src/render/art/draw';
import { blank, blit } from '../src/render/pixel/buf';
import { CHEST, swingSprite } from '../src/render/vfx/art';
import { ABSOLUTE, vfxLook, type SwingStyle } from '../src/render/vfx/look';
import { writePng } from './png';

const out = process.argv[2] ?? 'shots/vfx_smears.png';
const style = (process.argv[3] ?? 'slash') as SwingStyle;
const tiers: Rarity[] = ['common', 'legendary', 'celestial', ABSOLUTE as Rarity];
const dirs = [0, 4, 8, 12, 16, 20, 24, 28];
const cw = 84;
const ch = 72;
const sheet = blank(cw * dirs.length * 2, ch * tiers.length);
const grounds = ['#4f7a3c', '#45454f', '#1d1924', '#c2a274'];
tiers.forEach((r, ri) => {
  for (let y = ri * ch; y < (ri + 1) * ch; y++) for (let x = 0; x < sheet.w; x++) setRGB(sheet, x, y, grounds[ri % grounds.length]);
  dirs.forEach((dir, di) => {
    for (const f of [0, 1]) {
      const x0 = (di * 2 + f) * cw + cw / 2;
      const y0 = ri * ch + ch / 2;
      // The knight stand-in: 13 px wide, 21 tall, its feet CHEST below the anchor.
      for (let yy = y0 + CHEST - 20; yy <= y0 + CHEST; yy++) {
        const half = yy < y0 + CHEST - 14 ? 4 : 6;
        for (let xx = x0 - half; xx <= x0 + half; xx++) setRGB(sheet, xx, yy, '#2a2630');
      }
      const s = swingSprite(style, vfxLook(r, null, 4), dir, 1, f, false);
      if (s.buf) blit(sheet, s.buf, x0 - s.ax, y0 - s.ay);
    }
  });
});
writePng(out, sheet, 3);
console.log('wrote', out);
