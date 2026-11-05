/**
 * Which PixelForge frame a mob shows, read from the sim every frame (nothing here changes the sim).
 * The mob's attack plays over the game's own timing: its windup frames are stretched over the
 * wind-up (windT counting down from windDur: the telegraph the game already gives), the strike frame
 * shows on the tick the sim deals the hit (swingT jumps), then the recovery plays. A charge loops
 * its rush (the Stone Warden's charge frames, a wolf's run) while chargeT lasts. Bosses play the
 * move they wind up (ring, fan, charge, slam, summon, rain) and roar when they enrage. Deaths play
 * out after the sim has let go of the mob (see the renderer's corpses).
 */
import type { Unit } from '../../world/entities';
import type { World } from '../../world/world';
import { SHEETS, type SheetName } from './assets';
import { travelDir } from './heroAnim';
import type { MonsterId } from './mobLook';
import { clipMs, eventFrame, facing, walkPace, type Dir, type FrameRef, type PFSheet } from './sheet';

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
}

const KITS: Record<MonsterId, Kit> = {
  slime: { walk: 'move', cycle: 14, melee: 'attack_slam', ranged: 'attack_spit', bomb: 'attack_spit', death: 'death' },
  bat: { walk: 'idle', cycle: 0, melee: 'attack_swoop', death: 'death' },
  wolf: { walk: 'walk', cycle: 11, run: 'run', runCycle: 22, melee: 'attack_bite', death: 'death' },
  frost_wolf: { walk: 'walk', cycle: 11, run: 'run', runCycle: 22, melee: 'attack_bite', death: 'death' },
  goblin: { walk: 'walk', cycle: 7, melee: 'attack_slash', death: 'death' },
  goblin_chief: { walk: 'walk', cycle: 7, melee: 'attack_slash', death: 'death' },
  goblin_archer: { walk: 'walk', cycle: 7, melee: 'shoot_bow', ranged: 'shoot_bow', death: 'death' },
  orc: { walk: 'walk', cycle: 10, melee: 'attack_slash', death: 'death', stun: 'stun' },
  skeleton: { walk: 'walk', cycle: 10, melee: 'attack_slash', death: 'death_crumble', stun: 'stun' },
  ogre: { walk: 'walk', cycle: 15, melee: 'attack_heavy', death: 'death' },
  stone_warden: { walk: 'walk', cycle: 16, melee: 'attack_slam', death: 'death' },
};

/** The gait a mob moves in at `speed` px/s: its walk, or its run once it's quick. */
function gait(sheet: PFSheet, kit: Kit, speed: number): { anim: string; cyc: number } {
  return kit.run && kit.runCycle && speed > 40 && sheet.has(kit.run) ? { anim: kit.run, cyc: kit.runCycle } : { anim: kit.walk, cyc: kit.cycle };
}

/** The boss moves (mobgen's BossMove) as Stone Warden animations. */
export const BOSS_ANIM: Record<string, string> = {
  ring: 'cast_ring',
  fan: 'attack_fan',
  charge: 'charge',
  slam: 'attack_slam',
  summon: 'summon',
  rain: 'stomp',
};

/** The animation a mob plays for one of the game's moves. */
export function moveAnim(monster: MonsterId, move: string | undefined, boss: boolean): string {
  const kit = KITS[monster];
  if (boss && move && BOSS_ANIM[move]) return BOSS_ANIM[move];
  if (move === 'shoot' || move === 'cast') return kit.ranged ?? kit.melee;
  if (move === 'bomb') return kit.bomb ?? kit.melee;
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

/** Where the move aims: a charge's heading, a shot's target, else the nearest knight. */
function moveDir(w: World, m: Unit, cur: Dir): Dir {
  if (m.move === 'charge' && (m.moveX || m.moveY)) return facing(m.moveX!, m.moveY!);
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
      phase: m.bossPhase ?? 0, enrageAt: -9, lastMove: m.move, charging: false, chargeEnd: -9, flashAt: -9,
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
    const g = gait(sheet, kit, s.speed);
    if (g.cyc) s.walk += moved * walkPace(g.cyc, sheet.clip(g.anim, 's').length, s.speed);
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
  const charging = !!(m.chargeT && m.chargeT > 0);
  if (s.charging && !charging) s.chargeEnd = now;
  s.charging = charging;
  if ((m.bossPhase ?? 0) > s.phase) s.enrageAt = now;
  s.phase = m.bossPhase ?? 0;
  const busy = windT > 0 || charging;
  const hit = now - s.hurtAt;
  // A flash per hit, but a boss (or an elite) taking a squad's blows doesn't strobe: at most one
  // short flash every so often.
  const gap = m.boss ? 0.9 : m.elite ? 0.3 : 0;
  if (hit === 0 && now - s.flashAt >= gap) s.flashAt = now;
  const flash = now - s.flashAt < (m.boss ? 0.05 : 0.08);
  const out = (anim: string, dir: Dir, k: number, extra: Partial<MobPose> = {}): MobPose => {
    s!.dir = dir;
    return { sheet: sheetName, anim, dir, k, flash, alpha: 1, stunned: false, ...extra };
  };
  const clip = (anim: string, dir: Dir) => sheet.clip(anim, dir);
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
    if (monster === 'slime' || monster === 'bat') return out('idle', s.dir, clip('idle', s.dir)[0][0], { stunned: true });
    const f = clip('hurt', s.dir);
    return out('hurt', s.dir, f[Math.min(1, f.length - 1)][0], { stunned: true });
  }
  // --- a wind-up: the windup frames over the game's telegraph
  if (windT > 0 && s.wind) {
    const { anim, dir } = s.wind;
    const f = clip(anim, dir);
    const st = strikeOf(sheet, anim);
    const total = f.slice(0, st).reduce((a, x) => a + x[1], 0);
    const p = 1 - windT / Math.max(0.01, m.windDur ?? windT);
    // A charge's windup ends on its last tell frame (the rush comes with the move).
    return out(anim, dir, f[at(f.slice(0, Math.max(1, st)), p * total)][0]);
  }
  // --- a charge: the rush loops while it lasts
  if (charging) {
    const dir = m.moveX || m.moveY ? facing(m.moveX ?? 0, m.moveY ?? 0) : s.dir;
    const a = sheet.meta.anims.charge;
    if (a?.loopFrames && m.boss) {
      const f = clip('charge', dir);
      const lf = a.loopFrames;
      const i = lf[Math.floor((now * 1000) / f[lf[0]][1]) % lf.length];
      return out('charge', dir, f[i][0]);
    }
    const run = kit.run && sheet.has(kit.run) ? kit.run : kit.walk;
    return out(run, dir, loop(run, dir, now * 1000 * 1.6));
  }
  // --- the strike and its recovery (after a charge, from where the rush ended)
  if (s.strike) {
    const { anim, dir } = s.strike;
    const f = clip(anim, dir);
    const charged = s.chargeEnd > s.strike.at;
    const u = (now - (charged ? s.chargeEnd : s.strike.at)) * 1000;
    const lf = sheet.meta.anims[anim]?.loopFrames;
    const rest = anim === 'charge' && lf ? f.slice(Math.max(...lf) + 1) : f.slice(strikeOf(sheet, anim));
    if (u < clipMs(rest) && !(s.speed > 8 && u > 120)) return out(anim, dir, rest[at(rest, u)][0]);
    s.strike = null;
  }
  // --- a boss's roar at half HP
  if (m.boss && now - s.enrageAt < 1.2 && sheet.has('enrage') && !busy) {
    const f = clip('enrage', s.dir);
    return out('enrage', s.dir, f[at(f, (now - s.enrageAt) * 1000, 1.2 / (clipMs(f) / 1000))][0]);
  }
  // --- hurt (bosses only flash)
  if (hit < 0.34 && !m.boss && s.speed < 8) {
    const f = clip('hurt', s.dir);
    return out('hurt', s.dir, f[at(f, hit * 1000)][0]);
  }
  // --- moving: steps by distance, so the feet stay planted
  const moving = (m.moving || s.speed > 6) && s.speed > 3;
  if (moving) {
    const dir = travelDir(s.vx, s.vy, s.dir);
    const { anim, cyc } = gait(sheet, kit, s.speed);
    const f = clip(anim, dir);
    if (!cyc) return out(anim, dir, loop(anim, dir, now * 1000));
    const p = ((s.walk % cyc) + cyc) % cyc;
    return out(anim, dir, f[Math.min(f.length - 1, Math.floor((p / cyc) * f.length))][0]);
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
  const fade = 260;
  if (ms >= total + fade) return null;
  const alpha = ms <= total ? 1 : Math.round((1 - (ms - total) / fade) * 6) / 6;
  return { k: f[at(f, Math.min(ms, total - 1))][0], alpha, anim };
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
