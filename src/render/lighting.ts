/**
 * Cinematic light. The finished scene is multiplied by a light map: the biome's ambient color (cool
 * and dim at night, warm in daylight) plus every light (torches, lanterns, lava, crystals, spells,
 * the knights' own glow), each a disc of stepped bands so it stays crisp pixel art. Then the
 * brightest lights bloom (added on top), the view is graded (a warm or cool tint over the top, a deep
 * shade over the bottom) and vignetted. All of it at the art resolution, so every step is a whole art
 * pixel.
 */
import { rgb } from './pixel/buf';
import { makeCanvas } from './art/draw';

export interface Light {
  x: number;
  y: number;
  r: number;
  color: string;
  /** 0..1.5 */
  intensity: number;
  /** Add a bloom on top (bright sources: fire, lava, magic). */
  bloom?: boolean;
}

type Ctx = CanvasRenderingContext2D;

const spriteCache = new Map<string, HTMLCanvasElement>();

/** A light's disc: stepped bands of its color falling off to black (it's added to the light map). */
function lightSprite(color: string, r: number, bands: number): HTMLCanvasElement {
  const R = Math.max(2, Math.round(r));
  const key = `${color}|${R}|${bands}`;
  let c = spriteCache.get(key);
  if (c) return c;
  c = makeCanvas(R * 2, R * 2) as HTMLCanvasElement;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(R * 2, R * 2);
  const [cr, cg, cb] = rgb(color);
  for (let y = 0; y < R * 2; y++) {
    for (let x = 0; x < R * 2; x++) {
      const d = Math.hypot(x + 0.5 - R, (y + 0.5 - R) * 1.25) / R;
      if (d >= 1) continue;
      // Smooth falloff, stepped into bands.
      const f = Math.pow(1 - d, 1.6);
      const q = Math.ceil(f * bands) / bands;
      const i = (y * R * 2 + x) * 4;
      img.data[i] = cr * q;
      img.data[i + 1] = cg * q;
      img.data[i + 2] = cb * q;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  spriteCache.set(key, c);
  if (spriteCache.size > 400) spriteCache.delete(spriteCache.keys().next().value!);
  return c;
}

const smoothCache = new Map<string, HTMLCanvasElement>();

/** A light's disc for the shader path: a smooth falloff (the screen-resolution pass keeps it smooth). */
function smoothSprite(color: string, r: number): HTMLCanvasElement {
  const R = Math.max(2, Math.round(r));
  const key = `${color}|${R}`;
  let c = smoothCache.get(key);
  if (c) return c;
  c = makeCanvas(R * 2, R * 2) as HTMLCanvasElement;
  const ctx = c.getContext('2d')!;
  const [cr, cg, cb] = rgb(color);
  const g = ctx.createRadialGradient(R, R, 0, R, R, R);
  // Half strength (the shader doubles the light map so lights can push past white).
  for (const [t, a] of [[0, 0.5], [0.25, 0.36], [0.5, 0.18], [0.75, 0.06], [1, 0]] as const) {
    g.addColorStop(t, `rgba(${cr},${cg},${cb},${a * 2})`);
  }
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(R, R);
  ctx.scale(1, 0.8);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.restore();
  ctx.fill();
  smoothCache.set(key, c);
  if (smoothCache.size > 400) smoothCache.delete(smoothCache.keys().next().value!);
  return c;
}

export class Lighting {
  /**
   * The light map for the shader path, at half strength: the ambient color halved, every light added
   * on top with a smooth falloff. The shader doubles it, so where lights stack the scene over-brightens.
   */
  drawMap(m: CanvasRenderingContext2D, ambient: string, lights: Light[]): void {
    const [r, g, b] = rgb(ambient);
    m.globalCompositeOperation = 'source-over';
    m.globalAlpha = 1;
    m.fillStyle = `rgb(${r >> 1},${g >> 1},${b >> 1})`;
    m.fillRect(0, 0, this.w, this.h);
    m.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (l.x < -l.r || l.y < -l.r || l.x > this.w + l.r || l.y > this.h + l.r) continue;
      const s = smoothSprite(l.color, l.r);
      m.globalAlpha = Math.min(1, l.intensity);
      m.drawImage(s, Math.round(l.x - s.width / 2), Math.round(l.y - s.height / 2));
    }
    m.globalAlpha = 1;
    m.globalCompositeOperation = 'source-over';
  }

  private map: HTMLCanvasElement;
  private mctx: Ctx;
  private grade: HTMLCanvasElement | null = null;
  private gradeKey = '';

  constructor(public w: number, public h: number) {
    this.map = makeCanvas(w, h) as HTMLCanvasElement;
    this.mctx = this.map.getContext('2d')!;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.map.width = w;
    this.map.height = h;
    this.grade = null;
  }

  /** Applies the light map to `ctx` (already holding the scene). Lights are in view pixels. */
  apply(ctx: Ctx, ambient: string, lights: Light[], opts: { gradeTop: string; gradeBottom: string; vignette: number; flash?: number }): void {
    const m = this.mctx;
    m.globalCompositeOperation = 'source-over';
    m.globalAlpha = 1;
    m.fillStyle = ambient;
    m.fillRect(0, 0, this.w, this.h);
    m.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (l.x < -l.r || l.y < -l.r || l.x > this.w + l.r || l.y > this.h + l.r) continue;
      m.globalAlpha = Math.min(1, l.intensity);
      const s = lightSprite(l.color, l.r, 6);
      m.drawImage(s, Math.round(l.x - s.width / 2), Math.round(l.y - s.height / 2));
    }
    m.globalAlpha = 1;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.map, 0, 0);
    // Bloom: bright sources spill their color over what's around them.
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (!l.bloom) continue;
      if (l.x < -l.r || l.y < -l.r || l.x > this.w + l.r || l.y > this.h + l.r) continue;
      ctx.globalAlpha = 0.22 * Math.min(1.2, l.intensity);
      const s = lightSprite(l.color, l.r * 0.55, 4);
      ctx.drawImage(s, Math.round(l.x - s.width / 2), Math.round(l.y - s.height / 2));
    }
    ctx.globalAlpha = 1;
    // Grade and vignette.
    const key = `${opts.gradeTop}|${opts.gradeBottom}|${opts.vignette}|${this.w}x${this.h}`;
    if (!this.grade || this.gradeKey !== key) {
      this.grade = this.buildGrade(opts.gradeTop, opts.gradeBottom, opts.vignette);
      this.gradeKey = key;
    }
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(this.grade, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.vignette(opts.vignette), 0, 0);
    if (opts.flash && opts.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, opts.flash);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.restore();
  }

  private buildGrade(top: string, bottom: string, _v: number): HTMLCanvasElement {
    const c = makeCanvas(this.w, this.h) as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    // Stepped, not smooth: 8 bands from the top tint to the bottom tint.
    const [r1, g1, b1] = rgb(top);
    const [r2, g2, b2] = rgb(bottom);
    const bands = 8;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      ctx.fillStyle = `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
      ctx.fillRect(0, Math.floor((i * this.h) / bands), this.w, Math.ceil(this.h / bands) + 1);
    }
    return c;
  }

  private vig: HTMLCanvasElement | null = null;
  private vigKey = '';
  private vignette(strength: number): HTMLCanvasElement {
    const key = `${strength}|${this.w}x${this.h}`;
    if (this.vig && this.vigKey === key) return this.vig;
    const c = makeCanvas(this.w, this.h) as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    const cx = this.w / 2;
    const cy = this.h / 2;
    const R = Math.hypot(cx, cy);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const d = Math.hypot((x - cx) * 1.1, (y - cy) * 0.95) / R;
      const v = 1 - strength * Math.max(0, d - 0.45) * 1.6;
      const q = Math.round(Math.max(0, v) * 12) / 12;
      const i = (y * this.w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(q * 255);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.vig = c;
    this.vigKey = key;
    return c;
  }
}
