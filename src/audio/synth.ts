/**
 * The building blocks the fight's sounds are made of (recipes.ts): tones with a pitch sweep, filtered
 * noise, struck bells and metal, kick-like thumps, plucked strings and handfuls of tiny clicks
 * (debris, gravel, crackle). Every sound is a transient on top of a body, so it's built from a few of
 * these, each scheduled on the audio clock from the sound's start.
 *
 * Tuned for phone speakers, which give out below about 150 Hz: the low layers sweep down from well
 * above that and can go through `grit` (a soft clip), whose overtones the ear hears as the low end.
 *
 * A `Voice` is one sound being made: where it goes, when it starts, and the latest its layers ring
 * (the mixer counts it as playing until then). Each layer counts against the engine's voice cap while
 * it plays, and lets go of its nodes as it ends. Nothing here runs at import.
 */
import { engine } from './engine';

export interface Voice {
  readonly ctx: BaseAudioContext;
  /** Where this sound's layers go (its own gain and place in the stereo field, then its bus). */
  readonly out: AudioNode;
  /** When it starts, on the audio clock. */
  readonly t: number;
  readonly noise: AudioBuffer;
  readonly rnd: () => number;
  /** How hard (0 to 1): a heavier hit, a bigger blast, a rarer result. */
  readonly level: number;
  /** Pitch multiplier: bigger foes lower. */
  readonly pitch: number;
  /** A count some sounds climb with (a kill streak, a reel's step). */
  readonly step: number;
  /** When its last layer has rung out (each layer pushes it later). */
  end: number;
  /** Layers count against the engine's voice cap (off for an offline render). */
  readonly counted: boolean;
  /** The soft clip into `out`, made on first use. */
  grit?: AudioNode;
  /** Nodes the sound shares between its layers (the soft clip): whoever made the voice lets go of them once it has rung out. */
  readonly own: AudioNode[];
}

export interface Layer {
  /** Seconds after the sound's start. */
  dt?: number;
  gain?: number;
  /** Seconds to its peak. */
  attack?: number;
  /** Seconds held at its peak before it decays. */
  hold?: number;
  /** -1 left to 1 right, on top of the sound's own place. */
  pan?: number;
  /** Through the soft clip (for heavy low layers). */
  grit?: boolean;
}

export interface ToneOpts extends Layer {
  type?: OscillatorType;
  /** Sweeps to this frequency... */
  to?: number;
  /** ...over this many seconds (default: the whole note). */
  sweep?: number;
  lp?: number;
  hp?: number;
  bp?: number;
  q?: number;
  /** The filter sweeps to this. */
  fTo?: number;
  detune?: number;
  /** Vibrato depth (Hz) and rate. */
  vib?: number;
  vibRate?: number;
}

export interface NoiseOpts extends Layer {
  type?: BiquadFilterType;
  f?: number;
  to?: number;
  sweep?: number;
  q?: number;
}

/** A fresh voice: `out` its destination, starting at `t`. */
export function voiceAt(ctx: BaseAudioContext, out: AudioNode, t: number, noise: AudioBuffer, rnd: () => number, o: { level?: number; pitch?: number; step?: number; counted?: boolean } = {}): Voice {
  return { ctx, out, t, noise, rnd, level: clamp01(o.level ?? 0.5), pitch: o.pitch ?? 1, step: o.step ?? 0, end: t, counted: o.counted ?? true, own: [] };
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** `x` give or take `pct` (each call its own). */
export function vary(v: Voice, x: number, pct = 0.05): number {
  return x * (1 + (v.rnd() * 2 - 1) * pct);
}

/** A random number between a and b. */
export function between(v: Voice, a: number, b: number): number {
  return a + (b - a) * v.rnd();
}

let curve: Float32Array<ArrayBuffer> | null = null;

/** The voice's soft clip (tanh), into its output. */
function gritOf(v: Voice): AudioNode {
  if (v.grit) return v.grit;
  if (!curve) {
    curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(2.6 * x) / Math.tanh(2.6);
    }
  }
  const ws = v.ctx.createWaveShaper();
  ws.curve = curve;
  const g = v.ctx.createGain();
  g.gain.value = 0.8;
  ws.connect(g);
  g.connect(v.out);
  v.own.push(ws, g);
  v.grit = ws;
  return ws;
}

/** An exponential envelope: up to `peak` in `attack`, held for `hold`, down by `end`. */
function envelope(ctx: BaseAudioContext, t: number, end: number, peak: number, attack: number, hold: number): GainNode {
  const g = ctx.createGain();
  const p = g.gain;
  const a = Math.max(0.0008, attack);
  const pk = Math.max(0.0002, peak);
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(pk, t + a);
  if (hold > 0) p.setValueAtTime(pk, t + a + hold);
  p.exponentialRampToValueAtTime(0.0001, Math.max(t + a + hold + 0.005, end));
  return g;
}

/** Where a layer goes: its own pan if it has one, through the soft clip if asked. */
function dest(v: Voice, o: Layer, nodes: AudioNode[]): AudioNode {
  const base = o.grit ? gritOf(v) : v.out;
  if (!o.pan || typeof (v.ctx as AudioContext).createStereoPanner !== 'function') return base;
  const p = v.ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, o.pan));
  p.connect(base);
  nodes.push(p);
  return p;
}

const NYQUIST = 24000;

/**
 * Noise through a filter keeps only its band's share of the energy (a narrow band a few percent):
 * the gain that brings it back, so a noise layer's `gain` is its level whatever its filter (its RMS
 * about 0.6 of it, like a tone's 0.7).
 */
function bandGain(type: BiquadFilterType, f: number, q: number): number {
  const bw = type === 'bandpass' ? f / Math.max(0.3, q) : type === 'lowpass' ? f * 1.3 : type === 'highpass' ? NYQUIST - f : NYQUIST;
  return Math.min(6, Math.sqrt(NYQUIST / Math.max(60, bw)));
}

/** Layers further ahead than this (s) are made shortly before they're due, so a long sound doesn't hold voices it isn't using yet. */
const DEFER = 0.3;

/** Making a deferred layer now (it isn't deferred again, even if the audio clock hasn't moved). */
let making = false;

/** Defers making a layer that starts at `t` until just before then (true if it did). */
function deferred(v: Voice, t: number, end: number, make: () => void): boolean {
  if (!v.counted || making) return false;
  const lead = t - v.ctx.currentTime;
  if (lead <= DEFER) return false;
  v.end = Math.max(v.end, end);
  setTimeout(
    () => {
      if (v.ctx.state !== 'running') return;
      making = true;
      try {
        make();
      } catch {
        /* audio never breaks the game */
      } finally {
        making = false;
      }
    },
    (lead - 0.15) * 1000,
  );
  return true;
}

function finish(v: Voice, src: AudioScheduledSourceNode, nodes: AudioNode[], end: number): void {
  v.end = Math.max(v.end, end);
  if (v.counted) engine.voice(src, ...nodes);
  else
    src.onended = () => {
      src.disconnect();
      for (const n of nodes) n.disconnect();
    };
}

function filterFor(ctx: BaseAudioContext, t: number, dur: number, o: ToneOpts): BiquadFilterNode | null {
  const type: BiquadFilterType | null = o.lp ? 'lowpass' : o.hp ? 'highpass' : o.bp ? 'bandpass' : null;
  if (!type) return null;
  const f = ctx.createBiquadFilter();
  f.type = type;
  const fr = (o.lp ?? o.hp ?? o.bp)!;
  f.frequency.setValueAtTime(fr, t);
  if (o.fTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.fTo), t + dur);
  f.Q.value = o.q ?? (type === 'bandpass' ? 1.2 : 0.7);
  return f;
}

/** An oscillator note: a frequency (sweeping `to` over `sweep`), an envelope, an optional filter and vibrato. */
export function tone(v: Voice, freq: number, dur: number, o: ToneOpts = {}): void {
  const ctx = v.ctx;
  const t = v.t + (o.dt ?? 0);
  const end = t + dur;
  if (deferred(v, t, end, () => tone(v, freq, dur, o))) return;
  if (v.counted && engine.full) return;
  const s = ctx.createOscillator();
  s.type = o.type ?? 'sine';
  const f0 = Math.max(20, freq * v.pitch);
  s.frequency.setValueAtTime(f0, t);
  if (o.to) s.frequency.exponentialRampToValueAtTime(Math.max(20, o.to * v.pitch), t + Math.min(dur, o.sweep ?? dur));
  if (o.detune) s.detune.value = o.detune;
  const g = envelope(ctx, t, end, o.gain ?? 0.15, o.attack ?? 0.002, o.hold ?? 0);
  const nodes: AudioNode[] = [g];
  const fl = filterFor(ctx, t, dur, o);
  if (fl) {
    s.connect(fl);
    fl.connect(g);
    nodes.push(fl);
  } else s.connect(g);
  g.connect(dest(v, o, nodes));
  if (o.vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.vibRate ?? 6;
    const lg = ctx.createGain();
    lg.gain.value = o.vib * v.pitch;
    lfo.connect(lg);
    lg.connect(s.frequency);
    lfo.start(t);
    lfo.stop(end + 0.05);
    lfo.onended = () => {
      lfo.disconnect();
      lg.disconnect();
    };
  }
  s.start(t);
  s.stop(end + 0.03);
  finish(v, s, nodes, end);
}

/** A burst of filtered noise (its filter sweeping `to` over `sweep`). */
export function hiss(v: Voice, dur: number, o: NoiseOpts = {}): void {
  const ctx = v.ctx;
  const t = v.t + (o.dt ?? 0);
  const end = t + dur;
  if (deferred(v, t, end, () => hiss(v, dur, o))) return;
  if (v.counted && engine.full) return;
  const src = ctx.createBufferSource();
  src.buffer = v.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  const f0 = Math.max(20, o.f ?? 1000);
  f.frequency.setValueAtTime(f0, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + Math.min(dur, o.sweep ?? dur));
  f.Q.value = o.q ?? (f.type === 'bandpass' ? 1.2 : 0.7);
  const g = envelope(ctx, t, end, (o.gain ?? 0.1) * bandGain(f.type, f0, f.Q.value), o.attack ?? 0.002, o.hold ?? 0);
  const nodes: AudioNode[] = [f, g];
  src.connect(f);
  f.connect(g);
  g.connect(dest(v, o, nodes));
  src.start(t, v.rnd() * Math.max(0, v.noise.duration - dur - 0.1));
  src.stop(end + 0.03);
  finish(v, src, nodes, end);
}

/** A struck bell: the note and its inharmonic partial. */
export function bell(v: Voice, freq: number, dur: number, gain = 0.05, o: Layer = {}): void {
  tone(v, freq, dur, { ...o, gain, attack: 0.002 });
  tone(v, freq * 2.76, dur * 0.4, { ...o, gain: gain * 0.32, attack: 0.002 });
}

/** A single struck note (one voice: for runs and showers of them). */
export function ping(v: Voice, freq: number, dur: number, gain = 0.04, o: Layer & { type?: OscillatorType } = {}): void {
  tone(v, freq, dur, { ...o, gain, attack: 0.002 });
}

/** Struck metal: inharmonic partials, the higher ones dying first. */
export function metal(v: Voice, freq: number, dur: number, gain = 0.04, o: Layer = {}, partials: readonly number[] = [1, 2.32, 3.86]): void {
  partials.forEach((p, i) => tone(v, freq * p, dur / (1 + i * 0.6), { ...o, gain: gain / (1 + i * 0.7), attack: 0.001 }));
}

/** A kick: a sine dropping fast from f0 to f1 (over `sweep`), with a triangle an octave up for small speakers. */
export function thump(v: Voice, f0: number, f1: number, dur: number, gain: number, o: Layer & { sweep?: number } = {}): void {
  const sweep = o.sweep ?? Math.min(dur, 0.07);
  tone(v, f0, dur, { ...o, gain, to: f1, sweep, grit: o.grit ?? true });
  tone(v, f0 * 2, dur * 0.5, { ...o, type: 'triangle', gain: gain * 0.28, to: f1 * 2, sweep, grit: false });
}

/** A plucked string: a bright snap, its pitch settling as its tone darkens. */
export function pluck(v: Voice, freq: number, dur: number, gain: number, o: Layer & { bright?: number } = {}): void {
  const bright = o.bright ?? 3200;
  tone(v, freq * 1.25, dur, { ...o, type: 'sawtooth', gain, to: freq, sweep: 0.03, lp: bright, fTo: Math.max(200, freq * 1.5), q: 2 });
  hiss(v, 0.012, { ...o, type: 'bandpass', f: Math.min(6000, freq * 14), q: 3, gain: gain * 0.7 });
}

export interface ClickOpts {
  f: number;
  /** Each click's filter this far either side of `f` (a share of it). */
  spread?: number;
  q?: number;
  gain: number;
  dur?: number;
  type?: BiquadFilterType;
  /** Each quieter than the last (default). */
  fade?: boolean;
  /** The handful's place in the stereo field: somewhere up to this far to a side. */
  pan?: number;
}

/**
 * `n` tiny clicks scattered over `span` s from `from` (debris, gravel, crackle, bones clattering),
 * each quieter than the last: one noise source whose level spikes for each click (its filter tuned
 * for each), so a handful costs one voice.
 */
export function clicks(v: Voice, n: number, from: number, span: number, o: ClickOpts): void {
  if (n <= 0) return;
  const dur = o.dur ?? 0.012;
  const t0 = v.t + from;
  if (deferred(v, t0, t0 + span + n * (dur + 0.001), () => clicks(v, n, from, span, o))) return;
  if (v.counted && engine.full) return;
  const ctx = v.ctx;
  const at = Array.from({ length: n }, () => from + v.rnd() * span).sort((a, b) => a - b);
  // (Never two at once: each starts after the last has died away.)
  for (let i = 1; i < n; i++) at[i] = Math.max(at[i], at[i - 1] + dur + 0.001);
  const src = ctx.createBufferSource();
  src.buffer = v.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.Q.value = o.q ?? 4;
  const level = o.gain * bandGain(f.type, o.f, f.Q.value);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, v.t);
  at.forEach((dt, i) => {
    const t = v.t + dt;
    const k = o.fade === false ? 1 : 1 - i / (n + 1);
    f.frequency.setValueAtTime(Math.max(40, o.f * (1 + (v.rnd() * 2 - 1) * (o.spread ?? 0.35))), t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * k * (0.6 + 0.4 * v.rnd())), t + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  });
  const nodes: AudioNode[] = [f, g];
  src.connect(f);
  f.connect(g);
  g.connect(dest(v, { pan: o.pan ? (v.rnd() * 2 - 1) * o.pan : 0 }, nodes));
  const end = v.t + at[n - 1] + dur;
  src.start(v.t + at[0], v.rnd() * Math.max(0, v.noise.duration - (end - v.t) - 0.1));
  src.stop(end + 0.03);
  finish(v, src, nodes, end);
}

/** Notes (MIDI) together: a chord of tones. */
export function chord(v: Voice, notes: readonly number[], dur: number, o: ToneOpts = {}): void {
  for (const n of notes) tone(v, 440 * Math.pow(2, (n - 69) / 12), dur, o);
}
