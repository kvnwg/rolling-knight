/**
 * The places' own sounds under the music, synthesized with Web Audio: a campfire, crickets, birds, an
 * owl, frogs, wind, drips, lava, glints, wind chimes and a far bell. `ambience` plays one step's worth
 * of a place's sounds (music.ts steps through them on its own clock), `bed` starts its endless ones
 * (wind, the fire's roar, lava's rumble). The tuned ones (glints, chimes) pick their notes from the
 * pitch classes they're given, the key of the track they play under.
 *
 * Kept light, as a phone has to mix it under the game: automation always ends (a held value costs
 * nothing to compute), and a sound's nodes let go as it ends.
 */
import { midi } from './engine';

export type AmbienceId = 'crackle' | 'crickets' | 'birds' | 'owl' | 'frogs' | 'wind' | 'drips' | 'lava' | 'glints' | 'chimes' | 'toll';

/** Where a sound goes and what it's made from. */
export interface Out {
  ctx: BaseAudioContext;
  dest: AudioNode;
  noise: AudioBuffer;
  rnd: () => number;
}

/** C major pentatonic (A minor's too): the tuned sounds' notes unless a place says otherwise. */
export const C_PENTATONIC = [0, 2, 4, 7, 9];

// ------------------------------------------------------------------ helpers
/**
 * An envelope into `dest`: a linear rise to `peak`, held to `dur`, then an exponential release.
 * Returns the gain and when the sound is silent.
 */
function env(ctx: BaseAudioContext, dest: AudioNode, at: number, peak: number, attack: number, dur: number, release: number): { g: GainNode; end: number } {
  const g = ctx.createGain();
  const p = g.gain;
  const tA = at + attack;
  const tEnd = Math.max(tA + 0.01, at + dur);
  p.setValueAtTime(0, at);
  p.linearRampToValueAtTime(peak, tA);
  p.setValueAtTime(Math.max(0.0002, peak), tEnd);
  p.exponentialRampToValueAtTime(0.0001, tEnd + release);
  g.connect(dest);
  return { g, end: tEnd + release + 0.02 };
}

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number, at: number, end: number, dest: AudioNode): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
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

function noiseBurst(out: Out, at: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.002): void {
  const { ctx } = out;
  const src = ctx.createBufferSource();
  src.buffer = out.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(Math.min(freq, ctx.sampleRate * 0.45), at);
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

/** A short decaying sine sweeping from `f0` to `f1` (a chirp, a croak's body, a drip). */
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

/** A random note of pitch class set `tones`, from C6 to E7 (glints, chimes): always in the track's key. */
export function highNote(rnd: () => number, tones: readonly number[]): number {
  const notes: number[] = [];
  for (let n = 84; n <= 100; n++) if (tones.includes(n % 12)) notes.push(n);
  return notes.length ? notes[Math.floor(rnd() * notes.length)] : 84;
}

// ------------------------------------------------------------------ the places' sounds
/**
 * One step's worth of a place's sounds: `stepSec` long from `at`, `barStart` on a bar's first step,
 * `bar` counting up; the tuned ones pick from `tones`.
 */
export function ambience(out: Out, id: AmbienceId, at: number, stepSec: number, barStart: boolean, bar: number, tones: readonly number[] = C_PENTATONIC): void {
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
      if (r() < 0.06) struck(out, midi(highNote(r, tones)), t, 1.4, 0.014 + r() * 0.01, [[1, 1], [2.76, 0.2]]);
      return;
    case 'chimes':
      if (barStart && r() < 0.6) {
        const n = 3 + Math.floor(r() * 4);
        for (let k = 0; k < n; k++) struck(out, midi(highNote(r, tones)), t + k * (0.06 + r() * 0.12), 2, 0.009 + r() * 0.008, [[1, 1], [2.76, 0.25]]);
      }
      return;
    case 'toll':
      // A far bell on G every eight bars (the graveyard's track is in D minor).
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
