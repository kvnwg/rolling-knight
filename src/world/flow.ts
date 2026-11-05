/**
 * Flow fields: breadth-first distances from one or more goal tiles over the floor, so anything can
 * find its way around walls by stepping to the neighbor closest to the goal.
 */
import { FLOOR, LIQUID, BLOCKED, TILE, type FloorMap } from './mapgen';

export interface Flow {
  dist: Int32Array;
  w: number;
  h: number;
}

export function flowFrom(m: FloorMap, goals: ReadonlyArray<{ x: number; y: number }>, flying = false): Flow {
  const w = m.w;
  const h = m.h;
  const dist = new Int32Array(w * h).fill(-1);
  const q = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const ok = (t: number) => t === FLOOR || (flying && (t === LIQUID || t === BLOCKED));
  for (const g of goals) {
    const tx = Math.floor(g.x / TILE);
    const ty = Math.floor(g.y / TILE);
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
    const i = ty * w + tx;
    if (dist[i] === 0) continue;
    dist[i] = 0;
    q[tail++] = i;
  }
  while (head < tail) {
    const c = q[head++];
    const cx = c % w;
    const cy = (c / w) | 0;
    const d = dist[c] + 1;
    const n4 = [cx > 0 ? c - 1 : -1, cx < w - 1 ? c + 1 : -1, cy > 0 ? c - w : -1, cy < h - 1 ? c + w : -1];
    for (const n of n4) {
      if (n < 0 || dist[n] >= 0 || !ok(m.tiles[n])) continue;
      dist[n] = d;
      q[tail++] = n;
    }
  }
  return { dist, w, h };
}

/** Distance (tiles) from a world point to the flow's goal; -1 when unreachable. */
export function flowDist(f: Flow, x: number, y: number): number {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= f.w || ty >= f.h) return -1;
  return f.dist[ty * f.w + tx];
}

/** A unit direction toward the goal from (x, y), or null if there's no way. */
export function flowStep(f: Flow, x: number, y: number): [number, number] | null {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= f.w || ty >= f.h) return null;
  const here = f.dist[ty * f.w + tx];
  if (here < 0) return null;
  let best = here;
  let bx = tx;
  let by = ty;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = tx + ox;
      const ny = ty + oy;
      if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h) continue;
      const d = f.dist[ny * f.w + nx];
      if (d < 0) continue;
      // No cutting corners: both side tiles must be open for a diagonal.
      if (ox && oy && (f.dist[ty * f.w + nx] < 0 || f.dist[ny * f.w + tx] < 0)) continue;
      if (d < best) {
        best = d;
        bx = nx;
        by = ny;
      }
    }
  }
  if (bx === tx && by === ty) {
    // At the goal tile: head for its center.
    const cx = tx * TILE + TILE / 2 - x;
    const cy = ty * TILE + TILE / 2 - y;
    const l = Math.hypot(cx, cy);
    return l > 1 ? [cx / l, cy / l] : null;
  }
  const dx = bx * TILE + TILE / 2 - x;
  const dy = by * TILE + TILE / 2 - y;
  const l = Math.hypot(dx, dy);
  return l > 0 ? [dx / l, dy / l] : null;
}
