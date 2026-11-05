/**
 * The hub's ground, painted once: the short court of warm flagstones in front of the shop (slabs in
 * rows of uneven height, joints that don't line up, chamfered corners, a lit bevel on top and a shadow
 * underneath, mottling, pits, cracks and moss in the grout), worn smoother up the middle where
 * everyone walks; dark lush soil and grass round the edges where the plants grow; a doormat at the
 * shop's door; the stone curb at the foot of the court and the dark stone steps going down from it
 * (toward the viewer, and the dungeon). Contact shadows under everything that stands are baked in, so
 * the standing sprites sit on the ground.
 */
import type { PixelBuf } from '../pixel/buf';
import { mixHex } from './draw';
import { h2, Layer, LEAF, rk, rkd, STONE, vnoise, type Ramp } from './hubKit';

/** Flagstone, dark to light. */
export const FLAG: Ramp = ['#38302c', '#52483f', '#6c6052', '#887a68', '#a2937e', '#b9ab94', '#cfc1a8', '#e1d5be'];
const GROUT: Ramp = ['#1c1614', '#2a221e', '#3a302a'];
const SOIL: Ramp = ['#140e0c', '#20160f', '#2e2016', '#3e2c1e', '#4e3a28'];
/** The steps' stone: grayer than the court's, darkening as they go down into the night. */
const STEP: Ramp = ['#161416', '#221f20', '#302b2a', '#403a36', '#524b44', '#675e54', '#7f7466', '#998c7a'];

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
  /** How far in from the edge of the paving (px), for moss and dirt. */
  edgeDist: (x: number, y: number) => number;
  /** Soil instead of grass (under the foliage, in the dark). */
  soil: (x: number, y: number) => boolean;
  /** The worn line up the middle (x center, half width). */
  wear: { x: number; half: number; y0: number; y1: number };
  /** A rug or doormat. */
  mats: Array<{ x: number; y: number; w: number; h: number; colors: Ramp; seed: number }>;
  /** The steps down: top-left, width, how many, tread and riser heights. The curb runs along their top. */
  steps: { x: number; y: number; w: number; n: number; tread: number; riser: number };
  /** The curbs along the foot of the paving (each its top edge, from x0 to x1). */
  curbs: Array<{ y: number; x0: number; x1: number }>;
  /** Petals and leaves fallen on the paving round (x, y), `r` px out, `n` of them, in these colors. */
  litter: Array<{ x: number; y: number; r: number; n: number; colors: readonly string[] }>;
  shadows: ShadowSpec[];
  seed: number;
}

interface Stone {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  id: number;
  /** Row and index, for per-stone choices. */
  r: number;
  i: number;
}

/**
 * The flagstone layout: rows of uneven height (8 or 9 px, about half a keeper's height), each cut into
 * slabs of a few lengths (14 px mostly, a 10 px filler now and then, a long 18), every other row
 * shifted, edges wandering a pixel.
 */
class Flags {
  private rowY: number[] = [];
  private cuts: number[][] = [];
  constructor(private s: number, w: number, h: number) {
    let y = -4;
    let r = 0;
    while (y < h + 12) {
      this.rowY.push(y);
      const cut: number[] = [];
      const shift = h2(r, 0, s) < 0.45 ? 5 + (h2(r, 7, s) < 0.5 ? 2 : 0) : 0;
      let x = -24 - shift;
      let i = 0;
      while (x < w + 30) {
        cut.push(x + (h2(r, i, s + 8) < 0.25 ? (h2(r, i, s + 9) < 0.5 ? -1 : 1) : 0));
        const pick = h2(r, i, s + 5);
        x += pick < 0.15 ? 10 : pick < 0.7 ? 14 : 18;
        i++;
      }
      this.cuts.push(cut);
      y += 8 + Math.floor(h2(r, 1, s) * 2.4);
      r++;
    }
  }
  /** A row's top edge at x: it wanders a pixel up or down every few pixels. */
  private top(r: number, x: number): number {
    const seg = Math.floor((x + r * 7) / 7);
    const w = h2(r, seg, this.s + 11);
    return this.rowY[r] + (w < 0.14 ? 1 : w > 0.93 ? -1 : 0);
  }
  /** A stone's left edge in row r at y: it leans a pixel now and then. */
  private left(r: number, i: number, y: number): number {
    const lean = h2(r, i, this.s + 12);
    const dy = y - this.rowY[r];
    return this.cuts[r][i] + (lean < 0.2 && dy > 5 ? 1 : lean > 0.85 && dy < 4 ? -1 : 0);
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
    const y1 = r + 1 < this.rowY.length ? this.top(r + 1, x) : y0 + 10;
    const x0 = this.left(r, i, y);
    const x1 = i + 1 < cut.length ? this.left(r, i + 1, y) : x0 + 18;
    return { x0, x1, y0, y1, id: h2(r, i, this.s + 3), r, i };
  }
}

export function paintHubGround(g: GroundSpec): PixelBuf {
  const L = new Layer(0, 0, g.w, g.h);
  const flags = new Flags(g.seed, g.w, g.h);
  const s = g.seed;

  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.paved(x, y)) L.px(x, y, flagPixel(flags, x, y, g, s));
      else L.px(x, y, g.soil(x, y) ? soilPixel(x, y, s) : grassPixel(x, y, s, g));
    }
  }
  // Grass and moss creeping over the paving's edge.
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      if (!g.paved(x, y)) continue;
      const d = g.edgeDist(x, y);
      if (d > 8) continue;
      const n = vnoise(x, y, 6, 4, s + 40);
      if (d < 1.5 + n * 4.5 && h2(x, y, s + 41) < 0.6) L.px(x, y, grassPixel(x, y, s, g));
    }
  }
  for (const m of g.mats) mat(L, m);
  // Petals and leaves fallen on the stones: a pixel or two each, a darker one under (their shadow).
  g.litter.forEach((lt, j) => {
    for (let i = 0; i < lt.n; i++) {
      const a = h2(i, j, s + 95) * Math.PI * 2;
      const d = Math.sqrt(h2(i, j, s + 96)) * lt.r;
      const x = Math.round(lt.x + Math.cos(a) * d);
      const y = Math.round(lt.y + Math.sin(a) * d * 0.6);
      if (!g.paved(x, y) || !g.paved(x + 1, y + 1)) continue;
      const c = lt.colors[Math.floor(h2(i, j, s + 97) * lt.colors.length)];
      L.tint(x + 1, y + 1, '#2a1a10', 0.35);
      L.px(x, y, c);
      if (h2(i, j, s + 98) < 0.4) L.px(x + 1, y, mixHex(c, '#3a2010', 0.3));
    }
  });
  for (const c of g.curbs) curb(L, c, s);
  steps(L, g.steps, s);
  // Blades of grass standing up at the paving's edge (they overlap the stones a pixel or two).
  for (let y = 2; y < g.h; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      if (g.paved(x, y) || !g.paved(x, y - 2)) continue;
      if (h2(x, y, s + 50) > 0.4) continue;
      const tall = 1 + Math.floor(h2(x, y, s + 51) * 3);
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
  // Joints: a pixel at each slab's left and top; a little wider (and mossier) where a slab sits loose.
  const loose = h2(st.r, st.i, s + 20) < 0.16;
  const gapL = ix <= 0;
  const gapT = iy <= 0 || (loose && iy === 1 && ix > 2 && ix < w - 3);
  // Chamfered corners.
  const cTL = ix + iy < 2;
  const cTR = w - 1 - ix + iy < 1;
  const cBL = ix + (h - 1 - iy) < 1;
  if (gapL || gapT || cTL || cTR || cBL) {
    // Moss and grass in the joints, more toward the edges of the paving and in loose joints.
    const mossy = vnoise(x, y, 11, 8, s + 30) + (edge < 22 ? (22 - edge) / 40 : 0) + (loose ? 0.1 : 0);
    if (mossy > 0.78 && h2(x, y, s + 31) < 0.65) return rk(LEAF, 1.2 + h2(x, y, s + 32) * 2.2 + (mossy > 0.95 ? 1 : 0));
    if (h2(x, y, s + 34) < 0.05) return rk(FLAG, 2);
    return rk(GROUT, h2(x, y, s + 33) < 0.3 ? 2 : 1);
  }
  // The slab: its own tone, mottled softly, a lit lip along the top and left, a soft shade underneath.
  let k = 3.9 + (id - 0.5) * 1.7;
  k += (vnoise(x, y, 5, 4, s + 1) - 0.5) * 0.8 + (vnoise(x, y, 13, 9, s + 2) - 0.5) * 0.5;
  if (iy === (loose ? 2 : 1)) k += 0.85;
  if (ix === 1) k += 0.35;
  if (iy === h - 1) k -= 1;
  if (ix === w - 1) k -= 0.4;
  // Pits, speckles and lichen spots.
  const sp = h2(x, y, s + 4);
  if (sp < 0.03) k -= 1.1;
  else if (sp > 0.985) k += 0.8;
  if (vnoise(x, y, 3, 3, s + 5 + st.i) > 0.87 && id > 0.55) k -= 0.6;
  // Worn smooth up the walk: a touch lighter.
  const wr = g.wear;
  if (y > wr.y0 && y < wr.y1) {
    const d = Math.abs(x - wr.x) / wr.half;
    if (d < 1) k += (1 - d * d) * 0.45;
  }
  // Darker and dirtier toward the edges.
  if (edge < 26) k -= ((26 - edge) / 26) * 1.2;
  // Now and then a crack: a jagged line from the top edge down into the slab, with a lit lip.
  if (h2(st.r, st.i, s + 22) < 0.08) {
    const cx0 = Math.floor(w * (0.25 + h2(st.r, st.i, s + 23) * 0.5));
    let cx = cx0;
    for (let yy = 1; yy <= iy; yy++) cx += h2(st.x0 + st.y0, yy, s + 24) < 0.33 ? -1 : h2(st.x0 + st.y0, yy, s + 24) > 0.7 ? 1 : 0;
    const len = Math.floor(h * (0.5 + h2(st.r, st.i, s + 25) * 0.5));
    if (iy <= len) {
      if (ix === cx) return rk(GROUT, 1);
      if (ix === cx + 1) k += 0.6;
    }
  }
  // Old moss stains on the stone near the edges.
  if (edge < 14 && vnoise(x, y, 4, 3, s + 9) > 0.66 && h2(x, y, s + 10) < 0.55) return mixHex(rk(FLAG, k), LEAF[3], 0.45);
  const c = rkd(FLAG, k + (h2(x, y, s + 7) - 0.5) * 0.4, x, y);
  // Some slabs lean warm, some cool.
  const hue = h2(st.r, st.i, s + 6);
  if (hue < 0.2) return mixHex(c, '#c8a070', 0.16);
  if (hue > 0.86) return mixHex(c, '#9a968e', 0.2);
  return c;
}

function grassPixel(x: number, y: number, s: number, g: GroundSpec): string {
  // Lush and dark: mottled, with short blades (a bright tip over a dark root).
  let k = 1.4 + vnoise(x, y, 11, 8, s + 60) * 1.5 + (vnoise(x, y, 4, 4, s + 61) - 0.5) * 0.8;
  const cx = Math.floor(x / 3);
  const cy = Math.floor(y / 4);
  if (h2(cx, cy, s + 62) < 0.7) {
    const tx = cx * 3 + Math.floor(h2(cx, cy, s + 63) * 3);
    const ty = cy * 4 + Math.floor(h2(cx, cy, s + 64) * 3);
    if (x === tx && y === ty) k += 1.6;
    else if (x === tx && y === ty + 1) k += 0.8;
    else if (x === tx && y === ty + 2) k -= 0.8;
  }
  // Clover and tiny flowers here and there.
  const fx = Math.floor(x / 9);
  const fy = Math.floor(y / 8);
  if (h2(fx, fy, s + 65) < 0.07) {
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
  let k = 1.3 + vnoise(x, y, 8, 6, s + 70) * 1.7;
  if (h2(x, y, s + 71) < 0.05) k += 1.3;
  // Fallen leaves on the soil.
  if (h2(Math.floor(x / 5), Math.floor(y / 4), s + 72) < 0.12 && h2(x, y, s + 73) < 0.5) return rk(LEAF, 2 + h2(x, y, s + 74) * 2);
  return rkd(SOIL, k, x, y);
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

/** A curb along the foot of the paving: a row of dressed stones, lit on top, a dark face under. */
function curb(L: Layer, c: GroundSpec['curbs'][number], s: number): void {
  for (let x = c.x0; x < c.x1; x++) {
    const block = Math.floor((x + 3) / 11);
    const bx = (x + 3) % 11;
    for (let y = c.y - 2; y < c.y + 4; y++) {
      const iy = y - (c.y - 2);
      let k = iy === 0 ? 5.6 : iy === 1 ? 4.6 : iy === 2 ? 2.6 : 1.8 - (iy - 3) * 0.5;
      k += (h2(block, 0, s + 84) - 0.5) * 0.8 + (vnoise(x, y, 4, 2, s + 85) - 0.5) * 0.6;
      if (bx === 0) k = iy < 2 ? 2.4 : 0.6;
      L.px(x, y, rkd(STONE, k, x, y));
    }
  }
}

/**
 * The steps going down from the court toward the viewer: each a stone tread with a lit front lip
 * over a dark riser, worn hollow in the middle, darker the lower they go; stone cheeks either side.
 */
function steps(L: Layer, st: GroundSpec['steps'], s: number): void {
  for (let i = 0; i < st.n; i++) {
    const ty = st.y + i * (st.tread + st.riser);
    const dim = i * 0.55;
    // Each step a little narrower than the one above (they sink between the cheeks).
    for (let y = ty; y < ty + st.tread + st.riser; y++) {
      for (let x = st.x; x < st.x + st.w; x++) {
        const iy = y - ty;
        const slab = Math.floor((x - st.x + (i % 2) * 7) / 14);
        let k: number;
        if (iy < st.tread) {
          k = 4.3 + (h2(slab, i, s + 80) - 0.5) * 1 + (vnoise(x, y, 5, 3, s + 81 + i) - 0.5) * 0.9;
          if (iy === 0) k -= 1.2;
          if (iy === st.tread - 1) k = 6.4;
          if (iy === st.tread - 2) k += 0.5;
          // Worn hollow in the middle where feet go.
          const d = Math.abs(x + 0.5 - (st.x + st.w / 2)) / (st.w / 2);
          if (d < 0.55 && iy > 0 && iy < st.tread - 1) k += (0.55 - d) * 1.2;
          // A joint between the slabs.
          if ((x - st.x + (i % 2) * 7) % 14 === 0 && iy < st.tread - 1) k = 1.4;
          if (h2(x, y, s + 86) < 0.04) k -= 1;
        } else {
          k = 2 - (iy - st.tread) * 0.5 + (vnoise(x, y, 6, 2, s + 82) - 0.5) * 0.7;
        }
        k -= dim;
        L.px(x, y, rkd(STEP, k, x, y));
      }
    }
    // The cheeks: dressed stone either side, notched for each step, lit on the left one's top.
    for (const [cx, side] of [[st.x - 5, -1], [st.x + st.w, 1]] as const) {
      for (let y = ty; y < ty + st.tread + st.riser; y++) {
        for (let x = cx; x < cx + 5; x++) {
          const ix = x - cx;
          let k = 3.4 - dim * 0.7 + (vnoise(x, y, 3, 5, s + 83) - 0.5) * 0.9;
          if (ix === (side < 0 ? 0 : 4)) k -= 1.4;
          if (ix === (side < 0 ? 1 : 0)) k += side < 0 ? 1.2 : -0.6;
          if ((y - st.y) % 10 === 9) k -= 1.2;
          L.px(x, y, rkd(STONE, k, x, y));
        }
      }
    }
  }
  // Below the last step, the dark it goes down into.
  const yb = st.y + st.n * (st.tread + st.riser);
  for (let y = yb; y < L.h; y++) {
    for (let x = st.x - 5; x < st.x + st.w + 5; x++) {
      const t = Math.min(1, (y - yb) / 14);
      L.px(x, y, rkd(STEP, 1.4 - t * 1.4 + (vnoise(x, y, 5, 3, s + 87) - 0.5) * 0.5, x, y));
    }
  }
}

function shadow(L: Layer, sh: ShadowSpec): void {
  if (sh.kind === 'oval') {
    // Cast toward the lower right (the light is up and to the left): a darker core, a softer rim, a
    // faint outer ring.
    const cx = sh.x + 1;
    const cy = sh.y + 0.5;
    const rx = sh.rx + 0.5;
    const ry = sh.ry + 0.3;
    for (let y = Math.floor(cy - ry * 1.4); y <= Math.ceil(cy + ry * 1.4); y++) {
      for (let x = Math.floor(cx - rx * 1.35); x <= Math.ceil(cx + rx * 1.35); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1.8) continue;
        const f = d < 0.4 ? sh.strength * 1.1 : d < 1 ? sh.strength * 0.65 : sh.strength * 0.25;
        L.tint(x, y, '#0a0610', f);
      }
    }
  } else {
    // A band under a wall, fading down over `ry` px, reaching a little further on the right.
    for (let y = Math.floor(sh.y); y < sh.y + sh.ry + 2; y++) {
      for (let x = Math.floor(sh.x - sh.rx + 1); x <= Math.ceil(sh.x + sh.rx + 2); x++) {
        const t = (y - sh.y) / sh.ry;
        const right = x > sh.x + sh.rx ? 0.6 : 1;
        const f = sh.strength * right * (t < 0.34 ? 1 : t < 0.67 ? 0.6 : t < 1 ? 0.32 : 0.15);
        L.tint(x, y, '#0a0610', f);
      }
    }
  }
}
