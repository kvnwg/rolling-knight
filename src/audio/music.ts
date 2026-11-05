/**
 * The music: a recorded track for each scene (tracks.ts: Kevin MacLeod's, cut into seamless loops),
 * with the place's own sounds under it (ambience.ts: the camp's fire and crickets, the swamp's
 * frogs...); a new scene crossfades in over the old. A boss falling plays a victory sting over the
 * boss's theme, ducked low, then the music goes back to the place's own. Big moments duck it and
 * swell it back.
 *
 * Tracks are decoded when a scene first wants one (that scene's first, one at a time), and the last
 * few kept decoded; while a track decodes, the scene before plays on. Silent until `unlock` (the
 * first tap); nothing here touches the browser at import.
 */
import type { BiomeId } from '../world/biomes';
import { BIOMES } from '../world/biomes';
import { ambience, bed, C_PENTATONIC, type AmbienceId, type Out } from './ambience';
import { bytesOf, decode, engine, guarded, makeRnd, type Graph } from './engine';
import { MUSIC_FILES, STINGS, TRACKS, type StingId, type TrackId } from './tracks';

export type MusicScene = 'camp' | 'boss' | BiomeId | 'farmland';

interface SceneDef {
  track: TrackId;
  ambience?: AmbienceId[];
  /** Pitch classes the place's tuned sounds (glints, chimes) pick from, in the track's key (default C major pentatonic). */
  tones?: number[];
  /** Seconds to fade in over the scene before (default 2.5). */
  fade?: number;
}

/** G minor pentatonic (G Bb C D F): The Snow Queen's key, for the crystal caves' glints. */
const G_MINOR_PENTATONIC = [7, 10, 0, 2, 5];

/** Which track each scene plays, and the place's sounds under it. */
export const SCENES: Record<MusicScene, SceneDef> = {
  camp: { track: 'tavern', ambience: ['crackle', 'crickets'], fade: 3 },
  hamlet: { track: 'village', ambience: ['birds'] },
  farmland: { track: 'inn', ambience: ['birds', 'crickets'] },
  desert: { track: 'desert', ambience: ['wind'] },
  forest: { track: 'celtic', ambience: ['owl', 'crickets'] },
  swamp: { track: 'celtic', ambience: ['frogs'] },
  graveyard: { track: 'angevin', ambience: ['wind', 'toll'] },
  tundra: { track: 'snow', ambience: ['wind'] },
  crystal: { track: 'snow', ambience: ['glints'], tones: G_MINOR_PENTATONIC },
  dungeon: { track: 'angevin', ambience: ['drips'] },
  crypt: { track: 'angevin', ambience: ['drips'] },
  ember: { track: 'emperor', ambience: ['lava'] },
  shrine: { track: 'village', ambience: ['chimes'] },
  boss: { track: 'axes', fade: 0.9 },
};

const isScene = (s: string): s is MusicScene => Object.prototype.hasOwnProperty.call(SCENES, s);

/** How far ahead the places' sounds are scheduled (s): a busy moment shorter than this never makes them skip. */
const AHEAD = 0.3;
/** Seconds the old scene takes to fade out under the new one. */
const FADE_OUT = 2.2;
/**
 * The music's level under the sound effects (at full volume). The tracks are at -18 LUFS: this puts
 * them a little under where the synthesized themes before them sat (about -24 LUFS here).
 */
const LEVEL = 0.45;
/** The places' sounds under a track (as loud as they were under the old themes), and their room's share. */
const AMB_LEVEL = 0.88;
const AMB_WET = 0.32;
/** The places' sounds step on their own clock: a step and a bar (s, steps). */
const AMB_STEP = 0.3;
const AMB_BAR = 8;
/** Decoded tracks kept (each about 20 to 40 MB of samples): the one playing and the one before. */
const KEEP = 2;
/** Seconds before the victory sting's end that the place's own track starts coming back in. */
const STING_BACK = 1.2;

// ------------------------------------------------------------------ the graph
/** The music's nodes: the scenes (ducked) and the sting (not), into one level. */
export interface MusicGraph {
  ctx: BaseAudioContext;
  noise: AudioBuffer;
  /** The scenes' tracks and sounds play into this; it's what ducks. */
  loop: GainNode;
  /** A room for the places' sounds (into `loop`). */
  room: AudioNode;
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
  const level = ctx.createGain();
  level.gain.value = LEVEL;
  level.connect(dest);
  const loop = ctx.createGain();
  loop.connect(level);
  const room = ctx.createConvolver();
  room.buffer = impulse(ctx, 2.3, makeRnd(0xc0ffee));
  const ret = ctx.createGain();
  ret.gain.value = 0.7;
  room.connect(ret);
  ret.connect(loop);
  const sting = ctx.createGain();
  sting.connect(level);
  return { ctx, noise, loop, room, sting };
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

// ------------------------------------------------------------------ a scene playing
/**
 * One scene playing: its track looping (if it decoded) and the place's sounds, fading in at `at`;
 * the track from its loop's start, or from `from` (s into the file: where the same track already
 * playing is, so a scene with the same track takes over with no seam).
 */
export class Player {
  readonly scene: MusicScene;
  readonly track: TrackId;
  readonly buf: AudioBuffer | null;
  private readonly def: SceneDef;
  private readonly mg: MusicGraph;
  /** The scene's fades: the track's, and the place's sounds' (into their room too). */
  private readonly fades: GainNode[] = [];
  /** Every node of its own, to let go of at the end. */
  private readonly nodes: AudioNode[] = [];
  private readonly src: AudioBufferSourceNode | null = null;
  private readonly amb: Out | null = null;
  private readonly beds: AudioScheduledSourceNode[] = [];
  /** Audio time the loop's start played (or would have): its position and its beats count from there. */
  private readonly zero: number;
  private readonly bpm: number | null;
  /** Audio time of the places' sounds' next step, and its number. */
  private next: number;
  private step = 0;
  /** Audio time it's silent and can go (Infinity while it plays). */
  endsAt = Infinity;

  constructor(mg: MusicGraph, scene: MusicScene, buf: AudioBuffer | null, at: number, fadeIn: number, seed = 1, from?: number) {
    this.mg = mg;
    this.scene = scene;
    this.def = SCENES[scene];
    this.track = this.def.track;
    this.buf = buf;
    const tr = TRACKS[this.track];
    const ctx = mg.ctx;
    const fade = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + Math.max(0.05, fadeIn));
      g.connect(mg.loop);
      this.fades.push(g);
      this.nodes.push(g);
      return g;
    };
    const offset = from ?? tr.loopStart;
    this.zero = at - (offset - tr.loopStart);
    this.next = at;
    this.bpm = buf ? tr.bpm : null;
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = tr.loopStart;
      src.loopEnd = tr.loopEnd;
      src.connect(fade());
      src.start(at, offset);
      this.src = src;
      this.nodes.push(src);
    }
    if (this.def.ambience?.length) {
      const f = fade();
      const g = ctx.createGain();
      g.gain.value = AMB_LEVEL;
      g.connect(f);
      const wet = ctx.createGain();
      wet.gain.value = AMB_WET;
      f.connect(wet);
      wet.connect(mg.room);
      this.nodes.push(g, wet);
      this.amb = { ctx, dest: g, noise: mg.noise, rnd: makeRnd(seed) };
      for (const a of this.def.ambience) this.beds.push(...bed(this.amb, a, at));
    }
  }

  /** Schedules the places' sounds for every step that starts before `until` (audio time). */
  tick(until: number): void {
    const amb = this.amb;
    const list = this.def.ambience;
    if (!amb || !list) return;
    const now = this.mg.ctx.currentTime;
    // Fell behind (the page was too busy, or the audio was asleep): pick up where it is now.
    if (this.next < now - 0.05) {
      const missed = Math.ceil((now - this.next) / AMB_STEP);
      this.next += missed * AMB_STEP;
      this.step += missed;
    }
    const tones = this.def.tones ?? C_PENTATONIC;
    while (this.next < until && this.next < this.endsAt) {
      const bar = Math.floor(this.step / AMB_BAR);
      for (const a of list) ambience(amb, a, this.next, AMB_STEP, this.step % AMB_BAR === 0, bar, tones);
      this.next += AMB_STEP;
      this.step += 1;
    }
  }

  /** Fades out over `seconds` from `at`, then stops. */
  fadeOut(at: number, seconds: number): void {
    for (const f of this.fades) {
      hold(f.gain, at);
      f.gain.linearRampToValueAtTime(0, at + seconds);
    }
    this.endsAt = at + seconds;
    for (const s of [...this.beds, ...(this.src ? [this.src] : [])]) {
      try {
        s.stop(at + seconds + 0.1);
      } catch {
        /* already stopped */
      }
    }
  }

  /** Lets go of its nodes once silent. */
  dispose(): void {
    for (const n of this.nodes) n.disconnect();
  }

  /** Where in its file the track plays at audio time `at` (s). */
  position(at: number): number {
    const tr = TRACKS[this.track];
    const len = tr.loopEnd - tr.loopStart;
    const rel = (((at - this.zero) % len) + len) % len;
    return tr.loopStart + rel;
  }

  /** Seconds from audio time `now` to the track's next beat (Infinity for a track with no steady beat). */
  toBeat(now: number): number {
    if (!this.bpm) return Infinity;
    // (Every loop is a whole number of beats, so the beat runs on round it.)
    const beat = 60 / this.bpm;
    const k = Math.ceil((now - this.zero) / beat - 1e-6);
    return this.zero + k * beat - now;
  }
}

// ------------------------------------------------------------------ the music
type Rec = TrackId | StingId;

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
  /** Decoded recordings, the latest wanted last (KEEP tracks, and the sting), the decodes under way, and those that won't decode. */
  private bufs = new Map<Rec, AudioBuffer>();
  private loading = new Map<Rec, Promise<AudioBuffer | null>>();
  private failed = new Set<Rec>();
  /** Decodes run one at a time (a phone decoding several big files at once runs short of memory). */
  private queue: Promise<unknown> = Promise.resolve();
  /** The scene waiting on its track to decode. */
  private pending: MusicScene | null = null;

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
   * Crossfades to `scene`'s track (the same scene again changes nothing), once it's decoded. Before
   * the audio is unlocked it's remembered, and starts with it.
   */
  setScene(scene: MusicScene): void {
    if (!isScene(scene) || scene === this.want) return;
    this.want = scene;
    if (scene !== 'boss') this.calm = scene;
    if (this.backTimer) {
      clearTimeout(this.backTimer);
      this.backTimer = null;
    }
    // (A track that failed to decode gets another try.)
    this.failed.delete(SCENES[scene].track);
    const g = engine.live;
    if (!g || !this.mg || engine.musicVolume <= 0) this.sync();
    else this.begin(scene);
    // The victory sting decodes after the boss's track, ready for its fall.
    if (scene === 'boss') void this.load('victory');
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
    const p = mg.loop.gain;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(Math.max(0.0001, depth), now, 0.03);
    p.setTargetAtTime(1.15, now + Math.max(0, seconds), 0.25);
    p.setTargetAtTime(1, now + Math.max(0, seconds) + 1.2, 0.4);
  }

  /** Fades the music out and stops it (setScene starts it again). */
  stop(): void {
    this.want = null;
    this.pending = null;
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
    const buf = this.bufs.get('victory');
    if (!mg || !g || !buf || engine.musicVolume <= 0) return false;
    const len = STINGS.victory.duration;
    const at = g.ctx.currentTime + 0.05;
    this.duck(len, 0.12);
    const src = g.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(mg.sting);
    src.onended = () => src.disconnect();
    src.start(at);
    const back = this.calm;
    if (this.want === 'boss' && back) {
      if (this.backTimer) clearTimeout(this.backTimer);
      this.backTimer = setTimeout(() => {
        this.backTimer = null;
        if (this.want === 'boss') this.setScene(back);
      }, (len - STING_BACK) * 1000);
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
    // A new audio graph (the first, or one replacing a broken context): the old players went with
    // the old one. Decoded tracks carry over (a buffer plays in any context).
    this.players = [];
    this.graph = g;
    this.mg = buildMusicGraph(g.ctx, g.music, g.noise);
    this.sync();
  }

  /** The decoded recording `id` (decoding it first, after any decodes before it); null if it can't be. */
  private load(id: Rec): Promise<AudioBuffer | null> {
    const hit = this.bufs.get(id);
    if (hit) {
      this.bufs.delete(id);
      this.bufs.set(id, hit);
      return Promise.resolve(hit);
    }
    if (this.failed.has(id)) return Promise.resolve(null);
    let p = this.loading.get(id);
    if (!p) {
      p = this.queue.then(() => this.decodeRec(id)).then((buf) => {
        this.loading.delete(id);
        if (buf) this.keep(id, buf);
        else this.failed.add(id);
        return buf;
      });
      this.queue = p.catch(() => null);
      this.loading.set(id, p);
    }
    return p;
  }

  private async decodeRec(id: Rec): Promise<AudioBuffer | null> {
    const url = MUSIC_FILES[id];
    if (!url || typeof window === 'undefined') return null;
    try {
      const bytes = await bytesOf(url);
      // Decoded at the rate the audio plays at (nothing to resample as it loops); before the first
      // tap there's no context yet, and an offline one at 48 kHz (most devices' rate) stands in.
      const live = engine.graph?.ctx;
      let ctx: BaseAudioContext | null = live ?? null;
      if (!ctx) {
        const OAC = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
        if (!OAC) return null;
        ctx = new OAC(2, 1, 48000);
      }
      const buf = await decode(ctx, bytes);
      if (import.meta.env?.DEV) console.info(`music: decoded ${id} (${buf.duration.toFixed(1)} s, ${buf.sampleRate} Hz)`);
      return buf;
    } catch (e) {
      if (import.meta.env?.DEV) console.warn('music: could not decode', id, e);
      return null;
    }
  }

  /** Keeps a decoded recording, letting go of the least lately wanted track past KEEP (the sting stays: it's small). */
  private keep(id: Rec, buf: AudioBuffer): void {
    this.bufs.set(id, buf);
    const tracks = [...this.bufs.keys()].filter((k) => k !== 'victory');
    for (const k of tracks.slice(0, Math.max(0, tracks.length - KEEP))) this.bufs.delete(k);
  }

  /** Starts `scene` now if its track is decoded, else once it is (if it's still wanted then). */
  private begin(scene: MusicScene): void {
    const g = engine.live;
    if (!g || !this.mg) return;
    const id = SCENES[scene].track;
    const buf = this.bufs.get(id);
    if (buf || this.failed.has(id)) {
      // (A track that won't decode leaves the place's own sounds.)
      this.start(scene, buf ?? null, g.ctx.currentTime + 0.05);
      return;
    }
    if (this.pending === scene) return;
    this.pending = scene;
    void this.load(id).then((b) => {
      if (this.pending === scene) this.pending = null;
      const live = engine.live;
      if (!live || !this.mg || this.want !== scene || engine.musicVolume <= 0) return;
      if (this.players.some((p) => p.endsAt === Infinity && p.scene === scene)) return;
      this.start(scene, b, live.ctx.currentTime + 0.05);
    });
  }

  private start(scene: MusicScene, buf: AudioBuffer | null, at: number): void {
    const mg = this.mg;
    if (!mg) return;
    const fade = SCENES[scene].fade;
    const fadeIn = this.players.length ? (fade ?? 2.5) : Math.min(1.5, fade ?? 1.5);
    // Two scenes at most: a third change mid-crossfade cuts the oldest short.
    const live = this.players.filter((p) => p.endsAt === Infinity);
    // A scene with the track already playing takes it over where it is (only the place's sounds
    // crossfade: the same music in step, faded across over the same time, sums to itself).
    const same = buf ? live.find((p) => p.track === SCENES[scene].track && p.buf === buf) : undefined;
    for (const p of live) p.fadeOut(at, p === same ? fadeIn : scene === 'boss' ? 0.8 : FADE_OUT);
    const fading = this.players.filter((p) => p.endsAt !== Infinity && !live.includes(p));
    for (const p of fading) p.fadeOut(at, 0.15);
    this.players.push(new Player(mg, scene, buf, at, fadeIn, this.seed++, same?.position(at)));
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
      if (!playing && this.want && engine.musicVolume > 0) this.begin(this.want);
      for (const p of this.players) p.tick(now + AHEAD);
      for (const p of this.players) if (p.endsAt + 3 < now) p.dispose();
      this.players = this.players.filter((p) => p.endsAt + 3 >= now);
      if (!this.players.length && !this.pending && (!this.want || engine.musicVolume <= 0) && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    } catch (e) {
      if (import.meta.env?.DEV) console.warn('music', e);
    }
  }
}

export const music = guarded(new Music());
