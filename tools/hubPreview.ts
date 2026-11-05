/**
 * The hub, composed and lit roughly the way the game's shader pipeline does it (render/post.ts): the
 * ground, everything standing y-sorted with the keepers and a knight walking up the path, the
 * framing leaves; then a light map (the night ambient plus every light, smooth falloff, able to push
 * past white), the emissive layer over it, bloom on the brightest parts, a filmic shoulder, the grade
 * and a vignette. Writes the whole hub and a phone-sized and a desktop-sized view, at 3x:
 *
 *   npx tsx tools/hubPreview.ts [out.png] [--raw] [--grid] [--kx=240 --ky=420] [--ambient=#544a6a]
 *
 * --raw also writes the unlit albedo (and albedo + glow); --grid writes the collision grid over the
 * albedo (red: blocked, dark: wall) with each station's keeper (yellow) and talk spot (cyan).
 */
import { blank, rgb, type PixelBuf } from '../src/render/pixel/buf';
import { hubScene, type HubScene } from '../src/world/hub';
import { BLOCKED, FLOOR, TILE } from '../src/world/mapgen';
import { keeperFrame } from '../src/render/art/hubNpcs';
import { knightFrame, knightLook, weaponArt } from '../src/render/art/knights';
import { flipX } from '../src/render/pixel/buf';
import { writePng } from './png';

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) ?? 'shots/hub.png';
const raw = args.includes('--raw');
const opt = (k: string, d: number) => Number(args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const S = 3;

const t0 = Date.now();
const scene = hubScene();
const t1 = Date.now();
const W = scene.w;
const H = scene.h;

// ------------------------------------------------------------------ albedo and glow

const img = blank(W, H);
img.px.set(scene.ground.px);
const emit = blank(W, H);

function draw(dst: PixelBuf, src: PixelBuf, x: number, y: number, flip = false): void {
  for (let sy = 0; sy < src.h; sy++) {
    for (let sx = 0; sx < src.w; sx++) {
      const si = (sy * src.w + (flip ? src.w - 1 - sx : sx)) * 4;
      if (!src.px[si + 3]) continue;
      const X = x + sx;
      const Y = y + sy;
      if (X < 0 || Y < 0 || X >= dst.w || Y >= dst.h) continue;
      const di = (Y * dst.w + X) * 4;
      const a = src.px[si + 3] / 255;
      for (let c = 0; c < 3; c++) dst.px[di + c] = dst.px[di + c] * (1 - a) + src.px[si + c] * a;
      dst.px[di + 3] = 255;
    }
  }
}

/** Glow over glow: alpha compositing that keeps partial alpha (soft halos). */
function drawEmit(src: PixelBuf, x: number, y: number, flip = false): void {
  for (let sy = 0; sy < src.h; sy++) {
    for (let sx = 0; sx < src.w; sx++) {
      const si = (sy * src.w + (flip ? src.w - 1 - sx : sx)) * 4;
      const a = src.px[si + 3] / 255;
      if (!a) continue;
      const X = x + sx;
      const Y = y + sy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const di = (Y * W + X) * 4;
      const da = emit.px[di + 3] / 255;
      const oa = a + da * (1 - a);
      for (let c = 0; c < 3; c++) emit.px[di + c] = (src.px[si + c] * a + emit.px[di + c] * da * (1 - a)) / oa;
      emit.px[di + 3] = oa * 255;
    }
  }
}

/** Clears the emissive layer under a sprite drawn in front of it. */
function mask(src: PixelBuf, x: number, y: number, flip = false): void {
  for (let sy = 0; sy < src.h; sy++) {
    for (let sx = 0; sx < src.w; sx++) {
      const si = (sy * src.w + (flip ? src.w - 1 - sx : sx)) * 4;
      if (!src.px[si + 3]) continue;
      const X = x + sx;
      const Y = y + sy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      emit.px[(Y * W + X) * 4 + 3] = 0;
    }
  }
}

type D = { y: number; draw: () => void };
const list: D[] = [];
for (const s of scene.sprites) {
  list.push({ y: s.y, draw: () => { draw(img, s.buf, s.x - s.ax, s.y - s.ay); mask(s.buf, s.x - s.ax, s.y - s.ay); } });
}
for (const g of scene.emissive) {
  list.push({ y: g.sort + 0.01, draw: () => drawEmit(g.buf, g.x, g.y) });
}
const figures = [...scene.stations.filter((s) => s.def).map((s) => ({ ...s, def: s.def! })), ...scene.extras];
figures.forEach((f, i) => {
  const fr = keeperFrame(f.def, f.pose, f.view, i, f.tool);
  const flip = f.view === 'side' && f.dir < 0;
  const ax = flip ? fr.buf.w - 1 - fr.ax : fr.ax;
  list.push({
    y: f.y,
    draw: () => {
      draw(img, fr.buf, f.x - ax, f.y - fr.ay, flip);
      mask(fr.buf, f.x - ax, f.y - fr.ay, flip);
      if (fr.glow) drawEmit(fr.glow, f.x - ax, f.y - fr.ay, flip);
    },
  });
});
// The player's knight, walking up the path.
const kx = opt('kx', 240);
const ky = opt('ky', 420);
const L = knightLook('legendary-blade', null, 0);
const kf = knightFrame(L, 'walk', 'up', 1);
const wp = weaponArt(L);
list.push({
  y: ky,
  draw: () => {
    const x = kx - 11;
    const y = ky - kf.buf.h + 1;
    draw(img, wp.buf, x + kf.handR[0] - wp.px, y + kf.handR[1] - wp.py + 1);
    draw(img, kf.buf, x, y);
    mask(kf.buf, x, y);
  },
});
list.sort((a, b) => a.y - b.y);
// The player's soft shadow.
for (let yy = -1; yy <= 1; yy++) for (let xx = -5; xx <= 5; xx++) {
  if (Math.abs(xx) > 5 - Math.abs(yy) * 2) continue;
  const i = ((ky + yy) * W + kx + xx) * 4;
  for (let c = 0; c < 3; c++) img.px[i + c] *= 0.6;
}
for (const d of list) d.draw();
for (const f of scene.fore) draw(img, f.buf, f.x, f.y);
void flipX;

if (args.includes('--grid')) {
  const g = blank(W, H);
  g.px.set(img.px);
  for (let ty = 0; ty < scene.map.h; ty++) {
    for (let tx = 0; tx < scene.map.w; tx++) {
      const t = scene.map.tiles[ty * scene.map.w + tx];
      for (let y = ty * TILE; y < ty * TILE + TILE; y++) {
        for (let x = tx * TILE; x < tx * TILE + TILE; x++) {
          const i = (y * W + x) * 4;
          const edge = x % TILE === 0 || y % TILE === 0;
          if (t === BLOCKED) {
            g.px[i] = g.px[i] * 0.5 + 120;
            g.px[i + 1] *= 0.5;
            g.px[i + 2] *= 0.5;
          } else if (t !== FLOOR) {
            for (let c = 0; c < 3; c++) g.px[i + c] *= 0.35;
          } else if (edge) {
            for (let c = 0; c < 3; c++) g.px[i + c] = g.px[i + c] * 0.7 + 60;
          }
        }
      }
    }
  }
  const dot = (x: number, y: number, c: [number, number, number]) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = ((y + dy) * W + x + dx) * 4;
      g.px[i] = c[0];
      g.px[i + 1] = c[1];
      g.px[i + 2] = c[2];
    }
  };
  for (const st of scene.stations) {
    dot(st.x, st.y, [255, 230, 60]);
    dot(st.talk.x, st.talk.y, [60, 230, 255]);
  }
  dot(scene.spawn.x, scene.spawn.y, [255, 255, 255]);
  writePng(out.replace(/\.png$/, '_grid.png'), g, S);
}

if (raw) {
  writePng(out.replace(/\.png$/, '_raw.png'), img, S);
  const e2 = blank(W, H);
  e2.px.set(img.px);
  draw(e2, emit, 0, 0);
  writePng(out.replace(/\.png$/, '_emit.png'), e2, S);
}

// ------------------------------------------------------------------ light

const SW = W * S;
const SH = H * S;
const lightR = new Float32Array(SW * SH);
const lightG = new Float32Array(SW * SH);
const lightB = new Float32Array(SW * SH);
const ambientArg = args.find((a) => a.startsWith('--ambient='))?.split('=')[1];
const [ar, ag, ab] = rgb(ambientArg ?? scene.ambient.color);
lightR.fill(ar / 255 / 2);
lightG.fill(ag / 255 / 2);
lightB.fill(ab / 255 / 2);
const stops: Array<[number, number]> = [[0, 1], [0.25, 0.72], [0.5, 0.36], [0.75, 0.12], [1, 0]];
function fall(d: number): number {
  for (let i = 1; i < stops.length; i++) {
    if (d <= stops[i][0]) {
      const [t0, a0] = stops[i - 1];
      const [t1, a1] = stops[i];
      return a0 + ((d - t0) / (t1 - t0)) * (a1 - a0);
    }
  }
  return 0;
}
for (const l of scene.lights) {
  const [r, g, b] = rgb(l.color);
  const R = l.r * S;
  const cx = l.x * S;
  const cy = l.y * S;
  const k = Math.min(1, l.intensity);
  for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(SH, Math.ceil(cy + R)); y++) {
    for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(SW, Math.ceil(cx + R)); x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) / 0.8) / R;
      if (d >= 1) continue;
      const a = fall(d) * k;
      const i = y * SW + x;
      lightR[i] += (r / 255) * a;
      lightG[i] += (g / 255) * a;
      lightB[i] += (b / 255) * a;
    }
  }
}

// ------------------------------------------------------------------ composite

const cr = new Float32Array(SW * SH);
const cg = new Float32Array(SW * SH);
const cb = new Float32Array(SW * SH);
for (let y = 0; y < SH; y++) {
  for (let x = 0; x < SW; x++) {
    const i = y * SW + x;
    const ai = (Math.floor(y / S) * W + Math.floor(x / S)) * 4;
    const Lr = Math.min(1, lightR[i]) * 2;
    const Lg = Math.min(1, lightG[i]) * 2;
    const Lb = Math.min(1, lightB[i]) * 2;
    let r = (img.px[ai] / 255) * Lr;
    let g = (img.px[ai + 1] / 255) * Lg;
    let b = (img.px[ai + 2] / 255) * Lb;
    const ea = emit.px[ai + 3] / 255;
    if (ea > 0) {
      r = r * (1 - ea) + (emit.px[ai] / 255) * 1.15 * ea;
      g = g * (1 - ea) + (emit.px[ai + 1] / 255) * 1.15 * ea;
      b = b * (1 - ea) + (emit.px[ai + 2] / 255) * 1.15 * ea;
    }
    // Haze, thicker toward the top.
    const hz = scene.grade.hazeAmount * (0.35 + 0.65 * (1 - y / SH));
    r = r * (1 - hz) + scene.grade.haze[0] * hz;
    g = g * (1 - hz) + scene.grade.haze[1] * hz;
    b = b * (1 - hz) + scene.grade.haze[2] * hz;
    cr[i] = r;
    cg[i] = g;
    cb[i] = b;
  }
}

// Bloom: a bright pass at quarter resolution, blurred wide, added back.
const Q = 4;
const QW = Math.ceil(SW / Q);
const QH = Math.ceil(SH / Q);
const br = new Float32Array(QW * QH);
const bg = new Float32Array(QW * QH);
const bb = new Float32Array(QW * QH);
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
for (let y = 0; y < QH; y++) {
  for (let x = 0; x < QW; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let yy = 0; yy < Q; yy++) for (let xx = 0; xx < Q; xx++) {
      const X = x * Q + xx;
      const Y = y * Q + yy;
      if (X >= SW || Y >= SH) continue;
      const i = Y * SW + X;
      r += cr[i];
      g += cg[i];
      b += cb[i];
      n++;
    }
    r /= n;
    g /= n;
    b /= n;
    const l = r * 0.299 + g * 0.587 + b * 0.114;
    const k = smoothstep(0.78, 1.25, l);
    const j = y * QW + x;
    br[j] = r * k;
    bg[j] = g * k;
    bb[j] = b * k;
  }
}
function blur(a: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const rad = Math.ceil(sigma * 2.5);
  const ker: number[] = [];
  let sum = 0;
  for (let i = -rad; i <= rad; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    ker.push(v);
    sum += v;
  }
  for (let i = 0; i < ker.length; i++) ker[i] /= sum;
  const tmp = new Float32Array(w * h);
  const res = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let i = -rad; i <= rad; i++) v += a[y * w + Math.max(0, Math.min(w - 1, x + i))] * ker[i + rad];
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let i = -rad; i <= rad; i++) v += tmp[Math.max(0, Math.min(h - 1, y + i)) * w + x] * ker[i + rad];
    res[y * w + x] = v;
  }
  return res;
}
// Two widths, like the shader's two passes (in art pixels: about 3 and 8).
const blurs = [br, bg, bb].map((a) => {
  const n = blur(a, QW, QH, (3 * S) / Q);
  const w = blur(a, QW, QH, (8 * S) / Q);
  return n.map((v, i) => v * 0.6 + w[i] * 0.7);
});

function finish(x0: number, y0: number, w: number, h: number, path: string): void {
  const o = blank(w, h);
  const gr = scene.grade;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = x0 + x;
      const Y = y0 + y;
      if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue;
      const i = Y * SW + X;
      const q = Math.min(QH - 1, Math.floor(Y / Q)) * QW + Math.min(QW - 1, Math.floor(X / Q));
      let c = [cr[i] + blurs[0][q] * gr.bloom, cg[i] + blurs[1][q] * gr.bloom, cb[i] + blurs[2][q] * gr.bloom];
      c = c.map((v) => v / (1 + Math.max(0, v - 0.8) * 0.9));
      let l = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
      const t = smoothstep(0.1, 0.75, l);
      c = c.map((v, k) => v * (gr.shadowTint[k] + (gr.highlightTint[k] - gr.shadowTint[k]) * t));
      l = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
      c = c.map((v) => l + (v - l) * gr.saturation);
      c = c.map((v) => (v - 0.5) * gr.contrast + 0.5);
      // Vignette (as the shader: by distance from the view's center, aspect-corrected).
      const dx = (x / w - 0.5) * (w / h);
      const dy = y / h - 0.5;
      const v = smoothstep(0.95, 0.25, Math.hypot(dx, dy) * (0.9 + gr.vignette * 0.35));
      const m = 1 - gr.vignette * 0.85 + gr.vignette * 0.85 * v;
      const j = (y * w + x) * 4;
      o.px[j] = Math.max(0, Math.min(255, c[0] * m * 255));
      o.px[j + 1] = Math.max(0, Math.min(255, c[1] * m * 255));
      o.px[j + 2] = Math.max(0, Math.min(255, c[2] * m * 255));
      o.px[j + 3] = 255;
    }
  }
  writePng(path, o, 1);
  console.log('wrote', path, `${w}x${h}`);
}

finish(0, 0, SW, SH, out);
// A phone's view (270 x 600 art px) and a desktop's (480 x 300), on the knight.
const vx = Math.max(0, Math.min(W - 270, kx - 135));
const vy = Math.max(0, Math.min(H - 600, ky - 330));
finish(vx * S, vy * S, 270 * S, 600 * S, out.replace(/\.png$/, '_phone.png'));
const dy = Math.max(0, Math.min(H - 300, ky - 170));
finish(0, dy * S, 480 * S, 300 * S, out.replace(/\.png$/, '_pc.png'));
console.log(`scene ${t1 - t0} ms, ${scene.sprites.length} sprites, ${scene.emissive.length} glows, ${scene.lights.length} lights, ${scene.fore.length} fore`);
void ({} as HubScene);
