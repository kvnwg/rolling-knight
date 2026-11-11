/**
 * Economy pacing: plays the real game headless (the dev bot fights every floor) the way a player
 * would, and reports how fast it all goes.
 *
 * The player: spends as it goes, every few seconds, first selling its extras (the repeat pulls Bram
 * the Broker sells, as a player would on the way past him), then spreading its gold over the squad's
 * next levels, the luck tab's next tiers and combat rolls (the kind it has spent least on this run
 * first, the cheapest of that kind); rolls its perks; rebirths once the push says it can (after
 * `--farm` more minutes); and every `--every` minutes of play it's away for `--away` hours (the
 * offline earnings, against what an hour of play earns; the extras found while away are sold as it
 * comes back, and count as offline earnings). Selling every few seconds keeps the gold the same as
 * when repeats paid as they landed.
 *
 * Per run it reports: how long it took and how deep it went, the gold it earned (kills, extras sold,
 * the rest) and spent (levels, the luck tab, combat rolls), how much of the luck and combat tabs it
 * owned at the end, the knights' levels, and the pace: minutes between purchases.
 *
 *   npx tsx tools/econ.ts --hours 6 --seed 1 --away 8 --every 60 --farm 1
 */
import { Game } from '../src/game';
import { BAL } from '../src/core/balance';
import { canRollCombat, combatRollPrice, combatTiers, COMBAT_TIERS_MAX, rollCombat } from '../src/core/combatRoll';
import { canRebirth, rebirthFloor } from '../src/core/newGame';
import { runOffline } from '../src/core/offline';
import { canRollPerk, rollAndTakePerk } from '../src/core/perks';
import { squadPower } from '../src/core/power';
import { bestSquad, canLevel, levelCost, levelUp, sellAllExtras } from '../src/core/roster';
import { UPGRADES, buyUpgrade, canBuy, tier, upgradeCost, upgradeCostAt, upgradeTab } from '../src/core/upgrades';

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const hours = arg('hours', 4);
const seed = arg('seed', 1);
const awayHours = arg('away', 8);
const every = arg('every', 60);
const farm = arg('farm', 1);
const quiet = arg('quiet', 0) > 0;

const LUCK_LINES = UPGRADES.filter((u) => upgradeTab(u) === 'luck');
const luckTotal = (s: Game['state']) => LUCK_LINES.reduce((n, u) => n + (() => { let t = 0; for (let l = 0; l < u.max; l++) t += upgradeCostAt(u, l); return t; })(), 0) * (s ? 1 : 1);
const luckOwned = (s: Game['state']) => LUCK_LINES.reduce((n, u) => { let t = 0; for (let l = 0; l < tier(s, u.id); l++) t += upgradeCostAt(u, l); return n + t; }, 0);
const LUCK_TIERS = LUCK_LINES.reduce((n, u) => n + u.max, 0);
const luckTiers = (s: Game['state']) => LUCK_LINES.reduce((n, u) => n + tier(s, u.id), 0);
const LUCK_TOTAL = luckTotal(null as never);

const realNow = Date.now;
let clock = 1_700_000_000_000 + seed * 1000;
Date.now = () => clock;
const g = new Game(true);
g.state.seed = seed;
g.bot = true;
const dt = 1 / 20;

interface Run {
  n: number;
  t0: number;
  t1: number;
  floor: number;
  readyAt: number | null;
  kill: number;
  dupe: number;
  other: number;
  offline: number;
  spentLevels: number;
  spentLuck: number;
  spentCombat: number;
  buys: number[];
  luckFrac: number;
  combatFrac: number;
  levels: string;
  power: number;
}
const runs: Run[] = [];
const fresh = (n: number, t: number): Run => ({ n, t0: t, t1: t, floor: 1, readyAt: null, kill: 0, dupe: 0, other: 0, offline: 0, spentLevels: 0, spentLuck: 0, spentCombat: 0, buys: [], luckFrac: 0, combatFrac: 0, levels: '', power: 0 });
let run = fresh(0, 0);
const mins = () => g.state.playTimeMs / 60000;
const offline: Array<{ at: number; gold: number; perActiveMin: number; rolls: number; kept: number; rate: number }> = [];
let sessionT = 0;
let sessionKill = 0;
let botT = 0;
const start = realNow();
const close = () => {
  const s = g.state;
  run.t1 = mins();
  run.floor = Math.max(run.floor, s.run.bestFloor);
  run.luckFrac = luckTiers(s) / LUCK_TIERS;
  void luckOwned;
  run.combatFrac = combatTiers(s) / COMBAT_TIERS_MAX;
  run.levels = s.squad.map((id) => (id ? `L${s.roster[id]?.level}` : '-')).join(' ');
  run.power = Math.round(squadPower(s));
};
for (let t = 0; t < hours * 3600; t += dt) {
  clock += dt * 1000;
  if (!g.inDungeon && g.state.squad.some(Boolean)) g.enterDungeon();
  const before = g.state.gold;
  g.tick(dt);
  // (Repeats pay nothing as they land: their gold comes when the extras are sold, below.)
  const gained = g.state.gold - before;
  if (gained > 0) {
    run.kill += gained;
    sessionKill += gained;
  }
  run.floor = Math.max(run.floor, g.state.run.bestFloor);
  if (run.readyAt === null && canRebirth(g.state)) run.readyAt = mins();
  botT += dt;
  if (botT > 3) {
    botT = 0;
    const s = g.state;
    // The extras first, to Bram the Broker: what they were locked in at as they landed.
    run.dupe += sellAllExtras(s);
    // Spend: the cheapest thing affordable, again and again.
    for (let guard = 0; guard < 200; guard++) {
      const opts: Array<{ cost: number; buy: () => void; kind: 'lv' | 'luck' | 'combat' }> = [];
      for (const id of s.squad) if (id && canLevel(s, id)) opts.push({ cost: levelCost(s, id), buy: () => levelUp(s, id), kind: 'lv' });
      for (const u of LUCK_LINES) if (canBuy(s, u.id)) opts.push({ cost: upgradeCost(s, u.id), buy: () => buyUpgrade(s, u.id), kind: 'luck' });
      if (canRollCombat(s)) opts.push({ cost: combatRollPrice(s), buy: () => rollCombat(s, () => g.rng.next()), kind: 'combat' });
      if (!opts.length) break;
      // The kind spent least on this run first (a player spreads it round), its cheapest.
      const spentOn = { lv: run.spentLevels, luck: run.spentLuck, combat: run.spentCombat };
      opts.sort((a, b) => spentOn[a.kind] - spentOn[b.kind] || a.cost - b.cost);
      const o = opts[0];
      const gold0 = s.gold;
      o.buy();
      const spent = gold0 - s.gold;
      if (o.kind === 'lv') run.spentLevels += spent;
      else if (o.kind === 'luck') run.spentLuck += spent;
      else run.spentCombat += spent;
      run.buys.push(mins());
    }
    while (canRollPerk(s)) rollAndTakePerk(s, () => g.rng.next());
    const was = s.squad.join();
    bestSquad(s);
    if (s.squad.join() !== was) g.syncSquad();
    if (canRebirth(s) && run.readyAt !== null && mins() - run.readyAt >= farm && s.run.floor >= s.run.bestFloor) {
      close();
      runs.push(run);
      g.rebirth();
      run = fresh(g.state.rebirths, mins());
    }
  }
  // A night away now and then.
  if (mins() - sessionT >= every) {
    // Against the fights' rate as the player left (what the game pays from).
    const activeRate = g.state.stats.combatPerMinute ?? sessionKill / Math.max(1, mins() - sessionT);
    const awayS = awayHours * 3600;
    run.dupe += sellAllExtras(g.state);
    const gold0 = g.state.gold;
    const rep = runOffline(g.state, g.rng, awayS, clock);
    clock += awayS * 1000;
    // Back: the extras the altar found while it was away are sold with the night's gold.
    sellAllExtras(g.state);
    const gold = g.state.gold - gold0;
    run.offline += gold;
    offline.push({ at: mins(), gold, perActiveMin: activeRate > 0 ? gold / activeRate : 0, rolls: rep?.rolls ?? 0, kept: rep?.kept.length ?? 0, rate: activeRate });
    sessionT = mins();
    sessionKill = 0;
  }
}
close();
runs.push(run);

const f = (x: number) => (x >= 1e9 ? `${(x / 1e9).toFixed(1)}B` : x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${(x / 1e3).toFixed(1)}K` : `${Math.round(x)}`);
const gaps = (b: number[]) => {
  if (b.length < 2) return '-';
  const d = b.slice(1).map((x, i) => x - b[i]).sort((a, c) => a - c);
  return `${d[Math.floor(d.length / 2)].toFixed(2)}m med, ${d[Math.floor(d.length * 0.9)].toFixed(1)}m p90`;
};
if (!quiet) {
  console.log(`econ: ${hours} h of play, seed ${seed}, away ${awayHours} h every ${every} min, rebirth ${farm} min after it opens`);
  for (const r of runs) {
    const len = r.t1 - r.t0;
    console.log(
      `run ${r.n}: ${r.t0.toFixed(0)}-${r.t1.toFixed(0)}m (${len.toFixed(0)}m), floor ${r.floor}/${rebirthFloor(r.n)}${r.readyAt !== null ? ` ready at ${(r.readyAt - r.t0).toFixed(0)}m` : ''}, ` +
        `earned kill ${f(r.kill)} dupe ${f(r.dupe)} offline ${f(r.offline)}; spent lv ${f(r.spentLevels)} luck ${f(r.spentLuck)} combat ${f(r.spentCombat)}; ` +
        `owned luck ${(r.luckFrac * 100).toFixed(0)}% combat ${(r.combatFrac * 100).toFixed(0)}%; squad ${r.levels} power ${f(r.power)}; ${r.buys.length} buys, ${gaps(r.buys)}`,
    );
  }
  for (const o of offline) console.log(`away at ${o.at.toFixed(0)}m: +${f(o.gold)} gold = ${o.perActiveMin.toFixed(0)} min of play at ${f(o.rate)}/min, ${o.rolls} rolls, ${o.kept} kept`);
  console.log(`(${((realNow() - start) / 1000).toFixed(0)} s real; luck tab total ${f(LUCK_TOTAL)})`);
}
void BAL;
