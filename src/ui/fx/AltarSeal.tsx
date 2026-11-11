/**
 * A new game's altar, sealed: Dumpster Legend's padlocked dumpster (its DumpsterLock: "click the
 * spinner for the lock and metal to fall off and then it starts spinning"), made the Oracle's. Two
 * heavy chains bind the reels, one across and one down, and a brass padlock hangs where they cross,
 * its keyhole alight with her violet magic: it breathes (the keyhole and the glow behind it swell and
 * ebb), jiggles now and then, a shine sweeps across the brass and glints run along the chains, and
 * motes of light drift up off it. A tap jolts it and rattles the chains (the clank), the shackle
 * springs open in a flash, a ring of light and a burst of sparks out of the keyhole (the break), and
 * the lock and the four lengths of chain drop off the altar on the same launches, gravity and
 * whole-pixel steps as the dumpster's metal; the altar starts to spin while they still fall
 * (Game.breakSeal). Shown until the pieces are gone, then never again.
 *
 * All of it is pixel art (sealArt.ts) on the altar's own grid: one art pixel is the altar's (var(--u),
 * as AltarReels draws it), everything sits on whole art pixels and moves in whole-pixel steps.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Game } from '../../game';
import { uiSound } from '../sound';
import { chainArt, sealArt, sealLayout, SHINE_N, type Rect } from './sealArt';
import { readU } from './util';
import s from './altarSeal.module.css';

type Phase = 'idle' | 'hit' | 'open' | 'fall';
const PIECES = ['lock', 'top', 'bottom', 'left', 'right'] as const;
type Piece = (typeof PIECES)[number];
const CHAINS = ['bottom', 'top', 'left', 'right'] as const;

/**
 * Launch velocities and start delays of the fall: Dumpster Legend's, in its stage pixels (6 to an art
 * pixel), so the pieces move the same in art pixels at any size. The lock flies as the padlock did,
 * the chain down's top length as the strap, the chain across as the plates, and its bottom length
 * slips off last.
 */
const LAUNCH: Record<Piece, { vx: number; vy: number; delay: number }> = {
  lock: { vx: 150, vy: -640, delay: 0 },
  top: { vx: -36, vy: -240, delay: 50 },
  left: { vx: -100, vy: -170, delay: 100 },
  right: { vx: 120, vy: -110, delay: 160 },
  bottom: { vx: 42, vy: -90, delay: 120 },
};
const STAGE_PX = 6;
const GRAVITY = 3300;
const FALL_MS = 1150;
/** When the shackle springs, the pieces start to fall, and the altar spins (ms after the tap). */
const T_OPEN = 170;
const T_FALL = 320;
const T_ROLL = 720;

/**
 * Sparks out of the keyhole as it breaks, well past the lock (art pixels; multiples of 3, so each
 * third of the way is whole).
 */
const SPARKS: ReadonlyArray<readonly [number, number, 'w' | 'v' | 'g']> = [
  [-27, -18, 'w'],
  [27, -18, 'w'],
  [-36, 9, 'v'],
  [36, 9, 'v'],
  [-18, -27, 'g'],
  [18, -36, 'g'],
  [-45, -9, 'g'],
  [45, -18, 'v'],
  [-9, -45, 'w'],
  [9, 36, 'v'],
  [-27, 27, 'w'],
  [36, 27, 'g'],
];

/** Motes of light drifting up off the lock: [x from the keyhole, y from it, delay s, length s, color]. */
const MOTES: ReadonlyArray<readonly [number, number, number, number, 'w' | 'v' | 'p' | 'g']> = [
  [-20, 2, 0, 2.4, 'v'],
  [17, 8, 0.4, 2.1, 'p'],
  [-9, 12, 0.9, 2.6, 'g'],
  [24, -4, 1.3, 2.2, 'v'],
  [-27, -8, 1.7, 2.5, 'p'],
  [6, 14, 0.2, 2.3, 'w'],
  [-15, -14, 2.1, 2.0, 'g'],
  [12, -16, 1.1, 2.4, 'v'],
  [31, 6, 0.6, 2.7, 'g'],
  [-33, 10, 1.9, 2.2, 'w'],
  [1, -20, 1.5, 2.0, 'p'],
  [21, 14, 2.4, 2.5, 'w'],
];

/** How far a glint runs along a chain in each step (art pixels). */
const GLINT_STEP = 4;
const GLINT_W = 12;

interface Box {
  /** The altar's size in art pixels, and where its reel window is in it. */
  W: number;
  H: number;
  win: Rect | null;
  u: number;
}

export function AltarSeal({ game }: { game: Game }) {
  const sealed = !!game.state.roll.sealed;
  const [phase, setPhase] = useState<Phase | null>(sealed ? 'idle' : null);
  const [box, setBox] = useState<Box | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const pieces = useRef<Partial<Record<Piece, HTMLElement | null>>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const raf = useRef(0);
  const tapped = useRef(false);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    let tries = 0;
    let wait = 0;
    let watched: Element | null = null;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    // In the altar's own art pixels (var(--u), as AltarReels draws it), so the two match; and where
    // its reel window is (the reels lay it out once they've measured: look again until it's there,
    // drawing nothing till then, and keep an eye on it).
    const measure = () => {
      cancelAnimationFrame(wait);
      const u = readU(el);
      const r = el.getBoundingClientRect();
      const bank = el.parentElement?.querySelector('[data-altar][data-bulbs]') ?? null;
      let win: Rect | null = null;
      if (bank) {
        if (bank !== watched) {
          if (watched) ro?.unobserve(watched);
          ro?.observe(bank);
          watched = bank;
        }
        const b = bank.getBoundingClientRect();
        win = { x: Math.round((b.left - r.left) / u), y: Math.round((b.top - r.top) / u), w: Math.round(b.width / u), h: Math.round(b.height / u) };
      } else if (tries++ < 60) {
        wait = requestAnimationFrame(measure);
        return;
      }
      const next: Box = { W: Math.ceil(el.offsetWidth / u), H: Math.ceil(el.offsetHeight / u), win, u };
      setBox((p) => (p && p.W === next.W && p.H === next.H && p.u === next.u && JSON.stringify(p.win) === JSON.stringify(next.win) ? p : next));
    };
    measure();
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      cancelAnimationFrame(wait);
    };
  }, [phase === null]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      cancelAnimationFrame(raf.current);
      // Gone mid-break (a tab changed, the screen closed): the seal is broken all the same.
      if (tapped.current) game.breakSeal();
    },
    [game],
  );
  // Broken some other way (not by this tap): nothing to show.
  useEffect(() => {
    if (!sealed && phase === 'idle') setPhase(null);
  }, [sealed, phase]);

  if (!phase) return null;

  const u = box?.u ?? 3;
  const snap = (v: number) => Math.round(v / u) * u;
  const at = (n: number) => n * u;

  const fall = () => {
    const t0 = performance.now();
    // Dumpster Legend's stage pixels to this page's (the same motion in art pixels).
    const k = u / STAGE_PX;
    const frame = () => {
      const ms = performance.now() - t0;
      for (const p of PIECES) {
        const el = pieces.current[p];
        if (!el) continue;
        const L = LAUNCH[p];
        const sec = Math.max(0, ms - L.delay) / 1000;
        const x = L.vx * k * sec;
        const y = L.vy * k * sec + 0.5 * GRAVITY * k * sec * sec;
        el.style.transform = `translate3d(${snap(x)}px, ${snap(y)}px, 0)`;
        // Fades out in quarter steps near the end.
        el.style.opacity = String(sec < 0.6 ? 1 : Math.max(0, 1 - Math.ceil((sec - 0.6) / 0.08) * 0.25));
      }
      if (ms < FALL_MS) raf.current = requestAnimationFrame(frame);
      else setPhase(null);
    };
    raf.current = requestAnimationFrame(frame);
  };

  const buzz = (ms: number) => {
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* no buzz */
    }
  };

  const open = () => {
    if (phase !== 'idle') return;
    tapped.current = true;
    setPhase('hit');
    uiSound('lockTap');
    buzz(12);
    timers.current.push(
      setTimeout(() => {
        setPhase('open');
        uiSound('lockBreak');
        uiSound('glowUp');
        buzz(20);
      }, T_OPEN),
      setTimeout(() => {
        setPhase('fall');
        buzz(35);
        fall();
      }, T_FALL),
      // The altar spins while the pieces are still falling.
      setTimeout(() => {
        tapped.current = false;
        game.breakSeal();
      }, T_ROLL),
    );
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };

  const broken = phase === 'open' || phase === 'fall';
  const L = box ? sealLayout(box.W, box.H, box.win) : null;
  const art = L ? sealArt(L.size) : null;
  const chains = L ? chainArt(L) : null;
  const whole: CSSProperties | undefined = L ? { left: 0, top: 0, width: at(L.W), height: at(L.H) } : undefined;
  const pic: CSSProperties | undefined = L && art ? { left: 0, top: at(-art.pad), width: at(L.lockW), height: at(L.lockH + art.pad) } : undefined;
  // The glints run along the chains in whole steps, from off one end to off the other.
  const runX = L ? Math.ceil((L.W + GLINT_W) / GLINT_STEP) : 0;
  const runY = L ? Math.ceil((L.H + GLINT_W) / GLINT_STEP) : 0;
  return (
    <div
      ref={root}
      className={s.seal}
      data-phase={phase}
      data-calm={game.state.settings.reduceMotion || undefined}
      data-altar-seal
      role="button"
      tabIndex={0}
      aria-label="Break the seal"
      onClick={open}
      onKeyDown={onKey}
      style={
        {
          ['--px' as string]: `${u}px`,
          ['--run-x' as string]: `${at(runX * GLINT_STEP)}px`,
          ['--run-y' as string]: `${at(runY * GLINT_STEP)}px`,
        } as CSSProperties
      }
    >
      <div className={s.tint} />
      {L && art && chains && (
        <>
          {(
            [
              [art.glow, s.glow],
              [art.glowBig, s.glowBig],
            ] as const
          ).map(([g, cls]) => (
            <img
              key={cls}
              className={cls}
              src={g.src}
              alt=""
              draggable={false}
              style={{ left: at(L.gx - Math.floor(g.w / 2)), top: at(L.gy - Math.floor(g.h / 2)), width: at(g.w), height: at(g.h) }}
            />
          ))}
          {CHAINS.map((p) => (
            <img
              key={p}
              ref={(el) => {
                pieces.current[p] = el;
              }}
              className={s.chain}
              data-run={p === 'left' || p === 'right' ? 'x' : 'y'}
              src={chains[p]}
              alt=""
              draggable={false}
              style={whole}
            />
          ))}
          {phase === 'idle' && (
            <div className={s.glints} aria-hidden>
              <div className={s.glintX} style={{ width: at(GLINT_W), height: at(L.H), animationTimingFunction: `steps(${runX}, end)` }}>
                <img src={chains.glintAcross} alt="" draggable={false} style={{ ...whole, animationTimingFunction: `steps(${runX}, end)` }} />
              </div>
              <div className={s.glintY} style={{ width: at(L.W), height: at(GLINT_W), animationTimingFunction: `steps(${runY}, end)` }}>
                <img src={chains.glintDown} alt="" draggable={false} style={{ ...whole, animationTimingFunction: `steps(${runY}, end)` }} />
              </div>
            </div>
          )}
          {!broken && (
            <div className={s.mote} aria-hidden>
              {MOTES.map(([x, y, d, len, c], i) => (
                <i key={i} data-c={c} style={{ left: at(L.kx + x), top: at(L.ky + y), animationDelay: `${d}s`, animationDuration: `${len}s` }} />
              ))}
            </div>
          )}
          {/* It breaks: a ring of light goes out from behind the lock. */}
          {broken && (
            <i
              className={s.ring}
              aria-hidden
              style={
                {
                  backgroundImage: `url(${art.ring.src})`,
                  width: at(art.ring.n),
                  height: at(art.ring.n),
                  left: at(L.gx - (art.ring.n - 1) / 2),
                  top: at(L.gy - (art.ring.n - 1) / 2),
                  ['--ring-w' as string]: `${at(art.ring.n * art.ring.frames)}px`,
                } as CSSProperties
              }
            />
          )}
          <div
            ref={(el) => {
              pieces.current.lock = el;
            }}
            className={s.lock}
            style={{ left: at(L.lockX), top: at(L.lockY), width: at(L.lockW), height: at(L.lockH) }}
          >
            {/* (What the tutorial points at: the lock, shut. Its pictures reach higher, for the shackle to spring into.) */}
            <div className={s.body} data-seal-disc>
              <img src={broken ? art.lockOpen : art.lock} alt="" draggable={false} style={pic} />
              {!broken && <img className={s.lit} src={art.lockBright} alt="" draggable={false} style={pic} />}
              {!broken && (
                <i
                  className={s.shine}
                  style={{ ...pic, backgroundImage: `url(${art.shine})`, ['--shine-w' as string]: `${at(L.lockW * SHINE_N)}px` } as CSSProperties}
                />
              )}
            </div>
          </div>
          {broken && (
            <div className={s.burst} style={{ left: at(L.kx), top: at(L.ky) }} aria-hidden>
              {SPARKS.map(([dx, dy, c], i) => (
                <span key={i} className={s.spark} data-c={c} style={{ '--dx': `${at(dx)}px`, '--dy': `${at(dy)}px` } as CSSProperties} />
              ))}
            </div>
          )}
          <div className={s.flash} />
        </>
      )}
    </div>
  );
}
