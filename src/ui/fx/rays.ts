/**
 * Light rays for the good-roll moments (the reveal, a rare reel landing), drawn once per color set
 * into a small canvas with the fade to the edges baked into its alpha, and shown as a plain rotating
 * image (Dumpster Legend's rays.ts: a huge CSS conic gradient with a mask crashed phone browsers).
 */
import { READ } from '../readCanvas';

const cache = new Map<string, string>();

const SIZE = 384;

/** A data URL of a ray burst: `spokes` wedges cycling through `colors`, fading out toward the edge. */
export function raysUrl(colors: readonly string[], spokes = 16, alpha = 0.45): string {
  const key = `${colors.join(',')}|${spokes}|${alpha}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext('2d', READ);
  if (!g) return '';
  const r = SIZE / 2;
  const step = (Math.PI * 2) / spokes;
  g.globalAlpha = alpha;
  for (let i = 0; i < spokes; i++) {
    g.fillStyle = colors[i % colors.length];
    g.beginPath();
    g.moveTo(r, r);
    g.arc(r, r, r * 1.5, i * step, i * step + step * 0.42);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createRadialGradient(r, r, r * 0.12, r, r, r);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, SIZE, SIZE);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** The rainbow used by the biggest moments. */
export const RAINBOW = ['#ff5252', '#ffb300', '#69f0ae', '#40c4ff'] as const;
