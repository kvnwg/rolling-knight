/**
 * Shops: now and then a room of the floor is a merchant's (none on floor 1 or a boss floor; most
 * often on the floor before a boss, to stock up). Her set-up (the biome's stall, tent or cart:
 * camps.ts) stands with its back to a wall, her wares are set out on the floor in front of it, each on
 * a little display with its price tag, and nothing spawns in the room. Walk up to a ware to buy it
 * (Game.buyWare), or to steal it (Game.stealWare, world/thief.ts: she fights); talk to her for a word.
 * A merchant who has heard you're a thief (you stole from one earlier this run) marks everything up.
 */
import { BAL } from '../core/balance';
import { Rng } from '../core/rng';
import { RUN_ITEMS, RUN_ITEM_IDS, thiefPrice, warePrice, type RunItemId } from '../core/runItems';
import { isBossFloor } from './biomes';
import { pitchCamp, type Camp } from './camps';
import { FLOOR, TILE, tileAt, type FloorMap } from './mapgen';
import { SHOPKEEPER, makeNpc, type Npc } from './npcs';
import { trapTiles } from './traps';

export interface Ware {
  uid: number;
  item: RunItemId;
  price: number;
  /** World px: the display's foot. */
  x: number;
  y: number;
  sold: boolean;
}

export interface Shop {
  merchant: Npc;
  wares: Ware[];
  /** The merchant's room (index in map.rooms; -1 none). */
  room: number;
}

let nextWareUid = 1;

/** The chance a floor has a shop. */
export function shopChance(floor: number): number {
  if (floor < 2 || isBossFloor(floor)) return 0;
  return isBossFloor(floor + 1) ? BAL.shop.chanceBeforeBoss : BAL.shop.chance;
}

/** The open floor in front of a set-up where wares can stand: a row below its talking spot, spread out. */
function wareSpots(m: FloorMap, camp: Camp, n: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const trapped = trapTiles(m);
  const open = (x: number, y: number) => tileAt(m, Math.floor(x / TILE), Math.floor(y / TILE)) === FLOOR && !trapped.has(Math.floor(y / TILE) * m.w + Math.floor(x / TILE));
  // The rows in front of the set-up (the first is where you stand to talk; the wares go below it).
  for (const dy of [TILE + 12, 2 * TILE + 12]) {
    const y = camp.talk.y + dy;
    const row: Array<{ x: number; y: number }> = [];
    for (const dx of [-30, 0, 30, -58, 58]) {
      const x = camp.stand.x + dx;
      if (open(x, y) && open(x - 5, y) && open(x + 5, y) && open(x, y - 6)) row.push({ x, y });
    }
    if (row.length >= Math.min(n, 2)) {
      // Nearest the middle first, then left to right.
      return row
        .slice(0, n)
        .sort((a, b) => a.x - b.x);
    }
    if (row.length > out.length) out.splice(0, out.length, ...row);
  }
  return out.slice(0, n).sort((a, b) => a.x - b.x);
}

/** `n` wares, no two the same, by weight: a Healing Draught most of the time. */
function pickWares(rng: Rng, n: number): RunItemId[] {
  const out: RunItemId[] = [];
  if (rng.chance(0.65)) out.push('draught');
  while (out.length < n) {
    const pool = RUN_ITEM_IDS.filter((id) => !out.includes(id)).map((id) => [id, RUN_ITEMS[id].weight] as const);
    if (!pool.length) break;
    out.push(rng.weighted(pool));
  }
  return out;
}

/**
 * Sets out a shop on `map` (or none: chance, or nowhere fits). Changes the map like an NPC's set-up
 * does (its tiles blocked, its pieces added to the props) and clears the spawns from the merchant's
 * room. `killGold`: this floor's gold per kill (prices follow it). Call after placeNpcs, passing
 * their set-ups so the merchant keeps clear of them. `thief`: you stole from a merchant earlier this
 * run, and word got round: her prices are a thief's (the same shop otherwise).
 */
export function placeShop(map: FloorMap, floor: number, biomeId: string, seed: number, killGold: number, camps: readonly Camp[] = [], thief = false): Shop | null {
  const rng = new Rng(Rng.hashSeed((seed ^ Math.imul(floor, 0x51ed) ^ 0x5409) >>> 0));
  if (!rng.chance(shopChance(floor))) return null;
  const camp = pitchCamp(map, biomeId, rng.fork(1), camps);
  if (!camp) return null;
  const spots = wareSpots(map, camp, BAL.shop.wares);
  if (!spots.length) return null;
  // The merchant's room: nothing spawns in it.
  if (camp.room >= 0) map.spawns = map.spawns.filter((s) => s.boss || s.room !== camp.room);
  const items = pickWares(rng, spots.length);
  const price = (id: RunItemId) => (thief ? thiefPrice(warePrice(id, killGold)) : warePrice(id, killGold));
  const wares: Ware[] = spots.map((p, i) => ({ uid: nextWareUid++, item: items[i], price: price(items[i]), x: p.x, y: p.y, sold: false }));
  const merchant = makeNpc(SHOPKEEPER, camp.stand.x, camp.stand.y, floor, biomeId, rng.int(0, 0x3fffffff));
  merchant.camp = camp;
  merchant.room = camp.room;
  return { merchant, wares, room: camp.room };
}
