/**
 * The music's recordings: a looping track for each mood and a victory sting, all by Kevin MacLeod
 * (credited in CREDITS.md and Settings), cut into seamless loops by tools/packs/music.py:
 * src/assets/music/<id>.m4a (AAC, normalized to -18 LUFS), with each loop's points in tracks.json.
 * Each file is periodic over its whole length (a quarter second of the loop's own continuation on
 * either side of it), so the loop points hold whatever priming a decoder leaves at the front.
 *
 * URLs in the app build (fetched only when a scene first needs its track), data: URLs in the
 * single-file build (which inlines every file). Outside Vite (a Node script run with tsx) there are
 * none, and the music is silent.
 */
import loops from '../assets/music/tracks.json';

export type TrackId = 'tavern' | 'village' | 'inn' | 'celtic' | 'angevin' | 'snow' | 'desert' | 'emperor' | 'axes';
export type StingId = 'victory';

export interface Credit {
  title: string;
  composer: string;
  license: string;
  /** Where the original came from. */
  source: string;
}

export interface Track extends Credit {
  /** Where the loop starts and ends in its file (s). */
  loopStart: number;
  loopEnd: number;
  /** The file's length (s). */
  duration: number;
  /** Beats a minute, steady through the loop (a whole number of beats long); null for one with no steady beat. */
  bpm: number | null;
}

export interface Sting extends Credit {
  duration: number;
}

const INC = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/';
const KM = 'Kevin MacLeod (incompetech.com)';
const BY = 'CC BY 4.0';

const credit = (title: string, license = BY, source = INC + encodeURIComponent(title) + '.mp3'): Credit => ({ title, composer: KM, license, source });

export const TRACKS: Record<TrackId, Track> = {
  /** The hub at night: a lute and a guitar telling a tale by the tavern's fire. */
  tavern: { ...credit('Midnight Tale'), ...loops.tavern },
  /** The hamlet and the shrine: recorders, gemshorn, guitar and drums, a pixel village's day. */
  village: { ...credit('Village Consort'), ...loops.village },
  /** The farm: a lively dance (Kevin MacLeod gave this one to the public domain on FreePD). */
  inn: { ...credit('Dancing at the Inn', 'Public domain (CC0), FreePD', 'https://archive.org/download/freepd/misc/Dancing%20at%20the%20Inn.mp3'), ...loops.inn },
  /** The forest and the swamp: hammered dulcimer, harp, bouzouki and tin whistle in D Dorian, dark and driving. */
  celtic: { ...credit('Celtic Impulse'), ...loops.celtic },
  /** The graveyard and the crypt: flute, lute, choir and drums, a dark Renaissance dance in D minor. */
  angevin: { ...credit('Angevin B'), ...loops.angevin },
  /** The tundra and the crystal caves: celesta, strings and woodwinds, a wintry fairy tale. */
  snow: { ...credit('The Snow Queen'), ...loops.snow },
  /** The desert: hammered dulcimer over hand drums. */
  desert: { ...credit('Desert City'), ...loops.desert },
  /** The ember caves: taiko drums and gamelan. */
  emperor: { ...credit('Mountain Emperor'), ...loops.emperor },
  /** Bosses: full orchestra, war drums and chimes. */
  axes: { ...credit('Death and Axes'), ...loops.axes },
};

export const STINGS: Record<StingId, Sting> = {
  /** A boss falls: the end of an orchestral fanfare, its giant last chord ringing out. */
  victory: { ...credit('Discovery Hit'), ...loops.victory },
};

const titles = (list: Credit[]) => {
  const q = list.map((c) => `"${c.title}"`);
  return q.length > 1 ? `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}` : q.join('');
};

/** The music's credit for Settings: CC BY asks for each title, the author, the license, and a word that they were changed. */
export const MUSIC_CREDIT = (() => {
  const all: Credit[] = [...Object.values(TRACKS), ...Object.values(STINGS)];
  const by = all.filter((c) => c.license === BY);
  const free = all.filter((c) => c.license !== BY);
  return (
    `Music by Kevin MacLeod (incompetech.com): ${titles(by)}, licensed under Creative Commons: By Attribution 4.0 ` +
    `(creativecommons.org/licenses/by/4.0), cut into loops for the game; ${titles(free)}, public domain.`
  );
})();

let urls: Record<string, string> = {};
try {
  urls = import.meta.glob<string>('../assets/music/*.m4a', { eager: true, query: '?url', import: 'default' });
} catch {
  /* not built by Vite: no music */
}

/** Each recording's URL by id (tracks and stings). */
export const MUSIC_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(urls).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.m4a'.length), url]),
);
