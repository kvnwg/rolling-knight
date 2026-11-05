/**
 * The hub's screens. You walk your knight round the hub (drawn by the renderer like any floor); this
 * is what sits on top of it:
 *  - HubHud: the top bar, the little altar (the rolling never stops), and the prompt to talk to the
 *    keeper you're standing by;
 *  - StationSheet: a keeper's counter, opened by talking to them: the altar, the smith, the scrapper,
 *    the quartermaster, the outfitter, the sage, the shrine, the notice board, the gate;
 *  - CharacterSelect: who you play as, when the game opens.
 * In the dungeon none of this is reachable: to change your squad or spend anything you leave, or fall.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { sfx } from '../audio/sfx';
import { knightDef } from '../core/knights';
import { CHALLENGE, floorDifficulty, knightRating, squadPower } from '../core/power';
import { activeQuests, questGoal, rewardText } from '../core/quests';
import { RARITY_COLOR, RARITY_NAME } from '../core/rarity';
import { bestSquad, rankedKnights } from '../core/roster';
import type { Game } from '../game';
import { npcFrame } from '../render/art/npcs';
import { toCanvas } from '../render/art/draw';
import { biomeForFloor } from '../world/biomes';
import type { HubStation, StationId } from '../world/hubWorld';
import { Chunky, HeroArt, HeroLive } from './common';
import { AltarReels } from './fx/AltarReels';
import { fmt } from './format';
import { DupeBar, HeroCard, HeroesPanel, PerksPanel, RebirthPanel, Section, SummonPanel, UpgradesPanel } from './panels';
import { Px, type IconName } from './px';
import { KNIGHT_PIC_H, KNIGHT_PIC_W } from './sprites';
import { uiSound } from './sound';
import { TopBar } from './TopBar';

const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

const STATION_ICON: Record<StationId, IconName> = {
  altar: 'reelGold',
  smith: 'arrowUp',
  scrap: 'shard',
  squad: 'helm',
  upgrades: 'coin',
  perks: 'sigil',
  rebirth: 'rebirth',
  gate: 'swords',
  quests: 'star',
};

/** A keeper's portrait (their idle frame, facing you), as an image. */
function usePortrait(st: HubStation | null): string | null {
  return useMemo(() => {
    if (!st?.def) return null;
    const f = npcFrame(st.def, 'idle', 'down', 0);
    return toCanvas(f.buf).toDataURL();
  }, [st]);
}

// ------------------------------------------------------------------ the HUD at the hub

export function HubHud({ game, onTalk, onSettings, onLuck }: { game: Game; onTalk: (s: HubStation) => void; onSettings: () => void; onLuck: () => void }) {
  const s = game.state;
  const near = game.hub?.nearStation() ?? null;
  const portrait = usePortrait(near);
  const floor = s.run.floor;
  const diff = floorDifficulty(floor, squadPower(s));
  const ch = CHALLENGE[diff.challenge];
  return (
    <div className="dhud hub-hud">
      <TopBar
        game={game}
        onSettings={onSettings}
        onLuck={onLuck}
        left={
          <div className="floor-pill plate outlined">
            <b>THE HUB</b>
            <span>
              Next: floor {floor}, {biomeForFloor(floor, s.run.biomeSeed).name}
              <span className="dchip" style={{ ['--cc' as string]: ch.color, ['--seal' as string]: `var(--sk-seal-${diff.challenge})` }}>
                {ch.name.toUpperCase()}
              </span>
            </span>
          </div>
        }
      />
      <button
        className="mini-roller"
        onClick={() => {
          const altar = game.hub?.stations.find((x) => x.id === 'altar');
          if (altar) onTalk(altar);
        }}
        title="The altar: tap to watch it roll"
      >
        <div className="frame">
          <AltarReels game={game} variant="mini" />
        </div>
      </button>

      {game.autoReturnT > 0 && (
        <div className="hint plate outlined" style={{ bottom: 'calc(70 * var(--px))' }}>
          Auto: back down in {Math.ceil(game.autoReturnT)}...
          <span className="t-muted">Move to stay at the hub.</span>
        </div>
      )}

      {near ? (
        <div className="talk-prompt">
          <div className="talk-card plate outlined">
            {portrait ? <img className="px face" src={portrait} alt="" /> : <Px icon={STATION_ICON[near.id]} size="md" s={1.5} />}
            <div className="who">
              <b>{near.name}</b>
              <span>{near.job}</span>
            </div>
          </div>
          <button className="btn gold big" onClick={() => (uiSound('open'), onTalk(near))}>
            <Px icon={STATION_ICON[near.id]} size="md" />
            <span>
              {near.id === 'gate' ? 'DESCEND' : near.def ? 'TALK' : 'READ'}
              {!touch && <span className="sub">E or Enter</span>}
            </span>
          </button>
        </div>
      ) : (
        s.playTimeMs < 240_000 && (
          <div className="hint plate outlined">
            {touch ? 'Drag to walk. Walk up to a keeper to talk.' : 'WASD to walk. Walk up to a keeper and press E.'}
            <span className="t-muted">The steps down to the dungeon are at the foot of the square.</span>
          </div>
        )
      )}
    </div>
  );
}

// ------------------------------------------------------------------ a keeper's counter

export function StationSheet({ game, station, onOpen, onClose }: { game: Game; station: HubStation; onOpen: (id: string) => void; onClose: () => void }) {
  const portrait = usePortrait(station);
  useEffect(() => {
    if (station.id !== 'altar') return;
    sfx.setAltarFocus(true);
    return () => sfx.setAltarFocus(false);
  }, [station]);
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet station-sheet">
        <button className="btn red square x" onClick={() => (uiSound('close'), onClose())} aria-label="Close">
          <Px icon="x" size="sm" />
        </button>
        <header className="keeper">
          <div className="portrait">{portrait ? <img className="px" src={portrait} alt="" /> : <Px icon={STATION_ICON[station.id]} size="md" s={2} />}</div>
          <div className="who outlined">
            <Chunky text={station.name.toUpperCase()} size={8} grad="gold" />
            <span className="job">{station.job}</span>
            <p className="say">"{station.greeting}"</p>
          </div>
        </header>
        <div className="counter">
          <StationBody game={game} station={station} onOpen={onOpen} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

function StationBody({ game, station, onOpen, onClose }: { game: Game; station: HubStation; onOpen: (id: string) => void; onClose: () => void }) {
  switch (station.id) {
    case 'altar':
      return <SummonPanel game={game} onOpen={onOpen} />;
    case 'smith':
      return <HeroesPanel game={game} onOpen={onOpen} />;
    case 'scrap':
      return <ScrapPanel game={game} onOpen={onOpen} />;
    case 'squad':
      return <SquadPanel game={game} onOpen={onOpen} />;
    case 'upgrades':
      return <UpgradesPanel game={game} />;
    case 'perks':
      return <PerksPanel game={game} />;
    case 'rebirth':
      return <RebirthPanel game={game} />;
    case 'quests':
      return <QuestsPanel game={game} />;
    case 'gate':
      return <GatePanel game={game} onClose={onClose} />;
  }
}

function ScrapPanel({ game, onOpen }: { game: Game; onOpen: (id: string) => void }) {
  const s = game.state;
  const ids = rankedKnights(s).filter((id) => s.roster[id].dupes > 0);
  return (
    <>
      <DupeBar game={game} />
      <Section title="Duplicates" sub={ids.length ? 'tap a knight to break down or sell its copies' : 'nothing to scrap yet'}>
        <div className="heroes-grid">
          {ids.map((id) => (
            <HeroCard key={id} game={game} id={id} onOpen={onOpen} />
          ))}
        </div>
      </Section>
    </>
  );
}

function SquadPanel({ game, onOpen }: { game: Game; onOpen: (id: string) => void }) {
  const s = game.state;
  return (
    <>
      <Section
        title="Your squad"
        sub={`Power ${fmt(squadPower(s))}`}
        right={
          <button className="btn small" onClick={() => (bestSquad(s), game.syncHub(true), uiSound('equip', 3))}>
            Best squad
          </button>
        }
      >
        <div className="squad-row">
          {s.squad.map((id, slot) => (id ? <HeroCard key={slot} game={game} id={id} onOpen={onOpen} slot={slot === s.controlled ? 0 : undefined} /> : null))}
        </div>
        <p className="lead">The knight in the gold frame is the one you play. Tap a knight to swap it, or pick who leads below.</p>
      </Section>
      <HeroesPanel game={game} onOpen={onOpen} />
    </>
  );
}

function QuestsPanel({ game }: { game: Game }) {
  const s = game.state;
  const list = activeQuests(s.quests ?? []);
  return (
    <Section title="Jobs" sub={list.length ? `${list.length} taken` : 'none taken'}>
      {list.length === 0 && <p className="lead">Folk in the dungeon ask for help. Talk to them down there, and their jobs show up here.</p>}
      {list.map((q) => (
        <div key={q.id} className={`quest plate outlined ${q.done ? 'done' : ''}`}>
          <b>{q.title}</b>
          <span>{questGoal(q)}</span>
          <span className="t-gold">{rewardText(q.reward)}</span>
          {q.done && <span className="t-good">Done: back to {q.giverName ?? 'the giver'}</span>}
        </div>
      ))}
    </Section>
  );
}

function GatePanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const s = game.state;
  const floor = s.run.floor;
  const biome = biomeForFloor(floor, s.run.biomeSeed);
  const power = squadPower(s);
  const diff = floorDifficulty(floor, power);
  const ch = CHALLENGE[diff.challenge];
  return (
    <>
      <div className="hero-banner">
        <Chunky text={`FLOOR ${floor}`} size={12} grad="gold" />
        <span className="lead">
          {biome.name}
          {floor % 5 === 0 ? ' · a boss waits here' : ''}
        </span>
        <div className="power-check glass outlined" title={ch.text}>
          <span>
            Power <b>{fmt(power)}</b>
          </span>
          <span className="t-muted">
            par <b>{fmt(diff.par)}</b>
          </span>
          <span className="dchip" style={{ ['--cc' as string]: ch.color, ['--seal' as string]: `var(--sk-seal-${diff.challenge})` }}>
            {ch.name.toUpperCase()}
          </span>
        </div>
        <p className="lead">{ch.text}</p>
        <button className="btn gold big breathe" onClick={() => (uiSound('embark'), onClose(), game.enterDungeon())}>
          <Px icon="swords" s={1.5} />
          <span>
            {game.world ? 'CONTINUE' : 'DESCEND'}
            <span className="sub">Your squad is locked in until you come back</span>
          </span>
        </button>
      </div>
      <Section title="Going down with you">
        <div className="squad-row">
          {s.squad.map((id, slot) => (id ? <HeroCard key={slot} game={game} id={id} onOpen={() => {}} slot={slot === s.controlled ? 0 : undefined} /> : null))}
        </div>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ who you play as

/**
 * A knight picture about `s` UI pixels per art pixel, rounded to whole screen pixels per art pixel:
 * blown up big, a fractional scale draws some art pixels a screen pixel wider than others.
 */
function crispKnight(s: number): CSSProperties {
  const px = parseFloat(document.documentElement.style.getPropertyValue('--px')) || 3;
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.round(s * px * dpr)) / dpr;
  return { width: `${KNIGHT_PIC_W * k}px`, height: `${KNIGHT_PIC_H * k}px` };
}

export function CharacterSelect({ game, onPick, onSelect }: { game: Game; onPick: () => void; onSelect?: (id: string) => void }) {
  const s = game.state;
  const ids = rankedKnights(s).slice(0, 12);
  const [sel, setSel] = useState(s.squad[s.controlled] ?? ids[0] ?? null);
  useEffect(() => {
    if (sel) onSelect?.(sel);
  }, [sel, onSelect]);
  if (!sel) return null;
  const def = knightDef(sel);
  const pick = () => {
    const slot = s.squad.indexOf(sel);
    if (slot >= 0) s.controlled = slot;
    else {
      s.squad[s.controlled] = sel;
    }
    game.syncHub(true);
    uiSound('equip', 4);
    onPick();
  };
  return (
    <div className="char-select">
      <div className="cs-title">
        <Chunky text="CHOOSE YOUR KNIGHT" size={11} grad="gold" />
        <span className="lead outlined">The other two in your squad follow you into the dark.</span>
      </div>
      <div className="cs-stage">
        <div className="cs-light" style={{ ['--rc' as string]: RARITY_COLOR[def.rarity] }} />
        <HeroLive id={sel} mutation={s.roster[sel]?.mutation ?? null} s={2} style={crispKnight(2.2)} />
      </div>
      <div className="cs-name outlined">
        <Chunky text={def.name.toUpperCase()} size={9} grad="white" />
        <span style={{ color: RARITY_COLOR[def.rarity] }}>
          {RARITY_NAME[def.rarity]} {def.cls}
        </span>
        <span className="t-muted">
          Power <b className="t-gold">{fmt(knightRating(s, sel))}</b>
        </span>
      </div>
      <div className="cs-row">
        {ids.map((id) => (
          <button key={id} className={`cs-pick card ${id === sel ? 'on' : ''}`} style={{ ['--rc' as string]: RARITY_COLOR[knightDef(id).rarity] }} onClick={() => (setSel(id), uiSound('tap'))}>
            <HeroArt id={id} mutation={s.roster[id]?.mutation ?? null} s={1} />
          </button>
        ))}
      </div>
      <button className="btn gold big breathe" onClick={pick}>
        <Px icon="swords" s={1.5} />
        <span>
          PLAY AS {def.name.split(' ')[0].toUpperCase()}
          <span className="sub">to the hub</span>
        </span>
      </button>
    </div>
  );
}
