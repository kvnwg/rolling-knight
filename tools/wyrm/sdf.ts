/**
 * The dragon's body as signed distance shapes (round cones, ellipsoids, thin triangles for the wing
 * membranes), and an orthographic ray marcher over them that tells, per sample, what was hit, where,
 * which way it faces, how much light reaches it and how deep it is.
 *
 * Everything here works in camera space: x right, y down the screen, z away from the eye. The scene
 * is binned in screen tiles (rays are parallel), and again in tiles across the light (for shadows),
 * so a ray only tests the shapes that can touch it.
 */

export type V3 = [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A 3x3 rotation as rows. */
export type M3 = [V3, V3, V3];
export const mv = (m: M3, v: V3): V3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
export const mm = (a: M3, b: M3): M3 => {
  const bt: M3 = [
    [b[0][0], b[1][0], b[2][0]],
    [b[0][1], b[1][1], b[2][1]],
    [b[0][2], b[1][2], b[2][2]],
  ];
  return [
    [dot(a[0], bt[0]), dot(a[0], bt[1]), dot(a[0], bt[2])],
    [dot(a[1], bt[0]), dot(a[1], bt[1]), dot(a[1], bt[2])],
    [dot(a[2], bt[0]), dot(a[2], bt[1]), dot(a[2], bt[2])],
  ];
};
export const transpose = (m: M3): M3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];

/** Kinds of shape. */
export const CONE = 0;
export const ELL = 1;
export const TRI = 2;

/** What a shape is made of (its texture is chosen by the material too). */
export const MAT = { none: 0, scales: 1, belly: 2, horn: 3, membrane: 4, teeth: 5, mouth: 6, eyes: 7, trail: 8 } as const;
export type MatId = (typeof MAT)[keyof typeof MAT];

/** Surface patterns. */
export const TEX = { none: 0, scales: 1, plates: 2, rings: 3, veins: 4 } as const;

/**
 * One shape. Built in model space by the model, then placed in camera space (`place`), which also
 * fills in the bound and the precomputed terms the distance function uses.
 */
export class Prim {
  kind = CONE;
  mat: number = MAT.scales;
  /** Blends smoothly into what's already there over this many px (0: a hard join). */
  k = 0;
  /** Parts of one body share a group; edges between groups get drawn (contours). */
  group = 0;
  tex: number = TEX.none;
  /** Scale size for the texture (px). */
  texSize = 4;
  /** Where the belly is (model space, for long shapes): faces turned that way are belly plates. */
  belly: V3 | null = null;
  /** The shape's own light: added to its brightness (eyes, a glowing throat). */
  glow = 0;
  // Round cone: a, b, ra, rb. Ellipsoid: a = centre, r = radii, rot = rows of its axes. Triangle: a, b, c, ra = half thickness.
  a: V3 = [0, 0, 0];
  b: V3 = [0, 0, 0];
  c: V3 = [0, 0, 0];
  ra = 1;
  rb = 1;
  r: V3 = [1, 1, 1];
  rot: M3 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  /** A bite out of a membrane's free edge: centre and radius (radius 0: none). */
  biteC: V3 = [0, 0, 0];
  biteR = 0;
  biteC2: V3 = [0, 0, 0];
  biteR2 = 0;
  // Bound (camera space).
  bx = 0;
  by = 0;
  bz = 0;
  br = 0;
  // Precomputed (camera space).
  private ba: V3 = [0, 0, 0];
  private l2 = 1;
  private rr = 0;
  private a2 = 1;
  private il2 = 1;
  private axis: V3 = [1, 0, 0];
  private s1: V3 = [0, 1, 0];
  private s2: V3 = [0, 0, 1];
  private alen = 1;
  // Triangle terms.
  private cb: V3 = [0, 0, 0];
  private ac: V3 = [0, 0, 0];
  private nor: V3 = [0, 0, 1];
  private nn = 1;
  private c1: V3 = [0, 0, 0];
  private c2: V3 = [0, 0, 0];
  private c3: V3 = [0, 0, 0];
  private iba = 1;
  private icb = 1;
  private iac = 1;
  /** The belly direction in camera space. */
  bellyC: V3 | null = null;

  clone(): Prim {
    const p = new Prim();
    Object.assign(p, this);
    p.a = [...this.a];
    p.b = [...this.b];
    p.c = [...this.c];
    p.r = [...this.r];
    p.rot = [[...this.rot[0]], [...this.rot[1]], [...this.rot[2]]];
    p.biteC = [...this.biteC];
    p.biteC2 = [...this.biteC2];
    p.belly = this.belly ? [...this.belly] : null;
    return p;
  }

  /** This shape moved by `m` (rotation rows) then `t`, with its terms and bound worked out. */
  placed(m: M3, t: V3): Prim {
    const p = this.clone();
    const tf = (v: V3): V3 => add(mv(m, v), t);
    p.a = tf(this.a);
    p.b = tf(this.b);
    p.c = tf(this.c);
    p.biteC = tf(this.biteC);
    p.biteC2 = tf(this.biteC2);
    if (this.kind === ELL) p.rot = mm(this.rot, transpose(m));
    p.bellyC = this.belly ? norm(mv(m, this.belly)) : null;
    p.prep();
    return p;
  }

  prep(): void {
    if (this.kind === CONE) {
      this.ba = sub(this.b, this.a);
      this.l2 = Math.max(1e-6, dot(this.ba, this.ba));
      this.rr = this.ra - this.rb;
      this.a2 = this.l2 - this.rr * this.rr;
      this.il2 = 1 / this.l2;
      this.alen = Math.sqrt(this.l2);
      this.axis = mul(this.ba, 1 / this.alen);
      const helper: V3 = Math.abs(this.axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      this.s1 = norm(cross(this.axis, helper));
      this.s2 = cross(this.axis, this.s1);
      const mid = lerp3(this.a, this.b, 0.5);
      this.bx = mid[0];
      this.by = mid[1];
      this.bz = mid[2];
      this.br = this.alen / 2 + Math.max(this.ra, this.rb);
    } else if (this.kind === ELL) {
      this.bx = this.a[0];
      this.by = this.a[1];
      this.bz = this.a[2];
      this.br = Math.max(this.r[0], this.r[1], this.r[2]);
    } else {
      this.ba = sub(this.b, this.a);
      this.cb = sub(this.c, this.b);
      this.ac = sub(this.a, this.c);
      this.nor = cross(this.ba, this.ac);
      this.nn = 1 / Math.max(1e-9, dot(this.nor, this.nor));
      this.c1 = cross(this.ba, this.nor);
      this.c2 = cross(this.cb, this.nor);
      this.c3 = cross(this.ac, this.nor);
      this.iba = 1 / Math.max(1e-9, dot(this.ba, this.ba));
      this.icb = 1 / Math.max(1e-9, dot(this.cb, this.cb));
      this.iac = 1 / Math.max(1e-9, dot(this.ac, this.ac));
      const cen = mul(add(add(this.a, this.b), this.c), 1 / 3);
      this.bx = cen[0];
      this.by = cen[1];
      this.bz = cen[2];
      this.br = Math.max(len(sub(this.a, cen)), len(sub(this.b, cen)), len(sub(this.c, cen))) + this.ra;
    }
    this.br += 0.5;
  }

  /** Signed distance from (x, y, z) (camera space). */
  dist(x: number, y: number, z: number): number {
    if (this.kind === CONE) {
      const ax = x - this.a[0];
      const ay = y - this.a[1];
      const az = z - this.a[2];
      const ba = this.ba;
      const l2 = this.l2;
      const yy = ax * ba[0] + ay * ba[1] + az * ba[2];
      const zz = yy - l2;
      const qx = ax * l2 - ba[0] * yy;
      const qy = ay * l2 - ba[1] * yy;
      const qz = az * l2 - ba[2] * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const rr = this.rr;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * this.a2 * z2 > k) return Math.sqrt(x2 + z2) * this.il2 - this.rb;
      if (Math.sign(yy) * this.a2 * y2 < k) return Math.sqrt(x2 + y2) * this.il2 - this.ra;
      return (Math.sqrt(x2 * this.a2 * this.il2) + yy * rr) * this.il2 - this.ra;
    }
    if (this.kind === ELL) {
      const dx = x - this.a[0];
      const dy = y - this.a[1];
      const dz = z - this.a[2];
      const m = this.rot;
      const lx = (m[0][0] * dx + m[0][1] * dy + m[0][2] * dz) / this.r[0];
      const ly = (m[1][0] * dx + m[1][1] * dy + m[1][2] * dz) / this.r[1];
      const lz = (m[2][0] * dx + m[2][1] * dy + m[2][2] * dz) / this.r[2];
      const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz);
      const k1 = Math.sqrt((lx / this.r[0]) ** 2 + (ly / this.r[1]) ** 2 + (lz / this.r[2]) ** 2);
      return k1 < 1e-9 ? -Math.min(this.r[0], this.r[1], this.r[2]) : (k0 * (k0 - 1)) / k1;
    }
    // Thin triangle (a membrane), with bites out of its free edge.
    const pax = x - this.a[0];
    const pay = y - this.a[1];
    const paz = z - this.a[2];
    const pbx = x - this.b[0];
    const pby = y - this.b[1];
    const pbz = z - this.b[2];
    const pcx = x - this.c[0];
    const pcy = y - this.c[1];
    const pcz = z - this.c[2];
    const s =
      Math.sign(this.c1[0] * pax + this.c1[1] * pay + this.c1[2] * paz) +
      Math.sign(this.c2[0] * pbx + this.c2[1] * pby + this.c2[2] * pbz) +
      Math.sign(this.c3[0] * pcx + this.c3[1] * pcy + this.c3[2] * pcz);
    let d2: number;
    if (s < 2) {
      const ba = this.ba;
      const cb = this.cb;
      const ac = this.ac;
      const t1 = Math.min(1, Math.max(0, (ba[0] * pax + ba[1] * pay + ba[2] * paz) * this.iba));
      const t2 = Math.min(1, Math.max(0, (cb[0] * pbx + cb[1] * pby + cb[2] * pbz) * this.icb));
      const t3 = Math.min(1, Math.max(0, (ac[0] * pcx + ac[1] * pcy + ac[2] * pcz) * this.iac));
      const e1 = (ba[0] * t1 - pax) ** 2 + (ba[1] * t1 - pay) ** 2 + (ba[2] * t1 - paz) ** 2;
      const e2 = (cb[0] * t2 - pbx) ** 2 + (cb[1] * t2 - pby) ** 2 + (cb[2] * t2 - pbz) ** 2;
      const e3 = (ac[0] * t3 - pcx) ** 2 + (ac[1] * t3 - pcy) ** 2 + (ac[2] * t3 - pcz) ** 2;
      d2 = Math.min(e1, e2, e3);
    } else {
      const n = this.nor;
      const dn = n[0] * pax + n[1] * pay + n[2] * paz;
      d2 = dn * dn * this.nn;
    }
    let d = Math.sqrt(d2) - this.ra;
    if (this.biteR > 0) {
      const bd = this.biteR - Math.hypot(x - this.biteC[0], y - this.biteC[1], z - this.biteC[2]);
      if (bd > d) d = bd;
    }
    if (this.biteR2 > 0) {
      const bd = this.biteR2 - Math.hypot(x - this.biteC2[0], y - this.biteC2[1], z - this.biteC2[2]);
      if (bd > d) d = bd;
    }
    return d;
  }

  /** Surface coordinates (px) at a point on it, for its texture: along the shape, and round it. */
  uv(x: number, y: number, z: number): [number, number] {
    if (this.kind === CONE) {
      const d: V3 = [x - this.a[0], y - this.a[1], z - this.a[2]];
      const u = dot(d, this.axis);
      const ang = Math.atan2(dot(d, this.s2), dot(d, this.s1));
      const r = this.ra + (this.rb - this.ra) * Math.max(0, Math.min(1, u / this.alen));
      return [u, ang * r];
    }
    if (this.kind === ELL) {
      const d: V3 = [x - this.a[0], y - this.a[1], z - this.a[2]];
      const q = mv(this.rot, d);
      return [q[0], Math.atan2(q[2], q[1]) * (this.r[1] + this.r[2]) * 0.5];
    }
    const d: V3 = [x - this.a[0], y - this.a[1], z - this.a[2]];
    const ba = norm(this.ba);
    return [dot(d, ba), len(sub(d, mul(ba, dot(d, ba))))];
  }
}

/** Smooth minimum (polynomial), blending over k. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * Shapes binned on a grid across a direction: a ray along that direction through (u, v) only needs
 * the shapes in its cell. The primary rays look along +z; the shadow rays along the light.
 */
export class Bins {
  readonly cell: number;
  readonly u: V3;
  readonly v: V3;
  readonly d: V3;
  private map = new Map<number, number[]>();

  constructor(prims: readonly Prim[], d: V3, cell = 6) {
    this.cell = cell;
    this.d = norm(d);
    const helper: V3 = Math.abs(this.d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    this.u = norm(cross(helper, this.d));
    this.v = cross(this.d, this.u);
    // For +z (the camera), keep u = x and v = y so screen tiles line up with pixels.
    if (Math.abs(this.d[2] - 1) < 1e-9) {
      this.u = [1, 0, 0];
      this.v = [0, 1, 0];
    }
    prims.forEach((p, i) => {
      const c: V3 = [p.bx, p.by, p.bz];
      const cu = dot(c, this.u);
      const cv = dot(c, this.v);
      const r = p.br + p.k;
      const u0 = Math.floor((cu - r) / cell);
      const u1 = Math.floor((cu + r) / cell);
      const v0 = Math.floor((cv - r) / cell);
      const v1 = Math.floor((cv + r) / cell);
      for (let a = u0; a <= u1; a++) {
        for (let b = v0; b <= v1; b++) {
          const key = a * 100003 + b;
          let l = this.map.get(key);
          if (!l) this.map.set(key, (l = []));
          l.push(i);
        }
      }
    });
  }

  at(x: number, y: number, z: number): number[] | undefined {
    const pu = x * this.u[0] + y * this.u[1] + z * this.u[2];
    const pv = x * this.v[0] + y * this.v[1] + z * this.v[2];
    return this.map.get(Math.floor(pu / this.cell) * 100003 + Math.floor(pv / this.cell));
  }
}

/** The scene's distance at a point, from the shapes in `list` (smooth joins where asked). */
export function sceneDist(prims: readonly Prim[], list: readonly number[], x: number, y: number, z: number): number {
  let d = 1e9;
  for (let i = 0; i < list.length; i++) {
    const p = prims[list[i]];
    const di = p.dist(x, y, z);
    d = p.k > 0 && d < 1e8 ? smin(d, di, p.k) : Math.min(d, di);
  }
  return d;
}

/** The shape nearest a point (what the surface there is made of). */
export function nearest(prims: readonly Prim[], list: readonly number[], x: number, y: number, z: number): number {
  let best = 1e9;
  let bi = -1;
  for (let i = 0; i < list.length; i++) {
    const di = prims[list[i]].dist(x, y, z);
    if (di < best) {
      best = di;
      bi = list[i];
    }
  }
  return bi;
}
