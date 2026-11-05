/**
 * The Gilded Reel: the summoning shop at the top of the square. A timber-framed front under a
 * shingled hip roof, a tall front gable in the middle carrying the big round reel sign (a gilded ring
 * studded with marquee bulbs, spokes and a star), multicolored string lights in swags along the eaves
 * and up the gable, two long display windows full of goods in golden light, an arched doorway with
 * globe lanterns hanging either side and the name in gold over it, flower boxes, a stone footing.
 */
import { renderText } from '../pixel/font';
import { h2, hline, INK, IRON, Layer, leaf, oval, PLANK, planks, poly, rk, sagCurve, scales, timber, TIMBER, vline, vnoise, type Ramp } from './hubKit';
import type { HubOut } from './hubScene';

export const ROOF: Ramp = ['#140909', '#220e0c', '#331510', '#461d14', '#5a271a', '#703320', '#884029', '#a25234', '#bc6a44'];
export const PLASTER: Ramp = ['#3e342e', '#5a4c42', '#7a6a5a', '#998672', '#b4a088', '#cbb89c', '#ddcdb2', '#ece0c8'];
/** Window glow, deep to bright. */
export const GLASS: Ramp = ['#c06a22', '#e08a32', '#f4a844', '#ffc25c', '#ffd57a', '#ffe7a4', '#fff6d6'];
/** String-light bulb colors. */
export const BULBS = ['#ff5a4a', '#ffd04a', '#5aff7a', '#5ab8ff', '#ff7ad8', '#ffa04a'];

/** Shop geometry (hub px). */
export const SHOP = {
  cx: 240,
  x0: 160,
  x1: 320,
  wallTop: 128,
  base: 188,
  door: { x0: 226, x1: 254, top: 140 },
  winL: { x0: 170, x1: 216, y0: 141, y1: 169 },
  winR: { x0: 264, x1: 310, y0: 141, y1: 169 },
  sign: { x: 240, y: 66, r: 21 },
} as const;

/** A swag of string lights from (x0, y0) to (x1, y1): a dark wire, bulbs every `gap` px. */
export function stringLights(L: Layer, x0: number, y0: number, x1: number, y1: number, sag: number, gap: number, seed: number): void {
  const pts = sagCurve(x0, y0, x1, y1, sag);
  const wire: Array<[number, number]> = [];
  for (const [x, y] of pts) wire.push([Math.round(x), Math.round(y)]);
  for (const [x, y] of wire) L.px(x, y, '#1a1414');
  wire.forEach(([x, y], i) => {
    if (i === 0 || i === wire.length - 1 || (i + seed) % gap !== 0) return;
    const c = BULBS[Math.floor(h2(x, y, seed) * BULBS.length)];
    // A socket on the wire, the bulb hanging under it (two pixels, the lower one hot), and a soft
    // halo of its color round it.
    L.px(x, y + 1, '#2a2020');
    L.gl(x, y + 2, c);
    L.gl(x, y + 3, mixBulb(c));
    for (const [dx, dy, a] of [[-1, 2, 0.45], [1, 2, 0.45], [-1, 3, 0.5], [1, 3, 0.5], [0, 4, 0.55], [-1, 4, 0.22], [1, 4, 0.22], [0, 5, 0.25], [-2, 3, 0.18], [2, 3, 0.18]] as const) L.halo(x + dx, y + dy, c, a);
  });
}

function mixBulb(c: string): string {
  // The bulb's hot core: toward white.
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.round(v + (255 - v) * 0.55).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/** A round glass globe lantern hanging from a bracket at (x, y) (the bracket's end). */
export function globeLantern(L: Layer, x: number, y: number, r: number, color = '#ffc870'): void {
  // Chain, brass cap, the glowing globe, a brass foot.
  vline(L, x, y, y + 2, (yy) => (yy % 2 ? IRON[3] : IRON[2]));
  hline(L, x - 1, x + 1, y + 3, '#8a5a1a');
  L.px(x, y + 3, '#e0b040');
  const cy = y + 4 + r;
  oval(L, x, cy, r + 0.6, r + 0.6, INK);
  const glass = ['#e88a32', '#ffb84e', '#ffd47a', '#ffeab0', '#fff8e0'];
  oval(L, x, cy, r, r, (px, py, nx, ny) => {
    const d = nx * nx + ny * ny;
    const k = 4 - d * 3.4 - ny * 0.6 + nx * 0.2;
    L.gl(px, py, rk(glass, k));
    return null;
  });
  void color;
  // A glint on the glass (top left) and the brass band round it.
  L.gl(x - Math.round(r * 0.45), cy - Math.round(r * 0.5), '#ffffff');
  hline(L, x - 1, x + 1, cy + r + 1, '#8a5a1a');
  L.px(x, cy + r + 2, '#5e3812');
}

export function paintShop(out: HubOut): void {
  const S = SHOP;
  const L = new Layer(128, 30, 224, 162);

  // ---------------------------------------------------------------- roof
  // The main hip roof: a trapezoid of shingles from the eave up to the ridge.
  const eaveY = 131;
  const ridgeY = 86;
  const roofL = 146;
  const roofR = 334;
  const hipIn = 20;
  const inRoof = (x: number, y: number) => {
    if (y < ridgeY || y > eaveY) return false;
    const t = (eaveY - y) / (eaveY - ridgeY);
    return x >= roofL + hipIn * t && x <= roofR - hipIn * t;
  };
  scales(L, roofL, ridgeY, roofR, eaveY, inRoof, {
    w: 6,
    h: 5,
    ramp: ROOF,
    seed: 11,
    base: 5,
    moss: ['#1c2a14', '#2a4018', '#3a5a20', '#4e7428'],
    rowShade: (y) => ((y - ridgeY) / (eaveY - ridgeY)) * 1.1 - 0.6,
  });
  // Hip ridges (boards up the two slanted ends) and the ridge cap along the top.
  for (const side of [-1, 1]) {
    for (let y = ridgeY; y <= eaveY; y++) {
      const t = (eaveY - y) / (eaveY - ridgeY);
      const x = side < 0 ? Math.round(roofL + hipIn * t) : Math.round(roofR - hipIn * t);
      L.px(x, y, rk(TIMBER, side < 0 ? 5 : 2));
      L.px(x + side, y, rk(TIMBER, side < 0 ? 3 : 1));
      L.px(x - side, y, INK);
    }
  }
  for (let x = roofL + hipIn - 1; x <= roofR - hipIn + 1; x++) {
    L.px(x, ridgeY - 3, INK);
    L.px(x, ridgeY - 2, rk(ROOF, 6 + (x % 6 === 0 ? -2 : 0)));
    L.px(x, ridgeY - 1, rk(ROOF, 4 + (x % 6 === 0 ? -2 : 0)));
    L.px(x, ridgeY, rk(ROOF, 2));
  }
  // The eave's fascia board along the bottom of the roof, its shadow on the wall below.
  timber(L, roofL - 2, eaveY - 1, roofR - roofL + 5, 4, 21, TIMBER, 3.6);
  hline(L, roofL - 3, roofR + 3, eaveY + 3, INK);
  // A little chimney on the right with a wisp of smoke.
  {
    const cx = 300;
    const top = 70;
    for (let y = top; y < 100; y++) {
      for (let x = cx; x < cx + 12; x++) {
        if (!inRoof(x, y) && y > ridgeY) continue;
        const row = Math.floor((y - top) / 3);
        const off = row % 2 ? 2 : 0;
        const brick = (x - cx + off) % 5 === 0 || (y - top) % 3 === 2;
        L.px(x, y, brick ? '#2a1612' : rk(['#4a2218', '#6a3020', '#8a4430', '#a85a40'], 1.5 + (x === cx || x === cx + 1 ? 1.2 : 0) - (x >= cx + 10 ? 1 : 0) + h2(x, y, 3) * 0.8));
      }
    }
    hline(L, cx - 1, cx + 12, top - 1, '#a85a40');
    hline(L, cx - 1, cx + 12, top, '#4a2218');
    for (let y = top - 1; y < top + 1; y++) { L.px(cx - 2, y, INK); L.px(cx + 13, y, INK); }
    hline(L, cx - 1, cx + 12, top - 2, INK);
    for (let y = top + 1; y < 100; y++) { L.px(cx - 1, y, INK); L.px(cx + 12, y, INK); }
  }

  // ---------------------------------------------------------------- the front gable
  const ax = S.cx;
  const ay = 58;
  const gx0 = 184;
  const gx1 = 296;
  // The gable's roof seen from above: a band of scales over the barge boards.
  const band = 9;
  const slope = (eaveY - ay) / (S.cx - gx0);
  const inBand = (x: number, y: number) => {
    const d = Math.abs(x + 0.5 - ax);
    const edge = ay + d * slope;
    return y >= edge - band && y < edge + 1 && y <= eaveY + 1 && d <= S.cx - gx0 + 9;
  };
  scales(L, gx0 - 12, ay - band - 2, gx1 + 12, eaveY + 2, inBand, { w: 5, h: 4, ramp: ROOF, seed: 13, base: 5.6 });
  // The gable face: dark vertical boards and battens, a beam across, braces.
  const inFace = (x: number, y: number) => y > ay + Math.abs(x + 0.5 - ax) * slope + 1 && y < eaveY + 1;
  for (let y = ay; y <= eaveY; y++) {
    for (let x = gx0; x <= gx1; x++) {
      if (!inFace(x, y)) continue;
      const bx = (x - gx0) % 6;
      let k = 2.6 + (vnoise(x * 5, y, 1.3, 9, 37) - 0.5) * 1.3 + (h2(Math.floor((x - gx0) / 6), 0, 38) - 0.5) * 0.8;
      if (bx === 0) k = 1.2;
      else if (bx === 1) k += 1.1;
      else if (bx === 5) k -= 0.7;
      L.px(x, y, rk(TIMBER, k + 0.6));
    }
  }
  timber(L, gx0 + 6, 112, gx1 - gx0 - 12, 4, 33, TIMBER, 4.4);
  for (const side of [-1, 1]) {
    for (let t = 0; t < 18; t++) {
      const x = ax + side * (9 + t);
      const y = 111 - Math.round(t * 1.05);
      for (let k = 0; k < 3; k++) if (inFace(x, y + k)) L.px(x, y + k, rk(TIMBER, k === 0 ? 5.5 : k === 1 ? 4 : 2.2));
    }
  }
  // A round attic window under the sign, warm inside, a cross of muntins.
  {
    const wx = ax;
    const wy = 100;
    oval(L, wx, wy, 7.5, 7.5, (x, y, nx, ny) => {
      const d = Math.hypot(nx, ny);
      if (d > 0.82) return rk(TIMBER, d > 0.93 ? 1.5 : 5 - (ny + nx) * 0.8);
      L.gl(x, y, rk(GLASS, 4.4 - d * 2.4 - ny * 0.8));
      return null;
    });
    for (let k = -5; k <= 5; k++) {
      L.px(wx - 1, wy + k - 1, rk(TIMBER, 3.5));
      L.unglow(wx - 1, wy + k - 1);
      L.px(wx + k - 1, wy - 1, rk(TIMBER, 3.5));
      L.unglow(wx + k - 1, wy - 1);
    }
    L.gl(wx - 4, wy - 4, '#fff6d6');
    L.gl(wx - 3, wy - 5, '#fff6d6');
    L.light(wx, wy + 4, 36, '#ffb050', 0.35);
  }
  // Barge boards along the gable's edges: thick dark timber with a lit upper edge, notched trim under.
  for (const side of [-1, 1]) {
    const len = Math.hypot(S.cx - gx0 + 10, (S.cx - gx0 + 10) * slope);
    const dx = side * (S.cx - gx0 + 10) / len;
    const dy = ((S.cx - gx0 + 10) * slope) / len;
    // Across the board: the normal pointing up-and-out, then into the face.
    const nx = -dy * side;
    const ny = Math.abs(dx);
    void nx;
    void ny;
    for (let t = -3; t <= len; t += 0.35) {
      for (let a = 0; a < 5; a += 0.5) {
        const x = Math.round(ax + dx * t - 0.5);
        const y = Math.round(ay - 4 + dy * t + a - 0.5);
        if (y > eaveY + 3) continue;
        const k = a < 1 ? 6 : a < 2 ? 4.6 : a < 4 ? 3.2 + (vnoise(Math.round(t), 0, 5, 1, 41) - 0.5) * 1.2 : 1.6;
        L.px(x, y, rk(TIMBER, k));
      }
      // Trim: a notch every 4 px under the board.
      const x = Math.round(ax + dx * t - 0.5);
      const y = Math.round(ay - 4 + dy * t + 5 - 0.5);
      if (y <= eaveY && Math.floor(t) % 4 === 1) L.px(x, y, rk(TIMBER, 2.4));
    }
  }
  // Ink over the top of the barge boards.
  for (let x = gx0 - 12; x <= gx1 + 12; x++) {
    const d = Math.abs(x + 0.5 - ax);
    const y = Math.round(ay - 5 + d * slope);
    if (y <= eaveY + 2 && d > 1) L.px(x, y, INK);
  }
  // A finial at the apex.
  vline(L, ax, ay - 14, ay - 4, (y) => rk(TIMBER, y < ay - 10 ? 5 : 3));
  L.px(ax, ay - 15, '#e0b040');

  // ---------------------------------------------------------------- facade
  const wy0 = S.wallTop;
  const by = S.base;
  for (let y = wy0; y < by; y++) for (let x = S.x0; x < S.x1; x++) L.px(x, y, plaster(x, y, 4.2));
  // The roof's shadow along the top of the wall.
  for (let x = S.x0; x < S.x1; x++) for (let k = 0; k < 4; k++) L.tone(x, wy0 + 3 + k, -0.45 + k * 0.1);
  // Stone footing.
  for (let y = by - 5; y < by; y++) {
    for (let x = S.x0; x < S.x1; x++) {
      const row = y - (by - 5);
      const off = Math.floor((y - (by - 5)) / 3) % 2 ? 4 : 0;
      const joint = (x - S.x0 + off) % 9 === 0 || row === 2;
      L.px(x, y, joint ? '#2a2224' : rk(['#3e3638', '#554b4a', '#6e6260', '#8a7c76'], 2 + (row === 0 || row === 3 ? 1 : 0) - (row === 4 ? 1.4 : 0) + (h2(x, y, 51) - 0.5)));
    }
  }
  // Timber frame: sill, top plate, posts, a mid rail.
  timber(L, S.x0, by - 8, S.x1 - S.x0, 3, 52);
  timber(L, S.x0, wy0 + 1, S.x1 - S.x0, 4, 53);
  for (const [x, w] of [[S.x0, 6], [S.x1 - 6, 6], [S.door.x0 - 5, 5], [S.door.x1, 5]] as const) timber(L, x, wy0 + 1, w, by - wy0 - 6, 54 + x);
  // Little braces in the outer bays (above the windows' outer corners).
  for (const [x0, dir] of [[S.x0 + 6, 1], [S.x1 - 7, -1]] as const) {
    for (let t = 0; t < 6; t++) {
      L.px(x0 + dir * t, wy0 + 5 + t, rk(TIMBER, 3.5));
      L.px(x0 + dir * t, wy0 + 6 + t, rk(TIMBER, 2));
    }
  }

  // ---------------------------------------------------------------- display windows
  window(L, S.winL, 61);
  window(L, S.winR, 62);
  // Flower boxes under the windows.
  flowerBox(L, S.winL.x0 - 2, S.winL.y1 + 3, S.winL.x1 - S.winL.x0 + 4, 71);
  flowerBox(L, S.winR.x0 - 2, S.winR.y1 + 3, S.winR.x1 - S.winR.x0 + 4, 72);

  // ---------------------------------------------------------------- the door
  doorway(L);
  // The name over the door, in gold.
  const name = renderText('GILDED REEL', { face: 'small', fill: ['#fff2b0', '#ffd860', '#ffc040', '#f0a030', '#e08a28'], ink: null });
  const nx = S.cx - Math.floor(name.w / 2);
  const ny = wy0 + 5;
  // The board behind the letters.
  const bx0 = nx - 3;
  const bx1 = nx + name.w + 2;
  for (let y = ny - 1; y < ny + name.h + 1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const edge = y === ny - 1 || y === ny + name.h || x === bx0 || x === bx1;
      L.px(x, y, edge ? INK : rk(['#1a0e10', '#2a1618', '#3a2020'], 1 + (y === ny ? 1 : 0)));
    }
  }
  for (let y = 0; y < name.h; y++) {
    for (let x = 0; x < name.w; x++) {
      const i = (y * name.w + x) * 4;
      if (!name.px[i + 3]) continue;
      const f = (v: number) => v.toString(16).padStart(2, '0');
      L.gl(nx + x, ny + y, `#${f(name.px[i])}${f(name.px[i + 1])}${f(name.px[i + 2])}`);
    }
  }
  // Globe lanterns on brackets either side of the door.
  for (const [px, dir] of [[S.door.x0 - 3, -1], [S.door.x1 + 2, 1]] as const) {
    const ex = px + dir * 7;
    hline(L, px, ex, wy0 + 13, (x) => (x === ex ? IRON[4] : IRON[2]));
    hline(L, px, ex, wy0 + 12, INK);
    L.px(px + dir, wy0 + 14, IRON[1]);
    L.px(px + dir * 2, wy0 + 15, IRON[1]);
    globeLantern(L, ex, wy0 + 14, 3);
    L.light(ex, wy0 + 24, 56, '#ffb050', 0.5, 0.25);
  }

  // ---------------------------------------------------------------- string lights
  // Along the main eaves (left and right of the gable) and up the gable's edges.
  const nails = [roofL - 1, 160, 172, 184];
  for (let i = 0; i + 1 < nails.length; i++) stringLights(L, nails[i], eaveY + 3, nails[i + 1], eaveY + 3, 3, 4, i * 3 + 1);
  const nailsR = [296, 308, 320, roofR + 1];
  for (let i = 0; i + 1 < nailsR.length; i++) stringLights(L, nailsR[i], eaveY + 3, nailsR[i + 1], eaveY + 3, 3, 4, i * 3 + 2);
  for (const side of [-1, 1]) {
    const pts: Array<[number, number]> = [];
    for (let k = 0; k <= 5; k++) {
      const d = (S.cx - gx0 + 6) * (1 - k / 5) + 14 * (k / 5);
      pts.push([Math.round(ax + side * d), Math.round(ay + d * slope) + 1]);
    }
    for (let i = 0; i + 1 < pts.length; i++) stringLights(L, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 2, 4, i * 5 + (side > 0 ? 3 : 0));
  }
  for (let x = roofL; x <= roofR; x += 20) L.light(x, eaveY + 6, 14, BULBS[(x / 20) % BULBS.length | 0], 0.25);

  // ---------------------------------------------------------------- the reel sign
  reelSign(L, S.sign.x, S.sign.y, S.sign.r);

  // ---------------------------------------------------------------- lights from the windows and door
  L.light(S.winL.x0 + 23, 166, 84, '#ffa448', 0.55);
  L.light(S.winR.x0 + 23, 166, 84, '#ffa448', 0.55);
  L.light(S.cx, 180, 56, '#ff9040', 0.4);
  L.light(S.sign.x, S.sign.y + 6, 92, '#ffc860', 0.45);
  L.light(S.cx, 220, 124, '#ff9a48', 0.32);

  out.piece(L, 'shop', by, { x0: S.x0, y0: 120, x1: S.x1, y1: by + 2 });
  out.shadows.push({ kind: 'band', x: S.cx, y: by, rx: (S.x1 - S.x0) / 2 + 2, ry: 5, strength: 0.4 });
}

function plaster(x: number, y: number, base: number): string {
  // Warm limewash: soft blotches, a few cracks and bare patches.
  let k = base + (vnoise(x, y, 9, 7, 81) - 0.5) * 1.2 + (vnoise(x, y, 3, 3, 82) - 0.5) * 0.5;
  if (h2(x, y, 83) < 0.025) k -= 1;
  return rk(PLASTER, k);
}

/** A display window: frame, sill, golden glass, two shelves of goods. */
function window(L: Layer, w: { x0: number; x1: number; y0: number; y1: number }, seed: number): void {
  const { x0, x1, y0, y1 } = w;
  // The glow: brightest low in the middle where the lamps are.
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const nx = (x - (x0 + x1) / 2) / ((x1 - x0) / 2);
      const ny = (y - y0) / (y1 - y0);
      const k = 4.2 - nx * nx * 2 + (ny > 0.5 ? 0.4 : -0.4) + (vnoise(x, y, 5, 4, seed) - 0.5) * 0.8;
      L.gl(x, y, rk(GLASS, k));
    }
  }
  // Inner shelves (dark boards) and the goods on them.
  const shelves = [y0 + 12, y1 - 3];
  for (const sy of shelves) {
    for (let x = x0; x < x1; x++) {
      L.px(x, sy, rk(PLANK, 3));
      L.px(x, sy + 1, rk(PLANK, 1));
      L.unglow(x, sy);
      L.unglow(x, sy + 1);
    }
  }
  goods(L, x0 + 2, x1 - 2, shelves[0], seed, true);
  goods(L, x0 + 2, x1 - 2, shelves[1], seed + 7, false);
  // Muntins: a mullion down the middle and a transom near the top.
  const mx = Math.round((x0 + x1) / 2);
  for (let y = y0; y < y1; y++) {
    L.px(mx, y, rk(TIMBER, 4));
    L.px(mx + 1, y, rk(TIMBER, 2));
    L.unglow(mx, y);
    L.unglow(mx + 1, y);
  }
  for (let x = x0; x < x1; x++) {
    L.px(x, y0 + 5, rk(TIMBER, 4));
    L.unglow(x, y0 + 5);
  }
  // A glint across the glass.
  for (let t = 0; t < 5; t++) {
    L.gl(x0 + 3 + t, y0 + 9 - t, '#fffbe8');
    if (t < 3) L.gl(x0 + 6 + t, y0 + 9 - t, '#fff2c8');
  }
  // The frame.
  for (let y = y0 - 2; y < y1 + 2; y++) {
    for (const x of [x0 - 2, x0 - 1, x1, x1 + 1]) L.px(x, y, rk(TIMBER, x === x0 - 2 ? 5.5 : x === x1 + 1 ? 1.5 : 3));
  }
  for (let x = x0 - 2; x < x1 + 2; x++) {
    L.px(x, y0 - 2, rk(TIMBER, 5.5));
    L.px(x, y0 - 1, rk(TIMBER, 3));
    // The sill: a lit board sticking out.
    L.px(x, y1, rk(PLANK, 5));
    L.px(x, y1 + 1, rk(PLANK, 3));
    L.px(x, y1 + 2, rk(PLANK, 1));
  }
  hline(L, x0 - 3, x1 + 2, y1 + 3, INK);
}

/**
 * Goods standing on a window shelf at `sy` (their feet on it): helmets, swords, potions, gems,
 * little golden reels, coin stacks, a knight figurine. Upper shelf: smaller things.
 */
function goods(L: Layer, xa: number, xb: number, sy: number, seed: number, small: boolean): void {
  let x = xa + 1;
  let i = 0;
  const kinds = small ? ['gem', 'potion', 'coins', 'jar', 'gem', 'potion', 'coins'] : ['helm', 'sword', 'potion', 'reel', 'figure', 'shield', 'coins', 'helm'];
  while (x < xb - 3) {
    const kind = kinds[(i + Math.floor(h2(i, 0, seed) * 3)) % kinds.length];
    const w = item(L, kind, x, sy, seed + i);
    x += w + 2;
    i++;
  }
}

/** One display item with its feet at (x.., sy); returns its width. */
function item(L: Layer, kind: string, x: number, sy: number, seed: number): number {
  const gold = ['#5e3812', '#b8862a', '#f0c850', '#fff0a8'];
  const steel = ['#2a2a36', '#6a6a7c', '#a8a8bc', '#e8e8f4'];
  const P = (px: number, py: number, c: string) => {
    L.px(px, py, c);
    L.unglow(px, py);
  };
  const potionCols = [['#5a0e1a', '#b8202e', '#ff5a5a'], ['#0e2a5a', '#2a5ab8', '#6aa8ff'], ['#0e4a2a', '#22a050', '#7aff9a']];
  switch (kind) {
    case 'helm': {
      // A knight's helm: dome, visor slit, plume.
      const c = h2(seed, 1, 1) < 0.5 ? gold : steel;
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 5; xx++) {
        if ((yy === 0 && (xx === 0 || xx === 4))) continue;
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
      // A little golden reel on a stand: a ring with a dark middle.
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
      // A tiny knight figurine on a plinth.
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

/** A planter under a window: a box of boards with flowers and leaves spilling over. */
function flowerBox(L: Layer, x: number, y: number, w: number, seed: number): void {
  planks(L, x, y + 2, w, 5, { dir: 'h', board: 3, seed, base: 3.6, joint: 19 });
  hline(L, x, x + w - 1, y + 7, INK);
  for (let yy = y + 2; yy < y + 7; yy++) {
    L.px(x - 1, yy, INK);
    L.px(x + w, yy, INK);
  }
  // Soil, then leaves and flowers.
  hline(L, x, x + w - 1, y + 2, '#2a1a12');
  const flowers = ['#ff5a6a', '#ff8ab8', '#fff0e0', '#ffb04a', '#c86aff'];
  for (let i = 0; i < w; i += 2) {
    const fx = x + i;
    const tall = 1 + Math.floor(h2(i, 1, seed) * 3);
    for (let t = 0; t < tall; t++) L.px(fx, y + 2 - t, rk(['#0f2a14', '#17401a', '#215a20', '#2f7626', '#43922c', '#62ae34'], 2 + t + h2(i, t, seed)));
    if (h2(i, 2, seed) < 0.55) {
      const c = flowers[Math.floor(h2(i, 3, seed) * flowers.length)];
      L.px(fx, y + 1 - tall, c);
      if (h2(i, 4, seed) < 0.5) L.px(fx + 1, y + 2 - tall, c);
    }
  }
  // A trailing vine over the front.
  for (let i = 3; i < w; i += 7) {
    const len = 2 + Math.floor(h2(i, 5, seed) * 3);
    for (let t = 0; t < len; t++) L.px(x + i + (t > 1 ? 1 : 0), y + 3 + t, rk(['#17401a', '#215a20', '#2f7626', '#43922c'], 3 - t * 0.6));
  }
}

/** The arched doorway: a carved frame, the warm dim inside (a counter, shelves), a curtain. */
function doorway(L: Layer): void {
  const { x0, x1, top } = SHOP.door;
  const by = SHOP.base - 8;
  const cx = (x0 + x1) / 2;
  const r = (x1 - x0) / 2;
  const inside = (x: number, y: number) => {
    if (x < x0 || x >= x1 || y >= by) return false;
    if (y >= top + r) return true;
    const dy = top + r - (y + 0.5);
    const dx = x + 0.5 - cx;
    return dx * dx + dy * dy <= r * r;
  };
  for (let y = top; y < by; y++) {
    for (let x = x0; x < x1; x++) {
      if (!inside(x, y)) continue;
      // The dark inside, warmer toward the floor where the lamps are.
      const t = (y - top) / (by - top);
      const c = rk(['#0e080c', '#160c10', '#201014', '#2e1816', '#42221a', '#5a301e'], t * 3.6 + (vnoise(x, y, 4, 6, 91) - 0.5) * 0.8);
      L.px(x, y, c);
    }
  }
  // Shelves inside, glimpsed: dark boards with a few glinting things.
  for (const sy of [top + 14, top + 22]) {
    for (let x = x0 + 2; x < x1 - 2; x++) if (inside(x, sy)) L.px(x, sy, '#3a2016');
    for (let x = x0 + 4; x < x1 - 4; x += 4) if (inside(x, sy - 1)) L.px(x, sy - 1, h2(x, sy, 92) < 0.5 ? '#8a6a3a' : '#6a3a5a');
  }
  // A counter across the back with a little gold glint.
  for (let x = x0 + 1; x < x1 - 1; x++) {
    L.px(x, by - 9, '#6a4024');
    L.px(x, by - 8, '#4a2c1a');
  }
  L.px(cx - 4, by - 10, '#ffd060');
  L.px(cx + 5, by - 10, '#c8a0ff');
  // Curtains tied back at the top corners.
  for (let y = top; y < top + 14; y++) {
    for (let x = x0; x < x1; x++) {
      if (!inside(x, y)) continue;
      const fromL = x - x0;
      const fromR = x1 - 1 - x;
      const reach = Math.max(0, 6 - Math.floor((y - top) * 0.45));
      if (fromL < reach) L.px(x, y, rk(['#3a0e1a', '#6a1a2a', '#9a2a3a', '#c84a4a'], 2.2 - (fromL === reach - 1 ? 1 : 0) + (fromL === 0 ? 0.8 : 0)));
      if (fromR < reach) L.px(x, y, rk(['#3a0e1a', '#6a1a2a', '#9a2a3a', '#c84a4a'], 1.8 - (fromR === reach - 1 ? 1 : 0)));
    }
  }
  // The carved arch round it.
  for (let y = top - 4; y < by; y++) {
    for (let x = x0 - 3; x < x1 + 3; x++) {
      if (inside(x, y)) continue;
      const dx = x + 0.5 - cx;
      const dy = Math.min(0, y + 0.5 - (top + r));
      const d = Math.hypot(dx, dy);
      if (d > r + 3) continue;
      const k = d < r + 1 ? 2 : d < r + 2 ? 4.5 : 3;
      L.px(x, y, rk(TIMBER, k + (dy < -r * 0.5 ? 0.6 : 0)));
    }
  }
  // A keystone.
  for (let y = top - 4; y < top; y++) for (let x = cx - 2; x < cx + 2; x++) L.px(x, y, rk(['#5e3812', '#8a5a1a', '#b8862a', '#e0b040'], 3 - (y - (top - 4)) * 0.6));
  // The threshold.
  hline(L, x0 - 2, x1 + 1, by, rk(PLANK, 5));
  hline(L, x0 - 2, x1 + 1, by + 1, rk(PLANK, 2));
}

/**
 * The big round reel sign: a gilded ring studded with marquee bulbs, a deep blue face, eight gold
 * spokes to a hub with a bright star, hung on a bracket in front of the gable.
 */
function reelSign(L: Layer, cx: number, cy: number, R: number): void {
  // The bracket: an iron arm from the finial and two chains.
  vline(L, cx, cy - R - 6, cy - R + 1, (y) => IRON[y % 2 ? 2 : 4]);
  // Outer dark rim (ink), then the gold ring, then the face.
  oval(L, cx, cy, R + 1.2, R + 1.2, INK);
  const gold = ['#6a3a10', '#9a6418', '#c8902a', '#f0c048', '#ffe080', '#fff4c0'];
  oval(L, cx, cy, R, R, (x, y, nx, ny) => {
    const d = Math.hypot(nx, ny);
    if (d < 0.74) return null;
    // A rounded band: lit on its upper left, a groove in the middle where the bulbs sit.
    const lit = -nx * 0.5 - ny * 0.75;
    let k = 2.6 + lit * 1.6;
    if (d > 0.84 && d < 0.9) k -= 1.2;
    if (d > 0.96) k -= 0.8;
    L.gl(x, y, rk(gold, k));
    return null;
  });
  // The face: night blue with a subtle radial sheen.
  oval(L, cx, cy, R * 0.76, R * 0.76, (x, y, nx, ny) => {
    const d = Math.hypot(nx, ny);
    const k = 2.4 - d * 1.6 - ny * 0.4;
    L.gl(x, y, rk(['#0e0a2a', '#1a1448', '#2a2068', '#3a2e88', '#4e3ea8'], k));
    return null;
  });
  // Eight gold spokes from the hub to the ring, each a pixel-wide line with a lit side.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    for (let t = 4; t < R * 0.76; t += 0.5) {
      const x = Math.round(cx + Math.cos(a) * t - 0.5);
      const y = Math.round(cy + Math.sin(a) * t - 0.5);
      L.gl(x, y, i % 2 ? '#d8a038' : '#f8d060');
    }
  }
  // The hub and a five-pointed star.
  oval(L, cx, cy, 4.5, 4.5, (x, y, nx, ny) => {
    L.gl(x, y, rk(gold, 3.2 - ny * 1.2 - nx * 0.5));
    return null;
  });
  const star: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? 2.6 : 6.4;
    star.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  poly(L, star, (x, y) => {
    L.gl(x, y, y < cy ? '#fffbe0' : '#ffe890');
    return null;
  });
  L.gl(cx - 1, cy - 1, '#ffffff');
  // Marquee bulbs round the ring, in the groove: warm white and gold, alternating.
  const n = 20;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * R * 0.87 - 0.5);
    const y = Math.round(cy + Math.sin(a) * R * 0.87 - 0.5);
    L.gl(x, y, i % 2 ? '#fff8e0' : '#ffd860');
  }
}
