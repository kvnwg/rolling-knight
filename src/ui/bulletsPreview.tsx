/**
 * Every kind of foe bullet on one page, for working on the art (dev server only):
 *   http://localhost:5173/bullets-preview.html?s=6
 * On top, each kind's frames playing, magnified (`s` screen pixels per art pixel), on a dark swatch
 * and a pale one, with its hue and what it does. Under that, every biome's own ground under its
 * light, with the real bullets flying over it (a small world each: world/bullets.ts moves them, so a
 * spore weaves, a seed bursts, a glob lands on its mark, a blade comes back, a wisp turns for the
 * knight-sized stand-in), drawn as the game draws them (render/foeBullets.ts). `only`: a comma list
 * of biomes. (tools/bulletsPreview.ts writes the same art as PNG sheets.)
 */
import { knightId } from '../core/knights';
import { newGame } from '../core/newGame';
import { addKnight, knightStats } from '../core/roster';
import { BULLET_FRAMES, BULLET_RAMPS, bladeSprite, dartSprite, globSprite, mineSprite, orbSprite, pelletSprite, pipSprite, seedSprite, sparkSprite, spitSprite, sporeSprite, waveSprite, wispSprite } from '../render/art/bullets';
import { toCanvas } from '../render/art/draw';
import { FoeBullets } from '../render/foeBullets';
import { paintTerrain } from '../render/terrain';
import type { VfxSprite } from '../render/vfx/raster';
import { BIOME_ORDER, BIOMES, type BiomeId } from '../world/biomes';
import { FORMS, HUE, fire, lob, type BulletHue } from '../world/bullets';
import type { Unit } from '../world/entities';
import { FLOOR, SOLID, TILE, type FloorMap } from '../world/mapgen';
import { floorMobs } from '../world/mobgen';
import { World, type HeroSpec } from '../world/world';

const q = new URLSearchParams(location.search);
const S = Number(q.get('s') ?? 6);
const only = q.get('only')?.split(',');
const root = document.getElementById('root')!;
document.body.style.cssText = 'margin:0;background:#141018;color:#f4ecd8;font:12px monospace';
root.style.cssText = 'padding:14px;display:flex;flex-direction:column;gap:18px';

// ------------------------------------------------------------------ the kinds, magnified

interface Kind {
  name: string;
  hue: BulletHue;
  does: string;
  fps: number;
  frames: VfxSprite[];
}

const seq = (n: number, make: (f: number) => VfxSprite): VfxSprite[] => Array.from({ length: n }, (_, f) => make(f));

const KINDS: Kind[] = [
  { name: 'orb', hue: 'red', does: 'the plain slow one: straight', fps: 12, frames: seq(4, (f) => orbSprite('red', 0, f, false)) },
  { name: 'orb (curving)', hue: 'pink', does: 'bends in toward you', fps: 12, frames: seq(4, (f) => orbSprite('pink', 2, f, false)) },
  { name: 'dart', hue: FORMS.dart.hue, does: 'fast and thin, down a line shown first', fps: 14, frames: seq(BULLET_FRAMES.dart, (f) => dartSprite(0, f)) },
  { name: 'spit', hue: FORMS.spit.hue, does: 'leaves fast...', fps: 14, frames: seq(2, (f) => spitSprite(0, f, true)) },
  { name: 'spit (hung)', hue: FORMS.spit.hue, does: '...brakes and hangs', fps: 5, frames: seq(2, (f) => spitSprite(0, f, false)) },
  { name: 'spore', hue: FORMS.spore.hue, does: 'drifts, weaving', fps: 8, frames: seq(BULLET_FRAMES.spore, sporeSprite) },
  { name: 'seed', hue: FORMS.seed.hue, does: 'swells, then bursts into pips', fps: 6, frames: [0, 1, 0, 1, 0, 1, 2, 3, 2, 3].map(seedSprite) },
  { name: 'pip', hue: FORMS.pip.hue, does: 'small, quick, soon gone', fps: 14, frames: seq(BULLET_FRAMES.pip, pipSprite) },
  { name: 'pellet', hue: FORMS.pellet.hue, does: 'a short-range spray', fps: 14, frames: seq(BULLET_FRAMES.pellet, pelletSprite) },
  { name: 'glob', hue: FORMS.glob.hue, does: 'lobbed onto a marked spot', fps: 4, frames: seq(BULLET_FRAMES.glob, globSprite) },
  { name: 'mine', hue: FORMS.mine.hue, does: 'sits, blinks faster, pops', fps: 7, frames: [0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 2].map(mineSprite) },
  { name: 'blade: knife', hue: FORMS.blade.hue, does: 'out straight, loops back', fps: 16, frames: seq(8, (f) => bladeSprite(0, f)) },
  { name: 'blade: bone', hue: FORMS.blade.hue, does: 'a skeleton\'s', fps: 16, frames: seq(8, (f) => bladeSprite(1, f)) },
  { name: 'blade: axe', hue: FORMS.blade.hue, does: 'an orc\'s', fps: 16, frames: seq(8, (f) => bladeSprite(2, f)) },
  { name: 'wisp', hue: FORMS.wisp.hue, does: 'turns after you; can be cut', fps: 9, frames: seq(BULLET_FRAMES.wisp, (f) => wispSprite(0, f, true)) },
  { name: 'wave', hue: FORMS.wave.hue, does: 'rolls along the ground; can\'t be cut', fps: 10, frames: seq(BULLET_FRAMES.wave, (f) => waveSprite(0, f, false)) },
  { name: 'spark', hue: FORMS.spark.hue, does: 'a beam is a stream of them', fps: 16, frames: seq(BULLET_FRAMES.spark, sparkSprite) },
];

const rule = document.createElement('div');
rule.innerHTML = `ONE RULE: the same ink outline and a white-hot heart on every one. <b style="color:${HUE.red}">Red flies straight.</b> <b style="color:${HUE.pink}">Pink bends.</b> <b style="color:${HUE.orange}">Orange bursts.</b>`;
root.appendChild(rule);

const grid = document.createElement('div');
grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px';
root.appendChild(grid);
const CELL = 26;
const players: Array<{ ctx: CanvasRenderingContext2D; kind: Kind; imgs: Array<{ c: HTMLCanvasElement; ax: number; ay: number }> }> = [];
for (const kind of KINDS) {
  const box = document.createElement('div');
  box.style.cssText = `width:${CELL * 2 * S}px`;
  const c = document.createElement('canvas');
  c.width = CELL * 2;
  c.height = CELL;
  c.style.cssText = `width:${CELL * 2 * S}px;height:${CELL * S}px;image-rendering:pixelated;display:block`;
  const label = document.createElement('div');
  label.innerHTML = `<b style="color:${BULLET_RAMPS[kind.hue][2]}">${kind.name}</b> ${kind.does}`;
  box.append(c, label);
  grid.appendChild(box);
  players.push({ ctx: c.getContext('2d')!, kind, imgs: kind.frames.map((s) => ({ c: toCanvas(s.buf!), ax: s.ax, ay: s.ay })) });
}

// ------------------------------------------------------------------ every biome's ground, with the real bullets over it

const VW = 320;
const VH = 96;

function arena(): FloorMap {
  const w = Math.ceil(VW / TILE) + 4;
  const h = Math.ceil(VH / TILE) + 4;
  const tiles = new Uint8Array(w * h).fill(FLOOR);
  for (let x = 0; x < w; x++) tiles[x] = tiles[(h - 1) * w + x] = SOLID;
  for (let y = 0; y < h; y++) tiles[y * w] = tiles[y * w + w - 1] = SOLID;
  return { w, h, tiles, path: new Uint8Array(w * h), rooms: [], start: { x: TILE * 3, y: TILE * 3 }, exit: { x: TILE * 2, y: TILE * 2 }, props: [], spawns: [], seed: 7 };
}

function squad(): HeroSpec[] {
  const s = newGame(1);
  const id = knightId('rare', 'guardian');
  addKnight(s, id, null);
  return [{ knightId: id, cls: 'guardian', rarity: 'rare', mutation: null, stats: knightStats(s, id), slot: 0, hpShare: 1 }];
}

/** What a strip fires, one after another, each from the left along one of three lanes. */
const SHOW: Array<(w: World, m: Unit, y: number, h: Unit) => void> = [
  (w, m, y) => void w.shots.push({ uid: 5e6 + w.shots.length + Math.floor(w.time * 1000), team: 'mob', x: m.x, y, vx: 70, vy: 0, r: 2, dmg: 1, life: 4, kind: 'bullet', color: HUE.red, from: m.uid }),
  (w, m, y) => void w.shots.push({ uid: 6e6 + w.shots.length + Math.floor(w.time * 1000), team: 'mob', x: m.x, y: y - 20, vx: 60, vy: 20, r: 2, dmg: 1, life: 4, kind: 'bullet', color: HUE.pink, from: m.uid, curve: -0.35 }),
  (w, m, y) => void fire(w, m, 'dart', m.x, y, 0, 72, 1),
  (w, m, y) => [-0.2, 0, 0.2].forEach((a) => fire(w, m, 'spit', m.x, y, a, 72, 1)),
  (w, m, y) => [-0.25, 0, 0.25].forEach((a, i) => fire(w, m, 'spore', m.x, y, a, 72, 1, { side: i % 2 ? 1 : -1 })),
  (w, m, y) => void fire(w, m, 'seed', m.x, y, 0, 72, 1, { reach: 150, n: 5, kid: 0.5 }),
  (w, m, y, h) => void lob(w, m, 'glob', m.x, y, h.x - 60, h.y + 14, 72, 1, { ring: 10 }),
  (w, m, y, h) => void lob(w, m, 'mine', m.x, y, m.x + 70, h.y - 22, 72, 0, { n: 8, kid: 0.2 }),
  (w, m, y) => [0, 1, 2].forEach((look) => fire(w, m, 'blade', m.x, y, (look - 1) * 0.3, 72, 1, { look, reach: 150, side: look % 2 ? 1 : -1 })),
  (w, m, y) => [-0.3, -0.15, 0, 0.15, 0.3].forEach((a, i) => fire(w, m, 'pellet', m.x, y, a, 72, 1, { life: 2.2, speed: i % 2 ? 1.1 : 0.9 })),
  (w, m, y) => [-0.8, 0.8].forEach((a) => fire(w, m, 'wisp', m.x, y, a, 72, 1)),
  (w, m, y) => [-0.35, 0, 0.35].forEach((a) => fire(w, m, 'wave', m.x, y, a, 72, 1, { life: 2 })),
  (w, m, y) => [0, 1, 2, 3, 4, 5].forEach((i) => void (fire(w, m, 'spark', m.x - i * 9, y, 0, 72, 1).life = 3)),
];

interface Strip {
  w: World;
  m: Unit;
  h: Unit;
  ground: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  next: number;
  i: number;
}

const foes = new FoeBullets();
const strips: Strip[] = [];
const OX = TILE * 2;
const OY = TILE * 2;
for (const id of BIOME_ORDER) {
  if (only && !only.includes(id)) continue;
  const biome = BIOMES[id as BiomeId];
  const map = arena();
  const types = floorMobs(biome, 12, 3);
  const w = new World({ map, biome, floor: 12, boss: false, mobTypes: types, bossType: null, squad: squad(), perks: [], controlled: 0, seed: 5, goldPerKill: 0 });
  w.mobs = [];
  const h = w.heroes[0];
  h.x = OX + VW - 50;
  h.y = OY + VH / 2 + 8;
  const m = w.makeMob(types[0], OX + 14, OY + VH / 2, false, false);
  m.awake = false;
  w.mobs.push(m);
  // The ground as the game lights it: its ambient multiplied over it, lifted a little (the knights' own light).
  const terrain = paintTerrain(map, biome).canvas;
  const ground = document.createElement('canvas');
  ground.width = VW;
  ground.height = VH;
  const gx = ground.getContext('2d')!;
  gx.drawImage(terrain, -OX, -OY);
  gx.globalCompositeOperation = 'multiply';
  gx.globalAlpha = 0.75;
  gx.fillStyle = biome.light.ambient;
  gx.fillRect(0, 0, VW, VH);
  gx.globalCompositeOperation = 'source-over';
  gx.globalAlpha = 1;
  const box = document.createElement('div');
  const c = document.createElement('canvas');
  c.width = VW;
  c.height = VH;
  const k = Math.max(2, Math.round(S / 2));
  c.style.cssText = `width:${VW * k}px;height:${VH * k}px;image-rendering:pixelated;display:block`;
  const label = document.createElement('div');
  label.textContent = `${id} (${biome.name})`;
  box.append(label, c);
  root.appendChild(box);
  strips.push({ w, m, h, ground, ctx: c.getContext('2d')!, next: 0.2, i: strips.length * 3, });
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  for (const p of players) {
    const f = p.imgs[Math.floor(t * p.kind.fps) % p.imgs.length];
    p.ctx.fillStyle = '#22202c';
    p.ctx.fillRect(0, 0, CELL, CELL);
    p.ctx.fillStyle = '#d8dee8';
    p.ctx.fillRect(CELL, 0, CELL, CELL);
    p.ctx.drawImage(f.c, CELL / 2 - f.ax, CELL / 2 - f.ay);
    p.ctx.drawImage(f.c, CELL + CELL / 2 - f.ax, CELL / 2 - f.ay);
  }
  for (const s of strips) {
    const { w, m, h, ctx } = s;
    h.hp = h.maxHp;
    h.invuln = 99;
    h.specialT = 99;
    h.atkT = 99;
    w.update(dt);
    w.fx.length = 0;
    w.events.length = 0;
    w.texts.length = 0;
    s.next -= dt;
    if (s.next <= 0) {
      s.next = 0.7;
      SHOW[s.i % SHOW.length](w, m, OY + 22 + (s.i % 3) * 22, h);
      s.i++;
    }
    ctx.drawImage(s.ground, 0, 0);
    foes.drawGround(ctx, w, OX, OY, VW, VH, w.time);
    // The stand-in: a knight's size, where its feet are.
    const kx = Math.round(h.x) - OX;
    const ky = Math.round(h.y) - OY;
    ctx.fillStyle = '#5a6890';
    ctx.fillRect(kx - 5, ky - 13, 11, 14);
    ctx.fillStyle = '#c8ccd8';
    ctx.fillRect(kx - 3, ky - 18, 7, 6);
    for (const b of w.shots) if (b.team === 'mob') foes.draw(ctx, b, Math.round(b.x) - OX, Math.round(b.y) - OY, w.time, false);
  }
  document.body.dataset.ready = '1';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
