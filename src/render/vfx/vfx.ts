/**
 * The attack effects at play: it watches the world (it never changes it) and draws what its attacks
 * look like. A knight's swing starts when its swingT jumps (the tick its blow lands); the stroke its
 * class or its skill plays is drawn at its chest along its aim, frame by frame over the swing, and
 * each foe it hit gets the stroke's own mark (a cut, a lance through it, the Guardian's thud) in
 * place of the generic spark. Whirlwind and the lunges are drawn while they run. Shots are drawn as
 * what they are, with trails that follow their real path (a homing bolt's curve shows), and when one
 * is gone, an impact bursts where it was: sized to what it hit, bigger on a crit, grit off a wall, a
 * fizzle if it ran out.
 *
 * Everything goes on the renderer's unlit top layer (`ui`, under the HUD's numbers): crisp, never
 * bloomed, glowing or lighting the scene. Every frame of every effect is drawn once (art.ts) and kept
 * as a canvas keyed by number (kind, look, direction, frame), so a frame costs one drawImage. Times
 * are the world's, so hit-stop and pauses hold the effects too. Nothing here allocates per frame in
 * the steady state (tracks and particles are pooled); the sim's random numbers are never touched.
 */
import type { SkillId } from '../../core/skillbook';
import type { Fx, Shot, Unit } from '../../world/entities';
import type { World } from '../../world/world';
import { toCanvas } from '../art/draw';
import type { PixelBuf } from '../pixel/buf';
import {
  ARCANE, BOLT_FRAMES, BULLET_FRAMES, CHEST, DUST, FIRE, FIRE_FRAMES, HOLY, IMPACT_FRAMES, IMPACT_FRAME_S, IMPACT_KINDS, ORB_FRAMES, SHOT_DIRS,
  STEEL, SWING_DIRS, dangerRamp, swingReach, arrowSprite, boltSprite, bulletSprite, dirIndex, fireSprite, impactSprite, lungeSprite, orbSprite, rampFrom,
  spearSprite, swingFrameAt, swingSprite, tone, whirlSprite, type ImpactKind, type VfxSprite,
} from './art';
import { SWING_STYLES, rainbowStep, swingStyleFor, vfxLook, type Ramp, type SwingStyle, type VfxLook } from './look';

type Ctx = CanvasRenderingContext2D;

interface Pair {
  img: HTMLCanvasElement | null;
  ax: number;
  ay: number;
}

const K_SWING = 1;
const K_WHIRL = 2;
const K_LUNGE = 3;
const K_ARROW = 4;
const K_SPEAR = 5;
const K_BOLT = 6;
const K_ORB = 7;
const K_FIRE = 8;
const K_BULLET = 9;
const K_IMPACT = 10;

/** A sprite cache key: kind, look, direction, frame and a variant, packed into one number. */
function key(kind: number, look: number, dir: number, frame: number, variant: number): number {
  return kind + 16 * (variant + 65536 * (frame + 16 * (dir + 64 * look)));
}

/** Frames kept (a fight uses a few hundred; the oldest go first). */
const CACHE_MAX = 1500;
const TRAIL = 24;
const PARTS = 700;
const COMMON = vfxLook('common');
/** A hit on a knight is marked in this color (World.damage): those are never a knight's own blow. */
const HERO_HURT = '#ff5a5a';

interface HeroMem {
  swingT: number;
  skillN: number;
  look: VfxLook;
  rarity: string;
  mutation: string | null;
  step: number;
  seen: boolean;
}

interface Swing {
  uid: number;
  style: SwingStyle;
  dir: number;
  sign: 1 | -1;
  crit: boolean;
  t0: number;
  dur: number;
  x: number;
  y: number;
}

interface Track {
  uid: number;
  kind: Shot['kind'];
  xs: Float32Array;
  ys: Float32Array;
  n: number;
  head: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  heavy: boolean;
  small: boolean;
  splash: number;
  hero: boolean;
  from: number;
  boss: boolean;
  hits: number;
  seen: boolean;
  emitT: number;
}

interface Impact {
  kind: ImpactKind;
  look: VfxLook;
  core: Ramp;
  size: number;
  x: number;
  y: number;
  t0: number;
  /** Which way it points (of SHOT_DIRS), for the ones that have a direction. */
  dir: number;
}

/** Particles in flat arrays (no objects per spark): sparkles, motes, embers, grit. */
class Parts {
  n = 0;
  readonly x = new Float32Array(PARTS);
  readonly y = new Float32Array(PARTS);
  readonly vx = new Float32Array(PARTS);
  readonly vy = new Float32Array(PARTS);
  readonly life = new Float32Array(PARTS);
  readonly max = new Float32Array(PARTS);
  /** 0 dot, 1 a plus while young, 2 a mote (rises, slows). */
  readonly kind = new Uint8Array(PARTS);
  readonly c0: string[] = new Array<string>(PARTS).fill('#ffffff');
  readonly c1: string[] = new Array<string>(PARTS).fill('#ffffff');
  readonly c2: string[] = new Array<string>(PARTS).fill('#ffffff');

  spawn(x: number, y: number, vx: number, vy: number, life: number, c0: string, c1: string, c2: string, kind: number): void {
    if (this.n >= PARTS) return;
    const i = this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.kind[i] = kind;
    this.c0[i] = c0;
    this.c1[i] = c1;
    this.c2[i] = c2;
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(i);
        continue;
      }
      const drag = this.kind[i] === 2 ? 0.9 : 0.94;
      const k = Math.pow(drag, dt * 60);
      this.vx[i] *= k;
      this.vy[i] *= k;
      if (this.kind[i] === 2) this.vy[i] -= 6 * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      i++;
    }
  }

  private kill(i: number): void {
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j];
    this.y[i] = this.y[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.life[i] = this.life[j];
    this.max[i] = this.max[j];
    this.kind[i] = this.kind[j];
    this.c0[i] = this.c0[j];
    this.c1[i] = this.c1[j];
    this.c2[i] = this.c2[j];
  }

  draw(ctx: Ctx, cx: number, cy: number, W: number, H: number): void {
    for (let i = 0; i < this.n; i++) {
      const x = Math.round(this.x[i]) - cx;
      const y = Math.round(this.y[i]) - cy;
      if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
      const u = 1 - this.life[i] / this.max[i];
      const col = u < 0.34 ? this.c0[i] : u < 0.68 ? this.c1[i] : this.c2[i];
      // The last third flickers out (every other frame of its life), never half transparent.
      if (u > 0.8 && Math.floor(this.life[i] * 40) % 2) continue;
      ctx.fillStyle = col;
      if (this.kind[i] === 1 && u < 0.4) {
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
      } else ctx.fillRect(x, y, 1, 1);
    }
  }
}

export class Vfx {
  private world: World | null = null;
  private cache = new Map<number, Pair>();
  private mem = new Map<number, HeroMem>();
  private swings: Swing[] = [];
  private tracks = new Map<number, Track>();
  private pool: Track[] = [];
  private impacts: Impact[] = [];
  private parts = new Parts();
  private ids = new Map<unknown, number>();
  private lastTime = 0;

  /** What's playing (tests and the dev console). */
  stats(): { swings: number; impacts: number; shots: number; sparks: number; cached: number } {
    return { swings: this.swings.length, impacts: this.impacts.length, shots: this.tracks.size, sparks: this.parts.n, cached: this.cache.size };
  }

  /** The strokes playing now (tests): who, which stroke, which way. */
  playing(): ReadonlyArray<Readonly<{ uid: number; style: SwingStyle; dir: number; sign: 1 | -1; crit: boolean }>> {
    return this.swings;
  }

  /** The impacts playing now (tests): what kind, where. */
  bursts(): ReadonlyArray<Readonly<{ kind: ImpactKind; x: number; y: number; size: number }>> {
    return this.impacts;
  }

  /** Forgets everything (a new floor). */
  reset(): void {
    this.swings.length = 0;
    this.impacts.length = 0;
    this.parts.n = 0;
    for (const t of this.tracks.values()) this.pool.push(t);
    this.tracks.clear();
    this.mem.clear();
  }

  /** A small number for a color or a ramp (cache keys). */
  private idOf(o: unknown): number {
    let i = this.ids.get(o);
    if (i === undefined) {
      i = this.ids.size + 1;
      this.ids.set(o, i);
    }
    return i;
  }

  private sprite(k: number, make: () => VfxSprite): Pair {
    let p = this.cache.get(k);
    if (p) return p;
    const s = make();
    p = { img: s.buf ? canvasOf(s.buf) : null, ax: s.ax, ay: s.ay };
    this.cache.set(k, p);
    if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    return p;
  }

  private blit(p: Pair, x: number, y: number, ctx: Ctx): void {
    if (p.img) ctx.drawImage(p.img, x - p.ax, y - p.ay);
  }

  /** A knight's look right now (the primordial's turns with time). */
  private lookOf(h: Unit, time: number): VfxLook {
    let m = this.mem.get(h.uid);
    if (!m) {
      m = { swingT: h.swingT, skillN: h.lastSkill?.n ?? 0, look: COMMON, rarity: '', mutation: null, step: -1, seen: true };
      this.mem.set(h.uid, m);
    }
    const r = h.rarity ?? 'common';
    const mut = h.mutation ?? null;
    const step = rainbowStep(r, time);
    if (m.rarity !== r || m.mutation !== mut || m.step !== step) {
      m.look = vfxLook(r, mut, step);
      m.rarity = r;
      m.mutation = mut;
      m.step = step;
    }
    return m.look;
  }

  private heroBy(w: World, uid: number): Unit | null {
    for (const h of w.heroes) if (h.uid === uid) return h;
    return null;
  }

  // ------------------------------------------------------------------ watching the world

  /**
   * Reads this frame's world: new swings, shots in flight, shots gone (their impacts), and the Fx
   * the sim pushed (crits, the blasts it replaces). Call before the renderer turns w.fx into effects.
   */
  update(w: World): void {
    if (this.world !== w) {
      this.reset();
      this.world = w;
      this.lastTime = w.time;
    }
    const dt = Math.max(0, Math.min(0.1, w.time - this.lastTime));
    this.lastTime = w.time;
    this.parts.update(dt);
    // --- swings
    for (const m of this.mem.values()) m.seen = false;
    for (const h of w.heroes) {
      const fresh = !this.mem.has(h.uid);
      this.lookOf(h, w.time);
      const m = this.mem.get(h.uid)!;
      m.seen = true;
      const n = h.lastSkill?.n ?? 0;
      if (!fresh && !w.rewind && !h.downed && h.swingT > m.swingT + 1e-4) this.startSwing(w, h, m, n !== m.skillN ? h.lastSkill!.skill : null);
      m.swingT = h.swingT;
      m.skillN = n;
    }
    for (const [uid, m] of this.mem) if (!m.seen) this.mem.delete(uid);
    // --- shots
    for (const t of this.tracks.values()) t.seen = false;
    for (const s of w.shots) {
      let t = this.tracks.get(s.uid);
      if (!t) {
        t = this.track(w, s);
        this.tracks.set(s.uid, t);
      }
      t.seen = true;
      if (Math.abs(s.x - t.x) + Math.abs(s.y - t.y) >= 0.75) {
        t.head = (t.head + 1) % TRAIL;
        t.xs[t.head] = s.x;
        t.ys[t.head] = s.y;
        t.n = Math.min(TRAIL, t.n + 1);
      }
      t.x = s.x;
      t.y = s.y;
      t.vx = s.vx;
      t.vy = s.vy;
      // A shot that pierces sparks at each foe it goes through.
      const hits = s.hit?.size ?? 0;
      if (hits > t.hits) {
        t.hits = hits;
        this.impactFor(w, t, 'pierce');
      }
      this.trailSparks(w, t, dt);
    }
    for (const [uid, t] of this.tracks) {
      if (t.seen) continue;
      // (While time runs back, shots come and go with the snapshots: no bursts for those.)
      if (!w.rewind) this.impactFor(w, t, 'end');
      this.tracks.delete(uid);
      this.pool.push(t);
    }
  }

  private track(w: World, s: Shot): Track {
    const t = this.pool.pop() ?? { uid: 0, kind: 'arrow', xs: new Float32Array(TRAIL), ys: new Float32Array(TRAIL), n: 0, head: 0, x: 0, y: 0, vx: 0, vy: 0, color: '', heavy: false, small: false, splash: 0, hero: false, from: 0, boss: false, hits: 0, seen: true, emitT: 0 };
    t.uid = s.uid;
    t.kind = s.kind;
    t.n = 1;
    t.head = 0;
    t.xs[0] = s.x;
    t.ys[0] = s.y;
    t.x = s.x;
    t.y = s.y;
    t.vx = s.vx;
    t.vy = s.vy;
    t.color = s.color;
    t.heavy = s.r >= 3 || !!s.pierce;
    t.small = s.r <= 2;
    t.splash = s.splash ?? 0;
    t.hero = s.team === 'hero';
    t.from = s.from;
    t.boss = !!w.bossUnit && w.bossUnit.uid === s.from;
    t.hits = s.hit?.size ?? 0;
    t.emitT = 0;
    return t;
  }

  private startSwing(w: World, h: Unit, m: HeroMem, skill: SkillId | null): void {
    const style = swingStyleFor(h.cls, skill);
    if (!style) return;
    // (No aim at all: the way it faces.)
    const aimed = h.aimX !== 0 || h.aimY !== 0;
    const ax = aimed ? h.aimX : h.dir;
    const ay = aimed ? h.aimY : 0;
    const dir = dirIndex(ax, ay, SWING_DIRS);
    const side: 1 | -1 = Math.abs(h.aimX) > 0.08 ? (h.aimX > 0 ? 1 : -1) : h.dir;
    // The smear rides the knight's top side; on a straight up or down aim, the side it faces.
    const sign: 1 | -1 = side;
    const dur = Math.max(0.16, h.swingDur || 0.26) * (skill ? 1.15 : 1);
    const L = m.look;
    const core = L.level === 0 ? STEEL : L.ramp;
    const reach = swingReach(style) + 8;
    const line = style === 'thrust' || style === 'impale' || style === 'stab';
    // The blows this stroke landed (the sim marked each foe it hit this tick): each gets the stroke's
    // own mark instead of the generic spark, a cut across it, a lance through it, or the Guardian's thud.
    let crit = false;
    let thud: Fx | null = null;
    for (let i = w.fx.length - 1; i >= 0; i--) {
      const f = w.fx[i];
      if (f.kind !== 'hit' && f.kind !== 'crit') continue;
      if (f.color === HERO_HURT) continue;
      const dx = f.x - h.x;
      const dy = f.y + 6 - h.y;
      const along = dx * ax + dy * ay;
      const d = Math.hypot(dx, dy);
      if (line ? along < -6 || along > reach || Math.abs(dx * ay - dy * ax) > 14 : d > reach || (along < -4 && d > 10)) continue;
      w.fx.splice(i, 1);
      const isCrit = f.kind === 'crit';
      crit ||= isCrit;
      if (style === 'chop' || style === 'bash' || style === 'slam') {
        if (!thud || isCrit) thud = f;
        continue;
      }
      const cutDir = line ? dirIndex(ax, ay, SHOT_DIRS) : dirIndex(Math.cos(Math.atan2(dy, dx) + Math.PI / 2 + sign * 0.4), Math.sin(Math.atan2(dy, dx) + Math.PI / 2 + sign * 0.4), SHOT_DIRS);
      this.impacts.push({ kind: line ? 'pierce' : 'cut', look: L, core, size: isCrit ? 1.35 : 1, x: f.x, y: f.y, t0: w.time + dur * 0.06, dir: cutDir });
    }
    if (thud) this.impacts.push({ kind: 'thud', look: L, core, size: crit ? 1.3 : 1, x: thud.x, y: thud.y + 6 - CHEST, t0: w.time + dur * 0.08, dir: 0 });
    this.swings.push({ uid: h.uid, style, dir, sign, crit, t0: w.time, dur, x: h.x, y: h.y });
  }

  private nearFx(list: readonly Fx[], kind: Fx['kind'], x: number, y: number, r: number, color?: string): Fx | null {
    let best: Fx | null = null;
    let bd = r * r;
    for (const f of list) {
      if (f.kind !== kind || (color && f.color !== color)) continue;
      const d = (f.x - x) * (f.x - x) + (f.y - y) * (f.y - y);
      if (d <= bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  /** The impact for a shot that went through a foe ('pierce') or is gone ('end'). */
  private impactFor(w: World, t: Track, why: 'pierce' | 'end'): void {
    const h = t.hero ? this.heroBy(w, t.from) : null;
    const L = h ? this.lookOf(h, w.time) : COMMON;
    const core = t.kind === 'bolt' ? (t.color === '#b08aff' ? ARCANE : rampFrom(t.color)) : t.kind === 'orb' ? HOLY : t.kind === 'fire' ? FIRE : t.kind === 'bullet' ? dangerRamp(t.color) : STEEL;
    const dir = dirIndex(t.vx, t.vy, SHOT_DIRS);
    // The sim marked the foe it hit with a generic spark: this shot's own impact takes its place.
    const crit = this.nearFx(w.fx, 'crit', t.x, t.y, 16);
    const hit = crit ?? this.nearFx(w.fx, 'hit', t.x, t.y, 16);
    if (hit) w.fx.splice(w.fx.indexOf(hit), 1);
    if (why === 'pierce') {
      this.impacts.push({ kind: t.kind === 'bullet' ? 'pop' : t.kind === 'spear' ? 'pierce' : 'spark', look: L, core, size: crit ? 1.2 : 0.85, x: t.x, y: t.y, t0: w.time, dir });
      return;
    }
    // A splash: the sim's blast is replaced by this shot's own burst, the size of the splash.
    if (t.splash > 0) {
      const b = this.nearFx(w.fx, 'blast', t.x, t.y, 6, t.color);
      if (b) {
        w.fx.splice(w.fx.indexOf(b), 1);
        this.impacts.push({ kind: 'burst', look: L, core, size: Math.max(1, t.splash / 11) * (crit ? 1.2 : 1), x: b.x, y: b.y, t0: w.time, dir });
        this.burstSparks(b.x, b.y, core, L, crit ? 12 : 8);
        return;
      }
    }
    const wall = !hit && this.nearFx(w.fx, 'dust', t.x, t.y, 4, t.color);
    let kind: ImpactKind;
    let size = 1;
    if (hit) {
      kind = t.kind === 'bullet' ? 'pop' : t.kind === 'orb' ? 'holy' : t.kind === 'bolt' || t.kind === 'fire' ? 'burst' : t.kind === 'spear' ? 'pierce' : 'spark';
      size = (t.heavy ? 1.2 : 1) * (crit ? 1.4 : 1) * (t.boss ? 1.3 : 1);
      if (t.kind !== 'arrow' && t.kind !== 'spear') this.burstSparks(t.x, t.y, core, L, crit ? 7 : 4);
    } else if (wall) {
      kind = t.kind === 'bullet' || t.kind === 'bolt' || t.kind === 'orb' || t.kind === 'fire' ? 'pop' : 'wall';
      size = 0.8;
    } else kind = 'fizzle';
    this.impacts.push({ kind, look: L, core: kind === 'wall' ? DUST : core, size, x: t.x, y: t.y, t0: w.time, dir });
  }

  // ------------------------------------------------------------------ sparks and motes

  private burstSparks(x: number, y: number, core: Ramp, L: VfxLook, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 50;
      this.parts.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.8, 0.22 + Math.random() * 0.2, core[4], L.level >= 4 && i % 2 ? tone(L, 3) : core[3], core[2], i % 3 === 0 ? 1 : 0);
    }
  }

  /** What a shot sheds as it flies: a bolt's sparks, an orb's motes, a fireball's embers, the rarer arrows' glitter. */
  private trailSparks(w: World, t: Track, dt: number): void {
    t.emitT -= dt;
    if (t.emitT > 0) return;
    const h = t.hero ? this.heroBy(w, t.from) : null;
    const L = h ? this.lookOf(h, w.time) : COMMON;
    const r = Math.random;
    switch (t.kind) {
      case 'bolt': {
        t.emitT = 0.035;
        const c = L.level === 0 ? ARCANE : L.ramp;
        this.parts.spawn(t.x + (r() - 0.5) * 3, t.y + (r() - 0.5) * 3, -t.vx * 0.12 + (r() - 0.5) * 22, -t.vy * 0.12 + (r() - 0.5) * 22, 0.22 + r() * 0.18, c[4], c[3], c[2], 0);
        if (L.sparkles > 0 && r() < 0.35) this.parts.spawn(t.x, t.y, (r() - 0.5) * 30, (r() - 0.5) * 30, 0.4, tone(L, 4), L.accent, tone(L, 2), 1);
        break;
      }
      case 'orb': {
        t.emitT = 0.05;
        const c = L.level === 0 ? HOLY : L.ramp;
        this.parts.spawn(t.x + (r() - 0.5) * 6, t.y + (r() - 0.5) * 4, (r() - 0.5) * 6, -4 - r() * 6, 0.5 + r() * 0.3, HOLY[4], r() < 0.5 ? c[3] : HOLY[3], HOLY[2], r() < 0.3 ? 1 : 2);
        break;
      }
      case 'fire': {
        t.emitT = 0.03;
        this.parts.spawn(t.x + (r() - 0.5) * 4, t.y + (r() - 0.5) * 4, -t.vx * 0.2 + (r() - 0.5) * 16, -t.vy * 0.2 - 10 - r() * 14, 0.3 + r() * 0.25, FIRE[4], FIRE[3], FIRE[1], 2);
        break;
      }
      case 'arrow':
      case 'spear': {
        t.emitT = 0.045;
        if (L.sparkles <= 0) break;
        this.parts.spawn(t.x - t.vx * 0.02, t.y - t.vy * 0.02, (r() - 0.5) * 18, (r() - 0.5) * 18, 0.3 + r() * 0.2, tone(L, 4), L.rainbow ? tone(L, 3, r()) : L.accent, tone(L, 2), r() < 0.3 ? 1 : 0);
        break;
      }
      default:
        t.emitT = 1;
    }
  }

  // ------------------------------------------------------------------ drawing

  /** The swings and the channels, over the units (cx, cy: the view's top-left in world pixels). */
  drawSwings(w: World, ctx: Ctx, cx: number, cy: number): void {
    let j = 0;
    for (let i = 0; i < this.swings.length; i++) {
      const s = this.swings[i];
      const h = this.heroBy(w, s.uid);
      if (h) {
        s.x = h.x;
        s.y = h.y;
      }
      const u = (w.time - s.t0) / s.dur;
      if (u >= 1 || u < -0.05 || (h && h.downed)) continue;
      this.swings[j++] = s;
      const L = h ? this.lookOf(h, w.time) : COMMON;
      const frame = swingFrameAt(Math.max(0, u));
      const variant = SWING_STYLES.indexOf(s.style) + 16 * ((s.sign > 0 ? 1 : 0) + 2 * (s.crit ? 1 : 0));
      const p = this.sprite(key(K_SWING, L.id, s.dir, frame, variant), () => swingSprite(s.style, L, s.dir, s.sign, frame, s.crit));
      this.blit(p, Math.round(s.x) - cx, Math.round(s.y) - CHEST - cy, ctx);
    }
    this.swings.length = j;
    for (const h of w.heroes) {
      const c = h.channel;
      if (!c || h.downed) continue;
      const L = this.lookOf(h, w.time);
      const x = Math.round(h.x) - cx;
      const y = Math.round(h.y) - CHEST - cy;
      if (c.kind === 'whirlwind') {
        const dir = Math.floor(w.time * 2.2 * SWING_DIRS) % SWING_DIRS;
        const flick = Math.floor(w.time * 20) % 3;
        this.blit(this.sprite(key(K_WHIRL, L.id, dir, flick, 0), () => whirlSprite(L, dir, flick)), x, y, ctx);
      } else if (c.kind === 'lunge') {
        const dir = dirIndex(c.dx, c.dy, SWING_DIRS);
        const phase = Math.floor(w.time * 24) % 3;
        this.blit(this.sprite(key(K_LUNGE, L.id, dir, phase, 0), () => lungeSprite(L, dir, phase)), x, y, ctx);
      }
    }
  }

  /** Every shot in flight (skip: shots drawn elsewhere, the Stone Warden's stones). */
  drawShots(w: World, ctx: Ctx, cx: number, cy: number, W: number, H: number, skip: (s: Shot) => boolean): void {
    for (const s of w.shots) {
      if (skip(s)) continue;
      const x = Math.round(s.x) - cx;
      const y = Math.round(s.y) - cy;
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
      const t = this.tracks.get(s.uid);
      const h = s.team === 'hero' ? this.heroBy(w, s.from) : null;
      const L = h ? this.lookOf(h, w.time) : COMMON;
      const dir = dirIndex(s.vx, s.vy, SHOT_DIRS);
      const ph = Math.floor(w.time * 14 + (s.uid % 7));
      switch (s.kind) {
        case 'arrow': {
          const heavy = s.r >= 3 || !!s.pierce;
          const f = ph % 2;
          this.blit(this.sprite(key(K_ARROW, L.id, dir, f, heavy ? 1 : 0), () => arrowSprite(L, dir, heavy, f)), x, y, ctx);
          break;
        }
        case 'spear': {
          const small = s.r <= 2;
          const f = ph % 2;
          this.blit(this.sprite(key(K_SPEAR, L.id, dir, f, small ? 1 : 0), () => spearSprite(L, dir, small, f)), x, y, ctx);
          break;
        }
        case 'bolt': {
          const core = s.color === '#b08aff' ? ARCANE : rampFrom(s.color);
          if (t) this.trail(ctx, t, cx, cy, L.level === 0 ? core : L.ramp, core, Math.round(6 * L.trail), L.double);
          const f = ph % BOLT_FRAMES;
          this.blit(this.sprite(key(K_BOLT, L.id, 0, f, this.idOf(core)), () => boltSprite(L, f, core)), x, y, ctx);
          break;
        }
        case 'orb': {
          if (t) this.trail(ctx, t, cx, cy, L.level === 0 ? HOLY : L.ramp, HOLY, Math.round(3 * L.trail), L.double);
          const f = Math.floor(w.time * 10 + (s.uid % 5)) % ORB_FRAMES;
          this.blit(this.sprite(key(K_ORB, L.id, 0, f, 0), () => orbSprite(L, f)), x, y, ctx);
          break;
        }
        case 'fire': {
          if (t) this.trail(ctx, t, cx, cy, FIRE, FIRE, 6, false);
          const f = ph % FIRE_FRAMES;
          this.blit(this.sprite(key(K_FIRE, 0, dir, f, 0), () => fireSprite(f, dir)), x, y, ctx);
          break;
        }
        case 'bullet': {
          const big = !!w.bossUnit && w.bossUnit.uid === s.from;
          const f = Math.floor(w.time * 12 + (s.uid % 4)) % BULLET_FRAMES;
          this.blit(this.sprite(key(K_BULLET, this.idOf(s.color), dir, f, big ? 1 : 0), () => bulletSprite(s.color, dir, f, big)), x, y, ctx);
          break;
        }
        default: {
          const missing: never = s.kind;
          void missing;
        }
      }
    }
  }

  /**
   * A trail along a shot's real path (so a homing bolt's curve shows): the newest part bright and two
   * pixels thick, darker behind, dithered out at the end. `twin`: a second, thinner line weaving round it.
   */
  private trail(ctx: Ctx, t: Track, cx: number, cy: number, ramp: Ramp, core: Ramp, len: number, twin: boolean): void {
    const n = Math.min(t.n, len);
    if (n < 2) return;
    // Oldest first, so the brighter head is drawn over the tail.
    for (let i = n - 1; i >= 1; i--) {
      const j = (t.head - i + TRAIL) % TRAIL;
      const k = (t.head - i + 1 + TRAIL) % TRAIL;
      const qx = Math.round(t.xs[j]) - cx;
      const qy = Math.round(t.ys[j]) - cy;
      const px = Math.round(t.xs[k]) - cx;
      const py = Math.round(t.ys[k]) - cy;
      const u = i / n;
      // A comet: three pixels wide and hot at the head, thinning, dithered out at the end.
      const wide = u < 0.22 ? 3 : u < 0.5 ? 2 : 1;
      const col = u < 0.22 ? core[4] : u < 0.4 ? core[3] : u < 0.62 ? ramp[3] : u < 0.82 ? ramp[2] : ramp[1];
      const side = u < 0.4 ? ramp[3] : ramp[2];
      const flat = Math.abs(qx - px) >= Math.abs(qy - py);
      let x = px;
      let y = py;
      const dx = Math.abs(qx - px);
      const dy = -Math.abs(qy - py);
      const sx = px < qx ? 1 : -1;
      const sy = py < qy ? 1 : -1;
      let err = dx + dy;
      for (let g = 0; g < 64; g++) {
        if (!(u > 0.75 && (x + y) % 2)) {
          if (wide > 1) {
            ctx.fillStyle = side;
            if (flat) {
              ctx.fillRect(x, y + 1, 1, 1);
              if (wide > 2) ctx.fillRect(x, y - 1, 1, 1);
            } else {
              ctx.fillRect(x + 1, y, 1, 1);
              if (wide > 2) ctx.fillRect(x - 1, y, 1, 1);
            }
          }
          ctx.fillStyle = col;
          ctx.fillRect(x, y, 1, 1);
        }
        if (x === qx && y === qy) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y += sy;
        }
      }
      if (twin && i % 2 === 0) {
        // A second strand weaving round the first.
        const wob = Math.round(Math.sin(i * 1.1 + t.uid) * 2.5);
        ctx.fillStyle = ramp[4];
        if (flat) ctx.fillRect(qx, qy + wob, 1, 1);
        else ctx.fillRect(qx + wob, qy, 1, 1);
      }
    }
  }

  /** Impacts and the particles, over the shots. */
  drawImpacts(w: World, ctx: Ctx, cx: number, cy: number, W: number, H: number): void {
    let j = 0;
    for (let i = 0; i < this.impacts.length; i++) {
      const m = this.impacts[i];
      const f = Math.floor((w.time - m.t0) / IMPACT_FRAME_S);
      if (f >= IMPACT_FRAMES) continue;
      this.impacts[j++] = m;
      if (f < 0) continue;
      const x = Math.round(m.x) - cx;
      const y = Math.round(m.y) - cy;
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
      const bucket = Math.max(1, Math.min(15, Math.round(m.size * 5)));
      const variant = IMPACT_KINDS.indexOf(m.kind) + 16 * (bucket + 16 * Math.min(255, this.idOf(m.core)));
      const dir = m.kind === 'cut' || m.kind === 'pierce' ? m.dir : 0;
      const p = this.sprite(key(K_IMPACT, m.look.id, dir, f, variant), () => impactSprite(m.kind, m.look, m.core, bucket / 5, f, dir));
      this.blit(p, x, y, ctx);
    }
    this.impacts.length = j;
    this.parts.draw(ctx, cx, cy, W, H);
  }

}

function canvasOf(b: PixelBuf): HTMLCanvasElement {
  return toCanvas(b);
}
