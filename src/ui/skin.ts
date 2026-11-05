/**
 * The UI's skin: wood, iron and brass in the medieval pack's palette (MediavelFree: warm orange
 * planks, near-black brown outlines, iron bolts and chains, cream icons), painted as pixel art once at
 * startup and handed to CSS as images: 9-slice border images for things that stretch (buttons, plates,
 * bars, cards) and whole pictures for things that don't (ability slots, wax seals). Everything is drawn
 * at art resolution and shown at one art pixel = var(--px), so the skin, the icons and the text share
 * one pixel size.
 */

type Hex = string;

/** A material: its face, the bevel's light and shadow, the lip below it and its outline. */
export interface Mat {
  face: Hex;
  hi: Hex;
  lo: Hex;
  lip: Hex;
  ink: Hex;
}

export const MATS = {
  wood: { face: '#cb6f2f', hi: '#ef9a3e', lo: '#ad5422', lip: '#803c1c', ink: '#180702' },
  dark: { face: '#6e3f2c', hi: '#94583e', lo: '#5a3324', lip: '#3a2017', ink: '#130505' },
  brass: { face: '#e3a93a', hi: '#ffe7a0', lo: '#b9791f', lip: '#7a4a12', ink: '#1c0d02' },
  crimson: { face: '#b4303a', hi: '#ee6c5e', lo: '#8a1f2a', lip: '#58101a', ink: '#160406' },
  arcane: { face: '#7046c4', hi: '#b08cf4', lo: '#53309a', lip: '#321a64', ink: '#0e0618' },
  steel: { face: '#3b74bc', hi: '#8cc0f4', lo: '#2a548e', lip: '#18325c', ink: '#060c18' },
  emerald: { face: '#3c964a', hi: '#82dc7c', lo: '#296e38', lip: '#164824', ink: '#04120a' },
  iron: { face: '#4e4642', hi: '#857a70', lo: '#38312d', lip: '#221c19', ink: '#130505' },
  // The keepers' screens (the "Pixel Art GUI" look): green buttons and tabs, beige paper, an amber
  // highlight for the category you're in, grey for what's done.
  leaf: { face: '#5fae44', hi: '#b4e47a', lo: '#3f8a32', lip: '#2a6022', ink: '#16300f' },
  paper: { face: '#ecdab4', hi: '#fff6e0', lo: '#d6bd8e', lip: '#b08c5c', ink: '#3d2414' },
  amber: { face: '#eb9a3c', hi: '#ffd28a', lo: '#c87428', lip: '#8e4a18', ink: '#3a1c0a' },
  ash: { face: '#b9ae9c', hi: '#ddd3c0', lo: '#9a8f7e', lip: '#776c5e', ink: '#3b342c' },
} satisfies Record<string, Mat>;

/** The keepers' paper: its fill, its shade, the brown of its border and the ink of its outline. */
export const PAPER = {
  fill: '#f2e2bf',
  fill2: '#efdcb6',
  fill3: '#f6e9cc',
  shade: '#dcc398',
  inset: '#e2cca0',
  insetEdge: '#8e6842',
  border: '#6e4527',
  borderLit: '#91603a',
  borderDark: '#53331c',
  ink: '#2b170c',
  corner: '#6a4226',
  cornerLit: '#85573a',
  cornerDark: '#43281a',
} as const;
export type MatName = keyof typeof MATS;

// ------------------------------------------------------------------ a tiny pixel canvas

class Pix {
  readonly d: Uint8ClampedArray<ArrayBuffer>;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.d = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
  }
  set(x: number, y: number, hex: Hex, a = 1): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const n = parseInt(hex.slice(1), 16);
    this.d[i] = (n >> 16) & 255;
    this.d[i + 1] = (n >> 8) & 255;
    this.d[i + 2] = n & 255;
    this.d[i + 3] = Math.round(a * 255);
  }
  rect(x: number, y: number, w: number, h: number, hex: Hex, a = 1): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, hex, a);
  }
  url(): string {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    c.getContext('2d')!.putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return c.toDataURL();
  }
}

const mixHex = (a: Hex, b: Hex, t: number): Hex => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
};

/** An iron bolt (3x3, lit from the top left). */
function bolt(p: Pix, x: number, y: number): void {
  p.set(x + 1, y, '#26201c');
  p.set(x, y + 1, '#26201c');
  p.set(x + 2, y + 1, '#130505');
  p.set(x + 1, y + 2, '#130505');
  p.set(x + 1, y + 1, '#b3a393');
  p.set(x, y, '#635c57');
  p.set(x + 2, y, '#4e4642');
  p.set(x, y + 2, '#4e4642');
  p.set(x + 2, y + 2, '#26201c');
}

// ------------------------------------------------------------------ pieces

/**
 * A button face, 16 x 16 for a 5-pixel 9-slice: outline with clipped corners, a light top edge and
 * sheen, the face, a shaded bottom edge and a 2-pixel lip (its thickness). Pressed: the face sinks a
 * pixel into the lip.
 */
function button(m: Mat, down: boolean): string {
  const p = new Pix(16, 16);
  const top = down ? 1 : 0;
  const lipRows = down ? 1 : 2;
  const bottom = 15;
  const faceBottom = bottom - 1 - lipRows; // last face row
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < 16; x++) {
      const corner = (x === 0 || x === 15) && (y === top || y === bottom);
      if (corner) continue;
      const edge = x === 0 || x === 15 || y === top || y === bottom || ((x === 1 || x === 14) && (y === top + 1 || y === bottom - 1));
      if (edge) {
        p.set(x, y, m.ink);
        continue;
      }
      if (y > faceBottom) p.set(x, y, y === bottom - 1 ? mixHex(m.lip, m.ink, 0.35) : m.lip);
      else if (y === top + 1) p.set(x, y, m.hi);
      else if (y === top + 2) p.set(x, y, mixHex(m.face, m.hi, 0.35));
      else if (y === faceBottom) p.set(x, y, m.lo);
      else if (x === 1) p.set(x, y, mixHex(m.face, m.hi, 0.5));
      else if (x === 14) p.set(x, y, m.lo);
      else p.set(x, y, m.face);
    }
  }
  // A glint on the top left.
  p.set(2, top + 1, '#ffffff', 0.55);
  p.set(3, top + 1, '#ffffff', 0.3);
  return p.url();
}

/**
 * A plate: a dark wooden frame (or iron), 3 pixels thick, with iron bolts in its corners, round a dark
 * see-through center. 16 x 16 for a 6-pixel 9-slice.
 */
function plate(frame: Mat, center: Hex, alpha: number, bolts = true): string {
  const p = new Pix(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const corner = (x === 0 || x === 15) && (y === 0 || y === 15);
      if (corner) continue;
      const d = Math.min(x, y, 15 - x, 15 - y);
      if (d === 0) p.set(x, y, frame.ink);
      else if (d === 1) p.set(x, y, x === 1 || y === 1 ? (x === 14 || y === 14 ? frame.face : frame.hi) : frame.lo);
      else if (d === 2) p.set(x, y, frame.face);
      else if (d === 3) p.set(x, y, frame.ink, 0.85);
      else p.set(x, y, d === 4 && (x === 4 || y === 4) ? mixHex(center, '#000000', 0.4) : center, alpha);
    }
  }
  if (bolts) {
    bolt(p, 1, 1);
    bolt(p, 12, 1);
    bolt(p, 1, 12);
    bolt(p, 12, 12);
  }
  return p.url();
}

/**
 * A slim frame for small plates (pills, toasts, notes): outline, a one-pixel wooden (or iron) rim lit
 * from the top left, an inner shadow line, and the see-through center. 12 x 12, 4-slice.
 */
function slim(frame: Mat, center: Hex, alpha: number): string {
  const p = new Pix(12, 12);
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      if ((x === 0 || x === 11) && (y === 0 || y === 11)) continue;
      const d = Math.min(x, y, 11 - x, 11 - y);
      if (d === 0) p.set(x, y, frame.ink);
      else if (d === 1) p.set(x, y, x === 1 || y === 1 ? (x === 10 || y === 10 ? frame.face : frame.hi) : frame.lo);
      else if (d === 2) p.set(x, y, frame.ink, 0.7);
      else p.set(x, y, center, alpha);
    }
  }
  return p.url();
}

/** A bar's frame (the pack's HP bar): outline, a copper rim lit on top, and the dark trough. 8 x 8, 3-slice. */
function barFrame(): string {
  const p = new Pix(8, 8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x === 0 || x === 7) && (y === 0 || y === 7)) continue;
      const d = Math.min(x, y, 7 - x, 7 - y);
      if (d === 0) p.set(x, y, '#1f0d0d');
      else if (d === 1) p.set(x, y, y === 1 ? '#d08a62' : y === 6 ? '#7a4030' : '#a96449');
      else p.set(x, y, y === 2 ? '#1f0d0d' : '#361c20');
    }
  }
  return p.url();
}

/** Parchment in a brown frame with round corner knobs (the cozy pack's card). 20 x 20, 7-slice. */
function parchment(): string {
  const p = new Pix(20, 20);
  const paper = ['#f4e6c8', '#efdcb8', '#f7ecd4'];
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      const d = Math.min(x, y, 19 - x, 19 - y);
      if (d === 0) {
        if ((x < 2 || x > 17) && (y < 2 || y > 17)) continue;
        p.set(x, y, '#2a120c');
      } else if (d === 1) p.set(x, y, y === 1 || x === 1 ? '#a8664c' : '#6e3a2a');
      else if (d === 2) p.set(x, y, '#7e4634');
      else if (d === 3) p.set(x, y, '#2a120c', 0.6);
      else p.set(x, y, d === 4 && (y === 4 || x === 4) ? '#d9c39c' : paper[(x * 7 + y * 13) % 3]);
    }
  }
  // Corner knobs.
  for (const [cx, cy] of [
    [1, 1],
    [16, 1],
    [1, 16],
    [16, 16],
  ]) {
    p.rect(cx, cy, 3, 3, '#7e4634');
    p.set(cx, cy, '#a8664c');
    p.set(cx + 2, cy + 2, '#4a2418');
    p.set(cx + 1, cy + 1, '#c88a6a');
  }
  return p.url();
}

/** Planks for big wooden surfaces, 32 x 16, tiling: two boards with grain, seams and a knot. */
function planks(m: Mat): string {
  const p = new Pix(32, 16);
  for (let y = 0; y < 16; y++) {
    const row = y % 8;
    for (let x = 0; x < 32; x++) {
      let c = m.face;
      if (row === 0) c = m.hi;
      else if (row === 7) c = m.lip;
      else if (row === 6) c = m.lo;
      else {
        const g = Math.sin(x * 0.31 + y * 2.1 + (y > 7 ? 2 : 0)) + Math.sin(x * 0.11 + y * 1.3);
        if (g > 1.3) c = mixHex(m.face, m.lo, 0.6);
        else if (g < -1.5) c = mixHex(m.face, m.hi, 0.35);
      }
      p.set(x, y, c);
    }
  }
  // Seams where boards end (staggered), and a knot.
  for (let y = 1; y < 7; y++) p.set(21, y, m.lip);
  for (let y = 9; y < 15; y++) p.set(6, y, m.lip);
  p.set(12, 11, m.lip);
  p.set(13, 11, m.lo);
  p.set(12, 12, m.lo);
  return p.url();
}

/**
 * An ability slot: an octagonal ring (iron or brass, 3 pixels, lit from the top left) with bolts on
 * the diagonals, round an enamel well that darkens toward the bottom. `n` pixels square.
 */
function slot(n: number, ring: Mat, enamel: Mat): string {
  const p = new Pix(n, n);
  const c = Math.round(n * 0.27);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const m = [x, y, n - 1 - x, n - 1 - y, x + y - c, n - 1 - x + y - c, x + (n - 1 - y) - c, n - 1 - x + (n - 1 - y) - c];
      const d = Math.min(...m);
      if (d < 0) continue;
      const which = m.indexOf(d);
      const lit = which === 0 || which === 1 || which === 4;
      const shade = which === 2 || which === 3 || which === 7;
      if (d === 0) p.set(x, y, ring.ink);
      else if (d === 1) p.set(x, y, lit ? ring.hi : shade ? ring.lo : ring.face);
      else if (d === 2) p.set(x, y, ring.face);
      else if (d === 3) p.set(x, y, lit ? ring.lip : shade ? ring.hi : ring.lo);
      else if (d === 4) p.set(x, y, ring.ink);
      else {
        // The well: lit from above, darker below, a soft rim of shadow.
        const t = y / n;
        let col = t < 0.35 ? enamel.hi : t < 0.62 ? enamel.face : t < 0.85 ? enamel.lo : enamel.lip;
        if (d === 5) col = mixHex(col, enamel.ink, 0.45);
        p.set(x, y, col);
      }
    }
  }
  // Bolts on the four diagonals.
  const b = Math.round(c / 2) - 1;
  bolt(p, b, b);
  bolt(p, n - 3 - b, b);
  bolt(p, b, n - 3 - b);
  bolt(p, n - 3 - b, n - 3 - b);
  return p.url();
}

/** A wax seal (difficulty): a lumpy disc of wax with a pressed ring. 13 x 13. */
function seal(color: Hex): string {
  const p = new Pix(13, 13);
  const dark = mixHex(color, '#000000', 0.45);
  const light = mixHex(color, '#ffffff', 0.4);
  for (let y = 0; y < 13; y++) {
    for (let x = 0; x < 13; x++) {
      const dx = x - 6;
      const dy = y - 6;
      const r = Math.hypot(dx, dy) + (((x * 5 + y * 3) % 4) === 0 ? 0.6 : 0);
      if (r > 6.4) continue;
      if (r > 5.5) p.set(x, y, '#140404');
      else if (r > 4.6) p.set(x, y, dx + dy < 0 ? light : dark);
      else if (r > 3.4 && r < 4.2) p.set(x, y, dark);
      else p.set(x, y, dx + dy < -2 ? mixHex(color, '#ffffff', 0.15) : color);
    }
  }
  return p.url();
}

/** The HUD's wooden keys: `n` across, `t` thick, the inlay's radius `r` (art pixels). */
export const KEY_SIZES = {
  lg: { n: 34, t: 6, r: 11.5 },
  md: { n: 28, t: 5, r: 9.5 },
  sm: { n: 20, t: 4, r: 6.5 },
} as const;
export type KeySize = keyof typeof KEY_SIZES;

/** The dark recess inside a key's inlay, as an inset from the key's face (art pixels; the skill reel's window). */
export function keyWell(size: KeySize): number {
  const k = KEY_SIZES[size];
  return Math.round(k.n / 2 - (k.r - 1.6));
}

/**
 * A wooden key for the HUD's actions: a square block `n` pixels across, `t` thick, seen a little from
 * above (its top face, then its front edge below it), lit from the top left. The top is three oak
 * boards with grain, a bevel (light on the top and left, shade on the bottom and right) and a nail in
 * each corner; in its middle a round inlay (a brass ring when ready, iron when not) round a dark
 * recess the icon sits in. Pressed, the top sinks into the block: it's drawn `t - 1` lower and only a
 * pixel of the front shows, so the key goes down without the picture changing size.
 */
function woodKey(n: number, t: number, down: boolean, rim: Mat, r: number): string {
  const H = n + t;
  const p = new Pix(n, H);
  const W = MATS.wood;
  const top = down ? t - 1 : 0;
  const faceBottom = top + n - 1;
  const c = n >= 28 ? 4 : 3; // the corners' chamfer
  // Inside the silhouette: a chamfered rect from `top` to H - 1 (the face and what's left of the front).
  const inside = (x: number, y: number) => {
    if (y < top || y > H - 1 || x < 0 || x > n - 1) return false;
    const dy = Math.min(y - top, H - 1 - y);
    const dx = Math.min(x, n - 1 - x);
    return dx + dy >= c - 1;
  };
  const edge = (x: number, y: number) => inside(x, y) && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1));
  // Boards: three across, seams between them.
  const seams = [Math.round(n / 3), Math.round((2 * n) / 3)];
  const cx = (n - 1) / 2;
  const cy = top + (n - 1) / 2;
  for (let y = top; y < H; y++) {
    for (let x = 0; x < n; x++) {
      if (!inside(x, y)) continue;
      if (edge(x, y)) {
        p.set(x, y, W.ink);
        continue;
      }
      if (y > faceBottom) {
        // The front edge: darker boards, their ends' grain running down, a dark foot.
        const foot = y === H - 2;
        const grain = (x * 7 + 3) % 5 === 0;
        p.set(x, y, foot ? mixHex(W.lip, W.ink, 0.45) : grain ? mixHex(W.lip, W.ink, 0.25) : W.lip);
        continue;
      }
      const fy = y - top;
      // The bevel round the top face.
      const insideTop = (xx: number, yy: number) => inside(xx, yy) && yy <= faceBottom;
      const nearL = !insideTop(x - 2, y) || !insideTop(x - 1, y - 1);
      const nearT = !insideTop(x, y - 2) || !insideTop(x + 1, y - 1);
      const nearR = !insideTop(x + 2, y) || !insideTop(x + 1, y + 1);
      const nearB = y >= faceBottom - 1;
      let col: Hex;
      if (nearT || nearL) col = nearT && fy <= 1 ? W.hi : mixHex(W.face, W.hi, 0.55);
      else if (nearB) col = y === faceBottom ? mixHex(W.lo, W.lip, 0.5) : W.lo;
      else if (nearR) col = W.lo;
      else if (seams.includes(x)) col = mixHex(W.lip, W.ink, 0.15);
      else if (seams.includes(x - 1)) col = mixHex(W.face, W.hi, 0.3);
      else {
        // Grain: long streaks down each board, a knot here and there.
        const b = x < seams[0] ? 0 : x < seams[1] ? 1 : 2;
        const g = Math.sin(fy * 0.55 + b * 2.3 + x * 0.9) + Math.sin(fy * 0.21 + b * 4.1);
        col = g > 1.35 ? mixHex(W.face, W.lo, 0.7) : g < -1.45 ? mixHex(W.face, W.hi, 0.3) : W.face;
      }
      p.set(x, y, col);
    }
  }
  // The inlay: a ring of metal round a dark recess, lit from the top left.
  for (let y = top; y <= faceBottom; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r + 1.6) continue;
      const lit = x - cx + (y - cy) < 0;
      if (d > r + 0.6) p.set(x, y, mixHex(W.lip, W.ink, 0.35)); // the cut round it
      else if (d > r - 0.6) p.set(x, y, lit ? rim.hi : rim.lo);
      else if (d > r - 1.6) p.set(x, y, lit ? rim.face : rim.lip);
      else {
        // The recess: dark, a touch lighter at the bottom where the light falls in.
        const k = (y - (cy - r)) / (2 * r);
        p.set(x, y, k > 0.75 ? '#4a2416' : k > 0.4 ? '#3a1c12' : '#2c140c');
      }
    }
  }
  // A nail in each corner of the top.
  const m = c + 1;
  for (const [nx, ny] of [
    [m, top + m],
    [n - 1 - m - 1, top + m],
    [m, faceBottom - m - 1],
    [n - 1 - m - 1, faceBottom - m - 1],
  ]) {
    p.set(nx, ny, '#c9bcad');
    p.set(nx + 1, ny, '#6d625a');
    p.set(nx, ny + 1, '#6d625a');
    p.set(nx + 1, ny + 1, '#2a2220');
  }
  // A glint on the top left edge.
  p.set(c + 1, top + 1, '#ffffff', 0.5);
  p.set(c + 2, top + 1, '#ffffff', 0.3);
  return p.url();
}

// ------------------------------------------------------------------ the keepers' paper

/** A tiny position hash in [0, 1) (the paper's speckle and the torn corners' ragged edges). */
function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * A big sheet of light beige paper in a dark brown border 3 pixels thick (outline, a lit edge, the
 * border), a soft shade inside its top and left, a faint speckle, and darker torn corners: a ragged
 * triangle of dark brown in each, its torn edge inked. 40 x 40 for an 8-pixel 9-slice, tiled.
 */
function paperPanel(): string {
  // (40 square: the 8-pixel corners, and a 24-pixel middle that tiles without showing a grid.)
  const n = 40;
  const p = new Pix(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.min(x, y, n - 1 - x, n - 1 - y);
      if (d === 0) {
        if ((x === 0 || x === n - 1) && (y === 0 || y === n - 1)) continue;
        p.set(x, y, PAPER.ink);
      } else if (d === 1) p.set(x, y, x === 1 || y === 1 ? PAPER.borderLit : PAPER.border);
      else if (d === 2) p.set(x, y, PAPER.border);
      else if (d === 3) p.set(x, y, PAPER.ink, 0.85);
      else if (d === 4 && (x === 4 || y === 4)) p.set(x, y, PAPER.shade);
      else {
        const r = hash2(x, y, 3);
        p.set(x, y, r < 0.08 ? PAPER.fill2 : r > 0.94 ? PAPER.fill3 : PAPER.fill);
      }
    }
  }
  // The torn corners: a ragged dark triangle in each, inside the outline.
  for (const [cx, cy, sx, sy] of [
    [0, 0, 1, 1],
    [n - 1, 0, -1, 1],
    [0, n - 1, 1, -1],
    [n - 1, n - 1, -1, -1],
  ]) {
    // (Inside the 8-pixel corner slice, so nothing of it stretches along the edges.)
    for (let v = 1; v < 8; v++) {
      for (let u = 1; u < 8; u++) {
        const x = cx + sx * u;
        const y = cy + sy * v;
        const reach = 6 + (hash2(u * sx, v * sy, 11) < 0.45 ? 1 : 0) - (hash2(u, v * sy, 5) < 0.2 ? 1 : 0);
        const s = u + v;
        if (s > reach + 1) continue;
        if (s === reach + 1 || s === reach) p.set(x, y, PAPER.ink, s === reach ? 1 : 0.55);
        else {
          const r = hash2(x, y, 17);
          p.set(x, y, r < 0.18 ? PAPER.cornerLit : r > 0.8 ? PAPER.cornerDark : PAPER.corner);
        }
      }
    }
  }
  return p.url();
}

/** A slot pressed into the paper: a slightly darker beige with a dark inner edge top and left, a light one below. 10 x 10, 3-slice. */
function paperInset(): string {
  const p = new Pix(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      if ((x === 0 || x === 9) && (y === 0 || y === 9)) continue;
      if (x === 0 || y === 0) p.set(x, y, PAPER.insetEdge);
      else if (x === 9 || y === 9) p.set(x, y, '#fbf2dc');
      else if (x === 1 || y === 1) p.set(x, y, '#c7aa7a');
      else p.set(x, y, PAPER.inset);
    }
  }
  return p.url();
}

/** An offer card: lighter paper in a one-pixel brown outline, lit on its top and left edges. 12 x 12, 4-slice. */
function paperCard(face: Hex, hi: Hex, lo: Hex, ink: Hex): string {
  const p = new Pix(12, 12);
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      if ((x === 0 || x === 11) && (y === 0 || y === 11)) continue;
      const d = Math.min(x, y, 11 - x, 11 - y);
      if (d === 0) p.set(x, y, ink);
      else if (d === 1) p.set(x, y, x === 1 || y === 1 ? (x === 10 || y === 10 ? face : hi) : lo);
      else p.set(x, y, face);
    }
  }
  return p.url();
}

/**
 * A tab on top of a panel: rounded top corners, outlined on the top and sides, a light top edge, and
 * no line along the bottom (it sits on the panel). 16 x 14, sliced 5 5 2 5.
 */
function tab(m: Mat): string {
  const p = new Pix(16, 14);
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 16; x++) {
      if (y === 0 && (x < 2 || x > 13)) continue;
      if (y === 1 && (x === 0 || x === 15)) continue;
      const edge = y === 0 || x === 0 || x === 15 || (y === 1 && (x === 1 || x === 14));
      if (edge) p.set(x, y, m.ink);
      else if (y === 1 || (y === 2 && (x === 1 || x === 14))) p.set(x, y, m.hi);
      else if (x === 1) p.set(x, y, mixHex(m.face, m.hi, 0.5));
      else if (x === 14) p.set(x, y, m.lo);
      else if (y >= 12) p.set(x, y, m.lo);
      else p.set(x, y, m.face);
    }
  }
  return p.url();
}

/** A chain, tiling vertically: links seen edge-on and face-on in turn. 4 x 8. */
function chain(): string {
  const p = new Pix(4, 8);
  const ink = '#130505';
  for (const y of [0, 1, 2, 3]) {
    p.set(0, y, ink);
    p.set(3, y, ink);
  }
  p.set(1, 0, ink);
  p.set(2, 0, ink);
  p.set(1, 3, ink);
  p.set(2, 3, ink);
  p.set(1, 1, '#857a70');
  p.set(1, 2, '#4e4642');
  p.set(2, 1, '#4e4642');
  for (const y of [4, 5, 6, 7]) {
    p.set(1, y, ink);
    p.set(2, y, y === 5 ? '#857a70' : '#4e4642');
  }
  return p.url();
}

// ------------------------------------------------------------------ install

let installed = false;

/** Paints the skin and hands it to CSS as custom properties (--sk-*). Safe to call more than once. */
export function installSkin(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const css: string[] = [];
  const add = (name: string, url: string) => css.push(`--sk-${name}: url("${url}");`);
  for (const [name, m] of Object.entries(MATS)) {
    add(`btn-${name}`, button(m, false));
    add(`btn-${name}-down`, button(m, true));
  }
  add('plate', plate(MATS.dark, '#1a0f0b', 0.86));
  add('plate-iron', plate(MATS.iron, '#151012', 0.88));
  add('plate-gold', plate(MATS.brass, '#2a1a08', 0.9));
  add('plate-clear', plate(MATS.dark, '#1a0f0b', 0, false));
  add('slim', slim(MATS.dark, '#1a0f0b', 0.82));
  add('slim-iron', slim(MATS.iron, '#141012', 0.85));
  add('slim-gold', slim(MATS.brass, '#2a1a08', 0.88));
  add('bar', barFrame());
  add('parchment', parchment());
  add('planks', planks(MATS.wood));
  add('planks-dark', planks(MATS.dark));
  add('chain', chain());
  for (const [ring, enamel] of [
    ['iron', 'arcane'],
    ['brass', 'arcane'],
    ['iron', 'steel'],
    ['brass', 'steel'],
    ['iron', 'dark'],
    ['brass', 'dark'],
    ['iron', 'wood'],
    ['brass', 'wood'],
  ] as Array<[MatName, MatName]>) {
    add(`slot-${ring}-${enamel}`, slot(34, MATS[ring], MATS[enamel]));
    add(`slot-sm-${ring}-${enamel}`, slot(24, MATS[ring], MATS[enamel]));
  }
  // The HUD's wooden action keys: three sizes, up and pressed, a brass inlay (ready, on) or iron.
  // (Sizes and inlays as KEY_SIZES says; the HUD's CSS sizes the keys to match.)
  for (const [size, k] of Object.entries(KEY_SIZES)) {
    for (const rim of ['brass', 'iron'] as const) {
      add(`key-${size}-${rim}`, woodKey(k.n, k.t, false, MATS[rim], k.r));
      add(`key-${size}-${rim}-down`, woodKey(k.n, k.t, true, MATS[rim], k.r));
    }
  }
  for (const [name, color] of Object.entries({ deadly: '#d0262e', hard: '#e0702a', fair: '#d8a020', easy: '#4caa3c', trivial: '#3a8ad0' })) add(`seal-${name}`, seal(color));
  // The keepers' screens.
  add('pa-panel', paperPanel());
  add('pa-inset', paperInset());
  add('pa-card', paperCard('#f8ecd2', '#fffaf0', '#dcc49a', PAPER.ink));
  add('pa-card-dim', paperCard('#e6d5b4', '#f0e2c6', '#cbb48c', '#5a4632'));
  add('pa-card-gold', paperCard('#fbefc8', '#fffbe6', '#e2c47e', '#5a3a0c'));
  add('pa-tab', tab(MATS.paper));
  add('pa-tab-on', tab(MATS.leaf));
  const style = document.createElement('style');
  style.dataset.skin = '1';
  style.textContent = `:root{${css.join('')}}`;
  document.head.appendChild(style);
}
