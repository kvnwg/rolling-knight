/**
 * Tree previews, as PNGs in shots/:
 *   npx tsx tools/trees.ts sheet            every species and size on its biome's ground (1x and 4x)
 *   npx tsx tools/trees.ts scene hamlet 1 7 [raw|old]
 *        a floor planted by placeTrees, ground, shadows and all props, cropped to a screen round the
 *        start (1x and 3x), lit by the biome's ambient (raw: unlit; old: the same floor with the old
 *        forest wall and treeArt, for a before/after)
 * The scene paints the terrain without the trees, then throws the trees' shadows itself (the same
 * shear as castShadows.ts), so it shows the new trees even before the renderer is switched to them.
 */
import { blank, blit, rgb, type PixelBuf } from '../src/render/pixel/buf';
import { setRGB } from '../src/render/art/draw';
import { vnoise } from '../src/render/art/tree/core';
import { writePng } from './png';
import { BIOMES, type Biome, type BiomeId, type TreeKind } from '../src/world/biomes';
import { artForTree, treeArt2, TREE_SIZES, type TreeArt } from '../src/render/art/trees';

const mode = process.argv[2] ?? 'sheet';

/** A ground swatch in a biome's ground colors (value noise and a few tufts). */
function ground(b: PixelBuf, x0: number, y0: number, w: number, h: number, biome: Biome, seed: number) {
  const r = biome.ground.ramp;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const n = vnoise(x, y, 22, seed) * 0.7 + vnoise(x, y, 7, seed + 1) * 0.3;
      const t = ((x * 73856093) ^ (y * 19349663) ^ seed) >>> 0;
      let k = 2 + (n > 0.64 ? 1 : n < 0.34 ? -1 : 0);
      if (t % 23 === 0) k = Math.min(r.length - 1, k + 1);
      setRGB(b, x, y, r[Math.max(0, Math.min(r.length - 1, k))]);
    }
  }
}

/** Darkens a soft ellipse (two rings) toward a cool shade: a shadow pool. */
function pool(b: PixelBuf, cx: number, cy: number, rx: number, ry: number) {
  for (const [k, f] of [[1, [0.8, 0.82, 0.9]], [0.68, [0.78, 0.8, 0.88]]] as const) {
    for (let y = Math.floor(cy - ry * k); y <= cy + ry * k; y++) {
      for (let x = Math.floor(cx - rx * k); x <= cx + rx * k; x++) {
        if (((x - cx) / (rx * k)) ** 2 + ((y - cy) / (ry * k)) ** 2 > 1 || x < 0 || y < 0 || x >= b.w || y >= b.h) continue;
        const i = (y * b.w + x) * 4;
        b.px[i] *= f[0];
        b.px[i + 1] *= f[1];
        b.px[i + 2] *= f[2];
      }
    }
  }
}

/** The species each biome plants (its own lists plus the garden's conifers). */
function kindsOf(id: BiomeId): TreeKind[] {
  const b = BIOMES[id];
  const s = new Set<TreeKind>([...(b.solid.trees ?? []), ...b.trees]);
  if (id === 'hamlet' || id === 'farmland') s.add('pine');
  return [...s];
}

if (mode === 'sheet') {
  const ids: BiomeId[] = ['hamlet', 'farmland', 'forest', 'tundra', 'swamp', 'graveyard', 'shrine', 'desert', 'crystal'];
  const rows = ids.map((id) => {
    const biome = BIOMES[id];
    const arts: TreeArt[] = [];
    for (const k of kindsOf(id)) for (const size of TREE_SIZES) arts.push(treeArt2(k, biome, 13 + arts.length * 7919, size));
    // Two more of the medium oak/main kind, to show the variety a seed gives.
    const main = kindsOf(id)[0];
    for (let v = 1; v <= 2; v++) arts.push(treeArt2(main, biome, 13 + v * 104729, 'medium'));
    return { id, biome, arts };
  });
  const rowH = rows.map((r) => Math.max(...r.arts.map((a) => a.ay + 10)) + 6);
  const W = Math.max(...rows.map((r) => r.arts.reduce((s, a) => s + a.buf.w + 3, 8)));
  const sheet = blank(W, rowH.reduce((a, b) => a + b, 0));
  let y0 = 0;
  rows.forEach((r, ri) => {
    ground(sheet, 0, y0, W, rowH[ri], r.biome, ri * 31 + 7);
    const base = y0 + rowH[ri] - 8;
    let x = 4;
    const at: Array<[TreeArt, number]> = [];
    for (const a of r.arts) {
      pool(sheet, x + a.ax + a.shadow.dx, base + a.shadow.dy, a.shadow.rx, a.shadow.ry);
      at.push([a, x]);
      x += a.buf.w + 3;
    }
    for (const [a, ax] of at) blit(sheet, a.buf, ax, base - a.ay);
    y0 += rowH[ri];
  });
  writePng('shots/trees_sheet.png', sheet, 1);
  writePng('shots/trees_sheet_4x.png', sheet, 4);
  // Each biome's row on its own at 4x, easier to look at.
  y0 = 0;
  rows.forEach((r, ri) => {
    const w = r.arts.reduce((s, a) => s + a.buf.w + 3, 8);
    const part = blank(w, rowH[ri]);
    part.px.set(sheet.px.subarray(y0 * W * 4, (y0 + rowH[ri]) * W * 4).filter((_, i) => i % (W * 4) < w * 4));
    writePng(`shots/trees_${r.id}_4x.png`, part, 4);
    y0 += rowH[ri];
  });
  console.log('wrote shots/trees_sheet.png, shots/trees_sheet_4x.png and shots/trees_<biome>_4x.png', W, sheet.h);
}

if (mode === 'scene') {
  // A floor planted by placeTrees: npx tsx tools/trees.ts scene hamlet [floor] [seed] [lit]
  const { generateFloor } = await import('../src/world/mapgen');
  const { placeTrees } = await import('../src/world/forest');
  const { paintTerrainPixels } = await import('../src/render/terrain');
  const { propArt } = await import('../src/render/art/props');
  const { Rng } = await import('../src/core/rng');
  const { knightFrame, knightLook } = await import('../src/render/art/knights');
  const id = (process.argv[3] ?? 'hamlet') as BiomeId;
  const biome = BIOMES[id];
  const floor = Number(process.argv[4] ?? 1);
  const seed = Number(process.argv[5] ?? 7);
  const flag = process.argv[6] ?? '';
  const old = flag.includes('old');
  const { treeArt } = await import('../src/render/art/props');
  const m = generateFloor({ floor, biome, seed, boss: false });
  const oldTrees = m.props.filter((p) => p.kind === 'tree' && p.edge).length;
  const others = m.props.filter((p) => old || !(p.kind === 'tree' && p.edge));
  const trees = biome.solid.kind === 'trees' && !old ? placeTrees(m, biome, new Rng(seed * 977 + floor)) : [];
  const artOfTree = (p: (typeof m.props)[number]) => (old ? treeArt(p.tree!, biome, (p.seed % 5) * 7919 + 13) : artForTree(p, biome));
  // The ground without any trees on it (its own baked shadows then come from the other props only).
  m.props = others.filter((p) => p.kind !== 'tree');
  const t = paintTerrainPixels(m, biome);
  m.props = [...others, ...trees];
  const img: PixelBuf = { w: t.w, h: t.h, px: t.px };
  // The trees' shadows, thrown to the lower right (castShadows.ts's shear), core and rim.
  const mask = new Uint8Array(img.w * img.h);
  for (const p of m.props) {
    if (p.kind !== 'tree') continue;
    const a = artOfTree(p);
    const left = p.x - a.ax;
    const top = p.y - a.ay;
    for (let v = 0; v < a.buf.h; v++) {
      const h = p.y - (top + v);
      if (h < 0) continue;
      const sy = Math.round(p.y + h * 0.34);
      const dx = Math.round(h * 0.62);
      for (let u = 0; u < a.buf.w; u++) {
        if (!a.buf.px[(v * a.buf.w + u) * 4 + 3]) continue;
        const sx = left + u + dx;
        if (sx >= 0 && sx < img.w && sy >= 0 && sy < img.h) mask[sy * img.w + sx] = 2;
      }
    }
  }
  for (let y = 1; y < img.h - 1; y++) for (let x = 1; x < img.w - 1; x++) {
    const i = y * img.w + x;
    if (mask[i] === 2) continue;
    if (mask[i - 1] === 2 || mask[i + 1] === 2 || mask[i - img.w] === 2 || mask[i + img.w] === 2) mask[i] = 1;
  }
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue;
    const f = mask[k] === 2 ? [0.58, 0.62, 0.76] : [0.78, 0.8, 0.88];
    img.px[k * 4] *= f[0];
    img.px[k * 4 + 1] *= f[1];
    img.px[k * 4 + 2] *= f[2];
  }
  // Everything standing, sorted by its feet; the squad at the start.
  type D = { y: number; draw: () => void };
  const list: D[] = [];
  for (const p of m.props) {
    const art = p.kind === 'tree' ? artOfTree(p) : propArt(p.kind, biome, (p.seed % 5) * 104729 + 7);
    list.push({ y: p.y, draw: () => blit(img, art.buf, p.x - art.ax, p.y - art.ay) });
  }
  ['rare-guardian', 'epic-ranger', 'legendary-cleric'].forEach((k, i) => {
    const fr = knightFrame(knightLook(k, null, 1), 'idle', 'down', 0);
    const x = m.start.x - 18 + i * 18;
    const y = m.start.y + 6;
    list.push({ y, draw: () => blit(img, fr.buf, x - 11, y - fr.buf.h + 1) });
  });
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.draw();
  const lit = !flag.includes('raw');
  if (lit) {
    const [ar, ag, ab] = rgb(biome.light.ambient);
    // Roughly the shader's light map: the ambient, a little lifted (the shader doubles a half-strength map).
    for (let i = 0; i < img.px.length; i += 4) {
      img.px[i] = Math.min(255, (img.px[i] * Math.min(255, ar * 1.08)) / 255);
      img.px[i + 1] = Math.min(255, (img.px[i + 1] * Math.min(255, ag * 1.08)) / 255);
      img.px[i + 2] = Math.min(255, (img.px[i + 2] * Math.min(255, ab * 1.08)) / 255);
    }
  }
  // A desktop screen's worth (480 x 300 art px) round the start, and the whole floor small.
  const cw = Math.min(img.w, 480);
  const ch = Math.min(img.h, 300);
  const cx = Math.max(0, Math.min(img.w - cw, m.start.x - cw / 2));
  const cy = Math.max(0, Math.min(img.h - ch, m.start.y - ch * 0.62));
  const crop = blank(cw, ch);
  for (let y = 0; y < ch; y++) crop.px.set(img.px.subarray(((cy + y) * img.w + cx) * 4, ((cy + y) * img.w + cx + cw) * 4), y * cw * 4);
  const name = `shots/scene_${id}_${floor}_${seed}${flag ? `_${flag}` : ''}`;
  writePng(`${name}.png`, crop, 1);
  writePng(`${name}_3x.png`, crop, 3);
  writePng(`${name}_floor.png`, img, 1);
  const bySize = trees.reduce<Record<string, number>>((a, p) => ((a[`${p.tree}/${p.size}`] = (a[`${p.tree}/${p.size}`] ?? 0) + 1), a), {});
  console.log(`wrote ${name}.png (+_3x, _floor); ${trees.length} trees (was ${oldTrees}):`, JSON.stringify(bySize));
}
