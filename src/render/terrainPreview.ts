/**
 * A floor's painted ground with everything standing on it, unlit and whole, for working on the
 * terrain art (dev server only):
 *   http://localhost:5173/terrain-preview.html?biome=forest&design=valley&seed=3&s=2
 * `s` is screen pixels per art pixel; `floor` the floor number (its size); `bare` leaves the props out.
 */
import { BIOMES, type BiomeId } from '../world/biomes';
import { generateFloor } from '../world/mapgen';
import type { DesignId } from '../core/deck';
import { artOf } from './art/artOf';
import { toCanvas } from './art/draw';
import { paintTerrain } from './terrain';

const q = new URLSearchParams(location.search);
const S = Number(q.get('s') ?? 2);
const biome = BIOMES[(q.get('biome') ?? 'hamlet') as BiomeId];
const floor = Number(q.get('floor') ?? 3);
const m = generateFloor({ floor, biome, seed: Number(q.get('seed') ?? 1), boss: q.has('boss'), design: (q.get('design') as DesignId) ?? undefined });
const t = paintTerrain(m, biome);
const c = document.createElement('canvas');
c.width = t.canvas.width;
c.height = t.canvas.height;
const ctx = c.getContext('2d')!;
ctx.drawImage(t.canvas, 0, 0);
if (!q.has('bare')) {
  for (const p of [...m.props].sort((a, b) => a.y - b.y)) {
    const a = artOf(p, biome);
    ctx.drawImage(toCanvas(a.buf), Math.round(p.x - a.ax), Math.round(p.y - a.ay));
  }
}
if (q.has('grid')) {
  for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) {
    const t = m.tiles[ty * m.w + tx];
    ctx.fillStyle = t === 0 ? 'rgba(255,40,40,0.35)' : t === 2 ? 'rgba(40,120,255,0.35)' : t === 3 ? 'rgba(255,220,40,0.35)' : 'rgba(0,0,0,0)';
    ctx.fillRect(tx * 16, ty * 16, 16, 16);
  }
}
c.style.cssText = `width:${c.width * S}px;height:${c.height * S}px;image-rendering:pixelated;display:block`;
c.id = 'terrain';
document.body.style.cssText = 'margin:0;background:#101014';
document.getElementById('root')!.appendChild(c);
(window as unknown as { __terrain: unknown }).__terrain = { m, start: m.start, w: c.width, h: c.height };
document.title = `ready ${biome.name}`;
