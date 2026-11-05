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
  const kinds = ['rock', 'bush', 'flowers', 'barrel', 'crate', 'bones', 'torch', 'lantern', 'brazier', 'gravestone', 'crystalSmall', 'reeds', 'mushroomSmall', 'pumpkin', 'stump', 'pillar', 'statue', 'well', 'fence', 'skull', 'cart', 'stoneLantern', 'banner', 'campfire', 'tent', 'hayBale', 'cabbage', 'wheat', 'scarecrow', 'trough', 'sunflower'] as const;
  const cw = 30;
  const ch = 36;
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

if (what === 'floor') {
  // A whole floor, ground, props and mobs, under the biome's ambient light:
  //   npx tsx tools/preview.ts floor out.png farmland 7 1234 [y0] [h]
  const { BIOMES, isBossFloor } = await import('../src/world/biomes');
  const { generateFloor } = await import('../src/world/mapgen');
  const { floorMobs, floorBoss } = await import('../src/world/mobgen');
  const { paintTerrainPixels } = await import('../src/render/terrain');
  const { propArt, treeArt } = await import('../src/render/art/props');
  const { mobFrame } = await import('../src/render/art/mobs');
  const { rgb } = await import('../src/render/pixel/buf');
  const biome = BIOMES[(process.argv[4] ?? 'farmland') as keyof typeof BIOMES];
  const floor = Number(process.argv[5] ?? 7);
  const seed = Number(process.argv[6] ?? 1234);
  const boss = isBossFloor(floor);
  const m = generateFloor({ floor, biome, seed, boss });
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
  // The light, roughly: the ambient multiplied over everything.
  const [ar, ag, ab] = rgb(biome.light.ambient);
  for (let i = 0; i < img.px.length; i += 4) {
    img.px[i] = (img.px[i] * ar) / 255;
    img.px[i + 1] = (img.px[i + 1] * ag) / 255;
    img.px[i + 2] = (img.px[i + 2] * ab) / 255;
  }
  const y0 = Number(process.argv[7] ?? 0);
  const h = Math.min(img.h - y0, Number(process.argv[8] ?? img.h));
  const crop = blank(img.w, h);
  crop.px.set(img.px.subarray(y0 * img.w * 4, (y0 + h) * img.w * 4));
  writePng(out, crop, Number(process.argv[9] ?? 1));
  console.log('wrote', out, `${m.w}x${m.h} tiles`, types.map((x) => `${x.name} (${x.plan}/${x.behavior})`).join(', '), bossType ? `boss: ${bossType.name}, ${bossType.boss!.title}` : '');
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
