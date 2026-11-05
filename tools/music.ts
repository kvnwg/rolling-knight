/**
 * Checks the music (src/audio/music.ts, src/audio/tracks.ts, src/assets/music/):
 *   npx tsx tools/music.ts
 * Every scene (the camp, the boss, every biome) must name a track; every track and sting must have
 * its file, credited in CREDITS.md; every loop must sit inside its file with its margins on both
 * sides, and a track with a steady beat must loop on a whole number of beats; with ffmpeg installed,
 * each file's length and loudness are measured too (loops at -18 LUFS, the sting at -16, within 1 LU).
 * The music must stay under 5 MB in all. Prints each file; exits 1 on an error.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SCENES } from '../src/audio/music';
import { STINGS, TRACKS } from '../src/audio/tracks';
import { BIOMES } from '../src/world/biomes';

const DIR = 'src/assets/music';
const BUDGET = 5_000_000;
const MARGIN = 0.2;
let failed = false;
const fail = (msg: string) => {
  failed = true;
  console.error(msg);
};

const has = (cmd: string) => spawnSync(cmd, ['-version'], { encoding: 'utf8' }).status === 0;
const ffmpeg = has('ffmpeg') && has('ffprobe');
const duration = (file: string) => Number(spawnSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim());
const lufs = (file: string) => {
  const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const m = [...e.matchAll(/I:\s+(-?[\d.]+) LUFS/g)];
  return m.length ? Number(m[m.length - 1][1]) : NaN;
};

const credits = readFileSync('CREDITS.md', 'utf8');
for (const b of Object.keys(BIOMES)) if (!(b in SCENES)) fail(`biome ${b}: no music scene`);
for (const [scene, def] of Object.entries(SCENES)) if (!TRACKS[def.track]) fail(`scene ${scene}: no track "${def.track}"`);

let total = 0;
const files: Array<[string, { title: string; duration: number; loopStart?: number; loopEnd?: number; bpm?: number | null }, number]> = [
  ...Object.entries(TRACKS).map(([id, t]) => [id, t, -18] as [string, typeof t, number]),
  ...Object.entries(STINGS).map(([id, t]) => [id, t, -16] as [string, typeof t, number]),
];
for (const [id, t, target] of files) {
  const file = join(DIR, `${id}.m4a`);
  if (!existsSync(file)) {
    fail(`${id}: no ${file}`);
    continue;
  }
  const size = statSync(file).size;
  total += size;
  if (!credits.includes(t.title)) fail(`${id}: "${t.title}" isn't in CREDITS.md`);
  const scenes = Object.entries(SCENES).filter(([, d]) => d.track === id).map(([s]) => s);
  let line = `${id.padEnd(8)} ${t.title.padEnd(20)} ${(size / 1024).toFixed(0).padStart(4)} KB`;
  if (t.loopStart !== undefined && t.loopEnd !== undefined) {
    const len = t.loopEnd - t.loopStart;
    line += `  loop ${len.toFixed(2)} s`;
    if (t.loopStart < MARGIN || t.duration - t.loopEnd < MARGIN) fail(`${id}: the loop needs ${MARGIN} s of margin in its file on each side`);
    if (len < 20) fail(`${id}: a ${len.toFixed(1)} s loop is too short`);
    if (t.bpm) {
      const beats = (len * t.bpm) / 60;
      line += ` = ${beats.toFixed(2)} beats at ${t.bpm}`;
      if (Math.abs(beats - Math.round(beats)) > 0.01) fail(`${id}: the loop isn't a whole number of beats (${beats.toFixed(3)})`);
    }
    if (!scenes.length) fail(`${id}: no scene plays it`);
  }
  if (ffmpeg) {
    const d = duration(file);
    const l = lufs(file);
    line += `  file ${d.toFixed(2)} s, ${l.toFixed(1)} LUFS`;
    if (Math.abs(d - t.duration) > 0.06) fail(`${id}: the file is ${d.toFixed(3)} s long, tracks.json says ${t.duration}`);
    if (!(Math.abs(l - target) <= 1)) fail(`${id}: ${l} LUFS, want ${target}`);
  }
  console.log(line + (scenes.length ? `  (${scenes.join(', ')})` : ''));
}
console.log(`total ${(total / 1e6).toFixed(2)} MB${ffmpeg ? '' : ' (no ffmpeg: lengths and loudness not measured)'}`);
if (total > BUDGET) fail(`the music is ${(total / 1e6).toFixed(2)} MB, over ${BUDGET / 1e6} MB`);
process.exit(failed ? 1 : 0);
