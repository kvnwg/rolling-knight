/**
 * The keeper's own frame round their counter (render/art/keepers/frames.ts), painted to the paper's
 * exact size and laid over its border: a canvas the size of the panel plus the frame's overhang,
 * behind the tabs and over the paper's edge, that takes no clicks. Also the dress that goes with
 * it: the paper's tint and the lit tab's colours, as CSS variables for the screen.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { FRAME_OVER, keeperDress, paintKeeperFrame } from '../../render/art/keepers/frames';
import type { StationId } from '../../world/hubWorld';
import { tab } from '../skin';
import s from './keeper.module.css';

const dressed = new Map<StationId, CSSProperties>();

/** A speckled sheet of the keeper's paper, tiling (a data URL). */
function paperTile(c: readonly [string, string, string]): string {
  const n = 24;
  const cv = document.createElement('canvas');
  cv.width = n;
  cv.height = n;
  const g = cv.getContext('2d')!;
  g.fillStyle = c[0];
  g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // (The same speckle as the plain paper's: a few darker and lighter flecks.)
      let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + 3 * 982451653;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
      if (r < 0.08 || r > 0.94) {
        g.fillStyle = r < 0.08 ? c[1] : c[2];
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  return cv.toDataURL();
}

/** The screen's CSS variables for this keeper: their paper, the tab you're on and its lettering. */
export function keeperDressStyle(id: StationId): CSSProperties {
  let st = dressed.get(id);
  if (!st) {
    const d = keeperDress(id);
    st = {
      ['--kf-paper' as string]: `url(${paperTile(d.paper)})`,
      ['--kf-paper-fill' as string]: d.paper[0],
      ['--kf-tab-on' as string]: `url(${tab({ face: d.tab.face, hi: d.tab.hi, lo: d.tab.lo, lip: d.tab.lo, ink: d.tab.ink })})`,
      ['--kf-tab-text' as string]: d.tab.text,
    } as CSSProperties;
    dressed.set(id, st);
  }
  return st;
}

export function FrameArt({ id }: { id: StationId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState<{ w: number; h: number; px: number } | null>(null);

  useLayoutEffect(() => {
    const panel = ref.current?.parentElement;
    if (!panel) return;
    const measure = () => {
      const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 2;
      const w = Math.round(panel.offsetWidth / px);
      const h = Math.round(panel.offsetHeight / px);
      setBox((b) => (b && b.w === w && b.h === h && b.px === px ? b : { w, h, px }));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(panel);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || !box) return;
    const art = paintKeeperFrame(id, box.w, box.h);
    c.width = art.w;
    c.height = art.h;
    c.getContext('2d')!.putImageData(new ImageData(art.px, art.w, art.h), 0, 0);
  }, [id, box]);

  // Over the panel's border box, the overhang past it (the panel's padding box is the canvas's
  // containing block, so it's pulled out by the border and the overhang).
  return <canvas ref={ref} className={s.frameArt} style={{ ['--over' as string]: FRAME_OVER } as CSSProperties} aria-hidden />;
}
