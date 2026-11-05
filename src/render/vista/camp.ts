/**
 * The camp: the campfire (animated pixel flames, the ring of stones, crossed logs and a bed of coals),
 * the tent with a lantern glowing inside, a log seat, and the squad (PixelForge's knights, as in the
 * dungeon) dressed in the scene's light: warm firelight on the side facing the fire, lilac dusk on the
 * other, and a coral rim where the sunset behind them catches their outline.
 */
import type { MutationId } from '../../core/state';
import { CLASS_HAS_SHIELD, KNIGHT_ANCHOR, KNIGHT_H, KNIGHT_W, knightFrame, knightGlow, knightLook, shieldArt, weaponArt, type View } from '../art/knights';
import { blank, blit, flipX, scale3x, scaleUp, type PixelBuf } from '../pixel/buf';
import { pfReady } from '../pf/assets';
import { knightStill } from '../pf/frames';
import { paintStep } from '../pf/knightLook';
import { knightDef } from '../../core/knights';
import { fireLight, type Ground, type Layout } from './land';
import { canvas, clamp, ctx2d, hex, mix, Pix, rng, type Canvas, type RGB } from './pix';

// ------------------------------------------------------------------ the fire

const FIRE: readonly RGB[] = ['#a3261e', '#de4c1e', '#ff8424', '#ffb93c', '#ffe68c', '#fffbe8'].map(hex);
export const FIRE_W = 27;
export const FIRE_H = 44;

interface Tongue {
  ox: number;
  w: number;
  h: number;
  ph: number;
  sp: number;
  sw: number;
}

/** `n` looping frames of flame, FIRE_W x FIRE_H, base at the bottom middle. */
export function fireFrames(n = 10): Pix[] {
  const tongues: Tongue[] = [
    { ox: 0, w: 0.6, h: 0.92, ph: 0, sp: 1, sw: 0.18 },
    { ox: -0.38, w: 0.36, h: 0.58, ph: 2.1, sp: 2, sw: 0.24 },
    { ox: 0.36, w: 0.34, h: 0.66, ph: 4.0, sp: 1, sw: 0.22 },
    { ox: 0.1, w: 0.3, h: 0.78, ph: 1.0, sp: 3, sw: 0.26 },
    { ox: -0.16, w: 0.28, h: 0.7, ph: 5.1, sp: 2, sw: 0.2 },
  ];
  const r = rng(91);
  const out: Pix[] = [];
  for (let f = 0; f < n; f++) {
    const a = (f / n) * Math.PI * 2;
    const p = new Pix(FIRE_W, FIRE_H);
    const field = new Float32Array(FIRE_W * FIRE_H);
    for (let y = 0; y < FIRE_H; y++) {
      const u = 1 - (y + 0.5) / FIRE_H;
      for (let x = 0; x < FIRE_W; x++) {
        const xn = (x + 0.5 - FIRE_W / 2) / (FIRE_W / 2);
        let v = 0;
        for (const tg of tongues) {
          const hh = tg.h * (0.78 + 0.22 * Math.sin(a * tg.sp + tg.ph));
          if (u >= hh) continue;
          const uu = u / hh;
          const cx = tg.ox * (1 - uu * 0.45) + Math.sin(a * tg.sp + tg.ph + uu * 3.2) * tg.sw * uu;
          const wd = tg.w * Math.pow(1 - uu, 0.75) * (0.82 + 0.18 * Math.cos(a * tg.sp * 2 + tg.ph + uu * 5)) + 0.03;
          const d = Math.abs(xn - cx) / wd;
          if (d >= 1) continue;
          v = Math.max(v, (1 - d * d) * (1 - uu * 0.5));
        }
        v += Math.max(0, 0.3 - u) * 0.9 * Math.max(0, 1 - Math.abs(xn) * 1.2);
        field[y * FIRE_W + x] = v;
      }
    }
    // A loose lick or two above the tips.
    for (let k = 0; k < 2; k++) {
      if (r() < 0.35) continue;
      const lx = Math.round(FIRE_W / 2 + (r() - 0.5) * 8);
      const ly = Math.round(FIRE_H * (0.08 + r() * 0.2));
      field[ly * FIRE_W + lx] = Math.max(field[ly * FIRE_W + lx], 0.2);
      if (ly + 1 < FIRE_H) field[(ly + 1) * FIRE_W + lx] = Math.max(field[(ly + 1) * FIRE_W + lx], 0.25);
    }
    for (let y = 0; y < FIRE_H; y++) {
      for (let x = 0; x < FIRE_W; x++) {
        const v = field[y * FIRE_W + x];
        if (v <= 0.05) continue;
        const k = v > 0.84 ? 5 : v > 0.68 ? 4 : v > 0.5 ? 3 : v > 0.32 ? 2 : v > 0.16 ? 1 : 0;
        p.set(x, y, FIRE[k]);
      }
    }
    out.push(p);
  }
  return out;
}

function stone(p: Pix, x: number, y: number, w: number, top: RGB, face: RGB, dark: RGB): void {
  for (let i = 1; i < w - 1; i++) p.set(x + i, y, top);
  for (let i = 0; i < w; i++) p.set(x + i, y + 1, i === 0 ? face : mix(top, face, 0.5));
  for (let i = 0; i < w; i++) p.set(x + i, y + 2, i === w - 1 ? dark : face);
  for (let i = 1; i < w - 1; i++) p.set(x + i, y + 3, dark);
}

const RING = 11;
function ringStones(L: Layout): Array<{ x: number; y: number; w: number; front: boolean }> {
  const out: Array<{ x: number; y: number; w: number; front: boolean }> = [];
  for (let i = 0; i < RING; i++) {
    const a = (i / RING) * Math.PI * 2 + 0.2;
    const x = Math.round(L.fx + Math.cos(a) * 18.5 - 3);
    const y = Math.round(L.fy + Math.sin(a) * 6.2 - 2);
    out.push({ x, y, w: 6 + (i % 3 === 0 ? 1 : 0), front: Math.sin(a) > 0.05 });
  }
  return out.sort((a, b) => a.y - b.y);
}

/** The stones in front of the flames and the bed of coals: drawn after the flames. */
export function fireFront(L: Layout): { pix: Pix; x: number; y: number } {
  const x0 = L.fx - 28;
  const y0 = L.fy - 12;
  const p = new Pix(56, 24);
  const coal: readonly RGB[] = ['#5a1a14', '#c43a18', '#ff7a24', '#ffc050'].map(hex);
  const r = rng(93);
  for (let i = 0; i < 46; i++) {
    const x = L.fx + Math.round((r() - 0.5) * 24) - x0;
    const y = L.fy + Math.round((r() - 0.45) * 4) - y0;
    p.set(x, y, coal[Math.floor(r() * coal.length)]);
  }
  for (const s of ringStones(L)) {
    if (!s.front) continue;
    stone(p, s.x - x0, s.y - y0, s.w, hex('#d8925a'), hex('#4a3448'), hex('#241a30'));
  }
  return { pix: p, x: x0, y: y0 };
}

/** The camp's static pieces, painted into the near layer: dirt, stones, logs, tent, log seat. */
export function paintCamp(p: Pix, L: Layout, G: Ground): void {
  // Trodden earth around the fire.
  const earth: readonly RGB[] = ['#2a1c28', '#40282a', '#5e3a2c', '#845030', '#a86a36'].map(hex);
  for (let y = L.fy - 18; y <= L.fy + 18; y++) {
    for (let x = L.fx - 54; x <= L.fx + 54; x++) {
      const d = Math.hypot((x - L.fx) / 50, (y - L.fy) / 15);
      if (d > 1 || !G.inMeadow(x, y)) continue;
      // A ragged edge where the grass takes over (in clumps, not speckles).
      const ang = Math.atan2((y - L.fy) * 3, x - L.fx);
      if (d > 0.8 + Math.sin(ang * 5 + 1) * 0.06 + Math.sin(ang * 11 + 2) * 0.04) continue;
      const f = fireLight(L, x, y);
      p.set(x, y, earth[clamp(Math.floor(f * 5.2), 0, 4)]);
    }
  }
  // Back stones (faces lit by the fire), and the crossed logs.
  for (const s of ringStones(L)) if (!s.front) stone(p, s.x, s.y, s.w, hex('#f0aa68'), hex('#b8704a'), hex('#4a2c34'));
  const log = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      p.set(x, y, hex('#f08a38'));
      p.set(x, y + 1, hex('#8a3a20'));
      p.set(x, y + 2, hex('#3a2020'));
      p.set(x, y + 3, hex('#22141c'));
    }
    for (let j = 0; j < 4; j++) {
      p.set(x0, y0 + j, hex(j === 0 ? '#ffd890' : '#e0a060'));
      p.set(x1, y1 + j, hex(j === 0 ? '#ffd890' : '#e0a060'));
    }
  };
  log(L.fx - 15, L.fy - 4, L.fx + 12, L.fy - 9);
  log(L.fx - 12, L.fy - 9, L.fx + 15, L.fy - 4);
  tent(p, L, L.fx - 104, L.fy - 13);
  logSeat(p, L, L.fx + 70, L.fy - 10);
}

function tri(p: Pix, a: readonly [number, number], b: readonly [number, number], c: readonly [number, number], color: (x: number, y: number) => RGB | null): void {
  const minX = Math.floor(Math.min(a[0], b[0], c[0]));
  const maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
  const minY = Math.floor(Math.min(a[1], b[1], c[1]));
  const maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
  const e = (p0: readonly [number, number], p1: readonly [number, number], x: number, y: number) => (p1[0] - p0[0]) * (y - p0[1]) - (p1[1] - p0[1]) * (x - p0[0]);
  const area = e(a, b, c[0], c[1]);
  if (area === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = e(b, c, px, py) / area;
      const w1 = e(c, a, px, py) / area;
      const w2 = e(a, b, px, py) / area;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const col = color(x, y);
      if (col) p.set(x, y, col);
    }
  }
}

function lineP(p: Pix, x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) p.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}

/** An A-frame tent in three-quarter view, its door toward the fire and a lantern lit inside. */
function tent(p: Pix, L: Layout, x: number, by: number): void {
  const tw = 44;
  const th = 35;
  const d = 25;
  const rise = 6;
  const A = [x + 10, by - th] as const;
  const FL = [A[0] - tw / 2, by] as const;
  const FR = [A[0] + tw / 2, by] as const;
  const B = [A[0] - d, by - th - rise] as const;
  const BL = [FL[0] - d, by - rise] as const;
  const shade = hex('#4e3a58');
  const shade2 = hex('#5e4864');
  const seam = hex('#3e2c4a');
  const ridgeRim = hex('#ffb48c');
  const ink = hex('#170f22');
  // Guy ropes behind.
  lineP(p, B[0], B[1], BL[0] - 7, by - rise + 1, hex('#3a2a40'));
  // The roof plane facing us, in the dusk.
  const roof = (xx: number, yy: number) => {
    // Distance from the ridge line in the plane's "down" direction: seams run parallel to the ridge.
    const t = (yy - (A[1] + ((xx - A[0]) * (B[1] - A[1])) / (B[0] - A[0]))) / th;
    if (t < 0.06) return ridgeRim;
    const k = Math.floor(t * 7);
    const f = fireLight(L, xx, yy);
    const base = k % 3 === 2 ? seam : t > 0.7 ? shade : shade2;
    return mix(base, hex('#c87850'), clamp(f * 0.9, 0, 0.5));
  };
  tri(p, A, B, BL, roof);
  tri(p, A, BL, FL, roof);
  // The front, facing the fire: warm canvas with the lit doorway.
  const cream = hex('#e2b47e');
  const creamD = hex('#a8786a');
  const door = (xx: number, yy: number): RGB => {
    const u = (yy - A[1]) / th;
    const half = (tw / 2) * u;
    const rel = (xx + 0.5 - A[0]) / Math.max(0.5, half);
    // The door: a slit opening wider toward the ground, glowing.
    if (u > 0.32 && Math.abs(rel + 0.05) < 0.34 * (u - 0.2) / 0.8 + 0.08) {
      const g = clamp((u - 0.32) / 0.68, 0, 1);
      return mix(hex('#8a3420'), hex('#ffc458'), g * g);
    }
    const f = fireLight(L, xx, yy);
    const lit = mix(creamD, cream, clamp(0.35 + rel * 0.45 + f * 0.5, 0, 1));
    return Math.abs(rel) > 0.9 ? mix(lit, ink, 0.4) : lit;
  };
  tri(p, A, FL, FR, door);
  // Edges: ink on the shadow sides, rim on the ridge.
  lineP(p, FL[0], FL[1], BL[0], BL[1], ink);
  lineP(p, B[0], B[1], BL[0], BL[1], ink);
  lineP(p, A[0], A[1], B[0], B[1], ridgeRim);
  lineP(p, FL[0], by + 1, FR[0], by + 1, mix(ink, hex('#5a3a2a'), 0.4));
  // Pole and pennant.
  for (let j = 1; j <= 7; j++) p.set(A[0], A[1] - j, hex('#2a1a24'));
  for (let j = 1; j <= 8; j++) {
    const h = Math.max(1, 3 - Math.floor(j / 3));
    for (let k = 0; k < h; k++) p.set(A[0] - j, A[1] - 7 + Math.floor(j / 4) + k, k === h - 1 ? hex('#9a2440') : hex('#e2405e'));
  }
  // Rope to a peg on the fire side.
  lineP(p, A[0] + 1, A[1] + 1, FR[0] + 11, by + 1, hex('#b48a6a'));
}

function logSeat(p: Pix, L: Layout, x: number, by: number): void {
  const w = 34;
  const h = 7;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const f = fireLight(L, x + i, by - h + j);
      let c = j === 0 ? mix(hex('#5a3a30'), hex('#d8884a'), clamp(f * 1.4, 0, 1)) : j === h - 1 ? hex('#1a1018') : j % 2 ? hex('#3a2626') : hex('#2e1c20');
      if (i === w - 1) c = hex('#1a1018');
      p.set(x + i, by - h + j, c);
    }
  }
  // The cut end, facing the fire.
  const rings: readonly RGB[] = ['#b07040', '#f2c27e', '#c88a52', '#f2c27e'].map(hex);
  for (let j = 0; j < h; j++) {
    const k = Math.min(rings.length - 1, Math.abs(j - 3));
    p.set(x - 1, by - h + j, j === 0 || j === h - 1 ? hex('#8a5a34') : rings[Math.min(3, k + 1)]);
    p.set(x, by - h + j, rings[k]);
    p.set(x + 1, by - h + j, j === 0 ? hex('#d8884a') : rings[Math.min(3, k + 1)]);
  }
}

// ------------------------------------------------------------------ knights

export interface KnightSprite {
  dim: Canvas;
  lit: Canvas;
  w: number;
  h: number;
  /** The feet, in sprite pixels. */
  ax: number;
  ay: number;
  glow: RGB | null;
}

const MX = 9;
const MT = 9;
/** Scene pixels per PixelForge pixel at the camp (whole, never smoothed). */
const PF_SCALE = 2;

/** Draws `src` rotated by `ang` around its pivot, the pivot landing at (hx, hy) (nearest pixel, like a canvas). */
function rotateInto(dst: PixelBuf, src: PixelBuf, pivX: number, pivY: number, hx: number, hy: number, ang: number): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const R = Math.ceil(Math.hypot(src.w, src.h)) + 2;
  for (let y = Math.floor(hy - R); y <= hy + R; y++) {
    for (let x = Math.floor(hx - R); x <= hx + R; x++) {
      if (x < 0 || y < 0 || x >= dst.w || y >= dst.h) continue;
      const dx = x + 0.5 - hx;
      const dy = y + 0.5 - hy;
      const sx = Math.floor(c * dx + s * dy + pivX);
      const sy = Math.floor(-s * dx + c * dy + pivY);
      if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
      const si = (sy * src.w + sx) * 4;
      if (!src.px[si + 3]) continue;
      const di = (y * dst.w + x) * 4;
      dst.px[di] = src.px[si];
      dst.px[di + 1] = src.px[si + 1];
      dst.px[di + 2] = src.px[si + 2];
      dst.px[di + 3] = 255;
    }
  }
}

function toCanvas(b: PixelBuf): Canvas {
  const c = canvas(b.w, b.h);
  const g = ctx2d(c);
  const img = g.createImageData(b.w, b.h);
  img.data.set(b.px);
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * The knight standing: PixelForge's idle facing `view` (west when `west`), cape and halo on, its soft
 * ground shadow left out (the camp casts its own, away from the fire).
 */
function composePF(id: string, mutation: MutationId | null, view: View, west: boolean, frame: number, t: number): { buf: PixelBuf; ax: number; ay: number; glow: RGB | null } {
  const dir = view === 'down' ? 's' : view === 'up' ? 'n' : west ? 'w' : 'e';
  const { buf, pivot, paint } = knightStill(id, mutation, dir, frame, paintStep(knightDef(id).rarity, t));
  const comp = blank(buf.w + MX * 2, buf.h + MT + 2);
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const i = (y * buf.w + x) * 4;
      if (buf.px[i + 3] !== 255) continue;
      comp.px.set(buf.px.subarray(i, i + 4), ((y + MT) * comp.w + x + MX) * 4);
    }
  }
  return { buf: comp, ax: MX + pivot[0], ay: MT + pivot[1], glow: paint.glow ? hex(paint.glow) : null };
}

/** The knight with its weapon (and shield) as the game holds them at rest, facing right. */
function compose(id: string, mutation: MutationId | null, view: View, frame: number, t: number): { buf: PixelBuf; ax: number; ay: number; glow: RGB | null } {
  const L = knightLook(id, mutation, t);
  const fr = knightFrame(L, 'idle', view, frame);
  const comp = blank(KNIGHT_W + MX * 2, KNIGHT_H + MT + 2);
  const wp = weaponArt(L);
  const hx = MX + fr.handR[0];
  const hy = MT + fr.handR[1] + 1;
  const weapon = () => rotateInto(comp, wp.buf, wp.px, wp.py, hx, hy, Math.PI / 8);
  if (view === 'up') weapon();
  blit(comp, fr.buf, MX, MT);
  if (view !== 'up') weapon();
  if (CLASS_HAS_SHIELD[L.cls] && view !== 'up') {
    const sh = shieldArt(L);
    const sx = view === 'side' ? MX + KNIGHT_W - sh.w - 1 : MX + fr.handL[0] - Math.floor(sh.w / 2);
    blit(comp, sh, sx, MT + fr.handL[1] - 5);
  }
  const g = knightGlow(L);
  return { buf: comp, ax: MX + KNIGHT_ANCHOR.x, ay: MT + KNIGHT_ANCHOR.y, glow: g ? hex(g) : null };
}

/**
 * Lights a sprite for the scene. `fireDir` is where the fire is (-1 left, 1 right, 0 in front, below);
 * `rimSide` is the side the sun is on. Returns the dusk-shaded and the fire-lit versions.
 */
function lightUp(b: PixelBuf, fireDir: number, rimSide: number): [PixelBuf, PixelBuf] {
  const W = b.w;
  const H = b.h;
  const A = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && b.px[(y * W + x) * 4 + 3] > 0;
  let top = H;
  let bot = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y)) {
    top = Math.min(top, y);
    bot = Math.max(bot, y);
  }
  const dim = blank(W, H);
  const lit = blank(W, H);
  const rim = [255, 184, 140];
  const put = (o: PixelBuf, i: number, r: number, g: number, bl: number) => {
    o.px[i] = clamp(r, 0, 255);
    o.px[i + 1] = clamp(g, 0, 255);
    o.px[i + 2] = clamp(bl, 0, 255);
    o.px[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!A(x, y)) continue;
      const i = (y * W + x) * 4;
      const r = b.px[i];
      const g = b.px[i + 1];
      const bl = b.px[i + 2];
      const v = (y - top) / Math.max(1, bot - top);
      let face: number;
      if (fireDir === 0) face = 0.6 + 0.4 * v;
      else {
        let open = 0;
        for (let k = 1; k <= 5; k++) {
          if (!A(x + fireDir * k, y)) {
            open = k;
            break;
          }
        }
        face = (open ? 1.08 - open * 0.13 : 0.3) * (0.72 + 0.28 * v);
      }
      const topEdge = !A(x, y - 1);
      const sunEdge = !A(x + rimSide, y);
      const rk = (topEdge && sunEdge ? 0.8 : topEdge ? 0.55 : sunEdge && v < 0.75 ? 0.5 : 0) * (1 - v * 0.5);
      const lr = r * (0.88 + 0.26 * face) + 26 * face;
      const lg = g * (0.84 + 0.14 * face) + 10 * face;
      const lb = bl * (0.74 + 0.06 * face);
      put(lit, i, lr + (rim[0] - lr) * rk, lg + (rim[1] - lg) * rk, lb + (rim[2] - lb) * rk);
      const dr = r * 0.56 + 14;
      const dg = g * 0.5 + 10;
      const db = bl * 0.64 + 30;
      put(dim, i, dr + (rim[0] - dr) * rk * 0.85, dg + (rim[1] - dg) * rk * 0.85, db + (rim[2] - db) * rk * 0.85);
    }
  }
  return [dim, lit];
}

/**
 * A knight ready for the scene: composed, facing left if asked, tripled, lit. PixelForge's knights
 * face west in their own drawing and are tripled pixel for pixel; the old art was mirrored and
 * smoothed with Scale3x.
 */
export function knightSprite(id: string, mutation: MutationId | null, view: View, frame: number, flip: boolean, t: number, fireDir: number, rimSide: number): KnightSprite {
  if (pfReady()) {
    const c = composePF(id, mutation, view, flip, frame, t);
    const buf = scaleUp(c.buf, PF_SCALE);
    const [dim, lit] = lightUp(buf, fireDir, rimSide);
    return { dim: toCanvas(dim), lit: toCanvas(lit), w: buf.w, h: buf.h, ax: c.ax * PF_SCALE + Math.floor(PF_SCALE / 2), ay: c.ay * PF_SCALE + PF_SCALE - 1, glow: c.glow };
  }
  const c = compose(id, mutation, view, frame, t);
  let buf = c.buf;
  let ax = c.ax;
  if (flip) {
    buf = flipX(buf);
    ax = buf.w - 1 - ax;
  }
  buf = scale3x(buf);
  const [dim, lit] = lightUp(buf, fireDir, rimSide);
  return { dim: toCanvas(dim), lit: toCanvas(lit), w: buf.w, h: buf.h, ax: ax * 3 + 1, ay: c.ay * 3 + 2, glow: c.glow };
}
