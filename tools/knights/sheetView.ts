/**
 * A review board of a built sheet: every animation's frames in every direction, enlarged, over a
 * mid backdrop, with the idle turnaround at 1x on three floors.
 *
 *   npx tsx tools/knights/sheetView.ts rk_kevin out.png [scale]
 */
import { readFileSync } from 'node:fs';
import { readPng } from './lib/png';
import { Board, BACKDROPS, label } from './lib/view';

const name = process.argv[2] ?? 'rk_kevin';
const out = process.argv[3] ?? `${name}_view.png`;
const S = Number(process.argv[4] ?? 3);
const dir = 'src/assets/pf';
const meta = JSON.parse(readFileSync(`${dir}/${name}.json`, 'utf8'));
const img = readPng(`${dir}/${name}.png`);
const C: number = meta.cell;

function cellPx(k: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(C * C * 4);
  const ox = (k % meta.cols) * C;
  const oy = Math.floor(k / meta.cols) * C;
  for (let y = 0; y < C; y++) px.set(img.px.subarray(((oy + y) * img.w + ox) * 4, ((oy + y) * img.w + ox + C) * 4), y * C * 4);
  return px;
}

const anims = Object.entries(meta.anims) as Array<[string, { dirs: Record<string, Array<[number, number]>> }]>;
const dirs = ['s', 'e', 'n', 'w'];
const maxF = Math.max(...anims.map(([, a]) => Math.max(...Object.values(a.dirs).map((f) => f.length))));
const cw = C * S + 4;
const rowH = C * S + 4;
const b = new Board(60 + cw * maxF * 2 + 20, 20 + rowH * Math.ceil((anims.length * dirs.length) / 2) + C * 2 + 40, BACKDROPS.ui);
let row = 0;
let col = 0;
for (const [an, a] of anims) {
  for (const d of dirs) {
    const frames = a.dirs[d];
    const x0 = col * (cw * maxF + 30);
    const y0 = 10 + row * rowH;
    label(b, `${an.slice(0, 8)} ${d}`, x0 + 2, y0 + 2, '#e8e0f0', 1);
    (frames ?? []).forEach(([k], i) => {
      b.fill(x0 + 40 + i * cw, y0, C * S, C * S, i % 2 ? '#5b5d6b' : '#55576a');
      b.draw(cellPx(k), C, C, x0 + 40 + i * cw, y0, S);
    });
    col++;
    if (col === 2) {
      col = 0;
      row++;
    }
  }
}
const yb = 20 + rowH * Math.ceil((anims.length * dirs.length) / 2);
[BACKDROPS.stone, BACKDROPS.grass, BACKDROPS.cave].forEach((bg, j) => {
  dirs.forEach((d, i) => {
    const x = 10 + (j * 4 + i) * (C + 4);
    b.fill(x, yb, C, C, bg);
    b.draw(cellPx(meta.anims.idle.dirs[d][0][0]), C, C, x, yb, 1);
  });
});
b.save(out);
console.log('wrote', out);
