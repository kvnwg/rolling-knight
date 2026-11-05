/**
 * Contact sheets of the PixelForge art as the game paints it (Node, no browser):
 *
 *   npx tsx tools/pfPreview.ts knights shots/pf_knights.png     every class in every rarity, then the mutations
 *   npx tsx tools/pfPreview.ts moves shots/pf_moves.png [rarity] [class]   each class's idle, walk, run, attacks and dodge, every frame
 *   npx tsx tools/pfPreview.ts mobs shots/pf_mobs.png            the monsters and the bosses in their biomes' colors
 *
 * Frames come from src/assets/pf through the game's own recolors (knightLook, mobLook) and caping
 * (frames.ts), at 1 art pixel per pixel, then scaled up whole.
 */
import { fileURLToPath } from 'node:url';
import { CLASS_IDS, KEVIN_ID, knightId, type ClassId } from '../src/core/knights';
import { RARITIES } from '../src/core/rarity';
import { MUTATIONS } from '../src/core/state';
import { blank, blit, type PixelBuf } from '../src/render/pixel/buf';
import { setRGB } from '../src/render/art/draw';
import { SHEETS, type SheetName } from '../src/render/pf/assets';
import { frameBuf, haloBuf, haloSpot, haloWidth, type Paint } from '../src/render/pf/frames';
import { knightPaint } from '../src/render/pf/knightLook';
import { mobPaint } from '../src/render/pf/mobLook';
import type { Dir } from '../src/render/pf/sheet';
import { BIOMES } from '../src/world/biomes';
import { floorBoss, floorMobs, type MobType } from '../src/world/mobgen';
import { readPng } from './knights/lib/png';
import { writePng } from './png';

const what = process.argv[2] ?? 'knights';
const out = process.argv[3] ?? `shots/pf_${what}.png`;

for (const name of Object.keys(SHEETS) as SheetName[]) {
  const dir = name.startsWith('pk_') ? 'packs' : 'pf';
  const img = readPng(fileURLToPath(new URL(`../src/assets/${dir}/${name}.png`, import.meta.url)));
  SHEETS[name].setPixels({ w: img.w, h: img.h, data: img.px });
}

function fill(b: PixelBuf, hex: string): void {
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) setRGB(b, x, y, hex);
}

/** A frame of a sheet in a paint, its pivot on (x, y) of `dst`, with a halo when the paint has one. */
function put(dst: PixelBuf, name: SheetName, k: number, paint: Paint & { halo?: readonly [string, string] | null }, x: number, y: number, anim = 'idle', dir: Dir = 's'): void {
  const sheet = SHEETS[name];
  const [px, py] = sheet.meta.pivot;
  const f = frameBuf(name, k, paint, false, anim, dir);
  // (Over, keeping what's under the soft shadow.)
  for (let j = 0; j < f.h; j++) {
    for (let i = 0; i < f.w; i++) {
      const a = f.px[(j * f.w + i) * 4 + 3];
      if (!a) continue;
      const tx = x - px + i;
      const ty = y - py + j;
      if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
      const o = (ty * dst.w + tx) * 4;
      const t = a / 255;
      for (let c = 0; c < 3; c++) dst.px[o + c] = Math.round(dst.px[o + c] * (1 - t) + f.px[(j * f.w + i) * 4 + c] * t);
      dst.px[o + 3] = 255;
    }
  }
  if (paint.halo) {
    const [hx, hy] = haloSpot(name, k);
    blit(dst, haloBuf(paint.halo, haloWidth(name)), x - px + hx, y - py + hy);
  }
}

if (what === 'knights') {
  // Rows: a class; columns: every rarity facing s, then the mutations on a Legendary, then e and n.
  const tiers = RARITIES.filter((r) => r !== 'absolute');
  const cols = tiers.length + MUTATIONS.length + 2;
  const cw = 26;
  const ch = 32;
  const sheet = blank(cols * cw + 8, CLASS_IDS.length * ch + ch + 8);
  fill(sheet, '#6f8f58');
  CLASS_IDS.forEach((cls, row) => {
    const y = 8 + row * ch + 26;
    tiers.forEach((r, i) => {
      const p = knightPaint(knightId(r, cls), null);
      put(sheet, p.sheet, SHEETS[p.sheet].clip('idle', 's')[0][0], p, 4 + i * cw + 13, y);
    });
    MUTATIONS.forEach((m, i) => {
      const p = knightPaint(knightId('legendary', cls), m);
      put(sheet, p.sheet, SHEETS[p.sheet].clip('idle', 's')[0][0], p, 4 + (tiers.length + i) * cw + 13, y);
    });
    (['e', 'n'] as const).forEach((d, i) => {
      const p = knightPaint(knightId('epic', cls), null);
      put(sheet, p.sheet, SHEETS[p.sheet].clip('idle', d)[0][0], p, 4 + (tiers.length + MUTATIONS.length + i) * cw + 13, y, 'idle', d);
    });
  });
  const kevin = knightPaint(KEVIN_ID, null);
  put(sheet, kevin.sheet, SHEETS[kevin.sheet].clip('idle', 's')[0][0], kevin, 4 + 13, 8 + CLASS_IDS.length * ch + 26);
  writePng(out, sheet, 4);
  console.log('wrote', out);
}

if (what === 'moves') {
  // Rows: a class's move in one facing; columns: its frames in order.
  const rarity = (process.argv[4] ?? 'rare') as (typeof RARITIES)[number];
  const moves: Array<[ClassId, string, Dir]> = [];
  const dirs: Dir[] = ['s', 'e', 'n'];
  for (const cls of CLASS_IDS.filter((c) => !process.argv[5] || c === process.argv[5])) {
    const p = knightPaint(knightId(rarity, cls), null);
    const sh = SHEETS[p.sheet];
    for (const a of ['idle', 'walk', 'run', 'combat_idle', 'attack_slash', 'attack_heavy', 'shoot_bow', 'cast', 'roll', 'backflip', 'vault', 'dodge', 'block_enter']) {
      if (!sh.has(a)) continue;
      for (const d of a === 'idle' || a === 'walk' || a === 'run' || a.startsWith('attack') ? dirs : (['e'] as Dir[])) moves.push([cls, a, d]);
    }
  }
  const cw = 26;
  const ch = 30;
  const maxN = Math.max(...moves.map(([cls, a, d]) => SHEETS[knightPaint(knightId(rarity, cls), null).sheet].clip(a, d).length));
  const sheet = blank(maxN * cw + 8, moves.length * ch + 8);
  fill(sheet, '#6f8f58');
  moves.forEach(([cls, a, d], row) => {
    const p = knightPaint(knightId(rarity, cls), null);
    SHEETS[p.sheet].clip(a, d).forEach(([k], i) => put(sheet, p.sheet, k, p, 4 + i * cw + 13, 4 + row * ch + 25, a, d));
  });
  writePng(out, sheet, 3);
  console.log('wrote', out, moves.map(([c, a, d]) => `${c}:${a}_${d}`).join(' '));
}

if (what === 'mobs') {
  // Each biome's PixelForge monsters (an elite of each beside it), and its boss calm and enraged.
  const rows: Array<Array<{ paint: ReturnType<typeof mobPaint> }>> = [];
  const biomes = ['hamlet', 'forest', 'tundra', 'dungeon', 'crypt', 'swamp', 'desert', 'graveyard', 'ember', 'crystal', 'shrine'];
  const floors: Record<string, number> = { hamlet: 3, forest: 12, tundra: 17, dungeon: 22, crypt: 27, swamp: 32, desert: 37, graveyard: 42, ember: 47, crystal: 52, shrine: 57 };
  for (const b of biomes) {
    const floor = floors[b];
    const row: Array<{ paint: ReturnType<typeof mobPaint> }> = [];
    for (const t of floorMobs(BIOMES[b as keyof typeof BIOMES], floor, 7) as MobType[]) {
      for (const elite of [false, true]) {
        const p = mobPaint(t, elite, false);
        if (p && !p.sheet.startsWith('pk_')) row.push({ paint: p });
      }
    }
    const boss = floorBoss(BIOMES[b as keyof typeof BIOMES], floor + 3, 7);
    for (const enraged of [false, true]) {
      const p = mobPaint(boss, false, true, enraged);
      if (p) row.push({ paint: p });
    }
    rows.push(row);
  }
  const cw = 34;
  const ch = 100;
  const sheet = blank(Math.max(...rows.map((r) => r.reduce((s, e) => s + Math.max(cw, SHEETS[e.paint!.sheet].meta.cell + 4), 0))) + 8, rows.length * ch + 8);
  fill(sheet, '#6f8f58');
  rows.forEach((row, ri) => {
    let x = 4;
    for (const { paint } of row) {
      const sh = SHEETS[paint!.sheet];
      const w = Math.max(cw, sh.meta.cell + 4);
      const k = sh.clip(sh.has('combat_idle') ? 'combat_idle' : 'idle', 's')[0][0];
      put(sheet, paint!.sheet, k, paint!, x + Math.round(w / 2), 4 + ri * ch + 92, 'idle', 's');
      x += w;
    }
  });
  writePng(out, sheet, 2);
  console.log('wrote', out);
}
