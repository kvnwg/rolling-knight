/**
 * The music's instruments, all synthesized with Web Audio: plucked strings (lute, harp, koto,
 * dulcimer, a plucked bass) by Karplus-Strong (a burst of noise circling a short delay line, rendered
 * once for every few notes and re-pitched), breathy flutes, a reed, a fiddle, horns and brass with
 * opening filters, a celesta and bells, string, choir, organ and icy pads; a drum kit of frame drums,
 * taiko, toms, darbuka, tambourine, shaker, timpani, anvil, cymbal, finger cymbals and a singing bowl;
 * and the places' own sounds (a campfire, crickets, birds, an owl, frogs, wind, drips, lava, glints,
 * wind chimes, a far bell).
 *
 * Kept light, as a phone has to mix it under the game: a timbre is a cached PeriodicWave (one
 * oscillator, no filters), automation always ends (a held value costs nothing to compute), and a
 * note's nodes let go as it ends.
 */
import { midi } from './engine';
import type { AmbienceId, DrumId, InstId } from './songs';

/** Where a note goes and what it's made from. */
export interface Out {
  ctx: BaseAudioContext;
  dest: AudioNode;
  noise: AudioBuffer;
  rnd: () => number;
}

// ------------------------------------------------------------------ helpers
/**
 * A note's envelope into `dest`: a linear rise to `peak`, a fall to `sustain` of it over a quarter
 * second, held to `dur`, then an exponential release. Returns the gain and when the note is silent.
 */
function env(ctx: BaseAudioContext, dest: AudioNode, at: number, peak: number, attack: number, dur: number, release: number, sustain = 1): { g: GainNode; end: number } {
  const g = ctx.createGain();
  const p = g.gain;
  const tA = at + attack;
  const tEnd = Math.max(tA + 0.01, at + dur);
  p.setValueAtTime(0, at);
  p.linearRampToValueAtTime(peak, tA);
  const level = Math.max(0.0002, peak * sustain);
  if (sustain !== 1) p.linearRampToValueAtTime(level, Math.min(tEnd, tA + 0.25));
  p.setValueAtTime(level, tEnd);
  p.exponentialRampToValueAtTime(0.0001, tEnd + release);
  g.connect(dest);
  return { g, end: tEnd + release + 0.02 };
}

function osc(ctx: BaseAudioContext, w: OscillatorType | PeriodicWave, freq: number, at: number, end: number, dest: AudioNode, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  if (typeof w === 'string') o.type = w as OscillatorType;
  else o.setPeriodicWave(w);
  o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  o.connect(dest);
  o.start(at);
  o.stop(end);
  return o;
}

/** When `src` ends, `nodes` let go of the graph. */
function release(src: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
  src.onended = () => {
    for (const n of nodes) n.disconnect();
  };
}

/** A slow wobble on `params` (vibrato), easing in over `delay` seconds. */
function vibrato(ctx: BaseAudioContext, params: AudioParam[], rate: number, depth: number, at: number, end: number, delay: number): void {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(depth, at + delay);
  lfo.connect(g);
  for (const p of params) g.connect(p);
  lfo.start(at);
  lfo.stop(end);
  release(lfo, g);
}

function noiseBurst(out: Out, at: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.002, freqEnd = 0): void {
  const { ctx } = out;
  const src = ctx.createBufferSource();
  src.buffer = out.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(Math.min(freq, ctx.sampleRate * 0.45), at);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, at + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(attack + 0.01, dur));
  src.connect(f);
  f.connect(g);
  g.connect(out.dest);
  src.start(at, out.rnd() * 1.5);
  src.stop(at + dur + 0.03);
  release(src, f, g);
}

/** A pitched thump that falls (drums), or any short decaying sine. */
function thump(out: Out, at: number, f0: number, f1: number, dur: number, gain: number): void {
  const { ctx } = out;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g);
  g.connect(out.dest);
  o.start(at);
  o.stop(at + dur + 0.02);
  release(o, g);
}

/** A struck bar or bell: partials at `ratios`, each decaying faster the higher it is. */
function struck(out: Out, f: number, at: number, dur: number, gain: number, ratios: Array<[number, number]>): void {
  const { ctx } = out;
  for (const [r, a] of ratios) {
    const fr = f * r;
    if (fr > ctx.sampleRate * 0.45) continue;
    const o = ctx.createOscillator();
    o.frequency.value = fr;
    const g = ctx.createGain();
    const d = dur / Math.sqrt(r);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * a), at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    o.connect(g);
    g.connect(out.dest);
    o.start(at);
    o.stop(at + d + 0.02);
    release(o, g);
  }
}

// ------------------------------------------------------------------ baked one-shots
/**
 * Drums and struck bars sound the same every time (only louder or softer, higher or lower), so each
 * is rendered once, in the background, by the same code into a buffer (an OfflineAudioContext), and
 * after that played back as one: their envelopes' per-sample curves are the costliest thing here.
 * Until a sound's buffer is ready it plays live.
 */
const BAKE_RATE = 32000;
const baked = new Map<string, AudioBuffer>();
const baking = new Set<string>();

function bake(key: string, seconds: number, noise: AudioBuffer, render: (o: Out) => void, rate = BAKE_RATE): Promise<void> {
  if (baking.has(key) || typeof OfflineAudioContext === 'undefined') return Promise.resolve();
  baking.add(key);
  try {
    const oc = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
    let seed = key.length * 7919;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    render({ ctx: oc, dest: oc.destination, noise, rnd });
    return oc.startRendering().then(
      (b) => {
        baked.set(key, b);
      },
      () => {},
    );
  } catch {
    return Promise.resolve();
  }
}

/** Plays the baked sound `key` (at `rate` times its speed) if it's ready, else `live`, and bakes it for next time. */
function oneShot(out: Out, key: string, seconds: number, at: number, vel: number, rate: number, render: (o: Out) => void, live: () => void, bakeRate = BAKE_RATE): void {
  const buf = baked.get(key);
  if (!buf) {
    live();
    void bake(key, seconds, out.noise, render, bakeRate);
    return;
  }
  const { ctx } = out;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (rate !== 1) src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vel;
  src.connect(g);
  g.connect(out.dest);
  src.start(at);
  release(src, g);
}

// ------------------------------------------------------------------ timbres (PeriodicWaves)
const waveCache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

/** A cached wave from its harmonics' amplitudes (index 1 the fundamental). */
function wave(ctx: BaseAudioContext, key: string, amps: () => number[]): PeriodicWave {
  let m = waveCache.get(ctx);
  if (!m) {
    m = new Map();
    waveCache.set(ctx, m);
  }
  let w = m.get(key);
  if (!w) {
    const a = amps();
    w = ctx.createPeriodicWave(new Float32Array(a.length), new Float32Array(a));
    m.set(key, w);
  }
  return w;
}

const fixed = (h: number[]) => () => [0, ...h];
/** A resonance's gain at `x` Hz (a formant at `f` Hz, `bw` wide). */
const formant = (x: number, f: number, bw: number) => 1 / (1 + ((x - f) / bw) ** 2);
/** A sawtooth shaped by a function of each harmonic's frequency, for the note `n` (cached every three semitones). */
function shaped(ctx: BaseAudioContext, kind: string, n: number, shape: (hz: number, k: number) => number): PeriodicWave {
  const b = Math.round(n / 3) * 3;
  const f = midi(b);
  return wave(ctx, `${kind}:${b}`, () => {
    const H = Math.max(2, Math.min(64, Math.floor(11000 / f)));
    const a = [0];
    for (let k = 1; k <= H; k++) a.push((1 / k) * shape(k * f, k));
    return a;
  });
}

const FLUTE = fixed([1, 0.22, 0.1, 0.04, 0.02]);
const RECORDER = fixed([1, 0.42, 0.3, 0.14, 0.08, 0.05, 0.03]);
const NEY = fixed([1, 0.16, 0.07, 0.03]);
const REED = fixed([1, 0.04, 0.55, 0.03, 0.33, 0.02, 0.2, 0.01, 0.1, 0.01, 0.05]);
const WARM = fixed([1, 0.3, 0.11, 0.06, 0.03]);
const ICE = fixed([1, 0.2, 0, 0.06]);
// Drawbars: 8', 4', 2 2/3', 2', 1 3/5', 1'.
const ORGAN = fixed([1, 0.7, 0.35, 0.45, 0.12, 0.1, 0, 0.18]);
const BASS = fixed([1, 0.3, 0.1]);

// ------------------------------------------------------------------ plucked strings (Karplus-Strong)
interface PluckSpec {
  /** Seconds rendered. */
  dur: number;
  /** Seconds for the fundamental to fall 60 dB. */
  t60: number;
  /** How bright the pluck is (0 soft, 1 raw noise). */
  bright: number;
  /** Where along the string it's plucked (0 to 0.5): near the end is twangy, the middle hollow. */
  pick: number;
  gain: number;
  /** Tone filter on the instrument's channel (Hz). */
  tone: number;
}

const PLUCKS: Partial<Record<InstId, PluckSpec>> = {
  lute: { dur: 1.6, t60: 1.5, bright: 0.45, pick: 0.21, gain: 1.4, tone: 3600 },
  harp: { dur: 2.6, t60: 2.6, bright: 0.3, pick: 0.42, gain: 1.6, tone: 5200 },
  koto: { dur: 2.0, t60: 1.8, bright: 0.72, pick: 0.11, gain: 2.0, tone: 6500 },
  dulcimer: { dur: 2.0, t60: 2.0, bright: 0.85, pick: 0.09, gain: 1.5, tone: 7000 },
  pluckBass: { dur: 1.7, t60: 1.6, bright: 0.25, pick: 0.32, gain: 1.7, tone: 1400 },
};

/** The tone filter an instrument's channel needs (plucks), if any. */
export function toneFor(inst: InstId): number | undefined {
  return PLUCKS[inst]?.tone;
}

/** Plucks are rendered at this rate (the music's tone filter cuts the top anyway): half the memory. */
const PLUCK_RATE = 24000;
/** One rendering serves the notes this many semitones around it (re-pitched by playback rate). */
const PLUCK_SPAN = 3;

interface Pluck {
  buf: AudioBuffer;
  freq: number;
}

const pluckCache = new WeakMap<BaseAudioContext, Map<string, Pluck>>();

function renderPluck(ctx: BaseAudioContext, spec: PluckSpec, n: number, rnd: () => number): Pluck {
  const sr = PLUCK_RATE;
  const f0 = midi(n);
  // The loop's two-tap average makes it half a sample shorter than its length.
  const N = Math.max(3, Math.round(sr / f0 + 0.5));
  const freq = sr / (N - 0.5);
  const len = Math.floor(spec.dur * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const line = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += spec.bright * (rnd() * 2 - 1 - lp);
    line[i] = lp;
  }
  // The pick's position: a comb takes out the harmonics a pluck there can't excite.
  const P = Math.max(1, Math.round(N * spec.pick));
  const ex = line.slice();
  let mean = 0;
  for (let i = 0; i < N; i++) {
    line[i] = ex[i] - 0.9 * ex[(i - P + N) % N];
    mean += line[i];
  }
  mean /= N;
  let top = 0;
  for (let i = 0; i < N; i++) {
    line[i] -= mean;
    top = Math.max(top, Math.abs(line[i]));
  }
  const norm = top > 0 ? 1 / top : 1;
  for (let i = 0; i < N; i++) line[i] *= norm;
  const R = Math.min(0.99995, Math.pow(0.001, 1 / (freq * spec.t60)));
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const a = line[idx];
    const nx = idx + 1 === N ? 0 : idx + 1;
    out[i] = a;
    line[idx] = R * 0.5 * (a + line[nx]);
    idx = nx;
  }
  // The softest of attacks (a millisecond: no click), and a fade at the end.
  const fadeIn = Math.min(len, Math.round(sr * 0.001));
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  const fade = Math.min(len, Math.round(sr * 0.05));
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  return { buf, freq };
}

function pluck(out: Out, inst: InstId, spec: PluckSpec, n: number, at: number, dur: number, vel: number): void {
  const { ctx } = out;
  let cache = pluckCache.get(ctx);
  if (!cache) {
    cache = new Map();
    pluckCache.set(ctx, cache);
  }
  const bucket = Math.round(n / PLUCK_SPAN) * PLUCK_SPAN;
  const key = `${inst}:${bucket}`;
  let p = cache.get(key);
  if (!p) {
    p = renderPluck(ctx, spec, bucket, out.rnd);
    cache.set(key, p);
  }
  const rate = midi(n) / p.freq;
  const src = ctx.createBufferSource();
  src.buffer = p.buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel * spec.gain, at);
  const ring = p.buf.duration / rate;
  let end = at + ring;
  // Damped after its length (a lute player lifting a finger), else it rings out.
  if (dur + 0.25 < ring) {
    g.gain.setValueAtTime(vel * spec.gain, at + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.25);
    end = at + dur + 0.27;
  }
  src.connect(g);
  g.connect(out.dest);
  src.start(at);
  src.stop(end);
  release(src, g);
}

// ------------------------------------------------------------------ blown and bowed
interface WindSpec {
  wave: (ctx: BaseAudioContext, n: number) => PeriodicWave;
  /** Breath at the note's start (0 to 1). */
  breath: number;
  vib: number;
  vibRate: number;
  attack: number;
  release: number;
  /** Start this much flat and slide up (a ney's scoop). */
  scoop?: number;
  gain: number;
}

const WINDS: Partial<Record<InstId, WindSpec>> = {
  flute: { wave: (c) => wave(c, 'flute', FLUTE), breath: 0.45, vib: 0.0055, vibRate: 5.2, attack: 0.07, release: 0.16, gain: 0.52 },
  recorder: { wave: (c) => wave(c, 'recorder', RECORDER), breath: 0.3, vib: 0.0035, vibRate: 5.6, attack: 0.04, release: 0.1, gain: 0.44 },
  ney: { wave: (c) => wave(c, 'ney', NEY), breath: 0.9, vib: 0.007, vibRate: 4.6, attack: 0.1, release: 0.22, scoop: 0.025, gain: 0.5 },
  reed: { wave: (c) => wave(c, 'reed', REED), breath: 0.15, vib: 0.004, vibRate: 5, attack: 0.05, release: 0.12, gain: 0.5 },
  fiddle: {
    // A bowed string: a saw rolled off above, with the body's resonance around 2.8 kHz.
    wave: (c, n) => shaped(c, 'fiddle', n, (hz) => (1 + 1.5 * formant(hz, 2800, 700)) / Math.sqrt(1 + (hz / Math.min(6000, midi(n) * 5)) ** 4)),
    breath: 0.1, vib: 0.008, vibRate: 6, attack: 0.08, release: 0.16, gain: 0.6,
  },
};

function wind(out: Out, spec: WindSpec, n: number, at: number, dur: number, vel: number): void {
  const { ctx } = out;
  const f = midi(n);
  const { g, end } = env(ctx, out.dest, at, vel * spec.gain, spec.attack, dur, spec.release, 0.82);
  const o = osc(ctx, spec.wave(ctx, n), f, at, end, g);
  if (spec.scoop) {
    o.frequency.setValueAtTime(f * (1 - spec.scoop), at);
    o.frequency.linearRampToValueAtTime(f, at + 0.09);
  }
  release(o, g);
  if (dur > 0.35) vibrato(ctx, [o.frequency], spec.vibRate, f * spec.vib, at + 0.12, end, Math.min(0.5, dur * 0.6));
  if (spec.breath > 0) {
    // The chiff of the breath starting the note.
    noiseBurst(out, at, 0.09, 'bandpass', Math.min(9000, f * 2), 0.9, vel * spec.breath * 0.12, 0.015);
  }
}

/** Horns and brass: two buzzing saws whose filter opens on the attack and settles. */
function brass(out: Out, n: number, at: number, dur: number, vel: number, bright: number, attack: number): void {
  const { ctx } = out;
  const f = midi(n);
  const { g, end } = env(ctx, out.dest, at, vel * 0.7, attack, dur, 0.18, 0.85);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.1;
  const top = Math.min(7000, f * bright);
  lp.frequency.setValueAtTime(f * 1.2, at);
  lp.frequency.linearRampToValueAtTime(top, at + attack * 1.4);
  lp.frequency.linearRampToValueAtTime(top * 0.6, at + attack * 1.4 + 0.25);
  lp.connect(g);
  const a = osc(ctx, 'sawtooth', f, at, end, lp, -5);
  const b = osc(ctx, 'sawtooth', f, at, end, lp, 5);
  release(a, lp, g);
  if (dur > 0.5) vibrato(ctx, [a.frequency, b.frequency], 5, f * 0.003, at + 0.15, end, 0.4);
}

/** A short bowed stab: its filter snaps open and closes. */
function lowStab(out: Out, f: number, at: number, dur: number, vel: number): void {
  const { ctx } = out;
  const { g, end } = env(ctx, out.dest, at, vel * 0.42, 0.008, dur, 0.09, 0.7);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.4;
  lp.frequency.setValueAtTime(Math.min(2400, f * 14), at);
  lp.frequency.linearRampToValueAtTime(Math.min(900, f * 5), at + 0.12);
  lp.connect(g);
  const a = osc(ctx, 'sawtooth', f, at, end, lp, -6);
  osc(ctx, 'sawtooth', f, at, end, lp, 6);
  release(a, lp, g);
}

/** Two oscillators a few cents apart on one envelope: a chorused pad or voice. */
function pair(out: Out, w: PeriodicWave, n: number, at: number, dur: number, peakGain: number, attack: number, rel: number, cents: number): void {
  const { ctx } = out;
  const f = midi(n);
  const { g, end } = env(ctx, out.dest, at, peakGain, attack, dur, rel);
  const half = ctx.createGain();
  half.gain.value = 0.5;
  half.connect(g);
  const a = osc(ctx, w, f, at, end, half, -cents);
  osc(ctx, w, f, at, end, half, cents);
  release(a, half, g);
}

/** Struck instruments: seconds, gain, partials. */
const STRUCK: Record<'celesta' | 'bell', [number, number, Array<[number, number]>]> = {
  celesta: [1.6, 1.15, [[1, 1], [4, 0.16]]],
  bell: [2.2, 0.95, [[1, 1], [2.76, 0.3], [5.4, 0.12]]],
};

// ------------------------------------------------------------------ playing notes
/** Plays MIDI note `n` on `inst` at `at` for `dur` seconds, at velocity `vel` (about 0 to 1). */
export function play(out: Out, inst: InstId, n: number, at: number, dur: number, vel: number): void {
  const p = PLUCKS[inst];
  if (p) return pluck(out, inst, p, n, at, dur, vel);
  const w = WINDS[inst];
  if (w) return wind(out, w, n, at, dur, vel);
  const { ctx } = out;
  const f = midi(n);
  switch (inst) {
    case 'horn':
      return brass(out, n, at, dur, vel, 3.2, 0.07);
    case 'brass':
      return brass(out, n, at, dur, vel, 6.5, 0.035);
    case 'choir': {
      // An open "ah": a saw through the vowel's formants, baked into the wave.
      const cw = shaped(ctx, 'choir', n, (hz) => (0.4 + 5 * formant(hz, 760, 110) + 3.5 * formant(hz, 1150, 130) + 1.4 * formant(hz, 2600, 200)) / (1 + (hz / 3500) ** 4));
      return pair(out, cw, n, at, dur, vel * 0.72, 0.35, 0.7, 7);
    }
    case 'strings': {
      const sw = shaped(ctx, 'strings', n, (hz) => 1 / Math.sqrt(1 + (hz / Math.min(2400, f * 5)) ** 4));
      return pair(out, sw, n, at, dur, vel * 0.42, 0.55, 0.9, 9);
    }
    case 'warmPad':
      return pair(out, wave(ctx, 'warm', WARM), n, at, dur, vel * 0.4, 0.6, 0.9, 5);
    case 'icePad':
      return pair(out, wave(ctx, 'ice', ICE), n, at, dur, vel * 0.38, 1.1, 1.3, 7);
    case 'organ': {
      const { g, end } = env(ctx, out.dest, at, vel * 0.62, 0.12, dur, 0.35);
      const o = osc(ctx, wave(ctx, 'organ', ORGAN), f, at, end, g);
      release(o, g);
      return;
    }
    case 'celesta':
    case 'bell': {
      const [len, g, ratios] = STRUCK[inst];
      const b = Math.round(n / 3) * 3;
      const fb = midi(b);
      return oneShot(out, `${inst}:${b}`, len + 0.05, at, vel, f / fb, (o) => struck(o, fb, 0, len, g, ratios), () => struck(out, f, at, len, vel * g, ratios));
    }
    case 'lowStrings': {
      // A short bowed stab (the ostinato), baked for each note and length it plays at (there are few).
      const ms = Math.round(dur * 100) * 10;
      if (ms > 600) return lowStab(out, f, at, dur, vel);
      return oneShot(out, `low:${n}:${ms}`, ms / 1000 + 0.3, at, vel, 1, (o) => lowStab(o, f, 0, ms / 1000, 1), () => lowStab(out, f, at, dur, vel));
    }
    case 'sineBass': {
      const { g, end } = env(ctx, out.dest, at, vel * 0.42, 0.012, dur, 0.15, 0.8);
      const o = osc(ctx, wave(ctx, 'bass', BASS), f, at, end, g);
      release(o, g);
      return;
    }
    default:
      return;
  }
}

/** A chord strummed: the notes a few milliseconds apart, down (low to high) or a lighter stroke up. */
export function strum(out: Out, inst: InstId, notes: number[], at: number, dur: number, vel: number, up: boolean): void {
  const ns = up ? [...notes].reverse().slice(0, 3) : notes;
  ns.forEach((n, i) => play(out, inst, n, at + i * (up ? 0.011 : 0.016), dur, vel * (up ? 0.55 : 1) * (1 - i * 0.06)));
}

// ------------------------------------------------------------------ drums
/** Seconds each drum rings (what's baked of it). */
const DRUM_LEN: Record<DrumId, number> = {
  taiko: 0.75, tom: 0.4, frame: 0.3, slap: 0.2, tamb: 0.25, shaker: 0.1, dum: 0.4, tek: 0.08, timpani: 1.6, anvil: 0.55, cymbal: 1.9, zill: 1.3, bowl: 5.1,
};

/** One drum hit at velocity `vel`; `n` tunes the ones that take a pitch (timpani, bowl). */
export function drum(out: Out, id: DrumId, at: number, vel: number, n?: number): void {
  oneShot(out, `${id}:${n ?? ''}`, DRUM_LEN[id], at, vel, 1, (o) => liveDrum(o, id, 0, 1, n), () => liveDrum(out, id, at, vel, n), drumRate(id));
}

/** Tuned drums have nothing high in them: baked at a lower rate (a fraction of the memory). */
const drumRate = (id: DrumId) => (id === 'bowl' || id === 'timpani' ? 16000 : BAKE_RATE);

/**
 * Bakes the drum kit ahead (call once the music starts), and the victory sting's timpani. Tuned
 * drums in the themes (bowls on each bar's root) bake as they're first struck.
 */
export function warmDrums(noise: AudioBuffer): Promise<void> {
  const jobs: Array<Promise<void>> = [];
  for (const id of Object.keys(DRUM_LEN) as DrumId[]) {
    const notes: Array<number | undefined> = id === 'timpani' ? [36, 41, 43, 48] : id === 'bowl' ? [] : [undefined];
    for (const n of notes) jobs.push(bake(`${id}:${n ?? ''}`, DRUM_LEN[id], noise, (o) => liveDrum(o, id, 0, 1, n), drumRate(id)));
  }
  return Promise.all(jobs).then(() => {});
}

function liveDrum(out: Out, id: DrumId, at: number, vel: number, n?: number): void {
  switch (id) {
    case 'taiko':
      thump(out, at, 105, 46, 0.5, 0.68 * vel);
      thump(out, at, 62, 50, 0.7, 0.25 * vel);
      noiseBurst(out, at, 0.12, 'lowpass', 700, 0.7, 0.28 * vel);
      return;
    case 'tom':
      thump(out, at, 165, 92, 0.32, 0.6 * vel);
      noiseBurst(out, at, 0.07, 'bandpass', 500, 1, 0.16 * vel);
      return;
    case 'frame':
      thump(out, at, 125, 72, 0.24, 0.7 * vel);
      noiseBurst(out, at, 0.05, 'bandpass', 950, 1, 0.24 * vel);
      return;
    case 'slap':
      noiseBurst(out, at, 0.15, 'bandpass', 1800, 0.8, 0.8 * vel);
      noiseBurst(out, at, 0.06, 'highpass', 4000, 0.7, 0.25 * vel);
      thump(out, at, 240, 175, 0.08, 0.35 * vel);
      return;
    case 'tamb':
      noiseBurst(out, at, 0.12, 'highpass', 5200, 0.7, 0.9 * vel);
      noiseBurst(out, at + 0.026, 0.16, 'bandpass', 7400, 4, 0.55 * vel);
      return;
    case 'shaker':
      noiseBurst(out, at, 0.07, 'highpass', 4500, 0.7, 1.2 * vel, 0.014);
      return;
    case 'dum':
      thump(out, at, 115, 72, 0.36, 0.75 * vel);
      noiseBurst(out, at, 0.05, 'lowpass', 600, 0.7, 0.16 * vel);
      return;
    case 'tek':
      noiseBurst(out, at, 0.045, 'bandpass', 3300, 2, 1.2 * vel);
      thump(out, at, 560, 480, 0.035, 0.4 * vel);
      return;
    case 'timpani': {
      const f = midi(n ?? 41);
      thump(out, at, f * 1.03, f * 0.98, 1.5, 0.7 * vel);
      thump(out, at, f * 1.5, f * 1.48, 0.8, 0.18 * vel);
      noiseBurst(out, at, 0.18, 'lowpass', 400, 0.7, 0.22 * vel);
      return;
    }
    case 'anvil':
      struck(out, 1180, at, 0.5, 0.4 * vel, [[1, 1], [2.61, 0.5], [3.9, 0.3]]);
      noiseBurst(out, at, 0.03, 'highpass', 4500, 0.7, 0.25 * vel);
      return;
    case 'cymbal':
      noiseBurst(out, at, 1.8, 'highpass', 3800, 0.6, 0.7 * vel);
      noiseBurst(out, at, 1.1, 'bandpass', 7000, 1, 0.4 * vel);
      return;
    case 'zill':
      struck(out, 2637, at, 1.2, 0.4 * vel, [[1, 1], [1.33, 0.6], [2.7, 0.2]]);
      return;
    case 'bowl': {
      // A singing bowl, struck: two partials a hair apart beat slowly against each other.
      const f = midi(n ?? 57);
      struck(out, f, at, 5, 0.32 * vel, [[1, 1], [1.006, 0.8], [2.71, 0.35], [5.2, 0.12]]);
      return;
    }
  }
}

// ------------------------------------------------------------------ the places' own sounds
/** A pentatonic note from C6 up (glints, chimes): always in key. */
function highPenta(rnd: () => number): number {
  const L = [84, 86, 88, 91, 93, 96, 98, 100];
  return L[Math.floor(rnd() * L.length)];
}

/** One step's worth of a place's sounds (`stepSec` long, `barStart` on a bar's first step, `bar` counting up). */
export function ambience(out: Out, id: AmbienceId, at: number, stepSec: number, barStart: boolean, bar: number): void {
  const r = out.rnd;
  const t = at + r() * stepSec;
  switch (id) {
    case 'crackle':
      // Little pops all the time, a bigger snap now and then.
      if (r() < 0.55) noiseBurst(out, t, 0.006 + r() * 0.01, 'highpass', 1800 + r() * 2500, 0.7, 0.02 + r() * 0.04, 0.001);
      if (r() < 0.05) {
        noiseBurst(out, t, 0.03, 'bandpass', 1300 + r() * 800, 1, 0.1, 0.001);
        for (let k = 0; k < 3; k++) noiseBurst(out, t + 0.02 + r() * 0.12, 0.008, 'highpass', 3000, 0.7, 0.035, 0.001);
      }
      return;
    case 'crickets':
      if (r() < 0.16) {
        const f = 4300 + r() * 500;
        const g = 0.005 + r() * 0.007;
        for (let k = 0; k < 3; k++) thump(out, t + k * 0.032, f, f * 0.98, 0.02, g);
      }
      return;
    case 'birds':
      if (barStart && r() < 0.55) {
        const n = 2 + Math.floor(r() * 4);
        const base = 2400 + r() * 1400;
        const down = r() < 0.4;
        for (let k = 0; k < n; k++) {
          const s = t + k * (0.09 + r() * 0.05);
          thump(out, s, down ? base * 1.4 : base, down ? base : base * 1.45, 0.06 + r() * 0.04, 0.01 + r() * 0.008);
        }
      }
      return;
    case 'owl':
      if (barStart && bar % 2 === 0 && r() < 0.22) {
        for (const [d, l] of [[0, 0.32], [0.55, 0.18], [0.78, 0.4]] as const) {
          const { g, end } = env(out.ctx, out.dest, t + d, 0.02, 0.06, l, 0.15);
          const o = osc(out.ctx, 'sine', 375 - d * 15, t + d, end, g);
          release(o, g);
        }
      }
      return;
    case 'frogs':
      if (barStart && r() < 0.6) {
        const s = t + r() * stepSec * 3;
        const f = 85 + r() * 40;
        for (let k = 0; k < 3; k++) {
          const s0 = s + k * 0.07;
          const { g, end } = env(out.ctx, out.dest, s0, 0.03, 0.01, 0.04, 0.03);
          const bp = out.ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 420;
          bp.Q.value = 2;
          bp.connect(g);
          const o = osc(out.ctx, 'sawtooth', f, s0, end, bp);
          release(o, bp, g);
        }
      }
      return;
    case 'drips':
      if (r() < 0.05) {
        const f = 900 + r() * 900;
        thump(out, t, f, f * 2.2, 0.05, 0.03);
        thump(out, t + 0.21, f, f * 2.2, 0.05, 0.009);
      }
      return;
    case 'lava':
      if (r() < 0.07) thump(out, t, 190 + r() * 80, 70, 0.09, 0.05);
      if (r() < 0.12) noiseBurst(out, t, 0.01, 'highpass', 2500, 0.7, 0.025, 0.001);
      return;
    case 'glints':
      if (r() < 0.06) struck(out, midi(highPenta(r)), t, 1.4, 0.014 + r() * 0.01, [[1, 1], [2.76, 0.2]]);
      return;
    case 'chimes':
      if (barStart && r() < 0.6) {
        const n = 3 + Math.floor(r() * 4);
        for (let k = 0; k < n; k++) struck(out, midi(highPenta(r)), t + k * (0.06 + r() * 0.12), 2, 0.009 + r() * 0.008, [[1, 1], [2.76, 0.25]]);
      }
      return;
    case 'toll':
      if (barStart && bar % 8 === 0) struck(out, midi(43), at, 5, 0.06, [[1, 1], [2, 0.4], [2.4, 0.3], [3, 0.2], [4.2, 0.12]]);
      return;
    case 'wind':
      return;
  }
}

/** A place's endless sound under the music (wind, the fire's roar, lava's rumble): its sources, to stop later. */
export function bed(out: Out, id: AmbienceId, at: number): AudioScheduledSourceNode[] {
  const { ctx } = out;
  const loop = (type: BiquadFilterType, freq: number, q: number, gain: number, sweep: number, rate: number, wobble: number) => {
    const src = ctx.createBufferSource();
    src.buffer = out.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 2);
    src.connect(f);
    f.connect(g);
    g.connect(out.dest);
    // The wind gusting: its pitch (the noise played faster and slower, a cheap way to sweep it) and
    // its loudness drift slowly.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const lf = ctx.createGain();
    lf.gain.value = sweep;
    lfo.connect(lf);
    lf.connect(src.playbackRate);
    const lg = ctx.createGain();
    lg.gain.value = gain * wobble;
    lfo.connect(lg);
    lg.connect(g.gain);
    src.start(at, out.rnd() * 1.5);
    lfo.start(at);
    release(src, f, g, lf, lg);
    return [src, lfo];
  };
  switch (id) {
    case 'wind':
      return loop('bandpass', 520, 1.2, 0.06, 0.45, 0.07, 0.6);
    case 'crackle':
      return loop('lowpass', 380, 0.5, 0.03, 0.3, 0.3, 0.4);
    case 'lava':
      return loop('lowpass', 130, 0.7, 0.08, 0.3, 0.11, 0.5);
    default:
      return [];
  }
}
