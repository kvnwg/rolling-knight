/**
 * Builds the game's own knight sheets from the kits in tools/knights/classes, in the same format as the
 * PixelForge sheets (src/render/pf/sheet.ts PFMeta): every frame of every animation in s, e, n and w
 * (west drawn as east mirrored here, never flipped at run time), distinct frames once in an indexed
 * PNG, the palette with each color's material and shade, the head top per frame, and the rig's anchors.
 *
 *   npx tsx tools/knights/build.ts            writes src/assets/pf/<sheet>.png and .json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { blink, combatIdle, death, heavy, hurt, idle, roll, slash, stun, victory, walk, type Anim } from './anims';
import { encodeIndexed } from './lib/png';
import { SheetPalette, SELF_LIT, toIndices, type PalColor } from './lib/palette';
import { compose, groundShadow, mirror, outline, rotate, shift, topOf, type Canvas, type Mat } from './lib/raster';
import { CELL, PX, PY, type Dir3, type Kit, type Pose } from './rig';
import { KEVIN, KEVIN_COLORS } from './classes/kevin';

type Dir4 = Dir3 | 'w';
const DIRS: Dir4[] = ['s', 'e', 'n', 'w'];

interface Spec {
  name: string;
  kit: Kit;
  base: Record<Mat, string[]>;
  anims: Record<string, Anim>;
}

/** The blade's set (Kevin plays a blade's animations). */
function bladeAnims(): Record<string, Anim> {
  return { idle: idle(), blink: blink(), walk: walk(), combat_idle: combatIdle(), attack_slash: slash(), attack_heavy: heavy(), roll: roll(), hurt: hurt(), stun: stun(), death: death(), victory: victory() };
}

export const SPECS: Spec[] = [{ name: 'rk_kevin', kit: KEVIN, base: KEVIN_COLORS, anims: bladeAnims() }];

interface Frame {
  c: Canvas;
  anchors: number[];
  top: [number, number];
}

/** One frame: composed, turned, mirrored for west, its ground shadow and outline added. */
export function renderFrame(kit: Kit, dir: Dir4, p: Pose): Frame {
  const d = kit.draw(dir === 'w' ? 'e' : dir, p);
  let c = compose(d.pieces, CELL, CELL);
  let { chin, back, hip, head } = d;
  if (p.rot) {
    // Lying or tumbling: turn round the body's middle, then rest the lowest pixel on the ground.
    const cy = p.tag === 'lying' || p.tag === 'falling' ? 33 : 32;
    c = rotate(c, p.rot, PX, cy);
    let low = 0;
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.solid(x, y)) low = y;
    const drop = p.tag === 'lying' || p.tag === 'falling' ? PY - low : Math.min(0, PY - low);
    c = shift(c, 0, drop);
    const t = topOf(c);
    head = [t[1], t[0]];
    chin = [t[1], t[0] + 6];
    back = [PX, PY - 4];
    hip = [PX, PY - 2];
  }
  if (p.whole[0] || p.whole[1]) {
    c = shift(c, p.whole[0], p.whole[1]);
    const mv = (a: [number, number]): [number, number] => [a[0] + p.whole[0], a[1] + p.whole[1]];
    [chin, back, hip, head] = [mv(chin), mv(back), mv(hip), mv(head)];
  }
  if (dir === 'w') {
    c = mirror(c, PX);
    const mx = (a: [number, number]): [number, number] => [2 * PX - a[0], a[1]];
    [chin, back, hip, head] = [mx(chin), mx(back), mx(hip), mx(head)];
  }
  const s = Math.max(0.4, p.shadow);
  groundShadow(c, PX, PY, Math.round(8 * s), Math.max(1, Math.round(2 * s)));
  c = outline(c, SELF_LIT);
  return { c, anchors: [...chin, ...back, ...hip, ...head], top: [head[1], head[0]] };
}

export interface Built {
  meta: Record<string, unknown>;
  png: Buffer;
}

export function buildSheet(spec: Spec): Built {
  const pal = new SheetPalette(spec.base);
  const cells: Uint8Array[] = [];
  const seen = new Map<string, number>();
  const tops: Array<[number, number]> = [];
  const anchors: number[][] = [];
  const index = (f: Frame): number => {
    const idx = toIndices(f.c, pal);
    const key = Buffer.from(idx).toString('base64');
    let k = seen.get(key);
    if (k === undefined) {
      k = cells.length;
      seen.set(key, k);
      cells.push(idx);
      tops.push(f.top);
      anchors.push(f.anchors);
    }
    return k;
  };
  const anims: Record<string, unknown> = {};
  for (const [name, a] of Object.entries(spec.anims)) {
    const dirs: Record<string, Array<[number, number]>> = {};
    for (const d of a.dirs ?? DIRS) dirs[d] = a.frames.map((f) => [index(renderFrame(spec.kit, d, f.p)), f.ms]);
    anims[name] = {
      loop: a.loop,
      dirs,
      ...(a.phases ? { phases: a.phases } : {}),
      ...(a.events ? { events: a.events } : {}),
      ...(a.loopFrames ? { loopFrames: a.loopFrames } : {}),
      ...(a.stride ? { stride: a.stride } : {}),
    };
  }
  const cols = 16;
  const rows = Math.ceil(cells.length / cols);
  const W = cols * CELL;
  const H = rows * CELL;
  const img = new Uint8Array(W * H);
  cells.forEach((idx, k) => {
    const ox = (k % cols) * CELL;
    const oy = Math.floor(k / cols) * CELL;
    for (let y = 0; y < CELL; y++) img.set(idx.subarray(y * CELL, (y + 1) * CELL), (oy + y) * W + ox);
  });
  const palette = [[0, 0, 0, 0] as const, ...pal.colors.map((_, i) => pal.rgba(i + 1))];
  const colors: PalColor[] = pal.colors;
  return {
    meta: { name: spec.name, cell: CELL, pivot: [PX, PY], cols, count: cells.length, colors, tops, anims, anchors, dirs: ['s', 'e', 'n', 'w'] },
    png: encodeIndexed(W, H, img, palette),
  };
}

if (process.argv[1]?.endsWith('build.ts')) {
  const out = process.argv[2] ?? 'src/assets/pf';
  mkdirSync(out, { recursive: true });
  for (const spec of SPECS) {
    const b = buildSheet(spec);
    writeFileSync(`${out}/${spec.name}.png`, b.png);
    writeFileSync(`${out}/${spec.name}.json`, JSON.stringify(b.meta));
    console.log(`${spec.name}: ${(b.meta as { count: number }).count} frames, ${b.png.length} bytes`);
  }
}

