/**
 * The court's furniture, drawn small to suit the keepers who use it (they stand about 17 px tall):
 * lit top faces, darker fronts, crisp outlines tinted from each thing's own colour. The quartermaster's
 * round table (her ledger, a candle, a mug) and the chair behind her, a stool for the traveller across
 * from her; the sage's high-backed chair; clay pots of round bushes, leafy plants and flowers; crates,
 * a barrel, a basket of scrap.
 */
import { GOLD, h2, hline, IRON, Layer, LEAF, clump, leaf, oval, PLANK, planks, rk, rkd, sphere, TIMBER, vnoise, type Ramp } from './hubKit';
import type { HubOut } from './hubScene';

export const TERRA: Ramp = ['#3a160c', '#5e2414', '#86361e', '#a84a2a', '#c8663a', '#e0864e'];
/** A cooler glazed pot, dark teal (the reference's flower pot by the steps). */
export const GLAZE: Ramp = ['#0c1c20', '#14303a', '#1c4450', '#286070', '#3a8090', '#5aa4b0'];

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

/** A clay pot (lit rim, rounded belly, a dark foot) with its rim's top-left at (x, y), `w` wide. */
export function pot(L: Layer, x: number, y: number, w: number, h: number, ramp: Ramp = TERRA): void {
  hline(L, x - 1, x + w, y, rk(ramp, 5));
  hline(L, x - 1, x + w, y + 1, rk(ramp, 3.4));
  L.px(x - 1, y + 1, rk(ramp, 2.6));
  L.px(x + w, y + 1, rk(ramp, 1.6));
  for (let yy = y + 2; yy < y + h; yy++) {
    const t = (yy - y - 2) / Math.max(1, h - 3);
    const inset = t > 0.7 ? 1 : 0;
    for (let xx = x + inset; xx < x + w - inset; xx++) {
      const u = (xx - x) / (w - 1);
      L.px(xx, yy, rkd(ramp, 3.7 - u * 2.4 + (u < 0.22 ? 0.7 : 0) - t * 0.9 - (yy === y + h - 1 ? 0.6 : 0), xx, yy));
    }
  }
  hline(L, x, x + w - 1, y, '#2a1810');
}

/** A candle in a little brass dish (its flame glows). */
export function candle(L: Layer, x: number, y: number, tall = 3): void {
  hline(L, x - 1, x + 1, y - 1, rk(GOLD, 3));
  for (let yy = 0; yy < tall; yy++) L.px(x, y - 2 - yy, yy === tall - 1 ? '#fff6e4' : '#e8dcc0');
  L.gl(x, y - 2 - tall, '#ffb040');
  L.gl(x, y - 3 - tall, '#fff2a8');
  L.halo(x - 1, y - 3 - tall, '#ffb040', 0.35);
  L.halo(x + 1, y - 3 - tall, '#ffb040', 0.35);
  L.halo(x, y - 4 - tall, '#ffd070', 0.4);
  L.halo(x, y - 1 - tall, '#ffb040', 0.2);
}

/** A small square lantern standing (or hanging) with its top at (x, y): a brass cap, warm glass, a foot. */
export function lanternBox(L: Layer, x: number, y: number): void {
  hline(L, x - 1, x + 1, y, rk(GOLD, 4.6));
  hline(L, x - 2, x + 2, y + 1, rk(GOLD, 2.6));
  for (let yy = y + 2; yy < y + 6; yy++) {
    for (let xx = x - 2; xx <= x + 2; xx++) {
      if (xx === x - 2 || xx === x + 2) L.px(xx, yy, IRON[2]);
      else L.gl(xx, yy, yy < y + 3 ? '#fff2c0' : xx === x - 1 ? '#ffe090' : '#ffc860');
    }
  }
  hline(L, x - 2, x + 2, y + 6, rk(GOLD, 2.6));
  for (const [dx, dy, a] of [[-3, 3, 0.35], [3, 3, 0.35], [-3, 4, 0.3], [3, 4, 0.3], [0, 7, 0.3], [-1, -1, 0.2], [1, -1, 0.2]] as const) L.halo(x + dx, y + dy, '#ffb850', a);
}

/** A standing barrel (lit staves, iron hoops) with its foot at (x.., y), `w` wide. */
export function barrel(L: Layer, x: number, y: number, seed: number, w = 8, hgt = 10): void {
  for (let yy = y - hgt; yy < y; yy++) {
    const iy = yy - (y - hgt);
    const bulge = iy > 1 && iy < hgt - 2 ? 1 : 0;
    for (let xx = x - bulge; xx < x + w + bulge; xx++) {
      const t = (xx - x + bulge) / (w + bulge * 2 - 1);
      const hoop = iy === 2 || iy === hgt - 3;
      const stave = (xx - x) % 3 === 0;
      L.px(xx, yy, hoop ? rk(IRON, 4.4 - t * 3) : rk(PLANK, 5.2 - t * 3.4 - (stave ? 0.6 : 0) + (h2(xx, yy, seed) - 0.5) * 0.4));
    }
  }
  for (let xx = x; xx < x + w; xx++) {
    L.px(xx, y - hgt - 1, rk(PLANK, 6));
    L.px(xx, y - hgt, rk(PLANK, 4.4));
  }
}

// ------------------------------------------------------------------ the quartermaster's table

/**
 * The quartermaster's round table: a plank top (lit toward the upper left, a dark rim under its front
 * edge) on a thick turned pedestal with three feet; her ledger open on it, a quill, a candle, a mug.
 * (x, y) is the middle of the top; it stands with its feet at y + 12.
 */
export function roundTable(out: HubOut, x: number, y: number): void {
  const foot = y + 12;
  const L = new Layer(x - 15, y - 14, 31, 28);
  const rx = 11;
  const ry = 4.2;
  // The pedestal and its feet.
  for (let yy = y + 3; yy <= foot; yy++) {
    const flare = yy > foot - 3 ? (yy - (foot - 3)) * 2 : yy < y + 5 ? 1 : 0;
    for (let xx = x - 2 - flare; xx <= x + 2 + flare; xx++) {
      const t = (xx - (x - 2 - flare)) / (4 + flare * 2);
      L.px(xx, yy, rk(PLANK, 4.6 - t * 3 + (yy === foot ? -0.8 : 0) + (xx === x - 1 && yy < foot - 2 ? 0.6 : 0)));
    }
  }
  // The top: its edge (the thickness, seen along the front), then the boards.
  oval(L, x, y + 1.6, rx, ry, (_xx, _yy, nx) => rk(PLANK, 2.4 - nx * 0.8));
  oval(L, x, y, rx, ry, (xx, yy, nx, ny) => {
    const d = Math.hypot(nx, ny);
    const board = Math.floor((yy - (y - ry) + 0.5) / 3);
    let k = 5.2 - ny * 0.7 - nx * 0.5 + (h2(board, 0, 401) - 0.5) * 0.7 + (vnoise(xx * 0.5, yy * 4, 4, 1, 402) - 0.5) * 0.8;
    if ((yy - Math.floor(y - ry)) % 3 === 2 && d < 0.92) k -= 0.9;
    if (d > 0.9) k = ny < 0 ? 6.4 : 3;
    return rk(PLANK, k);
  });
  // The ledger, open: two cream pages with lines of ink, a red ribbon.
  for (let yy = y - 3; yy <= y; yy++) {
    for (let xx = x - 8; xx <= x - 1; xx++) {
      const gutter = xx === x - 5;
      L.px(xx, yy, gutter ? '#b8a888' : yy === y - 3 ? '#fffaf0' : '#efe4cc');
      if (!gutter && yy > y - 3 && (xx + yy) % 3 !== 0 && yy < y) L.px(xx, yy, '#a89a80');
    }
  }
  hline(L, x - 8, x - 1, y + 1, '#8a5a3a');
  L.px(x - 5, y + 1, '#c8323a');
  L.px(x - 5, y + 2, '#a81a2a');
  // A quill in an inkpot.
  L.px(x - 1, y - 6, '#f4f0e8');
  L.px(x, y - 5, '#e8e0d0');
  L.px(x, y - 4, '#d8d0c0');
  L.px(x, y - 3, '#1a1418');
  L.px(x + 1, y - 3, '#2a2430');
  // The mug and the candle.
  for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) L.px(x + 3 + xx, y - 3 + yy, yy === 0 ? '#fff6e0' : xx === 0 ? '#c8945a' : '#8a5a30');
  L.px(x + 6, y - 2, '#6a4020');
  candle(L, x + 8, y + 1, 3);
  L.outlineTinted(0.72);
  L.light(x + 8, y - 6, 34, '#ffa848', 0.5, 0.5);
  out.piece(L, 'roundTable', foot, { x0: x - rx, y0: y - 4, x1: x + rx, y1: foot });
  out.shadows.push({ kind: 'oval', x: x + 2, y: foot, rx: rx + 2, ry: 3, strength: 0.45 });
}

/**
 * A ladder-back chair seen from the front, its back behind whoever sits in it (the crest rail rising
 * over their head, knobs on the posts); the seat at y - 6.
 */
export function chair(out: HubOut, x: number, y: number, id: string, tall = 15): void {
  const L = new Layer(x - 7, y - tall - 4, 15, tall + 6);
  // The back: two posts with turned knobs, a curved crest rail, a slat under it.
  for (const px of [x - 5, x + 4]) {
    for (let yy = y - tall; yy <= y; yy++) L.px(px, yy, rk(PLANK, px < x ? 5 : 2.4));
    L.px(px, y - tall - 1, rk(PLANK, px < x ? 6.4 : 3.4));
  }
  for (let xx = x - 4; xx <= x + 3; xx++) {
    const arch = Math.abs(xx + 0.5 - x) < 2.5 ? 1 : 0;
    L.px(xx, y - tall - arch, rk(PLANK, 6));
    L.px(xx, y - tall + 1 - arch, rk(PLANK, 4.2));
    L.px(xx, y - tall + 2, rk(PLANK, 2.6));
  }
  hline(L, x - 4, x + 3, y - tall + 5, rk(PLANK, 4.4));
  hline(L, x - 4, x + 3, y - tall + 6, rk(PLANK, 2.4));
  // Seat and front legs.
  L.rect(x - 5, y - 6, 11, 2, (_xx, yy) => rk(PLANK, yy === y - 6 ? 6 : 4));
  hline(L, x - 5, x + 5, y - 4, rk(PLANK, 2));
  for (const px of [x - 5, x + 5]) for (let yy = y - 3; yy <= y; yy++) L.px(px, yy, rk(PLANK, px < x ? 4.5 : 2));
  L.outlineTinted(0.72);
  out.piece(L, id, y - 1, null);
  out.shadows.push({ kind: 'oval', x: x + 2, y: y + 1, rx: 7, ry: 2, strength: 0.4 });
}

/** A little round stool (its sort line a pixel above its foot, so whoever sits on it is drawn after). */
export function stool(out: HubOut, x: number, y: number, id: string): void {
  const L = new Layer(x - 5, y - 6, 11, 8);
  for (let yy = y - 3; yy <= y; yy++) {
    for (const xx of [x - 3, x + 3]) L.px(xx, yy, rk(PLANK, xx < x ? 4 : 2));
  }
  hline(L, x - 2, x + 2, y - 1, rk(PLANK, 2.4));
  oval(L, x, y - 4, 4, 1.6, (_xx, _yy, nx, ny) => rk(PLANK, 4.8 - ny * 1.2 - nx * 0.5));
  L.outlineTinted(0.72);
  out.piece(L, id, y - 1, null);
  out.shadows.push({ kind: 'oval', x: x + 1, y: y + 1, rx: 5, ry: 1.6, strength: 0.4 });
}

/**
 * The sage's wing-back armchair (he sits in it facing left): a tall back of buttoned green velvet in
 * a carved frame with a teal sigil on its crest, rolled arms either side, short turned legs. (x, y):
 * the floor under the seat's middle.
 */
export function sageChair(out: HubOut, x: number, y: number): void {
  const L = new Layer(x - 11, y - 27, 23, 30);
  const VELVET: Ramp = ['#08201c', '#0e3028', '#144238', '#1e5a4c', '#2a7a66', '#3a9a80'];
  // The back: a rounded panel of velvet, wings at its top corners, the carved frame round it.
  const bx0 = x - 7;
  const bx1 = x + 9;
  const by0 = y - 23;
  const by1 = y - 6;
  for (let yy = by0 - 1; yy < by1; yy++) {
    for (let xx = bx0 - 1; xx <= bx1; xx++) {
      const ix = xx - bx0;
      const iy = yy - by0;
      // The top curves down at the corners (the wings).
      const crest = Math.round(Math.pow(Math.abs(xx + 0.5 - (bx0 + bx1) / 2) / ((bx1 - bx0) / 2), 2.2) * 3);
      if (iy < crest - 1) continue;
      const frame = iy === crest - 1 || ix <= 0 || xx >= bx1;
      if (frame) {
        L.px(xx, yy, rk(TIMBER, ix <= 0 || iy === crest - 1 ? 5.4 : 2.2));
        continue;
      }
      // Velvet: lit toward the top left, buttoned in a diamond grid, each tuft a little hollow.
      let k = 3.6 - (ix / (bx1 - bx0)) * 1.6 - (iy / (by1 - by0)) * 0.8 + (vnoise(xx, yy, 3, 3, 403) - 0.5) * 0.5;
      const bx = (ix + (Math.floor(iy / 4) % 2) * 2) % 4;
      const tuft = bx === 2 && iy % 4 === 2;
      if (tuft) k = 0.6;
      else if (bx === 2 && iy % 4 === 1) k += 0.6;
      L.px(xx, yy, rk(VELVET, k));
    }
  }
  // A gold knob and a teal sigil carved in the crest.
  L.px(x + 1, by0 - 2, rk(GOLD, 5.6));
  L.px(x + 1, by0 - 3, rk(GOLD, 3.6));
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [0, 0]] as const) {
    L.px(x + 1 + dx, by0 + 3 + dy, dx === 0 && dy === 0 ? '#c8fff4' : '#7af0e0');
    L.halo(x + 1 + dx, by0 + 3 + dy, '#7af0e0', 0.45);
  }
  // The seat and the rolled arms either side.
  L.rect(bx0, y - 8, bx1 - bx0, 2, (xx, yy) => rk(VELVET, yy === y - 8 ? 4.4 - (xx - bx0) * 0.08 : 3));
  for (const [ax, lit] of [[bx0 - 2, 1], [bx1 - 2, 0]] as const) {
    for (let yy = y - 11; yy < y - 4; yy++) {
      for (let xx = ax; xx < ax + 4; xx++) {
        const top = yy < y - 9;
        L.px(xx, yy, top ? rk(VELVET, lit ? 4.8 - (xx - ax) * 0.4 : 3.6) : rk(TIMBER, (lit ? 4.4 : 2.6) - (xx - ax) * 0.3));
      }
    }
  }
  hline(L, bx0 - 2, bx1 + 1, y - 4, rk(TIMBER, 2));
  // Short turned legs.
  for (const [px, k] of [[bx0 - 1, 4.6], [bx1, 2.4]] as const) for (let yy = y - 3; yy <= y; yy++) L.px(px, yy, rk(TIMBER, k - (yy === y - 2 ? 0.8 : 0)));
  L.outlineTinted(0.72);
  out.piece(L, 'sageChair', y - 1, { x0: x - 8, y0: y - 6, x1: x + 10, y1: y });
  out.shadows.push({ kind: 'oval', x: x + 2, y: y + 1, rx: 10, ry: 2.4, strength: 0.42 });
}

// ------------------------------------------------------------------ plants in pots

/** A round potted bush (the reference's green ball on the counter): a clay pot, a lobed bush, a few flowers. */
export function pottedBush(out: HubOut, x: number, y: number, seed: number, r = 6, ramp: Ramp = TERRA, flowers: readonly string[] = ['#fff6f0', '#ffd0e0']): void {
  const L = new Layer(x - r - 4, y - r * 2 - 10, r * 2 + 9, r * 2 + 13);
  const pw = Math.max(5, Math.round(r * 1.2));
  pot(L, x - Math.floor(pw / 2), y - 6, pw, 6, ramp);
  clump(L, x, y - 6 - r * 0.72, r, r * 0.86, { seed, tone: 0.62, lobes: 5 });
  for (let i = 0; i < 4; i++) {
    const fx = Math.round(x - r * 0.6 + h2(i, 1, seed) * r * 1.2);
    const fy = Math.round(y - 6 - r * 1.35 + h2(i, 2, seed) * r * 0.9);
    L.px(fx, fy, flowers[i % flowers.length]);
  }
  L.outlineTinted(0.72);
  out.piece(L, `bush${seed}`, y);
  out.shadows.push({ kind: 'oval', x: x + 2, y: y + 1, rx: pw / 2 + 2, ry: 2, strength: 0.42 });
}

/** A leafy plant in a tall pot (by the door): broad leaves fanning up and out. */
export function pottedPlant(out: HubOut, x: number, y: number, seed: number, size = 9, ramp: Ramp = TERRA): void {
  const L = new Layer(x - size * 2, y - size * 2 - 8, size * 4 + 1, size * 2 + 10);
  pot(L, x - 3, y - 7, 7, 7, ramp);
  const leaves: Array<[number, number]> = [];
  for (let i = 0; i < 7; i++) leaves.push([-Math.PI / 2 + (i / 6 - 0.5) * 2.6 + (h2(i, 1, seed) - 0.5) * 0.3, size * (0.75 + h2(i, 2, seed) * 0.4)]);
  leaves.sort((p, q) => Math.sin(p[0]) - Math.sin(q[0]));
  leaves.forEach(([a, len], i) => leaf(L, x + Math.cos(a) * 1.5, y - 8, a, len, len * 0.5, { tone: 0.5 + Math.sin(a) * 0.2 + 0.2, seed: seed * 11 + i, shape: 'broad' }));
  L.outlineTinted(0.72);
  out.piece(L, `plant${seed}`, y);
  out.shadows.push({ kind: 'oval', x: x + 2, y: y + 1, rx: 5, ry: 2, strength: 0.42 });
}

/** A pot of flowers: dark leaves heaped over the rim, round heads of little flowers on top. */
export function flowerPot(out: HubOut, x: number, y: number, seed: number, cols: readonly string[], w = 7, ramp: Ramp = TERRA): void {
  const L = new Layer(x - w - 3, y - 18, w * 2 + 7, 20);
  pot(L, x - Math.floor(w / 2), y - 6, w, 6, ramp);
  clump(L, x, y - 8, w * 0.75, 3.6, { seed, tone: 0.42, lobes: 4 });
  for (let i = 0; i < Math.round(w * 0.9); i++) {
    const fx = Math.round(x - w * 0.6 + h2(i, 1, seed) * w * 1.2);
    const fy = Math.round(y - 13 + h2(i, 2, seed) * 4.5);
    const c = cols[Math.floor(h2(i, 3, seed) * cols.length)];
    L.px(fx, fy, c);
    L.px(fx + 1, fy, mixDark(c));
    L.px(fx, fy - 1, mixLight(c));
  }
  L.outlineTinted(0.72);
  out.piece(L, `flowers${seed}`, y);
  out.shadows.push({ kind: 'oval', x: x + 2, y: y + 1, rx: w / 2 + 2, ry: 2, strength: 0.42 });
}

function mixLight(c: string): string {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.round(v + (255 - v) * 0.45).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

function mixDark(c: string): string {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.62).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

// ------------------------------------------------------------------ crates and such

/** Crates stacked, a little pot of herbs on top. */
export function crates(out: HubOut, x: number, y: number, id: string, seed: number): void {
  const L = new Layer(x - 9, y - 22, 19, 24);
  box(L, x - 8, y - 9, 10, 2, 7, PLANK, seed);
  box(L, x + 1, y - 7, 7, 2, 5, PLANK, seed + 1);
  box(L, x - 6, y - 17, 8, 2, 6, PLANK, seed + 2);
  pot(L, x + 2, y - 11, 4, 4);
  L.px(x + 3, y - 12, rk(LEAF, 6));
  L.px(x + 4, y - 13, rk(LEAF, 7));
  L.px(x + 5, y - 12, rk(LEAF, 5));
  L.outlineTinted(0.72);
  out.piece(L, id, y);
  out.shadows.push({ kind: 'oval', x: x + 1, y: y + 1, rx: 9, ry: 2, strength: 0.42 });
}

/** A barrel on the paving. */
export function barrelPiece(out: HubOut, x: number, y: number, id: string, seed = 5): void {
  const L = new Layer(x - 6, y - 13, 12, 15);
  barrel(L, x - 4, y, seed);
  L.outlineTinted(0.72);
  out.piece(L, id, y);
  out.shadows.push({ kind: 'oval', x: x + 1, y: y + 1, rx: 5, ry: 1.6, strength: 0.42 });
}

/** The junk dealer's scrap basket: an open crate heaped with gears, a sword hilt, a helm, a pan. */
export function scrapCrate(out: HubOut, x: number, y: number): void {
  const L = new Layer(x - 8, y - 18, 17, 20);
  // The heap, behind the crate's front.
  const heap: Array<[number, number, string]> = [];
  for (let i = 0; i < 26; i++) heap.push([x - 6 + Math.floor(h2(i, 1, 90) * 13), y - 9 - Math.floor(h2(i, 2, 90) * 4), h2(i, 3, 90) < 0.5 ? rk(IRON, 2.5 + h2(i, 4, 90) * 3.5) : rk(GOLD, 2 + h2(i, 4, 90) * 4)]);
  for (const [hx, hy, c] of heap) L.px(hx, hy, c);
  // A sword sticking out, a gear on top, a pan handle.
  for (let t = 0; t < 8; t++) L.px(x + 3 + Math.round(t * 0.3), y - 9 - t, t < 2 ? rk(PLANK, 2) : t === 2 ? rk(GOLD, 4) : rk(IRON, t > 6 ? 3 : 5.6));
  oval(L, x - 3, y - 12, 2.4, 2.4, (_xx, _yy, nx, ny) => (Math.hypot(nx, ny) < 0.36 ? '#1a1418' : rk(GOLD, 4 - ny * 1.4 - nx * 0.5)));
  hline(L, x - 7, x - 4, y - 11, rk(PLANK, 3));
  box(L, x - 7, y - 9, 14, 2, 7, PLANK, 91);
  hline(L, x - 6, x + 5, y - 4, rk(PLANK, 1));
  L.outlineTinted(0.72);
  out.piece(L, 'scrapCrate', y);
  out.shadows.push({ kind: 'oval', x: x + 1, y: y + 1, rx: 8, ry: 2, strength: 0.42 });
}

/** A black cat curled up asleep, its tail round it and one ear up. */
export function cat(out: HubOut, x: number, y: number): void {
  const L = new Layer(x - 6, y - 7, 13, 8);
  oval(L, x, y - 2.5, 4.6, 2.6, (_xx, _yy, nx, ny) => rk(['#0e0c12', '#1c1824', '#2c2636', '#3e364a'], 1.6 - ny * 1.2 - nx * 0.4));
  L.px(x - 4, y - 5, '#1c1824');
  L.px(x - 3, y - 6, '#2c2636');
  L.px(x - 5, y - 6, '#1c1824');
  hline(L, x + 2, x + 6, y - 1, '#1c1824');
  L.px(x - 3, y - 4, '#f0c040');
  L.outlineTinted(0.6);
  out.piece(L, 'cat', y, null);
  out.shadows.push({ kind: 'oval', x: x + 1, y: y, rx: 5, ry: 1.4, strength: 0.4 });
}

/** A ball lamp on a short post (a globe of warm glass on brass): lights the corners of the court. */
export function postLamp(out: HubOut, x: number, y: number, id: string, h = 16): void {
  const L = new Layer(x - 6, y - h - 8, 13, h + 10);
  L.rect(x - 2, y - 3, 5, 3, (xx, yy) => rk(['#2a2426', '#3e3638', '#554b4a', '#6e6260', '#8a7c76'], yy === y - 3 ? 4 : xx === x - 2 ? 3.4 : 2));
  for (let yy = y - h; yy < y - 3; yy++) {
    L.px(x, yy, IRON[3]);
    L.px(x + 1, yy, IRON[1]);
  }
  hline(L, x - 1, x + 2, y - h, rk(GOLD, 3));
  sphere(L, x + 0.5, y - h - 3, 2.6, 2.6, ['#e88a32', '#ffb84e', '#ffd47a', '#ffeab0', '#fff8e0'], { spec: '#ffffff', glow: true });
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    L.halo(Math.round(x + 0.5 + Math.cos(ang) * 4 - 0.5), Math.round(y - h - 3 + Math.sin(ang) * 4 - 0.5), '#ffb850', 0.35);
  }
  L.outlineTinted(0.72);
  L.light(x, y - h - 3, 38, '#ffae4c', 0.38, 0.15);
  out.piece(L, id, y);
  out.shadows.push({ kind: 'oval', x: x + 1, y: y + 1, rx: 3, ry: 1.4, strength: 0.42 });
}

