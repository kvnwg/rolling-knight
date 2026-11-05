/**
 * Melee, the way Enter the Gungeon's blades and bats work. A swing goes exactly where the knight aims
 * and is a real hitbox while it's live (each class's `live` seconds, about as long as its smear
 * shows): the Blade's a wide arc in front, the Guardian's a short heavy arc with a big knockback, the
 * Lancer's a long narrow thrust. Every foe inside is hit once, knocked back along the hit, and the
 * knight steps a little into the blow.
 *
 * And it cuts the foes' shots out of the air: any enemy shot inside while it's live is destroyed with
 * a clink. The Blade (and Kevin, who is one) sends it back along the aim as its own shot; the Lancer's
 * thrust pops every shot along its line; the Guardian's swing knocks them down. Squadmates' swings cut
 * shots too. The knight you steer freezes the moment on its first blow of a swing (hit-stop: longer on
 * a crit, a little shake on the Guardian's).
 *
 * startSwing is called from the knight's attack (skills.ts) and tickSwing every frame of its tick, so
 * a swing keeps cutting while it's live; nothing here rolls the sim's dice.
 */
import type { ClassId } from '../core/knights';
import { BODY_Y } from './aim';
import { dist, lineOfSight, type MeleeSwing, type Shot, type Unit } from './entities';
import { hitStop, shove, steered } from './feel';
import { uid, type World } from './world';

export type MeleeClass = Extract<ClassId, 'guardian' | 'blade' | 'lancer'>;

export function isMeleeClass(cls: ClassId | undefined): cls is MeleeClass {
  return cls === 'guardian' || cls === 'blade' || cls === 'lancer';
}

export interface SwingDef {
  shape: MeleeSwing['shape'];
  /** Reach past the class's range stat (px). */
  reach: number;
  /** Arcs: the half angle (degrees). Thrusts: the half width (px). */
  half: number;
  /** Seconds the hitbox is live. */
  live: number;
  /** The step into the swing (px) and the knockback on each foe it hits (px). */
  step: number;
  knock: number;
  /** The freeze on the first blow (s), on a crit, and the shake on each blow (0: none). */
  stop: number;
  critStop: number;
  shake: number;
  /** What it does to a foe's shot it catches. */
  cuts: MeleeSwing['cuts'];
}

export const SWINGS: Readonly<Record<MeleeClass, SwingDef>> = {
  blade: { shape: 'arc', reach: 12, half: 72, live: 0.12, step: 3, knock: 8, stop: 0.045, critStop: 0.065, shake: 0, cuts: 'reflect' },
  guardian: { shape: 'arc', reach: 6, half: 58, live: 0.13, step: 2, knock: 18, stop: 0.06, critStop: 0.07, shake: 1.6, cuts: 'cut' },
  lancer: { shape: 'thrust', reach: 15, half: 6, live: 0.1, step: 3, knock: 7, stop: 0.04, critStop: 0.06, shake: 0, cuts: 'pop' },
};

/** A shot the Blade sends back: this many times its attack, at least this fast (px/s), for this long (s). */
export const REFLECT_DMG = 1;
export const REFLECT_SPEED = 230;
const REFLECT_LIFE = 1.1;

/**
 * Is a circle of radius r at (rx, ry) from the knight inside the swing? An arc: within its reach and
 * its angle (counting the circle's own width); a thrust: within its line.
 */
export function inSwing(s: Pick<MeleeSwing, 'shape' | 'ax' | 'ay' | 'reach' | 'half'>, rx: number, ry: number, r: number): boolean {
  if (s.shape === 'thrust') {
    const along = rx * s.ax + ry * s.ay;
    const across = Math.abs(rx * s.ay - ry * s.ax);
    return along >= -4 - r && along <= s.reach + r && across <= s.half + r;
  }
  const d = Math.hypot(rx, ry);
  if (d > s.reach + r) return false;
  if (d <= r) return true;
  const cos = Math.max(-1, Math.min(1, (rx * s.ax + ry * s.ay) / d));
  return Math.acos(cos) <= s.half + Math.asin(Math.min(1, r / d));
}

/** Starts knight h's swing along (ax, ay) for `dmg`, and lands it on whatever is inside right now. */
export function startSwing(w: World, h: Unit, ax: number, ay: number, dmg: number, crit: boolean): void {
  const cls = h.cls as MeleeClass;
  const def = SWINGS[cls];
  h.swing = {
    shape: def.shape,
    ax,
    ay,
    reach: (h.range ?? 20) + def.reach,
    half: def.shape === 'arc' ? (def.half * Math.PI) / 180 : def.half,
    t: def.live,
    dmg,
    crit,
    knock: def.knock,
    cuts: def.cuts,
    hit: new Set(),
    stopped: false,
  };
  // A little step into the blow.
  shove(h, ax, ay, def.step);
  land(w, h, h.swing, def);
}

/** Every frame of knight h's tick: a live swing keeps hitting what comes into it and cutting shots. */
export function tickSwing(w: World, h: Unit, dt: number): void {
  const s = h.swing;
  if (!s) return;
  if (h.downed || h.rolling || h.landing || h.stunT > 0) {
    h.swing = undefined;
    return;
  }
  s.t -= dt;
  if (s.t <= 0) {
    h.swing = undefined;
    return;
  }
  land(w, h, s, SWINGS[h.cls as MeleeClass]);
}

function land(w: World, h: Unit, s: MeleeSwing, def: SwingDef): void {
  // --- foes inside, once each
  for (const e of w.mobs) {
    if (e.dead || s.hit.has(e.uid)) continue;
    if (!inSwing(s, e.x - h.x, e.y - h.y, e.r)) continue;
    // (Not through a wall.)
    if (!lineOfSight(w.map, h.x, h.y - 4, e.x, e.y - 4)) continue;
    s.hit.add(e.uid);
    // Knocked back along the hit: the swing's way, bent out from the knight (straight on for a thrust).
    const d = dist(e.x, e.y, h.x, h.y) || 1;
    const out = s.shape === 'arc' ? 0.6 : 0;
    const kx = s.ax + ((e.x - h.x) / d) * out;
    const ky = s.ay + ((e.y - h.y) / d) * out;
    const dealt = w.damage(e, s.dmg, h, { crit: s.crit, kx, ky });
    if (dealt <= 0) continue;
    if (!e.dead) shove(e, kx, ky, s.knock);
    if (steered(w, h)) {
      if (!s.stopped) {
        s.stopped = true;
        hitStop(w, s.crit ? def.critStop : def.stop);
      }
      if (def.shake > 0 || s.crit) w.shakeIt(def.shake > 0 ? def.shake : 1, 0.1);
    }
  }
  // --- foes' shots inside: cut out of the air
  let cut: Shot[] | null = null;
  for (const b of w.shots) {
    if (b.team !== 'mob' || b.life <= 0) continue;
    if (!inSwing(s, b.x - h.x, b.y - (h.y - BODY_Y), b.r)) continue;
    (cut ??= []).push(b);
  }
  if (!cut) return;
  const gone = new Set(cut);
  w.shots = w.shots.filter((b) => !gone.has(b));
  for (const b of cut) cutShot(w, h, s, b);
}

/**
 * Knight h knocks down every foe's shot within `r` of its body (the Guardian's Shield Bash dash): each
 * is gone with a clink. Returns how many.
 */
export function blockShots(w: World, h: Unit, r: number): number {
  const hit = w.shots.filter((b) => b.team === 'mob' && b.life > 0 && dist(b.x, b.y, h.x, h.y - BODY_Y) <= r + b.r);
  if (!hit.length) return 0;
  const gone = new Set(hit);
  w.shots = w.shots.filter((b) => !gone.has(b));
  for (const b of hit) cutShot(w, h, null, b);
  return hit.length;
}

/** A foe's shot caught by a swing (or a shield): a clink where it was, and for the Blade, the shot sent back. */
function cutShot(w: World, h: Unit, s: MeleeSwing | null, b: Shot): void {
  b.life = 0;
  const back = s?.cuts === 'reflect';
  w.fx.push({ kind: 'spark', x: b.x, y: b.y, color: b.color, src: 'cut' });
  w.events.push({ type: 'clink', x: b.x, y: b.y, reflect: back, mine: h.slot === w.controlled });
  if (!back || !s) return;
  const sp = Math.max(REFLECT_SPEED, Math.hypot(b.vx, b.vy) * 2);
  w.shots.push({
    uid: uid(),
    team: 'hero',
    x: b.x,
    y: b.y,
    vx: s.ax * sp,
    vy: s.ay * sp,
    r: b.r,
    dmg: h.atk * REFLECT_DMG,
    life: REFLECT_LIFE,
    kind: 'bullet',
    color: b.color,
    from: h.uid,
  });
}
