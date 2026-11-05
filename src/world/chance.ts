/**
 * The chance lines of the upgrade map, played on a dungeon floor: hooks the World calls at the
 * moments that matter. Each one reads the save's tiers (bound by `onFloorStart`), rolls its dice on
 * the floor's own Rng (`w.rng`, so a run plays the same for the same seed) and shows what happened
 * with the floor's float texts and effects ("LUCKY!", "DOUBLE!", "TRIP!", "JACKPOT!").
 *
 * Where each hook is called (src/world/world.ts):
 *  - onFloorStart(w, state)  once a floor's World exists (Game.startFloor, after `new World(...)`).
 *  - onHeroHit / onHeroHurt  in World.damage, once the hit's final amount is known (after armor and
 *                            damage reduction), before it's taken off: a knight hitting a foe, and a
 *                            knight being hit. They return the amount to deal; 0 means none at all.
 *  - onKill(w, mob)          in World.killMob, after the kill event.
 *  - onShotHit(w, shot, t)   in updateShots, after a knight's shot damages a foe (Ricochet).
 *  - onTick(w, dt)           in World.update, after the mobs move (Pratfall).
 * A World that was never bound (the camp, tests) runs exactly as before, and a save without chance
 * lines never touches the Rng, so floors play out the same as they did without these hooks.
 */
import { CHANCE, chanceFx, rollHit, rollKill, tripChance, type ChanceFx } from '../core/chance';
import { luckyEvery } from '../core/luck';
import type { GameState } from '../core/state';
import { dist, moveUnit, norm, type Area, type Shot, type Unit } from './entities';
import { uid, type World } from './world';

/** What the hooks need from the save: the tiers, and (for Jackpot) the altar's Lucky Spin count. */
export type ChanceSave = Pick<GameState, 'upgrades'> & Partial<Pick<GameState, 'roll' | 'perks'>>;

/** Damage options a hit can carry (World.damage's `opts`): a LUCKY hit shows as a crit in clover green. */
export interface HitOpts {
  crit?: boolean;
  color?: string;
  silent?: boolean;
}

interface Ctx {
  save: ChanceSave;
  fx: ChanceFx;
  /** World time the cached numbers were worked out at (an upgrade bought mid-floor counts next frame). */
  fxAt: number;
  /** Knights whose Second Wind has gone off this floor. */
  winded: Set<number>;
  /** When each knight's Wild Magic can go off again (world time). */
  wildReady: Map<number, number>;
  /** How many times a shot has bounced. */
  bounces: WeakMap<Shot, number>;
  /** When each word last floated up (so a cleave through a crowd doesn't bury the screen). */
  saidAt: Map<string, number>;
}

const CTX = new WeakMap<World, Ctx>();

export const COLORS = {
  lucky: '#b6ff5c',
  double: '#ffd84a',
  nothing: '#a6a2bc',
  fumble: '#e8e0c8',
  trip: '#f0c878',
  wind: '#9ad8ff',
  shower: '#ffd84a',
  jackpot: '#ff8af0',
  wild: '#d29bff',
  hourglass: '#ffe9a8',
} as const;

// ------------------------------------------------------------------ binding

/**
 * Binds a floor to the save, and starts the floor's chances afresh (every knight's Second Wind is
 * ready again). Call it for every floor's World, after `new World(...)`.
 */
export function onFloorStart(w: World, save: ChanceSave): void {
  CTX.set(w, { save, fx: chanceFx(save), fxAt: w.time, winded: new Set(), wildReady: new Map(), bounces: new WeakMap(), saidAt: new Map() });
}

/** The chance numbers a floor plays with right now (null when the floor was never bound). */
export function chanceOf(w: World): ChanceFx | null {
  const c = CTX.get(w);
  return c ? fxOf(c, w) : null;
}

function fxOf(c: Ctx, w: World): ChanceFx {
  if (c.fxAt !== w.time) {
    c.fx = chanceFx(c.save);
    c.fxAt = w.time;
  }
  return c.fx;
}

/** A word over a unit, at most every `gap` seconds per word. */
function say(w: World, c: Ctx, u: Unit, text: string, color: string, big = true, gap = 0.12): void {
  const last = c.saidAt.get(text);
  if (last !== undefined && w.time - last < gap && w.time >= last) return;
  c.saidAt.set(text, w.time);
  w.text(u.x, u.y - (u.boss ? 50 : 30), text, color, big);
}

// ------------------------------------------------------------------ hits

/**
 * A knight's hit on a foe, its final amount known: the coin (Double or Nothing), a LUCKY hit (x5),
 * Giant Slayer, then Leechblade's healing and maybe a Wild Magic spell. Returns the amount to deal
 * (0: the coin said nothing). `opts` is the hit's damage options: a LUCKY hit marks them a crit in
 * clover green, so its number shows big.
 */
export function onHeroHit(w: World, hero: Unit, target: Unit, amount: number, opts?: HitOpts): number {
  const c = CTX.get(w);
  if (!c || hero.team !== 'hero' || target.team !== 'mob' || amount <= 0) return amount;
  const fx = fxOf(c, w);
  if (!fx.any) return amount;
  const roll = rollHit(fx, w.rng, !!(target.elite || target.boss));
  if (roll.coin === 'nothing') {
    say(w, c, target, 'NOTHING', COLORS.nothing, false);
    w.fx.push({ kind: 'dust', x: target.x, y: target.y - 6, color: '#8a86a0' });
    return 0;
  }
  const out = amount * roll.mult;
  if (roll.coin === 'double') say(w, c, target, 'DOUBLE!', COLORS.double);
  if (roll.lucky) {
    say(w, c, target, 'LUCKY!', COLORS.lucky);
    w.fx.push({ kind: 'crit', x: target.x, y: target.y - 6, color: COLORS.lucky });
    if (opts) {
      opts.crit = true;
      opts.color = COLORS.lucky;
    }
    w.hitStop = Math.max(w.hitStop, 0.04);
  }
  // Leechblade: a little of every hit comes back as HP (quietly: no number for every swing).
  if (fx.lifesteal > 0 && !hero.downed && hero.hp < hero.maxHp) hero.hp = Math.min(hero.maxHp, hero.hp + out * fx.lifesteal);
  // Wild Magic: a random spell from the knights' kits, then a pause before this knight can again.
  if (fx.wildMagic > 0 && w.time >= (c.wildReady.get(hero.uid) ?? -Infinity) && w.rng.chance(fx.wildMagic)) {
    c.wildReady.set(hero.uid, w.time + fx.wildMagicCd);
    cast(w, c, hero, target, w.rng.pick(WILD_SPELLS));
  }
  return out;
}

/**
 * A knight being hit, its final amount known: Butterfingers (the foe fumbles it: nothing, and it's
 * dazed) and Second Wind (a killing blow shrugged off, once a floor per knight). Returns the amount to
 * take (0: none).
 */
export function onHeroHurt(w: World, hero: Unit, amount: number, from: Unit | null): number {
  const c = CTX.get(w);
  if (!c || hero.team !== 'hero' || amount <= 0) return amount;
  const fx = fxOf(c, w);
  if (!fx.any) return amount;
  if (from && from.team === 'mob' && !from.dead && fx.butterfingers > 0) {
    const p = from.boss ? fx.butterfingers * CHANCE.butterfingers.bossShare : fx.butterfingers;
    if (w.rng.chance(p)) {
      from.stunT = Math.max(from.stunT, from.boss ? CHANCE.butterfingers.daze * 0.5 : CHANCE.butterfingers.daze);
      from.windT = 0;
      from.chargeT = 0;
      from.move = undefined;
      say(w, c, from, 'FUMBLE!', COLORS.fumble);
      w.fx.push({ kind: 'spark', x: from.x, y: from.y - 10, color: '#e8e0c8' });
      return 0;
    }
  }
  if (amount >= hero.hp && fx.secondWind > 0 && !c.winded.has(hero.uid) && w.rng.chance(fx.secondWind)) {
    c.winded.add(hero.uid);
    hero.hp = Math.max(1, Math.round(hero.maxHp * fx.secondWindHp));
    hero.invuln = Math.max(hero.invuln, CHANCE.secondWind.invuln);
    say(w, c, hero, 'SECOND WIND!', COLORS.wind, true, 0);
    w.fx.push({ kind: 'revive', x: hero.x, y: hero.y, color: COLORS.wind });
    w.shakeIt(2, 0.2);
    return 0;
  }
  return amount;
}

// ------------------------------------------------------------------ kills

/** A foe falls: a Coin Shower, an Hourglass (Sands of Fortune), a Jackpot. */
export function onKill(w: World, mob: Unit): void {
  const c = CTX.get(w);
  if (!c || mob.team !== 'mob') return;
  const fx = fxOf(c, w);
  if (!fx.any) return;
  const r = rollKill(fx, w.rng);
  if (r.shower) {
    // The kill's gold (as World.killMob works it out), three times over, in a burst of coins.
    const gold = Math.max(1, Math.round(w.goldPerKill * (mob.boss ? 25 : mob.elite ? 4 : 1))) * fx.coinShowerMult;
    const coins = Math.min(12, 4 + Math.round(fx.coinShowerMult * 2));
    for (let i = 0; i < coins; i++) w.spawnPickup(mob.x, mob.y, 'gold', Math.max(1, Math.round(gold / coins)));
    say(w, c, mob, 'COIN SHOWER!', COLORS.shower, true, 0.3);
    w.fx.push({ kind: 'spark', x: mob.x, y: mob.y - 8, color: COLORS.shower });
  }
  if (r.hourglass) {
    w.spawnPickup(mob.x, mob.y, 'hourglass', 1);
    w.fx.push({ kind: 'spark', x: mob.x, y: mob.y - 8, color: COLORS.hourglass });
  }
  if (r.jackpot) jackpot(w, c, mob);
}

/** The next spin at the altar is a Lucky Spin (or, if one is due anyway, a Luck Potion drops). */
function jackpot(w: World, c: Ctx, mob: Unit): void {
  const roll = c.save.roll;
  let spin = false;
  if (roll && roll.tutorial === 'done') {
    const every = luckyEvery(c.save as GameState);
    if (roll.sinceLucky < every - 1) {
      roll.sinceLucky = every - 1;
      spin = true;
    }
  }
  if (!spin) w.spawnPickup(mob.x, mob.y, 'potion', 1);
  w.text(mob.x, mob.y - 36, 'JACKPOT!', COLORS.jackpot, true);
  w.text(mob.x, mob.y - 24, spin ? 'next spin is Lucky' : 'a Luck Potion', '#fff4dc', false);
  w.fx.push({ kind: 'levelup', x: mob.x, y: mob.y, color: '#ffd84a' });
  w.shakeIt(2, 0.3);
}

// ------------------------------------------------------------------ shots

/**
 * A knight's arrow or bolt has hit `hit`: Ricochet may send it on to the nearest other foe in reach
 * (a shot bounces three times at most, and loses a fifth of its damage each time).
 */
export function onShotHit(w: World, shot: Shot, hit: Unit): void {
  if (shot.team !== 'hero' || (shot.kind !== 'arrow' && shot.kind !== 'bolt')) return;
  const c = CTX.get(w);
  if (!c) return;
  const fx = fxOf(c, w);
  if (fx.ricochet <= 0) return;
  const n = c.bounces.get(shot) ?? 0;
  if (n >= fx.ricochetMax || !w.rng.chance(fx.ricochet)) return;
  let best: Unit | null = null;
  let bd: number = CHANCE.ricochet.range;
  for (const m of w.mobs) {
    if (m.dead || m === hit || shot.hit?.has(m.uid)) continue;
    const d = dist(hit.x, hit.y, m.x, m.y);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  if (!best) return;
  const speed = Math.max(120, Math.hypot(shot.vx, shot.vy));
  const sx = hit.x;
  const sy = hit.y - 6;
  const [nx, ny] = norm(best.x - sx, best.y - 6 - sy);
  const next: Shot = {
    ...shot,
    uid: uid(),
    x: sx,
    y: sy,
    vx: nx * speed,
    vy: ny * speed,
    dmg: shot.dmg * fx.ricochetDmg,
    life: 1,
    homing: undefined,
    pierce: undefined,
    hit: new Set([...(shot.hit ?? []), hit.uid]),
  };
  c.bounces.set(next, n + 1);
  w.shots.push(next);
  w.fx.push({ kind: 'spark', x: sx, y: sy, color: shot.color });
}

// ------------------------------------------------------------------ every frame

/** Pratfall: now and then a foe on the move trips over its own feet and lies stunned. */
export function onTick(w: World, dt: number): void {
  const c = CTX.get(w);
  if (!c || dt <= 0) return;
  const fx = fxOf(c, w);
  if (fx.pratfall <= 0) return;
  const p = tripChance(fx, dt);
  for (const m of w.mobs) {
    if (m.dead || m.boss || !m.awake || !m.moving || m.stunT > 0) continue;
    if (!w.rng.chance(p)) continue;
    trip(w, c, m);
  }
}

function trip(w: World, c: Ctx, m: Unit): void {
  m.stunT = m.elite ? CHANCE.pratfall.eliteStun : CHANCE.pratfall.stun;
  m.windT = 0;
  m.chargeT = 0;
  m.move = undefined;
  m.moving = false;
  m.hurtT = 0.18;
  // A little slide forward, flat on its face.
  moveUnit(w.map, m, m.dir * 3, 0);
  say(w, c, m, 'TRIP!', COLORS.trip, true, 0.2);
  w.fx.push({ kind: 'dust', x: m.x, y: m.y, color: '#a89c88' });
}

// ------------------------------------------------------------------ Wild Magic

export type WildSpell = 'meteor' | 'rain' | 'whirlwind' | 'light' | 'bolts' | 'shockwave' | 'fireball';
export const WILD_SPELLS: readonly WildSpell[] = ['meteor', 'rain', 'whirlwind', 'light', 'bolts', 'shockwave', 'fireball'];
const SPELL_NAME: Record<WildSpell, string> = {
  meteor: 'METEOR!',
  rain: 'ARROW RAIN!',
  whirlwind: 'WHIRLWIND!',
  light: 'HOLY LIGHT!',
  bolts: 'ARCANE BOLTS!',
  shockwave: 'SHOCKWAVE!',
  fireball: 'FIREBALL!',
};

function area(w: World, hero: Unit, a: Omit<Area, 'uid' | 'team' | 'from' | 't'>): void {
  w.areas.push({ uid: uid(), team: 'hero', from: hero.uid, t: 0, ...a });
}

/** A spell from the knights' kits (a random one if not named), cast by `hero` at `target` or round itself. */
export function castWildMagic(w: World, hero: Unit, target: Unit, spell: WildSpell = w.rng.pick(WILD_SPELLS)): WildSpell {
  return cast(w, CTX.get(w) ?? null, hero, target, spell);
}

function cast(w: World, c: Ctx | null, hero: Unit, target: Unit, spell: WildSpell): WildSpell {
  const atk = hero.atk;
  switch (spell) {
    case 'meteor':
      area(w, hero, { x: target.x, y: target.y, r: 30, delay: 0.8, dur: 0, tick: 1, tickT: 0, dmg: atk * 3, kind: 'meteor', color: '#ff8a3a' });
      break;
    case 'rain':
      area(w, hero, { x: target.x, y: target.y, r: 30, delay: 0.2, dur: 1.6, tick: 0.18, tickT: 0, dmg: atk * 0.4, kind: 'rain', color: '#e8e0c8' });
      break;
    case 'fireball':
      area(w, hero, { x: target.x, y: target.y, r: 22, delay: 0.35, dur: 0, tick: 1, tickT: 0, dmg: atk * 2, kind: 'bomb', color: '#ff7a2a' });
      break;
    case 'whirlwind':
      // (Every spell lands a beat later, as an area or a shot: this runs inside World.damage, and a hit
      // dealt from here could kill the foe being hit a second time.)
      area(w, hero, { x: hero.x, y: hero.y, r: 30, delay: 0.06, dur: 0, tick: 1, tickT: 0, dmg: atk * 1.2, kind: 'slam', color: '#e8f0ff' });
      w.fx.push({ kind: 'spark', x: hero.x, y: hero.y - 6, color: '#e8f0ff' });
      break;
    case 'light':
      for (const o of w.heroes) if (!o.downed) w.heal(o, o.maxHp * 0.15);
      w.fx.push({ kind: 'levelup', x: hero.x, y: hero.y, color: '#fff0a0' });
      break;
    case 'bolts': {
      const foes = w.livingMobs().filter((m) => dist(m.x, m.y, hero.x, hero.y) < 160);
      for (let i = 0; i < 3; i++) {
        const t = foes.length ? foes[i % foes.length] : target;
        const [nx, ny] = norm(t.x - hero.x + (i - 1) * 8, t.y - 6 - (hero.y - 10));
        w.shots.push({ uid: uid(), team: 'hero', x: hero.x, y: hero.y - 10, vx: nx * 150, vy: ny * 150, r: 3, dmg: atk * 0.8, life: 1.4, kind: 'bolt', color: '#b08aff', from: hero.uid, homing: 6, splash: 16 });
      }
      break;
    }
    case 'shockwave':
      for (const e of w.livingMobs()) if (!e.boss && dist(e.x, e.y, hero.x, hero.y) <= 64) e.stunT = Math.max(e.stunT, 0.8);
      area(w, hero, { x: hero.x, y: hero.y, r: 64, delay: 0.06, dur: 0, tick: 1, tickT: 0, dmg: atk * 0.8, kind: 'slam', color: '#ffd84a' });
      w.fx.push({ kind: 'shock', x: hero.x, y: hero.y, color: '#ffd84a', size: 4, src: 'taunt' });
      w.shakeIt(2, 0.2);
      break;
  }
  if (c) say(w, c, hero, SPELL_NAME[spell], COLORS.wild, true, 0);
  else w.text(hero.x, hero.y - 30, SPELL_NAME[spell], COLORS.wild, true);
  return spell;
}
