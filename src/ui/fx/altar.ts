/**
 * Lights the Summoning Altar (altarArt.ts paints it) every frame, on one canvas of one pixel per art
 * pixel, scaled up crisp.
 *
 * The light is done per pixel. Each light (the two flames, the orb, the magic circle, every rune, the
 * payline gems, the plaque's emblem, and one per reel for landing bursts) has its falloff over the
 * carved relief worked out once: diffuse from each pixel's normal, plus a highlight on brass and iron.
 * Every frame only scales those by the light's color and strength (flicker, the orb's fill, the chase,
 * a landing's flash). The total light is cut into bands with a 4 x 4 ordered dither, so it falls off
 * across the wood in pixel-art steps, multiplies the albedo, and blows out to white when it's very
 * bright. Over that go the things that shine on their own (runes, coals, flames, the orb's liquid light,
 * the circle's lines, blossoms, fireflies, sparks and motes) with small hard-banded glows, then a few
 * soft glows drawn with 'lighter' (halos, the orb's rays, light shafts, landing blooms, shock rings).
 * The reel drums are holes: light spills into them as a tint over the reels, with a shadow under the
 * frame's overhang.
 *
 * The lit wood is relit row by row, a third of its rows each frame (half on the mini), all at once on a
 * landing or a token, and kept as finished pixels; each frame starts from those and only blends and
 * converts the pixels that something moving touches.
 *
 * Golden, Lucky and Turbo spins change the light (gold, green, electric blue); a build-up turns the
 * runes, the orb and the circle to the glow's color and races them; a landing floods the frame with
 * the find's color, more for rarer finds. Calm (reduce motion): gentle flicker, no flashes, no sparks or
 * shock rings, slow turning.
 */
import { EMPTY, HOLE, type AltarArt, type Flame, type PointLight } from './altarArt';

export interface AltarSignals {
  calm: boolean;
  /** Any reel still rolling. */
  spinning: boolean;
  /** A build-up's glow (hex) and strength (1 to 3), or null. */
  glow: string | null;
  glowStrength: number;
  /** After an Epic or better, at rest: the find's color. */
  win: string | null;
  mode: 'golden' | 'lucky' | 'turbo' | null;
  /** How full the orb should be (0 to 1): luck and the spin's luck tokens. */
  fill: number;
  /** Mini: each window's rim color (the find's light, a token's green), or null. */
  rims?: ReadonlyArray<string | null>;
}

type RGB = [number, number, number];

/** A light's falloff over the altar: dense diffuse over its box, sparse highlights (canvas indexes). */
interface Field {
  x0: number;
  y0: number;
  w: number;
  h: number;
  d: Float32Array;
  si: Int32Array;
  sv: Float32Array;
}

interface Burst {
  reel: number;
  col: RGB;
  t0: number;
  tier: number;
  peak: number;
  tau: number;
}

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  col: RGB;
  /** 0 ember, 1 mote, 2 spark, 3 luck (flies to the orb), 4 sparkle, 5 firefly. */
  kind: number;
  seed: number;
}

const BAYER = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));
const STEPS = 10;

const ARCANE: RGB = [0.69, 0.55, 0.96];
const GOLD: RGB = [1.0, 0.8, 0.3];
const GREEN: RGB = [0.45, 1.0, 0.45];
const BLUE: RGB = [0.42, 0.82, 1.0];
const WARM: RGB = [1.0, 0.6, 0.28];
const WHITE: RGB = [1, 1, 1];
const PLUS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function rgbOf(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const FLAME_RAMPS: Record<string, RGB[]> = {
  warm: ['#fffbe0', '#ffe27a', '#ffb43a', '#ff7a1c', '#d8401c'].map(rgbOf),
  golden: ['#ffffff', '#fff3b0', '#ffd24a', '#f5a524', '#c77a14'].map(rgbOf),
  lucky: ['#f4ffe8', '#c8ff9a', '#7cff6b', '#2fbf4a', '#1a7a30'].map(rgbOf),
  turbo: ['#f0fdff', '#b8ecff', '#6fd8ff', '#2a8cf0', '#1c4fb0'].map(rgbOf),
};

/** Premultiplied color (0..1, alpha 0..1) to an RGBA pixel (little-endian 32 bits). */
function pack(r: number, g: number, b: number, a: number): number {
  if (a <= 0.004) return 0;
  if (a > 1) a = 1;
  const inv = 255 / a;
  r *= inv;
  g *= inv;
  b *= inv;
  if (r > 255) r = 255;
  if (g > 255) g = 255;
  if (b > 255) b = 255;
  return ((((a * 255) | 0) << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a: number) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

function makeField(a: AltarArt, L: PointLight): Field {
  const x0 = Math.max(0, Math.floor(L.x - L.r));
  const x1 = Math.min(a.W - 1, Math.ceil(L.x + L.r));
  const y0 = Math.max(0, Math.floor(L.y - L.r));
  const y1 = Math.min(a.H - 1, Math.ceil(L.y + L.r));
  const w = Math.max(0, x1 - x0 + 1);
  const h = Math.max(0, y1 - y0 + 1);
  const d = new Float32Array(w * h);
  const si: number[] = [];
  const sv: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x0 + x;
      const py = y0 + y;
      const i = py * a.W + px;
      const k = a.px[i];
      if (k === EMPTY) continue;
      const dx = L.x - px;
      const dy = L.y - py;
      const dist = Math.hypot(dx, dy);
      if (dist >= L.r) continue;
      const att = Math.pow(1 - dist / L.r, 1.4);
      const len = Math.hypot(dx, dy, L.z);
      const lx = dx / len;
      const ly = dy / len;
      const lz = L.z / len;
      const j = y * w + x;
      if (k === HOLE) {
        d[j] = att * (0.35 + 0.65 * lz);
        continue;
      }
      const nx = a.nrm[i * 3];
      const ny = a.nrm[i * 3 + 1];
      const nz = a.nrm[i * 3 + 2];
      // A little wrap, so light curls round the carving instead of cutting off.
      const ndl = (nx * lx + ny * ly + nz * lz + 0.18) / 1.18;
      d[j] = Math.max(0, ndl) * att;
      const hz = lz + 1;
      const hl = Math.hypot(lx, ly, hz);
      const ndh = (nx * lx + ny * ly + nz * hz) / hl;
      if (ndh > 0 && a.spec[i] > 0) {
        const s = a.spec[i] * Math.pow(ndh, a.shin[i]) * att;
        if (s > 0.004) {
          si.push(i);
          sv.push(s);
        }
      }
    }
  }
  return { x0, y0, w, h, d, si: Int32Array.from(si), sv: Float32Array.from(sv) };
}

export class Altar {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly off: HTMLCanvasElement;
  private readonly offCtx: CanvasRenderingContext2D;
  private img: ImageData | null = null;
  private d32 = new Uint32Array(0);
  private art: AltarArt | null = null;
  private W = 0;
  private H = 0;
  // Light (diffuse and highlights), the lit base (relit at 30 Hz), and the frame being drawn (premultiplied).
  private LR = new Float32Array(0);
  private LG = new Float32Array(0);
  private LB = new Float32Array(0);
  private SR = new Float32Array(0);
  private SG = new Float32Array(0);
  private SB = new Float32Array(0);
  private bR = new Float32Array(0);
  private bG = new Float32Array(0);
  private bB = new Float32Array(0);
  private bA = new Float32Array(0);
  private oR = new Float32Array(0);
  private oG = new Float32Array(0);
  private oB = new Float32Array(0);
  private oA = new Float32Array(0);
  private levels = new Float32Array(0);
  /** The lit base as finished pixels, and which pixels this frame's overlays touched. */
  private base32 = new Uint32Array(0);
  private touched = new Uint8Array(0);
  private list = new Int32Array(0);
  private listN = 0;
  /** The circle's rings: floor pixels and their weights (the far side dimmer). */
  private ringI = new Int32Array(0);
  private ringW = new Float32Array(0);
  private fields: {
    flames: Field[];
    orb: Field | null;
    sigil: Field | null;
    emblem: Field | null;
    gems: Field[];
    runes: Field[];
    reels: Field[];
  } = { flames: [], orb: null, sigil: null, emblem: null, gems: [], runes: [], reels: [] };
  private dirty = true;
  private tick = 0;
  /** What relighting the whole altar costs on this device (ms, eased): it's spread over more frames if slow. */
  private relightCost = 0;
  private last = 0;
  private activity = 0;
  private build = 0;
  private fill = 0.1;
  private surge = 0;
  private chase = 0;
  private rot = 0;
  private flashUntil = 0;
  private orbFlash = 0;
  private orbFlashCol: RGB = WHITE;
  private tint: RGB = WARM;
  private amb: RGB = [0.36, 0.3, 0.38];
  private runeCol: RGB = ARCANE;
  private orbCol: RGB = ARCANE;
  private bursts: Burst[] = [];
  private rings: Array<{ x: number; y: number; t0: number; col: RGB; r1: number }> = [];
  private parts: Part[] = [];
  private seed = 1;
  private spawn: number[] = [0, 0, 0];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.off = document.createElement('canvas');
    this.offCtx = this.off.getContext('2d')!;
  }

  get canvasEl(): HTMLCanvasElement {
    return this.canvas;
  }

  setArt(art: AltarArt): void {
    this.art = art;
    this.W = art.W;
    this.H = art.H;
    const n = art.W * art.H;
    this.canvas.width = art.W;
    this.canvas.height = art.H;
    this.off.width = art.W;
    this.off.height = art.H;
    this.img = this.offCtx.createImageData(art.W, art.H);
    this.d32 = new Uint32Array(this.img.data.buffer);
    for (const k of ['LR', 'LG', 'LB', 'SR', 'SG', 'SB', 'bR', 'bG', 'bB', 'bA', 'oR', 'oG', 'oB', 'oA'] as const) this[k] = new Float32Array(n);
    this.base32 = new Uint32Array(n);
    this.touched = new Uint8Array(n);
    this.list = new Int32Array(n);
    this.listN = 0;
    this.levels = new Float32Array(art.runes.length);
    const L = art.lights;
    this.fields = {
      flames: L.flames.map((l) => makeField(art, l)),
      orb: makeField(art, L.orb),
      sigil: L.sigil ? makeField(art, L.sigil) : null,
      emblem: L.emblem ? makeField(art, L.emblem) : null,
      gems: L.gems.map((l) => makeField(art, l)),
      runes: L.runes.map((l) => makeField(art, l)),
      reels: L.reels.map((l) => makeField(art, l)),
    };
    // The circle's three rings, on the floor only (the plinth hides the far side).
    const ring = new Map<number, number>();
    const sg = art.sigil;
    if (sg) {
      for (const [k, w] of [
        [1, 1],
        [0.97, 0.55],
        [0.8, 0.7],
      ]) {
        const steps = Math.ceil(Math.PI * 2 * sg.rx * k);
        for (let s = 0; s < steps; s++) {
          const ang = (s / steps) * Math.PI * 2;
          const sn = Math.sin(ang);
          const x = Math.round(sg.x + Math.cos(ang) * sg.rx * k);
          const y = Math.round(sg.y + sn * sg.ry * k);
          if (x < 0 || y < 0 || x >= art.W || y >= art.H) continue;
          const i = y * art.W + x;
          if (art.px[i] !== EMPTY) continue;
          ring.set(i, Math.max(ring.get(i) ?? 0, w * (sn > 0 ? 1 : 0.5)));
        }
      }
    }
    this.ringI = Int32Array.from(ring.keys());
    this.ringW = Float32Array.from(ring.values());
    this.bursts = this.bursts.filter((b) => b.reel < L.reels.length);
    this.parts = [];
    this.dirty = true;
  }

  /** A reel stopped on a find of rarity index `tier` in `color`: light floods the frame from it. */
  land(tier: number, reel: number, color: string, calm: boolean, now = performance.now()): void {
    const col = tier <= 0 ? ([0.92, 0.9, 0.86] as RGB) : rgbOf(color);
    const peak = calm ? 0.45 + tier * 0.07 : Math.min(3.4, 0.75 + tier * 0.24);
    const tau = calm ? 0.5 + tier * 0.05 : 0.22 + tier * 0.09;
    this.bursts.push({ reel, col, t0: now, tier, peak, tau });
    if (this.bursts.length > 8) this.bursts.shift();
    this.dirty = true;
    if (!calm) this.flashUntil = now + (tier >= 2 ? 240 : 140);
    if (tier >= 3) {
      this.orbFlash = calm ? 0.5 : 1;
      this.orbFlashCol = col;
    }
    const a = this.art;
    if (!a || calm) return;
    const r = a.lights.reels[reel];
    if (!r) return;
    // Sparks thrown over the frame, and a shock ring for Legendary and up.
    const n = tier >= 2 ? Math.min(44, 6 + tier * 3) : 0;
    const big = a.kind === 'big';
    for (let k = 0; k < n; k++) {
      const ang = this.rnd() * Math.PI * 2;
      const sp = (big ? 40 : 22) + this.rnd() * (big ? 70 : 34) + tier * 4;
      this.parts.push({ x: r.x, y: r.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.75 - 12, age: 0, life: 0.45 + this.rnd() * 0.5, col: this.rnd() < 0.3 ? WHITE : col, kind: 2, seed: this.rnd() });
    }
    if (tier >= 4) this.rings.push({ x: r.x, y: r.y, t0: now, col, r1: Math.max(a.W, a.H) * (big ? 0.75 : 0.9) });
  }

  /** A luck token landed on reel `reel`: green motes fly from it into the orb, which surges. */
  token(reel: number, calm: boolean): void {
    this.surge = Math.min(1.5, this.surge + 0.45);
    this.dirty = true;
    const a = this.art;
    const r = a?.lights.reels[reel];
    if (!a || !r) return;
    const n = calm ? 3 : 9;
    for (let k = 0; k < n; k++) {
      const ang = this.rnd() * Math.PI * 2;
      this.parts.push({ x: r.x + Math.cos(ang) * 4, y: r.y + Math.sin(ang) * 3, vx: Math.cos(ang) * 30, vy: -20 - this.rnd() * 30, age: -k * 0.03, life: 2.5, col: [0.5, 1, 0.45], kind: 3, seed: this.rnd() });
    }
  }

  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Starts pixel `i` from the lit base, once a frame, before anything draws on it. */
  private touch(i: number): void {
    if (this.touched[i]) return;
    this.touched[i] = 1;
    this.list[this.listN++] = i;
    this.oR[i] = this.bR[i];
    this.oG[i] = this.bG[i];
    this.oB[i] = this.bB[i];
    this.oA[i] = this.bA[i];
  }

  /** Adds light (premultiplied) to pixel `i`. */
  private add(i: number, r: number, g: number, b: number, al: number): void {
    this.touch(i);
    this.oR[i] += r * al;
    this.oG[i] += g * al;
    this.oB[i] += b * al;
    const A = this.oA[i] + al;
    this.oA[i] = A > 1 ? 1 : A;
  }

  private addXY(x: number, y: number, r: number, g: number, b: number, al: number): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.W || yi >= this.H) return;
    this.add(yi * this.W + xi, r, g, b, al);
  }

  /** A small glow in hard bands, straight into the pixels. */
  private haloPx(x: number, y: number, r: number, c: RGB, a: number): void {
    if (a < 0.01) return;
    const cx = Math.round(x);
    const cy = Math.round(y);
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= this.H) continue;
      for (let dx = -ri; dx <= ri; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= this.W) continue;
        const d = Math.sqrt(dx * dx + dy * dy) / r;
        if (d >= 1) continue;
        const v = a * (d < 0.3 ? 1 : d < 0.6 ? 0.5 : 0.22 * (1 - (d - 0.6) / 0.4));
        this.add(yy * this.W + xx, c[0], c[1], c[2], v);
      }
    }
  }

  /** Draws a frame `now` ms (performance.now()). */
  frame(now: number, sig: AltarSignals): void {
    const a = this.art;
    const img = this.img;
    if (!a || !img) return;
    const dt = Math.max(0, Math.min(0.1, (now - (this.last || now)) / 1000));
    this.last = now;
    const t = now / 1000;
    const calm = sig.calm;
    const W = a.W;
    const H = a.H;
    const n = W * H;
    const big = a.kind === 'big';

    // ---------------------------------------------------------------- the state, eased
    this.activity += ((sig.spinning ? 1 : 0) - this.activity) * Math.min(1, dt * (sig.spinning ? 5 : 1.6));
    this.build += ((sig.glow ? sig.glowStrength / 3 : 0) - this.build) * Math.min(1, dt * 6);
    this.surge = Math.max(0, this.surge - dt * 0.7);
    this.fill += (Math.min(1, sig.fill + this.surge * 0.3) - this.fill) * Math.min(1, dt * 2.2);
    this.orbFlash = Math.max(0, this.orbFlash - dt * 0.9);
    const modeCol = sig.mode === 'golden' ? GOLD : sig.mode === 'lucky' ? GREEN : sig.mode === 'turbo' ? BLUE : null;
    const glowCol = sig.glow ? rgbOf(sig.glow) : null;
    const winCol = sig.win ? rgbOf(sig.win) : null;
    const ease = Math.min(1, dt * 4);
    const ambT: RGB = sig.mode === 'golden' ? [0.5, 0.4, 0.24] : sig.mode === 'lucky' ? [0.3, 0.42, 0.3] : sig.mode === 'turbo' ? [0.28, 0.35, 0.5] : [0.36, 0.3, 0.38];
    this.amb = mix(this.amb, ambT, ease);
    this.tint = mix(this.tint, sig.mode === 'golden' ? [1, 0.78, 0.36] : sig.mode === 'lucky' ? [0.5, 1, 0.5] : sig.mode === 'turbo' ? [0.45, 0.72, 1] : WARM, ease);
    this.runeCol = mix(this.runeCol, glowCol ?? winCol ?? modeCol ?? ARCANE, Math.min(1, dt * (glowCol ? 14 : 4)));
    this.orbCol = mix(this.orbCol, glowCol ?? winCol ?? modeCol ?? ARCANE, Math.min(1, dt * (glowCol ? 14 : 3)));
    const orbCol = mix(this.orbCol, this.orbFlashCol, Math.min(1, this.orbFlash));
    const flash = !calm && now < this.flashUntil;
    this.rot += dt * (calm ? 0.12 : 0.25 + 1.3 * this.activity + 3.2 * this.build);
    this.chase += dt * (this.build > 0.05 ? 18 : 10);
    const ramp = FLAME_RAMPS[sig.mode ?? 'warm'];
    const sigilCol = glowCol ?? winCol ?? modeCol ?? ARCANE;
    const runeCol = flash ? WHITE : this.runeCol;
    const gemCol = flash ? WHITE : glowCol ?? winCol ?? mix(this.runeCol, WHITE, 0.2);
    const win = !sig.spinning && !!winCol;
    const gemI = 0.35 + 0.5 * this.build + (flash ? 0.8 : 0) + (win ? 0.4 : 0);
    const embI = 0.3 + 0.3 * this.activity + 0.5 * this.build + (win ? 0.4 : 0);
    const flick = a.flames.map((_, k) =>
      calm ? 0.95 + 0.04 * Math.sin(t * 2.1 + k * 2) : 0.8 + 0.1 * Math.sin(t * 11.3 + k * 1.7) + 0.07 * Math.sin(t * 23.7 + k * 3.1) + 0.05 * Math.sin(t * 5.3 + k),
    );
    // Runes: a chase while spinning (racing in the glow's color while it builds), all lit after a win,
    // a white flash on a landing, slow breathing at rest.
    const nR = a.runes.length;
    const levels = this.levels;
    const busy = Math.max(this.activity, this.build);
    for (const r of a.runes) {
      let v: number;
      if (calm) v = win ? 0.85 : sig.spinning || this.build > 0.05 ? 0.55 : 0.2;
      else if (flash) v = 1;
      else if (win) v = Math.floor(t / 0.18) % 2 ? 1 : 0.45;
      else if (busy > 0.05) {
        const heads = this.build > 0.05 ? 4 : 3;
        v = 0.08;
        for (let h = 0; h < heads; h++) {
          const head = (this.chase + (h * nR) / heads) % nR;
          const dist = (head - r.order + nR * 2) % nR;
          if (dist < 4) v = Math.max(v, Math.exp(-dist / 1.3));
        }
        v = v * busy + (0.1 + 0.08 * Math.sin(t * 1.6 - r.order * 0.5)) * (1 - busy);
      } else v = 0.1 + 0.08 * Math.sin(t * 1.6 - r.order * 0.5);
      levels[r.order] = v;
    }
    // Landing bursts (their light, and where they bloom).
    const blooms: Array<{ x: number; y: number; col: RGB; I: number; tier: number; e: number }> = [];
    const burstI: number[] = [];
    this.bursts = this.bursts.filter((b) => {
      const e = (now - b.t0) / 1000;
      const I = b.peak * (e < 0.04 ? e / 0.04 : Math.exp(-(e - 0.04) / b.tau));
      if (e > 0.04 && I < 0.01) return false;
      burstI.push(I);
      const r = a.lights.reels[b.reel];
      if (r) blooms.push({ x: r.x, y: r.y, col: b.col, I, tier: b.tier, e });
      return true;
    });

    // ---------------------------------------------------------------- the lit wood (row by row)
    // A share of the rows each frame, keeping it to about half a millisecond on slow devices.
    const every = Math.max(big ? 3 : 2, Math.min(8, Math.ceil(this.relightCost / 0.5)));
    const phase = this.dirty ? -1 : this.tick++ % every;
    const r0 = performance.now();
    this.relight(a, phase, every, flick, levels, runeCol, orbCol, sigilCol, gemCol, gemI, embI, burstI);
    const spent = (performance.now() - r0) * (phase < 0 ? 1 : every);
    this.relightCost = this.relightCost ? this.relightCost * 0.92 + spent * 0.08 : spent;
    this.dirty = false;
    const { oR, oG, oB } = this;

    // ---------------------------------------------------------------- what shines on its own
    // The magic circle on the floor (behind the plinth: only where nothing is painted).
    const sg = a.sigil;
    if (sg) {
      const v0 = Math.min(1.5, 0.62 + 0.38 * this.activity + 0.75 * this.build + (flash ? 0.3 : 0));
      const sr = sigilCol[0];
      const sgc = sigilCol[1];
      const sb = sigilCol[2];
      for (let k = 0; k < this.ringI.length; k++) {
        const v = v0 * this.ringW[k];
        this.add(this.ringI[k], sr * v, sgc * v, sb * v, v > 1 ? 1 : v);
      }
      const plot = (x: number, y: number, v: number) => {
        const xi = Math.round(x);
        const yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
        const i = yi * W + xi;
        if (a.px[i] !== EMPTY) return;
        this.add(i, sr * v, sgc * v, sb * v, v > 1 ? 1 : v);
      };
      // Rune marks round the band between the rings, turning.
      for (let s = 0; s < 18; s++) {
        const ang = this.rot * 0.6 + (s / 18) * Math.PI * 2;
        const mx = sg.x + Math.cos(ang) * sg.rx * 0.89;
        const my = sg.y + Math.sin(ang) * sg.ry * 0.89;
        const f = v0 * (Math.sin(ang) > 0 ? 1 : 0.5);
        plot(mx, my, f);
        if (s % 2 === 0) {
          plot(mx - 1, my, f * 0.8);
          plot(mx + 1, my, f * 0.8);
        } else {
          plot(mx, my - 1, f * 0.8);
          plot(mx, my + 1, f * 0.8);
        }
      }
      // A star turning the other way.
      for (let s = 0; s < 6; s++) {
        const a0 = -this.rot + (s / 6) * Math.PI * 2;
        const a1 = -this.rot + (((s + 2) % 6) / 6) * Math.PI * 2;
        const x0 = sg.x + Math.cos(a0) * sg.rx * 0.8;
        const y0 = sg.y + Math.sin(a0) * sg.ry * 0.8;
        const x1 = sg.x + Math.cos(a1) * sg.rx * 0.8;
        const y1 = sg.y + Math.sin(a1) * sg.ry * 0.8;
        const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
        for (let q = 0; q <= steps; q++) {
          const f = q / Math.max(1, steps);
          const depth = Math.sin(a0) + (Math.sin(a1) - Math.sin(a0)) * f;
          plot(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, v0 * 0.7 * (depth > 0 ? 1 : 0.55));
        }
      }
    }
    // Runes: their glyphs shine, the slot round them glows a little; lit ones throw a small glow.
    for (const r of a.runes) {
      const v = levels[r.order];
      const w = Math.max(0, v - 0.75) * 1.6;
      const s = 0.12 + v * 1.25;
      const cr = (runeCol[0] + (1 - runeCol[0]) * w) * s;
      const cg = (runeCol[1] + (1 - runeCol[1]) * w) * s;
      const cb = (runeCol[2] + (1 - runeCol[2]) * w) * s;
      for (const i of r.glyph) this.add(i, cr, cg, cb, 1);
      const hv = v * 0.16;
      for (const i of r.halo) this.add(i, runeCol[0] * hv, runeCol[1] * hv, runeCol[2] * hv, 1);
      if (big && v > 0.45) this.haloPx(r.x, r.y, 5, runeCol, 0.13 * v);
    }
    if (a.emblem) {
      const s = 0.4 + embI * 0.9;
      const c = mix(runeCol, WHITE, 0.25);
      for (const i of a.emblem.px) this.add(i, c[0] * s, c[1] * s, c[2] * s, 1);
    }
    for (const gm of a.gems) {
      const s = 0.5 + gemI * 0.8;
      const glint = mix(gemCol, WHITE, 0.6);
      gm.px.forEach((i, k) => {
        const c = k === 0 ? glint : gemCol;
        this.add(i, c[0] * s, c[1] * s, c[2] * s, 1);
      });
      this.haloPx(gm.x, gm.y, 5, gemCol, 0.1 + 0.1 * gemI);
    }
    // Mini: each window's rim in its find's color.
    if (sig.rims) {
      a.rims.forEach((rim, k) => {
        const hex = sig.rims?.[k];
        if (!hex) return;
        const c = rgbOf(hex);
        for (const i of rim) {
          this.touch(i);
          oR[i] = c[0] * 0.85 + oR[i] * 0.15;
          oG[i] = c[1] * 0.85 + oG[i] * 0.15;
          oB[i] = c[2] * 0.85 + oB[i] * 0.15;
        }
      });
    }
    // Blossoms on the vines, pulsing slowly.
    for (const b of a.blossoms) {
      const c = rgbOf(b.col);
      const v = 0.55 + 0.45 * Math.sin(t * (calm ? 0.6 : 1.3) + b.phase);
      this.add(b.i, c[0] * v, c[1] * v, c[2] * v, 1);
      this.haloPx(b.x, b.y, 3, c, 0.16 + 0.1 * v);
    }
    // Coals and flames.
    const flameScale = 1 + 0.15 * this.activity + 0.3 * this.build;
    a.flames.forEach((f, k) => {
      const s = 0.55 + 0.45 * flick[k];
      for (const i of f.coals) {
        const h = Math.sin(t * (calm ? 2 : 9) + i * 1.37) * 0.5 + 0.5;
        const c = h > 0.66 ? ramp[1] : h > 0.33 ? ramp[2] : ramp[3];
        this.add(i, c[0] * s, c[1] * s, c[2] * s, 1);
      }
      this.drawFlame(f, calm ? t * 0.45 : t, flameScale * (0.9 + 0.12 * flick[k]), ramp, k, calm);
    });
    // The orb.
    this.drawOrb(a, orbCol, t, calm);

    // ---------------------------------------------------------------- motes, embers, sparks, fireflies
    this.updateParts(a, dt, t, calm, sigilCol, ramp);
    for (const p of this.parts) {
      if (p.age < 0) continue;
      const k = p.age / p.life;
      if (p.kind === 5) {
        // A firefly: blinking slowly, fading in and out over its life.
        const env = Math.min(1, p.age / 0.8, (p.life - p.age) / 0.8);
        const b = env * Math.pow(Math.max(0, Math.sin(t * (calm ? 1.1 : 1.9) + p.seed * 6.28)), 2);
        const s = 0.5 + 0.7 * b;
        this.addXY(p.x, p.y, p.col[0] * s, p.col[1] * s, p.col[2] * s, 0.25 + 0.75 * b);
        if (b > 0.05) this.haloPx(p.x, p.y, big ? 4 : 3, p.col, 0.3 * b);
      } else if (p.kind === 0) {
        const c0 = ramp[1];
        const c1 = ramp[4];
        this.addXY(p.x, p.y, c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k, 1 - k);
      } else if (p.kind === 1) {
        this.addXY(p.x, p.y, p.col[0] * 0.9, p.col[1] * 0.9, p.col[2] * 0.9, Math.sin(Math.PI * k) * 0.85);
      } else if (p.kind === 2) {
        if (k > 0.7 && Math.floor(p.age * 20) % 2) continue;
        this.addXY(p.x, p.y, p.col[0], p.col[1], p.col[2], 1);
      } else if (p.kind === 3) {
        this.addXY(p.x, p.y, p.col[0], p.col[1], p.col[2], 1);
        this.addXY(p.x - p.vx * 0.02, p.y - p.vy * 0.02, p.col[0] * 0.6, p.col[1] * 0.6, p.col[2] * 0.6, 0.5);
      } else {
        this.addXY(p.x, p.y, 1, 1, 1, 1);
        if (k >= 0.3 && k <= 0.75) for (const [dx, dy] of PLUS) this.addXY(p.x + dx, p.y + dy, p.col[0], p.col[1], p.col[2], 0.75);
      }
    }

    // ---------------------------------------------------------------- to pixels
    const d32 = this.d32;
    d32.set(this.base32);
    const { oA, list, touched } = this;
    for (let k = 0; k < this.listN; k++) {
      const i = list[k];
      touched[i] = 0;
      d32[i] = pack(oR[i], oG[i], oB[i], oA[i]);
    }
    this.listN = 0;
    this.offCtx.putImageData(img, 0, 0);
    void n;

    // ---------------------------------------------------------------- compose with the soft glows
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    const o = a.orb;
    // Behind: an aura round the crest, a warm haze round the flames, the orb's rays turning, the circle's glow.
    this.halo(o.x, o.y + (big ? 14 : 4), big ? W * 0.46 : W * 0.55, orbCol, (big ? 0.11 : 0.07) + 0.12 * this.fill + 0.12 * this.build);
    a.flames.forEach((f, k) => this.halo(f.x, f.y - f.h * 0.4, big ? 30 : 10, this.tint, (big ? 0.16 : 0.12) * flick[k]));
    const rayA = 0.04 + 0.16 * this.fill + 0.12 * this.surge + 0.15 * this.orbFlash + 0.08 * this.build;
    if (rayA > 0.02) {
      const len = big ? 34 + 26 * this.fill : 12 + 8 * this.fill;
      const spokes = big ? 12 : 8;
      const grad = g.createRadialGradient(o.x, o.y, o.r, o.x, o.y, len);
      grad.addColorStop(0, css(orbCol, rayA));
      grad.addColorStop(1, css(orbCol, 0));
      g.fillStyle = grad;
      g.beginPath();
      for (let s = 0; s < spokes; s++) {
        const ang = this.rot * 0.35 + (s / spokes) * Math.PI * 2;
        g.moveTo(o.x, o.y);
        g.lineTo(o.x + Math.cos(ang - 0.07) * len, o.y + Math.sin(ang - 0.07) * len);
        g.lineTo(o.x + Math.cos(ang + 0.07) * len, o.y + Math.sin(ang + 0.07) * len);
        g.closePath();
      }
      g.fill();
    }
    if (sg) {
      g.save();
      g.translate(sg.x, sg.y);
      g.scale(1, sg.ry / sg.rx);
      this.halo(0, 0, sg.rx * 1.1, sigilCol, 0.04 + 0.06 * this.activity + 0.14 * this.build);
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    g.drawImage(this.off, 0, 0);
    g.globalCompositeOperation = 'lighter';
    // In front: the flames and the orb glow; landings bloom and ring; shafts of light while spinning.
    a.flames.forEach((f, k) => this.halo(f.x, f.y - f.h * 0.35, big ? 15 : 6, this.tint, (big ? 0.3 : 0.22) * flick[k] * (1 + 0.3 * this.build)));
    this.halo(o.x, o.y, o.r * 1.6 + (o.r * 2.2 + 2) * this.fill + this.surge * 5, orbCol, 0.16 + 0.3 * this.fill + 0.3 * this.surge + 0.35 * this.orbFlash);
    for (const b of blooms) {
      const r = (big ? 16 : 8) + b.tier * (big ? 6 : 3) + b.e * (big ? 50 : 20);
      this.halo(b.x, b.y, r, b.col, Math.min(0.6, b.I * (calm ? 0.12 : 0.2)));
      if (!calm && b.tier >= 2 && b.e < 0.09) this.halo(b.x, b.y, r * 0.6, WHITE, 0.45 * (1 - b.e / 0.09));
    }
    this.rings = this.rings.filter((r) => {
      const e = (now - r.t0) / 520;
      if (e >= 1) return false;
      g.strokeStyle = css(mix(r.col, WHITE, 0.4), (1 - e) * 0.85);
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(r.x, r.y, 4 + r.r1 * e, (4 + r.r1 * e) * 0.62, 0, 0, Math.PI * 2);
      g.stroke();
      return true;
    });
    const shaftA = (calm ? 0.5 : 1) * (0.09 * this.activity + 0.1 * this.build);
    if (shaftA > 0.006) {
      const col = glowCol ?? (modeCol ? mix(modeCol, WHITE, 0.4) : ([1, 0.9, 0.72] as RGB));
      for (let s = 0; s < (big ? 3 : 2); s++) {
        const x0 = W * (0.18 + 0.3 * s) + (calm ? 0 : Math.sin(t * 0.3 + s * 2.1) * W * 0.06);
        const tw = big ? 6 + s * 3 : 3 + s;
        const bw = big ? 16 + s * 5 : 7 + s * 2;
        const slant = W * 0.14;
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, css(col, shaftA * (0.8 + 0.2 * Math.sin(t * 1.7 + s))));
        grad.addColorStop(0.7, css(col, shaftA * 0.35));
        grad.addColorStop(1, css(col, 0));
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(x0, 0);
        g.lineTo(x0 + tw, 0);
        g.lineTo(x0 + tw + slant + (bw - tw), H);
        g.lineTo(x0 + slant, H);
        g.closePath();
        g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  /**
   * Lights the wood: every light's falloff scaled by its strength, banded and dithered, times the albedo.
   * `phase` relights only the rows y % `every` === phase (-1: all of them).
   */
  private relight(a: AltarArt, phase: number, every: number, flick: number[], levels: Float32Array, runeCol: RGB, orbCol: RGB, sigilCol: RGB, gemCol: RGB, gemI: number, embI: number, burstI: number[]): void {
    const W = a.W;
    const H = a.H;
    const step = phase < 0 ? 1 : every;
    const first = phase < 0 ? 0 : phase;
    const base32 = this.base32;
    const big = a.kind === 'big';
    const { LR, LG, LB, SR, SG, SB, bR, bG, bB, bA } = this;
    LR.fill(0);
    LG.fill(0);
    LB.fill(0);
    SR.fill(0);
    SG.fill(0);
    SB.fill(0);
    const apply = (f: Field | null, c: RGB, I: number) => {
      if (!f || I < 0.004) return;
      const r = c[0] * I;
      const g = c[1] * I;
      const b = c[2] * I;
      const d = f.d;
      for (let y = (((first - f.y0) % step) + step) % step; y < f.h; y += step) {
        let i = (f.y0 + y) * W + f.x0;
        let j = y * f.w;
        for (let x = 0; x < f.w; x++, i++, j++) {
          const dv = d[j];
          LR[i] += r * dv;
          LG[i] += g * dv;
          LB[i] += b * dv;
        }
      }
      const si = f.si;
      const sv = f.sv;
      for (let k = 0; k < si.length; k++) {
        const i = si[k];
        if (step > 1 && ((i / W) | 0) % step !== first) continue;
        const s = sv[k];
        SR[i] += r * s;
        SG[i] += g * s;
        SB[i] += b * s;
      }
    };
    const flameI = (big ? 1.5 : 1.0) * (1 + 0.15 * this.activity + 0.35 * this.build);
    this.fields.flames.forEach((f, k) => apply(f, this.tint, flameI * flick[k]));
    apply(this.fields.orb, orbCol, 0.45 + 1.1 * this.fill + 0.5 * this.surge + 0.8 * this.orbFlash);
    if (big) apply(this.fields.sigil, sigilCol, 0.5 + 0.4 * this.activity + 0.8 * this.build);
    a.runes.forEach((r, k) => apply(this.fields.runes[k], runeCol, levels[r.order] * (big ? 0.5 : 0.35)));
    this.fields.gems.forEach((f) => apply(f, gemCol, gemI));
    apply(this.fields.emblem, runeCol, embI);
    this.bursts.forEach((b, k) => apply(this.fields.reels[b.reel] ?? null, b.col, burstI[k] ?? 0));

    const px = a.px;
    const shade = a.shade;
    const alb = a.alb;
    const nrm = a.nrm;
    const ar = this.amb[0];
    const ag = this.amb[1];
    const ab = this.amb[2];
    for (let y = first; y < H; y += step) {
      const brow = (y & 3) << 2;
      for (let x = 0, i = y * W; x < W; x++, i++) {
        const k = px[i];
        if (k === EMPTY) continue;
        const dith = BAYER[brow + (x & 3)];
        const l0 = LR[i];
        const l1 = LG[i];
        const l2 = LB[i];
        if (k === HOLE) {
          // Light spilling over the reels, and the frame's shadow on them.
          const m = l0 > l1 ? (l0 > l2 ? l0 : l2) : l1 > l2 ? l1 : l2;
          let la = m > 0.02 ? m * 0.2 : 0;
          if (la > 0.42) la = 0.42;
          la = ((la * 12 + dith) | 0) / 12;
          const inv = m > 0 ? la / m : 0;
          bR[i] = l0 * inv;
          bG[i] = l1 * inv;
          bB[i] = l2 * inv;
          bA[i] = la + shade[i] * (1 - la);
          base32[i] = pack(bR[i], bG[i], bB[i], bA[i]);
          continue;
        }
        // Light from above a little brighter (a sky-ish ambient), then the lights, banded.
        let ak = 0.86 - 0.34 * nrm[i * 3 + 1];
        if (ak < 0.55) ak = 0.55;
        else if (ak > 1.2) ak = 1.2;
        let lr = ar * ak + l0;
        let lg = ag * ak + l1;
        let lb = ab * ak + l2;
        const m = lr > lg ? (lr > lb ? lr : lb) : lg > lb ? lg : lb;
        if (m > 0) {
          const s = ((m * STEPS + dith) | 0) / STEPS / m;
          lr *= s;
          lg *= s;
          lb *= s;
        }
        let r = alb[i * 3] * lr + SR[i];
        let g = alb[i * 3 + 1] * lg + SG[i];
        let b = alb[i * 3 + 2] * lb + SB[i];
        const mm = r > g ? (r > b ? r : b) : g > b ? g : b;
        if (mm > 1) {
          // Too bright: it blows out toward white.
          let e = (mm - 1) * 0.5;
          if (e > 1) e = 1;
          const f = (1 - e) / mm;
          r = r * f + e;
          g = g * f + e;
          b = b * f + e;
        }
        bR[i] = r;
        bG[i] = g;
        bB[i] = b;
        bA[i] = 1;
        base32[i] = pack(r, g, b, 1);
      }
    }
  }

  /** A glow round (x, y): hard-edged bands (pixel-art light), fading out at radius `r`. */
  private halo(x: number, y: number, r: number, c: RGB, a: number): void {
    if (a < 0.006 || r < 1) return;
    const g = this.ctx;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, css(c, a));
    grad.addColorStop(0.28, css(c, a));
    grad.addColorStop(0.28, css(c, a * 0.55));
    grad.addColorStop(0.56, css(c, a * 0.55));
    grad.addColorStop(0.56, css(c, a * 0.24));
    grad.addColorStop(1, css(c, 0));
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /** A flame: columns of fire licking up from the coals, white at the core to red at the tips. */
  private drawFlame(f: Flame, t: number, scale: number, ramp: RGB[], side: number, calm: boolean): void {
    const H = f.h * scale;
    let top = 0;
    for (let c = -f.hw; c <= f.hw; c++) {
      const prof = 1 - (c / (f.hw + 1)) ** 2;
      const nz = 0.74 + 0.16 * Math.sin(t * 13.7 + c * 1.9 + side * 2.3) + 0.1 * Math.sin(t * 7.1 - c * 2.7 + side);
      const colH = Math.max(1, Math.round(H * Math.pow(prof, 0.7) * nz));
      top = Math.max(top, colH);
      for (let j = 0; j < colH; j++) {
        const fr = j / colH;
        const sway = Math.round(Math.sin(t * 9 + j * 0.55 + side) * fr * (calm ? 0.6 : 1.4));
        let band = fr < 0.2 ? 0 : fr < 0.42 ? 1 : fr < 0.66 ? 2 : fr < 0.86 ? 3 : 4;
        if (Math.abs(c) <= f.hw * 0.34 && fr < 0.55 && band > 0) band -= 1;
        const col = ramp[band];
        this.addXY(f.x + c + sway, f.y - j, col[0], col[1], col[2], band >= 4 ? 0.7 : 1);
      }
    }
    // A loose tongue above now and then.
    if (Math.sin(t * 17 + side * 5) > 0.55) {
      const col = ramp[3];
      this.addXY(f.x + Math.round(Math.sin(t * 6 + side) * 1.2), f.y - top - 1, col[0], col[1], col[2], 0.75);
    }
  }

  /** The orb: glass with liquid light inside, filling as luck rises, a wavy surface, bubbles, a glint, a mist. */
  private drawOrb(a: AltarArt, col: RGB, t: number, calm: boolean): void {
    const o = a.orb;
    const W = a.W;
    const { oR, oG, oB, oA } = this;
    const R = o.r;
    const tt = calm ? t * 0.35 : t;
    const surf0 = o.y + R - 2 * R * Math.max(0.06, this.fill);
    const deep = mix(col, [0.1, 0.03, 0.2], 0.55);
    const lite = mix(col, WHITE, 0.2);
    const top = mix(col, WHITE, 0.55);
    const rim = mix(col, WHITE, 0.15);
    const glass: RGB = mix([0.07, 0.04, 0.13], col, 0.14);
    const mist = mix(glass, col, 0.32);
    for (let y = Math.floor(o.y - R - 1); y <= Math.ceil(o.y + R + 1); y++) {
      for (let x = Math.floor(o.x - R - 1); x <= Math.ceil(o.x + R + 1); x++) {
        if (x < 0 || y < 0 || x >= W || y >= a.H) continue;
        const d = Math.hypot(x - o.x, y - o.y);
        if (d > R + 0.5) continue;
        const i = y * W + x;
        this.touch(i);
        let r: number;
        let g: number;
        let b: number;
        if (d > R - 0.5) {
          r = rim[0] * 0.55;
          g = rim[1] * 0.55;
          b = rim[2] * 0.55;
        } else {
          const surf = surf0 + Math.sin((x - o.x) * 0.9 + tt * 3) * 0.7;
          if (y >= surf) {
            if (y - surf < 1.2) {
              r = top[0];
              g = top[1];
              b = top[2];
            } else {
              const lit = 0.5 + 0.5 * (1 - d / R);
              r = deep[0] + (lite[0] - deep[0]) * lit;
              g = deep[1] + (lite[1] - deep[1]) * lit;
              b = deep[2] + (lite[2] - deep[2]) * lit;
            }
          } else {
            // A slow mist swirling in the empty glass.
            const sw = Math.sin(Math.atan2(y - o.y, x - o.x) * 3 + d * 0.9 - tt * 1.6);
            const c = sw > 0.55 ? mist : glass;
            r = c[0];
            g = c[1];
            b = c[2];
          }
        }
        oR[i] = r;
        oG[i] = g;
        oB[i] = b;
        oA[i] = 1;
      }
    }
    // Bubbles rising through the light.
    const depth = 2 * R * this.fill;
    if (depth > 2) {
      for (let k = 0; k < 3; k++) {
        const bx = Math.round(o.x + Math.sin(k * 2.1 + tt * 0.8) * R * 0.45);
        const by = Math.round(o.y + R - 1 - ((tt * (3 + k) + k * 3.3) % Math.max(1, depth - 1)));
        if (Math.hypot(bx - o.x, by - o.y) < R - 1) {
          const i = by * W + bx;
          oR[i] = Math.min(1, oR[i] + 0.35);
          oG[i] = Math.min(1, oG[i] + 0.35);
          oB[i] = Math.min(1, oB[i] + 0.35);
        }
      }
    }
    // The glint, top left.
    const gl = Math.max(1, Math.round(R * 0.45));
    for (const [dx, dy, v] of [
      [-gl, -gl, 1],
      [-gl + 1, -gl - 1, 0.8],
      [-gl - 1, -gl + 1, 0.55],
    ] as const) {
      const x = Math.round(o.x + dx);
      const y = Math.round(o.y + dy);
      if (Math.hypot(x - o.x, y - o.y) > R - 0.5) continue;
      const i = y * W + x;
      oR[i] = oR[i] * (1 - v) + v;
      oG[i] = oG[i] * (1 - v) + v;
      oB[i] = oB[i] * (1 - v) + v;
    }
  }

  private updateParts(a: AltarArt, dt: number, t: number, calm: boolean, sigilCol: RGB, ramp: RGB[]): void {
    const big = a.kind === 'big';
    const max = big ? 240 : 70;
    // Embers from the flames.
    this.spawn[0] += dt * a.flames.length * (calm ? 1 : (big ? 4 : 1.5) + 7 * this.activity + 10 * this.build);
    while (this.spawn[0] >= 1 && this.parts.length < max && a.flames.length) {
      this.spawn[0] -= 1;
      const ff = a.flames[Math.floor(this.rnd() * a.flames.length)];
      this.parts.push({ x: ff.x + (this.rnd() - 0.5) * ff.hw * 2, y: ff.y - ff.h * 0.6, vx: (this.rnd() - 0.5) * 8, vy: -(10 + this.rnd() * 18), age: 0, life: 0.6 + this.rnd() * 0.9, col: ramp[2], kind: 0, seed: this.rnd() });
    }
    this.spawn[0] = Math.min(this.spawn[0], 2);
    // Motes rising from the circle (big) or the base (mini).
    this.spawn[1] += dt * (calm ? 0.8 : (big ? 3 : 1) + (big ? 12 : 4) * this.activity + (big ? 22 : 8) * this.build);
    while (this.spawn[1] >= 1 && this.parts.length < max) {
      this.spawn[1] -= 1;
      const sg = a.sigil;
      const x = sg ? sg.x + (this.rnd() * 2 - 1) * sg.rx * 0.9 : this.rnd() * a.W;
      const y = sg ? sg.y + (this.rnd() * 2 - 1) * sg.ry * 0.6 : a.H - 2;
      const col = this.rnd() < 0.25 ? mix(sigilCol, WHITE, 0.6) : sigilCol;
      this.parts.push({ x, y, vx: 0, vy: -(6 + this.rnd() * 10) * (big ? 1 : 0.6), age: 0, life: (big ? 2.5 : 1.6) + this.rnd() * 2, col, kind: 1, seed: this.rnd() * 10 });
    }
    this.spawn[1] = Math.min(this.spawn[1], 3);
    // Sparkles round the orb as luck rises.
    this.spawn[2] += dt * (calm ? 0 : this.fill * (big ? 5 : 2.5) + this.surge * 6);
    while (this.spawn[2] >= 1 && this.parts.length < max) {
      this.spawn[2] -= 1;
      const ang = this.rnd() * Math.PI * 2;
      const rr = a.orb.r + 2 + this.rnd() * (big ? 9 : 4);
      this.parts.push({ x: a.orb.x + Math.cos(ang) * rr, y: a.orb.y + Math.sin(ang) * rr * 0.85, vx: 0, vy: 0, age: 0, life: 0.55, col: this.orbCol, kind: 4, seed: 0 });
    }
    this.spawn[2] = Math.min(this.spawn[2], 2);
    // Fireflies drifting round the altar: a few at rest, more while it spins.
    const want = big ? (calm ? 4 : 7 + 6 * this.activity + 8 * this.build) : calm ? 1 : 2 + this.activity;
    let flies = 0;
    for (const p of this.parts) if (p.kind === 5) flies++;
    if (flies < want && this.parts.length < max && this.rnd() < dt * 3) {
      const warm = this.rnd() < 0.35;
      this.parts.push({ x: 4 + this.rnd() * (a.W - 8), y: 4 + this.rnd() * (a.H - 8), vx: 0, vy: 0, age: 0, life: 5 + this.rnd() * 5, col: warm ? [1, 0.82, 0.4] : [0.78, 1, 0.42], kind: 5, seed: this.rnd() });
    }
    const o = a.orb;
    this.parts = this.parts.filter((p) => {
      p.age += dt;
      if (p.age < 0) return true;
      if (p.age >= p.life) return false;
      if (p.kind === 5) {
        const k = calm ? 0.4 : 1;
        p.vx += (this.rnd() - 0.5) * 50 * dt * k;
        p.vy += ((this.rnd() - 0.5) * 50 - 3) * dt * k;
        const keep = Math.pow(0.5, dt);
        p.vx *= keep;
        p.vy *= keep;
        const sp = Math.hypot(p.vx, p.vy);
        const cap = (big ? 9 : 4) * k;
        if (sp > cap) {
          p.vx *= cap / sp;
          p.vy *= cap / sp;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        return p.x > 1 && p.y > 1 && p.x < a.W - 2 && p.y < a.H - 2;
      }
      if (p.kind === 0) {
        p.vy -= 6 * dt;
        p.x += p.vx * dt + Math.sin(t * 5 + p.seed * 9) * 3 * dt;
        p.y += p.vy * dt;
      } else if (p.kind === 1) {
        p.x += Math.sin(t * 1.7 + p.seed) * 5 * dt;
        p.y += p.vy * dt;
      } else if (p.kind === 2) {
        const keep = Math.pow(0.18, dt);
        p.vx *= keep;
        p.vy = p.vy * keep + 50 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else if (p.kind === 3) {
        // Luck flies home to the orb.
        const dx = o.x - p.x;
        const dy = o.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < o.r) {
          this.surge = Math.min(1.5, this.surge + 0.04);
          return false;
        }
        p.vx += (dx / d) * 260 * dt;
        p.vy += (dy / d) * 260 * dt;
        const keep = Math.pow(0.12, dt);
        p.vx *= keep;
        p.vy *= keep;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      return p.y > -4 && p.y < a.H + 4 && p.x > -4 && p.x < a.W + 4;
    });
  }
}
