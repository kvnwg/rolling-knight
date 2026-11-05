/**
 * The knights' drawing model. A frame is built on a label canvas: every pixel is a material and a
 * shade (not a color), so the game can repaint a material per rarity by swapping its ramp.
 *
 * Shades, for every material: 0 ink (inner lines and the outline on the shadow side), 1 deep,
 * 2 shadow, 3 mid, 4 light, 5 highlight, 6 spec (specular, or a material's extra tone), 7 rim (the
 * outline on the lit, top-left side; only the outline pass writes it).
 *
 * Parts are character grids: digits paint the grid's own material at that shade ('0' ink to '6'
 * spec), letters paint what the grid's legend says, '.' is empty. Parts are placed by an anchor and
 * stacked by z. A part can draw a contour onto what lies under it (a dark line where it overlaps
 * another part), so an arm reads in front of a chest without an outline round everything.
 */

export const MATS = ['metal', 'cloth', 'linen', 'accent', 'trim', 'etch', 'leather', 'skin', 'hair', 'eyes', 'glow', 'gem', 'plume', 'wood', 'cape', 'star'] as const;
export type Mat = (typeof MATS)[number];
const MAT_INDEX = new Map<string, number>(MATS.map((m, i) => [m, i]));

export const INK = 0;
export const DEEP = 1;
export const RIM = 7;

/** One painted pixel: [x, y, material, shade]. */
export type Cell = readonly [number, number, Mat, number];

export interface Edge {
  /** 'ink': this part's ink; 'shade': the covered part's deep tone (a soft cast shadow). */
  kind: 'ink' | 'shade';
  /** Which sides of this part get the line: any of 'l', 'r', 't', 'b' (default all). */
  sides?: string;
}

/** A placed part: absolute cells, a z order, an optional contour. */
export interface Piece {
  cells: Cell[];
  z: number;
  edge?: Edge;
  name?: string;
}

export type Legend = Record<string, readonly [Mat, number]>;

/** A grid, parsed: cells relative to its anchor. */
export interface Grid {
  cells: Cell[];
  w: number;
  h: number;
  /** The anchor, in the grid's own rows and columns. */
  ax: number;
  ay: number;
}

/** Parses a legend string like 'a:accent.3 g:glow.6'. */
export function legend(spec: string, base: Legend = {}): Legend {
  const out: Record<string, readonly [Mat, number]> = { ...base };
  for (const tok of spec.trim().split(/\s+/)) {
    if (!tok) continue;
    const m = /^(.):([a-z]+)\.(\d)$/.exec(tok);
    if (!m) throw new Error(`bad legend token "${tok}"`);
    if (!MAT_INDEX.has(m[2])) throw new Error(`unknown material "${m[2]}"`);
    out[m[1]] = [m[2] as Mat, Number(m[3])];
  }
  return out;
}

/**
 * A grid of rows; `ax`, `ay` is the anchor (the grid cell that lands on the placement point). A '+'
 * in the rows marks the anchor too (it paints nothing) when `ax`/`ay` are left out.
 */
export function grid(rows: readonly string[], mat: Mat, lg: Legend = {}, ax?: number, ay?: number): Grid {
  const w = Math.max(...rows.map((r) => r.length));
  let px = ax ?? -1;
  let py = ay ?? -1;
  if (ax === undefined) {
    rows.forEach((r, y) => {
      const i = r.indexOf('+');
      if (i >= 0) {
        px = i;
        py = y;
      }
    });
    if (px < 0) {
      px = 0;
      py = 0;
    }
  }
  const cells: Cell[] = [];
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const ch = r[x];
      if (ch === '.' || ch === ' ' || ch === '+') continue;
      if (ch >= '0' && ch <= '7') cells.push([x - px, y - py, mat, Number(ch)]);
      else {
        const l = lg[ch];
        if (!l) throw new Error(`grid uses "${ch}" with no legend entry (row ${y}: "${r}")`);
        cells.push([x - px, y - py, l[0], l[1]]);
      }
    }
  });
  return { cells, w, h: rows.length, ax: px, ay: py };
}

/** A grid's cells placed with its anchor at (x, y), mirrored left-right when `flip`. */
export function place(g: Grid | readonly Cell[], x: number, y: number, flip = false): Cell[] {
  const cells = 'cells' in g ? g.cells : g;
  return cells.map(([cx, cy, m, s]) => [x + (flip ? -cx : cx), y + cy, m, s] as const);
}

export function piece(cells: Cell[], z: number, edge?: Edge, name?: string): Piece {
  return { cells, z, edge, name };
}

/** Replaces one material with another in a set of cells (a shared shape in another material). */
export function remat(cells: readonly Cell[], map: Partial<Record<Mat, Mat>>): Cell[] {
  return cells.map(([x, y, m, s]) => [x, y, map[m] ?? m, s] as const);
}

/** The label canvas: material and shade per pixel (-1 empty), which piece owns it, the soft shadow. */
export class Canvas {
  readonly w: number;
  readonly h: number;
  mat: Int8Array;
  shade: Int8Array;
  owner: Int16Array;
  /** Ground shadow coverage (0/1), under everything. */
  shadow: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.mat = new Int8Array(w * h).fill(-1);
    this.shade = new Int8Array(w * h);
    this.owner = new Int16Array(w * h).fill(-1);
    this.shadow = new Uint8Array(w * h);
  }

  in(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  solid(x: number, y: number): boolean {
    return this.in(x, y) && this.mat[y * this.w + x] >= 0;
  }

  set(x: number, y: number, m: Mat, s: number, owner = -1): void {
    if (!this.in(x, y)) return;
    const i = y * this.w + x;
    this.mat[i] = MAT_INDEX.get(m)!;
    this.shade[i] = s;
    this.owner[i] = owner;
  }

  matAt(x: number, y: number): Mat | null {
    if (!this.solid(x, y)) return null;
    return MATS[this.mat[y * this.w + x]];
  }

  shadeAt(x: number, y: number): number {
    return this.shade[y * this.w + x];
  }

  clone(): Canvas {
    const c = new Canvas(this.w, this.h);
    c.mat.set(this.mat);
    c.shade.set(this.shade);
    c.owner.set(this.owner);
    c.shadow.set(this.shadow);
    return c;
  }

  /** True when nothing is painted. */
  empty(): boolean {
    return this.mat.every((v) => v < 0);
  }
}

const SIDES: Array<[number, number, string]> = [
  [-1, 0, 'l'],
  [1, 0, 'r'],
  [0, -1, 't'],
  [0, 1, 'b'],
];

/**
 * Paints pieces in z order. A piece with an edge draws a line on the pixels of earlier pieces that
 * border it (where it overlaps them), on the sides it names.
 */
export function compose(pieces: readonly Piece[], w: number, h: number): Canvas {
  const c = new Canvas(w, h);
  const order = pieces.map((p, i) => ({ p, i })).sort((a, b) => a.p.z - b.p.z || a.i - b.i);
  order.forEach(({ p }, n) => {
    for (const [x, y, m, s] of p.cells) c.set(x, y, m, s, n);
    if (!p.edge) return;
    const mine = new Set(p.cells.map(([x, y]) => y * w + x));
    const sides = p.edge.sides ?? 'lrtb';
    const inkMat = new Map<number, Mat>(p.cells.map(([x, y, m]) => [y * w + x, m]));
    for (const [x, y] of p.cells) {
      for (const [dx, dy, side] of SIDES) {
        if (!sides.includes(side)) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!c.solid(nx, ny)) continue;
        const ni = ny * w + nx;
        if (mine.has(ni) || c.owner[ni] === n) continue;
        if (p.edge.kind === 'ink') c.set(nx, ny, inkMat.get(y * w + x)!, INK, c.owner[ni]);
        else {
          const nm = MATS[c.mat[ni]];
          // A soft shadow: one step darker than what's there, never lighter, ink stays ink.
          const s = c.shade[ni];
          c.set(nx, ny, nm, s === INK ? INK : Math.max(DEEP, Math.min(s, 3) - 1), c.owner[ni]);
        }
      }
    }
  });
  return c;
}

/** Mirrors a canvas left-right around column `axis` (x' = 2 * axis - x). */
export function mirror(c: Canvas, axis: number): Canvas {
  const o = new Canvas(c.w, c.h);
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const nx = 2 * axis - x;
      if (nx < 0 || nx >= c.w) continue;
      const i = y * c.w + x;
      const j = y * c.w + nx;
      o.mat[j] = c.mat[i];
      o.shade[j] = c.shade[i];
      o.owner[j] = c.owner[i];
      o.shadow[j] = c.shadow[i];
    }
  }
  return o;
}

/**
 * Turns a canvas a quarter turn `q` times clockwise around (cx, cy) (exact: a quarter turn moves
 * whole pixels). The ground shadow stays where it was.
 */
export function rotate(c: Canvas, q: number, cx: number, cy: number): Canvas {
  const o = new Canvas(c.w, c.h);
  o.shadow.set(c.shadow);
  const t = ((q % 4) + 4) % 4;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const i = y * c.w + x;
      if (c.mat[i] < 0) continue;
      const dx = x - cx;
      const dy = y - cy;
      const [rx, ry] = t === 0 ? [dx, dy] : t === 1 ? [-dy, dx] : t === 2 ? [-dx, -dy] : [dy, -dx];
      const nx = cx + rx;
      const ny = cy + ry;
      if (!o.in(nx, ny)) continue;
      const j = ny * c.w + nx;
      o.mat[j] = c.mat[i];
      o.shade[j] = c.shade[i];
      o.owner[j] = c.owner[i];
    }
  }
  return o;
}

/** Moves everything painted by (dx, dy) (the shadow stays). */
export function shift(c: Canvas, dx: number, dy: number): Canvas {
  const o = new Canvas(c.w, c.h);
  o.shadow.set(c.shadow);
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const i = y * c.w + x;
      if (c.mat[i] < 0 || !o.in(x + dx, y + dy)) continue;
      const j = (y + dy) * c.w + x + dx;
      o.mat[j] = c.mat[i];
      o.shade[j] = c.shade[i];
      o.owner[j] = c.owner[i];
    }
  }
  return o;
}

/**
 * The outer outline, selectively lit: every empty pixel touching the sprite (4 ways) takes the
 * material of what it touches, in ink under and right of a shape and in the rim tone above and left
 * of it (where the light from the top left falls). `skip` materials (glows) get a line of their own
 * deep tone instead of ink.
 */
export function outline(c: Canvas, skip: ReadonlySet<Mat> = new Set()): Canvas {
  const o = c.clone();
  const w = c.w;
  const at = (x: number, y: number) => (c.solid(x, y) ? MATS[c.mat[y * w + x]] : null);
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < w; x++) {
      if (c.solid(x, y)) continue;
      const up = at(x, y - 1);
      const left = at(x - 1, y);
      const right = at(x + 1, y);
      const down = at(x, y + 1);
      let m: Mat | null = null;
      let s = INK;
      if (up) m = up;
      else if (left) m = left;
      else if (right) {
        m = right;
        s = RIM;
      } else if (down) {
        m = down;
        s = RIM;
      }
      if (!m) continue;
      if (skip.has(m)) s = DEEP;
      o.set(x, y, m, s);
    }
  }
  return o;
}

/** The topmost painted row of a canvas and the middle column of that row (-1, -1 when empty). */
export function topOf(c: Canvas): [number, number] {
  for (let y = 0; y < c.h; y++) {
    let a = -1;
    let b = -1;
    for (let x = 0; x < c.w; x++) {
      if (!c.solid(x, y)) continue;
      if (a < 0) a = x;
      b = x;
    }
    if (a >= 0) return [y, Math.round((a + b) / 2)];
  }
  return [-1, -1];
}

/** A filled ellipse of ground shadow centered at (cx, cy). */
export function groundShadow(c: Canvas, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / (rx + 0.35);
      const dy = (y - cy) / (ry + 0.35);
      if (dx * dx + dy * dy <= 1 && c.in(x, y)) c.shadow[y * c.w + x] = 1;
    }
  }
}
