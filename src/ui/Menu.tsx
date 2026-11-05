/**
 * The menus, on a hanging wooden board: the Summoning Altar (the reels, luck and odds), Knights (the
 * squad, the roster, duplicates, shards and levels), Upgrades, Perks (from the first rebirth),
 * Rebirth, the Codex and Settings. While a menu is open, the knight you control fights on Auto.
 */
import { useState } from 'react';
import { BAL } from '../core/balance';
import { CLASSES, KNIGHTS, knightDef, specialOf, unlockedClasses } from '../core/knights';
import { luckBreakdown, lowestDroppable, oneInFor, revealBar } from '../core/luck';
import { canRebirth, rebirthFloor } from '../core/newGame';
import { PERKS, PERK_TREES, buyPerk, canBuyPerk, hasPerk, perksOpen } from '../core/perks';
import { RARITIES, RARITY_COLOR, RARITY_NAME, RARITY_ODDS, rarityChances, type Rarity } from '../core/rarity';
import { drySpell, reelCount, spinCycle, tokenChance } from '../core/roller';
import {
  bestSquad, canLevel, knightPower, knightStats, levelCost, levelUp, rankedKnights, rebirthStatMult, sellAll, sellDupes, sellValue, setSquadSlot, shardAll, shardDupes,
  shardsPerDupe, squadPower, totalDupes,
} from '../core/roster';
import type { DupeRule } from '../core/state';
import { UPGRADES, buyUpgrade, canBuy, tier, upgradeCost } from '../core/upgrades';
import type { Game } from '../game';
import { fmt, oneIn } from './format';
import { Icon } from './icons';
import { ReelsCanvas } from './Reels';
import { KnightLive, KnightSprite } from './sprites';

export type Tab = 'altar' | 'knights' | 'upgrades' | 'perks' | 'rebirth' | 'codex' | 'settings';

const TABS: Array<[Tab, string, string]> = [
  ['altar', 'Altar', 'reel'],
  ['knights', 'Knights', 'helm'],
  ['upgrades', 'Upgrades', 'anvil'],
  ['perks', 'Perks', 'sigil'],
  ['rebirth', 'Rebirth', 'flame'],
  ['codex', 'Codex', 'book'],
  ['settings', 'Settings', 'star'],
];

export function Menu({ game, tab, setTab }: { game: Game; tab: Tab; setTab: (t: Tab | null) => void }) {
  return (
    <div className="sheet" onPointerDown={(e) => e.target === e.currentTarget && setTab(null)}>
      <div className="board">
        <div className="chains" />
        <button className="wbtn red small close" onClick={() => setTab(null)}>
          ✕
        </button>
        <div className="inner">
          <div className="tabs">
            {TABS.map(([id, name, icon]) => (
              <button key={id} className={`wbtn ${tab === id ? 'active gold' : ''}`} onClick={() => setTab(id)} disabled={id === 'perks' && !perksOpen(game.state)}>
                <Icon name={icon} size={1.5} />
                {name}
              </button>
            ))}
          </div>
          <div className="panel outlined">
            {tab === 'altar' && <Altar game={game} />}
            {tab === 'knights' && <Knights game={game} />}
            {tab === 'upgrades' && <Upgrades game={game} />}
            {tab === 'perks' && <Perks game={game} />}
            {tab === 'rebirth' && <Rebirth game={game} />}
            {tab === 'codex' && <Codex game={game} />}
            {tab === 'settings' && <Settings game={game} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ altar

function Altar({ game }: { game: Game }) {
  const s = game.state;
  const luck = game.luck;
  const lb = luckBreakdown(s, Date.now());
  const chances = rarityChances(luck);
  const cell = Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) * 30) || 90;
  const low = lowestDroppable(luck);
  return (
    <>
      <h2>Summoning Altar</h2>
      <div className="row" style={{ justifyContent: 'center' }}>
        <ReelsCanvas game={game} cell={cell} />
      </div>
      <p style={{ textAlign: 'center' }}>
        {reelCount(s)} reel{reelCount(s) > 1 ? 's' : ''} · a spin every {spinCycle(s).toFixed(2)}s · Lucky Spin every {Math.max(4, 10 - (s.upgrades.luckySpin ?? 0))}
        {s.hourglasses > 0 && ` · ${s.hourglasses} hourglass spins waiting`}
      </p>
      {s.roll.tutorial === 'done' && <p style={{ textAlign: 'center', color: '#d8a8ff' }}>Epic+ guaranteed in {Math.max(0, drySpell(s) - s.roll.dry)}</p>}
      <h3>Luck ×{luck.toFixed(2)}</h3>
      <p className="muted">
        (1 + upgrades {lb.upgrades.toFixed(2)} + depth {lb.depth.toFixed(2)}) × rebirths {lb.rebirthMult.toFixed(2)}
        {lb.potionMult > 1 && ` × potion ${lb.potionMult}`}. Each tier hits at luck ÷ its odds, rarest first. Tokens land {Math.round(tokenChance(s) * 100)}% of the time per reel.
      </p>
      {low !== 'common' && <p style={{ color: '#ffd25a' }}>Your luck is past {RARITY_NAME[low]}'s odds: nothing below {RARITY_NAME[low]} drops any more.</p>}
      <p className="muted">
        A full-screen reveal needs at least {RARITY_NAME[revealBar(luck)]} and something rarer than anything you found in the last 5 minutes.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'calc(4.2 * var(--u))' }}>
        <tbody>
          {[...RARITIES].reverse().map((r) => (
            <tr key={r}>
              <td className="rar" style={{ color: RARITY_COLOR[r] }}>
                {RARITY_NAME[r]}
              </td>
              <td className="muted">{r === 'common' ? '—' : oneIn(RARITY_ODDS[r])}</td>
              <td style={{ textAlign: 'right' }}>{chances[r] > 0 ? (chances[r] >= 0.001 ? `${(chances[r] * 100).toFixed(chances[r] > 0.1 ? 1 : 2)}%` : oneIn(1 / chances[r])) : 'never'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ------------------------------------------------------------------ knights

const RULES: DupeRule[] = ['keep', 'shard', 'sell'];

function Knights({ game }: { game: Game }) {
  const s = game.state;
  const [sel, setSel] = useState<string | null>(s.squad[s.controlled] ?? null);
  const [, bump] = useState(0);
  const refresh = () => {
    game.syncSquad();
    bump((n) => n + 1);
  };
  const ids = rankedKnights(s);
  const rec = sel ? s.roster[sel] : null;
  const dupes = totalDupes(s);
  return (
    <>
      <h2>Your Squad</h2>
      <div className="row" style={{ justifyContent: 'center' }}>
        {s.squad.map((id, slot) => (
          <div key={slot} className={`card ${sel === id ? 'sel' : ''}`} style={{ ['--rc' as string]: id ? RARITY_COLOR[knightDef(id).rarity] : '#555', minWidth: 'calc(36 * var(--u))' }} onClick={() => id && setSel(id)}>
            {id ? <KnightLive id={id} mutation={s.roster[id]?.mutation ?? null} scale={1.6} /> : <div style={{ height: 'calc(38 * var(--u))' }}>Empty</div>}
            <div>{id ? knightDef(id).name : `Slot ${slot + 1}`}</div>
            {slot === s.controlled && <div style={{ color: 'var(--gold)' }}>You</div>}
          </div>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'center', margin: 'calc(2 * var(--u)) 0' }}>
        <span>Squad power {fmt(squadPower(s))}</span>
        <button className="wbtn green small" onClick={() => (bestSquad(s), refresh())}>
          Best squad
        </button>
      </div>
      {rec && sel && <KnightDetail game={game} id={sel} onChange={refresh} />}
      <h3>
        Barracks ({ids.length}) {dupes > 0 && <span style={{ color: '#ff9a8a' }}>· {dupes} duplicates</span>}
      </h3>
      {dupes > 0 && (
        <div className="row">
          <button className="wbtn blue small" onClick={() => (shardAll(s), refresh())}>
            <Icon name="shard" size={1.5} /> Shard all
          </button>
          <button className="wbtn gold small" onClick={() => (sellAll(s), refresh())}>
            <Icon name="coin" size={1.5} /> Sell all
          </button>
        </div>
      )}
      <div className="grid" style={{ marginTop: 'calc(2 * var(--u))' }}>
        {ids.map((id) => {
          const r = s.roster[id];
          const def = knightDef(id);
          return (
            <div
              key={id}
              className={`card ${sel === id ? 'sel' : ''}`}
              style={{ ['--rc' as string]: RARITY_COLOR[def.rarity] }}
              onClick={() => {
                setSel(id);
                r.isNew = false;
              }}
            >
              {r.isNew && <span className="badge new">NEW</span>}
              {r.dupes > 0 && <span className="badge">+{r.dupes}</span>}
              <KnightSprite id={id} mutation={r.mutation} scale={1.2} />
              <div className="rar" style={{ color: RARITY_COLOR[def.rarity] }}>
                {CLASSES[def.cls].name}
              </div>
              <div className="muted">
                Lv {r.level} · {fmt(knightPower(s, r))}
              </div>
            </div>
          );
        })}
      </div>
      <h3>Duplicates arriving</h3>
      <p className="muted">What happens to a duplicate as it lands, by rarity (Keep lets them pile up for you to decide).</p>
      <div className="grid">
        {RARITIES.map((r) => (
          <label key={r} className="row" style={{ gap: 'var(--u)' }}>
            <span className="rar" style={{ color: RARITY_COLOR[r], minWidth: 'calc(22 * var(--u))' }}>
              {RARITY_NAME[r]}
            </span>
            <select className="sel" value={s.dupeRules[r]} onChange={(e) => ((s.dupeRules[r] = e.target.value as DupeRule), refresh())}>
              {RULES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </>
  );
}

function KnightDetail({ game, id, onChange }: { game: Game; id: string; onChange: () => void }) {
  const s = game.state;
  const rec = s.roster[id];
  const def = knightDef(id);
  const cls = CLASSES[def.cls];
  const st = knightStats(s, id);
  const cost = levelCost(rec.level);
  const inSquad = s.squad.indexOf(id);
  return (
    <div className="parchment detail">
      <div className="row">
        <KnightLive id={id} mutation={rec.mutation} scale={2.4} />
        <div style={{ flex: 1, minWidth: 'calc(60 * var(--u))' }}>
          <div className="title">{def.name}</div>
          <div className="rar" style={{ color: RARITY_COLOR[def.rarity], textShadow: '0 0 1px #000' }}>
            {RARITY_NAME[def.rarity]} {cls.name} ({cls.roleName}){rec.mutation ? ` · ${rec.mutation.toUpperCase()}` : ''}
          </div>
          <div>{oneIn(oneInFor(def.rarity, rec.mutation))}</div>
          <div>
            Level {rec.level} · Power {fmt(knightPower(s, rec))}
          </div>
          <div>
            HP {fmt(st.hp)} · ATK {fmt(st.atk)} · Armor {Math.round(st.armor * 100)}%
          </div>
        </div>
      </div>
      <div className="skill">
        <b>{cls.auto.name}</b> (auto): {cls.auto.text}
      </div>
      <div className="skill">
        <b>{cls.dodge.name}</b> (dodge): {cls.dodge.text}
      </div>
      <div className="skill">
        <b>{specialOf(id).name}</b> ({specialOf(id).signature ? 'signature special, only this knight has it' : 'special'}, {specialOf(id).cd}s): {specialOf(id).text}
      </div>
      <div className="row" style={{ marginTop: 'calc(2 * var(--u))' }}>
        <span>
          <Icon name="shard" size={1.5} /> {rec.shards} shards · {rec.dupes} duplicates
        </span>
      </div>
      <div className="row">
        <button className="wbtn green small" disabled={!canLevel(s, id)} onClick={() => (levelUp(s, id), onChange())}>
          Level up: {cost.shards} shards + {fmt(cost.gold)} gold
        </button>
        <button className="wbtn blue small" disabled={rec.dupes < 1} onClick={() => (shardDupes(s, id), onChange())}>
          Shard {rec.dupes} (+{rec.dupes * shardsPerDupe(s, def.rarity)})
        </button>
        <button className="wbtn gold small" disabled={rec.dupes < 1} onClick={() => (sellDupes(s, id), onChange())}>
          Sell {rec.dupes} (+{fmt(sellValue(s, id) * rec.dupes)})
        </button>
      </div>
      <div className="row" style={{ marginTop: 'calc(1 * var(--u))' }}>
        {[0, 1, 2].map((slot) => (
          <button key={slot} className="wbtn small" disabled={s.squad[slot] === id} onClick={() => (setSquadSlot(s, slot, id), onChange())}>
            {inSquad === slot ? `In slot ${slot + 1}` : `Put in slot ${slot + 1}`}
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ upgrades

function Upgrades({ game }: { game: Game }) {
  const s = game.state;
  const [, bump] = useState(0);
  return (
    <>
      <h2>Upgrades</h2>
      <p className="muted" style={{ textAlign: 'center' }}>
        Gold {fmt(s.gold)} · a rebirth resets these
      </p>
      {(['altar', 'squad'] as const).map((g) => (
        <div key={g}>
          <h3>{g === 'altar' ? 'The Summoning Altar' : 'The Squad'}</h3>
          {UPGRADES.filter((u) => u.group === g).map((u) => {
            const t = tier(s, u.id);
            const max = t >= u.max;
            return (
              <div key={u.id} className="parchment upg">
                <div>
                  <div className="name">
                    {u.name} {max ? 'MAX' : `${t + 1 > 1 ? `${'I'.repeat(Math.min(3, t + 1))}${t + 1 > 3 ? ` ${t + 1}` : ''}` : 'I'}`}
                  </div>
                  <div>{u.text(t + 1)}</div>
                  <div className="pips">
                    {Array.from({ length: u.max }, (_, i) => (
                      <i key={i} className={i < t ? 'on' : ''} />
                    ))}
                  </div>
                </div>
                <button className="wbtn gold small" disabled={max || !canBuy(s, u.id)} onClick={() => (buyUpgrade(s, u.id), game.syncSquad(), bump((n) => n + 1))}>
                  {max ? 'Done' : (
                    <>
                      <Icon name="coin" size={1.5} />
                      {fmt(upgradeCost(s, u.id))}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ perks

function Perks({ game }: { game: Game }) {
  const s = game.state;
  const [, bump] = useState(0);
  if (!perksOpen(s)) return <p>Perks open after your first rebirth.</p>;
  return (
    <>
      <h2>Perks</h2>
      <p style={{ textAlign: 'center' }}>
        <Icon name="sigil" size={2} /> {s.sigils} Sigils · one per boss you beat for the first time this run. A rebirth clears every perk, so each run builds its own.
      </p>
      <div className="trees">
        {PERK_TREES.map((t) => (
          <div key={t.id}>
            <h3 style={{ color: t.color }}>{t.name}</h3>
            <p className="muted">{t.text}</p>
            {PERKS.filter((p) => p.tree === t.id).map((p) => {
              const owned = hasPerk(s, p.id);
              const can = canBuyPerk(s, p.id);
              return (
                <div key={p.id} className={`parchment perk ${owned ? 'owned' : ''} ${!owned && !can ? 'locked' : ''}`} onClick={() => can && (buyPerk(s, p.id), game.syncSquad(), bump((n) => n + 1))}>
                  <b>{p.name}</b> {owned ? '✓' : `(${p.cost} sigil${p.cost > 1 ? 's' : ''})`}
                  <div>{p.text}</div>
                  {p.requires.length > 0 && !owned && <div className="muted">Needs {p.requires.map((r) => PERKS.find((x) => x.id === r)!.name).join(p.requires.length > 1 ? ' or ' : '')}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ rebirth

function Rebirth({ game }: { game: Game }) {
  const s = game.state;
  const need = rebirthFloor(s.rebirths);
  const ok = canRebirth(s);
  const next = s.rebirths + 1;
  const newClasses = unlockedClasses(next).filter((c) => !unlockedClasses(s.rebirths).includes(c));
  return (
    <>
      <h2>Rebirth {next}</h2>
      <p style={{ textAlign: 'center' }}>
        Reach floor {need} to rebirth (best this run: {s.run.bestFloor}).
      </p>
      <div className="parchment detail">
        <div className="title">You keep, for good:</div>
        <div>Luck ×{(1 + next * BAL.rebirth.luckPer).toFixed(2)} (now ×{(1 + s.rebirths * BAL.rebirth.luckPer).toFixed(2)})</div>
        <div>Gold ×{(1 + next * BAL.rebirth.goldMultPer).toFixed(1)}</div>
        <div>Knight stats ×{rebirthStatMult(next).toFixed(1)}</div>
        <div>Your Codex and records</div>
        {next === BAL.perks.unlockRebirths && <div style={{ color: '#6a3a8a' }}>Perks open: sigils from bosses buy run-changing perks</div>}
        {newClasses.length > 0 && <div style={{ color: '#6a3a14' }}>New class to roll: {newClasses.map((c) => CLASSES[c].name).join(', ')}</div>}
        <div className="title" style={{ marginTop: 'calc(2 * var(--u))' }}>
          You lose:
        </div>
        <div>Your knights (levels, shards and duplicates), gold, upgrades, perks and sigils. Floors start again at 1.</div>
        {hasPerk(s, 'heirloom') && s.squad[s.controlled] && <div style={{ color: '#3a7a2a' }}>Heirloom: {knightDef(s.squad[s.controlled]!).name} comes with you.</div>}
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="wbtn gold" disabled={!ok} onClick={() => game.rebirth()}>
          <Icon name="flame" size={2} /> {ok ? 'Rebirth now' : `Floor ${need} needed`}
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ codex

function Codex({ game }: { game: Game }) {
  const s = game.state;
  const found = Object.keys(s.codex).length;
  return (
    <>
      <h2>Codex</h2>
      <p style={{ textAlign: 'center' }}>
        {found} of {KNIGHTS.length} knights found · best find {s.records.bestOneIn ? oneIn(s.records.bestOneIn) : '—'} · deepest floor {s.records.bestFloorEver}
      </p>
      {RARITIES.map((r: Rarity) => (
        <div key={r}>
          <h3 style={{ color: RARITY_COLOR[r] }}>
            {RARITY_NAME[r]} <span className="muted">{r === 'common' ? '' : oneIn(RARITY_ODDS[r])}</span>
          </h3>
          <div className="grid">
            {KNIGHTS.filter((k) => k.rarity === r).map((k) => {
              const c = s.codex[k.id];
              return (
                <div key={k.id} className="card" style={{ ['--rc' as string]: c ? RARITY_COLOR[r] : '#333' }}>
                  <KnightSprite id={k.id} mutation={c?.best ?? null} scale={1.2} silhouette={c ? undefined : '#0e0a12'} />
                  <div>{c ? k.name : '???'}</div>
                  {c && <div className="muted">×{c.count}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ settings

function Settings({ game }: { game: Game }) {
  const s = game.state;
  const [, bump] = useState(0);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <h2>Settings</h2>
      <div className="parchment detail">
        <label className="row">
          Sound <input type="range" min={0} max={1} step={0.05} value={s.settings.sfx} onChange={(e) => ((s.settings.sfx = Number(e.target.value)), bump((n) => n + 1))} />
        </label>
        <label className="row">
          <input type="checkbox" checked={s.settings.autoPlay} onChange={(e) => (game.setAuto(e.target.checked), bump((n) => n + 1))} /> Auto: your knight plays itself
        </label>
        <label className="row">
          <input type="checkbox" checked={s.settings.tiltShift} onChange={(e) => ((s.settings.tiltShift = e.target.checked), bump((n) => n + 1))} /> Tilt-shift: the distance goes soft, like a miniature
        </label>
        <label className="row">
          <input type="checkbox" checked={s.settings.reduceMotion} onChange={(e) => ((s.settings.reduceMotion = e.target.checked), bump((n) => n + 1))} /> Reduce motion (no screen shake)
        </label>
      </div>
      <h3>Controls</h3>
      <p>Move: WASD or arrows (touch: drag on the left). Dodge roll: Space or Shift. Special: E or Q. Take control of a knight: 1, 2, 3 or tap them. Auto: T. Menu: M, Altar: R, Knights: K, Upgrades: U.</p>
      <h3>Your save</h3>
      <p className="muted">Saved in this browser every 10 seconds. Played {Math.round(s.playTimeMs / 60000)} minutes, {s.records.kills} foes beaten, {s.records.spins} knights rolled.</p>
      {!confirm ? (
        <button className="wbtn red small" onClick={() => setConfirm(true)}>
          Start a new game
        </button>
      ) : (
        <div className="row">
          <span>Erase everything?</span>
          <button className="wbtn red small" onClick={() => (game.reset(), setConfirm(false))}>
            Yes, erase
          </button>
          <button className="wbtn small" onClick={() => setConfirm(false)}>
            No
          </button>
        </div>
      )}
      <h3>Credits</h3>
      <p className="muted">
        Character skeleton: Snoblin, Pixel RPG Prototype Characters. Effects: Pixel Art Assets - Will Tice / unTied Games. Interface: the Medieval and Cozy UI sheets. Farm animals: the supplied pig and sheep sheets. Everything else drawn in code for the game. Pixelify Sans (SIL OFL).
      </p>
      <p className="muted">v{__APP_VERSION__}</p>
    </>
  );
}

export { shardsPerDupe };
