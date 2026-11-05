/**
 * Hears the fight. Every frame, after the world's update and before the renderer takes its effects,
 * it reads what happened on the floor and turns it into the fight's sounds (catalog.ts), each where
 * it happened:
 *
 * - The effects the world asked the renderer for (World.fx): hits and crits (the foe's sound by what
 *   it's made of; a knight's hurt), blasts (by their kind and size; a boulder and a big leap's landing
 *   thump like a slam), lightning, shockwaves, heals.
 * - What changed about each knight and foe since the last frame: an attack (each class its own), a
 *   dodge, a fall, getting back up; a foe winding up, its move going off, a dash, a leap or a charge
 *   going, a death, a boss's rage.
 * - Shots appearing (a foe's shot or spit) and stopping (an arrow's thunk, an arcane bolt's pop).
 * - The skill rolls (`skill`, from onSkillRoll): the reel's ticks as it spins and brakes, its landing
 *   by tier, the skill's own sound. What the skill draws as it fires is its sound's (no blast on top);
 *   its hits, and its later beats, sound through the fight as usual.
 *
 * Several of one sound in a frame play once, a little bigger, from the one nearest your knight. It
 * only reads the world; nothing in the world knows it's there.
 */
import { tierStep } from '../core/skillbook';
import { COLORS } from '../world/chance';
import type { Fx, Shot, Unit } from '../world/entities';
import type { MobType } from '../world/mobgen';
import type { SkillRollEvent } from '../world/skills';
import type { World } from '../world/world';
import { landCue, skillCue, type FightCue, type Prio } from './catalog';
import type { CueOpts } from './mixer';

/** What a foe is made of, as far as its sound goes. */
export type Material = 'flesh' | 'slime' | 'bone' | 'stone' | 'shell' | 'wood' | 'ghost';

export type Emit = (cue: FightCue, o: CueOpts) => void;

/** The color World.damage gives a knight's hit. */
const HERO_HIT = '#ff5a5a';
/** Where the art draws skeletons for humanoids (render/pf/mobLook.ts), and bosses that keep their own art (not the Stone Warden). */
const BONE_BIOMES = new Set(['crypt', 'graveyard', 'desert']);
const OWN_BOSS = new Set(['pig', 'ram', 'chicken', 'ghost', 'pumpkin', 'bug', 'plant']);
/** Foes that swing a weapon (or a claw) rather than bite. */
const SWINGERS = new Set(['humanoid', 'ghost']);

/** What a foe of this design is made of (following what the art draws it as). */
export function materialOf(t: MobType, boss = false): Material {
  if (t.id.includes('-demon-')) return 'flesh';
  if (boss && !OWN_BOSS.has(t.plan)) return 'stone';
  const biome = t.id.split('-')[0];
  switch (t.plan) {
    case 'slime':
      return 'slime';
    case 'golem':
      return 'stone';
    case 'bug':
      return 'shell';
    case 'plant':
    case 'pumpkin':
      return 'wood';
    case 'ghost':
      return 'ghost';
    case 'humanoid':
      if (biome === 'farmland') return 'wood';
      if (t.behavior !== 'ranged' && t.behavior !== 'caster' && BONE_BIOMES.has(biome)) return 'bone';
      return 'flesh';
    default:
      return 'flesh';
  }
}

export const hitCue = (m: Material): FightCue => `hit_${m}`;
export const deathCue = (m: Material): FightCue => `death_${m}`;

/** Each class's dash (world/dash.ts); the Ranger's by which way it went (at a foe: its Power Shot sounds later). */
const DASH: Record<string, FightCue> = { guardian: 'dash_bash', blade: 'dash_shadow', cleric: 'dash_bless', arcanist: 'dash_blink', lancer: 'dash_lunge' };

function dashCue(h: Unit): FightCue {
  if (h.cls === 'ranger') return h.rolling?.kind === 'flip' ? 'dash_snare' : 'knight_dodge';
  return (h.cls && DASH[h.cls]) || 'knight_dodge';
}

/** The marks a dash leaves (Fx `src`), heard as they happen. */
const DASH_MARK: Readonly<Partial<Record<string, FightCue>>> = { bash: 'dash_bash_hit', shot: 'dash_shot', snare: 'snare_snap' };

const ATTACK: Record<string, FightCue> = {
  guardian: 'atk_shield',
  blade: 'atk_sword',
  lancer: 'atk_spear',
  ranger: 'atk_bow',
  arcanist: 'atk_arcane',
  cleric: 'atk_holy',
};

/** A foe's pitch: bigger ones lower. */
function pitchOf(u: Unit): number {
  const size = (u.type?.size ?? 1) * (u.elite ? 1.25 : 1) * (u.boss ? 1.7 : 1);
  return 1 / Math.pow(size, 0.6);
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ------------------------------------------------------------------ the skill reel
/** The skill reel as the HUD draws it (ui/SkillRoll.tsx): cells to the result, the kick back, the brake. */
const RESULT = 8;
const KICK = 0.08;
/** How far ahead (s) the reel's ticks are scheduled. */
const AHEAD = 0.1;

/** How far through a roll (0 to 1) cell `n` passes the line, braking with `k`. */
export function cellAt(n: number, k: number): number {
  const p = Math.min(RESULT - 1e-6, n - 0.5) / RESULT;
  return KICK + (1 - KICK) * (1 - Math.pow(1 - p, 1 / k));
}

/** How hard a reel brakes for a result of this tier step (rarer creeps in slower). */
export const brakeFor = (step: number) => (step >= 3 ? 3.4 : step >= 2 ? 2.8 : 2.2);

interface Reel {
  k: number;
  step: number;
  next: number;
}

interface Memo {
  hp: number;
  atkT: number;
  dodgeT: number;
  down: boolean;
  windT: number;
  move?: string;
  swingT: number;
  /** Mid-dash or mid-leap (a charge is a dash). */
  rush: boolean;
  phase: number;
}

interface Pend {
  n: number;
  x: number;
  y: number;
  o: CueOpts;
  level: number;
  rank: number;
}

const memoOf = (u: Unit): Memo => ({
  hp: u.hp,
  atkT: u.atkT ?? 0,
  dodgeT: u.dodgeT ?? 0,
  down: u.team === 'hero' ? !!u.downed : u.dead,
  windT: u.windT ?? 0,
  move: u.move,
  swingT: u.swingT,
  rush: !!u.rush,
  phase: u.bossPhase ?? 0,
});

export class FightObserver {
  private w: World | null = null;
  private memo = new Map<number, Memo>();
  private shots = new Map<number, Shot>();
  private seen = new WeakSet<object>();
  private reels = new Map<number, Reel>();
  private pend = new Map<FightCue, Pend>();
  private killStreak = 0;
  private lastKillAt = -1e9;
  private lx = 0;
  private ly = 0;

  constructor(private readonly emit: Emit) {}

  /** A frame of the floor `w` (null away from the dungeon). The first frame of a floor only looks. */
  frame(w: World | null): void {
    if (w !== this.w) {
      this.attach(w);
      return;
    }
    if (!w) return;
    const lead = w.leader();
    this.lx = lead?.x ?? w.map.start.x;
    this.ly = lead?.y ?? w.map.start.y;
    const bolts = this.shotsFrame(w);
    for (const f of w.fx) {
      if (this.seen.has(f)) continue;
      this.seen.add(f);
      this.fx(w, f, bolts);
    }
    for (const h of w.heroes) this.hero(w, h);
    for (const m of w.mobs) this.mob(w, m);
    this.spin(w);
    this.flush();
  }

  /** A skill roll starting or landing (onSkillRoll). */
  skill(e: SkillRollEvent): void {
    const w = e.world;
    if (w !== this.w) return;
    const h = e.hero;
    const mine = h.slot === w.controlled;
    const step = tierStep(e.skill.tier);
    if (e.phase === 'start') {
      this.reels.set(h.uid, { k: brakeFor(step), step, next: 1 });
      this.emit('skill_roll_start', { x: h.x, y: h.y, gain: mine ? 1 : 0.55, prio: mine ? 2 : 1 });
      return;
    }
    const lesser: Prio = step >= 3 ? 2 : 1;
    if (e.phase === 'reveal') {
      // The reel stopped on its skill (it slams down and fires a moment later).
      this.reels.delete(h.uid);
      this.emit(landCue(e.skill.tier), { x: h.x, y: h.y, gain: mine ? 1 : 0.7, ...(mine ? {} : { prio: lesser }) });
      return;
    }
    // It slammed down and the skill fired just now: what it drew as it fired is its sound's.
    this.reels.delete(h.uid);
    for (const f of w.fx) if (f.kind !== 'hit' && f.kind !== 'crit') this.seen.add(f);
    this.emit(skillCue(e.skill.id), { x: h.x, y: h.y, gain: mine ? 1 : 0.8, delay: 0.02, ...(mine ? {} : { prio: lesser }) });
  }

  // ------------------------------------------------------------------ inside
  /** A new floor (or none): remember how everything stands, play nothing. */
  private attach(w: World | null): void {
    this.w = w;
    this.memo.clear();
    this.shots.clear();
    this.reels.clear();
    this.pend.clear();
    this.seen = new WeakSet();
    this.killStreak = 0;
    if (!w) return;
    for (const u of [...w.heroes, ...w.mobs]) this.memo.set(u.uid, memoOf(u));
    for (const s of w.shots) this.shots.set(s.uid, s);
    for (const f of w.fx) this.seen.add(f);
  }

  /** Queues a sound for this frame; several of one sound play once, from the most important (then nearest). */
  private add(cue: FightCue, at: { x: number; y: number }, o: CueOpts = {}): void {
    const d = Math.hypot(at.x - this.lx, at.y - this.ly);
    const rank = (o.prio ?? 1) * 1e4 - d;
    const level = o.level ?? 0.5;
    const cur = this.pend.get(cue);
    if (!cur) {
      this.pend.set(cue, { n: 1, x: at.x, y: at.y, o, level, rank });
      return;
    }
    cur.n++;
    cur.level = Math.max(cur.level, level);
    if (rank > cur.rank) Object.assign(cur, { x: at.x, y: at.y, o, rank });
  }

  private flush(): void {
    for (const [cue, p] of this.pend) {
      const more = Math.min(4, p.n - 1);
      this.emit(cue, { ...p.o, x: p.x, y: p.y, level: clamp01(p.level + more * 0.1), gain: (p.o.gain ?? 1) * (1 + more * 0.1) });
    }
    this.pend.clear();
  }

  /** Shots this frame: a foe's new shots (one sound a shooter), the knights' that stopped. Returns the arcane bolts that stopped (they burst). */
  private shotsFrame(w: World): Shot[] {
    const now = new Map<number, Shot>();
    for (const s of w.shots) now.set(s.uid, s);
    const bolts: Shot[] = [];
    for (const [id, s] of this.shots) {
      if (now.has(id) || s.team !== 'hero') continue;
      // Stopped by something (a foe, a wall) rather than flying out: it was set to exactly 0.
      const struck = s.life >= 0;
      if (struck && (s.kind === 'arrow' || s.kind === 'spear')) this.add('arrow_thunk', s);
      if (s.kind === 'bolt' && s.splash) bolts.push(s);
    }
    const volleys = new Map<number, { n: number; x: number; y: number }>();
    for (const s of w.shots) {
      if (this.shots.has(s.uid) || s.team !== 'mob') continue;
      const v = volleys.get(s.from);
      if (v) v.n++;
      else volleys.set(s.from, { n: 1, x: s.x, y: s.y });
    }
    for (const [from, v] of volleys) {
      const m = w.mobs.find((u) => u.uid === from);
      const big = v.n >= 3 || !!m?.boss;
      this.add('mob_shot', v, { level: big ? 1 : 0.3, pitch: m ? pitchOf(m) : 1, prio: big ? 1 : 0 });
    }
    this.shots = now;
    return bolts;
  }

  private fx(w: World, f: Fx, bolts: Shot[]): void {
    const size = f.size ?? 1;
    switch (f.kind) {
      case 'hit':
      case 'crit':
        return this.hit(w, f);
      case 'spark': {
        // A dash's mark: a foe bashed aside, the Power Shot loosed, a snare snapping shut.
        const cue = f.src ? DASH_MARK[f.src] : undefined;
        if (cue) this.add(cue, f);
        return;
      }
      case 'blast':
        if (f.src === 'meteor') return this.add('boom_meteor', f, { level: clamp01((size - 1.5) / 3) });
        if (f.src === 'bomb') return this.add('boom_bomb', f, { level: clamp01((size - 1) / 2) });
        if (f.src === 'slam') return this.add('boom_slam', f, { level: clamp01((size - 1) / 3), ...(size >= 3 ? { prio: 2 as Prio } : {}) });
        // An ogre's boulder coming down.
        if (f.src === 'boulder') return this.add('boom_slam', f, { level: clamp01((size - 1) / 3) });
        // An arcane bolt bursting where it stopped.
        if (bolts.some((s) => Math.abs(s.x - f.x) < 0.5 && Math.abs(s.y - f.y) < 0.5)) return this.add('arcane_pop', f);
        if (size >= 2) return this.add('boom_big', f, { level: clamp01((size - 2) / 2) });
        return this.add('boom_small', f, { level: clamp01(size - 1) });
      case 'shock':
        return this.add(f.src === 'taunt' ? 'shockwave' : 'zap', f, { level: clamp01((size - 1) / 5) });
      case 'heal':
        return this.add('heal', f);
      case 'revive':
        return this.add('revive', f);
      case 'land':
        // A big leap coming down (an ogre's slam, a boss's): the ground thumps.
        if (size >= 2) return this.add('boom_slam', f, { level: clamp01((size - 2) / 3) });
        return;
      default:
        return;
    }
  }

  /** The unit a hit or crit effect is on: the one there whose color it wears (a foe's ramp, a knight's red). */
  private target(w: World, f: Fx): Unit | null {
    let best: Unit | null = null;
    let bd = 24;
    const look = (u: Unit) => {
      const d = Math.abs(u.x - f.x) + Math.abs(u.y - 6 - f.y);
      if (d < bd) {
        bd = d;
        best = u;
      }
    };
    for (const m of w.mobs) if (m.type?.ramp[2] === f.color) look(m);
    if (f.color === HERO_HIT) for (const h of w.heroes) look(h);
    return best;
  }

  private hit(w: World, f: Fx): void {
    const u = this.target(w, f);
    if (!u) {
      // A flourish on top of a hit (a skill's own spark) is the skill's; a LUCKY hit has its own ping.
      if (f.kind === 'crit' && f.color === COLORS.lucky) this.add('lucky_hit', f);
      return;
    }
    const before = this.memo.get(u.uid);
    const lost = before ? Math.max(0, before.hp - Math.max(0, u.hp)) / Math.max(1, u.maxHp) : 0.15;
    if (u.team === 'hero') {
      const mine = u.slot === w.controlled;
      const shield = u.drT > 0 && u.dr < 1;
      this.add(shield ? 'knight_block' : 'knight_hurt', u, { level: clamp01(lost * 3), prio: mine ? 2 : 1, gain: mine ? 1 : 0.7 });
      return;
    }
    const mat = materialOf(u.type!, !!u.boss);
    this.add(hitCue(mat), u, { level: clamp01(0.25 + lost * 2.5), pitch: pitchOf(u) });
    if (f.kind === 'crit') this.add('crit', u, { level: clamp01(lost * 3) });
  }

  private hero(w: World, h: Unit): void {
    const was = this.memo.get(h.uid);
    this.memo.set(h.uid, memoOf(h));
    if (!was) return;
    const mine = h.slot === w.controlled;
    if (!was.down && h.downed) this.add('knight_down', h, { level: 1 });
    else if (was.down && !h.downed) this.add('revive', h);
    if (h.downed) return;
    // An attack: its cooldown starts again (a skill's swing doesn't touch it).
    if ((h.atkT ?? 0) > was.atkT + 1e-6 && h.cls && ATTACK[h.cls]) this.add(ATTACK[h.cls], h, { prio: mine ? 1 : 0, gain: mine ? 1 : 0.6 });
    // A dash (each class its own: world/dash.ts): its cooldown starts again.
    if ((h.dodgeT ?? 0) > was.dodgeT + 1e-6) this.add(dashCue(h), h, { gain: mine ? 1 : 0.6 });
  }

  private mob(w: World, m: Unit): void {
    const was = this.memo.get(m.uid);
    this.memo.set(m.uid, memoOf(m));
    if (!was) {
      // (Born and felled within the frame.)
      if (m.dead) this.death(w, m, null);
      return;
    }
    if (!was.down && m.dead) return this.death(w, m, was);
    if (m.dead) return;
    const pitch = pitchOf(m);
    const windT = m.windT ?? 0;
    // A wind-up starting: the telegraph.
    if (was.windT <= 0 && windT > 0) this.windup(m, pitch);
    // The move going off (it swings; a wind-up cut short by a stun or a fumble doesn't).
    if (was.windT > 0 && windT <= 0 && m.swingT > was.swingT + 1e-6) this.move(m, was.move, pitch);
    if (!was.rush && m.rush) this.lunge(m, pitch);
    if (m.boss && was.phase === 0 && (m.bossPhase ?? 0) > 0) this.add('boss_enrage', m, { pitch: Math.max(0.7, pitch) });
  }

  private windup(m: Unit, pitch: number): void {
    if (m.boss) return this.add('boss_windup', m, { pitch: Math.max(0.6, pitch * 1.3) });
    switch (m.move) {
      case 'charge':
        return this.add('mob_charge_windup', m, { pitch });
      case 'slam':
      // (An ogre heaving up a boulder, or crouching to leap and slam.)
      case 'throw':
        return this.add('mob_slam_windup', m, { pitch });
      case 'leap':
        if (m.type?.behavior === 'tank') return this.add('mob_slam_windup', m, { pitch });
        // A pounce or a hop sounds as it goes (lunge below).
        return;
      case 'bomb':
        return this.add('mob_fuse', m);
      case 'cast':
        return this.add('mob_cast', m);
      default:
        // Bites and shots sound as they go off.
        return;
    }
  }

  private move(m: Unit, move: string | undefined, pitch: number): void {
    switch (move) {
      case 'bite':
        return this.add(SWINGERS.has(m.type?.plan ?? '') ? 'mob_swipe' : 'mob_bite', m, { pitch });
      case 'summon':
        return this.add('boss_summon', m, { pitch: Math.max(0.6, pitch * 1.3) });
      case 'throw':
        // (The boulder sounds as it comes down: boom_slam.)
        return this.add('mob_swipe', m, { pitch: pitch * 0.8 });
      case undefined:
      case 'shoot':
      case 'cast':
      case 'charge':
      case 'dash':
      case 'leap':
      case 'bomb':
      case 'slam':
      case 'ring':
      case 'fan':
      case 'rain':
        // Their shots, circles, rushes (lunge below) and blasts sound on their own.
        return;
      default:
        // A kind of attack without a sound of its own yet.
        return this.add('mob_swipe', m, { pitch });
    }
  }

  /**
   * A dash or a leap going (mobgen.ts LUNGES): a charge gallops, a boss's rush the loudest; the rest
   * swipe or snap as they go, like the bite or the swing they are.
   */
  private lunge(m: Unit, pitch: number): void {
    const r = m.rush!;
    if (r.move === 'charge') return this.add('mob_charge', m, { pitch, level: m.boss ? 1 : 0.4, ...(m.boss ? { prio: 2 as Prio } : {}) });
    if (m.boss) return this.add('mob_charge', m, { pitch, level: 0.8, prio: 2 });
    this.add(SWINGERS.has(m.type?.plan ?? '') || r.kind === 'dash' ? 'mob_swipe' : 'mob_bite', m, { pitch });
  }

  private death(w: World, m: Unit, was: Memo | null): void {
    // A bomber that went up in its own blast is that blast.
    if (was?.move === 'bomb' && m.swingT > was.swingT + 1e-6) return;
    const t = m.type;
    if (!t) return;
    const prio: Prio = m.boss ? 3 : m.elite ? 2 : 1;
    this.add(deathCue(materialOf(t, !!m.boss)), m, { level: m.boss ? 1 : m.elite ? 0.7 : 0.35, pitch: pitchOf(m), prio });
    this.killStreak = w.time - this.lastKillAt < 2.5 ? Math.min(7, this.killStreak + 1) : 0;
    this.lastKillAt = w.time;
    if (this.killStreak > 0) this.add('kill_chime', m, { step: this.killStreak, prio: 0 });
  }

  /** The skill reels spinning: each cell passing the line ticks, scheduled from where the roll is now. */
  private spin(w: World): void {
    for (const h of w.heroes) {
      const r = h.skillRoll;
      const reel = this.reels.get(h.uid);
      if (!r || !reel) continue;
      const mine = h.slot === w.controlled;
      while (reel.next <= RESULT) {
        const ahead = cellAt(reel.next, reel.k) * r.dur - r.t;
        if (ahead > AHEAD) break;
        if (ahead >= -0.04) {
          // Climbing as it slows; the last two cells before a rare result climb on, with a glint.
          const near = reel.next >= RESULT - 1 && reel.step >= 2;
          // (Your reel's ticks are never lost in a crowd: a reel with holes in it sounds broken.)
          this.emit('skill_roll_spin', { x: h.x, y: h.y, delay: Math.max(0, ahead), level: reel.next / RESULT, step: near ? reel.step * 2 : 0, gain: mine ? 1 : 0.5, prio: mine ? 2 : 1 });
        }
        reel.next++;
      }
    }
  }
}
