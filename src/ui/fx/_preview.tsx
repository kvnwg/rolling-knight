/** THROWAWAY dev preview for the altar (delete when done). */
import { createRoot } from 'react-dom/client';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import { knightId, type ClassId } from '../../core/knights';
import { oneInFor } from '../../core/luck';
import { newGame } from '../../core/newGame';
import type { Rarity } from '../../core/rarity';
import { comboSteps } from '../../core/roller';
import type { MutationId, RollDrama, Spin } from '../../core/state';
import type { Game } from '../../game';
import { AltarReels } from './AltarReels';
import { Altar } from './altar';

const ms: number[] = [];
(window as unknown as { __altarMs: number[] }).__altarMs = ms;
const orig = Altar.prototype.frame;
const live = new Map<Altar, Parameters<Altar['frame']>[1]>();
(window as unknown as { __bench: (n: number) => Record<string, number> }).__bench = (n: number) => {
  const out: Record<string, number> = {};
  for (const [al, sig] of live) {
    const t0 = performance.now();
    for (let k = 0; k < n; k++) orig.call(al, t0 + k * 16.7, sig);
    out[al.canvasEl.width > 100 ? 'big' : 'mini'] = +((performance.now() - t0) / n).toFixed(3);
  }
  return out;
};
Altar.prototype.frame = function (this: Altar, ...args: Parameters<Altar['frame']>) {
  live.set(this, args[1]);
  const t0 = performance.now();
  orig.apply(this, args);
  ms.push((performance.now() - t0) * (this.canvasEl.width > 100 ? 1 : -1));
  if (ms.length > 2000) ms.splice(0, 1000);
};

const q = new URLSearchParams(location.search);
const u = Number(q.get('u') ?? 2.5);
document.documentElement.style.setProperty('--u', `${u}px`);
document.body.style.margin = '0';
document.body.style.background = q.get('bg') ?? '#1d1422';
const CLS: ClassId[] = ['guardian', 'blade', 'ranger', 'cleric', 'arcanist', 'lancer'];

function makeSpin(id: number): Spin {
  const rars = (q.get('rar') ?? 'rare,common,uncommon').split(',') as Rarity[];
  const n = Number(q.get('n') ?? rars.length);
  const toks = (q.get('tok') ?? '').split(',').map((t) => (t ? t.split('.').map(Number) : []));
  const dramas = (q.get('drama') ?? '').split(',');
  const base = Number(q.get('base') ?? 2.6);
  const step = 0.6 + base;
  const stagger = Math.min(0.35, base * 0.12);
  const reels = Array.from({ length: n }, (_, i) => {
    const rarity = rars[i % rars.length];
    const tokens = toks[i] ?? [];
    const mutation = null as MutationId | null;
    return {
      knightId: knightId(rarity, CLS[(i + id) % 4]),
      rarity,
      cls: CLS[(i + id) % 4],
      mutation,
      tokens,
      landAt: base + i * stagger + tokens.length * step,
      landed: false,
      oneIn: oneInFor(rarity, mutation),
      drama: (dramas[i] || null) as RollDrama | null,
    };
  });
  return {
    id,
    reels,
    combos: comboSteps(reels.map((r) => r.tokens)),
    lucky: q.has('lucky'),
    golden: q.has('golden'),
    rigged: false,
    turbo: q.has('turbo'),
    luck: Number(q.get('luck') ?? 1),
    spinSeconds: Math.max(...reels.map((r) => r.landAt)),
    baseSpinSeconds: base,
    stepSeconds: step,
    restSeconds: 0.9,
    tease: Number(q.get('tease') ?? 0) as 0 | 1 | 2,
    landed: false,
  };
}

function App() {
  const state = newGame(1);
  state.roll.tutorial = 'done';
  state.settings.reduceMotion = q.has('calm');
  const game = { state, recent: [], luck: Number(q.get('luck') ?? 1) } as unknown as Game;
  let id = 1;
  let spin = makeSpin(id);
  let t0 = performance.now();
  const freeze = q.get('t');
  const loop = () => {
    requestAnimationFrame(loop);
    let t = freeze !== null ? Number(freeze) / 1000 : (performance.now() - t0) / 1000;
    if (t > spin.spinSeconds + spin.restSeconds && freeze === null && q.has('loop')) {
      spin = makeSpin(++id);
      t0 = performance.now();
      t = 0;
    }
    t = Math.min(t, spin.spinSeconds + spin.restSeconds);
    for (const r of spin.reels) if (t >= r.landAt) r.landed = true;
    state.roll.current = spin;
    state.roll.timer = t;
    (window as unknown as { __t: number }).__t = t * 1000;
  };
  requestAnimationFrame(loop);
  const w = Number(q.get('w') ?? 176) * u;
  return (
    <div style={{ padding: 30, display: 'flex', gap: 30, alignItems: 'flex-start' }}>
      <div style={{ width: w, flex: 'none' }}>
        <AltarReels game={game} variant="big" housing={q.has('plain') ? 'plain' : 'altar'} />
      </div>
      <div style={{ flex: 'none' }}>
        <AltarReels game={game} variant="mini" housing={q.has('plain') ? 'plain' : 'altar'} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
