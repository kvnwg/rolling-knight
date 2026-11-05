/**
 * Preview sheets of the attack effects (src/render/vfx), every effect by tier and frame, as PNGs:
 *   npx tsx tools/vfxPreview.ts [outDir] [scale]
 * writes vfx_swings.png (the three melee strokes, every tier and frame), vfx_skills.png (the skills'
 * strokes, whirlwind and the lunge), vfx_shots.png (arrows and spears in 16 directions, bolts, orbs,
 * fire, foes' bullets), vfx_impacts.png and vfx_sheet.png (all of it). The effects are flat and
 * unlit in the game too, so this is how they look there. Rows sit on grass, stone, a dark crypt and
 * sand, to check they read on any floor.
 */
import { mkdirSync } from 'node:fs';
import { RARITY_NAME, type Rarity } from '../src/core/rarity';
import { blank, blit, type PixelBuf } from '../src/render/pixel/buf';
import { renderText } from '../src/render/pixel/font';
import { setRGB } from '../src/render/art/draw';
import {
  ARCANE, BOLT_FRAMES, BULLET_FRAMES, CHEST, FIRE_FRAMES, HOLY, IMPACT_FRAMES, IMPACT_KINDS, ORB_FRAMES, STEEL, SWING_DIRS, SWING_FRAMES,
  arrowSprite, boltSprite, bulletSprite, fireSprite, impactSprite, lungeSprite, orbSprite, rampFrom, spearSprite, swingSprite, whirlSprite,
  type ImpactKind, type VfxSprite,
} from '../src/render/vfx/art';
import { ABSOLUTE, everyTier, vfxLook, type SwingStyle, type VfxLook } from '../src/render/vfx/look';
import { writePng } from './png';

const outDir = process.argv[2] ?? 'shots';
const scale = Number(process.argv[3] ?? 3);
mkdirSync(outDir, { recursive: true });

const GROUNDS = ['#4f7a3c', '#45454f', '#1d1924', '#c2a274', '#e8eef4'];
const look = (r: Rarity, step = 3): VfxLook => vfxLook(r, null, step);

function fill(b: PixelBuf, x0: number, y0: number, w: number, h: number, hex: string): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setRGB(b, x, y, hex);
}

/** Draws a frame with its anchor at (x, y). */
function put(sheet: PixelBuf, s: VfxSprite, x: number, y: number): void {
  if (s.buf) blit(sheet, s.buf, x - s.ax, y - s.ay);
}

/** A stand-in knight (just its size and place: 11 px wide, 19 tall, feet at the anchor's CHEST below). */
function dummy(sheet: PixelBuf, x: number, y: number, bg: string): void {
  const feet = y + CHEST;
  const dark = bg === '#1d1924' ? '#3a3448' : '#2a2630';
  for (let yy = feet - 18; yy <= feet; yy++) {
    const half = yy < feet - 13 ? 3 : 5;
    for (let xx = x - half; xx <= x + half; xx++) setRGB(sheet, xx, yy, dark);
  }
}

function label(sheet: PixelBuf, text: string, x: number, y: number, color = '#f4ecd8'): void {
  blit(sheet, renderText(text, { face: 'small', fill: color, ink: '#140c14' }), x, y);
}

interface Block {
  title: string;
  rows: Array<{ name: string; cells: Array<(sheet: PixelBuf, x: number, y: number, bg: string) => void> }>;
  cw: number;
  ch: number;
  /** Where in a cell the anchor goes (from its top left). */
  ax: number;
  ay: number;
}

const LABEL_W = 46;

function render(blocks: Block[]): PixelBuf {
  const width = Math.max(...blocks.map((b) => LABEL_W + b.cw * Math.max(...b.rows.map((r) => r.cells.length))));
  const height = blocks.reduce((h, b) => h + 12 + b.ch * b.rows.length + 4, 0);
  const sheet = blank(width, height);
  fill(sheet, 0, 0, width, height, '#141018');
  let y = 0;
  for (const b of blocks) {
    label(sheet, b.title, 2, y + 2, '#ffd86a');
    y += 12;
    b.rows.forEach((r, ri) => {
      const bg = GROUNDS[ri % GROUNDS.length];
      fill(sheet, 0, y, width, b.ch, bg);
      label(sheet, r.name, 2, y + Math.floor(b.ch / 2) - 4);
      r.cells.forEach((cell, ci) => cell(sheet, LABEL_W + ci * b.cw + b.ax, y + b.ay, bg));
      y += b.ch;
    });
    y += 4;
  }
  return sheet;
}

const TIERS: readonly Rarity[] = everyTier();
const KEVIN = ABSOLUTE as Rarity;
const nameOf = (r: Rarity): string => (RARITY_NAME as Record<string, string>)[r] ?? 'Absolute';
const FEW: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic', 'exalted', 'celestial', 'divine', 'primordial', KEVIN];

// ------------------------------------------------------------------ swings

function swingBlock(style: SwingStyle, dir: number, tiers: readonly Rarity[], title: string, crit = false): Block {
  const line = style === 'thrust' || style === 'stab' || style === 'impale';
  const reach = style === 'impale' ? 96 : line ? 64 : style === 'cleave' ? 110 : style === 'spin' ? 84 : 78;
  return {
    title,
    cw: line ? reach + 10 : reach,
    ch: line ? 44 : style === 'spin' || style === 'cleave' ? 70 : 58,
    ax: line ? 12 : style === 'spin' ? Math.floor(reach / 2) : Math.floor(reach * 0.4),
    ay: line ? 20 : style === 'spin' || style === 'cleave' ? 34 : 30,
    rows: tiers.map((r, i) => ({
      name: nameOf(r),
      cells: Array.from({ length: SWING_FRAMES }, (_, f) => (sheet: PixelBuf, x: number, y: number, bg: string) => {
        dummy(sheet, x, y, bg);
        put(sheet, swingSprite(style, look(r, i), dir, 1, f, crit), x, y);
      }),
    })),
  };
}

const swings: Block[] = [
  swingBlock('slash', 0, TIERS, 'BLADE SLASH (aim right, 5 frames)'),
  swingBlock('slash', 4, ['common', 'legendary', 'celestial', 'primordial'], 'BLADE SLASH (aim down-right)'),
  swingBlock('slash', 24, ['common', 'legendary', 'celestial', 'primordial'], 'BLADE SLASH (aim up)'),
  swingBlock('slash', 0, ['common', 'epic', 'celestial'], 'BLADE SLASH, CRIT', true),
  swingBlock('chop', 0, TIERS, 'GUARDIAN CHOP (aim right)'),
  swingBlock('thrust', 0, TIERS, 'LANCER THRUST (aim right)'),
  swingBlock('thrust', 28, ['common', 'legendary', 'celestial', 'primordial'], 'LANCER THRUST (aim up-right)'),
];

const impactRow = (kind: ImpactKind, r: Rarity, core: readonly string[], size: number) => ({
  name: `${kind} ${nameOf(r).slice(0, 4)}`,
  cells: Array.from({ length: IMPACT_FRAMES }, (_, f) => (sheet: PixelBuf, x: number, y: number) => put(sheet, impactSprite(kind, look(r), core as never, size, f), x, y)),
});

const skills: Block[] = [
  swingBlock('cleave', 0, FEW, 'EXCALIBUR CLEAVE'),
  swingBlock('bash', 0, FEW, 'SHIELD SLAM BASH'),
  swingBlock('slam', 0, FEW, 'GROUND POUND SLAM'),
  swingBlock('spin', 0, FEW, 'LANCER SWEEP SPIN'),
  swingBlock('stab', 0, FEW, 'SHADOWSTEP STAB'),
  swingBlock('impale', 0, FEW, 'IMPALE'),
  {
    title: 'WHIRLWIND (8 steps round)',
    cw: 56,
    ch: 44,
    ax: 28,
    ay: 20,
    rows: FEW.map((r, i) => ({
      name: nameOf(r),
      cells: Array.from({ length: 8 }, (_, k) => (sheet: PixelBuf, x: number, y: number, bg: string) => {
        dummy(sheet, x, y, bg);
        put(sheet, whirlSprite(look(r, i), (k * SWING_DIRS) / 8, k % 3), x, y);
      }),
    })),
  },
  {
    title: 'LUNGE (aim right, 3 phases; aim down-left)',
    cw: 74,
    ch: 30,
    ax: 50,
    ay: 14,
    rows: FEW.map((r, i) => ({
      name: nameOf(r),
      cells: [0, 1, 2].map((ph) => (sheet: PixelBuf, x: number, y: number, bg: string) => {
        dummy(sheet, x, y, bg);
        put(sheet, lungeSprite(look(r, i), 0, ph), x, y);
      }).concat([(sheet: PixelBuf, x: number, y: number, bg: string) => {
        dummy(sheet, x - 20, y, bg);
        put(sheet, lungeSprite(look(r, i), 12, 1), x - 20, y);
      }]),
    })),
  },
];

const shots: Block[] = [
  {
    title: 'ARROWS: 16 directions (last: heavy)',
    cw: 22,
    ch: 22,
    ax: 11,
    ay: 11,
    rows: FEW.map((r, i) => ({
      name: nameOf(r),
      cells: Array.from({ length: 17 }, (_, d) => (sheet: PixelBuf, x: number, y: number) => put(sheet, arrowSprite(look(r, i), d % 16, d === 16, d % 2), x, y)),
    })),
  },
  {
    title: 'SPEARS: 16 directions (last: a Skyfall shard)',
    cw: 26,
    ch: 26,
    ax: 13,
    ay: 13,
    rows: FEW.slice(0, 5).map((r, i) => ({
      name: nameOf(r),
      cells: Array.from({ length: 17 }, (_, d) => (sheet: PixelBuf, x: number, y: number) => put(sheet, spearSprite(look(r, i), d % 16, d === 16, d % 2), x, y)),
    })),
  },
  {
    title: 'ARCANE BOLT, HOLY ORB (frames)',
    cw: 18,
    ch: 18,
    ax: 9,
    ay: 9,
    rows: FEW.map((r, i) => ({
      name: nameOf(r),
      cells: [
        ...Array.from({ length: BOLT_FRAMES }, (_, f) => (sheet: PixelBuf, x: number, y: number) => put(sheet, boltSprite(look(r, i), f), x, y)),
        () => undefined,
        ...Array.from({ length: ORB_FRAMES }, (_, f) => (sheet: PixelBuf, x: number, y: number) => put(sheet, orbSprite(look(r, i), f), x, y)),
      ],
    })),
  },
  {
    title: 'FIRE (6 frames, 4 directions); FOES\' BULLETS (4 frames, small and a boss\'s)',
    cw: 20,
    ch: 20,
    ax: 10,
    ay: 10,
    rows: [
      { name: 'fire', cells: [0, 4, 8, 12].flatMap((dd) => Array.from({ length: FIRE_FRAMES }, (_, f) => (sheet: PixelBuf, x: number, y: number) => put(sheet, fireSprite(f, dd), x, y))) },
      ...['#ff6a6a', '#9adf5a', '#7ab8ff', '#ffd06a', '#c88aff'].map((col) => ({
        name: col,
        cells: [
          ...Array.from({ length: BULLET_FRAMES }, (_, f) => (sheet: PixelBuf, x: number, y: number) => put(sheet, bulletSprite(col, 0, f, false), x, y)),
          ...Array.from({ length: BULLET_FRAMES }, (_, f) => (sheet: PixelBuf, x: number, y: number) => put(sheet, bulletSprite(col, 6, f, false), x, y)),
          ...Array.from({ length: BULLET_FRAMES }, (_, f) => (sheet: PixelBuf, x: number, y: number) => put(sheet, bulletSprite(col, 10, f, true), x, y)),
        ],
      })),
    ],
  },
];

const impacts: Block[] = [
  {
    title: 'IMPACTS (4 frames each): spark, burst, holy, pop, thud, wall, fizzle',
    cw: 26,
    ch: 30,
    ax: 13,
    ay: 12,
    rows: [
      ...FEW.map((r) => ({
        name: nameOf(r),
        cells: IMPACT_KINDS.flatMap((k) => Array.from({ length: IMPACT_FRAMES }, (_, f) => (sheet: PixelBuf, x: number, y: number) => {
          const core = k === 'burst' ? ARCANE : k === 'holy' ? HOLY : k === 'pop' ? rampFrom('#ff6a6a') : k === 'thud' || k === 'cut' || k === 'pierce' ? (r === 'common' ? STEEL : look(r).ramp) : STEEL;
          put(sheet, impactSprite(k, look(r), core, 1, f, k === 'cut' ? 3 : 0), x, y);
        })),
      })),
      impactRow('burst', 'epic', ARCANE, 1.6),
      impactRow('spark', 'legendary', STEEL, 1.4),
    ],
  },
];

const write = (name: string, blocks: Block[]) => {
  const sheet = render(blocks);
  writePng(`${outDir}/${name}.png`, sheet, scale);
  console.log('wrote', `${outDir}/${name}.png`, `${sheet.w}x${sheet.h}`);
};

write('vfx_swings', swings);
write('vfx_skills', skills);
write('vfx_shots', shots);
write('vfx_impacts', impacts);
write('vfx_sheet', [...swings, ...skills, ...shots, ...impacts]);
