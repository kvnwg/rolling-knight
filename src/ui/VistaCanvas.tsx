/**
 * The home screen's backdrop: the camp's vista, painted on its own canvas behind the panels. The scene
 * sits where the panels leave room (above them on tall screens, left of them on wide ones).
 */
import { useEffect, useRef } from 'react';
import type { Game } from '../game';

/** A plain dusk sky, until the painted vista is mounted. */
function drawFallback(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1c1a46');
  g.addColorStop(0.45, '#6a3a78');
  g.addColorStop(0.7, '#e2706a');
  g.addColorStop(1, '#ffc27a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const sun = ctx.createRadialGradient(w * 0.6, h * 0.62, 0, w * 0.6, h * 0.62, h * 0.4);
  sun.addColorStop(0, 'rgba(255,240,190,0.95)');
  sun.addColorStop(0.12, 'rgba(255,200,140,0.55)');
  sun.addColorStop(1, 'rgba(255,140,110,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#140f24';
  for (let x = 0; x < w; x += 12) {
    const y = h * 0.78 + Math.sin(x * 0.01 + t * 0.1) * 6 + Math.sin(x * 0.037) * 10;
    ctx.fillRect(x, y, 13, h - y);
  }
}

export function VistaCanvas({ game, wide }: { game: Game; wide: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wideRef = useRef(wide);
  wideRef.current = wide;
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      drawFallback(ctx, w, h, (now - start) / 1000);
      void game;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  return <canvas ref={ref} className="vista" />;
}
