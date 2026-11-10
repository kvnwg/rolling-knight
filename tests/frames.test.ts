import { describe, expect, it } from 'vitest';
import { FRAME_BAND, FRAME_OVER, FRAME_PLAQUE, hasKeeperFrame, keeperDress, paintKeeperFrame } from '../src/render/art/keepers/frames';
import type { StationId } from '../src/world/hubWorld';

const KEEPERS: StationId[] = ['altar', 'upgrades', 'perks', 'rebirth', 'quests', 'gate', 'scrap'];

describe("the keepers' frames", () => {
  it('every keeper has a frame, painted to the size asked for with its overhang', () => {
    for (const id of KEEPERS) {
      expect(hasKeeperFrame(id)).toBe(true);
      for (const [w, h] of [[130, 160], [300, 120], [121, 97]] as const) {
        const art = paintKeeperFrame(id, w, h);
        expect([art.w, art.h]).toEqual([w + 2 * FRAME_OVER, h + 2 * FRAME_OVER]);
        expect(art.px.length).toBe(art.w * art.h * 4);
      }
    }
  });

  it('covers its band and plaque, and leaves the paper clear', () => {
    for (const id of KEEPERS) {
      const w = 130;
      const h = 140;
      const art = paintKeeperFrame(id, w, h);
      const a = (x: number, y: number) => art.px[((y + FRAME_OVER) * art.w + x + FRAME_OVER) * 4 + 3];
      // The band, down the left side and along the foot; the plaque under the top.
      for (let y = 20; y < h - 20; y += 7) for (let d = 0; d < FRAME_BAND; d++) expect(a(d, y)).toBe(255);
      for (let x = 20; x < w - 20; x += 7) for (let d = 0; d < FRAME_BAND; d++) expect(a(x, h - 1 - d)).toBe(255);
      for (let x = FRAME_BAND; x < w - FRAME_BAND; x += 5) expect(a(x, FRAME_BAND + FRAME_PLAQUE - 1)).toBe(255);
      // The middle of the paper is see-through (nothing painted over the counter's cards).
      let clear = 0;
      let all = 0;
      for (let y = FRAME_BAND + FRAME_PLAQUE + 12; y < h - FRAME_BAND - 6; y += 3) {
        for (let x = FRAME_BAND + 6; x < w - FRAME_BAND - 6; x += 3) {
          all++;
          if (a(x, y) === 0) clear++;
        }
      }
      expect(clear).toBe(all);
    }
  });

  it('no two keepers share a frame, a paper or a tab', () => {
    const sum = (px: Uint8ClampedArray) => {
      let s = 0;
      for (let i = 0; i < px.length; i += 4) s = (s * 31 + px[i] + px[i + 1] * 3 + px[i + 2] * 7) >>> 0;
      return s;
    };
    expect(new Set(KEEPERS.map((id) => sum(paintKeeperFrame(id, 130, 120).px))).size).toBe(KEEPERS.length);
    expect(new Set(KEEPERS.map((id) => keeperDress(id).tab.face)).size).toBe(KEEPERS.length);
  });
});
