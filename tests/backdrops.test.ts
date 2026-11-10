import { describe, expect, it } from 'vitest';
import { RARITIES } from '../src/core/rarity';
import { backdropRarities, paintBackdrop } from '../src/render/art/backdrops';

describe('knight backdrops', () => {
  it('every rarity has its own scene, painted edge to edge at any size', () => {
    expect(backdropRarities().sort()).toEqual([...RARITIES].sort());
    for (const r of RARITIES) {
      for (const [w, h, up] of [[96, 36, 5], [128, 32, 6], [18, 18, -8]] as const) {
        const px = paintBackdrop(r, w, h, { feetUp: up });
        expect(px.length).toBe(w * h * 4);
        // Nothing see-through: the scene fills its frame.
        for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
      }
    }
  });

  it('is the same picture every time', () => {
    for (const r of ['common', 'legendary', 'celestial'] as const) expect(paintBackdrop(r, 60, 34)).toEqual(paintBackdrop(r, 60, 34));
  });

  it('rarer scenes are not all the same colours (each tier its own place)', () => {
    const mean = (px: Uint8ClampedArray) => {
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < px.length; i += 4) (r += px[i]), (g += px[i + 1]), (b += px[i + 2]);
      const n = px.length / 4;
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)].join(',');
    };
    const seen = new Set(RARITIES.map((r) => mean(paintBackdrop(r, 64, 34))));
    expect(seen.size).toBe(RARITIES.length);
  });
});
