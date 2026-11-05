/**
 * Simple AIs. The two knights you don't control (and yours, on Auto) play by their class's role:
 * a tank wades in; fighters chase the nearest foe; archers and mages keep their distance and kite;
 * a healer stays by whoever is hurt. Each rolls its skill when the fight gives its role a good
 * moment (goodMomentToRoll). Everyone dodges what they see coming, most of the time.
 * Mobs: chasers, archers, chargers (wind up, then dash), bombers, casters (circles on the ground),
 * tanks (ground slams), swarms, and bosses with patterns of their own.
 */
import { CLASSES } from '../core/knights';
import { signatureSkill } from '../core/skillbook';
import { dist, lineOfSight, moveUnit, norm, type Unit } from './entities';
import { flowDist, flowStep, type Flow } from './flow';
import { heroDodge, heroSpecial } from './skills';
import { uid, type World } from './world';

/** Steering toward a point: straight when in sight, else along a flow field. */
function steer(w: World, u: Unit, tx: number, ty: number, flow: Flow | null): [number, number] {
  if (lineOfSight(w.map, u.x, u.y, tx, ty)) return norm(tx - u.x, ty - u.y);
  if (flow) {
    const s = flowStep(flow, u.x, u.y);
    if (s) return s;
  }
  return norm(tx - u.x, ty - u.y);
}

/** Is something about to hit this unit? (Shots on a collision course, telegraphed areas, chargers.) */
function threatened(w: World, u: Unit): [number, number] | null {
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
    if (dist(u.x, u.y, a.x, a.y) < a.r + 2) return norm(u.x - a.x, u.y - a.y);
  }
  for (const m of w.mobs) {
    if (m.dead || !m.windT || m.windT <= 0) continue;
    if ((m.move === 'charge' || m.move === 'slam' || m.move === 'bomb') && dist(u.x, u.y, m.x, m.y) < (m.move === 'charge' ? 90 : 34)) {
      return norm(-(m.moveY ?? 0), m.moveX ?? 1);
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

/** One knight's decision for this frame: where to move (and maybe a dodge or a skill roll). */
export function heroAi(w: World, h: Unit, lead: Unit | undefined, dt: number): [number, number] {
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
  const foes = w.livingMobs().filter((m) => m.awake || dist(m.x, m.y, h.x, h.y) < 100);
  let target = foes.length ? w.nearestEnemy(h, 160, true) : null;
  // --- skill rolls: once the cooldown is up and a fight is on, roll at a good moment for the role
  // (what lands is up to the dice; when to roll isn't). The longer it waits, the less it takes.
  if (h.specialT! > 0 || h.skillRoll || !foes.length) ai.rollWait = 0;
  else {
    ai.rollWait = (ai.rollWait ?? 0) + dt;
    if (goodMomentToRoll(w, h, target, foes, ai.rollWait) && heroSpecial(w, h, false)) ai.rollWait = 0;
  }
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
  // The leader on Auto explores: toward the nearest mob, then the portal.
  if (isLead && !target) {
    const goal = w.goalFlow;
    if (goal && flowDist(goal, h.x, h.y) > 0) return flowStep(goal, h.x, h.y) ?? [0, 0];
    if (w.portalOpen) return steer(w, h, w.map.exit.x, w.map.exit.y, w.goalFlow);
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

function mobShoot(w: World, m: Unit, tx: number, ty: number, spread = 0, n = 1, speedMult = 1): void {
  const t = m.type!;
  const base = Math.atan2(ty - (m.y - 6), tx - m.x);
  for (let i = 0; i < n; i++) {
    const a = base + (n > 1 ? (i - (n - 1) / 2) * spread : 0);
    const sp = (t.shot?.speed ?? 70) * speedMult;
    w.shots.push({ uid: uid(), team: 'mob', x: m.x, y: m.y - 6 * t.size, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: t.shot?.radius ?? 3, dmg: m.atk, life: 3, kind: 'bullet', color: t.shot?.color ?? '#ff6a6a', from: m.uid });
  }
}

export function mobAi(w: World, m: Unit, dt: number): void {
  const t = m.type!;
  if (m.tauntT && m.tauntT > 0) m.tauntT -= dt;
  if (m.stunT > 0) return;
  const target = mobTarget(w, m);
  if (!m.awake) {
    // Asleep: wakes when a knight comes close and in sight.
    if (target && dist(m.x, m.y, target.x, target.y) < 105 && lineOfSight(w.map, m.x, m.y, target.x, target.y)) w.wake(m);
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
  const speed = m.speed * (m.slowT > 0 ? 0.5 : 1);
  if (Math.abs(target.x - m.x) > 2) m.dir = target.x > m.x ? 1 : -1;
  if (m.atkT! > 0) m.atkT! -= dt;
  // --- a wind-up in progress (the telegraph), then the move
  if (m.windT && m.windT > 0) {
    m.windT -= dt;
    m.moving = false;
    if (m.windT <= 0) doMove(w, m, target);
    return;
  }
  if (m.chargeT && m.chargeT > 0) {
    m.chargeT -= dt;
    moveUnit(w.map, m, (m.moveX ?? 0) * speed * 4.5 * dt, (m.moveY ?? 0) * speed * 4.5 * dt);
    m.moving = true;
    for (const h of w.enemiesIn('mob', m.x, m.y, m.r + 2)) {
      if (h.invuln > 0 || h.rolling) continue;
      w.damage(h, m.atk * 1.4, m, { knock: 14, kx: m.moveX, ky: m.moveY });
      m.chargeT = 0;
    }
    return;
  }
  const go = (dx: number, dy: number, mult = 1) => {
    moveUnit(w.map, m, dx * speed * mult * dt, dy * speed * mult * dt);
    m.moving = Math.hypot(dx, dy) > 0.1;
  };
  const sight = lineOfSight(w.map, m.x, m.y - 4, target.x, target.y - 4);
  const toward = (): [number, number] => (sight ? norm(target.x - m.x, target.y - m.y) : (flowStep(flow!, m.x, m.y) ?? norm(target.x - m.x, target.y - m.y)));
  switch (t.behavior) {
    case 'chaser':
    case 'swarm': {
      if (d > m.r + target.r + t.range) {
        const [dx, dy] = toward();
        const wob = t.behavior === 'swarm' ? Math.sin(w.time * 6 + m.uid) * 0.6 : 0;
        go(dx - dy * wob, dy + dx * wob);
      } else {
        m.moving = false;
        if (m.atkT! <= 0) {
          m.atkT = t.atkCd;
          m.windT = m.windDur = t.behavior === 'swarm' ? 0.12 : 0.32;
          m.move = 'bite';
        }
      }
      break;
    }
    case 'ranged':
    case 'caster': {
      const want = t.range * 0.75;
      if (!sight || d > t.range) {
        const [dx, dy] = toward();
        go(dx, dy);
      } else if (d < want * 0.6) {
        const [dx, dy] = norm(m.x - target.x, m.y - target.y);
        go(dx, dy, 0.8);
      } else {
        go(Math.sin(w.time + m.uid) * 0.3, Math.cos(w.time * 0.7 + m.uid) * 0.3, 0.5);
      }
      if (sight && d < t.range && m.atkT! <= 0) {
        m.atkT = t.atkCd;
        m.windT = m.windDur = t.behavior === 'caster' ? 0.5 : 0.4;
        m.move = t.behavior === 'caster' ? 'cast' : 'shoot';
        m.moveX = target.x;
        m.moveY = target.y;
      }
      break;
    }
    case 'charger': {
      if (sight && d < t.range && d > 24 && m.atkT! <= 0) {
        m.atkT = t.atkCd;
        m.windT = m.windDur = 0.6;
        m.move = 'charge';
        [m.moveX, m.moveY] = norm(target.x - m.x, target.y - m.y);
      } else if (d > m.r + target.r + 10) {
        const [dx, dy] = toward();
        go(dx, dy);
      } else if (m.atkT! <= 0) {
        m.atkT = 1.2;
        m.windT = m.windDur = 0.3;
        m.move = 'bite';
      }
      break;
    }
    case 'bomber': {
      if (d > m.r + target.r + 6) {
        const [dx, dy] = toward();
        go(dx, dy, 1.1);
      } else {
        m.windT = m.windDur = 0.6;
        m.move = 'bomb';
      }
      break;
    }
    case 'tank': {
      if (d > m.r + target.r + 14) {
        const [dx, dy] = toward();
        go(dx, dy);
      } else if (m.atkT! <= 0) {
        m.atkT = t.atkCd;
        m.windT = m.windDur = 0.75;
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
      if (dist(m.x, m.y, target.x, target.y) < m.r + target.r + t.range + 6 && !target.rolling && target.invuln <= 0) {
        w.damage(target, m.atk, m, { knock: 5 });
      }
      break;
    }
    case 'shoot':
      mobShoot(w, m, m.moveX ?? target.x, m.moveY ?? target.y);
      break;
    case 'cast':
      w.areas.push({ uid: uid(), team: 'mob', x: target.x, y: target.y, r: 18, delay: 0.9, dur: 0, tick: 1, tickT: 0, dmg: m.atk * 1.4, kind: 'blast', from: m.uid, color: t.ramp[3], t: 0 });
      break;
    case 'charge':
      m.chargeT = 0.45;
      break;
    case 'bomb':
      w.areas.push({ uid: uid(), team: 'mob', x: m.x, y: m.y, r: 26, delay: 0.01, dur: 0, tick: 1, tickT: 0, dmg: m.atk * 1.6, kind: 'blast', from: m.uid, color: '#ffb04a', t: 0 });
      w.killMob(m);
      break;
    case 'slam':
      w.areas.push({ uid: uid(), team: 'mob', x: m.x, y: m.y, r: 30, delay: 0.01, dur: 0, tick: 1, tickT: 0, dmg: m.atk * 1.3, kind: 'slam', from: m.uid, color: t.ramp[2], t: 0 });
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
    if (m.windT <= 0) bossMove(w, m, target, enraged);
    return;
  }
  if (m.chargeT && m.chargeT > 0) {
    m.chargeT -= dt;
    moveUnit(w.map, m, (m.moveX ?? 0) * 170 * dt, (m.moveY ?? 0) * 170 * dt);
    m.moving = true;
    for (const h of w.enemiesIn('mob', m.x, m.y, m.r + 4)) {
      if (h.invuln > 0 || h.rolling) continue;
      w.damage(h, m.atk * 1.5, m, { knock: 20, kx: m.moveX, ky: m.moveY });
    }
    if (m.chargeT <= 0) w.shakeIt(4, 0.2);
    return;
  }
  // Drift toward the squad between moves.
  const d = dist(m.x, m.y, target.x, target.y);
  if (d > 50) {
    const s = lineOfSight(w.map, m.x, m.y, target.x, target.y) ? norm(target.x - m.x, target.y - m.y) : (flowStep(w.heroFlow!, m.x, m.y) ?? [0, 0]);
    moveUnit(w.map, m, s[0] * m.speed * dt, s[1] * m.speed * dt);
    m.moving = true;
  } else m.moving = false;
  // Close up, it bites.
  if (d < m.r + target.r + 8 && (m.atkT ?? 0) <= 0 && !target.rolling) {
    m.atkT = 1;
    w.damage(target, m.atk, m, { knock: 10 });
  }
  if ((m.atkT ?? 0) > 0) m.atkT! -= dt;
  m.bossT! -= dt * (enraged ? 1.4 : 1);
  if (m.bossT! <= 0) {
    const moves = t.boss!.moves;
    m.move = moves[Math.floor(w.rng.next() * moves.length)];
    m.windT = m.windDur = m.move === 'charge' ? 0.8 : 0.7;
    m.bossT = enraged ? 2.2 : 3;
    if (m.move === 'charge') [m.moveX, m.moveY] = norm(target.x - m.x, target.y - m.y);
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
      m.chargeT = 0.6;
      break;
    case 'slam':
      w.areas.push({ uid: uid(), team: 'mob', x: m.x, y: m.y, r: 46, delay: 0.01, dur: 0, tick: 1, tickT: 0, dmg: m.atk * 1.4, kind: 'slam', from: m.uid, color: t.ramp[2], t: 0 });
      break;
    case 'summon': {
      for (let k = 0; k < (enraged ? 3 : 2); k++) {
        const a = w.makeMob(w.rng.pick(w.mobTypes), m.x + w.rng.float(-30, 30), m.y + w.rng.float(10, 30), false, false);
        a.awake = true;
        a.room = m.room;
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
