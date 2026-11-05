/**
 * The HUD over the dungeon: the floor's plank sign with gold, hourglasses and luck; the altar's mini
 * roller (tap it for the full altar); the squad (tap a knight to take control); the dodge and special
 * buttons; the touch joystick; toasts and banners.
 */
import { CLASSES, knightDef, specialOf } from '../core/knights';
import { RARITY_COLOR } from '../core/rarity';
import { drySpell } from '../core/roller';
import { totalDupes } from '../core/roster';
import type { Controls } from '../input/input';
import type { Game } from '../game';
import type { Banner, Toast } from './App';
import { Icon } from './icons';
import { fmt, secs } from './format';
import type { Tab } from './Menu';
import { ReelsCanvas } from './Reels';
import { knightUrl } from './sprites';

const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export function Hud({ game, controls, press, openTab, toasts, banner }: { game: Game; controls: Controls; press: (w: 'dodge' | 'special') => void; openTab: (t: Tab | null) => void; toasts: Toast[]; banner: Banner | null }) {
  const s = game.state;
  const w = game.world;
  const luck = game.luck;
  const potionLeft = s.potionEndsAt ? Math.max(0, (s.potionEndsAt - Date.now()) / 1000) : 0;
  const pity = s.roll.tutorial === 'done' ? Math.max(0, drySpell(s) - s.roll.dry) : null;
  const lead = w?.leader();
  const me = w?.heroes.find((h) => h.slot === w.controlled);
  const mobsLeft = w ? w.livingMobs().length : 0;
  const unread = totalDupes(s) + Object.values(s.roster).filter((r) => r.isNew).length;
  const dodgeP = me ? Math.max(0, me.dodgeT! / me.dodgeCd!) : 0;
  const specP = me ? Math.max(0, me.specialT! / me.specialCd!) : 0;
  const cell = Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) * 14) || 40;
  const showHints = s.run.floor === 1 && s.rebirths === 0 && s.playTimeMs < 120_000;
  return (
    <div className="hud">
      <div className="topbar">
        <div className="plank floorSign outlined">
          <b>{w?.boss ? 'BOSS ' : ''}FLOOR {s.run.floor}</b>
          {game.biome.name}
          <div className="muted">{w ? (w.portalOpen ? 'Portal open!' : `${mobsLeft} foes left`) : 'Summoning...'}</div>
        </div>
        <div className="stats outlined">
          <span className="stat">
            <Icon name="coin" size={2} /> {fmt(s.gold)}
          </span>
          <span className="stat luckBadge" onClick={() => openTab('altar')}>
            <Icon name="clover" size={2} /> ×{luck < 100 ? luck.toFixed(2) : fmt(luck)}
            {potionLeft > 0 && <small style={{ color: '#8af07a' }}> potion {secs(potionLeft)}</small>}
          </span>
          {s.hourglasses > 0 && (
            <span className="stat">
              <Icon name="hourglass" size={2} /> {s.hourglasses}
            </span>
          )}
          {s.rebirths > 0 && (
            <span className="stat" style={{ color: '#d8b8ff' }}>
              <Icon name="sigil" size={2} /> {s.sigils}
            </span>
          )}
        </div>
      </div>

      <div className="mini" onClick={() => openTab('altar')}>
        <div className="board" style={{ borderWidth: 'calc(6 * var(--u))', borderImageWidth: 'calc(6 * var(--u))' }}>
          <ReelsCanvas game={game} cell={cell} reelsMax={5} />
        </div>
        <div className="note outlined">
          {pity !== null && pity <= 15 ? <span style={{ color: '#d8a8ff' }}>Epic+ guaranteed in {pity}</span> : <span className="muted">Tap: Summoning Altar</span>}
        </div>
      </div>

      <div className="squad">
        {s.squad.map((id, slot) => {
          if (!id || !s.roster[id]) return null;
          const def = knightDef(id);
          const h = w?.heroes.find((x) => x.slot === slot);
          const hp = h ? h.hp / h.maxHp : 1;
          const down = h?.downed;
          const sp = h ? Math.max(0, h.specialT ?? 0) : 0;
          return (
            <div key={slot} className={`member ${w?.controlled === slot ? 'me' : ''} ${down ? 'down' : ''}`} onClick={() => game.switchTo(slot)}>
              <img className="px face" src={knightUrl(id, s.roster[id].mutation)} alt="" draggable={false} />
              <div className="who outlined">
                <div style={{ color: RARITY_COLOR[def.rarity] }}>
                  {!touch && <span className="keycap">[{slot + 1}] </span>}
                  {def.name.length > 16 ? `${def.name.slice(0, 15)}…` : def.name}
                </div>
                <div className="muted">
                  {CLASSES[def.cls].name} · Lv {s.roster[id].level}
                </div>
                <div className="hpbar">
                  <i style={{ width: `calc(${Math.max(0, hp) * 100}% + 6 * var(--u))` }} />
                </div>
                <div className="cd">{down ? 'Down' : sp > 0 ? `${specialOf(id).name} ${Math.ceil(sp)}s` : `${specialOf(id).name} ready`}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="actions">
        <div className={`act ${s.settings.autoPlay ? 'on' : ''}`} onClick={() => game.setAuto(!s.settings.autoPlay)} title="Auto (T)">
          <span className="lbl outlined">
            <Icon name="auto" size={2} />
            AUTO
            {!touch && <span className="keycap">T</span>}
          </span>
        </div>
        <div className={`act big ${specP <= 0 && me ? 'ready' : ''}`} onPointerDown={(e) => (e.stopPropagation(), press('special'))} title="Special (E)">
          <div className="sweep" style={{ ['--p' as string]: `${specP * 100}%` }} />
          <span className="lbl outlined">
            <Icon name={me?.cls === 'guardian' ? 'shield' : me?.cls === 'cleric' ? 'potion' : me?.cls === 'arcanist' ? 'flame' : me?.cls === 'ranger' ? 'bolt' : 'sword'} size={2.5} />
            {me ? specialOf(me.knightId!).name.toUpperCase() : 'SPECIAL'}
            {!touch && <span className="keycap">E</span>}
          </span>
        </div>
        <div className="act" onClick={() => openTab('knights')} style={{ position: 'relative' }}>
          <span className="lbl outlined">
            <Icon name="helm" size={2} />
            MENU
            {!touch && <span className="keycap">M</span>}
          </span>
          {unread > 0 && (
            <span className="card badge" style={{ position: 'absolute', top: 0, right: 0 }}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
        <div className={`act big ${dodgeP <= 0 && me ? 'ready' : ''}`} onPointerDown={(e) => (e.stopPropagation(), press('dodge'))} title="Dodge roll (Space)">
          <div className="sweep" style={{ ['--p' as string]: `${dodgeP * 100}%` }} />
          <span className="lbl outlined">
            <Icon name="swap" size={2.5} />
            DODGE
            {!touch && <span className="keycap">SPACE</span>}
          </span>
        </div>
      </div>

      {controls.stick.active && (
        <div className="stick" style={{ left: controls.stick.ox, top: controls.stick.oy }}>
          <i style={{ left: `calc(50% + ${controls.stick.x - controls.stick.ox}px)`, top: `calc(50% + ${controls.stick.y - controls.stick.oy}px)` }} />
        </div>
      )}

      {showHints && lead && (
        <div className="hint outlined">
          {touch ? 'Drag on the left to move. Your knights attack on their own.' : 'WASD to move · SPACE dodge roll · E special · 1 2 3 switch knight'}
          <br />
          <span className="muted">The altar above rolls new knights for free, forever.</span>
        </div>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast outlined" style={{ ['--tc' as string]: t.color ?? '#c8a060', color: t.color }}>
            {t.knightId && <img className="px" src={knightUrl(t.knightId, null)} alt="" style={{ width: 'calc(15 * var(--u))' }} />}
            {t.text}
          </div>
        ))}
      </div>
      {banner && (
        <div key={banner.id} className="banner outlined" style={{ color: banner.color }}>
          {banner.title}
          {banner.sub && <small>{banner.sub}</small>}
        </div>
      )}
    </div>
  );
}
