/**
 * Sound effects: Dumpster Legend's sounds (its src/services/audio.ts), synthesized with Web Audio
 * unless a recording of the same name plays in their place (src/assets/sounds, engine.ts), adapted
 * to Rolling Knight's events. Reward sounds sit on the C major pentatonic ladder, the key the music
 * is written around (songs.ts), so wins sound like the song resolving.
 *
 * The altar: every spin clacks off, its reels tick past the line (only while the altar is on screen:
 * `setAltarFocus`) and thud down by rarity; luck tokens chime a step higher for each in a chain; a
 * find the core judged worth a reveal builds up (rattle, riser, a silence drop) as its reel nears
 * the line, a teased one a little (rattle, glow climbing, short riser). The fight: hits climb in
 * pitch through a flurry, kills climb the scale through a wave, coins stack.
 *
 * Silent until `unlock` (the first tap), and throttled so a big fight doesn't turn to mush. Nothing
 * here touches the browser at import (Node tests import it).
 */
import type { CoreEvent } from '../core/events';
import { rarityIndex, tierOrBetterOneIn } from '../core/rarity';
import type { RollDrama, Spin } from '../core/state';
import { engine, guarded, midi, type NoiseOpts, type ToneOpts } from './engine';
import { music } from './music';

export type SoundName =
  // the fight
  | 'hit' | 'crit' | 'hurt' | 'block' | 'mobDeath' | 'heroDown' | 'dodge' | 'special' | 'arrow' | 'bolt' | 'fireball' | 'blast' | 'zap'
  | 'heal' | 'coin' | 'pickup' | 'potion' | 'xp' | 'levelUp' | 'rewind'
  // the dungeon
  | 'portal' | 'floorStart' | 'bossWarn' | 'bossRoar' | 'bossDown' | 'wipe' | 'treasure' | 'lockTap' | 'lockBreak' | 'embark' | 'rebirth'
  // the altar
  | 'reelStart' | 'reelTick' | 'creep' | 'reelLand' | 'glowUp' | 'rattle' | 'riser' | 'token' | 'respin' | 'combo'
  // the reveal
  | 'blackout' | 'heartbeat' | 'emerge' | 'countTick' | 'tierPass' | 'revealBig' | 'revealHuge' | 'revealInsane' | 'revealHyper' | 'firework'
  | 'fanfare'
  // knights and menus
  | 'stamp' | 'newHero' | 'dupe' | 'mutation' | 'breakDown' | 'sell' | 'haul' | 'buy' | 'equip' | 'perk' | 'unlock' | 'collect'
  | 'jingle' | 'jingleLong' | 'ding' | 'tap' | 'open' | 'close';

type LandEvent = Extract<CoreEvent, { type: 'land' }>;
type TokenEvent = Extract<CoreEvent, { type: 'token' }>;

/** C major pentatonic ladder for pitch stacking and reward notes. */
const LADDER = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
/** Index of the tier from which a reveal sting adds its fanfare in rhythm (Dumpster Legend's Mint in Box). */
const FANFARE_TIER = 9;
/** Semitones a recording climbs by, step by step: up the major scale (do, re, mi...) to an octave, in key. */
const CLIMB = [0, 2, 4, 5, 7, 9, 11, 12];
const climb = (step: number) => CLIMB[Math.max(0, Math.min(CLIMB.length - 1, step))];
/** Rattle beats before a reveal, by rarity index (Dumpster Legend's rattleBeatsByRarity). */
const RATTLE_BEATS = [3, 3, 3, 4, 5, 6, 6, 6, 6, 6, 7, 7, 8];
const DRAMA_LEVEL: Record<RollDrama, number> = { big: 0, huge: 1, insane: 2, hyper: 3 };
/** Heartbeats in a reveal's dark, by drama. */
const DRAMA_BEATS = [2, 3, 5, 7];
/** Seconds a combo's numbers take to fly together. */
const COMBO_FLY = 0.42;
/** Sounds that may wait for the context the same tap is starting (the rest are dropped while asleep). */
const WAKE_FOR = new Set<SoundName>(['tap', 'open', 'close', 'embark', 'buy', 'unlock']);
/** Cells a reel's strip moves per segment (as the altar's reels draw them: Reels.tsx). */
const CELLS_FIRST = 40;
const CELLS_NEXT = 44;

const clampTier = (t: number) => Math.max(0, Math.min(12, Math.round(t)));

interface SpinPlan {
  id: number;
  /** Audio time the spin started. */
  t0: number;
  /** Wall time it started (performance.now). */
  w0: number;
  base: number;
  step: number;
  hold: number;
  reels: Array<{ landAt: number; tokens: number[]; rarity: number; drama: RollDrama | null; oneIn: number }>;
  lastReel: number;
  /** The reel a build-up is for (its sounds all stop as it lands). */
  rampReel: number | null;
  lucky: boolean;
  luck: number;
  combos: number[];
  /** Tokens already chimed (`reel:step`), whether timed from the start or sent by the core. */
  fired: Set<string>;
}

interface TickEv {
  t: number;
  kind: 'tick' | 'creep' | 'creepRec';
  rise: number;
  loud: number;
  step: number;
}

class Sfx {
  private lastPlayed = new Map<string, number>();
  private coinStack = 0;
  private lastCoinAt = 0;
  private hitStreak = 0;
  private lastHitAt = 0;
  private killStreak = 0;
  private lastKillAt = 0;
  private tapStreak = 0;
  private lastTapAt = 0;
  /** What a build-up's sounds play through, so they all stop as its find lands (endRamp). */
  private rampBus: GainNode | null = null;
  private focus = false;
  private spin: SpinPlan | null = null;
  private lastSpinAt = -1e9;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private ticks: TickEv[] = [];
  private tickIdx = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lands: LandEvent[] = [];
  private hooked = false;

  // ------------------------------------------------------------------ the API
  /** Call on the first user gesture (safe to call on every one): starts the audio at this volume. */
  unlock(sfxVolume: number): void {
    if (!this.hooked) {
      this.hooked = true;
      // A rebuilt audio graph: any build-up bus belonged to the old one.
      engine.onBuild(() => {
        this.rampBus = null;
      });
    }
    engine.setSfxVolume(sfxVolume);
    engine.unlock();
  }

  /** Volume, 0 to 1. */
  setVolume(v: number): void {
    engine.setSfxVolume(v);
  }

  /** Decodes the recordings ahead of the first tap (optional: unlock starts it too). */
  preload(): void {
    void engine.preload();
  }

  /**
   * Whether the altar's reels are on screen (its tab open): they tick past the line and land at full
   * weight. Off (the default), a spin is a quiet clack and soft thuds under the fight; its tokens,
   * build-ups and rare finds sound either way.
   */
  setAltarFocus(on: boolean): void {
    this.focus = on;
  }

  /** Plays one sound. `level` is a rarity index (0 Common to 12 Primordial) where a sound has a rarity; see each. */
  play(name: SoundName, level = 0): void {
    if (engine.sfxVolume <= 0) return;
    if (!engine.live) {
      if (engine.graph && WAKE_FOR.has(name)) engine.whenRunning(() => this.sound(name, level));
      return;
    }
    this.sound(name, level);
  }

  /** The sounds for a core event. */
  event(e: CoreEvent): void {
    // (Music first: it has its own volume. Its victory sting carries the fanfare; without it, the jingle does.)
    const sting = e.type === 'bossDown' && music.victory();
    if (engine.sfxVolume <= 0 || !engine.live) return;
    switch (e.type) {
      case 'spinStart':
        this.spinStart(e.spin);
        break;
      case 'land':
        this.landed(e);
        break;
      case 'token':
        this.tokenEvent(e);
        break;
      case 'potion':
        this.sound('potion', 0);
        break;
      case 'gold':
        this.coin();
        break;
      case 'floorStart':
        this.sound(e.boss ? 'bossRoar' : 'floorStart', 0);
        break;
      case 'floorClear':
        this.portal();
        break;
      case 'bossDown':
        this.bossDown(!sting);
        break;
      case 'wipe':
        this.heistLose();
        break;
      case 'rebirth':
        this.rebirth();
        break;
      default:
        break;
    }
  }

  /**
   * A full-screen reveal opens (call as it goes dark): the music drops out under a boom (HYPER RARE:
   * its summoning, with the burst `darkSeconds` later), heartbeats in the dark, and the knight's
   * shimmer as it emerges. Then, while its "1 in X" counts: `play('countTick', 12 * progress)` and
   * `play('tierPass', tier)` as it passes each tier; on landing `play('revealBig' | ..., rarityIndex)`.
   */
  revealStart(drama: RollDrama, darkSeconds: number): void {
    if (engine.sfxVolume <= 0 || !engine.live) return;
    const lvl = DRAMA_LEVEL[drama] ?? 0;
    const dark = Math.max(0.2, darkSeconds);
    if (drama === 'hyper') this.hyperIntro(dark);
    else this.blackout();
    const beats = DRAMA_BEATS[lvl];
    for (let b = 0; b < beats; b++) this.later((b * dark * 1000) / beats + 120, () => this.heartbeat(b));
    if (drama === 'hyper') {
      this.later(dark * 1000 - 130, () => engine.silenceDrop(0.12));
      this.later(dark * 1000, () => this.hyperBoom());
    }
    this.later(dark * 1000, () => this.emerge(0.65));
  }

  // ------------------------------------------------------------------ names to sounds
  private sound(name: SoundName, level: number): void {
    const tier = clampTier(level);
    switch (name) {
      case 'hit':
      case 'crit': {
        const now = performance.now();
        this.hitStreak = now - this.lastHitAt < 450 ? Math.min(12, this.hitStreak + 1) : 0;
        this.lastHitAt = now;
        return this.hit(name === 'crit', this.hitStreak);
      }
      case 'hurt':
        return this.hurt(level > 0);
      case 'block':
        return this.heistBlock();
      case 'mobDeath': {
        const now = performance.now();
        this.killStreak = now - this.lastKillAt < 2500 ? Math.min(7, this.killStreak + 1) : 0;
        this.lastKillAt = now;
        return this.kill(level > 0, this.killStreak);
      }
      case 'heroDown':
        return this.heroDown();
      case 'dodge':
        return this.dodge();
      case 'special':
        return this.special();
      case 'arrow':
        return this.arrow();
      case 'bolt':
        return this.bolt();
      case 'fireball':
        return this.fireball();
      case 'blast':
        return this.blast();
      case 'zap':
        return this.zap();
      case 'heal':
        return this.heal();
      case 'coin':
        return this.coin();
      case 'pickup':
        return this.pickup();
      case 'potion':
        return this.potion();
      case 'xp':
        return this.xpTick();
      case 'levelUp':
        return this.levelUp(level);
      case 'rewind':
        return this.rewind();
      case 'portal':
        return this.portal();
      case 'floorStart':
        return this.floorStart();
      case 'bossWarn':
        return this.bossWarn();
      case 'bossRoar':
        return this.bossRoar();
      case 'bossDown':
        return this.bossDown(true);
      case 'wipe':
        return this.heistLose();
      case 'treasure':
        return this.treasure(level > 0);
      case 'lockTap':
        return this.lockHit();
      case 'lockBreak':
        return this.lockBreak();
      case 'embark':
        return this.titleStart();
      case 'rebirth':
        return this.rebirth();
      case 'reelStart':
        return this.reelStart();
      case 'reelTick':
        return this.reelTick(engine.live!.ctx.currentTime, tier / 12, 0);
      case 'creep':
        return this.reelCreep(engine.live!.ctx.currentTime, level, false);
      case 'reelLand':
        return this.reelLand(tier, false, 1);
      case 'glowUp':
        return this.glowUp(Math.max(1, tier), 0);
      case 'rattle':
        return this.rattle(level, 5, true, 1.2, false);
      case 'riser':
        return this.riser(tier >= 5 ? 2 : 1.2, tier, tier >= 5);
      case 'token':
        return this.token(level, 2);
      case 'respin':
        return this.respin();
      case 'combo':
        this.combo(Math.max(2, level), COMBO_FLY);
        this.later(COMBO_FLY * 1000, () => this.jingle(5));
        return;
      case 'blackout':
        return level >= 3 ? this.hyperIntro(2.4) : this.blackout();
      case 'heartbeat':
        return this.heartbeat(level);
      case 'emerge':
        return this.emerge(0.65);
      case 'countTick':
        return this.countTick(level / 12);
      case 'tierPass':
        return this.tierPass(tier);
      case 'revealBig':
      case 'revealHuge':
      case 'revealInsane':
      case 'revealHyper':
        return this.revealLand(['revealBig', 'revealHuge', 'revealInsane', 'revealHyper'].indexOf(name), level > 0 ? tier : 4);
      case 'fanfare':
        // (The old placeholder's name: 1 big or huge, 2 insane, 3 hyper.)
        return this.revealLand([0, 0, 2, 3][Math.max(0, Math.min(3, level))], 4);
      case 'firework':
        return this.firework();
      case 'stamp':
        return this.stamp();
      case 'newHero':
        return this.newHero();
      case 'dupe':
        return this.dupe();
      case 'mutation':
        return this.mutation();
      case 'breakDown':
        return this.breakDown();
      case 'sell':
        return this.sell(level);
      case 'haul':
        return this.haul(Math.max(0, Math.min(2, level)));
      case 'buy':
        return this.buy();
      case 'equip':
        return this.equipImpact(tier);
      case 'perk':
        return this.heistPerk(level > 0);
      case 'unlock':
        return this.featureOpen();
      case 'collect':
        return this.collect();
      case 'jingle':
        return this.jingle(3);
      case 'jingleLong':
        return this.jingle(5);
      case 'ding':
        return this.ding();
      case 'tap': {
        const now = performance.now();
        this.tapStreak = now - this.lastTapAt < 650 ? Math.min(12, this.tapStreak + 1) : 0;
        this.lastTapAt = now;
        return this.tap(this.tapStreak);
      }
      case 'open':
        return this.panel(true);
      case 'close':
        return this.panel(false);
    }
  }

  // ------------------------------------------------------------------ primitives
  private get ctx(): AudioContext {
    return engine.graph!.ctx;
  }

  private get bus(): GainNode {
    return engine.graph!.sfx;
  }

  /** Simple per-key rate limit so rapid events never turn into noise. */
  private gate(key: string, gapMs: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? -1e9) < gapMs) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private tone(freq: number, at: number, dur: number, o: ToneOpts & { bus?: AudioNode } = {}): void {
    engine.tone(o.bus ?? this.bus, freq, at, dur, o);
  }

  private noise(at: number, dur: number, o: NoiseOpts & { bus?: AudioNode } = {}): void {
    engine.noise(o.bus ?? this.bus, at, dur, o);
  }

  private bell(freq: number, at: number, dur: number, gain = 0.1, bus?: AudioNode): void {
    engine.bell(bus ?? this.bus, freq, at, dur, gain);
  }

  private rec(name: string, at: number, o: { semis?: number; gain?: number; fit?: number; bus?: AudioNode } = {}): boolean {
    return engine.rec(name, at, o);
  }

  private vary(f: number, pct = 0.05): number {
    return f * (1 + (engine.rnd() * 2 - 1) * pct);
  }

  private rnd(): number {
    return engine.rnd();
  }

  private duck(depth: number, holdSec: number): void {
    music.duck(holdSec, depth);
  }

  /**
   * Runs `fn` in `ms`. A spin's timers (`spin`) are cleared as the next spin starts; the rest (a
   * reveal's, which the altar keeps spinning under) run regardless.
   */
  private later(ms: number, fn: () => void, spin = false): void {
    const t = setTimeout(() => {
      if (spin) this.timers = this.timers.filter((x) => x !== t);
      try {
        if (engine.live) fn();
      } catch {
        /* audio never breaks the game */
      }
    }, Math.max(0, ms));
    if (spin) this.timers.push(t);
  }

  /** The bus for the build-up under way (risers, shake, crawl, glow): a fresh one after each landing. */
  private ramp(): AudioNode {
    if (!this.rampBus || this.rampBus.context !== this.ctx) {
      this.rampBus = this.ctx.createGain();
      this.rampBus.connect(this.bus);
    }
    return this.rampBus;
  }

  /** The find lands: everything its build-up was playing stops with it, faded over 80 ms so nothing clicks. */
  private endRamp(): void {
    const g = this.rampBus;
    const live = engine.live;
    if (!live || !g) return;
    this.rampBus = null;
    const now = live.ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0, now + 0.08);
    setTimeout(() => g.disconnect(), 400);
  }

  // ------------------------------------------------------------------ the altar
  private spinStart(spin: Spin): void {
    const g = engine.live!;
    const now = performance.now();
    // Spins arriving together (catching up after a stall): no choreography, only their results.
    const batch = now - this.lastSpinAt < 150;
    this.lastSpinAt = now;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.endRamp();
    const reels = spin.reels.map((r) => ({ landAt: r.landAt, tokens: r.tokens, rarity: rarityIndex(r.rarity), drama: r.drama, oneIn: r.oneIn }));
    let lastReel = 0;
    reels.forEach((r, i) => {
      if (r.landAt >= reels[lastReel].landAt) lastReel = i;
    });
    // The build-up's reel: the biggest reveal (the rarest among equals), else (a tease) the rarest find.
    const rank = (d: RollDrama | null) => (d ? DRAMA_LEVEL[d] + 1 : 0);
    let best = 0;
    reels.forEach((r, i) => {
      const b = reels[best];
      if (rank(r.drama) > rank(b.drama) || (rank(r.drama) === rank(b.drama) && r.oneIn > b.oneIn)) best = i;
    });
    const drama = reels[best].drama !== null;
    const sp: SpinPlan = {
      id: spin.id,
      t0: g.ctx.currentTime,
      w0: now,
      base: spin.baseSpinSeconds,
      step: spin.stepSeconds,
      hold: Math.max(0, spin.stepSeconds - spin.baseSpinSeconds),
      reels,
      lastReel,
      rampReel: drama || spin.tease > 0 ? best : null,
      lucky: spin.lucky,
      luck: spin.luck,
      combos: spin.combos,
      fired: new Set(),
    };
    this.spin = sp;
    this.ticks = [];
    this.tickIdx = 0;
    if (batch) return;
    this.reelStart();
    if (spin.golden || spin.rigged) this.jingle(5);
    // Tokens on any tab, timed from the start (the core may also send them: each chimes once).
    reels.forEach((r, i) => {
      const firstEnd = r.landAt - r.tokens.length * sp.step;
      r.tokens.forEach((x, k) => {
        const at = firstEnd + k * sp.step;
        this.later(at * 1000, () => this.tokenLanded(sp, i, k, x), true);
      });
    });
    for (const k of sp.combos) {
      const inIt = reels.map((r, i) => ({ r, i })).filter(({ r }) => r.tokens.length > k);
      if (inIt.length < 2) continue;
      const at = Math.max(...inIt.map(({ r }) => r.landAt - (r.tokens.length - k) * sp.step));
      this.later(
        at * 1000 + 30,
        () => {
          this.combo(inIt.length, COMBO_FLY);
          this.later(COMBO_FLY * 1000, () => this.jingle(5));
        },
        true,
      );
    }
    if (drama) this.buildUp(sp, best);
    else if (spin.tease > 0) this.buildUpSmall(sp, best, spin.tease);
    this.ticks = this.planTicks(sp);
    if (this.ticks.length) this.tickTimer ??= setInterval(() => this.pumpTicks(), 40);
  }

  /** A luck token lands on reel `reel` (the `k`-th in its chain): its chime, then the reel spins on. */
  private tokenLanded(sp: SpinPlan, reel: number, k: number, x: number): void {
    const key = `${reel}:${k}`;
    if (sp.fired.has(key)) return;
    sp.fired.add(key);
    this.token(k, x);
    this.later(sp.hold * 1000, () => this.respin(), true);
  }

  private tokenEvent(e: TokenEvent): void {
    const sp = this.spin && this.spin.id === e.spinId ? this.spin : null;
    if (!sp) {
      this.token(0, e.value);
      return;
    }
    // Which of its reel's tokens this is: the one whose chain multiplies to the total so far.
    const tokens = sp.reels[e.reel]?.tokens ?? [];
    let k = -1;
    let prod = 1;
    for (let i = 0; i < tokens.length; i++) {
      prod *= tokens[i];
      if (prod === e.total) {
        k = i;
        break;
      }
    }
    if (k < 0) k = [...sp.fired].filter((f) => f.startsWith(`${e.reel}:`)).length;
    this.tokenLanded(sp, e.reel, k, e.value);
  }

  /** The reveal-worthy find's build-up: rattle with a heartbeat, the long riser, a silence drop as it lands. */
  private buildUp(sp: SpinPlan, i: number): void {
    const r = sp.reels[i];
    const ms = r.landAt * 1000;
    const beats = RATTLE_BEATS[clampTier(r.rarity)];
    for (let b = 0; b < beats; b++) {
      const t = ms * 0.35 + (b * ms * 0.45) / beats;
      this.later(t, () => this.rattle(b, beats, true, (ms - 160 - t) / 1000), true);
    }
    this.later(ms * 0.4, () => this.riser(Math.max(0.3, (ms * 0.5) / 1000), r.rarity, true), true);
    this.later(Math.max(0, ms - 160), () => engine.silenceDrop(0.15), true);
    // Nothing of the build-up rings on past the find landing.
    this.later(ms, () => this.endRamp(), true);
  }

  /** A teased find's smaller build-up: rattles and a short riser while its glow climbs; a very rare one drops the sound out for a beat. */
  private buildUpSmall(sp: SpinPlan, i: number, level: number): void {
    const r = sp.reels[i];
    const land = r.landAt * 1000;
    const from = Math.max(0, land - Math.min(1800, land * 0.6));
    const dur = land - from;
    const beats = level >= 2 ? 3 : 2;
    for (let b = 0; b < beats; b++) {
      const t = from + dur * (0.2 + (0.6 * b) / beats);
      this.later(t, () => this.rattle(b, beats + 2, false, (land - t) / 1000), true);
    }
    this.later(from + dur * 0.1, () => this.riser(Math.max(0.3, (dur * 0.85) / 1000), Math.max(0, r.rarity - 3), false), true);
    const steps = level + 1;
    for (let s = 0; s < steps; s++) {
      const tier = Math.max(1, r.rarity - (steps - 1 - s));
      this.later(from + dur * (0.12 + (0.7 * s) / steps), () => this.glowUp(tier, s), true);
    }
    if (level >= 2) this.later(Math.max(0, land - 100), () => engine.silenceDrop(0.08), true);
    this.later(land, () => this.endRamp(), true);
  }

  /**
   * When each reel's strip passes a cell over the line (as the altar draws them: a cubic ease-out per
   * stop), and how fast: ticks (if the altar is on screen) and, for the build-up's reel as it crawls
   * the last few cells, finer notches climbing a step each.
   */
  private planTicks(sp: SpinPlan): TickEv[] {
    const out: TickEv[] = [];
    sp.reels.forEach((r, i) => {
      const segs = r.tokens.length + 1;
      const firstEnd = r.landAt - r.tokens.length * sp.step;
      let start = 0;
      for (let s = 0; s < segs; s++) {
        const end = s === 0 ? firstEnd : start + sp.base;
        const dur = Math.max(0.05, end - start);
        const cells = s === 0 ? CELLS_FIRST : CELLS_NEXT;
        const crawl = s === segs - 1 && sp.rampReel === i;
        if (this.focus || crawl) {
          let creep = 0;
          for (let x3 = 1; x3 <= cells * 3; x3++) {
            const x = x3 / 3;
            const k = 1 - Math.cbrt(Math.max(0, 1 - x / cells));
            const t = start + k * dur;
            const v = (3 * cells * (1 - k) * (1 - k)) / dur;
            if (crawl && v < 6) {
              if (creep === 0) out.push({ t, kind: 'creepRec', rise: 0, loud: 0, step: 0 });
              if (this.focus) out.push({ t, kind: 'creep', rise: 0, loud: 0, step: creep });
              creep++;
            } else if (this.focus && x3 % 3 === 0) {
              out.push({ t, kind: 'tick', rise: Math.max(0, 1 - v / 16), loud: i === sp.lastReel ? 1 : 0, step: 0 });
            }
          }
        }
        start = end + sp.hold;
      }
    });
    out.sort((a, b) => a.t - b.t);
    // Ticks thinned to one per 30 ms at most (the reels' gate in Dumpster Legend).
    const kept: TickEv[] = [];
    let lastTick = -1;
    for (const e of out) {
      if (e.kind === 'tick') {
        if (e.t - lastTick < 0.03) continue;
        lastTick = e.t;
      }
      kept.push(e);
    }
    return kept;
  }

  private pumpTicks(): void {
    try {
      const g = engine.live;
      const sp = this.spin;
      if (!g || !sp || this.tickIdx >= this.ticks.length) {
        if (this.tickIdx >= this.ticks.length && this.tickTimer) {
          clearInterval(this.tickTimer);
          this.tickTimer = null;
        }
        return;
      }
      const now = g.ctx.currentTime;
      while (this.tickIdx < this.ticks.length) {
        const k = this.ticks[this.tickIdx];
        const at = sp.t0 + k.t;
        if (at > now + 0.12) break;
        this.tickIdx++;
        if (at < now - 0.03) continue;
        if (k.kind === 'tick') this.reelTick(at, k.rise, k.loud);
        else if (k.kind === 'creep') this.reelCreep(at, k.step, sp.rampReel !== null);
        else if (sp.rampReel !== null) this.rec('reel_creep', at, { bus: this.ramp() });
      }
    } catch {
      /* audio never breaks the game */
    }
  }

  private landed(e: LandEvent): void {
    const sp = this.spin && this.spin.id === e.spinId ? this.spin : null;
    const tier = rarityIndex(e.rarity);
    const last = sp ? e.reel === sp.lastReel : true;
    if (sp && sp.rampReel === e.reel) this.endRamp();
    this.reelLand(tier, last, this.focus ? 1 : 0.6);
    if (sp?.lucky && e.reel === 0) this.jingle(3);
    this.lands.push(e);
    if (this.lands.length === 1) queueMicrotask(() => this.flushLands());
  }

  /**
   * The finds landing together: reveals sound in the reveal itself; of the rest, the best one rings,
   * by how rare it is for you right now (an Epic means little at high luck). A new knight gets the
   * signature jingle, a better mutation a shimmer.
   */
  private flushLands(): void {
    const list = this.lands;
    this.lands = [];
    if (!engine.live) return;
    const rest = list.filter((e) => !(e.drama || e.scripted === 'first' || e.scripted === 'beginner'));
    if (!rest.length) return;
    const best = rest.reduce((a, b) => {
      const ta = rarityIndex(a.rarity);
      const tb = rarityIndex(b.rarity);
      return tb > ta || (tb === ta && b.oneIn > a.oneIn) ? b : a;
    });
    const tier = rarityIndex(best.rarity);
    const forYou = tierOrBetterOneIn(best.rarity, this.spin?.luck ?? 1);
    let rang = false;
    if (tier >= 3 && forYou >= 20) {
      this.material('metal', true);
      this.reveal(tier);
      rang = true;
    } else if (tier >= 1 && forYou >= 3) {
      this.autoPop(tier);
    }
    if (rest.some((e) => e.result.kind === 'new')) {
      if (!rang) this.newHero();
    } else if (rest.some((e) => e.result.kind === 'dupe' && e.result.mutationUp)) this.mutation();
    else if (this.focus && !rang) this.dupe();
  }

  /** The altar's reels launch: a lever clack and a short whirr (quiet: it plays every spin). */
  private reelStart(): void {
    if (!this.gate('reelStart', 250)) return;
    const at = this.ctx.currentTime;
    const v = this.focus ? 1 : 0.55;
    this.noise(at, 0.035, { freq: 1800, q: 3, gain: 0.04 * v });
    this.tone(150, at, 0.07, { type: 'square', gain: 0.025 * v, filter: 900, freqEnd: 95 });
    this.noise(at + 0.04, 0.22, { type: 'bandpass', freq: 500, freqEnd: 1500, q: 1.2, gain: 0.025 * v, attack: 0.05 });
  }

  /** A cell clicking past a reel's line. `rise` (0 to 1) climbs as the reel slows; `loud` (0 to 1) for the last reel's. */
  private reelTick(at: number, rise: number, loud: number): void {
    const r = Math.max(0, Math.min(1, rise));
    const v = 1.4;
    this.tone(this.vary(1000 * Math.pow(2, r * 1.25), 0.02), at, 0.03, { type: 'square', gain: (0.018 + 0.03 * r * (0.5 + loud)) * v, filter: 3800 });
    this.noise(at, 0.012, { freq: 3800, q: 4, gain: (0.015 + 0.02 * r) * v });
  }

  /** A notch of a find's crawl toward the line, each a step higher on the ladder. (With a recording, the crawl plays it once instead.) */
  private reelCreep(at: number, step: number, rare: boolean): void {
    if (rare && engine.hasRec('reel_creep')) return;
    if (!this.gate('reelCreep', 60)) return;
    const bus = this.ramp();
    const n = LADDER[Math.min(LADDER.length - 1, 3 + step)];
    this.tone(midi(n), at, 0.06, { type: 'square', gain: 0.03 + Math.min(0.03, step * 0.004), filter: 3200, bus });
    this.noise(at, 0.02, { freq: 2600, q: 5, gain: 0.04, bus });
  }

  /** A reel lands on its knight: a thud whose weight and pitch rise with the rarity; `last` for the spin's final stop. */
  private reelLand(tier: number, last: boolean, weight: number): void {
    if (!this.gate('reelLand', 50)) return;
    const at = this.ctx.currentTime;
    const k = clampTier(tier);
    const w = (last ? 1.25 : 1) * weight;
    if (this.rec('reel_land', at, { gain: w })) return;
    this.tone(150 + k * 8, at, 0.12 + k * 0.012, { gain: (0.13 + k * 0.018) * w, freqEnd: 60 + k * 3 });
    this.noise(at, 0.045, { freq: 2200 + k * 220, q: 3, gain: (0.06 + k * 0.006) * w });
    if (k >= 2) this.bell(midi(LADDER[Math.min(LADDER.length - 1, 2 + k)]), at + 0.01, 0.3 + k * 0.03, (0.03 + k * 0.004) * w);
    if (k >= 4) this.noise(at + 0.02, 0.35, { type: 'highpass', freq: 5500, gain: 0.04 * w, attack: 0.01 });
  }

  /** The build-up glow climbs a tier: an upward flick; a recording climbs a step for each of the glow's steps. */
  private glowUp(tier: number, step: number): void {
    if (!this.gate('glowUp', 60)) return;
    const at = this.ctx.currentTime;
    const bus = this.ramp();
    if (this.rec('glow_up', at, { semis: climb(step), bus })) return;
    const n = LADDER[Math.min(LADDER.length - 2, 3 + tier)];
    this.tone(midi(n - 5), at, 0.08, { type: 'triangle', gain: 0.04, freqEnd: midi(n), bus });
    this.bell(midi(n), at + 0.05, 0.35, 0.045, bus);
    this.bell(midi(LADDER[Math.min(LADDER.length - 1, 4 + tier)]), at + 0.1, 0.3, 0.03, bus);
    this.noise(at, 0.12, { type: 'highpass', freq: 6000, gain: 0.025, attack: 0.02, bus });
  }

  /** One rattle beat, louder and higher each beat; a recording plays once instead, ending as the find lands (`landIn` s). */
  private rattle(beat: number, beats: number, heartbeat: boolean, landIn: number, ramped = true): void {
    const at = this.ctx.currentTime;
    const bus = ramped ? this.ramp() : this.bus;
    if (engine.hasRec('rattle')) {
      if (beat === 0) this.rec('rattle', at, { fit: Math.max(0.3, landIn), bus });
      return;
    }
    const k = (beat + 1) / beats;
    this.noise(at, 0.07, { freq: 1900 + beat * 320, q: 6, gain: 0.05 + 0.1 * k, bus });
    this.tone(150 + beat * 28, at, 0.06, { type: 'square', gain: 0.02 + 0.03 * k, filter: 1300, bus });
    if (heartbeat) this.tone(62, at, 0.2, { gain: 0.28, freqEnd: 40, bus });
  }

  /** A rising tone under the build-up that seems to keep climbing, `seconds` long; a recording plays its last `seconds` instead. */
  private riser(seconds: number, tier: number, long: boolean): void {
    if (seconds <= 0) return;
    const ctx = this.ctx;
    const at = ctx.currentTime;
    const bus = this.ramp();
    if (this.rec(long ? 'riser_long' : 'riser_short', at, { fit: seconds, bus })) return;
    const top = 2 + tier * 0.25;
    for (const [base, g] of [[180, 0.05], [360, 0.035]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base, at);
      osc.frequency.exponentialRampToValueAtTime(base * top, at + seconds);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(600, at);
      f.frequency.exponentialRampToValueAtTime(2600, at + seconds);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(g * (0.6 + tier * 0.12), at + seconds * 0.9);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds + 0.05);
      osc.connect(f);
      f.connect(gain);
      gain.connect(bus);
      osc.start(at);
      osc.stop(at + seconds + 0.1);
      engine.voice(osc);
    }
  }

  /** A luck token: a leafy shimmer and a chime that climbs with each token in the chain (`step`), brighter for bigger multipliers. */
  private token(step: number, x: number): void {
    const at = this.ctx.currentTime;
    if (this.rec('token', at, { semis: climb(step) })) return;
    const lift = Math.min(4, step) * 2 + (x >= 10 ? 5 : x >= 5 ? 3 : x >= 3 ? 1 : 0);
    const base = [72, 76, 79, 84].map((n) => n + lift);
    base.forEach((n, k) => this.bell(midi(n), at + k * 0.045, 0.45, 0.06 + step * 0.01));
    this.tone(midi(base[0] - 12), at, 0.35, { type: 'triangle', gain: 0.05 });
    this.noise(at, 0.35, { type: 'highpass', freq: 6000, gain: 0.04, attack: 0.01 });
    if (x >= 5) this.bell(midi(base[3] + 12), at + 0.2, 0.6, 0.045);
  }

  /** The reel spins up again after a token: a quick upward whoosh. */
  private respin(): void {
    if (!this.gate('respin', 120)) return;
    const at = this.ctx.currentTime;
    this.noise(at, 0.22, { type: 'bandpass', freq: 900, q: 0.8, gain: 0.09, attack: 0.03 });
    this.tone(260, at, 0.2, { type: 'triangle', gain: 0.04, freqEnd: 720 });
  }

  /** A token combo: the reels' numbers zip together, two glides meeting `fly` seconds later in a thump; a bell higher for each reel in it. */
  private combo(reels: number, fly: number): void {
    if (!this.gate('combo', 200)) return;
    const at = this.ctx.currentTime;
    const zip = Math.max(0.08, fly - 0.09);
    this.tone(330, at + 0.09, zip, { type: 'triangle', gain: 0.05, freqEnd: 880 });
    this.tone(1760, at + 0.09, zip, { type: 'triangle', gain: 0.035, freqEnd: 880 });
    this.noise(at + 0.09, zip, { type: 'bandpass', freq: 1600, q: 1.2, gain: 0.05, attack: zip * 0.8 });
    const hit = at + fly;
    this.tone(96, hit, 0.4, { gain: 0.32, freqEnd: 44 });
    this.noise(hit, 0.12, { type: 'lowpass', freq: 2200, gain: 0.16 });
    for (let k = 0; k < Math.min(4, reels); k++) this.bell(midi(84 + [0, 4, 7, 12][k]), hit + 0.02 + k * 0.05, 0.5, 0.05);
  }

  /** Compressed reveal for an everyday find: a quick pop in its rarity. */
  private autoPop(tier: number): void {
    if (!this.gate('autopop', 120)) return;
    const at = this.ctx.currentTime;
    const i = clampTier(tier);
    this.tone(320 + i * 60, at, 0.06, { gain: 0.06, freqEnd: 520 + i * 90 });
    if (i >= 1) this.bell(midi(LADDER[Math.min(LADDER.length - 1, 3 + i)]), at + 0.03, 0.25, 0.035 + i * 0.008);
  }

  // ------------------------------------------------------------------ the reveal
  /** The screen goes black for a big find: the music drops out under a deep boom. */
  private blackout(): void {
    const at = this.ctx.currentTime;
    this.duck(0.04, 3);
    this.tone(48, at, 1.4, { gain: 0.5, freqEnd: 28 });
    this.noise(at, 0.9, { type: 'lowpass', freq: 500, freqEnd: 120, gain: 0.16, attack: 0.01 });
  }

  /** A heartbeat in the dark (lub-dub), higher and louder each beat; a recording plays a little faster each beat. */
  private heartbeat(beat: number): void {
    const at = this.ctx.currentTime;
    if (this.rec('heartbeat', at, { semis: 2 + Math.min(4, beat), gain: 1 + 0.12 * Math.min(4, beat) })) return;
    const up = 1 + beat * 0.06;
    this.tone(62 * up, at, 0.14, { gain: Math.min(0.62, 0.42 + beat * 0.04), freqEnd: 40 });
    this.tone(56 * up, at + 0.17, 0.12, { gain: 0.3, freqEnd: 38 });
  }

  /** The knight rising out of the dark: a shimmering swell. */
  private emerge(seconds: number): void {
    const at = this.ctx.currentTime;
    for (const [n, det] of [[72, -6], [76, 6], [79, 0], [84, 4]] as const) {
      this.tone(midi(n), at, seconds, { type: 'triangle', gain: 0.035, attack: seconds * 0.8, detune: det, vibrato: 4 });
    }
    this.noise(at, seconds, { type: 'highpass', freq: 5000, gain: 0.05, attack: seconds * 0.9 });
  }

  /** One tick of the "1 in X" counter; `progress` (0 to 1) raises the pitch. */
  private countTick(progress: number): void {
    if (!this.gate('count', 40)) return;
    const p = Math.max(0, Math.min(1, progress));
    this.tone(midi(64 + Math.round(p * 30)), this.ctx.currentTime, 0.05, { type: 'square', gain: 0.025, filter: 3200 });
  }

  /** The counter climbs past a rarity tier's odds: a bright chime, higher for rarer tiers. */
  private tierPass(tier: number): void {
    const at = this.ctx.currentTime;
    const n = LADDER[Math.min(LADDER.length - 1, 3 + tier)];
    this.bell(midi(n), at, 0.5, 0.065);
    this.bell(midi(n) * 2, at + 0.04, 0.3, 0.03);
  }

  /** The counter lands: a slam, a crash and a chord stab. `level` 0 to 3 = BIG, HUGE, INSANE, HYPER RARE. */
  private slam(level: number): void {
    const at = this.ctx.currentTime;
    if (this.rec('slam', at, { gain: [1, 1.19, 1.41, 1.68][Math.max(0, Math.min(3, level))] })) return;
    this.tone(52, at, 0.9, { gain: 0.55, freqEnd: 32 });
    this.noise(at, 0.12, { type: 'lowpass', freq: 2400, gain: 0.3 });
    this.noise(at + 0.01, 1.4 + level * 0.5, { type: 'highpass', freq: 4500, gain: 0.07 + level * 0.02, attack: 0.005 });
    for (const n of [60, 67, 72, 76, 79]) this.tone(midi(n), at, 0.6, { type: 'sawtooth', gain: 0.03, filter: 2800, attack: 0.005 });
  }

  /** A reveal lands (`level` 0 BIG to 3 HYPER RARE): the slam (HYPER RARE's burst already boomed), armor's clank and the tier's sting. */
  private revealLand(level: number, tier: number): void {
    if (level < 3) this.slam(level);
    this.material('metal', false);
    this.reveal(tier);
    if (level >= 2) [300, 650, 1000].forEach((ms) => this.later(ms, () => this.firework()));
  }

  /** HYPER RARE's summoning (`seconds` until the burst): the music drops out under a swelling rumble, the long riser ends on the burst, an alarm whoops faster and faster. */
  private hyperIntro(seconds: number): void {
    const at = this.ctx.currentTime;
    this.duck(0.02, seconds + 5);
    this.tone(46, at, 1.2, { gain: 0.45, freqEnd: 30 });
    this.tone(34, at, seconds + 0.15, { gain: 0.42, attack: seconds * 0.85, freqEnd: 62, vibrato: 2 });
    this.noise(at, seconds, { type: 'lowpass', freq: 160, freqEnd: 1400, gain: 0.2, attack: seconds * 0.9 });
    if (!this.rec('riser_long', at, { fit: seconds - 0.12, gain: 1.25 })) {
      for (const [base, g] of [[160, 0.05], [320, 0.035]] as const) {
        this.tone(base, at, seconds, { type: 'sawtooth', gain: g, attack: seconds * 0.9, freqEnd: base * 4, filter: 2400 });
      }
    }
    for (const t of [0.12, 0.62, 1.04, 1.38, 1.64, 1.84, 1.98]) {
      if (t > seconds - 0.25) break;
      this.tone(988, at + t, 0.11, { type: 'square', gain: 0.03, filter: 2600, freqEnd: 740 });
      this.tone(740, at + t + 0.12, 0.11, { type: 'square', gain: 0.025, filter: 2400, freqEnd: 988 });
    }
  }

  /** Lightning: a crackle and a snap (HYPER RARE's core, a mage's chain lightning). */
  private zap(): void {
    if (!this.gate('zap', 70)) return;
    const at = this.ctx.currentTime;
    this.noise(at, 0.05, { type: 'highpass', freq: 2600, gain: 0.07 });
    this.noise(at + 0.03, 0.12, { type: 'bandpass', freq: 1400, q: 0.7, gain: 0.05, freqEnd: 500 });
    this.tone(this.vary(1900, 0.2), at, 0.06, { type: 'square', gain: 0.018, freqEnd: 300, filter: 4000 });
  }

  /** HYPER RARE bursts open: a huge boom and crash, the slam at its loudest, a big chord and sparkles flying up, a long sizzle under it. */
  private hyperBoom(): void {
    const at = this.ctx.currentTime;
    this.duck(0.02, 5);
    this.rec('slam', at, { gain: 1.68 });
    this.tone(96, at, 2.2, { gain: 0.7, freqEnd: 24 });
    this.noise(at, 1.6, { type: 'lowpass', freq: 3600, freqEnd: 110, gain: 0.42, attack: 0.004 });
    this.noise(at + 0.02, 3, { type: 'highpass', freq: 5200, gain: 0.07, attack: 0.01 });
    for (const n of [48, 55, 60, 64, 67, 72, 76]) this.tone(midi(n), at, 2.4, { type: 'sawtooth', gain: 0.026, filter: 2200, attack: 0.012 });
    [84, 88, 91, 96, 100, 103].forEach((n, k) => this.bell(midi(n), at + 0.22 + k * 0.065, 0.9, 0.045));
  }

  /** A firework bursting: a pop and a crackle as the sparks spread. */
  private firework(): void {
    if (!this.gate('firework', 140)) return;
    const at = this.ctx.currentTime;
    this.noise(at, 0.09, { type: 'lowpass', freq: 1800, gain: 0.16 });
    this.tone(this.vary(140), at, 0.12, { gain: 0.14, freqEnd: 60 });
    for (let i = 0; i < 6; i++) this.noise(at + 0.12 + this.rnd() * 0.45, 0.02, { type: 'highpass', freq: 4200, gain: 0.03 + this.rnd() * 0.03 });
  }

  /** The reveal sting: each rarity tier its own, one step more epic than the last. */
  private reveal(tier: number): void {
    const at = this.ctx.currentTime;
    const i = clampTier(tier);
    if (i >= 3) this.duck(0.35, 0.4 + i * 0.35);
    switch (i) {
      case 0:
        this.noise(at, 0.14, { type: 'lowpass', freq: 1100, gain: 0.08 });
        this.tone(230, at, 0.14, { gain: 0.06, freqEnd: 150 });
        break;
      case 1:
        this.bell(midi(76), at, 0.45, 0.08);
        break;
      case 2:
        this.bell(midi(72), at, 0.45, 0.08);
        this.bell(midi(79), at + 0.1, 0.55, 0.08);
        break;
      case 3:
        [72, 76, 79, 84].forEach((n, k) => this.bell(midi(n), at + k * 0.07, 0.6, 0.075));
        this.tone(65, at, 0.45, { gain: 0.32, freqEnd: 45 });
        break;
      default: {
        // Legendary and up: orchestral hit, choir pad, sparkles and a coin cascade. Each tier past
        // Legendary adds a step (`lvl`), so the rarest stay big without dragging on forever.
        const lvl = Math.min(6, i - 4);
        this.tone(55, at, 0.7, { gain: 0.42, freqEnd: 38 });
        this.noise(at, 0.35, { type: 'lowpass', freq: 1800, gain: 0.2 });
        for (const n of [60, 64, 67, 72]) this.tone(midi(n), at, 0.4, { type: 'sawtooth', gain: 0.035, filter: 2400 });
        const padLen = 1.6 + lvl * 0.5;
        for (const n of [60, 64, 67, 72, 76]) {
          for (const det of [-8, 8]) {
            this.tone(midi(n), at + 0.05, padLen, { type: 'sawtooth', gain: 0.018, attack: 0.2, filter: 1600, detune: det, vibrato: 3 });
          }
        }
        for (let k = 0; k < 10 + lvl * 4; k++) this.bell(midi(LADDER[6 + Math.floor(this.rnd() * 9)]), at + 0.15 + k * 0.08, 0.4, 0.04);
        this.coinCascade(at + 0.3, Math.min(15, 8 + lvl * 2));
        if (lvl >= 1) {
          // Mythic and up: a crowd's cheer swelling and a longer run up.
          this.noise(at + 0.2, 1.8, { freq: 1100, q: 0.6, gain: 0.08, attack: 0.5 });
          [72, 74, 76, 79, 81, 84, 86, 88, 91, 96].forEach((n, k) => this.bell(midi(n), at + 0.4 + k * 0.06, 0.5, 0.05));
        }
        if (i >= FANFARE_TIER) {
          // Astral and up: a fanfare in rhythm.
          [67, 72, 76, 79].forEach((n, k) => this.tone(midi(n), at + 0.9 + k * 0.16, 0.22, { type: 'sawtooth', gain: 0.06, filter: 2200, attack: 0.02 }));
          for (const n of [72, 76, 79, 84]) this.tone(midi(n), at + 1.6, 1.3, { type: 'sawtooth', gain: 0.045, filter: 2600, attack: 0.03, vibrato: 4 });
          this.noise(at + 1.6, 1.2, { type: 'highpass', freq: 6000, gain: 0.05 });
        }
      }
    }
  }

  /** A material's texture (Dumpster Legend's item sounds): here a knight's armor clanking, a menu's wood, a shard's glass. */
  private material(m: 'metal' | 'wood' | 'glass', quiet: boolean): void {
    const at = this.ctx.currentTime;
    const v = quiet ? 0.45 : 1;
    switch (m) {
      case 'metal':
        for (const p of [1, 2.63, 4.25]) this.tone(this.vary(520) * p, at, 0.35 / p, { gain: (0.06 / p) * v, attack: 0.001 });
        break;
      case 'glass':
        this.bell(this.vary(2600, 0.08), at, 0.3, 0.05 * v);
        this.bell(this.vary(3900, 0.08), at + 0.05, 0.2, 0.03 * v);
        break;
      case 'wood':
        this.tone(this.vary(230), at, 0.1, { gain: 0.12 * v, freqEnd: 180 });
        this.noise(at, 0.05, { freq: 650, q: 3, gain: 0.06 * v });
        break;
    }
  }

  // ------------------------------------------------------------------ the fight
  /** A blow lands; `combo` (blows in a flurry) raises it a semitone a blow, so a flurry climbs. A crit is the same whack, harder, with a ring on top. */
  private hit(crit: boolean, combo: number): void {
    if (!this.gate(crit ? 'crit' : 'hit', 45)) return;
    const at = this.ctx.currentTime;
    const c = Math.min(12, Math.max(0, combo));
    const up = Math.pow(2, c / 12);
    if (this.rec('hit', at, { semis: c / 2 + (this.rnd() * 2 - 1) * 0.3, gain: crit ? 1.4 : 1 })) {
      if (crit) this.bell(this.vary(1900, 0.04) * up, at + 0.01, 0.25, 0.05);
      return;
    }
    this.noise(at, 0.05, { freq: this.vary(1500, 0.15) * up, q: 1.2, gain: crit ? 0.16 : 0.1 });
    this.tone(this.vary(150) * up, at, 0.09, { gain: crit ? 0.24 : 0.16, freqEnd: 70 * up });
    if (crit) this.bell(this.vary(1900, 0.04) * up, at + 0.01, 0.25, 0.05);
  }

  private hurt(heavy: boolean): void {
    if (!this.gate('hurt', 60)) return;
    const at = this.ctx.currentTime;
    this.tone(this.vary(115), at, heavy ? 0.3 : 0.14, { gain: heavy ? 0.32 : 0.16, freqEnd: 55 });
    this.noise(at, heavy ? 0.2 : 0.07, { type: 'lowpass', freq: 500, gain: heavy ? 0.16 : 0.07 });
  }

  /** A blow on a shield: a clang. */
  private heistBlock(): void {
    if (!this.gate('block', 90)) return;
    const at = this.ctx.currentTime;
    this.noise(at, 0.08, { freq: 3400, q: 6, gain: 0.09 });
    this.tone(1180, at, 0.25, { type: 'square', gain: 0.025, filter: 4000, freqEnd: 1100 });
    this.tone(1720, at, 0.2, { gain: 0.03 });
  }

  private dodge(): void {
    if (!this.gate('dodge', 80)) return;
    this.noise(this.ctx.currentTime, 0.16, { freq: 500, freqEnd: 3200, q: 1.5, gain: 0.07, attack: 0.03 });
  }

  /** A mob falls: a pop, lifted up the scale by `streak` (kills in a row), a bell a step higher each; a big one booms. */
  private kill(big: boolean, streak: number): void {
    const at = this.ctx.currentTime;
    const s = Math.min(7, Math.max(0, streak));
    // Several at once (a blast) pop once.
    if (this.gate('kill', 40)) {
      const up = Math.pow(2, (LADDER[Math.min(5, s)] - LADDER[0]) / 12);
      this.tone(this.vary(320) * up, at, 0.09, { gain: 0.1, freqEnd: 950 * up });
      this.noise(at, 0.06, { type: 'lowpass', freq: 1400, gain: 0.05 });
      if (streak > 0) this.bell(midi(LADDER[3 + s]), at + 0.03, 0.3, 0.04);
    }
    if (big) {
      this.tone(50, at, 0.8, { gain: 0.4, freqEnd: 32 });
      this.noise(at, 0.5, { type: 'lowpass', freq: 900, gain: 0.18 });
    }
  }

  /** A knight falls: a long slide down and a heavy thud. */
  private heroDown(): void {
    if (!this.gate('heroDown', 200)) return;
    const at = this.ctx.currentTime;
    this.tone(440, at, 0.7, { type: 'triangle', gain: 0.08, freqEnd: 110 });
    this.hurt(true);
    this.material('metal', true);
  }

  /** A knight's skill: a rising whoosh into a bright fifth. */
  private special(): void {
    if (!this.gate('special', 120)) return;
    const at = this.ctx.currentTime;
    this.noise(at, 0.25, { type: 'bandpass', freq: 400, freqEnd: 2400, q: 1.1, gain: 0.06, attack: 0.08 });
    this.tone(330, at, 0.2, { type: 'triangle', gain: 0.06, freqEnd: 660 });
    this.bell(midi(79), at + 0.14, 0.4, 0.04);
    this.bell(midi(84), at + 0.18, 0.4, 0.035);
  }

  /** An arrow: the bowstring's twang and the shaft's whistle away. */
  private arrow(): void {
    if (!this.gate('arrow', 50)) return;
    const at = this.ctx.currentTime;
    this.tone(this.vary(220, 0.06), at, 0.12, { type: 'triangle', gain: 0.07, freqEnd: 165 });
    this.tone(this.vary(110), at, 0.08, { type: 'square', gain: 0.02, filter: 700, freqEnd: 90 });
    this.noise(at + 0.01, 0.16, { type: 'bandpass', freq: 2600, freqEnd: 900, q: 2.5, gain: 0.05, attack: 0.02 });
  }

  /** A magic bolt: a rising zing with a sizzle. */
  private bolt(): void {
    if (!this.gate('bolt', 60)) return;
    const at = this.ctx.currentTime;
    this.tone(this.vary(660), at, 0.18, { type: 'sawtooth', gain: 0.022, filter: 2400, freqEnd: 1320 });
    this.tone(this.vary(1320), at, 0.14, { gain: 0.04, freqEnd: 1980, vibrato: 60 });
    this.noise(at, 0.1, { type: 'highpass', freq: 3800, gain: 0.03 });
  }

  /** A fireball: a roaring whoosh. */
  private fireball(): void {
    if (!this.gate('fireball', 80)) return;
    const at = this.ctx.currentTime;
    this.noise(at, 0.32, { type: 'bandpass', freq: 380, freqEnd: 1300, q: 0.9, gain: 0.16, attack: 0.05 });
    this.tone(95, at, 0.3, { type: 'sawtooth', gain: 0.05, filter: 500, freqEnd: 60 });
  }

  /** An explosion (a meteor, a bomb, a blast): a boom and a crackle. */
  private blast(): void {
    if (!this.gate('blast', 90)) return;
    const at = this.ctx.currentTime;
    this.tone(60, at, 0.6, { gain: 0.34, freqEnd: 32 });
    this.noise(at, 0.4, { type: 'lowpass', freq: 1200, freqEnd: 200, gain: 0.2 });
    for (let i = 0; i < 4; i++) this.noise(at + 0.08 + this.rnd() * 0.3, 0.02, { type: 'highpass', freq: 3500, gain: 0.025 });
  }

  /** A heal: a harp's run up the ladder and a shimmer. */
  private heal(): void {
    if (!this.gate('heal', 150)) return;
    const at = this.ctx.currentTime;
    [72, 76, 79, 84].forEach((n, k) => this.bell(midi(n), at + k * 0.05, 0.4, 0.035));
    this.tone(midi(72), at, 0.5, { type: 'triangle', gain: 0.03, attack: 0.1 });
    this.noise(at + 0.05, 0.4, { type: 'highpass', freq: 6000, gain: 0.02, attack: 0.1 });
  }

  /** Pitch stacking: each coin in a chain plays one step higher, then resets after a pause. */
  private coin(): void {
    if (!this.gate('coin', 50)) return;
    const now = performance.now();
    if (now - this.lastCoinAt > 1400) this.coinStack = 0;
    this.lastCoinAt = now;
    const note = LADDER[Math.min(LADDER.length - 1, 5 + this.coinStack)];
    this.coinStack = Math.min(this.coinStack + 1, 10);
    this.bell(midi(note) * 2, this.ctx.currentTime + 0.02, 0.18, 0.035);
  }

  private coinCascade(at: number, n: number): void {
    for (let k = 0; k < n; k++) this.bell(midi(LADDER[Math.min(LADDER.length - 1, 4 + k)]) * 2, at + k * 0.045, 0.15, 0.03);
    // ...finished with one big ka-ching.
    this.kaChing(at + n * 0.045 + 0.05);
  }

  private kaChing(at: number): void {
    this.bell(midi(84) * 2, at, 0.5, 0.06);
    this.noise(at, 0.1, { type: 'highpass', freq: 5000, gain: 0.05 });
  }

  /** Something picked up off the floor: a bag's rustle and a bell. */
  private pickup(): void {
    if (!this.gate('pickup', 100)) return;
    const at = this.ctx.currentTime;
    this.tone(170, at, 0.12, { gain: 0.12, freqEnd: 95 });
    for (let i = 0; i < 3; i++) this.noise(at + 0.02 + i * 0.03, 0.03, { type: 'highpass', freq: 3000, gain: 0.03 });
    this.bell(midi(84), at + 0.06, 0.3, 0.04);
  }

  /** A luck potion: three gulps, then the long jingle. */
  private potion(): void {
    if (!this.gate('potion', 400)) return;
    const at = this.ctx.currentTime;
    for (let k = 0; k < 3; k++) this.tone(this.vary(300 + k * 60), at + k * 0.08, 0.07, { gain: 0.08, freqEnd: 620 + k * 80 });
    this.later(300, () => this.jingle(5));
  }

  /** XP reaches a bar: a soft upward blip. */
  private xpTick(): void {
    if (!this.gate('xp', 80)) return;
    this.tone(midi(79), this.ctx.currentTime, 0.09, { type: 'triangle', gain: 0.035, freqEnd: midi(91) });
  }

  private levelUp(level: number): void {
    this.duck(0.5, 0.5);
    this.jingle(level > 0 && level % 10 === 0 ? 5 : 3);
  }

  /** Time runs backwards (Rewind): a falling warble, a clock ticking back, a reversed swell landing in the past. */
  private rewind(): void {
    if (!this.gate('rewind', 400)) return;
    const at = this.ctx.currentTime;
    const dur = 0.8;
    this.duck(0.5, 0.9);
    this.tone(880, at, dur, { type: 'triangle', gain: 0.04, freqEnd: 220, vibrato: 25, attack: 0.05 });
    this.tone(1320, at, dur, { gain: 0.02, freqEnd: 330, vibrato: 30, attack: 0.05 });
    for (let k = 0; k < 10; k++) this.tone(2400 - k * 120, at + k * 0.075, 0.02, { type: 'square', gain: 0.018, filter: 4000 });
    this.noise(at, dur, { type: 'highpass', freq: 4000, gain: 0.05, attack: dur * 0.95 });
    this.bell(midi(84), at + dur, 0.5, 0.05);
    this.bell(midi(72), at + dur + 0.02, 0.6, 0.04);
  }

  // ------------------------------------------------------------------ the dungeon
  /** A floor's portal opens (cleared): rising bells and a swirling whoosh. */
  private portal(): void {
    if (!this.gate('portal', 300)) return;
    const at = this.ctx.currentTime;
    [72, 76, 79].forEach((n, k) => this.bell(midi(n), at + k * 0.06, 0.35, 0.045));
    this.noise(at, 0.8, { type: 'bandpass', freq: 600, freqEnd: 3000, q: 1.2, gain: 0.05, attack: 0.3 });
    this.tone(midi(72), at, 0.7, { gain: 0.03, freqEnd: midi(84), vibrato: 8, attack: 0.2 });
    [84, 88, 91].forEach((n, k) => this.bell(midi(n), at + 0.35 + k * 0.06, 0.4, 0.035));
  }

  /** A new floor: a whoosh in and a horn call (a fourth up, in key). */
  private floorStart(): void {
    if (!this.gate('floorStart', 500)) return;
    const at = this.ctx.currentTime;
    this.noise(at, 0.4, { type: 'bandpass', freq: 400, freqEnd: 2600, q: 0.9, gain: 0.05, attack: 0.06 });
    this.tone(midi(67), at + 0.12, 0.16, { type: 'sawtooth', gain: 0.035, filter: 1800, attack: 0.02 });
    this.tone(midi(72), at + 0.3, 0.45, { type: 'sawtooth', gain: 0.04, filter: 1900, attack: 0.03, vibrato: 3 });
    this.tone(110, at + 0.12, 0.25, { gain: 0.18, freqEnd: 60 });
  }

  /** A boss telegraphs an attack: two low warning blips. */
  private bossWarn(): void {
    if (!this.gate('warn', 300)) return;
    const at = this.ctx.currentTime;
    this.tone(220, at, 0.14, { type: 'square', gain: 0.05, filter: 1200 });
    this.tone(220, at + 0.18, 0.14, { type: 'square', gain: 0.05, filter: 1200 });
  }

  /** A boss floor: a deep boom, a low brass growl and a roar. */
  private bossRoar(): void {
    if (!this.gate('bossRoar', 800)) return;
    const at = this.ctx.currentTime;
    this.duck(0.4, 1);
    this.tone(48, at, 0.9, { gain: 0.4, freqEnd: 36 });
    this.noise(at, 0.6, { type: 'lowpass', freq: 700, gain: 0.15 });
    this.tone(midi(45), at + 0.05, 0.8, { type: 'sawtooth', gain: 0.04, filter: 900 });
    this.tone(82, at + 0.15, 0.9, { type: 'sawtooth', gain: 0.07, filter: 700, freqEnd: 55, vibrato: 18, attack: 0.08 });
    this.noise(at + 0.15, 0.8, { type: 'lowpass', freq: 900, freqEnd: 300, gain: 0.12, attack: 0.1 });
  }

  /**
   * A boss falls: a boom and a shower of coins, and the long jingle (`jingle`: unless the music's
   * victory sting is playing the fanfare, as `event` has it).
   */
  private bossDown(jingle: boolean): void {
    const at = this.ctx.currentTime;
    this.tone(50, at, 0.8, { gain: 0.4, freqEnd: 32 });
    this.noise(at, 0.5, { type: 'lowpass', freq: 900, gain: 0.18 });
    if (jingle) {
      this.duck(0.4, 1);
      this.jingle(5);
    }
    this.coinCascade(at + 0.4, 14);
  }

  /** The squad is wiped: four notes sliding down, the last one wobbling. */
  private heistLose(): void {
    const at = this.ctx.currentTime;
    this.duck(0.3, 2);
    this.tone(70, at, 0.6, { gain: 0.3, freqEnd: 38 });
    [55, 54, 53, 52].forEach((n, k) => {
      const last = k === 3;
      this.tone(midi(n), at + 0.2 + k * 0.32, last ? 0.9 : 0.3, {
        type: 'sawtooth', gain: 0.055, filter: 900, attack: 0.03, vibrato: last ? 6 : undefined, freqEnd: last ? midi(n - 1) : undefined,
      });
    });
  }

  /** A chest or a treasure room: a sparkle of bells; a golden one adds a coin shower. */
  private treasure(golden: boolean): void {
    if (!this.gate('treasure', 150)) return;
    const at = this.ctx.currentTime;
    this.noise(at, 0.05, { type: 'bandpass', freq: 2400, freqEnd: 900, q: 1.2, gain: 0.06 });
    [76, 79, 84, 88].forEach((n, k) => this.bell(midi(n), at + 0.06 + k * 0.05, 0.4, golden ? 0.07 : 0.05));
    if (golden) this.coinCascade(at + 0.3, 8);
  }

  /** A tap on a lock: a heavy metal clank. */
  private lockHit(): void {
    const at = this.ctx.currentTime;
    if (this.rec('lock_tap', at)) return;
    this.tone(150, at, 0.22, { gain: 0.3, freqEnd: 70 });
    this.noise(at, 0.09, { freq: 2600, q: 4, gain: 0.14 });
    for (const p of [1, 2.41, 3.9]) this.tone(this.vary(610) * p, at, 0.3 / p, { gain: 0.05 / p, attack: 0.001 });
  }

  /** The lock pops and the metal falls: a ping, a crash, then clatter. */
  private lockBreak(): void {
    const at = this.ctx.currentTime;
    if (this.rec('lock_break', at)) {
      this.duck(0.4, 0.9);
      return;
    }
    this.bell(1480, at, 0.5, 0.09);
    this.tone(70, at + 0.12, 0.6, { gain: 0.5, freqEnd: 38 });
    this.noise(at + 0.12, 0.3, { type: 'lowpass', freq: 3000, freqEnd: 600, gain: 0.32 });
    for (let i = 0; i < 6; i++) {
      const t = at + 0.25 + i * (0.07 + this.rnd() * 0.06);
      for (const p of [1, 2.63]) this.tone(this.vary(440 + i * 60) * p, t, 0.18 / p, { gain: (0.05 / p) * (1 - i / 7), attack: 0.001 });
    }
    this.duck(0.4, 0.5);
  }

  /** Setting off (Dumpster Legend's PLAY): a punchy press, a run up the chord, sparkles, the music held back under it. */
  private titleStart(): void {
    const at = this.ctx.currentTime;
    this.duck(0.2, 1.4);
    if (this.rec('title_start', at)) return;
    this.tone(150, at, 0.16, { gain: 0.34, freqEnd: 58 });
    this.noise(at, 0.035, { freq: 2800, q: 2, gain: 0.09 });
    this.tone(midi(48), at + 0.03, 0.55, { type: 'triangle', gain: 0.09 });
    [72, 76, 79, 84].forEach((n, k) => this.bell(midi(n), at + 0.04 + k * 0.055, 0.6, 0.075));
    this.noise(at + 0.06, 0.5, { type: 'highpass', freq: 6500, gain: 0.045, attack: 0.02 });
    [88, 91, 96].forEach((n, k) => this.bell(midi(n), at + 0.3 + k * 0.05, 0.35, 0.03));
  }

  /** A rebirth: two pickup notes, the chord, bells and a coin shower, the music swelling back after. */
  private rebirth(): void {
    const at = this.ctx.currentTime;
    this.duck(0.3, 2);
    this.tone(midi(67), at, 0.12, { type: 'square', gain: 0.05, filter: 2200 });
    this.tone(midi(67), at + 0.13, 0.12, { type: 'square', gain: 0.05, filter: 2200 });
    for (const n of [72, 76, 79, 84]) this.tone(midi(n), at + 0.28, 0.9, { type: 'sawtooth', gain: 0.03, filter: 2600, attack: 0.01 });
    this.tone(midi(48), at + 0.28, 0.9, { type: 'triangle', gain: 0.1 });
    [72, 76, 79, 84, 88].forEach((n, k) => this.bell(midi(n), at + 0.3 + k * 0.08, 0.6, 0.06));
    this.coinCascade(at + 0.8, 12);
    this.emerge(1.2);
  }

  // ------------------------------------------------------------------ knights and menus
  /** A seal stamped down (a rarity stamp, NEW!): a thump, a paper slap, a small ring. */
  private stamp(): void {
    if (!this.gate('stamp', 120)) return;
    const at = this.ctx.currentTime;
    this.tone(95, at, 0.18, { gain: 0.3, freqEnd: 50 });
    this.noise(at, 0.06, { type: 'lowpass', freq: 1800, gain: 0.14 });
    this.noise(at, 0.03, { type: 'highpass', freq: 2500, gain: 0.06 });
    this.bell(midi(84), at + 0.03, 0.25, 0.03);
  }

  /** A new knight joins: the signature three-note jingle. */
  private newHero(): void {
    if (!this.gate('newHero', 1200)) return;
    this.jingle(3);
  }

  /** A duplicate: a small soft pop and a swish into the pile. */
  private dupe(): void {
    if (!this.gate('dupe', 150)) return;
    const at = this.ctx.currentTime;
    this.tone(this.vary(380), at, 0.06, { gain: 0.04, freqEnd: 560 });
    this.noise(at + 0.03, 0.14, { freq: 1200, freqEnd: 300, q: 1, gain: 0.03, attack: 0.02 });
  }

  /** A better mutation: a shimmer up and a sparkle. */
  private mutation(): void {
    if (!this.gate('mutation', 300)) return;
    const at = this.ctx.currentTime;
    [79, 84, 88, 91].forEach((n, k) => this.bell(midi(n), at + k * 0.06, 0.5, 0.045));
    for (const [n, det] of [[72, -7], [79, 7]] as const) this.tone(midi(n), at, 0.6, { type: 'triangle', gain: 0.03, attack: 0.3, detune: det, vibrato: 5 });
    this.noise(at, 0.6, { type: 'highpass', freq: 5500, gain: 0.04, attack: 0.4 });
  }

  /** Duplicates broken into shards: a crunch, glass flying, crystals tinkling down. */
  private breakDown(): void {
    if (!this.gate('breakDown', 120)) return;
    const at = this.ctx.currentTime;
    this.tone(140, at, 0.12, { gain: 0.16, freqEnd: 70 });
    this.noise(at, 0.08, { type: 'highpass', freq: 2500, gain: 0.1 });
    this.noise(at, 0.25, { type: 'bandpass', freq: 3500, freqEnd: 1800, q: 0.8, gain: 0.05 });
    for (let k = 0; k < 6; k++) this.bell(this.vary(2600 - k * 180, 0.08), at + 0.04 + k * 0.045 + this.rnd() * 0.02, 0.25, 0.03 * (1 - k / 8));
    this.material('glass', true);
  }

  /** Duplicates sold: a ka-ching and coins (`level` 1 or 2 for more of them). */
  private sell(level: number): void {
    if (!this.gate('sell', 120)) return;
    const at = this.ctx.currentTime;
    this.noise(at, 0.05, { type: 'highpass', freq: 3000, gain: 0.08 });
    this.bell(midi(88), at + 0.04, 0.5, 0.06);
    this.bell(midi(93), at + 0.1, 0.6, 0.05);
    this.coinCascade(at + 0.2, 4 + Math.max(0, Math.min(2, level)) * 4);
  }

  /** A big haul of gold: a ka-ching, then coins pouring in (longer for bigger hauls, `level` 0 to 2). */
  private haul(level: number): void {
    const at = this.ctx.currentTime;
    this.duck(0.4, 1 + level * 0.6);
    if (this.rec('haul', at, { gain: [1, 1.19, 1.41][level] })) return;
    this.noise(at, 0.06, { type: 'highpass', freq: 3000, gain: 0.12 });
    this.bell(midi(88), at + 0.05, 0.6, 0.08);
    this.bell(midi(93), at + 0.12, 0.8, 0.07);
    this.coinCascade(at + 0.35, 10 + level * 4);
    if (level >= 1) [72, 76, 79, 84].forEach((n, k) => this.bell(midi(n), at + 0.95 + k * 0.08, 0.5, 0.06));
    if (level >= 2) {
      this.noise(at + 0.3, 1.8, { freq: 1100, q: 0.6, gain: 0.07, attack: 0.4 });
      this.coinCascade(at + 1.4, 12);
    }
  }

  /** An upgrade bought: a coin, then a bright arpeggio up and a sparkle. */
  private buy(): void {
    if (!this.gate('buy', 80)) return;
    const at = this.ctx.currentTime;
    this.noise(at, 0.04, { type: 'highpass', freq: 3000, gain: 0.06 });
    this.bell(midi(88) * 2, at, 0.2, 0.03);
    [72, 76, 79, 84, 88].forEach((n, k) => this.bell(midi(n), at + 0.04 + k * 0.055, 0.5, 0.055));
    this.noise(at + 0.14, 0.5, { type: 'highpass', freq: 6500, gain: 0.03, attack: 0.04 });
  }

  /** A knight takes its place in the squad: a thump and a clank, a chime climbing with its rarity; Legendary and up add a chord and a shimmer. */
  private equipImpact(tier: number): void {
    const at = this.ctx.currentTime;
    this.tone(110, at, 0.22, { gain: 0.32 + Math.min(0.2, tier * 0.02), freqEnd: 42 });
    this.noise(at, 0.07, { type: 'highpass', freq: 2200, gain: 0.12 + tier * 0.006 });
    this.noise(at, 0.12, { freq: 900, q: 1.4, gain: 0.08 });
    const notes = Math.min(6, 1 + Math.floor(tier / 2));
    for (let k = 0; k < notes; k++) this.bell(midi(LADDER[Math.min(LADDER.length - 1, 2 + tier + k)]), at + 0.04 + k * 0.06, 0.45, 0.05 + tier * 0.004);
    if (tier >= 4) {
      this.duck(0.5, 0.6);
      for (const n of [60, 64, 67, 72]) this.tone(midi(n + Math.min(7, tier - 4)), at + 0.05, 0.7, { type: 'sawtooth', gain: 0.022, filter: 2600, attack: 0.01 });
      this.noise(at + 0.08, 0.9, { type: 'highpass', freq: 6000, gain: 0.035, attack: 0.05 });
    }
    if (tier >= 7) this.slam(Math.min(2, tier - 7));
  }

  /** A perk picked: a sweep up into a chord; a big one adds a shimmer and a run of bells. */
  private heistPerk(big: boolean): void {
    const at = this.ctx.currentTime;
    this.tone(midi(60), at, 0.25, { type: 'triangle', gain: 0.05, freqEnd: midi(84) });
    for (const n of [72, 76, 79]) this.tone(midi(n), at + 0.12, 0.45, { type: 'sawtooth', gain: 0.025, filter: 2400, attack: 0.01 });
    this.bell(midi(84), at + 0.14, 0.5, 0.06);
    if (big) {
      this.duck(0.4, 1);
      this.noise(at + 0.1, 1, { type: 'highpass', freq: 6000, gain: 0.04, attack: 0.1 });
      [79, 84, 88, 91].forEach((n, k) => this.bell(midi(n), at + 0.3 + k * 0.08, 0.6, 0.05));
    }
  }

  /** Something new opens up (a feature, a reel): a rising sparkle. */
  private featureOpen(): void {
    if (!this.gate('featureOpen', 300)) return;
    const at = this.ctx.currentTime;
    [72, 76, 79, 84].forEach((n, i) => this.bell(midi(n), at + i * 0.07, 0.35, 0.07));
  }

  /** Earnings collected (offline gold): a cascade of coins and a ka-ching. */
  private collect(): void {
    this.coinCascade(this.ctx.currentTime, 12);
  }

  /** The signature motif (three notes, or five for bigger wins), on the music's beat when one is near. */
  private jingle(len: 3 | 5): void {
    if (!this.gate(`jingle${len}`, 250)) return;
    const at = this.ctx.currentTime + music.beatDelay(0.2);
    if (this.rec(len === 3 ? 'jingle' : 'jingle_long', at)) return;
    const notes = len === 3 ? [67, 72, 76] : [67, 72, 76, 79, 84];
    notes.forEach((n, k) => {
      this.bell(midi(n), at + k * 0.09, 0.5, 0.07);
      this.tone(midi(n), at + k * 0.09, 0.3, { type: 'triangle', gain: 0.04 });
    });
  }

  /** A bright ding (a timer done, something now affordable). */
  private ding(): void {
    if (!this.gate('ding', 200)) return;
    const at = this.ctx.currentTime;
    this.bell(midi(84), at, 0.8, 0.07);
    this.bell(midi(88), at + 0.08, 0.8, 0.06);
  }

  /** A button: a pop with a hair of random pitch, climbing a semitone a tap through quick taps (`streak`). */
  private tap(streak: number): void {
    if (!this.gate('tap', 40)) return;
    const at = this.ctx.currentTime;
    const semis = Math.min(12, Math.max(0, streak));
    if (this.rec('tap', at, { semis: semis + (this.rnd() * 2 - 1) * 0.3 })) return;
    const up = Math.pow(2, semis / 12);
    this.tone(this.vary(560) * up, at, 0.07, { gain: 0.09, freqEnd: this.vary(820) * up });
    this.noise(at, 0.02, { freq: 3000, q: 2, gain: 0.03 });
  }

  /** A menu board swings open (a whoosh up, a wooden knock, a little bell) or shut (down, lower). */
  private panel(open: boolean): void {
    if (!this.gate('panel', 120)) return;
    const at = this.ctx.currentTime;
    if (open) {
      this.noise(at, 0.18, { type: 'bandpass', freq: 500, freqEnd: 2200, q: 0.9, gain: 0.035, attack: 0.04 });
      this.tone(this.vary(230), at + 0.05, 0.08, { gain: 0.08, freqEnd: 180 });
      this.noise(at + 0.05, 0.04, { freq: 650, q: 3, gain: 0.04 });
      this.bell(midi(79), at + 0.08, 0.3, 0.025);
    } else {
      this.noise(at, 0.16, { type: 'bandpass', freq: 2200, freqEnd: 500, q: 0.9, gain: 0.03, attack: 0.03 });
      this.tone(this.vary(190), at + 0.06, 0.08, { gain: 0.07, freqEnd: 150 });
      this.noise(at + 0.06, 0.04, { freq: 520, q: 3, gain: 0.035 });
    }
  }
}

export const sfx = guarded(new Sfx());
