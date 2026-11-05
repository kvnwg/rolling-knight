/**
 * The app: the hub (you walk your knight among the keepers; talk to one to open their counter) or the
 * dungeon (the fight, with its HUD), both drawn on the game canvas; who you play as when the game
 * opens; and on top the sheets (a keeper's counter, hero detail, settings, luck), the big moments
 * (full-screen reveals, banners, toasts) and the offline report. In the dungeon only settings and the
 * luck card open: changing your squad or spending means going back up (or falling). The game runs
 * every animation frame; the React UI re-renders ten times a second.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { music } from '../audio/music';
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
import { CharacterSelect, HubHud, StationSheet } from './Hub';
import { HeroDetail, LuckSheet, SettingsSheet } from './panels';
import { placeholderHub, type HubStation } from '../world/hubWorld';
import type { Npc } from '../world/npcs';
import { DialogBox } from './Dialog';
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
  const [station, setStation] = useState<HubStation | null>(null);
  const [talking, setTalking] = useState<Npc | null>(null);
  const talkRef = useRef(talking);
  talkRef.current = talking;
  const [picked, setPicked] = useState(game.inDungeon || location.search.includes('hub'));
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
  const csPick = useRef<string | null>(null);
  const choosing = !picked && !game.inDungeon && Object.keys(game.state.roster).length > 0 && reveals.length === 0 && station === null;
  const sheetOpen = detail !== null || settings || luck || station !== null || choosing;
  const sheetRef = useRef(sheetOpen);
  sheetRef.current = sheetOpen;

  // A brand-new game opens at the altar, so you watch your first knights roll in.
  useEffect(() => {
    if (Object.keys(game.state.roster).length === 0 && !game.inDungeon) {
      const altar = placeholderHub().stations.find((x) => x.id === 'altar');
      if (altar) setStation(altar);
    }
  }, [game]);

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
          if (game.inDungeon) {
            show({ title: e.boss ? `BOSS FLOOR ${e.floor}` : `FLOOR ${e.floor}`, sub: e.biome, grad: e.boss ? 'red' : 'gold' });
            const scene = e.boss ? 'boss' : music.sceneFor(e.biome);
            if (scene) music.setScene(scene);
          }
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
          setStation(null);
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
    let wasIn = !game.inDungeon;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const c = ctl.controls;
      const w = game.inDungeon ? game.world : game.hub;
      // Walking off at the hub stays there (no auto return).
      if (!game.inDungeon && game.autoReturnT > 0 && (c.mx || c.my)) game.autoReturnT = 0;
      if (game.inDungeon !== wasIn) {
        wasIn = game.inDungeon;
        if (!wasIn) music.setScene('camp');
      }
      // A reveal pauses the fight (the altar keeps its own pace); a sheet hands your knight to Auto.
      game.paused = revealRef.current.length > 0 || talkRef.current !== null;
      if (w) {
        w.auto = game.state.settings.autoPlay || sheetRef.current;
        // A counter or a sheet open at the hub holds your knight still.
        const hold = !game.inDungeon && sheetRef.current;
        w.input.mx = hold ? 0 : c.mx;
        w.input.my = hold ? 0 : c.my;
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
      r.render(game, game.paused ? 0 : dt, game.inDungeon ? game.world : game.hub);
      hudT += dt;
      if (hudT > 0.1) {
        hudT = 0;
        sfx.setVolume(game.state.settings.sfx);
        music.setVolume(game.state.settings.music);
        setTick((t) => t + 1);
      }
    };
    raf = requestAnimationFrame(loop);
    const save = () => game.save();
    const vis = () => document.visibilityState === 'hidden' && game.save();
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', vis);
    const unlock = () => {
      sfx.unlock(game.state.settings.sfx);
      music.unlock();
      music.setVolume(game.state.settings.music);
      if (!game.inDungeon) music.setScene('camp');
    };
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
          setStation(null);
        } else if (game.inDungeon) game.leaveDungeon();
      }
      // At the hub, E or Enter talks to the keeper you're standing by; in the dungeon (where E is
      // your skill) it's Enter or F.
      if ((k === 'e' || k === 'enter') && !game.inDungeon && !sheetRef.current) {
        const near = game.hub?.nearStation();
        if (near) {
          uiSound('open');
          setStation(near);
        }
      }
      if ((k === 'f' || k === 'enter') && game.inDungeon && !sheetRef.current && !talkRef.current) {
        const npc = game.world?.nearNpc();
        if (npc) {
          uiSound('open');
          setTalking(npc);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);

  const inDungeon = game.inDungeon;
  return (
    <>
      <canvas ref={canvasRef} className="game" data-play="1" />
      {choosing && <VistaCanvas game={game} wide={wide} pick={csPick} />}
      {inDungeon ? (
        <DungeonHud
          game={game}
          controls={ctl.controls}
          press={ctl.press}
          onCamp={() => game.leaveDungeon()}
          onSettings={() => setSettings(true)}
          onLuck={() => setLuck(true)}
          onAltar={() => setLuck(true)}
          onTalk={(n) => (uiSound('open'), setTalking(n))}
        />
      ) : (
        !choosing && <HubHud game={game} onTalk={setStation} onSettings={() => setSettings(true)} onLuck={() => setLuck(true)} />
      )}
      {!inDungeon && ctl.controls.stick.active && (
        <div className="stick" style={{ left: ctl.controls.stick.ox, top: ctl.controls.stick.oy }}>
          <i style={{ left: `calc(50% + ${ctl.controls.stick.x - ctl.controls.stick.ox}px)`, top: `calc(50% + ${ctl.controls.stick.y - ctl.controls.stick.oy}px)` }} />
        </div>
      )}
      {choosing && <CharacterSelect game={game} onSelect={(id) => (csPick.current = id)} onPick={() => setPicked(true)} />}
      {station && !inDungeon && <StationSheet game={game} station={station} onOpen={setDetail} onClose={() => setStation(null)} />}
      {talking && inDungeon && <DialogBox game={game} npc={talking} onClose={() => setTalking(null)} />}
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
