/**
 * Writes docs/SOUNDS.md from the sound catalog (src/audio/catalog.ts): every sound's name, when it
 * plays, its placeholder and how it mixes, and how to replace it. Run after changing the catalog:
 *
 *   npx tsx tools/soundsDoc.ts
 *
 * (tests/sounds.test.ts checks the file is what this writes.)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GROUPS, SOUNDS, SOUND_NAMES, type SoundDef } from '../src/audio/catalog';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SOUNDS_DOC = join(root, 'docs/SOUNDS.md');

const PRIO = ['background', 'fight', 'key', 'always'];

const INTRO: Record<string, string> = {
  Hits: 'A foe being hit, by what it is made of (as the art draws it), and the crits on top.',
  Knights: 'Your squad.',
  Attacks: 'Each class’s auto attack, and where its shots land.',
  Explosions: 'Blasts by kind and size: the boom carries a low thump (with a soft clip, for phone speakers) and debris.',
  Foes: 'Foes falling and attacking: their wind-ups (the telegraph to dodge by) and their moves going off.',
  'Skill roll': 'A knight’s skill reel: every knight’s, yours loudest, each from where it stands.',
  Skills: 'Each skill’s own sound as it fires, after the reel lands. Its hits, blasts and later beats sound on their own (through the rows above).',
  Dungeon: 'Older sounds (from Dumpster Legend), played as they always were.',
  Altar: 'The Summoning Altar.',
  Reveal: 'The full-screen reveal of a big find.',
  Menus: 'Knights, the hub’s counters and the buttons.',
};

const esc = (s: string) => s.replace(/\|/g, '\\|');

function mixOf(d: SoundDef): string {
  if (d.bus === 'legacy') return '—';
  const parts = [PRIO[d.prio], `${d.max} at once`];
  if (d.gap) parts.push(`${d.gap} ms apart`);
  if (d.duck) parts.push(`ducks the fight to ${Math.round(d.duck[0] * 100)}%`);
  if (d.music) parts.push('dips the music');
  return parts.join(', ');
}

/** docs/SOUNDS.md as the catalog has it (with the recordings' levels from levels.json). */
export function soundsDoc(levels: Record<string, number> = JSON.parse(readFileSync(join(root, 'src/assets/sounds/levels.json'), 'utf8'))): string {
  const out: string[] = [];
  out.push('# Sounds');
  out.push('');
  out.push('Every sound in the game, by name. The synthesized ones are placeholders: each plays until a recording of its name replaces it.');
  out.push('This file is written from `src/audio/catalog.ts` by `npx tsx tools/soundsDoc.ts` (a test checks they agree).');
  out.push('');
  out.push('## Replacing a sound');
  out.push('');
  out.push('1. Name the file after the sound: `<name>.mp3`, the name exactly as in the tables below (for example `hit_slime.mp3`, `boom_big.mp3`, `skill_roll_land_epic.mp3`, `skill_whirlwind.mp3`).');
  out.push('2. Put it in `src/assets/sounds/`. Any name in the tables works; nothing else needs to change. Reload the page (restart `npm run dev` if it doesn’t pick it up).');
  out.push('3. Format: MP3, mono or stereo, 44.1 or 48 kHz, trimmed close at the start (a little leading silence is skipped). Keep fight sounds short: the length is how long the mix counts it as playing.');
  out.push('4. Loudness: add `"<name>": <gain>` to `src/assets/sounds/levels.json` (the gain the recording plays at, 1 = as recorded). Without an entry it is brought to about the loudness of the placeholder (its peak to 0.3). Turn it down until it sits with the sounds around it; the existing entries run from 0.02 to 0.5.');
  out.push('');
  out.push('A recording plays with the same mix as its placeholder: where it happened (quieter far from your knight, panned toward its side), a small random change in level and pitch on every play (so repeats don’t machine-gun), lower for bigger foes, and the same limits and priority. Remove the file to get the placeholder back.');
  out.push('');
  out.push('**Mix**: *background* sounds are dropped first in a crowded fight, then *fight* sounds; *key* moments cut through: they play on their own bus and duck the rest of the fight under them for a moment (the biggest dip the music too); *always* sounds are never dropped. “N at once” is how many of that sound can ring together; “ms apart” the least time between two starting. Several of one sound in the same frame play once, a little louder. The everyday fight sits under the music at the default volumes; the Sound slider (0 is silence) sets all of it.');
  out.push('');
  out.push(`${SOUND_NAMES.length} sounds.`);
  for (const g of GROUPS) {
    const names = SOUND_NAMES.filter((n) => SOUNDS[n].group === g);
    if (!names.length) continue;
    out.push('');
    out.push(`## ${g}`);
    out.push('');
    if (INTRO[g]) {
      out.push(INTRO[g]);
      out.push('');
    }
    out.push('| Sound | When it plays | Placeholder | Mix |');
    out.push('| --- | --- | --- | --- |');
    for (const n of names) {
      const d = SOUNDS[n];
      const rec = levels[n] !== undefined ? ` Recorded (\`${n}.mp3\`, gain ${levels[n]}).` : '';
      out.push(`| \`${n}\` | ${esc(d.when)}${rec} | ${esc(d.sound)} | ${mixOf(d)} |`);
    }
  }
  out.push('');
  out.push('## Old recordings');
  out.push('');
  out.push('`hit.mp3` (Dumpster Legend’s blow) is no longer played: a blow is `hit_<material>` now. Rename it to one of those names to use it, or delete it.');
  out.push('');
  return out.join('\n');
}

// Run as a script: write the file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(dirname(SOUNDS_DOC), { recursive: true });
  writeFileSync(SOUNDS_DOC, soundsDoc());
  console.log(`wrote ${SOUNDS_DOC}: ${SOUND_NAMES.length} sounds`);
}
