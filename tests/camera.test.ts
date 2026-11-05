import { describe, expect, it } from 'vitest';
import { Camera, type CameraFrame } from '../src/render/camera';

const MAP = { id: 'floor' };
const base = (over: Partial<CameraFrame>): CameraFrame => ({
  dt: 1 / 60,
  map: MAP,
  mapW: 2000,
  mapH: 2000,
  viewW: 216,
  viewH: 480,
  focusX: 0.5,
  focusY: 0.5,
  lead: { uid: 1, x: 1000, y: 1000 },
  foes: [],
  ...over,
});

/** Runs a leader along `path(t)` for `secs` at frame times `dts` (cycled), returning the camera each frame. */
function run(path: (t: number) => { x: number; y: number }, secs: number, dts: number[], cam = new Camera(), uid = 1) {
  const out: Array<{ t: number; x: number; y: number }> = [];
  let t = 0;
  let i = 0;
  cam.update(base({ dt: 0, lead: { uid, ...path(0) } }));
  while (t < secs - 1e-9) {
    const dt = Math.min(dts[i++ % dts.length], secs - t);
    t += dt;
    cam.update(base({ dt, lead: { uid, ...path(t) } }));
    out.push({ t, x: cam.x, y: cam.y });
  }
  return out;
}

describe('camera', () => {
  it('snaps onto a new floor, centred on the leader', () => {
    const cam = new Camera();
    cam.update(base({ lead: { uid: 1, x: 600, y: 700 } }));
    expect(cam.x).toBeCloseTo(600 - 108, 5);
    expect(cam.y).toBeCloseTo(700 - 10 - 240, 5);
  });

  it('follows a running knight without jolts, and settles behind it smoothly', () => {
    // Run right at 45 px/s, turn down at 2 s, stop at 4 s.
    const path = (t: number) => (t < 2 ? { x: 1000 + 45 * t, y: 1000 } : t < 4 ? { x: 1090, y: 1000 + 45 * (t - 2) } : { x: 1090, y: 1090 });
    const frames = run(path, 6, [1 / 60]);
    let maxAccel = 0;
    for (let i = 2; i < frames.length; i++) {
      const [a, b, c] = [frames[i - 2], frames[i - 1], frames[i]];
      const v1 = { x: (b.x - a.x) * 60, y: (b.y - a.y) * 60 };
      const v2 = { x: (c.x - b.x) * 60, y: (c.y - b.y) * 60 };
      maxAccel = Math.max(maxAccel, Math.hypot(v2.x - v1.x, v2.y - v1.y) * 60);
    }
    // A sudden stop of a 45 px/s knight spread over the spring is a few hundred px/s²; a snap would be thousands.
    expect(maxAccel).toBeLessThan(900);
    const end = frames[frames.length - 1];
    expect(end.x).toBeCloseTo(1090 - 108, 0);
    expect(end.y).toBeCloseTo(1090 - 10 - 240, 0);
  });

  it('feels the same at 20 fps as at 144 fps', () => {
    // A knight weaving about at up to ~55 px/s (a little faster than they run).
    const path = (t: number) => ({ x: 1000 + 40 * Math.sin(t * 1.3), y: 1000 + 40 * Math.cos(t * 0.9) });
    const fast = run(path, 3, [1 / 144]);
    const slow = run(path, 3, [1 / 20]);
    const jittery = run(path, 3, [1 / 60, 1 / 30, 1 / 90, 1 / 45]);
    const at = (f: typeof fast) => f[f.length - 1];
    expect(Math.abs(at(fast).x - at(slow).x)).toBeLessThan(1.5);
    expect(Math.abs(at(fast).y - at(slow).y)).toBeLessThan(1.5);
    expect(Math.abs(at(fast).x - at(jittery).x)).toBeLessThan(1.5);
  });

  it('glides (not snaps) to another knight you take control of', () => {
    const cam = new Camera();
    cam.update(base({ lead: { uid: 1, x: 1000, y: 1000 } }));
    const start = cam.x;
    cam.update(base({ lead: { uid: 2, x: 1150, y: 1000 } }));
    expect(cam.x - start).toBeGreaterThan(0);
    expect(cam.x - start).toBeLessThan(20);
    for (let i = 0; i < 120; i++) cam.update(base({ lead: { uid: 2, x: 1150, y: 1000 } }));
    expect(cam.x).toBeCloseTo(1150 - 108, 0);
  });

  it('leans toward a fight and toward a boss, but never leaves the leader out of view', () => {
    const cam = new Camera();
    const lead = { uid: 1, x: 1000, y: 1000 };
    cam.update(base({ lead }));
    for (let i = 0; i < 240; i++) cam.update(base({ lead, foes: [{ x: 1080, y: 1000, boss: true }] }));
    const lean = cam.x - (1000 - 108);
    expect(lean).toBeGreaterThan(8);
    expect(lean).toBeLessThanOrEqual(22.01);
    // Calm mode (reduce motion) follows only.
    const calm = new Camera();
    calm.update(base({ lead }));
    for (let i = 0; i < 240; i++) calm.update(base({ lead, foes: [{ x: 1080, y: 1000, boss: true }], calm: true }));
    expect(calm.x).toBeCloseTo(1000 - 108, 3);
  });

  it('stays inside the map, and centres a map smaller than the view', () => {
    const cam = new Camera();
    for (let i = 0; i < 200; i++) cam.update(base({ lead: { uid: 1, x: 20, y: 20 } }));
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(-8);
    const small = new Camera();
    small.update(base({ mapW: 160, mapH: 300, lead: { uid: 1, x: 80, y: 150 } }));
    expect(small.x).toBe((160 - 216) / 2);
    expect(small.y).toBe((300 - 480) / 2);
  });

  it('holds still while the game is paused', () => {
    const cam = new Camera();
    cam.update(base({ lead: { uid: 1, x: 1000, y: 1000 } }));
    cam.update(base({ lead: { uid: 1, x: 1040, y: 1000 } }));
    const x = cam.x;
    cam.update(base({ dt: 0, lead: { uid: 1, x: 1040, y: 1000 } }));
    expect(cam.x).toBe(x);
  });
});
