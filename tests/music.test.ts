import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { highNote } from '../src/audio/ambience';
import { SCENES, music } from '../src/audio/music';
import { MUSIC_CREDIT, MUSIC_FILES, STINGS, TRACKS, type TrackId } from '../src/audio/tracks';
import { BIOMES, BIOME_ORDER, biomeForFloor, isBossFloor } from '../src/world/biomes';

const file = (id: string) => `src/assets/music/${id}.m4a`;

describe('music', () => {
  it('every scene has a track: the camp, the boss and every biome, on every floor', () => {
    for (const id of ['camp', 'boss', ...BIOME_ORDER]) {
      const def = SCENES[id as keyof typeof SCENES];
      expect(def, id).toBeTruthy();
      expect(TRACKS[def.track], id).toBeTruthy();
    }
    for (let floor = 1; floor <= 120; floor++) {
      const scene = isBossFloor(floor) ? 'boss' : music.sceneFor(biomeForFloor(floor, 99).name);
      expect(scene, `floor ${floor}`).toBeTruthy();
      expect(TRACKS[SCENES[scene!].track]).toBeTruthy();
    }
  });

  it('finds a biome scene by the name a floor announces, or by its id', () => {
    for (const b of Object.values(BIOMES)) {
      expect(music.sceneFor(b.name)).toBe(b.id);
      expect(music.sceneFor(b.id)).toBe(b.id);
    }
    expect(music.sceneFor('camp')).toBe('camp');
    expect(music.sceneFor('Nowhere')).toBeNull();
  });

  it('every track and sting has its file, found by the build, and a credit', () => {
    const credits = readFileSync('CREDITS.md', 'utf8');
    for (const [id, t] of [...Object.entries(TRACKS), ...Object.entries(STINGS)]) {
      expect(existsSync(file(id)), id).toBe(true);
      expect(statSync(file(id)).size).toBeGreaterThan(20_000);
      expect(MUSIC_FILES[id], id).toBeTruthy();
      expect(t.title && t.composer && t.license && t.source.startsWith('https://')).toBeTruthy();
      expect(credits).toContain(t.title);
      expect(credits).toContain(t.source);
      expect(MUSIC_CREDIT).toContain(t.title);
    }
  });

  it('every loop sits inside its file with margins, is long enough, and keeps its beat', () => {
    for (const [id, t] of Object.entries(TRACKS)) {
      const len = t.loopEnd - t.loopStart;
      expect(t.loopStart, id).toBeGreaterThanOrEqual(0.2);
      expect(t.duration - t.loopEnd, id).toBeGreaterThanOrEqual(0.2);
      expect(len, id).toBeGreaterThan(40);
      if (t.bpm) {
        const beats = (len * t.bpm) / 60;
        expect(Math.abs(beats - Math.round(beats)), id).toBeLessThan(0.01);
      }
    }
    expect(STINGS.victory.duration).toBeGreaterThan(3);
    expect(STINGS.victory.duration).toBeLessThan(10);
  });

  it('every track is played somewhere, and the music stays under 5 MB', () => {
    const used = new Set(Object.values(SCENES).map((d) => d.track));
    for (const id of Object.keys(TRACKS) as TrackId[]) expect(used.has(id), id).toBe(true);
    const total = [...Object.keys(TRACKS), ...Object.keys(STINGS)].reduce((s, id) => s + statSync(file(id)).size, 0);
    expect(total).toBeLessThan(5_000_000);
  });

  it('a scene set before the first tap is remembered (and nothing needs a browser)', () => {
    music.setScene('forest');
    expect(music.current()).toBe('forest');
    music.setScene('boss');
    expect(music.victory()).toBe(false);
    expect(music.beatDelay()).toBe(0);
    music.stop();
    expect(music.current()).toBeNull();
  });

  it("the places' tuned sounds keep to their key", () => {
    let s = 1;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const gMinor = SCENES.crystal.tones!;
    for (let k = 0; k < 200; k++) {
      expect(gMinor).toContain(highNote(rnd, gMinor) % 12);
      expect([0, 2, 4, 7, 9]).toContain(highNote(rnd, [0, 2, 4, 7, 9]) % 12);
    }
  });
});
