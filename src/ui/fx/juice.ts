/**
 * Small touches for every button (Dumpster Legend's juice.ts): on release a button hops a pixel up,
 * flashes and settles (juice.module.css, whole pixels and steps, so pixel art inside stays on its grid).
 * Call once; it returns its uninstall.
 */
import s from './juice.module.css';

export function installButtonJuice(): () => void {
  const onUp = (e: PointerEvent) => {
    const btn = (e.target as Element | null)?.closest?.('button') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    // Restart the hop even when the same button is tapped again mid-hop.
    btn.classList.remove(s.popped);
    void btn.offsetWidth;
    btn.classList.add(s.popped);
  };
  const onEnd = (e: AnimationEvent) => {
    const el = e.target as Element | null;
    if (el?.classList?.contains(s.popped) && e.animationName.includes('btnPop')) el.classList.remove(s.popped);
  };
  document.addEventListener('pointerup', onUp, true);
  document.addEventListener('animationend', onEnd, true);
  return () => {
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('animationend', onEnd, true);
  };
}
