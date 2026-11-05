/**
 * The knights' kits. Every class has the same three skills on every knight: an auto attack that
 * fires by itself whenever a foe is in range, a dodge roll, and a special.
 */
import { dist, moveUnit, norm, type Unit } from './entities';
import { uid, type World } from './world';

/** Movement, the auto attack, and any running dodge or special, every frame. */
export function heroTick(w: World, h: Unit, dt: number, mx: number, my: number): void {
  if (h.dodgeT! > 0) h.dodgeT! -= dt;
  const allyBoost = h.slot !== w.controlled && w.perks.has('hiveMind') ? 2 : 1;
  if (h.specialT! > 0) h.specialT! -= dt * allyBoost;
  // --- a dodge in progress moves the knight on its own
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
    if (r.t <= 0) {
      h.rolling = undefined;
      if (h.cls === 'guardian') {
        h.dr = 0.5;
        h.drT = Math.max(h.drT, 1);
      }
    }
    return;
  }
  // --- a channeled special
  if (h.channel) {
    const c = h.channel;
    c.t -= dt;
    if (c.kind === 'whirlwind') {
      c.tick -= dt;
      if (c.tick <= 0) {
        c.tick = 0.22;
        for (const e of w.enemiesIn('hero', h.x, h.y - 4, 28)) w.damage(e, h.atk * 0.8, h, { knock: 5 });
        w.fx.push({ kind: 'spark', x: h.x, y: h.y - 6, color: '#e8f0ff' });
      }
      h.animT += dt * 3;
    } else if (c.kind === 'lunge') {
      moveUnit(w.map, h, c.dx * 300 * dt, c.dy * 300 * dt);
      for (const e of w.enemiesIn('hero', h.x, h.y - 4, 14)) {
        if (c.hit.has(e.uid)) continue;
        c.hit.add(e.uid);
        w.damage(e, h.atk * 3, h, { knock: 14, kx: c.dx, ky: c.dy, crit: true });
      }
      w.fx.push({ kind: 'dust', x: h.x, y: h.y });
      if (c.t <= 0) h.invuln = 0;
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
  if (len > 0.1 && h.stunT <= 0) {
    const nx = mx / Math.max(1, len);
    const ny = my / Math.max(1, len);
    moveUnit(w.map, h, nx * h.speed * slow * whirl * dt, ny * h.speed * slow * whirl * dt);
    h.moving = true;
    if (Math.abs(nx) > 0.2) h.dir = nx > 0 ? 1 : -1;
    h.view = Math.abs(ny) > Math.abs(nx) * 0.9 ? (ny < 0 ? 'up' : 'down') : 'side';
  } else {
    h.moving = false;
  }
  // --- the auto attack: fires by itself at the nearest foe in range
  if (h.atkT! > 0) h.atkT! -= dt * (1 + w.banner * 0.04);
  if (h.atkT! <= 0 && h.stunT <= 0 && h.channel?.kind !== 'whirlwind') {
    const reach = h.range! + (h.cls === 'guardian' || h.cls === 'blade' || h.cls === 'lancer' ? 6 : 0);
    const t = w.nearestEnemy(h, reach, true);
    if (t) {
      autoAttack(w, h, t);
      h.atkT = h.atkCd!;
    }
  }
}

function face(h: Unit, x: number, y: number): void {
  const [nx, ny] = norm(x - h.x, y - h.y);
  h.aimX = nx;
  h.aimY = ny;
  if (Math.abs(nx) > 0.15) h.dir = nx > 0 ? 1 : -1;
  if (!h.moving) h.view = Math.abs(ny) > Math.abs(nx) * 1.2 ? (ny < 0 ? 'up' : 'down') : 'side';
}

function crit(w: World): boolean {
  return w.rng.chance(0.1);
}

function autoAttack(w: World, h: Unit, t: Unit): void {
  face(h, t.x, t.y);
  h.swingT = h.swingDur = h.cls === 'ranger' || h.cls === 'cleric' || h.cls === 'arcanist' ? 0.22 : 0.26;
  const c = crit(w);
  const dmg = h.atk * (c ? 1.6 : 1);
  switch (h.cls) {
    case 'guardian':
      w.damage(t, dmg, h, { crit: c, knock: 12 });
      w.fx.push({ kind: 'hit', x: t.x, y: t.y - 6, color: '#d8e0f0' });
      break;
    case 'blade': {
      // A wide cleave: everything in front.
      for (const e of w.enemiesIn('hero', h.x + h.aimX * 10, h.y + h.aimY * 10 - 4, 16)) {
        const [ex, ey] = norm(e.x - h.x, e.y - h.y);
        if (ex * h.aimX + ey * h.aimY < -0.2 && dist(e.x, e.y, h.x, h.y) > 8) continue;
        w.damage(e, dmg, h, { crit: c, knock: 6 });
      }
      break;
    }
    case 'lancer': {
      // A long thrust through everything in a line.
      for (const e of w.livingMobs()) {
        const rx = e.x - h.x;
        const ry = e.y - h.y;
        const along = rx * h.aimX + ry * h.aimY;
        const across = Math.abs(rx * h.aimY - ry * h.aimX);
        if (along > -4 && along < h.range! + 8 && across < 7 + e.r) w.damage(e, dmg, h, { crit: c, knock: 5, kx: h.aimX, ky: h.aimY });
      }
      break;
    }
    case 'ranger':
      shoot(w, h, t, { kind: 'arrow', speed: 210, dmg, color: '#f0e0b0', r: 2 });
      break;
    case 'cleric':
      shoot(w, h, t, { kind: 'orb', speed: 120, dmg, color: '#fff0a0', r: 3, heal: h.atk * 0.5 });
      break;
    case 'arcanist':
      shoot(w, h, t, { kind: 'bolt', speed: 150, dmg, color: '#b08aff', r: 3, homing: 6, splash: 16 });
      break;
  }
}

function shoot(w: World, h: Unit, t: Unit, o: { kind: 'arrow' | 'orb' | 'bolt'; speed: number; dmg: number; color: string; r: number; heal?: number; homing?: number; splash?: number }): void {
  const sx = h.x + h.dir * 4;
  const sy = h.y - 10;
  const [nx, ny] = norm(t.x - sx, t.y - 6 - sy);
  w.shots.push({
    uid: uid(),
    team: 'hero',
    x: sx,
    y: sy,
    vx: nx * o.speed,
    vy: ny * o.speed,
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

/** The dodge: a roll (each class its own), untouchable while it lasts. */
export function heroDodge(w: World, h: Unit, mx: number, my: number, fromHive = false): boolean {
  if (h.downed || h.rolling || h.dodgeT! > 0 || h.stunT > 0 || h.channel?.kind === 'lunge') return false;
  let [dx, dy] = norm(mx, my);
  if (!dx && !dy) {
    // No direction held: roll away from the nearest foe (or the way the knight faces).
    const e = w.nearestEnemy(h, 120, false);
    if (e) [dx, dy] = norm(h.x - e.x, h.y - e.y);
    else [dx, dy] = [h.dir, 0];
  }
  h.dodgeT = h.dodgeCd!;
  if (Math.abs(dx) > 0.2) h.dir = dx > 0 ? 1 : -1;
  const kinds: Record<string, { kind: 'roll' | 'blink' | 'vault' | 'flip'; dur: number; dist: number }> = {
    guardian: { kind: 'roll', dur: 0.26, dist: 40 },
    blade: { kind: 'roll', dur: 0.3, dist: 58 },
    ranger: { kind: 'flip', dur: 0.36, dist: 78 },
    cleric: { kind: 'roll', dur: 0.3, dist: 54 },
    arcanist: { kind: 'blink', dur: 0.2, dist: 60 },
    lancer: { kind: 'vault', dur: 0.36, dist: 70 },
  };
  const k = kinds[h.cls!];
  h.rolling = { dx, dy, t: k.dur, dur: k.dur, speed: k.dist / k.dur, kind: k.kind, hit: new Set() };
  h.invuln = Math.max(h.invuln, k.dur + 0.05);
  w.fx.push({ kind: 'dust', x: h.x, y: h.y });
  if (k.kind === 'blink') {
    // Blink: jump straight there (as far as the floor allows).
    w.fx.push({ kind: 'spark', x: h.x, y: h.y - 8, color: '#b08aff' });
    for (let s = 0; s < 12; s++) moveUnit(w.map, h, (dx * k.dist) / 12, (dy * k.dist) / 12);
    w.fx.push({ kind: 'spark', x: h.x, y: h.y - 8, color: '#b08aff' });
  }
  if (h.cls === 'cleric') {
    w.areas.push({ uid: uid(), team: 'hero', x: h.x, y: h.y, r: 18, delay: 0, dur: 2, tick: 0.5, tickT: 0.5, dmg: 0, heal: 0.02, kind: 'glow', from: h.uid, color: '#fff0a0', t: 0 });
  }
  if (w.perks.has('kamikaze')) {
    w.areas.push({ uid: uid(), team: 'hero', x: h.x, y: h.y, r: 30, delay: 0.8, dur: 0, tick: 1, tickT: 0, dmg: h.atk * 3, kind: 'bomb', from: h.uid, color: '#ff8a3a', t: 0 });
  }
  // Hive Mind: the whole squad dodges with the knight you control.
  if (!fromHive && h.slot === w.controlled && w.perks.has('hiveMind')) {
    for (const o of w.heroes) if (o !== h && !o.downed) heroDodge(w, o, dx, dy, true);
  }
  return true;
}

/** The special: big, class-defining, on a long cooldown. */
export function heroSpecial(w: World, h: Unit, free: boolean): boolean {
  if (h.downed || h.stunT > 0) return false;
  if (!free && h.specialT! > 0) return false;
  if (!free) h.specialT = h.specialCd!;
  h.swingT = h.swingDur = 0.35;
  switch (h.cls) {
    case 'guardian': {
      // Rallying Taunt: every foe nearby turns on the Guardian; a shockwave knocks them back.
      h.dr = 0.4;
      h.drT = 4;
      for (const e of w.livingMobs()) {
        if (dist(e.x, e.y, h.x, h.y) > 96) continue;
        e.tauntBy = h.uid;
        e.tauntT = 4;
        if (!e.awake) w.wake(e);
        w.damage(e, h.atk * 1.5, h, { knock: 18 });
      }
      w.fx.push({ kind: 'shock', x: h.x, y: h.y, color: '#ffd84a', size: 4 });
      w.shakeIt(3, 0.25);
      w.text(h.x, h.y - 30, 'TAUNT!', '#ffd84a', true);
      break;
    }
    case 'blade':
      h.channel = { kind: 'whirlwind', t: 2, dur: 2, tick: 0, dx: 0, dy: 0, hit: new Set() };
      w.text(h.x, h.y - 30, 'WHIRLWIND!', '#e8f0ff', true);
      break;
    case 'ranger': {
      const spot = w.densest(h, 150, 34) ?? (w.nearestEnemy(h, 200, false) ? { x: w.nearestEnemy(h, 200, false)!.x, y: w.nearestEnemy(h, 200, false)!.y, n: 1 } : null);
      if (!spot) {
        if (!free) h.specialT = 0.5;
        return false;
      }
      face(h, spot.x, spot.y);
      w.areas.push({ uid: uid(), team: 'hero', x: spot.x, y: spot.y, r: 34, delay: 0.25, dur: 2, tick: 0.18, tickT: 0, dmg: h.atk * 0.5, kind: 'rain', from: h.uid, color: '#e8e0c8', t: 0 });
      w.text(h.x, h.y - 30, 'ARROW RAIN!', '#f0e0b0', true);
      break;
    }
    case 'cleric': {
      for (const o of w.heroes) {
        if (o.downed) continue;
        w.clericHeal(o, o.maxHp * 0.35);
      }
      const fallen = w.heroes.filter((o) => o.downed).sort((a, b) => dist(a.x, a.y, h.x, h.y) - dist(b.x, b.y, h.x, h.y))[0];
      if (fallen && !w.perks.has('bloodPact')) w.revive(fallen, 0.35);
      w.areas.push({ uid: uid(), team: 'hero', x: h.x, y: h.y, r: 42, delay: 0, dur: 3, tick: 0.5, tickT: 0.5, dmg: 0, heal: 0.03, kind: 'sanctuary', from: h.uid, color: '#fff0a0', t: 0 });
      w.fx.push({ kind: 'levelup', x: h.x, y: h.y, color: '#fff0a0' });
      w.text(h.x, h.y - 30, 'SANCTUARY!', '#fff0a0', true);
      break;
    }
    case 'arcanist': {
      const spot = w.densest(h, 160, 36);
      if (!spot) {
        if (!free) h.specialT = 0.5;
        return false;
      }
      face(h, spot.x, spot.y);
      w.areas.push({ uid: uid(), team: 'hero', x: spot.x, y: spot.y, r: 36, delay: 0.9, dur: 0, tick: 1, tickT: 0, dmg: h.atk * 4, kind: 'meteor', from: h.uid, color: '#ff8a3a', t: 0 });
      w.text(h.x, h.y - 30, 'METEOR!', '#ff9a4a', true);
      break;
    }
    case 'lancer': {
      let [dx, dy] = norm(w.input.mx, w.input.my);
      const t = w.nearestEnemy(h, 160, true);
      if (t && (h.slot !== w.controlled || w.auto || (!dx && !dy))) [dx, dy] = norm(t.x - h.x, t.y - h.y);
      if (!dx && !dy) [dx, dy] = [h.dir, 0];
      if (Math.abs(dx) > 0.2) h.dir = dx > 0 ? 1 : -1;
      h.channel = { kind: 'lunge', t: 0.34, dur: 0.34, tick: 0, dx, dy, hit: new Set() };
      h.invuln = Math.max(h.invuln, 0.36);
      w.text(h.x, h.y - 30, 'DRAGON LUNGE!', '#ff7a5a', true);
      break;
    }
  }
  return true;
}
