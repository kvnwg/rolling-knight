/**
 * A keeper's scene across the top of their screen (render/art/keepers/scenes.ts), painted as wide as
 * the screen at a whole number of screen pixels per art pixel (the UI's own pixel, rounded to the
 * device's pixels, so every art pixel is the same size), lit by light.ts. The lamps flicker a little
 * and the keeper blinks now and then (not with Reduce motion). Paintings are kept, so opening a
 * keeper again is instant.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { lightLayer } from '../../render/art/keepers/light';
import { paintKeeperScene, type SceneArt } from '../../render/art/keepers/scenes';
import type { StationId } from '../../world/hubWorld';
import s from './keeper.module.css';

interface Fit {
  /** Art pixels across and down. */
  w: number;
  h: number;
  /** CSS pixels per art pixel (a whole number of device pixels). */
  css: number;
  /** The canvas's left edge in the frame (CSS px, on the device's pixel grid). */
  left: number;
}

const painted = new Map<string, SceneArt>();
function sceneFor(id: StationId, w: number, h: number): SceneArt {
  const key = `${id}|${w}|${h}`;
  let a = painted.get(key);
  if (!a) {
    a = paintKeeperScene(id, w, h);
    if (painted.size > 12) painted.delete(painted.keys().next().value!);
    painted.set(key, a);
  }
  return a;
}

/** The flicker's steps: how far down each light that flickers burns, frame by frame. */
const FLICKER = [0, 0.35, 0.1, 0.55, 0.2, 0.05, 0.4, 0.15];

export function SceneView({ id, calm, title, children }: { id: StationId; calm: boolean; title?: string; children?: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fit, setFit] = useState<Fit | null>(null);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 2;
      const dpr = window.devicePixelRatio || 1;
      // A short screen (a phone in the Claude app, a small phone) draws the scene with smaller art
      // pixels, so the whole keeper (hat and all) fits in under a quarter of its height and the
      // counter's cards below get the room; otherwise the UI's own pixel.
      const MIN_H = 86;
      const short = window.innerHeight < 800;
      const fitK = short ? Math.floor((window.innerHeight * 0.24 * dpr) / MIN_H) : Infinity;
      const k = Math.max(1, Math.min(Math.round(px * dpr), fitK));
      const css = k / dpr;
      const cw = el.clientWidth || window.innerWidth;
      let w = Math.ceil(cw / css);
      w += w % 2;
      // About 29% of a tall screen; never so short the keeper's hat is cut, nor taller than needed.
      const h = Math.max(MIN_H, Math.min(126, Math.round((window.innerHeight * (short ? 0.24 : 0.29)) / css)));
      const left = Math.round(((cw - w * css) / 2) * dpr) / dpr;
      setFit((f) => (f && f.w === w && f.h === h && f.css === css && f.left === left ? f : { w, h, css, left }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const [art, setArt] = useState<SceneArt | null>(null);
  useEffect(() => {
    if (!fit) return;
    // Painted after the screen is up, so it opens at once (the frame is dark for a moment).
    const t = window.setTimeout(() => setArt(sceneFor(id, fit.w, fit.h)), 0);
    return () => window.clearTimeout(t);
  }, [id, fit]);

  const frames = useMemo(() => new Map<string, ImageData>(), [art]);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !art) return;
    c.width = art.L.w;
    c.height = art.L.h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const draw = (step: number, shut: boolean) => {
      const key = `${step}|${shut}`;
      let img = frames.get(key);
      if (!img) {
        // A blink: the lids painted over the eyes (and any glow in them put out) for this frame only.
        const L = art.L;
        const saved: Array<[number, number, number, number, number, number]> = [];
        if (shut) {
          for (const [x, y, col] of art.blink) {
            const i = ((y - L.y0) * L.w + (x - L.x0)) * 4;
            if (i < 0 || i >= L.buf.px.length) continue;
            saved.push([i, L.buf.px[i], L.buf.px[i + 1], L.buf.px[i + 2], L.buf.px[i + 3], L.glow.px[i + 3]]);
            L.px(x, y, col);
            L.glow.px[i + 3] = 0;
          }
        }
        const lit = lightLayer(L, { ambient: art.ambient, bloom: art.bloom, vignette: art.vignette, flicker: FLICKER[step] });
        for (const [i, r, g, b, a, ga] of saved) {
          L.buf.px[i] = r;
          L.buf.px[i + 1] = g;
          L.buf.px[i + 2] = b;
          L.buf.px[i + 3] = a;
          L.glow.px[i + 3] = ga;
        }
        img = new ImageData(lit, art.L.w, art.L.h);
        frames.set(key, img);
      }
      ctx.putImageData(img, 0, 0);
    };
    draw(0, false);
    if (calm) return;
    let step = 0;
    let n = 0;
    let nextBlink = 18 + Math.floor(Math.random() * 20);
    const t = window.setInterval(() => {
      n++;
      step = (step + 1) % FLICKER.length;
      const shut = art.blink.length > 0 && n >= nextBlink && n < nextBlink + 1;
      if (n > nextBlink) nextBlink = n + 22 + Math.floor(Math.random() * 30);
      draw(step, shut);
    }, 140);
    return () => window.clearInterval(t);
  }, [art, calm, frames]);

  return (
    <div className={s.scene} ref={frameRef} style={fit ? { height: fit.h * fit.css } : { height: 'calc(118 * var(--px))' }} title={title}>
      {fit && <canvas ref={canvasRef} style={{ left: fit.left, width: fit.w * fit.css, height: fit.h * fit.css }} aria-hidden />}
      {children}
    </div>
  );
}
