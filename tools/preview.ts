/**
 * Preview sheets of the art, as PNGs: npx tsx tools/preview.ts knights out.png
 */
import { blank, blit, type PixelBuf } from '../src/render/pixel/buf';
import { CLASS_IDS } from '../src/core/knights';
import { knightFrame, knightLook, weaponArt, shieldArt, type View } from '../src/render/art/knights';
import { setRGB } from '../src/render/art/draw';
import { writePng } from './png';

const what = process.argv[2] ?? 'knights';
const out = process.argv[3] ?? 'shots/preview.png';

function fill(b: PixelBuf, hex: string) {
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) setRGB(b, x, y, hex);
}

if (what === 'knights') {
  const rarities = ['common', 'rare', 'epic', 'legendary', 'mythic', 'celestial', 'primordial'] as const;
  const views: View[] = ['down', 'side', 'up'];
  const cw = 26;
  const ch = 26;
  const sheet = blank(cw * (views.length * 2 + 1) * 2, ch * CLASS_IDS.length * rarities.length / 2 + ch);
  fill(sheet, '#3a4a3c');
  let row = 0;
  CLASS_IDS.forEach((cls, ci) => {
    rarities.forEach((r, ri) => {
      if ((ri + ci) % 2) return;
      const L = knightLook(`${r}-${cls}`, ri === 3 && ci === 0 ? 'gilded' : null, 1);
      let col = 0;
      for (const v of views) {
        for (const anim of ['idle', 'walk'] as const) {
          const fr = knightFrame(L, anim, v, anim === 'walk' ? 1 : 0);
          const x0 = col * cw + 4;
          const y0 = row * ch + 2;
          blit(sheet, fr.buf, x0, y0);
          if (v !== 'up') {
            const wp = weaponArt(L);
            blit(sheet, wp.buf, x0 + fr.handR[0] - wp.px, y0 + fr.handR[1] - wp.py + 1);
            if (cls === 'guardian') blit(sheet, shieldArt(L), x0 + fr.handL[0] - 4, y0 + fr.handL[1] - 5);
          }
          col++;
        }
      }
      row++;
    });
  });
  writePng(out, sheet, 4);
  console.log('wrote', out);
}

if (what === 'mobs') {
  const { BIOME_ORDER, BIOMES } = await import('../src/world/biomes');
  const { floorMobs, floorBoss } = await import('../src/world/mobgen');
  const { mobFrame } = await import('../src/render/art/mobs');
  const cw = 34;
  const ch = 30;
  const sheet = blank(cw * 12, ch * BIOME_ORDER.length + 60);
  fill(sheet, '#3a4a3c');
  BIOME_ORDER.forEach((id, row) => {
    const b = BIOMES[id];
    const types = [...floorMobs(b, 3, 11), ...floorMobs(b, 14, 12)];
    types.forEach((t, i) => {
      for (const [k, pose] of (['idle', 'walk'] as const).entries()) {
        const fr = mobFrame(t, pose, 1, 'down', false, false);
        blit(sheet, fr.buf, (i * 2 + k) * (cw / 1.2) + 2, row * ch + ch - fr.buf.h);
      }
    });
  });
  const boss = floorBoss(BIOMES.forest, 5, 3);
  const fr = mobFrame(boss, 'idle', 0, 'down', false, true);
  blit(sheet, fr.buf, 4, BIOME_ORDER.length * ch + 2);
  const boss2 = floorBoss(BIOMES.crypt, 20, 9);
  const fr2 = mobFrame(boss2, 'idle', 0, 'down', false, true);
  blit(sheet, fr2.buf, 120, BIOME_ORDER.length * ch + 2);
  writePng(out, sheet, 3);
  console.log('wrote', out, boss.name, boss.plan, boss2.name, boss2.plan);
}

if (what === 'props') {
  // Every prop and the biome's trees on its ground: npx tsx tools/preview.ts props out.png farmland
  const { BIOMES } = await import('../src/world/biomes');
  const { propArt, treeArt } = await import('../src/render/art/props');
  const biome = BIOMES[(process.argv[4] ?? 'farmland') as keyof typeof BIOMES];
  const kinds = ['rock', 'bush', 'flowers', 'barrel', 'crate', 'bones', 'torch', 'lantern', 'brazier', 'gravestone', 'crystalSmall', 'reeds', 'mushroomSmall', 'pumpkin', 'stump', 'pillar', 'statue', 'well', 'fence', 'skull', 'cart', 'stoneLantern', 'banner', 'campfire', 'tent', 'hayBale', 'cabbage', 'wheat', 'scarecrow', 'trough', 'sunflower', 'pot', 'bench', 'lampPost', 'signpost', 'sack', 'woodpile', 'noticeBoard', 'flowerBed', 'stall', 'wellStone', 'lanternPost', 'roughFence', 'fern', 'mossRock', 'log', 'brokenPillar', 'stoneBlock', 'ruinWall', 'stairs', 'picket', 'picketSide', 'hedge', 'fountain', 'cafeTable', 'stringPost', 'bridgeRail'] as const;
  const cw = 52;
  const ch = 50;
  const cols = 10;
  const trees = [...new Set([...biome.trees, ...(biome.solid.trees ?? [])])];
  const rows = Math.ceil(kinds.length / cols) * 2 + 2;
  const sheet = blank(cw * cols, ch * rows);
  fill(sheet, biome.ground.ramp[2]);
  kinds.forEach((k, i) => {
    for (let v = 0; v < 2; v++) {
      const art = propArt(k, biome, (v * 3 + 1) * 104729 + 7);
      const cx = (i % cols) * cw + cw / 2;
      const by = (Math.floor(i / cols) * 2 + v) * ch + ch - 3;
      blit(sheet, art.buf, Math.round(cx - art.ax), by - art.ay);
    }
  });
  trees.forEach((t, i) => {
    for (let v = 0; v < 3; v++) {
      const art = treeArt(t, biome, v * 7919 + 13);
      blit(sheet, art.buf, (i * 3 + v) * cw + 2, (rows - 2) * ch + 2 * ch - 3 - art.ay);
    }
  });
  writePng(out, sheet, 3);
  console.log('wrote', out, trees.join(' '));
}

if (what === 'houses') {
  // The five house variants: npx tsx tools/preview.ts houses out.png
  const { BIOMES } = await import('../src/world/biomes');
  const { propArt } = await import('../src/render/art/props');
  const biome = BIOMES[(process.argv[4] ?? 'hamlet') as keyof typeof BIOMES];
  const arts = [0, 1, 2, 3, 4].map((v) => propArt('house', biome, v * 104729 + 7));
  const sheet = blank(arts.reduce((a, x) => a + x.buf.w + 8, 8), Math.max(...arts.map((x) => x.buf.h)) + 16);
  fill(sheet, biome.ground.ramp[2]);
  let x = 8;
  for (const a of arts) {
    blit(sheet, a.buf, x, sheet.h - 8 - a.ay);
    x += a.buf.w + 8;
  }
  writePng(out, sheet, 4);
  console.log('wrote', out);
}

/**
 * A whole floor, ground, props and mobs, under the biome's light: 'ambient' (the scene's light
 * multiplied over it, as in the game), 'soft' (most of the way to daylight, for reading a dark
 * floor's layout) or 'raw'. `design` picks the floor design (designs.ts; the chain when left out).
 */
async function paintFloor(biomeId: string, floor: number, seed: number, design: string | undefined, light: 'ambient' | 'soft' | 'raw', amb?: number) {
  const { BIOMES, isBossFloor } = await import('../src/world/biomes');
  const { generateFloor } = await import('../src/world/mapgen');
  const { isDesign } = await import('../src/core/deck');
  const { floorMobs, floorBoss } = await import('../src/world/mobgen');
  const { paintTerrainPixels } = await import('../src/render/terrain');
  const { propArt, treeArt } = await import('../src/render/art/props');
  const { mobFrame } = await import('../src/render/art/mobs');
  const { rgb } = await import('../src/render/pixel/buf');
  const biome = BIOMES[biomeId as keyof typeof BIOMES];
  const boss = isBossFloor(floor);
  if (design !== undefined && !isDesign(design)) throw new Error(`no design called ${design}`);
  const t0 = performance.now();
  const m = generateFloor({ floor, biome, seed, boss, design });
  const ms = performance.now() - t0;
  const t = paintTerrainPixels(m, biome);
  const img: PixelBuf = { w: t.w, h: t.h, px: t.px };
  const types = floorMobs(biome, floor, seed);
  const bossType = boss ? floorBoss(biome, floor, seed) : null;
  type D = { y: number; draw: () => void };
  const list: D[] = [];
  for (const p of m.props) {
    const variant = p.seed % 5;
    const art = p.kind === 'tree' ? treeArt(p.tree!, biome, variant * 7919 + 13) : propArt(p.kind, biome, variant * 104729 + 7);
    list.push({ y: p.y, draw: () => blit(img, art.buf, p.x - art.ax, p.y - art.ay) });
  }
  m.spawns.forEach((s, i) => {
    const ty = s.boss ? bossType! : types[i % types.length];
    const fr = mobFrame(ty, i % 3 ? 'idle' : 'walk', i, 'down', s.elite, s.boss);
    list.push({ y: s.y, draw: () => blit(img, fr.buf, s.x - fr.ax, s.y - fr.ay, { flipX: i % 2 === 1 }) });
  });
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.draw();
  if (amb !== undefined) {
    // The ambient life at a moment (AMB=seconds), painted into the picture.
    const { Ambient } = await import('../src/render/ambient');
    const ambient = new Ambient(m, biome);
    let style = '#000000';
    let alpha = 1;
    const paint = {
      get fillStyle() { return style; },
      set fillStyle(v: string) { style = v; },
      get globalAlpha() { return alpha; },
      set globalAlpha(v: number) { alpha = v; },
      fillRect(x: number, y: number, w: number, h: number) {
        const [r, g, b] = rgb(style);
        for (let yy = Math.max(0, y); yy < Math.min(img.h, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(img.w, x + w); xx++) {
          const i = (yy * img.w + xx) * 4;
          img.px[i] += (r - img.px[i]) * alpha;
          img.px[i + 1] += (g - img.px[i + 1]) * alpha;
          img.px[i + 2] += (b - img.px[i + 2]) * alpha;
        }
      },
    };
    ambient.drawGround(paint as never, 0, 0, img.w, img.h, amb);
    ambient.drawAir(paint as never, 0, 0, img.w, img.h, amb);
  }
  // The light, roughly: the ambient multiplied over everything.
  let [ar, ag, ab] = light === 'raw' ? [255, 255, 255] : rgb(biome.light.ambient);
  if (light === 'soft') [ar, ag, ab] = [ar, ag, ab].map((c) => (c + 255 * 1.4) / 2.4);
  for (let i = 0; i < img.px.length; i += 4) {
    img.px[i] = Math.min(255, (img.px[i] * ar) / 255);
    img.px[i + 1] = Math.min(255, (img.px[i + 1] * ag) / 255);
    img.px[i + 2] = Math.min(255, (img.px[i + 2] * ab) / 255);
  }
  return { img, m, types, bossType, ms };
}

/** A smaller copy (each k by k block averaged). */
function shrink(b: PixelBuf, k: number): PixelBuf {
  const out = blank(Math.floor(b.w / k), Math.floor(b.h / k));
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      let r = 0;
      let g = 0;
      let bl = 0;
      for (let yy = 0; yy < k; yy++) {
        for (let xx = 0; xx < k; xx++) {
          const i = ((y * k + yy) * b.w + x * k + xx) * 4;
          r += b.px[i];
          g += b.px[i + 1];
          bl += b.px[i + 2];
        }
      }
      const o = (y * out.w + x) * 4;
      out.px[o] = r / (k * k);
      out.px[o + 1] = g / (k * k);
      out.px[o + 2] = bl / (k * k);
      out.px[o + 3] = 255;
    }
  }
  return out;
}

if (what === 'floor') {
  // A whole floor, ground, props and mobs, under the biome's ambient light:
  //   npx tsx tools/preview.ts floor out.png farmland 7 1234 [y0] [h] [scale]
  // DESIGN=loop picks the floor design (designs.ts), RAW=1 skips the light, SOFT=1 softens it, and
  // AMB=seconds paints the ambient life at that moment.
  const light = process.env.RAW ? 'raw' : process.env.SOFT ? 'soft' : 'ambient';
  const amb = process.env.AMB ? Number(process.env.AMB) : undefined;
  const { img, m, types, bossType, ms } = await paintFloor(process.argv[4] ?? 'farmland', Number(process.argv[5] ?? 7), Number(process.argv[6] ?? 1234), process.env.DESIGN, light, amb);
  const y0 = Number(process.argv[7] ?? 0);
  const h = Math.min(img.h - y0, Number(process.argv[8] ?? img.h));
  const crop = blank(img.w, h);
  crop.px.set(img.px.subarray(y0 * img.w * 4, (y0 + h) * img.w * 4));
  writePng(out, crop, Number(process.argv[9] ?? 1));
  console.log('wrote', out, `${m.design}, ${m.w}x${m.h} tiles, built in ${ms.toFixed(1)} ms;`, types.map((x) => `${x.name} (${x.plan}/${x.behavior})`).join(', '), bossType ? `boss: ${bossType.name}, ${bossType.boss!.title}` : '');
}

if (what === 'designs') {
  // A contact sheet: every floor design (columns) in a few biomes (rows), and a row of boss floors,
  // each shrunk k times and labeled:
  //   npx tsx tools/preview.ts designs shots/floors_designs.png [hamlet,forest,crypt,desert] [floor] [seed] [k] [bossBiome]
  const { FLOOR_DESIGNS } = await import('../src/core/deck');
  const { DESIGNS } = await import('../src/world/designs');
  const { BIOMES } = await import('../src/world/biomes');
  const { renderText } = await import('../src/render/pixel/font');
  const biomes = (process.argv[4] ?? 'hamlet,forest,crypt,desert').split(',');
  const floor = Number(process.argv[5] ?? 7);
  const seed = Number(process.argv[6] ?? 1234);
  const k = Number(process.argv[7] ?? 4);
  const bossBiome = process.argv[8] ?? 'shrine';
  const rows: Array<{ biome: string; floor: number }> = [...biomes.map((b) => ({ biome: b, floor })), ...(bossBiome === 'none' ? [] : [{ biome: bossBiome, floor: Math.ceil(floor / 5) * 5 + 5 }])];
  // DESIGNS=loop,maze shows just those.
  const shown = process.env.DESIGNS ? FLOOR_DESIGNS.filter((d) => process.env.DESIGNS!.split(',').includes(d)) : FLOOR_DESIGNS;
  const cells: PixelBuf[][] = [];
  for (const row of rows) {
    const line: PixelBuf[] = [];
    for (const d of shown) {
      const { img, ms } = await paintFloor(row.biome, row.floor, seed + row.floor, d, 'soft');
      line.push(shrink(img, k));
      console.log(`${row.biome} ${row.floor} ${d}: ${ms.toFixed(1)} ms`);
    }
    cells.push(line);
  }
  const pad = 6;
  const label = 12;
  const left = 64;
  const colW = shown.map((_, c) => Math.max(...cells.map((line) => line[c].w)));
  const rowH = cells.map((line) => Math.max(...line.map((b) => b.h)) + label);
  const sheet = blank(colW.reduce((a, w) => a + w + pad, pad + left), rowH.reduce((a, h) => a + h + pad, pad + 14));
  fill(sheet, '#1b1d26');
  const text = (s: string, x: number, y: number, color: string) => blit(sheet, renderText(s.toUpperCase(), { face: 'small', fill: color }), x, y);
  text('Rolling Knight: floor designs, dealt from a shuffled deck (none repeats till all are played)', pad, 3, '#ffd27a');
  let y = pad + 14;
  cells.forEach((line, r) => {
    const { biome, floor: f } = rows[r];
    text(BIOMES[biome as keyof typeof BIOMES].name, 3, y + label + 2, '#c8d0e0');
    text(f % 5 === 0 ? `boss floor ${f}` : `floor ${f}`, 3, y + label + 10, f % 5 === 0 ? '#ff9a7a' : '#8a92a8');
    let x = pad + left;
    line.forEach((b, c) => {
      text(DESIGNS[shown[c]].name, x, y, '#f2e6c8');
      blit(sheet, b, x + Math.floor((colW[c] - b.w) / 2), y + label);
      x += colW[c] + pad;
    });
    y += rowH[r] + pad;
  });
  writePng(out, sheet, 1);
  console.log('wrote', out, `${sheet.w}x${sheet.h}`);
}

if (what === 'farm') {
  // The farm's mobs in every pose, and its boss: npx tsx tools/preview.ts farm out.png
  const { BIOMES } = await import('../src/world/biomes');
  const { floorMobs, floorBoss } = await import('../src/world/mobgen');
  const { mobFrame } = await import('../src/render/art/mobs');
  const b = BIOMES.farmland;
  const seen = new Map<string, ReturnType<typeof floorMobs>[number]>();
  for (let floor = 6; floor < 60 && seen.size < 9; floor++) {
    for (const t of floorMobs(b, floor, floor * 31)) if (!seen.has(`${t.plan}/${t.behavior}`)) seen.set(`${t.plan}/${t.behavior}`, t);
  }
  const poses = [['idle', 0], ['idle', 2], ['walk', 0], ['walk', 1], ['walk', 2], ['wind', 0], ['strike', 0]] as const;
  const cw = 44;
  const ch = 34;
  const types = [...seen.values()];
  const sheet = blank(cw * (poses.length + 1), ch * (types.length * 2) + 70);
  fill(sheet, b.ground.ramp[2]);
  types.forEach((t, row) => {
    poses.forEach(([pose, f], col) => {
      for (const elite of [false, true]) {
        const fr = mobFrame(t, pose, f, 'down', elite, false);
        blit(sheet, fr.buf, col * cw + 4, (row * 2 + (elite ? 1 : 0)) * ch + ch - 2 - fr.ay);
      }
    });
    console.log(`${t.plan}/${t.behavior}: ${t.name}`);
  });
  const boss = floorBoss(b, 10, 7);
  for (const [i, [pose, f]] of ([['idle', 0], ['walk', 1], ['wind', 0]] as const).entries()) {
    const fr = mobFrame(boss, pose, f, 'down', false, true);
    blit(sheet, fr.buf, 4 + i * 90, types.length * 2 * ch + 68 - fr.ay);
  }
  console.log(`boss: ${boss.name}, ${boss.boss!.title} (${boss.plan}, ${boss.boss!.moves.join(' ')})`);
  writePng(out, sheet, 3);
  console.log('wrote', out);
}

if (what === 'npcs') {
  const { NPC_DEFS, demonMobType, makeNpc } = await import('../src/world/npcs');
  const { npcFrame, questMarker, NPC_W, NPC_H } = await import('../src/render/art/npcs');
  const { mobFrame } = await import('../src/render/art/mobs');
  const { BIOMES } = await import('../src/world/biomes');
  const cells: Array<[View, 'idle' | 'walk', number]> = [
    ['down', 'idle', 0], ['down', 'idle', 1], ['down', 'walk', 0], ['down', 'walk', 2],
    ['side', 'idle', 0], ['side', 'walk', 0], ['side', 'walk', 1], ['side', 'walk', 2],
    ['up', 'idle', 0], ['up', 'walk', 1],
  ];
  const cw = NPC_W + 2;
  const ch = NPC_H + 3;
  const grounds = ['#456a33', '#5c8740', '#263432', '#a3b8d0', '#3a2622', '#bc8a52'];
  const sheet = blank(cw * (cells.length + 2), ch * NPC_DEFS.length + 70);
  fill(sheet, '#3a4a3c');
  NPC_DEFS.forEach((def, row) => {
    // A band of ground behind each row, from light to dark, to check they read on any floor.
    const g = grounds[row % grounds.length];
    for (let y = row * ch; y < row * ch + ch; y++) for (let x = 0; x < sheet.w; x++) setRGB(sheet, x, y, g);
    cells.forEach(([view, anim, f], col) => {
      const fr = npcFrame(def, anim, view, f);
      blit(sheet, fr.buf, col * cw + 2, row * ch + ch - 1 - fr.ay);
    });
    const npc = makeNpc(def, 0, 0, 3, 'hamlet', 7);
    console.log(`${def.name} (${def.kind}): ${def.barks[0]}${npc.questIndex >= 0 ? ` [quest: ${def.quests[npc.questIndex].kind}]` : ''}`);
  });
  // Quest markers, and the demons unmasked (the mob art, as a mini-boss at 2x).
  const y0 = ch * NPC_DEFS.length + 4;
  blit(sheet, questMarker('offer'), 4, y0);
  blit(sheet, questMarker('turnIn'), 18, y0);
  NPC_DEFS.filter((d) => d.kind === 'demon').forEach((d, i) => {
    let seed = 0;
    while (demonMobType(4, 'hamlet', seed).name !== d.demon!.name) seed++;
    const t = demonMobType(4, 'hamlet', seed);
    const fr = mobFrame(t, 'idle', 0, 'down', false, true);
    blit(sheet, fr.buf, 40 + i * 56, y0 + 62 - fr.ay);
    console.log(`demon: ${t.name}, ${t.boss!.title} (${t.boss!.moves.join(' ')}), hp ${Math.round(t.hp)}`);
  });
  writePng(out, sheet, 4);
  // The cast at game scale on a hamlet floor, to judge them at their real size.
  const strip = blank(NPC_DEFS.length * 18 + 8, 34);
  fill(strip, BIOMES.hamlet.ground.ramp[2]);
  NPC_DEFS.forEach((def, i) => {
    const fr = npcFrame(def, 'idle', i % 3 === 1 ? 'side' : 'down', 0);
    blit(strip, fr.buf, 4 + i * 18 - 4, 30 - fr.ay);
  });
  writePng(out.replace(/\.png$/, '_small.png'), strip, 2);
  console.log('wrote', out);
}

if (what === 'campkit') {
  // Each biome's set-up close up on its own ground with a keeper: npx tsx tools/preview.ts campkit out.png [scale]
  const { BIOME_ORDER, BIOMES } = await import('../src/world/biomes');
  const { CAMP_PLANS } = await import('../src/world/camps');
  const { NPC_DEFS } = await import('../src/world/npcs');
  const { propArt } = await import('../src/render/art/props');
  const { npcFrame } = await import('../src/render/art/npcs');
  const scale = Number(process.argv[4] ?? 6);
  const CW = 64;
  const CH = 84;
  const sheet = blank(CW * 6, CH * 2);
  BIOME_ORDER.forEach((id, k) => {
    const biome = BIOMES[id];
    const plan = CAMP_PLANS[id];
    const cell = blank(CW, CH);
    // The ground, and a band of the wall behind the set-up.
    fill(cell, biome.ground.ramp[2]);
    const oy = 40;
    const ox = 8;
    for (let y = 0; y < oy; y++) for (let x = 0; x < CW; x++) setRGB(cell, x, y, y >= oy - 16 && biome.solid.kind !== 'trees' ? biome.solid.face[Math.min(biome.solid.face.length - 1, y < oy - 13 ? 3 : 2)] : biome.solid.top[1]);
    type D = { y: number; draw: () => void };
    const list: D[] = plan.pieces.map((pc) => {
      const art = propArt(pc.kind, biome, ((k * 7 + 3) % 5) * 104729 + 7);
      return { y: pc.y, draw: () => blit(cell, art.buf, ox + pc.x - art.ax, oy + pc.y - art.ay) };
    });
    const def = NPC_DEFS[k % NPC_DEFS.length];
    const fr = npcFrame(def, 'idle', 'down', 0);
    list.push({ y: plan.stand.y, draw: () => blit(cell, fr.buf, ox + plan.stand.x - fr.ax, oy + plan.stand.y - fr.ay) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();
    blit(sheet, cell, (k % 6) * CW, Math.floor(k / 6) * CH);
  });
  writePng(out, sheet, scale);
  console.log('wrote', out);
}

if (what === 'camps') {
  // The folk's set-ups where they stand on a real floor of each biome: terrain, trees, props, the
  // keeper and the mobs, under the biome's light (lamps and fires roughly as the game adds them).
  //   npx tsx tools/preview.ts camps out.png [seed] [biome] [scale]   (RAW=1: no light)
  const { BIOME_ORDER, BIOMES, isBossFloor } = await import('../src/world/biomes');
  const { generateFloor } = await import('../src/world/mapgen');
  const { floorMobs } = await import('../src/world/mobgen');
  const { placeNpcs } = await import('../src/world/npcs');
  const { paintTerrainPixels } = await import('../src/render/terrain');
  const { artOf } = await import('../src/render/art/artOf');
  const { npcFrame } = await import('../src/render/art/npcs');
  const { mobFrame } = await import('../src/render/art/mobs');
  const { rgb } = await import('../src/render/pixel/buf');
  const { mixHex } = await import('../src/render/art/draw');
  const seed0 = Number(process.argv[4] ?? 7);
  const only = process.argv[5];
  const scale = Number(process.argv[6] ?? 4);
  const CW = 112;
  const CH = 92;
  const ids = BIOME_ORDER.filter((id) => !only || id === only);
  const cols = Math.min(ids.length, 4);
  const sheet = blank(CW * cols + (cols - 1) * 2, CH * Math.ceil(ids.length / cols) + (Math.ceil(ids.length / cols) - 1) * 2);
  fill(sheet, '#101018');
  const DAY = new Set(['hamlet', 'farmland', 'desert', 'tundra']);
  ids.forEach((id, k) => {
    const biome = BIOMES[id];
    const stretch = BIOME_ORDER.indexOf(id);
    let floor = stretch * 5 + 2;
    let seed = seed0;
    let map = generateFloor({ floor, biome, seed, boss: false });
    let npcs = placeNpcs(map, floor, id, seed);
    for (let tries = 0; !npcs.length && tries < 20; tries++) {
      seed += 101;
      floor = stretch * 5 + 1 + (tries % 4);
      if (isBossFloor(floor)) floor++;
      map = generateFloor({ floor, biome, seed, boss: false });
      npcs = placeNpcs(map, floor, id, seed);
    }
    const n = npcs[0];
    const t = paintTerrainPixels(map, biome);
    const img: PixelBuf = { w: t.w, h: t.h, px: t.px.slice() };
    type D = { y: number; draw: () => void };
    const list: D[] = [];
    for (const p of map.props) {
      const art = artOf(p, biome);
      list.push({ y: p.y, draw: () => blit(img, art.buf, p.x - art.ax, p.y - art.ay) });
    }
    const types = floorMobs(biome, floor, seed);
    map.spawns.forEach((s, i) => {
      const fr = mobFrame(types[i % types.length], 'idle', i, 'down', s.elite, false);
      list.push({ y: s.y, draw: () => blit(img, fr.buf, s.x - fr.ax, s.y - fr.ay) });
    });
    for (const x of npcs) {
      const fr = npcFrame(x.def, 'idle', 'down', 0);
      list.push({ y: x.y, draw: () => blit(img, fr.buf, x.x - fr.ax, x.y - fr.ay) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();
    // The light: the ambient over everything, lamps and fires added (dimmer by day), as the game does.
    if (!process.env.RAW) {
      const amb = DAY.has(id) ? mixHex(biome.light.ambient, '#fffaf0', 0.6) : id === 'forest' ? mixHex(biome.light.ambient, '#a8b8cc', 0.36) : biome.light.ambient;
      const [ar, ag, ab] = rgb(amb);
      const lum = (ar * 0.299 + ag * 0.587 + ab * 0.114) / 255;
      const lampK = Math.max(0.3, Math.min(1, (0.95 - lum) * 2.4));
      const L = new Float32Array(img.w * img.h * 3);
      for (let i = 0; i < img.w * img.h; i++) {
        L[i * 3] = ar / 255;
        L[i * 3 + 1] = ag / 255;
        L[i * 3 + 2] = ab / 255;
      }
      const cx = n ? n.x : map.start.x;
      const cy = n ? n.y : map.start.y;
      const lights = map.props.flatMap((p) => {
        const l = artOf(p, biome).light;
        return l ? [{ x: p.x + l.dx, y: p.y + l.dy, r: l.r * (0.75 + 0.25 * lampK), color: l.color, k: 0.95 * lampK }] : [];
      });
      for (const l of lights) {
        if (Math.abs(l.x - cx) > CW + l.r || Math.abs(l.y - cy) > CH + l.r) continue;
        const [lr, lg, lb] = rgb(l.color);
        for (let y = Math.max(0, Math.floor(l.y - l.r)); y < Math.min(img.h, l.y + l.r); y++) {
          for (let x = Math.max(0, Math.floor(l.x - l.r)); x < Math.min(img.w, l.x + l.r); x++) {
            const d = Math.hypot(x + 0.5 - l.x, (y + 0.5 - l.y) / 0.8) / l.r;
            if (d >= 1) continue;
            const a = d < 0.25 ? 1 - d * 1.12 : d < 0.5 ? 0.72 - (d - 0.25) * 1.44 : d < 0.75 ? 0.36 - (d - 0.5) * 0.96 : 0.12 - (d - 0.75) * 0.48;
            const i = y * img.w + x;
            L[i * 3] += (lr / 255) * a * l.k;
            L[i * 3 + 1] += (lg / 255) * a * l.k;
            L[i * 3 + 2] += (lb / 255) * a * l.k;
          }
        }
      }
      for (let i = 0; i < img.w * img.h; i++) {
        img.px[i * 4] = Math.min(255, img.px[i * 4] * Math.min(2, L[i * 3]));
        img.px[i * 4 + 1] = Math.min(255, img.px[i * 4 + 1] * Math.min(2, L[i * 3 + 1]));
        img.px[i * 4 + 2] = Math.min(255, img.px[i * 4 + 2] * Math.min(2, L[i * 3 + 2]));
      }
    }
    // The crop round the keeper.
    const x0 = Math.max(0, Math.min(img.w - CW, Math.round((n?.x ?? map.start.x) - CW / 2)));
    const y0 = Math.max(0, Math.min(img.h - CH, Math.round((n?.y ?? map.start.y) - CH * 0.6)));
    const crop = blank(CW, CH);
    for (let y = 0; y < CH; y++) crop.px.set(img.px.subarray(((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x0 + CW) * 4), y * CW * 4);
    blit(sheet, crop, (k % cols) * (CW + 2), Math.floor(k / cols) * (CH + 2));
    console.log(id.padEnd(10), `floor ${floor} seed ${seed}`, n ? `${n.def.name} at ${n.x},${n.y} ${n.camp?.nook ? 'nook' : 'floor'} room ${map.rooms[n.camp!.room]?.kind}` : 'no npc');
  });
  writePng(out, sheet, scale);
  console.log('wrote', out);
}
