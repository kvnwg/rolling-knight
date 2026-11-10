/**
 * Going through a portal (World.warp, World.arrive), drawn round the way down and the squad:
 *  - the swirl: the moment the leader touches the open portal, every knight in the squad (the fallen
 *    too) flashes in the portal's light and starts to turn on the spot (its facings stepped round,
 *    quicker and quicker). Each is pulled to the vortex's edge (a knight already in the doorway is
 *    there), then whirls round the eye and into it, shrinking a whole step at a time as it goes: three
 *    quarters, half, a quarter of its size (each a fresh nearest-neighbour copy of its frame), the
 *    portal's light eating into it from the outline at each step (a gold rim, then a ring deeper)
 *    until it's all light, then a spark, then a point of light gone into the eye with a twinkle. The
 *    nearest goes first;
 *  - sparkles streaming into the eye along four slowly turning spiral arms (quickening as they near
 *    it), more swept in from all round and in each knight's wake, and the eye bursting into a star as
 *    the swirl ends. (The archway's own flare, its stones all lit at once and
 *    the vortex turning faster, is drawn with the door: doorGlow, doorSpin, doorLight.)
 *  - the pop-out at the next floor's start: each knight bursts from a star where it stands, sparkles
 *    swirling off round it, and grows back a step at a time in a little hop, its turn unwinding until
 *    it faces the way it starts.
 * With reduce motion nothing travels or turns: the squad flashes white where it stands and is gone in
 * a twinkle (the screen flashes), and on the next floor it's simply there.
 *
 * Every position is a whole pixel and every change a step. The knights' bodies are lit like the rest
 * of the floor; the portal's light over them, the twinkles and the sparkles' heads are crisp on the
 * HUD layer, the sparkles and twinkles glowing under it. It reads the world and changes nothing there.
 */
import type { Unit } from '../world/entities';
import { ARRIVE_TIME, WARP_TIME, type World } from '../world/world';
import { toCanvas } from './art/draw';
import { DOOR_EYE } from './art/exitDoor';
import { KNIGHT_ANCHOR, knightFrame, knightLook } from './art/knights';
import { pfReady, SHEETS } from './pf/assets';
import { frameBuf, haloBuf, haloSpot, haloWidth } from './pf/frames';
import { viewDir } from './pf/heroAnim';
import { knightPaint, paintStep } from './pf/knightLook';
import { DIRS, type Dir } from './pf/sheet';
import { blank, blit, flipX, rgb, type PixelBuf } from './pixel/buf';

type Ctx = CanvasRenderingContext2D;
type Pos = (n: number) => number;

/** The portal's light (the vortex's ramp, exitDoor.ts): white-hot, warm white, pale gold, gold, amber. */
const WHITE = '#fffdf0';
const WARM = '#fff3bc';
const PALE = '#ffe484';
const GOLD = '#ffcc4c';
const AMBER = '#f6ae30';
/** The arch's dusk violet, lit: a few of the sparkles. */
const VIOLET = '#c8a8ff';
const VIOLET_DIM = '#8a6ac8';
/** A sparkle's streak behind it: the next color down its ramp. */
const TAIL: Record<string, string> = { [WHITE]: WARM, [WARM]: PALE, [PALE]: GOLD, [GOLD]: AMBER, [VIOLET]: VIOLET_DIM };

/** A knight's size at each step of its shrink; at each, the portal's light has eaten that many rings in from its outline (3: all of it). */
export const SHRINK = [1, 0.75, 0.5, 0.25] as const;

// The swirl's beats, in seconds into it (its whole length is WARP_TIME, world.ts).
/** The squad flashes in the portal's light as it's caught, this long. */
const CATCH = 0.04;
/** The vortex: a knight within this of the eye (px, about the doorway's half width) is in it, whirling. */
const CORE = 13;
/** A knight out in the open is pulled to the vortex's edge at about this speed (px/s), taking this long at most. */
const PULL_SPEED = 220;
const PULL_MAX = 0.18;
/** How far round a knight drifts as it's pulled in (radians, counter-clockwise like the vortex's arms). */
const DRIFT = 0.6;
/** Each knight (nearest first) starts its whirl at least this long after the one before, and whirls this long. */
const WHIRL_GAP = 0.05;
const WHIRL = 0.28;
/** Turns a knight makes round the eye as it whirls in. */
const WHIRL_TURNS = 1.6;
/** The eye bursts into a star over the swirl's last this-many seconds (and fades in the cut to black). */
const BURST = 0.1;
/** The sparkles' spiral arms: how many, how fast they turn (radians/s) and sparkles a second down each; and more a second swept in from anywhere round. */
const ARMS = 4;
const ARM_TURN = 0.8;
const ARM_RATE = 40;
const STRAY = 14;
// The pop-out's, in seconds into the next floor.
/** Each knight's star bursts at POP_FROM (each next one POP_GAP later) and shows this long; it grows back over POP_GROW. */
const POP_FROM = 0.1;
const POP_GAP = 0.05;
const POP_STAR = 0.05;
const POP_GROW = 0.24;
/** How high a knight hops as it pops out (px), and the quarter turns it unwinds as it grows. */
const POP_HOP = 5;
const POP_TURNS = 6;
/** The screen's flash as the portal takes the squad, with reduce motion (the shader's flash). */
const CALM_FLASH = 0.22;

/** A knight's way into the eye: where it starts from the eye (px, radians; the screen's y down), where it reaches the vortex, and when. */
export interface PullPlan {
  r0: number;
  a0: number;
  rIn: number;
  aIn: number;
  /** Seconds into the swirl: it starts toward the vortex, it's there (and starts to whirl), it's gone into the eye. */
  start: number;
  whirl: number;
  end: number;
}

/**
 * The squad's ways in, from where each knight's middle is (distance and angle from the eye), in the
 * same order: the nearest whirls first, the rest each WHIRL_GAP or more behind (closer, for a squad
 * too big for that) as their pull allows, and every one is in the eye before it bursts.
 */
export function planPulls(at: ReadonlyArray<{ r: number; a: number }>): PullPlan[] {
  const order = at.map((p, i) => ({ ...p, i })).sort((a, b) => a.r - b.r);
  const out: PullPlan[] = new Array(at.length);
  const last = WARP_TIME - BURST - WHIRL;
  const gap = Math.min(WHIRL_GAP, (last - CATCH) / Math.max(1, at.length - 1));
  order.forEach((p, rank) => {
    const rIn = Math.min(p.r, CORE);
    const aIn = p.r > CORE ? p.a - DRIFT : p.a;
    const whirl = Math.min(last, Math.max(CATCH + Math.min(PULL_MAX, (p.r - rIn) / PULL_SPEED), CATCH + rank * gap));
    out[p.i] = { r0: p.r, a0: p.a, rIn, aIn, start: CATCH, whirl, end: whirl + WHIRL };
  });
  return out;
}

/**
 * Where a knight is `t` seconds into the swirl, from the eye (px), and how far through its whirl it
 * is (0 until it reaches the vortex; 1, gone into the eye). Pulled in, it gathers speed; whirling, it
 * closes on the eye quicker and quicker, its turn quickening as it does.
 */
export function pullAt(k: PullPlan, t: number): { x: number; y: number; q: number } {
  let r = k.r0;
  let a = k.a0;
  let q = 0;
  if (t >= k.whirl) {
    q = Math.min(1, (t - k.whirl) / (k.end - k.whirl));
    r = k.rIn * (1 - q ** 1.5);
    a = k.aIn - Math.PI * 2 * WHIRL_TURNS * q ** 1.6;
  } else if (t > k.start) {
    const e = ((t - k.start) / Math.max(1e-6, k.whirl - k.start)) ** 2;
    r = k.r0 + (k.rIn - k.r0) * e;
    a = k.a0 + (k.aIn - k.a0) * e;
  }
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, q };
}

/** The step of its shrink a knight is at, `q` of the way through its whirl (4: a spark, 5: a point of light, 6: gone in). */
export function shrinkStep(q: number): number {
  return q < 0.15 ? 0 : q < 0.35 ? 1 : q < 0.55 ? 2 : q < 0.72 ? 3 : q < 0.86 ? 4 : q < 1 ? 5 : 6;
}

/** Quarter turns a knight has spun `t` seconds into the swirl: slowly at first, quicker and quicker. */
function quarterTurns(t: number): number {
  return 7 * t + 40 * t * t;
}

/**
 * A sprite's solid pixels (its soft ground shadow left out), cut to their box and scaled to `scale`
 * of its size by nearest neighbour: every pixel of the copy is one of the sprite's, so it stays as
 * crisp as the frame. (cx, cy): the middle of the box in the sprite, to put the copy where it stood.
 */
export function shrinkBuf(src: PixelBuf, scale: number): { buf: PixelBuf; cx: number; cy: number } {
  let x0 = src.w;
  let y0 = src.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (src.px[(y * src.w + x) * 4 + 3] !== 255) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return { buf: blank(1, 1), cx: src.w / 2, cy: src.h / 2 };
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const w = Math.max(1, Math.round(bw * scale));
  const h = Math.max(1, Math.round(bh * scale));
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    const sy = y0 + Math.min(bh - 1, Math.floor(((y + 0.5) * bh) / h));
    for (let x = 0; x < w; x++) {
      const sx = x0 + Math.min(bw - 1, Math.floor(((x + 0.5) * bw) / w));
      const i = (sy * src.w + sx) * 4;
      if (src.px[i + 3] !== 255) continue;
      out.px.set(src.px.subarray(i, i + 4), (y * w + x) * 4);
    }
  }
  return { buf: out, cx: x0 + bw / 2, cy: y0 + bh / 2 };
}

/**
 * The portal's light eating into a sprite `depth` rings in from its outline (the pixels next to its
 * outside, then the ones next to those): one ring is a gold rim; two, a pale rim with gold inside it;
 * three or more, all of it, white-hot within a gold edge (its shape reads at any size).
 */
export function lightBuf(src: PixelBuf, depth: number): PixelBuf {
  const out = blank(src.w, src.h);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < src.w && y < src.h && src.px[(y * src.w + x) * 4 + 3] === 255;
  // Each solid pixel's ring: 1 on the outline, 2 next to it, 3 next to that (in four directions).
  const ring = new Uint8Array(src.w * src.h);
  const isRing = (x: number, y: number, k: number) => x >= 0 && y >= 0 && x < src.w && y < src.h && ring[y * src.w + x] === k;
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (solid(x, y) && (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1))) ring[y * src.w + x] = 1;
    }
  }
  for (let k = 2; k <= 3; k++) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = y * src.w + x;
        if (ring[i] || !solid(x, y)) continue;
        if (isRing(x - 1, y, k - 1) || isRing(x + 1, y, k - 1) || isRing(x, y - 1, k - 1) || isRing(x, y + 1, k - 1)) ring[i] = k;
      }
    }
  }
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (!solid(x, y)) continue;
      const k = ring[y * src.w + x] || 4;
      const c = depth >= 3 ? (k === 1 ? GOLD : WHITE) : depth === 2 ? (k === 1 ? PALE : k === 2 ? GOLD : null) : depth === 1 && k === 1 ? GOLD : null;
      if (!c) continue;
      const [r, g, b] = rgb(c);
      out.px.set([r, g, b, 255], (y * src.w + x) * 4);
    }
  }
  return out;
}

/**
 * A twinkle `r` px out from its middle: a white-hot heart, arms of light down the axes going warm,
 * pale and gold to their tips, and from r = 3 short diagonal sparks between them.
 */
export function starBuf(r: number): PixelBuf {
  const n = r * 2 + 1;
  const out = blank(n, n);
  const put = (x: number, y: number, hex: string) => {
    const [cr, cg, cb] = rgb(hex);
    out.px.set([cr, cg, cb, 255], ((r + y) * n + r + x) * 4);
  };
  put(0, 0, WHITE);
  for (let i = 1; i <= r; i++) {
    const c = i === r && r > 1 ? GOLD : i <= Math.ceil(r / 3) ? WHITE : i <= Math.ceil((r * 2) / 3) ? WARM : PALE;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) put(dx * i, dy * i, c);
  }
  const diag = r >= 3 ? Math.floor(r / 3) : 0;
  for (let j = 1; j <= diag; j++) {
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) put(dx * j, dy * j, j === diag ? GOLD : PALE);
  }
  return out;
}

/** A knight's frame as the portal turns it: a key naming it (its shrunk copies are kept under it), its pivot (the feet), and its pixels, made only when a copy isn't kept yet. */
interface Body {
  key: string;
  px: number;
  py: number;
  make: () => PixelBuf;
}

/** One step of a knight's shrink: its body, the portal's light eaten 0 to 3 rings into it (light[3]: its whole silhouette), their size, and where the body's middle was in the frame. */
interface Sprite {
  body: HTMLCanvasElement;
  light: HTMLCanvasElement[];
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/** A knight being taken: its way in, the facing it was caught in (in DIRS), and whether it's gone into the eye yet. */
interface Pull {
  plan: PullPlan;
  face: number;
  gone: boolean;
}

/** A knight popping out at a floor's start: when (s), the facing it ends on, which way its sparkles fly off, whether its star has burst. */
interface Pop {
  from: number;
  face: number;
  a: number;
  burst: boolean;
}

/**
 * A sparkle: polar about (x, y) (world px), its turn (radians/s, counter-clockwise; quicker close
 * in, like a whirlpool's) and its speed out (px/s, negative in), gaining `acc` a second. A big one
 * is a little cross.
 */
interface Mote {
  x: number;
  y: number;
  r: number;
  a: number;
  w: number;
  v: number;
  acc: number;
  life: number;
  color: string;
  big: boolean;
  /** Where it was last frame (world px): its streak runs back toward it. */
  lx: number;
  ly: number;
}

export class WarpFx {
  private world: World | null = null;
  private warp: World['warp'] = null;
  private arrive: World['arrive'] = null;
  private pulls = new Map<number, Pull>();
  private pops = new Map<number, Pop>();
  private motes: Mote[] = [];
  /** Twinkles in the eye as each knight goes in: the swirl's time at each. */
  private twinkles: number[] = [];
  private sprites = new Map<string, Sprite>();
  private stars = new Map<number, HTMLCanvasElement>();
  private streamT = 0;
  private armT = 0;
  private made = 0;
  private time = 0;
  private frameN = 0;

  /**
   * Reads this frame's world: a warp or a pop-out starting, sparkles spawned and moved. `dt` is the
   * frame's (0 while paused), `time` the renderer's clock; `face` says which way a knight is drawn
   * facing (its pose). Returns a flash for the screen to start now (reduce motion's), else 0.
   */
  update(w: World, dt: number, time: number, face: (h: Unit) => Dir | undefined): number {
    this.time = time;
    if (dt > 0) this.frameN++;
    if (w !== this.world) {
      this.world = w;
      this.warp = null;
      this.arrive = null;
      this.pulls.clear();
      this.pops.clear();
      this.motes = [];
      this.twinkles = [];
    }
    let flash = 0;
    if (w.warp && w.warp !== this.warp) {
      this.warp = w.warp;
      this.startPulls(w, face);
      if (w.calm) flash = CALM_FLASH;
      else this.ring(w);
    }
    if (w.arrive && w.arrive !== this.arrive) {
      this.arrive = w.arrive;
      this.startPops(w);
    }
    if (w.warp && !w.calm) this.stream(w, dt);
    if (w.arrive) this.popBursts(w);
    for (const m of this.motes) {
      m.v += m.acc * dt;
      m.r = Math.max(0, m.r + m.v * dt);
      m.a -= m.w * dt * Math.min(4, 24 / Math.max(6, m.r));
      m.life -= dt;
    }
    this.motes = this.motes.filter((m) => m.life > 0 && m.r > 1);
    return flash;
  }

  /** Whether knight `h` is the portal's to draw this frame (the renderer leaves it out of its own pass). */
  draws(w: World, h: Unit): boolean {
    if (w.warp) return true;
    if (!w.arrive) return false;
    const pop = this.pops.get(h.uid);
    return !!pop && w.arrive.t < pop.from + POP_STAR + POP_GROW;
  }

  /** The archway's inner ring while the squad goes through: all its stones flaring as the portal takes it and as the eye bursts, lit between. */
  doorGlow(w: World): 'lit' | 'flare' | null {
    const wp = w.warp;
    if (!wp) return null;
    if (w.calm) return wp.t < wp.dur * 0.5 ? 'flare' : 'lit';
    return wp.t < CATCH * 2 || wp.t >= wp.dur - BURST ? 'flare' : 'lit';
  }

  /** How fast the vortex turns, times its own pace: quicker while it pulls the squad in. */
  doorSpin(w: World): number {
    return w.warp && !w.calm ? 2.6 : 1;
  }

  /** The portal's light, times its own: brighter while the squad goes through, brightest as it flares. */
  doorLight(w: World): number {
    const g = this.doorGlow(w);
    return g === 'flare' ? 1.6 : g === 'lit' ? 1.3 : 1;
  }

  /** The eye of the vortex (world px). */
  eye(w: World): { x: number; y: number } {
    return { x: w.map.exit.x, y: w.map.exit.y + 8 + DOOR_EYE };
  }

  /**
   * Draws the warp: the sparkles, then each knight it has (its body on the standing layer, its light
   * held on the cap layer, the vortex's glow cut away behind it, the portal's light over it on the HUD
   * layer), then the twinkles and the eye's burst.
   */
  draw(st: Ctx, em: Ctx, cap: Ctx, ui: Ctx, w: World, sx: Pos, sy: Pos): void {
    this.drawMotes(em, ui, sx, sy);
    if (w.warp) {
      for (const h of w.heroes) this.drawPull(st, em, cap, ui, w, h, sx, sy);
      this.drawEye(em, ui, w, sx, sy);
    } else if (w.arrive) {
      for (const h of w.heroes) this.drawPop(st, em, cap, ui, w, h, sx, sy);
    }
  }

  // ------------------------------------------------------------------ the swirl

  private startPulls(w: World, face: (h: Unit) => Dir | undefined): void {
    const e = this.eye(w);
    this.pulls.clear();
    this.twinkles = [];
    const knights = w.heroes.map((h) => {
      const dir = face(h) ?? viewDir(h.view, h.dir);
      const c = this.middle(h, dir);
      return { h, r: Math.hypot(c.x - e.x, c.y - e.y), a: Math.atan2(c.y - e.y, c.x - e.x), face: Math.max(0, DIRS.indexOf(dir.length > 1 ? (dir.includes('e') ? 'e' : 'w') : dir)) };
    });
    const plans = planPulls(knights);
    knights.forEach((k, i) => this.pulls.set(k.h.uid, { plan: plans[i], face: k.face, gone: false }));
  }

  /** A ring of sparkles round the arch as the portal takes the squad, all of them pulled in. */
  private ring(w: World): void {
    const e = this.eye(w);
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.15;
      this.mote(e.x, e.y, 26 + (i % 3) * 7 + Math.random() * 4, a, 3, -(30 + Math.random() * 20), -380, 1, i % 7 === 3 ? VIOLET : [WARM, PALE, GOLD, WHITE][i % 4], i % 5 === 0);
    }
  }

  /**
   * Sparkles streaming into the eye: down the spiral arms (each born at its arm's root and whirled in
   * along the same path as the ones before it, so they string out along the arm), swept in from
   * anywhere round, and left in each knight's wake.
   */
  private stream(w: World, dt: number): void {
    const wp = w.warp!;
    const e = this.eye(w);
    if (wp.t < wp.dur - BURST - 0.05) {
      this.armT += dt * ARM_RATE;
      for (; this.armT >= 1; this.armT--) {
        for (let k = 0; k < ARMS; k++) {
          const n = this.made;
          this.mote(e.x, e.y, 42 + Math.random() * 3, (k * Math.PI * 2) / ARMS + ARM_TURN * wp.t, 2.6, -40, -420, 1, n % 9 === 4 ? VIOLET : [WHITE, WARM, PALE, WARM, GOLD][n % 5], n % 4 === 0);
        }
      }
      this.streamT += dt * STRAY;
      for (; this.streamT >= 1; this.streamT--) {
        const c = Math.random();
        this.mote(e.x, e.y, 28 + Math.random() * 22, Math.random() * Math.PI * 2, 2.6, -(30 + Math.random() * 20), -380, 1, c < 0.18 ? VIOLET : c < 0.5 ? WARM : c < 0.8 ? PALE : GOLD);
      }
    }
    if (dt <= 0 || this.frameN % 2) return;
    // Every other frame, a sparkle left where each knight is, pulled in after it.
    for (const p of this.pulls.values()) {
      const at = pullAt(p.plan, wp.t);
      if (wp.t < p.plan.start || at.q > 0.7) continue;
      this.mote(e.x, e.y, Math.hypot(at.x, at.y), Math.atan2(at.y, at.x), 3, -20, -320, 0.6, this.frameN % 4 ? WARM : PALE);
    }
  }

  private mote(x: number, y: number, r: number, a: number, w: number, v: number, acc: number, life: number, color: string, big = false): void {
    this.made++;
    this.motes.push({ x, y, r, a, w, v, acc, life, color, big, lx: x + Math.cos(a) * r, ly: y + Math.sin(a) * r });
    if (this.motes.length > 500) this.motes.shift();
  }

  private drawPull(st: Ctx, em: Ctx, cap: Ctx, ui: Ctx, w: World, h: Unit, sx: Pos, sy: Pos): void {
    const p = this.pulls.get(h.uid);
    if (!p) return;
    const wp = w.warp!;
    const t = wp.t;
    const e = this.eye(w);
    if (w.calm) {
      // Reduce motion: a white flash where it stands, then gone in a twinkle.
      const u = t / wp.dur;
      const at = { x: e.x + Math.cos(p.plan.a0) * p.plan.r0, y: e.y + Math.sin(p.plan.a0) * p.plan.r0 };
      if (u < 0.4) this.drawKnight(st, em, cap, ui, h, DIRS[p.face], 0, 3, u < 0.2 ? 1 : 0.5, at.x, at.y, sx, sy);
      else if (u < 0.7) this.drawStar(em, ui, u < 0.55 ? 2 : 1, at.x, at.y, sx, sy);
      return;
    }
    const at = pullAt(p.plan, t);
    const step = shrinkStep(at.q);
    if (step >= 6) {
      if (!p.gone) {
        p.gone = true;
        this.twinkles.push(t);
      }
      return;
    }
    const x = e.x + at.x;
    const y = e.y + at.y;
    if (step >= 4) {
      // A spark, then a point of light, whirling into the eye.
      if (step === 4) this.drawStar(em, ui, 1, x, y, sx, sy);
      else {
        em.fillStyle = WHITE;
        em.fillRect(sx(x), sy(y), 1, 1);
        ui.fillStyle = WHITE;
        ui.fillRect(sx(x), sy(y), 1, 1);
      }
      return;
    }
    const dir = DIRS[(p.face + Math.floor(quarterTurns(t))) % 4];
    // Caught: a flash of the portal's light all over it first; then the light eats in a ring a step.
    if (t < CATCH) this.drawKnight(st, em, cap, ui, h, dir, step, 3, 0.75, x, y, sx, sy);
    else this.drawKnight(st, em, cap, ui, h, dir, step, step, 1, x, y, sx, sy);
  }

  /** The twinkle as each knight goes into the eye, and the eye bursting into a star as the swirl ends (shrinking back in the cut to black). */
  private drawEye(em: Ctx, ui: Ctx, w: World, sx: Pos, sy: Pos): void {
    const e = this.eye(w);
    const wp = w.warp!;
    for (const at of this.twinkles) {
      const k = wp.t - at;
      if (k < 0.1) this.drawStar(em, ui, k < 0.05 ? 3 : 2, e.x, e.y, sx, sy);
    }
    if (w.calm) return;
    const k = wp.t - (wp.dur - BURST);
    if (k < 0) return;
    const r = k < 0.02 ? 3 : k < 0.04 ? 6 : k < 0.07 ? 9 : k < 0.1 ? 11 : k < 0.14 ? 8 : k < 0.18 ? 5 : k < 0.22 ? 2 : 0;
    if (r) this.drawStar(em, ui, r, e.x, e.y, sx, sy);
  }

  // ------------------------------------------------------------------ the pop-out

  private startPops(w: World): void {
    this.pops.clear();
    // (Closer together for a squad too big to pop out POP_GAP apart before the arrival's over.)
    const gap = Math.min(POP_GAP, (ARRIVE_TIME - POP_FROM - POP_STAR - POP_GROW) / Math.max(1, w.heroes.length - 1));
    [...w.heroes]
      .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
      .forEach((h, i) => {
        const dir = viewDir(h.view, h.dir);
        this.pops.set(h.uid, { from: POP_FROM + i * gap, face: Math.max(0, DIRS.indexOf(dir)), a: i * 2.1 + 0.4, burst: false });
      });
  }

  /** Each knight's star bursting: sparkles flung out round it, swirling off the way it unwinds. */
  private popBursts(w: World): void {
    const t = w.arrive!.t;
    for (const h of w.heroes) {
      const pop = this.pops.get(h.uid);
      if (!pop || pop.burst || t < pop.from) continue;
      pop.burst = true;
      const c = this.middle(h, viewDir(h.view, h.dir));
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = pop.a + (i / n) * Math.PI * 2;
        this.mote(c.x, c.y, 2, a, -(2 + Math.random()), 80 + Math.random() * 40, -300, 0.24, i % 6 === 2 ? VIOLET : [WHITE, WARM, PALE, GOLD][i % 4], i % 4 === 0);
      }
    }
  }

  private drawPop(st: Ctx, em: Ctx, cap: Ctx, ui: Ctx, w: World, h: Unit, sx: Pos, sy: Pos): void {
    const pop = this.pops.get(h.uid);
    if (!pop) return;
    const k = w.arrive!.t - pop.from;
    if (k < 0 || k >= POP_STAR + POP_GROW) return;
    const c = this.middle(h, viewDir(h.view, h.dir));
    if (k < POP_STAR) this.drawStar(em, ui, k < POP_STAR / 2 ? 2 : 4, c.x, c.y, sx, sy);
    const q = Math.min(1, (k - POP_STAR * 0.6) / POP_GROW);
    if (q < 0) return;
    // Growing back a step at a time (a quarter, half, three quarters, whole), the portal's light
    // leaving it a ring at a time as it does (its gold rim last); hopping out and landing; its turn
    // unwinding onto the way it faces.
    const step = q < 0.25 ? 3 : q < 0.5 ? 2 : q < 0.75 ? 1 : 0;
    const light = step > 0 ? step : q < 0.88 ? 1 : 0;
    const left = Math.round(POP_TURNS * (1 - q) * (1 - q));
    const dir = DIRS[(pop.face + left) % 4];
    const hop = Math.round(POP_HOP * 4 * q * (1 - q));
    this.drawKnight(st, em, cap, ui, h, dir, step, light, 1, c.x, c.y - hop, sx, sy);
  }

  /** Where knight `h`'s middle is, standing where it is facing `dir` (its frame's box, from its feet). */
  private middle(h: Unit, dir: Dir): { x: number; y: number } {
    const body = this.body(h, dir);
    if (!body) return { x: h.x, y: h.y - 10 };
    const s = this.sprite(body, 0);
    return { x: h.x - body.px + s.cx, y: h.y - body.py + s.cy };
  }

  // ------------------------------------------------------------------ drawing

  /**
   * The sparkles: each a crisp head on the HUD layer (a big one a little cross), glowing, with a
   * streak back along its way (a pixel for every pixel it moved, up to four).
   */
  private drawMotes(em: Ctx, ui: Ctx, sx: Pos, sy: Pos): void {
    for (const m of this.motes) {
      const wx = m.x + Math.cos(m.a) * m.r;
      const wy = m.y + Math.sin(m.a) * m.r;
      const x = sx(wx);
      const y = sy(wy);
      const dx = sx(m.lx) - x;
      const dy = sy(m.ly) - y;
      const n = Math.max(Math.abs(dx), Math.abs(dy));
      const tail = TAIL[m.color] ?? m.color;
      em.fillStyle = tail;
      for (let i = 1; i <= Math.min(4, n); i++) em.fillRect(x + Math.round((dx * i) / n), y + Math.round((dy * i) / n), 1, 1);
      if (m.big) {
        for (const c of [em, ui]) {
          c.fillStyle = tail;
          c.fillRect(x - 1, y, 3, 1);
          c.fillRect(x, y - 1, 1, 3);
        }
      }
      em.fillStyle = m.color;
      em.fillRect(x, y, 1, 1);
      ui.fillStyle = m.color;
      ui.fillRect(x, y, 1, 1);
      m.lx = wx;
      m.ly = wy;
    }
  }

  /**
   * A knight at shrink step `step`, its middle at (x, y) (world px), facing `dir`, the portal's light
   * eaten `light` rings into it (0 none; 3 all of it, its gold-edged silhouette) at `alpha`.
   */
  private drawKnight(st: Ctx, em: Ctx, cap: Ctx, ui: Ctx, h: Unit, dir: Dir, step: number, light: number, alpha: number, x: number, y: number, sx: Pos, sy: Pos): void {
    const body = this.body(h, dir);
    if (!body) return;
    const s = this.sprite(body, step);
    const dx = sx(x - s.w / 2);
    const dy = sy(y - s.h / 2);
    st.drawImage(s.body, dx, dy);
    cap.drawImage(s.light[3], dx, dy);
    // In front of the vortex: its glow doesn't show through the knight.
    em.globalCompositeOperation = 'destination-out';
    em.drawImage(s.light[3], dx, dy);
    em.globalCompositeOperation = 'source-over';
    if (light > 0) {
      ui.globalAlpha = alpha;
      ui.drawImage(s.light[Math.min(3, light)], dx, dy);
      ui.globalAlpha = 1;
    }
  }

  /** A twinkle of radius `r` with its middle on the pixel at (x, y): crisp on the HUD layer, glowing under it. */
  private drawStar(em: Ctx, ui: Ctx, r: number, x: number, y: number, sx: Pos, sy: Pos): void {
    let c = this.stars.get(r);
    if (!c) {
      c = toCanvas(starBuf(r));
      this.stars.set(r, c);
    }
    const dx = sx(x) - r;
    const dy = sy(y) - r;
    em.globalAlpha = 0.6;
    em.drawImage(c, dx, dy);
    em.globalAlpha = 1;
    ui.drawImage(c, dx, dy);
  }

  /**
   * The frame knight `h` shows facing `dir` as the portal turns it: standing (its idle's first frame,
   * a Celestial's halo baked in so it goes too), or a fallen knight lying as it fell.
   */
  private body(h: Unit, dir: Dir): Body | null {
    if (!h.knightId) return null;
    const anim = h.downed ? 'death' : 'idle';
    if (pfReady()) {
      const paint = knightPaint(h.knightId, h.mutation ?? null, paintStep(h.rarity!, this.time));
      const sheet = SHEETS[paint.sheet];
      const clip = sheet.clip(anim, dir);
      const k = (h.downed ? clip[clip.length - 1] : clip[0])[0];
      const [px, py] = sheet.meta.pivot;
      const halo = !h.downed ? paint.halo : null;
      const make = () => {
        const f = frameBuf(paint.sheet, k, paint, false, anim, dir);
        if (!halo) return f;
        // (On a copy: the frame is shared.)
        const b: PixelBuf = { w: f.w, h: f.h, px: new Uint8ClampedArray(f.px) };
        const [hx, hy] = haloSpot(paint.sheet, k);
        blit(b, haloBuf(halo, haloWidth(paint.sheet)), hx, hy);
        return b;
      };
      return { key: `${paint.sheet}|${k}|${paint.key}|${anim}|${dir}`, px, py, make };
    }
    // The game's own knights (when PixelForge's sheets aren't loaded): the side view faces east, flipped for west.
    const view = dir === 's' ? 'down' : dir === 'n' ? 'up' : 'side';
    const flip = dir === 'w';
    const f = knightFrame(knightLook(h.knightId, h.mutation ?? null, 0), anim, view, h.downed ? 2 : 0);
    return { key: `k|${h.knightId}|${h.mutation ?? ''}|${anim}|${view}|${flip ? 1 : 0}`, px: flip ? f.buf.w - 1 - KNIGHT_ANCHOR.x : KNIGHT_ANCHOR.x, py: KNIGHT_ANCHOR.y, make: () => (flip ? flipX(f.buf) : f.buf) };
  }

  private sprite(body: Body, step: number): Sprite {
    const key = `${body.key}|${step}`;
    let s = this.sprites.get(key);
    if (!s) {
      const { buf, cx, cy } = shrinkBuf(body.make(), SHRINK[step]);
      s = { body: toCanvas(buf), light: [0, 1, 2, 3].map((d) => toCanvas(lightBuf(buf, d))), w: buf.w, h: buf.h, cx, cy };
      this.sprites.set(key, s);
      if (this.sprites.size > 600) this.sprites.delete(this.sprites.keys().next().value!);
    }
    return s;
  }
}
