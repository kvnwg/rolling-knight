/**
 * The home screen's panels: Camp (your squad and the way into the dungeon), Summon (the altar),
 * Heroes (your collection: pick the squad, level heroes, break down or sell duplicates; and the Codex),
 * Upgrades, Perks, Rebirth; plus the hero detail, luck and settings sheets.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { BAL } from '../core/balance';
import { CLASSES, CLASS_IDS, KNIGHTS, knightDef, specialOf, unlockedClasses, type ClassId } from '../core/knights';
import { luckBreakdown, lowestDroppable, oneInFor, revealBar } from '../core/luck';
import { canRebirth, rebirthFloor } from '../core/newGame';
import { PERKS, PERK_TREES, buyPerk, canBuyPerk, hasPerk, perksOpen } from '../core/perks';
import { RARITIES, RARITY_COLOR, RARITY_NAME, RARITY_ODDS, rarityChances, rarityIndex, type Rarity } from '../core/rarity';
import { drySpell, reelCount, spinCycle, tokenChance } from '../core/roller';
import {
  bestSquad, canLevel, canReforge, knightStats, levelCost, levelUp, rankedKnights, rebirthStatMult, reforge, reforgeCost, reforgeOdds, sellAll, sellDupes, sellValue,
  setSquadSlot, shardAll, shardDupes, shardsPerDupe, totalDupes,
} from '../core/roster';
import { CHALLENGE, floorDifficulty, knightRating, squadPower } from '../core/power';
import type { DupeRule } from '../core/state';
import { UPGRADES, buyUpgrade, canBuy, tier, upgradeCost } from '../core/upgrades';
import type { Game } from '../game';
import { biomeForFloor } from '../world/biomes';
import { Bar, Chunky, HeroArt, HeroLive, rarityGrad, rarityStyle } from './common';
import { fmt, oneIn } from './format';
import { Px, type IconName } from './px';
import { AltarReels } from './fx/AltarReels';
import { uiSound } from './sound';

export type HomeTab = 'camp' | 'summon' | 'heroes' | 'upgrades' | 'perks' | 'rebirth';

const UPGRADE_ICON: Record<string, IconName> = {
  luck: 'clover', spinSpeed: 'clock', pity: 'shield', luckySpin: 'star', goldenSpin: 'reelGold', alchemy: 'potion', turbo: 'bolt', potionTime: 'potion', extraReel: 'reel',
  might: 'sword', vitality: 'heart', greed: 'coin', swiftness: 'boot', offline: 'book',
};

export function Section({ title, sub, children, right }: { title: string; sub?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="stack">
      <div className="spread">
        <div className="section-title outlined">
          {title}
          {sub && <small>{sub}</small>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ hero card

export function HeroCard({ game, id, onOpen, slot }: { game: Game; id: string; onOpen: (id: string) => void; slot?: number }) {
  const s = game.state;
  const r = s.roster[id];
  const def = knightDef(id);
  if (!r) return null;
  return (
    <button className="card hero-card" style={rarityStyle(def.rarity)} onClick={() => (uiSound('tap'), onOpen(id))}>
      {r.isNew && <span className="badge green tl">NEW</span>}
      {r.dupes > 0 && <span className="badge tr">+{r.dupes}</span>}
      {slot !== undefined && slot >= 0 && <span className="badge navy bl">{slot + 1}</span>}
      <div className="art">
        <HeroArt id={id} mutation={r.mutation} s={1} />
      </div>
      <div className="rar-strip" />
      <div className="name">{def.name}</div>
      <div className="meta">
        {CLASSES[def.cls].name} · Lv {r.level}
      </div>
    </button>
  );
}

// ------------------------------------------------------------------ camp

export function CampPanel({ game, onOpen, onTab }: { game: Game; onOpen: (id: string) => void; onTab: (t: HomeTab) => void }) {
  const s = game.state;
  const floor = game.world?.floor ?? s.run.floor;
  const biome = biomeForFloor(floor, s.run.biomeSeed);
  const dupes = totalDupes(s);
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
              <HeroCard key={slot} game={game} id={id} onOpen={onOpen} slot={slot === s.controlled ? 0 : undefined} />
            ) : (
              <button key={slot} className="card hero-card" onClick={() => onTab('summon')} style={rarityStyle('common')}>
                <div className="art" style={{ placeItems: 'center' }}>
                  <Px icon="helm" s={1} style={{ opacity: 0.35 }} />
                </div>
                <div className="name">Empty slot</div>
                <div className="meta">Summon a knight</div>
              </button>
            ),
          )}
        </div>
        <p className="lead">The first slot's knight is the one you control. Tap a knight to level it up or swap it.</p>
      </Section>
      {dupes > 0 && <DupeBar game={game} />}
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

export function DupeBar({ game }: { game: Game }) {
  const s = game.state;
  const n = totalDupes(s);
  const ids = Object.keys(s.roster).filter((id) => s.roster[id].dupes > 0);
  const shards = ids.reduce((a, id) => a + s.roster[id].dupes * shardsPerDupe(s, knightDef(id).rarity), 0);
  const gold = ids.reduce((a, id) => a + s.roster[id].dupes * sellValue(s, id), 0);
  const [, bump] = useState(0);
  if (n === 0) return null;
  return (
    <div className="card dupe-bar">
      <span>
        <b>{n} duplicate{n > 1 ? 's' : ''}</b> <span className="t-muted">waiting</span>
      </span>
      <span className="row">
        <button className="btn blue small" onClick={() => (shardAll(s), uiSound('breakDown'), bump((x) => x + 1), game.touch())}>
          <Px icon="shard" />
          Break down <span className="sub">+{shards} shards</span>
        </button>
        <button className="btn gold small" onClick={() => (sellAll(s), uiSound('sell'), bump((x) => x + 1), game.touch())}>
          <Px icon="coin" size="xs" />
          Sell <span className="sub">+{fmt(gold)}</span>
        </button>
      </span>
    </div>
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
        <div className="plate" style={{ padding: 'calc(1 * var(--px))' }}>
          <AltarReels game={game} variant="big" />
        </div>
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
            {game.recent.slice(0, 12).map((r, i) => (
              <button key={`${r.at}-${i}`} className="card hero-card" style={rarityStyle(knightDef(r.knightId).rarity)} onClick={() => onOpen(r.knightId)}>
                {r.isNew ? <span className="badge green tl">NEW</span> : <span className="badge navy tl">DUPE</span>}
                {r.mult > 1 && <span className="badge gold tr">×{r.mult}</span>}
                <div className="art">
                  <HeroArt id={r.knightId} mutation={r.mutation} />
                </div>
                <div className="rar-strip" />
                <div className="name">{knightDef(r.knightId).name}</div>
                <div className="meta">{oneIn(r.oneIn)}</div>
              </button>
            ))}
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
  const [, bump] = useState(0);
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
          <DupeBar game={game} />
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
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="power">Power</option>
              <option value="rarity">Rarity</option>
              <option value="level">Level</option>
              <option value="dupes">Duplicates</option>
              <option value="new">Newest</option>
            </select>
          </div>
          {ids.length === 0 ? (
            <p className="lead">No knights yet. The Summoning Altar rolls them for free.</p>
          ) : (
            <div className="heroes-grid">
              {ids.map((id) => (
                <HeroCard key={id} game={game} id={id} onOpen={(x) => (s.roster[x] && (s.roster[x].isNew = false), onOpen(x))} slot={s.squad.indexOf(id)} />
              ))}
            </div>
          )}
          <Section title="Duplicates as they land" sub="by rarity">
            <p className="lead">Keep lets them pile up for you to decide. Break down turns each into shards for its hero; Sell turns it into gold.</p>
            <div className="glass" style={{ padding: 'calc(2 * var(--px)) calc(3 * var(--px))', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(calc(58 * var(--px)), 1fr))', gap: 'calc(1.5 * var(--px)) calc(4 * var(--px))' }}>
              {RARITIES.map((r) => (
                <label key={r} className="spread outlined" style={{ fontSize: 'calc(4.2 * var(--px))' }}>
                  <span style={{ color: RARITY_COLOR[r] }}>{RARITY_NAME[r]}</span>
                  <select className="select" value={s.dupeRules[r]} onChange={(e) => ((s.dupeRules[r] = e.target.value as DupeRule), bump((x) => x + 1))}>
                    <option value="keep">Keep</option>
                    <option value="shard">Break down</option>
                    <option value="sell">Sell</option>
                  </select>
                </label>
              ))}
            </div>
          </Section>
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
                <div key={k.id} className="card hero-card" style={rarityStyle(c ? r : 'common')}>
                  <div className="art">
                    <HeroArt id={k.id} mutation={c?.best ?? null} silhouette={c ? undefined : '#0e0a18'} />
                  </div>
                  <div className="rar-strip" />
                  <div className="name">{c ? k.name : '???'}</div>
                  <div className="meta">{c ? `found ×${c.count}` : CLASSES[k.cls].name}</div>
                </div>
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
  const rec = s.roster[id];
  const def = knightDef(id);
  if (!rec) {
    // Not owned (a summon log entry already sold, or a codex peek).
    return null;
  }
  const cls = CLASSES[def.cls];
  const st = knightStats(s, id);
  const cost = levelCost(rec.level);
  const sp = specialOf(id);
  const slot = s.squad.indexOf(id);
  const refresh = () => {
    game.syncSquad();
    game.touch();
    bump((x) => x + 1);
  };
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={rarityStyle(def.rarity)}>
        <button className="btn red square x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="stage-art">
          <HeroLive id={id} mutation={rec.mutation} s={3} />
        </div>
        <div className="hero-banner">
          <Chunky text={def.name} size={def.name.length > 16 ? 7 : 9} grad={rarityGrad(def.rarity)} />
          <span className="outlined" style={{ color: RARITY_COLOR[def.rarity], fontWeight: 700 }}>
            {RARITY_NAME[def.rarity]} {cls.name}
            <span className="t-muted"> · {cls.roleName}</span>
            {rec.mutation && <span className="t-gold"> · {rec.mutation.toUpperCase()}</span>}
          </span>
          <span className="t-muted outlined">{oneIn(oneInFor(def.rarity, rec.mutation))}</span>
        </div>
        <div className="stats-grid outlined">
          <div className="stat-line">
            Power <b>{fmt(knightRating(s, id))}</b>
          </div>
          <div className="stat-line">
            Level <b>{rec.level}</b>
          </div>
          <div className="stat-line">
            HP <b>{fmt(st.hp)}</b>
          </div>
          <div className="stat-line">
            Attack <b>{fmt(st.atk)}</b>
          </div>
          <div className="stat-line">
            Armor <b>{Math.round(st.armor * 100)}%</b>
          </div>
          <div className="stat-line">
            Reach <b>{st.range >= 60 ? 'Ranged' : 'Melee'}</b>
          </div>
        </div>
        <div className="skill">
          <b>{cls.auto.name}</b> <span className="kind">auto attack</span>
          <br />
          {cls.auto.text}
        </div>
        <div className="skill">
          <b>{cls.dodge.name}</b> <span className="kind">dodge</span>
          <br />
          {cls.dodge.text}
        </div>
        <div className="skill">
          <b>{sp.name}</b> <span className="kind">{sp.signature ? 'signature special' : 'special'} · {sp.cd}s</span>
          <br />
          {sp.text}
        </div>
        <div className="stack">
          <div className="spread outlined" style={{ fontSize: 'calc(4.4 * var(--px))' }}>
            <span>
              <Px icon="shard" /> {rec.shards}/{cost.shards} shards to level {rec.level + 1}
            </span>
            <span className="t-muted">{rec.dupes} duplicate{rec.dupes === 1 ? '' : 's'}</span>
          </div>
          <Bar value={rec.shards / cost.shards} kind="sp" />
          <div className="row">
            <button className="btn green small" disabled={!canLevel(s, id)} onClick={() => (levelUp(s, id), uiSound('levelUp'), refresh())}>
              <Px icon="arrowUp" size="sm" /> Level up <span className="sub">{fmt(cost.gold)} gold</span>
            </button>
            <button className="btn blue small" disabled={rec.dupes < 1} onClick={() => (shardDupes(s, id), uiSound('breakDown'), refresh())}>
              <Px icon="shard" /> Break down <span className="sub">+{rec.dupes * shardsPerDupe(s, def.rarity)} shards</span>
            </button>
            <button className="btn gold small" disabled={rec.dupes < 1} onClick={() => (sellDupes(s, id), uiSound('sell'), refresh())}>
              <Px icon="coin" size="xs" /> Sell <span className="sub">+{fmt(sellValue(s, id) * rec.dupes)}</span>
            </button>
          </div>
          <div className="row">
            <button
              className="btn purple small"
              disabled={!canReforge(s, id)}
              title={reforgeOdds()
                .map(([m, p]) => `${m}: ${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`)
                .join(' · ')}
              onClick={() => {
                const r = reforge(s, id, () => game.rng.next());
                if (!r) return;
                if (r.improved) {
                  uiSound('mutation', 6);
                  setForge(`REFORGED: ${r.rolled!.toUpperCase()}!`);
                } else {
                  uiSound('dupe');
                  setForge(r.rolled ? `${r.rolled.toUpperCase()}... no better than before` : 'The sparks fade. Nothing this time.');
                }
                refresh();
              }}
            >
              <Px icon="sparkle" size="sm" /> Reforge <span className="sub">{rec.mutation === 'void' ? 'already Void' : `${fmt(reforgeCost(s, id))} gold`}</span>
            </button>
            {forge && <span className={`outlined ${forge.startsWith('REFORGED') ? 't-gold' : 't-muted'}`}>{forge}</span>}
          </div>
        </div>
        <div className="stack">
          <div className="section-title outlined">Squad</div>
          <div className="row">
            {[0, 1, 2].map((i) => (
              <button key={i} className={`btn small ${slot === i ? 'gold' : 'navy'}`} onClick={() => (setSquadSlot(s, i, id), uiSound('tap'), refresh())}>
                {slot === i ? `In slot ${i + 1}` : `Slot ${i + 1}`}
                <span className="sub">{i === 0 ? 'you control' : 'ally'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
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
          Move: WASD or arrows (touch: drag on the left). Dodge roll: Space. Special: E. Take control of a knight: 1, 2, 3 or tap them. Auto: T. Camp: Esc.
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
          Characters built on Snoblin's Pixel RPG Prototype Characters. Effects: Pixel Art Assets - Will Tice / unTied Games. Icons and pixel tools from Dumpster Legend. Pixelify Sans (SIL OFL). v{__APP_VERSION__}
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
