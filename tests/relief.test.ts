import { describe, expect, it } from 'vitest';
import { BIOMES, type BiomeId } from '../src/world/biomes';
import { FLOOR, SOLID, TILE, generateFloor } from '../src/world/mapgen';
import { faceSpan, reliefHeight, tierRise, TIER_HEIGHT } from '../src/world/relief';

const floorOf = (id: BiomeId, seed: number) => generateFloor({ floor: 12, biome: BIOMES[id], seed, boss: false });

describe('raised ground', () => {
  it('every biome but the tiled dungeon has a face height', () => {
    for (const b of Object.values(BIOMES)) expect(reliefHeight(b) > 0).toBe(!b.tiles);
  });

  it('a face stops at the top of the solid ground behind it', () => {
    // A wall one tile thick over open floor shows one tile of face; a thick one shows its full height.
    const thin = (tx: number, ty: number) => tx === 0 && ty === 1;
    expect(faceSpan(thin, 30, 0, 1)).toEqual([0, TILE]);
    const thick = (tx: number, ty: number) => tx === 0 && ty <= 1;
    expect(faceSpan(thick, 30, 0, 1)).toEqual([0, 30]);
    expect(faceSpan(thick, 30, 0, 0)).toEqual([TILE, 30]);
    expect(faceSpan(thick, 14, 0, 0)).toBeNull();
  });

  it('terraces keep to solid ground, back from the floor and clear of what stands on it', () => {
    for (const id of ['hamlet', 'forest', 'tundra', 'desert'] as const) {
      for (const seed of [1, 2, 3]) {
        const m = floorOf(id, seed);
        const t = m.tiers;
        if (!t) continue;
        for (let ty = 0; ty < m.h; ty++) {
          for (let tx = 0; tx < m.w; tx++) {
            if (!t[ty * m.w + tx]) continue;
            expect(m.tiles[ty * m.w + tx]).toBe(SOLID);
            for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
              const x = tx + ox;
              const y = ty + oy;
              if (x >= 0 && y >= 0 && x < m.w && y < m.h) expect(m.tiles[y * m.w + x]).not.toBe(FLOOR);
            }
            expect(m.reserved?.[ty * m.w + tx] ?? 0).toBe(0);
          }
        }
      }
    }
  });

  it('some floors get terraces, and never a crypt', () => {
    let any = 0;
    for (const seed of [1, 2, 3, 4]) if (floorOf('forest', seed).tiers) any++;
    expect(any).toBeGreaterThan(0);
    for (const seed of [1, 2, 3]) expect(floorOf('crypt', seed).tiers).toBeUndefined();
  });

  it('no tree stands on a face', () => {
    for (const id of ['hamlet', 'forest', 'swamp'] as const) {
      const b = BIOMES[id];
      const m = floorOf(id, 5);
      const solidAt = (tx: number, ty: number) => tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.tiles[ty * m.w + tx] === SOLID;
      for (const p of m.props) {
        if (p.kind !== 'tree') continue;
        const y0 = Math.floor(p.y - 1);
        const tx = Math.floor(p.x / TILE);
        const ty = Math.floor(y0 / TILE);
        const ly = y0 - ty * TILE;
        const span = faceSpan(solidAt, reliefHeight(b), tx, ty);
        if (span) expect(span[0] + TILE - 1 - ly).toBeGreaterThanOrEqual(span[1]);
        expect(tierRise(m, tx, ty, ly)).toBe(-1);
      }
    }
    expect(TIER_HEIGHT).toBeGreaterThan(TILE);
  });
});
