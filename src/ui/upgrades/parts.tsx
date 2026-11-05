/** Pieces the upgrade map and its popup share: the icon tile and hold-to-buy. */
import { useEffect, useRef } from 'react';
import { lineOf, type HexNode, type HexView } from '../../core/upgradeTree';
import { cardIcon } from './icons';
import s from './hexmap.module.css';

/**
 * Hold to keep buying: the first buy on press, then again after 380 ms, each wait a fifth shorter than
 * the last (never under 70 ms), until a buy fails or the press ends.
 */
export function useHoldRepeat(fn: (repeat: number) => boolean) {
  const timer = useRef<number | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const start = (e: { preventDefault: () => void; button?: number }) => {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    stop();
    let n = 0;
    if (!fnRef.current(n++)) return;
    let delay = 380;
    const loop = () => {
      if (!fnRef.current(n++)) return stop();
      delay = Math.max(70, delay * 0.8);
      timer.current = window.setTimeout(loop, delay);
    };
    timer.current = window.setTimeout(loop, delay);
  };
  // Enter or Space buys one tier (held down, the key repeats).
  const key = (e: { key: string; repeat: boolean; preventDefault: () => void }) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    fnRef.current(e.repeat ? 1 : 0);
  };
  return { onPointerDown: start, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop, onKeyDown: key, onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault() };
}

/** A line's icon on a tile colored like its hex (a "?" for one not yet revealed). */
export function CardTile({ node, view, onClick }: { node: HexNode; view: HexView; onClick?: () => void }) {
  const icon = cardIcon(lineOf(node).icon);
  return (
    <span className={s.cardTile} data-view={view} data-special={node.special || undefined} onClick={onClick}>
      {view === 'mystery' ? (
        <span className={s.cardQ}>?</span>
      ) : (
        <img className="px" src={icon.url} alt="" draggable={false} style={{ width: `calc(${icon.w} * var(--px))`, height: `calc(${icon.h} * var(--px))` }} />
      )}
    </span>
  );
}
