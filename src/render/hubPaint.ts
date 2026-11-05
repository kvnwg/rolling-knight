/**
 * Draws the painted hub (src/world/hub.ts, hubScene()): its ground, the standing pieces and glowing
 * windows y-sorted with the characters, the keepers and regulars in their poses, the leaves framing
 * the front, its lights and the motes drifting in them (fireflies by the leaves, warm dust in the shop
 * light, sparks at the forge).
 *
 * Glows live on the emissive layer, which is composited over everything. So anything drawn in front of
 * a glow clears it underneath (destination-out): a knight walking past a lit window covers the window
 * instead of the window shining through the knight.
 */
import { hubScene, type HubFigure, type HubScene, type HubStation } from '../world/hub';
import { toCanvas } from './art/draw';
import { keeperFrame } from './art/hubNpcs';
import type { Light } from './lighting';
import { flipX, type PixelBuf } from './pixel/buf';

type Ctx = CanvasRenderingContext2D;

interface Glow {
  x: number;
  y: number;
  sort: number;
  frames: HTMLCanvasElement[];
  fps: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: 'firefly' | 'mote' | 'ember' | 'spark';
  color: string;
  phase: number;
}

/** A standing thing in the sorted pass. */
export interface HubItem {
  y: number;
  draw: () => void;
}

const MOTE_LIFE: Record<Mote['kind'], [number, number]> = { firefly: [3, 6], mote: [3, 5], ember: [0.8, 1.6], spark: [0.3, 0.7] };

export class HubPaint {
  readonly scene: HubScene;
  private ground: HTMLCanvasElement;
  private sprites: Array<{ x: number; y: number; sort: number; c: HTMLCanvasElement }>;
  private glows: Glow[];
  private fore: Array<{ x: number; y: number; c: HTMLCanvasElement }>;
  private figures = new Map<string, { c: HTMLCanvasElement; glow: HTMLCanvasElement | null; ax: number; ay: number }>();
  private motes: Mote[] = [];
  private spawnT: number[] = [];

  constructor() {
    const s = hubScene();
    this.scene = s;
    this.ground = toCanvas(s.ground);
    this.sprites = s.sprites.map((p) => ({ x: p.x - p.ax, y: p.y - p.ay, sort: p.y, c: toCanvas(p.buf) }));
    this.glows = s.emissive.map((g) => ({ x: g.x, y: g.y, sort: g.sort, frames: (g.frames?.length ? g.frames : [g.buf]).map(toCanvas), fps: g.fps ?? 0 }));
    this.fore = s.fore.map((f) => ({ x: f.x, y: f.y, c: toCanvas(f.buf) }));
    this.spawnT = s.ambient.motes.map(() => 0);
  }

  /** The ground under the view at (cx, cy), w x h; the dark round the art's edges. */
  drawGround(g: Ctx, cx: number, cy: number, w: number, h: number): void {
    g.fillStyle = this.scene.bg;
    g.fillRect(0, 0, w, h);
    const x0 = Math.max(0, cx);
    const y0 = Math.max(0, cy);
    const x1 = Math.min(this.scene.w, cx + w);
    const y1 = Math.min(this.scene.h, cy + h);
    if (x1 > x0 && y1 > y0) g.drawImage(this.ground, x0, y0, x1 - x0, y1 - y0, x0 - cx, y0 - cy, x1 - x0, y1 - y0);
  }

  /** Clears the glow layer under what was just drawn in front of it. */
  private mask(em: Ctx, c: CanvasImageSource, x: number, y: number): void {
    em.globalCompositeOperation = 'destination-out';
    em.drawImage(c, x, y);
    em.globalCompositeOperation = 'source-over';
  }

  /**
   * The hub's pieces for the sorted pass: buildings, stalls, lamps and plants (each clearing the glow
   * behind it), the glows themselves, and the regulars.
   */
  items(st: Ctx, em: Ctx, cx: number, cy: number, w: number, h: number, time: number): HubItem[] {
    const out: HubItem[] = [];
    const inView = (x: number, y: number, c: { width: number; height: number }) => x + c.width > cx && x < cx + w && y + c.height > cy && y < cy + h;
    for (const p of this.sprites) {
      if (!inView(p.x, p.y, p.c)) continue;
      out.push({
        y: p.sort,
        draw: () => {
          st.drawImage(p.c, p.x - cx, p.y - cy);
          this.mask(em, p.c, p.x - cx, p.y - cy);
        },
      });
    }
    for (const g of this.glows) {
      // (The clock can start a hair below zero: keep the frame index positive.)
      const n = g.frames.length;
      const c = g.frames[g.fps > 0 ? ((Math.floor(time * g.fps) % n) + n) % n : 0];
      if (!inView(g.x, g.y, c)) continue;
      // Just after its piece, so the piece's own mask doesn't clear it.
      out.push({ y: g.sort + 0.01, draw: () => em.drawImage(c, g.x - cx, g.y - cy) });
    }
    for (const f of this.scene.extras) {
      out.push({ y: f.y, draw: () => this.drawFigure(st, em, f, f.x - cx, f.y - cy, time) });
    }
    return out;
  }

  /** A keeper or a regular, in their pose, breathing; clears the glow behind them. */
  drawFigure(st: Ctx, em: Ctx, f: HubFigure | HubStation, x: number, y: number, time: number): void {
    if (!f.def) return;
    const frame = ((Math.floor(time * 4 + f.x * 0.37) % 8) + 8) % 8;
    const flip = f.view === 'side' && f.dir < 0;
    const key = `${f.def.id}|${f.pose}|${f.view}|${f.tool ?? ''}|${frame}|${flip ? 1 : 0}`;
    let fig = this.figures.get(key);
    if (!fig) {
      const fr = keeperFrame(f.def, f.pose, f.view, frame, f.tool);
      const flipBuf = (b: PixelBuf) => (flip ? flipX(b) : b);
      fig = { c: toCanvas(flipBuf(fr.buf)), glow: fr.glow ? toCanvas(flipBuf(fr.glow)) : null, ax: flip ? fr.buf.w - 1 - fr.ax : fr.ax, ay: fr.ay };
      this.figures.set(key, fig);
    }
    st.drawImage(fig.c, x - fig.ax, y - fig.ay);
    this.mask(em, fig.c, x - fig.ax, y - fig.ay);
    if (fig.glow) em.drawImage(fig.glow, x - fig.ax, y - fig.ay);
  }

  /** The leaves framing the front, over everything (lit with the rest). */
  drawFore(st: Ctx, em: Ctx, cx: number, cy: number, w: number, h: number): void {
    for (const f of this.fore) {
      if (f.x + f.c.width < cx || f.x > cx + w || f.y + f.c.height < cy || f.y > cy + h) continue;
      st.drawImage(f.c, f.x - cx, f.y - cy);
      this.mask(em, f.c, f.x - cx, f.y - cy);
    }
  }

  /** The hub's lights in view (view pixels), fires flickering. */
  lights(cx: number, cy: number, w: number, h: number, time: number): Light[] {
    const out: Light[] = [];
    for (const l of this.scene.lights) {
      if (l.x < cx - l.r || l.x > cx + w + l.r || l.y < cy - l.r || l.y > cy + h + l.r) continue;
      const fl = l.flicker ? 1 - l.flicker * 0.18 * (0.5 + 0.5 * Math.sin(time * 9 + l.x) * Math.sin(time * 13.7 + l.y)) : 1;
      out.push({ x: l.x - cx, y: l.y - cy, r: l.r, color: l.color, intensity: l.intensity * fl, bloom: l.intensity > 0.6 });
    }
    // The motes that glow.
    for (const m of this.motes) {
      if (m.kind !== 'firefly' || m.x < cx - 10 || m.x > cx + w + 10 || m.y < cy - 10 || m.y > cy + h + 10) continue;
      const blink = 0.5 + 0.5 * Math.sin(time * 3 + m.phase);
      if (blink > 0.5) out.push({ x: m.x - cx, y: m.y - cy, r: 10, color: m.color, intensity: 0.4 * blink });
    }
    return out;
  }

  /** Moves the motes on, keeping each spot topped up to its count. */
  updateMotes(dt: number): void {
    const spots = this.scene.ambient.motes;
    spots.forEach((s, i) => {
      const [lo, hi] = MOTE_LIFE[s.kind];
      const rate = s.count / ((lo + hi) / 2);
      this.spawnT[i] += dt * rate;
      while (this.spawnT[i] >= 1) {
        this.spawnT[i] -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random());
        const life = lo + Math.random() * (hi - lo);
        const up = s.kind === 'ember' ? -14 - Math.random() * 12 : s.kind === 'spark' ? -30 - Math.random() * 30 : -2 + Math.random() * 4;
        const side = s.kind === 'spark' ? (Math.random() - 0.5) * 40 : (Math.random() - 0.5) * 6;
        this.motes.push({ x: s.x + Math.cos(a) * s.rx * r, y: s.y + Math.sin(a) * s.ry * r, vx: side, vy: up, life, max: life, kind: s.kind, color: s.color, phase: Math.random() * 6.28 });
      }
    });
    for (const m of this.motes) {
      m.life -= dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.kind === 'firefly' || m.kind === 'mote') {
        m.vx += Math.sin(m.life * 2 + m.phase) * 8 * dt;
        m.vy += Math.cos(m.life * 1.7 + m.phase) * 5 * dt;
      } else if (m.kind === 'spark') m.vy += 60 * dt;
    }
    this.motes = this.motes.filter((m) => m.life > 0);
    if (this.motes.length > 400) this.motes.splice(0, this.motes.length - 400);
  }

  /** The motes, on the glow layer. */
  drawMotes(em: Ctx, cx: number, cy: number, w: number, h: number, time: number): void {
    for (const m of this.motes) {
      const x = Math.round(m.x) - cx;
      const y = Math.round(m.y) - cy;
      if (x < -2 || y < -2 || x > w + 2 || y > h + 2) continue;
      const fade = Math.min(1, (m.life / m.max) * 3, ((m.max - m.life) / m.max) * 6);
      em.globalAlpha = m.kind === 'firefly' ? fade * (0.35 + 0.65 * Math.max(0, Math.sin(time * 3 + m.phase))) : fade * (m.kind === 'mote' ? 0.6 : 1);
      em.fillStyle = m.color;
      em.fillRect(x, y, 1, 1);
    }
    em.globalAlpha = 1;
  }
}
