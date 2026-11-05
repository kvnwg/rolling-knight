/**
 * The hub's screens. You walk your knight round the hub (drawn by the renderer like any floor); this
 * is what sits on top of it:
 *  - HubHud: the top bar, the little altar (the rolling never stops), and the prompt to talk to the
 *    keeper you're standing by;
 *  - StationSheet: a keeper's counter, opened by talking to them: the altar, the smith, the scrapper,
 *    the quartermaster, the tinker, the sage, the shrine, the notice board, the gate; each one the
 *    shared keeper screen (src/ui/keeper/: the keeper at their counter, tabs, offers as cards);
 *  - CharacterSelect: who you play as, when the game opens.
 * In the dungeon none of this is reachable: to change your squad or spend anything you leave, or fall.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { sfx } from '../audio/sfx';
import { knightDef } from '../core/knights';
import { CHALLENGE, floorDifficulty, knightRating, squadPower } from '../core/power';
import { RARITY_COLOR, RARITY_NAME } from '../core/rarity';
import { rankedKnights } from '../core/roster';
import type { Game } from '../game';
import { npcFrame } from '../render/art/npcs';
import { toCanvas } from '../render/art/draw';
import { biomeForFloor } from '../world/biomes';
import { type HubStation, type StationId } from '../world/hubWorld';
import { Chunky, HeroArt, HeroLive } from './common';
import { AltarReels } from './fx/AltarReels';
import { fmt } from './format';
import { BoardShop, OracleShop, SageShop, ShrineShop, WardenShop } from './keeper/Shops';
import { TinkerShop } from './keeper/TinkerShop';
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
  // Out of the way once you're going down the steps (it sits over them).
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
              Next: floor {floor}
              <span className="dchip" style={{ ['--cc' as string]: ch.color, ['--seal' as string]: `var(--sk-seal-${diff.challenge})` }}>
                {ch.name.toUpperCase()}
              </span>
              <span className="sep"> · </span>
              <span className="foes">{biomeForFloor(floor, s.run.biomeSeed).name}</span>
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
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ a keeper's counter

/** A keeper's counter: their own screen in the shared layout (src/ui/keeper/). */
export function StationSheet({ game, station, onOpen, onClose }: { game: Game; station: HubStation; onOpen: (id: string) => void; onClose: () => void }) {
  useEffect(() => {
    if (station.id !== 'altar') return;
    sfx.setAltarFocus(true);
    return () => sfx.setAltarFocus(false);
  }, [station]);
  const p = { game, station, onClose };
  switch (station.id) {
    case 'altar':
      return <OracleShop {...p} onOpen={onOpen} />;
    case 'upgrades':
      return <TinkerShop {...p} />;
    case 'perks':
      return <SageShop {...p} />;
    case 'rebirth':
      return <ShrineShop {...p} />;
    case 'quests':
      return <BoardShop {...p} />;
    case 'gate':
      return <WardenShop {...p} onOpen={onOpen} />;
    // (The quartermaster, the smith and the scrap dealer are gone: the Warden does their jobs, and
    // duplicates turn into gold as they're rolled.)
    default:
      return null;
  }
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
