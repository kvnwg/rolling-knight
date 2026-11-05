/**
 * Draws the floor at art resolution (every pixel the same size) and scales it up by a whole number:
 * the painted ground, then everything standing on it sorted by how far down the screen its feet are
 * (the 3/4 view: things lower down are in front), then shots, sparks and weather, then the light.
 */
import type { Game } from '../game';
import { RARITY_COLOR } from '../core/rarity';
import { BIOMES, type Biome } from '../world/biomes';
import type { Area, Fx, Shot, Unit } from '../world/entities';
import { TILE, type FloorMap, type Prop } from '../world/mapgen';
import type { World } from '../world/world';
import { flash, makeCanvas, mixHex, shade, toCanvas } from './art/draw';
import { CLASS_HAS_SHIELD, KNIGHT_ANCHOR, knightFrame, knightGlow, knightLook, shieldArt, weaponArt, type KnightLook, type View } from './art/knights';
import { mobFrame, poseFrames, type MobPose } from './art/mobs';
import { flameArt, type PropArt } from './art/props';
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
import { Rain } from './rain';
import { Ambient } from './ambient';
import { HubPaint } from './hubPaint';
import { HUB_H, HUB_W } from '../world/hub';
import type { Sky } from '../world/sky';
import { npcFrame, questMarker } from './art/npcs';
import { npcMarker } from '../world/npcs';
import { pfReady, SHEETS, type SheetName } from './pf/assets';
import { frameCanvas, frameMask, haloCanvas, haloSpot, haloWidth, headTop } from './pf/frames';
import { heroPose, pruneHeroes, type HeroPose } from './pf/heroAnim';
import { knightPaint, paintStep } from './pf/knightLook';
import { deathPoofMs, deathPose, lastMoveOf, mobDirOf, mobPose, pruneMobs } from './pf/mobAnim';
import { mobPaint, type MobPaint } from './pf/mobLook';
import { facing, type Dir } from './pf/sheet';

type Ctx = CanvasRenderingContext2D;

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
 * At the hub the view comes in much closer (a phone held upright shows about 150 art px across, and
 * a desktop the same from its short side): the hub is one cozy shop front, painted to fill the screen.
 */
const HUB_SHORT_SIDE = 150;
/** Where your knight sits on the hub's screen, top to bottom: a little below the middle. */
const HUB_FOCUS_Y = 0.55;

/** PixelForge FX are drawn in their own colors. */
const NO_PAINT = { recolor: {}, key: 'fx' } as const;

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
    // The hub is one painting: closer still where the view would reach past its edges (no void).
    if (this.hubZoom) P = Math.max(P, Math.ceil(cw / HUB_W), Math.ceil(ch / HUB_H));
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
    });
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
    if (!shader && game.state.settings.tiltShift && lead) this.tiltShift(g, sy(lead.y) - 6, w.biome.layout === 'rooms' ? 0.5 : 1);
    // (The hub paints its own way down: its steps, and the glow at their foot.)
    if (!hub) this.drawPortal(g, em, w, sx, sy);
    for (const a of w.areas) this.drawArea(g, em, a, sx, sy);

    // --- PixelForge: knight poses for this frame, and mobs that just died start their deaths
    const pf = pfReady();
    this.heroPoses.clear();
    if (pf) {
      for (const h of w.heroes) this.heroPoses.set(h.uid, heroPose(w, h));
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
      if (!visible(u.x, u.y)) continue;
      if (pf && (u.team === 'hero' || (!u.dead && mobPaint(u.type!, !!u.elite, !!u.boss)) || this.corpses.some((c) => c.uid === u.uid))) continue;
      const big = u.boss ? 3 : u.elite ? 1.4 : 1;
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
          if (p.art.flame) {
            const fr = Math.floor(this.time * 10 + p.seed) % 4;
            const f = this.cached(`flame|${p.art.flame.size}|${fr}|${biome.light.fire}`, () => toCanvas(flameArt(p.art.flame!.size, fr, biome.light.fire)));
            em.drawImage(f, sx(p.x) + p.art.flame.dx - Math.floor(f.width / 2), sy(p.y) + p.art.flame.dy - f.height + 2);
          }
        },
      });
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
      if (!visible(h.x, h.y)) continue;
      list.push({
        y: h.y,
        draw: () => {
          this.drawHero(st, w, h, sx, sy);
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
          if (near === k || !k.def) ui.drawImage(mark, sx(k.x) - Math.floor(mark.width / 2), sy(k.y) - (k.def ? 34 : 22) + bob);
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
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();
    this.drawPfFx(st, w, sx, sy);
    if (hub) {
      hub.drawFore(st, em, cx, cy, this.LW, this.LH);
      hub.updateMotes(dt);
      hub.drawMotes(em, cx, cy, this.LW, this.LH, this.time);
    } else this.ambient?.drawAir(em, cx, cy, this.LW, this.LH, this.time);

    // --- shots, sparks, leaves and weather. Attack effects (shots, spell and hit bursts) go on the
    // unlit top layer: crisp, never bloomed or glowing (only the setting glows).
    for (const s of w.shots) {
      if (pf && this.wardenShot(w, s)) this.drawRockShard(st, s, sx, sy);
      else this.drawShot(s.kind === 'arrow' ? st : ui, s, sx, sy);
    }
    this.spawnFx(w);
    if (!hub) this.weather(biome, dt, cx, cy);
    if (outdoors && !hub) this.dropLeaves(biome, cx, cy, dt);
    this.updateParticles(st, em, dt, sx, sy);
    if (w.sky.rain > 0) this.rain.drawAir(st, cx, cy);
    this.advanceFx(dt);
    this.drawFx(st, sx, sy, false);
    this.drawFx(ui, sx, sy, true);

    // --- light (the setting's: effects light nothing)
    const lights = this.collectLights(w, biome, cx, cy, sx, sy);
    if (outdoors && w.sky.kind === 'clear') this.sunFlecks(lights, w, cx, cy);
    this.flashT = Math.max(0, this.flashT - dt);

    // --- the HUD layer: health bars, numbers, pointers (never lit or graded)
    this.drawOverlay(ui, w, sx, sy);
    this.present(game, w, lights, lead ? (sy(lead.y) - 6 - this.sub.y) / this.vh : 0.5);
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
    const x = sx(h.x) - px;
    const y = sy(h.y) - py;
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
    }
    // The Arcanist's blink leaves an afterimage where it stood.
    if (pose.ghost && pose.ghost.alpha > 0) {
      ctx.globalAlpha = pose.ghost.alpha;
      ctx.drawImage(frameCanvas(paint.sheet, pose.ghost.k, paint, true, pose.ghost.anim, pose.ghost.dir), sx(pose.ghost.x) - px, sy(pose.ghost.y) - py);
    }
    ctx.globalAlpha = pose.alpha;
    ctx.drawImage(frameCanvas(paint.sheet, pose.k, paint, pose.flash, pose.anim, pose.dir), x, y);
    ctx.globalAlpha = 1;
    const cap = this.layers.cap.x;
    cap.globalAlpha = pose.alpha;
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
    const meta = SHEETS[paint.sheet].meta;
    const [px, py] = meta.pivot;
    const x = sx(m.x);
    const y = sy(m.y);
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
    ctx.drawImage(frameCanvas(paint.sheet, pose.k, paint, pose.flash), x - px, y - py);
    this.layers.cap.x.drawImage(frameMask(paint.sheet, pose.k, paint, pose.flash), x - px, y - py);
    const top = y - py + meta.tops[pose.k][0];
    if (pose.stunned) this.stunStars(this.layers.emit.x, x, top - 3);
    // Asleep: a little "z".
    if (!m.awake && Math.floor(this.time * 1.5 + m.uid) % 3 === 0) {
      const z = this.textCanvas('Z', { face: 'small', fill: '#d8e0ff', ink: '#1a1326' });
      ctx.drawImage(z, x + 3, top - 6);
    }
    // A charge's telegraph: a line of dots where it will run.
    if (m.windT && m.windT > 0 && m.move === 'charge') {
      ctx.fillStyle = 'rgba(255,90,90,0.8)';
      for (let k = 1; k < 12; k++) {
        if ((k + Math.floor(this.time * 20)) % 2) continue;
        ctx.fillRect(sx(m.x + (m.moveX ?? 0) * k * 8), sy(m.y + (m.moveY ?? 0) * k * 8), 1, 1);
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
      // PixelForge's own: a skeleton crumbles, the rest go up in a puff (a boss in three).
      const name: SheetName = c.paint.monster === 'skeleton' ? 'fx_bone_crumble' : 'fx_poof_smoke';
      const spots: Array<[number, number]> = c.boss ? [[0, 0], [-12, -10], [12, -14]] : [[0, 0]];
      for (const [dx, dy] of spots) this.pfFx.push({ name, x: c.x + dx, y: c.y + dy, at: w.time, world: w });
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
    let pose: MobPose = m.windT && m.windT > 0 ? 'wind' : m.swingT > 0 ? 'strike' : m.moving || m.chargeT ? 'walk' : 'idle';
    const n = poseFrames(t, pose);
    const frame = pose === 'walk' ? Math.floor(m.animT * (m.chargeT ? 16 : 8)) % n : pose === 'idle' ? Math.floor(m.animT * 3) % n : 0;
    if (!m.awake) pose = 'idle';
    const flip = m.dir < 0;
    const white = m.hurtT > 0.1 || (pose === 'wind' && Math.floor(this.time * 20) % 2 === 0);
    const key = `m|${t.id}|${pose}|${frame}|${m.elite ? 1 : 0}|${m.boss ? 1 : 0}|${white ? 1 : 0}|${flip ? 1 : 0}`;
    const c = this.cached(key, () => {
      const fr = mobFrame(t, pose, frame, 'down', !!m.elite, !!m.boss);
      this.mobMeta.set(key, { ax: fr.ax, ay: fr.ay });
      let b = white ? flash(fr.buf, pose === 'wind' ? '#ffe0e0' : '#ffffff') : fr.buf;
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
    ctx.globalAlpha = m.awake ? 1 : 0.92;
    ctx.drawImage(c, sx(m.x) - ax, sy(m.y) - ay + hover);
    ctx.globalAlpha = 1;
    // Asleep: a little "z".
    if (!m.awake && Math.floor(this.time * 1.5 + m.uid) % 3 === 0) {
      const z = this.textCanvas('Z', { face: 'small', fill: '#d8e0ff', ink: '#1a1326' });
      ctx.drawImage(z, sx(m.x) + 3, sy(m.y) - c.height - 2);
    }
    // A charge's telegraph: a line of dots where it will run.
    if (m.windT && m.windT > 0 && m.move === 'charge') {
      ctx.fillStyle = 'rgba(255,90,90,0.8)';
      for (let k = 1; k < 12; k++) {
        if ((k + Math.floor(this.time * 20)) % 2) continue;
        ctx.fillRect(sx(m.x + (m.moveX ?? 0) * k * 8), sy(m.y + (m.moveY ?? 0) * k * 8), 1, 1);
      }
    }
    void w;
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

  /** Was this shot thrown by a boss drawn as the Stone Warden? */
  private wardenShot(w: World, s: Shot): boolean {
    if (s.team !== 'mob' || s.kind !== 'bullet') return false;
    const m = w.bossUnit && w.bossUnit.uid === s.from ? w.bossUnit : null;
    return !!m && mobPaint(m.type!, !!m.elite, true)?.monster === 'stone_warden';
  }

  /** A Stone Warden's shard: PixelForge's spinning stone, turned to its flight (whole quarter turns). */
  private drawRockShard(ctx: Ctx, s: Shot, sx: (x: number) => number, sy: (y: number) => number): void {
    const sheet = SHEETS.fx_rock_shard;
    const dir = facing(s.vx, s.vy);
    const f = sheet.clip('travel', dir);
    const i = Math.floor((this.time * 1000) / f[0][1]) % f.length;
    const [px, py] = sheet.meta.anims.travel.pivots?.[dir] ?? sheet.meta.pivot;
    ctx.drawImage(frameCanvas('fx_rock_shard', f[i][0], NO_PAINT), sx(s.x) - px, sy(s.y) - py);
  }

  private drawShot(ctx: Ctx, s: Shot, sx: (x: number) => number, sy: (y: number) => number): void {
    const x = sx(s.x);
    const y = sy(s.y);
    if (s.kind === 'arrow') {
      const l = Math.hypot(s.vx, s.vy) || 1;
      const dx = s.vx / l;
      const dy = s.vy / l;
      ctx.fillStyle = '#5a3a20';
      for (let k = 0; k < 6; k++) ctx.fillRect(x - Math.round(dx * k), y - Math.round(dy * k), 1, 1);
      ctx.fillStyle = '#e8e8f0';
      ctx.fillRect(x, y, 1, 1);
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(x - Math.round(dx * 6), y - Math.round(dy * 6), 1, 1);
      return;
    }
    const r = s.kind === 'bullet' ? 2 : 2;
    ctx.fillStyle = shade(s.color, -0.5);
    ctx.fillRect(x - r - 1, y - r, r * 2 + 3, r * 2 + 1);
    ctx.fillRect(x - r, y - r - 1, r * 2 + 1, r * 2 + 3);
    ctx.fillStyle = s.color;
    ctx.fillRect(x - r, y - r, r * 2 + 1, r * 2 + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1, y - 1, 2, 2);
    // A short trail.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = s.color;
    ctx.fillRect(x - Math.round(s.vx * 0.03), y - Math.round(s.vy * 0.03), 2, 2);
    ctx.globalAlpha = 1;
  }

  private drawArea(ctx: Ctx, em: Ctx, a: Area, sx: (x: number) => number, sy: (y: number) => number): void {
    const x = sx(a.x);
    const y = sy(a.y);
    const danger = a.team === 'mob';
    const col = danger ? '#ff4a3a' : a.color;
    if (a.delay > 0) {
      // A telegraph: a ring that fills in as it counts down.
      const total = a.kind === 'meteor' ? 0.9 : a.kind === 'rain' ? 0.25 : 1;
      const t = Math.max(0, Math.min(1, 1 - a.delay / total));
      this.ring(ctx, x, y, a.r, col, 0.8);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = col;
      this.ellipse(ctx, x, y, Math.round(a.r * t), Math.round(a.r * t * 0.6));
      ctx.globalAlpha = 1;
      if (a.kind === 'meteor') {
        // The meteor itself, falling.
        const fy = y - Math.round((1 - t) * 90);
        em.fillStyle = '#ffd86a';
        em.fillRect(x - 2, fy - 2, 5, 5);
        em.fillStyle = '#ff7a2a';
        for (let k = 1; k < 6; k++) em.fillRect(x - 1 + k, fy - 2 - k * 2, 2, 2);
      }
      return;
    }
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

  private drawPortal(ctx: Ctx, em: Ctx, w: World, sx: (x: number) => number, sy: (y: number) => number): void {
    const x = sx(w.map.exit.x);
    const y = sy(w.map.exit.y);
    // The stone ring is always there; it lights up when the floor is clear.
    ctx.fillStyle = '#2a2830';
    this.ellipse(ctx, x, y, 11, 5);
    ctx.fillStyle = '#5a5866';
    this.ellipse(ctx, x, y - 1, 10, 4);
    ctx.fillStyle = w.portalOpen ? '#1a0a3a' : '#16141c';
    this.ellipse(ctx, x, y - 1, 8, 3);
    if (!w.portalOpen) return;
    const t = this.time;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + t * 3;
      const r = 7 - ((i + Math.floor(t * 10)) % 4);
      em.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#b08aff' : '#7ad8ff';
      em.fillRect(x + Math.round(Math.cos(a) * r), y - 1 + Math.round(Math.sin(a) * r * 0.45), 1, 1);
    }
    if (Math.random() < 0.4) this.particles.push(this.p('mote', w.map.exit.x + (Math.random() - 0.5) * 14, w.map.exit.y, '#c8a8ff', 1.2, -18));
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
    for (const h of w.heroes) {
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
    for (const m of w.mobs) {
      if (m.dead) continue;
      // PixelForge monsters light the dark with their glow eyes' color (a Stone Warden's core).
      const pfEye = pfReady() ? mobPaint(m.type!, !!m.elite, !!m.boss, (m.bossPhase ?? 0) > 0)?.recolor.eyes?.[0] : undefined;
      if (m.elite || m.boss) out.push({ x: sx(m.x), y: sy(m.y) - (m.boss && pfEye ? 24 : 8), r: m.boss ? 46 : 22, color: pfEye ?? m.type!.ramp[3], intensity: pfEye ? 0.45 : 0.55, bloom: m.boss });
      else if (m.type!.plan === 'flyer' && /Wisp|Spirit/.test(m.type!.name)) out.push({ x: sx(m.x), y: sy(m.y) - 8, r: 18, color: m.type!.ramp[3], intensity: 0.8, bloom: true });
      else if (m.type!.plan === 'golem') out.push({ x: sx(m.x), y: sy(m.y) - 10, r: 14, color: m.type!.eye, intensity: 0.6, bloom: true });
    }
    if (w.portalOpen) out.push({ x: sx(w.map.exit.x), y: sy(w.map.exit.y) - 4, r: 60, color: '#b08aff', intensity: 1, bloom: true });
    for (const p of this.particles) if (p.glow) out.push({ x: sx(p.x), y: sy(p.y - p.z), r: p.kind === 'firefly' ? 8 : 6, color: p.color, intensity: Math.min(1, p.life / p.max + 0.2) * 0.7 });
    return out;
  }

  // ------------------------------------------------------------------ particles

  private p(kind: Particle['kind'], x: number, y: number, color: string, life: number, vz = 0): Particle {
    return { x, y, z: 0, vx: 0, vy: 0, vz, life, max: life, color, size: 1, kind, glow: kind === 'ember' || kind === 'firefly' || kind === 'mote' };
  }

  private spawnFx(w: World): void {
    for (const f of w.fx) this.burst(f);
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

  private burst(f: Fx): void {
    // The pack effects (Will Tice / unTied Games), on top of the particles.
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
      case 'levelup':
        this.fx('heal', f.x, f.y - 10);
        break;
      case 'revive':
      case 'portal':
        this.fx('sparkle', f.x, f.y - 8);
        break;
      default:
        break;
    }
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
      case 'levelup':
      case 'revive':
        add(16, (i) => ({ ...this.p('mote', f.x + Math.cos(i) * 8, f.y + Math.sin(i) * 4, f.color ?? '#ffe27a', 1), vz: 22 + Math.random() * 10 }));
        break;
      case 'portal':
        this.flashT = 0.35;
        add(24, (i) => ({ ...this.p('mote', f.x + Math.cos(i) * 10, f.y + Math.sin(i) * 5, '#c8a8ff', 1.4), vz: 26 + Math.random() * 20 }));
        break;
      case 'coin':
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

  private drawOverlay(ctx: Ctx, w: World, sx: (x: number) => number, sy: (y: number) => number): void {
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
      const c = this.textCanvas(t.text, { face: t.big ? 'big' : 'small', fill: t.color, ink: '#140c14' });
      const a = t.t > 0.5 ? Math.max(0, 1 - (t.t - 0.5) * 2.5) : 1;
      ctx.globalAlpha = Math.round(a * 4) / 4;
      const pop = t.t < 0.08 ? 1 : 0;
      ctx.drawImage(c, sx(t.x) - Math.floor(c.width / 2), sy(t.y) - pop);
    }
    ctx.globalAlpha = 1;
    // When only a few mobs are left, arrows point to them; when the portal opens, one points there.
    const lead = w.leader();
    if (!lead) return;
    const targets = w.portalOpen ? [{ x: w.map.exit.x, y: w.map.exit.y, color: '#c8a8ff' }] : w.livingMobs().length <= 3 ? w.livingMobs().map((m) => ({ x: m.x, y: m.y, color: '#ff6a5a' })) : [];
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
const DAYLIGHT: ReadonlySet<string> = new Set(['hamlet', 'farmland', 'desert', 'tundra']);

/** How strong the sun rays are per biome: only where there's daylight (none in the dark ones). */
const RAYS: Readonly<Record<string, number>> = {
  hamlet: 0.2,
  farmland: 0.2,
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
  // Gloomwood's lanterns and fireflies carry the mood now: its dark can lift a little.
  return b.id === 'forest' ? mixHex(b.light.ambient, '#a8b8cc', 0.36) : b.light.ambient;
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
    vignette: day || grey ? Math.min(0.32, b.light.vignette * 0.7) : Math.min(0.75, b.light.vignette + 0.1),
    bloom: indoor ? 0.9 : wet ? 0.65 : 0.5,
  };
}

export { BIOMES, RARITY_COLOR };

