/**
 * The HUD in the dungeon: the floor, the currencies and luck, the altar's mini roller, the squad (tap
 * to take control), quests, and the pixel action buttons: the special, the dodge roll, Auto and Camp.
 */
import { knightDef } from '../core/knights';
import { CHALLENGE } from '../core/power';
import { activeQuests, questGoal } from '../core/quests';
import type { Npc } from '../world/npcs';
import { RARITY_COLOR } from '../core/rarity';
import { drySpell } from '../core/roller';
import type { Controls } from '../input/input';
import type { Game } from '../game';
import { Bar, Chunky } from './common';
import { Px } from './px';
import { SkillRoll, skillSlotLabel, skillSlotState } from './SkillRoll';
import { AltarReels } from './fx/AltarReels';
import daggerUrl from '../assets/ui/dagger.png';
import { uiSound } from './sound';
import { knightFaceUrl } from './sprites';
import { TopBar } from './TopBar';

const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);


export function DungeonHud({ game, controls, press, hold, onCamp, onSettings, onLuck, onAltar, onTalk }: {
  game: Game;
  controls: Controls;
  press: (w: 'dodge' | 'special') => void;
  /** The attack: held while the Attack button is pressed. */
  hold: (on: boolean) => void;
  onCamp: () => void;
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
  const npc = w?.nearNpc() ?? null;
  const jobs = activeQuests(s.quests ?? []);
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
              {game.biome.name} · {w ? (w.portalOpen ? <span className="t-good">portal open</span> : `${mobsLeft} foes`) : '...'}
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
      <div className={`squad ${touch ? 'top' : ''}`}>
        {s.squad.map((id, slot) => {
          if (!id || !s.roster[id]) return null;
          const def = knightDef(id);
          const h = w?.heroes.find((x) => x.slot === slot);
          const hp = h ? h.hp / h.maxHp : 1;
          return (
            <button
              key={slot}
              className={`member plate ${w?.controlled === slot ? 'me gold' : ''} ${h?.downed ? 'down' : ''}`}
              style={{ ['--rc' as string]: RARITY_COLOR[def.rarity] }}
              onClick={() => (uiSound('tap'), game.switchTo(slot))}
            >
              <img className="px face" src={knightFaceUrl(id, s.roster[id].mutation)} alt="" draggable={false} />
              <span className="nm">{def.name}</span>
              <Bar value={hp} kind="hp" />
            </button>
          );
        })}
      </div>

      <div className={`actions ${touch ? 'touch' : ''}`}>
        {touch && (
          <button
            className={`slot-btn attack ${me ? 'ready' : 'cooling'}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              // Keep the finger's events even if it slides off the button (released when it lifts).
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                /* no capture: sliding off the button releases it instead */
              }
              hold(true);
            }}
            onPointerUp={() => hold(false)}
            onPointerCancel={() => hold(false)}
            onPointerLeave={() => hold(false)}
            onLostPointerCapture={() => hold(false)}
            title="Attack"
          >
            <span className="well" style={{ ['--ring' as string]: 'var(--sk-slot-brass-steel)' }}>
              <Px icon="swords" s={2} />
            </span>
            <span className="lbl">ATTACK</span>
          </button>
        )}
        <button className={`slot-btn small ${s.settings.autoPlay ? 'on' : ''}`} onClick={() => (uiSound('tap'), game.setAuto(!s.settings.autoPlay))} title="Auto (T)">
          <span className="well" style={{ ['--ring' as string]: `var(--sk-slot-sm-${s.settings.autoPlay ? 'brass' : 'iron'}-dark)` }}>
            <Px icon="reel" size="sm" s={1} />
          </span>
          <span className="lbl">{s.settings.autoPlay ? 'AUTO ON' : 'AUTO'}</span>
          {!touch && <span className="key">T</span>}
        </button>
        <button
          className={`slot-btn ${roll === 'ready' ? 'ready' : 'cooling'}`}
          onPointerDown={(e) => (e.stopPropagation(), press('special'))}
          title="Skill roll (E)"
        >
          <span className="well" style={{ ['--ring' as string]: `var(--sk-slot-${roll === 'ready' || roll === 'rolling' ? 'brass' : 'iron'}-arcane)` }}>
            {/* (Its reel's sounds come from the audio, for every knight's roll: src/audio/fight.ts.) */}
            <SkillRoll game={game} sound={false} />
            {special > 0 && me && (
              <>
                <i className="cool" style={{ ['--cd' as string]: `${Math.ceil((special / me.specialCd!) * 8) * 12.5}%` }} />
                <span className="secs">{Math.ceil(special)}</span>
              </>
            )}
          </span>
          <span className="lbl">{me ? skillSlotLabel(me) : 'SKILL'}</span>
          {!touch && <span className="key">E</span>}
        </button>
        <button className="slot-btn small" onClick={() => (uiSound('close'), onCamp())} title="Camp (Esc)">
          <span className="well" style={{ ['--ring' as string]: 'var(--sk-slot-sm-iron-wood)' }}>
            <Px icon="tent" size="md" s={0.75} />
          </span>
          <span className="lbl">CAMP</span>
          {!touch && <span className="key">ESC</span>}
        </button>
        <button className={`slot-btn ${dodge <= 0 && me ? 'ready' : 'cooling'}`} onPointerDown={(e) => (e.stopPropagation(), press('dodge'))} title="Dodge roll (Space)">
          <span className="well" style={{ ['--ring' as string]: `var(--sk-slot-${dodge <= 0 && me ? 'brass' : 'iron'}-steel)` }}>
            <Px icon="boot" s={2} />
            {dodge > 0 && me && <i className="cool" style={{ ['--cd' as string]: `${Math.ceil((dodge / me.dodgeCd!) * 8) * 12.5}%` }} />}
          </span>
          <span className="lbl">DODGE</span>
          {!touch && <span className="key">SPACE</span>}
        </button>
      </div>

      {jobs.length > 0 && (
        <div className="quests">
          {jobs.map((q) => (
            <div key={q.id} className={`quest glass outlined ${q.done ? 'done' : ''}`}>
              <b>{q.done ? `Back to ${q.giverName ?? 'the giver'}` : q.title}</b>
              <span>{questGoal(q)}</span>
            </div>
          ))}
        </div>
      )}

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

    </div>
  );
}
