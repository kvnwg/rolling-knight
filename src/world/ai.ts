/**
 * Simple AIs. The two knights you don't control (and yours, on Auto) play by their class's role:
 * a tank wades in; fighters chase the nearest foe; archers and mages keep their distance and kite;
 * a healer stays by whoever is hurt. Each rolls its skill when the fight gives its role a good
 * moment (goodMomentToRoll). Everyone dodges what they see coming, most of the time.
 * Mobs: chasers, archers, chargers, bombers, casters (circles on the ground), tanks (ground slams),
 * swarms, and bosses with patterns of their own. Most close the gap with a lunge of their kind
 * (mobgen's Lunge): a dash along a line or a leap onto a spot, each with a tell (a crouch, a lane or
 * a landing ring that follows you for half the wind-up, then holds), one hit, and a moment spent
 * after. Ogres that can't get to you (no way round, the way round far longer than straight across,
 * or kited for a while) tear up a boulder and throw it.
 */
import { CLASSES } from '../core/knights';
import { signatureSkill } from '../core/skillbook';
import { dist, inRing, lineOfSight, moveUnit, norm, walkClear, type Unit } from './entities';
import { flowDist, flowStep, type Flow } from './flow';
import { TILE } from './mapgen';
import type { Gun, Lunge, Volley } from './mobgen';
import { heroDodge, heroSpecial } from './skills';
import { uid, type World } from './world';

/** Steering toward a point: straight when in sight, else along a flow field. */
function steer(w: World, u: Unit, tx: number, ty: number, flow: Flow | null): [number, number] {
  // Straight there only when the way is really open (trees and props block a body, not sight), and
  // not while taking a detour round something it got caught on.
  const detour = (u.ai?.detourT ?? 0) > 0;
  if (!detour && walkClear(w.map, u.x, u.y, tx, ty, u.r, u.flying)) return norm(tx - u.x, ty - u.y);
  if (flow) {
    const s = flowStep(flow, u.x, u.y);
    if (s) return s;
  }
  return norm(tx - u.x, ty - u.y);
}

/**
 * Keeps a squadmate from getting pinned on a tree or a corner: every half second, if it wanted to
 * move and barely did, it takes the long way round (the flow field) for a while; still pinned after
 * a couple of seconds and away from the leader, it hops to a free spot at the leader's side.
 */
function unstick(w: World, h: Unit, lead: Unit | undefined, want: [number, number], dt: number): void {
  const ai = h.ai!;
  if ((ai.detourT ?? 0) > 0) ai.detourT! -= dt;
  ai.checkT = (ai.checkT ?? 0.5) - dt;
  if (ai.checkT > 0) return;
  ai.checkT = 0.5;
  const moved = dist(h.x, h.y, ai.lastX ?? h.x, ai.lastY ?? h.y);
  ai.lastX = h.x;
  ai.lastY = h.y;
  const trying = Math.hypot(want[0], want[1]) > 0.3 && !h.rolling && h.stunT <= 0 && !h.channel;
  if (!trying || moved > 4) {
    ai.stuck = 0;
    return;
  }
  ai.stuck += 1;
  if (ai.stuck >= 2) ai.detourT = 1.6;
  if (ai.stuck >= 5 && lead && lead !== h && dist(h.x, h.y, lead.x, lead.y) > 36) {
    const spot = freeSpotNear(w, lead.x - lead.aimX * 12, lead.y + 8, h.r);
    if (spot) {
      w.fx.push({ kind: 'dust', x: h.x, y: h.y });
      h.x = spot[0];
      h.y = spot[1];
      w.fx.push({ kind: 'spark', x: h.x, y: h.y - 8, color: '#e8f0ff' });
    }
    ai.stuck = 0;
    ai.detourT = 0;
    ai.lastX = h.x;
    ai.lastY = h.y;
  }
}

/** A spot a body of radius r can stand on, as close to (x, y) as possible (null if none nearby). */
function freeSpotNear(w: World, x: number, y: number, r: number): [number, number] | null {
  for (let ring = 0; ring <= 5; ring++) {
    const n = ring === 0 ? 1 : ring * 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = x + Math.cos(a) * ring * 6;
      const py = y + Math.sin(a) * ring * 6;
      if (walkClear(w.map, px, py, px, py + 0.1, r)) return [px, py];
    }
  }
  return null;
}

/** Away from (x, y) (or sideways when right on it). */
function away(u: Unit, x: number, y: number): [number, number] {
  const d = norm(u.x - x, u.y - y);
  return d[0] || d[1] ? d : [1, 0];
}

/**
 * Is `u` in the lane a dash from (x, y) heading (dx, dy) sweeps, `len` long and `half` wide each side?
 * Returns the way out sideways (toward the side it's already on), or null.
 */
function laneDodge(u: Unit, x: number, y: number, dx: number, dy: number, len: number, half: number): [number, number] | null {
  const rx = u.x - x;
  const ry = u.y - y;
  const along = rx * dx + ry * dy;
  if (along < -4 || along > len + 6) return null;
  const across = rx * dy - ry * dx;
  if (Math.abs(across) > half + u.r) return null;
  return across > 0 ? [dy, -dx] : [-dy, dx];
}

/**
 * Is something about to hit this unit? Shots on a collision course; telegraphed areas about to go
 * off (a cast, a boulder coming down); slams and bombs winding up; and lunges: the lane of a dash or a
 * charge once its aim has locked (or one already coming), the landing ring of a leap. Returns the way
 * to roll: sideways out of a lane, away from a ring.
 */
export function threatened(w: World, u: Unit): [number, number] | null {
  for (const s of w.shots) {
    if (s.team === u.team) continue;
    const rx = u.x - s.x;
    const ry = u.y - 6 - s.y;
    const sp = Math.hypot(s.vx, s.vy);
    if (sp < 1) continue;
    const t = (rx * s.vx + ry * s.vy) / (sp * sp);
    if (t < 0 || t > 0.35) continue;
    const px = s.x + s.vx * t - u.x;
    const py = s.y + s.vy * t - (u.y - 6);
    if (Math.hypot(px, py) < u.r + s.r + 4) return norm(-s.vy, s.vx);
  }
  for (const a of w.areas) {
    if (a.team === u.team || a.delay <= 0 || a.delay > 0.6) continue;
    const inside = a.kind === 'boulder' ? inRing(u.x, u.y, u.r + 3, a.x, a.y, a.r) : dist(u.x, u.y, a.x, a.y) < a.r + 2;
    if (inside) return away(u, a.x, a.y);
  }
  for (const m of w.mobs) {
    if (m.dead) continue;
    const r = m.rush;
    if (r) {
      if (r.hit.has(u.uid)) continue;
      if (r.kind === 'leap') {
        if (r.dur - r.t < 0.45 && inRing(u.x, u.y, u.r + 3, r.x1, r.y1, r.r)) return away(u, r.x1, r.y1);
      } else {
        // A dash already coming: only if it gets here soon.
        const [dx, dy] = norm(r.x1 - r.x0, r.y1 - r.y0);
        const left = Math.hypot(r.x1 - m.x, r.y1 - m.y);
        const sp = Math.hypot(r.x1 - r.x0, r.y1 - r.y0) / r.dur;
        const out = laneDodge(u, m.x, m.y, dx, dy, left, m.r + r.r);
        if (out && ((u.x - m.x) * dx + (u.y - m.y) * dy) / Math.max(1, sp) < 0.35) return out;
      }
      continue;
    }
    if (!m.windT || m.windT <= 0) continue;
    // A lunge's aim holds for the second half of its wind-up: that's when to get out of the way.
    const locked = m.windT <= (m.windDur ?? 0) * 0.5;
    switch (m.move) {
      case 'dash':
      case 'charge': {
        const L = lungeOf(m, m.move);
        if (!locked || !L || m.moveX === undefined || m.moveY === undefined) break;
        const out = laneDodge(u, m.x, m.y, m.moveX, m.moveY, L.reach, m.r + L.r);
        if (out) return out;
        break;
      }
      case 'leap': {
        const L = lungeOf(m, 'leap');
        if (locked && L && m.spotX !== undefined && m.spotY !== undefined && inRing(u.x, u.y, u.r + 3, m.spotX, m.spotY, L.r)) return away(u, m.spotX, m.spotY);
        break;
      }
      case 'slam':
      case 'bomb':
        if (dist(u.x, u.y, m.x, m.y) < (m.boss ? 50 : 34)) return away(u, m.x, m.y);
        break;
    }
  }
  return null;
}

/**
 * Is now a good moment for this knight to roll its skill? By role, since most of a class's skills
 * want the same thing: a tank rolls when foes crowd it or a friend is pressed, a fighter when foes are
 * in reach, an archer or a mage when it has a target (best a group or a boss), a healer when someone
 * is hurt or down. After `waited` seconds of a fight without that moment, less will do. A knight
 * whose list holds a signature (a jackpot like Rewind) also rolls when a knight falls.
 */
export function goodMomentToRoll(w: World, h: Unit, target: Unit | null, foes: readonly Unit[], waited: number): boolean {
  const near = (r: number) => w.enemiesIn('hero', h.x, h.y, r).length;
  const boss = foes.some((m) => m.boss && dist(m.x, m.y, h.x, h.y) < 140);
  const down = w.heroes.some((o) => o.downed);
  const patient = waited > 3;
  if (down && signatureSkill(h.knightId!)) return true;
  switch (CLASSES[h.cls!].role) {
    case 'tank': {
      const pressed = w.heroes.some((o) => o !== h && !o.downed && o.hp / o.maxHp < 0.5 && w.enemiesIn('hero', o.x, o.y, 30).length > 0);
      return near(70) >= 2 || (boss && near(60) >= 1) || pressed || (patient && near(70) >= 1);
    }
    case 'melee':
      if (h.cls === 'lancer') return near(60) >= 1 || (!!target && dist(target.x, target.y, h.x, h.y) < 130 && waited > 1.5);
      return near(34) >= 2 || (boss && near(50) >= 1) || (patient && near(34) >= 1);
    case 'ranged':
    case 'caster':
      return !!target && ((w.densest(h, 150, 34)?.n ?? 0) >= 2 || boss || patient);
    case 'healer': {
      // (Not at the first scratch: a roll spent early leaves nothing for a knight who falls.)
      const hurt = w.heroes.filter((o) => !o.downed && o.hp / o.maxHp < 0.55).length;
      return down || hurt >= 2 || w.heroes.some((o) => !o.downed && o.hp / o.maxHp < 0.35) || (!!target && waited > 6);
    }
  }
  return false;
}

/** The foes a knight is fighting: awake ones, and any close enough to count. */
function fightFoes(w: World, h: Unit): Unit[] {
  return w.livingMobs().filter((m) => m.awake || dist(m.x, m.y, h.x, h.y) < 100);
}

/**
 * Skill rolls: no cooldown, so while a fight is on a knight is always rolling. The moment a roll
 * lands and its skill fires, the next one starts (roll, fire, roll, fire).
 */
function autoRoll(w: World, h: Unit, _target: Unit | null, foes: readonly Unit[], dt: number): void {
  const ai = h.ai!;
  if (h.skillRoll || h.skillSlam || !foes.length) ai.rollWait = 0;
  else {
    ai.rollWait = (ai.rollWait ?? 0) + dt;
    if (heroSpecial(w, h, false)) ai.rollWait = 0;
  }
}

/**
 * The knight you steer rolls its skill by itself too, the way the squad's AI does: no button needed
 * (the skill button still rolls it early, while it's ready).
 */
export function heroAutoRoll(w: World, h: Unit, dt: number): void {
  if (!h.ai) return;
  // Only in combat: an awake foe close by (on screen), not just one awake somewhere on the floor.
  const foes = closeFoes(fightFoes(w, h), h);
  autoRoll(w, h, foes.length ? w.nearestEnemy(h, 160, true) : null, foes, dt);
}

/** The foes a knight is really fighting: awake and within a screen of it. */
function closeFoes(foes: readonly Unit[], h: Unit): Unit[] {
  return foes.filter((m) => m.awake && dist(m.x, m.y, h.x, h.y) < 140);
}

/** One knight's decision for this frame: where to move (and maybe a dodge or a skill roll). */
export function heroAi(w: World, h: Unit, lead: Unit | undefined, dt: number): [number, number] {
  const want = heroAiMove(w, h, lead, dt);
  unstick(w, h, lead, want, dt);
  return want;
}

function heroAiMove(w: World, h: Unit, lead: Unit | undefined, dt: number): [number, number] {
  const ai = h.ai!;
  const cls = CLASSES[h.cls!];
  const isLead = lead === h;
  // --- dodges: check a few times a second, and don't always see it coming
  ai.dodgeThink -= dt;
  if (ai.dodgeThink <= 0) {
    ai.dodgeThink = 0.12;
    const t = threatened(w, h);
    if (t && w.rng.chance(0.55)) heroDodge(w, h, t[0], t[1]);
  }
  const foes = fightFoes(w, h);
  let target = foes.length ? w.nearestEnemy(h, 160, true) : null;
  // Skills only in a real fight: an awake foe close by, not one awake somewhere else on the floor.
  autoRoll(w, h, target, closeFoes(foes, h), dt);
  // --- movement
  if (target && target.uid !== ai.target) {
    ai.target = target.uid;
    ai.lastHp = target.hp;
    ai.noHitT = 0;
  }
  // A watchdog: if the target's HP hasn't dropped in a while (shots that can't land, a foe that won't
  // come), walk up to it instead of standing there.
  if (target) {
    if (target.hp < (ai.lastHp ?? Infinity)) ai.noHitT = 0;
    else ai.noHitT = (ai.noHitT ?? 0) + dt;
    ai.lastHp = target.hp;
    if ((ai.noHitT ?? 0) > 2.5 && (!lead || isLead || dist(h.x, h.y, lead.x, lead.y) < 150)) {
      if (ai.noHitT! > 6) ai.noHitT = 0;
      return steer(w, h, target.x, target.y, w.goalFlow && isLead ? w.goalFlow : null);
    }
  }
  const follow = (): [number, number] => {
    if (!lead || isLead) return [0, 0];
    const d = dist(h.x, h.y, lead.x, lead.y);
    // Formation: trail the leader a little to the side.
    const side = h.slot! % 2 === 0 ? -1 : 1;
    const fx = lead.x + side * 14 - lead.aimX * 8;
    const fy = lead.y + 10;
    if (d < 22 && dist(h.x, h.y, fx, fy) < 8) return [0, 0];
    return steer(w, h, fx, fy, w.leaderFlow);
  };
  // The leader on Auto explores: toward the nearest mob, then, once the floor is clear (or its boss
  // is down), the portal. (The way down is open from the start, but the bot clears before it leaves.)
  if (isLead && !target) {
    const goal = w.goalFlow;
    if (goal && flowDist(goal, h.x, h.y) > 0) return flowStep(goal, h.x, h.y) ?? [0, 0];
    if (w.cleared || (w.boss && w.portalOpen)) return steer(w, h, w.map.exit.x, w.map.exit.y, w.goalFlow);
    return [0, 0];
  }
  if (!target) {
    // Allies stay with the leader, but go help if a fight is close by.
    const fight = w.nearestEnemy(h, 140, false);
    if (fight && fight.awake && lead && dist(fight.x, fight.y, lead.x, lead.y) < 140) return steer(w, h, fight.x, fight.y, w.heroFlow);
    return follow();
  }
  // Allies don't wander too far from the leader.
  if (lead && !isLead && dist(h.x, h.y, lead.x, lead.y) > 150) return follow();
  const d = dist(h.x, h.y, target.x, target.y);
  switch (cls.role) {
    case 'tank':
    case 'melee': {
      if (d > h.range! * 0.8) return steer(w, h, target.x, target.y, null);
      // Circle a little so the squad doesn't stack.
      return [Math.sin(w.time * 1.3 + h.slot!) * 0.25, Math.cos(w.time * 1.7 + h.slot!) * 0.25];
    }
    case 'ranged':
    case 'caster': {
      const want = h.range! * 0.7;
      const close = w.nearestEnemy(h, 46, false);
      if (close) return norm(h.x - close.x + Math.sin(w.time + h.slot!) * 6, h.y - close.y);
      if (d > h.range! * 0.95) return steer(w, h, target.x, target.y, null);
      if (d < want * 0.7) return norm(h.x - target.x, h.y - target.y);
      return [0, 0];
    }
    case 'healer': {
      const hurt = w.heroes.filter((o) => !o.downed && o !== h).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      const close = w.nearestEnemy(h, 40, false);
      if (close) return norm(h.x - close.x, h.y - close.y);
      if (hurt && dist(h.x, h.y, hurt.x, hurt.y) > 40) return steer(w, h, hurt.x, hurt.y, w.leaderFlow);
      if (d > h.range! * 0.95) return steer(w, h, target.x, target.y, null);
      return [0, 0];
    }
  }
  return [0, 0];
}

// ------------------------------------------------------------------ mobs

/** A boss's charge and leap: the floor's dash and leap, bigger. */
export const BOSS_DASH: Lunge = { name: 'charge', kind: 'dash', wind: 0.8, reach: 136, dur: 0.6, height: 0, dmg: 1.5, knock: 20, r: 4, through: true, recover: 0.5, cd: 0, min: 0, max: Infinity };
export const BOSS_LEAP: Lunge = { name: 'slam', kind: 'leap', wind: 0.85, reach: 150, dur: 0.72, height: 44, dmg: 1.6, knock: 22, r: 40, through: false, recover: 0.7, cd: 0, min: 0, max: Infinity };

/** How far a tank's ground slam, a boss's slam and a bomber's blast reach (their red rings show it through the wind-up). */
export const SLAM_R = 26;
export const BOSS_SLAM_R = 46;
export const BOMB_R = 26;

/** The lunge behind a move of this mob's (its type's own, or a boss's bigger ones). */
export function lungeOf(m: Unit, move: string | undefined): Lunge | undefined {
  if (m.boss) return move === 'leap' ? BOSS_LEAP : move === 'charge' ? BOSS_DASH : undefined;
  return m.type!.lunge;
}

function mobTarget(w: World, m: Unit): Unit | null {
  if (m.tauntT && m.tauntT > 0) {
    const t = w.heroes.find((h) => h.uid === m.tauntBy && !h.downed);
    if (t) return t;
  }
  let best: Unit | null = null;
  let bd = Infinity;
  for (const h of w.heroes) {
    if (h.downed) continue;
    const d = dist(m.x, m.y, h.x, h.y) + (h.cls === 'guardian' ? -12 : 0);
    if (d < bd) {
      bd = d;
      best = h;
    }
  }
  return best;
}

/** A boss's shots (its ring and its fan): `n` fanned `spread` apart toward (tx, ty). */
function mobShoot(w: World, m: Unit, tx: number, ty: number, spread = 0, n = 1, speedMult = 1): void {
  const t = m.type!;
  const base = Math.atan2(ty - (m.y - 6 * t.size), tx - m.x);
  for (let i = 0; i < n; i++) bullet(w, m, m.x, m.y - 6 * t.size, base + (n > 1 ? (i - (n - 1) / 2) * spread : 0), bulletSpeed(w, m) * speedMult, 1);
}

// ------------------------------------------------------------------ bullets (Enter the Gungeon style)

/**
 * How dense a foe's patterns are: nothing extra on the first ten floors, one step more from floor 11
 * and another from floor 21, one more for an elite or a boss.
 */
export function density(w: World, m: Unit): number {
  return (w.floor <= 10 ? 0 : w.floor <= 20 ? 1 : 2) + (m.elite || m.boss ? 1 : 0);
}

/** A foe's bullet speed: its own, kept between 60 and 100 px/s (slower than any knight's shot), a little slower on the first floors. */
export function bulletSpeed(w: World, m: Unit): number {
  return Math.max(60, Math.min(100, (m.type?.shot?.speed ?? 72) * (w.floor <= 5 ? 0.88 : 1)));
}

/**
 * One bullet of m's from (x, y) along angle `a`: speed `sp`, a hit of `dmg` x its attack, bending `curve`
 * rad/s. (Drawn 7 px across, it hits a little smaller than it looks, as it should.)
 */
function bullet(w: World, m: Unit, x: number, y: number, a: number, sp: number, dmg: number, curve = 0): void {
  const t = m.type!;
  w.shots.push({
    uid: uid(), team: 'mob', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2, dmg: m.atk * dmg, life: 3.4, kind: 'bullet',
    color: t.shot?.color ?? '#ff6a6a', from: m.uid, ...(curve ? { curve } : {}),
  });
}

/**
 * Fires a volley of `kind` (mobgen's Volley) at (tx, ty): one aimed; a fan of 3 to 5; a burst of 2 to 4
 * aimed one after another; a ring of 6 to 12; a slow wave, a wide arc of 5 to 9; pairs that curve in
 * from either side. Denser deeper down and from elites (density). Each bullet hits for less than a
 * bite; the more in a volley, the less each.
 */
export function volley(w: World, m: Unit, kind: Volley, tx: number, ty: number): void {
  const d = density(w, m);
  const sp = bulletSpeed(w, m);
  const ox = m.x;
  const oy = m.y - 6 * (m.type?.size ?? 1);
  const aim = Math.atan2(ty - oy, tx - ox);
  switch (kind) {
    case 'aimed':
      bullet(w, m, ox, oy, aim, sp, 0.9);
      break;
    case 'fan': {
      const n = Math.min(5, 3 + d);
      for (let i = 0; i < n; i++) bullet(w, m, ox, oy, aim + (i - (n - 1) / 2) * 0.24, sp, 0.65);
      break;
    }
    case 'burst':
      m.burst = { n: Math.min(4, 2 + d), t: 0, tx, ty };
      tickBurst(w, m, 0);
      break;
    case 'ring':
      ringAt(w, m, ox, oy, Math.min(12, 6 + 2 * d), sp * 0.85, 0.55, aim);
      break;
    case 'wave': {
      const n = Math.min(9, 5 + 2 * d);
      for (let i = 0; i < n; i++) bullet(w, m, ox, oy, aim + (i - (n - 1) / 2) * (1.2 / (n - 1)), sp * 0.75, 0.5);
      break;
    }
    case 'curve': {
      const n = 1 + Math.min(2, d);
      for (let i = 0; i < n; i++) for (const side of [-1, 1]) bullet(w, m, ox, oy, aim + side * (0.45 + i * 0.2), sp * 0.9, 0.6, -side * 0.85);
      break;
    }
  }
}

/** A burst in progress: its next aimed shot every 0.13 s until it's spent. */
function tickBurst(w: World, m: Unit, dt: number): void {
  const b = m.burst!;
  b.t -= dt;
  if (b.t > 0) return;
  const oy = m.y - 6 * (m.type?.size ?? 1);
  bullet(w, m, m.x, oy, Math.atan2(b.ty - oy, b.tx - m.x), bulletSpeed(w, m), 0.65);
  b.n -= 1;
  b.t = 0.13;
  if (b.n <= 0) m.burst = undefined;
}

/** `n` bullets all round (x, y) (bullets fly at body height), starting `r0` px out, the first at angle `a0`. */
function ringAt(w: World, m: Unit, x: number, y: number, n: number, sp: number, dmg: number, a0 = 0, r0 = 0): void {
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    bullet(w, m, x + Math.cos(a) * r0, y + Math.sin(a) * r0, a, sp, dmg);
  }
}

/**
 * Bullets shaken loose in a ring when a heavy mover lands, slams or goes off (its type's quake, denser
 * deeper down): slow, spread wide enough to step between, and starting at the edge of the ring that
 * just came down (`r0`): whoever was inside took that hit (or rolled through it); these are for whoever
 * stood clear, with time to see them coming.
 */
export function quakeRing(w: World, m: Unit, x: number, y: number, n: number, r0 = 10): void {
  if (n <= 0) return;
  ringAt(w, m, x, y - 6, Math.min(14, n + 2 * density(w, m)), bulletSpeed(w, m) * 0.8, 0.5, w.rng.next() * Math.PI, r0);
}

/**
 * A lunge's aim (a dash's heading, a leap's landing spot) follows the target for the first half of the
 * wind-up, then holds: the lane or the ring stops moving, and that's the moment to get out (or roll).
 * A leap lands no further than it can jump.
 */
function aimLunge(m: Unit, target: Unit, force = false): void {
  if (!force && (m.windT ?? 0) <= (m.windDur ?? 0) * 0.5) return;
  if (m.move === 'throw') {
    // A throw comes down where the target stood when the aim held (its ring shows from the start).
    m.spotX = target.x;
    m.spotY = target.y;
    return;
  }
  const L = lungeOf(m, m.move);
  if (!L) return;
  const [dx, dy] = norm(target.x - m.x, target.y - m.y);
  if (L.kind === 'dash') {
    if (dx || dy) [m.moveX, m.moveY] = [dx, dy];
    else [m.moveX, m.moveY] = [m.dir, 0];
    return;
  }
  const d = Math.min(L.reach, dist(m.x, m.y, target.x, target.y));
  m.spotX = m.x + dx * d;
  m.spotY = m.y + dy * d;
}

/**
 * Starts this mob's dash or leap at `target` if it's ready, in its range and in sight, and the way
 * there is clear for a body its size. True if it started (the wind-up: the tell).
 */
function tryLunge(w: World, m: Unit, target: Unit, d: number, sight: boolean): boolean {
  const L = m.type!.lunge;
  if (!L || (m.lungeT ?? 0) > 0 || !sight || d < L.min || d > L.max) return false;
  const [dx, dy] = norm(target.x - m.x, target.y - m.y);
  const len = Math.min(L.reach, L.kind === 'dash' ? d + 8 : d);
  if (!walkClear(w.map, m.x, m.y, m.x + dx * len, m.y + dy * len, m.r, m.flying)) return false;
  m.move = L.kind === 'leap' ? 'leap' : m.type!.behavior === 'charger' ? 'charge' : 'dash';
  m.windT = m.windDur = L.wind;
  m.lungeT = L.cd + L.wind + L.dur + L.recover;
  m.moving = false;
  aimLunge(m, target, true);
  return true;
}

/** Winds up a volley of its gun (the tell: the red flash and its "about to fire" pose); every `every`-th volley its alternate. */
function aimGun(m: Unit, g: Gun): void {
  const n = (m.volley = (m.volley ?? 0) + 1);
  m.gunKind = g.alt && g.every && n % g.every === 0 ? g.alt : g.kind;
  m.windT = m.windDur = g.wind + (m.gunKind !== g.kind ? 0.1 : 0);
  m.move = 'shoot';
  m.moving = false;
}

/** A chaser's or a swarm's shot when its gun is ready and you're in its range and sight. True if it started. */
function startGun(m: Unit, g: Gun | undefined, target: Unit, d: number, sight: boolean): boolean {
  if (!g || (m.gunT ?? 0) > 0 || !sight || d < g.min || d > g.max) return false;
  m.gunT = g.cd + g.wind;
  m.moveX = target.x;
  m.moveY = target.y;
  aimGun(m, g);
  return true;
}

/** Goes: the dash or the leap the wind-up was for. */
function startRush(w: World, m: Unit, L: Lunge, move: string): void {
  let x1 = m.spotX ?? m.x;
  let y1 = m.spotY ?? m.y;
  if (L.kind === 'dash') {
    const [dx, dy] = norm(m.moveX ?? m.dir, m.moveY ?? 0);
    x1 = m.x + dx * L.reach;
    y1 = m.y + dy * L.reach;
  }
  m.rush = {
    kind: L.kind, move, name: m.boss ? 'boss' : L.name, x0: m.x, y0: m.y, x1, y1, t: 0, dur: L.dur, height: L.height,
    dmg: L.dmg, knock: L.knock, r: L.r, through: L.through, recover: L.recover, big: !!m.boss || L.name === 'slam', hit: new Set(),
  };
  m.moving = true;
  // (Push-off dust.)
  w.fx.push({ kind: 'dust', x: m.x, y: m.y });
}

/** A dash or a leap in flight: it moves by itself, hitting what it meets (a dash) or where it lands (a leap). */
function tickRush(w: World, m: Unit, dt: number): void {
  const r = m.rush!;
  r.t += dt;
  const p = Math.min(1, r.t / r.dur);
  m.moving = true;
  if (r.kind === 'dash') {
    const len = Math.hypot(r.x1 - r.x0, r.y1 - r.y0);
    const [dx, dy] = norm(r.x1 - r.x0, r.y1 - r.y0);
    const step = (len / r.dur) * dt;
    const bx = m.x;
    const by = m.y;
    moveUnit(w.map, m, dx * step, dy * step);
    if (Math.abs(dx) > 0.2) m.dir = dx > 0 ? 1 : -1;
    for (const h of w.enemiesIn('mob', m.x, m.y, m.r + r.r)) {
      if (r.hit.has(h.uid)) continue;
      r.hit.add(h.uid);
      // A knight mid-roll lets it go straight through (and it won't turn back for them).
      if (w.evades(h)) continue;
      w.damage(h, m.atk * r.dmg, m, { knock: r.knock, kx: dx, ky: dy });
      if (!r.through) return endRush(w, m, true);
    }
    // At the end of its run, or stopped dead by a wall.
    if (p >= 1 || dist(bx, by, m.x, m.y) < step * 0.3) endRush(w, m, true);
    return;
  }
  // A leap goes along the ground from where it left to where it lands; the arc is the art's to draw.
  moveUnit(w.map, m, r.x0 + (r.x1 - r.x0) * p - m.x, r.y0 + (r.y1 - r.y0) * p - m.y);
  if (Math.abs(r.x1 - r.x0) > 2) m.dir = r.x1 > r.x0 ? 1 : -1;
  if (p >= 1) endRush(w, m, true);
}

/**
 * The end of a dash or a leap: a leap comes down on everyone inside its ring (a roll goes untouched),
 * kicking up a ring of dust (and shaking the ground, for a big one); then it stands spent a moment.
 * `landed` false: knocked out of it (stunned), it just drops.
 */
function endRush(w: World, m: Unit, landed: boolean): void {
  const r = m.rush!;
  m.rush = undefined;
  m.moving = false;
  m.recoverT = m.recoverDur = landed ? r.recover : r.recover * 0.5;
  if (!landed) return;
  m.swingT = m.swingDur = 0.25;
  if (r.kind === 'leap') {
    for (const h of w.enemiesInRing('mob', m.x, m.y, r.r)) {
      if (r.hit.has(h.uid)) continue;
      r.hit.add(h.uid);
      if (w.evades(h)) continue;
      w.damage(h, m.atk * r.dmg, m, { knock: r.knock, kx: h.x - m.x, ky: h.y - m.y });
    }
    w.fx.push({ kind: 'land', x: m.x, y: m.y, size: r.r / 10 });
    if (r.big) w.shakeIt(m.boss ? 5 : 3, m.boss ? 0.35 : 0.22);
    // Heavy ones shake bullets loose as they come down.
    quakeRing(w, m, m.x, m.y, m.boss ? 8 : (m.type!.quake ?? 0), r.r);
  } else {
    w.fx.push({ kind: 'dust', x: m.x, y: m.y });
    if (r.big) w.shakeIt(3, 0.2);
    if (r.move === 'charge' && m.boss) quakeRing(w, m, m.x, m.y, 8, m.r + 6);
  }
}

/**
 * Can't this mob get to its target? No way there at all; or there is, but so far round that straight
 * across (water, props between) would be much shorter; or it has been after it a while without getting
 * there (a knight kiting it).
 */
function cantReach(w: World, m: Unit, target: Unit, d: number, flow: Flow | null): boolean {
  const steps = flow ? flowDist(flow, m.x, m.y) : -1;
  if (steps < 0) return true;
  if (steps * TILE > d * 1.5 + 24 && !walkClear(w.map, m.x, m.y, target.x, target.y, m.r, m.flying)) return true;
  return (m.chaseT ?? 0) > 2.6 && d > 56;
}

/** How big a mob's thrown boulder's ring is. */
export function lobRadius(m: Unit): number {
  return (m.type?.lob?.r ?? 18) * (m.elite ? 1.2 : 1);
}

/** A boulder torn from the ground and lobbed onto the spot the wind-up aimed at: its ring stays, then the hit. */
function throwBoulder(w: World, m: Unit, target: Unit): void {
  const t = m.type!;
  const lob = t.lob!;
  const x = m.spotX ?? target.x;
  const y = m.spotY ?? target.y;
  const flight = 0.5 + dist(m.x, m.y, x, y) / 260;
  w.areas.push({
    uid: uid(), team: 'mob', x, y, r: lobRadius(m), delay: flight, dur: 0, tick: 1, tickT: 0,
    dmg: m.atk * lob.dmg, kind: 'boulder', from: m.uid, color: t.ramp[2], t: 0, x0: m.x + m.dir * 2, y0: m.y, z0: Math.round(30 * t.size), flight,
  });
}

export function mobAi(w: World, m: Unit, dt: number): void {
  const t = m.type!;
  if (m.tauntT && m.tauntT > 0) m.tauntT -= dt;
  // (Only awake: a room that wakes as you walk in doesn't all lunge at once.)
  if (m.awake) {
    if ((m.lungeT ?? 0) > 0) m.lungeT! -= dt;
    if ((m.throwT ?? 0) > 0) m.throwT! -= dt;
    if ((m.gunT ?? 0) > 0) m.gunT! -= dt;
  }
  if (m.stunT > 0) {
    // Knocked out of a dash or a leap, it drops where it is (and a burst stops).
    if (m.rush) endRush(w, m, false);
    m.burst = undefined;
    return;
  }
  // A burst keeps firing its shots, whatever else it's doing.
  if (m.burst) tickBurst(w, m, dt);
  // A dash or a leap carries it by itself; after one it stands spent a moment.
  if (m.rush) return tickRush(w, m, dt);
  if ((m.recoverT ?? 0) > 0) {
    m.recoverT! -= dt;
    m.moving = false;
    return;
  }
  const target = mobTarget(w, m);
  if (!m.awake) {
    // Asleep: wakes when a knight comes close and in sight.
    if (target && dist(m.x, m.y, target.x, target.y) < 125 && lineOfSight(w.map, m.x, m.y, target.x, target.y)) w.wake(m);
    m.moving = false;
    return;
  }
  // Rising into the fight: a moment before it does anything.
  if ((m.spawnT ?? 0) > 0) {
    m.spawnT! -= dt;
    m.moving = false;
    return;
  }
  if (!target) {
    m.moving = false;
    return;
  }
  if (m.boss) return bossAi(w, m, target, dt);
  const d = dist(m.x, m.y, target.x, target.y);
  const flow = m.flying ? w.heroFlowFly : w.heroFlow;
  // Far off, the melee kinds sprint to close the gap.
  const closing = d > 80 && (t.behavior === 'chaser' || t.behavior === 'charger' || t.behavior === 'tank') ? 1.18 : 1;
  const speed = m.speed * (m.slowT > 0 ? 0.5 : 1) * closing;
  if (Math.abs(target.x - m.x) > 2) m.dir = target.x > m.x ? 1 : -1;
  if (m.atkT! > 0) m.atkT! -= dt;
  // --- a wind-up in progress (the telegraph), then the move
  if (m.windT && m.windT > 0) {
    m.windT -= dt;
    m.moving = false;
    aimLunge(m, target);
    if (m.windT <= 0) doMove(w, m, target);
    return;
  }
  const go = (dx: number, dy: number, mult = 1) => {
    moveUnit(w.map, m, dx * speed * mult * dt, dy * speed * mult * dt);
    m.moving = Math.hypot(dx, dy) > 0.1;
  };
  const sight = lineOfSight(w.map, m.x, m.y - 4, target.x, target.y - 4);
  // Straight at the target when a body its size can walk there; round by the flow field when water or
  // props are in the way (checked a few times a second).
  const ai = m.ai!;
  ai.think -= dt;
  if (ai.think <= 0) {
    ai.think = 0.25;
    ai.direct = sight && walkClear(w.map, m.x, m.y, target.x, target.y, m.r, m.flying);
  }
  const toward = (): [number, number] => (ai.direct ? norm(target.x - m.x, target.y - m.y) : (flowStep(flow!, m.x, m.y) ?? norm(target.x - m.x, target.y - m.y)));
  // Which way it circles you (each foe its own, switching every few seconds).
  const side = Math.floor(w.time * 0.4 + (m.uid % 7) * 0.37) % 2 ? 1 : -1;
  /** Holds about `want` px off, circling round the target (backing off when too close, closing when too far). */
  const strafe = (want: number, mult: number) => {
    const [ux, uy] = norm(target.x - m.x, target.y - m.y);
    const radial = d > want * 1.15 ? 0.75 : d < want * 0.8 ? -0.9 : 0;
    go(ux * radial - uy * side * 0.8, uy * radial + ux * side * 0.8, mult);
  };
  switch (t.behavior) {
    case 'chaser':
    case 'swarm': {
      if (d > m.r + target.r + t.range) {
        if (tryLunge(w, m, target, d, sight)) break;
        if (startGun(m, t.gun, target, d, sight)) break;
        const [dx, dy] = toward();
        if (t.behavior === 'chaser' && ai.direct && d < 80) {
          // Close in at an angle, circling, rather than straight at you.
          go(dx * 0.75 - dy * side * 0.6, dy * 0.75 + dx * side * 0.6);
          break;
        }
        const wob = t.behavior === 'swarm' ? Math.sin(w.time * 6 + m.uid) * 0.6 : 0;
        go(dx - dy * wob, dy + dx * wob);
      } else {
        m.moving = false;
        if (m.atkT! <= 0) {
          // (Every bite has a tell long enough to see it coming: the red flash over its wind-up.)
          m.atkT = t.atkCd;
          m.windT = m.windDur = t.behavior === 'swarm' ? 0.24 : 0.36;
          m.move = 'bite';
        }
      }
      break;
    }
    case 'ranged':
    case 'caster': {
      // They keep their distance, circling round you, and fire their volleys from there.
      const want = t.range * 0.7;
      if (!sight || d > t.range) {
        const [dx, dy] = toward();
        go(dx, dy);
      } else strafe(want, 0.7);
      if (sight && d < t.range && m.atkT! <= 0) {
        m.atkT = t.atkCd;
        m.moveX = target.x;
        m.moveY = target.y;
        // A caster drops a ring on you, then curves a volley in; the rest fire their gun.
        if (t.behavior === 'caster' && (!t.gun || (m.volley ?? 0) % 2 === 0)) {
          m.volley = (m.volley ?? 0) + 1;
          m.windT = m.windDur = 0.5;
          m.move = 'cast';
        } else if (t.gun) aimGun(m, t.gun);
      }
      break;
    }
    case 'charger': {
      if (tryLunge(w, m, target, d, sight)) break;
      if (d <= m.r + target.r + 10 && m.atkT! <= 0) {
        // Cornered up close it only shoves (its charge is what hurts): a lighter, slower bite.
        m.atkT = 1.7;
        m.windT = m.windDur = 0.34;
        m.move = 'bite';
        break;
      }
      // Between charges it keeps its distance (it needs a run-up), circling round you.
      if (sight && ai.direct) strafe(70, 0.8);
      else {
        const [dx, dy] = toward();
        go(dx, dy);
      }
      break;
    }
    case 'bomber': {
      if (d > m.r + target.r + 6) {
        // It hops (or pounces) in, then goes off.
        if (tryLunge(w, m, target, d, sight)) break;
        const [dx, dy] = toward();
        go(dx, dy, 1.1);
      } else {
        m.windT = m.windDur = 0.6;
        m.move = 'bomb';
      }
      break;
    }
    case 'tank': {
      const reach = m.r + target.r + 14;
      m.chaseT = d <= reach + 6 ? 0 : (m.chaseT ?? 0) + dt;
      if (d > reach) {
        // Out of reach: a boulder when it can't get there, a leap onto you when the way is clear, else on it comes.
        const lob = t.lob;
        if (lob && (m.throwT ?? 0) <= 0 && sight && d >= lob.min && d <= lob.max && cantReach(w, m, target, d, flow)) {
          m.move = 'throw';
          m.windT = m.windDur = lob.wind;
          m.throwT = lob.cd + lob.wind;
          m.chaseT = 0;
          aimLunge(m, target, true);
          m.moving = false;
          // (It tears the rock up out of the ground.)
          w.fx.push({ kind: 'dust', x: m.x + m.dir * 6, y: m.y + 1 });
          break;
        }
        if (tryLunge(w, m, target, d, sight)) break;
        const [dx, dy] = toward();
        go(dx, dy);
      } else if (m.atkT! <= 0) {
        m.atkT = t.atkCd;
        m.windT = m.windDur = 0.7;
        m.move = 'slam';
      }
      break;
    }
  }
}

function doMove(w: World, m: Unit, target: Unit): void {
  const t = m.type!;
  m.swingT = m.swingDur = 0.25;
  switch (m.move) {
    case 'bite': {
      // (Only a bite that would land asks whether the knight rolled out of it.)
      if (dist(m.x, m.y, target.x, target.y) < m.r + target.r + t.range + 6 && !w.evades(target)) {
        w.damage(target, m.atk * (t.behavior === 'charger' ? 0.6 : 1), m, { knock: t.behavior === 'charger' ? 8 : 5 });
      }
      break;
    }
    case 'shoot':
      // Its volley, aimed where you are as it fires.
      volley(w, m, m.gunKind ?? 'aimed', target.x, target.y);
      break;
    case 'cast':
      w.areas.push({ uid: uid(), team: 'mob', x: target.x, y: target.y, r: 18, delay: 0.9, dur: 0, tick: 1, tickT: 0, dmg: m.atk * 1.4, kind: 'blast', from: m.uid, color: t.ramp[3], t: 0 });
      break;
    case 'dash':
    case 'charge':
    case 'leap': {
      const L = lungeOf(m, m.move);
      if (L) startRush(w, m, L, m.move);
      break;
    }
    case 'throw':
      throwBoulder(w, m, target);
      break;
    case 'bomb':
      w.areas.push({ uid: uid(), team: 'mob', x: m.x, y: m.y, r: BOMB_R, delay: 0.01, dur: 0, tick: 1, tickT: 0, dmg: m.atk * 1.6, kind: 'blast', from: m.uid, color: '#ffb04a', t: 0 });
      quakeRing(w, m, m.x, m.y, t.quake ?? 0, BOMB_R);
      w.killMob(m);
      break;
    case 'slam':
      w.areas.push({ uid: uid(), team: 'mob', x: m.x, y: m.y, r: SLAM_R, delay: 0.01, dur: 0, tick: 1, tickT: 0, dmg: m.atk * 1.15, kind: 'slam', from: m.uid, color: t.ramp[2], t: 0 });
      quakeRing(w, m, m.x, m.y, t.quake ?? 0, SLAM_R);
      break;
  }
  m.move = undefined;
}

function bossAi(w: World, m: Unit, target: Unit, dt: number): void {
  const t = m.type!;
  const enraged = m.hp < m.maxHp * 0.5;
  if (enraged && m.bossPhase === 0) {
    m.bossPhase = 1;
    w.events.push({ type: 'bossPhase' });
    w.text(m.x, m.y - 50, 'ENRAGED!', '#ff5a5a', true);
    w.shakeIt(5, 0.5);
  }
  if (Math.abs(target.x - m.x) > 2) m.dir = target.x > m.x ? 1 : -1;
  if (m.windT && m.windT > 0) {
    m.windT -= dt;
    m.moving = false;
    aimLunge(m, target);
    if (m.windT <= 0) bossMove(w, m, target, enraged);
    return;
  }
  // Drift toward the squad between moves.
  const d = dist(m.x, m.y, target.x, target.y);
  if (d > 50) {
    const s = lineOfSight(w.map, m.x, m.y, target.x, target.y) ? norm(target.x - m.x, target.y - m.y) : (flowStep(w.heroFlow!, m.x, m.y) ?? [0, 0]);
    moveUnit(w.map, m, s[0] * m.speed * dt, s[1] * m.speed * dt);
    m.moving = true;
  } else m.moving = false;
  // Close up, it bites (a knight rolling past it is missed).
  if (d < m.r + target.r + 8 && (m.atkT ?? 0) <= 0) {
    m.atkT = 1;
    if (!w.evades(target)) w.damage(target, m.atk, m, { knock: 10 });
  }
  if ((m.atkT ?? 0) > 0) m.atkT! -= dt;
  m.bossT! -= dt * (enraged ? 1.4 : 1);
  if (m.bossT! <= 0) {
    const moves = t.boss!.moves;
    m.move = moves[Math.floor(w.rng.next() * moves.length)];
    const L = lungeOf(m, m.move);
    m.windT = m.windDur = L ? L.wind : 0.7;
    m.bossT = enraged ? 2.2 : 3;
    if (L) aimLunge(m, target, true);
    if (m.move === 'rain') {
      // Circles rain down around the squad (telegraphed now, falling later).
      for (const h of w.heroes) {
        if (h.downed) continue;
        for (let k = 0; k < (enraged ? 3 : 2); k++) {
          w.areas.push({ uid: uid(), team: 'mob', x: h.x + w.rng.float(-24, 24), y: h.y + w.rng.float(-18, 18), r: 16, delay: 1.1 + k * 0.25, dur: 0, tick: 1, tickT: 0, dmg: m.atk * 1.2, kind: 'blast', from: m.uid, color: t.ramp[3], t: 0 });
        }
      }
    }
  }
}

function bossMove(w: World, m: Unit, target: Unit, enraged: boolean): void {
  const t = m.type!;
  m.swingT = m.swingDur = 0.3;
  switch (m.move) {
    case 'ring': {
      const n = enraged ? 20 : 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + w.time;
        mobShoot(w, m, m.x + Math.cos(a) * 50, m.y - 6 * t.size + Math.sin(a) * 50, 0, 1, 0.9);
      }
      break;
    }
    case 'fan':
      mobShoot(w, m, target.x, target.y, 0.22, enraged ? 7 : 5, 1.1);
      break;
    case 'charge':
    case 'leap':
      startRush(w, m, lungeOf(m, m.move)!, m.move);
      break;
    case 'slam':
      w.areas.push({ uid: uid(), team: 'mob', x: m.x, y: m.y, r: BOSS_SLAM_R, delay: 0.01, dur: 0, tick: 1, tickT: 0, dmg: m.atk * 1.4, kind: 'slam', from: m.uid, color: t.ramp[2], t: 0 });
      quakeRing(w, m, m.x, m.y, 8, BOSS_SLAM_R);
      break;
    case 'summon': {
      for (let k = 0; k < (enraged ? 3 : 2); k++) {
        const a = w.makeMob(w.rng.pick(w.mobTypes), m.x + w.rng.float(-30, 30), m.y + w.rng.float(10, 30), false, false);
        a.awake = true;
        a.room = m.room;
        w.spawnIn(a);
        if (!moveUnit(w.map, a, 0, 0)) {
          a.x = m.x;
          a.y = m.y + 10;
        }
        w.mobs.push(a);
        w.fx.push({ kind: 'spark', x: a.x, y: a.y - 6, color: t.ramp[3] });
      }
      break;
    }
    case 'rain':
      break;
  }
  m.move = undefined;
}
