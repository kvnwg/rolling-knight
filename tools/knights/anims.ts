/**
 * The knights' animations as timelines of poses: the same names, phases, events and timing the game
 * reads (src/render/pf/heroAnim.ts), drawn the same way for every facing (each class's kit decides
 * what a pose looks like from each side).
 *
 * Loose parts trail the body: a frame's `lag` is filled in from how the body moved since the last
 * frame (it moved down, so the crest is a pixel high; it rose, so the crest hangs a pixel low) unless
 * the frame sets its own.
 */
import { pose, type Pose } from './rig';

export interface AnimFrame {
  p: Pose;
  ms: number;
}

export interface Anim {
  loop: boolean;
  frames: AnimFrame[];
  phases?: string;
  events?: Array<[number, string, string?]>;
  stride?: number[];
  loopFrames?: number[];
  /** Directions drawn (default all four). */
  dirs?: Array<'s' | 'e' | 'n' | 'w'>;
}

type F = [Partial<Pose>, number];

function anim(loop: boolean, frames: F[], extra: Omit<Anim, 'loop' | 'frames'> = {}): Anim {
  const out: AnimFrame[] = frames.map(([p, ms]) => ({ p: pose(p), ms }));
  // Loose parts lag a frame behind the body (unless a frame says otherwise).
  out.forEach((f, i) => {
    const given = frames[i][0].lag;
    if (given) return;
    const prev = i > 0 ? out[i - 1].p : loop ? out[out.length - 1].p : f.p;
    const dy = f.p.by + f.p.whole[1] - (prev.by + prev.whole[1]);
    const dx = f.p.bx + f.p.whole[0] - (prev.bx + prev.whole[0]);
    f.p.lag = [-Math.max(-1, Math.min(1, dx)), -Math.max(-1, Math.min(1, dy))];
  });
  return { loop, frames: out, ...extra };
}

export interface ClassMoves {
  /** The class's attacks and dodge, as anims keyed by the names heroAnim plays. */
  extra: Record<string, Anim>;
  /** Weapon pose names for the shared anims. */
  rest?: string;
  ready?: string;
  /** Leg pose for the combat stance. */
  stance?: string;
}

/** Breathing: the body settles a pixel and rises, the loose parts a frame behind. */
export function idle(): Anim {
  return anim(true, [
    [{}, 450],
    [{ by: 1 }, 150],
    [{ by: 1 }, 450],
    [{}, 150],
  ]);
}

export function blink(): Anim {
  return anim(false, [[{ face: 'blink', lag: [0, 0] }, 100]], { dirs: ['s', 'e', 'w'] });
}

/**
 * Six steps, two strides: contact (down), passing (up) on each foot. The planted foot carries the
 * body 2 px a frame, so `stride` is 2 for each.
 */
export function walk(): Anim {
  const legs = ['w0', 'w1', 'w2', 'w3', 'w4', 'w5'];
  const bob = [1, 0, -1, 1, 0, -1];
  return anim(
    true,
    legs.map((l, i): F => [{ legs: l, by: bob[i], wpn: i < 3 ? 'walkA' : 'walkB', off: i < 3 ? 'walkB' : 'walkA', flutter: 1 + (i % 3) }, 100]),
    { stride: [2, 2, 2, 2, 2, 2] },
  );
}

export function combatIdle(): Anim {
  return anim(true, [
    [{ legs: 'wide', wpn: 'ready', off: 'ready', face: 'focus' }, 300],
    [{ legs: 'wide', by: 1, wpn: 'ready', off: 'ready', face: 'focus' }, 150],
    [{ legs: 'wide', by: 1, wpn: 'ready', off: 'ready', face: 'focus' }, 300],
    [{ legs: 'wide', wpn: 'ready', off: 'ready', face: 'focus' }, 150],
  ]);
}

/** Wind up (crouch, weapon back), strike (a smear), follow through, settle. Hit on frame 2. */
export function slash(): Anim {
  return anim(
    false,
    [
      [{ legs: 'wide', by: 1, bx: -1, wpn: 'windup', off: 'ready', face: 'focus' }, 120],
      [{ legs: 'wide', by: 0, bx: -1, wpn: 'high', off: 'ready', face: 'focus' }, 80],
      [{ legs: 'lunge', by: 1, bx: 1, wpn: 'strike', off: 'ready', smear: 'slash', face: 'focus' }, 60],
      [{ legs: 'lunge', by: 1, bx: 1, wpn: 'follow', off: 'ready', face: 'focus' }, 140],
      [{ legs: 'wide', wpn: 'ready', off: 'ready', face: 'focus' }, 160],
    ],
    { phases: 'wwarr', events: [[0, 'windup'], [2, 'hit', 'spark_small'], [4, 'recover']] },
  );
}

/** The overhead smash: crouch, rise with the weapon high, hold, smash (hit), impact squash, hold, rise. */
export function heavy(): Anim {
  return anim(
    false,
    [
      [{ legs: 'crouch', by: 2, wpn: 'windup', off: 'ready', face: 'focus' }, 140],
      [{ legs: 'stand', by: -1, wpn: 'overhead', off: 'low', face: 'focus' }, 120],
      [{ legs: 'stand', by: -1, wpn: 'overhead', off: 'low', face: 'focus', lag: [0, 1] }, 80],
      [{ legs: 'lunge', by: 1, bx: 1, wpn: 'smash', off: 'low', smear: 'smash', face: 'shut' }, 50],
      [{ legs: 'crouch', by: 2, bx: 1, wpn: 'ground', off: 'low', face: 'shut' }, 60],
      [{ legs: 'crouch', by: 2, bx: 1, wpn: 'ground', off: 'low', face: 'focus', lag: [0, 0] }, 160],
      [{ legs: 'wide', wpn: 'ready', off: 'ready', face: 'focus' }, 200],
    ],
    { phases: 'wwwaarr', events: [[0, 'windup'], [3, 'hit', 'spark_small'], [4, 'vfx', 'impact_big'], [6, 'recover']] },
  );
}

/** A quick tuck and tumble: crouch, three quarter turns, a squashed landing. */
export function roll(): Anim {
  return anim(
    false,
    [
      [{ legs: 'crouch', by: 2, wpn: 'tuck', off: 'tuck', face: 'shut' }, 50],
      [{ legs: 'tuck', by: 3, wpn: 'tuck', off: 'tuck', face: 'shut', rot: 1, shadow: 0.8 }, 70],
      [{ legs: 'tuck', by: 3, wpn: 'tuck', off: 'tuck', face: 'shut', rot: 2, shadow: 0.8 }, 70],
      [{ legs: 'tuck', by: 3, wpn: 'tuck', off: 'tuck', face: 'shut', rot: 3, shadow: 0.8 }, 70],
      [{ legs: 'crouch', by: 2, wpn: 'ready', off: 'ready', face: 'focus' }, 60],
    ],
    { events: [[0, 'vfx', 'dust_puff']] },
  );
}

export function hurt(): Anim {
  return anim(false, [
    [{ legs: 'stand', bx: -1, by: 1, hx: -1, wpn: 'hurt', off: 'hurt', face: 'hurt' }, 80],
    [{ legs: 'stand', bx: -1, by: 0, wpn: 'hurt', off: 'hurt', face: 'hurt' }, 120],
    [{ legs: 'wide', wpn: 'ready', off: 'ready', face: 'focus' }, 140],
  ]);
}

/** Dazed: the head wobbles one way, the body the other, the arms hang. */
export function stun(): Anim {
  return anim(true, [
    [{ legs: 'stand', by: 1, hx: -1, wpn: 'limp', off: 'limp', face: 'stun' }, 150],
    [{ legs: 'stand', by: 1, wpn: 'limp', off: 'limp', face: 'stun' }, 150],
    [{ legs: 'stand', by: 1, hx: 1, bx: 1, wpn: 'limp', off: 'limp', face: 'stun' }, 150],
    [{ legs: 'stand', by: 1, wpn: 'limp', off: 'limp', face: 'stun' }, 150],
  ]);
}

/** Struck, buckling, falling, down (held long). Played backward, it stands back up. */
export function death(): Anim {
  return anim(false, [
    [{ legs: 'stand', bx: -1, by: 1, hx: -1, wpn: 'hurt', off: 'hurt', face: 'hurt' }, 80],
    [{ legs: 'kneel', by: 4, wpn: 'drop', off: 'drop', face: 'ko' }, 140],
    [{ legs: 'kneel', by: 4, wpn: 'drop', off: 'drop', face: 'ko', rot: 1, tag: 'falling' }, 140],
    [{ legs: 'stand', wpn: 'drop', off: 'drop', face: 'ko', rot: 1, tag: 'lying' }, 160],
    [{ legs: 'stand', wpn: 'drop', off: 'drop', face: 'ko', rot: 1, tag: 'lying', lag: [0, 0] }, 600],
  ]);
}

/** A cheer: weapon up, a hop, a squashed landing, the pose held. */
export function victory(): Anim {
  return anim(true, [
    [{ legs: 'crouch', by: 2, wpn: 'cheerLow', off: 'ready', face: 'joy' }, 200],
    [{ legs: 'air', whole: [0, -4], wpn: 'cheer', off: 'cheer', face: 'joy', shadow: 0.7 }, 150],
    [{ legs: 'crouch', by: 2, wpn: 'cheer', off: 'cheer', face: 'joy' }, 200],
    [{ legs: 'stand', wpn: 'cheer', off: 'cheer', face: 'joy' }, 300],
  ]);
}

export { anim };
