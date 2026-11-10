/**
 * Headless balance run: the real game logic with the dev bot (every knight played by its class AI), with a
 * simple bot that sells its extras (as a player would at Bram the Broker's: the gold comes to what
 * repeats paid as they landed, a few seconds later), levels the squad, spends on upgrades (the
 * cheaper of the cheapest Luck tier and a combat roll), rolls perks and rebirths when it can.
 *   npm run sim -- --minutes 60 --seed 3
 */
import { Game } from '../src/game';
import { RARITIES } from '../src/core/rarity';
import { UPGRADES, buyUpgrade, canBuy, upgradeCost } from '../src/core/upgrades';
import { canRollCombat, combatRollPrice, combatTiers, rollCombat } from '../src/core/combatRoll';
import { bestSquad, canLevel, levelUp, sellAllExtras } from '../src/core/roster';
import { canRebirth } from '../src/core/newGame';
import { canRollPerk, rollPerk } from '../src/core/perks';
import { squadPower } from '../src/core/power';
import { World } from '../src/world/world';

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const minutes = arg('minutes', 30);
const seed = arg('seed', 1);
const rebirthOn = arg('rebirth', 1) > 0;
const verbose = arg('verbose', 0) > 0;

const realNow = Date.now;
let clock = 1_700_000_000_000 + seed * 1000;
Date.now = () => clock;
const g = new Game(true);
g.state.seed = seed;
// The dev bot plays the knight you control (moving, dodging and fighting), like the rest of the squad.
g.bot = true;
const dt = 1 / 30;
const counts: Record<string, number> = {};
let lastFloor = 0;
const timeline: string[] = [];
let wipes = 0;
let downs = 0;
const floorTimes: number[] = [];
let floorT0 = 0;
let perfect = 0;
let perfectMine = 0;
g.on((e) => {
  if (e.type === 'land') counts[e.rarity] = (counts[e.rarity] ?? 0) + 1;
  if (e.type === 'perfectRoll') (perfect++, e.mine && perfectMine++);
  if (e.type === 'wipe') (wipes++, timeline.push(`${(g.state.playTimeMs / 60000).toFixed(1)}m wipe on ${e.floor}, back to ${e.back}`));
  if (e.type === 'rebirth') timeline.push(`${(g.state.playTimeMs / 60000).toFixed(1)}m REBIRTH ${e.count}`);
});
// Count knights going down (a world event the game consumes).
const downHero = World.prototype.downHero;
World.prototype.downHero = function (this: World, h) {
  downs++;
  downHero.call(this, h);
};
let botT = 0;
const start = realNow();
for (let t = 0; t < minutes * 60; t += dt) {
  clock += dt * 1000;
  // At camp, the bot sets out as soon as it has a squad.
  if (!g.inDungeon && g.state.squad.some(Boolean)) g.enterDungeon();
  g.tick(dt);
  botT += dt;
  if (botT > 5) {
    botT = 0;
    const s = g.state;
    // Sell the extras; level the squad, then the cheaper of the cheapest Luck tier and a combat roll; roll every perk the sigils cover.
    sellAllExtras(s);
    for (const id of s.squad) while (id && canLevel(s, id)) levelUp(s, id);
    const luck = UPGRADES.filter((u) => canBuy(s, u.id)).sort((a, b) => upgradeCost(s, a.id) - upgradeCost(s, b.id))[0];
    const roll = canRollCombat(s) ? combatRollPrice(s) : Infinity;
    if (luck && upgradeCost(s, luck.id) <= roll) buyUpgrade(s, luck.id);
    else if (roll < Infinity) rollCombat(s, () => g.rng.next());
    while (canRollPerk(s)) rollPerk(s, () => g.rng.next());
    const before = s.squad.join();
    bestSquad(s);
    if (s.squad.join() !== before) g.syncSquad();
    if (rebirthOn && canRebirth(s) && s.run.floor >= s.run.bestFloor) g.rebirth();
  }
  if (g.state.run.floor !== lastFloor) {
    if (g.state.run.floor === lastFloor + 1) floorTimes.push(g.state.playTimeMs / 1000 - floorT0);
    floorT0 = g.state.playTimeMs / 1000;
    lastFloor = g.state.run.floor;
    const d = g.difficulty;
    const bal = d ? ` power ${Math.round(d.power)} par ${Math.round(d.par)} (x${d.ratio.toFixed(2)} ${d.challenge})` : '';
    if (lastFloor % 5 === 1 || lastFloor % 5 === 0 || lastFloor <= 3 || verbose) timeline.push(`${(g.state.playTimeMs / 60000).toFixed(1)}m floor ${lastFloor} (${g.biome.name}) gold ${Math.round(g.state.gold)} luck ${g.luck.toFixed(2)}${bal}`);
  }
}
const s = g.state;
console.log(timeline.join('\n'));
console.log('---');
console.log(`after ${minutes} min: floor ${s.run.floor}, best ${s.run.bestFloor}, rebirths ${s.rebirths}, gold ${Math.round(s.gold)}, kills ${s.records.kills}, spins ${s.records.spins}`);
console.log('rolled:', RARITIES.filter((r) => counts[r]).map((r) => `${r} ${counts[r]}`).join(', '));
console.log('squad:', s.squad.map((id) => (id ? `${id} L${s.roster[id]?.level}` : '-')).join(' | '), `power ${Math.round(squadPower(s))}`);
console.log(`combat tiers ${combatTiers(s)}, perks ${s.perks.length}`);
const avg = floorTimes.length ? floorTimes.reduce((a, b) => a + b, 0) / floorTimes.length : 0;
console.log(`floors cleared ${floorTimes.length}, avg ${avg.toFixed(0)} s per floor, knights downed ${downs}, wipes ${wipes}`);
console.log(`perfect rolls ${perfect} (${perfectMine} by the knight you control)`);
console.log(`(${((realNow() - start) / 1000).toFixed(1)} s real)`);
