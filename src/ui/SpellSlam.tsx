/**
 * Your Legendary spells (and the jackpot) slam onto the screen, then drop into the spell. When your
 * knight's skill roll stops on one, its icon pops out of the big reel, flies up over the knight growing
 * as it comes, hangs there a beat (trembling, rays behind it) and slams down: a flash in the tier's
 * light, a shockwave ring, the icon squashing into place and the skill's name stamped under it. Then
 * it rises a touch and dives into where the spell starts, shrinking to the world's own pixel on the
 * way: the Lancer's spear tip, the Blade's raised sword, the Ranger's bow, the Guardian's fist, the
 * light gathering over the Cleric, the clock over Aeon. It lands there a beat before the cast and
 * flares white, and the spell goes off from it (the world waits for it: Unit.skillSlam, world/slam.ts
 * has the beats); Meteor Storm's icon falls as the storm's first meteor and hits as the storm casts.
 * The world does the rest: the flare where it landed, the dark round the knight and its power-up
 * (render/castFx.ts, render/pf/castPose.ts).
 *
 * Drawn once a frame right after the canvas (Game.onFrame), from the same tick of the world's clock
 * (the slam's t / dur), so it keeps in step with the knight and the cast through hit-stops and slow
 * frames; the stamp's flash and rays play out in real time. Where the knight is on the page comes
 * from the renderer (Game.view, render/view.ts). Reduce motion: no flight, shake, rays or ring: the
 * icon fades in over the knight, its name is stamped, and it fades as the skill casts.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SKILLS, TIER_NAME, tierStep, type SkillId } from '../core/skillbook';
import type { Game } from '../game';
import { rgb } from '../render/pixel/buf';
import { castAnchor, castTop, sheetOf } from '../render/pf/castPose';
import { toScreen } from '../render/view';
import { SLAM_BEATS, slamArrive } from '../world/slam';
import { Chunky, type Grad } from './fx/Chunky';
import { RAINBOW, raysUrl } from './fx/rays';
import { DIVE_RISE, STAMPED, diveTurns, slamPlace, stamped, wholePixels, type SlamPoints } from './fx/slamPath';
import { skillIconArt } from './skillIcons';
import { tierColor } from './SkillRoll';
import { uiSound } from './sound';
import s from './SpellSlam.module.css';

const GRAD: Grad[] = ['white', 'green', 'blue', 'purple', 'gold', 'rainbow'];
/** The icon at its biggest, as a share of the screen's short side, by tier step (it hangs over the knight). */
const PEAK = [0.2, 0.25, 0.31, 0.38, 0.3, 0.36];
/** How long the stamped name stays up (ms), by tier step. */
const HOLD = [260, 320, 420, 560, 700, 900];
/** The flash's strength, by tier step. */
const FLASH = [0.16, 0.2, 0.28, 0.38, 0.42, 0.5];
/** The name's size (art px of the UI), by tier step. */
const NAME = [9, 10, 11, 12, 14, 16];
/** Meteor Storm's icon lands as a meteor, a little bigger than the world's pixel. */
const METEOR = 1.6;
/** Room between the knight's raised weapon and the name, and from the screen's top (px). */
const GAP = 10;
const TOP = 10;
/** The shockwave ring as the icon is stamped: world seconds it lasts, and its reach (shares of the icon's size). */
const RING_LIFE = 0.24;
const RING_FROM = 0.5;
const RING_TO = 1.05;
/** The share of the wait in its spot after which the landed icon burns white, about to go off. */
const HOT = 0.45;
const INK = '#1a1326';

interface Landed {
  key: number;
  skill: SkillId;
  x: number;
  y: number;
  size: number;
  /** The name's size (art px of the UI), fitted to the screen's width. */
  name: number;
}

let keys = 0;

/** Where the big reel's window is (the icon starts there), else the skill key, else bottom right. */
function reelCenter(): { x: number; y: number; size: number } {
  const el = document.querySelector('[data-spell-reel] [data-reel-win]') ?? document.querySelector('.k-skill');
  if (el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: Math.min(r.width, r.height) * 0.8 };
  }
  return { x: window.innerWidth - 80, y: window.innerHeight - 160, size: 48 };
}

/** The UI's art pixel (CSS px), which the stamped name and the ring are measured in. */
function uiUnit(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u'));
  return Number.isFinite(v) && v > 0 ? v : 3;
}

/** The name's size for its tier, smaller if it would run off a narrow screen (art px of the UI). */
function nameFit(name: string, size: number, width: number, u: number): number {
  // (The lettering runs about 0.68 em a letter with its outline.)
  const fit = (width - 24) / ((name.length + 1) * 0.68 * u);
  return Math.max(6, Math.min(size, Math.floor(fit * 2) / 2));
}

/** How tall the stamped name and its tier are under the icon (px). */
function nameHeight(size: number, u: number): number {
  return size * u * 1.15 + u * 6;
}

/**
 * The shockwave ring `f` of the way through (0 to 1) on its canvas (`n` px square, at the UI's pixel):
 * a ring of the tier's light in an ink rim, thick and white-hot as it leaves the icon, thinning and
 * breaking up as it goes out.
 */
function drawRing(cv: HTMLCanvasElement, n: number, f: number, r0: number, r1: number, color: string): void {
  const x = cv.getContext('2d');
  if (!x) return;
  const img = x.createImageData(n, n);
  const c = (n - 1) / 2;
  const r = r0 + (r1 - r0) * (1 - Math.pow(1 - f, 2));
  const thick = f < 0.34 ? 3 : f < 0.67 ? 2 : 1;
  const [lr, lg, lb] = rgb(color);
  const [ir, ig, ib] = rgb(INK);
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const d = Math.hypot(px - c, py - c) - r;
      let col: readonly [number, number, number] | null = null;
      if (d >= 0 && d < thick) col = f < 0.2 ? [255, 255, 255] : [lr, lg, lb];
      else if (d >= -1 && d < 0) col = [ir, ig, ib];
      else if (d >= thick && d < thick + 1) col = [ir, ig, ib];
      if (!col) continue;
      // Breaking up as it fades: every other pixel round it, then every third.
      if (f > 0.7 && ((px + py) % (f > 0.86 ? 3 : 2)) !== 0) continue;
      const i = (py * n + px) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
}

export function SpellSlam({ game }: { game: Game }) {
  const iconRef = useRef<HTMLImageElement>(null);
  const trailRefs = useRef<(HTMLImageElement | null)[]>([]);
  const raysRef = useRef<HTMLImageElement>(null);
  const ringRef = useRef<HTMLCanvasElement>(null);
  const [landed, setLanded] = useState<Landed | null>(null);

  useEffect(() => {
    let heroUid = -1;
    let slamObj: object | null = null;
    let from = { x: 0, y: 0, size: 48 };
    /** The icon's size hanging over the knight, the name's, and the UI's pixel (set as a slam starts). */
    let size = 120;
    let name = 14;
    let u0 = 3;
    let wasStamped = false;
    /** Where the ring goes out from (set as the icon is stamped), and its canvas's side (UI px). */
    let ringAt = { x: 0, y: 0 };
    let ringN = 0;
    /** The dive's turn (quarters), for an icon drawn heading down-left (the comets), set as it sets off. */
    let turns: 0 | 1 | 2 | 3 | null = null;
    const hist: Array<{ x: number; y: number; size: number; rot: number }> = [];
    const hide = () => {
      if (iconRef.current) iconRef.current.style.opacity = '0';
      for (const t of trailRefs.current) if (t) t.style.opacity = '0';
      if (raysRef.current) raysRef.current.style.opacity = '0';
      if (ringRef.current) ringRef.current.style.opacity = '0';
    };
    const dpr = () => Math.min(3, window.devicePixelRatio || 1);
    /** Puts an element's middle at (x, y), `size` square, on whole device pixels. */
    const place = (el: HTMLElement | null, x: number, y: number, sz: number, extra = '') => {
      if (!el) return;
      const d = dpr();
      const px = (v: number) => Math.round(v * d) / d;
      el.style.width = `${px(sz)}px`;
      el.style.height = `${px(sz)}px`;
      el.style.transform = `translate(${px(x - sz / 2)}px, ${px(y - sz / 2)}px)${extra}`;
    };
    const frame = () => {
      const w = game.world;
      const h = w?.heroes.find((x) => x.slot === w.controlled);
      if (!w || !h) {
        heroUid = -1;
        slamObj = null;
        hide();
        return;
      }
      if (h.uid !== heroUid) {
        heroUid = h.uid;
        slamObj = null;
        hide();
      }
      const sl = h.skillSlam;
      if (!sl) {
        // The skill cast from where its icon landed (or the knight fell): the world has it now.
        if (slamObj) {
          slamObj = null;
          hide();
        }
        return;
      }
      const calm = game.state.settings.reduceMotion;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const short = Math.min(W, H);
      const sk = SKILLS[sl.skill];
      const step = Math.min(5, tierStep(sk.tier));
      const art = skillIconArt(sk.icon);
      const icon = iconRef.current;
      // The knight on the page: its feet, and the top of its pose (the weapon raised).
      const view = game.view;
      const k = view?.k ?? 3;
      const feet = view ? toScreen(view, h.x, h.y, true) : { x: W / 2, y: H * 0.55 };
      const head = feet.y + castTop(sheetOf(h), sl.face, sl.skill) * k;
      if (sl !== slamObj) {
        // A new slam: the icon leaves the reel. Its size fits over the knight, its name under it.
        slamObj = sl;
        from = reelCenter();
        hist.length = 0;
        wasStamped = false;
        turns = null;
        u0 = uiUnit();
        name = nameFit(sk.name.toUpperCase() + '!', NAME[step], W, u0);
        const room = head - GAP - nameHeight(name, u0) - TOP;
        size = wholePixels(Math.max(art.w * 6, Math.min(short * PEAK[step], 520, room)), art.w, dpr());
        if (icon) {
          icon.src = art.url;
          icon.style.setProperty('--tc', tierColor(sk.tier));
          icon.dataset.step = String(step);
        }
        for (const t of trailRefs.current) if (t) t.src = art.url;
        if (raysRef.current) raysRef.current.src = raysUrl(step >= 5 ? RAINBOW : [tierColor(sk.tier), '#ffffff'], 16, 0.5);
        if (!calm) uiSound(step >= 3 ? 'riser' : 'reelStart', step);
      }
      // Where it hangs: over the knight, the name between them (kept on the screen).
      const hang = {
        x: Math.max(size * 0.6 + 8, Math.min(W - size * 0.6 - 8, feet.x)),
        y: Math.max(TOP + size / 2, head - GAP - nameHeight(name, u0) - (size * STAMPED) / 2),
        size,
      };
      // Where it lands: where its spell starts, at the world's pixel (the meteor bigger). Its middle
      // goes on the corner of the pixel it lands in, so its ten pixels sit on the world's own grid,
      // square on the knight's sprite and on the clock or the light it hands over to (the meteor is
      // still falling as it hits: just its spot).
      const a = castAnchor(h);
      const meteor = sl.skill === 'meteorStorm';
      const at = a && view ? toScreen(view, meteor ? a.x : Math.floor(a.x), meteor ? a.y : Math.floor(a.y)) : { x: hang.x, y: hang.y };
      const to = { ...at, size: wholePixels(art.w * k * (meteor ? METEOR : 1), art.w, dpr()) };
      const u = Math.min(1, sl.t / sl.dur);
      if (!wasStamped && stamped(u)) {
        wasStamped = true;
        ringAt = { x: hang.x, y: hang.y };
        setLanded({ key: ++keys, skill: sl.skill, x: hang.x, y: hang.y, size: size * STAMPED, name });
        if (!calm) uiSound(step >= 2 ? 'revealBig' : 'stamp', step);
      }
      if (calm) {
        // No flight: it fades in over the knight and out as the skill casts.
        if (icon) {
          icon.style.opacity = String(Math.max(0, Math.min(1, u / 0.25, (1 - u) / 0.15)));
          icon.style.setProperty('--glow', '0.5');
          delete icon.dataset.hot;
          place(icon, hang.x, hang.y, size * STAMPED);
        }
        for (const t of trailRefs.current) if (t) t.style.opacity = '0';
        if (raysRef.current) raysRef.current.style.opacity = '0';
        if (ringRef.current) ringRef.current.style.opacity = '0';
        return;
      }
      const arrive = slamArrive(sl.skill);
      const pts: SlamPoints = { from, hang, to, short };
      const p = slamPlace(u, sl.t, pts, step, arrive);
      // A comet turns to face its dive, a quarter at a time, as it rises before dropping.
      let rot = 0;
      if (p.diving && (sk.icon === 'comet' || sk.icon === 'skyfall')) {
        turns ??= diveTurns(hang.x, hang.y, to.x, to.y);
        const total = turns === 3 ? -1 : turns;
        const n = Math.abs(total);
        const done = Math.min(n, Math.floor(Math.min(1, p.dive / DIVE_RISE) * (n + 1)));
        rot = Math.sign(total) * done * 90;
      }
      const sz = wholePixels(p.size, art.w, dpr());
      if (icon) {
        icon.style.opacity = '1';
        icon.style.setProperty('--glow', String(p.glow));
        // Landed in its spot, about to go off: it burns white.
        if (p.arrived && u >= arrive + (1 - arrive) * HOT) icon.dataset.hot = '';
        else delete icon.dataset.hot;
        place(icon, p.x, p.y, sz, `${p.sx !== 1 || p.sy !== 1 ? ` scale(${p.sx}, ${p.sy})` : ''}${rot ? ` rotate(${rot}deg)` : ''}`);
      }
      // Afterimages along the way in, and down the dive (never bigger than the icon as it shrinks).
      hist.unshift({ x: p.x, y: p.y, size: sz, rot });
      if (hist.length > 7) hist.pop();
      trailRefs.current.forEach((t, i) => {
        if (!t) return;
        const q = hist[2 + i * 2];
        t.style.opacity = p.trail && q ? String(0.45 - i * 0.15) : '0';
        if (q) place(t, q.x, q.y, p.diving ? Math.min(q.size, sz) : q.size, q.rot ? ` rotate(${q.rot}deg)` : '');
      });
      const r = raysRef.current;
      if (r) {
        r.style.opacity = String(step >= 3 ? p.rays * (step >= 4 ? 0.95 : 0.7) : 0);
        place(r, p.x, p.y, sz * (step >= 4 ? 3.2 : 2.6), ` rotate(${Math.round((sl.t * (step >= 5 ? 60 : 40)) % 360)}deg)`);
      }
      // The shockwave going out from the stamp, on the slam's clock.
      const ring = ringRef.current;
      if (ring) {
        const f = (sl.t - SLAM_BEATS.slam * sl.dur) / RING_LIFE;
        if (f < 0 || f >= 1) ring.style.opacity = '0';
        else {
          const big = (size * STAMPED) / u0;
          const n = Math.ceil(big * RING_TO * 2 + 8);
          if (n !== ringN) {
            ringN = n;
            ring.width = ring.height = n;
          }
          drawRing(ring, n, f, big * RING_FROM, big * RING_TO, tierColor(sk.tier));
          ring.style.opacity = '1';
          place(ring, ringAt.x, ringAt.y, n * u0);
        }
      }
    };
    return game.onFrame(frame);
  }, [game]);

  return (
    <div className={s.root} aria-hidden>
      <img ref={raysRef} className={s.rays} alt="" draggable={false} />
      {[0, 1].map((i) => (
        <img
          key={i}
          ref={(el) => {
            trailRefs.current[i] = el;
          }}
          className={s.trail}
          alt=""
          draggable={false}
        />
      ))}
      {landed && <Stamp key={landed.key} landed={landed} calm={game.state.settings.reduceMotion} onDone={() => setLanded((c) => (c?.key === landed.key ? null : c))} />}
      <canvas ref={ringRef} className={s.ring} />
      <img ref={iconRef} className={s.icon} alt="" draggable={false} />
    </div>
  );
}

/**
 * The stamp, as the icon slams down over the knight: a flash, rays, and the skill's name stamped
 * under it (the icon itself goes on into the spell; the ring is drawn on the slam's clock above).
 */
function Stamp({ landed, calm, onDone }: { landed: Landed; calm: boolean; onDone: () => void }) {
  const sk = SKILLS[landed.skill];
  const step = Math.min(5, tierStep(sk.tier));
  const tc = tierColor(sk.tier);
  const hold = HOLD[step];
  useEffect(() => {
    const t = window.setTimeout(onDone, hold + 420);
    return () => window.clearTimeout(t);
  }, []);
  const vars = {
    '--x': `${Math.round(landed.x)}px`,
    '--y': `${Math.round(landed.y)}px`,
    '--size': `${Math.round(landed.size)}px`,
    '--tc': tc,
    '--hold': `${hold}ms`,
    '--flash': FLASH[step],
  } as CSSProperties;
  return (
    <div className={s.stamp} style={vars} data-step={step} data-calm={calm || undefined}>
      {!calm && <i className={s.flash} style={{ background: step >= 5 ? `linear-gradient(90deg, ${RAINBOW.join(', ')})` : step === 0 ? '#ffffff' : tc }} />}
      {!calm && step >= 3 && <img className={s.stampRays} src={raysUrl(step >= 5 ? RAINBOW : [tc, '#ffffff'], 16, 0.5)} alt="" draggable={false} />}
      <span className={s.name}>
        <Chunky text={`${sk.name.toUpperCase()}!`} size={landed.name} grad={GRAD[step]} />
        {step >= 2 && <span className={s.tier}>{step >= 5 ? 'JACKPOT!' : TIER_NAME[sk.tier].toUpperCase()}</span>}
      </span>
    </div>
  );
}
