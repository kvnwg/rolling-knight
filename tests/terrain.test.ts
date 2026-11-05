import { describe, expect, it } from 'vitest';
import { BIOMES, type BiomeId } from '../src/world/biomes';
import { generateFloor } from '../src/world/mapgen';
import { paintTerrainPixels } from '../src/render/terrain';
import { propArt } from '../src/render/art/props';
import { VNoise, vnoise } from '../src/render/noise';

const floorOf = (id: BiomeId, floor: number, seed: number) => generateFloor({ floor, biome: BIOMES[id], seed, boss: false });

/** Distinct colors among the pixels of a w x h window whose top-left is (x0, y0). */
function colors(t: { w: number; px: Uint8ClampedArray }, x0: number, y0: number, w: number, h: number): number {
  const seen = new Set<number>();
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * t.w + x) * 4;
      seen.add((t.px[i] << 16) | (t.px[i + 1] << 8) | t.px[i + 2]);
    }
  }
  return seen.size;
}

describe('terrain', () => {
  it('paints the same floor the same way every time', () => {
    for (const [id, floor] of [['hamlet', 3], ['forest', 12], ['tundra', 17]] as const) {
      const m = floorOf(id, floor, 4242);
      const a = paintTerrainPixels(m, BIOMES[id]);
      const b = paintTerrainPixels(m, BIOMES[id]);
      expect(Buffer.from(a.px).equals(Buffer.from(b.px))).toBe(true);
      expect(a.glows).toEqual(b.glows);
      // Every pixel painted, opaque.
      for (let i = 3; i < a.px.length; i += 4 * 97) expect(a.px[i]).toBe(255);
    }
  });

  it('paints a different floor for a different seed', () => {
    const a = paintTerrainPixels(floorOf('farmland', 7, 1), BIOMES.farmland);
    const b = paintTerrainPixels(floorOf('farmland', 7, 2), BIOMES.farmland);
    expect(Buffer.from(a.px).equals(Buffer.from(b.px))).toBe(false);
  });

  it('grows lawns with texture: many greens, not a few flat ones', () => {
    // The hamlet's lots are lawn; a 64 px window of one has blades, tufts and patches in many tones.
    const m = floorOf('hamlet', 3, 1234);
    const t = paintTerrainPixels(m, BIOMES.hamlet);
    let best = 0;
    for (let ty = 0; ty + 4 < m.h; ty += 4) {
      for (let tx = 0; tx + 4 < m.w; tx += 4) {
        let solid = 0;
        for (let y = ty; y < ty + 4; y++) for (let x = tx; x < tx + 4; x++) if (m.tiles[y * m.w + x] === 0) solid++;
        if (solid === 16) best = Math.max(best, colors(t, tx * 16, ty * 16, 64, 64));
      }
    }
    expect(best).toBeGreaterThan(14);
  });

  it('reads noise rows exactly as it reads points', () => {
    const n = new VNoise(23, 77, 300, 200);
    for (const y of [0, 7, 22, 23, 150, 199]) {
      n.row(y);
      for (let x = 0; x < 300; x += 7) {
        expect(n.atRow(x)).toBe(n.at(x, y));
        expect(n.at(x, y)).toBe(vnoise(x, y, 23, 77));
      }
    }
  });
});

describe('crystals', () => {
  it('stand in clusters with a light, in each biome that has them', () => {
    for (const id of ['tundra', 'crystal', 'ember'] as const) {
      for (let v = 0; v < 5; v++) {
        const art = propArt('crystalSmall', BIOMES[id], v * 104729 + 7);
        let opaque = 0;
        for (let i = 3; i < art.buf.px.length; i += 4) if (art.buf.px[i]) opaque++;
        expect(opaque).toBeGreaterThan(60);
        expect(art.light?.r).toBeGreaterThan(0);
        // The base sits inside the sprite, on its bottom rows.
        expect(art.ay).toBeLessThanOrEqual(art.buf.h);
        expect(art.ay).toBeGreaterThan(art.buf.h - 6);
      }
    }
  });
});
