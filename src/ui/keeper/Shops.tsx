/**
 * The other keepers' counters in the shared layout: a line under the purse says what each is for,
 * numbers say what they are, buttons say what they do, and the whole story waits in the popups
 * their cards open:
 *  - Sage Orrin: perks, rolled for sigils (core/perks.ts);
 *  - Sister Maren: rebirth, what it gives and what it takes, and the button (core/newGame.ts);
 *  - the notice board: your jobs, their progress and rewards (core/quests.ts);
 *  - Oracle Vesper: the altar's reels, your latest summons (repeats tagged EXTRA) and the odds;
 *  - Warden Tobb: who goes down (your squad and who leads), levelling and reforging them, the way down.
 * (Bram the Broker, who sells your extras, has his own: BrokerShop.tsx.)
 */
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BAL } from '../../core/balance';
import { CLASSES, KNIGHTS, knightDef, knightId, unlockedClasses } from '../../core/knights';
import { canRebirth, rebirthFloor } from '../../core/newGame';
import { PERKS, PERK_TREES, canRollPerk, perkOdds, perkRollPrice, perkRollsAffordable, perksOpen, rollPerk, type PerkDef, type PerkRoll, type PerkTree } from '../../core/perks';
import { CHALLENGE, floorDifficulty, knightRating, squadPower } from '../../core/power';
import { activeQuests, MAX_ACTIVE_QUESTS, mobNoun, plural, questGoal, rewardText, type Quest } from '../../core/quests';
import { RARITIES, RARITY_COLOR, RARITY_NAME, RARITY_ODDS, rarityChances, rarityIndex } from '../../core/rarity';
import { drySpell, reelCount, spinCycle, tokenChance } from '../../core/roller';
import { hasPerk } from '../../core/perks';
import { benchKnight, bestSquad, canLevel, extrasCount, extrasValue, isBestSquad, levelCost, levelUp, maxedLevel, rankedKnights, rebirthStatMult, reforge, reforgeCost, sellKnight, sellValue, setSquadSlot, soloBonus, squadSize, squadSlots } from '../../core/roster';
import type { Game } from '../../game';
import { biomeForFloor } from '../../world/biomes';
import type { HubStation } from '../../world/hubWorld';
import { HeroArt } from '../common';
import { AltarReels } from '../fx/AltarReels';
import { AltarSeal } from '../fx/AltarSeal';
import { fmt, oneIn } from '../format';
import { Px, type IconName } from '../px';
import { uiSound } from '../sound';
import { InfoPopup } from './InfoPopup';
import { Delta, Glyph, KeeperScreen, Purse, ShopBody, ShopFoot, ShopGrid, ShopHeading, ShopHint, ShopTop, Stat, keeperStyles as s, useGameTick } from './KeeperScreen';
import { OfferCard, type CardLine } from './OfferCard';
import { extrasText } from './BrokerShop';
import { RollBody, RollButton, RollHead, RollLabel, RollList, RollReel, RollRow, RollStage, pctShort, rarityInk, type ReelSpin } from './RollMachine';
import { Icon } from './TinkerShop';
import { ClassTag } from '../ClassTag';
import { backdropStyle } from '../backdrop';
import { artPx, OddsChip } from '../KnightCard';
import { Codex } from '../panels';
import { coinFly } from '../fx/coinFly';
import { DragKnight } from './DragKnight';

/** A rarity's color made dark enough to read on paper. */
function inkOf(c: string): string {
  const n = parseInt(c.slice(1), 16);
  const f = (sh: number) => Math.round(((n >> sh) & 255) * 0.55);
  return `rgb(${f(16)}, ${f(8)}, ${f(0)})`;
}

// ------------------------------------------------------------------ the sage

const TREE_ICON: Record<PerkTree, string> = { underdog: 'pitchfork', command: 'banner', reels: 'reel', chaos: 'bomb' };
const TREE_LABEL: Record<PerkTree, string> = { underdog: 'UNDERDOGS', command: 'COMMAND', reels: 'REELS', chaos: 'BAD IDEAS' };

let sageSpins = 0;

/**
 * Sage Orrin's counter: ROLL for a random perk you don't have yet (core/perks.ts), for sigils, the
 * reel landing on it; under it every perk by tree, with its chance on the next roll in its rarity's
 * color, or OWNED. Tap a perk for what it does. Until the reel lands, the list and the count show
 * things as they were. Before the first rebirth the roll is locked, and the list shows what's to come.
 */
export function SageShop({ game, station, onClose }: { game: Game; station: HubStation; onClose: () => void }) {
  useGameTick(game);
  const st = game.state;
  const calm = !!st.settings.reduceMotion;
  const [spin, setSpin] = useState<ReelSpin | null>(null);
  const [roll, setRoll] = useState<PerkRoll | null>(null);
  const [landed, setLanded] = useState(true);
  const [skip, setSkip] = useState(0);
  const [info, setInfo] = useState<string | null>(null);
  /** The perks before the roll in flight (shown until it lands). */
  const before = useRef<string[] | null>(null);
  const spinning = !!spin && !landed;
  const shown = spinning && before.current ? { ...st, perks: before.current } : st;
  const open = perksOpen(st);
  const odds = new Map(perkOdds(shown).map((o) => [o.perk.id, o]));
  const price = perkRollPrice(st);

  const press = () => {
    if (spinning) {
      setSkip((x) => x + 1);
      return;
    }
    const was = [...st.perks];
    const pool = perkOdds(st).map((o) => ({ icon: o.perk.icon, rarity: o.perk.rarity }));
    const r = rollPerk(st, () => game.rng.next());
    if (!r) return;
    before.current = was;
    setRoll(r);
    setLanded(false);
    setSpin({ n: ++sageSpins, face: { icon: r.perk.icon, rarity: r.perk.rarity }, pool });
    game.syncSquad();
    game.touch();
  };
  const onLand = (n: number) => {
    if (n !== sageSpins || !roll) return;
    before.current = null;
    setLanded(true);
    uiSound('perk', roll.perk.rarity === 'rare' || roll.perk.rarity === 'epic' ? 1 : 0);
  };

  const label =
    roll && landed ? (
      <RollLabel key={spin?.n} name={roll.perk.name} rarity={roll.perk.rarity} line={roll.perk.short} />
    ) : (
      <RollLabel
        spinning={spinning}
        hint={
          open ? (
            <>
              A random <b>perk</b> you don't have yet.
            </>
          ) : (
            <>
              Perks open after your <b>first rebirth</b> (floor {rebirthFloor(st.rebirths)}).
            </>
          )
        }
      />
    );
  const infoPerk = info ? PERKS.find((p) => p.id === info) : undefined;
  return (
    <>
      <KeeperScreen game={game} station={station} tabs={[{ id: 'perks', label: 'PERKS', icon: 'sigil', badge: perkRollsAffordable(st) }]} tab="perks" onTab={() => {}} onClose={onClose}>
        <ShopTop
          purse={<Purse amount={st.sigils} icon="sigil" label="Sigils" />}
          title={
            <Stat icon="check" label="Owned">
              {shown.perks.length}/{PERKS.length}
            </Stat>
          }
        />
        <RollBody>
          <RollStage
            reel={<RollReel spin={spin} idle="sigil" calm={calm} skip={skip} onLand={onLand} />}
            label={label}
            button={
              <RollButton
                state={!open ? 'locked' : odds.size === 0 ? 'done' : spinning ? 'spinning' : canRollPerk(st) ? 'ready' : 'short'}
                price={`${price}`}
                icon="sigil"
                onPress={press}
                short={`need ${price - st.sigils} more`}
                doneText="ALL OWNED"
                lockedText="REBIRTH FIRST"
              />
            }
          />
          <RollList>
            {PERK_TREES.map((t) => (
              <Fragment key={t.id}>
                <RollHead icon={TREE_ICON[t.id]}>{TREE_LABEL[t.id]}</RollHead>
                {PERKS.filter((p) => p.tree === t.id).map((p) => {
                  const o = odds.get(p.id);
                  return (
                    <RollRow
                      key={p.id}
                      icon={p.icon}
                      name={p.name}
                      chance={o?.chance ?? 0}
                      rarity={o ? p.rarity : null}
                      done={!o}
                      doneText="OWNED"
                      flash={landed && roll?.perk.id === p.id}
                      onTap={() => (uiSound('open'), setInfo(p.id))}
                    />
                  );
                })}
              </Fragment>
            ))}
          </RollList>
        </RollBody>
      </KeeperScreen>
      {infoPerk && <PerkInfo perk={infoPerk} chance={odds.get(infoPerk.id)?.chance ?? null} open={open} onClose={() => setInfo(null)} />}
    </>
  );
}

/** A perk's details: its tree and rarity, what it does, and its chance on the next roll (or that it's yours). */
function PerkInfo({ perk, chance, open, onClose }: { perk: PerkDef; chance: number | null; open: boolean; onClose: () => void }) {
  const tree = PERK_TREES.find((t) => t.id === perk.tree)!;
  return (
    <InfoPopup
      art={<Icon icon={perk.icon} big />}
      name={perk.name}
      sub={
        <>
          <span style={{ color: inkOf(tree.color) }}>{tree.name}</span>·<span style={{ color: rarityInk(perk.rarity) }}>{RARITY_NAME[perk.rarity]}</span>
        </>
      }
      onClose={onClose}
    >
      <p>{perk.text}</p>
      {chance === null ? (
        <div className={s.popRow} data-tone="good">
          <Px icon="check" size="sm" />
          Yours for this run
        </div>
      ) : (
        <div className={s.popRow} data-tone="muted">
          <Px icon="dice" size="sm" />
          {open ? 'Next roll' : 'Its chance'}
          <b style={{ color: rarityInk(perk.rarity) }}>{pctShort(chance)}</b>
        </div>
      )}
    </InfoPopup>
  );
}

// ------------------------------------------------------------------ the shrine

export function ShrineShop({ game, station, onClose }: { game: Game; station: HubStation; onClose: () => void }) {
  useGameTick(game);
  const st = game.state;
  const [info, setInfo] = useState<string | null>(null);
  const need = rebirthFloor(st.rebirths);
  const ok = canRebirth(st);
  const next = st.rebirths + 1;
  const fresh = unlockedClasses(next).filter((c) => !unlockedClasses(st.rebirths).includes(c));
  const luckNow = 1 + st.rebirths * BAL.rebirth.luckPer;
  const luckNext = 1 + next * BAL.rebirth.luckPer;
  const goldNow = 1 + st.rebirths * BAL.rebirth.goldMultPer;
  const goldNext = 1 + next * BAL.rebirth.goldMultPer;
  const gains: Array<{ id: string; art: ReactNode; name: string; line: ReactNode; icon: IconName; text: string }> = [
    { id: 'luck', art: <Px icon="clover" size="lg" s={1} />, name: 'Luck', icon: 'clover', line: <Delta now={`x${luckNow.toFixed(2)}`} next={`x${luckNext.toFixed(2)}`} />, text: 'Luck on every spin, for good.' },
    { id: 'gold', art: <Px icon="coin" size="lg" s={1} />, name: 'Gold', icon: 'coin', line: <Delta now={`x${goldNow.toFixed(1)}`} next={`x${goldNext.toFixed(1)}`} />, text: 'More gold from everything, for good.' },
    { id: 'stats', art: <Px icon="sword" size="lg" s={1} />, name: 'Power', icon: 'sword', line: <Delta now={`x${rebirthStatMult(st.rebirths).toFixed(1)}`} next={`x${rebirthStatMult(next).toFixed(1)}`} />, text: "Every knight's stats, for good." },
    ...(squadSlots({ rebirths: next }) > squadSlots(st)
      ? [{ id: 'slot', art: <Px icon="helm" size="lg" s={1} />, name: 'Squad slot', icon: 'helm' as IconName, line: <Delta now={`${squadSlots(st)}`} next={`${squadSlots({ rebirths: next })}`} />, text: 'One more knight goes down with you.' }]
      : []),
    ...fresh.map((c) => ({ id: `cls-${c}`, art: <HeroArt id={knightId('rare', c)} s={1} />, name: CLASSES[c].name, icon: 'helm' as IconName, line: <b style={{ color: 'var(--good)' }}>NEW</b>, text: `${CLASSES[c].name} knights start turning up at the altar.` })),
    ...(next === BAL.perks.unlockRebirths ? [{ id: 'perks', art: <Px icon="sigil" size="lg" s={1} />, name: 'Perks', icon: 'sigil' as IconName, line: <b style={{ color: 'var(--good)' }}>OPEN</b>, text: 'Sage Orrin rolls perks for sigils.' }] : []),
  ];
  // Extras go with their knights (core/newGame.ts rebirth): said here, with what they'd fetch, while
  // there's still time to sell them and spend it.
  const extras = extrasCount(st);
  const extrasGold = fmt(extrasValue(st));
  const losses: Array<{ id: string; icon: string; name: string; line: string; text: string }> = [
    { id: 'knights', icon: 'helm10', name: 'Knights', line: 'All of them', text: 'Your knights, with their levels and their extras (the Codex stays).' },
    ...(extras > 0
      ? [{ id: 'extras', icon: 'copies', name: 'Extras', line: `${extras} · ${extrasGold} gold`, text: `Your ${extrasText(extras)} go with their knights, and the ${extrasGold} gold they'd fetch with them. Bram the Broker sells them, if you'd rather spend it first.` }]
      : []),
    { id: 'gold', icon: 'coin', name: 'Gold', line: 'Back to 0', text: 'All your gold.' },
    { id: 'upgrades', icon: 'gear', name: 'Upgrades', line: 'Back to 0', text: "The tinker's upgrades." },
    { id: 'perks', icon: 'sigil', name: 'Perks', line: 'Rolled again', text: 'Your perks go; you start the run with a sigil for each rebirth to roll them again.' },
  ];
  const lossArt = (icon: string) => (icon === 'helm10' ? <Icon icon={icon} big /> : <Px icon={icon as IconName} size="lg" s={icon === 'copies' ? 2 : 1} />);
  const all = [...gains.map((g) => ({ ...g, lose: false })), ...losses.map((l) => ({ id: `lose-${l.id}`, art: lossArt(l.icon), name: l.name, icon: l.icon, line: l.line as ReactNode, text: l.text, lose: true }))];
  const card = (g: (typeof all)[number]) => (
    <OfferCard
      key={g.id}
      art={g.art}
      tall={g.id.startsWith('cls-')}
      name={g.name}
      tag={g.lose ? { icon: 'cross', color: '#f4e4c1' } : { icon: 'arrowUp', kind: 'new' }}
      state={g.lose ? 'done' : 'open'}
      lines={g.line ? [{ text: g.line, tone: g.lose ? 'bad' : undefined }] : []}
      onArt={() => (uiSound('open'), setInfo(g.id))}
    />
  );
  const pick = all.find((g) => g.id === info);
  return (
    <>
      <KeeperScreen game={game} station={station} tabs={[{ id: 'rebirth', label: 'REBIRTH', icon: 'rebirth' }]} tab="rebirth" onTab={() => {}} onClose={onClose}>
        <ShopTop
          purse={
            <Stat icon="rebirth" label="Rebirths" title="Rebirths">
              {st.rebirths}
            </Stat>
          }
          title={
            <Stat icon="stairs" label="Best floor" title="Best floor this run / the floor a rebirth needs">
              {st.run.bestFloor}/{need}
            </Stat>
          }
        />
        <ShopHint>
          {ok ? (
            <>
              <b>Rebirth now!</b> It's how you get stronger: every rebirth makes every run after it faster, with more luck, gold and power for good. Tap a card for more.
            </>
          ) : (
            <>
              <b>Rebirth</b>: start over from floor 1, stronger for good. Reach <b>floor {need}</b> first. Tap a card for more.
            </>
          )}
        </ShopHint>
        <ShopBody>
          <ShopGrid>
            <ShopHeading>YOU GAIN FOR GOOD</ShopHeading>
            {all.filter((g) => !g.lose).map(card)}
            <ShopHeading>YOU LOSE</ShopHeading>
            {all.filter((g) => g.lose).map(card)}
          </ShopGrid>
        </ShopBody>
        <ShopFoot>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span>
              Floor <b>{st.run.bestFloor}</b> of {need}
            </span>
            <div className={s.meter} style={{ marginTop: 'calc(1 * var(--px))' }} data-kind="gold">
              <i style={{ width: `${Math.min(100, (st.run.bestFloor / need) * 100)}%` }} />
            </div>
          </div>
          <button className={`btn ${s.bigBtn}`} data-ready={ok || undefined} disabled={!ok} onClick={() => (uiSound('rebirth'), game.rebirth())} style={{ flex: 'none' }}>
            <Px icon={ok ? 'rebirth' : 'lock'} size="md" />
            {ok ? 'REBIRTH' : `FLOOR ${need}`}
          </button>
        </ShopFoot>
      </KeeperScreen>
      {pick && (
        <InfoPopup art={pick.art} name={pick.name} onClose={() => setInfo(null)}>
          <div className={s.popRow} data-tone={pick.lose ? 'bad' : 'good'}>
            <Glyph icon={pick.lose ? 'cross' : 'arrowUp'} />
            {pick.text}
          </div>
        </InfoPopup>
      )}
    </>
  );
}

// ------------------------------------------------------------------ the notice board

export function questIcon(q: Quest): string {
  switch (q.kind) {
    case 'slay':
      return 'sword';
    case 'slayElite':
      return 'star';
    case 'boss':
      return 'skull';
    case 'reach':
      return 'stairs';
    case 'collect':
      return q.item === 'hourglass' ? 'hourglass' : q.item === 'potion' ? 'potion' : 'coin';
  }
}

/** What a job is after, in a word or two: "Slimes", "Elites", "Floor 9". */
export function goalName(q: Quest): string {
  switch (q.kind) {
    case 'slay':
      return q.mobName ? plural(mobNoun(q.mobName)) : 'Monsters';
    case 'slayElite':
      return 'Elites';
    case 'boss':
      return 'A boss';
    case 'reach':
      return `Floor ${q.floorTaken + q.target}`;
    case 'collect':
      return q.item === 'hourglass' ? 'Hourglasses' : q.item === 'potion' ? 'Potions' : 'Coins';
  }
}

function rewardLines(q: Quest): Array<{ icon: IconName; text: string; tone: 'gold' }> {
  const out: Array<{ icon: IconName; text: string; tone: 'gold' }> = [];
  if (q.reward.gold) out.push({ icon: 'coin', text: `${fmt(q.reward.gold)} gold`, tone: 'gold' });
  if (q.reward.hourglasses) out.push({ icon: 'hourglass', text: `${q.reward.hourglasses} hourglass${q.reward.hourglasses > 1 ? 'es' : ''}`, tone: 'gold' });
  if (q.reward.luckSpins) out.push({ icon: 'star', text: `${q.reward.luckSpins} lucky spin${q.reward.luckSpins > 1 ? 's' : ''}`, tone: 'gold' });
  if (q.reward.potion) out.push({ icon: 'potion', text: 'Luck potion', tone: 'gold' });
  return out;
}

export function BoardShop({ game, station, onClose }: { game: Game; station: HubStation; onClose: () => void }) {
  useGameTick(game);
  const st = game.state;
  const list = activeQuests(st.quests ?? []);
  const [info, setInfo] = useState<string | null>(null);
  const pick = list.find((q) => q.id === info);
  return (
    <>
      <KeeperScreen game={game} station={station} tabs={[{ id: 'jobs', label: 'JOBS', icon: 'book', badge: list.filter((q) => q.done).length }]} tab="jobs" onTab={() => {}} onClose={onClose}>
        <ShopTop purse={<Purse amount={st.gold} />} title={<Stat icon="book" label="Jobs">{list.length}/{MAX_ACTIVE_QUESTS}</Stat>} />
        <ShopHint>
          <b>Jobs</b> come from folk camped in the dungeon: talk to them to take one ({MAX_ACTIVE_QUESTS} at a time). When it's done, talk to someone like them again for the reward.
        </ShopHint>
        <ShopBody>
          {list.length === 0 ? (
            <div className={s.empty}>
              <Icon icon="scroll" big />
              <div>
                <b>No jobs yet.</b>
                <br />
                Look for folk by a tent or a cart on your next run.
              </div>
            </div>
          ) : (
            <ShopGrid>
              {list.map((q) => {
                const p = Math.min(q.progress, q.target);
                return (
                  <OfferCard
                    key={q.id}
                    level={`${p}/${q.target}`}
                    art={<Icon icon={questIcon(q)} big />}
                    tag={q.done ? { icon: 'check', kind: 'new' } : undefined}
                    name={q.done ? (q.giverName ?? q.title) : goalName(q)}
                    state={q.done ? 'done' : 'open'}
                    lines={[
                      { text: q.done ? 'Done! Hand it in' : `${p} of ${q.target}`, tone: q.done ? 'good' : undefined },
                      { text: <ProgressBar value={p / q.target} /> },
                      { text: <span className={s.colhead}>REWARD</span> },
                      ...rewardLines(q),
                    ]}
                    onArt={() => (uiSound('open'), setInfo(q.id))}
                  />
                );
              })}
            </ShopGrid>
          )}
        </ShopBody>
      </KeeperScreen>
      {pick && (
        <InfoPopup art={<Icon icon={questIcon(pick)} big />} name={pick.title} sub={pick.giverName} onClose={() => setInfo(null)}>
          <p>{pick.text}</p>
          <div className={s.popRow} data-tone={pick.done ? 'good' : undefined}>
            <Px icon={pick.done ? 'check' : 'target'} size="sm" />
            {questGoal(pick)}
          </div>
          <div className={s.popRow} data-tone="muted">
            <Px icon="coin" size="sm" />
            Reward: {rewardText(pick.reward)}
          </div>
        </InfoPopup>
      )}
    </>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <span className={s.meter} style={{ display: 'block', width: '100%', marginTop: 'calc(0.5 * var(--px))' }}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </span>
  );
}

// ------------------------------------------------------------------ the Oracle

const oracleMemory = { tab: 'summon' };

export function OracleShop({ game, station, onClose, onOpen }: { game: Game; station: HubStation; onClose: () => void; onOpen: (id: string) => void }) {
  useGameTick(game, 250);
  const st = game.state;
  const [tabAt, setTabState] = useState(oracleMemory.tab);
  const setTab = (t: string) => {
    // (A tab tapped on a sealed altar goes nowhere, now or once the seal's broken.)
    if (game.state.roll.sealed) return;
    oracleMemory.tab = t;
    setTabState(t);
  };
  // A sealed altar is its seal and nothing else (the seal is on SUMMON: on any other tab there'd be
  // nothing to tap, and no way out of the screen).
  const tab = st.roll.sealed ? 'summon' : tabAt;
  const luck = game.luck;
  const pity = Math.max(0, drySpell(st) - st.roll.dry);
  const lucky = Math.max(0, Math.max(4, 10 - (st.upgrades.luckySpin ?? 0)) - st.roll.sinceLucky);
  const ch = rarityChances(luck);
  return (
    <KeeperScreen
      game={game}
      station={station}
      tabs={[
        { id: 'summon', label: 'SUMMON', icon: 'reelGold' },
        { id: 'latest', label: 'LATEST', icon: 'helm10' },
        { id: 'odds', label: 'ODDS', icon: 'dice' },
        { id: 'codex', label: 'CODEX', icon: 'book' },
      ]}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      locked={!!st.roll.sealed}
    >
      <ShopTop
        purse={
          <Stat icon="clover" label="Luck" title="Luck">
            x{luck < 10 ? luck.toFixed(2) : fmt(luck)}
          </Stat>
        }
        title={
          <span className={s.chips} style={{ justifyContent: 'flex-end' }}>
            <Stat icon="reel" label="Reels" title="Reels">
              {reelCount(st)}
            </Stat>
            <Stat icon="clock" label="Every" title="Seconds a spin">
              {spinCycle(st).toFixed(1)}s
            </Stat>
          </span>
        }
      />
      <ShopHint>
        {tab === 'summon' &&
          (st.roll.sealed ? (
            <>
              The altar is <b>sealed</b>. Break the seal and it <b>summons a free knight every {spinCycle(st).toFixed(1)}s</b>, even while you fight.
            </>
          ) : (
            <>
              The altar <b>summons a free knight every {spinCycle(st).toFixed(1)}s</b>, even while you fight. More luck, rarer knights.
            </>
          ))}
        {tab === 'latest' && (
          <>
            Your last summons, newest first (tap one to see it). <b>EXTRA</b>: you had it already, so Bram the Broker sells the copy.
          </>
        )}
        {tab === 'odds' && (
          <>
            How likely each rarity is: the <b>base</b> odds, and <b>your</b> chance with your luck (x{luck < 10 ? luck.toFixed(2) : fmt(luck)}).
          </>
        )}
        {tab === 'codex' && (
          <>
            Every knight there is: {Object.keys(st.codex).length} of {KNIGHTS.length} found. Rolling one you already have makes an <b>extra</b>, for Bram the Broker to sell.
          </>
        )}
      </ShopHint>
      <ShopBody scrollKey={tab}>
        {tab === 'summon' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(3 * var(--px))' }}>
            <div style={{ position: 'relative', background: '#1a0e14', boxShadow: '0 0 0 var(--px) #2b170c', padding: 'calc(1 * var(--px))' }}>
              <AltarReels game={game} variant="big" />
              {/* A new game's altar is sealed: a tap breaks the seal and the altar starts to spin. */}
              <AltarSeal game={game} />
            </div>
            <div className={s.chips}>
              <Stat icon="star" label="Lucky spin in" title="Every 10th spin is lucky: extra luck">
                {lucky}
              </Stat>
              {st.hourglasses > 0 && (
                <Stat icon="hourglass" label="Hourglasses" title="Turbo spins">
                  {st.hourglasses}
                </Stat>
              )}
              <Stat icon="gem" label="Luck token" title="The chance a spin lands a luck token (x2 to x10)">
                {Math.round(tokenChance(st) * 100)}%
              </Stat>
            </div>
            {st.roll.tutorial === 'done' && (
              <div className={s.note} title="Epic or better guaranteed in">
                <div className={s.popRow}>
                  <Px icon="shield" size="sm" />
                  <span>
                    <b style={{ color: inkOf(RARITY_COLOR.epic) }}>Epic or better</b> guaranteed in
                  </span>
                  <b style={{ marginLeft: 'auto' }}>
                    {pity} spin{pity === 1 ? '' : 's'}
                  </b>
                </div>
                <div className={s.meter} data-kind="purple">
                  <i style={{ width: `${(1 - pity / drySpell(st)) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        )}
        {tab === 'latest' &&
          (game.recent.length === 0 ? (
            <div className={s.empty}>
              <Px icon="reel" size="lg" s={1} />
              <div>Nothing summoned yet. The altar is spinning.</div>
            </div>
          ) : (
            <ShopGrid>
              {game.recent.slice(0, 18).map((r, i) => {
                const def = knightDef(r.knightId);
                return (
                  <OfferCard
                    key={`${r.at}-${i}`}
                    level={r.mult > 1 ? `x${r.mult}` : undefined}
                    art={<HeroArt id={r.knightId} mutation={r.mutation} s={1} />}
                    knight={{ rarity: def.rarity, mutation: r.mutation }}
                    tall
                    tag={r.isNew ? { text: 'NEW', kind: 'new' } : { text: 'EXTRA', kind: 'dupe', title: 'A knight you already have: kept as an extra for Bram the Broker to sell (your knight stays as it is)' }}
                    name={def.name}
                    lines={[{ text: RARITY_NAME[def.rarity], tone: 'muted' }]}
                    onArt={st.roster[r.knightId] ? () => (uiSound('tap'), onOpen(r.knightId)) : undefined}
                  />
                );
              })}
            </ShopGrid>
          ))}
        {tab === 'codex' && (
          <div className={s.legacy}>
            <Codex game={game} />
          </div>
        )}
        {tab === 'odds' && (
          <div className={s.note} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 'calc(1 * var(--px)) calc(4 * var(--px))', fontVariantNumeric: 'tabular-nums' }}>
            <span className={s.colhead}>RARITY</span>
            <span className={s.colhead} style={{ textAlign: 'right' }}>
              BASE
            </span>
            <span className={s.colhead} style={{ textAlign: 'right' }}>
              YOU
            </span>
            {[...RARITIES].reverse().map((r) => (
              <Row key={r} name={RARITY_NAME[r]} color={RARITY_COLOR[r]} odds={r === 'common' ? '-' : oneIn(RARITY_ODDS[r]).replace('1 in ', '1/')} chance={ch[r] > 0 ? (ch[r] >= 0.001 ? `${(ch[r] * 100).toFixed(ch[r] > 0.1 ? 1 : 2)}%` : oneIn(1 / ch[r]).replace('1 in ', '1/')) : '-'} />
            ))}
          </div>
        )}
      </ShopBody>
    </KeeperScreen>
  );
}

function Row({ name, color, odds, chance }: { name: string; color: string; odds: string; chance: string }) {
  const sw: CSSProperties = { display: 'inline-block', width: 'calc(4 * var(--px))', height: 'calc(4 * var(--px))', background: color, boxShadow: '0 0 0 calc(0.5 * var(--px)) #2b170c', marginRight: 'calc(1.5 * var(--px))' };
  return (
    <>
      <span style={{ display: 'flex', alignItems: 'center', fontWeight: 700, color: inkOf(color) }}>
        <i style={sw} />
        {name}
      </span>
      <span style={{ color: 'var(--mid)', textAlign: 'right' }}>{odds}</span>
      <b style={{ textAlign: 'right' }}>{chance}</b>
    </>
  );
}

// ------------------------------------------------------------------ the warden

const wardenMemory = { tab: 'squad', slot: -1 };

/** A rarity's little square, for a card's corner (its name in the title). */
function rarityTag(id: string) {
  const r = knightDef(id).rarity;
  return { color: RARITY_COLOR[r], title: RARITY_NAME[r] };
}

/** A knight's extras on its card, in their purple, pointing to the broker (nothing when it has none). */
function extrasLine(n: number): CardLine[] {
  return n > 0 ? [{ icon: 'copies', text: <span className={s.extraLine} title="Repeat pulls of this knight: Bram the Broker sells them, and the knight stays as it is">+{extrasText(n)} <small>at Bram's</small></span> }] : [];
}

/**
 * Warden Tobb at the head of the stairs: who goes down. Your three slots across the top (tap one to
 * pick it, LEAD to play that knight), every knight you have below with its level, power and LEVEL UP
 * for gold, and ADD TO SQUAD to put it in the slot you picked; REFORGE (a roll for a better
 * mutation) on its own tab; DESCEND at the foot. Everything to do with your knights happens here.
 */
/** A touch screen: knights are picked up by holding them (a swipe scrolls). */
const TOUCH_UI = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

/** A phone, or any screen too short to show the counter's slots and a list of knights at once. */
const COMPACT = '(max-width: 599px), (max-height: 800px)';
function useCompactScreen(): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(COMPACT).matches);
  useEffect(() => {
    const m = window.matchMedia?.(COMPACT);
    if (!m) return;
    const f = () => setOn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return on;
}

export function WardenShop({ game, station, onClose, onOpen }: { game: Game; station: HubStation; onClose: () => void; onOpen: (id: string) => void }) {
  useGameTick(game);
  const compact = useCompactScreen();
  const st = game.state;
  const [tab, setTabState] = useState(wardenMemory.tab);
  const [pick, setPickState] = useState(wardenMemory.slot);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [sure, setSure] = useState<string | null>(null);
  const [sold, setSold] = useState<string | null>(null);
  // Gold from a sale still flying in as coins: the counter shows it as they land.
  const [owed, setOwed] = useState(0);
  const [, bump] = useState(0);
  const setTab = (t: string) => ((wardenMemory.tab = t), setTabState(t), setSure(null));
  const setPick = (i: number) => ((wardenMemory.slot = i), setPickState(i));
  const floor = st.run.floor;
  const biome = biomeForFloor(floor, st.run.biomeSeed);
  const power = squadPower(st);
  const diff = floorDifficulty(floor, power, squadSize(st));
  const ch = CHALLENGE[diff.challenge];
  const all = rankedKnights(st);
  // Open slots: one to start, one more with each rebirth. The slot ADD fills: the one you picked, else
  // the first empty open one, else the weakest.
  const slots = squadSlots(st);
  const bonus = soloBonus(st);
  const empty = st.squad.findIndex((x, i) => !x && i < slots);
  const weakest = st.squad.reduce((w, id, i) => (id && i < slots && (w < 0 || knightRating(st, id) < knightRating(st, st.squad[w]!)) ? i : w), -1);
  const target = pick >= 0 && pick < slots ? pick : empty >= 0 ? empty : weakest;
  const refresh = () => {
    game.syncSquad();
    game.syncHub(true, true);
    game.touch();
    bump((x) => x + 1);
  };
  const putAt = (id: string, slot: number) => {
    if (slot < 0 || slot >= slots) return;
    setSquadSlot(st, slot, id);
    if (!st.squad[st.controlled]) st.controlled = slot;
    uiSound('equip', 2);
    setPick(-1);
    refresh();
  };
  const put = (id: string) => putAt(id, target);
  const bench = (slot: number) => {
    if (!benchKnight(st, slot)) return;
    uiSound('close');
    setPick(-1);
    refresh();
  };
  const filled = st.squad.filter(Boolean).length;
  const lead = (slot: number) => {
    st.controlled = slot;
    uiSound('equip', 4);
    refresh();
  };
  const levelUpKnight = (id: string): boolean => {
    const before = st.roster[id]?.level ?? 0;
    if (!levelUp(st, id)) return false;
    uiSound('levelUp', Math.min(6, Math.floor(before / 3)));
    refresh();
    return true;
  };
  const lastSale = useRef(0);
  // Rare and up ask twice before they go.
  const sell = (id: string): boolean => {
    // (A sold card's place is taken by the next at once: a second tap just after a sale is the same tap, not another sale.)
    if (performance.now() - lastSale.current < 350) return false;
    const ri = rarityIndex(knightDef(id).rarity);
    if (ri >= rarityIndex('rare') && sure !== id) {
      setSure(id);
      uiSound('tap');
      return false;
    }
    const name = knightDef(id).name;
    const art = document.querySelector(`[data-card="${id}"] .${s.well}`);
    const purse = document.querySelector('[data-keeper] [data-purse]');
    const extras = st.roster[id]?.extras ?? 0;
    const g = sellKnight(st, id);
    if (!g) return false;
    lastSale.current = performance.now();
    uiSound('sell', Math.min(6, ri));
    setSure(null);
    setSold(extras > 0 ? `Sold ${name} and ${extrasText(extras)} for ${fmt(g)} gold` : `Sold ${name} for ${fmt(g)} gold`);
    // The knight turns into coins that fly up into the gold counter.
    const coins = 6 + ri * 3;
    let paid = 0;
    setOwed((o) => o + g);
    coinFly(art, purse, {
      coins,
      reduceMotion: st.settings.reduceMotion,
      onLand: (i, last) => {
        const share = last ? g - paid : Math.floor(g / coins);
        paid += share;
        setOwed((o) => Math.max(0, o - share));
        if (last || i % 3 === 0) uiSound('collect', Math.min(4, Math.floor(i / 3)));
      },
    });
    refresh();
    return true;
  };
  // On a phone (or any short screen) the squad's slots scroll with the knights below them, so the
  // list gets the whole screen; on a big one they stay put over the list (for dragging onto them).
  const squadBlock = (
    <>
      {tab === 'squad' && (
        <div className={s.squadRow}>
          {[0, 1, 2].map((slot) => {
            const id = st.squad[slot] ?? null;
            return slot >= slots ? (
              <div key={slot} className={s.slot} data-locked title="Opens with a rebirth">
                <div className={s.slotLock}>
                  <Px icon="lock" size="md" />
                  <b>LOCKED</b>
                  <span>Rebirth {slot} opens it</span>
                </div>
              </div>
            ) : (
            <div key={slot} className={s.slot} data-on={slot === target || undefined} data-drop-slot={slot} onClick={() => (uiSound('tap'), setPick(slot === pick ? -1 : slot))} role="button">
              {id ? (
                <>
                  {filled > 1 && (
                    <button className={s.slotX} aria-label="Empty this slot" title="Leave this slot empty (going down short-handed pays more gold)" onClick={(e) => (e.stopPropagation(), bench(slot))}>
                      <i />
                    </button>
                  )}
                  <div className={s.slotArt} style={{ ...backdropStyle(knightDef(id).rarity, artPx(), 30 * artPx(), 5, 96), ['--rc' as string]: RARITY_COLOR[knightDef(id).rarity] } as CSSProperties}>
                    <DragKnight onDrop={(to) => putAt(id, to)} onDropOut={filled > 1 ? () => bench(slot) : undefined} title={filled > 1 ? 'Drag onto another slot to swap, or off the slots to take out of the squad' : 'Drag onto another slot to move'}>
                      <HeroArt id={id} mutation={st.roster[id]?.mutation ?? null} s={1} />
                    </DragKnight>
                    {slot === st.controlled && (
                      <span className={s.slotCrown} title="The knight you play">
                        <Px icon="crown" size="sm" />
                      </span>
                    )}
                  </div>
                  <b className={s.slotName} style={{ ['--rc' as string]: RARITY_COLOR[knightDef(id).rarity] } as CSSProperties}>
                    {knightDef(id).name}
                  </b>
                  <ClassTag cls={knightDef(id).cls} short />
                  <span className={s.slotMeta}>
                    <OddsChip rarity={knightDef(id).rarity} mutation={st.roster[id]?.mutation ?? null} />
                    <small>
                      Lv {st.roster[id]?.level ?? 1} · <Px icon="sword" size="xs" /> {fmt(knightRating(st, id))}
                    </small>
                  </span>
                  {slot !== st.controlled ? (
                    <button className={`btn ${s.second}`} onClick={(e) => (e.stopPropagation(), lead(slot))}>
                      <Px icon="crown" size="xs" /> LEAD
                    </button>
                  ) : (
                    <span className={s.youTag}>YOU PLAY</span>
                  )}
                </>
              ) : (
                <div className={s.slotEmpty}>
                  <Px icon="helm" size="lg" s={1} />
                  <small>Drag a knight here</small>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
      {tab === 'squad' && bonus > 1 && (
        <div className={s.soloLine} data-tut="solo" title="Each open slot left empty adds half again to the gold you find">
          <Px icon="coin" size="xs" />
          <span>
            Short-handed: <b>gold ×{bonus.toFixed(1)}</b> on this run
          </span>
        </div>
      )}
      {tab === 'squad' && hasPerk(st, 'loneWolf') && (
        <div className={s.soloLine} title="Lone Wolf (a perk): a knight that goes down alone fights with x3 HP, x2.5 damage and faster specials">
          <Px icon="sword" size="xs" />
          <span>
            Lone Wolf: go down <b>alone</b> for <b>×3 HP, ×2.5 damage</b>
          </span>
        </div>
      )}
    </>
  );
  const best = isBestSquad(st);
  const putBest = () => {
    bestSquad(st);
    if (!st.squad[st.controlled]) st.controlled = Math.max(0, st.squad.findIndex(Boolean));
    uiSound('equip', 3);
    setPick(-1);
    refresh();
  };
  return (
    <KeeperScreen
      game={game}
      station={station}
      tabs={[
        { id: 'squad', label: 'SQUAD', icon: 'helm10', badge: st.squad.filter((id) => id && canLevel(st, id)).length },
        { id: 'reforge', label: 'REFORGE', icon: 'gem' },
        { id: 'sell', label: 'SELL', icon: 'coin' },
      ]}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
    >
      <ShopTop
        purse={<Purse amount={st.gold - owed} />}
        title={
          <span className={s.chips}>
            <Stat icon="stairs" label="Floor" title={`Floor ${floor}, ${biome.name}`}>
              {floor}
            </Stat>
            <Stat icon="sword" label="Power" title={`Your squad's power; floor ${floor} wants about ${fmt(diff.par)}`}>
              {fmt(power)}
            </Stat>
            <span className="dchip" style={{ ['--cc' as string]: ch.color, ['--seal' as string]: `var(--sk-seal-${diff.challenge})`, color: '#2b170c', textShadow: 'none' } as CSSProperties} title={ch.text}>
              {ch.name.toUpperCase()}
            </span>
          </span>
        }
      />
      <ShopHint>
        {tab === 'squad' ? (
          <>
            {TOUCH_UI ? (
              <>
                <b>Hold</b> a knight, then drag it onto a slot (or tap <b>ADD TO SQUAD</b>). <b>LEAD</b> is the one you play.
              </>
            ) : (
              <>
                <b>Drag</b> a knight onto a slot (or tap a slot, then <b>ADD</b>). <b>LEAD</b> is the one you play.
              </>
            )}
          </>
        ) : tab === 'reforge' ? (
          <>
            <b>Reforge</b> rolls for a <b>mutation</b> (a big power boost) for gold. A better one replaces the old; a worse one changes nothing.
          </>
        ) : sold ? (
          <b className={s.goodLine}>
            <Px icon="coin" size="xs" /> {sold}
          </b>
        ) : (
          <>
            <b>Sell</b> knights you don't need for gold (weakest first), their extras with them. Knights in your squad stay; Rare and up ask twice.
          </>
        )}
      </ShopHint>
      {!compact && squadBlock}
      <ShopBody scrollKey={tab}>
        {compact && squadBlock}
        {all.length === 0 ? (
          <div className={s.empty}>
            <Px icon="helm" size="lg" s={1} />
            <div>No knights yet. The Oracle's altar summons them for free.</div>
          </div>
        ) : (
          <ShopGrid>
            {(tab === 'sell' ? [...all].reverse() : all).map((id) => {
              const rec = st.roster[id];
              const def = knightDef(id);
              const inSquad = st.squad.includes(id);
              if (tab === 'sell') {
                const value = sellValue(st, id);
                return (
                  <OfferCard
                    key={id}
                    cardId={id}
                    level={`Lv ${rec.level}`}
                    levelRight={<ClassTag cls={def.cls} short />}
                    art={<HeroArt id={id} mutation={rec.mutation} s={1} />}
                    knight={{ rarity: def.rarity, mutation: rec.mutation }}
                    tall
                    tag={rarityTag(id)}
                    name={def.name}
                    onArt={() => (uiSound('tap'), onOpen(id))}
                    lines={[
                      { icon: 'sword', text: `Power ${fmt(knightRating(st, id))}` },
                      // Selling a knight sells its extras with it (they can't stay without it); one in
                      // the squad can't be sold, so its extras are Bram's to sell.
                      ...(rec.extras <= 0 ? [] : inSquad ? extrasLine(rec.extras) : [{ icon: 'copies' as IconName, text: <span className={s.extraLine}>its {extrasText(rec.extras)} {rec.extras === 1 ? 'goes' : 'go'} too</span> }]),
                    ]}
                    button={
                      inSquad
                        ? { kind: 'done', label: 'IN SQUAD' }
                        : {
                            kind: 'buy',
                            verb: sure === id ? 'SURE? SELL' : 'SELL',
                            label: `+${fmt(value)}`,
                            icon: 'coin',
                            ready: true,
                            gold: true,
                            onPress: () => sell(id),
                            paid: `+${fmt(value)}`,
                            short: 'tap again to sell',
                          }
                    }
                  />
                );
              }
              if (tab === 'squad') {
                const maxed = maxedLevel(st, id);
                const cost = levelCost(st, id);
                return (
                  <OfferCard
                    key={id}
                    cardId={id}
                    level={`Lv ${rec.level}`}
                    levelRight={<ClassTag cls={def.cls} short />}
                    art={
                      <DragKnight onDrop={(to) => putAt(id, to)} title={TOUCH_UI ? 'Hold, then drag onto a squad slot' : 'Drag onto a squad slot'}>
                        <HeroArt id={id} mutation={rec.mutation} s={1} />
                      </DragKnight>
                    }
                    knight={{ rarity: def.rarity, mutation: rec.mutation }}
                    tall
                    tag={rarityTag(id)}
                    name={def.name}
                    onArt={() => (uiSound('tap'), onOpen(id))}
                    lines={[{ icon: 'sword', text: `Power ${fmt(knightRating(st, id))}` }, ...extrasLine(rec.extras)]}
                    button={
                      maxed
                        ? { kind: 'done', label: 'MAX LEVEL' }
                        : {
                            kind: 'buy',
                            verb: 'LEVEL UP',
                            label: fmt(cost),
                            icon: 'coin',
                            ready: st.gold >= cost,
                            hold: true,
                            onPress: () => levelUpKnight(id),
                            paid: `Lv ${rec.level + 1}!`,
                            short: `need ${fmt(cost - st.gold)} more`,
                          }
                    }
                    second={
                      inSquad
                        ? { label: <><Px icon="check" size="xs" /> IN SQUAD</>, on: true, title: 'In your squad' }
                        : { label: target >= 0 && st.squad[target] ? `SWAP IN (slot ${target + 1})` : 'ADD TO SQUAD', onPress: () => put(id) }
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
                  levelRight={<ClassTag cls={def.cls} short />}
                  art={<HeroArt id={id} mutation={rec.mutation} s={1} />}
                  knight={{ rarity: def.rarity, mutation: rec.mutation }}
                  tall
                  tag={rarityTag(id)}
                  name={def.name}
                  onArt={() => (uiSound('tap'), onOpen(id))}
                  lines={[
                    { icon: 'sword', text: `Power ${fmt(knightRating(st, id))}` },
                    ...(msg[id] ? [{ icon: 'sparkle' as IconName, text: msg[id], tone: msg[id].endsWith('!') ? ('good' as const) : ('muted' as const) }] : extrasLine(rec.extras)),
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
                          short: `need ${fmt(cost - st.gold)} more`,
                        }
                  }
                />
              );
            })}
          </ShopGrid>
        )}
      </ShopBody>
      <ShopFoot>
        <button
          className={`btn ${s.bestBtn}`}
          data-hot={!best || undefined}
          disabled={all.length === 0}
          onClick={putBest}
          title="Put your 3 strongest knights in the squad"
        >
          <Px icon="star" size="md" />
          <span>
            BEST SQUAD
            <small>{best ? 'all set' : 'swap in stronger'}</small>
          </span>
        </button>
        <button className={`btn ${s.bigBtn}`} data-tut="descend" disabled={!st.squad.some(Boolean)} onClick={() => (uiSound('embark'), onClose(), game.enterDungeon())}>
          <Px icon="swords" size="md" />
          {game.world ? 'CONTINUE' : 'DESCEND'}
        </button>
      </ShopFoot>
    </KeeperScreen>
  );
}
