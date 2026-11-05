/**
 * A knight's picture you can pick up and drop on a squad slot (the Warden's screen). Press on the
 * picture and move: a copy lifts off under your finger or cursor, the slot under it lights up, and
 * letting go over a slot puts the knight there (anywhere else, nothing happens). A press that doesn't
 * move stays a tap (the card's own click). Pointer events, so it works the same with touch and mouse;
 * the picture takes no scroll gestures (touch-action: none) while the rest of the card still scrolls
 * the list. Drop targets are any element with data-drop-slot="<slot index>".
 */
import { useRef, type PointerEvent, type ReactNode } from 'react';
import { uiSound } from '../sound';
import s from './keeper.module.css';

interface Drag {
  x: number;
  y: number;
  ghost: HTMLElement | null;
  over: HTMLElement | null;
  w: number;
  h: number;
}

/** Swallows the click that follows a drag (once, if it comes at all). */
function eatNextClick(): void {
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 60);
}

export function DragKnight({ onDrop, children, title }: { onDrop: (slot: number) => void; children: ReactNode; title?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const drag = useRef<Drag | null>(null);

  const down = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const r = ref.current?.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, ghost: null, over: null, w: r?.width ?? 40, h: r?.height ?? 40 };
    ref.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 7) return;
      // Lift a copy of the picture.
      const g = el.cloneNode(true) as HTMLElement;
      g.className = s.dragGhost;
      g.style.width = `${d.w}px`;
      g.style.height = `${d.h}px`;
      document.body.appendChild(g);
      d.ghost = g;
      document.body.dataset.dragKnight = '';
      uiSound('tap');
    }
    d.ghost.style.transform = `translate(${Math.round(e.clientX - d.w / 2)}px, ${Math.round(e.clientY - d.h * 0.7)}px) scale(1.12)`;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const over = (hit?.closest('[data-drop-slot]') as HTMLElement | null) ?? null;
    if (over !== d.over) {
      d.over?.removeAttribute('data-drop-hover');
      over?.setAttribute('data-drop-hover', '');
      d.over = over;
    }
  };
  const end = (cancel: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.ghost) return;
    d.ghost.remove();
    delete document.body.dataset.dragKnight;
    d.over?.removeAttribute('data-drop-hover');
    eatNextClick();
    const slot = d.over ? Number(d.over.dataset.dropSlot) : -1;
    if (!cancel && Number.isFinite(slot) && slot >= 0) onDrop(slot);
  };

  return (
    <span ref={ref} className={s.drag} title={title} onPointerDown={down} onPointerMove={move} onPointerUp={() => end(false)} onPointerCancel={() => end(true)}>
      {children}
    </span>
  );
}
