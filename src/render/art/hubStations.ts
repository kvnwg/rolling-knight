/**
 * The keepers' places round the court, drawn small to suit them: the priestess's candle shrine (a
 * little stone niche round a rose-gold rising sun, candles on its ledge, offerings), the smith's nook
 * (a brazier of glowing coals on iron legs, the anvil on its stump, a rack of hammers and tongs, a
 * quench bucket), the sage's sigil stones glowing teal, and the head of the steps down to the dungeon
 * (two stone posts with lanterns, a lantern left on a step, the violet glow rising from the bottom).
 */
import { candle, lanternBox } from './hubStalls';
import { blocks, GOLD, h2, hline, IRON, Layer, LEAF, oval, PLANK, rk, rkd, scales, STONE, timber, TIMBER, vline, vnoise, type Ramp } from './hubKit';
import { SLATE } from './hubShop';
import type { HubOut } from './hubScene';

const EMBER: Ramp = ['#5a0e04', '#9a2208', '#d8460c', '#ff7a1a', '#ffb040', '#ffe080', '#fff8d0'];
const SIGIL = '#7af0e0';
const ROSE: Ramp = ['#6a2a3a', '#a84a5a', '#e07a7a', '#ffb0a0', '#ffd8c0', '#fff4e8'];

// ------------------------------------------------------------------ the candle shrine (rebirth)

/**
 * A little roadside shrine: a stone base and a niche under a tiny slate roof, a rose-gold rising sun
 * glowing inside it, candles crowding its ledge and the ground at its foot, flowers laid in offering.
 * (x, y): the middle of its foot.
 */
export function shrine(out: HubOut, x: number, y: number): void {
  const L = new Layer(x - 13, y - 34, 27, 37);
  // The base: two courses of dressed stone, a lit ledge on top.
  blocks(L, x - 10, y - 9, 20, 9, { bw: 7, bh: 3, seed: 61, base: 3.6 });
  for (let xx = x - 11; xx <= x + 10; xx++) {
    L.px(xx, y - 10, rk(STONE, 6.2));
    L.px(xx, y - 11, rk(STONE, 5));
  }
  // The niche: stone sides, an arched hollow lit from inside.
  const nx0 = x - 8;
  const nx1 = x + 8;
  const ny0 = y - 28;
  const ny1 = y - 11;
  for (let yy = ny0; yy < ny1; yy++) {
    for (let xx = nx0; xx < nx1; xx++) {
      const ix = xx - nx0;
      const side = ix < 3 || ix >= nx1 - nx0 - 3;
      const archTop = ny0 + 3 + Math.round(Math.pow(Math.abs(xx + 0.5 - x) / 5, 2) * 3);
      if (side || yy < archTop) {
        L.px(xx, yy, rkd(STONE, 4 + (ix === 0 ? 1.6 : ix === nx1 - nx0 - 1 ? -1.4 : 0) + (vnoise(xx, yy, 3, 3, 62) - 0.5) * 0.9 + ((yy - ny0) % 5 === 4 ? -1 : 0), xx, yy));
        continue;
      }
      // Inside: warm rose light, brightest at the emblem.
      const d = Math.hypot(xx + 0.5 - x, (yy + 0.5 - (y - 18)) * 1.2);
      L.gl(xx, yy, rk(ROSE, 3.2 - d * 0.32 + (vnoise(xx, yy, 3, 3, 63) - 0.5) * 0.5));
    }
  }
  // The emblem: a rising sun (a half disc and rays) over a gold line.
  const ex = x;
  const ey = y - 16;
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    for (let t = 3.5; t < 5.5; t += 0.5) L.gl(Math.round(ex + Math.cos(a) * t - 0.5), Math.round(ey + Math.sin(a) * t), rk(ROSE, 5 - (t - 3.5) * 0.6));
  }
  oval(L, ex, ey + 0.5, 2.6, 2.6, (xx, yy, _nx, ny) => {
    if (ny > 0.1) return null;
    L.gl(xx, yy, ny < -0.5 ? '#fff4e8' : '#ffd8c0');
    return null;
  });
  hline(L, ex - 5, ex + 4, ey + 1, rk(GOLD, 5));
  L.unglow(ex - 5, ey + 1);
  for (let xx = ex - 5; xx <= ex + 4; xx++) L.gl(xx, ey + 1, rk(GOLD, 6));
  // A tiny slate roof over the niche, a gold knob on its peak.
  const ry0 = ny0 - 5;
  const inRoof = (xx: number, yy: number) => yy >= ry0 + Math.abs(xx + 0.5 - x) * 0.5 && yy <= ny0 + 1;
  scales(L, x - 12, ry0, x + 12, ny0 + 1, inRoof, { w: 4, h: 3, ramp: SLATE, seed: 64, base: 4.4, moss: LEAF });
  for (let xx = x - 12; xx <= x + 12; xx++) {
    const yy = Math.round(ry0 + Math.abs(xx + 0.5 - x) * 0.5);
    if (yy > ny0 + 1) continue;
    L.px(xx, yy, rk(TIMBER, 5.4));
  }
  hline(L, x - 12, x + 11, ny0 + 2, rk(TIMBER, 2));
  L.px(x, ry0 - 1, rk(GOLD, 6));
  L.px(x - 1, ry0, rk(GOLD, 3));
  // Candles on the ledge and at the foot, flowers laid between them.
  for (const [dx, dy, t] of [[-8, -11, 3], [-5, -11, 2], [5, -11, 3], [8, -11, 2], [-11, 1, 2], [11, 1, 3], [-9, 2, 1]] as const) candle(L, x + dx, y + dy, t);
  for (const [dx, c] of [[-2, '#ff8ab0'], [-1, '#fff0f4'], [1, '#ffd0a0'], [2, '#ff8ab0']] as const) {
    L.px(x + dx, y - 12, c);
    L.px(x + dx, y - 11, rk(LEAF, 4));
  }
  L.outlineTinted(0.72);
  L.light(ex, ey, 40, '#ff9a88', 0.5, 0.12);
  L.light(x, y - 8, 26, '#ffa860', 0.4, 0.5);
  out.piece(L, 'shrine', y, { x0: x - 11, y0: y - 9, x1: x + 11, y1: y });
  out.shadows.push({ kind: 'oval', x: x + 1, y: y + 1, rx: 12, ry: 2.5, strength: 0.42 });
  out.motes.push({ x: ex, y: ey, rx: 10, ry: 8, kind: 'mote', color: '#ffc0a8', count: 4 });
}

// ------------------------------------------------------------------ the smith's nook

/**
 * The smith's nook: a brazier of coals on three iron legs (the coals glowing, sparks rising), the
 * anvil on its stump in front, a rack of hammers and tongs on a post, a quench bucket; a little sign
 * of crossed hammers. (bx, by): the brazier's foot; (ax, ay): the anvil's.
 */
export function smithNook(out: HubOut, bx: number, by: number, ax: number, ay: number): void {
  // The tool rack: a post with a crossbar, hammers and tongs hanging, the crossed-hammers sign on top.
  const R = new Layer(bx + 4, by - 36, 16, 38);
  const rx = bx + 12;
  timber(R, rx, by - 30, 3, 30, 66, TIMBER, 4);
  hline(R, rx - 7, rx + 3, by - 26, rk(PLANK, 5));
  hline(R, rx - 7, rx + 3, by - 25, rk(PLANK, 2.4));
  for (const [dx, kind] of [[-6, 'hammer'], [-3, 'tongs'], [1, 'hammer']] as const) {
    const tx = rx + dx;
    if (kind === 'hammer') {
      vline(R, tx, by - 24, by - 17, (y) => rk(PLANK, y < by - 22 ? 4 : 2.6));
      hline(R, tx - 1, tx + 1, by - 17, IRON[5]);
      hline(R, tx - 1, tx + 1, by - 16, IRON[3]);
    } else {
      for (let t = 0; t < 8; t++) {
        R.px(tx - (t > 5 ? 1 : 0), by - 24 + t, IRON[4]);
        R.px(tx + 1 + (t > 5 ? 1 : 0), by - 24 + t, IRON[2]);
      }
    }
  }
  // The sign: a little board with two crossed hammers.
  const sx = rx - 4;
  const sy = by - 36;
  for (let y = sy; y < sy + 8; y++) for (let x = sx; x < sx + 10; x++) R.px(x, y, rk(PLANK, y === sy ? 6 : x === sx ? 5 : x === sx + 9 || y === sy + 7 ? 2 : 3.8));
  for (let t = 0; t < 5; t++) {
    R.px(sx + 2 + t, sy + 2 + t * 0.8, IRON[5]);
    R.px(sx + 7 - t, sy + 2 + t * 0.8, IRON[4]);
  }
  hline(R, sx + 1, sx + 3, sy + 2, IRON[6]);
  hline(R, sx + 6, sx + 8, sy + 2, IRON[6]);
  R.outlineTinted(0.72);
  out.piece(R, 'smithRack', by - 4, { x0: rx - 1, y0: by - 8, x1: rx + 4, y1: by - 4 });

  // The brazier: an iron bowl heaped with coals on three legs.
  const B = new Layer(bx - 10, by - 20, 21, 22);
  for (const [x0, x1] of [[bx - 5, bx - 7], [bx + 5, bx + 7], [bx, bx]] as const) {
    for (let t = 0; t < 7; t++) B.px(Math.round(x0 + (x1 - x0) * (t / 6)), by - 6 + t, IRON[x0 < bx ? 4 : 2]);
  }
  hline(B, bx - 4, bx + 4, by - 3, IRON[2]);
  oval(B, bx, by - 8, 7, 2.6, (_x, _y, nx, ny) => rk(IRON, 3.6 - ny * 1.8 - nx * 0.6));
  oval(B, bx, by - 9.5, 6, 2, (x, y) => {
    const hot = vnoise(x, y, 2, 2, 67);
    B.gl(x, y, rk(EMBER, 2.2 + hot * 4.2));
    return null;
  });
  // Coals heaped above the rim, a lick of flame.
  for (const [dx, dy, k] of [[-2, -11, 4.5], [0, -12, 5.2], [1, -11, 4], [2, -12, 3.6], [-1, -12, 4.8], [0, -13, 6], [1, -14, 5.6], [0, -15, 6.4]] as const) B.gl(bx + dx, by + dy, rk(EMBER, k));
  for (let a = 0; a < 18; a++) {
    const ang = (a / 18) * Math.PI * 2;
    B.halo(Math.round(bx + Math.cos(ang) * 8), Math.round(by - 10 + Math.sin(ang) * 4), '#ff8a3a', 0.25);
  }
  B.outlineTinted(0.72);
  B.light(bx, by - 12, 52, '#ff7a2a', 0.62, 0.7);
  out.piece(B, 'brazier', by);
  out.shadows.push({ kind: 'oval', x: bx + 1, y: by + 1, rx: 7, ry: 2, strength: 0.42 });
  out.motes.push({ x: bx, y: by - 14, rx: 4, ry: 3, kind: 'ember', color: '#ff9a3a', count: 4 });

  // The anvil on its stump, a glowing blade on its face, sparks.
  const A = new Layer(ax - 9, ay - 16, 19, 18);
  for (let y = ay - 5; y <= ay; y++) {
    for (let x = ax - 4 - (y > ay - 2 ? 1 : 0); x <= ax + 4 + (y > ay - 2 ? 1 : 0); x++) {
      const t = (x - (ax - 5)) / 10;
      A.px(x, y, rk(['#1e140e', '#2e2016', '#45301e', '#5e4228', '#7a5834'], 3.6 - t * 2.6 - ((x + 1) % 3 === 0 ? 0.7 : 0)));
    }
  }
  oval(A, ax, ay - 6, 4.6, 1.6, (_x, _y, nx, ny) => rk(['#6a4a2a', '#8a6838', '#a8844c', '#c4a068'], 2.4 - ny - nx * 0.3));
  A.rect(ax - 2, ay - 9, 5, 2, (x, y) => rk(IRON, 3.4 - (x - ax) * 0.3 + (y === ay - 9 ? 0.6 : 0)));
  A.rect(ax - 5, ay - 12, 11, 3, (x, y) => rk(IRON, y === ay - 12 ? 6 : y === ay - 11 ? 4.6 : 3 - (x - ax) * 0.15));
  hline(A, ax - 8, ax - 6, ay - 11, IRON[4]);
  hline(A, ax - 7, ax - 6, ay - 10, IRON[2]);
  for (const [dx, c] of [[-3, '#ffe080'], [-2, '#ffd060'], [-1, '#ffb040'], [0, '#ff8a20'], [1, '#e06010']] as const) A.gl(ax + dx, ay - 13, c);
  A.halo(ax - 2, ay - 14, '#ff9a30', 0.4);
  A.halo(ax - 1, ay - 14, '#ff9a30', 0.3);
  // A quench bucket by the stump.
  for (let y = ay - 5; y <= ay; y++) for (let x = ax + 6; x < ax + 10; x++) A.px(x, y, y === ay - 5 ? (x < ax + 8 ? '#5a9ab8' : '#2a5a7a') : y === ay - 3 ? IRON[3] : rk(PLANK, 4 - (x - ax - 6) * 0.8));
  A.outlineTinted(0.72);
  A.light(ax - 2, ay - 14, 24, '#ff9a3a', 0.45, 0.5);
  out.piece(A, 'anvil', ay);
  out.shadows.push({ kind: 'oval', x: ax + 2, y: ay + 1, rx: 7, ry: 2, strength: 0.45 });
  out.motes.push({ x: ax - 2, y: ay - 14, rx: 3, ry: 2, kind: 'spark', color: '#ffb040', count: 3 });
}

// ------------------------------------------------------------------ the sage's stones

/** A small standing stone with runes glowing teal down it. */
export function sigilStone(out: HubOut, x: number, y: number, seed: number, hgt: number): void {
  const w = Math.max(3, Math.round(hgt * 0.42));
  const L = new Layer(x - w - 1, y - hgt - 3, w * 2 + 3, hgt + 5);
  for (let yy = y - hgt; yy <= y; yy++) {
    const t = (yy - (y - hgt)) / hgt;
    const half = Math.round(w * (0.55 + 0.45 * Math.sqrt(Math.min(1, t * 3))));
    const lean = Math.round((1 - t) * (seed % 2 ? 1 : -1));
    for (let xx = x - half + lean; xx <= x + half + lean; xx++) {
      const u = (xx - (x - half + lean)) / Math.max(1, 2 * half);
      let k = 3.6 - u * 2.6 + (yy < y - hgt + 2 ? 1.2 : 0) + (vnoise(xx, yy, 3, 3, seed) - 0.5) * 0.9;
      if (t > 0.78 && h2(xx, yy, seed) < 0.5) {
        L.px(xx, yy, rk(LEAF, 2 + h2(xx, yy, seed + 1) * 2));
        continue;
      }
      if (h2(xx, yy, seed + 2) < 0.04) k -= 1.2;
      L.px(xx, yy, rk(STONE, k));
    }
  }
  const glyphs = [['.#.', '###', '.#.'], ['#.#', '.#.', '#.#'], ['##.', '#..', '.##']];
  for (let i = 0; i < Math.floor((hgt - 2) / 4); i++) {
    const g = glyphs[(i + seed) % glyphs.length];
    g.forEach((r, gy) => [...r].forEach((ch, gx) => {
      if (ch !== '#') return;
      L.gl(x - 1 + gx, y - hgt + 2 + i * 4 + gy, gy === 0 ? '#c8fff4' : SIGIL);
    }));
  }
  // A faint glow just round the runes (the stone itself stays dark).
  for (let i = 0; i < Math.floor((hgt - 2) / 4); i++) {
    for (const [dx, dy] of [[-2, 1], [2, 1], [0, -1], [0, 3]] as const) L.halo(x + dx, y - hgt + 2 + i * 4 + dy, SIGIL, 0.25);
  }
  L.outlineTinted(0.72);
  L.light(x, y - hgt / 2, 24, '#5ae8d0', 0.32, 0.15);
  out.piece(L, `sigil${seed}`, y);
  out.shadows.push({ kind: 'oval', x: x + 1, y: y + 1, rx: w + 1, ry: 1.6, strength: 0.45 });
}

// ------------------------------------------------------------------ the head of the steps

/**
 * Two short stone posts at the head of the steps, a lantern on each; a lantern left burning on one of
 * the steps; and the violet glow rising from the bottom, where the steps go down into the dungeon
 * (four frames of the haze drifting up).
 */
export function stepsHead(out: HubOut, x0: number, x1: number, y: number, bottom: number): void {
  for (const [px, id] of [[x0, 'stepPostL'], [x1, 'stepPostR']] as const) {
    const L = new Layer(px - 5, y - 22, 11, 24);
    blocks(L, px - 4, y - 12, 9, 12, { bw: 5, bh: 4, seed: px, base: 3.4 });
    hline(L, px - 4, px + 4, y - 13, rk(STONE, 6.2));
    hline(L, px - 5, px + 5, y - 14, rk(STONE, 4.6));
    lanternBox(L, px, y - 21);
    L.outlineTinted(0.72);
    L.light(px, y - 18, 40, '#ffb458', 0.42, 0.25);
    out.piece(L, id, y);
    out.shadows.push({ kind: 'oval', x: px + 1, y: y + 1, rx: 5, ry: 1.6, strength: 0.45 });
  }
  // A lantern left on the second step, glowing orange.
  const sl = new Layer(x0 + 2, y + 9, 9, 12);
  lanternBox(sl, x0 + 6, y + 11);
  sl.outlineTinted(0.72);
  sl.light(x0 + 6, y + 14, 34, '#ffa448', 0.5, 0.35);
  out.piece(sl, 'stepLantern', y + 18, null);
  // The portal's glow rising from the bottom of the steps.
  const cx = (x0 + x1) / 2;
  const frame = (k: number): Layer => {
    const P = new Layer(cx - 26, bottom - 26, 53, 40);
    for (let yy = bottom - 22; yy < bottom + 12; yy++) {
      for (let xx = cx - 22; xx < cx + 22; xx++) {
        const t = (yy - (bottom - 22)) / 34;
        const edge = Math.min(xx - (cx - 22), cx + 21 - xx) / 22;
        const a = Math.max(0, t * t * 0.5 * Math.min(1, edge * 2.4) + (vnoise(xx, yy + k * 2, 6, 3, 3) - 0.5) * 0.2 * t);
        if (a > 0.04) P.halo(xx, yy, t > 0.7 ? '#d8b8ff' : '#9a6aff', a);
      }
    }
    for (const [rx, ry, ph] of [[cx - 10, bottom + 4, 0], [cx, bottom + 7, 1], [cx + 10, bottom + 4, 2], [cx - 5, bottom - 4, 3], [cx + 6, bottom - 4, 1]] as const) {
      if ((k + ph) % 4 === 3) continue;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]] as const) P.gl(rx + dx, ry + dy, dx || dy ? '#b890ff' : '#f0e0ff');
    }
    return P;
  };
  out.glowOf(frame(0), 'portal', bottom + 40, [0, 1, 2, 3].map((k) => frame(k).glow), 5);
  out.lights.push({ x: cx, y: bottom + 12, r: 56, color: '#8a5aff', intensity: 0.6, flicker: 0.15 });
  out.lights.push({ x: cx, y: bottom - 8, r: 28, color: '#b890ff', intensity: 0.4 });
  out.motes.push({ x: cx, y: bottom - 8, rx: 18, ry: 10, kind: 'mote', color: '#c8a8ff', count: 6 });
}

