/**
 * One set of sizes for every screen. Everything on screen is measured in art pixels, and this file
 * decides how big an art pixel is (in CSS px) from the window alone, by the same rules everywhere:
 *
 *   - The UI's pixel (--px) is the biggest that still leaves the UI the room it was laid out in: at
 *     least ART_ACROSS art px across and ART_DOWN down. A phone needs about 130 x 210 (its screens
 *     are one column); a desktop or tablet's screens need about 180 x 290. In between (a small
 *     tablet, a tall narrow desktop window, the Claude app's side panel) the two blend smoothly by the
 *     window's short side, so a pixel more or less never jumps the whole UI a size.
 *   - Across, the room is a hard floor (a layout that gets less than it was made for squeezes and
 *     wraps); down, a hair under is let go, so a common screen keeps its round size.
 *   - It comes in whole device pixels on a sharp screen (DPR 2 and up) and half CSS pixels otherwise.
 *   - The HUD's pixel (--hud-px) is the UI's on a desktop or tablet; on a phone held upright it is
 *     smaller (the middle of the screen is where you play), blending back to the UI's as the screen
 *     grows. On a short landscape screen it never leaves fewer than HUD_ROWS art px down.
 *   - The corner altar keeps one art pixel (--mini-u, a share over the HUD's) whatever its reel
 *     count: more reels make it bigger, not finer, until it fills its corner (miniBoxW/H); a short
 *     wide corner takes its reels in one row where two would leave the knights small (miniPick).
 *   - The screen's room in art px is also given as words on <html> (data-aw across and data-ah down
 *     at the UI's pixel, data-hw across at the HUD's, data-upright), and the CSS steps its layouts
 *     on those, never on CSS widths or heights (a 600 px wide window holds very different amounts
 *     of art at 3 and at 4 px a pixel). Turned on its side is data-upright, not an aspect query.
 *
 * Pure (no DOM) apart from applyLayout, so the rules are tested over a table of real screens.
 */

/** The UI's pixel, CSS px: never smaller (words stop being readable) nor bigger (a 4K TV). */
export const PX_MIN = 2;
export const PX_MAX = 6;
/** The room the UI's screens are laid out in (art px): a phone's (one column) and a desktop's. */
export const ART_ACROSS = { phone: 130, desk: 180 } as const;
export const ART_DOWN = { phone: 210, desk: 290 } as const;
/** The short side (CSS px) where a screen stops being a phone, and where it's a desktop or tablet. */
export const PHONE_SHORT = 480;
export const DESK_SHORT = 720;
/** How far under ART_DOWN a pixel size may leave the screen (a share of one pixel step). */
const DOWN_SLACK = 0.15;
/** Art pixels down a short landscape screen that the HUD's pixel leaves room for. */
export const HUD_ROWS = 220;
/** The HUD's pixel against the UI's on a phone held upright (on a short one, a little less). */
const HUD_UPRIGHT = 0.7;
const HUD_UPRIGHT_SHORT = 0.62;
/** The smallest any word is drawn (CSS px). */
export const FONT_MIN = 11;
/** The corner altar's pixel against the HUD's. */
const MINI_OVER_HUD = 1.35;
/** The spell reel's height over the action keys (HUD art px): the big one (a mouse with room), the small one. */
export const SPELL_REEL = { big: { n: 46, h: 75 }, small: { n: 30, h: 47 } } as const;
/** The action keys' block (HUD art px, with their names under them), and the HUD's rows the big spell reel needs. */
const KEYS_H = 92;
const BIG_REEL_ROWS = 260;
/** The art pixels down the right side the corner altar must leave free on a wide screen: the top bar
 * over it, and the spell reel and the keys under it. */
const miniReserve = (big: boolean) => 30 + KEYS_H + (big ? SPELL_REEL.big.h : SPELL_REEL.small.h) + 6;
/** The squad's column on the left of a phone held upright (its cards, margins and a gap), HUD art px. */
const SQUAD_COL = 66;

/**
 * Room words, from the art px across at the UI's pixel: n, one column (a phone held upright, a narrow
 * panel); m, a little more (a tall narrow window); w, two columns' worth (a tablet); x, wide (a
 * desktop, anything on its side).
 */
export type RoomAcross = 'n' | 'm' | 'w' | 'x';
/** Art px down: s, short (a phone in the Claude app, anything on its side); m; t, tall. */
export type RoomDown = 's' | 'm' | 't';
/** The HUD's art px across (its own pixel): n, a phone held upright; m; w, room for everything on one line. */
export type HudAcross = 'n' | 'm' | 'w';
/** Where the room words step (art px). */
export const ACROSS_STEPS = { m: 170, w: 200, x: 260 } as const;
export const DOWN_STEPS = { m: 240, t: 280 } as const;
export const HUD_STEPS = { m: 260, w: 420 } as const;

export interface Layout {
  /** The window (CSS px) and its device pixel ratio. */
  vw: number;
  vh: number;
  dpr: number;
  /** Taller than wide. */
  upright: boolean;
  /** 0 on a phone, 1 on a desktop or tablet, in between by the short side. */
  big: number;
  /** The UI's art pixel and its words' pixel (CSS px). */
  px: number;
  fpx: number;
  /** The HUD's (the hub's and a fight's) art pixel and its words' pixel. */
  hudPx: number;
  hudFpx: number;
  /** The spell reel over the action keys: the big one (a mouse, with the rows for it) or the small one. */
  bigReel: boolean;
  /** The corner altar's art pixel, and the most room it may take (CSS px). */
  miniU: number;
  miniBoxW: number;
  miniBoxH: number;
  /** The room at the UI's pixel (art px), and its words. */
  artW: number;
  artH: number;
  across: RoomAcross;
  down: RoomDown;
  hudAcross: HudAcross;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Steps per CSS px a size snaps to: whole device pixels on a sharp screen, else half pixels. */
function steps(dpr: number): number {
  return dpr >= 2 ? Math.round(dpr) : 2;
}

/** `v` down to the step (`slack`: a share of a step it may be rounded up by). */
export function snap(v: number, dpr: number, slack = 0): number {
  const k = steps(dpr);
  return Math.floor(v * k + 1e-6 + slack) / k;
}

/** How far a screen is from a phone (0) to a desktop or tablet (1), by its short side, smoothly. */
export function bigness(vw: number, vh: number): number {
  const t = clamp((Math.min(vw, vh) - PHONE_SHORT) / (DESK_SHORT - PHONE_SHORT), 0, 1);
  return t * t * (3 - 2 * t);
}

/** The words' own pixel: on the smallest UI the words come up over the art, so they stay readable. */
export function fontPx(px: number): number {
  return Math.max(px, 2.5);
}

export function computeLayout(vw: number, vh: number, dpr = 1, touch = false): Layout {
  vw = Math.max(1, vw);
  vh = Math.max(1, vh);
  const upright = vh > vw;
  const big = bigness(vw, vh);
  const across = lerp(ART_ACROSS.phone, ART_ACROSS.desk, big);
  const down = lerp(ART_DOWN.phone, ART_DOWN.desk, big);
  const px = clamp(Math.min(snap(vw / across, dpr), snap(vh / down, dpr, DOWN_SLACK)), PX_MIN, PX_MAX);

  // The HUD: smaller on a phone held upright (blending back to the UI's as the screen grows), and on
  // a short landscape screen never more than leaves HUD_ROWS art px down.
  const k = upright ? lerp(vh < 680 ? HUD_UPRIGHT_SHORT : HUD_UPRIGHT, 1, big) : 1;
  const hudPx = Math.max(1.5, Math.min(snap(px * k, dpr, 0.5), upright ? Infinity : Math.max(snap(vh / HUD_ROWS, dpr), 1.5)));
  const hudFpx = upright && big < 1 ? Math.max(hudPx, snap(lerp(px * 0.82, px, big), dpr, 0.5)) : fontPx(hudPx);

  // The corner altar: a share over the HUD's pixel; its corner is the right of the squad's column on
  // a phone held upright (and a fifth of the height), elsewhere a bit over a third of the width and
  // what the right side leaves between the top bar and the spell reel and keys under it.
  const miniU = Math.max(1, snap(hudPx * MINI_OVER_HUD, dpr, 0.5));
  const right = 6 * hudPx;
  const miniBoxW = upright ? Math.max(34 * miniU * 0.6, Math.min(vw - SQUAD_COL * hudPx - right, vw * 0.55)) : vw * 0.36;
  // The spell reel: the big one with a mouse where the HUD has the rows for it, else the small one.
  const bigReel = !touch && vh / hudPx >= BIG_REEL_ROWS;
  const miniBoxH = upright ? vh * 0.2 : Math.max(49, vh - miniReserve(bigReel) * hudPx);

  const artW = vw / px;
  const artH = vh / px;
  return {
    vw,
    vh,
    dpr,
    upright,
    big,
    px,
    fpx: fontPx(px),
    hudPx,
    hudFpx,
    bigReel,
    miniU,
    miniBoxW,
    miniBoxH,
    artW,
    artH,
    across: artW < ACROSS_STEPS.m ? 'n' : artW < ACROSS_STEPS.w ? 'm' : artW < ACROSS_STEPS.x ? 'w' : 'x',
    down: artH < DOWN_STEPS.m ? 's' : artH < DOWN_STEPS.t ? 'm' : 't',
    hudAcross: vw / hudPx < HUD_STEPS.m ? 'n' : vw / hudPx < HUD_STEPS.w ? 'm' : 'w',
  };
}

/**
 * The corner altar's art pixel for a shrine `w` x `h` art px: the layout's own, or less only where
 * that would overfill its corner (then whole device pixels, never under one CSS px).
 */
export function miniFit(l: Pick<Layout, 'miniU' | 'miniBoxW' | 'miniBoxH' | 'dpr'>, w: number, h: number): number {
  const u = Math.min(l.miniU, l.miniBoxW / w, l.miniBoxH / h);
  return u >= l.miniU ? l.miniU : Math.max(1, snap(u, l.dpr));
}

/**
 * Of a few ways to lay the corner altar out (`sizes`, art px, the first the usual), the one whose
 * knights come out biggest (the first on a tie), and its art pixel.
 */
export function miniPick(l: Pick<Layout, 'miniU' | 'miniBoxW' | 'miniBoxH' | 'dpr'>, sizes: ReadonlyArray<readonly [number, number]>): { pick: number; u: number } {
  let best = { pick: 0, u: miniFit(l, sizes[0][0], sizes[0][1]) };
  sizes.forEach(([w, h], i) => {
    const u = miniFit(l, w, h);
    if (u > best.u) best = { pick: i, u };
  });
  return best;
}

/** The world's zoom: art px on the screen's short side (a phone comes in closer). */
export function worldShortSide(vw: number, vh: number, phone: number, desk: number): number {
  return lerp(phone, desk, bigness(vw, vh));
}

let current: Layout | null = null;

/** The layout now (the window's): worked out again whenever the window has changed since. */
export function layoutNow(): Layout {
  if (typeof window === 'undefined') return (current ??= readLayout());
  if (!current || current.vw !== window.innerWidth || current.vh !== window.innerHeight || current.dpr !== (window.devicePixelRatio || 1)) current = readLayout();
  return current;
}

function readLayout(): Layout {
  if (typeof window === 'undefined') return computeLayout(390, 844, 3, true);
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return computeLayout(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, touch);
}

/** Works out the layout from the window and sets it on <html>: the CSS variables and the room words. */
export function applyLayout(): Layout {
  const l = (current = readLayout());
  const root = document.documentElement;
  const set = (k: string, v: number) => root.style.setProperty(k, `${v}px`);
  set('--px', l.px);
  set('--fpx', l.fpx);
  set('--fmin', FONT_MIN);
  // (The reveal and reel effects measure in --u: the same art pixel.)
  set('--u', l.px);
  set('--hud-px', l.hudPx);
  set('--hud-fpx', l.hudFpx);
  set('--mini-u', l.miniU);
  root.dataset.aw = l.across;
  root.dataset.ah = l.down;
  root.dataset.hw = l.hudAcross;
  root.dataset.upright = l.upright ? '1' : '0';
  return l;
}
