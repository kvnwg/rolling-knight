/**
 * Dev shortcuts by URL, for playtesting and screenshots (no effect without them):
 *   ?fresh            a new game (the save is left alone until it's overwritten)
 *   ?floor=16         start on that floor with a ready squad (tutorial skipped)
 *   ?squad=legendary  the squad's rarity for ?floor (default epic)
 *   ?auto             the knight you control plays itself (the dev bot: it moves, dodges and fights)
 *   ?gold=1e6         some gold
 *   ?camp             stay at camp (the home screen) after ?floor's setup
 *   ?sky=rain         every floor's weather (clear, overcast, rain)
 *   ?design=maze      the next floor's design (world/designs.ts), then the deck as usual
 *   ?bench=common,rare  extra knights on the bench (not in the squad), one per rarity listed
 *   ?rebirths=2       that many rebirths (squad slots: one more per rebirth); ?floor sets enough for its classes
 * The game is also on window.__game.
 */
import { isDesign } from './core/deck';
import { CLASSES, knightId, type ClassId } from './core/knights';
import { RARITIES, type Rarity } from './core/rarity';
import { checkpointFor } from './core/newGame';
import { addKnight } from './core/roster';
import { Game } from './game';
import { forceSky, type SkyKind } from './world/sky';

export function devGame(): Game {
  const q = new URLSearchParams(location.search);
  const sky = q.get('sky');
  if (sky === 'clear' || sky === 'overcast' || sky === 'rain') forceSky(sky as SkyKind);
  const game = new Game(q.has('fresh') || q.has('floor'));
  const s = game.state;
  const floor = Number(q.get('floor') ?? 0);
  if (floor > 0) {
    const r = (q.get('squad') ?? 'epic') as Rarity;
    const rarity = RARITIES.includes(r) ? r : 'epic';
    s.roll.tutorial = 'done';
    s.run.floor = floor;
    s.run.bestFloor = floor;
    s.run.checkpoint = checkpointFor(floor);
    s.run.bosses = Math.floor((floor - 1) / 5);
    const classes: ClassId[] = (q.get('classes')?.split(',') as ClassId[]) ?? ['guardian', 'ranger', 'cleric'];
    // Enough rebirths for every class asked for to have a slot.
    s.rebirths = Math.max(s.rebirths, Math.min(3, classes.length) - 1);
    classes.slice(0, 3).forEach((c) => addKnight(s, knightId(rarity, c), null));
    s.squad = [0, 1, 2].map((i) => (classes[i] ? knightId(rarity, classes[i]) : null));
    for (const id of s.squad) if (id && s.roster[id]) s.roster[id].level = Math.max(1, Math.floor(floor * 0.8));
    game.inDungeon = true;
  }
  if (q.has('rebirths')) s.rebirths = Math.max(0, Number(q.get('rebirths')) || 0);
  const bench = q.get('bench');
  if (bench) {
    const all = Object.keys(CLASSES) as ClassId[];
    bench.split(',').forEach((r, i) => {
      if (RARITIES.includes(r as Rarity)) addKnight(s, knightId(r as Rarity, all[(i * 3 + 1) % all.length]), null);
    });
  }
  const design = q.get('design');
  if (isDesign(design)) s.run.designDeck = [design, ...s.run.designDeck.filter((d) => d !== design)];
  if (q.has('camp')) game.inDungeon = false;
  if (q.has('gold')) s.gold = Number(q.get('gold'));
  if (q.has('auto')) game.bot = true;
  (window as unknown as { __game: Game }).__game = game;
  return game;
}
