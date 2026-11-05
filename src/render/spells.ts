/**
 * The knights' spells as the magic packs drew them (src/render/packs/magic.ts). It watches the world
 * (it never changes it) and plays a skill's own art where the skill goes off, in place of the generic
 * pack effect the renderer would play for that burst:
 *  - Meteor and Meteor Storm: a fireball falls onto each ring and goes off in a big explosion;
 *  - Singularity: a vortex opens over its spot, spins while it drags the foes in, and closes as it bursts;
 *  - Titan's Wrath: rock spikes burst out of the ground round the Guardian, and again with each aftershock;
 *  - Skyfall: molten spears come down round the Lancer where it lands;
 *  - Miracle: a pillar of holy light on every foe it strikes; Excalibur: rays of it down its line and
 *    a pillar on the last, biggest blast; Smite: a ray on its spot;
 *  - Frost Nova: ice cracks up out of the ground round the Arcanist.
 * Which skill a burst belongs to comes from its caster's last skill (Unit.lastSkill, as vfx.ts and the
 * knights' cast pose read it), the kind of burst and where it is: the sim knows nothing of this.
 * Times are the world's, so hit-stop and pauses hold the spells too.
 *
 * The bright ones (the meteor, the explosion, the vortex, holy light) go on the unlit top layer, crisp,
 * like the renderer's other bright effects. Rock, ice and the spears stand in the scene: sorted with
 * the units by where they meet the ground, and lit like it.
 */
import { SKILLS, type SkillId } from '../core/skillbook';
import type { Area, Fx } from '../world/entities';
import type { World } from '../world/world';
import { toCanvas } from './art/draw';
import { flipX } from './pixel/buf';
import { frameBuf } from './pixel/indexed';
import { MAGIC_SHEETS, type MagicName } from './packs/magic';

type Ctx = CanvasRenderingContext2D;

interface Cast {
  uid: number;
  skill: SkillId;
  at: number;
}

/** One effect playing at a spot. */
interface Play {
  name: MagicName;
  anim: string;
  x: number;
  y: number;
  /** World time it starts (a little later for the ones that follow each other). */
  t0: number;
  flip: boolean;
  /** Stands in the scene (sorted with the units, lit), rather than over everything. */
  stand: boolean;
}

/** How long a cast's bursts can still come (s): its beats still to come (a Miracle on 40 foes), and some slack. */
const CAST_WINDOW = 4;
/** A burst within this of its caster (px) is the caster's own (a quake, a landing). */
const NEAR = 10;
/** A meteor is seen for the last of its countdown (s), falling from this high over its spot (px). */
const FALL = 0.55;
const FALL_FROM = 120;
/** The vortex hangs this high over the Singularity's spot (px). */
const PORTAL_LIFT = 16;
/** Rings of art round a spot are drawn this flat, as the ground's rings are (entities.ts RING_Y). */
const FLAT = 0.6;
/**
 * Where Titan's Wrath's rocks burst, round the Guardian: [degrees (0 to its right, 90 in front of it,
 * toward the camera), share of the quake's radius]. The front corners sit out far enough to clear it.
 */
const QUAKE_RING: ReadonlyArray<readonly [number, number]> = [[270, 0.55], [205, 0.62], [335, 0.62], [150, 0.85], [30, 0.85]];
const AFTERSHOCK_RING: ReadonlyArray<readonly [number, number]> = [[270, 0.5], [150, 0.85], [30, 0.85]];

/** Seconds an animation lasts. */
function length(name: MagicName, anim: string): number {
  const a = MAGIC_SHEETS[name].anims[anim];
  return a.frames.length / a.fps;
}

/** Keeps the items `ok` passes, in order, in place. */
function keep<T>(list: T[], ok: (t: T) => boolean): void {
  let j = 0;
  for (const t of list) if (ok(t)) list[j++] = t;
  list.length = j;
}

export class Spells {
  private world: World | null = null;
  private casts: Cast[] = [];
  /** Each knight's last skill count seen (Unit.lastSkill.n). */
  private seen = new Map<number, number>();
  private plays: Play[] = [];
  /** The Singularity's areas (by uid): their spot, and when they went off (-1: not yet). */
  private portals = new Map<number, { x: number; y: number; gone: number }>();
  /** Areas seen, and the update that last saw each. */
  private areas = new Map<number, number>();
  private stamp = 0;
  private cache = new Map<string, HTMLCanvasElement>();

  /** What's playing (tests and the dev console). */
  playing(): ReadonlyArray<Readonly<{ name: MagicName; anim: string; x: number; y: number }>> {
    return this.plays;
  }

  /** Forgets everything (a new floor). */
  reset(): void {
    this.casts.length = 0;
    this.seen.clear();
    this.plays.length = 0;
    this.portals.clear();
    this.areas.clear();
  }

  /** Reads this frame's world: new casts, the Singularity's areas, effects that are over. Call before the rest. */
  update(w: World): void {
    if (this.world !== w) {
      this.reset();
      this.world = w;
    }
    const now = w.time;
    for (const h of w.heroes) {
      const s = h.lastSkill;
      const n = s?.n ?? 0;
      const was = this.seen.get(h.uid);
      this.seen.set(h.uid, n);
      // (A knight seen for the first time brings no cast: that one was before.)
      if (was === undefined || n === was || !s || w.rewind) continue;
      this.casts.push({ uid: h.uid, skill: s.skill, at: s.at });
    }
    keep(this.casts, (c) => now - c.at <= CAST_WINDOW && now >= c.at - 1);
    this.stamp++;
    for (const a of w.areas) {
      if (!this.areas.has(a.uid) && a.team === 'hero' && a.kind === 'blast' && a.delay > 0 && this.casting(w, a.from, 'singularity')) {
        this.portals.set(a.uid, { x: a.x, y: a.y, gone: -1 });
      }
      this.areas.set(a.uid, this.stamp);
    }
    for (const [uid, at] of this.areas) if (at !== this.stamp) this.areas.delete(uid);
    for (const [uid, p] of this.portals) {
      if (p.gone < 0 && !this.areas.has(uid)) p.gone = now;
      if (p.gone >= 0 && now - p.gone > 0.5) this.portals.delete(uid);
    }
    keep(this.plays, (p) => now - p.t0 < length(p.name, p.anim) && now >= p.t0 - 2);
  }

  /** Has the knight `uid` a cast of `skill` still going? */
  private casting(w: World, uid: number, skill: SkillId): boolean {
    return this.casts.some((c) => c.uid === uid && c.skill === skill) && w.heroes.some((u) => u.uid === uid);
  }

  /**
   * Is `f` the burst of a cast of `skill` still going? It's in the skill's color (skills.ts pushes its
   * bursts in it), and when `near`, within NEAR of its caster (a quake, a landing).
   */
  private mine(w: World, skill: SkillId, f: Fx, near: boolean): boolean {
    if (f.color !== SKILLS[skill].color) return false;
    for (const c of this.casts) {
      if (c.skill !== skill) continue;
      const h = w.heroes.find((u) => u.uid === c.uid);
      if (h && (!near || Math.hypot(h.x - f.x, h.y - f.y) <= NEAR)) return true;
    }
    return false;
  }

  private play(name: MagicName, anim: string, x: number, y: number, t0: number, flip = false, stand = false): void {
    this.plays.push({ name, anim, x, y, t0, flip, stand });
    if (this.plays.length > 120) this.plays.shift();
  }

  /**
   * A burst the sim pushed (w.fx): 'sheet' if a spell's own art took it (the renderer plays no pack
   * effect for it, but keeps its sparks), 'all' if it needs nothing else at all, null if it's not a spell's.
   */
  claim(f: Fx, w: World): 'sheet' | 'all' | null {
    if (f.kind !== 'blast' || w.rewind || this.world !== w) return null;
    const now = w.time;
    switch (f.src) {
      case 'meteor': {
        // A meteor landing, or the Lancer landing from Skyfall (skills.ts marks that one a meteor's too).
        if (this.mine(w, 'skyfall', f, true)) {
          // Six round the landing, none straight in front of the Lancer (its fire would hide it).
          const r = (f.size ?? 4) * 12 * 0.8;
          const n = 6;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            this.play('spear', 'play', f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * FLAT, now + i * 0.035, i % 2 === 1, true);
          }
          return 'sheet';
        }
        this.play('explosion', 'play', f.x, f.y, now);
        return 'sheet';
      }
      case 'slam': {
        if (this.mine(w, 'titansWrath', f, true)) {
          // Rock bursts round the Guardian on the quake's ring (the aftershocks' are smaller), turned a
          // little each time: behind it and to its sides, never straight in front (they'd bury it).
          const r = (f.size ?? 4) * 14;
          const turn = (Math.random() - 0.5) * 0.35;
          (r >= 64 ? QUAKE_RING : AFTERSHOCK_RING).forEach(([deg, k], i) => {
            const a = (deg * Math.PI) / 180 + turn;
            this.play('quake', 'play', f.x + Math.cos(a) * r * k, f.y + Math.sin(a) * r * k * FLAT, now + i * 0.03, i % 2 === 1, true);
          });
          return 'all';
        }
        if (this.mine(w, 'frostNova', f, true)) {
          // A ring of ice shards, each leaning away from the Arcanist (the art leans left).
          const r = (f.size ?? 3) * 14;
          const n = 8;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.PI / n;
            this.play('frost', 'play', f.x + Math.cos(a) * r * 0.8, f.y + Math.sin(a) * r * 0.8 * FLAT, now + (i % 2) * 0.04, Math.cos(a) > 0, true);
          }
          return 'sheet';
        }
        return null;
      }
      case undefined: {
        if (this.mine(w, 'miracle', f, false)) {
          this.play('pillar', 'play', f.x, f.y, now);
          return 'sheet';
        }
        if (this.mine(w, 'smite', f, false)) {
          this.play('pillar', 'ray', f.x, f.y, now);
          return 'sheet';
        }
        // Excalibur's line: a ray of light at each blast, a whole pillar at the last and biggest.
        if (this.mine(w, 'excalibur', f, false)) {
          this.play('pillar', (f.size ?? 1) >= 2 ? 'play' : 'ray', f.x, f.y, now);
          return 'sheet';
        }
        // The Singularity bursting: its vortex has just closed (drawArea), no fireball.
        for (const p of this.portals.values()) if (p.gone >= 0 && Math.hypot(p.x - f.x, p.y - f.y) < 2) return 'sheet';
        return null;
      }
      default:
        return null;
    }
  }

  /** The art an area counting down is drawn with: a meteor falling onto it, the Singularity's vortex over it (null: none). */
  areaArt(a: Area): 'meteor' | 'portal' | null {
    if (a.delay <= 0) return null;
    if (a.kind === 'meteor') return 'meteor';
    return this.portals.has(a.uid) ? 'portal' : null;
  }

  /** An area counting down, at (x, y) on the screen: its art (areaArt), on `top`. */
  drawArea(a: Area, top: Ctx, x: number, y: number): void {
    const art = this.areaArt(a);
    if (art === 'meteor') {
      if (a.delay > FALL) return;
      // Faster as it comes down.
      const p = 1 - a.delay / FALL;
      const lift = Math.round(FALL_FROM * (1 - p * p));
      const s = MAGIC_SHEETS.meteor;
      const fall = s.anims.fall;
      const i = Math.floor(a.t * fall.fps + (a.uid % 5)) % fall.frames.length;
      top.drawImage(this.canvas('meteor', fall.frames[i], false), x - s.anchor.x, y - lift - s.anchor.y);
      return;
    }
    if (art !== 'portal') return;
    const s = MAGIC_SHEETS.portal;
    const { open, spin, close } = s.anims;
    const closing = length('portal', 'close');
    let f: number;
    if (a.delay <= closing) f = close.frames[Math.min(close.frames.length - 1, Math.floor((closing - a.delay) * close.fps))];
    else if (a.t < length('portal', 'open')) f = open.frames[Math.floor(a.t * open.fps)];
    else f = spin.frames[Math.floor((a.t - length('portal', 'open')) * spin.fps) % spin.frames.length];
    top.drawImage(this.canvas('portal', f, false), x - s.anchor.x, y - PORTAL_LIFT - s.anchor.y);
  }

  /**
   * The effects that stand in the scene, for the renderer's sort by feet: each draws itself on `ctx`,
   * and its mask on `cap`, so the dark never sinks it below what the characters get (they keep their
   * colors the same way).
   */
  standing(w: World, ctx: Ctx, cap: Ctx, sx: (x: number) => number, sy: (y: number) => number, out: Array<{ y: number; draw: () => void }>): void {
    if (this.world !== w) return;
    for (const p of this.plays) {
      if (p.stand && w.time >= p.t0) {
        out.push({
          y: p.y,
          draw: () => {
            this.drawPlay(ctx, p, w.time, sx, sy);
            this.drawPlay(cap, p, w.time, sx, sy);
          },
        });
      }
    }
  }

  /** The rest, over everything (the unlit top layer). */
  drawTop(w: World, ctx: Ctx, sx: (x: number) => number, sy: (y: number) => number): void {
    if (this.world !== w) return;
    for (const p of this.plays) if (!p.stand) this.drawPlay(ctx, p, w.time, sx, sy);
  }

  private drawPlay(ctx: Ctx, p: Play, time: number, sx: (x: number) => number, sy: (y: number) => number): void {
    const s = MAGIC_SHEETS[p.name];
    const a = s.anims[p.anim];
    let i = Math.floor((time - p.t0) * a.fps);
    if (i < 0) return;
    if (a.loop) i %= a.frames.length;
    else if (i >= a.frames.length) return;
    const ax = p.flip ? s.w - 1 - s.anchor.x : s.anchor.x;
    ctx.drawImage(this.canvas(p.name, a.frames[i], p.flip), sx(p.x) - ax, sy(p.y) - s.anchor.y);
  }

  private canvas(name: MagicName, frame: number, flip: boolean): HTMLCanvasElement {
    const key = `${name}|${frame}|${flip ? 1 : 0}`;
    let c = this.cache.get(key);
    if (!c) {
      const b = frameBuf(MAGIC_SHEETS[name], frame);
      c = toCanvas(flip ? flipX(b) : b);
      this.cache.set(key, c);
    }
    return c;
  }
}
