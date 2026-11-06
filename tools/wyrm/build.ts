/**
 * Builds the Cinderwyrm's sheet (src/assets/pf/cinderwyrm.png and .json, the PixelForge sheet format
 * of src/render/pf/sheet.ts) from the model and its animations.
 *
 *   npx tsx tools/wyrm/build.ts            all four facings (in parallel), then the sheet
 *   npx tsx tools/wyrm/build.ts --dir s    one facing's frames into the cache (what the above runs)
 *   npx tsx tools/wyrm/build.ts --pack     the sheet from the cache
 *
 * Every facing renders every distinct pose once; the sheet keeps each distinct frame once, cropped
 * to one square cell round all of them, the pivot (the feet's middle, on the ground) in the same
 * place in each.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { encodeIndexed } from '../knights/lib/png';
import { CLIPS, FRAMES } from './anims';
import { wyrm } from './model';
import { EMBER, FLASH_HEX, MAT_NAME, SHADOW_ALPHA, SHADOW_HEX, type Look } from './palette';
import { render, SHADES, type Dir, type Frame, type RenderOpts } from './render';
import { MAT } from './sdf';

const CACHE = '.cache/wyrm';
const DIRS: Dir[] = ['s', 'e', 'n', 'w'];
const RENDER: RenderOpts = { w: 250, h: 250, px: 125, py: 180, ss: 3, shadow: [-6, -4, 42, 21] };

interface Cached {
  w: number;
  h: number;
  frames: Record<string, { mat: string; shade: string; kind: string }>;
}

function renderDir(dir: Dir): void {
  const out: Cached = { w: RENDER.w, h: RENDER.h, frames: {} };
  const face = dir === 's' || dir === 'n' ? 1 : 0;
  const t0 = Date.now();
  for (const [key, p] of Object.entries(FRAMES)) {
    const f = render(wyrm(p, face), dir, RENDER);
    out.frames[key] = { mat: Buffer.from(f.mat).toString('base64'), shade: Buffer.from(f.shade).toString('base64'), kind: Buffer.from(f.kind).toString('base64') };
  }
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(`${CACHE}/${dir}.json`, JSON.stringify(out));
  console.log(`${dir}: ${Object.keys(FRAMES).length} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

/** The sheet's palette: outline, shadow, flash, then each material's ramp (the embers). */
function palette(look: Look): Array<[string, number, string, number]> {
  const cols: Array<[string, number, string, number]> = [
    [look.outline, 255, 'outline', 0],
    [SHADOW_HEX, SHADOW_ALPHA, 'shadow', 0],
    [FLASH_HEX, 255, 'flash', 0],
  ];
  for (const m of [MAT.scales, MAT.belly, MAT.horn, MAT.membrane, MAT.teeth, MAT.mouth, MAT.eyes, MAT.trail]) {
    const name = MAT_NAME[m];
    const ramp = look[name] as readonly string[];
    if (ramp.length !== SHADES[m]) throw new Error(`${name}: ${ramp.length} colors for ${SHADES[m]} shades`);
    ramp.forEach((hex, i) => cols.push([hex, 255, name, i]));
  }
  const seen = new Set<string>();
  for (const [hex] of cols) {
    if (seen.has(hex)) throw new Error(`${hex} twice in the palette (the sheet is read back by color)`);
    seen.add(hex);
  }
  return cols;
}

function pack(): void {
  const cache = Object.fromEntries(DIRS.map((d) => [d, JSON.parse(readFileSync(`${CACHE}/${d}.json`, 'utf8')) as Cached])) as Record<Dir, Cached>;
  const { w, h } = cache.s;
  const decode = (c: Cached['frames'][string]): Frame => ({
    w,
    h,
    mat: new Uint8Array(Buffer.from(c.mat, 'base64')),
    shade: new Uint8Array(Buffer.from(c.shade, 'base64')),
    kind: new Uint8Array(Buffer.from(c.kind, 'base64')),
    depth: new Float32Array(0),
  });
  // The keys each facing needs, in the order the clips first use them.
  const keys: string[] = [];
  for (const c of Object.values(CLIPS)) for (const fr of c.frames) if (!keys.includes(fr.key)) keys.push(fr.key);
  const frames: Array<{ dir: Dir; key: string; f: Frame }> = [];
  for (const d of DIRS) for (const k of keys) frames.push({ dir: d, key: k, f: decode(cache[d].frames[k]) });
  // One square cell round everything.
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (const { f } of frames) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!f.mat[i] && !f.kind[i]) continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x0 === 0 || y0 === 0 || x1 === w - 1 || y1 === h - 1) throw new Error(`a frame touches the render's edge (${x0},${y0})-(${x1},${y1}): make the render bigger`);
  const cell = Math.max(x1 - x0 + 1, y1 - y0 + 1) + 2;
  // Centre the pivot across; keep the feet at the same height.
  const ox = Math.round(RENDER.px - cell / 2);
  const left = Math.min(x0 - 1, ox);
  const cx0 = Math.max(0, Math.min(left, x1 + 1 - cell + 1));
  const cy0 = y1 + 2 - cell;
  const pal = palette(EMBER);
  const index = new Map<string, number>();
  pal.forEach(([, , mat, shade], i) => index.set(`${mat}|${shade}`, i + 1));
  const cols = 16;
  const rows = Math.ceil(frames.length / cols);
  const W = cols * cell;
  const H = rows * cell;
  const idx = new Uint8Array(W * H);
  const tops: Array<[number, number]> = [];
  frames.forEach(({ f }, n) => {
    const gx = (n % cols) * cell;
    const gy = Math.floor(n / cols) * cell;
    let top = -1;
    let topX0 = 0;
    let topX1 = 0;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const sx = cx0 + x;
        const sy = cy0 + y;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const i = sy * w + sx;
        let v = 0;
        if (f.kind[i] === 1) v = index.get('outline|0')!;
        else if (f.kind[i] === 2) v = index.get('shadow|0')!;
        else if (f.mat[i]) v = index.get(`${MAT_NAME[f.mat[i]]}|${f.kind[i] === 3 ? 0 : f.shade[i]}`)!;
        if (!v) continue;
        idx[(gy + y) * W + gx + x] = v;
        if (f.kind[i] !== 2) {
          if (top < 0) {
            top = y;
            topX0 = topX1 = x;
          } else if (y === top) topX1 = x;
        }
      }
    }
    tops.push([top, top < 0 ? -1 : Math.round((topX0 + topX1) / 2)]);
  });
  const frameOf = (d: Dir, key: string): number => frames.findIndex((fr) => fr.dir === d && fr.key === key);
  const anims: Record<string, unknown> = {};
  for (const [name, c] of Object.entries(CLIPS)) {
    anims[name] = {
      loop: c.loop,
      dirs: Object.fromEntries(DIRS.map((d) => [d, c.frames.map((fr) => [frameOf(d, fr.key), fr.ms])])),
      ...(c.phases ? { phases: c.phases } : {}),
      ...(c.events ? { events: c.events } : {}),
      ...(c.loopFrames ? { loopFrames: c.loopFrames } : {}),
    };
  }
  const meta = {
    name: 'cinderwyrm',
    cell,
    pivot: [RENDER.px - cx0, RENDER.py - cy0],
    cols,
    count: frames.length,
    colors: pal,
    tops,
    anims,
  };
  const rgba = pal.map(([hex, a]) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), a] as const);
  writeFileSync('src/assets/pf/cinderwyrm.png', encodeIndexed(W, H, idx, [[0, 0, 0, 0], ...rgba]));
  writeFileSync('src/assets/pf/cinderwyrm.json', JSON.stringify(meta));
  console.log(`cinderwyrm: ${frames.length} frames, cell ${cell}, pivot ${meta.pivot}, sheet ${W}x${H}`);
}

const arg = process.argv[2];
if (arg === '--dir') renderDir(process.argv[3] as Dir);
else if (arg === '--pack') pack();
else {
  // All four facings at once (one process each), then the sheet.
  Promise.all(
    DIRS.map(
      (d) =>
        new Promise<void>((res, rej) => {
          const c = spawn('npx', ['tsx', 'tools/wyrm/build.ts', '--dir', d], { stdio: 'inherit' });
          c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${d} failed`))));
        }),
    ),
  ).then(pack);
}
