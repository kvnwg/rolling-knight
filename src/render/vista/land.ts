/**
 * The vista's land, painted once per layout at art resolution: far mountains in alpenglow, the
 * horizon hills, the castle on its hill with a village on the shore, the lake's reflection, the near
 * forests stepping down into mist, and the camp's meadow on its cliff. Also the out-of-focus framing
 * pines and the foreground grass (blurred by the caller).
 *
 * Everything is placed around the campfire (the layout's focus) and the visible window around it, so
 * the composition holds on a tall phone with a menu below and on a wide screen with a panel at the
 * side. The sun sits low and behind the scene, so every silhouette is backlit: violet shadow sides
 * with a coral rim on the edges that face the sun.
 */
import { blurRGBA, clamp, fbm1, hex, mix, noise1, noise2, Pix, rng, type RGB } from './pix';
import { skyAt } from './sky';

export interface Layout {
  /** Device size and pixels per art pixel. */
  w: number;
  h: number;
  p: number;
  /** Art size. */
  W: number;
  H: number;
  /** The campfire's base. */
  fx: number;
  fy: number;
  /** The horizon. */
  hy: number;
  /** The part of the screen the menus leave visible (around the focus). */
  winX0: number;
  winX1: number;
  winW: number;
  winY1: number;
  sunX: number;
  sunY: number;
  sunR: number;
  castleX: number;
  /** The lake: from the far shore down to where the near forest hides it. */
  shoreY: number;
  lakeBot: number;
  /** The meadow's back edge behind the fire, and the corner where the cliff edge turns down. */
  backY: number;
  cornerX: number;
  seed: number;
}

export function makeLayout(w: number, h: number, focusX: number, focusY: number): Layout {
  const p = Math.max(1, Math.floor(Math.min(w, h) / 320));
  const W = Math.ceil(w / p);
  const H = Math.ceil(h / p);
  const fx = Math.round(clamp(focusX, 0.1, 0.9) * W);
  const fy = Math.round(clamp(focusY, 0.18, 0.9) * H);
  const ex = Math.max(Math.min(fx, W - fx), Math.min(W * 0.5, 180));
  const winX0 = Math.max(0, fx - ex);
  const winX1 = Math.min(W, fx + ex);
  const winW = winX1 - winX0;
  const ey = Math.min(fy, H - fy);
  const backY = fy - 30;
  const short = Math.min(W, H);
  let hy = clamp(fy * 0.63, 0.2 * short, 0.45 * H);
  hy = Math.round(Math.max(24, Math.min(hy, backY - 30)));
  const G = backY - hy;
  const sunR = Math.round(clamp(0.04 * short, 10, 22));
  return {
    w,
    h,
    p,
    W,
    H,
    fx,
    fy,
    hy,
    winX0,
    winX1,
    winW,
    winY1: Math.min(H, fy + ey),
    sunX: Math.round(winX0 + 0.8 * winW),
    sunY: Math.round(hy - sunR * 0.42),
    sunR,
    castleX: Math.round(winX0 + 0.61 * winW),
    shoreY: hy + 1,
    lakeBot: hy + Math.round(G * 0.56),
    backY,
    cornerX: fx + Math.round(Math.max(100, 0.25 * winW)),
    seed: 1337,
  };
}

// ------------------------------------------------------------------ forest silhouettes

interface ForestOpts {
  ridge: (x: number) => number;
  x0?: number;
  x1?: number;
  tree: readonly [number, number];
  gap: readonly [number, number];
  body: RGB;
  mist: RGB;
  mistDepth: number;
  bottom: number;
  rim: RGB | null;
  /** 0..1: how much of the rim shows far from the sun. */
  rimFar?: number;
  /** Rim only on top edges (far layers), or on every sun-facing edge. */
  rimTopOnly?: boolean;
  sunX: number;
  seed: number;
  skip?: (x: number) => boolean;
  density?: number;
  bands?: number;
}

/** A ridge of pines in silhouette, its foot fading into the valley mist in stepped bands. */
function forest(p: Pix, o: ForestOpts): void {
  const x0 = Math.max(0, Math.floor(o.x0 ?? 0));
  const x1 = Math.min(p.w, Math.ceil(o.x1 ?? p.w));
  if (x1 <= x0) return;
  const ridge = new Float32Array(x1 - x0);
  let minR = 1e9;
  for (let x = x0; x < x1; x++) {
    ridge[x - x0] = o.ridge(x);
    minR = Math.min(minR, ridge[x - x0]);
  }
  const top = Math.max(0, Math.floor(minR - o.tree[1] - 3));
  const bot = Math.min(p.h, Math.ceil(o.bottom));
  if (bot <= top) return;
  const mw = x1 - x0;
  const m = new Uint8Array(mw * (bot - top));
  for (let x = x0; x < x1; x++) for (let y = Math.max(top, Math.ceil(ridge[x - x0])); y < bot; y++) m[(y - top) * mw + x - x0] = 1;
  const r = rng(o.seed);
  let x = x0 - 6 + r() * o.gap[1];
  while (x < x1 + 6) {
    const th = Math.round(o.tree[0] + r() * (o.tree[1] - o.tree[0]));
    if ((o.density ?? 1) > r() && !o.skip?.(x)) {
      const cx = Math.round(x);
      const by = o.ridge(clamp(cx, x0, x1 - 1)) + 1 + r() * 2;
      const tip = Math.round(by - th);
      const maxHW = Math.max(1, th * (0.25 + r() * 0.08));
      const tier = Math.max(2, Math.round(th / (3 + r() * 1.4)));
      for (let j = 0; j <= Math.ceil(by) - tip; j++) {
        const u = j / th;
        const tu = (j % tier) / tier;
        const hw = Math.round(Math.min(maxHW, maxHW * (u * 0.78 + tu * 0.34 * Math.min(1, u * 1.8))));
        const y = tip + j;
        if (y < top || y >= bot) continue;
        for (let dx = -hw; dx <= hw; dx++) {
          const xx = cx + dx;
          if (xx < x0 || xx >= x1) continue;
          const i = (y - top) * mw + xx - x0;
          if (!m[i]) m[i] = 2;
        }
      }
    }
    x += o.gap[0] + r() * (o.gap[1] - o.gap[0]);
  }
  const has = (xx: number, yy: number) => {
    if (yy < top) return false;
    if (yy >= bot) return true;
    if (xx < x0 || xx >= x1) return true;
    return m[(yy - top) * mw + xx - x0] > 0;
  };
  const bands = o.bands ?? 4;
  for (let y = top; y < bot; y++) {
    for (let xx = x0; xx < x1; xx++) {
      if (!m[(y - top) * mw + xx - x0]) continue;
      const depth = y - ridge[xx - x0];
      let c = o.body;
      if (depth > 0 && o.mistDepth > 0) {
        const q = Math.floor(Math.min(1, depth / o.mistDepth) * bands) / bands;
        c = mix(o.body, o.mist, q);
      }
      if (o.rim) {
        const side = Math.sign(o.sunX - xx) || 1;
        const openTop = !has(xx, y - 1);
        const openSide = !has(xx + side, y);
        const openDiag = !has(xx + side, y - 1);
        const lit = o.rimTopOnly ? openTop && (openDiag || openSide) : openSide || (openTop && openDiag);
        if (lit) {
          const near = clamp(1 - Math.abs(xx - o.sunX) / (p.w * 0.75), 0, 1);
          const k = (o.rimFar ?? 0.35) + (1 - (o.rimFar ?? 0.35)) * near;
          c = mix(c, o.rim, k);
        }
      }
      p.set(xx, y, c);
    }
  }
}

// ------------------------------------------------------------------ far: mountains and the horizon

export function paintFar(L: Layout): Pix {
  const p = new Pix(L.W, L.H);
  const r = rng(L.seed + 1);
  const base = L.hy + 3;
  const maxH = clamp(L.hy * 0.32, 20, 66);
  const x0 = -12;
  const x1 = L.sunX - L.sunR * 2.2;
  interface Peak {
    x: number;
    y: number;
    sl: number;
    sr: number;
    snow: number;
  }
  const peaks: Peak[] = [];
  let x = x0;
  const unit = Math.max(L.winW, 260);
  while (x < x1) {
    const span = (0.12 + r() * 0.12) * unit;
    const px = x + span * 0.5;
    const u = clamp((px - x0) / Math.max(1, x1 - x0), 0, 1);
    const shape = 0.5 + 0.5 * Math.sin(Math.min(1, u * 1.35 + 0.08) * Math.PI);
    const ph = maxH * shape * (0.6 + r() * 0.4);
    peaks.push({ x: px, y: base - ph, sl: 0.6 + r() * 0.5, sr: 0.6 + r() * 0.5, snow: 3 + ph * (0.12 + r() * 0.1) });
    x += span * (0.6 + r() * 0.3);
  }
  // The range tails off into low hills toward the sun.
  peaks.push({ x: x1 + 10, y: base - maxH * 0.18, sl: 0.5, sr: 0.35, snow: 0 });
  const jag = fbm1(L.seed + 3, 3);
  const spineN = noise1(L.seed + 9);
  const haze = hex('#ffc59a');
  const rockLit = hex('#f2989a');
  const rockSh = hex('#a45b98');
  const rockSh2 = hex('#8f4f92');
  const snowLit = hex('#ffe2c8');
  const snowSh = hex('#d49cc4');
  for (let xx = 0; xx < p.w; xx++) {
    let top = 1e9;
    let k = 0;
    for (let i = 0; i < peaks.length; i++) {
      const pk = peaks[i];
      const y = pk.y + (xx < pk.x ? (pk.x - xx) * pk.sl : (xx - pk.x) * pk.sr);
      if (y < top) {
        top = y;
        k = i;
      }
    }
    top += jag(xx * 0.08) * 2.4;
    const pk = peaks[k];
    const side = Math.sign(L.sunX - pk.x) || 1;
    for (let y = Math.max(0, Math.ceil(top)); y <= base && y < p.h; y++) {
      const dy = y - pk.y;
      const sp = pk.x + spineN(y * 0.2 + k * 7.3) * 2.4 - dy * 0.12 * side;
      const lit = (xx - sp) * side > 0;
      // A gully or two on the lit face: darker streaks running down from the ridge.
      const gully = lit && spineN(xx * 0.45 + k * 3.1 + dy * 0.05) > 0.78 && dy > 6;
      const snowy = pk.snow > 0 && dy < pk.snow + jag(xx * 0.31 + 5) * 3 && y - top < pk.snow * 1.3;
      let c = snowy ? (lit && !gully ? snowLit : snowSh) : lit ? (gully ? rockSh : rockLit) : (spineN(xx * 0.3 + dy * 0.2) > 0.4 ? rockSh2 : rockSh);
      const hk = Math.floor(clamp((y - (base - maxH * 0.8)) / (maxH * 0.8), 0, 1) * 4) / 4;
      c = mix(c, haze, hk * 0.75);
      p.set(xx, y, c);
    }
  }
  // The horizon hills: a low, hazy pine line all along.
  const hn = fbm1(L.seed + 4, 3);
  forest(p, {
    ridge: (xx) => L.hy - 2 + hn(xx / 28) * 2.4,
    tree: [2, 5],
    gap: [2, 4],
    body: hex('#c06a96'),
    mist: hex('#f7b39c'),
    mistDepth: 5,
    bands: 3,
    bottom: L.hy + 5,
    rim: hex('#ffd6ae'),
    rimFar: 0.25,
    rimTopOnly: true,
    sunX: L.sunX,
    seed: L.seed + 5,
  });
  return p;
}

// ------------------------------------------------------------------ mid: the castle on its hill

export interface Glow {
  x: number;
  y: number;
  r: number;
  color: RGB;
  /** 0..1: how brightly it glows. */
  k: number;
}

export function paintMid(L: Layout): { pix: Pix; glows: Glow[]; top: number } {
  const p = new Pix(L.W, L.H);
  const glows: Glow[] = [];
  const cx = L.castleX;
  const s = clamp(Math.min(L.W, L.H) / 470, 0.72, 1.15);
  const hh = Math.round(clamp(L.hy * 0.11, 8, 18));
  const hw = Math.round(66 * s);
  const hn = noise1(L.seed + 11);
  const flatW = 30 * s;
  const ridge = (x: number) => {
    const d = Math.abs(x - cx);
    const u = Math.max(0, d - flatW) / hw;
    return L.shoreY + 1 - hh * Math.exp(-u * u * 2.2) + hn(x / 9) * 0.8 * Math.min(1, u * 2);
  };
  // Hills either side of the castle, a step nearer than the horizon.
  const sn = fbm1(L.seed + 12, 3);
  forest(p, {
    ridge: (x) => L.shoreY - 3 + sn(x / 36) * 3,
    tree: [3, 8],
    gap: [2, 5],
    body: hex('#9a5590'),
    mist: hex('#e99aa0'),
    mistDepth: 6,
    bands: 3,
    bottom: L.shoreY + 2,
    rim: hex('#ffc0a0'),
    rimFar: 0.25,
    rimTopOnly: true,
    sunX: L.sunX,
    seed: L.seed + 13,
    density: 0.85,
    skip: (x) => Math.abs(x - cx) < hw * 1.3,
  });
  forest(p, {
    ridge,
    x0: cx - hw * 2.4,
    x1: cx + hw * 2.4,
    tree: [4, 9],
    gap: [2, 4],
    body: hex('#6c3a7e'),
    mist: hex('#c27aa2'),
    mistDepth: hh + 2,
    bands: 4,
    bottom: L.shoreY + 2,
    rim: hex('#ffa98c'),
    rimFar: 0.3,
    sunX: L.sunX,
    seed: L.seed + 14,
    skip: (x) => Math.abs(x - cx) < flatW + 8 * s,
  });
  const by = Math.round(ridge(cx)) + 1;
  castle(p, cx, by, s, L.sunX, glows);
  village(p, L, cx - flatW - hw * 0.55, L.shoreY, s, glows, 7);
  village(p, L, cx + flatW + hw * 0.75, L.shoreY, s, glows, 9);
  let top = L.H;
  for (let y = 0; y < L.H && top === L.H; y++) for (let x = 0; x < L.W; x++) if (p.a(x, y)) {
    top = y;
    break;
  }
  return { pix: p, glows, top };
}

const C = {
  body: hex('#4b2f6c'),
  bodyLit: hex('#5f3c80'),
  rim: hex('#ffa088'),
  rim2: hex('#d27490'),
  roof: hex('#331d4c'),
  roofLit: hex('#5b2c66'),
  roofRim: hex('#ff8c78'),
  win: hex('#ffc65a'),
  winCore: hex('#fff2b8'),
  dark: hex('#22143a'),
  flag: hex('#e2405e'),
  flagLit: hex('#ff8e96'),
  pole: hex('#2a1838'),
};

function castle(p: Pix, cx: number, by: number, s: number, sunX: number, glows: Glow[]): void {
  const side = Math.sign(sunX - cx) || 1;
  const S = (v: number) => Math.round(v * s);
  const window = (x: number, y: number, w: number, h: number) => {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) p.set(x + xx, y + yy, yy === 0 && h > 2 ? C.win : C.winCore);
    glows.push({ x: x + w / 2, y: y + h / 2, r: 3 + w + h, color: hex('#ffb24a'), k: 0.9 });
  };
  const block = (x: number, w: number, h: number, crenel: boolean) => {
    const X0 = cx + S(x);
    const Wd = Math.max(2, S(w));
    const Y0 = by - S(h);
    for (let y = Y0; y < by; y++) {
      for (let xx = X0; xx < X0 + Wd; xx++) {
        const d = side > 0 ? X0 + Wd - 1 - xx : xx - X0;
        let c = (xx - X0 - Wd / 2) * side > 0 ? C.bodyLit : C.body;
        if (d === 0) c = C.rim;
        else if (d === 1 && Wd > 4) c = C.rim2;
        else if (y === Y0) c = C.rim2;
        p.set(xx, y, c);
      }
    }
    if (crenel) {
      for (let xx = X0; xx < X0 + Wd; xx++) {
        if ((xx - X0) % 2) continue;
        const d = side > 0 ? X0 + Wd - 1 - xx : xx - X0;
        p.set(xx, Y0 - 1, d <= 1 ? C.rim : C.rim2);
      }
    }
    return { X0, Y0, Wd };
  };
  const cone = (X0: number, Wd: number, Y0: number, hgt: number, flag: boolean) => {
    const H = S(hgt);
    const mid = X0 + (Wd - 1) / 2;
    for (let j = 0; j < H; j++) {
      const y = Y0 - 1 - j;
      const half = ((Wd + 2) / 2) * Math.pow(1 - j / H, 1.15);
      const a = Math.round(mid - half);
      const b = Math.round(mid + half);
      for (let xx = a; xx <= b; xx++) {
        const edge = side > 0 ? xx === b : xx === a;
        p.set(xx, y, edge ? C.roofRim : (xx - mid) * side > 0 ? C.roofLit : C.roof);
      }
    }
    const tipX = Math.round(mid);
    const tipY = Y0 - 1 - H;
    p.set(tipX, tipY, C.roofRim);
    if (flag) {
      for (let j = 1; j <= S(4); j++) p.set(tipX, tipY - j, C.pole);
      const fy = tipY - S(4);
      const dir = -1;
      for (let j = 0; j < S(5); j++) {
        const hgt = Math.max(1, S(2.4) - Math.floor(j / 2.5));
        for (let k = 0; k < hgt; k++) p.set(tipX + dir * (j + 1), fy + k + (j > 2 ? 1 : 0), k === hgt - 1 ? C.flag : C.flagLit);
      }
    }
  };
  const slits = (X0: number, Wd: number, Y0: number, rows: number[]) => {
    for (const ry of rows) window(X0 + Math.floor(Wd / 2), Y0 + S(ry), 1, Math.max(1, S(2)));
  };
  // Back: the tall keep tower and the two flanking towers.
  const a = block(-5, 9, 38, false);
  cone(a.X0, a.Wd, a.Y0, 14, true);
  slits(a.X0, a.Wd, a.Y0, [6, 13]);
  const b = block(-22, 7, 25, false);
  cone(b.X0, b.Wd, b.Y0, 10, false);
  slits(b.X0, b.Wd, b.Y0, [5]);
  const c = block(14, 7, 28, false);
  cone(c.X0, c.Wd, c.Y0, 11, true);
  slits(c.X0, c.Wd, c.Y0, [6, 12]);
  // The great hall with arched windows, and a slim turret.
  const hall = block(-13, 24, 19, true);
  for (let i = 0; i < 3; i++) window(hall.X0 + S(4) + i * S(7), hall.Y0 + S(5), Math.max(1, S(2)), Math.max(2, S(3)));
  const d = block(8, 4, 31, false);
  cone(d.X0, d.Wd, d.Y0, 8, false);
  // The curtain wall, its corner towers and the lit gate.
  block(-30, 60, 9, true);
  const lt = block(-33, 7, 14, true);
  slits(lt.X0, lt.Wd, lt.Y0, [4]);
  const rt = block(27, 7, 13, true);
  slits(rt.X0, rt.Wd, rt.Y0, [4]);
  const gw = Math.max(3, S(5));
  const gh = Math.max(3, S(6));
  const gx = cx - Math.floor(gw / 2);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const arch = y === 0 && (x === 0 || x === gw - 1);
      if (arch) continue;
      p.set(gx + x, by - gh + y, y > gh * 0.45 ? C.win : C.dark);
    }
  }
  glows.push({ x: cx, y: by - gh * 0.3, r: 9, color: hex('#ff9a3c'), k: 0.8 });
}

function village(p: Pix, L: Layout, x0: number, shore: number, s: number, glows: Glow[], seed: number): void {
  const r = rng(L.seed + seed);
  const n = 3 + Math.floor(r() * 3);
  let x = Math.round(x0 - (n * 9 * s) / 2);
  const side = (xx: number) => Math.sign(L.sunX - xx) || 1;
  for (let i = 0; i < n; i++) {
    const w = Math.round((5 + r() * 3) * s);
    const h = Math.round((3 + r() * 2) * s);
    const rh = Math.round((2 + r() * 2) * s);
    const by = shore + 1;
    const sd = side(x);
    for (let y = by - h; y < by; y++) for (let xx = x; xx < x + w; xx++) p.set(xx, y, (sd > 0 ? xx === x + w - 1 : xx === x) ? C.rim2 : C.body);
    for (let j = 0; j < rh; j++) {
      const y = by - h - 1 - j;
      for (let xx = x - 1 + j; xx <= x + w - j; xx++) {
        const edge = sd > 0 ? xx === x + w - j : xx === x - 1 + j;
        p.set(xx, y, edge || j === rh - 1 ? C.roofRim : C.roof);
      }
    }
    if (r() < 0.85) {
      const wx = x + 1 + Math.floor(r() * Math.max(1, w - 2));
      p.set(wx, by - h + 1, C.win);
      glows.push({ x: wx + 0.5, y: by - h + 1.5, r: 4, color: hex('#ffae48'), k: 0.7 });
    }
    x += w + 2 + Math.floor(r() * 4 * s);
  }
}

// ------------------------------------------------------------------ the lake

/** The halo around the sun, as the lake sees it. */
function sunHalo(L: Layout, x: number, y: number): number {
  const d = Math.hypot((x - L.sunX) / (L.W * 0.3), (y - L.sunY) / (L.hy * 0.55));
  return Math.max(0, 1 - d) ** 2;
}

/**
 * The lake: the sky, the far hills and the castle mirrored about the far shore, darkening and
 * cooling toward the viewer (water reflects less looking down). `M` extra columns either side let
 * the shimmer shift rows sideways without gaps.
 */
export function paintLake(L: Layout, far: Pix, mid: Pix, M: number): Pix {
  const top = L.shoreY;
  const lh = Math.max(4, L.lakeBot + 8 - top);
  const p = new Pix(L.W + 2 * M, lh);
  const deep = hex('#1e1640');
  const sn = noise1(L.seed + 31);
  const halo = hex('#ffc890');
  for (let y = 0; y < lh; y++) {
    const ys = top - 1 - y;
    const k = y / lh;
    const sky = skyAt(Math.max(0, ys) / L.hy);
    for (let x = -M; x < L.W + M; x++) {
      const sx = clamp(x, 0, L.W - 1);
      let c: RGB = mix(sky, halo, sunHalo(L, sx, ys) * 0.6);
      if (ys >= 0) {
        if (mid.a(sx, ys)) c = mid.rgb(sx, ys);
        else if (far.a(sx, ys)) c = far.rgb(sx, ys);
      }
      c = mix(c, deep, 0.12 + 0.5 * k * k + 0.12 * k);
      p.set(x + M, y, c);
    }
  }
  // Wind lines: faint lighter streaks where the water catches the upper sky.
  const r = rng(L.seed + 32);
  for (let i = 0; i < Math.round(L.W * lh * 0.004); i++) {
    const y = Math.floor(r() * lh);
    const x = Math.floor(r() * (L.W + 2 * M));
    const len = 4 + Math.floor(r() * (10 + y * 0.6));
    const lightK = 0.1 + 0.12 * (sn(x * 0.05 + y) * 0.5 + 0.5);
    for (let j = 0; j < len; j++) p.tint(x + j, y, hex('#ffb3a0'), lightK);
  }
  // The far shore: a bright line where the land meets its reflection.
  for (let x = 0; x < p.w; x++) p.tint(x, 0, hex('#ffd9a8'), 0.55);
  return p;
}

// ------------------------------------------------------------------ near: forests below, the meadow and its cliff

export interface Ground {
  backAt: (x: number) => number;
  /** The front lip of the ledge (where the cliff drops toward the viewer). */
  frontAt: (x: number) => number;
  edgeAt: (y: number) => number;
  cornerY: number;
  inMeadow: (x: number, y: number) => boolean;
}

export function ground(L: Layout): Ground {
  const nb = fbm1(L.seed + 21, 3);
  const ne = noise1(L.seed + 23);
  const nf = fbm1(L.seed + 24, 3);
  const riseStart = L.fx - 96;
  const maxRise = (L.backY - L.hy) * 0.6;
  const backAt = (x: number) => {
    const rise = x < riseStart ? maxRise * (1 - Math.exp(-Math.pow((riseStart - x) / 100, 1.3) * 24 / maxRise)) : 0;
    return L.backY + nb(x / 22) * 1.6 - rise;
  };
  const cornerY = Math.round(backAt(L.cornerX));
  const edgeAt = (y: number) => L.cornerX + Math.max(0, y - cornerY) * 0.3 + ne(y / 9) * 2;
  const frontAt = (x: number) => L.fy + 44 + (L.fx - x) * 0.1 + nf(x / 26) * 3 - Math.max(0, x - (L.cornerX - 46)) * 0.55;
  const inMeadow = (x: number, y: number) => y <= frontAt(x) && (x <= L.cornerX ? y >= backAt(x) : y >= cornerY && x <= edgeAt(y));
  return { backAt, frontAt, edgeAt, cornerY, inMeadow };
}

/** Grass from deep shadow to sky-lit, and lit by the fire. */
const GRASS: readonly RGB[] = ['#0f1426', '#141e30', '#1a2838', '#223440', '#2c424a'].map(hex);
const GRASS_FIRE: readonly RGB[] = ['#2c2a34', '#4a3e34', '#6e5434', '#9a6e36', '#c88e40', '#ecb45a'].map(hex);

export function fireLight(L: Layout, x: number, y: number): number {
  const d = Math.hypot((x - L.fx) / 120, (y - L.fy + 3) / 42);
  return Math.max(0, 1 - d) ** 1.35;
}

export function paintNear(L: Layout, G: Ground): Pix {
  const p = new Pix(L.W, L.H);
  const gap = L.backY - L.hy;
  const n1 = fbm1(L.seed + 41, 3);
  const n2 = fbm1(L.seed + 42, 3);
  // The forest on the lake's near shore, then nearer and lower ones down the valley side.
  forest(p, {
    ridge: (x) => L.lakeBot + n1(x / 40) * 2.5,
    tree: [5, 12],
    gap: [3, 6],
    body: hex('#432660'),
    mist: hex('#94527f'),
    mistDepth: 12,
    bands: 4,
    bottom: L.H,
    rim: hex('#ff9a7c'),
    rimFar: 0.15,
    rimTopOnly: true,
    sunX: L.sunX,
    seed: L.seed + 45,
  });
  forest(p, {
    ridge: (x) => L.hy + gap * 0.84 + n2(x / 50) * 4,
    tree: [8, 18],
    gap: [4, 8],
    body: hex('#2a1944'),
    mist: hex('#673870'),
    mistDepth: 18,
    bands: 4,
    bottom: L.H,
    rim: hex('#ff8a6e'),
    rimFar: 0.1,
    rimTopOnly: true,
    sunX: L.sunX,
    seed: L.seed + 46,
  });
  // Down the valley side below the cliff: rows of pines, nearer and darker, mist pooling between.
  let ry = G.cornerY + 12;
  for (let k = 0; k < 9 && ry < L.H + 30; k++) {
    const u = Math.min(1, k / 6);
    const nk = fbm1(L.seed + 140 + k, 3);
    const base = ry;
    forest(p, {
      ridge: (x) => base + nk(x / (36 + k * 8)) * (3 + k * 1.5),
      tree: [10 + k * 4, 18 + k * 6],
      gap: [3 + k, 7 + k * 2],
      body: mix(hex('#2a1946'), hex('#0b0717'), u),
      mist: mix(hex('#583068'), hex('#1a0f2c'), u),
      mistDepth: 14 + k * 5,
      bands: 4,
      bottom: L.H,
      rim: mix(mix(hex('#ff8a6e'), hex('#7a3a5a'), u), mix(hex('#2a1946'), hex('#0b0717'), u), 0.45),
      rimFar: 0.05,
      rimTopOnly: true,
      sunX: L.sunX,
      seed: L.seed + 150 + k,
    });
    ry += 15 + k * 7;
  }
  meadow(p, L, G);
  cliff(p, L, G);
  return p;
}

function meadow(p: Pix, L: Layout, G: Ground): void {
  const r = rng(L.seed + 51);
  const sn = noise2(L.seed + 52);
  // Mid-distance pines on the rise to the left, behind the camp.
  const riseTrees: Array<[number, number]> = [];
  for (let x = L.fx - 150 - r() * 10; x > -30; x -= 13 + r() * 16) riseTrees.push([x, 30 + r() * 24 + (L.fx - x) * 0.1]);
  for (const [tx, th] of riseTrees) bigPine(p, tx, G.backAt(tx) + 3, th, hex('#1a1230'), hex('#ff9a74'), L.sunX, L.seed + Math.round(tx));
  // The ground: cool grass, sky-lit toward the back edge, warm where the fire reaches.
  const top = Math.floor(Math.min(G.cornerY, G.backAt(0), G.backAt(L.fx - 64)) - 2);
  const patch = noise2(L.seed + 54);
  for (let y = Math.max(0, top); y < L.H; y++) {
    for (let x = 0; x < L.W; x++) {
      if (!G.inMeadow(x, y)) continue;
      const back = x <= L.cornerX ? G.backAt(x) : G.cornerY;
      const s = clamp(1 - (y - back) / 18, 0, 1);
      const d = clamp((y - L.fy) / Math.max(40, L.H - L.fy), 0, 1);
      const gi = clamp(Math.round(2.1 - d * 2.3 + s * 1.7 + sn(x * 0.05, y * 0.09) * 0.6), 0, GRASS.length - 1);
      let c = GRASS[gi];
      // Patches: some greener, some heathery violet.
      const ph = patch(x * 0.03, y * 0.05);
      if (ph > 0.3) c = mix(c, hex('#2a4a40'), 0.22);
      else if (ph < -0.35) c = mix(c, hex('#3a2a4c'), 0.25);
      const f = fireLight(L, x, y);
      if (f > 0.04) {
        const q = Math.min(GRASS_FIRE.length - 1, Math.floor(f * GRASS_FIRE.length * 1.05));
        c = mix(c, GRASS_FIRE[q], clamp(0.45 + f * 0.8, 0, 1));
      }
      p.set(x, y, c);
    }
  }
  // Grass tufts in clumps (where the clump noise allows), larger toward the viewer.
  const cell = 7;
  const clump = noise2(L.seed + 55);
  for (let gy = Math.max(0, top); gy < L.H; gy += cell * 0.6) {
    const near = clamp((gy - L.backY) / Math.max(40, L.H - L.backY), 0, 1);
    const cw = cell * (1 + near * 1.6);
    for (let gx = -cw * r(); gx < L.W; gx += cw) {
      if (clump(gx * 0.04, gy * 0.07) < 0.05 || r() < 0.3) continue;
      const x = Math.round(gx + r() * cw);
      const y = Math.round(gy + r() * cell * 0.6);
      if (!G.inMeadow(x, y) || !G.inMeadow(x, y - 4)) continue;
      const base = p.rgb(x, y);
      const f = fireLight(L, x, y);
      const tipC = f > 0.08 ? mix(base, hex('#ffc46a'), 0.25 + f * 0.35) : mix(base, hex('#ff9c84'), 0.3 * (1 - near * 0.5));
      const midC = mix(base, tipC, 0.45);
      const shadowC = mix(base, hex('#06061a'), 0.4);
      const hgt = 2 + Math.floor(r() * (1.5 + near * 4));
      const blades = near > 0.4 ? 5 : 3;
      for (let b = 0; b < blades; b++) {
        const off = b - (blades - 1) / 2;
        const bh = Math.max(1, hgt - Math.round(Math.abs(off) * (1 + r())));
        const lean = off < 0 ? -1 : off > 0 ? 1 : 0;
        for (let j = 0; j < bh; j++) {
          const bx = x + Math.round(off) + (j > bh * 0.6 ? lean : 0);
          p.set(bx, y - j, j === bh - 1 ? tipC : midC);
        }
      }
      p.set(x - 1, y + 1, shadowC);
      p.set(x, y + 1, shadowC);
      p.set(x + 1, y + 1, shadowC);
    }
  }
  // Tall grass along the back edge, backlit: dark blades with glowing tips.
  const bn = noise1(L.seed + 53);
  for (let x = 0; x <= L.cornerX + 1; x++) {
    const back = Math.round(G.backAt(x));
    const hgt = Math.round(1 + Math.max(0, bn(x / 3.2)) * 6 + r() * 2);
    const near = clamp(1 - Math.abs(x - L.sunX) / (L.W * 0.9), 0.25, 1);
    const tip = mix(hex('#8a4a6a'), hex('#ffb27a'), near);
    for (let j = 0; j <= hgt; j++) {
      const y = back - j;
      p.set(x + (j > 3 && bn(x * 0.7) > 0.3 ? 1 : 0), y, j === hgt ? tip : j === hgt - 1 ? mix(GRASS[2], tip, 0.45) : GRASS[2]);
    }
  }
  // Wildflowers in clusters, brightest where the fire reaches.
  const flowers: readonly RGB[] = ['#ff7eb0', '#fff0dc', '#ffd25a', '#b99cff', '#ff8a68'].map(hex);
  const clusters = Math.round(L.W * 0.09);
  for (let i = 0; i < clusters; i++) {
    const cx = r() * L.W;
    const cy = L.backY + 4 + Math.pow(r(), 1.2) * (L.H - L.backY);
    const fdx = (cx - L.fx) / 56;
    const fdy = (cy - L.fy) / 18;
    if (fdx * fdx + fdy * fdy < 1) continue;
    if (Math.abs(cx - (L.fx - 100)) < 36 && cy < L.fy) continue;
    const col = flowers[Math.floor(r() * flowers.length)];
    const near = clamp((cy - L.backY) / Math.max(40, L.H - L.backY), 0, 1);
    const n = 4 + Math.floor(r() * 7);
    for (let j = 0; j < n; j++) {
      const x = Math.round(cx + (r() - 0.5) * (12 + near * 30));
      const y = Math.round(cy + (r() - 0.5) * (4 + near * 12));
      if (!G.inMeadow(x, y) || !G.inMeadow(x, y - 3)) continue;
      const f = fireLight(L, x, y);
      const c = mix(mix(col, hex('#2a2050'), 0.5 - f * 0.5), hex('#fff0d0'), f * 0.25);
      const stem = mix(p.rgb(x, y), hex('#0c0c1c'), 0.3);
      if (near > 0.4) {
        p.set(x, y + 1, stem);
        p.set(x, y, stem);
        p.set(x - 1, y - 1, c);
        p.set(x + 1, y - 1, c);
        p.set(x, y - 2, c);
        p.set(x, y - 1, mix(c, hex('#ffe680'), 0.6));
      } else {
        p.set(x, y, stem);
        p.set(x, y - 1, c);
      }
    }
  }
  // A few boulders.
  for (const [bx, by, bw] of [
    [L.fx + 92, L.fy + 26, 13],
    [L.fx - 150, L.fy + 44, 17],
    [L.cornerX - 18, L.fy - 8, 9],
    [L.fx - 60, L.fy + 90, 22],
  ] as const) {
    if (G.inMeadow(bx, by) && G.inMeadow(bx - bw / 2, by) && G.inMeadow(bx + bw / 2, by)) boulder(p, L, bx, by, bw);
  }
}

function boulder(p: Pix, L: Layout, cx: number, by: number, w: number): void {
  const h = Math.round(w * 0.6);
  const dark = hex('#1a142c');
  const mid = hex('#2a2140');
  const top = hex('#463858');
  const f = fireLight(L, cx, by);
  const warm = mix(hex('#5a4050'), hex('#e08a50'), clamp(f * 1.6, 0, 1));
  const side = Math.sign(L.fx - cx) || 1;
  for (let y = 0; y < h; y++) {
    const u = y / h;
    const half = (w / 2) * Math.sqrt(1 - (1 - u) * (1 - u) * 0.85);
    for (let x = Math.round(-half); x <= Math.round(half); x++) {
      let c = y < 2 ? top : u > 0.7 ? dark : mid;
      if (x * side > half * 0.3 && y < h - 1) c = mix(c, warm, 0.7);
      if (y === 0) c = mix(top, hex('#ffb07a'), 0.5);
      p.set(cx + x, by - h + y, c);
    }
  }
  for (let x = Math.round(-w / 2); x <= Math.round(w / 2); x++) p.set(cx + x, by, hex('#0a0816'));
}

/** The cliff under the ledge: broken rock below the front lip and down the right edge, fading into mist. */
function cliff(p: Pix, L: Layout, G: Ground): void {
  const n2 = noise2(L.seed + 61);
  const n3 = noise2(L.seed + 63);
  const nc = noise1(L.seed + 62);
  const crev = hex('#0e081c');
  const rock = hex('#1c1430');
  const rock2 = hex('#271c3e');
  const ledge = hex('#45305a');
  const ledgeLit = hex('#9a5470');
  const mist = hex('#4a2c5e');
  const rockAt = (x: number, y: number, lit: boolean): RGB => {
    const v = n2(x * 0.2, y * 0.12) + n3(x * 0.5, y * 0.45) * 0.25;
    const above = n2(x * 0.2, (y - 1) * 0.12) + n3(x * 0.5, (y - 1) * 0.45) * 0.25;
    let c = v < -0.35 ? crev : v < 0.1 ? rock : rock2;
    if (v > 0.3 && above <= 0.3) c = lit ? ledgeLit : ledge;
    return c;
  };
  // The front face, hanging below the lip.
  for (let x = 0; x < L.W; x++) {
    const top = Math.round(G.frontAt(x));
    if (!G.inMeadow(x, top - 1)) continue;
    const fh = Math.round(46 + nc(x * 0.05) * 12 + (L.fx - x) * 0.05);
    for (let j = 1; j <= fh; j++) {
      const y = top + j;
      const fade = clamp((j - fh * 0.5) / (fh * 0.5), 0, 1);
      let c = rockAt(x, y, j < 12);
      // The upper face catches a little sky; the fire warms it near the camp.
      if (j < 14) c = mix(c, hex('#3a2a52'), 0.25 * (1 - j / 14));
      const f = fireLight(L, x, top);
      if (j < 10 && f > 0.1) c = mix(c, hex('#a0583a'), f * 0.35 * (1 - j / 10));
      c = mix(c, mist, Math.floor(fade * 5) / 5);
      p.set(x, y, c);
    }
  }
  // The right face, below the edge.
  const yEnd = G.frontAt(L.cornerX + 30) + 30;
  for (let y = G.cornerY; y < yEnd; y++) {
    const ex = Math.round(G.edgeAt(y));
    const dy = y - G.cornerY;
    const fw = Math.round(Math.min(26, 3 + dy * 0.3 + nc(y * 0.09) * 2));
    for (let k = 1; k <= fw; k++) {
      const x = ex + k;
      if (G.inMeadow(x, y)) continue;
      let c = rockAt(x, y, dy < 50);
      if (k === fw) c = mix(crev, mist, 0.25);
      p.set(x, y, c);
    }
  }
  // Roots and grass hanging over the front lip.
  const r = rng(L.seed + 64);
  for (let x = 0; x < L.W; x++) {
    const top = Math.round(G.frontAt(x));
    if (!G.inMeadow(x, top - 1)) continue;
    const f = fireLight(L, x, top);
    const hang = 1 + Math.floor(Math.max(0, nc(x * 0.4)) * 4 + r() * 2);
    for (let j = 0; j < hang; j++) p.set(x, top + j, j === hang - 1 && f > 0.05 ? mix(GRASS[2], hex('#c88a4a'), f) : GRASS[1]);
    if (r() < 0.04) for (let j = 0; j < 6 + r() * 10; j++) p.set(x + Math.round(Math.sin(j * 0.5) * 0.6), top + hang + j, hex('#140d22'));
  }
  // The lip of the right edge: grass rim-lit by the sun beyond.
  for (let y = G.cornerY; y < yEnd; y++) {
    const ex = Math.round(G.edgeAt(y));
    if (!G.inMeadow(ex, y)) continue;
    const k = clamp(1 - (y - G.cornerY) / 80, 0.2, 1);
    p.set(ex, y, mix(GRASS[2], hex('#ffa070'), 0.7 * k));
    if (nc(y * 0.9) > 0.25) p.set(ex + 1, y - 1, mix(GRASS[2], hex('#ffb680'), 0.8 * k));
  }
}

/** A pine in silhouette with drooping tiers and a rim on its sun side. */
export function bigPine(p: Pix, cx: number, by: number, th: number, body: RGB, rim: RGB, sunX: number, seed: number, maxHW = th * 0.3): void {
  const r = rng(seed);
  const side = Math.sign(sunX - cx) || 1;
  const tip = Math.round(by - th);
  const tier = Math.max(3, Math.round(th / (5 + r() * 2)));
  const body2 = mix(body, hex('#3a2850'), 0.35);
  const rows: Array<[number, number]> = [];
  for (let j = 0; j <= by - tip; j++) {
    const u = j / th;
    const tu = (j % tier) / tier;
    const hw = Math.min(maxHW, maxHW * (u * 0.72 + tu * 0.4 * Math.min(1, u * 2)) + (j > by - tip - 3 ? 0 : 0));
    const jitter = Math.round((r() - 0.5) * Math.min(2, u * 3));
    rows.push([Math.round(cx - hw + jitter), Math.round(cx + hw + jitter)]);
  }
  for (let j = 0; j < rows.length; j++) {
    const [a, b] = rows[j];
    const y = tip + j;
    for (let x = a; x <= b; x++) {
      const sunEdge = side > 0 ? x === b : x === a;
      const topEdge = j === 0 || (side > 0 ? x > rows[j - 1][1] : x < rows[j - 1][0]);
      let c = (x - cx) * side > 0 ? body2 : body;
      if (sunEdge || topEdge) c = mix(body, rim, sunEdge && topEdge ? 0.9 : 0.6);
      p.set(x, y, c);
    }
  }
  // Trunk at the foot.
  for (let y = by - 2; y <= by + 1; y++) p.set(cx, y, mix(body, hex('#000000'), 0.3));
}

// ------------------------------------------------------------------ front: out-of-focus framing

export interface FrontPiece {
  pix: Pix;
  x: number;
  y: number;
  sigma: number;
}

export function paintFront(L: Layout): FrontPiece[] {
  const out: FrontPiece[] = [];
  const body = hex('#0b0718');
  const rim = hex('#ff8466');
  const tall = L.H > L.W * 1.15;
  const pine = (cx: number, tipY: number, maxHW: number, seed: number) => {
    const by = L.H + 10;
    const th = by - tipY;
    const x = Math.floor(cx - maxHW - 4);
    const pix = new Pix(maxHW * 2 + 9, th + 3);
    bigPine(pix, cx - x, by - tipY + 1, th, body, rim, L.sunX - x, seed, maxHW);
    out.push({ pix, x, y: tipY - 1, sigma: 1.6 });
  };
  if (!tall) {
    const hw = Math.round(clamp(L.W * 0.075, 28, 66));
    pine(Math.round(L.W * 0.03), Math.round(L.H * 0.03), hw, L.seed + 71);
    pine(Math.round(L.W * 0.985), Math.round(L.H * 0.08), Math.round(hw * 0.85), L.seed + 72);
  }
  // Ferns and tall grass right in front of the lens, heaped in the lower corners.
  const fh = Math.round(clamp(L.H * 0.3, 50, 170));
  const fw = Math.round(clamp(L.W * 0.5, 120, 420));
  const ferns = new Pix(fw, fh);
  const r = rng(L.seed + 73);
  for (let i = 0; i < 26; i++) {
    const u = Math.pow(r(), 1.6);
    const bx = u * fw * 0.9;
    const len = fh * (0.5 + r() * 0.5) * (1 - u * 0.6);
    const ang = -Math.PI / 2 + (r() - 0.35) * 1.3;
    if (r() < 0.45) frond(ferns, bx, fh + 2, len, ang, 0.9 + r() * 0.8, body, rim, L.sunX, r);
    else blade(ferns, bx, fh + 2, len * 1.1, ang * 0.4 - Math.PI * 0.3, body, rim, r);
  }
  out.push({ pix: ferns, x: -6, y: L.H - fh, sigma: 2.6 });
  const rfw = Math.round(fw * 0.7);
  const rferns = new Pix(rfw, Math.round(fh * 0.8));
  for (let i = 0; i < 16; i++) {
    const u = Math.pow(r(), 1.6);
    const bx = rfw - u * rfw * 0.9;
    const len = rferns.h * (0.5 + r() * 0.5) * (1 - u * 0.6);
    const ang = -Math.PI / 2 - (r() - 0.35) * 1.3;
    if (r() < 0.45) frond(rferns, bx, rferns.h + 2, len, ang, 0.9 + r() * 0.8, body, rim, L.sunX - (L.W - rfw), r);
    else blade(rferns, bx, rferns.h + 2, len * 1.1, -Math.PI / 2 - (ang + Math.PI / 2) * 0.4 + Math.PI * 0.3 - Math.PI * 0.6, body, rim, r);
  }
  out.push({ pix: rferns, x: L.W - rfw + 6, y: L.H - rferns.h, sigma: 2.6 });
  return out;
}

/** A fern frond: a curving spine with leaflets either side, longest mid-way. */
function frond(p: Pix, x0: number, y0: number, len: number, ang: number, curl: number, body: RGB, rim: RGB, sunX: number, r: () => number): void {
  let x = x0;
  let y = y0;
  let a = ang;
  const steps = Math.round(len);
  const bend = (Math.sign(Math.cos(ang)) || 1) * curl * 0.012;
  for (let i = 0; i < steps; i++) {
    const u = i / steps;
    a += bend;
    x += Math.cos(a);
    y += Math.sin(a);
    p.set(x, y, body);
    if (i % 3 !== 0) continue;
    const leaf = len * 0.22 * Math.sin(Math.min(1, u * 1.15) * Math.PI) * (0.8 + r() * 0.3);
    for (const sd of [-1, 1]) {
      const la = a + sd * (1.2 - u * 0.3) + 0.35;
      for (let j = 1; j < leaf; j++) {
        const lx = x + Math.cos(la) * j;
        const ly = y + Math.sin(la) * j + j * j * 0.02;
        const lit = j > leaf - 2 && (sunX - lx) * Math.cos(la) > 0;
        p.set(lx, ly, lit ? mix(body, rim, 0.55) : body);
      }
    }
  }
}

/** A long grass blade, tapering, its tip catching the light. */
function blade(p: Pix, x0: number, y0: number, len: number, ang: number, body: RGB, rim: RGB, r: () => number): void {
  let x = x0;
  let y = y0;
  let a = ang;
  const bend = (r() - 0.5) * 0.02;
  for (let i = 0; i < len; i++) {
    a += bend;
    x += Math.cos(a);
    y += Math.sin(a);
    const w = Math.max(1, Math.round((1 - i / len) * 3));
    const tip = i > len - 4;
    for (let k = 0; k < w; k++) p.set(x + k, y, tip ? mix(body, rim, 0.6) : body);
  }
}

// ------------------------------------------------------------------ mist

/** A horizontally tiling strip of soft mist (blobs, blurred), `h` art pixels tall. */
export function mistStrip(w: number, h: number, color: RGB, seed: number, density: number): Pix {
  const W3 = w * 3;
  const p = new Pix(W3, h);
  const r = rng(seed);
  const blobs = Math.round((w / h) * 6 * density);
  for (let i = 0; i < blobs; i++) {
    const cx = r() * w;
    const cy = h * (0.3 + r() * 0.4);
    const rx = h * (0.5 + r() * 1.6);
    const ry = h * (0.1 + r() * 0.18);
    const a = 0.15 + r() * 0.45;
    for (let t = 0; t < 3; t++) {
      const ox = cx + t * w;
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
        for (let x = Math.floor(ox - rx); x <= ox + rx; x++) {
          const d = ((x - ox) / rx) ** 2 + ((y - cy) / ry) ** 2;
          if (d < 1) p.over(x, y, color, a * (1 - d));
        }
      }
    }
  }
  blurRGBA(p.d, W3, h, h * 0.12);
  const out = new Pix(w, h);
  for (let y = 0; y < h; y++) out.d.set(p.d.subarray((y * W3 + w) * 4, (y * W3 + 2 * w) * 4), y * w * 4);
  return out;
}
