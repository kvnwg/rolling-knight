/**
 * Ambient life over a floor, drawn each frame: fireflies drifting and blinking by the undergrowth and
 * the water (each one a little light), butterflies over the flowers by day, low banks of mist, and the
 * water of waterfalls tumbling down a ledge into its pool. Everything is placed from the floor's seed
 * when the floor is built and moves on smooth paths, so it costs a loop over what's in view.
 *
 * Wiring (renderer.ts), one Ambient per floor:
 *   prepareFloor:                         this.ambient = new Ambient(w.map, w.biome);
 *   render, ground layer (after the terrain and drawLiquidShimmer):
 *                                         this.ambient.drawGround(g, cx, cy, this.LW, this.LH, this.time);
 *   render, after the sorted standing list (the emissive layer, so fireflies bloom):
 *                                         this.ambient.drawAir(em, cx, cy, this.LW, this.LH, this.time);
 *   collectLights:                        out.push(...this.ambient.lights(cx, cy, this.W, this.H, this.time));
 * `cx, cy` are the view's top-left in world pixels; everything is drawn in view pixels.
 */
import { Rng } from '../core/rng';
import type { Biome, BiomeId } from '../world/biomes';
import { FLOOR, LIQUID, SOLID, TILE, type FloorMap } from '../world/mapgen';

/** The little of a 2D context this needs (a real canvas context, or a test double). */
export interface Paint {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export interface AmbientLight {
  x: number;
  y: number;
  r: number;
  color: string;
  intensity: number;
  bloom?: boolean;
}

interface Kind {
  /** Fireflies per 100 open tiles near plants or water, their glow. */
  fireflies?: { per100: number; colors: string[] };
  /** Butterflies per 100 open tiles. */
  butterflies?: { per100: number; colors: string[] };
  /** Low mist banks per 100 open tiles, and their color. */
  mist?: { per100: number; color: string; alpha: number };
}

const AMBIENT: Partial<Record<BiomeId, Kind>> = {
  hamlet: { butterflies: { per100: 2.2, colors: ['#f4f0e8', '#f4d050', '#f08a3a', '#9ac8f0'] } },
  farmland: { butterflies: { per100: 2.6, colors: ['#f4f0e8', '#f4d050', '#f0a04a'] } },
  forest: { fireflies: { per100: 9, colors: ['#ffe48a', '#d8ff8a', '#ffd060'] }, mist: { per100: 1.2, color: '#9ac0c0', alpha: 0.1 } },
  swamp: { fireflies: { per100: 10, colors: ['#c8ff6a', '#e8ff8a'] }, mist: { per100: 2, color: '#a8c898', alpha: 0.12 } },
  graveyard: { fireflies: { per100: 5, colors: ['#b8ff5a', '#d0ffa0'] }, mist: { per100: 2.2, color: '#a0a0c8', alpha: 0.12 } },
  shrine: { fireflies: { per100: 6, colors: ['#ffd84a', '#fff0a0'] }, butterflies: { per100: 0.8, colors: ['#f4a8c8', '#ffffff'] }, mist: { per100: 0.8, color: '#a8e0d8', alpha: 0.08 } },
  crystal: { fireflies: { per100: 6, colors: ['#a8d8ff', '#e0c0ff'] } },
  tundra: { mist: { per100: 1, color: '#e0ecf8', alpha: 0.1 } },
  crypt: { mist: { per100: 0.8, color: '#8ab0a8', alpha: 0.07 } },
};

interface Fly {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  color: string;
}

interface Bank {
  x: number;
  y: number;
  w: number;
  h: number;
  phase: number;
}

export class Ambient {
  private flies: Fly[] = [];
  private butterflies: Fly[] = [];
  private banks: Bank[] = [];
  private falls: Array<{ x: number; y: number; w: number; h: number }>;
  private mist?: Kind['mist'];
  private water: string[];

  constructor(map: FloorMap, biome: Biome) {
    const kind = AMBIENT[biome.id] ?? {};
    const rng = new Rng(Rng.hashSeed(map.seed ^ 0xa3b1e));
    this.falls = map.waterfalls ?? [];
    this.mist = kind.mist;
    this.water = biome.liquid?.ramp.slice() ?? ['#1b3d4f', '#245a6b', '#2f7c86', '#55a7a6', '#9fd8cc'];
    const tile = (x: number, y: number) => (x < 0 || y < 0 || x >= map.w || y >= map.h ? SOLID : map.tiles[y * map.w + x]);
    // Where the life is: open tiles beside the trees and walls, or the water.
    const lush: Array<[number, number]> = [];
    const open: Array<[number, number]> = [];
    for (let y = 1; y < map.h - 1; y++) {
      for (let x = 1; x < map.w - 1; x++) {
        const t = tile(x, y);
        if (t === SOLID) continue;
        if (t === FLOOR) open.push([x, y]);
        let near = t === LIQUID;
        for (let oy = -1; oy <= 1 && !near; oy++) for (let ox = -1; ox <= 1 && !near; ox++) if (tile(x + ox, y + oy) === SOLID || tile(x + ox, y + oy) === LIQUID) near = true;
        if (near) lush.push([x, y]);
      }
    }
    const spread = (cells: Array<[number, number]>, per100: number, colors: string[], out: Fly[], radius: number) => {
      const n = Math.round((cells.length / 100) * per100);
      for (let k = 0; k < n; k++) {
        const [tx, ty] = cells[rng.int(0, cells.length - 1)];
        out.push({ x: tx * TILE + rng.int(0, 15), y: ty * TILE + rng.int(0, 15), r: radius * rng.float(0.5, 1), phase: rng.float(0, Math.PI * 2), speed: rng.float(0.35, 0.9), color: rng.pick(colors) });
      }
    };
    if (kind.fireflies && lush.length) spread(lush, kind.fireflies.per100, kind.fireflies.colors, this.flies, 18);
    if (kind.butterflies && open.length) spread(open, kind.butterflies.per100, kind.butterflies.colors, this.butterflies, 26);
    if (kind.mist && lush.length) {
      const n = Math.round((lush.length / 100) * kind.mist.per100);
      for (let k = 0; k < n; k++) {
        const [tx, ty] = lush[rng.int(0, lush.length - 1)];
        this.banks.push({ x: tx * TILE + 8, y: ty * TILE + 8, w: rng.int(26, 52), h: rng.int(5, 9), phase: rng.float(0, Math.PI * 2) });
      }
    }
    // A bank of spray at the foot of every waterfall.
    for (const f of this.falls) this.banks.push({ x: f.x + f.w / 2, y: f.y + f.h + 4, w: f.w + 14, h: 6, phase: 0 });
  }

  private flyAt(f: Fly, t: number): { x: number; y: number; z: number; glow: number } {
    const a = t * f.speed + f.phase;
    const x = f.x + Math.sin(a) * f.r + Math.sin(a * 2.3 + 1) * f.r * 0.35;
    const y = f.y + Math.cos(a * 0.8) * f.r * 0.6;
    const z = 7 + Math.sin(a * 1.7) * 4;
    // Blink: lit for a while, dark for a while, each on its own beat.
    const b = Math.sin(t * (0.8 + f.speed) + f.phase * 3);
    const glow = b > 0.15 ? Math.min(1, (b - 0.15) * 2.2) : 0;
    return { x, y, z, glow };
  }

  /** Waterfalls tumbling, drawn on the ground layer. */
  drawGround(g: Paint, cx: number, cy: number, w: number, h: number, time: number): void {
    const W = this.water;
    for (const f of this.falls) {
      if (f.x + f.w < cx || f.x > cx + w || f.y + f.h < cy - 20 || f.y > cy + h) continue;
      const x0 = Math.round(f.x - cx);
      const y0 = Math.round(f.y - cy);
      // Streaks running down the face.
      for (let x = 0; x < f.w; x++) {
        const run = (time * 46 + x * 7.3 + (x % 3) * 11) % 18;
        g.globalAlpha = 0.85;
        g.fillStyle = x % 4 === 0 ? '#ffffff' : W[W.length - 1];
        g.fillRect(x0 + x, y0 + Math.floor(run * (f.h / 18)), 1, 3);
        if (x % 2 === 0) {
          g.fillStyle = W[3];
          g.fillRect(x0 + x, y0 + Math.floor(((run + 9) % 18) * (f.h / 18)), 1, 2);
        }
      }
      // Foam churning where it lands.
      g.fillStyle = '#ffffff';
      for (let k = 0; k < 10; k++) {
        const fx = Math.floor((Math.sin(time * 5 + k * 2.1) * 0.5 + 0.5) * (f.w + 6)) - 3;
        const fy = f.h + Math.floor((Math.sin(time * 7.3 + k) * 0.5 + 0.5) * 4);
        g.globalAlpha = 0.6 + 0.4 * Math.sin(time * 9 + k);
        g.fillRect(x0 + fx, y0 + fy, k % 3 ? 1 : 2, 1);
      }
    }
    g.globalAlpha = 1;
  }

  /** Fireflies, butterflies and mist, drawn over everything standing. */
  drawAir(a: Paint, cx: number, cy: number, w: number, h: number, time: number): void {
    // Mist: stepped bands, drifting and breathing.
    if (this.banks.length) {
      const color = this.mist?.color ?? '#e8f4f8';
      const alpha = this.mist?.alpha ?? 0.1;
      a.fillStyle = color;
      for (const b of this.banks) {
        const x = b.x + Math.sin(time * 0.12 + b.phase) * 10 - cx;
        const y = b.y - cy;
        if (x + b.w < 0 || x - b.w > w || y + b.h < 0 || y - b.h > h) continue;
        const breathe = 0.75 + 0.25 * Math.sin(time * 0.4 + b.phase);
        for (let band = 0; band < 3; band++) {
          const k = 1 - band * 0.3;
          a.globalAlpha = alpha * breathe * (0.5 + band * 0.35);
          const bw = Math.round(b.w * k);
          const bh = Math.max(1, Math.round(b.h * k));
          a.fillRect(Math.round(x - bw / 2), Math.round(y - bh / 2), bw, bh);
        }
      }
    }
    // Butterflies: two frames of wings, looping over the flowers.
    for (const f of this.butterflies) {
      const p = this.flyAt(f, time * 0.9);
      const x = Math.round(p.x - cx);
      const y = Math.round(p.y - p.z - 3 - cy);
      if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
      const open = Math.floor(time * 9 + f.phase * 4) % 2 === 0;
      a.globalAlpha = 1;
      a.fillStyle = '#2a2020';
      a.fillRect(x, y, 1, 2);
      a.fillStyle = f.color;
      if (open) {
        a.fillRect(x - 2, y - 1, 2, 2);
        a.fillRect(x + 1, y - 1, 2, 2);
      } else {
        a.fillRect(x - 1, y - 1, 1, 2);
        a.fillRect(x + 1, y - 1, 1, 2);
      }
    }
    // Fireflies: a bright core with a soft cross when they're lit.
    for (const f of this.flies) {
      const p = this.flyAt(f, time);
      if (p.glow <= 0) continue;
      const x = Math.round(p.x - cx);
      const y = Math.round(p.y - p.z - cy);
      if (x < -2 || y < -2 || x > w + 2 || y > h + 2) continue;
      a.fillStyle = f.color;
      a.globalAlpha = 0.35 * p.glow;
      a.fillRect(x - 1, y, 3, 1);
      a.fillRect(x, y - 1, 1, 3);
      a.globalAlpha = p.glow;
      a.fillStyle = '#fffff0';
      a.fillRect(x, y, 1, 1);
    }
    a.globalAlpha = 1;
  }

  /** The lights they give: each lit firefly a small pool, a soft one at every waterfall. */
  lights(cx: number, cy: number, w: number, h: number, time: number): AmbientLight[] {
    const out: AmbientLight[] = [];
    for (const f of this.flies) {
      const p = this.flyAt(f, time);
      if (p.glow < 0.3) continue;
      const x = p.x - cx;
      const y = p.y - p.z - cy;
      if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
      out.push({ x, y, r: 12, color: f.color, intensity: 0.55 * p.glow });
    }
    for (const f of this.falls) {
      const x = f.x + f.w / 2 - cx;
      const y = f.y + f.h - cy;
      if (x < -60 || y < -60 || x > w + 60 || y > h + 60) continue;
      out.push({ x, y, r: 34, color: this.water[this.water.length - 1], intensity: 0.45, bloom: true });
    }
    return out;
  }
}
