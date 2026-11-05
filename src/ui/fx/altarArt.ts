/**
 * The Summoning Altar's housing, painted as pixel art at one canvas pixel per art pixel (shown at
 * var(--u) CSS px each): carved dark wood with iron fittings and brass trim (the skin's MATS palette,
 * #180702 outlines). The painter fills material buffers instead of plain colors: each pixel's albedo,
 * height (carving relief; normals come from it) and material (how shiny), plus the rune glyphs, the
 * reel holes and where the lights, flames, orb and sigil go. altar.ts lights it every frame.
 *
 * 'big' (the Summon tab): two fluted pillars with rune channels, an entablature with a cornice and
 * studs, an arched pediment with a sunburst tympanum holding the luck orb in a brass socket, braziers on
 * the entablature's ends, a rune rail with a brass plaque, a stepped plinth, and the floor where the
 * magic circle turns. 'mini' (the dungeon HUD): a small shrine with a rune rim, a little arch and orb,
 * and two candles.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const EMPTY = 0;
export const SOLID = 1;
export const HOLE = 2;

/** Materials: how much a pixel shines (specular strength) and how tight its highlight is. */
export const MAT_SPEC = [0, 0.07, 0.95, 0.5, 1.1, 0.03, 0.2] as const;
export const MAT_SHIN = [1, 6, 18, 10, 34, 4, 8] as const;
const M = { ink: 0, wood: 1, brass: 2, iron: 3, gem: 4, slot: 5, wax: 6 } as const;

/** The palette (the skin's materials, a little extended). */
export const C = {
  ink: '#180702',
  back: '#1a0a06',
  backHi: '#26100a',
  dk0: '#2a140c',
  dk1: '#3a2017',
  dk2: '#5a3324',
  dk3: '#6e3f2c',
  dk4: '#94583e',
  wd1: '#803c1c',
  wd2: '#ad5422',
  wd3: '#cb6f2f',
  wd4: '#ef9a3e',
  br0: '#3a2208',
  br1: '#7a4a12',
  br2: '#b9791f',
  br3: '#e3a93a',
  br4: '#ffe7a0',
  ir1: '#221c19',
  ir2: '#38312d',
  ir3: '#4e4642',
  ir4: '#857a70',
  ir5: '#b3a393',
  slot: '#1c0b06',
  groove: '#0e0503',
  wax0: '#a8927a',
  wax1: '#e8d8bc',
  wax2: '#fff4dc',
} as const;

export interface Rune {
  /** Glyph pixels and the slot pixels round them (canvas indexes). */
  glyph: number[];
  halo: number[];
  /** Center, and its place in the clockwise chase. */
  x: number;
  y: number;
  order: number;
}

export interface Flame {
  /** Base center (the flame grows up from here), base half width, height. */
  x: number;
  y: number;
  hw: number;
  h: number;
  /** Coal pixels glowing under it. */
  coals: number[];
}

export interface PointLight {
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface AltarArt {
  kind: 'big' | 'mini';
  W: number;
  H: number;
  /** Per pixel: EMPTY / SOLID / HOLE; albedo (3 per pixel, 0..1); normal (3 per pixel); specular and shininess. */
  px: Uint8Array;
  alb: Float32Array;
  nrm: Float32Array;
  spec: Float32Array;
  shin: Float32Array;
  /** Hole pixels' inner shadow (0..1): the reels sit recessed in the altar. */
  shade: Float32Array;
  runes: Rune[];
  flames: Flame[];
  orb: { x: number; y: number; r: number };
  /** The magic circle on the floor (big only). */
  sigil: { x: number; y: number; rx: number; ry: number } | null;
  /** Payline gems (pixel indexes and centers) and the plaque's emblem. */
  gems: Array<{ px: number[]; x: number; y: number }>;
  emblem: { px: number[]; x: number; y: number } | null;
  /** Each reel window's rim pixels (mini: lit in the find's color). */
  rims: number[][];
  /** Lights: the flames, the orb, the sigil, each rune, each gem, the emblem, and each reel (landing bursts). */
  lights: {
    flames: PointLight[];
    orb: PointLight;
    sigil: PointLight | null;
    emblem: PointLight | null;
    gems: PointLight[];
    runes: PointLight[];
    reels: PointLight[];
  };
}

// ------------------------------------------------------------------ the painter

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** A stable 0..1 hash of two integers. */
function hash2(x: number, y: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263, 1274126177);
  h ^= h >>> 13;
  h = Math.imul(h, 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

class Painter {
  readonly px: Uint8Array;
  readonly alb: Float32Array;
  readonly hgt: Float32Array;
  readonly mat: Uint8Array;
  constructor(
    readonly W: number,
    readonly H: number,
  ) {
    this.px = new Uint8Array(W * H);
    this.alb = new Float32Array(W * H * 3);
    this.hgt = new Float32Array(W * H);
    this.mat = new Uint8Array(W * H);
  }
  idx(x: number, y: number): number {
    return y * this.W + x;
  }
  in(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }
  set(x: number, y: number, hex: string, h: number, mat: number = M.wood): void {
    if (!this.in(x, y)) return;
    const i = this.idx(x, y);
    const c = rgb(hex);
    this.px[i] = SOLID;
    this.alb[i * 3] = c[0];
    this.alb[i * 3 + 1] = c[1];
    this.alb[i * 3 + 2] = c[2];
    this.hgt[i] = h;
    this.mat[i] = mat;
  }
  /** Set the pixel and its mirror across the vertical middle. */
  sym(x: number, y: number, hex: string, h: number, mat: number = M.wood): void {
    this.set(x, y, hex, h, mat);
    this.set(this.W - 1 - x, y, hex, h, mat);
  }
  hole(x: number, y: number): void {
    if (!this.in(x, y)) return;
    const i = this.idx(x, y);
    this.px[i] = HOLE;
    this.hgt[i] = 0;
    this.alb[i * 3] = this.alb[i * 3 + 1] = this.alb[i * 3 + 2] = 0;
  }
  rect(x: number, y: number, w: number, h: number, hex: string, ht: number, mat: number = M.wood): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, hex, ht, mat);
  }
  hline(x0: number, x1: number, y: number, hex: string, ht: number, mat: number = M.wood): void {
    for (let x = x0; x <= x1; x++) this.set(x, y, hex, ht, mat);
  }
  kindAt(x: number, y: number): number {
    return this.in(x, y) ? this.px[this.idx(x, y)] : EMPTY;
  }
}

/** Dark wood with a grain: streaks along the board (vertical boards for pillars). */
function darkWood(x: number, y: number, vertical: boolean): string {
  const a = vertical ? x : y;
  const b = vertical ? y : x;
  const v = Math.sin(b * 0.31 + Math.sin(a * 1.9 + b * 0.05) * 1.4 + hash2(a, 3) * 6.3);
  if (v > 0.86) return C.dk2;
  if (v < -0.93) return C.dk4;
  return C.dk3;
}

// ------------------------------------------------------------------ rune glyphs

/** Elder-Futhark-like runes, 5 x 5: Algiz, Tiwaz, Othala, Dagaz, Gebo, Ingwaz, Raido, Sowilo. */
const GLYPHS5: readonly string[][] = [
  ['x.x.x', '.xxx.', '..x..', '..x..', '..x..'],
  ['..x..', '.xxx.', 'x.x.x', '..x..', '..x..'],
  ['..x..', '.x.x.', '..x..', '.x.x.', 'x...x'],
  ['x...x', 'xx.xx', 'x.x.x', 'xx.xx', 'x...x'],
  ['x...x', '.x.x.', '..x..', '.x.x.', 'x...x'],
  ['..x..', '.x.x.', 'x...x', '.x.x.', '..x..'],
  ['xxx..', 'x..x.', 'xxx..', 'x.x..', 'x..x.'],
  ['..xx.', '.x...', '..x..', '...x.', '.xx..'],
];
/** Small runes for the mini shrine, 3 x 3. */
const GLYPHS3: readonly string[][] = [
  ['x.x', '.x.', 'x.x'],
  ['.x.', 'xxx', '.x.'],
  ['x..', 'xx.', 'x..'],
  ['.x.', 'x.x', '.x.'],
  ['xxx', '.x.', '.x.'],
  ['x.x', 'x.x', '.x.'],
];
/** The plaque's emblem: a sun with an eye, 7 x 5. */
const EMBLEM = ['..x.x..', 'x.xxx.x', '.xx.xx.', 'x.xxx.x', '..x.x..'];

/** Carves rune `g` (top left x, y) into a channel: its pixels sink deeper; returns the rune. */
function carveRune(p: Painter, x: number, y: number, g: readonly string[], seedHalo = 1): Rune {
  const glyph: number[] = [];
  const halo: number[] = [];
  for (let j = 0; j < g.length; j++) {
    for (let i = 0; i < g[j].length; i++) {
      const xx = x + i;
      const yy = y + j;
      if (!p.in(xx, yy)) continue;
      if (g[j][i] === 'x') {
        p.set(xx, yy, C.groove, 0.6, M.slot);
        glyph.push(p.idx(xx, yy));
      } else if (p.kindAt(xx, yy) === SOLID) halo.push(p.idx(xx, yy));
    }
  }
  // The slot round it glows faintly too (a pixel of margin).
  for (let j = -seedHalo; j < g.length + seedHalo; j++) {
    for (let i = -seedHalo; i < g[0].length + seedHalo; i++) {
      if (j >= 0 && i >= 0 && j < g.length && i < g[0].length) continue;
      const xx = x + i;
      const yy = y + j;
      if (p.kindAt(xx, yy) === SOLID) halo.push(p.idx(xx, yy));
    }
  }
  return { glyph, halo, x: x + (g[0].length - 1) / 2, y: y + (g.length - 1) / 2, order: 0 };
}

/** Orders runes clockwise round (cx, cy), starting at the bottom left (like Dumpster Legend's bulbs). */
function orderRunes(runes: Rune[], cx: number, cy: number): void {
  const ang = (r: Rune) => {
    const a = Math.atan2(r.y - cy, r.x - cx);
    // Screen y is down, so atan2 grows clockwise; start from the bottom left.
    return (a - (Math.PI * 3) / 4 + Math.PI * 4) % (Math.PI * 2);
  };
  [...runes].sort((a, b) => ang(a) - ang(b)).forEach((r, k) => (r.order = k));
}

// ------------------------------------------------------------------ normals and shading

function finish(p: Painter, kind: AltarArt['kind'], rest: Omit<AltarArt, 'kind' | 'W' | 'H' | 'px' | 'alb' | 'nrm' | 'spec' | 'shin' | 'shade'>, holeRects: Rect[]): AltarArt {
  const { W, H } = p;
  const nrm = new Float32Array(W * H * 3);
  const spec = new Float32Array(W * H);
  const shin = new Float32Array(W * H);
  const hAt = (x: number, y: number, own: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return own - 2;
    const i = y * W + x;
    const k = p.px[i];
    // The silhouette and the holes fall away, so edges round off and catch light.
    if (k === EMPTY) return own - 2.5;
    if (k === HOLE) return own - 1.5;
    return p.hgt[i];
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (p.px[i] === EMPTY) continue;
      if (p.px[i] === HOLE) {
        nrm[i * 3 + 2] = 1;
        continue;
      }
      const h = p.hgt[i];
      // Sobel-ish slopes.
      const gx = hAt(x + 1, y, h) - hAt(x - 1, y, h) + 0.5 * (hAt(x + 1, y - 1, h) - hAt(x - 1, y - 1, h) + hAt(x + 1, y + 1, h) - hAt(x - 1, y + 1, h));
      const gy = hAt(x, y + 1, h) - hAt(x, y - 1, h) + 0.5 * (hAt(x - 1, y + 1, h) - hAt(x - 1, y - 1, h) + hAt(x + 1, y + 1, h) - hAt(x + 1, y - 1, h));
      const nx = -gx * 0.32;
      const ny = -gy * 0.32;
      const l = Math.hypot(nx, ny, 1);
      nrm[i * 3] = nx / l;
      nrm[i * 3 + 1] = ny / l;
      nrm[i * 3 + 2] = 1 / l;
      spec[i] = MAT_SPEC[p.mat[i]];
      shin[i] = MAT_SHIN[p.mat[i]];
    }
  }
  // Inner shadow round each hole: the overhang on top is deepest.
  const shade = new Float32Array(W * H);
  for (const r of holeRects) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dt = y - r.y;
        const db = r.y + r.h - 1 - y;
        const dl = x - r.x;
        const dr = r.x + r.w - 1 - x;
        const s = Math.max(dt < 4 ? [0.5, 0.34, 0.2, 0.1][dt] : 0, db < 2 ? [0.26, 0.12][db] : 0, Math.min(dl, dr) < 3 ? [0.32, 0.18, 0.08][Math.min(dl, dr)] : 0);
        shade[y * W + x] = s;
      }
    }
  }
  return { kind, W, H, px: p.px, alb: p.alb, nrm, spec, shin, shade, ...rest };
}

// ------------------------------------------------------------------ the big altar

/** The big altar's measures (art px): pillar inset and width, the trim round the window, the crest above it, what's below. */
export const BIG = { inset: 2, pillar: 13, trim: 2, crest: 40, rail: 9, plinth: 7, floor: 11 } as const;

/** Where the reel window goes in a big altar `W` wide. */
export function bigWindow(W: number): { x: number; y: number; w: number } {
  const x = BIG.inset + BIG.pillar + BIG.trim;
  return { x, y: BIG.crest, w: W - 2 * x };
}

export function bigHeight(winH: number): number {
  return BIG.crest + winH + BIG.trim + BIG.rail + BIG.plinth + BIG.floor;
}

/**
 * Paints the big altar `W` wide round a reel window `win` (its height from the reels' layout), with the
 * reel drums `holes` (in canvas px) and the payline at `payY`.
 */
export function paintBig(W: number, win: Rect, holes: Rect[], payY: number): AltarArt {
  const H = bigHeight(win.h);
  const p = new Painter(W, H);
  const I = BIG.inset;
  const PW = BIG.pillar;
  const cx = (W - 1) / 2;
  const half = Math.floor(W / 2);
  const runes: Rune[] = [];
  const winB = win.y + win.h;
  const rb = winB + BIG.trim; // the rune rail's top
  const pb = rb + BIG.rail; // the plinth's top
  const Ly = win.y - 10; // the entablature's top

  // The back panel behind the reels (seen between the drums), then the drums themselves.
  for (let y = win.y - 1; y <= winB; y++) {
    for (let x = win.x - 1; x <= win.x + win.w; x++) p.set(x, y, (x - win.x) % 6 === 0 ? C.backHi : C.back, 1);
  }
  for (const r of holes) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) p.hole(x, y);
  // Little posts between the drums, with brass rivets.
  for (let k = 0; k + 1 < holes.length; k++) {
    const a = holes[k].x + holes[k].w;
    const b = holes[k + 1].x;
    if (b - a >= 3) {
      const mx = Math.floor((a + b - 1) / 2);
      for (let y = win.y; y < winB; y++) p.set(mx, y, darkWood(mx, y, true), 2.5);
      for (const yy of [win.y + 1, winB - 2]) p.set(mx, yy, C.br3, 3.5, M.brass);
    }
  }

  // The pillars: fluted dark wood round as columns, a rune channel down the middle, brass capitals and bases.
  const shaftTop = win.y;
  const shaftBot = rb - 4;
  for (let y = win.y - 3; y < rb; y++) {
    for (let xi = 0; xi < PW; xi++) {
      const x = I + xi;
      const round = 2.5 + 3.5 * Math.sin((Math.PI * (xi + 0.5)) / PW);
      let col: string;
      let h = round;
      let mat: number = M.wood;
      if (y < shaftTop || y > shaftBot) {
        // Capital (top) and base (bottom): brass bands, a pixel wider than the shaft.
        continue;
      }
      if (xi === 0 || xi === PW - 1) {
        col = C.ink;
        h = 1.5;
        mat = M.ink;
      } else if (xi === 3 || xi === PW - 4) {
        col = C.dk1;
        h = round - 1.6;
      } else if (xi >= 4 && xi <= PW - 5) {
        col = C.slot;
        h = 1.8;
        mat = M.slot;
      } else col = darkWood(x, y, true);
      p.sym(x, y, col, h, mat);
    }
  }
  const band = (y: number, hex: string, h: number, grow: number) => {
    for (let x = I - grow; x < I + PW + grow; x++) p.sym(x, y, x === I - grow || x === I + PW + grow - 1 ? C.ink : hex, x === I - grow || x === I + PW + grow - 1 ? 3 : h, M.brass);
  };
  band(win.y - 3, C.br4, 7.5, 1);
  band(win.y - 2, C.br3, 7, 1);
  band(win.y - 1, C.br1, 5.5, 0);
  band(shaftBot + 1, C.ink, 4, 0);
  band(shaftBot + 2, C.br3, 6.5, 1);
  band(shaftBot + 3, C.br2, 6, 1);
  // Runes down each pillar's channel.
  for (let y = shaftTop + 2, k = 0; y + 5 <= shaftBot - 1; y += 8, k++) {
    runes.push(carveRune(p, I + 4, y, GLYPHS5[k % GLYPHS5.length]));
    runes.push(carveRune(p, W - I - 9, y, GLYPHS5[(k + 3) % GLYPHS5.length]));
  }

  // The window's trim: an ink line, then brass, iron brackets on the corners.
  for (let d = 1; d <= 2; d++) {
    const x0 = win.x - d;
    const x1 = win.x + win.w - 1 + d;
    const y0 = win.y - d;
    const y1 = winB - 1 + d;
    for (let x = x0; x <= x1; x++) {
      p.set(x, y0, d === 1 ? C.ink : C.br3, d === 1 ? 2 : 6, d === 1 ? M.ink : M.brass);
      p.set(x, y1, d === 1 ? C.ink : C.br1, d === 1 ? 2 : 5, d === 1 ? M.ink : M.brass);
    }
    for (let y = y0 + 1; y < y1; y++) {
      p.set(x0, y, d === 1 ? C.ink : C.br2, d === 1 ? 2 : 6, d === 1 ? M.ink : M.brass);
      p.set(x1, y, d === 1 ? C.ink : C.br2, d === 1 ? 2 : 6, d === 1 ? M.ink : M.brass);
    }
  }
  for (const [sx, sy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const x0 = sx ? win.x + win.w + 1 : win.x - 2;
    const y0 = sy ? winB + 1 : win.y - 2;
    const dx = sx ? -1 : 1;
    const dy = sy ? -1 : 1;
    for (let k = 0; k < 6; k++) {
      p.set(x0 + dx * k, y0, k === 5 ? C.ink : C.ir4, 6.5, M.iron);
      p.set(x0, y0 + dy * k, k === 5 ? C.ink : C.ir3, 6.5, M.iron);
    }
    p.set(x0 + dx, y0 + dy, C.ir2, 6, M.iron);
    p.set(x0, y0, C.ir5, 7.5, M.iron);
  }

  // The entablature over the window and the pillars: a brass cornice, a frieze with studs, dentils.
  for (let x = I - 2; x <= half; x++) {
    const xm = x;
    p.sym(xm, Ly, C.ink, 4, M.ink);
    p.sym(xm, Ly + 1, C.wd4, 8);
    p.sym(xm, Ly + 2, C.wd3, 8);
    p.sym(xm, Ly + 3, C.wd1, 5.5);
    p.sym(xm, Ly + 4, darkWood(xm, Ly + 4, false), 5);
    p.sym(xm, Ly + 5, darkWood(xm, Ly + 5, false), 5);
    p.sym(xm, Ly + 6, (Math.floor((xm - I) / 2) % 2 === 0 ? C.dk4 : C.dk1), (Math.floor((xm - I) / 2) % 2 === 0 ? 5.5 : 4));
    // The shadow line under it, across the window's top (the capitals cover the pillars).
    if (xm > I + PW) p.sym(xm, win.y - 3, C.ink, 2, M.ink);
  }
  // Brass cornice lip along the top and the entablature's ends.
  for (let x = I - 2; x <= half; x++) p.sym(x, Ly + 1, x % 3 === 0 ? C.br4 : C.br3, 8.5, M.brass);
  for (let y = Ly; y <= Ly + 6; y++) p.sym(I - 3, y, C.ink, 3, M.ink);
  // Studs along the frieze.
  for (let x = I + 3; x < half - 2; x += 9) {
    p.sym(x, Ly + 4, C.br4, 7, M.brass);
    p.sym(x, Ly + 5, C.br1, 6, M.brass);
    p.sym(x - 1, Ly + 5, C.ink, 4, M.ink);
    p.sym(x + 1, Ly + 5, C.ink, 4, M.ink);
  }

  // The orb's place: at the top of the pediment, which arches over the window between the braziers.
  const orbR = 7;
  const ox = cx;
  const oy = 13;
  const apex = oy + orbR - 3;
  const xa0 = I + PW + 4;
  const span = (W - 2 * xa0) / 2;
  const T = 5;
  const archTop = (x: number) => {
    const u = (x + 0.5 - W / 2) / span;
    return Math.round(Ly - (Ly - apex) * Math.pow(Math.max(0, 1 - u * u), 0.6));
  };
  for (let x = xa0; x <= half; x++) {
    const yt = archTop(x);
    // The band: a rounded molding with brass studs.
    const prof = [3, 8, 8.5, 7, 4.5];
    for (let j = 0; j < T; j++) {
      const y = yt + j;
      if (y >= Ly) break;
      const col = j === 0 ? C.ink : j === 1 ? C.wd4 : j === 2 ? ((x - xa0) % 5 === 2 ? C.br3 : C.wd3) : j === 3 ? C.wd2 : C.wd1;
      p.sym(x, y, col, prof[j], j === 2 && (x - xa0) % 5 === 2 ? M.brass : j === 0 ? M.ink : M.wood);
    }
    // The tympanum under it: a carved sunburst spreading from the orb.
    for (let y = yt + T; y < Ly; y++) {
      const a = (Math.atan2(y - oy, x - ox) * 180) / Math.PI;
      const m = ((a % 14) + 14) % 14;
      const groove = Math.abs(m - 7) < 1.3;
      const rr = Math.hypot(x - ox, y - oy);
      const ring = Math.abs(rr - (orbR + 7)) < 0.8;
      p.sym(x, y, ring ? C.br2 : groove ? C.dk0 : rr < orbR + 11 ? C.dk2 : C.dk1, ring ? 4.5 : groove ? 1.2 : 2.6, ring ? M.brass : M.wood);
    }
  }
  // Scrolls where the arch meets the entablature.
  const scroll = ['.xxx.', 'x...x', 'x.x.x', 'x..x.', '.x...'];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (scroll[j][i] === 'x') p.sym(xa0 - 1 + i, Ly - 5 + j, j < 2 ? C.br4 : C.br2, 7.5, M.brass);
  // The orb's socket: a brass cup with claws, and a finial on top.
  for (let y = oy - orbR - 4; y <= oy + orbR + 3; y++) {
    for (let x = Math.floor(ox - orbR - 3); x <= Math.ceil(ox + orbR + 3); x++) {
      const d = Math.hypot(x - ox, y - oy);
      const ang = (Math.atan2(y - oy, x - ox) * 180) / Math.PI;
      if (d <= orbR + 0.5) {
        // The orb itself: painted over every frame (dark glass here).
        p.set(x, y, '#120a22', 6, M.gem);
      } else if (d <= orbR + 2.6 && (ang > -10 && ang < 190)) {
        p.set(x, y, d > orbR + 1.8 ? C.ink : y > oy + orbR - 1 ? C.br1 : y > oy + 2 ? C.br2 : C.br3, d > orbR + 1.8 ? 4 : 7.5, d > orbR + 1.8 ? M.ink : M.brass);
      } else if (d <= orbR + 1.6 && ((ang < -30 && ang > -60) || (ang < -120 && ang > -150))) {
        p.set(x, y, C.br4, 8, M.brass);
      }
    }
  }
  const fy = oy - orbR - 1;
  p.set(Math.round(ox - 0.5), fy, C.br3, 8, M.brass);
  p.set(Math.round(ox + 0.5), fy, C.br3, 8, M.brass);
  p.set(Math.round(ox - 1.5), fy, C.ink, 4, M.ink);
  p.set(Math.round(ox + 1.5), fy, C.ink, 4, M.ink);
  p.set(Math.round(ox - 0.5), fy - 1, C.br4, 9, M.brass);
  p.set(Math.round(ox + 0.5), fy - 1, C.br2, 8, M.brass);
  p.set(Math.round(ox - 0.5), fy - 2, C.br4, 9, M.brass);
  p.set(Math.round(ox + 0.5), fy - 2, C.ink, 4, M.ink);
  // A rune each side of the orb, carved in the tympanum (where it's tall enough).
  const gl = Math.round(ox - orbR - 9);
  if (archTop(gl) + T <= Ly - 6 && archTop(gl - 4) + T <= Ly - 6) {
    runes.push(carveRune(p, gl - 4, Ly - 6, GLYPHS5[5]));
    runes.push(carveRune(p, W - 1 - gl, Ly - 6, GLYPHS5[2]));
  }

  // Braziers on the entablature's ends: a brass stand, an iron bowl with a brass rim, coals and a flame.
  const flames: Flame[] = [];
  for (const side of [0, 1]) {
    const bx = side ? W - 1 - (I + Math.floor(PW / 2)) : I + Math.floor(PW / 2);
    // Stand.
    for (let y = Ly - 3; y < Ly; y++) {
      const w = y === Ly - 1 ? 3 : 1;
      for (let dx = -w - 1; dx <= w + 1; dx++) p.set(bx + dx, y, Math.abs(dx) === w + 1 ? C.ink : dx < 0 ? C.br3 : C.br2, 6, Math.abs(dx) === w + 1 ? M.ink : M.brass);
    }
    // Bowl: rim, band, body, base.
    const rows: Array<[number, string, string]> = [
      [7, C.br4, C.br2],
      [6, C.ir4, C.ir3],
      [5, C.ir3, C.ir2],
      [4, C.ir2, C.ir1],
      [2, C.ir1, C.ir1],
    ];
    rows.forEach(([hw, lit, dim], j) => {
      const y = Ly - 8 + j;
      for (let dx = -hw - 1; dx <= hw + 1; dx++) {
        const edge = Math.abs(dx) === hw + 1;
        const col = edge ? C.ink : dx < 0 ? lit : dim;
        p.set(bx + dx, y, col, edge ? 4 : 7 - Math.abs(dx) * 0.35, edge ? M.ink : j === 0 ? M.brass : M.iron);
      }
    });
    p.set(bx - 4, Ly - 7, C.ir5, 8, M.iron);
    p.set(bx + 4, Ly - 7, C.ir5, 8, M.iron);
    // Coals mounded in the bowl (they glow; painted over every frame).
    const coals: number[] = [];
    for (let dx = -5; dx <= 5; dx++) {
      p.set(bx + dx, Ly - 9, '#2a0c06', 7, M.ink);
      coals.push(p.idx(bx + dx, Ly - 9));
    }
    for (let dx = -3; dx <= 3; dx++) {
      p.set(bx + dx, Ly - 10, '#2a0c06', 7, M.ink);
      coals.push(p.idx(bx + dx, Ly - 10));
    }
    flames.push({ x: bx, y: Ly - 10, hw: 3, h: 12, coals });
  }

  // The rune rail under the window, with the brass plaque in the middle.
  for (let x = I - 2; x <= half; x++) {
    p.sym(x, rb, C.ink, 4, M.ink);
    p.sym(x, rb + 1, C.wd4, 7.5);
    p.sym(x, rb + 2, C.wd2, 6);
    for (let y = rb + 3; y < rb + 8; y++) p.sym(x, y, C.slot, 1.8, M.slot);
    p.sym(x, rb + 8, C.ink, 3, M.ink);
  }
  for (let y = rb; y <= rb + 8; y++) p.sym(I - 3, y, C.ink, 3, M.ink);
  const plaqueW = 26 + (W % 2);
  const px0 = (W - plaqueW) / 2;
  for (let k = 0; ; k++) {
    const x = px0 - 9 - k * 8;
    if (x < I) break;
    runes.push(carveRune(p, x, rb + 3, GLYPHS5[(k + 1) % GLYPHS5.length], 0));
    runes.push(carveRune(p, W - 5 - x, rb + 3, GLYPHS5[(k + 4) % GLYPHS5.length], 0));
  }
  // The plaque: a rounded brass plate with an engraved sun (the emblem glows).
  const py0 = rb - 1;
  const ph = 11;
  for (let j = 0; j < ph; j++) {
    const cut = j === 0 || j === ph - 1 ? 2 : j === 1 || j === ph - 2 ? 1 : 0;
    for (let i = cut; i < plaqueW - cut; i++) {
      const edge = j === 0 || j === ph - 1 || i === cut || i === plaqueW - cut - 1;
      const col = edge ? C.ink : j === 1 ? C.br4 : j === 2 ? C.br3 : j >= ph - 3 ? C.br1 : C.br2;
      p.set(px0 + i, py0 + j, col, edge ? 4 : j < 3 ? 8 : 7, edge ? M.ink : M.brass);
    }
  }
  const emPx: number[] = [];
  const ex0 = Math.round(cx - 3);
  const ey0 = py0 + 3;
  EMBLEM.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch !== 'x') return;
      p.set(ex0 + i, ey0 + j, C.groove, 5, M.slot);
      emPx.push(p.idx(ex0 + i, ey0 + j));
    }),
  );
  for (const sx of [px0 + 2, px0 + plaqueW - 3]) {
    p.set(sx, py0 + 5, C.ir5, 8.5, M.iron);
    p.set(sx, py0 + 6, C.ir2, 7.5, M.iron);
  }

  // The plinth: a warm wooden step, then a wider dark one with brass corners.
  for (let x = I - 2; x <= half; x++) {
    p.sym(x, pb, C.ink, 4, M.ink);
    p.sym(x, pb + 1, C.wd4, 7);
    p.sym(x, pb + 2, x % 7 === 3 ? C.wd2 : C.wd3, 6.5);
  }
  for (let y = pb; y <= pb + 2; y++) p.sym(I - 3, y, C.ink, 3, M.ink);
  for (let x = 0; x <= half; x++) {
    p.sym(x, pb + 3, C.ink, 3.5, M.ink);
    p.sym(x, pb + 4, x < 5 ? C.br3 : C.dk4, 6, x < 5 ? M.brass : M.wood);
    p.sym(x, pb + 5, x < 5 ? C.br1 : darkWood(x, pb + 5, false), 5.5, x < 5 ? M.brass : M.wood);
    p.sym(x, pb + 6, C.ink, 3, M.ink);
  }
  for (let y = pb + 3; y <= pb + 6; y++) p.sym(0, y, C.ink, 3, M.ink);
  p.sym(2, pb + 4, C.br4, 7.5, M.brass);

  // Payline gems on the trim, either side of the window.
  const gems: AltarArt['gems'] = [];
  for (const side of [0, 1]) {
    const gx = side ? win.x + win.w + 1 : win.x - 2;
    const gpx: number[] = [];
    for (const [dx, dy] of [
      [0, -2],
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [0, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
      [0, 2],
    ]) {
      const edge = Math.abs(dx) + Math.abs(dy) >= 2;
      p.set(gx + dx, payY + dy, edge ? C.ink : '#2a0e3a', edge ? 5 : 8, edge ? M.ink : M.gem);
      if (!edge) gpx.push(p.idx(gx + dx, payY + dy));
    }
    gems.push({ px: gpx, x: gx, y: payY });
  }

  const sigil = { x: cx, y: pb + 6, rx: Math.min(Math.floor(W / 2) - 4, 86), ry: 0 };
  sigil.ry = Math.max(4, Math.round(sigil.rx * 0.13));
  orderRunes(runes, cx, win.y + win.h / 2);
  const reels = holes.map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, z: 18, r: Math.max(70, W * 0.62) }));
  return finish(
    p,
    'big',
    {
      runes,
      flames,
      orb: { x: ox, y: oy, r: orbR },
      sigil,
      gems,
      emblem: { px: emPx, x: cx, y: ey0 + 2 },
      rims: [],
      lights: {
        flames: flames.map((f) => ({ x: f.x, y: f.y - 5, z: 16, r: Math.max(64, Math.round(H * 0.72)) })),
        orb: { x: ox, y: oy, z: 12, r: 64 },
        sigil: { x: cx, y: sigil.y + 3, z: 7, r: Math.min(96, Math.round(W * 0.5)) },
        emblem: { x: cx, y: ey0 + 2, z: 6, r: 20 },
        gems: gems.map((g) => ({ x: g.x, y: g.y, z: 6, r: 12 })),
        runes: runes.map((r) => ({ x: r.x, y: r.y, z: 4, r: 9 })),
        reels,
      },
    },
    holes,
  );
}

// ------------------------------------------------------------------ the mini shrine

/** The mini shrine's measures: the crest above the rim, the rim (ink, a 3-pixel rune band, brass), the base. */
export const MINI_ART = { crest: 10, rim: 5, base: 4 } as const;

export interface MiniCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Window size and grid for `n` reels in the mini shrine (all within about 70 x 64 art px). */
export function miniGrid(n: number): { w: number; h: number; cols: number; rows: number; gap: number } {
  if (n <= 1) return { w: 34, h: 25, cols: 1, rows: 1, gap: 1 };
  if (n === 2) return { w: 26, h: 22, cols: 2, rows: 1, gap: 1 };
  if (n === 3) return { w: 18, h: 20, cols: 3, rows: 1, gap: 1 };
  if (n === 4) return { w: 24, h: 18, cols: 2, rows: 2, gap: 1 };
  return { w: 18, h: 17, cols: 3, rows: 2, gap: 1 };
}

/** The windows (canvas px) and the shrine's size for `n` reels. */
export function miniLayout(n: number): { W: number; H: number; cells: MiniCell[] } {
  const g = miniGrid(n);
  const R = MINI_ART.rim;
  const cw = g.cols * g.w + (g.cols - 1) * g.gap;
  const ch = g.rows * g.h + (g.rows - 1) * g.gap;
  const W = cw + 2 * R;
  const H = MINI_ART.crest + ch + 2 * R + MINI_ART.base;
  const cells: MiniCell[] = [];
  for (let k = 0; k < n; k++) {
    const row = Math.floor(k / g.cols);
    const inRow = Math.min(g.cols, n - row * g.cols);
    const col = k - row * g.cols;
    const rowW = inRow * g.w + (inRow - 1) * g.gap;
    cells.push({ x: R + Math.floor((cw - rowW) / 2) + col * (g.w + g.gap), y: MINI_ART.crest + R + row * (g.h + g.gap), w: g.w, h: g.h });
  }
  return { W, H, cells };
}

export function paintMini(n: number): AltarArt {
  const { W, H, cells } = miniLayout(n);
  const p = new Painter(W, H);
  const top = MINI_ART.crest;
  const bot = H - MINI_ART.base; // the frame's bottom edge (exclusive)
  const cx = (W - 1) / 2;
  const half = Math.floor(W / 2);
  const runes: Rune[] = [];
  // The frame: ink, a 3-pixel rune band in dark wood, a brass trim; the back panel inside.
  for (let y = top; y < bot; y++) {
    for (let x = 0; x <= half; x++) {
      const d = Math.min(x, y - top, bot - 1 - y);
      let col: string;
      let h: number;
      let mat: number = M.wood;
      if (d === 0) {
        col = C.ink;
        h = 2;
        mat = M.ink;
      } else if (d <= 3) {
        col = d === 1 && y - top === 1 ? C.dk4 : C.slot;
        h = d === 2 ? 3.2 : 2.6;
        mat = M.slot;
      } else if (d === 4) {
        col = y - top === 4 ? C.br4 : bot - 1 - y === 4 ? C.br1 : C.br2;
        h = 6;
        mat = M.brass;
      } else {
        col = C.back;
        h = 1;
      }
      p.sym(x, y, col, h, mat);
    }
  }
  // Runes round the band (3 x 3), avoiding the corners.
  const g3 = (k: number) => GLYPHS3[k % GLYPHS3.length];
  let k = 0;
  for (let x = 6; x + 3 <= W - 6; x += 5) runes.push(carveRune(p, x, top + 1, g3(k++), 0));
  for (let y = top + 6; y + 3 <= bot - 6; y += 5) runes.push(carveRune(p, W - 4, y, g3(k++), 0));
  for (let x = W - 9; x >= 6; x -= 5) runes.push(carveRune(p, x, bot - 4, g3(k++), 0));
  for (let y = bot - 9; y >= top + 6; y -= 5) runes.push(carveRune(p, 1, y, g3(k++), 0));
  // The windows: a dark rim (lit in the find's color) round each hole.
  const rims: number[][] = [];
  const holes: Rect[] = [];
  for (const c of cells) {
    const rim: number[] = [];
    for (let y = c.y; y < c.y + c.h; y++) {
      for (let x = c.x; x < c.x + c.w; x++) {
        const edge = x === c.x || y === c.y || x === c.x + c.w - 1 || y === c.y + c.h - 1;
        if (edge) {
          p.set(x, y, C.dk1, 3, M.wood);
          rim.push(p.idx(x, y));
        } else p.hole(x, y);
      }
    }
    rims.push(rim);
    holes.push({ x: c.x + 1, y: c.y + 1, w: c.w - 2, h: c.h - 2 });
  }
  // The crest: a little arch over the frame's middle holding the orb.
  const orbR = 4;
  const ox = cx;
  const oy = 5;
  const xa0 = 6;
  const span = (W - 2 * xa0) / 2;
  const apex = oy + orbR - 1;
  for (let x = xa0; x <= half; x++) {
    const u = (x + 0.5 - W / 2) / span;
    const yt = Math.round(top - (top - apex) * Math.pow(Math.max(0, 1 - u * u), 0.6));
    for (let y = yt; y < top; y++) {
      const j = y - yt;
      const col = j === 0 ? C.ink : j === 1 ? C.wd4 : j === 2 ? C.wd2 : C.dk1;
      p.sym(x, y, col, j === 0 ? 3 : j === 1 ? 7 : j === 2 ? 6 : 2.5, j === 0 ? M.ink : M.wood);
    }
  }
  for (let y = oy - orbR - 2; y <= oy + orbR + 2; y++) {
    for (let x = Math.floor(ox - orbR - 2); x <= Math.ceil(ox + orbR + 2); x++) {
      const d = Math.hypot(x - ox, y - oy);
      if (d <= orbR + 0.5) p.set(x, y, '#120a22', 6, M.gem);
      else if (d <= orbR + 1.6 && y >= oy) p.set(x, y, y > oy + 2 ? C.br1 : C.br3, 7, M.brass);
      else if (d <= orbR + 2.4 && y >= oy - 1) p.set(x, y, C.ink, 3, M.ink);
    }
  }
  // Two candles on the frame's top corners.
  const flames: Flame[] = [];
  for (const side of [0, 1]) {
    const bx = side ? W - 3 : 2;
    for (let y = top - 5; y < top; y++) {
      for (let dx = -2; dx <= 2; dx++) {
        const edge = Math.abs(dx) === 2 || y === top - 5;
        p.set(bx + dx, y, edge ? C.ink : dx < 0 ? C.wax2 : dx === 0 ? C.wax1 : C.wax0, edge ? 3 : 5, edge ? M.ink : M.wax);
      }
    }
    p.set(bx, top - 6, C.ink, 4, M.ink);
    flames.push({ x: bx, y: top - 7, hw: 1, h: 4, coals: [] });
  }
  // The base: a short plinth.
  for (let x = 1; x <= half; x++) {
    p.sym(x, bot, C.wd4, 6);
    p.sym(x, bot + 1, C.wd2, 5);
    p.sym(x, bot + 2, x < 3 ? C.br2 : C.dk3, 5, x < 3 ? M.brass : M.wood);
    p.sym(x, bot + 3, C.ink, 3, M.ink);
  }
  for (let y = bot; y < H; y++) p.sym(0, y, C.ink, 3, M.ink);
  orderRunes(runes, cx, (top + bot) / 2);
  const reels = cells.map((c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2, z: 12, r: Math.max(34, W * 0.7) }));
  return finish(
    p,
    'mini',
    {
      runes,
      flames,
      orb: { x: ox, y: oy, r: orbR },
      sigil: null,
      gems: [],
      emblem: null,
      rims,
      lights: {
        flames: flames.map((f) => ({ x: f.x, y: f.y - 2, z: 9, r: 30 })),
        orb: { x: ox, y: oy, z: 8, r: 30 },
        sigil: null,
        emblem: null,
        gems: [],
        runes: runes.map((r) => ({ x: r.x, y: r.y, z: 3, r: 5 })),
        reels,
      },
    },
    holes,
  );
}
