/**
 * A new game's altar, sealed: Dumpster Legend's padlocked dumpster (its DumpsterLock: "click the
 * spinner for the lock and metal to fall off and then it starts spinning"), made a magic seal. Two
 * runic bands and a third down the middle bind the reels, the Oracle's seal on them: it breathes,
 * wiggles now and then, a glint runs along the bands and motes of light drift up off it. A tap jolts
 * it (the clank), it cracks open in a flash with a ring of light and a burst of sparks (the break),
 * and everything drops off the altar on the same launches, gravity and whole-pixel steps as the
 * dumpster's metal, the seal in two halves; the altar starts to spin while the pieces still fall
 * (Game.breakSeal). Shown until the pieces are gone, then never again.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Game } from '../../game';
import { uiSound } from '../sound';
import { SEAL, sealArt } from './sealArt';
import { readU } from './util';
import s from './altarSeal.module.css';

type Phase = 'idle' | 'hit' | 'open' | 'fall';
const PIECES = ['strap', 'plateA', 'plateB', 'left', 'right'] as const;
type Piece = (typeof PIECES)[number];

/**
 * Launch velocities and start delays of the fall: Dumpster Legend's, in its stage pixels (6 to an art
 * pixel), so the pieces move the same in art pixels at any size. The seal's right half flies as the
 * padlock did, its left half the mirror of it.
 */
const LAUNCH: Record<Piece, { vx: number; vy: number; delay: number }> = {
  right: { vx: 150, vy: -640, delay: 0 },
  left: { vx: -130, vy: -600, delay: 20 },
  strap: { vx: -36, vy: -240, delay: 50 },
  plateA: { vx: -100, vy: -170, delay: 100 },
  plateB: { vx: 120, vy: -110, delay: 160 },
};
const STAGE_PX = 6;
const GRAVITY = 3300;
const FALL_MS = 1150;
/** When the seal cracks, the bindings start to fall, and the altar spins (ms after the tap). */
const T_OPEN = 170;
const T_FALL = 320;
const T_ROLL = 720;

/**
 * Sparks out of the crack as it breaks, well past the rim (art pixels; multiples of 3, so each third of
 * the way is whole): the padlock's six, three times as far, and six more.
 */
const SPARKS: ReadonlyArray<readonly [number, number, 'w' | 'v' | 'c']> = [
  [-27, -18, 'w'],
  [27, -18, 'w'],
  [-36, 9, 'v'],
  [36, 9, 'v'],
  [-18, -27, 'c'],
  [18, -36, 'c'],
  [-45, -9, 'c'],
  [45, -18, 'v'],
  [-9, -45, 'w'],
  [9, 36, 'v'],
  [-27, 27, 'w'],
  [36, 27, 'c'],
];

/** Motes of light drifting up off the seal: [x from the middle, y from the middle, delay s, length s, color]. */
const MOTES: ReadonlyArray<readonly [number, number, number, number, 'w' | 'v' | 'c' | 'g']> = [
  [-22, 4, 0, 2.4, 'v'],
  [18, 10, 0.4, 2.1, 'c'],
  [-8, 14, 0.9, 2.6, 'g'],
  [26, -2, 1.3, 2.2, 'v'],
  [-30, -6, 1.7, 2.5, 'c'],
  [6, 16, 0.2, 2.3, 'w'],
  [-16, -12, 2.1, 2.0, 'g'],
  [12, -14, 1.1, 2.4, 'v'],
  [34, 8, 0.6, 2.7, 'g'],
  [-36, 12, 1.9, 2.2, 'w'],
  [0, -18, 1.5, 2.0, 'c'],
  [22, 16, 2.4, 2.5, 'w'],
];

export function AltarSeal({ game }: { game: Game }) {
  const sealed = !!game.state.roll.sealed;
  const [phase, setPhase] = useState<Phase | null>(sealed ? 'idle' : null);
  const [box, setBox] = useState<{ w: number; h: number; u: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const pieces = useRef<Partial<Record<Piece, HTMLElement | null>>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const raf = useRef(0);
  const tapped = useRef(false);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    // (In the altar's own art pixels (var(--u), as AltarReels draws it), so the two match.)
    const measure = () => setBox({ w: el.offsetWidth, h: el.offsetHeight, u: readU(el) });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
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

  const art = sealArt();
  // Everything on whole art pixels from the altar's middle.
  const w = box?.w ?? 0;
  const h = box?.h ?? 0;
  const midX = snap(w / 2);
  const midY = snap(h / 2);
  const half = (SEAL - 1) / 2;
  const sealPos: CSSProperties = { left: midX - at(half), top: midY - at(half), width: at(SEAL), height: at(SEAL) };
  const broken = phase === 'open' || phase === 'fall';
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
      style={{ ['--px' as string]: `${u}px`, ['--runes-x' as string]: `url(${art.runesAcross})`, ['--runes-y' as string]: `url(${art.runesDown})` } as CSSProperties}
    >
      <div className={s.tint} />
      {box && (
        <>
          <div
            ref={(el) => {
              pieces.current.strap = el;
            }}
            className={s.strap}
            style={{ left: midX - at(8) }}
          >
            <span className={s.rivet} style={{ left: at(6), top: at(3) }} />
            <span className={s.rivet} style={{ left: at(6), bottom: at(3) }} />
          </div>
          {(['plateA', 'plateB'] as const).map((p, i) => (
            <div
              key={p}
              ref={(el) => {
                pieces.current[p] = el;
              }}
              className={s.plate}
              style={{ top: midY + (i === 0 ? at(-20) : at(9)) }}
            >
              <span className={s.rivet} style={{ left: at(4), top: at(4) }} />
              <span className={s.rivet} style={{ right: at(4), top: at(4) }} />
              <span className={s.rivet} style={{ left: midX - at(14), top: at(4) }} />
              <span className={s.rivet} style={{ left: midX + at(12), top: at(4) }} />
            </div>
          ))}
          {!broken && (
            <div className={s.mote} aria-hidden>
              {MOTES.map(([x, y, d, len, c], i) => (
                <i key={i} data-c={c} style={{ left: midX + at(x), top: midY + at(y), animationDelay: `${d}s`, animationDuration: `${len}s` }} />
              ))}
            </div>
          )}
          <div className={s.glow} style={{ left: midX - at(half + 8), top: midY - at(half + 8), width: at(SEAL + 16), height: at(SEAL + 16) }} />
          {broken ? (
            (['left', 'right'] as const).map((p) => (
              <div
                key={p}
                ref={(el) => {
                  pieces.current[p] = el;
                }}
                className={s.half}
                style={sealPos}
              >
                <img src={art[p]} alt="" draggable={false} />
              </div>
            ))
          ) : (
            <div className={s.disc} style={sealPos} data-seal-disc>
              <img src={art.whole} alt="" draggable={false} />
              <img className={s.lit} src={art.bright} alt="" draggable={false} />
            </div>
          )}
          {broken && (
            <div className={s.burst} style={sealPos} aria-hidden>
              <img className={s.ring} src={art.ring} alt="" draggable={false} style={{ width: at(41), height: at(41), left: at(half - 20), top: at(half - 20) }} />
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
