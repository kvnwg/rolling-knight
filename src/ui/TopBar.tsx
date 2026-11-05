/** The top bar (home and dungeon): settings, the rebirth progress, gold and the other currencies, luck. */
import { rebirthFloor } from '../core/newGame';
import type { Game } from '../game';
import { Bar } from './common';
import { fmt, secs } from './format';
import { Px } from './px';

export function TopBar({ game, onSettings, onLuck, left }: { game: Game; onSettings: () => void; onLuck: () => void; left?: React.ReactNode }) {
  const s = game.state;
  const need = rebirthFloor(s.rebirths);
  const potion = s.potionEndsAt ? Math.max(0, (s.potionEndsAt - Date.now()) / 1000) : 0;
  const luck = game.luck;
  return (
    <div className="topbar">
      <button className="btn navy square" onClick={onSettings} aria-label="Settings">
        <Px icon="gear" size="md" />
      </button>
      {left ?? (
        <div className="lvl glass">
          <span className="n">{s.rebirths}</span>
          <div className="col">
            <span className="outlined">
              Rebirth {s.rebirths} <span className="t-muted">· floor {s.run.bestFloor}/{need}</span>
            </span>
            <Bar value={s.run.bestFloor / need} kind="gold" />
          </div>
        </div>
      )}
      <div className="grow" />
      <div className="stack">
        <div className="row">
          <span className="pill outlined num">
            <Px icon="coin" size="sm" />
            {fmt(s.gold)}
          </span>
          {s.hourglasses > 0 && (
            <span className="pill outlined num" title="Hourglasses: each makes one spin twice as fast">
              <Px icon="hourglass" />
              {s.hourglasses}
            </span>
          )}
          {s.rebirths > 0 && (
            <span className="pill outlined num" title="Sigils buy perks">
              <Px icon="sigil" />
              {s.sigils}
            </span>
          )}
        </div>
        <button className="pill outlined num" onClick={onLuck} title="Luck: tap for the odds">
          <Px icon="clover" size="sm" />
          <span className="t-muted">Luck</span>
          <span style={{ color: '#9ef06b' }}>×{luck < 100 ? luck.toFixed(2) : fmt(luck)}</span>
          {potion > 0 && <span className="t-muted">potion {secs(potion)}</span>}
        </button>
      </div>
    </div>
  );
}
