/**
 * Which PixelForge frame a knight shows, read from the sim every frame (nothing here changes the
 * sim). The world's state is the script:
 *
 *   downed            death (once, holding the slump); on a revive the death plays backward (it stands up)
 *   rolling, landing  the class's dodge: roll, backflip (Ranger), vault (Lancer), dodge with a blink fade
 *                     (Arcanist), stretched over the roll and its landing, facing its way (backflips
 *                     face away)
 *   stunT             stun
 *   channel           Whirlwind plays the heavy attack's spin (its coil, the turn through every view
 *                     looped while it lasts, then the last sweep and the settle); a lunge holds the
 *                     thrust. (A sheet whose heavy attack is a single blow spins through its views.)
 *   swingT jumps      an attack: auto attacks play the class's (Guardian and Blade the Cleave,
 *                     attack_slash; Ranger shoot_bow, Cleric and Arcanist cast, Lancer the thrust),
 *                     skills theirs (the Shield Slam the shield thrust forward). The strike frame lands
 *                     on the tick the sim deals the hit: standing knights start the windup early, timed
 *                     from atkT to the next auto attack; the whole attack is squeezed to fit the
 *                     class's attack speed
 *   hurtT jumps       hurt (or a flash, when busy)
 *   drT (Guardian)    block while the guard is up
 *   moving            walk, or run once it's quick (a knight's own pace is the run's), its frames
 *                     stepped by distance (stride_px) so the feet never slide
 *   floor cleared     victory, for a few seconds
 *   foes awake near   combat_idle; otherwise idle (a breath), blinking now and then on its rest frame
 *
 * Facing comes from the aim (attacks), the dodge, or the travel vector's dominant axis, with a little
 * hysteresis so a diagonal walk doesn't flicker between views. While the knight you steer attacks
 * (h.aiming) it faces its aim whichever way it walks, as in a twin-stick shooter, and a blow struck on
 * the move plays quick so the stride shows between blows.
 */
import { CLASSES, type ClassId } from '../../core/knights';
import type { SkillId } from '../../core/skillbook';
import type { Unit, View } from '../../world/entities';
import type { World } from '../../world/world';
import { SHEETS } from './assets';
import { KNIGHT_SHEET, knightSheet } from './knightLook';
import { eventFrame, facing, facing8, RUN_MIN_FRAME, WALK_MIN_FRAME, walkPace, type Dir, type FrameRef, type PFSheet } from './sheet';

export interface HeroPose {
  anim: string;
  dir: Dir;
  /** Distinct frame to draw. */
  k: number;
  /** Below 1 while an Arcanist blinks in. */
  alpha: number;
  /** Drawn in the flash color (a hit landing while the knight is busy). */
  flash: boolean;
  /** The blink's afterimage where the Arcanist left. */
  ghost: { x: number; y: number; k: number; alpha: number; anim: string; dir: Dir } | null;
  /** Stun stars over the head. */
  stunned: boolean;
}

interface Attack {
  anim: string;
  dir: Dir;
  /** World time (s) the strike frame shows. */
  strikeAt: number;
  /** Time scale for this attack (1 = PixelForge's own timing). */
  scale: number;
  predicted: boolean;
  /** Not strike-aligned (a war cry): plays from frame 0 at strikeAt. */
  plain?: boolean;
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
  swingT: number;
  hurtT: number;
  drT: number;
  guardAt: number;
  downed: boolean;
  downAt: number;
  upAt: number;
  atk: Attack | null;
  swings: number;
  skillAt: number;
  skill: SkillId | null;
  roll: object | null;
  rollAt: number;
  rollFrom: [number, number];
  hurtAt: number;
  cleared: boolean;
  victoryAt: number;
  blinkAt: number;
  blinkUntil: number;
  /** The gait it moves in (by its speed, with some give) and how far through its cycle it is (cycles). */
  gait: 'walk' | 'run';
  step: number;
  /** A Whirlwind: when it began, the way it faced, and when it ended (its last sweep plays after). */
  spinAt: number;
  spinDir: Dir;
  spinEnd: number;
}

const mems = new Map<number, Mem>();

export function viewDir(view: View, dir: number): Dir {
  return view === 'side' ? (dir < 0 ? 'w' : 'e') : view === 'down' ? 's' : 'n';
}

/** The travel facing, keeping the current one until the other axis clearly wins. */
export function travelDir(vx: number, vy: number, cur: Dir): Dir {
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  if (ax < 1e-3 && ay < 1e-3) return cur;
  const want = facing(vx, vy);
  if (want === cur) return cur;
  const curH = cur === 'e' || cur === 'w';
  const wantH = want === 'e' || want === 'w';
  // Same axis, other way: turn at once. Switching axis needs a clear lead.
  if (curH === wantH) return want;
  return (wantH ? ax > ay * 1.3 : ay > ax * 1.3) ? want : (curH ? (vx >= 0 ? 'e' : 'w') : vy >= 0 ? 's' : 'n');
}

const DIR_ANGLE: Record<Dir, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };

/** The travel facing among eight, keeping the current one until the heading is well into another sector. */
export function travelDir8(vx: number, vy: number, cur: Dir): Dir {
  if (Math.abs(vx) < 1e-3 && Math.abs(vy) < 1e-3) return cur;
  const a = ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360;
  const off = Math.abs(((a - DIR_ANGLE[cur] + 540) % 360) - 180);
  return off <= 30 ? cur : facing8(vx, vy);
}

const HEAVY_SKILLS: ReadonlySet<SkillId> = new Set(['shieldSlam', 'groundPound', 'titansWrath', 'excalibur']);
const CHEER_SKILLS: ReadonlySet<SkillId> = new Set(['battleCry', 'rallyingTaunt']);
const GUARD_SKILLS: ReadonlySet<SkillId> = new Set(['ironSkin', 'aegis']);

/** True when a sheet's heavy attack is the Whirlwind (a spin it loops while it lasts) rather than one heavy blow. */
export function heavySpins(sheet: PFSheet): boolean {
  return !!sheet.meta.anims.attack_heavy?.loopFrames?.length;
}

/** The attack a class plays for a swing: its auto attack (the Cleave), an occasional heavy blow, or a skill's. */
export function attackAnim(cls: ClassId, skill: SkillId | null, swing: number, sheet: PFSheet): string {
  // A single heavy blow (an overhead smash) for the heavy skills; a sheet whose heavy attack is the
  // Whirlwind keeps it for the Whirlwind and cleaves (or, the Shield Slam, drives the shield forward).
  const blow = sheet.has('attack_heavy') && !heavySpins(sheet);
  if (skill && HEAVY_SKILLS.has(skill)) return blow ? 'attack_heavy' : skill === 'shieldSlam' && sheet.has('block_enter') ? 'block_enter' : 'attack_slash';
  if (skill && CHEER_SKILLS.has(skill)) return 'victory';
  if (skill && GUARD_SKILLS.has(skill) && sheet.has('block_enter')) return 'block_enter';
  switch (cls) {
    case 'ranger':
      return 'shoot_bow';
    case 'cleric':
    case 'arcanist':
      return 'cast';
    case 'guardian':
    case 'blade':
      // Every fourth swing is the overhead smash, on a sheet that has one.
      return swing % 4 === 3 && blow ? 'attack_heavy' : 'attack_slash';
    default:
      return 'attack_slash';
  }
}

/** The Whirlwind's coil plays at this share of its drawn length; each frame of its turn lasts this long (ms). */
const SPIN_COIL = 0.5;
const SPIN_FRAME_MS = 85;

/**
 * Speeds (px/s) a knight breaks into its run above, and falls back to its walk below: a knight runs
 * at its own pace (50 to 64 px/s) and walks when slowed (30 to 38) or easing in and out of a stop.
 */
export const RUN_FROM = 44;
export const WALK_BELOW = 40;

/** The gait for `speed` px/s: the run once it's quick (with some give either way), else the walk. */
export function gaitFor(sheet: PFSheet, speed: number, cur: 'walk' | 'run'): 'walk' | 'run' {
  if (!sheet.has('run')) return 'walk';
  return speed >= RUN_FROM || (cur === 'run' && speed >= WALK_BELOW) ? 'run' : 'walk';
}

/** The dodge animation for a roll kind, and whether it faces away from the way it moves. */
export function dodgeAnim(kind: NonNullable<Unit['rolling']>['kind'], sheet: PFSheet): { anim: string; away: boolean } {
  const pref: Record<NonNullable<Unit['rolling']>['kind'], Array<[string, boolean]>> = {
    roll: [['roll', false], ['vault', false], ['backflip', true], ['dodge', true]],
    flip: [['backflip', true], ['roll', false], ['vault', false], ['dodge', true]],
    vault: [['vault', false], ['roll', false], ['backflip', true], ['dodge', true]],
    blink: [['dodge', true], ['roll', false], ['backflip', true], ['vault', false]],
    // The Guardian's Shield Bash: shield up, charging; the Blade's Shadowstep: its roll; the Lancer's
    // lunge: the thrust, held (heroPose holds these two rather than playing them through).
    bash: [['block_hold', false], ['roll', false], ['dodge', true]],
    shadow: [['roll', false], ['dodge', true], ['vault', false], ['backflip', true]],
    lunge: [['attack_slash', false], ['vault', false], ['roll', false]],
  };
  const hit = pref[kind].find(([a]) => sheet.has(a)) ?? ['idle', false];
  return { anim: hit[0], away: hit[1] };
}

/** Frame i of `frames` at `ms`, the clip's durations multiplied by `scale`. */
function at(frames: readonly FrameRef[], ms: number, scale = 1): number {
  let t = Math.max(0, ms);
  for (let i = 0; i < frames.length; i++) {
    const d = frames[i][1] * scale;
    if (t < d) return i;
    t -= d;
  }
  return frames.length - 1;
}

const sum = (frames: readonly FrameRef[], from = 0, to = frames.length) => frames.slice(from, to).reduce((s, f) => s + f[1], 0);

/** The strike frame of an attack clip (its hit or spawn), or its first active frame. */
function strikeFrame(sheet: PFSheet, anim: string): number {
  const a = sheet.meta.anims[anim];
  const e = eventFrame(a, 'hit', 'spawn');
  if (e >= 0) return e;
  const p = a.phases?.indexOf('a') ?? -1;
  return p >= 0 ? p : 0;
}

/** Where an attack is at `now`: the frame, or null when it's over (or its windup hasn't begun). */
function attackFrame(sheet: PFSheet, atk: Attack, now: number): number | null {
  const frames = sheet.clip(atk.anim, atk.dir);
  const u = (now - atk.strikeAt) * 1000;
  if (atk.plain) {
    const total = sum(frames) * atk.scale;
    return u >= 0 && u < total ? frames[at(frames, u, atk.scale)][0] : null;
  }
  const s = strikeFrame(sheet, atk.anim);
  const wind = sum(frames, 0, s) * atk.scale;
  const rest = sum(frames, s) * atk.scale;
  if (u < -wind || u >= rest) return null;
  if (u < 0) return frames[at(frames.slice(0, s), wind + u, atk.scale)][0];
  return frames[s + at(frames.slice(s), u, atk.scale)][0];
}

/** Seconds between this knight's auto attacks right now. */
function attackCycle(w: World, h: Unit): number {
  const rate = (1 + w.banner * 0.04) * (h.skillBuff?.atkSpd ?? 1);
  return (h.atkCd ?? CLASSES[h.cls!].atkCd) / rate;
}

/** An attack started on the move plays at most at this scale (quick), so the walk shows between blows. */
const MOVING_SCALE = 0.55;

/** The scale that fits a whole attack in `cycle` seconds (never under 0.45). */
function fitScale(sheet: PFSheet, anim: string, cycle: number): number {
  const total = sum(sheet.clip(anim, 's')) / 1000;
  return Math.max(0.45, Math.min(1, (cycle * 0.92) / Math.max(0.001, total)));
}

function fresh(w: World, h: Unit): Mem {
  return {
    world: w, t: w.time, x: h.x, y: h.y, vx: 0, vy: 0, speed: 0,
    dir: viewDir(h.view, h.dir), swingT: h.swingT, hurtT: h.hurtT, drT: h.drT, guardAt: -9,
    downed: !!h.downed, downAt: h.downed ? w.time - 9 : -9, upAt: -9,
    atk: null, swings: 0, skillAt: h.lastSkill?.at ?? -1, skill: null,
    roll: h.rolling ?? null, rollAt: -9, rollFrom: [h.x, h.y], hurtAt: -9,
    cleared: w.cleared, victoryAt: -9, blinkAt: w.time + 2 + Math.random() * 3, blinkUntil: -9,
    gait: 'walk', step: 0, spinAt: -9, spinDir: 's', spinEnd: -9,
  };
}

/** A gait's stride per frame (px): its own, or 2.5 a frame. */
function strideOf(sheet: PFSheet, gait: 'walk' | 'run'): number[] {
  return sheet.meta.anims[gait].stride ?? sheet.clip(gait, 'e').map(() => 2.5);
}

/** Forget knights no longer drawn (call once a frame with the live ids). */
export function pruneHeroes(live: ReadonlySet<number>): void {
  for (const id of mems.keys()) if (!live.has(id)) mems.delete(id);
}

/** The pose for knight `h` now (call once per drawn frame; it remembers what it saw). */
export function heroPose(w: World, h: Unit): HeroPose {
  const sheet = SHEETS[h.knightId ? knightSheet(h.knightId) : KNIGHT_SHEET[h.cls!]];
  // Sheets that draw the diagonals face eight ways; the rest face the dominant axis.
  const face = (dx: number, dy: number): Dir => (sheet.eightWay ? facing8(dx, dy) : facing(dx, dy));
  let m = mems.get(h.uid);
  if (!m || m.world !== w || w.time < m.t) {
    m = fresh(w, h);
    mems.set(h.uid, m);
  }
  const now = w.time;
  const dt = Math.max(0, now - m.t);
  m.t = now;
  // --- travel
  const dx = h.x - m.x;
  const dy = h.y - m.y;
  const moved = Math.hypot(dx, dy);
  const jump = moved > 24;
  if (dt > 0 && !jump) {
    const k = 1 - Math.exp(-dt * 14);
    m.speed += (moved / dt - m.speed) * k;
    m.vx += (dx / dt - m.vx) * k;
    m.vy += (dy / dt - m.vy) * k;
  }
  if (!jump && !h.rolling && !h.landing) {
    // Walk or run by the pace (the run's frames may turn quicker than the walk's), the feet planted.
    // (The phase carries over from one gait to the other: both start on the same foot.)
    m.gait = gaitFor(sheet, m.speed, m.gait);
    const stride = strideOf(sheet, m.gait);
    const cycle = stride.reduce((s, v) => s + v, 0);
    m.step += (moved * walkPace(cycle, stride.length, m.speed, m.gait === 'run' ? RUN_MIN_FRAME : WALK_MIN_FRAME)) / cycle;
  }
  const prevX = m.x;
  const prevY = m.y;
  m.x = h.x;
  m.y = h.y;
  // --- what happened since last frame
  if (h.lastSkill && h.lastSkill.at !== m.skillAt) {
    m.skillAt = h.lastSkill.at;
    m.skill = h.lastSkill.skill;
  }
  let flash = false;
  if (h.hurtT > m.hurtT + 1e-4) m.hurtAt = now;
  m.hurtT = h.hurtT;
  if (h.drT > m.drT + 0.05) m.guardAt = now;
  m.drT = h.drT;
  if (!m.downed && h.downed) m.downAt = now;
  if (m.downed && !h.downed) m.upAt = now;
  m.downed = !!h.downed;
  if (h.rolling && h.rolling !== m.roll) {
    m.rollAt = now;
    m.rollFrom = [prevX, prevY];
  }
  m.roll = h.rolling ?? (h.landing ? m.roll : null);
  if (w.cleared && !m.cleared && !w.hub && !w.camp) m.victoryAt = now;
  m.cleared = w.cleared;
  const aimDir = face(h.aimX, h.aimY);
  // The knight you steer, attacking: it faces where it aims, walking or standing (twin-stick).
  const aiming = (h.aiming ?? 0) > 0;
  if (h.swingT > m.swingT + 1e-4) {
    // A swing: the sim dealt the hit (or loosed the shot) this tick.
    const skill = m.skill && Math.abs(m.skillAt - now) < 0.05 ? m.skill : null;
    const anim = attackAnim(h.cls!, skill, m.swings, sheet);
    if (!skill) m.swings++;
    const cycle = skill ? Math.max(0.5, h.swingDur * 2) : attackCycle(w, h);
    const keep = m.atk?.predicted && m.atk.anim === anim && Math.abs(m.atk.strikeAt - now) < 0.25;
    // On the move the blow is quick, so the stride shows between blows (the feet don't skate).
    const onFoot = h.moving && m.speed > 5;
    const fit = fitScale(sheet, anim, cycle);
    m.atk = {
      anim,
      dir: aimDir,
      strikeAt: now,
      scale: keep ? m.atk!.scale : onFoot && !skill ? Math.min(fit, MOVING_SCALE) : fit,
      predicted: false,
      plain: anim === 'victory' || anim === 'block_enter',
    };
  }
  m.swingT = h.swingT;
  const pose = (anim: string, dir: Dir, k: number, extra: Partial<HeroPose> = {}): HeroPose => {
    m!.dir = dir;
    return { anim, dir, k, alpha: 1, flash, ghost: null, stunned: false, ...extra };
  };
  const clip = (anim: string, dir: Dir) => sheet.clip(anim, dir);
  const loopK = (anim: string, dir: Dir, ms: number) => {
    const f = clip(anim, dir);
    const total = sum(f);
    return f[at(f, ((ms % total) + total) % total)][0];
  };
  // --- downed: the death, held; a revive plays it backward
  if (h.downed) {
    const f = clip('death', m.dir);
    return pose('death', m.dir, f[at(f, (now - m.downAt) * 1000)][0]);
  }
  if (now - m.upAt < 0.42) {
    const f = clip('death', m.dir);
    const i = f.length - 1 - Math.min(f.length - 2, Math.floor(((now - m.upAt) / 0.42) * (f.length - 1)));
    return pose('death', m.dir, f[i][0]);
  }
  // --- a dodge (or a skill's leap), through to its landing
  const r = h.rolling ?? h.landing;
  if (r) {
    const { anim, away } = dodgeAnim(r.kind, sheet);
    const dir = away ? face(-r.dx, -r.dy) : face(r.dx, r.dy);
    const f = clip(anim, dir);
    // How far through the whole roll: the untouchable part, then the landing.
    const whole = h.rolling ? h.rolling.dur + (h.rolling.land ?? 0) : h.landing!.of;
    const done = h.rolling ? h.rolling.dur - h.rolling.t : h.landing!.of - h.landing!.t;
    const p = Math.min(0.999, Math.max(0, done / Math.max(1e-6, whole)));
    // The shield charge holds the guard up; the lunge holds the thrust at full stretch.
    if (anim === 'block_hold') return pose(anim, dir, loopK(anim, dir, now * 1000));
    if (anim === 'attack_slash') return pose(anim, dir, f[strikeFrame(sheet, anim)][0]);
    const k = f[at(f, p * sum(f))][0];
    if (r.kind === 'blink') {
      const g0 = f[0][0];
      return pose(anim, dir, k, {
        alpha: Math.round((0.35 + 0.65 * p) * 8) / 8,
        ghost: { x: m.rollFrom[0], y: m.rollFrom[1], k: g0, alpha: Math.round(0.6 * (1 - p) * 8) / 8, anim, dir },
      });
    }
    return pose(anim, dir, k);
  }
  if (h.stunT > 0 && sheet.has('stun')) return pose('stun', m.dir, loopK('stun', m.dir, now * 1000), { stunned: true });
  // --- skills that take a moment
  if (h.channel?.kind === 'whirlwind') {
    if (heavySpins(sheet)) {
      // The Whirlwind: the coil (quick: the blows start at once), then the turn through every view,
      // looped while it lasts (about three turns a second).
      if (m.spinAt < 0) {
        m.spinAt = now;
        m.spinDir = face(h.aimX || h.dir, h.aimY);
      }
      const f = clip('attack_heavy', m.spinDir);
      const lf = sheet.meta.anims.attack_heavy.loopFrames!;
      const coil = sum(f, 0, lf[0]) * SPIN_COIL;
      const u = (now - m.spinAt) * 1000;
      if (u < coil) return pose('attack_heavy', m.spinDir, f[at(f.slice(0, lf[0]), u, SPIN_COIL)][0]);
      return pose('attack_heavy', m.spinDir, f[lf[Math.floor((u - coil) / SPIN_FRAME_MS) % lf.length]][0]);
    }
    const spin: Dir[] = ['s', 'e', 'n', 'w'];
    // A quarter turn every 0.12 s (about two turns a second): fast enough to read as a spin, slow
    // enough not to strobe.
    const dir = spin[Math.floor(now / 0.12) % 4];
    const anim = 'attack_slash';
    const f = clip(anim, dir);
    return pose(anim, dir, f[strikeFrame(sheet, anim)][0]);
  }
  if (m.spinAt >= 0) {
    // The Whirlwind is over: its last sweep and the settle follow (unless the knight walks off).
    m.spinAt = -9;
    m.spinEnd = now;
  }
  if (h.channel?.kind === 'lunge') {
    const dir = face(h.channel.dx, h.channel.dy);
    const anim = 'attack_slash';
    return pose(anim, dir, clip(anim, dir)[strikeFrame(sheet, anim)][0]);
  }
  // --- attacks
  const walking = h.moving && m.speed > 5;
  if (!m.atk && !walking && h.atkT !== undefined && h.atkT > 0 && h.stunT <= 0 && !h.channel) {
    // Standing in reach of a foe: start the windup so the strike lands as the sim attacks.
    const rate = (1 + w.banner * 0.04) * (h.skillBuff?.atkSpd ?? 1);
    const toFire = h.atkT / rate;
    const anim = attackAnim(h.cls!, null, m.swings, sheet);
    const scale = fitScale(sheet, anim, attackCycle(w, h));
    const wind = (sum(clip(anim, 's'), 0, strikeFrame(sheet, anim)) * scale) / 1000;
    if (toFire <= wind) {
      if (h.slot === w.controlled && !w.bot && !w.auto) {
        // The knight you steer attacks only while you hold it (Auto attack off): wind up toward the aim, then.
        if (aiming) m.atk = { anim, dir: aimDir, strikeAt: now + toFire, scale, predicted: true };
      } else {
        const reach = h.range! + (h.cls === 'guardian' || h.cls === 'blade' || h.cls === 'lancer' ? 6 : 0);
        const t = w.nearestEnemy(h, reach, true);
        if (t) m.atk = { anim, dir: face(t.x - h.x, t.y - h.y), strikeAt: now + toFire, scale, predicted: true };
      }
    }
  }
  if (m.atk?.predicted && aiming) m.atk.dir = aimDir;
  if (m.atk?.predicted) {
    // Keep the strike on the sim's clock (buffs change it); give up if the attack never comes.
    const rate = (1 + w.banner * 0.04) * (h.skillBuff?.atkSpd ?? 1);
    if (h.atkT !== undefined && h.atkT > 0) m.atk.strikeAt = now + h.atkT / rate;
    if (walking || now > m.atk.strikeAt + 0.15) m.atk = null;
  }
  if (m.atk) {
    const k = attackFrame(sheet, m.atk, now);
    if (k !== null) {
      if (now - m.hurtAt < 0.08) flash = true;
      return pose(m.atk.anim, m.atk.dir, k);
    }
    if (now >= m.atk.strikeAt) m.atk = null;
  }
  // --- the Whirlwind's end: the last sweep across the front, the follow-through and the settle
  if (!walking && now - m.spinEnd < 0.6 && heavySpins(sheet)) {
    const f = clip('attack_heavy', m.spinDir);
    const tail = f.slice(Math.max(...sheet.meta.anims.attack_heavy.loopFrames!) + 1);
    const u = (now - m.spinEnd) * 1000;
    if (tail.length && u < sum(tail)) return pose('attack_heavy', m.spinDir, tail[at(tail, u)][0]);
  }
  // --- a guard (the Guardian's Bulwark after a roll, Iron Skin, Aegis)
  if (h.drT > 0 && h.dr < 1 && !walking && sheet.has('block_hold')) {
    const dir = m.dir;
    if (now - m.guardAt < 0.14 && sheet.has('block_enter')) {
      const f = clip('block_enter', dir);
      return pose('block_enter', dir, f[at(f, (now - m.guardAt) * 1000)][0]);
    }
    return pose('block_hold', dir, loopK('block_hold', dir, now * 1000));
  }
  // --- hurt
  if (now - m.hurtAt < 0.34) {
    if (walking) flash = now - m.hurtAt < 0.08;
    else {
      const f = clip('hurt', m.dir);
      return pose('hurt', m.dir, f[at(f, (now - m.hurtAt) * 1000)][0]);
    }
  }
  // --- walking (or running): frames stepped by the distance covered, so planted feet stay planted
  // (facing the aim while attacking, whichever way the feet go)
  if (walking) {
    const dir = aiming ? aimDir : sheet.eightWay ? travelDir8(m.vx, m.vy, m.dir) : travelDir(m.vx, m.vy, m.dir);
    const f = clip(m.gait, dir);
    const stride = strideOf(sheet, m.gait);
    const cycle = stride.reduce((s, v) => s + v, 0);
    let p = (((m.step % 1) + 1) % 1) * cycle;
    let i = 0;
    while (i < f.length - 1 && p >= stride[i]) {
      p -= stride[i];
      i++;
    }
    return pose(m.gait, dir, f[i][0]);
  }
  const dir = aiming ? aimDir : h.moving ? m.dir : viewDir(h.view, h.dir);
  if (now - m.victoryAt < 2.6) return pose('victory', dir, loopK('victory', dir, (now - m.victoryAt) * 1000));
  // --- standing
  const foes = !w.hub && !w.camp && w.mobs.some((e) => !e.dead && e.awake && Math.abs(e.x - h.x) < 110 && Math.abs(e.y - h.y) < 90);
  if (foes) return pose('combat_idle', dir, loopK('combat_idle', dir, now * 1000 + h.uid * 97));
  // A blink now and then, on the breath's rest frame (the blink is that frame with the eyes shut).
  const f = clip('idle', dir);
  const total = sum(f);
  const ms = now * 1000 + h.uid * 131;
  const i = at(f, ((ms % total) + total) % total);
  if (i === 0 && now >= m.blinkAt && sheet.has('blink', dir)) {
    m.blinkUntil = now + 0.1;
    m.blinkAt = now + 2.5 + Math.random() * 2.5;
  }
  if (i === 0 && now < m.blinkUntil && sheet.has('blink', dir)) return pose('idle', dir, clip('blink', dir)[0][0]);
  return pose('idle', dir, f[i][0]);
}
