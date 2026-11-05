/**
 * A keeper's screen, the same for every counter at the hub (the gun shop's layout, in the light beige
 * "Pixel Art GUI" style): the keeper big at their counter in a lamplit scene across the top
 * (SceneView); tabs under it with a small square close button; then a sheet of paper with your purse
 * at the top, a category list down the left when there are categories, the offers as icon cards
 * (OfferCard), and any do-it-all buttons along the foot. Pictures and numbers, hardly any words: an
 * offer's details are in the popup its card opens (InfoPopup).
 *
 *   <KeeperScreen game station tabs tab onTab onClose>
 *     <ShopTop purse={...} title={...} />
 *     <ShopBody cats={...} cat onCat> ...cards </ShopBody>
 *     <ShopFoot> hints </ShopFoot>
 *   </KeeperScreen>
 *
 * Esc closes it (App.tsx); a keeper's own overlays (the upgrade map) take Esc first.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Game } from '../../game';
import type { HubStation } from '../../world/hubWorld';
import { fmt } from '../format';
import { Px, type IconName } from '../px';
import { uiSound } from '../sound';
import { hexIcon } from '../upgrades/icons';
import { UPGRADE_ICON_ROWS } from '../upgrades/iconRows';
import { SceneView } from './SceneView';
import s from './keeper.module.css';

export interface KeeperTab {
  id: string;
  label: string;
  /** A UI icon (px.tsx) or a drawn one (iconRows.ts). */
  icon?: string;
  /** A count in a red tag (things you can buy there now). */
  badge?: number;
}

export interface KeeperCat {
  id: string;
  label: string;
  icon?: ReactNode;
  /** A count in a green tag (things you can buy in it now). */
  badge?: number;
}

/** Re-renders while the game moves on underneath (gold coming in, the altar rolling). */
export function useGameTick(game: Game, ms = 200): void {
  const [, bump] = useState(0);
  useEffect(() => {
    let last = '';
    const t = window.setInterval(() => {
      const key = `${Math.floor(game.state.gold)}|${game.version}|${game.state.sigils}|${game.recent.length}`;
      if (key !== last) {
        last = key;
        bump((x) => x + 1);
      }
    }, ms);
    return () => window.clearInterval(t);
  }, [game, ms]);
}

/** A number counting toward its target in steps (the purse after a buy). */
export function useCountUp(target: number): number {
  const [shown, setShown] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    if (from === target) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 360);
      const v = from + (target - from) * (1 - Math.pow(1 - p, 3));
      cur.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

export function KeeperScreen({
  game,
  station,
  tabs,
  tab,
  onTab,
  onClose,
  children,
}: {
  game: Game;
  station: HubStation;
  tabs: KeeperTab[];
  tab: string;
  onTab: (id: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const calm = !!game.state.settings.reduceMotion;
  return (
    <div className={s.screen} onPointerDown={(e) => e.target === e.currentTarget && (uiSound('close'), onClose())} data-keeper={station.id}>
      <div className={s.col}>
        <SceneView id={station.id} calm={calm} title={station.name} />
        <div className={s.tabs} role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tab}
              className={s.tab}
              data-on={t.id === tab || undefined}
              onClick={() => {
                if (t.id === tab) return;
                uiSound('tap');
                onTab(t.id);
              }}
            >
              {t.icon && <Glyph icon={t.icon} />}
              {t.label}
              {!!t.badge && <span className={s.badge}>{t.badge}</span>}
            </button>
          ))}
          <button className={s.x} onClick={() => (uiSound('close'), onClose())} aria-label="Close" title="Close (Esc)">
            <i />
          </button>
        </div>
        <div className={s.panel}>{children}</div>
      </div>
    </div>
  );
}

/** The paper's top row: your purse on the left, a title or a few numbers on the right, maybe a button. */
export function ShopTop({ purse, title, right }: { purse: ReactNode; title?: ReactNode; right?: ReactNode }) {
  return (
    <div className={s.top}>
      {purse}
      <div className={s.title}>{title}</div>
      {right}
    </div>
  );
}

/** Coins (or sigils, or shards) in a slot pressed into the paper, counting as they change. */
export function Purse({ amount, icon = 'coin', label = 'Gold' }: { amount: number; icon?: IconName; label?: string }) {
  const shown = useCountUp(Math.floor(amount));
  return (
    <span className={s.purse} title={label}>
      <Px icon={icon} size="md" />
      {fmt(Math.round(shown))}
    </span>
  );
}

/** An icon by name: one of the UI's (px.tsx) at `size`, or one drawn for the keepers (iconRows.ts, 10 x 10). */
export function Glyph({ icon, size = 'sm' }: { icon: string; size?: 'xs' | 'sm' | 'md' }) {
  if (!(icon in UPGRADE_ICON_ROWS)) return <Px icon={icon as IconName} size={size} />;
  const a = hexIcon(icon);
  return <img className="px" src={a.url} alt="" draggable={false} style={{ width: `calc(${a.w} * var(--px))`, height: `calc(${a.h} * var(--px))`, flex: 'none' }} />;
}

/** A number by its icon, in a slot (the top row's luck, power, sigils...). */
export function Stat({ icon, children, title }: { icon: string; children: ReactNode; title?: string }) {
  return (
    <span className={s.chip} title={title}>
      <Glyph icon={icon} />
      {children}
    </span>
  );
}

/** "now ▸ next": a value, a little arrow, the next value in green (just the next when there's no now). */
export function Delta({ now, next }: { now?: ReactNode; next: ReactNode }) {
  return (
    <span className={s.delta}>
      {now !== undefined && <em>{now}</em>}
      {now !== undefined && <Px icon="arrowRight" size="xs" />}
      <b>{next}</b>
    </span>
  );
}

/** The categories down the left (when there are any) and the cards. */
export function ShopBody({ cats, cat, onCat, children, scrollKey }: { cats?: KeeperCat[]; cat?: string; onCat?: (id: string) => void; children: ReactNode; scrollKey?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  // A new tab or category starts at the top.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [scrollKey]);
  return (
    <div className={s.body} data-nocats={!cats || cats.length === 0 || undefined}>
      {cats && cats.length > 0 && (
        <nav className={s.cats}>
          {cats.map((c) => (
            <button
              key={c.id}
              className={s.cat}
              data-on={c.id === cat || undefined}
              onClick={() => {
                if (c.id === cat) return;
                uiSound('tap');
                onCat?.(c.id);
              }}
            >
              {c.icon}
              <span>{c.label}</span>
              {!!c.badge && <em>{c.badge}</em>}
            </button>
          ))}
        </nav>
      )}
      <div className={s.scroll} ref={scroller}>
        {children}
      </div>
    </div>
  );
}

export function ShopGrid({ children }: { children: ReactNode }) {
  return <div className={s.grid}>{children}</div>;
}

export function ShopFoot({ children }: { children: ReactNode }) {
  return <div className={s.foot}>{children}</div>;
}

export { s as keeperStyles };
