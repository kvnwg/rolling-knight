/**
 * The app: the hub (you walk your knight among the keepers; talk to one to open their counter) or the
 * dungeon (the fight, with its HUD), both drawn on the game canvas; who you play as when the game
 * opens; and on top the sheets (a keeper's counter, hero detail, settings, luck), the big moments
 * (full-screen reveals, banners, toasts) and the offline report. In the dungeon only settings and the
 * luck card open: changing your squad or spending means going back up (or falling). The game runs
 * every animation frame; the React UI re-renders ten times a second.
 */
import { RUN_ITEMS } from '../core/runItems';
import { useEffect, useMemo, useRef, useState } from 'react';
import { music } from '../audio/music';
import { rainSound } from '../audio/rain';
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
import { KnightTile } from './KnightCard';
import { HeroDetail, LuckSheet, SettingsSheet } from './panels';
import { hubLayout, type HubStation } from '../world/hubWorld';
import type { Npc } from '../world/npcs';
import { DialogBox } from './Dialog';
import { Reveal, type RevealItem } from './fx/Reveal';
import { setFxSound } from './fx/fxSound';
import type { SoundName } from '../audio/sfx';
import { uiSound } from './sound';
import { rebirthPitch } from './RebirthPill';
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

/**
 * CSS px per art pixel for the UI: about 130 art pixels across a phone (so text and buttons are big
 * enough to read and tap: 3 CSS px a pixel on a 393 px wide phone), about 180 on a desktop's short
 * side, capped for big screens.
 */
function uiPx(): number {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const phone = Math.min(w, h) < 600;
  const raw = phone ? Math.min(w, h * 0.62) / 130 : Math.min(w, h * 0.62) / 180;
  return Math.max(2, Math.min(4, Math.round(raw * 2) / 2));
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useMemo(() => devGame(), []);
  // At the hub a drag anywhere walks; in a fight the right of the screen is for the buttons.
  const ctl = useMemo(() => createControls(undefined, () => !game.inDungeon), [game]);
  const [, setTick] = useState(0);
  const [station, setStation] = useState<HubStation | null>(null);
  const stationRef = useRef(station);
  stationRef.current = station;
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
      const altar = hubLayout().stations.find((x) => x.id === 'altar');
      if (altar) setStation(altar);
    }
  }, [game]);

  // The UI's pixel size and layout.
  useEffect(() => {
    const set = () => {
      document.documentElement.style.setProperty('--px', `${uiPx()}px`);
      // The reveal and reel effects measure in --u (the same art pixel).
      document.documentElement.style.setProperty('--u', `${uiPx()}px`);
      // The corner altar: smaller on a narrow screen, where it would cover the view; much bigger on a
      // desktop's wide screen, where there's room for it (in whole device pixels, so it stays crisp).
      const narrow = window.innerWidth < 600;
      const desk = window.innerWidth >= 900 && window.innerWidth > window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      const miniU = narrow ? Math.max(1.25, Math.round(uiPx() * 0.5 * dpr) / dpr) : desk ? Math.round(uiPx() * 1.7 * dpr) / dpr : uiPx();
      document.documentElement.style.setProperty('--mini-u', `${miniU}px`);
      // On a desktop the corner altar is as wide as the skill reel under it (46 art px; its frame less a
      // pixel of padding each side), whatever its reel count, the two on one line down the right side;
      // on a phone it keeps its own small size.
      document.documentElement.style.setProperty('--mini-w', desk ? `${44 * uiPx()}px` : '0px');
      // The dungeon HUD on a phone: about 70% of the UI's pixel (less on a short screen), in whole
      // device pixels; its text comes down less, never under about 10 px.
      const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
      const k = window.innerHeight < 680 ? 0.62 : 0.7;
      const hudPx = phone ? Math.max(1.5, Math.round(uiPx() * k * dpr) / dpr) : uiPx();
      const hudFpx = phone ? Math.max(hudPx, Math.round(uiPx() * 0.82 * dpr) / dpr) : uiPx();
      document.documentElement.style.setProperty('--hud-px', `${hudPx}px`);
      document.documentElement.style.setProperty('--hud-fpx', `${hudFpx}px`);
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
          if (e.drama) {
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
          toast({ text: 'Floor cleared!', color: '#c8a8ff' });
          break;
        case 'portalOpen':
          toast({ text: 'The way down is open!', color: '#c8a8ff' });
          break;
        case 'bossDown':
          show({ title: 'BOSS DEFEATED', sub: e.first && game.state.rebirths > 0 ? '+1 Sigil' : undefined, grad: 'gold' });
          break;
        case 'bought':
          toast({ text: `Bought ${RUN_ITEMS[e.item].name}: ${RUN_ITEMS[e.item].short.toLowerCase()}`, color: '#ffcf4a' });
          break;
        case 'checkpoint':
          toast({ text: `Checkpoint: floor ${e.floor} saved`, color: '#ffcf4a' });
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
        case 'rebirthReady':
          // The moment a rebirth opens up: a fanfare, the call, and what it brings.
          uiSound('rebirth');
          show({ title: 'REBIRTH READY!', sub: 'At the Shrine: start over stronger, for good', grad: 'gold' });
          toast({ text: rebirthPitch(game.state), color: '#ffcf4a' });
          break;
        case 'toast':
          toast({ text: e.text, color: e.tone === 'bad' ? '#ff7a6b' : e.tone === 'gold' ? '#ffcf4a' : undefined });
          break;
        case 'clink':
          // A shot cut out of the air: the shield's clang, up high and short (brighter when sent back).
          sfx.fire('knight_block', { x: e.x, y: e.y, pitch: e.reflect ? 2.1 : 1.7, gain: e.mine ? 0.55 : 0.32, level: 0.2 });
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
    let frameN = 0;
    let skipDt = 0;
    let wasIn = !game.inDungeon;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      const c = ctl.controls;
      const w = game.inDungeon ? game.world : game.hub;
      rainSound.set(game.inDungeon && game.world ? game.world.sky.rain : 0);
      // Walking off at the hub stays there (no auto return).
      if (!game.inDungeon && game.autoReturnT > 0 && (c.mx || c.my)) game.autoReturnT = 0;
      if (game.inDungeon !== wasIn) {
        wasIn = game.inDungeon;
        if (!wasIn) music.setScene('camp');
      }
      // A reveal pauses the fight (the altar keeps its own pace). Auto battle (the setting) plays your
      // knight outright in a fight: it moves, dodges, fights and goes down when the floor is done;
      // steering or attacking yourself takes over for as long as you do. A sheet open only aims and
      // attacks for you. The dev bot (?auto, the sim) never lets go.
      game.paused = revealRef.current.length > 0 || talkRef.current !== null;
      if (w) {
        const autoBattle = game.inDungeon && game.state.settings.autoPlay && !(c.mx || c.my || c.attack);
        w.auto = game.state.settings.autoPlay || sheetRef.current;
        w.bot = game.bot || autoBattle;
        // A counter or a sheet open at the hub holds your knight still.
        const hold = !game.inDungeon && sheetRef.current;
        w.input.mx = hold ? 0 : c.mx;
        w.input.my = hold ? 0 : c.my;
        if (c.dodge) w.input.dodge = true;
        if (c.special) w.input.special = true;
        // Attacking: held, toward the mouse; on touch the Attack button auto-aims, or aims the way
        // it's dragged (world/aim.ts).
        const fight = game.inDungeon && !hold;
        w.input.attack = fight && c.attack;
        const aim = fight && c.aim ? r.screenToWorld(c.aim.x, c.aim.y) : null;
        w.input.aimX = aim ? aim.x : null;
        w.input.aimY = aim ? aim.y : null;
        w.input.aimDx = fight && c.aimDir ? c.aimDir.x : null;
        w.input.aimDy = fight && c.aimDir ? c.aimDir.y : null;
        // The crosshair, where the mouse is over the fight (the pointer hides there: .aiming).
        r.cursor = fight && !w.bot && c.aim && c.overPlay ? c.aim : null;
      } else r.cursor = null;
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
      // The fight's sounds, from what the update just did (before the renderer takes its effects).
      sfx.world(game.inDungeon ? game.world : null);
      // A keeper's screen covers the hub (all of it on a phone; on a wide screen it shows blurred
      // either side): draw the hub a quarter as often underneath, with the time that went by.
      skipDt += dt;
      if (!stationRef.current || game.inDungeon || ++frameN % 4 === 0) {
        r.render(game, game.paused ? 0 : skipDt, game.inDungeon ? game.world : game.hub);
        skipDt = 0;
      }
      // What's drawn over the canvas in step with it (the spell slam), from this very frame.
      game.frameDrawn();
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
        // (A keeper's own overlays, the upgrade map and the details popups, take Esc first.)
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
      if ((k === 'f' || k === 'enter') && game.inDungeon && !sheetRef.current && !talkRef.current && !e.repeat) {
        // At a merchant's ware: buy it.
        const ware = game.world?.nearWare();
        if (ware) {
          uiSound(game.buyWare(ware) === 'ok' ? 'buy' : 'lockTap');
          return;
        }
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
  // In a fight you steer with the mouse, the game's crosshair stands in for the pointer.
  const aiming = inDungeon && !game.bot && !sheetOpen && !talking;
  return (
    <>
      <canvas ref={canvasRef} className={aiming ? 'game aiming' : 'game'} data-play="1" />
      {choosing && <VistaCanvas game={game} wide={wide} pick={csPick} />}
      {inDungeon ? (
        <DungeonHud
          game={game}
          controls={ctl.controls}
          press={ctl.press}
          hold={ctl.hold}
          onCamp={() => game.leaveDungeon()}
          onRebirth={() => {
            // Back to camp, the Shrine's screen open there.
            game.leaveDungeon();
            const shrine = hubLayout().stations.find((x) => x.id === 'rebirth');
            if (shrine) setStation(shrine);
          }}
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
                  <KnightTile
                    key={i}
                    id={k.knightId}
                    mutation={k.mutation}
                    rarity={k.rarity}
                    name={knightDef(k.knightId).name}
                    top={k.isNew ? <span className="ktag new">NEW</span> : undefined}
                    tl={k.isNew ? undefined : <span className="ktag spare num" title="Already yours: it turned into gold">GOLD</span>}
                  />
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
