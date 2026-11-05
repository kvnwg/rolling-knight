/**
 * Rain on the world: a soft hiss under everything while it rains, a low wash of heavier rain beneath
 * it, and a patter of single drops on top. It plays on the sound effects' bus, so the effects volume
 * sets it, and fades in and out as the weather changes from floor to floor.
 */
import { engine, guarded, type Graph } from './engine';

interface Bed {
  graph: Graph;
  gain: GainNode;
  srcs: AudioScheduledSourceNode[];
}

class RainSound {
  private level = 0;
  private bed: Bed | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hooked = false;

  /** How hard it's raining, 0 (dry: the sound fades out) to 1. */
  set(level: number): void {
    if (!this.hooked) {
      this.hooked = true;
      // A new audio graph (the first, or one replacing a broken context): start again in it.
      engine.onBuild(() => {
        this.bed = null;
        this.sync();
      });
    }
    if (Math.abs(level - this.level) < 1e-3 && (level === 0 || this.bed)) return;
    this.level = level;
    this.sync();
  }

  private sync(): void {
    const g = engine.graph;
    if (!g) return;
    if (this.bed && this.bed.graph !== g) this.bed = null;
    const now = g.ctx.currentTime;
    if (this.level > 0) {
      this.bed ??= this.build(g, now);
      this.bed.gain.gain.cancelScheduledValues(now);
      this.bed.gain.gain.setTargetAtTime(0.1 * this.level, now, 0.9);
      this.timer ??= setInterval(() => this.patter(), 70);
    } else {
      const b = this.bed;
      this.bed = null;
      if (b) {
        b.gain.gain.cancelScheduledValues(now);
        b.gain.gain.setTargetAtTime(0, now, 0.6);
        for (const s of b.srcs) s.stop(now + 4);
      }
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }
  }

  private build(g: Graph, now: number): Bed {
    const ctx = g.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.connect(g.sfx);
    const loop = (from: number, filters: Array<[BiquadFilterType, number, number]>, level: number) => {
      const src = ctx.createBufferSource();
      src.buffer = g.noise;
      src.loop = true;
      // Played a touch slower and faster than the noise, so the two layers never line up.
      src.playbackRate.value = from;
      let tail: AudioNode = src;
      for (const [type, freq, q] of filters) {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        tail.connect(f);
        tail = f;
      }
      const lv = ctx.createGain();
      lv.gain.value = level;
      tail.connect(lv);
      lv.connect(gain);
      src.start(now, Math.random() * 1.5);
      return src;
    };
    const hiss = loop(0.93, [['highpass', 1100, 0.5], ['lowpass', 7500, 0.4]], 0.55);
    const wash = loop(0.61, [['lowpass', 520, 0.6]], 0.9);
    return { graph: g, gain, srcs: [hiss, wash] };
  }

  /** Single drops: a few short, bright ticks scattered over each moment. */
  private patter(): void {
    const g = engine.live;
    if (!g || !this.bed || engine.sfxVolume <= 0) return;
    const now = g.ctx.currentTime;
    const n = Math.random() < 0.6 * this.level ? (Math.random() < 0.3 ? 2 : 1) : 0;
    for (let i = 0; i < n; i++) {
      const at = now + 0.02 + Math.random() * 0.06;
      engine.noise(g.sfx, at, 0.02 + Math.random() * 0.03, { type: 'bandpass', freq: 2200 + Math.random() * 4200, q: 3, gain: (0.006 + Math.random() * 0.014) * this.level }, false);
    }
  }
}

export const rainSound = guarded(new RainSound());
