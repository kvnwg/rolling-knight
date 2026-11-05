/**
 * The recorded sounds (src/assets/sounds/<name>.mp3, from Dumpster Legend, made from WAVs by its
 * tools/sounds.mjs), by name. Each plays in place of the synthesized sound of that name (sfx.ts); a
 * sound without one is synthesized. URLs in the app build, data: URLs in the single-file build (which
 * inlines every file). Outside Vite (a Node script run with tsx) there are none, and every sound is
 * synthesized.
 */
import levels from '../assets/sounds/levels.json';

let urls: Record<string, string> = {};
try {
  urls = import.meta.glob<string>('../assets/sounds/*.mp3', { eager: true, query: '?url', import: 'default' });
} catch {
  /* not built by Vite: no recordings */
}

export const SOUND_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(urls).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.mp3'.length), url]),
);

/** Each recording's gain, matched to the loudness of the synthesized sound it replaces. */
export const SOUND_LEVELS: Readonly<Record<string, number>> = levels;
