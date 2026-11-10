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
import { secs } from './format';
import { HubHud, StationSheet, TitleScreen } from './Hub';
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
import { Tutorial } from './Tutorial';
import { WelcomeBack } from './WelcomeBack';
import { FloorRewind } from './fx/FloorRewind';
import { CampAsk } from './CampAsk';
import { campFloor } from '../core/newGame';

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
  /** A new game's opening: from black onto the Oracle's sealed altar (the tutorial's line waits for it). */
  const [intro, setIntro] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [luck, setLuck] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  // CAMP asks first (leaving costs floors): the fight waits while it's up.
  const [campAsk, setCampAsk] = useState(false);
  const campAskRef = useRef(campAsk);
  campAskRef.current = campAsk;
  // The floor ticking back on the way to camp (one at a time: a new trip replaces it).
  const [rewind, setRewind] = useState<{ id: number; from: number; back: number; revived: number } | null>(null);
  const [reveals, setReveals] = useState<RevealItem[]>([]);
  const [offline, setOffline] = useState(game.offline);
  const [wide, setWide] = useState(false);
  const revealRef = useRef(reveals);
  revealRef.current = reveals;
  const csPick = useRef<string | null>(null);
  // (The tutorial points at spots in the world: it needs the camera.)
  const rendRef = useRef<Renderer | null>(null);
  // The title screen (PLAY over the camp at dusk) until the player starts.
  const choosing = !picked && !game.inDungeon && reveals.length === 0 && station === null;
  const sheetOpen = detail !== null || settings || luck || station !== null || choosing;
  const sheetRef = useRef(sheetOpen);
  sheetRef.current = sheetOpen;
  // The world waits on the title screen (no knights roll in behind it before PLAY).
  const titleRef = useRef(choosing);
  titleRef.current = choosing;

  // (A brand-new game opens on the title too; its PLAY goes to the altar, to watch the first knights roll in.)

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
        case 'stolen':
          // (The theft that turns her needs no toast: she says it herself, and her bar follows.)
          if (!e.first) toast({ text: `Taken: ${RUN_ITEMS[e.item].name}, ${RUN_ITEMS[e.item].short.toLowerCase()}`, color: '#ffcf4a' });
          break;
        case 'merchantFury':
          // She comes for you like a boss, to the boss's music until she's down (or you've left). (No
          // banner: it would cover her vaulting the counter, and her bar and her shouting say it all.)
          music.setScene('boss');
          break;
        case 'merchantDown': {
          show({ title: 'MERCHANT DOWN', sub: 'Her stall is yours', grad: 'gold' });
          // (What it cost you, once the banner has gone: the two would sit on each other on a phone.)
          const world = game.world;
          setTimeout(() => game.world === world && game.inDungeon && toast({ text: 'Merchants will remember: +50% this run', color: '#ff7a6b' }), 2600);
          // (The victory sting takes the music home; without it, back it goes anyway.)
          const calm = music.sceneFor(game.biome.name);
          if (calm) setTimeout(() => game.world === world && game.inDungeon && music.current() === 'boss' && music.setScene(calm), 5000);
          break;
        }
        case 'checkpoint':
          toast({ text: `Checkpoint: floor ${e.floor} saved`, color: '#ffcf4a' });
          break;
        case 'wipe':
          show({ title: 'SQUAD DOWN', sub: `Back to floor ${e.back}`, grad: 'red' });
          break;
        case 'camp':
          // (Nothing to show when the run keeps its floor and nobody had fallen.)
          if (e.from > e.back || e.revived > 0) setRewind({ id: nextId++, from: e.from, back: e.back, revived: e.revived });
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
    rendRef.current = r;
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
      game.paused = revealRef.current.length > 0 || talkRef.current !== null || titleRef.current || campAskRef.current;
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
          // (The Oracle's sealed altar stays: a new game's first screen, until the seal is broken.)
          setStation((st) => (st?.id === 'altar' && game.state.roll.sealed ? st : null));
        } else if (game.inDungeon) {
          // Esc asks to leave, and Esc again takes the question back.
          uiSound(campAskRef.current ? 'close' : 'open');
          setCampAsk(!campAskRef.current);
        }
      }
      if (campAskRef.current && k === 'enter') {
        setCampAsk(false);
        if (game.inDungeon) game.leaveDungeon();
        return;
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
        // At a merchant's ware: buy it (or, at a stall you've robbed, where nobody's selling, take it).
        const ware = game.world?.nearWare();
        if (ware) {
          const r = game.world?.fury ? game.reachForWare(ware) : game.buyWare(ware);
          uiSound(r === 'ok' ? 'buy' : 'lockTap');
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

  // G at a merchant's ware: steal it (the first press asks, the second does it; world/thief.ts).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'g' || e.repeat || !game.inDungeon || sheetRef.current || talkRef.current) return;
      const ware = game.world?.nearWare();
      if (!ware) return;
      const r = game.reachForWare(ware);
      uiSound(r === 'ok' ? 'buy' : r === 'ask' ? 'tap' : 'lockTap');
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
          onCamp={() => setCampAsk(true)}
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
      {choosing && (
        <TitleScreen
          game={game}
          onPlay={() => {
            setPicked(true);
            // A brand-new game goes to the altar first, to watch its first knights roll in (sealed, the
            // first time: it fades in from black, the Oracle asks for the seal to be broken).
            if (Object.keys(game.state.roster).length === 0) {
              const altar = hubLayout().stations.find((x) => x.id === 'altar');
              if (game.state.roll.sealed && !game.state.settings.reduceMotion) {
                // Black at once; the altar's screen (heavy to build) comes up under it a frame later.
                setIntro(true);
                if (altar) requestAnimationFrame(() => setStation(altar));
              } else if (altar) setStation(altar);
            }
          }}
        />
      )}
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
      {campAsk && inDungeon && (
        <CampAsk
          floor={game.state.run.floor}
          back={campFloor(game.state.run.floor, game.state.run.checkpoint)}
          fallen={game.world ? game.world.heroes.filter((h) => h.downed).length : 0}
          onStay={() => (uiSound('close'), setCampAsk(false))}
          onGo={() => {
            setCampAsk(false);
            game.leaveDungeon();
          }}
        />
      )}
      {rewind && <FloorRewind key={rewind.id} from={rewind.from} back={rewind.back} revived={rewind.revived} onDone={() => setRewind(null)} />}
      {banner && (
        <div key={banner.id} className="banner">
          <Chunky text={banner.title} size={14} grad={banner.grad} />
          {banner.sub && <span className="sub glass outlined">{banner.sub}</span>}
        </div>
      )}
      <Tutorial
        game={game}
        renderer={rendRef}
        controls={ctl.controls}
        station={station && !inDungeon ? station.id : null}
        choosing={choosing}
        blocked={intro || detail !== null || settings || luck || talking !== null || reveals.length > 0 || offline !== null || campAsk}
      />
      {intro && <div className="intro-fade" onAnimationEnd={() => setIntro(false)} aria-hidden />}
      {detail && <HeroDetail game={game} id={detail} onClose={() => setDetail(null)} />}
      {settings && (
        <SettingsSheet
          game={game}
          onClose={() => setSettings(false)}
          onReset={() => {
            // A new game from nothing: back to the title, PLAY opens the sealed altar.
            setStation(null);
            setPicked(false);
          }}
        />
      )}
      {luck && <LuckSheet game={game} onClose={() => setLuck(false)} />}
      {reveals.length > 0 && <Reveal key={reveals.length + ':' + reveals[0].knightId} item={reveals[0]} calm={game.state.settings.reduceMotion} onDone={() => (uiSound('tap'), setReveals((r) => r.slice(1)))} />}
      {/* Back after time away: not over the title (that opens the game), but once you've pressed PLAY. */}
      {offline && picked && !intro && <WelcomeBack report={offline} onClose={() => setOffline(null)} />}
    </>
  );
}
