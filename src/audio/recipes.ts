/**
 * The synthesized placeholder for every sound the fight plays (catalog.ts lists them, with when each
 * plays): what each foe sounds like when it's hit and when it falls, each class's attack, the blasts,
 * the foes' attacks, the skill reel and every skill's own sound. A recording of the same name
 * (src/assets/sounds/<name>.mp3) plays in place of any of them.
 *
 * Each is a transient (a click, a crack, a slap) on top of a body (a thump, a tone, a roar of noise),
 * short and punchy, and a little different every time (the voice's pitch and level vary, and the
 * recipes pick their own small differences). Skills that go on for a while (Whirlwind's two seconds,
 * Sanctuary's three, a meteor's fall) are timed to their numbers in skillbook.ts; their later hits
 * and blasts sound on their own, through the fight.
 *
 * A layer's gain is its level (noise layers are made up for their filter's narrowness: synth.ts), and
 * TRIM sets each sound's overall loudness, measured against the others (a hit sits under a crit, a
 * crit under a blast; the frequent sounds under the rare ones).
 */
import type { FightCue } from './catalog';
import { midi } from './engine';
import { bell, between, chord, clicks, hiss, metal, ping, pluck, thump, tone, vary, type Voice } from './synth';

export type Recipe = (v: Voice) => void;

/** C major pentatonic, the key the music is written around: rewards climb it. */
const LADDER = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
const ladder = (i: number) => midi(LADDER[Math.max(0, Math.min(LADDER.length - 1, Math.round(i)))]);
const side = (v: Voice, amount = 0.5) => (v.rnd() * 2 - 1) * amount;

// ------------------------------------------------------------------ shared pieces
/** A reel stopping on its result. */
function clunk(v: Voice, weight: number): void {
  thump(v, 180, 80, 0.12 * weight, 0.16 * weight, { grit: false });
  hiss(v, 0.04, { type: 'bandpass', f: 2100, q: 3, gain: 0.2 * weight });
  tone(v, 1250, 0.02, { type: 'square', lp: 3500, gain: 0.025 });
}

/** A buzz through a vowel (a shout, a grunt): two formants over a sawtooth. */
function voiceOf(v: Voice, f: number, dur: number, o: { to?: number; dt?: number; gain: number; a?: number; b?: number }): void {
  const common = { type: 'sawtooth' as const, to: o.to, sweep: Math.min(dur, 0.15), attack: 0.02, hold: dur * 0.4, dt: o.dt };
  tone(v, f, dur, { ...common, bp: o.a ?? 750, q: 3, gain: o.gain });
  tone(v, f, dur, { ...common, bp: o.b ?? 1250, q: 4, gain: o.gain * 0.5 });
}

/** Brass: a sawtooth that opens as it sounds, a square under it. */
function brass(v: Voice, n: number, dt: number, dur: number, gain: number): void {
  tone(v, midi(n), dur, { dt, type: 'sawtooth', lp: 1600, fTo: 3000, attack: 0.02, hold: dur * 0.4, gain, vib: 3, vibRate: 5.5 });
  tone(v, midi(n), dur, { dt, type: 'square', lp: 1100, attack: 0.02, hold: dur * 0.4, gain: gain * 0.4, detune: 7 });
}

/** A blade through the air: a whoosh, a slash and the steel's ring. */
function slash(v: Voice, dt: number, up: number, gain = 1): void {
  hiss(v, 0.1, { dt, type: 'bandpass', f: 700 * up, to: 4200 * up, q: 1.4, gain: 0.26 * gain, attack: 0.025 });
  hiss(v, 0.05, { dt: dt + 0.04, type: 'highpass', f: 3800, gain: 0.12 * gain });
  metal(v, 2600 * up, 0.25, 0.03 * gain, { dt: dt + 0.04 }, [1, 1.47, 2.1]);
}

/** Air rushing past: a band of noise swept up (or down). */
function whoosh(v: Voice, dur: number, from: number, to: number, gain: number, o: { dt?: number; pan?: number; q?: number; attack?: number } = {}): void {
  hiss(v, dur, { dt: o.dt, type: 'bandpass', f: from, to, q: o.q ?? 1.2, gain, attack: o.attack ?? dur * 0.35, pan: o.pan });
}

/** Arrows landing: soft patter every `every` s from `from` to `to`. */
function patter(v: Voice, from: number, to: number, every: number, gain: number): void {
  for (let t = from; t < to; t += every) hiss(v, 0.045, { dt: t + v.rnd() * 0.04, type: 'bandpass', f: between(v, 1100, 2300), q: 2, gain, pan: side(v, 0.6) });
}

// ------------------------------------------------------------------ the recipes
export const RECIPES: Record<FightCue, Recipe> = {
  // --- foes being hit
  hit_flesh: (v) => {
    const g = 0.75 + 0.5 * v.level;
    hiss(v, 0.014, { type: 'bandpass', f: vary(v, 2300, 0.15) * v.pitch, q: 1.1, gain: 0.25 * g });
    thump(v, vary(v, 200, 0.08), 82, 0.1 + 0.06 * v.level, 0.22 * g, { sweep: 0.05, grit: false });
    hiss(v, 0.06 + 0.04 * v.level, { type: 'lowpass', f: vary(v, 1300, 0.15) * v.pitch, to: 380, gain: 0.16 * g, dt: 0.002 });
  },
  hit_slime: (v) => {
    const g = 0.8 + 0.4 * v.level;
    hiss(v, 0.11, { type: 'bandpass', f: vary(v, 1700, 0.15) * v.pitch, to: 420 * v.pitch, q: 5, gain: 0.3 * g });
    tone(v, vary(v, 380, 0.1), 0.11, { to: 150, sweep: 0.08, gain: 0.14 * g });
    tone(v, vary(v, 170, 0.06), 0.09, { type: 'triangle', to: 110, gain: 0.08 * g });
    const bubbles = 1 + Math.floor(v.rnd() * 2);
    for (let i = 0; i < bubbles; i++) tone(v, between(v, 560, 820), 0.035, { dt: 0.035 + i * 0.03 + v.rnd() * 0.02, to: between(v, 900, 1300), gain: 0.05 * g });
  },
  hit_bone: (v) => {
    const g = 0.8 + 0.4 * v.level;
    // Two or three dry clacks, then a hollow knock under them.
    clicks(v, v.rnd() < 0.5 ? 3 : 2, 0, 0.05, { f: 2000 * v.pitch, spread: 0.3, q: 9, gain: 0.35 * g, dur: 0.016 });
    tone(v, vary(v, 900, 0.1), 0.03, { type: 'triangle', gain: 0.07 * g });
    tone(v, vary(v, 470, 0.08), 0.05, { type: 'triangle', to: 360, gain: 0.08 * g, dt: 0.01 });
    tone(v, vary(v, 230, 0.06), 0.045, { to: 150, gain: 0.07 * g });
  },
  hit_stone: (v) => {
    const g = 0.8 + 0.4 * v.level;
    thump(v, vary(v, 160, 0.08), 70, 0.13 + 0.05 * v.level, 0.22 * g, { sweep: 0.05, grit: false });
    hiss(v, 0.07, { type: 'bandpass', f: vary(v, 950, 0.15) * v.pitch, q: 1.6, gain: 0.28 * g });
    hiss(v, 0.022, { type: 'highpass', f: 3400 * v.pitch, gain: 0.1 * g });
    clicks(v, 3, 0.03, 0.1, { f: 2600 * v.pitch, q: 5, gain: 0.15 * g });
  },
  hit_shell: (v) => {
    const g = 0.8 + 0.4 * v.level;
    hiss(v, 0.016, { type: 'highpass', f: 2600 * v.pitch, gain: 0.22 * g });
    hiss(v, 0.035, { type: 'bandpass', f: vary(v, 1400, 0.12) * v.pitch, q: 3, gain: 0.2 * g, dt: 0.003 });
    clicks(v, 3, 0.006, 0.025, { f: 3200 * v.pitch, q: 6, gain: 0.18 * g, dur: 0.008 });
    tone(v, vary(v, 270, 0.08), 0.06, { to: 150, gain: 0.08 * g });
  },
  hit_wood: (v) => {
    const g = 0.8 + 0.4 * v.level;
    tone(v, vary(v, 540, 0.08), 0.07, { type: 'triangle', to: 430, gain: 0.12 * g });
    hiss(v, 0.045, { type: 'bandpass', f: vary(v, 720, 0.1) * v.pitch, q: 5, gain: 0.25 * g });
    tone(v, vary(v, 210, 0.06), 0.07, { to: 130, gain: 0.1 * g });
    hiss(v, 0.09, { type: 'highpass', f: 4200, gain: 0.06 * g, dt: 0.01, attack: 0.01 });
  },
  hit_ghost: (v) => {
    const g = 0.8 + 0.4 * v.level;
    whoosh(v, 0.15, vary(v, 1400, 0.15), 600, 0.22 * g, { q: 2, attack: 0.012 });
    const f = vary(v, 720, 0.08);
    tone(v, f, 0.22, { to: f * 0.72, vib: 14, vibRate: 7, gain: 0.05 * g, attack: 0.015 });
    tone(v, f * 1.01, 0.2, { to: f * 0.7, gain: 0.04 * g, attack: 0.015 });
    hiss(v, 0.1, { type: 'highpass', f: 6500, gain: 0.04 * g });
  },
  crit: (v) => {
    const g = 0.85 + 0.3 * v.level;
    hiss(v, 0.013, { type: 'highpass', f: 2800, gain: 0.3 * g });
    metal(v, vary(v, 1650, 0.05), 0.28, 0.06 * g, {}, [1, 2.42]);
    thump(v, vary(v, 240, 0.06), 70, 0.17, 0.24 * g, { sweep: 0.05 });
    hiss(v, 0.05, { type: 'bandpass', f: 1800, to: 700, q: 1, gain: 0.15 * g, dt: 0.004 });
  },
  lucky_hit: (v) => {
    bell(v, midi(96), 0.32, 0.07);
    bell(v, midi(103), 0.3, 0.05, { dt: 0.07 });
    hiss(v, 0.25, { type: 'highpass', f: 7000, gain: 0.05, attack: 0.01 });
  },

  // --- the knights
  knight_hurt: (v) => {
    const L = v.level;
    const g = 0.85 + 0.35 * L;
    hiss(v, 0.05 + 0.04 * L, { type: 'lowpass', f: 1700, to: 450, gain: 0.2 * g });
    thump(v, vary(v, 170, 0.06), 62, 0.15 + 0.12 * L, 0.24 * g, { sweep: 0.06 });
    metal(v, vary(v, 1250, 0.06), 0.16, 0.035 * g, { dt: 0.004 }, [1, 2.32]);
    const f = vary(v, 150, 0.06);
    voiceOf(v, f, 0.13 + 0.06 * L, { to: f * 0.8, dt: 0.01, gain: 0.05 * g, a: 650, b: 1100 });
    if (L > 0.5) hiss(v, 0.3, { type: 'lowpass', f: 400, gain: 0.05 * L, attack: 0.01 });
  },
  knight_block: (v) => {
    metal(v, vary(v, 880, 0.05), 0.32, 0.06, {}, [1, 2.4, 3.9, 5.3]);
    hiss(v, 0.06, { type: 'bandpass', f: 3400, q: 5, gain: 0.18 });
    thump(v, 150, 85, 0.1, 0.14, { grit: false });
  },
  knight_down: (v) => {
    tone(v, 440, 0.7, { type: 'triangle', to: 110, gain: 0.07 });
    thump(v, 140, 45, 0.45, 0.32, { dt: 0.05, sweep: 0.08 });
    hiss(v, 0.25, { type: 'lowpass', f: 600, gain: 0.08, dt: 0.05 });
    for (let i = 0; i < 3; i++) metal(v, between(v, 600, 900), 0.22, 0.035 * (1 - i * 0.25), { dt: 0.08 + i * between(v, 0.06, 0.1) }, [1, 2.32]);
  },
  knight_dodge: (v) => {
    whoosh(v, 0.16, vary(v, 520, 0.1), vary(v, 2900, 0.1), 0.22, { q: 1.4, attack: 0.05 });
    hiss(v, 0.05, { type: 'lowpass', f: 900, gain: 0.1, dt: 0.2 });
  },
  knight_blink: (v) => {
    tone(v, 320, 0.09, { to: 2600, gain: 0.06 });
    hiss(v, 0.1, { type: 'highpass', f: 2200, to: 8000, gain: 0.12, attack: 0.02 });
    bell(v, midi(100), 0.22, 0.03, { dt: 0.06 });
  },
  perfect_roll: (v) => {
    // Level 1: the knight you steer (the zip and three bells); less: a squadmate's (one soft bell).
    if (v.level < 0.5) {
      bell(v, midi(88), 0.35, 0.03);
      return;
    }
    tone(v, midi(76), 0.07, { type: 'triangle', to: midi(91), gain: 0.05 });
    bell(v, midi(88), 0.55, 0.075, { dt: 0.03 });
    bell(v, midi(91), 0.55, 0.065, { dt: 0.07 });
    bell(v, midi(96), 0.8, 0.05, { dt: 0.11 });
    hiss(v, 0.3, { type: 'highpass', f: 7000, gain: 0.05, attack: 0.005, dt: 0.02 });
  },
  revive: (v) => {
    [72, 76, 79, 84].forEach((n, k) => ping(v, midi(n), 0.45, 0.05, { dt: k * 0.055 }));
    tone(v, midi(60), 0.35, { type: 'triangle', to: midi(72), gain: 0.03, attack: 0.05 });
    hiss(v, 0.45, { type: 'highpass', f: 6000, gain: 0.06, attack: 0.12 });
  },
  heal: (v) => {
    const n = [84, 88, 91][Math.floor(v.rnd() * 3)];
    bell(v, midi(n), 0.3, 0.02);
    ping(v, midi(n + 7), 0.25, 0.014, { dt: 0.04 });
    hiss(v, 0.25, { type: 'highpass', f: 7000, gain: 0.025, attack: 0.08 });
  },

  // --- each class's attack
  atk_sword: (v) => {
    whoosh(v, 0.11, vary(v, 650, 0.15), vary(v, 3600, 0.12), 0.24, { q: 1.3, attack: 0.03 });
    hiss(v, 0.045, { type: 'highpass', f: 3600, gain: 0.12, dt: 0.045 });
    metal(v, vary(v, 2500, 0.06), 0.13, 0.022, { dt: 0.045 }, [1, 1.47, 2.1]);
  },
  atk_shield: (v) => {
    thump(v, vary(v, 175, 0.06), 75, 0.12, 0.2, { sweep: 0.04, grit: false });
    hiss(v, 0.045, { type: 'lowpass', f: 1300, gain: 0.18 });
    metal(v, vary(v, 520, 0.06), 0.2, 0.035, {}, [1, 2.3, 3.7]);
    tone(v, vary(v, 310, 0.05), 0.05, { type: 'triangle', to: 240, gain: 0.06 });
  },
  atk_spear: (v) => {
    whoosh(v, 0.075, vary(v, 1200, 0.12), vary(v, 4300, 0.1), 0.26, { q: 2, attack: 0.015 });
    tone(v, vary(v, 260, 0.05), 0.06, { type: 'triangle', to: 230, gain: 0.05, dt: 0.01 });
    hiss(v, 0.04, { type: 'highpass', f: 5000, gain: 0.06, dt: 0.045 });
  },
  atk_bow: (v) => {
    pluck(v, vary(v, 150, 0.05), 0.24, 0.09, { bright: 2800 });
    hiss(v, 0.18, { type: 'bandpass', f: 3600, to: 1500, q: 5, gain: 0.08, attack: 0.03, dt: 0.02 });
  },
  arrow_thunk: (v) => {
    tone(v, vary(v, 340, 0.08), 0.07, { type: 'triangle', to: 220, sweep: 0.03, gain: 0.09 });
    hiss(v, 0.03, { type: 'bandpass', f: vary(v, 1400, 0.12), q: 2, gain: 0.2 });
    hiss(v, 0.006, { type: 'highpass', f: 4200, gain: 0.08 });
    tone(v, vary(v, 190, 0.05), 0.12, { type: 'triangle', gain: 0.02, vib: 25, vibRate: 32, dt: 0.02 });
  },
  atk_arcane: (v) => {
    tone(v, vary(v, 1450, 0.06), 0.11, { type: 'square', to: 420, sweep: 0.09, lp: 4500, gain: 0.035 });
    tone(v, vary(v, 2100, 0.05), 0.13, { to: 700, vib: 90, vibRate: 40, gain: 0.04 });
    tone(v, vary(v, 880, 0.05), 0.08, { type: 'triangle', to: 330, gain: 0.05 });
    hiss(v, 0.06, { type: 'highpass', f: 5200, gain: 0.05 });
  },
  arcane_pop: (v) => {
    tone(v, vary(v, 600, 0.08), 0.05, { to: 1250, gain: 0.06 });
    hiss(v, 0.06, { type: 'bandpass', f: 1800, q: 2, gain: 0.2 });
    thump(v, 210, 90, 0.08, 0.1, { grit: false });
    bell(v, vary(v, 1760, 0.04), 0.2, 0.025, { dt: 0.01 });
  },
  atk_holy: (v) => {
    const n = [84, 88, 91][Math.floor(v.rnd() * 3)];
    bell(v, midi(n), 0.42, 0.05);
    bell(v, midi(n + 7), 0.32, 0.03, { dt: 0.02 });
    tone(v, midi(n - 12), 0.22, { type: 'triangle', gain: 0.025, attack: 0.01 });
    whoosh(v, 0.15, 2600, 5200, 0.07, { q: 1, attack: 0.03 });
  },

  // --- explosions
  boom_small: (v) => {
    const L = v.level;
    thump(v, vary(v, 165, 0.06), 52, 0.26 + 0.12 * L, 0.27, { sweep: 0.07 });
    hiss(v, 0.26 + 0.1 * L, { type: 'lowpass', f: 1900 * v.pitch, to: 240, gain: 0.12 });
    hiss(v, 0.016, { type: 'highpass', f: 2500, gain: 0.2 });
    clicks(v, 4, 0.05, 0.25 + 0.1 * L, { f: 2800, gain: 0.12, spread: 0.4 });
  },
  boom_big: (v) => {
    const L = v.level;
    thump(v, vary(v, 135, 0.05), 38, 0.65 + 0.3 * L, 0.38, { sweep: 0.12 });
    hiss(v, 0.85 + 0.3 * L, { type: 'lowpass', f: 3200, to: 140, gain: 0.14, attack: 0.004 });
    hiss(v, 0.025, { type: 'highpass', f: 2000, gain: 0.25 });
    hiss(v, 0.5, { type: 'bandpass', f: 500, to: 160, q: 0.8, gain: 0.12, dt: 0.02 });
    clicks(v, 8, 0.08, 0.6, { f: 3000, gain: 0.12, spread: 0.5, pan: 0.5 });
    clicks(v, 4, 0.1, 0.5, { f: 450, q: 2, dur: 0.03, gain: 0.2 });
  },
  boom_bomb: (v) => {
    tone(v, 950, 0.05, { to: 220, gain: 0.07 });
    thump(v, vary(v, 150, 0.05), 45, 0.45, 0.32, { sweep: 0.09, dt: 0.01 });
    hiss(v, 0.5, { type: 'lowpass', f: 2600, to: 180, gain: 0.14, dt: 0.01 });
    hiss(v, 0.4, { type: 'highpass', f: 4200, gain: 0.07, dt: 0.02 });
    clicks(v, 6, 0.06, 0.4, { f: 3200, gain: 0.12, spread: 0.5, pan: 0.4 });
  },
  boom_meteor: (v) => {
    const L = v.level;
    hiss(v, 0.03, { type: 'highpass', f: 1800, gain: 0.28 });
    hiss(v, 0.7, { type: 'lowpass', f: 4200, to: 200, gain: 0.16 });
    thump(v, vary(v, 115, 0.05), 34, 0.85 + 0.3 * L, 0.42, { sweep: 0.15 });
    hiss(v, 1.2, { type: 'lowpass', f: 230, gain: 0.03, attack: 0.04, dt: 0.02 });
    clicks(v, 10, 0.06, 0.9, { f: 2600, gain: 0.12, spread: 0.6, pan: 0.6 });
    clicks(v, 5, 0.08, 0.6, { f: 500, q: 2, dur: 0.035, gain: 0.2 });
    clicks(v, 8, 0.3, 1, { type: 'highpass', f: 3500, dur: 0.006, gain: 0.1 });
  },
  boom_slam: (v) => {
    const L = v.level;
    thump(v, vary(v, 125, 0.06), 42, 0.45 + 0.25 * L, 0.34, { sweep: 0.08 });
    hiss(v, 0.5 + 0.25 * L, { type: 'lowpass', f: 650 * v.pitch, to: 120, gain: 0.06 });
    hiss(v, 0.2, { type: 'bandpass', f: 320, to: 120, q: 1, gain: 0.15 });
    clicks(v, 6, 0.04, 0.35 + 0.2 * L, { f: 1800, gain: 0.12, spread: 0.5, pan: 0.5 });
  },
  shockwave: (v) => {
    whoosh(v, 0.42, 1700, 170, 0.25, { q: 0.9, attack: 0.01 });
    thump(v, 310, 90, 0.32, 0.13, { grit: false, sweep: 0.2 });
    tone(v, 1250, 0.25, { to: 600, gain: 0.02 });
  },
  zap: (v) => {
    const L = v.level;
    const n = 4 + Math.floor(v.rnd() * 3) + Math.round(L * 3);
    clicks(v, n, 0, 0.1 + 0.08 * L, { type: 'highpass', f: 3600, spread: 0.4, gain: 0.16, dur: 0.006, fade: false });
    tone(v, vary(v, 1900, 0.2), 0.06, { type: 'square', to: 300, lp: 4000, gain: 0.025 });
    hiss(v, 0.1 + 0.15 * L, { type: 'bandpass', f: 1400, to: 500, q: 0.7, gain: 0.12 });
    tone(v, 110, 0.1 + 0.2 * L, { type: 'sawtooth', lp: 1200, gain: 0.03 });
  },

  // --- foes falling
  death_flesh: (v) => {
    const L = v.level;
    thump(v, vary(v, 150, 0.06), 58, 0.24 + 0.2 * L, 0.24, { sweep: 0.08 });
    hiss(v, 0.2, { type: 'lowpass', f: 1000 * v.pitch, to: 300, gain: 0.12 });
    hiss(v, 0.26, { type: 'bandpass', f: 900 * v.pitch, to: 380, q: 1, gain: 0.08, attack: 0.04 });
    thump(v, vary(v, 115, 0.06), 55, 0.14, 0.15, { dt: 0.13 + 0.05 * L, grit: false });
  },
  death_slime: (v) => {
    hiss(v, 0.26, { type: 'bandpass', f: 1500 * v.pitch, to: 240, q: 3, gain: 0.32 });
    tone(v, vary(v, 320, 0.08), 0.2, { to: 80, gain: 0.14 });
    for (let i = 0; i < 4; i++) tone(v, between(v, 480, 1100), 0.03, { dt: 0.05 + v.rnd() * 0.25, to: between(v, 900, 1600), gain: 0.05 });
  },
  death_bone: (v) => {
    thump(v, 165, 80, 0.12, 0.12, { grit: false });
    // Bones clattering down: two handfuls of clacks, bright and duller.
    clicks(v, 7, 0.02, 0.32, { f: 2100 * v.pitch, spread: 0.35, q: 8, gain: 0.35, dur: 0.015, pan: 0.3 });
    clicks(v, 5, 0.04, 0.3, { f: 950 * v.pitch, spread: 0.3, q: 5, gain: 0.25, dur: 0.022 });
    hiss(v, 0.22, { type: 'bandpass', f: 2500, q: 4, gain: 0.06, dt: 0.03 });
  },
  death_stone: (v) => {
    const L = v.level;
    thump(v, vary(v, 105, 0.05), 38, 0.4 + 0.3 * L, 0.3, { sweep: 0.1 });
    hiss(v, 0.6 + 0.3 * L, { type: 'lowpass', f: 1500, to: 200, gain: 0.08 });
    clicks(v, 10, 0.03, 0.6 + 0.3 * L, { f: 900, q: 3, dur: 0.03, gain: 0.25, spread: 0.6, pan: 0.4 });
    hiss(v, 0.5, { type: 'highpass', f: 3000, gain: 0.05, attack: 0.1, dt: 0.05 });
  },
  death_shell: (v) => {
    hiss(v, 0.04, { type: 'highpass', f: 2000, gain: 0.22 });
    hiss(v, 0.08, { type: 'bandpass', f: 1000 * v.pitch, q: 2, gain: 0.22, dt: 0.005 });
    clicks(v, 5, 0.01, 0.06, { f: 3000, q: 6, dur: 0.008, gain: 0.18 });
    tone(v, vary(v, 1800, 0.1), 0.08, { to: 900, gain: 0.025, dt: 0.04 });
    tone(v, 220, 0.08, { to: 120, gain: 0.08 });
  },
  death_wood: (v) => {
    hiss(v, 0.03, { type: 'bandpass', f: 1200, q: 4, gain: 0.3 });
    tone(v, vary(v, 300, 0.08), 0.15, { type: 'triangle', to: 150, gain: 0.1 });
    thump(v, 135, 70, 0.15, 0.13, { grit: false, dt: 0.02 });
    hiss(v, 0.35, { type: 'highpass', f: 3600, gain: 0.08, attack: 0.05, dt: 0.02 });
  },
  death_ghost: (v) => {
    const f = vary(v, 900, 0.08);
    tone(v, f, 0.6, { to: f * 0.33, vib: 20, vibRate: 6, gain: 0.05, attack: 0.02 });
    tone(v, f * 1.012, 0.55, { to: f * 0.34, gain: 0.04, attack: 0.02 });
    whoosh(v, 0.6, 2000, 400, 0.12, { q: 1.5, attack: 0.02 });
    hiss(v, 0.5, { type: 'highpass', f: 6000, gain: 0.04, attack: 0.25 });
  },
  kill_chime: (v) => {
    bell(v, ladder(3 + Math.max(0, Math.min(7, v.step))), 0.3, 0.035);
  },

  // --- foes attacking
  mob_bite: (v) => {
    hiss(v, 0.014, { type: 'bandpass', f: 2600 * v.pitch, q: 2, gain: 0.22 });
    tone(v, vary(v, 420, 0.1), 0.05, { to: 200, gain: 0.07 });
    hiss(v, 0.08, { type: 'lowpass', f: 800 * v.pitch, gain: 0.06, attack: 0.01 });
    hiss(v, 0.01, { type: 'bandpass', f: 2200 * v.pitch, q: 3, gain: 0.18, dt: 0.045 });
  },
  mob_swipe: (v) => {
    whoosh(v, 0.14, vary(v, 480, 0.12) * v.pitch, vary(v, 2100, 0.1) * v.pitch, 0.2, { attack: 0.045 });
    if (v.rnd() < 0.6) metal(v, vary(v, 2100, 0.1), 0.08, 0.012, { dt: 0.06 }, [1, 1.5]);
  },
  mob_shot: (v) => {
    const L = v.level;
    hiss(v, 0.08 + 0.12 * L, { type: 'bandpass', f: (1800 - 700 * L) * v.pitch, to: 650, q: 2, gain: 0.2 + 0.1 * L });
    tone(v, vary(v, 900, 0.1), 0.07, { to: 380, gain: 0.04 });
    hiss(v, 0.03, { type: 'lowpass', f: 1200, gain: 0.1 });
    if (L > 0.5) thump(v, 220, 80, 0.25, 0.14, { grit: false });
  },
  mob_cast: (v) => {
    const d = 0.45;
    tone(v, 220, d, { type: 'sawtooth', to: 440, lp: 1200, fTo: 2600, attack: d * 0.85, gain: 0.025 });
    tone(v, 440, d, { to: 880, vib: 12, vibRate: 9, attack: d * 0.85, gain: 0.02 });
    whoosh(v, d, 700, 2400, 0.07, { q: 2, attack: d * 0.85 });
    thump(v, 300, 120, 0.13, 0.08, { dt: d, grit: false });
    hiss(v, 0.03, { type: 'bandpass', f: 1500, gain: 0.12, dt: d });
  },
  mob_charge_windup: (v) => {
    hiss(v, 0.16, { type: 'bandpass', f: 950 * v.pitch, to: 600 * v.pitch, q: 2, gain: 0.2, attack: 0.01 });
    for (const t of [0.22, 0.42]) whoosh(v, 0.12, 1500, 600, 0.14, { dt: t, q: 1.5, attack: 0.02 });
    tone(v, 88, 0.55, { type: 'sawtooth', lp: 520, vib: 10, vibRate: 13, attack: 0.1, gain: 0.04 });
  },
  mob_charge: (v) => {
    const big = v.level > 0.6;
    for (let k = 0; k < 4; k++) thump(v, vary(v, 135, 0.06), 70, 0.06, (0.12 - k * 0.015) * (big ? 1.4 : 1), { dt: k * 0.11, grit: false });
    whoosh(v, 0.45, 600, 1500, big ? 0.16 : 0.12, { q: 0.8, attack: 0.06 });
  },
  mob_slam_windup: (v) => {
    hiss(v, 0.55, { type: 'bandpass', f: 300, to: 520, q: 7, gain: 0.1, attack: 0.1 });
    tone(v, 70, 0.65, { type: 'sawtooth', to: 92, lp: 420, attack: 0.35, gain: 0.05 });
    clicks(v, 3, 0.1, 0.5, { f: 1200, gain: 0.08 });
  },
  mob_fuse: (v) => {
    hiss(v, 0.6, { type: 'highpass', f: 5200, gain: 0.06, attack: 0.02, hold: 0.45 });
    clicks(v, 7, 0, 0.58, { type: 'highpass', f: 3200, dur: 0.005, gain: 0.1, fade: false });
    for (const t of [0, 0.2, 0.34, 0.44, 0.51, 0.56]) tone(v, 1500, 0.025, { dt: t, type: 'square', lp: 3000, gain: 0.022 });
  },
  boss_windup: (v) => {
    tone(v, 62, 0.75, { type: 'sawtooth', to: 78, lp: 620, vib: 8, vibRate: 9, attack: 0.15, gain: 0.08 });
    tone(v, 124, 0.7, { type: 'sawtooth', bp: 520, q: 3, attack: 0.15, gain: 0.03 });
    hiss(v, 0.65, { type: 'lowpass', f: 520, attack: 0.2, gain: 0.08 });
  },
  boss_summon: (v) => {
    whoosh(v, 0.7, 300, 1300, 0.15, { attack: 0.25 });
    thump(v, 110, 50, 0.65, 0.12, { sweep: 0.5, grit: false });
    [69, 72, 76].forEach((n, k) => bell(v, midi(n - 12), 0.8, 0.03, { dt: 0.1 + k * 0.12 }));
  },
  boss_enrage: (v) => {
    thump(v, 105, 38, 0.65, 0.32, { sweep: 0.12 });
    tone(v, 92, 1, { type: 'sawtooth', to: 64, lp: 950, vib: 7, vibRate: 11, attack: 0.05, gain: 0.1 });
    tone(v, 184, 0.9, { type: 'sawtooth', to: 128, bp: 700, q: 2, attack: 0.05, gain: 0.04 });
    whoosh(v, 1, 750, 450, 0.2, { attack: 0.05 });
  },

  // --- the skill roll
  skill_roll_start: (v) => {
    hiss(v, 0.02, { type: 'bandpass', f: 1800, q: 3, gain: 0.2 });
    tone(v, 160, 0.05, { type: 'square', to: 100, lp: 900, gain: 0.03 });
    whoosh(v, 0.22, 500, 1500, 0.08, { dt: 0.02, attack: 0.04 });
  },
  skill_roll_spin: (v) => {
    // `level` climbs from 0 to 1 as the reel slows; `step` lifts the last ticks before a rare result.
    const r = v.level;
    const up = Math.pow(2, (r * 14 + v.step) / 12);
    tone(v, vary(v, 950, 0.02) * up, 0.028, { type: 'square', lp: 4200, gain: 0.03 + 0.02 * r });
    hiss(v, 0.01, { type: 'bandpass', f: 3800, q: 4, gain: 0.07 });
    tone(v, 620 * up, 0.016, { type: 'triangle', gain: 0.02 });
    if (v.step > 0) bell(v, midi(84 + v.step), 0.25, 0.02);
  },
  skill_roll_land_common: (v) => clunk(v, 1),
  skill_roll_land_uncommon: (v) => {
    clunk(v, 1);
    bell(v, midi(76), 0.4, 0.05, { dt: 0.02 });
    bell(v, midi(79), 0.45, 0.05, { dt: 0.1 });
  },
  skill_roll_land_rare: (v) => {
    clunk(v, 1.15);
    [72, 76, 79].forEach((n, k) => bell(v, midi(n), 0.5, 0.055, { dt: 0.02 + k * 0.07 }));
    whoosh(v, 0.3, 600, 2600, 0.08, { q: 1, attack: 0.08 });
  },
  skill_roll_land_epic: (v) => {
    thump(v, 130, 45, 0.35, 0.3, { sweep: 0.08 });
    hiss(v, 0.12, { type: 'lowpass', f: 2400, gain: 0.14 });
    chord(v, [60, 64, 67, 72], 0.45, { type: 'sawtooth', lp: 2400, gain: 0.022, attack: 0.008 });
    [76, 79, 84, 88].forEach((n, k) => ping(v, midi(n), 0.5, 0.055, { dt: 0.05 + k * 0.06 }));
    hiss(v, 0.6, { type: 'highpass', f: 6000, gain: 0.05, attack: 0.03, dt: 0.05 });
  },
  skill_roll_land_legendary: (v) => {
    thump(v, 120, 36, 0.7, 0.38, { sweep: 0.12 });
    hiss(v, 0.35, { type: 'lowpass', f: 2200, to: 300, gain: 0.14 });
    for (const n of [48, 55, 60, 64, 67]) tone(v, midi(n), 0.9, { type: 'sawtooth', lp: 1500, fTo: 2600, attack: 0.012, hold: 0.2, gain: 0.024, vib: 2, vibRate: 5 });
    for (let k = 0; k < 8; k++) ping(v, ladder(6 + k), 0.45, 0.045, { dt: 0.12 + k * 0.06 });
    hiss(v, 1.2, { type: 'highpass', f: 6000, gain: 0.07, attack: 0.01, dt: 0.02 });
  },
  skill_roll_land_jackpot: (v) => {
    // A fanfare: G C E G up in rhythm on brass, then the held chord with a timpani under each half.
    thump(v, 98, 40, 0.5, 0.3, { sweep: 0.1 });
    brass(v, 67, 0, 0.14, 0.04);
    brass(v, 72, 0.13, 0.14, 0.04);
    brass(v, 76, 0.26, 0.14, 0.04);
    brass(v, 79, 0.39, 0.2, 0.042);
    for (const n of [72, 76, 79, 84]) tone(v, midi(n), 1, { dt: 0.6, type: 'sawtooth', lp: 1700, fTo: 3000, attack: 0.02, hold: 0.4, gain: 0.03, vib: 3, vibRate: 5.5 });
    thump(v, 98, 40, 0.6, 0.3, { sweep: 0.1, dt: 0.6 });
    for (let k = 0; k < 8; k++) ping(v, ladder(5 + k), 0.4, 0.04, { dt: 0.65 + k * 0.05 });
    for (let k = 0; k < 6; k++) ping(v, ladder(7 + k) * 2, 0.15, 0.025, { dt: 0.95 + k * 0.05 });
    hiss(v, 1.4, { type: 'highpass', f: 6500, gain: 0.07, attack: 0.25, dt: 0.4 });
  },

  // --- the skills: Guardian
  skill_shield_slam: (v) => {
    whoosh(v, 0.07, 320, 1600, 0.2, { attack: 0.03 });
    metal(v, vary(v, 390, 0.04), 0.4, 0.07, { dt: 0.05 }, [1, 2.62, 4.18, 5.4]);
    thump(v, 185, 48, 0.24, 0.32, { dt: 0.05, sweep: 0.07 });
    hiss(v, 0.12, { type: 'lowpass', f: 2000, to: 400, gain: 0.14, dt: 0.05 });
  },
  skill_iron_skin: (v) => {
    metal(v, 620, 0.25, 0.05, {}, [1, 2.3, 3.7]);
    hiss(v, 0.4, { type: 'highpass', f: 2000, to: 8000, gain: 0.08, attack: 0.15 });
    [1046, 1568, 2093].forEach((f, k) => metal(v, f, 0.5, 0.025, { dt: 0.08 + k * 0.06 }, [1, 2.76]));
    tone(v, 110, 0.7, { type: 'triangle', vib: 3, vibRate: 5, attack: 0.1, hold: 0.2, gain: 0.07 });
    tone(v, 220, 0.6, { type: 'triangle', attack: 0.1, gain: 0.03 });
  },
  skill_ground_pound: (v) => {
    whoosh(v, 0.1, 400, 160, 0.15, { q: 1, attack: 0.05 });
    thump(v, 150, 36, 0.55, 0.42, { dt: 0.03, sweep: 0.1 });
    hiss(v, 0.75, { type: 'lowpass', f: 420, to: 120, gain: 0.05, dt: 0.03 });
    clicks(v, 10, 0.06, 0.55, { f: 1700, gain: 0.14, spread: 0.6, pan: 0.6 });
    whoosh(v, 0.35, 1300, 200, 0.18, { dt: 0.04, q: 0.9, attack: 0.01 });
  },
  skill_rallying_taunt: (v) => {
    voiceOf(v, 165, 0.5, { to: 185, gain: 0.07, a: 720, b: 1180 });
    hiss(v, 0.45, { type: 'bandpass', f: 1200, q: 2, gain: 0.08, attack: 0.03 });
    thump(v, 120, 50, 0.3, 0.26);
    whoosh(v, 0.45, 1600, 180, 0.25, { dt: 0.06, q: 0.9, attack: 0.01 });
  },
  skill_aegis: (v) => {
    thump(v, 95, 48, 0.6, 0.25, { sweep: 0.25 });
    chord(v, [60, 64, 67, 72], 1.1, { type: 'triangle', attack: 0.18, hold: 0.3, gain: 0.03, vib: 3, vibRate: 5 });
    metal(v, 1320, 0.8, 0.025, { dt: 0.1 }, [1, 2.76, 5.4]);
    hiss(v, 0.9, { type: 'highpass', f: 5500, gain: 0.06, attack: 0.3 });
    bell(v, midi(84), 0.7, 0.045, { dt: 0.25 });
  },
  skill_titans_wrath: (v) => {
    hiss(v, 0.18, { type: 'lowpass', f: 300, to: 900, gain: 0.08, attack: 0.15 });
    thump(v, 125, 32, 1, 0.45, { dt: 0.16, sweep: 0.16 });
    hiss(v, 1.3, { type: 'lowpass', f: 2400, to: 140, gain: 0.16, dt: 0.16 });
    clicks(v, 12, 0.2, 1, { f: 2000, gain: 0.14, spread: 0.6, pan: 0.7 });
    clicks(v, 6, 0.2, 0.8, { f: 450, q: 2, dur: 0.035, gain: 0.2 });
    for (const n of [36, 43, 48]) tone(v, midi(n), 0.9, { dt: 0.16, type: 'sawtooth', lp: 900, attack: 0.01, hold: 0.25, gain: 0.04 });
  },
  // --- Blade
  skill_twin_slash: (v) => {
    slash(v, 0, 1);
    slash(v, 0.16, 1.19);
  },
  skill_battle_cry: (v) => {
    voiceOf(v, 205, 0.38, { to: 255, gain: 0.07, a: 800, b: 1350 });
    thump(v, 140, 55, 0.22, 0.26);
    thump(v, 150, 55, 0.22, 0.24, { dt: 0.13 });
    tone(v, midi(55), 0.55, { dt: 0.2, type: 'sawtooth', to: midi(62), sweep: 0.12, lp: 1600, attack: 0.03, hold: 0.2, gain: 0.04 });
    tone(v, midi(62), 0.45, { dt: 0.3, type: 'sawtooth', lp: 1800, attack: 0.03, hold: 0.15, gain: 0.03 });
  },
  skill_shadowstep: (v) => {
    tone(v, 1400, 0.08, { to: 200, gain: 0.07 });
    hiss(v, 0.1, { type: 'highpass', f: 1500, to: 6000, gain: 0.1 });
    hiss(v, 0.012, { type: 'highpass', f: 3000, gain: 0.25, dt: 0.03 });
    metal(v, 2200, 0.15, 0.035, { dt: 0.03 }, [1, 1.6]);
    hiss(v, 0.3, { type: 'lowpass', f: 1200, to: 300, gain: 0.14, dt: 0.04, attack: 0.05 });
  },
  skill_whirlwind: (v) => {
    // Two seconds of spinning, a swoosh round each 0.22 s (when it cuts), left, right, left...
    const dur = 2;
    const every = 0.22;
    hiss(v, dur, { type: 'bandpass', f: 500, q: 0.8, gain: 0.07, attack: 0.15, hold: dur - 0.45 });
    for (let k = 0, t = 0; t < dur - 0.05; k++, t += every) {
      hiss(v, every * 1.1, { dt: t, type: 'bandpass', f: 600, to: 2600, sweep: every * 0.6, q: 1.5, gain: k === 0 ? 0.3 : 0.24, attack: every * 0.45, pan: k % 2 ? 0.6 : -0.6 });
    }
    tone(v, 2400, dur, { type: 'triangle', gain: 0.008, attack: 0.2, hold: dur - 0.5, vib: 60, vibRate: 4.5 });
  },
  skill_thousand_cuts: (v) => {
    whoosh(v, 0.25, 3000, 6000, 0.12, { q: 3, attack: 0.02 });
    metal(v, 2800, 0.4, 0.035, {}, [1, 1.47, 2.1]);
    for (let k = 0; k < 10; k++) {
      whoosh(v, 0.07, between(v, 900, 1400), between(v, 3500, 5000), 0.24, { dt: 0.05 + k * 0.15, q: 1.5, attack: 0.02, pan: k % 2 ? 0.5 : -0.5 });
    }
    hiss(v, 0.015, { dt: 1.6, type: 'bandpass', f: 2600, q: 4, gain: 0.2 });
    metal(v, 1800, 0.12, 0.025, { dt: 1.6 }, [1, 1.5]);
  },
  skill_excalibur: (v) => {
    chord(v, [60, 67, 72, 76], 1.3, { type: 'sawtooth', lp: 1400, fTo: 2400, attack: 0.15, hold: 0.4, gain: 0.02, vib: 3, vibRate: 5 });
    chord(v, [72, 79], 1.2, { type: 'triangle', attack: 0.1, hold: 0.3, gain: 0.03 });
    metal(v, 1760, 1, 0.045, {}, [1, 1.5, 2, 3]);
    hiss(v, 0.6, { type: 'highpass', f: 5000, gain: 0.06, attack: 0.02 });
    whoosh(v, 0.45, 500, 3000, 0.2, { dt: 0.05, q: 1, attack: 0.12 });
  },
  // --- Ranger
  skill_power_shot: (v) => {
    pluck(v, 118, 0.32, 0.11, { bright: 2400 });
    whoosh(v, 0.3, 4500, 1200, 0.16, { q: 2, attack: 0.01 });
    hiss(v, 0.015, { type: 'highpass', f: 3000, gain: 0.16, dt: 0.01 });
    thump(v, 160, 70, 0.15, 0.14, { grit: false });
  },
  skill_fan_shot: (v) => {
    [140, 160, 150, 175].forEach((f, k) => pluck(v, f, 0.25, 0.06, { dt: k * 0.018, pan: (k - 1.5) * 0.3 }));
    whoosh(v, 0.3, 3500, 1200, 0.14, { q: 1.5, attack: 0.02, pan: -0.5 });
    whoosh(v, 0.3, 3000, 1100, 0.14, { q: 1.5, attack: 0.02, dt: 0.02, pan: 0.5 });
  },
  skill_snare: (v) => {
    pluck(v, 140, 0.25, 0.09);
    hiss(v, 0.5, { type: 'bandpass', f: 3200, to: 1400, q: 6, gain: 0.1, attack: 0.05, dt: 0.02 });
    tone(v, 1700, 0.4, { to: 1100, gain: 0.02, attack: 0.05, dt: 0.02 });
  },
  skill_arrow_rain: (v) => {
    for (let k = 0; k < 3; k++) pluck(v, 145 + k * 12, 0.22, 0.065, { dt: k * 0.04, pan: (k - 1) * 0.4 });
    for (let k = 0; k < 4; k++) tone(v, between(v, 2200, 2800), 0.45, { dt: 0.05 + k * 0.03, to: between(v, 900, 1200), gain: 0.02, attack: 0.1, pan: side(v, 0.6) });
    patter(v, 0.25, 2.2, 0.18, 0.1);
  },
  skill_arrow_nova: (v) => {
    whoosh(v, 0.2, 500, 2600, 0.2, { q: 1.4, attack: 0.05 });
    for (const t of [0.1, 0.32]) {
      [150, 175].forEach((f, k) => pluck(v, f, 0.2, 0.06, { dt: t + k * 0.015 }));
      whoosh(v, 0.25, 4000, 1200, 0.14, { dt: t, q: 1, attack: 0.01, pan: -0.6 });
      whoosh(v, 0.25, 3800, 1100, 0.14, { dt: t + 0.01, q: 1, attack: 0.01, pan: 0.6 });
    }
  },
  skill_thousand_arrows: (v) => {
    for (let k = 0; k < 4; k++) pluck(v, between(v, 130, 190), 0.25, 0.065, { dt: k * 0.03, pan: side(v, 0.6) });
    for (let k = 0; k < 5; k++) tone(v, between(v, 2000, 3000), 0.6, { dt: 0.05 + k * 0.04, to: between(v, 800, 1300), gain: 0.02, attack: 0.15, pan: side(v, 0.7) });
    whoosh(v, 0.8, 2500, 1200, 0.12, { q: 0.8, attack: 0.3 });
    thump(v, 140, 60, 0.3, 0.18);
    patter(v, 0.25, 3.1, 0.11, 0.09);
  },
  // --- Cleric
  skill_mend: (v) => {
    [72, 76, 79, 84, 88].forEach((n, k) => ping(v, midi(n), 0.5, 0.04, { dt: k * 0.045, type: 'triangle' }));
    hiss(v, 0.6, { type: 'highpass', f: 6000, gain: 0.05, attack: 0.15 });
    tone(v, midi(72), 0.7, { type: 'triangle', gain: 0.03, attack: 0.15 });
  },
  skill_smite: (v) => {
    bell(v, midi(91), 0.6, 0.05);
    whoosh(v, 0.35, 1500, 6000, 0.12, { q: 1, attack: 0.3 });
    bell(v, midi(84), 0.7, 0.06, { dt: 0.35 });
    bell(v, midi(79), 0.8, 0.05, { dt: 0.36 });
    hiss(v, 0.2, { type: 'highpass', f: 4000, gain: 0.1, dt: 0.35 });
  },
  skill_blessing: (v) => {
    chord(v, [72, 76, 79], 0.9, { type: 'triangle', attack: 0.12, hold: 0.25, gain: 0.03 });
    tone(v, midi(84), 0.8, { attack: 0.1, gain: 0.02, vib: 4, vibRate: 5 });
    for (let k = 0; k < 6; k++) ping(v, ladder(8 + Math.floor(v.rnd() * 7)), 0.3, 0.03, { dt: 0.1 + k * 0.08, pan: side(v) });
  },
  skill_sanctuary: (v) => {
    // Three seconds of choir (the zone's length), a low bell, sparkles over it.
    for (const [n, det] of [[60, -7], [64, 7], [67, -5], [72, 6]] as const) tone(v, midi(n), 3, { type: 'sawtooth', lp: 1300, attack: 0.35, hold: 1.8, gain: 0.016, detune: det, vib: 2.5, vibRate: 4.5 });
    bell(v, midi(48), 1.4, 0.07);
    for (let k = 0; k < 8; k++) ping(v, ladder(9 + Math.floor(v.rnd() * 6)), 0.35, 0.022, { dt: 0.3 + k * 0.32, pan: side(v, 0.6) });
  },
  skill_guardian_angel: (v) => {
    for (let k = 0; k < 4; k++) whoosh(v, 0.13, 700, 300, 0.2, { dt: k * 0.16, q: 1.1, attack: 0.04 });
    chord(v, [76, 79, 84, 88], 1.3, { type: 'triangle', attack: 0.25, hold: 0.4, gain: 0.025, vib: 4, vibRate: 5 });
    [72, 76, 79, 84, 88, 91].forEach((n, k) => ping(v, midi(n), 0.45, 0.03, { dt: 0.15 + k * 0.05, type: 'triangle' }));
    hiss(v, 1, { type: 'highpass', f: 6500, gain: 0.05, attack: 0.4 });
  },
  skill_miracle: (v) => {
    for (const [n, det] of [[60, -8], [64, 8], [67, -6], [72, 7], [76, -5]] as const) tone(v, midi(n), 1.8, { type: 'sawtooth', lp: 1600, fTo: 2600, attack: 0.3, hold: 0.6, gain: 0.017, detune: det, vib: 3, vibRate: 5 });
    chord(v, [72, 79, 84], 0.6, { dt: 0.3, type: 'sawtooth', lp: 2600, attack: 0.01, gain: 0.022 });
    thump(v, 110, 50, 0.6, 0.22, { dt: 0.3 });
    for (let k = 0; k < 10; k++) ping(v, ladder(5 + k), 0.45, 0.04, { dt: 0.35 + k * 0.05 });
    hiss(v, 1.4, { type: 'highpass', f: 6000, gain: 0.06, attack: 0.3 });
  },
  // --- Arcanist
  skill_magic_missiles: (v) => {
    for (let k = 0; k < 6; k++) {
      const f = between(v, 1300, 1800);
      tone(v, f, 0.1, { dt: k * 0.03, to: f * 0.4, vib: 80, vibRate: 35, gain: 0.04, pan: (k - 2.5) * 0.2 });
      tone(v, f * 0.5, 0.07, { dt: k * 0.03, type: 'triangle', to: f * 0.2, gain: 0.04 });
    }
    hiss(v, 0.25, { type: 'highpass', f: 5500, gain: 0.06, attack: 0.02 });
  },
  skill_frost_nova: (v) => {
    hiss(v, 0.02, { type: 'highpass', f: 3500, gain: 0.25 });
    whoosh(v, 0.5, 3000, 600, 0.2, { q: 0.8, attack: 0.01 });
    for (let k = 0; k < 9; k++) ping(v, between(v, 2200, 5200), 0.4, 0.024, { dt: 0.02 + k * 0.035, pan: side(v, 0.6) });
    thump(v, 220, 80, 0.25, 0.15, { grit: false });
  },
  skill_chain_lightning: (v) => {
    clicks(v, 8, 0, 0.2, { type: 'highpass', f: 3600, spread: 0.45, gain: 0.18, dur: 0.008, fade: false, pan: 0.4 });
    clicks(v, 6, 0.1, 0.25, { type: 'highpass', f: 3000, spread: 0.45, gain: 0.14, dur: 0.01, pan: 0.4 });
    tone(v, 82, 0.45, { type: 'sawtooth', to: 55, lp: 1600, gain: 0.05, vib: 20, vibRate: 30 });
    tone(v, 2200, 0.08, { type: 'square', to: 300, lp: 5000, gain: 0.025 });
    hiss(v, 0.35, { type: 'bandpass', f: 1500, to: 500, q: 0.8, gain: 0.14 });
  },
  skill_meteor: (v) => {
    // The roar coming down for the 0.9 s until it lands (the landing is boom_meteor).
    const d = 0.9;
    hiss(v, d, { type: 'lowpass', f: 250, to: 2200, gain: 0.12, attack: d * 0.85 });
    tone(v, 900, d, { to: 260, gain: 0.03, attack: d * 0.6 });
    tone(v, 55, d, { type: 'sawtooth', to: 70, lp: 400, gain: 0.05, attack: d * 0.8 });
    hiss(v, d * 0.9, { type: 'bandpass', f: 2600, to: 900, q: 3, gain: 0.08, attack: d * 0.7 });
  },
  skill_singularity: (v) => {
    const d = 2.5;
    tone(v, 55, d, { type: 'sawtooth', to: 110, lp: 380, fTo: 1200, attack: d * 0.6, hold: d * 0.3, gain: 0.05 });
    tone(v, 58, d, { type: 'sawtooth', to: 116, lp: 380, fTo: 1200, attack: d * 0.6, hold: d * 0.3, gain: 0.04 });
    whoosh(v, d, 2500, 300, 0.14, { q: 1.5, attack: d * 0.9 });
    tone(v, 700, d, { to: 2400, gain: 0.015, attack: d * 0.9, vib: 15, vibRate: 7 });
  },
  skill_meteor_storm: (v) => {
    hiss(v, 2.6, { type: 'lowpass', f: 200, to: 900, gain: 0.08, attack: 0.6, hold: 1.2 });
    for (let k = 0; k < 7; k++) {
      const land = 0.9 + k * 0.25;
      tone(v, between(v, 1000, 1400), 0.75, { dt: land - 0.75, to: between(v, 250, 350), gain: 0.03, attack: 0.5, pan: side(v, 0.6) });
    }
    tone(v, 50, 2.4, { type: 'sawtooth', lp: 300, attack: 0.5, hold: 1.2, gain: 0.05 });
  },
  // --- Lancer
  skill_javelin: (v) => {
    whoosh(v, 0.25, 900, 3000, 0.26, { attack: 0.04 });
    tone(v, 110, 0.35, { type: 'sawtooth', lp: 700, vib: 30, vibRate: 22, gain: 0.04, attack: 0.03 });
    hiss(v, 0.4, { type: 'bandpass', f: 2800, to: 1600, q: 5, gain: 0.07, attack: 0.05, dt: 0.05 });
  },
  skill_sweep: (v) => {
    whoosh(v, 0.32, 300, 2600, 0.28, { attack: 0.1, pan: -0.5 });
    whoosh(v, 0.22, 2400, 700, 0.2, { dt: 0.12, attack: 0.05, pan: 0.5 });
    tone(v, 180, 0.3, { type: 'triangle', vib: 25, vibRate: 18, gain: 0.03 });
  },
  skill_impale: (v) => {
    whoosh(v, 0.06, 1500, 5000, 0.26, { q: 2, attack: 0.012 });
    hiss(v, 0.05, { type: 'bandpass', f: 900, q: 1.5, gain: 0.26, dt: 0.04 });
    clicks(v, 4, 0.04, 0.04, { f: 2400, q: 5, gain: 0.16, dur: 0.008 });
    thump(v, 170, 65, 0.18, 0.2, { dt: 0.04 });
    metal(v, 1900, 0.2, 0.025, { dt: 0.05 }, [1, 1.6]);
  },
  skill_dragon_lunge: (v) => {
    tone(v, 92, 0.42, { type: 'sawtooth', to: 70, bp: 600, q: 1.5, vib: 9, vibRate: 12, gain: 0.08, attack: 0.03 });
    hiss(v, 0.4, { type: 'bandpass', f: 700, q: 1, gain: 0.14, attack: 0.03 });
    whoosh(v, 0.34, 500, 3000, 0.24, { dt: 0.02, attack: 0.08 });
  },
  skill_wyrm_rush: (v) => {
    tone(v, 85, 0.5, { type: 'sawtooth', to: 66, bp: 560, q: 1.5, vib: 9, vibRate: 12, gain: 0.08, attack: 0.03 });
    for (let k = 0; k < 3; k++) whoosh(v, 0.26, 500 + k * 120, 3000 + k * 400, 0.24, { dt: k * 0.32, attack: 0.07, pan: (k - 1) * 0.5 });
  },
  skill_skyfall: (v) => {
    whoosh(v, 0.3, 400, 2600, 0.24, { attack: 0.08 });
    tone(v, 300, 0.25, { to: 900, gain: 0.04 });
    tone(v, 1500, 0.3, { dt: 0.25, to: 300, gain: 0.04, attack: 0.15 });
    whoosh(v, 0.3, 3000, 700, 0.16, { dt: 0.25, q: 2, attack: 0.25 });
  },
  // --- signatures
  skill_rewind: (v) => {
    const dur = 0.8;
    tone(v, 880, dur, { type: 'triangle', to: 220, vib: 25, attack: 0.05, gain: 0.04 });
    tone(v, 1320, dur, { to: 330, vib: 30, attack: 0.05, gain: 0.02 });
    for (let k = 0; k < 10; k++) tone(v, 2400 - k * 120, 0.02, { dt: k * 0.075, type: 'square', lp: 4000, gain: 0.02 });
    hiss(v, dur, { type: 'highpass', f: 4000, gain: 0.08, attack: dur * 0.95 });
    whoosh(v, dur, 3000, 400, 0.18, { q: 1, attack: dur * 0.9 });
    bell(v, midi(84), 0.5, 0.05, { dt: dur });
    bell(v, midi(72), 0.6, 0.04, { dt: dur + 0.02 });
  },
};

/**
 * Each placeholder's overall level, measured (rendered offline, at a middling hit): its loudest tenth
 * of a second against the loudness its kind of moment should have, RMS: an everyday hit 0.06, a crit
 * 0.1, a knight's hurt 0.11, an attack 0.04, a foe's attack 0.035, a death 0.08, a small blast 0.12,
 * a big one 0.2, a reel tick 0.02, a landing from 0.05 (Common) to 0.2 (the jackpot), a skill from
 * 0.08 to 0.15 by tier (the long ones lower); and never so loud its peak passes about 0.62 on its own.
 * Missing: as made.
 */
export const TRIM: Partial<Record<FightCue, number>> = {
  hit_flesh: 1.1, hit_slime: 1.1, hit_bone: 2.6, hit_stone: 0.94, hit_shell: 1.6, hit_wood: 1.9, hit_ghost: 1.1, crit: 0.85, lucky_hit: 1.6,
  knight_hurt: 0.85, knight_block: 1.3, knight_down: 0.7, knight_dodge: 0.66, knight_blink: 1.5, revive: 1.4, heal: 1.3, atk_sword: 0.75,
  atk_spear: 0.88, atk_bow: 1.5, arrow_thunk: 1.3, atk_arcane: 2.4, arcane_pop: 1.2, atk_holy: 1.2, boom_small: 0.69, boom_big: 0.59,
  boom_bomb: 0.77, boom_meteor: 0.58, boom_slam: 0.6, shockwave: 0.83, zap: 1.8, death_flesh: 0.5, death_slime: 0.96, death_bone: 1.9,
  death_stone: 0.34, death_shell: 1.8, death_wood: 1.8, death_ghost: 1.3, kill_chime: 1.6, mob_bite: 1.4, mob_swipe: 0.71, mob_shot: 0.56,
  mob_cast: 1.1, mob_charge_windup: 1.1, mob_charge: 0.91, mob_slam_windup: 2.7, mob_fuse: 0.93, boss_windup: 1.4, boss_summon: 1.1,
  boss_enrage: 0.71, skill_roll_spin: 2.9, skill_roll_land_common: 1.3, skill_roll_land_uncommon: 1.2, skill_roll_land_epic: 0.61,
  skill_roll_land_legendary: 0.57, skill_roll_land_jackpot: 0.7, skill_shield_slam: 0.69, skill_iron_skin: 1.6, skill_ground_pound: 0.51,
  skill_rallying_taunt: 0.66, skill_aegis: 0.58, skill_titans_wrath: 0.54, skill_twin_slash: 0.67, skill_battle_cry: 0.74,
  skill_shadowstep: 2.1, skill_whirlwind: 0.73, skill_thousand_cuts: 0.92, skill_excalibur: 1.2, skill_power_shot: 1.1,
  skill_fan_shot: 1.7, skill_snare: 2.3, skill_arrow_rain: 3.4, skill_arrow_nova: 1.6, skill_thousand_arrows: 1.3, skill_mend: 2.4,
  skill_smite: 1.2, skill_blessing: 2.7, skill_sanctuary: 1.5, skill_guardian_angel: 1.6, skill_miracle: 0.79, skill_magic_missiles: 3.6,
  skill_frost_nova: 0.88, skill_chain_lightning: 1.6, skill_meteor: 0.77, skill_singularity: 1.5, skill_meteor_storm: 1.4,
  skill_javelin: 0.82, skill_sweep: 1.3, skill_impale: 0.73, skill_dragon_lunge: 0.98, skill_wyrm_rush: 1.2, skill_skyfall: 1.3,
  skill_rewind: 2.5,
};
