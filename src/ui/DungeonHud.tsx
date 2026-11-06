/**
 * The HUD in the dungeon: the floor, the currencies and luck, the altar's mini roller, the squad (tap
 * to take control), quests, and the action keys: chunky wooden blocks that sink when pressed (the
 * attack on touch screens, the skill roll, the dodge roll, Auto and Camp).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { knightDef } from '../core/knights';
import { CHALLENGE } from '../core/power';
import { activeQuests } from '../core/quests';
import type { Npc } from '../world/npcs';
import { RARITY_COLOR } from '../core/rarity';
import { drySpell } from '../core/roller';
import type { Controls } from '../input/input';
import type { Game } from '../game';
import { Chunky } from './common';
import { Px } from './px';
import { SkillRoll, skillSlotLabel, skillSlotState } from './SkillRoll';
import { SpellSlam } from './SpellSlam';
import { SquadCard } from './SquadCard';
import { RebirthPill } from './RebirthPill';
import { RUN_ITEMS, RUN_ITEM_IDS, canStack } from '../core/runItems';
import { fmt } from './format';
import { AltarReels } from './fx/AltarReels';
import daggerUrl from '../assets/ui/dagger.png';
import { uiSound } from './sound';
import { Glyph } from './keeper/KeeperScreen';
import { goalName, questIcon } from './keeper/Shops';
import { TopBar } from './TopBar';
import { dashLabel } from '../world/dash';
import type { KeySize } from './skin';

const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

/** How long a key stays down at the least, so a quick tap (or a key on the keyboard) is seen. */
const MIN_DOWN_MS = 120;

/**
 * A wooden action key: the block (skin.ts woodKey, up or pressed), the icon in its inlay, its name
 * under it and, with a keyboard, its key. It sinks while a finger or the mouse holds it, and for a
 * moment when `flash` changes (its keyboard key was pressed).
 */
function Key({
  size,
  rim,
  label,
  hint,
  flash,
  className,
  title,
  onDown,
  onUp,
  onClick,
  capture,
  children,
}: {
  size: KeySize;
  rim: 'brass' | 'iron';
  label: ReactNode;
  hint?: string;
  flash?: number;
  className?: string;
  title?: string;
  onDown?: () => void;
  onUp?: () => void;
  onClick?: () => void;
  /** Keep the pointer while it's held, even if it slides off (the attack). */
  capture?: boolean;
  children: ReactNode;
}) {
  const [down, setDown] = useState(false);
  const since = useRef(0);
  const timer = useRef(0);
  const held = useRef(false);
  const release = () => {
    if (!held.current) return;
    held.current = false;
    onUp?.();
    const left = MIN_DOWN_MS - (performance.now() - since.current);
    window.clearTimeout(timer.current);
    if (left > 0) timer.current = window.setTimeout(() => setDown(false), left);
    else setDown(false);
  };
  useEffect(() => {
    if (!flash) return;
    setDown(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDown(false), MIN_DOWN_MS);
  }, [flash]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      className={`wkey ${size} ${className ?? ''}`}
      data-rim={rim}
      data-down={down || undefined}
      title={title}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (capture) {
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {
            /* no capture: sliding off the key releases it instead */
          }
        }
        held.current = true;
        since.current = performance.now();
        window.clearTimeout(timer.current);
        setDown(true);
        onDown?.();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onLostPointerCapture={release}
      onClick={onClick}
    >
      <span className="body">
        <span className="face">{children}</span>
      </span>
      <span className="lbl">{label}</span>
      {hint && !touch && <span className="key">{hint}</span>}
    </button>
  );
}

/** The keyboard's action keys, as the last time each was pressed (the keys on screen sink with them). */
function useKeyFlash(): Record<string, number> {
  const [flash, setFlash] = useState<Record<string, number>>({});
  useEffect(() => {
    const map: Record<string, string> = { ' ': 'dodge', shift: 'dodge', e: 'skill', q: 'skill', t: 'auto', escape: 'camp' };
    const on = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const id = map[e.key.toLowerCase()];
      if (id) setFlash((f) => ({ ...f, [id]: performance.now() }));
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  return flash;
}


export function DungeonHud({ game, controls, press, hold, onCamp, onSettings, onLuck, onAltar, onTalk, onRebirth }: {
  game: Game;
  controls: Controls;
  press: (w: 'dodge' | 'special') => void;
  /** The attack: held while the Attack button is pressed. */
  hold: (on: boolean) => void;
  onCamp: () => void;
  /** Back to camp and on to the Shrine (the rebirth push). */
  onRebirth: () => void;
  onSettings: () => void;
  onLuck: () => void;
  onAltar: () => void;
  onTalk: (n: Npc) => void;
}) {
  const s = game.state;
  const w = game.world;
  const me = w?.heroes.find((h) => h.slot === w.controlled);
  const pity = s.roll.tutorial === 'done' ? Math.max(0, drySpell(s) - s.roll.dry) : null;
  const mobsLeft = w ? w.livingMobs().length : 0;
  const dodge = me ? Math.max(0, me.dodgeT!) : 0;
  const special = me ? Math.max(0, me.specialT!) : 0;
  const roll = me ? skillSlotState(me) : 'off';
  const boss = w?.bossUnit && !w.bossUnit.dead ? w.bossUnit : null;
  const ch = game.difficulty ? CHALLENGE[game.difficulty.challenge] : null;
  const ware = w?.nearWare() ?? null;
  const npc = ware ? null : (w?.nearNpc() ?? null);
  const items = RUN_ITEM_IDS.filter((id) => (s.run.items?.[id] ?? 0) > 0);
  const jobs = activeQuests(s.quests ?? []);
  const flash = useKeyFlash();
  // The big spell reel: 30 art px wide on a phone (its icons 2x), 46 on a desktop (3x); the window
  // is 1.75 cells tall inside a 4 px frame.
  const reelN = touch ? 30 : 46;
  const reel = { n: reelN, h: Math.round((reelN - 8) * 1.75) + 8 };
  return (
    <div className={`dhud ${boss ? 'has-boss' : ''}`}>
      <TopBar
        game={game}
        onSettings={onSettings}
        onLuck={onLuck}
        left={
          <div className="floor-pill plate outlined">
            <b>
              {w?.boss ? 'BOSS · ' : ''}FLOOR {s.run.floor}
              {ch && (
                <span className="dchip" style={{ ['--cc' as string]: ch.color, ['--seal' as string]: `var(--sk-seal-${game.difficulty!.challenge})` }} title={ch.text}>
                  {ch.name.toUpperCase()}
                </span>
              )}
            </b>
            <span>
              {game.biome.name}
              <span className="sep"> · </span>
              <span className="foes">
                {!w ? '...' : !w.portalOpen ? <span className="t-bad">beat the boss to leave</span> : mobsLeft > 0 ? <>{mobsLeft} foes · <span className="t-good">exit open</span></> : <span className="t-good">cleared · exit open</span>}
              </span>
            </span>
          </div>
        }
      />

      {boss && (
        <div className="bossbar">
          <Chunky text={boss.type!.name.toUpperCase()} size={8} grad={boss.bossPhase ? 'red' : 'gold'} />
          <div className="daggers" style={{ ['--dagger' as string]: `url(${daggerUrl})` }}>
            <div className={`bar boss ${boss.bossPhase ? 'enraged' : ''}`}>
              <i style={{ width: `calc((100% - 4 * var(--px)) * ${Math.max(0, boss.hp) / boss.maxHp})` }} />
            </div>
          </div>
          <span className="title outlined">{boss.type!.boss!.title}</span>
        </div>
      )}

      {w?.rewind && (
        <div className="rewind-sign">
          <Chunky text="<< REWIND" size={14} grad="blue" />
        </div>
      )}

      <RebirthPill game={game} onGo={onRebirth} />

      <div className="mini-roller" onClick={onAltar}>
        <div className="frame">
          <AltarReels game={game} variant="mini" />
        </div>
        {pity !== null && pity <= 15 && (
          <div className="note glass outlined" style={{ color: RARITY_COLOR.epic }}>
            Epic+ in {pity}
          </div>
        )}
      </div>

      {/* On a phone the squad sits up under the floor's plate, leaving the bottom left free for the thumb that steers. */}
      <div className={`hud-left ${touch ? 'top' : ''}`}>
      <div className={`squad ${touch ? 'top' : ''}`}>
        {s.squad.map((id, slot) => {
          if (!id || !s.roster[id]) return null;
          const def = knightDef(id);
          return (
            <SquadCard
              key={slot}
              game={game}
              slot={slot}
              knightId={id}
              mutation={s.roster[id].mutation}
              name={def.name}
              cls={def.cls}
              rarity={def.rarity}
              me={w?.controlled === slot}
              onPick={() => (uiSound('tap'), game.switchTo(slot))}
            />
          );
        })}
      </div>

        {items.length > 0 && (
          <div className="run-items" title="Bought from merchants: they last until you head back to camp">
            {items.map((id) => (
              <span key={id} className="run-item" title={`${RUN_ITEMS[id].name}: ${RUN_ITEMS[id].text}`}>
                <Px icon={RUN_ITEMS[id].icon} size="sm" />
                {(s.run.items?.[id] ?? 0) > 1 && <b>{s.run.items?.[id]}</b>}
              </span>
            ))}
          </div>
        )}
        {jobs.length > 0 && (
          <div className="quests">
            {jobs.map((q) => {
              const p = Math.min(q.progress, q.target);
              return (
                <div key={q.id} className={`quest ${q.done ? 'done' : ''}`} title={q.title}>
                  <Glyph icon={q.done ? 'check' : questIcon(q)} size="xs" />
                  <span className="what">{goalName(q)}</span>
                  <span className="n">{q.done ? `to ${(q.giverName ?? 'the giver').split(' ')[0]}` : `${p}/${q.target}`}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* The big spell reel over the keys: it ticks down onto each skill, which then slams onto the screen. */}
      {me && (
        <div className={`spell-reel ${touch ? 'touch' : ''}`} data-spell-reel>
          <div className="reel-frame" style={{ width: `calc(${reel.n} * var(--px))`, height: `calc(${reel.h} * var(--px))` }}>
            <SkillRoll game={game} sound={false} size={reel.n} well={4} tall rect pop={false} />
          </div>
        </div>
      )}
      <SpellSlam game={game} />

      <div className={`actions ${touch ? 'touch' : ''}`}>
        {touch && (
          <Key size="lg" rim={me ? 'brass' : 'iron'} className="k-attack" label="ATTACK" title="Attack" capture onDown={() => hold(true)} onUp={() => hold(false)}>
            <Px icon="swords" s={2} />
          </Key>
        )}
        <Key
          size="sm"
          rim={s.settings.autoPlay ? 'brass' : 'iron'}
          className={`k-auto ${s.settings.autoPlay ? 'on' : ''}`}
          label={s.settings.autoPlay ? 'AUTO ON' : 'AUTO'}
          hint="T"
          flash={flash.auto}
          title="Auto battle: your knight fights and goes down by itself; steer or attack to take over (T)"
          onClick={() => (uiSound('tap'), game.setAuto(!s.settings.autoPlay))}
        >
          <Px icon="reel" size="sm" s={1} />
          {s.settings.autoPlay && <i className="lamp" />}
        </Key>
        <Key size="md" rim={roll === 'ready' || roll === 'rolling' ? 'brass' : 'iron'} className={`k-skill ${roll === 'ready' ? 'ready' : 'cooling'}`} label={me ? skillSlotLabel(me) : 'SKILL'} hint="E" flash={flash.skill} title="Skill roll (E)" onDown={() => press('special')}>
          {/* (Its reel's sounds come from the audio, for every knight's roll: src/audio/fight.ts.) */}
          <Px icon="dice" size="md" s={1} />
          {special > 0 && me && (
            <>
              <i className="cool" style={{ ['--cd' as string]: `${Math.ceil((special / me.specialCd!) * 8) * 12.5}%` }} />
              <span className="secs">{Math.ceil(special)}</span>
            </>
          )}
        </Key>
        <Key size="sm" rim="iron" className="k-camp" label="CAMP" hint="ESC" flash={flash.camp} title="Camp (Esc)" onClick={() => (uiSound('close'), onCamp())}>
          <Px icon="flame" size="sm" s={1} />
        </Key>
        <Key size="md" rim={dodge <= 0 && me ? 'brass' : 'iron'} className={`k-dodge ${dodge <= 0 && me ? 'ready' : 'cooling'}`} label={me ? dashLabel(me) : 'DODGE'} hint="SPACE" flash={flash.dodge} title="Dodge roll (Space)" onDown={() => press('dodge')}>
          <Px icon="boot" s={1} />
          {dodge > 0 && me && <i className="cool" style={{ ['--cd' as string]: `${Math.ceil((dodge / me.dodgeCd!) * 8) * 12.5}%` }} />}
        </Key>
      </div>

      {ware && (() => {
        const it = RUN_ITEMS[ware.item];
        const full = !canStack(s.run.items, ware.item);
        const short = s.gold < ware.price;
        return (
          <div className="buy-prompt plate">
            <span className="buy-icon">
              <Px icon={it.icon} size="md" s={touch ? 1 : 2} />
            </span>
            <span className="buy-what">
              <b>{it.name}</b>
              <small>{it.short}</small>
            </span>
            <button
              className={`btn ${full || short ? '' : 'gold'} buy-btn`}
              disabled={full}
              onClick={() => {
                const r = game.buyWare(ware);
                uiSound(r === 'ok' ? 'buy' : 'lockTap');
              }}
              title={full ? 'You carry as many as you can' : short ? `You need ${fmt(ware.price - s.gold)} more gold` : touch ? 'Buy it' : 'Buy it (Enter or F)'}
            >
              <Px icon="coin" size="sm" />
              <span>{full ? 'FULL' : fmt(ware.price)}</span>
            </button>
          </div>
        );
      })()}
      {npc && (
        <div className="talk-prompt dungeon">
          <button className="btn gold" onClick={() => onTalk(npc)}>
            <Px icon="star" size="sm" />
            <span>
              TALK: {npc.def.name}
              {!touch && <span className="sub">Enter or F</span>}
            </span>
          </button>
        </div>
      )}

      {controls.stick.active && (
        <div className="stick" style={{ left: controls.stick.ox, top: controls.stick.oy }}>
          <i style={{ left: `calc(50% + ${controls.stick.x - controls.stick.ox}px)`, top: `calc(50% + ${controls.stick.y - controls.stick.oy}px)` }} />
        </div>
      )}
      {controls.aimStick.active && (
        <div className="stick aim" style={{ left: controls.aimStick.ox, top: controls.aimStick.oy }}>
          <i style={{ left: `calc(50% + ${controls.aimStick.x - controls.aimStick.ox}px)`, top: `calc(50% + ${controls.aimStick.y - controls.aimStick.oy}px)` }} />
        </div>
      )}

    </div>
  );
}
