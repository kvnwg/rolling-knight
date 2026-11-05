/**
 * The music, written out: one looping theme per mood, as chords, melodies and patterns that music.ts
 * plays with its synthesized instruments (instruments.ts). Every theme is 16 bars (an A and a B
 * section) and comes back changed on each pass (the lead hands the tune to the harp, a harmony joins,
 * the melody drops out for a bar or eight), so a long fight or a long wait at camp doesn't wear it out.
 *
 * Keys: every theme sits in C major or a key next to it (G, A minor, E minor, D minor), so the game's
 * reward sounds (all on the C major pentatonic ladder, sfx.ts) sound like the song resolving, the
 * way Dumpster Legend's Dopamine Playbook asks.
 *
 * Notation:
 * - `chords`: one chord symbol per bar (C, Am, G/B, Dm7, Fmaj7, Esus4, Em7, A7, Bb, F#m ...), `|` between sections.
 * - a melody (`notes`): `E5:3` is E5 for three steps, `-:2` a two-step rest, `|` a bar line (checked).
 * - an arpeggio or strum `pattern`, one character per step, repeating: `0`-`9` the chord's notes from
 *   the bottom of the voicing up (past the top they go on an octave higher), `b` the chord's bass note,
 *   `f` the fifth above it, `B` the bass an octave up, `s` a strum down, `u` a lighter strum up, `.` nothing.
 * - a bass `pattern`: `R` root, `5` fifth, `8` octave, `3` third, `.` nothing.
 * - a drum `pattern`: `X` accent, `x` hit, `o` soft, `.` nothing.
 */

export type InstId =
  | 'lute' | 'harp' | 'koto' | 'dulcimer' | 'pluckBass'
  | 'flute' | 'recorder' | 'ney' | 'reed' | 'fiddle' | 'horn' | 'brass'
  | 'celesta' | 'bell' | 'strings' | 'choir' | 'organ' | 'warmPad' | 'icePad' | 'lowStrings' | 'sineBass';
export type DrumId = 'taiko' | 'tom' | 'frame' | 'slap' | 'tamb' | 'shaker' | 'dum' | 'tek' | 'timpani' | 'anvil' | 'cymbal' | 'zill' | 'bowl';
export type AmbienceId = 'crackle' | 'crickets' | 'birds' | 'owl' | 'frogs' | 'wind' | 'drips' | 'lava' | 'glints' | 'chimes' | 'toll';
export type SongId = 'camp' | 'meadow' | 'desert' | 'gloom' | 'frost' | 'deep' | 'shrine' | 'boss';

/** Plays in pass `pass` (0, 1, 2... times through the song) at bar `bar` (0 to 15)? */
export type When = (pass: number, bar: number) => boolean;

export type Part =
  | { kind: 'line'; inst: InstId | 'lead'; notes: string; gain: number; oct?: number; pan?: number; when?: When; harmony?: boolean }
  | { kind: 'arp'; inst: InstId; pattern: string; center: number; low?: number; gain: number; len?: number; pan?: number; when?: When }
  | { kind: 'pad'; inst: InstId; center: number; gain: number; pattern?: string; len?: number; pan?: number; when?: When }
  | { kind: 'bass'; inst: InstId; pattern: string; low: number; gain: number; len?: number; pan?: number; when?: When }
  | { kind: 'drum'; inst: DrumId; pattern: string; gain: number; pan?: number; when?: When };

export interface Song {
  id: SongId;
  title: string;
  /** Beats per minute, and steps per beat (2: eighths, 4: sixteenths, 3: eighths of a 6/8 dotted-quarter beat). */
  bpm: number;
  beatSteps: number;
  barSteps: number;
  /** Late off-beats, as a share of a step. */
  swing?: number;
  chords: string;
  /** Pitch classes of the key's scale (for harmony lines a third below the tune). */
  scale: number[];
  /** The lead instrument (parts on 'lead'); a scene may swap it. */
  lead: InstId;
  /** Reverb send, 0 to 1. */
  reverb: number;
  gain: number;
  parts: Part[];
}

// ------------------------------------------------------------------ theory
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A note name's MIDI number: C4 = 60, F#5 = 78, Bb3 = 58. */
export function noteNum(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note "${name}"`);
  return LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m6: [0, 3, 7, 9],
  '6': [0, 4, 7, 9],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 2],
  madd9: [0, 3, 7, 2],
  dim: [0, 3, 6],
  '5': [0, 7],
};

export interface Chord {
  /** Pitch class of the root (0 = C). */
  root: number;
  /** Pitch classes of its notes. */
  tones: number[];
  /** Pitch class of its bass (the root unless written over another, as in G/B). */
  bass: number;
}

export function parseChord(sym: string): Chord {
  const m = /^([A-G])([#b]?)(maj7|madd9|m7|m6|m|7|6|sus2|sus4|add9|dim|5)?(?:\/([A-G])([#b]?))?$/.exec(sym);
  if (!m) throw new Error(`bad chord "${sym}"`);
  const pc = (l: string, acc: string | undefined) => (LETTER[l] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
  const root = pc(m[1], m[2]);
  const tones = QUALITY[m[3] ?? ''].map((t) => (root + t) % 12);
  return { root, tones, bass: m[4] ? pc(m[4], m[5]) : root };
}

/** The chord's notes placed nearest `center` (within six semitones), lowest first: smooth voice leading for free. */
export function voice(ch: Chord, center: number): number[] {
  const out = new Set<number>();
  for (const pc of ch.tones) {
    let n = center - 6 + ((pc - (center - 6)) % 12 + 12) % 12;
    if (n >= center + 6) n -= 12;
    out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** The `k`-th note up an arpeggio of `notes` (past the top, an octave higher). */
export function arpNote(notes: number[], k: number): number {
  return notes[k % notes.length] + 12 * Math.floor(k / notes.length);
}

/** The lowest note of pitch class `pc` at or above `low`. */
export function atOrAbove(pc: number, low: number): number {
  return low + (((pc - low) % 12) + 12) % 12;
}

export interface NoteEv {
  /** Step from the start of the song. */
  at: number;
  n: number;
  len: number;
}

/** Parses a melody; bar lines (`|`) must fall on bar boundaries, and the whole must fill `bars` bars. */
export function parseLine(src: string, barSteps: number, bars: number, what = 'line'): NoteEv[] {
  const out: NoteEv[] = [];
  let at = 0;
  for (const tok of src.trim().split(/\s+/)) {
    if (tok === '|') {
      if (at % barSteps !== 0) throw new Error(`${what}: bar line at step ${at} (bar ${Math.floor(at / barSteps) + 1} is ${at % barSteps} steps over)`);
      continue;
    }
    const [name, lenStr] = tok.split(':');
    const len = Number(lenStr ?? 1);
    if (!(len > 0)) throw new Error(`${what}: bad length in "${tok}"`);
    if (name !== '-') out.push({ at, n: noteNum(name), len });
    at += len;
  }
  if (at !== barSteps * bars) throw new Error(`${what}: ${at} steps, want ${barSteps * bars}`);
  return out;
}

/** The scale note two steps below `n` (a diatonic third under it), or null for a note off the scale. */
export function thirdBelow(n: number, scale: number[]): number | null {
  const pc = ((n % 12) + 12) % 12;
  const i = scale.indexOf(pc);
  if (i < 0) return null;
  const below = scale[(i - 2 + scale.length) % scale.length];
  const d = (pc - below + 12) % 12;
  return n - d;
}

// ------------------------------------------------------------------ the songs
const C_MAJOR = [0, 2, 4, 5, 7, 9, 11];
const G_MAJOR = [7, 9, 11, 0, 2, 4, 6];
const A_MINOR = [9, 11, 0, 2, 4, 5, 7];
const A_HARMONIC = [9, 11, 0, 2, 4, 5, 8];
const E_MINOR = [4, 6, 7, 9, 11, 0, 2];
const D_MINOR = [2, 4, 5, 7, 9, 10, 0];

const A = (bar: number) => bar < 8;
const B = (bar: number) => bar >= 8;

export const SONGS: Record<SongId, Song> = {
  /**
   * Embers and Stars: the camp at night. A lullaby in 6/8, a lute rocking under a wooden flute, a
   * Pachelbel bass stepping down; the fire crackles and the crickets keep time.
   */
  camp: {
    id: 'camp',
    title: 'Embers and Stars',
    bpm: 54,
    beatSteps: 3,
    barSteps: 6,
    swing: 0.04,
    chords: 'C G/B Am Em/G F C/E Dm7 G | F G Em7 Am Dm7 G C G7',
    scale: C_MAJOR,
    lead: 'flute',
    reverb: 0.32,
    gain: 0.9,
    parts: [
      { kind: 'arp', inst: 'lute', pattern: 'b01210', center: 61, low: 40, gain: 0.5, len: 5, pan: -0.15 },
      {
        kind: 'line', inst: 'lead', gain: 0.42, pan: 0.1,
        // The tune rests through the A section every third pass (just the lute and the fire).
        when: (p, bar) => !(p % 3 === 2 && A(bar)),
        notes: `
          G4:2 C5:1 E5:3 | D5:2 C5:1 B4:3 | C5:2 A4:1 E5:3 | D5:3 B4:3 |
          A4:2 C5:1 F5:3 | E5:2 D5:1 C5:3 | D5:2 E5:1 F5:2 A5:1 | G5:3 F5:1 E5:1 D5:1 |
          C5:2 F5:1 A5:3 | G5:3 D5:3 | G5:2 F5:1 E5:2 D5:1 | E5:3 C5:3 |
          F5:2 E5:1 D5:2 C5:1 | B4:2 C5:1 D5:3 | E5:2 D5:1 C5:3 | D5:2 F5:1 D5:2 B4:1 |`,
      },
      // Second pass: the harp takes the tune up an octave, softly, with the flute.
      {
        kind: 'line', inst: 'harp', gain: 0.28, oct: 1, pan: -0.25, when: (p) => p % 3 === 1,
        notes: `
          G4:2 C5:1 E5:3 | D5:2 C5:1 B4:3 | C5:2 A4:1 E5:3 | D5:3 B4:3 |
          A4:2 C5:1 F5:3 | E5:2 D5:1 C5:3 | D5:2 E5:1 F5:2 A5:1 | G5:3 F5:1 E5:1 D5:1 |
          C5:2 F5:1 A5:3 | G5:3 D5:3 | G5:2 F5:1 E5:2 D5:1 | E5:3 C5:3 |
          F5:2 E5:1 D5:2 C5:1 | B4:2 C5:1 D5:3 | E5:2 D5:1 C5:3 | D5:2 F5:1 D5:2 B4:1 |`,
      },
      // Third pass: a second flute a third below through the B section.
      {
        kind: 'line', inst: 'lead', gain: 0.24, pan: -0.2, harmony: true, when: (p, bar) => p % 3 === 2 && B(bar),
        notes: `
          G4:2 C5:1 E5:3 | D5:2 C5:1 B4:3 | C5:2 A4:1 E5:3 | D5:3 B4:3 |
          A4:2 C5:1 F5:3 | E5:2 D5:1 C5:3 | D5:2 E5:1 F5:2 A5:1 | G5:3 F5:1 E5:1 D5:1 |
          C5:2 F5:1 A5:3 | G5:3 D5:3 | G5:2 F5:1 E5:2 D5:1 | E5:3 C5:3 |
          F5:2 E5:1 D5:2 C5:1 | B4:2 C5:1 D5:3 | E5:2 D5:1 C5:3 | D5:2 F5:1 D5:2 B4:1 |`,
      },
      { kind: 'pad', inst: 'warmPad', center: 62, gain: 0.16, when: (p) => p > 0 },
      { kind: 'bass', inst: 'sineBass', pattern: 'R.....', low: 33, gain: 0.22, len: 5, when: (p) => p > 0 },
      { kind: 'drum', inst: 'frame', pattern: 'o..o..', gain: 0.35, when: (p, bar) => p > 0 && B(bar) },
    ],
  },

  /**
   * The Mossy Road: bright country (the hamlet and the farmland). A strummed lute's boom-chick, a
   * frame drum and a tambourine under a tune that skips along in G.
   */
  meadow: {
    id: 'meadow',
    title: 'The Mossy Road',
    bpm: 112,
    beatSteps: 2,
    barSteps: 8,
    swing: 0.12,
    chords: 'G D Em C G C D G | Em C G D Em C Am7 D',
    scale: G_MAJOR,
    lead: 'flute',
    reverb: 0.18,
    gain: 0.85,
    parts: [
      { kind: 'arp', inst: 'lute', pattern: 'b.s.f.su', center: 60, low: 40, gain: 0.42, len: 2, pan: -0.2 },
      {
        kind: 'line', inst: 'lead', gain: 0.4, pan: 0.12, when: (p, bar) => !(p % 3 === 2 && A(bar)),
        notes: `
          D5:2 G5:2 A5:1 B5:1 A5:1 G5:1 | F#5:2 A5:2 D5:4 | E5:2 G5:1 F#5:1 E5:2 B4:2 | C5:2 E5:2 G5:4 |
          B5:2 A5:1 G5:1 D5:2 G5:2 | E5:2 G5:1 E5:1 C5:2 E5:2 | D5:1 E5:1 F#5:1 G5:1 A5:2 F#5:2 | G5:6 -:2 |
          B5:3 A5:1 G5:2 E5:2 | G5:2 E5:1 G5:1 C6:4 | B5:2 A5:1 G5:1 A5:2 B5:2 | A5:6 F#5:2 |
          G5:3 F#5:1 E5:2 B4:2 | C5:2 E5:2 G5:2 E5:2 | A5:2 G5:1 E5:1 D5:2 C5:2 | D5:4 F#5:2 A5:2 |`,
      },
      // While the tune rests (every third pass's A section), the dulcimer plays it an octave down.
      {
        kind: 'line', inst: 'dulcimer', gain: 0.3, oct: -1, pan: 0.25, when: (p, bar) => p % 3 === 2 && A(bar),
        notes: `
          D5:2 G5:2 A5:1 B5:1 A5:1 G5:1 | F#5:2 A5:2 D5:4 | E5:2 G5:1 F#5:1 E5:2 B4:2 | C5:2 E5:2 G5:4 |
          B5:2 A5:1 G5:1 D5:2 G5:2 | E5:2 G5:1 E5:1 C5:2 E5:2 | D5:1 E5:1 F#5:1 G5:1 A5:2 F#5:2 | G5:6 -:2 |
          -:64 |`,
      },
      {
        kind: 'line', inst: 'recorder', gain: 0.2, harmony: true, pan: -0.3, when: (p, bar) => p % 3 === 1 && B(bar),
        notes: `
          -:64 |
          B5:3 A5:1 G5:2 E5:2 | G5:2 E5:1 G5:1 C6:4 | B5:2 A5:1 G5:1 A5:2 B5:2 | A5:6 F#5:2 |
          G5:3 F#5:1 E5:2 B4:2 | C5:2 E5:2 G5:2 E5:2 | A5:2 G5:1 E5:1 D5:2 C5:2 | D5:4 F#5:2 A5:2 |`,
      },
      { kind: 'bass', inst: 'pluckBass', pattern: 'R...5...', low: 31, gain: 0.3, len: 3, when: (p) => p > 0 },
      { kind: 'drum', inst: 'frame', pattern: 'X...x...', gain: 0.4 },
      { kind: 'drum', inst: 'tamb', pattern: '..x...x.', gain: 0.22, pan: 0.3 },
      { kind: 'drum', inst: 'shaker', pattern: '.o.o.o.o', gain: 0.16, pan: -0.3, when: (p) => p > 0 },
    ],
  },

  /**
   * Sun-Bleached Caravan: the desert. An oud's broken chords and a breathy ney over the Andalusian
   * cadence (Am G F E), its E chords sharpened to the Hijaz scale; darbuka in the maqsum rhythm.
   */
  desert: {
    id: 'desert',
    title: 'Sun-Bleached Caravan',
    bpm: 92,
    beatSteps: 4,
    barSteps: 16,
    swing: 0.06,
    chords: 'Am G F E Am G F E | Dm Am Dm E F E F E',
    scale: A_HARMONIC,
    lead: 'ney',
    reverb: 0.3,
    gain: 0.85,
    parts: [
      { kind: 'arp', inst: 'lute', pattern: 'b..0..1.b..2..1.', center: 57, low: 40, gain: 0.42, len: 6, pan: -0.15 },
      {
        kind: 'line', inst: 'lead', gain: 0.38, pan: 0.1, when: (p, bar) => !(p % 3 === 2 && bar < 4),
        notes: `
          E5:4 A5:4 C6:2 B5:2 A5:4 | B5:4 G5:2 A5:2 B5:4 D6:4 | C6:6 A5:2 F5:4 A5:4 | G#5:6 F5:2 E5:8 |
          A4:4 C5:4 E5:4 A5:4 | G5:4 F5:2 E5:2 D5:4 B4:4 | C5:4 D5:2 E5:2 F5:4 A5:4 | B5:4 G#5:4 E5:8 |
          F5:4 E5:2 D5:2 F5:4 A5:4 | C6:6 B5:2 A5:8 | D6:4 C6:2 B5:2 A5:4 F5:4 | G#5:6 A5:2 B5:8 |
          A5:4 G#5:2 A5:2 C6:4 A5:4 | B5:4 A5:2 G#5:2 F5:4 E5:4 | F5:4 A5:4 C6:4 D6:2 C6:2 | B5:4 G#5:4 E5:8 |`,
      },
      {
        kind: 'line', inst: 'koto', gain: 0.24, pan: 0.3, when: (p, bar) => p % 3 === 1 && B(bar),
        notes: `
          -:128 |
          F5:4 E5:2 D5:2 F5:4 A5:4 | C6:6 B5:2 A5:8 | D6:4 C6:2 B5:2 A5:4 F5:4 | G#5:6 A5:2 B5:8 |
          A5:4 G#5:2 A5:2 C6:4 A5:4 | B5:4 A5:2 G#5:2 F5:4 E5:4 | F5:4 A5:4 C6:4 D6:2 C6:2 | B5:4 G#5:4 E5:8 |`,
      },
      { kind: 'bass', inst: 'pluckBass', pattern: 'R.......R.....5.', low: 33, gain: 0.3, len: 6, when: (p) => p > 0 },
      { kind: 'pad', inst: 'strings', center: 57, gain: 0.08, when: (p, bar) => p > 0 && B(bar) },
      { kind: 'drum', inst: 'dum', pattern: 'X.......X.......', gain: 0.5 },
      { kind: 'drum', inst: 'tek', pattern: '..x...x.....x.oo', gain: 0.32, pan: 0.2 },
      { kind: 'drum', inst: 'zill', pattern: '....o.......o...', gain: 0.18, pan: -0.3, when: (p, bar) => p > 0 && B(bar) },
    ],
  },

  /**
   * Gloomwood: the dark places (the forest, the swamp, the graveyard). A harp rolling in A minor,
   * a low flute, a far-off drum; the E major chord at the end of each phrase pulls it back to the start.
   */
  gloom: {
    id: 'gloom',
    title: 'Gloomwood',
    bpm: 76,
    beatSteps: 2,
    barSteps: 8,
    chords: 'Am F G Em Am F Dm E | F C G Am Dm Am F E',
    scale: A_MINOR,
    lead: 'flute',
    reverb: 0.42,
    gain: 0.9,
    parts: [
      { kind: 'arp', inst: 'harp', pattern: 'b0123210', center: 57, low: 33, gain: 0.36, len: 6, pan: -0.15 },
      {
        kind: 'line', inst: 'lead', gain: 0.38, pan: 0.12, when: (p, bar) => !(p % 3 === 2 && A(bar)),
        notes: `
          E5:4 D5:2 C5:2 | A4:6 C5:2 | B4:3 C5:1 D5:4 | E5:6 -:2 |
          A5:4 G5:2 E5:2 | F5:3 E5:1 C5:4 | D5:3 E5:1 F5:2 D5:2 | E5:2 D5:2 B4:2 G#4:2 |
          A4:2 C5:2 F5:4 | G5:4 E5:4 | D5:4 B4:2 D5:2 | C5:2 B4:2 A4:4 |
          F5:4 E5:2 D5:2 | E5:4 C5:2 A4:2 | C5:2 D5:2 E5:2 F5:2 | E5:6 -:2 |`,
      },
      {
        kind: 'line', inst: 'lead', gain: 0.2, harmony: true, pan: -0.25, when: (p, bar) => p % 3 === 1 && B(bar),
        notes: `
          -:64 |
          A4:2 C5:2 F5:4 | G5:4 E5:4 | D5:4 B4:2 D5:2 | C5:2 B4:2 A4:4 |
          F5:4 E5:2 D5:2 | E5:4 C5:2 A4:2 | C5:2 D5:2 E5:2 F5:2 | E5:6 -:2 |`,
      },
      { kind: 'pad', inst: 'strings', center: 55, gain: 0.13, when: (p) => p > 0 },
      { kind: 'drum', inst: 'tom', pattern: 'x.......' + '......o.', gain: 0.32 },
      { kind: 'drum', inst: 'frame', pattern: '....o...', gain: 0.2, when: (p, bar) => p % 3 === 2 && B(bar) },
    ],
  },

  /**
   * Hoarfrost: the cold places (the tundra, the crystal caves). Slow and wide in E minor: a celesta
   * sparkling up two octaves, an icy pad, long flute notes, and a singing bowl now and then.
   */
  frost: {
    id: 'frost',
    title: 'Hoarfrost',
    bpm: 68,
    beatSteps: 2,
    barSteps: 8,
    chords: 'Em C G D Em C Am D | C D Bm Em C D Esus4 Em',
    scale: E_MINOR,
    lead: 'flute',
    reverb: 0.5,
    gain: 0.9,
    parts: [
      { kind: 'arp', inst: 'celesta', pattern: '01234321', center: 64, gain: 0.22, len: 3, pan: 0.2 },
      { kind: 'bass', inst: 'harp', pattern: 'R...5...', low: 40, gain: 0.34, len: 6, pan: -0.2 },
      {
        kind: 'line', inst: 'lead', gain: 0.36, pan: -0.05, when: (p, bar) => !(p % 3 === 2 && A(bar)),
        notes: `
          E5:2 B5:6 | A5:2 G5:2 E5:4 | D5:2 G5:2 B5:4 | A5:6 F#5:2 |
          G5:2 F#5:2 E5:2 B4:2 | C5:2 E5:2 G5:4 | A5:4 G5:2 E5:2 | F#5:6 -:2 |
          E6:4 D6:2 B5:2 | A5:4 F#5:4 | D6:2 B5:2 F#5:4 | G5:6 -:2 |
          E5:2 G5:2 C6:4 | B5:2 A5:2 F#5:4 | A5:4 B5:4 | G5:6 E5:2 |`,
      },
      {
        kind: 'line', inst: 'harp', gain: 0.24, oct: -1, pan: 0.3, when: (p, bar) => p % 3 === 1 && B(bar),
        notes: `
          -:64 |
          E6:4 D6:2 B5:2 | A5:4 F#5:4 | D6:2 B5:2 F#5:4 | G5:6 -:2 |
          E5:2 G5:2 C6:4 | B5:2 A5:2 F#5:4 | A5:4 B5:4 | G5:6 E5:2 |`,
      },
      { kind: 'pad', inst: 'icePad', center: 60, gain: 0.16 },
      { kind: 'drum', inst: 'bowl', pattern: 'o' + '.'.repeat(31), gain: 0.3, when: (p) => p > 0 },
    ],
  },

  /**
   * Below the Barrow: the deep places (the crypt, the ember caves). A low ostinato pounding in D
   * minor, taiko drums, and a slow, sorrowful tune that climbs as the B section rises to its A major.
   */
  deep: {
    id: 'deep',
    title: 'Below the Barrow',
    bpm: 88,
    beatSteps: 4,
    barSteps: 16,
    chords: 'Dm Dm Bb C Dm Dm Gm A | Bb C Dm Dm Bb C A A',
    scale: D_MINOR,
    lead: 'horn',
    reverb: 0.45,
    gain: 0.85,
    parts: [
      { kind: 'arp', inst: 'lowStrings', pattern: 'b.b.f.b.B.b.f.b.', center: 50, low: 38, gain: 0.34, len: 2 },
      {
        kind: 'line', inst: 'lead', gain: 0.34, pan: 0.1, when: (p, bar) => !(p % 3 === 2 && A(bar)),
        notes: `
          D5:6 E5:2 F5:8 | E5:4 D5:4 A4:8 | Bb4:6 C5:2 D5:8 | E5:6 D5:2 C5:8 |
          F5:6 G5:2 A5:8 | G5:4 F5:4 D5:8 | Bb5:6 A5:2 G5:4 F5:4 | E5:8 C#5:8 |
          F5:8 D5:4 F5:4 | G5:8 E5:4 G5:4 | A5:8 G5:4 F5:4 | E5:4 F5:4 D5:8 |
          D6:8 Bb5:4 F5:4 | C6:8 G5:4 E5:4 | A5:8 G5:4 E5:4 | E5:8 C#5:8 |`,
      },
      // The rest pass: the harp picks out the tune's shape, an octave down, while the drums hold.
      {
        kind: 'line', inst: 'harp', gain: 0.26, oct: -1, pan: -0.3, when: (p, bar) => p % 3 === 2 && A(bar),
        notes: `
          D5:6 E5:2 F5:8 | E5:4 D5:4 A4:8 | Bb4:6 C5:2 D5:8 | E5:6 D5:2 C5:8 |
          F5:6 G5:2 A5:8 | G5:4 F5:4 D5:8 | Bb5:6 A5:2 G5:4 F5:4 | E5:8 C#5:8 |
          -:128 |`,
      },
      { kind: 'pad', inst: 'choir', center: 57, gain: 0.12, when: (p) => p > 0 },
      { kind: 'drum', inst: 'taiko', pattern: 'X.......X.....o.' + 'X.......X...x.x.', gain: 0.5 },
      { kind: 'drum', inst: 'tom', pattern: '....o.......o...', gain: 0.24, when: (p) => p > 0 },
      { kind: 'drum', inst: 'cymbal', pattern: 'o' + '.'.repeat(127), gain: 0.18, when: (p) => p > 0 },
    ],
  },

  /**
   * Lantern Shrine: the shrine's stillness. A koto and a bamboo flute in the A minor pentatonic (the
   * reward ladder's own notes), a soft choir, a singing bowl every other bar, wind chimes.
   */
  shrine: {
    id: 'shrine',
    title: 'Lantern Shrine',
    bpm: 64,
    beatSteps: 2,
    barSteps: 8,
    chords: 'Am C Dsus2 Am C G Am Am | Fmaj7 C G Am Fmaj7 G Asus4 Am',
    scale: A_MINOR,
    lead: 'ney',
    reverb: 0.5,
    gain: 0.9,
    parts: [
      { kind: 'arp', inst: 'koto', pattern: 'b.01.2.1', center: 64, low: 45, gain: 0.36, len: 6, pan: -0.2 },
      {
        kind: 'line', inst: 'lead', gain: 0.36, pan: 0.15, when: (p, bar) => !(p % 3 === 2 && A(bar)),
        notes: `
          E5:3 G5:1 A5:4 | G5:2 E5:2 D5:4 | E5:2 D5:2 A4:4 | C5:2 D5:2 A4:4 |
          E5:3 G5:1 C6:4 | D6:2 C6:2 A5:2 G5:2 | A5:4 E5:4 | A4:8 |
          A5:4 G5:2 E5:2 | G5:4 E5:4 | D5:3 E5:1 G5:4 | A5:8 |
          C6:4 A5:2 G5:2 | A5:2 G5:2 E5:2 D5:2 | D5:4 E5:4 | A4:8 |`,
      },
      {
        kind: 'line', inst: 'koto', gain: 0.26, oct: 1, pan: 0.3, when: (p, bar) => p % 3 === 1 && B(bar),
        notes: `
          -:64 |
          A5:4 G5:2 E5:2 | G5:4 E5:4 | D5:3 E5:1 G5:4 | A5:8 |
          C6:4 A5:2 G5:2 | A5:2 G5:2 E5:2 D5:2 | D5:4 E5:4 | A4:8 |`,
      },
      { kind: 'pad', inst: 'choir', center: 62, gain: 0.1, when: (p) => p > 0 },
      { kind: 'drum', inst: 'bowl', pattern: 'o' + '.'.repeat(15), gain: 0.32 },
    ],
  },

  /**
   * The Iron Tyrant: boss floors. Galloping low strings in A minor, war drums and brass; the B
   * section climbs through D minor to a Hijaz run down from the top before it all comes round again.
   */
  boss: {
    id: 'boss',
    title: 'The Iron Tyrant',
    bpm: 136,
    beatSteps: 4,
    barSteps: 16,
    chords: 'Am Am F G Am Am F E | Dm E Am F Dm F E E',
    scale: A_HARMONIC,
    lead: 'brass',
    reverb: 0.22,
    gain: 0.85,
    parts: [
      { kind: 'arp', inst: 'lowStrings', pattern: 'b.bbB.bbb.bbf.bb', center: 45, low: 33, gain: 0.32, len: 1 },
      {
        kind: 'line', inst: 'lead', gain: 0.32, pan: 0.08,
        notes: `
          A4:6 E4:2 A4:4 B4:2 C5:2 | B4:6 A4:2 G4:4 E4:4 | A4:6 C5:2 F5:4 E5:2 D5:2 | E5:6 D5:2 B4:8 |
          C5:6 B4:2 A4:4 E5:4 | D5:4 C5:4 B4:4 A4:4 | C5:6 A4:2 F4:4 A4:4 | B4:8 G#4:4 E4:4 |
          F5:4 E5:4 D5:4 A4:4 | G#5:4 F5:4 E5:4 B4:4 | C6:8 B5:4 A5:4 | A5:6 G5:2 F5:8 |
          D5:4 F5:4 A5:4 G5:4 | F5:4 A5:4 C6:8 | B5:8 G#5:4 E5:4 | B5:4 G#5:4 F5:4 E5:4 |`,
      },
      // From the second pass, the horns double it an octave down.
      {
        kind: 'line', inst: 'horn', gain: 0.2, oct: -1, pan: -0.15, when: (p) => p > 0,
        notes: `
          A4:6 E4:2 A4:4 B4:2 C5:2 | B4:6 A4:2 G4:4 E4:4 | A4:6 C5:2 F5:4 E5:2 D5:2 | E5:6 D5:2 B4:8 |
          C5:6 B4:2 A4:4 E5:4 | D5:4 C5:4 B4:4 A4:4 | C5:6 A4:2 F4:4 A4:4 | B4:8 G#4:4 E4:4 |
          F5:4 E5:4 D5:4 A4:4 | G#5:4 F5:4 E5:4 B4:4 | C6:8 B5:4 A5:4 | A5:6 G5:2 F5:8 |
          D5:4 F5:4 A5:4 G5:4 | F5:4 A5:4 C6:8 | B5:8 G#5:4 E5:4 | B5:4 G#5:4 F5:4 E5:4 |`,
      },
      { kind: 'pad', inst: 'brass', center: 60, gain: 0.12, pattern: 'X.....x.........', len: 3, when: (_p, bar) => A(bar) && bar % 4 === 0 },
      { kind: 'pad', inst: 'strings', center: 60, gain: 0.12, when: (_p, bar) => B(bar) },
      { kind: 'drum', inst: 'taiko', pattern: 'X.......X.x.....', gain: 0.55 },
      { kind: 'drum', inst: 'slap', pattern: '....X.......X...', gain: 0.36 },
      { kind: 'drum', inst: 'tom', pattern: '........x.x.xxXX', gain: 0.4, when: (_p, bar) => bar % 8 === 7 },
      { kind: 'drum', inst: 'anvil', pattern: '....x.......x...', gain: 0.18, pan: 0.35, when: (p, bar) => p > 0 && B(bar) },
      { kind: 'drum', inst: 'cymbal', pattern: 'x' + '.'.repeat(127), gain: 0.22 },
      { kind: 'drum', inst: 'shaker', pattern: 'o.o.o.o.o.o.o.o.', gain: 0.1, pan: -0.35, when: (p) => p > 0 },
    ],
  },
};

/** Each bar's chord, parsed: `|` (between sections) is skipped. */
export function songChords(song: Song): Chord[] {
  return song.chords.split(/\s+/).filter((s) => s && s !== '|').map(parseChord);
}

/** The victory sting (a boss falls): a brass call up the C major chord, F to C (an "amen"), bells, a timpani roll. */
export const VICTORY = {
  /** [seconds from the start, MIDI notes, seconds held] */
  brass: [
    [0, [67], 0.14],
    [0.15, [72], 0.14],
    [0.3, [76], 0.14],
    [0.45, [79], 0.5],
    [1.0, [65, 69, 72, 77], 0.42],
    [1.5, [60, 64, 67, 72, 76], 1.9],
  ] as Array<[number, number[], number]>,
  bells: [[1.5, 84], [1.56, 88], [1.62, 91], [1.68, 96]] as Array<[number, number]>,
  /** The harp's run up from the call's top note into the F chord. */
  harp: [79, 81, 84, 86, 88, 91, 93, 96],
  timpani: [[0, 48], [1.0, 41], [1.5, 36]] as Array<[number, number]>,
  /** Seconds until the music behind it may come back. */
  length: 3.6,
};
