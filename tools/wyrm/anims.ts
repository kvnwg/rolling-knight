/**
 * The Cinderwyrm's animations: the names, frame counts, timings, phases and events the game reads
 * (src/render/pf/mobAnim.ts's cinderwyrm kit and WYRM_ANIM), each frame a pose of the model.
 *
 * Frames are listed once by key and referred to by key in the clips, so a clip can reuse another's
 * (the attacks end on the idle's first frame, the death starts on the hurt's).
 */
import { pose, type WyrmPose } from './model';
import type { V3 } from './sdf';

export interface ClipFrame {
  key: string;
  ms: number;
}

export interface Clip {
  loop: boolean;
  frames: ClipFrame[];
  phases?: string;
  events?: Array<[number, string, string?]>;
  loopFrames?: number[];
}

const Z: V3 = [0, 0, 0];

/** A quadruped's walk: diagonal pairs swing together; the body bobs twice a cycle. */
function walkPose(k: number, n: number): WyrmPose {
  const phase = k / n;
  const A = 7;
  const offs = [0, 0.5, 0.5, 0];
  const feet = offs.map((o) => {
    const s = (phase + o) % 1;
    if (s < 0.5) return [A - (s / 0.5) * 2 * A, 0, 0] as V3;
    const q = (s - 0.5) / 0.5;
    return [-A + q * 2 * A, 0, Math.sin(q * Math.PI) * 5] as V3;
  }) as [V3, V3, V3, V3];
  const bob = Math.cos(phase * Math.PI * 4);
  return pose({
    feet,
    body: [0, 0, -0.8 + bob * 0.9],
    roll: Math.sin(phase * Math.PI * 2) * 0.03,
    head: [0, Math.sin(phase * Math.PI * 2) * 1.2, -bob * 0.6],
    swing: Math.sin(phase * Math.PI * 2 + 1) * 0.18,
    spread: 0.55,
    lift: 0.05,
    flap: Math.sin(phase * Math.PI * 4) * 0.03,
    jaw: 0.2,
  });
}

/** Every distinct pose, by key. */
export const FRAMES: Record<string, WyrmPose> = {
  // Idle: a slow breath; the wings shift with it.
  i0: pose({ breathe: 0 }),
  i1: pose({ breathe: 0.5, head: [0, 0, 0.6], lift: 0.12 }),
  i2: pose({ breathe: 1, head: [0, 0, 1.2], lift: 0.14, jaw: 0.3 }),
  i3: pose({ breathe: 0.5, head: [0, 0, 0.6], lift: 0.12 }),
  // Combat stance: lower, head forward, the jaw open on a growl, the wings up.
  c0: pose({ body: [1, 0, -1.5], head: [4, 0, -4], jaw: 0.42, spread: 1, lift: 0.2, throat: 0.25, breathe: 0.2 }),
  c1: pose({ body: [1, 0, -1.8], head: [4, 0, -4.6], jaw: 0.46, spread: 1, lift: 0.22, throat: 0.3, breathe: 0.6 }),
  c2: pose({ body: [1, 0, -2], head: [4, 0, -5], jaw: 0.5, spread: 1.02, lift: 0.24, throat: 0.38, breathe: 1 }),
  c3: pose({ body: [1, 0, -1.8], head: [4, 0, -4.6], jaw: 0.46, spread: 1, lift: 0.22, throat: 0.3, breathe: 0.6 }),
  // Bite: rear back with the jaws wide, then strike down and forward and snap.
  b0: pose({ pitch: 0.06, head: [-8, 0, 6], headPitch: 0.25, jaw: 0.55, spread: 1, lift: 0.22 }),
  b1: pose({ pitch: 0.1, body: [-2, 0, 0], head: [-12, 0, 9], headPitch: 0.4, jaw: 0.9, spread: 1.05, lift: 0.28, throat: 0.3 }),
  b2: pose({ pitch: -0.1, body: [6, 0, -2], head: [17, 0, -16], headPitch: -0.2, jaw: 0.12, spread: 0.9, lift: 0.05 }),
  b3: pose({ pitch: -0.08, body: [5, 0, -2], head: [14, 0, -14], headPitch: -0.15, jaw: 0.04, spread: 0.9, lift: 0.08 }),
  b4: pose({ pitch: -0.02, body: [2, 0, -1], head: [5, 0, -5], jaw: 0.22, spread: 0.92, lift: 0.1 }),
  // Tail sweep: coil it round to one side, looking back over a shoulder; then lash it across.
  t0: pose({ roll: -0.05, swing: -0.9, curl: 0.4, tailLift: 0.3, headYaw: -0.45, head: [-2, -4, 0], spread: 0.9, lift: 0.15 }),
  t1: pose({ roll: -0.08, body: [0, 0, -1.5], swing: -1.25, curl: 0.6, tailLift: 0.45, headYaw: -0.6, head: [-3, -6, -1], spread: 0.95, lift: 0.2 }),
  t2: pose({ roll: 0.08, swing: 1.1, curl: 0.2, tailLift: 0.35, headYaw: 0.35, head: [0, 4, -2], spread: 1, lift: 0.18, smear: 1 }),
  t3: pose({ roll: 0.05, swing: 1.25, curl: 0.3, tailLift: 0.2, headYaw: 0.2, head: [0, 3, -1], spread: 0.95, lift: 0.14, smear: 0.5 }),
  // Fire breath: rear up and draw breath (the throat kindling), then thrust the head down and pour.
  f0: pose({ pitch: 0.08, breathe: 1, head: [-6, 0, 9], headPitch: 0.45, jaw: 0.3, throat: 0.5, spread: 1, lift: 0.25 }),
  f1: pose({ pitch: 0.12, breathe: 1, body: [-2, 0, 0], head: [-9, 0, 12], headPitch: 0.6, jaw: 0.5, throat: 0.85, spread: 1.05, lift: 0.3 }),
  f2: pose({ pitch: -0.06, breathe: 0.2, body: [4, 0, -1], head: [13, 0, -9], headPitch: -0.05, jaw: 1.0, throat: 1, spread: 1, lift: 0.14 }),
  f3: pose({ pitch: -0.05, breathe: 0, body: [3, 0, -1], head: [11, 0, -8], headPitch: -0.05, jaw: 0.9, throat: 0.75, spread: 1, lift: 0.12 }),
  f4: pose({ pitch: 0, body: [1, 0, 0], head: [3, 0, -2], jaw: 0.4, throat: 0.25, spread: 0.95, lift: 0.1 }),
  // Roar: rear, wings flung wide and high, head thrown up, jaws wide.
  r0: pose({ pitch: 0.12, head: [-4, 0, 11], headPitch: 0.7, jaw: 0.6, spread: 1.1, lift: 0.36, throat: 0.4, breathe: 1 }),
  r1: pose({ pitch: 0.16, body: [-1, 0, 1], head: [-3, 0, 14], headPitch: 0.95, jaw: 1.05, spread: 1.15, lift: 0.46, throat: 0.6, breathe: 1 }),
  r2: pose({ pitch: 0.05, head: [0, 0, 5], headPitch: 0.25, jaw: 0.45, spread: 1.05, lift: 0.28, throat: 0.25 }),
  // Hurt: a recoil, jaws open, wings flinching in.
  h0: pose({ body: [-3, 0, 0], pitch: 0.05, head: [-7, 0, 4], headPitch: 0.35, jaw: 0.75, spread: 0.75, lift: -0.05 }),
  h1: pose({ body: [-1, 0, 0], head: [-3, 0, 2], headPitch: 0.15, jaw: 0.4, spread: 0.85, lift: 0.05 }),
  // Death: it staggers, sinks, the head comes down to the ground, the wings fall over it.
  d1: pose({ sink: 0.2, body: [-2, 0, 0], head: [2, 0, -10], headPitch: -0.35, jaw: 0.5, spread: 0.7, lift: -0.15, roll: 0.04 }),
  d2: pose({ sink: 0.5, body: [-1, 0, 0], head: [6, 0, -24], headPitch: -0.3, jaw: 0.6, spread: 0.6, lift: -0.3, roll: 0.08, swing: 0.2 }),
  d3: pose({ sink: 0.82, head: [5, 0, -35], headPitch: -0.15, jaw: 0.45, spread: 0.55, lift: -0.45, roll: 0.12, swing: 0.3 }),
  d4: pose({ sink: 1, head: [6, 0, -40], headPitch: -0.05, jaw: 0.3, spread: 0.5, lift: -0.55, roll: 0.14, swing: 0.35 }),
};
for (let k = 0; k < 6; k++) FRAMES[`w${k}`] = walkPose(k, 6);

void Z;

const f = (key: string, ms: number): ClipFrame => ({ key, ms });

export const CLIPS: Record<string, Clip> = {
  idle: { loop: true, frames: [f('i0', 520), f('i1', 280), f('i2', 520), f('i3', 280)] },
  walk: {
    loop: true,
    frames: [0, 1, 2, 3, 4, 5].map((k) => f(`w${k}`, 260)),
    events: [
      [0, 'footstep', 'dust_puff'],
      [3, 'footstep', 'dust_puff'],
    ],
  },
  combat_idle: { loop: true, frames: [f('c0', 520), f('c1', 280), f('c2', 520), f('c3', 280)] },
  attack_bite: {
    loop: false,
    frames: [f('b0', 484), f('b1', 572), f('b2', 60), f('b3', 110), f('b4', 220), f('i0', 240)],
    phases: 'wwaarr',
    events: [
      [0, 'windup'],
      [2, 'hit', 'spark_small'],
      [2, 'vfx', 'impact_big'],
      [5, 'recover'],
    ],
  },
  attack_tail: {
    loop: false,
    frames: [f('t0', 484), f('t1', 660), f('t2', 60), f('t3', 110), f('i1', 240), f('i0', 220)],
    phases: 'wwaarr',
    events: [
      [0, 'windup'],
      [2, 'hit', 'spark_small'],
      [2, 'vfx', 'impact_big'],
      [5, 'recover'],
    ],
  },
  breath: {
    loop: false,
    frames: [f('f0', 572), f('f1', 924), f('f2', 110), f('f3', 150), f('f4', 260), f('i0', 220)],
    phases: 'wwaarr',
    events: [
      [0, 'windup'],
      [1, 'vfx', 'gather_glow_fire'],
      [2, 'spawn', 'fireball'],
      [5, 'recover'],
    ],
    loopFrames: [1],
  },
  roar: { loop: false, frames: [f('r0', 528), f('r1', 520), f('r1', 320), f('r2', 300)], events: [[1, 'vfx', 'sound_rings']] },
  hurt: { loop: false, frames: [f('h0', 80), f('h1', 160), f('i0', 180)] },
  death: {
    loop: false,
    frames: [f('h0', 100), f('d1', 220), f('d2', 260), f('d3', 320), f('d4', 700)],
    events: [
      [3, 'vfx', 'dust_puff'],
      [4, 'vfx', 'poof_smoke'],
    ],
  },
};
