/**
 * The HUD in the dungeon: the floor, the currencies and luck, the altar's mini roller, the squad (tap
 * to take control), quests, and the pixel action buttons: the special, the dodge roll, Auto and Camp.
 */
import { CLASSES, knightDef, specialOf } from '../core/knights';
import { CHALLENGE } from '../core/power';
import { activeQuests, questGoal } from '../core/quests';
import type { Npc } from '../world/npcs';
import { RARITY_COLOR } from '../core/rarity';
import { drySpell } from '../core/roller';
import type { Controls } from '../input/input';
import type { Game } from '../game';
import { Bar, Chunky } from './common';
import { Px, type IconName } from './px';
import { AltarReels } from './fx/AltarReels';
import daggerUrl from '../assets/ui/dagger.png';
import { uiSound } from './sound';
import { knightUrl } from './sprites';
import { TopBar } from './TopBar';

const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

const SPECIAL_ICON: Record<string, IconName> = { guardian: 'shield', blade: 'sword', ranger: 'target', cleric: 'heart', arcanist: 'bolt', lancer: 'arrowRight' };

export function DungeonHud({ game, controls, press, onCamp, onSettings, onLuck, onAltar, onTalk }: {
  game: Game;
  controls: Controls;
  press: (w: 'dodge' | 'special') => void;
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
  const sp = me ? specialOf(me.knightId!) : null;
  const showHints = s.run.floor === 1 && s.rebirths === 0 && s.playTimeMs < 150_000;
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

      <div className="squad">
        {s.squad.map((id, slot) => {
          if (!id || !s.roster[id]) return null;
          const def = knightDef(id);
          const h = w?.heroes.find((x) => x.slot === slot);
          const hp = h ? h.hp / h.maxHp : 1;
          const spT = h ? Math.max(0, h.specialT ?? 0) : 0;
          const spCd = h?.specialCd ?? 1;
          return (
            <button
              key={slot}
              className={`member plate ${w?.controlled === slot ? 'me gold' : ''} ${h?.downed ? 'down' : ''}`}
              style={{ ['--rc' as string]: RARITY_COLOR[def.rarity] }}
              onClick={() => (uiSound('tap'), game.switchTo(slot))}
            >
              <img className="px face" src={knightUrl(id, s.roster[id].mutation)} alt="" draggable={false} />
              <span className="nm outlined">
                {!touch && <span className="key">{slot + 1} </span>}
                {def.name}
              </span>
              <Bar value={hp} kind="hp" />
              <Bar value={h?.downed ? 0 : 1 - spT / spCd} kind="sp" />
            </button>
          );
        })}
      </div>

      <div className="actions">
        <button className={`slot-btn small ${s.settings.autoPlay ? 'on' : ''}`} onClick={() => (uiSound('tap'), game.setAuto(!s.settings.autoPlay))} title="Auto (T)">
          <span className="well" style={{ ['--ring' as string]: `var(--sk-slot-sm-${s.settings.autoPlay ? 'brass' : 'iron'}-dark)` }}>
            <Px icon="reel" size="sm" s={1} />
          </span>
          <span className="lbl">{s.settings.autoPlay ? 'AUTO ON' : 'AUTO'}</span>
          {!touch && <span className="key">T</span>}
        </button>
        <button
          className={`slot-btn ${special <= 0 && me ? 'ready' : 'cooling'}`}
          onPointerDown={(e) => (e.stopPropagation(), press('special'))}
          title="Special (E)"
        >
          <span className="well" style={{ ['--ring' as string]: `var(--sk-slot-${special <= 0 && me ? 'brass' : 'iron'}-arcane)` }}>
            <Px icon={sp?.signature === 'rewind' ? 'clock' : SPECIAL_ICON[me?.cls ?? 'blade']} size="md" s={1.5} />
            {special > 0 && me && (
              <>
                <i className="cool" style={{ ['--cd' as string]: `${Math.ceil((special / me.specialCd!) * 8) * 12.5}%` }} />
                <span className="secs">{Math.ceil(special)}</span>
              </>
            )}
          </span>
          <span className="lbl">{sp ? sp.name.toUpperCase() : 'SPECIAL'}</span>
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

      {showHints && me && (
        <div className="hint glass outlined">
          {touch ? 'Drag on the left to move. Your knights attack on their own.' : 'WASD to move · SPACE dodge roll · E special · 1 2 3 switch knight'}
          <span className="t-muted">{CLASSES[me.cls!].auto.name} fires by itself whenever a foe is in range.</span>
        </div>
      )}
    </div>
  );
}
