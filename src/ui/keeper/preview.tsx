/**
 * Every keeper's scene on one page, for working on the art (dev server only):
 *   http://localhost:5173/keepers-preview.html?w=196&h=118&s=3
 * `w` and `h` are the scene's size in art pixels, `s` the screen pixels per art pixel, `only` a comma
 * list of stations, `blink` shows the keepers' eyes shut.
 */
import { lightLayer } from '../../render/art/keepers/light';
import { paintKeeperScene } from '../../render/art/keepers/scenes';
import type { StationId } from '../../world/hubWorld';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 196);
const H = Number(q.get('h') ?? 118);
const S = Number(q.get('s') ?? 3);
const ids = (q.get('only') ?? 'upgrades,smith,scrap,perks,rebirth,squad,altar,quests,gate').split(',') as StationId[];
const root = document.getElementById('root')!;
root.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;padding:12px;background:#120a07;overflow:auto;height:100%;box-sizing:border-box';
document.body.style.margin = '0';
for (const id of ids) {
  const t0 = performance.now();
  const art = paintKeeperScene(id, W, H);
  if (q.has('blink')) for (const [x, y, c] of art.blink) art.L.px(x, y, c);
  const px = lightLayer(art.L, { ambient: art.ambient, bloom: art.bloom, vignette: art.vignette });
  const ms = performance.now() - t0;
  const c = document.createElement('canvas');
  c.width = art.L.w;
  c.height = art.L.h;
  c.getContext('2d')!.putImageData(new ImageData(px, art.L.w, art.L.h), 0, 0);
  c.style.cssText = `width:${art.L.w * S}px;height:${art.L.h * S}px;image-rendering:pixelated`;
  c.title = `${id} ${ms.toFixed(1)} ms`;
  c.dataset.ms = ms.toFixed(1);
  root.appendChild(c);
}
document.body.dataset.ready = '1';
