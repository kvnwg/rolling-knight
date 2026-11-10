/**
 * Dressing the Dungeon's rooms with the packs' things (render/packs/dungeonProps.ts draws them):
 * on the north walls' faces, torches, banners, rings and a cell door; torches leaning out of the side
 * walls; cobwebs in the corners; barrels, crates, pots and chests heaped against the walls; a cabinet
 * or a suit of armor against the back wall; a pedestal in a big room; candles and
 * candlesticks that light the floor; coins, rubble and bones scattered about. Then
 * the traps (traps.ts). Things on the floor never cut it in two (decor.ts checks), and keep off the
 * halls' middle line and the start and the exit; the boss's arena gets only its torches and banners.
 */
import type { PropKind } from './biomes';
import { cluster, free, solidProp, type DecorCtx } from './decor';
import { dungeonLook } from './dungeonLook';
import { SOLID, TILE, tileAt, type Room } from './mapgen';
import { DUNGEON_TRAPS, placeTraps } from './traps';

export function dressDungeon(c: DecorCtx): void {
  const { m, rng } = c;
  const W = m.w;
  const blue = dungeonLook(m.seed) === 'blue';
  const solid = (x: number, y: number) => tileAt(m, x, y) === SOLID;
  const face = (x: number, y: number) => solid(x, y) && !solid(x, y + 1);
  // Wall tiles that already hold something (the floor generator's torches come first).
  const wallTaken = new Set<number>();
  for (const p of m.props) if (p.kind === 'torch') wallTaken.add(Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE));
  /** A prop whose variant the art reads from its seed (seed % 5). */
  const put = (kind: PropKind, x: number, y: number, v: number) => m.props.push({ kind, x, y, solid: false, seed: rng.int(0, 1 << 24) * 5 + v });
  const onWall = (kind: PropKind, tx: number, ty: number, v: number) => {
    wallTaken.add(ty * W + tx);
    put(kind, tx * TILE + 8, ty * TILE + 15, v);
  };
  // A slot on a face for something tall (the blue walls carry it on the cap above too).
  const slot = (tx: number, ty: number, tall = false) => face(tx, ty) && !wallTaken.has(ty * W + tx) && (!tall || (solid(tx, ty - 1) && solid(tx, ty - 2)));

  for (const r of c.rooms) {
    const x0 = r.cx - r.rx;
    const x1 = r.cx + r.rx;
    const y0 = r.cy - r.ry;
    const top = y0 - 1;
    // --- the north wall: a door (a cell, a storeroom), torches, banners, a ring or two
    if (r.kind !== 'start' && r.kind !== 'arena' && rng.chance(0.6)) {
      const xs: number[] = [];
      for (let x = x0 + 1; x < x1 - 1; x++) if (slot(x, top, blue) && slot(x + 1, top, blue)) xs.push(x);
      if (xs.length) {
        const x = rng.pick(xs);
        wallTaken.add(top * W + x);
        wallTaken.add(top * W + x + 1);
        put(blue ? 'blueDoor' : 'cellDoor', (x + 1) * TILE, top * TILE + 15, rng.int(0, 4));
      }
    }
    const lit = m.props.filter((p) => p.kind === 'torch' && Math.floor(p.y / TILE) === top && p.x >= x0 * TILE && p.x < (x1 + 1) * TILE).length;
    // (The boss's arena is wide: a torch every few tiles along its back wall.)
    for (const f of r.kind === 'arena' ? [0.1, 0.3, 0.5, 0.7, 0.9] : lit ? [] : r.rx >= 5 ? [0.3, 0.7] : [0.5]) {
      const x = Math.round(x0 + (x1 - x0) * f);
      for (const dx of [0, 1, -1, 2, -2]) {
        if (!slot(x + dx, top)) continue;
        onWall('torch', x + dx, top, 0);
        break;
      }
    }
    const banners = rng.int(r.rx >= 5 ? 1 : 0, 2);
    for (let k = 0, tries = 0; k < banners && tries < 12; tries++) {
      const x = rng.int(x0, x1);
      if (!slot(x, top, blue) || wallTaken.has(top * W + x - 1) || wallTaken.has(top * W + x + 1)) continue;
      onWall(blue ? 'hangingBanner' : 'wallBanner', x, top, rng.int(0, 4));
      k++;
    }
    if (!blue && rng.chance(0.5)) {
      const x = rng.int(x0, x1);
      if (slot(x, top)) onWall('wallRing', x, top, rng.int(0, 4));
    }
    // --- torches leaning out of the side walls of tall rooms (the purple stone's thin rims)
    if (!blue && r.ry >= 3) {
      for (const [wx, v] of [[x0 - 1, 0], [x1 + 1, 1]] as const) {
        const y = r.cy + rng.int(-1, 1);
        if (!solid(wx, y) || solid(wx + (v ? -1 : 1), y) || wallTaken.has(y * W + wx) || !rng.chance(0.7)) continue;
        wallTaken.add(y * W + wx);
        put('sideTorch', wx * TILE + 8, y * TILE + 15, v);
      }
    }
    // --- cobwebs in the corners
    for (const [cx, cy, side] of [[x0, y0, -1], [x1, y0, 1]] as const) {
      if (solid(cx, cy) || !solid(cx, cy - 1) || !solid(cx + side, cy) || !rng.chance(0.55)) continue;
      put('cobweb', cx * TILE + 8, cy * TILE, side < 0 ? (rng.chance(0.7) ? 0 : 3) : rng.chance(0.6) ? 1 : 2);
    }
  }

  // --- the traps, before the furniture (so heaps keep off them)
  placeTraps(c, DUNGEON_TRAPS);

  // The arena is kept clear for the fight.
  for (const r of c.rooms) if (r.kind !== 'arena') dressRoom(c, r, blue, wallTaken);
}

/** One room's furniture: heaps against the walls, something tall at the back, lights, scatter. */
function dressRoom(c: DecorCtx, r: Room, blue: boolean, wallTaken: ReadonlySet<number>): void {
  const { m, rng } = c;
  const x0 = r.cx - r.rx;
  const x1 = r.cx + r.rx;
  const y0 = r.cy - r.ry;
  const y1 = r.cy + r.ry;
  const solid = (x: number, y: number) => tileAt(m, x, y) === SOLID;
  const byWall = (x: number, y: number) => solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
  const route = (x: number, y: number) => !!m.route?.[y * m.w + x];
  // Floor tiles along the walls, off the halls' line.
  const edge: Array<[number, number]> = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (free(c, x, y) && byWall(x, y) && !route(x, y)) edge.push([x, y]);
  rng.shuffle(edge);
  const start = r.kind === 'start';
  // --- heaps against the walls
  const heaps: PropKind[][] = blue
    ? [['barrel', 'barrel'], ['pot', 'pot'], ['barrel', 'pot'], ['crate'], ['chest'], ['pot']]
    : [['barrel', 'crate'], ['crate', 'crate'], ['barrel', 'barrel', 'crate'], ['pot', 'pot'], ['chest'], ['crate']];
  let n = start ? 1 : rng.int(2, 3 + (r.rx * r.ry > 30 ? 1 : 0));
  for (const [x, y] of edge) {
    if (n <= 0) break;
    if (!free(c, x, y)) continue;
    const pick = rng.pick(heaps);
    if (pick.length > 1 ? cluster(c, x, y, pick, true) : solidProp(c, pick[0], x, y, 0, 0, undefined, true)) n--;
  }
  // --- something tall against the back wall
  if (!start && rng.chance(0.55)) {
    for (let k = 0; k < 10; k++) {
      const x = rng.int(x0, x1);
      // Not in front of a door, a banner or a torch.
      if (!solid(x, y0 - 1) || route(x, y0) || [-1, 0, 1].some((d) => wallTaken.has((y0 - 1) * m.w + x + d))) continue;
      if (solidProp(c, rng.pick((blue ? ['cabinet', 'armor'] : ['armor']) as PropKind[]), x, y0, 0, 0, undefined, true)) break;
    }
  }
  // --- a centerpiece in a big room
  if (r.kind === 'normal' && r.rx * r.ry >= 24 && rng.chance(0.6)) {
    for (let k = 0; k < 12; k++) {
      const x = r.cx + rng.int(-r.rx + 2, r.rx - 2);
      const y = r.cy + rng.int(-r.ry + 2, r.ry - 1);
      if (route(x, y) || byWall(x, y)) continue;
      if (solidProp(c, 'pedestal', x, y, 0, 0, undefined, true)) break;
    }
  }
  // --- lights on the floor, and the small things
  // (No flasks on the floor: they read as potions to pick up. Coins on the floor are real gold: world.ts.
  // No loose swords and no dragon skulls either: with nothing round them they looked dropped there by mistake.)
  const loose: Array<[PropKind, number]> = [['candles', 3], ['candlestick', 2], ['coins', 1], ['bones', 2], ['rubble', 2]];
  let lights = 0;
  let things = start ? 2 : rng.int(3, 6);
  const once = new Set<PropKind>();
  for (let k = 0; k < 40 && things > 0; k++) {
    const x = rng.int(x0, x1);
    const y = rng.int(y0, y1);
    if (!free(c, x, y)) continue;
    let kind = rng.weighted(loose);
    // Every room gets a light or two; a hall's line keeps clear of candles.
    if (lights < 1 && byWall(x, y)) kind = rng.chance(0.5) ? 'candles' : 'candlestick';
    const light = kind === 'candles' || kind === 'candlestick';
    if (light && (route(x, y) || lights >= 2)) continue;
    // A few coins on the floor are a find: once in a room at most.
    if (kind === 'coins' && once.has(kind)) continue;
    once.add(kind);
    if (light) lights++;
    c.occupied.add(y * m.w + x);
    m.props.push({ kind, x: x * TILE + 8 + rng.int(-3, 3), y: y * TILE + 9 + rng.int(-2, 3), solid: false, seed: rng.int(0, 1 << 30) });
    things--;
  }
}
