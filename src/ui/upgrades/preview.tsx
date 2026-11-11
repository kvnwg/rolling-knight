/**
 * The upgrade map on its own page, for working on it and for screenshots (dev server only):
 *   http://localhost:5173/upgrades-preview.html?floor=8&squad=epic&classes=blade,ranger,cleric&camp&gold=500000
 * Takes the game's dev flags (src/dev.ts), plus `up=luck:5,spinSpeed:3` to own tiers and `sel=spinSpeed:2`
 * to select a hex. The game runs underneath, so gold and luck move as they would.
 */
import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import '../styles.css';
import { installSkin } from '../skin';
import { devGame } from '../../dev';
import { UpgradeMap, focusUpgradeHex } from './UpgradeMap';
import { sfx } from '../../audio/sfx';
import { applyLayout } from '../layout';

function Preview() {
  const game = useMemo(() => {
    const g = devGame();
    const q = new URLSearchParams(location.search);
    for (const pair of (q.get('up') ?? '').split(',').filter(Boolean)) {
      const [id, n] = pair.split(':');
      g.state.upgrades[id] = Number(n);
    }
    if (q.get('sel')) focusUpgradeHex(q.get('sel')!);
    return g;
  }, []);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const set = () => void applyLayout();
    set();
    window.addEventListener('resize', set);
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      game.tick(Math.min(0.1, (now - last) / 1000));
      last = now;
    };
    raf = requestAnimationFrame(loop);
    const unlock = () => sfx.unlock(game.state.settings.sfx);
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', set);
    };
  }, [game]);
  return open ? (
    <UpgradeMap game={game} onClose={() => setOpen(false)} />
  ) : (
    <button className="btn gold big" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} onClick={() => setOpen(true)}>
      UPGRADES
    </button>
  );
}

installSkin();
applyLayout();
createRoot(document.getElementById('root')!).render(<Preview />);
