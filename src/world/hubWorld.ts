/**
 * The hub: where you go between dives. You walk your knight round a lamplit square at night, and each
 * keeper there does one job: the Oracle at the Gilded Reel (summoning: the rolling never stops), the
 * smith (levels and reforging), the junk dealer (break down and sell duplicates), the quartermaster
 * (your squad), the tinker (upgrades), the sage (perks), the priestess (rebirth), the notice board
 * (quests) and the warden at the steps down into the dungeon. Walk up to a keeper and talk to open
 * their counter.
 *
 * The square and its keepers are painted (hub.ts, hubScene()); this is what the game needs of it.
 */
import { hubScene, type HubStation as PaintedStation, type HubStationId } from './hub';
import type { FloorMap } from './mapgen';

export type StationId = HubStationId;
export type HubStation = PaintedStation;

export interface HubLayout {
  map: FloorMap;
  stations: HubStation[];
}

/** How close (px) you must be to a keeper, or to the spot in front of their counter, to talk. */
export const TALK_RANGE = 26;

/** The hub's walkable map and its keepers. */
export function hubLayout(): HubLayout {
  const s = hubScene();
  return { map: s.map, stations: s.stations };
}
