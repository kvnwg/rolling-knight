/**
 * The Cinderwyrm as shapes, from a pose: a heavy, low body on four clawed legs, a long arched neck,
 * a big horned head with a spiked frill round its jaw (a fan of blades like a mane), a ridge of spikes
 * from its brow to the end of its tail, and wide bat wings with scalloped membranes.
 *
 * Model space is in final pixels: x forward, y to its left, z up, the ground at z = 0.
 */
import { add, cross, dot, ELL, len, lerp3, MAT, mul, norm, Prim, sub, TEX, TRI, type M3, type V3 } from './sdf';

export interface WyrmPose {
  /** The whole body moved (crouch, bob, lean). */
  body: V3;
  /** Body pitch (radians, + raises the chest) and roll. */
  pitch: number;
  roll: number;
  /** The chest filling with air, 0 to 1. */
  breathe: number;
  /** Where the head is, from its rest place (model space). */
  head: V3;
  /** Head pitch (+ lifts the snout), yaw (+ turns it to its left). */
  headPitch: number;
  headYaw: number;
  /** How far the jaw is open (radians). */
  jaw: number;
  /** The throat's fire, 0 to 1 (lights the mouth). */
  throat: number;
  /** The neck's arch: + more of an S, - straighter. */
  arch: number;
  /** Wings: 0 folded, 1 spread; raised (radians); a flap's beat (radians, + up). */
  spread: number;
  lift: number;
  flap: number;
  /** Tail: swung to the side (-1 its right .. 1 its left), raised, curled. */
  swing: number;
  tailLift: number;
  curl: number;
  /** Feet, from where they stand (x forward, z up): front left, front right, hind left, hind right. */
  feet: [V3, V3, V3, V3];
  /** Going down (death): 0 standing, 1 flat on the ground. */
  sink: number;
  /** A sweep of the tail drawn as a smear (0: none): how much of the arc, and where it ends. */
  smear: number;
}

export const REST: WyrmPose = {
  body: [0, 0, 0],
  pitch: 0,
  roll: 0,
  breathe: 0,
  head: [0, 0, 0],
  headPitch: 0,
  headYaw: 0,
  jaw: 0.26,
  throat: 0,
  arch: 0,
  spread: 0.95,
  lift: 0.1,
  flap: 0,
  swing: 0,
  tailLift: 0,
  curl: 0,
  feet: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
  sink: 0,
  smear: 0,
};

export const pose = (p: Partial<WyrmPose>): WyrmPose => ({ ...REST, ...p });

// Groups: edges between them get a line where one passes in front of another.
const G_BODY = 1;
const G_HEAD = 2;
const G_JAW = 3;
const G_LEG = 6;
const G_TAIL = 7;
const G_SPIKE = 8;
const G_HORN = 9;
const G_NECK = 10;

/** A rotation about an axis (radians), as rows. */
function axisRot(ax: V3, a: number): M3 {
  const [x, y, z] = norm(ax);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}
const rotV = (m: M3, v: V3): V3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];

function bez(p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 {
  const u = 1 - t;
  return add(add(mul(p0, u * u * u), mul(p1, 3 * u * u * t)), add(mul(p2, 3 * u * t * t), mul(p3, t * t * t)));
}

/** Two bones from `root` reaching for `target`, bending toward `hint`: the middle joint. */
function ik(root: V3, target: V3, l1: number, l2: number, hint: V3): V3 {
  const d = sub(target, root);
  const dl = Math.min(l1 + l2 - 0.01, Math.max(Math.abs(l1 - l2) + 0.01, len(d)));
  const dn = norm(d);
  const a = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // The bend direction: the hint with the reach direction taken out.
  let b = sub(hint, mul(dn, dot(hint, dn)));
  if (len(b) < 1e-6) b = [0, 0, 1];
  b = norm(b);
  return add(add(root, mul(dn, a)), mul(b, h));
}

interface Opt {
  mat?: number;
  k?: number;
  group?: number;
  tex?: number;
  texSize?: number;
  belly?: V3 | null;
  glow?: number;
}

export class Builder {
  readonly prims: Prim[] = [];

  cone(a: V3, b: V3, ra: number, rb: number, o: Opt = {}): Prim {
    const p = new Prim();
    p.a = a;
    p.b = b;
    p.ra = ra;
    p.rb = rb;
    this.opts(p, o);
    this.prims.push(p);
    return p;
  }

  /** An ellipsoid with its radii along `f` (forward), `l` (left) and `u` (up). */
  ell(c: V3, r: V3, f: V3 = [1, 0, 0], l: V3 = [0, 1, 0], u: V3 = [0, 0, 1], o: Opt = {}): Prim {
    const p = new Prim();
    p.kind = ELL;
    p.a = c;
    p.r = r;
    p.rot = [norm(f), norm(l), norm(u)];
    this.opts(p, o);
    this.prims.push(p);
    return p;
  }

  tri(a: V3, b: V3, c: V3, th: number, o: Opt = {}): Prim {
    const p = new Prim();
    p.kind = TRI;
    p.a = a;
    p.b = b;
    p.c = c;
    p.ra = th;
    this.opts(p, o);
    this.prims.push(p);
    return p;
  }

  /** A string of cones through `pts` with radii `rs` (one per point). */
  chain(pts: V3[], rs: number[], o: Opt = {}, bellyOf?: (i: number) => V3 | null): Prim[] {
    const out: Prim[] = [];
    for (let i = 0; i < pts.length - 1; i++) out.push(this.cone(pts[i], pts[i + 1], rs[i], rs[i + 1], { ...o, belly: bellyOf ? bellyOf(i) : o.belly }));
    return out;
  }

  /** A spike from `base` along `dir`, `l` long, `r` wide at the base. */
  spike(base: V3, dir: V3, l: number, r: number, o: Opt = {}): Prim {
    return this.cone(base, add(base, mul(norm(dir), l)), r, Math.max(0.22, r * 0.12), { mat: MAT.horn, group: G_SPIKE, tex: TEX.none, glow: 0.22, ...o });
  }

  private opts(p: Prim, o: Opt): void {
    p.mat = o.mat ?? MAT.scales;
    p.k = o.k ?? 0;
    p.group = o.group ?? G_BODY;
    p.tex = o.tex ?? (p.mat === MAT.scales ? TEX.scales : TEX.none);
    p.texSize = o.texSize ?? 4;
    p.belly = o.belly ?? null;
    p.glow = o.glow ?? 0;
  }
}

/**
 * The dragon in `p`, as shapes in model space.
 */
export function wyrm(p: WyrmPose, face = 0): Prim[] {
  const B = new Builder();
  const sink = p.sink;
  // The body's frame: pitched and rolled, moved, sunk toward the ground as it dies.
  const bodyRot = (v: V3): V3 => rotV(axisRot([1, 0, 0], p.roll), rotV(axisRot([0, 1, 0], -p.pitch), v));
  const lower = (v: V3): V3 => [v[0], v[1], v[2] * (1 - 0.55 * sink)];
  const B0: V3 = [-6, 0, 30];
  const T = (v: V3): V3 => add(add(B0, bodyRot(sub(lower(v), B0))), [p.body[0], p.body[1], p.body[2] - sink * 4]);
  const breathe = 1 + 0.05 * p.breathe;

  // --- Torso: a deep chest, a long belly, strong hips.
  const bellyDown: V3 = [0, 0, -1];
  B.ell(T([8, 0, 34]), [17 * breathe, 14.5 * breathe, 15.5 * breathe], [1, 0, 0], [0, 1, 0], [0, 0, 1], { k: 0, belly: bellyDown, tex: TEX.scales, texSize: 5.5 });
  B.ell(T([-10, 0, 30]), [17, 13, 12], [1, 0, 0], [0, 1, 0], [0, 0, 1], { k: 7, belly: bellyDown, tex: TEX.scales, texSize: 5.5 });
  B.ell(T([-25, 0, 31]), [12, 12, 11.5], [1, 0, 0], [0, 1, 0], [0, 0, 1], { k: 6, tex: TEX.scales, texSize: 5.5 });
  // Shoulder blades: humps that the wings grow from.
  for (const s of [1, -1]) B.ell(T([6, s * 8, 44]), [8, 6, 5], [1, 0, 0], [0, 1, 0], [0, 0, 1], { k: 5, tex: TEX.scales, texSize: 5 });

  // --- Legs. Front: shoulder, elbow back, a thick forearm, a clawed hand. Hind: thigh, knee forward, shin, ankle, foot.
  const feetRest: V3[] = [
    [21, 18, 0],
    [21, -18, 0],
    [-22, 17, 0],
    [-22, -17, 0],
  ];
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    const s = i % 2 === 0 ? 1 : -1;
    const f = p.feet[i];
    const foot: V3 = [feetRest[i][0] + f[0], feetRest[i][1] + f[1], Math.max(0, feetRest[i][2] + f[2]) + 1.6];
    const g = G_LEG;
    if (front) {
      const sh = T([11, s * 12, 33]);
      const elbow = ik(sh, add(foot, [0, 0, 3.5]), 17, 16, [-1, s * 0.75, 0]);
      const wrist = add(foot, [-1.5, 0, 3.8]);
      B.ell(sh, [9.5, 8, 11], [1, 0, 0], [0, 1, 0], [0, 0, 1], { k: 5, group: g, tex: TEX.scales, texSize: 4.5 });
      B.cone(sh, elbow, 7.6, 5.6, { k: 3, group: g, tex: TEX.scales, texSize: 4.5 });
      B.cone(elbow, wrist, 5.6, 4, { k: 2, group: g, tex: TEX.scales });
      // Elbow spur.
      B.spike(add(elbow, [-2, 0, 0]), [-1, 0, 0.4], 4, 1.4);
      hand(B, wrist, foot, s, g);
    } else {
      const hip = T([-25, s * 11, 32]);
      const ankle = add(foot, [-5, 0, 8]);
      const knee = ik(hip, ankle, 15.5, 13, [1, s * 0.45, 0.2]);
      B.ell(add(hip, [1, s * 1.5, -3]), [12, 7.5, 11.5], [1, 0, 0], [0, 1, 0], [0, 0, 1], { k: 5, group: g, tex: TEX.scales, texSize: 5 });
      B.cone(hip, knee, 8, 5.8, { k: 3, group: g, tex: TEX.scales, texSize: 4.5 });
      B.cone(knee, ankle, 5.2, 3.4, { k: 2, group: g, tex: TEX.scales });
      B.cone(ankle, add(foot, [-1, 0, 2.4]), 3.4, 3, { k: 1.5, group: g, tex: TEX.scales });
      hand(B, add(foot, [-1, 0, 2.2]), foot, s, g);
    }
  }

  // --- Neck: an arched S from the chest up to the head, plates down its front, spikes down its back.
  const neckBase = T([17, 0, 43]);
  const headRest: V3 = [34, 0, 68];
  const headAt = add(T(headRest), p.head);
  const arch = 1 + p.arch;
  const n1 = T([24, 0, 62 + 2 * p.arch]);
  const n2 = add(headAt, [-10 * arch, 0, 15 * arch]);
  const neck: V3[] = [];
  const NN = 9;
  for (let i = 0; i <= NN; i++) neck.push(bez(neckBase, n1, n2, headAt, i / NN));
  const neckR = neck.map((_, i) => 11 - (i / NN) * 3.6);
  const front = (i: number): V3 => {
    const t = norm(sub(neck[Math.min(NN, i + 1)], neck[i]));
    // The neck's front: its tangent turned down a quarter (in the plane it arches in).
    return norm([t[2], 0, -t[0]]);
  };
  B.chain(neck, neckR, { k: 3, group: G_NECK, tex: TEX.scales, texSize: 3.6 }, front);
  // A spike every segment along the back of the neck, bigger toward the shoulders.
  for (let i = 1; i < NN; i++) {
    const t = norm(sub(neck[i + 1], neck[i - 1]));
    const back = mul(front(i), -1);
    const base = add(neck[i], mul(back, neckR[i] * 0.75));
    B.spike(base, add(mul(back, 1), mul(t, -0.7)), 3.2 + (1 - i / NN) * 3.4, 1.3 + (1 - i / NN) * 0.8);
  }

  // --- Head.
  const hp = p.headPitch;
  const hy = p.headYaw;
  // The neck's last direction sets the head's natural heading; the pose turns it.
  let f = norm([1, 0, -0.62]);
  f = rotV(axisRot([0, 0, 1], hy), rotV(axisRot([0, 1, 0], -hp), f));
  const l0: V3 = norm(cross([0, 0, 1], f));
  const u = norm(cross(f, l0));
  const l = l0;
  const H = headAt;
  const HS = 1.3;
  const at = (fx: number, lx: number, ux: number): V3 => add(H, mul(add(add(mul(f, fx), mul(l, lx)), mul(u, ux)), HS));
  const R = (...r: number[]): V3 => [r[0] * HS, r[1] * HS, r[2] * HS];
  const gh = G_HEAD;
  // Skull and the long upper jaw.
  B.ell(at(5, 0, 1.2), R(8.6, 7.2, 6.6), f, l, u, { k: 2.5, group: gh, tex: TEX.scales, texSize: 3.4 });
  B.cone(at(9, 0, 0.6), at(21.5, 0, -0.6), 5.6 * HS, 3.7 * HS, { k: 3, group: gh, tex: TEX.scales, texSize: 3.2 });
  // Cheekbones: the face is broad.
  for (const s of [1, -1]) B.ell(at(6, s * 5.2, -0.6), R(5, 2.6, 3.2), f, l, u, { k: 2.5, group: gh, tex: TEX.scales, texSize: 3 });
  // The ridge down the snout and the nostrils' bumps.
  B.cone(at(11, 0, 4), at(19, 0, 2.2), 2.2 * HS, 1.3 * HS, { k: 2.5, group: gh, tex: TEX.none });
  for (const s of [1, -1]) B.ell(at(20.5, s * 2.1, 2), R(1.6, 1.2, 1.1), f, l, u, { k: 1.2, group: gh, tex: TEX.none });
  // Brows: heavy ridges slanting down to a V over the snout, over the eyes.
  for (const s of [1, -1]) {
    const inward = norm(add(add(f, mul(u, -0.5)), mul(l, -s * 0.45)));
    const bu = norm(cross(inward, norm(cross([0, 0, 1], inward))));
    B.ell(at(9.2, s * 3.9, 4.6), R(5.2, 2.2, 2.0), inward, norm(cross(bu, inward)), bu, { k: 1.6, group: gh, tex: TEX.none });
    // Eyes: set forward under the brow, glowing.
    const ef = norm(add(f, mul(l, s * 0.55)));
    B.ell(at(11, s * 3.9, 2.7), R(1.25, 1.7, 1.15), ef, norm(cross([0, 0, 1], ef)), u, { mat: MAT.eyes, group: gh, glow: 1 });
  }
  // The lower jaw, hinged under the skull.
  const hinge = at(3.5, 0, -3.4);
  const JS = HS;
  const j = norm(add(mul(f, Math.cos(p.jaw)), mul(u, -Math.sin(p.jaw))));
  const ju = norm(cross(j, l));
  const jat = (jx: number, lx: number, ux: number): V3 => add(hinge, mul(add(add(mul(j, jx), mul(l, lx)), mul(ju, ux)), JS));
  B.cone(jat(0, 0, 0), jat(17.5, 0, 0.2), 4.9 * JS, 2.7 * JS, { k: 2, group: G_JAW, tex: TEX.plates, texSize: 2.8, belly: mul(ju, -1) });
  // The jaw's corner, under the ear.
  for (const s of [1, -1]) B.ell(jat(1.5, s * 3.4, 0.5), R(3.8, 2.3, 3.5), j, l, ju, { k: 2, group: G_JAW, tex: TEX.scales, texSize: 3 });
  // Inside the mouth: dark, lit by the fire in its throat.
  const open = Math.max(0, p.jaw);
  if (open > 0.06) {
    const mid = norm(add(f, j));
    const mu = norm(cross(mid, l));
    const depth = Math.sin(open) * 8;
    B.ell(add(at(4, 0, -1.6), mul(mid, 7.5 * HS)), [9 * HS, 3.3 * HS, Math.max(0.6, depth * 0.55 * HS)], mid, l, mu, { mat: MAT.mouth, group: G_JAW, tex: TEX.none, glow: Math.max(0.25, p.throat) });
  }
  // Teeth: a row down each side of both jaws, and two long fangs that show even when it's shut.
  for (const s of [1, -1]) {
    for (let k = 0; k < 4; k++) {
      const q = k / 3;
      const base = at(11 + q * 9.5, s * (3.7 - q * 1.2), -3.2 + q * 0.8);
      B.cone(base, add(base, mul(u, (-1.9 - (k === 3 ? 0.8 : 0)) * HS)), 0.85, 0.24, { mat: MAT.teeth, group: gh, tex: TEX.none });
      const lb = jat(6 + q * 9.5, s * (3.2 - q * 1.1), 2.0 - q * 0.6);
      B.cone(lb, add(lb, mul(ju, 1.8 * HS)), 0.8, 0.24, { mat: MAT.teeth, group: G_JAW, tex: TEX.none });
    }
    const fang = at(19.5, s * 2.5, -2.6);
    B.cone(fang, add(fang, mul(norm(add(mul(u, -1), mul(f, 0.15))), 5 * HS)), 1.05, 0.26, { mat: MAT.teeth, group: gh, tex: TEX.none });
  }
  // Horns: two great ones swept back from the crown, ringed; two short ones lower down.
  for (const s of [1, -1]) {
    const b0 = at(4.5, s * 3.8, 5.6);
    const hp0 = add(b0, mul(add(mul(f, -6), add(mul(u, 5), mul(l, s * 3))), HS));
    const hp1 = add(b0, mul(add(mul(f, -15), add(mul(u, 6.5), mul(l, s * 6.5))), HS));
    const hp2 = add(b0, mul(add(mul(f, -23), add(mul(u, 3), mul(l, s * 8))), HS));
    const pts: V3[] = [];
    for (let i = 0; i <= 7; i++) pts.push(bez(b0, hp0, hp1, hp2, i / 7));
    B.chain(pts, [3.4, 3, 2.6, 2.2, 1.8, 1.35, 0.9, 0.4], { mat: MAT.horn, group: G_HORN, tex: TEX.rings, texSize: 2.6 });
    const c0 = at(1.5, s * 5.6, 1.2);
    const cp: V3[] = [];
    for (let i = 0; i <= 3; i++) cp.push(bez(c0, add(c0, mul(add(mul(f, -4), mul(l, s * 2.2)), HS)), add(c0, mul(add(mul(f, -8), add(mul(l, s * 3.2), mul(u, -0.5))), HS)), add(c0, mul(add(mul(f, -12), add(mul(l, s * 3.4), mul(u, -1.5))), HS)), i / 3));
    B.chain(cp, [2.2, 1.6, 1.0, 0.35], { mat: MAT.horn, group: G_HORN, tex: TEX.rings, texSize: 2.2 });
  }
  // The frill: a fan of blades from each cheek, like a mane round the face.
  for (const s of [1, -1]) {
    const base = at(2.2, s * 5.4, -1.4);
    const out = norm(add(mul(f, -0.55), mul(l, s * 1)));
    const blades = [
      { a: -1.15, l: 8 },
      { a: -0.7, l: 12 },
      { a: -0.25, l: 15 },
      { a: 0.2, l: 16 },
      { a: 0.62, l: 13.5 },
      { a: 1.02, l: 9.5 },
    ];
    for (const bl of blades) {
      const dir = norm(add(mul(out, Math.cos(bl.a)), mul(u, Math.sin(bl.a))));
      B.spike(add(base, mul(dir, 1.5)), dir, bl.l, 2.1, { group: G_SPIKE });
    }
  }
  // A crest down the middle of the skull.
  [
    [7, 5.8, 3],
    [3.5, 7.2, 4],
    [0, 6.8, 3.6],
  ].forEach(([fx, ux, ln]) => B.spike(at(fx, 0, ux - 1.2), add(mul(u, 1), mul(f, -0.8)), ln * HS, 1.3));
  // A beard of short spikes under the chin.
  for (const s of [1, -1]) B.spike(jat(9, s * 1.6, -2.2), add(mul(ju, -1), mul(j, -0.6)), 4, 1.1);

  // --- Back ridge: spikes from the shoulders to the hips.
  for (let i = 0; i < 6; i++) {
    const q = i / 5;
    const base = T([12 - q * 38, 0, 45 - q * 6 - Math.sin(q * Math.PI) * 0]);
    B.spike(base, [-0.55, 0, 1], 6 - q * 2, 2 - q * 0.6);
  }

  // --- Tail: from the hips back and round to its right, thick to thin, spikes down it, a blade at the end.
  const tailAt = (swing: number, tl: number, curl: number): [V3, V3, V3, V3] => [
    T([-33, 0, 30]),
    T([-52, 0, 20 + tl * 6]),
    [-58 + curl * 8 + p.body[0], -24 * (1 - swing) + 26 * swing + p.body[1], 4 + tl * 14],
    [-26 + curl * 14 + p.body[0] + 8 * Math.abs(swing), -44 * (1 - Math.max(0, swing)) + 44 * Math.max(0, swing) + p.body[1], 3 + tl * 10],
  ];
  const [t0, t1, t2, t3] = tailAt(p.swing, p.tailLift, p.curl);
  const tail: V3[] = [];
  const TN = 12;
  for (let i = 0; i <= TN; i++) tail.push(bez(t0, t1, t2, t3, i / TN));
  const tailR = tail.map((_, i) => 10.5 * Math.pow(1 - i / TN, 0.85) + 1.2);
  B.chain(tail, tailR, { k: 2.5, group: G_TAIL, tex: TEX.scales, texSize: 3.6 }, () => [0, 0, -1]);
  for (let i = 1; i < TN; i++) {
    const tdir = norm(sub(tail[i + 1], tail[i - 1]));
    const up: V3 = norm(sub([0, 0, 1], mul(tdir, tdir[2])));
    const base = add(tail[i], mul(up, tailR[i] * 0.7));
    B.spike(base, add(up, mul(tdir, -0.8)), 2.4 + tailR[i] * 0.45, 0.9 + tailR[i] * 0.12);
  }
  // The blade at the tip: a flat spade and two barbs.
  {
    const tip = tail[TN];
    const td = norm(sub(tail[TN], tail[TN - 2]));
    const side = norm(cross([0, 0, 1], td));
    B.ell(add(tip, mul(td, 3.5)), [5.5, 4.2, 1.1], td, side, [0, 0, 1], { mat: MAT.horn, group: G_SPIKE, tex: TEX.none });
    for (const s of [1, -1]) B.spike(add(tip, mul(side, s * 2)), add(mul(td, -0.6), mul(side, s)), 4, 1);
  }

  // A lashing tail leaves a smear: pale arcs along where its blade and its middle swept.
  if (p.smear > 0) {
    const from = -1.25;
    const steps = 7;
    for (const along of [1, 0.72]) {
      const pts: V3[] = [];
      for (let k = 0; k <= steps; k++) {
        const sw = from + (p.swing - from) * (k / steps);
        const [a0, a1, a2, a3] = tailAt(sw, p.tailLift, p.curl);
        pts.push(bez(a0, a1, a2, a3, along));
      }
      const keep = Math.max(2, Math.round((steps + 1) * p.smear));
      const arc = pts.slice(pts.length - keep);
      for (let k = 0; k < arc.length - 1; k++) {
        const q = (k + 1) / arc.length;
        B.cone(arc[k], arc[k + 1], 0.6 + q * (along === 1 ? 2.2 : 1.4), 0.6 + q * (along === 1 ? 2.4 : 1.6), { mat: MAT.trail, group: 11, tex: TEX.none });
      }
    }
  }

  // --- Wings.
  for (const s of [1, -1]) wing(B, p, s, T, face);

  return B.prims;
}

/** A clawed foot: a pad on the ground and three hooked claws (and a dewclaw behind). */
function hand(B: Builder, wrist: V3, foot: V3, s: number, g: number): void {
  B.ell(foot, [6, 4.8, 2.7], [1, 0, 0], [0, 1, 0], [0, 0, 1], { k: 2.5, group: g, tex: TEX.scales, texSize: 2.8 });
  B.cone(wrist, foot, 3.8, 3.2, { k: 2, group: g, tex: TEX.scales });
  for (let c = -1; c <= 1; c++) {
    const base = add(foot, [4.8, c * 2.8 + s * 0.3, 0.2]);
    B.spike(base, [1, c * 0.4, -0.5], 4.2, 1.15, { group: g });
  }
  B.spike(add(foot, [-4, 0, 0.4]), [-1, 0, -0.3], 2.4, 0.8, { group: g });
}

/** A bat wing on side `s` (1 its left): arm, thumb claw, four fingers, scalloped membranes. */
function wing(B: Builder, p: WyrmPose, s: number, T: (v: V3) => V3, face: number): void {
  const g = s > 0 ? 6 + 0 : 7;
  const grp = s > 0 ? 4 : 5;
  const root = T([5, s * 7.5, 44]);
  // The spread and folded shapes (relative to the root, for the left wing); y mirrors for the right.
  // Spread, as seen from the side (swept back, so the membranes show from the side) and from the
  // front (mantled out to the sides, so they show from the front). Each facing draws its own.
  const SIDE: Record<string, V3> = {
    elbow: [-6, 16, 18],
    wrist: [-4, 30, 36],
    f1: [-20, 58, 50],
    f2: [-38, 58, 30],
    f3: [-50, 44, 10],
    f4: [-48, 24, -4],
    attach: [-34, 4, -8],
  };
  const FRONT: Record<string, V3> = {
    elbow: [-2, 18, 16],
    wrist: [2, 31, 34],
    f1: [-4, 62, 48],
    f2: [-11, 66, 24],
    f3: [-16, 55, 2],
    f4: [-19, 33, -10],
    attach: [-30, 4, -8],
  };
  const SPREAD: Record<string, V3> = Object.fromEntries(Object.keys(SIDE).map((k) => [k, lerp3(SIDE[k], FRONT[k], face)]));
  const FOLDED: Record<string, V3> = {
    elbow: [-8, 9, 9],
    wrist: [-3, 12, 20],
    f1: [-30, 15, 26],
    f2: [-36, 14, 16],
    f3: [-40, 12, 8],
    f4: [-36, 9, 1],
    attach: [-34, 4, -8],
  };
  const sp = Math.max(0, Math.min(1.15, p.spread));
  const lift = p.lift + p.flap;
  // Raising turns the wing about the root along the body's length (outer parts go up).
  const R = axisRot([1, 0, 0], s * lift);
  const P = (k: string): V3 => {
    const v = lerp3(FOLDED[k], SPREAD[k], sp);
    const m: V3 = [v[0], v[1] * s, v[2]];
    return T(add([5, s * 7.5, 44], rotV(R, m)));
  };
  void g;
  const elbow = P('elbow');
  const wrist = P('wrist');
  const fs = ['f1', 'f2', 'f3', 'f4'].map(P);
  const attach = P('attach');
  const o = { group: grp, tex: TEX.none };
  B.cone(root, elbow, 3.4, 2.7, { ...o, k: 2, tex: TEX.scales, texSize: 3 });
  B.cone(elbow, wrist, 2.7, 2, { ...o, k: 1.5, tex: TEX.scales, texSize: 3 });
  B.ell(wrist, [2.6, 2.6, 2.6], [1, 0, 0], [0, 1, 0], [0, 0, 1], { ...o, k: 1 });
  // The thumb: a hooked claw at the wrist, pointing up and forward.
  B.spike(wrist, add(norm(sub(wrist, elbow)), [0.4, 0, 0.9]), 5.5, 1.5, { group: grp });
  fs.forEach((tip, i) => B.cone(wrist, tip, 1.75 - i * 0.12, 0.5, { ...o, k: 0.8, tex: TEX.none }));
  // Membranes: wrist to each pair of fingers, the last finger to the body, the root to the wrist.
  const th = 0.6;
  const panel = (a: V3, b: V3, c: V3, bite: boolean): void => {
    const pr = B.tri(a, b, c, th, { mat: MAT.membrane, group: grp, tex: TEX.veins, texSize: 5 });
    if (bite) {
      // Scallop the free edge (b to c): a round bite out of its middle.
      const mid = lerp3(b, c, 0.5);
      const e = len(sub(c, b));
      const away = norm(sub(mid, a));
      pr.biteR = e * 0.62;
      pr.biteC = add(mid, mul(away, e * 0.62 - e * 0.13));
    }
  };
  panel(wrist, fs[0], fs[1], true);
  panel(wrist, fs[1], fs[2], true);
  panel(wrist, fs[2], fs[3], true);
  panel(wrist, fs[3], attach, true);
  panel(root, elbow, wrist, false);
  panel(root, wrist, attach, false);
}
