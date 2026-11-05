/**
 * Preview sheets of the art, as PNGs: npx tsx tools/preview.ts knights out.png
 */
import { blank, blit, type PixelBuf } from '../src/render/pixel/buf';
import { CLASS_IDS } from '../src/core/knights';
import { knightFrame, knightLook, weaponArt, shieldArt, type View } from '../src/render/art/knights';
import { setRGB } from '../src/render/art/draw';
import { writePng } from './png';

const what = process.argv[2] ?? 'knights';
const out = process.argv[3] ?? 'shots/preview.png';

function fill(b: PixelBuf, hex: string) {
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) setRGB(b, x, y, hex);
}

if (what === 'knights') {
  const rarities = ['common', 'rare', 'epic', 'legendary', 'mythic', 'celestial', 'primordial'] as const;
  const views: View[] = ['down', 'side', 'up'];
  const cw = 26;
  const ch = 26;
  const sheet = blank(cw * (views.length * 2 + 1) * 2, ch * CLASS_IDS.length * rarities.length / 2 + ch);
  fill(sheet, '#3a4a3c');
  let row = 0;
  CLASS_IDS.forEach((cls, ci) => {
    rarities.forEach((r, ri) => {
      if ((ri + ci) % 2) return;
      const L = knightLook(`${r}-${cls}`, ri === 3 && ci === 0 ? 'gilded' : null, 1);
      let col = 0;
      for (const v of views) {
        for (const anim of ['idle', 'walk'] as const) {
          const fr = knightFrame(L, anim, v, anim === 'walk' ? 1 : 0);
          const x0 = col * cw + 4;
          const y0 = row * ch + 2;
          blit(sheet, fr.buf, x0, y0);
          if (v !== 'up') {
            const wp = weaponArt(L);
            blit(sheet, wp.buf, x0 + fr.handR[0] - wp.px, y0 + fr.handR[1] - wp.py + 1);
            if (cls === 'guardian') blit(sheet, shieldArt(L), x0 + fr.handL[0] - 4, y0 + fr.handL[1] - 5);
          }
          col++;
        }
      }
      row++;
    });
  });
  writePng(out, sheet, 4);
  console.log('wrote', out);
}

if (what === 'mobs') {
  const { BIOME_ORDER, BIOMES } = await import('../src/world/biomes');
  const { floorMobs, floorBoss } = await import('../src/world/mobgen');
  const { mobFrame } = await import('../src/render/art/mobs');
  const cw = 34;
  const ch = 30;
  const sheet = blank(cw * 12, ch * BIOME_ORDER.length + 60);
  fill(sheet, '#3a4a3c');
  BIOME_ORDER.forEach((id, row) => {
    const b = BIOMES[id];
    const types = [...floorMobs(b, 3, 11), ...floorMobs(b, 14, 12)];
    types.forEach((t, i) => {
      for (const [k, pose] of (['idle', 'walk'] as const).entries()) {
        const fr = mobFrame(t, pose, 1, 'down', false, false);
        blit(sheet, fr.buf, (i * 2 + k) * (cw / 1.2) + 2, row * ch + ch - fr.buf.h);
      }
    });
  });
  const boss = floorBoss(BIOMES.forest, 5, 3);
  const fr = mobFrame(boss, 'idle', 0, 'down', false, true);
  blit(sheet, fr.buf, 4, BIOME_ORDER.length * ch + 2);
  const boss2 = floorBoss(BIOMES.crypt, 20, 9);
  const fr2 = mobFrame(boss2, 'idle', 0, 'down', false, true);
  blit(sheet, fr2.buf, 120, BIOME_ORDER.length * ch + 2);
  writePng(out, sheet, 3);
  console.log('wrote', out, boss.name, boss.plan, boss2.name, boss2.plan);
}
