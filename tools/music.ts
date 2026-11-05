/**
 * Checks the music's written-out themes (src/audio/songs.ts):
 *   npx tsx tools/music.ts
 * Every melody must fill its 16 bars with its bar lines in place, every chord parse, every pattern
 * fit its bars, and every scene name a theme. Prints each theme's loop length, and the long notes
 * on strong beats that aren't in their bar's chord (most are fine: suspensions, passing tones; a
 * "semitone" one rubs against the chord and deserves a listen). Exits 1 on an error.
 */
import { compile, SCENES } from '../src/audio/music';
import { SONGS, parseLine, songChords } from '../src/audio/songs';

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
let failed = false;

for (const song of Object.values(SONGS)) {
  try {
    compile(song);
    const chords = songChords(song);
    const bar = (60 / song.bpm / song.beatSteps) * song.barSteps;
    console.log(`${song.id.padEnd(7)} ${song.title.padEnd(22)} ${bar.toFixed(2)} s a bar, ${(bar * 16).toFixed(1)} s a loop`);
    for (const p of song.parts) {
      if ('pattern' in p && p.pattern && p.pattern.length % song.barSteps !== 0) throw new Error(`${p.inst}: pattern of ${p.pattern.length} steps doesn't fit ${song.barSteps}-step bars`);
      if (p.kind !== 'line') continue;
      const notes: string[] = [];
      for (const e of parseLine(p.notes, song.barSteps, 16, `${song.id} ${p.inst}`)) {
        const b = Math.floor(e.at / song.barSteps);
        const pc = ((e.n % 12) + 12) % 12;
        const ch = chords[b];
        if (ch.tones.includes(pc) || e.at % song.beatSteps !== 0 || e.len < song.beatSteps) continue;
        const rub = ch.tones.some((t) => Math.abs(((t - pc + 18) % 12) - 6) === 1);
        notes.push(`bar ${b + 1} ${NAMES[pc]}${rub ? ' (semitone)' : ''}`);
      }
      if (notes.length) console.log(`  ${p.inst}: ${notes.join(', ')}`);
    }
  } catch (e) {
    failed = true;
    console.error(`${song.id}: ${(e as Error).message}`);
  }
}
for (const [scene, def] of Object.entries(SCENES)) {
  if (!SONGS[def.song]) {
    failed = true;
    console.error(`scene ${scene}: no theme "${def.song}"`);
  }
}
process.exit(failed ? 1 : 0);
