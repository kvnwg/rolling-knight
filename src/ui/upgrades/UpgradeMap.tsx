/**
 * An upgrade tab as a map: Dumpster Legend's upgrade map, a full-screen honeycomb that grows out of
 * the tab's root (Luck I for the Luck tab, Whetstone I for Combat); the tinker's counter opens it from
 * either tab (src/ui/keeper/TinkerShop.tsx). Every tier of every upgrade line on the tab is one hex. Owned hexes are bright, the next buyable ones show their
 * price, the ones just past those show "?", and everything further out stays hidden until you get
 * close. Gold hexes are one-off specials (and the Extra Reel line). Drag to pan, pinch or scroll to
 * zoom, tap a hex for its details (tap it again for the whole line: UpgradePopup.tsx), and hold Buy to
 * keep buying up a line.
 *
 * The map is drawn on one screen-sized canvas (hexMapDraw.ts): a page element per hex, hundreds late in
 * the game, ran phones out of graphics memory in Dumpster Legend. Zooming scales the hex shapes, lines
 * and words but never the pixel art: the icons stay one art pixel to var(--px) at every zoom (and hide
 * zoomed far out). Positions are in Dumpster Legend's stage px (6 to an art pixel), so its geometry,
 * zoom range and gestures carry over unchanged.
 *
 *   <UpgradeMap game={game} tab="combat" onClose={() => ...} />
 *
 * It covers the screen (position fixed, z-index var(--upgrade-map-z, 13): under sheets and reveals,
 * over the HUD) and follows the game on its own, whatever its parent's render cadence.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { currentLuck } from '../../core/luck';
import { squadPower } from '../../core/power';
import { HEX_BY_KEY, ROOT_KEYS, UPGRADE_MAPS, effectAt, hexTab, hexView, lineOf, nodeKey, nodeName, roman, type HexNode, type HexView } from '../../core/upgradeTree';
import { UPGRADES, buyUpgrade, tier, upgradeCost, upgradeNodeState, type UpgradeDef, type UpgradeTab } from '../../core/upgrades';
import type { Game } from '../../game';
import { Chunky } from '../common';
import { fmt } from '../format';
import { Px } from '../px';
import { uiSound } from '../sound';
import { DRAW, HH, R, UI_PX, drawMap, fontReset, hexAt, nodeX, nodeY, wrapName, type DrawHex, type DrawState, type View } from './hexMapDraw';
import { hexIcon } from './icons';
import { CardTile, useHoldRepeat } from './parts';
import { UpgradePopup } from './UpgradePopup';
import s from './hexmap.module.css';

/* ---------------------------------------------------------------- geometry */

const K_MIN = 0.25;
const K_MAX = 1.7;
/** The zoom it opens at (and the target button returns to): a little further out on a wide screen. */
const homeZoom = (wide: boolean) => (wide ? 0.85 : 1);
/** The canvas's pixels at most (about 16 MB): a screen's worth on any phone, a little softer on a 4K monitor. */
const MAX_CANVAS_PX = 4_200_000;
/** Lines that change the squad's stats on the floor (the World needs them refreshed). */
export const SQUAD_STATS = new Set(['might', 'vitality', 'swiftness', 'quickRoll', 'excalibur', 'dragonscale']);

function hexPoints(r: number): string {
  return [0, 60, 120, 180, 240, 300]
    .map((a) => {
      const rad = (a * Math.PI) / 180;
      return `${(r * Math.cos(rad)).toFixed(1)},${(r * Math.sin(rad)).toFixed(1)}`;
    })
    .join(' ');
}
/** The faint honeycomb behind the map: one tile of it (3R x 2HH) as a picture the window repeats. */
const GRID_URL = (() => {
  const outer = hexPoints(R * DRAW);
  const w = 3 * R;
  const h = 2 * HH;
  const hexes = [[0, 0], [w, 0], [0, h], [w, h], [1.5 * R, HH]].map(([x, y]) => `<polygon points="${outer}" transform="translate(${x} ${y})"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h.toFixed(2)}" viewBox="0 0 ${w} ${h.toFixed(2)}"><g fill="none" stroke="rgba(255,214,150,0.05)" stroke-width="3">${hexes}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

/** Each line's name in lines that fit its hex (measured once the pixel font is in), and the size it fits at. */
const NAME_LINES = new Map<string, { lines: string[]; px: number }>();
function nameLines(ctx: CanvasRenderingContext2D, def: UpgradeDef): { lines: string[]; px: number } {
  let got = NAME_LINES.get(def.id);
  if (!got) {
    // Shrink a name a little if a word won't fit (Butterfingers), as the hex narrows toward its foot.
    for (const px of [26, 23, 20]) {
      const lines = wrapName(ctx, def.name, 164, px);
      got = { lines, px };
      if (Math.max(...lines.map((l) => ctx.measureText(l).width)) <= 152) break;
    }
    if (document.fonts?.status === 'loaded') NAME_LINES.set(def.id, got!);
  }
  return got!;
}

/* ---------------------------------------------------------------- what stays between visits */

/** Each tab's selected hex and where its map was panned and zoomed to (kept while the app runs). */
const memories: Record<UpgradeTab, { sel: string; view: View | null }> = {
  luck: { sel: ROOT_KEYS.luck, view: null },
  combat: { sel: ROOT_KEYS.combat, view: null },
};
const scaleMemory = { scale: 2.5 / UI_PX };

/** Opens its tab's map next time on this hex (`${line id}:${tier}`, e.g. "luckyStrike:1"), centered on it. */
export function focusUpgradeHex(key: string): void {
  const n = HEX_BY_KEY.get(key);
  if (!n) return;
  const m = memories[hexTab(n)];
  m.sel = key;
  m.view = null;
}

/* ---------------------------------------------------------------- small hooks */

/** Re-renders when the game moves on (gold coming in, a floor going by): the screen follows it on its own. */
function useFollow(game: Game): void {
  const [, bump] = useState(0);
  useEffect(() => {
    let last = '';
    const t = window.setInterval(() => {
      const key = `${Math.floor(game.state.gold)}|${game.version}|${game.state.rebirths}`;
      if (key !== last) {
        last = key;
        bump((x) => x + 1);
      }
    }, 150);
    return () => window.clearInterval(t);
  }, [game]);
}

/** A number counting up (or down) to its target in steps. */
function useCountUp(target: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    from.current = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 380);
      const v = from.current + (target - from.current) * (1 - Math.pow(1 - p, 3));
      cur.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

/* ---------------------------------------------------------------- buying */

/**
 * Buys the hex `key` if it's the next tier of its line; on success the selection moves up the line, so
 * holding Buy keeps buying. `repeat` counts the buys in one press (its sounds climb).
 */
export function buyHex(game: Game, key: string, repeat = 0): { ok: boolean; next: string } {
  const n = HEX_BY_KEY.get(key);
  if (!n || upgradeNodeState(game.state, n.id, n.tier) !== 'open') return { ok: false, next: key };
  if (!buyUpgrade(game.state, n.id)) return { ok: false, next: key };
  const def = lineOf(n);
  if (def.special && def.max === 1) uiSound('unlock');
  else uiSound(repeat === 0 ? 'buy' : 'coin');
  if (n.tier >= def.max && !def.special) uiSound('ding');
  if (SQUAD_STATS.has(def.id)) game.syncSquad();
  game.touch();
  return { ok: true, next: n.tier < def.max ? nodeKey(n.id, n.tier + 1) : key };
}

/* ---------------------------------------------------------------- the buy card */

function BuyCard({ game, node, view, onBuy, onDetails }: { game: Game; node: HexNode; view: HexView; onBuy: (repeat: number) => boolean; onDetails: () => void }) {
  const st = game.state;
  const def = lineOf(node);
  const level = tier(st, def.id);
  const cost = upgradeCost(st, def.id);
  const afford = st.gold >= cost;
  // A press that can't buy: the button shakes its head, a pixel each way.
  const [nope, setNope] = useState(0);
  const hold = useHoldRepeat((repeat) => {
    const ok = onBuy(repeat);
    if (!ok && repeat === 0) setNope((x) => x + 1);
    return ok;
  });
  useEffect(() => {
    if (!nope) return;
    const t = window.setTimeout(() => setNope(0), 400);
    return () => window.clearTimeout(t);
  }, [nope]);
  const prev = node.prev ? HEX_BY_KEY.get(node.prev) : undefined;
  if (view === 'mystery') {
    return (
      <div className={`${s.card} card`} data-view="mystery">
        <CardTile node={node} view="mystery" />
        <div className={s.cardBody}>
          <span className={s.cardName}>???</span>
          <span className={s.cardDesc}>Buy {prev ? nodeName(prev) : 'the hex before it'} to reveal it.</span>
        </div>
        <button className={`btn ${s.buy}`} disabled>
          <Px icon="lock" size="sm" />
          LOCKED
        </button>
      </div>
    );
  }
  return (
    <div className={`${s.card} card`} data-view={view}>
      <CardTile node={node} view={view} onClick={onDetails} />
      <div className={s.cardBody}>
        <span className={s.cardName} onClick={onDetails}>
          {nodeName(node)}
          {node.special && <em className={s.cardTag}>Special</em>}
          {!node.special && def.rolls && (
            <em className={s.cardTag} data-kind="chance">
              Chance
            </em>
          )}
        </span>
        <span className={s.cardDesc}>{def.desc}</span>
        <span className={s.cardFx}>
          {view === 'owned' ? (
            effectAt(st, def.id, level)
          ) : (
            <>
              <span>{effectAt(st, def.id, node.tier - 1)}</span> <b>▶</b> <span className={s.fxNext}>{effectAt(st, def.id, node.tier)}</span>
            </>
          )}
        </span>
      </div>
      {view === 'owned' ? (
        <button className={`btn gold ${s.buy}`} disabled>
          <Px icon="check" size="sm" />
          OWNED
        </button>
      ) : (
        <div className={s.buyCol}>
          <button key={nope ? `n${nope}` : 'buy'} className={`btn green ${s.buy}`} data-afford={afford} data-nope={nope > 0 || undefined} {...hold}>
            <Px icon="coin" size="sm" />
            <span>{fmt(cost)}</span>
          </button>
          {!afford && <span className={s.short}>{fmt(cost - st.gold)} short</span>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- the corner numbers */

function MapGold({ gold }: { gold: number }) {
  return <>{fmt(useCountUp(Math.floor(gold)))}</>;
}

/* ---------------------------------------------------------------- the screen */

export function UpgradeMap({ game, tab = 'luck', onClose, closeText = 'CLOSE', onTab, onCards }: {
  game: Game;
  tab?: UpgradeTab;
  onClose?: () => void;
  closeText?: string;
  /** Switch between the Luck and Combat maps from the map itself (the tinker opens straight onto it). */
  onTab?: (t: UpgradeTab) => void;
  /** Show the same upgrades as a list of cards instead. */
  onCards?: () => void;
}) {
  useFollow(game);
  const st = game.state;
  const memory = memories[tab];
  const ROOT_KEY = ROOT_KEYS[tab];
  const MAP = UPGRADE_MAPS[tab];
  const calm = !!st.settings.reduceMotion;
  const [sel, setSelState] = useState(() => memory.sel);
  const selRef = useRef(sel);
  const setSel = (key: string) => {
    selRef.current = key;
    memory.sel = key;
    setSelState(key);
  };
  const [details, setDetails] = useState(false);
  const [wide, setWide] = useState(false);
  const [, bump] = useState(0);

  // What every hex shows right now (worked out again only when a tier changes).
  const sig = UPGRADES.map((u) => tier(st, u.id)).join(',');
  const hexes = useMemo(() => {
    const out: Array<{ node: HexNode; view: HexView; price: number }> = [];
    for (const n of MAP) {
      const view = hexView(st, n);
      if (view) out.push({ node: n, view, price: view === 'open' ? upgradeCost(st, n.id) : 0 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const shown = useMemo(() => new Map(hexes.map((h) => [h.node.key, h.view])), [hexes]);
  // Which open hexes the gold covers, as text: it changes only when the gold crosses a price.
  const affordKey = hexes
    .filter((h) => h.view === 'open' && st.gold >= h.price)
    .map((h) => h.node.key)
    .join(',');
  const affordable = useMemo(() => new Set(affordKey ? affordKey.split(',') : []), [affordKey]);

  // If the selection is hidden (a fresh map after a rebirth), pick the cheapest open hex.
  useEffect(() => {
    if (shown.has(sel)) return;
    const open = hexes.filter((h) => h.view === 'open').sort((a, b) => a.price - b.price)[0];
    if (open) setSel(open.node.key);
    else setSel(ROOT_KEY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, sel, hexes]);

  const bounds = useMemo(() => {
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    for (const h of hexes) {
      minX = Math.min(minX, nodeX(h.node));
      maxX = Math.max(maxX, nodeX(h.node));
      minY = Math.min(minY, nodeY(h.node));
      maxY = Math.max(maxY, nodeY(h.node));
    }
    return { minX: minX - R, maxX: maxX + R, minY: minY - R, maxY: maxY + R };
  }, [hexes]);

  /* ----- layout: the UI's pixel size, and where the open part of the map is (stage px) */
  const overlayRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const titlesRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const wideRef = useRef(wide);
  wideRef.current = wide;
  /** CSS px per stage px (an art pixel is var(--px) CSS px and 6 stage px). */
  const scaleRef = useRef(scaleMemory.scale);
  /** The map hasn't been touched yet (a pan, a pinch, the wheel, a glide): a resize may place it afresh. */
  const untouched = useRef(true);
  const measure = (): boolean => {
    const el = overlayRef.current;
    if (!el) return wideRef.current;
    const px = parseFloat(getComputedStyle(el).getPropertyValue('--px')) || 2.5;
    const was = scaleRef.current;
    scaleRef.current = px / UI_PX;
    // The UI's pixel size changed: keep the map where it was on screen (stage px are art pixels).
    if (Math.abs(was - scaleRef.current) > 1e-6) {
      const v = viewRef.current;
      viewRef.current = { x: (v.x * was) / scaleRef.current, y: (v.y * was) / scaleRef.current, k: v.k };
      if (untouched.current && memory.view === null) placed.current = false;
    }
    const w = el.clientWidth;
    const h = el.clientHeight;
    const isWide = w >= 900 && w > h;
    if (isWide !== wideRef.current) setWide(isWide);
    return isWide;
  };
  const stagePoint = (clientX: number, clientY: number) => {
    const r = viewportRef.current!.getBoundingClientRect();
    const k = scaleRef.current;
    return { x: (clientX - r.left) / k, y: (clientY - r.top) / k };
  };
  /** The open part of the map (stage px): under the header's words, above the card (or left of the side panel). */
  const openArea = () => {
    const k = scaleRef.current;
    const vp = viewportRef.current;
    const W = (vp?.clientWidth ?? 390) / k;
    const H = (vp?.clientHeight ?? 844) / k;
    const top = ((titlesRef.current?.getBoundingClientRect().bottom ?? 0) - (vp?.getBoundingClientRect().top ?? 0)) / k + 8 * UI_PX;
    if (wideRef.current) {
      const panel = (footRef.current?.offsetWidth ?? 0) / k;
      return { x0: 18 * UI_PX, x1: W - panel - 18 * UI_PX, y0: top, y1: H - 14 * UI_PX };
    }
    const foot = footRef.current;
    const card = foot?.querySelector('[data-card]') as HTMLElement | null;
    const bottom = ((card ?? foot)?.getBoundingClientRect().top ?? H * k) - (vp?.getBoundingClientRect().top ?? 0);
    return { x0: 18 * UI_PX, x1: W - 18 * UI_PX, y0: top, y1: bottom / k - 6 * UI_PX };
  };
  /** Where the map centers things: the middle of the open part. */
  const focusPoint = () => {
    const a = openArea();
    return { x: (a.x0 + a.x1) / 2, y: (a.y0 + a.y1) / 2 };
  };

  /* ----- the canvas: the view lives in a ref, and drawing reads refs, never React */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>(memory.view ?? { x: 0, y: 0, k: 1 });
  const placed = useRef(memory.view !== null);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const animRef = useRef(0);
  const openedAt = useRef(performance.now());
  const drawRef = useRef<DrawState>({ hexes: [], links: [], sel, calm, openedAt: openedAt.current, fresh: new Map() });
  const views = useRef<Map<string, HexView> | null>(null);
  const drawnSig = useRef('');
  const frame = useRef(0);
  /** The map needs drawing (a pan, a zoom, a change), or is animating (the ripple, a flash). */
  const mapDirty = useRef(true);
  const mapMoving = useRef(false);
  const loop = (now: number) => {
    frame.current = 0;
    const c = canvasRef.current;
    const vp = viewportRef.current;
    if (!c || !vp || !vp.clientWidth) return;
    const k = scaleRef.current;
    const sx = (c.width / vp.clientWidth) * k;
    if (mapDirty.current || mapMoving.current) {
      mapDirty.current = false;
      const ctx = c.getContext('2d');
      if (ctx) mapMoving.current = drawMap(ctx, c.width, c.height, sx, vp.clientWidth / k, vp.clientHeight / k, viewRef.current, drawRef.current, now, requestDraw);
    }
    if (mapMoving.current) frame.current = requestAnimationFrame(loop);
  };
  function requestDraw() {
    mapDirty.current = true;
    if (!frame.current) frame.current = requestAnimationFrame(loop);
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const clamp = (v: View) => {
    const b = boundsRef.current;
    const f = focusPoint();
    v.k = Math.min(K_MAX, Math.max(K_MIN, v.k));
    v.x = Math.min(f.x - b.minX * v.k, Math.max(f.x - b.maxX * v.k, v.x));
    v.y = Math.min(f.y - b.minY * v.k, Math.max(f.y - b.maxY * v.k, v.y));
  };
  const apply = () => {
    const v = viewRef.current;
    clamp(v);
    // The honeycomb behind: the map's tile, scaled with it, its origin on the map's (0, 0).
    const grid = gridRef.current;
    if (grid) {
      const k = scaleRef.current;
      grid.style.backgroundSize = `${3 * R * v.k * k}px ${2 * HH * v.k * k}px`;
      grid.style.backgroundPosition = `${v.x * k}px ${v.y * k}px`;
    }
    requestDraw();
  };
  const save = () => {
    memory.view = { ...viewRef.current };
    scaleMemory.scale = scaleRef.current;
  };
  const stopAnim = () => {
    if (!animRef.current) return;
    cancelAnimationFrame(animRef.current);
    animRef.current = 0;
    // (A glide stopped short, by a tap or by closing, still leaves the map where it got to.)
    save();
  };
  /** First visit: the selection (Luck I to start) at the focus, at the home zoom. */
  const place = () => {
    if (placed.current) return;
    placed.current = true;
    const n = HEX_BY_KEY.get(selRef.current) ?? HEX_BY_KEY.get(ROOT_KEY)!;
    const f = focusPoint();
    const k = homeZoom(wideRef.current);
    viewRef.current = { x: f.x - nodeX(n) * k, y: f.y - nodeY(n) * k, k };
  };
  /** Glides the view so map point (mx, my) sits at the focus point. */
  const glideTo = (mx: number, my: number, k = viewRef.current.k) => {
    stopAnim();
    const from = { ...viewRef.current };
    const f = focusPoint();
    const to = { x: f.x - mx * k, y: f.y - my * k, k };
    if (calm) {
      viewRef.current = to;
      apply();
      save();
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 420);
      const e = 1 - Math.pow(1 - p, 3);
      viewRef.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e };
      apply();
      if (p < 1) animRef.current = requestAnimationFrame(step);
      else save();
    };
    animRef.current = requestAnimationFrame(step);
  };

  // The canvas has one pixel per screen pixel (capped); the UI's pixel size and the layout follow the window.
  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const fit = () => {
      const isWide = measure();
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      let w = Math.max(1, Math.round(r.width * dpr));
      let h = Math.max(1, Math.round(r.height * dpr));
      const cap = Math.sqrt(MAX_CANVAS_PX / (w * h));
      if (cap < 1) {
        w = Math.round(w * cap);
        h = Math.round(h * cap);
      }
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (ctx) fontReset(ctx);
        NAME_LINES.clear();
        drawnSig.current = '';
        bump((x) => x + 1);
      }
      // (Switching between the tall and wide layouts: place the map once the new layout is in.)
      if (isWide !== wideRef.current) return;
      place();
      apply();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    window.addEventListener('resize', fit);
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (!alive) return;
      NAME_LINES.clear();
      drawnSig.current = '';
      bump((x) => x + 1);
    });
    return () => {
      alive = false;
      ro.disconnect();
      window.removeEventListener('resize', fit);
      // Its pixels go now, not whenever the canvas is collected.
      c.width = 0;
      c.height = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What the canvas shows, kept current: hexes with their words, links, the selection; hexes bought or
  // revealed after the map opened flash or blink in. Rebuilt only when something on it changed.
  useLayoutEffect(() => {
    const drawSig = `${sig}|${affordKey}|${sel}|${calm}`;
    if (drawSig === drawnSig.current) return;
    drawnSig.current = drawSig;
    const now = performance.now();
    const ds = drawRef.current;
    const prev = views.current;
    if (prev && now - openedAt.current > 700) {
      for (const h of hexes) if (prev.get(h.node.key) !== h.view) ds.fresh.set(h.node.key, now);
    }
    for (const [key, at] of ds.fresh) if (now - at > 1000) ds.fresh.delete(key);
    views.current = new Map(hexes.map((h) => [h.node.key, h.view]));
    const ctx = canvasRef.current?.getContext('2d');
    drawRef.current = {
      ...ds,
      sel,
      calm,
      hexes: hexes.map((h): DrawHex => {
        const def = lineOf(h.node);
        const nm = h.view === 'owned' && ctx ? nameLines(ctx, def) : null;
        return {
          node: h.node,
          view: h.view,
          afford: h.view === 'open' && affordable.has(h.node.key),
          tier: def.max > 1 ? roman(h.node.tier) : null,
          name: nm?.lines ?? [],
          namePx: nm?.px ?? 26,
          price: h.view === 'open' ? fmt(h.price) : '',
          icon: hexIcon(def.icon),
        };
      }),
      links: hexes.filter((h) => h.node.prev && shown.has(h.node.prev)).map((h) => [HEX_BY_KEY.get(h.node.prev!)!, h.node, h.view]),
    };
    requestDraw();
  });

  useLayoutEffect(() => {
    if (measure() === wide) place();
    apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, wide]);
  useEffect(() => () => stopAnim(), []);

  // Pointer gestures: one finger pans (with a little glide on release), two fingers pinch, a still tap selects.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let downKey: string | null = null;
    let start = { x: 0, y: 0 };
    let last = { x: 0, y: 0, t: 0 };
    let vel = { x: 0, y: 0 };
    let moved = false;
    let pinch: { d: number; mid: { x: number; y: number }; v: View } | null = null;

    const glide = () => {
      let prev = performance.now();
      const step = (now: number) => {
        const dt = Math.min(32, now - prev);
        prev = now;
        viewRef.current.x += vel.x * dt;
        viewRef.current.y += vel.y * dt;
        apply();
        const decay = Math.pow(0.9, dt / 16);
        vel = { x: vel.x * decay, y: vel.y * decay };
        if (Math.hypot(vel.x, vel.y) > 0.03) animRef.current = requestAnimationFrame(step);
        else save();
      };
      animRef.current = requestAnimationFrame(step);
    };
    const startPinch = () => {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v: { ...viewRef.current } };
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('[data-ui]')) return;
      if (e.button > 0) return;
      stopAnim();
      untouched.current = false;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // (A pointer that already left: fine.)
      }
      const p = stagePoint(e.clientX, e.clientY);
      pts.set(e.pointerId, p);
      if (pts.size === 1) {
        const v = viewRef.current;
        downKey = hexAt(drawRef.current.hexes, (p.x - v.x) / v.k, (p.y - v.y) / v.k)?.node.key ?? null;
        start = p;
        last = { ...p, t: performance.now() };
        vel = { x: 0, y: 0 };
        moved = false;
        pinch = null;
      } else if (pts.size === 2) {
        moved = true;
        startPinch();
      }
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      const p = stagePoint(e.clientX, e.clientY);
      pts.set(e.pointerId, p);
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const k = Math.min(K_MAX, Math.max(K_MIN, (pinch.v.k * d) / pinch.d));
        const mx = (pinch.mid.x - pinch.v.x) / pinch.v.k;
        const my = (pinch.mid.y - pinch.v.y) / pinch.v.k;
        viewRef.current = { x: mid.x - mx * k, y: mid.y - my * k, k };
        apply();
        return;
      }
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) > 10) moved = true;
      if (!moved) return;
      const now = performance.now();
      const dt = Math.max(1, now - last.t);
      viewRef.current.x += p.x - last.x;
      viewRef.current.y += p.y - last.y;
      vel = { x: vel.x * 0.6 + ((p.x - last.x) / dt) * 0.4, y: vel.y * 0.6 + ((p.y - last.y) / dt) * 0.4 };
      last = { ...p, t: now };
      apply();
    };
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 1) {
        // Pinch ended with one finger still down: keep panning from here.
        const p = [...pts.values()][0];
        last = { ...p, t: performance.now() };
        vel = { x: 0, y: 0 };
        pinch = null;
        return;
      }
      if (pts.size > 0) return;
      if (!moved) {
        if (downKey && e.type === 'pointerup') select(downKey);
        return;
      }
      if (e.type === 'pointerup' && !calm && performance.now() - last.t < 80 && Math.hypot(vel.x, vel.y) > 0.25) glide();
      else save();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnim();
      untouched.current = false;
      const p = stagePoint(e.clientX, e.clientY);
      const v = viewRef.current;
      const k = Math.min(K_MAX, Math.max(K_MIN, v.k * Math.exp(-e.deltaY * 0.0015)));
      const mx = (p.x - v.x) / v.k;
      const my = (p.y - v.y) / v.k;
      viewRef.current = { x: p.x - mx * k, y: p.y - my * k, k };
      apply();
      save();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A tap on a hex: select it; a tap on the one already selected opens its line's details. */
  const select = (key: string) => {
    if (!HEX_BY_KEY.has(key)) return;
    uiSound('tap');
    if (key === selRef.current && drawRef.current.hexes.find((h) => h.node.key === key)?.view !== 'mystery') setDetails(true);
    else setSel(key);
  };

  // Whenever the selection moves (a tap, or buying up a line), glide it out from under the header or card.
  useEffect(() => {
    const n = HEX_BY_KEY.get(sel);
    if (!n || !placed.current) return;
    const v = viewRef.current;
    const sx = v.x + nodeX(n) * v.k;
    const sy = v.y + nodeY(n) * v.k;
    const a = openArea();
    if (sx < a.x0 || sx > a.x1 || sy < a.y0 || sy > a.y1) glideTo(nodeX(n), nodeY(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const center = () => {
    uiSound('tap');
    const n = HEX_BY_KEY.get(sel) ?? HEX_BY_KEY.get(ROOT_KEY)!;
    glideTo(nodeX(n), nodeY(n), homeZoom(wide));
  };

  const buy = (repeat: number): boolean => {
    const r = buyHex(game, selRef.current, repeat);
    if (!r.ok) return false;
    if (r.next !== selRef.current) setSel(r.next);
    bump((x) => x + 1);
    return true;
  };

  const close = () => {
    uiSound('close');
    onClose?.();
  };

  // Esc: the details first, then the map (when it can close). It doesn't reach the game's own keys.
  const detailsRef = useRef(details);
  detailsRef.current = details;
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (detailsRef.current) setDetails(false);
      else if (onClose) closeRef.current();
      else return;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  const selView = shown.get(sel);
  const selNode = selView ? HEX_BY_KEY.get(sel) : undefined;
  const power = squadPower(st);
  const luck = currentLuck(st, Date.now());

  let card: ReactNode = null;
  if (selNode && selView) card = <BuyCard game={game} node={selNode} view={selView} onBuy={buy} onDetails={() => (uiSound('open'), setDetails(true))} />;

  return (
    <div className={s.overlay} ref={overlayRef} data-wide={wide || undefined} data-calm={calm || undefined}>
      <div className={s.viewport} ref={viewportRef}>
        <div className={s.grid} ref={gridRef} style={{ backgroundImage: GRID_URL }} aria-hidden />
      </div>
      <canvas ref={canvasRef} className={s.canvas} aria-hidden />

      <div className={s.head}>
        <div className={s.titles} ref={titlesRef}>
          {onTab ? (
            <span className="row" data-ui style={{ gap: 'calc(2 * var(--px))', pointerEvents: 'auto' }}>
              {(['luck', 'combat'] as const).map((t) => (
                <button key={t} className={`btn small ${t === tab ? (t === 'luck' ? 'green' : 'red') : ''}`} onClick={() => t !== tab && (uiSound('tap'), onTab(t))}>
                  <Px icon={t === 'luck' ? 'clover' : 'swords'} size="sm" />
                  {t === 'luck' ? 'LUCK' : 'COMBAT'}
                </button>
              ))}
              {onCards && (
                <button className="btn small" onClick={() => (uiSound('tap'), onCards())} title="As cards">
                  <Px icon="bag" size="sm" />
                </button>
              )}
            </span>
          ) : (
            <Chunky text={tab === 'luck' ? 'LUCK MAP' : 'COMBAT MAP'} size={11} grad={tab === 'luck' ? 'green' : 'red'} />
          )}
        </div>
        <button className={`btn blue square ${s.centerBtn}`} data-ui onClick={center} aria-label="Center the map" title="Center the map">
          <Px icon="target" size="md" />
        </button>
      </div>

      <div className={s.foot} ref={footRef}>
        {card && (
          <div className={s.cardWrap} data-ui data-card>
            {card}
          </div>
        )}
        <div className={s.bar} data-ui>
          <span className={s.coins} title="Gold">
            <Px icon="coin" size="md" />
            <MapGold gold={st.gold} />
          </span>
          {onClose && (
            <button className={`btn red ${s.close}`} onClick={close}>
              {closeText}
            </button>
          )}
          <span className={s.barRight}>
            <span className={s.stat} title="Squad power">
              <Px icon="sword" size="sm" />
              {fmt(power)}
            </span>
            <span className={s.stat} data-k="luck" title="Luck">
              <Px icon="clover" size="sm" />x{luck < 10 ? luck.toFixed(2) : fmt(luck)}
            </span>
          </span>
        </div>
      </div>

      {details && selNode && selView && selView !== 'mystery' && <UpgradePopup game={game} node={selNode} onBuy={buy} onClose={() => (uiSound('close'), setDetails(false))} />}
    </div>
  );
}

export default UpgradeMap;
