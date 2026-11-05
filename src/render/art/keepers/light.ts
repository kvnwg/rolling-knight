/**
 * Lights a painted keeper scene on the CPU, the way the hub is lit on the GPU but simpler: every
 * pixel's color (as painted, in full light) times the light falling on it, a dim ambient plus each
 * lamp, candle and coal bed's warm pool, the pools stepped into bands with an ordered dither at their
 * edges (pixel art's light, not a smooth gradient); then whatever glows (flames, orbs, coals, lit
 * glass) shines at full strength with a soft bloom round it, and the corners fall off into shadow.
 * Pure: no DOM, so tests and tools can light a scene too.
 */
import { rgb } from '../../pixel/buf';
import type { Layer, LightSpec } from '../hubKit';

export interface LightOpts {
  /** The light everywhere, 0..1 per channel (dim: the scene's shadows). */
  ambient: readonly [number, number, number];
  /** Light pool steps (more = smoother). */
  bands?: number;
  /** How much the corners darken, 0..1. */
  vignette?: number;
  /** How strongly glowing pixels bleed into their surroundings. */
  bloom?: number;
  /** The bloom's reach in pixels. */
  bloomR?: number;
  /** Each light's flicker this frame (0..1 scales its strength down by flicker x this). */
  flicker?: number;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** A box blur of one channel set (RGB floats), `r` pixels each way, run twice (about a soft tent). */
function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  let a = src;
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let x = -r; x <= r; x++) acc += a[(y * w + Math.min(w - 1, Math.max(0, x))) * 3 + c];
        for (let x = 0; x < w; x++) {
          tmp[(y * w + x) * 3 + c] = acc / (2 * r + 1);
          const out = Math.max(0, x - r);
          const inn = Math.min(w - 1, x + r + 1);
          acc += a[(y * w + inn) * 3 + c] - a[(y * w + out) * 3 + c];
        }
      }
    }
    const res = new Float32Array(a.length);
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += tmp[(Math.min(h - 1, Math.max(0, y)) * w + x) * 3 + c];
        for (let y = 0; y < h; y++) {
          res[(y * w + x) * 3 + c] = acc / (2 * r + 1);
          const out = Math.max(0, y - r);
          const inn = Math.min(h - 1, y + r + 1);
          acc += tmp[(inn * w + x) * 3 + c] - tmp[(out * w + x) * 3 + c];
        }
      }
    }
    a = res;
  }
  return a;
}

/** The lit picture, RGBA, the layer's size. Transparent pixels stay transparent. */
export function lightLayer(L: Layer, o: LightOpts, lights: readonly LightSpec[] = L.lights): Uint8ClampedArray<ArrayBuffer> {
  const W = L.w;
  const H = L.h;
  const bands = o.bands ?? 6;
  const amb = o.ambient;
  const ls = lights.map((l) => {
    const [r, g, b] = rgb(l.color);
    const k = l.intensity * (1 - (l.flicker ?? 0) * (o.flicker ?? 0));
    return { x: l.x - L.x0, y: l.y - L.y0, r: l.r, cr: (r / 255) * k, cg: (g / 255) * k, cb: (b / 255) * k };
  });
  const out = new Uint8ClampedArray(new ArrayBuffer(W * H * 4));
  const glow = new Float32Array(W * H * 3);
  const src = L.buf.px;
  const gsrc = L.glow.px;
  const vig = o.vignette ?? 0.35;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const th = BAYER4[(x & 3) + ((y & 3) << 2)];
      let r = amb[0];
      let g = amb[1];
      let b = amb[2];
      for (const l of ls) {
        const dx = x + 0.5 - l.x;
        const dy = (y + 0.5 - l.y) * 1.15;
        const d2 = dx * dx + dy * dy;
        if (d2 >= l.r * l.r) continue;
        let f = 1 - Math.sqrt(d2) / l.r;
        f = f * f * (3 - 2 * f);
        // Stepped pools, dithered at each step's edge.
        f = Math.floor(f * bands + th) / bands;
        r += l.cr * f;
        g += l.cg * f;
        b += l.cb * f;
      }
      // The corners fall off.
      const vx = (x + 0.5) / W - 0.5;
      const vy = (y + 0.5) / H - 0.42;
      const v = 1 - vig * Math.min(1, (vx * vx * 1.6 + vy * vy * 1.2) * 2.2);
      r *= v;
      g *= v;
      b *= v;
      if (src[i + 3]) {
        out[i] = Math.min(255, src[i] * Math.min(1.35, r));
        out[i + 1] = Math.min(255, src[i + 1] * Math.min(1.35, g));
        out[i + 2] = Math.min(255, src[i + 2] * Math.min(1.35, b));
        out[i + 3] = 255;
      }
      if (gsrc[i + 3]) {
        const a = gsrc[i + 3] / 255;
        const j = (y * W + x) * 3;
        glow[j] = (gsrc[i] / 255) * a;
        glow[j + 1] = (gsrc[i + 1] / 255) * a;
        glow[j + 2] = (gsrc[i + 2] / 255) * a;
        // Glowing pixels shine at their own color whatever the light.
        if (a > 0.99) {
          out[i] = Math.max(out[i], gsrc[i]);
          out[i + 1] = Math.max(out[i + 1], gsrc[i + 1]);
          out[i + 2] = Math.max(out[i + 2], gsrc[i + 2]);
          out[i + 3] = 255;
        } else {
          out[i] = Math.min(255, out[i] + gsrc[i] * a * 0.6);
          out[i + 1] = Math.min(255, out[i + 1] + gsrc[i + 1] * a * 0.6);
          out[i + 2] = Math.min(255, out[i + 2] + gsrc[i + 2] * a * 0.6);
        }
      }
    }
  }
  const bloom = o.bloom ?? 0.9;
  if (bloom > 0) {
    const soft = blur(glow, W, H, o.bloomR ?? 3);
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      if (!out[i + 3]) continue;
      // Banded too, so the halo steps like the light does.
      const th = BAYER4[((p % W) & 3) + ((Math.floor(p / W) & 3) << 2)];
      const q = (v: number) => Math.floor(v * bloom * 10 + th) / 10;
      out[i] = Math.min(255, out[i] + 255 * q(soft[p * 3]));
      out[i + 1] = Math.min(255, out[i + 1] + 255 * q(soft[p * 3 + 1]));
      out[i + 2] = Math.min(255, out[i + 2] + 255 * q(soft[p * 3 + 2]));
    }
  }
  return out;
}
