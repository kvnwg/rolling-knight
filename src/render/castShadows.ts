/**
 * Cast shadows, baked into the ground with the terrain: the light comes from the top left, so
 * everything standing (trees, houses, walls of ruins, barrels, lamp posts) throws its silhouette
 * toward the lower right, sheared and flattened onto the ground. Gives most of the scene's depth for
 * nothing per frame. The result is a mask: 2 in the shadow's core, 1 in a soft rim round it.
 */
import type { Biome } from '../world/biomes';
import { SOLID, TILE, type FloorMap, type Prop } from '../world/mapgen';
import { artOf } from './art/artOf';

/** A point h px above the ground throws its shadow this far right (SX * h) and down (SY * h). */
const SX = 0.62;
const SY = 0.34;

/** Small flat things throw no shadow worth drawing. */
const FLAT = new Set<string>(['flowers', 'bones', 'skull', 'reeds', 'mushroomSmall', 'cabbage', 'wheat', 'rug']);

export function castShadows(m: FloorMap, biome: Biome, W: number, H: number): Uint8Array {
  const mask = new Uint8Array(W * H);
  const floorNear = (p: Prop, reach: number) => {
    // Only props whose shadow can land on open floor are worth projecting.
    const tx0 = Math.floor((p.x - 8) / TILE);
    const tx1 = Math.floor((p.x + reach) / TILE);
    const ty0 = Math.floor((p.y - 4) / TILE);
    const ty1 = Math.floor((p.y + reach * 0.6) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue;
      if (m.tiles[ty * m.w + tx] !== SOLID) return true;
    }
    return false;
  };
  for (const p of m.props) {
    if (FLAT.has(p.kind)) continue;
    const art = artOf(p, biome);
    const b = art.buf;
    // Trees throw their shadow wherever they stand (pools on their own lawns); other props only when it can land on open floor.
    if (p.kind !== 'tree' && !floorNear(p, b.h * SX + b.w / 2)) continue;
    const left = p.x - art.ax;
    const top = p.y - art.ay;
    for (let v = 0; v < b.h; v++) {
      const h = p.y - (top + v);
      if (h < 0) continue;
      const sy = Math.round(p.y + h * SY);
      if (sy < 0 || sy >= H) continue;
      const dx = Math.round(h * SX);
      const row = v * b.w;
      for (let u = 0; u < b.w; u++) {
        if (!b.px[(row + u) * 4 + 3]) continue;
        const sx = left + u + dx;
        if (sx >= 0 && sx < W) mask[sy * W + sx] = 2;
      }
    }
    // A pool of shade right under trees, where the crown hides the sky.
    if (p.kind === 'tree') {
      const rx = Math.max(6, Math.round(b.w * 0.34));
      for (let oy = -2; oy <= 3; oy++) for (let ox = -rx; ox <= rx; ox++) {
        if ((ox / rx) ** 2 + (oy / 3.5) ** 2 > 1) continue;
        const sx = p.x + 2 + ox;
        const sy = p.y + oy;
        if (sx >= 0 && sy >= 0 && sx < W && sy < H && !mask[sy * W + sx]) mask[sy * W + sx] = 1;
      }
    }
  }
  // The soft rim: a pixel round every core pixel.
  const out = mask.slice();
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (mask[i]) continue;
      if (mask[i - 1] === 2 || mask[i + 1] === 2 || mask[i - W] === 2 || mask[i + W] === 2) out[i] = 1;
    }
  }
  return out;
}
