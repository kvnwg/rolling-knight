/**
 * A Legendary's cast in the world, round the knight casting it (world/slam.ts has the beats; the icon
 * on the screen is the HUD's, ui/SpellSlam.tsx):
 *  - the dark: the world dims round the caster, who stands in a pool of light, from the slam's start
 *    through the spell's first moments. One sheet of dark over the frame, a hole cut in it round each
 *    caster in stepped bands, laid first on the HUD layer, so whatever is drawn on that layer after it
 *    (the spells' own bright effects, foes' shots, health bars and numbers) stays bright on the dark;
 *    the pool's light on the ground comes from the light map. A fill and a sprite per caster a frame;
 *  - the power-up's glow: a two-pixel outline of light round the knight in its tier's color, motes
 *    rising off it, and the raised weapon's point shining brighter as the icon comes for it;
 *  - where the icon lands: a flare as the skill casts; the light gathering over the Cleric's staff
 *    (Miracle) and the clock over Aeon's hat, its hands turning back (Rewind), each the size of the
 *    icon at the world's pixel, so the icon arriving becomes it.
 * It reads the world every frame and changes nothing there; its times are the world's.
 */
import { RARITY_COLOR } from '../core/rarity';
import { SKILLS, TIER_RARITY, type SkillId } from '../core/skillbook';
import type { Unit } from '../world/entities';
import { SLAM_BEATS, spotLevel, spotTail } from '../world/slam';
import type { World } from '../world/world';
import { mixHex, toCanvas } from './art/draw';
import type { Light } from './lighting';
import type { SheetName } from './pf/assets';
import { anchorOf, castPose, sheetOf, type CastPose } from './pf/castPose';
import { frameBuf, type Paint } from './pf/frames';
import type { Dir } from './pf/sheet';
import { blank, fromRows, rgb } from './pixel/buf';
import { UI_MD } from './pixel/ui';

type Ctx = CanvasRenderingContext2D;

/** The dark's color, and how much of the scene it hides at its darkest. */
const INK = '#0b0817';
const DARK = 0.62;
/** How strong the pool's light is on the ground at its fullest, in the dark (the light map's: 1 is a torch's worth). */
const POOL_LIGHT = 0.42;
/** The pool of light round a caster: half its width and height (px), its middle this far over the feet. */
const POOL_RX = 46;
const POOL_RY = 38;
const POOL_UP = 10;
/** Where the pool starts to fall off (a share of its size), in how many bands. */
const POOL_CORE = 0.42;
const POOL_BANDS = 6;
/** Seconds the flare at the icon's arrival lasts, and Aeon's clock after the cast. */
const FLARE = 0.32;
const CLOCK_AFTER = 0.9;
/** The crouch's share of the slam (no glow yet). */
const WIND = 0.12;

interface Caster {
  uid: number;
  world: World;
  skill: SkillId;
  /** The tier's color and its light (the jackpot's Mythic pink, a Legendary's gold), and the pool's warm white. */
  color: string;
  light: string;
  pool: string;
  /** The knight's count of casts as its slam began (Unit.lastSkill.n): a new one is the cast. */
  n: number;
  /** Where it stands (world px), and where its icon is going: the weapon's point, the light, the clock, the meteor's spot. */
  x: number;
  y: number;
  anchor: { x: number; y: number };
  /** Its pose this frame (null once cast). */
  pose: CastPose | null;
  /** The slam's share done (1 once cast), and the world time it cast (null: still slamming). */
  u: number;
  castAt: number | null;
  /** How dark it makes the world round it (0 to 1). */
  level: number;
}

export class CastFx {
  private casters = new Map<number, Caster>();
  /** The dark as drawn: it follows the strongest caster's, never jumping (a slam cut short fades out). */
  private dark = 0;
  private hole: HTMLCanvasElement | null = null;
  private auras = new Map<string, HTMLCanvasElement>();
  private face: HTMLCanvasElement | null = null;
  private calm = false;
  private time = 0;

  /** Reads this frame's world: slams under way, casts just made. `dt` is the frame's (0 while paused). */
  update(w: World, calm: boolean, dt: number): void {
    this.calm = calm;
    this.time = w.time;
    if (w.hub || w.camp) {
      this.casters.clear();
      this.dark = 0;
      return;
    }
    for (const [uid, c] of this.casters) if (c.world !== w || !w.heroes.some((h) => h.uid === uid)) this.casters.delete(uid);
    for (const h of w.heroes) {
      let c = this.casters.get(h.uid);
      const sl = h.skillSlam;
      if (sl) {
        if (!c || c.castAt !== null) {
          const color = RARITY_COLOR[TIER_RARITY[SKILLS[sl.skill].tier]];
          c = { uid: h.uid, world: w, skill: sl.skill, color, light: mixHex(color, '#ffffff', 0.55), pool: mixHex(color, '#fff4e0', 0.75), n: h.lastSkill?.n ?? 0, x: h.x, y: h.y, anchor: { x: h.x, y: h.y }, pose: null, u: 0, castAt: null, level: 0 };
          this.casters.set(h.uid, c);
        }
        const sheet = sheetOf(h);
        c.x = h.x;
        c.y = h.y;
        c.u = sl.t / sl.dur;
        c.pose = castPose(sheet, sl, calm);
        c.anchor = sl.at ? { ...sl.at } : anchorOf(sl.skill, sheet, c.pose, h.x, h.y);
        c.level = spotLevel(sl, null, calm);
        continue;
      }
      if (!c) continue;
      if (c.castAt === null) {
        // The slam is over: the skill cast (its landing counted), or the knight fell first.
        if (!h.lastSkill || h.lastSkill.n === c.n) {
          this.casters.delete(h.uid);
          continue;
        }
        c.castAt = h.lastSkill.at;
        c.u = 1;
        c.pose = null;
      }
      if (!h.downed) {
        c.x = h.x;
        c.y = h.y;
      }
      const since = w.time - c.castAt;
      c.level = spotLevel(null, since, calm);
      if (since > Math.max(spotTail(calm), FLARE, c.skill === 'rewind' ? CLOCK_AFTER : 0)) this.casters.delete(h.uid);
    }
    let target = 0;
    for (const c of this.casters.values()) target = Math.max(target, c.level);
    const step = dt / 0.12;
    this.dark = target > this.dark ? Math.min(target, this.dark + step) : Math.max(target, this.dark - step);
  }

  /**
   * The dark, on the HUD layer before anything else is drawn on it: a sheet over the frame, a pool cut
   * out round each caster. (cx, cy) is the frame's top-left in world px; `w`, `h` the layer's size.
   */
  drawDark(ui: Ctx, cx: number, cy: number, w: number, h: number): void {
    const k = Math.round(this.dark * 8) / 8;
    if (k <= 0) return;
    ui.globalCompositeOperation = 'source-over';
    ui.globalAlpha = k * DARK;
    ui.fillStyle = INK;
    ui.fillRect(0, 0, w, h);
    ui.globalCompositeOperation = 'destination-out';
    const hole = (this.hole ??= poolHole());
    for (const c of this.casters.values()) {
      if (c.level <= 0) continue;
      ui.globalAlpha = Math.min(1, c.level / Math.max(1e-3, this.dark));
      ui.drawImage(hole, Math.round(c.x) - cx - POOL_RX, Math.round(c.y) - cy - POOL_UP - POOL_RY);
    }
    ui.globalCompositeOperation = 'source-over';
    ui.globalAlpha = 1;
  }

  /**
   * The light round each caster (the pool's, on the ground) and where its icon is going, for the light
   * map, by how dark the scene is (its `ambient`): a real pool down in the crypts, next to none in
   * daylight, where the scene is already lit and more light would only white the knight out. Never
   * bloomed: the pool reads by the dark round it (the HUD layer carries the bright bits: the weapon's
   * point, the flare).
   */
  addLights(out: Light[], cx: number, cy: number, ambient: string): void {
    const [ar, ag, ab] = rgb(ambient);
    const dim = 1 - Math.min(1, (0.299 * ar + 0.587 * ag + 0.114 * ab) / 255);
    for (const c of this.casters.values()) {
      if (c.level > 0 && dim > 0.05) out.push({ x: Math.round(c.x) - cx, y: Math.round(c.y) - cy - 8, r: 44, color: c.pool, intensity: POOL_LIGHT * dim * c.level });
      if (c.castAt === null && c.u >= WIND) {
        const grow = c.u < SLAM_BEATS.slam ? 0.2 : 0.2 + 0.35 * Math.min(1, (c.u - SLAM_BEATS.slam) / (1 - SLAM_BEATS.slam));
        out.push({ x: Math.floor(c.anchor.x) - cx, y: Math.floor(c.anchor.y) - cy, r: c.skill === 'miracle' || c.skill === 'rewind' ? 18 : 12, color: c.light, intensity: grow * (0.3 + 0.7 * dim) });
      }
    }
  }

  /**
   * The glow round a knight powering up: its frame's outline in its tier's light, two pixels deep
   * (call where the knight is drawn, with the frame and its top-left on the layer), on the emit layer.
   */
  drawAura(em: Ctx, h: Unit, sheet: SheetName, k: number, paint: Paint, anim: string, dir: Dir, x: number, y: number): void {
    const c = this.casters.get(h.uid);
    if (!c || c.castAt !== null || c.u < WIND) return;
    const key = `${sheet}|${k}|${paint.key}|${anim}|${dir}|${c.color}`;
    let can = this.auras.get(key);
    if (!can) {
      can = auraCanvas(frameBuf(sheet, k, paint, false, anim, dir), c.light, c.color);
      this.auras.set(key, can);
      if (this.auras.size > 200) this.auras.delete(this.auras.keys().next().value!);
    }
    // A slow pulse, by steps; brighter once the icon is stamped.
    const pulse = this.calm ? 1 : Math.floor(this.time / 0.09) % 2 ? 0.75 : 1;
    em.globalAlpha = (c.u >= SLAM_BEATS.slam ? 1 : 0.8) * pulse;
    em.drawImage(can, x - 2, y - 2);
    em.globalAlpha = 1;
  }

  /**
   * Over everything (the HUD layer, crisp and bright on the dark): the raised weapon's point shining,
   * the Cleric's light and Aeon's clock, the flare where the icon lands; and on the emit layer the
   * motes rising off the knight.
   */
  drawTop(ui: Ctx, em: Ctx, cx: number, cy: number): void {
    for (const c of this.casters.values()) {
      // (The pixel the icon is going to, on the layer.)
      const ax = Math.floor(c.anchor.x) - cx;
      const ay = Math.floor(c.anchor.y) - cy;
      if (c.castAt === null) {
        if (c.u < WIND || !c.pose) continue;
        if (!this.calm) this.motes(em, c, Math.round(c.x) - cx, Math.round(c.y) - cy);
        const stamped = c.u >= SLAM_BEATS.slam;
        // How near the icon is: 0 as it's stamped, 1 as it lands.
        const near = stamped ? Math.min(1, (c.u - SLAM_BEATS.slam) / (1 - SLAM_BEATS.slam)) : 0;
        if (c.skill === 'miracle' && stamped) this.orb(ui, c, ax, ay, near);
        else if (c.skill === 'rewind' && stamped) this.clock(ui, ax, ay, this.time * 3, near < 0.25 ? 0.5 : 1);
        else if (c.pose.tip) {
          // The weapon's point shining (Meteor Storm's staff too, while its icon falls elsewhere).
          const tx = Math.round(c.x) - cx + Math.floor(c.pose.tip[0]);
          const ty = Math.round(c.y) - cy + Math.floor(c.pose.tip[1]);
          const r = !stamped ? 1 : near < 0.5 ? 2 : 3;
          const twist = !this.calm && !stamped && Math.floor(this.time / 0.12) % 2 === 1;
          star(ui, tx, ty, r, c.light, c.color, twist);
        }
        continue;
      }
      const since = this.time - c.castAt;
      if (c.skill === 'rewind') {
        // The clock runs back as time does, then fades by steps.
        if (since < CLOCK_AFTER) this.clock(ui, ax, ay, -since * 14, since > CLOCK_AFTER - 0.3 ? (Math.floor(since / 0.05) % 2 ? 0.35 : 0.7) : 1);
        if (since < 0.12) ring(ui, ax, ay, 7 + Math.floor(since / 0.04) * 2, c.light);
        continue;
      }
      // (Meteor Storm's icon lands as its first meteor: its explosion is the flare.)
      if (c.skill !== 'meteorStorm' && since < FLARE) flare(ui, ax, ay, since / FLARE, c.light, c.color, this.calm);
    }
  }

  /** Pixels of the tier's light rising off a knight powering up, on a loop. */
  private motes(em: Ctx, c: Caster, x: number, y: number): void {
    em.fillStyle = c.light;
    for (let j = 0; j < MOTES.length; j++) {
      const [ox, speed] = MOTES[j];
      const ph = (this.time * speed + j * 0.37 + c.uid * 0.13) % 1;
      em.globalAlpha = ph < 0.55 ? 1 : ph < 0.8 ? 0.6 : 0.3;
      em.fillRect(x + ox, y - 1 - Math.round(ph * 30), 1, j % 3 === 0 ? 2 : 1);
    }
    em.globalAlpha = 1;
  }

  /** Miracle's light gathering over the staff: a disc growing to the icon's size, its rays turning. */
  private orb(ui: Ctx, c: Caster, x: number, y: number, near: number): void {
    const r = 1 + Math.min(3, Math.floor(near * 4));
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r + 0.35) continue;
        ui.fillStyle = d <= r - 1.2 ? '#ffffff' : d <= r - 0.4 ? c.light : c.color;
        ui.fillRect(x + dx, y + dy, 1, 1);
      }
    }
    // Eight rays, a turn of an eighth every tenth of a second.
    const turn = this.calm ? 0 : Math.floor(this.time / 0.1) % 2;
    ui.fillStyle = c.light;
    for (let i = 0; i < 8; i++) {
      const a = ((i + turn * 0.5) / 8) * Math.PI * 2;
      const len = i % 2 ? 1 : 2;
      for (let s = 0; s < len; s++) ui.fillRect(x + Math.round(Math.cos(a) * (r + 2 + s)), y + Math.round(Math.sin(a) * (r + 2 + s)), 1, 1);
    }
  }

  /** Aeon's clock (the icon's own face, at the world's pixel), its hands at `turns` (whole turns of the long one). */
  private clock(ui: Ctx, x: number, y: number, turns: number, alpha: number): void {
    const face = (this.face ??= clockFace());
    ui.globalAlpha = alpha;
    ui.drawImage(face, x - 5, y - 5);
    // The hands round the face's middle pixel (5, 5): the long one three pixels, the short one two.
    ui.fillStyle = '#2c2236';
    const hand = (a: number, len: number) => {
      for (let s = 1; s <= len; s++) ui.fillRect(x + Math.round(Math.cos(a) * s), y + Math.round(Math.sin(a) * s), 1, 1);
    };
    const step = (t: number, n: number) => (Math.floor(t * n) / n) * Math.PI * 2 - Math.PI / 2;
    ui.fillRect(x, y, 1, 1);
    hand(step(turns, 8), 3);
    hand(step(turns / 12, 8), 2);
    ui.globalAlpha = 1;
  }
}

/** [x off the knight's feet, loops a second] per mote. */
const MOTES: ReadonlyArray<readonly [number, number]> = [
  [-9, 1.3],
  [-5, 1.7],
  [-2, 1.1],
  [3, 1.5],
  [6, 1.25],
  [9, 1.6],
  [0, 0.9],
];

/** The hole cut in the dark round a caster: clear in the middle, falling off to nothing in bands. */
function poolHole(): HTMLCanvasElement {
  const w = POOL_RX * 2 + 1;
  const h = POOL_RY * 2 + 1;
  const b = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x - POOL_RX) / POOL_RX, (y - POOL_RY) / POOL_RY);
      if (d >= 1) continue;
      const t = Math.max(0, (d - POOL_CORE) / (1 - POOL_CORE));
      const a = 1 - Math.ceil(t * POOL_BANDS) / POOL_BANDS;
      if (a <= 0) continue;
      const i = (y * w + x) * 4;
      b.px[i] = b.px[i + 1] = b.px[i + 2] = 255;
      b.px[i + 3] = Math.round(a * 255);
    }
  }
  return toCanvas(b);
}

/** A frame's outline two pixels deep: the first in `inner`, the second in `outer` at half strength. */
function auraCanvas(src: { w: number; h: number; px: Uint8ClampedArray }, inner: string, outer: string): HTMLCanvasElement {
  const W = src.w + 4;
  const H = src.h + 4;
  const solid = new Uint8Array(W * H);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.px[(y * src.w + x) * 4 + 3] === 255) solid[(y + 2) * W + x + 2] = 1;
  const ring = (from: Uint8Array): Uint8Array => {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (from[y * W + x]) continue;
        const on = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < W && yy < H && from[yy * W + xx] === 1;
        if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) out[y * W + x] = 1;
      }
    }
    return out;
  };
  const r1 = ring(solid);
  const both = new Uint8Array(W * H);
  for (let i = 0; i < both.length; i++) both[i] = solid[i] | r1[i];
  const r2 = ring(both);
  const b = blank(W, H);
  const [ir, ig, ib] = rgb(inner);
  const [or, og, ob] = rgb(outer);
  for (let i = 0; i < W * H; i++) {
    if (r1[i]) b.px.set([ir, ig, ib, 255], i * 4);
    else if (r2[i]) b.px.set([or, og, ob, 120], i * 4);
  }
  return toCanvas(b);
}

/** The clock icon's face without its hands (the hands turn: CastFx.clock). */
function clockFace(): HTMLCanvasElement {
  const rows = (UI_MD.clock ?? []).map((r) => r.replace(/x/g, 'w'));
  return toCanvas(fromRows(rows));
}

/** A four-point star: a white heart, arms `r` long in `light` ending in `color`; `twist` turns it an eighth. */
function star(ctx: Ctx, x: number, y: number, r: number, light: string, color: string, twist = false): void {
  const arms: ReadonlyArray<readonly [number, number]> = twist ? [[1, 1], [-1, 1], [1, -1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of arms) {
    const len = twist ? Math.max(1, r - 1) : r;
    for (let s = 1; s <= len; s++) {
      ctx.fillStyle = s === len && len > 1 ? color : light;
      ctx.fillRect(x + dx * s, y + dy * s, 1, 1);
    }
  }
  if (r >= 3 && !twist) {
    ctx.fillStyle = light;
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, 1, 1);
}

/** A broken ring of radius r (every other pixel), for a burst going out. */
function ring(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  const n = Math.max(8, Math.round(r * 4));
  for (let i = 0; i < n; i += 2) {
    const a = (i / n) * Math.PI * 2;
    ctx.fillRect(x + Math.round(Math.cos(a) * r), y + Math.round(Math.sin(a) * r * 0.85), 1, 1);
  }
}

/** The icon landing: a white flash, a star thrown wide, then sparks flying off (f: 0 to 1 through it). */
function flare(ctx: Ctx, x: number, y: number, f: number, light: string, color: string, calm: boolean): void {
  if (f < 0.2) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + dx, y + dy, 1, 1);
    }
    ring(ctx, x, y, 4, light);
    return;
  }
  if (calm) return;
  if (f < 0.55) {
    star(ctx, x, y, 6, light, color);
    ring(ctx, x, y, 6, color);
    return;
  }
  const d = 6 + Math.round((f - 0.55) * 14);
  ctx.fillStyle = f < 0.8 ? light : color;
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) ctx.fillRect(x + Math.round(dx * d * 0.75), y + Math.round(dy * d * 0.75), 1, 1);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) ctx.fillRect(x + dx * (d + 2), y + dy * (d + 2), 1, 1);
}
