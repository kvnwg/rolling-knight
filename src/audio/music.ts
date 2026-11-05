/**
 * The music: Dumpster Legend's step sequencer (scheduled a moment ahead on the audio clock, picking
 * the beat back up if the page stalls, ducking and swelling under big moments), grown into a small
 * band. Each scene plays a looping theme from songs.ts with its own lead instrument, tempo and
 * ambience (the camp's fire and crickets, the swamp's frogs...); a new scene crossfades in over the
 * old. A boss falling plays a victory sting over the music. Silent until `unlock` (the first tap);
 * nothing here touches the browser at import.
 */
import type { BiomeId } from '../world/biomes';
import { BIOMES } from '../world/biomes';
import { engine, guarded, makeRnd, type Graph } from './engine';
import { ambience, bed, drum, play, strum, toneFor, warmDrums, type Out } from './instruments';
import {
  SONGS, VICTORY, arpNote, atOrAbove, parseLine, songChords, thirdBelow, voice,
  type AmbienceId, type DrumId, type InstId, type Song, type SongId, type When,
} from './songs';

export type MusicScene = 'camp' | 'boss' | BiomeId | 'farmland';

interface SceneDef {
  song: SongId;
  /** In place of the song's lead. */
  lead?: InstId;
  /** Times the song's tempo. */
  tempo?: number;
  ambience?: AmbienceId[];
  /** Seconds to fade in over the scene before (default 2.5). */
  fade?: number;
}

/** Which theme each scene plays, and how. */
export const SCENES: Record<MusicScene, SceneDef> = {
  camp: { song: 'camp', ambience: ['crackle', 'crickets'], fade: 3 },
  hamlet: { song: 'meadow', ambience: ['birds'] },
  farmland: { song: 'meadow', lead: 'fiddle', tempo: 1.05, ambience: ['birds', 'crickets'] },
  desert: { song: 'desert', ambience: ['wind'] },
  forest: { song: 'gloom', ambience: ['owl', 'crickets'] },
  swamp: { song: 'gloom', lead: 'reed', tempo: 0.92, ambience: ['frogs'] },
  graveyard: { song: 'gloom', lead: 'celesta', tempo: 0.9, ambience: ['wind', 'toll'] },
  tundra: { song: 'frost', ambience: ['wind'] },
  crystal: { song: 'frost', lead: 'bell', tempo: 1.08, ambience: ['glints'] },
  crypt: { song: 'deep', lead: 'organ', tempo: 0.9, ambience: ['drips'] },
  ember: { song: 'deep', lead: 'horn', tempo: 1.12, ambience: ['lava'] },
  shrine: { song: 'shrine', ambience: ['chimes'] },
  boss: { song: 'boss', fade: 0.9 },
};

const isScene = (s: string): s is MusicScene => Object.prototype.hasOwnProperty.call(SCENES, s);

/** How far ahead the music is scheduled (s): a busy moment shorter than this never makes it skip. */
const AHEAD = 0.3;
/** Seconds the old scene takes to fade out under the new one. */
const FADE_OUT = 2.2;
/** The music's level under the sound effects (at full volume), as Dumpster Legend's sat. */
const LEVEL = 0.45;

// ------------------------------------------------------------------ the graph
/** The music's nodes: the loops (ducked) and the stings (not), both into a shared reverb and tone filter. */
export interface MusicGraph {
  ctx: BaseAudioContext;
  noise: AudioBuffer;
  /** Players' dry and reverb sends land here; both are ducked together. */
  loop: GainNode;
  loopWet: GainNode;
  sting: GainNode;
}

/** A synthesized room: stereo noise decaying over `seconds`, darker as it fades. */
function impulse(ctx: BaseAudioContext, seconds: number, rnd: () => number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.012);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const k = i / len;
      lp += (0.85 - 0.7 * k) * (rnd() * 2 - 1 - lp);
      d[i] = lp * Math.exp((-6.9 * (i - pre)) / sr / (seconds * 0.85));
    }
  }
  return buf;
}

/** Builds the music's chain on `ctx`, into `dest` (the engine's music volume; a test's destination). */
export function buildMusicGraph(ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer): MusicGraph {
  const rnd = makeRnd(0xc0ffee);
  const level = ctx.createGain();
  level.gain.value = LEVEL;
  level.connect(dest);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 10000;
  tone.Q.value = 0.5;
  tone.connect(level);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 2.3, rnd);
  const ret = ctx.createGain();
  ret.gain.value = 0.7;
  verb.connect(ret);
  ret.connect(tone);
  const loop = ctx.createGain();
  loop.connect(tone);
  const loopWet = ctx.createGain();
  loopWet.connect(verb);
  const sting = ctx.createGain();
  sting.connect(tone);
  const stingWet = ctx.createGain();
  stingWet.gain.value = 0.35;
  sting.connect(stingWet);
  stingWet.connect(verb);
  return { ctx, noise, loop, loopWet, sting };
}

// ------------------------------------------------------------------ compiled songs
type Ev =
  | { kind: 'note'; part: number; inst: InstId | 'lead'; notes: number[]; len: number; vel: number; strum?: 'down' | 'up' }
  | { kind: 'drum'; part: number; inst: DrumId; vel: number };

interface Compiled {
  song: Song;
  /** Events at each step of the 16 bars. */
  steps: Ev[][];
  when: Array<When | undefined>;
  pans: number[];
  /** Each bar's chord root, from A3 up (what a tuned drum rings on). */
  roots: number[];
}

const VEL: Record<string, number> = { X: 1, x: 0.72, o: 0.42 };
const BARS = 16;
const compiled = new Map<SongId, Compiled>();

/** Turns a song's chords, melodies and patterns into events, step by step (once per song). */
export function compile(song: Song): Compiled {
  const hit = compiled.get(song.id);
  if (hit) return hit;
  const chords = songChords(song);
  if (chords.length !== BARS) throw new Error(`${song.id}: ${chords.length} chords, want ${BARS}`);
  const total = BARS * song.barSteps;
  const steps: Ev[][] = Array.from({ length: total }, () => []);
  const accent = (at: number) => (at % song.barSteps === 0 ? 1 : at % song.beatSteps === 0 ? 0.9 : 0.78);
  song.parts.forEach((p, part) => {
    switch (p.kind) {
      case 'line': {
        for (const e of parseLine(p.notes, song.barSteps, BARS, `${song.id} ${p.inst}`)) {
          const n = e.n + 12 * (p.oct ?? 0);
          const h = p.harmony ? thirdBelow(n, song.scale) : n;
          if (h === null) continue;
          steps[e.at].push({ kind: 'note', part, inst: p.inst, notes: [h], len: e.len, vel: p.gain * accent(e.at) });
        }
        break;
      }
      case 'arp':
      case 'bass':
      case 'pad':
      case 'drum': {
        const pat = p.kind === 'pad' ? (p.pattern ?? 'X' + '.'.repeat(song.barSteps - 1)) : p.pattern;
        for (let s = 0; s < total; s++) {
          const c = pat[s % pat.length];
          if (c === '.') continue;
          const bar = Math.floor(s / song.barSteps);
          const ch = chords[bar];
          if (p.kind === 'drum') {
            steps[s].push({ kind: 'drum', part, inst: p.inst, vel: p.gain * (VEL[c] ?? 0.7) });
            continue;
          }
          if (p.kind === 'pad') {
            const len = p.len ?? song.barSteps;
            steps[s].push({ kind: 'note', part, inst: p.inst, notes: voice(ch, p.center), len, vel: p.gain * (VEL[c] ?? 1) });
            continue;
          }
          if (p.kind === 'bass') {
            const root = atOrAbove(ch.bass, p.low);
            const third = ch.tones[1] ?? ch.tones[0];
            const n = c === 'R' ? root : c === '5' ? atOrAbove((ch.root + 7) % 12, root) : c === '8' ? root + 12 : c === '3' ? atOrAbove(third, root) : root;
            steps[s].push({ kind: 'note', part, inst: p.inst, notes: [n], len: p.len ?? song.beatSteps, vel: p.gain * accent(s) });
            continue;
          }
          // An arpeggio or strum.
          const v = voice(ch, p.center);
          const low = atOrAbove(ch.bass, p.low ?? p.center - 18);
          const len = p.len ?? 2;
          let notes: number[];
          let st: 'down' | 'up' | undefined;
          if (c === 'b') notes = [low];
          else if (c === 'B') notes = [low + 12];
          else if (c === 'f') notes = [atOrAbove((ch.root + 7) % 12, low + 1)];
          else if (c === 's' || c === 'u') {
            notes = v;
            st = c === 's' ? 'down' : 'up';
          } else notes = [arpNote(v, Number(c))];
          steps[s].push({ kind: 'note', part, inst: p.inst, notes, len, vel: p.gain * accent(s), strum: st });
        }
        break;
      }
    }
  });
  const out: Compiled = {
    song, steps, when: song.parts.map((p) => p.when), pans: song.parts.map((p) => p.pan ?? 0), roots: chords.map((c) => atOrAbove(c.root, 57)),
  };
  compiled.set(song.id, out);
  return out;
}

// ------------------------------------------------------------------ a scene playing
/** One scene's theme playing: its own channels into the music graph, scheduled step by step. */
export class Player {
  readonly scene: MusicScene;
  readonly c: Compiled;
  private readonly def: SceneDef;
  private readonly mg: MusicGraph;
  private readonly out: GainNode;
  private readonly wet: GainNode;
  private readonly channels = new Map<string, AudioNode>();
  private readonly rnd: () => number;
  private readonly beds: AudioScheduledSourceNode[] = [];
  readonly stepSec: number;
  private step = 0;
  private pass = 0;
  /** Audio time of the next step. */
  next: number;
  /** Audio time it's silent and can go (Infinity while it plays). */
  endsAt = Infinity;

  constructor(mg: MusicGraph, scene: MusicScene, at: number, fadeIn: number, seed = 1) {
    this.mg = mg;
    this.scene = scene;
    this.def = SCENES[scene];
    this.c = compile(SONGS[this.def.song]);
    const song = this.c.song;
    this.rnd = makeRnd(seed);
    this.stepSec = 60 / (song.bpm * (this.def.tempo ?? 1)) / song.beatSteps;
    const ctx = mg.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.gain.setValueAtTime(0, at);
    this.out.gain.linearRampToValueAtTime(song.gain, at + Math.max(0.05, fadeIn));
    this.out.connect(mg.loop);
    this.wet = ctx.createGain();
    this.wet.gain.value = song.reverb;
    this.out.connect(this.wet);
    this.wet.connect(mg.loopWet);
    this.next = at;
    for (const a of this.def.ambience ?? []) this.beds.push(...bed(this.voiceFor('amb', 0), a, at));
  }

  /** The node a part's notes go into: one per instrument and pan. */
  private voiceFor(key: string, pan: number): Out {
    const k = `${key}:${pan}`;
    let node = this.channels.get(k);
    if (!node) {
      const ctx = this.mg.ctx;
      const g = ctx.createGain();
      let tail: AudioNode = g;
      // A plucked string's tone filter, once for the channel rather than once a note.
      const tone = toneFor(key as InstId);
      if (tone) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = tone;
        f.Q.value = 0.5;
        tail.connect(f);
        tail = f;
      }
      if (pan && typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        tail.connect(p);
        tail = p;
      }
      tail.connect(this.out);
      node = g;
      this.channels.set(k, node);
    }
    return { ctx: this.mg.ctx, dest: node, noise: this.mg.noise, rnd: this.rnd };
  }

  /** Schedules every step that starts before `until` (audio time). */
  tick(until: number): void {
    const now = this.mg.ctx.currentTime;
    const steps = this.c.steps.length;
    // Fell behind (the page was too busy, or the audio was asleep): pick the beat up where it is now
    // rather than playing every missed note at once.
    if (this.next < now - 0.05) {
      const missed = Math.ceil((now - this.next) / this.stepSec);
      this.next += missed * this.stepSec;
      const s = this.step + missed;
      this.pass += Math.floor(s / steps);
      this.step = s % steps;
    }
    while (this.next < until && this.next < this.endsAt) {
      this.playStep(this.step, this.next);
      this.next += this.stepSec;
      this.step += 1;
      if (this.step >= steps) {
        this.step = 0;
        this.pass += 1;
      }
    }
  }

  private playStep(s: number, at: number): void {
    const song = this.c.song;
    const bar = Math.floor(s / song.barSteps);
    const swing = s % 2 === 1 ? (song.swing ?? 0) * this.stepSec : 0;
    const t = at + swing;
    for (const ev of this.c.steps[s]) {
      const when = this.c.when[ev.part];
      if (when && !when(this.pass, bar)) continue;
      const pan = this.c.pans[ev.part];
      // A hair of looseness in time and touch, so it plays like hands and not a grid.
      const jitter = (this.rnd() * 2 - 1) * 0.004;
      const vel = ev.vel * (0.92 + this.rnd() * 0.16);
      if (ev.kind === 'drum') {
        const n = ev.inst === 'bowl' || ev.inst === 'timpani' ? this.c.roots[bar] - (ev.inst === 'timpani' ? 24 : 0) : undefined;
        drum(this.voiceFor(ev.inst, pan), ev.inst, Math.max(at, t + jitter), vel, n);
        continue;
      }
      const inst: InstId = ev.inst === 'lead' ? (this.def.lead ?? song.lead) : ev.inst;
      const out = this.voiceFor(inst, pan);
      const dur = ev.len * this.stepSec;
      if (ev.strum) strum(out, inst, ev.notes, Math.max(at, t + jitter), dur, vel, ev.strum === 'up');
      else for (const n of ev.notes) play(out, inst, n, Math.max(at, t + jitter), dur, vel);
    }
    const ambOut = this.def.ambience?.length ? this.voiceFor('amb', 0) : null;
    if (ambOut) for (const a of this.def.ambience!) ambience(ambOut, a, t, this.stepSec, s % song.barSteps === 0, this.pass * BARS + bar);
  }

  /** Fades out over `seconds` from `at`, then stops scheduling. */
  fadeOut(at: number, seconds: number): void {
    const g = this.out.gain;
    hold(g, at);
    g.linearRampToValueAtTime(0, at + seconds);
    this.endsAt = at + seconds;
    for (const b of this.beds) {
      try {
        b.stop(at + seconds + 0.1);
      } catch {
        /* already stopped */
      }
    }
  }

  /** Lets go of its nodes once silent. */
  dispose(): void {
    this.out.disconnect();
    this.wet.disconnect();
  }

  /** Seconds from audio time `now` to its next beat. */
  toBeat(now: number): number {
    const bs = this.c.song.beatSteps;
    const k = (bs - (this.step % bs)) % bs;
    return this.next + k * this.stepSec - now;
  }
}

/** Holds an automated value where it is at `at`, so a new ramp starts from there. */
function hold(p: AudioParam, at: number): void {
  const h = (p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam }).cancelAndHoldAtTime;
  if (typeof h === 'function') h.call(p, at);
  else {
    const v = p.value;
    p.cancelScheduledValues(at);
    p.setValueAtTime(v, at);
  }
}

/** Plays the victory sting into `out` from audio time `at`. */
export function playVictory(out: Out, at: number): void {
  for (const [t, notes, len] of VICTORY.brass) {
    // (A chord's notes share the loudness of the call's single ones.)
    const v = 0.26 / Math.sqrt(notes.length);
    for (const n of notes) play(out, 'brass', n, at + t, len, v);
    if (notes.length > 1) play(out, 'horn', notes[0] - 12, at + t, len, 0.16);
  }
  VICTORY.harp.forEach((n, k) => play(out, 'harp', n, at + 0.5 + k * 0.055, 1.2, 0.18));
  for (const [t, n] of VICTORY.bells) play(out, 'celesta', n, at + t, 1.6, 0.2);
  for (const [t, n] of VICTORY.timpani) drum(out, 'timpani', at + t, 0.55, n);
  // A timpani roll into the last chord, and a cymbal on it.
  for (let k = 0; k < 8; k++) drum(out, 'timpani', at + 1.05 + k * 0.055, 0.15 + k * 0.03, 43);
  drum(out, 'cymbal', at + 1.5, 0.5);
  for (const n of [60, 64, 67, 72]) play(out, 'strings', n, at + 1.5, 1.8, 0.12);
}

// ------------------------------------------------------------------ the music
class Music {
  private mg: MusicGraph | null = null;
  private graph: Graph | null = null;
  private players: Player[] = [];
  private want: MusicScene | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hooked = false;
  private seed = 1;
  /** The last scene that wasn't the boss's: the music goes back to it after a victory. */
  private calm: MusicScene | null = null;
  private backTimer: ReturnType<typeof setTimeout> | null = null;

  /** Call from a user gesture (safe to call again): starts the audio and the scene set so far. */
  unlock(): void {
    if (!this.hooked) {
      this.hooked = true;
      engine.onBuild((g) => this.rebuilt(g));
    }
    engine.unlock();
    this.sync();
  }

  /** Volume, 0 to 1; at 0 the music stops playing altogether (and starts again when turned up). */
  setVolume(v: number): void {
    engine.setMusicVolume(v);
    this.sync();
  }

  /**
   * Crossfades to `scene`'s theme (the same scene again changes nothing). Before the audio is
   * unlocked it's remembered, and starts with it.
   */
  setScene(scene: MusicScene): void {
    if (!isScene(scene) || scene === this.want) return;
    this.want = scene;
    if (scene !== 'boss') this.calm = scene;
    if (this.backTimer) {
      clearTimeout(this.backTimer);
      this.backTimer = null;
    }
    const g = engine.live;
    if (!g || !this.mg || engine.musicVolume <= 0) {
      this.sync();
      return;
    }
    this.start(scene, g.ctx.currentTime + 0.05);
  }

  /** The scene for a biome by id or by name (floorStart events carry the name), if it has one. */
  sceneFor(biome: string): MusicScene | null {
    if (isScene(biome)) return biome;
    const hit = Object.values(BIOMES).find((b) => b.name === biome);
    return hit ? hit.id : null;
  }

  /** The scene the music is on (or will start on), if any. */
  current(): MusicScene | null {
    return this.want;
  }

  /** Dips the music (to `depth` of its level) for `seconds`, then swells it back up a little past where it was. */
  duck(seconds: number, depth = 0.35): void {
    const mg = this.mg;
    const g = engine.live;
    if (!mg || !g) return;
    const now = g.ctx.currentTime;
    for (const p of [mg.loop.gain, mg.loopWet.gain]) {
      p.cancelScheduledValues(now);
      p.setTargetAtTime(Math.max(0.0001, depth), now, 0.03);
      p.setTargetAtTime(1.15, now + Math.max(0, seconds), 0.25);
      p.setTargetAtTime(1, now + Math.max(0, seconds) + 1.2, 0.4);
    }
  }

  /** Fades the music out and stops it (setScene starts it again). */
  stop(): void {
    this.want = null;
    if (this.backTimer) {
      clearTimeout(this.backTimer);
      this.backTimer = null;
    }
    const g = engine.graph;
    if (g) for (const p of this.players) if (p.endsAt === Infinity) p.fadeOut(g.ctx.currentTime, 1.2);
  }

  /**
   * A boss falls: the victory sting, over the music ducked low until it's done; then, from the
   * boss's theme, back to the place's own (the scene before 'boss'). True if it played.
   */
  victory(): boolean {
    const mg = this.mg;
    const g = engine.live;
    if (!mg || !g || engine.musicVolume <= 0) return false;
    const at = g.ctx.currentTime + 0.05;
    this.duck(VICTORY.length, 0.12);
    playVictory({ ctx: g.ctx, dest: mg.sting, noise: mg.noise, rnd: makeRnd(this.seed++) }, at);
    const back = this.calm;
    if (this.want === 'boss' && back) {
      if (this.backTimer) clearTimeout(this.backTimer);
      this.backTimer = setTimeout(() => {
        this.backTimer = null;
        if (this.want === 'boss') this.setScene(back);
      }, (VICTORY.length - 1.2) * 1000);
    }
    return true;
  }

  /** Seconds to the music's next beat, if it comes within `max` (else 0): stings can wait for it. */
  beatDelay(max = 0.25): number {
    const g = engine.live;
    const p = this.players.find((x) => x.endsAt === Infinity);
    if (!g || !p) return 0;
    const d = p.toBeat(g.ctx.currentTime);
    return d > 0 && d <= max ? d : 0;
  }

  // ------------------------------------------------------------------ inside
  private rebuilt(g: Graph): void {
    // A new audio graph (the first, or one replacing a broken context): the old players went with the old one.
    this.players = [];
    this.graph = g;
    this.mg = buildMusicGraph(g.ctx, g.music, g.noise);
    void warmDrums(g.noise);
    this.sync();
  }

  private start(scene: MusicScene, at: number): void {
    const mg = this.mg;
    if (!mg) return;
    const fadeIn = this.players.length ? (SCENES[scene].fade ?? 2.5) : Math.min(1.5, SCENES[scene].fade ?? 1.5);
    // Two scenes at most: a third change mid-crossfade cuts the oldest short.
    const live = this.players.filter((p) => p.endsAt === Infinity);
    for (const p of live) p.fadeOut(at, scene === 'boss' ? 0.8 : FADE_OUT);
    const fading = this.players.filter((p) => p.endsAt !== Infinity && !live.includes(p));
    for (const p of fading) p.fadeOut(at, 0.15);
    this.players.push(new Player(mg, scene, at, fadeIn, this.seed++));
    this.run();
  }

  /** Starts or stops the music to match the volume, the wanted scene and the audio's state. */
  private sync(): void {
    const g = engine.graph;
    if (!g || !this.mg) return;
    if (engine.musicVolume <= 0) {
      for (const p of this.players) if (p.endsAt === Infinity) p.fadeOut(g.ctx.currentTime, 0.3);
      return;
    }
    this.run();
  }

  private run(): void {
    this.timer ??= setInterval(() => this.schedule(), 25);
  }

  private schedule(): void {
    try {
      const g = engine.graph;
      if (!g || !this.mg || this.graph !== g) return;
      const ctx = g.ctx;
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const playing = this.players.some((p) => p.endsAt === Infinity);
      if (!playing && this.want && engine.musicVolume > 0) this.start(this.want, now + 0.05);
      for (const p of this.players) p.tick(now + AHEAD);
      for (const p of this.players) if (p.endsAt + 3 < now) p.dispose();
      this.players = this.players.filter((p) => p.endsAt + 3 >= now);
      if (!this.players.length && (!this.want || engine.musicVolume <= 0) && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    } catch (e) {
      if (import.meta.env?.DEV) console.warn('music', e);
    }
  }
}

export const music = guarded(new Music());
