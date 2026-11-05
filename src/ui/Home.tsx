/**
 * The home screen: the camp's vista fills the screen behind (its own canvas, mounted by App), the
 * top bar, and the panel for the open tab over frosted glass, with the tabs at the bottom. On wide
 * screens the panel sits on the right and the scene keeps the rest.
 */
import { perksOpen } from '../core/perks';
import { totalDupes } from '../core/roster';
import type { Game } from '../game';
import { CampPanel, HeroesPanel, PerksPanel, RebirthPanel, SummonPanel, UpgradesPanel, type HomeTab } from './panels';
import { Px, type IconName } from './px';
import { uiSound } from './sound';
import { TopBar } from './TopBar';

const TABS: Array<[HomeTab, string, IconName]> = [
  ['camp', 'Camp', 'tent'],
  ['summon', 'Summon', 'reelGold'],
  ['heroes', 'Heroes', 'helm'],
  ['upgrades', 'Upgrades', 'arrowUp'],
  ['perks', 'Perks', 'sigil'],
  ['rebirth', 'Rebirth', 'rebirth'],
];

export function Home({ game, tab, setTab, wide, onOpen, onSettings, onLuck }: {
  game: Game;
  tab: HomeTab;
  setTab: (t: HomeTab) => void;
  wide: boolean;
  onOpen: (id: string) => void;
  onSettings: () => void;
  onLuck: () => void;
}) {
  const s = game.state;
  const unread = totalDupes(s) + Object.values(s.roster).filter((r) => r.isNew).length;
  return (
    <div className="home" data-layout={wide ? 'wide' : 'tall'}>
      <div className="scene">
        <TopBar game={game} onSettings={onSettings} onLuck={onLuck} />
      </div>
      <div className="lower" key={tab}>
        <div className="lower-inner fade-in">
          {tab === 'camp' && <CampPanel game={game} onOpen={onOpen} onTab={setTab} />}
          {tab === 'summon' && <SummonPanel game={game} onOpen={onOpen} />}
          {tab === 'heroes' && <HeroesPanel game={game} onOpen={onOpen} />}
          {tab === 'upgrades' && <UpgradesPanel game={game} />}
          {tab === 'perks' && <PerksPanel game={game} />}
          {tab === 'rebirth' && <RebirthPanel game={game} />}
        </div>
      </div>
      <nav className="nav">
        {TABS.map(([id, label, icon]) => {
          const locked = id === 'perks' && !perksOpen(s);
          return (
            <button
              key={id}
              className={`tab outlined ${tab === id ? 'active' : ''} ${locked ? 'locked' : ''}`}
              onClick={() => {
                uiSound('tap');
                setTab(id);
              }}
            >
              <Px icon={icon} size="md" s={1} />
              {label}
              {id === 'heroes' && unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
              {locked && <Px icon="lock" size="xs" style={{ position: 'absolute', top: 'calc(2 * var(--px))', right: '24%' }} />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
