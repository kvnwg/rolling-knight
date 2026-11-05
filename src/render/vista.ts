/**
 * The home screen's backdrop: the squad's camp on a cliff above a valley at sunset.
 *
 * Every layer is pixel art painted once per layout at an art resolution finer than the world's
 * (about 320 to 480 art pixels on the screen's short side, a whole number of device pixels each):
 * the sky with a low sun and pixel cumulus, far mountains in alpenglow, a castle on its hill with lit
 * windows, a lake that mirrors it all, forests stepping down into mist, and the meadow on the cliff
 * where the knights stand round their fire by the tent. Each frame composites the cached layers at
 * device resolution and adds the smooth, expensive-looking parts on top: drifting clouds and mist,
 * a breathing sun bloom and light shafts, shimmering broken reflections and glints on the water,
 * flickering firelight on the knights and the ground, embers, smoke and fireflies, out-of-focus
 * framing pines and foreground grass, and a vignette. Pixel layers stay crisp (nearest-neighbor
 * scaling); only the light, haze and depth of field are smooth. Blurs are baked into cached layers;
 * a frame is just blits, a handful of gradients and particle sprites.
 *
 * No DOM at import time: canvases are made on the first draw.
 */
import type { MutationId } from '../core/state';
import type { View } from './art/knights';
import { FIRE_H, FIRE_W, fireFrames, fireFront, knightSprite, paintCamp, type KnightSprite } from './vista/camp';
import { ground, makeLayout, mistStrip, paintFar, paintFront, paintLake, paintMid, paintNear, riverPath, type Glow, type Layout } from './vista/land';
import { blurRGBA, blurred, canvas, clamp, crop, ctx2d, firstRow, glowSprite, hex, luma, padPix, Pix, rng, type Canvas } from './vista/pix';
import { cumulus, SKY, skyAt, streak, type CloudKind } from './vista/sky';

export interface VistaHero {
  id: string;
  mutation: MutationId | null;
}

export interface VistaOptions {
  heroes: VistaHero[];
  /** Where the campfire sits on screen, 0..1 (menus cover the rest). */
  focusX: number;
  focusY: number;
  reduceMotion?: boolean;
}

type Ctx = CanvasRenderingContext2D;

interface Drifter {
  c: Canvas;
  bloom: Canvas | null;
  pad: number;
  x0: number;
  y: number;
  w: number;
  h: number;
  /** Art pixels per second. */
  speed: number;
}

interface Mist {
  c: Canvas;
  y: number;
  h: number;
  speed: number;
  alpha: number;
}

interface Built {
  L: Layout;
  sky: Canvas;
  farMid: Canvas;
  farMidY: number;
  clouds: Drifter[];
  streaksBack: Drifter[];
  streaksFront: Drifter[];
  lake: Canvas;
  lakeM: number;
  lakeH: number;
  near: Canvas;
  nearY: number;
  fronts: Array<{ c: Canvas; x: number; y: number; w: number; h: number }>;
  mists: Mist[];
  lowMists: Mist[];
  rays: Canvas;
  vignette: Canvas;
  glows: Glow[];
  stars: Array<{ x: number; y: number; b: number; s: number; ph: number }>;
  glints: Array<{ x: number; y: number; len: number; s: number; ph: number; b: number }>;
  flies: Array<{ x: number; y: number; ax: number; ay: number; sx: number; sy: number; ph: number; blink: number }>;
  fire: Canvas[];
  fireFront: { c: Canvas; x: number; y: number; w: number; h: number };
}

interface Slot {
  dx: number;
  dy: number;
  view: View;
  flip: boolean;
  fireDir: number;
  phase: number;
}

/** Round the fire: the leader behind it facing us, the others either side facing in. */
const SLOTS: readonly Slot[] = [
  { dx: 10, dy: -20, view: 'down', flip: false, fireDir: 0, phase: 0 },
  { dx: -50, dy: 4, view: 'side', flip: false, fireDir: 1, phase: 0.37 },
  { dx: 50, dy: 3, view: 'side', flip: true, fireDir: -1, phase: 0.71 },
];

const WARM = hex('#ff9a48');
const GOLD = hex('#ffd27a');
const EMBER = hex('#ff7a30');
const FLY = hex('#e8ff9a');

/** How long a new size or focus must hold before the layers are rebuilt, and the crossfade after. */
const SETTLE_MS = 200;
const FADE_MS = 400;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Vista {
  private key = '';
  private built: Built | null = null;
  /** The layout being faded out after a rebuild. */
  private prev: Built | null = null;
  private fadeAt = 0;
  private fadeCanvas: Canvas | null = null;
  private pendingKey = '';
  private pendingAt = 0;
  private knights = new Map<string, KnightSprite | null>();
  private still: Canvas | null = null;
  private stillKey = '';

  constructor() {
    // Canvases are made lazily on the first draw (no DOM at import time).
  }

  draw(ctx: Ctx, w: number, h: number, t: number, opts: { heroes: Array<{ id: string; mutation: MutationId | null }>; focusX: number; focusY: number; reduceMotion?: boolean }): void {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    const S = this.ensure(w, h, opts.focusX, opts.focusY, !!opts.reduceMotion);
    if (opts.reduceMotion) {
      // A still frame: composed once per layout, then just blitted.
      const k = `${this.key}|${opts.heroes.map((hh) => `${hh.id}:${hh.mutation ?? ''}`).join(',')}`;
      if (!this.still || this.stillKey !== k) {
        this.still = canvas(S.L.w, S.L.h);
        this.stillKey = k;
        this.frame(ctx2d(this.still), S, 9.5, opts.heroes, true, 1, 1);
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.still, 0, 0, w, h);
      ctx.restore();
      return;
    }
    // A layout that is being replaced is drawn stretched to the current size until the new one is ready.
    this.frame(ctx, S, t, opts.heroes, false, w / S.L.w, h / S.L.h);
    if (this.prev) {
      const k = (now() - this.fadeAt) / FADE_MS;
      if (k >= 1) {
        this.prev = null;
        this.fadeCanvas = null;
      } else {
        if (!this.fadeCanvas || this.fadeCanvas.width !== w || this.fadeCanvas.height !== h) this.fadeCanvas = canvas(w, h);
        const fc = ctx2d(this.fadeCanvas);
        this.frame(fc, this.prev, t, opts.heroes, false, w / this.prev.L.w, h / this.prev.L.h);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1 - k * k * (3 - 2 * k);
        ctx.drawImage(this.fadeCanvas, 0, 0);
        ctx.restore();
      }
    }
  }

  // ------------------------------------------------------------------ building

  /**
   * The layers for this size and focus. The first build happens at once; later changes wait until the
   * size and focus have held still for a moment (a rotation, a window drag or a menu transition costs
   * one rebuild, not one per frame), then the new layout fades in over the old.
   */
  private ensure(w: number, h: number, fx: number, fy: number, instant: boolean): Built {
    const key = `${w}x${h}|${Math.round(fx * 200)}|${Math.round(fy * 200)}`;
    if (!this.built) {
      this.key = key;
      this.built = build(makeLayout(w, h, fx, fy));
      return this.built;
    }
    if (key === this.key) {
      this.pendingKey = '';
      return this.built;
    }
    const tNow = now();
    if (key !== this.pendingKey) {
      this.pendingKey = key;
      this.pendingAt = tNow;
    }
    if (instant || tNow - this.pendingAt >= SETTLE_MS) {
      const old = this.built;
      this.key = key;
      this.pendingKey = '';
      this.built = build(makeLayout(w, h, fx, fy));
      if (!instant) {
        this.prev = old;
        this.fadeAt = now();
      }
    }
    return this.built;
  }

  /** A knight's lit sprite (cached), or null if the id is unknown (the camp just leaves the place empty). */
  private knight(id: string, mutation: MutationId | null, slot: Slot, frame: number, t: number, rimSide: number): KnightSprite | null {
    // Primordial armor cycles color; its frames are keyed by time.
    const tk = id.startsWith('primordial') ? Math.floor(t * 6) % 40 : 0;
    const key = `${id}|${mutation ?? ''}|${slot.view}|${frame}|${slot.flip ? 1 : 0}|${slot.fireDir}|${rimSide}|${tk}`;
    let k = this.knights.get(key);
    if (k === undefined) {
      try {
        k = knightSprite(id, mutation, slot.view, frame, slot.flip, tk / 6, slot.fireDir, rimSide);
      } catch {
        k = null;
      }
      this.knights.set(key, k);
      if (this.knights.size > 160) this.knights.delete(this.knights.keys().next().value!);
    }
    return k;
  }

  // ------------------------------------------------------------------ a frame

  private frame(g: Ctx, S: Built, t: number, heroes: VistaOptions['heroes'], still: boolean, sx: number, sy: number): void {
    const L = S.L;
    const p = L.p;
    g.save();
    g.setTransform(sx, 0, 0, sy, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = false;

    // Sky, stars, high streaks, clouds, birds.
    g.drawImage(S.sky, 0, 0);
    this.stars(g, S, t);
    if (!still) this.shootingStar(g, L, t);
    for (const d of S.streaksBack) this.drift(g, L, d, t);
    for (const d of S.clouds) this.drift(g, L, d, t);
    for (const d of S.streaksFront) this.drift(g, L, d, t);
    if (!still) this.birds(g, L, t);

    // The sun breathes; a long anamorphic flare crosses it.
    g.globalCompositeOperation = 'lighter';
    g.imageSmoothingEnabled = true;
    const pulse = 0.85 + 0.15 * Math.sin(t * 0.7);
    glow(g, glowSprite(hex('#ffe2a8')), L.sunX * p, L.sunY * p, L.sunR * 5.5 * p, L.sunR * 5.5 * p, 0.32 * pulse);
    g.globalCompositeOperation = 'source-over';

    // Far and middle distance (the castle), then the lake under it.
    g.drawImage(S.farMid, 0, S.farMidY * p);
    this.windows(g, S, t, false);
    this.lake(g, S, t);
    this.windows(g, S, t, true);
    this.glints(g, S, t);
    for (const m of S.mists) this.mist(g, L, m, t);

    // Near: the forests below, the meadow and the cliff.
    g.imageSmoothingEnabled = false;
    g.drawImage(S.near, 0, S.nearY * p);
    for (const m of S.lowMists) this.mist(g, L, m, t);

    // The camp.
    const fl = flicker(t);
    this.camp(g, S, t, fl, heroes);

    // Light: sun shafts and flare, over the land.
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = 0.7 + 0.15 * Math.sin(t * 0.21);
    g.drawImage(S.rays, 0, 0, L.W * p, L.H * p);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'lighter';
    const fx = glowSprite(hex('#ffb070'));
    glow(g, fx, L.sunX * p, L.sunY * p, L.W * 0.55 * p, 2.2 * p, 0.55 * pulse);
    glow(g, fx, L.sunX * p, L.sunY * p, L.W * 0.32 * p, 7 * p, 0.25 * pulse);
    g.globalCompositeOperation = 'source-over';

    // Fireflies, then the out-of-focus foreground and the vignette.
    this.flies(g, S, t);
    for (const f of S.fronts) g.drawImage(f.c, f.x * p, f.y * p, f.w * p, f.h * p);
    g.drawImage(S.vignette, 0, 0, L.w, L.h);
    g.restore();
  }

  private drift(g: Ctx, L: Layout, d: Drifter, t: number): void {
    const p = L.p;
    const span = L.W + d.w + 40;
    let x = (((d.x0 + d.speed * t + d.w + 20) % span) + span) % span - d.w - 20;
    x = Math.round(x * p) / p;
    g.imageSmoothingEnabled = false;
    g.drawImage(d.c, Math.round(x * p), Math.round(d.y * p), d.w * p, d.h * p);
    if (d.bloom) {
      g.imageSmoothingEnabled = true;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.42;
      g.drawImage(d.bloom, Math.round((x - d.pad) * p), Math.round((d.y - d.pad) * p), (d.w + 2 * d.pad) * p, (d.h + 2 * d.pad) * p);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  }

  private stars(g: Ctx, S: Built, t: number): void {
    const p = S.L.p;
    for (const s of S.stars) {
      const a = s.b * (0.6 + 0.4 * Math.sin(t * s.s + s.ph));
      if (a < 0.05) continue;
      g.fillStyle = `rgba(255,240,255,${a.toFixed(3)})`;
      g.fillRect(Math.round(s.x) * p, Math.round(s.y) * p, p, p);
      if (s.b > 0.85) {
        g.fillStyle = `rgba(255,220,250,${(a * 0.45).toFixed(3)})`;
        g.fillRect((Math.round(s.x) - 1) * p, Math.round(s.y) * p, p, p);
        g.fillRect((Math.round(s.x) + 1) * p, Math.round(s.y) * p, p, p);
        g.fillRect(Math.round(s.x) * p, (Math.round(s.y) - 1) * p, p, p);
        g.fillRect(Math.round(s.x) * p, (Math.round(s.y) + 1) * p, p, p);
      }
    }
  }

  private birds(g: Ctx, L: Layout, t: number): void {
    const p = L.p;
    const span = L.W + 160;
    const cx = ((t * 7 + L.W * 0.15) % span) - 60;
    const cy = L.hy * 0.42 + Math.sin(t * 0.23) * 6;
    g.fillStyle = 'rgba(38,22,58,0.9)';
    const flock: ReadonlyArray<readonly [number, number, number]> = [
      [0, 0, 0],
      [-8, 3, 1.3],
      [-15, 6, 2.1],
      [-6, -5, 0.6],
      [-19, -2, 2.8],
    ];
    for (const [ox, oy, ph] of flock) {
      const x = Math.round(cx + ox + Math.sin(t * 0.9 + ph) * 1.5);
      const y = Math.round(cy + oy + Math.sin(t * 1.3 + ph * 2) * 1.2);
      const f = Math.floor(t * 5 + ph * 3) % 4;
      // Wings up, level, down, level.
      const rows = f === 0 ? ['X...X', '.X.X.', '..X..'] : f === 2 ? ['.....', '..X..', '.X.X.', 'X...X'] : ['.....', 'XX.XX', '..X..'];
      rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) if (row[rx] === 'X') g.fillRect((x + rx - 2) * p, (y + ry - 1) * p, p, p);
      });
    }
  }

  /** Now and then a shooting star crosses the dark upper sky. */
  private shootingStar(g: Ctx, L: Layout, t: number): void {
    const period = 19;
    const n = Math.floor(t / period);
    const k = (t - n * period) / 0.9;
    if (k < 0 || k > 1) return;
    const p = L.p;
    const rx = ((n * 0.618034) % 1) * 0.6 + 0.1;
    const x0 = L.W * rx;
    const y0 = L.hy * (0.06 + ((n * 0.414) % 1) * 0.16);
    const len = Math.min(L.W, L.hy) * 0.28;
    const dx = len * 0.94;
    const dy = len * 0.34;
    const hx = x0 + dx * k;
    const hy = y0 + dy * k;
    const a = Math.sin(k * Math.PI);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gr = g.createLinearGradient((hx - dx * 0.35) * p, (hy - dy * 0.35) * p, hx * p, hy * p);
    gr.addColorStop(0, 'rgba(255,220,240,0)');
    gr.addColorStop(1, `rgba(255,244,250,${(0.85 * a).toFixed(3)})`);
    g.strokeStyle = gr;
    g.lineWidth = Math.max(1, p * 0.8);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo((hx - dx * 0.35) * p, (hy - dy * 0.35) * p);
    g.lineTo(hx * p, hy * p);
    g.stroke();
    glow(g, glowSprite(hex('#ffe6f4')), hx * p, hy * p, 4 * p, 4 * p, 0.7 * a);
    g.restore();
  }

  private windows(g: Ctx, S: Built, t: number, mirrored: boolean): void {
    const L = S.L;
    const p = L.p;
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < S.glows.length; i++) {
      const gl = S.glows[i];
      const tw = 0.82 + 0.18 * Math.sin(t * (1.3 + (i % 5) * 0.37) + i * 1.7);
      if (mirrored) {
        const y = 2 * L.shoreY - gl.y;
        if (y > L.lakeBot) continue;
        glow(g, glowSprite(gl.color), gl.x * p, y * p, gl.r * 0.7 * p, gl.r * 1.6 * p, gl.k * 0.35 * tw);
      } else glow(g, glowSprite(gl.color), gl.x * p, gl.y * p, gl.r * p, gl.r * p, gl.k * 0.55 * tw);
    }
    g.globalCompositeOperation = 'source-over';
  }

  /** The lake, row by row, each row shifted sideways by a wave that grows toward the viewer. */
  private lake(g: Ctx, S: Built, t: number): void {
    const L = S.L;
    const p = L.p;
    g.imageSmoothingEnabled = false;
    const M = S.lakeM;
    for (let r = 0; r < S.lakeH; r++) {
      const k = r / S.lakeH;
      const amp = (0.35 + k * 2.4) * p;
      const band = Math.floor(r / (1 + Math.floor(k * 2.5)));
      const off = Math.sin(t * 1.15 + band * 0.93) * 0.62 + Math.sin(t * 1.9 - band * 1.71 + 1.3) * 0.38;
      const dx = Math.round(off * amp);
      g.drawImage(S.lake, 0, r, S.lake.width, 1, -M * p + dx, (L.shoreY + r) * p, S.lake.width * p, p);
    }
  }

  private glints(g: Ctx, S: Built, t: number): void {
    const L = S.L;
    const p = L.p;
    g.globalCompositeOperation = 'lighter';
    g.imageSmoothingEnabled = true;
    // The sun's column on the water, under the sparkle.
    glow(g, glowSprite(hex('#ffcf8a')), L.sunX * p, (L.shoreY + 3) * p, L.sunR * 2.4 * p, L.sunR * 0.9 * p, 0.55);
    glow(g, glowSprite(hex('#ffb070')), L.sunX * p, (L.shoreY + (L.lakeBot - L.shoreY) * 0.45) * p, L.sunR * 1.3 * p, (L.lakeBot - L.shoreY) * 0.6 * p, 0.35);
    for (const s of S.glints) {
      const a = Math.pow(Math.max(0, Math.sin(t * s.s + s.ph)), 3) * s.b;
      if (a < 0.04) continue;
      const drift = Math.sin(t * 0.8 + s.ph) * 1.2;
      g.fillStyle = `rgba(255,244,214,${a.toFixed(3)})`;
      g.fillRect(Math.round((s.x + drift) * p), s.y * p, s.len * p, p);
    }
    g.globalCompositeOperation = 'source-over';
  }

  private mist(g: Ctx, L: Layout, m: Mist, t: number): void {
    const p = L.p;
    const w = m.c.width;
    const ox = (((t * m.speed) % w) + w) % w;
    g.imageSmoothingEnabled = true;
    g.globalAlpha = m.alpha;
    g.drawImage(m.c, (ox - w) * p, m.y * p, w * p, m.h * p);
    g.drawImage(m.c, ox * p, m.y * p, w * p, m.h * p);
    if ((ox + w) * p < L.w) g.drawImage(m.c, (ox + w) * p, m.y * p, w * p, m.h * p);
    g.globalAlpha = 1;
  }

  private camp(g: Ctx, S: Built, t: number, fl: number, heroes: VistaOptions['heroes']): void {
    const L = S.L;
    const p = L.p;
    // Firelight pooling on the ground.
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'lighter';
    glow(g, glowSprite(WARM), L.fx * p, (L.fy - 2) * p, 132 * fl * p, 44 * fl * p, 0.3 * fl);
    // The tent's lantern.
    glow(g, glowSprite(GOLD), (L.fx - 94) * p, (L.fy - 21) * p, 24 * p, 18 * p, 0.35 + 0.08 * Math.sin(t * 3.1));
    g.globalCompositeOperation = 'source-over';

    // Shadows, cast away from the fire.
    // One knight stands behind the fire; two face each other across it; three make the full ring.
    const valid = heroes.filter((hero) => this.knight(hero.id, hero.mutation, SLOTS[0], 0, t, 1) !== null).slice(0, SLOTS.length);
    const order = valid.length === 2 ? [1, 2] : [0, 1, 2];
    const placed = valid.map((hero, i) => ({ hero, slot: SLOTS[order[i]] }));
    for (const { slot } of placed) {
      const kx = L.fx + slot.dx;
      const ky = L.fy + slot.dy;
      const ang = Math.atan2(ky - L.fy + 9, kx - L.fx);
      const len = (26 + 8 * fl) * p;
      g.save();
      g.translate(kx * p, ky * p);
      g.rotate(ang);
      g.globalAlpha = 0.5;
      g.drawImage(glowSprite(hex('#0a0614')), -3 * p, -6 * p, len, 12 * p);
      g.restore();
      g.globalAlpha = 0.6;
      g.drawImage(glowSprite(hex('#0a0614')), (kx - 13) * p, (ky - 4) * p, 26 * p, 8 * p);
      g.globalAlpha = 1;
    }

    // Back to front: the knight behind the fire, the fire, the knights either side.
    const rimSide = 1;
    const drawKnight = (i: number) => {
      const { hero, slot } = placed[i];
      const frame = Math.floor(t * 1.9 + slot.phase * 2) % 2;
      const k = this.knight(hero.id, hero.mutation, slot, frame, t, rimSide);
      if (!k) return;
      const x = L.fx + slot.dx - k.ax;
      const y = L.fy + slot.dy - k.ay;
      if (k.glow) {
        g.imageSmoothingEnabled = true;
        g.globalCompositeOperation = 'lighter';
        glow(g, glowSprite(k.glow), (L.fx + slot.dx) * p, (L.fy + slot.dy - 27) * p, 44 * p, 50 * p, 0.12 + 0.04 * Math.sin(t * 2 + i));
        g.globalCompositeOperation = 'source-over';
      }
      g.imageSmoothingEnabled = false;
      g.drawImage(k.dim, x * p, y * p, k.w * p, k.h * p);
      g.globalAlpha = clamp(0.35 + 0.65 * fl, 0, 1);
      g.drawImage(k.lit, x * p, y * p, k.w * p, k.h * p);
      g.globalAlpha = 1;
    };
    const behind = placed.length !== 2 && placed.length > 0;
    if (behind) drawKnight(0);

    const fi = Math.floor(t * 11) % S.fire.length;
    g.imageSmoothingEnabled = false;
    g.drawImage(S.fire[fi], (L.fx - Math.floor(FIRE_W / 2)) * p, (L.fy - FIRE_H + 3) * p, FIRE_W * p, FIRE_H * p);
    const ff = S.fireFront;
    g.drawImage(ff.c, ff.x * p, ff.y * p, ff.w * p, ff.h * p);

    for (let i = behind ? 1 : 0; i < placed.length; i++) drawKnight(i);

    // The fire's glow, embers and smoke.
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'lighter';
    glow(g, glowSprite(WARM), L.fx * p, (L.fy - 15) * p, 110 * fl * p, 98 * fl * p, 0.26 * fl);
    glow(g, glowSprite(GOLD), L.fx * p, (L.fy - 14) * p, 30 * p, 36 * p, 0.55 * fl);
    const ember = glowSprite(EMBER);
    for (let i = 0; i < 26; i++) {
      const life = 1.7 + (i % 7) * 0.33;
      const ph = (t / life + i * 0.6180339) % 1;
      const seedx = Math.sin(i * 12.9898) * 43758.5453;
      const rx = seedx - Math.floor(seedx);
      const x = L.fx + (rx - 0.5) * 18 + Math.sin(t * 1.7 + i) * 7 * ph + ph * ph * 24;
      const y = L.fy - 12 - ph * (54 + (i % 5) * 13);
      const a = Math.pow(1 - ph, 1.3) * (0.6 + 0.4 * Math.sin(t * 13 + i * 3));
      if (a < 0.05) continue;
      glow(g, ember, x * p, y * p, 4.5 * p, 4.5 * p, a * 0.5);
      g.fillStyle = ph < 0.35 ? `rgba(255,236,160,${a})` : ph < 0.7 ? `rgba(255,170,70,${a})` : `rgba(255,96,48,${a})`;
      g.fillRect(Math.round(x) * p, Math.round(y) * p, p, p);
    }
    g.globalCompositeOperation = 'source-over';
    const smoke = glowSprite(hex('#b88aa8'));
    for (let i = 0; i < 9; i++) {
      const ph = (t * 0.07 + i / 9) % 1;
      const x = L.fx + 3 + ph * ph * 60 + Math.sin(t * 0.5 + i * 2) * 4 * ph;
      const y = L.fy - 40 - ph * 130;
      const r = (7 + ph * 32) * p;
      g.globalAlpha = 0.16 * Math.sin(ph * Math.PI) * (1 - ph * 0.3);
      g.drawImage(smoke, x * p - r, y * p - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
  }

  private flies(g: Ctx, S: Built, t: number): void {
    const p = S.L.p;
    const sprite = glowSprite(FLY);
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'lighter';
    for (const f of S.flies) {
      const a = Math.max(0, Math.sin(t * f.blink + f.ph)) ** 2;
      if (a < 0.03) continue;
      const x = f.x + Math.sin(t * f.sx + f.ph) * f.ax + Math.sin(t * f.sx * 2.3 + f.ph * 3) * f.ax * 0.3;
      const y = f.y + Math.sin(t * f.sy + f.ph * 1.7) * f.ay;
      glow(g, sprite, x * p, y * p, 7 * p, 7 * p, a * 0.55);
      g.fillStyle = `rgba(250,255,200,${a.toFixed(3)})`;
      g.fillRect(Math.round(x) * p, Math.round(y) * p, p, p);
    }
    g.globalCompositeOperation = 'source-over';
  }
}

// ------------------------------------------------------------------ helpers

/** A glow sprite centered at (x, y), rx by ry (device pixels). */
function glow(g: Ctx, sprite: Canvas, x: number, y: number, rx: number, ry: number, a: number): void {
  if (a <= 0.003) return;
  g.globalAlpha = Math.min(1, a);
  g.drawImage(sprite, x - rx, y - ry, rx * 2, ry * 2);
  g.globalAlpha = 1;
}

function flicker(t: number): number {
  return 0.8 + 0.09 * Math.sin(t * 9.3) + 0.07 * Math.sin(t * 15.1 + 1.3) + 0.04 * Math.sin(t * 23.7 + 0.4);
}

function drawPix(g: Ctx, pix: Pix, x: number, y: number, scale: number, smooth = false): void {
  g.imageSmoothingEnabled = smooth;
  g.drawImage(pix.toCanvas(), x, y, pix.w * scale, pix.h * scale);
}

function sunPix(R: number): Pix {
  const s = 2 * R + 3;
  const p = new Pix(s, s);
  const c = R + 1.5;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / R;
      if (d > 1) continue;
      const low = (y + 0.5 - c) / R;
      let col = d < 0.8 ? '#fffdf4' : d < 0.93 ? '#fff6dc' : '#ffefc4';
      if (low > 0.5 && d >= 0.8) col = '#ffe8b8';
      p.set(x, y, hex(col));
    }
  }
  return p;
}

/** Half resolution (2 x 2 box average, premultiplied). */
function half(src: Pix): Pix {
  const out = new Pix(Math.ceil(src.w / 2), Math.ceil(src.h / 2));
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(src.w - 1, x * 2 + dx);
          const sy = Math.min(src.h - 1, y * 2 + dy);
          const i = (sy * src.w + sx) * 4;
          const al = src.d[i + 3];
          r += src.d[i] * al;
          g += src.d[i + 1] * al;
          b += src.d[i + 2] * al;
          a += al;
        }
      }
      const o = (y * out.w + x) * 4;
      if (a > 0) {
        out.d[o] = r / a;
        out.d[o + 1] = g / a;
        out.d[o + 2] = b / a;
      }
      out.d[o + 3] = a / 4;
    }
  }
  return out;
}

/** Bright parts of a sprite, blurred: the bloom drawn additively over it. */
function bloomOf(src: Pix, sigma: number, pad: number, threshold: number): Canvas {
  const b = padPix(src, pad);
  for (let i = 0; i < b.d.length; i += 4) {
    if (!b.d[i + 3]) continue;
    const l = luma([b.d[i], b.d[i + 1], b.d[i + 2]]);
    const k = clamp((l - threshold) / (1 - threshold), 0, 1);
    b.d[i + 3] = k * 255;
  }
  blurRGBA(b.d, b.w, b.h, sigma);
  return b.toCanvas();
}

function build(L: Layout): Built {
  const { p, W, H, w, h } = L;
  const r = rng(L.seed + 100);
  const G = ground(L);

  // --- The sky (device resolution, down to the lake).
  const skyRows = Math.min(h, Math.ceil((L.shoreY + 2) * p));
  const sky = canvas(w, skyRows);
  const sg = ctx2d(sky);
  const grad = sg.createLinearGradient(0, 0, 0, L.hy * p);
  for (const [at, col] of SKY) if (at <= 1) grad.addColorStop(at, col);
  sg.fillStyle = grad;
  sg.fillRect(0, 0, w, skyRows);
  // The glow of the low sun, spread along the horizon.
  sg.globalCompositeOperation = 'screen';
  const halo = (rx: number, ry: number, stops: ReadonlyArray<readonly [number, string]>) => {
    sg.save();
    sg.translate(L.sunX * p, L.sunY * p);
    sg.scale(rx / ry, 1);
    const gr = sg.createRadialGradient(0, 0, 0, 0, 0, ry);
    for (const [at, c] of stops) gr.addColorStop(at, c);
    sg.fillStyle = gr;
    sg.fillRect(-ry, -ry, ry * 2, ry * 2);
    sg.restore();
  };
  halo(W * 0.75 * p, L.hy * 0.85 * p, [
    [0, 'rgba(255,214,150,0.62)'],
    [0.22, 'rgba(255,170,120,0.36)'],
    [0.55, 'rgba(240,110,130,0.14)'],
    [1, 'rgba(200,80,130,0)'],
  ]);
  halo(L.sunR * 6 * p, L.sunR * 4.2 * p, [
    [0, 'rgba(255,252,232,0.95)'],
    [0.28, 'rgba(255,236,180,0.55)'],
    [1, 'rgba(255,200,130,0)'],
  ]);
  sg.globalCompositeOperation = 'source-over';
  const sun = sunPix(L.sunR);
  drawPix(sg, sun, (L.sunX - L.sunR - 1.5) * p, (L.sunY - L.sunR - 1.5) * p, p);
  // Thin cloud lines across the lower sun.
  for (const [dy, len, thick, col] of [
    [0.38, 3.4, 2, '#ffb48c'],
    [0.66, 2.6, 1, '#ff9c8a'],
    [0.12, 1.6, 1, '#ffd2a2'],
  ] as const) {
    const sp = streak(L.sunR * len, thick + 1, Math.round(dy * 100) + L.seed, 0.95, hex(col));
    drawPix(sg, sp, Math.round(L.sunX - (L.sunR * len) / 2 + (dy - 0.4) * L.sunR) * p, Math.round(L.sunY + dy * L.sunR - 2) * p, p);
  }

  // --- Clouds (drifting sprites with a bloom on their lit edges).
  const clouds: Drifter[] = [];
  const addCloud = (kind: CloudKind, cx: number, bottom: number, cw: number, chh: number, speed: number, seed: number) => {
    const y = bottom - chh;
    const side = Math.sign(L.sunX - cx) || 1;
    const sideK = clamp(Math.abs(L.sunX - cx) / (L.W * 0.45), 0, 1);
    const v = clamp((bottom - chh * 0.4) / L.hy, 0, 1);
    const near = clamp(1 - Math.hypot((cx - L.sunX) / (L.W * 0.5), (bottom - L.sunY) / L.hy), 0, 1);
    const pix = cumulus({ w: cw, h: chh, seed, kind, side, sideK, haze: skyAt(v), hazeK: 0.18 + v * 0.22, gain: 1.0 + near * 0.18 });
    const pad = 10;
    clouds.push({ c: pix.toCanvas(), bloom: bloomOf(pix, 4.5, pad, 0.62), pad, x0: cx - pix.w / 2, y, w: pix.w, h: pix.h, speed });
  };
  const ww = L.winW;
  const cloudBottomMax = L.hy * 0.6;
  const towerH = clamp(L.hy * 0.56, 30, 140);
  addCloud('tower', L.winX0 + ww * 0.25, cloudBottomMax, clamp(Math.min(ww * 0.46, towerH * 2.1), 80, 260), towerH, 0.12, 11);
  addCloud('bank', L.sunX + ww * 0.02, L.hy * 0.4, clamp(ww * 0.3, 60, 170), clamp(L.hy * 0.19, 12, 44), 0.2, 12);
  addCloud('puff', L.winX0 + ww * 0.6, L.hy * 0.24, clamp(ww * 0.14, 30, 80), clamp(L.hy * 0.12, 10, 30), 0.27, 13);
  addCloud('puff', L.winX0 + ww * 0.03, L.hy * 0.52, clamp(ww * 0.12, 26, 70), clamp(L.hy * 0.1, 9, 26), 0.16, 14);
  if (L.winX1 < W - 40) addCloud('bank', L.winX1 + (W - L.winX1) * 0.5, L.hy * 0.5, clamp((W - L.winX1) * 0.6, 60, 200), clamp(L.hy * 0.22, 12, 48), 0.18, 15);
  const streaksBack: Drifter[] = [];
  const streaksFront: Drifter[] = [];
  // High, thin cirrus lines.
  for (let i = 0; i < 4; i++) {
    const v = 0.08 + r() * 0.24;
    const len = clamp(ww * (0.1 + r() * 0.2), 24, 140);
    const sp = streak(len, 2 + Math.floor(r() * 2), 200 + i, v, skyAt(v));
    streaksBack.push({ c: sp.toCanvas(), bloom: null, pad: 0, x0: r() * W, y: v * L.hy, w: sp.w, h: sp.h, speed: 0.3 + r() * 0.3 });
  }
  // Lower down, long flat stratus lit from beneath.
  for (let i = 0; i < 6; i++) {
    const v = 0.36 + r() * 0.42;
    const len = clamp(ww * (0.12 + r() * 0.22), 34, 170);
    const sh = clamp(len * (0.07 + r() * 0.03), 6, 13);
    const cx = r() * W;
    const side = Math.sign(L.sunX - cx) || 1;
    const pix = cumulus({ w: len, h: sh, seed: 300 + i, kind: 'stratus', side, sideK: 0.7, haze: skyAt(v), hazeK: 0.3, gain: 1.05 + clamp(v - 0.5, 0, 0.3) * 0.5 });
    streaksFront.push({ c: pix.toCanvas(), bloom: null, pad: 0, x0: cx - pix.w / 2, y: v * L.hy - sh, w: pix.w, h: pix.h, speed: 0.22 + r() * 0.3 });
  }

  // --- Far and middle distance, blurred and crisp, into one device-res band.
  const far = paintFar(L);
  const mid = paintMid(L);
  const fmTop = Math.max(0, Math.min(firstRow(far), mid.top) - 4);
  const fmBot = L.shoreY + 4;
  const farMid = canvas(w, (fmBot - fmTop) * p);
  const fg = ctx2d(farMid);
  const farBand = crop(far, 0, fmTop, W, fmBot - fmTop);
  const fb = blurred(farBand, 0.6, 1);
  fg.imageSmoothingEnabled = true;
  fg.drawImage(fb.toCanvas(), 0, 0, W * p, (fmBot - fmTop) * p);
  // Haze between the mountains and the castle hill.
  const hz = fg.createLinearGradient(0, (L.hy - L.hy * 0.25 - fmTop) * p, 0, (L.shoreY + 3 - fmTop) * p);
  hz.addColorStop(0, 'rgba(255,200,160,0)');
  hz.addColorStop(0.7, 'rgba(255,196,150,0.32)');
  hz.addColorStop(1, 'rgba(255,214,170,0.5)');
  fg.globalCompositeOperation = 'source-atop';
  fg.fillStyle = hz;
  fg.fillRect(0, 0, w, farMid.height);
  fg.globalCompositeOperation = 'source-over';
  drawPix(fg, crop(mid.pix, 0, fmTop, W, fmBot - fmTop), 0, 0, p);

  // --- The lake.
  const lakeM = 6;
  const lake = paintLake(L, far, mid.pix, lakeM);

  // --- Near: forests, meadow, cliff, camp; the foreground softened (depth of field).
  const nearPix = paintNear(L, G);
  paintCamp(nearPix, L, G);
  const nearY = Math.max(0, firstRow(nearPix) - 1);
  const near = canvas(w, Math.max(1, (H - nearY) * p));
  const ng = ctx2d(near);
  drawPix(ng, crop(nearPix, 0, nearY, W, H - nearY), 0, 0, p);
  const dofY = L.fy + 24;
  if (dofY < H - 6) {
    // Blurred at half resolution (it is soft anyway), faded in below the camp.
    const pad = 8;
    const region = half(crop(nearPix, 0, dofY - pad, W, H - dofY + pad));
    blurRGBA(region.d, region.w, region.h, 0.8, true);
    const mc = canvas(w, (H - dofY + pad) * p);
    const mg = ctx2d(mc);
    mg.imageSmoothingEnabled = true;
    mg.drawImage(region.toCanvas(), 0, 0, W * p, (H - dofY + pad) * p);
    mg.globalCompositeOperation = 'destination-in';
    const gr = mg.createLinearGradient(0, pad * p, 0, (pad + 80) * p);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,1)');
    mg.fillStyle = gr;
    mg.fillRect(0, 0, mc.width, mc.height);
    ng.drawImage(mc, 0, (dofY - pad - nearY) * p);
  }

  // --- Out-of-focus framing.
  const fronts = paintFront(L).map((f) => {
    const pad = Math.ceil(f.sigma * 3);
    const b = padPix(f.pix, pad);
    blurRGBA(b.d, b.w, b.h, f.sigma);
    return { c: b.toCanvas(), x: f.x - pad, y: f.y - pad, w: b.w, h: b.h };
  });

  // --- Mist drifting over the far shore and over the near forest.
  const mists: Mist[] = [];
  const mh1 = Math.round(clamp((L.lakeBot - L.hy) * 0.5, 8, 24));
  mists.push({ c: mistStrip(W, mh1, hex('#ffc8a6'), L.seed + 91, 0.8).toCanvas(), y: L.shoreY - mh1 * 0.22, h: mh1, speed: 0.9, alpha: 0.3 });
  const mh2 = Math.round(clamp((L.backY - L.lakeBot) * 0.8, 10, 36));
  mists.push({ c: mistStrip(W, mh2, hex('#b884b4'), L.seed + 92, 1.2).toCanvas(), y: L.lakeBot - mh2 * 0.25, h: mh2, speed: -1.4, alpha: 0.32 });
  const mh3 = Math.round(clamp(H * 0.08, 18, 50));
  const lowMists: Mist[] = [
    { c: mistStrip(W, mh3, hex('#c88ab8'), L.seed + 93, 0.45).toCanvas(), y: G.frontAt(L.fx) + 34, h: mh3, speed: 1.1, alpha: 0.38 },
    { c: mistStrip(W, Math.round(mh3 * 1.3), hex('#a070b0'), L.seed + 94, 0.4).toCanvas(), y: G.frontAt(L.fx) + 34 + mh3 * 1.5, h: Math.round(mh3 * 1.3), speed: -0.7, alpha: 0.28 },
  ];

  // --- Light shafts from the sun (low res, blurred).
  const rs = 4;
  const rays = new Pix(Math.ceil(W / rs), Math.ceil(H / rs));
  {
    const rc = rays.toCanvas();
    const rg = ctx2d(rc);
    rg.globalCompositeOperation = 'lighter';
    const cx = L.sunX / rs;
    const cy = L.sunY / rs;
    const len = Math.hypot(W, H) / rs;
    for (let i = 0; i < 18; i++) {
      const ang = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.5;
      const wd = 0.015 + r() * 0.04;
      const a = 0.07 + r() * 0.12;
      const gr = rg.createRadialGradient(cx, cy, 0, cx, cy, len * (0.35 + r() * 0.5));
      gr.addColorStop(0, `rgba(255,226,180,${a})`);
      gr.addColorStop(0.5, `rgba(255,190,150,${a * 0.4})`);
      gr.addColorStop(1, 'rgba(255,170,140,0)');
      rg.fillStyle = gr;
      rg.beginPath();
      rg.moveTo(cx, cy);
      rg.arc(cx, cy, len, ang - wd, ang + wd);
      rg.closePath();
      rg.fill();
    }
    const img = rg.getImageData(0, 0, rc.width, rc.height);
    rays.d.set(img.data);
    blurRGBA(rays.d, rays.w, rays.h, 1.3);
  }

  // --- Vignette and grade (low res, scaled up smooth).
  const vs = 4;
  const vig = canvas(Math.ceil(w / vs), Math.ceil(h / vs));
  {
    const vg = ctx2d(vig);
    const vw = vig.width;
    const vh = vig.height;
    const cx = ((L.fx * 0.55 + L.sunX * 0.45) * p) / vs;
    const cy = (L.hy * 0.9 * p) / vs;
    const R = Math.hypot(vw, vh);
    const gr = vg.createRadialGradient(cx, cy, R * 0.18, cx, cy, R * 0.82);
    gr.addColorStop(0, 'rgba(14,8,40,0)');
    gr.addColorStop(0.55, 'rgba(12,8,40,0.18)');
    gr.addColorStop(1, 'rgba(8,6,30,0.62)');
    vg.fillStyle = gr;
    vg.fillRect(0, 0, vw, vh);
    const top = vg.createLinearGradient(0, 0, 0, (L.hy * 0.5 * p) / vs);
    top.addColorStop(0, 'rgba(6,10,44,0.38)');
    top.addColorStop(1, 'rgba(6,10,44,0)');
    vg.fillStyle = top;
    vg.fillRect(0, 0, vw, vh);
    const bot = vg.createLinearGradient(0, ((L.fy + 30) * p) / vs, 0, vh);
    bot.addColorStop(0, 'rgba(8,4,22,0)');
    bot.addColorStop(1, 'rgba(8,4,22,0.55)');
    vg.fillStyle = bot;
    vg.fillRect(0, 0, vw, vh);
  }

  // --- Twinkles, glints and fireflies.
  const stars: Built['stars'] = [];
  for (let i = 0; i < Math.round(W * 0.1); i++) {
    const y = Math.pow(r(), 1.5) * L.hy * 0.42;
    stars.push({ x: r() * W, y, b: (0.25 + r() * 0.75) * (1 - y / (L.hy * 0.45)), s: 0.8 + r() * 2.2, ph: r() * 6.28 });
  }
  const glints: Built['glints'] = [];
  const lakeVis = L.lakeBot - L.shoreY;
  for (let i = 0; i < 70; i++) {
    const yy = Math.floor(Math.pow(r(), 1.5) * lakeVis);
    const spread = L.sunR * 0.7 + yy * 0.55;
    const gx = (r() + r() + r() - 1.5) * spread;
    glints.push({ x: L.sunX + gx, y: L.shoreY + yy, len: 1 + Math.floor(r() * (2 + yy * 0.12)), s: 1.2 + r() * 2.6, ph: r() * 6.28, b: clamp(1 - Math.abs(gx) / (spread * 1.6), 0.15, 1) });
  }
  // Glints down the river too, where it shows beside the ledge.
  const rp = riverPath(L);
  for (let i = 0; i < 40; i++) {
    const [cx, y, hw] = rp[Math.floor(Math.pow(r(), 0.8) * (rp.length - 1))];
    if (G.inMeadow(Math.round(cx), y) || y > L.H * 0.97) continue;
    glints.push({ x: cx + (r() - 0.5) * hw * 1.4, y, len: 1 + Math.floor(r() * (1 + hw * 0.3)), s: 1 + r() * 2, ph: r() * 6.28, b: 0.5 });
  }
  const flies: Built['flies'] = [];
  for (let i = 0; i < 18; i++) {
    const x = L.winX0 + r() * L.winW;
    const y = L.backY - 26 + r() * 70;
    flies.push({ x, y, ax: 6 + r() * 16, ay: 4 + r() * 9, sx: 0.12 + r() * 0.3, sy: 0.15 + r() * 0.35, ph: r() * 6.28, blink: 0.5 + r() * 1.1 });
  }

  const ffr = fireFront(L);
  return {
    L,
    sky,
    farMid,
    farMidY: fmTop,
    clouds,
    streaksBack,
    streaksFront,
    lake: lake.toCanvas(),
    lakeM,
    lakeH: lake.h,
    near,
    nearY,
    fronts,
    mists,
    lowMists,
    rays: rays.toCanvas(),
    vignette: vig,
    glows: mid.glows,
    stars,
    glints,
    flies,
    fire: fireFrames().map((f) => f.toCanvas()),
    fireFront: { c: ffr.pix.toCanvas(), x: ffr.x, y: ffr.y, w: ffr.pix.w, h: ffr.pix.h },
  };
}
