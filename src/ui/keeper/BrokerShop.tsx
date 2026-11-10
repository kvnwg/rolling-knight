/**
 * Bram the Broker's counter: your extras, the repeat pulls of knights you already have, a card for
 * each knight that has some, SELL on each and SELL ALL EXTRAS along the foot.
 *
 * An extra is only gold to be: what it fetches was locked in the moment it landed, and selling it
 * never touches the knight it's a copy of. Everything here says so: the hint under the purse; each
 * card's picture (the knight in front, lilac copies of it stacked behind, the count on the stack)
 * under a purple EXTRA tag; and once sold, the card stays put for the rest of the visit with the
 * knight alone in it, KEPT, its level and mutation as they were. Only the copies flash gold and turn
 * into coins that fly into the purse: the knight stays standing where it was. With nothing to sell,
 * the counter shows what an extra would look like, on the knight you play.
 */
import { useState } from 'react';
import { knightDef } from '../../core/knights';
import { rarityIndex } from '../../core/rarity';
import { extrasCount, extrasList, extrasValue, sellAllExtras, sellExtras } from '../../core/roster';
import type { MutationId } from '../../core/state';
import type { Game } from '../../game';
import type { HubStation } from '../../world/hubWorld';
import { ClassTag } from '../ClassTag';
import { HeroArt } from '../common';
import { fmt } from '../format';
import { coinFly } from '../fx/coinFly';
import { Px } from '../px';
import { uiSound } from '../sound';
import { KeeperScreen, Purse, ShopBody, ShopFoot, ShopGrid, ShopHint, ShopTop, Stat, keeperStyles as s, useGameTick } from './KeeperScreen';
import { OfferCard } from './OfferCard';

/** "1 extra", "3 extras". */
export function extrasText(n: number): string {
  return `${n} extra${n === 1 ? '' : 's'}`;
}

/**
 * A knight with its extras: the knight in front, drawn again behind itself up and to the left (once,
 * or twice for two or more) as lilac copies, and the count on a tab at the stack's foot. The copies
 * alone are marked (data-extras), so a sale turns them into coins and leaves the knight standing.
 */
export function ExtraStack({ id, mutation, n, count = true }: { id: string; mutation: MutationId | null; n: number; count?: boolean }) {
  return (
    <span className={s.stack}>
      <span className={s.ghosts} data-extras aria-hidden>
        {n > 1 && (
          <span className={s.ghost} data-far>
            <HeroArt id={id} mutation={mutation} s={1} ghost />
          </span>
        )}
        <span className={s.ghost}>
          <HeroArt id={id} mutation={mutation} s={1} ghost />
        </span>
      </span>
      <HeroArt id={id} mutation={mutation} s={1} />
      {count && <b className={s.stackN}>×{n}</b>}
    </span>
  );
}

export function BrokerShop({ game, station, onClose, onOpen }: { game: Game; station: HubStation; onClose: () => void; onOpen: (id: string) => void }) {
  useGameTick(game);
  const st = game.state;
  // Knights whose extras were sold on this visit, and for how much: their cards stay, KEPT.
  const [sold, setSold] = useState<Record<string, number>>({});
  const [said, setSaid] = useState<string | null>(null);
  // Gold from a sale still flying in as coins: the purse shows it as they land.
  const [owed, setOwed] = useState(0);
  const count = extrasCount(st);
  const lead = [st.squad[st.controlled], ...st.squad].find((id) => id && st.roster[id]) ?? null;
  const total = extrasValue(st);
  const waiting = extrasList(st);
  // The cards: every knight with extras and every one just sold, rarest first (new extras landing
  // while you look never shuffle the cards under your finger).
  const cards = [...new Set([...waiting, ...Object.keys(sold).filter((id) => st.roster[id])])].sort(
    (a, b) => rarityIndex(knightDef(b).rarity) - rarityIndex(knightDef(a).rarity) || a.localeCompare(b),
  );

  /** Coins out of a card's copies (or the SELL ALL button) into the purse, `g` gold among them. */
  const fly = (from: Element | null, g: number, coins: number) => {
    const purse = document.querySelector('[data-keeper] [data-purse]');
    let paid = 0;
    setOwed((o) => o + g);
    coinFly(from, purse, {
      coins,
      reduceMotion: st.settings.reduceMotion,
      onLand: (i, last) => {
        const share = last ? g - paid : Math.floor(g / coins);
        paid += share;
        setOwed((o) => Math.max(0, o - share));
        if (last || i % 3 === 0) uiSound('collect', Math.min(4, Math.floor(i / 3)));
      },
    });
  };
  const copiesOf = (id: string) => document.querySelector(`[data-keeper] [data-card="${id}"] [data-extras]`);

  const sell = (id: string): boolean => {
    const n = st.roster[id]?.extras ?? 0;
    if (n <= 0) return false;
    const from = copiesOf(id);
    const g = sellExtras(st, id);
    const name = knightDef(id).name;
    // (More coins in the ka-ching for more extras.)
    uiSound('sell', Math.min(2, n - 1));
    setSold((m) => ({ ...m, [id]: (m[id] ?? 0) + g }));
    setSaid(`Sold ${name}'s ${extrasText(n)} for ${fmt(g)} gold. ${name} stays the same.`);
    fly(from, g, Math.min(9, 3 + n));
    game.touch();
    return true;
  };

  const sellAll = () => {
    if (count <= 0) return;
    // Each card's copies fly (the ones on the screen), the rest of the gold from the button.
    const list = waiting.map((id) => ({ id, n: st.roster[id].extras, g: st.roster[id].extrasGold, from: copiesOf(id) }));
    const button = document.querySelector('[data-keeper] [data-sell-all]');
    const view = document.querySelector('[data-keeper] [data-cards]')?.parentElement?.getBoundingClientRect();
    const g = sellAllExtras(st);
    // A haul: longer for more of them.
    uiSound('haul', count >= 12 ? 2 : count >= 4 ? 1 : 0);
    setSold((m) => {
      const next = { ...m };
      for (const x of list) next[x.id] = (next[x.id] ?? 0) + x.g;
      return next;
    });
    setSaid(`Sold ${extrasText(count)} for ${fmt(g)} gold. Every knight stays the same.`);
    let rest = 0;
    let flown = 0;
    for (const x of list) {
      const r = x.from?.getBoundingClientRect();
      const seen = !!r && !!view && r.bottom > view.top && r.top < view.bottom;
      if (seen && flown < 6) {
        fly(x.from, x.g, Math.min(5, 2 + x.n));
        flown++;
      } else rest += x.g;
    }
    if (rest > 0) fly(button, rest, Math.min(8, 3 + Math.round(Math.log10(1 + rest))));
    game.touch();
  };

  return (
    <KeeperScreen game={game} station={station} tabs={[{ id: 'extras', label: 'EXTRAS', icon: 'copies', badge: count }]} tab="extras" onTab={() => {}} onClose={onClose}>
      <ShopTop
        purse={<Purse amount={st.gold - owed} />}
        title={
          <span className={s.chips} style={{ justifyContent: 'flex-end' }}>
            <Stat icon="copies" label="Extras" title="Extras waiting to be sold">
              {count}
            </Stat>
            <Stat icon="coin" label="Worth" title="What they'd all fetch">
              {fmt(total)}
            </Stat>
          </span>
        }
      />
      <ShopHint>
        {said ? (
          <b className={s.goodLine}>
            <Px icon="coin" size="xs" /> {said}
          </b>
        ) : (
          <>
            <b>Extras</b> are repeat pulls of knights you have. Selling them <b>never touches your knight</b>: its level, mutation and squad place stay.
          </>
        )}
      </ShopHint>
      <ShopBody>
        {cards.length === 0 ? (
          <div className={s.empty}>
            {/* What an extra looks like: the knight you play, and a copy of it behind. */}
            {lead ? (
              <span className={`${s.well} ${s.emptyWell}`} data-tall>
                <ExtraStack id={lead} mutation={st.roster[lead].mutation} n={1} count={false} />
              </span>
            ) : (
              <Px icon="copies" size="lg" s={2} />
            )}
            <div>
              <b>No extras yet.</b>
              <br />
              When the Oracle's altar pulls a knight you already have, the copy comes to me as an <b>extra</b>, ready to sell.
            </div>
          </div>
        ) : (
          <div data-cards>
            <ShopGrid>
              {cards.map((id) => {
                const rec = st.roster[id];
                const def = knightDef(id);
                if (rec.extras <= 0) {
                  // Sold this visit: the knight alone, kept, as it was.
                  return (
                    <OfferCard
                      key={id}
                      cardId={id}
                      level={`Lv ${rec.level}`}
                      levelRight={<ClassTag cls={def.cls} short />}
                      art={<HeroArt id={id} mutation={rec.mutation} s={1} />}
                      tall
                      tag={{ text: 'KEPT', kind: 'new', title: 'Your knight: still yours, just as it was' }}
                      name={def.name}
                      state="done"
                      onArt={() => (uiSound('tap'), onOpen(id))}
                      lines={[
                        { icon: 'coin', text: `+${fmt(sold[id] ?? 0)} gold`, tone: 'good' },
                        { icon: 'check', text: 'Knight kept', tone: 'muted' },
                      ]}
                      button={{ kind: 'done', label: 'SOLD' }}
                    />
                  );
                }
                return (
                  <OfferCard
                    key={id}
                    cardId={id}
                    level={`Lv ${rec.level}`}
                    levelRight={<ClassTag cls={def.cls} short />}
                    art={<ExtraStack id={id} mutation={rec.mutation} n={rec.extras} />}
                    tall
                    tag={{ text: `EXTRA ×${rec.extras}`, kind: 'dupe', title: `${extrasText(rec.extras)} of ${def.name}: copies to sell, not the knight` }}
                    name={def.name}
                    onArt={() => (uiSound('tap'), onOpen(id))}
                    lines={[
                      { icon: 'coin', text: `worth ${fmt(rec.extrasGold)} gold`, tone: 'gold' },
                      { icon: 'check', text: 'Knight stays', tone: 'muted' },
                    ]}
                    button={{ kind: 'buy', verb: 'SELL', label: `+${fmt(rec.extrasGold)}`, icon: 'coin', ready: true, gold: true, onPress: () => sell(id), paid: `+${fmt(rec.extrasGold)}` }}
                  />
                );
              })}
            </ShopGrid>
          </div>
        )}
      </ShopBody>
      <ShopFoot>
        <button className={`btn ${s.sellAllBtn}`} data-sell-all data-hot={count > 0 || undefined} disabled={count === 0} onClick={sellAll} title="Sell every extra: your knights stay as they are">
          <Px icon="coin" size="md" />
          <span>
            SELL ALL EXTRAS
            <small>{count > 0 ? `+${fmt(total)} gold · ${extrasText(count)}` : 'nothing to sell'}</small>
          </span>
        </button>
      </ShopFoot>
    </KeeperScreen>
  );
}
