/**
 * Puts the hub together: paints the ground, every standing piece (with its glowing parts and the
 * lights it carries), the framing leaves, and places the keepers. world/hub.ts wraps this with the
 * collision grid and caches it. All positions are hub pixels (480 x 640).
 */
import type { HubFigure, HubFore, HubGlow, HubGrade, HubLight, HubMotes, HubSprite, HubStation } from '../../world/hub';
import { bounds, crop, type PixelBuf } from '../pixel/buf';
import { paintHubGround, type GroundSpec, type ShadowSpec } from './hubGround';
import { vnoise, type Layer } from './hubKit';
import { paintShop } from './hubShop';
import { HUB_CAST } from './hubNpcs';
import { canopy, edgeGreens, fireflies, frontLeaves } from './hubFoliage';
import { barrelPiece, bench, cat, crateStack, gate, lampPost, lightString, noticeBoard, pottedPalm, sageCorner, scrapStall, shrine, smithy } from './hubStations';
import { chair, chalkboard, flowerBench, outfitterShelves, planter, pottedBush, stool, stumpTable, tavernStall } from './hubStalls';

/** Where a piece stands on the ground (blocks walking), hub pixels. */
export interface Foot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface HubArt {
  ground: PixelBuf;
  sprites: HubSprite[];
  emissive: HubGlow[];
  fore: HubFore[];
  lights: HubLight[];
  ambient: string;
  motes: HubMotes[];
  stations: HubStation[];
  extras: HubFigure[];
  grade: HubGrade;
  feet: Foot[];
}

/** Collects pieces as they are painted. */
export class HubOut {
  sprites: HubSprite[] = [];
  emissive: HubGlow[] = [];
  fore: HubFore[] = [];
  lights: HubLight[] = [];
  shadows: ShadowSpec[] = [];
  motes: HubMotes[] = [];
  feet: Foot[] = [];

  /**
   * A standing piece, sorted at `sort`; its glow (if any) and lights come with it. `foot` is the
   * ground it covers (default: its opaque width over the bottom few rows, `depth` px deep); null for
   * nothing (things hanging overhead, flat rugs).
   */
  piece(L: Layer, id: string, sort: number, foot?: Foot | null, depth = 8): void {
    const bb = bounds(L.buf);
    if (bb.w > 0) {
      const buf = crop(L.buf, bb.x, bb.y, bb.w, bb.h);
      const x = L.x0 + bb.x + Math.floor(bb.w / 2);
      this.sprites.push({ id, x, y: sort, buf, ax: x - (L.x0 + bb.x), ay: sort - (L.y0 + bb.y) });
      if (foot) this.feet.push(foot);
      else if (foot === undefined) {
        let x0 = Infinity;
        let x1 = -Infinity;
        for (let y = Math.max(0, sort - L.y0 - 4); y <= Math.min(L.h - 1, sort - L.y0); y++) {
          for (let xx = 0; xx < L.w; xx++) {
            if (!L.buf.px[(y * L.w + xx) * 4 + 3]) continue;
            x0 = Math.min(x0, xx + L.x0);
            x1 = Math.max(x1, xx + L.x0);
          }
        }
        if (x1 >= x0) this.feet.push({ x0: x0 + 1, y0: sort - depth, x1: x1 - 1, y1: sort });
      }
    }
    this.glowOf(L, id, sort);
    for (const l of L.lights) this.lights.push({ ...l });
  }

  glowOf(L: Layer, id: string, sort: number, frames?: PixelBuf[], fps?: number): void {
    const gb = bounds(L.glow);
    if (gb.w <= 0) return;
    const buf = crop(L.glow, gb.x, gb.y, gb.w, gb.h);
    let fr = frames?.map((f) => crop(f, gb.x, gb.y, gb.w, gb.h));
    if (!fr && L.twinkles.length) {
      // Blinking bulbs and fireflies: one frame per step of the longest cycle.
      const n = Math.max(...L.twinkles.map((t) => t.period));
      fr = [];
      for (let k = 0; k < n; k++) {
        const f = crop(L.glow, gb.x, gb.y, gb.w, gb.h);
        for (const t of L.twinkles) {
          if ((k + t.phase) % t.period < t.on) continue;
          for (let y = t.y - t.r; y <= t.y + t.r; y++) {
            for (let x = t.x - t.r; x <= t.x + t.r; x++) {
              const lx = x - L.x0 - gb.x;
              const ly = y - L.y0 - gb.y;
              if (lx < 0 || ly < 0 || lx >= gb.w || ly >= gb.h) continue;
              const i = (ly * gb.w + lx) * 4 + 3;
              f.px[i] = Math.round(f.px[i] * 0.3);
            }
          }
        }
        fr.push(f);
      }
      fps ??= 3;
    }
    this.emissive.push({ id: `${id}:glow`, x: L.x0 + gb.x, y: L.y0 + gb.y, buf, sort, ...(fr ? { frames: fr, fps: fps ?? 6 } : {}) });
  }

  /** Foreground leaves (drawn over everything). */
  front(L: Layer, id: string): void {
    const bb = bounds(L.buf);
    if (bb.w > 0) this.fore.push({ id, x: L.x0 + bb.x, y: L.y0 + bb.y, buf: crop(L.buf, bb.x, bb.y, bb.w, bb.h) });
    for (const l of L.lights) this.lights.push({ ...l });
  }
}

// ------------------------------------------------------------------ the ground's shape

/** The paving's left and right edges at a given height (they close in toward the steps at the bottom). */
function edgesAt(y: number): [number, number] {
  const wob = (vnoise(0, y, 1, 23, 9) - 0.5) * 6;
  const wob2 = (vnoise(5, y, 1, 19, 10) - 0.5) * 6;
  let l = 40 + wob;
  let r = 440 + wob2;
  if (y > 470) {
    const t = (y - 470) / 75;
    l += t * t * 150;
    r -= t * t * 150;
  }
  return [l, r];
}

const PAVE_TOP = 138;
const PAVE_BOTTOM = 553;

function paved(x: number, y: number): boolean {
  if (y < PAVE_TOP || y >= PAVE_BOTTOM) return false;
  const [l, r] = edgesAt(y);
  return x >= l && x <= r;
}

/** Ground you can walk on (before anything standing is taken out): the paving in front of the
 * buildings, and the top of the steps down. */
export function hubWalkable(x: number, y: number): boolean {
  if (y >= 180 && paved(x, y)) {
    const [l, r] = edgesAt(y);
    return x >= l + 6 && x <= r - 6;
  }
  return y >= PAVE_BOTTOM - 8 && y < PAVE_BOTTOM + 24 && x > 204 && x < 276;
}

function edgeDist(x: number, y: number): number {
  const [l, r] = edgesAt(y);
  return Math.min(x - l, r - x, y - PAVE_TOP, (PAVE_BOTTOM - y) * (Math.abs(x - 240) < 44 ? 6 : 1));
}

/** The keepers: where each stands (or sits), where you stand to talk, and what says what they do. */
const STATIONS: HubStation[] = [
  {
    id: 'altar', name: 'Oracle Vesper', job: 'The Gilded Reel: summon knights',
    greeting: 'Welcome to the Gilded Reel, dear. The reels never stop. Shall we see who turns up?',
    x: 240, y: 191, dir: 1, view: 'down', def: HUB_CAST.oracle, pose: 'stand', talk: { x: 240, y: 206 },
    sign: 'The shop itself: the big round reel sign glowing in the gable, the name in gold over the door.',
  },
  {
    id: 'squad', name: 'Quartermaster Hilde', job: 'Your squad: pick three and who leads',
    greeting: 'Three to a squad, dear. Pick who fights and who leads, and I\'ll see them fed and shod.',
    x: 100, y: 224, dir: 1, view: 'down', def: HUB_CAST.squad, pose: 'sit', tool: undefined, talk: { x: 116, y: 238 },
    sign: 'The chalkboard menu by the tavern stall, three little helmets chalked on it.',
  },
  {
    id: 'upgrades', name: 'Tinker Pell', job: 'Upgrades: spend gold on better everything',
    greeting: 'Faster reels, luckier spins, deeper pockets. All for a little gold. Have a look at the board.',
    x: 372, y: 212, dir: 1, view: 'down', def: HUB_CAST.upgrades, pose: 'sit', tool: 'wrench', talk: { x: 372, y: 228 },
    sign: 'The slate board of painted item icons over his shelves of jars.',
  },
  {
    id: 'smith', name: 'Brannoc the Smith', job: 'The smithy: level up and reforge knights',
    greeting: 'Shards and gold, and I\'ll beat any knight into something better. Mind the sparks.',
    x: 122, y: 350, dir: 1, view: 'down', def: HUB_CAST.smith, pose: 'stand', tool: 'hammer', talk: { x: 124, y: 368 },
    sign: 'The forge glowing under the lean-to, the anvil, crossed hammers on the hanging sign.',
  },
  {
    id: 'scrap', name: 'Rusty Mags', job: 'Scrap: break down or sell duplicates',
    greeting: 'Doubles? Spares? Bring them here. I\'ll break them into shards or pay you gold.',
    x: 350, y: 336, dir: 1, view: 'down', def: HUB_CAST.scrap, pose: 'stand', tool: 'tongs', talk: { x: 366, y: 350 },
    sign: 'The green-striped stall heaped with junk, the scrap bins and the brass scale.',
  },
  {
    id: 'perks', name: 'Sage Orrin', job: 'Sigils: perks for the reborn',
    greeting: 'You have been reborn. The sigils will listen to you now. Sit, and choose.',
    x: 96, y: 452, dir: 1, view: 'down', def: HUB_CAST.perks, pose: 'sit', talk: { x: 98, y: 472 },
    sign: 'The standing stones round his bench, their runes glowing teal.',
  },
  {
    id: 'rebirth', name: 'Sister Maren', job: 'The shrine: rebirth',
    greeting: 'Every ending is a door. Lay it all down here, and rise again stronger.',
    x: 362, y: 462, dir: 1, view: 'down', def: HUB_CAST.rebirth, pose: 'stand', tool: 'candle', talk: { x: 364, y: 478 },
    sign: 'The little stone shrine with the rose-gold rising sun, candles on its steps.',
  },
  {
    id: 'quests', name: 'Notice Board', job: 'Jobs and bounties',
    greeting: 'Help wanted. Some of it urgent. Some of it about a chicken.',
    x: 176, y: 512, dir: 1, view: 'down', def: null, pose: 'stand', talk: { x: 178, y: 528 },
    sign: 'The roofed board of pinned papers with a gold exclamation mark on top.',
  },
  {
    id: 'gate', name: 'Warden Tobb', job: 'The stairs down: into the dungeon',
    greeting: 'Stairs go down, monsters come up. Ready when you are.',
    x: 306, y: 550, dir: -1, view: 'down', def: HUB_CAST.gate, pose: 'stand', talk: { x: 296, y: 534 },
    sign: 'The arch over the wooden steps, DUNGEON on its sign, the violet glow at the bottom.',
  },
];

export function buildHub(): HubArt {
  const out = new HubOut();

  const ground: GroundSpec = {
    w: 480,
    h: 640,
    paved,
    edgeDist,
    soil: (x, y) => x < 26 || x > 454 || y < 70 || (y > 560 && Math.abs(x - 240) > 60),
    wear: { x: 240, half: 46, y0: 196, y1: 556 },
    decks: [{ x: 212, y: 186, w: 56, h: 13, riser: 3, seed: 31 }],
    mats: [{ x: 229, y: 190, w: 22, h: 5, colors: ['#3a1416', '#6a2224', '#9a3a2a', '#c8743a', '#e8b860'], seed: 5 }],
    steps: { x: 200, y: 553, w: 80, n: 7, tread: 9, riser: 5 },
    shadows: out.shadows,
    seed: 77,
  };

  canopy(out);
  paintShop(out);
  edgeGreens(out);
  frontLeaves(out);
  tavernStall(out);
  outfitterShelves(out);
  chalkboard(out, 152, 208);
  pottedBush(out, 56, 198, 3);
  pottedBush(out, 46, 184, 5, 0.8);
  chair(out, 100, 222, 'qmChair');
  stumpTable(out, 100, 238);
  stool(out, 98, 254, 'travellerStool');
  chair(out, 372, 212, 'tinkerChair');
  flowerBench(out, 420, 238);
  planter(out, 170, 222, 22, 81, ['#ff6a8a', '#ffd0e0', '#ffffff']);
  planter(out, 288, 222, 22, 82, ['#ffd84a', '#ff9a4a', '#ffffff']);
  smithy(out);
  scrapStall(out);
  sageCorner(out);
  shrine(out);
  noticeBoard(out, 176, 512);
  gate(out);
  cat(out, 262, 197);
  const lamps: Array<[number, number]> = [[176, 300], [304, 300], [176, 420], [304, 420]];
  const tops = lamps.map(([x, y], i) => lampPost(out, x, y, `lamp${i}`));
  lightString(out, tops[0], tops[1], 10, 300, 'string0');
  lightString(out, tops[2], tops[3], 10, 420, 'string1');
  lampPost(out, 404, 198, 'lampTinker', 30);
  lampPost(out, 70, 206, 'lampTavern', 30);
  planter(out, 188, 372, 18, 83, ['#ff8ab0', '#ffffff', '#ffd0e0']);
  planter(out, 274, 372, 18, 84, ['#b07aff', '#ffffff', '#ffd84a']);
  fireflies(out);
  bench(out, 112, 400, 'benchL');
  pottedPalm(out, 62, 392, 'palmL', 11);
  crateStack(out, 424, 384, 'cratesR');
  barrelPiece(out, 402, 392, 'barrelR', 7);
  barrelPiece(out, 330, 186, 'barrelShop', 9);
  pottedPalm(out, 152, 186, 'palmShop', 12);
  const lights: HubLight[] = out.lights;
  // Placeholder lights while the pieces are built.

  return {
    ground: paintHubGround(ground),
    sprites: out.sprites,
    emissive: out.emissive,
    fore: out.fore,
    lights,
    ambient: '#544a6a',
    motes: out.motes,
    stations: STATIONS,
    extras: [{ def: HUB_CAST.traveller, x: 98, y: 254, dir: 1, view: 'up', pose: 'sit', tool: 'cup' }],
    feet: out.feet,
    grade: {
      haze: [0.12, 0.1, 0.2],
      hazeAmount: 0.05,
      shadowTint: [0.9, 0.92, 1.18],
      highlightTint: [1.12, 1.0, 0.84],
      saturation: 1.15,
      contrast: 1.06,
      vignette: 0.62,
      bloom: 0.8,
    },
  };
}
