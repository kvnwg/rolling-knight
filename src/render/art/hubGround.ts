/**
 * The hub's ground, painted once: big beige flagstones laid in a loose grid (rows of uneven height,
 * joints that don't line up, chamfered corners, a lit bevel on top and a shadow underneath, mottling,
 * pits, cracks and moss in the grout), worn smoother down the middle where everyone walks; dark lush
 * grass and soil round the edges where the foliage grows; the shop's porch boards and doormat; and the
 * wooden steps at the bottom going down toward the viewer (and the dungeon). Contact shadows under
 * everything that stands are baked in, so the standing sprites sit on the ground.
 */
import type { PixelBuf } from '../pixel/buf';
import { mixHex } from './draw';
import { h2, Layer, LEAF, PLANK, planks, rk, rkd, TIMBER, vnoise, type Ramp } from './hubKit';

/** Flagstone, dark to light. */
export const FLAG: Ramp = ['#3a2f2a', '#54463a', '#6f5e4c', '#8b775e', '#a69071', '#bea783', '#d2bc94', '#e3cfa8'];
const GROUT: Ramp = ['#1c1614', '#2a221e', '#3a302a'];
const SOIL: Ramp = ['#140e0c', '#20160f', '#2e2016', '#3e2c1e', '#4e3a28'];
/** Cobbles round the paving's edge, gray-brown, dark to light. */
const COBBLE: Ramp = ['#221c1a', '#36302c', '#4c4440', '#645a52', '#7e7266', '#988a7c', '#b0a090'];

/** Jittered-grid Voronoi: distance to the nearest and second-nearest point, the nearest's offset and id. */
function voronoi(x: number, y: number, size: number, s: number): { d1: number; d2: number; dx: number; dy: number; id: number } {
  const cx = Math.floor(x / size);
  const cy = Math.floor(y / size);
  let d1 = 1e9;
  let d2 = 1e9;
  let id = 0;
  let ox = 0;
  let oy = 0;
  for (let gy = cy - 1; gy <= cy + 1; gy++) {
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      const px = (gx + 0.2 + h2(gx, gy, s) * 0.6) * size;
      const py = (gy + 0.2 + h2(gx, gy, s + 1) * 0.6) * size;
      const d = Math.hypot((x - px) * 0.85, y - py);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = h2(gx, gy, s + 2);
        ox = x - px;
        oy = y - py;
      } else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, dx: ox, dy: oy, id };
}

/** Rounded cobbles in dark mortar, each lit on its upper left (Firefly Garden's streets). */
function cobblePixel(x: number, y: number, s: number, edge: number): string {
  const v = voronoi(x + 0.5, y + 0.5, 7, s + 90);
  if (v.d2 - v.d1 < 1.3) return h2(x, y, s + 91) < 0.25 ? rk(LEAF, 1.5 + h2(x, y, s + 92) * 2) : rk(GROUT, 1);
  let k = 3 + (v.id - 0.5) * 1.8 - (v.dx + v.dy) * 0.22 - (v.d2 - v.d1 < 2.2 ? 0.6 : 0);
  if (edge < 4) k -= 0.8;
  return rk(COBBLE, k + (h2(x, y, s + 93) - 0.5) * 0.5);
}

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
  /** Row and index, for per-stone choices. */
  r: number;
  i: number;
}

/**
 * The flagstone layout: rows of uneven height, each cut into slabs of a few sizes (big ones mostly, a
 * narrow filler now and then). Joints snap to a coarse 6 px grid, so they line up across rows often
 * enough to read as a loose grid rather than brickwork; edges wander a pixel.
 */
class Flags {
  private rowY: number[] = [];
  private cuts: number[][] = [];
  constructor(private s: number, w: number, h: number) {
    // Columns of a coarse grid every 24 px; each row cuts its slabs on that grid most of the time
    // (so joints line up down the square), merging two cells into a long slab or splitting one now
    // and then, and nudging a joint a few pixels off the grid.
    let y = -6;
    let r = 0;
    while (y < h + 24) {
      this.rowY.push(y);
      const cut: number[] = [];
      const shift = h2(r, 0, s) < 0.35 ? 12 : 0;
      let x = -24 - shift;
      let i = 0;
      while (x < w + 48) {
        cut.push(x + (h2(r, i, s + 8) < 0.3 ? (h2(r, i, s + 9) < 0.5 ? -3 : 3) : 0));
        const pick = h2(r, i, s + 5);
        x += pick < 0.12 ? 12 : pick < 0.78 ? 24 : 36;
        i++;
      }
      this.cuts.push(cut);
      y += 18 + Math.floor(h2(r, 1, s) * 5);
      r++;
    }
  }
  /** A row's top edge at x: it wanders a pixel up or down every few pixels. */
  private top(r: number, x: number): number {
    const seg = Math.floor((x + r * 7) / 9);
    const w = h2(r, seg, this.s + 11);
    return this.rowY[r] + (w < 0.2 ? 1 : w > 0.9 ? -1 : 0);
  }
  /** A stone's left edge in row r at y: it leans a pixel now and then. */
  private left(r: number, i: number, y: number): number {
    const lean = h2(r, i, this.s + 12);
    const dy = y - this.rowY[r];
    return this.cuts[r][i] + (lean < 0.25 && dy > 8 ? 1 : lean > 0.8 && dy < 7 ? -1 : 0);
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
    return { x0, x1, y0, y1, id: h2(r, i, this.s + 3), r, i };
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
  // A border of cobbles where the paving meets the grass.
  const ed = g.edgeDist(x, y);
  if (ed < 11 + (vnoise(x, y, 9, 9, s + 94) - 0.5) * 6) return cobblePixel(x, y, s, ed);
  const st = flags.at(x, y);
  const ix = x - st.x0;
  const iy = y - st.y0;
  const w = st.x1 - st.x0;
  const h = st.y1 - st.y0;
  const id = st.id;
  const edge = g.edgeDist(x, y);
  // Joints: a pixel at each slab's left and top; wider (and mossier) where a slab sits loose.
  const loose = h2(st.r, st.i, s + 20) < 0.22;
  const wideL = loose && h2(st.r, st.i, s + 21) < 0.6;
  const gapL = ix <= 0 || (wideL && ix === 1);
  const gapT = iy <= 0 || (loose && iy === 1);
  // Rounded corners.
  const cTL = ix + iy < 2 + (loose ? 1 : 0);
  const cTR = w - 1 - ix + iy < 2;
  const cBL = ix + (h - 1 - iy) < 2;
  const cBR = w - 1 - ix + (h - 1 - iy) < 1;
  if (gapL || gapT || cTL || cTR || cBL || cBR) {
    // Moss and grass in the joints, more in wide ones and toward the edges of the paving.
    const mossy = vnoise(x, y, 13, 9, s + 30) + (edge < 46 ? (46 - edge) / 70 : 0) + (loose ? 0.12 : 0);
    if (mossy > 0.74 && h2(x, y, s + 31) < 0.7) return rk(LEAF, 1.2 + h2(x, y, s + 32) * 2.4 + (mossy > 0.92 ? 1 : 0));
    if (h2(x, y, s + 34) < 0.06) return rk(FLAG, 2);
    return rk(GROUT, h2(x, y, s + 33) < 0.3 ? 2 : 1);
  }
  // The slab: its own tone, mottled softly, a faint lit lip along the top and a soft shade underneath.
  let k = 3.4 + (id - 0.5) * 1.8;
  k += (vnoise(x, y, 7, 5, s + 1) - 0.5) * 0.9 + (vnoise(x, y, 19, 14, s + 2) - 0.5) * 0.6;
  const firstRow = gapT ? (loose ? 2 : 1) : 1;
  if (iy === firstRow) k += 0.8;
  if (ix === (wideL ? 2 : 1)) k += 0.35;
  if (iy === h - 1) k -= 1.1;
  if (ix === w - 1) k -= 0.45;
  // Pits, speckles and lichen spots.
  const sp = h2(x, y, s + 4);
  if (sp < 0.03) k -= 1.2;
  else if (sp > 0.982) k += 0.9;
  if (vnoise(x, y, 3, 3, s + 5 + st.i) > 0.86 && id > 0.5) k -= 0.7;
  // Worn smooth along the walk: a touch lighter.
  const wr = g.wear;
  if (y > wr.y0 && y < wr.y1) {
    const d = Math.abs(x - wr.x) / wr.half;
    if (d < 1) k += (1 - d * d) * 0.5;
  }
  // Darker and dirtier toward the edges.
  if (edge < 56) k -= ((56 - edge) / 56) * 1.3;
  // Now and then a crack: a jagged line from the top edge down into the slab, with a lit lip.
  if (h2(st.r, st.i, s + 22) < 0.07) {
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
  if (edge < 30 && vnoise(x, y, 5, 4, s + 9) > 0.68 && h2(x, y, s + 10) < 0.55) return mixHex(rk(FLAG, k), LEAF[3], 0.45);
  const c = rk(FLAG, k + (h2(x, y, s + 7) - 0.5) * 0.5);
  // Some slabs lean warm, some cool.
  const hue = h2(st.r, st.i, s + 6);
  if (hue < 0.2) return mixHex(c, '#b88a64', 0.2);
  if (hue > 0.85) return mixHex(c, '#8e8a86', 0.22);
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
    // Cast toward the lower right (the light is up and to the left): a darker core, a softer rim, a
    // faint outer ring.
    const cx = sh.x + 2;
    const cy = sh.y + 1;
    const rx = sh.rx + 1;
    const ry = sh.ry + 0.5;
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
      for (let x = Math.floor(sh.x - sh.rx + 2); x <= Math.ceil(sh.x + sh.rx + 4); x++) {
        const t = (y - sh.y) / sh.ry;
        const right = x > sh.x + sh.rx ? 0.6 : 1;
        const f = sh.strength * right * (t < 0.34 ? 1 : t < 0.67 ? 0.6 : t < 1 ? 0.32 : 0.15);
        L.tint(x, y, '#0a0610', f);
      }
    }
  }
}
