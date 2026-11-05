/**
 * The counters that deal in your knights, as cards sorted by class down the left:
 *  - Brannoc the smith: LEVEL UP (each knight's next level for its shards and gold) and REFORGE (a
 *    roll for a better mutation, for gold), the same calls as the hero sheet (core/roster.ts);
 *  - Rusty Mags the junk dealer: SELL and BREAK DOWN your knights' duplicates, one knight's copies at
 *    a time or all of them at once.
 * Tap a knight's picture for its whole sheet (HeroDetail).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { CLASSES, CLASS_IDS, knightDef, type ClassId } from '../../core/knights';
import { knightRating } from '../../core/power';
import { RARITY_COLOR, RARITY_NAME } from '../../core/rarity';
import {
  canLevel, levelCost, levelUp, rankedKnights, reforge, reforgeCost, sellAll, sellDupes, sellValue, shardAll, shardDupes, shardsPerDupe, totalDupes,
} from '../../core/roster';
import { BAL } from '../../core/balance';
import type { Game } from '../../game';
import type { HubStation } from '../../world/hubWorld';
import { HeroArt } from '../common';
import { fmt } from '../format';
import { Px, type IconName } from '../px';
import { uiSound } from '../sound';
import { Glyph, KeeperScreen, Purse, ShopBody, ShopFoot, ShopGrid, ShopHint, ShopTop, Stat, keeperStyles as s, useGameTick, type KeeperCat } from './KeeperScreen';
import { OfferCard } from './OfferCard';

/** Each class's little picture on its category button. */
export const CLASS_ICON: Record<ClassId, IconName> = {
  guardian: 'shield',
  blade: 'sword',
  ranger: 'target',
  cleric: 'heart',
  arcanist: 'bolt',
  lancer: 'swords',
};

/** "All" and the classes you have knights of (with what's to do in each). */
function classCats(ids: string[], badge: (id: string) => boolean): KeeperCat[] {
  const has = CLASS_IDS.filter((c) => ids.some((id) => knightDef(id).cls === c));
  return [
    { id: 'all', label: 'ALL', icon: <Glyph icon="helm10" />, badge: ids.filter(badge).length },
    ...has.map((c) => ({ id: c, label: CLASSES[c].name.toUpperCase(), icon: <Px icon={CLASS_ICON[c]} size="sm" />, badge: ids.filter((id) => knightDef(id).cls === c && badge(id)).length })),
  ];
}

/** A knight's rarity as a little square of its color in the picture's corner (its name in the title). */
function rarityTag(id: string) {
  const r = knightDef(id).rarity;
  return { color: RARITY_COLOR[r], title: RARITY_NAME[r] };
}

function Knight({ game, id }: { game: Game; id: string }) {
  return <HeroArt id={id} mutation={game.state.roster[id]?.mutation ?? null} s={1} />;
}

// ------------------------------------------------------------------ the smith

const smithMemory = { tab: 'level', cat: 'all' };

export function SmithShop({ game, station, onClose, onOpen }: { game: Game; station: HubStation; onClose: () => void; onOpen: (id: string) => void }) {
  useGameTick(game);
  const st = game.state;
  const [tab, setTabState] = useState(smithMemory.tab);
  const [cat, setCatState] = useState(smithMemory.cat);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [, bump] = useState(0);
  const all = rankedKnights(st);
  const leveling = tab === 'level';
  const cats = classCats(all, (id) => (leveling ? canLevel(st, id) : st.gold >= reforgeCost(st, id) && st.roster[id].mutation !== 'void'));
  const cur = cats.some((c) => c.id === cat) ? cat : 'all';
  const ids = cur === 'all' ? all : all.filter((id) => knightDef(id).cls === cur);
  const shards = all.reduce((n, id) => n + st.roster[id].shards, 0);
  const refresh = () => {
    game.syncSquad();
    game.touch();
    bump((x) => x + 1);
  };
  return (
    <KeeperScreen
      game={game}
      station={station}
      tabs={[
        { id: 'level', label: 'LEVEL UP', icon: 'arrowUp', badge: all.filter((id) => canLevel(st, id)).length },
        { id: 'reforge', label: 'REFORGE', icon: 'gem' },
      ]}
      tab={tab}
      onTab={(t) => ((smithMemory.tab = t), setTabState(t))}
      onClose={onClose}
    >
      <ShopTop
        purse={<Purse amount={st.gold} />}
        title={
          <Stat icon="shard" label="Shards" title="Shards across your knights">
            {fmt(shards)}
          </Stat>
        }
      />
      <ShopHint>
        {leveling ? (
          <>
            <b>Level up</b> a knight with its own <b>shards</b> and gold. Shards come from breaking down spare copies at Rusty Mags'.
          </>
        ) : (
          <>
            <b>Reforge</b> rolls for a <b>mutation</b> (a big power boost) for gold. A better one replaces the old; a worse one changes nothing.
          </>
        )}
      </ShopHint>
      <ShopBody cats={cats} cat={cur} onCat={(c) => ((smithMemory.cat = c), setCatState(c))} scrollKey={`${tab}|${cur}`}>
        {ids.length === 0 ? (
          <div className={s.empty}>
            <Px icon="helm" size="lg" s={1} />
            <div>No knights yet. Summon some at the altar.</div>
          </div>
        ) : (
          <ShopGrid>
            {ids.map((id) => {
              const rec = st.roster[id];
              const def = knightDef(id);
              if (leveling) {
                const maxed = rec.level >= BAL.roster.maxLevel;
                const c = levelCost(rec.level);
                const enoughShards = rec.shards >= c.shards;
                return (
                  <OfferCard
                    key={id}
                    level={`Lv.${rec.level}`}
                    levelRight={<Px icon={CLASS_ICON[def.cls]} size="xs" />}
                    art={<Knight game={game} id={id} />}
                    tall
                    tag={rarityTag(id)}
                    name={def.name}
                    onArt={() => (uiSound('tap'), onOpen(id))}
                    state={maxed ? 'done' : 'open'}
                    lines={[
                      { icon: 'sword', text: `Power ${fmt(knightRating(st, id))}` },
                      ...(maxed ? [] : [{ icon: 'shard' as IconName, text: `Shards ${rec.shards}/${c.shards}`, tone: enoughShards ? ('good' as const) : ('bad' as const) }]),
                    ]}
                    button={
                      maxed
                        ? { kind: 'done', label: 'MAX LEVEL' }
                        : {
                            kind: 'buy',
                            verb: 'LEVEL UP',
                            label: fmt(c.gold),
                            icon: 'coin',
                            ready: canLevel(st, id),
                            hold: true,
                            onPress: () => {
                              if (!canLevel(st, id)) return false;
                              const ok = levelUpKnight(game, id);
                              if (ok) refresh();
                              return ok;
                            },
                            paid: `Lv.${rec.level + 1}!`,
                            short: !enoughShards ? `need ${c.shards - rec.shards} more shards` : `need ${fmt(c.gold - st.gold)} more gold`,
                          }
                    }
                  />
                );
              }
              const voided = rec.mutation === 'void';
              const cost = reforgeCost(st, id);
              return (
                <OfferCard
                  key={id}
                  level={rec.mutation ? rec.mutation.toUpperCase() : 'No mutation'}
                  levelRight={<Px icon={CLASS_ICON[def.cls]} size="xs" />}
                  art={<Knight game={game} id={id} />}
                  tall
                  tag={rarityTag(id)}
                  name={def.name}
                  onArt={() => (uiSound('tap'), onOpen(id))}
                  state={voided ? 'done' : 'open'}
                  lines={[
                    { icon: 'sword', text: `Power ${fmt(knightRating(st, id))}` },
                    ...(msg[id] ? [{ icon: 'sparkle' as IconName, text: msg[id], tone: msg[id].endsWith('!') ? ('good' as const) : ('muted' as const) }] : []),
                  ]}
                  button={
                    voided
                      ? { kind: 'done', label: 'VOID: BEST' }
                      : {
                          kind: 'buy',
                          verb: 'REFORGE',
                          label: fmt(cost),
                          icon: 'coin',
                          ready: st.gold >= cost,
                          onPress: () => {
                            const r = reforge(st, id, () => game.rng.next());
                            if (!r) return false;
                            const text = r.improved ? `${r.rolled!.toUpperCase()}!` : r.rolled ? `Rolled ${r.rolled}: no better` : 'Rolled nothing';
                            uiSound(r.improved ? 'mutation' : 'dupe', r.improved ? 6 : 0);
                            setMsg((m) => ({ ...m, [id]: text }));
                            refresh();
                            return true;
                          },
                          paid: () => `-${fmt(cost)}`,
                          short: `need ${fmt(cost - st.gold)} more gold`,
                        }
                  }
                />
              );
            })}
          </ShopGrid>
        )}
      </ShopBody>

    </KeeperScreen>
  );
}

/** Levels a knight up at the smith's, with its sound. */
function levelUpKnight(game: Game, id: string): boolean {
  const before = game.state.roster[id]?.level ?? 0;
  const ok = levelUp(game.state, id);
  if (ok) uiSound('levelUp', Math.min(6, Math.floor(before / 3)));
  return ok;
}

// ------------------------------------------------------------------ the junk dealer

const scrapMemory = { tab: 'sell', cat: 'all' };

export function ScrapShop({ game, station, onClose, onOpen }: { game: Game; station: HubStation; onClose: () => void; onOpen: (id: string) => void }) {
  useGameTick(game);
  const st = game.state;
  const [tab, setTabState] = useState(scrapMemory.tab);
  const [cat, setCatState] = useState(scrapMemory.cat);
  const [, bump] = useState(0);
  const selling = tab === 'sell';
  const all = rankedKnights(st).filter((id) => st.roster[id].dupes > 0);
  const cats = classCats(all, () => true);
  const cur = cats.some((c) => c.id === cat) ? cat : 'all';
  const ids = cur === 'all' ? all : all.filter((id) => knightDef(id).cls === cur);
  const n = totalDupes(st);
  const gold = all.reduce((a, id) => a + st.roster[id].dupes * sellValue(st, id), 0);
  const shards = all.reduce((a, id) => a + st.roster[id].dupes * shardsPerDupe(st, knightDef(id).rarity), 0);
  // Everything at once takes two taps: the first arms it (red, with a check), the second does it.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  const done = () => {
    game.touch();
    bump((x) => x + 1);
  };
  let footer: ReactNode;
  if (n === 0) footer = null;
  else
    footer = (
      <>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'calc(1 * var(--px))' }}>
          <b>{n}</b> spare{n === 1 ? '' : 's'} in all
        </span>
        <button
          className={`btn ${armed ? 'red' : s.buy}`}
          style={{ width: 'auto', flex: 'none' }}
          data-kind="buy"
          onClick={() => {
            if (!armed) {
              setArmed(true);
              uiSound('tap');
              return;
            }
            setArmed(false);
            if (selling) {
              const g = sellAll(st);
              if (g > 0) uiSound('sell');
            } else if (shardAll(st) > 0) uiSound('breakDown');
            done();
          }}
        >
          {armed && <Px icon="check" size="xs" />}
          <span className={s.verb}>{armed ? 'SURE?' : selling ? 'SELL ALL' : 'BREAK ALL'}</span>
          <Px icon={selling ? 'coin' : 'shard'} size="xs" />
          <span>+{fmt(selling ? gold : shards)}</span>
        </button>
      </>
    );
  return (
    <KeeperScreen
      game={game}
      station={station}
      tabs={[
        { id: 'sell', label: 'SELL', icon: 'coin', badge: n },
        { id: 'shard', label: 'BREAK DOWN', icon: 'shard' },
      ]}
      tab={tab}
      onTab={(t) => ((scrapMemory.tab = t), setTabState(t))}
      onClose={onClose}
    >
      <ShopTop
        purse={<Purse amount={st.gold} />}
        title={
          <Stat icon="shard" label="Shards" title="Shards across your knights">
            {fmt(st.roster ? Object.values(st.roster).reduce((a, r) => a + r.shards, 0) : 0)}
          </Stat>
        }
      />
      <ShopHint>
        {selling ? (
          <>
            <b>Spare copies</b> are repeats of knights you already have. <b>Sell</b> them for gold; you always keep one of each knight.
          </>
        ) : (
          <>
            <b>Break down</b> spare copies into <b>shards</b> for that knight. Brannoc the smith levels it up with them.
          </>
        )}
      </ShopHint>
      <ShopBody cats={all.length ? cats : undefined} cat={cur} onCat={(c) => ((scrapMemory.cat = c), setCatState(c))} scrollKey={`${tab}|${cur}`}>
        {ids.length === 0 ? (
          <div className={s.empty}>
            <Px icon="helm" size="lg" s={1} />
            <div>
              <b>No spare copies.</b>
              <br />
              When the altar summons a knight you already have, the copy lands here.
            </div>
          </div>
        ) : (
          <ShopGrid>
            {ids.map((id) => {
              const rec = st.roster[id];
              const def = knightDef(id);
              const each = selling ? sellValue(st, id) : shardsPerDupe(st, def.rarity);
              return (
                <OfferCard
                  key={id}
                  level={`${rec.dupes} spare${rec.dupes === 1 ? '' : 's'}`}
                  levelRight={<Px icon={CLASS_ICON[def.cls]} size="xs" />}
                  art={<Knight game={game} id={id} />}
                  tall
                  tag={rarityTag(id)}
                  name={def.name}
                  onArt={() => (uiSound('tap'), onOpen(id))}
                  lines={[{ icon: selling ? 'coin' : 'shard', text: selling ? `${fmt(each)} gold each` : `${fmt(each)} shard${each === 1 ? '' : 's'} each`, tone: 'gold' }]}
                  button={{
                    kind: 'buy',
                    verb: selling ? `SELL ${rec.dupes}` : `BREAK ${rec.dupes}`,
                    label: `+${fmt(each * rec.dupes)}`,
                    icon: selling ? 'coin' : 'shard',
                    ready: true,
                    onPress: () => {
                      const got = selling ? sellDupes(st, id) : shardDupes(st, id);
                      if (got <= 0) return false;
                      uiSound(selling ? 'sell' : 'breakDown');
                      done();
                      return true;
                    },
                    paid: `+${fmt(each * rec.dupes)}`,
                  }}
                />
              );
            })}
          </ShopGrid>
        )}
      </ShopBody>
      {footer && <ShopFoot>{footer}</ShopFoot>}
    </KeeperScreen>
  );
}
