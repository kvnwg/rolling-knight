/**
 * The fight's mix. Every fight sound (catalog.ts) goes through `fire`, which decides whether it plays
 * and how loud, so a big fight stays readable instead of turning to mush:
 *
 * - Limits: each sound has a most-at-once and a least gap between starts (twenty foes falling
 *   together are three deaths, not twenty), and the whole fight a most-at-once by priority, checked
 *   against the engine's voices too: background sounds go first, then the fight's, and the key
 *   moments only when the audio is nearly full.
 * - Priority: key moments (a crit, your knight hurt, a skill landing, a big blast) play on their own
 *   bus and duck the fight's bus under them for a moment, so they cut through; the biggest dip the
 *   music too.
 * - Place: a sound's spot in the world against the knight you control: farther is quieter (a fight
 *   off screen is a murmur), to one side pans a little that way.
 * - Every play a little different: its level and pitch vary.
 *
 * It plays through the sound effects' volume (engine.ts), so the Sound slider and 0 for silence work
 * as for everything else. A recording named like the sound (src/assets/sounds/<name>.mp3) plays in
 * place of its synthesized placeholder. Nothing here touches the browser at import.
 */
import { SOUNDS, type FightCue, type Prio } from './catalog';
import { engine, guarded, type Graph } from './engine';
import { music } from './music';
import { RECIPES, TRIM } from './recipes';
import { voiceAt } from './synth';

export interface CueOpts {
  /** Where it happens in the world (art pixels): quieter farther from your knight, panned to its side. */
  x?: number;
  y?: number;
  /** Times its level (a squadmate's sounds are quieter than yours). */
  gain?: number;
  /** 0 to 1: a heavier hit, a bigger blast (the recipes read it). */
  level?: number;
  /** Pitch multiplier (bigger foes lower). */
  pitch?: number;
  /** A count the sound climbs with (a kill streak). */
  step?: number;
  /** In place of its usual priority. */
  prio?: Prio;
  /** Seconds from now. */
  delay?: number;
}

/** Most fight sounds playing at once for a new one of each priority to start (0 background to 3 never dropped). */
const SOUNDS_FOR: readonly number[] = [8, 16, 24, Infinity];
/** Most engine voices in use for a new sound of each priority to start (the engine holds 48). */
const VOICES_FOR: readonly number[] = [22, 32, 42, Infinity];
/**
 * The buses' levels: the everyday fight (hits, attacks, deaths, foes' attacks) sits under the music
 * at the default volumes, a busy fight about level with it; the key moments over both.
 */
const FIGHT_LEVEL = 0.55;
const KEY_LEVEL = 0.9;
/** Within this (art pixels) of your knight a sound is at full level; it halves NEAR + FALL away. */
const NEAR = 120;
const FALL = 150;
/** Quieter than this and it isn't worth playing. */
const CULL = 0.06;

/** Why a sound didn't play (the dev stats count them). */
export type Drop = 'far' | 'gap' | 'max' | 'busy' | 'off';

interface Buses {
  g: Graph;
  fight: GainNode;
  key: GainNode;
}

class Mixer {
  private buses: Buses | null = null;
  /** When each sound's plays end (audio clock), by name. */
  private playing = new Map<FightCue, number[]>();
  private lastStart = new Map<FightCue, number>();
  private duckUntil = 0;
  private duckDepth = 1;
  private ear: { x: number; y: number } | null = null;
  /** Plays and drops by name since the start, and the most engine voices seen at once (the dev hook reads them). */
  readonly played = new Map<string, number>();
  readonly dropped = new Map<string, number>();
  private peakVoices = 0;

  /** Where you're listening from (your knight), or null for nowhere (every sound centered and at full level). */
  listen(at: { x: number; y: number } | null): void {
    this.ear = at ? { x: at.x, y: at.y } : null;
  }

  /** Plays a fight sound, unless the mix has no room for it. True if it played. */
  fire(cue: FightCue, o: CueOpts = {}): boolean {
    const g = engine.live;
    if (!g || engine.sfxVolume <= 0) return this.drop(cue, 'off');
    // (First: a new graph starts its clock, and so its limits, again.)
    const b = this.bus(g);
    const def = SOUNDS[cue];
    const prio = o.prio ?? def.prio;
    const ctx = g.ctx;
    const now = ctx.currentTime;
    const at = now + Math.max(0, o.delay ?? 0);
    let gain = o.gain ?? 1;
    let pan = 0;
    if (this.ear && o.x !== undefined && o.y !== undefined) {
      const dx = o.x - this.ear.x;
      const d = Math.hypot(dx, (o.y - this.ear.y) * 1.3);
      gain *= d <= NEAR ? 1 : 1 / (1 + ((d - NEAR) / FALL) ** 2);
      pan = Math.max(-1, Math.min(1, dx / 200)) * 0.6;
      if (gain < CULL) return this.drop(cue, 'far');
    }
    const list = this.live(cue, now);
    if (def.gap > 0 && at - (this.lastStart.get(cue) ?? -1e9) < def.gap / 1000) return this.drop(cue, 'gap');
    if (list.length >= def.max) return this.drop(cue, 'max');
    if (this.busy(now) >= SOUNDS_FOR[prio] || engine.voices >= VOICES_FOR[prio]) return this.drop(cue, 'busy');
    const rec = engine.hasRec(cue);
    // Its own level (a little different every time; a placeholder at its measured trim) and place, into its bus.
    const out = ctx.createGain();
    out.gain.value = gain * (0.88 + 0.24 * engine.rnd()) * (rec ? 1 : (TRIM[cue] ?? 1));
    const chain: AudioNode[] = [out];
    let head: AudioNode = out;
    if (pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      chain.push(p);
      head = p;
    }
    head.connect(def.bus === 'fight' ? b.fight : b.key);
    const pitch = (o.pitch ?? 1) * (1 + (engine.rnd() * 2 - 1) * 0.035);
    let end: number;
    if (rec) {
      const semis = 12 * Math.log2(pitch);
      engine.rec(cue, at, { semis, bus: out });
      end = at + (engine.recLength(cue, semis) ?? 0.5);
    } else {
      const v = voiceAt(ctx, out, at, g.noise, engine.rnd, { level: o.level, pitch, step: o.step });
      RECIPES[cue](v);
      end = Math.max(at + 0.05, v.end);
      chain.push(...v.own);
    }
    list.push(end);
    this.lastStart.set(cue, at);
    setTimeout(() => {
      for (const n of chain) n.disconnect();
    }, (end - now) * 1000 + 400);
    // A key moment: the rest of the fight dips under it; the biggest dip the music too.
    if (prio >= 2 && def.duck) this.duckFight(def.duck[0], def.duck[1], at);
    if (prio >= 2 && def.music) music.duck(def.music[1], def.music[0]);
    this.played.set(cue, (this.played.get(cue) ?? 0) + 1);
    this.peakVoices = Math.max(this.peakVoices, engine.voices);
    return true;
  }

  /** Counts a play of a sound that doesn't go through the fight's mix (the altar's, the menus'). */
  count(name: string): void {
    this.played.set(name, (this.played.get(name) ?? 0) + 1);
  }

  /** What's played and been dropped (and why) since the start, by name, and the most voices at once. */
  stats(): { played: Record<string, number>; dropped: Record<string, number>; peakVoices: number } {
    return { played: Object.fromEntries(this.played), dropped: Object.fromEntries(this.dropped), peakVoices: this.peakVoices };
  }

  // ------------------------------------------------------------------ inside
  private drop(cue: FightCue, why: Drop): false {
    const k = `${cue}:${why}`;
    this.dropped.set(k, (this.dropped.get(k) ?? 0) + 1);
    return false;
  }

  /** The plays of `cue` still sounding. */
  private live(cue: FightCue, now: number): number[] {
    const list = (this.playing.get(cue) ?? []).filter((e) => e > now);
    this.playing.set(cue, list);
    return list;
  }

  /** Fight sounds sounding right now. */
  private busy(now: number): number {
    let n = 0;
    for (const list of this.playing.values()) for (const e of list) if (e > now) n++;
    return n;
  }

  /** The fight's two buses on this graph (made again for a rebuilt one). */
  private bus(g: Graph): Buses {
    if (this.buses?.g === g) return this.buses;
    const fight = g.ctx.createGain();
    fight.gain.value = FIGHT_LEVEL;
    fight.connect(g.sfx);
    const key = g.ctx.createGain();
    key.gain.value = KEY_LEVEL;
    key.connect(g.sfx);
    this.buses = { g, fight, key };
    // (A new graph's clock starts again from 0.)
    this.playing.clear();
    this.lastStart.clear();
    this.duckUntil = 0;
    return this.buses;
  }

  /** The fight's bus dips to `depth` from `at` until `hold` s after it (a deeper or later dip already on wins). */
  private duckFight(depth: number, hold: number, at: number): void {
    const b = this.buses;
    if (!b) return;
    const p = b.fight.gain;
    const now = b.g.ctx.currentTime;
    const on = this.duckUntil > now;
    const d = on ? Math.min(this.duckDepth, depth) : depth;
    const until = Math.max(on ? this.duckUntil : 0, at + hold);
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.setTargetAtTime(FIGHT_LEVEL * d, Math.max(now, at), 0.008);
    p.setTargetAtTime(FIGHT_LEVEL, until, 0.09);
    this.duckUntil = until;
    this.duckDepth = d;
  }
}

export const mixer = guarded(new Mixer());
