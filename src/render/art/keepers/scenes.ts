/**
 * The header scenes of the keepers' screens: each keeper big and detailed at their counter, among
 * the things of their trade, warmly lit. Painted for any width and height (in art pixels: the screen
 * shows them at a whole number of screen pixels each), always the keeper in the middle at their
 * counter along the foot of the picture, and their trade round them, the nearest things within a
 * phone's width of the middle and more of the room for a wider screen:
 *  - the Oracle at her altar under the glowing reel of the Gilded Reel, a crystal orb before her;
 *  - the tinker among bottles that glow, brass gears and the slate of upgrades;
 *  - the smith at his anvil, the forge roaring behind him, tools on the wall;
 *  - the broker among shelves of curios he's priced, his balance and his magnifying glass;
 *  - the sage in his velvet chair between drapes, sigil stones glowing;
 *  - the priestess at her candles before the rose-gold rising sun;
 *  - the quartermaster at her table with her ledger, maps and banners behind;
 *  - the notice board, papered with jobs, a gold "!" over it;
 *  - the warden at the head of the steps down, the dungeon's violet glow behind him.
 *
 * Pure (no DOM): returns the painted layer (albedo, glow and lights) for light.ts, and the pixels
 * that shut the keeper's eyes for a blink.
 */
import type { StationId } from '../../../world/hubWorld';
import { HUB_CAST } from '../hubNpcs';
import { GOLD, h2, IRON, Layer, PLANK, STONE, TIMBER, vnoise, rk, oval, type Ramp } from '../hubKit';
import { bustGeometry, paintBust, type BustSpec } from './bust';
import {
  anvil, balance, banner, beam, birdcage, books, bottle, BRASS, candle, coins, counter, crystalOrb, curio, drape, flowerPot, forge, gear, jar, lantern, ledger,
  note, PARCH, shelf, shield, sigilStone, slateBoard, sunEmblem, sword, toolRack, wallPlanks, wallPlaster, wallStone,
} from './props';

export interface SceneArt {
  L: Layer;
  ambient: readonly [number, number, number];
  bloom: number;
  vignette: number;
  /** The keeper's eyes shut: [x, y, color] in the layer's pixels. */
  blink: Array<[number, number, string]>;
}

/** The counter's height at the foot of every scene. */
export const COUNTER_H = 21;

/** Darker planks for back walls. */
const WALL_PLANK: Ramp = ['#1c120c', '#2a1a10', '#3a2416', '#4c301c', '#5e3e24', '#744e2e', '#8a6038', '#a07448'];
const DARK_STONE: Ramp = ['#161214', '#221c1e', '#2e2628', '#3c3234', '#4c4042', '#5e5052', '#726466'];
const SAND: Ramp = ['#4a3a30', '#6a5444', '#8a705a', '#a88a6e', '#c4a684', '#dcc09c', '#eed6b4'];
const VELVET: Ramp = ['#06161a', '#0a2228', '#103038', '#164048', '#1e525a', '#2a6a70', '#3a8486'];
const PLUM: Ramp = ['#0e0614', '#180a22', '#241034', '#321848', '#42225e', '#542e74', '#6a3c8c'];
const CLOTH_W: Ramp = ['#a89c88', '#cfc4ae', '#e8dec8', '#f8f0e0', '#fffaf2'];
const TEAL_CLOTH: Ramp = ['#0c2a2c', '#14403e', '#1c5650', '#2a6e64', '#3a8a7a'];

type Keeper = keyof typeof HUB_CAST;

/**
 * How each keeper looks at their counter: what they hold, their eyes (the irises' colour up close:
 * the little hub figures keep their plain dark eyes), their mood.
 */
export const KEEPER_BUSTS: Partial<Record<Keeper, Omit<BustSpec, 'look'>>> = {
  oracle: { glowEyes: '#ffd84a', lashes: true, mouth: 'smile', tool: 'orbStaff' },
  upgrades: { tool: 'wrench', mouth: 'grin', brows: 'raised', iris: '#e0902a' },
  perks: { tool: 'staff', old: true, mouth: 'flat', iris: '#6a92c8' },
  rebirth: { tool: 'candle', lashes: true, mouth: 'smile', iris: '#d8962a' },
  gate: { tool: 'spear', mouth: 'flat', brows: 'stern', iris: '#b8742a' },
  smith: { tool: 'hammer', mouth: 'grin', iris: '#5a9a4a' },
  // (A man: no lashes, a broad build; a knowing smile and brows up, weighing what a knight is worth.)
  scrap: { tool: 'magnifier', mouth: 'smile', brows: 'raised', iris: '#b8862a' },
  squad: { tool: 'quill', lashes: true, mouth: 'smile', look2: -1, iris: '#3a7ad8' },
};

function bustFor(k: Keeper): BustSpec {
  return { look: HUB_CAST[k].look, ...KEEPER_BUSTS[k] };
}

/** Paints a keeper's scene, `w` x `h` art pixels. */
export function paintKeeperScene(id: StationId, w: number, h: number): SceneArt {
  w = Math.max(120, Math.round(w));
  h = Math.max(72, Math.round(h));
  const L = new Layer(0, 0, w, h);
  const cx = Math.floor(w / 2);
  const base = h - COUNTER_H;
  const P = SCENES[id] ?? SCENES.upgrades;
  return P(L, { w, h, cx, base });
}

interface Frame {
  w: number;
  h: number;
  cx: number;
  /** The counter top's row. */
  base: number;
}

type Painter = (L: Layer, f: Frame) => SceneArt;

/** For things repeated out to the sides on a wide screen: each copy's distance from the middle, nearest first. */
function spread(_cx: number, w: number, first: number, step: number): number[] {
  const out: number[] = [];
  for (let d = first; d < w / 2 + step; d += step) out.push(d);
  return out;
}

/** The key light: a warm lamp in front of the keeper, a little to the left and above. */
function keyLight(L: Layer, f: Frame, color = '#ffd29a', k = 0.95): void {
  L.light(f.cx - 22, f.base - 30, 92, color, k);
}

const SCENES: Record<StationId, Painter> = {
  // ---------------------------------------------------------------- the tinker
  upgrades: (L, f) => {
    const { w, h, cx, base } = f;
    wallPlanks(L, 0, 0, w, h, 31, WALL_PLANK);
    if (base - 70 > 0) beam(L, 0, base - 72, w, base - 66, 4);
    beam(L, 0, 0, w, 4, 5);
    // Shelves of bottles and jars on the left, going on out to the edge.
    const shelfYs = [base - 44, base - 24, base - 64].filter((y) => y > 8);
    for (const sx of spread(cx, w, 30, 72)) {
      const x0 = cx - sx - 64;
      const x1 = cx - sx;
      for (const [i, y] of shelfYs.entries()) {
        shelf(L, x0, x1, y);
        let x = x1 - 6;
        let n = 0;
        while (x > x0 + 4) {
          const seed = sx * 7 + i * 31 + n;
          const kind = h2(seed, 1, 11);
          const hh = 9 + Math.floor(h2(seed, 2, 11) * 7);
          if (kind < 0.62) {
            const cols = ['#3ac87a', '#e04a8a', '#4ab0f0', '#f0b030', '#9a5af0', '#e8e0d0'];
            const c = cols[Math.floor(h2(seed, 3, 11) * cols.length)];
            bottle(L, x, y - 1, { h: hh, w: 5 + (h2(seed, 4, 11) < 0.4 ? 2 : 0), liquid: c, glow: h2(seed, 5, 11) < 0.4, label: h2(seed, 6, 11) < 0.5, round: h2(seed, 7, 11) < 0.5, seed });
            x -= 9;
          } else if (kind < 0.8) {
            jar(L, x - 1, y - 1, 7, 8, ['#c8a040', '#8a6a4a', '#5a9a5a'][n % 3], seed);
            x -= 10;
          } else {
            books(L, x - 9, y - 1, 10, seed, 10);
            x -= 13;
          }
          n++;
        }
      }
    }
    // The slate of upgrades on the right, gears round it, a shelf of gadgets under it.
    const slx = cx + 30;
    const slTop = Math.max(6, base - 64);
    slateBoard(L, slx, slTop, 56, Math.min(32, base - 30 - slTop), 3);
    gear(L, slx + 66, slTop + 10, 8, 10, { turn: 0.2 });
    gear(L, slx + 74, slTop + 26, 5, 8, { turn: 0.5, ramp: ['#2a1e14', '#4a3a28', '#6e5a3e', '#94805a', '#b8a478', '#d8c49a', '#f0e2c0'] });
    gear(L, slx - 6, slTop + 4, 4, 7, { turn: 0.1 });
    shelf(L, cx + 26, cx + 96, base - 22);
    gear(L, cx + 40, base - 29, 5, 8);
    jar(L, cx + 56, base - 23, 8, 9, '#3a8ad0', 9);
    bottle(L, cx + 70, base - 23, { h: 12, w: 5, liquid: '#3ac87a', glow: true, seed: 3 });
    bottle(L, cx + 80, base - 23, { h: 9, w: 7, liquid: '#f0b030', round: true, label: true, seed: 4 });
    for (const sx of spread(cx, w, 104, 72)) {
      slateBoard(L, cx + sx, slTop + 4, 40, 26, sx);
      gear(L, cx + sx + 50, slTop + 16, 7, 9, { turn: sx * 0.1 });
      shelf(L, cx + sx - 4, cx + sx + 64, base - 22);
      bottle(L, cx + sx + 8, base - 23, { h: 12, w: 5, liquid: '#e04a8a', glow: true, seed: sx });
      jar(L, cx + sx + 24, base - 23, 8, 9, '#c8a040', sx + 1);
    }
    lantern(L, cx - 50, 0, Math.max(14, base - 58), { light: 0.7 });
    lantern(L, cx + 56, 0, Math.max(12, base - 70), { light: 0.45, r: 50 });
    keyLight(L, f);
    const bust = paintBust(L, cx, base, bustFor('upgrades'));
    counter(L, 0, w, base, h, { seed: 7, ramp: PLANK });
    bust.front(L);
    // On the bench: a vise, gears and screws, a little clockwork reel, an oil can.
    for (let x = cx - 46; x <= cx - 32; x++) for (let y = base - 7; y <= base; y++) L.px(x, y, rk(IRON, 3.4 - (x - cx + 46) / 8 - (y === base - 7 ? -1 : 0)));
    for (let x = cx - 50; x <= cx - 28; x++) L.px(x, base - 4, rk(IRON, 4.4));
    gear(L, cx - 22, base - 1, 3, 6);
    gear(L, cx + 30, base - 4, 5, 8, { turn: 0.3 });
    gear(L, cx + 38, base - 2, 3, 6, { turn: 0.7 });
    for (const [dx, c] of [[24, '#c0c0d0'], [27, '#9090a0'], [-16, '#c0c0d0']] as const) L.px(cx + dx, base + 1, c);
    // The oil can.
    oval(L, cx + 50, base - 3, 4, 3, (_x, _y, nx, ny) => rk(['#2a3a2a', '#3e5a3a', '#5a7a4e', '#86a46e'], 2.4 - nx - ny));
    for (let i = 0; i < 6; i++) L.px(cx + 53 + i, base - 5 - Math.floor(i / 2), '#5a7a4e');
    return { L, ambient: [0.34, 0.27, 0.3], bloom: 0.85, vignette: 0.32, blink: bust.blink };
  },

  // ---------------------------------------------------------------- the smith
  smith: (L, f) => {
    const { w, h, cx, base } = f;
    wallStone(L, 0, 0, w, h, 12, DARK_STONE);
    // The forge behind him to the right, roaring.
    forge(L, cx + 30, cx + 98, Math.max(18, base - 40), base, 4);
    for (const sx of spread(cx, w, 110, 80)) forge(L, cx + sx, cx + sx + 50, Math.max(22, base - 32), base, sx);
    // Tools on the wall to the left, swords on a rack, a shield.
    toolRack(L, cx - 98, cx - 30, Math.max(6, base - 58), 3);
    for (const [i, x] of [cx - 92, cx - 84, cx - 76].entries()) sword(L, x, base - 36 + i * 2, 24 - i * 2);
    shield(L, cx - 50, base - 26, 9, '#8a2a2a', 4);
    for (const sx of spread(cx, w, 104, 70)) {
      toolRack(L, cx - sx - 60, cx - sx, Math.max(6, base - 52), sx);
      shield(L, cx - sx - 30, base - 24, 8, ['#2a4a8a', '#2e6a3e', '#8a6a2a'][Math.floor(sx / 70) % 3], sx);
    }
    // Sparks drifting up from the forge.
    for (let i = 0; i < 14; i++) {
      const x = cx + 40 + Math.floor(h2(i, 1, 5) * 50);
      const y = Math.floor(base - 46 - h2(i, 2, 5) * 30);
      if (y > 2) L.gl(x, y, h2(i, 3, 5) < 0.5 ? '#ffd060' : '#ff8a3a');
    }
    keyLight(L, f, '#ffc88a', 0.8);
    const bust = paintBust(L, cx, base, bustFor('smith'));
    counter(L, 0, w, base, h, { seed: 9, ramp: ['#1a1210', '#2a1c16', '#3a2820', '#4c362a', '#604636', '#765a46', '#8e6e56', '#a88468'] });
    bust.front(L);
    anvil(L, cx - 36, base + 1);
    // A bucket of water, horseshoes.
    for (let y = base - 9; y <= base + 1; y++) for (let x = cx + 30; x <= cx + 40; x++) L.px(x, y, rk(PLANK, 4 - (x - cx - 30) / 4 + (y === base - 9 ? 2 : 0)));
    for (const y of [base - 7, base - 2]) for (let x = cx + 30; x <= cx + 40; x++) L.px(x, y, rk(IRON, 3));
    for (let x = cx + 31; x <= cx + 39; x++) L.gl(x, base - 9, '#5a8ab0');
    curio(L, 'horseshoe', cx + 44, base + 1, 2);
    return { L, ambient: [0.3, 0.22, 0.23], bloom: 1, vignette: 0.34, blink: bust.blink };
  },

  // ---------------------------------------------------------------- the broker
  // Bram among shelves of curios he's priced (helms, clocks, a skull, an owl), the balance he weighs
  // coins on and the glass he reads a knight's worth through, a ring of keys and price tags at hand.
  scrap: (L, f) => {
    const { w, h, cx, base } = f;
    wallPlanks(L, 0, 0, w, h, 21, WALL_PLANK, 'h');
    const shelfYs = [base - 46, base - 26, base - 66].filter((y) => y > 10);
    const kinds = ['helm', 'clock', 'skull', 'owl', 'horseshoe', 'kettle', 'books', 'bottle', 'jar'];
    for (const side of [-1, 1]) {
      for (const sx of spread(cx, w, 28, 70)) {
        const x0 = side < 0 ? cx - sx - 64 : cx + sx;
        const x1 = x0 + 64;
        for (const [i, y] of shelfYs.entries()) {
          shelf(L, x0, x1, y);
          let x = x0 + 3;
          let n = 0;
          while (x < x1 - 12) {
            const seed = sx * 13 + i * 7 + n + (side > 0 ? 100 : 0);
            const kind = kinds[Math.floor(h2(seed, 1, 17) * kinds.length)];
            if (kind === 'books') {
              books(L, x, y - 1, 10, seed, 9);
              x += 12;
            } else if (kind === 'bottle') {
              bottle(L, x + 3, y - 1, { h: 10, w: 5, liquid: ['#7a9a3a', '#9a4a8a', '#4a7aaa'][n % 3], label: true, seed });
              x += 9;
            } else if (kind === 'jar') {
              jar(L, x + 4, y - 1, 7, 8, '#a8783e', seed);
              x += 10;
            } else x += curio(L, kind, x, y - 1, seed) + 2;
            n++;
          }
        }
      }
    }
    birdcage(L, cx + 52, 0, Math.max(16, base - 50));
    lantern(L, cx - 54, 0, Math.max(12, base - 56), { light: 0.75 });
    keyLight(L, f);
    const bust = paintBust(L, cx, base, bustFor('scrap'));
    counter(L, 0, w, base, h, { seed: 5, ramp: PLANK });
    bust.front(L);
    balance(L, cx - 38, base);
    coins(L, cx - 24, base + 1, 4, 3);
    // A key ring and price tags.
    oval(L, cx + 34, base - 2, 3, 2, (_x, _y, nx) => (Math.abs(nx) > 0.5 ? rk(BRASS, 4) : null));
    for (const dx of [36, 38]) for (let y = base - 1; y <= base + 1; y++) L.px(cx + dx, y, rk(BRASS, 5 - (y - base)));
    for (let x = cx + 44; x <= cx + 50; x++) for (let y = base - 3; y <= base; y++) L.px(x, y, rk(PARCH, 3.4 - (y - base + 3) * 0.2));
    L.px(cx + 46, base - 2, '#8a2a1a');
    L.px(cx + 48, base - 2, '#8a2a1a');
    curio(L, 'clock', cx + 56, base + 1, 9);
    return { L, ambient: [0.32, 0.26, 0.28], bloom: 0.8, vignette: 0.35, blink: bust.blink };
  },

  // ---------------------------------------------------------------- the sage
  perks: (L, f) => {
    const { w, h, cx, base } = f;
    wallPlaster(L, 0, 0, w, h, 8, ['#0a1416', '#10201f', '#163028', '#1e3c34', '#284a40']);
    // Velvet drapes either side, out to the edges.
    for (const sx of spread(cx, w, 26, 66)) {
      drape(L, cx - sx - 40, cx - sx - 6, 0, base, VELVET, { trim: GOLD, seed: sx, gather: 1 });
      drape(L, cx + sx + 6, cx + sx + 40, 0, base, VELVET, { trim: GOLD, seed: sx + 1, gather: 1 });
    }
    // Between them, sigil stones glowing, runes drifting in the air.
    sigilStone(L, cx - 56, base, 30, 2);
    sigilStone(L, cx + 58, base, 34, 5);
    sigilStone(L, cx - 76, base, 18, 7);
    for (let i = 0; i < 16; i++) {
      const x = cx + Math.round((h2(i, 1, 9) - 0.5) * 150);
      const y = Math.round(base - 20 - h2(i, 2, 9) * (base - 26));
      if (Math.abs(x - cx) < 24 || y < 3) continue;
      L.gl(x, y, h2(i, 3, 9) < 0.5 ? '#7af0e0' : '#c0fff4');
      if (h2(i, 4, 9) < 0.4) L.gl(x + 1, y, '#3ac0b0');
    }
    // His high-backed velvet chair behind him: a tall rounded back, gold studs round its edge.
    const backTop = Math.max(2, base - 66);
    for (let y = backTop; y <= base; y++) {
      const t = (y - backTop) / 10;
      const hw = y < backTop + 10 ? Math.round(24 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - t, 2)))) : 24;
      for (let dx = -hw; dx <= hw; dx++) {
        const edge = Math.abs(dx) >= hw - 2 || y <= backTop + 1;
        let k = 3.6 - dx / 18 + (vnoise(cx + dx, y, 4, 6, 3) - 0.5) * 0.8;
        if (edge) k = 2;
        // Buttoned tufts.
        if (!edge && (dx + 30) % 8 === 0 && (y - backTop) % 8 === 4) k = 1.2;
        L.px(cx + dx, y, rk(['#04120e', '#0a2420', '#103630', '#184a40', '#226052', '#2e7866', '#3c907a'], k));
        if (edge && (y + dx) % 4 === 0) L.px(cx + dx, y, rk(GOLD, 4.6));
      }
    }
    candle(L, cx - 34, base - 1, 7, { w: 3 });
    candle(L, cx + 36, base - 1, 10, { w: 3 });
    keyLight(L, f, '#ffe0b0', 0.85);
    L.light(cx + 30, base - 30, 70, '#7af0e0', 0.35);
    const bust = paintBust(L, cx, base, bustFor('perks'));
    counter(L, 0, w, base, h, { seed: 3, ramp: ['#100a08', '#1c120c', '#2a1c12', '#3a2818', '#4c3420', '#5e422a', '#725236', '#886444'], cloth: TEAL_CLOTH, trim: GOLD });
    bust.front(L);
    // An open book and a crystal on the cloth.
    for (let x = cx - 44; x <= cx - 26; x++) for (let y = base - 2; y <= base + 1; y++) L.px(x, y - (Math.abs(x - cx + 35) > 7 ? 1 : 0), rk(PARCH, 3.6 - (x === cx - 35 ? 1.6 : 0) - (y - base) * 0.2));
    for (let x = cx + 28; x <= cx + 34; x++) for (let y = base - 8 + Math.abs(x - cx - 31); y <= base; y++) L.gl(x, y, rk(['#1a6a6a', '#3ab0a0', '#7af0e0', '#d8fff8'], 2.4 - (x - cx - 31) / 3));
    L.light(cx + 31, base - 4, 26, '#7af0e0', 0.45);
    return { L, ambient: [0.22, 0.28, 0.3], bloom: 1, vignette: 0.36, blink: bust.blink };
  },

  // ---------------------------------------------------------------- the priestess
  rebirth: (L, f) => {
    const { w, h, cx, base } = f;
    wallStone(L, 0, 0, w, h, 6, SAND);
    // The niche behind her, the rising sun over her head.
    const nTop = Math.max(2, base - 72);
    for (let y = nTop; y <= base; y++) {
      const t = (y - nTop) / 16;
      const hw = y < nTop + 16 ? Math.round(30 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - t, 2)))) : 30;
      for (let dx = -hw; dx <= hw; dx++) L.px(cx + dx, y, rk(['#2a1a18', '#3a2622', '#4e3430', '#644440', '#7a5650'], 2.4 - dx / 30 - (Math.abs(dx) >= hw - 1 ? 1 : 0) + (y - nTop) / 80));
    }
    sunEmblem(L, cx, Math.max(14, base - 54), 9);
    // Candles on tiered ledges either side, and flowers.
    for (const side of [-1, 1]) {
      for (const sx of spread(cx, w, 34, 60)) {
        const x0 = side < 0 ? cx - sx - 50 : cx + sx;
        for (const [i, y] of [base - 38, base - 20].entries()) {
          if (y < 8) continue;
          for (let x = x0; x < x0 + 50; x++) {
            L.px(x, y, rk(SAND, 6));
            L.px(x, y + 1, rk(SAND, 4));
            L.px(x, y + 2, rk(SAND, 2));
            L.tone(x, y + 3, -0.3);
          }
          for (let k = 0; k < 5; k++) {
            const seed = sx + i * 9 + k + (side > 0 ? 50 : 0);
            candle(L, x0 + 5 + k * 9 + Math.floor(h2(seed, 1, 3) * 3), y - 1, 4 + Math.floor(h2(seed, 2, 3) * 8), { w: 2 + (h2(seed, 3, 3) < 0.3 ? 1 : 0), light: 0.22 });
          }
        }
        flowerPot(L, x0 + 25, base - 1, 9, ['#ff6a8a', '#ffd0e0', '#ffffff'], sx + side);
      }
    }
    keyLight(L, f, '#ffd8b0', 0.9);
    const bust = paintBust(L, cx, base, bustFor('rebirth'));
    counter(L, 0, w, base, h, { seed: 2, ramp: SAND, cloth: CLOTH_W, trim: GOLD });
    bust.front(L);
    candle(L, cx - 30, base, 8, { w: 3, light: 0.4 });
    candle(L, cx - 24, base, 5, { w: 2, light: 0.3 });
    candle(L, cx + 34, base, 7, { w: 3, light: 0.4 });
    flowerPot(L, cx + 46, base + 1, 8, ['#ff3a4a', '#ff8a8a', '#ffd0d0'], 5);
    return { L, ambient: [0.36, 0.29, 0.3], bloom: 1, vignette: 0.32, blink: bust.blink };
  },

  // ---------------------------------------------------------------- the quartermaster
  squad: (L, f) => {
    const { w, h, cx, base } = f;
    wallPlanks(L, 0, 0, w, h, 41, WALL_PLANK);
    beam(L, 0, 0, w, 4, 9);
    // A map pinned up on the right, banners on the left, a rack of spears and shields further out.
    const mTop = Math.max(6, base - 62);
    const mw = 52;
    const mh = Math.min(34, base - 26 - mTop);
    for (let y = mTop; y < mTop + mh; y++) {
      for (let x = cx + 30; x < cx + 30 + mw; x++) {
        const e = Math.min(x - cx - 30, y - mTop, cx + 30 + mw - 1 - x, mTop + mh - 1 - y);
        L.px(x, y, rk(PARCH, 2.8 + (vnoise(x, y, 7, 5, 2) - 0.5) * 1.2 - (e === 0 ? 1 : 0)));
      }
    }
    // Coast, rivers, a road, a red X.
    for (let i = 0; i < mw - 6; i++) {
      const x = cx + 33 + i;
      L.px(x, mTop + 8 + Math.round(Math.sin(i * 0.3) * 3), '#4a6a8a');
      if (i % 3) L.px(x, mTop + mh - 9 + Math.round(Math.sin(i * 0.2 + 1) * 2), '#8a5a3a');
    }
    for (const [dx, dy] of [[0, 0], [1, 1], [2, 2], [2, 0], [0, 2]]) L.px(cx + 66 + dx, mTop + 14 + dy, '#c8302a');
    for (const dx of [0, mw - 1]) L.px(cx + 30 + dx, mTop + 1, '#c8302a');
    banner(L, cx - 46, Math.max(6, base - 64), 14, 34, '#a8302a', '#f4e8d0');
    banner(L, cx - 76, Math.max(6, base - 60), 14, 30, '#2e4270', '#f0c850');
    for (const sx of spread(cx, w, 100, 64)) {
      for (let k = 0; k < 4; k++) {
        const x = cx - sx - 10 - k * 6;
        for (let y = base - 50; y < base; y++) L.px(x, y, rk(PLANK, 4));
        for (let dy = 0; dy < 6; dy++) L.px(x, base - 50 - dy, rk(IRON, 4 - dy * 0.3));
      }
      shield(L, cx + sx + 12, base - 30, 8, '#2e4270', sx);
      shield(L, cx + sx + 34, base - 34, 8, '#a8302a', sx + 1);
    }
    lantern(L, cx - 24, 0, Math.max(10, base - 66), { light: 0.6, r: 60 });
    keyLight(L, f);
    const bust = paintBust(L, cx, base, bustFor('squad'));
    counter(L, 0, w, base, h, { seed: 11, ramp: PLANK });
    bust.front(L);
    ledger(L, cx - 30, base);
    candle(L, cx + 34, base, 6, { w: 3, light: 0.5 });
    // The inkpot.
    for (let y = base - 4; y <= base; y++) for (let x = cx + 22; x <= cx + 27; x++) L.px(x, y, rk(['#0a0a14', '#1a1a2a', '#2a2a40', '#4a4a6a'], 2 - (x - cx - 22) / 3 + (y === base - 4 ? 1 : 0)));
    return { L, ambient: [0.32, 0.27, 0.3], bloom: 0.85, vignette: 0.34, blink: bust.blink };
  },

  // ---------------------------------------------------------------- the Oracle
  altar: (L, f) => {
    const { w, h, cx, base } = f;
    for (const sx of spread(cx, w, 0, 44)) {
      drape(L, cx - sx - 44, cx - sx, 0, base, PLUM, { seed: sx, gather: 1 });
      drape(L, cx + sx, cx + sx + 44, 0, base, PLUM, { seed: sx + 3, gather: 1 });
    }
    // The great reel of the Gilded Reel, glowing behind her: a gilded ring of bulbs, spokes, a star,
    // round her head like a halo.
    const R = 21;
    const ry = Math.max(R + 1, bustGeometry(cx, base).headY + 2);
    for (let y = ry - R - 3; y <= ry + R + 3; y++) {
      for (let x = cx - R - 3; x <= cx + R + 3; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - ry);
        if (d > R + 2.5) continue;
        if (d > R - 1.5) L.px(x, y, rk(GOLD, 4 - (x - cx + y - ry) / (R * 1.2)));
        else if (d > R - 3) L.px(x, y, rk(GOLD, 2));
        else {
          const a = Math.atan2(y - ry, x - cx);
          const spoke = Math.abs(Math.sin(a * 4)) < 0.12;
          L.px(x, y, spoke ? rk(GOLD, 3) : rk(['#0a0e24', '#121a3a', '#1a2650', '#243466'], 2 - d / R));
        }
      }
    }
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * (R + 0.5));
      const y = Math.round(ry + Math.sin(a) * (R + 0.5));
      L.gl(x, y, ['#ffe08a', '#ff7ad8', '#ffd04a', '#7aff9a'][i % 4]);
    }
    L.light(cx, ry, 80, '#ffd27a', 0.45);
    // Stars in the dark of the drapes, shelves of orbs and candles either side.
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(h2(i, 1, 4) * w);
      const y = Math.floor(h2(i, 2, 4) * (base - 6));
      if (Math.abs(x - cx) < R + 6 && Math.abs(y - ry) < R + 6) continue;
      L.gl(x, y, h2(i, 3, 4) < 0.5 ? '#e8d8ff' : '#ffe6a8');
    }
    for (const side of [-1, 1]) {
      for (const sx of spread(cx, w, 40, 64)) {
        const x0 = side < 0 ? cx - sx - 50 : cx + sx;
        const y = base - 30;
        shelf(L, x0, x0 + 50, y, ['#1a0e14', '#2a1620', '#3a2030', '#4c2c40', '#5e3a52', '#724a64', '#885a76', '#a06c8a']);
        crystalOrb(L, x0 + 14, y - 1, 4, side < 0 ? '#5ab0f0' : '#f06ab0');
        candle(L, x0 + 30, y - 1, 6, { light: 0.3 });
        candle(L, x0 + 36, y - 1, 9, { light: 0.3 });
      }
    }
    keyLight(L, f, '#ffcc9a', 0.8);
    const bust = paintBust(L, cx, base, bustFor('oracle'));
    counter(L, 0, w, base, h, { seed: 13, ramp: ['#0e0812', '#1a0e1e', '#28162c', '#38203c', '#4a2c4e', '#5e3a62', '#744a78', '#8c5c90'], trim: GOLD, cloth: ['#1a0a2a', '#2c1640', '#4a2466', '#6e3a8e', '#8e5aae'] });
    bust.front(L);
    crystalOrb(L, cx - 30, base + 1, 8, '#9a6af0');
    // Cards laid out, face up.
    for (const [i, dx] of [26, 34, 42].entries()) {
      for (let y = base - 2; y <= base + 1; y++) for (let x = cx + dx; x < cx + dx + 6; x++) L.px(x, y, rk(PARCH, 3.6 - (y - base + 2) * 0.3));
      L.px(cx + dx + 2, base - 1, ['#c8302a', '#2a4a8a', '#c8902a'][i]);
      L.px(cx + dx + 3, base, ['#c8302a', '#2a4a8a', '#c8902a'][i]);
    }
    return { L, ambient: [0.26, 0.2, 0.33], bloom: 1.1, vignette: 0.38, blink: bust.blink };
  },

  // ---------------------------------------------------------------- the notice board
  quests: (L, f) => {
    const { w, h, cx, base } = f;
    wallPlanks(L, 0, 0, w, h, 51, WALL_PLANK);
    // The board: a timber frame round cork, papered with jobs.
    const bTop = Math.max(14, base - 58);
    const bw = Math.min(w - 40, 150);
    const x0 = cx - Math.floor(bw / 2);
    const x1 = x0 + bw;
    for (let y = bTop; y < base - 2; y++) {
      for (let x = x0; x < x1; x++) {
        const e = Math.min(x - x0, y - bTop, x1 - 1 - x, base - 3 - y);
        if (e < 4) L.px(x, y, rk(TIMBER, e === 0 ? 1 : e === 1 ? 6 : 4 - (e === 3 ? 1 : 0)));
        else L.px(x, y, rk(['#4a2c18', '#6a4024', '#8a5630', '#a06a3c', '#b47c48'], 2.4 + (vnoise(x, y, 2, 2, 4) - 0.5) * 1.6 + (h2(x, y, 9) < 0.1 ? -0.8 : 0)));
      }
    }
    // Notes, each pinned, a little crooked.
    const notes: Array<[number, number, number, number, 'text' | 'wanted' | 'chicken']> = [];
    let n = 0;
    for (let y = bTop + 6; y < base - 22; y += 22) {
      for (let x = x0 + 7; x < x1 - 22; x += 24) {
        const k = h2(n, 1, 5);
        notes.push([x + Math.floor(h2(n, 2, 5) * 4), y + Math.floor(h2(n, 3, 5) * 3), 16 + Math.floor(k * 4), 18, n === 1 ? 'wanted' : n === 4 ? 'chicken' : 'text']);
        n++;
      }
    }
    for (const [i, [x, y, nw, nh, kind]] of notes.entries()) note(L, x, y, nw, nh, i + 3, kind);
    // The gold "!" over the board.
    const ex = cx;
    const ey = bTop - 12;
    for (let y = ey - 9; y <= ey + 3; y++) {
      for (let x = ex - 2; x <= ex + 2; x++) {
        if (y > ey - 2 && y < ey + 1) continue;
        if (y <= ey - 2 && Math.abs(x - ex) > 2 - (y < ey - 7 ? 0 : 0)) continue;
        if (y >= ey + 1 && Math.abs(x - ex) > 1) continue;
        L.gl(x, y, rk(GOLD, 5 - (x - ex) * 0.6));
      }
    }
    L.light(ex, ey - 3, 50, '#ffd04a', 0.5);
    lantern(L, x0 - 14, 0, Math.max(14, base - 50), { light: 0.75 });
    lantern(L, x1 + 14, 0, Math.max(14, base - 50), { light: 0.75 });
    for (const sx of spread(cx, w, bw / 2 + 30, 50)) {
      flowerPot(L, cx - sx, base - 1, 10, ['#ff6a8a', '#ffd0e0', '#ffffff'], sx);
      flowerPot(L, cx + sx, base - 1, 10, ['#ffb04a', '#fff0c0', '#ff6a3a'], sx + 1);
    }
    keyLight(L, f, '#ffd29a', 0.8);
    counter(L, 0, w, base, h, { seed: 15, ramp: PLANK });
    candle(L, cx - 40, base, 6, { w: 3, light: 0.4 });
    coins(L, cx + 36, base + 1, 3, 7);
    return { L, ambient: [0.34, 0.28, 0.29], bloom: 0.9, vignette: 0.32, blink: [] };
  },

  // ---------------------------------------------------------------- the warden at the steps
  gate: (L, f) => {
    const { w, h, cx, base } = f;
    wallStone(L, 0, 0, w, h, 17, DARK_STONE);
    // The archway down behind him: steps falling away into a violet glow.
    const aTop = Math.max(4, base - 70);
    const aw = 30;
    for (let y = aTop; y <= base; y++) {
      const t = (y - aTop) / 18;
      const hw = y < aTop + 18 ? Math.round(aw * Math.sqrt(Math.max(0, 1 - Math.pow(1 - t, 2)))) : aw;
      for (let dx = -hw; dx <= hw; dx++) {
        const depth = (y - aTop) / (base - aTop);
        const step = Math.floor((y - aTop) / 6);
        const lit = 1 - depth;
        let c = rk(['#0a0814', '#140e24', '#1e1638', '#2a2050', '#3c2c6a'], lit * 3 + (step % 2 ? 0.4 : 0));
        if ((y - aTop) % 6 === 0) c = rk(['#2a2050', '#3c2c6a', '#5a44a0'], 1 + lit);
        L.px(cx + dx, y, c);
        if (depth < 0.45) L.halo(cx + dx, y, '#8a5aff', 0.35 * (1 - depth / 0.45));
      }
      L.px(cx - hw - 1, y, rk(STONE, 5));
      L.px(cx + hw + 1, y, rk(STONE, 1));
    }
    L.light(cx, aTop + 18, 70, '#8a5aff', 0.6, 0.2);
    // Lanterns on posts either side.
    for (const sx of spread(cx, w, 46, 70)) {
      for (const s of [-1, 1]) {
        const x = cx + s * sx;
        for (let y = base - 46; y < base; y++) {
          L.px(x, y, rk(IRON, 4));
          L.px(x + 1, y, rk(IRON, 2));
        }
        lantern(L, x, base - 50, base - 44, { light: 0.7, r: 60 });
      }
    }
    keyLight(L, f, '#ffd29a', 0.85);
    const bust = paintBust(L, cx, base, bustFor('gate'));
    // A stone parapet in front of him.
    wallStone(L, 0, base, w, h, 23, STONE);
    for (let x = 0; x < w; x++) {
      L.px(x, base, rk(STONE, 6));
      L.px(x, base + 1, rk(STONE, 4));
    }
    bust.front(L);
    return { L, ambient: [0.22, 0.2, 0.3], bloom: 1, vignette: 0.38, blink: bust.blink };
  },
};
