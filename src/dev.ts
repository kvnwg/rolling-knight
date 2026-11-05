/**
 * Dev shortcuts by URL, for playtesting and screenshots (no effect without them):
 *   ?fresh            a new game (the save is left alone until it's overwritten)
 *   ?floor=16         start on that floor with a ready squad (tutorial skipped)
 *   ?squad=legendary  the squad's rarity for ?floor (default epic)
 *   ?auto             the knight you control plays itself
 *   ?gold=1e6         some gold
 * The game is also on window.__game.
 */
import { knightId, type ClassId } from './core/knights';
import { RARITIES, type Rarity } from './core/rarity';
import { addKnight } from './core/roster';
import { Game } from './game';

export function devGame(): Game {
  const q = new URLSearchParams(location.search);
  const game = new Game(q.has('fresh') || q.has('floor'));
  const s = game.state;
  const floor = Number(q.get('floor') ?? 0);
  if (floor > 0) {
    const r = (q.get('squad') ?? 'epic') as Rarity;
    const rarity = RARITIES.includes(r) ? r : 'epic';
    s.roll.tutorial = 'done';
    s.run.floor = floor;
    s.run.bestFloor = floor;
    s.run.checkpoint = floor - ((floor - 1) % 5);
    s.run.bosses = Math.floor((floor - 1) / 5);
    const classes: ClassId[] = (q.get('classes')?.split(',') as ClassId[]) ?? ['guardian', 'ranger', 'cleric'];
    classes.slice(0, 3).forEach((c) => addKnight(s, knightId(rarity, c), null));
    s.squad = classes.slice(0, 3).map((c) => knightId(rarity, c));
    for (const id of s.squad) if (id && s.roster[id]) s.roster[id].level = Math.max(1, Math.floor(floor * 0.8));
  }
  if (q.has('gold')) s.gold = Number(q.get('gold'));
  if (q.has('auto')) s.settings.autoPlay = true;
  (window as unknown as { __game: Game }).__game = game;
  return game;
}
