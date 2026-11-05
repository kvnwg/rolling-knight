/**
 * The app: the game canvas full screen, the HUD over it, the menus in a hanging wooden board, and the
 * big moments (full-screen reveals, banners, toasts). The game runs on every animation frame; the
 * HUD re-renders ten times a second.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CoreEvent } from '../core/events';
import { knightDef } from '../core/knights';
import { RARITY_COLOR, RARITY_NAME } from '../core/rarity';
import { devGame } from '../dev';
import { createControls } from '../input/input';
import { Renderer } from '../render/renderer';
import { sfx } from '../audio/sfx';
import { Hud } from './Hud';
import { Menu, type Tab } from './Menu';
import { Reveal, type RevealItem } from './Reveal';
import { uiUrl } from './icons';
import { fmt, secs } from './format';
import { KnightSprite } from './sprites';

export interface Toast {
  id: number;
  text: string;
  color?: string;
  knightId?: string;
}

export interface Banner {
  id: number;
  title: string;
  sub?: string;
  color?: string;
}

let toastId = 1;

function uiScale(): number {
  const s = Math.min(window.innerWidth, window.innerHeight);
  return Math.max(2, Math.min(4, Math.round((s / 260) * 2) / 2));
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useMemo(() => devGame(), []);
  const ctl = useMemo(() => createControls(), []);
  const [, setTick] = useState(0);
  const [tab, setTab] = useState<Tab | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [reveals, setReveals] = useState<RevealItem[]>([]);
  const [offline, setOffline] = useState(game.offline);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const revealRef = useRef(reveals);
  revealRef.current = reveals;

  // The pixel UI's art pieces and scale.
  useEffect(() => {
    const root = document.documentElement.style;
    const set = () => root.setProperty('--u', `${uiScale()}px`);
    set();
    root.setProperty('--board', `url(${uiUrl('board')})`);
    root.setProperty('--wood-fill', `url(${uiUrl('woodFill')})`);
    root.setProperty('--plank', `url(${uiUrl('plank')})`);
    root.setProperty('--parchment', `url(${uiUrl('parchment')})`);
    root.setProperty('--chains', `url(${uiUrl('chains')})`);
    root.setProperty('--btn', `url(${uiUrl('btnBlank')})`);
    root.setProperty('--btn-down', `url(${uiUrl('btnBlankDown')})`);
    root.setProperty('--bar-empty', `url(${uiUrl('barEmpty')})`);
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);

  // Events: toasts, banners, reveals, sounds.
  useEffect(() => {
    const toast = (t: Omit<Toast, 'id'>) => {
      const id = toastId++;
      setToasts((list) => [...list.slice(-4), { ...t, id }]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 3100);
    };
    const show = (b: Omit<Banner, 'id'>) => {
      const id = toastId++;
      setBanner({ ...b, id });
      setTimeout(() => setBanner((cur) => (cur?.id === id ? null : cur)), 2400);
    };
    return game.on((e: CoreEvent) => {
      sfx.event(e);
      switch (e.type) {
        case 'land': {
          const def = knightDef(e.knightId);
          if (e.drama || e.scripted === 'first' || e.scripted === 'beginner') {
            setReveals((r) => [...r, { knightId: e.knightId, rarity: e.rarity, mutation: e.mutation, oneIn: e.oneIn, drama: e.drama ?? 'big', isNew: e.result.kind === 'new', mult: e.mult, scripted: e.scripted }]);
          } else if (e.result.kind === 'new') {
            toast({ text: `NEW! ${def.name}`, color: RARITY_COLOR[e.rarity], knightId: e.knightId });
          } else if (e.result.mutationUp) {
            toast({ text: `${def.name} mutated: ${e.mutation!.toUpperCase()}!`, color: '#d8a8ff', knightId: e.knightId });
          }
          break;
        }
        case 'floorStart':
          show({ title: e.boss ? `BOSS FLOOR ${e.floor}` : `FLOOR ${e.floor}`, sub: e.biome, color: e.boss ? '#ff6a5a' : undefined });
          break;
        case 'floorClear':
          toast({ text: 'Floor cleared! The portal is open.', color: '#c8a8ff' });
          break;
        case 'bossDown':
          show({ title: 'BOSS DEFEATED!', sub: e.first && game.state.rebirths > 0 ? '+1 Sigil' : 'Checkpoint reached', color: '#ffd25a' });
          break;
        case 'wipe':
          show({ title: 'SQUAD DOWN', sub: `Back to floor ${e.back}`, color: '#ff6a5a' });
          break;
        case 'potion':
          toast({ text: `Luck Potion: luck ×2 for ${secs(e.seconds)}`, color: '#8af07a' });
          break;
        case 'rebirth':
          show({ title: `REBIRTH ${e.count}`, sub: 'Luck, gold and power up for good', color: '#ffd25a' });
          break;
        case 'toast':
          toast({ text: e.text, color: e.tone === 'bad' ? '#ff6a5a' : e.tone === 'gold' ? '#ffd25a' : undefined });
          break;
        default:
          break;
      }
    });
  }, [game]);

  // The loop.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const r = new Renderer(canvas);
    const onResize = () => r.resize();
    window.addEventListener('resize', onResize);
    let last = performance.now();
    let raf = 0;
    let hudT = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const c = ctl.controls;
      const w = game.world;
      // A reveal on screen pauses the fight (the altar keeps its own pace).
      game.paused = revealRef.current.length > 0;
      if (w) {
        w.auto = game.state.settings.autoPlay || tabRef.current !== null;
        w.input.mx = c.mx;
        w.input.my = c.my;
        if (c.dodge) w.input.dodge = true;
        if (c.special) w.input.special = true;
      }
      c.dodge = false;
      c.special = false;
      if (c.switchTo !== null) {
        game.switchTo(c.switchTo);
        c.switchTo = null;
      }
      if (c.toggleAuto) {
        game.setAuto(!game.state.settings.autoPlay);
        c.toggleAuto = false;
      }
      game.tick(dt);
      r.render(game, game.paused ? 0 : dt);
      hudT += dt;
      if (hudT > 0.1) {
        hudT = 0;
        setTick((t) => t + 1);
      }
    };
    raf = requestAnimationFrame(loop);
    const save = () => game.save();
    const vis = () => document.visibilityState === 'hidden' && game.save();
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', vis);
    const unlock = () => sfx.unlock(game.state.settings.sfx);
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', vis);
      ctl.dispose();
    };
  }, [game, ctl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape') setTab(null);
      if (k === 'r') setTab((t) => (t === 'altar' ? null : 'altar'));
      if (k === 'k') setTab((t) => (t === 'knights' ? null : 'knights'));
      if (k === 'u') setTab((t) => (t === 'upgrades' ? null : 'upgrades'));
      if (k === 'm' || k === 'tab') {
        e.preventDefault();
        setTab((t) => (t ? null : 'knights'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="game" data-play="1" />
      <Hud game={game} controls={ctl.controls} press={ctl.press} openTab={setTab} toasts={toasts} banner={banner} />
      {tab && <Menu game={game} tab={tab} setTab={setTab} />}
      {reveals.length > 0 && <Reveal item={reveals[0]} onDone={() => setReveals((r) => r.slice(1))} />}
      {offline && (
        <div className="popup" onClick={() => setOffline(null)}>
          <div className="board">
            <div className="chains" />
            <div className="inner body">
              <h2 style={{ margin: 0, color: 'var(--gold)' }}>While you were away</h2>
              <p>
                {secs(offline.seconds)} away. The altar rolled {offline.rolls} times and your squad brought back {fmt(offline.gold)} gold.
              </p>
              {offline.kept.length > 0 ? (
                <div className="row" style={{ justifyContent: 'center' }}>
                  {offline.kept.slice(0, 12).map((k, i) => (
                    <div key={i} className="card" style={{ ['--rc' as string]: RARITY_COLOR[k.rarity] }}>
                      <KnightSprite id={k.knightId} mutation={k.mutation} scale={1.4} />
                      <div className="rar" style={{ color: RARITY_COLOR[k.rarity] }}>
                        {RARITY_NAME[k.rarity]}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Nothing Epic or better this time.</p>
              )}
              <button className="wbtn gold">Collect</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
