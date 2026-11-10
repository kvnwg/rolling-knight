/**
 * The foes' bullets, each kind with a way of flying of its own. A plain bullet is the slow heavy orb
 * (ai.ts fires those: a Shot with nothing more to it); every other kind is a Shot that carries a
 * `b`, its Bullet: what it is and where it is along its own path.
 *
 *   dart    fast and thin, straight down a line its archer showed you through a long wind-up
 *   spit    leaves fast, brakes hard and hangs in the air a while (flyers)
 *   spore   drifts slowly, weaving side to side (plants, bugs)
 *   seed    a fat pod that swells, then bursts into a fan of pips (plants)
 *   glob    lobbed in an arc onto a marked spot: it only hits where it lands (slimes)
 *   mine    tossed a little way, sits ticking, then pops into a ring of pips (pumpkins, the farm's hens)
 *   blade   a spinning blade, bone or axe thrown straight out, that loops back (goblins, skeletons, orcs)
 *   pellet  a short-range spray of small shot (beasts; a charger's clods; a bomber's shrapnel)
 *   wisp    slow, turns after you, and can be cut or shot down (ghosts)
 *   wave    a wide crescent rolling along the ground: step aside or roll through, a swing won't stop it (golems)
 *   spark   small and quick, fired in a stream down one line: a beam (elite casters)
 *   pip     what a seed or a mine bursts into: small, quick, soon gone
 *
 * ONE RULE FOR THEIR COLORS (render/art/bullets.ts draws them): every foe's bullet has the same dark
 * ink outline and a white-hot heart, so it's never one of the squad's shots or a pickup; its hue says
 * what it does. Red flies straight. Pink bends: it curves, weaves, homes or comes back. Orange
 * bursts: it lands, splits or pops.
 *
 * The world moves and lands every shot (world.ts updateShots); tickBullet runs first for these and
 * bends the path, or sees to the whole of it (a glob in the air, a mine on the ground). Knights on
 * Auto see every kind coming (bulletThreat, for ai.ts threatened); a swing cuts what a blade could
 * reach (cuttable). Nothing here keeps anything per frame: a bullet's state is made once, as it's fired.
 */
import type { BodyPlan } from './biomes';
import { inRing, norm, type Shot, type Unit } from './entities';
import type { Volley } from './mobgen';
import { uid, type World } from './world';

export type BulletForm = 'dart' | 'spit' | 'spore' | 'seed' | 'pip' | 'glob' | 'mine' | 'blade' | 'pellet' | 'wisp' | 'wave' | 'spark';
export type BulletHue = 'red' | 'pink' | 'orange';

/** The three danger hues (each bullet's body color; the art builds its ramp round it). */
export const HUE: Readonly<Record<BulletHue, string>> = { red: '#ee2e3c', pink: '#f23cc8', orange: '#ff9a1e' };

/** A blade's looks: a goblin's knife, a skeleton's bone, an orc's axe. */
export const BLADE_LOOKS = ['knife', 'bone', 'axe'] as const;

export interface Bullet {
  form: BulletForm;
  /** Seconds since it was fired. */
  t: number;
  /** Where it left from, its heading as it left, the speed it left at and its thrower's plain bullet speed (px/s). */
  x0: number;
  y0: number;
  ux: number;
  uy: number;
  sp: number;
  base: number;
  /** The side it leans to (a spore's weave, a blade's loop): 1 or -1. */
  side: number;
  /** Its own clock (s): a blade's way out, a seed's or a mine's fuse, a glob's flight. */
  T: number;
  /** A mine's toss before it sits (s). */
  fly: number;
  /** A lob: where it comes down (on the ground), its ring there, the top of its arc and its height now (px). */
  tx: number;
  ty: number;
  ring: number;
  h: number;
  z: number;
  /** How many pips it bursts into, and each one's hit. */
  n: number;
  kid: number;
  /** Which of its looks it wears (a blade: BLADE_LOOKS). */
  look: number;
  /** A wisp: 1 while it has a knight in its eye. */
  eye: number;
}

interface FormDef {
  hue: BulletHue;
  /** Its hit radius (px), its speed as a share of its thrower's plain bullet speed, seconds it lasts, its hit as a share of the pattern's. */
  r: number;
  speed: number;
  life: number;
  dmg: number;
  /** A swing cuts it out of the air; a knight's shot knocks it down. */
  cut: boolean;
  shoot: boolean;
}

export const FORMS: Readonly<Record<BulletForm, FormDef>> = {
  dart: { hue: 'red', r: 1.5, speed: 1.75, life: 1.7, dmg: 1, cut: true, shoot: false },
  spit: { hue: 'red', r: 2, speed: 2.4, life: 2.8, dmg: 1, cut: true, shoot: false },
  spore: { hue: 'pink', r: 2, speed: 0.8, life: 3.4, dmg: 1, cut: true, shoot: false },
  seed: { hue: 'orange', r: 3, speed: 0.7, life: 4, dmg: 1, cut: true, shoot: false },
  pip: { hue: 'red', r: 1.5, speed: 1.15, life: 1, dmg: 1, cut: true, shoot: false },
  glob: { hue: 'orange', r: 3, speed: 1, life: 6, dmg: 1, cut: false, shoot: false },
  mine: { hue: 'orange', r: 3, speed: 1, life: 6, dmg: 1, cut: true, shoot: true },
  blade: { hue: 'pink', r: 2.5, speed: 2, life: 4, dmg: 1, cut: true, shoot: false },
  pellet: { hue: 'red', r: 1.5, speed: 1.35, life: 0.55, dmg: 1, cut: true, shoot: false },
  wisp: { hue: 'pink', r: 2.5, speed: 0.6, life: 5, dmg: 0.85, cut: true, shoot: true },
  wave: { hue: 'red', r: 5, speed: 0.85, life: 1.5, dmg: 1, cut: false, shoot: false },
  spark: { hue: 'red', r: 1.5, speed: 1.6, life: 1.4, dmg: 1, cut: true, shoot: false },
};

/** A spore's weave: this far to each side (px), once round in this long (s). */
export const SPORE_SWAY = 7;
export const SPORE_PERIOD = 1;
/** A blade flies out straight; coming back, its loop bulges this far to one side of its line (px). */
export const BLADE_BULGE = 14;
/** A spit's speed over its flight, as a share of its thrower's plain bullet speed: it leaves at the sum, and settles at SPIT_DRIFT. */
export const SPIT_DRIFT = 0.45;
const SPIT_RUSH = 1.95;
const SPIT_BRAKE = 0.28;
/** A wisp turns this fast (rad/s) toward the nearest knight this close (px). */
export const WISP_TURN = 1.5;
const WISP_SIGHT = 150;
/** A mine sits this long before it pops (s), after a toss this long. */
export const MINE_FUSE = 1.1;
export const MINE_TOSS = 0.45;
/** A seed swells for this long before it bursts (its pulse: the tell). */
export const SEED_PULSE = 0.4;
/** Shots fly at body height: this far above a unit's feet. */
const BODY = 6;

interface FireOpts {
  /** Radians a second it bends (a plain curve, on any kind). */
  curve?: number;
  side?: number;
  look?: number;
  /** How far off its target is (px): a blade turns back just past it, a seed bursts short of it. */
  reach?: number;
  /** A seed's or a mine's pips, and each one's hit (x attack). */
  n?: number;
  kid?: number;
  /** Its speed and its life, as shares of the kind's own. */
  speed?: number;
  life?: number;
}

const NONE: FireOpts = {};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** A bullet of `form` from (x, y) along angle `a`: `v` px/s, a hit of `dmg` (already worked out). */
function make(w: World, from: number, form: BulletForm, x: number, y: number, a: number, v: number, base: number, dmg: number, o: FireOpts = NONE): Shot {
  const F = FORMS[form];
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const id = uid();
  // (Left to itself, every other one leans the other way: a volley of spores weaves, bones loop both sides.)
  const b: Bullet = { form, t: 0, x0: x, y0: y, ux, uy, sp: v, base, side: o.side ?? (id % 2 ? 1 : -1), T: 0, fly: 0, tx: x, ty: y, ring: 0, h: 0, z: 0, n: 0, kid: 0, look: o.look ?? 0, eye: 0 };
  const s: Shot = { uid: id, team: 'mob', x, y, vx: ux * v, vy: uy * v, r: F.r, dmg, life: F.life * (o.life ?? 1), kind: 'bullet', color: HUE[F.hue], from, b };
  if (o.curve) s.curve = o.curve;
  w.shots.push(s);
  return s;
}

/**
 * One bullet of m's of `form` from (x, y) along angle `a`. `sp` is m's plain bullet speed (the kind
 * flies at its own share of it), `dmg` the pattern's hit (x m's attack).
 */
export function fire(w: World, m: Unit, form: BulletForm, x: number, y: number, a: number, sp: number, dmg: number, o: FireOpts = NONE): Shot {
  const F = FORMS[form];
  const v = sp * F.speed * (o.speed ?? 1);
  const s = make(w, m.uid, form, x, y, a, v, sp, m.atk * dmg * F.dmg, o);
  const b = s.b!;
  switch (form) {
    case 'blade': {
      // It turns back just past where its target stood, and is home again in as long as it took to get there.
      const reach = clamp((o.reach ?? 70) + 12, 46, 112);
      b.T = (2 * reach) / v;
      s.life = b.T * 2 + 0.05;
      break;
    }
    case 'seed': {
      // It bursts short of its target, so the pips have room to fan out (and be seen).
      const reach = clamp((o.reach ?? 70) - 34, 24, 84);
      b.T = reach / v;
      b.n = o.n ?? 3;
      b.kid = m.atk * (o.kid ?? 0.5);
      s.life = b.T + 1;
      break;
    }
    case 'wave':
      // A wave rolls on through whoever it hits (each knight once).
      s.pierce = 2;
      break;
    case 'spit':
      b.sp = sp * (SPIT_DRIFT + SPIT_RUSH);
      s.vx = b.ux * b.sp;
      s.vy = b.uy * b.sp;
      break;
    default:
      break;
  }
  return s;
}

/**
 * A glob or a mine of m's lobbed from (x, y) (where it leaves, as drawn) onto the ground at (tx, ty).
 * A glob is in the air for `flight` seconds and hits everyone inside its ring (`ring` px) as it lands,
 * for `dmg` x attack; a mine sits there, then pops into `n` pips of `kid` x attack each.
 */
export function lob(w: World, m: Unit, form: 'glob' | 'mine', x: number, y: number, tx: number, ty: number, sp: number, dmg: number, o: { flight?: number; ring?: number; n?: number; kid?: number } = {}): Shot {
  const s = make(w, m.uid, form, x, y, Math.atan2(ty - y, tx - x), 0, sp, m.atk * dmg);
  const b = s.b!;
  const far = Math.hypot(tx - x, ty - y);
  b.tx = tx;
  b.ty = ty;
  if (form === 'glob') {
    b.T = o.flight ?? 0.7 + far / 200;
    b.ring = o.ring ?? 10;
    b.h = 16 + far * 0.22;
  } else {
    b.fly = MINE_TOSS;
    b.T = MINE_FUSE;
    b.h = 9;
    b.n = o.n ?? 5;
    b.kid = m.atk * (o.kid ?? 0.18);
  }
  s.vx = (tx - x) / (form === 'glob' ? b.T : b.fly);
  s.vy = (ty - y) / (form === 'glob' ? b.T : b.fly);
  s.life = b.fly + b.T + 1;
  return s;
}

// ------------------------------------------------------------------ in flight

/** How far along its line a blade is at `t`, and how far out to its side (only on its way back). */
function bladeAt(b: Bullet, t: number): [number, number] {
  return [b.sp * (t - (t * t) / (2 * b.T)), t > b.T ? b.side * BLADE_BULGE * Math.sin((Math.PI * (t - b.T)) / b.T) : 0];
}

function sway(b: Bullet, t: number): number {
  return b.side * SPORE_SWAY * Math.sin((t / SPORE_PERIOD) * Math.PI * 2);
}

/** Is this mine sitting on the ground (not still in the air)? */
export function sitting(s: Shot): boolean {
  return s.b?.form === 'mine' && s.b.t >= s.b.fly;
}

/** Is this shot up in the air, out of everyone's reach (a glob in flight, a mine being tossed)? */
export function airborne(s: Shot): boolean {
  const b = s.b;
  return !!b && (b.form === 'glob' || (b.form === 'mine' && b.t < b.fly));
}

/** Can a swing (or a shield) take this shot out of the air? Not a wave along the ground, nor anything still up in its arc. */
export function cuttable(s: Shot): boolean {
  const b = s.b;
  return !b || (FORMS[b.form].cut && !airborne(s));
}

/**
 * A frame of one of these bullets, before the world moves it: bends its path, or (true) sees to all
 * of it itself, so the world leaves it be (a lob in its arc, a mine on the ground, a seed bursting).
 */
export function tickBullet(w: World, s: Shot, dt: number): boolean {
  const b = s.b!;
  const t0 = b.t;
  b.t += dt;
  switch (b.form) {
    case 'spore': {
      // Its weave: the step sideways since last frame, on top of its drift.
      const d = sway(b, b.t) - sway(b, t0);
      s.x -= b.uy * d;
      s.y += b.ux * d;
      return false;
    }
    case 'spit': {
      const v = b.base * (SPIT_DRIFT + SPIT_RUSH * Math.exp(-b.t / SPIT_BRAKE));
      s.vx = b.ux * v;
      s.vy = b.uy * v;
      return false;
    }
    case 'blade': {
      if (b.t >= b.T * 2) {
        s.life = 0;
        return true;
      }
      // Out straight down its line, slowing; then back, quickening, round a loop that bulges to one side.
      const al = b.sp * (1 - b.t / b.T);
      const la = b.t > b.T ? b.side * BLADE_BULGE * (Math.PI / b.T) * Math.cos((Math.PI * (b.t - b.T)) / b.T) : 0;
      s.vx = b.ux * al - b.uy * la;
      s.vy = b.uy * al + b.ux * la;
      return false;
    }
    case 'seed':
      if (b.t < b.T) return false;
      burst(w, s, Math.atan2(b.uy, b.ux), 1.1, 0);
      return true;
    case 'wisp': {
      let best: Unit | null = null;
      let bd = WISP_SIGHT * WISP_SIGHT;
      for (const h of w.heroes) {
        if (h.downed) continue;
        const d = (h.x - s.x) * (h.x - s.x) + (h.y - BODY - s.y) * (h.y - BODY - s.y);
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      b.eye = best ? 1 : 0;
      if (best) {
        const cur = Math.atan2(s.vy, s.vx);
        let da = Math.atan2(best.y - BODY - s.y, best.x - s.x) - cur;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        const a = cur + clamp(da, -WISP_TURN * dt, WISP_TURN * dt);
        s.vx = Math.cos(a) * b.sp;
        s.vy = Math.sin(a) * b.sp;
      }
      shotDown(w, s, s.y);
      return false;
    }
    case 'glob': {
      const p = Math.min(1, b.t / b.T);
      s.x = b.x0 + (b.tx - b.x0) * p;
      s.y = b.y0 + (b.ty - b.y0) * p;
      b.z = b.h * 4 * p * (1 - p);
      if (p >= 1) land(w, s);
      return true;
    }
    case 'mine': {
      if (b.t < b.fly) {
        const p = b.t / b.fly;
        s.x = b.x0 + (b.tx - b.x0) * p;
        s.y = b.y0 + (b.ty - b.y0) * p;
        b.z = b.h * 4 * p * (1 - p);
        return true;
      }
      s.x = b.tx;
      s.y = b.ty;
      s.vx = s.vy = 0;
      b.z = 0;
      if (b.t >= b.fly + b.T) {
        // It pops: its pips all round, at body height.
        s.y -= BODY - 1;
        burst(w, s, (s.uid % 7) * 0.9, Math.PI * 2, 4);
      } else shotDown(w, s, s.y - BODY + 1);
      return true;
    }
    default:
      return false;
  }
}

/** A seed or a mine goes: its pips fan out over `spread` radians round `a0`, starting `r0` px out. */
function burst(w: World, s: Shot, a0: number, spread: number, r0: number): void {
  const b = s.b!;
  s.life = 0;
  const all = spread >= Math.PI * 2;
  const v = b.base * FORMS.pip.speed;
  for (let i = 0; i < b.n; i++) {
    const a = all ? a0 + (i / b.n) * spread : a0 + (b.n > 1 ? (i / (b.n - 1) - 0.5) * spread : 0);
    make(w, s.from, 'pip', s.x + Math.cos(a) * r0, s.y + Math.sin(a) * r0, a, v, b.base, b.kid);
  }
  w.fx.push({ kind: 'spark', x: s.x, y: s.y, color: s.color });
}

/** A glob comes down: everyone inside its ring is hit (a roll goes untouched), and it splashes. */
function land(w: World, s: Shot): void {
  const b = s.b!;
  s.life = 0;
  b.z = 0;
  let from: Unit | null = null;
  for (const m of w.mobs) if (m.uid === s.from) from = m;
  for (const h of w.enemiesInRing('mob', b.tx, b.ty, b.ring)) {
    if (w.evades(h)) continue;
    w.damage(h, s.dmg, from, { knock: 4, kx: h.x - b.tx, ky: h.y - b.ty });
  }
  w.fx.push({ kind: 'land', x: b.tx, y: b.ty, size: 0.6, color: s.color });
}

/** A knight's shot that touches this one (a wisp, a mine on the ground) knocks it down, and stops there unless it pierces. */
function shotDown(w: World, s: Shot, y: number): void {
  for (const o of w.shots) {
    if (o.team !== 'hero' || o.life <= 0) continue;
    const dx = o.x - s.x;
    const dy = o.y - y;
    const r = s.r + o.r + 3;
    if (dx * dx + dy * dy > r * r) continue;
    s.life = 0;
    if (o.pierce && o.pierce > 0) o.pierce -= 1;
    else o.life = 0;
    w.fx.push({ kind: 'spark', x: s.x, y, color: s.color, src: 'cut' });
    w.events.push({ type: 'clink', x: s.x, y, reflect: false, mine: false });
    return;
  }
}

// ------------------------------------------------------------------ seeing them coming

/** Where one of these bullets will be `t` seconds from now, as [x, y] into `out`. */
function ahead(s: Shot, t: number, out: [number, number]): void {
  const b = s.b!;
  switch (b.form) {
    case 'spore': {
      const d = sway(b, b.t + t) - sway(b, b.t);
      out[0] = s.x + s.vx * t - b.uy * d;
      out[1] = s.y + s.vy * t + b.ux * d;
      return;
    }
    case 'blade': {
      const [a0, l0] = bladeAt(b, b.t);
      const [a1, l1] = bladeAt(b, Math.min(b.T * 2, b.t + t));
      out[0] = s.x + b.ux * (a1 - a0) - b.uy * (l1 - l0);
      out[1] = s.y + b.uy * (a1 - a0) + b.ux * (l1 - l0);
      return;
    }
    case 'spit': {
      // (It's braking: how far it really gets, not how far its speed now would take it.)
      const d = b.base * (SPIT_DRIFT * t + SPIT_RUSH * SPIT_BRAKE * (Math.exp(-b.t / SPIT_BRAKE) - Math.exp(-(b.t + t) / SPIT_BRAKE)));
      out[0] = s.x + b.ux * d;
      out[1] = s.y + b.uy * d;
      return;
    }
    default:
      out[0] = s.x + s.vx * t;
      out[1] = s.y + s.vy * t;
  }
}

const SPOT: [number, number] = [0, 0];
/** How far ahead a knight looks for a bullet (s), in steps this long. */
const LOOK = 0.35;
const LOOK_STEP = 0.05;

/**
 * Is this bullet about to hit knight `u`? Returns the way to roll (or null): out of a glob's ring or
 * away from a mine about to pop, through a wave, sideways out of the path of anything else (followed
 * along its real path: a spore's weave, a blade's loop).
 */
export function bulletThreat(s: Shot, u: Unit): [number, number] | null {
  const b = s.b!;
  if (b.form === 'glob') {
    if (b.T - b.t > 0.5 || !inRing(u.x, u.y, u.r + 3, b.tx, b.ty, b.ring)) return null;
    return away(u.x - b.tx, u.y - b.ty);
  }
  if (b.form === 'mine') {
    if (b.t < b.fly || b.fly + b.T - b.t > 0.45) return null;
    const dx = u.x - s.x;
    const dy = u.y - s.y;
    return dx * dx + dy * dy < 34 * 34 ? away(dx, dy) : null;
  }
  const by = u.y - BODY;
  if (b.form === 'seed' && b.T - b.t < 0.35) {
    // About to burst: its pips fan out ahead of it.
    const dx = u.x - s.x;
    const dy = by - s.y;
    if (dx * dx + dy * dy < 30 * 30 && dx * b.ux + dy * b.uy > -4) return away(dx, dy);
  }
  const reach = u.r + s.r + 4;
  for (let t = LOOK_STEP; t <= LOOK + 1e-6; t += LOOK_STEP) {
    if (t > s.life) break;
    ahead(s, t, SPOT);
    const dx = u.x - SPOT[0];
    const dy = by - SPOT[1];
    if (dx * dx + dy * dy >= reach * reach) continue;
    // A wave is too wide to step round in time: through it.
    if (b.form === 'wave') return away(-s.vx, -s.vy);
    // Sideways, to the side the knight is already on.
    const px = -s.vy;
    const py = s.vx;
    const side = (u.x - s.x) * px + (by - s.y) * py >= 0 ? 1 : -1;
    return away(px * side, py * side);
  }
  return null;
}

function away(dx: number, dy: number): [number, number] {
  const d = norm(dx, dy);
  return d[0] || d[1] ? d : [1, 0];
}

// ------------------------------------------------------------------ the patterns

/** A pattern's place: where m's bullets leave from, and the angle to (tx, ty) from there. */
function muzzle(m: Unit, tx: number, ty: number): [number, number, number] {
  const oy = m.y - BODY * (m.type?.size ?? 1);
  return [m.x, oy, Math.atan2(ty - oy, tx - m.x)];
}

/**
 * The volleys only these bullets fire, at (tx, ty): `d` is how dense (ai.ts density), `sp` m's plain
 * bullet speed. Each bullet hits for less than a bite; the more in a volley, the less each.
 *   lob    a glob onto where you stand (two, deeper down); or a mine tossed your way
 *   pods   two or three seeds either side of you, each bursting into three to five pips
 *   spray  four to seven pellets in a cone, some quicker than others
 *   drift  three to five spores in a loose fan, weaving against each other
 *   wisps  wisps let go wide of you, to come round: two to four from a wraith, one or two from a spirit
 * ('beam', a stream of sparks, is a burst: ai.ts fires it shot by shot.)
 */
export function formVolley(w: World, m: Unit, kind: Volley, form: BulletForm | undefined, tx: number, ty: number, d: number, sp: number): void {
  const [ox, oy, aim] = muzzle(m, tx, ty);
  const far = Math.hypot(tx - ox, ty - oy);
  switch (kind) {
    case 'lob': {
      if (form === 'mine') {
        // Tossed part of the way: you see where it sits, and have its fuse to get clear (or to smash it).
        const reach = clamp(far * 0.65, 14, 50);
        // (More pips deeper down, each hitting for less: the mine's whole hit stays what one aimed shot's was.)
        const n = 5 + Math.min(3, d);
        lob(w, m, 'mine', ox, oy, m.x + Math.cos(aim) * reach, m.y + Math.sin(aim) * reach, sp, 0, { n, kid: 0.9 / n });
        break;
      }
      const ring = 10 * (m.elite ? 1.2 : 1);
      lob(w, m, 'glob', ox, oy, tx, ty, sp, 0.9, { ring });
      if (d >= 2) {
        // A second one beside the first, a beat behind it.
        const side = m.uid % 2 ? 1 : -1;
        lob(w, m, 'glob', ox, oy, tx - Math.sin(aim) * 22 * side, ty + Math.cos(aim) * 22 * side, sp, 0.9, { ring, flight: 0.95 + far / 200 });
      }
      break;
    }
    case 'pods': {
      const n = d >= 2 ? 3 : 2;
      const pips = Math.min(5, 3 + (d >= 3 ? 2 : d >= 1 ? 1 : 0));
      const kid = d >= 3 ? 0.42 : d >= 2 ? 0.45 : 0.5;
      for (let i = 0; i < n; i++) fire(w, m, 'seed', ox, oy, aim + (i - (n - 1) / 2) * (n === 2 ? 0.56 : 0.42), sp, kid * 1.6, { reach: far, n: pips, kid });
      break;
    }
    case 'spray': {
      const n = Math.min(7, 4 + d);
      for (let i = 0; i < n; i++) {
        // (Spread evenly, every other one quicker, so it's a cloud and not a wall.)
        fire(w, m, 'pellet', ox, oy, aim + (i / (n - 1) - 0.5) * 0.76, sp, 0.72 / n, { speed: i % 2 ? 1.15 : 0.88 });
      }
      break;
    }
    case 'drift': {
      const n = Math.min(5, 3 + d);
      for (let i = 0; i < n; i++) fire(w, m, 'spore', ox, oy, aim + (i - (n - 1) / 2) * 0.3, sp, 0.4 + 0.1 * Math.min(2, d), { side: i % 2 ? 1 : -1 });
      break;
    }
    case 'wisps': {
      // (A wraith lets a few go; the small spirits of a swarm one, or two deeper down.)
      const few = m.type?.behavior === 'swarm';
      const n = few ? 1 + Math.min(1, d) : 2 + Math.min(2, d);
      for (let i = 0; i < n; i++) fire(w, m, 'wisp', ox, oy, aim + (n > 1 ? (i - (n - 1) / 2) * (1.5 / (n - 1)) : 0.5 * (m.uid % 2 ? 1 : -1)), sp, few ? 0.9 : d >= 1 ? 0.7 : 0.6);
      break;
    }
    default:
      break;
  }
}

/**
 * What a heavy mover shakes loose in its own kind as it lands, slams or goes off, from the edge of
 * the ring that just came down (`r0` px round (x, y)): a slime's globs splash out onto marked spots, a
 * golem's slam sends crescents rolling out along the ground, a pumpkin scatters its pips, a bomber its
 * shrapnel. `n` is the type's count; denser deeper down (`d`).
 */
export function quake(w: World, m: Unit, form: BulletForm, x: number, y: number, n: number, r0: number, d: number, sp: number, a0: number): void {
  switch (form) {
    case 'glob': {
      const k = Math.min(10, n + d);
      for (let i = 0; i < k; i++) {
        const a = a0 + (i / k) * Math.PI * 2;
        // Every other one flies further (and a beat longer), so the rings land in two rounds.
        const out = r0 + 15 + (i % 2) * 13;
        lob(w, m, 'glob', x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * out, y + BODY + Math.sin(a) * out * 0.8, sp, 0.5, { ring: 8, flight: 0.7 + (i % 2) * 0.18 });
      }
      return;
    }
    case 'wave': {
      const k = Math.max(4, Math.round(n * 0.75)) + Math.min(2, d);
      for (let i = 0; i < k; i++) {
        const a = a0 + (i / k) * Math.PI * 2;
        fire(w, m, 'wave', x + Math.cos(a) * r0, y + Math.sin(a) * r0, a, sp, 0.65);
      }
      return;
    }
    default: {
      const k = Math.min(14, n + 2 * d);
      for (let i = 0; i < k; i++) {
        const a = a0 + (i / k) * Math.PI * 2;
        fire(w, m, form, x + Math.cos(a) * r0, y + Math.sin(a) * r0, a, sp * 0.8, 0.5, form === 'pellet' ? { life: 1.5, speed: i % 2 ? 1.1 : 0.9 } : NONE);
      }
    }
  }
}

/** A charger's charge ends: clods fly on ahead of it (dx, dy: its heading), a short spray. */
export function kick(w: World, m: Unit, dx: number, dy: number, d: number, sp: number): void {
  const n = Math.min(5, (m.type?.kick ?? 0) + Math.min(2, d));
  if (n <= 0) return;
  const a0 = Math.atan2(dy, dx);
  for (let i = 0; i < n; i++) fire(w, m, 'pellet', m.x + dx * (m.r + 2), m.y - BODY + dy * (m.r + 2), a0 + (n > 1 ? (i / (n - 1) - 0.5) * 0.7 : 0), sp, 0.13, { speed: i % 2 ? 0.9 : 1.1 });
}

/**
 * A boss's own patterns, built from its kind's bullets: every other ring and every other fan is one of
 * these instead of the plain one (true when it fired; false: the plain one's turn). None throws more
 * than the plain ring (14 bullets, 20 enraged) or fan (5, 7) it stands in for.
 *   slimes      a glob onto every knight and a ring of them round itself; a line of globs walking at you
 *   golems      two rings of crescents, one behind the other; three wide crescents
 *   beasts      (and the farm's hog and ram) a nova of pellets; a thick spray
 *   humanoids   a ring of blades that all come back; a fan of them
 *   ghosts      wisps let go all round; a beam of sparks
 *   pumpkins    mines tossed all round; seeds that burst
 */
export function bossPattern(w: World, m: Unit, move: 'ring' | 'fan', target: Unit, enraged: boolean, sp: number): boolean {
  const n = (m.volley = (m.volley ?? 0) + 1);
  if (n % 2 === 1) return false;
  const plan: BodyPlan | undefined = m.type?.plan;
  const [ox, oy, aim] = muzzle(m, target.x, target.y);
  const far = Math.hypot(target.x - ox, target.y - oy);
  const spin = w.time;
  const round = (k: number, each: (a: number, i: number) => void) => {
    for (let i = 0; i < k; i++) each(spin + (i / k) * Math.PI * 2, i);
  };
  const spreadOut = (k: number, gap: number, each: (a: number, i: number) => void) => {
    for (let i = 0; i < k; i++) each(aim + (i - (k - 1) / 2) * gap, i);
  };
  switch (plan) {
    case 'slime':
      if (move === 'ring') {
        for (const h of w.heroes) if (!h.downed) lob(w, m, 'glob', ox, oy, h.x, h.y, sp, 1.2, { ring: 13, flight: 1.1 });
        round(enraged ? 9 : 6, (a) => lob(w, m, 'glob', ox, oy, m.x + Math.cos(a) * 46, m.y + Math.sin(a) * 38, sp, 1, { ring: 10, flight: 0.8 }));
      } else {
        const k = enraged ? 6 : 4;
        for (let i = 0; i < k; i++) lob(w, m, 'glob', ox, oy, m.x + Math.cos(aim) * (28 + i * 22), m.y + Math.sin(aim) * (28 + i * 22), sp, 1, { ring: 11, flight: 0.6 + i * 0.2 });
      }
      return true;
    case 'golem':
      if (move === 'ring') {
        const k = enraged ? 10 : 8;
        round(k, (a) => fire(w, m, 'wave', ox + Math.cos(a) * 12, oy + Math.sin(a) * 12, a, sp, 0.8));
        round(k, (a) => fire(w, m, 'wave', ox + Math.cos(a + Math.PI / k) * 12, oy + Math.sin(a + Math.PI / k) * 12, a + Math.PI / k, sp, 0.8, { speed: 0.62, life: 1.5 }));
      } else spreadOut(enraged ? 5 : 3, 0.34, (a) => fire(w, m, 'wave', ox, oy, a, sp, 1.3, { life: 1.5 }));
      return true;
    case 'beast':
    case 'pig':
    case 'ram':
      if (move === 'ring') round(enraged ? 24 : 18, (a, i) => fire(w, m, 'pellet', ox + Math.cos(a) * 10, oy + Math.sin(a) * 10, a, sp, 0.6, { life: 2, speed: i % 2 ? 1.1 : 0.8 }));
      else spreadOut(enraged ? 12 : 9, 1 / (enraged ? 12 : 9), (a, i) => fire(w, m, 'pellet', ox, oy, a, sp, 0.5, { life: 2, speed: 0.8 + (i % 3) * 0.18 }));
      return true;
    case 'humanoid':
      if (move === 'ring') round(enraged ? 8 : 6, (a, i) => fire(w, m, 'blade', ox, oy, a, sp, 1.5, { reach: 84, side: i % 2 ? 1 : -1, look: 2 }));
      else spreadOut(enraged ? 5 : 3, 0.3, (a, i) => fire(w, m, 'blade', ox, oy, a, sp, 1.3, { reach: far, side: i % 2 ? 1 : -1, look: 2 }));
      return true;
    case 'ghost':
      if (move === 'ring') round(enraged ? 7 : 5, (a) => fire(w, m, 'wisp', ox, oy, a, sp, 1.4));
      else m.burst = { n: enraged ? 11 : 8, t: 0, tx: target.x, ty: target.y, every: 0.07, dmg: 0.6, form: 'spark' };
      return true;
    case 'pumpkin':
      if (move === 'ring') round(enraged ? 6 : 4, (a) => lob(w, m, 'mine', ox, oy, m.x + Math.cos(a) * 42, m.y + Math.sin(a) * 34, sp, 0, { n: 6, kid: 0.45 }));
      else spreadOut(enraged ? 3 : 2, 0.5, (a) => fire(w, m, 'seed', ox, oy, a, sp, 0.9, { reach: far, n: 5, kid: 0.45 }));
      return true;
    default:
      return false;
  }
}

// ------------------------------------------------------------------ what they add up to

/**
 * The most this shot can take off one knight: its own hit, or all the pips it bursts into (a seed
 * that lands whole doesn't burst as well). For the balance tests and the dev tools.
 */
export function payload(s: Shot): number {
  const b = s.b;
  if (!b) return s.dmg;
  if (b.form === 'mine') return b.n * b.kid;
  if (b.form === 'seed') return Math.max(s.dmg, b.n * b.kid);
  return s.dmg;
}
