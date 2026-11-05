/**
 * A line's details, over the upgrade map (tap a hex that's already selected, or the card's icon or
 * name): what the line does, the tiers owned and what each brought, the next tier with its price and a
 * Buy button you can hold, and a "?" for the one after. Further tiers stay a mystery, as on the map.
 * The sheet is the skin's bolted plate (styles.css .modal), like the hero and settings sheets.
 */
import { effectAt, lineOf, nodeName, roman, HEX_BY_KEY, nodeKey, type HexNode } from '../../core/upgradeTree';
import { tier, upgradeCostAt, upgradeUnlocked } from '../../core/upgrades';
import type { Game } from '../../game';
import { Chunky } from '../common';
import { fmt } from '../format';
import { Px } from '../px';
import { CardTile, useHoldRepeat } from './parts';
import s from './hexmap.module.css';

export function UpgradePopup({ game, node, onBuy, onClose }: { game: Game; node: HexNode; onBuy: (repeat: number) => boolean; onClose: () => void }) {
  const st = game.state;
  const def = lineOf(node);
  const level = tier(st, def.id);
  const open = upgradeUnlocked(st, def.id) && level < def.max;
  const cost = upgradeCostAt(def, level);
  const afford = st.gold >= cost;
  const hold = useHoldRepeat(onBuy);
  const parent = def.requires ? HEX_BY_KEY.get(nodeKey(def.requires.id, def.requires.tier)) : undefined;
  const rungs: Array<{ t: number; state: 'owned' | 'open' | 'hidden' }> = [];
  for (let t = 1; t <= def.max; t++) {
    if (t <= level) rungs.push({ t, state: 'owned' });
    else if (t === level + 1 && open) rungs.push({ t, state: 'open' });
    else break;
  }
  const hidden = def.max - rungs.length;
  const view = level > 0 ? 'owned' : 'open';
  const head = HEX_BY_KEY.get(nodeKey(def.id, Math.max(1, Math.min(def.max, level || 1))))!;
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()} data-ui>
      <div className="sheet">
        <button className="btn red square x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className={s.popTop}>
          <CardTile node={head} view={view} />
          <div className={s.popNames}>
            <Chunky text={def.name.toUpperCase()} size={8} grad={def.special ? 'gold' : def.rolls ? 'green' : 'cream'} />
            <span className={s.popFrom}>
              {def.special && def.max === 1 ? 'Special: a one-off' : `Tier ${level} of ${def.max}`}
              {def.special && def.max > 1 ? ' · Special' : ''}
              {def.rolls ? ' · Chance' : ''}
            </span>
          </div>
        </div>
        <p className={s.popDesc}>{def.desc}</p>
        {parent && <span className={s.popFrom}>Grows from {nodeName(parent)}.</span>}
        <div className={s.ladder}>
          {rungs.map(({ t, state }) => (
            <div key={t} className={s.rung} data-state={state}>
              <b>{def.max > 1 ? roman(t) : '★'}</b>
              <span>{effectAt(st, def.id, t)}</span>
              {state === 'owned' ? (
                <Px icon="check" size="sm" />
              ) : (
                <span className={s.rungPrice}>
                  <Px icon="coin" size="xs" />
                  {fmt(upgradeCostAt(def, t - 1))}
                </span>
              )}
            </div>
          ))}
          {hidden > 0 && (
            <div className={s.rung} data-state="hidden">
              {hidden === 1 ? 'One more tier: ???' : `${hidden} more tiers: ??? (each one shows as you get close)`}
            </div>
          )}
        </div>
        <div className={s.popBuy}>
          {level >= def.max ? (
            <button className={`btn gold ${s.buy}`} disabled>
              <Px icon="check" size="sm" />
              {def.max === 1 ? 'OWNED' : 'MAXED'}
            </button>
          ) : open ? (
            <button className={`btn green ${s.buy}`} data-afford={afford} {...hold}>
              <Px icon="coin" size="sm" />
              <span>Buy {nodeName({ id: def.id, tier: level + 1 })} · {fmt(cost)}</span>
            </button>
          ) : (
            <button className={`btn ${s.buy}`} disabled>
              <Px icon="lock" size="sm" />
              {parent ? `Needs ${nodeName(parent)}` : 'LOCKED'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
