/**
 * A knight's picture you can pick up and drop on a squad slot (the Warden's screen). With a mouse,
 * press on the picture and move; on a touch screen, press and hold it a moment (a swipe over it
 * scrolls the list as anywhere else): a copy lifts off under your finger or cursor, the slot under it lights up, and
 * letting go over a slot puts the knight there. Letting go anywhere else does nothing, except for a
 * knight picked up out of a squad slot (`onDropOut`): dropped away from the slots, it leaves the
 * squad; the copy fades while it's away from the slots to say so. A press that doesn't move stays a
 * tap (the card's own click). Pointer events, so it works the same with touch and mouse; the picture
 * takes no scroll gestures (touch-action: none) while the rest of the card still scrolls the list.
 * Drop targets are any element with data-drop-slot="<slot index>".
 *
 * The lifted copy lives on the page's body, outside React, so it's cleaned up whatever ends the drag:
 * letting go anywhere (the window listens, not just the picture), a cancelled pointer, the picture
 * losing its pointer capture or leaving the page, the window losing focus (let go outside the frame).
 */
import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { uiSound } from '../sound';
import s from './keeper.module.css';

/** On a touch screen a drag starts once the finger has held still this long (ms); moving sooner scrolls. */
const HOLD_MS = 280;
/** How far a held finger may wander (px) before it counts as a scroll instead. */
const HOLD_SLOP = 10;

interface Drag {
  id: number;
  /** A touch waiting out its hold (not lifted yet). */
  waiting: boolean;
  holdTimer: number;
  x: number;
  y: number;
  ghost: HTMLElement | null;
  over: HTMLElement | null;
  w: number;
  h: number;
  stop: () => void;
}

/** Every lifted copy on the page: any left behind by a drag that never ended are swept up. */
const ghosts = new Set<HTMLElement>();
let active: Drag | null = null;

function sweep(keep?: HTMLElement | null): void {
  for (const g of ghosts) {
    if (g === keep) continue;
    g.remove();
    ghosts.delete(g);
  }
  if (!keep) delete document.body.dataset.dragKnight;
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

export function DragKnight({ onDrop, onDropOut, children, title }: { onDrop: (slot: number) => void; onDropOut?: () => void; children: ReactNode; title?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const drag = useRef<Drag | null>(null);
  const cb = useRef({ onDrop, onDropOut });
  cb.current = { onDrop, onDropOut };

  const end = (cancel: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    d.stop();
    if (active === d) active = null;
    if (!d.ghost) return;
    d.ghost.remove();
    ghosts.delete(d.ghost);
    sweep();
    d.over?.removeAttribute('data-drop-hover');
    eatNextClick();
    if (cancel) return;
    const slot = d.over ? Number(d.over.dataset.dropSlot) : -1;
    if (Number.isFinite(slot) && slot >= 0) cb.current.onDrop(slot);
    else cb.current.onDropOut?.();
  };

  const lift = (d: Drag, x: number, y: number) => {
    d.waiting = false;
    move({ clientX: x, clientY: y, pointerId: d.id }, true);
  };

  const move = (e: { clientX: number; clientY: number; pointerId: number }, force = false) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || e.pointerId !== d.id) return;
    if (d.waiting) {
      // A touch still holding: moving now is a scroll (the list's own), not a drag.
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > HOLD_SLOP) end(true);
      return;
    }
    if (!d.ghost) {
      if (!force && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 7) return;
      // Lift a copy of the picture.
      sweep();
      const g = el.cloneNode(true) as HTMLElement;
      g.className = s.dragGhost;
      g.removeAttribute('title');
      g.style.width = `${d.w}px`;
      g.style.height = `${d.h}px`;
      document.body.appendChild(g);
      ghosts.add(g);
      d.ghost = g;
      document.body.dataset.dragKnight = '';
      uiSound('tap');
      try {
        navigator.vibrate?.(12);
      } catch {
        /* no buzz */
      }
    }
    d.ghost.style.transform = `translate(${Math.round(e.clientX - d.w / 2)}px, ${Math.round(e.clientY - d.h * 0.7)}px) scale(1.12)`;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const over = (hit?.closest('[data-drop-slot]') as HTMLElement | null) ?? null;
    if (over !== d.over) {
      d.over?.removeAttribute('data-drop-hover');
      over?.setAttribute('data-drop-hover', '');
      d.over = over;
    }
    // Out of a squad slot and away from the slots: letting go here takes it out of the squad.
    if (cb.current.onDropOut && !over) d.ghost.setAttribute('data-out', '');
    else d.ghost.removeAttribute('data-out');
  };

  const down = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // One drag at a time (a second finger doesn't start another).
    if (active) return;
    const r = ref.current?.getBoundingClientRect();
    const id = e.pointerId;
    const touchHold = e.pointerType === 'touch';
    const onMove = (ev: globalThis.PointerEvent) => move(ev);
    // Once a held touch has lifted the knight, the page mustn't scroll under the drag.
    const noScroll = (ev: TouchEvent) => {
      if (drag.current && !drag.current.waiting) ev.preventDefault();
    };
    const onUp = (ev: globalThis.PointerEvent) => ev.pointerId === id && end(false);
    const onCancel = (ev: globalThis.PointerEvent) => ev.pointerId === id && end(true);
    const onBlur = () => end(true);
    const el = ref.current;
    const onLost = () => {
      // Capture lost mid-drag (the picture re-drawn or gone): the window still hears the pointer, so
      // carry on; if the picture left the page, give up.
      if (el && !el.isConnected) end(true);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onBlur);
    window.addEventListener('touchmove', noScroll, { passive: false });
    el?.addEventListener('lostpointercapture', onLost);
    const stop = () => {
      window.clearTimeout(d.holdTimer);
      window.removeEventListener('touchmove', noScroll);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
      el?.removeEventListener('lostpointercapture', onLost);
    };
    const d: Drag = { id, waiting: touchHold, holdTimer: 0, x: e.clientX, y: e.clientY, ghost: null, over: null, w: r?.width ?? 40, h: r?.height ?? 40, stop };
    drag.current = d;
    active = d;
    if (touchHold) {
      // Hold still a moment to pick it up (a swipe scrolls the list instead).
      const x = e.clientX;
      const y = e.clientY;
      d.holdTimer = window.setTimeout(() => drag.current === d && d.waiting && lift(d, x, y), HOLD_MS);
      return;
    }
    try {
      el?.setPointerCapture(id);
    } catch {
      /* the window listens anyway */
    }
  };

  // Leaving the page (the screen closed mid-drag) drops nothing and leaves nothing behind.
  useEffect(() => () => end(true), []);

  return (
    <span ref={ref} className={s.drag} title={title} onPointerDown={down}>
      {children}
    </span>
  );
}
