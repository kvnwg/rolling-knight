/**
 * The title screen's backdrop: the squad's camp in a forest clearing at night (src/render/titleCamp),
 * painted on its own canvas behind the title. The knight you play stands nearest the fire, the rest
 * of the squad with them.
 */
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { Game } from '../game';
import { graphicsReset } from '../render/art/draw';
import { TitleCamp, type CampHero } from '../render/titleCamp';

/** `onReady`: called once, when the scene has been painted (it's built over the first frames, behind a plain dusk). */
export function VistaCanvas({ game, wide, pick, onReady }: { game: Game; wide: boolean; pick?: MutableRefObject<string | null>; onReady?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wideRef = useRef(wide);
  wideRef.current = wide;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    let vista = new TitleCamp();
    // A graphics reset wipes the scene's painted layers: it's painted again from nothing.
    const again = () => {
      graphicsReset();
      vista = new TitleCamp();
    };
    c.addEventListener('contextrestored', again);
    let raf = 0;
    let told = false;
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
      const heroes: CampHero[] = ids.slice(0, 3).map((id) => ({ id, mutation: s.roster[id]?.mutation ?? null }));
      // (A frame's timestamp can come a hair before `start`: never hand the scene a negative clock.)
      vista.draw(ctx, w, h, Math.max(0, (now - start) / 1000), {
        heroes,
        reduceMotion: s.settings.reduceMotion,
      });
      if (!told && vista.ready) {
        told = true;
        readyRef.current?.();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      c.removeEventListener('contextrestored', again);
    };
  }, [game, pick]);
  return <canvas ref={ref} className="vista" />;
}
