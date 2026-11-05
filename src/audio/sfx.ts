/**
 * Sound, synthesized with Web Audio (no files): hits, rolls, coins, the reels' ticks and landings
 * (brighter the rarer), luck token chimes, the reveal's heartbeat and fanfares. Silent until the
 * first tap or key (browsers' rule), and throttled so a big fight doesn't turn to mush.
 */
import type { CoreEvent } from '../core/events';
import { rarityIndex } from '../core/rarity';

type Name = 'hit' | 'crit' | 'death' | 'coin' | 'dodge' | 'special' | 'land' | 'token' | 'heartbeat' | 'fanfare' | 'portal' | 'boss' | 'hurt' | 'tick' | 'new';

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.7;
  private last = new Map<string, number>();

  unlock(volume: number): void {
    this.volume = volume;
    if (this.ctx) return;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v * 0.5;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, at = 0, slide = 0): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, at = 0, hp = 800): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + at;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = c.createGain();
    g.gain.value = gain;
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t);
  }

  play(name: Name, level = 0): void {
    if (!this.ctx || this.volume <= 0) return;
    const now = performance.now();
    const gap = name === 'hit' ? 45 : name === 'coin' ? 40 : name === 'tick' ? 30 : 0;
    if (gap && now - (this.last.get(name) ?? 0) < gap) return;
    this.last.set(name, now);
    switch (name) {
      case 'hit':
        this.noise(0.06, 0.25, 0, 1500);
        this.tone(180 + Math.random() * 60, 0.06, 'square', 0.06, 0, 0.5);
        break;
      case 'crit':
        this.noise(0.1, 0.35, 0, 900);
        this.tone(520, 0.12, 'square', 0.08, 0, 0.6);
        break;
      case 'hurt':
        this.tone(140, 0.14, 'sawtooth', 0.1, 0, 0.5);
        break;
      case 'death':
        this.noise(0.18, 0.25, 0, 400);
        this.tone(220, 0.2, 'triangle', 0.08, 0, 0.4);
        break;
      case 'coin':
        this.tone(1320, 0.05, 'square', 0.05);
        this.tone(1760, 0.08, 'square', 0.05, 0.04);
        break;
      case 'dodge':
        this.noise(0.12, 0.18, 0, 2500);
        break;
      case 'special':
        this.tone(330, 0.18, 'sawtooth', 0.08, 0, 2);
        this.tone(660, 0.2, 'triangle', 0.06, 0.05);
        break;
      case 'tick':
        this.tone(900, 0.02, 'square', 0.03);
        break;
      case 'land': {
        const f = 220 * Math.pow(2, level / 5);
        this.tone(f, 0.12, 'triangle', 0.12);
        if (level >= 3) this.tone(f * 1.5, 0.2, 'triangle', 0.08, 0.06);
        if (level >= 4) this.tone(f * 2, 0.35, 'sine', 0.08, 0.12);
        break;
      }
      case 'token':
        this.tone(1046, 0.1, 'sine', 0.12);
        this.tone(1568, 0.18, 'sine', 0.1, 0.07);
        break;
      case 'new':
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.14, 'square', 0.06, i * 0.07));
        break;
      case 'heartbeat':
        for (let i = 0; i < 3; i++) {
          this.tone(60, 0.12, 'sine', 0.35, i * 0.55);
          this.tone(52, 0.1, 'sine', 0.25, i * 0.55 + 0.16);
        }
        break;
      case 'fanfare': {
        const notes = [523, 659, 784, 1046, 1318, 1568].slice(0, 3 + level);
        notes.forEach((f, i) => {
          this.tone(f, 0.3, 'square', 0.07, i * 0.09);
          this.tone(f / 2, 0.3, 'triangle', 0.08, i * 0.09);
        });
        this.noise(0.6, 0.12, notes.length * 0.09, 3000);
        break;
      }
      case 'portal':
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.08, i * 0.08));
        break;
      case 'boss':
        this.tone(70, 0.9, 'sawtooth', 0.18, 0, 0.5);
        this.noise(0.8, 0.2, 0, 200);
        break;
    }
  }

  event(e: CoreEvent): void {
    switch (e.type) {
      case 'land':
        this.play('land', rarityIndex(e.rarity));
        if (e.result.kind === 'new') this.play('new');
        break;
      case 'spinStart':
        if (e.spin.reels.some((r) => r.tokens.length)) setTimeout(() => this.play('token'), e.spin.baseSpinSeconds * 1000);
        break;
      case 'floorClear':
        this.play('portal');
        break;
      case 'floorStart':
        if (e.boss) this.play('boss');
        break;
      case 'bossDown':
        this.play('fanfare', 1);
        break;
      case 'gold':
        this.play('coin');
        break;
      default:
        break;
    }
  }
}

export const sfx = new Sfx();
