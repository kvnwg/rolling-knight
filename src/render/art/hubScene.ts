/**
 * Puts the hub together: one cozy shop front at night, painted to fill a phone held upright. The
 * Gilded Reel's timber front under its dark roof across the top (the reel sign glowing in the gable,
 * the lit window, the open door with the Oracle in it, the curio cabinet with the broker before it,
 * the notice board, the tinker's shelves); a short court of big warm flagstones in front of it with
 * the quartermaster's round table, the sage in his chair, the priestess at her candle shrine and the
 * smith's anvil and coals, every bit of floor next to something; the dark stone steps going down at
 * the foot of the court, the warden beside them; lush leaves framing it all, going dark toward the
 * edges.
 *
 * It paints the ground, every standing piece (with its glowing parts and the lights it carries), the
 * framing leaves, and places the keepers; world/hub.ts wraps this with the collision grid and caches
 * it. All positions are hub pixels (HUB_ART_W x HUB_ART_H): the court is the middle 168 px or so, and
 * past it leaves and the roof fill out what a wide screen shows.
 */
import type { HubFigure, HubFore, HubGlow, HubGrade, HubLight, HubMotes, HubSprite, HubStation } from '../../world/hub';
import { bounds, crop, type PixelBuf } from '../pixel/buf';
import { paintHubGround, type GroundSpec, type ShadowSpec } from './hubGround';
import { vnoise, type Layer } from './hubKit';
import { paintShop, SHOP } from './hubShop';
import { HUB_CAST } from './hubNpcs';
import { canopy, courtGreens, edgeGreens, fireflies, frontLeaves, stepsGarden } from './hubFoliage';
import { barrelPiece, cat, chair, crates, flowerPot, GLAZE, postLamp, pottedBush, pottedPlant, roundTable, sageChair, scrapCrate, stool } from './hubStalls';
import { shrine, sigilStone, smithNook, stepsHead } from './hubStations';

/** The painting's size (hub px): a phone's screen of court and shop, leaves and roof round it. */
export const HUB_ART_W = 256;
export const HUB_ART_H = 336;

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
  piece(L: Layer, id: string, sort: number, foot?: Foot | null, depth = 6): void {
    const bb = bounds(L.buf);
    if (bb.w > 0) {
      const buf = crop(L.buf, bb.x, bb.y, bb.w, bb.h);
      const x = L.x0 + bb.x + Math.floor(bb.w / 2);
      this.sprites.push({ id, x, y: sort, buf, ax: x - (L.x0 + bb.x), ay: sort - (L.y0 + bb.y) });
      if (foot) this.feet.push(foot);
      else if (foot === undefined) {
        let x0 = Infinity;
        let x1 = -Infinity;
        for (let y = Math.max(0, sort - L.y0 - 3); y <= Math.min(L.h - 1, sort - L.y0); y++) {
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

// ------------------------------------------------------------------ the court's shape

/** The court's middle: the door, the walk up the court and the steps all line up on it. */
export const HUB_CX = 128;
/** The shop's front wall stands on this line: the court begins below it. */
const FRONT = SHOP.front;
/** The curb along the foot of the court, where the steps go down. */
const CURB = 240;
/** The steps down: their left edge, width, how many, and each one's tread and riser. */
const STEPS = { x: 108, y: CURB, w: 40, n: 9, tread: 6, riser: 4 };
/** A little stone landing beside the head of the steps, where the warden keeps watch. */
const LANDING = { x0: 155, x1: 180, y1: CURB + 15 };

/** Where the dungeon takes you, walking down the steps (feet, hub px). */
export const HUB_DESCEND_Y = 268;
/** Where the steps begin (feet): below this, the court darkens as you go down. */
export const HUB_STEPS_Y = CURB + 2;

/** The paving's left and right edges at a given height (wandering a little; leaves grow over them). */
function edgesAt(y: number): [number, number] {
  const wob = (vnoise(0, y, 1, 17, 9) - 0.5) * 4;
  const wob2 = (vnoise(5, y, 1, 15, 10) - 0.5) * 4;
  return [46 + wob, 210 + wob2];
}

function paved(x: number, y: number): boolean {
  if (y >= CURB && y < LANDING.y1 && x >= LANDING.x0 - 2 && x < LANDING.x1) return true;
  if (y < FRONT - 10 || y >= CURB) return false;
  const [l, r] = edgesAt(y);
  return x >= l && x <= r;
}

/**
 * Ground you can walk on (before anything standing is taken out): the court in front of the shop,
 * and the steps down to the dungeon (walk far enough down them and you're in).
 */
export function hubWalkable(x: number, y: number): boolean {
  if (y >= FRONT && y < CURB) return x >= 64 && x <= 192;
  return y >= CURB - 8 && y < HUB_DESCEND_Y + 20 && x > STEPS.x && x < STEPS.x + STEPS.w;
}

function edgeDist(x: number, y: number): number {
  if (y >= CURB) return Math.min(x - LANDING.x0 + 2, LANDING.x1 - x, LANDING.y1 - y) * 2;
  const [l, r] = edgesAt(y);
  return Math.min(x - l, r - x, (CURB - y) * (Math.abs(x - HUB_CX) < 24 || (x > LANDING.x0 && x < LANDING.x1) ? 8 : 1.5));
}

// ------------------------------------------------------------------ the keepers

/**
 * The keepers: where each stands (or sits), where you stand to talk, and what says what they do.
 * One job each: the Oracle summons, the board has jobs, the broker sells your extras, the tinker
 * sells upgrades, the sage perks, the sister rebirth, and the warden picks who goes down and makes
 * them stronger. (The quartermaster's table and the smith's anvil stay as the court's furniture.)
 * The broker stands before the curio cabinet in the left wing, his crate of odds and ends at his
 * side, the tinker's twin across the court: his talk spot is a tile of its own left of the board's,
 * out of the board's and the Oracle's reach.
 */
const STATIONS: HubStation[] = [
  {
    id: 'altar', name: 'Oracle Vesper', job: 'The Gilded Reel: summon knights',
    greeting: 'Welcome to the Gilded Reel, dear. The reels never stop. Shall we see who turns up?',
    x: HUB_CX, y: FRONT + 3, dir: 1, view: 'down', def: HUB_CAST.oracle, pose: 'stand', talk: { x: HUB_CX, y: FRONT + 20 },
    sign: 'The shop itself: the round reel sign glowing in the gable, the lit window of goods, the open door.',
  },
  {
    id: 'quests', name: 'Notice Board', job: 'Jobs and bounties',
    greeting: 'Help wanted. Some of it urgent. Some of it about a chicken.',
    x: (SHOP.board.x0 + SHOP.board.x1) >> 1, y: FRONT + 2, dir: 1, view: 'down', def: null, pose: 'stand', talk: { x: 99, y: FRONT + 22 },
    sign: 'The board by the door: chalked jobs, pinned notes, a gold exclamation mark over it.',
  },
  {
    id: 'scrap', name: 'Bram the Broker', job: 'Sells your extras',
    greeting: 'Pulled a knight you already have? That\'s an extra. I sell those for you, and your knight stays just as it is.',
    x: 70, y: FRONT + 9, dir: 1, view: 'down', def: HUB_CAST.scrap, pose: 'stand', tool: 'book', talk: { x: 73, y: FRONT + 26 },
    sign: 'The lit curio cabinet in the shop\'s left wing, his crate of odds and ends beside it, a coin over him while extras wait.',
  },
  {
    id: 'upgrades', name: 'Tinker Pell', job: 'Upgrades: spend gold on better everything',
    greeting: 'Faster reels, luckier spins, deeper pockets. All for a little gold. Have a look at the board.',
    x: 186, y: FRONT + 9, dir: 1, view: 'down', def: HUB_CAST.upgrades, pose: 'stand', tool: 'wrench', talk: { x: 184, y: FRONT + 26 },
    sign: 'The slate of painted upgrades over his shelves of bottles and gadgets in the right wing.',
  },
  {
    id: 'perks', name: 'Sage Orrin', job: 'Sigils: perks for the reborn',
    greeting: 'You have been reborn. The sigils will listen to you now. Sit, and choose.',
    x: 175, y: 189, dir: -1, view: 'side', def: HUB_CAST.perks, pose: 'sit', talk: { x: 152, y: 194 },
    sign: 'His high-backed chair, the sigil stones glowing teal beside it.',
  },
  {
    id: 'rebirth', name: 'Sister Maren', job: 'The shrine: rebirth',
    greeting: 'Every ending is a door. Lay it all down here, and rise again stronger.',
    x: 85, y: 233, dir: 1, view: 'side', def: HUB_CAST.rebirth, pose: 'stand', tool: 'candle', talk: { x: 104, y: 228 },
    sign: 'The little candle shrine with the rose-gold rising sun, potted flowers round it.',
  },
  {
    id: 'gate', name: 'Warden Tobb', job: 'Your squad: who goes down, and making them stronger',
    greeting: 'Stairs go down, monsters come up. Pick your three, toughen them up, and down you go.',
    x: 165, y: 251, dir: -1, view: 'side', def: HUB_CAST.gate, pose: 'stand', talk: { x: 141, y: 250 },
    sign: 'The dark stone steps at the foot of the court, lanterns on their posts, the violet glow below.',
  },
];

export function buildHub(): HubArt {
  const out = new HubOut();

  const ground: GroundSpec = {
    w: HUB_ART_W,
    h: HUB_ART_H,
    paved,
    edgeDist,
    soil: (x, y) => y < FRONT - 12 || ((x < 26 || x > 230) && vnoise(x, y, 9, 9, 3) > 0.45),
    wear: { x: HUB_CX, half: 22, y0: FRONT, y1: CURB },
    mats: [{ x: HUB_CX - 9, y: FRONT + 1, w: 18, h: 4, colors: ['#3a1416', '#6a2224', '#9a3a2a', '#c8743a', '#e8b860'], seed: 5 }],
    steps: STEPS,
    curbs: [
      { y: CURB, x0: 46, x1: STEPS.x - 5 },
      { y: LANDING.y1, x0: LANDING.x0 - 2, x1: LANDING.x1 },
      { y: CURB, x0: LANDING.x1, x1: 211 },
    ],
    litter: [
      // Petals by the flower pots and the shrine, leaves blown in from the planting, a few under the
      // table and the chair.
      { x: 99, y: 236, r: 12, n: 14, colors: ['#ff5a6a', '#ff8a8a', '#ffd0d8'] },
      { x: 70, y: 226, r: 16, n: 12, colors: ['#ff8ab0', '#fff0f4', '#ffd0a0'] },
      { x: 60, y: 200, r: 12, n: 10, colors: ['#62ae34', '#8ccb3e', '#c8a040', '#a8682a'] },
      { x: 196, y: 196, r: 12, n: 10, colors: ['#62ae34', '#8ccb3e', '#c8a040', '#a8682a'] },
      { x: 86, y: 160, r: 10, n: 6, colors: ['#43922c', '#8ccb3e', '#fff6f0'] },
      { x: 152, y: 160, r: 10, n: 6, colors: ['#43922c', '#62ae34', '#c8a040'] },
      { x: 128, y: 205, r: 26, n: 8, colors: ['#a8682a', '#c8a040', '#62ae34'] },
    ],
    shadows: out.shadows,
    seed: 77,
  };

  canopy(out);
  paintShop(out);
  edgeGreens(out);
  frontLeaves(out);
  fireflies(out);
  // Along the shop front: the broker's crate of odds and ends, a round bush by the board, a leafy
  // plant by the door, the tinker's crates.
  courtGreens(out);
  scrapCrate(out, 55, FRONT + 12);
  pottedBush(out, 86, FRONT + 10, 3, 5);
  pottedPlant(out, 153, FRONT + 9, 12, 8);
  cat(out, 144, FRONT + 5);
  crates(out, 202, FRONT + 13, 'tinkerCrates', 21);
  barrelPiece(out, 214, FRONT + 18, 'tinkerBarrel', 7);
  // The quartermaster's table (her chair behind her, the traveller's stool in front).
  chair(out, 81, 189, 'qmChair', 22);
  roundTable(out, 81, 189);
  stool(out, 93, 212, 'travellerStool');
  // The sage's chair and his stones.
  sageChair(out, 177, 189);
  sigilStone(out, 195, 186, 1, 10);
  sigilStone(out, 199, 199, 2, 7);
  // The priestess's shrine and its flowers; the smith's nook.
  shrine(out, 66, 235);
  flowerPot(out, 48, 240, 81, ['#ff6a8a', '#ffd0e0', '#ffffff'], 7);
  flowerPot(out, 99, 248, 83, ['#ff3a4a', '#ff8a8a', '#ffd0d0'], 9, GLAZE);
  smithNook(out, 199, 236, 168, 231);
  // Lamps on the court's corners, and the head of the steps.
  postLamp(out, 57, 186, 'lampL');
  postLamp(out, 200, 176, 'lampR');
  stepsHead(out, STEPS.x - 3, STEPS.x + STEPS.w + 3, CURB + 4, CURB + 58);
  stepsGarden(out, STEPS.x, STEPS.x + STEPS.w, CURB, LANDING);
  const lights: HubLight[] = out.lights;

  return {
    ground: paintHubGround(ground),
    sprites: out.sprites,
    emissive: out.emissive,
    fore: out.fore,
    lights,
    ambient: '#5e6078',
    motes: out.motes,
    stations: STATIONS,
    extras: [{ def: HUB_CAST.traveller, x: 93, y: 212, dir: 1, view: 'up', pose: 'sit', tool: 'cup' }],
    feet: out.feet,
    grade: {
      haze: [0.12, 0.1, 0.2],
      hazeAmount: 0.05,
      shadowTint: [0.9, 0.94, 1.14],
      highlightTint: [1.08, 1.0, 0.88],
      saturation: 1.1,
      contrast: 1.06,
      vignette: 0.62,
      bloom: 0.8,
    },
  };
}
