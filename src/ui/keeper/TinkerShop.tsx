/**
 * Tinker Pell's counter: the gold upgrades on two tabs, Luck (the altar's lines and fortune's) and
 * Combat (the squad's and the chance lines, Quick Roll among them), each tab sorted into a few
 * categories down the left. Every upgrade line is one card: its icon and name, its tier, what it adds
 * up to now and after the next tier (an icon and numbers), and its price; tap the price to buy a tier
 * (hold to keep buying). A line opens once the tier it hangs off is owned; until then its card wears
 * a padlock. Tap a card's picture or name for its details (what it does, what opens it); MAP shows
 * the tab as its honeycomb (src/ui/upgrades/UpgradeMap.tsx).
 */
import { useState, type CSSProperties } from 'react';
import { currentLuck } from '../../core/luck';
import { squadPower } from '../../core/power';
import { effectAt, HEX_BY_KEY, nodeKey, nodeName } from '../../core/upgradeTree';
import { buyUpgrade, canBuy, tier, upgradeCost, upgradeDef, upgradeUnlocked, UPGRADES_BY_ID, type UpgradeId, type UpgradeTab } from '../../core/upgrades';
import type { Game } from '../../game';
import type { HubStation } from '../../world/hubWorld';
import { fmt } from '../format';
import { Px } from '../px';
import { uiSound } from '../sound';
import { cardIcon, hexIcon } from '../upgrades/icons';
import { SQUAD_STATS, UpgradeMap } from '../upgrades/UpgradeMap';
import { useHoldRepeat } from '../upgrades/parts';
import { InfoPopup } from './InfoPopup';
import { KeeperScreen, Purse, ShopBody, ShopGrid, ShopHint, ShopTop, Stat, keeperStyles as s, useGameTick, type KeeperCat } from './KeeperScreen';
import { OfferCard, type CardLine } from './OfferCard';
import { TINKER_CATS } from './tinkerCats';

/** Where the tinker's screen was left (kept while the app runs). */
const memory: { tab: UpgradeTab; cat: Record<UpgradeTab, string>; map?: boolean } = { tab: 'luck', cat: { luck: 'luck', combat: 'attack' } };

/** An upgrade (or keeper) icon: the hex size, or the card's bigger one. */
export function Icon({ icon, big }: { icon: string; big?: boolean }) {
  const a = big ? cardIcon(icon) : hexIcon(icon);
  const style: CSSProperties = { width: `calc(${a.w} * var(--px))`, height: `calc(${a.h} * var(--px))`, flex: 'none' };
  return <img className="px" src={a.url} alt="" draggable={false} style={style} />;
}

export function TinkerShop({ game, station, onClose }: { game: Game; station: HubStation; onClose: () => void }) {
  useGameTick(game);
  const st = game.state;
  const [tab, setTabState] = useState<UpgradeTab>(memory.tab);
  const [cat, setCatState] = useState(memory.cat[tab]);
  // The tinker opens straight onto the map (the cards are a tap away).
  const [map, setMap] = useState(memory.map ?? true);
  const showMap = (on: boolean) => {
    memory.map = on;
    setMap(on);
  };
  const [info, setInfo] = useState<UpgradeId | null>(null);
  const [, bump] = useState(0);
  const setTab = (t: string) => {
    const tt = t as UpgradeTab;
    memory.tab = tt;
    setTabState(tt);
    setCatState(memory.cat[tt]);
  };
  const setCat = (c: string) => {
    memory.cat[tab] = c;
    setCatState(c);
  };
  const cats = TINKER_CATS[tab];
  const current = cats.find((c) => c.id === cat) ?? cats[0];

  const buy = (id: UpgradeId, repeat: number): boolean => {
    if (!buyUpgrade(st, id)) return false;
    const def = UPGRADES_BY_ID.get(id)!;
    if (def.special && def.max === 1) uiSound('unlock');
    else uiSound(repeat === 0 ? 'buy' : 'coin');
    if (tier(st, id) >= def.max && !def.special) uiSound('ding');
    if (SQUAD_STATS.has(id)) game.syncSquad();
    game.touch();
    bump((x) => x + 1);
    return true;
  };

  const ready = (ids: UpgradeId[]) => ids.filter((id) => canBuy(st, id)).length;
  const tabs = (['luck', 'combat'] as const).map((t) => ({
    id: t,
    label: t === 'luck' ? 'LUCK' : 'COMBAT',
    icon: t === 'luck' ? ('clover' as const) : ('swords' as const),
    badge: ready(TINKER_CATS[t].flatMap((c) => c.lines)),
  }));
  const catList: KeeperCat[] = cats.map((c) => ({ id: c.id, label: c.label, icon: <Icon icon={c.icon} />, badge: ready(c.lines) }));
  const luck = currentLuck(st, Date.now());

  return (
    <>
      <KeeperScreen game={game} station={station} tabs={tabs} tab={tab} onTab={setTab} onClose={onClose}>
        <ShopTop
          purse={<Purse amount={st.gold} />}
          title={
            tab === 'luck' ? (
              <Stat icon="clover" label="Luck" title="Luck">
                x{luck < 10 ? luck.toFixed(2) : fmt(luck)}
              </Stat>
            ) : (
              <Stat icon="sword" label="Power" title="Squad power">
                {fmt(squadPower(st))}
              </Stat>
            )
          }
          right={
            <button className={`btn ${s.smallBtn}`} onClick={() => (uiSound('open'), showMap(true))} title="The upgrade map">
              <Px icon="target" size="sm" />
              MAP
            </button>
          }
        />
        <ShopHint>
          {tab === 'luck' ? (
            <>
              Gold upgrades for <b>the altar</b>: more luck, faster spins, more reels. Buying one opens the ones after it.
            </>
          ) : (
            <>
              Gold upgrades for <b>your squad</b> in the dungeon: damage, HP, speed and lucky hits. Buying one opens the ones after it.
            </>
          )}
        </ShopHint>
        <ShopBody cats={catList} cat={current.id} onCat={setCat} scrollKey={`${tab}|${current.id}`}>
          <ShopGrid>
            {current.lines.map((id) => (
              <UpgradeCard key={id} game={game} id={id} onBuy={(r) => buy(id, r)} onInfo={() => (uiSound('open'), setInfo(id))} />
            ))}
          </ShopGrid>
        </ShopBody>
      </KeeperScreen>
      {map && (
        <div style={{ ['--upgrade-map-z' as string]: 32 } as CSSProperties}>
          <UpgradeMap key={tab} game={game} tab={tab} onClose={onClose} closeText="CLOSE" onTab={(t) => setTab(t)} onCards={() => showMap(false)} />
        </div>
      )}
      {info && <UpgradeInfo game={game} id={info} onBuy={(r) => buy(info, r)} onClose={() => setInfo(null)} />}
    </>
  );
}

function UpgradeCard({ game, id, onBuy, onInfo }: { game: Game; id: UpgradeId; onBuy: (repeat: number) => boolean; onInfo: () => void }) {
  const st = game.state;
  const def = upgradeDef(id)!;
  const t = tier(st, id);
  const maxed = t >= def.max;
  const open = upgradeUnlocked(st, id);
  const cost = upgradeCost(st, id);
  const parent = def.requires ? HEX_BY_KEY.get(nodeKey(def.requires.id, def.requires.tier)) : undefined;
  // What it does now and after the next tier, in words ("+15% luck", "a Lucky Spin every 8 spins").
  let lines: CardLine[];
  if (maxed) lines = [{ text: effectAt(st, id, t), tone: 'good' }];
  else if (!open) lines = [{ text: effectAt(st, id, t + 1), tone: 'muted' }];
  else
    lines = [
      ...(t > 0
        ? [
            {
              text: (
                <>
                  <span className={s.colhead}>NOW </span>
                  {effectAt(st, id, t)}
                </>
              ),
              tone: 'muted' as const,
            },
          ]
        : []),
      {
        text: (
          <>
            {t > 0 && <span className={s.colhead}>NEXT </span>}
            {effectAt(st, id, t + 1)}
          </>
        ),
        tone: 'good',
      },
    ];
  return (
    <OfferCard
      level={`Lv.${t}`}
      levelRight={`of ${def.max}`}
      art={<Icon icon={def.icon} big />}
      tag={def.special ? { icon: 'star', kind: 'gold' } : def.rolls ? { icon: 'dice' } : undefined}
      name={def.name}
      lines={lines}
      special={def.special}
      state={maxed ? 'done' : open ? 'open' : 'locked'}
      onArt={onInfo}
      note={!maxed && !open && parent ? `Needs ${nodeName(parent)}` : undefined}
      button={
        maxed
          ? { kind: 'done', label: 'MAXED' }
          : !open
            ? { kind: 'locked', label: 'LOCKED' }
            : {
                kind: 'buy',
                verb: 'BUY',
                label: fmt(cost),
                icon: 'coin',
                ready: st.gold >= cost,
                gold: def.special,
                hold: true,
                onPress: onBuy,
                paid: `-${fmt(cost)}`,
                short: `need ${fmt(cost - st.gold)} more`,
              }
      }
    />
  );
}

/** A line's details: what it does, its tiers, now and next in words, what opens it, and Buy. */
function UpgradeInfo({ game, id, onBuy, onClose }: { game: Game; id: UpgradeId; onBuy: (repeat: number) => boolean; onClose: () => void }) {
  useGameTick(game);
  const st = game.state;
  const def = upgradeDef(id)!;
  const t = tier(st, id);
  const maxed = t >= def.max;
  const open = upgradeUnlocked(st, id);
  const cost = upgradeCost(st, id);
  const parent = def.requires ? HEX_BY_KEY.get(nodeKey(def.requires.id, def.requires.tier)) : undefined;
  const [nope, setNope] = useState(0);
  const hold = useHoldRepeat((r) => {
    const ok = onBuy(r);
    if (!ok && r === 0) setNope((x) => x + 1);
    return ok;
  });
  return (
    <InfoPopup
      art={<Icon icon={def.icon} big />}
      name={def.name}
      sub={
        <>
          <span className={s.pips}>
            {Array.from({ length: def.max }, (_, i) => (
              <i key={i} data-on={i < t || undefined} />
            ))}
          </span>
          {t}/{def.max}
        </>
      }
      onClose={onClose}
      actions={
        !maxed && open ? (
          <button key={nope} className={`btn ${s.buy}`} data-kind={st.gold >= cost ? (def.special ? 'gold' : 'buy') : 'short'} data-nope={nope > 0 || undefined} {...hold}>
            <span className={s.verb}>BUY</span>
            <Px icon="coin" size="sm" />
            <span>{fmt(cost)}</span>
          </button>
        ) : undefined
      }
    >
      <p>{def.desc}</p>
      {maxed ? (
        <div className={s.popRow} data-tone="good">
          <Px icon="check" size="sm" />
          {effectAt(st, id, t)}
        </div>
      ) : (
        <div className={s.popRow}>
          {t > 0 && <span style={{ color: 'var(--mid)' }}>{effectAt(st, id, t)}</span>}
          {t > 0 && <Px icon="arrowRight" size="xs" />}
          <b style={{ color: 'var(--good)' }}>{effectAt(st, id, t + 1)}</b>
        </div>
      )}
      {!open && parent && (
        <div className={s.popRow} data-tone="bad">
          <Px icon="lock" size="sm" />
          Needs
          <Icon icon={upgradeDef(parent.id)!.icon} />
          {nodeName(parent)}
        </div>
      )}
    </InfoPopup>
  );
}
