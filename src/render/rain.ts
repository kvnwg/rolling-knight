/**
 * Rain: thin bright streaks falling over everything, a little splash where each drop lands and a ring
 * where it hits water. Drops live in world pixels (a spot on the ground and a height above it), so the
 * camera moving doesn't drag the rain along with it. Drawn in two parts: the splashes on the ground
 * layer (behind whatever stands there), the streaks in the air over the standing layer.
 */
import { LIQUID, TILE, type FloorMap } from '../world/mapgen';

interface Drop {
  /** Where it will land, in world pixels, and how high above that it is now. */
  x: number;
  y: number;
  z: number;
  vz: number;
  len: number;
  a: number;
}

interface Splash {
  x: number;
  y: number;
  t: number;
  water: boolean;
}

/** The wind blows the rain a little to the left: a drop this high is this much to the right of where it lands. */
const SLANT = 0.12;
const SPLASH_T = 0.16;
const RING_T = 0.5;

type Paint = Pick<CanvasRenderingContext2D, 'fillStyle' | 'globalAlpha' | 'fillRect'>;

export class Rain {
  private drops: Drop[] = [];
  private splashes: Splash[] = [];

  reset(): void {
    this.drops = [];
    this.splashes = [];
  }

  /** Moves the rain on by `dt` over the view at (cx, cy), w x h, raining at `strength` (0..1). */
  update(dt: number, map: FloorMap, strength: number, cx: number, cy: number, w: number, h: number): void {
    const want = strength > 0 ? Math.round((strength * w * h) / 1100) : 0;
    while (this.drops.length < want) this.drops.push(this.spawn(cx, cy, w, h, Math.random()));
    if (this.drops.length > want) this.drops.length = want;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.z -= d.vz * dt;
      if (d.z <= 0) {
        if (d.x > cx - 4 && d.x < cx + w + 4 && d.y > cy - 4 && d.y < cy + h + 4) {
          const tx = Math.floor(d.x / TILE);
          const ty = Math.floor(d.y / TILE);
          const water = tx >= 0 && ty >= 0 && tx < map.w && ty < map.h && map.tiles[ty * map.w + tx] === LIQUID;
          this.splashes.push({ x: d.x, y: d.y, t: 0, water });
        }
        this.drops[i] = this.spawn(cx, cy, w, h, 1);
        continue;
      }
      // The camera moved on and left this one behind: bring it back in view.
      if (d.x < cx - 40 || d.x > cx + w + 40 || d.y < cy - 20 || d.y > cy + h + 120) this.drops[i] = this.spawn(cx, cy, w, h, Math.random());
    }
    for (const s of this.splashes) s.t += dt;
    this.splashes = this.splashes.filter((s) => s.t < (s.water ? RING_T : SPLASH_T));
  }

  /** A new drop somewhere over the view, `height` (0..1) of the way up its fall. */
  private spawn(cx: number, cy: number, w: number, h: number, height: number): Drop {
    const top = 40 + Math.random() * 130;
    return {
      x: cx - 10 + Math.random() * (w + 20),
      y: cy + Math.random() * (h + 70),
      z: top * height,
      vz: 230 + Math.random() * 110,
      len: Math.random() < 0.35 ? 8 : 6,
      a: 0.5 + Math.random() * 0.35,
    };
  }

  /** The splashes, on the ground layer (view at cx, cy). */
  drawGround(g: Paint, cx: number, cy: number): void {
    g.fillStyle = '#e4f0ff';
    for (const s of this.splashes) {
      const x = Math.round(s.x) - cx;
      const y = Math.round(s.y) - cy;
      if (s.water) {
        // A ring spreading on the water.
        const k = s.t / RING_T;
        const rx = 1 + Math.round(k * 4);
        const ry = Math.max(1, Math.round(rx * 0.5));
        g.globalAlpha = 0.6 * (1 - k);
        g.fillRect(x - rx + 1, y - ry, rx * 2 - 1, 1);
        g.fillRect(x - rx + 1, y + ry, rx * 2 - 1, 1);
        g.fillRect(x - rx, y - ry + 1, 1, ry * 2 - 1);
        g.fillRect(x + rx, y - ry + 1, 1, ry * 2 - 1);
        continue;
      }
      // A drop bursting: a bright dot, a little crown, then two specks flying apart.
      if (s.t < 0.05) {
        g.globalAlpha = 0.9;
        g.fillRect(x, y, 1, 1);
      } else if (s.t < 0.11) {
        g.globalAlpha = 0.75;
        g.fillRect(x - 1, y - 1, 1, 1);
        g.fillRect(x + 1, y - 1, 1, 1);
      } else {
        g.globalAlpha = 0.45;
        g.fillRect(x - 2, y, 1, 1);
        g.fillRect(x + 2, y, 1, 1);
      }
    }
    g.globalAlpha = 1;
  }

  /** The falling streaks, over everything standing (view at cx, cy). */
  drawAir(st: Paint, cx: number, cy: number): void {
    st.fillStyle = '#eef5ff';
    for (const d of this.drops) {
      const x = Math.round(d.x + d.z * SLANT) - cx;
      const y = Math.round(d.y - d.z) - cy;
      const half = d.len >> 1;
      st.globalAlpha = d.a;
      // Slanted a pixel: the top half a pixel to the right of the bottom.
      st.fillRect(x + 1, y - d.len, 1, half);
      st.fillRect(x, y - half, 1, half);
    }
    st.globalAlpha = 1;
  }
}
