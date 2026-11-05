/**
 * The knights' kits. Every knight of a class has the same attack (along the aim of the knight you
 * steer; squadmates, and yours on Auto attack, at a foe in reach by themselves) and the same dash
 * (dash.ts), and rolls for its skills: a spin (ROLL_TIME, the
 * knight keeps moving and fighting) lands on a random skill from the knight's list
 * (src/core/skillbook.ts: six per class, a signature as the jackpot) and fires it right there, at
 * the knight or its foe. There's no cooldown: in a fight it goes roll, fire, roll, fire, the next
 * spin starting as soon as the skill has finished firing (the spin is the only wait; the skill button
 * starts one any time it's free). The result is decided when the spin starts, like the altar's; luck
 * leans it toward the rarer skills.
 *
 * Every skill always goes off: one with no foe in reach fires where the knight is heading.
 * Rarer skills are bigger: commons are one hit or one buff, rares are the old class specials, epics
 * and legendaries chain several beats (aftershocks, strike after strike, a rain of meteors), shake
 * the screen harder, and the legendaries flash it and hold the moment.
 */
import { RARITY_COLOR } from '../core/rarity';
import { SKILLS, TIER_NAME, TIER_RARITY, rollSkill, tierStep, type SkillDef, type SkillId } from '../core/skillbook';
import { HOLD_Y, aimAt, autoTarget, facingOf, inputAim, steerAim } from './aim';
import { dist, lineOfSight, moveUnit, norm, type Shot, type Unit } from './entities';
import { DASHES, endDash, rangerPlan, startDash, tickDash } from './dash';
import { isMeleeClass, startSwing, tickSwing } from './melee';
import { uid, type World } from './world';

/**
 * Seconds a skill roll spins before it lands (Quick Roll shortens it: the knight's rollTimeMult).
 * With no cooldowns the roll is the only wait between skills, so it takes its time.
 */
export const ROLL_TIME = 1.8;

/**
 * Seconds from a roll landing to its skill casting, by tier step (Common .. the jackpot). Legendary
 * and the jackpot pop out of the reel, grow on their way to the middle of the screen and cast as they
 * slam down; anything less casts the moment the reel stops.
 */
export const SLAM_TIME = [0, 0, 0, 0, 0.84, 1] as const;

/** Does a skill of this tier slam onto the screen before it casts? (Legendary and the jackpot.) */
export function slams(tier: SkillDef['tier']): boolean {
  return SLAM_TIME[Math.min(SLAM_TIME.length - 1, tierStep(tier))] > 0;
}
/** The longest a roll and its slam take together (tests and anything waiting on a cast). */
export const CAST_TIME = ROLL_TIME + SLAM_TIME[SLAM_TIME.length - 1];

/** Seconds this knight's skill roll spins: ROLL_TIME, shortened by Quick Roll. */
export function rollTime(h: Pick<Unit, 'rollTimeMult'>): number {
  const m = h.rollTimeMult;
  return ROLL_TIME * (typeof m === 'number' && Number.isFinite(m) ? Math.max(0.1, Math.min(1, m)) : 1);
}

/** A knight is in a fight while an awake foe stands this close (about a screen): its rolls chain. */
export const FIGHT_RANGE = 150;

/**
 * Is knight h's last skill still on its way or firing (slamming down onto the screen, its later
 * beats, a whirlwind or a lunge, a skill's leap)?
 */
export function skillFiring(h: Unit): boolean {
  return !!h.skillSlam || !!h.skillQueue?.length || !!h.channel || (!!h.rolling && h.rolling.land === undefined);
}

/** Is knight h in a fight (an awake foe close by)? */
export function inFight(w: World, h: Unit): boolean {
  if (w.hub || w.camp) return false;
  for (const m of w.mobs) if (!m.dead && m.awake && dist(m.x, m.y, h.x, h.y) < FIGHT_RANGE) return true;
  return false;
}

/** Movement, the auto attack, skill rolls and any running dodge or skill, every frame. */
export function heroTick(w: World, h: Unit, dt: number, mx: number, my: number): void {
  tickSkills(w, h, dt);
  tickSwing(w, h, dt);
  if (h.dodgeT! > 0) h.dodgeT! -= dt;
  // (A hold on its rolls: nothing in the game sets one now, but tests and tools do.)
  if (h.specialT! > 0) h.specialT! -= dt;
  if (h.aiming) h.aiming = Math.max(0, h.aiming - dt);
  // --- a dodge (or a skill's leap) in progress moves the knight on its own
  if (h.rolling) {
    const r = h.rolling;
    r.t -= dt;
    if (r.kind !== 'blink') moveUnit(w.map, h, r.dx * r.speed * dt, r.dy * r.speed * dt);
    if (w.perks.has('rollDancer')) {
      for (const e of w.enemiesIn('hero', h.x, h.y, 10)) {
        if (r.hit.has(e.uid)) continue;
        r.hit.add(e.uid);
        w.damage(e, h.atk, h, { knock: 6 });
      }
    }
    h.moving = true;
    // The class's dash at work (a skill's leap is only a leap).
    if (r.land !== undefined) tickDash(w, h, dt);
    if (r.t <= 0) {
      if (r.land !== undefined) endDash(w, h, r);
      h.rolling = undefined;
      // A dodge ends on its feet: the landing, where it can be hit again (a skill's leap just lands).
      if (r.land && r.land > 0) h.landing = { dx: r.dx, dy: r.dy, t: r.land, dur: r.land, speed: r.speed, kind: r.kind, of: r.dur + r.land };
      if (h.cls === 'guardian') guard(h, 0.5, 1);
    }
    return;
  }
  // --- the landing: sliding to a stop, no steering and no attacking yet
  if (h.landing) {
    const l = h.landing;
    l.t -= dt;
    const p = Math.min(1, 1 - l.t / l.dur);
    if (l.kind !== 'blink') {
      const sp = l.speed * (1 - 0.7 * p);
      moveUnit(w.map, h, l.dx * sp * dt, l.dy * sp * dt);
    }
    h.moving = true;
    if (l.t <= 0) h.landing = undefined;
    return;
  }
  // --- a channeled skill
  if (h.channel) {
    const c = h.channel;
    c.t -= dt;
    if (c.kind === 'whirlwind') {
      c.tick -= dt;
      if (c.tick <= 0) {
        c.tick = c.every ?? 0.22;
        for (const e of w.enemiesIn('hero', h.x, h.y - 4, c.r ?? 28)) w.damage(e, h.atk * (c.dmg ?? 0.8), h, { knock: c.knock ?? 5 });
        w.fx.push({ kind: 'spark', x: h.x, y: h.y - 6, color: '#e8f0ff' });
      }
      h.animT += dt * 3;
    } else if (c.kind === 'lunge') {
      const sp = c.speed ?? 300;
      moveUnit(w.map, h, c.dx * sp * dt, c.dy * sp * dt);
      for (const e of w.enemiesIn('hero', h.x, h.y - 4, 14)) {
        if (c.hit.has(e.uid)) continue;
        c.hit.add(e.uid);
        w.damage(e, h.atk * (c.dmg ?? 3), h, { knock: c.knock ?? 14, kx: c.dx, ky: c.dy, crit: true });
      }
      w.fx.push({ kind: 'dust', x: h.x, y: h.y });
    }
    if (c.t <= 0) h.channel = undefined;
    if (c.kind === 'lunge') {
      h.moving = true;
      return;
    }
  }
  // --- walking
  const len = Math.hypot(mx, my);
  const slow = h.slowT > 0 ? 0.6 : 1;
  const whirl = h.channel?.kind === 'whirlwind' ? 1.15 : 1;
  const haste = h.skillBuff?.moveSpd ?? 1;
  if (len > 0.1 && h.stunT <= 0) {
    const nx = mx / Math.max(1, len);
    const ny = my / Math.max(1, len);
    const sp = h.speed * slow * whirl * haste * dt;
    moveUnit(w.map, h, nx * sp, ny * sp);
    h.moving = true;
    if (Math.abs(nx) > 0.2) h.dir = nx > 0 ? 1 : -1;
    h.view = Math.abs(ny) > Math.abs(nx) * 0.9 ? (ny < 0 ? 'up' : 'down') : 'side';
  } else {
    h.moving = false;
  }
  // --- attacks: the squad's fire by themselves at the nearest foe in range; the knight you steer
  // attacks while you hold the attack (the mouse, J or K, the Attack button), exactly along its aim
  // (aim.ts), at its class's rate, at full speed on its feet, turned to face where it aims; with Auto
  // attack on it also aims and attacks by itself whenever a foe is in reach (you still move and dodge)
  if (h.atkT! > 0) h.atkT! -= dt * (1 + w.banner * 0.04) * (h.skillBuff?.atkSpd ?? 1);
  const ready = h.atkT! <= 0 && h.stunT <= 0 && h.channel?.kind !== 'whirlwind';
  if (h.slot === w.controlled && !w.bot) {
    let aim: [number, number] | null = null;
    if (w.input.attack) aim = steerAim(w, h, mx, my);
    else if (w.auto) {
      const t = autoTarget(w, h, mx, my, fireReach(h));
      if (t) aim = aimAt(h, t);
    } else h.aimLock = null;
    if (aim) {
      faceAlong(h, aim[0], aim[1], true);
      h.aiming = AIM_HOLD;
      if (ready) {
        attack(w, h, aim[0], aim[1]);
        h.atkT = h.atkCd! * STEER_CD;
      }
    }
  } else if (ready) {
    const t = w.nearestEnemy(h, fireReach(h), true);
    if (t) {
      const [ax, ay] = aimAt(h, t);
      attack(w, h, ax, ay);
      h.atkT = h.atkCd!;
    }
  }
}

/** How far a knight's attack reaches a foe's edge: its range, and a step more for a melee swing. */
function fireReach(h: Unit): number {
  return h.range! + (isMeleeClass(h.cls) ? 6 : 0);
}

/** Seconds the knight you steer keeps facing its aim after the attack is let go. */
const AIM_HOLD = 0.25;
/**
 * The knight you steer attacks this much more often than the class's rate (its cooldown times this):
 * aiming by hand misses now and then where the squad's AI never does, and your knight is the one
 * that carries the fight.
 */
export const STEER_CD = 0.85;

/** Turns knight h to face along (ax, ay) (`always`: its view too, even while it walks). */
function faceAlong(h: Unit, ax: number, ay: number, always = false): void {
  const [nx, ny] = norm(ax, ay);
  if (!nx && !ny) return;
  h.aimX = nx;
  h.aimY = ny;
  if (Math.abs(nx) > 0.15) h.dir = nx > 0 ? 1 : -1;
  if (always || !h.moving) h.view = Math.abs(ny) > Math.abs(nx) * 1.2 ? (ny < 0 ? 'up' : 'down') : 'side';
}

function face(h: Unit, x: number, y: number): void {
  faceAlong(h, x - h.x, y - h.y);
}

/** Is h the knight you steer, attacking right now? Its skills' shots and dashes go where it aims. */
function aimingNow(w: World, h: Unit): boolean {
  return h.slot === w.controlled && !w.bot && (h.aiming ?? 0) > 0;
}

function crit(w: World): boolean {
  return w.rng.chance(0.1);
}

/**
 * One attack exactly along (ax, ay), a unit vector (the aim, or the way to an AI's foe): the melee
 * classes swing a live hitbox that way (melee.ts: it cuts foes' shots too), even at the air; the
 * ranged ones shoot along it.
 */
function attack(w: World, h: Unit, ax: number, ay: number): void {
  faceAlong(h, ax, ay);
  const ranged = !isMeleeClass(h.cls);
  h.swingT = h.swingDur = ranged ? 0.22 : 0.26;
  const c = crit(w);
  const dmg = h.atk * (c ? 1.6 : 1);
  switch (h.cls) {
    case 'guardian':
    case 'blade':
    case 'lancer':
      startSwing(w, h, ax, ay, dmg, c);
      break;
    case 'ranger':
      shoot(w, h, ax, ay, { kind: 'arrow', speed: SHOT_SPEED.ranger, dmg, color: '#f0e0b0', r: 2 });
      break;
    case 'cleric':
      shoot(w, h, ax, ay, { kind: 'orb', speed: SHOT_SPEED.cleric, dmg, color: '#fff0a0', r: 3, heal: h.atk * 0.5 });
      break;
    case 'arcanist':
      // A light homing is the bolt's own (it still flies where it's aimed, and bends a little).
      shoot(w, h, ax, ay, { kind: 'bolt', speed: SHOT_SPEED.arcanist, dmg, color: '#b08aff', r: 3, homing: 2.2, splash: 16 });
      break;
  }
}

/** How fast each ranged class's shot flies (px/s): all well past the foes' (65 to 85 px/s). */
export const SHOT_SPEED = { ranger: 250, cleric: 170, arcanist: 185 } as const;
/** How far ahead of its hands a shot leaves (px). */
const MUZZLE = 5;

/** A shot from knight h's hands exactly along (dx, dy), a unit vector. */
function shoot(w: World, h: Unit, dx: number, dy: number, o: { kind: 'arrow' | 'orb' | 'bolt'; speed: number; dmg: number; color: string; r: number; heal?: number; homing?: number; splash?: number }): void {
  w.shots.push({
    uid: uid(),
    team: 'hero',
    x: h.x + dx * MUZZLE,
    y: h.y - HOLD_Y + dy * MUZZLE,
    vx: dx * o.speed,
    vy: dy * o.speed,
    r: o.r,
    dmg: o.dmg,
    life: 1.4,
    kind: o.kind,
    color: o.color,
    from: h.uid,
    ...(o.heal ? { heal: o.heal } : {}),
    ...(o.homing ? { homing: o.homing } : {}),
    ...(o.splash ? { splash: o.splash } : {}),
  });
}

/** The share of a dodge roll that's untouchable (the rest is the landing, where it can be hit). */
export const ROLL_SAFE = 0.8;

/**
 * The dodge: each class's dash (dash.ts: a Shield Bash, a Power Shot or a snare, a Phantom Dash, a
 * Blessed Step, a Blink, a Spear Lunge) toward where you're moving (standing still: toward your aim;
 * a squadmate dashes the way its AI says), untouchable for most of it (ROLL_SAFE), then a short
 * landing; no attacking until it's over.
 */
export function heroDodge(w: World, h: Unit, mx: number, my: number, fromHive = false): boolean {
  if (h.downed || h.rolling || h.landing || h.dodgeT! > 0 || h.stunT > 0 || h.channel?.kind === 'lunge') return false;
  let [dx, dy] = norm(mx, my);
  if (!dx && !dy) {
    if (h.slot === w.controlled && !w.bot) {
      // Standing still: toward the aim (the mouse, the drag, else the way the knight faces).
      [dx, dy] = inputAim(w, h) ?? facingOf(h);
    } else {
      // No direction given: away from the nearest foe (or the way the knight faces).
      const e = w.nearestEnemy(h, 120, false);
      if (e) [dx, dy] = norm(h.x - e.x, h.y - e.y);
      else [dx, dy] = [h.dir, 0];
    }
  }
  h.dodgeT = h.dodgeCd!;
  if (Math.abs(dx) > 0.2) h.dir = dx > 0 ? 1 : -1;
  // Each class's dash (dash.ts): how it rolls, how long and how far (the Ranger's, which way it goes).
  const k = DASHES[h.cls!];
  const plan = h.cls === 'ranger' ? rangerPlan(w, h, dx, dy) : { kind: k.kind, shot: null };
  // A roll cancels a swing (no attacking in a roll).
  h.swing = undefined;
  h.shove = undefined;
  const x0 = h.x;
  const y0 = h.y;
  // Untouchable in the air (most of the roll), then the landing, where it can be hit again.
  const air = k.dur * ROLL_SAFE;
  h.rolling = { dx, dy, t: air, dur: air, speed: k.dist / k.dur, kind: plan.kind, hit: new Set(), land: k.dur - air, shot: plan.shot };
  h.invuln = Math.max(h.invuln, air + 0.02);
  // Anything that misses the knight because of this roll makes it a perfect roll (world.ts evades).
  h.dodge = { until: w.time + air + 0.02, perfect: false };
  w.fx.push({ kind: 'dust', x: h.x, y: h.y });
  startDash(w, h, dx, dy, x0, y0);
  if (w.perks.has('kamikaze')) {
    w.areas.push({ uid: uid(), team: 'hero', x: h.x, y: h.y, r: 30, delay: 0.8, dur: 0, tick: 1, tickT: 0, dmg: h.atk * 3, kind: 'bomb', from: h.uid, color: '#ff8a3a', t: 0 });
  }
  // Hive Mind: the whole squad dodges with the knight you control.
  if (!fromHive && h.slot === w.controlled && w.perks.has('hiveMind')) {
    for (const o of w.heroes) if (o !== h && !o.downed) heroDodge(w, o, dx, dy, true);
  }
  return true;
}

// ================================================================== the skill roll

/**
 * The skill button (E, the SPECIAL slot, the AI, Tag Team): starts a skill roll. `free` (Tag Team)
 * rolls even while the last skill is still firing. False if no roll started (already rolling, the
 * last skill still firing, stunned, fallen).
 */
export function heroSpecial(w: World, h: Unit, free: boolean): boolean {
  return startSkillRoll(w, h, { free });
}

/** Starts a skill roll; `skill` decides where it lands (otherwise it's rolled, at the world's luck). */
export function startSkillRoll(w: World, h: Unit, o: { free?: boolean; skill?: SkillId } = {}): boolean {
  if (h.downed || h.skillRoll || h.skillSlam || !h.knightId) return false;
  if (!o.free && (h.stunT > 0 || skillFiring(h) || (h.specialT ?? 0) > 0)) return false;
  const luck = rollLuck(w);
  const forced = o.skill ?? h.skillRig;
  h.skillRig = undefined;
  const skill = forced ? SKILLS[forced] : rollSkill(h.knightId, luck, w.rng);
  // Hive Mind: your squadmates' rolls spin twice as fast.
  const hive = h.slot !== w.controlled && w.perks.has('hiveMind') ? 0.5 : 1;
  h.skillRoll = { skill: skill.id, t: 0, dur: rollTime(h) * hive, free: !!o.free, luck, seed: w.rng.int(1, 0x3fffffff) };
  w.fx.push({ kind: 'spark', x: h.x, y: h.y - 16, color: '#ffe27a' });
  for (const fn of listeners) fn({ phase: 'start', world: w, hero: h, skill, free: !!o.free, luck });
  return true;
}

/** The next roll of this knight lands on `skill` (tests, dev tools, scripted moments). */
export function rigSkill(h: Unit, skill: SkillId): void {
  h.skillRig = skill;
}

/**
 * The luck skill rolls use: the world's `luck` when the game sets it (World.luck, the player's luck
 * times Loaded Dice), else 1.
 */
export function rollLuck(w: World): number {
  const l = (w as { luck?: unknown }).luck;
  return typeof l === 'number' && Number.isFinite(l) && l >= 1 ? l : 1;
}

export interface SkillRollEvent {
  /**
   * 'start': a roll began spinning (its result already decided); 'reveal': it stopped on its skill,
   * which is on its way to slam down; 'land': it slammed and the skill fired.
   */
  phase: 'start' | 'reveal' | 'land';
  world: World;
  hero: Unit;
  skill: SkillDef;
  free: boolean;
  luck: number;
}

const listeners = new Set<(e: SkillRollEvent) => void>();

/** Hear every skill roll start and land (sounds, stats, tests). Returns the way to stop listening. */
export function onSkillRoll(fn: (e: SkillRollEvent) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Rolls spinning, beats still to come and boosts, every frame (before anything else in heroTick); in
 * a fight, the next roll as soon as the last skill is done.
 */
function tickSkills(w: World, h: Unit, dt: number): void {
  // heroTick only runs for standing knights: a knight that fell loses its spinning roll, its
  // skill's beats still to come and its boost.
  for (const o of w.heroes) if (o.downed && (o.skillRoll || o.skillSlam || o.skillQueue || o.skillBuff)) dropSkills(o);
  if (h.skillQueue) {
    const q = h.skillQueue;
    for (const b of q) b.t -= dt;
    h.skillQueue = q.filter((b) => b.t > 0);
    for (const b of q) if (b.t <= 0) b.run();
    if (h.skillQueue.length === 0) h.skillQueue = undefined;
  }
  const r = h.skillRoll;
  if (r) {
    r.t += dt;
    // A glint over the knight's head while it spins.
    if (Math.floor((r.t - dt) / 0.18) !== Math.floor(r.t / 0.18)) w.fx.push({ kind: 'spark', x: h.x + w.rng.float(-5, 5), y: h.y - 18, color: '#ffe27a' });
    if (r.t >= r.dur) reveal(w, h, r);
  }
  const sl = h.skillSlam;
  if (sl) {
    sl.t += dt;
    if (sl.t >= sl.dur) land(w, h, sl);
  }
  const b = h.skillBuff;
  if (b) {
    b.t -= dt;
    if (b.t <= 0) h.skillBuff = undefined;
    else if (Math.floor((b.t + dt) / 0.4) !== Math.floor(b.t / 0.4)) w.fx.push({ kind: 'spark', x: h.x, y: h.y - 8, color: b.color });
  }
  // No cooldown: in a fight, once its skill has finished firing, the next roll starts straight away.
  if (!h.skillRoll && !h.downed && inFight(w, h)) startSkillRoll(w, h);
}

function dropSkills(h: Unit): void {
  h.skillRoll = undefined;
  h.skillSlam = undefined;
  h.skillQueue = undefined;
  h.skillBuff = undefined;
}

/** The roll stopped on its skill: a Legendary slams down (and casts) SLAM_TIME later; anything else casts now. */
function reveal(w: World, h: Unit, r: NonNullable<Unit['skillRoll']>): void {
  h.skillRoll = undefined;
  const skill = SKILLS[r.skill];
  const slam = { skill: r.skill, t: 0, dur: SLAM_TIME[Math.min(SLAM_TIME.length - 1, tierStep(skill.tier))], free: r.free, luck: r.luck };
  for (const fn of listeners) fn({ phase: 'reveal', world: w, hero: h, skill, free: r.free, luck: r.luck });
  if (slam.dur > 0) h.skillSlam = slam;
  else land(w, h, slam);
}

function land(w: World, h: Unit, r: NonNullable<Unit['skillSlam']>): void {
  h.skillSlam = undefined;
  const skill = SKILLS[r.skill];
  if (h.slot === w.controlled && r.dur > 0) {
    // Your Legendary slams onto the screen: the world feels it.
    const step = tierStep(skill.tier);
    w.shakeIt(step >= 5 ? 6 : 4.5, 0.36 + (step - 4) * 0.05);
    w.hitStop = Math.max(w.hitStop, step >= 5 ? 0.12 : 0.09);
  }
  castSkill(w, h, skill.id);
  // No cooldown: in a fight the next roll starts as soon as this skill is done firing (tickSkills).
  h.lastSkill = { skill: skill.id, at: w.time, n: (h.lastSkill?.n ?? 0) + 1, free: r.free };
  for (const fn of listeners) fn({ phase: 'land', world: w, hero: h, skill, free: r.free, luck: r.luck });
}

/** Fires a skill on the spot, with no roll (a roll calls it as it lands). */
export function castSkill(w: World, h: Unit, id: SkillId): void {
  const sk = SKILLS[id];
  h.swingT = h.swingDur = 0.35;
  announce(w, h, sk);
  effect(w, h, sk);
}

/** The skill's name over the knight in its color; Epic and up say their tier, Legendary and up flash the screen. */
function announce(w: World, h: Unit, sk: SkillDef): void {
  const step = tierStep(sk.tier);
  // (Rewind calls itself out; your own Legendary's name is stamped on the screen as it slams down.)
  // (Not shown, a name still takes its jitter's draw: the world's random stream stays as it was.)
  const mine = h.slot === w.controlled && slams(sk.tier);
  const say = (x: number, y: number, text: string, color: string) => (mine ? w.rng.float(-3, 3) : w.text(x, y, text, color, true));
  if (sk.id !== 'rewind') say(h.x, h.y - 30, `${sk.name.toUpperCase()}!`, sk.color);
  if (step < 3) return;
  const tc = RARITY_COLOR[TIER_RARITY[sk.tier]];
  say(h.x, h.y - 40, TIER_NAME[sk.tier].toUpperCase(), tc);
  w.fx.push({ kind: 'levelup', x: h.x, y: h.y, color: tc });
  if (step < 4) return;
  // The renderer's portal burst carries the only full-screen flash: the rarest skills borrow it.
  w.fx.push({ kind: 'portal', x: h.x, y: h.y });
  w.hitStop = Math.max(w.hitStop, 0.08);
}

// ================================================================== the skills

function effect(w: World, h: Unit, sk: SkillDef): void {
  const a = h.atk;
  const c = sk.color;
  switch (sk.id) {
    // ------------------------------------------------------------ Guardian
    case 'shieldSlam': {
      // The shield into everything in front (facing the nearest foe first).
      const n = SKILLS.shieldSlam.n;
      const t = foeFor(w, h, n.r + 24);
      const [dx, dy] = heading(w, h, t);
      face(h, h.x + dx * 10, h.y + dy * 10);
      const cx = h.x + dx * 12;
      const cy = h.y + dy * 12;
      for (const e of w.enemiesIn('hero', cx, cy - 4, n.r)) {
        const [ex, ey] = norm(e.x - h.x, e.y - h.y);
        if (ex * dx + ey * dy < -0.2 && dist(e.x, e.y, h.x, h.y) > 10) continue;
        const [kx, ky] = ex || ey ? [ex, ey] : [dx, dy];
        hit(w, h, e, n.dmg, { knock: n.knock, kx, ky, crit: true });
        stun(w, e, n.stun);
      }
      w.fx.push({ kind: 'blast', x: cx, y: cy, color: c, size: 1.2, src: 'slam' });
      w.shakeIt(2, 0.15);
      break;
    }
    case 'ironSkin': {
      const n = SKILLS.ironSkin.n;
      guard(h, n.dr, n.dur);
      w.heal(h, h.maxHp * n.heal);
      for (const e of w.livingMobs()) if (dist(e.x, e.y, h.x, h.y) <= n.r) taunt(w, e, h, n.taunt);
      w.fx.push({ kind: 'levelup', x: h.x, y: h.y, color: c });
      w.fx.push({ kind: 'shock', x: h.x, y: h.y, color: c, size: 2, src: 'taunt' });
      break;
    }
    case 'groundPound': {
      const n = SKILLS.groundPound.n;
      quake(w, h, h.x, h.y, n.r, n.dmg, n.stun, n.knock, c);
      w.shakeIt(4, 0.3);
      break;
    }
    case 'rallyingTaunt': {
      // Every foe nearby turns on the Guardian; a shockwave knocks them back.
      const n = SKILLS.rallyingTaunt.n;
      guard(h, n.dr, n.taunt);
      for (const e of w.livingMobs()) {
        if (dist(e.x, e.y, h.x, h.y) > n.r) continue;
        taunt(w, e, h, n.taunt);
        hit(w, h, e, n.dmg, { knock: n.knock });
      }
      w.fx.push({ kind: 'shock', x: h.x, y: h.y, color: c, size: 4, src: 'taunt' });
      w.shakeIt(3, 0.25);
      break;
    }
    case 'aegis': {
      const n = SKILLS.aegis.n;
      for (const o of w.livingHeroes()) {
        guard(o, n.dr, n.dur);
        w.heal(o, o.maxHp * n.heal);
        w.fx.push({ kind: 'levelup', x: o.x, y: o.y, color: c });
      }
      for (const e of w.enemiesIn('hero', h.x, h.y, n.r)) hit(w, h, e, n.dmg, { knock: n.knock });
      w.fx.push({ kind: 'shock', x: h.x, y: h.y, color: c, size: 5, src: 'taunt' });
      w.shakeIt(4, 0.3);
      break;
    }
    case 'titansWrath': {
      const n = SKILLS.titansWrath.n;
      quake(w, h, h.x, h.y, n.r, n.dmg, n.stun, n.knock, c);
      for (const e of w.livingMobs()) if (dist(e.x, e.y, h.x, h.y) <= n.tauntR) taunt(w, e, h, n.taunt);
      guard(h, n.dr, n.dur);
      w.shakeIt(7, 0.6);
      w.hitStop = Math.max(w.hitStop, 0.14);
      for (let i = 1; i <= n.after; i++) {
        later(h, i * n.every, () => {
          quake(w, h, h.x, h.y, n.afterR, n.afterDmg, 1, 12, c);
          w.shakeIt(4, 0.2);
        });
      }
      break;
    }
    // ------------------------------------------------------------ Blade
    case 'twinSlash': {
      const n = SKILLS.twinSlash.n;
      slash(w, h, n.dmg, n.r, n.knock);
      later(h, n.gap, () => slash(w, h, n.dmg, n.r, n.knock));
      break;
    }
    case 'battleCry': {
      const n = SKILLS.battleCry.n;
      boost(h, n.atkSpd, n.moveSpd, n.dur, c);
      w.fx.push({ kind: 'levelup', x: h.x, y: h.y, color: c });
      w.fx.push({ kind: 'blast', x: h.x, y: h.y - 4, color: c, size: 1 });
      w.shakeIt(2, 0.15);
      break;
    }
    case 'shadowstep': {
      const n = SKILLS.shadowstep.n;
      const t = foeFor(w, h, n.reach);
      w.fx.push({ kind: 'spark', x: h.x, y: h.y - 8, color: c });
      w.fx.push({ kind: 'dust', x: h.x, y: h.y, color: '#3a2a50' });
      if (t) {
        // Behind it, and a stab in the back.
        const [dx, dy] = norm(t.x - h.x, t.y - h.y);
        blinkTo(w, h, t.x + dx * (t.r + 7), t.y + dy * (t.r + 7));
        face(h, t.x, t.y);
        h.invuln = Math.max(h.invuln, 0.35);
        hit(w, h, t, n.dmg, { crit: true, knock: 8, kx: -dx, ky: -dy });
        stun(w, t, n.stun);
        w.fx.push({ kind: 'crit', x: t.x, y: t.y - 6, color: c });
      } else {
        const [dx, dy] = heading(w, h, null);
        blinkTo(w, h, h.x + dx * 48, h.y + dy * 48);
      }
      w.fx.push({ kind: 'spark', x: h.x, y: h.y - 8, color: c });
      break;
    }
    case 'whirlwind': {
      const n = SKILLS.whirlwind.n;
      h.channel = { kind: 'whirlwind', t: n.dur, dur: n.dur, tick: 0, dx: 0, dy: 0, hit: new Set(), dmg: n.dmg, r: n.r, every: n.every, knock: n.knock };
      break;
    }
    case 'thousandCuts': {
      const n = SKILLS.thousandCuts.n;
      const cx = h.x;
      const cy = h.y;
      h.invuln = Math.max(h.invuln, n.strikes * n.every + 0.25);
      for (let i = 0; i < n.strikes; i++) {
        later(h, i * n.every, () => {
          const foes = w.enemiesIn('hero', cx, cy, n.reach).filter((e) => lineOfSight(w.map, cx, cy - 4, e.x, e.y - 4));
          const e = foes.length ? foes[Math.floor(w.rng.next() * foes.length)] : null;
          w.fx.push({ kind: 'spark', x: h.x, y: h.y - 8, color: c });
          h.swingT = h.swingDur = 0.12;
          if (!e) return;
          const ang = w.rng.float(0, Math.PI * 2);
          blinkTo(w, h, e.x + Math.cos(ang) * (e.r + 6), e.y + Math.sin(ang) * (e.r + 6) * 0.6);
          face(h, e.x, e.y);
          hit(w, h, e, n.dmg, { crit: true, knock: 4 });
          w.fx.push({ kind: 'crit', x: e.x, y: e.y - 6, color: c });
          w.shakeIt(2, 0.08);
        });
      }
      break;
    }
    case 'excalibur': {
      // A line of blasts toward the foe, stopping at the first wall, the last one the biggest.
      const n = SKILLS.excalibur.n;
      const t = foeFor(w, h, n.blasts * n.step);
      const [dx, dy] = heading(w, h, t);
      face(h, h.x + dx * 10, h.y + dy * 10);
      const pts: Array<[number, number]> = [];
      for (let i = 1; i <= n.blasts + 1; i++) {
        const x = h.x + dx * n.step * i;
        const y = h.y + dy * n.step * i;
        if (!lineOfSight(w.map, h.x, h.y, x, y)) break;
        pts.push([x, y]);
      }
      if (!pts.length) pts.push([h.x + dx * 10, h.y + dy * 10]);
      pts.forEach(([x, y], i) => {
        const end = i === pts.length - 1;
        blast(w, h, x, y, end ? n.endR : n.r, end ? n.endDmg : n.dmg, 0.15 + (i + 1) * n.every + (end ? 0.08 : 0), c);
      });
      w.fx.push({ kind: 'blast', x: h.x + dx * 8, y: h.y + dy * 8 - 6, color: c, size: 1.2 });
      w.shakeIt(5, 0.5);
      break;
    }
    // ------------------------------------------------------------ Ranger
    case 'powerShot': {
      const n = SKILLS.powerShot.n;
      const [dx, dy] = aimShot(w, h, foeFor(w, h, 220));
      fire(w, h, dx, dy, { kind: 'arrow', speed: n.speed, dmg: a * n.dmg, color: c, r: 3, life: 1.2, pierce: n.pierce });
      w.fx.push({ kind: 'spark', x: h.x + h.dir * 4, y: h.y - 10, color: c });
      break;
    }
    case 'fanShot': {
      const n = SKILLS.fanShot.n;
      const [dx, dy] = aimShot(w, h, foeFor(w, h, 200));
      const base = Math.atan2(dy, dx);
      for (let i = 0; i < n.arrows; i++) {
        const ang = base + (i - (n.arrows - 1) / 2) * n.spread;
        fire(w, h, Math.cos(ang), Math.sin(ang), { kind: 'arrow', speed: n.speed, dmg: a * n.dmg, color: c, r: 2, life: 1.2 });
      }
      break;
    }
    case 'snare': {
      // An arrow, and where it lands a net: everyone in it tangled.
      const n = SKILLS.snare.n;
      const t = foeFor(w, h, n.reach);
      const [dx, dy] = aimShot(w, h, t);
      const tx = t ? t.x : h.x + dx * 90;
      const ty = t ? t.y : h.y + dy * 90;
      fire(w, h, dx, dy, { kind: 'arrow', speed: n.speed, dmg: a, color: c, r: 2, life: 1.4 });
      later(h, Math.min(1.2, dist(h.x, h.y, tx, ty) / n.speed), () => {
        const x = t && !t.dead ? t.x : tx;
        const y = t && !t.dead ? t.y : ty;
        for (const e of w.enemiesIn('hero', x, y, n.r)) {
          hit(w, h, e, n.dmg, {});
          stun(w, e, n.stun);
        }
        w.fx.push({ kind: 'blast', x, y, color: c, size: n.r / 14, src: 'slam' });
        w.text(x, y - 18, 'TANGLED!', c);
      });
      break;
    }
    case 'arrowRain': {
      const n = SKILLS.arrowRain.n;
      const spot = spotFor(w, h, n.reach, n.r);
      face(h, spot.x, spot.y);
      rain(w, h, spot.x, spot.y, n.r, n.dur, n.every, n.dmg, 0.25, c);
      break;
    }
    case 'arrowNova': {
      const n = SKILLS.arrowNova.n;
      const near = w.nearestEnemy(h, 120, false);
      const [lx, ly] = near ? norm(h.x - near.x, h.y - near.y) : [-h.dir, 0];
      leap(h, lx || -h.dir, ly, n.leap, 0.36, 'flip');
      for (let k = 0; k < n.rings; k++) {
        later(h, 0.1 + k * n.gap, () => {
          const off = (k % 2) * (Math.PI / n.arrows);
          for (let i = 0; i < n.arrows; i++) {
            const ang = (i / n.arrows) * Math.PI * 2 + off;
            fire(w, h, Math.cos(ang), Math.sin(ang), { kind: 'arrow', speed: n.speed, dmg: a * n.dmg, color: c, r: 2, life: 1, pierce: 1, x: h.x, y: h.y - 8 });
          }
          w.fx.push({ kind: 'blast', x: h.x, y: h.y - 8, color: c, size: 1.2 });
          w.shakeIt(3, 0.15);
        });
      }
      break;
    }
    case 'thousandArrows': {
      // Rain on every group of foes it can see (or that's awake), nearest first.
      const n = SKILLS.thousandArrows.n;
      const foes = w
        .livingMobs()
        .filter((e) => dist(e.x, e.y, h.x, h.y) <= n.reach && (e.awake || lineOfSight(w.map, h.x, h.y - 4, e.x, e.y - 4)))
        .sort((p, q) => dist(p.x, p.y, h.x, h.y) - dist(q.x, q.y, h.x, h.y));
      const spots: Array<{ x: number; y: number }> = [];
      for (const e of foes) {
        if (spots.length >= n.spots) break;
        if (spots.some((s) => dist(s.x, s.y, e.x, e.y) < n.r)) continue;
        spots.push({ x: e.x, y: e.y });
      }
      if (!spots.length) {
        const [dx, dy] = heading(w, h, null);
        for (let k = 1; k <= 3; k++) spots.push({ x: h.x + dx * 30 * k, y: h.y + dy * 30 * k });
      }
      spots.forEach((s, k) => rain(w, h, s.x, s.y, n.r, n.dur, n.every, n.dmg, 0.2 + k * 0.08, c));
      w.shakeIt(5, 0.5);
      break;
    }
    // ------------------------------------------------------------ Cleric
    case 'mend': {
      // The most hurt knight standing (only Epic and Legendary skills raise the fallen).
      const n = SKILLS.mend.n;
      const o = mostHurt(w) ?? h;
      for (const p of w.livingHeroes()) if (p !== o) w.clericHeal(p, p.maxHp * n.rest);
      w.clericHeal(o, o.maxHp * n.heal);
      w.fx.push({ kind: 'levelup', x: o.x, y: o.y, color: c });
      w.areas.push({ uid: uid(), team: 'hero', x: o.x, y: o.y, r: 14, delay: 0, dur: 1, tick: 1, tickT: 1, dmg: 0, kind: 'glow', from: h.uid, color: c, t: 0 });
      break;
    }
    case 'smite': {
      const n = SKILLS.smite.n;
      const t = foeFor(w, h, n.reach);
      const spot = t ? { x: t.x, y: t.y } : spotFor(w, h, n.reach, n.r);
      face(h, spot.x, spot.y);
      blast(w, h, spot.x, spot.y, n.r, n.dmg, n.delay, c);
      later(h, n.delay, () => w.fx.push({ kind: 'levelup', x: spot.x, y: spot.y, color: c }));
      for (const o of w.livingHeroes()) w.clericHeal(o, o.maxHp * n.heal);
      break;
    }
    case 'blessing': {
      const n = SKILLS.blessing.n;
      for (const o of w.livingHeroes()) {
        w.clericHeal(o, o.maxHp * n.heal);
        boost(o, n.atkSpd, 1, n.dur, c);
        w.fx.push({ kind: 'levelup', x: o.x, y: o.y, color: c });
      }
      break;
    }
    case 'sanctuary': {
      const n = SKILLS.sanctuary.n;
      for (const o of w.livingHeroes()) w.clericHeal(o, o.maxHp * n.heal);
      w.areas.push({ uid: uid(), team: 'hero', x: h.x, y: h.y, r: n.r, delay: 0, dur: n.dur, tick: n.every, tickT: n.every, dmg: 0, heal: n.regen, kind: 'sanctuary', from: h.uid, color: c, t: 0 });
      w.fx.push({ kind: 'levelup', x: h.x, y: h.y, color: c });
      break;
    }
    case 'guardianAngel': {
      const n = SKILLS.guardianAngel.n;
      for (const o of w.livingHeroes()) w.clericHeal(o, o.maxHp * n.heal);
      if (!w.perks.has('bloodPact')) for (const o of w.heroes) if (o.downed) w.revive(o, n.revive);
      for (const o of w.livingHeroes()) {
        o.invuln = Math.max(o.invuln, n.invuln);
        w.fx.push({ kind: 'revive', x: o.x, y: o.y, color: c });
      }
      w.shakeIt(3, 0.3);
      break;
    }
    case 'miracle': {
      const n = SKILLS.miracle.n;
      for (const o of w.livingHeroes()) w.clericHeal(o, o.maxHp);
      if (!w.perks.has('bloodPact')) for (const o of w.heroes) if (o.downed) w.revive(o, 1);
      for (const o of w.livingHeroes()) {
        o.invuln = Math.max(o.invuln, n.invuln);
        w.fx.push({ kind: 'revive', x: o.x, y: o.y, color: c });
      }
      // Then holy light falls on every foe around, one after another.
      const foes = w
        .livingMobs()
        .filter((e) => dist(e.x, e.y, h.x, h.y) <= n.r)
        .sort((p, q) => dist(p.x, p.y, h.x, h.y) - dist(q.x, q.y, h.x, h.y));
      foes.forEach((e, k) => {
        later(h, 0.15 + k * n.every, () => {
          if (e.dead) return;
          hit(w, h, e, n.dmg, { crit: true });
          stun(w, e, n.stun);
          w.fx.push({ kind: 'blast', x: e.x, y: e.y, color: c, size: 1 });
          w.fx.push({ kind: 'levelup', x: e.x, y: e.y, color: c });
        });
      });
      w.shakeIt(6, 0.5);
      break;
    }
    // ------------------------------------------------------------ Arcanist
    case 'magicMissiles': {
      const n = SKILLS.magicMissiles.n;
      const [dx, dy] = aimShot(w, h, foeFor(w, h, 200));
      const base = Math.atan2(dy, dx);
      for (let i = 0; i < n.missiles; i++) {
        const ang = base + (i - (n.missiles - 1) / 2) * n.spread;
        fire(w, h, Math.cos(ang), Math.sin(ang), { kind: 'bolt', speed: n.speed, dmg: a * n.dmg, color: c, r: 3, life: 1.8, homing: n.homing, splash: n.splash });
      }
      break;
    }
    case 'frostNova': {
      const n = SKILLS.frostNova.n;
      for (const e of w.enemiesIn('hero', h.x, h.y, n.r)) {
        hit(w, h, e, n.dmg, { knock: n.knock, color: c });
        e.slowT = Math.max(e.slowT, n.slow);
      }
      w.fx.push({ kind: 'blast', x: h.x, y: h.y, color: c, size: n.r / 14, src: 'slam' });
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        w.fx.push({ kind: 'spark', x: h.x + Math.cos(ang) * n.r * 0.8, y: h.y + Math.sin(ang) * n.r * 0.5, color: c });
      }
      w.shakeIt(2, 0.2);
      break;
    }
    case 'chainLightning': {
      const n = SKILLS.chainLightning.n;
      const first = foeFor(w, h, n.reach);
      if (!first) {
        const [dx, dy] = heading(w, h, null);
        w.fx.push({ kind: 'shock', x: h.x + dx * 20, y: h.y + dy * 20, color: c, size: 1 });
        break;
      }
      face(h, first.x, first.y);
      const done = new Set<number>();
      const zap = (e: Unit, left: number) => {
        done.add(e.uid);
        hit(w, h, e, n.dmg, { color: c });
        stun(w, e, n.stun);
        w.fx.push({ kind: 'shock', x: e.x, y: e.y, color: c, size: 1 });
        if (left <= 0) return;
        const fx = e.x;
        const fy = e.y;
        later(h, n.every, () => {
          let next: Unit | null = null;
          let bd: number = n.range;
          for (const o of w.livingMobs()) {
            if (done.has(o.uid)) continue;
            const d = dist(fx, fy, o.x, o.y);
            if (d < bd && lineOfSight(w.map, fx, fy - 4, o.x, o.y - 4)) {
              bd = d;
              next = o;
            }
          }
          if (next) zap(next, left - 1);
        });
      };
      zap(first, n.jumps - 1);
      break;
    }
    case 'meteor': {
      const n = SKILLS.meteor.n;
      const spot = spotFor(w, h, n.reach, n.r);
      face(h, spot.x, spot.y);
      w.areas.push({ uid: uid(), team: 'hero', x: spot.x, y: spot.y, r: n.r, delay: n.delay, dur: 0, tick: 1, tickT: 0, dmg: a * n.dmg, kind: 'meteor', from: h.uid, color: '#ff8a3a', t: 0 });
      break;
    }
    case 'singularity': {
      // A ring that fills as it drags foes in (the area is only its picture and its bang), then bursts.
      const n = SKILLS.singularity.n;
      const spot = spotFor(w, h, n.reach, 40);
      face(h, spot.x, spot.y);
      w.areas.push({ uid: uid(), team: 'hero', x: spot.x, y: spot.y, r: n.burstR, delay: n.dur, dur: 0, tick: 1, tickT: 0, dmg: 0, kind: 'blast', from: h.uid, color: c, t: 0 });
      const step = 0.05;
      const ticks = Math.round(n.dur / step);
      const grindEvery = Math.max(1, Math.round(n.every / step));
      for (let k = 0; k < ticks; k++) {
        later(h, k * step, () => {
          for (const e of w.enemiesIn('hero', spot.x, spot.y, n.r)) {
            const d = dist(e.x, e.y, spot.x, spot.y);
            if (!e.boss && d > 2) {
              const [dx, dy] = norm(spot.x - e.x, spot.y - e.y);
              const pull = Math.min(d, n.pull * step);
              moveUnit(w.map, e, dx * pull, dy * pull);
            }
            if (k % grindEvery === 0 && d <= n.burstR) hit(w, h, e, n.dmg, { color: c, silent: k % (grindEvery * 2) !== 0 });
          }
          if (k % 2 === 0) {
            const ang = w.rng.float(0, Math.PI * 2);
            w.fx.push({ kind: 'spark', x: spot.x + Math.cos(ang) * n.r * 0.7, y: spot.y + Math.sin(ang) * n.r * 0.42, color: c });
          }
        });
      }
      later(h, n.dur, () => {
        for (const e of w.enemiesIn('hero', spot.x, spot.y, n.burstR)) {
          const [ox, oy] = norm(e.x - spot.x, e.y - spot.y);
          const [kx, ky] = ox || oy ? [ox, oy] : [1, 0];
          hit(w, h, e, n.burst, { knock: 20, kx, ky, crit: true });
        }
        w.shakeIt(5, 0.35);
      });
      break;
    }
    case 'meteorStorm': {
      // Meteors on the thickest groups first, one after another.
      const n = SKILLS.meteorStorm.n;
      const foes = w
        .livingMobs()
        .filter((e) => dist(e.x, e.y, h.x, h.y) <= n.reach && (e.awake || lineOfSight(w.map, h.x, h.y - 4, e.x, e.y - 4)))
        .map((e) => ({ e, crowd: w.enemiesIn('hero', e.x, e.y, n.r).length + (e.boss ? 3 : 0) }))
        .sort((p, q) => q.crowd - p.crowd);
      for (let k = 0; k < n.meteors; k++) {
        const f = foes.length ? foes[k % foes.length].e : null;
        const ang = w.rng.float(0, Math.PI * 2);
        const x = f ? f.x + w.rng.float(-8, 8) : h.x + Math.cos(ang) * w.rng.float(20, 70);
        const y = f ? f.y + w.rng.float(-6, 6) : h.y + Math.sin(ang) * w.rng.float(14, 50);
        w.areas.push({ uid: uid(), team: 'hero', x, y, r: n.r, delay: 0.9 + k * n.every, dur: 0, tick: 1, tickT: 0, dmg: a * n.dmg, kind: 'meteor', from: h.uid, color: '#ff8a3a', t: 0 });
      }
      w.shakeIt(3, 0.4);
      break;
    }
    // ------------------------------------------------------------ Lancer
    case 'javelin': {
      const n = SKILLS.javelin.n;
      const [dx, dy] = aimShot(w, h, foeFor(w, h, 220));
      fire(w, h, dx, dy, { kind: 'spear', speed: n.speed, dmg: a * n.dmg, color: c, r: 3, life: 1.1, pierce: n.pierce });
      break;
    }
    case 'sweep': {
      const n = SKILLS.sweep.n;
      for (const e of w.enemiesIn('hero', h.x, h.y - 2, n.r)) hit(w, h, e, n.dmg, { knock: n.knock });
      w.fx.push({ kind: 'crit', x: h.x, y: h.y - 6, color: c });
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        w.fx.push({ kind: 'dust', x: h.x + Math.cos(ang) * n.r * 0.7, y: h.y + Math.sin(ang) * n.r * 0.45 });
      }
      w.shakeIt(2, 0.15);
      break;
    }
    case 'impale': {
      const n = SKILLS.impale.n;
      const [dx, dy] = heading(w, h, foeFor(w, h, n.reach + 30));
      face(h, h.x + dx * 10, h.y + dy * 10);
      const line = w
        .livingMobs()
        .map((e) => ({ e, along: (e.x - h.x) * dx + (e.y - h.y) * dy, across: Math.abs((e.x - h.x) * dy - (e.y - h.y) * dx) }))
        .filter((o) => o.along > -4 && o.along < n.reach + o.e.r && o.across < 7 + o.e.r)
        .sort((p, q) => p.along - q.along);
      line.forEach(({ e }, i) => {
        if (i === 0) {
          hit(w, h, e, n.dmg, { crit: true, knock: 4, kx: dx, ky: dy });
          stun(w, e, n.stun);
          w.fx.push({ kind: 'crit', x: e.x, y: e.y - 6, color: c });
        } else hit(w, h, e, n.pierceDmg, { knock: 6, kx: dx, ky: dy });
      });
      for (let k = 1; k <= 4; k++) w.fx.push({ kind: 'dust', x: h.x + dx * k * 13, y: h.y + dy * k * 13, color: c });
      w.shakeIt(2, 0.15);
      break;
    }
    case 'dragonLunge': {
      const n = SKILLS.dragonLunge.n;
      lunge(w, h, n.dur, n.speed, n.dmg, n.knock, foeFor(w, h, n.reach));
      break;
    }
    case 'wyrmRush': {
      const n = SKILLS.wyrmRush.n;
      h.invuln = Math.max(h.invuln, (n.lunges - 1) * n.gap + n.dur + 0.1);
      for (let k = 0; k < n.lunges; k++) {
        later(h, k * n.gap, () => {
          lunge(w, h, n.dur, n.speed, n.dmg, 14, foeFor(w, h, n.reach));
          w.fx.push({ kind: 'spark', x: h.x, y: h.y - 8, color: c });
          w.shakeIt(2, 0.1);
        });
      }
      break;
    }
    case 'skyfall': {
      // Up (a vault, untouchable) to the biggest group, then down on it.
      const n = SKILLS.skyfall.n;
      const spot = spotFor(w, h, n.reach, 40);
      const d = Math.min(n.reach, dist(h.x, h.y, spot.x, spot.y));
      const [dx, dy] = d > 1 ? norm(spot.x - h.x, spot.y - h.y) : [h.dir, 0];
      leap(h, dx, dy, d, n.leap, 'vault');
      later(h, n.leap, () => {
        const x = h.x;
        const y = h.y;
        for (const e of w.enemiesIn('hero', x, y, n.r)) {
          hit(w, h, e, n.dmg, { knock: n.knock, crit: true });
          stun(w, e, n.stun);
        }
        for (let i = 0; i < n.shards; i++) {
          const ang = (i / n.shards) * Math.PI * 2;
          fire(w, h, Math.cos(ang), Math.sin(ang), { kind: 'spear', speed: 200, dmg: a * n.shardDmg, color: c, r: 2, life: 0.7, pierce: 2, x, y: y - 6 });
        }
        w.areas.push({ uid: uid(), team: 'hero', x, y, r: Math.round(n.r * 0.7), delay: 0, dur: n.fire, tick: 0.5, tickT: 0, dmg: a * 0.25, kind: 'fire', from: h.uid, color: '#ff7a2a', t: 0 });
        w.fx.push({ kind: 'blast', x, y, color: c, size: n.r / 12, src: 'meteor' });
        w.shakeIt(7, 0.5);
        w.hitStop = Math.max(w.hitStop, 0.12);
      });
      break;
    }
    // ------------------------------------------------------------ signatures
    case 'rewind': {
      const n = SKILLS.rewind.n;
      if (!w.startRewind()) {
        // Time won't turn back just now (it only just did): it stops instead.
        for (const e of w.enemiesIn('hero', h.x, h.y, n.stopR)) stun(w, e, n.stop);
        for (const o of w.livingHeroes()) o.invuln = Math.max(o.invuln, 1);
        w.fx.push({ kind: 'shock', x: h.x, y: h.y, color: c, size: 6 });
        w.text(h.x, h.y - 30, 'TIME STOP!', c, true);
      }
      break;
    }
    default: {
      const missing: never = sk.id;
      throw new Error(`No effect for skill ${String(missing)}`);
    }
  }
}

// ================================================================== the pieces skills are built from

/** The foe a skill goes for: the knight's AI target when it's in reach and sight, else the nearest in sight. */
function foeFor(w: World, h: Unit, reach: number): Unit | null {
  const id = h.ai?.target;
  if (id != null) {
    const t = w.mobs.find((m) => m.uid === id && !m.dead);
    if (t && dist(t.x, t.y, h.x, h.y) - t.r <= reach && lineOfSight(w.map, h.x, h.y - 4, t.x, t.y - 4)) return t;
  }
  return w.nearestEnemy(h, reach, true);
}

/** Which way a skill goes: at its foe, else where the player steers, else where the knight faces. */
function heading(w: World, h: Unit, t: Unit | null): [number, number] {
  // The knight you steer, attacking: where you aim.
  if (aimingNow(w, h)) return facingOf(h);
  if (t) {
    const [x, y] = norm(t.x - h.x, t.y - h.y);
    if (x || y) return [x, y];
  }
  if (h.slot === w.controlled && !w.bot) {
    const [x, y] = norm(w.input.mx, w.input.my);
    if (x || y) return [x, y];
  }
  const [x, y] = norm(h.aimX, h.aimY);
  return x || y ? [x, y] : [h.dir, 0];
}

/** Where an area skill lands: the biggest group in reach, else its foe, else a little ahead. */
function spotFor(w: World, h: Unit, reach: number, r: number): { x: number; y: number } {
  const d = w.densest(h, reach, r);
  if (d) return d;
  const t = foeFor(w, h, reach * 1.25);
  if (t) return { x: t.x, y: t.y };
  const [dx, dy] = heading(w, h, null);
  return { x: h.x + dx * 36, y: h.y + dy * 36 };
}

/** Faces the foe (or the heading) and gives the direction a shot leaves the knight's hands in. */
function aimShot(w: World, h: Unit, t: Unit | null): [number, number] {
  if (t && !aimingNow(w, h)) {
    face(h, t.x, t.y);
    return aimAt(h, t);
  }
  const d = heading(w, h, null);
  face(h, h.x + d[0], h.y + d[1]);
  return d;
}

function hit(w: World, h: Unit, e: Unit, mult: number, opts: { knock?: number; kx?: number; ky?: number; crit?: boolean; color?: string; silent?: boolean }): void {
  w.damage(e, h.atk * mult, h, opts);
}

/** Stuns a foe (bosses for 40% as long, elites 70%). */
function stun(w: World, e: Unit, s: number): void {
  if (e.dead) return;
  const t = s * (e.boss ? 0.4 : e.elite ? 0.7 : 1);
  if (t > e.stunT) e.stunT = t;
  if (!e.awake) w.wake(e);
  w.fx.push({ kind: 'spark', x: e.x, y: e.y - (e.boss ? 30 : 16), color: '#ffe27a' });
}

function taunt(w: World, e: Unit, h: Unit, s: number): void {
  e.tauntBy = h.uid;
  e.tauntT = Math.max(e.tauntT ?? 0, s);
  if (!e.awake) w.wake(e);
}

/** Damage taken × `dr` for `dur` s (a stronger shield already up stays). */
function guard(u: Unit, dr: number, dur: number): void {
  u.dr = u.drT > 0 ? Math.min(u.dr, dr) : dr;
  u.drT = Math.max(u.drT, dur);
}

/** Faster attacks and feet for `dur` s (on top of a boost already running, the better of each). */
function boost(u: Unit, atkSpd: number, moveSpd: number, dur: number, color: string): void {
  const b = u.skillBuff;
  u.skillBuff = b && b.t > 0
    ? { t: Math.max(b.t, dur), dur: Math.max(b.t, dur), atkSpd: Math.max(b.atkSpd, atkSpd), moveSpd: Math.max(b.moveSpd, moveSpd), color }
    : { t: dur, dur, atkSpd, moveSpd, color };
}

/** A beat of the skill `t` seconds from now. */
function later(h: Unit, t: number, run: () => void): void {
  (h.skillQueue ??= []).push({ t, run });
}

/** Jumps the knight toward (x, y) in small steps, sliding along walls rather than through them. */
function blinkTo(w: World, h: Unit, x: number, y: number): void {
  const steps = 16;
  const dx = (x - h.x) / steps;
  const dy = (y - h.y) / steps;
  for (let s = 0; s < steps; s++) moveUnit(w.map, h, dx, dy);
}

/** A skill's leap: the dodge's tumble (or vault), `d` px in `dur` s, untouchable in the air. */
function leap(h: Unit, dx: number, dy: number, d: number, dur: number, kind: 'flip' | 'vault'): void {
  h.rolling = { dx, dy, t: dur, dur, speed: d / dur, kind, hit: new Set() };
  h.invuln = Math.max(h.invuln, dur + 0.05);
  if (Math.abs(dx) > 0.2) h.dir = dx > 0 ? 1 : -1;
}

function lunge(w: World, h: Unit, dur: number, speed: number, dmg: number, knock: number, t: Unit | null): void {
  const [dx, dy] = heading(w, h, t);
  if (Math.abs(dx) > 0.2) h.dir = dx > 0 ? 1 : -1;
  h.channel = { kind: 'lunge', t: dur, dur, tick: 0, dx, dy, hit: new Set(), dmg, speed, knock };
  h.invuln = Math.max(h.invuln, dur + 0.02);
}

/** A shot of the knight's from its hands (or from x, y). */
function fire(w: World, h: Unit, dx: number, dy: number, o: { kind: Shot['kind']; speed: number; dmg: number; color: string; r: number; life: number; pierce?: number; homing?: number; splash?: number; x?: number; y?: number }): void {
  w.shots.push({
    uid: uid(),
    team: 'hero',
    x: o.x ?? h.x + dx * MUZZLE,
    y: o.y ?? h.y - HOLD_Y + dy * MUZZLE,
    vx: dx * o.speed,
    vy: dy * o.speed,
    r: o.r,
    dmg: o.dmg,
    life: o.life,
    kind: o.kind,
    color: o.color,
    from: h.uid,
    ...(o.pierce ? { pierce: o.pierce } : {}),
    ...(o.homing ? { homing: o.homing } : {}),
    ...(o.splash ? { splash: o.splash } : {}),
  });
}

/** A telegraphed blast: a ring filling for `delay` s, then one hit on everything inside. */
function blast(w: World, h: Unit, x: number, y: number, r: number, mult: number, delay: number, color: string): void {
  w.areas.push({ uid: uid(), team: 'hero', x, y, r, delay, dur: 0, tick: 1, tickT: 0, dmg: h.atk * mult, kind: 'blast', from: h.uid, color, t: 0 });
}

/** Arrows raining on a circle for `dur` s, a hit every `every` s. */
function rain(w: World, h: Unit, x: number, y: number, r: number, dur: number, every: number, mult: number, delay: number, color: string): void {
  w.areas.push({ uid: uid(), team: 'hero', x, y, r, delay, dur, tick: every, tickT: 0, dmg: h.atk * mult, kind: 'rain', from: h.uid, color, t: 0 });
}

/** The ground shakes round (x, y): a hit, a knock and a stun on everything within r. */
function quake(w: World, h: Unit, x: number, y: number, r: number, mult: number, stunFor: number, knock: number, color: string): void {
  for (const e of w.enemiesIn('hero', x, y, r)) {
    hit(w, h, e, mult, { knock });
    stun(w, e, stunFor);
  }
  w.fx.push({ kind: 'blast', x, y, color, size: r / 14, src: 'slam' });
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2;
    w.fx.push({ kind: 'dust', x: x + Math.cos(ang) * r * 0.75, y: y + Math.sin(ang) * r * 0.45 });
  }
}

/** One wide slash at the foes in front (facing the nearest first). */
function slash(w: World, h: Unit, mult: number, r: number, knock: number): void {
  const t = foeFor(w, h, r + 20);
  if (t) face(h, t.x, t.y);
  h.swingT = h.swingDur = 0.2;
  const cx = h.x + h.aimX * 12;
  const cy = h.y + h.aimY * 12 - 4;
  for (const e of w.enemiesIn('hero', cx, cy, r)) {
    const [ex, ey] = norm(e.x - h.x, e.y - h.y);
    if (ex * h.aimX + ey * h.aimY < -0.3 && dist(e.x, e.y, h.x, h.y) > 10) continue;
    hit(w, h, e, mult, { knock, crit: true });
  }
  w.fx.push({ kind: 'crit', x: cx, y: cy, color: '#e8f0ff' });
}

/** The living knight with the least of their HP left. */
function mostHurt(w: World): Unit | null {
  let best: Unit | null = null;
  for (const o of w.heroes) if (!o.downed && (!best || o.hp / o.maxHp < best.hp / best.maxHp)) best = o;
  return best;
}
