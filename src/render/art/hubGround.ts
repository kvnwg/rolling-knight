/**
 * The hub's ground, painted once: big beige flagstones laid in a loose grid (rows of uneven height,
 * joints that don't line up, chamfered corners, a lit bevel on top and a shadow underneath, mottling,
 * pits, cracks and moss in the grout), worn smoother down the middle where everyone walks; dark lush
 * grass and soil round the edges where the foliage grows; the shop's porch boards and doormat; and the
 * wooden steps at the bottom going down toward the viewer (and the dungeon). Contact shadows under
 * everything that stands are baked in, so the standing sprites sit on the ground.
 */
import { blank, type PixelBuf } from '../pixel/buf';
import { mixHex, setRGB } from './draw';
import { h2, Layer, LEAF, PLANK, planks, rk, rkd, TIMBER, vnoise, type Ramp } from './hubKit';

/** Flagstone, dark to light. */
export const FLAG: Ramp = ['#3a2f2a', '#54463a', '#6f5e4c', '#8b775e', '#a69071', '#bea783', '#d2bc94', '#e3cfa8'];
const GROUT: Ramp = ['#1c1614', '#2a221e', '#3a302a'];
const SOIL: Ramp = ['#140e0c', '#20160f', '#2e2016', '#3e2c1e', '#4e3a28'];

export interface ShadowSpec {
  /** A contact shadow: an ellipse (cx, cy, rx, ry) or a band under a wall (x0..x1 at y, `depth` down). */
  kind: 'oval' | 'band';
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** 0..1 */
  strength: number;
}

export interface GroundSpec {
  w: number;
  h: number;
  /** Is this pixel paved (flagstones)? Everything else is grass or soil. */
  paved: (x: number, y: number) => boolean;
  /** How far in from the edge of the paving (px), for moss and wear. */
  edgeDist: (x: number, y: number) => number;
  /** Soil instead of grass (under the foliage, in the dark). */
  soil: (x: number, y: number) => boolean;
  /** The worn line down the middle (x center, half width). */
  wear: { x: number; half: number; y0: number; y1: number };
  /** Wooden decks (the porch): rectangles with a front edge. */
  decks: Array<{ x: number; y: number; w: number; h: number; riser: number; seed: number }>;
  /** A rug or doormat. */
  mats: Array<{ x: number; y: number; w: number; h: number; colors: Ramp; seed: number }>;
  /** The steps down: top-left, width, how many, tread and riser heights. */
  steps: { x: number; y: number; w: number; n: number; tread: number; riser: number };
  shadows: ShadowSpec[];
  seed: number;
}

interface Stone {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  id: number;
}

/** The flagstone layout: rows of uneven height, each cut into stones of uneven width. */
class Flags {
  private rowY: number[] = [];
  private cuts: number[][] = [];
  constructor(private s: number, w: number, h: number) {
    let y = -4;
    let r = 0;
    while (y < h + 20) {
      this.rowY.push(y);
      const cut: number[] = [];
      let x = -Math.floor(h2(r, 0, s) * 20) - 2;
      let i = 0;
      while (x < w + 30) {
        cut.push(x);
        // Mostly big slabs, now and then a narrow filler stone.
        const narrow = h2(r, i, s + 5) < 0.14;
        x += narrow ? 11 + Math.floor(h2(r, i, s + 6) * 5) : 19 + Math.floor(h2(r, i, s + 7) * 12);
        i++;
      }
      this.cuts.push(cut);
      y += 13 + Math.floor(h2(r, 1, s) * 5);
      r++;
    }
  }
  /** A row's top edge at x: it wanders a pixel up or down every few pixels. */
  private top(r: number, x: number): number {
    const seg = Math.floor((x + r * 7) / 7);
    const w = h2(r, seg, this.s + 11);
    return this.rowY[r] + (w < 0.22 ? 1 : w > 0.88 ? -1 : 0);
  }
  /** A stone's left edge in row r at y: it leans a pixel now and then. */
  private left(r: number, i: number, y: number): number {
    const lean = h2(r, i, this.s + 12);
    const dy = y - this.rowY[r];
    return this.cuts[r][i] + (lean < 0.25 && dy > 7 ? 1 : lean > 0.8 && dy < 6 ? -1 : 0);
  }
  at(x: number, y: number): Stone {
    let r = 0;
    while (r + 1 < this.rowY.length && this.rowY[r + 1] <= y + 1) r++;
    if (y < this.top(r, x) && r > 0) r--;
    else if (r + 1 < this.rowY.length && y >= this.top(r + 1, x)) r++;
    const cut = this.cuts[r];
    let i = 0;
    while (i + 1 < cut.length && cut[i + 1] <= x + 1) i++;
    if (x < this.left(r, i, y) && i > 0) i--;
    else if (i + 1 < cut.length && x >= this.left(r, i + 1, y)) i++;
    const y0 = this.top(r, x);
    const y1 = r + 1 < this.rowY.length ? this.top(r + 1, x) : y0 + 16;
    const x0 = this.left(r, i, y);
    const x1 = i + 1 < cut.length ? this.left(r, i + 1, y) : x0 + 24;
    return { x0, x1, y0, y1, id: h2(r, i, this.s + 3) * 0.999 + 0.0005 + (r * 1000 + i) * 0 };
  }
  key(x: number, y: number): number {
    const st = this.at(x, y);
    return st.x0 * 7919 + st.y0 * 104729;
  }
}

export function paintHubGround(g: GroundSpec): PixelBuf {
  const L = new Layer(0, 0, g.w, g.h);
  const flags = new Flags(g.seed, g.w, g.h);
  const s = g.seed;

  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.paved(x, y)) {
        L.px(x, y, flagPixel(flags, x, y, g, s));
      } else {
        L.px(x, y, g.soil(x, y) ? soilPixel(x, y, s) : grassPixel(x, y, s, g));
      }
    }
  }
  // Grass creeping over the paving's edge, and tufts in the grout near it.
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      if (!g.paved(x, y)) continue;
      const d = g.edgeDist(x, y);
      if (d > 14) continue;
      const n = vnoise(x, y, 7, 5, s + 40);
      if (d < 3 + n * 6 && h2(x, y, s + 41) < 0.55) L.px(x, y, grassPixel(x, y, s, g));
    }
  }
  for (const d of g.decks) deck(L, d);
  for (const m of g.mats) mat(L, m);
  stairs(L, g.steps, s);
  // Blades of grass standing up at the paving's edge (they overlap the stones a pixel or two).
  for (let y = 2; y < g.h; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      if (g.paved(x, y) || !g.paved(x, y - 3)) continue;
      if (h2(x, y, s + 50) > 0.42) continue;
      const tall = 2 + Math.floor(h2(x, y, s + 51) * 3);
      for (let t = 0; t < tall; t++) L.px(x, y - t, rk(LEAF, 2 + t + (h2(x, 0, s + 52) < 0.3 ? 2 : 0)));
    }
  }
  for (const sh of g.shadows) shadow(L, sh);
  return L.buf;
}

function flagPixel(flags: Flags, x: number, y: number, g: GroundSpec, s: number): string {
  const st = flags.at(x, y);
  const ix = x - st.x0;
  const iy = y - st.y0;
  const w = st.x1 - st.x0;
  const h = st.y1 - st.y0;
  const id = st.id;
  const edge = g.edgeDist(x, y);
  // Grout: a pixel at each stone's left and top, two where the stone is laid loose.
  const loose = id > 0.7;
  const gapL = ix <= 0 || (loose && ix === 1 && h2(st.x0, st.y0, s + 21) < 0.5);
  const gapT = iy <= 0 || (loose && iy === 1);
  // Chamfered corners.
  const cornerTL = ix + iy < 3;
  const cornerTR = w - 1 - ix + iy < 2;
  const cornerBL = ix + (h - 1 - iy) < 2;
  const cornerBR = w - 1 - ix + (h - 1 - iy) < 1;
  if (gapL || gapT || cornerTL || cornerTR || cornerBL || cornerBR) {
    // Moss and grass in the joints, more toward the edges of the paving.
    const mossy = vnoise(x, y, 11, 9, s + 30) + (edge < 40 ? (40 - edge) / 60 : 0);
    if (mossy > 0.78 && h2(x, y, s + 31) < 0.6) return rk(LEAF, 1 + h2(x, y, s + 32) * 2.5 + (mossy > 0.95 ? 1 : 0));
    return rk(GROUT, h2(x, y, s + 33) < 0.25 ? 2 : iy <= 0 && ix > 1 ? 0 : 1);
  }
  // The slab: its own tone (some warmer, some grayer), mottled, lit on its top edge.
  let k = 3.1 + (id - 0.5) * 2.1;
  k += (vnoise(x, y, 6, 5, s + 1) - 0.5) * 1.1 + (vnoise(x, y, 17, 13, s + 2) - 0.5) * 0.7;
  const top = iy === 1 || (gapT && iy === 2);
  if (iy === 1 || (loose && iy === 2)) k += 1.3;
  else if (iy === 2) k += 0.35;
  if (ix === 1 || (loose && ix === 2)) k += 0.6;
  if (iy === h - 1) k -= 1.5;
  else if (iy === h - 2) k -= 0.5;
  if (ix === w - 1) k -= 0.8;
  // Pits and speckles.
  const sp = h2(x, y, s + 4);
  if (sp < 0.035) k -= 1.3;
  else if (sp > 0.975) k += 0.9;
  // Worn smooth along the walk: a touch lighter, less mottled.
  const wr = g.wear;
  if (y > wr.y0 && y < wr.y1) {
    const d = Math.abs(x - wr.x) / wr.half;
    if (d < 1) k += (1 - d * d) * 0.55;
  }
  // Darker and dirtier toward the edges.
  if (edge < 50) k -= ((50 - edge) / 50) * 1.1;
  // A crack across some slabs: a jagged dark line with a lit lip.
  if (id > 0.84 && !top) {
    const cx = Math.round(w * (0.3 + (id - 0.84) * 2.5) + (iy - h / 2) * 0.7 + (h2(st.x0, iy, s + 8) < 0.3 ? 1 : 0));
    if (ix === cx) return rk(GROUT, 1);
    if (ix === cx + 1) k += 0.7;
  }
  // A stain or two of old moss on the stone itself near the edges.
  if (edge < 26 && vnoise(x, y, 5, 4, s + 9) > 0.7 && h2(x, y, s + 10) < 0.5) return mixHex(rk(FLAG, k), LEAF[3], 0.45);
  const c = rkd(FLAG, k, x, y);
  // Some slabs lean warm, some cool.
  const hue = h2(st.x0, st.y0, s + 6);
  if (hue < 0.18) return mixHex(c, '#b88a64', 0.18);
  if (hue > 0.86) return mixHex(c, '#8a8a8a', 0.2);
  return c;
}

function grassPixel(x: number, y: number, s: number, g: GroundSpec): string {
  // Lush and dark: mottled, with short blades (a bright tip over a dark root).
  let k = 1.6 + vnoise(x, y, 13, 10, s + 60) * 1.6 + (vnoise(x, y, 4, 4, s + 61) - 0.5) * 0.8;
  const cx = Math.floor(x / 3);
  const cy = Math.floor(y / 4);
  const hh = h2(cx, cy, s + 62);
  if (hh < 0.7) {
    const tx = cx * 3 + Math.floor(h2(cx, cy, s + 63) * 3);
    const ty = cy * 4 + Math.floor(h2(cx, cy, s + 64) * 3);
    if (x === tx && y === ty) k += 1.6;
    else if (x === tx && y === ty + 1) k += 0.8;
    else if (x === tx && y === ty + 2) k -= 0.8;
  }
  // Clover and tiny flowers here and there.
  const fx = Math.floor(x / 9);
  const fy = Math.floor(y / 8);
  if (h2(fx, fy, s + 65) < 0.08) {
    const px = fx * 9 + 2 + Math.floor(h2(fx, fy, s + 66) * 5);
    const py = fy * 8 + 2 + Math.floor(h2(fx, fy, s + 67) * 4);
    const col = ['#f4eeda', '#f2c94c', '#e88aa8', '#b8a8f0'][Math.floor(h2(fx, fy, s + 68) * 4)];
    if (x === px && y === py) return col;
    if ((x === px - 1 || x === px + 1) && y === py) return mixHex(col, '#40602a', 0.45);
  }
  if (g.edgeDist(x, y) < 0) k -= 0.3;
  return rkd(LEAF, k, x, y);
}

function soilPixel(x: number, y: number, s: number): string {
  let k = 1.4 + vnoise(x, y, 9, 7, s + 70) * 1.8;
  if (h2(x, y, s + 71) < 0.05) k += 1.4;
  // Fallen leaves on the soil.
  if (h2(Math.floor(x / 5), Math.floor(y / 4), s + 72) < 0.12 && h2(x, y, s + 73) < 0.5) return rk(LEAF, 2 + h2(x, y, s + 74) * 2);
  return rkd(SOIL, k, x, y);
}

function deck(L: Layer, d: GroundSpec['decks'][number]): void {
  // Boards running across, a lit front lip and the step's riser under it.
  planks(L, d.x, d.y, d.w, d.h - d.riser, { dir: 'h', board: 4, seed: d.seed, joint: 23, nails: true, base: 4.4 });
  for (let x = d.x; x < d.x + d.w; x++) {
    L.px(x, d.y + d.h - d.riser - 1, rk(PLANK, 6));
    for (let yy = d.y + d.h - d.riser; yy < d.y + d.h; yy++) {
      const k = 2.2 - (yy - (d.y + d.h - d.riser)) * 0.6 + (vnoise(x, yy, 8, 1, d.seed + 3) - 0.5);
      L.px(x, yy, rkd(PLANK, k, x, yy));
    }
    // Plank ends showing on the riser every so often.
    if ((x - d.x) % 11 === 0) for (let yy = d.y + d.h - d.riser; yy < d.y + d.h; yy++) L.px(x, yy, rk(PLANK, 0));
  }
  for (let y = d.y; y < d.y + d.h; y++) {
    L.px(d.x, y, rk(TIMBER, 1));
    L.px(d.x + d.w - 1, y, rk(TIMBER, 1));
  }
}

function mat(L: Layer, m: GroundSpec['mats'][number]): void {
  // A woven mat: a border, a diamond in the middle, fringe at the ends.
  const c = m.colors;
  for (let y = m.y; y < m.y + m.h; y++) {
    for (let x = m.x; x < m.x + m.w; x++) {
      const ix = x - m.x;
      const iy = y - m.y;
      const border = ix === 0 || iy === 0 || ix === m.w - 1 || iy === m.h - 1;
      const inner = ix === 2 || iy === 1 || ix === m.w - 3 || iy === m.h - 2;
      const cx = Math.abs(ix - (m.w - 1) / 2) / ((m.w - 1) / 2);
      const cy = Math.abs(iy - (m.h - 1) / 2) / ((m.h - 1) / 2);
      const diamond = cx * 0.8 + cy < 0.62;
      const weave = (ix + iy) % 2 === 0 ? 0.3 : -0.3;
      let k = border ? 0 : inner ? 3 : diamond ? (cx * 0.8 + cy < 0.3 ? 4 : 2) : 1.4 + weave;
      if (iy === 1 && !border) k += 0.4;
      L.px(x, y, rk(c, k));
    }
  }
  for (let x = m.x + 1; x < m.x + m.w - 1; x += 2) {
    L.px(x, m.y - 1, rk(c, 2));
    L.px(x, m.y + m.h, rk(c, 1));
  }
}

function stairs(L: Layer, st: GroundSpec['steps'], s: number): void {
  // Each step: a tread of boards (lit on its front lip), then the riser facing us, darker, with the
  // board ends showing. The stringers run down both sides. Lower steps are a little darker, going down.
  for (let i = 0; i < st.n; i++) {
    const ty = st.y + i * (st.tread + st.riser);
    const dim = i * 0.35;
    for (let y = ty; y < ty + st.tread + st.riser; y++) {
      for (let x = st.x; x < st.x + st.w; x++) {
        const iy = y - ty;
        let k: number;
        if (iy < st.tread) {
          const board = Math.floor(iy / 3);
          k = 4.4 + (h2(board, i, s + 80) - 0.5) * 1.1 + (vnoise(x, y * 4, 8, 1.3, s + 81 + i) - 0.5) * 1.3;
          if (iy % 3 === 2) k -= 1.2;
          if (iy === 0) k -= 1.6;
          if (iy === st.tread - 1) k = 6.2;
          // Worn in the middle where feet go.
          const d = Math.abs(x - (st.x + st.w / 2)) / (st.w / 2);
          if (d < 0.6) k += (0.6 - d) * 0.8;
        } else {
          k = 2.1 - (iy - st.tread) * 0.45 + (vnoise(x, y, 7, 2, s + 82) - 0.5) * 0.9;
          if ((x - st.x + i * 5) % 17 === 0) k = 0.5;
        }
        k -= dim;
        // Nail heads on the treads.
        if (iy === Math.floor(st.tread / 2) && ((x - st.x) % 17 === 3 || (x - st.x) % 17 === 14)) k = 6.6 - dim;
        L.px(x, y, rkd(PLANK, k, x, y));
      }
    }
    // Stringers: dark timber down both sides, notched for each step.
    for (const sx of [st.x - 4, st.x + st.w]) {
      for (let y = ty; y < ty + st.tread + st.riser; y++) {
        for (let x = sx; x < sx + 4; x++) {
          let k = 3.2 - dim * 0.8 + (vnoise(x * 5, y, 1.2, 6, s + 83) - 0.5) * 1.2;
          if (x === sx) k -= 1.2;
          if (x === sx + 1) k += 0.9;
          if (x === sx + 3) k -= 0.8;
          if (y === ty) k += 1;
          L.px(x, y, rkd(TIMBER, k, x, y));
        }
      }
    }
  }
}

function shadow(L: Layer, sh: ShadowSpec): void {
  if (sh.kind === 'oval') {
    for (let y = Math.floor(sh.y - sh.ry); y <= Math.ceil(sh.y + sh.ry); y++) {
      for (let x = Math.floor(sh.x - sh.rx); x <= Math.ceil(sh.x + sh.rx); x++) {
        const nx = (x + 0.5 - sh.x) / sh.rx;
        const ny = (y + 0.5 - sh.y) / sh.ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        // Two steps: a soft rim and a darker core.
        const f = d < 0.45 ? sh.strength : sh.strength * 0.55;
        L.tint(x, y, '#0a0610', f);
      }
    }
  } else {
    // A band under a wall, fading down over `ry` px.
    for (let y = Math.floor(sh.y); y < sh.y + sh.ry; y++) {
      for (let x = Math.floor(sh.x - sh.rx); x <= Math.ceil(sh.x + sh.rx); x++) {
        const t = (y - sh.y) / sh.ry;
        const f = sh.strength * (t < 0.34 ? 1 : t < 0.67 ? 0.6 : 0.3);
        L.tint(x, y, '#0a0610', f);
      }
    }
  }
}

/** A tiny check that the module paints without a DOM (used by the preview tool). */
export function groundSwatch(): PixelBuf {
  const b = blank(8, 8);
  FLAG.forEach((c, i) => setRGB(b, i, 0, c));
  return b;
}
