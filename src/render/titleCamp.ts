/**
 * The title screen's backdrop: the squad's camp in a forest clearing on a clear night. A moon over
 * banks of pixel cloud drifting by, pines stepping back into the mist, a far hill with a lit tower on
 * it, and in the clearing the campfire under its spit, a tent and the squad standing round the fire.
 *
 * It is drawn as chunky pixel art (about 160 art pixels across the screen's short side, each one a
 * whole block of device pixels, never smoothed), in a cool green night with the fire's warm light
 * on top. The light is the scene's "shader": every pixel the fire reaches is worked out once, its
 * warm share kept on a layer of its own that's added over the scene with the fire's flicker, in
 * dithered bands like the rest of the pixel art; the fire and the moon bloom; the moon rims the
 * tops of the trees and clouds; a vignette closes the corners. Embers, smoke and fireflies move over
 * it, the stars twinkle and the clouds and the mist drift.
 *
 * `draw` each frame (ui/VistaCanvas.tsx); `ready` once it's built (the hub is got ready behind it then).
 */
import type { MutationId } from '../core/state';
import { onGraphicsReset } from './art/draw';
import { knightSprite, type KnightSprite } from './vista/camp';
import { canvas, clamp, ctx2d, css, fbm1, h01, hex, mix, noise1, Pix, rng, type Canvas, type RGB } from './vista/pix';

export interface CampHero {
  id: string;
  mutation: MutationId | null;
}

export interface CampOptions {
  heroes: CampHero[];
  reduceMotion?: boolean;
}

// ------------------------------------------------------------------ palette

/** The sky from the top of the screen down to the horizon: near black to a deep sea green. */
const SKY = ['#02070a', '#040c10', '#061316', '#08191b', '#0b2021', '#0e2827', '#12322e', '#173d35', '#1e4a3d', '#285a48'].map(hex);
const STAR = hex('#d6f0dc');
const STAR_HOT = hex('#ffffff');
const SPARKLE = hex('#9ff0c8');
const MOON = hex('#f4f8e2');
const MOON_SHADE = hex('#cfe0bc');
const MOON_DARK = hex('#a9c39e');
const MOON_GLOW = hex('#8fd0ac');
/** The moon's edge on the knights (their far side from the fire). */
const MOON_RIM: RGB = [176, 236, 206];
const HILL = hex('#0f2a25');
const HILL_RIM = hex('#2a5a49');
const MIST = hex('#2c5e4e');
/** Tree layers back to front: body, the moon's rim on it. */
const TREES: ReadonlyArray<readonly [RGB, RGB]> = [
  [hex('#0d2620'), hex('#1f4a3c')],
  [hex('#091c18'), hex('#1a3f33')],
  [hex('#05120f'), hex('#133328')],
];
/** The clearing, far to near; grass light and dark. */
const GROUND_NEAR = hex('#0c2219');
const GRASS_LIT = hex('#3a7452');
const GRASS_DARK = hex('#07160f');
const FORE = hex('#020806');
const DIRT = hex('#2a2c1e');
const DIRT_DARK = hex('#1c1d13');
const WOOD = hex('#3b2616');
const WOOD_DARK = hex('#1f140b');
const WOOD_LIT = hex('#6a4426');
const STONE = hex('#3c4a44');
const STONE_TOP = hex('#5b6b62');
const STONE_DARK = hex('#222b27');
const CANVAS_FRONT = hex('#7a5530');
const CANVAS_SEAM = hex('#5e3f22');
const CANVAS_EDGE = hex('#9a7040');
const CANVAS_SIDE = hex('#2e3b34');
const CANVAS_SIDE_DARK = hex('#212b26');
const TENT_DOOR = hex('#0e0907');
const IRON = hex('#1a1a1c');
const IRON_LIT = hex('#55504a');
/** The fire, darkest to hottest. */
const FLAME = ['#6e140e', '#b52c16', '#e85a1a', '#ff9a30', '#ffd25e', '#fff4c8'].map(hex);
const WARM = hex('#ff9c40');
const EMBER = [hex('#ffe08a'), hex('#ffa040'), hex('#e0501e')];
const FIREFLY = hex('#e6ff9a');
const SMOKE = hex('#56706a');
const TOWER = hex('#081613');
const WINDOW = hex('#ffcf6a');

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number): number => BAYER4[(x & 3) + ((y & 3) << 2)];

/** Art pixels across the screen's short side (about): big chunky pixels, as in the reference art. */
const SHORT = 124;
/** Art pixels across a tall (phone) screen. */
const TALL_ACROSS = 104;

// ------------------------------------------------------------------ layout

interface Layout {
  /** Device pixels per art pixel, and the art's size. */
  p: number;
  W: number;
  H: number;
  tall: boolean;
  /** The horizon (top of the clearing), the fire's base, the moon. */
  hy: number;
  fx: number;
  fy: number;
  mx: number;
  my: number;
  mr: number;
  /** The tent's front face: its left foot and width. */
  tx: number;
  tw: number;
  seed: number;
}

function makeLayout(w: number, h: number): Layout {
  const tall = h > w * 1.1;
  // (On a tall screen the camp fills the width: closer in.)
  const p = Math.max(2, Math.round(tall ? w / TALL_ACROSS : h / SHORT));
  const W = Math.ceil(w / p);
  const H = Math.ceil(h / p);
  const hy = Math.round(H * (tall ? 0.585 : 0.53));
  const fx = Math.round(W * (tall ? 0.4 : 0.36));
  const fy = Math.round(H * (tall ? 0.735 : 0.765));
  return {
    p,
    W,
    H,
    tall,
    hy,
    fx,
    fy,
    mx: Math.round(W * (tall ? 0.74 : 0.79)),
    my: Math.round(H * (tall ? 0.3 : 0.22)),
    mr: tall ? 7 : 8,
    tx: fx + 15,
    tw: 27,
    seed: 7,
  };
}

// ------------------------------------------------------------------ painting helpers

/** Quantizes a light amount 0..1 into steps, dithered at each step's edge (the pixel art's light). */
function stepped(v: number, steps: number, x: number, y: number): number {
  return clamp(Math.floor(v * steps + bayer(x, y)) / steps, 0, 1);
}

/** How much of the fire's light reaches (x, y): an ellipse on the ground (it's seen from above at a slant). */
function fireReach(L: Layout, x: number, y: number, R = 46): number {
  const d = Math.hypot(x - L.fx, (y - L.fy) * 2.1) / R;
  return d >= 1 ? 0 : Math.pow(1 - d, 1.5);
}

/** A pine: tiers of boughs narrowing to the top, the moon catching their right edges. */
function pine(p: Pix, cx: number, by: number, h: number, body: RGB, rim: RGB, seed: number): void {
  const tiers = Math.max(2, Math.round(h / 6));
  const half = Math.max(2, Math.round(h * 0.3));
  const trunk = Math.max(1, Math.round(h / 14));
  for (let j = 0; j < h; j++) {
    const y = by - h + j;
    const tierH = h / tiers;
    const k = Math.floor(j / tierH);
    const local = (j - k * tierH) / tierH;
    const reach = ((k + 1) / tiers) * 0.55 + 0.45 * (j / h);
    let hw = Math.round(half * reach * (0.45 + 0.55 * local));
    if (j === 0) hw = 0;
    // A ragged edge: a bough sticks out here and there.
    if (hw > 1 && h01(cx, y, seed) < 0.18) hw += 1;
    for (let x = cx - hw; x <= cx + hw; x++) p.set(x, y, body);
    // The moon (up and to the right) on the right edge of the upper boughs, and the tip.
    if (j < h * 0.85) {
      p.set(cx + hw, y, rim);
      if (local < 0.2 && hw > 1) p.set(cx + hw - 1, y, rim);
    }
  }
  for (let y = by - 2; y <= by; y++) for (let x = cx - trunk + 1; x <= cx + trunk - 1; x++) p.set(x, y, body);
}

function lineP(p: Pix, x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) p.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}

/** Fills a triangle (vertices in art pixels) with `color(x, y)` (null skips the pixel). */
function tri(p: Pix, a: readonly [number, number], b: readonly [number, number], c: readonly [number, number], color: (x: number, y: number) => RGB | null): void {
  const minX = Math.floor(Math.min(a[0], b[0], c[0]));
  const maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
  const minY = Math.floor(Math.min(a[1], b[1], c[1]));
  const maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
  const e = (p0: readonly [number, number], p1: readonly [number, number], x: number, y: number) => (p1[0] - p0[0]) * (y - p0[1]) - (p1[1] - p0[1]) * (x - p0[0]);
  const area = e(a, b, c[0], c[1]);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = e(b, c, px, py) * Math.sign(area);
      const w1 = e(c, a, px, py) * Math.sign(area);
      const w2 = e(a, b, px, py) * Math.sign(area);
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const col = color(x, y);
      if (col) p.set(x, y, col);
    }
  }
}

// ------------------------------------------------------------------ the layers

interface Cloud {
  c: Canvas;
  w: number;
  y: number;
  speed: number;
}

interface Built {
  L: Layout;
  sky: Canvas;
  clouds: Cloud[];
  /** Everything that stands still below the sky, night-lit; and the fire's warm share of it. */
  base: Canvas;
  light: Canvas;
  mist: { c: Canvas; w: number; y: number };
  fore: Canvas;
  vignette: Canvas;
  stars: Array<{ x: number; y: number; b: number; ph: number; sp: number; big: boolean }>;
  flies: Array<{ x: number; y: number; ax: number; ay: number; sx: number; sy: number; ph: number }>;
  /** Where each knight stands (art px, feet), facing, and the side the fire is on. */
  spots: Array<{ x: number; y: number; view: 'side' | 'down'; flip: boolean; fireDir: number }>;
}

function paintSky(L: Layout): { sky: Canvas; stars: Built['stars'] } {
  const { W, hy } = L;
  const p = new Pix(W, hy + 2);
  const n = SKY.length - 1;
  for (let y = 0; y < p.h; y++) {
    // Flat bands down to the horizon, each meeting the next in one checkered row (as pixel art does it).
    const k = Math.pow(y / hy, 1.25) * n;
    const i = Math.min(n - 1, Math.floor(k));
    const f = k - i;
    for (let x = 0; x < W; x++) {
      // (The moon's soft glow is the bloom's, drawn over the art.)
      p.set(x, y, f > 0.85 && ((x + y) & 1) === 0 ? SKY[i + 1] : SKY[i]);
    }
  }
  // The moon: a crisp disc lit from the upper right, its lower left in shade, a few seas.
  const { mx, my, mr } = L;
  const seas: Array<[number, number, number]> = [
    [-3, -1, 1.8],
    [2, 2, 1.6],
    [3, -3, 1],
    [-2, 4, 1],
  ];
  for (let y = my - mr; y <= my + mr; y++) {
    for (let x = mx - mr; x <= mx + mr; x++) {
      const dx = x + 0.5 - mx;
      const dy = y + 0.5 - my;
      const d = Math.hypot(dx, dy);
      if (d > mr) continue;
      const shade = dx * -0.7 + dy * 0.7;
      let c = shade > mr * 0.5 ? MOON_SHADE : MOON;
      if (seas.some(([sx, sy, r]) => Math.hypot(dx + 0.5 - sx, dy + 0.5 - sy) <= r)) c = MOON_SHADE;
      if (d > mr - 1 && shade > mr * 0.35) c = MOON_DARK;
      p.set(x, y, c);
    }
  }
  // Stars: many faint, some bright, a few sparkling crosses (drawn each frame, twinkling).
  const r = rng(L.seed * 13 + 5);
  const stars: Built['stars'] = [];
  const count = Math.round((W * hy) / 55);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(Math.pow(r(), 1.3) * hy * 0.85);
    if (Math.hypot(x - mx, y - my) < mr * 2.4) continue;
    const b = r();
    stars.push({ x, y, b: 0.35 + b * 0.65, ph: r() * 6.28, sp: 0.6 + r() * 2.2, big: b > 0.94 && y < hy * 0.7 });
  }
  return { sky: p.toCanvas(), stars };
}

/**
 * A long bank of pixel cloud (twice the screen wide: it wraps as it drifts): lobes heaped along a flat
 * underside, their tops stepped in whole blocks, the moon's light on the upper edges and a darker
 * belly. Lighter than the sky behind it, as in the reference, and lighter the nearer the horizon.
 */
function paintCloud(L: Layout, y: number, thick: number, seed: number, near: number): Cloud {
  const w = L.W * 2;
  const h = thick + 4;
  const p = new Pix(w, h);
  const r = rng(seed);
  const body = mix(hex('#173a33'), hex('#2a5d4c'), near);
  const rim = mix(hex('#2c6152'), hex('#5aa080'), near);
  const belly = mix(hex('#0f2a26'), hex('#1d4539'), near);
  const top = new Int16Array(w).fill(h);
  // Lobes: humps of different widths along the bank, some gaps of open sky between groups.
  let x = 0;
  while (x < w) {
    if (r() < 0.22) {
      x += 6 + Math.floor(r() * L.W * 0.25);
      continue;
    }
    const lw = 8 + Math.floor(r() * 22);
    const lh = Math.max(2, Math.round(thick * (0.35 + r() * 0.65)));
    for (let k = 0; k < lw; k++) {
      const u = (k + 0.5) / lw;
      // A hump with flat steps: whole rows of 2 px.
      const hh = Math.round((Math.sqrt(Math.max(0, 1 - Math.pow(u * 2 - 1, 2))) * lh) / 2) * 2;
      const xx = (x + k) % w;
      top[xx] = Math.min(top[xx], h - 1 - hh);
    }
    x += Math.floor(lw * (0.45 + r() * 0.4));
  }
  for (let xx = 0; xx < w; xx++) {
    const t0 = top[xx];
    if (t0 >= h - 1) continue;
    for (let yy = t0; yy < h; yy++) {
      // The moon's on the right: the top edge and the right sides of the steps catch it.
      const edgeR = top[(xx + 1) % w] > yy;
      const c = yy === t0 || (edgeR && yy < t0 + 2) ? rim : yy >= h - 2 ? belly : body;
      p.set(xx, yy, c);
    }
  }
  return { c: p.toCanvas(), w, y: y - h, speed: 0.5 + near * 1.4 };
}

function paintMist(L: Layout): Built['mist'] {
  const w = L.W * 2;
  const h = 14;
  const p = new Pix(w, h);
  const n = noise1(L.seed + 71);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x / w) * Math.PI * 2;
      const thick = 0.5 + 0.5 * n(Math.cos(u) * 4 + Math.sin(u) * 3 + 20);
      const v = 1 - Math.abs(y - h * 0.55) / (h * 0.5);
      const a = clamp(v * thick, 0, 1);
      if (a * 0.8 > bayer(x, y)) p.set(x, y, MIST, Math.round(70 + 60 * a));
    }
  }
  return { c: p.toCanvas(), w, y: L.hy - 10 };
}

/** The clearing and everything standing in it, night-lit; then the fire's light worked out over it. */
function paintBase(L: Layout): { base: Pix; light: Pix; spots: Built['spots'] } {
  const { W, H, hy, fx, fy, tx, tw } = L;
  const p = new Pix(W, H);
  /** Pixels of things standing up (the tent's face, the spit, the log, the pack): they take the fire's light as walls do. */
  const up = new Uint8Array(W * H);
  const stand = (x: number, y: number, c: RGB) => {
    p.set(x, y, c);
    if (x >= 0 && y >= 0 && x < W && y < H) up[y * W + x] = 1;
  };
  const r = rng(L.seed * 7 + 1);
  const by = fy + 3;
  const tentEnd = tx + tw + 22;
  // --- the far hill with its tower (where the dungeon is)
  const hill = fbm1(L.seed + 3, 3);
  const hillTop = (x: number) => Math.round(hy - 9 - Math.max(0, hill(x / 30) + 0.4) * (L.tall ? 13 : 15));
  for (let x = 0; x < W; x++) {
    const t = hillTop(x);
    for (let y = t; y <= hy; y++) p.set(x, y, y === t && hillTop(x + 1) >= t ? HILL_RIM : HILL);
  }
  let best = Math.round(W * 0.7);
  for (let x = Math.round(W * 0.58); x < Math.round(W * 0.9); x++) if (hillTop(x) < hillTop(best)) best = x;
  const ty0 = hillTop(best);
  for (let y = ty0 - 11; y <= ty0 + 1; y++) for (let x = best - 2; x <= best + 1; x++) p.set(x, y, TOWER);
  for (let x = best - 3; x <= best + 2; x += 2) p.set(x, ty0 - 12, TOWER);
  p.set(best + 1, ty0 - 11, HILL_RIM);
  p.set(best + 1, ty0 - 8, HILL_RIM);
  p.set(best - 1, ty0 - 7, WINDOW);
  // --- the clearing, in flat bands far to near, a dithered row between each
  const bands = [hex('#1d4636'), hex('#17392c'), hex('#112e23'), hex('#0c241b'), hex('#08190f')];
  for (let y = hy + 1; y < H; y++) {
    const v = Math.pow(clamp((y - hy) / (H - hy), 0, 1), 0.85) * (bands.length - 1);
    const i = Math.min(bands.length - 2, Math.floor(v));
    const f = v - i;
    for (let x = 0; x < W; x++) p.set(x, y, f > 0.8 && ((x + y) & 1) === 0 ? bands[i + 1] : bands[i]);
  }
  // Grass: sparse strokes and tufts catching the moon, fewer further off.
  for (let k = 0; k < (W * (H - hy)) / 60; k++) {
    const x = Math.floor(r() * W);
    const y = hy + 4 + Math.floor(Math.pow(r(), 0.6) * (H - hy - 4));
    const near = (y - hy) / (H - hy);
    const lit = mix(p.rgb(x, y), GRASS_LIT, 0.22 + near * 0.18);
    const dark = mix(p.rgb(x, y), GRASS_DARK, 0.5);
    if (r() < 0.55) {
      p.set(x, y, lit);
      p.set(x, y - 1, lit);
    } else {
      p.set(x - 1, y, dark);
      p.set(x, y - 1, lit);
      p.set(x + 1, y, dark);
    }
  }
  // --- pines: a far rank along the hill's foot, a nearer one, and big ones framing the clearing
  const ranks = [
    { y: hy + 1, n: Math.round(W / 3.2), h: [8, 14], keep: () => true },
    { y: hy + 3, n: Math.round(W / 5), h: [13, 22], keep: (x: number) => x < fx - 22 || x > tentEnd - 6 },
  ];
  ranks.forEach((rk, i) => {
    const xs: number[] = [];
    for (let k = 0; k < rk.n; k++) xs.push(Math.floor(r() * (W + 16)) - 8);
    xs.sort((a, b) => a - b);
    for (const x of xs) {
      if (!rk.keep(x)) continue;
      pine(p, x, rk.y + Math.floor(r() * 2), Math.round(rk.h[0] + r() * (rk.h[1] - rk.h[0])), TREES[i][0], TREES[i][1], L.seed + i * 17 + x);
    }
  });
  // The big pines at the sides, standing nearer: on the left, and on the right past the tent.
  const framers: Array<[number, number]> = [];
  for (let x = -4; x < fx - 34; x += 9 + Math.floor(r() * 7)) framers.push([x, hy + 12 + Math.floor(r() * 6)]);
  for (let x = tentEnd + 8; x < W + 6; x += 9 + Math.floor(r() * 7)) framers.push([x, hy + 10 + Math.floor(r() * 6)]);
  for (const [x, y] of framers) pine(p, x, y, Math.round((L.tall ? 34 : 30) + r() * 18), TREES[2][0], TREES[2][1], L.seed + x * 3);
  // --- the path from the camp off to the right, a ring of trodden earth round the fire
  const pathY = (x: number) => by + 3 + (x - fx) * 0.2 + Math.sin(x / 9) * 1.5;
  for (let x = fx + 6; x < W; x++) {
    const cy = pathY(x);
    const half = 1.5 + (x - fx) * 0.035;
    for (let y = Math.round(cy - half); y <= Math.round(cy + half); y++) {
      if (y >= H || y <= hy) continue;
      const edge = Math.abs(y - cy) > half - 1;
      if (edge && ((x + y) & 1)) continue;
      p.set(x, y, edge ? DIRT_DARK : DIRT);
    }
  }
  for (let y = fy - 4; y <= fy + 7; y++) {
    for (let x = fx - 17; x <= fx + 17; x++) {
      const d = Math.hypot((x - fx) / 17, (y - fy - 1.5) / 6);
      if (d < 0.9 || (d < 1 && ((x + y) & 1) === 0)) p.set(x, y, DIRT);
    }
  }
  // --- the tent: its front face (lit by the fire), the door, the side of the roof running back
  const apex: [number, number] = [tx + tw / 2, by - 21];
  const back: [number, number] = [apex[0] + 22, apex[1] - 5];
  const right: [number, number] = [tx + tw, by];
  const rightBack: [number, number] = [right[0] + 22, right[1] - 5];
  // (Seams run back along the roof, parallel to the ridge: every 5 px down its slope.)
  const seam = (x: number, y: number) => Math.round(y - apex[1] + (x - apex[0]) * (5 / 22)) % 5 === 4;
  tri(p, apex, back, rightBack, (x, y) => (seam(x, y) ? CANVAS_SIDE_DARK : CANVAS_SIDE));
  tri(p, apex, rightBack, right, (x, y) => (seam(x, y) ? CANVAS_SIDE_DARK : CANVAS_SIDE));
  lineP(p, apex[0], apex[1], back[0], back[1], CANVAS_EDGE);
  lineP(p, right[0], right[1], rightBack[0], rightBack[1], CANVAS_SIDE_DARK);
  tri(p, apex, [tx, by], right, (x, y) => {
    up[y * W + x] = 1;
    return (x - tx) % 5 === 2 ? CANVAS_SEAM : CANVAS_FRONT;
  });
  lineP(p, apex[0], apex[1], tx, by, CANVAS_EDGE);
  lineP(p, apex[0], apex[1], right[0], right[1], CANVAS_SEAM);
  const door: [number, number] = [apex[0], by - 12];
  tri(p, door, [apex[0] - 5, by], [apex[0] + 5, by], () => TENT_DOOR);
  lineP(p, door[0], door[1], apex[0] - 6, by, CANVAS_EDGE);
  // The pole's tip and the guy ropes to their pegs.
  stand(apex[0], apex[1] - 1, WOOD_LIT);
  stand(apex[0], apex[1] - 2, WOOD_LIT);
  lineP(p, apex[0], apex[1], tx - 6, by + 1, mix(CANVAS_EDGE, GROUND_NEAR, 0.45));
  lineP(p, back[0], back[1], back[0] + 7, by - 3, mix(CANVAS_SIDE, GROUND_NEAR, 0.3));
  stand(tx - 6, by + 1, WOOD);
  stand(tx - 6, by, WOOD);
  // The tent's shadow, off to its right on the grass (away from the fire).
  for (let x = right[0] + 1; x < right[0] + 24; x++) for (let y = by - 4 + Math.floor((x - right[0]) * 0.18); y <= by + 1; y++) if (((x + y) & 1) === 0 || y >= by) p.tint(x, y, GRASS_DARK, 0.55);
  // --- the log seat left of the fire, a pack and a few rocks further out, a sword stood in the ground
  const ly = fy + 6;
  for (let x = fx - 22; x <= fx - 15; x++) {
    stand(x, ly - 2, WOOD_LIT);
    stand(x, ly - 1, WOOD);
    p.set(x, ly, WOOD_DARK);
  }
  stand(fx - 23, ly - 2, hex('#8a6438'));
  stand(fx - 23, ly - 1, WOOD_LIT);
  const rock = (x: number, y: number, w: number, h: number) => {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        if (Math.hypot((xx + 0.5 - w / 2) / (w / 2), (yy + 0.5 - h) / h) >= 1) continue;
        stand(x + xx, y - h + yy + 1, yy === 0 || (yy === 1 && xx < w / 2) ? STONE_TOP : xx > w * 0.65 ? STONE_DARK : STONE);
      }
    }
  };
  rock(fx - 46, fy + 6, 7, 5);
  rock(fx - 39, fy + 7, 4, 3);
  rock(tx + tw + 24, by + 2, 5, 3);
  // The pack: a bedroll on a sack.
  for (let y = fy - 1; y <= fy + 4; y++) for (let x = fx - 56; x <= fx - 51; x++) stand(x, y, y === fy - 1 ? hex('#5a4a34') : x === fx - 51 ? hex('#2e261a') : hex('#45392a'));
  for (let x = fx - 57; x <= fx - 50; x++) {
    stand(x, fy - 3, hex('#7a3530'));
    stand(x, fy - 2, hex('#4a1e1c'));
  }
  // A sword stood point down by the log.
  const swx = fx - 37;
  for (let y = fy - 6; y <= fy + 5; y++) stand(swx, y, y < fy - 3 ? IRON : IRON_LIT);
  stand(swx - 1, fy - 3, WOOD_LIT);
  stand(swx + 1, fy - 3, WOOD_LIT);
  stand(swx, fy - 7, hex('#c9a44a'));
  // --- the fire's stones, its logs, the spit over it with a kettle
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const sx = Math.round(fx + Math.cos(a) * 7);
    const sy = Math.round(fy + 1 + Math.sin(a) * 2.5);
    stand(sx, sy, STONE);
    stand(sx + 1, sy, STONE_DARK);
    stand(sx, sy - 1, STONE_TOP);
  }
  lineP(p, fx - 5, fy + 1, fx + 4, fy - 1, WOOD_DARK);
  lineP(p, fx - 4, fy - 1, fx + 5, fy + 1, WOOD);
  const top = fy - 15;
  for (const sx of [fx - 8, fx + 8]) {
    for (let y = top; y <= fy + 1; y++) stand(sx, y, WOOD);
    stand(sx - 1, top - 1, WOOD);
    stand(sx + 1, top - 1, WOOD);
  }
  for (let x = fx - 9; x <= fx + 9; x++) stand(x, top, WOOD_LIT);
  stand(fx + 2, top + 1, IRON_LIT);
  stand(fx + 2, top + 2, IRON_LIT);
  for (let y = top + 3; y <= top + 7; y++) for (let x = fx - 1; x <= fx + 5; x++) {
    const edge = (y === top + 3 || y === top + 7) && (x === fx - 1 || x === fx + 5);
    if (!edge) stand(x, y, x <= fx ? IRON_LIT : IRON);
  }
  // --- where the squad stands round the fire (drawn each frame, over this), and their shadows
  const spots: Built['spots'] = [
    { x: fx - 11, y: fy + 6, view: 'side', flip: false, fireDir: 1 },
    { x: fx - 28, y: fy + 2, view: 'side', flip: false, fireDir: 1 },
    { x: fx + 11, y: fy + 7, view: 'side', flip: true, fireDir: -1 },
  ];
  for (const sp of spots) {
    const dir = sp.x < fx ? -1 : 1;
    for (let k = 0; k < 8; k++) {
      const sx = sp.x + dir * k - (dir < 0 ? -2 : 2);
      p.tint(sx, sp.y, GRASS_DARK, 0.6);
      if (k < 6) p.tint(sx, sp.y - 1, GRASS_DARK, 0.4);
    }
  }

  // --- the fire's light: each lit pixel's warm share, in dithered steps, on a layer of its own
  const light = new Pix(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!p.a(x, y)) continue;
      // The ground: the pool round the fire. Things standing up: lit by how near they are, not where their foot is.
      let q = fireReach(L, x, y, 48);
      if (up[y * W + x]) q = Math.max(q, 0.95 * Math.max(0, 1 - Math.hypot(x - fx, (y - (fy - 6)) * 1.1) / 36) ** 1.3);
      if (q <= 0) continue;
      const st = stepped(q, 5, x, y);
      if (st <= 0) continue;
      const c = p.rgb(x, y);
      const k = st * 1.6;
      light.set(x, y, [Math.min(255, c[0] * k * 1.15 + WARM[0] * st * 0.3), Math.min(255, c[1] * k * 0.8 + WARM[1] * st * 0.19), Math.min(255, c[2] * k * 0.4 + WARM[2] * st * 0.06)]);
    }
  }
  return { base: p, light, spots };
}

/** The foreground: tall dark grass and the odd fern along the bottom, framing the clearing. */
function paintFore(L: Layout): Canvas {
  const { W } = L;
  const p = new Pix(W, 18);
  const n = noise1(L.seed + 97);
  for (let x = 0; x < W; x++) {
    // Taller at the sides, low in the middle (the clearing opens toward us).
    const side = Math.pow(Math.abs(x / W - 0.5) * 2, 2);
    const h = Math.round(2 + side * 12 + (n(x / 5) + 1) * 2.5);
    for (let y = 18 - h; y < 18; y++) p.set(x, y, FORE);
    // Blades sticking up above the rest.
    if (h01(x, 1, L.seed) < 0.22) {
      const bh = 2 + Math.floor(h01(x, 2, L.seed) * 4);
      for (let y = 18 - h - bh; y < 18 - h; y++) p.set(x, y, FORE);
    }
  }
  return p.toCanvas();
}

/** Darkens the corners, smooth (a lens's falloff over the art, not part of it), at the screen's own size. */
function paintVignette(w: number, h: number, tall: boolean): Canvas {
  const c = canvas(w, h);
  const g = ctx2d(c);
  const r = Math.hypot(w, h) / 2;
  const grad = g.createRadialGradient(w / 2, h * (tall ? 0.55 : 0.5), r * 0.35, w / 2, h * (tall ? 0.55 : 0.5), r * 1.05);
  grad.addColorStop(0, 'rgba(1,5,4,0)');
  grad.addColorStop(0.55, 'rgba(1,5,4,0.18)');
  grad.addColorStop(1, 'rgba(1,5,4,0.62)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  return c;
}

function build(L: Layout): Built {
  const { sky, stars } = paintSky(L);
  const clouds: Cloud[] = [];
  const bands = L.tall ? 4 : 3;
  for (let i = 0; i < bands; i++) {
    const near = i / Math.max(1, bands - 1);
    // (Bottom edge of each bank: from a third of the way down the sky to just over the far woods.)
    let y = Math.round(L.hy * (0.3 + near * 0.58));
    const thick = Math.round(6 + near * 8);
    // (Never across the moon: a bank that would cover it sits just below it instead.)
    if (y > L.my - L.mr - 2 && y - thick - 4 < L.my + L.mr + 2) y = L.my + L.mr + thick + 7;
    clouds.push(paintCloud(L, y, thick, L.seed * 31 + i * 101, near));
  }
  const { base, light, spots } = paintBase(L);
  const r = rng(L.seed + 404);
  const flies: Built['flies'] = [];
  for (let i = 0; i < 12; i++) {
    const left = i % 2 === 0;
    flies.push({
      x: left ? r() * L.W * 0.3 : L.W * (0.62 + r() * 0.36),
      y: L.hy + 4 + r() * (L.H - L.hy) * 0.5,
      ax: 3 + r() * 8,
      ay: 2 + r() * 5,
      sx: 0.15 + r() * 0.35,
      sy: 0.2 + r() * 0.4,
      ph: r() * 6.28,
    });
  }
  return { L, sky, clouds, base: base.toCanvas(), light: light.toCanvas(), mist: paintMist(L), fore: paintFore(L), vignette: paintVignette(L.W * L.p, L.H * L.p, L.tall), stars, flies, spots };
}

// ------------------------------------------------------------------ the fire, each frame

const FW = 13;
const FH = 18;

/** The flames at frame `f` (12 a second): tongues licking up from a hot white core, never the same twice in a row. */
function paintFlames(f: number, calm: boolean): Pix {
  const p = new Pix(FW, FH);
  const cx = (FW - 1) / 2;
  const t = calm ? 0 : f;
  for (let y = 0; y < FH; y++) {
    const up = (FH - 1 - y) / (FH - 1);
    // Sways more the higher it goes.
    const sway = Math.sin(t * 0.9 + up * 3) * up * 1.6 + (h01(t, y, 3) - 0.5) * up * 1.2;
    const width = (1 - Math.pow(up, 0.75)) * 5.6 + 0.4;
    for (let x = 0; x < FW; x++) {
      const dx = Math.abs(x - cx - sway);
      if (dx > width) continue;
      // Tongues: gaps torn in the upper flame.
      if (up > 0.45 && h01(x, Math.floor(y / 2), t * 7 + 1) < 0.35 * up) continue;
      const heat = clamp((1 - dx / width) * 0.85 + (1 - up) * 0.55 - up * 0.25, 0, 1);
      const i = Math.min(FLAME.length - 1, Math.floor(heat * FLAME.length));
      p.set(x, y, FLAME[i]);
    }
  }
  // Coals at the foot.
  for (let x = 2; x < FW - 2; x++) p.set(x, FH - 1, h01(x, t, 5) < 0.5 ? FLAME[2] : FLAME[1]);
  return p;
}

// ------------------------------------------------------------------ the scene

export class TitleCamp {
  private built: Built | null = null;
  private key = '';
  private flames: { f: number; c: Canvas } | null = null;
  private knights = new Map<string, KnightSprite | null>();
  private glowFire: Canvas | null = null;
  private glowMoon: Canvas | null = null;

  constructor() {
    // (Canvases are made on the first draw.) After a graphics reset this scene is built anew.
    onGraphicsReset(() => {
      this.built = null;
      this.flames = null;
      this.knights.clear();
      this.glowFire = null;
      this.glowMoon = null;
    });
  }

  /** The scene has been painted and shows. */
  get ready(): boolean {
    return this.built !== null;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, opts: CampOptions): void {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    const key = `${w}x${h}`;
    if (!this.built || key !== this.key) {
      this.key = key;
      this.built = build(makeLayout(w, h));
    }
    const S = this.built;
    const L = S.L;
    const p = L.p;
    if (opts.reduceMotion) t = 4;
    // The fire's flicker: two slow waves and a quick one, 0.75..1.
    const flick = opts.reduceMotion ? 0.9 : 0.86 + 0.06 * Math.sin(t * 7.3) + 0.04 * Math.sin(t * 13.1 + 1) + 0.03 * Math.sin(t * 2.1);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = css(SKY[0]);
    ctx.fillRect(0, 0, w, h);
    const art = (c: Canvas, x: number, y: number) => ctx.drawImage(c, Math.round(x) * p, Math.round(y) * p, c.width * p, c.height * p);
    // --- sky, stars, moon, clouds
    art(S.sky, 0, 0);
    for (const s of S.stars) {
      const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
      const a = s.b * tw;
      if (a < 0.2) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = css(a > 0.85 ? STAR_HOT : STAR);
      ctx.fillRect(s.x * p, s.y * p, p, p);
      if (s.big) {
        ctx.fillStyle = css(SPARKLE);
        ctx.globalAlpha = a * 0.8;
        ctx.fillRect((s.x - 1) * p, s.y * p, p, p);
        ctx.fillRect((s.x + 1) * p, s.y * p, p, p);
        ctx.fillRect(s.x * p, (s.y - 1) * p, p, p);
        ctx.fillRect(s.x * p, (s.y + 1) * p, p, p);
        if (tw > 0.85) {
          ctx.globalAlpha = a * 0.45;
          ctx.fillRect((s.x - 2) * p, s.y * p, p, p);
          ctx.fillRect((s.x + 2) * p, s.y * p, p, p);
          ctx.fillRect(s.x * p, (s.y - 2) * p, p, p);
          ctx.fillRect(s.x * p, (s.y + 2) * p, p, p);
        }
      }
    }
    ctx.globalAlpha = 1;
    for (const c of S.clouds) {
      const off = Math.floor((t * c.speed) % c.w);
      art(c.c, -off, c.y);
      art(c.c, c.w - off, c.y);
    }
    // --- the land, then the mist drifting along the far woods
    art(S.base, 0, 0);
    {
      const off = Math.floor((t * 1.2) % S.mist.w);
      ctx.globalAlpha = 0.9;
      art(S.mist.c, -off, S.mist.y);
      art(S.mist.c, S.mist.w - off, S.mist.y);
      ctx.globalAlpha = 1;
    }
    // --- the squad round the fire
    const heroes = opts.heroes.slice(0, 3);
    const order = [1, 0, 2];
    for (const i of order) {
      const hero = heroes[i];
      const spot = S.spots[i];
      if (!hero || !spot) continue;
      const frame = opts.reduceMotion ? 0 : Math.floor(t * 1.6 + i * 0.7) % 2;
      const k = this.knight(hero, spot, frame, t);
      if (!k) continue;
      const x = spot.x - k.ax;
      const y = spot.y - k.ay;
      art(k.dim, x, y);
      ctx.globalAlpha = clamp(flick * 1.05, 0, 1);
      art(k.lit, x, y);
      ctx.globalAlpha = 1;
    }
    // --- the fire's light over everything it reaches, flickering
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = flick;
    art(S.light, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // --- the flames, their smoke and embers
    const f = Math.floor(t * 12);
    if (!this.flames || this.flames.f !== f) this.flames = { f, c: paintFlames(f, !!opts.reduceMotion).toCanvas() };
    art(this.flames.c, L.fx - (FW - 1) / 2, L.fy - FH + 1);
    if (!opts.reduceMotion) this.particles(ctx, L, t);
    // --- the foreground grass, framing the clearing
    art(S.fore, 0, L.H - 18);
    // --- light: the fire's bloom and the moon's, then the corners closed in
    ctx.globalCompositeOperation = 'lighter';
    this.glowFire ??= glow(WARM, 64);
    this.glowMoon ??= glow(MOON_GLOW, 64);
    const fr = 34 * p * (0.94 + flick * 0.12);
    ctx.globalAlpha = 0.34 * flick;
    ctx.drawImage(this.glowFire, (L.fx + 0.5) * p - fr, (L.fy - 5) * p - fr * 0.8, fr * 2, fr * 1.6);
    ctx.globalAlpha = 0.5 * flick;
    const cr = 9 * p;
    ctx.drawImage(this.glowFire, (L.fx + 0.5) * p - cr, (L.fy - 6) * p - cr, cr * 2, cr * 2);
    const mr = L.mr * 3.2 * p;
    ctx.globalAlpha = 0.24;
    ctx.drawImage(this.glowMoon, (L.mx + 0.5) * p - mr, (L.my + 0.5) * p - mr, mr * 2, mr * 2);
    // Fireflies glow.
    for (const fl of S.flies) {
      const pos = this.fly(fl, t);
      const a = pos.a;
      if (a < 0.15) continue;
      ctx.globalAlpha = a * 0.4;
      const gr = 3 * p;
      ctx.drawImage(this.glowMoon, pos.x * p + p / 2 - gr, pos.y * p + p / 2 - gr, gr * 2, gr * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const fl of S.flies) {
      const pos = this.fly(fl, t);
      if (pos.a < 0.15) continue;
      ctx.globalAlpha = pos.a;
      ctx.fillStyle = css(FIREFLY);
      ctx.fillRect(Math.round(pos.x) * p, Math.round(pos.y) * p, p, p);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(S.vignette, 0, 0);
    ctx.restore();
  }

  /** A firefly's place and brightness at time t. */
  private fly(fl: Built['flies'][number], t: number): { x: number; y: number; a: number } {
    const x = fl.x + Math.sin(t * fl.sx + fl.ph) * fl.ax;
    const y = fl.y + Math.sin(t * fl.sy * 1.3 + fl.ph * 2) * fl.ay;
    const blink = Math.sin(t * 1.7 + fl.ph * 3);
    return { x, y, a: clamp(blink * 1.4, 0, 1) };
  }

  /** Embers flying up off the fire and smoke curling away to the right. */
  private particles(ctx: CanvasRenderingContext2D, L: Layout, t: number): void {
    const p = L.p;
    for (let i = 0; i < 6; i++) {
      const period = 4.5 + (i % 3) * 0.9;
      const u = ((t + i * 0.83) % period) / period;
      const x = L.fx + 1 + Math.sin(u * 5 + i) * 2 + u * 14;
      const y = L.fy - 12 - u * 34;
      const size = u < 0.3 ? 2 : u < 0.7 ? 3 : 2;
      ctx.globalAlpha = (1 - u) * 0.28;
      ctx.fillStyle = css(SMOKE);
      ctx.fillRect(Math.round(x) * p, Math.round(y) * p, size * p, size * p);
    }
    for (let i = 0; i < 14; i++) {
      const period = 1.4 + h01(i, 1, 9) * 1.6;
      const u = ((t + h01(i, 2, 9) * period) % period) / period;
      const x = L.fx + (h01(i, 3, 9) - 0.5) * 6 + Math.sin(u * 7 + i) * (1 + u * 3) + u * 4;
      const y = L.fy - 6 - u * (20 + h01(i, 4, 9) * 22);
      ctx.globalAlpha = Math.min(1, (1 - u) * 1.6);
      ctx.fillStyle = css(EMBER[Math.min(2, Math.floor(u * 3))]);
      ctx.fillRect(Math.round(x) * p, Math.round(y) * p, p, p);
    }
    ctx.globalAlpha = 1;
  }

  private knight(hero: CampHero, spot: Built['spots'][number], frame: number, t: number): KnightSprite | null {
    // Primordial armor cycles colour: its frames are keyed by time.
    const tk = hero.id.startsWith('primordial') ? Math.floor(t * 6) % 40 : 0;
    const key = `${hero.id}|${hero.mutation ?? ''}|${spot.view}|${spot.flip ? 1 : 0}|${spot.fireDir}|${frame}|${tk}`;
    let k = this.knights.get(key);
    if (k === undefined) {
      try {
        k = knightSprite(hero.id, hero.mutation, spot.view, frame, spot.flip, tk / 6, spot.fireDir, 1, 1, MOON_RIM);
      } catch {
        k = null;
      }
      this.knights.set(key, k);
      if (this.knights.size > 120) this.knights.delete(this.knights.keys().next().value!);
    }
    return k;
  }
}

/** A soft round glow for blooms (drawn scaled, added). */
function glow(c: RGB, n: number): Canvas {
  const cv = canvas(n, n);
  const g = ctx2d(cv);
  const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    grad.addColorStop(u, css(c, Math.pow(1 - u, 2) * (u < 1 ? 1 : 0)));
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, n, n);
  return cv;
}
