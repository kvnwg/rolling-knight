/**
 * Back after time away, once you've pressed PLAY (the game opens on its title, not on this): how
 * long you were gone, then what the altar rolled meanwhile laid out tier by tier, rarest first, each
 * with its own icon, how many, a bar for how many next to the rest, and how many of them are new;
 * the best find standing in its rarity's little scene; the gold your squad brought back and the
 * repeats kept as extras. COLLECT puts it away. On a portal with rewarded ads there's a second button
 * the same size beside it: the squad's gold twice over, for watching one (once per report).
 */
import { useEffect, useState } from 'react';
import type { Game } from '../game';
import { portal } from '../platform/portal';
import type { OfflineReport } from '../core/offline';
import { RARITIES, RARITY_COLOR, RARITY_NAME, rarityIndex, type Rarity } from '../core/rarity';
import { CLASSES, knightDef } from '../core/knights';
import { Chunky } from './fx/Chunky';
import { fmt, secs } from './format';
import { KnightTile } from './KnightCard';
import { Px } from './px';
import { uiSound } from './sound';

interface TierLine {
  rarity: Rarity;
  n: number;
  fresh: number;
}

/** The pulls counted by tier, rarest first (only the tiers that turned up). */
export function tally(report: Pick<OfflineReport, 'kept'>): TierLine[] {
  const by = new Map<Rarity, TierLine>();
  for (const k of report.kept) {
    const t = by.get(k.rarity) ?? { rarity: k.rarity, n: 0, fresh: 0 };
    t.n += 1;
    if (k.isNew) t.fresh += 1;
    by.set(k.rarity, t);
  }
  return [...RARITIES].reverse().flatMap((r) => (by.has(r) ? [by.get(r)!] : []));
}

/** The best of the pulls: the rarest, a new one before a repeat. */
function bestFind(report: Pick<OfflineReport, 'kept'>): OfflineReport['kept'][number] | null {
  let best: OfflineReport['kept'][number] | null = null;
  for (const k of report.kept) {
    if (!best || rarityIndex(k.rarity) > rarityIndex(best.rarity) || (k.rarity === best.rarity && k.isNew && !best.isNew)) best = k;
  }
  return best;
}

export function WelcomeBack({ game, report, onClose }: { game: Game; report: OfflineReport; onClose: () => void }) {
  const lines = tally(report);
  const most = Math.max(1, ...lines.map((l) => l.n));
  const best = bestFind(report);
  const repeats = report.kept.filter((k) => !k.isNew).length;
  useEffect(() => uiSound('open'), []);
  const collect = () => {
    uiSound('collect', 3);
    onClose();
  };
  // The gold again for watching an ad: an offer beside COLLECT, never in its way.
  const [ad, setAd] = useState<'idle' | 'wait' | 'none'>('idle');
  const canDouble = portal.rewards && report.gold > 0 && !report.doubled;
  const double = async () => {
    if (ad === 'wait') return;
    setAd('wait');
    const outcome = await portal.ad('rewarded');
    if (outcome === 'done') {
      game.doubleAway(report);
      collect();
    } else setAd(outcome === 'none' ? 'none' : 'idle');
  };
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && ad !== 'wait' && collect()}>
      <div className="sheet wb-sheet">
        <div className="hero-banner">
          <Chunky text="WELCOME BACK" size={10} grad="gold" />
          <span className="lead outlined">You were away {secs(report.seconds)}</span>
        </div>
        {report.rolls > 0 && (
          <section className="wb-rolled">
            <div className="wb-head outlined">
              <Px icon="reel" size="sm" /> The altar rolled <b className="num">{fmt(report.rolls)}</b> {report.rolls === 1 ? 'time' : 'times'}
            </div>
            <div className="wb-body">
              {best && (
                <div className="wb-best">
                  <KnightTile
                    id={best.knightId}
                    mutation={best.mutation}
                    rarity={best.rarity}
                    name={knightDef(best.knightId).name}
                    meta={<span style={{ color: RARITY_COLOR[best.rarity] }}>{CLASSES[knightDef(best.knightId).cls].name}</span>}
                    top={best.isNew ? <span className="ktag new">NEW</span> : <span className="ktag best">BEST</span>}
                  />
                </div>
              )}
              <ol className="wb-tally" aria-label="Knights rolled, by rarity">
                {lines.map((l, i) => (
                  <li key={l.rarity} className="wb-tier" style={{ ['--rc' as string]: RARITY_COLOR[l.rarity], ['--i' as string]: i }}>
                    <Px icon={`tier:${l.rarity}`} size="md" className="wb-gem" />
                    <span className="wb-name">
                      <span className="outlined">{RARITY_NAME[l.rarity]}</span>
                      {l.fresh > 0 && <span className="ktag new">{l.fresh} NEW</span>}
                    </span>
                    <b className="wb-n num outlined">×{fmt(l.n)}</b>
                    <i className="wb-bar" aria-hidden>
                      <i style={{ width: `${Math.max(6, (Math.log10(l.n + 1) / Math.log10(most + 1)) * 100)}%` }} />
                    </i>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}
        <div className="wb-gains">
          {report.gold > 0 && (
            <span className="wb-gain outlined">
              <Px icon="coin" size="sm" /> <b className="num">+{fmt(report.gold)}</b> gold from your squad's fights
            </span>
          )}
          {repeats > 0 && (
            <span className="wb-gain outlined">
              <Px icon="tier:common" size="sm" /> <b className="num">{fmt(repeats)}</b> {repeats === 1 ? 'repeat' : 'repeats'} kept as extras
            </span>
          )}
        </div>
        {canDouble ? (
          <div className="wb-collect">
            <button className="btn gold big" onClick={collect} disabled={ad === 'wait'}>
              COLLECT
            </button>
            <button className="btn gold big" onClick={double} disabled={ad === 'wait'}>
              <span>
                GOLD ×2
                <span className="sub">watch an ad</span>
              </span>
            </button>
          </div>
        ) : (
          <button className="btn gold big" onClick={collect}>
            COLLECT
          </button>
        )}
        {ad === 'none' && <span className="lead outlined wb-noad">No ad to show right now. Try again in a little while.</span>}
      </div>
    </div>
  );
}
