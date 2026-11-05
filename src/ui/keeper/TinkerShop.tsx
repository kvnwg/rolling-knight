/**
 * Tinker Pell's counter: gold upgrades on two tabs.
 *
 * LUCK (the altar's lines and fortune's) is bought. It opens on its upgrade map, the honeycomb
 * (src/ui/upgrades/UpgradeMap.tsx); LIST shows the same lines as cards, sorted into a few categories
 * down the left. A card: its icon and name, its tier, what it adds up to now and after the next tier,
 * and its price; tap the price to buy a tier (hold to keep buying). A line opens once the tier it
 * hangs off is owned; until then its card wears a padlock. Tap a card's picture for its details.
 *
 * COMBAT (the squad's lines and the chance lines) is rolled (core/combatRoll.ts): ROLL pays the price
 * and the reel lands on a random combat line, which gains a tier (now and then two: x2; now and then
 * the gold comes back: FREE). Under the reel, every combat line by category: its tiers as pips and its
 * chance on the next roll, in the color of how rare that tier is. Tap a line for what it does.
 */
import { useRef, useState, type CSSProperties } from 'react';
import { canRollCombat, combatOdds, combatPoolOpen, combatRollPrice, combatRollsAffordable, rollCombat, type CombatRoll, type LineOdds } from '../../core/combatRoll';
import { currentLuck } from '../../core/luck';
import { squadPower } from '../../core/power';
import { RARITY_NAME } from '../../core/rarity';
import type { GameState } from '../../core/state';
import { effectAt, HEX_BY_KEY, nodeKey, nodeName, roman } from '../../core/upgradeTree';
import { buyUpgrade, canBuy, tier, upgradeCost, upgradeDef, upgradeUnlocked, UPGRADES_BY_ID, type UpgradeId, type UpgradeTab } from '../../core/upgrades';
import type { Game } from '../../game';
import type { HubStation } from '../../world/hubWorld';
import { fmt } from '../format';
import { Px } from '../px';
import { uiSound } from '../sound';
import { cardIcon, hexIcon } from '../upgrades/icons';
import { UpgradeMap } from '../upgrades/UpgradeMap';
import { useHoldRepeat } from '../upgrades/parts';
import { InfoPopup } from './InfoPopup';
import { KeeperScreen, Purse, ShopBody, ShopGrid, ShopHint, ShopTop, Stat, keeperStyles as s, useGameTick, type KeeperCat } from './KeeperScreen';
import { OfferCard, type CardLine } from './OfferCard';
import { RollBody, RollButton, RollHead, RollLabel, RollList, RollReel, RollRow, RollStage, RollTag, pctShort, rarityInk, type ReelSpin } from './RollMachine';
import { TINKER_CATS } from './tinkerCats';

/** Where the tinker's screen was left (kept while the app runs). */
const memory: { tab: UpgradeTab; cat: string; map?: boolean } = { tab: 'luck', cat: 'luck' };

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
  // The Luck tab opens straight onto its map (the cards are a tap away).
  const [map, setMap] = useState(memory.map ?? true);
  const showMap = (on: boolean) => {
    memory.map = on;
    setMap(on);
  };
  const setTab = (t: string) => {
    const tt = t as UpgradeTab;
    memory.tab = tt;
    setTabState(tt);
  };
  const tabs = [
    { id: 'luck', label: 'LUCK', icon: 'clover', badge: TINKER_CATS.luck.flatMap((c) => c.lines).filter((id) => canBuy(st, id)).length },
    { id: 'combat', label: 'COMBAT', icon: 'swords', badge: combatRollsAffordable(st, 9) },
  ];
  return (
    <>
      <KeeperScreen game={game} station={station} tabs={tabs} tab={tab} onTab={setTab} onClose={onClose}>
        {tab === 'luck' ? <LuckTab game={game} onMap={() => (uiSound('open'), showMap(true))} /> : <CombatTab game={game} />}
      </KeeperScreen>
      {map && tab === 'luck' && (
        <div style={{ ['--upgrade-map-z' as string]: 32 } as CSSProperties}>
          <UpgradeMap game={game} onClose={onClose} closeText="CLOSE" onCombat={() => setTab('combat')} onCards={() => showMap(false)} />
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ the Luck tab: bought

function LuckTab({ game, onMap }: { game: Game; onMap: () => void }) {
  const st = game.state;
  const [cat, setCatState] = useState(memory.cat);
  const [info, setInfo] = useState<UpgradeId | null>(null);
  const [, bump] = useState(0);
  const setCat = (c: string) => {
    memory.cat = c;
    setCatState(c);
  };
  const cats = TINKER_CATS.luck;
  const current = cats.find((c) => c.id === cat) ?? cats[0];
  const buy = (id: UpgradeId, repeat: number): boolean => {
    if (!buyUpgrade(st, id)) return false;
    const def = UPGRADES_BY_ID.get(id)!;
    if (def.special && def.max === 1) uiSound('unlock');
    else uiSound(repeat === 0 ? 'buy' : 'coin');
    if (tier(st, id) >= def.max && !def.special) uiSound('ding');
    game.touch();
    bump((x) => x + 1);
    return true;
  };
  const catList: KeeperCat[] = cats.map((c) => ({ id: c.id, label: c.label, icon: <Icon icon={c.icon} />, badge: c.lines.filter((id) => canBuy(st, id)).length }));
  const luck = currentLuck(st, Date.now());
  return (
    <>
      <ShopTop
        purse={<Purse amount={st.gold} />}
        title={
          <Stat icon="clover" label="Luck" title="Luck">
            x{luck < 10 ? luck.toFixed(2) : fmt(luck)}
          </Stat>
        }
        right={
          <button className={`btn ${s.smallBtn}`} onClick={onMap} title="The upgrade map">
            <Px icon="target" size="sm" />
            MAP
          </button>
        }
      />
      <ShopHint>
        Gold upgrades for <b>the altar</b>: more luck, faster spins, more reels. Buying one opens the ones after it.
      </ShopHint>
      <ShopBody cats={catList} cat={current.id} onCat={setCat} scrollKey={current.id}>
        <ShopGrid>
          {current.lines.map((id) => (
            <UpgradeCard key={id} game={game} id={id} onBuy={(r) => buy(id, r)} onInfo={() => (uiSound('open'), setInfo(id))} />
          ))}
        </ShopGrid>
      </ShopBody>
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

/** A Luck line's details: what it does, its tiers, now and next in words, what opens it, and Buy. */
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
      sub={<Pips now={t} max={def.max} />}
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
      <EffectRow state={st} id={id} t={t} max={def.max} />
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

/** A line's tiers as pips, and "3/8". */
function Pips({ now, max }: { now: number; max: number }) {
  return (
    <>
      <span className={s.pips}>
        {Array.from({ length: max }, (_, i) => (
          <i key={i} data-on={i < now || undefined} />
        ))}
      </span>
      {now}/{max}
    </>
  );
}

/** What a line adds up to: now and after its next tier, or with a check when it's maxed. */
function EffectRow({ state, id, t, max }: { state: GameState; id: UpgradeId; t: number; max: number }) {
  if (t >= max)
    return (
      <div className={s.popRow} data-tone="good">
        <Px icon="check" size="sm" />
        {effectAt(state, id, t)}
      </div>
    );
  return (
    <div className={s.popRow}>
      {t > 0 && <span style={{ color: 'var(--mid)' }}>{effectAt(state, id, t)}</span>}
      {t > 0 && <Px icon="arrowRight" size="xs" />}
      <b style={{ color: 'var(--good)' }}>{effectAt(state, id, t + 1)}</b>
    </div>
  );
}

// ------------------------------------------------------------------ the Combat tab: rolled

let spins = 0;

/**
 * ROLL, the reel and every combat line with its odds. The roll is decided as it's paid; until the
 * reel lands, the list, the power and the purse show things as they were (so nothing gives the result
 * away), and then catch up.
 */
function CombatTab({ game }: { game: Game }) {
  const st = game.state;
  const calm = !!st.settings.reduceMotion;
  const [spin, setSpin] = useState<ReelSpin | null>(null);
  const [roll, setRoll] = useState<CombatRoll | null>(null);
  const [landed, setLanded] = useState(true);
  const [skip, setSkip] = useState(0);
  const [info, setInfo] = useState<UpgradeId | null>(null);
  /** The tiers before the roll in flight (shown until it lands). */
  const before = useRef<Record<string, number> | null>(null);
  const spinning = !!spin && !landed;
  const shown: GameState = spinning && before.current ? { ...st, upgrades: before.current } : st;
  const odds = combatOdds(shown);
  const price = combatRollPrice(st);
  const open = combatPoolOpen(shown);

  const press = () => {
    if (spinning) {
      setSkip((x) => x + 1);
      return;
    }
    const was = { ...st.upgrades };
    const pool = combatOdds(st)
      .filter((o) => o.next !== null)
      .map((o) => ({ icon: o.def.icon, rarity: o.rarity! }));
    const r = rollCombat(st, () => game.rng.next());
    if (!r) return;
    before.current = was;
    uiSound('coin');
    setRoll(r);
    setLanded(false);
    setSpin({ n: ++spins, face: { icon: UPGRADES_BY_ID.get(r.id)!.icon, rarity: r.rarity }, pool });
    game.syncSquad();
    game.touch();
  };
  const onLand = (n: number) => {
    if (n !== spins || !roll) return;
    before.current = null;
    setLanded(true);
    const def = UPGRADES_BY_ID.get(roll.id)!;
    if (roll.double) uiSound('jingle');
    if (roll.free) uiSound('coin');
    if (roll.to >= def.max && def.max > 1) uiSound('ding');
  };

  const def = roll ? UPGRADES_BY_ID.get(roll.id)! : null;
  const label =
    roll && def && landed ? (
      <RollLabel
        key={spin?.n}
        name={def.max > 1 ? `${def.name} ${roman(roll.to)}` : def.name}
        rarity={roll.rarity}
        line={effectAt(st, roll.id, roll.to)}
        tags={
          <>
            {roll.double && <RollTag text="x2" kind="double" />}
            {roll.free && <RollTag text="FREE" kind="free" />}
          </>
        }
      />
    ) : (
      <RollLabel spinning={spinning} hint={<>A random <b>combat upgrade</b> each roll. Higher tiers are rarer.</>} />
    );
  // A free roll gives its gold back as the reel lands.
  const purse = st.gold - (spinning && roll?.free ? roll.price : 0);
  const byId = new Map(odds.map((o) => [o.def.id, o]));
  return (
    <>
      <ShopTop
        purse={<Purse amount={purse} />}
        title={
          <Stat icon="sword" label="Power" title="Squad power">
            {fmt(squadPower(shown))}
          </Stat>
        }
      />
      <RollBody>
        <RollStage
          reel={<RollReel spin={spin} idle="dice" calm={calm} skip={skip} onLand={onLand} />}
          label={label}
          button={
            <RollButton
              state={!open ? 'done' : spinning ? 'spinning' : canRollCombat(st) ? 'ready' : 'short'}
              price={fmt(price)}
              icon="coin"
              onPress={press}
              short={`need ${fmt(price - st.gold)} more`}
              doneText="ALL MAXED"
            />
          }
        />
        <RollList>
          {TINKER_CATS.combat.map((c) => (
            <CombatGroup key={c.id} label={c.label} icon={c.icon} rows={c.lines.map((id) => byId.get(id)!)} flash={landed ? roll?.id : undefined} onTap={(id) => (uiSound('open'), setInfo(id))} />
          ))}
        </RollList>
      </RollBody>
      {info && <CombatInfo state={shown} odds={byId.get(info)!} onClose={() => setInfo(null)} />}
    </>
  );
}

function CombatGroup({ label, icon, rows, flash, onTap }: { label: string; icon: string; rows: LineOdds[]; flash?: UpgradeId; onTap: (id: UpgradeId) => void }) {
  return (
    <>
      <RollHead icon={icon}>{label}</RollHead>
      {rows.map((o) => (
        <RollRow
          key={o.def.id}
          icon={o.def.icon}
          name={o.def.name}
          tiers={{ now: o.tier, max: o.def.max }}
          chance={o.chance}
          rarity={o.rarity}
          done={o.next === null}
          doneText={o.def.max > 1 ? 'MAX' : 'OWNED'}
          flash={flash === o.def.id}
          onTap={() => onTap(o.def.id)}
        />
      ))}
    </>
  );
}

/** A combat line's details: what it does, its tiers, now and after its next tier, and its chance on the next roll. */
function CombatInfo({ state, odds, onClose }: { state: GameState; odds: LineOdds; onClose: () => void }) {
  const def = odds.def;
  return (
    <InfoPopup art={<Icon icon={def.icon} big />} name={def.name} sub={<Pips now={odds.tier} max={def.max} />} onClose={onClose}>
      <p>{def.desc}</p>
      <EffectRow state={state} id={def.id} t={odds.tier} max={def.max} />
      {odds.next !== null && odds.rarity && (
        <div className={s.popRow} data-tone="muted">
          <Px icon="dice" size="sm" />
          Next roll
          <b style={{ color: rarityInk(odds.rarity) }}>{pctShort(odds.chance)}</b>
          <span>
            ({def.max > 1 ? `${roman(odds.next)}: ` : ''}
            <b style={{ color: rarityInk(odds.rarity) }}>{RARITY_NAME[odds.rarity]}</b>)
          </span>
        </div>
      )}
    </InfoPopup>
  );
}
