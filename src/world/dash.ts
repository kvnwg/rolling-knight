/**
 * Every class's dash is its own move. The dodge roll (skills.ts heroDodge) starts it, and it's still
 * a roll underneath: untouchable for most of it, then a short landing, no attacking until it's over.
 * What it does on top, by class:
 *
 *   guardian  SHIELD BASH   a shield-first charge: every foe it runs into takes a blow (DASH.bash.dmg)
 *                           and is knocked aside, off its line, and staggered; a boss takes the blow but
 *                           doesn't budge; foes' shots it meets are blocked
 *   ranger    SHOT/SNARE    toward the nearest foe: a POWER SHOT at it as the roll ends (a big piercing
 *                           arrow); away from it (or none near): a SNARE trap where the roll started, that
 *                           roots the first foe to step in (a boss is only slowed); two at a time
 *   blade     PHANTOM       quick (the Blade's dodge cooldown is half a second), a little longer,
 *                           afterimages behind it (Kevin, a Blade, too)
 *   cleric    BLESSED STEP  a holy circle where it started that heals allies inside
 *   arcanist  BLINK         straight there, further, never through a wall; an arcane burst where it left
 *   lancer    SPEAR LUNGE   fast, straight and long: every foe it goes through is hit and pushed on ahead
 *
 * Squadmates' dodges (their AI dodges what it sees coming) are their class's dash too. The dodge perks
 * work on top: Roll Dancer's slicing, Kamikaze's bomb, Hive Mind's squad dodging with you. The marks a
 * dash leaves (Fx with a DashFx `src`) are for the effects (render/vfx) and the sounds (audio/fight).
 */
import type { ClassId } from '../core/knights';
import { BODY_Y, HOLD_Y, aimAt } from './aim';
import { dist, lineOfSight, moveUnit, norm, type DashKind, type Unit } from './entities';
import { hitStop, shove, steered } from './feel';
import { blockShots } from './melee';
import { uid, type World } from './world';

export interface DashDef {
  /** Its name, and the label on the HUD's dodge key. */
  name: string;
  label: string;
  /** What the roll looks like (its animation), how long it lasts (s) and how far it goes (px). */
  kind: DashKind;
  dur: number;
  dist: number;
}

export const DASHES: Readonly<Record<ClassId, DashDef>> = {
  guardian: { name: 'Shield Bash', label: 'SHIELD BASH', kind: 'bash', dur: 0.3, dist: 46 },
  blade: { name: 'Phantom Dash', label: 'PHANTOM', kind: 'shadow', dur: 0.34, dist: 66 },
  ranger: { name: 'Power Shot or Snare', label: 'SHOT/SNARE', kind: 'flip', dur: 0.36, dist: 78 },
  cleric: { name: 'Blessed Step', label: 'BLESSED STEP', kind: 'roll', dur: 0.3, dist: 54 },
  arcanist: { name: 'Blink', label: 'BLINK', kind: 'blink', dur: 0.2, dist: 78 },
  lancer: { name: 'Spear Lunge', label: 'LUNGE', kind: 'lunge', dur: 0.26, dist: 91 },
};

/** The numbers the dashes play by (damage in times the knight's attack, distances in px, times in s). */
export const DASH = {
  /** The Shield Bash: what it runs into (reach from the knight), the blow, the shove aside, the stagger. */
  bash: { r: 10, dmg: 1.2, knock: 24, stagger: 0.3 },
  /** The Power Shot: how near a foe must be to dash toward, the arrow's blow, speed and how many it goes through. */
  shot: { look: 160, dmg: 2.5, speed: 330, pierce: 3 },
  /** A snare: its size, how long it lies, the root (a boss: the slow), the bite, how many at once. */
  snare: { r: 9, life: 8, root: 2, dmg: 0.5, slow: 2, max: 2 },
  /** Blessed Step's circle: its size, how long, the heal a second (share of max HP), every `tick` s. */
  bless: { r: 22, dur: 2.5, heal: 0.06, tick: 0.5 },
  /** The Blink's burst where it left: its size and blow. */
  blink: { r: 18, dmg: 1 },
  /** The Spear Lunge: what it runs through, the blow, the push on ahead. */
  lunge: { r: 8, dmg: 1.5, nudge: 12 },
} as const;

/** The label on the HUD's dodge key for a knight (its class's move). */
export function dashLabel(h: Pick<Unit, 'cls'>): string {
  return h.cls ? DASHES[h.cls].label : 'DODGE';
}

/** The nearest awake foe within `r` of h, in sight (or null). */
function nearestAwake(w: World, h: Unit, r: number): Unit | null {
  let best: Unit | null = null;
  let bd = r;
  for (const m of w.mobs) {
    if (m.dead || !m.awake) continue;
    const d = dist(m.x, m.y, h.x, h.y);
    if (d > bd || !lineOfSight(w.map, h.x, h.y - 4, m.x, m.y - 4)) continue;
    bd = d;
    best = m;
  }
  return best;
}

/**
 * The Ranger's choice as it dashes along (dx, dy): toward the nearest awake foe close by, a roll and
 * a Power Shot at it (its uid); otherwise a backflip away and a snare (null).
 */
export function rangerPlan(w: World, h: Unit, dx: number, dy: number): { kind: DashKind; shot: number | null } {
  const foe = nearestAwake(w, h, DASH.shot.look);
  if (foe) {
    const [fx, fy] = norm(foe.x - h.x, foe.y - h.y);
    if (fx * dx + fy * dy > 0) return { kind: 'roll', shot: foe.uid };
  }
  return { kind: 'flip', shot: null };
}

/** What a dash does as it starts, from (x0, y0) along (dx, dy) (the roll itself already set). */
export function startDash(w: World, h: Unit, dx: number, dy: number, x0: number, y0: number): void {
  switch (h.cls) {
    case 'ranger':
      if (h.rolling?.shot == null) laySnare(w, h, x0, y0);
      break;
    case 'cleric': {
      const b = DASH.bless;
      w.areas.push({ uid: uid(), team: 'hero', x: x0, y: y0, r: b.r, delay: 0, dur: b.dur, tick: b.tick, tickT: b.tick, dmg: 0, heal: b.heal * b.tick, kind: 'bless', from: h.uid, color: '#fff0a0', t: 0 });
      break;
    }
    case 'arcanist':
      blink(w, h, dx, dy, x0, y0);
      break;
    default:
      break;
  }
}

/** Every frame of a dash in the air (after the knight has moved): the bash's and the lunge's blows. */
export function tickDash(w: World, h: Unit, dt: number): void {
  const r = h.rolling;
  if (!r) return;
  if (r.kind === 'bash') {
    bash(w, h, r);
    // Dust kicked up behind the shield, every 0.05 s of the charge.
    const on = r.dur - r.t;
    if (Math.floor(on / 0.05) !== Math.floor((on - dt) / 0.05)) w.fx.push({ kind: 'dust', x: h.x - r.dx * 4, y: h.y });
  } else if (r.kind === 'lunge') lunge(w, h, r);
}

/** As the air part ends: the Ranger's Power Shot. */
export function endDash(w: World, h: Unit, r: NonNullable<Unit['rolling']>): void {
  if (h.cls !== 'ranger' || r.shot == null) return;
  const s = DASH.shot;
  const t = w.mobs.find((m) => m.uid === r.shot && !m.dead);
  const [ax, ay] = t && lineOfSight(w.map, h.x, h.y - 4, t.x, t.y - 4) ? aimAt(h, t) : norm(r.dx, r.dy);
  h.aimX = ax;
  h.aimY = ay;
  if (Math.abs(ax) > 0.15) h.dir = ax > 0 ? 1 : -1;
  const x = h.x + ax * 5;
  const y = h.y - HOLD_Y + ay * 5;
  w.shots.push({ uid: uid(), team: 'hero', x, y, vx: ax * s.speed, vy: ay * s.speed, r: 3, dmg: h.atk * s.dmg, life: 1.2, kind: 'arrow', color: '#ffd84a', from: h.uid, pierce: s.pierce });
  w.fx.push({ kind: 'spark', x, y, color: '#ffd84a', src: 'shot' });
  if (steered(w, h)) w.shakeIt(1.5, 0.1);
}

// ------------------------------------------------------------------ the guardian and the lancer

/** The Shield Bash: what the knight runs into is hit and shoved aside, off its line; shots are blocked. */
function bash(w: World, h: Unit, r: NonNullable<Unit['rolling']>): void {
  const b = DASH.bash;
  const struck = (r.struck ??= new Set());
  // The side away from the line, for each foe: left of the dash or right of it.
  const nx = -r.dy;
  const ny = r.dx;
  for (const m of w.mobs) {
    if (m.dead || struck.has(m.uid) || dist(m.x, m.y, h.x, h.y) > b.r + m.r) continue;
    struck.add(m.uid);
    const side = (m.x - h.x) * nx + (m.y - h.y) * ny >= 0 ? 1 : -1;
    const dealt = w.damage(m, h.atk * b.dmg, h, { kx: nx * side, ky: ny * side });
    w.fx.push({ kind: 'spark', x: m.x, y: m.y - BODY_Y, color: '#d8e0f0', src: 'bash' });
    if (dealt > 0 && !m.dead && !m.boss) {
      shove(m, nx * side, ny * side, b.knock);
      m.stunT = Math.max(m.stunT, b.stagger);
    }
    if (steered(w, h)) {
      hitStop(w, 0.05);
      w.shakeIt(2, 0.12);
    }
  }
  blockShots(w, h, b.r);
}

/** The Spear Lunge: every foe it goes through is hit and pushed on ahead of it. */
function lunge(w: World, h: Unit, r: NonNullable<Unit['rolling']>): void {
  const l = DASH.lunge;
  const struck = (r.struck ??= new Set());
  for (const m of w.mobs) {
    if (m.dead || struck.has(m.uid) || dist(m.x, m.y, h.x, h.y) > l.r + m.r) continue;
    struck.add(m.uid);
    const dealt = w.damage(m, h.atk * l.dmg, h, { kx: r.dx, ky: r.dy });
    w.fx.push({ kind: 'spark', x: m.x, y: m.y - BODY_Y, color: '#e4eaf2', src: 'lunge', dir: Math.atan2(r.dy, r.dx) });
    if (dealt > 0 && !m.dead) shove(m, r.dx, r.dy, l.nudge);
    if (steered(w, h)) hitStop(w, 0.04);
  }
}

// ------------------------------------------------------------------ the arcanist

/** The Blink: straight to where it's going (as far as the floor allows), an arcane burst where it left. */
function blink(w: World, h: Unit, dx: number, dy: number, x0: number, y0: number): void {
  const d = DASHES.arcanist.dist;
  w.fx.push({ kind: 'spark', x: h.x, y: h.y - 8, color: '#b08aff' });
  // In small steps, sliding along walls rather than through them.
  const steps = 16;
  for (let s = 0; s < steps; s++) moveUnit(w.map, h, (dx * d) / steps, (dy * d) / steps);
  w.fx.push({ kind: 'spark', x: h.x, y: h.y - 8, color: '#b08aff' });
  const b = DASH.blink;
  for (const e of w.enemiesIn('hero', x0, y0, b.r)) {
    const [kx, ky] = norm(e.x - x0, e.y - y0);
    const dealt = w.damage(e, h.atk * b.dmg, h, { kx, ky });
    if (dealt > 0 && !e.dead) shove(e, kx || 1, ky, 8);
  }
  w.fx.push({ kind: 'spark', x: x0, y: y0 - BODY_Y, color: '#b08aff', src: 'burst' });
}

// ------------------------------------------------------------------ the ranger's snares

/** A snare where the Ranger left (two at a time: a third takes the oldest's place). */
function laySnare(w: World, h: Unit, x: number, y: number): void {
  const s = DASH.snare;
  const mine = w.areas.filter((a) => a.kind === 'snare' && a.from === h.uid && !a.done).sort((a, b) => b.t - a.t);
  for (let i = 0; i <= mine.length - s.max; i++) {
    mine[i].done = true;
    mine[i].dur = 0;
  }
  w.areas.push({ uid: uid(), team: 'hero', x, y, r: s.r, delay: 0, dur: s.life, tick: 99, tickT: 99, dmg: 0, kind: 'snare', from: h.uid, color: '#c8a070', t: 0 });
}

/**
 * Every frame (World.update, through feel.ts's tickFeel): a snare the first foe steps into snaps shut
 * on it: rooted where it stands (a boss only slowed) and bitten.
 */
export function tickSnares(w: World): void {
  const s = DASH.snare;
  for (const a of w.areas) {
    if (a.kind !== 'snare' || a.done || a.dur <= 0) continue;
    const m = w.mobs.find((e) => !e.dead && dist(e.x, e.y, a.x, a.y) <= a.r + e.r * 0.6);
    if (!m) continue;
    a.done = true;
    a.dur = 0;
    if (m.boss) m.slowT = Math.max(m.slowT, s.slow);
    else {
      m.stunT = Math.max(m.stunT, s.root);
      if (!m.awake) w.wake(m);
    }
    const from = w.heroes.find((o) => o.uid === a.from);
    if (from) w.damage(m, from.atk * s.dmg, from, {});
    w.text(m.x, m.y - (m.boss ? 40 : 24), m.boss ? 'SLOWED!' : 'SNARED!', '#ffd08a');
    w.fx.push({ kind: 'spark', x: a.x, y: a.y, color: '#ffd08a', src: 'snare' });
  }
}
