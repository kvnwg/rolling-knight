/**
 * The app: the home screen (the camp's vista behind frosted panels) or the dungeon (the game canvas
 * with its HUD), and on top of either the sheets (hero detail, settings, luck), the big moments
 * (full-screen reveals, banners, toasts) and the offline report. The game runs every animation frame;
 * the React UI re-renders ten times a second.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx } from '../audio/sfx';
import type { CoreEvent } from '../core/events';
import { knightDef } from '../core/knights';
import { RARITY_COLOR } from '../core/rarity';
import { devGame } from '../dev';
import { createControls } from '../input/input';
import { Renderer } from '../render/renderer';
import { Chunky, HeroArt, type Grad } from './common';
import { DungeonHud } from './DungeonHud';
import { fmt, secs } from './format';
import { Home } from './Home';
import { HeroDetail, LuckSheet, SettingsSheet, type HomeTab } from './panels';
import { Reveal, type RevealItem } from './fx/Reveal';
import { setFxSound } from './fx/fxSound';
import type { SoundName } from '../audio/sfx';
import { uiSound } from './sound';
import { VistaCanvas } from './VistaCanvas';

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
  grad: Grad;
}

let nextId = 1;

/** CSS px per art pixel for the UI: about 180 art pixels across a phone, capped for big screens. */
function uiPx(): number {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const raw = Math.min(w, h * 0.62) / 180;
  return Math.max(2, Math.min(4, Math.round(raw * 2) / 2));
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useMemo(() => devGame(), []);
  const ctl = useMemo(() => createControls(), []);
  const [, setTick] = useState(0);
  const [tab, setTab] = useState<HomeTab>('camp');
  const [detail, setDetail] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [luck, setLuck] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [reveals, setReveals] = useState<RevealItem[]>([]);
  const [offline, setOffline] = useState(game.offline);
  const [wide, setWide] = useState(false);
  const revealRef = useRef(reveals);
  revealRef.current = reveals;
  const sheetOpen = detail !== null || settings || luck;
  const sheetRef = useRef(sheetOpen);
  sheetRef.current = sheetOpen;

  // The UI's pixel size and layout.
  useEffect(() => {
    const set = () => {
      document.documentElement.style.setProperty('--px', `${uiPx()}px`);
      // The reveal and reel effects measure in --u (the same art pixel).
      document.documentElement.style.setProperty('--u', `${uiPx()}px`);
      setWide(window.innerWidth >= 900 && window.innerWidth > window.innerHeight);
    };
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);

  // The reveal's own moments (heartbeats, the odds slamming down, the stamp) play through the sound
  // effects; the reels' spin sounds come from sfx.event, which schedules them from the spin itself.
  useEffect(() => {
    const own = new Set(['heartbeat', 'revealBig', 'revealHuge', 'revealInsane', 'revealHyper', 'stamp']);
    setFxSound((name, level) => {
      if (own.has(name)) sfx.play(name as SoundName, level ?? 0);
    });
  }, []);

  // Events: toasts, banners, reveals, sounds.
  useEffect(() => {
    const toast = (t: Omit<Toast, 'id'>) => {
      const id = nextId++;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 3100);
    };
    const show = (b: Omit<Banner, 'id'>) => {
      const id = nextId++;
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
            toast({ text: def.name, color: RARITY_COLOR[e.rarity], knightId: e.knightId });
          } else if (e.result.mutationUp) {
            toast({ text: `${def.name} mutated: ${e.mutation!.toUpperCase()}`, color: '#d8a8ff', knightId: e.knightId });
          }
          break;
        }
        case 'floorStart':
          if (game.inDungeon) show({ title: e.boss ? `BOSS FLOOR ${e.floor}` : `FLOOR ${e.floor}`, sub: e.biome, grad: e.boss ? 'red' : 'gold' });
          break;
        case 'floorClear':
          toast({ text: 'Floor cleared! The portal is open.', color: '#c8a8ff' });
          break;
        case 'bossDown':
          show({ title: 'BOSS DEFEATED', sub: e.first && game.state.rebirths > 0 ? '+1 Sigil' : 'Checkpoint reached', grad: 'gold' });
          break;
        case 'wipe':
          show({ title: 'SQUAD DOWN', sub: `Back to floor ${e.back}`, grad: 'red' });
          break;
        case 'potion':
          toast({ text: `Luck Potion: luck ×2 for ${secs(e.seconds)}`, color: '#8af07a' });
          break;
        case 'rebirth':
          show({ title: `REBIRTH ${e.count}`, sub: 'Luck, gold and power up for good', grad: 'gold' });
          setTab('camp');
          break;
        case 'toast':
          toast({ text: e.text, color: e.tone === 'bad' ? '#ff7a6b' : e.tone === 'gold' ? '#ffcf4a' : undefined });
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
    (window as unknown as { __renderer: Renderer }).__renderer = r;
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
      // A reveal pauses the fight (the altar keeps its own pace); a sheet hands your knight to Auto.
      game.paused = revealRef.current.length > 0;
      if (w) {
        w.auto = game.state.settings.autoPlay || sheetRef.current;
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
      if (game.inDungeon) r.render(game, game.paused ? 0 : dt);
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
      if (k === 'escape') {
        if (sheetRef.current) {
          setDetail(null);
          setSettings(false);
          setLuck(false);
        } else if (game.inDungeon) game.leaveDungeon();
      }
      if (k === 'enter' && !game.inDungeon && !sheetRef.current) game.enterDungeon();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);

  const inDungeon = game.inDungeon;
  return (
    <>
      <canvas ref={canvasRef} className="game" data-play="1" style={{ visibility: inDungeon ? 'visible' : 'hidden' }} />
      {!inDungeon && <VistaCanvas game={game} wide={wide} />}
      {inDungeon ? (
        <DungeonHud
          game={game}
          controls={ctl.controls}
          press={ctl.press}
          onCamp={() => game.leaveDungeon()}
          onSettings={() => setSettings(true)}
          onLuck={() => setLuck(true)}
          onAltar={() => (game.leaveDungeon(), setTab('summon'))}
        />
      ) : (
        <Home game={game} tab={tab} setTab={setTab} wide={wide} onOpen={setDetail} onSettings={() => setSettings(true)} onLuck={() => setLuck(true)} />
      )}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast glass outlined" style={{ ['--tc' as string]: t.color }}>
            {t.knightId && <HeroArt id={t.knightId} s={0.5} />}
            {t.knightId ? (
              <span>
                <span className="t-gold">NEW </span>
                <span className="who">{t.text}</span>
              </span>
            ) : (
              <span className="who">{t.text}</span>
            )}
          </div>
        ))}
      </div>
      {banner && (
        <div key={banner.id} className="banner">
          <Chunky text={banner.title} size={14} grad={banner.grad} />
          {banner.sub && <span className="sub glass outlined">{banner.sub}</span>}
        </div>
      )}
      {detail && <HeroDetail game={game} id={detail} onClose={() => setDetail(null)} />}
      {settings && <SettingsSheet game={game} onClose={() => setSettings(false)} />}
      {luck && <LuckSheet game={game} onClose={() => setLuck(false)} />}
      {reveals.length > 0 && <Reveal key={reveals.length + ':' + reveals[0].knightId} item={reveals[0]} calm={game.state.settings.reduceMotion} onDone={() => (uiSound('tap'), setReveals((r) => r.slice(1)))} />}
      {offline && (
        <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && setOffline(null)}>
          <div className="sheet">
            <div className="hero-banner">
              <Chunky text="WELCOME BACK" size={10} grad="gold" />
              <p className="lead">
                {secs(offline.seconds)} away. The altar rolled {offline.rolls} times and your squad brought back {fmt(offline.gold)} gold.
              </p>
            </div>
            {offline.kept.length > 0 && (
              <div className="heroes-grid">
                {offline.kept.slice(0, 12).map((k, i) => (
                  <div key={i} className="card hero-card" style={{ ['--rc' as string]: RARITY_COLOR[k.rarity] }}>
                    <div className="art">
                      <HeroArt id={k.knightId} mutation={k.mutation} />
                    </div>
                    <div className="rar-strip" />
                    <div className="name">{knightDef(k.knightId).name}</div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn gold big" onClick={() => setOffline(null)}>
              COLLECT
            </button>
          </div>
        </div>
      )}
    </>
  );
}
