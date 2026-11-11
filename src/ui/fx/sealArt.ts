/**
 * The pixel art of the Oracle's sealed altar (AltarSeal.tsx), drawn by code once and kept as data URLs:
 *
 *  - two heavy iron chains binding the reels, one across (sagging a little to the lock) and one down,
 *    crossing inside the lock's shackle: real links, face-on and edge-on in turn (the next ring's wire
 *    showing through each edge-on link's slit), a four-tone ramp, a glint on each, the edge-on links
 *    shading the rings they cross; each chain in two lengths, so they part when the lock opens; and
 *    the glints alone, for the shine that runs along them;
 *  - the padlock, in two sizes (the big one for a wide altar): a brass body drawn by hand (a cap
 *    under an engraved groove, rivets, a raised escutcheon; the big one an engraved panel too) and a
 *    polished steel shackle, shut and sprung open; the keyhole in the Oracle's violet, and lit up
 *    white-hot (it breathes between the two); a shine sweeping across the brass, as a strip of frames;
 *  - the glow behind it (see-through stepped rings, dithered only where one meets the next; two sizes,
 *    it breathes), and the ring of light that goes out as it breaks (a strip of frames, never scaled).
 *
 * One art pixel per image pixel; the page shows them at var(--px) each, pixelated. Lit from the top
 * left like the rest of the game's UI art, one ink round everything.
 */
import { READ } from '../readCanvas';

const INK = '#1a1326';
/** Iron, dark to light, and its glint. */
const IRON = ['#25213a', '#433f5e', '#6b6d8e', '#a2a9c2', '#e9efff'] as const;
/** Brass, dark to light (the altar's own gold trim, and a highlight). */
const BRASS = ['#3a2208', '#7a4a12', '#b9791f', '#e3a93a', '#f7cd62', '#fff3c0'] as const;
/** The Oracle's violet: the keyhole's light, deep to white-hot. */
const VIOLET = ['#2a0f4a', '#6a24b8', '#a858f0', '#dca4ff', '#ffffff'] as const;

type Px = (string | null)[][];

function grid(w: number, h: number): Px {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => null));
}

function toUrl(px: Px): string {
  if (typeof document === 'undefined' || !px.length) return '';
  const h = px.length;
  const w = px[0].length;
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const g = c.getContext('2d', READ)!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = px[y][x];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c.toDataURL();
}

/** Rows of characters into pixels by a key (anything not in it is clear). */
function rows(r: readonly string[], key: Record<string, string>): Px {
  return r.map((line) => [...line].map((ch) => key[ch] ?? null));
}
const IRON_KEY: Record<string, string> = { K: INK, '0': IRON[0], '1': IRON[1], '2': IRON[2], '3': IRON[3], '4': IRON[4] };
const BRASS_KEY: Record<string, string> = { K: INK, '0': BRASS[0], '1': BRASS[1], '2': BRASS[2], '3': BRASS[3], '4': BRASS[4], '5': BRASS[5] };

function transpose(px: Px): Px {
  const h = px.length;
  const w = px[0].length;
  return Array.from({ length: w }, (_, x) => Array.from({ length: h }, (_, y) => px[y][x]));
}
/** Draws `src` onto `dst` at (x, y), clear pixels left alone. */
function stamp(dst: Px, src: Px, x: number, y: number): void {
  for (let j = 0; j < src.length; j++) {
    const row = dst[y + j];
    if (!row) continue;
    for (let i = 0; i < src[j].length; i++) {
      const c = src[j][i];
      if (c && x + i >= 0 && x + i < row.length) row[x + i] = c;
    }
  }
}

// ------------------------------------------------------------------ the chains

/**
 * A link seen face-on (an oval ring flat to us, 16 x 11, a hole through it) and edge-on (16 x 7, seen
 * a little from above: its two sides, the slit between them, the next ring's wire showing through
 * it), lying across. Lit from the top left: the ring's top and left outer faces bright, its bottom
 * and right in shadow, the hole's walls the other way round; a glint at the top left of each.
 */
const FACE = rows(
  [
    '....KKKKKKKK....',
    '..KK34433332KK..',
    '.K332222222221K.',
    'K321KKKKKKKK221K',
    'K21K........K20K',
    'K21K........K20K',
    'K21K........K20K',
    'K212KKKKKKKK320K',
    '.K122333333210K.',
    '..KK11111100KK..',
    '....KKKKKKKK....',
  ],
  IRON_KEY,
);
const EDGE = rows(
  ['..KKKKKKKKKKKK..', '.K344333333332K.', 'K21111111111110K', 'K2K..........K0K', 'K33333333333321K', '.K111111111100K.', '..KKKKKKKKKKKK..'],
  IRON_KEY,
);
/**
 * Is a link's pixel part of its glint (the lights along its top, its left half), (i, j) in the link
 * lying across?
 */
const GLINT = '#ffffff';
const isGlint = (c: string | null, i: number, j: number) => (c === IRON[2] || c === IRON[3] || c === IRON[4]) && j <= 2 && i < 9;
/** Face-on to face-on along a chain (each edge-on link halfway between). */
const PITCH = 20;

/** The steps of the ramp, for shading one pixel a step darker (a shadow cast on it). */
const DARKER: Record<string, string> = {
  [IRON[1]]: IRON[0],
  [IRON[2]]: IRON[1],
  [IRON[3]]: IRON[2],
  [IRON[4]]: IRON[3],
};

// ------------------------------------------------------------------ the padlock

/**
 * The padlocks' bodies, by hand (`0`-`5` brass dark to light, `K` ink, `v` `w` `x` the keyhole's
 * light): a cap across the top under an engraved groove, the face lit from the top left and falling
 * into shadow at the bottom right, rivets, and a raised escutcheon round the keyhole, each casting its
 * shadow down and to the right. The big one's rivets sit in the corners of an engraved panel.
 */
const BODY_SMALL = [
  '..KKKKKKKKKKKKKKKKKKKKKKK..',
  '.K55555555555444444444432K.',
  'K5444444444444444443333332K',
  'K4333333333333333333332221K',
  'K4111111111111111111111110K',
  'K5555555554444444444443332K',
  'K5444444444443333333333332K',
  'K5454444444411113333354332K',
  'K5442344444155541333342232K',
  'K54433444415KKK43133332231K',
  'K5444444331KvwvK3123333331K',
  'K5444443331KwxwK2123333321K',
  'K5444433331KvwvK2123333221K',
  'K44433333315KwK32123322221K',
  'K44333333315KwK22123222221K',
  'K4333333331KvwvK2122222221K',
  'K43543333331KKK21112254221K',
  'K4342233333143221122242121K',
  'K4332233333313211122221121K',
  '.K33333333333111122222221K.',
  '.K22333333332211222222200K.',
  '..KK2233333222222222200KK..',
  '....KK221111111111100KK....',
  '......KKKKKKKKKKKKKKK......',
];
const BODY_BIG = [
  '...KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK...',
  '..K5555555555555554444444444444443K..',
  '.K544444444444444444444433333333333K.',
  'K54444443333333333333333333333332222K',
  'K43333222222222222222222222222211111K',
  'K41111111111111111111111111111111111K',
  'K55555555555544444444444444444433332K',
  'K54444444444444444433333333333333332K',
  'K54444444444444443333333333333333332K',
  'K54444333333333322222222222222233332K',
  'K54443555555555411111444444444423332K',
  'K54435454444441155555113333335442331K',
  'K54435543344315544444551333354322331K',
  'K5443543134315444KKK3335133343122331K',
  'K544354333331544KvwvK332123332222321K',
  'K54435444333154KvwxwvK32123333332221K',
  'K54435433333154KvwxwvK32123333321221K',
  'K444353333331544KvwvK332123333221221K',
  'K4443433333315443KwK3332123332221221K',
  'K444243333331543KvwvK332123322221221K',
  'K433243333331533KvwvK332122222221221K',
  'K43324354333315KvvwvvK21212225421221K',
  'K43324543233315KKKKKKK21122254311221K',
  'K43324431233331533333211122243111221K',
  '.K333242223333315333211122222111221K.',
  '.K233322222222221522111111111112220K.',
  '..K2333333333333311111222222222220K..',
  '...K22333333333333111222222222200K...',
  '....KK2223333333222222222222000KK....',
  '......KKK2111111111111111110KKK......',
  '.........KKKKKKKKKKKKKKKKKKK.........',
];

export type LockSize = 'small' | 'big';

interface LockSpec {
  /**
   * The lock's size, shut (odd across: everything centers on a pixel), and where the body starts in
   * it. Its pictures have `lift` more rows on top, for the shackle to spring up into.
   */
  w: number;
  h: number;
  bodyTop: number;
  body: readonly string[];
  /** The shackle: the radius of its bend's middle, half its bar's width, how far it springs open. */
  R: number;
  hw: number;
  lift: number;
  /** Where the chains cross (inside the shackle) and the keyhole's head, down from the lock's top. */
  cross: number;
  key: number;
  /** The glow behind it, and a little bigger; the ring of light's frames (radii). */
  glow: readonly [number, number, number, number];
  ring: readonly number[];
}

const LOCKS: Record<LockSize, LockSpec> = {
  small: { w: 27, h: 39, bodyTop: 15, body: BODY_SMALL, R: 7, hw: 2.5, lift: 6, cross: 9, key: 26, glow: [60, 48, 66, 54], ring: [15, 20, 25, 30] },
  big: { w: 37, h: 50, bodyTop: 19, body: BODY_BIG, R: 9, hw: 3.5, lift: 8, cross: 13, key: 34, glow: [78, 62, 86, 70], ring: [20, 26, 32, 38] },
};

/** The keyhole's light: resting, and lit up white-hot. */
const KEY_DIM = { v: VIOLET[1], w: VIOLET[2], x: VIOLET[3] };
const KEY_LIT = { v: VIOLET[3], w: VIOLET[4], x: VIOLET[4] };

/**
 * The shackle: a steel bar bent into a U, its legs down into the body (`open`: sprung up out of it,
 * its right leg free), polished: lit from the top left, a sharp highlight just in from the lit edge.
 */
function drawShackle(px: Px, k: LockSpec, open: boolean): void {
  const { R, hw } = k;
  // (The picture's top `lift` rows are headroom; the shut shackle's top is under them.)
  const arcY = k.lift + R + hw + 1 - (open ? k.lift : 0); // the bend's middle
  const bottom = k.lift + k.bodyTop + 6; // where the legs end (in the body: the long one stays in)
  // The short leg's end: just into the body shut, sprung up out of it open.
  const rightEnd = open ? k.bodyTop + 2 : bottom;
  const cx = (k.w - 1) / 2 + 0.5;
  for (let y = 0; y < k.h + k.lift; y++) {
    for (let x = 0; x < k.w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - arcY;
      let s: number; // offset across the bar, outward
      let nx: number;
      let ny: number;
      if (dy < 0) {
        const r = Math.hypot(dx, dy);
        s = r - R;
        nx = dx / r;
        ny = dy / r;
      } else {
        const right = dx > 0;
        if (y >= (right ? rightEnd : bottom)) continue;
        s = right ? dx - R : -dx - R;
        nx = right ? 1 : -1;
        ny = 0;
      }
      const a = Math.abs(s);
      if (a >= hw + 1) continue;
      if (a >= hw) {
        px[y][x] = INK;
        continue;
      }
      // How much this strip of the round bar faces the light, -1 to 1 (from the top left).
      const q = ((nx * -0.62 + ny * -0.78) * Math.round(s)) / hw;
      px[y][x] = q >= 0.5 ? IRON[3] : q >= 0.12 ? IRON[4] : q > -0.12 ? IRON[3] : q > -0.3 ? IRON[2] : q > -0.5 ? IRON[1] : IRON[0];
    }
  }
  // The free leg's end, capped in ink.
  if (open) {
    for (let x = (k.w - 1) / 2 + 1; x < k.w; x++) if (px[rightEnd - 1][x]) px[rightEnd][x] = INK;
  }
}

/**
 * The whole padlock, `lift` rows of headroom over it: the shackle (shut or open) behind, the body over
 * it, its keyhole (`bright`).
 */
function drawLock(k: LockSpec, open: boolean, bright: boolean): Px {
  const px = grid(k.w, k.h + k.lift);
  drawShackle(px, k, open);
  stamp(px, rows(k.body, { ...BRASS_KEY, ...(bright ? KEY_LIT : KEY_DIM) }), 0, k.lift + k.bodyTop);
  return px;
}

/** A shine sweeping across the brass, as frames left to right (the first and last clear): only the lit pixels. */
export const SHINE_N = 8;
function shineFrames(k: LockSpec): Px {
  const base = drawLock(k, false, false);
  const top = k.lift + k.bodyTop;
  const strip = grid(k.w * SHINE_N, k.h + k.lift);
  const up: Record<string, string> = { [BRASS[1]]: BRASS[3], [BRASS[2]]: BRASS[4], [BRASS[3]]: BRASS[5], [BRASS[4]]: BRASS[5] };
  const step = (k.w + 16) / (SHINE_N - 2);
  for (let f = 1; f < SHINE_N - 1; f++) {
    const at = -12 + Math.round(f * step);
    for (let y = top; y < k.h + k.lift; y++) {
      for (let x = 0; x < k.w; x++) {
        const d = x + Math.floor((y - top) / 2) - at;
        if (d < 0 || d >= 3) continue;
        const c = base[y][x];
        if (c && up[c]) strip[y][f * k.w + x] = d === 1 ? BRASS[5] : up[c];
      }
    }
  }
  return strip;
}

// ------------------------------------------------------------------ the light

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/**
 * The glow behind the lock: an oval `w` x `h` of the Oracle's violet in see-through stepped rings,
 * each ring's edge dithered into the next (a narrow band of it, not the whole ring).
 */
function glowPx(w: number, h: number, strength: number): Px {
  const px = grid(w, h);
  const bands = ['#7a3ad055', '#9a56e888', '#b878f4b0', '#d8a8ffd0'];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
      if (r >= 1) continue;
      const f = Math.pow(1 - r, 0.9) * strength * bands.length;
      const q = Math.floor(f + (BAYER4[(x & 3) + ((y & 3) << 2)] - 0.5) * 0.5 + 0.25);
      if (q <= 0) continue;
      px[y][x] = bands[Math.min(bands.length - 1, q - 1)];
    }
  }
  return px;
}

/** The ring of light going out as it breaks: frames of a ring, each wider, thinner and dimmer. */
function ringFrames(k: LockSpec): Px {
  const n = ringSize(k);
  const c = (n - 1) / 2;
  const strip = grid(n * k.ring.length, n);
  k.ring.forEach((R, f) => {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const d = Math.hypot(x - c, y - c);
        if (d > R - 0.5 && d <= R + 0.5) strip[y][f * n + x] = f < 2 ? VIOLET[4] : VIOLET[3];
        else if (d > R - 1.5 && d <= R - 0.5 && f < 3) strip[y][f * n + x] = VIOLET[2];
      }
    }
  });
  return strip;
}
const ringSize = (k: LockSpec) => 2 * k.ring[k.ring.length - 1] + 3;

// ------------------------------------------------------------------ where it all goes

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where everything goes over the altar (art pixels from its top left). */
export interface SealLayout {
  W: number;
  H: number;
  size: LockSize;
  /** The crossing of the chains (inside the shackle). */
  cx: number;
  cy: number;
  /** The lock, shut: its top left and size (its pictures reach SealArt.pad higher). */
  lockX: number;
  lockY: number;
  lockW: number;
  lockH: number;
  /** The keyhole's head. */
  kx: number;
  ky: number;
  /** The glow's middle (behind the lock's body). */
  gx: number;
  gy: number;
}

/**
 * Lays the seal out over an altar W x H (art pixels) round its reel window `win`: the lock in the
 * window's middle (the big one when there's room for it), the chains crossing inside its shackle.
 */
export function sealLayout(W: number, H: number, win: Rect | null): SealLayout {
  const w = win ?? { x: 0, y: 0, w: W, h: H };
  const size: LockSize = w.h >= 64 && w.w >= 160 ? 'big' : 'small';
  const k = LOCKS[size];
  const mid = (k.w - 1) / 2;
  const mx = w.x + Math.floor(w.w / 2);
  const my = w.y + Math.floor(w.h / 2);
  const lockX = mx - mid;
  const lockY = my - Math.floor(k.h / 2);
  return { W, H, size, cx: mx, cy: lockY + k.cross, lockX, lockY, lockW: k.w, lockH: k.h, kx: mx, ky: lockY + k.key, gx: mx, gy: lockY + k.bodyTop + Math.floor((k.h - k.bodyTop) / 3) };
}

interface Link {
  x: number;
  y: number;
  face: boolean;
}

/** The chain across: links out from the crossing both ways, sagging to it (y of a link's middle). */
function acrossLinks(L: SealLayout): { left: Link[]; right: Link[] } {
  const half = Math.max(L.cx, L.W - L.cx);
  // How far the chain rises toward the altar's sides: a point load's V, eased into a hanging curve.
  const rise = Math.max(3, Math.round(L.W / 30));
  const yAt = (dx: number) => {
    const t = Math.min(1, Math.abs(dx) / half);
    return L.cy - Math.round(rise * (0.55 * t + 0.45 * t * t));
  };
  const left: Link[] = [];
  const right: Link[] = [];
  const n = Math.ceil(half / (PITCH / 2)) + 2;
  for (let k = 0; k <= n; k++) {
    const dx = (k * PITCH) / 2;
    const face = k % 2 === 0;
    left.push({ x: L.cx - dx, y: yAt(dx), face });
    if (k > 0) right.push({ x: L.cx + dx, y: yAt(dx), face });
  }
  return { left, right };
}

/** The chain down: straight, through the crossing (an edge-on link there, seen through the ring across). */
function downLinks(L: SealLayout): { top: Link[]; bottom: Link[] } {
  const top: Link[] = [];
  const bottom: Link[] = [];
  const nUp = Math.ceil(L.cy / (PITCH / 2)) + 2;
  const nDown = Math.ceil((L.H - L.cy) / (PITCH / 2)) + 2;
  for (let k = 0; k <= nUp; k++) top.push({ x: L.cx, y: L.cy - (k * PITCH) / 2, face: k % 2 === 1 });
  for (let k = 1; k <= nDown; k++) bottom.push({ x: L.cx, y: L.cy + (k * PITCH) / 2, face: k % 2 === 1 });
  return { top, bottom };
}

/**
 * A run of links drawn into a W x H picture: the face-on ones first, the edge-on ones over them (each
 * shading the ring it crosses a pixel below it); and its glints alone, lit white (of whichever link is
 * on top at each pixel).
 */
function drawChain(L: SealLayout, links: Link[], down: boolean): { px: Px; glint: Px } {
  const px = grid(L.W, L.H);
  const glint = grid(L.W, L.H);
  const face = down ? transpose(FACE) : FACE;
  const edge = down ? transpose(EDGE) : EDGE;
  const put = (k: Link) => {
    const src = k.face ? face : edge;
    const w = src[0].length;
    const h = src.length;
    const x0 = k.x - Math.floor(w / 2);
    const y0 = k.y - Math.floor(h / 2);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (!src[j][i] || !glint[y0 + j] || x0 + i < 0 || x0 + i >= L.W) continue;
        glint[y0 + j][x0 + i] = isGlint(src[j][i], down ? j : i, down ? i : j) ? GLINT : null;
      }
    }
    if (!k.face) {
      // Its shadow on the ring under it: a pixel below (across) or to the right (down).
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          if (src[j][i] !== INK) continue;
          const sx = x0 + i + (down ? 1 : 0);
          const sy = y0 + j + (down ? 0 : 1);
          const c = px[sy]?.[sx];
          if (c && DARKER[c] && !src[j + (down ? 0 : 1)]?.[i + (down ? 1 : 0)]) px[sy][sx] = DARKER[c];
        }
      }
    }
    stamp(px, src, x0, y0);
  };
  for (const k of links) if (k.face) put(k);
  for (const k of links) if (!k.face) put(k);
  return { px, glint };
}

/** Both chains: across in its two lengths, down in its two, and the glints along each. */
function drawChains(L: SealLayout) {
  const a = acrossLinks(L);
  const d = downLinks(L);
  const across = drawChain(L, [...a.left, ...a.right], false);
  const down = drawChain(L, [...d.top, ...d.bottom], true);
  return {
    left: drawChain(L, a.left, false).px,
    right: drawChain(L, a.right, false).px,
    top: drawChain(L, d.top, true).px,
    bottom: drawChain(L, d.bottom, true).px,
    glintAcross: across.glint,
    glintDown: down.glint,
  };
}

// ------------------------------------------------------------------ all of it

export interface SealArt {
  /**
   * The padlock shut, its keyhole lit up (it breathes between them), and sprung open: each the lock's
   * size with `pad` rows of headroom on top (for the shackle to spring into).
   */
  pad: number;
  lock: string;
  lockBright: string;
  lockOpen: string;
  /** The shine across its brass: SHINE_N frames of the lock's picture, side by side. */
  shine: string;
  /** The glow behind it, and a little bigger (it breathes), with their sizes. */
  glow: { src: string; w: number; h: number };
  glowBig: { src: string; w: number; h: number };
  /** The ring of light: `frames` frames of n x n, side by side. */
  ring: { src: string; n: number; frames: number };
}

const arts: Partial<Record<LockSize, SealArt>> = {};

/** The lock's pictures, in a size (made once). */
export function sealArt(size: LockSize): SealArt {
  const have = arts[size];
  if (have) return have;
  const k = LOCKS[size];
  const [gw, gh, bw, bh] = k.glow;
  const art: SealArt = {
    pad: k.lift,
    lock: toUrl(drawLock(k, false, false)),
    lockBright: toUrl(drawLock(k, false, true)),
    lockOpen: toUrl(drawLock(k, true, true)),
    shine: toUrl(shineFrames(k)),
    glow: { src: toUrl(glowPx(gw, gh, 0.9)), w: gw, h: gh },
    glowBig: { src: toUrl(glowPx(bw, bh, 1)), w: bw, h: bh },
    ring: { src: toUrl(ringFrames(k)), n: ringSize(k), frames: k.ring.length },
  };
  arts[size] = art;
  return art;
}

export interface ChainArt {
  /** The chain across in its two lengths, and down in its two; each the whole altar's size. */
  left: string;
  right: string;
  top: string;
  bottom: string;
  /** The glints along each chain, for the shine that runs along them. */
  glintAcross: string;
  glintDown: string;
}

const chainCache = new Map<string, ChainArt>();

/** The chains for a layout (kept per size and place). */
export function chainArt(L: SealLayout): ChainArt {
  const key = `${L.W}x${L.H}@${L.cx},${L.cy}`;
  let c = chainCache.get(key);
  if (c) return c;
  const p = drawChains(L);
  c = {
    left: toUrl(p.left),
    right: toUrl(p.right),
    top: toUrl(p.top),
    bottom: toUrl(p.bottom),
    glintAcross: toUrl(p.glintAcross),
    glintDown: toUrl(p.glintDown),
  };
  chainCache.set(key, c);
  return c;
}

/** For tools: the raw pixels of every piece for a layout (no canvas needed). */
export function sealPixels(L: SealLayout) {
  const k = LOCKS[L.size];
  return {
    ...drawChains(L),
    lock: drawLock(k, false, false),
    lockBright: drawLock(k, false, true),
    lockOpen: drawLock(k, true, true),
    shine: shineFrames(k),
    glow: glowPx(k.glow[0], k.glow[1], 0.9),
    glowBig: glowPx(k.glow[2], k.glow[3], 1),
    ring: ringFrames(k),
  };
}
