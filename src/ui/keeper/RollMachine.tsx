/**
 * The keepers' rolls on screen: the tinker's combat rolls (TinkerShop.tsx) and the sage's perk rolls
 * (Shops.tsx). The core decides a roll the moment it's paid (core/combatRoll.ts, core/perks.ts); this
 * only shows it.
 *
 *   <RollBody>
 *     <RollStage reel={<RollReel spin idle calm skip onLand />} label={<RollLabel ... />} button={<RollButton ... />} />
 *     <RollList> <RollHead /> <RollRow /> ... </RollList>
 *   </RollBody>
 *
 * RollReel: a slot window where the pool's icons tick down past the payline (a kick back, a launch,
 * then a brake onto the result, a little clunk past the line and back), the altar's reel on a
 * keeper's counter. The rarer the result, the longer it runs and the harder it brakes into a crawl:
 * from Rare up the frame glows, starting a tier or two lower and flickering up to the result's color
 * as it stops (never past it), and a rarer icon often slides by just before it; Epic and Legendary
 * shake the machine. It lands with a thud and a flash in its rarity's color, sparks from Rare up,
 * light rays from Epic up. Reduce motion: no spin, sparks, rays or shakes; the result just shows.
 * A tap while it spins (`skip`) lands it at once.
 *
 * The phone puts the reel beside its label and button, the list under them; a wide screen puts the
 * reel, twice the size, over its label and button in a column of its own, the list beside it.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { RARITY_COLOR } from '../../core/rarity';
import { ROLL_RARITIES, rollRarityIndex, type RollRarity } from '../../core/rolls';
import { Chunky, type Grad } from '../fx/Chunky';
import { paylinePic, sparklePic } from '../fx/pixelArt';
import { RAINBOW, raysUrl } from '../fx/rays';
import { Rays } from '../fx/Rays';
import { Px, type IconName } from '../px';
import { uiSound } from '../sound';
import { cardIcon, hexIcon } from '../upgrades/icons';
import { Glyph } from './KeeperScreen';
import s from './roll.module.css';

export interface ReelFace {
  /** Its picture: an upgrade or perk icon (iconRows.ts, or one of the UI's). */
  icon: string;
  rarity: RollRarity;
}

export interface ReelSpin {
  /** A new number for every roll: a new number starts the reel. */
  n: number;
  /** Where it lands. */
  face: ReelFace;
  /** What else could have come up: the icons rolling past are drawn from these, leaning rarer. */
  pool: readonly ReelFace[];
}

/** Display text in each rarity's bands (Chunky.tsx). */
export const RARITY_GRAD: Record<RollRarity, Grad> = { common: 'white', uncommon: 'green', rare: 'blue', epic: 'purple', legendary: 'gold' };

/** A rarity's color, dark enough to read on the paper. */
export function rarityInk(r: RollRarity): string {
  const n = parseInt(RARITY_COLOR[r].slice(1), 16);
  const f = (sh: number) => Math.round(((n >> sh) & 255) * (r === 'common' ? 0.5 : 0.62));
  return `rgb(${f(16)}, ${f(8)}, ${f(0)})`;
}

/** A chance as the list shows it: "12%", "6.6%", "0.8%". */
export function pctShort(p: number): string {
  const v = p * 100;
  if (v >= 10) return `${Math.round(v)}%`;
  if (v >= 0.95) return `${(Math.round(v * 10) / 10).toFixed(1)}%`;
  return `${Math.max(0.1, Math.round(v * 10) / 10).toFixed(1)}%`;
}

/**
 * Wide screens: the reel at twice the size, in a column of its own. A wide but short one (a small
 * browser window, a phone on its side) has no room down the column for that and ROLL under it: there
 * it's up to one and a half times its size, as many whole device pixels to its pixel as that allows.
 */
const WIDE = '(min-width: 800px)';
const SHORT = '(max-height: 540px)';
function reelScale(): number {
  if (typeof matchMedia === 'undefined' || !matchMedia(WIDE).matches) return 1;
  if (!matchMedia(SHORT).matches) return 2;
  const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 2;
  const dev = px * (window.devicePixelRatio || 1);
  return Math.max(1, Math.floor(dev * 1.5) / dev);
}
function useReelScale(): number {
  const [k, setK] = useState(reelScale);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const on = () => setK(reelScale());
    const mqs = [matchMedia(WIDE), matchMedia(SHORT)];
    for (const mq of mqs) mq.addEventListener('change', on);
    window.addEventListener('resize', on);
    return () => {
      for (const mq of mqs) mq.removeEventListener('change', on);
      window.removeEventListener('resize', on);
    };
  }, []);
  return k;
}

// ------------------------------------------------------------------ the layout

/** The roll's whole area under the purse: the stage, then (or beside it) the list. */
export function RollBody({ children }: { children: ReactNode }) {
  return <div className={s.body}>{children}</div>;
}

/** The reel with its label and button. */
export function RollStage({ reel, label, button }: { reel: ReactNode; label: ReactNode; button: ReactNode }) {
  return (
    <div className={s.stage}>
      <div className={s.reelBox}>{reel}</div>
      <div className={s.side}>
        <div className={s.label}>{label}</div>
        {button}
      </div>
    </div>
  );
}

/**
 * Under the reel: the result once it lands (its name in its rarity's colors, a line on what it does,
 * a tag like x2 or FREE), "..." while it spins, or a word on what a roll does before the first.
 */
export function RollLabel({ name, rarity, line, tags, spinning, hint }: { name?: string; rarity?: RollRarity; line?: ReactNode; tags?: ReactNode; spinning?: boolean; hint?: ReactNode }) {
  if (spinning) return <span className={s.dots}>...</span>;
  if (!name || !rarity) return <span className={s.hint}>{hint}</span>;
  return (
    <span className={s.result}>
      <span className={s.nameRow}>
        <Chunky text={name.toUpperCase()} size={7} grad={RARITY_GRAD[rarity]} className={s.name} />
        {tags}
      </span>
      {line && (
        <span className={s.effect} style={{ color: rarityInk(rarity) }}>
          {line}
        </span>
      )}
    </span>
  );
}

/** A tag that pops in next to a result's name: x2 (a double), FREE. */
export function RollTag({ text, kind }: { text: string; kind: 'double' | 'free' }) {
  return (
    <span className={s.tag} data-kind={kind}>
      {text}
    </span>
  );
}

export type RollButtonState = 'ready' | 'short' | 'spinning' | 'done' | 'locked';

/**
 * ROLL and its price (green when it can roll, paper with red writing when short: a press shakes its
 * head and floats how much is missing). SKIP while the reel spins; grey with a word when it can't
 * roll at all.
 */
export function RollButton({ state, price, free, icon, onPress, short, doneText, lockedText, tut }: {
  /** A name the tutorial's pointer finds it by (data-tut). */
  tut?: string;
  state: RollButtonState;
  price: string;
  /** This roll costs nothing: ROLL FREE, no price. */
  free?: boolean;
  icon: IconName;
  onPress: () => void;
  /** Floats up, in red, on a press when short ("need 340 more"). */
  short?: string;
  doneText?: string;
  lockedText?: string;
}) {
  const [nope, setNope] = useState(0);
  useEffect(() => {
    if (!nope) return;
    const t = window.setTimeout(() => setNope(0), 950);
    return () => window.clearTimeout(t);
  }, [nope]);
  if (state === 'done' || state === 'locked')
    return (
      <button className={`btn ${s.roll}`} data-kind="off" data-tut={tut} disabled>
        <Px icon={state === 'done' ? 'check' : 'lock'} size="sm" />
        <span>{state === 'done' ? doneText : lockedText}</span>
      </button>
    );
  const press = () => {
    if (state !== 'short') return onPress();
    uiSound('tap');
    setNope((x) => x + 1);
  };
  return (
    <span className={s.rollWrap}>
      <button key={nope ? `n${nope}` : 'r'} className={`btn ${s.roll}`} data-kind={state} data-nope={nope > 0 || undefined} data-tut={tut} onClick={press}>
        {state === 'spinning' ? (
          <span>SKIP</span>
        ) : (
          <>
            <span className={s.verb}>ROLL</span>
            {free ? (
              <span data-free>FREE</span>
            ) : (
              <>
                <Px icon={icon} size="sm" />
                <span>{price}</span>
              </>
            )}
          </>
        )}
      </button>
      {nope > 0 && short && (
        <span key={`f${nope}`} className={s.float}>
          {short}
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ the list

/** The list under (or beside) the stage: rows of what's in the roll and their odds. */
export function RollList({ children, scrollKey }: { children: ReactNode; scrollKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [scrollKey]);
  return (
    <div className={s.list} ref={ref}>
      <div className={s.rows}>{children}</div>
    </div>
  );
}

/** A heading across the list ("ATTACK", "YOURS"). */
export function RollHead({ children, icon }: { children: ReactNode; icon?: string }) {
  return (
    <div className={s.head}>
      {icon && <Glyph icon={icon} size="xs" />}
      {children}
    </div>
  );
}

/**
 * One line of the list: its icon, its name, its tiers as pips (a combat line), and its chance on the
 * next roll in the color of how rare that would be, or MAX / a check when it's out of the roll.
 */
export function RollRow({ icon, name, tiers, chance, rarity, done, doneText, flash, onTap }: {
  icon: string;
  name: string;
  tiers?: { now: number; max: number };
  chance: number;
  rarity: RollRarity | null;
  done?: boolean;
  doneText?: string;
  /** Just landed: the row flashes. */
  flash?: boolean;
  onTap: () => void;
}) {
  const art = hexIcon(icon);
  const style = { ['--rc' as string]: rarity ? RARITY_COLOR[rarity] : 'transparent' } as CSSProperties;
  return (
    <button className={s.row} data-done={done || undefined} data-flash={flash || undefined} style={style} onClick={onTap}>
      <span className={s.rowArt}>
        <img className="px" src={art.url} alt="" draggable={false} style={{ width: `calc(${art.w} * var(--px))`, height: `calc(${art.h} * var(--px))` }} />
      </span>
      <span className={s.rowName}>
        <b>{name}</b>
        {tiers && tiers.max > 1 && (
          <span className={s.pips}>
            {Array.from({ length: tiers.max }, (_, i) => (
              <i key={i} data-on={i < tiers.now || undefined} />
            ))}
          </span>
        )}
      </span>
      {done ? (
        <span className={s.rowDone}>
          <Px icon="check" size="xs" />
          {doneText}
        </span>
      ) : (
        <span className={s.odds} style={{ color: rarity ? rarityInk(rarity) : undefined }}>
          {pctShort(chance)}
        </span>
      )}
    </button>
  );
}

// ------------------------------------------------------------------ the reel

/**
 * Cells the strip holds: the one peeking in below the payline, then a spin's (up to its rarity's count,
 * the result and two above it).
 */
const CELLS = 24;
/** The strip's cell under the payline at rest: cell 0 peeks in below it. */
const BASE = 1;
/** A cell, and the window around it (art px, times the reel's scale). */
const CELL = 26;
const WIN_W = 34;
const WIN_H = 42;
const PEEK = (WIN_H - CELL) / 2;

/**
 * Per rarity, Common to Legendary: the spin's length (ms), the cells it rolls through, and its crawl:
 * the last `crawl` cells take the last `share` of the spin.
 */
const DRAMA = [
  { ms: 950, cells: 11, crawl: 0, share: 0 },
  { ms: 1300, cells: 13, crawl: 0.6, share: 0.22 },
  { ms: 1750, cells: 15, crawl: 1.2, share: 0.38 },
  { ms: 2300, cells: 17, crawl: 1.6, share: 0.45 },
  { ms: 2900, cells: 20, crawl: 2, share: 0.5 },
] as const;

/** A small seeded random stream (a spin's strip is the same every frame). */
function stream(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The icons a spin rolls past, bottom to top: what showed before, fillers leaning far rarer than the
 * real odds, then the result at `cells` and two more above it. Most of the time a rarer icon than the
 * result slides by just before it (and one may sit just past it).
 */
export function reelStrip(spin: ReelSpin, from: ReelFace, cells: number): ReelFace[] {
  const rnd = stream(spin.n * 31 + 7);
  const pool = spin.pool.length ? spin.pool : [spin.face];
  const pick = (not: string | null): ReelFace => {
    const others = pool.filter((f) => f.icon !== not);
    const cands = others.length ? others : pool;
    const w = (f: ReelFace) => 1 + 0.9 * rollRarityIndex(f.rarity);
    let r = rnd() * cands.reduce((t, f) => t + w(f), 0);
    for (const f of cands) {
      r -= w(f);
      if (r < 0) return f;
    }
    return cands[cands.length - 1];
  };
  const out: ReelFace[] = [from];
  for (let i = 1; i < cells; i++) out.push(pick(out[i - 1].icon));
  const rarer = pool.filter((f) => rollRarityIndex(f.rarity) > rollRarityIndex(spin.face.rarity) && f.icon !== spin.face.icon);
  if (rarer.length && rnd() < 0.65) out[cells - 1] = rarer[Math.floor(rnd() * rarer.length)];
  if (out[cells - 1].icon === spin.face.icon) out[cells - 1] = pick(spin.face.icon);
  out.push(spin.face);
  out.push(rarer.length && rnd() < 0.5 ? rarer[Math.floor(rnd() * rarer.length)] : pick(spin.face.icon));
  out.push(pick(out[out.length - 1].icon));
  return out;
}

/**
 * Where the strip is (in cells, from what showed before) `u` of the way through a spin: a kick back, a
 * launch that brakes almost to a stop `crawl` cells short of the result, then (the last `share` of the
 * spin) a creep onto it, and a clunk a little past the line and back as it stops.
 */
export function reelPos(u: number, cells: number, crawl = 0, share = 0): number {
  const kick = 0.07;
  if (u <= 0) return 0;
  if (u < kick) return -0.2 * Math.sin((Math.PI * u) / kick);
  const t = Math.min(1, u);
  const split = 1 - share;
  let p: number;
  if (t < split) {
    const v = (t - kick) / (split - kick);
    p = (cells - crawl) * (1 - Math.pow(1 - v, 2.4));
  } else {
    const w = share > 0 ? (t - split) / share : 1;
    p = cells - crawl + crawl * w * w * (3 - 2 * w);
  }
  const clunk = 0.06;
  if (t > 1 - clunk) p += 0.14 * Math.sin((Math.PI * (t - (1 - clunk))) / clunk);
  return p;
}

/** The glow's tiers on the way in (rarity indexes, lowest first, the result's last), from Rare up. */
function glowTiers(r: number): number[] {
  if (r < 2) return [];
  const out: number[] = [];
  for (let t = Math.max(1, r - 2); t <= r; t++) out.push(t);
  return out;
}

/**
 * The reel. `spin` is the roll to show (a new `n` starts it); `idle` the icon in the window before
 * the first roll; `skip` lands a spin in flight at once when it changes; `onLand` says when it's down.
 */
export function RollReel({ spin, idle, calm, skip, onLand }: { spin: ReelSpin | null; idle: string; calm: boolean; skip: number; onLand: (n: number) => void }) {
  const k = useReelScale();
  const geo = useRef(k);
  geo.current = k;
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const bumpRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const sparksRef = useRef<HTMLDivElement>(null);
  const imgs = useRef<(HTMLImageElement | null)[]>([]);
  /** The icon in each cell (to size them all again at a new scale). */
  const icons = useRef<(string | null)[]>([]);
  const shown = useRef<ReelFace>({ icon: idle, rarity: 'common' });
  /** What peeks in below the payline (nothing before the first roll). */
  const below = useRef<ReelFace | null>(null);
  const pos = useRef(BASE);
  const live = useRef<{ n: number; land: () => void } | null>(null);
  const onLandRef = useRef(onLand);
  onLandRef.current = onLand;
  const [rays, setRays] = useState<{ key: number; r: number } | null>(null);

  const setCell = (i: number, icon: string | null) => {
    const img = imgs.current[i];
    if (!img) return;
    icons.current[i] = icon;
    if (!icon) {
      img.removeAttribute('src');
      img.style.width = img.style.height = '0';
      return;
    }
    const a = cardIcon(icon);
    if (img.getAttribute('src') !== a.url) img.setAttribute('src', a.url);
    img.style.width = `calc(${a.w * geo.current} * var(--px))`;
    img.style.height = `calc(${a.h * geo.current} * var(--px))`;
  };
  /** Cell `p` (fractional while moving) at the payline, in whole art pixels. */
  const setPos = (p: number) => {
    pos.current = p;
    const el = stripRef.current;
    if (!el) return;
    const y = Math.round((PEEK - (CELLS - 1 - p) * CELL) * geo.current);
    el.style.transform = `translateY(calc(${y} * var(--px)))`;
  };

  // At a new size (a phone turned, a window resized past the wide layout), every cell and the strip again.
  useLayoutEffect(() => {
    icons.current.forEach((icon, i) => icon && setCell(i, icon));
    setPos(pos.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  useLayoutEffect(() => {
    if (spin || live.current) return;
    shown.current = { icon: idle, rarity: 'common' };
    below.current = null;
    setCell(BASE - 1, null);
    setCell(BASE, idle);
    setPos(BASE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idle]);

  // A spin.
  useEffect(() => {
    if (!spin) return;
    const r = rollRarityIndex(spin.face.rarity);
    const d = DRAMA[r];
    const root = rootRef.current;
    const color = RARITY_COLOR[spin.face.rarity];
    const faces = reelStrip(spin, shown.current, d.cells);
    setCell(BASE - 1, below.current?.icon ?? null);
    faces.forEach((f, i) => setCell(BASE + i, f.icon));
    setPos(BASE);
    setRays(null);
    root?.style.setProperty('--tc', color);
    let raf = 0;
    let done = false;
    let passed = 0;
    let glowStep = -1;
    let lastTick = 0;
    let creep = -1;
    const glow = glowTiers(r);
    // The glow starts just before the crawl.
    const glowFrom = Math.max(0.2, 1 - d.share - 0.06);
    const setGlow = (t: number | null) => {
      if (!root) return;
      if (t === null) {
        delete root.dataset.glow;
        return;
      }
      root.dataset.glow = String(Math.min(3, glowStep + 1));
      root.style.setProperty('--glow', RARITY_COLOR[ROLL_RARITIES[t]]);
    };
    const setShake = (n: number) => {
      if (!root) return;
      if (n > 0) root.dataset.shake = String(n);
      else delete root.dataset.shake;
    };
    const land = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      live.current = null;
      shown.current = spin.face;
      below.current = faces[d.cells - 1];
      setPos(BASE + d.cells);
      setGlow(null);
      setShake(0);
      flashRef.current?.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 260 + r * 80, easing: 'steps(4, jump-none)' });
      if (!calm) {
        bumpRef.current?.animate([{ transform: `translateY(calc(${(1 + Math.min(2, r)) * geo.current} * var(--px)))` }, { transform: 'none' }], { duration: 180, easing: 'steps(2, jump-none)' });
        if (r >= 2) sparks(r, color);
        if (r >= 3) {
          const dd = (r >= 4 ? 2 : 1) * geo.current;
          const at = ([x, y]: number[]) => ({ transform: `translate(calc(${x} * var(--px)), calc(${y} * var(--px)))` });
          root?.animate([[0, 0], [dd, -dd], [-dd, dd], [dd, dd], [-dd, -dd], [0, 0]].map(at), { duration: 380, easing: 'steps(6, jump-none)' });
          setRays({ key: spin.n, r });
        }
      }
      uiSound('reelLand', r);
      if (r >= 3) uiSound('stamp');
      if (r >= 4) uiSound('unlock');
      onLandRef.current(spin.n);
    };
    live.current = { n: spin.n, land };
    if (calm) {
      land();
      return;
    }
    uiSound('reelStart');
    const t0 = performance.now();
    const frame = (now: number) => {
      const u = Math.min(1, (now - t0) / d.ms);
      const p = reelPos(u, d.cells, d.crawl, d.share);
      setPos(BASE + p);
      const cell = Math.max(0, Math.floor(p + 0.5));
      if (cell > passed) {
        passed = cell;
        // The ticks climb toward a rare result as it nears.
        if (now - lastTick > 38) {
          lastTick = now;
          uiSound('reelTick', cell >= d.cells - 3 ? r * 2 + (cell - d.cells + 3) : 0);
        }
      }
      // The crawl's notches, a step higher every quarter of a cell.
      if (d.share > 0 && u > 1 - d.share) {
        const q = Math.floor((p - (d.cells - d.crawl)) * 4);
        if (q > creep) {
          creep = q;
          uiSound('creep', Math.min(12, r + q));
        }
      }
      if (glow.length && u >= glowFrom) {
        const step = Math.min(glow.length - 1, Math.floor(((u - glowFrom) / (1 - glowFrom)) * glow.length));
        if (step !== glowStep) {
          glowStep = step;
          setGlow(glow[step]);
          uiSound('glowUp', glow[step]);
        }
      }
      if (r >= 3) setShake(u > 0.8 && r >= 4 ? 2 : u > 1 - d.share ? 1 : 0);
      if (u >= 1) return land();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (live.current?.n === spin.n) live.current = null;
    };
    // (A spin runs once per `n`.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spin?.n]);

  // A tap while it spins lands it now.
  useEffect(() => {
    if (skip) live.current?.land();
  }, [skip]);

  const sparks = (r: number, color: string) => {
    const box = sparksRef.current;
    if (!box) return;
    const pic = sparklePic();
    const n = r >= 4 ? 16 : r >= 3 ? 12 : 8;
    const reach = WIN_W * geo.current * (r >= 3 ? 0.95 : 0.75);
    for (let i = 0; i < n; i++) {
      const img = document.createElement('img');
      img.src = pic.url;
      img.alt = '';
      img.style.width = `calc(${pic.w} * var(--px))`;
      img.style.height = `calc(${pic.h} * var(--px))`;
      img.style.left = `calc(${-pic.w / 2} * var(--px))`;
      img.style.top = `calc(${-pic.h / 2} * var(--px))`;
      img.style.filter = `drop-shadow(var(--px) var(--px) 0 ${r >= 4 ? RAINBOW[i % RAINBOW.length] : color})`;
      box.appendChild(img);
      const a = (i / n) * Math.PI * 2 + (r % 2) * 0.3;
      const x = Math.round(Math.cos(a) * reach);
      const y = Math.round(Math.sin(a) * reach);
      const anim = img.animate(
        [
          { transform: 'translate(0, 0) scale(0.5)', opacity: 1 },
          { transform: `translate(calc(${x} * var(--px)), calc(${y} * var(--px))) scale(1)`, opacity: 1, offset: 0.7 },
          { transform: `translate(calc(${x} * var(--px)), calc(${y + 3} * var(--px))) scale(0.6)`, opacity: 0 },
        ],
        { duration: 560 + r * 70, easing: 'steps(7, jump-none)' },
      );
      anim.onfinish = () => img.remove();
    }
  };

  const pay = paylinePic();
  const payL = paylinePic(true);
  const style = {
    ['--k' as string]: k,
    ['--win-w' as string]: `calc(${WIN_W * k} * var(--px))`,
    ['--win-h' as string]: `calc(${WIN_H * k} * var(--px))`,
    ['--cell' as string]: `calc(${CELL * k} * var(--px))`,
  } as CSSProperties;
  return (
    <div className={s.reel} style={style}>
      {rays && (
        <Rays key={rays.key} url={raysUrl(rays.r >= 4 ? RAINBOW : [RARITY_COLOR[ROLL_RARITIES[rays.r]], '#ffffff'], 16, 0.5)} className={s.rays} />
      )}
      <div ref={rootRef} className={s.machine} data-calm={calm || undefined}>
        <img className={`px ${s.pay}`} src={pay.url} alt="" style={{ left: 0, width: `calc(${pay.w * k} * var(--px))`, height: `calc(${pay.h * k} * var(--px))` }} />
        <div className={s.win}>
          <div ref={bumpRef} className={s.bump}>
            <div ref={stripRef} className={s.strip}>
              {Array.from({ length: CELLS }, (_, j) => {
                const i = CELLS - 1 - j;
                return (
                  <span key={i} className={s.cell}>
                    <img
                      ref={(el) => {
                        imgs.current[i] = el;
                      }}
                      className="px"
                      alt=""
                      draggable={false}
                    />
                  </span>
                );
              })}
            </div>
          </div>
          <div ref={flashRef} className={s.flash} />
        </div>
        <img className={`px ${s.pay}`} src={payL.url} alt="" style={{ right: 0, width: `calc(${payL.w * k} * var(--px))`, height: `calc(${payL.h * k} * var(--px))` }} />
        <div ref={sparksRef} className={s.sparks} />
      </div>
    </div>
  );
}
