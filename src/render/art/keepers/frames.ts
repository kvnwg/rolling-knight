/**
 * The frame round each keeper's counter (their screen's tabs and paper), made for who they are and
 * painted to the screen's exact size, so nothing repeats like a tiled border:
 *  - the Oracle: violet velvet piped in gold, filigree, crescent moons, stars, a crystal orb;
 *  - the tinker: riveted brass plates, gears meshing at the corners, a copper pipe with a valve;
 *  - the sage: old stone overgrown with moss and ivy, flowers, mushrooms, teal sigil sparks, a
 *    sigil stone set in the top;
 *  - the priestess: shrine marble with a laurel border, roses climbing, candles, the rising sun;
 *  - the notice board: a wooden frame round cork, notes pinned at the corners, red string, the "!";
 *  - the warden: dungeon stone and iron, a chain swagged across, torches, his shield;
 *  - the broker: polished mahogany with brass corners and coin inlays, coins piled, his balance.
 * The band is FRAME_BAND art pixels wide all round, and under its top runs the plaque (FRAME_PLAQUE
 * deep), where the keeper's own things are: a phone's screen cuts off anything past the frame's
 * sides, and anything tall on its foot would stand on the buttons, so the showpiece is up there.
 * Decorations reach FRAME_OVER pixels past the frame's outside where there's room (behind the tabs,
 * past the sides on a wide screen) and a pixel or two onto the paper.
 * Lit like the keepers' scenes (light.ts): glowing things glow. Pure: no DOM.
 */
import type { StationId } from '../../../world/hubWorld';
import { mixHex } from '../draw';
import { GOLD, h2, IRON, Layer, LEAF, oval, PLANK, rk, rkd, vnoise, type Ramp } from '../hubKit';
import { lightLayer } from './light';
import { BRASS, candle, crystalOrb, EMBER, gear } from './props';

/** The band's width, art pixels, all round. */
export const FRAME_BAND = 5;
/** The plaque under the top band, where each keeper's things are: its depth, art pixels (its lip included). */
export const FRAME_PLAQUE = 8;
/** How far decorations reach past the frame's outer edge, art pixels. */
export const FRAME_OVER = 6;

/** The frame being painted: the image is the box plus FRAME_OVER all round; the box is x0..x1, y0..y1 (inclusive). */
interface F {
  L: Layer;
  W: number;
  H: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  B: number;
  /** The plaque under the top band: its columns px0..px1, its rows py0..py1 (py1 is its inked lip). */
  px0: number;
  px1: number;
  py0: number;
  py1: number;
  /** The middle column. */
  cx: number;
  seed: number;
}

type Side = 'top' | 'bottom' | 'left' | 'right';

/** Every pixel of the band: its distance in from the outside (0..B-1), which side, and how far along it. */
function eachBand(f: F, fn: (x: number, y: number, d: number, side: Side, along: number, corner: boolean) => void): void {
  for (let y = f.y0; y <= f.y1; y++) {
    for (let x = f.x0; x <= f.x1; x++) {
      const dl = x - f.x0;
      const dr = f.x1 - x;
      const dt = y - f.y0;
      const db = f.y1 - y;
      const d = Math.min(dl, dr, dt, db);
      if (d >= f.B) continue;
      const side: Side = d === dt ? 'top' : d === db ? 'bottom' : d === dl ? 'left' : 'right';
      const along = side === 'top' || side === 'bottom' ? dl : dt;
      const corner = Math.min(dl, dr) < f.B && Math.min(dt, db) < f.B;
      fn(x, y, d, side, along, corner);
    }
  }
}

/** The band's outer outline and the line where it meets the paper, in ink. */
function inkEdges(f: F, ink: string): void {
  eachBand(f, (x, y, d) => {
    if (d === 0) {
      // (The very corners rounded off by a pixel.)
      const atCorner = (x === f.x0 || x === f.x1) && (y === f.y0 || y === f.y1);
      if (!atCorner) f.L.px(x, y, ink);
    }
  });
  for (let x = f.x0 + f.B - 1; x <= f.x1 - f.B + 1; x++) {
    f.L.px(x, f.y0 + f.B - 1, ink);
    f.L.px(x, f.y1 - f.B + 1, ink);
  }
  for (let y = f.y0 + f.B - 1; y <= f.y1 - f.B + 1; y++) {
    f.L.px(f.x0 + f.B - 1, y, ink);
    f.L.px(f.x1 - f.B + 1, y, ink);
  }
}

/** Places along a side between its corners: `n` spots, evenly, as positions along it (x for top/bottom, y for the sides). */
function spots(f: F, side: Side, every: number, margin: number): number[] {
  const len = side === 'top' || side === 'bottom' ? f.x1 - f.x0 : f.y1 - f.y0;
  const n = Math.max(1, Math.floor((len - 2 * margin) / every));
  const step = (len - 2 * margin) / n;
  return Array.from({ length: n + 1 }, (_, i) => Math.round(margin + i * step));
}

/** A glowing mote: a pixel (or a little cross) of light. */
function mote(L: Layer, x: number, y: number, c: string, big = false): void {
  L.gl(x, y, c);
  if (big) {
    const dim = mixHex(c, '#000000', 0.35);
    L.gl(x + 1, y, dim);
    L.gl(x - 1, y, dim);
    L.gl(x, y + 1, dim);
    L.gl(x, y - 1, dim);
  }
}

// ------------------------------------------------------------------ materials

/** Stone blocks along the band (one course deep), a block filling each corner; lit from the top left. */
function stoneBand(f: F, ramp: Ramp, seed: number, round = false): void {
  eachBand(f, (x, y, d, side, along, corner) => {
    let u: number;
    let v: number;
    let len: number;
    let id: number;
    if (corner) {
      u = Math.min(x - f.x0, f.x1 - x);
      v = Math.min(y - f.y0, f.y1 - y);
      const left = x - f.x0 < f.B;
      const top = y - f.y0 < f.B;
      u = left ? x - f.x0 : f.B - 1 - (f.x1 - x);
      v = top ? y - f.y0 : f.B - 1 - (f.y1 - y);
      len = f.B;
      id = (left ? 1 : 2) + (top ? 10 : 20);
    } else {
      // Blocks of uneven length along the side.
      const s = side === 'top' ? 1 : side === 'bottom' ? 2 : side === 'left' ? 3 : 4;
      let start = f.B;
      let k = 0;
      let bl = 6 + Math.floor(h2(k, s, seed) * 6);
      while (along >= start + bl) {
        start += bl;
        k++;
        bl = 6 + Math.floor(h2(k, s, seed) * 6);
      }
      const across = side === 'top' ? d : side === 'bottom' ? f.B - 1 - d : side === 'left' ? d : f.B - 1 - d;
      if (side === 'top' || side === 'bottom') {
        u = along - start;
        v = across;
      } else {
        u = across;
        v = along - start;
      }
      len = bl;
      id = k * 7 + s;
    }
    const bw = corner ? f.B : side === 'top' || side === 'bottom' ? len : f.B;
    const bh = corner ? f.B : side === 'top' || side === 'bottom' ? f.B : len;
    // Mortar between blocks.
    if (u === 0 || v === 0) {
      f.L.px(x, y, ramp[0]);
      return;
    }
    let k = ramp.length * 0.5 + (h2(id, 3, seed) - 0.5) * 1.4 + (vnoise(x, y, 3, 3, seed) - 0.5) * 0.9;
    if (v === 1) k += 1.3;
    if (u === 1) k += 0.6;
    if (v === bh - 1) k -= 1;
    if (u === bw - 1) k -= 0.7;
    // Rounded blocks: the corners knocked off.
    if (round && (u === 1 || u === bw - 1) && (v === 1 || v === bh - 1)) {
      f.L.px(x, y, ramp[1]);
      return;
    }
    if (h2(x, y, seed + 7) < 0.05) k -= 1.3;
    f.L.px(x, y, rkd(ramp, k, x, y));
  });
}

/** Moss over the band, thick in patches, spilling a little off its edges (in onto the paper and out past it). */
function moss(f: F, seed: number, amount: number): void {
  const MOSS = LEAF.slice(1, 9);
  const on = (x: number, y: number): boolean => {
    const dl = x - f.x0;
    const dr = f.x1 - x;
    const dt = y - f.y0;
    const db = f.y1 - y;
    const d = Math.min(dl, dr, dt, db);
    const n = vnoise(x, y, 7, 5, seed) * 0.7 + vnoise(x, y, 3, 3, seed + 1) * 0.3;
    // Thicker on top of things (the top band, the tops of the side bands) and at the corners.
    const cornerish = Math.min(dl, dr) < 14 && Math.min(dt, db) < 14 ? 0.12 : 0;
    const top = dt < f.B ? 0.08 : 0;
    const t = 1 - amount - cornerish - top;
    if (d >= 0 && d < f.B) return n > t;
    // Off the band: only the thickest patches spill, a pixel or three.
    if (d >= f.B && d < f.B + 3) return n > t + 0.12 + (d - f.B) * 0.06;
    if (d < 0 && d >= -2) return n > t + 0.16 - d * 0.05;
    return false;
  };
  for (let y = f.y0 - 3; y <= f.y1 + 3; y++) {
    for (let x = f.x0 - 3; x <= f.x1 + 3; x++) {
      if (!on(x, y)) continue;
      // Lit where nothing's above it (its top edge), darker underneath.
      const above = on(x, y - 1);
      const below = on(x, y + 1);
      let k = 3.4 + (above ? 0 : 2.2) - (below ? 0 : 1.2) + (h2(x, y, seed + 3) - 0.5) * 1.2;
      if (h2(x, y, seed + 4) < 0.06) k += 2;
      f.L.px(x, y, rk(MOSS, k));
    }
  }
}

/** A trailing vine from (x, y): wanders `len` pixels along (dx, dy), a leaf every few pixels, to alternate sides. */
function vine(f: F, x: number, y: number, dx: number, dy: number, len: number, seed: number): void {
  let px = x;
  let py = y;
  for (let i = 0; i < len; i++) {
    const wob = Math.round(Math.sin(i * 0.45 + seed) * 1.2);
    const cx = Math.round(px + (dy !== 0 ? wob : 0));
    const cy = Math.round(py + (dx !== 0 ? wob : 0));
    f.L.px(cx, cy, rk(LEAF, 2));
    if (i % 3 === 1) {
      const side = (i / 3) % 2 < 1 ? 1 : -1;
      const lx = cx + (dy !== 0 ? side : 0);
      const ly = cy + (dx !== 0 ? side : 0);
      f.L.px(lx, ly, rk(LEAF, 6));
      f.L.px(lx + (dy !== 0 ? side : dx), ly + (dx !== 0 ? side : dy), rk(LEAF, 4.6));
      if (h2(i, 2, seed) < 0.5) f.L.px(lx + (dx !== 0 ? dx : 0), ly + (dy !== 0 ? dy : 0), rk(LEAF, 7.5));
    }
    px += dx;
    py += dy;
  }
}

/** A flower: `n` petals round a centre, each `r` long, a ramp from shade to light. */
function flower(L: Layer, cx: number, cy: number, n: number, r: number, ramp: Ramp, centre: string, turn = 0): void {
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let t = 0.6; t <= r; t += 0.5) {
      const w = Math.max(0, Math.round((1 - t / (r + 0.6)) * r * 0.45));
      for (let s = -w; s <= w; s++) {
        const x = Math.round(cx + ca * t - sa * s);
        const y = Math.round(cy + sa * t + ca * s);
        const lit = -ca * 0.6 - sa * 0.8;
        L.px(x, y, rk(ramp, ramp.length * 0.45 + lit * 1.2 + (t / r) * 1.4 - Math.abs(s) * 0.3));
      }
    }
  }
  L.px(cx, cy, centre);
  L.px(cx + 1, cy, mixHex(centre, '#000000', 0.3));
  L.px(cx, cy + 1, mixHex(centre, '#000000', 0.3));
}

/** A little mushroom standing at (x, foot). */
function mushroom(L: Layer, x: number, foot: number, h: number, cap: Ramp): void {
  for (let y = foot - h + 2; y <= foot; y++) L.px(x, y, y === foot ? '#8a7a64' : '#e8dcc0');
  const w = h > 4 ? 2 : 1;
  for (let dx = -w; dx <= w; dx++) {
    L.px(x + dx, foot - h + 1, rk(cap, 1.5 - dx * 0.4));
    if (Math.abs(dx) < w || w === 1) L.px(x + dx, foot - h, rk(cap, 3 - dx * 0.5));
  }
  L.px(x - w, foot - h + 2, rk(cap, 0.6));
  L.px(x + w, foot - h + 2, rk(cap, 0.3));
  if (w > 1) L.px(x - 1, foot - h, '#fff4e0');
}

/** Gold piping: a line of gold along the band at distance `d` in from the outside, lit on the top and left. */
function piping(f: F, d: number, ramp: Ramp = GOLD): void {
  eachBand(f, (x, y, dd, side) => {
    if (dd !== d) return;
    f.L.px(x, y, rk(ramp, side === 'top' || side === 'left' ? 5.4 : 3.6));
  });
}

/** Wood laid along each side of the band, mitred at the corners, its grain running along it. */
function woodBand(f: F, ramp: Ramp, seed: number): void {
  eachBand(f, (x, y, d, side, along) => {
    const g = vnoise(along * 0.35, d * 2.4, 2, 1, seed + (side === 'top' ? 0 : side === 'bottom' ? 1 : side === 'left' ? 2 : 3) * 17);
    let k = ramp.length * 0.5 + (g - 0.5) * 2.4;
    if (d === 1) k += side === 'top' || side === 'left' ? 1.8 : 0.4;
    if (d === f.B - 2) k -= 1.2;
    // The mitre: a dark seam where two sides meet.
    const dl = x - f.x0;
    const dr = f.x1 - x;
    const dt = y - f.y0;
    const db = f.y1 - y;
    if (Math.min(dl, dr) === Math.min(dt, db) && Math.min(dl, dr) < f.B) k = 0.5;
    f.L.px(x, y, rkd(ramp, k, x, y));
  });
}

/** A rivet: a bright head, a dark rim below and right. */
function rivet(L: Layer, x: number, y: number, ramp: Ramp = IRON): void {
  L.px(x, y, rk(ramp, ramp.length - 1));
  L.px(x + 1, y, rk(ramp, ramp.length * 0.55));
  L.px(x, y + 1, rk(ramp, ramp.length * 0.45));
  L.px(x + 1, y + 1, rk(ramp, 1));
}

/** A small four-point star. */
function star(L: Layer, x: number, y: number, c: string, glow = true): void {
  const put = glow ? (a: number, b: number, col: string) => L.gl(a, b, col) : (a: number, b: number, col: string) => L.px(a, b, col);
  put(x, y, '#ffffff');
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + a, y + b, c);
}

/** A flame on (x, y): a few pixels of fire and a pool of light. */
function flame(L: Layer, x: number, y: number, light = 0.5): void {
  L.gl(x, y, EMBER[4]);
  L.gl(x, y - 1, EMBER[5]);
  L.gl(x, y - 2, EMBER[3]);
  L.gl(x - 1, y, EMBER[2]);
  L.gl(x + 1, y, EMBER[2]);
  L.gl(x, y + 1, EMBER[2]);
  L.halo(x, y - 3, EMBER[4], 0.5);
  L.light(x, y - 1, 26, '#ffb060', light, 0.3);
}

// ------------------------------------------------------------------ the keepers

const VIOLET: Ramp = ['#12061e', '#1e0a32', '#2c1048', '#3c1a62', '#4e267c', '#623496', '#7a46b0'];
const SAGESTONE: Ramp = ['#141c1a', '#1e2a26', '#2a3833', '#364740', '#43564e', '#52675d', '#64796d', '#7a8e80'];
const DUNGEON: Ramp = ['#0e1016', '#171a22', '#22262f', '#2d323d', '#3a404d', '#494f5e', '#5a6172', '#6e7588'];
const MARBLE: Ramp = ['#6e5e5c', '#8a7876', '#a4928e', '#bcaaa4', '#d2c2ba', '#e4d8ce', '#f4ece2'];
const MAHOGANY: Ramp = ['#1a0806', '#2c0e0a', '#401610', '#561e14', '#6c281a', '#843422', '#9c422c', '#b4563a'];
const CORK: Ramp = ['#6a4a2a', '#8a6438', '#a67c48', '#bc925a', '#cea66c'];
const ROSE: Ramp = ['#5a0a1e', '#8e1430', '#c42446', '#e84a64', '#ff7a8a', '#ffb0b8'];
const LILY: Ramp = ['#7a2a4a', '#a8406a', '#d0608a', '#ec8aa8', '#ffb6c8', '#ffe2ea'];
const ORANGE_FL: Ramp = ['#8a3a10', '#c45a18', '#ee8a2c', '#ffb04a', '#ffd880'];
const COPPER: Ramp = ['#3a160a', '#5e2610', '#8a3a18', '#b45428', '#d8753c', '#f09a5a', '#ffc08a'];
const RED_CAP: Ramp = ['#5a1010', '#8a1c1a', '#c43028', '#e85a40'];
const BROWN_CAP: Ramp = ['#3a2010', '#5e3a1c', '#8a5a2c', '#b8823e'];

type Painter = (f: F) => void;

const FRAMES: Partial<Record<StationId, Painter>> = {
  // ---------------------------------------------------------------- the Oracle
  altar: (f) => {
    // Velvet, folded softly along the band, piped in gold.
    eachBand(f, (x, y, _d, side, along) => {
      const fold = Math.sin(along * 0.55 + (side === 'left' || side === 'right' ? 1.3 : 0));
      f.L.px(x, y, rkd(VIOLET, 3 + fold * 0.9 + (vnoise(x, y, 4, 4, f.seed) - 0.5) * 0.6, x, y));
    });
    piping(f, 1);
    piping(f, f.B - 2);
    inkEdges(f, '#0a0414');
    // The plaque: a strip of night sky, stars and two little constellations in it.
    const NIGHT: Ramp = ['#070418', '#0c0828', '#140e3a', '#1e164e', '#2a2064'];
    plaque(f, '#0a0414', (x, y, _u, v) => rkd(NIGHT, 1 + v * 0.45 + (vnoise(x, y, 9, 4, f.seed) - 0.5) * 1.2, x, y));
    for (let x = f.px0 + 2; x < f.px1 - 1; x++) {
      for (let y = f.py0; y < f.py1; y++) {
        const r = h2(x, y, f.seed + 2);
        if (r < 0.035 && Math.abs(x - f.cx) > 9) f.L.gl(x, y, r < 0.012 ? '#ffffff' : r < 0.024 ? '#c8b8ff' : '#ffe8a0');
      }
    }
    for (const dir of [-1, 1]) {
      // A constellation: stars joined by faint gold lines.
      const pts: Array<[number, number]> = [[14, 3], [19, 1], [25, 3], [30, 1], [36, 2]];
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        for (let t = 1; t < bx - ax; t++) if (t % 2) f.L.px(f.cx + dir * (ax + t), f.py0 + Math.round(ay + ((by - ay) * t) / (bx - ax)), '#6a5a2a');
      }
      for (const [ax, ay] of pts) if (f.cx + dir * ax > f.px0 + 2 && f.cx + dir * ax < f.px1 - 2) star(f.L, f.cx + dir * ax, f.py0 + ay, GOLD[5]);
      // A crescent moon further out.
      const mx = f.cx + dir * Math.min(46, Math.round((f.px1 - f.px0) / 2) - 8);
      oval(f.L, mx, f.py0 + 2, 2.6, 2.6, (x, y) => {
        if (Math.hypot(x + 0.5 - (mx + dir * 1.4), y + 0.5 - (f.py0 + 1.2)) < 2.2) return null;
        f.L.gl(x, y, '#fffbe8');
        return null;
      });
    }
    // The orb in the middle on its gold mount, a crescent of gold cradling it.
    crystalOrb(f.L, f.cx, f.py1 - 1, 4, '#9a6af0');
    for (let a = 0.15; a < Math.PI - 0.15; a += 0.12) {
      const x = Math.round(f.cx + Math.cos(a) * 7.4);
      const y = Math.round(f.py1 - 5 + Math.sin(a) * 5 - 5);
      if (y >= f.y0 - 3) f.L.px(x, y + 5, rk(GOLD, 5 - Math.sin(a)));
    }
    // Gold corner pieces with a star each.
    for (const [cx, cy, sx, sy] of corners(f)) {
      for (let v = 0; v < 7; v++) {
        for (let u = 0; u < 7; u++) {
          const r = Math.hypot(u - 0.5, v - 0.5);
          if (r > 6.6) continue;
          f.L.px(cx + sx * u, cy + sy * v, r > 5.5 ? '#2a1404' : rk(GOLD, 4.8 - (u + v) * 0.12 - (r > 4.4 ? 1 : 0)));
        }
      }
      star(f.L, cx + sx * 2, cy + sy * 2, '#d8b0ff');
    }
    for (const side of ['left', 'right'] as const) for (const at of spots(f, side, 24, 26)) star(f.L, side === 'left' ? f.x0 + 2 : f.x1 - 2, f.y0 + at, GOLD[5], false);
    for (const at of spots(f, 'bottom', 20, 14)) star(f.L, f.x0 + at, f.y1 - 2, GOLD[5], false);
  },

  // ---------------------------------------------------------------- the tinker
  upgrades: (f) => {
    // Brass plates, a seam and rivets every so often.
    eachBand(f, (x, y, d, side, along) => {
      let k = 4 + (vnoise(x, y, 6, 2, f.seed) - 0.5) * 0.8;
      if (d === 1) k += side === 'top' || side === 'left' ? 1.6 : 0.6;
      if (d === f.B - 2) k -= 1.4;
      if ((along - 9) % 22 === 0 && along > 8) k = 1.2;
      f.L.px(x, y, rkd(BRASS, k, x, y));
    });
    inkEdges(f, '#1c0d02');
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const len = side === 'top' || side === 'bottom' ? f.x1 - f.x0 : f.y1 - f.y0;
      for (let a = 9; a < len - 8; a += 22) {
        const at = a - 3;
        const [x, y] = side === 'top' ? [f.x0 + at, f.y0 + 1] : side === 'bottom' ? [f.x0 + at, f.y1 - 2] : side === 'left' ? [f.x0 + 1, f.y0 + at] : [f.x1 - 2, f.y0 + at];
        rivet(f.L, x, y, BRASS);
      }
    }
    // The plaque: a dark slate control board.
    const SLATE: Ramp = ['#10141a', '#182028', '#222c36', '#2e3a46', '#3c4a58'];
    plaque(f, '#1c0d02', (x, y, _u, v) => rkd(SLATE, 2 + (v === 0 ? 1.4 : 0) + (h2(x, y, f.seed) < 0.06 ? -1 : 0), x, y));
    // A pressure gauge in the middle: a cream dial in a brass ring, ticks, a red needle.
    oval(f.L, f.cx, f.py0 + 2, 5.4, 5.4, (_x, _y, nx, ny) => {
      const r = Math.hypot(nx, ny);
      if (r > 0.8) return rk(BRASS, 4.4 - nx * 1.2 - ny * 1.4);
      return r > 0.68 ? '#1c0d02' : '#f4e8cc';
    });
    for (const a of [-2.6, -2.1, -1.57, -1.0, -0.5]) f.L.px(Math.round(f.cx + Math.cos(a) * 3), Math.round(f.py0 + 2 + Math.sin(a) * 3), '#5a4632');
    for (let t = 0; t <= 3; t++) f.L.px(f.cx + t, f.py0 + 2 - Math.round(t * 0.7), '#d8262a');
    f.L.px(f.cx, f.py0 + 2, '#1c0d02');
    // Lamps either side of it (green, amber, red), glowing; a row of little levers; a copper pipe along the lip.
    for (const dir of [-1, 1]) {
      ['#5af08a', '#ffc04a', '#ff5a4a'].forEach((c, i) => {
        const x = f.cx + dir * (10 + i * 4);
        f.L.px(x, f.py0 + 1, '#0a0c10');
        f.L.gl(x, f.py0 + 2, c);
        f.L.px(x, f.py0 + 3, mixHex(c, '#000000', 0.5));
      });
      for (let i = 0; i < 3; i++) {
        const x = f.cx + dir * (26 + i * 4);
        if (x < f.px0 + 10 || x > f.px1 - 10) continue;
        f.L.px(x, f.py0 + 3, rk(IRON, 2));
        f.L.px(x, f.py0 + 2, rk(IRON, 4));
        f.L.px(x + (i % 2 ? 1 : -1), f.py0 + 1, rk(IRON, 5));
        f.L.px(x + (i % 2 ? 1 : -1), f.py0, '#d8262a');
      }
    }
    for (let x = f.px0 + 1; x < f.px1; x++) {
      if (Math.abs(x - f.cx) < 7) continue;
      f.L.px(x, f.py1 - 2, rk(COPPER, 5));
      f.L.px(x, f.py1 - 1, rk(COPPER, 3));
      if ((x - f.x0) % 14 === 0) for (let k = -3; k <= -1; k++) f.L.px(x, f.py1 + k, rk(COPPER, k === -3 ? 6 : 1.4));
    }
    // Gears meshing at the plaque's ends, and at the foot's corners.
    gear(f.L, f.x0 + 5, f.y0 + 5, 6, 9, { ramp: BRASS, turn: 0.1 });
    gear(f.L, f.x0 + 13, f.y0 + 8, 3, 6, { ramp: IRON, turn: 0.3 });
    gear(f.L, f.x1 - 5, f.y0 + 5, 6, 9, { ramp: BRASS, turn: 0.5 });
    gear(f.L, f.x1 - 13, f.y0 + 8, 3, 6, { ramp: IRON });
    gear(f.L, f.x0 + 2, f.y1 - 2, 4, 7, { ramp: IRON, turn: 0.2 });
    gear(f.L, f.x1 - 2, f.y1 - 2, 4, 7, { ramp: BRASS, turn: 0.4 });
  },

  // ---------------------------------------------------------------- the sage
  perks: (f) => {
    stoneBand(f, SAGESTONE, f.seed, true);
    inkEdges(f, '#0a100e');
    // The plaque: a course of bigger stones.
    plaque(f, '#0a100e', (x, y, u, v) => {
      const bw = 13;
      const ix = (u + 5) % bw;
      if (ix === 0) return SAGESTONE[0];
      let k = 3.6 + (h2(Math.floor((u + 5) / bw), 2, f.seed) - 0.5) * 1.6 + (vnoise(x, y, 3, 3, f.seed) - 0.5);
      if (v === 0) k += 1.2;
      if (ix === 1) k += 0.5;
      if (ix === bw - 1) k -= 0.8;
      return rkd(SAGESTONE, k, x, y);
    });
    moss(f, f.seed + 5, 0.44);
    // Moss over the plaque too, thick toward its ends.
    const MOSS = LEAF.slice(1, 9);
    for (let x = f.px0; x <= f.px1; x++) {
      for (let y = f.py0; y < f.py1 + 2; y++) {
        const far = Math.abs(x - f.cx) / Math.max(1, (f.px1 - f.px0) / 2);
        const n = vnoise(x, y, 7, 4, f.seed + 9) * 0.7 + vnoise(x, y, 3, 2, f.seed + 10) * 0.3;
        const t = 0.62 - far * 0.2 + (y >= f.py1 ? 0.14 : 0);
        if (n < t || Math.abs(x - f.cx) < 6) continue;
        const above = vnoise(x, y - 1, 7, 4, f.seed + 9) * 0.7 + vnoise(x, y - 1, 3, 2, f.seed + 10) * 0.3 >= t;
        f.L.px(x, y, rk(MOSS, 3.4 + (above ? 0 : 2.2) + (h2(x, y, f.seed + 3) - 0.5) * 1.4));
      }
    }
    // Ivy hanging a little way off the plaque's lip, and down the sides.
    for (const at of [0.12, 0.27, 0.7, 0.88]) {
      const x = f.px0 + Math.round((f.px1 - f.px0) * at);
      vine(f, x, f.py1, 0, 1, 2 + Math.floor(h2(Math.round(at * 100), 1, f.seed) * 3), f.seed + x);
    }
    vine(f, f.x0 + f.B - 2, f.py1 + 4, 0, 1, Math.round((f.y1 - f.y0) * 0.28), f.seed + 2);
    vine(f, f.x1 - f.B + 2, f.py1 + 8, 0, 1, Math.round((f.y1 - f.y0) * 0.2), f.seed + 3);
    // Flowers: a lily to the right, orange ones, white blossom; mushrooms on the lip to the left.
    const half = Math.round((f.px1 - f.px0) / 2);
    flower(f.L, f.cx + Math.min(half - 9, 42), f.py0 + 2, 5, 4.6, LILY, '#ffe070', 0.3);
    flower(f.L, f.cx + Math.min(half - 22, 24), f.py0 + 1, 4, 2.4, ORANGE_FL, '#8a2a10', 0.8);
    flower(f.L, f.cx - Math.min(half - 26, 20), f.py0 + 2, 4, 2.4, ORANGE_FL, '#8a2a10', 0.2);
    flower(f.L, f.x0 + 2, f.y0 + Math.round((f.y1 - f.y0) * 0.55), 4, 2.2, ORANGE_FL, '#8a2a10', 0.5);
    flower(f.L, f.x1 - 2, f.y1 - Math.round((f.y1 - f.y0) * 0.3), 5, 2, ['#5a5a8a', '#8a8ac4', '#c8c8f0', '#ffffff'], '#ffe070');
    mushroom(f.L, f.cx - Math.min(half - 10, 38), f.py1 - 1, 5, RED_CAP);
    mushroom(f.L, f.cx - Math.min(half - 14, 34), f.py1 - 1, 3, BROWN_CAP);
    mushroom(f.L, f.cx - Math.min(half - 6, 43), f.py1 - 1, 3, BROWN_CAP);
    for (let i = 0; i < 12; i++) {
      const x = f.px0 + 3 + Math.floor(h2(i, 7, f.seed) * (f.px1 - f.px0 - 6));
      if (Math.abs(x - f.cx) > 7) f.L.px(x, f.py0 + Math.floor(h2(i, 8, f.seed) * 5), i % 2 ? '#fff6e0' : '#ffe0f0');
    }
    // The sigil stone in the middle, its rune glowing.
    for (let y = f.y0 - 2; y <= f.py1 - 1; y++) {
      const halfW = y < f.y0 + 1 ? 2 : 3;
      for (let dx = -halfW; dx <= halfW; dx++) f.L.px(f.cx + dx, y, Math.abs(dx) === halfW || y === f.y0 - 2 ? '#0a100e' : rk(SAGESTONE, 5 - dx * 0.5 - (y - f.y0) * 0.12));
    }
    for (const [a, b] of [[0, 1], [0, 2], [-1, 3], [1, 3], [0, 4], [0, 5], [-1, 6], [1, 6], [0, 7]]) f.L.gl(f.cx + a, f.y0 + b, '#7af0e0');
    f.L.light(f.cx, f.y0 + 4, 30, '#7af0e0', 0.45, 0.2);
    // Teal sparks of the sigils along the frame, a few in the moss.
    for (let i = 0; i < Math.round((f.x1 - f.x0 + f.y1 - f.y0) / 12); i++) {
      const [x, y] = edgePoint(f, h2(i, 11, f.seed), Math.floor(h2(i, 12, f.seed) * (f.B + 1)));
      mote(f.L, x, y, i % 3 ? '#5ae8e0' : '#a8fff8');
    }
    // Grass in the cracks along the foot.
    for (let x = f.x0 + 10; x < f.x1 - 10; x += 8 + Math.floor(h2(x, 1, f.seed) * 8)) {
      f.L.px(x, f.y1 - f.B, rk(LEAF, 6));
      f.L.px(x + 1, f.y1 - f.B + 1, rk(LEAF, 5));
    }
  },

  // ---------------------------------------------------------------- the priestess
  rebirth: (f) => {
    // Marble, veined; gold on its inner edge.
    const marble = (x: number, y: number, lit: number) => {
      const vein = Math.abs(vnoise(x, y, 9, 5, f.seed) - 0.5) < 0.035;
      return rkd(MARBLE, 3.8 + lit + (vnoise(x, y, 5, 5, f.seed + 1) - 0.5) * 1.2 - (vein ? 1.8 : 0), x, y);
    };
    eachBand(f, (x, y, d, side) => f.L.px(x, y, marble(x, y, d === 1 ? (side === 'top' || side === 'left' ? 1.6 : 0.4) : d === f.B - 2 ? -1 : 0)));
    piping(f, f.B - 2);
    inkEdges(f, '#3a2a1c');
    // The plaque: a recess in the marble, shaded, a laurel of gold leaves along its top.
    plaque(f, '#3a2a1c', (x, y, _u, v) => marble(x, y, v === 0 ? -3.2 : -2.2));
    for (let x = f.px0 + 3; x < f.px1 - 2; x += 3) {
      if (Math.abs(x - f.cx) < 9) continue;
      const dir = x < f.cx ? 1 : -1;
      f.L.px(x, f.py0, rk(GOLD, 5));
      f.L.px(x + dir, f.py0 + 1, rk(GOLD, 3.4));
    }
    // The rising sun in the middle, rose gold, its rays fanning up over the frame.
    const sy = f.py1 - 1;
    const ROSEG = ['#6a2a3a', '#a84a5a', '#e07a7a', '#ffb0a0', '#ffd8c0', '#fff4e8'];
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (Math.PI * (i + 0.5)) / 9;
      for (let d = 6; d < (i % 2 ? 9 : 11); d++) f.L.px(f.cx + Math.round(Math.cos(a) * d), sy + Math.round(Math.sin(a) * d), rk(ROSEG, 3.6 - (d - 6) * 0.4));
    }
    oval(f.L, f.cx, sy, 5, 5, (_x, y, nx, ny) => {
      if (y > sy) return null;
      const r = Math.hypot(nx, ny);
      if (r > 0.82) return '#6a2a3a';
      // (Painted, not glowing: a glow this size would bleach the marble round it.)
      return rk(['#c4605a', '#e88a70', '#ffb48a', '#ffd8a8', '#fff0c8'], 3.2 - nx * 0.9 - ny * 1.6 - r);
    });
    f.L.gl(f.cx - 1, sy - 3, '#fff8e0');
    // Candles standing in the recess to each side, and rose garlands swagged between them and the sun.
    for (const dir of [-1, 1]) {
      const half = Math.round((f.px1 - f.px0) / 2);
      const c1 = f.cx + dir * Math.min(half - 5, 44);
      candle(f.L, c1, f.py1 - 1, 4, { light: 0.08 });
      candle(f.L, c1 - dir * 4, f.py1 - 1, 3, { light: 0.05 });
      const g0 = f.cx + dir * 11;
      const g1 = c1 - dir * 8;
      const n = Math.abs(g1 - g0);
      for (let t = 0; t <= n; t++) {
        const x = g0 + dir * t;
        const y = f.py0 + 1 + Math.round(Math.sin((t / Math.max(1, n)) * Math.PI) * 2);
        f.L.px(x, y, rk(LEAF, t % 2 ? 5 : 3.6));
        if (t % 5 === 2) rose(f.L, x, y, 1.4);
      }
    }
    // Roses climbing the sides from the foot; petals fallen along it.
    for (const sxn of [-1, 1] as const) {
      const bx = sxn < 0 ? f.x0 + 2 : f.x1 - 2;
      const len = Math.round((f.y1 - f.y0) * 0.34);
      vine(f, bx, f.y1 - 2, 0, -1, len, f.seed + (sxn < 0 ? 4 : 5));
      for (const dy of [-4, -13, -22, -32]) if (-dy < len) rose(f.L, bx, f.y1 + dy, dy % 2 ? 1.8 : 2.2);
    }
    for (let i = 0; i < 9; i++) f.L.px(f.x0 + 10 + Math.floor(h2(i, 1, f.seed) * (f.x1 - f.x0 - 20)), f.y1 - 1 - Math.floor(h2(i, 2, f.seed) * 3), i % 2 ? ROSE[4] : ROSE[3]);
  },

  // ---------------------------------------------------------------- the notice board
  quests: (f) => {
    woodBand(f, PLANK, f.seed);
    inkEdges(f, '#1c0e06');
    for (const [cx, cy, sx, sy] of corners(f)) rivet(f.L, cx + sx * 1 - (sx < 0 ? 1 : 0), cy + sy * 1 - (sy < 0 ? 1 : 0));
    // The plaque: cork, notes pinned along it side by side.
    plaque(f, '#1c0e06', (x, y) => {
      const r = h2(x, y, f.seed + 3);
      return rk(CORK, 2.2 + (r < 0.22 ? -1.2 : r > 0.82 ? 1.2 : 0));
    });
    const pins: Array<[number, number]> = [];
    const PIN = ['#d82a2a', '#2a6ad8', '#e8b020', '#3a9a3a', '#b04ad8'];
    let x = f.px0 + 3;
    let i = 0;
    while (x < f.px1 - 8) {
      const w = 6 + Math.floor(h2(i, 1, f.seed) * 5);
      const tilt = h2(i, 2, f.seed) < 0.5 ? 0 : 1;
      if (Math.abs(x + w / 2 - f.cx) > 8) {
        for (let yy = f.py0 + tilt; yy < f.py1 - 1 + tilt && yy < f.py1; yy++) {
          for (let xx = x; xx < x + w; xx++) {
            const edge = xx === x + w - 1 || yy === f.py1 - 1;
            f.L.px(xx, yy, edge ? '#b89a6a' : rk(['#d8c49a', '#ecdcb6', '#f8eed4'], 1.4 + (i % 3) * 0.4));
            if (!edge && (yy - f.py0) % 2 === 1 && xx > x && xx < x + w - 2 && h2(xx, yy, 9 + i) < 0.7) f.L.px(xx, yy, '#8a6a4a');
          }
        }
        const px = x + Math.floor(w / 2);
        const pin = PIN[i % PIN.length];
        f.L.px(px, f.py0 + tilt, pin);
        f.L.px(px, f.py0 + tilt - 1, mixHex(pin, '#ffffff', 0.45));
        f.L.px(px + 1, f.py0 + tilt, mixHex(pin, '#000000', 0.4));
        pins.push([px, f.py0 + tilt - 1]);
      }
      x += w + 2;
      i++;
    }
    // A red string from pin to pin, sagging.
    for (let k = 0; k + 1 < pins.length; k += 2) {
      const [a, b] = [pins[k], pins[k + 1]];
      if (Math.abs((a[0] + b[0]) / 2 - f.cx) < 12) continue;
      for (let xx = a[0] + 1; xx < b[0]; xx++) {
        const t = (xx - a[0]) / Math.max(1, b[0] - a[0]);
        f.L.px(xx, Math.round(a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * 2.4) + 1, '#c42a2a');
      }
    }
    // The gold "!" in the middle, on a dark plate, like the board in the court.
    for (let y = f.y0 + 1; y <= f.py1 - 1; y++) for (let dx = -4; dx <= 4; dx++) f.L.px(f.cx + dx, y, Math.abs(dx) === 4 || y === f.y0 + 1 ? '#1c0e06' : '#3a2010');
    for (let y = f.y0 + 3; y <= f.py1 - 5; y++) {
      f.L.gl(f.cx, y, '#ffd84a');
      f.L.gl(f.cx - 1, y, '#ffe88a');
      f.L.px(f.cx + 1, y, '#b8862a');
    }
    f.L.gl(f.cx, f.py1 - 3, '#ffd84a');
    f.L.gl(f.cx - 1, f.py1 - 3, '#ffe88a');
    f.L.px(f.cx + 1, f.py1 - 3, '#b8862a');
    f.L.light(f.cx, f.y0 + 5, 22, '#ffd84a', 0.3);
    // Tacks and scraps of torn paper down the sides.
    for (const side of ['left', 'right'] as const) {
      for (const at of spots(f, side, 30, 26)) {
        const tx = side === 'left' ? f.x0 + 2 : f.x1 - 2;
        f.L.px(tx, f.y0 + at, '#e8e0d0');
        f.L.px(tx, f.y0 + at + 1, '#8a8478');
      }
    }
  },

  // ---------------------------------------------------------------- the warden
  gate: (f) => {
    stoneBand(f, DUNGEON, f.seed, true);
    inkEdges(f, '#06070a');
    // The plaque: a recess of darker stone.
    plaque(f, '#06070a', (x, y, u, v) => {
      const bw = 11;
      const ix = (u + 3) % bw;
      if (ix === 0) return DUNGEON[0];
      return rkd(DUNGEON, 2.2 + (h2(Math.floor((u + 3) / bw), 5, f.seed) - 0.5) * 1.2 + (v === 0 ? -0.8 : 0) + (ix === 1 ? 0.5 : 0), x, y);
    });
    moss(f, f.seed + 9, 0.24);
    // Iron brackets bolted over the corners.
    for (const [cx, cy, sx, sy] of corners(f)) {
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 2; j++) {
          f.L.px(cx + sx * i, cy + sy * j, rk(IRON, 4 - j * 1.2 - i * 0.06));
          f.L.px(cx + sx * j, cy + sy * i, rk(IRON, 4 - j * 1.2 - i * 0.06));
        }
      }
      rivet(f.L, cx + sx * 6 - (sx < 0 ? 1 : 0), cy + (sy < 0 ? -1 : 0));
      rivet(f.L, cx + (sx < 0 ? -1 : 0), cy + sy * 6 - (sy < 0 ? 1 : 0));
    }
    // A chain swagged across the recess each side of the shield, link by link.
    const half = Math.round((f.px1 - f.px0) / 2);
    for (const dir of [-1, 1]) {
      const a = f.cx + dir * 8;
      const b = f.cx + dir * (half - 9);
      const n = Math.abs(b - a);
      for (let t = 0; t <= n; t++) {
        const x = a + dir * t;
        const y = f.py0 + Math.round(Math.sin((t / Math.max(1, n)) * Math.PI) * 3);
        if (t % 3 === 0) {
          f.L.px(x, y, rk(IRON, 6));
          f.L.px(x, y + 1, rk(IRON, 3));
        } else f.L.px(x, y + (t % 3 === 1 ? 0 : 1), rk(IRON, 4.4));
      }
      // A torch at the end of the recess, burning.
      const tx = f.cx + dir * (half - 5);
      for (let y = f.py0 + 2; y <= f.py1 - 1; y++) f.L.px(tx, y, rk(['#2a160a', '#4a2a14', '#6a3e1e'], 2 - (y - f.py0) * 0.2));
      f.L.px(tx - 1, f.py0 + 2, rk(IRON, 5));
      f.L.px(tx + 1, f.py0 + 2, rk(IRON, 3));
      flame(f.L, tx, f.py0, 0.55);
    }
    // His shield in the middle: iron, a gold portcullis on it.
    const top = f.y0 - 1;
    const bot = f.py1 + 1;
    for (let y = top; y <= bot; y++) {
      const t = (y - top) / (bot - top);
      const hw = Math.round(5 * (t < 0.55 ? 1 : 1 - (t - 0.55) / 0.5));
      for (let dx = -hw; dx <= hw; dx++) f.L.px(f.cx + dx, y, Math.abs(dx) === hw || y === top || y === bot ? '#06070a' : rk(IRON, 4.6 - dx * 0.3 - t * 1.2));
    }
    for (let y = top + 2; y <= top + 8; y++) for (const dx of [-2, 0, 2]) f.L.px(f.cx + dx, y, rk(GOLD, 4.6));
    for (const yy of [top + 3, top + 6]) for (let dx = -3; dx <= 3; dx++) f.L.px(f.cx + dx, yy, rk(GOLD, 5.4));
    // Grass in the cracks along the foot.
    for (let x = f.x0 + 12; x < f.x1 - 12; x += 9 + Math.floor(h2(x, 1, f.seed) * 9)) {
      f.L.px(x, f.y1 - f.B, rk(LEAF, 6));
      f.L.px(x + 1, f.y1 - f.B + 1, rk(LEAF, 5));
      f.L.px(x - 1, f.y1 - f.B + 1, rk(LEAF, 4));
    }
  },

  // ---------------------------------------------------------------- the broker
  scrap: (f) => {
    woodBand(f, MAHOGANY, f.seed);
    piping(f, f.B - 2, BRASS);
    inkEdges(f, '#0e0402');
    // The plaque: his counter's green baize.
    const BAIZE: Ramp = ['#06180e', '#0a2616', '#103620', '#18482c', '#225c3a'];
    plaque(f, '#0e0402', (x, y, _u, v) => rkd(BAIZE, 2.2 + (v === 0 ? -1 : 0) + (h2(x, y, f.seed) < 0.08 ? 0.9 : 0), x, y));
    // Brass caps on the corners; a coin let into the wood along the sides and the foot.
    for (const [cx, cy, sx, sy] of corners(f)) {
      for (let v = 0; v < 7; v++) for (let u = 0; u < 7 - v; u++) f.L.px(cx + sx * u, cy + sy * v, u + v === 6 ? '#2a1404' : u === 0 || v === 0 ? rk(BRASS, 5.6) : rk(BRASS, 4.4 - (u + v) * 0.14));
      rivet(f.L, cx + sx * 2 - (sx < 0 ? 1 : 0), cy + sy * 2 - (sy < 0 ? 1 : 0), BRASS);
    }
    for (const side of ['bottom', 'left', 'right'] as const) {
      for (const at of spots(f, side, 24, side === 'bottom' ? 14 : 28)) {
        const [x, y] = side === 'bottom' ? [f.x0 + at, f.y1 - 2] : side === 'left' ? [f.x0 + 2, f.y0 + at] : [f.x1 - 2, f.y0 + at];
        oval(f.L, x, y, 1.6, 1.6, (_x, _y, nx, ny) => rk(GOLD, 4.6 - nx - ny * 1.2));
      }
    }
    // On the baize: stacks of coins, a purse, a few gems; his balance in the middle.
    const half = Math.round((f.px1 - f.px0) / 2);
    const foot = f.py1 - 1;
    for (const dir of [-1, 1]) {
      for (const [dx, n] of [[13, 2], [18, 3], [23, 1], [34, 3], [39, 2]] as const) {
        if (dx > half - 6) continue;
        const x = f.cx + dir * dx;
        for (let s = 0; s < n; s++) {
          for (let k = -2; k <= 1; k++) {
            f.L.px(x + k, foot - s * 2, rk(GOLD, 3 - k * 0.4));
            f.L.px(x + k, foot - s * 2 - 1, rk(GOLD, 5.4 - Math.abs(k) * 0.5));
          }
        }
      }
    }
    const bx = f.cx - Math.min(half - 6, 29);
    oval(f.L, bx, foot - 2, 3.2, 2.8, (_x, _y, nx, ny) => rk(['#3a1808', '#5e2a10', '#8a4018', '#b05a24', '#cc7a3a'], 2.4 - nx * 0.8 - ny * 1.1));
    for (let dx = -1; dx <= 1; dx++) f.L.px(bx + dx, foot - 5, rk(GOLD, 5));
    f.L.px(bx - 1, foot - 6, '#8a4018');
    f.L.px(bx + 1, foot - 6, '#b05a24');
    f.L.gl(f.cx + Math.min(half - 6, 29), foot, '#ff4a6a');
    f.L.gl(f.cx + Math.min(half - 6, 29), foot - 1, '#ffb0c0');
    f.L.gl(f.cx + Math.min(half - 9, 26), foot, '#4ac8ff');
    f.L.gl(f.cx - Math.min(half - 10, 8), foot, '#6af08a');
    // The balance.
    for (let y = f.y0 - 1; y <= foot; y++) f.L.px(f.cx, y, rk(BRASS, 5)), f.L.px(f.cx + 1, y, rk(BRASS, 3));
    for (let dx = -2; dx <= 3; dx++) f.L.px(f.cx + dx, foot, rk(BRASS, 4 - dx * 0.3));
    for (let dx = -7; dx <= 8; dx++) f.L.px(f.cx + dx, f.y0 - 1 + (dx < 0 ? 0 : 1), rk(BRASS, 5.4 - Math.abs(dx) * 0.1));
    for (const [px, py] of [[-6, 0], [7, 1]]) {
      for (let k = 1; k < 5; k++) f.L.px(f.cx + px, f.y0 - 1 + py + k, '#6a5a3a');
      for (let dx = -2; dx <= 2; dx++) f.L.px(f.cx + px + dx, f.y0 + 4 + py, rk(BRASS, 5 - Math.abs(dx) * 0.5));
      for (let dx = -1; dx <= 1; dx++) f.L.px(f.cx + px + dx, f.y0 + 5 + py, rk(BRASS, 2.6));
    }
    f.L.px(f.cx - 6, f.y0 + 3, '#fff0a8');
    f.L.px(f.cx - 7, f.y0 + 3, '#e0b040');
  },
};

/** The four corners of the frame's outside: where each is, and which way is in from it. */
function corners(f: F): ReadonlyArray<readonly [number, number, 1 | -1, 1 | -1]> {
  return [[f.x0, f.y0, 1, 1], [f.x1, f.y0, -1, 1], [f.x0, f.y1, 1, -1], [f.x1, f.y1, -1, -1]];
}

/**
 * The plaque: the strip under the top band, the frame's showpiece (each keeper's own things stand
 * on its lip). Fills it with `fill(x, y, u, v)` (u along it, v down it), a shaded top row, and draws
 * the ink line where it meets the paper.
 */
function plaque(f: F, ink: string, fill: (x: number, y: number, u: number, v: number) => string): void {
  for (let y = f.py0; y < f.py1; y++) for (let x = f.px0; x <= f.px1; x++) f.L.px(x, y, fill(x, y, x - f.px0, y - f.py0));
  for (let x = f.px0 - 1; x <= f.px1 + 1; x++) f.L.px(x, f.py1, ink);
}

/** A rose bloom: a swirl of red, lit at the top left. */
function rose(L: Layer, cx: number, cy: number, r: number): void {
  oval(L, cx, cy, r, r, (_x, _y, nx, ny) => {
    const swirl = Math.sin(Math.atan2(ny, nx) * 2 + Math.hypot(nx, ny) * 5);
    return rk(ROSE, 2.6 - nx * 0.8 - ny * 0.9 + swirl * 0.6);
  });
  L.px(cx + 1, cy + Math.ceil(r), rk(LEAF, 5));
  L.px(cx - 1, cy + Math.ceil(r), rk(LEAF, 4));
}

/** A point on the frame: `t` (0..1) of the way round its outside, `inset` pixels in from it (negative: outside). */
function edgePoint(f: F, t: number, inset: number): [number, number] {
  const w = f.x1 - f.x0;
  const h = f.y1 - f.y0;
  let s = t * 2 * (w + h);
  if (s < w) return [f.x0 + Math.round(s), f.y0 + inset];
  s -= w;
  if (s < h) return [f.x1 - inset, f.y0 + Math.round(s)];
  s -= h;
  if (s < w) return [f.x1 - Math.round(s), f.y1 - inset];
  s -= w;
  return [f.x0 + inset, f.y1 - Math.round(s)];
}

/** How a keeper's counter is dressed besides its frame: its paper's tint, and the colours of the tab you're on. */
export interface FrameDress {
  /** The paper: its fill and its two speckles (a touch darker, a touch lighter). */
  paper: readonly [string, string, string];
  /** The lit tab: face, highlight, shade, outline, and its lettering. */
  tab: { face: string; hi: string; lo: string; ink: string; text: string };
}

const DRESS: Partial<Record<StationId, FrameDress>> = {
  altar: { paper: ['#eee0d6', '#e8d8d0', '#f4e8e0'], tab: { face: '#7046c4', hi: '#b08cf4', lo: '#53309a', ink: '#0e0618', text: '#fff6ff' } },
  upgrades: { paper: ['#f2e0b6', '#ecd8aa', '#f8e8c6'], tab: { face: '#e3a93a', hi: '#ffe7a0', lo: '#b9791f', ink: '#1c0d02', text: '#3a1c04' } },
  perks: { paper: ['#e8e4c2', '#e0dcb6', '#f0ecd0'], tab: { face: '#3aa08e', hi: '#8ae4d2', lo: '#2a7868', ink: '#061816', text: '#04201a' } },
  rebirth: { paper: ['#f6ead8', '#f0e2cc', '#fcf2e4'], tab: { face: '#ec9c8c', hi: '#ffd8c8', lo: '#c47666', ink: '#3a1410', text: '#4a1612' } },
  quests: { paper: ['#f2e2bf', '#efdcb6', '#f6e9cc'], tab: { face: '#eb9a3c', hi: '#ffd28a', lo: '#c87428', ink: '#3a1c0a', text: '#3a1c0a' } },
  gate: { paper: ['#e6e0cc', '#ded8c2', '#eee8d8'], tab: { face: '#7c88a0', hi: '#b8c4d8', lo: '#5a657a', ink: '#0c0e14', text: '#0e1220' } },
  scrap: { paper: ['#f2e0ba', '#ecd8ae', '#f8e8ca'], tab: { face: '#2e8452', hi: '#62c084', lo: '#1c5c38', ink: '#04140a', text: '#f2ffe8' } },
};

/** The keeper's paper and tab colours (the notice board's plain ones for anyone without their own). */
export function keeperDress(id: StationId): FrameDress {
  return DRESS[id] ?? DRESS.quests!;
}

/** Does the keeper have a frame of their own? */
export function hasKeeperFrame(id: StationId): boolean {
  return !!FRAMES[id];
}

/**
 * The frame for a keeper's counter `w` x `h` art pixels: the picture is FRAME_OVER bigger all round
 * (decorations reach past the frame), lit, RGBA; transparent inside the band (the paper shows) and
 * round the decorations.
 */
export function paintKeeperFrame(id: StationId, w: number, h: number): { w: number; h: number; px: Uint8ClampedArray<ArrayBuffer> } {
  w = Math.max(40, Math.round(w));
  h = Math.max(40, Math.round(h));
  const O = FRAME_OVER;
  const W = w + 2 * O;
  const H = h + 2 * O;
  const L = new Layer(0, 0, W, H);
  const B = FRAME_BAND;
  const f: F = {
    L, W, H, x0: O, y0: O, x1: O + w - 1, y1: O + h - 1, B,
    px0: O + B, px1: O + w - 1 - B, py0: O + B, py1: O + B + FRAME_PLAQUE - 1,
    cx: O + Math.floor(w / 2), seed: 31 + id.length * 97,
  };
  (FRAMES[id] ?? FRAMES.quests!)(f);
  return { w: W, h: H, px: lightLayer(L, { ambient: [1, 1, 1], vignette: 0, bloom: 0.7, bloomR: 2, bands: 6 }) };
}
