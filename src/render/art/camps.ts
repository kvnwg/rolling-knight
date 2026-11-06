/**
 * The folk's set-ups (world/camps.ts places them): a market stall under a striped awning, a little
 * roofed shrine stall hung with paper lanterns, a hay cart and a produce stand, a canvas tent with a
 * log seat, a hide tent and a fire bowl, a candlelit shrine in an arched alcove, a hut on stilts and a
 * beached rowboat, a canopy over a rug with jars, a cemetery gate and a stone bench, a smith's cart
 * and an anvil, a lean-to and a crystal lamp.
 *
 * Each is drawn round its base (0, 0: where it meets the ground), in screen pixels: the 3/4 view, the
 * light from the top left (tops and left faces lit, right faces and undersides in shade), an outline
 * tinted from its own colors like every other prop. A stall comes in two pieces, the back drawn behind
 * its keeper and the counter (with the roof over it) in front, so the keeper stands between them.
 */
import type { Biome } from '../../world/biomes';
import { blank, type PixelBuf } from '../pixel/buf';
import { hash, mixHex, setRGB, shade } from './draw';
import { outlineTinted } from './ink';

interface Art {
  buf: PixelBuf;
  ax: number;
  ay: number;
  light?: { dx: number; dy: number; color: string; r: number; flicker: boolean };
  flame?: { dx: number; dy: number; size: number };
}

type Ramp = readonly string[];

export type CampKind =
  | 'stallBack' | 'stallFront' | 'yataiBack' | 'yataiFront' | 'hayCart' | 'produceStand' | 'canvasTent' | 'logSeat' | 'hideTent' | 'fireBowl'
  | 'shrineNiche' | 'stiltHut' | 'rowboat' | 'canopyBack' | 'canopyFront' | 'rug' | 'graveGate' | 'stoneBench' | 'smithCart' | 'anvil'
  | 'leanTo' | 'crystalLamp';

// ------------------------------------------------------------------ palettes

const WOOD: Ramp = ['#2a180e', '#452a18', '#663f24', '#8a5a34', '#ac7a48', '#cc9c64'];
const GREY_WOOD: Ramp = ['#211f1c', '#35312b', '#4d473e', '#686052', '#867c6a', '#a49a84'];
const DARK_WOOD: Ramp = ['#140c0a', '#24160f', '#382217', '#4e3020', '#68422c', '#84583a'];
const IRON: Ramp = ['#121218', '#24242c', '#3a3a46', '#56566a', '#7c7c90', '#a4a4b4'];
const BRASS: Ramp = ['#3e2408', '#6a4012', '#9a6420', '#c88e34', '#e8b858', '#fae49a'];
const CLAY: Ramp = ['#3e170c', '#652814', '#8e3c1e', '#b45a2e', '#d27c46', '#e8a46a'];
const HAY: Ramp = ['#5a3c14', '#86621e', '#b08a32', '#d4b04c', '#ecd27a', '#f8eab4'];
const CANVAS: Ramp = ['#38302a', '#5a4e40', '#7f725c', '#a59878', '#c8bc9a', '#e6dcbe'];
const HIDE: Ramp = ['#2e1c12', '#4c301e', '#6e4a2e', '#92683e', '#b48a56', '#d4ae7a'];
const SNOW: Ramp = ['#8296b4', '#a8bad2', '#cfdcea', '#eef4fa', '#ffffff'];
const LEAF: Ramp = ['#14281a', '#1e3e22', '#2e5a2c', '#467a36', '#68a046'];
const MOSS: Ramp = ['#22361a', '#365222', '#4e702c', '#6c8e38'];
const ROPE = '#b49a6a';
const ROPE_DK = '#7e6a46';
const INK = '#120c10';
/** Lit glass, candlelight, coals. */
const GLOW: Ramp = ['#b8641c', '#f09838', '#ffc860', '#ffe8a0', '#fffbe8'];
const COALS: Ramp = ['#4a120a', '#8a2210', '#d0461a', '#ff8a30', '#ffd068'];

/** Five stone tones from the biome's walls (the tree biomes' walls are dark: lighten them out). */
function stoneOf(biome: Biome): Ramp {
  const f = biome.solid.face;
  if (f.length >= 5 && biome.solid.kind !== 'trees') return [shade(f[0], -0.2), f[0], f[1], f[2], f[3], f[4]];
  const mid = f[Math.min(f.length - 1, 2)];
  const base = mixHex(mid, '#8a8a96', 0.5);
  return [shade(base, -0.62), shade(base, -0.45), shade(base, -0.25), base, shade(base, 0.22), shade(base, 0.42)];
}

const at = (r: Ramp, k: number) => r[Math.max(0, Math.min(r.length - 1, Math.round(k)))];

// ------------------------------------------------------------------ a canvas round the base

/** A picture drawn round its base at (0, 0): x0..x1, y0..y1 (y0 < 0 is up). */
class Pic {
  readonly b: PixelBuf;
  constructor(
    readonly x0: number,
    readonly y0: number,
    x1: number,
    y1: number,
  ) {
    this.b = blank(x1 - x0 + 1, y1 - y0 + 1);
  }
  px(x: number, y: number, c: string | null | undefined): void {
    if (c) setRGB(this.b, Math.round(x) - this.x0, Math.round(y) - this.y0, c);
  }
  has(x: number, y: number): boolean {
    const bx = Math.round(x) - this.x0;
    const by = Math.round(y) - this.y0;
    return bx >= 0 && by >= 0 && bx < this.b.w && by < this.b.h && this.b.px[(by * this.b.w + bx) * 4 + 3] > 0;
  }
  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c);
  }
  hline(x0: number, x1: number, y: number, c: string): void {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.px(x, y, c);
  }
  vline(x: number, y0: number, y1: number, c: string): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.px(x, y, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string | ((t: number) => string)): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.px(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), typeof c === 'string' ? c : c(t));
    }
  }
  /** Paints every pixel of the box for which `f` gives a color. */
  each(x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => string | null | undefined): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.px(x, y, f(x, y));
  }
  /** A lit ball (an ellipse shaded from the top left). */
  ball(cx: number, cy: number, rx: number, ry: number, r: Ramp, flat = 0): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const lit = (-dx * 0.55 - dy * 0.75 + 0.35 * (1 - d)) * (1 - flat);
        this.px(x, y, at(r, (r.length - 1) * (0.5 + lit * 0.62)));
      }
    }
  }
  /** Darkens what's already drawn (a shadow falling on it). */
  dim(x: number, y: number, f: number): void {
    const bx = Math.round(x) - this.x0;
    const by = Math.round(y) - this.y0;
    if (bx < 0 || by < 0 || bx >= this.b.w || by >= this.b.h) return;
    const i = (by * this.b.w + bx) * 4;
    if (!this.b.px[i + 3]) return;
    this.b.px[i] = this.b.px[i] * (1 - f) + 0x1c * f;
    this.b.px[i + 1] = this.b.px[i + 1] * (1 - f) + 0x16 * f;
    this.b.px[i + 2] = this.b.px[i + 2] * (1 - f) + 0x2c * f;
  }
  art(extra: Pick<Art, 'light' | 'flame'> = {}): Art {
    return { buf: outlineTinted(this.b), ax: -this.x0 + 1, ay: -this.y0 + 1, ...extra };
  }
}

// ------------------------------------------------------------------ shared bits

/** A squared post `w` wide from y0 down to y1: lit left, shaded right, a lit cap. */
function post(p: Pic, x: number, y0: number, y1: number, r: Ramp, w = 2): void {
  for (let y = y0; y <= y1; y++) {
    for (let i = 0; i < w; i++) {
      const k = i === 0 ? 3.4 : i === w - 1 ? 1.6 : 2.6;
      // A knot or a split now and then.
      const knot = hash(x, y, 77) < 0.06 && i === w - 1;
      p.px(x + i, y, at(r, knot ? k - 1 : k));
    }
  }
  p.hline(x, x + w - 1, y0, at(r, 4.6));
}

/** Boards side by side (a wall, a counter's front): `bw` wide, seams between, grain, darker below. */
function boards(p: Pic, x: number, y: number, w: number, h: number, r: Ramp, seed: number, bw = 4, base = 2.6): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const col = Math.floor((xx - x) / bw);
      const u = (xx - x) % bw;
      let k = base + (hash(seed, col) - 0.5) * 0.9 - ((yy - y) / Math.max(1, h)) * 0.7;
      if (u === 0) k = base - 1.5;
      else if (u === 1) k += 0.5;
      if (hash(seed, xx, yy) < 0.07 && u > 1) k -= 0.6;
      p.px(xx, yy, at(r, k));
    }
  }
}

/** Planks lying across (a deck, a shelf, a cart's side): `ph` rows each, a dark joint under each. */
function planks(p: Pic, x: number, y: number, w: number, h: number, r: Ramp, seed: number, ph = 3, base = 2.8): void {
  for (let yy = y; yy < y + h; yy++) {
    const row = Math.floor((yy - y) / ph);
    const v = (yy - y) % ph;
    // Plank ends, staggered.
    const cut = Math.floor(hash(seed, row) * 9) + 6;
    for (let xx = x; xx < x + w; xx++) {
      let k = base + (hash(seed, row, 3) - 0.5) * 0.8;
      if (v === ph - 1) k = base - 1.4;
      else if (v === 0) k += 0.6;
      if ((xx - x + row * 7) % (cut + 9) === 0 && v !== ph - 1) k = base - 1.2;
      if (hash(seed, xx, yy) < 0.05) k -= 0.5;
      p.px(xx, yy, at(r, k));
    }
  }
}

/** A rope from a to b sagging `sag` px in the middle. */
function rope(p: Pic, x0: number, y0: number, x1: number, y1: number, sag: number, c = ROPE_DK): void {
  const n = Math.max(2, Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    p.px(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag), c);
  }
}

/** A little lantern hanging from (x, y): hook, cap, lit glass, foot. Its glass is at (x, y + 4). */
function lantern(p: Pic, x: number, y: number, frame: Ramp = IRON, glass: Ramp = GLOW): void {
  p.px(x, y, frame[2]);
  p.hline(x - 1, x + 1, y + 1, frame[3]);
  p.hline(x - 2, x + 2, y + 2, frame[2]);
  for (let yy = y + 3; yy <= y + 6; yy++) {
    p.px(x - 2, yy, frame[2]);
    p.px(x + 2, yy, frame[1]);
    p.px(x - 1, yy, yy === y + 3 ? glass[4] : glass[3]);
    p.px(x, yy, yy === y + 6 ? glass[1] : glass[3]);
    p.px(x + 1, yy, glass[1]);
  }
  p.px(x - 1, y + 4, glass[4]);
  p.hline(x - 2, x + 2, y + 7, frame[2]);
  p.px(x, y + 8, frame[1]);
}

/** A candle `h` tall standing at (x, y) (its foot), a drip of wax, a flame on top. */
function candle(p: Pic, x: number, y: number, h: number, wax: Ramp = ['#8a7a5e', '#c8b88e', '#ece2c4', '#fff8e4']): void {
  for (let yy = y - h + 1; yy <= y; yy++) p.px(x, yy, yy === y - h + 1 ? wax[3] : wax[2]);
  if (h >= 3) p.px(x + 1, y, wax[1]);
  p.px(x, y - h, GLOW[3]);
  p.px(x, y - h - 1, GLOW[4]);
}

/** A clay jar (round belly, neck, lip) standing at (cx, y), `w` across the belly and `h` tall. */
function jar(p: Pic, cx: number, y: number, w: number, h: number, r: Ramp, seed = 0): void {
  const neck = Math.max(1, Math.round(h * 0.22));
  const belly = h - neck - 1;
  p.ball(cx, y - belly / 2, w / 2, belly / 2 + 0.3, r);
  const nw = Math.max(2, Math.round(w * 0.42));
  p.rect(cx - Math.floor(nw / 2), y - h + 1, nw, neck, at(r, 2.4));
  p.px(cx - Math.floor(nw / 2), y - h + 1 + Math.floor(neck / 2), at(r, 3.6));
  p.hline(cx - Math.floor(nw / 2) - 1, cx - Math.floor(nw / 2) + nw, y - h, at(r, 4.4));
  // A painted band.
  if (hash(seed, 3) < 0.6) for (let x = Math.round(cx - w / 2 + 1); x <= Math.round(cx + w / 2 - 1); x++) if (p.has(x, y - Math.round(belly * 0.55))) p.px(x, y - Math.round(belly * 0.55), x < cx ? '#e8d8b0' : '#b8a888');
}

/** A crate in 3/4 at (x, y) its front's bottom-left: `top` rows of top face, `h` rows of front. */
function crate(p: Pic, x: number, y: number, w: number, h: number, top: number, r: Ramp = WOOD): void {
  for (let yy = y - h - top + 1; yy <= y; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const onTop = yy <= y - h;
      let k = onTop ? (yy === y - h - top + 1 ? 4.6 : 3.8) : xx === x ? 3.4 : xx === x + w - 1 ? 1.6 : 2.5;
      if (!onTop && (yy - (y - h)) % 3 === 0) k -= 0.9;
      p.px(xx, yy, at(r, k));
    }
  }
  p.hline(x, x + w - 1, y - h, at(r, 1.4));
}

/** Round fruit heaped in a box: lit balls one or two px across, packed in rows. */
function heap(p: Pic, x: number, y: number, w: number, rows: number, r: Ramp, seed: number, size = 2): void {
  for (let row = rows - 1; row >= 0; row--) {
    for (let xx = x + (row % 2); xx < x + w - 1; xx += size + 1) {
      const yy = y - row * size;
      p.px(xx, yy, at(r, 2.4));
      p.px(xx + 1, yy, at(r, 1.6));
      p.px(xx, yy - 1, at(r, hash(seed, xx, row) < 0.5 ? 3.8 : 3.2));
      if (size > 1) p.px(xx + 1, yy - 1, at(r, 2.6));
    }
  }
}

/** A flame's base for things that burn (the animated fire is drawn on top by the renderer). */
function embers(p: Pic, cx: number, y: number, w: number): void {
  for (let x = cx - Math.floor(w / 2); x <= cx + Math.floor(w / 2); x++) {
    const d = Math.abs(x - cx) / (w / 2);
    p.px(x, y, at(COALS, 3.6 - d * 2 + (hash(x, y, 5) - 0.5)));
    if (d < 0.7) p.px(x, y - 1, at(COALS, 4 - d * 2));
  }
}

// ------------------------------------------------------------------ the hamlet: a market stall

const AWNINGS: ReadonlyArray<{ c: Ramp; w: Ramp }> = [
  { c: ['#4a0e14', '#7a1a1e', '#a82a28', '#d04436', '#ec6a50'], w: ['#8a7a6a', '#b8aa94', '#ddd2bc', '#f4ecdc', '#fffaf0'] },
  { c: ['#0c2e2e', '#164a46', '#226a62', '#33907e', '#58b49a'], w: ['#8a7a6a', '#b8aa94', '#ddd2bc', '#f4ecdc', '#fffaf0'] },
  { c: ['#4a2a06', '#7a4a0e', '#a8701a', '#d49a2a', '#f0c050'], w: ['#7a5a4a', '#a88e7a', '#d4c0a8', '#efe2cc', '#fff6e6'] },
];

/** A striped canvas roof seen from above and the front: back edge at yb, front edge at yf, a scalloped valance below. */
function awning(p: Pic, x0: number, x1: number, yb: number, yf: number, val: number, c: Ramp, w: Ramp, stripe = 6): void {
  const mid = (x0 + x1) / 2;
  for (let x = x0; x <= x1; x++) {
    const s = Math.floor((x - x0) / stripe) % 2 === 0;
    const R = s ? c : w;
    // The canvas sags a pixel between the posts.
    const sag = Math.round(Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * 1.2);
    const front = yf + sag;
    for (let y = yb; y <= front; y++) {
      const t = (y - yb) / Math.max(1, front - yb);
      // Lit from the top left: brighter toward the back and the left, a fold between stripes, and a
      // rounded lip along the front edge catching the light over its shaded underside.
      let k = 3.5 - t * 1.1 + (x < mid ? 0.35 : -0.25) - (x - x0 > (x1 - x0) * 0.82 ? 0.4 : 0);
      if ((x - x0) % stripe === 0) k -= 0.5;
      if (y === yb) k = 1.6;
      else if (y === yb + 1) k = 4.3;
      else if (y === front - 1) k = 4.1;
      else if (y === front) k = 2.2;
      p.px(x, y, at(R, k));
    }
    // The valance hangs in shade, its hem scalloped: each stripe a rounded tongue.
    const u = (x - x0) % stripe;
    const tongue = u === 0 || u === stripe - 1 ? 0 : 1;
    for (let y = front + 1; y <= front + val + tongue; y++) {
      const k = y === front + 1 ? 2.6 : y === front + val + tongue ? 0.9 : 1.8;
      p.px(x, y, at(R, k - (u === 0 ? 0.4 : 0)));
    }
  }
}

/**
 * The back of a stall: its base is just behind the keeper. The roof (drawn with the counter, in front)
 * hides its top; what shows beneath the valance is a dark wall of boards behind the keeper's head, a
 * shelf of jars and strings of onions at the sides, sacks stored at the foot.
 */
function stallBack(seed: number): Art {
  const p = new Pic(-24, -38, 23, 0);
  // The back wall of boards, deep in the awning's shade.
  boards(p, -21, -36, 43, 37, WOOD, seed, 5, 1.6);
  for (let y = -36; y <= 0; y++) for (let x = -21; x <= 21; x++) p.dim(x, y, 0.3);
  post(p, -23, -38, 0, DARK_WOOD, 2);
  post(p, 21, -38, 0, DARK_WOOD, 2);
  // A shelf along the back with jars, plain behind the keeper's head.
  p.hline(-21, 21, -10, WOOD[4]);
  p.hline(-21, 21, -9, WOOD[1]);
  const goods: Array<[number, Ramp, number, number]> = [
    [-18, CLAY, 4, 5],
    [-14, ['#1e3a2a', '#2e5a3a', '#4a8050', '#7ab070', '#b0e0a0'], 2, 4],
    [-11, ['#3a2a10', '#6a4a18', '#a87828', '#e0b048', '#f8e090'], 3, 4],
    [10, ['#2a2050', '#3e3478', '#5a54a8', '#8a84d0', '#c0bcf0'], 2, 5],
    [13, CLAY, 4, 4],
    [18, ['#3a2a10', '#6a4a18', '#a87828', '#e0b048', '#f8e090'], 3, 5],
  ];
  for (const [x, r, w, h] of goods) jar(p, x, -11, w, h, r, seed + x);
  // Strings of onions and garlic hanging by the posts.
  for (const [x, col] of [[-20, ['#6a3a1a', '#b8763a', '#e8b070']], [19, ['#8a8070', '#d8d0bc', '#f8f4e8']]] as const) {
    p.vline(x, -24, -20, ROPE_DK);
    for (let k = 0; k < 5; k++) {
      const y = -19 + k * 2;
      p.px(x - 1 + (k % 2), y, col[1]);
      p.px(x + (k % 2), y, col[2]);
      p.px(x - 1 + (k % 2), y + 1, col[0]);
      p.px(x + (k % 2), y + 1, col[1]);
    }
  }
  // Sacks and a crate stored at the foot of the wall.
  p.ball(-16, -2.6, 3.6, 3, ['#3a2c1c', '#5a4630', '#7a644a', '#9a8464', '#b8a482']);
  p.ball(-11, -2.2, 3, 2.6, ['#3a2c1c', '#5a4630', '#7a644a', '#9a8464', '#b8a482']);
  crate(p, 12, 0, 8, 3, 1, WOOD);
  for (let y = -6; y <= 0; y++) for (let x = -21; x <= 21; x++) p.dim(x, y, 0.2);
  return p.art();
}

function stallFront(seed: number): Art {
  const p = new Pic(-24, -53, 23, 0);
  const { c, w } = AWNINGS[Math.floor(hash(seed, 1) * AWNINGS.length)];
  // Front posts, framing the counter, up to the awning.
  post(p, -23, -36, 0, WOOD, 2);
  post(p, 21, -36, 0, WOOD, 2);
  // The counter: its top (a board, lit along its front edge), its front of boards with a cloth draped over it.
  for (let y = -16; y <= -10; y++) for (let x = -21; x <= 20; x++) p.px(x, y, at(WOOD, y === -10 ? 5 : y === -16 ? 1.6 : 3.4 + (x < -8 ? 0.3 : 0) - (y - -16) * 0.08 + (hash(seed, x, y) < 0.06 ? -0.6 : 0)));
  boards(p, -21, -9, 42, 9, WOOD, seed + 9, 5, 2.4);
  p.hline(-21, 20, 0, WOOD[0]);
  // The cloth over its front edge: the awning's stripes, a scalloped hem.
  for (let x = -21; x <= 20; x++) {
    const s = Math.floor((x + 21) / 6) % 2 === 0;
    const R = s ? c : w;
    const u = (x + 21) % 6;
    const tongue = u === 0 || u === 5 ? 0 : 1;
    for (let y = -9; y <= -7 + tongue; y++) p.px(x, y, at(R, y === -9 ? 3.4 : y === -7 + tongue ? 1.4 : 2.4));
  }
  // Goods at the counter's ends (the middle is the keeper's): a crate of apples, a basket of loaves.
  crate(p, -20, -12, 10, 3, 1, WOOD);
  heap(p, -19, -16, 9, 3, ['#4a0c0c', '#8a1a14', '#c43222', '#ee6a4a', '#ffb090'], seed, 2);
  for (const [x, y] of [[-17, -19], [-14, -19], [-11, -18]] as const) p.px(x, y, '#5a8a2a');
  for (let x = 9; x <= 19; x++) for (let y = -14; y <= -11; y++) p.px(x, y, at(HAY, y === -14 ? 4 : (x + y) % 3 === 0 ? 1.6 : 2.6));
  for (const bx of [10, 13, 16]) p.ball(bx + 1.5, -15.5, 2.4, 1.6, ['#5a2a0e', '#8a4a1a', '#c07a34', '#e4aa5a', '#f8d898']);
  // A little open ledger and a few coins by the keeper's hand.
  p.hline(3, 7, -14, '#f0e8d4');
  p.hline(3, 7, -13, '#c8bca4');
  p.px(5, -14, '#9a8e7a');
  p.px(-6, -13, BRASS[4]);
  p.px(-5, -13, BRASS[3]);
  // A crate of cabbages on the ground at the right, a sack at the left, against the counter.
  crate(p, 11, 0, 10, 5, 2, WOOD);
  for (const x of [12, 15, 18]) p.ball(x + 1.2, -7.4, 1.9, 1.6, ['#24481e', '#3e6e2a', '#62963a', '#8cc050', '#c4e488']);
  p.ball(-17, -3.5, 4, 3.6, ['#4e3c26', '#7a6040', '#a48660', '#c8ac84', '#e4d0a8']);
  p.hline(-18, -16, -7, '#5a4228');
  // The awning, a lantern hanging from its front edge on the left.
  awning(p, -24, 23, -50, -37, 4, c, w);
  lantern(p, -17, -35);
  return p.art({ light: { dx: -17, dy: -30, color: '#ffc070', r: 58, flicker: true } });
}

// ------------------------------------------------------------------ the shrine: a little roofed stall

const LACQUER: Ramp = ['#2a0808', '#4a0e0c', '#741a14', '#9e2a1e', '#c4442c', '#e06a44'];
const TILES: Ramp = ['#141c22', '#202c34', '#2e3e48', '#40545e', '#5a707a', '#7e949c'];
const INDIGO: Ramp = ['#0e1230', '#18204a', '#24306a', '#34468c', '#5268b0'];

/** A paper lantern hanging from (x, y): a dark cap, the lit paper in ribs, a red band, a tassel. */
function paperLantern(p: Pic, x: number, y: number, red: boolean): void {
  p.vline(x, y, y + 1, INK);
  p.hline(x - 1, x + 1, y + 2, DARK_WOOD[2]);
  const paper: Ramp = red ? ['#7a1410', '#c02a1e', '#ee5a3a', '#ff9a6a', '#ffd8b0'] : ['#a86a2a', '#e8a84a', '#ffd88a', '#fff2c8', '#ffffff'];
  for (let yy = 0; yy < 7; yy++) {
    const half = yy === 0 || yy === 6 ? 1 : yy === 1 || yy === 5 ? 2 : 3;
    for (let xx = -half; xx <= half; xx++) {
      let k = 3.2 - (xx + half) / (half * 2 + 1) * 1.6 + (yy < 3 ? 0.4 : 0);
      if (yy % 2 === 1 && Math.abs(xx) === half) k -= 0.8;
      p.px(x + xx, y + 3 + yy, at(paper, k));
    }
  }
  if (!red) p.hline(x - 2, x + 2, y + 6, '#c83a2a');
  else p.px(x, y + 6, '#ffe8c0');
  p.hline(x - 1, x + 1, y + 10, DARK_WOOD[2]);
  p.vline(x, y + 11, y + 12, red ? '#ffd040' : '#c83a2a');
}

function yataiBack(seed: number): Art {
  const p = new Pic(-24, -38, 23, 0);
  // A wall of dark slats behind, shelves of tea jars at the sides, charms on a cord.
  boards(p, -21, -36, 43, 37, DARK_WOOD, seed, 3, 2.6);
  for (let y = -36; y <= 0; y++) for (let x = -21; x <= 21; x++) p.dim(x, y, 0.12);
  post(p, -23, -38, 0, LACQUER, 2);
  post(p, 21, -38, 0, LACQUER, 2);
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -20 : 9;
    p.hline(x0, x0 + 11, -6, DARK_WOOD[5]);
    p.hline(x0, x0 + 11, -5, DARK_WOOD[1]);
    for (let k = 0; k < 3; k++) jar(p, x0 + 2 + k * 4, -7, 3, 4, k === 1 ? ['#1e2a30', '#2e4450', '#4a6a7a', '#7aa0b0', '#c0e0e8'] : ['#3a2418', '#5e3c24', '#8a5c38', '#b88a5a', '#e0c094'], seed + k);
  }
  // Charms on a cord: little pouches of red, white and gold, either side of the keeper.
  rope(p, -20, -14, 19, -14, 1.5, ROPE);
  for (const x of [-17, -13, -9, 9, 13, 17]) {
    const col = ['#c83a2a', '#f4ecdc', '#e8b848', '#3a7a5a'][(x + 40) % 4];
    p.px(x, -12, ROPE_DK);
    p.rect(x - 1, -11, 2, 3, col);
    p.px(x - 1, -11, mixHex(col, '#ffffff', 0.35));
  }
  return p.art({ light: { dx: 20, dy: -14, color: '#ff9a5a', r: 46, flicker: true } });
}

function yataiFront(seed: number): Art {
  const p = new Pic(-26, -54, 25, 0);
  post(p, -23, -36, 0, LACQUER, 2);
  post(p, 21, -36, 0, LACQUER, 2);
  // The counter: lacquered red front with a dark plinth, a mat of split bamboo on top.
  for (let y = -16; y <= -10; y++) for (let x = -21; x <= 20; x++) p.px(x, y, (x + 30) % 2 === 0 ? at(HAY, y === -10 ? 5 : 3.6 - (y + 16) * 0.12) : at(HAY, y === -10 ? 4.4 : 2.9 - (y + 16) * 0.1));
  p.hline(-21, 20, -16, HAY[1]);
  for (let y = -9; y <= 0; y++) for (let x = -21; x <= 20; x++) p.px(x, y, at(LACQUER, y === -9 ? 4.6 : y >= -1 ? 1 : x === -21 ? 3.6 : 2.8 - (y + 9) * 0.06));
  // A carved panel with a gold crest in the middle of the front.
  for (let y = -7; y <= -2; y++) for (let x = -5; x <= 4; x++) if (x === -5 || x === 4 || y === -7 || y === -2) p.px(x, y, LACQUER[1]);
  p.ball(-0.5, -4.5, 2.2, 2, BRASS);
  p.px(-1, -5, BRASS[5]);
  // Goods: a tray of charms on the left, incense smoking in a bowl, a daruma and sake bottles on the right.
  crate(p, -19, -12, 11, 2, 1, DARK_WOOD);
  for (let k = 0; k < 5; k++) {
    const col = ['#c83a2a', '#f4ecdc', '#e8b848', '#3a7a5a', '#5a68c0'][k];
    p.rect(-18 + k * 2, -16, 1, 3, col);
    p.px(-18 + k * 2, -16, mixHex(col, '#ffffff', 0.4));
  }
  p.ball(-6, -12.5, 2.4, 1.5, IRON);
  for (const [x, h] of [[-7, 5], [-6, 6], [-5, 4]] as const) p.vline(x, -13 - h, -14, '#8a4a2a');
  p.px(-6, -21, '#c8c0d0');
  p.px(-5, -23, '#a8a0b8');
  p.px(-6, -25, '#8a849c');
  p.ball(8.5, -14.5, 2.8, 2.6, ['#4a0808', '#8a1414', '#c82a1e', '#f05a3a', '#ffa080']);
  p.px(8, -15, '#fff4e0');
  p.px(9, -15, INK);
  for (const x of [13, 16, 19]) {
    p.rect(x, -17, 2, 5, x === 16 ? '#e8e4dc' : '#f8f4ee');
    p.px(x + 1, -17, '#c8c4bc');
    p.px(x, -18, '#3a5aa0');
    p.px(x, -15, '#3a5aa0');
  }
  // The roof: a short tiled roof with upturned corners over a red fascia board.
  const yb = -53;
  const yf = -39;
  for (let y = yb; y <= yf; y++) {
    const t = (y - yb) / (yf - yb);
    const inset = Math.round((1 - t) * 3);
    for (let x = -25 + inset; x <= 24 - inset; x++) {
      const course = (y - yb) % 3;
      const col = (x + (Math.floor((y - yb) / 3) % 2) * 2) % 4;
      let k = 3 - t * 0.8 + (x < 0 ? 0.3 : -0.2);
      if (course === 2) k -= 1.2;
      else if (course === 0) k += 0.6;
      if (col === 0) k -= 0.6;
      p.px(x, y, at(TILES, k));
    }
  }
  // The ridge with its end tiles.
  p.hline(-22, 21, yb - 1, TILES[4]);
  p.hline(-22, 21, yb - 2, TILES[2]);
  for (const x of [-23, 22]) {
    p.px(x, yb - 2, TILES[3]);
    p.px(x, yb - 3, TILES[4]);
  }
  // The eave's corners curl up.
  for (const [x, d] of [[-26, -1], [25, 1]] as const) {
    p.px(x, yf - 1, TILES[3]);
    p.px(x, yf - 2, TILES[4]);
    p.px(x - d, yf, TILES[2]);
  }
  for (let x = -25; x <= 24; x++) {
    p.px(x, yf + 1, LACQUER[4]);
    p.px(x, yf + 2, LACQUER[2]);
  }
  // A short indigo curtain in three panels under the eave, a white crest on the middle one.
  for (let x = -21; x <= 20; x++) {
    const panel = Math.floor((x + 21) / 14);
    const u = (x + 21) % 14;
    if (u === 13 || u === 0) continue;
    for (let y = yf + 3; y <= yf + 6; y++) p.px(x, y, at(INDIGO, y === yf + 3 ? 3 : y === yf + 6 ? 1 : 2.2 - (x > 10 ? 0.4 : 0)));
    if (panel === 1 && u >= 5 && u <= 8) p.px(x, yf + 4 + (u === 5 || u === 8 ? 1 : 0), '#e8ecf4');
  }
  // Paper lanterns at both front corners, one red, one white.
  const red = hash(seed, 2) < 0.5;
  paperLantern(p, -21, yf + 2, red);
  paperLantern(p, 20, yf + 2, !red);
  return p.art({ light: { dx: -21, dy: yf + 7, color: '#ff8a4a', r: 50, flicker: true } });
}

// ------------------------------------------------------------------ the farm: a hay cart and a produce stand

function hayCart(seed: number): Art {
  const p = new Pic(-18, -30, 17, 0);
  // The near shaft resting on the ground at the left.
  p.line(-17, -1, -9, -8, WOOD[3]);
  p.line(-17, 0, -9, -7, WOOD[1]);
  // The hay, heaped high: lit straw on top, darker where it meets the bed, wisps.
  for (let x = -14; x <= 15; x++) {
    const top = -20 - Math.round(Math.sin(((x + 14) / 29) * Math.PI) * 6 + Math.sin(x * 0.9 + seed) * 0.8);
    for (let y = top; y <= -12; y++) {
      const t = (y - top) / Math.max(1, -12 - top);
      let k = 4.2 - t * 2.4 + (x < -2 ? 0.4 : x > 9 ? -0.4 : 0);
      if (hash(seed, x, y) < 0.22) k -= 0.9;
      else if (hash(seed, x, y, 2) < 0.08) k += 0.8;
      p.px(x, y, at(HAY, k));
    }
    if (hash(seed, x, 9) < 0.35) p.px(x + (x % 2), top - 1, HAY[4]);
  }
  // The pitchfork stuck in.
  p.line(6, -29, 9, -17, WOOD[4]);
  p.line(7, -29, 10, -17, WOOD[2]);
  for (const dx of [-1, 1, 3]) p.vline(4 + dx, -31 + (dx === 1 ? 0 : 1), -29, IRON[4]);
  p.hline(3, 7, -29, IRON[3]);
  // The bed's side boards and stakes.
  planks(p, -15, -12, 31, 7, WOOD, seed + 4, 3, 2.9);
  p.hline(-15, 15, -12, WOOD[5]);
  for (const x of [-15, -5, 5, 15]) {
    p.vline(x, -15, -5, WOOD[x === 15 ? 2 : 4]);
    p.px(x, -16, WOOD[5]);
  }
  // The wheel: an iron tire, six spokes, a hub.
  const wx = 1;
  const wy = -5;
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    const x = wx + Math.cos(t) * 5.4;
    const y = wy + Math.sin(t) * 5.1;
    p.px(x, y, Math.cos(t) + Math.sin(t) < -0.4 ? IRON[4] : IRON[2]);
  }
  for (let k = 0; k < 6; k++) {
    const t = (k / 6) * Math.PI * 2 + 0.3;
    p.line(wx, wy, wx + Math.cos(t) * 4.2, wy + Math.sin(t) * 4, WOOD[k < 3 ? 2 : 4]);
  }
  p.rect(wx - 1, wy - 1, 2, 2, WOOD[5]);
  p.px(wx, wy, WOOD[1]);
  return p.art();
}

function produceStand(seed: number): Art {
  const p = new Pic(-10, -26, 9, 0);
  // A low crate of pumpkins, a tilted crate of apples on it, a painted sign on a stake.
  crate(p, -8, 0, 15, 6, 2, WOOD);
  for (const [x, y] of [[-6, -8], [-1, -8.5], [4, -8]] as const) {
    p.ball(x + 0.5, y, 2.6, 2, CLAY);
    p.px(x, y - 2, '#3a5a20');
  }
  crate(p, -7, -10, 12, 4, 2, WOOD);
  heap(p, -6, -16, 11, 2, ['#4a0c0c', '#8a1a14', '#c43222', '#ee6a4a', '#ffb090'], seed, 2);
  p.ball(-6, -17, 2.4, 2, ['#24481e', '#3e6e2a', '#62963a', '#8cc050', '#c4e488']);
  // The sign.
  p.vline(6, -17, -1, WOOD[2]);
  p.vline(7, -17, -1, WOOD[1]);
  for (let y = -25; y <= -18; y++) for (let x = 2; x <= 9; x++) p.px(x, y, at(WOOD, y === -25 ? 5 : x === 9 || y === -18 ? 2 : 4));
  p.ball(5.2, -21.5, 1.8, 1.7, ['#6a0c0c', '#a81a14', '#e03a22', '#ff7a5a']);
  p.px(5, -24, '#3a6a20');
  // A basket of eggs on the ground.
  for (let x = -10; x <= -6; x++) for (let y = -2; y <= 0; y++) p.px(x, y, at(HAY, y === -2 ? 4 : 2));
  return p.art();
}

// ------------------------------------------------------------------ Gloomwood: a canvas tent and a log seat

function canvasTent(seed: number): Art {
  const p = new Pic(-20, -34, 20, 0);
  const R = CANVAS;
  const D = 9; // how far its roof runs back
  const ax = 0;
  const ay = -22;
  const half = 15;
  // The roof's two sides running back from the front gable: the left one lit, the right in shade.
  for (let y = ay - D; y <= -1; y++) {
    for (let x = -half; x <= half; x++) {
      // Between the gable's edge at this x and the same edge D px further back (up).
      const edge = ay + ((Math.abs(x) / half) * (-1 - ay));
      if (y > edge || y < edge - D) continue;
      const left = x < 0;
      let k = left ? 4.1 - ((y - (edge - D)) / D) * 0.7 : 2.0 - ((y - (edge - D)) / D) * 0.4;
      // Seams running down the slope.
      if (Math.abs(x) % 6 === 3) k -= 0.6;
      if (hash(seed, x, y) < 0.05) k -= 0.4;
      p.px(x, y, at(R, k));
    }
  }
  // A patch on the lit side.
  for (let y = -16; y <= -13; y++) for (let x = -11; x <= -8; x++) if (p.has(x, y)) p.px(x, y, (x + y) % 4 === 0 ? R[2] : '#b8a070');
  // The ridge, its pole poking out front and back.
  p.line(ax, ay, ax, ay - D, R[5]);
  p.px(ax, ay - D - 1, WOOD[4]);
  p.px(ax, ay - 1, WOOD[3]);
  p.px(ax, ay - 2, WOOD[4]);
  // The front gable, in shade, with its flaps tied back from a dark doorway.
  for (let y = ay; y <= -1; y++) {
    const w = Math.round(((y - ay) / (-1 - ay)) * half);
    for (let x = -w; x <= w; x++) p.px(x, y, at(R, 2.4 - (x > 0 ? 0.5 : 0) + (y < ay + 3 ? 0.4 : 0)));
  }
  for (let y = ay + 4; y <= -1; y++) {
    const w = Math.round(((y - ay - 4) / (-1 - ay - 4)) * 8);
    for (let x = -w; x <= w; x++) p.px(x, y, y > -5 ? '#24160e' : '#140c0a');
  }
  // A bedroll inside.
  p.rect(-5, -3, 9, 2, '#8a2a22');
  p.hline(-5, 3, -3, '#b8443a');
  p.px(4, -3, '#5a1a14');
  // The tied-back flaps.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const y = ay + 6 + k;
      const x0 = s * (2 + Math.round(k * 0.75));
      for (let j = 0; j < 3; j++) p.px(x0 + s * j, y, at(R, s < 0 ? 3.6 - j * 0.3 : 2.2 - j * 0.3));
    }
    p.px(s * 6, ay + 10, ROPE);
    p.px(s * 7, ay + 10, ROPE_DK);
  }
  // Guy ropes to pegs.
  rope(p, -11, -9, -19, -1, 0.5, ROPE_DK);
  rope(p, 11, -9, 19, -1, 0.5, ROPE_DK);
  p.vline(-19, -2, 0, WOOD[4]);
  p.vline(19, -2, 0, WOOD[3]);
  // A lantern hung from the ridge pole.
  lantern(p, 0, ay - 1);
  return p.art({ light: { dx: 0, dy: ay + 4, color: '#ffc070', r: 44, flicker: true } });
}

function logSeat(seed: number): Art {
  const p = new Pic(-8, -9, 7, 0);
  // A sawn log on its side: bark lit on top, the cut end's rings at the left, moss and a toadstool.
  for (let x = -6; x <= 7; x++) for (let y = -8; y <= 0; y++) {
    const ny = (y + 4) / 4.5;
    if (Math.abs(ny) > 1.02) continue;
    let k = 3.6 - (ny + 1) * 1.3;
    if ((x * 5 + y * 3 + seed) % 7 === 0) k -= 0.7;
    p.px(x, y, at(['#1a120c', '#2e2016', '#463222', '#604632', '#7a5c42', '#94765a'], k));
  }
  p.ball(-6, -4, 2.6, 4.4, ['#5a4024', '#8a6a44', '#b08a5a', '#d4ae7a', '#ecd0a0'], 0.5);
  p.px(-6, -4, '#8a6a44');
  p.px(-6, -6, '#a8845a');
  p.px(-6, -2, '#a8845a');
  for (let x = -3; x <= 4; x++) if (hash(seed, x) < 0.6) p.px(x, -8, MOSS[hash(seed, x, 2) < 0.5 ? 2 : 3]);
  p.px(5, -3, '#e8dcc4');
  p.px(5, -4, '#c84a3a');
  p.px(6, -4, '#a8302a');
  return p.art();
}

// ------------------------------------------------------------------ the tundra: a hide tent and a fire bowl

function hideTent(seed: number): Art {
  const p = new Pic(-17, -38, 17, 0);
  const apex = -28;
  // The cone of stitched hides: lit on the left, round into shade on the right.
  for (let y = apex; y <= -1; y++) {
    const t = (y - apex) / (-1 - apex);
    const half = 1 + t * 15 + Math.sin(t * Math.PI) * 1.2;
    for (let x = Math.round(-half); x <= Math.round(half); x++) {
      const u = x / half;
      let k = 3.4 - (u + 0.35) * 1.7;
      // The hides: big panels, a darker seam between them, little stitches across it.
      const seam = Math.abs(((x + t * 9 + 40) % 9) - 0) < 0.6 || Math.abs(y - (apex + 11)) < 0.5 || Math.abs(y - (apex + 20)) < 0.5;
      if (seam) k -= 1.1;
      if (seam && (x + y) % 3 === 0) k += 1.6;
      if (hash(seed, Math.floor((x + 40) / 9), Math.floor((y - apex) / 10)) < 0.35) k -= 0.4;
      p.px(x, y, at(HIDE, k));
    }
  }
  // Snow on the upper slopes and drifted round the foot.
  for (let y = apex; y <= -1; y++) {
    const t = (y - apex) / (-1 - apex);
    const half = 1 + t * 15 + Math.sin(t * Math.PI) * 1.2;
    for (let x = Math.round(-half); x <= Math.round(half); x++) {
      const u = x / half;
      if (y < apex + 9 && u < 0.5 && hash(seed, x, y, 4) < 0.9 - t * 1.8) p.px(x, y, at(SNOW, u < -0.3 ? 4 : 3));
    }
  }
  for (let x = -16; x <= 16; x++) {
    const h = Math.round(1.5 + Math.sin(x * 0.7 + seed) * 1);
    for (let y = -h; y <= 0; y++) p.px(x, y, at(SNOW, y === -h ? 4 : x > 6 ? 1.6 : 2.6));
  }
  // The poles crossing above the smoke hole.
  for (const [dx, dy] of [[-5, -10], [-2, -11], [2, -11], [5, -9]] as const) p.line(0, apex + 2, dx, apex + dy, (t) => (t < 0.5 ? WOOD[2] : WOOD[4]));
  // A painted sun on the lit side.
  for (const [x, y] of [[-8, -15], [-7, -15], [-8, -14], [-7, -14], [-9, -16], [-6, -16], [-9, -13], [-6, -13], [-10, -14], [-5, -15]] as const) p.px(x, y, x === -8 || x === -7 ? '#c84a26' : '#a83a1e');
  // The doorway, its fur-trimmed flap pinned back.
  for (let y = -11; y <= -2; y++) {
    const w = Math.round(1 + ((y + 11) / 9) * 4);
    for (let x = -w + 1; x <= w + 1; x++) p.px(x, y, y > -4 ? '#1e1410' : '#120c0a');
  }
  for (let y = -11; y <= -2; y++) {
    const x = 2 + Math.round(((y + 11) / 9) * 4);
    p.px(x + 1, y, at(HIDE, 3.6));
    p.px(x + 2, y, '#e8dcc8');
    p.px(x + 3, y, '#b8a890');
  }
  return p.art();
}

function fireBowl(biome: Biome): Art {
  const p = new Pic(-8, -12, 7, 0);
  // Three splayed legs.
  p.line(-4, -5, -6, 0, IRON[3]);
  p.line(4, -5, 6, 0, IRON[1]);
  p.line(0, -4, 0, 0, IRON[2]);
  // The bowl: a wide iron dish, its rim lit, coals glowing inside.
  for (let y = -9; y <= -4; y++) {
    const half = y === -4 ? 3 : y === -5 ? 5 : 7;
    for (let x = -half; x <= half; x++) p.px(x, y, at(IRON, 2.6 - (x + half) / (half * 2) * 1.6 - (y + 9) * 0.15 + (y === -9 ? 1.4 : 0)));
  }
  p.hline(-6, 6, -10, IRON[4]);
  p.px(-7, -9, IRON[5]);
  embers(p, 0, -10, 11);
  p.px(-3, -11, COALS[4]);
  p.px(2, -11, COALS[3]);
  return p.art({ light: { dx: 0, dy: -12, color: mixHex(biome.light.fire, '#ffd080', 0.45), r: 88, flicker: true }, flame: { dx: 0, dy: -9, size: 2 } });
}

// ------------------------------------------------------------------ the crypt: a candlelit shrine in an alcove

function shrineNiche(biome: Biome, seed: number): Art {
  const st = stoneOf(biome);
  const p = new Pic(-20, -36, 20, 0);
  const archTop = -34;
  const springs = -22; // where the arch springs from the columns
  // The frame: a block of carved stone with an arched opening.
  for (let y = archTop; y <= -5; y++) {
    for (let x = -18; x <= 18; x++) {
      // The outer outline rounds over the top.
      const ox = x / 18.5;
      const oy = y < springs ? (y - springs) / (springs - archTop + 0.5) : 0;
      if (ox * ox + oy * oy > 1) continue;
      // Courses of stone blocks.
      const row = Math.floor((y + 40) / 5);
      const bx = (x + 40 + (row % 2) * 3) % 7;
      let k = 3 + (x < -6 ? 0.4 : x > 8 ? -0.6 : 0);
      if ((y + 40) % 5 === 0 || bx === 0) k = 1.2;
      if (hash(seed, Math.floor((x + 40 + (row % 2) * 3) / 7), row) < 0.25) k -= 0.4;
      p.px(x, y, at(st, k));
    }
  }
  // The recess: dark, warmed toward the candles at its foot.
  for (let y = archTop + 5; y <= -5; y++) {
    for (let x = -12; x <= 12; x++) {
      const ix = x / 12.5;
      const iy = y < springs ? (y - springs) / (springs - archTop - 4.5) : 0;
      if (ix * ix + iy * iy > 1) continue;
      const warm = Math.max(0, (y + 18) / 13);
      p.px(x, y, mixHex(mixHex('#080c0c', '#1a1612', warm), '#3a2416', warm * 0.5));
    }
  }
  // The arch's voussoirs and keystone, a lit edge round the opening.
  for (let a = 0; a <= 32; a++) {
    const t = (a / 32) * Math.PI;
    const x = -Math.cos(t) * 13.4;
    const y = springs - Math.sin(t) * (springs - archTop - 4);
    p.px(x, y, at(st, a < 16 ? 4.6 : 3.6));
    if (a % 4 === 2) p.px(x * 1.25, y - Math.sin(t) * 2.4, at(st, 1));
  }
  p.rect(-2, archTop, 4, 4, at(st, 4.2));
  p.hline(-2, 1, archTop, at(st, 5));
  p.vline(2, archTop, archTop + 3, at(st, 2));
  // Two little columns either side of the opening, with capitals.
  for (const cx of [-15, 14]) {
    for (let y = springs; y <= -5; y++) {
      p.px(cx, y, at(st, 4.4));
      p.px(cx + 1, y, at(st, 3.2));
      p.px(cx + 2, y, at(st, 1.8));
    }
    p.hline(cx - 1, cx + 3, springs - 1, at(st, 4.8));
    p.hline(cx - 1, cx + 3, springs, at(st, 2));
  }
  // A hooded figure praying on a little pedestal, pale stone: the hood, the face in its shadow,
  // hands together over the robe, which spreads to its hem.
  const pale: Ramp = ['#3a3630', '#5e584c', '#8a8270', '#b4ac96', '#d8d0b8', '#f0ead8'];
  p.rect(-5, -9, 10, 5, at(pale, 2.4));
  p.vline(-5, -8, -5, at(pale, 3.4));
  p.hline(-5, 4, -9, at(pale, 4.4));
  p.hline(-5, 4, -5, at(pale, 1.4));
  const robe = [1, 2, 2.5, 2.5, 2, 2.5, 3, 3, 3.5, 3.5, 4, 4, 4.5, 4.5, 5];
  robe.forEach((half, i) => {
    const y = -24 + i;
    for (let x = Math.round(-half); x <= Math.round(half - 1); x++) {
      const u = (x + half) / (half * 2);
      let k = 4.3 - u * 2.6;
      // Folds running down the robe below the hands.
      if (i > 9 && (x === 0 || x === -3) ) k -= 0.8;
      p.px(x, y, at(pale, k));
    }
  });
  for (const [x, y] of [[-1, -22], [0, -22], [-1, -21], [0, -21], [-2, -21]] as const) p.px(x, y, '#1a1612');
  p.px(-1, -21, '#2e2820');
  p.rect(-1, -17, 2, 2, at(pale, 5));
  p.px(0, -16, at(pale, 3.2));
  // The plinth step in front, with candles along it and wax pooled.
  for (let y = -4; y <= 0; y++) for (let x = -20; x <= 20; x++) p.px(x, y, at(st, y === -4 ? 4.8 : y === -3 ? 3.8 : x < -14 ? 3 : 2.2 - (y + 3) * 0.2));
  for (const [x, h] of [[-12, 5], [-10, 3], [-8, 4], [7, 4], [9, 6], [11, 3]] as const) candle(p, x, -5, h);
  for (const [x, h] of [[-18, 3], [-16, 5], [15, 4], [17, 2]] as const) candle(p, x, -1, h);
  for (const x of [-11, -9, 8, 10]) p.px(x, -4, '#ece2c4');
  // Moss in the joints, a crack.
  for (let x = -18; x <= 18; x++) if (hash(seed, x, 21) < 0.25) p.px(x, -5, MOSS[1 + (x % 2 === 0 ? 1 : 0)]);
  p.line(10, -30, 12, -26, at(st, 1));
  return p.art({ light: { dx: 0, dy: -12, color: '#ffb860', r: 64, flicker: true } });
}

// ------------------------------------------------------------------ the bog: a hut on stilts and a rowboat

const THATCH: Ramp = ['#26260e', '#3c3a16', '#56521e', '#726a2a', '#8e8438', '#aaa050'];

function stiltHut(biome: Biome, seed: number): Art {
  const p = new Pic(-24, -48, 23, 0);
  const W = GREY_WOOD;
  // Stilts: the back two shorter and darker, the front two down into the mud, braced.
  for (const x of [-12, 17]) post(p, x, -16, -3, W, 2);
  for (let y = -16; y <= -3; y++) for (const x of [-12, -11, 17, 18]) p.dim(x, y, 0.35);
  for (const x of [-17, 13]) post(p, x, -14, 0, W, 2);
  p.line(-15, -12, 12, -3, W[2]);
  p.line(-15, -3, 12, -12, W[1]);
  // The deck, its planks' ends toward us.
  for (let y = -17; y <= -14; y++) for (let x = -19; x <= 19; x++) p.px(x, y, at(W, y === -17 ? 5 : y === -14 ? 1.4 : (x + 30) % 4 === 0 ? 2 : 3.4));
  // The walls: weathered boards, a door, a lit window.
  boards(p, -16, -33, 31, 16, W, seed, 4, 3);
  for (let y = -33; y <= -18; y++) p.dim(15, y, 0.3);
  for (let y = -30; y <= -18; y++) for (let x = -5; x <= 1; x++) p.px(x, y, x === -5 || x === 1 || y === -30 ? W[1] : (x + 30) % 3 === 0 ? '#181410' : '#221c16');
  p.px(0, -24, BRASS[4]);
  for (let y = -29; y <= -24; y++) for (let x = 6; x <= 11; x++) p.px(x, y, x === 6 || x === 11 || y === -29 || y === -24 ? W[1] : y < -27 ? GLOW[4] : x === 8 || x === 9 ? GLOW[3] : GLOW[2]);
  p.vline(8, -28, -25, W[2]);
  p.hline(7, 10, -26, W[2]);
  // A net hung on the wall.
  for (let y = -31; y <= -26; y++) for (let x = -14; x <= -9; x++) if ((x + y) % 2 === 0) p.px(x, y, (x - y) % 4 === 0 ? '#c8b88a' : '#8a7a5a');
  // The roof: reed thatch, mossy, its ragged hem overhanging.
  const yb = -47;
  const yf = -33;
  for (let y = yb; y <= yf + 2; y++) {
    const t = (y - yb) / (yf - yb);
    const half = 12 + t * 10;
    for (let x = Math.round(-half); x <= Math.round(half); x++) {
      if (y > yf && hash(seed, x, 11) < (y - yf) * 0.4) continue;
      let k = 4 - t * 1.6 + (x < -4 ? 0.4 : x > 8 ? -0.5 : 0);
      if (hash(seed, x, y) < 0.2) k -= 1;
      p.px(x, y, at(THATCH, k));
    }
  }
  for (let k = 0; k < 7; k++) {
    const x = -14 + Math.floor(hash(seed, k, 3) * 26);
    const y = yb + 3 + Math.floor(hash(seed, k, 4) * 9);
    p.px(x, y, MOSS[3]);
    p.px(x + 1, y, MOSS[2]);
    p.px(x, y + 1, MOSS[1]);
  }
  // The ladder down from the deck.
  p.line(-9, -14, -11, 0, W[4]);
  p.line(-5, -14, -7, 0, W[2]);
  for (let y = -12; y <= -2; y += 3) p.hline(-10 + Math.round((y + 14) / 7), -6 + Math.round((y + 14) / 7) - 1, y, W[3]);
  // A lantern at the deck's corner.
  p.vline(19, -24, -18, W[2]);
  p.hline(17, 19, -24, W[3]);
  lantern(p, 17, -23);
  // Reeds at the foot of the stilts.
  for (const x of [-20, -19, 15, 21, 22]) for (let y = -4 - (x % 3); y <= 0; y++) p.px(x, y, y < -3 ? '#6a8a3a' : '#3e5a24');
  return p.art({ light: { dx: 12, dy: -22, color: mixHex(biome.light.fire, '#ffc860', 0.55), r: 62, flicker: true } });
}

function rowboat(seed: number): Art {
  const p = new Pic(-12, -11, 12, 0);
  const paint: Ramp = ['#14221f', '#1f3832', '#2d5048', '#3f6c5e', '#578a78', '#78a894'];
  const L = 11;
  // Seen from above and the side: the opening between the gunwales is a long almond, the stern
  // square at the left, the bow coming to a point (and up) at the right.
  const half = (x: number) => {
    const u = (x + L) / (L * 2);
    return u < 0.08 ? 1.8 : 2.6 * Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.42) / 0.6, 2)));
  };
  const mid = (x: number) => -7 - Math.round(Math.pow(Math.max(0, (x - 4) / 7), 2) * 2);
  for (let x = -L + 1; x <= L - 1; x++) {
    const hw = half(x);
    const cy = mid(x);
    const top = Math.round(cy - hw * 0.55);
    const rim = Math.round(cy + hw * 0.55);
    // The inside: the far side's planks lit, the bottom boards, two thwarts across.
    for (let y = top + 1; y < rim; y++) p.px(x, y, at(GREY_WOOD, y === top + 1 ? 3.6 : 2 + (hash(seed, x, y) < 0.15 ? -0.6 : 0)));
    if (x === -5 || x === 3) for (let y = top + 1; y < rim; y++) p.px(x, y, GREY_WOOD[4]);
    p.px(x, top, at(GREY_WOOD, 4.8));
    // The near side, painted, curving down to the keel.
    const keel = -1 - Math.round(Math.max(0, (x - 3) / 8) * 3);
    for (let y = rim; y <= keel; y++) {
      const v = (y - rim) / Math.max(1, keel - rim);
      let k = y === rim ? 4.6 : 3.2 - v * 1.8 + (x < -4 ? 0.3 : 0);
      if (y !== rim && Math.abs(v - 0.5) < 0.2) k -= 0.7;
      if (hash(seed, x, y, 4) < 0.08) k += 0.6;
      p.px(x, y, at(y === rim ? GREY_WOOD : paint, k));
    }
  }
  // The stern's flat transom, the bow's stem.
  p.vline(-L, -9, -2, at(paint, 2.4));
  p.vline(L, -11, -8, GREY_WOOD[3]);
  // An oar laid inside, its blade over the gunwale.
  p.line(-7, -9, 9, -6, GREY_WOOD[5]);
  p.rect(9, -7, 3, 2, GREY_WOOD[4]);
  // Mud round its keel.
  for (let x = -L; x <= 6; x++) if (!p.has(x, 0)) p.px(x, 0, '#2a2618');
  return p.art();
}

// ------------------------------------------------------------------ the ruins: a canopy over a rug

const RUG_RED: Ramp = ['#3a0c0a', '#641610', '#922418', '#b8382a', '#d85a40'];
const CREAM: Ramp = ['#6a5a40', '#9a8664', '#c4b08a', '#e2d2ac', '#f6ecd0'];

function canopyBack(seed: number): Art {
  const p = new Pic(-24, -30, 23, 0);
  post(p, -23, -30, 0, WOOD, 2);
  post(p, 21, -30, 0, WOOD, 2);
  // A hanging cloth across the back: indigo with a cream lattice, a fringe.
  for (let y = -24; y <= -4; y++) for (let x = -20; x <= 20; x++) {
    const d = (Math.abs(((x + 40) % 8) - 4) + Math.abs(((y + 40) % 8) - 4)) === 4;
    p.px(x, y, d ? CREAM[2] : at(INDIGO, 2.4 - (y + 24) * 0.04 + (x < -10 ? 0.3 : 0)));
  }
  for (let x = -20; x <= 20; x += 2) p.px(x, -3, CREAM[3]);
  for (let y = -24; y <= -3; y++) for (let x = -20; x <= 20; x++) p.dim(x, y, 0.22);
  // Big jars at the back left, rolled rugs leaning at the right.
  jar(p, -15, 0, 7, 11, CLAY, seed);
  jar(p, -9, 0, 5, 8, ['#3a2a1a', '#6a4a2a', '#9a7040', '#c89a60', '#e8c890'], seed + 1);
  for (const [x, col] of [[10, RUG_RED], [14, INDIGO], [18, ['#3a3010', '#6a5a1a', '#9a8a2a', '#c8b848', '#e8d870']]] as const) {
    for (let y = -15 + (x % 3); y <= 0; y++) {
      p.px(x, y, at(col, 3.4));
      p.px(x + 1, y, at(col, 2.4));
      p.px(x + 2, y, at(col, 1.4));
    }
    p.hline(x, x + 2, -16 + (x % 3), CREAM[3]);
  }
  return p.art();
}

function rug(seed: number): Art {
  const p = new Pic(-15, 0, 14, 13);
  // A flat rug on the ground: red field, an indigo border with a cream line, a medallion, tassels.
  for (let y = 1; y <= 11; y++) for (let x = -13; x <= 12; x++) {
    const edge = Math.min(x + 13, 12 - x, y - 1, 11 - y);
    let c: string;
    if (edge === 0) c = INDIGO[1];
    else if (edge === 1) c = (x + y) % 2 ? INDIGO[3] : INDIGO[2];
    else if (edge === 2) c = CREAM[3];
    else c = at(RUG_RED, 2.6 + ((x * 3 + y * 5 + seed) % 5 === 0 ? 0.6 : 0));
    p.px(x, y, c);
  }
  // The medallion: a diamond in cream and indigo.
  for (let y = 3; y <= 9; y++) for (let x = -6; x <= 5; x++) {
    const d = Math.abs(x + 0.5) / 6 + Math.abs(y - 6) / 3.2;
    if (d < 0.5) p.px(x, y, INDIGO[3]);
    else if (d < 0.75) p.px(x, y, CREAM[3]);
    else if (d < 1) p.px(x, y, RUG_RED[1]);
  }
  for (let y = 2; y <= 10; y += 2) {
    p.px(-14, y, CREAM[3]);
    p.px(13, y, CREAM[2]);
  }
  return p.art();
}

function canopyFront(seed: number): Art {
  const p = new Pic(-26, -60, 25, 0);
  post(p, -23, -34, 0, WOOD, 2);
  post(p, 21, -34, 0, WOOD, 2);
  // A clay pot at the left pole's foot, a tall glazed jar at the right.
  jar(p, -18, 0, 9, 9, CLAY, seed + 4);
  jar(p, 17, 0, 7, 12, ['#0e2a2e', '#18444a', '#246468', '#3a8a88', '#6ab8b0', '#a8e0d4'], seed + 5);
  // The pavilion's roof: cloth rising from the eaves to a peak, sagging between, in broad stripes of
  // red and cream with thin indigo lines running down from the peak; lit on the left, in shade on the right.
  const peak = -55;
  const eave = -36;
  const span = 25;
  for (let x = -span; x <= span - 1; x++) {
    const ax = Math.abs(x + 0.5) / span;
    const top = Math.round(peak + (eave - peak) * Math.pow(ax, 0.72));
    for (let y = top; y <= eave; y++) {
      // Which stripe: follow the ray from the peak down to the eave.
      const xe = ((x + 0.5) * (eave - peak)) / Math.max(1, y - peak + 0.5);
      const band = Math.floor((xe + span) / 7);
      const u = Math.floor(xe + span) % 7;
      const R = u === 6 ? INDIGO : band % 2 === 0 ? RUG_RED : CREAM;
      const t = (y - top) / Math.max(1, eave - top);
      let k = x < 0 ? 3.9 - t * 0.9 : 2.4 - t * 0.6;
      if (y === top) k += 0.8;
      p.px(x, y, at(R, k));
    }
  }
  // A brass finial on the peak.
  p.vline(0, peak - 4, peak - 1, BRASS[3]);
  p.ball(0.5, peak - 4.5, 1.6, 1.6, BRASS);
  // The valance round the eaves: a band in shade, tassels hanging from it.
  for (let x = -span; x <= span - 1; x++) {
    const band = Math.floor((x + span) / 7);
    const R = (x + span) % 7 === 6 ? INDIGO : band % 2 === 0 ? RUG_RED : CREAM;
    for (let y = eave + 1; y <= eave + 3; y++) p.px(x, y, at(R, 2 - (y - eave - 1) * 0.5));
    if ((x + span) % 4 === 1) {
      p.px(x, eave + 4, CREAM[3]);
      p.px(x, eave + 5, CREAM[2]);
      p.px(x, eave + 6, '#e8b848');
    }
  }
  // Ropes tying it to the poles.
  for (const x of [-22, 22]) {
    p.px(x, -32, ROPE);
    p.px(x, -31, ROPE_DK);
  }
  // A pierced brass lamp hanging off to the right.
  p.vline(10, -32, -31, BRASS[2]);
  p.ball(10, -27.5, 2.6, 3.2, BRASS);
  for (const [x, y] of [[9, -28], [11, -27], [10, -26], [9, -26]] as const) p.px(x, y, GLOW[4]);
  p.hline(9, 11, -24, BRASS[1]);
  return p.art({ light: { dx: 10, dy: -26, color: '#ffb35a', r: 60, flicker: true } });
}

// ------------------------------------------------------------------ the graves: a gate and a bench

const GRAVE_STONE: Ramp = ['#1c1c24', '#2a2a36', '#3c3c4c', '#525266', '#6c6c84', '#8c8ca4'];
const WROUGHT: Ramp = ['#0a0a0e', '#16161c', '#24242c', '#363642', '#4c4c5a'];

function graveGate(seed: number): Art {
  const p = new Pic(-24, -40, 23, 0);
  const S = GRAVE_STONE;
  // Two square pillars with capstones and stone balls on top.
  for (const x0 of [-24, 16]) {
    for (let y = -29; y <= 0; y++) for (let x = x0; x < x0 + 8; x++) {
      const row = Math.floor((y + 40) / 6);
      let k = x === x0 ? 4.4 : x === x0 + 1 ? 3.6 : x >= x0 + 6 ? 1.6 : 2.6;
      if ((y + 40) % 6 === 0) k -= 1.1;
      if (hash(seed, x0, row) < 0.4 && x === x0 + 4 && (y + 40) % 6 === 3) k -= 0.8;
      p.px(x, y, at(S, k));
    }
    for (let x = x0 - 1; x <= x0 + 8; x++) {
      p.px(x, -31, at(S, 5));
      p.px(x, -30, at(S, x > x0 + 6 ? 2 : 3.2));
    }
    p.ball(x0 + 3.5, -35, 3, 3, S);
    p.rect(x0 + 2, -32, 4, 1, at(S, 2.4));
  }
  // Ivy up the left pillar.
  for (let y = -27; y <= 0; y++) {
    const x = -20 + Math.round(Math.sin(y * 0.5 + seed) * 2);
    p.px(x, y, LEAF[2]);
    if (y % 3 === 0) {
      p.px(x - 1, y, LEAF[3]);
      p.px(x + 1, y + 1, LEAF[1]);
    }
  }
  // The gate: wrought-iron bars with spear tips, rails across, a scrolled crest over the middle.
  for (let x = -15; x <= 14; x += 3) {
    const tip = -23 - Math.round(Math.cos(((x + 0.5) / 15) * Math.PI * 0.5) * 6);
    for (let y = tip; y <= 0; y++) p.px(x, y, at(WROUGHT, x < 0 ? 3.4 : 2.6));
    p.px(x, tip - 1, WROUGHT[4]);
    p.px(x - 1, tip, WROUGHT[3]);
    p.px(x + 1, tip, WROUGHT[2]);
  }
  for (const y of [-3, -15]) p.hline(-16, 15, y, WROUGHT[3]);
  for (let x = -16; x <= 15; x++) p.px(x, -14, WROUGHT[1]);
  // The crest: two scrolls meeting at the middle.
  for (const s of [-1, 1]) {
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 1.6;
      p.px(s * (3 + Math.cos(t) * 2.5), -24 - Math.sin(t) * 2.5, WROUGHT[4]);
    }
  }
  p.vline(0, -31, -16, WROUGHT[3]);
  // The lock where the two leaves meet.
  p.rect(-1, -10, 2, 3, WROUGHT[4]);
  p.px(-1, -10, '#8a8a9a');
  return p.art();
}

function stoneBench(seed: number): Art {
  const p = new Pic(-9, -9, 8, 0);
  const S = GRAVE_STONE;
  // Two blocks for legs, a slab across them, moss on its corner, a crack.
  for (const x0 of [-7, 3]) for (let y = -4; y <= 0; y++) for (let x = x0; x < x0 + 4; x++) p.px(x, y, at(S, x === x0 ? 3.6 : x === x0 + 3 ? 1.4 : 2.4));
  for (let y = -8; y <= -5; y++) for (let x = -9; x <= 8; x++) p.px(x, y, at(S, y === -8 ? 5 : y === -7 ? 4 : x === -9 ? 3.4 : 2.4));
  p.px(-9, -8, at(S, 3));
  p.px(8, -8, at(S, 3));
  for (let x = -9; x <= -4; x++) if (hash(seed, x) < 0.7) p.px(x, -8, MOSS[x < -6 ? 3 : 2]);
  p.line(2, -8, 4, -5, at(S, 1));
  return p.art();
}

// ------------------------------------------------------------------ the Ember Depths: a smith's cart and an anvil

function smithCart(biome: Biome, seed: number): Art {
  const p = new Pic(-21, -34, 18, 0);
  const W = WOOD;
  // Handles down to the ground at the left.
  p.line(-20, -1, -12, -8, W[4]);
  p.line(-20, 0, -12, -7, W[2]);
  // The load: a rack of swords for sale standing in a frame, an axe leaning on it, a stack of
  // ingots (the top one still glowing), a bucket to quench them.
  post(p, -12, -26, -13, W, 2);
  post(p, 3, -26, -13, W, 2);
  for (const [x, len] of [[-9, 12], [-6, 14], [-3, 11], [0, 13]] as const) {
    const guard = -16;
    for (let y = guard - len; y < guard; y++) {
      p.px(x, y, IRON[5]);
      p.px(x + 1, y, y === guard - len ? IRON[4] : IRON[3]);
    }
    p.px(x + 1, guard - len - 1, IRON[4]);
    p.hline(x - 1, x + 2, guard, BRASS[3]);
    p.px(x - 1, guard, BRASS[4]);
    p.vline(x, guard + 1, guard + 2, '#5a2a1a');
    p.px(x + 1, guard + 1, '#3a1a10');
    p.px(x, guard + 3, BRASS[4]);
  }
  // (The rack's bar in front of the blades.)
  p.hline(-12, 4, -22, W[5]);
  p.hline(-12, 4, -21, W[2]);
  p.line(5, -14, 9, -29, W[4]);
  p.line(6, -14, 10, -29, W[2]);
  for (let y = -31; y <= -25; y++) {
    const w = y < -29 || y > -27 ? 2 : 4;
    for (let x = 0; x < w; x++) p.px(11 + x, y, x === 0 ? IRON[5] : IRON[3]);
  }
  for (let k = 0; k < 3; k++) {
    const y = -14 - k * 2;
    const hot = k === 2;
    for (let x = 6 + k; x <= 13 - k; x++) {
      p.px(x, y, hot ? at(COALS, x < 9 ? 4.4 : 3.6) : at(IRON, x === 6 + k ? 4.4 : 3));
      p.px(x, y + 1, hot ? COALS[2] : IRON[1]);
    }
  }
  // The bed's side: boards with iron straps, scorched here and there.
  planks(p, -13, -13, 29, 7, W, seed, 3, 2.8);
  p.hline(-13, 15, -13, W[5]);
  for (const x of [-13, -3, 7, 15]) p.vline(x, -12, -7, IRON[3]);
  for (let x = -13; x <= 15; x++) if (hash(seed, x, 4) < 0.25) p.dim(x, -8 - Math.floor(hash(seed, x, 5) * 3), 0.45);
  // The wheel.
  const wx = 3;
  const wy = -5;
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    p.px(wx + Math.cos(t) * 5.4, wy + Math.sin(t) * 5.1, Math.cos(t) + Math.sin(t) < -0.4 ? IRON[5] : IRON[2]);
  }
  for (let k = 0; k < 6; k++) {
    const t = (k / 6) * Math.PI * 2 + 0.3;
    p.line(wx, wy, wx + Math.cos(t) * 4.2, wy + Math.sin(t) * 4, W[k < 3 ? 3 : 5]);
  }
  p.rect(wx - 1, wy - 1, 2, 2, IRON[4]);
  // A quench bucket at the right end.
  for (let y = -6; y <= 0; y++) for (let x = 12; x <= 17; x++) p.px(x, y, at(W, x === 12 ? 4.4 : x === 17 ? 2 : 3.2));
  p.hline(12, 17, -4, IRON[3]);
  p.hline(13, 16, -7, '#2a3a44');
  p.px(13, -7, '#4a6a7a');
  return p.art({ light: { dx: 9, dy: -18, color: mixHex(biome.light.fire, '#ffd080', 0.45), r: 34, flicker: true } });
}

function anvil(seed: number): Art {
  const p = new Pic(-8, -14, 7, 0);
  // A charred stump.
  for (let y = -5; y <= 0; y++) for (let x = -5; x <= 5; x++) p.px(x, y, at(DARK_WOOD, x === -5 ? 4 : x >= 4 ? 1.6 : 2.8 - (hash(seed, x, y) < 0.15 ? 0.8 : 0)));
  p.hline(-5, 5, -6, DARK_WOOD[5]);
  // The anvil: horn to the left, a lit face, a waist, a foot.
  for (let x = -7; x <= 6; x++) {
    const horn = x < -2;
    const top = -11;
    const bot = horn ? -10 + Math.round((x + 7) * 0.2) : -8;
    for (let y = horn ? top + Math.round((-2 - x) * 0.3) : top; y <= bot; y++) p.px(x, y, at(IRON, y === top || (horn && y === top + Math.round((-2 - x) * 0.3)) ? 5 : x > 4 ? 2 : 3.2));
  }
  p.rect(-2, -7, 5, 1, IRON[2]);
  p.rect(-3, -6, 7, 1, IRON[3]);
  // A bar heating on its face.
  p.hline(-1, 3, -12, COALS[4]);
  p.px(4, -12, COALS[3]);
  // A hammer leaning on the stump.
  p.line(6, -1, 7, -7, WOOD[4]);
  p.rect(6, -9, 3, 2, IRON[4]);
  return p.art({ light: { dx: 1, dy: -12, color: '#ff8a3a', r: 22, flicker: true } });
}

// ------------------------------------------------------------------ the grotto: a lean-to and a crystal lamp

function leanTo(seed: number): Art {
  const p = new Pic(-20, -30, 19, 0);
  const tarp: Ramp = ['#2e2014', '#4a3420', '#6a4c2e', '#8c6a40', '#ae8a56', '#ccaa72'];
  // The bedroll under it: a blue blanket with a pale pillow.
  for (let y = -8; y <= -3; y++) for (let x = -13; x <= 5; x++) p.px(x, y, at(['#121a3a', '#1e2c5a', '#2e427e', '#4462a4', '#6a8ac8'], y === -8 ? 4 : 3 - (y + 8) * 0.25 - (x > 2 ? 0.4 : 0)));
  for (let y = -8; y <= -5; y++) for (let x = -13; x <= -9; x++) p.px(x, y, y === -8 ? '#f0ecf4' : '#c8c4d4');
  p.hline(-13, 5, -2, '#141c3c');
  // The tarp: tied high on the rock behind, pulled down to two poles in front. Pulled taut from four
  // corners, it creases toward the middle; the front edge sags between the poles, hemmed.
  const yb = -27;
  const yf = -15;
  const x0 = -18;
  const x1 = 16;
  for (let x = x0; x <= x1; x++) {
    const u = (x - x0) / (x1 - x0);
    const sag = Math.round(Math.sin(u * Math.PI) * 2);
    const back = yb + Math.round(Math.sin(u * Math.PI) * 1);
    for (let y = back; y <= yf + sag; y++) {
      const t = (y - back) / Math.max(1, yf + sag - back);
      let k = 4.3 - t * 1.6 + (u < 0.35 ? 0.3 : u > 0.75 ? -0.35 : 0);
      // Creases running from the corners in toward the middle of the front edge.
      const c1 = Math.abs(t - u * 1.4) < 0.06;
      const c2 = Math.abs(t - (1 - u) * 1.4) < 0.06;
      if (c1 || c2) k -= 0.9;
      else if (Math.abs(t - u * 1.4 + 0.08) < 0.05 || Math.abs(t - (1 - u) * 1.4 + 0.08) < 0.05) k += 0.4;
      if (hash(seed, x, y) < 0.04) k -= 0.4;
      if (y === back) k = 2.2;
      p.px(x, y, at(tarp, k));
    }
    // The hem along the front edge, and the dark beneath it.
    p.px(x, yf + sag, at(tarp, 4.8));
    p.px(x, yf + sag + 1, tarp[0]);
  }
  // Ties up into the rock at the back corners.
  p.line(x0 + 1, yb, x0 - 1, yb - 3, ROPE_DK);
  p.line(x1 - 1, yb, x1 + 1, yb - 3, ROPE_DK);
  for (const x of [-17, 15]) post(p, x, yf + 1, 0, GREY_WOOD, 2);
  rope(p, 17, yf + 1, 19, 0, 0.4, ROPE_DK);
  rope(p, -18, yf + 1, -20, 0, 0.4, ROPE_DK);
  // The shade under the tarp.
  for (let y = yf + 2; y <= -9; y++) for (let x = -15; x <= 14; x++) if (!p.has(x, y)) p.px(x, y, '#18142a');
  // A pack and a pickaxe at the right, a little crate of shards at the left.
  p.ball(10, -5, 3.6, 4.6, ['#2e1c12', '#4e321e', '#70502e', '#946e42', '#b48e5c']);
  p.rect(7, -9, 7, 2, '#7a4a7a');
  p.line(13, -12, 17, 0, WOOD[4]);
  p.line(11, -12, 15, -13, IRON[4]);
  p.px(16, -14, IRON[3]);
  crate(p, -19, 0, 6, 3, 1, GREY_WOOD);
  for (const [x, y, c] of [[-18, -5, '#7ae8ff'], [-16, -6, '#c08aff'], [-15, -5, '#e0f8ff']] as const) {
    p.px(x, y, c);
    p.px(x, y + 1, shade(c, -0.3));
  }
  return p.art();
}

function crystalLamp(biome: Biome): Art {
  const p = new Pic(-5, -30, 5, 0);
  const glow = biome.id === 'crystal' ? biome.light.hero : '#9ae0ff';
  // A tripod of iron rods.
  p.line(0, -14, -4, 0, IRON[3]);
  p.line(0, -14, 4, 0, IRON[1]);
  p.line(0, -14, 0, 0, IRON[2]);
  p.vline(0, -20, -14, IRON[3]);
  // A brass cage with a glowing crystal in it.
  p.hline(-2, 2, -29, BRASS[4]);
  p.px(0, -30, BRASS[3]);
  for (let y = -28; y <= -21; y++) {
    p.px(-3, y, BRASS[3]);
    p.px(3, y, BRASS[1]);
  }
  for (let y = -27; y <= -22; y++) {
    const half = y < -25 ? y + 27 : y > -24 ? -22 - y : 2;
    for (let x = -half; x <= half; x++) p.px(x, y, x < 0 ? '#e0fcff' : x === 0 ? '#9af0ff' : '#58b8e8');
  }
  p.px(-1, -26, '#ffffff');
  p.hline(-3, 3, -20, BRASS[2]);
  p.hline(-2, 2, -19, BRASS[1]);
  return p.art({ light: { dx: 0, dy: -24, color: mixHex(glow, '#7ae8ff', 0.5), r: 84, flicker: false } });
}

// ------------------------------------------------------------------ dispatch

export function campArt(kind: CampKind, biome: Biome, seed: number): Art {
  switch (kind) {
    case 'stallBack':
      return stallBack(seed);
    case 'stallFront':
      return stallFront(seed);
    case 'yataiBack':
      return yataiBack(seed);
    case 'yataiFront':
      return yataiFront(seed);
    case 'hayCart':
      return hayCart(seed);
    case 'produceStand':
      return produceStand(seed);
    case 'canvasTent':
      return canvasTent(seed);
    case 'logSeat':
      return logSeat(seed);
    case 'hideTent':
      return hideTent(seed);
    case 'fireBowl':
      return fireBowl(biome);
    case 'shrineNiche':
      return shrineNiche(biome, seed);
    case 'stiltHut':
      return stiltHut(biome, seed);
    case 'rowboat':
      return rowboat(seed);
    case 'canopyBack':
      return canopyBack(seed);
    case 'canopyFront':
      return canopyFront(seed);
    case 'rug':
      return rug(seed);
    case 'graveGate':
      return graveGate(seed);
    case 'stoneBench':
      return stoneBench(seed);
    case 'smithCart':
      return smithCart(biome, seed);
    case 'anvil':
      return anvil(seed);
    case 'leanTo':
      return leanTo(seed);
    case 'crystalLamp':
      return crystalLamp(biome);
  }
}
