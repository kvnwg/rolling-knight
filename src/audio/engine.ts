/**
 * The audio engine under the sound effects (sfx.ts) and the music (music.ts), ported from Dumpster
 * Legend's (its src/services/audio.ts): one AudioContext for both, made on the first tap and never at
 * import (Node tests import these modules), a compressor on the way out, the recordings decoded and
 * played at the loudness of the synthesized sounds they replace, a cap on how many sound effects play
 * at once, and a watchdog that brings the sound back when a phone knocks it out.
 */
import { SOUND_FILES, SOUND_LEVELS } from './soundFiles';

/** A MIDI note's frequency (69 = A4 = 440 Hz). */
export const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  freqEnd?: number;
  detune?: number;
  filter?: number;
  q?: number;
  vibrato?: number;
}

export interface NoiseOpts {
  gain?: number;
  type?: BiquadFilterType;
  freq?: number;
  q?: number;
  freqEnd?: number;
  attack?: number;
}

/** The nodes everything plays through. Rebuilt (all of it) when the watchdog replaces a broken context. */
export interface Graph {
  ctx: AudioContext;
  /** Everything: the silence drop moves it. */
  master: GainNode;
  /** The sound effects, at their volume. */
  sfx: GainNode;
  /** The music, at its volume (music.ts builds its own chain into it). */
  music: GainNode;
  /** Two seconds of white noise, looped from a random point by every noise voice. */
  noise: AudioBuffer;
}

interface Recording {
  buf: AudioBuffer;
  /** Where the sound starts (s), past the silence an MP3 encoder puts in front. */
  from: number;
}

export interface RecOpts {
  /** Semitones up (playback rate). */
  semis?: number;
  /** Times the recording's matched level. */
  gain?: number;
  /** End exactly this many seconds from `at`: a longer recording starts partway in (faded in), a shorter one waits. */
  fit?: number;
  bus?: AudioNode;
}

/**
 * Most sound effects at once (each a few audio nodes); past it new ones are dropped until some end. A
 * phone's audio thread that gets more than it can mix in time crackles and drops out.
 */
const MAX_SFX_VOICES = 48;
/** How often the audio checks on itself (ms), and the least time between rebuilding it (ms). */
const WATCH_MS = 1000;
const REBUILD_GAP_MS = 8000;

/** A small fast PRNG (mulberry32), so the audio's randomness never touches the game's seeded RNG. */
export function makeRnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** A file's bytes. The single-file build inlines files as data: URLs, read here (its page may not fetch them). */
async function bytesOf(url: string): Promise<ArrayBuffer> {
  if (!url.startsWith('data:')) return (await fetch(url)).arrayBuffer();
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** decodeAudioData in its promise form, or its callback form (older Safari). */
function decode(ctx: BaseAudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(bytes, resolve, reject) as Promise<AudioBuffer> | undefined;
    p?.then(resolve, reject);
  });
}

/** Seconds of near-silence at the start of a decoded recording (up to 0.1 s). */
function leadIn(buf: AudioBuffer): number {
  const max = Math.min(buf.length, Math.round(buf.sampleRate * 0.1));
  let first = max;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < first; i++) {
      if (Math.abs(d[i]) > 1e-3) {
        first = i;
        break;
      }
    }
  }
  return first === max ? 0 : first / buf.sampleRate;
}

class Engine {
  graph: Graph | null = null;
  readonly rnd = makeRnd(0x5eed);
  private builders: Array<(g: Graph) => void> = [];
  private sfxVol = 0.7;
  private musicVol = 0.5;
  private recs = new Map<string, Recording>();
  private loading: Promise<void> | null = null;
  private loaded = false;
  /** Sound effects playing right now (MAX_SFX_VOICES). */
  private sfxVoices = 0;
  /** The very end of the chain: watched for broken output (NaN) by the watchdog. */
  private probe: AnalyserNode | null = null;
  private probeBuf: Float32Array | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  /** The context's clock at the last check, and how many checks in a row it hasn't moved while running. */
  private lastClock = -1;
  private stuck = 0;
  private rebuiltAt = -1e9;
  /** Suspended on purpose (the page is in the background): the watchdog leaves it be. */
  private parked = false;
  private listening = false;

  /**
   * Call from a user gesture (any number of times): makes the audio on the first call, and wakes it
   * whenever the browser has put it to sleep. Also starts decoding the recordings.
   */
  unlock(): Graph | null {
    try {
      if (!this.graph) this.build();
      this.listen();
      void this.preload();
      this.parked = false;
      this.wake();
    } catch {
      /* no audio available */
    }
    return this.graph;
  }

  /** `cb` runs on every audio graph made: now if there is one, and again after each rebuild. */
  onBuild(cb: (g: Graph) => void): void {
    this.builders.push(cb);
    if (this.graph) cb(this.graph);
  }

  /** The graph while its context is running (sounds made at any other time would only pile up). */
  get live(): Graph | null {
    const g = this.graph;
    return g && g.ctx.state === 'running' ? g : null;
  }

  /** Volumes 0 to 1, on a squared curve so the slider feels even to the ear. */
  setSfxVolume(v: number): void {
    this.sfxVol = clamp01(v);
    const g = this.graph;
    if (g) g.sfx.gain.setTargetAtTime(this.sfxVol * this.sfxVol, g.ctx.currentTime, 0.02);
  }

  setMusicVolume(v: number): void {
    this.musicVol = clamp01(v);
    const g = this.graph;
    if (g) g.music.gain.setTargetAtTime(this.musicVol * this.musicVol, g.ctx.currentTime, 0.1);
  }

  get sfxVolume(): number {
    return this.sfxVol;
  }

  get musicVolume(): number {
    return this.musicVol;
  }

  /**
   * Decodes the recordings (call at startup, so they're ready by the first tap: decoding needs no
   * tap; unlock calls it too). A sound whose recording fails to load stays synthesized.
   */
  preload(): Promise<void> {
    this.loading ??= this.load()
      .catch(() => {})
      .then(() => {
        this.loaded = true;
      });
    return this.loading;
  }

  private async load(): Promise<void> {
    const names = Object.keys(SOUND_FILES);
    if (typeof window === 'undefined' || names.length === 0) return;
    const OAC = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OAC) return;
    // Decoded at 48 kHz, the rate most devices play at (any other is resampled as it plays).
    const dec = new OAC(2, 1, 48000);
    await Promise.all(
      names.map(async (name) => {
        try {
          const buf = await decode(dec, await bytesOf(SOUND_FILES[name]));
          this.recs.set(name, { buf, from: leadIn(buf) });
        } catch {
          /* stays synthesized */
        }
      }),
    );
  }

  hasRec(name: string): boolean {
    return this.recs.has(name);
  }

  /** The sound effect voice cap is reached: new sounds are dropped. */
  get full(): boolean {
    return this.sfxVoices >= MAX_SFX_VOICES;
  }

  /** Counts a sound effect's voice while it plays (MAX_SFX_VOICES). */
  voice(src: AudioScheduledSourceNode): void {
    this.sfxVoices++;
    src.onended = () => {
      this.sfxVoices = Math.max(0, this.sfxVoices - 1);
      src.disconnect();
    };
  }

  /**
   * Plays the recording of `name` if there is one (true when it did: the caller skips its synthesized
   * stand-in), at its matched level times `gain`, `semis` semitones up. Over the voice cap it's
   * dropped, and true all the same (the stand-in is dropped with it).
   */
  rec(name: string, at: number, o: RecOpts = {}): boolean {
    const r = this.recs.get(name);
    const g = this.graph;
    if (!r || !g) return false;
    if (this.full) return true;
    const ctx = g.ctx;
    const rate = Math.pow(2, (o.semis ?? 0) / 12);
    const level = (SOUND_LEVELS[name] ?? 1) * (o.gain ?? 1);
    let start = at;
    let from = r.from;
    const src = ctx.createBufferSource();
    src.buffer = r.buf;
    src.playbackRate.value = rate;
    const gn = ctx.createGain();
    gn.gain.value = level;
    if (o.fit !== undefined) {
      const len = (r.buf.duration - r.from) / rate;
      if (len > o.fit) {
        from += (len - Math.max(0, o.fit)) * rate;
        gn.gain.setValueAtTime(0, start);
        gn.gain.linearRampToValueAtTime(level, start + 0.04);
      } else start += o.fit - len;
    }
    src.connect(gn);
    gn.connect(o.bus ?? g.sfx);
    src.start(start, from);
    this.voice(src);
    return true;
  }

  /**
   * Runs `play` once the audio is running: now, or when the context this same tap is starting comes
   * up (and the recordings, if still decoding, are ready or a moment has passed). Much later it would
   * no longer go with what it was for, and is dropped.
   */
  whenRunning(play: (g: Graph) => void): void {
    const g = this.graph;
    if (!g) return;
    if (g.ctx.state === 'running' && (this.loaded || !this.loading)) {
      play(g);
      return;
    }
    const asked = performance.now();
    const ready = Promise.race([this.loading, new Promise((r) => setTimeout(r, 250))]);
    Promise.all([g.ctx.resume(), ready]).then(
      () => {
        if (this.graph === g && g.ctx.state === 'running' && performance.now() - asked < 400) play(g);
      },
      () => {},
    );
  }

  /** Silence drop: everything cut for a beat (right before a big reveal). */
  silenceDrop(seconds = 0.2): void {
    const g = this.live;
    if (!g) return;
    const now = g.ctx.currentTime;
    g.master.gain.cancelScheduledValues(now);
    g.master.gain.setTargetAtTime(0.03, now, 0.015);
    g.master.gain.setTargetAtTime(0.9, now + seconds, 0.01);
  }

  // ------------------------------------------------------------------ voices
  /** One oscillator note with an exponential envelope (Dumpster Legend's `tone`). */
  tone(dest: AudioNode, freq: number, at: number, dur: number, o: ToneOpts = {}, counted = true): void {
    const g = this.graph;
    if (!g || (counted && this.full)) return;
    const ctx = g.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, at);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), at + dur);
    if (o.detune) osc.detune.value = o.detune;
    const gn = ctx.createGain();
    const peak = Math.max(0.0002, o.gain ?? 0.2);
    const a = o.attack ?? 0.004;
    gn.gain.setValueAtTime(0.0001, at);
    gn.gain.exponentialRampToValueAtTime(peak, at + a);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(a + 0.01, dur));
    let node: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      f.Q.value = o.q ?? 0.7;
      osc.connect(f);
      node = f;
    }
    node.connect(gn);
    gn.connect(dest);
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const lg = ctx.createGain();
      lg.gain.value = o.vibrato;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(at);
      lfo.stop(at + dur + 0.05);
    }
    osc.start(at);
    osc.stop(at + dur + 0.05);
    if (counted) this.voice(osc);
    else osc.onended = () => gn.disconnect();
  }

  /** A burst of filtered noise with an exponential envelope (Dumpster Legend's `noise`). */
  noise(dest: AudioNode, at: number, dur: number, o: NoiseOpts = {}, counted = true): void {
    const g = this.graph;
    if (!g || (counted && this.full)) return;
    const ctx = g.ctx;
    const src = ctx.createBufferSource();
    src.buffer = g.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 1000, at);
    f.Q.value = o.q ?? 1;
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, at + dur);
    const gn = ctx.createGain();
    const peak = Math.max(0.0002, o.gain ?? 0.2);
    const a = o.attack ?? 0.003;
    gn.gain.setValueAtTime(0.0001, at);
    gn.gain.exponentialRampToValueAtTime(peak, at + a);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(a + 0.01, dur));
    src.connect(f);
    f.connect(gn);
    gn.connect(dest);
    src.start(at, this.rnd() * 1.5);
    src.stop(at + dur + 0.05);
    if (counted) this.voice(src);
    else src.onended = () => gn.disconnect();
  }

  /** A struck bell: the note and two inharmonic partials. */
  bell(dest: AudioNode, freq: number, at: number, dur: number, gain = 0.1, counted = true): void {
    this.tone(dest, freq, at, dur, { gain, attack: 0.002 }, counted);
    this.tone(dest, freq * 2.76, at, dur * 0.45, { gain: gain * 0.3, attack: 0.002 }, counted);
    this.tone(dest, freq * 5.4, at, dur * 0.2, { gain: gain * 0.12, attack: 0.001 }, counted);
  }

  // ------------------------------------------------------------------ lifecycle
  private build(): void {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    // The output passes a probe on its way out, so the watchdog can tell if it ever breaks.
    const probe = ctx.createAnalyser();
    probe.fftSize = 256;
    comp.connect(probe);
    probe.connect(ctx.destination);
    this.probe = probe;
    this.probeBuf = new Float32Array(probe.fftSize);
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    const sfx = ctx.createGain();
    sfx.gain.value = this.sfxVol * this.sfxVol;
    sfx.connect(master);
    const music = ctx.createGain();
    music.gain.value = this.musicVol * this.musicVol;
    music.connect(master);
    const len = ctx.sampleRate * 2;
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = this.rnd() * 2 - 1;
    this.sfxVoices = 0;
    this.lastClock = -1;
    this.stuck = 0;
    ctx.onstatechange = () => {
      // Knocked out of running while the game is on screen (iOS: a call, Siri, another app's sound):
      // try to come straight back (a tap does too).
      if (this.graph?.ctx === ctx && ctx.state !== 'running' && ctx.state !== 'closed' && !this.parked && document.visibilityState === 'visible') {
        void ctx.resume().catch(() => {});
      }
    };
    const graph: Graph = { ctx, master, sfx, music, noise };
    this.graph = graph;
    this.watchTimer ??= setInterval(() => this.watch(), WATCH_MS);
    for (const cb of this.builders) {
      try {
        cb(graph);
      } catch {
        /* one listener failing leaves the rest */
      }
    }
  }

  /** Any state but running or closed ('suspended', or iOS's 'interrupted'): every gesture tries to resume. */
  private wake(): void {
    const ctx = this.graph?.ctx;
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {});
  }

  /**
   * Phones only let a tap start audio once the finger lifts (pointerdown isn't enough), and iOS can
   * leave it 'interrupted' after an app switch: every tap's end tries again. In the background the
   * audio is suspended (nothing to hear, and no battery spent), and resumed on return.
   */
  private listen(): void {
    if (this.listening || typeof document === 'undefined') return;
    this.listening = true;
    const retry = () => {
      if (!this.parked) this.wake();
    };
    for (const type of ['pointerup', 'touchend', 'click', 'keydown'] as const) document.addEventListener(type, retry, true);
    document.addEventListener('visibilitychange', () => {
      const ctx = this.graph?.ctx;
      if (document.visibilityState === 'hidden') {
        this.parked = true;
        if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => {});
      } else {
        this.parked = false;
        this.wake();
      }
    });
  }

  /**
   * The watchdog (Dumpster Legend: "sound randomly cuts out"). Every second, while the game is on
   * screen: audio knocked out of running is resumed; a context whose clock has stopped though it says
   * it's running (it happens on iPhones after an interruption), or whose output has gone bad (one
   * broken value poisons everything after it for good), is thrown away and built anew, music and all.
   */
  private watch(): void {
    const ctx = this.graph?.ctx;
    if (!ctx || this.parked || document.visibilityState !== 'visible') {
      this.stuck = 0;
      this.lastClock = -1;
      return;
    }
    const state = ctx.state as string;
    if (state === 'closed') return this.rebuild();
    if (state !== 'running') {
      this.lastClock = -1;
      this.wake();
      return;
    }
    this.stuck = ctx.currentTime === this.lastClock ? this.stuck + 1 : 0;
    this.lastClock = ctx.currentTime;
    let broken = this.stuck >= 3;
    const probe = this.probe;
    const buf = this.probeBuf;
    if (!broken && probe && buf) {
      probe.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
      for (let i = 0; i < buf.length; i += 8) {
        if (!Number.isFinite(buf[i])) {
          broken = true;
          break;
        }
      }
    }
    if (broken) this.rebuild();
  }

  /** A fresh audio context in place of a broken one (at most every REBUILD_GAP_MS). */
  private rebuild(): void {
    const now = performance.now();
    if (now - this.rebuiltAt < REBUILD_GAP_MS) return;
    this.rebuiltAt = now;
    const old = this.graph?.ctx;
    this.graph = null;
    if (old) {
      old.onstatechange = null;
      void old.close().catch(() => {});
    }
    try {
      this.build();
    } catch {
      return;
    }
    this.wake();
  }
}

export const engine = new Engine();

/**
 * Nothing the audio does can break the game: every call that fails (a node the browser refused, a
 * value it didn't like) is dropped quietly, never thrown into a game update.
 */
export function guarded<T extends object>(o: T): T {
  const proto = Object.getPrototypeOf(o) as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue;
    const desc = Object.getOwnPropertyDescriptor(proto, key);
    const fn = desc?.value;
    if (typeof fn !== 'function') continue;
    Object.defineProperty(o, key, {
      value: (...args: unknown[]) => {
        try {
          return (fn as (...a: unknown[]) => unknown).apply(o, args);
        } catch (e) {
          if (import.meta.env?.DEV) console.warn('audio', key, e);
          return undefined;
        }
      },
      writable: true,
      configurable: true,
    });
  }
  return o;
}
