/**
 * The details of an offer, on a small sheet of paper over the keeper's screen when its card is
 * tapped: its picture, its name, a few short lines (what it does, what opens it) and, if it can be
 * had, its price button. The only place a keeper's screen spends words. Tap outside, the X or Esc to
 * close.
 */
import { useEffect, type ReactNode } from 'react';
import { uiSound } from '../sound';
import s from './keeper.module.css';

export function InfoPopup({ art, name, sub, children, actions, onClose }: { art: ReactNode; name: ReactNode; sub?: ReactNode; children?: ReactNode; actions?: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      uiSound('close');
      onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return (
    <div className={s.pop} onPointerDown={(e) => e.target === e.currentTarget && (uiSound('close'), onClose())}>
      <div className={s.popCard} role="dialog">
        <button className={s.x} style={{ position: 'absolute', top: 'calc(1 * var(--px))', right: 'calc(1 * var(--px))', marginBottom: 0 }} onClick={() => (uiSound('close'), onClose())} aria-label="Close">
          <i />
        </button>
        <div className={s.popTop}>
          <div className={s.popArt}>{art}</div>
          <div className={s.popName}>
            <b>{name}</b>
            {sub && <span>{sub}</span>}
          </div>
        </div>
        {children && <div className={s.popBody}>{children}</div>}
        {actions && <div className={s.popActions}>{actions}</div>}
      </div>
    </div>
  );
}
