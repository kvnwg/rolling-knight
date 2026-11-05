import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { knightId } from '../src/core/knights';
import { newGame } from '../src/core/newGame';
import { addKnight, knightStats } from '../src/core/roster';
import { propArt } from '../src/render/art/props';
import { DUNGEON_SPRITES } from '../src/render/packs/dungeonArt';
import { isDungeonProp } from '../src/render/packs/dungeonProps';
import { trapPieces } from '../src/render/packs/trapArt';
import { SHEETS, type SheetName } from '../src/render/pf/assets';
import { deathFx, deathPose, kitOf, mobPose } from '../src/render/pf/mobAnim';
import { MONSTER_SHEET, mobPaint, monsterFor, type MonsterId } from '../src/render/pf/mobLook';
import { clipMs, eventFrame } from '../src/render/pf/sheet';
import { paintTerrainPixels } from '../src/render/terrain';
import { BIOME_ORDER, BIOMES, biomeForFloor, isBossFloor } from '../src/world/biomes';
import { dungeonLook } from '../src/world/dungeonLook';
import type { Unit } from '../src/world/entities';
import { BLOCKED, FLOOR, SOLID, TILE, bfs, generateFloor, tileAt } from '../src/world/mapgen';
import { floorMobs, type MobType } from '../src/world/mobgen';
import { TRAP_SPEC, makeTraps, trapPhase, updateTraps, type Trap, type TrapKind } from '../src/world/traps';
import { World, type HeroSpec } from '../src/world/world';
import { readPng } from '../tools/knights/lib/png';

const dungeon = BIOMES.dungeon;
const PACK_MONSTERS: MonsterId[] = ['pk_skeleton', 'pk_reaper', 'pk_vampire', 'pk_slime'];

function squad(ids: string[]): HeroSpec[] {
  const s = newGame(1);
  ids.forEach((id) => addKnight(s, id, null));
  return ids.map((id, slot) => {
    const [rarity, cls] = id.split('-') as [HeroSpec['rarity'], HeroSpec['cls']];
    return { knightId: id, cls, rarity, mutation: null, stats: knightStats(s, id), slot, hpShare: 1 };
  });
}

function dungeonWorld(ids: string[], seed = 3, floor = 22): World {
  const map = generateFloor({ floor, biome: dungeon, seed, boss: false });
  return new World({ map, biome: dungeon, floor, boss: false, mobTypes: floorMobs(dungeon, floor, seed), bossType: null, squad: squad(ids), perks: [], controlled: 0, seed, goldPerKill: 3 });
}

/** A trap of `kind` placed on the floor at (x, y), for the tests. */
function trap(kind: TrapKind, x: number, y: number, phase = 0): Trap {
  return { kind, x, y, phase, reach: kind === 'saw' ? 17 : undefined, hits: new Map(), armedAt: -1 };
}

function loadPixels(name: SheetName): void {
  if (SHEETS[name].ready) return;
  const img = readPng(fileURLToPath(new URL(`../src/assets/packs/${name}.png`, import.meta.url)));
  SHEETS[name].setPixels({ w: img.w, h: img.h, data: img.px });
}

describe('the Dungeon', () => {
  it('comes before the crypt, five floors of it, a boss on the fifth', () => {
    expect(BIOME_ORDER.indexOf('dungeon')).toBe(BIOME_ORDER.indexOf('crypt') - 1);
    const first = BIOME_ORDER.indexOf('dungeon') * 5 + 1;
    for (let f = first; f < first + 5; f++) expect(biomeForFloor(f, 1).id).toBe('dungeon');
    expect(isBossFloor(first + 4)).toBe(true);
    expect(dungeon.layout).toBe('rooms');
    expect(dungeon.tiles).toBe('dungeon');
  });

  it('builds valid floors in both stones: connected, spawns reachable, traps on open floor, the same for the same seed', () => {
    const looks = new Set<string>();
    for (const seed of [1, 3, 11, 99, 1234]) {
      for (const floor of [21, 23, 25]) {
        const m = generateFloor({ floor, biome: dungeon, seed, boss: isBossFloor(floor) });
        looks.add(dungeonLook(m.seed));
        const d = bfs(m, Math.floor(m.start.x / TILE), Math.floor(m.start.y / TILE));
        for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === FLOOR) expect(d[i], `${seed}/${floor}: floor ${i} reachable`).toBeGreaterThanOrEqual(0);
        for (const s of m.spawns) expect(d[Math.floor(s.y / TILE) * m.w + Math.floor(s.x / TILE)]).toBeGreaterThanOrEqual(0);
        for (const t of m.traps ?? []) {
          const tx = Math.floor(t.x / TILE);
          const ty = Math.floor(t.y / TILE);
          expect(tileAt(m, tx, ty), `${t.kind} at ${tx},${ty} on open floor`).toBe(FLOOR);
          // Not where the squad arrives.
          expect(Math.hypot(t.x - m.start.x, t.y - m.start.y)).toBeGreaterThan(3 * TILE);
          expect(Math.hypot(t.x - m.exit.x, t.y - m.exit.y)).toBeGreaterThan(2 * TILE);
        }
        // Nothing solid stands on a trap.
        for (const p of m.props) if (p.solid) expect((m.traps ?? []).some((t) => Math.abs(t.x - p.x) < 8 && Math.abs(t.y - (p.y - 5)) < 8), `${p.kind} on a trap`).toBe(false);
        const again = generateFloor({ floor, biome: dungeon, seed, boss: isBossFloor(floor) });
        expect(Array.from(again.tiles)).toEqual(Array.from(m.tiles));
        expect(again.props).toEqual(m.props);
        expect(again.traps).toEqual(m.traps);
      }
    }
    expect([...looks].sort()).toEqual(['blue', 'purple']);
  });

  it('has traps of every kind on its floors, and a light in its rooms', () => {
    const kinds = new Set<string>();
    let torches = 0;
    let doors = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const m = generateFloor({ floor: 22, biome: dungeon, seed, boss: false });
      for (const t of m.traps ?? []) kinds.add(t.kind);
      expect((m.traps ?? []).length, `seed ${seed}`).toBeGreaterThan(3);
      torches += m.props.filter((p) => p.kind === 'torch' || p.kind === 'sideTorch').length;
      doors += m.props.filter((p) => p.kind === 'cellDoor' || p.kind === 'blueDoor').length;
      // Every room but the start is lit by something.
      for (const r of m.rooms) {
        if (r.kind === 'start') continue;
        const lit = m.props.some((p) => ['torch', 'sideTorch', 'candles', 'candlestick', 'brazier'].includes(p.kind) && Math.abs(p.x / TILE - r.cx) <= r.rx + 2 && Math.abs(p.y / TILE - r.cy) <= r.ry + 2);
        expect(lit, `seed ${seed} room at ${r.cx},${r.cy}`).toBe(true);
      }
    }
    expect([...kinds].sort()).toEqual(['plate', 'saw', 'spikes', 'vent']);
    expect(torches).toBeGreaterThan(20);
    expect(doors).toBeGreaterThan(3);
  });

  it('stamps its ground from the packs\' tiles, every pixel, and draws every prop from the packs', () => {
    for (const seed of [1, 3]) {
      const m = generateFloor({ floor: 22, biome: dungeon, seed, boss: false });
      const t = paintTerrainPixels(m, dungeon);
      for (let i = 3; i < t.px.length; i += 4) expect(t.px[i]).toBe(255);
      // The floor's own stone: a plain floor tile's pixel is the tileset's.
      const plain = dungeonLook(seed) === 'blue' ? [0x5b, 0x50, 0x76] : [0x3d, 0x25, 0x3b];
      let seen = 0;
      for (let i = 0; i < t.px.length; i += 4) if (t.px[i] === plain[0] && t.px[i + 1] === plain[1] && t.px[i + 2] === plain[2]) seen++;
      expect(seen, `seed ${seed}: the floor's stone`).toBeGreaterThan(5000);
      for (const p of m.props) {
        if (p.kind === 'tree') continue;
        const a = propArt(p.kind, dungeon, (p.seed % 5) * 104729 + 7);
        expect(a.buf.w * a.buf.h, p.kind).toBeGreaterThan(0);
        if (p.kind === 'torch' || p.kind === 'sideTorch' || p.kind === 'candles' || p.kind === 'candlestick') {
          expect(a.light, `${p.kind} lights the room`).toBeDefined();
          expect(a.glow?.length, `${p.kind} glows`).toBeGreaterThan(0);
        }
        if (isDungeonProp(p.kind)) expect(Object.keys(DUNGEON_SPRITES).length).toBeGreaterThan(0);
      }
    }
    // The pack's wall torch flickers through its four frames.
    expect(propArt('torch', dungeon, 7).frames?.length).toBe(4);
  });
});

describe('traps', () => {
  it('warn before they hurt: the spikes\' tips, the vent\'s spark, the plate turning over', () => {
    for (const kind of ['spikes', 'vent'] as const) {
      const tr = trap(kind, 0, 0);
      let warned = 0;
      let wasActive = false;
      for (let t = 0; t < TRAP_SPEC[kind].period * 3; t += 0.01) {
        const ph = trapPhase(tr, t);
        if (ph.warn) warned += 0.01;
        if (ph.active && !wasActive && t > 0.05) {
          // Every strike comes after at least half a second of warning.
          expect(warned, `${kind} at ${t.toFixed(2)}`).toBeGreaterThanOrEqual(0.5);
          warned = 0;
        }
        wasActive = ph.active;
      }
    }
    const plate = trap('plate', 0, 0);
    expect(trapPhase(plate, 5).active).toBe(false);
    plate.armedAt = 5;
    expect(trapPhase(plate, 5.1)).toMatchObject({ warn: true, active: false });
    expect(trapPhase(plate, 5.3)).toMatchObject({ warn: true, active: false });
    expect(trapPhase(plate, 5.5)).toMatchObject({ frame: 4, active: true });
    expect(trapPhase(plate, 6.8)).toMatchObject({ frame: 0, active: false });
    // A saw runs to and fro along its slot.
    const saw = trap('saw', 0, 0);
    const offsets = Array.from({ length: 26 }, (_, i) => trapPhase(saw, i * 0.1).offset!);
    expect(Math.min(...offsets)).toBeLessThan(-12);
    expect(Math.max(...offsets)).toBeGreaterThan(12);
    // Its art: what lies flat goes under everyone, what stands is sorted.
    expect(trapPieces(saw, 0).map((p) => p.flat)).toEqual([true, false]);
    expect(trapPieces(trap('spikes', 0, 0, 2.3), 0)[0]).toMatchObject({ flat: false });
  });

  it('can be rolled through: a knight mid-roll crosses spikes untouched, one walking across is hurt', () => {
    for (const roll of [true, false]) {
      const w = dungeonWorld([knightId('rare', 'blade')]);
      const h = w.heroes[0];
      w.mobs = [];
      // Spikes up at the start, just ahead of the knight.
      w.traps = [trap('spikes', Math.round(h.x) + 24, Math.round(h.y), 2.15)];
      const hp = h.hp;
      w.input = { mx: 1, my: 0, dodge: roll, special: false };
      for (let t = 0; t < 0.6; t += 1 / 60) {
        w.update(1 / 60);
        if (roll) w.input.mx = 0;
      }
      if (roll) {
        expect(h.x, 'rolled past the spikes').toBeGreaterThan(w.traps[0].x + 8);
        expect(h.hp).toBe(hp);
      } else expect(h.hp).toBeLessThan(hp);
    }
  });

  it('hurt mobs too (bosses barely), never flyers; a plate springs on whoever steps on it', () => {
    const w = dungeonWorld([knightId('rare', 'guardian')]);
    const h = w.heroes[0];
    h.x = 40;
    h.y = 40;
    const [walker] = w.mobs.filter((m) => !m.flying);
    const flyer = { ...walker, uid: walker.uid + 100000, flying: true } as Unit;
    w.mobs = [walker, flyer];
    walker.x = flyer.x = 200;
    walker.y = flyer.y = 200;
    w.traps = [trap('spikes', 200, 200, 2.3)];
    const [a, b] = [walker.hp, flyer.hp];
    updateTraps(w, w.traps);
    expect(walker.hp).toBeLessThan(a);
    expect(flyer.hp).toBe(b);
    // Once per strike, not every tick.
    const once = walker.hp;
    updateTraps(w, w.traps);
    expect(walker.hp).toBe(once);
    // A plate: stepped on, it turns over and strikes a moment later.
    walker.hp = walker.maxHp;
    w.traps = [trap('plate', 200, 200)];
    updateTraps(w, w.traps);
    expect(w.traps[0].armedAt).toBe(w.time);
    expect(walker.hp).toBe(walker.maxHp);
    w.time += 0.5;
    updateTraps(w, w.traps);
    expect(walker.hp).toBeLessThan(walker.maxHp);
    // A boss shrugs it off.
    walker.hp = walker.maxHp;
    walker.boss = true;
    w.traps = [trap('spikes', 200, 200, 2.3)];
    updateTraps(w, w.traps);
    expect(walker.maxHp - walker.hp).toBeLessThan(walker.maxHp * 0.02);
  });

  it('stay out of the start room on every floor, and the crypt has a few too', () => {
    let crypt = 0;
    for (const seed of [1, 2, 3, 4]) {
      const m = generateFloor({ floor: 27, biome: BIOMES.crypt, seed, boss: false });
      crypt += (m.traps ?? []).length;
      const w = new World({ map: m, biome: BIOMES.crypt, floor: 27, boss: false, mobTypes: floorMobs(BIOMES.crypt, 27, seed), bossType: null, squad: squad([knightId('rare', 'blade')]), perks: [], controlled: 0, seed, goldPerKill: 3 });
      expect(w.traps.length).toBe((m.traps ?? []).length);
      expect(makeTraps(m).every((t) => t.armedAt === -1)).toBe(true);
    }
    expect(crypt).toBeGreaterThan(0);
  });
});

describe('the packs\' monsters', () => {
  it('have every animation the sim asks for, in both facings, with pixels and a strike', () => {
    for (const m of PACK_MONSTERS) {
      const name = MONSTER_SHEET[m];
      const sheet = SHEETS[name];
      loadPixels(name);
      expect(sheet.meta.dirs).toEqual(['e', 'w']);
      expect(sheet.meta.pivot[0] > 0 && sheet.meta.pivot[0] < sheet.meta.cell && sheet.meta.pivot[1] < sheet.meta.cell).toBe(true);
      const kit = kitOf(m);
      for (const a of new Set([kit.walk, kit.melee, kit.ranged, kit.bomb, kit.death, 'idle', 'hurt'])) {
        if (!a) continue;
        const anim = sheet.meta.anims[a];
        expect(anim, `${m} ${a}`).toBeDefined();
        expect(anim.dirs.e!.length, `${m} ${a}`).toBe(anim.dirs.w!.length);
        for (const d of ['e', 'w'] as const) {
          for (const [k, ms] of anim.dirs[d]!) {
            expect(ms).toBeGreaterThan(0);
            expect(sheet.indices(k).some((v) => v && sheet.meta.colors[v - 1][1] === 255), `${m} ${a}_${d} frame ${k} has pixels`).toBe(true);
          }
        }
      }
      // The attack strikes on a drawn frame after a windup.
      const strike = eventFrame(sheet.meta.anims[kit.melee], 'hit');
      expect(strike, m).toBeGreaterThan(0);
      expect(strike).toBeLessThan(sheet.meta.anims[kit.melee].dirs.e!.length);
    }
  });

  it('strike on the frame where their slash smear lands', () => {
    // The smear's colors: the skeletons' white-blue sweep, the vampire's white claw marks.
    const smear: Record<string, string[]> = { pk_skeleton: ['#dae0ea', '#b3b9d1'], pk_reaper: ['#dae0ea', '#b3b9d1'], pk_vampire: ['#e6e6e6'] };
    for (const [m, colors] of Object.entries(smear) as Array<[MonsterId, string[]]>) {
      const name = MONSTER_SHEET[m];
      const sheet = SHEETS[name];
      loadPixels(name);
      const anim = sheet.meta.anims.attack;
      const strike = eventFrame(anim, 'hit');
      const idx = new Set(sheet.meta.colors.map((c, i) => (colors.includes(c[0]) ? i + 1 : -1)).filter((i) => i > 0));
      const count = (i: number) => Array.from(sheet.indices(anim.dirs.e![i][0])).filter((v) => idx.has(v)).length;
      for (let i = 0; i < strike; i++) expect(count(strike), `${m}: the strike frame shows more smear than windup frame ${i}`).toBeGreaterThan(count(i) + 6);
    }
  });

  it('wind up over the telegraph, strike when the sim does, and face the way the sim says', () => {
    const t: MobType = { ...floorMobs(dungeon, 22, 5)[0], id: 'dungeon-22-0', features: { horns: false, spikes: false, crest: false, eyes: 2, tail: false, seed: 0 } };
    expect(monsterFor(t, false, false)).toBe('pk_skeleton');
    const m = { uid: 7, team: 'mob', x: 100, y: 100, r: 5, dir: -1, awake: true, hurtT: 0, swingT: 0, stunT: 0, moving: false, windT: 0, windDur: 0, type: t, boss: false, elite: false } as unknown as Unit;
    const hero = { uid: 8, team: 'hero', x: 60, y: 104, downed: false } as unknown as Unit;
    const w = { time: 1, heroes: [hero], mobs: [m] } as unknown as World;
    expect(mobPose(w, m, 'pk_skeleton', 'pk_skeleton')).toMatchObject({ anim: 'idle', dir: 'w' });
    const clip = SHEETS.pk_skeleton.clip('attack', 'w');
    const strike = eventFrame(SHEETS.pk_skeleton.meta.anims.attack, 'hit');
    m.windT = m.windDur = 0.32;
    m.move = 'bite';
    const seen: number[] = [];
    for (let i = 0; i < 8; i++) {
      (w as { time: number }).time += 0.04;
      m.windT = Math.max(0.001, m.windT - 0.04);
      const p = mobPose(w, m, 'pk_skeleton', 'pk_skeleton');
      expect(p.anim).toBe('attack');
      expect(p.dir).toBe('w');
      seen.push(p.k);
    }
    expect(seen[0]).toBe(clip[0][0]);
    expect(clip.slice(0, strike).map((f) => f[0])).toContain(seen[seen.length - 1]);
    (w as { time: number }).time += 0.02;
    m.windT = 0;
    m.swingT = 0.25;
    expect(mobPose(w, m, 'pk_skeleton', 'pk_skeleton').k).toBe(clip[strike][0]);
    // Walking straight down, it keeps facing its target's side (no down view to turn to).
    m.swingT = 0;
    m.dir = 1;
    for (let i = 0; i < 30; i++) {
      (w as { time: number }).time += 0.05;
      m.y += 2;
      m.moving = true;
      const p = mobPose(w, m, 'pk_skeleton', 'pk_skeleton');
      if (i > 15) expect(p).toMatchObject({ anim: 'walk', dir: 'e' });
    }
  });

  it('die where they fall, linger a moment, and leave no puff of smoke', () => {
    for (const m of PACK_MONSTERS) {
      expect(deathFx(m)).toBeNull();
      const name = MONSTER_SHEET[m];
      const total = clipMs(SHEETS[name].clip(kitOf(m).death, 'e'));
      const last = SHEETS[name].clip(kitOf(m).death, 'e').at(-1)![0];
      const held = deathPose(m, name, 'e', total + (kitOf(m).linger ?? 0) - 1)!;
      expect(held).toMatchObject({ k: last, alpha: 1 });
      expect(deathPose(m, name, 'e', total + (kitOf(m).linger ?? 0) + 400)).toBeNull();
    }
    expect(deathFx('skeleton')).toBe('fx_bone_crumble');
  });

  it('replace the PixelForge slime everywhere and its skeleton in the dark biomes', () => {
    const undead = new Set<string>();
    for (let floor = 1; floor <= 60; floor++) {
      for (const seed of [3, 7]) {
        const biome = biomeForFloor(floor, seed);
        for (const t of floorMobs(biome, floor, seed)) {
          for (const elite of [false, true]) {
            const mon = monsterFor(t, elite, false);
            if (t.plan === 'slime') expect(mon).toBe('pk_slime');
            if (t.plan === 'humanoid' && t.behavior === 'chaser' && ['dungeon', 'crypt', 'graveyard'].includes(biome.id)) {
              expect(['pk_skeleton', 'pk_reaper', 'pk_vampire']).toContain(mon);
              undead.add(mon!);
            }
            // Every recolor names a material the sheet has.
            const p = mobPaint(t, elite, false);
            if (!p) continue;
            const mats = new Set(SHEETS[p.sheet].meta.colors.map((c) => c[2]));
            for (const mat of Object.keys(p.recolor)) expect(mats.has(mat), `${p.monster} ${mat}`).toBe(true);
          }
        }
      }
    }
    expect([...undead].sort()).toEqual(['pk_reaper', 'pk_skeleton', 'pk_vampire']);
    // Not one tile of the dungeon's floors is left unpainted by the solid check either.
    const m = generateFloor({ floor: 21, biome: dungeon, seed: 4, boss: false });
    expect(m.tiles.some((v) => v === SOLID)).toBe(true);
    expect(m.tiles.some((v) => v === BLOCKED)).toBe(true);
  });
});
