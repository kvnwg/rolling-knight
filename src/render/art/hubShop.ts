/**
 * The Gilded Reel: the shop that is the hub. One big timber front under a dark slate roof, its gable
 * facing the court: the round reel sign glowing in the gable (a gilded ring of bulbs round a deep
 * blue face and a star), the long lit display window under it full of goods, string lights and little
 * flowers along the barge boards, a heavy beam across. Under the beam the big open doorway (a lamp
 * hanging in it, the warm shop inside, the Oracle at the threshold); the left wing's lit curio cabinet
 * of junk and the notice board by the door; the right wing's shelves of bottles and gadgets under the
 * tinker's slate of painted upgrades, a flower basket hanging at the corner.
 */
import { renderText } from '../pixel/font';
import { GOLD, h2, hline, INK, IRON, Layer, oval, PLANK, planks, poly, rk, rkd, sagCurve, timber, TIMBER, vline, vnoise, type Ramp } from './hubKit';
import type { HubOut } from './hubScene';

/** Slate, dark to light: the roof, cool in the night. */
export const SLATE: Ramp = ['#0b0d11', '#12151b', '#1a1e25', '#232830', '#2d333c', '#3a414a', '#4a515a', '#5d646c'];
/** Window glow, deep to bright. */
export const GLASS: Ramp = ['#c06a22', '#e08a32', '#f4a844', '#ffc25c', '#ffd57a', '#ffe7a4', '#fff6d6'];
/** String-light bulb colors. */
export const BULBS = ['#ff5a4a', '#ffd04a', '#ffa04a', '#ff7ad8', '#ffe08a', '#7aff9a'];
const ROSE_FLOWERS = [['#a8203a', '#ff4a5a', '#ffd0d8'], ['#c8507a', '#ff8ab8', '#fff0f4'], ['#c87a20', '#ffb04a', '#fff0c0'], ['#d8d0c0', '#ffffff', '#ffe080']];

/** The shop's geometry (hub px). */
export const SHOP = {
  cx: 128,
  /** The roof's apex, and the eaves either side where the barge boards end. */
  apex: { x: 128, y: 8 },
  eaveL: 22,
  eaveR: 234,
  eaveY: 94,
  /** The beam across the front, under the gable. */
  beam: { y0: 89, y1: 97 },
  /** The front wall's foot (the court begins here). */
  front: 144,
  /** The doorway's opening, under a lit transom. */
  door: { x0: 113, x1: 143, top: 108 },
  sign: { x: 128, y: 41, r: 10 },
  window: { x0: 97, x1: 159, y0: 60, y1: 75 },
  /** The left wing's curio cabinet and the notice board by the door. */
  cabinet: { x0: 40, x1: 86, y0: 103, y1: 139 },
  board: { x0: 91, x1: 107, y0: 109, y1: 135 },
  /** The right wing's slate of painted upgrades and the shelves under it. */
  slate: { x0: 162, x1: 214, y0: 102, y1: 116 },
  shelves: { x0: 158, x1: 216, y0: 119, y1: 140 },
} as const;

/** The barge boards' top edge at x (the gable's outline). */
export function bargeY(x: number): number {
  const S = SHOP;
  const half = x < S.apex.x ? S.apex.x - S.eaveL : S.eaveR - S.apex.x;
  return S.apex.y + (Math.abs(x + 0.5 - S.apex.x) / half) * (S.eaveY - S.apex.y);
}

/** A swag of string lights from (x0, y0) to (x1, y1): a dark wire, bulbs every `gap` px. */
export function stringLights(L: Layer, x0: number, y0: number, x1: number, y1: number, sag: number, gap: number, seed: number): void {
  const pts = sagCurve(x0, y0, x1, y1, sag);
  const wire: Array<[number, number]> = [];
  for (const [x, y] of pts) wire.push([Math.round(x), Math.round(y)]);
  for (const [x, y] of wire) L.px(x, y, '#1a1414');
  wire.forEach(([x, y], i) => {
    if (i === 0 || i === wire.length - 1 || (i + seed) % gap !== 0) return;
    const c = BULBS[Math.floor(h2(x, y, seed) * BULBS.length)];
    // The bulb hanging under the wire (the lower pixel hot), a soft halo of its color round it.
    L.gl(x, y + 1, c);
    L.gl(x, y + 2, mixBulb(c));
    if (h2(x, y, seed + 5) < 0.3) L.twinkles.push({ x, y: y + 2, r: 1, period: 4, on: 3, phase: Math.floor(h2(x, y, seed + 6) * 4) });
    for (const [dx, dy, a] of [[-1, 1, 0.4], [1, 1, 0.4], [-1, 2, 0.45], [1, 2, 0.45], [0, 3, 0.5], [0, 4, 0.2], [-2, 2, 0.15], [2, 2, 0.15]] as const) L.halo(x + dx, y + dy, c, a);
  });
}

function mixBulb(c: string): string {
  // The bulb's hot core: toward white.
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.round(v + (255 - v) * 0.55).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/** A round glass globe lantern hanging from (x, y): a short chain, a brass cap, the glowing globe. */
export function globeLantern(L: Layer, x: number, y: number, r: number, chain = 2): void {
  vline(L, x, y, y + chain - 1, (yy) => (yy % 2 ? IRON[3] : IRON[2]));
  hline(L, x - 1, x + 1, y + chain, rk(GOLD, 2.5));
  L.px(x, y + chain, rk(GOLD, 5));
  const cy = y + chain + 1 + r;
  oval(L, x, cy, r + 0.7, r + 0.7, INK);
  const glass = ['#e88a32', '#ffb84e', '#ffd47a', '#ffeab0', '#fff8e0'];
  oval(L, x, cy, r, r, (px, py, nx, ny) => {
    const d = nx * nx + ny * ny;
    L.gl(px, py, rk(glass, 4 - d * 3.2 - ny * 0.6 + nx * 0.2));
    return null;
  });
  for (let a = 0; a < 20; a++) {
    const ang = (a / 20) * Math.PI * 2;
    for (const [d, al] of [[r + 1.5, 0.5], [r + 2.5, 0.22]] as const) L.halo(Math.round(x + Math.cos(ang) * d - 0.5), Math.round(cy + Math.sin(ang) * d - 0.5), '#ffb850', al);
  }
  L.gl(x - Math.max(1, Math.round(r * 0.45)), cy - Math.max(1, Math.round(r * 0.5)), '#ffffff');
  hline(L, x - 1, x + 1, cy + r + 1, rk(GOLD, 2.5));
}

/** Warm vertical boards (siding), each its own tone, a lit left edge and a dark seam. */
function boards(L: Layer, x0: number, y0: number, x1: number, y1: number, seed: number, base: number, inside?: (x: number, y: number) => boolean): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (inside && !inside(x, y)) continue;
      const b = Math.floor((x - x0) / 5);
      const bx = (x - x0) % 5;
      let k = base + (h2(b, 0, seed) - 0.5) * 0.9 + (vnoise(x * 5, y, 1.3, 7, seed + 1) - 0.5) * 1.1;
      if (bx === 0) k = base - 1.7;
      else if (bx === 1) k += 0.8;
      else if (bx === 4) k -= 0.5;
      // A knot now and then.
      if (h2(b, Math.floor(y / 9), seed + 2) < 0.08 && bx === 2 && y % 9 === 4) k -= 1.2;
      L.px(x, y, rkd(TIMBER, k, x, y));
    }
  }
}

// ------------------------------------------------------------------ the shop

export function paintShop(out: HubOut): void {
  const S = SHOP;
  const L = new Layer(0, 0, 256, S.front + 1);
  roof(L);
  gable(L);
  groundFloor(L);
  stringAndFlowers(L);
  // Light from the shop: the sign, the window, the doorway and its lamp, the cabinet, the shelves.
  L.light(S.sign.x, S.sign.y, 60, '#ffcc66', 0.6);
  L.light(S.cx, S.window.y1, 70, '#ffa448', 0.6);
  L.light(S.cx, S.door.top + 8, 46, '#ffb456', 0.6, 0.18);
  L.light(S.cx, S.front + 4, 84, '#ffc070', 0.72, 0.1);
  L.light(S.cx, S.front + 22, 92, '#ffbc68', 0.3);
  L.light((S.cabinet.x0 + S.cabinet.x1) / 2, (S.cabinet.y0 + S.cabinet.y1) / 2, 50, '#ffb862', 0.6, 0.08);
  L.light(S.eaveR - 11, S.beam.y1 + 8, 50, '#ffae58', 0.55, 0.12);
  out.piece(L, 'shop', S.front, { x0: S.eaveL, y0: S.front - 16, x1: S.eaveR, y1: S.front });
  out.shadows.push({ kind: 'band', x: S.cx, y: S.front, rx: 106, ry: 4, strength: 0.42 });
}

/**
 * The roof seen from above either side of the gable: slate in courses running back from the barge
 * boards to the ridge (each course's lower edge lit, a shadow line under it), the left slope catching
 * the moonlight, the right one in shade; moss here and there; the ridge running back from the apex;
 * a little chimney with a wisp of smoke.
 */
function roof(L: Layer): void {
  const S = SHOP;
  const ax = S.apex.x;
  const x0 = S.eaveL - 6;
  const x1 = S.eaveR + 6;
  for (let y = 0; y < S.eaveY + 4; y++) {
    for (let x = x0; x < x1; x++) {
      if (y >= bargeY(x) - 2) continue;
      const left = x < ax;
      // Seen from above, a slope's courses run straight back from the barge boards (vertical strips
      // on screen), and each slate's ends run parallel to the barge boards; strips stagger by half.
      const u = left ? ax - 1 - x : x - ax;
      const c = Math.floor(u / 5);
      const iu = u % 5;
      const v = bargeY(x) - y + (c % 2) * 3.5;
      const ti = Math.floor(v / 7);
      const iv = Math.floor(v) % 7;
      const id = h2(c, ti, left ? 31 : 32);
      let k = (left ? 4.8 : 3.4) + (id - 0.5) * 1.1 + (vnoise(x, y, 9, 13, 33) - 0.5) * 0.7;
      // Each course's lower (outer) edge lies over the next: lit along it, the next one in its shadow.
      if (iu === 4) k += 0.6;
      if (iu === 0) k -= 0.9;
      // Each slate's lower end (toward the front) is lit; a dark gap behind its upper end.
      if (iv === 0) k += 0.7;
      if (iv === 6) k -= 1;
      // Darker going back (further away), and out toward the roof's ends.
      k -= Math.min(1.4, Math.max(0, (bargeY(x) - y - 40) / 40));
      if (id > 0.95) k -= 0.9;
      if (id < 0.04) k += 0.7;
      let col = rkd(SLATE, k, x, y);
      if (vnoise(x, y, 14, 10, 34) > 0.68 && h2(x, y, 35) < 0.45 && iv > 1 && iv < 6) col = rk(['#141e14', '#1c2a18', '#26381c', '#30461e'], 1 + h2(x, y, 36) * 2.2);
      L.px(x, y, col);
    }
  }
  // The roof's ends (the eaves seen from above): a dark line.
  for (let y = 0; y < S.eaveY; y++) {
    for (const x of [x0, x1 - 1]) if (y < bargeY(x) - 2) L.px(x, y, INK);
  }
  // Moonlight on the slates.
  L.light(70, 6, 110, '#8a9ab0', 0.35);
  L.light(190, 6, 110, '#7a8aa0', 0.3);
  // The ridge running back from the apex: capping tiles, lit on the left.
  for (let y = 0; y < S.apex.y - 1; y++) {
    L.px(ax - 2, y, INK);
    L.px(ax - 1, y, rk(SLATE, 6.6 - (y % 4 === 0 ? 1.4 : 0)));
    L.px(ax, y, rk(SLATE, 4.8 - (y % 4 === 0 ? 1.4 : 0)));
    L.px(ax + 1, y, rk(SLATE, 2.6));
    L.px(ax + 2, y, INK);
  }
  // A little stone chimney on the right slope.
  const cx = 168;
  for (let y = 0; y < 16; y++) {
    for (let x = cx; x < cx + 9; x++) {
      const row = Math.floor(y / 3);
      const joint = (x - cx + (row % 2) * 2) % 4 === 0 || y % 3 === 2;
      let k = 3 - (x - cx) * 0.25 + (h2(x, y, 37) - 0.5) * 0.6;
      if (x === cx) k += 1.2;
      L.px(x, y, joint ? '#1a1416' : rk(['#2a2224', '#3e3436', '#554a4a', '#6e6260', '#8a7c76'], k));
    }
  }
  hline(L, cx - 1, cx + 9, 0, rk(['#554a4a', '#8a7c76'], 1));
  for (let y = 0; y < 17; y++) {
    L.px(cx - 1, y, INK);
    L.px(cx + 9, y, INK);
  }
  hline(L, cx - 1, cx + 9, 16, INK);
}

/** The gable's face: dark boards, a beam, the reel sign, the display window, two little windows. */
function gable(L: Layer): void {
  const S = SHOP;
  const inFace = (x: number, y: number) => y >= bargeY(x) + 3 && y < S.beam.y0;
  boards(L, S.eaveL, S.apex.y, S.eaveR, S.beam.y0, 41, 2.9, inFace);
  // The face is darker up under the eaves.
  for (let x = S.eaveL; x < S.eaveR; x++) {
    const b = Math.ceil(bargeY(x) + 3);
    for (let k = 0; k < 3; k++) L.tone(x, b + k, -0.55 + k * 0.18);
  }
  // A girt across at the window's top, and a king post from the apex down to it.
  const girt = S.window.y0 - 5;
  const gl = new Layer(0, girt, 256, 3);
  timber(gl, 0, girt, 256, 3, 42, TIMBER, 4.4);
  for (let y = girt; y < girt + 3; y++) for (let x = 0; x < 256; x++) if (inFace(x, y)) L.px(x, y, gl.get(x, y));
  for (let y = S.apex.y + 3; y < girt; y++) {
    if (y < bargeY(S.cx) + 3 || Math.abs(y - S.sign.y) < S.sign.r + 2) continue;
    L.px(S.cx - 1, y, rk(TIMBER, 2.2));
    L.px(S.cx, y, rk(TIMBER, 4.2));
  }
  // Braces from the girt up toward the barge boards.
  for (const side of [-1, 1]) {
    for (let t = 0; t < 20; t++) {
      const x = S.cx + side * (20 + t);
      const y = girt - 1 - Math.round(t * 0.8);
      if (!inFace(x, y) || !inFace(x, y + 2)) continue;
      L.px(x, y, rk(TIMBER, 5));
      L.px(x, y + 1, rk(TIMBER, 3.6));
      L.px(x, y + 2, rk(TIMBER, 1.8));
    }
  }
  // Two little square windows, either side, warm and dim behind their muntins.
  for (const wx of [70, 172]) smallWindow(L, wx, 60, 14, 13);
  displayWindow(L);
  reelSign(L, S.sign.x, S.sign.y, S.sign.r);
  // The beam across the front: a heavy timber, lit along its top, the shop's name carved into it in
  // gold over the door, brass studs along it.
  timber(L, S.eaveL - 4, S.beam.y0, S.eaveR - S.eaveL + 8, S.beam.y1 - S.beam.y0, 43, TIMBER, 4);
  for (let x = S.eaveL - 4; x < S.eaveR + 4; x++) {
    L.px(x, S.beam.y0 - 1, INK);
    if ((x - S.eaveL) % 16 === 8 && Math.abs(x - S.cx) > 30) {
      L.px(x, S.beam.y0 + 4, rk(GOLD, 5));
      L.px(x, S.beam.y0 + 5, rk(GOLD, 2.4));
    }
  }
  const name = renderText('GILDED REEL', { face: 'small', fill: ['#fff2b0', '#ffd860', '#ffc040', '#f0a030', '#e08a28'], ink: null });
  const nx = S.cx - Math.floor(name.w / 2);
  const ny = S.beam.y0 + Math.floor((S.beam.y1 - S.beam.y0 - name.h) / 2);
  for (let y = -1; y <= name.h; y++) for (let x = -3; x < name.w + 3; x++) L.tone(nx + x, ny + y, -0.9);
  for (let y = 0; y < name.h; y++) {
    for (let x = 0; x < name.w; x++) {
      const i = (y * name.w + x) * 4;
      if (!name.px[i + 3]) continue;
      const f = (v: number) => v.toString(16).padStart(2, '0');
      L.gl(nx + x, ny + y, `#${f(name.px[i])}${f(name.px[i + 1])}${f(name.px[i + 2])}`);
    }
  }
}

function smallWindow(L: Layer, x: number, y: number, w: number, h: number): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const ix = xx - x;
      const iy = yy - y;
      const frame = ix < 2 || iy < 2 || ix >= w - 2 || iy >= h - 2;
      if (frame) {
        L.px(xx, yy, rk(TIMBER, ix === 0 || iy === 0 ? 5.4 : ix === w - 1 || iy === h - 1 ? 1.4 : 3.6));
        continue;
      }
      const mid = ix === Math.floor(w / 2) || iy === Math.floor(h / 2);
      if (mid) {
        L.px(xx, yy, rk(TIMBER, 3));
        continue;
      }
      // Warm but dim: curtains drawn inside, a glow coming through.
      const t = (iy - 2) / (h - 4);
      L.gl(xx, yy, rk(['#3a1a10', '#5a2a14', '#7a3e1a', '#9a5422', '#c07030'], 3.2 - t * 1.8 + (vnoise(xx, yy, 3, 3, 44) - 0.5)));
    }
  }
  // A sill.
  hline(L, x - 1, x + w, y + h, rk(PLANK, 5));
  hline(L, x - 1, x + w, y + h + 1, rk(PLANK, 2));
}

/** The long display window under the sign: golden light, a shelf of goods, a glint across the glass. */
function displayWindow(L: Layer): void {
  const { x0, x1, y0, y1 } = SHOP.window;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const nx = (x - (x0 + x1) / 2) / ((x1 - x0) / 2);
      const ny = (y - y0) / (y1 - y0);
      L.gl(x, y, rk(GLASS, 4.4 - nx * nx * 1.8 + (ny > 0.55 ? 0.5 : -0.3) + (vnoise(x, y, 5, 4, 61) - 0.5) * 0.7));
    }
  }
  // Goods standing on the sill line inside, little lamps between them.
  let x = x0 + 2;
  let i = 0;
  const kinds = ['reel', 'helm', 'potion', 'sword', 'coins', 'figure', 'potion', 'shield', 'gem', 'reel', 'helm', 'coins'];
  while (x < x1 - 5) {
    const w = item(L, kinds[i % kinds.length], x, y1 - 1, 61 + i);
    x += w + 2 + (h2(i, 1, 62) < 0.3 ? 1 : 0);
    i++;
  }
  // Muntins: two mullions and the frame.
  for (const mx of [x0 + 18, x1 - 18]) {
    for (let y = y0; y < y1; y++) {
      L.px(mx, y, rk(TIMBER, 4));
      L.unglow(mx, y);
    }
  }
  for (let t = 0; t < 5; t++) {
    L.gl(x0 + 3 + t, y0 + 6 - t, '#fffbe8');
    if (t < 3) L.gl(x0 + 6 + t, y0 + 6 - t, '#fff2c8');
  }
  for (let y = y0 - 2; y < y1 + 2; y++) {
    for (const xx of [x0 - 2, x0 - 1, x1, x1 + 1]) L.px(xx, y, rk(TIMBER, xx === x0 - 2 ? 5.5 : xx === x1 + 1 ? 1.5 : 3));
  }
  for (let xx = x0 - 2; xx < x1 + 2; xx++) {
    L.px(xx, y0 - 2, rk(TIMBER, 5.5));
    L.px(xx, y0 - 1, rk(TIMBER, 3));
    L.px(xx, y1, rk(PLANK, 5.4));
    L.px(xx, y1 + 1, rk(PLANK, 3));
    L.px(xx, y1 + 2, rk(PLANK, 1.2));
  }
  // A flower box under the window.
  flowerBox(L, x0 + 4, y1 + 3, x1 - x0 - 8, 71);
}

/**
 * One display item with its feet at (x.., sy); returns its width. Helms, swords, potions, gems,
 * little golden reels, coin stacks, a knight figurine, a shield.
 */
export function item(L: Layer, kind: string, x: number, sy: number, seed: number, glass = true): number {
  const gold = ['#5e3812', '#b8862a', '#f0c850', '#fff0a8'];
  const steel = ['#2a2a36', '#6a6a7c', '#a8a8bc', '#e8e8f4'];
  const P = (px: number, py: number, c: string) => {
    L.px(px, py, c);
    if (glass) L.unglow(px, py);
  };
  const potionCols = [['#5a0e1a', '#b8202e', '#ff5a5a'], ['#0e2a5a', '#2a5ab8', '#6aa8ff'], ['#0e4a2a', '#22a050', '#7aff9a']];
  switch (kind) {
    case 'helm': {
      const c = h2(seed, 1, 1) < 0.5 ? gold : steel;
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 5; xx++) {
        if (yy === 0 && (xx === 0 || xx === 4)) continue;
        P(x + xx, sy - 5 + yy, c[xx === 0 || yy === 0 ? 2 : xx === 4 ? 0 : 1]);
      }
      P(x + 1, sy - 3, '#140c10');
      P(x + 2, sy - 3, '#140c10');
      P(x + 3, sy - 3, '#140c10');
      P(x + 2, sy - 6, '#c8323a');
      P(x + 3, sy - 7, '#ee6150');
      P(x + 1, sy - 4, c[3]);
      return 5;
    }
    case 'sword': {
      for (let yy = 0; yy < 9; yy++) P(x + 1, sy - 9 + yy, yy < 6 ? steel[yy === 0 ? 3 : 2] : yy === 6 ? gold[2] : '#5e3a22');
      P(x, sy - 3, gold[1]);
      P(x + 2, sy - 3, gold[1]);
      P(x + 2, sy - 8, steel[1]);
      return 3;
    }
    case 'potion': {
      const c = potionCols[Math.floor(h2(seed, 2, 2) * 3)];
      P(x + 1, sy - 6, '#c8a878');
      P(x + 1, sy - 5, '#e8e0d0');
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 3; xx++) P(x + xx, sy - 4 + yy, c[xx === 0 ? 2 : xx === 2 || yy === 3 ? 0 : 1]);
      P(x, sy - 4, '#ffffff');
      return 3;
    }
    case 'gem': {
      const c = h2(seed, 3, 3) < 0.5 ? ['#3a1060', '#8a3ad8', '#e0a8ff'] : ['#0a3a4a', '#1aa8b8', '#a8fff0'];
      P(x + 1, sy - 4, c[2]);
      P(x, sy - 3, c[2]);
      P(x + 1, sy - 3, c[1]);
      P(x + 2, sy - 3, c[0]);
      P(x + 1, sy - 2, c[1]);
      P(x, sy - 1, '#3a2418');
      P(x + 1, sy - 1, '#5e3a22');
      P(x + 2, sy - 1, '#3a2418');
      return 3;
    }
    case 'coins': {
      for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 4; xx++) P(x + xx, sy - 1 - yy, yy % 2 ? gold[1] : gold[xx === 0 ? 3 : 2]);
      P(x + 1, sy - 4, gold[3]);
      P(x + 2, sy - 4, gold[2]);
      return 4;
    }
    case 'jar': {
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 3; xx++) P(x + xx, sy - 4 + yy, yy === 0 ? '#7a5030' : ['#e8d8a8', '#c8b080', '#a08a60'][xx]);
      return 3;
    }
    case 'reel': {
      const ring = [[1, 0], [2, 0], [3, 0], [0, 1], [4, 1], [0, 2], [4, 2], [0, 3], [4, 3], [1, 4], [2, 4], [3, 4]];
      for (const [xx, yy] of ring) P(x + xx, sy - 7 + yy, gold[yy < 2 ? 3 : 2]);
      for (let yy = 1; yy < 4; yy++) for (let xx = 1; xx < 4; xx++) P(x + xx, sy - 7 + yy, '#2a1450');
      P(x + 2, sy - 5, '#ffe060');
      P(x + 2, sy - 2, gold[1]);
      P(x + 1, sy - 1, gold[1]);
      P(x + 2, sy - 1, gold[1]);
      P(x + 3, sy - 1, gold[1]);
      return 5;
    }
    case 'figure': {
      P(x + 1, sy - 8, '#c8323a');
      for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 3; xx++) P(x + xx, sy - 7 + yy, steel[xx === 0 ? 3 : 2]);
      P(x + 1, sy - 6, '#140c10');
      for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) P(x + xx, sy - 5 + yy, ['#2a5ab8', '#4a7ad8', '#2a3a8a'][xx]);
      for (let xx = -1; xx < 4; xx++) P(x + xx, sy - 2, gold[1]);
      for (let xx = -1; xx < 4; xx++) P(x + xx, sy - 1, gold[0]);
      return 4;
    }
    case 'shield': {
      for (let yy = 0; yy < 6; yy++) for (let xx = 0; xx < 5; xx++) {
        if (yy >= 4 && (xx === 0 || xx === 4)) continue;
        if (yy === 5 && (xx === 1 || xx === 3)) continue;
        P(x + xx, sy - 7 + yy, xx === 0 || xx === 4 || yy === 0 ? gold[2] : xx === 2 ? '#e8e0d0' : '#a8202e');
      }
      P(x + 2, sy - 1, '#3a2418');
      return 5;
    }
  }
  return 3;
}

/** A planter box: boards heaped with leaves and flowers spilling over the rim, ivy trailing down. */
export function flowerBox(L: Layer, x: number, y: number, w: number, seed: number): void {
  planks(L, x, y + 2, w, 4, { dir: 'h', board: 2, seed, base: 3.6, joint: 19 });
  hline(L, x, x + w - 1, y + 6, INK);
  for (let yy = y + 2; yy < y + 6; yy++) {
    L.px(x - 1, yy, INK);
    L.px(x + w, yy, INK);
  }
  const greens = ['#0f2a14', '#17401a', '#215a20', '#2f7626', '#43922c', '#62ae34', '#8ccb3e'];
  for (let i = 0; i < w; i++) {
    const tall = 1 + Math.floor(h2(i, 1, seed) * 3);
    for (let t = 0; t < tall; t++) L.px(x + i, y + 2 - t, rk(greens, 1.5 + t * 1.2 + (h2(i, t, seed) - 0.5) * 1.2));
  }
  for (let i = 1; i < w - 1; i += 3 + Math.floor(h2(i, 2, seed) * 2)) {
    const f = ROSE_FLOWERS[Math.floor(h2(i, 3, seed) * ROSE_FLOWERS.length)];
    const fy = y - Math.floor(h2(i, 4, seed) * 2);
    const fx = x + i;
    L.px(fx, fy - 1, f[1]);
    L.px(fx - 1, fy, f[1]);
    L.px(fx + 1, fy, f[0]);
    L.px(fx, fy, f[2]);
  }
  for (let i = 2; i < w; i += 6 + Math.floor(h2(i, 5, seed) * 3)) {
    const len = 2 + Math.floor(h2(i, 6, seed) * 3);
    for (let t = 0; t < len; t++) L.px(x + i + (t > 2 ? 1 : 0), y + 6 + t, rk(greens, 4.5 - t * 0.7 + (t % 2 ? -0.8 : 0)));
  }
}

/**
 * The reel sign in the gable: a gilded ring set with bulbs, a deep blue face, spokes to a hub and a
 * bright star, hung from a little bracket.
 */
function reelSign(L: Layer, cx: number, cy: number, R: number): void {
  // A shadow on the boards behind it (down and right), then the bracket it hangs from.
  oval(L, cx + 1.5, cy + 2, R + 1, R + 1, (x, y) => {
    L.tone(x, y, -0.7);
    return null;
  });
  vline(L, cx, cy - R - 4, cy - R, (y) => IRON[y % 2 ? 2 : 4]);
  hline(L, cx - 2, cx + 2, cy - R - 5, IRON[3]);
  oval(L, cx, cy, R + 1.1, R + 1.1, INK);
  const gold = ['#6a3a10', '#9a6418', '#c8902a', '#f0c048', '#ffe080', '#fff4c0'];
  oval(L, cx, cy, R, R, (x, y, nx, ny) => {
    const d = Math.hypot(nx, ny);
    if (d < 0.7) return null;
    const lit = -nx * 0.5 - ny * 0.75;
    let k = 2.8 + lit * 1.7;
    if (d > 0.93) k -= 0.9;
    L.gl(x, y, rk(gold, k));
    return null;
  });
  // The face: night blue, lighter toward the middle.
  oval(L, cx, cy, R * 0.7, R * 0.7, (x, y, nx, ny) => {
    const d = Math.hypot(nx, ny);
    L.gl(x, y, rk(['#0e0a2a', '#1a1448', '#2a2068', '#3a2e88', '#4e3ea8'], 3 - d * 2 - ny * 0.4));
    return null;
  });
  // Spokes: four long, four short.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const len = i % 2 ? R * 0.5 : R * 0.68;
    for (let t = 2; t < len; t += 0.5) L.gl(Math.round(cx + Math.cos(a) * t - 0.5), Math.round(cy + Math.sin(a) * t - 0.5), i % 2 ? '#c89030' : '#f8d060');
  }
  // The star at the hub.
  const star: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? 1.4 : 3.6;
    star.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  poly(L, star, (x, y) => {
    L.gl(x, y, y < cy ? '#fffbe0' : '#ffe890');
    return null;
  });
  L.gl(cx - 1, cy - 1, '#ffffff');
  // Bulbs round the ring, alternately warm white and gold; some of them blink.
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.26;
    const x = Math.round(cx + Math.cos(a) * R * 0.85 - 0.5);
    const y = Math.round(cy + Math.sin(a) * R * 0.85 - 0.5);
    L.gl(x, y, i % 2 ? '#fff8e0' : '#ffd860');
    if (i % 3 === 0) L.twinkles.push({ x, y, r: 0, period: 6, on: 4, phase: i % 6 });
  }
  // A soft halo round the whole sign.
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2;
    for (const [d, al] of [[R + 2, 0.45], [R + 3, 0.25], [R + 4.5, 0.1]] as const) L.halo(Math.round(cx + Math.cos(ang) * d - 0.5), Math.round(cy + Math.sin(ang) * d - 0.5), '#ffc860', al);
  }
}

// ------------------------------------------------------------------ the ground floor

function groundFloor(L: Layer): void {
  const S = SHOP;
  const top = S.beam.y1;
  const base = S.front;
  // The wings' walls: dark boards, the roof's shadow along their tops.
  boards(L, S.eaveL, top, S.eaveR, base, 45, 2.4);
  for (let x = S.eaveL; x < S.eaveR; x++) for (let k = 0; k < 3; k++) L.tone(x, top + k, -0.6 + k * 0.2);
  // A low stone plinth along the foot of the walls.
  for (let y = base - 5; y < base; y++) {
    for (let x = S.eaveL; x < S.eaveR; x++) {
      const row = y - (base - 5);
      const off = row > 1 ? 4 : 0;
      const joint = (x + off) % 9 === 0 || row === 2;
      L.px(x, y, joint ? '#211a1c' : rk(['#2e2628', '#3e3638', '#554b4a', '#6e6260', '#8a7c76'], 2.2 + (row === 0 || row === 3 ? 1 : 0) - (row === 4 ? 1.2 : 0) + (h2(x, y, 46) - 0.5) * 0.8));
    }
  }
  // Posts: the corners and either side of the door.
  for (const [x, w] of [[S.eaveL, 5], [S.eaveR - 5, 5], [S.door.x0 - 6, 6], [S.door.x1, 6]] as const) timber(L, x, top, w, base - top, 47 + x, TIMBER, 3.8);
  doorway(L);
  curioCabinet(L);
  noticeBoard(L);
  tinkerShelves(L);
}

/**
 * The open doorway: the warm shop inside (a counter, shelves of glinting stock, the floor's stones
 * running in under the lamp), a lamp hanging from the lintel, the threshold.
 */
function doorway(L: Layer): void {
  const { x0, x1, top } = SHOP.door;
  const base = SHOP.front;
  const cx = (x0 + x1) / 2;
  // The lintel: a header under the beam.
  timber(L, x0 - 6, top - 6, x1 - x0 + 12, 6, 48, TIMBER, 4.6);
  for (let y = top; y < base; y++) {
    for (let x = x0; x < x1; x++) {
      // The room inside: dark at the back and the sides, warm toward the floor and the middle.
      const t = (y - top) / (base - top);
      const side = Math.abs(x + 0.5 - cx) / ((x1 - x0) / 2);
      // A pool of the lamp's light round its globe, the rest deep in shadow.
      const lamp = Math.max(0, 1 - Math.hypot(x + 0.5 - cx, (y - top - 7) * 1.3) / 11);
      let k = 0.5 + t * 1.6 - side * side * 1.2 + lamp * 2.4 + (vnoise(x, y, 4, 5, 49) - 0.5) * 0.6;
      if (y < top + 3) k -= 0.8;
      L.px(x, y, rk(['#0a0608', '#130a0c', '#1e0f10', '#2e1814', '#432418', '#5a321c'], k));
    }
  }
  // The back wall's shelves, glimpsed: two boards of jars and boxes catching the lamp.
  for (const sy of [top + 11, top + 17]) {
    for (let x = x0 + 2; x < x1 - 2; x++) {
      L.px(x, sy, '#4a2c1a');
      L.px(x, sy + 1, '#2a160e');
    }
    for (let x = x0 + 3; x < x1 - 4; x += 3) {
      const c = ['#8a6a3a', '#6a3a5a', '#3a5a6a', '#9a7a4a', '#5a7a3a'][Math.floor(h2(x, sy, 50) * 5)];
      const hgt = 1 + Math.floor(h2(x, sy, 51) * 3);
      for (let k = 1; k <= hgt; k++) L.px(x, sy - k, k === hgt ? mixLight(c) : c);
      if (h2(x, sy, 52) < 0.5) L.px(x + 1, sy - 1, c);
    }
  }
  // The counter across the back, its top catching the lamp, a few things on it.
  const ct = top + 21;
  for (let x = x0 + 1; x < x1 - 1; x++) {
    L.px(x, ct, rk(PLANK, 5));
    L.px(x, ct + 1, rk(PLANK, 3.4));
    for (let y = ct + 2; y < ct + 5; y++) L.px(x, y, rk(PLANK, 1.6 + (x % 5 === 0 ? -0.8 : 0)));
  }
  L.gl(cx - 6, ct - 1, '#ffd060');
  L.gl(cx - 5, ct - 1, '#ffb040');
  L.px(cx + 5, ct - 2, '#c8a0ff');
  L.px(cx + 5, ct - 1, '#8a60c8');
  L.px(cx + 8, ct - 1, '#e8e0d0');
  // The floor running in: stones lit by the lamp, receding into the dark.
  const fy = ct + 5;
  for (let y = fy; y < base; y++) {
    const t = (y - fy) / (base - fy);
    for (let x = x0; x < x1; x++) {
      const side = Math.abs(x + 0.5 - cx) / ((x1 - x0) / 2);
      const joint = y === fy + 3 || (x + (y > fy + 3 ? 3 : 0)) % 7 === 0;
      const k = 2.2 + t * 3 - side * 1.6 + (h2(x, y, 53) - 0.5) * 0.5;
      L.px(x, y, joint ? '#2a1c16' : rk(['#2a1c16', '#4a3424', '#6f5e4c', '#8b775e', '#a69071', '#bea783'], k));
    }
  }
  // Curtains tied back at the top corners.
  for (let y = top; y < top + 12; y++) {
    const reach = Math.max(0, 5 - Math.floor((y - top) * 0.45));
    for (let k = 0; k < reach; k++) {
      L.px(x0 + k, y, rk(['#3a0e1a', '#6a1a2a', '#9a2a3a', '#c84a4a'], 2.2 - (k === reach - 1 ? 1 : 0) + (k === 0 ? 0.8 : 0)));
      L.px(x1 - 1 - k, y, rk(['#3a0e1a', '#6a1a2a', '#9a2a3a', '#c84a4a'], 1.6 - (k === reach - 1 ? 1 : 0)));
    }
  }
  L.px(x0, top + 12, rk(GOLD, 4));
  L.px(x1 - 1, top + 12, rk(GOLD, 3));
  // The lamp hanging in the doorway.
  globeLantern(L, Math.floor(cx), top, 3, 3);
  // The threshold: a worn stone sill.
  for (let x = x0 - 1; x < x1 + 1; x++) {
    L.px(x, base - 2, rk(['#3e3638', '#6e6260', '#8a7c76', '#a69890'], 3));
    L.px(x, base - 1, rk(['#3e3638', '#6e6260', '#8a7c76'], 1.4));
  }
}

function mixLight(c: string): string {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.round(v + (255 - v) * 0.35).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/**
 * The junk dealer's curio cabinet in the left wing: a tall glass-fronted case lit from inside (a lamp
 * at the top), three shelves of oddments (gears, a helm, a cracked shield, a sword, coin piles, bottles,
 * a clock), its frame carved, a brass plate.
 */
function curioCabinet(L: Layer): void {
  const { x0, x1, y0, y1 } = SHOP.cabinet;
  // The case: a heavy frame round three panes of lit glass.
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const ix = x - x0;
      const iy = y - y0;
      const frame = ix < 3 || ix >= x1 - x0 - 3 || iy < 3 || iy >= y1 - y0 - 4;
      if (frame) {
        let k = 3.6;
        if (ix === 0 || iy === 0) k = 5.6;
        else if (ix === x1 - x0 - 1 || iy === y1 - y0 - 1) k = 1.2;
        else if (ix === 1 || iy === 1) k = 4.6;
        L.px(x, y, rk(TIMBER, k + (vnoise(x, y, 6, 2, 54) - 0.5) * 0.6));
        continue;
      }
      // Inside: the glow, brightest round the lamp at the top.
      const nx = (x - (x0 + x1) / 2) / ((x1 - x0) / 2);
      const t = (y - y0) / (y1 - y0);
      L.gl(x, y, rk(GLASS, 4.2 - nx * nx * 1.6 - t * 1.4 + (vnoise(x, y, 4, 4, 55) - 0.5) * 0.7));
    }
  }
  // A cornice on top.
  for (let x = x0 - 2; x < x1 + 2; x++) {
    L.px(x, y0 - 3, INK);
    L.px(x, y0 - 2, rk(TIMBER, 5.8));
    L.px(x, y0 - 1, rk(TIMBER, 3.4));
  }
  // The shelves and their oddments.
  const shelves = [y0 + 13, y0 + 23, y1 - 5];
  for (const sy of shelves) {
    for (let x = x0 + 3; x < x1 - 3; x++) {
      L.px(x, sy, rk(PLANK, 5.6));
      L.px(x, sy + 1, rk(PLANK, 2.4));
      L.unglow(x, sy);
      L.unglow(x, sy + 1);
    }
  }
  const P = (x: number, y: number, c: string) => {
    L.px(x, y, c);
    L.unglow(x, y);
  };
  // Top shelf: bottles and a clock.
  let x = x0 + 5;
  for (const k of ['bottle', 'clock', 'bottle', 'gear', 'bottle', 'jar']) x += oddment(L, k, x, shelves[0] - 1, x) + 2;
  // Middle: a helm, a sword lying, coins, a gear.
  x = x0 + 4;
  for (const k of ['helm', 'coins', 'gear', 'swordFlat', 'coins']) x += oddment(L, k, x, shelves[1] - 1, x) + 1;
  // Bottom: a shield, a pot, gears.
  x = x0 + 4;
  for (const k of ['shield', 'pot', 'gear', 'bottle', 'gear']) x += oddment(L, k, x, shelves[2] - 1, x) + 2;
  // The lamp inside at the top: a little bright bulb.
  L.gl((x0 + x1) / 2, y0 + 4, '#fffbe8');
  L.gl((x0 + x1) / 2 - 1, y0 + 4, '#fff2c8');
  L.gl((x0 + x1) / 2, y0 + 5, '#ffe7a4');
  // Muntins: the panes, and glints on the glass.
  for (const mx of [x0 + 15, x0 + 30]) {
    for (let y = y0 + 3; y < y1 - 4; y++) P(mx, y, rk(TIMBER, 3.2));
  }
  for (let t = 0; t < 4; t++) {
    L.gl(x0 + 5 + t, y0 + 9 - t, '#fffbe8');
    L.gl(x0 + 18 + t, y0 + 8 - t, '#fff2c8');
  }
  // A brass plate on the base.
  for (let xx = (x0 + x1) / 2 - 4; xx < (x0 + x1) / 2 + 4; xx++) {
    L.px(xx, y1 - 3, rk(GOLD, 4.6));
    L.px(xx, y1 - 2, rk(GOLD, 2.6));
  }
  // A soft spill of its light on the wall round it.
  for (let y = y0 - 4; y < y1 + 2; y++) {
    for (const xx of [x0 - 1, x0 - 2, x1, x1 + 1]) L.halo(xx, y, '#ffb060', xx === x0 - 1 || xx === x1 ? 0.18 : 0.08);
  }
}

/** Oddments for the curio cabinet and the tinker's shelves, standing on `sy`; returns the width. */
function oddment(L: Layer, kind: string, x: number, sy: number, seed: number): number {
  const P = (px: number, py: number, c: string) => {
    L.px(px, py, c);
    L.unglow(px, py);
  };
  const glassCols = [['#1a3a14', '#2e6a24', '#5aa040'], ['#3a1a0e', '#7a3a1a', '#c0702a'], ['#1a2440', '#2e4a7a', '#5a86c0'], ['#4a1020', '#8a2034', '#d04a5a'], ['#3a1048', '#6a2a88', '#a860d0']];
  switch (kind) {
    case 'bottle': {
      const c = glassCols[Math.floor(h2(seed, 1, 1) * glassCols.length)];
      const tall = 4 + Math.floor(h2(seed, 2, 1) * 3);
      P(x + 1, sy - tall - 1, '#c8a878');
      P(x + 1, sy - tall, c[1]);
      for (let y = 0; y < tall - 1; y++) for (let xx = 0; xx < 3; xx++) P(x + xx, sy - tall + 1 + y, c[xx === 0 ? 2 : xx === 2 ? 0 : 1]);
      P(x, sy - tall + 1, '#ffffff');
      return 3;
    }
    case 'jar': {
      const fill = ['#c87a2a', '#7a2a5a', '#5a8a2a', '#d0a040'][Math.floor(h2(seed, 2, 2) * 4)];
      for (let y = 0; y < 4; y++) for (let xx = 0; xx < 4; xx++) P(x + xx, sy - 4 + y, y === 0 ? '#a07040' : xx === 0 ? '#e8e0d0' : fill);
      return 4;
    }
    case 'clock': {
      oval(L, x + 2.5, sy - 3.5, 2.6, 2.6, (px, py, nx, ny) => {
        const d = Math.hypot(nx, ny);
        P(px, py, d > 0.75 ? rk(GOLD, 3.6 - ny) : '#f4ecd8');
        return null;
      });
      P(x + 2, sy - 4, '#2a1a10');
      P(x + 2, sy - 3, '#2a1a10');
      P(x + 3, sy - 3, '#2a1a10');
      return 5;
    }
    case 'gear': {
      const r = 1.8 + h2(seed, 1, 3) * 1.2;
      oval(L, x + r, sy - r - 0.2, r + 0.8, r + 0.8, (px, py, nx, ny) => {
        const a = Math.atan2(ny, nx);
        const d = Math.hypot(nx, ny);
        if (d > 0.8 && Math.cos(a * 7) < 0.25) return null;
        P(px, py, d < 0.32 ? '#1a1418' : rk(h2(seed, 2, 3) < 0.5 ? GOLD : IRON, 4 - ny * 1.6 - nx * 0.5));
        return null;
      });
      return Math.ceil(r * 2 + 1);
    }
    case 'helm': {
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 6; xx++) {
        if (yy === 0 && (xx === 0 || xx === 5)) continue;
        P(x + xx, sy - 5 + yy, rk(IRON, xx === 0 || yy === 0 ? 6 : xx === 5 ? 2.5 : 4.4));
      }
      hline(L, x + 1, x + 4, sy - 3, '#140c10');
      P(x + 3, sy - 4, '#a83a2a');
      return 6;
    }
    case 'coins': {
      for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 4; xx++) P(x + xx, sy - 1 - yy, rk(GOLD, yy % 2 ? 5.6 - xx * 0.5 : 3));
      P(x + 1, sy - 3, rk(GOLD, 6));
      return 4;
    }
    case 'swordFlat': {
      for (let xx = 0; xx < 9; xx++) P(x + xx, sy - 1, xx < 2 ? rk(PLANK, 2) : xx === 2 ? rk(GOLD, 4) : rk(IRON, xx > 7 ? 3 : 5.5));
      P(x + 2, sy - 2, rk(GOLD, 3));
      for (let xx = 3; xx < 8; xx++) P(x + xx, sy - 2, rk(IRON, 6));
      return 9;
    }
    case 'shield': {
      for (let yy = 0; yy < 6; yy++) for (let xx = 0; xx < 5; xx++) {
        if (yy >= 4 && (xx === 0 || xx === 4)) continue;
        if (yy === 5 && (xx === 1 || xx === 3)) continue;
        P(x + xx, sy - 6 + yy, xx === 0 || xx === 4 || yy === 0 ? rk(IRON, 5) : xx < 2 ? '#2a5ab8' : '#203a7a');
      }
      P(x + 2, sy - 4, rk(GOLD, 5));
      P(x + 3, sy - 3, '#140c10');
      return 5;
    }
    case 'pot': {
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 5; xx++) P(x + xx, sy - 4 + yy, yy === 0 ? '#1a1418' : rk(['#3a2418', '#6a4028', '#9a6038', '#c08048'], 3 - xx * 0.5));
      P(x + 5, sy - 3, '#3a2418');
      return 6;
    }
    case 'toolbox': {
      for (let y = 0; y < 4; y++) for (let xx = 0; xx < 6; xx++) P(x + xx, sy - 4 + y, y === 0 ? '#e8504a' : xx === 0 ? '#c03a34' : '#8a2020');
      hline(L, x + 2, x + 3, sy - 5, IRON[4]);
      return 6;
    }
    case 'coil': {
      oval(L, x + 2.5, sy - 2.5, 2.6, 2.2, (px, py, nx, ny) => {
        P(px, py, Math.hypot(nx, ny) < 0.45 ? '#3a2416' : (px + py) % 2 ? '#c8a060' : '#9a7840');
        return null;
      });
      return 5;
    }
    case 'spring': {
      for (let y = 0; y < 5; y++) for (let xx = 0; xx < 3; xx++) if ((y + xx) % 2 === 0) P(x + xx, sy - 5 + y, IRON[5]);
      return 3;
    }
  }
  return 3;
}

/** The notice board by the door: a framed board of pinned notes and chalk, a gold "!" over it. */
function noticeBoard(L: Layer): void {
  const { x0, x1, y0, y1 } = SHOP.board;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const ix = x - x0;
      const iy = y - y0;
      const frame = ix < 2 || iy < 2 || ix >= x1 - x0 - 2 || iy >= y1 - y0 - 2;
      if (frame) L.px(x, y, rk(PLANK, ix === 0 || iy === 0 ? 6.2 : ix === x1 - x0 - 1 || iy === y1 - y0 - 1 ? 1.6 : 4.2));
      else L.px(x, y, rk(['#141a1a', '#1c2424', '#263030', '#323e3c'], 1.6 + (vnoise(x, y, 4, 4, 56) - 0.5) * 1.2));
    }
  }
  // Chalk: a heading and lines of scribble.
  hline(L, x0 + 3, x1 - 4, y0 + 3, '#e8ecf0');
  for (let r = 0; r < 4; r++) {
    const ly = y0 + 6 + r * 2;
    const len = 4 + Math.floor(h2(r, 1, 57) * 5);
    for (let xx = 0; xx < len; xx++) if (h2(xx, r, 58) < 0.78) L.px(x0 + 3 + xx, ly, xx < 1 ? '#ffe080' : '#b8bcc4');
  }
  // Notes pinned over the chalk, a little askew, with red pins; one with a chicken on it.
  const notes: Array<[number, number, number, number]> = [[x0 + 2, y1 - 11, 6, 7], [x0 + 8, y1 - 13, 5, 8], [x0 + 6, y0 + 13, 5, 5]];
  notes.forEach(([px, py, w, hh], i) => {
    for (let yy = py; yy < py + hh; yy++) for (let xx = px; xx < px + w; xx++) L.px(xx, yy, yy === py ? '#fffaf0' : i % 2 ? '#f0e6cc' : '#e8dcc0');
    for (let r = 0; r < 2; r++) for (let xx = px + 1; xx < px + w - 1; xx++) if (h2(xx, r + i * 7, 59) < 0.7 && py + 2 + r * 2 < py + hh - 1) L.px(xx, py + 2 + r * 2, '#8a7a64');
    L.px(px + Math.floor(w / 2), py, '#e8302a');
  });
  for (const [dx, dy, c] of [[1, 3, '#ffffff'], [2, 3, '#ffffff'], [2, 2, '#e8302a'], [3, 4, '#ffb030'], [1, 4, '#ffffff'], [2, 4, '#ffffff']] as const) L.px(x0 + 2 + dx, y1 - 11 + dy, c);
  // A gold "!" on a little plaque above.
  const ex = Math.floor((x0 + x1) / 2);
  for (let x = ex - 2; x <= ex + 2; x++) for (let y = y0 - 8; y < y0 - 1; y++) L.px(x, y, x === ex - 2 || y === y0 - 8 ? rk(PLANK, 6) : x === ex + 2 || y === y0 - 2 ? rk(PLANK, 1.6) : rk(PLANK, 3.6));
  for (let y = y0 - 7; y < y0 - 4; y++) L.gl(ex, y, '#ffd84a');
  L.gl(ex, y0 - 3, '#ffd84a');
  L.halo(ex - 1, y0 - 6, '#ffd84a', 0.35);
  L.halo(ex + 1, y0 - 6, '#ffd84a', 0.35);
}

/**
 * The tinker's corner of the right wing: a slate board painted with upgrade icons (an hourglass, a
 * clover, a coin, a boot, a gear, an arrow up) in a frame, shelves under it of bottles, jars and
 * gadgets in the shade, a little lantern on a hook lighting them; a basket of red flowers hanging at
 * the door's corner.
 */
function tinkerShelves(L: Layer): void {
  const sl = SHOP.slate;
  for (let y = sl.y0; y < sl.y1; y++) {
    for (let x = sl.x0; x < sl.x1; x++) {
      const ix = x - sl.x0;
      const iy = y - sl.y0;
      const frame = ix < 2 || iy < 2 || ix >= sl.x1 - sl.x0 - 2 || iy >= sl.y1 - sl.y0 - 2;
      if (frame) L.px(x, y, rk(PLANK, ix === 0 || iy === 0 ? 6 : ix === sl.x1 - sl.x0 - 1 || iy === sl.y1 - sl.y0 - 1 ? 1.8 : 4));
      else L.px(x, y, rk(['#0c0f10', '#141a1a', '#1c2424', '#263030'], 1.8 + (vnoise(x, y, 6, 5, 63) - 0.5) * 1.2));
    }
  }
  ['hourglass', 'clover', 'coin', 'boot', 'gear', 'arrow'].forEach((ic, i) => icon(L, sl.x0 + 5 + i * 7 + (i > 2 ? 2 : 0), sl.y0 + 4, ic));
  // The shelves: a dark back, three boards, stock on each.
  const sh = SHOP.shelves;
  for (let y = sh.y0; y < sh.y1; y++) {
    for (let x = sh.x0; x < sh.x1; x++) {
      const bx = (x - sh.x0) % 5;
      let k = 1 + (vnoise(x * 4, y, 1.3, 8, 64) - 0.5) * 1;
      if (bx === 0) k = 0.3;
      L.px(x, y, rk(TIMBER, k));
    }
  }
  for (const x of [sh.x0, sh.x1 - 3]) timber(L, x, sh.y0 - 1, 3, sh.y1 - sh.y0 + 1, 65 + x, TIMBER, 4);
  const boardsY = [sh.y0 + 6, sh.y0 + 13, sh.y1 - 1];
  for (const sy of boardsY) {
    for (let x = sh.x0 + 1; x < sh.x1 - 1; x++) {
      L.px(x, sy, rk(PLANK, 5.6));
      L.px(x, sy + 1, rk(PLANK, 2.6));
    }
  }
  const row = (sy: number, kinds: string[], seed: number) => {
    let x = sh.x0 + 4;
    let i = 0;
    while (x < sh.x1 - 7) {
      x += oddment(L, kinds[i % kinds.length], x, sy - 1, seed + i * 7) + 1 + (h2(i, seed, 66) < 0.3 ? 1 : 0);
      i++;
    }
  };
  row(boardsY[0], ['bottle', 'jar', 'bottle', 'bottle', 'jar', 'bottle', 'jar'], 10);
  row(boardsY[1], ['gear', 'coil', 'spring', 'toolbox', 'gear', 'bottle', 'spring'], 30);
  row(boardsY[2], ['jar', 'toolbox', 'bottle', 'gear', 'jar', 'bottle'], 50);
  // A lantern hanging from the beam at the wing's corner, lighting the shelves.
  globeLantern(L, SHOP.eaveR - 11, SHOP.beam.y1, 2, 4);
  // The hanging basket of flowers at the door's corner.
  basket(L, SHOP.door.x1 + 10, SHOP.beam.y1);
}

/** A hanging basket at (x, y) (the hook): chains, a woven bowl, red flowers and trailing leaves. */
function basket(L: Layer, x: number, y: number): void {
  for (let t = 0; t < 5; t++) {
    L.px(x - 3 + Math.round(t * 0.4), y + t, IRON[2]);
    L.px(x + 3 - Math.round(t * 0.4), y + t, IRON[2]);
  }
  L.px(x, y, IRON[4]);
  // The bowl.
  for (let yy = 0; yy < 4; yy++) {
    const half = 5 - (yy > 1 ? yy - 1 : 0);
    for (let xx = -half; xx <= half; xx++) L.px(x + xx, y + 6 + yy, rk(PLANK, 4.2 - (xx + half) * 0.25 - yy * 0.4 + ((xx + yy) % 2 ? 0.4 : -0.3)));
  }
  // Leaves heaped in it, flowers on top, strands trailing down.
  const greens = ['#0f2a14', '#17401a', '#215a20', '#2f7626', '#43922c', '#62ae34', '#8ccb3e'];
  for (let xx = -6; xx <= 6; xx++) {
    const tall = 2 + Math.floor(h2(xx, 1, 67) * 3) - (Math.abs(xx) > 4 ? 1 : 0);
    for (let t = 0; t < tall; t++) L.px(x + xx, y + 6 - t, rk(greens, 2 + t * 1.3 + (h2(xx, t, 68) - 0.5)));
  }
  for (const [dx, dy] of [[-4, 3], [-1, 2], [2, 3], [4, 4], [0, 4], [-3, 5]] as const) {
    const f = ['#a8203a', '#e8303a', '#ff5a5a', '#ffb0a0'];
    L.px(x + dx, y + dy, f[2]);
    L.px(x + dx + 1, y + dy, f[1]);
    L.px(x + dx, y + dy - 1, f[3]);
    L.px(x + dx + 1, y + dy + 1, f[0]);
  }
  for (const [dx, len] of [[-5, 6], [-2, 4], [4, 7], [1, 3]] as const) {
    for (let t = 0; t < len; t++) L.px(x + dx + (t > 3 ? (dx < 0 ? -1 : 1) : 0), y + 9 + t, rk(greens, 4.6 - t * 0.5 + (t % 2 ? -0.7 : 0)));
  }
}

/** An item icon painted on the slate (6 x 6), chalky and faintly luminous. */
function icon(L: Layer, x: number, y: number, kind: string): void {
  const rows: Record<string, readonly string[]> = {
    hourglass: ['yyyyy', '.y.y.', '..y..', '.y.y.', 'yyyyy'],
    clover: ['.g.g.', 'ggggg', '.ggg.', 'ggggg', '.g.g.'],
    coin: ['.yyy.', 'yyYyy', 'yyYyy', 'yyYyy', '.yyy.'],
    boot: ['.bb..', '.bb..', '.bb..', '.bbbb', 'bbbbb'],
    gear: ['w.w.w', '.www.', 'ww.ww', '.www.', 'w.w.w'],
    arrow: ['..g..', '.ggg.', 'ggggg', '..g..', '..g..'],
  };
  const col: Record<string, string> = { y: '#f0d060', Y: '#fff4b0', g: '#7ae070', w: '#e8eef8', b: '#d89a5a', r: '#ff6a6a' };
  rows[kind].forEach((r, yy) => [...r].forEach((ch, xx) => {
    if (ch === '.') return;
    L.px(x + xx, y + yy, col[ch]);
    L.halo(x + xx, y + yy, col[ch], 0.5);
  }));
}

/**
 * String lights swagged under the barge boards from the apex to the eaves, and little flowers and
 * leaves growing along the boards (the reference's eaves are full of them).
 */
function stringAndFlowers(L: Layer): void {
  const S = SHOP;
  const ax = S.apex.x;
  // The barge boards: thick dark timber along the gable's edges, lit on top, notched trim under.
  for (let x = S.eaveL - 4; x <= S.eaveR + 4; x++) {
    const y0 = Math.round(bargeY(x));
    const d = Math.abs(x + 0.5 - ax);
    for (let a = -2; a <= 3; a++) {
      const k = a === -2 ? -1 : a === -1 ? 6 : a === 0 ? 4.6 : a < 3 ? 3.2 + (vnoise(x, 0, 5, 1, 70) - 0.5) : 1.4;
      if (y0 + a > S.beam.y0 + 1) continue;
      L.px(x, y0 + a, k < 0 ? INK : rk(TIMBER, k));
    }
    if (d > 2 && Math.floor(d) % 4 === 1 && y0 + 4 <= S.beam.y0) L.px(x, y0 + 4, rk(TIMBER, 2));
  }
  // A finial at the apex.
  vline(L, ax, S.apex.y - 8, S.apex.y - 2, (y) => rk(TIMBER, y < S.apex.y - 5 ? 5 : 3));
  L.px(ax, S.apex.y - 9, rk(GOLD, 6));
  L.px(ax - 1, S.apex.y - 8, rk(GOLD, 3));
  // The lights: swags from nail to nail down both edges.
  for (const side of [-1, 1]) {
    const nails: Array<[number, number]> = [];
    for (let k = 0; k <= 6; k++) {
      const x = Math.round(ax + side * (6 + k * ((S.cx - S.eaveL - 4) / 6)));
      nails.push([x, Math.round(bargeY(x)) + 4]);
    }
    for (let i = 0; i + 1 < nails.length; i++) stringLights(L, nails[i][0], nails[i][1], nails[i + 1][0], nails[i + 1][1], 2, 3, i * 5 + (side > 0 ? 3 : 0));
    // Lights along the beam too.
  }
  for (let i = 0; i < 8; i++) {
    const xa = S.eaveL + 4 + i * 25;
    if (xa + 25 > S.door.x0 - 8 && xa < S.door.x1 + 8) continue;
    stringLights(L, xa, S.beam.y1, xa + 25, S.beam.y1, 3, 4, i * 3 + 1);
  }
  // Little flowers and leaves along the barge boards.
  const greens = ['#0f2a14', '#17401a', '#215a20', '#2f7626', '#43922c', '#62ae34'];
  for (let x = S.eaveL; x <= S.eaveR; x++) {
    if (Math.abs(x - ax) < 6) continue;
    if (h2(x, 1, 71) > 0.42) continue;
    const y = Math.round(bargeY(x)) - 2;
    L.px(x, y, rk(greens, 2 + h2(x, 2, 71) * 3.5));
    if (h2(x, 3, 71) < 0.5) L.px(x, y - 1, rk(greens, 3 + h2(x, 4, 71) * 2.5));
    if (h2(x, 5, 71) < 0.3) {
      const f = ROSE_FLOWERS[Math.floor(h2(x, 6, 71) * ROSE_FLOWERS.length)];
      L.px(x, y - 1, f[1]);
      L.px(x, y - 2, f[2]);
    }
  }
  for (let x = S.eaveL; x <= S.eaveR; x += 18) L.light(x, Math.round(bargeY(x)) + 6, 14, BULBS[Math.floor(h2(x, 7, 72) * BULBS.length)], 0.28);
}
