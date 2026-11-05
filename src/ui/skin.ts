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
} satisfies Record<string, Mat>;
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
  for (const [name, color] of Object.entries({ deadly: '#d0262e', hard: '#e0702a', fair: '#d8a020', easy: '#4caa3c', trivial: '#3a8ad0' })) add(`seal-${name}`, seal(color));
  const style = document.createElement('style');
  style.dataset.skin = '1';
  style.textContent = `:root{${css.join('')}}`;
  document.head.appendChild(style);
}
