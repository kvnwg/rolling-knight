/**
 * What stands behind a knight in its pictures (its card, its sheet, its face in the squad's HUD): a
 * little pixel scene for its rarity, the rarer the grander, at the knight's own pixel size so the
 * two read as one picture. The scene is lit like the keepers' (light.ts: stepped, dithered pools of
 * light, things that glow, a soft bloom), always darkest round the knight's middle so it stands out,
 * and every scene works at any size: a wide card shows more of the room, the HUD's little square
 * only the wall behind the head.
 *
 *  - Common: a cellar of rough grey stone, a torch, a cobweb in the corner;
 *  - Uncommon: a mossy ruin, ivy hanging down, grass in the cracks;
 *  - Rare: a hall hung with blue banners between torches;
 *  - Epic: a stage, purple velvet drawn back, a scalloped valance and footlights;
 *  - Legendary: a gilded hall, a sunburst of gold behind, marble pillars, coins on the floor;
 *  - Mythic: a grotto of glowing rose crystals;
 *  - Ancient: a sunken temple, its carved glyphs glowing amber, sand drifted in;
 *  - Exalted: a war hall, crimson banners and braziers;
 *  - Celestial: the night sky, a crescent moon, standing on clouds;
 *  - Astral: an aurora over a snowy ridge;
 *  - Divine: heaven's light, shafts falling on bright clouds, a halo;
 *  - Eternal: a void, a ring of runes turning behind, a rune circle underfoot;
 *  - Primordial: the first sun rising huge over cracked, glowing rock;
 *  - Absolute: a prism, every colour fanning out behind.
 *
 * Pure (no DOM): paintBackdrop returns the lit pixels (RGBA, w x h).
 */
import { RARITY_COLOR, type Rarity } from '../../core/rarity';
import { mixHex } from './draw';
import { GOLD, h2, IRON, Layer, LEAF, oval, rk, rkd, TIMBER, tuft, vnoise, type Ramp } from './hubKit';
import { lightLayer } from './keepers/light';
import { coins } from './keepers/props';

/** Where things are in a backdrop, in its pixels. */
interface Frame {
  w: number;
  h: number;
  /** The knight's middle. */
  cx: number;
  /** The row the knight's feet stand on (can be below the picture: the HUD's face shows no floor). */
  feet: number;
  /** Where the back wall meets the floor (a few rows above the feet). */
  horizon: number;
  /** The knight's head, about (for halos and pools of light). */
  head: number;
  seed: number;
}

interface Look {
  ambient: readonly [number, number, number];
  bloom?: number;
  vignette?: number;
}

type Venue = (L: Layer, f: Frame) => Look;

// ------------------------------------------------------------------ materials

const CELLAR: Ramp = ['#141218', '#1e1b24', '#29252f', '#36313d', '#443e4c', '#544d5c', '#675f6f', '#7d7486'];
const FLAGS: Ramp = ['#100e12', '#1a171d', '#242028', '#2f2a34', '#3b3541', '#48414f', '#575062'];
const ASHLAR: Ramp = ['#1a1a22', '#262632', '#333342', '#424254', '#535368', '#66667c', '#7c7c92', '#9494a8'];
const RUIN: Ramp = ['#141810', '#1e2418', '#283020', '#343e2a', '#424c36', '#525e44', '#647054'];
const ROYAL: Ramp = ['#0a1430', '#10204c', '#183070', '#224296', '#2e58ba', '#4474d6', '#6c98ea'];
const SILVER: Ramp = ['#3a3e4c', '#5a6070', '#848a9a', '#b4bac8', '#dee2ec', '#ffffff'];
const VELVET: Ramp = ['#14061e', '#200a30', '#2e1044', '#3e185c', '#502276', '#642e90', '#7c40ac'];
const STAGE: Ramp = ['#1a0e08', '#2a180e', '#3a2414', '#4c301c', '#5e3e24', '#744e2e', '#8a6038'];
const MARBLE: Ramp = ['#3a2e24', '#54463a', '#706052', '#8e7e6c', '#ac9c88', '#c8baa4', '#e2d6c0', '#f6eedc'];
const ROCK: Ramp = ['#0e0610', '#170a1a', '#221026', '#2e1632', '#3c1e40', '#4c2850'];
const ROSE: Ramp = ['#3a0820', '#6a1238', '#a01e58', '#d43884', '#f466ae', '#ffa2d0', '#ffd8ec', '#fff6fb'];
const SANDSTONE: Ramp = ['#2a1a0e', '#3e2814', '#56381c', '#704a26', '#8c5e32', '#a87440', '#c28c52', '#d8a868'];
const SAND: Ramp = ['#5a3e22', '#76542e', '#926a3a', '#ac8248', '#c49a5a', '#d8b272', '#ead08e'];
const AMBER: Ramp = ['#7a3a08', '#b85a10', '#f08a1a', '#ffb840', '#ffe08a'];
const WARSTONE: Ramp = ['#0e0606', '#180a0a', '#241010', '#321616', '#401e1c', '#502624'];
const CRIMSON: Ramp = ['#2a0408', '#4a080e', '#721016', '#9c1a1e', '#c8282a', '#e8463c', '#ff7a62'];
const FLAME: Ramp = ['#7a1a04', '#c43a08', '#f2701a', '#ffa83a', '#ffd870', '#fff6c8'];
const NIGHT: Ramp = ['#03050f', '#060a1c', '#0a102a', '#0f1838', '#152048', '#1c2a5a', '#24366c'];
const CLOUD_N: Ramp = ['#1a2448', '#26345e', '#344676', '#465a8e', '#5e74a8', '#7c92c2', '#a2b6dc'];
const POLAR: Ramp = ['#020a0c', '#041216', '#061a20', '#0a242c', '#0e3038', '#143c46'];
const AURORA: Ramp = ['#0a3a2c', '#106048', '#18906a', '#2cc48a', '#5ef0ac', '#a8ffd4', '#e8fff4'];
const SNOW: Ramp = ['#1e3442', '#2e4a5c', '#446478', '#5e8296', '#82a2b4', '#a8c4d2', '#d2e6ee', '#f4fcff'];
const HEAVEN: Ramp = ['#c8a468', '#dcbc7e', '#ecd298', '#f6e4b4', '#fcf2d2', '#fffaec', '#ffffff'];
const CLOUD_D: Ramp = ['#b8a48a', '#d0c0a6', '#e4d8c2', '#f2ecde', '#fbf8f0', '#ffffff'];
const VOID: Ramp = ['#06020e', '#0c0418', '#120824', '#1a0c32', '#241242', '#301a54'];
const LILAC: Ramp = ['#3a2a6a', '#5a44a0', '#8068d0', '#a892ec', '#cec0ff', '#f0eaff'];
const DAWN: Ramp = ['#2a0612', '#4a0c16', '#6e1418', '#94221a', '#bc3a1c', '#e05a20', '#f6842a', '#ffb040'];
const SUN: Ramp = ['#ff9a20', '#ffc040', '#ffe070', '#fff4b0', '#fffce8'];
const BASALT: Ramp = ['#060404', '#0e0a08', '#18120e', '#221a14', '#2e241c', '#3c3024'];
const LAVA: Ramp = ['#6a1006', '#b02a08', '#ec5a12', '#ff9a2a', '#ffd25a', '#fff2b0'];
const PRISM = ['#ff5a6a', '#ffa83a', '#ffe85a', '#6af08a', '#4ad4ff', '#6a8aff', '#c86aff'];
const PEARL: Ramp = ['#8a8aa8', '#a8a8c4', '#c8c8de', '#e2e2f2', '#f4f4fc', '#ffffff'];

// ------------------------------------------------------------------ pieces

/**
 * Small pictures (the HUD's 18 px faces) paint flat tones: a dither that reads as texture in a card
 * turns into a checkerboard behind a face that small. Set while one is painted.
 */
let flat = false;

/** A ramp's color at a fractional index: dithered between steps, or the nearest step in a small picture. */
function rd(r: Ramp, k: number, x: number, y: number): string {
  return flat ? rk(r, k) : rkd(r, k, x, y);
}

/** Rows of flagstones from the horizon down, longer and taller toward the front; a dark skirting line on top. */
function flagFloor(L: Layer, f: Frame, ramp: Ramp, seed: number, wet = 0): void {
  let y = f.horizon;
  for (let x = 0; x < f.w; x++) L.px(x, y, ramp[0]);
  y++;
  let row = 0;
  while (y < f.h) {
    const rh = Math.min(f.h - y, 2 + row);
    const bw = 9 + row * 3;
    const shift = Math.floor(h2(row, 3, seed) * bw);
    for (let yy = y; yy < y + rh; yy++) {
      for (let x = 0; x < f.w; x++) {
        const col = Math.floor((x + shift) / bw);
        const ix = (x + shift) % bw;
        if (ix === 0 || yy === y + rh - 1) {
          L.px(x, yy, ramp[1]);
          continue;
        }
        let k = ramp.length * 0.52 + (h2(col, row, seed) - 0.5) * 1.6 + (yy === y ? 0.9 : 0) - row * 0.25;
        if (h2(x, yy, seed + 9) < 0.05) k -= 1;
        // A sheen where the light falls on a polished or wet floor.
        if (wet && Math.abs(x - f.cx) < 10 + row * 4 && h2(x, yy, seed + 2) < wet) k += 1.2;
        L.px(x, yy, rd(ramp, k, x, yy));
      }
    }
    y += rh;
    row++;
  }
}

/** Earth from the horizon down, tufts of grass along it. */
function earthFloor(L: Layer, f: Frame, ramp: Ramp, seed: number, grass = true): void {
  for (let y = f.horizon; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const k = ramp.length * 0.45 + (vnoise(x, y, 5, 2, seed) - 0.5) * 2 - (y === f.horizon ? 1 : 0);
      L.px(x, y, rd(ramp, k, x, y));
    }
  }
  if (!grass) return;
  for (let x = 2; x < f.w - 2; x += 3 + Math.floor(h2(x, 1, seed) * 5)) {
    if (Math.abs(x - f.cx) < 8) continue;
    tuft(L, x, f.horizon + 1 + Math.floor(h2(x, 2, seed) * 3), 3, 3 + Math.floor(h2(x, 3, seed) * 3), { seed: seed + x, tone: 0.55 });
  }
}

/** Sky in bands from `top` (row 0) to `bottom`, each band's edge dithered: the steps of a pixel-art sky. */
function bandedSky(L: Layer, f: Frame, ramp: Ramp, y0: number, y1: number, from: number, to: number, glow = false): void {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0 - 1);
    for (let x = 0; x < f.w; x++) {
      const c = rd(ramp, from + (to - from) * t, x, y);
      if (glow) L.gl(x, y, c);
      else L.px(x, y, c);
    }
  }
}

/** Stars: single pixels, a few bigger ones with a cross of light. */
function stars(L: Layer, f: Frame, y1: number, seed: number, density: number, colors: readonly string[]): void {
  for (let y = 0; y < y1; y++) {
    for (let x = 0; x < f.w; x++) {
      const r = h2(x, y, seed);
      if (r > density) continue;
      // Keep the knight's own middle clear.
      if (Math.abs(x - f.cx) < 7 && y > f.head - 2) continue;
      const c = colors[Math.floor(h2(x, y, seed + 1) * colors.length)];
      L.gl(x, y, c);
      if (r < density * 0.12 && x > 1 && y > 1 && x < f.w - 2) {
        const dim = mixHex(c, '#000000', 0.45);
        L.gl(x - 1, y, dim);
        L.gl(x + 1, y, dim);
        L.gl(x, y - 1, dim);
        L.gl(x, y + 1, dim);
      }
    }
  }
}

/** A torch on an iron bracket, its flame at (x, y). */
function torch(L: Layer, x: number, y: number, light = 0.75): void {
  // Bracket and the wooden handle.
  L.px(x - 1, y + 5, rk(IRON, 2));
  L.px(x, y + 5, rk(IRON, 3));
  L.px(x + 1, y + 5, rk(IRON, 2));
  L.px(x, y + 6, rk(IRON, 1));
  L.px(x, y + 4, rk(TIMBER, 4));
  L.px(x, y + 3, rk(TIMBER, 5));
  L.px(x - 1, y + 2, rk(IRON, 3));
  L.px(x, y + 2, rk(IRON, 4));
  L.px(x + 1, y + 2, rk(IRON, 2));
  // The flame.
  L.gl(x, y + 1, FLAME[2]);
  L.gl(x - 1, y + 1, FLAME[1]);
  L.gl(x + 1, y + 1, FLAME[1]);
  L.gl(x, y, FLAME[4]);
  L.gl(x - 1, y, FLAME[2]);
  L.gl(x, y - 1, FLAME[3]);
  L.gl(x, y - 2, FLAME[2]);
  L.halo(x, y - 3, FLAME[3], 0.5);
  L.light(x, y, 34, '#ffa850', light, 0.3);
}

/** A cloth banner hanging from a rod, pointed at the foot, edged in trim, a device on it. */
function hangBanner(L: Layer, x: number, y: number, w: number, h: number, cloth: Ramp, trim: Ramp, device: 'star' | 'sword' | 'crown'): void {
  for (let xx = x - 1; xx <= x + w; xx++) L.px(xx, y - 1, rk(GOLD, xx === x - 1 || xx === x + w ? 5 : 3));
  const mid = x + (w - 1) / 2;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const tail = y + h - 1 - Math.abs(xx - mid) * 0.9;
      if (yy > tail) continue;
      const edge = xx === x || xx === x + w - 1 || yy > tail - 1;
      if (edge) {
        L.px(xx, yy, rk(trim, xx === x ? 4 : 2.5));
        continue;
      }
      // Folds: a soft ripple across the cloth.
      const k = cloth.length * 0.55 - (xx - x) / w * 1.2 + Math.sin((xx - x) * 1.3 + 0.5) * 0.6;
      L.px(xx, yy, rd(cloth, k, xx, yy));
    }
  }
  const dx = Math.round(mid);
  const dy = y + Math.floor(h * 0.38);
  const dev = trim[trim.length - 2];
  const shapes: Record<typeof device, Array<[number, number]>> = {
    star: [[0, -2], [0, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [0, 1], [-1, 2], [1, 2]],
    sword: [[0, -3], [0, -2], [0, -1], [0, 0], [-1, 1], [0, 1], [1, 1], [0, 2]],
    crown: [[-2, -1], [0, -1], [2, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1]],
  };
  for (const [a, b] of shapes[device]) if (a + dx > x && a + dx < x + w - 1) L.px(dx + a, dy + b, dev);
}

/** A round pillar from y0 to y1, a capital and a base, lit from the left. */
function pillar(L: Layer, x0: number, w: number, y0: number, y1: number, ramp: Ramp, cap: Ramp): void {
  for (let y = y0 + 2; y < y1 - 2; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const t = (x - x0 + 0.5) / w;
      // Fluting: a dark groove every third pixel.
      let k = ramp.length - 1.5 - Math.abs(t - 0.32) * ramp.length * 1.4;
      if ((x - x0) % 3 === 2 && x !== x0 + w - 1) k -= 0.8;
      L.px(x, y, rd(ramp, k, x, y));
    }
  }
  for (const yy of [y0, y0 + 1, y1 - 2, y1 - 1]) {
    for (let x = x0 - 1; x <= x0 + w; x++) {
      const t = (x - x0 + 1.5) / (w + 2);
      L.px(x, yy, rk(cap, cap.length - 1.5 - Math.abs(t - 0.32) * cap.length * 1.2 - (yy === y0 + 1 || yy === y1 - 1 ? 1 : 0)));
    }
  }
}

/** Rays fanning out from (cx, cy), alternating two colors, each `ang` radians; `glow` makes them shine. */
function sunburst(L: Layer, f: Frame, cx: number, cy: number, n: number, colors: readonly string[], y1: number, glow: boolean, r0 = 0): void {
  for (let y = 0; y < y1; y++) {
    for (let x = 0; x < f.w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy < r0 * r0) continue;
      const a = Math.atan2(dy, dx);
      const k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * n);
      const c = colors[((k % colors.length) + colors.length) % colors.length];
      if (glow) L.gl(x, y, c);
      else L.px(x, y, c);
    }
  }
}

/** A crystal growing from (x, foot), `h` tall and `w` wide, leaning by `lean` px; it glows. */
function crystal(L: Layer, x: number, foot: number, h: number, w: number, ramp: Ramp, lean: number, down = false): void {
  const dir = down ? 1 : -1;
  for (let i = 0; i < h; i++) {
    const t = i / h;
    // Hexagonal prism, pointed at the tip.
    const half = t > 0.72 ? Math.max(0, Math.round(((1 - t) / 0.28) * (w / 2))) : Math.round(w / 2);
    const cx = x + Math.round(lean * t);
    const y = foot + dir * i;
    for (let dx = -half; dx <= half; dx++) {
      const facet = dx < 0 ? 4.6 : dx === 0 ? 3.4 : 2.2;
      const k = facet - t * 0.6 + (down ? -0.4 : 0);
      L.gl(cx + dx, y, rk(ramp, k));
    }
  }
  // The bright edge down its lit facet.
  for (let i = 1; i < h * 0.7; i++) L.gl(x + Math.round(lean * (i / h)) - Math.max(0, Math.round(w / 2) - 1), foot + dir * i, rk(ramp, ramp.length - 1.2));
  L.light(x, foot + dir * (h / 2), h * 3, ramp[4], 0.3, 0.15);
}

/** A cloud puff: a lit top, a shaded belly. */
function puff(L: Layer, cx: number, cy: number, rx: number, ry: number, ramp: Ramp, seed: number): void {
  oval(L, cx, cy, rx, ry, (x, y, nx, ny) => {
    const k = ramp.length * 0.62 - ny * ramp.length * 0.38 - nx * 0.5 + (h2(x, y, seed) - 0.5) * 0.5;
    return rd(ramp, k, x, y);
  });
}

/** A bank of cloud puffs whose tops are about at `top`, filling everything below. */
function cloudBank(L: Layer, f: Frame, top: number, ramp: Ramp, seed: number): void {
  for (let y = top + 3; y < f.h; y++) for (let x = 0; x < f.w; x++) L.px(x, y, rd(ramp, ramp.length * 0.32 - (y - top) * 0.08, x, y));
  for (let x = -4; x < f.w + 8; x += 7 + Math.floor(h2(x, 1, seed) * 5)) {
    const r = 5 + Math.floor(h2(x, 2, seed) * 4);
    puff(L, x, top + r * 0.7 + (Math.abs(x - f.cx) < 9 ? 1 : 0), r, r * 0.62, ramp, seed + x);
  }
}

/** A ring of runes round (cx, cy): two thin circles with glyphs between them, glowing. */
function runeRing(L: Layer, cx: number, cy: number, r: number, ry: number, ramp: Ramp, seed: number): void {
  const n = Math.max(24, Math.round(r * 7));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    L.gl(Math.round(cx + c * r), Math.round(cy + s * ry), rk(ramp, 3));
    L.gl(Math.round(cx + c * (r - 3)), Math.round(cy + s * (ry - 3 * (ry / r))), rk(ramp, 2));
  }
  // Glyphs: short ticks and dots between the circles.
  const g = Math.max(8, Math.round(r * 0.9));
  for (let i = 0; i < g; i++) {
    const a = (i / g) * Math.PI * 2 + 0.2;
    const mx = cx + Math.cos(a) * (r - 1.5);
    const my = cy + Math.sin(a) * (ry - 1.5 * (ry / r));
    const kind = Math.floor(h2(i, 3, seed) * 3);
    L.gl(Math.round(mx), Math.round(my), rk(ramp, 4.6));
    if (kind === 1) L.gl(Math.round(mx + Math.sin(a)), Math.round(my - Math.cos(a) * (ry / r)), rk(ramp, 4));
    if (kind === 2) L.gl(Math.round(mx - Math.sin(a)), Math.round(my + Math.cos(a) * (ry / r)), rk(ramp, 4));
  }
}

/** Sparkles: little four-point stars here and there, glowing. */
function sparkles(L: Layer, f: Frame, y0: number, y1: number, seed: number, n: number, colors: readonly string[]): void {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(h2(i, 1, seed) * f.w);
    const y = y0 + Math.floor(h2(i, 2, seed) * (y1 - y0));
    if (Math.abs(x - f.cx) < 8 && y > f.head - 3) continue;
    const c = colors[i % colors.length];
    L.gl(x, y, '#ffffff');
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.gl(x + a, y + b, c);
  }
}

// ------------------------------------------------------------------ the venues

const VENUES: Record<Rarity, Venue> = {
  common: (L, f) => {
    L.rect(0, 0, f.w, f.horizon, CELLAR[2]);
    blocksWall(L, f, CELLAR, 9, 5, f.seed);
    // A crack down the wall, an iron ring, a cobweb in the top left corner.
    let x = f.cx - 14;
    for (let y = 2; y < Math.min(f.horizon - 4, 14); y++) {
      L.px(x, y, CELLAR[0]);
      if (h2(y, 1, f.seed) < 0.4) x += h2(y, 2, f.seed) < 0.5 ? -1 : 1;
    }
    oval(L, f.cx + 9, f.horizon - 14, 1.5, 1.5, (_x, _y, nx, ny) => (nx * nx + ny * ny > 0.3 ? rk(IRON, 3 - ny * 2) : null));
    // A cobweb in the top left corner: threads from the corner, two sagging rings across them.
    const WEB = '#8e8898';
    const WEB2 = '#625c6c';
    for (let i = 0; i < 9; i++) {
      L.px(i, 0, i < 6 ? WEB : WEB2);
      L.px(0, i, i < 6 ? WEB : WEB2);
      if (i < 7) L.px(i, i, i < 5 ? WEB : WEB2);
    }
    for (const [x0, y0] of [[2, 4], [1, 4], [4, 2], [4, 1], [3, 3]]) L.px(x0, y0, WEB2);
    for (const [x0, y0] of [[7, 1], [7, 2], [6, 4], [5, 5], [4, 6], [2, 7], [1, 7]]) L.px(x0, y0, WEB2);
    torch(L, f.cx + 16, f.horizon - 16, 0.7);
    torch(L, f.cx - 26, f.horizon - 16, 0.55);
    flagFloor(L, f, FLAGS, f.seed + 4);
    L.light(f.cx, f.head + 4, 30, '#9aa4c0', 0.18);
    return { ambient: [0.5, 0.5, 0.58], vignette: 0.45 };
  },

  uncommon: (L, f) => {
    blocksWall(L, f, RUIN, 10, 6, f.seed, LEAF);
    // Ivy hanging from the top, leafier at the ends of the strands.
    for (let x = 1; x < f.w; x += 4 + Math.floor(h2(x, 1, f.seed) * 6)) {
      if (Math.abs(x - f.cx) < 6) continue;
      const len = 4 + Math.floor(h2(x, 2, f.seed) * Math.min(14, f.horizon * 0.5));
      let xx = x;
      for (let y = 0; y < len; y++) {
        L.px(xx, y, rk(LEAF, 3 + (y % 3 === 0 ? 1 : 0)));
        if (y % 2 === 1) L.px(xx + (h2(x, y, f.seed) < 0.5 ? -1 : 1), y, rk(LEAF, 5 + h2(x, y + 9, f.seed) * 2));
        if (h2(x, y, f.seed + 3) < 0.25) xx += h2(x, y, f.seed + 4) < 0.5 ? -1 : 1;
      }
      L.px(xx, len, rk(LEAF, 6));
      L.px(xx + 1, len, rk(LEAF, 5));
      L.px(xx - 1, len - 1, rk(LEAF, 5));
    }
    earthFloor(L, f, ['#140e08', '#20160c', '#2c1e10', '#3a2816', '#48321c', '#563c22'], f.seed + 5);
    // A shaft of daylight from a gap above, falling on the left.
    L.light(f.cx - 18, 0, 46, '#e8f0b0', 0.55);
    L.light(f.cx, f.head + 4, 28, '#7af08a', 0.2);
    return { ambient: [0.5, 0.58, 0.48], vignette: 0.4 };
  },

  rare: (L, f) => {
    blocksWall(L, f, ASHLAR, 12, 6, f.seed);
    const top = Math.max(2, f.horizon - 30);
    const bh = Math.min(20, f.horizon - top - 3);
    for (const side of [-1, 1]) {
      hangBanner(L, f.cx + side * 13 - 3, top, 7, bh, ROYAL, SILVER, 'star');
      torch(L, f.cx + side * 24, f.horizon - 17, 0.75);
    }
    flagFloor(L, f, FLAGS, f.seed + 6, 0.08);
    L.light(f.cx, f.head + 4, 28, '#6aa4ff', 0.24);
    return { ambient: [0.42, 0.44, 0.56], vignette: 0.4 };
  },

  epic: (L, f) => {
    // The stage's back: dark damask, a diamond pattern faintly in it.
    for (let y = 0; y < f.horizon; y++) {
      for (let x = 0; x < f.w; x++) {
        const d = (Math.abs(((x - f.cx + 64) % 8) - 4) + Math.abs((y % 8) - 4)) === 4;
        L.px(x, y, d ? VELVET[2] : rd(VELVET, 1.1 + (vnoise(x, y, 6, 6, f.seed) - 0.5) * 0.6, x, y));
      }
    }
    const open = 12;
    curtain(L, -2, f.cx - open, f.horizon + 1, VELVET, f.seed, 1);
    curtain(L, f.cx + open, f.w + 2, f.horizon + 1, VELVET, f.seed + 1, -1);
    // The valance: a scalloped band of velvet with a gold fringe.
    for (let x = 0; x < f.w; x++) {
      const dip = 3 + Math.round(Math.abs(Math.sin((x - f.cx) * (Math.PI / 9))) * 2);
      for (let y = 0; y < dip; y++) L.px(x, y, rd(VELVET, 3.5 - y * 0.4, x, y));
      L.px(x, dip, rk(GOLD, x % 2 ? 4 : 5));
      if (x % 3 === 0) L.px(x, dip + 1, rk(GOLD, 3));
    }
    // A stage of boards, footlights glowing along its front.
    for (let y = f.horizon; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const seam = (y - f.horizon) % 3 === 2 || (x + (y - f.horizon) * 5) % 13 === 0;
        L.px(x, y, seam ? STAGE[1] : rd(STAGE, 3.6 - (y - f.horizon) * 0.15 + (h2(x >> 2, y, f.seed) - 0.5), x, y));
      }
    }
    for (let x = 3; x < f.w; x += 9) {
      if (f.h - 2 <= f.feet + 1) break;
      L.px(x - 1, f.h - 1, rk(GOLD, 2));
      L.px(x, f.h - 1, rk(GOLD, 3));
      L.px(x + 1, f.h - 1, rk(GOLD, 2));
      L.gl(x, f.h - 2, '#fff2c0');
      L.light(x, f.h - 2, 16, '#ffd890', 0.35, 0.15);
    }
    // The spotlight: a warm pool on the back cloth behind the knight.
    L.light(f.cx, f.head + 2, 22, '#ffe2a8', 0.6);
    return { ambient: [0.72, 0.6, 0.8], vignette: 0.45, bloom: 0.8 };
  },

  legendary: (L, f) => {
    const cy = Math.min(f.head + 6, f.horizon - 4);
    sunburst(L, f, f.cx, cy, 22, [GOLD[2], '#6e4614'], f.horizon, false);
    // A gold rim round the burst's middle, so the knight stands in a ring of light.
    oval(L, f.cx, cy, 15, 15, (x, y, nx, ny) => {
      const d = nx * nx + ny * ny;
      if (d < 0.86) return d < 0.6 ? rd(MARBLE, 1.4, x, y) : null;
      L.gl(x, y, rk(GOLD, 4.6 - ny * 0.8));
      return null;
    });
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? f.cx - 24 : f.cx + 19;
      pillar(L, x0, 6, Math.max(0, f.horizon - 34), f.horizon + 1, MARBLE, GOLD);
    }
    // Polished floor: gold and cream checks, the light shining on it.
    for (let y = f.horizon; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const row = y - f.horizon;
        const sz = 4 + row;
        const chk = (Math.floor((x - f.cx + 400) / sz) + Math.floor(row / 2)) % 2;
        L.px(x, y, rd(chk ? MARBLE : GOLD, (chk ? 5.2 : 3.6) - row * 0.2 + (y === f.horizon ? 1 : 0), x, y));
      }
    }
    L.px(f.cx, f.horizon, GOLD[6]);
    if (f.h - f.feet > 2) {
      coins(L, f.cx - 17, f.h - 1, 6, f.seed);
      coins(L, f.cx + 17, f.h - 1, 5, f.seed + 1);
    }
    L.light(f.cx, cy, 34, '#ffd870', 0.38);
    return { ambient: [0.74, 0.64, 0.5], vignette: 0.38, bloom: 0.7 };
  },

  mythic: (L, f) => {
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const k = 2.2 + (vnoise(x, y, 7, 5, f.seed) - 0.5) * 2.6 - (Math.abs(x - f.cx) < 12 ? 0.6 : 0);
        L.px(x, y, rd(ROCK, k, x, y));
      }
    }
    // Crystals: clusters rising at the sides, a few hanging from the roof.
    const groups: Array<[number, number, number, number, number]> = [
      [-19, 12, 4, -2, 0], [-14, 8, 3, -1, 1], [-24, 7, 3, -3, 2], [17, 13, 4, 2, 3], [13, 7, 3, 1, 4], [23, 9, 3, 3, 5], [-31, 10, 4, -2, 6], [30, 11, 4, 2, 7],
    ];
    for (const [dx, h, w, lean] of groups) crystal(L, f.cx + dx, f.horizon + 2, Math.min(h, f.horizon - 2), w, ROSE, lean);
    for (const [dx, h] of [[-9, 7], [11, 5], [-23, 9], [22, 7], [-33, 6], [32, 8]] as const) shard(L, f.cx + dx, h, ROSE);
    earthFloor(L, f, ['#0e0610', '#170a1a', '#221026', '#2e1632', '#3c1e40'], f.seed + 3, false);
    for (let x = 1; x < f.w; x += 5) if (Math.abs(x - f.cx) > 8 && h2(x, 3, f.seed) < 0.6) L.gl(x, f.horizon + 1 + Math.floor(h2(x, 4, f.seed) * 3), ROSE[5]);
    sparkles(L, f, 2, f.horizon - 2, f.seed, Math.round(f.w / 9), [ROSE[4], '#ffffff']);
    L.light(f.cx, f.head + 4, 28, '#ff7ac0', 0.35);
    return { ambient: [0.5, 0.4, 0.52], vignette: 0.42, bloom: 1 };
  },

  ancient: (L, f) => {
    // Great sandstone blocks, a carved panel of glowing glyphs to each side.
    blocksWall(L, f, SANDSTONE.slice(0, 6), 14, 7, f.seed);
    for (const side of [-1, 1]) {
      const px = f.cx + side * 17 - 4;
      const py = Math.max(1, f.horizon - 26);
      const ph = Math.min(18, f.horizon - py - 4);
      for (let y = py; y < py + ph; y++) for (let x = px; x < px + 9; x++) L.px(x, y, rk(SANDSTONE, x === px || y === py ? 2 : 3.4));
      const glyphs = ['x.x.x', 'xxxxx', '..x..', 'x.xxx', 'xxx.x', '.x.x.', 'xx.xx'];
      for (let r = 0; r * 4 + 2 < ph - 1; r++) {
        const g = glyphs[Math.floor(h2(r, side + 3, f.seed) * glyphs.length)];
        [...g].forEach((ch, i) => {
          if (ch !== 'x') return;
          L.gl(px + 2 + i, py + 2 + r * 4, rk(AMBER, 3));
          if (h2(i, r, f.seed + side) < 0.5) L.gl(px + 2 + i, py + 3 + r * 4, rk(AMBER, 2));
        });
      }
      L.light(px + 4, py + ph / 2, 26, '#ffb040', 0.35, 0.2);
    }
    // A broken column on the right, vines down the left.
    pillar(L, f.cx + 25, 5, Math.max(0, f.horizon - 16), f.horizon + 1, SANDSTONE, SANDSTONE);
    for (let y = 0; y < Math.min(f.horizon - 2, 16); y++) L.px(f.cx - 27 + (y % 4 < 2 ? 0 : 1), y, rk(LEAF, 3 + (y % 3) * 0.8));
    // Sand drifted in, rippled.
    for (let y = f.horizon; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const ripple = Math.sin(x * 0.5 + y * 1.7 + vnoise(x, y, 9, 3, f.seed) * 4) > 0.75;
        L.px(x, y, rd(SAND, 3.4 - (y - f.horizon) * 0.1 + (ripple ? 1.2 : 0) + (y === f.horizon ? -1.2 : 0), x, y));
      }
    }
    return { ambient: [0.56, 0.46, 0.38], vignette: 0.42, bloom: 0.8 };
  },

  exalted: (L, f) => {
    blocksWall(L, f, WARSTONE, 11, 6, f.seed);
    const top = Math.max(1, f.horizon - 32);
    for (const side of [-1, 1]) {
      hangBanner(L, f.cx + side * 13 - 3, top, 7, Math.min(24, f.horizon - top - 2), CRIMSON, GOLD, 'sword');
      // A brazier on its stand, fire leaping out of it.
      const bx = f.cx + side * 24;
      const by = f.horizon - 8;
      for (let y = by + 3; y <= f.horizon + 1; y++) L.px(bx, y, rk(IRON, 2 + (y % 2)));
      for (let dx = -3; dx <= 3; dx++) {
        L.px(bx + dx, by + 2, rk(IRON, 3.4 - Math.abs(dx) * 0.3));
        if (Math.abs(dx) < 3) L.px(bx + dx, by + 3, rk(IRON, 1.6));
      }
      const flame = [[-2, 1, 1], [-1, 1, 2], [0, 1, 2], [1, 1, 2], [2, 1, 1], [-1, 0, 3], [0, 0, 4], [1, 0, 3], [0, -1, 4], [-1, -1, 2], [1, -2, 2], [0, -2, 3], [0, -3, 2], [-1, -4, 1]];
      for (const [a, b, k] of flame) L.gl(bx + a, by + b, FLAME[k]);
      L.light(bx, by - 2, 40, '#ff7a3a', 0.85, 0.3);
    }
    flagFloor(L, f, ['#0a0404', '#140808', '#200c0c', '#2c1212', '#3a1816', '#48201c'], f.seed + 7, 0.1);
    L.light(f.cx, f.head + 4, 26, '#ff5060', 0.3);
    return { ambient: [0.5, 0.36, 0.36], vignette: 0.45, bloom: 0.9 };
  },

  celestial: (L, f) => {
    bandedSky(L, f, NIGHT, 0, f.horizon + 2, 1, 6, true);
    stars(L, f, f.horizon, f.seed, 0.022, ['#ffffff', '#c8e8ff', '#a8f4ff']);
    // The crescent moon, top left.
    const mx = Math.max(6, f.cx - 20);
    const my = Math.max(5, Math.min(9, f.head - 2));
    oval(L, mx, my, 4.5, 4.5, (x, y) => {
      const ox = x + 0.5 - (mx + 2);
      const oy = y + 0.5 - (my - 1.5);
      if (ox * ox + oy * oy < 15) return null;
      L.gl(x, y, x < mx - 1 ? '#fffbe8' : '#e8f4ff');
      return null;
    });
    L.light(mx, my, 40, '#c8f0ff', 0.3);
    cloudBank(L, f, f.horizon - 1, CLOUD_N, f.seed + 2);
    L.light(f.cx, f.head + 4, 30, '#38e8ff', 0.35);
    return { ambient: [0.9, 0.95, 1], vignette: 0.3, bloom: 1 };
  },

  astral: (L, f) => {
    // (The sky goes all the way down: the ridge dips below the horizon toward the sides.)
    bandedSky(L, f, POLAR, 0, f.h, 0.6, 5 + (f.h - f.horizon) * (4.4 / Math.max(1, f.horizon)), true);
    stars(L, f, f.horizon, f.seed, 0.016, ['#ffffff', '#c8fff0']);
    // The aurora: curtains of light hanging in folds, brightest at their lower hem.
    for (let x = 0; x < f.w; x++) {
      const hem = Math.round(f.horizon * 0.55 + Math.sin(x * 0.21 + f.seed) * 4 + Math.sin(x * 0.07) * 3);
      const len = 8 + Math.round(vnoise(x, 0, 6, 1, f.seed) * 10);
      for (let i = 0; i < len; i++) {
        const y = hem - i;
        if (y < 0) break;
        const fold = vnoise(x, 0, 3, 1, f.seed + 1);
        const k = 4.4 - i * (4 / len) + fold * 1.2;
        // Thin between the folds, ragged at the top.
        if (fold < 0.25 && i > 2) continue;
        if (i > len - 4 && !dot(x, y, (len - i) / 4)) continue;
        L.gl(x, y, rd(AURORA, k, x, y));
      }
    }
    // A ridge of snow, crisp in the light, the knight on its top.
    for (let x = 0; x < f.w; x++) {
      const top = f.horizon - 1 + Math.round(Math.abs(x - f.cx) * 0.12 + Math.sin(x * 0.4) * 0.8);
      for (let y = top; y < f.h; y++) L.px(x, y, rd(SNOW, (y === top ? 7 : 5.2) - (y - top) * 0.3 - (x - f.cx) * 0.02, x, y));
    }
    L.light(f.cx, f.head + 4, 30, '#4dffb4', 0.35);
    return { ambient: [0.92, 1, 0.98], vignette: 0.32, bloom: 1 };
  },

  divine: (L, f) => {
    bandedSky(L, f, HEAVEN, 0, f.horizon + 2, 6, 2.2, false);
    // Shafts of light falling from above, a dithered edge to each.
    for (let x = 0; x < f.w; x++) {
      const s = Math.sin((x - f.cx) * 0.55) + Math.sin((x - f.cx) * 0.23 + 1);
      if (s < 0.8) continue;
      for (let y = 0; y < f.horizon; y++) if (dot(x, y, 0.5 + (s - 0.8))) L.px(x, y, mixHex(L.get(x, y) ?? HEAVEN[4], '#ffffff', 0.45));
    }
    // A halo behind the knight's head.
    const hy = f.head - 1;
    oval(L, f.cx, hy, 9, 9, (x, y, nx, ny) => {
      const d = nx * nx + ny * ny;
      if (d > 0.62) L.gl(x, y, d > 0.85 ? '#ffd860' : '#fff2b0');
      return null;
    });
    cloudBank(L, f, f.horizon - 1, CLOUD_D, f.seed + 2);
    for (const dx of [-21, 19]) L.gl(f.cx + dx, f.horizon - 6, '#ffffff');
    sparkles(L, f, 1, f.horizon - 3, f.seed, Math.round(f.w / 10), ['#ffe080', '#fff4c0']);
    return { ambient: [1, 0.98, 0.92], vignette: 0.18, bloom: 0.8 };
  },

  eternal: (L, f) => {
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const n = vnoise(x, y, 11, 7, f.seed) + vnoise(x, y, 4, 4, f.seed + 1) * 0.4;
        L.gl(x, y, rd(VOID, 0.8 + n * 3.2, x, y));
      }
    }
    stars(L, f, f.h, f.seed + 4, 0.012, ['#cec0ff', '#ffffff']);
    const cy = Math.min(f.head + 6, f.horizon - 6);
    runeRing(L, f.cx, cy, 17, 17, LILAC.slice(0, 5), f.seed);
    // Faint arcs further out, as if more rings turned in the dark.
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      if (Math.sin(a * 3 + f.seed) < 0.2) continue;
      L.gl(Math.round(f.cx + Math.cos(a) * 25), Math.round(cy + Math.sin(a) * 25), LILAC[1]);
    }
    // The platform: a flat ellipse of runes under the feet.
    if (f.feet < f.h + 2) runeRing(L, f.cx, f.feet - 1, 14, 3, LILAC, f.seed + 2);
    sparkles(L, f, 1, f.h - 1, f.seed + 3, Math.round(f.w / 8), [LILAC[3], LILAC[4]]);
    return { ambient: [1, 1, 1], vignette: 0.32, bloom: 0.8 };
  },

  primordial: (L, f) => {
    bandedSky(L, f, DAWN, 0, f.horizon + 2, 1, 7.4, true);
    // The first sun, huge, rising behind the knight; heat bands across it.
    const sy = Math.min(f.head + 10, f.horizon);
    oval(L, f.cx, sy, 19, 19, (x, y, nx, ny) => {
      if (y > f.horizon) return null;
      const d = Math.sqrt(nx * nx + ny * ny);
      let k = 3.4 - d * 2.6;
      if ((y - sy + 40) % 4 === 0 && d > 0.35) k -= 1;
      L.gl(x, y, rd(SUN, k, x, y));
      return null;
    });
    // Cracked black rock, lava glowing in the cracks.
    for (let y = f.horizon; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const v = vnoise(x, y, 6, 3, f.seed);
        const crack = Math.abs(v - 0.5) < 0.045 && Math.abs(x - f.cx) > 3;
        if (crack) L.gl(x, y, rk(LAVA, 3.4 - (y - f.horizon) * 0.2));
        else L.px(x, y, rd(BASALT, 3.6 - (y - f.horizon) * 0.3 + (y === f.horizon ? 1.5 : 0), x, y));
      }
    }
    for (const dx of [-26, -15, 14, 25]) {
      const peak = f.horizon - 4 - Math.floor(h2(dx, 1, f.seed) * 6);
      for (let y = peak; y <= f.horizon; y++) {
        const half = Math.floor((y - peak) * 0.9);
        for (let k = -half; k <= half; k++) L.px(f.cx + dx + k, y, rk(BASALT, k < 0 ? 3 : 1.5));
      }
    }
    L.light(f.cx, sy, 40, '#ffb040', 0.4);
    return { ambient: [0.8, 0.62, 0.5], vignette: 0.35, bloom: 0.6 };
  },

  absolute: (L, f) => {
    const cy = Math.min(f.head + 6, f.horizon - 2);
    bandedSky(L, f, PEARL, 0, f.h, 4.4, 2.6, false);
    // Light split into every colour: thin rays, each colour between two of pearl, out of a white core.
    const rays = PRISM.flatMap((c) => [mixHex(c, '#ffffff', 0.2), PEARL[4], mixHex(c, '#ffffff', 0.5), PEARL[5]]);
    sunburst(L, f, f.cx, cy, rays.length, rays, f.horizon, false, 6);
    oval(L, f.cx, cy, 7, 7, (x, y, nx, ny) => {
      const d = nx * nx + ny * ny;
      if (d > 0.72) L.gl(x, y, '#ffe890');
      else L.gl(x, y, '#ffffff');
      return null;
    });
    // A floor of crystal: pale panes, each with a thread of colour along its seam.
    for (let y = f.horizon; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const row = y - f.horizon;
        const pane = 6 + row * 2;
        const ix = (x - f.cx + 600) % pane;
        const c = PRISM[Math.floor((x - f.cx + 600) / pane) % PRISM.length];
        L.px(x, y, y === f.horizon ? '#ffffff' : ix === 0 ? mixHex(c, '#ffffff', 0.3) : rd(PEARL, 4.6 - row * 0.3, x, y));
      }
    }
    sparkles(L, f, 1, f.horizon - 1, f.seed, Math.round(f.w / 7), PRISM);
    return { ambient: [1, 1, 1], vignette: 0.22, bloom: 0.5 };
  },
};

/**
 * A velvet curtain drawn back to one side (`toward` +1: gathered toward the right edge of its span,
 * -1: the left): broad folds, deep shadow in each, a gold edge on the side by the knight.
 */
function curtain(L: Layer, x0: number, x1: number, y1: number, ramp: Ramp, seed: number, toward: 1 | -1): void {
  // The edge by the knight: straight down from the top, pulled out to the tie-back two thirds of
  // the way down, flaring a little back in below it.
  const tie = Math.round(y1 * 0.62);
  const inner = (y: number): number => {
    const pull = y < tie ? Math.pow(y / tie, 1.6) * 6 : 6 - ((y - tie) / Math.max(1, y1 - tie)) * 2.5;
    return toward > 0 ? x1 - Math.round(pull) : x0 + Math.round(pull);
  };
  for (let y = 0; y < y1; y++) {
    const e = inner(y);
    const a = toward > 0 ? x0 : e;
    const b = toward > 0 ? e : x1;
    for (let x = a; x < b; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0);
      // Folds gather toward the tie-back and loosen above and below it.
      const squeeze = 1 - Math.min(1, Math.abs(y - tie) / tie) * 0.35;
      const p = (x - (toward > 0 ? e : e)) * 0.62 * (1 + squeeze * 0.4);
      const g = Math.sin(p);
      let k = 3.6 + g * 1.5 + (g > 0.8 ? 0.7 : 0) + (vnoise(x, y, 3, 12, seed) - 0.5) * 0.5;
      k -= (toward > 0 ? 1 - u : u) * 1.4;
      L.px(x, y, rd(ramp, k, x, y));
    }
    // The gold edging down the inside edge.
    const ex = toward > 0 ? e - 1 : e;
    L.px(ex, y, rk(GOLD, y % 4 === 0 ? 5 : 3.8));
  }
  // The tie-back: a gold rope looped round the gathered cloth, a tassel hanging from it.
  const ex = inner(tie);
  const rx = toward > 0 ? ex - 4 : ex + 1;
  for (let k = 0; k < 4; k++) L.px(rx + k, tie, rk(GOLD, 5 - (k % 2)));
  for (let k = 0; k < 4; k++) L.px(rx + k, tie + 1, rk(GOLD, 2.6));
  const tx = toward > 0 ? ex : ex - 1;
  L.px(tx, tie + 1, rk(GOLD, 5));
  L.px(tx, tie + 2, rk(GOLD, 4));
  L.px(tx, tie + 3, rk(GOLD, 3));
  L.px(tx - 1, tie + 4, rk(GOLD, 3));
  L.px(tx + 1, tie + 4, rk(GOLD, 2));
  L.px(tx, tie + 4, rk(GOLD, 4));
}

/** A shard of crystal hanging from the roof at x, `h` long: wide at the top, a point at the foot. */
function shard(L: Layer, x: number, h: number, ramp: Ramp): void {
  for (let y = 0; y < h; y++) {
    const half = Math.max(0, Math.round((1 - y / h) * 2.2));
    for (let dx = -half; dx <= half; dx++) L.gl(x + dx, y, rk(ramp, (dx < 0 ? 5 : dx === 0 ? 3.6 : 2.4) - y * 0.12));
  }
  L.gl(x, h, ramp[5]);
  L.light(x, h / 2, h * 3, ramp[4], 0.25, 0.15);
}

/** A wall of blocks from the top down to the horizon (a little past it, under the floor's skirting). */
function blocksWall(L: Layer, f: Frame, ramp: Ramp, bw: number, bh: number, seed: number, moss?: Ramp): void {
  for (let y = 0; y <= f.horizon; y++) {
    for (let x = 0; x < f.w; x++) {
      const row = Math.floor((f.horizon - y) / bh);
      const iy = (f.horizon - y) % bh;
      const shift = Math.floor(h2(row, 0, seed) * bw);
      const col = Math.floor((x + shift) / bw);
      const ix = (x + shift) % bw;
      if (iy === 0 || ix === 0) {
        L.px(x, y, ramp[0]);
        continue;
      }
      let k = ramp.length * 0.5 + (h2(col, row, seed + 1) - 0.5) * 1.6 + (vnoise(x, y, 4, 3, seed + 2) - 0.5) * 0.8;
      if (iy === bh - 1) k += 1;
      if (ix === 1) k += 0.5;
      if (iy === 1) k -= 0.7;
      if (ix === bw - 1) k -= 0.5;
      if (h2(x, y, seed + 3) < 0.04) k -= 1.2;
      let c = rd(ramp, k, x, y);
      if (moss && iy <= 2 && vnoise(x, y, 7, 5, seed + 4) > 0.55 && h2(x, y, seed + 5) < 0.6) c = rk(moss, 2 + h2(x, y, seed + 6) * 3);
      L.px(x, y, c);
    }
  }
}

/** A sparse 2x2 ordered dither: true on a share `f` (0..1) of pixels. */
function dot(x: number, y: number, f: number): boolean {
  const m = [0.125, 0.625, 0.875, 0.375][(x & 1) + ((y & 1) << 1)];
  return f > m;
}

// ------------------------------------------------------------------ painting one

export interface BackdropOpts {
  /** Where the knight's feet are, in rows from the picture's foot (default 5: a card's picture). */
  feetUp?: number;
}

/**
 * The backdrop for a knight of `rarity`, `w` x `h` of the knight's own pixels, the knight standing in
 * the middle with its feet `feetUp` rows above the foot (a negative number puts the floor below the
 * picture: the HUD's face). The lit pixels, RGBA.
 */
export function paintBackdrop(rarity: Rarity, w: number, h: number, o: BackdropOpts = {}): Uint8ClampedArray<ArrayBuffer> {
  w = Math.max(8, Math.round(w));
  h = Math.max(8, Math.round(h));
  const L = new Layer(0, 0, w, h);
  const feet = h - (o.feetUp ?? 5);
  const f: Frame = { w, h, cx: Math.floor(w / 2), feet, horizon: feet - 4, head: feet - 22, seed: 7 + rarityIndexOf(rarity) * 131 };
  flat = w * h <= 24 * 24;
  try {
    const look = VENUES[rarity](L, f);
    // (A small picture's light falls smoothly too, and its corners don't darken: there's no room.)
    return lightLayer(L, { ambient: look.ambient, vignette: flat ? 0 : (look.vignette ?? 0.35), bloom: look.bloom ?? 0.8, bloomR: flat ? 1 : 2, bands: flat ? 24 : 5 });
  } finally {
    flat = false;
  }
}

function rarityIndexOf(r: Rarity): number {
  return Object.keys(RARITY_COLOR).indexOf(r);
}

/** Every rarity's backdrop has a venue (for tests). */
export function backdropRarities(): Rarity[] {
  return Object.keys(VENUES) as Rarity[];
}

