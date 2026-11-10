/**
 * The painted hub: where you go between dives. One cozy shop front at night, about a phone's screen
 * of it: the Gilded Reel's timber front under its dark slate roof (the round reel sign glowing in the
 * gable, string lights along the barge boards, the lit window of goods, the Oracle in the open
 * doorway), the broker at the lit curio cabinet in the left wing (he sells your extras) and the
 * notice board by the door, the tinker at his shelves of bottles in the right wing. In front, a short
 * court of warm flagstones: the quartermaster at her round table, the sage in his armchair, the
 * priestess at her candle shrine, the smith at his anvil and brazier, and at its foot the dark stone
 * steps going down to the dungeon (a violet glow at the bottom), the warden on his landing beside
 * them. Lush leaves frame it all. The renderer shows it closer than the dungeon (about 150 art px
 * across a phone).
 *
 * Everything is fixed and deterministic, painted once on first use (hubScene() caches it; about half a
 * second, so call it early). Positions are hub pixels (the same as world pixels; TILE = 16): the art
 * covers HUB_W x HUB_H, and the collision grid covers the same area with everything outside the
 * court and the steps marked as wall.
 *
 * Drawing it (what tools/hubPreview.ts does, in the shader pipeline's terms):
 *  - ground: the whole buffer to the ground layer (shadows are baked in);
 *  - stand layer, y-sorted with the walking characters: every sprite at (x - ax, y - ay); every
 *    keeper and extra with keeperFrame(def, pose, view, frame, tool) from render/art/hubNpcs.ts
 *    (side frames face right: flip for dir -1), drawn at (x - ax, y - ay) like the sprites;
 *  - emit layer: every glow at (x, y), in the same sorted pass at its `sort` line, cycling `frames`
 *    at `fps` when given; a character drawn after a glow (lower down, in front) should clear the
 *    glow under its own pixels (destination-out), or a window shines through whoever stands before it;
 *  - fore: over everything on the stand layer, after the sorted pass (it is lit like the rest);
 *  - light: the ambient color plus every light (flicker 0..1 for fire), in the usual light map;
 *  - motes: particle spawners (fireflies in the leaves, motes in the shop light, embers and sparks);
 *  - grade: suggested post params; bg fills anything past the art's edges.
 */
import type { PixelBuf } from '../render/pixel/buf';
import type { View } from './entities';
import { BLOCKED, FLOOR, SOLID, TILE, type FloorMap } from './mapgen';
import type { NpcDef } from './npcs';
import { buildHub, HUB_ART_H, HUB_ART_W, HUB_CX, HUB_STEPS_Y, hubWalkable, type HubArt } from '../render/art/hubScene';
import type { KeeperPose, KeeperTool } from '../render/art/hubNpcs';

export const HUB_W = HUB_ART_W;
export const HUB_H = HUB_ART_H;
export const HUB_COLS = HUB_W / TILE;
export const HUB_ROWS = HUB_H / TILE;

export type HubStationId = 'altar' | 'smith' | 'scrap' | 'squad' | 'upgrades' | 'perks' | 'rebirth' | 'gate' | 'quests';

/** A standing piece (building, shelf, table, lamp, plant), y-sorted with the characters by `y`. */
export interface HubSprite {
  id: string;
  /** The feet / sort line, in hub pixels; the buffer is drawn at (x - ax, y - ay). */
  x: number;
  y: number;
  buf: PixelBuf;
  ax: number;
  ay: number;
}

/** Pixels that glow whatever the light (signs, windows, lantern glass, bulbs, coals, runes). */
export interface HubGlow {
  id: string;
  /** Top-left of the buffer, in hub pixels. */
  x: number;
  y: number;
  buf: PixelBuf;
  /** The sort line of the piece it belongs to (a character in front, lower down, should hide it). */
  sort: number;
  /** Optional animation: frames the same size as buf, cycled at fps. */
  frames?: PixelBuf[];
  fps?: number;
}

/** Foreground framing (leaves over the edges): drawn over everything, then lit. */
export interface HubFore {
  id: string;
  x: number;
  y: number;
  buf: PixelBuf;
}

export interface HubLight {
  x: number;
  y: number;
  r: number;
  color: string;
  /** 0..1 */
  intensity: number;
  /** 0 steady; up to 1 for fire. */
  flicker?: number;
}

/** A spot where particles drift: fireflies by the leaves, warm motes in the shop light, forge sparks. */
export interface HubMotes {
  x: number;
  y: number;
  rx: number;
  ry: number;
  kind: 'firefly' | 'mote' | 'ember' | 'spark';
  color: string;
  /** How many at once. */
  count: number;
}

/** Someone in the hub: where the feet are (sitting: the floor under the seat), facing, pose. */
export interface HubFigure {
  def: NpcDef;
  x: number;
  y: number;
  dir: 1 | -1;
  view: View;
  pose: KeeperPose;
  tool?: KeeperTool;
}

export interface HubStation {
  id: HubStationId;
  /** The keeper's name (or the thing's), and what they do. */
  name: string;
  job: string;
  greeting: string;
  /** Where the keeper stands (feet), facing; for the board, the board itself. */
  x: number;
  y: number;
  dir: 1 | -1;
  view: View;
  def: NpcDef | null;
  pose: KeeperPose;
  tool?: KeeperTool;
  /** Where to stand to talk (walkable, a few px in front). */
  talk: { x: number; y: number };
  /** What tells you their trade at a glance. */
  sign: string;
}

export interface HubGrade {
  haze: [number, number, number];
  hazeAmount: number;
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  saturation: number;
  contrast: number;
  vignette: number;
  bloom: number;
}

export interface HubScene {
  w: number;
  h: number;
  /** Fill for anything outside the art. */
  bg: string;
  map: FloorMap;
  spawn: { x: number; y: number; view: View; dir: 1 | -1 };
  ground: PixelBuf;
  sprites: HubSprite[];
  emissive: HubGlow[];
  fore: HubFore[];
  lights: HubLight[];
  ambient: { color: string; motes: HubMotes[] };
  stations: HubStation[];
  /** Regulars who aren't keepers (a traveller at the table). */
  extras: HubFigure[];
  /** Suggested post-processing for the hub (see render/post.ts). */
  grade: HubGrade;
}

// ------------------------------------------------------------------ the layout

/**
 * The collision grid, worked out from the art: a tile is floor if its middle is on the paving (or the
 * top of the steps) and nothing stands on it; blocked (floor with something on it) where a piece's
 * footprint or a keeper covers it; wall everywhere else (buildings, foliage, the dark round the edge).
 */
function buildMap(art: HubArt, spawn: { x: number; y: number }, keepers: Array<{ x: number; y: number }>): FloorMap {
  const w = HUB_COLS;
  const h = HUB_ROWS;
  const tiles = new Uint8Array(w * h);
  const pathMask = new Uint8Array(w * h);
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      const i = ty * w + tx;
      if (!hubWalkable(cx, cy)) {
        tiles[i] = SOLID;
        continue;
      }
      pathMask[i] = 1;
      let blocked = false;
      for (const f of art.feet) {
        const ox = Math.min(f.x1, (tx + 1) * TILE) - Math.max(f.x0, tx * TILE);
        const oy = Math.min(f.y1, (ty + 1) * TILE) - Math.max(f.y0, ty * TILE);
        // A thin thing (a lamp post, a barrel) blocks the tile it stands in.
        const small = (f.x1 - f.x0) * (f.y1 - f.y0) < 96;
        const foot = small && Math.floor((f.x0 + f.x1) / 2 / TILE) === tx && Math.floor((f.y1 - 1) / TILE) === ty;
        if (foot || (ox > 0 && oy > 0 && ox * oy >= 48) || (cx >= f.x0 && cx <= f.x1 && cy >= f.y0 && cy <= f.y1)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) for (const k of keepers) if (Math.floor(k.x / TILE) === tx && Math.floor(k.y / TILE) === ty) blocked = true;
      tiles[i] = blocked ? BLOCKED : FLOOR;
    }
  }
  const cx = Math.floor(spawn.x / TILE);
  const cy = Math.floor(spawn.y / TILE);
  return {
    w,
    h,
    tiles,
    path: pathMask,
    rooms: [{ cx, cy, rx: 12, ry: 12, kind: 'start' }],
    start: { x: spawn.x, y: spawn.y },
    exit: { x: HUB_CX, y: HUB_H - TILE },
    props: [],
    spawns: [],
    seed: 7171,
  };
}

/** The grid as text ('#' wall, '.' floor, 'x' blocked), for checking by eye. */
export function hubGridText(map: FloorMap): string {
  const rows: string[] = [];
  for (let y = 0; y < map.h; y++) {
    let r = '';
    for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y * map.w + x];
      r += t === FLOOR ? '.' : t === BLOCKED ? 'x' : '#';
    }
    rows.push(r);
  }
  return rows.join('\n');
}

let cached: HubScene | null = null;

/** The hub, painted once (cached): map, art layers, lights, stations. */
export function hubScene(): HubScene {
  if (cached) return cached;
  const art = buildHub();
  // Just above the steps, facing up the court at the shop.
  // Up in the court (out of every keeper's talking range), so the view opens with you near its middle.
  const spawn = { x: HUB_CX, y: HUB_STEPS_Y - 32, view: 'up' as View, dir: 1 as const };
  const people = [...art.stations.filter((s) => s.def), ...art.extras];
  cached = {
    w: HUB_W,
    h: HUB_H,
    bg: '#07060a',
    map: buildMap(art, spawn, people),
    spawn,
    ground: art.ground,
    sprites: art.sprites,
    emissive: art.emissive,
    fore: art.fore,
    lights: art.lights,
    ambient: { color: art.ambient, motes: art.motes },
    stations: art.stations,
    extras: art.extras,
    grade: art.grade,
  };
  return cached;
}
