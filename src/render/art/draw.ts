/**
 * Small drawing helpers on PixelBufs (1 art pixel = 1 buffer pixel), shared by every art module, and
 * the bridge to canvases. Light comes from the top left.
 */
import { blank, rgb, type PixelBuf } from '../pixel/buf';

export type { PixelBuf };

export function setRGB(b: PixelBuf, x: number, y: number, hex: string, a = 255): void {
  x |= 0;
  y |= 0;
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const [r, g, bl] = rgb(hex);
  const i = (y * b.w + x) * 4;
  b.px[i] = r;
  b.px[i + 1] = g;
  b.px[i + 2] = bl;
  b.px[i + 3] = a;
}

export function getA(b: PixelBuf, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return 0;
  return b.px[(y * b.w + x) * 4 + 3];
}

export function rect(b: PixelBuf, x: number, y: number, w: number, h: number, hex: string): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setRGB(b, xx, yy, hex);
}

/**
 * A filled ellipse shaded like a lit ball: `ramp` dark to light, brightest toward the top left.
 * `flat` (0..1) flattens the shading toward the middle tone.
 */
export function ball(b: PixelBuf, cx: number, cy: number, rx: number, ry: number, ramp: readonly string[], flat = 0): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      // Light from the top left: brighter where the surface faces it.
      const lit = (-dx * 0.55 - dy * 0.75 + 0.35 * (1 - d)) * (1 - flat);
      const k = Math.max(0, Math.min(ramp.length - 1, Math.round((ramp.length - 1) * (0.5 + lit * 0.62))));
      setRGB(b, x, y, ramp[k]);
    }
  }
}

export function line(b: PixelBuf, x0: number, y0: number, x1: number, y1: number, hex: string): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - x);
  const dy = -Math.abs(ty - y);
  const sx = x < tx ? 1 : -1;
  const sy = y < ty ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 400; guard++) {
    setRGB(b, x, y, hex);
    if (x === tx && y === ty) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** A 1-pixel outline around everything opaque (4-neighbors), in `hex`. */
export function inkOutline(b: PixelBuf, hex: string): PixelBuf {
  const out = blank(b.w + 2, b.h + 2);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const i = (y * b.w + x) * 4;
    if (!b.px[i + 3]) continue;
    const j = ((y + 1) * out.w + x + 1) * 4;
    out.px[j] = b.px[i];
    out.px[j + 1] = b.px[i + 1];
    out.px[j + 2] = b.px[i + 2];
    out.px[j + 3] = b.px[i + 3];
  }
  const [r, g, bl] = rgb(hex);
  const src = out.px.slice();
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const i = (y * out.w + x) * 4;
    if (src[i + 3]) continue;
    const n = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < out.w && yy < out.h && src[(yy * out.w + xx) * 4 + 3] > 0;
    if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) {
      out.px[i] = r;
      out.px[i + 1] = g;
      out.px[i + 2] = bl;
      out.px[i + 3] = 255;
    }
  }
  return out;
}

/** A white silhouette (the hit flash). */
export function flash(b: PixelBuf, hex = '#ffffff'): PixelBuf {
  const out = blank(b.w, b.h);
  const [r, g, bl] = rgb(hex);
  for (let i = 0; i < b.px.length; i += 4) {
    if (!b.px[i + 3]) continue;
    out.px[i] = r;
    out.px[i + 1] = g;
    out.px[i + 2] = bl;
    out.px[i + 3] = b.px[i + 3];
  }
  return out;
}

export function hash(...n: number[]): number {
  let h = 0x811c9dc5;
  for (const v of n) {
    h ^= v | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 13;
  }
  return (h >>> 0) / 4294967296;
}

/** Shifts a #hex toward black (t < 0) or white (t > 0). */
export function shade(hex: string, t: number): string {
  const [r, g, b] = rgb(hex);
  const f = (v: number) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t);
  return `#${[f(r), f(g), f(b)].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

export function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const f = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${[f(r1, r2), f(g1, g2), f(b1, b2)].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

// ------------------------------------------------------------------ canvases

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

export function toCanvas(b: PixelBuf): HTMLCanvasElement {
  const c = makeCanvas(Math.max(1, b.w), Math.max(1, b.h)) as HTMLCanvasElement;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(Math.max(1, b.w), Math.max(1, b.h));
  img.data.set(b.px);
  ctx.putImageData(img, 0, 0);
  return c;
}
