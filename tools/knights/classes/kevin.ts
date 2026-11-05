/**
 * Kevin, the one Absolute knight: a normal guy. Messy black hair, a calm face, a plain white tee,
 * dark trousers, simple shoes and a plain sword he rests on his shoulder. No armor, no cape, no glow:
 * he doesn't need any of it.
 */
import { oklchToHex, toneRamp } from '../../../src/render/pf/color';
import { BASE } from '../lib/palette';
import { grid, legend, piece, place, type Cell, type Grid, type Mat, type Piece } from '../lib/raster';
import { faceCells, limb, linePts, type Dir3, type Drawn, type Kit, type Pose } from '../rig';

export const KEVIN_COLORS: Record<Mat, string[]> = {
  ...BASE,
  hair: toneRamp([0.2, 0.26, 0.32, 0.4, 0.5, 0.6], 0.03, 270, { inkL: 0.12, warm: 8 }),
  skin: [...toneRamp([0.52, 0.62, 0.73, 0.82, 0.9, 0.95], 0.07, 50, { cool: 14, warm: 6 }).slice(0, 6), oklchToHex(0.74, 0.11, 20), toneRamp([0.52], 0.07, 50)[7]],
  linen: toneRamp([0.6, 0.72, 0.83, 0.91, 0.96, 0.99], 0.012, 250, { cool: 30, inkL: 0.2 }),
  cloth: toneRamp([0.24, 0.3, 0.37, 0.44, 0.52, 0.6], 0.035, 265, { inkL: 0.13 }),
  leather: toneRamp([0.22, 0.28, 0.34, 0.41, 0.48, 0.55], 0.03, 40, { inkL: 0.12 }),
  accent: toneRamp([0.45, 0.55, 0.66, 0.76, 0.85, 0.93], 0.02, 250),
  eyes: [oklchToHex(0.14, 0.02, 270), oklchToHex(0.2, 0.03, 260), oklchToHex(0.32, 0.04, 250), oklchToHex(0.4, 0.04, 250), oklchToHex(0.5, 0.04, 250), oklchToHex(0.97, 0.01, 90), oklchToHex(0.97, 0.01, 90), oklchToHex(0.25, 0.03, 270)],
};

const L = legend(
  'k:skin.2 s:skin.3 S:skin.4 H:skin.5 p:skin.6 !:eyes.1 *:eyes.5 c:cloth.3 C:cloth.4 d:cloth.2 D:cloth.1 l:leather.2 L:leather.3 K:leather.4 a:accent.4',
);
const g = (rows: string[], mat: Mat, ax: number, ay: number): Grid => grid(rows, mat, L, ax, ay);

/** Heads, anchored at the chin's middle (bottom row); the eye pixels are drawn by the face. */
const HEAD: Record<Dir3, Grid> = {
  s: g([
    '...3..43..3...',
    '..3444554443..',
    '.234455555443.',
    '23445555554432',
    '2344s45s4s4432',
    '234sSS4SSsS432',
    '23sSSSSSSSSs32',
    '2ksSSSSSSSSk22',
    '.ksSSSSSSSSk2.',
    '..kSSSSkSSSk..',
    '...kkSSSSkk...',
    '.....kkkk.....',
  ], 'hair', 7, 11),
  e: g([
    '..3.443.3....',
    '.344455443...',
    '23445555443..',
    '234455555443.',
    '2344555s44s3.',
    '23445ssSSSSs.',
    '2344sSSSSSSS.',
    '2344sSSSSSSS.',
    '.234ksSSSSSs.',
    '..23kSSSSSk..',
    '...2kkSSSk...',
    '.....kkkk....',
  ], 'hair', 6, 11),
  n: g([
    '...3..43..3...',
    '..3444554443..',
    '.234455555443.',
    '23445555554432',
    '23445555544332',
    '23444554443322',
    '23344444433322',
    '22334443333222',
    '.223333332222.',
    '..2223332222..',
    '...k222222k...',
    '.....kkkk.....',
  ], 'hair', 7, 11),
};

/** Open eyes per facing, relative to the head's anchor: [x, y, eye shade]. */
const EYES: Record<Dir3, Array<[number, number, number]>> = {
  s: [[-3, -5, 5], [-2, -5, 1], [-3, -4, 1], [-2, -4, 1], [1, -5, 5], [2, -5, 1], [1, -4, 1], [2, -4, 1]],
  e: [[2, -5, 5], [3, -5, 1], [2, -4, 1], [3, -4, 1]],
  n: [],
};
const BLUSH: Record<Dir3, Array<[number, number]>> = { s: [[-3, -3], [2, -3]], e: [[2, -3]], n: [] };

const TORSO: Record<Dir3, Grid> = {
  s: g(['..3kSk3..', '.3455543.', '345554432', '345544432', '.3444433.', '.3444332.', '.3433322.', '.llLalll.', '.cCCccdc.'], 'linen', 4, 8),
  e: g(['.3kS3..', '345543.', '3455432', '3454432', '.34443.', '.34432.', '.34332.', '.llall.', '.cCccd.'], 'linen', 3, 8),
  n: g(['..3kkk3..', '.3455543.', '345554432', '345544432', '.3444433.', '.3444332.', '.3433322.', '.lllllll.', '.ccccccc.'], 'linen', 4, 8),
};

const LEG: Record<string, Grid> = {
  sl: g(['343', '343', '343', '332', '232', 'LKL', 'lll'], 'cloth', 1, 6),
  sr: g(['332', '332', '332', '232', '221', 'LLl', 'lll'], 'cloth', 1, 6),
  e: g(['343.', '343.', '343.', '342.', '232.', 'LKLl', 'llll'], 'cloth', 1, 6),
  ef: g(['232.', '232.', '232.', '221.', '221.', 'lLll', 'llll'], 'cloth', 1, 6),
  n: g(['332', '332', '332', '232', '222', 'lLl', 'lll'], 'cloth', 1, 6),
};

/** Leg placement per leg pose: [near x, near lift, far x, far lift] (lift raises the foot). */
const LEGS: Record<string, [number, number, number, number]> = {
  stand: [0, 0, 0, 0],
  wide: [-1, 0, 1, 0],
  lunge: [2, 0, -2, 0],
  crouch: [-1, 0, 1, 0],
  kneel: [0, 0, 0, 0],
  tuck: [0, 2, 0, 2],
  air: [0, 2, 0, 1],
  w0: [2, 0, -2, 0],
  w1: [1, 0, -1, 2],
  w2: [0, 0, 0, 2],
  w3: [-2, 0, 2, 0],
  w4: [-1, 2, 1, 0],
  w5: [0, 2, 0, 0],
};

type Hold = [hx: number, hy: number, dx: number, dy: number];

/** Where the sword hand goes and which way the blade points, per pose and facing. */
const SWORD: Record<Dir3, Record<string, Hold>> = {
  s: {
    rest: [18, 31, -1, -1], walkA: [18, 30, -1, -1], walkB: [18, 32, -1, -1], ready: [17, 31, -1, -1], windup: [16, 27, -1, -1],
    high: [17, 24, 0, -1], overhead: [20, 22, 1, -1], strike: [25, 35, 1, 1], follow: [24, 36, 1, 1], smash: [23, 36, 0, 1], ground: [23, 37, 0, 1],
    tuck: [21, 31, 1, -1], hurt: [16, 31, -1, 1], limp: [17, 34, 0, 1], drop: [16, 35, -1, 1], cheerLow: [17, 29, 0, -1], cheer: [17, 22, 0, -1],
  },
  e: {
    rest: [23, 31, -1, -1], walkA: [22, 31, -1, -1], walkB: [24, 31, -1, -1], ready: [25, 31, 1, -1], windup: [20, 27, -1, -1],
    high: [21, 23, -1, -1], overhead: [22, 21, -1, -1], strike: [28, 30, 1, 0], follow: [27, 33, 1, 1], smash: [28, 32, 1, 1], ground: [28, 34, 1, 1],
    tuck: [24, 31, 1, -1], hurt: [21, 31, -1, 1], limp: [23, 34, 0, 1], drop: [24, 35, 1, 1], cheerLow: [24, 28, 0, -1], cheer: [23, 21, 0, -1],
  },
  n: {
    rest: [28, 31, 1, -1], walkA: [28, 30, 1, -1], walkB: [28, 32, 1, -1], ready: [29, 31, 1, -1], windup: [30, 27, 1, -1],
    high: [29, 24, 0, -1], overhead: [25, 22, -1, -1], strike: [25, 27, 0, -1], follow: [20, 31, -1, 1], smash: [23, 28, 0, -1], ground: [23, 30, 0, -1],
    tuck: [26, 31, -1, -1], hurt: [30, 31, 1, 1], limp: [29, 34, 0, 1], drop: [30, 35, 1, 1], cheerLow: [29, 29, 0, -1], cheer: [29, 21, 0, -1],
  },
};

/** The free hand (a loose fist), per pose and facing. */
const FIST: Record<Dir3, Record<string, [number, number]>> = {
  s: { rest: [29, 32], walkA: [29, 33], walkB: [29, 31], ready: [28, 30], low: [29, 33], tuck: [26, 31], hurt: [30, 30], limp: [29, 34], drop: [30, 35], cheer: [29, 29] },
  e: { rest: [25, 32], walkA: [26, 32], walkB: [24, 32], ready: [27, 30], low: [25, 33], tuck: [25, 31], hurt: [24, 30], limp: [24, 34], drop: [25, 35], cheer: [26, 29] },
  n: { rest: [17, 32], walkA: [17, 31], walkB: [17, 33], ready: [18, 30], low: [17, 33], tuck: [20, 31], hurt: [16, 30], limp: [17, 34], drop: [16, 35], cheer: [17, 29] },
};

/** A plain sword: pommel, a short grip in the hand, a small crossguard and a straight blade. */
function sword(hx: number, hy: number, dx: number, dy: number): Cell[] {
  const out: Cell[] = [[hx - dx, hy - dy, 'accent', 4]];
  // The guard, across the blade.
  const gx = hx + dx;
  const gy = hy + dy;
  out.push([gx, gy, 'metal', 4], [gx - dy, gy + dx, 'metal', 3], [gx + dy, gy - dx, 'metal', 2]);
  const len = dx && dy ? 7 : 9;
  const end: [number, number] = [hx + dx * (len + 1), hy + dy * (len + 1)];
  linePts(hx + dx * 2, hy + dy * 2, end[0], end[1]).forEach(([x, y], i, a) => out.push([x, y, 'metal', i === a.length - 1 ? 6 : i % 2 ? 4 : 5]));
  return out;
}

function arm(sx: number, sy: number, hx: number, hy: number, z: number, dark = false): Piece[] {
  const cells = limb(sx, sy, hx, hy, 'skin', 2, dark ? 2 : 3, dark ? 3 : 4, 2).map(([x, y, m, s]): Cell => (Math.abs(y - sy) + Math.abs(x - sx) <= 1 ? [x, y, 'linen', dark ? 3 : 4] : [x, y, m, s]));
  return [piece(cells, z), piece([[hx, hy, 'skin', dark ? 3 : 4], [hx + 1, hy, 'skin', 3], [hx, hy + 1, 'skin', 3], [hx + 1, hy + 1, 'skin', 2]], z + 0.1)];
}

function draw(dir: Dir3, p: Pose): Drawn {
  const out: Piece[] = [];
  const add = (cells: Cell[], z: number, edge?: Piece['edge']) => out.push(piece(cells, z, edge));
  const crouch = p.legs === 'crouch' || p.legs === 'kneel' ? 1 : 0;
  const bx = p.bx;
  const by = p.by;
  // legs
  const [nx, nl, fx, fl] = LEGS[p.legs] ?? LEGS.stand;
  const legTop = Math.max(0, crouch + (p.legs === 'kneel' ? 2 : 0));
  const leg = (gr: Grid, x: number, lift: number, z: number) => {
    const cells = place(gr, x, 40 - lift).filter(([, y]) => y >= 34 + legTop - lift || y > 38 - lift);
    add(cells, z);
  };
  if (dir === 's') {
    leg(LEG.sl, 21 + Math.min(0, nx), nl, 0);
    leg(LEG.sr, 25 + Math.max(0, fx), fl, 0);
  } else if (dir === 'n') {
    leg(LEG.n, 21 + Math.min(0, fx), fl, 0);
    leg(LEG.n, 25 + Math.max(0, nx), nl, 0);
  } else {
    leg(LEG.ef, 22 + fx, fl, -1);
    leg(LEG.e, 23 + nx, nl, 0);
  }
  // body and head
  add(place(TORSO[dir], 23 + bx, 33 + by), 2);
  const hx = 23 + bx + p.hx;
  const hy = 24 + by + p.hy;
  add(place(HEAD[dir], hx, hy), 6, { kind: 'shade', sides: 'b' });
  const eyes = EYES[dir].map(([x, y, s]) => [hx + x, hy + y, s] as [number, number, number]);
  if (eyes.length) add(faceCells(eyes, p.face), 6.5);
  if (p.face !== 'hurt' && p.face !== 'ko') for (const [x, y] of BLUSH[dir]) add([[hx + x, hy + y, 'skin', 6]], 6.4);
  // arms, the sword and the free fist
  const pose = SWORD[dir][p.wpn] ?? SWORD[dir].rest;
  const [shx, shy, sdx, sdy] = pose;
  const wx = shx + bx;
  const wy = shy + by;
  const fist = FIST[dir][p.off] ?? FIST[dir].rest;
  const ox = fist[0] + bx;
  const oy = fist[1] + by;
  if (dir === 's') {
    out.push(...arm(19 + bx, 26 + by, wx, wy, 4));
    add(sword(wx, wy, sdx, sdy), sdy < 0 && p.wpn === 'rest' ? 1 : 8, { kind: 'ink' });
    out.push(...arm(27 + bx, 26 + by, ox, oy, 4, true));
  } else if (dir === 'e') {
    out.push(...arm(25 + bx, 26 + by, ox, oy, 1, true));
    out.push(...arm(22 + bx, 26 + by, wx, wy, 8));
    add(sword(wx, wy, sdx, sdy), sdx < 0 && sdy < 0 ? 1 : 9, { kind: 'ink' });
  } else {
    add(sword(wx, wy, sdx, sdy), sdy < 0 && p.wpn !== 'rest' && p.wpn !== 'walkA' && p.wpn !== 'walkB' ? -2 : 7, { kind: 'ink' });
    out.push(...arm(27 + bx, 26 + by, wx, wy, 4));
    out.push(...arm(19 + bx, 26 + by, ox, oy, 4, true));
  }
  // A swing's smear: the blade's light trailing along the arc it just cut.
  if (p.smear) {
    const from = SWORD[dir].high;
    const sm: Cell[] = [];
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      const x = Math.round(from[0] + (wx - from[0]) * t + (from[2] * (1 - t) + sdx * t) * 7);
      const y = Math.round(from[1] + (wy - from[1]) * t + (from[3] * (1 - t) + sdy * t) * 7);
      sm.push([x, y, 'linen', 5], [x + (dir === 'n' ? -1 : 1), y, 'linen', 4]);
    }
    add(sm, 0.5);
  }
  return {
    pieces: out,
    chin: [hx, hy + 1],
    back: [dir === 'e' ? 20 + bx : 23 + bx, 28 + by],
    hip: [23 + bx, 33 + by],
    head: [hx, hy - 11],
  };
}

export const KEVIN: Kit = { name: 'kevin', draw };
