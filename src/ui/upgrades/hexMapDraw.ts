/**
 * The upgrade map, drawn on one canvas the size of the screen (Dumpster Legend's hexMapDraw.ts,
 * dressed for Rolling Knight). A canvas costs the same however big the map grows: one screen of
 * pixels, and only the hexes on screen are drawn.
 *
 * The look: flat-top hexes, each an enamel tile in a riveted rim (iron for the next ones to buy, steel
 * blue once owned, brass for the gold specials), shaded top to bottom with a shine along the top; tier
 * numerals, names or prices in the pixel font with a dark outline; links between them; a still glow
 * behind the ones you can afford, a gold ring round the selected one. Words and shapes scale with the
 * zoom; the icons don't (they stay one art pixel to var(--px), and hide when zoomed far out).
 *
 * Units: "stage px" are Dumpster Legend's (6 to an art pixel: UI_PX), so its geometry carries over
 * as it was; the map in map px is drawn at `v.k` stage px per map px.
 */
import type { HexNode, HexView } from '../../core/upgradeTree';
import type { IconPic } from './icons';

/* ---------------------------------------------------------------- geometry (map px) */

/** Stage px per art pixel (Dumpster Legend's UI_PX): the icons draw at exactly one art pixel each. */
export const UI_PX = 6;
/** Hex circumradius (flat-top hexes). */
export const R = 100;
export const HW = R;
export const HH = (Math.sqrt(3) / 2) * R;
const X_STEP = 1.5 * R;
const Y_STEP = HH;
/** Drawn hexes are a bit smaller than their cell, leaving a gap the links show through. */
export const DRAW = 0.93;
export const nodeX = (n: Pick<HexNode, 'col'>) => n.col * X_STEP;
export const nodeY = (n: Pick<HexNode, 'row'>) => n.row * Y_STEP;
/** Hex distance from the center, for the opening ripple. */
export const ring = (n: Pick<HexNode, 'col' | 'row'>) => Math.max(Math.abs(n.col), (Math.abs(n.col) + Math.abs(n.row)) / 2);

export interface View {
  x: number;
  y: number;
  k: number;
}

/**
 * What the hexes show at a zoom: 'near' everything (tier, icon, name or price), 'mid' only their icons
 * (the words would be too small to read), 'far' only their colors (too small for the icons, which
 * never shrink).
 */
export type Zoom = 'near' | 'mid' | 'far';
export const zoomOf = (k: number): Zoom => (k >= 0.85 ? 'near' : k >= 0.45 ? 'mid' : 'far');
/** Up close, a hex's icon sits this far above its center (map px), between the tier and the name or price. */
const iconLift = (view: HexView) => (view === 'open' ? 9 : 13);

/** One hex as the canvas draws it (UpgradeMap.tsx works out the words and the art). */
export interface DrawHex {
  node: HexNode;
  view: HexView;
  afford: boolean;
  /** Roman numeral of its tier (null for one-offs). */
  tier: string | null;
  /** Its name in lines that fit (owned hexes show it), and the font size (map px) they fit at. */
  name: string[];
  namePx: number;
  /** Its price (open hexes show it). */
  price: string;
  icon: IconPic | null;
}

export interface DrawState {
  hexes: DrawHex[];
  /** The hexes each link joins (the second one's view colors it). */
  links: Array<[HexNode, HexNode, HexView]>;
  sel: string;
  calm: boolean;
  /** performance.now() when the map opened (the ripple). */
  openedAt: number;
  /** Hexes that appeared or changed after it opened: bought (a flash) or revealed (a blink). */
  fresh: Map<string, number>;
}

/** The hex under map point (mx, my), if one is shown there. */
export function hexAt(hexes: readonly DrawHex[], mx: number, my: number): DrawHex | null {
  for (const h of hexes) {
    const dx = Math.abs(mx - nodeX(h.node));
    const dy = Math.abs(my - nodeY(h.node));
    if (dy <= HH && dx + dy / Math.sqrt(3) <= R) return h;
  }
  return null;
}

/* ---------------------------------------------------------------- look */

/** The skin's ink (styles.css --ink): every outline. */
export const INK = '#180702';
/** The UI's pixel font, bold like its buttons. */
const FONT = '"RK Digits", "Pixelify Sans", "Courier New", monospace';
const font = (px: number) => `700 ${px}px ${FONT}`;
/** Each face shaded top to bottom: steel enamel once owned, iron when open, brass for owned specials, dark iron for "?". */
export const FACE: Record<'open' | 'owned' | 'gold' | 'mystery', [string, string]> = {
  open: ['#5d534c', '#241d1a'],
  owned: ['#9fd2ff', '#2f66b0'],
  gold: ['#ffeaa0', '#df9a2c'],
  mystery: ['#3b312c', '#1a1310'],
};
const LINK: Record<HexView, string> = { owned: '#9fd2ff', open: '#ffd257', mystery: '#4a3e37' };
/** The selection ring (the skin's gold). */
const SEL = '#ffd257';
/** The green of something you can afford (the emerald button's light). */
const AFFORD = '#82dc7c';

function rim(h: DrawHex): string {
  if (h.view === 'owned') return h.node.special ? '#fff0c0' : '#d4ecff';
  if (h.view === 'mystery') return h.node.special ? '#9a7426' : '#4a3e37';
  if (h.afford) return AFFORD;
  return h.node.special ? '#ffcf4a' : '#8a7e73';
}

/** The rivets in a hex's corners: brass on specials, silver once owned, iron otherwise. */
function rivet(h: DrawHex): [string, string] {
  if (h.node.special) return ['#fff4c4', '#8a5a12'];
  if (h.view === 'owned') return ['#ffffff', '#5a7aa0'];
  return ['#b3a393', '#3a302b'];
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}

/** The pixel font joins "fi" and "fl" into one odd glyph: keep the letters apart. */
const plain = (s: string) => s.replace(/f([il])/g, 'f‌$1');

/** Sets the font (and its letter spacing) only when it changes: browsers parse the font text every time. */
function useFont(ctx: CanvasRenderingContext2D, px: number): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string; __px?: number };
  if (c.__px === px) return;
  c.__px = px;
  c.font = font(px);
  if ('letterSpacing' in c) c.letterSpacing = `${(px * 0.04).toFixed(2)}px`;
}
const widths = new Map<string, number>();

/**
 * The canvas was resized, which resets its font: set it afresh on the next draw, and measure prices
 * again (they were measured in the reset font).
 */
export function fontReset(ctx: CanvasRenderingContext2D): void {
  (ctx as CanvasRenderingContext2D & { __px?: number }).__px = undefined;
  widths.clear();
}

/** Words with the UI's dark outline: the outline drawn first, the letters over it. */
function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, stroke: number, fill: string): void {
  useFont(ctx, px);
  const s = plain(text);
  if (stroke > 0) {
    ctx.lineWidth = stroke;
    ctx.strokeStyle = INK;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(s, x, y);
}

/** Splits `text` into lines no wider than `width` (map px) in the name's font. */
export function wrapName(ctx: CanvasRenderingContext2D, text: string, width = 164, px = 26): string[] {
  useFont(ctx, px);
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(next).width > width) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** How far through a flash or blink (0 to 1, in `steps` steps), or null when over. */
function stepped(ms: number, dur: number, steps: number): number | null {
  if (ms >= dur) return null;
  return Math.floor((Math.max(0, ms) / dur) * steps) / steps;
}

function drawHex(ctx: CanvasRenderingContext2D, h: DrawHex, zoom: Zoom, selected: boolean, k: number, sx: number, freshMs: number | null): void {
  const cx = nodeX(h.node);
  const cy = nodeY(h.node);
  const outer = R * DRAW;
  const inner = R * DRAW - 12;
  // Bought just now: it lights up and settles. Revealed just now: it blinks in.
  let alpha = 1;
  let light = 0;
  if (freshMs !== null) {
    if (h.view === 'owned') {
      const p = stepped(freshMs, 560, 5);
      if (p !== null) light = p < 0.55 ? 0.62 - (p / 0.55) * 0.32 : 0.3 * (1 - (p - 0.55) / 0.45);
    } else {
      const p = stepped(freshMs, 420, 4);
      if (p !== null) {
        alpha = p;
        light = 0.45 * (1 - p);
      }
    }
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  // The rim, with its dark outline.
  hexPath(ctx, cx, cy, outer);
  ctx.fillStyle = rim(h);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
  // The face, shaded top to bottom, set in with a dark line.
  const [top, bottom] = FACE[h.view === 'owned' ? (h.node.special ? 'gold' : 'owned') : h.view];
  const fh = (Math.sqrt(3) / 2) * inner;
  const g = ctx.createLinearGradient(0, cy - fh, 0, cy + fh);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  hexPath(ctx, cx, cy, inner);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(24, 7, 2, 0.55)';
  ctx.stroke();
  // Rivets in the rim's corners.
  const [hi, lo] = rivet(h);
  const rr = outer - 6.5;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const x = cx + rr * Math.cos(a) * 0.93;
    const y = cy + rr * Math.sin(a) * 0.93;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 5, y - 5, 10, 10);
    ctx.fillStyle = lo;
    ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.fillStyle = hi;
    ctx.fillRect(x - 3, y - 3, 3, 3);
  }
  // The shine along the top.
  ctx.beginPath();
  ctx.moveTo(cx - outer + 40, cy - HH * DRAW + 22);
  ctx.lineTo(cx + outer - 58, cy - HH * DRAW + 22);
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.strokeStyle = h.view === 'open' ? 'rgba(255,240,220,0.22)' : h.view === 'mystery' ? 'rgba(255,240,220,0.1)' : 'rgba(255,255,255,0.55)';
  ctx.stroke();
  // The selected one: a gold ring with a glow.
  if (selected) {
    hexPath(ctx, cx, cy, outer);
    ctx.lineWidth = 10;
    ctx.strokeStyle = SEL;
    ctx.shadowColor = SEL;
    ctx.shadowBlur = 12 * k * sx;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }
  // The words.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 2;
  const boxTop = cy - HH;
  if (h.view === 'mystery') {
    outlined(ctx, '?', cx, cy - 2, 92, 10, h.node.special ? '#ffd257' : '#fff4dc');
  } else if (zoom === 'near') {
    if (h.tier) outlined(ctx, h.tier, cx, boxTop + 9 + 15, 28, 7, h.view === 'open' ? '#ffe28a' : '#fff');
    if (h.view === 'open') {
      // The price in its box: green when you can afford it.
      useFont(ctx, 30);
      let tw = widths.get(h.price);
      if (tw === undefined) {
        tw = ctx.measureText(plain(h.price)).width;
        // (A new price every tier: never more than a few thousand kept.)
        if (widths.size > 3000) widths.clear();
        widths.set(h.price, tw);
      }
      const bw = tw + 24 + 8;
      const bh = 46;
      const bx = cx - bw / 2;
      const by = boxTop + 121;
      ctx.fillStyle = INK;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = h.afford ? '#3c964a' : '#1a0f0b';
      ctx.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
      ctx.fillStyle = h.afford ? 'rgba(130,220,124,0.55)' : 'rgba(255,210,87,0.18)';
      ctx.fillRect(bx + 4, by + 4, bw - 8, 3);
      outlined(ctx, h.price, cx, by + bh / 2 + 1, 30, 0, h.afford ? '#fff' : '#ffd257');
    } else {
      const np = h.namePx;
      const lift = h.name.length > 1 ? (26 - np) * 0.5 : (26 - np) * 0.3;
      h.name.forEach((line, i) => outlined(ctx, line, cx, boxTop + 113 + 13.8 + lift + i * (np + 0.5), np, np * 0.23, '#fff'));
    }
  }
  // "!" when you can buy it: a red square with a dark border.
  if (h.view === 'open' && h.afford) {
    const bx = cx + HW - 26 - 42;
    const by = boxTop + 4;
    ctx.fillStyle = INK;
    ctx.fillRect(bx, by, 42, 42);
    ctx.fillStyle = '#c4252f';
    ctx.fillRect(bx + 4, by + 4, 34, 34);
    ctx.fillStyle = '#ee6c5e';
    ctx.fillRect(bx + 4, by + 4, 34, 4);
    outlined(ctx, '!', bx + 21, by + 23, 30, 5, '#fff');
  }
  if (light > 0) {
    hexPath(ctx, cx, cy, outer + 4);
    ctx.fillStyle = `rgba(255,248,230,${light.toFixed(3)})`;
    ctx.fill();
  }
  ctx.restore();
  // (restore() put back the font from before this hex: the next words must set theirs again. Dumpster
  // Legend's map forgot this, and its later "?" marks came out in the canvas's tiny default font.)
  (ctx as CanvasRenderingContext2D & { __px?: number }).__px = undefined;
}

function drawGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, a0: number, a1: number): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, `rgba(130,220,124,${a0.toFixed(3)})`);
  g.addColorStop(0.55, `rgba(130,220,124,${a1.toFixed(3)})`);
  g.addColorStop(1, 'rgba(130,220,124,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

const icons = new Map<string, HTMLImageElement>();
/** An icon's picture, decoded once; `onReady` redraws when it arrives. */
function iconImage(url: string, onReady: () => void): HTMLImageElement | null {
  let img = icons.get(url);
  if (!img) {
    img = new Image();
    img.onload = onReady;
    img.src = url;
    icons.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** The glow behind a hex you can afford: its radius (map px), and its picture, drawn once. */
const GLOW_R = 140;
let glowPic: HTMLCanvasElement | null = null;
function glowSprite(): HTMLCanvasElement | null {
  if (glowPic) return glowPic;
  const c = document.createElement('canvas');
  c.width = GLOW_R * 2;
  c.height = GLOW_R * 2;
  const g = c.getContext('2d');
  if (!g) return null;
  drawGlow(g, GLOW_R, GLOW_R, 118, 0.34, 0.15);
  drawGlow(g, GLOW_R, GLOW_R, GLOW_R, 0.3, 0.13);
  glowPic = c;
  return c;
}

/**
 * Draws the map. `w` x `h` is the canvas in its own pixels, `sx` its pixels per stage px, `stageW`
 * x `stageH` the area it covers in stage px. Returns whether something is still moving (the opening
 * ripple, a flash or a blink), so the caller keeps drawing frames.
 */
export function drawMap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sx: number,
  stageW: number,
  stageH: number,
  v: View,
  st: DrawState,
  now: number,
  redraw: () => void,
): boolean {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const zoom = zoomOf(v.k);
  // The map area on screen (map px), with room for glows and words spilling over.
  const m = 160;
  const x0 = -v.x / v.k - m;
  const x1 = (stageW - v.x) / v.k + m;
  const y0 = -v.y / v.k - m;
  const y1 = (stageH - v.y) / v.k + m;
  const onScreen = (n: HexNode) => {
    const x = nodeX(n);
    const y = nodeY(n);
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  };
  const since = now - st.openedAt;
  /** Shown yet: the opening ripple pops hexes in ring by ring. */
  const shownYet = (n: HexNode) => st.calm || since >= Math.min(420, ring(n) * 22) + 100;
  let moving = !st.calm && since < 900;
  const freshMs = (key: string): number | null => {
    if (st.calm) return null;
    const at = st.fresh.get(key);
    if (at === undefined || now - at > 600) return null;
    moving = true;
    return now - at;
  };

  ctx.setTransform(sx * v.k, 0, 0, sx * v.k, sx * v.x, sx * v.y);
  // A soft green glow behind each hex you can afford, stamped from one picture (it holds still, so
  // the map is drawn only when something on it changes).
  const glow = glowSprite();
  if (glow) {
    for (const hx of st.hexes) {
      if (hx.view !== 'open' || !hx.afford || !onScreen(hx.node) || !shownYet(hx.node)) continue;
      ctx.drawImage(glow, nodeX(hx.node) - GLOW_R, nodeY(hx.node) - GLOW_R, GLOW_R * 2, GLOW_R * 2);
    }
  }
  // Links: a chain between tiers, ink first, its color over it.
  ctx.lineCap = 'round';
  for (const [a, b, view] of st.links) {
    if (!onScreen(a) && !onScreen(b)) continue;
    if (!shownYet(b)) continue;
    for (const [lw, color] of [[34, INK], [20, LINK[view]]] as const) {
      ctx.beginPath();
      ctx.moveTo(nodeX(a), nodeY(a));
      ctx.lineTo(nodeX(b), nodeY(b));
      ctx.lineWidth = lw;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }
  // Hexes: the selected one and any just bought last, over their neighbors.
  let selected: DrawHex | null = null;
  const late: DrawHex[] = [];
  for (const hx of st.hexes) {
    if (!onScreen(hx.node) || !shownYet(hx.node)) continue;
    if (hx.node.key === st.sel) selected = hx;
    else if (st.fresh.has(hx.node.key) && hx.view === 'owned') late.push(hx);
    else drawHex(ctx, hx, zoom, false, v.k, sx, freshMs(hx.node.key));
  }
  for (const hx of late) drawHex(ctx, hx, zoom, false, v.k, sx, freshMs(hx.node.key));
  if (selected) drawHex(ctx, selected, zoom, true, v.k, sx, freshMs(selected.node.key));
  // Icons: they move with the map but never scale (one art pixel each, a whole number of canvas
  // pixels so the pixel art stays crisp); none far out.
  if (zoom !== 'far') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const ps = Math.max(1, Math.round(sx * UI_PX));
    for (const hx of st.hexes) {
      if (!hx.icon || hx.view === 'mystery' || !onScreen(hx.node) || !shownYet(hx.node)) continue;
      const img = iconImage(hx.icon.url, redraw);
      if (!img) continue;
      const lift = zoom === 'near' ? iconLift(hx.view) : 0;
      const aw = ps * hx.icon.w;
      const ah = ps * hx.icon.h;
      const cx = (v.x + nodeX(hx.node) * v.k) * sx;
      const cy = (v.y + (nodeY(hx.node) - lift) * v.k) * sx;
      const fm = freshMs(hx.node.key);
      ctx.globalAlpha = fm !== null && hx.view !== 'owned' ? (stepped(fm, 420, 4) ?? 1) : 1;
      ctx.drawImage(img, Math.round(cx - aw / 2), Math.round(cy - ah / 2), aw, ah);
    }
    ctx.globalAlpha = 1;
  }
  return moving;
}
