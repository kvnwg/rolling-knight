/**
 * Which PixelForge frame a mob shows, read from the sim every frame (nothing here changes the sim).
 * The mob's attack plays over the game's own timing: its windup frames are stretched over the
 * wind-up (windT counting down from windDur: the telegraph the game already gives), the strike frame
 * shows on the tick the sim deals the hit (swingT jumps), then the recovery plays. Lunges (ai.ts) use
 * frames the sheets already have: the crouch is the lunge's windup frames, a dash holds its strike
 * frame (a goblin's stab, a skeleton's thrust, a bat's dive) or runs (a charge: a wolf's run, an orc's
 * stride, the Stone Warden's rush frames), a leap holds a frame in the air (an ogre's club overhead, a
 * slime stretched tall, a wolf crouched then biting) and lands on the strike frame. The renderer moves
 * the whole body on top (mobMotion.ts: the crouch, the arc, the squash). Bosses play the move they
 * wind up (ring, fan, charge, slam, summon, rain, leap; the Stone Warden's own moves, the Cinderwyrm's
 * roar, breath, bite and tail) and roar when they enrage. Waking, a wolf howls (its rings rising off
 * its muzzle) and an ogre roars, over the moment it takes to rise into the fight. Quick movers run
 * (a wolf, an orc or a skeleton at a sprint). Deaths play out after the sim has let go of the mob
 * (see the renderer's corpses).
 *
 * The supplied packs' monsters (the dark biomes' skeletons and vampire, the slime) are side views:
 * their sheets draw east and west only, so a mob going up or down keeps facing the way the sim says
 * it faces (toward its target). Their attacks bring their own slash smears, and the strike (the hit's
 * tick) is the frame the smear lands on. Their deaths end lying on the floor (a heap of bones, ash, a
 * puddle), held a moment before they fade, with no puff of smoke.
 */
import type { Unit } from '../../world/entities';
import type { World } from '../../world/world';
import { SHEETS, type SheetName } from './assets';
import { travelDir } from './heroAnim';
import { MONSTER_SHEET, type MonsterId } from './mobLook';
import { clipMs, eventFrame, facing, RUN_MIN_FRAME, WALK_MIN_FRAME, walkPace, type Dir, type FrameRef, type PFSheet } from './sheet';

/** Seconds a foe takes to rise into a fight (world.ts SPAWN_IN). */
const RISE = 0.6;

/** Each monster's animations for the game's moves, and how far its walk cycle carries it (px). */
interface Kit {
  walk: string;
  /** px per walk cycle (feet planted), or 0 to play the walk by time (flyers). */
  cycle: number;
  run?: string;
  runCycle?: number;
  melee: string;
  ranged?: string;
  bomb?: string;
  death: string;
  stun?: string;
  /** A lunge's anim (its crouch, its flight and its landing); the melee's when left out. */
  lunge?: string;
  /** What a dash shows: the lunge's strike frame held, or its gait run fast ('run'); by default a charge runs and a dash holds. */
  dash?: 'hold' | 'run';
  /** What it plays as it wakes and rises into the fight (a wolf's howl, an ogre's roar). */
  wake?: string;
  /** A boss's roar at half HP (the Stone Warden's 'enrage' by default). */
  enrage?: string;
  /** The lunge anim's frame a leap holds in the air; by default its last windup frame going up and its strike frame coming down. */
  air?: number;
  /** A throw's anim (its raise over the wind-up, its release). */
  throw?: string;
  /** ms the death's last frame is held before it fades. */
  linger?: number;
  /** The FX at the death's end (PixelForge's), or null for none; default by monster. */
  poof?: SheetName | null;
}

const KITS: Record<MonsterId, Kit> = {
  slime: { walk: 'move', cycle: 14, melee: 'attack_slam', ranged: 'attack_spit', bomb: 'attack_spit', death: 'death', lunge: 'attack_slam', air: 2 },
  bat: { walk: 'idle', cycle: 0, melee: 'attack_swoop', death: 'death', lunge: 'attack_swoop' },
  wolf: { walk: 'walk', cycle: 11, run: 'run', runCycle: 22, melee: 'attack_bite', death: 'death', lunge: 'attack_bite', wake: 'howl' },
  frost_wolf: { walk: 'walk', cycle: 11, run: 'run', runCycle: 22, melee: 'attack_bite', death: 'death', lunge: 'attack_bite', wake: 'howl' },
  goblin: { walk: 'walk', cycle: 7, melee: 'attack_slash', death: 'death', lunge: 'attack_slash' },
  goblin_chief: { walk: 'walk', cycle: 7, melee: 'attack_slash', death: 'death', lunge: 'attack_slash' },
  goblin_archer: { walk: 'walk', cycle: 7, melee: 'shoot_bow', ranged: 'shoot_bow', death: 'death' },
  // (PixelForge's humanoids walk 12 px a cycle and run 30.)
  orc: { walk: 'walk', cycle: 12, run: 'run', runCycle: 30, melee: 'attack_slash', death: 'death', stun: 'stun', lunge: 'attack_heavy', dash: 'run' },
  skeleton: { walk: 'walk', cycle: 12, run: 'run', runCycle: 30, melee: 'attack_slash', death: 'death_crumble', stun: 'stun', lunge: 'attack_slash' },
  ogre: { walk: 'walk', cycle: 15, melee: 'attack_heavy', death: 'death', lunge: 'attack_heavy', throw: 'attack_heavy', wake: 'roar' },
  stone_warden: { walk: 'walk', cycle: 16, melee: 'attack_slam', death: 'death' },
  // The Ember Depths' boss: a slow dragon that bites, sweeps its tail, breathes fire and roars.
  cinderwyrm: { walk: 'walk', cycle: 30, melee: 'attack_bite', ranged: 'breath', death: 'death', lunge: 'attack_bite', dash: 'hold', enrage: 'roar', linger: 300 },
  // A quick elite of the later floors: its glaive sweeps, it lunges with the glaive out in front.
  ashen_duelist: { walk: 'walk', cycle: 24, melee: 'attack_slash', ranged: 'attack_slash', death: 'death', lunge: 'attack_lunge' },
  // The dark halls' boss: a greatsword's two-hit slash up close, a charge that loops and cuts past, a
  // leaping slam; he dies on one knee and stays there a moment.
  rook: { walk: 'walk', cycle: 32, melee: 'attack_slash', ranged: 'attack_fan', death: 'death', lunge: 'charge', enrage: 'enrage', linger: 900 },
  pk_skeleton: { walk: 'walk', cycle: 22, melee: 'attack', death: 'death', linger: 1100, poof: null },
  pk_reaper: { walk: 'walk', cycle: 22, melee: 'attack', death: 'death', linger: 1100, poof: null },
  pk_vampire: { walk: 'walk', cycle: 18, melee: 'attack', death: 'death', linger: 500, poof: null },
  pk_slime: { walk: 'move', cycle: 18, melee: 'attack', ranged: 'attack', bomb: 'attack', death: 'death', poof: null },
};

/** The gait a mob moves in at `speed` px/s: its walk, or its run once it's quick (its frames may turn quicker). */
function gait(sheet: PFSheet, kit: Kit, speed: number): { anim: string; cyc: number; minFrame: number } {
  return kit.run && kit.runCycle && speed > 40 && sheet.has(kit.run)
    ? { anim: kit.run, cyc: kit.runCycle, minFrame: RUN_MIN_FRAME }
    : { anim: kit.walk, cyc: kit.cycle, minFrame: WALK_MIN_FRAME };
}

/** The boss moves (mobgen's BossMove) as Stone Warden animations. */
export const BOSS_ANIM: Record<string, string> = {
  ring: 'cast_ring',
  fan: 'attack_fan',
  charge: 'charge',
  slam: 'attack_slam',
  summon: 'summon',
  rain: 'stomp',
  leap: 'attack_slam',
};

/**
 * The boss moves as the Cinderwyrm's: its fire ring and its summons are the roar (wings spread), its
 * fan the breath, its charge a lunging bite, its slam the tail swept round, the fire it calls down a
 * roar at the sky, and its leap a beat of the wings (aloft on the roar's spread wings).
 */
export const WYRM_ANIM: Record<string, string> = {
  ring: 'roar',
  fan: 'breath',
  charge: 'attack_bite',
  slam: 'attack_tail',
  summon: 'roar',
  rain: 'roar',
  leap: 'roar',
};

/**
 * The boss moves as Rook's: his ring and his fan the blood crescents his greatsword throws, his charge
 * his own, his slam and his leap the leaping slam; summoning and calling down a rain, he raises the
 * blade and roars (his enrage).
 */
export const ROOK_ANIM: Record<string, string> = {
  ring: 'attack_ring',
  fan: 'attack_fan',
  charge: 'charge',
  slam: 'attack_slam',
  summon: 'enrage',
  rain: 'enrage',
  leap: 'attack_slam',
};

const BOSS_ANIMS: Partial<Record<MonsterId, Record<string, string>>> = { stone_warden: BOSS_ANIM, cinderwyrm: WYRM_ANIM, rook: ROOK_ANIM };

/** Moves whose aim follows the target through the first half of the wind-up (the sprite turns with it). */
const AIMED: ReadonlySet<string> = new Set(['dash', 'charge', 'leap']);

/** The animation a mob plays for one of the game's moves. */
export function moveAnim(monster: MonsterId, move: string | undefined, boss: boolean): string {
  const kit = KITS[monster];
  const bossAnim = boss && move ? (BOSS_ANIMS[monster] ?? BOSS_ANIM)[move] : undefined;
  if (bossAnim && SHEETS[MONSTER_SHEET[monster]].has(bossAnim)) return bossAnim;
  if (move === 'shoot' || move === 'cast') return kit.ranged ?? kit.melee;
  if (move === 'bomb') return kit.bomb ?? kit.melee;
  if (move === 'dash' || move === 'charge' || move === 'leap') return kit.lunge ?? kit.melee;
  if (move === 'throw') return kit.throw ?? kit.melee;
  return kit.melee;
}

export interface MobPose {
  sheet: SheetName;
  anim: string;
  dir: Dir;
  k: number;
  flash: boolean;
  alpha: number;
  stunned: boolean;
  /** A PixelForge FX its frame calls for, once (a howl's rings), and where: px from the mob's feet. */
  fx?: { name: SheetName; dx: number; dy: number };
  /** Its frames carry the motion themselves (a howl as it wakes): drawn whole, not squashed or faded in. */
  steady?: boolean;
}

interface Mem {
  world: World;
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  dir: Dir;
  walk: number;
  hurtT: number;
  hurtAt: number;
  windT: number;
  wind: { anim: string; dir: Dir; move: string | undefined } | null;
  swingT: number;
  strike: { anim: string; dir: Dir; at: number } | null;
  phase: number;
  enrageAt: number;
  lastMove: string | undefined;
  charging: boolean;
  chargeEnd: number;
  flashAt: number;
  /** The frame (anim and index) whose FX last went out, so each goes out once. */
  fxAt: string;
}

const mems = new Map<number, Mem>();

function at(frames: readonly FrameRef[], ms: number, scale = 1): number {
  let t = Math.max(0, ms);
  for (let i = 0; i < frames.length; i++) {
    const d = frames[i][1] * scale;
    if (t < d) return i;
    t -= d;
  }
  return frames.length - 1;
}

function strikeOf(sheet: PFSheet, anim: string): number {
  const a = sheet.meta.anims[anim];
  const e = eventFrame(a, 'hit', 'spawn', 'summon');
  if (e >= 0) return e;
  const p = a.phases?.indexOf('a') ?? -1;
  if (p >= 0) return p;
  // A move with no hit of its own (a stomp, a summon): its first frame after the windup events.
  const w = a.events?.filter((ev) => ev[1] === 'vfx').map((ev) => ev[0]) ?? [];
  return w.length ? Math.max(...w) : Math.floor(a.dirs.s!.length / 2);
}

/** Toward the nearest standing knight (or `cur` if there's none close). */
function towardHero(w: World, m: Unit, cur: Dir): Dir {
  let best: Unit | null = null;
  let bd = 160;
  for (const h of w.heroes) {
    if (h.downed) continue;
    const d = Math.hypot(h.x - m.x, h.y - m.y);
    if (d < bd) {
      bd = d;
      best = h;
    }
  }
  return best ? facing(best.x - m.x, best.y - m.y) : cur;
}

/** Where the move aims: a dash's or a charge's heading, a leap's landing spot, a shot's target, else the nearest knight. */
function moveDir(w: World, m: Unit, cur: Dir): Dir {
  if ((m.move === 'charge' || m.move === 'dash') && (m.moveX || m.moveY)) return facing(m.moveX!, m.moveY!);
  if (m.move === 'leap' && m.spotX !== undefined && m.spotY !== undefined && (m.spotX !== m.x || m.spotY !== m.y)) return facing(m.spotX - m.x, m.spotY - m.y);
  if ((m.move === 'shoot' || m.move === 'cast') && m.moveX !== undefined && m.moveY !== undefined) return facing(m.moveX - m.x, m.moveY - m.y);
  return towardHero(w, m, cur);
}

export function pruneMobs(live: ReadonlySet<number>): void {
  for (const id of mems.keys()) if (!live.has(id)) mems.delete(id);
}

/** The last move a mob made (a bomber that went off leaves no body), and the way it last faced. */
export function lastMoveOf(uid: number): string | undefined {
  return mems.get(uid)?.lastMove;
}

export function mobDirOf(uid: number): Dir | undefined {
  return mems.get(uid)?.dir;
}

/** The pose for a living mob drawn as `monster`. */
export function mobPose(w: World, m: Unit, monster: MonsterId, sheetName: SheetName): MobPose {
  const sheet = SHEETS[sheetName];
  const kit = KITS[monster];
  let s = mems.get(m.uid);
  const now = w.time;
  if (!s || s.world !== w || now < s.t) {
    s = {
      world: w, t: now, x: m.x, y: m.y, vx: 0, vy: 0, speed: 0, dir: m.dir < 0 ? 'w' : 'e', walk: 0,
      hurtT: m.hurtT, hurtAt: -9, windT: m.windT ?? 0, wind: null, swingT: m.swingT, strike: null,
      phase: m.bossPhase ?? 0, enrageAt: -9, lastMove: m.move, charging: false, chargeEnd: -9, flashAt: -9, fxAt: '',
    };
    mems.set(m.uid, s);
  }
  const dt = Math.max(0, now - s.t);
  s.t = now;
  const dx = m.x - s.x;
  const dy = m.y - s.y;
  const moved = Math.hypot(dx, dy);
  if (dt > 0 && moved < 30) {
    const k = 1 - Math.exp(-dt * 12);
    s.speed += (moved / dt - s.speed) * k;
    s.vx += (dx / dt - s.vx) * k;
    s.vy += (dy / dt - s.vy) * k;
    // (Cycles walked: the phase carries over between the walk and the run.)
    const g = gait(sheet, kit, s.speed);
    if (g.cyc) s.walk += (moved * walkPace(g.cyc, sheet.clip(g.anim, 's').length, s.speed, g.minFrame)) / g.cyc;
  }
  s.x = m.x;
  s.y = m.y;
  if (m.move) s.lastMove = m.move;
  // --- what happened
  if (m.hurtT > s.hurtT + 1e-4) s.hurtAt = now;
  s.hurtT = m.hurtT;
  const windT = m.windT ?? 0;
  if (windT > 0 && (!s.wind || windT > s.windT + 1e-4)) {
    const dir = moveDir(w, m, s.dir);
    s.wind = { anim: moveAnim(monster, m.move, !!m.boss), dir, move: m.move };
  }
  if (windT <= 0 && s.wind && m.swingT <= s.swingT + 1e-4) {
    // The wind-up ended without a move (a fumble): drop it.
    if (m.stunT > 0 || m.swingT <= 0) s.wind = null;
  }
  s.windT = windT;
  if (m.swingT > s.swingT + 1e-4) {
    const anim = s.wind?.anim ?? moveAnim(monster, s.lastMove, !!m.boss);
    s.strike = { anim, dir: s.wind?.dir ?? s.dir, at: now };
    s.wind = null;
  }
  s.swingT = m.swingT;
  const charging = !!m.rush;
  if (s.charging && !charging) s.chargeEnd = now;
  s.charging = charging;
  if ((m.bossPhase ?? 0) > s.phase) s.enrageAt = now;
  s.phase = m.bossPhase ?? 0;
  const busy = windT > 0 || charging;
  const spent = (m.recoverT ?? 0) > 0;
  const hit = now - s.hurtAt;
  // A flash per hit, but a boss (or an elite) taking a squad's blows doesn't strobe: at most one
  // short flash every so often.
  const gap = m.boss ? 0.9 : m.elite ? 0.3 : 0;
  if (hit === 0 && now - s.flashAt >= gap) s.flashAt = now;
  const flash = now - s.flashAt < (m.boss ? 0.05 : 0.08);
  // A side-view sheet draws east and west only: north and south keep the way the sim faces the mob.
  const side = sheet.meta.dirs?.length === 2;
  const D = (d: Dir): Dir => (!side ? d : d === 'e' || d === 'ne' || d === 'se' ? 'e' : d === 'w' || d === 'nw' || d === 'sw' ? 'w' : m.dir < 0 ? 'w' : 'e');
  const out = (anim: string, dir: Dir, k: number, extra: Partial<MobPose> = {}): MobPose => {
    s!.dir = D(dir);
    return { sheet: sheetName, anim, dir: D(dir), k, flash, alpha: 1, stunned: false, ...extra };
  };
  const clip = (anim: string, dir: Dir) => sheet.clip(anim, D(dir));
  const loop = (anim: string, dir: Dir, ms: number) => {
    const f = clip(anim, dir);
    const total = clipMs(f);
    return f[at(f, ((ms % total) + total) % total)][0];
  };
  // --- stunned (or dazed by a fumble)
  if (m.stunT > 0) {
    if (kit.stun && sheet.has(kit.stun)) return out(kit.stun, s.dir, loop(kit.stun, s.dir, now * 1000), { stunned: true });
    // No stun drawn: a dazed recoil (the hurt's middle frame), or, for a squashy slime or a hovering
    // bat, its rest pose held still.
    if (monster === 'slime' || monster === 'bat' || monster === 'pk_slime') return out('idle', s.dir, clip('idle', s.dir)[0][0], { stunned: true });
    const f = clip('hurt', s.dir);
    return out('hurt', s.dir, f[Math.min(1, f.length - 1)][0], { stunned: true });
  }
  // --- waking: rising into the fight, a wolf howls and an ogre roars (over the moment it takes)
  const rise = m.spawnT ?? 0;
  if (rise > 0 && kit.wake && sheet.has(kit.wake)) {
    const dir = towardHero(w, m, s.dir);
    const f = clip(kit.wake, dir);
    const i = at(f, Math.min(0.999, Math.max(0, 1 - rise / RISE)) * clipMs(f));
    // Its FX (the rings off a howling muzzle) go out once, as the frame that calls for them shows.
    const ev = sheet.meta.anims[kit.wake].events?.find((e) => e[0] === i && e[1] === 'vfx' && e[2] && `fx_${e[2]}` in SHEETS);
    const at_ = `${kit.wake}${i}`;
    if (ev && s.fxAt !== at_) {
      s.fxAt = at_;
      const [top, mid] = sheet.meta.tops[f[i][0]];
      const [px, py] = sheet.meta.pivot;
      return out(kit.wake, dir, f[i][0], { steady: true, fx: { name: `fx_${ev[2]}` as SheetName, dx: mid - px, dy: top - py + 3 } });
    }
    return out(kit.wake, dir, f[i][0], { steady: true });
  }
  // --- a wind-up: the windup frames over the game's telegraph (a lunge turns with its aim while it tracks)
  if (windT > 0 && s.wind) {
    if (s.wind.move && AIMED.has(s.wind.move)) s.wind.dir = moveDir(w, m, s.wind.dir);
    const { anim, dir } = s.wind;
    const f = clip(anim, dir);
    const st = strikeOf(sheet, anim);
    const total = f.slice(0, st).reduce((a, x) => a + x[1], 0);
    const p = 1 - windT / Math.max(0.01, m.windDur ?? windT);
    // A charge's windup ends on its last tell frame (the rush comes with the move).
    return out(anim, dir, f[at(f.slice(0, Math.max(1, st)), p * total)][0]);
  }
  // --- a dash or a leap in flight
  const r = m.rush;
  if (r) {
    const dir = r.x1 !== r.x0 || r.y1 !== r.y0 ? facing(r.x1 - r.x0, r.y1 - r.y0) : s.dir;
    const p = Math.min(1, r.t / Math.max(0.01, r.dur));
    // A boss's charge: the Stone Warden's own rush frames, looped.
    const ca = sheet.meta.anims.charge;
    if (m.boss && r.move === 'charge' && ca?.loopFrames) {
      const f = clip('charge', dir);
      const lf = ca.loopFrames;
      return out('charge', dir, f[lf[Math.floor((now * 1000) / f[lf[0]][1]) % lf.length]][0]);
    }
    const anim = moveAnim(monster, r.move, !!m.boss);
    const f = clip(anim, dir);
    const st = Math.min(f.length - 1, strikeOf(sheet, anim));
    if (r.kind === 'dash') {
      // A charge runs (its run, or its walk at a sprint); a dash holds its strike (a stab, a thrust, a
      // dive), and so does a kit that lunges into a charge (the Cinderwyrm's bite).
      if (kit.dash ? kit.dash === 'run' : r.move === 'charge') {
        const run = kit.run && sheet.has(kit.run) ? kit.run : kit.walk;
        return out(run, dir, loop(run, dir, now * 1000 * 1.8));
      }
      return out(anim, dir, f[st][0]);
    }
    // A leap: the kit's frame held in the air, or its last windup frame and, about to land, the strike.
    const i = kit.air !== undefined && !m.boss ? kit.air : p < 0.7 ? Math.max(0, st - 1) : st;
    return out(anim, dir, f[Math.min(f.length - 1, i)][0]);
  }
  // --- the strike and its recovery (after a charge, from where the rush ended)
  if (s.strike) {
    const { anim, dir } = s.strike;
    const f = clip(anim, dir);
    const charged = s.chargeEnd > s.strike.at;
    const u = (now - (charged ? s.chargeEnd : s.strike.at)) * 1000;
    const lf = sheet.meta.anims[anim]?.loopFrames;
    const rest = anim === 'charge' && lf ? f.slice(Math.max(...lf) + 1) : f.slice(strikeOf(sheet, anim));
    // (Cut short if it sets off walking again; not while it stands spent after a lunge, still sliding to a stop.)
    if (u < clipMs(rest) && !(s.speed > 8 && u > 120 && !spent)) return out(anim, dir, rest[at(rest, u)][0]);
    s.strike = null;
  }
  // --- a boss's roar at half HP
  const roar = kit.enrage ?? 'enrage';
  if (m.boss && now - s.enrageAt < 1.2 && sheet.has(roar) && !busy) {
    const f = clip(roar, s.dir);
    return out(roar, s.dir, f[at(f, (now - s.enrageAt) * 1000, 1.2 / (clipMs(f) / 1000))][0]);
  }
  // --- hurt (bosses only flash)
  if (hit < 0.34 && !m.boss && s.speed < 8) {
    const f = clip('hurt', s.dir);
    return out('hurt', s.dir, f[at(f, hit * 1000)][0]);
  }
  // --- moving: steps by distance, so the feet stay planted
  const moving = !spent && (m.moving || s.speed > 6) && s.speed > 3;
  if (moving) {
    const dir = travelDir(s.vx, s.vy, s.dir);
    const { anim, cyc } = gait(sheet, kit, s.speed);
    const f = clip(anim, dir);
    if (!cyc) return out(anim, dir, loop(anim, dir, now * 1000));
    const p = ((s.walk % 1) + 1) % 1;
    return out(anim, dir, f[Math.min(f.length - 1, Math.floor(p * f.length))][0]);
  }
  // --- standing: facing the nearest knight once awake
  const dir = m.awake ? towardHero(w, m, s.dir) : s.dir;
  const idle = sheet.has('combat_idle') && m.awake ? 'combat_idle' : 'idle';
  return out(idle, dir, loop(idle, dir, now * 1000 * (m.awake ? 1 : 0.6) + m.uid * 173));
}

/** A dying mob's frame `ms` into its death, or null once it's over (and the alpha as it fades). */
export function deathPose(monster: MonsterId, sheetName: SheetName, dir: Dir, ms: number): { k: number; alpha: number; anim: string } | null {
  const sheet = SHEETS[sheetName];
  const anim = KITS[monster].death;
  const f = sheet.clip(anim, dir);
  const total = clipMs(f);
  const held = total + (KITS[monster].linger ?? 0);
  const fade = 260;
  if (ms >= held + fade) return null;
  const alpha = ms <= held ? 1 : Math.round((1 - (ms - held) / fade) * 6) / 6;
  return { k: f[at(f, Math.min(ms, total - 1))][0], alpha, anim };
}

/** The PixelForge FX a death ends in (a skeleton crumbles, the rest go up in smoke), or null (the packs' own deaths). */
export function deathFx(monster: MonsterId): SheetName | null {
  const k = KITS[monster];
  if (k.poof !== undefined) return k.poof;
  return monster === 'skeleton' ? 'fx_bone_crumble' : 'fx_poof_smoke';
}

/** When in a death the poof (PixelForge's vfx event, or the end) comes, in ms. */
export function deathPoofMs(monster: MonsterId, sheetName: SheetName): number {
  const sheet = SHEETS[sheetName];
  const anim = KITS[monster].death;
  const a = sheet.meta.anims[anim];
  const f = sheet.clip(anim, 's');
  const e = a.events?.find((ev) => ev[1] === 'vfx');
  return e ? f.slice(0, e[0]).reduce((s, x) => s + x[1], 0) : clipMs(f);
}

/** The monster kit (for tests). */
export function kitOf(m: MonsterId): Kit {
  return KITS[m];
}
