/**
 * Draws the floor at art resolution (every pixel the same size) and scales it up by a whole number:
 * the painted ground, then everything standing on it sorted by how far down the screen its feet are
 * (the 3/4 view: things lower down are in front), then shots, sparks and weather, then the light.
 */
import type { Game } from '../game';
import { RARITY_COLOR } from '../core/rarity';
import { BIOMES, type Biome } from '../world/biomes';
import { norm, type Area, type FloatText, type Fx, type Shot, type Unit } from '../world/entities';
import { TILE, type FloorMap, type Prop } from '../world/mapgen';
import type { World } from '../world/world';
import { flash, makeCanvas, mixHex, shade, toCanvas } from './art/draw';
import { CLASS_HAS_SHIELD, KNIGHT_ANCHOR, knightFrame, knightGlow, knightLook, shieldArt, weaponArt, type KnightLook, type View } from './art/knights';
import { mobFrame, poseFrames, type MobPose } from './art/mobs';
import { flameArt, type PropArt } from './art/props';
import { BAR_STEPS, DOOR_AX, DOOR_AY, DOOR_FRAMES, DOOR_OPENING, doorArt } from './art/exitDoor';
import { tagCoin, wareIcon, wareTable } from './art/wares';
import { RUN_ITEMS } from '../core/runItems';
import type { Ware } from '../world/shop';
import { artKey, artOf } from './art/artOf';
import type { TreeArt } from './art/trees';
import { Camera } from './camera';
import { Lighting, type Light } from './lighting';
import { Post, type PostParams } from './post';
import { rgb } from './pixel/buf';
import { flipX } from './pixel/buf';
import { frameBuf } from './pixel/indexed';
import { FX_SHEETS, type FxName } from './packs/fx';
import { renderText, type TextStyle } from './pixel/font';
import { paintTerrain, type Terrain } from './terrain';
import { trapPieces } from './packs/trapArt';
import { trapPhase } from '../world/traps';
import { Rain } from './rain';
import { Ambient } from './ambient';
import { HubPaint } from './hubPaint';
import { HUB_H, HUB_W } from '../world/hub';
import { HUB_CX, HUB_STEPS_Y } from './art/hubScene';
import type { Sky } from '../world/sky';
import { canRebirth } from '../core/newGame';
import { coinMarker, npcFrame, questMarker } from './art/npcs';
import { extrasCount } from '../core/roster';
import { npcMarker } from '../world/npcs';
import { pfReady, SHEETS, type SheetName } from './pf/assets';
import { frameBuf as pfFrameBuf, frameCanvas, frameMask, haloCanvas, haloSpot, haloWidth, headTop, type Paint } from './pf/frames';
import { heroPose, pruneHeroes, type HeroPose } from './pf/heroAnim';
import { knightPaint, paintStep } from './pf/knightLook';
import { deathFx, deathPoofMs, deathPose, lastMoveOf, mobDirOf, mobPose, pruneMobs } from './pf/mobAnim';
import { mobPaint, type MobPaint } from './pf/mobLook';
import { facing, type Dir } from './pf/sheet';
import { Vfx } from './vfx/vfx';
import { Spells } from './spells';
import { CastFx } from './castFx';
import { WarpFx } from './warpFx';
import { screenView } from './view';
import { boulderAt, isStill, mobMotion, type MobMotion } from './mobMotion';
import { BOMB_R, BOSS_SLAM_R, SLAM_R, lobRadius, lungeOf } from '../world/ai';
import { blank, rot90, type PixelBuf } from './pixel/buf';

/** A sprite's opaque body box, in its own pixels (inclusive). */
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The opaque pixels' box of a buffer (its soft shadow, alpha under 255, left out); the whole buffer if it's empty. */
function opaqueBox(b: PixelBuf): Box {
  let x0 = b.w;
  let y0 = b.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (b.px[(y * b.w + x) * 4 + 3] !== 255) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? { x0: 0, y0: 0, x1: b.w - 1, y1: b.h - 1 } : { x0, y0, x1, y1 };
}

/** PERFECT!'s fill, one color per glyph row: white at the top, through gold to amber, per face. */
const PERFECT_FILL = {
  small: ['#ffffff', '#fff2b0', '#ffe27a', '#ffd04a', '#f0a830'],
  big: ['#ffffff', '#fff6c8', '#ffe27a', '#ffd04a', '#ffb83a', '#f59a2a', '#e07a1e'],
  huge: ['#ffffff', '#ffffff', '#fff6c8', '#ffe27a', '#ffd04a', '#ffc040', '#ffb03a', '#f59a2a', '#e07a1e'],
} as const;

/**
 * A chunk of the floor an ogre tears up to throw, `size` px across: a rough lump of rock in the
 * biome's stone (its path's colors, pulled toward plain rock greys so it reads on any floor), lit from
 * the top left, with the biome's ground (grass, snow, sand, moss) still on top and a crack across it.
 */
function boulderBuf(b: Biome, size: number): PixelBuf {
  const w = size;
  const h = size - 1;
  const out = blank(w, h);
  const path = b.path.ramp;
  const pick = (i: number) => path[Math.min(path.length - 1, i)];
  const stone = [mixHex(pick(0), '#3e3834', 0.45), mixHex(pick(1), '#625c54', 0.45), mixHex(pick(2), '#8a8478', 0.45), mixHex(pick(3), '#b4aea2', 0.45)];
  const turf = [b.ground.ramp[Math.min(2, b.ground.ramp.length - 1)], b.ground.ramp[b.ground.ramp.length - 1]];
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2 + 0.4;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && ((x - cx) / (w / 2)) ** 2 + ((y - cy) / (h / 2)) ** 2 <= 0.9 + ((x * 7 + y * 13) % 5) * 0.035;
  const edge = (x: number, y: number) => !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
  const set = (x: number, y: number, hex: string) => {
    const [r, g, bl] = rgb(hex);
    out.px.set([r, g, bl, 255], (y * w + x) * 4);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      if (edge(x, y)) {
        set(x, y, '#1a1326');
        continue;
      }
      const l = -((x - cx) / (w / 2)) * 0.45 - ((y - cy) / (h / 2)) * 0.75;
      set(x, y, stone[l > 0.45 ? 3 : l > 0.05 ? 2 : l > -0.4 ? 1 : 0]);
    }
  }
  // The ground it was torn from, still on top: the first row of rock in each column (two rows in the middle).
  for (let x = 1; x < w - 1; x++) {
    let y = 0;
    while (y < h && !(inside(x, y) && !edge(x, y))) y++;
    if (y >= h - 2) continue;
    set(x, y, turf[1]);
    if (Math.abs(x - cx) < w * 0.3 && inside(x, y + 1) && !edge(x, y + 1)) set(x, y + 1, turf[0]);
  }
  // A crack.
  const c0 = Math.round(cx) - 1;
  const c1 = Math.round(cy) + 1;
  if (inside(c0, c1) && !edge(c0, c1) && inside(c0 + 1, c1 + 1) && !edge(c0 + 1, c1 + 1)) {
    set(c0, c1, stone[0]);
    set(c0 + 1, c1 + 1, stone[0]);
  }
  return out;
}

/** The warning red at a lightness `l` (0 to 1): dark blood red in the shadows, hot red in the middle, salmon in the lights. */
function warnRed(l: number): [number, number, number] {
  const k = Math.max(0, Math.min(1, l));
  return k < 0.5
    ? [Math.round(96 + (238 - 96) * (k / 0.5)), Math.round(10 + (34 - 10) * (k / 0.5)), Math.round(14 + (28 - 14) * (k / 0.5))]
    : [255, Math.round(34 + (150 - 34) * ((k - 0.5) / 0.5)), Math.round(28 + (128 - 28) * ((k - 0.5) / 0.5))];
}

/** A color pulled most of the way to the warning red of its own lightness (so the shading still reads). */
function warnShift(r: number, g: number, b: number): [number, number, number] {
  const [wr, wg, wb] = warnRed((r * 0.3 + g * 0.59 + b * 0.11) / 255 + 0.12);
  const k = 0.72;
  return [Math.round(r + (wr - r) * k), Math.round(g + (wg - g) * k), Math.round(b + (wb - b) * k)];
}

const warnPaints = new Map<string, Paint>();

/** A PixelForge paint's red warning version: every material shifted to red (its outline and soft shadow kept). */
function warnPaint(p: MobPaint): Paint {
  const key = `${p.key}|warn`;
  let out = warnPaints.get(key);
  if (out) return out;
  const recolor: Record<string, string[]> = {};
  for (const [hex, a, mat, shade] of SHEETS[p.sheet].meta.colors) {
    if (mat === 'outline' || mat === 'shadow' || a < 255) continue;
    const own = p.recolor[mat];
    const src = own && own.length ? own[Math.min(shade, own.length - 1)] : hex;
    const [r, g, b] = rgb(src);
    const [nr, ng, nb] = warnShift(r, g, b);
    (recolor[mat] ??= [])[shade] = `#${[nr, ng, nb].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  // (A material's shades with no color of their own take the nearest one's.)
  for (const ramp of Object.values(recolor)) for (let i = 0; i < ramp.length; i++) ramp[i] ??= ramp[i - 1] ?? ramp.find(Boolean)!;
  out = { recolor, key };
  warnPaints.set(key, out);
  if (warnPaints.size > 400) warnPaints.delete(warnPaints.keys().next().value!);
  return out;
}

/** A sprite buffer shifted to the warning red (its dark outline pixels kept dark). */
function warnTint(b: PixelBuf): PixelBuf {
  const out = blank(b.w, b.h);
  for (let i = 0; i < b.px.length; i += 4) {
    const a = b.px[i + 3];
    if (!a) continue;
    const r = b.px[i];
    const g = b.px[i + 1];
    const bl = b.px[i + 2];
    const dark = (r * 0.3 + g * 0.59 + bl * 0.11) / 255 < 0.16;
    const [nr, ng, nb] = dark ? [r, g, bl] : warnShift(r, g, bl);
    out.px[i] = nr;
    out.px[i + 1] = ng;
    out.px[i + 2] = nb;
    out.px[i + 3] = a;
  }
  return out;
}

/**
 * The warning outline round a sprite's body (its opaque pixels; a soft shadow doesn't count), two
 * pixels outside it: hot red next to the body, a dark red edge outside that (it reads on red floors
 * too). The buffer is 2 px larger each way than the sprite's. `white`: the same shape all white (the
 * light-range mask).
 */
function outlineBuf(b: PixelBuf, white = false): PixelBuf {
  const W = b.w + 4;
  const H = b.h + 4;
  const out = blank(W, H);
  const body = (x: number, y: number) => x >= 0 && y >= 0 && x < b.w && y < b.h && b.px[(y * b.w + x) * 4 + 3] === 255;
  const ring1 = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = x - 2;
      const sy = y - 2;
      if (body(sx, sy)) continue;
      if (body(sx - 1, sy) || body(sx + 1, sy) || body(sx, sy - 1) || body(sx, sy + 1)) ring1[y * W + x] = 1;
    }
  }
  const on1 = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && ring1[y * W + x] === 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (ring1[y * W + x]) out.px.set(white ? [255, 255, 255, 255] : [255, 46, 30, 255], i);
      else if (!body(x - 2, y - 2) && (on1(x - 1, y) || on1(x + 1, y) || on1(x, y - 1) || on1(x, y + 1))) out.px.set(white ? [255, 255, 255, 255] : [72, 6, 10, 255], i);
    }
  }
  return out;
}

/**
 * A dash's lane on the ground, as a canvas centered on where it starts: along (ux, uy) for `len` px,
 * `half` px each side; a soft red wash inside, solid red edges and a bar across the end, every pixel
 * whole (no smoothing).
 */
function laneBand(ux: number, uy: number, len: number, half: number): HTMLCanvasElement {
  const size = (len + half + 2) * 2 + 1;
  const o = Math.floor(size / 2);
  const b = blank(size, size);
  const inside = (px: number, py: number) => {
    const rx = px - o;
    const ry = py - o;
    const along = rx * ux + ry * uy;
    return along >= 0 && along <= len && Math.abs(-rx * uy + ry * ux) <= half;
  };
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      if (!inside(px, py)) continue;
      const edge = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1);
      b.px.set(edge ? [255, 74, 58, 235] : [255, 90, 70, 64], (py * size + px) * 4);
    }
  }
  return toCanvas(b);
}

/** A copy of a buffer keeping only its body (alpha 255), or only its soft shadow (the rest), or the body in one color. */
function splitBuf(b: PixelBuf, keep: 'body' | 'shadow', color?: string): PixelBuf {
  const out = blank(b.w, b.h);
  const c = color ? [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)] : null;
  for (let i = 0; i < b.px.length; i += 4) {
    const a = b.px[i + 3];
    if (!a || (keep === 'body') !== (a === 255)) continue;
    out.px[i] = c ? c[0] : b.px[i];
    out.px[i + 1] = c ? c[1] : b.px[i + 1];
    out.px[i + 2] = c ? c[2] : b.px[i + 2];
    out.px[i + 3] = a;
  }
  return out;
}

type Ctx = CanvasRenderingContext2D;

/** The PixelForge FX a boss's shots fly as. */
type BossShotFx = 'fx_rock_shard' | 'fx_fireball' | 'fx_blood_crescent';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: 'spark' | 'dust' | 'ember' | 'snow' | 'firefly' | 'leaf' | 'mote' | 'coin' | 'ring' | 'petal' | 'ash' | 'spore' | 'rain';
  glow?: boolean;
  /** Glows but lights nothing round it (a slammed Legendary's motes: crisp on the dark, not a haze). */
  unlit?: boolean;
}

interface FxSprite {
  name: FxName;
  x: number;
  y: number;
  t: number;
  flip: boolean;
}

/** Bright effects: drawn crisp on the unlit top layer (they don't glow or light the scene). */
const EMISSIVE: ReadonlySet<FxName> = new Set(['hit', 'crit', 'slash', 'boom', 'sparkle', 'levelUp', 'lightning', 'heal', 'electric', 'explosion']);

/** Target art pixels on the screen's short side; a phone comes in closer (about 236 across a 3x iPhone, was 295). */
const SHORT_SIDE = 270;
const PHONE_SHORT_SIDE = 230;
/**
 * At the hub the view comes in much closer (a phone held upright shows about 170 art px across, and
 * a desktop the same from its short side): the hub is one cozy shop front, painted to fill the screen.
 */
const HUB_SHORT_SIDE = 196;
/** Where your knight sits on the hub's screen, top to bottom: a little below the middle. */
const HUB_FOCUS_Y = 0.55;

/** PixelForge FX are drawn in their own colors. */
const NO_PAINT = { recolor: {}, key: 'fx' } as const;

/** How long the red flash lasts when the knight you steer is hit (s). */
const HURT_FLASH = 0.2;
/** The Phantom Dash's afterimages: one every this many seconds of its dash, each lasting this long. */
const SHADOW_EVERY = 0.035;
const SHADOW_LIFE = 0.2;
/** The aim's marks: the crosshair and the auto-aim's brackets, gold on an ink rim. */
const AIM_INK = '#140c14';
const AIM_GOLD = '#ffd84a';

/**
 * The most light a PixelForge character takes (1 = its own colors). Lanterns and glows still light
 * the ground round it; past this they would only bleach its muted palette.
 */
const EXPOSURE = 1.12;
/** And the least, in the dark (muted colors under a dim, tinted ambient would sink into the ground). */
const EXPOSURE_MIN = 0.7;

export class Renderer {
  canvas: HTMLCanvasElement;
  /** The 2D context of the visible canvas (only when WebGL isn't available). */
  ctx: Ctx | null = null;
  /** The shader pipeline (WebGL2), when available. */
  post: Post | null = null;
  /** Art-resolution layers: the ground, standing things, glowing things, the light map, the HUD. */
  scene: HTMLCanvasElement;
  sctx: Ctx;
  private layers: Record<'stand' | 'emit' | 'light' | 'ui' | 'cap', { c: HTMLCanvasElement; x: Ctx }>;
  /** The view's focus for menus that cover part of the screen (0..1). */
  focus = { x: 0.5, y: 0.5 };
  /** The view in whole art pixels (rounded up), and exactly. */
  W = 200;
  H = 300;
  vw = 200;
  vh = 300;
  /** The layers' size: the view plus a pixel of margin each way, for sub-pixel scrolling. */
  get LW(): number {
    return this.W + 1;
  }
  get LH(): number {
    return this.H + 1;
  }
  P = 4;
  light: Lighting;
  /** The camera's top-left in art pixels, unrounded. */
  camX = 0;
  camY = 0;
  /** The camera's remainder below a whole pixel, slid in the final pass (0..1). */
  private sub = { x: 0, y: 0 };
  /** The follow: a damped spring with look-ahead and a lean toward the fight (see camera.ts). */
  readonly camera = new Camera();
  private terrain: Terrain | null = null;
  private terrainMap: FloorMap | null = null;
  private props: Array<Prop & { key: string; art: PropArt; canvas: HTMLCanvasElement; ghost?: HTMLCanvasElement }> = [];
  private cache = new Map<string, HTMLCanvasElement>();
  private mobMeta = new Map<string, { ax: number; ay: number }>();
  private particles: Particle[] = [];
  private fxs: FxSprite[] = [];
  private time = 0;
  private weatherT = 0;
  private rain = new Rain();
  /** Life over the floor: fireflies, butterflies, mist, waterfalls. */
  private ambient: Ambient | null = null;
  /** The painted hub, built the first time it's shown. */
  private hubPaint: HubPaint | null = null;
  /** The layers are sized for the hub's closer zoom (true) or everywhere else's. */
  private hubZoom = false;
  /** The view's whole-pixel top-left in world pixels, this frame. */
  private origin = { x: 0, y: 0 };
  private flashT = 0;
  /** PixelForge: this frame's knight poses, and dying mobs playing out their deaths. */
  private heroPoses = new Map<number, HeroPose>();
  private corpses: Array<{ uid: number; x: number; y: number; paint: MobPaint; dir: Dir; at: number; world: World; poofed: boolean; boss: boolean }> = [];
  /** PixelForge FX playing in the world (death poofs, a skeleton's crumble), on the world's clock. */
  private pfFx: Array<{ name: SheetName; x: number; y: number; at: number; world: World }> = [];
  /** The attack effects: swings, shots in flight, their impacts (src/render/vfx). */
  private vfx = new Vfx();
  /** The skills with art of their own: meteors, the Singularity's vortex, Titan's Wrath's rocks... (spells.ts). */
  private spells = new Spells();
  /** A Legendary's cast round its caster: the dark and its pool of light, the power-up's glow, the flare (castFx.ts). */
  private castFx = new CastFx();
  /** Going through a portal: the squad swirling into the way down, and popping out at the next floor (warpFx.ts). */
  private warpFx = new WarpFx();
  /** How far the open doorway's vortex has turned, in its frames (it turns faster while it takes the squad). */
  private doorTurn = 0;
  /** Body boxes of PixelForge frames (for squash and stretch), by sheet and frame. */
  private boxes = new Map<string, Box>();
  /**
   * Afterimages of mobs mid-dash or mid-leap: silhouettes where each was drawn a few frames back (in
   * world pixels, on the world's clock), and when it last kicked up dust.
   */
  private trails = new Map<number, { world: World; dustAt: number; snaps: Array<{ x: number; y: number; ox: number; oy: number; w: number; h: number; c: HTMLCanvasElement; at: number }> }>();
  /** Perfect rolls: where the knight was when the hit went through it, for its flash and afterimage. */
  private perfects: Array<{ uid: number; x: number; y: number; at: number; world: World; big: boolean }> = [];
  /** This frame's tells over mobs' heads (drawn with the HUD, after the numbers). */
  private tells: Array<{ x: number; y: number; a: number }> = [];
  /** Where the mouse is over the fight (CSS px; App sets it each frame): the crosshair, and the view leans to it. */
  cursor: { x: number; y: number } | null = null;
  /** Seconds left of the red flash (the knight you steer was hit) and of the crosshair's kick (it attacked). */
  private hurtFlashT = 0;
  private kickT = 0;
  /** The knight you steer as last seen: its grace (a fresh one is a hit) and its swing (a fresh one, an attack). */
  private seen = { uid: -1, grace: 0, swingT: 0 };
  /** How far above its feet each mob drawn this frame reaches (the auto-aim's brackets fit round it). */
  private mobTop = new Map<number, number>();
  /** The Phantom Dash's afterimages, by knight: silhouettes where it was drawn a moment ago (world time). */
  private heroTrails = new Map<number, { world: World; snaps: Array<{ x: number; y: number; ox: number; oy: number; c: HTMLCanvasElement; at: number }> }>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const post = new Post(canvas);
    if (post.ok) this.post = post;
    else this.ctx = canvas.getContext('2d')!;
    this.scene = makeCanvas(this.W, this.H) as HTMLCanvasElement;
    this.sctx = this.scene.getContext('2d')!;
    const mk = () => {
      const c = makeCanvas(this.W, this.H) as HTMLCanvasElement;
      return { c, x: c.getContext('2d')! };
    };
    this.layers = { stand: mk(), emit: mk(), light: mk(), ui: mk(), cap: mk() };
    this.light = new Lighting(this.W, this.H);
    this.resize();
  }

  /** A point on the screen (CSS px) as a world point (the mouse's aim). */
  screenToWorld(x: number, y: number): { x: number; y: number } {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    return { x: this.camX + (x * dpr) / this.P, y: this.camY + (y * dpr) / this.P };
  }

  /** Fits the canvas to the window and the art layers to the zoom (call again when either changes). */
  resize(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = Math.floor(window.innerWidth * dpr);
    const ch = Math.floor(window.innerHeight * dpr);
    const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
    let P = Math.max(2, Math.round(Math.min(cw, ch) / (this.hubZoom ? HUB_SHORT_SIDE : phone ? PHONE_SHORT_SIDE : SHORT_SIDE)));
    // The hub is one painting: closer still where the view would reach far past its edges (a little
    // past is fine: the painting fades into the dark round it).
    if (this.hubZoom) P = Math.max(P, Math.ceil(cw / (HUB_W * 1.3)), Math.ceil(ch / (HUB_H * 1.3)));
    this.P = P;
    this.W = Math.ceil(cw / this.P);
    this.H = Math.ceil(ch / this.P);
    this.vw = cw / this.P;
    this.vh = ch / this.P;
    // (Setting a canvas's size clears it even when it's the same: only when the window changed.)
    if (this.canvas.width !== cw) this.canvas.width = cw;
    if (this.canvas.height !== ch) this.canvas.height = ch;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.scene.width = this.LW;
    this.scene.height = this.LH;
    for (const l of Object.values(this.layers)) {
      l.c.width = this.LW;
      l.c.height = this.LH;
      l.x.imageSmoothingEnabled = false;
    }
    this.light.resize(this.LW, this.LH);
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
    this.sctx.imageSmoothingEnabled = false;
  }

  private cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
    let c = this.cache.get(key);
    if (!c) {
      c = make();
      this.cache.set(key, c);
      if (this.cache.size > 3000) {
        const first = this.cache.keys().next().value!;
        this.cache.delete(first);
      }
    }
    return c;
  }

  private prepareFloor(w: World): void {
    if (this.terrainMap === w.map) return;
    this.terrainMap = w.map;
    this.terrain = paintTerrain(w.map, w.biome);
    this.particles = [];
    this.rain.reset();
    this.ambient = new Ambient(w.map, w.biome);
    this.props = w.map.props
      .map((p) => {
        const key = artKey(p, w.biome);
        const art = artOf(p, w.biome);
        const canvas = this.cached(key, () => toCanvas(art.buf));
        const ghost = p.kind === 'tree' ? this.cached(`${key}|ghost`, () => toCanvas(art.buf)) : undefined;
        return { ...p, key, art, canvas, ghost };
      })
      .sort((a, b) => a.y - b.y);
  }

  // ------------------------------------------------------------------ sprites

  private knightCanvas(L: KnightLook, id: string, mut: string, anim: 'idle' | 'walk' | 'hurt' | 'death', view: View, frame: number, white: boolean, flip: boolean, tkey: number) {
    const key = `k|${id}|${mut}|${anim}|${view}|${frame}|${white ? 1 : 0}|${flip ? 1 : 0}|${tkey}`;
    let meta: { handR: [number, number]; handL: [number, number] } | null = null;
    const c = this.cached(key, () => {
      const fr = knightFrame(L, anim, view, frame);
      let b = white ? flash(fr.buf) : fr.buf;
      if (flip) b = flipX(b);
      return toCanvas(b);
    });
    const fr = knightFrame(L, anim, view, frame);
    meta = { handR: fr.handR, handL: fr.handL };
    return { c, meta };
  }

  private textCanvas(text: string, style: TextStyle): HTMLCanvasElement {
    const key = `t|${text}|${JSON.stringify(style)}`;
    return this.cached(key, () => toCanvas(renderText(text, style)));
  }

  // ------------------------------------------------------------------ frame

  /** Draws a frame of `scene`: the floor you're on, or the hub between dives. */
  render(game: Game, dt: number, scene: World | null = game.world): void {
    this.time += dt;
    // Going into or out of the hub changes the zoom, and with it the size of every art layer.
    if (scene && scene.hub !== this.hubZoom) {
      this.hubZoom = scene.hub;
      this.resize();
    }
    const g = this.sctx;
    const st = this.layers.stand.x;
    const em = this.layers.emit.x;
    const ui = this.layers.ui.x;
    const w = scene;
    for (const c of [g, st, em, ui, this.layers.cap.x]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    st.clearRect(0, 0, this.LW, this.LH);
    em.clearRect(0, 0, this.LW, this.LH);
    this.layers.cap.x.clearRect(0, 0, this.LW, this.LH);
    ui.clearRect(0, 0, this.LW, this.LH);
    if (!w) {
      g.fillStyle = '#0b0d16';
      g.fillRect(0, 0, this.LW, this.LH);
      this.present(game, null, [], 0.5);
      return;
    }
    this.prepareFloor(w);
    const biome = w.biome;
    const lead = w.leader();
    // The knight you steer (none while the dev bot plays it, or a portal has it), and where it aims:
    // the mouse, else (touch or Auto attack, attacking) the foe the auto-aim is on, or the way it's dragged.
    const me = w.hub || w.camp || w.bot || w.warping() ? null : (w.heroes.find((h) => h.slot === w.controlled && !h.downed) ?? null);
    let aimPt: { x: number; y: number } | null = null;
    if (me && this.cursor) aimPt = this.screenToWorld(this.cursor.x, this.cursor.y);
    else if (me && (me.aiming ?? 0) > 0) {
      const lock = this.lockOf(w, me);
      aimPt = lock ? { x: lock.x, y: lock.y } : { x: me.x + me.aimX * 60, y: me.y + me.aimY * 60 };
    }
    this.camera.update({
      dt,
      map: w.map,
      mapW: w.map.w * TILE,
      mapH: w.map.h * TILE,
      viewW: this.vw,
      viewH: this.vh,
      focusX: this.focus.x,
      focusY: w.hub ? HUB_FOCUS_Y : this.focus.y,
      // The hub is a painting with nothing past its edges: the view stays inside it.
      margin: w.hub ? 0 : undefined,
      lead,
      foes: w.mobs,
      rewinding: !!w.rewind,
      calm: game.state.settings.reduceMotion,
      aim: aimPt,
    });
    // A fresh grace is a hit on your knight (a red flash); a fresh swing, an attack (the crosshair kicks).
    if (me) {
      if (me.uid !== this.seen.uid) this.seen = { uid: me.uid, grace: me.graceT ?? 0, swingT: me.swingT };
      if ((me.graceT ?? 0) > this.seen.grace + 0.05) this.hurtFlashT = HURT_FLASH;
      if (me.swingT > this.seen.swingT + 1e-4) this.kickT = 0.08;
      this.seen.grace = me.graceT ?? 0;
      this.seen.swingT = me.swingT;
    }
    this.hurtFlashT = Math.max(0, this.hurtFlashT - dt);
    this.kickT = Math.max(0, this.kickT - dt);
    this.camX = this.camera.x;
    this.camY = this.camera.y;
    // Shake: a smooth rumble (two detuned waves), not a fresh random jolt every frame.
    let shx = 0;
    let shy = 0;
    if (w.shake > 0 && !game.state.settings.reduceMotion) {
      const amp = w.shakePower * Math.min(1, w.shake * 4);
      const t = this.time;
      shx = amp * (Math.sin(t * 77) * 0.6 + Math.sin(t * 113 + 1.9) * 0.4);
      shy = amp * 0.8 * (Math.sin(t * 89 + 0.7) * 0.6 + Math.sin(t * 131 + 2.6) * 0.4);
    }
    // The frame is drawn at the whole-pixel origin; the shader slides it by the remainder, so the
    // world scrolls smoothly while every sprite stays on the pixel grid.
    const fx = this.camX + shx;
    const fy = this.camY + shy;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    this.sub.x = fx - cx;
    this.sub.y = fy - cy;
    this.origin.x = cx;
    this.origin.y = cy;
    // Where the world is on the page this frame, for the HUD's overlays (the spell slam's icon).
    game.view = screenView(fx, fy, this.P, Math.min(3, window.devicePixelRatio || 1));
    const sx = (x: number) => Math.round(x) - cx;
    const sy = (y: number) => Math.round(y) - cy;
    const visible = (x: number, y: number, m = 40) => x > cx - m && x < cx + this.W + m && y > cy - m && y < cy + this.H + m * 2;
    const shader = !!this.post;

    // --- ground (blurred by depth in the shader; on the canvas path, here)
    const hub = w.hub ? (this.hubPaint ??= new HubPaint()) : null;
    if (hub) hub.drawGround(g, cx, cy, this.LW, this.LH);
    else {
      g.fillStyle = biome.solid.top[0];
      g.fillRect(0, 0, this.LW, this.LH);
      g.drawImage(this.terrain!.canvas, cx, cy, this.LW, this.LH, 0, 0, this.LW, this.LH);
      this.drawLiquidShimmer(g, w, cx, cy);
    }
    if (w.sky.rain > 0) {
      this.rain.update(dt, w.map, w.sky.rain, cx, cy, this.LW, this.LH);
      this.rain.drawGround(g, cx, cy);
    }
    this.ambient?.drawGround(g, cx, cy, this.LW, this.LH, this.time);
    // Traps: what lies on the floor goes under everyone; what stands up is sorted with them below.
    const standingTraps: Array<{ y: number; draw: () => void }> = [];
    for (const tr of w.traps) {
      if (!visible(tr.x, tr.y, 72)) continue;
      for (const piece of trapPieces(tr, w.time)) {
        const draw = () => {
          (piece.flat ? g : st).drawImage(this.cached(`trap|${piece.key}`, () => toCanvas(piece.buf)), sx(piece.x), sy(piece.y));
          if (piece.glow) em.drawImage(this.cached(`trap|${piece.glow.key}`, () => toCanvas(piece.glow!.buf)), sx(piece.x), sy(piece.y));
        };
        if (piece.flat) draw();
        else standingTraps.push({ y: piece.base, draw });
      }
    }
    if (!shader && game.state.settings.tiltShift && lead) this.tiltShift(g, sy(lead.y) - 6, w.biome.layout === 'rooms' ? 0.5 : 1);
    this.spells.update(w);
    // A Legendary casting: the world goes dark round its caster (first on the HUD layer: whatever is
    // drawn there after it, the spells' bright effects and the bars, stays bright).
    this.castFx.update(w, game.state.settings.reduceMotion, dt);
    this.castFx.drawDark(ui, cx, cy, this.LW, this.LH);
    for (const a of w.areas) this.drawArea(g, ui, a, sx, sy);
    // Lunges' tells on the ground: a dash's lane, a leap's landing ring.
    for (const m of w.mobs) if (!m.dead && visible(m.x, m.y, 160)) this.drawTell(g, m, sx, sy);
    // The foes' bullets on the ground: the ring where each lobbed glob comes down and its shadow, and
    // the lines darts and beams will fly down (render/foeBullets.ts).
    this.vfx.foes.drawGround(g, w, cx, cy, this.LW, this.LH, this.time);
    for (const m of w.mobs) if (!m.dead && m.move === 'shoot' && visible(m.x, m.y, 160)) this.vfx.foes.drawAim(g, w, m, sx, sy, this.time);

    // --- PixelForge: knight poses for this frame, and mobs that just died start their deaths
    const pf = pfReady();
    this.heroPoses.clear();
    this.mobTop.clear();
    if (pf) {
      for (const h of w.heroes) this.heroPoses.set(h.uid, heroPose(w, h, game.state.settings.reduceMotion));
      pruneHeroes(new Set(w.heroes.map((h) => h.uid)));
      for (const m of w.mobs) {
        if (!m.dead || this.corpses.some((c) => c.uid === m.uid)) continue;
        const paint = mobPaint(m.type!, !!m.elite, !!m.boss, (m.bossPhase ?? 0) > 0);
        // A bomber that went off leaves nothing to fall over.
        if (!paint || (lastMoveOf(m.uid) === 'bomb' && (m.windT ?? 0) <= 0)) continue;
        this.corpses.push({ uid: m.uid, x: m.x, y: m.y, paint, dir: mobDirOf(m.uid) ?? (m.dir < 0 ? 'w' : 'e'), at: w.time, world: w, poofed: false, boss: !!m.boss });
      }
      this.corpses = this.corpses.filter((c) => c.world === w && w.time - c.at < 4);
      pruneMobs(new Set(w.mobs.filter((m) => !m.dead).map((m) => m.uid)));
    }
    // A portal's warp: the squad swirling into the way down, or popping out at a floor's start (its
    // knights are drawn there, not with everyone standing; with reduce motion it flashes the screen).
    this.flashT = Math.max(this.flashT, this.warpFx.update(w, dt, this.time, (h) => this.heroPoses.get(h.uid)?.dir));

    // --- shadows (soft ovals under everything standing; PixelForge sprites bring their own)
    g.fillStyle = 'rgba(8,6,16,0.38)';
    for (const p of this.props) {
      if (!visible(p.x, p.y)) continue;
      if (p.kind === 'tree') {
        // The crown's shadow is baked into the ground (castShadows); here just the dark at the trunk's foot.
        const c = (p.art as TreeArt).crown;
        const rx = c ? Math.max(3, Math.min(12, Math.round(c.w * 0.16))) : 6;
        this.ellipse(g, sx(p.x + 1), sy(p.y - 1), rx, 2);
      }
      else if (p.solid) this.ellipse(g, sx(p.x), sy(p.y), Math.max(3, p.art.buf.w / 2 - 1), 2);
    }
    for (const u of [...w.heroes, ...w.mobs]) {
      if (u.dead && u.hurtT < -0.3) continue;
      if (!visible(u.x, u.y) || (u.team === 'hero' && this.warpFx.draws(w, u))) continue;
      // A PixelForge mob in the air: its own soft shadow goes with it (drawMob), and a firm one here marks the ground under it.
      const air = pf && u.team === 'mob' && !u.dead && (u.rush?.kind === 'leap' || (u.rush && u.flying)) ? mobMotion(u, w.time) : null;
      if (air && air.lift > 0) {
        const k = air.shadow * (u.boss ? 2.2 : u.elite ? 1.3 : 1);
        this.ellipse(g, sx(u.x), sy(u.y), Math.max(2, Math.round((u.r + 2) * k)), Math.max(1, Math.round(2.2 * k)));
        continue;
      }
      if (pf && (u.team === 'hero' || (!u.dead && mobPaint(u.type!, !!u.elite, !!u.boss)) || this.corpses.some((c) => c.uid === u.uid))) continue;
      // (A mob in the air leaves its shadow on the ground, smaller the higher it goes.)
      const big = (u.boss ? 3 : u.elite ? 1.4 : 1) * (u.team === 'mob' && !u.dead ? mobMotion(u, w.time).shadow : 1);
      this.ellipse(g, sx(u.x), sy(u.y), Math.round((u.r + 1) * big), Math.max(1, Math.round(2 * big)), u.flying ? 0.6 : 1);
    }

    // --- everything standing, sorted by feet
    type D = { y: number; draw: () => void };
    const list: D[] = [];
    const leadBox = lead ? { x: lead.x, y: lead.y } : null;
    const outdoors = biome.layout === 'cave';
    for (const p of this.props) {
      if (!visible(p.x, p.y, p.kind === 'tree' ? 64 : 48)) continue;
      list.push({
        y: p.y,
        draw: () => {
          // Trees sway in the wind, a pixel at a time, each on its own beat.
          let canvas = p.canvas;
          // Pack props that move (flames, a banner, a flask), each on its own beat.
          const fi = p.art.frames ? Math.floor(this.time * (p.art.fps ?? 8) + (p.seed % 97) * 0.31) % p.art.frames.length : 0;
          if (p.art.frames && fi) canvas = this.cached(`${p.key}|f${fi}`, () => toCanvas(p.art.frames![fi]));
          if (p.kind === 'tree' && outdoors) {
            const gust = Math.sin(this.time * 0.35 + p.x * 0.004) > 0.6 ? 2 : 1;
            const sway = Math.round(Math.sin(this.time * 1.3 + p.x * 0.07 + p.y * 0.031) * gust);
            if (sway) canvas = this.swayed(p, sway);
          }
          const x = sx(p.x) - p.art.ax;
          const y = sy(p.y) - p.art.ay;
          // Trees in front of the leader turn see-through, so you never lose your knight.
          let alpha = 1;
          if (leadBox && p.kind === 'tree' && p.y > leadBox.y) {
            const c = (p.art as TreeArt).crown;
            const inside = c
              ? leadBox.x > p.x + c.x - 2 && leadBox.x < p.x + c.x + c.w + 2 && leadBox.y - 8 > p.y + c.y && leadBox.y - 8 < p.y + c.y + c.h + 6
              : p.y - leadBox.y < 30 && Math.abs(p.x - leadBox.x) < 14;
            if (inside) alpha = 0.45;
          }
          st.globalAlpha = alpha;
          st.drawImage(canvas, x, y);
          st.globalAlpha = 1;
          if (p.art.glow) em.drawImage(this.cached(`${p.key}|g${fi}`, () => toCanvas(p.art.glow![fi])), x, y);
          if (p.art.flame) {
            const fr = Math.floor(this.time * 10 + p.seed) % 4;
            const f = this.cached(`flame|${p.art.flame.size}|${fr}|${biome.light.fire}`, () => toCanvas(flameArt(p.art.flame!.size, fr, biome.light.fire)));
            em.drawImage(f, sx(p.x) + p.art.flame.dx - Math.floor(f.width / 2), sy(p.y) + p.art.flame.dy - f.height + 2);
          }
        },
      });
    }
    // (The hub paints its own way down: its steps, and the glow at their foot.)
    this.doorTurn += dt * 10 * this.warpFx.doorSpin(w);
    if (!hub && visible(w.map.exit.x, w.map.exit.y, 80)) list.push({ y: w.map.exit.y - 7, draw: () => this.drawDoor(st, em, w, sx, sy, lead ?? null) });
    // A merchant's wares on their tables, price tags underneath.
    const atWare = hub ? null : w.nearWare();
    for (const wa of w.wares) {
      if (wa.sold || !visible(wa.x, wa.y)) continue;
      list.push({ y: wa.y, draw: () => this.drawWare(st, em, ui, wa, sx, sy, wa === atWare, game.state.gold >= wa.price) });
    }
    for (const m of w.mobs) {
      if (!visible(m.x, m.y)) continue;
      list.push({ y: m.y, draw: () => this.drawMob(st, w, m, sx, sy) });
    }
    for (const c of this.corpses) {
      if (!visible(c.x, c.y)) continue;
      list.push({ y: c.y, draw: () => this.drawCorpse(st, w, c, sx, sy) });
    }
    for (const h of w.heroes) {
      if (!visible(h.x, h.y) || this.warpFx.draws(w, h)) continue;
      list.push({
        y: h.y,
        draw: () => {
          this.drawHero(st, w, h, sx, sy);
          if (!hub && w.portalOpen && Math.abs(h.x - w.map.exit.x) < 18 && h.y > w.map.exit.y - 8 && h.y < w.map.exit.y + 34) {
            // Standing in front of the vortex: the knight hides its glow.
            em.globalCompositeOperation = 'destination-out';
            this.drawHero(em, w, h, sx, sy, true);
            em.globalCompositeOperation = 'source-over';
          }
          if (hub) {
            // Walking in front of a lit window covers it.
            em.globalCompositeOperation = 'destination-out';
            this.drawHero(em, w, h, sx, sy, true);
            em.globalCompositeOperation = 'source-over';
          }
        },
      });
    }
    for (const p of w.pickups) {
      list.push({ y: p.y, draw: () => this.drawPickup(em, p.kind, sx(p.x), sy(p.y - p.z)) });
    }
    // The hub's keepers, and a marker over the one you can talk to.
    const near = w.hub ? w.nearStation() : null;
    for (const k of w.stations) {
      if (!visible(k.x, k.y)) continue;
      list.push({
        y: k.y,
        draw: () => {
          if (hub && k.def) hub.drawFigure(st, em, k, sx(k.x), sy(k.y), this.time);
          else if (k.def) {
            const f = npcFrame(k.def, 'idle', k.view, Math.floor(this.time * 4 + k.x));
            const c = this.cached(`npc|${k.def.id}|${k.view}|${k.dir}|${Math.floor(this.time * 4 + k.x) % 8}`, () => toCanvas(k.dir < 0 && k.view === 'side' ? flipX(f.buf) : f.buf));
            const ax = k.dir < 0 && k.view === 'side' ? f.buf.w - 1 - f.ax : f.ax;
            st.drawImage(c, sx(k.x) - ax, sy(k.y) - f.ay);
          }
          const bob = Math.round(Math.sin(this.time * 4) * 1.5);
          const mark = this.cached(`qmark|${near === k ? 'turnIn' : 'offer'}`, () => toCanvas(questMarker(near === k ? 'turnIn' : 'offer')));
          // The Shrine calls once a rebirth is ready (from anywhere at camp, not just up close).
          const calls = k.id === 'rebirth' && canRebirth(game.state);
          if (near === k || !k.def || calls) ui.drawImage(calls && near !== k ? this.cached('qmark|offer', () => toCanvas(questMarker('offer'))) : mark, sx(k.x) - Math.floor(mark.width / 2), sy(k.y) - (k.def ? 34 : 22) + bob);
          else if (k.id === 'scrap' && extrasCount(game.state) > 0) {
            // The broker, while extras wait for him to sell: a small coin bobbing gently over him.
            const coin = this.cached('qmark|coin', () => toCanvas(coinMarker()));
            ui.drawImage(coin, sx(k.x) - Math.floor(coin.width / 2), sy(k.y) - 24 + Math.round(Math.sin(this.time * 2.5)));
          }
        },
      });
    }
    // Folk on the floor, with a "!" over anyone with a job for you (a "?" when one's ready to hand in).
    const talkTo = w.hub ? null : w.nearNpc();
    for (const n of w.npcs) {
      if (!visible(n.x, n.y)) continue;
      list.push({
        y: n.y,
        draw: () => {
          const fr = Math.floor(n.animT * 4);
          const f = npcFrame(n.def, 'idle', n.view, fr);
          const flip = n.dir < 0 && n.view === 'side';
          const c = this.cached(`npc|${n.def.id}|${n.view}|${flip ? 1 : 0}|${fr % 8}`, () => toCanvas(flip ? flipX(f.buf) : f.buf));
          st.drawImage(c, sx(n.x) - (flip ? f.buf.w - 1 - f.ax : f.ax), sy(n.y) - f.ay);
          const mk = npcMarker(n, game.state.quests ?? []) ?? (talkTo === n ? 'offer' : null);
          if (mk) {
            const bob = Math.round(Math.sin(this.time * 4 + n.x) * 1.5);
            const m = this.cached(`qmark|${mk}`, () => toCanvas(questMarker(mk)));
            ui.drawImage(m, sx(n.x) - Math.floor(m.width / 2), sy(n.y) - 34 + bob);
          }
        },
      });
    }
    if (hub) list.push(...hub.items(st, em, cx, cy, this.LW, this.LH, this.time));
    list.push(...standingTraps);
    this.spells.standing(w, st, this.layers.cap.x, sx, sy, list);
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();
    this.drawPfFx(st, w, sx, sy);
    // The squad in a portal's warp, over everything standing (it's on its way into the vortex).
    this.warpFx.draw(st, em, this.layers.cap.x, ui, w, sx, sy);
    // --- swings: their own pass, over the units, on the unlit top layer like every attack effect
    // (read before the Fx below are turned into effects: a stroke's own marks replace their sparks)
    this.vfx.update(w);
    this.vfx.drawSwings(w, ui, cx, cy);
    // Boulders in the air (over everything standing), and knights flashing from a perfect roll.
    for (const a of w.areas) if (a.kind === 'boulder' && a.delay > 0) this.drawFlyingBoulder(st, w, a, sx, sy);
    this.drawPerfects(st, ui, w, sx, sy);
    if (hub) {
      hub.drawFore(st, em, cx, cy, this.LW, this.LH);
      hub.updateMotes(dt);
      hub.drawMotes(em, cx, cy, this.LW, this.LH, this.time);
    } else this.ambient?.drawAir(em, cx, cy, this.LW, this.LH, this.time);

    // --- shots, sparks, leaves and weather. Attack effects (shots, spell and hit bursts) go on the
    // unlit top layer: crisp, never bloomed or glowing (only the setting glows).
    // (Foes' bullets are the effects' danger balls: big, outlined, white-hot hearts; vfx/art.ts bulletSprite.)
    const warden = (s: Shot) => pf && !!this.bossShot(w, s);
    for (const s of w.shots) if (warden(s)) this.drawRockShard(st, s, sx, sy, this.bossShot(w, s)!);
    this.vfx.drawShots(w, ui, cx, cy, this.W, this.H, warden);
    this.spawnFx(w);
    if (!hub) this.weather(biome, dt, cx, cy);
    if (outdoors && !hub) this.dropLeaves(biome, cx, cy, dt);
    this.updateParticles(st, em, dt, sx, sy);
    this.vfx.drawImpacts(w, ui, cx, cy, this.W, this.H);
    if (w.sky.rain > 0) this.rain.drawAir(st, cx, cy);
    this.advanceFx(dt);
    this.drawFx(st, sx, sy, false);
    this.drawFx(ui, sx, sy, true);
    this.spells.drawTop(w, ui, sx, sy);
    this.castFx.drawTop(ui, em, cx, cy);

    // --- light (the setting's: effects light nothing)
    const lights = this.collectLights(w, biome, cx, cy, sx, sy);
    this.castFx.addLights(lights, cx, cy, ambientOf(biome, w.sky));
    if (outdoors && w.sky.kind === 'clear') this.sunFlecks(lights, w, cx, cy);
    this.flashT = Math.max(0, this.flashT - dt);

    // --- the HUD layer: health bars, numbers, pointers (never lit or graded)
    this.drawOverlay(ui, w, sx, sy);
    // The aim: the auto-aim's brackets on its foe, the red flash of a hit, the crosshair at the mouse.
    if (me) this.drawAimMarker(ui, w, me, sx, sy);
    if (this.hurtFlashT > 0) this.drawHurtFlash(ui);
    if (me && this.cursor && aimPt) this.drawCrosshair(ui, w.mobs.some((m) => !m.dead && Math.hypot(m.x - aimPt!.x, m.y - 7 - aimPt!.y) < m.r + 5));
    this.present(game, w, lights, lead ? (sy(lead.y) - 6 - this.sub.y) / this.vh : 0.5);
  }

  /** The foe the auto-aim of knight h is locked on (alive), or null. */
  private lockOf(w: World, h: Unit): Unit | null {
    if (h.aimLock == null) return null;
    for (const m of w.mobs) if (m.uid === h.aimLock && !m.dead) return m;
    return null;
  }

  /**
   * The touch auto-aim's target marker: corner brackets round the foe it's locked on (while the knight
   * you steer attacks), breathing in and out a pixel.
   */
  private drawAimMarker(ctx: Ctx, w: World, me: Unit, sx: (x: number) => number, sy: (y: number) => number): void {
    if (!((me.aiming ?? 0) > 0)) return;
    const m = this.lockOf(w, me);
    if (!m) return;
    const breathe = Math.floor(this.time * 4) % 2;
    const hw = Math.round(m.r + (m.boss ? 8 : 4)) + breathe;
    const up = this.mobTop.get(m.uid) ?? Math.round(m.r * 2.4 + 9);
    const x0 = sx(m.x) - hw;
    const x1 = sx(m.x) + hw;
    const y0 = sy(m.y) - up - 2 - breathe;
    const y1 = sy(m.y) + 3 + breathe;
    const arm = m.boss ? 5 : 3;
    const corners: Array<[number, number, 1 | -1, 1 | -1]> = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]];
    for (const pass of [0, 1]) {
      ctx.fillStyle = pass === 0 ? AIM_INK : AIM_GOLD;
      const o = pass === 0 ? 1 : 0;
      for (const [x, y, dx, dy] of corners) {
        // One arm across and one down from each corner (the ink a pixel round them).
        ctx.fillRect(Math.min(x, x + dx * (arm - 1)) - o, y - o, arm + o * 2, 1 + o * 2);
        ctx.fillRect(x - o, Math.min(y, y + dy * (arm - 1)) - o, 1 + o * 2, arm + o * 2);
      }
    }
  }

  /** Your knight was hit: the screen flashes red, in stepped shades, a red frame round it. */
  private drawHurtFlash(ctx: Ctx): void {
    const t = this.hurtFlashT / HURT_FLASH;
    ctx.fillStyle = '#ff2a2a';
    ctx.globalAlpha = t > 0.66 ? 0.2 : t > 0.33 ? 0.11 : 0.05;
    ctx.fillRect(0, 0, this.LW, this.LH);
    ctx.globalAlpha = t > 0.5 ? 0.7 : 0.4;
    const b = 2;
    ctx.fillRect(0, 0, this.LW, b);
    ctx.fillRect(0, this.LH - b, this.LW, b);
    ctx.fillRect(0, b, b, this.LH - b * 2);
    ctx.fillRect(this.LW - b, b, b, this.LH - b * 2);
    ctx.globalAlpha = 1;
  }

  /**
   * The crosshair at the mouse, on the art grid: a dot and four ticks with an ink rim, crisp on any
   * floor; the ticks kick out a pixel as you attack, and turn gold over a foe.
   */
  private drawCrosshair(ctx: Ctx, hot: boolean): void {
    const c = this.cursor!;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    // The art pixel under the pointer (the layers slide by the camera's sub-pixel in the last pass).
    const x = Math.floor((c.x * dpr) / this.P + this.sub.x);
    const y = Math.floor((c.y * dpr) / this.P + this.sub.y);
    const from = 4 + (this.kickT > 0 ? 1 : 0);
    const len = 3;
    const ticks: Array<[number, number, number, number]> = [
      [x + from, y, len, 1],
      [x - from - len + 1, y, len, 1],
      [x, y + from, 1, len],
      [x, y - from - len + 1, 1, len],
    ];
    ctx.fillStyle = AIM_INK;
    ctx.fillRect(x - 1, y - 1, 3, 3);
    for (const [tx, ty, tw, th] of ticks) ctx.fillRect(tx - 1, ty - 1, tw + 2, th + 2);
    ctx.fillStyle = hot ? AIM_GOLD : '#ffffff';
    ctx.fillRect(x, y, 1, 1);
    for (const [tx, ty, tw, th] of ticks) ctx.fillRect(tx, ty, tw, th);
  }

  /** A tree with its crown shifted by `dx` pixels, more toward the top (wind). */
  private swayed(p: { canvas: HTMLCanvasElement; art: PropArt; key: string }, dx: number): HTMLCanvasElement {
    const key = `sway|${p.key}|${dx}`;
    return this.cached(key, () => {
      const src = p.canvas;
      const c = makeCanvas(src.width, src.height) as HTMLCanvasElement;
      const x = c.getContext('2d')!;
      const trunk = Math.round(src.height * 0.62);
      // Rows above the trunk lean with the wind; the higher, the more.
      for (let y = 0; y < src.height; y++) {
        const k = y < trunk ? Math.round(dx * (1 - y / trunk) + (dx > 0 ? 0.2 : -0.2)) : 0;
        x.drawImage(src, 0, y, src.width, 1, k, y, src.width, 1);
      }
      return c;
    });
  }

  private leafT = 0;
  /** Leaves drift down from the crowns in view. */
  private dropLeaves(_b: Biome, cx: number, cy: number, dt: number): void {
    this.leafT += dt;
    if (this.leafT < 0.18) return;
    this.leafT = 0;
    // Trees in view that shed (pines, cacti, crystals and dead trees have no leaves to drop).
    const trees = this.props.filter((p) => p.kind === 'tree' && ((p.art as TreeArt).leaves?.length ?? 0) > 0 && p.x > cx - 10 && p.x < cx + this.W + 10 && p.y > cy && p.y < cy + this.H + 60);
    if (!trees.length) return;
    const t = trees[Math.floor(Math.random() * trees.length)];
    const art = t.art as TreeArt;
    const color = art.leaves[Math.floor(Math.random() * art.leaves.length)];
    // From somewhere in the crown.
    const c = art.crown;
    const x = t.x + c.x + Math.random() * c.w;
    const y = t.y + c.y + Math.random() * c.h * 0.8;
    this.particles.push({ ...this.p('leaf', x, y, color, 4.5), vx: 4 + Math.random() * 6, vy: 7 + Math.random() * 5 });
  }

  /** Sun flecks: soft spots of light that shimmer where the canopy lets the sun through. */
  private sunFlecks(lights: Light[], w: World, cx: number, cy: number): void {
    const b = w.biome;
    const day = ['hamlet', 'farmland', 'desert', 'tundra', 'shrine'].includes(b.id);
    if (!day) return;
    for (const p of this.props) {
      if (p.kind !== 'tree' || !p.edge || p.seed % 3 !== 0) continue;
      if (p.x < cx - 30 || p.x > cx + this.W + 30 || p.y < cy - 10 || p.y > cy + this.H + 40) continue;
      const k = 0.5 + 0.5 * Math.sin(this.time * 0.9 + p.seed * 0.37);
      lights.push({ x: p.x - cx + ((p.seed % 13) - 6), y: p.y - cy + 6 + (p.seed % 7), r: 10 + (p.seed % 9), color: b.light.gradeTop, intensity: 0.1 + 0.14 * k });
    }
  }

  private blurCopy: HTMLCanvasElement | null = null;
  private blurHalf: HTMLCanvasElement | null = null;
  private filterOk: boolean | null = null;

  /**
   * Depth-of-field blur on the ground layer. `focus` is the leader's row on screen: rows within a few
   * tiles of it stay sharp; above it (further away in the 3/4 view) the blur grows toward the top of
   * the view; the bottom edge softens a little. `strength` is 1 outdoors, 0.5 indoors. The blur steps
   * in whole bands, at art resolution, so it stays on the pixel grid.
   */
  private tiltShift(ctx: Ctx, focus: number, strength: number): void {
    const W = this.LW;
    const H = this.LH;
    if (!this.blurCopy || this.blurCopy.width !== W || this.blurCopy.height !== H) {
      this.blurCopy = makeCanvas(W, H) as HTMLCanvasElement;
      this.blurHalf = makeCanvas(Math.ceil(W / 2), Math.ceil(H / 2)) as HTMLCanvasElement;
    }
    if (this.filterOk === null) this.filterOk = typeof ctx.filter === 'string' && (() => {
      ctx.filter = 'blur(1px)';
      const ok = ctx.filter === 'blur(1px)';
      ctx.filter = 'none';
      return ok;
    })();
    const copy = this.blurCopy.getContext('2d')!;
    copy.clearRect(0, 0, W, H);
    copy.drawImage(this.scene, 0, 0);
    const sharp = 34;
    const reach = Math.max(40, focus - sharp);
    const level = (y: number) => {
      let b = 0;
      if (y < focus - sharp) b = Math.min(1, (focus - sharp - y) / reach) * 1.8;
      const edge = 30;
      if (y > H - edge) b = Math.max(b, ((y - (H - edge)) / edge) * 0.9);
      return Math.round(b * strength * 4) / 4;
    };
    // Group rows into bands of equal blur, and draw each band from a blurred copy.
    let y0 = 0;
    let cur = level(0);
    const flush = (y1: number, b: number) => {
      if (b <= 0 || y1 <= y0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y0, W, y1 - y0);
      ctx.clip();
      if (this.filterOk) {
        ctx.filter = `blur(${b}px)`;
        ctx.drawImage(this.blurCopy!, 0, 0);
        ctx.filter = 'none';
      } else {
        // No canvas filters (older Safari): a half-size smoothed round trip.
        const h = this.blurHalf!.getContext('2d')!;
        h.imageSmoothingEnabled = true;
        h.clearRect(0, 0, this.blurHalf!.width, this.blurHalf!.height);
        h.drawImage(this.blurCopy!, 0, 0, this.blurHalf!.width, this.blurHalf!.height);
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = Math.min(1, b);
        ctx.drawImage(this.blurHalf!, 0, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = false;
      }
      ctx.restore();
    };
    for (let y = 1; y <= H; y++) {
      const b = y < H ? level(y) : -1;
      if (b !== cur) {
        flush(y, cur);
        y0 = y;
        cur = b;
      }
    }
  }

  /** Time running backwards: a cold tint, rolling scanlines and a jittering band (the sign is in the HUD). */
  private drawRewind(ctx: Ctx, k: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'color';
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#4a7aff';
    ctx.fillRect(0, 0, this.LW, this.LH);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000000';
    const roll = Math.floor(this.time * 40) % 3;
    for (let y = roll; y < this.LH; y += 3) ctx.fillRect(0, y, this.LW, 1);
    // A band of the picture slipping sideways, like a tape running back.
    const by = Math.floor((1 - k) * this.H);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.scene, 0, by, this.LW, 6, Math.round(Math.sin(this.time * 60) * 3), by, this.LW, 6);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Puts the frame on screen: through the shader pipeline, or composited on the canvas. */
  private present(game: Game, w: World | null, lights: Light[], focusY: number): void {
    const biome = w?.biome;
    const settings = game.state.settings;
    if (this.post) {
      // The light map, smooth and at half strength (the shader doubles it, so lights can over-brighten).
      const L = this.layers.light.x;
      const sky = w?.sky ?? null;
      // The hub brings its own night and its own grade.
      const hubLook = w?.hub && this.hubPaint ? this.hubPaint.scene : null;
      this.light.drawMap(L, hubLook ? hubLook.ambient.color : biome ? ambientOf(biome, sky) : '#000000', lights);
      const grade: Grade = hubLook ? { ...hubLook.grade, rays: 0, rayColor: [1, 0.85, 0.6] } : biome ? gradeOf(biome, sky) : DEFAULT_GRADE;
      this.post.render(
        { ground: this.scene, stand: this.layers.stand.c, emit: this.layers.emit.c, light: this.layers.light.c, ui: this.layers.ui.c, cap: this.layers.cap.c },
        {
          time: this.time,
          artW: this.LW,
          artH: this.LH,
          scale: this.P,
          offX: this.sub.x,
          offY: this.sub.y,
          focusY,
          dof: settings.tiltShift && biome ? (biome.layout === 'rooms' ? 0.5 : 1) : 0,
          // The lens over the whole picture: a miniature's tilt-shift (soft above and below the band
          // your knight is in) and a soft glow; the hub is softer and glowier still, its shop front
          // (the far end) kept fairly crisp.
          ...(hubLook
            ? { tiltFar: settings.tiltShift ? 0.35 : 0, tiltNear: settings.tiltShift ? 0.85 : 0, soft: 0.5 }
            : { tiltFar: settings.tiltShift ? (biome?.layout === 'rooms' ? 0.45 : 0.75) : 0, tiltNear: settings.tiltShift ? 0.6 : 0, soft: 0.3 }),
          ...grade,
          clouds: biome ? cloudShadows(biome, sky) : 0,
          camX: this.origin.x,
          camY: this.origin.y,
          flash: this.flashT,
          fade: Math.round(game.fade * 8) / 8,
          rewind: w?.rewind ? Math.min(1, w.rewind.t * 6) : 0,
          capRange: [EXPOSURE_MIN, EXPOSURE],
        },
      );
      return;
    }
    // The canvas path: light, glow and HUD composited here, then scaled up.
    const ctx = this.sctx;
    if (biome) {
      ctx.drawImage(this.layers.stand.c, 0, 0);
      this.light.apply(ctx, biome.light.ambient, lights, { gradeTop: biome.light.gradeTop, gradeBottom: biome.light.gradeBottom, vignette: biome.light.vignette, flash: this.flashT });
      if (biome.light.fog) this.drawFog(ctx, biome.light.fog, Math.floor(this.camX), Math.floor(this.camY));
      ctx.drawImage(this.layers.emit.c, 0, 0);
      if (w?.rewind) this.drawRewind(ctx, w.rewind.t / w.rewind.dur);
    }
    ctx.drawImage(this.layers.ui.c, 0, 0);
    if (game.fade > 0) {
      ctx.fillStyle = `rgba(6,6,12,${Math.round(game.fade * 6) / 6})`;
      ctx.fillRect(0, 0, this.LW, this.LH);
    }
    this.ctx!.imageSmoothingEnabled = false;
    this.ctx!.drawImage(this.scene, -Math.round(this.sub.x * this.P), -Math.round(this.sub.y * this.P), this.LW * this.P, this.LH * this.P);
  }

  private ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha = 1): void {
    ctx.globalAlpha = alpha;
    for (let yy = -ry; yy <= ry; yy++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (yy / (ry + 0.5)) ** 2)));
      ctx.fillRect(x - half, y + yy, half * 2 + 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ units

  /** A knight: PixelForge's sheet for its class in its rarity's colors, playing what the sim says it's doing. */
  private drawHero(ctx: Ctx, w: World, h: Unit, sx: (x: number) => number, sy: (y: number) => number, cut = false): void {
    const pose = this.heroPoses.get(h.uid);
    if (!pose) return this.drawHeroLegacy(ctx, w, h, sx, sy);
    const paint = knightPaint(h.knightId!, h.mutation ?? null, paintStep(h.rarity!, this.time));
    const [px, py] = SHEETS[paint.sheet].meta.pivot;
    const [kx, ky] = recoil(h);
    const [nx, ny] = pose.nudge ?? [0, 0];
    const x = sx(h.x) - px + kx + nx;
    const y = sy(h.y) - py + ky + ny;
    // Just hit (the knight you steer): it blinks while it's untouchable.
    const blink = (h.graceT ?? 0) > 0 && Math.floor(this.time / 0.07) % 2 === 1 ? 0.3 : 1;
    if (cut) {
      ctx.drawImage(frameCanvas(paint.sheet, pose.k, paint, false, pose.anim, pose.dir), x, y);
      return;
    }
    // A ring under the knight you control.
    if (h.slot === w.controlled && !h.downed) {
      ctx.fillStyle = 'rgba(255,226,122,0.55)';
      for (let a = 0; a < 16; a++) {
        if ((a + Math.floor(this.time * 8)) % 4 === 0) continue;
        const ang = (a / 16) * Math.PI * 2;
        ctx.fillRect(sx(h.x) + Math.round(Math.cos(ang) * 6), sy(h.y) + Math.round(Math.sin(ang) * 3) + 1, 1, 1);
      }
      // Auto battle playing it for you: AUTO over its head (gone the moment you steer or attack).
      if (w.bot && w.auto && !w.hub) {
        const tag = this.textCanvas('AUTO', { face: 'small', fill: '#ffe27a', ink: '#1a1326' });
        const bob = Math.round(Math.sin(this.time * 3) * 1);
        this.layers.ui.x.drawImage(tag, sx(h.x) - (tag.width >> 1), sy(h.y) - 33 + bob);
      }
    }
    // The Arcanist's blink leaves an afterimage where it stood.
    if (pose.ghost && pose.ghost.alpha > 0) {
      ctx.globalAlpha = pose.ghost.alpha;
      ctx.drawImage(frameCanvas(paint.sheet, pose.ghost.k, paint, true, pose.ghost.anim, pose.ghost.dir), sx(pose.ghost.x) - px, sy(pose.ghost.y) - py);
    }
    // The Blade's Phantom Dash leaves afterimages behind it: dark silhouettes, fading by steps.
    this.shadowTrail(ctx, w, h, pose, paint, sx, sy, px, py);
    // Powering up for a Legendary: a glow round the knight in its tier's light.
    if (h.skillSlam) this.castFx.drawAura(this.layers.emit.x, h, paint.sheet, pose.k, paint, pose.anim, pose.dir, x, y);
    ctx.globalAlpha = pose.alpha * blink;
    ctx.drawImage(frameCanvas(paint.sheet, pose.k, paint, pose.flash, pose.anim, pose.dir), x, y);
    ctx.globalAlpha = 1;
    const cap = this.layers.cap.x;
    cap.globalAlpha = pose.alpha * blink;
    cap.drawImage(frameMask(paint.sheet, pose.k, paint, pose.flash, pose.anim, pose.dir), x, y);
    cap.globalAlpha = 1;
    // The halo glows (drawn on the light-emitting layer).
    if (paint.halo && !h.downed) {
      const [hx, hy] = haloSpot(paint.sheet, pose.k);
      const em = this.layers.emit.x;
      em.globalAlpha = pose.alpha;
      em.drawImage(haloCanvas(paint.halo, haloWidth(paint.sheet)), x + hx, y + hy + Math.round(Math.sin(this.time * 2.2 + h.uid) * 0.6));
      em.globalAlpha = 1;
    }
    if (pose.stunned) this.stunStars(this.layers.emit.x, sx(h.x), y + headTop(paint.sheet, pose.k)[1] - 3);
    if (h.drT > 0 && h.cls === 'guardian' && !h.downed) {
      // Bulwark: a shimmer around the Guardian.
      ctx.fillStyle = 'rgba(255,216,74,0.5)';
      const r = 9;
      for (let a = 0; a < 20; a++) if ((a + Math.floor(this.time * 12)) % 3 === 0) {
        const ang = (a / 20) * Math.PI * 2;
        ctx.fillRect(sx(h.x) + Math.round(Math.cos(ang) * r), sy(h.y) - 8 + Math.round(Math.sin(ang) * r), 1, 1);
      }
    }
  }

  /**
   * The Phantom Dash's afterimages (world/dash.ts): while a Blade dashes, where it was drawn a few
   * frames back stays behind as a dark silhouette (Kevin's in ink), each fainter by steps, gone in a
   * moment. On the world's clock, so a hit-stop holds them too.
   */
  private shadowTrail(ctx: Ctx, w: World, h: Unit, pose: HeroPose, paint: ReturnType<typeof knightPaint>, sx: (x: number) => number, sy: (y: number) => number, px: number, py: number): void {
    const dashing = h.rolling?.kind === 'shadow' || h.landing?.kind === 'shadow';
    let trail = this.heroTrails.get(h.uid);
    if (dashing) {
      if (!trail || trail.world !== w) {
        trail = { world: w, snaps: [] };
        this.heroTrails.set(h.uid, trail);
      }
      const last = trail.snaps[trail.snaps.length - 1];
      if (!last || w.time - last.at >= SHADOW_EVERY) {
        const tint = h.rarity === ('absolute' as typeof h.rarity) ? '#141418' : '#4a2f7a';
        const c = this.cached(`kshadow|${paint.sheet}|${pose.k}|${paint.key}|${pose.anim}|${pose.dir}|${tint}`, () => toCanvas(splitBuf(pfFrameBuf(paint.sheet, pose.k, paint, false, pose.anim, pose.dir), 'body', tint)));
        trail.snaps.push({ x: h.x, y: h.y, ox: px, oy: py, c, at: w.time });
        if (trail.snaps.length > 6) trail.snaps.shift();
      }
    }
    if (!trail) return;
    trail.snaps = trail.snaps.filter((s) => w.time - s.at < SHADOW_LIFE && w.time >= s.at);
    if (!trail.snaps.length) {
      this.heroTrails.delete(h.uid);
      return;
    }
    for (const s of trail.snaps) {
      const age = (w.time - s.at) / SHADOW_LIFE;
      ctx.globalAlpha = age < 0.34 ? 0.55 : age < 0.67 ? 0.35 : 0.18;
      ctx.drawImage(s.c, sx(s.x) - s.ox, sy(s.y) - s.oy);
    }
    ctx.globalAlpha = 1;
  }

  /** PixelForge's stun stars circling over a head whose top row is at (x, y). */
  private stunStars(ctx: Ctx, x: number, y: number): void {
    const sheet = SHEETS.fx_status_stun;
    const f = sheet.clip('loop', 's');
    const i = Math.floor((this.time * 1000) / f[0][1]) % f.length;
    const [px, py] = sheet.meta.anims.loop.pivots?.s ?? sheet.meta.pivot;
    ctx.drawImage(frameCanvas('fx_status_stun', f[i][0], NO_PAINT), x - px, y - py + 3);
  }

  /** PixelForge FX in the world, each played once on the world's clock. */
  private drawPfFx(ctx: Ctx, w: World, sx: (x: number) => number, sy: (y: number) => number): void {
    this.pfFx = this.pfFx.filter((f) => f.world === w);
    for (const f of this.pfFx) {
      const sheet = SHEETS[f.name];
      const anim = Object.keys(sheet.meta.anims)[0];
      const frames = sheet.clip(anim, 's');
      let ms = (w.time - f.at) * 1000;
      let i = 0;
      while (i < frames.length && ms >= frames[i][1]) ms -= frames[i++][1];
      if (i >= frames.length) {
        f.at = -1;
        continue;
      }
      const [px, py] = sheet.meta.anims[anim].pivots?.s ?? sheet.meta.pivot;
      ctx.drawImage(frameCanvas(f.name, frames[i][0], NO_PAINT), sx(f.x) - px, sy(f.y) - py);
    }
    this.pfFx = this.pfFx.filter((f) => f.at >= 0);
  }

  /** The game's own knight art (when PixelForge's sheets aren't loaded). */
  private drawHeroLegacy(ctx: Ctx, w: World, h: Unit, sx: (x: number) => number, sy: (y: number) => number): void {
    const L = knightLook(h.knightId!, h.mutation ?? null, h.rarity === 'primordial' ? this.time : 0);
    const tkey = h.rarity === 'primordial' ? Math.floor(this.time * 6) % 40 : 0;
    const mut = h.mutation ?? '';
    let anim: 'idle' | 'walk' | 'hurt' | 'death' = h.downed ? 'death' : h.hurtT > 0 ? 'hurt' : h.moving ? 'walk' : 'idle';
    let view: View = h.view;
    let frame = 0;
    if (anim === 'walk') frame = Math.floor(h.animT * 8) % 4;
    else if (anim === 'idle') frame = Math.floor(h.animT * 2.5) % 2;
    else if (anim === 'hurt') frame = 0;
    else frame = 2;
    const flip = h.dir < 0 && view === 'side';
    const white = h.hurtT > 0.12;
    // A dodge roll: the knight tumbles (whole quarter turns, so the pixels stay square).
    let rot = 0;
    let lift = 0;
    if (h.rolling) {
      const t = 1 - h.rolling.t / h.rolling.dur;
      if (h.rolling.kind === 'blink') {
        ctx.globalAlpha = 0.4;
      } else {
        rot = Math.floor(t * 4) % 4;
        if (h.rolling.kind === 'flip' || h.rolling.kind === 'vault') lift = Math.round(Math.sin(t * Math.PI) * 8);
        anim = 'idle';
        view = 'down';
      }
    }
    const { c, meta } = this.knightCanvas(L, h.knightId!, mut, anim, view, frame, white, flip, tkey);
    const x = sx(h.x) - (flip ? c.width - 1 - KNIGHT_ANCHOR.x : KNIGHT_ANCHOR.x);
    const y = sy(h.y) - KNIGHT_ANCHOR.y - lift;
    const mine = h.slot === w.controlled;
    // A ring under the knight you control.
    if (mine && !h.downed) {
      ctx.fillStyle = 'rgba(255,226,122,0.55)';
      const r = 6;
      for (let a = 0; a < 16; a++) {
        if ((a + Math.floor(this.time * 8)) % 4 === 0) continue;
        const ang = (a / 16) * Math.PI * 2;
        ctx.fillRect(sx(h.x) + Math.round(Math.cos(ang) * r), sy(h.y) + Math.round(Math.sin(ang) * 3) + 1, 1, 1);
      }
    }
    const weaponBehind = view === 'up';
    const drawWeapon = () => {
      if (h.downed || h.rolling) return;
      const wp = weaponArt(L);
      const wkey = `w|${h.knightId}|${mut}|${tkey}`;
      const wc = this.cached(wkey, () => toCanvas(wp.buf));
      const hand = flip ? [c.width - 1 - meta!.handR[0], meta!.handR[1]] : meta!.handR;
      let hx = x + hand[0];
      let hy = y + hand[1] + 1;
      // The swing: melee weapons sweep through an arc; bows and staves point at the target.
      let ang = (h.dir < 0 ? -1 : 1) * 0.35;
      if (view === 'down' && !flip) ang = 0.25;
      if (h.swingT > 0) {
        const t = 1 - h.swingT / h.swingDur;
        const aim = Math.atan2(h.aimY, h.aimX) + Math.PI / 2;
        if (h.cls === 'ranger' || h.cls === 'arcanist' || h.cls === 'cleric') ang = aim;
        else if (h.cls === 'lancer') {
          ang = aim;
          hx += Math.round(h.aimX * Math.sin(t * Math.PI) * 6);
          hy += Math.round(h.aimY * Math.sin(t * Math.PI) * 6);
        } else ang = aim + (t - 0.5) * 2.4 * (h.dir < 0 ? -1 : 1);
      }
      if (h.channel?.kind === 'whirlwind') ang = this.time * 20;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(Math.round(ang / (Math.PI / 8)) * (Math.PI / 8));
      ctx.drawImage(wc, -wp.px, -wp.py);
      ctx.restore();
    };
    if (weaponBehind) drawWeapon();
    if (rot) {
      ctx.save();
      ctx.translate(x + c.width / 2, y + c.height / 2 + 2);
      ctx.rotate((rot * Math.PI) / 2);
      ctx.drawImage(c, -Math.floor(c.width / 2), -Math.floor(c.height / 2));
      ctx.restore();
    } else ctx.drawImage(c, x, y);
    ctx.globalAlpha = 1;
    if (!weaponBehind) drawWeapon();
    if (CLASS_HAS_SHIELD[h.cls!] && !h.downed && !h.rolling && view !== 'up') {
      const sc = this.cached(`s|${h.knightId}|${mut}|${tkey}`, () => toCanvas(shieldArt(L)));
      const hand = flip ? [c.width - 1 - meta!.handL[0], meta!.handL[1]] : meta!.handL;
      const front = view === 'side' ? (flip ? x + 1 : x + c.width - sc.width - 1) : x + hand[0] - Math.floor(sc.width / 2);
      ctx.drawImage(sc, front, y + hand[1] - 5);
    }
    if (h.drT > 0 && h.cls === 'guardian' && !h.downed) {
      // Bulwark: a shimmer around the Guardian.
      ctx.fillStyle = 'rgba(255,216,74,0.5)';
      const r = 9;
      for (let a = 0; a < 20; a++) if ((a + Math.floor(this.time * 12)) % 3 === 0) {
        const ang = (a / 20) * Math.PI * 2;
        ctx.fillRect(sx(h.x) + Math.round(Math.cos(ang) * r), sy(h.y) - 8 + Math.round(Math.sin(ang) * r), 1, 1);
      }
    }
  }

  /** A mob: its PixelForge monster in its floor's colors when it has one, else the game's own sprite. */
  private drawMob(ctx: Ctx, w: World, m: Unit, sx: (x: number) => number, sy: (y: number) => number): void {
    const paint = pfReady() ? mobPaint(m.type!, !!m.elite, !!m.boss, (m.bossPhase ?? 0) > 0) : null;
    if (!paint) return this.drawMobLegacy(ctx, w, m, sx, sy);
    if (m.dead) return;
    const pose = mobPose(w, m, paint.monster, paint.sheet);
    if (pose.fx) this.pfFx.push({ name: pose.fx.name, x: m.x + pose.fx.dx, y: m.y + pose.fx.dy, at: w.time, world: w });
    const meta = SHEETS[paint.sheet].meta;
    const [px, py] = meta.pivot;
    const x = sx(m.x);
    const y = sy(m.y);
    // How the whole body moves on top of the frame: a crouch, a leap's arc, a dash's stretch, a landing's
    // squash (one that wakes with a howl or a roar stands up whole, its own frames rising).
    const mo = pose.steady ? { ...mobMotion(m, w.time), wide: 0, tall: 0, fade: 1 } : mobMotion(m, w.time);
    const flash = pose.flash;
    // The red warning through a wind-up: the body pulses red (a hit's flash wins that frame).
    const look: Paint = mo.warn && !flash ? warnPaint(paint) : paint;
    // Elites shine in their eyes' color.
    if (m.elite) {
      ctx.fillStyle = mixHex(paint.recolor.eyes?.[0] ?? m.type!.ramp[3], '#ffffff', 0.3);
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(this.time * 6);
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2 + this.time;
        ctx.fillRect(x + Math.round(Math.cos(ang) * (m.r + 3)), y - 1 + Math.round(Math.sin(ang) * 2), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    const cap = this.layers.cap.x;
    const box = this.frameBox(paint.sheet, pose.k, paint);
    const geo = this.squashGeom(meta.cell, meta.cell, px, py, box, mo.wide, mo.tall);
    // Afterimages in a pale wash of the body's own main material (a ghost of itself).
    const main = ['slime', 'fur', 'hide', 'skin', 'bone', 'membrane', 'stone'].map((k) => paint.recolor[k]).find((r) => r && r.length);
    const tint = mixHex(main ? main[main.length - 1] : m.type!.ramp[3], '#d4e6ff', 0.55);
    this.drawTrail(ctx, w, m, mo, geo, sx, sy, () => this.cached(`pfsil|${paint.sheet}|${pose.k}|${paint.key}|${tint}`, () => toCanvas(splitBuf(pfFrameBuf(paint.sheet, pose.k, paint), 'body', tint))));
    if (isStill(mo)) {
      ctx.drawImage(frameCanvas(paint.sheet, pose.k, look, flash), x - px, y - py);
      cap.drawImage(frameMask(paint.sheet, pose.k, paint, flash), x - px, y - py);
    } else {
      let body = frameCanvas(paint.sheet, pose.k, look, flash);
      if (mo.lift !== 0) {
        // Off the ground (or dipping toward it): the body moves without its soft shadow. Up in a leap,
        // a firm shadow marks the ground under it (the shadow pass); a swooping flyer keeps its own.
        if (mo.lift < 0) {
          const shadow = this.cached(`pfsh|${paint.sheet}|${pose.k}|${paint.key}`, () => toCanvas(splitBuf(pfFrameBuf(paint.sheet, pose.k, paint), 'shadow')));
          ctx.drawImage(shadow, x - px, y - py);
        }
        body = this.cached(`pfbody|${paint.sheet}|${pose.k}|${look.key}|${flash ? 1 : 0}`, () => toCanvas(splitBuf(pfFrameBuf(paint.sheet, pose.k, look, flash), 'body')));
      }
      ctx.globalAlpha = mo.fade;
      cap.globalAlpha = mo.fade;
      ctx.drawImage(body, x + mo.jitter - geo.ox, y - mo.lift - geo.oy, geo.w, geo.h);
      cap.drawImage(frameMask(paint.sheet, pose.k, paint, flash), x + mo.jitter - geo.ox, y - mo.lift - geo.oy, geo.w, geo.h);
      ctx.globalAlpha = 1;
      cap.globalAlpha = 1;
    }
    if (mo.outline) {
      // ...and a crisp red outline (dark-edged, so it reads on any floor) holds round it all the while.
      const og = this.squashGeom(meta.cell + 4, meta.cell + 4, px + 2, py + 2, { x0: box.x0 + 2, y0: box.y0 + 2, x1: box.x1 + 2, y1: box.y1 + 2 }, mo.wide, mo.tall);
      const ol = this.cached(`pfol|${paint.sheet}|${pose.k}`, () => toCanvas(outlineBuf(pfFrameBuf(paint.sheet, pose.k, paint))));
      const olMask = this.cached(`pfolm|${paint.sheet}|${pose.k}`, () => toCanvas(outlineBuf(pfFrameBuf(paint.sheet, pose.k, paint), true)));
      ctx.drawImage(ol, x + mo.jitter - og.ox, y - mo.lift - og.oy, og.w, og.h);
      cap.drawImage(olMask, x + mo.jitter - og.ox, y - mo.lift - og.oy, og.w, og.h);
    }
    const top = y - mo.lift - geo.oy + Math.round(meta.tops[pose.k][0] * (geo.h / meta.cell));
    this.mobTop.set(m.uid, y - top);
    if (pose.stunned) this.stunStars(this.layers.emit.x, x, top - 3);
    // Asleep: a little "z".
    if (!m.awake && Math.floor(this.time * 1.5 + m.uid) % 3 === 0) {
      const z = this.textCanvas('Z', { face: 'small', fill: '#d8e0ff', ink: '#1a1326' });
      ctx.drawImage(z, x + 3, top - 6);
    }
    // An ogre's throw: the rock it tore up, raised over its head.
    if (m.move === 'throw' && (m.windT ?? 0) > 0) this.drawHeldBoulder(ctx, w, m, x, y, top);
    if (mo.tell > 0) this.drawTellMark(x, top, mo.tell);
  }

  /** A PixelForge frame's body box (its soft shadow left out), for squash and stretch. */
  private frameBox(sheet: SheetName, k: number, paint: MobPaint): Box {
    const key = `${sheet}|${k}`;
    let b = this.boxes.get(key);
    if (!b) {
      b = opaqueBox(pfFrameBuf(sheet, k, paint));
      // (Not before the sheet's pixels are in: an empty frame would give the whole cell.)
      if (SHEETS[sheet].ready) this.boxes.set(key, b);
    }
    return b;
  }

  /**
   * Where and how big to draw a `cw` x `ch` sprite pivoting at (px, py) so its body (box) is `wide`
   * pixels wider and `tall` taller, its feet staying put: whole pixels, nearest neighbour.
   */
  private squashGeom(cw: number, ch: number, px: number, py: number, box: Box, wide: number, tall: number): { ox: number; oy: number; w: number; h: number } {
    const kx = Math.max(0.3, (box.x1 - box.x0 + 1 + wide) / (box.x1 - box.x0 + 1));
    const ky = Math.max(0.3, (box.y1 - box.y0 + 1 + tall) / (box.y1 - box.y0 + 1));
    return { ox: Math.round(px * kx), oy: Math.round(py * ky), w: Math.max(1, Math.round(cw * kx)), h: Math.max(1, Math.round(ch * ky)) };
  }

  /**
   * Afterimages: while a mob dashes or leaps, a silhouette of it (in a light tint of its colors) every
   * few hundredths of a second, fading out behind it; on a dash, dust kicked up from its feet.
   */
  private drawTrail(ctx: Ctx, w: World, m: Unit, mo: MobMotion, geo: { ox: number; oy: number; w: number; h: number }, sx: (x: number) => number, sy: (y: number) => number, silhouette: () => HTMLCanvasElement): void {
    let tr = this.trails.get(m.uid);
    if (tr && tr.world !== w) {
      this.trails.delete(m.uid);
      tr = undefined;
    }
    if (mo.trail) {
      if (!tr) this.trails.set(m.uid, (tr = { world: w, dustAt: -9, snaps: [] }));
      const last = tr.snaps[tr.snaps.length - 1];
      if (!last || w.time - last.at >= 0.045) {
        tr.snaps.push({ x: m.x + mo.jitter, y: m.y - mo.lift, ...geo, c: silhouette(), at: w.time });
        if (tr.snaps.length > 4) tr.snaps.shift();
      }
      const r = m.rush;
      if (r && r.kind === 'dash' && !m.flying && w.time - tr.dustAt > 0.045) {
        tr.dustAt = w.time;
        const [dx, dy] = norm(r.x1 - r.x0, r.y1 - r.y0);
        const rnd = (a: number) => (Math.random() * 2 - 1) * a;
        this.particles.push({ ...this.p('dust', m.x - dx * 4 + rnd(2), m.y + rnd(1), Math.random() < 0.5 ? '#c4b8a0' : '#9a8e7a', 0.35), vx: -dx * 24 + rnd(10), vy: -dy * 14 + rnd(5), vz: 10 + Math.random() * 12, size: Math.random() < 0.35 ? 2 : 1 });
      }
    }
    if (!tr) return;
    tr.snaps = tr.snaps.filter((s) => w.time - s.at < 0.2);
    for (const s of tr.snaps) {
      const age = w.time - s.at;
      if (age < 0.03) continue;
      ctx.globalAlpha = Math.round(0.75 * (1 - age / 0.2) * 10) / 10;
      ctx.drawImage(s.c, sx(s.x) - s.ox, sy(s.y) - s.oy, s.w, s.h);
    }
    ctx.globalAlpha = 1;
    if (!tr.snaps.length && !mo.trail) this.trails.delete(m.uid);
  }

  /** The tell over a mob's head as it winds up a lunge or a throw (drawn with the HUD, over the numbers: drawTells). */
  private drawTellMark(x: number, top: number, alpha: number): void {
    this.tells.push({ x, y: top, a: alpha });
  }

  /** The tells queued this frame: a thick red "!" (the huge face) on the HUD layer, so neither the dark nor the numbers hide it. */
  private drawTells(ui: Ctx): void {
    const c = this.textCanvas('!', { face: 'huge', fill: ['#ffffff', '#ffe8e0', '#ffb4a0', '#ff7a60', '#ff5a44', '#ff4a3a', '#e8342a', '#d82a20', '#c8241c'], ink: '#140c14' });
    for (const t of this.tells) {
      ui.globalAlpha = t.a;
      ui.drawImage(c, t.x - Math.floor(c.width / 2), t.y - c.height - 1);
    }
    ui.globalAlpha = 1;
    this.tells.length = 0;
  }

  /** An ogre's throw winding up: the chunk of ground it tears up in front of it, then holds high over its head, shaking. */
  private drawHeldBoulder(ctx: Ctx, w: World, m: Unit, x: number, feet: number, top: number): void {
    const p = 1 - (m.windT ?? 0) / Math.max(0.01, m.windDur ?? 1);
    const c = this.boulderCanvas(w.biome, m.elite ? 15 : 13, 0);
    const up = Math.min(1, p / 0.35);
    const ease = up * up * (3 - 2 * up);
    const low = feet - c.height + 1;
    const high = top - c.height + 3;
    const bx = x + Math.round(m.dir * 7 * (1 - ease));
    const by = Math.round(low + (high - low) * ease) + (p > 0.7 ? (Math.floor(this.time * 30) % 2 ? 1 : 0) : 0);
    ctx.drawImage(c, bx - Math.floor(c.width / 2), by);
  }

  /** A chunk of floor torn up by an ogre, as a canvas, turned by quarter turns as it tumbles. */
  private boulderCanvas(b: Biome, size: number, turn: number): HTMLCanvasElement {
    return this.cached(`boulder|${b.id}|${size}|${turn}`, () => toCanvas(rot90(boulderBuf(b, size), turn)));
  }

  /** A thrown boulder in the air: along its lob from the thrower's hands to the ring, tumbling. */
  private drawFlyingBoulder(ctx: Ctx, w: World, a: Area, sx: (x: number) => number, sy: (y: number) => number): void {
    const flight = Math.max(0.01, a.flight ?? 1);
    const at = boulderAt(a.x0 ?? a.x, a.y0 ?? a.y, a.z0 ?? 30, a.x, a.y, 1 - a.delay / flight);
    const c = this.boulderCanvas(w.biome, a.r >= 20 ? 15 : 13, Math.floor(a.t * 12) % 4);
    ctx.drawImage(c, sx(at.x) - Math.floor(c.width / 2), sy(at.y - at.z) - Math.floor(c.height / 2));
  }

  /**
   * A big move's red indicator on the ground, from the start of its wind-up: a dash or a charge, the
   * lane it will run down (chevrons lighting up along it as the wind-up runs out, white once its aim has
   * locked); a leap or a thrown boulder, the ring where it will come down; a ground slam or a bomber's
   * blast, the ring it will fill; each filling up and pulsing, and staying while the move is under way.
   */
  private drawTell(ctx: Ctx, m: Unit, sx: (x: number) => number, sy: (y: number) => number): void {
    const r = m.rush;
    if (r) {
      const p = Math.min(1, r.t / Math.max(0.01, r.dur));
      if (r.kind === 'leap') this.landingRing(ctx, sx(r.x1), sy(r.y1), r.r, 0.5 + 0.5 * p, true);
      else {
        // The lane it's running down, fading as it goes.
        const [dx, dy] = norm(r.x1 - r.x0, r.y1 - r.y0);
        this.dashLane(ctx, r.x0, r.y0, dx, dy, Math.hypot(r.x1 - r.x0, r.y1 - r.y0), m.r + r.r + 2, 1, true, 1 - p * 0.7, sx, sy);
      }
      return;
    }
    if (!m.windT || m.windT <= 0 || !m.move) return;
    const p = 1 - m.windT / Math.max(0.01, m.windDur ?? m.windT);
    const locked = p >= 0.5;
    switch (m.move) {
      case 'dash':
      case 'charge': {
        const L = lungeOf(m, m.move);
        if (L && m.moveX !== undefined && m.moveY !== undefined) this.dashLane(ctx, m.x, m.y, m.moveX, m.moveY, L.reach, m.r + L.r + 2, p, locked, 1, sx, sy);
        break;
      }
      case 'leap': {
        const L = lungeOf(m, 'leap');
        if (L && m.spotX !== undefined && m.spotY !== undefined) this.landingRing(ctx, sx(m.spotX), sy(m.spotY), L.r, p * 0.5, locked);
        break;
      }
      case 'throw':
        if (m.spotX !== undefined && m.spotY !== undefined) this.landingRing(ctx, sx(m.spotX), sy(m.spotY), lobRadius(m), p * 0.35, locked);
        break;
      case 'slam':
        this.landingRing(ctx, sx(m.x), sy(m.y), m.boss ? BOSS_SLAM_R : SLAM_R, p, p > 0.7);
        break;
      case 'bomb':
        this.landingRing(ctx, sx(m.x), sy(m.y), BOMB_R, p, p > 0.7);
        break;
    }
  }

  /**
   * A dash's lane from (x, y) along (dx, dy): `len` long, `half` wide each side, lit `fill` of the way.
   * The band (a red wash, a hot red edge with a dark rim outside it so it reads on any floor, a bar
   * across its end) is drawn once per heading (64 of them) and length (in 4 px steps), pixel by pixel,
   * and cached; it pulses, stronger as the wind-up fills. Thick chevrons march along it on top, lit as far
   * as the wind-up has come (white once the aim has locked).
   */
  private dashLane(ctx: Ctx, x: number, y: number, dx: number, dy: number, len: number, half: number, fill: number, locked: boolean, alpha: number, sx: (x: number) => number, sy: (y: number) => number): void {
    const dir = ((Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * 64) % 64) + 64) % 64;
    const ang = (dir / 64) * Math.PI * 2;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const L = Math.max(8, Math.round(len / 4) * 4);
    const H = Math.max(3, Math.round(half));
    const band = this.cached(`lane|${dir}|${L}|${H}`, () => laneBand(ux, uy, L, H));
    const o = Math.floor(band.width / 2);
    const pulse = Math.floor(this.time * (locked ? 12 : 8)) % 2 ? 1 : 0.78;
    ctx.globalAlpha = Math.min(1, (0.6 + 0.4 * fill) * pulse) * alpha;
    ctx.drawImage(band, sx(x) - o, sy(y) - o);
    const nx = -uy;
    const ny = ux;
    const step = 8;
    const shift = (this.time * 36) % step;
    const arm = Math.min(5, Math.max(2, Math.round(H * 0.55)));
    for (let s = 6 + shift; s < L - 2; s += step) {
      const lit = s / L <= fill;
      ctx.fillStyle = lit ? (locked ? '#ffffff' : '#ffd0c4') : '#ff4a36';
      ctx.globalAlpha = (lit ? 1 : 0.5) * alpha;
      for (let k = 0; k <= arm; k++) {
        for (const back of [0, 1]) {
          const tx = x + ux * (s - back);
          const ty = y + uy * (s - back);
          ctx.fillRect(sx(tx - ux * k + nx * k), sy(ty - uy * k + ny * k), 1, 1);
          ctx.fillRect(sx(tx - ux * k - nx * k), sy(ty - uy * k - ny * k), 1, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Where something comes down (a leap, a boulder, a blast): a ring of strong red two pixels thick with a
   * dark rim outside it (it reads on snow, sand, lava and moss alike), filling `fill` of the way from the
   * middle, pulsing (faster and white inside once `locked`), a cross on the spot.
   */
  private landingRing(ctx: Ctx, x: number, y: number, r: number, fill: number, locked: boolean): void {
    const pulse = Math.floor(this.time * (locked ? 12 : 8)) % 2 ? 1 : 0.75;
    ctx.fillStyle = '#ff3a2a';
    this.ellipse(ctx, x, y, Math.round(r * fill), Math.round(r * fill * 0.6), 0.38 * pulse);
    this.ring(ctx, x, y, r + 1, '#3a0408', 0.9);
    this.ring(ctx, x, y, r, '#ff2e1e', pulse);
    this.ring(ctx, x, y, r - 1, locked ? '#ffffff' : '#ff5a44', (locked ? 0.85 : 0.6) * pulse);
    ctx.fillStyle = locked ? '#ffffff' : '#ffb4a4';
    ctx.globalAlpha = 0.95;
    ctx.fillRect(x - 3, y, 7, 1);
    ctx.fillRect(x, y - 2, 1, 5);
    ctx.globalAlpha = 1;
  }

  /**
   * A perfect roll: the knight flashes bright for a beat, and an afterimage of it stays where the hit
   * went through it, fading (drawn over the knight from its pose; the knight's own drawing is left
   * alone). The flash is drawn crisp on the unlit top layer (no glow).
   */
  private drawPerfects(st: Ctx, top: Ctx, w: World, sx: (x: number) => number, sy: (y: number) => number): void {
    this.perfects = this.perfects.filter((p) => p.world === w && this.time - p.at < 0.4);
    for (const p of this.perfects) {
      const h = w.heroes.find((u) => u.uid === p.uid);
      const pose = h ? this.heroPoses.get(h.uid) : undefined;
      if (!h || !pose) continue;
      const paint = knightPaint(h.knightId!, h.mutation ?? null, paintStep(h.rarity!, this.time));
      const [px, py] = SHEETS[paint.sheet].meta.pivot;
      const c = frameCanvas(paint.sheet, pose.k, paint, true, pose.anim, pose.dir);
      const age = this.time - p.at;
      st.globalAlpha = Math.round(Math.max(0, 0.6 * (1 - age / 0.4)) * 10) / 10;
      st.drawImage(c, sx(p.x) - px, sy(p.y) - py);
      st.globalAlpha = 1;
      if (age < (p.big ? 0.12 : 0.07)) {
        top.globalAlpha = 0.8;
        top.drawImage(c, sx(h.x) - px, sy(h.y) - py);
        top.globalAlpha = 1;
      }
    }
  }

  /** A PixelForge mob playing out its death after the sim has let it go, then fading; a poof where its sheet has one. */
  private drawCorpse(ctx: Ctx, w: World, c: Renderer['corpses'][number], sx: (x: number) => number, sy: (y: number) => number): void {
    const ms = (w.time - c.at) * 1000;
    const d = deathPose(c.paint.monster, c.paint.sheet, c.dir, ms);
    if (!d) {
      this.corpses = this.corpses.filter((o) => o !== c);
      return;
    }
    if (!c.poofed && ms >= deathPoofMs(c.paint.monster, c.paint.sheet)) {
      c.poofed = true;
      // PixelForge's own: a skeleton crumbles, the rest go up in a puff (a boss in three); the
      // packs' monsters end on the floor by themselves.
      const name: SheetName | null = deathFx(c.paint.monster);
      const spots: Array<[number, number]> = c.boss ? [[0, 0], [-12, -10], [12, -14]] : [[0, 0]];
      if (name) for (const [dx, dy] of spots) this.pfFx.push({ name, x: c.x + dx, y: c.y + dy, at: w.time, world: w });
    }
    const [px, py] = SHEETS[c.paint.sheet].meta.pivot;
    ctx.globalAlpha = d.alpha;
    ctx.drawImage(frameCanvas(c.paint.sheet, d.k, c.paint, false), sx(c.x) - px, sy(c.y) - py);
    ctx.globalAlpha = 1;
    const cap = this.layers.cap.x;
    cap.globalAlpha = d.alpha;
    cap.drawImage(frameMask(c.paint.sheet, d.k, c.paint, false), sx(c.x) - px, sy(c.y) - py);
    cap.globalAlpha = 1;
  }

  private drawMobLegacy(ctx: Ctx, w: World, m: Unit, sx: (x: number) => number, sy: (y: number) => number): void {
    const t = m.type!;
    if (m.dead) {
      // A quick puff of fading.
      return;
    }
    // A dash runs its walk fast; a leap holds its strike pose in the air.
    const r = m.rush;
    let pose: MobPose = m.windT && m.windT > 0 ? 'wind' : r?.kind === 'leap' ? 'strike' : m.swingT > 0 ? 'strike' : m.moving || r ? 'walk' : 'idle';
    const n = poseFrames(t, pose);
    const frame = pose === 'walk' ? Math.floor(m.animT * (r ? 16 : 8)) % n : pose === 'idle' ? Math.floor(m.animT * 3) % n : 0;
    if (!m.awake) pose = 'idle';
    const flip = m.dir < 0;
    const mo = mobMotion(m, w.time);
    // A hit flashes it white; through a wind-up it pulses red (and a red outline holds round it, below).
    const white = m.hurtT > 0.1;
    const red = !white && mo.warn;
    const key = `m|${t.id}|${pose}|${frame}|${m.elite ? 1 : 0}|${m.boss ? 1 : 0}|${white ? 1 : red ? 2 : 0}|${flip ? 1 : 0}`;
    const c = this.cached(key, () => {
      const fr = mobFrame(t, pose, frame, 'down', !!m.elite, !!m.boss);
      this.mobMeta.set(key, { ax: fr.ax, ay: fr.ay });
      let b = white ? flash(fr.buf, '#ffffff') : red ? warnTint(fr.buf) : fr.buf;
      if (flip) b = flipX(b);
      return toCanvas(b);
    });
    let meta = this.mobMeta.get(key);
    if (!meta) {
      const f = mobFrame(t, pose, frame, 'down', !!m.elite, !!m.boss);
      meta = { ax: f.ax, ay: f.ay };
      this.mobMeta.set(key, meta);
    }
    const ax = flip ? c.width - 1 - meta.ax : meta.ax;
    const ay = meta.ay;
    const hover = m.flying ? Math.round(Math.sin(m.animT * 3) * 1.5) - 3 : 0;
    // Elites shine in their mob's brightest color.
    if (m.elite) {
      ctx.fillStyle = mixHex(t.ramp[3], '#ffffff', 0.3);
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(this.time * 6);
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2 + this.time;
        ctx.fillRect(sx(m.x) + Math.round(Math.cos(ang) * (m.r + 3)), sy(m.y) - 1 + Math.round(Math.sin(ang) * 2), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    // The same generic motion as PixelForge's monsters: squash and stretch about the feet, lifted off
    // its shadow (drawn on the ground), afterimages behind.
    const geo = this.squashGeom(c.width, c.height, ax, ay, { x0: 0, y0: 0, x1: c.width - 1, y1: c.height - 1 }, mo.wide, mo.tall);
    const tint = mixHex(t.ramp[3], '#d4e6ff', 0.5);
    const hy = sy(m.y) + hover;
    this.drawTrail(ctx, w, m, mo, geo, sx, (y) => sy(y) + hover, () =>
      this.cached(`${key}|sil|${tint}`, () => {
        const fr = mobFrame(t, pose, frame, 'down', !!m.elite, !!m.boss);
        const b = flash(fr.buf, tint);
        return toCanvas(flip ? flipX(b) : b);
      }),
    );
    ctx.globalAlpha = (m.awake ? 1 : 0.92) * mo.fade;
    if (isStill(mo)) ctx.drawImage(c, sx(m.x) - ax, hy - ay);
    else ctx.drawImage(c, sx(m.x) + mo.jitter - geo.ox, hy - mo.lift - geo.oy, geo.w, geo.h);
    ctx.globalAlpha = 1;
    if (mo.outline) {
      const okey = `m|${t.id}|${pose}|${frame}|${m.elite ? 1 : 0}|${m.boss ? 1 : 0}|${flip ? 1 : 0}`;
      const ol = this.cached(`${okey}|ol`, () => {
        const fr = mobFrame(t, pose, frame, 'down', !!m.elite, !!m.boss);
        return toCanvas(outlineBuf(flip ? flipX(fr.buf) : fr.buf));
      });
      const og = this.squashGeom(ol.width, ol.height, ax + 2, ay + 2, { x0: 2, y0: 2, x1: c.width + 1, y1: c.height + 1 }, mo.wide, mo.tall);
      ctx.drawImage(ol, sx(m.x) + mo.jitter - og.ox, hy - mo.lift - og.oy, og.w, og.h);
    }
    const top = hy - mo.lift - geo.oy;
    this.mobTop.set(m.uid, sy(m.y) - top);
    // Asleep: a little "z".
    if (!m.awake && Math.floor(this.time * 1.5 + m.uid) % 3 === 0) {
      const z = this.textCanvas('Z', { face: 'small', fill: '#d8e0ff', ink: '#1a1326' });
      ctx.drawImage(z, sx(m.x) + 3, top - 2);
    }
    if (mo.tell > 0) this.drawTellMark(sx(m.x), top, mo.tell);
  }

  private drawPickup(ctx: Ctx, kind: 'gold' | 'potion' | 'hourglass', x: number, y: number): void {
    const key = `pick|${kind}|${Math.floor(this.time * 8) % 4}`;
    const c = this.cached(key, () => {
      const cv = makeCanvas(7, 7) as HTMLCanvasElement;
      const g = cv.getContext('2d')!;
      const f = Math.floor(this.time * 8) % 4;
      if (kind === 'gold') {
        const wid = [5, 3, 1, 3][f];
        g.fillStyle = '#7a4a10';
        g.fillRect(3 - Math.floor(wid / 2) - 1, 1, wid + 2, 5);
        g.fillStyle = '#f5c638';
        g.fillRect(3 - Math.floor(wid / 2), 1, wid, 5);
        g.fillStyle = '#fff28c';
        g.fillRect(3 - Math.floor(wid / 2), 1, 1, 2);
      } else if (kind === 'potion') {
        g.fillStyle = '#1a1326';
        g.fillRect(1, 2, 5, 5);
        g.fillRect(2, 0, 3, 2);
        g.fillStyle = '#5dc14c';
        g.fillRect(2, 3, 3, 3);
        g.fillStyle = '#b0ec6c';
        g.fillRect(2, 3, 1, 1);
        g.fillStyle = '#c8b090';
        g.fillRect(3, 1, 1, 1);
      } else {
        g.fillStyle = '#1a1326';
        g.fillRect(1, 0, 5, 7);
        g.fillStyle = '#ffd84a';
        g.fillRect(2, 1, 3, 1);
        g.fillRect(3, 2, 1, 1);
        g.fillRect(2, 5, 3, 1);
        g.fillStyle = '#c8e0ff';
        g.fillRect(2, 3, 3, 1);
      }
      return cv;
    });
    ctx.drawImage(c, x - 3, y - 6);
  }

  /** What this shot is, if a PixelForge boss threw it: the Stone Warden's shard, the Cinderwyrm's fireball, Rook's blood crescent (else null). */
  private bossShot(w: World, s: Shot): BossShotFx | null {
    // (Its plain shots: one of the kinds with a way of flying of its own is drawn as that kind.)
    if (s.team !== 'mob' || s.kind !== 'bullet' || s.b) return null;
    const m = w.bossUnit && w.bossUnit.uid === s.from ? w.bossUnit : null;
    const monster = m ? mobPaint(m.type!, !!m.elite, true)?.monster : undefined;
    return monster === 'stone_warden' ? 'fx_rock_shard' : monster === 'cinderwyrm' ? 'fx_fireball' : monster === 'rook' ? 'fx_blood_crescent' : null;
  }

  /** A boss's shot as PixelForge draws it (a spinning stone, a fireball, a crescent), turned to its flight (whole quarter turns). */
  private drawRockShard(ctx: Ctx, s: Shot, sx: (x: number) => number, sy: (y: number) => number, name: BossShotFx): void {
    const sheet = SHEETS[name];
    const dir = facing(s.vx, s.vy);
    const f = sheet.clip('travel', dir);
    const i = Math.floor((this.time * 1000) / f[0][1]) % f.length;
    const [px, py] = sheet.meta.anims.travel.pivots?.[dir] ?? sheet.meta.pivot;
    ctx.drawImage(frameCanvas(name, f[i][0], NO_PAINT), sx(s.x) - px, sy(s.y) - py);
  }

  private drawArea(ctx: Ctx, top: Ctx, a: Area, sx: (x: number) => number, sy: (y: number) => number): void {
    const x = sx(a.x);
    const y = sy(a.y);
    const danger = a.team === 'mob';
    const col = danger ? '#ff4a3a' : a.color;
    if (a.kind === 'boulder' && a.delay > 0) {
      // A boulder on its way down: its shadow growing on the spot as it falls, inside the ring where it lands.
      const p = Math.max(0, Math.min(1, 1 - a.delay / Math.max(0.01, a.flight ?? 1)));
      const sr = Math.max(1, Math.round(a.r * (0.15 + 0.5 * p * p)));
      ctx.fillStyle = '#0c0812';
      this.ellipse(ctx, x, y, sr, Math.max(1, Math.round(sr * 0.6)), 0.3 + 0.35 * p);
      this.landingRing(ctx, x, y, a.r, 0.35 + 0.65 * p, p > 0.55);
      return;
    }
    if (a.kind === 'rubble') {
      // What's left of a boulder: chips of stone round the spot, fading.
      ctx.globalAlpha = Math.min(1, a.dur / 0.5);
      for (let i = 0; i < 9; i++) {
        const ang = i * 2.39 + (a.uid % 7);
        const d = ((i % 3) + 1) * a.r * 0.32;
        ctx.fillStyle = i % 3 === 0 ? '#2a2420' : i % 3 === 1 ? '#6a645c' : '#9a948a';
        ctx.fillRect(x + Math.round(Math.cos(ang) * d), y + Math.round(Math.sin(ang) * d * 0.6), i % 4 === 0 ? 2 : 1, 1);
      }
      ctx.globalAlpha = 1;
      return;
    }
    if (a.delay > 0 && danger) {
      // A foe's blast coming (a caster's circle, a boss's rain): the same strong red ring as every
      // other warning, filling as it counts down.
      const t = Math.max(0, Math.min(1, 1 - a.delay / Math.max(0.3, a.delay + a.t)));
      this.landingRing(ctx, x, y, a.r, t, t > 0.6);
      return;
    }
    if (a.delay > 0) {
      // A telegraph: a ring that fills in as it counts down.
      const total = a.kind === 'meteor' ? 0.9 : a.kind === 'rain' ? 0.25 : 1;
      const t = Math.max(0, Math.min(1, 1 - a.delay / total));
      this.ring(ctx, x, y, a.r, col, 0.8);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = col;
      this.ellipse(ctx, x, y, Math.round(a.r * t), Math.round(a.r * t * 0.6));
      ctx.globalAlpha = 1;
      // The meteor itself, falling; the Singularity's vortex (spells.ts).
      this.spells.drawArea(a, top, x, y);
      return;
    }
    if (a.kind === 'snare') return this.drawSnare(ctx, x, y, a);
    if (a.kind === 'bless') return this.drawBless(ctx, x, y, a);
    if (a.kind === 'sanctuary' || a.kind === 'glow') {
      this.ring(ctx, x, y, a.r, '#fff0a0', 0.6 + 0.2 * Math.sin(this.time * 5));
    } else if (a.kind === 'fire') {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ff6a2a';
      this.ellipse(ctx, x, y, a.r, Math.round(a.r * 0.6));
      ctx.globalAlpha = 1;
      if (Math.random() < 0.5) this.particles.push(this.p('ember', a.x + (Math.random() - 0.5) * a.r * 2, a.y + (Math.random() - 0.5) * a.r, '#ff9a3a', 0.6));
    } else if (a.kind === 'rain') {
      this.ring(ctx, x, y, a.r, '#e8e0c8', 0.5);
      for (let k = 0; k < 3; k++) {
        const px = x + Math.round((Math.random() - 0.5) * a.r * 2);
        const py = y + Math.round((Math.random() - 0.5) * a.r * 1.2);
        ctx.fillStyle = '#e8e0c8';
        ctx.fillRect(px, py - 6, 1, 5);
      }
    }
  }

  /**
   * A Ranger's snare (world/dash.ts), lying open: an iron ring with its teeth turned in, a trip plate
   * in the middle and a rope off to the side; a tooth glints now and then. Crisp, on the ground.
   */
  private drawSnare(ctx: Ctx, x: number, y: number, a: Area): void {
    const rx = Math.round(a.r);
    const ry = Math.max(2, Math.round(a.r * 0.55));
    // Its last second: it flickers out.
    if (a.dur < 1 && Math.floor(this.time * 12) % 2) return;
    ctx.fillStyle = '#7a5a34';
    for (let i = 1; i <= 4; i++) ctx.fillRect(x + rx + i, y + 1 + (i >> 1), 1, 1);
    const n = Math.max(16, rx * 4);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const px = x + Math.round(Math.cos(ang) * rx);
      const py = y + Math.round(Math.sin(ang) * ry);
      ctx.fillStyle = '#1e161c';
      ctx.fillRect(px, py + 1, 1, 1);
      ctx.fillStyle = i % 2 ? '#5a5260' : '#8a8294';
      ctx.fillRect(px, py, 1, 1);
    }
    const glint = Math.floor(this.time * 3 + a.uid) % 10;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const tx = x + Math.round(Math.cos(ang) * (rx - 2));
      const ty = y + Math.round(Math.sin(ang) * (ry - 1));
      ctx.fillStyle = i === glint ? '#ffffff' : '#d8d0c0';
      ctx.fillRect(tx, ty, 1, 1);
    }
    ctx.fillStyle = '#2a2026';
    ctx.fillRect(x - 2, y - 1, 5, 3);
    ctx.fillStyle = '#a08a5a';
    ctx.fillRect(x - 1, y - 1, 3, 2);
  }

  /**
   * A Cleric's Blessed Step (world/dash.ts): a holy circle on the ground, its rim turning, small
   * crosses of light rising inside it; it thins out as it ends. Crisp: it lights nothing.
   */
  private drawBless(ctx: Ctx, x: number, y: number, a: Area): void {
    const rx = Math.round(a.r);
    const ry = Math.max(2, Math.round(a.r * 0.6));
    const ending = a.dur < 0.5;
    const n = Math.max(24, rx * 4);
    const turn = Math.floor(this.time * 18);
    for (let i = 0; i < n; i++) {
      if ((i + turn) % 4 === 0 || (ending && i % 2)) continue;
      const ang = (i / n) * Math.PI * 2;
      ctx.fillStyle = (i + turn) % 4 === 1 ? '#ffffff' : '#fff2b8';
      ctx.fillRect(x + Math.round(Math.cos(ang) * rx), y + Math.round(Math.sin(ang) * ry), 1, 1);
      if (i % 3 === 0) {
        ctx.fillStyle = '#e8c870';
        ctx.fillRect(x + Math.round(Math.cos(ang) * (rx - 3)), y + Math.round(Math.sin(ang) * (ry - 2)), 1, 1);
      }
    }
    // Crosses of light rising from inside, each on its own beat.
    for (let k = 0; k < 4; k++) {
      const u = (this.time * 0.9 + k * 0.25 + (a.uid % 7) * 0.13) % 1;
      if (ending && k % 2) continue;
      const ang = k * 1.9 + (a.uid % 5);
      const cx = x + Math.round(Math.cos(ang) * rx * 0.55);
      const cy = y + Math.round(Math.sin(ang) * ry * 0.55) - Math.round(u * 10);
      ctx.fillStyle = u < 0.6 ? '#ffffff' : '#fff2b8';
      ctx.fillRect(cx, cy - 1, 1, 3);
      ctx.fillRect(cx - 1, cy, 3, 1);
    }
  }

  private ring(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const n = Math.max(12, Math.round(r * 2.5));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.fillRect(x + Math.round(Math.cos(a) * r), y + Math.round(Math.sin(a) * r * 0.6), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** The way down's archway: the doorway (vortex, or dark behind the portcullis), the frame, its rim light, and its stones flaring as the squad goes through. */
  private doorAnim: { world: World | null; open: boolean; at: number } = { world: null, open: false, at: -1 };
  private doorCanvas(key: string, buf: PixelBuf): HTMLCanvasElement {
    return this.cached(`door|${key}`, () => toCanvas(buf));
  }
  private drawDoor(st: Ctx, em: Ctx, w: World, sx: (x: number) => number, sy: (y: number) => number, lead: Unit | null): void {
    const art = doorArt();
    const a = this.doorAnim;
    // A floor that starts open shows it open; one that opens while you watch winds its portcullis up.
    if (a.world !== w) {
      a.world = w;
      a.open = w.portalOpen;
      a.at = w.portalOpen ? -1e9 : -1;
    }
    if (w.portalOpen && !a.open) {
      a.open = true;
      a.at = this.time;
    }
    const lift = !w.portalOpen ? 0 : Math.min(1, (this.time - a.at) / 1.2);
    const x = sx(w.map.exit.x) - DOOR_AX;
    const y = sy(w.map.exit.y + 8) - DOOR_AY;
    // Your knight behind it: the arch turns see-through.
    const behind = !!lead && lead.y < w.map.exit.y - 8 && lead.y > w.map.exit.y - 70 && Math.abs(lead.x - w.map.exit.x) < 30;
    st.globalAlpha = behind ? 0.45 : 1;
    const fr = Math.floor(this.doorTurn) % DOOR_FRAMES;
    const vortex = Math.max(0, Math.min(1, (lift - 0.35) / 0.65));
    if (vortex < 1) st.drawImage(this.doorCanvas('sealed', art.sealed.buf), x, y);
    if (vortex > 0) {
      st.globalAlpha *= vortex;
      st.drawImage(this.doorCanvas(`open${fr}`, art.open[fr].buf), x, y);
      st.globalAlpha = behind ? 0.45 : 1;
      em.globalAlpha = vortex * (behind ? 0.45 : 1);
      em.drawImage(this.doorCanvas(`open${fr}g`, art.open[fr].glow), x, y);
      em.globalAlpha = 1;
    }
    if (lift < 1) {
      const k = Math.round(lift * BAR_STEPS);
      st.drawImage(this.doorCanvas(`bars${k}`, art.bars[k].buf), x, y);
    }
    st.drawImage(this.doorCanvas('frame', art.frame.buf), x, y);
    if (vortex > 0) {
      st.globalAlpha *= vortex;
      st.drawImage(this.doorCanvas('rim', art.rim.buf), x, y);
      st.globalAlpha = behind ? 0.45 : 1;
      em.globalAlpha = vortex;
      em.drawImage(this.doorCanvas('rimg', art.rim.glow), x, y);
      em.globalAlpha = 1;
      // Going through it: the inner ring's stones all flare at once as the portal takes the squad,
      // stay lit while it swirls in, and flare again as the eye bursts (warpFx.ts).
      const glow = this.warpFx.doorGlow(w);
      if (glow) {
        const piece = art[glow];
        st.drawImage(this.doorCanvas(glow, piece.buf), x, y);
        // (The flare glows less than it shines, so the white-hot stones stay crisp.)
        em.globalAlpha = glow === 'flare' ? 0.55 : 1;
        em.drawImage(this.doorCanvas(`${glow}g`, piece.glow), x, y);
        em.globalAlpha = 1;
      }
      // Sparks drifting out of the doorway (while it pulls the squad in, they stream in instead).
      if (!w.warp && Math.random() < 0.35 * vortex) {
        const px = w.map.exit.x - DOOR_AX + DOOR_OPENING.x + 2 + Math.random() * (DOOR_OPENING.w - 4);
        const py = w.map.exit.y + 8 - DOOR_AY + DOOR_OPENING.y + DOOR_OPENING.h * (0.35 + Math.random() * 0.6);
        this.particles.push(this.p('mote', px, py, Math.random() < 0.5 ? '#ffe484' : '#ffc040', 1.3, -14));
      }
    }
    st.globalAlpha = 1;
  }

  /** A ware on its table: the ware floating over it (bobbing, glowing), its price on a tag underneath. */
  private drawWare(st: Ctx, em: Ctx, ui: Ctx, wa: Ware, sx: (x: number) => number, sy: (y: number) => number, near: boolean, afford: boolean): void {
    const x = sx(wa.x);
    const y = sy(wa.y);
    const table = this.cached('ware|table', () => toCanvas(wareTable()));
    st.fillStyle = 'rgba(8,6,16,0.35)';
    this.ellipse(st, x, y, 8, 2);
    st.drawImage(table, x - (table.width >> 1), y - table.height + 1);
    const icon = this.cached(`ware|${wa.item}`, () => toCanvas(wareIcon(RUN_ITEMS[wa.item].icon)));
    const bob = Math.round(Math.sin(this.time * 2.6 + wa.uid * 1.7) * 1.5);
    const ix = x - (icon.width >> 1);
    const iy = y - table.height - icon.height - 1 + bob;
    // A warm glow under it (brighter while you stand at it).
    em.globalAlpha = near ? 0.75 : 0.4;
    em.fillStyle = '#ffd27a';
    this.ellipse(em, x, y - table.height - 1, near ? 7 : 5, 2);
    em.globalAlpha = 1;
    st.drawImage(icon, ix, iy);
    if (near) {
      em.globalAlpha = 0.35;
      em.drawImage(icon, ix, iy);
      em.globalAlpha = 1;
    }
    // The tag: a coin and the price (red while you can't afford it), on the unlit top layer.
    const tag = this.textCanvas(String(wa.price), { face: 'small', fill: afford ? (near ? '#fff4c0' : '#ffd86a') : '#ff8a7a', ink: '#1a1326' });
    const coin = this.cached('ware|coin', () => toCanvas(tagCoin()));
    const tw = coin.width + 1 + tag.width;
    const tx = x - (tw >> 1);
    const ty = y + 2;
    ui.drawImage(coin, tx, ty + Math.round((tag.height - coin.height) / 2));
    ui.drawImage(tag, tx + coin.width + 1, ty);
  }

  private drawLiquidShimmer(ctx: Ctx, w: World, cx: number, cy: number): void {
    const liq = w.biome.liquid;
    if (!liq || !this.terrain) return;
    const hi = liq.ramp[liq.ramp.length - 1];
    ctx.fillStyle = hi;
    for (const t of this.terrain.liquid) {
      if (t.x < cx - 16 || t.y < cy - 16 || t.x > cx + this.W + 16 || t.y > cy + this.H + 16) continue;
      const ph = (t.x * 13 + t.y * 7) % 100;
      const k = Math.floor(this.time * 2 + ph) % 5;
      if (k > 1) continue;
      const ox = ((ph * 3) % 10) - 5 + k * 2;
      const oy = ((ph * 7) % 10) - 5;
      ctx.globalAlpha = liq.kind === 'lava' ? 0.9 : 0.55;
      ctx.fillRect(t.x - cx + ox, t.y - cy + oy, 3, 1);
    }
    ctx.globalAlpha = 1;
  }

  private fogC: HTMLCanvasElement | null = null;
  private drawFog(ctx: Ctx, color: string, cx: number, cy: number): void {
    if (!this.fogC) {
      const s = 128;
      const c = makeCanvas(s, s) as HTMLCanvasElement;
      const g = c.getContext('2d')!;
      const img = g.createImageData(s, s);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        let v = 0;
        for (const [f, a] of [[1, 0.6], [2, 0.3], [4, 0.1]] as const) v += a * (0.5 + 0.5 * Math.sin(((x * f) / s) * Math.PI * 2 + Math.sin(((y * f) / s) * Math.PI * 2) * 1.5));
        const q = Math.round(Math.max(0, v - 0.45) * 2 * 4) / 4;
        const i = (y * s + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(q * 255);
      }
      g.putImageData(img, 0, 0);
      this.fogC = c;
    }
    ctx.save();
    ctx.globalAlpha = 0.16;
    const tint = this.cached(`fog|${color}`, () => {
      const c = makeCanvas(128, 128) as HTMLCanvasElement;
      const g = c.getContext('2d')!;
      g.drawImage(this.fogC!, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, 128, 128);
      return c;
    });
    const ox = -((Math.floor(cx * 0.6 + this.time * 6) % 128) + 128) % 128;
    const oy = -((Math.floor(cy * 0.6) % 128) + 128) % 128;
    ctx.globalCompositeOperation = 'screen';
    for (let y = oy; y < this.LH; y += 128) for (let x = ox; x < this.LW; x += 128) ctx.drawImage(tint, x, y);
    ctx.restore();
  }

  // ------------------------------------------------------------------ lights

  private collectLights(w: World, biome: Biome, cx: number, cy: number, sx: (x: number) => number, sy: (y: number) => number): Light[] {
    const out: Light[] = [];
    if (w.hub && this.hubPaint) out.push(...this.hubPaint.lights(cx, cy, this.W, this.H, this.time));
    const flick = (seed: number) => 0.85 + 0.15 * Math.sin(this.time * 9 + seed) * Math.sin(this.time * 13.7 + seed * 2);
    // Lamps and fires hardly show in broad daylight; under cloud a little more; at night in full.
    const [lr, lg, lb] = rgb(ambientOf(biome, w.sky));
    const dayLum = (lr * 0.299 + lg * 0.587 + lb * 0.114) / 255;
    const lampK = Math.max(0.3, Math.min(1, (0.95 - dayLum) * 2.4));
    for (const p of this.props) {
      const l = p.art.light;
      if (!l) continue;
      const x = p.x + l.dx;
      const y = p.y + l.dy;
      if (x < cx - 80 || x > cx + this.W + 80 || y < cy - 80 || y > cy + this.H + 80) continue;
      const f = l.flicker ? flick(p.seed % 100) : 1;
      out.push({ x: x - cx, y: y - cy, r: l.r * (0.95 + 0.05 * f) * (0.75 + 0.25 * lampK), color: l.color, intensity: 0.95 * f * lampK, bloom: lampK > 0.6 });
    }
    for (const g of this.terrain!.glows) {
      if (g.x < cx - 60 || g.x > cx + this.W + 60 || g.y < cy - 60 || g.y > cy + this.H + 60) continue;
      out.push({ x: g.x - cx, y: g.y - cy, r: g.r, color: g.color, intensity: 0.7 + 0.1 * Math.sin(this.time * 2 + g.x), bloom: (g.x + g.y) % 48 === 0 });
    }
    // The squad carries a little light; in bright places hardly any (it would wash the scene out).
    const [ar, ag, ab] = rgb(biome.light.ambient);
    const ambLum = (ar * 0.299 + ag * 0.587 + ab * 0.114) / 255;
    // (At the hub the shop lights the court: a knight there carries less.)
    const carry = Math.max(0.06, Math.min(0.75, (0.72 - ambLum) * 1.5)) * (w.hub ? 0.55 : 1);
    // (Not while a portal pulls the squad in: the portal's light is theirs then.)
    for (const h of w.warp ? [] : w.heroes) {
      if (h.downed) continue;
      const mine = h.slot === w.controlled;
      out.push({ x: sx(h.x), y: sy(h.y) - 6, r: biome.light.heroRadius * (mine ? 1.2 : 0.9), color: biome.light.hero, intensity: carry * (mine ? 1 : 0.7) });
      let glow: string | null;
      let orb: string;
      if (pfReady()) {
        const paint = knightPaint(h.knightId!, h.mutation ?? null, paintStep(h.rarity!, this.time));
        glow = paint.glow;
        orb = paint.recolor.accent?.[1] ?? '#b08aff';
      } else {
        const L = knightLook(h.knightId!, h.mutation ?? null, h.rarity === 'primordial' ? this.time : 0);
        glow = knightGlow(L);
        orb = L.plume[2];
      }
      if (glow) out.push({ x: sx(h.x), y: sy(h.y) - 8, r: 16, color: glow, intensity: 0.2 + carry * 0.3, bloom: true });
      if (h.cls === 'arcanist') out.push({ x: sx(h.x) + h.dir * 4, y: sy(h.y) - 16, r: 10, color: orb, intensity: 0.35, bloom: true });
    }
    if (this.ambient) for (const l of this.ambient.lights(cx, cy, this.W, this.H, this.time)) out.push(l);
    for (const a of w.areas) {
      if (a.kind === 'fire' || (a.kind === 'meteor' && a.delay < 0.4)) out.push({ x: sx(a.x), y: sy(a.y), r: a.r * 1.6, color: '#ff7a2a', intensity: 0.9, bloom: true });
      else if (a.kind === 'sanctuary') out.push({ x: sx(a.x), y: sy(a.y), r: a.r * 1.4, color: '#fff0a0', intensity: 0.7, bloom: true });
      else if (a.delay > 0 && a.team === 'mob') out.push({ x: sx(a.x), y: sy(a.y), r: a.r * 1.2, color: '#ff4a3a', intensity: 0.5 });
    }
    // (A glob's landing ring lights its spot a little, as a lunge's does: it reads in the dark.)
    for (const s of w.shots) if (s.b && s.b.form === 'glob') out.push({ x: sx(s.b.tx), y: sy(s.b.ty), r: s.b.ring * 1.8, color: '#ff4a3a', intensity: 0.4 });
    for (const m of w.mobs) {
      if (m.dead) continue;
      // PixelForge monsters light the dark with their glow eyes' color (a Stone Warden's core).
      const pfEye = pfReady() ? mobPaint(m.type!, !!m.elite, !!m.boss, (m.bossPhase ?? 0) > 0)?.recolor.eyes?.[0] : undefined;
      if (m.elite || m.boss) out.push({ x: sx(m.x), y: sy(m.y) - (m.boss && pfEye ? 24 : 8), r: m.boss ? 46 : 22, color: pfEye ?? m.type!.ramp[3], intensity: pfEye ? 0.45 : 0.55, bloom: m.boss });
      else if (m.type!.plan === 'flyer' && /Wisp|Spirit/.test(m.type!.name)) out.push({ x: sx(m.x), y: sy(m.y) - 8, r: 18, color: m.type!.ramp[3], intensity: 0.8, bloom: true });
      else if (m.type!.plan === 'golem') out.push({ x: sx(m.x), y: sy(m.y) - 10, r: 14, color: m.type!.eye, intensity: 0.6, bloom: true });
      // A lunge's tell lights the ground it will cross a little (it reads in the dark).
      const L = (m.windT ?? 0) > 0 ? lungeOf(m, m.move) : undefined;
      if (L && m.move === 'leap' && m.spotX !== undefined && m.spotY !== undefined) out.push({ x: sx(m.spotX), y: sy(m.spotY), r: L.r * 1.6, color: '#ff4a3a', intensity: 0.4 });
      else if (L && (m.move === 'dash' || m.move === 'charge') && m.moveX !== undefined && m.moveY !== undefined) {
        out.push({ x: sx(m.x + (m.moveX * L.reach) / 2), y: sy(m.y + (m.moveY * L.reach) / 2), r: L.reach * 0.55, color: '#ff4a3a', intensity: 0.3 });
      }
    }
    if (!w.hub) {
      // (Brighter while it takes the squad, brightest as it flares.)
      const k = this.warpFx.doorLight(w);
      if (w.portalOpen) out.push({ x: sx(w.map.exit.x), y: sy(w.map.exit.y) - 14, r: 78 * (0.85 + 0.15 * k), color: '#ffc45a', intensity: 1.05 * k, bloom: true });
      else out.push({ x: sx(w.map.exit.x), y: sy(w.map.exit.y) - 14, r: 30, color: '#8a7aa8', intensity: 0.3 });
    }
    // Traps: a red glow on one about to strike (the game's telegraph color), and a fire vent lights
    // the room while it burns.
    for (const tr of w.traps) {
      if (tr.x < cx - 80 || tr.x > cx + this.W + 80 || tr.y < cy - 80 || tr.y > cy + this.H + 120) continue;
      const ph = trapPhase(tr, w.time);
      if (ph.warn) out.push({ x: sx(tr.x), y: sy(tr.y), r: 17, color: '#ff4a3a', intensity: 0.45 + 0.2 * Math.sin(this.time * 18) });
      if (tr.kind !== 'vent' || ph.frame === 0) continue;
      const k = ph.active ? 1 : ph.frame >= 7 ? 0.35 : 0.25;
      out.push({ x: sx(tr.x), y: sy(tr.y) - (ph.active ? 18 : 4), r: ph.active ? 70 : 30, color: biome.light.fire, intensity: 0.9 * k, bloom: ph.active });
    }
    for (const p of this.particles) if (p.glow && !p.unlit) out.push({ x: sx(p.x), y: sy(p.y - p.z), r: p.kind === 'firefly' ? 8 : 6, color: p.color, intensity: Math.min(1, p.life / p.max + 0.2) * 0.7 });
    return out;
  }

  // ------------------------------------------------------------------ particles

  private p(kind: Particle['kind'], x: number, y: number, color: string, life: number, vz = 0): Particle {
    return { x, y, z: 0, vx: 0, vy: 0, vz, life, max: life, color, size: 1, kind, glow: kind === 'ember' || kind === 'firefly' || kind === 'mote' };
  }

  private spawnFx(w: World): void {
    for (const f of w.fx) this.burst(f, w);
    w.fx.length = 0;
  }

  private fx(name: FxName, x: number, y: number, flip = false): void {
    this.fxs.push({ name, x, y, t: 0, flip });
    if (this.fxs.length > 60) this.fxs.shift();
  }

  private advanceFx(dt: number): void {
    for (const f of this.fxs) f.t += dt;
    this.fxs = this.fxs.filter((f) => {
      const s = FX_SHEETS[f.name];
      return f.t < s.anims.play.frames.length / s.anims.play.fps;
    });
  }

  private drawFx(ctx: Ctx, sx: (x: number) => number, sy: (y: number) => number, emissive: boolean): void {
    for (const f of this.fxs) {
      if (EMISSIVE.has(f.name) !== emissive) continue;
      const sheet = FX_SHEETS[f.name];
      const a = sheet.anims.play;
      const i = Math.min(a.frames.length - 1, Math.floor(f.t * a.fps));
      const key = `fx|${f.name}|${i}|${f.flip ? 1 : 0}`;
      const c = this.cached(key, () => {
        const b = frameBuf(sheet, a.frames[i]);
        return toCanvas(f.flip ? flipX(b) : b);
      });
      const ax = f.flip ? sheet.w - 1 - sheet.anchor.x : sheet.anchor.x;
      ctx.drawImage(c, sx(f.x) - ax, sy(f.y) - sheet.anchor.y);
    }
  }

  private burst(f: Fx, w: World): void {
    // A skill with art of its own (spells.ts) plays that instead of a pack effect.
    const own = this.spells.claim(f, w);
    if (own === 'all') return;
    if (!own) this.packFx(f);
    const add = (n: number, make: (i: number) => Particle) => {
      for (let i = 0; i < n; i++) this.particles.push(make(i));
    };
    const rnd = (a: number) => (Math.random() * 2 - 1) * a;
    const col = f.color ?? '#ffffff';
    switch (f.kind) {
      case 'hit':
      case 'crit':
        add(f.kind === 'crit' ? 8 : 4, () => ({ ...this.p('spark', f.x, f.y, Math.random() < 0.5 ? '#ffffff' : col, 0.3), vx: rnd(70), vy: rnd(50), vz: 20 + Math.random() * 30 }));
        if (f.kind === 'crit') this.particles.push({ ...this.p('ring', f.x, f.y, '#ffe27a', 0.25), size: 2 });
        break;
      case 'death':
        add(10 * (f.size ?? 1), () => ({ ...this.p('dust', f.x, f.y, Math.random() < 0.5 ? col : shade(col, -0.4), 0.6), vx: rnd(50), vy: rnd(30), vz: 30 + Math.random() * 40, size: Math.random() < 0.4 ? 2 : 1 }));
        add(4, () => ({ ...this.p('mote', f.x, f.y, '#ffffff', 0.5), vx: rnd(20), vy: rnd(10), vz: 20 }));
        break;
      case 'heal':
        add(3, () => ({ ...this.p('mote', f.x + rnd(5), f.y, '#7dff8a', 0.7), vz: 18 }));
        break;
      case 'dust':
        add(3, () => ({ ...this.p('dust', f.x + rnd(3), f.y, f.color ?? '#a89c88', 0.35), vx: rnd(20), vy: rnd(8), vz: 8 }));
        break;
      case 'blast':
        if (f.src === 'boulder') {
          // The rock bursts: chips of stone flung up and out (they don't glow).
          add(16, (i) => ({ ...this.p('dust', f.x + rnd(3), f.y + rnd(2), i % 3 === 0 ? '#2a2420' : i % 3 === 1 ? '#6a645c' : '#a49e94', 0.55), vx: rnd(70), vy: rnd(40), vz: 40 + Math.random() * 60, size: i % 4 === 0 ? 2 : 1 }));
          break;
        }
        add(14 * Math.min(3, f.size ?? 1), () => ({ ...this.p('ember', f.x, f.y, Math.random() < 0.4 ? '#ffffff' : col, 0.5), vx: rnd(90), vy: rnd(60), vz: 20 + Math.random() * 50 }));
        this.particles.push({ ...this.p('ring', f.x, f.y, col, 0.3), size: Math.round((f.size ?? 1) * 6) });
        break;
      case 'spark':
        add(6, () => ({ ...this.p('mote', f.x + rnd(4), f.y + rnd(4), col, 0.5), vx: rnd(25), vy: rnd(15), vz: 15 }));
        break;
      case 'shock':
        this.particles.push({ ...this.p('ring', f.x, f.y, col, 0.4), size: 20 });
        this.particles.push({ ...this.p('ring', f.x, f.y, '#ffffff', 0.25), size: 10 });
        break;
      // (A skill that slammed down: its stamp flashed the screen and the cast is the flare where its
      // icon landed. Its motes rise crisp and light nothing, and there's no flash: under the dark round
      // the caster either would only haze it over or white it out.)
      case 'levelup':
      case 'revive':
        add(16, (i) => ({ ...this.p('mote', f.x + Math.cos(i) * 8, f.y + Math.sin(i) * 4, f.color ?? '#ffe27a', 1), vz: 22 + Math.random() * 10, unlit: f.src === 'slam' }));
        break;
      case 'portal':
        if (f.src !== 'slam') this.flashT = 0.35;
        add(28, (i) => ({ ...this.p('mote', f.x + Math.cos(i) * 12, f.y - 10 + Math.sin(i) * 14, i % 3 ? '#ffd27a' : '#fff3bc', 1.5), vz: 26 + Math.random() * 20, unlit: f.src === 'slam' }));
        break;
      case 'land': {
        // A lunge comes down: a ring of dust thrown out along the ground, and a shock ring for a big one.
        const k = Math.min(4, f.size ?? 1);
        const n = Math.round(10 + 4 * k);
        add(n, (i) => {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
          const sp = 30 + 14 * k + Math.random() * 18;
          return { ...this.p('dust', f.x + Math.cos(a) * 3, f.y + Math.sin(a) * 2, f.color ?? (i % 3 ? '#c4b8a0' : '#8a7e6c'), 0.42 + Math.random() * 0.15), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.55, vz: 8 + Math.random() * 14, size: i % 3 === 0 ? 2 : 1 };
        });
        this.particles.push({ ...this.p('ring', f.x, f.y, '#e8dcc4', 0.3), size: Math.round(4 + 3 * k) });
        if (k >= 2) this.fx('shock', f.x, f.y);
        break;
      }
      case 'perfect': {
        // A perfect roll: a gold ring and a burst of sparkles round the knight, and its flash (drawPerfects).
        const big = (f.size ?? 1) >= 1;
        this.particles.push({ ...this.p('ring', f.x, f.y, '#fff0a8', big ? 0.32 : 0.22), size: big ? 7 : 5 });
        this.particles.push({ ...this.p('ring', f.x, f.y, '#ffffff', 0.16), size: big ? 3 : 2 });
        const n = big ? 12 : 6;
        add(n, (i) => {
          const a = (i / n) * Math.PI * 2;
          return { ...this.p('mote', f.x, f.y, i % 2 ? '#ffe27a' : '#ffffff', 0.45), vx: Math.cos(a) * (big ? 50 : 34), vy: Math.sin(a) * (big ? 30 : 20), vz: 6 };
        });
        if (big) this.fx('sparkle', f.x, f.y);
        if (f.uid !== undefined) this.perfects.push({ uid: f.uid, x: f.x, y: f.y + 8, at: this.time, world: w, big });
        break;
      }
      case 'coin':
        break;
    }
  }

  /** The pack effects (Will Tice / unTied Games) for a burst, on top of the particles. */
  private packFx(f: Fx): void {
    switch (f.kind) {
      case 'hit':
        this.fx('hit', f.x, f.y, Math.random() < 0.5);
        break;
      case 'crit':
        this.fx(Math.random() < 0.5 ? 'crit' : 'slash', f.x, f.y, Math.random() < 0.5);
        break;
      case 'death':
        if (f.src === 'hero') this.fx('death', f.x, f.y - 6);
        else if (f.src === 'boss') {
          this.fx('levelUp', f.x, f.y - 12);
          this.fx('electric', f.x, f.y - 6);
        } else if (!this.corpses.some((c) => Math.abs(c.x - f.x) < 1 && Math.abs(c.y - 4 - f.y) < 1)) this.fx(f.src === 'slime' ? 'splat' : 'smoke', f.x, f.y - 2);
        // (A PixelForge mob plays its own death, and poofs at its end: drawCorpse.)
        break;
      case 'blast':
        if (f.src === 'slam') this.fx('shock', f.x, f.y);
        else if (f.src === 'boulder') this.fx('smoke', f.x, f.y - 2);
        else if (f.src === 'bomb') this.fx('explosion', f.x, f.y - 6);
        else if (f.src === 'meteor') {
          this.fx('boom', f.x, f.y - 8);
          this.fx('electric', f.x, f.y - 6);
        } else this.fx((f.size ?? 1) >= 1.5 ? 'boom' : 'explosion', f.x, f.y - 6);
        break;
      case 'shock':
        this.fx('shock', f.x, f.y);
        this.fx('lightning', f.x, f.y - 8);
        break;
      // (A skill that slammed down went off from where its icon landed, flared there: no burst over the knight.)
      case 'levelup':
        if (f.src !== 'slam') this.fx('heal', f.x, f.y - 10);
        break;
      case 'revive':
      case 'portal':
        if (f.src !== 'slam') this.fx('sparkle', f.x, f.y - 8);
        break;
      default:
        break;
    }
  }

  private weather(b: Biome, dt: number, cx: number, cy: number): void {
    this.weatherT += dt;
    const rate = 0.06;
    while (this.weatherT > rate) {
      this.weatherT -= rate;
      for (const kind of b.weather) {
        const x = cx + Math.random() * this.W;
        const y = cy + Math.random() * this.H;
        switch (kind) {
          case 'snow':
            this.particles.push({ ...this.p('snow', x, cy - 10 + Math.random() * this.H * 0.4, '#f4faff', 4), vx: -6 + Math.random() * 4, vy: 14 + Math.random() * 8 });
            break;
          case 'fireflies':
            if (Math.random() < 0.25) this.particles.push({ ...this.p('firefly', x, y, b.id === 'graveyard' ? '#b8ff5a' : '#e8ff8a', 4), vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6 });
            break;
          case 'embers':
            this.particles.push({ ...this.p('ember', x, cy + this.H + 4, Math.random() < 0.5 ? '#ff8a3a' : '#ffd86a', 3), vx: (Math.random() - 0.5) * 8, vy: -16 - Math.random() * 14 });
            break;
          case 'ash':
            if (Math.random() < 0.3) this.particles.push({ ...this.p('ash', x, cy - 4, '#8a8090', 5), vx: 4, vy: 8 });
            break;
          case 'dust':
            if (Math.random() < 0.25) this.particles.push({ ...this.p('mote', x, y, '#e8d8b8', 3), vx: 5, vy: -1, glow: false });
            break;
          case 'motes':
            if (Math.random() < 0.25) this.particles.push({ ...this.p('mote', x, y, b.id === 'crystal' ? '#a8d8ff' : '#fff2c0', 3), vx: 2, vy: -4 });
            break;
          case 'petals':
            if (Math.random() < 0.2) this.particles.push({ ...this.p('petal', x, cy - 4, b.id === 'shrine' ? '#f4a8c8' : '#ffe8f0', 6), vx: 8, vy: 10 });
            break;
          case 'leaves':
            if (Math.random() < 0.15) this.particles.push({ ...this.p('leaf', x, cy - 4, '#8a6a2a', 6), vx: 10, vy: 9 });
            break;
          case 'spores':
            if (Math.random() < 0.25) this.particles.push({ ...this.p('mote', x, y, '#c8ff8a', 3), vx: 1, vy: -3 });
            break;
          case 'rain':
            this.particles.push({ ...this.p('rain', x, cy - 4, '#a8c8e8', 0.8), vx: -10, vy: 160 });
            break;
        }
      }
    }
  }

  private updateParticles(stCtx: Ctx, emCtx: Ctx, dt: number, sx: (x: number) => number, sy: (y: number) => number): void {
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'spark' || p.kind === 'dust' || p.kind === 'ember' && p.vz > 0 && p.max < 1) {
        p.z += p.vz * dt;
        p.vz -= 160 * dt;
        if (p.z < 0) {
          p.z = 0;
          p.vz = 0;
          p.vx *= 0.5;
          p.vy *= 0.5;
        }
      } else if (p.vz) p.z += p.vz * dt;
      if (p.kind === 'firefly' || p.kind === 'leaf' || p.kind === 'petal') {
        p.vx += Math.sin(this.time * 2 + p.y) * 10 * dt;
        p.vy += Math.cos(this.time * 1.7 + p.x) * 6 * dt;
      }
      keep.push(p);
      const x = sx(p.x);
      const y = sy(p.y - p.z);
      if (x < -20 || y < -20 || x > this.W + 20 || y > this.H + 20) continue;
      const fade = p.life / p.max;
      const ctx = p.glow || p.kind === 'spark' || p.kind === 'ring' ? emCtx : stCtx;
      if (p.kind === 'ring') {
        const r = Math.round(p.size * (1 + (1 - fade) * 1.4));
        this.ring(ctx, x, y, r, p.color, fade);
        continue;
      }
      ctx.globalAlpha = p.kind === 'firefly' ? 0.5 + 0.5 * Math.sin(this.time * 6 + p.x) : Math.min(1, fade * 2);
      ctx.fillStyle = p.color;
      const s = p.kind === 'snow' ? (p.max - p.life > 2 ? 1 : 1) : p.kind === 'leaf' || p.kind === 'petal' ? 2 : p.size;
      if (p.kind === 'rain') ctx.fillRect(x, y, 1, 3);
      else if (p.kind === 'leaf' || p.kind === 'petal') ctx.fillRect(x, y, Math.floor(this.time * 4 + p.x) % 2 ? 2 : 1, Math.floor(this.time * 4 + p.x) % 2 ? 1 : 2);
      else ctx.fillRect(x, y, s, s);
      ctx.globalAlpha = 1;
    }
    this.particles = keep.length > 900 ? keep.slice(keep.length - 900) : keep;
  }

  // ------------------------------------------------------------------ overlay

  /**
   * PERFECT! over a knight that rolled through a hit: the big pixel font in a stepped gold (white at
   * the top), with a drop shadow; it pops in a size up (the huge face) for its first beat and bounces,
   * then floats up and fades. A squadmate's is the small face.
   */
  private drawPerfectText(ctx: Ctx, t: FloatText, sx: (x: number) => number, sy: (y: number) => number): void {
    const face = t.big ? (t.t < 0.07 ? 'huge' : 'big') : 'small';
    const fill = face === 'huge' ? PERFECT_FILL.huge : face === 'big' ? PERFECT_FILL.big : PERFECT_FILL.small;
    const c = this.textCanvas(t.text, { face, fill, ink: '#140c14', shadow: face !== 'small' });
    const a = t.t > 0.6 ? Math.max(0, 1 - (t.t - 0.6) * 2.2) : 1;
    ctx.globalAlpha = Math.round(a * 4) / 4;
    const bounce = t.t < 0.05 ? 2 : t.t < 0.12 ? 1 : t.t < 0.18 ? -1 : 0;
    ctx.drawImage(c, sx(t.x) - Math.floor(c.width / 2), sy(t.y) - Math.floor(c.height / 2) - bounce);
    ctx.globalAlpha = 1;
  }

  private drawOverlay(ctx: Ctx, w: World, sx: (x: number) => number, sy: (y: number) => number): void {
    // At the hub, a little gold arrow bobbing over the steps down: the way into the dungeon.
    if (w.hub) {
      const lead = w.leader();
      if (lead && lead.y < HUB_STEPS_Y - 8) {
        const ARROW = ['..kkk..', '..kYk..', 'kkkYkkk', '.kYYYk.', '..kYk..', '...k...'];
        const x0 = sx(HUB_CX) - 3;
        const y0 = sy(HUB_STEPS_Y) - 14 + (Math.floor(this.time * 2.5) % 2);
        ARROW.forEach((row, yy) => {
          for (let xx = 0; xx < row.length; xx++) {
            const c = row[xx];
            if (c === '.') continue;
            ctx.fillStyle = c === 'k' ? '#2a1606' : '#ffd25a';
            ctx.fillRect(x0 + xx, y0 + yy, 1, 1);
          }
        });
      }
    }
    // Mob health bars (only when hurt). The boss's bar, like every screen-fixed thing, is in the HUD.
    for (const m of w.mobs) {
      if (m.dead || m.boss || m.hp >= m.maxHp) continue;
      const x = sx(m.x) - 6;
      const y = sy(m.y) + 2;
      ctx.fillStyle = '#140c14';
      ctx.fillRect(x - 1, y - 1, 14, 3);
      ctx.fillStyle = '#4a1a1a';
      ctx.fillRect(x, y, 12, 1);
      ctx.fillStyle = m.elite ? '#ffb84a' : '#e84a3a';
      ctx.fillRect(x, y, Math.max(1, Math.round((12 * m.hp) / m.maxHp)), 1);
    }
    // Damage and heal numbers.
    for (const t of w.texts) {
      if (t.style === 'perfect') {
        this.drawPerfectText(ctx, t, sx, sy);
        continue;
      }
      const c = this.textCanvas(t.text, { face: t.big ? 'big' : 'small', fill: t.color, ink: '#140c14' });
      const a = t.t > 0.5 ? Math.max(0, 1 - (t.t - 0.5) * 2.5) : 1;
      ctx.globalAlpha = Math.round(a * 4) / 4;
      const pop = t.t < 0.08 ? 1 : 0;
      ctx.drawImage(c, sx(t.x) - Math.floor(c.width / 2), sy(t.y) - pop);
    }
    ctx.globalAlpha = 1;
    // Lunges' and throws' tells over the mobs' heads, over the numbers.
    this.drawTells(ctx);
    // An arrow points to the way down while it's open (you can leave any time), and when only a few
    // mobs are left, arrows point to them too.
    const lead = w.leader();
    if (!lead) return;
    const living = w.livingMobs();
    const targets = [...(w.portalOpen ? [{ x: w.map.exit.x, y: w.map.exit.y, color: '#ffd27a' }] : []), ...(living.length <= 3 ? living.map((m) => ({ x: m.x, y: m.y, color: '#ff6a5a' })) : [])];
    for (const t of targets) {
      const x = sx(t.x);
      const y = sy(t.y);
      if (x > 6 && y > 6 && x < this.W - 6 && y < this.H - 6) continue;
      const ang = Math.atan2(y - this.H / 2, x - this.W / 2);
      const ex = Math.round(this.W / 2 + Math.cos(ang) * (this.W / 2 - 12));
      const ey = Math.round(this.H / 2 + Math.sin(ang) * (this.H / 2 - 22));
      ctx.fillStyle = '#140c14';
      ctx.fillRect(ex - 2, ey - 2, 5, 5);
      ctx.fillStyle = t.color;
      ctx.fillRect(ex - 1, ey - 1, 3, 3);
      ctx.fillRect(ex + Math.round(Math.cos(ang) * 3), ey + Math.round(Math.sin(ang) * 3), 1, 1);
    }
  }
}

/** A ranged knight's shot kicks it back a pixel against its aim, for a moment as it leaves (px). */
function recoil(h: Unit): [number, number] {
  if ((h.cls !== 'ranger' && h.cls !== 'cleric' && h.cls !== 'arcanist') || h.swingT <= 0 || h.swingDur - h.swingT > 0.07) return [0, 0];
  return [-Math.round(h.aimX), -Math.round(h.aimY)];
}

type Grade = Pick<PostParams, 'haze' | 'hazeAmount' | 'rays' | 'rayColor' | 'shadowTint' | 'highlightTint' | 'saturation' | 'contrast' | 'vignette' | 'bloom'>;

const v3 = (hex: string): [number, number, number] => {
  const [r, g, b] = rgb(hex);
  return [r / 255, g / 255, b / 255];
};
/** A tint around 1: the color's hue at `amount` strength, its brightness taken out. */
const tint = (hex: string, amount: number): [number, number, number] => {
  const c = v3(hex);
  const avg = (c[0] + c[1] + c[2]) / 3 || 1;
  return c.map((x) => 1 + (x / avg - 1) * amount) as [number, number, number];
};

const DEFAULT_GRADE: Grade = {
  haze: [0.1, 0.1, 0.15], hazeAmount: 0, rays: 0, rayColor: [1, 0.85, 0.6], shadowTint: [1, 1, 1], highlightTint: [1, 1, 1], saturation: 1, contrast: 1, vignette: 0.4, bloom: 0.6,
};

/** Biomes in daylight. */
const DAYLIGHT: ReadonlySet<string> = new Set(['hamlet', 'farmland', 'forest', 'desert', 'tundra']);

/** How strong the sun rays are per biome: only where there's daylight (none in the dark ones). */
const RAYS: Readonly<Record<string, number>> = {
  hamlet: 0.2,
  farmland: 0.2,
  // Shafts through the canopy.
  forest: 0.24,
  desert: 0.12,
  tundra: 0.1,
};

/**
 * The light the scene is multiplied by. Daylight is lifted most of the way to white (a bright, clean
 * picture, like a sunny afternoon), keeping a touch of the biome's warmth; cloud cools and dims it, rain
 * more so.
 */
function ambientOf(b: Biome, sky: Sky | null): string {
  const kind = sky?.kind ?? 'clear';
  const day = DAYLIGHT.has(b.id);
  if (kind === 'rain') return mixHex(b.light.ambient, day ? '#c4ccd8' : '#7a8496', 0.7);
  if (kind === 'overcast') return mixHex(b.light.ambient, day ? '#dfe4ea' : '#8a94a6', 0.6);
  if (day) return mixHex(b.light.ambient, '#fffaf0', 0.6);
  // The dark places keep their colour but not their murk: the fill is lifted until the ground, the
  // walls' faces and the terraces behind them all read (the depth is in the picture, not hidden by
  // it), and the lanterns, fires and the knights' own light sit on top of that as the warm accents.
  return liftTo(b.light.ambient, NIGHT_FILL[b.id] ?? 168);
}

/** How bright the fill gets in each dark biome (its brightest channel, 0..255). */
const NIGHT_FILL: Readonly<Record<string, number>> = { forest: 190, swamp: 186, graveyard: 172, crypt: 176, ember: 172, crystal: 176, shrine: 184, dungeon: 170 };

/** A colour scaled up until its brightest channel reaches `top` (never down), a little of it let go toward grey. */
function liftTo(hex: string, top: number): string {
  const [r, g, b] = rgb(hex);
  const k = Math.max(1, top / Math.max(1, r, g, b));
  const to = (v: number) => Math.round(Math.min(255, v * k)).toString(16).padStart(2, '0');
  return mixHex(`#${to(r)}${to(g)}${to(b)}`, '#b4bccc', 0.12);
}

/** How dark the drifting cloud shadows get: on sunny days outdoors; faint under a grey sky; none in rain or below ground. */
function cloudShadows(b: Biome, sky: Sky | null): number {
  if (b.layout === 'rooms' || !DAYLIGHT.has(b.id) && b.id !== 'swamp' && b.id !== 'graveyard') return 0;
  const kind = sky?.kind ?? 'clear';
  return kind === 'rain' ? 0 : kind === 'overcast' ? 0.06 : DAYLIGHT.has(b.id) ? 0.2 : 0.08;
}

/** Each biome's look in the shader: haze, shafts of light, split toning, saturation, bloom. */
function gradeOf(b: Biome, sky: Sky | null): Grade {
  const indoor = b.layout === 'rooms';
  const day = DAYLIGHT.has(b.id);
  const kind = sky?.kind ?? 'clear';
  const wet = kind === 'rain';
  const grey = kind !== 'clear';
  return {
    haze: wet ? [0.74, 0.79, 0.86] : v3(b.light.fog ?? b.light.gradeTop),
    hazeAmount: wet ? 0.07 : b.light.fog ? 0.2 : indoor ? 0.06 : day ? 0.04 : 0.1,
    // Sun rays only where it's daylight: over the hamlet and the farm, fainter over sand and snow
    // (already bright); none in the dark places, indoors or in rain, weaker under cloud.
    rays: indoor || wet || !day ? 0 : (RAYS[b.id] ?? 0) * (grey ? 0.35 : 1),
    rayColor: day ? v3(mixHex(b.light.gradeTop, '#fff6e6', 0.6)) : v3(b.light.gradeTop),
    shadowTint: grey ? tint('#4a5a7a', 0.3) : tint(b.light.gradeBottom, day ? 0.25 : 0.35),
    highlightTint: grey ? tint('#e8f0ff', 0.12) : tint(b.light.gradeTop, day ? 0.09 : 0.22),
    saturation: wet ? 1.04 : grey ? 1.02 : day ? 1.12 : 1.16,
    contrast: day || grey ? 1.04 : 1.06,
    vignette: day || grey ? Math.min(0.32, b.light.vignette * 0.7) : Math.min(0.5, b.light.vignette * 0.85),
    bloom: indoor ? 0.9 : wet ? 0.65 : 0.5,
  };
}

export { BIOMES, RARITY_COLOR };

