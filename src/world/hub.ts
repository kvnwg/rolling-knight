/**
 * The painted hub: where you go between dives. A lamplit square at night in front of the Gilded Reel,
 * the summoning shop (its round reel sign glowing in the gable, string lights along the eaves, golden
 * display windows, the Oracle in the doorway). Round it, each keeper at their trade: the quartermaster
 * at her table by the tavern stall, the tinker in his chair under the upgrades board, the smith at his
 * forge, the junk dealer among her scrap bins, the sage on his bench among the sigil stones, the
 * priestess at the rebirth shrine, the notice board, and the warden at the top of the wooden steps
 * down to the dungeon (a portal glow at the bottom). Lush leaves frame it all.
 *
 * Everything is fixed and deterministic, painted once on first use (hubScene() caches it). Positions
 * are hub pixels (the same as world pixels; TILE = 16): the art covers HUB_W x HUB_H, and the
 * collision grid covers the same area with everything outside the square marked as wall.
 */
import type { PixelBuf } from '../render/pixel/buf';
import type { View } from './entities';
import { BLOCKED, FLOOR, SOLID, TILE, type FloorMap } from './mapgen';
import type { NpcDef } from './npcs';
import { buildHub } from '../render/art/hubScene';
import type { KeeperPose, KeeperTool } from '../render/art/hubNpcs';

export const HUB_W = 480;
export const HUB_H = 640;
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
 * The collision grid, one character per tile: '#' wall or void, '.' floor, 'x' floor with something
 * standing on it. 30 x 40 tiles.
 */
const GRID = [
  '##############################', // 0
  '##############################', // 1
  '##############################', // 2
  '##############################', // 3
  '##############################', // 4
  '##############################', // 5
  '##############################', // 6
  '##############################', // 7
  '##############################', // 8
  '##############################', // 9
  '###.....xx##########xx......##', // 10
  '###.....xx##########x.......##', // 11
  '###.........................##', // 12
  '###..xxx.................xx.##', // 13
  '###..xxx..............xx.xx.##', // 14
  '###...x...............xx....##', // 15
  '###.........................##', // 16
  '###.........................##', // 17
  '###.........................##', // 18
  '##xxxxx...x..........x..xxxx##', // 19
  '##xxxxxx...............xxxxx##', // 20
  '##..........................##', // 21
  '##..........................##', // 22
  '##..........................##', // 23
  '##..........................##', // 24
  '##..........................##', // 25
  '##.xxxx...............xxxxx.##', // 26
  '##.xxxx...............xxxxx.##', // 27
  '##..........................##', // 28
  '###.........................##', // 29
  '###......xx........xx......###', // 30
  '####.......................###', // 31
  '#####.....................####', // 32
  '#######..x...........x..######', // 33
  '##########............########', // 34
  '############......############', // 35
  '##############################', // 36
  '##############################', // 37
  '##############################', // 38
  '##############################', // 39
];

function buildMap(spawn: { x: number; y: number }): FloorMap {
  const w = HUB_COLS;
  const h = HUB_ROWS;
  const tiles = new Uint8Array(w * h);
  const pathMask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = GRID[y] ?? '';
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '#';
      tiles[y * w + x] = ch === '.' ? FLOOR : ch === 'x' ? BLOCKED : SOLID;
      pathMask[y * w + x] = ch === '#' ? 0 : 1;
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
    exit: { x: HUB_W / 2, y: 36 * TILE },
    props: [],
    spawns: [],
    seed: 7171,
  };
}

let cached: HubScene | null = null;

/** The hub, painted once (cached): map, art layers, lights, stations. */
export function hubScene(): HubScene {
  if (cached) return cached;
  const art = buildHub();
  const spawn = { x: 240, y: 536, view: 'up' as View, dir: 1 as const };
  cached = {
    w: HUB_W,
    h: HUB_H,
    bg: '#07060a',
    map: buildMap(spawn),
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
