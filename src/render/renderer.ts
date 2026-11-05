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
import { flameArt, propArt, treeArt, type PropArt } from './art/props';
import { Lighting, type Light } from './lighting';
import { flipX } from './pixel/buf';
import { renderText, type TextStyle } from './pixel/font';
import { paintTerrain, type Terrain } from './terrain';

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

/** Target art pixels on the screen's short side. */
const SHORT_SIDE = 216;

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
  scene: HTMLCanvasElement;
  sctx: Ctx;
  W = 200;
  H = 300;
  P = 4;
  light: Lighting;
  camX = 0;
  camY = 0;
  private terrain: Terrain | null = null;
  private terrainMap: FloorMap | null = null;
  private props: Array<Prop & { art: PropArt; canvas: HTMLCanvasElement; ghost?: HTMLCanvasElement }> = [];
  private cache = new Map<string, HTMLCanvasElement>();
  private mobMeta = new Map<string, { ax: number; ay: number }>();
  private particles: Particle[] = [];
  private time = 0;
  private weatherT = 0;
  private flashT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.scene = makeCanvas(this.W, this.H) as HTMLCanvasElement;
    this.sctx = this.scene.getContext('2d')!;
    this.light = new Lighting(this.W, this.H);
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = Math.floor(window.innerWidth * dpr);
    const ch = Math.floor(window.innerHeight * dpr);
    this.P = Math.max(2, Math.round(Math.min(cw, ch) / SHORT_SIDE));
    this.W = Math.ceil(cw / this.P);
    this.H = Math.ceil(ch / this.P);
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.scene.width = this.W;
    this.scene.height = this.H;
    this.light.resize(this.W, this.H);
    this.ctx.imageSmoothingEnabled = false;
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
    this.props = w.map.props
      .map((p) => {
        const variant = p.seed % 5;
        const key = `prop|${w.biome.id}|${p.kind}|${p.tree ?? ''}|${variant}`;
        const art = p.kind === 'tree' ? treeArt(p.tree!, w.biome, variant * 7919 + 13) : propArt(p.kind, w.biome, variant * 104729 + 7);
        const canvas = this.cached(key, () => toCanvas(art.buf));
        const ghost = p.kind === 'tree' ? this.cached(`${key}|ghost`, () => toCanvas(art.buf)) : undefined;
        return { ...p, art, canvas, ghost };
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

  render(game: Game, dt: number): void {
    this.time += dt;
    const ctx = this.sctx;
    const w = game.world;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (!w) {
      ctx.fillStyle = '#0b0d16';
      ctx.fillRect(0, 0, this.W, this.H);
      this.present();
      return;
    }
    this.prepareFloor(w);
    const biome = w.biome;
    // --- camera: on the leader, a little ahead of where they face, inside the map
    const lead = w.leader();
    if (lead) {
      const tx = lead.x + lead.aimX * 10 - this.W / 2;
      const ty = lead.y - 10 + lead.aimY * 8 - this.H / 2;
      const k = Math.min(1, dt * 6);
      if (Math.abs(tx - this.camX) > 400 || Math.abs(ty - this.camY) > 400) {
        this.camX = tx;
        this.camY = ty;
      } else {
        this.camX += (tx - this.camX) * k;
        this.camY += (ty - this.camY) * k;
      }
    }
    const mapW = w.map.w * TILE;
    const mapH = w.map.h * TILE;
    this.camX = Math.max(0, Math.min(mapW - this.W, this.camX));
    this.camY = Math.max(-8, Math.min(mapH - this.H, this.camY));
    let shx = 0;
    let shy = 0;
    if (w.shake > 0 && !game.state.settings.reduceMotion) {
      const p = Math.max(1, Math.round(w.shakePower * Math.min(1, w.shake * 4)));
      shx = Math.round((Math.random() * 2 - 1) * p);
      shy = Math.round((Math.random() * 2 - 1) * p);
    }
    const cx = Math.round(this.camX) + shx;
    const cy = Math.round(this.camY) + shy;
    const sx = (x: number) => Math.round(x) - cx;
    const sy = (y: number) => Math.round(y) - cy;
    const visible = (x: number, y: number, m = 40) => x > cx - m && x < cx + this.W + m && y > cy - m && y < cy + this.H + m * 2;

    // --- ground
    ctx.fillStyle = biome.solid.top[0];
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.drawImage(this.terrain!.canvas, cx, cy, this.W, this.H, 0, 0, this.W, this.H);
    this.drawLiquidShimmer(ctx, w, cx, cy);
    this.drawPortal(ctx, w, sx, sy);
    for (const a of w.areas) this.drawArea(ctx, a, sx, sy);

    // --- shadows
    ctx.fillStyle = 'rgba(8,6,16,0.38)';
    for (const p of this.props) {
      if (!visible(p.x, p.y)) continue;
      if (p.kind === 'tree') this.ellipse(ctx, sx(p.x + 2), sy(p.y - 1), p.edge ? 9 : 10, 3);
      else if (p.solid) this.ellipse(ctx, sx(p.x), sy(p.y), Math.max(3, p.art.buf.w / 2 - 1), 2);
    }
    for (const u of [...w.heroes, ...w.mobs]) {
      if (u.dead && u.hurtT < -0.3) continue;
      if (!visible(u.x, u.y)) continue;
      const big = u.boss ? 3 : u.elite ? 1.4 : 1;
      this.ellipse(ctx, sx(u.x), sy(u.y), Math.round((u.r + 1) * big), Math.max(1, Math.round(2 * big)), u.flying ? 0.6 : 1);
    }

    // --- everything standing, sorted by feet
    type D = { y: number; draw: () => void };
    const list: D[] = [];
    const leadBox = lead ? { x: lead.x, y: lead.y } : null;
    for (const p of this.props) {
      if (!visible(p.x, p.y, 48)) continue;
      list.push({
        y: p.y,
        draw: () => {
          const x = sx(p.x) - p.art.ax;
          const y = sy(p.y) - p.art.ay;
          // Trees in front of the leader turn see-through, so you never lose your knight.
          let alpha = 1;
          if (leadBox && p.kind === 'tree' && p.y > leadBox.y && p.y - leadBox.y < 30 && Math.abs(p.x - leadBox.x) < 14) alpha = 0.45;
          ctx.globalAlpha = alpha;
          ctx.drawImage(p.canvas, x, y);
          ctx.globalAlpha = 1;
          if (p.art.flame) {
            const fr = Math.floor(this.time * 10 + p.seed) % 4;
            const f = this.cached(`flame|${p.art.flame.size}|${fr}|${biome.light.fire}`, () => toCanvas(flameArt(p.art.flame!.size, fr, biome.light.fire)));
            ctx.drawImage(f, sx(p.x) + p.art.flame.dx - Math.floor(f.width / 2), sy(p.y) + p.art.flame.dy - f.height + 2);
          }
        },
      });
    }
    for (const m of w.mobs) {
      if (!visible(m.x, m.y)) continue;
      list.push({ y: m.y, draw: () => this.drawMob(ctx, w, m, sx, sy) });
    }
    for (const h of w.heroes) {
      if (!visible(h.x, h.y)) continue;
      list.push({ y: h.y, draw: () => this.drawHero(ctx, w, h, sx, sy) });
    }
    for (const p of w.pickups) {
      list.push({ y: p.y, draw: () => this.drawPickup(ctx, p.kind, sx(p.x), sy(p.y - p.z)) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    // --- shots and sparks
    for (const s of w.shots) this.drawShot(ctx, s, sx, sy);
    this.spawnFx(w);
    this.weather(biome, dt, cx, cy);
    this.updateParticles(ctx, dt, sx, sy);

    // --- light
    const lights = this.collectLights(w, biome, cx, cy, sx, sy);
    if (w.cleared && !game.state.settings.reduceMotion) this.flashT = Math.max(0, this.flashT - dt);
    this.light.apply(ctx, biome.light.ambient, lights, {
      gradeTop: biome.light.gradeTop,
      gradeBottom: biome.light.gradeBottom,
      vignette: biome.light.vignette,
      flash: this.flashT,
    });
    if (biome.light.fog) this.drawFog(ctx, biome.light.fog, cx, cy);

    // --- unlit overlay: health bars, numbers, pointers
    this.drawOverlay(ctx, w, sx, sy);
    if (game.fade > 0) {
      ctx.fillStyle = `rgba(6,6,12,${Math.round(game.fade * 6) / 6})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    this.present();
  }

  private present(): void {
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.scene, 0, 0, this.W * this.P, this.H * this.P);
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

  private drawHero(ctx: Ctx, w: World, h: Unit, sx: (x: number) => number, sy: (y: number) => number): void {
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

  private drawMob(ctx: Ctx, w: World, m: Unit, sx: (x: number) => number, sy: (y: number) => number): void {
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

  private drawArea(ctx: Ctx, a: Area, sx: (x: number) => number, sy: (y: number) => number): void {
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
        ctx.fillStyle = '#ffd86a';
        ctx.fillRect(x - 2, fy - 2, 5, 5);
        ctx.fillStyle = '#ff7a2a';
        for (let k = 1; k < 6; k++) ctx.fillRect(x - 1 + k, fy - 2 - k * 2, 2, 2);
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

  private drawPortal(ctx: Ctx, w: World, sx: (x: number) => number, sy: (y: number) => number): void {
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
      ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#b08aff' : '#7ad8ff';
      ctx.fillRect(x + Math.round(Math.cos(a) * r), y - 1 + Math.round(Math.sin(a) * r * 0.45), 1, 1);
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
    for (let y = oy; y < this.H; y += 128) for (let x = ox; x < this.W; x += 128) ctx.drawImage(tint, x, y);
    ctx.restore();
  }

  // ------------------------------------------------------------------ lights

  private collectLights(w: World, biome: Biome, cx: number, cy: number, sx: (x: number) => number, sy: (y: number) => number): Light[] {
    const out: Light[] = [];
    const flick = (seed: number) => 0.85 + 0.15 * Math.sin(this.time * 9 + seed) * Math.sin(this.time * 13.7 + seed * 2);
    for (const p of this.props) {
      const l = p.art.light;
      if (!l) continue;
      const x = p.x + l.dx;
      const y = p.y + l.dy;
      if (x < cx - 80 || x > cx + this.W + 80 || y < cy - 80 || y > cy + this.H + 80) continue;
      const f = l.flicker ? flick(p.seed % 100) : 1;
      out.push({ x: x - cx, y: y - cy, r: l.r * (0.95 + 0.05 * f), color: l.color, intensity: 0.95 * f, bloom: true });
    }
    for (const g of this.terrain!.glows) {
      if (g.x < cx - 60 || g.x > cx + this.W + 60 || g.y < cy - 60 || g.y > cy + this.H + 60) continue;
      out.push({ x: g.x - cx, y: g.y - cy, r: g.r, color: g.color, intensity: 0.7 + 0.1 * Math.sin(this.time * 2 + g.x), bloom: (g.x + g.y) % 48 === 0 });
    }
    for (const h of w.heroes) {
      if (h.downed) continue;
      const mine = h.slot === w.controlled;
      out.push({ x: sx(h.x), y: sy(h.y) - 6, r: biome.light.heroRadius * (mine ? 1.25 : 0.9), color: biome.light.hero, intensity: mine ? 0.85 : 0.6 });
      const L = knightLook(h.knightId!, h.mutation ?? null, h.rarity === 'primordial' ? this.time : 0);
      const glow = knightGlow(L);
      if (glow) out.push({ x: sx(h.x), y: sy(h.y) - 8, r: 22, color: glow, intensity: 0.7, bloom: true });
      if (h.cls === 'arcanist') out.push({ x: sx(h.x) + h.dir * 4, y: sy(h.y) - 16, r: 14, color: L.plume[2], intensity: 0.8, bloom: true });
    }
    for (const s of w.shots) {
      if (s.kind === 'arrow') continue;
      out.push({ x: sx(s.x), y: sy(s.y), r: s.team === 'hero' ? 20 : 16, color: s.color, intensity: 0.9, bloom: true });
    }
    for (const a of w.areas) {
      if (a.kind === 'fire' || (a.kind === 'meteor' && a.delay < 0.4)) out.push({ x: sx(a.x), y: sy(a.y), r: a.r * 1.6, color: '#ff7a2a', intensity: 0.9, bloom: true });
      else if (a.kind === 'sanctuary') out.push({ x: sx(a.x), y: sy(a.y), r: a.r * 1.4, color: '#fff0a0', intensity: 0.7, bloom: true });
      else if (a.delay > 0 && a.team === 'mob') out.push({ x: sx(a.x), y: sy(a.y), r: a.r * 1.2, color: '#ff4a3a', intensity: 0.5 });
    }
    for (const m of w.mobs) {
      if (m.dead) continue;
      if (m.elite || m.boss) out.push({ x: sx(m.x), y: sy(m.y) - 8, r: m.boss ? 46 : 22, color: m.type!.ramp[3], intensity: 0.55, bloom: m.boss });
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

  private burst(f: Fx): void {
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

  private updateParticles(ctx: Ctx, dt: number, sx: (x: number) => number, sy: (y: number) => number): void {
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
    }
    ctx.globalAlpha = 1;
    this.particles = keep.length > 900 ? keep.slice(keep.length - 900) : keep;
  }

  // ------------------------------------------------------------------ overlay

  private drawOverlay(ctx: Ctx, w: World, sx: (x: number) => number, sy: (y: number) => number): void {
    // Mob health bars (only when hurt), and the boss's at the top.
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
    const boss = w.bossUnit;
    if (boss && !boss.dead) {
      const bw = Math.min(150, this.W - 40);
      const x = Math.round((this.W - bw) / 2);
      const y = 30;
      const name = this.textCanvas(`${boss.type!.name.toUpperCase()}`, { face: 'big', fill: ['#ffe8a0', '#ffb84a'], ink: '#140c14' });
      ctx.drawImage(name, Math.round(this.W / 2 - name.width / 2), y - name.height - 1);
      const sub = this.textCanvas(boss.type!.boss!.title.toUpperCase(), { face: 'small', fill: '#c8b8d8', ink: '#140c14' });
      ctx.drawImage(sub, Math.round(this.W / 2 - sub.width / 2), y + 7);
      ctx.fillStyle = '#140c14';
      ctx.fillRect(x - 1, y - 1, bw + 2, 7);
      ctx.fillStyle = '#3a1418';
      ctx.fillRect(x, y, bw, 5);
      ctx.fillStyle = boss.bossPhase ? '#ff4a2a' : '#c8283a';
      ctx.fillRect(x, y, Math.round((bw * boss.hp) / boss.maxHp), 5);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, y, Math.round((bw * boss.hp) / boss.maxHp), 1);
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

export { BIOMES, RARITY_COLOR };
