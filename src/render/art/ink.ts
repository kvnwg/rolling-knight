/**
 * Outlines tinted from the object's own colors: every pixel round a sprite takes the darkest color
 * next to it, darkened a long way (a red roof gets a deep red line, a green hedge a deep green one),
 * never flat black.
 */
import { blank, type PixelBuf } from '../pixel/buf';

export function outlineTinted(b: PixelBuf, f = 0.62): PixelBuf {
  const out = blank(b.w + 2, b.h + 2);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const i = (y * b.w + x) * 4;
    if (!b.px[i + 3]) continue;
    out.px.set(b.px.subarray(i, i + 4), ((y + 1) * out.w + x + 1) * 4);
  }
  const src = out.px.slice();
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const i = (y * out.w + x) * 4;
      if (src[i + 3]) continue;
      let best = -1;
      let lum = 1e9;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= out.w || yy >= out.h) continue;
        const j = (yy * out.w + xx) * 4;
        if (!src[j + 3]) continue;
        const l = src[j] * 0.3 + src[j + 1] * 0.59 + src[j + 2] * 0.11;
        if (l < lum) {
          lum = l;
          best = j;
        }
      }
      if (best < 0) continue;
      // Darkened, and pulled a little toward a deep cool ink so the line reads on every ground.
      out.px[i] = src[best] * (1 - f) * 0.8 + 12 * 0.2;
      out.px[i + 1] = src[best + 1] * (1 - f) * 0.8 + 10 * 0.2;
      out.px[i + 2] = src[best + 2] * (1 - f) * 0.8 + 22 * 0.2;
      out.px[i + 3] = 255;
    }
  }
  return out;
}
