/**
 * The tutorial on the screen (what it says and when: core/tutorial.ts). One short line on a slip of
 * parchment, and on the one thing it's about either the glove, bobbing at a button inside a soft gold
 * ring, or a brass arrow over a spot in the world (you, a keeper, the steps, a foe, the door; at the
 * edge of the screen, pointing the way, when it's off it), and a small "Skip tutorial" under the line.
 *
 * Every frame it works out where the player is and what they've just done (walked, attacked, cast,
 * gone through the door, levelled up) and moves its pieces along with the camera:
 *  - the pointer goes on the first side of its target where it's on the screen and clear of the HUD;
 *  - the slip goes beside the pointer, on the first side where it covers nothing (the HUD, your knight,
 *    the target), keeping the side it had while that still works, so it doesn't hop about;
 *  - on a phone, out in the hub or a fight, the slip docks in the band under the top bar instead (by
 *    the squad's cards, short of the altar): it never covers the play, the stick or the action keys.
 * It takes no taps but its own Skip, and never stops the game.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { canRebirth } from '../core/newGame';
import { canLevel, extrasCount } from '../core/roster';
import { combatTiers } from '../core/combatRoll';
import { newTutRun, skipTutorial, tutorialDid, tutorialProgress, tutorialView, TUT_STEPS, type TutAction, type TutCtx, type TutTarget, type TutView, type TutWhere } from '../core/tutorial';
import type { Game } from '../game';
import type { Controls } from '../input/input';
import { toCanvas } from '../render/art/draw';
import { HUB_CX, HUB_STEPS_Y } from '../render/art/hubScene';
import type { Renderer } from '../render/renderer';
import type { StationId } from '../world/hubWorld';
import s from './Tutorial.module.css';
import { arrowBuf, gloveBuf, PTR_TIP, ringBuf, type PtrDir } from './tutorialArt';
import { touchUi } from '../platform/portal';


export interface TutorialProps {
  game: Game;
  renderer: RefObject<Renderer | null>;
  controls: Controls;
  /** The keeper whose counter is open at the hub, if any. */
  station: StationId | null;
  /** Choosing who to play as. */
  choosing: boolean;
  /** Something else has the screen: a reveal, a sheet, a talk, the welcome back. */
  blocked: boolean;
}

// ------------------------------------------------------------------ the pictures

const DIRS: readonly PtrDir[] = ['up', 'down', 'left', 'right'];
type PtrKind = 'hand' | 'arrow';
let art: { hand: Record<PtrDir, string>; arrow: Record<PtrDir, string>; ring: string; ringHi: string } | null = null;

function tutArt() {
  art ??= {
    hand: Object.fromEntries(DIRS.map((d) => [d, toCanvas(gloveBuf(d)).toDataURL()])) as Record<PtrDir, string>,
    arrow: Object.fromEntries(DIRS.map((d) => [d, toCanvas(arrowBuf(d)).toDataURL()])) as Record<PtrDir, string>,
    ring: toCanvas(ringBuf(false)).toDataURL(),
    ringHi: toCanvas(ringBuf(true)).toDataURL(),
  };
  return art;
}

/** The line, the [bracketed] words stressed. */
function words(text: string): ReactNode[] {
  return text.split(/(\[[^\]]+\])/).map((part, i) => (part.startsWith('[') ? <b key={i}>{part.slice(1, -1)}</b> : part));
}

// ------------------------------------------------------------------ boxes

interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

const box = (l: number, t: number, w: number, h: number): Rect => ({ l, t, r: l + w, b: t + h });
const grow = (a: Rect, d: number): Rect => ({ l: a.l - d, t: a.t - d, r: a.r + d, b: a.b + d });
const area = (a: Rect) => Math.max(0, a.r - a.l) * Math.max(0, a.b - a.t);
function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  return w > 0 && h > 0 ? w * h : 0;
}
/** How much of `a` lies on any of `rs` (a pixel's touch along an edge doesn't count). */
function hits(a: Rect, rs: readonly Rect[]): number {
  const inner = grow(a, -1);
  let n = 0;
  for (const r of rs) n += overlap(inner, r);
  return n;
}
const inside = (a: Rect, b: Rect) => a.l >= b.l && a.t >= b.t && a.r <= b.r && a.b <= b.b;
const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom };
};

/** Art px between a pointer's tip and its button (it bobs two closer). */
const GAP = 3;
/** Art px the ring stands out round a button. */
const RING_OUT = 4;

// ------------------------------------------------------------------ what's where on the screen

/**
 * What a line keeps off (the one it points at, and anything round it, excepted): out in the hub or a
 * fight, the HUD's pieces; over a keeper's counter, the counter's (the HUD is still there underneath).
 */
const KEEP_CLEAR: Record<'hud' | 'ui', string> = {
  hud: [
    '.dhud .topbar > *',
    '.dhud .rebirth-pill',
    '.dhud .mini-roller',
    '.dhud .squad',
    '.dhud .quests',
    '.dhud .run-items',
    '.dhud .actions > *',
    '.dhud [data-spell-reel]',
    '.dhud .bossbar',
    '.dhud .buy-prompt',
    '.dhud .talk-prompt > *',
    '.dhud .hint',
    '.dhud .rewind-sign',
    '.toasts .toast',
    '.banner',
  ].join(', '),
  ui: ['[data-keeper] [role="tab"]', '[data-keeper] button[aria-label="Close"]', '[data-keeper] [data-purse]', '.toasts .toast'].join(', '),
};

/** The knight you play's LEVEL UP on Warden Tobb's counter (his SQUAD tab: the SELL tab's cards have buttons too). */
function levelButton(id: string | null): Element | null {
  const el = id ? document.querySelector(`[data-keeper="gate"] [data-card="${CSS.escape(id)}"] button[data-kind]`) : null;
  return el?.textContent?.includes('LEVEL UP') ? el : null;
}

/** The button a line points at. */
function uiTarget(game: Game, id: Extract<TutTarget, { kind: 'ui' }>['id']): Element | null {
  const st = game.state;
  switch (id) {
    case 'seal':
      return document.querySelector('[data-keeper="altar"] [data-seal-disc]') ?? document.querySelector('[data-keeper="altar"] [data-altar-seal]');
    case 'close':
      return document.querySelector('[data-keeper="altar"] button[aria-label="Close"]');
    case 'talk':
      return document.querySelector('.hub-hud .talk-prompt .talk-plaque');
    case 'descend':
      return document.querySelector('[data-keeper="gate"] [data-tut="descend"]');
    case 'level':
      return levelButton(st.squad[st.controlled] ?? st.squad.find(Boolean) ?? null);
    case 'squadTab':
      return document.querySelector('[data-keeper="gate"] [role="tab"]');
    // (An action key whole, its name under it too: the ring goes round both.)
    case 'attack':
      return document.querySelector('.dhud .k-attack');
    case 'reel':
      return document.querySelector('.dhud [data-spell-reel]');
    case 'camp':
      return document.querySelector('.dhud .k-camp');
    case 'auto':
      return document.querySelector('.dhud .k-auto');
    case 'floor':
      return document.querySelector('.dhud .floor-pill');
    case 'solo':
      return document.querySelector('[data-keeper="gate"] [data-tut="solo"]');
    // Tinker Pell's: the middle of his upgrade tree, the way back to it from his cards, the way to
    // his combat rolls (the tree's own COMBAT button, or his tab), and the roll.
    case 'tree':
      return document.querySelector('[data-tut="tree"]');
    case 'mapBtn':
      return document.querySelector('[data-keeper="upgrades"] [data-tut="mapBtn"]');
    case 'combatBtn':
      return document.querySelector('[data-tut="treeCombat"]') ?? [...document.querySelectorAll('[data-keeper="upgrades"] [role="tab"]')].find((el) => /combat/i.test(el.textContent ?? '')) ?? null;
    case 'combatRoll':
      return document.querySelector('[data-keeper="upgrades"] [data-tut="combatRoll"]');
  }
}

/** The scrolling box a button is in (a keeper's list of cards), if any. */
function scroller(el: Element): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return null;
}

/** A spot in the world on the screen: the tip's point (over it) and the box the thing fills. */
interface WorldSpot {
  x: number;
  y: number;
  box: Rect;
}

/** CSS px per world px. */
const scale = (r: Renderer) => r.P / Math.min(3, window.devicePixelRatio || 1);

function worldSpot(game: Game, r: Renderer, id: Extract<TutTarget, { kind: 'world' }>['id']): WorldSpot | null {
  const w = game.inDungeon ? game.world : game.hub;
  if (!w) return null;
  const k = scale(r);
  // (x, y): the feet, in world px; up: how far over them the tip goes (just over its head); half: half
  // the thing's width.
  const at = (x: number, y: number, up: number, half: number): WorldSpot => {
    const sx = (x - r.camX) * k;
    const sy = (y - r.camY) * k;
    return { x: sx, y: sy - up * k, box: { l: sx - half * k, t: sy - up * k, r: sx + half * k, b: sy + 2 * k } };
  };
  const lead = w.leader();
  switch (id) {
    case 'knight':
      return lead ? at(lead.x, lead.y, 24, 9) : null;
    case 'warden':
    case 'shrine':
    case 'tinker':
    case 'broker': {
      // (Just over his helmet, her hood or his cap: they're a head shorter than a knight.)
      const st = w.stations.find((x) => x.id === (id === 'warden' ? 'gate' : id === 'shrine' ? 'rebirth' : id === 'tinker' ? 'upgrades' : 'scrap'));
      return st ? at(st.x, st.y, id === 'shrine' ? 19 : 17, 9) : null;
    }
    case 'steps':
      return at(HUB_CX, HUB_STEPS_Y + 12, 4, 18);
    case 'foe': {
      if (!lead) return null;
      let best: (typeof w.mobs)[number] | null = null;
      let bd = Infinity;
      for (const m of w.mobs) {
        if (m.dead) continue;
        const d = Math.hypot(m.x - lead.x, m.y - lead.y) - (m.awake ? 40 : 0);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (!best) return null;
      // How tall it's drawn: the renderer measures each foe it draws (the aim brackets fit round it).
      const top = (r as unknown as { mobTop?: Map<number, number> }).mobTop?.get(best.uid) ?? Math.round(best.r * 2.4 + 9);
      return at(best.x, best.y, top + 3, best.boss ? 22 : 10);
    }
    case 'door':
      // (The doorway's threshold is 8 px under the exit; its arch rises 56 px over that.)
      return at(w.map.exit.x, w.map.exit.y + 8, 62, 26);
    case 'shop': {
      let best: { x: number; y: number } | null = null;
      let bd = Infinity;
      for (const ware of w.wares) {
        if (ware.sold) continue;
        const d = lead ? Math.hypot(ware.x - lead.x, ware.y - lead.y) : 0;
        if (d < bd) {
          bd = d;
          best = ware;
        }
      }
      // (Its table and the ware bobbing on it, about 26 px.)
      return best ? at(best.x, best.y, 28, 8) : null;
    }
  }
}

// ------------------------------------------------------------------ where the pieces go

interface Placed {
  slip: Rect;
  ptr: { box: Rect; dir: PtrDir } | null;
  /** The slip's side of the pointer (or of the ring), kept while it works. */
  side: string;
}

interface LayoutIn {
  /** The thing pointed at (a button, or the box a thing in the world fills). */
  target: Rect;
  kind: PtrKind;
  /** World: where the arrow's tip goes (over the thing, or on the screen's edge toward it). */
  tip: { x: number; y: number } | null;
  /** World, off the screen: the edge it's past (the arrow points that way). */
  edge: PtrDir | null;
  /** A button's glove: the sides to try, in order (the way it points). */
  order: readonly PtrDir[];
  /** UI px per art pixel. */
  u: number;
  sw: number;
  sh: number;
  /** What the pointer and the slip keep off: the HUD's pieces; on a touch screen in a fight, the thumb's corner. */
  clear: Rect[];
  /** What only the slip keeps off: your knight. */
  slipClear: Rect[];
  /** A phone in the hub or a fight: the slip's place in the band under the top bar. */
  dock: Rect | null;
  /** Last frame's choices, kept while they still work. */
  prevDir: PtrDir | null;
  prevSide: string | null;
}

/**
 * Where the pointer and the slip go round the target. The pointer: its tip GAP art px off the target
 * (inside the ring's band), on the first side (or the one it had) where it's on the screen and clear of
 * the HUD; none if no side is (the ring alone says which). The slip: docked, or beside the pointer on
 * the first side where it covers nothing; the least-covering one if every side covers something.
 */
function layout(o: LayoutIn): Placed {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const { u, target: t, kind, sw, sh } = o;
  const m = Math.max(4, 2 * u);
  const screen: Rect = { l: m, t: m, r: W - m, b: H - m };
  const P = 16 * u;
  const g = GAP * u;
  const cx = (t.l + t.r) / 2;
  const cy = (t.t + t.b) / 2;
  const ptrClear = o.dock ? [...o.clear, o.dock] : o.clear;
  /** The pointer's box with its tip at (x, y), and the room its bob sweeps (two art px on). */
  const ptrAt = (dir: PtrDir, x: number, y: number): Rect => {
    const [tx, ty] = PTR_TIP[kind][dir];
    return box(Math.round(x - tx * u), Math.round(y - ty * u), P, P);
  };
  const swept = (b: Rect, dir: PtrDir): Rect =>
    dir === 'down' ? { ...b, b: b.b + 2 * u } : dir === 'up' ? { ...b, t: b.t - 2 * u } : dir === 'right' ? { ...b, r: b.r + 2 * u } : { ...b, l: b.l - 2 * u };
  const fits = (b: Rect, dir: PtrDir) => inside(swept(b, dir), screen) && hits(swept(b, dir), ptrClear) === 0;
  /** A glove that would poke off the screen slides along its button (its tip still on it). */
  const onScreen = (b: Rect, dir: PtrDir): Rect => {
    const [tx, ty] = PTR_TIP[kind][dir];
    if (dir === 'down' || dir === 'up') {
      const dx = Math.max(screen.l - b.l, Math.min(0, screen.r - b.r));
      const x = b.l + tx * u + dx;
      return dx && x >= t.l + 2 * u && x <= t.r - 2 * u ? { ...b, l: b.l + dx, r: b.r + dx } : b;
    }
    const dy = Math.max(screen.t - b.t, Math.min(0, screen.b - b.b));
    const y = b.t + ty * u + dy;
    return dy && y >= t.t + 2 * u && y <= t.b - 2 * u ? { ...b, t: b.t + dy, b: b.b + dy } : b;
  };

  let ptr: Placed['ptr'] = null;
  if (o.edge && o.tip) {
    // Off the screen: on the edge the way it lies, stepping in past anything of the HUD's there.
    const dir = o.edge;
    const back = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] }[dir];
    let b = ptrAt(dir, o.tip.x, o.tip.y);
    for (let i = 1; i <= 10 && hits(b, ptrClear) > 0; i++) b = ptrAt(dir, o.tip.x + back[0] * 6 * u * i, o.tip.y + back[1] * 6 * u * i);
    ptr = { box: b, dir };
  } else {
    const cands: Array<[PtrDir, Rect]> =
      kind === 'arrow' && o.tip
        ? [
            ['down', ptrAt('down', o.tip.x, o.tip.y)],
            ['up', ptrAt('up', cx, t.b + g)],
          ]
        : o.order.map((d): [PtrDir, Rect] => [
            d,
            onScreen(d === 'down' ? ptrAt(d, cx, t.t - g) : d === 'right' ? ptrAt(d, t.l - g, cy) : d === 'left' ? ptrAt(d, t.r + g, cy) : ptrAt(d, cx, t.b + g), d),
          ]);
    const keep = cands.find(([d, b]) => d === o.prevDir && fits(b, d));
    const pick = keep ?? cands.find(([d, b]) => fits(b, d)) ?? (kind === 'arrow' ? cands[0] : null);
    if (pick) ptr = { box: pick[1], dir: pick[0] };
  }

  if (o.dock) return { slip: o.dock, ptr, side: 'dock' };

  // The slip beside the pointer (or the ring), the side facing the way it points last.
  const anchor = ptr ? ptr.box : kind === 'hand' ? grow(t, RING_OUT * u) : t;
  const ax = (anchor.l + anchor.r) / 2;
  const ay = (anchor.t + anchor.b) / 2;
  const gs = 2 * u;
  const lean = P / 4;
  const above = (x: number) => box(x, anchor.t - gs - sh, sw, sh);
  const below = (x: number) => box(x, anchor.b + gs, sw, sh);
  const toLeft = box(anchor.l - gs - sw, ay - sh / 2, sw, sh);
  const toRight = box(anchor.r + gs, ay - sh / 2, sw, sh);
  const mid = ax - sw / 2;
  const leanL = anchor.r + lean - sw;
  const leanR = anchor.l - lean;
  const sides: Array<[string, Rect]> = !ptr
    ? [
        ['a', above(mid)],
        ['aL', above(anchor.r - sw)],
        ['aR', above(anchor.l)],
        ['l', toLeft],
        ['r', toRight],
        ['b', below(mid)],
      ]
    : ptr.dir === 'down'
      ? [
          ['a', above(mid)],
          ['aL', above(leanL)],
          ['aR', above(leanR)],
          ['l', toLeft],
          ['r', toRight],
        ]
      : ptr.dir === 'up'
        ? [
            ['b', below(mid)],
            ['bL', below(leanL)],
            ['bR', below(leanR)],
            ['l', toLeft],
            ['r', toRight],
          ]
        : ptr.dir === 'right'
          ? [
              ['l', toLeft],
              ['a', above(anchor.r - sw)],
              ['b', below(anchor.r - sw)],
            ]
          : [
              ['r', toRight],
              ['a', above(anchor.l)],
              ['b', below(anchor.l)],
            ];
  // What the slip keeps off: the HUD, your knight, the target (and its ring), the pointer's sweep.
  const keepOff = [...o.clear, ...o.slipClear, kind === 'hand' ? grow(t, RING_OUT * u) : t, ...(ptr ? [swept(ptr.box, ptr.dir)] : [])];
  const clamp = (a: Rect): Rect => {
    const dx = Math.max(screen.l - a.l, Math.min(0, screen.r - a.r));
    const dy = Math.max(screen.t - a.t, Math.min(0, screen.b - a.b));
    return { l: a.l + dx, t: a.t + dy, r: a.r + dx, b: a.b + dy };
  };
  const scored = sides.map(([side, a]) => {
    const c = clamp(a);
    // (Pushed far from where it was meant to be, it's no longer beside the pointer.)
    const pushed = Math.abs(c.l - a.l) + Math.abs(c.t - a.t);
    return { side, slip: c, cost: hits(c, keepOff) + (pushed > P ? 1e6 : 0) };
  });
  const kept = scored.find((x) => x.side === o.prevSide && x.cost === 0);
  const best = kept ?? scored.find((x) => x.cost === 0) ?? scored.reduce((a, b) => (b.cost < a.cost ? b : a));
  return { slip: best.slip, ptr, side: best.side };
}

// ------------------------------------------------------------------ the tutorial

/** Seconds of holding attack with a foe close that count as having attacked. */
const ATTACK_HOLD = 0.6;

export function Tutorial(props: TutorialProps) {
  const { game } = props;
  const live = useRef(props);
  live.current = props;
  const [view, setView] = useState<TutView | null>(null);
  const [zone, setZone] = useState<'hud' | 'ui'>('ui');
  const slipRef = useRef<HTMLDivElement>(null);
  const ptrRef = useRef<HTMLDivElement>(null);
  const picRef = useRef<HTMLImageElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const run = useRef(newTutRun());

  useEffect(() => {
    let raf = 0;
    let shownKey: string | null = null;
    let shownZone: 'hud' | 'ui' = 'ui';
    let state = game.state;
    /** Steps and tips done as last seen (-1: skipped). */
    let tutSig = -1;
    let last = performance.now();
    // What the last frames saw, to tell what the player just did.
    const mem = {
      kills: -1,
      /** Each knight's level as last seen (a new knight isn't a level up). */
      levels: null as Map<string, number> | null,
      floor: -1,
      inDungeon: false,
      cast: -1,
      castUid: -1,
      castAt: -Infinity,
      attackT: 0,
      floorAt: -10,
      auto: game.state.settings.autoPlay,
      doorIn: false,
      /** Tiers bought off the tinker's tree, and tiers his combat reel has rolled, as last seen. */
      upgrades: -1,
      combatRolls: -1,
    };
    // The pieces' last places, kept while they still work (and which line they were for).
    const prev = {
      key: null as string | null,
      dir: null as PtrDir | null,
      side: null as string | null,
      scrolled: false,
      /** The list the target's in (its part in view is what's pointed at). */
      list: null as Element | null,
      // (The slip and the pointer are new elements for a new line: what was set on the old ones goes.)
      slipEl: null as HTMLElement | null,
      picEl: null as HTMLImageElement | null,
      src: '',
      maxW: '',
      /** What the slip's width was last fitted for (its words, its room, the screen). */
      fit: '',
    };
    // The HUD's pieces, looked up a few times a second (they hardly move).
    let clearAt = -1;
    let clearZone: 'hud' | 'ui' = 'ui';
    let clearList: Array<{ el: Element; r: Rect }> = [];
    const domClear = (now: number, z: 'hud' | 'ui') => {
      if (now - clearAt > 0.12 || z !== clearZone) {
        clearAt = now;
        clearZone = z;
        clearList = [];
        for (const el of Array.from(document.querySelectorAll(KEEP_CLEAR[z]))) {
          const r = rectOf(el);
          if (area(r) > 0) clearList.push({ el, r });
        }
      }
      return clearList;
    };
    // (The dev bot plays by itself: it neither sees the tutorial nor moves it on.)
    const did = (a: TutAction) => !game.bot && tutorialDid(game.state.seen.tutorial, run.current, a);
    const off = game.on((e) => {
      if (e.type === 'floorStart') mem.floorAt = performance.now() / 1000;
      // (Taking a ware without paying is having been to the shop too.)
      if (e.type === 'bought' || e.type === 'stolen') did('bought');
    });

    const hideAll = () => {
      const layer = layerRef.current;
      if (layer && layer.style.visibility !== 'hidden') layer.style.visibility = 'hidden';
      undock();
    };
    const undock = () => {
      const layer = layerRef.current;
      if (layer?.dataset.tutDock) delete layer.dataset.tutDock;
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const nowMs = performance.now();
      const now = nowMs / 1000;
      const dt = Math.min(0.1, (nowMs - last) / 1000);
      last = nowMs;
      const p = live.current;
      const st = game.state;
      const t = st.seen.tutorial;
      // A new game, or the tutorial played again from Settings (from the top, or after a skip): what
      // the player did before doesn't count.
      const sig = t.skipped ? -1 : t.done.length + t.tips.length;
      if (st !== state || (sig >= 0 && (tutSig < 0 || sig < tutSig))) {
        state = st;
        run.current = newTutRun();
        mem.kills = -1;
        mem.upgrades = -1;
        mem.combatRolls = -1;
        mem.levels = null;
        mem.attackT = 0;
        mem.castAt = -Infinity;
      }
      tutSig = sig;

      // Where the player is.
      const w = game.inDungeon ? game.world : game.hub;
      let where: TutWhere;
      if (p.blocked || game.fade > 0.25) where = 'busy';
      else if (game.inDungeon) where = !game.world || now - mem.floorAt < 2.2 || game.world.livingHeroes().length === 0 ? 'busy' : 'dungeon';
      else if (p.station) where = p.station === 'altar' ? 'altar' : p.station === 'gate' ? 'warden' : p.station === 'upgrades' ? 'tinker' : 'keeper';
      else if (p.choosing) where = 'select';
      else where = 'hub';
      const lead = w?.leader() ?? null;
      const me = game.inDungeon && game.world ? (game.world.heroes.find((h) => h.slot === game.world!.controlled && !h.downed) ?? null) : null;
      const r = p.renderer.current;
      const playing = st.squad[st.controlled] ?? st.squad.find(Boolean) ?? null;

      // What the player just did.
      if (mem.kills >= 0 && st.records.kills > mem.kills && game.inDungeon) did('killed');
      mem.kills = st.records.kills;
      let up = false;
      const levels = (mem.levels ??= new Map());
      for (const rec of Object.values(st.roster)) {
        const was = levels.get(rec.id);
        if (was !== undefined && rec.level > was) up = true;
        if (was !== rec.level) levels.set(rec.id, rec.level);
      }
      if (up && !game.inDungeon) did('leveled');
      // An upgrade off the tinker's tree, a roll at his combat reel.
      const rolled = combatTiers(st);
      const bought = Object.values(st.upgrades).reduce((a, b) => a + b, 0) - rolled;
      if (mem.upgrades >= 0 && bought > mem.upgrades) did('upgraded');
      if (mem.combatRolls >= 0 && rolled > mem.combatRolls) did('combatRolled');
      mem.upgrades = bought;
      mem.combatRolls = rolled;
      if (game.inDungeon && mem.inDungeon && st.run.floor > mem.floor) did('exited');
      mem.inDungeon = game.inDungeon;
      mem.floor = st.run.floor;
      if (me?.lastSkill) {
        if (me.uid === mem.castUid && me.lastSkill.n !== mem.cast) mem.castAt = now;
        mem.cast = me.lastSkill.n;
        mem.castUid = me.uid;
      }
      if (st.settings.autoPlay && !mem.auto) did('autoOn');
      mem.auto = st.settings.autoPlay;
      if (p.station === 'scrap') did('broker');

      // The fight round your knight.
      let foeNear = false;
      if (where === 'dungeon' && lead && game.world) {
        for (const m of game.world.mobs) {
          if (!m.dead && m.awake && Math.hypot(m.x - lead.x, m.y - lead.y) < 120) {
            foeNear = true;
            break;
          }
        }
        if (foeNear && p.controls.attack) {
          mem.attackT += dt;
          if (mem.attackT >= ATTACK_HOLD) did('attacked');
        }
      }
      let doorInView = false;
      let shopInView = false;
      if (where === 'dungeon' && game.world && r) {
        const k = scale(r);
        const inView = (x: number, y: number, pad: number) => {
          const sx = (x - r.camX) * k;
          const sy = (y - r.camY) * k;
          return sx > -pad && sy > -pad && sx < window.innerWidth + pad && sy < window.innerHeight + pad;
        };
        // (A little give either way, so the line doesn't flicker as the door slides across the edge.)
        const ex = game.world.map.exit;
        doorInView = inView(ex.x, ex.y - 20, mem.doorIn ? 10 : -30);
        mem.doorIn = doorInView;
        shopInView = game.world.wares.some((x) => !x.sold && inView(x.x, x.y, -40));
      }

      const ctx: TutCtx = {
        where,
        touch: touchUi(),
        hasKnight: !!playing,
        sealed: !!st.roll.sealed,
        nearWarden: !game.inDungeon && game.hub?.nearStation()?.id === 'gate',
        canLevel: !!playing && canLevel(st, playing),
        levelShown: where === 'warden' && !!levelButton(playing),
        foeNear,
        rolling: !!me?.skillRoll,
        castAgo: now - mem.castAt,
        exitOpen: !!game.world?.portalOpen,
        doorInView,
        floor: st.run.floor,
        shopInView,
        canRebirth: st.rebirths === 0 && canRebirth(st),
        soloShown: where === 'warden' && !!document.querySelector('[data-keeper="gate"] [data-tut="solo"]'),
        autoOn: st.settings.autoPlay,
        extras: extrasCount(st),
        nearTinker: !game.inDungeon && game.hub?.nearStation()?.id === 'upgrades',
        treeShown: where === 'tinker' && !!document.querySelector('[data-tut="tree"]'),
        combatShown: where === 'tinker' && !!document.querySelector('[data-keeper="upgrades"] [data-tut="combatRoll"]'),
      };
      const v = game.bot ? null : tutorialView(t, run.current, ctx, now);
      const key = v?.key ?? null;
      const z = where === 'hub' || where === 'dungeon' ? 'hud' : 'ui';
      if (key !== shownKey) {
        shownKey = key;
        setView(v);
      }
      if (z !== shownZone) {
        shownZone = z;
        setZone(z);
      }
      if (v) place(v, z, r, now);
      else {
        prev.key = null;
        undock();
      }
    };

    /** Puts the slip, the pointer and the ring where they go this frame. */
    const place = (v: TutView, z: 'hud' | 'ui', r: Renderer | null, now: number) => {
      const slip = slipRef.current;
      const ptr = ptrRef.current;
      const pic = picRef.current;
      const layer = layerRef.current;
      // (React hasn't put this line's pieces up yet: next frame.)
      if (!slip || !ptr || !pic || !layer || slip.dataset.text !== v.text) return hideAll();
      if (prev.key !== v.key) {
        prev.key = v.key;
        prev.dir = null;
        prev.side = null;
        prev.scrolled = false;
      }
      if (prev.slipEl !== slip) {
        prev.slipEl = slip;
        prev.maxW = '';
        prev.fit = '';
      }
      if (prev.picEl !== pic) {
        prev.picEl = pic;
        prev.src = '';
      }
      const ring = ringRef.current;
      const root = document.documentElement.style;
      const u = parseFloat(root.getPropertyValue(z === 'hud' ? '--hud-px' : '--px')) || 3;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      const snap = (x: number) => Math.round(x * dpr) / dpr;
      const kind: PtrKind = v.target.kind === 'world' ? 'arrow' : 'hand';
      let target: Rect;
      let tip: { x: number; y: number } | null = null;
      let edge: PtrDir | null = null;
      let el: Element | null = null;
      if (v.target.kind === 'ui') {
        el = uiTarget(game, v.target.id);
        if (!el) return hideAll();
        // A button down a keeper's list: brought into view, once (to the middle: on a short phone
        // the list may show less than the whole button, and its words are in its middle).
        if (!prev.scrolled) {
          prev.scrolled = true;
          prev.list = scroller(el);
          if (prev.list && !inside(rectOf(el), rectOf(prev.list))) el.scrollIntoView({ block: 'center', behavior: game.state.settings.reduceMotion ? 'auto' : 'smooth' });
        }
        // What's pointed at is the part of it the list shows.
        target = rectOf(el);
        if (prev.list?.contains(el)) {
          const c = rectOf(prev.list);
          target = { l: Math.max(target.l, c.l), t: Math.max(target.t, c.t), r: Math.min(target.r, c.r), b: Math.min(target.b, c.b) };
        }
        if (target.r - target.l < 4 || target.b - target.t < 4 || !onTop(el, target, layer)) return hideAll();
      } else {
        const spot = r ? worldSpot(game, r, v.target.id) : null;
        if (!spot) return hideAll();
        target = spot.box;
        tip = { x: spot.x, y: spot.y };
        const mg = 6 + 16 * u;
        if (spot.x < mg || spot.y < mg || spot.x > W - mg || spot.y > H - mg) {
          // Off the screen: on the edge the way it lies, pointing at it.
          const cx = W / 2;
          const cy = H / 2;
          const dx = spot.x - cx;
          const dy = spot.y - cy;
          const k = Math.min(Math.abs(dx) > 1e-3 ? (cx - mg) / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-3 ? (cy - mg) / Math.abs(dy) : Infinity, 1);
          edge = Math.abs(dx) / cx > Math.abs(dy) / cy ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
          const [tx, ty] = PTR_TIP.arrow[edge];
          tip = { x: Math.max(tx * u + 4, Math.min(W - (16 - tx) * u - 4, cx + dx * k)), y: Math.max(ty * u + 4, Math.min(H - (16 - ty) * u - 4, cy + dy * k)) };
          target = { l: tip.x, t: tip.y, r: tip.x, b: tip.y };
        }
      }
      if (layer.style.visibility !== 'visible') layer.style.visibility = 'visible';

      // What to keep off: the HUD (bar the target and what holds it), and your knight out in the world.
      const clear: Rect[] = [];
      for (const c of domClear(now, z)) if (!el || (c.el !== el && !c.el.contains(el) && !el.contains(c.el))) clear.push(c.r);
      // Nothing goes in the corner the thumb steers from, on a touch screen in a fight (the stick comes
      // up wherever the left of the screen is touched; most often down there).
      if (touchUi() && game.inDungeon) clear.push({ l: 0, t: H * 0.5, r: W * 0.52, b: H });
      // The slip never covers your knight out in the world (the pointer may: an arrow over a foe at
      // your side).
      const slipClear: Rect[] = [];
      const lead = (game.inDungeon ? game.world : game.hub)?.leader();
      if (z === 'hud' && r && lead) {
        const k = scale(r);
        const kx = (lead.x - r.camX) * k;
        const ky = (lead.y - r.camY) * k;
        slipClear.push({ l: kx - 14 * k, t: ky - 30 * k, r: kx + 14 * k, b: ky + 6 * k });
      }

      // A phone out in the hub or a fight: the slip docks under the top bar.
      const phone = Math.min(W, H) < 600;
      let dock: Rect | null = null;
      if (phone && z === 'hud') {
        const d = dockArea(clear, u, W);
        const maxW = `${Math.floor(d.r - d.l)}px`;
        if (prev.maxW !== maxW) {
          prev.maxW = maxW;
          slip.style.maxWidth = maxW;
        }
        dock = box(d.l, d.t, slip.offsetWidth, slip.offsetHeight);
        layer.dataset.tutDock = game.inDungeon ? 'fight' : 'hub';
        root.setProperty('--tut-dock-b', `${Math.round(dock.b)}px`);
      } else {
        if (prev.maxW) {
          prev.maxW = '';
          slip.style.maxWidth = '';
        }
        undock();
      }

      // (The altar's close button: the glove on its left, the line along the tabs, where there's room.)
      const order: readonly PtrDir[] = v.target.kind === 'ui' && v.target.id === 'close' ? ['right', 'down', 'left', 'up'] : ['down', 'right', 'left', 'up'];
      // A line that wraps (onto two even lines: text-wrap balance) is only as wide as its longer line.
      const fit = `${prev.maxW}|${W}x${H}|${u}`;
      if (prev.fit !== fit) {
        prev.fit = fit;
        shrinkWrap(slip);
        if (dock) dock = box(dock.l, dock.t, slip.offsetWidth, slip.offsetHeight);
      }
      const lay = layout({ target, kind, tip, edge, order, u, sw: slip.offsetWidth, sh: slip.offsetHeight, clear, slipClear, dock, prevDir: prev.dir, prevSide: prev.side });
      prev.dir = lay.ptr?.dir ?? null;
      prev.side = lay.side;
      slip.style.transform = `translate(${snap(lay.slip.l)}px, ${snap(lay.slip.t)}px)`;
      if (lay.ptr) {
        ptr.style.transform = `translate(${snap(lay.ptr.box.l)}px, ${snap(lay.ptr.box.t)}px)`;
        if (ptr.dataset.dir !== lay.ptr.dir) ptr.dataset.dir = lay.ptr.dir;
        const src = tutArt()[kind][lay.ptr.dir];
        if (prev.src !== src) {
          prev.src = src;
          pic.src = src;
        }
        if (ptr.style.display) ptr.style.display = '';
      } else if (ptr.style.display !== 'none') ptr.style.display = 'none';
      if (ring) {
        const e = RING_OUT * u;
        ring.style.transform = `translate(${snap(target.l - e)}px, ${snap(target.t - e)}px)`;
        ring.style.width = `${snap(target.r - target.l + 2 * e)}px`;
        ring.style.height = `${snap(target.b - target.t + 2 * e)}px`;
      }
    };

    // (Started after the game's own loop, so each frame it moves with the camera the game just drew.)
    const start = window.setTimeout(() => (raf = requestAnimationFrame(frame)), 0);
    return () => {
      window.clearTimeout(start);
      cancelAnimationFrame(raf);
      off();
      undock();
    };
  }, [game]);

  if (!view) return null;
  const a = tutArt();
  const world = view.target.kind === 'world';
  const prog = tutorialProgress(game.state.seen.tutorial);
  // Auto battle is the one to learn: its line and its ring stand out more.
  const big = view.key === 'auto:ask';
  const skip = () => {
    skipTutorial(game.state.seen.tutorial);
    game.save();
    game.emit({ type: 'toast', text: 'Tutorial skipped. Replay it in Settings.', tone: 'info' });
    setView(null);
  };
  return (
    <div
      ref={layerRef}
      className={s.layer}
      data-zone={zone}
      data-calm={game.state.settings.reduceMotion || undefined}
      style={{ visibility: 'hidden', ['--ring' as string]: `url(${a.ring})`, ['--ring-hi' as string]: `url(${a.ringHi})` } as CSSProperties}
    >
      {!world && <div ref={ringRef} key={`ring:${view.key}`} className={s.ring} data-big={big || undefined} />}
      <div ref={ptrRef} key={`ptr:${view.key}`} className={s.ptr} data-dir="down">
        <div className={s.pop}>
          <img ref={picRef} className={s.pic} alt="" draggable={false} />
        </div>
      </div>
      {/* (Keyed by its words: a line that only moves its pointer, walking up to the warden and then on his button, stays put.) */}
      <div ref={slipRef} key={`slip:${view.text}`} className={s.slip} data-text={view.text} data-tut-slip data-tip={view.tip || undefined} data-big={big || undefined}>
        <div className={s.paper}>
          <p className={s.text} role="status" aria-live="polite">
            {words(view.text)}
          </p>
          <div className={s.foot}>
            {/* How far along the walk-through is: a pip a step, the one you're on lit (a tip has none). */}
            {!view.tip && (
              <span className={s.pips} aria-label={`Step ${Math.min(prog.done + 1, prog.of)} of ${prog.of}`}>
                {TUT_STEPS.map((id, i) => (
                  <i key={id} data-done={i < prog.done || undefined} data-now={i === prog.done || undefined} />
                ))}
              </span>
            )}
            <button className={s.skip} onClick={skip}>
              Skip tutorial
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The boxes of a paragraph's words, and how many lines they make. */
function lines(p: Element): { rects: DOMRect[]; n: number } {
  const range = document.createRange();
  range.selectNodeContents(p);
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
  return { rects, n: new Set(rects.map((r) => Math.round(r.bottom))).size };
}

/**
 * Narrows a slip whose line wraps to its longest line (the box would stay as wide as it could be),
 * a few pixels at a time until the words keep the lines they had (glyph widths round).
 */
function shrinkWrap(slip: HTMLElement): void {
  slip.style.width = '';
  const p = slip.querySelector('p');
  const skip = slip.querySelector('button');
  if (!p || !skip) return;
  const { rects, n } = lines(p);
  if (n < 2) return;
  const text = Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left));
  const pad = slip.offsetWidth - p.clientWidth;
  for (const extra of [2, 6, 10, 16]) {
    slip.style.width = `${Math.ceil(Math.max(text, skip.offsetWidth) + pad + extra)}px`;
    if (lines(p).n <= n) return;
  }
  slip.style.width = '';
}

/** Seen on top: nothing else (but the game itself, or the tutorial) over the middle of it. */
function onTop(el: Element, r: Rect, layer: Element): boolean {
  const x = (r.l + r.r) / 2;
  const y = (r.t + r.b) / 2;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  const hit = document.elementFromPoint(x, y);
  return !hit || hit === el || el.contains(hit) || hit.contains(el) || layer.contains(hit) || (hit as HTMLElement).dataset?.play === '1';
}

/**
 * A phone's dock: the band under the top bar (under the boss's bar when there's one), from the squad's
 * cards (or the screen's edge) to the little altar. Too narrow there, it goes under the squad instead.
 */
function dockArea(clear: readonly Rect[], u: number, W: number): Rect {
  const q = (sel: string) => {
    const el = document.querySelector(sel);
    const r = el ? rectOf(el) : null;
    return r && area(r) > 0 ? r : null;
  };
  const m = 3 * u;
  let top = m;
  for (const el of Array.from(document.querySelectorAll('.dhud .topbar > *, .dhud .rebirth-pill, .dhud .bossbar'))) {
    const r = rectOf(el);
    if (area(r) > 0) top = Math.max(top, r.b + 2 * u);
  }
  const left = q('.dhud .hud-left.top');
  const altar = q('.dhud .mini-roller');
  let l = left && left.t < top + 24 * u ? left.r + 2 * u : m;
  const r = altar && altar.t < top + 24 * u ? altar.l - 2 * u : W - m;
  if (r - l < 60 * u && left) {
    // No room beside the squad: under it, across to the altar.
    l = m;
    top = Math.max(top, left.b + 2 * u);
  }
  // (Anything else of the HUD's in the band, the slip goes under: the clear list has it.)
  for (const c of clear) if (c.l < r && c.r > l && c.t <= top && c.b > top && c.b - top < 30 * u) top = c.b + 2 * u;
  return { l, t: top, r, b: top };
}
