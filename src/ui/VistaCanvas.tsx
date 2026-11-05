/**
 * The character select's backdrop: the squad's camp on a cliff over a sunset valley (src/render/vista),
 * painted on its own canvas behind the panel. The campfire sits where the panel leaves room: in the
 * upper part of a tall screen, the left of a wide one. The knight you're looking at stands behind the
 * fire, the rest of the squad either side of it.
 */
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { Game } from '../game';
import { Vista, type VistaHero } from '../render/vista';

export function VistaCanvas({ game, wide, pick }: { game: Game; wide: boolean; pick?: MutableRefObject<string | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wideRef = useRef(wide);
  wideRef.current = wide;
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const vista = new Vista();
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
      const s = game.state;
      const first = pick?.current ?? s.squad[s.controlled] ?? null;
      const ids = [first, ...s.squad.filter((id) => id !== first)].filter((id): id is string => !!id && !!s.roster[id]);
      const heroes: VistaHero[] = ids.slice(0, 3).map((id) => ({ id, mutation: s.roster[id]?.mutation ?? null }));
      const tall = h > w;
      vista.draw(ctx, w, h, (now - start) / 1000, {
        heroes,
        focusX: tall ? 0.5 : 0.3,
        focusY: tall ? 0.3 : 0.5,
        reduceMotion: s.settings.reduceMotion,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [game, pick]);
  return <canvas ref={ref} className="vista" />;
}
