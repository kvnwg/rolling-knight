/**
 * The Summoning Altar's reels, ported from Dumpster Legend's Reel.tsx (and its MiniRoller for 'mini').
 *
 * The core decides every reel's result when a spin starts (game.state.roll.current); this only shows it,
 * reading the live spin and `roll.timer` every animation frame, so a reel stops exactly as the core
 * lands it (`landAt`), and freezes when the game is paused. Each reel kicks back, launches downward,
 * cruises and brakes onto its result under the payline, one after another. Everything rolling past is a
 * black silhouette with its "1 in X" (trailing afterimages while it flies), leaning much rarer than the
 * real odds, with a near miss next to most results (reelStrip.ts); the result shows in color as its reel
 * stops. Between spins it keeps showing the last results.
 *
 * Drama (reelDrama.ts): a rare result's reel slows into a crawl while the machine glows, the glow
 * starting at a lower tier's color and flickering up tier by tier to the real one as the reel stops
 * (never past it), the bank shaking and the crawl's notches climbing. Every stop thuds (the bank drops
 * an art pixel, the payline and the bulbs flash); Rare and up throw sparks and swooshes, Epic and up get
 * light rays behind the result, Legendary and up stamp their tier over the reel, Mythic and up rain
 * confetti. Marquee bulbs round the bank chase while it spins, race in the glow's color while it builds,
 * and blink in the result's color after an Epic or better.
 *
 * Luck tokens: a reel stops on a clover token first; it bursts into clovers, pops out of the reel and
 * dives into the reel's stack (×N, green, blue from ×10, purple ×25, gold ×50, rainbow ×250, the tier it
 * guarantees under it), and the reel spins on. Two or more reels landing a token in the same round make
 * a combo: their numbers fly together and merge into their product under "COMBO!", which drops back onto
 * each of those reels' stacks in gold.
 *
 * 'big' fills its container's width (one reel is a wide drum with its odds beside the knight; several
 * stand side by side). 'mini' is the small corner roller: a window per reel, flicking silhouettes, the
 * find landing in color with a rim in its rarity's light. Reduce motion: no kicks, shakes, sparks,
 * flights or confetti; the reels just show each stop.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { knightDef, unlockedClasses } from '../../core/knights';
import { RARITIES, RARITY_COLOR, RARITY_NAME, rarityIndex } from '../../core/rarity';
import { chainFloor, reelCount } from '../../core/roller';
import type { Spin } from '../../core/state';
import type { Game } from '../../game';
import { KNIGHT_PIC_H, KNIGHT_PIC_W, knightUrl } from '../sprites';
import { Chunky } from './Chunky';
import { fxSound } from './fxSound';
import { Altar, type AltarSignals } from './altar';
import { bigHeight, bigWindow, miniLayout, paintBig, paintMini, type Rect } from './altarArt';
import { paylinePic, sparklePic, tokenPic } from './pixelArt';
import { RAINBOW, raysUrl } from './rays';
import { Rays } from './Rays';
import { flickerMs, glowAt, landFx, teasePlan, type Tease } from './reelDrama';
import { buildStrip, filler, stripAt, type Strip, type StripCell } from './reelStrip';
import { chainMult, comboOf, reelStops, tokenHoldMs, type ReelStop } from './reelTiming';
import { comboSound, combosDone, riserSound, tokenSound } from './tokenFx';
import { CONFETTI_COLORS, fmtNum, rarityBands, RAINBOW_TIERS, readU, tierColor } from './util';
import s from './reels.module.css';
import m from './mini.module.css';

/**
 * `housing`: 'altar' (default) sets the reels in the Summoning Altar (altarArt.ts, lit by altar.ts):
 * a carved, candle- and rune-lit shrine for 'big', a small rune-rimmed shrine for 'mini'. 'plain' is
 * Dumpster Legend's slot machine frame with marquee bulbs.
 */
export function AltarReels({ game, variant, housing = 'altar' }: { game: Game; variant: 'big' | 'mini'; housing?: 'altar' | 'plain' }) {
  return variant === 'mini' ? <MiniReels game={game} altarOn={housing === 'altar'} /> : <BigReels game={game} altarOn={housing === 'altar'} />;
}

/** How full the altar's orb is for `luck` (the spin's, times its best luck token stack): 1 is a tenth, ×1000 is full. */
function orbFill(luck: number): number {
  return Math.max(0.1, Math.min(1, 0.1 + (0.9 * Math.log(Math.max(1, luck))) / Math.log(1000)));
}

// ------------------------------------------------------------------ shared

/** Knight pictures are KNIGHT_PIC_W x KNIGHT_PIC_H image pixels (sprites.tsx knightUrl), measured once the sheets load: read them live. */
/** A token's pop out of its reel and its flight into the reel's stack (ms). */
const FLIGHT = { pop: 90, fly: 300 } as const;
const FLIGHT_MS = FLIGHT.pop + FLIGHT.fly;
/** The flight stays this long over the stack after it lands, so nothing blinks (ms). */
const LINGER = 40;

/** Plain reel ticks are capped (five reels passing cells at once would buzz). */
let lastTick = 0;
function tick(level: number): void {
  const now = performance.now();
  if (level === 0 && now - lastTick < 40) return;
  lastTick = now;
  fxSound('reelTick', level);
}

/** The stack's look: 0 green, 1 blue from ×10, 2 purple ×25, 3 gold ×50, 4 rainbow ×250. */
const stackTier = (x: number) => (x >= 250 ? 4 : x >= 50 ? 3 : x >= 25 ? 2 : x >= 10 ? 1 : 0);

// ------------------------------------------------------------------ the big reels: layout

const FRAME = 4;

interface Layout {
  n: number;
  /** CSS px per art pixel. */
  u: number;
  /** Image pixels to art pixels for the knights (1 or 2). */
  k: number;
  /** One or two wide reels: the odds beside the knight instead of above it. */
  side: boolean;
  /** A cell's height (a knight rolling past); the odds line's height above the knight (stacked reels). */
  cell: number;
  lab: number;
  reelW: number;
  gap: number;
  artW: number;
  artH: number;
  /** The knight's left edge inside its cell (cells are inset one art pixel from the reel's ink border). */
  artX: number;
  /** The knight's center inside its reel. */
  artCx: number;
  /** Where the reels start inside the window. */
  left: number;
  /** The bank's own frame round the window (0 inside the altar). */
  frame: number;
  win: number;
  bankW: number;
  bankH: number;
  /** Font sizes (art px): a wide reel's big odds and their "1 in", its tier's name. */
  big: number;
  small: number;
  tierf: number;
  /** Where a wide reel's odds start in a cell. */
  lx: number;
}

/** The font size (art px) a landed result's tier name fits at beside the knight (wide reels), or 0. */
function tierSize(name: string, L: Layout): number {
  const room = (L.n === 1 ? L.artX - 4 : L.reelW - 2 - L.lx - 1) - 2;
  const size = Math.min(L.tierf, Math.floor(room / (name.length * 0.6)));
  return size >= 4 ? size : 0;
}

/** Sizes (art pixels) for `count` reels across `widthPx`. Every size is whole art pixels. */
function layoutFor(count: number, widthPx: number, u: number, frame: number = FRAME): Layout {
  const n = Math.min(5, Math.max(1, count));
  const bankW = Math.max(48, Math.floor(widthPx / u));
  const inner = bankW - 2 * frame;
  const gap = n === 1 ? 0 : n === 2 ? 4 : 2;
  const reelW = Math.max(12, Math.floor((inner - (n - 1) * gap) / n));
  const side = n <= 2;
  const k = side ? (reelW >= (n === 1 ? 150 : 112) ? 2 : 1) : reelW >= 64 ? 2 : 1;
  const artW = KNIGHT_PIC_W * k;
  const artH = KNIGHT_PIC_H * k;
  const lab = side ? 0 : k === 2 ? 8 : 6;
  const even = (v: number) => v + (v % 2);
  const cell = even(side ? artH + 4 : artH + lab + 2);
  const win = cell + 2 * Math.max(6, Math.round(cell * 0.18));
  const cellW = reelW - 2;
  const artX = n === 2 ? Math.max(0, Math.min(4, cellW - artW)) : Math.floor((cellW - artW) / 2);
  const total = n * reelW + (n - 1) * gap;
  return {
    n, u, k, side, cell, lab, reelW, gap, artW, artH, artX, artCx: 1 + artX + artW / 2, left: Math.max(0, Math.floor((inner - total) / 2)), frame, win, bankW, bankH: win + 2 * frame,
    big: k === 2 ? (n === 1 ? 11 : 9) : n === 1 ? 9 : 7,
    small: k === 2 ? 5 : 4,
    tierf: n === 1 ? (k === 2 ? 8 : 6) : k === 2 ? 6 : 5,
    lx: artX + artW + (n === 1 ? 4 : 3),
  };
}

// ------------------------------------------------------------------ the big reels: a run (one spin's strips)

interface Run {
  seq: number;
  spin: Spin | null;
  strips: Strip[];
  /** Stops each reel has reached (its tokens, then its knight); and how many when the run was built. */
  reached: number[];
  before: number[];
  /** Tokens each reel's stack counts (each once its flight has landed). */
  counted: number[];
  /** Every reel's tokens; the combo steps (core comboSteps); the combos the stacks show so far. */
  mults: number[][];
  matched: number[];
  shown: number[];
  plan: Tease | null;
  /** The reel that stops last. */
  lastReel: number;
  /** Per reel: the last tick notch, strip offset written (px), position (cells) and speed class. */
  notch: number[];
  y: number[];
  p: number[];
  speed: string[];
  /** Notches of the build-up's crawl so far (each one climbs). */
  creep: number;
  /** The glow step shown; what the glow, shake and bulbs last showed. */
  glowStep: number;
  glowKey: string;
  shake: number;
  bulbs: string;
  /** The rarest tier landed so far; the bulbs flash white until `flashUntil` (spin ms). */
  best: number;
  flashUntil: number;
  flicker: number;
  /** The spin clock (ms) last frame. */
  lastEl: number;
}

let runSeq = 1;

/** Index of the result cell (the last stop). */
const resultIdx = (st: Strip) => (st.stops.length ? st.stops[st.stops.length - 1].idx : 0);

/** Each reel's stack: the luck it has stacked up so far, the combos shown counting whole (core tokenMult). */
const chainsOf = (r: Pick<Run, 'mults' | 'counted' | 'shown'>) => r.mults.map((_, i) => chainMult(r.mults, i, r.shown, r.counted[i]));
/** How many combos have merged onto each reel's stack (it is gold from the first). */
const mergedOf = (r: Pick<Run, 'mults' | 'shown'>) => r.mults.map((mm) => r.shown.filter((k) => mm.length > k).length);

function shell(spin: Spin | null, strips: Strip[], elapsed: number): Run {
  const reached = strips.map((st) => stripAt(st, elapsed).reached);
  return {
    seq: runSeq++,
    spin,
    strips,
    reached,
    before: reached.slice(),
    counted: reached.slice(),
    mults: spin ? spin.reels.map((r) => [...r.tokens]) : strips.map(() => []),
    matched: spin ? [...spin.combos] : [],
    shown: [],
    plan: null,
    lastReel: 0,
    notch: strips.map(() => 0),
    y: strips.map(() => NaN),
    p: strips.map(() => 0),
    speed: strips.map(() => ''),
    creep: 0,
    glowStep: -1,
    // Unlike anything a frame writes, so the first frame clears what the last spin left on the DOM.
    glowKey: 'new',
    shake: -1,
    bulbs: 'new',
    best: -1,
    flashUntil: 0,
    flicker: 0,
    lastEl: elapsed,
  };
}

/** Each reel's strip for a spin (reelStrip.ts): from the last results, through any tokens, to the knight. */
function buildRun(game: Game, spin: Spin, prev: (StripCell | undefined)[], elapsed: number): Run {
  const plan = teasePlan(spin);
  const classes = unlockedClasses(game.state.rebirths);
  const strips = spin.reels.map((_, i) => buildStrip(spin, i, prev[i], classes, plan && plan.reel === i ? plan.slow : 0));
  const run = shell(spin, strips, elapsed);
  run.plan = plan;
  run.flicker = plan ? flickerMs(plan) : 0;
  const stopOf = (st: Strip) => (st.stops.length ? st.stops[st.stops.length - 1].at : 0);
  strips.forEach((st, i) => {
    if (stopOf(st) >= stopOf(strips[run.lastReel])) run.lastReel = i;
    if (run.reached[i] >= st.stops.length) run.best = Math.max(run.best, rarityIndex(st.cells[resultIdx(st)].rarity));
  });
  // Combos that came together before this run was built (mounted mid-spin) show at once.
  run.shown = combosDone(run.matched, run.mults, run.reached);
  return run;
}

/** Before any spin has been seen: the last finds (game.recent) at rest, else blacked-out fillers. */
function idleRun(game: Game): Run {
  const n = Math.max(1, reelCount(game.state));
  const classes = unlockedClasses(game.state.rebirths);
  const strips: Strip[] = Array.from({ length: n }, (_, i) => {
    const f = game.recent[n - 1 - i];
    const last: StripCell = f
      ? { id: f.knightId, rarity: knightDef(f.knightId).rarity, mutation: f.mutation, odds: f.oneIn, real: true, token: null }
      : filler(i * 101 + 7, false, classes, false);
    return { cells: [last, filler(i * 101 + 8, false, classes, false), filler(i * 101 + 9, false, classes, false)], stops: [] };
  });
  return shell(null, strips, 0);
}

// ------------------------------------------------------------------ the big reels: cells

/**
 * The cells of one reel's strip. Memoized: the bank re-renders on landings (its effects) and these stay
 * put; a landed stop's cell is revealed straight on the DOM (data-revealed).
 */
const Cells = memo(function Cells({
  strip, seq, reel, L, reached, before, idle, cellRefs,
}: {
  strip: Strip;
  seq: number;
  reel: number;
  L: Layout;
  reached: number;
  /** Stops reached before this run was built (shown without the landing flash). */
  before: number;
  idle: boolean;
  cellRefs: Map<string, HTMLDivElement>;
}) {
  const res = resultIdx(strip);
  return (
    <>
      {strip.cells.map((c, j) => {
        const stopAt = strip.stops.findIndex((p) => p.idx === j);
        // Real cells show in color: the last result at the bottom always, stops once reached.
        const revealed = c.real && (stopAt < 0 || reached > stopAt || (idle && j === res));
        const settled = revealed && (stopAt < 0 || before > stopAt || idle);
        const tok = c.token !== null;
        const ri = rarityIndex(c.rarity);
        return (
          <div
            key={j}
            className={s.cell}
            data-token={tok || undefined}
            data-revealed={revealed ? '' : undefined}
            data-settled={settled ? '' : undefined}
            data-hot={(!tok && ri >= 4 && !RAINBOW_TIERS.has(c.rarity)) || undefined}
            data-rainbow={(!tok && RAINBOW_TIERS.has(c.rarity)) || undefined}
            ref={
              stopAt >= 0
                ? (el) => {
                    const key = `${seq}:${reel}:${j}`;
                    if (el) cellRefs.set(key, el);
                    else cellRefs.delete(key);
                  }
                : undefined
            }
            style={{ top: (-j * L.cell - L.cell / 2) * L.u, ['--rc' as string]: tok ? '#7ef08f' : RARITY_COLOR[c.rarity] } as CSSProperties}
          >
            {/* The odds belong to their own knight (above it, or beside it on a wide reel), never the next one's. */}
            <span className={s.odds}>
              {tok ? (
                L.side ? (
                  <>
                    <i>LUCK</i>
                    <b>×{c.token}</b>
                  </>
                ) : (
                  `×${c.token} LUCK`
                )
              ) : (
                <>
                  <i>1 in</i>
                  <b>{fmtNum(c.odds)}</b>
                </>
              )}
            </span>
            <span className={s.art}>
              {tok ? (
                <img className={s.tok} src={tokenPic(c.token!).url} alt="" draggable={false} />
              ) : (
                <img src={knightUrl(c.id, c.real ? c.mutation : null)} alt="" draggable={false} />
              )}
            </span>
            {L.side && c.real && !tok && tierSize(RARITY_NAME[c.rarity], L) > 0 && (
              <span className={s.tier} style={{ fontSize: tierSize(RARITY_NAME[c.rarity], L) * L.u }}>
                {RARITY_NAME[c.rarity]}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
});

// ------------------------------------------------------------------ the big reels: effects

interface Fx {
  id: number;
  kind: 'land' | 'token' | 'combo';
  reel: number;
  tier: number;
  /** A token: its value. */
  x?: number;
  /** A combo: its reels, each one's token, their product, and how long the product holds (ms). */
  combo?: { reels: number[]; values: number[]; product: number; hold: number };
}
let fxId = 1;

/** Pixel sparks flying out from a landed result (six steps of whole art pixels). */
function Sparks({ n, color, big, u, delay = 0 }: { n: number; color: string; big: boolean; u: number; delay?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: n }, (_, k) => {
        const a = (k / n) * Math.PI * 2 + 0.3;
        const d = (big ? 28 : 18) * (0.7 + (0.3 * ((k * 7) % 4)) / 3);
        return { dx: Math.round((Math.cos(a) * d) / 6) * 6 * u, dy: Math.round((Math.sin(a) * d * 0.8) / 6) * 6 * u, delay: (k % 3) * 40 };
      }),
    [n, big, u],
  );
  return (
    <div className={s.sparks} style={{ ['--c' as string]: color } as CSSProperties}>
      {bits.map((b, k) => (
        <i key={k} style={{ ['--dx' as string]: `${b.dx}px`, ['--dy' as string]: `${b.dy}px`, animationDelay: `${b.delay + delay}ms` } as CSSProperties} />
      ))}
    </div>
  );
}

/** Confetti over the machine: pieces of 2 x 1 art pixels falling in whole-pixel steps. */
function Confetti({ n, L }: { n: number; L: Layout }) {
  const bits = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        x: Math.round((((i * 137.5) % 100) / 100) * (L.bankW - 2)) * L.u,
        delay: (i * 53) % 600,
        dur: 1300 + ((i * 97) % 700),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        tall: i % 2 === 0,
      })),
    [n, L],
  );
  const fall = `${Math.max(80, L.bankH + 20) * L.u}px`;
  return (
    <div className={s.confetti} style={{ ['--fall' as string]: fall } as CSSProperties}>
      {bits.map((b, i) => (
        <span
          key={i}
          data-tall={b.tall || undefined}
          style={{ left: b.x, background: b.color, animationDelay: `${b.delay}ms, ${b.delay}ms`, animationDuration: `${b.dur}ms, 240ms` }}
        />
      ))}
    </div>
  );
}

/** How far a swoosh line rushes in from a reel's edge toward the knight `d` art px away: whole steps of 6. */
function travel(d: number): number {
  return Math.max(1, Math.round((d - 18) / 6)) * 6;
}

/** One landing's effects, centered on the result's knight (`x`, `y` px in the bank). */
function Landing({ f, x, y, L, calm }: { f: Fx; x: number; y: number; L: Layout; calm: boolean }) {
  const look = landFx(f.tier);
  const rarity = knightRarity(f.tier);
  const color = tierColor(f.tier);
  const u = L.u;
  const sparkle = sparklePic();
  const stampX = Math.max(35 * u, Math.min((L.bankW - 35) * u, x));
  const bands = rarityBands(rarity);
  const stamp = `${RARITY_NAME[rarity].toUpperCase()}!`;
  return (
    <>
      {!calm && look.sparks > 0 && (
        <div className={s.at} style={{ left: x, top: y }}>
          <Sparks n={look.sparks} color={color} big={L.k === 2 || L.n <= 2} u={u} />
        </div>
      )}
      {!calm && f.tier >= 2 && (
        <div
          className={s.swoosh}
          data-big={f.tier >= 4 || undefined}
          style={
            {
              left: x - L.artCx * u,
              width: L.reelW * u,
              top: y,
              ['--travelL' as string]: `${travel(L.artCx) * u}px`,
              ['--travelR' as string]: `${travel(L.reelW - L.artCx) * u}px`,
            } as CSSProperties
          }
        >
          <i data-side="l" />
          <i data-side="l" data-row="2" />
          <i data-side="r" />
          <i data-side="r" data-row="2" />
        </div>
      )}
      {!calm &&
        f.tier >= 4 &&
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([sx, sy], k) => (
          <img
            key={k}
            src={sparkle.url}
            alt=""
            draggable={false}
            className={s.twinkle}
            style={{ left: x + (sx * (L.artW / 2 + 2) - 3) * u, top: y + (sy * (L.artH / 2 - 1) - 3) * u, animationDelay: `${k * 170}ms` }}
          />
        ))}
      {look.stamp && (
        <div className={s.stamp} data-calm={calm || undefined} style={{ left: stampX, top: (L.frame - 1) * u }}>
          <Chunky text={stamp} size={L.n <= 2 ? 9 : L.n === 3 ? 7 : 6} grad={bands} />
        </div>
      )}
      {!calm && look.confetti && <Confetti n={22} L={L} />}
    </>
  );
}

function knightRarity(tier: number) {
  return RARITIES[Math.max(0, Math.min(RARITIES.length - 1, tier))];
}

/**
 * A reel's luck stacked up so far. Each new token counts the total up from the last one (×2, ×4, ×7,
 * ×10) with a drop, and the stack grows and changes color as it climbs: green, blue from ×10, purple
 * from ×25 (Epic or better guaranteed), gold from ×50 (Legendary or better), rainbow from ×250 (Mythic
 * or better), the guaranteed tier under it. `combos`: how many combos have dropped onto it (gold from
 * the first; a new one's total shows at once instead of counting up).
 */
function ChainBadge({ x, combos }: { x: number; combos: number }) {
  const [shown, setShown] = useState(x);
  const [seen, setSeen] = useState(combos);
  if (seen !== combos) {
    setSeen(combos);
    if (combos > seen) setShown(x);
  }
  const prev = useRef(x);
  const prevCombos = useRef(combos);
  useEffect(() => {
    const from = prev.current;
    prev.current = x;
    const merged = combos > prevCombos.current;
    prevCombos.current = combos;
    if (!(from > 0) || from >= x || merged) {
      setShown(x);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 360);
      setShown(k >= 1 ? x : Math.max(from, Math.round(from * Math.pow(x / from, k))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // (Counts when the total changes; a combo's merge is handled above.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x]);
  const floor = chainFloor(x);
  return (
    <span key={x} className={s.chain} data-tier={stackTier(x)} data-gold={combos > 0 || undefined}>
      ×{fmtNum(shown)}
      {floor && <em className={s.chainFloor}>{RARITY_NAME[floor].toUpperCase()}+</em>}
    </span>
  );
}

/** A combo's timing (ms): the numbers fly together, the product holds, then drops back onto the stacks. */
const COMBO = { fly: FLIGHT_MS, hold: 820, minHold: 380, back: 260, calmHold: 1400 } as const;

/**
 * A combo: each reel's number pops out of its reel and flies to the middle, they merge with a burst into
 * their product under "COMBO!", the sum that made it beneath ("×2 × ×5"), and copies of the product drop
 * back onto each of those reels' stacks. Reduce motion: nothing flies; the sum and product just show.
 */
function ComboFx({ f, L, calm }: { f: Fx; L: Layout; calm: boolean }) {
  const c = f.combo!;
  const u = L.u;
  const xs = c.reels.map((i) => (L.frame + L.left + i * (L.reelW + L.gap) + L.reelW / 2) * u);
  const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2 / u) * u;
  const cy = (L.frame + L.win / 2) * u;
  const chipY = (L.frame + 1 + 4) * u;
  const sizes = L.n <= 2 ? { title: 11, x: 21, sum: 7, part: 15 } : L.n === 3 ? { title: 9, x: 19, sum: 6, part: 13 } : { title: 8, x: 15, sum: 5, part: 11 };
  const product = `×${fmtNum(c.product)}`;
  const style = { ['--fly' as string]: `${calm ? 0 : COMBO.fly}ms`, ['--hold' as string]: `${c.hold}ms`, ['--back' as string]: `${COMBO.back}ms` } as CSSProperties;
  return (
    <div className={s.combo} style={style} data-calm={calm || undefined} data-rainbow={c.product >= 250 || undefined}>
      {!calm &&
        xs.map((x, k) => (
          <div key={`p${k}`} className={s.at} style={{ left: x, top: cy }}>
            <span className={s.comboPart} style={{ ['--dx' as string]: `${cx - x}px`, fontSize: sizes.part * u } as CSSProperties}>
              ×{fmtNum(c.values[k])}
            </span>
          </div>
        ))}
      <div className={s.comboLate}>
        {!calm && (
          <div className={s.at} style={{ left: cx, top: cy }}>
            <i className={s.comboRing} />
            <i className={s.comboRing} data-late />
          </div>
        )}
        {!calm && (
          <div className={s.at} style={{ left: cx, top: cy }}>
            <Sparks n={16} color="#ffd23f" big u={u} delay={COMBO.fly} />
          </div>
        )}
        {/* The product sits on the middle, where the numbers met: "COMBO!" above it, the sum under it. */}
        <div className={s.comboHit} style={{ left: cx, top: Math.round(cy / u - sizes.title * 1.1 - sizes.x / 2) * u }}>
          <span className={s.comboTitle}>
            <Chunky text="COMBO!" size={sizes.title} grad={c.product >= 250 ? 'rainbow' : 'gold'} />
          </span>
          <span className={s.comboX} style={{ fontSize: sizes.x * u }}>
            {product}
          </span>
          <span className={s.comboSum} style={{ fontSize: sizes.sum * u }}>
            {c.values.map((v) => `×${fmtNum(v)}`).join(' × ')}
          </span>
        </div>
        {!calm &&
          xs.map((x, k) => (
            <div key={`b${k}`} className={s.at} style={{ left: cx, top: cy }}>
              <span className={s.comboBack} style={{ ['--dx' as string]: `${x - cx}px`, ['--dy' as string]: `${chipY - cy}px`, fontSize: sizes.x * u } as CSSProperties}>
                {product}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

/** A luck token bursts into little pixel clovers. */
function CloverBurst({ x, y }: { x: number; y: number }) {
  return (
    <div className={`${s.at} ${s.burst}`} style={{ left: x, top: y }}>
      {Array.from({ length: 8 }, (_, k) => (
        <i key={k} />
      ))}
    </div>
  );
}

/**
 * A luck token popping out of its reel (two art pixels up), rising toward a spot over the reel's stack
 * and diving into it, in whole art pixels; the stack takes it as it lands.
 */
function TokenFly({ value, from, to, L }: { value: number; from: { x: number; y: number }; to: { x: number; y: number }; L: Layout }) {
  const ref = useRef<HTMLImageElement>(null);
  const u = L.u;
  const size = 16 * L.k;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t0 = performance.now();
    const above = { x: to.x, y: to.y - 6 * u };
    const snapU = (v: number) => Math.round(v / u) * u;
    let raf = 0;
    const place = () => {
      const ms = performance.now() - t0;
      let x = from.x;
      let y = from.y;
      if (ms < FLIGHT.pop) y = from.y - (ms > FLIGHT.pop / 2 ? 2 : 1) * u;
      else {
        const k = Math.min(1, (ms - FLIGHT.pop) / FLIGHT.fly);
        if (k < 0.62) {
          const e = 1 - (1 - k / 0.62) ** 2;
          x = from.x + (above.x - from.x) * e;
          y = from.y - 2 * u + (above.y - from.y + 2 * u) * e;
        } else {
          const v = (k - 0.62) / 0.38;
          x = above.x;
          y = above.y + (to.y - above.y) * v * v;
        }
      }
      el.style.transform = `translate3d(${snapU(x - (size * u) / 2)}px, ${snapU(y - (size * u) / 2)}px, 0)`;
      // It lingers a moment on the stack (which takes it as it lands), then it's gone.
      if (ms < FLIGHT_MS + LINGER) raf = requestAnimationFrame(place);
      else el.style.visibility = 'hidden';
    };
    place();
    return () => cancelAnimationFrame(raf);
    // One flight per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <img ref={ref} className={s.fly} src={tokenPic(value).url} alt="" draggable={false} style={{ width: size * u, height: size * u }} />;
}

// ------------------------------------------------------------------ the big reels

function BigReels({ game, altarOn }: { game: Game; altarOn: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; u: number } | null>(null);
  const [calm, setCalm] = useState(game.state.settings.reduceMotion);
  const [run, setRun] = useState<Run>(() => idleRun(game));
  // The first spin rolls away from what the idle reels showed.
  const prevRef = useRef<(StripCell | undefined)[]>(run.strips.map((st) => st.cells[0]));
  const [chain, setChain] = useState<number[]>([]);
  const [merged, setMerged] = useState<number[]>([]);
  const [fx, setFx] = useState<Fx[]>([]);
  /** Reels showing light rays behind an Epic-or-better result (reel → tier). */
  const [rays, setRays] = useState<Record<number, number>>({});
  const runRef = useRef<Run>(run);
  const calmRef = useRef(calm);
  const layoutRef = useRef<Layout | null>(null);
  const committed = useRef(0);
  const rigRef = useRef<HTMLDivElement>(null);
  const bankRef = useRef<HTMLDivElement>(null);
  const payFlashRef = useRef<HTMLDivElement>(null);
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // The reels' layout, and (inside the altar) where the window and the drums go in the altar's canvas.
  const geo = useMemo(() => {
    if (!box) return null;
    const n = run.strips.length;
    if (!altarOn) return { L: layoutFor(n, box.w, box.u), altar: null };
    const W = Math.max(120, Math.floor(box.w / box.u));
    const aw = bigWindow(W);
    const L = layoutFor(n, aw.w * box.u, box.u, 0);
    const win: Rect = { x: aw.x, y: aw.y, w: aw.w, h: L.win };
    const holes: Rect[] = Array.from({ length: n }, (_, i) => ({ x: win.x + L.left + i * (L.reelW + L.gap) + 1, y: win.y + 1, w: L.reelW - 2, h: L.win - 2 }));
    return { L, altar: { W, H: bigHeight(L.win, W), win, holes, payY: win.y + Math.floor(L.win / 2) } };
  }, [box, run.strips.length, altarOn]);
  const L = geo?.L ?? null;
  layoutRef.current = L;
  const altarArt = useMemo(() => (geo?.altar ? paintBig(geo.altar.W, geo.altar.win, geo.altar.holes, geo.altar.payY) : null), [geo]);
  const altarRef = useRef<Altar | null>(null);
  const artRef = useRef(altarArt);
  artRef.current = altarArt;
  const canvasRef = (el: HTMLCanvasElement | null) => {
    if (!el || altarRef.current?.canvasEl === el) return;
    altarRef.current = new Altar(el);
    if (artRef.current) altarRef.current.setArt(artRef.current);
  };
  useLayoutEffect(() => {
    if (altarArt && altarRef.current) altarRef.current.setArt(altarArt);
  }, [altarArt]);

  // The container's width and the UI pixel unit.
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const u = readU(el);
      const w = el.clientWidth;
      setBox((b) => (b && b.w === w && b.u === u ? b : { w, u }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // What's on the DOM now (the frame loop waits for a new run's cells), and strips to place again after a resize.
  useLayoutEffect(() => {
    committed.current = run.seq;
    runRef.current.y.fill(NaN);
  }, [run, L]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const later = (fn: () => void, ms: number) => {
    const tid = setTimeout(() => {
      timers.current = timers.current.filter((x) => x !== tid);
      fn();
    }, ms);
    timers.current.push(tid);
  };
  const addFx = (f: Omit<Fx, 'id'>, ms: number) => {
    const id = fxId++;
    setFx((cur) => [...cur.slice(-7), { ...f, id }]);
    later(() => setFx((cur) => cur.filter((x) => x.id !== id)), ms);
  };

  /**
   * The last token of combo step `k` landed on reel `reel`, `el` ms into the spin: every reel's token
   * of that round flies to the middle, they merge into their product, and it drops back onto each of
   * their stacks, which only then count it (in gold). It holds until just before the next reel stops.
   */
  const startCombo = (r: Run, k: number, reel: number, el: number) => {
    const c = comboOf(r.mults, k);
    const calmNow = calmRef.current;
    const next = Math.min(Infinity, ...r.strips.flatMap((st) => st.stops.map((x) => x.at)).filter((a) => a > el + 1));
    const fly = calmNow ? 0 : COMBO.fly;
    const back = calmNow ? 0 : COMBO.back;
    const hold = calmNow ? COMBO.calmHold : Math.round(Math.max(COMBO.minHold, Math.min(COMBO.hold, next - el - fly - back - 120)));
    addFx({ kind: 'combo', reel, tier: 0, combo: { ...c, hold } }, fly + hold + back + 150);
    if (r.spin) later(() => r.spin && comboSound(r.spin, k, c.reels.length), fly);
    const show = () => {
      if (runRef.current !== r || r.shown.includes(k)) return;
      r.shown = [...r.shown, k];
      setChain(chainsOf(r));
      setMerged(mergedOf(r));
    };
    if (calmNow) {
      show();
      return;
    }
    const u = layoutRef.current?.u ?? 3;
    bankRef.current?.animate(
      [{ transform: `translateY(${2 * u}px)` }, { transform: `translateY(${-u}px)` }, { transform: 'translateY(0)' }],
      { duration: 210, delay: fly, easing: 'steps(3, jump-none)' },
    );
    payFlashRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, delay: fly, easing: 'steps(3, jump-none)' });
    later(() => {
      if (runRef.current === r) r.flashUntil = r.lastEl + 260;
    }, fly);
    later(show, fly + hold + back - 60);
  };

  // A new spin: fresh strips that start from the last results, and the machine winds up.
  const startRun = (spin: Spin, elapsed: number) => {
    const next = buildRun(game, spin, prevRef.current, elapsed);
    prevRef.current = next.strips.map((st) => st.cells[resultIdx(st)]);
    runRef.current = next;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRun(next);
    setChain(chainsOf(next));
    setMerged(mergedOf(next));
    setFx([]);
    // (Mounted mid-spin: reels that already landed an Epic or better have their rays.)
    const landed: Record<number, number> = {};
    if (!calmRef.current) {
      next.strips.forEach((st, i) => {
        const tier = rarityIndex(st.cells[resultIdx(st)].rarity);
        if (next.reached[i] >= st.stops.length && landFx(tier).rays) landed[i] = tier;
      });
    }
    setRays(landed);
    if (elapsed < 150 && !calmRef.current) {
      const u = layoutRef.current?.u ?? 3;
      bankRef.current?.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-u}px)` }, { transform: 'translateY(0)' }], {
        duration: 150,
        easing: 'steps(3, jump-none)',
      });
    }
  };

  // The animation runs straight on the DOM; React only renders when a spin starts, a token lands or a
  // result lands (its effects).
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const st = game.state;
      const live = st.roll.current;
      const calmNow = st.settings.reduceMotion;
      if (calmNow !== calmRef.current) {
        calmRef.current = calmNow;
        setCalm(calmNow);
      }
      if (live && live !== runRef.current.spin) startRun(live, st.roll.timer * 1000);
      const r = runRef.current;
      const bank = bankRef.current;
      const lay = layoutRef.current;
      const cur = r.spin;
      const altar = altarRef.current;
      if (!cur || !bank || !lay || committed.current !== r.seq) {
        if (altar && !cur) altar.frame(performance.now(), { calm: calmNow, spinning: false, glow: null, glowStrength: 0, win: null, mode: null, fill: orbFill(game.luck) });
        return;
      }
      const calm = calmNow;
      const u = lay.u;
      // The spin's own clock (it stops while the game is paused); between spins the last one rests.
      const el = live === r.spin ? st.roll.timer * 1000 : r.lastEl;
      const dt = Math.max(4, el - r.lastEl);
      r.lastEl = el;
      const plan = r.plan;
      r.strips.forEach((strip, i) => {
        const at = stripAt(strip, el, calm);
        // Whole art pixels only, so the art never lands between pixels.
        const y = Math.round(lay.win / 2 + at.p * lay.cell) * u;
        const node = stripRefs.current[i];
        if (node && y !== r.y[i]) {
          node.style.transform = `translate3d(0, ${y}px, 0)`;
          r.y[i] = y;
        }
        const moving = at.reached < strip.stops.length;
        const v = (Math.abs(at.p - r.p[i]) * 1000) / dt;
        r.p[i] = at.p;
        // Afterimages while it flies.
        const sp = calm || !moving ? '' : v > 12 ? 'fast' : v > 5 ? 'mid' : '';
        if (sp !== r.speed[i]) {
          r.speed[i] = sp;
          const rn = reelRefs.current[i];
          if (rn) {
            if (sp) rn.dataset.speed = sp;
            else delete rn.dataset.speed;
          }
        }
        // Ticks as cells pass; a build-up's crawl clicks in finer notches, each a step higher.
        const crawl = !!plan && plan.reel === i && el >= plan.from && at.reached === strip.stops.length - 1 && v < 6;
        const notch = Math.floor(at.p * (crawl ? 3 : 1) + 0.5);
        if (notch !== r.notch[i]) {
          r.notch[i] = notch;
          if (moving && !calm && el > 0) tick(crawl ? ++r.creep : 0);
        }
        while (r.reached[i] < at.reached) {
          const k = r.reached[i];
          const stop = strip.stops[k];
          r.reached[i] += 1;
          cellRefs.current.get(`${r.seq}:${i}:${stop.idx}`)?.setAttribute('data-revealed', '');
          if (stop.token !== null) {
            // A luck token: its chime and clover burst; it pops out and dives into the reel's stack,
            // which counts it as it lands. The last token of a combo sets off its animation.
            const match = combosDone(r.matched, r.mults, r.reached).includes(k);
            tokenSound(cur, i, k);
            altar?.token(i, calm);
            addFx({ kind: 'token', reel: i, tier: 0, x: stop.token }, 900);
            const count = () => {
              if (runRef.current !== r) return;
              r.counted[i] = Math.max(r.counted[i], k + 1);
              setChain(chainsOf(r));
            };
            if (calm) count();
            else later(count, FLIGHT_MS);
            if (match) startCombo(r, k, i, el);
          } else {
            const tier = rarityIndex(strip.cells[stop.idx].rarity);
            fxSound('reelLand', tier);
            altar?.land(tier, i, tierColor(tier), calm);
            if (!calm) {
              bank.animate(
                tier >= 3
                  ? [{ transform: `translateY(${2 * u}px)` }, { transform: `translateY(${u}px)` }, { transform: 'translateY(0)' }]
                  : [{ transform: `translateY(${u}px)` }, { transform: 'translateY(0)' }],
                { duration: tier >= 3 ? 210 : 140, easing: tier >= 3 ? 'steps(3, jump-none)' : 'steps(2, jump-none)' },
              );
            }
            if (!calm) {
              payFlashRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: tier >= 2 ? 360 : 240, easing: 'steps(3, jump-none)' });
              r.flashUntil = el + (tier >= 2 ? 240 : 140);
            }
            if (tier > r.best) {
              r.best = tier;
              bank.style.setProperty('--prize', tierColor(tier));
            }
            const look = landFx(tier);
            if (look.stamp) fxSound('stamp', tier);
            // Plain results stay light: their thud, drop and flashes are all straight on the DOM.
            if (tier >= 2) addFx({ kind: 'land', reel: i, tier }, look.confetti ? 2400 : look.stamp ? 1900 : 900);
            if (look.rays && !calm) setRays((was) => ({ ...was, [i]: tier }));
          }
        }
      });

      // The build-up's glow: it climbs tier by tier (flickering between the old and the new color on each
      // step) and lands on the real tier as the reel stops; the machine shakes harder near the end.
      let color: string | null = null;
      let strength = 0;
      let shake = 0;
      if (plan) {
        const g = glowAt(plan, el);
        if (g.tier !== null) {
          if (plan.level >= 1 && el >= plan.from + (plan.land - plan.from) * 0.1 && el < plan.land) riserSound(cur, plan.tiers[plan.tiers.length - 1]);
          r.glowStep = g.step;
          let tierShown = g.tier;
          const since = el - plan.times[g.step];
          if (g.step > 0 && !calm && since < r.flicker) tierShown = Math.floor(since / 45) % 2 === 0 ? g.tier : plan.tiers[g.step - 1];
          color = tierColor(tierShown);
          if (el < plan.land) {
            strength = g.strength;
            if (!calm && plan.level >= 1) {
              const k = (el - plan.from) / Math.max(1, plan.land - plan.from);
              shake = plan.level >= 2 && k > 0.7 ? 2 : k > 0.4 ? 1 : 0;
            }
          } else {
            // After the pop a rare result keeps glowing until the next spin; a small glow fades out.
            strength = plan.level >= 1 ? 2 : el - plan.land < 450 ? 1 : 0;
          }
        }
      }
      const glowKey = color && strength > 0 ? `${color}|${strength}` : '';
      if (glowKey !== r.glowKey) {
        r.glowKey = glowKey;
        if (color && strength > 0) {
          bank.style.setProperty('--glow', color);
          bank.dataset.glow = String(strength);
        } else delete bank.dataset.glow;
      }
      if (shake !== r.shake) {
        r.shake = shake;
        const rig = rigRef.current;
        if (rig) {
          if (shake) rig.dataset.shake = String(shake);
          else delete rig.dataset.shake;
        }
      }
      const allLanded = r.reached.every((n, j) => n >= r.strips[j].stops.length);
      const building = !!plan && strength > 0 && el < plan.land;
      const bulbs = el < r.flashUntil ? 'flash' : !allLanded ? (building ? 'glow' : 'spin') : r.best >= 3 ? 'win' : 'idle';
      if (bulbs !== r.bulbs) {
        r.bulbs = bulbs;
        bank.dataset.bulbs = bulbs;
        if (bulbs === 'win') bank.style.setProperty('--prize', tierColor(r.best));
      }
      if (altar) {
        // The altar's light: the build-up's glow, the find's color after an Epic or better, the spin's
        // kind, and the orb filling with the spin's luck times its best token stack so far.
        const stack = Math.max(1, ...chainsOf(r));
        const sig: AltarSignals = {
          calm,
          spinning: !allLanded,
          glow: building ? color : null,
          glowStrength: building ? strength : 0,
          win: allLanded && r.best >= 3 ? tierColor(r.best) : null,
          mode: cur.golden ? 'golden' : cur.lucky ? 'lucky' : cur.turbo ? 'turbo' : null,
          fill: orbFill(cur.luck * stack),
        };
        altar.frame(performance.now(), sig);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // The loop reads the game and refs; it starts once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  const spin = run.spin;
  const n = run.strips.length;
  const idle = !spin;
  const fxX = (reel: number) => (L ? (L.frame + L.left + reel * (L.reelW + L.gap) + L.artCx) * L.u : 0);
  const fxY = L ? (L.frame + L.win / 2 + (L.side ? 0 : L.lab / 2)) * L.u : 0;
  const chipY = L ? (L.frame + 1 + 4) * L.u : 0;
  const reelCx = (reel: number) => (L ? (L.frame + L.left + reel * (L.reelW + L.gap) + L.reelW / 2) * L.u : 0);
  let style: CSSProperties | undefined;
  const A = geo?.altar ?? null;
  if (L) {
    const u = L.u;
    const px = (v: number) => `${v * u}px`;
    style = {
      ['--u' as string]: `${u}px`,
      ['--cell' as string]: px(L.cell),
      ['--lab' as string]: px(L.lab),
      ['--win' as string]: px(L.win),
      ['--frame' as string]: px(L.frame),
      ['--artw' as string]: px(L.artW),
      ['--arth' as string]: px(L.artH),
      ['--tokw' as string]: px(16 * L.k),
      ['--tokx' as string]: px(7 * L.k),
      ['--toky' as string]: px(Math.floor((L.artH - 16 * L.k) / 2)),
      ['--ax' as string]: px(L.artX),
      ['--acx' as string]: px(L.artCx),
      ['--lx' as string]: px(L.lx),
      ['--tx' as string]: px(L.reelW - 2 - L.artX + 3),
      ['--label' as string]: px(L.lab - 1),
      ['--big' as string]: px(L.big),
      ['--small' as string]: px(L.small),
      ['--tierf' as string]: px(L.tierf),
      ['--trail' as string]: px(3 * L.k),
      width: px(A ? A.W : L.bankW),
      height: px(A ? A.H : L.bankH),
    } as CSSProperties;
  }
  const arrow = paylinePic();
  const arrowR = paylinePic(true);
  return (
    <div ref={hostRef} className={s.host}>
      {L && (
        <div className={s.rig} ref={rigRef} style={style}>
          <div
            ref={bankRef}
            className={s.bank}
            data-side={L.side || undefined}
            data-n={n}
            data-golden={spin?.golden || undefined}
            data-lucky={spin?.lucky || undefined}
            data-calm={calm || undefined}
            data-altar={A ? '' : undefined}
            data-bulbs="idle"
            style={A ? { position: 'absolute', left: A.win.x * L.u, top: A.win.y * L.u, width: A.win.w * L.u, height: A.win.h * L.u } : undefined}
          >
            {!A && (
              <div className={s.bulbs} aria-hidden>
                <i />
                <i />
                <i />
                <i />
              </div>
            )}
            <div className={s.reels} style={{ gap: L.gap * L.u, paddingLeft: L.left * L.u }}>
              {run.strips.map((st, i) => {
                const x = spin ? chain[i] ?? 1 : 1;
                const rayTier = rays[i];
                return (
                  <div
                    key={`${run.seq}:${i}`}
                    className={s.reel}
                    style={{ width: L.reelW * L.u }}
                    ref={(el) => {
                      reelRefs.current[i] = el;
                    }}
                    data-tease={run.plan?.reel === i || undefined}
                    data-rays={rayTier !== undefined || undefined}
                    data-reel={i}
                  >
                    <div className={s.under}>
                      <div className={s.light} />
                      {rayTier !== undefined && (
                        <Rays className={s.rays} url={rayTier >= rarityIndex('mythic') ? raysUrl(RAINBOW, 20, 0.5) : raysUrl([tierColor(rayTier)], 16, 0.55)} />
                      )}
                    </div>
                    <div
                      className={s.strip}
                      ref={(el) => {
                        stripRefs.current[i] = el;
                        if (el && !el.style.transform) el.style.transform = `translate3d(0, ${(L.win / 2) * L.u}px, 0)`;
                      }}
                    >
                      <Cells strip={st} seq={run.seq} reel={i} L={L} reached={run.reached[i]} before={run.before[i]} idle={idle} cellRefs={cellRefs.current} />
                    </div>
                    <div className={s.curve} />
                    {x > 1 && <ChainBadge x={x} combos={spin ? merged[i] ?? 0 : 0} />}
                  </div>
                );
              })}
            </div>
            {A && (
              <canvas
                ref={canvasRef}
                className={s.altar}
                aria-hidden
                style={{ left: -A.win.x * L.u, top: -A.win.y * L.u, width: A.W * L.u, height: A.H * L.u }}
              />
            )}
            <div className={s.payline}>
              <div ref={payFlashRef} className={s.payFlash} />
              {!A && <img className={s.arrowL} src={arrow.url} alt="" draggable={false} />}
              {!A && <img className={s.arrowR} src={arrowR.url} alt="" draggable={false} />}
            </div>
            <div className={s.fx}>
              {fx.map((f) =>
                f.kind === 'token' ? (
                  <TokenFx key={f.id} f={f} L={L} calm={calm} from={{ x: fxX(f.reel), y: fxY }} to={{ x: reelCx(f.reel), y: chipY }} />
                ) : f.kind === 'combo' ? (
                  <ComboFx key={f.id} f={f} L={L} calm={calm} />
                ) : (
                  <Landing key={f.id} f={f} x={fxX(f.reel)} y={fxY} L={L} calm={calm} />
                ),
              )}
            </div>
            {spin && (spin.golden || spin.lucky || spin.turbo) && (
              <div className={s.badges}>
                {spin.golden && (
                  <span className={s.badge} data-kind="golden">
                    GOLDEN!
                  </span>
                )}
                {spin.lucky && (
                  <span className={s.badge} data-kind="lucky">
                    LUCKY
                  </span>
                )}
                {spin.turbo && (
                  <span className={s.badge} data-kind="turbo">
                    TURBO
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A token's landing on a reel: its clover burst and its flight into the reel's stack. */
function TokenFx({ f, L, calm, from, to }: { f: Fx; L: Layout; calm: boolean; from: { x: number; y: number }; to: { x: number; y: number } }) {
  return (
    <>
      <CloverBurst x={from.x} y={from.y} />
      {!calm && f.x !== undefined && <TokenFly value={f.x} from={from} to={to} L={L} />}
    </>
  );
}

// ------------------------------------------------------------------ the mini roller

/** One window per reel: 32 x 23 art pixels (a knight and a one-pixel rim), two to a row. */
const MINI = { winW: 32, winH: 23, gap: 2, pad: 2 } as const;
const miniCols = (n: number) => Math.min(n, 2);
const miniSpan = (k: number, size: number) => 2 * MINI.pad + k * size + (k - 1) * MINI.gap;

interface MiniPlan {
  stops: ReelStop[];
  /** The landed find's picture and rim. */
  url: string;
  rim: string;
  tier: number;
  /** Stops passed; when a token's hold ends; the next silhouette flick (page ms); flicks so far. */
  reached: number;
  holdUntil: number;
  nextFlick: number;
  flick: number;
  fillers: string[];
}

/** What the windows last showed, kept while the mini roller is away (so it comes back as it was). */
const miniShown: Array<{ url: string; rim: string | null; state: string; chip: string; tier: number; gold: boolean }> = [];

function MiniReels({ game, altarOn }: { game: Game; altarOn: boolean }) {
  const countNow = () => Math.max(1, game.state.roll.current?.reels.length ?? reelCount(game.state));
  const [n, setN] = useState(countNow);
  const [u, setU] = useState(() => readU());
  const uRef = useRef(u);
  uRef.current = u;
  const rootRef = useRef<HTMLDivElement>(null);
  const wins = useRef<(HTMLDivElement | null)[]>([]);
  const imgs = useRef<(HTMLImageElement | null)[]>([]);
  const chips = useRef<(HTMLSpanElement | null)[]>([]);
  // The shrine round the windows (altarArt.ts paints it, altar.ts lights it).
  const shrine = useMemo(() => (altarOn ? { lay: miniLayout(n), art: paintMini(n) } : null), [n, altarOn]);
  const altarRef = useRef<Altar | null>(null);
  const shrineRef = useRef(shrine);
  shrineRef.current = shrine;
  const canvasRef = (el: HTMLCanvasElement | null) => {
    if (!el || altarRef.current?.canvasEl === el) return;
    altarRef.current = new Altar(el);
    if (shrineRef.current) altarRef.current.setArt(shrineRef.current.art);
  };
  useLayoutEffect(() => {
    if (shrine && altarRef.current) altarRef.current.setArt(shrine.art);
  }, [shrine]);

  useEffect(() => {
    // (Read where it's mounted: the roller sets its own --u from this.)
    const on = () => setU(readU(rootRef.current?.parentElement));
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  useEffect(() => {
    let raf = 0;
    let spinRef: Spin | null = null;
    let plan: MiniPlan[] = [];
    let tease: Tease | null = null;
    let mults: number[][] = [];
    let matched: number[] = [];
    let shown: number[] = [];
    let glowKey = 'new';
    let lastEl = 0;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const setWin = (i: number, url: string, state: 'spin' | 'token' | 'landed', rim: string | null) => {
      const img = imgs.current[i];
      const win = wins.current[i];
      if (!img || !win) return;
      if (img.getAttribute('src') !== url) img.setAttribute('src', url);
      win.dataset.state = state;
      if (rim) win.style.setProperty('--rim', rim);
      else win.style.removeProperty('--rim');
      miniShown[i] = { ...(miniShown[i] ?? { chip: '', tier: 0, gold: false }), url, rim, state };
    };
    const setChip = (i: number, reached: number) => {
      const el = chips.current[i];
      const x = chainMult(mults, i, shown, reached);
      const gold = shown.some((k) => (mults[i]?.length ?? 0) > k);
      const text = x > 1 ? `×${fmtNum(x)}` : '';
      miniShown[i] = { ...(miniShown[i] ?? { url: '', rim: null, state: 'spin' }), chip: text, tier: stackTier(x), gold };
      if (!el) return;
      if (el.textContent !== text) el.textContent = text;
      el.dataset.tier = String(stackTier(x));
      if (gold) el.dataset.gold = '';
      else delete el.dataset.gold;
    };
    const bump = (i: number, dy: number, flash: boolean) => {
      if (game.state.settings.reduceMotion) return;
      const w = wins.current[i];
      w?.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 140, easing: 'steps(2, jump-none)' });
      if (flash) w?.animate([{ filter: 'brightness(2.2)' }, { filter: 'none' }], { duration: 300, easing: 'steps(3, jump-none)' });
    };
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const g = game.state;
      const spin = g.roll.current;
      const calm = g.settings.reduceMotion;
      const uu = uRef.current;
      const want = Math.max(1, spin?.reels.length ?? (spinRef ? spinRef.reels.length : reelCount(g)));
      if (want !== n) {
        setN(want);
        return;
      }
      const now = performance.now();
      if (spin && spin !== spinRef) {
        spinRef = spin;
        const timer = g.roll.timer * 1000;
        const classes = unlockedClasses(g.rebirths);
        tease = teasePlan(spin);
        mults = spin.reels.map((r) => [...r.tokens]);
        matched = [...spin.combos];
        plan = spin.reels.map((r, i) => {
          const stops = reelStops(spin, i);
          return {
            stops,
            url: knightUrl(r.knightId, r.mutation),
            rim: RARITY_COLOR[r.rarity],
            tier: rarityIndex(r.rarity),
            reached: stops.filter((st) => st.at <= timer).length,
            holdUntil: 0,
            nextFlick: 0,
            flick: 0,
            fillers: Array.from({ length: 12 }, (_, f) => knightUrl(filler(spin.id * 31 + i * 101 + f, false, classes, false).id, null)),
          };
        });
        shown = combosDone(matched, mults, plan.map((p) => p.reached));
        // Joined mid-spin: whatever has already landed shows as landed.
        plan.forEach((p, i) => {
          setChip(i, p.reached);
          if (p.reached >= p.stops.length) setWin(i, p.url, 'landed', p.rim);
          else if (p.reached > 0 && p.stops[p.reached - 1].token !== null) {
            p.holdUntil = p.stops[p.reached - 1].at + tokenHoldMs();
            setWin(i, tokenPic(p.stops[p.reached - 1].token!).url, 'token', '#7ef08f');
          }
        });
      }
      const active = spinRef;
      const altar = altarRef.current;
      if (!active) {
        altar?.frame(now, { calm, spinning: false, glow: null, glowStrength: 0, win: null, mode: null, fill: orbFill(game.luck), rims: miniShown.map((x) => x?.rim ?? null) });
        return;
      }
      const el = spin === active ? g.roll.timer * 1000 : lastEl;
      lastEl = el;
      const reached = () => plan.map((p) => p.reached);
      plan.forEach((p, i) => {
        while (p.reached < p.stops.length && el >= p.stops[p.reached].at) {
          const stop = p.stops[p.reached];
          const step = p.reached;
          p.reached += 1;
          if (stop.token !== null) {
            // A luck token: its clover holds a moment, the reel's stack counts it.
            p.holdUntil = stop.at + tokenHoldMs();
            setWin(i, tokenPic(stop.token).url, 'token', '#7ef08f');
            bump(i, -uu, false);
            tokenSound(active, i, step);
            altar?.token(i, calm);
            const done = combosDone(matched, mults, reached());
            if (done.includes(step) && !shown.includes(step)) {
              shown = [...shown, step];
              const n = comboOf(mults, step).reels.length;
              if (calm) comboSound(active, step, n);
              else timers.push(setTimeout(() => comboSound(active, step, n), FLIGHT_MS));
              plan.forEach((_, j) => setChip(j, plan[j].reached));
            } else setChip(i, p.reached);
          } else {
            setWin(i, p.url, 'landed', p.rim);
            bump(i, uu, p.tier >= 3);
            altar?.land(p.tier, i, p.rim, calm);
          }
        }
        if (p.reached >= p.stops.length) return;
        if (p.holdUntil) {
          if (el < p.holdUntil) return;
          p.holdUntil = 0;
          p.nextFlick = 0;
        }
        // Spinning: silhouettes flick past, slower as the stop comes (one still one, with reduce motion).
        if (now < p.nextFlick) return;
        if (calm) {
          p.nextFlick = Infinity;
          setWin(i, p.fillers[0], 'spin', null);
          return;
        }
        const left = p.stops[p.reached].at - el;
        const close = 1 - Math.max(0, Math.min(1, left / 700));
        p.nextFlick = now + 55 + 115 * close;
        p.flick += 1;
        setWin(i, p.fillers[p.flick % p.fillers.length], 'spin', null);
      });
      // The build-up's glow round the roller, climbing the tiers like the big reels'.
      let key = '';
      let color = '';
      let building = false;
      let bStrength = 0;
      if (tease) {
        const gl = glowAt(tease, el);
        if (gl.tier !== null) {
          building = el < tease.land && gl.strength > 0;
          bStrength = gl.strength;
          let shownTier = gl.tier;
          const since = el - tease.times[gl.step];
          if (gl.step > 0 && !calm && since < flickerMs(tease)) shownTier = Math.floor(since / 45) % 2 === 0 ? gl.tier : tease.tiers[gl.step - 1];
          const strength = el < tease.land ? gl.strength : tease.level >= 1 ? 1 : el - tease.land < 450 ? 1 : 0;
          color = tierColor(shownTier);
          key = strength > 0 ? `${color}|${strength}` : '';
        }
      }
      if (key !== glowKey) {
        glowKey = key;
        const root = rootRef.current;
        if (root) {
          if (key) {
            root.style.setProperty('--glow', color);
            root.dataset.glow = key.split('|')[1];
          } else delete root.dataset.glow;
        }
      }
      const root = rootRef.current;
      if (root) {
        if (active.golden) root.dataset.golden = '';
        else delete root.dataset.golden;
      }
      if (altar) {
        const allIn = plan.every((p) => p.reached >= p.stops.length);
        const best = allIn ? Math.max(...plan.map((p) => p.tier)) : -1;
        const stack = Math.max(1, ...plan.map((p, i) => chainMult(mults, i, shown, p.reached)));
        altar.frame(now, {
          calm,
          spinning: !allIn,
          glow: building ? color : null,
          glowStrength: building ? bStrength : 0,
          win: best >= 3 ? tierColor(best) : null,
          mode: active.golden ? 'golden' : active.lucky ? 'lucky' : active.turbo ? 'turbo' : null,
          fill: orbFill(active.luck * stack),
          rims: plan.map((_, i) => miniShown[i]?.rim ?? null),
        });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, [game, n]);

  const cols = miniCols(n);
  const rows = Math.ceil(n / cols);
  const lay = shrine?.lay ?? null;
  return (
    <div
      ref={rootRef}
      className={m.mini}
      data-altar={lay ? '' : undefined}
      style={
        {
          ['--u' as string]: `${u}px`,
          width: (lay ? lay.W : miniSpan(cols, MINI.winW)) * u,
          height: (lay ? lay.H : miniSpan(rows, MINI.winH)) * u,
        } as CSSProperties
      }
      data-mini-roller
    >
      {Array.from({ length: n }, (_, i) => {
        const was = miniShown[i];
        const c = lay?.cells[i];
        const place: CSSProperties = c
          ? ({
              left: c.x * u,
              top: c.y * u,
              width: c.w * u,
              height: c.h * u,
              ['--kx' as string]: `${Math.floor((c.w - KNIGHT_PIC_W) / 2) * u}px`,
              ['--ky' as string]: `${Math.floor((c.h - KNIGHT_PIC_H) / 2) * u}px`,
              ['--tx' as string]: `${Math.floor((c.w - 16) / 2) * u}px`,
              ['--ty' as string]: `${Math.floor((c.h - 16) / 2) * u}px`,
            } as CSSProperties)
          : {};
        return (
          <div
            key={i}
            ref={(el) => {
              wins.current[i] = el;
            }}
            className={m.win}
            data-mini-reel={i}
            data-state={was?.state ?? 'spin'}
            style={{ ...place, ...(was?.rim ? ({ ['--rim' as string]: was.rim } as CSSProperties) : {}) }}
          >
            <img
              ref={(el) => {
                imgs.current[i] = el;
              }}
              className={m.pic}
              src={was?.url || undefined}
              alt=""
              draggable={false}
            />
            <span
              ref={(el) => {
                chips.current[i] = el;
                // (Its text is only ever written here and by the frame loop.)
                if (el && el.textContent !== (was?.chip ?? '')) el.textContent = was?.chip ?? '';
              }}
              className={m.chip}
              data-tier={was?.tier ?? 0}
              data-gold={was?.gold || undefined}
            />
          </div>
        );
      })}
      {lay && <canvas ref={canvasRef} className={m.altar} aria-hidden style={{ width: lay.W * u, height: lay.H * u }} />}
    </div>
  );
}
