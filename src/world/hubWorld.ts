/**
 * The hub: where you go between dives. You walk your knight round a small lamplit square, and each
 * keeper there does one job: the altar (summoning: the rolling never stops), the smith (levels and
 * reforging), the scrapper (break down and sell duplicates), the quartermaster (your squad), the
 * outfitter (upgrades), the sage (perks), the priest (rebirth), the notice board (quests) and the gate
 * down into the dungeon. Walk up to a keeper and talk to open their counter.
 *
 * The layout here is the stand-in until the painted hub (src/world/hub.ts, hubScene()) lands: the old
 * camp clearing, with a keeper at each station.
 */
import type { View } from './entities';
import { TILE, campMap, type FloorMap } from './mapgen';
import { NPC_BY_ID, type NpcDef } from './npcs';

export type StationId = 'altar' | 'smith' | 'scrap' | 'squad' | 'upgrades' | 'perks' | 'rebirth' | 'gate' | 'quests';

export interface HubStation {
  id: StationId;
  /** The keeper's name and what they do, as the prompt and the counter's header say it. */
  name: string;
  job: string;
  greeting: string;
  /** Where the keeper stands (feet), and which way they face. */
  x: number;
  y: number;
  dir: 1 | -1;
  view: View;
  /** The keeper's look (an NPC from the cast); null for a thing, like the gate or the board. */
  def: NpcDef | null;
}

export interface HubLayout {
  map: FloorMap;
  stations: HubStation[];
}

/** How close (px) you must be to a keeper to talk. */
export const TALK_RANGE = 26;

const at = (tx: number, ty: number) => ({ x: tx * TILE + 8, y: ty * TILE + 12 });

let cached: HubLayout | null = null;

/** The stand-in hub: the camp clearing with its keepers. */
export function placeholderHub(): HubLayout {
  if (cached) return cached;
  const map = campMap();
  const k = (id: string) => NPC_BY_ID.get(id) ?? null;
  const st = (id: StationId, name: string, job: string, greeting: string, tx: number, ty: number, npc: string | null, dir: 1 | -1 = 1, view: View = 'down'): HubStation => ({
    id,
    name,
    job,
    greeting,
    ...at(tx, ty),
    dir,
    view,
    def: npc ? k(npc) : null,
  });
  cached = {
    map,
    stations: [
      st('altar', 'Mortimer', 'Summoning Altar', 'The altar never stops turning. Neither, I am told, should you.', 15, 9, 'wizard'),
      st('smith', 'Gordon', 'Smithy: level and reforge', 'Bring me shards. I make knights shinier. Kevin helps.', 9, 12, 'rocks', 1, 'side'),
      st('scrap', 'Barty Coin', 'Scrap and sell', 'Doubles? I take doubles. I take anything. Except the spoon.', 20, 15, 'merchant', -1, 'side'),
      st('squad', 'Chef Gustave', 'Quartermaster: your squad', 'Pick who eats with you tonight. And who fights with you tomorrow.', 12, 16, 'chef', 1, 'side'),
      st('upgrades', 'Nib Ledgerbottom', 'Outfitter: upgrades', 'Everything has a price. I have written them all down. Twice.', 21, 12, 'goblin', -1, 'side'),
      st('perks', 'Old Bramble', 'Sage: perks', 'You came back from the dark. That earns you a secret or two.', 18, 18, 'hermit', -1, 'side'),
      st('rebirth', 'Sir Latimer', 'Rebirth shrine', 'Begin again, stronger. I would know. I keep beginning again.', 12, 19, 'ghost'),
      st('quests', 'Notice board', 'Jobs and bounties', 'Help wanted. Some of it urgent. Some of it about a chicken.', 9, 15, null),
      st('gate', 'Guard Aldous', 'The dungeon gate', 'Down you go. Mind the slimes. And the stairs. And everything.', 15, 5, 'guard'),
    ],
  };
  return cached;
}
