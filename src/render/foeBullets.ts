/**
 * The foes' bullets at play: picks each one's frame from where it is along its own path
 * (world/bullets.ts) and draws it, plus what it shows on the ground: a lobbed glob's shadow under it
 * (the renderer adds the ring where it lands), a mine's shadow, and the line an archer's dart or an
 * elite's beam will fly down, shown through its wind-up.
 *
 * Every frame is drawn once (art/bullets.ts) and kept as a canvas under a number (kind, look, way,
 * frame): a bullet costs one drawImage, and nothing is allocated per shot per frame. Animation is
 * stepped off each bullet's own clock, so two of a kind side by side don't flicker in step.
 */
import { aimHolds, density } from '../world/ai';
import { MINE_FUSE, SEED_PULSE, SPIT_DRIFT, type Bullet } from '../world/bullets';
import type { Shot, Unit } from '../world/entities';
import { TILE, tileAt } from '../world/mapgen';
import type { World } from '../world/world';
import { MARK_STEPS, bladeSprite, dartSprite, globSprite, markSprite, mineSprite, orbSprite, pelletSprite, pipSprite, seedSprite, sparkSprite, spitSprite, sporeSprite, waveSprite, wispSprite } from './art/bullets';
import { toCanvas } from './art/draw';
import { SHOT_DIRS, dirIndex } from './vfx/art';
import type { VfxSprite } from './vfx/raster';

type Ctx = CanvasRenderingContext2D;

interface Pair {
  img: HTMLCanvasElement | null;
  ax: number;
  ay: number;
}

const K_ORB = 0;
const K_DART = 1;
const K_SPIT = 2;
const K_SPORE = 3;
const K_SEED = 4;
const K_PIP = 5;
const K_GLOB = 6;
const K_MINE = 7;
const K_BLADE = 8;
const K_PELLET = 9;
const K_WISP = 10;
const K_WAVE = 11;
const K_SPARK = 12;
const K_MARK = 13;

/** A frame's key: kind, a look or variant (under 8), its way (under 16) and its frame (under 8). */
const key = (kind: number, variant: number, dir: number, frame: number) => kind + 16 * (variant + 8 * (dir + 16 * frame));

/** How far out an aim line is drawn (px): about as far as a dart flies in a second. */
const AIM_LEN = 120;

/** The dark under a lobbed shot. */
const SHADOW = '#0c0812';

export class FoeBullets {
  private cache = new Map<number, Pair>();

  private put(ctx: Ctx, k: number, x: number, y: number, s: VfxSprite | null): void {
    let p = this.cache.get(k);
    if (!p) {
      p = { img: s && s.buf ? toCanvas(s.buf) : null, ax: s ? s.ax : 0, ay: s ? s.ay : 0 };
      this.cache.set(k, p);
    }
    if (p.img) ctx.drawImage(p.img, x - p.ax, y - p.ay);
  }

  /** Is this frame drawn already? (So the art is only asked for once.) */
  private has(k: number): boolean {
    return this.cache.has(k);
  }

  /** One of the foes' bullets at (x, y) on the screen. `boss`: thrown by the floor's boss (its orbs and waves are bigger). */
  draw(ctx: Ctx, s: Shot, x: number, y: number, time: number, boss: boolean): void {
    const b = s.b;
    if (!b) {
      // The plain slow orb: red, or pink when it curves.
      const dir = dirIndex(s.vx, s.vy, SHOT_DIRS);
      const f = Math.floor(time * 12 + (s.uid % 4)) % 4;
      const pink = !!s.curve;
      const k = key(K_ORB, (pink ? 1 : 0) + (boss ? 2 : 0), dir, f);
      this.put(ctx, k, x, y, this.has(k) ? null : orbSprite(pink ? 'pink' : 'red', dir, f, boss));
      return;
    }
    // Nearly spent, it flickers out (never half transparent).
    if (s.life < 0.3 && b.form !== 'glob' && b.form !== 'mine' && b.form !== 'seed' && Math.floor(s.life * 24) % 2) return;
    switch (b.form) {
      case 'dart': {
        const dir = dirIndex(s.vx, s.vy, SHOT_DIRS);
        const f = Math.floor(b.t * 14) % 2;
        const k = key(K_DART, 0, dir, f);
        return this.put(ctx, k, x, y, this.has(k) ? null : dartSprite(dir, f));
      }
      case 'spit': {
        const fast = Math.hypot(s.vx, s.vy) > b.base * (SPIT_DRIFT + 0.5);
        const dir = fast ? dirIndex(s.vx, s.vy, SHOT_DIRS) : 0;
        const f = Math.floor(b.t * (fast ? 14 : 5)) % 2;
        const k = key(K_SPIT, fast ? 1 : 0, dir, f);
        return this.put(ctx, k, x, y, this.has(k) ? null : spitSprite(dir, f, fast));
      }
      case 'spore': {
        const f = Math.floor(b.t * 8) % 4;
        const k = key(K_SPORE, 0, 0, f);
        return this.put(ctx, k, x, y, this.has(k) ? null : sporeSprite(f));
      }
      case 'seed': {
        // Rocking as it flies; swollen and flashing through its last moments (the tell: it's about to burst).
        const f = b.T - b.t < SEED_PULSE ? 2 + (Math.floor(b.t * 18) % 2) : Math.floor(b.t * 6) % 2;
        const k = key(K_SEED, 0, 0, f);
        return this.put(ctx, k, x, y, this.has(k) ? null : seedSprite(f));
      }
      case 'pip': {
        const f = Math.floor(b.t * 14) % 2;
        const k = key(K_PIP, 0, 0, f);
        return this.put(ctx, k, x, y, this.has(k) ? null : pipSprite(f));
      }
      case 'pellet': {
        const f = Math.floor(b.t * 14) % 2;
        const k = key(K_PELLET, 0, 0, f);
        return this.put(ctx, k, x, y, this.has(k) ? null : pelletSprite(f));
      }
      case 'spark': {
        const f = Math.floor(b.t * 16) % 2;
        const k = key(K_SPARK, 0, 0, f);
        return this.put(ctx, k, x, y, this.has(k) ? null : sparkSprite(f));
      }
      case 'glob': {
        const p = b.t / b.T;
        const f = p < 0.38 ? 0 : p < 0.66 ? 1 : 2;
        const k = key(K_GLOB, 0, 0, f);
        return this.put(ctx, k, x, y - Math.round(b.z), this.has(k) ? null : globSprite(f));
      }
      case 'mine': {
        const f = mineFrame(b);
        const k = key(K_MINE, 0, 0, f);
        // (On the ground it sits on its spot: drawn a little up from it.)
        return this.put(ctx, k, x, y - Math.round(b.z) - 3, this.has(k) ? null : mineSprite(f));
      }
      case 'blade': {
        const f = Math.floor(b.t * 16) % 8;
        const side = b.side < 0 ? -1 : 1;
        const k = key(K_BLADE, b.look + (side < 0 ? 4 : 0), 0, f);
        return this.put(ctx, k, x, y, this.has(k) ? null : bladeSprite(b.look, f, side));
      }
      case 'wisp': {
        const dir = dirIndex(s.vx, s.vy, 8);
        const f = Math.floor(b.t * 9) % 3;
        const k = key(K_WISP, b.eye ? 1 : 0, dir, f);
        return this.put(ctx, k, x, y, this.has(k) ? null : wispSprite(dir, f, !!b.eye));
      }
      case 'wave': {
        const dir = dirIndex(s.vx, s.vy, SHOT_DIRS);
        const f = Math.floor(b.t * 10) % 2;
        const k = key(K_WAVE, boss ? 1 : 0, dir, f);
        // (It rolls along the ground: drawn down at the feet it hits.)
        return this.put(ctx, k, x, y + 4, this.has(k) ? null : waveSprite(dir, f, boss));
      }
      default: {
        const missing: never = b.form;
        void missing;
      }
    }
  }

  /**
   * What the foes' bullets show on the ground (under everyone): the ring where each lobbed glob will
   * come down, from the moment it's thrown (filling as it falls, flashing white through its last
   * third), and the shadow under a glob or a tossed mine, small while it's high and growing as it
   * comes down. (cx, cy: the view's top-left.)
   */
  drawGround(ctx: Ctx, w: World, cx: number, cy: number, W: number, H: number, time: number): void {
    for (const s of w.shots) {
      const b = s.b;
      if (!b || (b.form !== 'glob' && b.form !== 'mine')) continue;
      const x = Math.round(s.x) - cx;
      const y = Math.round(s.y) - cy;
      if (b.form === 'glob') {
        const mx = Math.round(b.tx) - cx;
        const my = Math.round(b.ty) - cy;
        if (mx > -30 && my > -30 && mx < W + 30 && my < H + 30) {
          const p = Math.min(1, b.t / Math.max(0.01, b.T));
          const r = Math.max(4, Math.min(15, Math.round(b.ring)));
          const fill = Math.min(MARK_STEPS, 1 + Math.floor(p * MARK_STEPS));
          const hot = p > 0.66 ? Math.floor(time * 14) % 2 === 0 : Math.floor(time * 5) % 4 === 0;
          const k = key(K_MARK, hot ? 1 : 0, r, fill);
          this.put(ctx, k, mx, my, this.has(k) ? null : markSprite(r, fill, hot));
        }
      }
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const rx = b.form === 'mine' ? (b.z > 4 ? 2 : 3) : b.z > 14 ? 2 : b.z > 6 ? 3 : 4;
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = SHADOW;
      ctx.fillRect(x - rx, y, rx * 2 + 1, 1);
      ctx.fillRect(x - rx + 1, y - 1, rx * 2 - 1, 1);
      ctx.fillRect(x - rx + 1, y + 1, rx * 2 - 1, 1);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * A gun that holds its aim (an archer's dart, an elite's beam), winding up: the line each bullet
   * will fly down, from the foe to the first wall. Dashes march along it toward you; it follows you,
   * red, for the first half of the wind-up, then holds and turns white: that's the moment to step off it.
   */
  drawAim(ctx: Ctx, w: World, m: Unit, sx: (x: number) => number, sy: (y: number) => number, time: number): void {
    if (!aimHolds(m) || !m.windT || m.windT <= 0 || m.moveX === undefined || m.moveY === undefined) return;
    const locked = m.windT <= (m.windDur ?? 0) * 0.5;
    const oy = m.y - 6 * (m.type?.size ?? 1);
    const aim = Math.atan2(m.moveY - 6 - oy, m.moveX - m.x);
    const n = m.gunKind === 'fan' ? Math.min(5, 3 + density(w, m)) : 1;
    const march = Math.floor(time * 30);
    for (let i = 0; i < n; i++) {
      const a = aim + (i - (n - 1) / 2) * 0.24;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      for (let d = 8; d < AIM_LEN; d++) {
        const px = m.x + ux * d;
        const py = oy + uy * d;
        if (tileAt(w.map, Math.floor(px / TILE), Math.floor((py + 6) / TILE)) === 0) break;
        if ((((d - march) % 6) + 6) % 6 >= 3) continue;
        const x = sx(px);
        // (Drawn on the ground under the line the bullet takes at body height.)
        const y = sy(py) + 5;
        ctx.fillStyle = '#3a0408';
        ctx.fillRect(x, y + 1, 1, 1);
        ctx.fillStyle = locked ? '#ffffff' : '#ff4a36';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

/**
 * A mine's frame: flying it's dark; sitting it blinks between waiting and lit, faster and faster as its
 * fuse runs down; its last moment it's white all over.
 */
export function mineFrame(b: Bullet): number {
  if (b.t < b.fly) return 0;
  const q = Math.min(1, (b.t - b.fly) / Math.max(0.01, b.T));
  if (q > 1 - 0.12 / MINE_FUSE) return 2;
  return Math.floor(q * 3 + q * q * 9) % 2;
}
