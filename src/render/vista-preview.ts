// Throwaway preview for the vista (deleted when done).
import { Vista } from './vista';
import { cloudSheet } from './vista-clouds';

const q = new URLSearchParams(location.search);
const fx = Number(q.get('fx') ?? 0.5);
const fy = Number(q.get('fy') ?? 0.3);
const fixedT = q.get('t');
const rm = q.get('rm') === '1';
const c = document.getElementById('c') as HTMLCanvasElement;
const ctx = c.getContext('2d')!;
const v = new Vista();
const heroes = (q.get('heroes') ?? 'legendary-blade,rare-cleric,epic-ranger').split(',').filter(Boolean).map((s) => {
  const [id, m] = s.split(':');
  return { id, mutation: (m || null) as 'gilded' | 'shadow' | 'radiant' | 'void' | null };
});
if (q.get('panel') === '1') {
  const el = document.getElementById('panel')!;
  el.style.display = 'block';
  if (fy < 0.45) Object.assign(el.style, { left: '8px', right: '8px', top: `${(fy * 2 - 0.05) * 100}vh`, bottom: '8px' });
  else Object.assign(el.style, { top: '8px', bottom: '8px', left: `${(fx * 2 + 0.02) * 100}vw`, right: '8px' });
}
const w0 = window as unknown as Record<string, unknown>;
const times: number[] = [];
function frame(now: number) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(innerWidth * dpr);
  const h = Math.round(innerHeight * dpr);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const t = fixedT ? Number(fixedT) : now / 1000;
  const t0 = performance.now();
  v.draw(ctx, w, h, t, { heroes, focusX: fx, focusY: fy, reduceMotion: rm });
  const dt = performance.now() - t0;
  if (w0.__vistaFirst === undefined) w0.__vistaFirst = dt;
  times.push(dt);
  if (times.length > 120) times.shift();
  w0.__vistaMs = dt;
  w0.__vistaAvg = times.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, times.length - 1);
  w0.__vistaFrames = ((w0.__vistaFrames as number) ?? 0) + 1;
  w0.__vistaReady = true;
  requestAnimationFrame(frame);
}
if (q.get('mode') === 'bench') {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(innerWidth * dpr);
  const h = Math.round(innerHeight * dpr);
  c.width = w;
  c.height = h;
  const res: number[] = [];
  const prof: Record<string, number[]> = {};
  const orig = console.log;
  console.log = (...a: unknown[]) => {
    if (a[0] === 'PROF') (prof[String(a[1])] ??= []).push(Number(a[2]));
  };
  for (let i = 0; i < 6; i++) {
    const t0 = performance.now();
    v.draw(ctx, w + (i % 2), h, 1, { heroes, focusX: fx, focusY: fy });
    res.push(performance.now() - t0);
  }
  console.log = orig;
  const mins = Object.entries(prof).map(([k, arr]) => `${k}=${Math.min(...arr).toFixed(1)}`).join(' | ');
  console.log('BENCH builds ms', res.map((x) => x.toFixed(0)).join(','), 'min', Math.min(...res).toFixed(0));
  console.log('BENCH stages', mins);
  w0.__vistaReady = true;
} else if (q.get('mode') === 'clouds') {
  c.style.width = 'auto';
  c.style.height = 'auto';
  cloudSheet(c);
  w0.__vistaReady = true;
} else requestAnimationFrame(frame);
