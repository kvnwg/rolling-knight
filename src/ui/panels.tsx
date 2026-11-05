/**
 * The home screen's panels: Camp (your squad and the way into the dungeon), Summon (the altar),
 * Heroes (your collection: pick the squad, level knights, break down or sell their spare copies; and
 * the Codex), Upgrades, Perks, Rebirth; plus the hero detail, luck and settings sheets.
 */
import { useMemo, useRef, useState } from 'react';
import { MUSIC_CREDIT } from '../audio/tracks';
import { BAL } from '../core/balance';
import { CLASSES, CLASS_IDS, KNIGHTS, knightDef, unlockedClasses, type ClassId } from '../core/knights';
import { luckBreakdown, lowestDroppable, revealBar } from '../core/luck';
import { canRebirth, rebirthFloor } from '../core/newGame';
import { PERKS, PERK_TREES, buyPerk, canBuyPerk, hasPerk, perksOpen } from '../core/perks';
import { RARITIES, RARITY_COLOR, RARITY_NAME, RARITY_ODDS, rarityChances, rarityIndex, type Rarity } from '../core/rarity';
import { drySpell, reelCount, spinCycle, tokenChance } from '../core/roller';
import {
  NEW_FOR_MS, bestSquad, canReforge, isNewKnight, knightStats, rankedKnights, rebirthStatMult, reforge, reforgeCost, reforgeOdds, setSquadSlot,
} from '../core/roster';
import { CHALLENGE, floorDifficulty, knightRating, squadPower } from '../core/power';
import { UPGRADES, buyUpgrade, canBuy, tier, upgradeCost } from '../core/upgrades';
import type { Game } from '../game';
import { biomeForFloor } from '../world/biomes';
import { Bar, Chunky, HeroLive, Section, rarityGrad, rarityStyle } from './common';
import { fmt, oneIn, oneInShort } from './format';
import { useRosterFx } from './fx/Pops';
import { Bump, KnightTile, SpareChip, SpareTag, knightFit, rarityOdds } from './KnightCard';
import { Px, type IconName } from './px';
import { AltarReels } from './fx/AltarReels';
import { uiSound } from './sound';
import { SkillTable } from './SkillRoll';
import { GoldReadout, HelpButton, LevelPanel, SparePanel, SpareRules } from './Spares';
import { skillRollLuck } from '../core/chance';

export { Section } from './common';

export type HomeTab = 'camp' | 'summon' | 'heroes' | 'upgrades' | 'perks' | 'rebirth';

const UPGRADE_ICON: Record<string, IconName> = {
  luck: 'clover', spinSpeed: 'clock', pity: 'shield', luckySpin: 'star', goldenSpin: 'reelGold', alchemy: 'potion', turbo: 'bolt', potionTime: 'potion', extraReel: 'reel',
  might: 'sword', vitality: 'heart', greed: 'coin', swiftness: 'boot', offline: 'book',
};

// ------------------------------------------------------------------ hero card

/**
 * One of your knights as a card, in icons and numbers: the leader's crown (the knight you play) top
 * left, its spare copies top right, NEW on the top edge for 30 seconds after it first joins; its
 * level; its power and its odds at the altar.
 */
export function HeroCard({ game, id, onOpen }: { game: Game; id: string; onOpen: (id: string) => void }) {
  const s = game.state;
  const r = s.roster[id];
  if (!r) return null;
  const def = knightDef(id);
  const slot = s.squad.indexOf(id);
  const lead = slot >= 0 && slot === s.controlled;
  const power = knightRating(s, id);
  return (
    <KnightTile
      id={id}
      mutation={r.mutation}
      rarity={def.rarity}
      name={def.name}
      meta={`Lv ${r.level} ${CLASSES[def.cls].name}`}
      left={
        <>
          <Px icon="might" size="sm" />
          {fmt(power)}
        </>
      }
      right={rarityOdds(def.rarity)}
      tl={lead ? <span className="ktag lead" title="Leader: the knight you play"><Px icon="crown" size="sm" /></span> : null}
      tr={r.dupes > 0 ? <SpareChip n={r.dupes} /> : null}
      top={isNewKnight(r, Date.now()) ? <span className="ktag new">NEW</span> : null}
      lead={lead}
      onClick={() => (uiSound('tap'), onOpen(id))}
      label={`${def.name}, ${RARITY_NAME[def.rarity]} ${CLASSES[def.cls].name}, level ${r.level}, power ${fmt(power)}${r.dupes ? `, ${r.dupes} spare ${r.dupes === 1 ? 'copy' : 'copies'}` : ''}${lead ? ', the leader' : slot >= 0 ? ', in your squad' : ''}`}
    />
  );
}

// ------------------------------------------------------------------ camp

export function CampPanel({ game, onOpen, onTab }: { game: Game; onOpen: (id: string) => void; onTab: (t: HomeTab) => void }) {
  const s = game.state;
  const floor = game.world?.floor ?? s.run.floor;
  const biome = biomeForFloor(floor, s.run.biomeSeed);
  const need = rebirthFloor(s.rebirths);
  const ready = s.squad.some(Boolean);
  const power = squadPower(s);
  const diff = floorDifficulty(floor, power);
  const ch = CHALLENGE[diff.challenge];
  return (
    <>
      <div className="hero-banner">
        <Chunky text={floor > 1 || s.run.bestFloor > 1 ? `FLOOR ${floor}` : 'THE DUNGEON AWAITS'} size={floor > 1 ? 12 : 9} grad="gold" />
        <span className="lead">{biome.name}{floor % 5 === 0 ? ' · a boss waits here' : ''}</span>
        {ready && (
          <div className="power-check glass outlined" title={ch.text}>
            <span>
              Power <b>{fmt(power)}</b>
            </span>
            <span className="t-muted">
              par <b>{fmt(diff.par)}</b>
            </span>
            <span className="dchip" style={{ ['--cc' as string]: ch.color, ['--seal' as string]: `var(--sk-seal-${diff.challenge})` }}>
              {ch.name.toUpperCase()}
            </span>
          </div>
        )}
        <button className="btn gold big breathe" disabled={!ready} onClick={() => (uiSound('open'), game.enterDungeon())}>
          <Px icon="swords" s={1.5} />
          <span>
            {game.world ? 'CONTINUE' : 'ADVENTURE'}
            <span className="sub">{ready ? 'Into the dungeon' : 'Summon your first knights'}</span>
          </span>
        </button>
      </div>
      <Section title="Your squad" sub={`Power ${fmt(power)}`} right={<button className="btn navy small" onClick={() => (bestSquad(s), game.syncSquad(), uiSound('tap'))}>Best squad</button>}>
        <div className="squad-row">
          {s.squad.map((id, slot) =>
            id ? (
              <HeroCard key={slot} game={game} id={id} onOpen={onOpen} />
            ) : (
              <button key={slot} className="kcard empty" onClick={() => onTab('summon')} style={rarityStyle('common')}>
                <div className="kc-art">
                  <Px icon="helm" s={1} style={{ opacity: 0.35, alignSelf: 'center' }} />
                </div>
                <div className="kc-info">
                  <div className="kc-name">Empty slot</div>
                  <div className="kc-meta">Summon a knight</div>
                </div>
              </button>
            ),
          )}
        </div>
      </Section>
      <Section title="Rebirth" sub={s.run.bestFloor >= need ? 'Ready!' : `Reach floor ${need}`}>
        <div className="glass" style={{ padding: 'calc(3 * var(--px))' }}>
          <div className="spread outlined" style={{ fontSize: 'calc(4.4 * var(--px))', marginBottom: 'calc(2 * var(--px))' }}>
            <span>
              Best floor this run <b className="t-gold">{s.run.bestFloor}</b>
            </span>
            <span className="t-muted">deepest ever {s.records.bestFloorEver}</span>
          </div>
          <Bar value={s.run.bestFloor / need} kind="gold" />
        </div>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ summon

export function SummonPanel({ game, onOpen }: { game: Game; onOpen: (id: string) => void }) {
  const s = game.state;
  const pity = Math.max(0, drySpell(s) - s.roll.dry);
  const lucky = Math.max(0, Math.max(4, 10 - (s.upgrades.luckySpin ?? 0)) - s.roll.sinceLucky);
  return (
    <>
      <Section title="Summoning Altar" sub="free, forever">
        <AltarReels game={game} variant="big" />
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="pill outlined">
            <Px icon="reel" size="sm" /> {reelCount(s)} reel{reelCount(s) > 1 ? 's' : ''}
          </span>
          <span className="pill outlined">
            <Px icon="clock" size="sm" /> {spinCycle(s).toFixed(1)}s a spin
          </span>
          <span className="pill outlined">
            <Px icon="star" size="sm" /> Lucky Spin in {lucky}
          </span>
          {s.hourglasses > 0 && (
            <span className="pill outlined">
              <Px icon="hourglass" /> {s.hourglasses} turbo
            </span>
          )}
        </div>
        {s.roll.tutorial === 'done' && (
          <div className="glass" style={{ padding: 'calc(2.5 * var(--px)) calc(3 * var(--px))' }}>
            <div className="spread outlined" style={{ fontSize: 'calc(4.4 * var(--px))', marginBottom: 'calc(1.5 * var(--px))' }}>
              <span>
                Epic or better guaranteed in <b style={{ color: RARITY_COLOR.epic }}>{pity}</b>
              </span>
              <span className="t-muted">{Math.round(tokenChance(s) * 100)}% token chance</span>
            </div>
            <Bar value={1 - pity / drySpell(s)} kind="purple" />
          </div>
        )}
      </Section>
      <Section title="Latest summons">
        {game.recent.length === 0 ? (
          <p className="lead">The reels are turning. Your first knights will appear here.</p>
        ) : (
          <div className="heroes-grid">
            {game.recent.slice(0, 12).map((r, i) => {
              const def = knightDef(r.knightId);
              // NEW only for half a minute after the pull; a repeat pull came in as a spare copy.
              const fresh = r.isNew && Date.now() - r.at < NEW_FOR_MS;
              return (
                <KnightTile
                  key={`${r.at}-${i}`}
                  id={r.knightId}
                  mutation={r.mutation}
                  rarity={def.rarity}
                  name={def.name}
                  meta={oneInShort(r.oneIn)}
                  top={fresh ? <span className="ktag new">NEW</span> : null}
                  tl={r.isNew ? null : <SpareTag />}
                  tr={r.mult > 1 ? <span className="ktag mult">×{r.mult}</span> : null}
                  onClick={() => onOpen(r.knightId)}
                  label={`${def.name}, ${oneIn(r.oneIn)}${r.isNew ? '' : ', a spare copy'}`}
                />
              );
            })}
          </div>
        )}
      </Section>
      <OddsTable game={game} />
    </>
  );
}

export function OddsTable({ game }: { game: Game }) {
  const luck = game.luck;
  const lb = luckBreakdown(game.state, Date.now());
  const ch = rarityChances(luck);
  const low = lowestDroppable(luck);
  return (
    <Section title="Odds" sub={`luck ×${luck.toFixed(2)}`}>
      <p className="lead">
        (1 + upgrades {lb.upgrades.toFixed(2)} + depth {lb.depth.toFixed(2)}) × rebirths {lb.rebirthMult.toFixed(2)}
        {lb.potionMult > 1 ? ` × potion ${lb.potionMult}` : ''}. Every tier hits at luck ÷ its odds, rarest first.
        {low !== 'common' ? ` Your luck is past ${RARITY_NAME[low]}'s odds, so nothing below ${RARITY_NAME[low]} drops.` : ''} A full-screen reveal needs
        {' '}{RARITY_NAME[revealBar(luck)]} or better, rarer than anything you found in the last 5 minutes.
      </p>
      <div className="glass" style={{ padding: 'calc(2 * var(--px)) calc(3 * var(--px))' }}>
        {[...RARITIES].reverse().map((r) => (
          <div key={r} className="spread outlined num" style={{ fontSize: 'calc(4.2 * var(--px))', padding: 'calc(0.5 * var(--px)) 0' }}>
            <span style={{ color: RARITY_COLOR[r], minWidth: 'calc(30 * var(--px))' }}>{RARITY_NAME[r]}</span>
            <span className="t-muted">{r === 'common' ? '—' : oneIn(RARITY_ODDS[r])}</span>
            <span style={{ minWidth: 'calc(30 * var(--px))', textAlign: 'right' }}>
              {ch[r] > 0 ? (ch[r] >= 0.001 ? `${(ch[r] * 100).toFixed(ch[r] > 0.1 ? 1 : 2)}%` : oneIn(1 / ch[r])) : <span className="t-muted">never</span>}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ heroes

type Sort = 'power' | 'rarity' | 'level' | 'dupes' | 'new';

export function HeroesPanel({ game, onOpen }: { game: Game; onOpen: (id: string) => void }) {
  const s = game.state;
  const [view, setView] = useState<'heroes' | 'codex'>('heroes');
  const [cls, setCls] = useState<ClassId | 'all'>('all');
  const [sort, setSort] = useState<Sort>('power');
  const ids = useMemo(() => {
    let list = rankedKnights(s);
    if (cls !== 'all') list = list.filter((id) => knightDef(id).cls === cls);
    const by: Record<Sort, (id: string) => number> = {
      power: (id) => -knightRating(s, id),
      rarity: (id) => -rarityIndex(knightDef(id).rarity) * 1000 - s.roster[id].level,
      level: (id) => -s.roster[id].level,
      dupes: (id) => -s.roster[id].dupes,
      new: (id) => -s.roster[id].firstAt,
    };
    return [...list].sort((a, b) => by[sort](a) - by[sort](b));
  }, [s, cls, sort, game.version]);
  const owned = new Set(Object.values(s.roster).map((r) => knightDef(r.id).cls));
  return (
    <>
      <div className="chips">
        <button className={`chip ${view === 'heroes' ? 'on' : ''}`} onClick={() => setView('heroes')}>
          Heroes ({Object.keys(s.roster).length})
        </button>
        <button className={`chip ${view === 'codex' ? 'on' : ''}`} onClick={() => setView('codex')}>
          Codex ({Object.keys(s.codex).length}/{KNIGHTS.length})
        </button>
      </div>
      {view === 'codex' ? (
        <Codex game={game} />
      ) : (
        <>
          <div className="spread">
            <div className="chips">
              <button className={`chip ${cls === 'all' ? 'on' : ''}`} onClick={() => setCls('all')}>
                All
              </button>
              {CLASS_IDS.filter((c) => owned.has(c)).map((c) => (
                <button key={c} className={`chip ${cls === c ? 'on' : ''}`} onClick={() => setCls(c)}>
                  {CLASSES[c].name}
                </button>
              ))}
            </div>
            <span className="row knowrap">
              <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort knights by">
                <option value="power">Power</option>
                <option value="rarity">Rarity</option>
                <option value="level">Level</option>
                <option value="dupes">Spare copies</option>
                <option value="new">Newest</option>
              </select>
              <HelpButton />
            </span>
          </div>
          {ids.length === 0 ? (
            <p className="lead">No knights yet. The Summoning Altar rolls them for free.</p>
          ) : (
            <div className="heroes-grid">
              {ids.map((id) => (
                <HeroCard key={id} game={game} id={id} onOpen={onOpen} />
              ))}
            </div>
          )}
          <SpareRules game={game} />
        </>
      )}
    </>
  );
}

function Codex({ game }: { game: Game }) {
  const s = game.state;
  return (
    <>
      <p className="lead">
        Best find {s.records.bestOneIn ? oneIn(s.records.bestOneIn) : '—'} · deepest floor {s.records.bestFloorEver} · {s.records.kills} foes beaten · {s.records.spins} knights summoned
      </p>
      {RARITIES.map((r: Rarity) => (
        <Section key={r} title={RARITY_NAME[r]} sub={r === 'common' ? undefined : oneIn(RARITY_ODDS[r])}>
          <div className="heroes-grid">
            {KNIGHTS.filter((k) => k.rarity === r).map((k) => {
              const c = s.codex[k.id];
              return (
                <KnightTile
                  key={k.id}
                  id={k.id}
                  mutation={c?.best ?? null}
                  rarity={c ? r : 'common'}
                  silhouette={c ? undefined : '#0e0a18'}
                  name={c ? k.name : '???'}
                  meta={c ? `×${c.count}` : CLASSES[k.cls].name}
                  dim={!c}
                />
              );
            })}
          </div>
        </Section>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ hero detail

export function HeroDetail({ game, id, onClose }: { game: Game; id: string; onClose: () => void }) {
  const s = game.state;
  const [, bump] = useState(0);
  const [forge, setForge] = useState<string | null>(null);
  const fx = useRosterFx(s.settings.reduceMotion);
  const shardRef = useRef<HTMLDivElement>(null);
  const goldRef = useRef<HTMLSpanElement>(null);
  const rec = s.roster[id];
  const def = knightDef(id);
  if (!rec) {
    // Not owned (a summon log entry already sold, or a codex peek).
    return null;
  }
  const cls = CLASSES[def.cls];
  const st = knightStats(s, id);
  const slot = s.squad.indexOf(id);
  const power = knightRating(s, id);
  const refresh = () => {
    game.syncSquad();
    game.touch();
    bump((x) => x + 1);
  };
  const panel = { game, id, fx, shardRef, goldRef, onChange: refresh };
  const lead = slot >= 0 && slot === s.controlled;
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet hero-sheet" style={rarityStyle(def.rarity)}>
        <button className="btn red square x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="stage-art">
          <HeroLive id={id} mutation={rec.mutation} style={knightFit(80, 56)} />
          <GoldReadout gold={s.gold} goldRef={goldRef} className="stage-gold" />
          {isNewKnight(rec, Date.now()) && <span className="ktag new stage-new">NEW</span>}
        </div>
        <div className="hero-banner">
          <Chunky text={def.name} size={def.name.length > 16 ? 7 : 9} grad={rarityGrad(def.rarity)} />
          <span className="outlined krank" style={{ color: RARITY_COLOR[def.rarity] }}>
            {lead && <Px icon="crown" size="sm" />}
            {RARITY_NAME[def.rarity]} {cls.name}
            {rec.mutation && <span className="t-gold"> · {rec.mutation.toUpperCase()}</span>}
          </span>
          <div className="kstats outlined num">
            <span title="Power">
              <small>POWER</small>
              <i>
                <Px icon="might" size="sm" />
                <Bump value={power} className="t-gold">
                  {fmt(power)}
                </Bump>
              </i>
            </span>
            <span title="HP">
              <small>HP</small>
              <i>
                <Px icon="heart" size="sm" />
                <Bump value={Math.round(st.hp)}>{fmt(st.hp)}</Bump>
              </i>
            </span>
            <span title="Attack">
              <small>ATTACK</small>
              <i>
                <Px icon="sword" size="sm" />
                <Bump value={Math.round(st.atk)}>{fmt(st.atk)}</Bump>
              </i>
            </span>
            <span title={RARITY_ODDS[def.rarity] <= 1 ? "Odds at the altar: the everyday find" : `Odds at the altar: ${oneIn(RARITY_ODDS[def.rarity])}`}>
              <small>ODDS</small>
              <i>
                <Px icon="dice" size="sm" />
                <b style={{ color: RARITY_COLOR[def.rarity] }}>{rarityOdds(def.rarity)}</b>
              </i>
            </span>
          </div>
        </div>
        <LevelPanel {...panel} />
        <SparePanel {...panel} />
        <div className="row ksquad">
          <span className="outlined">Squad slot</span>
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              className={`btn small ${slot === i ? 'gold' : 'navy'}`}
              aria-label={`${slot === i ? 'In' : 'Put in'} squad slot ${i + 1}${i === s.controlled ? ', the leader: you play it' : ''}`}
              title={i === s.controlled ? 'Leader: the knight you play' : undefined}
              onClick={() => (setSquadSlot(s, i, id), uiSound('tap'), refresh())}
            >
              {i === s.controlled && <Px icon="crown" size="sm" />}
              {i + 1}
            </button>
          ))}
          <button
            className="btn purple small kforge"
            disabled={!canReforge(s, id)}
            title={reforgeOdds()
              .map(([m, p]) => `${m}: ${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`)
              .join(' · ')}
            onClick={() => {
              const r = reforge(s, id, () => game.rng.next());
              if (!r) return;
              if (r.improved) {
                uiSound('mutation', 6);
                setForge(`${r.rolled!.toUpperCase()}!`);
              } else {
                uiSound('dupe');
                setForge(r.rolled ? `Rolled ${r.rolled.toUpperCase()}: no better, kept yours` : 'Rolled nothing this time');
              }
              refresh();
            }}
          >
            <Px icon="star" size="sm" />
            Reforge
            {rec.mutation !== 'void' && (
              <span className="kcost num">
                <Px icon="coin" size="xs" />
                {fmt(reforgeCost(s, id))}
              </span>
            )}
          </button>
        </div>
        {forge && <span className={`outlined kforge-msg ${forge.endsWith('!') ? 't-gold' : 't-muted'}`}>{forge}</span>}
        <SkillTable knightId={id} luck={game.luck * skillRollLuck(s)} cd={st.specialCd} highlight={game.world?.heroes.find((h) => h.knightId === id)?.lastSkill?.skill} />
      </div>
      {fx.layer}
    </div>
  );
}

// ------------------------------------------------------------------ upgrades

export function UpgradesPanel({ game }: { game: Game }) {
  const s = game.state;
  const [, bump] = useState(0);
  return (
    <>
      {(['altar', 'squad'] as const).map((g) => (
        <Section key={g} title={g === 'altar' ? 'The altar' : 'The squad'} sub={g === 'altar' ? 'luck, speed, reels' : 'damage, health, gold'}>
          {UPGRADES.filter((u) => u.group === g).map((u) => {
            const t = tier(s, u.id);
            const max = t >= u.max;
            return (
              <div key={u.id} className="glass upg">
                <Px icon={UPGRADE_ICON[u.id] ?? 'star'} size="md" />
                <div>
                  <div className="name outlined">
                    {u.name} <span className="t-muted">{max ? 'MAX' : `${t}/${u.max}`}</span>
                  </div>
                  <div>{u.text(t + 1)}</div>
                  <div className="pips">
                    {Array.from({ length: u.max }, (_, i) => (
                      <i key={i} className={i < t ? 'on' : ''} />
                    ))}
                  </div>
                </div>
                <button
                  className="btn gold small"
                  disabled={max || !canBuy(s, u.id)}
                  onClick={() => {
                    if (buyUpgrade(s, u.id)) uiSound('buy');
                    game.syncSquad();
                    bump((x) => x + 1);
                  }}
                >
                  {max ? (
                    'Done'
                  ) : (
                    <>
                      <Px icon="coin" size="xs" />
                      {fmt(upgradeCost(s, u.id))}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </Section>
      ))}
      <p className="lead">Upgrades last until your next rebirth.</p>
    </>
  );
}

// ------------------------------------------------------------------ perks

export function PerksPanel({ game }: { game: Game }) {
  const s = game.state;
  const [, bump] = useState(0);
  if (!perksOpen(s)) {
    return (
      <div className="hero-banner">
        <Px icon="lock" size="lg" s={2} />
        <Chunky text="PERKS" size={10} grad="purple" />
        <p className="lead">Perks open after your first rebirth. They change how a run plays: a Lone Wolf, a Glass Cannon, Common knights that level three times as fast.</p>
      </div>
    );
  }
  return (
    <>
      <div className="hero-banner">
        <Chunky text={`${s.sigils} SIGIL${s.sigils === 1 ? '' : 'S'}`} size={9} grad="purple" />
        <p className="lead">One per rebirth, and one for every boss you beat for the first time this run. A rebirth clears every perk, so each run builds its own.</p>
      </div>
      <div className="trees">
        {PERK_TREES.map((t) => (
          <div key={t.id} className="stack">
            <div className="section-title outlined" style={{ color: t.color }}>
              {t.name}
            </div>
            <p className="lead">{t.text}</p>
            {PERKS.filter((p) => p.tree === t.id).map((p) => {
              const owned = hasPerk(s, p.id);
              const can = canBuyPerk(s, p.id);
              return (
                <button
                  key={p.id}
                  className={`card perk ${owned ? 'owned' : ''} ${!owned && !can ? 'locked' : ''}`}
                  onClick={() => {
                    if (can && buyPerk(s, p.id)) {
                      uiSound('buy');
                      game.syncSquad();
                      bump((x) => x + 1);
                    }
                  }}
                  style={{ textAlign: 'left' }}
                >
                  <div className="spread">
                    <b>{p.name}</b>
                    <span className="t-gold">{owned ? 'Owned' : `${p.cost} sigil${p.cost > 1 ? 's' : ''}`}</span>
                  </div>
                  <div>{p.text}</div>
                  {p.requires.length > 0 && !owned && <div className="t-muted">Needs {p.requires.map((r) => PERKS.find((x) => x.id === r)!.name).join(' or ')}</div>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ rebirth

export function RebirthPanel({ game }: { game: Game }) {
  const s = game.state;
  const need = rebirthFloor(s.rebirths);
  const ok = canRebirth(s);
  const next = s.rebirths + 1;
  const newClasses = unlockedClasses(next).filter((c) => !unlockedClasses(s.rebirths).includes(c));
  return (
    <>
      <div className="hero-banner">
        <Px icon="rebirth" size="lg" s={2} />
        <Chunky text={`REBIRTH ${next}`} size={11} grad="gold" />
        <p className="lead">Start over at floor 1, stronger for good.</p>
      </div>
      <div className="glass" style={{ padding: 'calc(3 * var(--px))' }}>
        <div className="spread outlined" style={{ fontSize: 'calc(4.4 * var(--px))', marginBottom: 'calc(1.5 * var(--px))' }}>
          <span>
            Reach floor <b className="t-gold">{need}</b>
          </span>
          <span className="t-muted">best this run {s.run.bestFloor}</span>
        </div>
        <Bar value={s.run.bestFloor / need} kind="gold" />
      </div>
      <div className="card" style={{ padding: 'calc(4 * var(--px))', fontSize: 'calc(4.5 * var(--px))', lineHeight: 1.4 }}>
        <b>You keep, for good</b>
        <div>
          Luck ×{(1 + next * BAL.rebirth.luckPer).toFixed(2)} <span className="t-muted">(now ×{(1 + s.rebirths * BAL.rebirth.luckPer).toFixed(2)})</span>
        </div>
        <div>Gold ×{(1 + next * BAL.rebirth.goldMultPer).toFixed(1)}</div>
        <div>Knight stats ×{rebirthStatMult(next).toFixed(1)}</div>
        <div>Your Codex and records</div>
        {next === BAL.perks.unlockRebirths && <div className="t-gold">Perks open</div>}
        {newClasses.length > 0 && <div className="t-gold">New class: {newClasses.map((c) => CLASSES[c].name).join(', ')}</div>}
        <div style={{ height: 'calc(2 * var(--px))' }} />
        <b>You lose</b>
        <div className="t-muted">Your knights (levels, shards and duplicates), gold, upgrades, perks and sigils.</div>
        {hasPerk(s, 'heirloom') && s.squad[s.controlled] && <div className="t-gold">Heirloom: {knightDef(s.squad[s.controlled]!).name} comes with you.</div>}
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn gold big" disabled={!ok} onClick={() => game.rebirth()}>
          <Px icon="rebirth" s={1} />
          {ok ? 'REBIRTH' : `FLOOR ${need}`}
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ settings and luck sheets

export function SettingsSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const s = game.state;
  const [, bump] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const set = (fn: () => void) => {
    fn();
    game.touch();
    bump((x) => x + 1);
  };
  const toggle = (label: string, sub: string, value: boolean, on: (v: boolean) => void) => (
    <label className="glass setting outlined">
      <span>
        {label}
        <small>{sub}</small>
      </span>
      <input type="checkbox" checked={value} onChange={(e) => set(() => on(e.target.checked))} />
    </label>
  );
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <button className="btn red square x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="hero-banner">
          <Px icon="gear" size="lg" s={1} />
          <Chunky text="SETTINGS" size={10} grad="cream" />
        </div>
        <label className="glass setting outlined">
          <span>
            Sound
            <small>Hits, rolls, reveals</small>
          </span>
          <input type="range" min={0} max={1} step={0.05} value={s.settings.sfx} onChange={(e) => set(() => (s.settings.sfx = Number(e.target.value)))} />
        </label>
        <label className="glass setting outlined">
          <span>
            Music
            <small>Camp, dungeon and boss themes</small>
          </span>
          <input type="range" min={0} max={1} step={0.05} value={s.settings.music} onChange={(e) => set(() => (s.settings.music = Number(e.target.value)))} />
        </label>
        {toggle('Auto', 'Your knight plays itself', s.settings.autoPlay, (v) => game.setAuto(v))}
        {toggle('Tilt-shift', 'The distance goes soft, like a miniature', s.settings.tiltShift, (v) => (s.settings.tiltShift = v))}
        {toggle('Reduce motion', 'No screen shake, calmer reveals', s.settings.reduceMotion, (v) => (s.settings.reduceMotion = v))}
        <div className="section-title outlined">Controls</div>
        <p className="lead">
          Move: WASD or arrows (touch: drag on the left). Attack: click or J, aim with the mouse (touch: hold Attack; it aims for you). Dodge roll: Space (touch: Dodge). Your skill rolls and fires by itself in a fight (E rolls it any time it is ready). Take control of a knight: 1, 2, 3 or tap them. Auto: T. Camp: Esc.
        </p>
        <div className="section-title outlined">Your save</div>
        <p className="lead">
          Saved in this browser every few seconds. {Math.round(s.playTimeMs / 60000)} minutes played, {fmt(s.records.kills)} foes beaten, {fmt(s.records.spins)} knights summoned.
        </p>
        {!confirm ? (
          <button className="btn red small" onClick={() => setConfirm(true)}>
            Start a new game
          </button>
        ) : (
          <div className="row">
            <span className="outlined">Erase everything?</span>
            <button className="btn red small" onClick={() => (game.reset(), setConfirm(false), onClose())}>
              Erase
            </button>
            <button className="btn navy small" onClick={() => setConfirm(false)}>
              Keep playing
            </button>
          </div>
        )}
        <div className="section-title outlined">Credits</div>
        <p className="lead">
          Characters built on Snoblin's Pixel RPG Prototype Characters. Effects: Pixel Art Assets - Will Tice / unTied Games. {MUSIC_CREDIT} Icons and pixel tools from Dumpster Legend. Pixelify Sans (SIL OFL). v{__APP_VERSION__}
        </p>
      </div>
    </div>
  );
}

export function LuckSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <button className="btn red square x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="hero-banner">
          <Px icon="clover" size="lg" s={1} />
          <Chunky text={`LUCK ×${game.luck.toFixed(2)}`} size={10} grad="green" />
        </div>
        <OddsTable game={game} />
      </div>
    </div>
  );
}
