/**
 * Every spell you cast slams onto the screen. When your knight's skill roll stops, the skill's icon
 * pops out of the big reel, flies to the middle of the screen growing as it comes, hangs there a beat
 * (trembling, rays behind it from Epic up) and slams down: the moment it lands is the moment the skill
 * casts (the world waits for it: Unit.skillSlam, SLAM_TIME in world/skills.ts). On the slam: a flash
 * in the tier's light, a shockwave ring, the icon squashing into place and the skill's name stamped
 * under it. The rarer the skill, the bigger all of it: a Common is a quick thump, a Legendary nearly
 * fills the screen.
 *
 * Driven by the world's own clock (the slam's t / dur) while it flies, so it stays in step with the
 * cast through hit-stops and slow frames; the landing plays out in real time after. Reduce motion: no
 * flight, shake or rays, a short fade of the icon and the name.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SKILLS, TIER_NAME, tierStep, type SkillId } from '../core/skillbook';
import type { Game } from '../game';
import { Chunky, type Grad } from './fx/Chunky';
import { RAINBOW, raysUrl } from './fx/rays';
import { skillIconArt } from './skillIcons';
import { tierColor } from './SkillRoll';
import { uiSound } from './sound';
import s from './SpellSlam.module.css';

const GRAD: Grad[] = ['white', 'green', 'blue', 'purple', 'gold', 'rainbow'];
/** The icon at its biggest, as a share of the screen's short side, by tier step. */
const PEAK = [0.2, 0.25, 0.31, 0.38, 0.48, 0.58];
/** How long the landed icon and its name stay up (ms), by tier step. */
const HOLD = [260, 320, 420, 560, 760, 950];
/** The flash's strength, by tier step. */
const FLASH = [0.16, 0.2, 0.28, 0.38, 0.55, 0.65];

interface Landed {
  key: number;
  skill: SkillId;
  x: number;
  y: number;
  size: number;
}

let keys = 0;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Where the big reel's window is (the icon starts there), else the skill key, else bottom right. */
function reelCenter(): { x: number; y: number; size: number } {
  const el = document.querySelector('[data-spell-reel] [data-reel-win]') ?? document.querySelector('.k-skill');
  if (el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: Math.min(r.width, r.height) * 0.8 };
  }
  return { x: window.innerWidth - 80, y: window.innerHeight - 160, size: 48 };
}

export function SpellSlam({ game }: { game: Game }) {
  const iconRef = useRef<HTMLImageElement>(null);
  const trailRefs = useRef<(HTMLImageElement | null)[]>([]);
  const raysRef = useRef<HTMLImageElement>(null);
  const [landed, setLanded] = useState<Landed | null>(null);

  useEffect(() => {
    let raf = 0;
    let heroUid = -1;
    let slamObj: object | null = null;
    let from = { x: 0, y: 0, size: 48 };
    let last = { x: 0, y: 0, size: 0 };
    let lastN = 0;
    const hist: Array<{ x: number; y: number; size: number }> = [];
    const hide = () => {
      if (iconRef.current) iconRef.current.style.opacity = '0';
      for (const t of trailRefs.current) if (t) t.style.opacity = '0';
      if (raysRef.current) raysRef.current.style.opacity = '0';
    };
    const place = (el: HTMLElement | null, x: number, y: number, size: number, extra = '') => {
      if (!el) return;
      el.style.width = `${Math.round(size)}px`;
      el.style.height = `${Math.round(size)}px`;
      el.style.transform = `translate(${Math.round(x - size / 2)}px, ${Math.round(y - size / 2)}px)${extra}`;
    };
    const frame = () => {
      raf = requestAnimationFrame(frame);
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
        lastN = h.lastSkill?.n ?? 0;
        hide();
      }
      const calm = game.state.settings.reduceMotion;
      const sl = h.skillSlam;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const short = Math.min(W, H);
      if (sl) {
        const sk = SKILLS[sl.skill];
        const step = Math.min(5, tierStep(sk.tier));
        const icon = iconRef.current;
        if (sl !== slamObj) {
          // A new slam: the icon leaves the reel.
          slamObj = sl;
          from = reelCenter();
          hist.length = 0;
          if (icon) {
            const a = skillIconArt(sk.icon);
            icon.src = a.url;
            icon.style.setProperty('--tc', tierColor(sk.tier));
            icon.dataset.step = String(step);
          }
          for (const t of trailRefs.current) if (t) t.src = icon?.src ?? '';
          if (raysRef.current) raysRef.current.src = raysUrl(step >= 5 ? RAINBOW : [tierColor(sk.tier), '#ffffff'], 16, 0.5);
          if (!calm) uiSound(step >= 3 ? 'riser' : 'reelStart', step);
        }
        const u = Math.min(1, sl.t / sl.dur);
        const cx = W / 2;
        const cy = H * 0.42;
        const peak = Math.min(520, short * PEAK[step]);
        let x: number;
        let y: number;
        let size: number;
        let glow = 0;
        let rays = 0;
        if (calm) {
          x = cx;
          y = cy;
          size = peak * 0.92;
          glow = 0.5;
        } else if (u < 0.16) {
          // Pops out of the reel.
          const e = easeOut(u / 0.16);
          x = from.x;
          y = from.y - e * from.size * 0.25;
          size = from.size * (1 + 0.4 * e);
          glow = e;
        } else if (u < 0.7) {
          // Flies to the middle, growing as it comes.
          const v = (u - 0.16) / 0.54;
          const e = easeInOut(v);
          const sx = from.x;
          const sy = from.y - from.size * 0.25;
          const kx = (sx + cx) / 2 + (sx > cx ? 1 : -1) * short * 0.08;
          const ky = Math.min(sy, cy) - short * 0.12;
          x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * kx + e * e * cx;
          y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * ky + e * e * cy;
          size = from.size * 1.4 + (peak * 1.14 - from.size * 1.4) * easeIn(Math.min(1, v * 1.15));
          glow = 1;
          rays = step >= 3 ? Math.max(0, (v - 0.6) / 0.4) : 0;
        } else if (u < 0.9) {
          // Hangs there a beat, trembling harder the rarer it is.
          const v = (u - 0.7) / 0.2;
          const amp = (1 + step) * (0.4 + v);
          x = cx + Math.round(Math.sin(sl.t * 97) * amp);
          y = cy + Math.round(Math.cos(sl.t * 83) * amp * 0.6);
          size = peak * (1.14 + 0.05 * v);
          glow = 1 + v;
          rays = step >= 3 ? 1 : 0;
        } else {
          // And slams down.
          const v = (u - 0.9) / 0.1;
          x = cx;
          y = cy;
          size = peak * (1.19 - 0.27 * easeIn(v));
          glow = 2;
          rays = step >= 3 ? 1 : 0;
        }
        last = { x, y, size };
        if (icon) {
          icon.style.opacity = calm ? String(Math.min(1, u * 3)) : '1';
          icon.style.setProperty('--glow', String(glow));
          place(icon, x, y, size);
        }
        // Afterimages along the way in.
        hist.unshift({ x, y, size });
        if (hist.length > 7) hist.pop();
        trailRefs.current.forEach((t, i) => {
          if (!t) return;
          const p = hist[2 + i * 2];
          const on = !calm && u > 0.16 && u < 0.75 && p;
          t.style.opacity = on ? String(0.45 - i * 0.15) : '0';
          if (p) place(t, p.x, p.y, p.size);
        });
        const r = raysRef.current;
        if (r) {
          r.style.opacity = calm ? '0' : String(rays * (step >= 4 ? 0.95 : 0.7));
          place(r, x, y, size * (step >= 4 ? 3.2 : 2.6), ` rotate(${Math.round((sl.t * (step >= 5 ? 60 : 40)) % 360)}deg)`);
        }
        return;
      }
      // The slam is over: if the skill fired (its landing counted), stamp it.
      if (slamObj) {
        const sk = h.lastSkill && h.lastSkill.n !== lastN ? h.lastSkill.skill : null;
        slamObj = null;
        hide();
        if (sk) setLanded({ key: ++keys, skill: sk, x: last.x || W / 2, y: last.y || H * 0.42, size: last.size || Math.min(520, short * PEAK[0]) });
      }
      lastN = h.lastSkill?.n ?? lastN;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
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
      <img ref={iconRef} className={s.icon} alt="" draggable={false} />
      {landed && <Stamp key={landed.key} landed={landed} calm={game.state.settings.reduceMotion} onDone={() => setLanded((c) => (c?.key === landed.key ? null : c))} />}
    </div>
  );
}

/** The landing: a flash, a shockwave, the icon squashing into place, the name stamped under it. */
function Stamp({ landed, calm, onDone }: { landed: Landed; calm: boolean; onDone: () => void }) {
  const sk = SKILLS[landed.skill];
  const step = Math.min(5, tierStep(sk.tier));
  const tc = tierColor(sk.tier);
  const hold = HOLD[step];
  useEffect(() => {
    if (!calm) uiSound(step >= 2 ? 'revealBig' : 'stamp', step);
    const t = window.setTimeout(onDone, hold + 420);
    return () => window.clearTimeout(t);
  }, []);
  const a = skillIconArt(sk.icon);
  const vars = {
    '--x': `${Math.round(landed.x)}px`,
    '--y': `${Math.round(landed.y)}px`,
    '--size': `${Math.round(landed.size)}px`,
    '--tc': tc,
    '--hold': `${hold}ms`,
    '--flash': FLASH[step],
  } as CSSProperties;
  const nameSize = [9, 10, 11, 12, 14, 16][step];
  return (
    <div className={s.stamp} style={vars} data-step={step} data-calm={calm || undefined}>
      {!calm && <i className={s.flash} style={{ background: step >= 5 ? `linear-gradient(90deg, ${RAINBOW.join(', ')})` : step === 0 ? '#ffffff' : tc }} />}
      {!calm && <i className={s.ring} />}
      {!calm && step >= 2 && <i className={`${s.ring} ${s.ring2}`} />}
      {!calm && step >= 3 && <img className={s.stampRays} src={raysUrl(step >= 5 ? RAINBOW : [tc, '#ffffff'], 16, 0.5)} alt="" draggable={false} />}
      <img className={s.stampIcon} src={a.url} alt="" draggable={false} />
      <span className={s.name}>
        <Chunky text={`${sk.name.toUpperCase()}!`} size={nameSize} grad={GRAD[step]} />
        {step >= 2 && <span className={s.tier}>{step >= 5 ? 'JACKPOT!' : TIER_NAME[sk.tier].toUpperCase()}</span>}
      </span>
    </div>
  );
}
