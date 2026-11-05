import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLASS_IDS, KEVIN_ID, knightDef, KNIGHTS, type ClassId } from '../src/core/knights';
import { RARITIES, rarityIndex } from '../src/core/rarity';
import { MUTATIONS } from '../src/core/state';
import { SHEETS, type SheetName } from '../src/render/pf/assets';
import { hexToOklch, oklchToHex, ramp } from '../src/render/pf/color';
import { attackAnim, dodgeAnim, heroPose, travelDir, travelDir8 } from '../src/render/pf/heroAnim';
import { KNIGHT_SHEET, KNIGHT_SHEET_BY_ID, knightPaint, knightSheet, paintStep, PRIMORDIAL_STEPS, tierRamps } from '../src/render/pf/knightLook';
import { BOSS_ANIM, kitOf, mobPose, moveAnim } from '../src/render/pf/mobAnim';
import { MONSTER_SHEET, mobPaint, monsterFor, undeadFor, type MonsterId } from '../src/render/pf/mobLook';
import { DIRS, DIRS8, eventFrame, facing, facing8, PFSheet, type Dir, type PFMeta } from '../src/render/pf/sheet';
import { readPng } from '../tools/knights/lib/png';
import { BIOME_ORDER, BIOMES, isBossFloor, biomeForFloor } from '../src/world/biomes';
import type { Unit } from '../src/world/entities';
import { floorBoss, floorMobs, type MobType } from '../src/world/mobgen';
import type { World } from '../src/world/world';

/** A mob design with just what the mapping reads. */
function mob(biome: string, plan: MobType['plan'], behavior: MobType['behavior'], horns = false): MobType {
  return {
    id: `${biome}-3-0`, name: 'Test', plan, behavior, ramp: ['#3b2a1e', '#6a4a2c', '#9a6d3e', '#c99a5a'], eye: '#ffe066', size: 1, radius: 5,
    hp: 1, atk: 1, speed: 30, range: 10, atkCd: 1, flying: plan === 'flyer', features: { horns, spikes: false, crest: false, eyes: 2, tail: false, seed: 1 },
  };
}

function fakeWorld(units: Unit[], extra: Partial<World> = {}): World {
  return { time: 1, cleared: false, hub: false, camp: false, mobs: [], heroes: units, banner: 0, nearestEnemy: () => null, ...extra } as unknown as World;
}

function hero(cls: ClassId, extra: Partial<Unit> = {}): Unit {
  return {
    uid: Math.floor(Math.random() * 1e9), team: 'hero', x: 100, y: 100, vx: 0, vy: 0, r: 4, hp: 10, maxHp: 10, atk: 1, armor: 0, speed: 56,
    dir: 1, view: 'down', moving: false, animT: 0, swingT: 0, swingDur: 0.3, aimX: 1, aimY: 0, hurtT: 0, invuln: 0, dr: 1, drT: 0, stunT: 0,
    slowT: 0, burnT: 0, burnDps: 0, dead: false, flying: false, cls, knightId: `rare-${cls}`, rarity: 'rare', slot: 0, atkCd: 0.8, atkT: 0.5, range: 20,
    ...extra,
  } as Unit;
}

const LIGHTNESS = (hex: string) => hexToOklch(hex)[0];

/** Every knight sheet and the class whose animations it plays (class sheets and per-knight ones). */
function knightSheets(): Array<[SheetName, ClassId]> {
  const out = new Map<SheetName, ClassId>();
  for (const cls of CLASS_IDS) out.set(KNIGHT_SHEET[cls], cls);
  for (const [id, name] of Object.entries(KNIGHT_SHEET_BY_ID)) out.set(name, knightDef(id).cls);
  return [...out];
}

/** Loads a sheet's PNG into it (Node has no Image: the tools' decoder reads the file). */
function loadPixels(name: SheetName): void {
  if (SHEETS[name].ready) return;
  const img = readPng(fileURLToPath(new URL(`../src/assets/pf/${name}.png`, import.meta.url)));
  SHEETS[name].setPixels({ w: img.w, h: img.h, data: img.px });
}

describe('PixelForge sheets', () => {
  it('give every knight sheet what the game plays in every facing, with pixels, anchors and timing', () => {
    for (const [name, cls] of knightSheets()) {
      const sheet = SHEETS[name];
      const meta = sheet.meta;
      loadPixels(name);
      const anims = ['idle', 'walk', 'combat_idle', 'hurt', 'stun', 'death', 'victory', attackAnim(cls, null, 0, sheet), attackAnim(cls, null, 3, sheet)];
      for (const kind of ['roll', 'flip', 'vault', 'blink'] as const) anims.push(dodgeAnim(kind, sheet).anim);
      // Any cell size; the pivot inside the cell; four facings at least (diagonals optional).
      expect(meta.cell, name).toBeGreaterThanOrEqual(16);
      expect(meta.pivot[0] >= 0 && meta.pivot[0] < meta.cell && meta.pivot[1] >= 0 && meta.pivot[1] < meta.cell, `${name} pivot`).toBe(true);
      for (const d of meta.dirs ?? DIRS) expect(DIRS8, `${name} dirs`).toContain(d);
      for (const a of anims) {
        for (const d of DIRS) expect(sheet.has(a, d), `${name} ${a}_${d}`).toBe(true);
        const anim = meta.anims[a];
        const n = sheet.clip(a, 's').length;
        // Every facing has the same number of frames (heroAnim times them from one).
        for (const d of Object.keys(anim.dirs) as Dir[]) expect(anim.dirs[d]!.length, `${name} ${a}_${d} frames`).toBe(n);
        if (anim.phases) expect(anim.phases.length, `${name} ${a} phases`).toBe(n);
        for (const [f] of anim.events ?? []) expect(f, `${name} ${a} event frame`).toBeLessThan(n);
        for (const d of Object.keys(anim.dirs) as Dir[]) {
          for (const [k, ms] of anim.dirs[d]!) {
            expect(k >= 0 && k < meta.count, `${name} ${a}_${d} frame ${k}`).toBe(true);
            expect(ms, `${name} ${a}_${d} ms`).toBeGreaterThan(0);
            // Not empty: something solid in the frame.
            expect(sheet.indices(k).some((v) => v && meta.colors[v - 1][1] === 255), `${name} ${a}_${d} frame ${k} has pixels`).toBe(true);
            expect(meta.tops[k][0], `${name} frame ${k} top`).toBeGreaterThanOrEqual(0);
          }
        }
      }
      // Attacks strike on a drawn frame.
      for (const a of [attackAnim(cls, null, 0, sheet), attackAnim(cls, null, 3, sheet)]) expect(eventFrame(meta.anims[a], 'hit', 'spawn'), `${name} ${a} strike`).toBeGreaterThanOrEqual(0);
      expect(meta.anims.walk.stride?.length, `${name} walk stride`).toBe(sheet.clip('walk', 'e').length);
      // Every frame a knight shows standing or walking has the rig's anchors (capes, halos and stun
      // stars hang from them): chin, back and hip, and maybe the head's top.
      for (const a of ['idle', 'walk', 'combat_idle']) {
        for (const d of DIRS) {
          for (const [k] of sheet.clip(a, d)) {
            const anc = meta.anchors?.[k];
            expect([6, 8], `${name} ${a}_${d} anchors`).toContain(anc?.length);
            for (let i = 0; i < anc!.length; i++) expect(anc![i] >= 0 && anc![i] < meta.cell, `${name} anchor in the cell`).toBe(true);
          }
        }
      }
      // A cape layer, when the sheet draws its own, is a frame of the sheet.
      for (const c of meta.capes ?? []) if (c) for (const k of c) expect(k >= -1 && k < meta.count).toBe(true);
    }
    // Kevin plays from his own sheet; everyone else from their class's.
    expect(knightSheet(KEVIN_ID)).toBe('rk_kevin');
    expect(knightSheet('rare-blade')).toBe(KNIGHT_SHEET.blade);
    // Each class's own dodge is drawn: roll, backflip (Ranger), vault (Lancer), dodge (Arcanist).
    expect(dodgeAnim('flip', SHEETS.rk_ranger).anim).toBe('backflip');
    expect(dodgeAnim('vault', SHEETS.rk_lancer).anim).toBe('vault');
    expect(dodgeAnim('blink', SHEETS.rk_arcanist).anim).toBe('dodge');
    expect(dodgeAnim('roll', SHEETS.rk_guardian).anim).toBe('roll');
    expect(attackAnim('ranger', null, 0, SHEETS.rk_ranger)).toBe('shoot_bow');
    expect(attackAnim('cleric', null, 0, SHEETS.rk_cleric)).toBe('cast');
    expect(attackAnim('blade', null, 3, SHEETS.rk_blade)).toBe('attack_heavy');
    expect(attackAnim('guardian', 'groundPound', 0, SHEETS.rk_guardian)).toBe('attack_heavy');
  });

  it('give every monster its kit in every facing it draws (s, e, n and w; e and w for the packs\' side views), and the Stone Warden all six boss moves', () => {
    for (const [m, name] of Object.entries(MONSTER_SHEET) as Array<[MonsterId, keyof typeof SHEETS]>) {
      const kit = kitOf(m);
      const sheet = SHEETS[name];
      for (const a of [kit.walk, kit.melee, kit.ranged, kit.bomb, kit.death, kit.stun, kit.run, 'idle', 'hurt']) {
        if (!a) continue;
        for (const d of sheet.meta.dirs ?? DIRS) expect(sheet.has(a, d), `${m} ${a}_${d}`).toBe(true);
      }
    }
    for (const a of [...Object.values(BOSS_ANIM), 'enrage']) for (const d of DIRS) expect(SHEETS.stone_warden.has(a, d), a).toBe(true);
    expect(SHEETS.stone_warden.meta.anims.charge.loopFrames).toEqual([2, 3]);
  });

  it('recolor by swapping material shades, keeping the outline and the soft shadow', () => {
    const sheet = SHEETS.rk_guardian;
    const metal = ['#101010', '#202020', '#303030', '#404040'];
    const pal = sheet.palette({ metal });
    sheet.meta.colors.forEach(([hex, a, mat, shade], i) => {
      const got = `#${[...pal.slice((i + 1) * 4, (i + 1) * 4 + 3)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      expect(pal[(i + 1) * 4 + 3]).toBe(a);
      expect(got).toBe(mat === 'metal' ? metal[shade] : hex);
    });
    const flash = sheet.palette({}, '#efe2c8');
    sheet.meta.colors.forEach(([hex, , mat], i) => {
      const got = `#${[...flash.slice((i + 1) * 4, (i + 1) * 4 + 3)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      expect(got).toBe(mat === 'outline' || mat === 'shadow' ? hex : '#efe2c8');
    });
    // A frame of a sheet with no image yet is empty (Node, tests): nothing breaks.
    expect(new PFSheet(sheet.meta as PFMeta).frameBuf(0, pal).px.every((v) => v === 0)).toBe(true);
  });
});

describe('knight looks', () => {
  it('keep PixelForge lightness steps and range for every rarity and mutation', () => {
    for (const k of KNIGHTS) {
      for (const mut of [null, ...MUTATIONS]) {
        const p = knightPaint(k.id, mut);
        expect(p.sheet).toBe(knightSheet(k.id));
        for (const [mat, r] of Object.entries(p.recolor)) {
          if (!r || r.length < 2 || mat === 'eyes') continue;
          for (const hex of r) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
          const Ls = r.map(LIGHTNESS);
          for (let i = 1; i < Ls.length; i++) expect(Ls[i], `${k.id} ${mut} ${mat}`).toBeGreaterThan(Ls[i - 1]);
          // Nothing darker than the outline (L 0.30), nothing near white except Void's cyan glint.
          expect(Math.min(...Ls)).toBeGreaterThan(0.28);
          expect(Math.max(...Ls)).toBeLessThan(0.86);
        }
      }
    }
  });

  it('make every tier look different, plainer below and richer above', () => {
    const metals = RARITIES.map((r) => tierRamps(r).metal);
    for (let i = 1; i < metals.length; i++) {
      const a = hexToOklch(metals[i - 1][2]);
      const b = hexToOklch(metals[i][2]);
      const dh = Math.min(Math.abs(a[2] - b[2]), 360 - Math.abs(a[2] - b[2]));
      expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) * 4 + (dh / 360) * Math.min(a[1], b[1]) * 8, `${RARITIES[i - 1]} vs ${RARITIES[i]}`).toBeGreaterThan(0.02);
    }
    const chroma = (r: (typeof RARITIES)[number]) => hexToOklch(tierRamps(r).cloth[1])[1];
    expect(chroma('common')).toBeLessThan(0.035);
    for (const r of ['rare', 'epic', 'legendary', 'mythic', 'exalted', 'celestial']) expect(chroma(r as (typeof RARITIES)[number]), r).toBeGreaterThan(0.06);
    // Capes from Epic, halos from Celestial, Primordial cycles through its steps.
    for (const k of KNIGHTS) {
      const p = knightPaint(k.id, null);
      const own = k.id in KNIGHT_SHEET_BY_ID;
      expect(!!p.cape, k.id).toBe(!own && rarityIndex(k.rarity) >= rarityIndex('epic'));
      expect(!!p.halo, k.id).toBe(!own && rarityIndex(k.rarity) >= rarityIndex('celestial'));
    }
    const steps = new Set(Array.from({ length: 60 }, (_, i) => paintStep('primordial', i * 0.5)));
    expect(steps.size).toBe(PRIMORDIAL_STEPS);
    expect(knightPaint('primordial-blade', null, 0).recolor.metal).not.toEqual(knightPaint('primordial-blade', null, 12).recolor.metal);
    expect(paintStep('legendary', 99)).toBe(0);
    // Mutations repaint: Gilded is golden, Shadow dark, Radiant light, Void near black with a cyan glint.
    const base = knightPaint('rare-guardian', null).recolor.metal!;
    expect(hexToOklch(knightPaint('rare-guardian', 'gilded').recolor.metal![2])[2]).toBeGreaterThan(55);
    expect(LIGHTNESS(knightPaint('rare-guardian', 'shadow').recolor.metal![2])).toBeLessThan(LIGHTNESS(base[2]) - 0.15);
    expect(LIGHTNESS(knightPaint('rare-guardian', 'radiant').recolor.metal![1])).toBeGreaterThan(LIGHTNESS(base[1]) + 0.1);
    expect(LIGHTNESS(knightPaint('rare-guardian', 'void').recolor.metal![1])).toBeLessThan(0.36);
  });

  it('build ramps in OKLCH that round-trip through hex', () => {
    for (const [L, C, h] of [[0.5, 0.05, 30], [0.7, 0.09, 250], [0.35, 0.02, 120]]) {
      const back = hexToOklch(oklchToHex(L, C, h));
      expect(Math.abs(back[0] - L)).toBeLessThan(0.01);
      expect(Math.abs(back[1] - C)).toBeLessThan(0.01);
    }
    const r = ramp([0.4, 0.5, 0.6], 0.06, 300);
    expect(r.map(LIGHTNESS).every((v, i, a) => i === 0 || v > a[i - 1])).toBe(true);
  });
});

describe('mobs as PixelForge monsters', () => {
  it('map body plans to monsters, keeping the game art where PixelForge has none', () => {
    // The supplied pack's slime everywhere; the dark biomes' humanoids are the pack's undead.
    expect(monsterFor(mob('hamlet', 'slime', 'chaser'), false, false)).toBe('pk_slime');
    expect(monsterFor(mob('swamp', 'slime', 'bomber'), false, false)).toBe('pk_slime');
    expect(monsterFor(mob('hamlet', 'flyer', 'swarm'), false, false)).toBe('bat');
    expect(monsterFor(mob('farmland', 'flyer', 'swarm'), false, false)).toBeNull();
    expect(monsterFor(mob('forest', 'beast', 'chaser'), false, false)).toBe('wolf');
    expect(monsterFor(mob('tundra', 'beast', 'charger'), false, false)).toBe('frost_wolf');
    expect(monsterFor(mob('hamlet', 'humanoid', 'chaser'), false, false)).toBe('goblin');
    expect(monsterFor(mob('hamlet', 'humanoid', 'chaser'), true, false)).toBe('goblin_chief');
    expect(monsterFor(mob('hamlet', 'humanoid', 'chaser', true), false, false)).toBe('orc');
    expect(monsterFor(mob('tundra', 'humanoid', 'chaser'), false, false)).toBe('orc');
    for (const b of ['dungeon', 'crypt', 'graveyard']) expect(monsterFor(mob(b, 'humanoid', 'chaser'), false, false)).toBe(undeadFor(mob(b, 'humanoid', 'chaser')));
    expect(['pk_skeleton', 'pk_reaper', 'pk_vampire']).toContain(undeadFor(mob('crypt', 'humanoid', 'chaser')));
    expect(monsterFor(mob('desert', 'humanoid', 'chaser'), false, false)).toBe('skeleton');
    expect(monsterFor(mob('forest', 'humanoid', 'ranged'), false, false)).toBe('goblin_archer');
    expect(monsterFor(mob('forest', 'humanoid', 'caster'), false, false)).toBeNull();
    expect(monsterFor(mob('farmland', 'humanoid', 'chaser'), false, false)).toBeNull();
    expect(monsterFor(mob('tundra', 'golem', 'tank'), false, false)).toBe('ogre');
    for (const plan of ['bug', 'plant', 'pumpkin', 'ghost', 'pig', 'ram', 'chicken'] as const) expect(monsterFor(mob('hamlet', plan, 'chaser'), false, false)).toBeNull();
    // Bosses: the Stone Warden, but the farm's pig, ghosts and pumpkins keep theirs, and so does the demon.
    expect(monsterFor(mob('forest', 'beast', 'chaser'), false, true)).toBe('stone_warden');
    expect(monsterFor(mob('farmland', 'pig', 'charger'), false, true)).toBeNull();
    expect(monsterFor(mob('graveyard', 'ghost', 'caster'), false, true)).toBeNull();
    expect(monsterFor({ ...mob('ember', 'humanoid', 'chaser'), id: 'ember-demon-x-hamlet-3' }, false, true)).toBeNull();
  });

  it('paint every floor\'s mobs and boss from materials their sheet has', () => {
    for (let floor = 1; floor <= 55; floor++) {
      const biome = biomeForFloor(floor, 7);
      const types = [...floorMobs(biome, floor, 7).map((t) => [t, false] as const), ...(isBossFloor(floor) ? [[floorBoss(biome, floor, 7), true] as const] : [])];
      for (const [t, boss] of types) {
        for (const elite of [false, true]) {
          for (const enraged of boss ? [false, true] : [false]) {
            const p = mobPaint(t, elite, boss, enraged);
            if (!p) continue;
            const mats = new Set(SHEETS[p.sheet].meta.colors.map((c) => c[2]));
            for (const [mat, r] of Object.entries(p.recolor)) {
              expect(mats.has(mat), `${t.name} (${p.monster}) has ${mat}`).toBe(true);
              for (const hex of r!) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
            }
          }
        }
      }
    }
    // Biome stone for the warden: frost in the tundra, embers in the lava caves; enraged eyes go red.
    const warden = (b: string) => mobPaint({ ...mob(b, 'golem', 'tank'), id: `${b}-20-boss` }, false, true)!;
    expect(warden('tundra').recolor.stone).not.toEqual(warden('hamlet').recolor.stone);
    expect(hexToOklch(warden('ember').recolor.hide![1])[1]).toBeGreaterThan(0.1);
    const calm = mobPaint({ ...mob('forest', 'beast', 'chaser'), id: 'forest-15-boss' }, false, true, false)!;
    const mad = mobPaint({ ...mob('forest', 'beast', 'chaser'), id: 'forest-15-boss' }, false, true, true)!;
    expect(hexToOklch(mad.recolor.eyes![0])[2]).toBeLessThan(45);
    expect(mad.recolor.eyes).not.toEqual(calm.recolor.eyes);
    for (const id of BIOME_ORDER) expect(BIOMES[id]).toBeTruthy();
  });

  it('play the windup over the game\'s telegraph and strike when the sim does', () => {
    const t = mob('hamlet', 'humanoid', 'chaser');
    const m = { ...hero('blade'), team: 'mob', type: t, cls: undefined, knightId: undefined, awake: true, windT: 0, windDur: 0, move: undefined, boss: false, elite: false } as unknown as Unit;
    const h = hero('guardian', { x: 130, y: 100 });
    const w = fakeWorld([h], { mobs: [m] } as Partial<World>);
    const sheet = SHEETS.goblin;
    const clip = sheet.clip('attack_slash', 'e');
    expect(mobPose(w, m, 'goblin', 'goblin').anim).toBe('idle');
    m.windT = m.windDur = 0.32;
    m.move = 'bite';
    const seen: number[] = [];
    for (let i = 0; i < 8; i++) {
      (w as { time: number }).time += 0.04;
      m.windT = Math.max(0.001, (m.windT ?? 0) - 0.04);
      const p = mobPose(w, m, 'goblin', 'goblin');
      expect(p.anim).toBe('attack_slash');
      expect(p.dir).toBe('e');
      seen.push(p.k);
    }
    // The windup frames, in order, over the wind-up (the strike frame is frame 2).
    expect(seen[0]).toBe(clip[0][0]);
    expect(seen[seen.length - 1]).toBe(clip[1][0]);
    (w as { time: number }).time += 0.02;
    m.windT = 0;
    m.swingT = 0.25;
    expect(mobPose(w, m, 'goblin', 'goblin').k).toBe(clip[2][0]);
    expect(moveAnim('stone_warden', 'rain', true)).toBe('stomp');
    expect(moveAnim('slime', 'bomb', false)).toBe('attack_spit');
    expect(moveAnim('goblin_archer', 'shoot', false)).toBe('shoot_bow');
  });
});

describe('knight animations from the sim', () => {
  it('face the dominant axis, holding a view on diagonals', () => {
    expect(facing(3, 1)).toBe('e');
    expect(facing(-3, 1)).toBe('w');
    expect(facing(1, -3)).toBe('n');
    expect(facing(0, 2)).toBe('s');
    expect(travelDir(10, 9, 's')).toBe('s');
    expect(travelDir(10, 2, 's')).toBe('e');
    expect(travelDir(-10, 1, 'e')).toBe('w');
  });

  it('face eight ways on sheets that draw diagonals, and fall back to the nearest drawn facing', () => {
    expect(facing8(1, 1)).toBe('se');
    expect(facing8(-1, -1)).toBe('nw');
    expect(facing8(1, -0.2)).toBe('e');
    expect(facing8(0, -1)).toBe('n');
    // Holding a diagonal until the heading is well into another sector.
    expect(travelDir8(1, 0.8, 'se')).toBe('se');
    expect(travelDir8(1, 0, 'se')).toBe('e');
    // A four-way sheet shows a diagonal as its side view, and west as west.
    const sheet = SHEETS.rk_blade;
    expect(sheet.eightWay).toBe(false);
    expect(sheet.drawnDir('walk', 'se')).toBe('e');
    expect(sheet.drawnDir('walk', 'nw')).toBe('w');
    expect(sheet.clip('walk', 'sw')).toEqual(sheet.clip('walk', 'w'));
    // An eight-way sheet shows its own diagonals.
    const meta = structuredClone(sheet.meta) as PFMeta;
    meta.dirs = [...DIRS8];
    meta.anims.walk.dirs.se = meta.anims.walk.dirs.s;
    const eight = new PFSheet(meta);
    expect(eight.eightWay).toBe(true);
    expect(eight.drawnDir('walk', 'se')).toBe('se');
    expect(eight.drawnDir('idle', 'se')).toBe('e');
  });

  it('play what the knight is doing', () => {
    const h = hero('ranger');
    const w = fakeWorld([h]);
    expect(heroPose(w, h).anim).toBe('idle');
    // A swing: the bow's release shows on the tick the arrow leaves, facing the aim.
    (w as { time: number }).time += 0.016;
    h.swingT = h.swingDur = 0.22;
    h.aimX = 0;
    h.aimY = -1;
    let p = heroPose(w, h);
    expect(p.anim).toBe('shoot_bow');
    expect(p.dir).toBe('n');
    expect(p.k).toBe(SHEETS.rk_ranger.clip('shoot_bow', 'n')[3][0]);
    // A backflip faces away from where it goes.
    (w as { time: number }).time += 1;
    h.swingT = 0;
    h.rolling = { dx: 1, dy: 0, t: 0.3, dur: 0.36, speed: 200, kind: 'flip', hit: new Set() };
    p = heroPose(w, h);
    expect(p.anim).toBe('backflip');
    expect(p.dir).toBe('w');
    h.rolling = undefined;
    // Walking steps by distance (10 px of stride is a cycle), but at the game's speeds no faster than
    // a frame every 90 ms or so: at 50 px/s the feet slide a little instead of flicking.
    h.moving = true;
    const frames: number[] = [];
    for (let i = 0; i < 40; i++) {
      (w as { time: number }).time += 0.02;
      h.x += 1;
      p = heroPose(w, h);
      expect(p.anim).toBe('walk');
      frames.push(p.k);
    }
    expect(new Set(frames).size).toBe(4);
    let changes = 0;
    for (let i = 12; i < frames.length; i++) if (frames[i] !== frames[i - 1]) changes++;
    // 28 ticks of 20 ms once the pace has settled: about six frames, never the fourteen of a frame per 40 ms.
    expect(changes).toBeLessThanOrEqual(7);
    expect(changes).toBeGreaterThanOrEqual(4);
    // Downed: the death, held; stunned: stun.
    h.moving = false;
    h.downed = true;
    (w as { time: number }).time += 2;
    expect(heroPose(w, h).anim).toBe('death');
    // Revived: it stands back up (the death backward), then it's on its feet.
    h.downed = false;
    (w as { time: number }).time += 0.1;
    expect(heroPose(w, h).anim).toBe('death');
    (w as { time: number }).time += 0.5;
    h.stunT = 1;
    expect(heroPose(w, h)).toMatchObject({ anim: 'stun', stunned: true });
  });
});
