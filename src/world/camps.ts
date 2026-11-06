/**
 * Folk keep a set-up of their own, in the setting's own style: a market stall under a striped awning
 * in the hamlet, a hay cart and a produce stand by the farm's fences, a canvas tent with a campfire and
 * a log seat in Gloomwood, a hide tent, a woodpile and a fire bowl on the tundra, a candlelit shrine in
 * an alcove of the crypt, a hut on stilts with a boat pulled up in the bog, a canopy over a rug and
 * jars in the ruins, a bench and a lantern by a cemetery gate, a smith's cart, an anvil and a glowing
 * fire bowl in the Ember Depths, a lean-to lit by a crystal lamp in the grotto, and a little roofed
 * stall hung with paper lanterns at the shrine. (The art is render/art/camps.ts.)
 *
 * A set-up stands with its back to a wall, off the fighting: best in a nook of its own cut into the
 * wall beside the start room (nothing spawns there), else beside a side room, else in a quiet corner,
 * never on a corridor's line, never where it would cut the floor in two. It blocks the tiles it
 * stands on, keeps the row in front of it open to stand and talk from, and the mobs that would have
 * spawned beside it move off elsewhere.
 */
import { Rng } from '../core/rng';
import type { BiomeId, PropKind } from './biomes';
import { houseLayout } from './decor';
import { BLOCKED, FLOOR, LIQUID, SOLID, TILE, bfs, tileAt, type FloorMap, type Room } from './mapgen';

export interface CampPiece {
  kind: PropKind;
  /** Its base (where it stands), in px from the plan's top-left corner. */
  x: number;
  y: number;
  solid: boolean;
}

/**
 * A set-up, tile by tile, from the back row (against the wall) to the front: '#' the set-up stands
 * here (blocked); 'N' the keeper stands here behind a counter (blocked too); 'n' the keeper stands here
 * on open floor; '.' kept open (the last row: where you stand to talk).
 */
export interface CampPlan {
  rows: readonly string[];
  pieces: readonly CampPiece[];
  /** Where the keeper's feet are, in px from the plan's top-left corner. */
  stand: { x: number; y: number };
  /**
   * Under a roof over the counter (a stall, a yatai, a canopy): where the merchant (drawn in the
   * keepers' style, a head taller than the folk on the little mannequin) stands instead, a step nearer
   * the counter, so her whole face shows under the roof's edge.
   */
  tallStand?: { x: number; y: number };
}

/** A set-up pitched on a floor. */
export interface Camp {
  biome: BiomeId;
  /** The plan's top-left tile and its size in tiles (the open row in front included). */
  tx: number;
  ty: number;
  w: number;
  h: number;
  /** The room it's in or opens onto (index in map.rooms; -1 none). */
  room: number;
  /** It stands in a nook of its own, cut into the wall. */
  nook: boolean;
  /** Where the keeper stands, and the spot in front of the set-up to talk to them from (world px). */
  stand: { x: number; y: number };
  talk: { x: number; y: number };
  /** Where a tall keeper stands (the plan's tallStand, else the stand). */
  tallStand: { x: number; y: number };
}

const piece = (kind: PropKind, x: number, y: number, solid = true): CampPiece => ({ kind, x, y, solid });

/**
 * Every biome's set-up. Three tiles wide and two deep, with an open row in front. (Piece bases are
 * where they meet the ground, which also orders them against the keeper: a stall's back is drawn
 * behind its keeper, its counter in front.)
 */
export const CAMP_PLANS: Readonly<Record<BiomeId, CampPlan>> = {
  hamlet: { rows: ['###', '#N#', '...'], pieces: [piece('stallBack', 24, 14), piece('stallFront', 24, 31)], stand: { x: 24, y: 20 }, tallStand: { x: 24, y: 26 } },
  farmland: { rows: ['###', '.n.', '...'], pieces: [piece('hayCart', 17, 14), piece('produceStand', 39, 14)], stand: { x: 25, y: 25 } },
  forest: { rows: ['###', '#n#', '...'], pieces: [piece('canvasTent', 20, 14), piece('logSeat', 8, 29), piece('campfire', 40, 28)], stand: { x: 24, y: 25 } },
  tundra: { rows: ['###', '#n#', '...'], pieces: [piece('hideTent', 21, 14), piece('woodpile', 8, 29), piece('fireBowl', 40, 29)], stand: { x: 24, y: 25 } },
  dungeon: { rows: ['###', '#n#', '...'], pieces: [piece('shrineNiche', 24, 14), piece('fireBowl', 40, 29)], stand: { x: 24, y: 26 } },
  crypt: { rows: ['###', '.n.', '...'], pieces: [piece('shrineNiche', 24, 14)], stand: { x: 24, y: 26 } },
  swamp: { rows: ['###', '#n.', '...'], pieces: [piece('stiltHut', 24, 14), piece('rowboat', 10, 29)], stand: { x: 27, y: 25 } },
  desert: { rows: ['###', '#n#', '...'], pieces: [piece('canopyBack', 24, 16), piece('rug', 24, 17, false), piece('canopyFront', 24, 30)], stand: { x: 24, y: 24 }, tallStand: { x: 24, y: 27 } },
  graveyard: { rows: ['###', '#n#', '...'], pieces: [piece('graveGate', 24, 14), piece('stoneBench', 8, 29), piece('lanternPost', 37, 30)], stand: { x: 24, y: 25 } },
  ember: { rows: ['###', '#n#', '...'], pieces: [piece('smithCart', 20, 14), piece('anvil', 8, 29), piece('fireBowl', 40, 29)], stand: { x: 24, y: 25 } },
  crystal: { rows: ['###', '.n#', '...'], pieces: [piece('leanTo', 20, 14), piece('crystalLamp', 40, 30)], stand: { x: 23, y: 25 } },
  shrine: { rows: ['###', '#N#', '...'], pieces: [piece('yataiBack', 24, 14), piece('yataiFront', 24, 31)], stand: { x: 24, y: 20 }, tallStand: { x: 24, y: 26 } },
};

/** Every piece kind a set-up can be built from. */
export const CAMP_PIECES: ReadonlySet<PropKind> = new Set(Object.values(CAMP_PLANS).flatMap((p) => p.pieces.map((x) => x.kind)));

export function campPlan(biomeId: string): CampPlan {
  return CAMP_PLANS[biomeId as BiomeId] ?? CAMP_PLANS.hamlet;
}

// ------------------------------------------------------------------ finding a spot

/** Things big enough that a set-up shouldn't crowd them (or stand in front of them). */
const CROWD: ReadonlySet<string> = new Set([
  'ruinWall', 'stall', 'fountain', 'wellStone', 'well', 'stairs', 'noticeBoard', 'signpost', 'cafeTable', 'stringPost', 'scarecrow', 'statue',
  'tent', 'campfire', 'bridgeRail', ...CAMP_PIECES,
]);

/** How far a set-up keeps the mobs (px from its middle). */
export const CAMP_CLEAR = 88;

const ROOM_SCORE: Record<Room['kind'], number> = { start: 120, side: 80, normal: 30, exit: -30, arena: -400 };

interface Site {
  tx: number;
  ty: number;
  room: number;
  score: number;
  /** Wall tiles it cuts its nook out of. */
  carve: number[];
}

/** The room a tile belongs to: the nearest (relative to its size) whose bounds take it in, or -1. */
function roomAt(rooms: readonly Room[], tx: number, ty: number): number {
  let best = -1;
  let bd = Infinity;
  rooms.forEach((r, i) => {
    const dx = (tx - r.cx) / (r.rx + 1.5);
    const dy = (ty - r.cy) / (r.ry + 2);
    const d = dx * dx + dy * dy;
    if (Math.abs(tx - r.cx) <= r.rx + 1 && Math.abs(ty - r.cy) <= r.ry + 2 && d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

function connected(m: FloorMap): boolean {
  const d = bfs(m, Math.floor(m.start.x / TILE), Math.floor(m.start.y / TILE));
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === FLOOR && d[i] < 0) return false;
  return true;
}

/** The middle of a camp's footprint (world px). */
export function campMiddle(c: Pick<Camp, 'tx' | 'ty' | 'w' | 'h'>): { x: number; y: number } {
  return { x: (c.tx + c.w / 2) * TILE, y: (c.ty + (c.h - 1) / 2) * TILE };
}

/**
 * Every spot on the floor the biome's set-up fits, scored. Two sorts: a nook it cuts into the wall,
 * opening onto a room (out of the way of everything), or a spot on the floor with its back to the
 * wall. The start room first (nothing spawns there), then side rooms, then quiet corners of the rest,
 * away from the mobs. `strict`: clear of big things and trees, its back to solid wall; relaxed, just
 * somewhere it fits.
 */
function sites(m: FloorMap, plan: CampPlan, rng: Rng, others: readonly Camp[], pass: 0 | 1 | 2): Site[] {
  const strict = pass === 0;
  const w = plan.rows[0].length;
  const h = plan.rows.length;
  const rooms = m.rooms;
  const startRoom = rooms.find((r) => r.kind === 'start');
  const exitRoom = rooms.find((r) => r.kind === 'exit');
  const nearCenter = (x: number, y: number) => [startRoom, exitRoom].some((r) => r && Math.abs(x - r.cx) <= 2 && Math.abs(y - r.cy) <= 2);
  // The road's line through a corridor stays clear; across a room's square it may be built on.
  const inRoom = (x: number, y: number) => rooms.some((r) => Math.abs(x - r.cx) <= r.rx && Math.abs(y - r.cy) <= r.ry);
  const corridor = (x: number, y: number) => !!m.route?.[y * m.w + x] && (pass === 2 ? false : !inRoom(x, y));
  const mobs = m.spawns.filter((s) => !s.boss);
  // Big things and trees, by the tile their foot stands on.
  const crowd: Array<[number, number]> = [];
  const trees: Array<[number, number]> = [];
  // Houses' doors: the tile of the street in front of each.
  const doors: Array<[number, number]> = [];
  for (const p of m.props) {
    const at: [number, number] = [Math.floor(p.x / TILE), Math.floor((p.y - 1) / TILE)];
    if (p.kind === 'tree') trees.push(at);
    else if (p.kind === 'house') {
      const L = houseLayout(p.seed % 5);
      doors.push([Math.floor((p.x - L.tiles * 8 + L.door) / TILE), at[1] + 1]);
    } else if (CROWD.has(p.kind)) crowd.push(at);
  }
  const wall = (x: number, y: number) => tileAt(m, x, y) === SOLID;
  const out: Site[] = [];
  for (let ty = 3; ty < m.h - h - 2; ty++) {
    for (let tx = 2; tx < m.w - w - 2; tx++) {
      // Its back to the wall (or, at a pinch, to water; as a last resort to anything but open floor).
      let ok = true;
      for (let c = 0; c < w && ok; c++) {
        const t = tileAt(m, tx + c, ty - 1);
        if (pass === 0 ? t !== SOLID : pass === 1 ? t !== SOLID && t !== LIQUID : t === FLOOR) ok = false;
      }
      if (!ok) continue;
      let onPath = 0;
      const carve: number[] = [];
      for (let r = 0; r < h && ok; r++) {
        for (let c = 0; c < w && ok; c++) {
          const ch = plan.rows[r][c];
          const x = tx + c;
          const y = ty + r;
          const i = y * m.w + x;
          const t = tileAt(m, x, y);
          if (t === SOLID) {
            // Cut out of the wall: never through a house's lot, a fence, a canal or a waterfall.
            if (m.reserved?.[i] || m.canal?.[i]) ok = false;
            else carve.push(i);
          } else if (t !== FLOOR || m.field?.[i]) ok = false;
          else if (ch !== '.' && (corridor(x, y) || nearCenter(x, y))) ok = false;
          else if (ch !== '.' && (m.path[i] || m.route?.[i])) onPath += m.route?.[i] ? 2 : 1;
        }
      }
      if (!ok) continue;
      if (carve.length) {
        // A nook: solid wall behind it and beside it (never a shortcut into the next room), opening
        // onto the floor in front along most of its width.
        for (let c = -1; c <= w && ok; c++) if (!wall(tx + c, ty - 1) || !wall(tx + c, ty - 2)) ok = false;
        for (let r = 0; r < h - 1 && ok; r++) if (!wall(tx - 1, ty + r) || !wall(tx + w, ty + r)) ok = false;
        let open = 0;
        for (let c = 0; c < w; c++) if (tileAt(m, tx + c, ty + h - 1) === FLOOR || tileAt(m, tx + c, ty + h) === FLOOR) open++;
        if (open < 2 || !ok) continue;
      }
      const stand = { x: tx * TILE + plan.stand.x, y: ty * TILE + plan.stand.y };
      if (Math.hypot(stand.x - m.start.x, stand.y - m.start.y) < 36) continue;
      if (Math.hypot(stand.x - m.exit.x, stand.y - m.exit.y) < 64) continue;
      // Clear of other set-ups.
      if (others.some((o) => tx < o.tx + o.w + 1 && tx + w + 1 > o.tx && ty < o.ty + o.h + 1 && ty + h + 1 > o.ty)) continue;
      if (others.some((o) => Math.hypot(o.stand.x - stand.x, o.stand.y - stand.y) < 96)) continue;
      // The room it stands in, or the one its nook opens onto.
      const room = roomAt(rooms, tx + Math.floor(w / 2), ty + h - (carve.length ? 0 : 2));
      // Never across a house's door, never crowding a fountain, a ruin or another stall.
      if (pass < 2 && doors.some(([x, y]) => x >= tx - 1 && x <= tx + w && y >= ty - 2 && y <= ty)) continue;
      if (pass < 2 && crowd.some(([x, y]) => x >= tx - 1 && x <= tx + w && y >= ty - 3 && y <= ty + h)) continue;
      if (strict) {
        if (room < 0) continue;
        // No tree just in front of a spot on the floor, its crown over the set-up (a nook clears its own).
        if (!carve.length && trees.some(([x, y]) => x >= tx - 1 && x <= tx + w && y >= ty && y <= ty + h + 2)) continue;
      }
      const r = room >= 0 ? rooms[room] : null;
      const mid = { x: (tx + w / 2) * TILE, y: (ty + (h - 1) / 2) * TILE };
      let dMob = 200;
      for (const s of mobs) dMob = Math.min(dMob, Math.hypot(s.x - mid.x, s.y - mid.y));
      let score = r ? ROOM_SCORE[r.kind] : -60;
      // A nook of its own is best; else toward a corner, off the middle of the room.
      if (carve.length >= 3) score += 30;
      else if (r) score += Math.min(1, Math.abs(tx + w / 2 - (r.cx + 0.5)) / Math.max(2, r.rx)) * 25;
      score += Math.min(dMob, 140) * 0.25 - onPath * 6 + rng.next() * 15;
      if (others.some((o) => o.room === room)) score -= 40;
      out.push({ tx, ty, room, score, carve });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.ty - b.ty || a.tx - b.tx);
}

// ------------------------------------------------------------------ pitching it

/**
 * Pitches the biome's set-up somewhere on the floor (see the top of the file) and returns it, or null
 * when nothing fits. Changes the map: its nook is cut out of the wall, its tiles are blocked, its
 * pieces added to the props, the ground under it cleared of little things (and of trees that would
 * hide it), and mobs that would spawn beside it moved off.
 */
export function pitchCamp(m: FloorMap, biomeId: string, rng: Rng, others: readonly Camp[] = []): Camp | null {
  const plan = campPlan(biomeId);
  for (const pass of [0, 1, 2] as const) {
    for (const s of sites(m, plan, rng, others, pass).slice(0, 24)) {
      const camp = build(m, plan, biomeId as BiomeId, s, rng);
      if (camp) {
        clearSpawns(m, camp, [...others, camp], rng);
        return camp;
      }
    }
  }
  return null;
}

function build(m: FloorMap, plan: CampPlan, biome: BiomeId, s: Site, rng: Rng): Camp | null {
  const w = plan.rows[0].length;
  const h = plan.rows.length;
  const before = new Map<number, number>();
  for (const i of s.carve) {
    before.set(i, m.tiles[i]);
    m.tiles[i] = FLOOR;
  }
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = plan.rows[r][c];
      if (ch !== '#' && ch !== 'N') continue;
      const i = (s.ty + r) * m.w + s.tx + c;
      if (m.tiles[i] !== FLOOR) continue;
      if (!before.has(i)) before.set(i, FLOOR);
      m.tiles[i] = BLOCKED;
    }
  }
  if (!connected(m)) {
    for (const [i, t] of before) m.tiles[i] = t;
    return null;
  }
  // A nook's ground is the same as the floor it opens onto.
  const pathBelow = m.path[Math.min(m.h - 1, s.ty + h) * m.w + s.tx + 1] ?? 0;
  for (const i of s.carve) m.path[i] = pathBelow;
  const x0 = s.tx * TILE;
  const y0 = s.ty * TILE;
  // The ground it stands on is cleared of little things, a wall torch right behind comes down (the
  // set-up brings its own light), and so do trees in its nook or beside it (their crowns would hide it).
  const solidAt = (tx: number, ty: number, not: unknown) => m.props.some((q) => q !== not && q.solid && Math.floor(q.x / TILE) === tx && Math.floor((q.y - 1) / TILE) === ty);
  m.props = m.props.filter((p) => {
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor((p.y - 1) / TILE);
    // (The woods behind its back wall stay; in front, a clearing a few rows deep, where you stand.)
    const front = ty >= s.ty + h ? 1 : 0;
    if (p.kind === 'tree' && s.carve.length && tx >= s.tx - 1 - front && tx <= s.tx + w + front && ty >= s.ty && ty <= s.ty + h + 2) {
      const i = ty * m.w + tx;
      if (m.tiles[i] === BLOCKED && !before.has(i) && !solidAt(tx, ty, p)) m.tiles[i] = FLOOR;
      return false;
    }
    if (tx < s.tx || tx >= s.tx + w) return true;
    if (p.kind === 'torch' && ty === s.ty - 1) return false;
    return p.solid || ty < s.ty || ty >= s.ty + h;
  });
  for (const pc of plan.pieces) m.props.push({ kind: pc.kind, x: x0 + pc.x, y: y0 + pc.y, solid: pc.solid, seed: rng.int(0, 1 << 30) });
  const stand = { x: x0 + plan.stand.x, y: y0 + plan.stand.y };
  const tallStand = plan.tallStand ? { x: x0 + plan.tallStand.x, y: y0 + plan.tallStand.y } : stand;
  return { biome, tx: s.tx, ty: s.ty, w, h, room: s.room, nook: s.carve.length > 0, stand, talk: { x: stand.x, y: (s.ty + h - 1) * TILE + 6 }, tallStand };
}

/**
 * Mobs that would spawn near a set-up go elsewhere: to open floor in their own room well away from
 * every set-up, else the nearest room with such floor (never the start room); none left, they don't come.
 */
function clearSpawns(m: FloorMap, camp: Camp, camps: readonly Camp[], rng: Rng): void {
  const mid = campMiddle(camp);
  const far = (x: number, y: number) =>
    camps.every((c) => {
      const cm = campMiddle(c);
      return Math.hypot(cm.x - x, cm.y - y) >= CAMP_CLEAR + 8;
    });
  const gone = new Set<number>();
  m.spawns.forEach((s, si) => {
    if (s.boss || Math.hypot(s.x - mid.x, s.y - mid.y) >= CAMP_CLEAR) return;
    const order = m.rooms
      .map((r, ri) => ({ r, ri, d: ri === s.room ? -1 : Math.hypot(r.cx * TILE - s.x, r.cy * TILE - s.y) }))
      .filter(({ r }) => r.kind !== 'start' && r.kind !== 'arena')
      .sort((a, b) => a.d - b.d);
    for (const { r, ri } of order) {
      const spots: Array<[number, number]> = [];
      for (let ty = r.cy - r.ry + 1; ty <= r.cy + r.ry - 1; ty++) {
        for (let tx = r.cx - r.rx + 1; tx <= r.cx + r.rx - 1; tx++) {
          if (tileAt(m, tx, ty) !== FLOOR) continue;
          const x = tx * TILE + 8;
          const y = ty * TILE + 8;
          if (!far(x, y)) continue;
          if (m.spawns.some((o, oi) => oi !== si && !gone.has(oi) && Math.hypot(o.x - x, o.y - y) < 14)) continue;
          spots.push([x, y]);
        }
      }
      if (!spots.length) continue;
      const [x, y] = spots[rng.int(0, spots.length - 1)];
      s.x = x;
      s.y = y;
      s.room = ri;
      return;
    }
    gone.add(si);
  });
  if (gone.size) m.spawns = m.spawns.filter((_, i) => !gone.has(i));
}
