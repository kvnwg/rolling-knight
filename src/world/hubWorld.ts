/**
 * The hub: where you go between dives. You walk your knight round the warm court in front of the
 * Gilded Reel at night, and each keeper there does one job: the Oracle in the shop's doorway
 * (summoning: the rolling never stops), Bram the Broker at the curio cabinet (he sells your extras,
 * the repeat pulls of knights you already have), the tinker (upgrades), the sage (perks), the
 * priestess (rebirth), the notice board (quests) and the warden at the steps down into the dungeon
 * (your squad, its levels and reforging). Walk up to a keeper and talk to open their counter.
 *
 * The court and its keepers are painted (hub.ts, hubScene()); this is what the game needs of it.
 */
import { hubScene, type HubStation as PaintedStation, type HubStationId } from './hub';
import type { FloorMap } from './mapgen';

export { HUB_DESCEND_Y, HUB_STEPS_Y } from '../render/art/hubScene';

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
