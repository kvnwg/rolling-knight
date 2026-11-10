/**
 * The hub's screens. You walk your knight round the hub (drawn by the renderer like any floor); this
 * is what sits on top of it:
 *  - HubHud: the top bar, the little altar (the rolling never stops), and the prompt to talk to the
 *    keeper you're standing by;
 *  - StationSheet: a keeper's counter, opened by talking to them: the altar, the broker (your
 *    extras), the tinker, the sage, the shrine, the notice board, the gate; each one the shared
 *    keeper screen (src/ui/keeper/: the keeper at their counter, tabs, offers as cards);
 *  - TitleScreen: the game's name and PLAY, over the camp at dusk, when the game opens.
 * In the dungeon none of this is reachable: to change your squad or spend anything you leave, or fall.
 */
import { useEffect, useMemo } from 'react';
import { sfx } from '../audio/sfx';
import { CHALLENGE, floorDifficulty, squadPower } from '../core/power';
import { squadSize } from '../core/roster';
import type { Game } from '../game';
import { npcFrame } from '../render/art/npcs';
import { toCanvas } from '../render/art/draw';
import { biomeForFloor } from '../world/biomes';
import { type HubStation, type StationId } from '../world/hubWorld';
import { Chunky } from './common';
import { AltarReels } from './fx/AltarReels';
import { BrokerShop } from './keeper/BrokerShop';
import { BoardShop, OracleShop, SageShop, ShrineShop, WardenShop } from './keeper/Shops';
import { TinkerShop } from './keeper/TinkerShop';
import { Px, type IconName } from './px';
import { uiSound } from './sound';
import { TopBar } from './TopBar';
import { RebirthPill } from './RebirthPill';

const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

const STATION_ICON: Record<StationId, IconName> = {
  altar: 'reelGold',
  smith: 'arrowUp',
  scrap: 'copies',
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
  const diff = floorDifficulty(floor, squadPower(s), squadSize(s));
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
      <RebirthPill
        game={game}
        onGo={() => {
          const shrine = game.hub?.stations.find((x) => x.id === 'rebirth');
          if (shrine) onTalk(shrine);
        }}
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
              {near.id === 'gate' ? 'SQUAD' : near.def ? 'TALK' : 'READ'}
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
    case 'scrap':
      return <BrokerShop {...p} onOpen={onOpen} />;
    // (The quartermaster and the smith are gone: the Warden does their jobs.)
    default:
      return null;
  }
}

// ------------------------------------------------------------------ who you play as

/**
 * The title screen the game opens on: the camp by the lake at dusk behind it (VistaCanvas, your
 * squad round the fire), the game's name, and PLAY. Who you play as is picked at the Warden's
 * counter (LEAD), not here.
 */
export function TitleScreen({ game, onPlay }: { game: Game; onPlay: () => void }) {
  const s = game.state;
  const fresh = Object.keys(s.roster).length === 0;
  const play = () => {
    game.syncHub(true);
    uiSound('equip', 4);
    onPlay();
  };
  return (
    <div className="char-select title-screen">
      <div className="cs-title">
        <Chunky text="ROLLING KNIGHT" size={14} grad="gold" />
        <span className="lead outlined">{fresh ? 'Roll your knights. Delve the dark. Come back stronger.' : `Best floor ${s.records.bestFloorEver}${s.rebirths ? ` · Rebirth ${s.rebirths}` : ''}`}</span>
      </div>
      <button className="btn gold big breathe ts-play" onClick={play}>
        <Px icon="swords" s={1.5} />
        <span>
          PLAY
          <span className="sub">{fresh ? 'roll your first knights' : 'to the hub'}</span>
        </span>
      </button>
    </div>
  );
}
