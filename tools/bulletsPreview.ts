/**
 * A preview sheet of the foes' bullets (src/render/art/bullets.ts) as PNGs:
 *   npx tsx tools/bulletsPreview.ts [outDir] [scale]
 * writes bullets_kinds.png (every kind, every frame, on a plain dark ground and a pale one),
 * bullets_dirs.png (the ones that turn, in every direction) and bullets_grounds.png (all of them at
 * the game's own size on each biome's real ground, under that biome's light, with a knight-sized
 * stand-in for scale). They're flat and unlit in the game too, so this is how they look there.
 */
import { mkdirSync } from 'node:fs';
import { BLADE_LOOKS, type BulletForm } from '../src/world/bullets';
import { BIOME_ORDER, BIOMES } from '../src/world/biomes';
import { FLOOR, SOLID, TILE, type FloorMap } from '../src/world/mapgen';
import {
  BULLET_FRAMES, MARK_STEPS, bladeSprite, dartSprite, globSprite, markSprite, mineSprite, orbSprite, pelletSprite, pipSprite, seedSprite, sparkSprite, spitSprite, sporeSprite,
  waveSprite, wispSprite,
} from '../src/render/art/bullets';
import { setRGB } from '../src/render/art/draw';
import { blank, blit, rgb, type PixelBuf } from '../src/render/pixel/buf';
import { renderText } from '../src/render/pixel/font';
import { paintTerrainPixels } from '../src/render/terrain';
import type { VfxSprite } from '../src/render/vfx/raster';
import { writePng } from './png';

const outDir = process.argv[2] ?? 'shots';
const scale = Number(process.argv[3] ?? 6);
mkdirSync(outDir, { recursive: true });

function fill(b: PixelBuf, x0: number, y0: number, w: number, h: number, hex: string): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setRGB(b, x, y, hex);
}

function put(sheet: PixelBuf, s: VfxSprite, x: number, y: number): void {
  if (s.buf) blit(sheet, s.buf, x - s.ax, y - s.ay);
}

function label(sheet: PixelBuf, text: string, x: number, y: number, color = '#f4ecd8'): void {
  blit(sheet, renderText(text, { face: 'small', fill: color, ink: '#140c14' }), x, y);
}

/** A stand-in knight: 11 px wide, 19 tall, its feet at (x, y). */
function dummy(sheet: PixelBuf, x: number, y: number): void {
  for (let yy = y - 18; yy <= y; yy++) {
    const half = yy < y - 13 ? 3 : 5;
    for (let xx = x - half; xx <= x + half; xx++) setRGB(sheet, xx, yy, yy < y - 13 ? '#c8ccd8' : '#5a6890');
  }
}

interface Row {
  name: string;
  frames: VfxSprite[];
}

const frames = (n: number, make: (f: number) => VfxSprite): VfxSprite[] => Array.from({ length: n }, (_, f) => make(f));

const KINDS: Row[] = [
  { name: 'ORB (straight)', frames: frames(4, (f) => orbSprite('red', 0, f, false)) },
  { name: 'ORB (curving)', frames: frames(4, (f) => orbSprite('pink', 2, f, false)) },
  { name: 'ORB (a boss)', frames: frames(4, (f) => orbSprite('red', 14, f, true)) },
  { name: 'DART', frames: [...frames(2, (f) => dartSprite(0, f)), ...frames(2, (f) => dartSprite(2, f)), ...frames(2, (f) => dartSprite(5, f))] },
  { name: 'SPIT (fast, hung)', frames: [...frames(2, (f) => spitSprite(0, f, true)), ...frames(2, (f) => spitSprite(3, f, true)), ...frames(2, (f) => spitSprite(0, f, false))] },
  { name: 'SPORE', frames: frames(BULLET_FRAMES.spore, sporeSprite) },
  { name: 'SEED (flies, swells)', frames: frames(BULLET_FRAMES.seed, seedSprite) },
  { name: 'PIP', frames: frames(BULLET_FRAMES.pip, pipSprite) },
  { name: 'PELLET', frames: frames(BULLET_FRAMES.pellet, pelletSprite) },
  { name: 'GLOB (up, top, down)', frames: frames(BULLET_FRAMES.glob, globSprite) },
  { name: 'MINE (waits, blinks, pops)', frames: frames(BULLET_FRAMES.mine, mineSprite) },
  ...BLADE_LOOKS.map((look, i) => ({ name: `BLADE: ${look.toUpperCase()}`, frames: frames(BULLET_FRAMES.blade, (f) => bladeSprite(i, f)) })),
  { name: 'WISP (eye open, shut)', frames: [...frames(3, (f) => wispSprite(0, f, true)), ...frames(3, (f) => wispSprite(3, f, true)), wispSprite(0, 0, false)] },
  { name: 'WAVE (and a boss)', frames: [...frames(2, (f) => waveSprite(0, f, false)), ...frames(2, (f) => waveSprite(2, f, false)), ...frames(2, (f) => waveSprite(0, f, true))] },
  { name: 'SPARK', frames: frames(BULLET_FRAMES.spark, sparkSprite) },
  { name: 'A GLOB\'S LANDING MARK', frames: [...frames(MARK_STEPS, (f) => markSprite(10, f + 1, false)), markSprite(10, MARK_STEPS, true), markSprite(8, 2, false), markSprite(13, 3, true)] },
];

function kindsSheet(): PixelBuf {
  const cw = 30;
  const ch = 24;
  const lw = 104;
  const cols = Math.max(...KINDS.map((r) => r.frames.length));
  const half = lw + cols * cw + 6;
  const sheet = blank(half * 2, 12 + KINDS.length * ch);
  fill(sheet, 0, 0, half, sheet.h, '#22202c');
  fill(sheet, half, 0, half, sheet.h, '#d8dee8');
  label(sheet, 'EVERY KIND, EVERY FRAME (on dark, on pale)', 2, 2, '#ffd86a');
  KINDS.forEach((r, i) => {
    const y = 12 + i * ch;
    label(sheet, r.name, 2, y + 8);
    r.frames.forEach((s, f) => {
      put(sheet, s, lw + f * cw + 14, y + 12);
      put(sheet, s, half + lw + f * cw + 14, y + 12);
    });
  });
  return sheet;
}

function dirsSheet(): PixelBuf {
  const cw = 26;
  const ch = 28;
  const lw = 40;
  const turning: Array<[string, (dir: number) => VfxSprite]> = [
    ['DART', (dir) => dartSprite(dir, 1)],
    ['SPIT', (dir) => spitSprite(dir, 0, true)],
    ['WAVE', (dir) => waveSprite(dir, 0, false)],
    ['WISP', (dir) => wispSprite(Math.floor(dir / 2), dir % 3, true)],
    ['ORB', (dir) => orbSprite(dir % 2 ? 'pink' : 'red', dir, 0, false)],
  ];
  const sheet = blank(lw + 16 * cw, 12 + turning.length * ch);
  fill(sheet, 0, 0, sheet.w, sheet.h, '#3a4a38');
  label(sheet, 'THE ONES THAT TURN, ALL 16 WAYS', 2, 2, '#ffd86a');
  turning.forEach(([name, make], i) => {
    const y = 12 + i * ch;
    label(sheet, name, 2, y + 10);
    for (let dir = 0; dir < 16; dir++) put(sheet, make(dir), lw + dir * cw + 12, y + 14);
  });
  return sheet;
}

/** An open arena, for a patch of a biome's own ground. */
function arena(n: number): FloorMap {
  const tiles = new Uint8Array(n * n).fill(FLOOR);
  for (let i = 0; i < n; i++) tiles[i] = tiles[(n - 1) * n + i] = tiles[i * n] = tiles[i * n + n - 1] = SOLID;
  const mid = (n / 2) * TILE;
  return { w: n, h: n, tiles, path: new Uint8Array(n * n), rooms: [], start: { x: mid, y: mid }, exit: { x: TILE * 2, y: TILE * 2 }, props: [], spawns: [], seed: 7 };
}

/** One of everything, in a line, at the game's own size. */
const LINEUP: Array<[BulletForm | 'orb' | 'curve', (f: number) => VfxSprite]> = [
  ['orb', (f) => orbSprite('red', 0, f, false)],
  ['curve', (f) => orbSprite('pink', 2, f, false)],
  ['dart', (f) => dartSprite(1, f)],
  ['spit', (f) => spitSprite(15, f, true)],
  ['spit', (f) => spitSprite(0, f, false)],
  ['spore', sporeSprite],
  ['seed', (f) => seedSprite(f % 2)],
  ['seed', (f) => seedSprite(2 + (f % 2))],
  ['pip', pipSprite],
  ['pellet', pelletSprite],
  ['glob', (f) => globSprite(1 + (f % 2))],
  ['mine', (f) => mineSprite(f % 2)],
  ['blade', (f) => bladeSprite(0, f)],
  ['blade', (f) => bladeSprite(1, f + 1)],
  ['blade', (f) => bladeSprite(2, f + 2)],
  ['wisp', (f) => wispSprite(0, f, true)],
  ['wave', (f) => waveSprite(0, f, false)],
  ['spark', sparkSprite],
];

function groundsSheet(): PixelBuf {
  const step = 17;
  const ch = 34;
  const lw = 44;
  const W = lw + 16 + LINEUP.length * step + 8;
  const sheet = blank(W, 12 + BIOME_ORDER.length * ch);
  fill(sheet, 0, 0, W, sheet.h, '#141018');
  label(sheet, 'ON EVERY BIOME\'S GROUND, UNDER ITS LIGHT (game size)', 2, 2, '#ffd86a');
  const map = arena(Math.ceil(W / TILE) + 6);
  BIOME_ORDER.forEach((id, bi) => {
    const biome = BIOMES[id];
    const t = paintTerrainPixels(map, biome);
    const [ar, ag, ab] = rgb(biome.light.ambient);
    const y0 = 12 + bi * ch;
    // The ground as the game lights it: multiplied by the biome's ambient, a little lifted (the knights' own light).
    for (let y = 0; y < ch - 1; y++) {
      for (let x = 0; x < W; x++) {
        const i = ((y + TILE * 3) * t.w + x + TILE * 2) * 4;
        const k = 0.25;
        const sr = Math.round(t.px[i] * (ar / 255 + (1 - ar / 255) * k));
        const sg = Math.round(t.px[i + 1] * (ag / 255 + (1 - ag / 255) * k));
        const sb = Math.round(t.px[i + 2] * (ab / 255 + (1 - ab / 255) * k));
        const j = ((y0 + y) * W + x) * 4;
        sheet.px[j] = sr;
        sheet.px[j + 1] = sg;
        sheet.px[j + 2] = sb;
        sheet.px[j + 3] = 255;
      }
    }
    label(sheet, id.toUpperCase(), 2, y0 + 2);
    dummy(sheet, lw + 4, y0 + 28);
    LINEUP.forEach(([, make], i) => put(sheet, make(bi + i), lw + 20 + i * step, y0 + (i % 2 ? 22 : 14)));
  });
  return sheet;
}

const sheets: Array<[string, PixelBuf]> = [
  ['bullets_kinds', kindsSheet()],
  ['bullets_dirs', dirsSheet()],
  ['bullets_grounds', groundsSheet()],
];
for (const [name, buf] of sheets) {
  writePng(`${outDir}/${name}.png`, buf, scale);
  console.log(`${outDir}/${name}.png  ${buf.w}x${buf.h} @${scale}x`);
}
