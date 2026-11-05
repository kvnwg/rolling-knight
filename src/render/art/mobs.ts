/**
 * Mob art, built from each floor's procedural mob designs (mobgen.ts). Humanoid mobs (goblins,
 * skeletons, cultists, brutes, mummies, imps, the farm's scarecrows), ghosts and pumpkin-heads are
 * dressed on the same Snoblin mannequin as the knights; slimes, beasts, flyers (crows on the farm),
 * plants, golems, bugs and chickens are painted from shapes at their own size (bosses at 2.2x,
 * natively, not scaled up). The farm's pig and ram are the supplied pack sprites (its boss pig wears
 * a crown).
 */
import { blank, blit, flipX, type PixelBuf } from '../pixel/buf';
import { fromIndexed, type AnimSheet } from '../pixel/indexed';
import { BODY_ANIMS, BODY_FRAMES } from '../packs/mannequin';
import { PIG, RAM } from '../packs/farm';
import type { MobType } from '../../world/mobgen';
import { ball, hash, inkOutline, line, mixHex, rect, setRGB, shade } from './draw';
import { OUTLINE, type View } from './knights';

export type MobPose = 'idle' | 'walk' | 'wind' | 'strike';

export interface MobFrame {
  buf: PixelBuf;
  /** Feet (ground contact), in frame pixels. */
  ax: number;
  ay: number;
  /** Where shots leave from (the mouth or hands), in frame pixels. */
  mx: number;
  my: number;
}

function ink(t: MobType): string {
  return mixHex(shade(t.ramp[0], -0.55), OUTLINE, 0.5);
}

function finish(b: PixelBuf, t: MobType, ax: number, ay: number, mx: number, my: number): MobFrame {
  const o = inkOutline(b, ink(t));
  return { buf: o, ax: ax + 1, ay: ay + 1, mx: mx + 1, my: my + 1 };
}

function eyes(b: PixelBuf, x: number, y: number, n: 1 | 2 | 3, gap: number, color: string, big = false): void {
  const xs = n === 1 ? [x] : n === 2 ? [x - gap, x + gap] : [x - gap, x, x + gap];
  for (const ex of xs) {
    setRGB(b, ex, y, color);
    if (big) setRGB(b, ex, y + 1, shade(color, -0.4));
    setRGB(b, ex + (big ? 1 : 0), y - (big ? 1 : 0), big ? '#ffffff' : color);
  }
}

// ------------------------------------------------------------------ shapes

function slime(t: MobType, s: number, pose: MobPose, f: number): MobFrame {
  const W = Math.round(14 * s) + 6;
  const H = Math.round(12 * s) + 6;
  const b = blank(W, H);
  const squash = pose === 'walk' ? [0, 1, 0, -1][f % 4] : pose === 'wind' ? 2 : pose === 'strike' ? -2 : f % 2;
  const rx = 6 * s + squash * 0.6;
  const ry = 4.5 * s - squash * 0.6;
  const lift = pose === 'walk' && f % 4 === 3 ? Math.round(2 * s) : 0;
  const cx = W / 2;
  const cy = H - 1 - ry - lift;
  ball(b, cx, cy, rx, ry, [t.ramp[0], t.ramp[1], t.ramp[2], t.ramp[3]]);
  // A shiny highlight, and a darker drip at the base.
  setRGB(b, cx - rx * 0.45, cy - ry * 0.5, '#ffffff');
  setRGB(b, cx - rx * 0.45 + 1, cy - ry * 0.5, mixHex(t.ramp[3], '#ffffff', 0.5));
  if (t.features.spikes) for (let k = -1; k <= 1; k++) setRGB(b, cx + k * rx * 0.5, cy - ry - 1, t.ramp[2]);
  if (t.features.horns) {
    setRGB(b, cx - rx * 0.55, cy - ry, '#e8e0d0');
    setRGB(b, cx + rx * 0.55, cy - ry, '#e8e0d0');
  }
  eyes(b, cx, cy - ry * 0.15, t.features.eyes, Math.max(2, Math.round(2 * s)), t.eye);
  if (pose === 'wind' || pose === 'strike') rect(b, cx - 1, cy + ry * 0.35, 3, 1, ink(t));
  return finish(b, t, Math.round(cx), H - 1, Math.round(cx), Math.round(cy));
}

function beast(t: MobType, s: number, pose: MobPose, f: number): MobFrame {
  const W = Math.round(20 * s) + 4;
  const H = Math.round(14 * s) + 4;
  const b = blank(W, H);
  const legH = Math.round(3 * s);
  const groundY = H - 1;
  const bodyY = groundY - legH - 3 * s;
  const cx = W / 2 - 1 * s;
  const step = pose === 'walk' ? [1, 0, -1, 0][f % 4] : 0;
  const crouch = pose === 'wind' ? 1 : 0;
  // Legs (far pair darker), moving in a trot.
  const legs = [-4, -2, 3, 5].map((dx, i) => ({ x: cx + dx * s, off: (i % 2 === 0 ? step : -step) * s * 0.8, far: i === 1 || i === 3 }));
  for (const l of legs) {
    const col = l.far ? t.ramp[0] : t.ramp[1];
    rect(b, Math.round(l.x + l.off), Math.round(bodyY + 1.5 * s + crouch), Math.max(1, Math.round(1.4 * s)), Math.round(legH + 1.5 * s - crouch), col);
  }
  // Tail.
  if (t.features.tail) line(b, cx - 6 * s, bodyY - 1 * s, cx - 8.5 * s, bodyY - 3 * s + (f % 2), t.ramp[1]);
  ball(b, cx, bodyY + crouch, 6.5 * s, 3.2 * s, [t.ramp[0], t.ramp[1], t.ramp[2], t.ramp[3]]);
  // Head at the front (facing right), with ears or horns, a snout and an eye.
  const hx = cx + 6.5 * s;
  const hy = bodyY - 2 * s + crouch + (pose === 'strike' ? 1 : 0);
  ball(b, hx, hy, 3.2 * s, 2.8 * s, [t.ramp[0], t.ramp[1], t.ramp[2], t.ramp[3]]);
  rect(b, Math.round(hx + 2 * s), Math.round(hy), Math.round(2 * s), Math.max(1, Math.round(1.6 * s)), t.ramp[2]);
  setRGB(b, hx + 3.6 * s, hy, ink(t));
  if (t.features.horns) {
    line(b, hx - 1 * s, hy - 2.5 * s, hx - 2.5 * s, hy - 4.5 * s, '#e8e0d0');
    line(b, hx + 0.5 * s, hy - 2.6 * s, hx + 0.5 * s, hy - 4.6 * s, '#d0c8b8');
  } else {
    rect(b, Math.round(hx - 1.5 * s), Math.round(hy - 3.6 * s), Math.max(1, Math.round(1.2 * s)), Math.round(1.6 * s), t.ramp[1]);
    rect(b, Math.round(hx + 0.6 * s), Math.round(hy - 3.6 * s), Math.max(1, Math.round(1.2 * s)), Math.round(1.6 * s), t.ramp[2]);
  }
  if (t.features.spikes) for (let k = -2; k <= 2; k++) setRGB(b, cx + k * 2 * s, bodyY - 3.4 * s + crouch, t.ramp[3]);
  setRGB(b, hx + 0.8 * s, hy - 0.6 * s, t.eye);
  return finish(b, t, Math.round(cx), groundY, Math.round(hx + 3 * s), Math.round(hy));
}

/** A filled triangle. */
function tri(b: PixelBuf, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, hex: string): void {
  const x0 = Math.floor(Math.min(ax, bx, cx));
  const x1 = Math.ceil(Math.max(ax, bx, cx));
  const y0 = Math.floor(Math.min(ay, by, cy));
  const y1 = Math.ceil(Math.max(ay, by, cy));
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 0.01) return line(b, ax, ay, bx, by, hex);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5;
    const py = y + 0.5;
    const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
    const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
    const w2 = 1 - w0 - w1;
    if (w0 >= -0.05 && w1 >= -0.05 && w2 >= -0.05) setRGB(b, x, y, hex);
  }
}

const CROW = ['#0c0c16', '#1c1e2c', '#30344a', '#4e5674'];

/** The farm's flyer: a crow, beak first, wings beating. */
function crow(t: MobType, s: number, pose: MobPose, f: number): MobFrame {
  const W = Math.round(18 * s) + 4;
  const H = Math.round(16 * s) + 4;
  const b = blank(W, H);
  const cx = W / 2 - 0.5 * s;
  const hover = Math.round(Math.sin(f * 1.6) * 1);
  const cy = H - 1 - 6.5 * s + hover;
  const up = pose === 'wind' || f % 2 === 0;
  // The far wing behind the body, darker.
  if (up) tri(b, cx - 1 * s, cy - 1 * s, cx + 1.5 * s, cy - 1 * s, cx + 1.5 * s, cy - 6.5 * s, CROW[0]);
  else tri(b, cx - 1 * s, cy, cx + 1.5 * s, cy, cx + 2 * s, cy + 4 * s, CROW[0]);
  // A fanned tail.
  tri(b, cx - 2 * s, cy - 0.6 * s, cx - 2 * s, cy + 1 * s, cx - 6.5 * s, cy + 1.6 * s, CROW[1]);
  line(b, cx - 6.5 * s, cy + 1.6 * s, cx - 5 * s, cy + 1.2 * s, CROW[2]);
  ball(b, cx, cy, 3.4 * s, 2.5 * s, CROW);
  // The head, a hooked beak and an angry eye.
  const hx = cx + 3.2 * s;
  const hy = cy - 1.8 * s + (pose === 'strike' ? 1 : 0);
  ball(b, hx, hy, 2.1 * s, 1.9 * s, CROW);
  const open = pose === 'wind' || pose === 'strike';
  line(b, hx + 1.8 * s, hy, hx + 3.6 * s, hy + (open ? -0.5 : 0.4) * s, '#c8b078');
  setRGB(b, hx + 1.8 * s, hy, '#8a7450');
  if (open) line(b, hx + 1.8 * s, hy + 1, hx + 3 * s, hy + 1.2 * s, '#8a7450');
  setRGB(b, hx + 0.6 * s, hy - 0.7 * s, t.eye);
  setRGB(b, hx - 0.2 * s, hy - 1.3 * s, CROW[0]);
  // The near wing over the body, its flight feathers catching the light.
  const tipX = up ? cx - 2.5 * s : cx - 1.5 * s;
  const tipY = up ? cy - 7.5 * s : cy + 4.5 * s;
  tri(b, cx - 1.8 * s, cy - 0.6 * s, cx + 1.6 * s, cy - 0.6 * s, tipX, tipY, CROW[2]);
  line(b, cx + 1.6 * s, cy - 0.6 * s, tipX, tipY, CROW[1]);
  line(b, cx - 1.8 * s, cy - 0.6 * s, tipX, tipY, CROW[3]);
  return finish(b, t, Math.round(cx), H - 1, Math.round(hx + 3 * s), Math.round(hy));
}

const HENS = [
  ['#9a8e86', '#d0c8c0', '#f0ece6', '#ffffff'],
  ['#5a3418', '#8a5428', '#b87a3a', '#dca666'],
  ['#2a2a32', '#4a4a56', '#6e6e7e', '#a0a0b0'],
];

/** The farm's swarm: an angry chicken (white, brown or black), running beak first. */
function chicken(t: MobType, _s: number, pose: MobPose, f: number): MobFrame {
  const b = blank(15, 14);
  const ramp = HENS[t.features.seed % 3 === 2 && t.features.spikes ? 2 : t.features.seed % 2];
  const ground = 13;
  const walk = pose === 'walk';
  const bob = walk && f % 2 === 1 ? -1 : pose === 'wind' ? 1 : 0;
  const peck = pose === 'strike' || (pose === 'idle' && f % 4 === 2);
  // Legs, scissoring as it runs.
  const legs = walk ? (f % 2 ? [[5, 0], [8, -1]] : [[6, -1], [7, 0]]) : [[5, 0], [8, 0]];
  for (const [lx, lift] of legs) {
    line(b, lx, ground - 3 + bob, lx, ground + lift, '#d8862a');
    setRGB(b, lx + 1, ground + lift, '#d8862a');
    setRGB(b, lx - 1, ground + lift, '#b86a1e');
  }
  // Tail feathers up at the back, the plump body, a wing folded on its side.
  const by = 7.4 + bob;
  tri(b, 1, by - 4.5, 2, by + 1, 5, by - 0.5, ramp[2]);
  setRGB(b, 1, by - 4.5, ramp[3]);
  setRGB(b, 2, by - 3, ramp[1]);
  ball(b, 6.5, by, 4.8, 3.4, ramp);
  ball(b, 6, by + 0.4, 2.8, 1.6, [ramp[0], ramp[1], ramp[2], ramp[2]], 0.4);
  line(b, 4, by - 0.6, 7, by - 0.9, ramp[3]);
  // The head (bobbing forward to peck), comb, wattle, beak and a furious little eye.
  const hx = 10.5 + (peck ? 1.5 : pose === 'wind' ? -1 : 0);
  const hy = 3.6 + bob + (peck ? 2 : 0);
  ball(b, hx, hy, 2.2, 2.3, ramp);
  rect(b, Math.round(hx - 1), Math.round(hy - 3), 2, 1, '#e0342a');
  setRGB(b, hx, hy - 3.5, '#ff5a40');
  setRGB(b, hx - 1.6, hy - 2.4, '#b0201c');
  setRGB(b, hx + 2.2, hy, '#f0b030');
  setRGB(b, hx + 3.2, hy, peck ? '#f0b030' : '#d8902a');
  if (peck) setRGB(b, hx + 2.2, hy + 1, '#d8902a');
  setRGB(b, hx + 1.2, hy + 2, '#c82a24');
  setRGB(b, hx + 0.6, hy - 0.6, '#140a0a');
  setRGB(b, hx - 0.2, hy - 1.4, ramp[0]);
  return finish(b, t, 7, ground, Math.round(hx + 3), Math.round(hy));
}

function flyer(t: MobType, s: number, pose: MobPose, f: number): MobFrame {
  if (t.id.startsWith('farmland-')) return crow(t, s, pose, f);
  const W = Math.round(18 * s) + 4;
  const H = Math.round(16 * s) + 4;
  const b = blank(W, H);
  const cx = W / 2;
  const hover = Math.round(Math.sin(f * 1.6) * 1);
  const cy = H - 1 - 7 * s + hover;
  const kind = /Wisp|Spirit/.test(t.name) ? 'wisp' : /Eye|Watcher|Spitter/.test(t.name) ? 'eye' : 'bat';
  if (kind === 'wisp') {
    for (let k = 3; k >= 1; k--) setRGB(b, cx - k * 0.6, cy + 2 + k * 1.4, mixHex(t.ramp[2], '#ffffff', 0.2));
    ball(b, cx, cy, 3 * s, 3 * s, [t.ramp[2], t.ramp[3], mixHex(t.ramp[3], '#ffffff', 0.5), '#ffffff'], 0.2);
    eyes(b, cx, cy, 2, 1, ink(t));
    return { buf: b, ax: Math.round(cx), ay: H - 1, mx: Math.round(cx), my: Math.round(cy) };
  }
  const up = pose === 'wind' || f % 2 === 0;
  // Wings: two poses, up and down.
  for (const side of [-1, 1]) {
    const wx = cx + side * 3 * s;
    const tipX = cx + side * 8 * s;
    const tipY = up ? cy - 5 * s : cy + 2 * s;
    for (let k = 0; k <= 6; k++) {
      const x = wx + ((tipX - wx) * k) / 6;
      const y = cy - 1 + ((tipY - cy + 1) * k) / 6;
      line(b, x, y, x, y + Math.max(1, (6 - k) * 0.5 * s), k % 2 ? t.ramp[1] : t.ramp[0]);
    }
  }
  if (kind === 'eye') {
    ball(b, cx, cy, 4 * s, 4 * s, ['#b8b0a8', '#e0d8d0', '#f4f0ec', '#ffffff'], 0.3);
    ball(b, cx + 0.8 * s, cy + 0.3 * s, 2 * s, 2 * s, [t.ramp[0], t.ramp[1], t.ramp[2], t.ramp[3]]);
    setRGB(b, cx + 0.8 * s, cy + 0.3 * s, '#0a0a0a');
    setRGB(b, cx + 0.2 * s, cy - 0.4 * s, '#ffffff');
  } else {
    ball(b, cx, cy, 3 * s, 3.2 * s, [t.ramp[0], t.ramp[1], t.ramp[2], t.ramp[3]]);
    setRGB(b, cx - 2 * s, cy - 3.6 * s, t.ramp[1]);
    setRGB(b, cx + 2 * s, cy - 3.6 * s, t.ramp[1]);
    eyes(b, cx, cy - 0.5 * s, t.features.eyes, 1, t.eye);
  }
  return finish(b, t, Math.round(cx), H - 1, Math.round(cx), Math.round(cy));
}

function plant(t: MobType, s: number, pose: MobPose, f: number): MobFrame {
  const W = Math.round(16 * s) + 4;
  const H = Math.round(18 * s) + 4;
  const b = blank(W, H);
  const cx = W / 2;
  const ground = H - 1;
  const sway = pose === 'walk' || pose === 'idle' ? [0, 1, 0, -1][f % 4] : 0;
  // Leaves at the base.
  ball(b, cx - 3.5 * s, ground - 1.5 * s, 3 * s, 1.6 * s, ['#1a3a1a', '#2c5a2a', '#3e7a36', '#5a9a44']);
  ball(b, cx + 3.5 * s, ground - 1.5 * s, 3 * s, 1.6 * s, ['#1a3a1a', '#2c5a2a', '#3e7a36', '#5a9a44']);
  line(b, cx, ground - 2 * s, cx + sway, ground - 8 * s, '#2c5a2a');
  const hx = cx + sway;
  const hy = ground - 10 * s;
  const open = pose === 'wind' || pose === 'strike';
  ball(b, hx, hy, 4.5 * s, (open ? 4.2 : 3.8) * s, [t.ramp[0], t.ramp[1], t.ramp[2], t.ramp[3]]);
  if (t.features.spikes) for (let k = 0; k < 5; k++) setRGB(b, hx + Math.cos(k * 1.25) * 5 * s, hy + Math.sin(k * 1.25) * 4.5 * s, t.ramp[3]);
  rect(b, Math.round(hx - 2 * s), Math.round(hy + 0.5 * s), Math.round(4 * s), open ? Math.round(2 * s) : 1, ink(t));
  if (open) rect(b, Math.round(hx - 1.5 * s), Math.round(hy + 0.5 * s), 1, 1, '#ffffff');
  eyes(b, hx, hy - 1.5 * s, t.features.eyes, Math.max(1, Math.round(1.6 * s)), t.eye);
  return finish(b, t, Math.round(cx), ground, Math.round(hx), Math.round(hy));
}

function golem(t: MobType, s: number, pose: MobPose, f: number): MobFrame {
  const W = Math.round(20 * s) + 4;
  const H = Math.round(20 * s) + 4;
  const b = blank(W, H);
  const cx = W / 2;
  const ground = H - 1;
  const step = pose === 'walk' ? [1, 0, -1, 0][f % 4] : 0;
  const raise = pose === 'wind' ? -3 * s : pose === 'strike' ? 2 * s : 0;
  const stone = [t.ramp[0], t.ramp[1], t.ramp[2], t.ramp[3]];
  // Legs.
  rect(b, Math.round(cx - 4 * s), Math.round(ground - 4 * s + Math.max(0, step)), Math.round(3 * s), Math.round(4 * s), t.ramp[1]);
  rect(b, Math.round(cx + 1 * s), Math.round(ground - 4 * s + Math.max(0, -step)), Math.round(3 * s), Math.round(4 * s), t.ramp[0]);
  // Body: a chunky block with chipped corners, lit from the top left.
  const bx0 = Math.round(cx - 6 * s);
  const by0 = Math.round(ground - 14 * s);
  const bw = Math.round(12 * s);
  const bh = Math.round(10 * s);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if ((x === 0 || x === bw - 1) && (y === 0 || y === bh - 1)) continue;
    const k = x < bw * 0.3 && y < bh * 0.4 ? 3 : x > bw * 0.7 || y > bh * 0.75 ? 1 : 2;
    setRGB(b, bx0 + x, by0 + y, stone[k]);
  }
  // Cracks and a glowing core.
  line(b, bx0 + bw * 0.3, by0 + 2, bx0 + bw * 0.45, by0 + bh * 0.5, t.ramp[0]);
  ball(b, cx, by0 + bh * 0.55, 1.6 * s, 1.6 * s, [shade(t.eye, -0.3), t.eye, mixHex(t.eye, '#ffffff', 0.5), '#ffffff'], 0.5);
  // Arms.
  for (const side of [-1, 1]) {
    const ax = side < 0 ? bx0 - Math.round(3 * s) : bx0 + bw;
    const ay = by0 + Math.round(2 * s) + Math.round(raise) + (side < 0 ? step : -step);
    rect(b, ax, ay, Math.round(3 * s), Math.round(7 * s), side < 0 ? t.ramp[2] : t.ramp[1]);
  }
  // Head.
  const hw = Math.round(6 * s);
  const hh = Math.round(4 * s);
  rect(b, Math.round(cx - hw / 2), by0 - hh + 1, hw, hh, t.ramp[2]);
  rect(b, Math.round(cx - hw / 2), by0 - hh + 1, hw, 1, t.ramp[3]);
  eyes(b, cx, by0 - hh / 2 + 1, 2, Math.max(1, Math.round(1.5 * s)), t.eye);
  if (t.features.crest) rect(b, Math.round(cx - 1), by0 - hh - Math.round(2 * s) + 1, 2, Math.round(2 * s), t.ramp[3]);
  return finish(b, t, Math.round(cx), ground, Math.round(cx), by0);
}

function bug(t: MobType, s: number, pose: MobPose, f: number): MobFrame {
  const W = Math.round(18 * s) + 4;
  const H = Math.round(12 * s) + 4;
  const b = blank(W, H);
  const cx = W / 2;
  const ground = H - 1;
  const spider = /Spider|Crawler|Tick|Mite/.test(t.name);
  const cy = ground - 4 * s;
  const scuttle = pose === 'walk' ? f % 2 : 0;
  // Legs.
  const n = spider ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const lx = cx - 3 * s + i * (6 * s) / (n - 1);
    const off = (i + scuttle) % 2 ? 1 : -1;
    line(b, lx, cy, lx - 2 * s + off, ground, t.ramp[0]);
    line(b, lx + 1, cy, lx + 2 * s + off, ground, t.ramp[0]);
  }
  ball(b, cx - 1 * s, cy - 1 * s, (spider ? 4.5 : 5.5) * s, (spider ? 3.8 : 3.4) * s, [t.ramp[0], t.ramp[1], t.ramp[2], t.ramp[3]]);
  if (!spider) line(b, cx - 1 * s, cy - 4.2 * s, cx - 1 * s, cy + 2 * s, t.ramp[0]);
  // Head and mandibles (facing right).
  const hx = cx + 4.5 * s;
  ball(b, hx, cy, 2.2 * s, 2 * s, [t.ramp[0], t.ramp[1], t.ramp[1], t.ramp[2]]);
  setRGB(b, hx + 2.2 * s, cy + 1, '#e8e0c8');
  setRGB(b, hx + 2.2 * s, cy - 1, '#e8e0c8');
  if (pose === 'wind') setRGB(b, hx + 3 * s, cy, '#e8e0c8');
  eyes(b, hx + 0.5 * s, cy - 0.6 * s, spider ? 3 : 1, 1, t.eye);
  if (t.features.horns) line(b, hx, cy - 2 * s, hx + 2 * s, cy - 4 * s, t.ramp[3]);
  return finish(b, t, Math.round(cx), ground, Math.round(hx), Math.round(cy));
}

// ------------------------------------------------------------------ dressed mannequins

type MannequinKind = 'goblin' | 'skeleton' | 'cultist' | 'brute' | 'mummy' | 'imp' | 'ghost' | 'pumpkin' | 'monk' | 'scarecrow';

function mannequinKind(t: MobType): MannequinKind {
  if (t.plan === 'ghost') return 'ghost';
  if (t.plan === 'pumpkin') return 'pumpkin';
  const biome = t.id.split('-')[0];
  if (biome === 'farmland') return 'scarecrow';
  if (t.behavior === 'caster') return biome === 'shrine' ? 'monk' : 'cultist';
  switch (biome) {
    case 'dungeon':
    case 'crypt':
    case 'graveyard':
      return 'skeleton';
    case 'desert':
      return t.behavior === 'ranged' ? 'skeleton' : 'mummy';
    case 'ember':
      return 'imp';
    case 'tundra':
      return 'brute';
    case 'shrine':
      return 'monk';
    default:
      return t.features.horns ? 'brute' : 'goblin';
  }
}

const BONE = ['#6a6250', '#a8a08a', '#d8d0b8', '#f4eedc'];
const PUMPKIN = ['#6e2a12', '#a6451f', '#e0702a', '#ffa046'];
const BURLAP = ['#5e4428', '#8c6c42', '#b89660', '#dcc08a'];
/** Scarecrows wear red or green flannel. */
const FLANNEL = [
  ['#3a1410', '#6a2018', '#9a3424', '#c85a40'],
  ['#16301a', '#244a24', '#386a30', '#5a8c44'],
];
const STRAW = ['#6a4a1a', '#9a7228', '#c89e3e', '#e6c463', '#f6e09a'];

function dressed(t: MobType, _s: number, pose: MobPose, f: number, view: View): MobFrame {
  const kind = mannequinKind(t);
  const anim = pose === 'walk' ? 'walk' : pose === 'idle' ? 'idle' : 'hurt';
  const list = BODY_ANIMS[`${anim}_${view}`];
  const fr = BODY_FRAMES[list[(pose === 'wind' ? 1 : pose === 'strike' ? 0 : f) % list.length]];
  const W = fr.rows[0].length + 6;
  const H = fr.rows.length + 6;
  const b = blank(W, H);
  const ox = 3;
  const oy = 6;
  const skin = kind === 'scarecrow' ? BURLAP : kind === 'skeleton' ? BONE : kind === 'mummy' ? ['#5a5040', '#8a7e64', '#bcb092', '#e0d6b8'] : kind === 'imp' ? ['#4a0e0e', '#8a1a14', '#c8321e', '#f05a3a'] : kind === 'ghost' ? ['#5a6a8a', '#8a9ac0', '#c0d0f0', '#eef4ff'] : t.ramp;
  const sleeves = kind === 'cultist' || kind === 'monk' || kind === 'scarecrow';
  const cloth = kind === 'scarecrow' ? FLANNEL[t.features.seed % FLANNEL.length] : kind === 'cultist' || kind === 'monk' ? [shade(t.ramp[0], -0.3), t.ramp[0], t.ramp[1], t.ramp[2]] : kind === 'brute' ? ['#3a3430', '#5a524a', '#7a7066', '#9a9084'] : [shade(t.ramp[1], -0.4), shade(t.ramp[1], -0.2), t.ramp[1], t.ramp[2]];
  const legs = kind === 'ghost' ? null : kind === 'scarecrow' ? ['#1c2236', '#2c3852', '#44567a'] : [shade(cloth[0], -0.2), cloth[0], cloth[1]];
  const cx = Math.round((fr.head[0] + fr.head[2]) / 2) + ox;
  for (let y = 0; y < fr.rows.length; y++) {
    for (let x = 0; x < fr.rows[y].length; x++) {
      const ch = fr.rows[y][x];
      if (ch === '.') continue;
      let col: string | null = null;
      const lvl = (a: string, bb: string) => (ch === a ? 1 : ch === bb ? 2 : 3);
      if (ch === 'k') col = ink(t);
      else if (ch === 'e') col = kind === 'skeleton' || kind === 'cultist' || kind === 'monk' ? t.eye : '#140a10';
      else if ('hij'.includes(ch)) col = skin[lvl('h', 'i')];
      else if ('tuv'.includes(ch)) col = kind === 'skeleton' ? (y % 2 ? BONE[1] : BONE[0]) : kind === 'mummy' ? skin[(y + x) % 3 === 0 ? 1 : 2] : cloth[lvl('t', 'u')];
      else if ('abc'.includes(ch)) col = sleeves ? cloth[lvl('a', 'b')] : skin[lvl('a', 'b')];
      // A scarecrow's flannel: darker stripes across the shirt and sleeves.
      if (kind === 'scarecrow' && col && 'tuvabc'.includes(ch) && (x % 3 === 1 || y % 3 === 0)) col = cloth[Math.max(0, cloth.indexOf(col) - 1)];
      else if ('lmn'.includes(ch)) col = legs ? (kind === 'skeleton' ? BONE[lvl('l', 'm') - 1] : legs[lvl('l', 'm') - 1]) : null;
      else if ('fg'.includes(ch)) col = legs ? shade(legs[0], -0.3) : null;
      if (kind === 'ghost' && y > fr.head[3] + 4) {
        // A ghost's body fades into a wispy tail.
        if ((x + y + f) % 3 === 0 || y > fr.head[3] + 6) continue;
      }
      if (col) setRGB(b, x + ox, y + oy, col, kind === 'ghost' ? 215 : 255);
    }
  }
  const hx = fr.head[0] + ox;
  const hy = fr.head[1] + oy;
  const hw = fr.head[2] - fr.head[0];
  // Headgear and faces by kind.
  switch (kind) {
    case 'goblin': {
      // Big pointy ears.
      for (const side of [-1, 1]) {
        if (view === 'side' && side < 0) continue;
        const ex = side < 0 ? hx - 1 : hx + hw + 1;
        setRGB(b, ex, hy + 3, skin[2]);
        setRGB(b, ex + side, hy + 2, skin[2]);
        setRGB(b, ex + side * 2, hy + 1, skin[3]);
      }
      if (view !== 'up') {
        setRGB(b, hx + (view === 'side' ? 4 : 2), hy + 4, t.eye);
        setRGB(b, hx + (view === 'side' ? 6 : 5), hy + 4, t.eye);
      }
      break;
    }
    case 'skeleton': {
      if (view !== 'up') {
        rect(b, hx + (view === 'side' ? 3 : 2), hy + 3, 2, 2, '#140a10');
        rect(b, hx + (view === 'side' ? 6 : 5), hy + 3, view === 'side' ? 1 : 2, 2, '#140a10');
        setRGB(b, hx + (view === 'side' ? 3 : 2), hy + 3, t.eye);
        setRGB(b, hx + (view === 'side' ? 6 : 5), hy + 3, t.eye);
        for (let x = hx + 2; x <= hx + hw - 2; x += 2) setRGB(b, x, hy + 6, '#140a10');
      }
      break;
    }
    case 'cultist':
    case 'monk': {
      // A deep hood with eyes glowing in its shadow.
      for (let y = hy - 2; y <= hy + 6; y++) {
        for (let x = hx - 1; x <= hx + hw + 1; x++) {
          const inside = y >= hy + 2 && y <= hy + 5 && x >= hx + 2 && x <= hx + hw - 2 && view !== 'up';
          const edge = y === hy - 2 || x === hx - 1 || x === hx + hw + 1;
          if (y === hy - 2 && (x < hx + 2 || x > hx + hw - 2)) continue;
          setRGB(b, x, y, inside ? '#0a0610' : edge ? ink(t) : y < hy + 1 ? cloth[2] : cloth[1]);
        }
      }
      if (kind === 'cultist') setRGB(b, hx + hw / 2, hy - 3, ink(t));
      if (view !== 'up') {
        setRGB(b, hx + (view === 'side' ? 4 : 3), hy + 3, t.eye);
        setRGB(b, hx + (view === 'side' ? 6 : 5), hy + 3, t.eye);
      }
      break;
    }
    case 'brute':
    case 'imp': {
      // Horns (a horned helm for brutes).
      if (kind === 'brute') rect(b, hx, hy, hw + 1, 3, cloth[2]);
      for (const side of [-1, 1]) {
        const bx = side < 0 ? hx + 1 : hx + hw - 1;
        setRGB(b, bx, hy - 1, '#e8e0d0');
        setRGB(b, bx + side, hy - 2, '#e8e0d0');
        setRGB(b, bx + side, hy - 3, '#c8c0b0');
      }
      if (view !== 'up') {
        setRGB(b, hx + (view === 'side' ? 4 : 2), hy + 4, t.eye);
        setRGB(b, hx + (view === 'side' ? 6 : 5), hy + 4, t.eye);
      }
      break;
    }
    case 'mummy': {
      for (let y = hy + 1; y < hy + 7; y += 2) for (let x = hx + 1; x < hx + hw; x++) if ((x + y) % 4 === 0) setRGB(b, x, y, skin[1]);
      if (view !== 'up') setRGB(b, hx + (view === 'side' ? 5 : 3), hy + 3, t.eye);
      break;
    }
    case 'pumpkin': {
      // The head becomes a carved jack-o'-lantern with a stem and a leaf.
      const pw = hw + 3;
      const ph = 8;
      const px0 = hx - 1;
      const py0 = hy - 2;
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        const dx = (x + 0.5 - pw / 2) / (pw / 2);
        const dy = (y + 0.5 - ph / 2) / (ph / 2);
        if (dx * dx + dy * dy > 1.05) continue;
        const rib = Math.abs(dx) > 0.55 && Math.abs(dx) < 0.7;
        const k = rib ? 1 : dx < -0.2 && dy < 0 ? 3 : dx > 0.4 || dy > 0.5 ? 1 : 2;
        setRGB(b, px0 + x, py0 + y, PUMPKIN[k]);
      }
      if (view !== 'up') {
        const glow = '#ffe06a';
        setRGB(b, px0 + 3, py0 + 3, glow);
        setRGB(b, px0 + pw - 4, py0 + 3, glow);
        rect(b, px0 + 3, py0 + 5, pw - 6, 1, glow);
        setRGB(b, px0 + 4, py0 + 6, '#c87a20');
      }
      rect(b, px0 + Math.floor(pw / 2), py0 - 2, 1, 2, '#3a5a20');
      setRGB(b, px0 + Math.floor(pw / 2) + 1, py0 - 2, '#5a8a30');
      break;
    }
    case 'scarecrow': {
      // A burlap sack head with stitches for a face and button eyes that glow, straw at the neck and
      // cuffs, and a battered straw hat.
      if (view !== 'up') {
        const ex = view === 'side' ? [hx + 4, hx + 6] : [hx + 2, hx + 5];
        for (const x of ex) setRGB(b, x, hy + 3, t.eye);
        for (let x = ex[0]; x <= ex[1]; x++) setRGB(b, x, hy + 5, (x - ex[0]) % 2 ? skin[1] : '#2a1a10');
      }
      for (const x of [hx + 1, hx + hw - 1]) setRGB(b, x, hy + 7, STRAW[3]);
      for (const [x, y] of [fr.handR, fr.handL]) {
        setRGB(b, x + ox, y + oy + 1, STRAW[3]);
        setRGB(b, x + ox + (x > cx - ox ? 1 : -1), y + oy + 1, STRAW[2]);
      }
      rect(b, hx - 2, hy, hw + 5, 1, STRAW[2]);
      rect(b, hx - 2, hy, 4, 1, STRAW[3]);
      rect(b, hx + 1, hy - 3, hw - 1, 3, STRAW[2]);
      rect(b, hx + 1, hy - 3, 2, 3, STRAW[3]);
      rect(b, hx + 1, hy - 3, hw - 1, 1, STRAW[4]);
      rect(b, hx + 1, hy - 1, hw - 1, 1, '#8a2a22');
      // Straw hair sticking out under the brim.
      for (const [x, y, k] of [[hx - 1, hy + 1, 3], [hx - 1, hy + 2, 2], [hx, hy + 1, 2], [hx + hw, hy + 1, 2], [hx + hw + 1, hy + 1, 2], [hx + hw + 1, hy + 2, 1]] as const) setRGB(b, x, y, STRAW[k]);
      break;
    }
    case 'ghost':
      if (view !== 'up') {
        setRGB(b, hx + 2, hy + 3, '#1a1030');
        setRGB(b, hx + 5, hy + 3, '#1a1030');
        rect(b, hx + 3, hy + 5, 2, 1, '#1a1030');
      }
      break;
  }
  // Weapons by behavior, held in the right hand.
  const [hrx, hry] = [fr.handR[0] + ox, fr.handR[1] + oy];
  if (kind !== 'ghost' && view !== 'up') {
    const swing = pose === 'wind' ? -2 : pose === 'strike' ? 2 : 0;
    if (t.behavior === 'ranged') {
      line(b, hrx + 1, hry - 4, hrx + 2, hry - 1, '#5a3a20');
      line(b, hrx + 2, hry - 1, hrx + 1, hry + 2, '#5a3a20');
      line(b, hrx + 1, hry - 4, hrx + 1, hry + 2, '#d8d0c0');
    } else if (t.behavior === 'caster') {
      line(b, hrx + 1, hry + 2, hrx + 1, hry - 6, '#5a3a20');
      ball(b, hrx + 1, hry - 7, 1.5, 1.5, [shade(t.eye, -0.3), t.eye, mixHex(t.eye, '#ffffff', 0.5), '#ffffff'], 0.4);
    } else if (kind === 'scarecrow') {
      // A pitchfork.
      const fx = hrx + 1 + (swing > 0 ? 1 : 0);
      const top = hry - 8 + Math.max(0, swing);
      line(b, hrx + 1, hry + 2, fx, top + 2, '#8a6a3a');
      rect(b, fx - 1, top + 1, 3, 1, '#7a7a86');
      for (const dx of [-1, 0, 1]) setRGB(b, fx + dx, top, '#b8b8c4');
    } else if (kind !== 'pumpkin' || t.behavior !== 'bomber') {
      // A club (or a hay fork for pumpkins).
      line(b, hrx + 1, hry + 1, hrx + 1 + (swing > 0 ? 2 : 0), hry - 5 + Math.max(0, swing), kind === 'pumpkin' ? '#8a6a3a' : '#6a4a2a');
      setRGB(b, hrx + 1 + (swing > 0 ? 2 : 0), hry - 6 + Math.max(0, swing), kind === 'skeleton' ? BONE[2] : '#8a6a3a');
    }
  }
  const out = inkOutline(b, ink(t));
  return { buf: out, ax: cx + 1, ay: oy + fr.rows.length, mx: cx + 1, my: hy + 4 };
}

function packFrame(sheet: AnimSheet, pose: MobPose, f: number): MobFrame {
  const anim = pose === 'walk' ? sheet.anims.walk : pose === 'wind' || pose === 'strike' ? sheet.anims.attack : pose === 'idle' ? sheet.anims.idle : sheet.anims.hurt;
  const idx = anim.frames[(pose === 'wind' ? 2 : pose === 'strike' ? 5 : f) % anim.frames.length];
  // Pack animals face left; the game draws everything facing right first.
  const buf = flipX(fromIndexed(sheet.frames[idx], sheet.pal));
  return { buf, ax: sheet.w - 1 - sheet.anchor.x, ay: sheet.anchor.y, mx: sheet.w - 4, my: Math.round(sheet.h * 0.4) };
}

const CROWN = ['#6a3e0a', '#b07a18', '#e8b830', '#fff0a0'];

/** The farm's boss pig wears a little gold crown, set between its ears whichever way its head bobs. */
function crowned(m: MobFrame): MobFrame {
  const up = 5;
  const b = blank(m.buf.w, m.buf.h + up);
  blit(b, m.buf, 0, up);
  // The head is at the front (the right, after the flip); find the top of it between the ears.
  const cx = m.buf.w - 10;
  let top = m.buf.h;
  for (let x = cx - 2; x <= cx + 2; x++) for (let y = 0; y < m.buf.h; y++) if (m.buf.px[(y * m.buf.w + x) * 4 + 3]) {
    top = Math.min(top, y);
    break;
  }
  const c = blank(7, 4);
  for (const x of [0, 2, 4, 6]) setRGB(c, x, 0, CROWN[x < 3 ? 3 : 2]);
  rect(c, 0, 1, 7, 2, CROWN[2]);
  rect(c, 0, 1, 2, 2, CROWN[3]);
  rect(c, 0, 3, 7, 1, CROWN[1]);
  setRGB(c, 3, 2, '#d0283a');
  setRGB(c, 5, 2, '#3a8ad0');
  blit(b, inkOutline(c, '#140404'), cx - 4, top + up - 4);
  return { buf: b, ax: m.ax, ay: m.ay + up, mx: m.mx, my: m.my + up };
}

/** Integer upscale (bosses built on the mannequin or pack sprites are shown at twice the size). */
function scaleFrame(m: MobFrame, k: number): MobFrame {
  if (k === 1) return m;
  const b = blank(m.buf.w * k, m.buf.h * k);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const i = ((Math.floor(y / k) * m.buf.w + Math.floor(x / k)) * 4);
    b.px.set(m.buf.px.subarray(i, i + 4), (y * b.w + x) * 4);
  }
  return { buf: b, ax: m.ax * k + (k - 1), ay: m.ay * k + (k - 1), mx: m.mx * k, my: m.my * k };
}

/** A mob frame facing right. `elite` and `boss` change the size. */
export function mobFrame(t: MobType, pose: MobPose, f: number, view: View, elite: boolean, boss: boolean): MobFrame {
  const s = t.size * (elite ? 1.3 : 1) * (boss ? 1 : 1);
  switch (t.plan) {
    case 'slime':
      return slime(t, s, pose, f);
    case 'beast':
      return beast(t, s, pose, f);
    case 'flyer':
      return flyer(t, s, pose, f);
    case 'plant':
      return plant(t, s, pose, f);
    case 'golem':
      return golem(t, s, pose, f);
    case 'bug':
      return bug(t, s, pose, f);
    case 'chicken':
      return chicken(t, s, pose, f);
    case 'pig':
      return boss ? scaleFrame(crowned(packFrame(PIG, pose, f)), 2) : packFrame(PIG, pose, f);
    case 'ram':
      return scaleFrame(packFrame(RAM, pose, f), boss ? 2 : 1);
    default:
      return scaleFrame(dressed(t, 1, pose, f, view), boss ? 2 : 1);
  }
}

/** How many frames a pose cycles through. */
export function poseFrames(t: MobType, pose: MobPose): number {
  if (t.plan === 'pig' || t.plan === 'ram') return pose === 'walk' ? 4 : pose === 'idle' ? 16 : 1;
  if (t.plan === 'chicken') return pose === 'walk' ? 2 : pose === 'idle' ? 4 : 1;
  return pose === 'walk' ? 4 : pose === 'idle' ? 4 : 1;
}

export function mobFlip(b: PixelBuf): PixelBuf {
  return flipX(b);
}

export function composite(dst: PixelBuf, src: PixelBuf, x: number, y: number): void {
  blit(dst, src, x, y);
}

export { hash };
