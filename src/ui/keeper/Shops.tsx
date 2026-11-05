/**
 * The other keepers' counters in the shared layout, icons and numbers first, words only in the
 * popups their cards open:
 *  - Sage Orrin: perks for sigils, by tree (core/perks.ts);
 *  - Sister Maren: rebirth, what it gives and what it takes, and the button (core/newGame.ts);
 *  - the notice board: your jobs, their progress and rewards (core/quests.ts);
 *  - Oracle Vesper: the altar's reels, your latest summons and the odds;
 *  - Warden Tobb: the next floor, your squad and the way down;
 *  - Quartermaster Hilde: the roster, as its own screen draws it (kept whole, on dark wood).
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { BAL } from '../../core/balance';
import { CLASSES, knightDef, knightId, unlockedClasses } from '../../core/knights';
import { canRebirth, rebirthFloor } from '../../core/newGame';
import { PERKS, PERK_TREES, buyPerk, canBuyPerk, hasPerk, perksOpen, type PerkDef, type PerkTree } from '../../core/perks';
import { CHALLENGE, floorDifficulty, knightRating, squadPower } from '../../core/power';
import { activeQuests, MAX_ACTIVE_QUESTS, mobNoun, plural, questGoal, rewardText, type Quest } from '../../core/quests';
import { RARITIES, RARITY_COLOR, RARITY_NAME, RARITY_ODDS, rarityChances } from '../../core/rarity';
import { drySpell, reelCount, spinCycle, tokenChance } from '../../core/roller';
import { rebirthStatMult } from '../../core/roster';
import type { Game } from '../../game';
import { biomeForFloor } from '../../world/biomes';
import type { HubStation } from '../../world/hubWorld';
import { HeroArt } from '../common';
import { AltarReels } from '../fx/AltarReels';
import { fmt, oneIn } from '../format';
import { Px, type IconName } from '../px';
import { uiSound } from '../sound';
import { InfoPopup } from './InfoPopup';
import { Delta, Glyph, KeeperScreen, Purse, ShopBody, ShopFoot, ShopGrid, ShopTop, Stat, keeperStyles as s, useGameTick, type KeeperCat } from './KeeperScreen';
import { OfferCard } from './OfferCard';
import { Icon } from './TinkerShop';

/** A rarity's color made dark enough to read on paper. */
function inkOf(c: string): string {
  const n = parseInt(c.slice(1), 16);
  const f = (sh: number) => Math.round(((n >> sh) & 255) * 0.55);
  return `rgb(${f(16)}, ${f(8)}, ${f(0)})`;
}

// ------------------------------------------------------------------ the sage

const TREE_ICON: Record<PerkTree, string> = { underdog: 'pitchfork', command: 'banner', reels: 'reel', chaos: 'bomb' };
const TREE_LABEL: Record<PerkTree, string> = { underdog: 'MEEK', command: 'LEAD', reels: 'REELS', chaos: 'CHAOS' };
/** A perk's picture: its own icon, drawn in the upgrade icons' style (iconRows.ts) or one of the UI's. */
const perkIcon = (p: PerkDef) => p.icon;
const sageMemory = { tree: 'underdog' as PerkTree };

export function SageShop({ game, station, onClose }: { game: Game; station: HubStation; onClose: () => void }) {
  useGameTick(game);
  const st = game.state;
  const [tree, setTree] = useState<PerkTree>(sageMemory.tree);
  const [info, setInfo] = useState<string | null>(null);
  const [, bump] = useState(0);
  const open = perksOpen(st);
  const buy = (id: string): boolean => {
    if (!buyPerk(st, id)) return false;
    uiSound('perk');
    game.syncSquad();
    game.touch();
    bump((x) => x + 1);
    return true;
  };
  const reqMet = (p: PerkDef) => p.requires.length === 0 || p.requires.every((r) => hasPerk(st, r)) || (p.requires.length > 1 && p.requires.some((r) => hasPerk(st, r)));
  const cats: KeeperCat[] = PERK_TREES.map((t) => ({ id: t.id, label: TREE_LABEL[t.id], icon: <Icon icon={TREE_ICON[t.id]} />, badge: PERKS.filter((p) => p.tree === t.id && canBuyPerk(st, p.id)).length }));
  const infoPerk = info ? PERKS.find((p) => p.id === info) : undefined;
  return (
    <>
      <KeeperScreen game={game} station={station} tabs={[{ id: 'perks', label: 'PERKS', icon: 'sigil', badge: PERKS.filter((p) => canBuyPerk(st, p.id)).length }]} tab="perks" onTab={() => {}} onClose={onClose}>
        <ShopTop purse={<Purse amount={st.sigils} icon="sigil" label="Sigils" />} title={<Stat icon="check">{st.perks.length}/{PERKS.length}</Stat>} />
        {!open ? (
          <ShopBody>
            <ShopGrid>
              <OfferCard
                art={<Px icon="rebirth" size="lg" s={1} />}
                name={<Px icon="lock" size="sm" />}
                state="locked"
                lines={[{ icon: 'rebirth', text: 'x1' }]}
                onArt={() => (uiSound('open'), setInfo('closed'))}
                button={{ kind: 'locked' }}
              />
            </ShopGrid>
          </ShopBody>
        ) : (
          <ShopBody cats={cats} cat={tree} onCat={(t) => ((sageMemory.tree = t as PerkTree), setTree(t as PerkTree))} scrollKey={tree}>
            <ShopGrid>
              {PERKS.filter((p) => p.tree === tree).map((p) => {
                const owned = hasPerk(st, p.id);
                const met = reqMet(p);
                return (
                  <OfferCard
                    key={p.id}
                    art={<Icon icon={perkIcon(p)} big />}
                    name={p.name}
                    lines={[]}
                    state={owned ? 'done' : met ? 'open' : 'locked'}
                    onArt={() => (uiSound('open'), setInfo(p.id))}
                    button={
                      owned
                        ? { kind: 'done' }
                        : !met
                          ? { kind: 'locked' }
                          : { kind: 'buy', label: `${p.cost}`, icon: 'sigil', ready: st.sigils >= p.cost, onPress: () => buy(p.id), paid: `-${p.cost}`, short: `-${p.cost - st.sigils}` }
                    }
                  />
                );
              })}
            </ShopGrid>
          </ShopBody>
        )}
      </KeeperScreen>
      {info === 'closed' && (
        <InfoPopup art={<Px icon="sigil" size="lg" s={1} />} name="Perks" onClose={() => setInfo(null)}>
          <div className={s.popRow}>
            <Px icon="lock" size="sm" />
            <Px icon="rebirth" size="sm" />
            Open after your first rebirth.
          </div>
        </InfoPopup>
      )}
      {infoPerk && (
        <InfoPopup
          art={<Icon icon={perkIcon(infoPerk)} big />}
          name={infoPerk.name}
          sub={
            <span style={{ color: inkOf(PERK_TREES.find((t) => t.id === infoPerk.tree)!.color) }}>
              {PERK_TREES.find((t) => t.id === infoPerk.tree)!.name}
            </span>
          }
          onClose={() => setInfo(null)}
          actions={
            !hasPerk(st, infoPerk.id) && reqMet(infoPerk) ? (
              <button className={`btn ${s.buy}`} data-kind={st.sigils >= infoPerk.cost ? 'buy' : 'short'} onClick={() => buy(infoPerk.id) && setInfo(null)}>
                <Px icon="sigil" size="sm" />
                <span>{infoPerk.cost}</span>
              </button>
            ) : undefined
          }
        >
          <p>{infoPerk.text}</p>
          {!hasPerk(st, infoPerk.id) && infoPerk.requires.length > 0 && (
            <div className={s.popRow} data-tone={reqMet(infoPerk) ? 'muted' : 'bad'}>
              <Px icon={reqMet(infoPerk) ? 'check' : 'lock'} size="sm" />
              {infoPerk.requires.map((r, i) => {
                const q = PERKS.find((x) => x.id === r)!;
                return (
                  <span key={r} className={s.popRow}>
                    {i > 0 && <span>{infoPerk.requires.length > 1 ? 'or' : ''}</span>}
                    <Icon icon={perkIcon(q)} />
                    {q.name}
                  </span>
                );
              })}
            </div>
          )}
        </InfoPopup>
      )}
    </>
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
    ...fresh.map((c) => ({ id: `cls-${c}`, art: <HeroArt id={knightId('rare', c)} s={1} />, name: CLASSES[c].name, icon: 'helm' as IconName, line: <b style={{ color: 'var(--good)' }}>NEW</b>, text: `${CLASSES[c].name} knights start turning up at the altar.` })),
    ...(next === BAL.perks.unlockRebirths ? [{ id: 'perks', art: <Px icon="sigil" size="lg" s={1} />, name: 'Perks', icon: 'sigil' as IconName, line: <b style={{ color: 'var(--good)' }}>OPEN</b>, text: 'Sage Orrin sells perks for sigils.' }] : []),
  ];
  const losses: Array<{ id: string; icon: string; name: string; text: string }> = [
    { id: 'knights', icon: 'helm10', name: 'Knights', text: 'Your knights, with their levels, shards and duplicates (the Codex stays).' },
    { id: 'gold', icon: 'coin', name: 'Gold', text: 'All your gold.' },
    { id: 'upgrades', icon: 'gear', name: 'Upgrades', text: "The tinker's upgrades." },
    { id: 'perks', icon: 'sigil', name: 'Perks', text: 'Perks and sigils.' },
  ];
  const all = [...gains.map((g) => ({ ...g, lose: false })), ...losses.map((l) => ({ id: `lose-${l.id}`, art: l.icon in { helm10: 1 } ? <Icon icon={l.icon} big /> : <Px icon={l.icon as IconName} size="lg" s={1} />, name: l.name, icon: l.icon, line: null as ReactNode, text: l.text, lose: true }))];
  const pick = all.find((g) => g.id === info);
  return (
    <>
      <KeeperScreen game={game} station={station} tabs={[{ id: 'rebirth', label: 'REBIRTH', icon: 'rebirth' }]} tab="rebirth" onTab={() => {}} onClose={onClose}>
        <ShopTop
          purse={
            <Stat icon="rebirth" title="Rebirths">
              {st.rebirths}
            </Stat>
          }
          title={
            <Stat icon="stairs" title="Best floor this run / the floor a rebirth needs">
              {st.run.bestFloor}/{need}
            </Stat>
          }
        />
        <ShopBody>
          <ShopGrid>
            {all.map((g) => (
              <OfferCard
                key={g.id}
                art={g.art}
                tall={g.id.startsWith('cls-')}
                name={g.name}
                tag={g.lose ? { icon: 'cross', color: '#f4e4c1' } : { icon: 'arrowUp', kind: 'new' }}
                state={g.lose ? 'done' : 'open'}
                lines={g.line ? [{ text: g.line }] : []}
                onArt={() => (uiSound('open'), setInfo(g.id))}
              />
            ))}
          </ShopGrid>
        </ShopBody>
        <ShopFoot>
          <div className={s.meter} style={{ flex: 1, marginTop: 0 }} data-kind="gold" title={`${st.run.bestFloor}/${need}`}>
            <i style={{ width: `${Math.min(100, (st.run.bestFloor / need) * 100)}%` }} />
          </div>
          <button className={`btn ${s.bigBtn}`} disabled={!ok} onClick={() => (uiSound('rebirth'), game.rebirth())} style={{ flex: 'none' }}>
            <Px icon={ok ? 'rebirth' : 'lock'} size="md" />
            {ok ? 'REBIRTH' : need}
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

function questIcon(q: Quest): string {
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
function goalName(q: Quest): string {
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
  if (q.reward.gold) out.push({ icon: 'coin', text: fmt(q.reward.gold), tone: 'gold' });
  if (q.reward.hourglasses) out.push({ icon: 'hourglass', text: `${q.reward.hourglasses}`, tone: 'gold' });
  if (q.reward.luckSpins) out.push({ icon: 'star', text: `${q.reward.luckSpins}`, tone: 'gold' });
  if (q.reward.potion) out.push({ icon: 'potion', text: '1', tone: 'gold' });
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
        <ShopTop purse={<Purse amount={st.gold} />} title={<Stat icon="book">{list.length}/{MAX_ACTIVE_QUESTS}</Stat>} />
        <ShopBody>
          {list.length === 0 ? (
            <div className={s.empty}>
              <Icon icon="scroll" big />
              <div>0/{MAX_ACTIVE_QUESTS}</div>
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
                    lines={[{ text: <ProgressBar value={p / q.target} /> }, ...rewardLines(q)]}
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
            {rewardText(pick.reward)}
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
  const [tab, setTabState] = useState(oracleMemory.tab);
  const setTab = (t: string) => ((oracleMemory.tab = t), setTabState(t));
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
      ]}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
    >
      <ShopTop
        purse={
          <Stat icon="clover" title="Luck">
            x{luck < 10 ? luck.toFixed(2) : fmt(luck)}
          </Stat>
        }
        title={
          <span className={s.chips} style={{ justifyContent: 'flex-end' }}>
            <Stat icon="reel" title="Reels">
              {reelCount(st)}
            </Stat>
            <Stat icon="clock" title="Seconds a spin">
              {spinCycle(st).toFixed(1)}s
            </Stat>
          </span>
        }
      />
      <ShopBody scrollKey={tab}>
        {tab === 'summon' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(3 * var(--px))' }}>
            <div style={{ background: '#1a0e14', boxShadow: '0 0 0 var(--px) #2b170c', padding: 'calc(1 * var(--px))' }}>
              <AltarReels game={game} variant="big" />
            </div>
            <div className={s.chips}>
              <Stat icon="star" title="Lucky Spin in">
                {lucky}
              </Stat>
              {st.hourglasses > 0 && (
                <Stat icon="hourglass" title="Turbo spins">
                  {st.hourglasses}
                </Stat>
              )}
              <Stat icon="gem" title="Luck token chance">
                {Math.round(tokenChance(st) * 100)}%
              </Stat>
            </div>
            {st.roll.tutorial === 'done' && (
              <div className={s.note} title="Epic or better guaranteed in">
                <div className={s.popRow}>
                  <Px icon="shield" size="sm" />
                  <b style={{ color: inkOf(RARITY_COLOR.epic) }}>EPIC+</b>
                  <span style={{ marginLeft: 'auto' }}>{pity}</span>
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
                    tall
                    tag={r.isNew ? { text: 'NEW', kind: 'new' } : { color: RARITY_COLOR[def.rarity], title: RARITY_NAME[def.rarity] }}
                    name={def.name}
                    lines={[{ icon: 'dice', text: oneIn(r.oneIn).replace('1 in ', '1/') }]}
                    onArt={st.roster[r.knightId] ? () => (uiSound('tap'), onOpen(r.knightId)) : undefined}
                  />
                );
              })}
            </ShopGrid>
          ))}
        {tab === 'odds' && (
          <div className={s.note} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 'calc(1 * var(--px)) calc(4 * var(--px))', fontVariantNumeric: 'tabular-nums' }}>
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

export function GateShop({ game, station, onClose }: { game: Game; station: HubStation; onClose: () => void }) {
  useGameTick(game);
  const st = game.state;
  const floor = st.run.floor;
  const biome = biomeForFloor(floor, st.run.biomeSeed);
  const power = squadPower(st);
  const diff = floorDifficulty(floor, power);
  const ch = CHALLENGE[diff.challenge];
  return (
    <KeeperScreen game={game} station={station} tabs={[{ id: 'down', label: 'DESCEND', icon: 'swords' }]} tab="down" onTab={() => {}} onClose={onClose}>
      <ShopTop
        purse={
          <Stat icon="stairs" title="Floor">
            {floor}
          </Stat>
        }
        title={
          <span className={s.chips} style={{ justifyContent: 'flex-end' }}>
            <Stat icon="sword" title="Squad power / par">
              {fmt(power)}/{fmt(diff.par)}
            </Stat>
            <span className="dchip" style={{ ['--cc' as string]: ch.color, ['--seal' as string]: `var(--sk-seal-${diff.challenge})`, color: '#2b170c', textShadow: 'none' } as CSSProperties} title={ch.text}>
              {ch.name.toUpperCase()}
            </span>
          </span>
        }
      />
      <ShopBody>
        <ShopGrid>
          <OfferCard
            level={floor % 5 === 0 ? <Px icon="skull" size="sm" /> : undefined}
            art={<Px icon={floor % 5 === 0 ? 'skull' : 'swords'} size="lg" s={1} />}
            name={biome.name}
            lines={[]}
          />
          {st.squad.map((id, slot) =>
            id ? (
              <OfferCard
                key={slot}
                level={`Lv.${st.roster[id]?.level ?? 1}`}
                levelRight={slot === st.controlled ? <Px icon="star" size="xs" /> : undefined}
                art={<HeroArt id={id} mutation={st.roster[id]?.mutation ?? null} s={1} />}
                tall
                tag={{ color: RARITY_COLOR[knightDef(id).rarity], title: RARITY_NAME[knightDef(id).rarity] }}
                name={knightDef(id).name}
                lines={[{ icon: 'sword', text: fmt(knightRating(st, id)) }]}
              />
            ) : null,
          )}
        </ShopGrid>
      </ShopBody>
      <ShopFoot>
        <button className={`btn ${s.bigBtn}`} style={{ flex: 1 }} onClick={() => (uiSound('embark'), onClose(), game.enterDungeon())}>
          <Px icon="swords" size="md" />
          {game.world ? 'CONTINUE' : 'DESCEND'}
        </button>
      </ShopFoot>
    </KeeperScreen>
  );
}

// ------------------------------------------------------------------ the quartermaster

/** The quartermaster's counter: the roster screen as it draws itself, on dark wood inside the paper. */
export function QuartermasterShop({ game, station, onClose, children }: { game: Game; station: HubStation; onClose: () => void; children: ReactNode }) {
  useGameTick(game);
  const st = game.state;
  return (
    <KeeperScreen game={game} station={station} tabs={[{ id: 'squad', label: 'SQUAD', icon: 'helm10' }]} tab="squad" onTab={() => {}} onClose={onClose}>
      <ShopTop
        purse={<Purse amount={st.gold} />}
        title={
          <Stat icon="sword" title="Squad power">
            {fmt(squadPower(st))}
          </Stat>
        }
      />
      <ShopBody>
        <div className={s.legacy}>{children}</div>
      </ShopBody>
    </KeeperScreen>
  );
}
