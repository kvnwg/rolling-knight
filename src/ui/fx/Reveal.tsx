/**
 * The big reveal for a find that's rare *for you* (the core judges it: luck.ts judgeFinds), ported from
 * Dumpster Legend's RevealLayer (RareReveal), HyperFx and Rays.
 *
 * The screen goes black; a heartbeat in the dark while light gathers (motes drifting in, a point of
 * light throbbing); the knight rises out of the dark as a silhouette and bursts into color, shining
 * (a glint, sparkles, its light disc and turning rays), while its "1 in X" counts up from 1 (slowing near
 * the end, its plate taking each tier's colors as it climbs past their odds) and slams down on the real
 * odds with a flash, a quake, a shock ring and confetti. The light starts at a low tier's color and
 * flickers up tier by tier with the counter, so it only reaches the knight's own color as the odds land.
 * BIG, HUGE and INSANE take longer and shout louder (more heartbeats, motes, sparkles, a second set of
 * rays; INSANE ends on rainbow rays). The tutorial's finds get their own banner over the title.
 *
 * HYPER RARE (the rarest find of your whole game) plays the same reveal on a longer clock inside its
 * showcase (HyperFx.tsx): warning bands and a summoning that can't be skipped for its first
 * HYPER_LOCK_MS, a burst the knight rises out of, fireworks through the count, and its own banner.
 *
 * Tap skips to the result; tap again closes it (`onDone`). `calm` (reduce motion): shorter, no shaking,
 * no particles or white flashes; the light, the count and the card stay.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CLASSES, knightDef } from '../../core/knights';
import { RARITIES, RARITY_COLOR, RARITY_NAME, RARITY_ODDS, rarityAtLeast, rarityIndex, type Rarity } from '../../core/rarity';
import type { MutationId } from '../../core/state';
import { KNIGHT_PIC_H, KNIGHT_PIC_W, knightUrl } from '../sprites';
import { Chunky } from './Chunky';
import { fxSound } from './fxSound';
import { HyperBands, HyperFx, type HyperHandle, type RevealClock } from './HyperFx';
import { sparklePic } from './pixelArt';
import { RAINBOW, raysUrl } from './rays';
import { Rays } from './Rays';
import { DRAMA_LEVEL, HYPER_LOCK_MS, revealPhases } from './revealTiming';
import { haloUrl } from './halo';
import { CONFETTI_COLORS, fmtOdds, mixHex, rarityBands, readU, tierColor } from './util';
import s from './reveal.module.css';

export interface RevealItem {
  knightId: string;
  rarity: Rarity;
  mutation: MutationId | null;
  oneIn: number;
  drama: 'big' | 'huge' | 'insane' | 'hyper';
  isNew: boolean;
  mult: number;
  scripted?: 'warmup' | 'first' | 'beginner';
}

type Phase = 'black' | 'dark' | 'appear' | 'count' | 'landed';

/** The reveal's light starts no higher than Rare's blue, so it never gives the ceiling away. */
const GLOW_START = RARITIES.indexOf('rare');
/** The wide pool of light over the whole screen behind a reveal: its size in art pixels. */
const WIDE_HALO = 240;

const SLAM_SOUND = { big: 'revealBig', huge: 'revealHuge', insane: 'revealInsane', hyper: 'revealHyper' } as const;

const MUTATION_LOOK: Record<MutationId, { name: string; color: string }> = {
  gilded: { name: 'GILDED', color: '#e0a22a' },
  shadow: { name: 'SHADOW', color: '#6a3aa8' },
  radiant: { name: 'RADIANT', color: '#f0c860' },
  void: { name: 'VOID', color: '#2a2a6a' },
};

/** Knight pictures are KNIGHT_PIC_W x KNIGHT_PIC_H image pixels (sprites.tsx knightUrl), measured once the sheets load: read them live. */

const keys = new WeakMap<RevealItem, number>();
let nextKey = 1;

/**
 * The full-screen reveal for `item`. A new item (a different object) starts a fresh reveal, so a queue
 * can show `items[0]` and drop it in `onDone`.
 */
export function Reveal({ item, onDone, calm }: { item: RevealItem; onDone: () => void; calm?: boolean }) {
  let k = keys.get(item);
  if (!k) {
    k = nextKey++;
    keys.set(item, k);
  }
  return <RareReveal key={k} item={item} onDone={onDone} calm={!!calm} />;
}

/** The window in CSS px and the UI pixel unit, kept up to date. */
function useViewport(): { w: number; h: number; u: number } {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight, u: readU() });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp((cur) => {
      const next = read();
      return next.w === cur.w && next.h === cur.h && next.u === cur.u ? cur : next;
    });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

/** Light motes drifting in from the dark toward where the knight will appear. */
function Motes({ n, ms, u }: { n: number; ms: number; u: number }) {
  const motes = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const a = i * 2.39996;
        const r = 63 + ((i * 97) % 44);
        return { x: Math.round(Math.cos(a) * r) * u, y: Math.round(Math.sin(a) * r) * u, d: ms * (0.55 + ((i * 37) % 40) / 100), delay: (i * 61) % Math.max(1, ms * 0.4) };
      }),
    [n, ms, u],
  );
  return (
    <div className={s.motes}>
      {motes.map((m, i) => (
        <span
          key={i}
          className={s.mote}
          style={{ ['--x' as string]: `${m.x}px`, ['--y' as string]: `${m.y}px`, animationDuration: `${m.d}ms`, animationDelay: `${m.delay}ms` } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** The four-point sparkle (7 x 7 art pixels) twinkling on and off round the knight. */
function Sparkles({ n, half, u }: { n: number; half: number; u: number }) {
  const art = sparklePic();
  const f = Math.max(1, half / 24);
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + 0.4;
        const r = (32 + ((i * 53) % 70) / 6) * f;
        // Whole art pixels from the knight's middle (the sparkle's middle pixel is 3 in).
        const x = (Math.round(Math.cos(a) * r) - 3) * u;
        const y = (Math.round(Math.sin(a) * r * 0.8) - 3) * u;
        return (
          <img
            key={i}
            src={art.url}
            alt=""
            aria-hidden
            draggable={false}
            className={s.sparkle}
            style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, width: art.w * u, height: art.h * u, animationDelay: `${(i * 173) % 1100}ms` }}
          />
        );
      })}
    </>
  );
}

function Confetti({ n, cols }: { n: number; cols: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        left: Math.round((((i * 137.5) % 100) / 100) * cols),
        delay: (i * 53) % 900,
        dur: 1500 + ((i * 97) % 1100),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        tall: i % 2 === 0,
        flip: 180 + ((i * 41) % 260),
      })),
    [n, cols],
  );
  return (
    <div className={s.confetti}>
      {bits.map((b, i) => (
        <span
          key={i}
          data-tall={b.tall || undefined}
          style={{
            left: `calc(${b.left} * var(--u))`,
            background: b.color,
            animationDelay: `${b.delay}ms, ${b.delay}ms`,
            animationDuration: `${b.dur}ms, ${b.flip}ms`,
          }}
        />
      ))}
    </div>
  );
}

const SHOCK_MS = 720;

/**
 * The landing's shock wave: a one-art-pixel square ring growing from the knight past the screen's edge
 * and fading, in 16 steps, then gone. A canvas of one pixel per art pixel, shown crisp.
 */
function ShockRing({ color, size, u }: { color: string; size: number; u: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const t0 = performance.now();
    let raf = 0;
    let shown = -1;
    const frame = (now: number) => {
      const k = Math.min(15, Math.floor(((now - t0) / SHOCK_MS) * 16));
      if (k !== shown) {
        shown = k;
        ctx.clearRect(0, 0, size, size);
        const side = Math.max(2, Math.round(18 + (size - 18) * (k / 16)));
        const o = Math.floor((size - side) / 2);
        ctx.globalAlpha = 1 - k / 16;
        ctx.fillStyle = color;
        ctx.fillRect(o, o, side, 1);
        ctx.fillRect(o, o + side - 1, side, 1);
        ctx.fillRect(o, o, 1, side);
        ctx.fillRect(o + side - 1, o, 1, side);
      }
      if (now - t0 < SHOCK_MS) raf = requestAnimationFrame(frame);
      else setDone(true);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [color, size]);
  if (done) return null;
  return (
    <canvas
      ref={ref}
      className={s.shock}
      width={size}
      height={size}
      aria-hidden
      style={{ width: size * u, height: size * u, left: `calc(var(--ix) - ${(size * u) / 2}px)`, top: `calc(var(--iy) - ${(size * u) / 2}px)` }}
    />
  );
}

/** A Chunky size (art px) that keeps `text` inside a screen `cols` art pixels wide. */
function fitSize(text: string, cols: number, max: number, min: number): number {
  return Math.max(min, Math.min(max, Math.floor((cols - 12) / (text.length * 0.7))));
}

function RareReveal({ item, onDone, calm }: { item: RevealItem; onDone: () => void; calm: boolean }) {
  const drama = item.drama;
  const lvl = DRAMA_LEVEL[drama];
  const noFlash = calm;
  const ph = useMemo(() => revealPhases(drama, calm), [drama, calm]);
  const hyper = drama === 'hyper';
  const vp = useViewport();
  const { u } = vp;
  const cols = Math.floor(vp.w / u);
  const rows = Math.floor(vp.h / u);
  // The knight's size: a whole number of UI pixels per image pixel, as big as sits well on the screen.
  const ks = Math.max(2, Math.min(6, Math.floor(Math.min((cols * 0.66) / KNIGHT_PIC_W, (rows * 0.32) / KNIGHT_PIC_H))));
  const half = (KNIGHT_PIC_W * ks) / 2;
  const clock = useRef<RevealClock>({ t0: performance.now(), offset: 0 });
  const fx = useRef<HyperHandle | null>(null);
  const [locked, setLocked] = useState(hyper);
  const itemTier = rarityIndex(item.rarity);
  const [phase, setPhase] = useState<Phase>('black');
  const [tier, setTier] = useState<Rarity>('common');
  const [num, setNum] = useState('1');
  const [bob, setBob] = useState(0);
  const [pos, setPos] = useState<{ ix: number; iy: number } | null>(null);
  const skip = useRef(false);
  const phaseRef = useRef<Phase>('black');
  const rootRef = useRef<HTMLDivElement>(null);
  const haloN = useRef(93);
  const itemRef = useRef<HTMLDivElement>(null);
  const raysRefs = useRef<(HTMLImageElement | null)[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The light's tier (climbs with the counter); the rays follow once a step has settled.
  const glowRef = useRef(Math.min(itemTier, GLOW_START));
  const raysTierRef = useRef(glowRef.current);
  // The counter climbs through every tier from Uncommon up to the knight's own.
  const ladder = useMemo(() => RARITIES.filter((r) => r !== 'common' && rarityAtLeast(item.rarity, r)), [item.rarity]);
  // The biggest deals end on rainbow rays (HYPER RARE's are rainbow all along); until then the rays take the light's color.
  const raysFor = (k: number) => (hyper || (drama === 'insane' && k >= itemTier) ? raysUrl(RAINBOW, 24, 0.5) : raysUrl([tierColor(k)]));

  // Where the knight stands (every block holds its place from the start, so this doesn't move; it's
  // measured again once the fonts are in, in case the lettering changed the column's height).
  useLayoutEffect(() => {
    const measure = () => {
      const el = itemRef.current;
      const root = rootRef.current;
      if (!el || !root) return;
      const a = el.getBoundingClientRect();
      const b = root.getBoundingClientRect();
      // (Its own rise and bob are whole-pixel translations: measured without them.)
      const shift = new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform).m42;
      const ix = Math.round(a.left - b.left + a.width / 2);
      const iy = Math.round(a.top - b.top + a.height / 2 - shift);
      setPos((cur) => (cur && cur.ix === ix && cur.iy === iy ? cur : { ix, iy }));
    };
    measure();
    let live = true;
    void document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
    };
  }, [vp, ks]);

  useEffect(() => {
    const t0 = performance.now();
    clock.current = { t0, offset: 0 };
    const tDark = ph.black;
    const tAppear = tDark + ph.dark;
    const tCount = tAppear + ph.appear;
    const tLand = tCount + ph.count;
    let offset = 0;
    let beats = 0;
    let cur: Phase = 'black';
    let shownTier: Rarity = 'common';
    let lastText = '1';
    let raf = 0;
    // The light: its tier, the one before it and when it stepped up (it flickers between them a moment).
    let glow = glowRef.current;
    let glowPrev = glow;
    let glowAt = -1e9;
    let glowShown = -1;
    // Draw each tier's rays ahead of time in the dark, one per frame (rays.ts caches them).
    const pending = ladder.map((r) => RARITIES.indexOf(r)).filter((k) => k >= glow);
    let stillLocked = hyper;
    let boomed = false;
    if (hyper) fxSound('riser', itemTier);
    const step = () => {
      if (skip.current) {
        skip.current = false;
        offset = Math.max(offset, tLand - (performance.now() - t0));
        clock.current.offset = offset;
      }
      const el = performance.now() - t0 + offset;
      if (stillLocked && performance.now() - t0 >= HYPER_LOCK_MS) {
        stillLocked = false;
        setLocked(false);
      }
      if (hyper && !boomed && el >= tAppear) {
        boomed = true;
        fxSound('revealHyper', itemTier);
      }
      const next: Phase = el < tDark ? 'black' : el < tAppear ? 'dark' : el < tCount ? 'appear' : el < tLand ? 'count' : 'landed';
      if ((next === 'black' || next === 'dark') && pending.length) raysFor(pending.shift()!);
      if (next === 'black' || next === 'dark') {
        while (beats < ph.beats && el >= tDark + (beats * ph.dark) / ph.beats) {
          beats++;
          fxSound('heartbeat', itemTier);
        }
      }
      // The light climbs with the counter's tier (never past the knight's own), and lands on the knight's.
      const reachedTier = next === 'landed' ? itemTier : next === 'count' ? Math.max(RARITIES.indexOf(shownTier), glow) : glow;
      if (reachedTier > glow) {
        glowPrev = glow;
        glow = Math.min(itemTier, reachedTier);
        glowAt = el;
        glowRef.current = glow;
      }
      const flick = !noFlash && el - glowAt < 180 && Math.floor((el - glowAt) / 45) % 2 === 1;
      const lightTier = flick ? glowPrev : glow;
      if (lightTier !== glowShown) {
        glowShown = lightTier;
        rootRef.current?.style.setProperty('--c', tierColor(lightTier));
        rootRef.current?.style.setProperty('--halo', `url(${haloUrl(tierColor(lightTier), haloN.current)})`);
        rootRef.current?.style.setProperty('--halo-wide', `url(${haloUrl(tierColor(lightTier), WIDE_HALO, 0.45, 6)})`);
      }
      if (el - glowAt >= 180 && raysTierRef.current !== glow) {
        raysTierRef.current = glow;
        const url = raysFor(glow);
        raysRefs.current.forEach((r) => {
          if (r && r.getAttribute('src') !== url) r.src = url;
        });
      }
      if (next !== cur) {
        if (next === 'appear' && !hyper) fxSound('riser', itemTier);
        if (next === 'landed') {
          if (!hyper) fxSound(SLAM_SOUND[drama], itemTier);
          timers.current.push(setTimeout(() => fxSound('stamp', itemTier), hyper ? 120 : 300));
        }
        cur = next;
        phaseRef.current = next;
        setPhase(next);
      }
      if (next === 'count' || next === 'landed') {
        const k = next === 'landed' ? 1 : (el - tCount) / ph.count;
        const eased = 1 - Math.pow(1 - k, 3);
        const v = next === 'landed' ? item.oneIn : Math.max(1, Math.round(Math.exp(Math.log(Math.max(1, item.oneIn)) * eased)));
        const text = fmtOdds(v);
        if (text !== lastText) {
          lastText = text;
          setNum(text);
        }
        let reached: Rarity = 'common';
        for (const r of ladder) if (v >= RARITY_ODDS[r]) reached = r;
        if (reached !== shownTier) {
          shownTier = reached;
          setTier(reached);
          if (next === 'count') {
            fxSound('reelTick', rarityIndex(reached));
            // HYPER RARE: a firework in each tier's color as the counter passes it.
            fx.current?.firework(RARITY_COLOR[reached]);
          }
        }
      }
      // After the landing it runs on until the light's last step has flickered and settled.
      if (next !== 'landed' || el - glowAt < 400 || raysTierRef.current !== glow) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const pend = timers.current;
    return () => {
      cancelAnimationFrame(raf);
      pend.forEach(clearTimeout);
    };
    // The reveal runs once per item (Reveal keys it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lit = phase === 'count' || phase === 'landed';
  const risen = lit || phase === 'appear';
  const landed = phase === 'landed';

  // Once lit, the knight breathes (its two idle frames), unless reduce motion is on.
  useEffect(() => {
    if (!lit || calm) return;
    const t = setInterval(() => setBob((f) => (f + 1) % 2), 420);
    return () => clearInterval(t);
  }, [lit, calm]);

  const tap = () => {
    // HYPER RARE's summoning plays out whatever.
    if (hyper && performance.now() - clock.current.t0 < HYPER_LOCK_MS) return;
    if (phaseRef.current === 'landed') onDone();
    else skip.current = true;
  };

  const def = knightDef(item.knightId);
  const color = RARITY_COLOR[item.rarity];
  const title = `${RARITY_NAME[item.rarity].toUpperCase()}!`;
  const bands = rarityBands(item.rarity);
  const banner = item.scripted === 'beginner' ? "BEGINNER'S LUCK!" : item.scripted === 'first' ? 'YOUR FIRST LEGEND!' : null;
  const url = knightUrl(item.knightId, item.mutation, { frame: bob });
  // The light's color right now (the effect steps it up the tiers straight on the DOM).
  const raysNow = raysFor(raysTierRef.current);
  const raysPx = Math.round(Math.max(250 * u, 1.15 * Math.max(vp.w, vp.h)));
  const mut = item.mutation ? MUTATION_LOOK[item.mutation] : null;
  // The knight's halo, in art pixels across (the effect re-tints it as the light steps up the tiers).
  const glowN = Math.round(Math.max(93, half * 3.4));
  haloN.current = glowN;
  const rootStyle = {
    ['--u' as string]: `${u}px`,
    ['--c' as string]: tierColor(Math.min(itemTier, GLOW_START)),
    ['--appear' as string]: `${ph.appear}ms`,
    ['--ix' as string]: pos ? `${pos.ix}px` : '50%',
    ['--iy' as string]: pos ? `${pos.iy}px` : '45%',
    ['--kw' as string]: `${KNIGHT_PIC_W * ks * u}px`,
    ['--kh' as string]: `${KNIGHT_PIC_H * ks * u}px`,
    ['--glowd' as string]: `${glowN * u}px`,
    ['--halo' as string]: `url(${haloUrl(tierColor(Math.min(itemTier, GLOW_START)), glowN)})`,
    ['--halo-wide' as string]: `url(${haloUrl(tierColor(Math.min(itemTier, GLOW_START)), WIDE_HALO, 0.45, 6)})`,
    ['--halo-wide-d' as string]: `${WIDE_HALO * u}px`,
    ['--rays' as string]: `${raysPx}px`,
  } as CSSProperties;
  return (
    <div
      ref={rootRef}
      className={s.rare}
      data-phase={phase}
      data-drama={drama}
      data-calm={calm || undefined}
      onClick={tap}
      style={rootStyle}
      role="dialog"
      aria-label={`${RARITY_NAME[item.rarity]} ${def.name}`}
    >
      <div className={s.rareBlack} />
      {!lit && !calm && !hyper && pos && <Motes n={[14, 22, 32, 40][lvl]} ms={ph.black + ph.dark + ph.appear} u={u} />}
      {phase === 'dark' && !hyper && <div className={s.rareSpark} />}
      {lit && <div className={s.rareGlow} />}
      {lit && !calm && (
        <Rays
          className={s.rays}
          url={raysNow}
          imgRef={(el) => {
            raysRefs.current[0] = el;
          }}
        />
      )}
      {lit && !calm && lvl > 0 && (
        <Rays
          className={`${s.rays} ${s.raysBack}`}
          url={raysNow}
          imgRef={(el) => {
            raysRefs.current[1] = el;
          }}
        />
      )}
      {landed && !calm && !hyper && <Confetti n={[30, 44, 60, 70][lvl]} cols={cols} />}
      {landed && !calm && !hyper && pos && <ShockRing color={mixHex(color, '#ffffff', 0.3)} size={Math.max(252, Math.ceil((Math.max(vp.w, vp.h) * 1.3) / u))} u={u} />}
      {hyper && pos && <HyperFx clock={clock} ph={ph} color={color} calm={calm} noFlash={noFlash} fxRef={fx} view={{ w: vp.w, h: vp.h, u, ix: pos.ix, iy: pos.iy, half }} />}
      {hyper && (phase === 'black' || phase === 'dark') && <HyperBands words="HYPER RARE" repeats={Math.ceil(cols / 90) + 1} />}
      <div className={s.center}>
        <div className={s.rareTitle} data-show={landed || undefined}>
          {landed && hyper && (
            <div className={s.hyperBanner}>
              <Chunky text="HYPER RARE!!" size={fitSize('HYPER RARE!!', cols, 16, 9)} grad="rainbow" />
            </div>
          )}
          {landed && banner && (
            <div className={s.scriptedBanner}>
              <Chunky text={banner} size={fitSize(banner, cols, 12, 7)} grad="gold" />
            </div>
          )}
          <div className={s.title}>
            <Chunky text={title} size={fitSize(title, cols, 18, 9)} grad={bands} />
          </div>
        </div>
        <div ref={itemRef} className={s.rareItem} data-show={risen || undefined} data-lit={lit || undefined}>
          <img className={s.knight} src={url} alt="" draggable={false} />
          {lit && <span className={s.glint} style={{ WebkitMaskImage: `url(${url})`, maskImage: `url(${url})` }} />}
          {lit && !calm && <Sparkles n={[6, 9, 12, 14][lvl]} half={half} u={u} />}
        </div>
        <span className={s.odds} data-show={lit || undefined} data-landed={landed || undefined} data-rarity={tier} style={{ ['--c' as string]: RARITY_COLOR[tier] } as CSSProperties}>
          <i>1 in</i>
          <b key={tier}>{num}</b>
        </span>
        <div className={s.card} data-show={landed || undefined}>
          <span className={s.name}>{def.name}</span>
          <span className={s.sub}>
            <b style={{ color }}>{RARITY_NAME[item.rarity]}</b> {CLASSES[def.cls].name}
          </span>
          {/* NEW, or (one you already had) EXTRA: its copy waits for Bram the Broker to sell it. */}
          <div className={s.tags}>
            {item.isNew && <span className={`${s.tag} ${s.tagNew}`}>NEW!</span>}
            {!item.isNew && <span className={`${s.tag} ${s.tagExtra}`}>EXTRA</span>}
            {mut && (
              <span className={`${s.tag} ${s.tagMut}`} style={{ ['--m' as string]: mut.color } as CSSProperties}>
                {mut.name}
              </span>
            )}
            {item.mult > 1 && <span className={`${s.tag} ${s.tagLuck}`}>LUCK ×{item.mult.toLocaleString('en-US')}</span>}
          </div>
          {hyper && <span className={s.hyperSub}>The rarest knight you've ever summoned!</span>}
          {item.scripted === 'beginner' && <span className={s.note}>A scripted roll to start you off: real ones are this rare.</span>}
        </div>
      </div>
      {phase === 'appear' && !noFlash && !hyper && <div className={s.flashLate} />}
      {lit && !noFlash && <div key={phase} className={s.flash} />}
      {!locked && <span className={`${s.tap} ${hyper ? s.tapNow : ''}`}>{landed ? 'Tap to continue' : 'Tap to skip'}</span>}
    </div>
  );
}
