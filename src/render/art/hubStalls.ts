/**
 * The stalls and furniture round the square, drawn block by block like the rest of the hub: lit top
 * faces, darker fronts, crisp outlines tinted from each thing's own colour. A market stall under a
 * striped awning (a sloping canvas top, a scalloped valance, posts, a counter of goods, shelves in the
 * shade behind); the outfitter's tall shelves of jars under a slate board of painted item icons with
 * red geraniums on top; a chalkboard menu on an A-frame; potted bushes; a stump table and stools; a
 * chair; a bench heaped with flower crates; flower planters.
 */
import { GOLD, h2, hline, INK, IRON, Layer, LEAF, clump, leaf, oval, PLANK, planks, rk, sphere, timber, TIMBER, vline, vnoise, type Ramp } from './hubKit';
import type { HubOut } from './hubScene';

export const CANVAS: Ramp = ['#6e6250', '#9a8c72', '#c4b696', '#e2d6ba', '#f4ecd8', '#fffaf0'];
export const RED: Ramp = ['#3a0c10', '#64161c', '#8e2026', '#b82e30', '#d8483e', '#ee6a56'];
export const BLUE: Ramp = ['#10163a', '#1a2462', '#24348e', '#3048b4', '#4664d0', '#6a88e8'];
export const GREEN: Ramp = ['#0c2a16', '#14421e', '#1e5e2a', '#2a7c36', '#3c9a48', '#5ab864'];
export const TERRA: Ramp = ['#3a160c', '#5e2414', '#86361e', '#a84a2a', '#c8663a', '#e0864e'];
const SLATE: Ramp = ['#0c0f10', '#141a1a', '#1c2424', '#263030', '#323e3c'];

// ------------------------------------------------------------------ small blocks

/**
 * A box in 3/4 view: a top face `top` px deep (lighter), a front face below it (darker), with the
 * corner lit. Planked if `wood`.
 */
export function box(L: Layer, x: number, y: number, w: number, top: number, front: number, ramp: Ramp, seed: number, wood = true): void {
  if (wood) {
    planks(L, x, y, w, top, { dir: 'h', board: Math.max(2, Math.min(3, top)), seed, ramp, base: ramp.length - 2.2, joint: 17 });
    planks(L, x, y + top, w, front, { dir: 'h', board: 3, seed: seed + 1, ramp, base: ramp.length * 0.42, joint: 13, nails: true });
  } else {
    L.rect(x, y, w, top, (xx, yy) => rk(ramp, ramp.length - 2 + (vnoise(xx, yy, 4, 3, seed) - 0.5)));
    L.rect(x, y + top, w, front, (xx, yy) => rk(ramp, ramp.length * 0.42 + (vnoise(xx, yy, 4, 3, seed + 1) - 0.5)));
  }
  hline(L, x, x + w - 1, y, rk(ramp, ramp.length - 1));
  hline(L, x, x + w - 1, y + top, rk(ramp, 1));
  for (let yy = y + top; yy < y + top + front; yy++) {
    L.px(x, yy, rk(ramp, ramp.length * 0.6));
    L.px(x + w - 1, yy, rk(ramp, 1));
  }
}

/** A clay pot (lit rim, rounded front) with its top at (x, y), `w` wide. */
export function pot(L: Layer, x: number, y: number, w: number, h: number, ramp: Ramp = TERRA): void {
  // Rim: a lit band, then the body tapering a little toward the foot.
  hline(L, x - 1, x + w, y, rk(ramp, 5));
  hline(L, x - 1, x + w, y + 1, rk(ramp, 3.5));
  for (let yy = y + 2; yy < y + h; yy++) {
    const inset = yy > y + h - 3 ? 1 : 0;
    for (let xx = x + inset; xx < x + w - inset; xx++) {
      const t = (xx - x) / (w - 1);
      L.px(xx, yy, rk(ramp, 3.6 - t * 2 + (t < 0.25 ? 0.6 : 0) - (yy === y + h - 1 ? 0.8 : 0)));
    }
  }
  // The soil showing at the top.
  hline(L, x, x + w - 1, y, '#2a1810');
}

/** Red geraniums in a pot: round heads of tiny flowers over dark leaves. */
function geraniums(L: Layer, x: number, y: number, seed: number): void {
  pot(L, x, y, 6, 5);
  clump(L, x + 3, y - 2, 5, 3, { seed, tone: 0.35, leaf: 2 });
  const reds = ['#7a1418', '#c82a2a', '#ff4a3a', '#ff8a6a'];
  for (let i = 0; i < 3; i++) {
    const fx = x + 1 + i * 2 + Math.round(h2(i, 1, seed) * 1.4 - 0.7);
    const fy = y - 4 - Math.floor(h2(i, 2, seed) * 2);
    for (const [dx, dy, k] of [[0, 0, 2], [1, 0, 1], [0, 1, 1], [1, 1, 0], [0, -1, 3], [-1, 0, 2]] as const) L.px(fx + dx, fy + dy, reds[k]);
  }
}

// ------------------------------------------------------------------ the awning

/**
 * A striped canvas awning: the top slopes toward us from `yBack` to `yFront`, `x0..x1` wide (plus an
 * overhang), stripes front to back, then a scalloped valance hanging 6 px at the front. The shade it
 * throws falls on whatever is drawn under it afterwards (call it last, or tone the area yourself).
 */
export function awning(L: Layer, x0: number, x1: number, yBack: number, yFront: number, stripe: Ramp, seed: number, sw = 6): void {
  const depth = yFront - yBack;
  for (let y = yBack; y < yFront; y++) {
    const t = (y - yBack) / depth;
    // The canvas sags a pixel between the ribs.
    for (let x = x0; x <= x1; x++) {
      const s = Math.floor((x - x0) / sw) % 2;
      const ramp = s ? stripe : CANVAS;
      const ix = (x - x0) % sw;
      let k = ramp.length - 2.2 - t * 1.2 + (ix === 0 ? 0.5 : ix === sw - 1 ? -0.5 : 0) + (vnoise(x, y, 5, 3, seed) - 0.5) * 0.5;
      if (y === yBack) k += 0.8;
      L.px(x, y, rk(ramp, k));
    }
  }
  // The ridge at the back: a pole with end caps.
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    L.px(x, yBack - 2, rk(PLANK, 6));
    L.px(x, yBack - 1, rk(PLANK, 3));
  }
  for (const cx of [x0 - 2, x1 - 1]) {
    for (let yy = yBack - 4; yy <= yBack; yy++) for (let xx = cx; xx < cx + 4; xx++) L.px(xx, yy, rk(GOLD, yy === yBack - 4 ? 6 : xx === cx ? 5 : 3.5));
  }
  // The valance: the stripes carried down a front face, each tab rounded at the bottom.
  for (let y = yFront; y < yFront + 7; y++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      const s = Math.floor((x - x0) / sw) % 2;
      const ix = (((x - x0) % sw) + sw) % sw;
      const iy = y - yFront;
      if (iy >= 5 && (ix === 0 || ix === sw - 1)) continue;
      if (iy === 6 && (ix === 1 || ix === sw - 2)) continue;
      const ramp = s ? stripe : CANVAS;
      let k = ramp.length * 0.45 - (iy >= 5 ? 0.6 : 0) + (ix === 1 ? 0.4 : 0);
      if (iy === 0) k += 1.4;
      L.px(x, y, rk(ramp, k));
    }
  }
}

// ------------------------------------------------------------------ the tavern stall (squad)

/**
 * The tavern stall on the left: posts and a red-striped awning over a counter (a keg with a tap,
 * mugs, a loaf, a cheese), shelves behind with bottles and jars, and the glowing round display: a
 * big round lamp in a brass ring on the middle shelf.
 */
export function tavernStall(out: HubOut): void {
  const x0 = 62;
  const x1 = 140;
  const base = 176;
  const L = new Layer(x0 - 10, 100, x1 - x0 + 20, base - 100 + 4);
  // Back wall: dark boards in the shade of the awning.
  for (let y = 126; y < base - 17; y++) {
    for (let x = x0 + 2; x < x1 - 2; x++) {
      const bx = (x - x0) % 6;
      let k = 1.5 + (vnoise(x * 4, y, 1.3, 8, 3) - 0.5) * 1.1;
      if (bx === 0) k = 0.5;
      else if (bx === 1) k += 0.7;
      L.px(x, y, rk(TIMBER, k + (y - 126) / 40));
    }
  }
  // Shelves: two boards with bottles, mugs and jars; the round display between them.
  const shelves = [146, 158];
  for (const sy of shelves) {
    for (let x = x0 + 3; x < x1 - 3; x++) {
      L.px(x, sy, rk(PLANK, 5.4));
      L.px(x, sy + 1, rk(PLANK, 3));
    }
  }
  shelfGoods(L, x0 + 4, x1 - 4, shelves[0], 1, ['bottle', 'bottle', 'mug', 'jar', 'bottle', 'jar', 'mug', 'bottle', 'bottle', 'jar', 'mug', 'bottle'], [84, 100]);
  // The counter: a planked front, a lit top, a striped cloth skirt.
  const cy = base - 16;
  box(L, x0, cy, x1 - x0, 4, 12, PLANK, 7);
  for (let y = cy + 5; y < base - 1; y++) {
    for (let x = x0 + 2; x < x1 - 2; x++) {
      if ((x - x0) % 10 >= 5) continue;
      L.tint(x, y, '#c8323a', 0.6);
    }
  }
  // The glowing round display: a brass ring of warm glass on the counter's back, an orb inside.
  roundDisplay(L, 92, 146, 7);
  // On the counter: a keg with a brass tap, mugs, a loaf, a candle, a cheese.
  keg(L, x0 + 4, cy - 1);
  mug(L, x0 + 18, cy, 0);
  mug(L, x0 + 22, cy, 1);
  bread(L, x0 + 40, cy);
  mug(L, x1 - 24, cy, 2);
  candle(L, x1 - 15, cy);
  cheeseWheel(L, x1 - 10, cy);
  // Posts and the awning; its shade on the shelves under it.
  for (const px of [x0 - 1, x1 - 3]) timber(L, px, 132, 4, base - 132 - 1, 70 + px);
  for (let y = 126; y < 138; y++) for (let x = x0 + 3; x < x1 - 3; x++) L.tone(x, y, -0.3 + (y - 126) * 0.02);
  awning(L, x0 - 6, x1 + 4, 112, 131, RED, 41);
  // Kegs stacked beside the stall.
  barrel(L, x0 - 8, base, 51);
  L.outlineTinted(0.75);
  L.light(92, 148, 46, '#ffc86a', 0.75);
  L.light(x1 - 15, cy - 6, 28, '#ffb050', 0.5, 0.4);
  out.piece(L, 'tavern', base);
  out.shadows.push({ kind: 'band', x: (x0 + x1) / 2 + 4, y: base, rx: (x1 - x0) / 2 + 4, ry: 4, strength: 0.38 });
}

/** A standing barrel (lit staves, iron hoops) with its foot at (x.., y). */
export function barrel(L: Layer, x: number, y: number, seed: number): void {
  const w = 9;
  for (let yy = y - 12; yy < y; yy++) {
    const iy = yy - (y - 12);
    const bulge = iy > 2 && iy < 9 ? 1 : 0;
    for (let xx = x - bulge; xx < x + w + bulge; xx++) {
      const t = (xx - x + bulge) / (w + bulge * 2 - 1);
      const hoop = iy === 2 || iy === 9;
      const stave = (xx - x) % 3 === 0;
      L.px(xx, yy, hoop ? rk(IRON, 4.4 - t * 3) : rk(PLANK, 5.2 - t * 3.4 - (stave ? 0.6 : 0) + (h2(xx, yy, seed) - 0.5) * 0.4));
    }
  }
  // The lid: a lit oval.
  for (let xx = x; xx < x + w; xx++) {
    L.px(xx, y - 13, rk(PLANK, 6));
    L.px(xx, y - 12, rk(PLANK, 4.6));
  }
}

function roundDisplay(L: Layer, cx: number, cy: number, r: number): void {
  oval(L, cx, cy, r + 1.5, r + 1.5, (x, y, nx, ny) => rk(GOLD, 3.4 - ny * 1.6 - nx * 0.6 - (Math.hypot(nx, ny) > 0.9 ? 1.4 : 0)));
  oval(L, cx, cy, r - 0.5, r - 0.5, (x, y, nx, ny) => {
    const d = Math.hypot(nx, ny);
    L.gl(x, y, rk(['#c06a22', '#e08a32', '#f4a844', '#ffc25c', '#ffd57a', '#ffe7a4', '#fff6d6'], 5.2 - d * 3 - ny * 0.5));
    return null;
  });
  // The orb on its stand.
  sphere(L, cx, cy - 1, 3, 3, ['#8a5a1a', '#e0a030', '#ffe080', '#fffbe0'], { spec: '#ffffff', glow: true });
  for (let y = cy + 2; y < cy + r - 1; y++) L.px(cx, y, rk(GOLD, 2));
  hline(L, cx - 2, cx + 2, cy + r - 2, rk(GOLD, 2.5));
  for (let x = cx - 2; x <= cx + 2; x++) {
    L.unglow(x, cy + r - 2);
    if (x === cx) for (let y = cy + 2; y < cy + r - 1; y++) L.unglow(x, y);
  }
  // A glint on the glass.
  L.gl(cx - r + 3, cy - r + 4, '#ffffff');
  L.gl(cx - r + 4, cy - r + 3, '#fffbe8');
}

function shelfGoods(L: Layer, xa: number, xb: number, sy: number, seed: number, kinds: string[], skip?: [number, number]): void {
  let x = xa;
  let i = 0;
  while (x < xb - 4 && i < 40) {
    const kind = kinds[i % kinds.length];
    // Leave room for the round display.
    if (skip && x > skip[0] - 4 && x < skip[1]) {
      x = skip[1];
      continue;
    }
    x += shelfItem(L, kind, x, sy, seed * 31 + i) + 1 + Math.floor(h2(i, seed, 5) * 2);
    i++;
  }
}

function shelfItem(L: Layer, kind: string, x: number, sy: number, seed: number): number {
  const glassCols = [['#1a3a14', '#2e6a24', '#5aa040'], ['#3a1a0e', '#7a3a1a', '#c0702a'], ['#1a2440', '#2e4a7a', '#5a86c0'], ['#4a1020', '#8a2034', '#d04a5a']];
  switch (kind) {
    case 'bottle': {
      const c = glassCols[Math.floor(h2(seed, 1, 1) * glassCols.length)];
      L.px(x + 1, sy - 7, '#c8a878');
      L.px(x + 1, sy - 6, c[1]);
      for (let y = 0; y < 5; y++) for (let xx = 0; xx < 3; xx++) L.px(x + xx, sy - 5 + y, c[xx === 0 ? 2 : xx === 2 ? 0 : 1]);
      L.px(x + 1, sy - 3, '#e8dcc0');
      L.px(x, sy - 4, '#ffffff');
      return 3;
    }
    case 'jar': {
      const fill = ['#c87a2a', '#7a2a5a', '#5a8a2a', '#d0a040'][Math.floor(h2(seed, 2, 2) * 4)];
      for (let y = 0; y < 5; y++) for (let xx = 0; xx < 4; xx++) L.px(x + xx, sy - 5 + y, y === 0 ? '#a07040' : y === 1 ? '#c8c0b0' : xx === 0 ? '#e8e0d0' : fill);
      return 4;
    }
    case 'mug': {
      for (let y = 0; y < 4; y++) for (let xx = 0; xx < 3; xx++) L.px(x + xx, sy - 4 + y, y === 0 ? '#f4ecd8' : xx === 0 ? '#b07a44' : '#7a5030');
      L.px(x + 3, sy - 3, '#7a5030');
      L.px(x + 3, sy - 2, '#5a3820');
      return 4;
    }
    case 'cheese': {
      for (let y = 0; y < 3; y++) for (let xx = 0; xx < 5; xx++) L.px(x + xx, sy - 3 + y, y === 0 ? '#ffe080' : xx === 4 ? '#c08a2a' : '#f0c040');
      L.px(x + 2, sy - 2, '#c08a2a');
      return 5;
    }
    case 'bread': {
      for (let y = 0; y < 3; y++) for (let xx = 0; xx < 6; xx++) {
        if (y === 0 && (xx === 0 || xx === 5)) continue;
        L.px(x + xx, sy - 3 + y, y === 0 ? '#e8b060' : y === 1 ? '#c8843a' : '#8a5422');
      }
      L.px(x + 2, sy - 3, '#f8d890');
      L.px(x + 4, sy - 2, '#f0c070');
      return 6;
    }
    case 'keg': {
      for (let y = 0; y < 6; y++) for (let xx = 0; xx < 5; xx++) L.px(x + xx, sy - 6 + y, y === 1 || y === 4 ? IRON[3] : rk(PLANK, xx === 0 ? 5 : xx === 4 ? 2 : 3.6));
      return 5;
    }
  }
  return 3;
}

function keg(L: Layer, x: number, y: number): void {
  // A small barrel on its side on a cradle, a brass tap at the front.
  oval(L, x + 5, y - 5, 6, 5, (xx, yy, nx, ny) => {
    const ring = Math.abs(nx) > 0.55 && Math.abs(nx) < 0.72;
    if (ring) return rk(IRON, 4 - ny * 1.5);
    return rk(PLANK, 4.4 - ny * 1.8 - Math.abs(nx) * 0.8 + ((xx + 1) % 3 === 0 ? -0.6 : 0));
  });
  L.px(x + 5, y - 2, '#e0b040');
  L.px(x + 5, y - 1, '#8a5a1a');
  hline(L, x + 1, x + 9, y, rk(TIMBER, 3));
}

function mug(L: Layer, x: number, y: number, v: number): void {
  for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 3; xx++) L.px(x + xx, y - 4 + yy, yy === 0 ? '#fff6e0' : xx === 0 ? ['#c8945a', '#a8a8b8', '#c87a4a'][v] : ['#8a5a30', '#6a6a7a', '#8a4a2a'][v]);
  L.px(x, y - 5, '#fffaf0');
  L.px(x + 1, y - 5, '#f4ecd8');
  L.px(x + 3, y - 3, '#6a4020');
  L.px(x + 3, y - 2, '#6a4020');
}

function bread(L: Layer, x: number, y: number): void {
  shelfItem(L, 'bread', x, y, 0);
  shelfItem(L, 'bread', x + 3, y - 2, 1);
}

function cheeseWheel(L: Layer, x: number, y: number): void {
  oval(L, x + 3, y - 3, 3.5, 2.6, (xx, yy, nx, ny) => (ny < -0.2 ? '#ffe68a' : nx > 0.4 ? '#c8902a' : '#f0c040'));
  L.px(x + 4, y - 2, '#fff8c8');
}

/** A candle in a little brass dish (its flame glows). */
export function candle(L: Layer, x: number, y: number, tall = 4): void {
  hline(L, x - 1, x + 2, y - 1, rk(GOLD, 3));
  for (let yy = 0; yy < tall; yy++) {
    L.px(x, y - 2 - yy, '#f4ead2');
    L.px(x + 1, y - 2 - yy, '#d8c8a8');
  }
  L.gl(x, y - 2 - tall, '#ffb040');
  L.gl(x, y - 3 - tall, '#fff2a8');
  L.halo(x - 1, y - 3 - tall, '#ffb040', 0.35);
  L.halo(x + 1, y - 3 - tall, '#ffb040', 0.35);
  L.halo(x, y - 4 - tall, '#ffd070', 0.4);
}

// ------------------------------------------------------------------ the outfitter's shelves (upgrades)

/**
 * Tall shelves of jars and goods against the right side of the square, a dark slate board above
 * them painted with item icons (an hourglass, a clover, a reel, a boot, a gear, a coin, a potion, an
 * arrow up), and a row of red geraniums in pots along the top.
 */
export function outfitterShelves(out: HubOut): void {
  const x0 = 342;
  const x1 = 418;
  const base = 176;
  const L = new Layer(x0 - 8, 84, x1 - x0 + 16, base - 84 + 4);
  // The board on two posts.
  const by0 = 104;
  const by1 = 124;
  for (const px of [x0 + 1, x1 - 5]) timber(L, px, by0 - 2, 4, base - by0 + 1, 90 + px);
  for (let y = by0; y < by1; y++) {
    for (let x = x0; x < x1; x++) {
      const frame = y < by0 + 2 || y >= by1 - 2 || x < x0 + 2 || x >= x1 - 2;
      if (frame) {
        L.px(x, y, rk(PLANK, y === by0 || x === x0 ? 6 : y >= by1 - 1 || x === x1 - 1 ? 2 : 4));
        continue;
      }
      L.px(x, y, rk(SLATE, 2 + (vnoise(x, y, 6, 5, 7) - 0.5) * 1.2 + (y === by0 + 2 ? 1 : 0)));
    }
  }
  // Painted item icons in two rows (chalky colors, a faint luminous glow).
  const icons = ['hourglass', 'clover', 'reel', 'boot', 'gear', 'coin', 'potion', 'arrow', 'star', 'sword'];
  icons.forEach((ic, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    icon(L, x0 + 5 + col * 14, by0 + 3 + row * 8, ic, row === 0 ? 1 : 0);
  });
  // Geraniums along the top of the board.
  for (let i = 0; i < 5; i++) geraniums(L, x0 + 3 + i * 15, by0 - 5, 200 + i);
  // The shelves below: three boards of jars and odds and ends, the back in shade.
  for (let y = by1; y < base - 2; y++) {
    for (let x = x0 + 4; x < x1 - 4; x++) {
      const bx = (x - x0) % 6;
      let k = 1.4 + (vnoise(x * 4, y, 1.3, 8, 9) - 0.5) * 1.1;
      if (bx === 0) k = 0.5;
      else if (bx === 1) k += 0.7;
      L.px(x, y, rk(TIMBER, k));
    }
  }
  const shelves = [140, 156, 172];
  for (const sy of shelves) {
    for (let x = x0 + 1; x < x1 - 1; x++) {
      L.px(x, sy, rk(PLANK, 5.6));
      L.px(x, sy + 1, rk(PLANK, 3.2));
    }
  }
  const jarRow = (sy: number, seed: number) => {
    let x = x0 + 5;
    let i = 0;
    while (x < x1 - 9) {
      x += jar(L, x, sy, seed + i) + 1 + (h2(i, seed, 4) < 0.3 ? 1 : 0);
      i++;
    }
  };
  jarRow(shelves[0], 10);
  jarRow(shelves[1], 30);
  let x = x0 + 5;
  for (const k of ['toolbox', 'gears', 'coil', 'spring', 'gears', 'toolbox']) x += oddment(L, k, x, shelves[2]) + 2;
  // A lantern hanging off the board's corner.
  hline(L, x0 - 4, x0 + 1, by1 + 1, IRON[3]);
  L.px(x0 - 4, by1 + 2, IRON[2]);
  lanternBox(L, x0 - 4, by1 + 3);
  L.light(x0 - 4, by1 + 9, 64, '#ffb860', 0.8, 0.25);
  L.light((x0 + x1) / 2, 150, 40, '#ffc070', 0.4);
  // Crates by the shelves.
  box(L, x1 - 2, base - 11, 12, 3, 8, PLANK, 77);
  L.outlineTinted(0.75);
  out.piece(L, 'outfitter', base);
  out.shadows.push({ kind: 'band', x: (x0 + x1) / 2 + 4, y: base, rx: (x1 - x0) / 2 + 2, ry: 4, strength: 0.35 });
}

/** A small square lantern hanging at (x, y): a brass cap, warm glass, a foot. */
export function lanternBox(L: Layer, x: number, y: number): void {
  hline(L, x - 2, x + 2, y, rk(GOLD, 4));
  hline(L, x - 3, x + 3, y + 1, rk(GOLD, 2.5));
  for (let yy = y + 2; yy < y + 8; yy++) {
    for (let xx = x - 2; xx <= x + 2; xx++) {
      if (xx === x - 2 || xx === x + 2) L.px(xx, yy, IRON[2]);
      else L.gl(xx, yy, yy < y + 4 ? '#fff2c0' : xx === x - 1 ? '#ffe090' : '#ffc860');
    }
  }
  hline(L, x - 3, x + 3, y + 8, rk(GOLD, 2.5));
  L.px(x, y + 9, rk(GOLD, 1.5));
  for (const [dx, dy] of [[-3, 3], [3, 3], [-3, 5], [3, 5], [0, 10], [-4, 4], [4, 4]] as const) L.halo(x + dx, y + dy, '#ffb850', 0.3);
}

function jar(L: Layer, x: number, sy: number, seed: number): number {
  const tall = 5 + Math.floor(h2(seed, 1, 3) * 4);
  const w = 4 + (h2(seed, 2, 3) < 0.4 ? 1 : 0);
  const fills: Ramp[] = [
    ['#5a1a10', '#a83a1a', '#e07040'],
    ['#2a3a10', '#5a7a1a', '#9ac040'],
    ['#3a1048', '#6a2a88', '#a860d0'],
    ['#10303a', '#1a6a7a', '#40b0c0'],
    ['#4a3a10', '#a08020', '#f0d040'],
  ];
  const f = fills[Math.floor(h2(seed, 3, 3) * fills.length)];
  for (let y = 0; y < tall; y++) {
    for (let xx = 0; xx < w; xx++) {
      let c: string;
      if (y === 0) c = h2(seed, 4, 3) < 0.5 ? '#8a5a2a' : '#c8c8d0';
      else if (y === 1) c = '#d8d4cc';
      else c = xx === 0 ? '#f0ece4' : f[xx === w - 1 ? 0 : y < tall * 0.5 ? 1 : 2];
      L.px(x + xx, sy - tall + y, c);
    }
  }
  // A label on some.
  if (h2(seed, 5, 3) < 0.5 && tall > 6) for (let xx = 1; xx < w - 1; xx++) L.px(x + xx, sy - Math.ceil(tall / 2), '#f4e8c8');
  return w;
}

function oddment(L: Layer, kind: string, x: number, sy: number): number {
  switch (kind) {
    case 'toolbox':
      for (let y = 0; y < 4; y++) for (let xx = 0; xx < 7; xx++) L.px(x + xx, sy - 4 + y, y === 0 ? '#e8504a' : xx === 0 ? '#c03a34' : '#8a2020');
      hline(L, x + 2, x + 4, sy - 5, IRON[4]);
      return 7;
    case 'gears':
      for (const [cx, r] of [[x + 2, 2.6], [x + 6, 1.8]] as const) {
        oval(L, cx, sy - r - 0.5, r, r, (xx, yy, nx, ny) => (Math.hypot(nx, ny) < 0.4 ? '#2a2a34' : rk(GOLD, 4 - ny * 1.4 - nx * 0.5)));
      }
      return 8;
    case 'coil':
      oval(L, x + 3, sy - 3, 3.5, 2.6, (xx, yy, nx, ny) => (Math.hypot(nx, ny) < 0.45 ? '#3a2416' : ((xx + yy) % 2 ? '#c8a060' : '#9a7840')));
      return 7;
    case 'spring':
      for (let y = 0; y < 6; y++) for (let xx = 0; xx < 3; xx++) if ((y + xx) % 2 === 0) L.px(x + xx, sy - 6 + y, IRON[5]);
      return 3;
  }
  return 4;
}

/** An item icon painted on the slate (8 x 9), chalky and faintly luminous. */
function icon(L: Layer, x: number, y: number, kind: string, _row = 0): void {
  const rows: Record<string, readonly string[]> = {
    hourglass: ['yyyyyy', '.y..y.', '..yy..', '..yy..', '.y..y.', 'yyyyyy'],
    clover: ['.gg.gg', 'gggggg', '.gggg.', 'gggggg', '.gg.gg', '...g..'],
    reel: ['.yyyy.', 'y.ww.y', 'yw..wy', 'yw..wy', 'y.ww.y', '.yyyy.'],
    boot: ['.bb...', '.bb...', '.bb...', '.bbbb.', 'bbbbbb', 'bbbbbb'],
    gear: ['.w.w..', 'wwwww.', 'ww.ww.', 'wwwww.', '.w.w..', '......'],
    coin: ['.yyyy.', 'yyYyyy', 'yyYyyy', 'yyYyyy', 'yyYyyy', '.yyyy.'],
    potion: ['..ww..', '..ww..', '.rrrr.', 'rrrrrr', 'rrrrrr', '.rrrr.'],
    arrow: ['..gg..', '.gggg.', 'gggggg', '..gg..', '..gg..', '..gg..'],
    star: ['..yy..', 'yyyyyy', '.yyyy.', '.yyyy.', 'yy..yy', '......'],
    sword: ['.....w', '....w.', '...w..', 'yyw...', '.y....', 'y.y...'],
  };
  const col: Record<string, string> = { y: '#f0d060', Y: '#fff4b0', g: '#7ae070', w: '#e8eef8', b: '#d89a5a', r: '#ff6a6a' };
  const tpl = rows[kind];
  tpl.forEach((r, yy) => [...r].forEach((ch, xx) => {
    if (ch === '.') return;
    L.px(x + xx, y + yy, col[ch]);
    L.halo(x + xx, y + yy, col[ch], 0.55);
  }));
}

// ------------------------------------------------------------------ furniture

/** A chalkboard menu on an A-frame: a wooden frame, chalk lines, three little helmets (your squad). */
export function chalkboard(out: HubOut, x: number, y: number): void {
  const L = new Layer(x - 10, y - 26, 21, 28);
  // Back legs (the A-frame's other half) peeking out.
  vline(L, x - 7, y - 4, y, rk(TIMBER, 2));
  vline(L, x + 7, y - 4, y, rk(TIMBER, 2));
  // The board.
  const bx0 = x - 8;
  const bx1 = x + 8;
  const by0 = y - 24;
  const by1 = y - 5;
  for (let yy = by0; yy <= by1; yy++) {
    for (let xx = bx0; xx <= bx1; xx++) {
      const frame = yy <= by0 + 1 || yy >= by1 - 1 || xx <= bx0 + 1 || xx >= bx1 - 1;
      if (frame) L.px(xx, yy, rk(PLANK, yy === by0 || xx === bx0 ? 6.2 : yy === by1 || xx === bx1 ? 2.4 : 4.4));
      else L.px(xx, yy, rk(SLATE, 2.2 + (vnoise(xx, yy, 4, 4, 17) - 0.5) * 1.3));
    }
  }
  // Chalk: a title line, three helmets, a few lines of scribble.
  const chalk = '#e8ecf0';
  hline(L, bx0 + 4, bx1 - 4, by0 + 3, chalk);
  L.px(bx0 + 3, by0 + 3, '#ffd0e0');
  L.px(bx1 - 3, by0 + 3, '#ffd0e0');
  for (let i = 0; i < 3; i++) {
    const hx = bx0 + 3 + i * 4;
    const hy = by0 + 6;
    const c = ['#ffe080', '#a8e0ff', '#ffb0c0'][i];
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [2, 1], [0, 2], [2, 2]] as const) L.px(hx + dx, hy + dy, c);
    L.px(hx + 1, hy + 2, '#263030');
  }
  for (let r = 0; r < 3; r++) {
    const ly = by0 + 11 + r * 3;
    const len = 6 + Math.floor(h2(r, 1, 3) * 5);
    for (let xx = 0; xx < len; xx++) if (h2(xx, r, 9) < 0.75) L.px(bx0 + 3 + xx, ly, xx < 2 ? '#ffe080' : '#c8ccd4');
  }
  // Front legs.
  vline(L, bx0 + 1, by1 + 1, y, rk(TIMBER, 4));
  vline(L, bx1 - 1, by1 + 1, y, rk(TIMBER, 3));
  L.outlineTinted(0.75);
  out.piece(L, 'chalkboard', y);
  out.shadows.push({ kind: 'oval', x: x + 3, y: y + 1, rx: 9, ry: 2.5, strength: 0.4 });
}

/** A potted bush: a big clay pot, a round bush of small leaves. */
export function pottedBush(out: HubOut, x: number, y: number, seed: number, size = 1): void {
  const R = Math.round(9 * size);
  const L = new Layer(x - R - 4, y - R * 2 - 12, R * 2 + 9, R * 2 + 16);
  const pw = Math.round(12 * size);
  pot(L, x - Math.floor(pw / 2), y - 9, pw, 9);
  clump(L, x, y - 9 - R * 0.75, R, R * 0.85, { seed, tone: 0.55, leaf: 3 });
  // A few white flowers.
  for (let i = 0; i < 4; i++) {
    const fx = Math.round(x - R * 0.6 + h2(i, 1, seed) * R * 1.2);
    const fy = Math.round(y - 9 - R * 1.3 + h2(i, 2, seed) * R * 0.9);
    L.px(fx, fy, '#fff6f0');
    L.px(fx + 1, fy, '#f0d8e0');
  }
  L.outlineTinted(0.75);
  out.piece(L, `bush${seed}`, y);
  out.shadows.push({ kind: 'oval', x: x + 3, y: y + 1, rx: pw / 2 + 2, ry: 2.5, strength: 0.42 });
}

/** A round stump table (bark sides, a lit top with rings), a small potted plant and a mug on it. */
export function stumpTable(out: HubOut, x: number, y: number): void {
  const L = new Layer(x - 16, y - 26, 33, 30);
  const rx = 13;
  const top = y - 10;
  // The trunk: bark in vertical ridges, darker to the right, roots flaring at the foot.
  for (let yy = top; yy <= y; yy++) {
    const flare = yy > y - 3 ? (yy - (y - 3)) : 0;
    for (let xx = x - rx + 2 - flare; xx <= x + rx - 2 + flare; xx++) {
      const t = (xx - (x - rx)) / (2 * rx);
      const ridge = (xx + Math.floor(h2(xx, 0, 5) * 2)) % 3 === 0;
      L.px(xx, yy, rk(['#1e140e', '#2e2016', '#45301e', '#5e4228', '#7a5834'], 3.4 - t * 2.4 - (ridge ? 0.9 : 0)));
    }
  }
  // The top: rings, lit toward the upper left.
  oval(L, x, top, rx, 4.5, (xx, yy, nx, ny) => {
    const d = Math.hypot(nx, ny * 1.1);
    if (d > 0.88) return '#5e4228';
    const ring = Math.floor(d * 4 + h2(xx, yy, 6) * 0.3) % 2;
    return rk(['#6a4a2a', '#8a6838', '#a8844c', '#c4a068', '#dcbc84'], 3.2 - ny * 0.8 - nx * 0.4 - ring * 0.7);
  });
  // A little potted plant and a mug.
  pot(L, x - 7, top - 4, 5, 4);
  for (let i = 0; i < 4; i++) leaf(L, x - 4.5, top - 4, -Math.PI / 2 + (i - 1.5) * 0.55, 5, 3, { tone: 0.6, seed: 400 + i, shape: 'lance' });
  mug(L, x + 4, top + 1, 0);
  candle(L, x - 1, top + 1, 3);
  L.outlineTinted(0.75);
  L.light(x - 1, top - 6, 34, '#ffb050', 0.55, 0.5);
  out.piece(L, 'table', y);
  out.shadows.push({ kind: 'oval', x: x + 3, y: y + 1, rx: rx + 2, ry: 3, strength: 0.45 });
}

/** A little stump stool (its sort line is a pixel above its foot, so whoever sits on it is drawn after). */
export function stool(out: HubOut, x: number, y: number, id: string): void {
  const L = new Layer(x - 6, y - 8, 13, 10);
  for (let yy = y - 4; yy <= y; yy++) for (let xx = x - 4; xx <= x + 4; xx++) L.px(xx, yy, rk(['#1e140e', '#2e2016', '#45301e', '#5e4228'], 3 - (xx - x + 4) * 0.3 - ((xx + 1) % 3 === 0 ? 0.6 : 0)));
  oval(L, x, y - 5, 4.6, 1.8, (xx, yy, nx, ny) => rk(['#6a4a2a', '#8a6838', '#a8844c', '#c4a068'], 2.6 - ny - nx * 0.4));
  L.outlineTinted(0.75);
  out.piece(L, id, y - 1);
  out.shadows.push({ kind: 'oval', x: x + 2, y: y + 1, rx: 6, ry: 2, strength: 0.4 });
}

/** A wooden chair facing us (its back behind whoever sits in it). */
export function chair(out: HubOut, x: number, y: number, id: string): void {
  const L = new Layer(x - 8, y - 22, 17, 24);
  // Back: two posts and slats, seen behind the sitter.
  for (const px of [x - 5, x + 4]) for (let yy = y - 20; yy <= y; yy++) L.px(px, yy, rk(PLANK, px < x ? 5 : 2.5));
  for (const sy of [y - 19, y - 15]) hline(L, x - 5, x + 4, sy, rk(PLANK, 5));
  for (const sy of [y - 18, y - 14]) hline(L, x - 4, x + 3, sy, rk(PLANK, 3));
  // Seat and front legs.
  L.rect(x - 6, y - 7, 12, 2, (xx, yy) => rk(PLANK, yy === y - 7 ? 6 : 4));
  hline(L, x - 6, x + 5, y - 5, rk(PLANK, 2));
  for (const px of [x - 6, x + 5]) for (let yy = y - 4; yy <= y; yy++) L.px(px, yy, rk(PLANK, px < x ? 4.5 : 2));
  L.outlineTinted(0.75);
  out.piece(L, id, y - 2);
  out.shadows.push({ kind: 'oval', x: x + 3, y: y + 1, rx: 8, ry: 2.5, strength: 0.4 });
}

/** A bench with crates of flowers heaped on and round it. */
export function flowerBench(out: HubOut, x: number, y: number): void {
  const L = new Layer(x - 22, y - 26, 45, 29);
  // The bench: a lit seat, legs, a back rail behind.
  hline(L, x - 18, x + 18, y - 15, rk(PLANK, 5));
  hline(L, x - 18, x + 18, y - 14, rk(PLANK, 3));
  for (const px of [x - 17, x + 16]) for (let yy = y - 18; yy <= y - 15; yy++) L.px(px, yy, rk(PLANK, 3));
  box(L, x - 19, y - 9, 38, 2, 3, PLANK, 51);
  for (const px of [x - 18, x - 17, x + 16, x + 17]) for (let yy = y - 4; yy <= y; yy++) L.px(px, yy, rk(PLANK, px < x ? 4 : 2));
  // Crates of flowers on the seat and one on the ground in front.
  flowerCrate(L, x - 16, y - 18, 14, 61, ['#ff6a8a', '#ffd0e0', '#ff4a6a']);
  flowerCrate(L, x + 1, y - 17, 14, 62, ['#ffd84a', '#ffffff', '#ffb040']);
  flowerCrate(L, x - 6, y - 5, 12, 63, ['#b07aff', '#e0c8ff', '#8a5ae0']);
  L.outlineTinted(0.75);
  out.piece(L, 'flowerBench', y);
  out.shadows.push({ kind: 'oval', x: x + 4, y: y + 1, rx: 20, ry: 3, strength: 0.42 });
}

function flowerCrate(L: Layer, x: number, y: number, w: number, seed: number, cols: readonly string[]): void {
  box(L, x, y, w, 2, 5, PLANK, seed);
  for (let i = 0; i < w; i++) {
    const fx = x + i;
    const tall = 1 + Math.floor(h2(i, 1, seed) * 3);
    for (let t = 0; t < tall; t++) L.px(fx, y - t, rk(LEAF, 3 + t * 0.8 + h2(i, t, seed)));
    if (h2(i, 2, seed) < 0.6) {
      const c = cols[Math.floor(h2(i, 3, seed) * cols.length)];
      L.px(fx, y - tall, c);
      if (h2(i, 4, seed) < 0.4) L.px(fx, y - tall - 1, cols[1]);
    }
  }
}

/** A planter box on the paving: a wooden trough of flowers (Firefly Garden's planters). */
export function planter(out: HubOut, x: number, y: number, w: number, seed: number, cols: readonly string[]): void {
  const L = new Layer(x - 2, y - 16, w + 4, 18);
  box(L, x, y - 8, w, 3, 5, PLANK, seed);
  // Soil, foliage, flowers spilling over the rim.
  hline(L, x + 1, x + w - 2, y - 8, '#2a1a10');
  for (let i = 1; i < w - 1; i++) {
    const tall = 1 + Math.floor(h2(i, 1, seed) * 4);
    for (let t = 0; t < tall; t++) L.px(x + i, y - 8 - t, rk(LEAF, 2.6 + t + h2(i, t, seed) * 1.2));
    if (h2(i, 2, seed) < 0.55) {
      const c = cols[Math.floor(h2(i, 3, seed) * cols.length)];
      L.px(x + i, y - 9 - tall, c);
      if (h2(i, 5, seed) < 0.5) L.px(x + i + 1, y - 9 - tall + 1, c);
    }
  }
  for (let i = 2; i < w - 2; i += 5) {
    const len = 1 + Math.floor(h2(i, 6, seed) * 3);
    for (let t = 0; t < len; t++) L.px(x + i, y - 5 + t, rk(LEAF, 4 - t));
  }
  L.outlineTinted(0.75);
  out.piece(L, `planter${seed}`, y);
  out.shadows.push({ kind: 'oval', x: x + w / 2 + 3, y: y + 1, rx: w / 2 + 2, ry: 2.5, strength: 0.4 });
}

void INK;
