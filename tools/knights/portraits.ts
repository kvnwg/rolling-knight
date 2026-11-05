/**
 * The knight portraits as the game cuts them (src/ui/sprites.tsx knightUrl: knightStill cut to the
 * box measured from every knight sheet), for every class at a few rarities and Kevin, at 1x and 3x.
 * Checks that nothing is clipped: a portrait whose solid pixels touch its edge fails.
 *
 *   npx tsx tools/knights/portraits.ts out.png
 */
import { CLASS_IDS, KEVIN_ID } from '../../src/core/knights';
import type { Rarity } from '../../src/core/rarity';
import { SHEETS, type SheetName } from '../../src/render/pf/assets';
import { knightBounds, knightStill } from '../../src/render/pf/frames';
import { KNIGHT_SHEET, KNIGHT_SHEET_BY_ID } from '../../src/render/pf/knightLook';
import { readPng } from './lib/png';
import { Board, BACKDROPS } from './lib/view';

const names = [...new Set<SheetName>([...Object.values(KNIGHT_SHEET), ...Object.values(KNIGHT_SHEET_BY_ID)])];
for (const n of names) {
  const img = readPng(`src/assets/pf/${n}.png`);
  SHEETS[n].setPixels({ w: img.w, h: img.h, data: img.px });
}
const box = knightBounds(names)!;
const [l, t, r, b] = box;
const W = r - l + 3;
const H = b - t + 3;
const rarities: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic', 'celestial', 'divine', 'primordial'];
const ids = [...CLASS_IDS.flatMap((c) => rarities.map((ra) => `${ra}-${c}`)), KEVIN_ID];
const S = 3;
const cols = rarities.length;
const board = new Board(cols * (W * S + W + 12) + 10, Math.ceil(ids.length / cols) * (H * S + 8) + 10, BACKDROPS.ui);
let bad = 0;
ids.forEach((id, i) => {
  const { buf, pivot } = knightStill(id, null, 's', 0);
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = pivot[0] + l - 1 + x;
      const sy = pivot[1] + t - 1 + y;
      if (sx < 0 || sy < 0 || sx >= buf.w || sy >= buf.h) continue;
      px.set(buf.px.subarray((sy * buf.w + sx) * 4, (sy * buf.w + sx) * 4 + 4), (y * W + x) * 4);
    }
  }
  // Clipped: a solid pixel on the picture's edge.
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (px[(y * W + x) * 4 + 3] === 255) bad++;
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (px[(y * W + x) * 4 + 3] === 255) bad++;
  const cx = 10 + (i % cols) * (W * S + W + 12);
  const cy = 10 + Math.floor(i / cols) * (H * S + 8);
  board.fill(cx, cy, W * S, H * S, '#4a4c5a');
  board.draw(px, W, H, cx, cy, S);
  board.fill(cx + W * S + 4, cy, W, H, '#4a4c5a');
  board.draw(px, W, H, cx + W * S + 4, cy, 1);
});
board.save(process.argv[2] ?? 'portraits.png');
console.log(`portrait ${W} x ${H}, feet on row ${-t + 1}; pixels on the edge: ${bad}`);
