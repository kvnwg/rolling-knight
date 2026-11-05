/**
 * The rest of the square's keepers' places: the smithy (a shingled lean-to over a stone forge full of
 * glowing coals, bellows, an anvil on its stump, a quench barrel, a rack of blades, crossed hammers
 * on the sign), the junk dealer's green-striped stall with its overflowing scrap bins and a brass
 * scale, the sage's bench among standing stones with glowing sigils, the rebirth shrine (a little
 * stone house round a rose-gold rising-sun emblem, candles on its steps), the notice board, the gate
 * arch over the steps down (lanterns on its posts, the dungeon's glow below), and the lamp posts with
 * warm string lights swagged between them.
 */
import { renderText } from '../pixel/font';
import { box, barrel, candle, CANVAS, GREEN, lanternBox, pot, TERRA, awning } from './hubStalls';
import { GOLD, h2, hline, IRON, Layer, LEAF, oval, PLANK, planks, poly, rk, sagCurve, scales, sphere, STONE, timber, TIMBER, vline, vnoise, blocks, type Ramp } from './hubKit';
import { ROOF } from './hubShop';
import type { HubOut } from './hubScene';

const EMBER: Ramp = ['#5a0e04', '#9a2208', '#d8460c', '#ff7a1a', '#ffb040', '#ffe080', '#fff8d0'];
const SIGIL = '#7af0e0';
const ROSE: Ramp = ['#6a2a3a', '#a84a5a', '#e07a7a', '#ffb0a0', '#ffd8c0', '#fff4e8'];

// ------------------------------------------------------------------ the smithy

export function smithy(out: HubOut): void {
  const L = new Layer(36, 236, 136, 110);
  const base = 330;
  // Back wall: rough stone.
  blocks(L, 48, 262, 104, 50, { bw: 9, bh: 6, seed: 3, base: 3.2, moss: LEAF });
  // The lean-to roof on its posts: shingles sloping toward us.
  const rx0 = 40;
  const rx1 = 164;
  const ry0 = 246;
  const ry1 = 276;
  scales(L, rx0, ry0, rx1, ry1, () => true, { w: 6, h: 5, ramp: ROOF, seed: 5, base: 4.4, moss: LEAF, rowShade: (y) => (y - ry0) / (ry1 - ry0) * 0.8 - 0.4 });
  timber(L, rx0 - 1, ry1, rx1 - rx0 + 2, 4, 6, TIMBER, 3.8);
  for (const px of [44, 156]) timber(L, px, ry1 + 4, 4, base - ry1 - 4, 7 + px);
  // The forge: a stone hearth with a lit top, a fire pit of coals, an arched mouth glowing.
  const fx0 = 52;
  const fx1 = 92;
  const ftop = 298;
  blocks(L, fx0, ftop + 5, fx1 - fx0, base - ftop - 5, { bw: 8, bh: 5, seed: 9, base: 2.8 });
  for (let x = fx0; x < fx1; x++) for (let y = ftop; y < ftop + 5; y++) L.px(x, y, rk(STONE, y === ftop ? 6 : 4.6 + (h2(x, y, 3) - 0.5)));
  // Coals in the pit on top.
  for (let x = fx0 + 4; x < fx1 - 4; x++) {
    for (let y = ftop + 1; y < ftop + 4; y++) {
      const hot = vnoise(x, y, 3, 2, 11);
      L.gl(x, y, rk(EMBER, 2 + hot * 4 - (y === ftop + 3 ? 1 : 0)));
    }
  }
  // The mouth: an arch of darker stone, the fire inside.
  const mx = (fx0 + fx1) / 2;
  for (let y = ftop + 10; y < base - 1; y++) {
    for (let x = mx - 9; x <= mx + 9; x++) {
      const dx = x + 0.5 - mx;
      const dy = Math.max(0, ftop + 16 - y);
      if (dx * dx + dy * dy * 1.6 > 81) continue;
      const inner = dx * dx + dy * dy * 1.6 < 49;
      if (!inner) {
        L.px(x, y, rk(STONE, 1.2));
        continue;
      }
      const t = (y - (ftop + 10)) / (base - ftop - 11);
      L.gl(x, y, rk(EMBER, 1.5 + t * 3 + (vnoise(x, y, 3, 3, 12) - 0.5) * 2));
    }
  }
  // The hood and chimney above the forge, up through the roof.
  for (let y = 232; y < ftop; y++) {
    const half = y > 280 ? 14 - (y - 280) * 0.0 : 6;
    const hw = y > 284 ? 16 : y > 278 ? 12 : 6;
    void half;
    for (let x = mx - hw; x < mx + hw; x++) {
      const t = (x - (mx - hw)) / (2 * hw);
      const row = Math.floor((y - 232) / 3);
      const joint = (x + (row % 2) * 2) % 5 === 0 || (y - 232) % 3 === 2;
      L.px(x, y, joint ? '#2a1612' : rk(['#3a1a14', '#5a2a1e', '#7a3a28', '#9a4e34', '#b8664a'], 3 - t * 2.2 + (t < 0.2 ? 0.8 : 0)));
    }
  }
  hline(L, mx - 8, mx + 7, 231, '#b8664a');
  // Bellows beside the forge.
  for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) {
    if (y < 2 && x > 7) continue;
    L.px(fx1 + 2 + x, base - 12 + y, y % 3 === 0 ? '#3a2014' : rk(['#3a2014', '#5e3820', '#84542e', '#a8703e'], 2.6 - x * 0.15 + (y < 3 ? 0.6 : 0)));
  }
  hline(L, fx1 + 2, fx1 + 11, base - 4, rk(PLANK, 4));
  // A rack of blades and hammers on the back wall.
  for (let i = 0; i < 4; i++) {
    const x = 104 + i * 8;
    vline(L, x, 270, 290, (y) => (y < 272 ? IRON[3] : i % 2 ? IRON[5] : IRON[4]));
    L.px(x + 1, 274, IRON[2]);
    hline(L, x - 1, x + 1, 290, rk(GOLD, 2));
    vline(L, x, 291, 295, rk(PLANK, 2));
  }
  hline(L, 100, 136, 269, rk(PLANK, 5));
  hline(L, 100, 136, 270, rk(PLANK, 2));
  // Horseshoes on the post.
  for (const [hx, hy] of [[150, 290], [150, 298]] as const) {
    for (const [dx, dy] of [[0, 0], [1, -1], [2, -1], [3, 0], [0, 1], [3, 1]] as const) L.px(hx + dx, hy + dy, IRON[5]);
  }
  // The sign: crossed hammers on a board hanging from the roof's edge.
  const sx = 150;
  const sy = ry1 + 6;
  hline(L, sx - 1, sx + 12, sy - 1, IRON[2]);
  for (let y = sy; y < sy + 10; y++) for (let x = sx; x < sx + 12; x++) L.px(x, y, rk(PLANK, y === sy ? 6 : x === sx ? 5 : x === sx + 11 || y === sy + 9 ? 2.2 : 4));
  for (let t = 0; t < 7; t++) {
    L.px(sx + 2 + t, sy + 2 + t, IRON[5]);
    L.px(sx + 9 - t, sy + 2 + t, IRON[4]);
  }
  hline(L, sx + 1, sx + 4, sy + 2, IRON[6]);
  hline(L, sx + 7, sx + 10, sy + 2, IRON[6]);
  L.outlineTinted(0.75);
  L.light(mx, ftop + 6, 96, '#ff7a2a', 0.95, 0.7);
  L.light(mx, base + 4, 70, '#ff8a3a', 0.6, 0.7);
  out.piece(L, 'smithy', base);
  out.shadows.push({ kind: 'band', x: 102, y: base, rx: 62, ry: 5, strength: 0.35 });

  // The anvil on its stump, in front (its own piece so the smith stands behind it).
  const A = new Layer(84, 318, 32, 26);
  const ax = 100;
  const ay = 340;
  for (let y = ay - 7; y <= ay; y++) {
    for (let x = ax - 5 - (y > ay - 2 ? 1 : 0); x <= ax + 5 + (y > ay - 2 ? 1 : 0); x++) {
      const t = (x - (ax - 6)) / 12;
      A.px(x, y, rk(['#1e140e', '#2e2016', '#45301e', '#5e4228', '#7a5834'], 3.6 - t * 2.6 - ((x + 1) % 3 === 0 ? 0.7 : 0)));
    }
  }
  oval(A, ax, ay - 8, 5.6, 2, (x, y, nx, ny) => rk(['#6a4a2a', '#8a6838', '#a8844c', '#c4a068'], 2.4 - ny - nx * 0.3));
  // The anvil: a waist, a flat face, a horn to the left.
  A.rect(ax - 3, ay - 12, 7, 3, (x, y) => rk(IRON, 3.4 - (x - ax) * 0.3 + (y === ay - 12 ? 0.6 : 0)));
  A.rect(ax - 6, ay - 16, 13, 4, (x, y) => rk(IRON, y === ay - 16 ? 6 : y === ay - 15 ? 4.6 : 3 - (x - ax) * 0.15));
  hline(A, ax - 10, ax - 7, ay - 15, IRON[4]);
  hline(A, ax - 9, ax - 7, ay - 14, IRON[2]);
  A.px(ax - 11, ay - 15, IRON[3]);
  // A glowing blade on the face.
  hline(A, ax - 4, ax + 3, ay - 17, '#ffb040');
  A.gl(ax - 4, ay - 17, '#ffe080');
  A.gl(ax - 3, ay - 17, '#ffd060');
  A.gl(ax - 2, ay - 17, '#ffb040');
  A.gl(ax - 1, ay - 17, '#ff8a20');
  A.halo(ax - 3, ay - 18, '#ff9a30', 0.4);
  A.halo(ax - 2, ay - 18, '#ff9a30', 0.3);
  A.outlineTinted(0.75);
  A.light(ax - 2, ay - 18, 26, '#ff9a3a', 0.6, 0.5);
  out.piece(A, 'anvil', ay);
  out.shadows.push({ kind: 'oval', x: ax + 3, y: ay + 1, rx: 8, ry: 2.5, strength: 0.45 });

  // The quench barrel.
  const Q = new Layer(128, 318, 16, 22);
  barrel(Q, 130, 340, 33);
  for (let x = 131; x < 138; x++) Q.px(x, 326, x < 133 ? '#4a8aa8' : '#2a5a7a');
  Q.outlineTinted(0.75);
  out.piece(Q, 'quench', 340);
  out.shadows.push({ kind: 'oval', x: 138, y: 341, rx: 6, ry: 2, strength: 0.4 });
  out.motes.push({ x: 100, y: 318, rx: 10, ry: 6, kind: 'spark', color: '#ffb040', count: 6 });
  out.motes.push({ x: 72, y: 292, rx: 8, ry: 10, kind: 'ember', color: '#ff8a3a', count: 5 });
}

// ------------------------------------------------------------------ the junk dealer

export function scrapStall(out: HubOut): void {
  const x0 = 360;
  const x1 = 432;
  const base = 330;
  const L = new Layer(x0 - 12, 262, x1 - x0 + 24, base - 262 + 4);
  // Back wall in shade, hooks of junk on it.
  for (let y = 290; y < base - 16; y++) {
    for (let x = x0 + 2; x < x1 - 2; x++) {
      const bx = (x - x0) % 6;
      let k = 1.4 + (vnoise(x * 4, y, 1.3, 8, 13) - 0.5) * 1.1;
      if (bx === 0) k = 0.5;
      else if (bx === 1) k += 0.7;
      L.px(x, y, rk(TIMBER, k));
    }
  }
  // Pots, pans and a shield hanging on the back wall.
  for (const [hx, kind] of [[x0 + 8, 'pan'], [x0 + 22, 'shield'], [x0 + 38, 'pan'], [x0 + 52, 'helm']] as const) junk(L, kind, hx, 300, hx);
  // The counter heaped with junk.
  const cy = base - 15;
  box(L, x0, cy, x1 - x0, 4, 11, PLANK, 21);
  for (let y = cy + 5; y < base - 1; y++) for (let x = x0 + 2; x < x1 - 2; x++) if ((x - x0) % 10 < 5) L.tint(x, y, '#2e9a4a', 0.55);
  let jx = x0 + 3;
  for (const k of ['gear', 'helm', 'sword', 'gear', 'pot', 'shield', 'gear', 'coin']) {
    jx += junk(L, k, jx, cy, jx * 3) + 1;
    if (jx > x1 - 8) break;
  }
  // Posts, the green-striped awning, its shade.
  for (const px of [x0 - 1, x1 - 3]) timber(L, px, 286, 4, base - 286 - 1, 30 + px);
  for (let y = 290; y < 300; y++) for (let x = x0 + 3; x < x1 - 3; x++) L.tone(x, y, -0.3);
  awning(L, x0 - 6, x1 + 4, 268, 285, GREEN, 43);
  // A brass scale hanging off the front post.
  const scx = x0 - 6;
  vline(L, scx, 292, 298, IRON[3]);
  hline(L, scx - 5, scx + 5, 298, rk(GOLD, 4));
  for (const side of [-1, 1]) {
    vline(L, scx + side * 5, 299, 302, IRON[2]);
    hline(L, scx + side * 5 - 2, scx + side * 5 + 2, 303, rk(GOLD, 5));
    hline(L, scx + side * 5 - 1, scx + side * 5 + 1, 304, rk(GOLD, 2.5));
  }
  // The sign on the awning's end: a coin and a broken sword.
  const sgx = x1 - 1;
  const sgy = 288;
  for (let y = sgy; y < sgy + 11; y++) for (let x = sgx; x < sgx + 11; x++) L.px(x, y, rk(PLANK, y === sgy ? 6 : x === sgx ? 5 : x === sgx + 10 || y === sgy + 10 ? 2 : 3.8));
  oval(L, sgx + 4, sgy + 6, 2.6, 2.6, (x, y, nx, ny) => rk(GOLD, 4.6 - ny * 1.5 - nx * 0.6));
  for (let t = 0; t < 5; t++) L.px(sgx + 6 + (t > 2 ? 1 : 0), sgy + 2 + t, IRON[6 - (t > 2 ? 1 : 0)]);
  // A lantern on a hook under the awning.
  lanternBox(L, x0 + 10, 288);
  L.outlineTinted(0.75);
  L.light(x0 + 10, 296, 70, '#ffb860', 0.85, 0.25);
  out.piece(L, 'scrapStall', base);
  out.shadows.push({ kind: 'band', x: (x0 + x1) / 2 + 4, y: base, rx: (x1 - x0) / 2 + 2, ry: 4, strength: 0.38 });

  // Scrap bins in front: open crates spilling over with metal.
  scrapBin(out, 322, 342, 1);
  scrapBin(out, 344, 352, 2);
}

function scrapBin(out: HubOut, x: number, y: number, seed: number): void {
  const L = new Layer(x - 12, y - 26, 25, 28);
  // Junk piled above the rim first (it's behind the crate's front).
  let jx = x - 9;
  for (const k of ['sword', 'helm', 'gear', 'shield', 'pot', 'sword', 'gear']) {
    jx += junk(L, k, jx, y - 11 - Math.floor(h2(jx, seed, 3) * 3), jx * 7 + seed) - 1;
    if (jx > x + 8) break;
  }
  box(L, x - 10, y - 12, 20, 3, 9, PLANK, 50 + seed);
  // A slat gap or two on the front.
  hline(L, x - 9, x + 8, y - 5, rk(PLANK, 1));
  L.outlineTinted(0.75);
  out.piece(L, `bin${seed}`, y);
  out.shadows.push({ kind: 'oval', x: x + 3, y: y + 1, rx: 11, ry: 2.5, strength: 0.45 });
}

/** A piece of junk standing on `sy`; returns its width. */
function junk(L: Layer, kind: string, x: number, sy: number, seed: number): number {
  const steel = IRON;
  switch (kind) {
    case 'gear': {
      const r = 2.5 + h2(seed, 1, 1) * 1.5;
      oval(L, x + r, sy - r - 0.5, r + 0.8, r + 0.8, (px, py, nx, ny) => {
        const a = Math.atan2(ny, nx);
        const d = Math.hypot(nx, ny);
        if (d > 0.82 && Math.cos(a * 8) < 0.2) return null;
        if (d < 0.35) return '#1a1418';
        return rk(h2(seed, 2, 2) < 0.5 ? GOLD : steel, 4 - ny * 1.6 - nx * 0.5);
      });
      return Math.ceil(r * 2 + 1);
    }
    case 'helm': {
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 6; xx++) {
        if (yy === 0 && (xx === 0 || xx === 5)) continue;
        L.px(x + xx, sy - 5 + yy, rk(steel, xx === 0 || yy === 0 ? 6 : xx === 5 ? 2.5 : 4.4));
      }
      hline(L, x + 1, x + 4, sy - 3, '#140c10');
      L.px(x + 3, sy - 4, '#a83a2a');
      return 6;
    }
    case 'sword': {
      const lean = h2(seed, 3, 3) < 0.5 ? 1 : -1;
      for (let t = 0; t < 9; t++) L.px(x + 2 + Math.round(t * 0.3 * lean), sy - 1 - t, t < 2 ? rk(PLANK, 2) : t === 2 ? rk(GOLD, 4) : rk(steel, t > 7 ? 3 : 5.5));
      L.px(x + 1, sy - 3, rk(GOLD, 3));
      L.px(x + 3, sy - 3, rk(GOLD, 3));
      return 4;
    }
    case 'shield': {
      const c = h2(seed, 4, 4) < 0.5 ? ['#3a1414', '#7a2020', '#b83a2a'] : ['#141e3a', '#203a7a', '#2a5ab8'];
      for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 6; xx++) {
        if (yy >= 5 && (xx === 0 || xx === 5)) continue;
        if (yy === 6 && (xx === 1 || xx === 4)) continue;
        L.px(x + xx, sy - 7 + yy, xx === 0 || xx === 5 || yy === 0 ? rk(steel, 5) : c[xx < 3 ? 2 : 1]);
      }
      L.px(x + 2, sy - 4, rk(GOLD, 5));
      return 6;
    }
    case 'pot': {
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 5; xx++) L.px(x + xx, sy - 4 + yy, yy === 0 ? '#1a1418' : rk(['#3a2418', '#6a4028', '#9a6038', '#c08048'], 2.6 - xx * 0.4));
      L.px(x + 5, sy - 3, '#3a2418');
      return 6;
    }
    case 'pan': {
      oval(L, x + 3, sy + 3, 3.2, 3.2, (px, py, nx, ny) => (Math.hypot(nx, ny) < 0.6 ? '#2a2630' : rk(steel, 4 - ny * 1.4)));
      vline(L, x + 3, sy - 5, sy - 1, rk(PLANK, 3));
      return 7;
    }
    case 'coin': {
      for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 4; xx++) L.px(x + xx, sy - 1 - yy, rk(GOLD, yy % 2 ? 3 : 5.5 - xx * 0.5));
      return 4;
    }
  }
  return 4;
}

// ------------------------------------------------------------------ the sage's bench and the sigil stones

export function sageCorner(out: HubOut): void {
  // A rug on the paving under the bench (part of the ground's look, so it's a flat piece sorted first).
  const R = new Layer(66, 448, 60, 22);
  for (let y = 450; y < 468; y++) {
    for (let x = 68; x < 124; x++) {
      const ix = x - 68;
      const iy = y - 450;
      const border = ix < 2 || iy < 2 || ix > 53 || iy > 15;
      const mid = Math.abs(ix - 28) * 0.45 + Math.abs(iy - 8.5) < 5;
      const k = border ? (iy === 0 || ix === 0 ? 3 : 1.6) : mid ? 3.4 : (ix + iy) % 4 === 0 ? 1.8 : 1.1;
      R.px(x, y, rk(['#0e1438', '#1a2458', '#2a3a7a', '#c8a048', '#f0d070'], k));
    }
  }
  out.piece(R, 'sageRug', 300);

  // The bench: a lit seat, legs, a back with a carved sigil.
  const B = new Layer(70, 424, 54, 32);
  const bx0 = 76;
  const bx1 = 116;
  const by = 452;
  for (let x = bx0; x <= bx1; x++) for (let y = by - 26; y < by - 14; y++) B.px(x, y, rk(PLANK, y === by - 26 ? 6.4 : y < by - 23 ? 4.8 : 3.4 + (h2(x, y, 4) - 0.5) * 0.6));
  hline(B, bx0, bx1, by - 22, rk(PLANK, 2));
  hline(B, bx0, bx1, by - 18, rk(PLANK, 2));
  for (const px of [bx0, bx1 - 2]) timber(B, px, by - 28, 3, 28, 8 + px, PLANK, 3.6);
  box(B, bx0 - 2, by - 10, bx1 - bx0 + 5, 3, 3, PLANK, 31);
  for (const px of [bx0, bx0 + 1, bx1 - 1, bx1]) vline(B, px, by - 4, by, rk(PLANK, px < 96 ? 4 : 2));
  // The carved sigil on the back rest, faintly lit.
  for (const [dx, dy] of [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2], [0, 0]] as const) {
    B.px(96 + dx, by - 20 + dy, SIGIL);
    B.halo(96 + dx, by - 20 + dy, SIGIL, 0.6);
  }
  B.outlineTinted(0.75);
  out.piece(B, 'sageBench', by - 2);
  out.shadows.push({ kind: 'oval', x: 100, y: by + 1, rx: 24, ry: 3, strength: 0.4 });

  // Standing stones with glowing runes round the bench.
  sigilStone(out, 56, 444, 1, 22);
  sigilStone(out, 138, 438, 2, 18);
  sigilStone(out, 148, 474, 3, 14);
  // A little brazier of blue-green flame.
  const F = new Layer(46, 462, 18, 22);
  const fx = 54;
  const fy = 482;
  oval(F, fx, fy - 9, 5, 2.2, (x, y, nx, ny) => rk(IRON, 4 - ny * 1.6));
  for (const [x0, x1] of [[fx - 3, fx - 4], [fx + 3, fx + 4], [fx, fx]] as const) {
    for (let t = 0; t < 7; t++) F.px(Math.round(x0 + (x1 - x0) * (t / 6)), fy - 7 + t, IRON[2]);
  }
  for (const [dx, dy, c] of [[0, -11, '#e0fff8'], [-1, -11, '#7af0e0'], [1, -11, '#7af0e0'], [0, -12, '#b8fff0'], [-1, -12, '#4ad0c0'], [1, -13, '#4ad0c0'], [0, -14, '#7af0e0'], [-2, -10, '#2aa8a0'], [2, -10, '#2aa8a0']] as const) F.gl(fx + dx, fy + dy, c);
  F.outlineTinted(0.75);
  F.light(fx, fy - 12, 64, '#6af0d8', 0.75, 0.4);
  out.piece(F, 'sageBrazier', fy);
  out.motes.push({ x: 96, y: 440, rx: 40, ry: 18, kind: 'mote', color: '#8af8e8', count: 8 });
}

function sigilStone(out: HubOut, x: number, y: number, seed: number, hgt: number): void {
  const w = Math.round(hgt * 0.5);
  const L = new Layer(x - w, y - hgt - 4, w * 2 + 2, hgt + 7);
  // A rough standing stone: a lit top and left face, moss at the foot, a slight lean.
  for (let yy = y - hgt; yy <= y; yy++) {
    const t = (yy - (y - hgt)) / hgt;
    const half = Math.round(w * (0.55 + 0.45 * Math.sqrt(Math.min(1, t * 3))) * (1 - (t > 0.85 ? (t - 0.85) * 0.6 : 0)));
    const lean = Math.round((1 - t) * (seed % 2 ? 1.5 : -1.5));
    for (let xx = x - half + lean; xx <= x + half + lean; xx++) {
      const u = (xx - (x - half + lean)) / (2 * half);
      let k = 4.4 - u * 2.6 + (yy < y - hgt + 2 ? 1.2 : 0) + (vnoise(xx, yy, 3, 4, seed) - 0.5) * 1.1;
      if (t > 0.8 && h2(xx, yy, seed) < 0.5) {
        L.px(xx, yy, rk(LEAF, 2 + h2(xx, yy, seed + 1) * 2));
        continue;
      }
      if (h2(xx, yy, seed + 2) < 0.04) k -= 1.2;
      L.px(xx, yy, rk(STONE, k));
    }
  }
  // Runes: a vertical line of glyphs glowing teal.
  const glyphs = [['.#.', '###', '.#.'], ['#.#', '.#.', '#.#'], ['##.', '#..', '.##'], ['.#.', '#.#', '###']];
  for (let i = 0; i < Math.floor(hgt / 6); i++) {
    const g = glyphs[(i + seed) % glyphs.length];
    g.forEach((r, gy) => [...r].forEach((ch, gx) => {
      if (ch !== '#') return;
      const px = x - 1 + gx + Math.round((1 - (i * 5 + 4) / hgt) * (seed % 2 ? 1.5 : -1.5));
      const py = y - hgt + 3 + i * 5 + gy;
      L.gl(px, py, gy === 0 ? '#c8fff4' : SIGIL);
    }));
  }
  for (let i = 0; i < hgt; i++) L.halo(x, y - hgt + 3 + i, SIGIL, 0.22);
  L.outlineTinted(0.75);
  L.light(x, y - hgt / 2, 40, '#5ae8d0', 0.5, 0.15);
  out.piece(L, `sigil${seed}`, y);
  out.shadows.push({ kind: 'oval', x: x + 3, y: y + 1, rx: w + 2, ry: 2.5, strength: 0.45 });
}

// ------------------------------------------------------------------ the rebirth shrine

export function shrine(out: HubOut): void {
  const cx = 398;
  const base = 456;
  const L = new Layer(cx - 34, base - 80, 70, 84);
  // Two stone steps.
  blocks(L, cx - 26, base - 8, 52, 8, { bw: 9, bh: 4, seed: 61, base: 3.6 });
  for (let x = cx - 26; x < cx + 26; x++) L.px(x, base - 8, rk(STONE, 6));
  blocks(L, cx - 22, base - 14, 44, 6, { bw: 8, bh: 3, seed: 62, base: 4 });
  for (let x = cx - 22; x < cx + 22; x++) L.px(x, base - 14, rk(STONE, 6));
  // The back wall, then the emblem: a rose-gold rising sun with rays (it glows).
  blocks(L, cx - 18, base - 52, 36, 38, { bw: 7, bh: 5, seed: 63, base: 2.6 });
  const ex = cx;
  const ey = base - 34;
  for (let i = 0; i < 12; i++) {
    const a = Math.PI + (i / 11) * Math.PI;
    for (let t = 8; t < 14; t++) {
      const x = Math.round(ex + Math.cos(a) * t);
      const y = Math.round(ey + Math.sin(a) * t * 0.95);
      if (i % 2 === 0 || t < 12) L.gl(x, y, rk(ROSE, 4.5 - (t - 8) * 0.4));
    }
  }
  oval(L, ex, ey, 7, 7, (x, y, nx, ny) => {
    if (ny > 0.15) return null;
    L.gl(x, y, rk(ROSE, 5 - Math.hypot(nx, ny) * 2.4));
    return null;
  });
  hline(L, ex - 12, ex + 12, ey + 1, rk(GOLD, 4));
  hline(L, ex - 10, ex + 10, ey + 2, rk(GOLD, 2.5));
  // A phoenix feather motif under the sun.
  for (let t = 0; t < 7; t++) {
    L.gl(ex - 3 + Math.round(t * 0.3), ey + 4 + t, rk(ROSE, 3.5 - t * 0.2));
    L.gl(ex + 3 - Math.round(t * 0.3), ey + 4 + t, rk(ROSE, 3.5 - t * 0.2));
  }
  L.gl(ex, ey + 6, '#fff4e8');
  // Pillars either side.
  for (const px of [cx - 22, cx + 17]) {
    for (let y = base - 58; y < base - 14; y++) for (let x = px; x < px + 5; x++) L.px(x, y, rk(STONE, x === px ? 6 : x === px + 4 ? 2.4 : 4.4 + (y % 7 === 0 ? -1 : 0)));
    L.rect(px - 1, base - 60, 7, 3, (x, y) => rk(STONE, y === base - 60 ? 6.4 : 4));
    L.rect(px - 1, base - 16, 7, 2, (x, y) => rk(STONE, y === base - 16 ? 6 : 3.4));
  }
  // The roof: a small gable of shingles.
  const ay = base - 80;
  const inRoof = (x: number, y: number) => {
    const d = Math.abs(x + 0.5 - cx);
    return y >= ay + d * 0.62 && y <= base - 57;
  };
  scales(L, cx - 32, ay, cx + 32, base - 57, inRoof, { w: 5, h: 4, ramp: ROOF, seed: 64, base: 5, moss: LEAF });
  for (let x = cx - 32; x <= cx + 32; x++) {
    const y = Math.round(ay + Math.abs(x + 0.5 - cx) * 0.62);
    if (y > base - 57) continue;
    L.px(x, y, rk(TIMBER, 5.5));
    L.px(x, y + 1, rk(TIMBER, 3));
  }
  hline(L, cx - 32, cx + 32, base - 57, rk(TIMBER, 2));
  L.px(cx, ay - 1, rk(GOLD, 6));
  L.px(cx, ay - 2, rk(GOLD, 4));
  // Candles on the steps and flowers laid in offering.
  for (const [dx, dy, t] of [[-17, -14, 4], [-12, -14, 3], [12, -14, 4], [16, -14, 2], [-21, -8, 3], [20, -8, 4]] as const) candle(L, cx + dx, base + dy, t);
  for (const [dx, c] of [[-6, '#ff8ab0'], [-4, '#fff0f4'], [4, '#ffd0a0'], [6, '#ff8ab0']] as const) {
    L.px(cx + dx, base - 15, c);
    L.px(cx + dx, base - 14, rk(LEAF, 4));
  }
  L.outlineTinted(0.75);
  L.light(ex, ey, 74, '#ffa890', 0.85, 0.15);
  L.light(cx, base - 8, 46, '#ffb070', 0.6, 0.5);
  out.piece(L, 'shrine', base);
  out.shadows.push({ kind: 'band', x: cx + 4, y: base, rx: 28, ry: 4, strength: 0.4 });
  out.motes.push({ x: ex, y: ey, rx: 20, ry: 14, kind: 'mote', color: '#ffc0a8', count: 6 });
}

// ------------------------------------------------------------------ the notice board

export function noticeBoard(out: HubOut, x: number, y: number): void {
  const L = new Layer(x - 20, y - 46, 41, 48);
  for (const px of [x - 15, x + 12]) timber(L, px, y - 40, 3, 40, 70 + px);
  // A little shingled roof.
  const inRoof = (xx: number, yy: number) => yy >= y - 46 + Math.abs(xx + 0.5 - x) * 0.35 && yy < y - 37;
  scales(L, x - 20, y - 46, x + 20, y - 38, inRoof, { w: 5, h: 4, ramp: ROOF, seed: 71, base: 5 });
  hline(L, x - 20, x + 20, y - 37, rk(TIMBER, 3));
  // The board.
  for (let yy = y - 34; yy < y - 12; yy++) for (let xx = x - 15; xx <= x + 14; xx++) L.px(xx, yy, rk(PLANK, yy === y - 34 ? 6 : xx === x - 15 ? 5 : xx === x + 14 || yy === y - 13 ? 2.4 : 4 + ((yy - (y - 34)) % 5 === 0 ? -0.8 : 0) + (h2(xx, yy, 5) - 0.5) * 0.5));
  // Papers pinned up, a little askew, with red pins; one has a wanted face, one a chicken.
  const papers: Array<[number, number, number, number]> = [[x - 13, y - 32, 8, 9], [x - 3, y - 33, 7, 8], [x + 5, y - 31, 8, 10], [x - 11, y - 22, 7, 8], [x + 1, y - 23, 9, 9]];
  papers.forEach(([px, py, w, hh], i) => {
    for (let yy = py; yy < py + hh; yy++) for (let xx = px; xx < px + w; xx++) L.px(xx, yy, yy === py ? '#fffaf0' : i % 2 ? '#f0e6cc' : '#e8dcc0');
    for (let r = 0; r < 3; r++) for (let xx = px + 1; xx < px + w - 1; xx++) if (h2(xx, r + i * 7, 9) < 0.7 && r * 2 + py + 3 < py + hh - 1) L.px(xx, py + 3 + r * 2, '#8a7a64');
    L.px(px + Math.floor(w / 2), py, '#e8302a');
    L.px(px + Math.floor(w / 2), py - 1, '#a81a1a');
  });
  // The chicken.
  for (const [dx, dy, c] of [[2, 3, '#ffffff'], [3, 3, '#ffffff'], [3, 2, '#e8302a'], [4, 4, '#ffb030'], [2, 4, '#ffffff'], [3, 4, '#ffffff']] as const) L.px(x - 11 + dx, y - 22 + dy, c);
  // A gold "!" on top for the job board.
  L.rect(x - 1, y - 45, 3, 4, '#ffd84a');
  L.rect(x - 1, y - 40, 3, 1, '#ffd84a');
  L.outlineTinted(0.75);
  out.piece(L, 'board', y);
  out.shadows.push({ kind: 'oval', x: x + 3, y: y + 1, rx: 17, ry: 2.5, strength: 0.42 });
}

// ------------------------------------------------------------------ the gate down to the dungeon

export function gate(out: HubOut): void {
  const x0 = 192;
  const x1 = 288;
  const base = 556;
  // Two posts on the stringers, a beam across, a sign hanging from it; lanterns atop the posts.
  for (const [px, id] of [[x0, 'gatePostL'], [x1, 'gatePostR']] as const) {
    const L = new Layer(px - 8, base - 70, 17, 74);
    blocks(L, px - 5, base - 12, 11, 12, { bw: 6, bh: 4, seed: px, base: 3.6 });
    for (let x = px - 5; x < px + 6; x++) L.px(x, base - 12, rk(STONE, 6));
    timber(L, px - 3, base - 58, 7, 46, 80 + px);
    // A lantern on top of the post.
    lanternBox(L, px, base - 68);
    L.outlineTinted(0.75);
    L.light(px, base - 60, 72, '#ffb860', 0.85, 0.3);
    out.piece(L, id, base);
    out.shadows.push({ kind: 'oval', x: px + 4, y: base + 1, rx: 7, ry: 2.5, strength: 0.45 });
  }
  // The beam and the sign: drawn with the posts' sort line so it sits over whoever walks under.
  const B = new Layer(x0 - 10, base - 66, x1 - x0 + 21, 30);
  timber(B, x0 - 8, base - 58, x1 - x0 + 17, 5, 91);
  for (const ex of [x0 - 9, x1 + 8]) B.rect(ex, base - 59, 2, 7, (x, y) => rk(TIMBER, y === base - 59 ? 5 : 3));
  const name = renderText('DUNGEON', { face: 'small', fill: ['#d8c8ff', '#b8a0ff', '#9a7aff', '#8a6af0', '#7a5ae0'], ink: null });
  const sx = 240 - Math.floor(name.w / 2) - 4;
  const sy = base - 50;
  for (const hx of [sx + 3, sx + name.w + 4]) vline(B, hx, base - 53, sy - 1, IRON[3]);
  for (let y = sy; y < sy + name.h + 4; y++) for (let x = sx; x < sx + name.w + 8; x++) B.px(x, y, rk(PLANK, y === sy ? 6 : x === sx ? 4.6 : y === sy + name.h + 3 || x === sx + name.w + 7 ? 1.6 : 3));
  for (let y = 0; y < name.h; y++) for (let x = 0; x < name.w; x++) {
    const i = (y * name.w + x) * 4;
    if (!name.px[i + 3]) continue;
    const f = (v: number) => v.toString(16).padStart(2, '0');
    B.gl(sx + 4 + x, sy + 2 + y, `#${f(name.px[i])}${f(name.px[i + 1])}${f(name.px[i + 2])}`);
  }
  B.outlineTinted(0.75);
  out.piece(B, 'gateBeam', base + 1);
  // The portal's glow rising from the bottom steps: a violet haze over the last treads, runes.
  const P = new Layer(196, 596, 88, 44);
  for (let y = 600; y < 640; y++) {
    for (let x = 200; x < 280; x++) {
      const t = (y - 600) / 40;
      const edge = Math.min(x - 200, 279 - x) / 40;
      const a = Math.max(0, t * t * 0.75 * Math.min(1, edge * 3) + (vnoise(x, y, 7, 4, 3) - 0.5) * 0.2 * t);
      if (a > 0.04) P.halo(x, y, t > 0.7 ? '#d8b8ff' : '#9a6aff', a);
    }
  }
  for (const [rx, ry] of [[214, 626], [240, 630], [266, 626], [226, 614], [254, 614]] as const) {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]] as const) P.gl(rx + dx, ry + dy, dx || dy ? '#b890ff' : '#f0e0ff');
  }
  out.glowOf(P, 'portal', 640);
  out.lights.push({ x: 240, y: 646, r: 110, color: '#8a5aff', intensity: 0.95, flicker: 0.15 });
  out.lights.push({ x: 240, y: 610, r: 50, color: '#b890ff', intensity: 0.6 });
  out.motes.push({ x: 240, y: 616, rx: 36, ry: 18, kind: 'mote', color: '#c8a8ff', count: 10 });
}

// ------------------------------------------------------------------ lamp posts and string lights

/** A lamp post: a stone foot, a slim iron post, a lantern on top. Returns the lantern's top. */
export function lampPost(out: HubOut, x: number, y: number, id: string, h = 34): [number, number] {
  const L = new Layer(x - 7, y - h - 12, 15, h + 15);
  L.rect(x - 3, y - 4, 7, 4, (xx, yy) => rk(STONE, yy === y - 4 ? 6 : xx === x - 3 ? 5 : 3.4));
  for (let yy = y - h; yy < y - 4; yy++) {
    L.px(x, yy, IRON[3]);
    L.px(x + 1, yy, IRON[1]);
  }
  hline(L, x - 1, x + 2, y - 12, IRON[4]);
  // A little scroll bracket and the lantern.
  L.px(x - 1, y - h + 2, IRON[3]);
  L.px(x + 2, y - h + 2, IRON[2]);
  lanternBox(L, x, y - h - 9);
  L.outlineTinted(0.75);
  L.light(x, y - h - 2, 84, '#ffb860', 0.9, 0.2);
  L.light(x, y + 2, 46, '#ffa850', 0.5, 0.2);
  out.piece(L, id, y);
  out.shadows.push({ kind: 'oval', x: x + 3, y: y + 1, rx: 5, ry: 2, strength: 0.45 });
  return [x, y - h - 8];
}

/**
 * Warm string lights swagged from one point to another (lamp tops, eaves): a dark wire, round warm
 * bulbs every few pixels with a soft glow. Sorted at `sort` (the posts' feet).
 */
export function lightString(out: HubOut, a: [number, number], b: [number, number], sag: number, sort: number, id: string, warm = true): void {
  const x0 = Math.min(a[0], b[0]) - 3;
  const y0 = Math.min(a[1], b[1]) - 3;
  const L = new Layer(x0, y0, Math.abs(b[0] - a[0]) + 7, Math.abs(b[1] - a[1]) + sag + 10);
  const pts = sagCurve(a[0], a[1], b[0], b[1], sag);
  const wire: Array<[number, number]> = pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
  for (const [x, y] of wire) L.px(x, y, '#241a18');
  const cols = warm ? ['#ffd070', '#ffb850', '#fff0b0', '#ffc860'] : ['#ff5a4a', '#ffd04a', '#5aff7a', '#5ab8ff', '#ff7ad8'];
  wire.forEach(([x, y], i) => {
    if (i % 5 !== 2 || i < 3 || i > wire.length - 4) return;
    const c = cols[Math.floor(h2(x, y, 3) * cols.length)];
    L.px(x, y + 1, '#3a2a20');
    L.gl(x, y + 2, c);
    L.gl(x + 1, y + 2, c);
    L.gl(x, y + 3, '#fff6d8');
    L.gl(x + 1, y + 3, c);
    for (const [dx, dy, al] of [[-1, 2, 0.4], [2, 2, 0.4], [-1, 3, 0.4], [2, 3, 0.4], [0, 4, 0.45], [1, 4, 0.45], [0, 1, 0.25], [1, 1, 0.25], [-2, 3, 0.15], [3, 3, 0.15], [0, 5, 0.2], [1, 5, 0.2]] as const) L.halo(x + dx, y + dy, c, al);
    if (i % 10 === 2) L.light(x, y + 3, 22, c, 0.4);
  });
  out.piece(L, id, sort);
}

/** Small stuff dotted about: a planter, crates, a cat. */
export function crateStack(out: HubOut, x: number, y: number, id: string): void {
  const L = new Layer(x - 10, y - 24, 22, 26);
  box(L, x - 9, y - 11, 12, 3, 8, PLANK, 11);
  box(L, x + 1, y - 9, 9, 2, 7, PLANK, 12);
  box(L, x - 6, y - 21, 10, 3, 7, PLANK, 13);
  pot(L, x + 2, y - 16, 5, 4, TERRA);
  L.px(x + 4, y - 18, rk(LEAF, 6));
  L.px(x + 3, y - 19, rk(LEAF, 7));
  L.px(x + 5, y - 19, rk(LEAF, 5));
  L.outlineTinted(0.75);
  out.piece(L, id, y);
  out.shadows.push({ kind: 'oval', x: x + 3, y: y + 1, rx: 11, ry: 2.5, strength: 0.42 });
}

/** A black cat curled up asleep (on a step, a sill). */
export function cat(out: HubOut, x: number, y: number): void {
  const L = new Layer(x - 6, y - 7, 13, 8);
  oval(L, x, y - 2.5, 4.6, 2.6, (xx, yy, nx, ny) => rk(['#0e0c12', '#1c1824', '#2c2636', '#3e364a'], 1.6 - ny * 1.2 - nx * 0.4));
  L.px(x - 4, y - 5, '#1c1824');
  L.px(x - 3, y - 6, '#2c2636');
  L.px(x - 5, y - 6, '#1c1824');
  hline(L, x + 2, x + 6, y - 1, '#1c1824');
  L.px(x - 3, y - 4, '#f0c040');
  L.outlineTinted(0.6);
  out.piece(L, 'cat', y);
}

void CANVAS;
void planks;
void poly;
void sphere;
void IRON;
