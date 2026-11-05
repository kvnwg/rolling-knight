/**
 * The dungeon camera. It follows the knight you control on a critically damped spring: it starts and
 * stops smoothly, never overshoots, and feels the same at any frame rate. On top of that it eases a
 * little ahead of where you're running and leans toward the fight around you (further toward a boss),
 * and it stays inside the map. A new floor snaps it into place; taking control of another knight
 * glides it across.
 *
 * Positions are the view's top-left in art pixels, unrounded. The renderer draws the frame at the
 * whole-pixel origin and the shader slides it by the remainder, so the world scrolls smoothly while
 * every sprite stays on the pixel grid.
 */

export interface CameraFocus {
  uid: number;
  x: number;
  y: number;
}

export interface CameraFoe {
  x: number;
  y: number;
  dead?: boolean;
  boss?: boolean;
}

export interface CameraFrame {
  /** Seconds since the last frame (0 while paused). */
  dt: number;
  /** Anything that changes when the floor changes (the map object): a change snaps the camera. */
  map: unknown;
  mapW: number;
  mapH: number;
  /** The view in art pixels. */
  viewW: number;
  viewH: number;
  /** Where on screen the leader sits, 0..1 (0.5 is the middle). */
  focusX: number;
  focusY: number;
  lead: CameraFocus | undefined;
  foes: Iterable<CameraFoe>;
  /** True while time runs backwards: no look-ahead from the jump. */
  rewinding?: boolean;
  /** Reduce motion: follow only, no look-ahead or leaning. */
  calm?: boolean;
}

/** How long the follow takes to settle (seconds), normally and while gliding to another knight. */
export const FOLLOW = 0.17;
export const GLIDE = 0.3;

export class Camera {
  x = 0;
  y = 0;
  private vx = 0;
  private vy = 0;
  private lookX = 0;
  private lookY = 0;
  private pullX = 0;
  private pullY = 0;
  private lastX = 0;
  private lastY = 0;
  private lastUid = -1;
  private map: unknown = null;
  private glideT = 0;

  update(f: CameraFrame): void {
    const { dt, viewW: vw, viewH: vh, mapW, mapH, lead } = f;
    const clampX = (x: number) => (mapW <= vw ? (mapW - vw) / 2 : Math.max(0, Math.min(mapW - vw, x)));
    const clampY = (y: number) => (mapH + 8 <= vh ? (mapH - vh) / 2 : Math.max(-8, Math.min(mapH - vh, y)));
    if (!lead) return;
    const newMap = this.map !== f.map;
    if (newMap) {
      this.map = f.map;
      this.vx = this.vy = this.lookX = this.lookY = this.pullX = this.pullY = 0;
      this.glideT = 0;
    } else if (lead.uid !== this.lastUid && this.lastUid !== -1) this.glideT = 0.7;
    if (newMap || lead.uid !== this.lastUid) {
      this.lastUid = lead.uid;
      this.lastX = lead.x;
      this.lastY = lead.y;
    }
    // How fast the leader is really moving, for the look-ahead (teleports and rewinds don't count).
    let mvx = dt > 0 ? (lead.x - this.lastX) / dt : 0;
    let mvy = dt > 0 ? (lead.y - this.lastY) / dt : 0;
    if (!Number.isFinite(mvx) || !Number.isFinite(mvy) || Math.hypot(mvx, mvy) > 400 || f.rewinding) mvx = mvy = 0;
    this.lastX = lead.x;
    this.lastY = lead.y;
    const ease = (tau: number) => (dt > 0 ? 1 - Math.exp(-dt / tau) : 0);
    const lookK = ease(0.5);
    this.lookX += ((f.calm ? 0 : clampN(mvx * 0.24, 16)) - this.lookX) * lookK;
    this.lookY += ((f.calm ? 0 : clampN(mvy * 0.18, 9)) - this.lookY) * lookK;
    // The fight: lean toward the foes close by, and further toward a boss.
    let px = 0;
    let py = 0;
    let wsum = 0;
    if (!f.calm) {
      for (const m of f.foes) {
        if (m.dead) continue;
        const dx = m.x - lead.x;
        const dy = m.y - lead.y;
        const reach = m.boss ? 180 : 100;
        const d = Math.hypot(dx, dy);
        if (d > reach) continue;
        const k = (1 - d / reach) * (m.boss ? 3 : 1);
        px += dx * k;
        py += dy * k;
        wsum += k;
      }
    }
    const pull = Math.min(1, wsum) * 0.3;
    const pullK = ease(0.8);
    this.pullX += ((wsum > 0 ? clampN((px / wsum) * pull, 22) : 0) - this.pullX) * pullK;
    this.pullY += ((wsum > 0 ? clampN((py / wsum) * pull, 14) : 0) - this.pullY) * pullK;
    const gx = clampX(lead.x + this.lookX + this.pullX - vw * f.focusX);
    const gy = clampY(lead.y - 10 + this.lookY + this.pullY - vh * f.focusY);
    if (newMap || Math.abs(gx - this.x) > 400 || Math.abs(gy - this.y) > 400) {
      this.x = gx;
      this.y = gy;
      this.vx = this.vy = 0;
      return;
    }
    this.glideT = Math.max(0, this.glideT - dt);
    const t = this.glideT > 0 ? GLIDE : FOLLOW;
    [this.x, this.vx] = smoothDamp(this.x, gx, this.vx, t, dt);
    [this.y, this.vy] = smoothDamp(this.y, gy, this.vy, t, dt);
    this.x = clampX(this.x);
    this.y = clampY(this.y);
  }
}

/** Clamps to ±m. */
function clampN(v: number, m: number): number {
  return Math.max(-m, Math.min(m, v));
}

/**
 * A critically damped spring toward `target` (Game Programming Gems 4, 8.1): smooth starts and stops,
 * no overshoot, frame-rate independent. Returns the new value and velocity.
 */
export function smoothDamp(cur: number, target: number, vel: number, smoothTime: number, dt: number): [number, number] {
  if (dt <= 0) return [cur, vel];
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel + omega * change) * dt;
  return [target + (change + temp) * exp, (vel - omega * temp) * exp];
}
