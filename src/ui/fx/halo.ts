/**
 * The light behind a knight as it's revealed: a disc of its rarity's colour in pixel-art steps (rings
 * of light, each ring's edge dithered into the next, white-hot in the middle, gone at the rim), drawn
 * once per colour and size into a small image. Not a smooth gradient: the same stepped, dithered
 * light as the keepers' scenes and the knights' backdrops.
 */
import { READ } from '../readCanvas';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const cache = new Map<string, string>();

/**
 * A halo `n` pixels across in `color` (a #rrggbb), as a data URL: `strength` its opacity at the
 * middle (0..1), `bands` the number of rings.
 */
export function haloUrl(color: string, n: number, strength = 0.6, bands = 5): string {
  n = Math.max(8, Math.round(n));
  const key = `${color}|${n}|${strength}|${bands}`;
  let url = cache.get(key);
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const g = c.getContext('2d', READ)!;
  const img = g.createImageData(n, n);
  const v = parseInt(color.slice(1, 7), 16);
  const [cr, cg, cb] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      if (r >= 1) continue;
      // Light falling off toward the rim, stepped into rings, dithered at each ring's edge.
      const f = Math.pow(1 - r, 1.4);
      const q = Math.floor(f * bands + BAYER4[(x & 3) + ((y & 3) << 2)]) / bands;
      if (q <= 0) continue;
      // Whiter toward the middle.
      const hot = Math.max(0, q - 0.4) * 1.1;
      const i = (y * n + x) * 4;
      img.data[i] = cr + (255 - cr) * hot;
      img.data[i + 1] = cg + (255 - cg) * hot;
      img.data[i + 2] = cb + (255 - cb) * hot;
      img.data[i + 3] = Math.min(255, 255 * strength * q);
    }
  }
  g.putImageData(img, 0, 0);
  url = c.toDataURL();
  cache.set(key, url);
  return url;
}
