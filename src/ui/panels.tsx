/**
 * Sheets over the game: a knight's sheet (information only), the Codex (every knight there is, for
 * the Oracle), and the luck and settings sheets.
 */
import { useState } from 'react';
import { MUSIC_CREDIT } from '../audio/tracks';
import { CLASSES, KNIGHTS, knightDef } from '../core/knights';
import { RARITIES, RARITY_COLOR, RARITY_NAME, RARITY_ODDS, rarityChances, type Rarity } from '../core/rarity';
import { luckBreakdown, lowestDroppable, revealBar } from '../core/luck';
import { isNewKnight, knightStats } from '../core/roster';
import { knightRating } from '../core/power';
import type { Game } from '../game';
import { Chunky, HeroLive, Section, rarityGrad, rarityStyle } from './common';
import { fmt, oneIn } from './format';
import { KnightTile, knightFit, rarityOdds } from './KnightCard';
import { Px } from './px';
import { SkillTable } from './SkillRoll';
import { skillRollLuck } from '../core/chance';
import { restartTutorial, tutorialOn } from '../core/tutorial';

export { Section } from './common';

// ------------------------------------------------------------------ the codex

/** Every knight there is, by rarity: the ones you've found, the rest as silhouettes (the Oracle's CODEX). */
export function Codex({ game }: { game: Game }) {
  const s = game.state;
  return (
    <>
      <p className="lead">
        Best find {s.records.bestOneIn ? oneIn(s.records.bestOneIn) : '—'} · deepest floor {s.records.bestFloorEver} · {s.records.kills} foes beaten · {s.records.spins} knights summoned
      </p>
      {RARITIES.map((r: Rarity) => (
        <Section key={r} title={RARITY_NAME[r]} sub={r === 'common' ? undefined : oneIn(RARITY_ODDS[r])}>
          <div className="heroes-grid">
            {KNIGHTS.filter((k) => k.rarity === r).map((k) => {
              const c = s.codex[k.id];
              return (
                <KnightTile
                  key={k.id}
                  id={k.id}
                  mutation={c?.best ?? null}
                  rarity={c ? r : 'common'}
                  silhouette={c ? undefined : '#0e0a18'}
                  name={c ? k.name : '???'}
                  meta={c ? `×${c.count}` : CLASSES[k.cls].name}
                  dim={!c}
                />
              );
            })}
          </div>
        </Section>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ hero detail

/**
 * A knight's sheet: what it is (rarity and class, its mutation), its numbers (power, HP, attack, its
 * odds at the altar, its level) and its skill roll. Only information: picking the squad, levelling
 * and reforging are the Warden's (keeper/Shops.tsx WardenShop).
 */
export function HeroDetail({ game, id, onClose }: { game: Game; id: string; onClose: () => void }) {
  const s = game.state;
  const rec = s.roster[id];
  const def = knightDef(id);
  if (!rec) {
    // Not owned (a summon log entry from before a rebirth, or a codex peek).
    return null;
  }
  const cls = CLASSES[def.cls];
  const st = knightStats(s, id);
  const slot = s.squad.indexOf(id);
  const power = knightRating(s, id);
  const lead = slot >= 0 && slot === s.controlled;
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet hero-sheet" style={rarityStyle(def.rarity)}>
        <button className="btn red square x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="stage-art">
          <HeroLive id={id} mutation={rec.mutation} style={knightFit(80, 56)} />
          {isNewKnight(rec, Date.now()) && <span className="ktag new stage-new">NEW</span>}
        </div>
        <div className="hero-banner">
          <Chunky text={def.name} size={def.name.length > 16 ? 7 : 9} grad={rarityGrad(def.rarity)} />
          <span className="outlined krank" style={{ color: RARITY_COLOR[def.rarity] }}>
            {lead && <Px icon="crown" size="sm" />}
            {RARITY_NAME[def.rarity]} {cls.name} · Lv {rec.level}
            {rec.mutation && <span className="t-gold"> · {rec.mutation.toUpperCase()}</span>}
          </span>
          <span className="t-muted outlined">{slot >= 0 ? (lead ? 'In your squad: the one you play' : 'In your squad') : 'Not in your squad'} · the Warden picks who goes down</span>
          <div className="kstats outlined num">
            <span title="Power">
              <small>POWER</small>
              <i>
                <Px icon="might" size="sm" />
                <b className="t-gold">{fmt(power)}</b>
              </i>
            </span>
            <span title="HP">
              <small>HP</small>
              <i>
                <Px icon="heart" size="sm" />
                {fmt(st.hp)}
              </i>
            </span>
            <span title="Attack">
              <small>ATTACK</small>
              <i>
                <Px icon="sword" size="sm" />
                {fmt(st.atk)}
              </i>
            </span>
            <span title={RARITY_ODDS[def.rarity] <= 1 ? 'Odds at the altar: the everyday find' : `Odds at the altar: ${oneIn(RARITY_ODDS[def.rarity])}`}>
              <small>ODDS</small>
              <i>
                <Px icon="dice" size="sm" />
                <b style={{ color: RARITY_COLOR[def.rarity] }}>{rarityOdds(def.rarity)}</b>
              </i>
            </span>
          </div>
        </div>
        <SkillTable knightId={id} luck={game.luck * skillRollLuck(s)} cd={st.specialCd} highlight={game.world?.heroes.find((h) => h.knightId === id)?.lastSkill?.skill} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ settings and luck sheets

const settingsMemory = { tab: 'game' as 'game' | 'controls' | 'save' | 'credits' };

/** Settings, in tabs: the game's switches, the controls, your save, the credits. */
export function SettingsSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const s = game.state;
  const [, bump] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [tab, setTabState] = useState(settingsMemory.tab);
  const setTab = (t: typeof tab) => ((settingsMemory.tab = t), setTabState(t));
  const set = (fn: () => void) => {
    fn();
    game.touch();
    bump((x) => x + 1);
  };
  const toggle = (label: string, sub: string, value: boolean, on: (v: boolean) => void) => (
    <label className="glass setting outlined">
      <span>
        {label}
        <small>{sub}</small>
      </span>
      <input type="checkbox" checked={value} onChange={(e) => set(() => on(e.target.checked))} />
    </label>
  );
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <button className="btn red square x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="hero-banner">
          <Px icon="gear" size="lg" s={1} />
          <Chunky text="SETTINGS" size={10} grad="cream" />
        </div>
        <div className="chips settings-tabs" role="tablist">
          {(
            [
              ['game', 'Game'],
              ['controls', 'Controls'],
              ['save', 'Save'],
              ['credits', 'Credits'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`chip ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'game' && (
          <>
        <label className="glass setting outlined">
          <span>
            Sound
            <small>Hits, rolls, reveals</small>
          </span>
          <input type="range" min={0} max={1} step={0.05} value={s.settings.sfx} onChange={(e) => set(() => (s.settings.sfx = Number(e.target.value)))} />
        </label>
        <label className="glass setting outlined">
          <span>
            Music
            <small>Camp, dungeon and boss themes</small>
          </span>
          <input type="range" min={0} max={1} step={0.05} value={s.settings.music} onChange={(e) => set(() => (s.settings.music = Number(e.target.value)))} />
        </label>
        {toggle('Auto battle', 'Your knight fights and goes down by itself (steer or attack to take over)', s.settings.autoPlay, (v) => game.setAuto(v))}
        {toggle('Tilt-shift', 'The distance goes soft, like a miniature', s.settings.tiltShift, (v) => (s.settings.tiltShift = v))}
        {toggle('Reduce motion', 'No screen shake, calmer reveals', s.settings.reduceMotion, (v) => (s.settings.reduceMotion = v))}
        <div className="glass setting outlined">
          <span>
            Tutorial
            <small>{tutorialOn(s.seen.tutorial) ? 'On: one step at a time, as things come up' : 'Walks you through the game, one step at a time'}</small>
          </span>
          <button className="btn small" onClick={() => (restartTutorial(s.seen.tutorial), game.save(), game.touch(), onClose())}>
            {tutorialOn(s.seen.tutorial) ? 'RESTART' : 'REPLAY'}
          </button>
        </div>
          </>
        )}
        {tab === 'controls' && (
          <div className="glass controls-list outlined">
            {(
              [
                ['Move', 'WASD / arrows', 'drag on the left'],
                ['Attack', 'hold click or J (aim with the mouse)', 'hold ATTACK (aims for you; drag it to aim)'],
                ['Dash', "Space or Shift (your class's move)", "the dodge key (your class's move)"],
                ['Skill', 'rolls and fires by itself in a fight; E rolls now', 'SKILL'],
                ['Switch knight', '1, 2, 3', 'tap their card'],
                ['Auto battle', 'T (plays your knight; steer to take over)', 'AUTO'],
                ['Camp', 'Esc', 'CAMP'],
              ] as const
            ).map(([what, keys, touchKeys]) => (
              <div key={what} className="control-row">
                <b>{what}</b>
                <span>{keys}</span>
                <span className="t-muted">{touchKeys}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'save' && (
          <>
        <p className="lead">
          Saved in this browser every few seconds. {Math.round(s.playTimeMs / 60000)} minutes played, {fmt(s.records.kills)} foes beaten, {fmt(s.records.spins)} knights summoned.
        </p>
        {!confirm ? (
          <button className="btn red small" onClick={() => setConfirm(true)}>
            Start a new game
          </button>
        ) : (
          <div className="row">
            <span className="outlined">Erase everything?</span>
            <button className="btn red small" onClick={() => (game.reset(), setConfirm(false), onClose())}>
              Erase
            </button>
            <button className="btn navy small" onClick={() => setConfirm(false)}>
              Keep playing
            </button>
          </div>
        )}
          </>
        )}
        {tab === 'credits' && (
        <p className="lead">
          Characters built on Snoblin's Pixel RPG Prototype Characters. Effects: Pixel Art Assets - Will Tice / unTied Games. {MUSIC_CREDIT} Icons and pixel tools from Dumpster Legend. Pixelify Sans (SIL OFL). v{__APP_VERSION__}
        </p>
        )}
      </div>
    </div>
  );
}

/** Every rarity's odds at your luck (the luck sheet). */
export function OddsTable({ game }: { game: Game }) {
  const luck = game.luck;
  const lb = luckBreakdown(game.state, Date.now());
  const ch = rarityChances(luck);
  const low = lowestDroppable(luck);
  return (
    <Section title="Odds" sub={`luck ×${luck.toFixed(2)}`}>
      <p className="lead">
        (1 + upgrades {lb.upgrades.toFixed(2)} + depth {lb.depth.toFixed(2)}) × rebirths {lb.rebirthMult.toFixed(2)}
        {lb.potionMult > 1 ? ` × potion ${lb.potionMult}` : ''}. Every tier hits at luck ÷ its odds, rarest first.
        {low !== 'common' ? ` Your luck is past ${RARITY_NAME[low]}'s odds, so nothing below ${RARITY_NAME[low]} drops.` : ''} A full-screen reveal needs
        {' '}{RARITY_NAME[revealBar(luck)]} or better, rarer than anything you found in the last 5 minutes.
      </p>
      <div className="glass" style={{ padding: 'calc(2 * var(--px)) calc(3 * var(--px))' }}>
        {[...RARITIES].reverse().map((r) => (
          <div key={r} className="spread outlined num" style={{ fontSize: 'calc(4.2 * var(--px))', padding: 'calc(0.5 * var(--px)) 0' }}>
            <span style={{ color: RARITY_COLOR[r], minWidth: 'calc(30 * var(--px))' }}>{RARITY_NAME[r]}</span>
            <span className="t-muted">{r === 'common' ? '—' : oneIn(RARITY_ODDS[r])}</span>
            <span style={{ minWidth: 'calc(30 * var(--px))', textAlign: 'right' }}>
              {ch[r] > 0 ? (ch[r] >= 0.001 ? `${(ch[r] * 100).toFixed(ch[r] > 0.1 ? 1 : 2)}%` : oneIn(1 / ch[r])) : <span className="t-muted">never</span>}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}


export function LuckSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <button className="btn red square x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="hero-banner">
          <Px icon="clover" size="lg" s={1} />
          <Chunky text={`LUCK ×${game.luck.toFixed(2)}`} size={10} grad="green" />
        </div>
        <OddsTable game={game} />
      </div>
    </div>
  );
}
