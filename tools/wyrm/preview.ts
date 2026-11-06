/**
 * A look at the dragon while it's being made: the poses asked for, in every facing, in both looks,
 * at 1x and blown up, on a dark lava-lit floor beside a knight for scale.
 *
 *   npx tsx tools/wyrm/preview.ts <out.png> [pose names...]
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { writePng } from '../png';
import { wyrm, pose, type WyrmPose } from './model';
import { EMBER, MAT_NAME, OBSIDIAN, SHADOW_ALPHA, SHADOW_HEX, type Look } from './palette';
import { render, type Dir, type Frame, type RenderOpts } from './render';

export const OPTS: RenderOpts = { w: 168, h: 150, px: 84, py: 132, ss: 3, shadow: [-6, -4, 40, 20] };

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export function colorOf(f: Frame, i: number, look: Look): [number, number, number, number] | null {
  const k = f.kind[i];
  if (k === 1) return [...hex(look.outline), 255];
  if (k === 2) return [...hex(SHADOW_HEX), SHADOW_ALPHA];
  const m = f.mat[i];
  if (!m) return null;
  const ramp = look[MAT_NAME[m]] as readonly string[];
  return [...hex(ramp[Math.min(ramp.length - 1, f.shade[i])]), 255];
}

/** Reads a PNG's pixels (8-bit RGBA or indexed, no interlace): enough for our own sheets. */
export function readPng(path: string): { w: number; h: number; px: Uint8ClampedArray } {
  const b = readFileSync(path);
  let o = 8;
  let w = 0;
  let h = 0;
  let type = 0;
  let pal: number[][] = [];
  let trns: number[] = [];
  const idat: Buffer[] = [];
  while (o < b.length) {
    const n = b.readUInt32BE(o);
    const t = b.toString('ascii', o + 4, o + 8);
    const d = b.subarray(o + 8, o + 8 + n);
    if (t === 'IHDR') {
      w = d.readUInt32BE(0);
      h = d.readUInt32BE(4);
      type = d[9];
    } else if (t === 'PLTE') {
      pal = [];
      for (let i = 0; i < n; i += 3) pal.push([d[i], d[i + 1], d[i + 2]]);
    } else if (t === 'tRNS') trns = [...d];
    else if (t === 'IDAT') idat.push(d);
    o += 12 + n;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 1;
  const stride = w * bpp;
  const out = new Uint8ClampedArray(w * h * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? cur[x - bpp] : 0;
      const up = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let r = v;
      if (f === 1) r = v + a;
      else if (f === 2) r = v + up;
      else if (f === 3) r = v + ((a + up) >> 1);
      else if (f === 4) {
        const p = a + up - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - c);
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c);
      }
      cur[x] = r & 255;
    }
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (bpp === 4) out.set(cur.subarray(x * 4, x * 4 + 4), i);
      else if (bpp === 3) out.set([cur[x * 3], cur[x * 3 + 1], cur[x * 3 + 2], 255], i);
      else {
        const k = cur[x];
        const c = pal[k] ?? [0, 0, 0];
        out.set([c[0], c[1], c[2], trns[k] ?? 255], i);
      }
    }
    prev.set(cur);
  }
  return { w, h, px: out };
}

function blend(dst: Uint8ClampedArray, i: number, c: [number, number, number, number]): void {
  const a = c[3] / 255;
  dst[i] = dst[i] * (1 - a) + c[0] * a;
  dst[i + 1] = dst[i + 1] * (1 - a) + c[1] * a;
  dst[i + 2] = dst[i + 2] * (1 - a) + c[2] * a;
  dst[i + 3] = 255;
}

export const POSES: Record<string, WyrmPose> = {
  rest: pose({}),
};

if (process.argv[1]?.endsWith('preview.ts')) {
  const out = process.argv[2] ?? '/tmp/wyrm.png';
  const names = process.argv.slice(3).length ? process.argv.slice(3) : ['rest'];
  const dirs: Dir[] = ['s', 'e', 'n', 'w'];
  const yaws: Array<number | undefined> = process.env.YAWS ? process.env.YAWS.split(',').map(Number) : [];
  const looks = [OBSIDIAN, EMBER];
  const { w, h } = OPTS;
  // A knight for scale (the lancer's first frame).
  let knight: { w: number; h: number; px: Uint8ClampedArray } | null = null;
  try {
    knight = readPng('src/assets/pf/rk_lancer.png');
  } catch {
    knight = null;
  }
  const cols = dirs.length + yaws.length;
  const rows = names.length * looks.length;
  const sheet = { w: cols * w, h: rows * h, px: new Uint8ClampedArray(cols * w * rows * h * 4) };
  // A dark warm floor.
  for (let y = 0; y < sheet.h; y++) {
    for (let x = 0; x < sheet.w; x++) {
      const i = (y * sheet.w + x) * 4;
      const n = ((x * 7 + y * 13) % 17) / 17;
      sheet.px.set([46 + n * 6, 30 + n * 4, 34 + n * 3, 255], i);
    }
  }
  const t0 = Date.now();
  names.forEach((name, ni) => {
    const side = wyrm(POSES[name] ?? pose({}), 0);
    const front = wyrm(POSES[name] ?? pose({}), 1);
    const views: Array<[Dir, number | undefined]> = [...dirs.map((d): [Dir, number | undefined] => [d, undefined]), ...yaws.map((y): [Dir, number | undefined] => ['s', y])];
    views.forEach(([d, yw], di) => {
      const f = render(d === 's' || d === 'n' ? front : side, d, OPTS, yw);
      looks.forEach((look, li) => {
        const ox = di * w;
        const oy = (ni * looks.length + li) * h;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const c = colorOf(f, y * w + x, look);
            if (c) blend(sheet.px, ((oy + y) * sheet.w + ox + x) * 4, c);
          }
        }
        if (knight && di === 0) {
          // The knight stands in front of the dragon, to its left.
          for (let y = 0; y < 32; y++) {
            for (let x = 0; x < 32; x++) {
              const i = (y * knight.w + x) * 4;
              if (knight.px[i + 3] < 200) continue;
              const tx = ox + 18 + x;
              const ty = oy + h - 40 + y;
              sheet.px.set([knight.px[i], knight.px[i + 1], knight.px[i + 2], 255], (ty * sheet.w + tx) * 4);
            }
          }
        }
      });
    });
  });
  console.log(`rendered ${names.length * dirs.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  writePng(out, sheet as never, 1);
  writePng(out.replace('.png', '_x3.png'), sheet as never, 3);
}
