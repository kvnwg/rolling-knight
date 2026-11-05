import { describe, expect, it } from 'vitest';
import { BIOMES } from '../src/world/biomes';
import { forceSky, skyOf } from '../src/world/sky';

describe('sky', () => {
  it('the first floor is always clear, and so is anywhere without a sky', () => {
    for (let seed = 1; seed < 50; seed++) expect(skyOf(BIOMES.hamlet, seed, 1).kind).toBe('clear');
    for (let f = 1; f < 80; f++) {
      expect(skyOf(BIOMES.crypt, 7, f).rain).toBe(0);
      expect(skyOf(BIOMES.ember, 7, f).kind).toBe('clear');
    }
  });

  it('is the same for the same floor, and outdoors every kind of weather comes up', () => {
    const seen = new Set<string>();
    for (let f = 2; f < 200; f++) {
      const a = skyOf(BIOMES.hamlet, 12345, f);
      expect(skyOf(BIOMES.hamlet, 12345, f)).toEqual(a);
      seen.add(a.kind);
      if (a.kind === 'rain') expect(a.rain).toBeGreaterThanOrEqual(0.55);
      else expect(a.rain).toBe(0);
    }
    expect([...seen].sort()).toEqual(['clear', 'overcast', 'rain']);
  });

  it('a forced sky overrides the roll outdoors only', () => {
    forceSky('rain');
    expect(skyOf(BIOMES.farmland, 3, 1).kind).toBe('rain');
    expect(skyOf(BIOMES.crypt, 3, 4).kind).toBe('clear');
    forceSky(null);
  });
});
