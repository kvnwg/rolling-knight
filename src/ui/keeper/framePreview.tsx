/**
 * Every keeper's frame on one page, round a sheet of paper, for working on the art (dev server only):
 *   http://localhost:5173/frames-preview.html?w=126&h=150&s=3
 * `w` and `h` are the counter's size in art pixels, `s` the screen pixels per art pixel, `only` a
 * comma list of stations.
 */
import { FRAME_BAND, FRAME_OVER, FRAME_PLAQUE, paintKeeperFrame } from '../../render/art/keepers/frames';
import type { StationId } from '../../world/hubWorld';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 126);
const H = Number(q.get('h') ?? 150);
const S = Number(q.get('s') ?? 3);
const ids = (q.get('only') ?? 'altar,upgrades,perks,rebirth,quests,gate,scrap').split(',') as StationId[];
const root = document.getElementById('root')!;
root.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px;padding:16px;background:#1c100a';
document.body.style.margin = '0';
for (const id of ids) {
  const t0 = performance.now();
  const art = paintKeeperFrame(id, W, H);
  const ms = performance.now() - t0;
  const box = document.createElement('div');
  box.style.cssText = `position:relative;width:${art.w * S}px;height:${art.h * S}px`;
  const paper = document.createElement('div');
  paper.style.cssText = `position:absolute;left:${(FRAME_OVER + FRAME_BAND - 1) * S}px;top:${(FRAME_OVER + FRAME_BAND + FRAME_PLAQUE - 1) * S}px;right:${(FRAME_OVER + FRAME_BAND - 1) * S}px;bottom:${(FRAME_OVER + FRAME_BAND - 1) * S}px;background:#f2e2bf`;
  box.appendChild(paper);
  const c = document.createElement('canvas');
  c.width = art.w;
  c.height = art.h;
  c.getContext('2d')!.putImageData(new ImageData(art.px, art.w, art.h), 0, 0);
  c.style.cssText = `position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated`;
  c.title = `${id} ${ms.toFixed(1)} ms`;
  box.appendChild(c);
  root.appendChild(box);
}
document.body.dataset.ready = '1';
