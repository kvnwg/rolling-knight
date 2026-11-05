/**
 * Spare copies: you own each knight once, and every later pull of it is a spare copy. Break down
 * turns spare copies into that knight's shards (which level it up); Sell turns them into gold. The
 * knight itself is never broken down or sold. On screen it's icons and numbers (a shard for break
 * down, a coin for sell); the words are one tap away, in HelpButton's legend.
 *  - LevelPanel and SparePanel: the knight sheet's level, shards and Level up, and its own Break
 *    down / Sell (one, or all of them), each showing what it takes and gives; every press shows.
 *  - BulkSpares: the scrap dealer's every-spare-at-once, which lists exactly what goes and asks first.
 *  - SpareRules: what happens to a spare copy the moment it lands, by rarity.
 */
import { useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { BAL } from '../core/balance';
import { knightDef } from '../core/knights';
import { RARITIES, RARITY_COLOR, RARITY_NAME } from '../core/rarity';
import { canLevel, levelCost, levelUp, sellAll, sellDupes, shardAll, shardDupes, spareList, spareYield } from '../core/roster';
import type { DupeRule } from '../core/state';
import type { Game } from '../game';
import { Bar, Section } from './common';
import { fmt } from './format';
import type { RosterFx } from './fx/Pops';
import { Bump, Flash, SpareChip } from './KnightCard';
import { Px, type IconName } from './px';
import { uiSound } from './sound';

interface PanelProps {
  game: Game;
  id: string;
  fx: RosterFx;
  /** Where shards land (the shard bar) and gold lands (the gold readout). */
  shardRef: RefObject<HTMLDivElement | null>;
  goldRef: RefObject<HTMLSpanElement | null>;
  onChange: () => void;
}

/** Your gold, bumping when it changes (sold copies fly into it). */
export function GoldReadout({ gold, goldRef, className }: { gold: number; goldRef: RefObject<HTMLSpanElement | null>; className?: string }) {
  return (
    <span className={`pill outlined num kgold ${className ?? ''}`} ref={goldRef} title="Your gold">
      <Px icon="coin" size="sm" />
      <Bump value={gold}>{fmt(gold)}</Bump>
    </span>
  );
}

/** "Break 3 → [shard] +3": what a button does and what it gives ("[copies] 3 → ..." without a verb). */
function Trade({ n, give, icon, verb }: { n?: number; give?: string; icon: IconName; verb?: string }) {
  return (
    <span className="ktrade num">
      {verb ? <span>{verb}</span> : <Px icon="copies" size="sm" />}
      {n !== undefined && <b>{n}</b>}
      <Px icon="arrowRight" size="xs" className="kto" />
      <Px icon={icon} size="sm" />
      {give !== undefined && <b>{give}</b>}
    </span>
  );
}

/** A "?" that opens the legend: what spare copies are, and what each icon stands for. */
export function HelpButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={`khelp ${className ?? ''}`}
        aria-label="What the icons mean"
        onClick={(e) => {
          e.stopPropagation();
          uiSound('tap');
          setOpen(true);
        }}
      >
        ?
      </button>
      {open && typeof document !== 'undefined' && createPortal(<Legend onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function Legend({ onClose }: { onClose: () => void }) {
  return (
    <div className="kpop-back" onPointerDown={(e) => (e.stopPropagation(), onClose())}>
      <div className="kpop glass outlined" role="dialog" aria-label="What the icons mean">
        <b className="t-gold">Spare copies</b>
        <p>
          <Px icon="copies" size="sm" /> Extra pulls of a knight you already own. The knight itself always stays.
        </p>
        <p>
          <Px icon="shard" /> Break down: shards for that knight, to level it up.
        </p>
        <p>
          <Px icon="coin" size="sm" /> Sell: gold.
        </p>
        <div className="kpop-icons">
          <span>
            <Px icon="might" size="sm" /> Power
          </span>
          <span>
            <Px icon="heart" size="sm" /> HP
          </span>
          <span>
            <Px icon="sword" size="sm" /> Attack
          </span>
          <span>
            <Px icon="dice" size="sm" /> Odds at the altar
          </span>
          <span>
            <Px icon="crown" size="sm" /> Leader: the knight you play
          </span>
        </div>
      </div>
    </div>
  );
}

/** The knight's level: shards toward the next one (spare copies break down into these) and Level up. */
export function LevelPanel({ game, id, fx, shardRef, onChange }: PanelProps) {
  const s = game.state;
  const rec = s.roster[id];
  const def = knightDef(id);
  const max = rec.level >= BAL.roster.maxLevel;
  const cost = levelCost(rec.level);
  const ready = canLevel(s, id);
  return (
    <section className="kpanel klevel">
      <span className="klv outlined num" title={`Level ${rec.level}`}>
        <small>LEVEL</small>
        <Bump value={rec.level} />
      </span>
      <div className="kshards" ref={shardRef} title={max ? 'Max level' : `Shards: ${rec.shards} of ${cost.shards} for level ${rec.level + 1}`}>
        <span className="outlined num">
          <Px icon="shard" /> Shards <Bump value={rec.shards} className="kshard-n" />
          {max ? ' (max level)' : `/${cost.shards}`}
        </span>
        <div className="kbar">
          <Bar value={max ? 1 : rec.shards / cost.shards} kind="sp" />
          <Flash value={rec.shards} />
        </div>
      </div>
      <button
        className={`btn green small${ready ? ' kready' : ''}`}
        disabled={!ready}
        aria-label={max ? 'Max level' : `Level up for ${fmt(cost.gold)} gold and ${cost.shards} shards`}
        onClick={() => {
          if (!levelUp(s, id)) return;
          uiSound('levelUp');
          fx.note(`${def.name}: Lv ${rec.level}!`, '#8af07a');
          onChange();
        }}
      >
        <Px icon="arrowUp" size="sm" />
        {max ? 'MAX' : 'LEVEL UP'}
        {!max && (
          <span className={`kcost num${s.gold < cost.gold ? ' short' : ''}`}>
            <Px icon="coin" size="xs" />
            {fmt(cost.gold)}
          </span>
        )}
      </button>
    </section>
  );
}

/** The knight's own spare copies: break down or sell one, or all of them. */
export function SparePanel({ game, id, fx, shardRef, goldRef, onChange }: PanelProps) {
  const s = game.state;
  const rec = s.roster[id];
  const n = rec.dupes;
  const one = spareYield(s, id, 1);
  const all = spareYield(s, id);
  const breakDown = (k: number, btn: HTMLElement) => {
    const got = shardDupes(s, id, k);
    if (got <= 0) return;
    uiSound('breakDown');
    fx.pop(btn, shardRef.current, `+${got}`, 'shard');
    onChange();
  };
  const sell = (k: number, btn: HTMLElement) => {
    const got = sellDupes(s, id, k);
    if (got <= 0) return;
    uiSound('sell', k >= 10 ? 2 : k >= 3 ? 1 : 0);
    fx.pop(btn, goldRef.current, `+${fmt(got)}`, 'gold');
    onChange();
  };
  const copies = (k: number) => `${k} spare ${k === 1 ? 'copy' : 'copies'}`;
  return (
    <section className="kpanel">
      <div className="spread">
        <span className={`kspare-count outlined${n ? '' : ' none'}`} title={copies(n)}>
          <Bump value={n}>
            <SpareChip n={n} />
          </Bump>
          <span>{n ? copies(n) : 'No spare copies'}</span>
        </span>
        <HelpButton />
      </div>
      <p className="kspare-why">Repeats of this knight. Break them into shards to level it up, or sell them for gold.</p>
      <div className="kspare-grid">
        <button className="btn blue small" disabled={n < 1} aria-label={`Break down 1 spare copy: +${one.shards} shards`} onClick={(e) => breakDown(1, e.currentTarget)}>
          <Trade verb="Break" n={1} give={n >= 1 ? `+${one.shards}` : undefined} icon="shard" />
        </button>
        <button className="btn blue small" disabled={n < 2} aria-label={`Break down all ${copies(n)}: +${all.shards} shards`} onClick={(e) => breakDown(n, e.currentTarget)}>
          <Trade verb="Break" n={n >= 2 ? n : undefined} give={n >= 2 ? `+${all.shards}` : undefined} icon="shard" />
        </button>
        <button className="btn gold small" disabled={n < 1} aria-label={`Sell 1 spare copy: +${fmt(one.gold)} gold`} onClick={(e) => sell(1, e.currentTarget)}>
          <Trade verb="Sell" n={1} give={n >= 1 ? `+${fmt(one.gold)}` : undefined} icon="coin" />
        </button>
        <button className="btn gold small" disabled={n < 2} aria-label={`Sell all ${copies(n)}: +${fmt(all.gold)} gold`} onClick={(e) => sell(n, e.currentTarget)}>
          <Trade verb="Sell" n={n >= 2 ? n : undefined} give={n >= 2 ? `+${fmt(all.gold)}` : undefined} icon="coin" />
        </button>
      </div>
    </section>
  );
}

/**
 * The scrap dealer's every-spare-at-once: break down or sell the spare copies of every knight. It
 * lists exactly what goes (how many copies of which knights, for what) and only acts once you
 * confirm. Your knights all stay.
 */
export function BulkSpares({ game, fx }: { game: Game; fx: RosterFx }) {
  const s = game.state;
  const [ask, setAsk] = useState<'shard' | 'sell' | null>(null);
  const goldRef = useRef<HTMLSpanElement>(null);
  const list = spareList(s);
  const total = list.reduce((a, x) => a + x.copies, 0);
  const shards = list.reduce((a, x) => a + x.shards, 0);
  const gold = list.reduce((a, x) => a + x.gold, 0);
  const confirm = (btn: HTMLElement) => {
    if (ask === 'shard') {
      const got = shardAll(s);
      if (got > 0) {
        uiSound('breakDown');
        fx.pop(btn, null, `+${fmt(got)}`, 'shard');
      }
    } else if (ask === 'sell') {
      const got = sellAll(s);
      if (got > 0) {
        uiSound('sell', 2);
        fx.pop(btn, goldRef.current, `+${fmt(got)}`, 'gold');
      }
    }
    setAsk(null);
    game.touch();
  };
  if (total === 0) return null;
  return (
    <Section title="All at once" right={<GoldReadout gold={s.gold} goldRef={goldRef} />}>
      {!ask ? (
        <div className="row kbulk">
          <button className="btn blue small" aria-label={`Break down all ${total} spare copies: +${shards} shards (shows the list first)`} onClick={() => (uiSound('tap'), setAsk('shard'))}>
            <Trade n={total} give={`+${fmt(shards)}`} icon="shard" />
          </button>
          <button className="btn gold small" aria-label={`Sell all ${total} spare copies: +${fmt(gold)} gold (shows the list first)`} onClick={() => (uiSound('tap'), setAsk('sell'))}>
            <Trade n={total} give={`+${fmt(gold)}`} icon="coin" />
          </button>
        </div>
      ) : (
        <div className="kconfirm glass" role="dialog" aria-label={ask === 'shard' ? 'Break down every spare copy?' : 'Sell every spare copy?'}>
          <b className="outlined">
            <Trade n={total} give={ask === 'shard' ? `+${fmt(shards)}` : `+${fmt(gold)}`} icon={ask === 'shard' ? 'shard' : 'coin'} /> ?
          </b>
          <ul>
            {list.map((x) => {
              const d = knightDef(x.id);
              return (
                <li key={x.id} className="num">
                  <span style={{ color: RARITY_COLOR[d.rarity] }}>{d.name}</span>
                  <Trade n={x.copies} give={ask === 'shard' ? `+${fmt(x.shards)}` : `+${fmt(x.gold)}`} icon={ask === 'shard' ? 'shard' : 'coin'} />
                </li>
              );
            })}
          </ul>
          <div className="row">
            <button className={`btn small ${ask === 'shard' ? 'blue' : 'gold'}`} onClick={(e) => confirm(e.currentTarget)}>
              <Px icon="check" size="sm" />
              {ask === 'shard' ? 'Break down' : 'Sell'}
            </button>
            <button className="btn navy small" onClick={() => (uiSound('tap'), setAsk(null))}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

/** What happens to a spare copy the moment it lands, by rarity. */
export function SpareRules({ game }: { game: Game }) {
  const s = game.state;
  const [, bump] = useState(0);
  return (
    <Section title="New spares" sub={<Px icon="copies" size="sm" />} right={<HelpButton />}>
      <div className="glass krules">
        {RARITIES.map((r) => (
          <label key={r} className="spread outlined">
            <span style={{ color: RARITY_COLOR[r] }}>{RARITY_NAME[r]}</span>
            <select
              className="select"
              value={s.dupeRules[r] ?? 'keep'}
              onChange={(e) => {
                s.dupeRules[r] = e.target.value as DupeRule;
                bump((x) => x + 1);
                game.touch();
              }}
            >
              <option value="keep">Keep</option>
              <option value="shard">Break down</option>
              <option value="sell">Sell</option>
            </select>
          </label>
        ))}
      </div>
    </Section>
  );
}
